"""Paineis de genes (multigenico): lista, estatisticas e detalhe com
enriquecimento vivo de constraint (LOEUF/pLI) por gene do painel.

Espelha o padrao de routers/disease.py. A rota /stats e registrada antes de
/{panel_id} para nao ser engolida pela rota de id.
"""
import asyncio
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    PanelSummary, PanelListResponse, PanelStatsResponse, CountItem,
    PanelCondition, PanelDetail, CausalGene,
)
from app.services import gnomad
from app.utils.cache import cache_get, cache_set
from app.data.gene_panels import all_panels, get_panel, search_panels

router = APIRouter()

# Painel pode ter varios genes; enriquece todos, com um teto de seguranca.
MAX_ENRICHED_GENES = 16
# LOEUF abaixo deste limiar conta o gene como restrito (intolerante a LoF).
LOEUF_CONSTRAINED = 0.6


def _summary(p: dict) -> PanelSummary:
    genes = p.get("genes", [])
    return PanelSummary(
        id=p["id"], name=p["name"], category=p["category"],
        inheritance=p.get("inheritance", ""), genes=genes, gene_count=len(genes),
        short=p.get("short"),
    )


@router.get("", response_model=PanelListResponse)
async def list_panels(q: str = "", category: str = "all", page: int = 1, page_size: int = 30):
    items, total = search_panels(q=q, category=category, page=page, page_size=min(100, page_size))
    return PanelListResponse(
        items=[_summary(p) for p in items], total=total, page=page, page_size=page_size,
    )


@router.get("/stats", response_model=PanelStatsResponse)
async def panel_stats():
    panels = all_panels()
    by_category: dict = {}
    genes: set = set()
    for p in panels:
        by_category[p["category"]] = by_category.get(p["category"], 0) + 1
        genes.update(p.get("genes", []))
    cats = [CountItem(key=c, label=c, count=n) for c, n in by_category.items()]
    cats.sort(key=lambda c: c.count, reverse=True)
    return PanelStatsResponse(total=len(panels), total_genes=len(genes), by_category=cats)


async def _enrich_gene(symbol: str) -> CausalGene:
    try:
        c = await gnomad.get_gene_constraint(symbol)
    except Exception:
        c = {}
    has = bool(c) and any(c.get(k) is not None for k in ("pli", "oe_lof", "oe_lof_upper", "oe_mis"))
    return CausalGene(
        symbol=symbol, pli=c.get("pli"), loeuf=c.get("oe_lof_upper"),
        oe_lof=c.get("oe_lof"), oe_mis=c.get("oe_mis"), constraint_available=has,
    )


@router.get("/{panel_id}", response_model=PanelDetail)
async def get_panel_detail(panel_id: str):
    p = get_panel(panel_id)
    if not p:
        raise HTTPException(status_code=404, detail="Painel nao encontrado no catalogo")

    cache_key = f"panel:v1:{panel_id}"
    cached = cache_get(cache_key)
    if cached:
        return PanelDetail(**cached)

    genes = p.get("genes", [])[:MAX_ENRICHED_GENES]
    panel_genes = await asyncio.gather(*[_enrich_gene(g) for g in genes])

    enriched_ok = [g for g in panel_genes if g.constraint_available]
    constrained = sum(
        1 for g in enriched_ok if g.loeuf is not None and g.loeuf <= LOEUF_CONSTRAINED
    )
    degraded = len(genes) > 0 and len(enriched_ok) == 0

    result = PanelDetail(
        id=p["id"], name=p["name"], category=p["category"],
        inheritance=p.get("inheritance", ""), short=p.get("short"),
        digenic=p.get("digenic") or None,
        genes=p.get("genes", []),
        conditions=[PanelCondition(**c) for c in p.get("conditions", [])],
        panel_genes=panel_genes,
        constrained_count=constrained,
        degraded=degraded,
    )

    # Nao fixa um resultado degradado por falha transitoria da fonte externa.
    if enriched_ok or not genes:
        cache_set(cache_key, result.model_dump())
    return result
