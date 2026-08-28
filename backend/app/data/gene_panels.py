"""Catalogo curado de paineis de genes (multigenico).

Um painel agrupa os genes que, juntos, respondem por uma condicao ou grupo de
condicoes clinicamente relacionadas. Diferente do catalogo de doencas (uma
doenca -> gene causal), aqui o foco e a visao multigenica: varios genes que
compartilham fenotipo, com heranca complexa e, quando pertinente, efeitos
digenicos/oligogenicos.

Estrutura de cada painel:
  id, name, category, short, inheritance, genes[], conditions[], digenic

O runtime expoe all_panels(), get_panel(id) e search_panels(q, category, page,
page_size), no mesmo contrato do modulo de doencas.
"""
import re
import unicodedata
import json
from pathlib import Path
from typing import List, Optional, Tuple

GENE_PANELS = [
    {
        "id": "cancer-mama-ovario-hereditario",
        "name": "Cancer de mama e ovario hereditario",
        "category": "Oncogenética",
        "short": "Genes de predisposicao ao cancer de mama e ovario, do alto risco (BRCA1/2) aos de risco moderado.",
        "inheritance": "Autossomica dominante",
        "genes": ["BRCA1", "BRCA2", "PALB2", "ATM", "CHEK2", "TP53", "PTEN", "STK11", "CDH1", "RAD51C", "RAD51D", "BARD1"],
        "conditions": [
            {"name": "Cancer de mama e ovario hereditario", "disease_id": "cancer-mama-ovario-hereditario"},
            {"name": "Sindrome de Li-Fraumeni (TP53)", "disease_id": None},
        ],
        "digenic": "",
    },
    {
        "id": "cancer-colorretal-hereditario",
        "name": "Cancer colorretal hereditario e polipose",
        "category": "Oncogenética",
        "short": "Reparo de mau pareamento (Lynch) e genes de polipose adenomatosa e associada a MUTYH.",
        "inheritance": "Autossomica dominante e recessiva",
        "genes": ["MLH1", "MSH2", "MSH6", "PMS2", "EPCAM", "APC", "MUTYH", "STK11", "SMAD4", "BMPR1A", "PTEN"],
        "conditions": [
            {"name": "Sindrome de Lynch", "disease_id": "sindrome-de-lynch"},
            {"name": "Polipose adenomatosa familiar (APC)", "disease_id": None},
        ],
        "digenic": "MUTYH tem heranca recessiva: o risco de polipose aparece com duas variantes patogenicas (bialelicas).",
    },
    {
        "id": "cardiomiopatia-hipertrofica",
        "name": "Cardiomiopatia hipertrofica",
        "category": "Cardiologia",
        "short": "Genes do sarcomero cardiaco; a maioria dos casos familiares vem de MYH7 e MYBPC3.",
        "inheritance": "Autossomica dominante",
        "genes": ["MYH7", "MYBPC3", "TNNT2", "TNNI3", "TPM1", "MYL2", "MYL3", "ACTC1", "CSRP3", "PLN"],
        "conditions": [
            {"name": "Cardiomiopatia hipertrofica", "disease_id": "cardiomiopatia-hipertrofica"},
        ],
        "digenic": "Portadores de variantes em dois genes do sarcomero tendem a doenca mais precoce e grave (efeito oligogenico).",
    },
    {
        "id": "cardiomiopatia-dilatada",
        "name": "Cardiomiopatia dilatada",
        "category": "Cardiologia",
        "short": "Genes do sarcomero, citoesqueleto e lamina nuclear; TTN truncado e a causa isolada mais comum.",
        "inheritance": "Autossomica dominante",
        "genes": ["TTN", "LMNA", "MYH7", "TNNT2", "SCN5A", "RBM20", "BAG3", "DSP", "FLNC", "PLN"],
        "conditions": [
            {"name": "Cardiomiopatia dilatada", "disease_id": None},
        ],
        "digenic": "",
    },
    {
        "id": "arritmias-hereditarias",
        "name": "Arritmias hereditarias e QT longo",
        "category": "Cardiologia",
        "short": "Canais ionicos cardiacos ligados a sindrome do QT longo, Brugada e taquicardia catecolaminergica.",
        "inheritance": "Autossomica dominante",
        "genes": ["KCNQ1", "KCNH2", "SCN5A", "KCNE1", "KCNE2", "RYR2", "CACNA1C", "KCNJ2"],
        "conditions": [
            {"name": "Sindrome do QT longo", "disease_id": None},
            {"name": "Sindrome de Brugada (SCN5A)", "disease_id": None},
        ],
        "digenic": "No QT longo, variantes em KCNE1/KCNE2 podem modular a gravidade junto a KCNQ1 ou KCNH2 (modificadores).",
    },
    {
        "id": "hipercolesterolemia-familiar",
        "name": "Hipercolesterolemia familiar",
        "category": "Metabolismo",
        "short": "Genes do metabolismo do LDL; a maioria dos casos vem de variantes em LDLR.",
        "inheritance": "Autossomica dominante",
        "genes": ["LDLR", "APOB", "PCSK9", "LDLRAP1"],
        "conditions": [
            {"name": "Hipercolesterolemia familiar", "disease_id": "hipercolesterolemia-familiar"},
        ],
        "digenic": "LDLRAP1 e recessivo; a forma bialelica causa hipercolesterolemia autossomica recessiva.",
    },
    {
        "id": "surdez-nao-sindromica",
        "name": "Surdez nao sindromica",
        "category": "Otorrinolaringologia",
        "short": "Perda auditiva hereditaria sem outros sinais; GJB2 responde por grande parte dos casos recessivos.",
        "inheritance": "Autossomica recessiva",
        "genes": ["GJB2", "GJB6", "SLC26A4", "MYO7A", "MYO15A", "OTOF", "TMC1", "CDH23"],
        "conditions": [
            {"name": "Surdez nao sindromica DFNB1 (GJB2/GJB6)", "disease_id": None},
        ],
        "digenic": "Heranca digenica GJB2/GJB6: uma variante em cada gene pode, junta, causar surdez mesmo sem duas variantes no mesmo gene.",
    },
    {
        "id": "retinopatias-hereditarias",
        "name": "Retinopatias hereditarias",
        "category": "Oftalmologia",
        "short": "Retinose pigmentar e distrofias de retina; grande heterogeneidade genetica.",
        "inheritance": "Heranca variavel",
        "genes": ["RPGR", "RHO", "USH2A", "ABCA4", "CRB1", "PRPH2", "ROM1", "RP1"],
        "conditions": [
            {"name": "Retinose pigmentar", "disease_id": None},
            {"name": "Doenca de Stargardt (ABCA4)", "disease_id": None},
        ],
        "digenic": "PRPH2/ROM1 e o exemplo classico de retinose pigmentar digenica: uma variante em cada gene, herdadas juntas, causam a doenca.",
    },
    {
        "id": "epilepsias-geneticas",
        "name": "Epilepsias geneticas",
        "category": "Neurologia",
        "short": "Encefalopatias epilepticas e epilepsias monogenicas de inicio precoce.",
        "inheritance": "Heranca variavel",
        "genes": ["SCN1A", "SCN2A", "KCNQ2", "STXBP1", "CDKL5", "PCDH19", "GABRG2", "DEPDC5"],
        "conditions": [
            {"name": "Sindrome de Dravet (SCN1A)", "disease_id": None},
        ],
        "digenic": "",
    },
]


