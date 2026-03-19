import asyncio
from fastapi import APIRouter
from app.models.schemas import VariantResponse, PopulationFrequency
from app.services import ensembl, gnomad, clinvar
from app.utils.validators import validate_rsid
from app.utils.cache import cache_get, cache_set

router = APIRouter()


@router.get("/{variant_id}", response_model=VariantResponse)
async def get_variant_data(variant_id: str):
    rsid = validate_rsid(variant_id)
    cache_key = f"variant:{rsid}"

    cached = cache_get(cache_key)
    if cached:
        return VariantResponse(**cached)

    # VEP annotation first (need chrom/pos/ref/alt for gnomAD)
    vep = await ensembl.get_vep_annotation(rsid)

    if not vep:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Variant not found: {rsid}")

    chrom = str(vep.get("chromosome", ""))
    pos = vep.get("position", 0)
    ref = vep.get("ref_allele", "N")
    alt = vep.get("alt_allele", "N")

    # Parallel: gnomAD + ClinVar
    gnomad_task = gnomad.get_variant_frequencies(chrom, pos, ref, alt)
    clinvar_task = clinvar.get_variant_clinvar(rsid)

    gnomad_data, clinvar_data = await asyncio.gather(
        gnomad_task,
        clinvar_task,
        return_exceptions=True,
    )

    if isinstance(gnomad_data, Exception):
        gnomad_data = {}
    if isinstance(clinvar_data, Exception):
        clinvar_data = {}

    # Build population frequency list
    pop_list = []
    for p in gnomad_data.get("populations", []):
        pop_list.append(PopulationFrequency(
            population=p["population"],
            population_name=p["population_name"],
            allele_frequency=p["allele_frequency"],
            allele_count=p["allele_count"],
            allele_number=p["allele_number"],
        ))

    conditions = clinvar_data.get("conditions", []) if isinstance(clinvar_data, dict) else []

    result = VariantResponse(
        variant_id=rsid,
        gene_symbol=vep.get("gene_symbol"),
        chromosome=chrom,
        position=pos,
        ref_allele=ref,
        alt_allele=alt,
        consequence=vep.get("consequence", "unknown"),
        most_severe_consequence=vep.get("most_severe_consequence"),
        gnomad_frequencies=pop_list,
        gnomad_global_af=gnomad_data.get("global_af") if isinstance(gnomad_data, dict) else None,
        gnomad_ac=gnomad_data.get("global_ac") if isinstance(gnomad_data, dict) else None,
        gnomad_an=gnomad_data.get("global_an") if isinstance(gnomad_data, dict) else None,
        clinvar_significance=clinvar_data.get("significance") if isinstance(clinvar_data, dict) else None,
        clinvar_review_status=clinvar_data.get("review_status") if isinstance(clinvar_data, dict) else None,
        clinvar_conditions=conditions,
        clinvar_last_evaluated=clinvar_data.get("last_evaluated") if isinstance(clinvar_data, dict) else None,
        sift_score=vep.get("sift_score"),
        sift_prediction=vep.get("sift_prediction"),
        polyphen_score=vep.get("polyphen_score"),
        polyphen_prediction=vep.get("polyphen_prediction"),
        protein_id=vep.get("protein_id"),
        amino_acid_change=vep.get("amino_acid_change"),
    )

    cache_set(cache_key, result.model_dump())
    return result
