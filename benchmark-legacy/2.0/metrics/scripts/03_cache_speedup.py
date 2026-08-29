"""
Calcula a aceleracao por cache a partir dos dados brutos de latencia.

A suite de latencia esvazia o cache uma vez no inicio da fase fria e depois consulta cada
alvo 12 vezes. So a chamada mais lenta de cada alvo e genuinamente sem cache; as outras ja
leem do cache. Por isso, a linha de base fria correta e o valor maximo da fase fria, e nao
a media, que mistura uma chamada fria com onze quentes e subestima o ganho.

Este script le results/latency_stats.csv e imprime, para cada alvo, o tempo sem cache
(coluna max da fase fria), o tempo com cache (coluna mean da fase quente) e a razao entre
os dois, que e o fator de aceleracao reportado.

Uso: python 03_cache_speedup.py [caminho_para_latency_stats.csv]
"""
import csv
import sys


def carregar(caminho):
    # Le o CSV e separa os tempos frios (max) e quentes (mean) por alvo.
    frio, quente = {}, {}
    with open(caminho, newline="") as arquivo:
        for linha in csv.DictReader(arquivo):
            chave = f"{linha['endpoint']}/{linha['target']}"
            if linha["phase"] == "cold":
                frio[chave] = float(linha["max"])
            elif linha["phase"] == "warm":
                quente[chave] = float(linha["mean"])
    return frio, quente


if __name__ == "__main__":
    caminho = sys.argv[1] if len(sys.argv) > 1 else "../data/latency_stats.csv"
    frio, quente = carregar(caminho)

    # Ordena do maior para o menor ganho e imprime uma tabela simples.
    linhas = []
    for chave in frio:
        if chave in quente and quente[chave] > 0:
            linhas.append((chave, frio[chave], quente[chave], frio[chave] / quente[chave]))
    linhas.sort(key=lambda item: item[3], reverse=True)

    print(f"{'alvo':22} {'sem_cache_ms':>14} {'com_cache_ms':>14} {'aceleracao':>12}")
    for chave, f, q, razao in linhas:
        print(f"{chave:22} {f:14.1f} {q:14.2f} {razao:11.0f}x")
