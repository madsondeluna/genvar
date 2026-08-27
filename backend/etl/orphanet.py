"""ETL do Orphanet para o catalogo de doencas raras do GenVar.

Os downloads em massa do Orphadata sao abertos: a chave so e exigida pela API
REST, que nao usamos. Cada arquivo vai para cache em disco, entao uma segunda
execucao nao repete rede e um ETL interrompido retoma.

Arquivos usados e o que cada um resolve:
    pt_product1        nome oficial em portugues, sinonimos e referencias
                       externas (OMIM, MONDO, ICD, UMLS). O nome PT vem da
                       propria fonte: nao ha traducao automatica em lugar nenhum
                       deste ETL, e por isso nenhum termo e inventado.
    en_product6        genes por doenca, com o TIPO da associacao, o que separa
                       mutacao causadora de fator de suscetibilidade e de gene
                       apenas candidato
    en_product9_ages   padrao de heranca
    en_product9_prev   prevalencia
    en_product4        fenotipos HPO
    en_product3_<id>   classificacoes por especialidade, que dao a categoria

Uso:
    python -m etl.orphanet
    python -m etl.orphanet --refresh
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import httpx

BASE = "https://www.orphadata.com/data/xml"
# Traducao OFICIAL do HPO para portugues, com ORCID do tradutor por termo.
# Nao ha traducao automatica aqui: termo sem traducao oficial fica em ingles,
# que e como a fonte o publica.
HPO_PT = ("https://raw.githubusercontent.com/obophenotype/hpo-translations/"
          "main/babelon/hp-pt.babelon.tsv")
CACHE = Path(__file__).parent / ".cache" / "orphanet"
SAIDA = Path(__file__).parent.parent / "app" / "data" / "orphanet_diseases.json"
TIMEOUT = 600.0

# So estas contam como causa monogenica estabelecida. "Major susceptibility
# factor" e "Candidate gene tested in" descrevem outra coisa e entram num campo
# proprio: um catalogo que mistura os tres afirma causalidade que a fonte nao
# afirma.
TIPOS_CAUSAIS = {
    "Disease-causing germline mutation(s) in",
    "Disease-causing germline mutation(s) (loss of function) in",
    "Disease-causing germline mutation(s) (gain of function) in",
}

HERANCA = {
    "Autosomal dominant": "AD",
    "Autosomal recessive": "AR",
    "X-linked recessive": "XLR",
    "X-linked dominant": "XLD",
    "Mitochondrial inheritance": "MT",
    "Y-linked": "YL",
    "Multigenic/multifactorial": "MF",
    "Oligogenic": "OL",
    "Semi-dominant": "SD",
}

# ids das classificacoes por especialidade do Orphanet
CLASSIFICACOES = [146, 147, 148, 149, 150, 156, 181, 182, 183, 184, 185, 186,
                  187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198,
                  199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
                  211, 212, 213, 214, 215, 216, 217]

# especialidade do Orphanet -> vocabulario canonico do app, o mesmo dos paineis
CATEGORIA = {
    "cardiac": "Cardiologia",
    "endocrine": "Endocrinologia",
    "neurologic": "Neurologia",
    "neurological": "Neurologia",
    "developmental anomalies": "Malformações congênitas",
    "ophthalmic": "Oftalmologia",
    "eye": "Oftalmologia",
    "skin": "Dermatologia",
    "dermatologic": "Dermatologia",
    "haematologic": "Hematologia",
    "hematologic": "Hematologia",
    "renal": "Nefrologia",
    "urogenital": "Nefrologia",
    "respiratory": "Pneumologia",
    "gastroenterologic": "Gastro-hepatologia",
    "hepatic": "Gastro-hepatologia",
    "bone": "Musculoesquelético",
    "skeletal": "Musculoesquelético",
    "neuromuscular": "Musculoesquelético",
    "immun": "Imunologia",
    "inborn errors of metabolism": "Metabolismo",
    "metabol": "Metabolismo",
    "mitochondrial": "Mitocondrial",
    "otorhinolaryngologic": "Otorrinolaringologia",
    "teratologic": "Malformações congênitas",
    "malformation": "Malformações congênitas",
    "surgical": "Malformações congênitas",
    "tumor": "Oncogenética",
    "oncolog": "Oncogenética",
    "infertility": "Endocrinologia",
    "systemic and rheumatological": "Tecido conjuntivo",
    "gynaecologic": "Endocrinologia",
    "odontologic": "Otorrinolaringologia",
    "allergologic": "Imunologia",
    "hepatologic": "Gastro-hepatologia",
    "transplantation": "Outros",
    "circulatory": "Cardiologia",
}


# Uma doenca costuma aparecer em VARIAS classificacoes do Orphanet: Marfan esta
# em sete, incluindo oftalmica, circulatoria, ossea e toracica. Pegar a primeira
# que o disco devolver e sortear a categoria. A ordem abaixo decide, e ela poe a
# categoria mais IDENTIFICADORA na frente: etiologia (oncogenetica, metabolismo,
# mitocondrial) antes de orgao, e orgao antes dos agrupamentos amplos. Toda
# categoria encontrada continua gravada em `categories`; esta escolhe a primaria.
PRIORIDADE = [
    "Oncogenética", "Metabolismo", "Mitocondrial", "Imunologia",
    "Tecido conjuntivo", "Hematologia", "Neurologia", "Cardiologia",
    "Nefrologia", "Pneumologia", "Gastro-hepatologia", "Oftalmologia",
    "Otorrinolaringologia", "Dermatologia", "Musculoesquelético",
    "Endocrinologia", "Malformações congênitas", "Outros",
]
_RANK = {c: i for i, c in enumerate(PRIORIDADE)}


def primaria(cats: Set[str]) -> str:
    if not cats:
        return "Outros"
    return min(cats, key=lambda c: _RANK.get(c, 99))



def _agora() -> str:
    """Data da extracao, em UTC. Vai no JSON porque a pagina de fontes precisa
    dizer QUANDO cada catalogo foi extraido: dado publico muda, e um catalogo
    sem data e um catalogo sem validade declarada."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def _slug(nome: str) -> str:
    s = unicodedata.normalize("NFD", nome or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:80] or "doenca"


