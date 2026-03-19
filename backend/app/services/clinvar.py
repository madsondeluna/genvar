import httpx
from typing import Dict, Any, List, Optional

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TIMEOUT = 20.0


async def search_clinvar(term: str) -> List[str]:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/esearch.fcgi",
            params={"db": "clinvar", "term": term, "retmode": "json", "retmax": "10"},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

    return data.get("esearchresult", {}).get("idlist", [])


async def get_clinvar_summary(uid: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/esummary.fcgi",
            params={"db": "clinvar", "id": uid, "retmode": "json"},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

    result_obj = data.get("result", {})
    item = result_obj.get(uid)
    if not item:
        return {}

    germline = item.get("germline_classification", {})
    significance = germline.get("description")
    review_status = germline.get("review_status")
    last_evaluated = germline.get("last_evaluated")

    trait_set = germline.get("trait_set", [])
    conditions = [t.get("trait_name") for t in trait_set if t.get("trait_name")]

    return {
        "clinvar_id": uid,
        "accession": item.get("accession"),
        "title": item.get("title"),
        "significance": significance,
        "review_status": review_status,
        "last_evaluated": last_evaluated,
        "conditions": conditions,
    }


async def get_clinvar_batch_summary(uids: List[str]) -> Dict[str, Any]:
    """Fetch all UIDs in one request and return the best record."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/esummary.fcgi",
            params={"db": "clinvar", "id": ",".join(uids), "retmode": "json"},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

    result_obj = data.get("result", {})
    best: Dict[str, Any] = {}

    for uid in uids:
        item = result_obj.get(uid)
        if not item:
            continue
        germline = item.get("germline_classification", {})
        desc = germline.get("description", "") or ""
        # Skip uninformative records
        if not desc or desc.lower().startswith("no classification"):
            continue
        review_status = germline.get("review_status", "") or ""
        conditions = [
            t.get("trait_name")
            for t in germline.get("trait_set", [])
            if t.get("trait_name")
        ]
        candidate = {
            "clinvar_id": uid,
            "accession": item.get("accession"),
            "title": item.get("title"),
            "significance": desc,
            "review_status": review_status,
            "last_evaluated": germline.get("last_evaluated"),
            "conditions": conditions,
        }
        # Rank by number of conditions (more conditions = more comprehensive aggregate record)
        if not best or len(conditions) > len(best.get("conditions", [])):
            best = candidate

    return best


async def get_variant_clinvar(rsid: str) -> Dict[str, Any]:
    try:
        uids = await search_clinvar(rsid)
        if not uids:
            return {}

        # Batch fetch all UIDs, pick the most informative record
        return await get_clinvar_batch_summary(uids)
    except Exception:
        return {}
