"""Catalogo curado de escores poligenicos (PGS) e da relacao raro x poligenico.

Um escore poligenico (PGS) soma o efeito de muitas variantes comuns de pequeno
efeito para estimar a predisposicao a um traco ou doenca. Aqui mantemos uma
semente curada de escores publicos notaveis (do PGS Catalog) para a pagina
renderizar mesmo sem rede, e o runtime enriquece cada um ao vivo pela API
publica do PGS Catalog em producao.

A camada mais estrategica e a relacao raro x poligenico: como o fundo poligenico
modula a penetrancia de uma variante rara monogenica.

Campos de cada escore:
  id (PGS ID), trait, category, short, citation, n_variants (quando conhecido)

O runtime expoe all_scores(), get_score(id), search_scores(...) e all_interplay().
"""
import re
import unicodedata
import json
from pathlib import Path
from typing import List, Optional, Tuple

# Escores poligenicos publicos notaveis (PGS Catalog). n_variants fica None
# quando nao confirmado; a API preenche em producao.
POLYGENIC_SCORES = [
    {
        "id": "PGS000004",
        "trait": "Cancer de mama",
        "category": "Outras doenças",
        "short": "Escore de 313 variantes amplamente validado para risco de cancer de mama.",
        "citation": "Mavaddat et al., 2019",
        "n_variants": 313,
    },
    {
        "id": "PGS000001",
        "trait": "Cancer de mama",
        "category": "Outras doenças",
        "short": "Escore inicial de 77 variantes para cancer de mama, base de estudos posteriores.",
        "citation": "Mavaddat et al., 2015",
        "n_variants": 77,
    },
    {
        "id": "PGS000013",
        "trait": "Doenca arterial coronariana",
        "category": "Doença cardiovascular",
        "short": "Escore genome-wide para doenca arterial coronariana, um dos primeiros de larga escala.",
        "citation": "Khera et al., 2018",
        "n_variants": None,
    },
    {
        "id": "PGS000018",
        "trait": "Doenca arterial coronariana",
        "category": "Doença cardiovascular",
        "short": "MetaGRS de doenca arterial coronariana combinando multiplos GWAS.",
        "citation": "Inouye et al., 2018",
        "n_variants": None,
    },
    {
        "id": "PGS000021",
        "trait": "Diabetes tipo 2",
        "category": "Doença metabólica",
        "short": "Escore poligenico para risco de diabetes tipo 2.",
        "citation": "PGS Catalog",
        "n_variants": None,
    },
    {
        "id": "PGS000027",
        "trait": "Colesterol LDL",
        "category": "Lipídeos",
        "short": "Escore poligenico para niveis de LDL, complementar as causas monogenicas.",
        "citation": "PGS Catalog",
        "n_variants": None,
    },
    {
        "id": "PGS000034",
        "trait": "Fibrilacao atrial",
        "category": "Doença cardiovascular",
        "short": "Escore poligenico para risco de fibrilacao atrial.",
        "citation": "PGS Catalog",
        "n_variants": None,
    },
    {
        "id": "PGS000055",
        "trait": "Diabetes tipo 1",
        "category": "Sistema imune",
        "short": "Escore poligenico para diabetes tipo 1, com forte contribuicao do HLA.",
        "citation": "PGS Catalog",
        "n_variants": None,
    },
]

