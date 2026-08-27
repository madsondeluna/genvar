#!/usr/bin/env python3
"""Painéis de genes e mapa de sinonimos, para o modulo de VCF filtrar por painel.

Duas saidas, e a segunda existe por causa de uma medicao. Cruzar os 4.308 genes
verdes do PanelApp direto contra os 20.033 simbolos do genes.json casa 96,2%:
sobram 162 genes de doenca de verdade (AARS, ADPRHL2, ATP5A1, C12orf65) que so
mudaram de nome. Um filtro de painel que perde 162 genes em silencio e pior que
filtro nenhum, porque ele le como "seu exoma esta limpo para epilepsia".

Com o mapa de simbolos anteriores e apelidos do HGNC a taxa vai a 98,6%. Os 61
que restam nao sao perda: sao RNA nao codificante, segmento de imunoglobulina e
gene mitocondrial, que nao estao no conjunto de 20.033 genes codificantes por
construcao. Eles saem listados na saida, para a tela poder dizer quantos genes
do painel nao tem como ser avaliados.

  paineis.json.gz    um painel por entrada, com os genes ja resolvidos
  simbolos.json.gz   apelido ou simbolo antigo -> simbolo aprovado
"""
import csv
import gzip
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
HGNC = Path(__file__).parent / ".cache" / "hgnc" / "hgnc_complete_set.txt"
PANELAPP = RAIZ / "backend" / "app" / "data" / "panelapp_panels.json"
GENES = RAIZ / "frontend" / "public" / "data" / "burden" / "genes.json"
SAIDA = RAIZ / "frontend" / "public" / "data" / "paineis"

URL_HGNC = "https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt"

# Genes acionaveis secundarios do ACMG (SF v3.2). Sao os que a diretriz manda
# relatar mesmo quando o exame foi pedido por outro motivo, porque existe conduta
# que muda desfecho. Entram como painel proprio, fora do PanelApp.
ACMG_SF = """
APC BMPR1A BRCA1 BRCA2 MLH1 MSH2 MSH6 MUTYH NF2 PALB2 PMS2 PTEN RB1 RET SDHAF2
SDHB SDHC SDHD SMAD4 STK11 TP53 TSC1 TSC2 VHL WT1 MAX TMEM127 BMPR2 ACVRL1 ENG
SMAD9 CAV1 KCNQ1 KCNH2 SCN5A APOB LDLR PCSK9 ACTA2 MYH11 COL3A1 FBN1 SMAD3
TGFBR1 TGFBR2 MYBPC3 MYH7 TNNT2 TNNI3 TPM1 MYL3 ACTC1 PRKAG2 GLA MYL2 LMNA
RYR2 PKP2 DSP DSC2 TMEM43 DSG2 CASQ2 TRDN RYR1 CACNA1S ATP7B BTD GAA HFE HNF1A
OTC RPE65 TTN TTR
""".split()


def carregar_hgnc():
    if not HGNC.exists():
        sys.exit(f"falta {HGNC}\n  baixe com: curl -sSL -o {HGNC} {URL_HGNC}")
    alias, aprovados = {}, set()
    with open(HGNC, newline="") as fh:
        for r in csv.DictReader(fh, delimiter="\t"):
            if r["status"] != "Approved":
                continue
            s = r["symbol"]
            aprovados.add(s)
            for campo in ("prev_symbol", "alias_symbol"):
                for a in (r[campo] or "").split("|"):
                    a = a.strip()
                    # O primeiro a reivindicar o apelido fica com ele. Apelido
                    # disputado por dois genes aprovados nao tem resposta certa,
                    # e escolher o ultimo seria escolher pela ordem do arquivo.
                    if a and a != s and a not in aprovados:
                        alias.setdefault(a, s)
    return alias, aprovados


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    alias, aprovados = carregar_hgnc()
    simbolos = set(json.loads(GENES.read_text())["symbols"])

    def resolver(x):
        if x in simbolos:
            return x
        a = alias.get(x)
        return a if a in simbolos else None

    pan = json.loads(PANELAPP.read_text())
    paineis = []
    for p in pan["panels"]:
        brutos = p.get("genes") or []
        resolvidos, fora = [], []
        for g in brutos:
            r = resolver(g)
            (resolvidos if r else fora).append(r or g)
        # Painel de um gene so e legitimo: 103 dos 425 do PanelApp sao assim,
        # e sao os de gene unico com doenca bem definida. Descarta-se apenas o
        # que ficou sem nenhum gene resolvivel.
        if not resolvidos:
            continue
        paineis.append({
            "id": p["id"],
            "nome": p["name"],
            "categoria": p.get("category"),
            "versao": p.get("version"),
            "heranca": p.get("inheritance"),
            "condicoes": (p.get("conditions") or [])[:6],
            "genes": sorted(set(resolvidos)),
            # Gene do painel sem correspondencia no conjunto codificante. Nao e
            # erro: e RNA nao codificante, imunoglobulina ou gene mitocondrial.
            "genes_sem_coordenada": sorted(set(fora)),
        })

    acmg = [g for g in ACMG_SF if resolver(g)]
    paineis.insert(0, {
        "id": "acmg-sf-v3.2",
        "nome": "ACMG SF v3.2 (achados secundários acionáveis)",
        "categoria": "Acionável",
        "versao": "3.2",
        "heranca": None,
        "condicoes": ["Achados secundários com conduta médica estabelecida"],
        "genes": sorted({resolver(g) for g in acmg}),
        "genes_sem_coordenada": sorted(set(ACMG_SF) - set(acmg)),
    })

    paineis.sort(key=lambda p: (p["id"] != "acmg-sf-v3.2", p["nome"]))

    with gzip.open(SAIDA / "paineis.json.gz", "wt", compresslevel=9, encoding="utf-8") as fh:
        json.dump({
            "fonte": "Genomics England PanelApp (genes verdes) e ACMG SF v3.2",
            "url": "https://panelapp.genomicsengland.co.uk",
            "licenca": "PanelApp: CC BY-SA 4.0",
            "resolucao_de_simbolo": "HGNC prev_symbol e alias_symbol",
            "paineis": paineis,
        }, fh, separators=(",", ":"), ensure_ascii=False)

    # So os apelidos que resolvem para um simbolo do conjunto: o resto e peso
    # morto no navegador.
    uteis = {a: s for a, s in alias.items() if s in simbolos and a not in simbolos}
    with gzip.open(SAIDA / "simbolos.json.gz", "wt", compresslevel=9, encoding="utf-8") as fh:
        json.dump({
            "fonte": "HGNC, hgnc_complete_set.txt",
            "url": URL_HGNC,
            "licenca": "CC0",
            "alias": uteis,
        }, fh, separators=(",", ":"), ensure_ascii=False)

    total = sum(len(p["genes"]) for p in paineis)
    fora = sum(len(p["genes_sem_coordenada"]) for p in paineis)
    print(f"{len(paineis)} paineis, {total} entradas de gene resolvidas, {fora} sem coordenada")
    print(f"{len(uteis)} sinonimos uteis")
    for f in SAIDA.glob("*.json.gz"):
        print(f"  {f.name}: {f.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
