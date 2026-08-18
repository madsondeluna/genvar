import httpx
from typing import Any, Dict

# GWAS Catalog (NHGRI-EBI), API v2: associacoes variante-caracteristica mapeadas
# ao gene pelo proprio catalogo. Fonte primaria dos sinais poligenicos do painel.
BASE_URL = "https://www.ebi.ac.uk/gwas/api/v2"
TIMEOUT = 30.0
PAGE_SIZE = 500
MAX_PAGES = 2  # limita o custo em loci muito estudados (PCSK9 passa de 1.500)


async def get_gene_associations(gene_symbol: str) -> Dict[str, Any]:
    """Agrega as associacoes GWAS do gene por caracteristica (trait)."""
    fetched = 0
    total = 0
    by_trait: Dict[str, Dict[str, Any]] = {}

    async with httpx.AsyncClient() as client:
        for page in range(MAX_PAGES):
            response = await client.get(
                f"{BASE_URL}/genes/{gene_symbol}/associations",
                params={"size": PAGE_SIZE, "page": page},
                timeout=TIMEOUT,
                headers={"Accept": "application/json"},
            )
            if response.status_code == 404:
                return {"traits": [], "association_total": 0, "truncated": False}
            response.raise_for_status()
            data = response.json()

            total = (data.get("page") or {}).get("totalElements", 0)
            associations = (data.get("_embedded") or {}).get("associations", [])
            fetched += len(associations)

            for a in associations:
                names = a.get("traitName") or []
                trait = names[0].strip() if names and names[0] else None
                if not trait:
                    continue
                # pValue vem fatorado: mantissa em pValue, expoente em pValueExponent
                mantissa = a.get("pValue")
                exponent = a.get("pValueExponent")
                p = None
                if mantissa is not None and exponent is not None:
                    p = float(mantissa) * (10.0 ** int(exponent))
                item = by_trait.setdefault(
                    trait, {"trait": trait, "association_count": 0, "best_p_value": None}
                )
                item["association_count"] += 1
                if p is not None and (item["best_p_value"] is None or p < item["best_p_value"]):
                    item["best_p_value"] = p

            if fetched >= total or not associations:
                break

    traits = sorted(
        by_trait.values(), key=lambda t: (-t["association_count"], t["trait"].lower())
    )
    return {
        "traits": traits,
        "association_total": total,
        "truncated": fetched < total,
    }
