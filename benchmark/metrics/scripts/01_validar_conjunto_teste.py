"""
Valida o conjunto de teste padronizado (MVP) do GenVar Dashboard.

Este script consulta o backend local para cada um dos 10 genes e das 10 variantes
do conjunto e verifica duas coisas: se a resposta retorna com sucesso (codigo HTTP 200)
e se traz os dados esperados (total de variantes para genes, gene e classificacao clinica
para variantes). Serve para confirmar que todos os alvos escolhidos tem cobertura nas
fontes antes de rodar a bateria de benchmarks.

Pre requisito: backend em execucao em http://localhost:8000.
Uso: python 01_validar_conjunto_teste.py
"""
import json
import urllib.request

BACKEND = "http://localhost:8000"

# Os mesmos 10 genes e 10 variantes usados em todas as suites de benchmark.
GENES = ["MLH1", "HBB", "MSH2", "VHL", "LDLR", "RB1", "BRCA1", "TP53", "CFTR", "PAH"]
VARIANTES = [
    "rs334", "rs1800562", "rs6025", "rs1799853", "rs429358",
    "rs1801133", "rs1042522", "rs5030858", "rs28929474", "rs121913529",
]


def consultar(caminho):
    # Faz uma requisicao GET ao backend e devolve o codigo HTTP e o corpo em JSON.
    url = f"{BACKEND}{caminho}"
    try:
        with urllib.request.urlopen(url, timeout=60) as resposta:
            return resposta.status, json.load(resposta)
    except urllib.error.HTTPError as erro:
        return erro.code, None
    except Exception:
        return 0, None


def validar_genes():
    # Para cada gene, imprime o codigo de resposta e o total de variantes retornado.
    print("Genes:")
    for gene in GENES:
        codigo, dados = consultar(f"/api/gene/{gene}")
        total = dados.get("total_variants", "indisponivel") if dados else "indisponivel"
        print(f"  {gene}: HTTP {codigo}, total de variantes = {total}")


def validar_variantes():
    # Para cada variante, imprime o codigo, o gene mapeado e a classificacao clinica.
    print("Variantes:")
    for rsid in VARIANTES:
        codigo, dados = consultar(f"/api/variant/{rsid}")
        gene = dados.get("gene_symbol", "indisponivel") if dados else "indisponivel"
        sig = dados.get("clinvar_significance", "indisponivel") if dados else "indisponivel"
        print(f"  {rsid}: HTTP {codigo}, gene = {gene}, classificacao = {sig}")


if __name__ == "__main__":
    validar_genes()
    validar_variantes()
