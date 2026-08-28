import httpx
from typing import Any, Dict, Optional

# Identificacao da origem. Servico publico sem User-Agent e a primeira coisa
# que um mantenedor bloqueia quando precisa cortar trafego anonimo.
UA = "GenVar/2.0 (+https://github.com/madsondeluna/genvar)"

# PGS Catalog (EBI), API publica REST. Enriquece um escore poligenico com o
# numero de variantes, a publicacao e a distribuicao de ancestrias das amostras
# de desenvolvimento e avaliacao. Fonte que mantem o dado atualizado por API.
BASE_URL = "https://www.pgscatalog.org/rest"
TIMEOUT = 30.0


async def get_score(score_id: str) -> Optional[Dict[str, Any]]:
    """Detalhe de um escore (PGS ID) pela API do PGS Catalog. None se ausente."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/score/{score_id}",
            timeout=TIMEOUT,
            headers={"Accept": "application/json", "User-Agent": UA},
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data = response.json()

    pub = data.get("publication") or {}
    samples = data.get("samples_variants") or []
    # Ancestrias das amostras de desenvolvimento (broad ancestry category).
    ancestries: Dict[str, int] = {}
    for s in samples:
        anc = s.get("ancestry_broad")
        n = s.get("sample_number") or 0
        if anc:
            ancestries[anc] = ancestries.get(anc, 0) + int(n)

    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "trait_reported": data.get("trait_reported"),
        "n_variants": data.get("variants_number"),
        "publication": {
            "title": pub.get("title"),
            "author": pub.get("firstauthor"),
            "journal": pub.get("journal"),
            "year": pub.get("date_publication", "")[:4] if pub.get("date_publication") else None,
            "doi": pub.get("doi"),
        },
        "ancestry_dev": ancestries,
    }
