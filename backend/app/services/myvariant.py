"""MyVariant.info aggregator for variant annotations.

Pulls dbNSFP-derived predictors (CADD, REVEL, AlphaMissense, MetaLR, MetaSVM,
MutPred, PrimateAI), conservation scores (PhyloP, PhastCons, GERP++), splice
predictions (SpliceAI, dbscSNV) and cross-references (OMIM, ClinVar ID,
1000 Genomes, ExAC).
"""
import httpx
from typing import Any, Dict, Optional

BASE_URL = "https://myvariant.info/v1"
TIMEOUT = 25.0

FIELDS = ",".join([
    "dbnsfp.cadd.phred",
    "dbnsfp.cadd.raw_rankscore",
    "dbnsfp.revel.score",
    "dbnsfp.revel.rankscore",
    "dbnsfp.alphamissense.score",
    "dbnsfp.alphamissense.pred",
    "dbnsfp.metalr.score",
    "dbnsfp.metalr.pred",
    "dbnsfp.metasvm.score",
    "dbnsfp.metasvm.pred",
    "dbnsfp.primateai.score",
    "dbnsfp.primateai.pred",
    "dbnsfp.mutpred.score",
    "dbnsfp.fathmm.score",
    "dbnsfp.fathmm.pred",
    "dbnsfp.phylop100way_vertebrate.score",
    "dbnsfp.phastcons100way_vertebrate.score",
    "dbnsfp.gerp++.rs",
    "dbnsfp.dann.score",
    "dbnsfp.interpro_domain",
    "dbscsnv.ada_score",
    "dbscsnv.rf_score",
    "cadd.phred",
    "cadd.consequence",
    "cadd.consscore",
    "cadd.spliceai.ds_ag",
    "cadd.spliceai.ds_al",
    "cadd.spliceai.ds_dg",
    "cadd.spliceai.ds_dl",
    "exac.af",
    "gnomad_exome.af.af",
    "gnomad_genome.af.af",
    "1000g.af",
    "clinvar.rcv.clinical_significance",
    "clinvar.variant_id",
    "cosmic.cosmic_id",
    "cosmic.tumor_site",
    "snpeff.ann",
])


def _first(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _num(value):
    v = _first(value)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _str(value):
    v = _first(value)
    if v is None:
        return None
    return str(v)


async def _fetch_hgvs(hgvs: str) -> Optional[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{BASE_URL}/variant/{hgvs}",
                params={"fields": FIELDS, "assembly": "hg38"},
                timeout=TIMEOUT,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None


async def _fetch_rsid(rsid: str) -> Optional[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{BASE_URL}/query",
                params={
                    "q": f"dbsnp.rsid:{rsid}",
                    "fields": FIELDS,
                    "assembly": "hg38",
                    "size": 1,
                },
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return None

    hits = data.get("hits", [])
    return hits[0] if hits else None


async def get_variant_annotations(
    rsid: Optional[str] = None,
    chrom: Optional[str] = None,
    pos: Optional[int] = None,
    ref: Optional[str] = None,
    alt: Optional[str] = None,
) -> Dict[str, Any]:
    """Fetch aggregated annotations. Prefer HGVS-style coordinates when available."""
    raw = None
    if chrom and pos and ref and alt:
        hgvs = f"chr{chrom}:g.{pos}{ref}>{alt}"
        raw = await _fetch_hgvs(hgvs)
    if not raw and rsid:
        raw = await _fetch_rsid(rsid)
    if not raw:
        return {}

    dbnsfp = raw.get("dbnsfp") or {}
    cadd = raw.get("cadd") or {}
    dbscsnv = raw.get("dbscsnv") or {}
    clinvar = raw.get("clinvar") or {}
    cosmic = raw.get("cosmic") or {}

    spliceai = cadd.get("spliceai") or {}
    spliceai_scores = [
        _num(spliceai.get(k)) for k in ("ds_ag", "ds_al", "ds_dg", "ds_dl")
    ]
    spliceai_scores = [s for s in spliceai_scores if s is not None]
    spliceai_max = max(spliceai_scores) if spliceai_scores else None

    interpro = dbnsfp.get("interpro_domain")
    if isinstance(interpro, list):
        domains = [d for d in interpro if d]
    elif interpro:
        domains = [interpro]
    else:
        domains = []

    cosmic_ids_raw = cosmic.get("cosmic_id") if cosmic else None
    cosmic_ids = (
        cosmic_ids_raw if isinstance(cosmic_ids_raw, list) else ([cosmic_ids_raw] if cosmic_ids_raw else [])
    )

    return {
        "cadd_phred": _num(dbnsfp.get("cadd", {}).get("phred")) or _num(cadd.get("phred")),
        "cadd_rankscore": _num(dbnsfp.get("cadd", {}).get("raw_rankscore")),
        "revel_score": _num(dbnsfp.get("revel", {}).get("score")),
        "alphamissense_score": _num(dbnsfp.get("alphamissense", {}).get("score")),
        "alphamissense_pred": _str(dbnsfp.get("alphamissense", {}).get("pred")),
        "metalr_score": _num(dbnsfp.get("metalr", {}).get("score")),
        "metalr_pred": _str(dbnsfp.get("metalr", {}).get("pred")),
        "metasvm_score": _num(dbnsfp.get("metasvm", {}).get("score")),
        "metasvm_pred": _str(dbnsfp.get("metasvm", {}).get("pred")),
        "primateai_score": _num(dbnsfp.get("primateai", {}).get("score")),
        "primateai_pred": _str(dbnsfp.get("primateai", {}).get("pred")),
        "mutpred_score": _num(dbnsfp.get("mutpred", {}).get("score")),
        "fathmm_score": _num(dbnsfp.get("fathmm", {}).get("score")),
        "fathmm_pred": _str(dbnsfp.get("fathmm", {}).get("pred")),
        "dann_score": _num(dbnsfp.get("dann", {}).get("score")),
        "phylop_score": _num(dbnsfp.get("phylop100way_vertebrate", {}).get("score")),
        "phastcons_score": _num(dbnsfp.get("phastcons100way_vertebrate", {}).get("score")),
        "gerp_rs": _num(dbnsfp.get("gerp++", {}).get("rs")),
        "spliceai_max": spliceai_max,
        "dbscsnv_ada": _num(dbscsnv.get("ada_score")),
        "dbscsnv_rf": _num(dbscsnv.get("rf_score")),
        "interpro_domains": domains[:5],
        "thousand_genomes_af": _num(raw.get("1000g", {}).get("af")),
        "exac_af": _num(raw.get("exac", {}).get("af")),
        "clinvar_variation_id": _str(clinvar.get("variant_id")),
        "cosmic_ids": cosmic_ids[:5],
    }
