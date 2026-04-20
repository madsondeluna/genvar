import asyncio
from fastapi import APIRouter, HTTPException
from app.models.schemas import VariantResponse, PopulationFrequency
from app.services import ensembl, gnomad, clinvar, myvariant
from app.utils.validators import validate_rsid
from app.utils.cache import cache_get, cache_set

router = APIRouter()


@router.get("/{variant_id}", response_model=VariantResponse)
async def get_variant_data(variant_id: str):
    rsid = validate_rsid(variant_id)
    cache_key = f"variant:v2:{rsid}"

    cached = cache_get(cache_key)
    if cached:
        return VariantResponse(**cached)

    vep = await ensembl.get_vep_annotation(rsid)
    if not vep:
        raise HTTPException(status_code=404, detail=f"Variant not found: {rsid}")

    chrom = str(vep.get("chromosome", ""))
    pos = vep.get("position", 0)
    ref = vep.get("ref_allele", "N")
    alt = vep.get("alt_allele", "N")

    gnomad_task = gnomad.get_variant_frequencies(chrom, pos, ref, alt)
    clinvar_task = clinvar.get_variant_clinvar(rsid)
    myvariant_task = myvariant.get_variant_annotations(
        rsid=rsid, chrom=chrom, pos=pos, ref=ref, alt=alt
    )

    gnomad_data, clinvar_data, mv_data = await asyncio.gather(
        gnomad_task,
        clinvar_task,
        myvariant_task,
        return_exceptions=True,
    )

    if isinstance(gnomad_data, Exception):
        gnomad_data = {}
    if isinstance(clinvar_data, Exception):
        clinvar_data = {}
    if isinstance(mv_data, Exception):
        mv_data = {}

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

    # VEP SIFT/PolyPhen
    sift = vep.get("sift_score")
    polyphen = vep.get("polyphen_score")

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
        sift_score=sift,
        sift_prediction=vep.get("sift_prediction"),
        polyphen_score=polyphen,
        polyphen_prediction=vep.get("polyphen_prediction"),
        cadd_phred=mv_data.get("cadd_phred"),
        cadd_rankscore=mv_data.get("cadd_rankscore"),
        revel_score=mv_data.get("revel_score"),
        alphamissense_score=mv_data.get("alphamissense_score"),
        alphamissense_pred=mv_data.get("alphamissense_pred"),
        metalr_score=mv_data.get("metalr_score"),
        metalr_pred=mv_data.get("metalr_pred"),
        metasvm_score=mv_data.get("metasvm_score"),
        metasvm_pred=mv_data.get("metasvm_pred"),
        primateai_score=mv_data.get("primateai_score"),
        primateai_pred=mv_data.get("primateai_pred"),
        mutpred_score=mv_data.get("mutpred_score"),
        fathmm_score=mv_data.get("fathmm_score"),
        fathmm_pred=mv_data.get("fathmm_pred"),
        dann_score=mv_data.get("dann_score"),
        phylop_score=mv_data.get("phylop_score"),
        phastcons_score=mv_data.get("phastcons_score"),
        gerp_rs=mv_data.get("gerp_rs"),
        spliceai_max=mv_data.get("spliceai_max"),
        dbscsnv_ada=mv_data.get("dbscsnv_ada"),
        dbscsnv_rf=mv_data.get("dbscsnv_rf"),
        interpro_domains=mv_data.get("interpro_domains") or [],
        thousand_genomes_af=mv_data.get("thousand_genomes_af"),
        exac_af=mv_data.get("exac_af"),
        clinvar_variation_id=mv_data.get("clinvar_variation_id"),
        cosmic_ids=mv_data.get("cosmic_ids") or [],
        protein_id=vep.get("protein_id"),
        amino_acid_change=vep.get("amino_acid_change"),
    )

    cache_set(cache_key, result.model_dump())
    return result