# Relacao raro x poligenico: como o fundo poligenico modula a penetrancia de uma
# variante rara monogenica. Exemplos documentados na literatura.
RARE_POLYGENIC = [
    {
        "condition": "Hipercolesterolemia familiar",
        "monogenic": ["LDLR", "APOB", "PCSK9"],
        "disease_id": "hipercolesterolemia-familiar",
        "note": "Em portadores de variante monogenica, um escore poligenico de LDL alto "
                "eleva ainda mais o colesterol e o risco cardiovascular; um escore baixo "
                "atenua parte do efeito. O poligenico ajuda a explicar por que portadores "
                "da mesma mutacao tem quadros diferentes.",
    },
    {
        "condition": "Cancer de mama hereditario",
        "monogenic": ["BRCA1", "BRCA2"],
        "disease_id": "cancer-mama-ovario-hereditario",
        "note": "O escore poligenico de cancer de mama modula o risco absoluto em portadoras "
                "de BRCA1/BRCA2: combinando o monogenico com o poligenico estima-se melhor a "
                "penetrancia individual do que so pela mutacao.",
    },
    {
        "condition": "Doenca arterial coronariana",
        "monogenic": ["LDLR", "APOB", "PCSK9"],
        "disease_id": None,
        "note": "O risco poligenico de doenca coronariana se soma ao risco monogenico da "
                "hipercolesterolemia familiar; parte dos portadores so desenvolve doenca "
                "precoce quando tambem tem alto risco poligenico.",
    },
    {
        "condition": "Diabetes (monogenico x poligenico)",
        "monogenic": ["HNF1A", "GCK", "HNF4A"],
        "disease_id": None,
        "note": "Formas monogenicas (MODY) e o risco poligenico de diabetes tipo 2 podem "
                "coexistir; o escore poligenico ajuda a distinguir e a estratificar risco "
                "alem da causa monogenica.",
    },
]


def _slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", name or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "escore"


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFD", (text or "").lower()).encode("ascii", "ignore").decode()


# Catalogo completo do PGS Catalog, gerado por `python -m etl.pgscatalog`.
# Os 8 escores curados acima continuam, em PT-BR e com resumo proprio, e vem
# primeiro; o campo `source` distingue os dois na interface. O id e o mesmo
# (PGSxxxxxxx), entao um curado sobrepoe o do catalogo em vez de duplicar.
_PGS_JSON = Path(__file__).parent / "pgs_catalog.json"


def _carregar_pgs() -> List[dict]:
    if not _PGS_JSON.exists():
        return []
    try:
        bruto = json.loads(_PGS_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    curados = {s["id"] for s in POLYGENIC_SCORES}
    out = []
    for s in bruto.get("scores", []):
        if s["id"] in curados:
            continue
        anc = s.get("ancestry") or {}
        partes = [s.get("method") or ""]
        if anc:
            comp = ", ".join(f"{k} {v}%" for k, v in sorted(anc.items(), key=lambda kv: -kv[1])[:3])
            partes.append(f"Desenvolvido em {comp}")
        out.append({
            "id": s["id"],
            "source": "pgs_catalog",
            "trait": s.get("trait") or s["id"],
            "category": s.get("category") or "Outros traços",
            "short": ". ".join(x for x in partes if x),
            "citation": s.get("citation") or "",
            "n_variants": s.get("n_variants"),
            "ancestry": anc,
            "eur_only": s.get("eur_only", False),
            "doi": s.get("doi") or "",
            "build": s.get("build") or "",
        })
    return out


for _s in POLYGENIC_SCORES:
    _s.setdefault("source", "curado")

ALL_SCORES: List[dict] = POLYGENIC_SCORES + _carregar_pgs()

_BY_ID = {s["id"]: s for s in ALL_SCORES}


def all_scores() -> List[dict]:
    return ALL_SCORES


def get_score(score_id: str) -> Optional[dict]:
    return _BY_ID.get(score_id)


def all_interplay() -> List[dict]:
    return RARE_POLYGENIC


def search_scores(q: str = "", category: str = "all", page: int = 1, page_size: int = 30) -> Tuple[List[dict], int]:
    nq = _normalize(q).strip()
    items = []
    for s in ALL_SCORES:
        if category and category != "all" and s["category"] != category:
            continue
        if nq:
            hay = _normalize(" ".join([s["id"], s["trait"], s["category"], s["short"], s["citation"]]))
            if nq not in hay:
                continue
        items.append(s)
    total = len(items)
    start = max(0, (page - 1) * page_size)
    return items[start:start + page_size], total
