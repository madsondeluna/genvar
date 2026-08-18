import asyncio
import math
from fastapi import APIRouter
from app.models.schemas import GeneResponse, GenePhenotypesResponse, GeneVariant, VariantBin
from app.services import ensembl, gnomad, gwas_catalog, uniprot, alphafold
from app.utils.validators import validate_gene_symbol, classify_clinical_significance
from app.utils.cache import cache_get, cache_set

router = APIRouter()

# Per-category cap for the detail tables. The Ensembl overlap can return >100k variants;
# rendering all of them is impractical, so the tables show a representative sample spread
# across the gene while counts and the distribution chart use the full set.
TABLE_SAMPLE_CAP = 200
# Target number of bins for the positional distribution; bin size is rounded to whole kb.
TARGET_BINS = 120
# Quantas caracteristicas GWAS o painel de fenotipos mostra
GWAS_PANEL_CAP = 12


def _parse_variant_row(v: dict) -> GeneVariant:
    sig_list = v.get("clinical_significance", [])
    sig = sig_list[0] if sig_list else None
    return GeneVariant(
        variant_id=v.get("id", ""),
        position=v.get("start", 0),
        consequence=v.get("consequence_type", "unknown"),
        clinical_significance=sig,
        alleles=v.get("alleles"),
    )


def _sample_across(rows: list, cap: int = TABLE_SAMPLE_CAP) -> list:
    """Evenly sample rows by index so the table spans the whole gene, not just the 5' end.

    Rows arrive in Ensembl coordinate order, so even-index sampling preserves positional spread.
    """
    if len(rows) <= cap:
        return rows
    step = len(rows) / cap
    return [rows[int(i * step)] for i in range(cap)]


