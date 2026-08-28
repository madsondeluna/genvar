import httpx
from typing import Any, Dict, List

from app.config import settings

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TIMEOUT = 20.0

# O NCBI EXIGE identificacao em toda chamada ao E-utilities, e a exigencia nao e
# formalidade: sem `tool` e `email` eles bloqueiam a origem sem aviso, porque nao
# tem a quem escrever antes. Com uma chave de API o teto sobe de 3 para 10
# requisicoes por segundo. A chave e opcional e o servico funciona sem ela; o que
# nao pode faltar e a identificacao.
FERRAMENTA = "GenVar"
HEADERS = {"User-Agent": f"{FERRAMENTA}/2.0 (+https://github.com/madsondeluna/genvar)"}


def _identificacao() -> Dict[str, str]:
    p = {"tool": FERRAMENTA}
    if settings.ncbi_email:
        p["email"] = settings.ncbi_email
    if settings.ncbi_api_key:
        p["api_key"] = settings.ncbi_api_key
    return p


async def search_clinvar(term: str) -> List[str]:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/esearch.fcgi",
            params={"db": "clinvar", "term": term, "retmode": "json",
                    "retmax": "10", **_identificacao()},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

    return data.get("esearchresult", {}).get("idlist", [])


async def get_clinvar_batch_summary(uids: List[str]) -> Dict[str, Any]:
    """Fetch all UIDs in one request and return the best record."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/esummary.fcgi",
            params={"db": "clinvar", "id": ",".join(uids), "retmode": "json",
                    **_identificacao()},
            headers=HEADERS,
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