def baixar(cli: httpx.Client, arquivo: str, refresh: bool) -> Optional[Path]:
    alvo = CACHE / f"{arquivo}.xml"
    if alvo.exists() and alvo.stat().st_size > 1000 and not refresh:
        return alvo
    alvo.parent.mkdir(parents=True, exist_ok=True)
    tmp = alvo.with_suffix(".part")
    try:
        with cli.stream("GET", f"{BASE}/{arquivo}.xml") as r:
            r.raise_for_status()
            with tmp.open("wb") as f:
                for pedaco in r.iter_bytes(1 << 16):
                    f.write(pedaco)
        tmp.replace(alvo)          # so vira definitivo inteiro
        return alvo
    except httpx.HTTPError as e:
        tmp.unlink(missing_ok=True)
        print(f"  {arquivo}: {e}", file=sys.stderr)
        return None


def categoria_de(nome_classificacao: str) -> Optional[str]:
    n = (nome_classificacao or "").lower()
    for chave, rot in CATEGORIA.items():
        if chave in n:
            return rot
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as cli:
        print("Baixando os arquivos do Orphadata (usa cache quando existe)...")
        alvos = {}
        for nome in ["pt_product1", "en_product6", "en_product9_ages",
                     "en_product9_prev", "en_product4"]:
            p = baixar(cli, nome, args.refresh)
            if not p:
                print(f"falha em {nome}", file=sys.stderr)
                return 1
            alvos[nome] = p
            print(f"  {nome}: {p.stat().st_size/1e6:.0f} MB")

        print("Baixando as classificacoes por especialidade...")
        classes: Dict[str, Set[str]] = {}
        for cid in CLASSIFICACOES:
            p = baixar(cli, f"en_product3_{cid}", args.refresh)
            if not p:
                continue
            try:
                raiz = ET.parse(p).getroot()
            except ET.ParseError:
                p.unlink(missing_ok=True)
                continue
            nome_cl = raiz.findtext(".//Classification/Name") or ""
            cat = categoria_de(nome_cl)
            if not cat:
                continue
            for d in raiz.findall(".//Disorder"):
                code = d.findtext("OrphaCode")
                if code:
                    classes.setdefault(code, set()).add(cat)
        print(f"  {len(classes)} doencas classificadas em "
              f"{len({c for cs in classes.values() for c in cs})} categorias")

    # ---- nomes em portugues e referencias externas
    print("Lendo a nomenclatura em portugues...")
    pt: Dict[str, Dict[str, Any]] = {}
    for d in ET.parse(alvos["pt_product1"]).getroot().findall(".//Disorder"):
        code = d.findtext("OrphaCode")
        if not code:
            continue
        historica = any((f.findtext("Label") or "") == "Historical entity"
                        for f in d.findall(".//DisorderFlag"))
        refs = {}
        for r in d.findall(".//ExternalReference"):
            src, val = r.findtext("Source"), r.findtext("Reference")
            if src and val:
                refs.setdefault(src, val)
        pt[code] = {
            "name": d.findtext("Name"),
            "tipo": d.findtext(".//DisorderType/Name") or "",
            "historica": historica,
            "synonyms": [s.text for s in d.findall(".//SynonymList/Synonym") if s.text][:5],
            "omim": refs.get("OMIM"), "mondo": refs.get("MONDO"),
            "icd10": refs.get("ICD-10"), "umls": refs.get("UMLS"),
        }
    print(f"  {len(pt)} entradas")

    # ---- heranca e prevalencia
    print("Lendo heranca e prevalencia...")
    heranca: Dict[str, List[str]] = {}
    for d in ET.parse(alvos["en_product9_ages"]).getroot().findall(".//Disorder"):
        code = d.findtext("OrphaCode")
        if not code:
            continue
        cods = [HERANCA[t.text] for t in d.findall(".//TypeOfInheritance/Name")
                if t.text in HERANCA]
        if cods:
            heranca[code] = sorted(set(cods))

    prev: Dict[str, str] = {}
    for d in ET.parse(alvos["en_product9_prev"]).getroot().findall(".//Disorder"):
        code = d.findtext("OrphaCode")
        if not code:
            continue
        melhor = None
        for p in d.findall(".//Prevalence"):
            if (p.findtext(".//PrevalenceType/Name") or "") == "Point prevalence":
                cls = p.findtext(".//PrevalenceClass/Name")
                if cls:
                    melhor = cls
                    break
        if melhor:
            prev[code] = melhor

    # ---- fenotipos HPO
    print("Lendo a traducao oficial do HPO...")
    hpo_pt: Dict[str, str] = {}
    tsv = CACHE / "hp-pt.babelon.tsv"
    if args.refresh or not tsv.exists():
        try:
            with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as c2:
                tsv.write_bytes(c2.get(HPO_PT).raise_for_status().content)
        except httpx.HTTPError as e:
            print(f"  traducao do HPO indisponivel ({e}); os termos ficam em ingles",
                  file=sys.stderr)
    if tsv.exists():
        for i, linha in enumerate(tsv.read_text(encoding="utf-8").splitlines()):
            if i == 0:
                continue
            col = linha.split("\t")
            # subject_id, predicate_id, source_value, translation_value
            if len(col) >= 6 and col[3] == "rdfs:label" and col[5].strip():
                hpo_pt[col[2]] = col[5].strip()
    print(f"  {len(hpo_pt)} termos com traducao oficial")

    # Traducao do GenVar para os termos que o HPO ainda nao traduziu. Fica
    # SEPARADA da oficial de proposito: a origem de cada termo e rastreavel, e
    # quando o HPO publicar a traducao oficial de algum deles, a oficial passa
    # a valer sozinha sem ninguem precisar apagar nada daqui.
    propria = Path(__file__).parent / "traducoes" / "hpo_pt_br.tsv"
    hpo_genvar: Dict[str, str] = {}
    if propria.exists():
        for i, linha in enumerate(propria.read_text(encoding="utf-8").splitlines()):
            if i == 0 or not linha.strip():
                continue
            col = linha.split("\t")
            if len(col) >= 3 and col[2].strip() and col[0] not in hpo_pt:
                hpo_genvar[col[0]] = col[2].strip()
    print(f"  {len(hpo_genvar)} termos com traducao do GenVar")

    print("Lendo fenotipos HPO...")
    hpo: Dict[str, List[str]] = {}
    for d in ET.parse(alvos["en_product4"]).getroot().findall(".//Disorder"):
        code = d.findtext("OrphaCode")
        if not code:
            continue
        termos = []
        for a in d.findall(".//HPODisorderAssociation"):
            freq = a.findtext(".//HPOFrequency/Name") or ""
            termo = a.findtext(".//HPOTerm")
            hp_id = a.findtext(".//HPOId")
            # so o que e frequente: uma doenca rara lista dezenas de sinais e
            # a cauda de "ocasional" nao ajuda a reconhecer o quadro
            if termo and freq.startswith(("Obligate", "Very frequent", "Frequent")):
                chave = hp_id or ""
                termos.append(hpo_pt.get(chave) or hpo_genvar.get(chave) or termo)
        if termos:
            hpo[code] = termos[:12]

    # ---- genes
    print("Lendo genes causais...")
    saida: List[Dict[str, Any]] = []
    for d in ET.parse(alvos["en_product6"]).getroot().findall(".//Disorder"):
        code = d.findtext("OrphaCode")
        meta = pt.get(code)
        if not code or not meta or meta["historica"] or not meta["name"]:
            continue
        causais, susceptibilidade = [], []
        for a in d.findall(".//DisorderGeneAssociation"):
            sym = a.findtext(".//Gene/Symbol")
            tipo = a.findtext(".//DisorderGeneAssociationType/Name") or ""
            if not sym:
                continue
            (causais if tipo in TIPOS_CAUSAIS else susceptibilidade).append(sym)
        if not causais:
            continue
        inh = heranca.get(code, [])
        saida.append({
            "id": f"orpha-{code}",
            "source": "orphanet",
            "orphanet": code,
            "name": meta["name"],
            "synonyms": meta["synonyms"],
            "category": primaria(classes.get(code, set())),
            "categories": sorted(classes.get(code, set())),
            "inheritance": inh[0] if len(inh) == 1 else ("MF" if not inh else inh[0]),
            "inheritance_all": inh,
            "genes": sorted(set(causais)),
            "genes_susceptibility": sorted(set(susceptibilidade)),
            "hpo": hpo.get(code, []),
            "prevalence": prev.get(code, ""),
            "omim": meta["omim"], "mondo": meta["mondo"],
            "icd10": meta["icd10"], "umls": meta["umls"],
        })

    saida.sort(key=lambda d: d["name"])
    SAIDA.write_text(json.dumps({
        "source": "Orphanet (Orphadata)",
        "license": "CC BY 4.0",
        "url": "https://www.orphadata.com",
        "generated_at": _agora(),
        "diseases": saida,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    genes = {g for d in saida for g in d["genes"]}
    com_cat = sum(1 for d in saida if d["category"] != "Outros")
    print(f"\n{len(saida)} doencas com gene causal, {len(genes)} genes distintos")
    print(f"  com categoria: {com_cat} ({round(com_cat/len(saida)*100)}%)")
    print(f"  com heranca:   {sum(1 for d in saida if d['inheritance_all'])}")
    print(f"  com HPO:       {sum(1 for d in saida if d['hpo'])}")
    print(f"  com prevalencia: {sum(1 for d in saida if d['prevalence'])}")
    print(f"escrito em {SAIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
