#!/usr/bin/env python3
"""ClinGen (validade gene-doenca) e CPIC (farmacogenomica), para o modulo de VCF.

Duas camadas que respondem perguntas diferentes e nenhuma delas e "esta variante
e patogenica".

CLINGEN responde a pergunta ANTERIOR a qualquer classificacao: este gene e mesmo
um gene de doenca? A curadoria vai de Definitive a Refuted, e a distincao muda a
leitura de um achado. Variante patogenica num gene com validade Limited nao e
achado forte, e sim achado num gene sobre o qual o campo ainda nao concorda. O
mesmo arquivo traz o modo de heranca curado (MOI), que diz se um heterozigoto
isolado explica ou nao o quadro.

CPIC responde o que fazer com variante de resposta a farmaco. E aqui esta o
LIMITE, declarado porque ele e estrutural e nao falta de esforco: a chamada de
alelo estrela de CYP2D6 e CYP2C19 exige FASE e NUMERO DE COPIAS, e um VCF de
variante curta nao carrega nenhum dos dois. Nao da para dizer "*1/*4" a partir
deste arquivo. O que da, e e util, e dizer que aquele rsID participa da definicao
dos alelos estrela de um gene com diretriz publicada, e para quais farmacos essa
diretriz existe. Prescricao continua sendo do medico, com genotipagem propria.

  clingen.json.gz   gene -> curadorias (doenca, heranca, classificacao)
  cpic.json.gz      rsID -> gene, alelos que ele define, farmacos com diretriz
"""
import csv
import gzip
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parent.parent.parent
CACHE = Path(__file__).parent / ".cache"
CLINGEN_CSV = CACHE / "clingen" / "gene-validity.csv"
SAIDA = RAIZ / "frontend" / "public" / "data" / "farmaco"

URL_CLINGEN = "https://search.clinicalgenome.org/kb/gene-validity/download"
API_CPIC = "https://api.cpicpgx.org/v1"

# Ordem de forca da curadoria. Refuted e Disputed NAO sao ausencia de dado: sao
# afirmacoes de que a associacao nao se sustenta, e valem mais que silencio.
FORCA = {
    "Definitive": 6, "Strong": 5, "Moderate": 4, "Limited": 3,
    "No Known Disease Relationship": 2, "Disputed": 1, "Refuted": 0,
}

HERANCA = {
    "AD": "autossômica dominante",
    "AR": "autossômica recessiva",
    "XL": "ligada ao X",
    "XLD": "ligada ao X dominante",
    "XLR": "ligada ao X recessiva",
    "MT": "mitocondrial",
    "SD": "digênica",
    "UD": "indefinida",
}

# Nivel CPIC A e B sao os que tem recomendacao de conduta. C e D existem e nao
# mudam prescricao, entao entram marcados mas nao contam como acionaveis.
NIVEL_ACIONAVEL = {"A", "A/B", "B", "B/C"}


def clingen():
    if not CLINGEN_CSV.exists():
        sys.exit(f"falta {CLINGEN_CSV}\n  baixe com: curl -sSL -o {CLINGEN_CSV} {URL_CLINGEN}")
    por_gene = defaultdict(list)
    with open(CLINGEN_CSV, newline="", encoding="utf-8") as fh:
        linhas = list(csv.reader(fh))
    # O arquivo abre com um bloco de cabecalho decorado por linhas de '+++'. A
    # linha de colunas e a que comeca com GENE SYMBOL.
    inicio = next(i for i, l in enumerate(linhas) if l and l[0] == "GENE SYMBOL")
    for l in linhas[inicio + 1:]:
        if not l or not l[0] or l[0].startswith("+"):
            continue
        gene, _hgnc, doenca, mondo, moi, _sop, classe, url, data, gcep = (l + [""] * 10)[:10]
        por_gene[gene].append({
            "doenca": doenca,
            "mondo": mondo,
            "heranca": HERANCA.get(moi, moi),
            "heranca_sigla": moi,
            "classificacao": classe,
            "forca": FORCA.get(classe, -1),
            "data": data,
            "painel": gcep,
            "url": url,
        })
    for g in por_gene:
        por_gene[g].sort(key=lambda c: -c["forca"])
    return dict(por_gene)


def buscar(cliente, caminho, **params):
    """Le uma tabela inteira da API do CPIC, em paginas de 1000."""
    out, inicio = [], 0
    while True:
        r = cliente.get(f"{API_CPIC}/{caminho}", params={**params, "limit": 1000, "offset": inicio})
        r.raise_for_status()
        bloco = r.json()
        out.extend(bloco)
        if len(bloco) < 1000:
            return out
        inicio += 1000
        time.sleep(0.2)


