"""
Extrai as coordenadas genomicas (GRCh38) das 10 variantes do conjunto de teste.

A suite de comparacao e a de payload simulam a consulta manual ao gnomAD, que exige a
posicao no formato cromossomo, posicao, base de referencia e base alterada. Este script
busca esses valores no backend (que ja resolve a variante na montagem GRCh38) e imprime
o dicionario pronto para ser colado no modulo compartilhado suites/_targets.py.

A correcao foi necessaria porque as coordenadas antigas estavam na montagem GRCh37, o que
fazia a chamada manual ao gnomAD retornar vazio.

Pre requisito: backend em execucao em http://localhost:8000.
Uso: python 02_extrair_coordenadas.py
"""
import json
import urllib.request

BACKEND = "http://localhost:8000"

VARIANTES = [
    "rs334", "rs1800562", "rs6025", "rs1799853", "rs429358",
    "rs1801133", "rs1042522", "rs5030858", "rs28929474", "rs121913529",
]


def coordenada(rsid):
    # Consulta a variante e devolve cromossomo, posicao, ref, alt e o gene mapeado.
    url = f"{BACKEND}/api/variant/{rsid}"
    with urllib.request.urlopen(url, timeout=60) as resposta:
        d = json.load(resposta)
    return d["chromosome"], d["position"], d.get("ref_allele"), d.get("alt_allele"), d.get("gene_symbol")


if __name__ == "__main__":
    # Imprime no formato de dicionario Python usado em suites/_targets.py.
    print("VARIANT_COORDS = {")
    for rsid in VARIANTES:
        chrom, pos, ref, alt, gene = coordenada(rsid)
        print(f'    "{rsid}": ("{chrom}", {pos}, "{ref}", "{alt}"),  # {gene}')
    print("}")
