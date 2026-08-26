import asyncio
from fastapi import APIRouter, HTTPException
from app.models.schemas import DiseaseSummary, DiseaseDetail, CausalGene
from app.services import gnomad
from app.data.rare_diseases import all_diseases, get_disease
from app.utils.cache import cache_get, cache_set

router = APIRouter()

# Genes causais enriquecidos ao vivo por doenca. O constraint da gnomAD e uma
# unica chamada GraphQL por gene; limitamos a lista para manter a pagina rapida.
# A variacao clinica profunda (variantes patogenicas, estrutura) fica na pagina
# de gene existente, alcancada pelo link em cada gene causal.
MAX_ENRICHED_GENES = 6


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