def cpic():
    with httpx.Client(timeout=60.0) as c:
        locais = buscar(c, "sequence_location", select="id,name,genesymbol,dbsnpid,chromosomelocation")
        # allele_location_value aponta para allele_definition, nao para allele.
        # A funcao clinica mora em allele, ligada pela mesma definicao: sao tres
        # tabelas para uma pergunta, e pular a do meio devolve 400.
        valores = buscar(c, "allele_location_value", select="alleledefinitionid,locationid,variantallele")
        definicoes = buscar(c, "allele_definition", select="id,genesymbol,name")
        alelos = buscar(c, "allele", select="id,genesymbol,name,clinicalfunctionalstatus,definitionid")
        pares = buscar(c, "pair", select="genesymbol,drugid,cpiclevel,guidelineid")
        drogas = buscar(c, "drug", select="drugid,name")
        guias = buscar(c, "guideline", select="id,name,url")

    nome_droga = {d["drugid"]: d["name"] for d in drogas}
    guia = {g["id"]: {"nome": g["name"], "url": g["url"]} for g in guias}
    definicao = {d["id"]: d for d in definicoes}
    funcao_por_definicao = {a["definitionid"]: a.get("clinicalfunctionalstatus")
                            for a in alelos if a.get("definitionid")}

    # Farmacos por gene, so os que tem diretriz publicada.
    por_gene = defaultdict(list)
    for p in pares:
        nome = nome_droga.get(p["drugid"])
        if not nome:
            continue
        g = guia.get(p.get("guidelineid")) if p.get("guidelineid") else None
        por_gene[p["genesymbol"]].append({
            "farmaco": nome,
            "nivel": p.get("cpiclevel"),
            "acionavel": p.get("cpiclevel") in NIVEL_ACIONAVEL,
            "diretriz": g,
        })
    for g in por_gene:
        por_gene[g].sort(key=lambda x: (not x["acionavel"], x["farmaco"]))

    # Alelos estrela definidos por cada posicao.
    por_local = defaultdict(list)
    for v in valores:
        d = definicao.get(v["alleledefinitionid"])
        if d:
            por_local[v["locationid"]].append({
                "alelo": d["name"],
                "base": v.get("variantallele"),
                "funcao": funcao_por_definicao.get(d["id"]),
            })

    por_rsid = {}
    for l in locais:
        rs = l.get("dbsnpid")
        if not rs or not rs.startswith("rs"):
            continue
        gene = l["genesymbol"]
        definidos = por_local.get(l["id"], [])
        por_rsid[rs] = {
            "gene": gene,
            "nome": l.get("name"),
            "hgvs": l.get("chromosomelocation"),
            # No maximo oito: um rsID de CYP2D6 participa de dezenas de alelos e
            # a lista inteira nao cabe numa celula de tabela.
            "alelos": definidos[:8],
            "alelos_total": len(definidos),
            "farmacos": por_gene.get(gene, []),
        }

    return por_rsid, dict(por_gene)


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)

    cg = clingen()
    with gzip.open(SAIDA / "clingen.json.gz", "wt", compresslevel=9, encoding="utf-8") as fh:
        json.dump({
            "fonte": "ClinGen Gene-Disease Validity",
            "url": "https://search.clinicalgenome.org/kb/gene-validity",
            "licenca": "CC0",
            "forca": FORCA,
            "genes": cg,
        }, fh, separators=(",", ":"), ensure_ascii=False)

    rsid, genes = cpic()
    with gzip.open(SAIDA / "cpic.json.gz", "wt", compresslevel=9, encoding="utf-8") as fh:
        json.dump({
            "fonte": "CPIC (Clinical Pharmacogenetics Implementation Consortium)",
            "url": "https://cpicpgx.org",
            "licenca": "CC BY-SA 4.0",
            "limite": (
                "Chamada de alelo estrela exige fase e número de cópias, que um VCF "
                "de variante curta não carrega. Esta camada diz que o rsID participa "
                "da definição de alelos estrela do gene e quais fármacos têm diretriz; "
                "não determina o diplótipo nem substitui genotipagem farmacogenética."
            ),
            "por_rsid": rsid,
            "por_gene": genes,
        }, fh, separators=(",", ":"), ensure_ascii=False)

    print(f"ClinGen: {len(cg)} genes, {sum(len(v) for v in cg.values())} curadorias")
    print(f"CPIC: {len(rsid)} rsID, {len(genes)} genes com fármaco")
    for f in sorted(SAIDA.glob("*.json.gz")):
        print(f"  {f.name}: {f.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
