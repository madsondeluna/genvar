import asyncio
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    DiseaseSummary,
    DiseaseDetail,
    CausalGene,
    DiseasePathogenicGene,
    DiseaseVariantsResponse,
    GeneVariant,
)
from app.services import gnomad, ensembl
from app.utils.validators import classify_clinical_significance
from app.data.rare_diseases import all_diseases, get_disease
from app.utils.cache import cache_get, cache_set

router = APIRouter()

# Genes causais enriquecidos ao vivo por doenca. O constraint da gnomAD e uma
# unica chamada GraphQL por gene; limitamos a lista para manter a pagina rapida.
# A variacao clinica profunda (variantes patogenicas, estrutura) fica na pagina
# de gene existente, alcancada pelo link em cada gene causal.
MAX_ENRICHED_GENES = 6
# Amostra de variantes patogenicas por gene na secao de variantes da doenca.
PATHOGENIC_SAMPLE_CAP = 25


def _summary(d: dict) -> DiseaseSummary:
    return DiseaseSummary(
        id=d["id"],
        name=d["name"],
        category=d["category"],
        inheritance=d["inheritance"],
        genes=d.get("genes", []),
        short=d["short"],
        prevalence=d.get("prevalence"),
    )


@router.get("", response_model=list[DiseaseSummary])
async def list_diseases():
    """Catalogo curado de doencas raras para o hub. Estatico e barato."""
    return [_summary(d) for d in all_diseases()]


async def _enrich_gene(symbol: str) -> CausalGene:
    try:
        c = await gnomad.get_gene_constraint(symbol)
    except Exception:
        c = {}
    has = bool(c) and any(
        c.get(k) is not None for k in ("pli", "oe_lof", "oe_lof_upper", "oe_mis")
    )
    return CausalGene(
        symbol=symbol,
        pli=c.get("pli"),
        loeuf=c.get("oe_lof_upper"),
        oe_lof=c.get("oe_lof"),
        oe_mis=c.get("oe_mis"),
        constraint_available=has,
    )


@router.get("/{disease_id}", response_model=DiseaseDetail)
async def get_disease_detail(disease_id: str):
    d = get_disease(disease_id)
    if not d:
        raise HTTPException(status_code=404, detail="Doenca nao encontrada no catalogo")

    cache_key = f"disease:v1:{disease_id}"
    cached = cache_get(cache_key)
    if cached:
        return DiseaseDetail(**cached)

    genes = d.get("genes", [])[:MAX_ENRICHED_GENES]
    causal = await asyncio.gather(*[_enrich_gene(g) for g in genes])

    example = d.get("example") or {}
    result = DiseaseDetail(
        id=d["id"],
        name=d["name"],
        category=d["category"],
        inheritance=d["inheritance"],
        short=d["short"],
        prevalence=d.get("prevalence"),
        hpo=d.get("hpo", []),
        orphanet=d.get("orphanet"),
        omim=d.get("omim"),
        mondo=d.get("mondo"),
        genes=d.get("genes", []),
        causal_genes=list(causal),
        example_kind=example.get("kind"),
        example_id=example.get("id"),
    )

    # So cacheia se pelo menos um gene trouxe constraint; caso contrario a gnomAD
    # pode ter falhado transitoriamente e nao queremos pinar um resultado degradado.
    if any(g.constraint_available for g in result.causal_genes) or not genes:
        cache_set(cache_key, result.model_dump())
    return result


def _sample_across(rows: list, cap: int = PATHOGENIC_SAMPLE_CAP) -> list:
    """Amostra uniforme por indice, preservando a ordem posicional do Ensembl."""
    if len(rows) <= cap:
        return rows
    step = len(rows) / cap
    return [rows[int(i * step)] for i in range(cap)]


async def _pathogenic_for_gene(symbol: str) -> DiseasePathogenicGene:
    """Variantes patogenicas de um gene causal, via overlap do Ensembl.

    O overlap traz clinical_significance inline, entao classificamos sem
    enriquecimento por variante. A pagina de gene completa segue sendo a fonte
    aprofundada; aqui mostramos so uma amostra representativa das patogenicas.
    """
    info = await ensembl.get_gene_info(symbol)
    gene_id = info["gene_id"]
    variants = await ensembl.get_gene_variants(gene_id)

    pathogenic = []
    for v in variants:
        sig_list = v.get("clinical_significance", [])
        sig = sig_list[0] if sig_list else ""
        if classify_clinical_significance(sig) != "pathogenic":
            continue
        pathogenic.append(
            GeneVariant(
                variant_id=v.get("id", ""),
                position=v.get("start", 0),
                consequence=v.get("consequence_type", "unknown"),
                clinical_significance=sig,
                alleles=v.get("alleles"),
            )
        )

    return DiseasePathogenicGene(
        symbol=symbol,
        pathogenic_count=len(pathogenic),
        variants=_sample_across(pathogenic),
    )


@router.get("/{disease_id}/variants", response_model=DiseaseVariantsResponse)
async def get_disease_variants(disease_id: str):
    """Variantes patogenicas por gene causal da doenca (ClinVar via Ensembl)."""
    d = get_disease(disease_id)
    if not d:
        raise HTTPException(status_code=404, detail="Doenca nao encontrada no catalogo")

    cache_key = f"diseasevars:v1:{disease_id}"
    cached = cache_get(cache_key)
    if cached:
        return DiseaseVariantsResponse(**cached)

    genes = d.get("genes", [])[:MAX_ENRICHED_GENES]
    settled = await asyncio.gather(
        *[_pathogenic_for_gene(g) for g in genes], return_exceptions=True
    )

    gene_results = [g for g in settled if isinstance(g, DiseasePathogenicGene)]
    degraded = len(gene_results) < len(genes)

    result = DiseaseVariantsResponse(id=disease_id, genes=gene_results, degraded=degraded)

    # Nao pinar no cache se todos os genes falharam (Ensembl fora do ar).
    if gene_results or not genes:
        cache_set(cache_key, result.model_dump())
    return result