def _build_distribution(rows_by_category: dict, gene_start: int, gene_end: int) -> tuple[list, int]:
    """Bin all classified variants by genomic position over the full gene span."""
    span = max(1, gene_end - gene_start)
    bin_size = max(1000, math.ceil(span / TARGET_BINS / 1000) * 1000)
    num_bins = max(1, math.ceil(span / bin_size))
    bins = [
        {"start": gene_start + i * bin_size, "pathogenic": 0, "vus": 0, "benign": 0, "other": 0}
        for i in range(num_bins)
    ]
    for category, rows in rows_by_category.items():
        for row in rows:
            idx = int((row.position - gene_start) // bin_size)
            if 0 <= idx < num_bins:
                bins[idx][category] += 1
    return [VariantBin(**b) for b in bins], bin_size


@router.get("/{gene_symbol}", response_model=GeneResponse)
async def get_gene_data(gene_symbol: str):
    symbol = validate_gene_symbol(gene_symbol)
    cache_key = f"gene:v5:{symbol}"

    cached = cache_get(cache_key)
    if cached:
        return GeneResponse(**cached)

    # Fetch gene info first (needed for other calls)
    gene_info = await ensembl.get_gene_info(symbol)

    gene_id = gene_info["gene_id"]

    # Parallel: variants + constraint + uniprot + exons
    variants_task = ensembl.get_gene_variants(gene_id)
    constraint_task = gnomad.get_gene_constraint(symbol)
    uniprot_task = uniprot.get_uniprot_id(symbol)
    exons_task = ensembl.get_canonical_exons(gene_id)
    cyto_task = ensembl.get_cytogenetic_context(
        str(gene_info["chromosome"]), gene_info["start"], gene_info["end"]
    )

    variants, constraint, uniprot_id, exon_data, cyto = await asyncio.gather(
        variants_task,
        constraint_task,
        uniprot_task,
        exons_task,
        cyto_task,
        return_exceptions=True,
    )

    # Handle exceptions from gather
    variants_failed = isinstance(variants, Exception)
    if variants_failed:
        variants = []
    if isinstance(constraint, Exception):
        constraint = {}
    if isinstance(uniprot_id, Exception):
        uniprot_id = None
    if isinstance(exon_data, Exception):
        exon_data = {}
    if isinstance(cyto, Exception):
        cyto = {}

    # AlphaFold needs uniprot_id
    alphafold_data = None
    if uniprot_id:
        try:
            alphafold_data = await alphafold.get_prediction(uniprot_id)
        except Exception:
            pass

    # Classify variants
    pathogenic = []
    vus = []
    benign = []
    other = []

    for v in variants:
        sig_list = v.get("clinical_significance", [])
        sig = sig_list[0] if sig_list else ""
        category = classify_clinical_significance(sig)
        row = _parse_variant_row(v)
        if category == "pathogenic":
            pathogenic.append(row)
        elif category == "benign":
            benign.append(row)
        elif category == "vus":
            vus.append(row)
        else:
            other.append(row)

    # Distribution over all variants; tables get a representative sample across the gene
    distribution, bin_size = _build_distribution(
        {"pathogenic": pathogenic, "vus": vus, "benign": benign, "other": other},
        gene_info["start"],
        gene_info["end"],
    )
    pathogenic_sample = _sample_across(pathogenic)
    vus_sample = _sample_across(vus)
    benign_sample = _sample_across(benign)
    other_sample = _sample_across(other)

    result = GeneResponse(
        gene_symbol=gene_info["gene_symbol"],
        gene_id=gene_info["gene_id"],
        description=gene_info.get("description"),
        chromosome=str(gene_info["chromosome"]),
        start=gene_info["start"],
        end=gene_info["end"],
        strand=gene_info["strand"],
        biotype=gene_info.get("biotype"),
        assembly_name=gene_info.get("assembly_name"),
        total_variants=len(variants),
        pathogenic_count=len(pathogenic),
        vus_count=len(vus),
        benign_count=len(benign),
        other_count=len(other),
        pathogenic_variants=pathogenic_sample,
        vus_variants=vus_sample,
        benign_variants=benign_sample,
        other_variants=other_sample,
        variant_distribution=distribution,
        variant_bin_size=bin_size,
        displayed_variants=(
            len(pathogenic_sample) + len(vus_sample) + len(benign_sample) + len(other_sample)
        ),
        pli_score=constraint.get("pli") if isinstance(constraint, dict) else None,
        lof_z_score=constraint.get("lof_z") if isinstance(constraint, dict) else None,
        oe_lof=constraint.get("oe_lof") if isinstance(constraint, dict) else None,
        oe_lof_upper=constraint.get("oe_lof_upper") if isinstance(constraint, dict) else None,
        oe_mis=constraint.get("oe_mis") if isinstance(constraint, dict) else None,
        uniprot_id=uniprot_id if isinstance(uniprot_id, str) else None,
        alphafold_pdb_url=alphafold_data.get("pdb_url") if alphafold_data else None,
        alphafold_pae_url=alphafold_data.get("pae_image_url") if alphafold_data else None,
        canonical_transcript_id=exon_data.get("transcript_id"),
        exons=exon_data.get("exons", []),
        cytobands=cyto.get("cytobands", []),
        chromosome_length=cyto.get("chromosome_length"),
    )

    # Don't cache a degraded result: if the Ensembl variant fetch failed transiently, caching
    # the empty list would pin "no variants" for the whole TTL even after Ensembl recovers.
    if not variants_failed:
        cache_set(cache_key, result.model_dump())
    return result


@router.get("/{gene_symbol}/phenotypes", response_model=GenePhenotypesResponse)
async def get_gene_phenotypes(gene_symbol: str):
    """Doencas mendelianas curadas (Ensembl) + sinais GWAS (GWAS Catalog),
    carregados em separado da pagina do gene para nao atrasar a carga principal."""
    symbol = validate_gene_symbol(gene_symbol)
    cache_key = f"genephen:v2:{symbol}"

    cached = cache_get(cache_key)
    if cached:
        return GenePhenotypesResponse(**cached)

    mendelian, gwas = await asyncio.gather(
        ensembl.get_gene_diseases(symbol),
        gwas_catalog.get_gene_associations(symbol),
        return_exceptions=True,
    )
    degraded = isinstance(mendelian, Exception) or isinstance(gwas, Exception)
    if isinstance(mendelian, Exception):
        mendelian = []
    if isinstance(gwas, Exception):
        gwas = {"traits": [], "association_total": 0, "truncated": False}

    result = GenePhenotypesResponse(
        gene_symbol=symbol,
        mendelian=mendelian,
        gwas=gwas["traits"][:GWAS_PANEL_CAP],
        gwas_trait_total=len(gwas["traits"]),
        gwas_association_total=gwas["association_total"],
        gwas_truncated=gwas["truncated"],
    )
    # Nao pinar no cache um resultado com uma das fontes fora do ar
    if not degraded:
        cache_set(cache_key, result.model_dump())
    return result
