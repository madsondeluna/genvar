"""Sugestoes ao digitar, para todos os campos de busca do app.

Um endpoint so, tipado, servindo os quatro tipos que o app sabe abrir: doenca,
painel, gene e variante. O indice e montado uma vez, na primeira chamada, a
partir dos catalogos locais; nao ha ida a fonte externa aqui, porque sugestao
roda a cada tecla e latencia de rede por tecla e inutilizavel.

Ordenacao: prefixo antes de subcadeia, e dentro de cada grupo o rotulo mais
curto primeiro. Quem digita "cft" espera CFTR na frente de uma doenca cujo
texto apenas contem "cft".
"""
import unicodedata
from typing import Dict, List, Optional

from fastapi import APIRouter, Query

from app.models.schemas import SuggestItem, SuggestResponse
from app.data.rare_diseases import all_diseases
from app.data.gene_panels import all_panels

router = APIRouter()

MAX_LIMIT = 20
MIN_QUERY = 2


def _norm(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


_INDEX: Optional[List[Dict]] = None


def _build_index() -> List[Dict]:
    """Uma entrada por coisa que o app sabe abrir, com o texto que a encontra."""
    out: List[Dict] = []
    gene_hits: Dict[str, List[str]] = {}

    for d in all_diseases():
        genes = d.get("genes") or []
        out.append({
            "kind": "disease", "id": d["id"], "label": d["name"],
            "hint": d.get("category") or "", "extra": ", ".join(genes[:3]),
            "haystack": _norm(f"{d['name']} {d.get('category','')} {d.get('short','')}"),
            "key": _norm(d["name"]),
        })
        for g in genes:
            gene_hits.setdefault(g, []).append(d["name"])

    for p in all_panels():
        genes = p.get("genes") or []
        out.append({
            "kind": "panel", "id": p["id"], "label": p["name"],
            "hint": p.get("category") or "", "extra": f"{len(genes)} genes",
            "haystack": _norm(f"{p['name']} {p.get('category','')} {p.get('short','')}"),
            "key": _norm(p["name"]),
        })
        for g in genes:
            gene_hits.setdefault(g, []).append(p["name"])

    for gene, onde in sorted(gene_hits.items()):
        out.append({
            "kind": "gene", "id": gene, "label": gene,
            "hint": "gene", "extra": onde[0] if len(onde) == 1 else f"{len(onde)} registros",
            "haystack": _norm(gene), "key": _norm(gene),
        })

    # rsIDs de exemplo curados nas doencas, os unicos que abrem sem ida externa
    vistos = set()
    for d in all_diseases():
        ex = d.get("example") or {}
        rsid = ex.get("id") if ex.get("kind") == "variant" else None
        if rsid and rsid not in vistos:
            vistos.add(rsid)
            out.append({
                "kind": "variant", "id": rsid, "label": rsid,
                "hint": "variante", "extra": d["name"],
                "haystack": _norm(f"{rsid} {d['name']}"), "key": _norm(rsid),
            })
    return out


def _index() -> List[Dict]:
    global _INDEX
    if _INDEX is None:
        _INDEX = _build_index()
    return _INDEX


# Ordem de desempate entre tipos, quando a pontuacao textual empata.
_KIND_RANK = {"gene": 0, "disease": 1, "panel": 2, "variant": 3}


@router.get("", response_model=SuggestResponse)
async def suggest(q: str = "", limit: int = Query(8, ge=1, le=MAX_LIMIT)):
    ql = _norm(q).strip()
    if len(ql) < MIN_QUERY:
        return SuggestResponse(query=q, items=[])

    achados = []
    for e in _index():
        if e["key"].startswith(ql):
            score = 0
        elif ql in e["key"]:
            score = 1
        elif ql in e["haystack"]:
            score = 2
        else:
            continue
        achados.append((score, _KIND_RANK.get(e["kind"], 9), len(e["label"]), e))

    achados.sort(key=lambda t: (t[0], t[1], t[2]))
    return SuggestResponse(
        query=q,
        items=[
            SuggestItem(kind=e["kind"], id=e["id"], label=e["label"],
                        hint=e["hint"] or None, extra=e["extra"] or None)
            for _, _, _, e in achados[:limit]
        ],
    )
