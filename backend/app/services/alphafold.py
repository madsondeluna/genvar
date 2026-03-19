import httpx
from typing import Dict, Any, Optional

BASE_URL = "https://alphafold.ebi.ac.uk/api"
TIMEOUT = 20.0


async def get_prediction(uniprot_id: str) -> Optional[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{BASE_URL}/prediction/{uniprot_id}",
                timeout=TIMEOUT,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

    if not data or not isinstance(data, list):
        return None

    # First item is the canonical model
    entry = data[0]
    return {
        "entry_id": entry.get("entryId"),
        "pdb_url": entry.get("pdbUrl"),
        "pae_image_url": entry.get("paeImageUrl"),
        "pae_doc_url": entry.get("paeDocUrl"),
        "cif_url": entry.get("cifUrl"),
        "global_metric": entry.get("globalMetricValue"),
        "latest_version": entry.get("latestVersion"),
    }
