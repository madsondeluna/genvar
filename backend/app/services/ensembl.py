import httpx
from typing import Dict, Any, List, Optional
from fastapi import HTTPException


BASE_URL = "https://rest.ensembl.org"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 30.0


async def get_gene_info(gene_symbol: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/lookup/symbol/homo_sapiens/{gene_symbol}"
        response = await client.get(url, headers=HEADERS, timeout=TIMEOUT)

        if response.status_code == 400:
            raise HTTPException(status_code=404, detail=f"Gene not found: {gene_symbol}")

        response.raise_for_status()
        data = response.json()

        return {
            "gene_id": data.get("id"),
            "gene_symbol": data.get("display_name"),
            "description": data.get("description"),
            "chromosome": data.get("seq_region_name"),
            "start": data.get("start"),
            "end": data.get("end"),
            "strand": data.get("strand"),
            "biotype": data.get("biotype"),
            "assembly_name": data.get("assembly_name"),
        }


async def get_gene_variants(gene_id: str, limit: int = 500) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/overlap/id/{gene_id}?feature=variation"
        response = await client.get(url, headers=HEADERS, timeout=60.0)

        if response.status_code == 404:
            return []

        response.raise_for_status()
        variants = response.json()

        return variants[:limit]


async def get_vep_annotation(rsid: str) -> Optional[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/vep/human/id/{rsid}"
        response = await client.get(
            url,
            headers=HEADERS,
            timeout=TIMEOUT,
            params={"content-type": "application/json"},
        )

        if response.status_code in (400, 404):
            return None

        response.raise_for_status()
        results = response.json()

        if not results:
            return None

        vep = results[0]
        transcript_consequences = vep.get("transcript_consequences", [])

        # Find the most relevant consequence (canonical transcript or highest impact)
        best_tc = None
        for tc in transcript_consequences:
            if best_tc is None:
                best_tc = tc
            # Prefer protein_coding transcripts
            if tc.get("biotype") == "protein_coding" and best_tc.get("biotype") != "protein_coding":
                best_tc = tc
            # Prefer entries with SIFT/PolyPhen scores
            if tc.get("sift_score") is not None and best_tc.get("sift_score") is None:
                best_tc = tc

        # Extract colocated variant info for CADD/REVEL (not in basic VEP without plugins)
        colocated = vep.get("colocated_variants", [])

        result = {
            "variant_id": vep.get("id"),
            "chromosome": vep.get("seq_region_name"),
            "position": vep.get("start"),
            "allele_string": vep.get("allele_string", "/"),
            "most_severe_consequence": vep.get("most_severe_consequence"),
            "gene_symbol": None,
            "gene_id": None,
            "consequence": vep.get("most_severe_consequence", "unknown"),
            "sift_score": None,
            "sift_prediction": None,
            "polyphen_score": None,
            "polyphen_prediction": None,
            "amino_acid_change": None,
            "protein_id": None,
        }

        if best_tc:
            result["gene_symbol"] = best_tc.get("gene_symbol")
            result["gene_id"] = best_tc.get("gene_id")
            result["consequence"] = (
                best_tc.get("consequence_terms", [vep.get("most_severe_consequence", "unknown")])[0]
            )
            result["sift_score"] = best_tc.get("sift_score")
            result["sift_prediction"] = best_tc.get("sift_prediction")
            result["polyphen_score"] = best_tc.get("polyphen_score")
            result["polyphen_prediction"] = best_tc.get("polyphen_prediction")
            result["protein_id"] = best_tc.get("transcript_id")

            aa = best_tc.get("amino_acids")
            if aa:
                pos = best_tc.get("protein_start", "")
                result["amino_acid_change"] = f"p.{aa.replace('/', str(pos))}" if pos else aa

        # Parse alleles from allele_string like "T/C"
        allele_parts = result["allele_string"].split("/")
        if len(allele_parts) == 2:
            result["ref_allele"] = allele_parts[0]
            result["alt_allele"] = allele_parts[1]
        else:
            result["ref_allele"] = allele_parts[0] if allele_parts else "N"
            result["alt_allele"] = allele_parts[-1] if len(allele_parts) > 1 else "N"

        return result
