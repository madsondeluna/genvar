"""Poligenico: escores PGS e a relacao raro x poligenico.

Semente curada de escores publicos notaveis (renderiza offline) enriquecida ao
vivo pela API do PGS Catalog. A rota /interplay e registrada antes de /{score_id}.
"""
import asyncio

from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    PgsSummary, PgsListResponse, CountItem, PgsScoreDetail, PgsPublication,
    PgsAncestryPhase, PgsPerformance, InterplayItem, InterplayResponse,
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

    # A versao na chave sobe a cada mudanca no que se GRAVA, e nao so no
    # formato: v2 acrescentou metodo, build, ancestria por fase e desempenho, e
    # v3 passou a traduzir metodo e ancestria. Reaproveitar a chave devolveria o
    # registro anterior, sem os campos novos ou ainda em ingles, e a pagina sai
    # errada sem erro nenhum, que e a falha mais cara de achar.
    cache_key = f"pgs:v3:{score_id}"
    cached = cache_get(cache_key)
    if cached:
        return PgsScoreDetail(**cached)

    n_variants = s.get("n_variants")
    publication = None
    ancestry_dev: dict = {}
    extras: dict = {}
    live = False

    # Enriquecimento ao vivo pelo PGS Catalog (degrada se a fonte estiver fora).
    # As duas chamadas sao independentes e paralelas: a de desempenho varre as
    # avaliacoes publicadas e e a mais lenta das duas, entao encadear dobraria a
    # espera sem necessidade.
    try:
        data, desempenho = await asyncio.gather(
            pgs_catalog.get_score(score_id),
            pgs_catalog.get_performance(score_id),
            return_exceptions=True,
        )
    except Exception:
        data, desempenho = None, None
    if isinstance(data, Exception):
        data = None
    if isinstance(desempenho, Exception) or desempenho is None:
        desempenho = []

    if data:
        live = True
        n_variants = data.get("n_variants") or n_variants
        ancestry_dev = data.get("ancestry_dev") or {}
        pub = data.get("publication") or {}
        publication = PgsPublication(**pub)
        extras = {
            "trait_efo": data.get("trait_efo") or [],
            "method": data.get("method"),
            "method_params": data.get("method_params"),
            "genome_build": data.get("genome_build"),
            "weight_type": data.get("weight_type"),
            "release_date": data.get("release_date"),
            "license": data.get("license"),
            "scoring_file": data.get("scoring_file"),
            "ancestry_gwas": PgsAncestryPhase(**(data.get("ancestry_gwas") or {})),
            "ancestry_dist_dev": PgsAncestryPhase(**(data.get("ancestry_dist_dev") or {})),
            "ancestry_eval": PgsAncestryPhase(**(data.get("ancestry_eval") or {})),
        }

    result = PgsScoreDetail(
        id=s["id"], trait=s["trait"], category=s["category"],
        citation=s.get("citation", ""), short=s.get("short"),
        n_variants=n_variants, publication=publication, ancestry_dev=ancestry_dev,
        performance=[PgsPerformance(**d) for d in desempenho],
        pgs_catalog_url=PGS_URL.format(id=score_id), live=live, **extras,
    )
    if live:
        cache_set(cache_key, result.model_dump())
    return result