def _slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", name or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "painel"


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFD", (text or "").lower()).encode("ascii", "ignore").decode()


# Catalogo do PanelApp (Genomics England), gerado por `python -m etl.panelapp`.
# Fica em JSON e nao em modulo Python porque sao 425 paineis e 4308 genes: um
# literal desse tamanho no fonte inviabiliza revisao de diff. Os 9 paineis
# curados acima continuam, em PT-BR, e vem primeiro na listagem; o campo
# `source` distingue os dois na interface.
_PANELAPP_JSON = Path(__file__).parent / "panelapp_panels.json"


def _carregar_panelapp() -> List[dict]:
    if not _PANELAPP_JSON.exists():
        return []
    try:
        bruto = json.loads(_PANELAPP_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    # O JSON guarda o detalhe por gene normalizado: `genes_ref` traz apenas
    # [simbolo, heranca, indice de fenotipo], e o que e constante por gene mora
    # em `catalogo_genes`. A mesma entrada repetida em oito paineis custava
    # 7,5 MB de simbolo, HGNC, Ensembl e nome iguais. Aqui ela e reidratada.
    catalogo = bruto.get("catalogo_genes") or {}
    fenotipos = bruto.get("fenotipos") or []

    def _reidratar(refs):
        out = []
        for ref in refs or []:
            simbolo, moi, ifen = ref
            base = catalogo.get(simbolo) or {}
            out.append({
                "symbol": simbolo,
                "hgnc": base.get("hgnc"),
                "ensembl": base.get("ensembl"),
                "name": base.get("name"),
                "moi": moi,
                "phenotypes": fenotipos[ifen] if 0 <= ifen < len(fenotipos) else [],
            })
        return out

    out = []
    for p in bruto.get("panels", []):
        genes = p.get("genes") or []
        cond = p.get("conditions") or []
        # `short` alimenta a busca e o cartao; o PanelApp nao tem um resumo,
        # entao ele e montado do que existe, sem inventar texto clinico.
        partes = [p.get("sub_category") or "", f"{len(genes)} genes verdes no PanelApp"]
        if cond:
            partes.append("Codigos: " + ", ".join(cond[:4]))
        out.append({
            "id": p["id"],
            "source": "panelapp",
            "source_id": p.get("source_id"),
            "version": p.get("version"),
            "name": p["name"],
            "category": p.get("category") or "Outros",
            "inheritance": p.get("inheritance") or "Nao especificada",
            "short": ". ".join(x for x in partes if x),
            "genes": genes,
            "genes_detail": _reidratar(p.get("genes_ref")),
            "genes_amber": p.get("genes_amber") or [],
            "conditions": cond,
            "digenic": "",
        })
    return out


for _p in GENE_PANELS:
    _p.setdefault("source", "curado")

ALL_PANELS: List[dict] = GENE_PANELS + _carregar_panelapp()

_BY_ID = {p["id"]: p for p in ALL_PANELS}


def all_panels() -> List[dict]:
    return ALL_PANELS


def get_panel(panel_id: str) -> Optional[dict]:
    return _BY_ID.get(panel_id)


def search_panels(q: str = "", category: str = "all", page: int = 1, page_size: int = 30) -> Tuple[List[dict], int]:
    nq = _normalize(q).strip()
    items = []
    for p in ALL_PANELS:
        if category and category != "all" and p["category"] != category:
            continue
        if nq:
            hay = _normalize(" ".join([p["name"], p["category"], p.get("short") or "", " ".join(p["genes"])]))
            if nq not in hay:
                continue
        items.append(p)
    total = len(items)
    start = max(0, (page - 1) * page_size)
    return items[start:start + page_size], total
