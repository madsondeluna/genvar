"""ETL do catalogo completo de doencas raras a partir do Orphanet (Orphadata).

Gera backend/app/data/rare_diseases.json com todas as doencas raras que tem
gene(s) causal(is) associado(s), cruzando:

  - en_product6.xml : associacoes doenca-gene (ORPHAcode, nome, genes, tipo)
  - en_product1.xml : definicao textual e referencias externas (OMIM)

O runtime (app/data/rare_diseases.py) mescla este JSON com a curadoria PT-BR
(que tem prioridade por codigo Orphanet). Rode onde a rede e aberta:

    python -m scripts.build_catalog            # baixa do Orphadata
    python -m scripts.build_catalog arquivo6.xml arquivo1.xml   # offline

Este script NAO roda no sandbox (o egress bloqueia www.orphadata.com); use a
maquina local, a CI ou o container de producao.
"""
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

PRODUCT6_URL = "https://www.orphadata.com/data/xml/en_product6.xml"
PRODUCT1_URL = "https://www.orphadata.com/data/xml/en_product1.xml"
OUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "rare_diseases.json"

# So associacoes gene-doenca com papel causal entram no catalogo.
CAUSAL_STATUS = {
    "disease-causing germline mutation(s) in",
    "disease-causing germline mutation(s) (loss of function) in",
    "disease-causing germline mutation(s) (gain of function) in",
    "disease-causing somatic mutation(s) in",
}


def _slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", name or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "doenca"


def _fetch(url: str) -> bytes:
    import httpx
    with httpx.Client(timeout=120, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.content


def _load_xml(arg: str, url: str) -> ET.Element:
    data = Path(arg).read_bytes() if arg else _fetch(url)
    return ET.fromstring(data)


def parse_genes(root: ET.Element) -> dict:
    """ORPHAcode -> {name, genes[]} a partir do en_product6."""
    out: dict = {}
    for disorder in root.iter("Disorder"):
        code_el = disorder.find("OrphaCode")
        name_el = disorder.find("Name")
        if code_el is None or name_el is None:
            continue
        code = code_el.text
        genes = []
        for assoc in disorder.iter("DisorderGeneAssociation"):
            status = assoc.find("DisorderGeneAssociationType/Name")
            if status is not None and status.text not in CAUSAL_STATUS:
                continue
            symbol = assoc.find("Gene/Symbol")
            if symbol is not None and symbol.text:
                genes.append(symbol.text)
        genes = sorted(set(genes))
        if genes:
            out[code] = {"name": name_el.text, "genes": genes}
    return out


def parse_defs(root: ET.Element) -> dict:
    """ORPHAcode -> {short, omim} a partir do en_product1."""
    out: dict = {}
    for disorder in root.iter("Disorder"):
        code_el = disorder.find("OrphaCode")
        if code_el is None:
            continue
        code = code_el.text
        short = ""
        for tp in disorder.iter("TextSection"):
            body = tp.find("Contents")
            if body is not None and body.text:
                short = body.text.strip()
                break
        omim = None
        for ref in disorder.iter("ExternalReference"):
            src = ref.find("Source")
            ref_id = ref.find("Reference")
            if src is not None and src.text == "OMIM" and ref_id is not None:
                omim = ref_id.text
                break
        out[code] = {"short": short, "omim": omim}
    return out


def build(arg6: str = "", arg1: str = "") -> list:
    genes = parse_genes(_load_xml(arg6, PRODUCT6_URL))
    defs = parse_defs(_load_xml(arg1, PRODUCT1_URL))
    catalog = []
    for code, g in genes.items():
        d = defs.get(code, {})
        catalog.append({
            "id": f"orpha-{code}",
            "name": g["name"],
            "category": "Doenca rara",
            "inheritance": "",
            "genes": g["genes"],
            "short": (d.get("short") or "")[:600],
            "prevalence": None,
            "orphanet": code,
            "omim": d.get("omim"),
            "mondo": None,
        })
    catalog.sort(key=lambda d: d["name"].lower())
    return catalog


def main() -> None:
    arg6 = sys.argv[1] if len(sys.argv) > 1 else ""
    arg1 = sys.argv[2] if len(sys.argv) > 2 else ""
    catalog = build(arg6, arg1)
    OUT_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Gerado {OUT_PATH} com {len(catalog)} doencas com gene causal.")


if __name__ == "__main__":
    main()
