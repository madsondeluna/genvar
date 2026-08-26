import asyncio
import time
import httpx
from fastapi import APIRouter, Request
from app.models.schemas import (
    SourceHealth,
    HealthSourcesResponse,
    EndpointHealth,
    EndpointsHealthResponse,
)
from app.utils.cache import cache_get, cache_set

router = APIRouter()

# Sondas minimas por fonte externa. Cada uma usa uma consulta conhecida e barata
# so para confirmar que o upstream responde. Rodam em producao (onde a rede e
# aberta); no sandbox a politica de egress bloqueia esses hosts com 403.
PROBES = [
    {"name": "Ensembl", "method": "GET",
     "url": "https://rest.ensembl.org/lookup/symbol/homo_sapiens/BRCA1",
     "headers": {"Accept": "application/json"}},
    {"name": "gnomAD", "method": "POST",
     "url": "https://gnomad.broadinstitute.org/api",
     "json": {"query": "{gene(gene_symbol:\"BRCA1\",reference_genome:GRCh38){gene_id}}"}},
    {"name": "ClinVar", "method": "GET",
     "url": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=rs334&retmode=json"},
    {"name": "AlphaFold", "method": "GET",
     "url": "https://alphafold.ebi.ac.uk/api/prediction/P38398"},
    {"name": "UniProt", "method": "GET",
     "url": "https://rest.uniprot.org/uniprotkb/search?query=gene:BRCA1+AND+organism_id:9606&fields=accession&size=1"},
    {"name": "MyVariant", "method": "GET",
     "url": "https://myvariant.info/v1/query?q=dbsnp.rsid:rs334&size=1"},
    {"name": "GWAS Catalog", "method": "GET",
     "url": "https://www.ebi.ac.uk/gwas/api/v2/genes/BRCA1/associations?size=1"},
]

PROBE_TIMEOUT = 15.0
CACHE_KEY = "health:sources:v1"
# Cache curto: evita marteladas no upstream sem perder utilidade de diagnostico.
CACHE_TTL = 60


def _host(url: str) -> str:
    return url.split("/")[2] if "://" in url else url


async def _probe(client: httpx.AsyncClient, spec: dict) -> SourceHealth:
    t0 = time.perf_counter()
    try:
        resp = await client.request(
            spec["method"], spec["url"],
            headers=spec.get("headers"), json=spec.get("json"),
            timeout=PROBE_TIMEOUT,
        )
        ms = round((time.perf_counter() - t0) * 1000, 1)
        ok = 200 <= resp.status_code < 300
        return SourceHealth(
            name=spec["name"], host=_host(spec["url"]), ok=ok,
            status=resp.status_code, latency_ms=ms,
            detail=None if ok else f"HTTP {resp.status_code}",
        )
    except Exception as e:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return SourceHealth(
            name=spec["name"], host=_host(spec["url"]), ok=False,
            status=None, latency_ms=ms, detail=f"{type(e).__name__}",
        )


@router.get("/sources", response_model=HealthSourcesResponse)
async def check_sources():
    """Valida as fontes externas: pinga cada upstream e reporta status e latencia.
    Resultado cacheado por 60 s para nao sobrecarregar as APIs."""
    cached = cache_get(CACHE_KEY)
    if cached:
        return HealthSourcesResponse(**cached)

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[_probe(client, s) for s in PROBES])

    result = HealthSourcesResponse(
        all_ok=all(r.ok for r in results),
        ok_count=sum(1 for r in results if r.ok),
        total=len(results),
        sources=list(results),
    )
    cache_set(CACHE_KEY, result.model_dump(), ttl=CACHE_TTL)
    return result


# --- Status dos nossos proprios endpoints (auto-sonda) ---

# external=True: o endpoint depende de fontes externas (passa em producao,
# falha no sandbox porque o egress e bloqueado). external=False: interno, sem
# dependencia de rede (deve passar sempre).
ENDPOINTS = [
    {"name": "Raiz", "method": "GET", "path": "/", "external": False},
    {"name": "Health", "method": "GET", "path": "/health", "external": False},
    {"name": "Catalogo de doencas", "method": "GET", "path": "/api/disease?page_size=1", "external": False},
    {"name": "Detalhe de doenca", "method": "GET", "path": "/api/disease/anemia-falciforme", "external": True},
    {"name": "Variantes por doenca", "method": "GET", "path": "/api/disease/anemia-falciforme/variants", "external": True},
    {"name": "Gene", "method": "GET", "path": "/api/gene/BRCA1", "external": True},
    {"name": "Fenotipos do gene", "method": "GET", "path": "/api/gene/BRCA1/phenotypes", "external": True},
    {"name": "Variante", "method": "GET", "path": "/api/variant/rs334", "external": True},
]

ENDPOINT_TIMEOUT = 8.0
ENDPOINTS_CACHE_KEY = "health:endpoints:v1"
ENDPOINTS_CACHE_TTL = 30


async def _probe_endpoint(client: httpx.AsyncClient, base: str, spec: dict) -> EndpointHealth:
    url = base.rstrip("/") + spec["path"]
    t0 = time.perf_counter()
    try:
        resp = await client.request(spec["method"], url, timeout=ENDPOINT_TIMEOUT)
        ms = round((time.perf_counter() - t0) * 1000, 1)
        ok = 200 <= resp.status_code < 300
        return EndpointHealth(
            name=spec["name"], method=spec["method"], path=spec["path"],
            ok=ok, status=resp.status_code, latency_ms=ms, external=spec["external"],
            detail=None if ok else f"HTTP {resp.status_code}",
        )
    except Exception as e:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return EndpointHealth(
            name=spec["name"], method=spec["method"], path=spec["path"],
            ok=False, status=None, latency_ms=ms, external=spec["external"],
            detail=type(e).__name__,
        )


@router.get("/endpoints", response_model=EndpointsHealthResponse)
async def check_endpoints(request: Request):
    """Auto-sonda os proprios endpoints da API, contra este servidor. Os
    internos devem responder sempre; os que dependem de fontes externas passam
    em producao e falham no sandbox (egress bloqueado). Cache 30 s."""
    cached = cache_get(ENDPOINTS_CACHE_KEY)
    if cached:
        return EndpointsHealthResponse(**cached)

    base = str(request.base_url)
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[_probe_endpoint(client, base, s) for s in ENDPOINTS])

    internal = [r for r in results if not r.external]
    result = EndpointsHealthResponse(
        all_ok=all(r.ok for r in results),
        ok_count=sum(1 for r in results if r.ok),
        total=len(results),
        internal_ok_count=sum(1 for r in internal if r.ok),
        internal_total=len(internal),
        endpoints=list(results),
    )
    cache_set(ENDPOINTS_CACHE_KEY, result.model_dump(), ttl=ENDPOINTS_CACHE_TTL)
    return result
