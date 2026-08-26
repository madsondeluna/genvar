import asyncio
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    DiseaseSummary,
    DiseaseListResponse,
    DiseaseStatsResponse,
    CountItem,
    DiseaseDetail,
    CausalGene,
    DiseasePathogenicGene,
    DiseaseVariantsResponse,
    GeneVariant,
    SusInfo,
    NewbornInfo,
)
from app.services import gnomad, ensembl
from app.utils.validators import classify_clinical_significance
from app.data.rare_diseases import get_disease, search_diseases, all_diseases, _slugify
from app.data import br_context
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


@router.get("", response_model=DiseaseListResponse)
async def list_diseases(
    q: str = "", inheritance: str = "all", page: int = 1, page_size: int = 30
):
    """Catalogo de doencas raras com busca e paginacao no servidor."""
    items, total = search_diseases(q=q, inheritance=inheritance, page=page, page_size=page_size)
    return DiseaseListResponse(
        items=[_summary(d) for d in items], total=total, page=max(1, page),
        page_size=max(1, min(100, page_size)),
    )


# Rotulos das facetas de heranca, na ordem canonica, para o panorama do hub.
_INH_LABELS = [
    ("AD", "Autossomica dominante"), ("AR", "Autossomica recessiva"),
    ("XLR", "Ligada ao X recessiva"), ("XLD", "Ligada ao X dominante"),
    ("XL", "Ligada ao X"),
]


@router.get("/stats", response_model=DiseaseStatsResponse)
async def disease_stats():
    """Contagens por heranca e por categoria, para os graficos do hub.
    Registrado antes de /{disease_id} para nao ser capturado pela rota de id."""
    items = all_diseases()
    inh_counts = {code: 0 for code, _ in _INH_LABELS}
    cat_counts: dict[str, int] = {}
    for d in items:
        code = d.get("inheritance")
        if code in inh_counts:
            inh_counts[code] += 1
        cat = d.get("category") or "Outras"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    by_inheritance = [
        CountItem(key=code, label=label, count=inh_counts[code])
        for code, label in _INH_LABELS if inh_counts[code] > 0
    ]
    by_category = [
        CountItem(key=name, label=name, count=n)
        for name, n in sorted(cat_counts.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return DiseaseStatsResponse(
        total=len(items), by_inheritance=by_inheritance, by_category=by_category
    )


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

    # Ponte com a enciclopedia patient-first (raras.org) por slug do nome.
    raras_url = f"https://raras.org/doenca/{_slugify(d['name'])}"

    # Contexto brasileiro curado (SUS e triagem neonatal).
    sus_raw = br_context.get_sus(d["id"])
    sus = None
    if sus_raw:
        sus = SusInfo(
            pcdt=sus_raw.get("pcdt", False),
            pcdt_name=sus_raw.get("pcdt_name"),
            pcdt_url=br_context.PCDT_SEARCH if sus_raw.get("pcdt") else None,
            tests=sus_raw.get("tests", []),
            note=sus_raw.get("note"),
        )
    nb_raw = br_context.get_newborn(d["id"])
    newborn = NewbornInfo(**nb_raw) if nb_raw else None
    prevalence_br = br_context.get_prevalence_br(d["id"])

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
        raras_url=raras_url,
        sus=sus,
        newborn=newborn,
        prevalence_br=prevalence_br,
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
