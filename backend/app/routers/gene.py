import asyncio
from fastapi import APIRouter
from app.models.schemas import GeneResponse, GeneVariant
from app.services import ensembl, gnomad, uniprot, alphafold
from app.utils.validators import validate_gene_symbol, classify_clinical_significance
from app.utils.cache import cache_get, cache_set

router = APIRouter()


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


@router.get("/{gene_symbol}", response_model=GeneResponse)
async def get_gene_data(gene_symbol: str):
    symbol = validate_gene_symbol(gene_symbol)
    cache_key = f"gene:v2:{symbol}"

    cached = cache_get(cache_key)
    if cached:
        return GeneResponse(**cached)

    # Fetch gene info first (needed for other calls)
    gene_info = await ensembl.get_gene_info(symbol)

    gene_id = gene_info["gene_id"]

    # Parallel: variants + constraint + uniprot
    variants_task = ensembl.get_gene_variants(gene_id)
    constraint_task = gnomad.get_gene_constraint(symbol)
    uniprot_task = uniprot.get_uniprot_id(symbol)

    variants, constraint, uniprot_id = await asyncio.gather(
        variants_task,
        constraint_task,
        uniprot_task,
        return_exceptions=True,
    )

    # Handle exceptions from gather
    if isinstance(variants, Exception):
        variants = []
    if isinstance(constraint, Exception):
        constraint = {}
    if isinstance(uniprot_id, Exception):
        uniprot_id = None

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
        pathogenic_variants=pathogenic[:500],
        vus_variants=vus[:500],
        benign_variants=benign[:500],
        other_variants=other[:500],
        pli_score=constraint.get("pli") if isinstance(constraint, dict) else None,
        lof_z_score=constraint.get("lof_z") if isinstance(constraint, dict) else None,
        oe_lof=constraint.get("oe_lof") if isinstance(constraint, dict) else None,
        oe_lof_upper=constraint.get("oe_lof_upper") if isinstance(constraint, dict) else None,
        oe_mis=constraint.get("oe_mis") if isinstance(constraint, dict) else None,
        uniprot_id=uniprot_id if isinstance(uniprot_id, str) else None,
        alphafold_pdb_url=alphafold_data.get("pdb_url") if alphafold_data else None,
        alphafold_pae_url=alphafold_data.get("pae_image_url") if alphafold_data else None,
    )

    cache_set(cache_key, result.model_dump())
    return result
