"""Poligenico: escores PGS e a relacao raro x poligenico.

Semente curada de escores publicos notaveis (renderiza offline) enriquecida ao
vivo pela API do PGS Catalog. A rota /interplay e registrada antes de /{score_id}.
"""
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    PgsSummary, PgsListResponse, CountItem, PgsScoreDetail, PgsPublication,
    InterplayItem, InterplayResponse,
)
from app.services import pgs_catalog
from app.utils.cache import cache_get, cache_set
from app.data.polygenic import all_scores, get_score, search_scores, all_interplay

router = APIRouter()

PGS_URL = "https://www.pgscatalog.org/score/{id}/"


def _summary(s: dict) -> PgsSummary:
    return PgsSummary(
        id=s["id"], trait=s["trait"], category=s["category"],
        citation=s.get("citation", ""), n_variants=s.get("n_variants"),
        short=s.get("short"),
    )


@router.get("", response_model=PgsListResponse)
async def list_scores(q: str = "", category: str = "all", page: int = 1, page_size: int = 30):
    items, total = search_scores(q=q, category=category, page=page, page_size=min(100, page_size))
    by_cat: dict = {}
    for s in all_scores():
        by_cat[s["category"]] = by_cat.get(s["category"], 0) + 1
    cats = [CountItem(key=c, label=c, count=n) for c, n in by_cat.items()]
    cats.sort(key=lambda c: c.count, reverse=True)
    return PgsListResponse(items=[_summary(s) for s in items], total=total, by_category=cats)


@router.get("/interplay", response_model=InterplayResponse)
async def interplay():
    return InterplayResponse(items=[InterplayItem(**i) for i in all_interplay()])


@router.get("/{score_id}", response_model=PgsScoreDetail)
async def get_score_detail(score_id: str):
    s = get_score(score_id)
    if not s:
        raise HTTPException(status_code=404, detail="Escore poligenico nao encontrado no catalogo")

    cache_key = f"pgs:v1:{score_id}"
    cached = cache_get(cache_key)
    if cached:
        return PgsScoreDetail(**cached)

    n_variants = s.get("n_variants")
    publication = None
    ancestry_dev: dict = {}
    live = False

    # Enriquecimento ao vivo pelo PGS Catalog (degrada se a fonte estiver fora).
    try:
        data = await pgs_catalog.get_score(score_id)
    except Exception:
        data = None
    if data:
        live = True
        n_variants = data.get("n_variants") or n_variants
        ancestry_dev = data.get("ancestry_dev") or {}
        pub = data.get("publication") or {}
        publication = PgsPublication(**pub)

    result = PgsScoreDetail(
        id=s["id"], trait=s["trait"], category=s["category"],
        citation=s.get("citation", ""), short=s.get("short"),
        n_variants=n_variants, publication=publication, ancestry_dev=ancestry_dev,
        pgs_catalog_url=PGS_URL.format(id=score_id), live=live,
    )
    if live:
        cache_set(cache_key, result.model_dump())
    return result
