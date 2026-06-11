import asyncio
from fastapi import APIRouter, HTTPException
from app.models.schemas import VariantResponse, PopulationFrequency
from app.services import ensembl, gnomad, clinvar, myvariant
from app.utils.validators import validate_rsid
from app.utils.cache import cache_get, cache_set

router = APIRouter()


async def _resolve_allele_frequencies(
    chrom: str, pos: int, ref: str, alt_candidates: list[str], rsid: str | None = None
):
    """Pick the alternate allele that gnomAD reports for this rsID at this locus.

    Multi-allelic rsIDs (e.g. rs334 = T/A/C/G) expose several alternates. Querying the
    wrong one returns a different variant, so the per-population frequencies and the
    geographic map end up describing an unrelated, usually ultra-rare allele. We query
    every candidate and prefer the record whose gnomAD `rsids` contains the queried rsID
    (the authoritative match); ties and rsID-less records break by highest global allele
    frequency. If none are present in gnomAD we fall back to the first candidate.
    """
    if not alt_candidates:
        return {}, "N"
    if len(alt_candidates) == 1:
        try:
            data = await gnomad.get_variant_frequencies(chrom, pos, ref, alt_candidates[0])
        except Exception:
            data = {}
        return data, alt_candidates[0]

    results = await asyncio.gather(
        *[gnomad.get_variant_frequencies(chrom, pos, ref, a) for a in alt_candidates],
        return_exceptions=True,
    )

    best_data = None
    best_alt = None
    best_rank = (False, -1.0)  # (rsID matches, global_af)
    for alt, data in zip(alt_candidates, results):
        if isinstance(data, Exception) or not data:
            continue
        af = data.get("global_af")
        af = af if isinstance(af, (int, float)) else 0.0
        rsid_match = bool(rsid) and rsid in (data.get("rsids") or [])
        rank = (rsid_match, af)
        if rank > best_rank:
            best_rank = rank
            best_data = data
            best_alt = alt

    if best_data is None:
        return {}, alt_candidates[0]
    return best_data, best_alt


@router.get("/{variant_id}", response_model=VariantResponse)
async def get_variant_data(variant_id: str):
    rsid = validate_rsid(variant_id)
    cache_key = f"variant:v3:{rsid}"

    cached = cache_get(cache_key)
    if cached:
        return VariantResponse(**cached)

    vep = await ensembl.get_vep_annotation(rsid)
    if not vep:
        raise HTTPException(status_code=404, detail=f"Variant not found: {rsid}")

    chrom = str(vep.get("chromosome", ""))
    pos = vep.get("position", 0)
    ref = vep.get("ref_allele", "N")
    alt_candidates = vep.get("alt_alleles") or [vep.get("alt_allele", "N")]

    # Resolve the correct alternate for multi-allelic rsIDs (e.g. rs334 is T/A/C/G).
    # Picking the wrong alt makes gnomAD return a different, usually ultra-rare variant,
    # which silently breaks the per-population frequencies and the geographic map.
    gnomad_data, alt = await _resolve_allele_frequencies(chrom, pos, ref, alt_candidates, rsid)

    # Read the SIFT/PolyPhen/amino-acid block for the SAME allele the frequencies describe,
    # so a multi-allelic rsID never mixes one allele's prediction with another's frequency.
    cons = (vep.get("consequences_by_allele") or {}).get(alt) or {}

    clinvar_task = clinvar.get_variant_clinvar(rsid)
    myvariant_task = myvariant.get_variant_annotations(
        rsid=rsid, chrom=chrom, pos=pos, ref=ref, alt=alt
    )

    clinvar_data, mv_data = await asyncio.gather(
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

    # SIFT/PolyPhen for the resolved allele (falls back to the VEP default block)
    sift = cons.get("sift_score", vep.get("sift_score"))
    polyphen = cons.get("polyphen_score", vep.get("polyphen_score"))

    result = VariantResponse(
        variant_id=rsid,
        gene_symbol=cons.get("gene_symbol") or vep.get("gene_symbol"),
        chromosome=chrom,
        position=pos,
        ref_allele=ref,
        alt_allele=alt,
        consequence=cons.get("consequence") or vep.get("consequence", "unknown"),
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
        sift_prediction=cons.get("sift_prediction") or vep.get("sift_prediction"),
        polyphen_score=polyphen,
        polyphen_prediction=cons.get("polyphen_prediction") or vep.get("polyphen_prediction"),
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
        protein_id=cons.get("protein_id") or vep.get("protein_id"),
        amino_acid_change=cons.get("amino_acid_change") or vep.get("amino_acid_change"),
    )

    cache_set(cache_key, result.model_dump())
    return result
