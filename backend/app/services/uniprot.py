import httpx
from typing import Optional

BASE_URL = "https://rest.uniprot.org"
TIMEOUT = 20.0
HEADERS = {"User-Agent": "GenVar-Dashboard/1.0 (genvar@bioinformatics.ufmg.br)"}


async def get_uniprot_id(gene_symbol: str) -> Optional[str]:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{BASE_URL}/uniprotkb/search",
                params={
                    "query": f"gene:{gene_symbol} AND organism_id:9606 AND reviewed:true",
                    "format": "json",
                    "fields": "accession,gene_names",
                    "size": "1",
                },
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

    results = data.get("results", [])
    if not results:
        return None

    return results[0].get("primaryAccession")
