#!/usr/bin/env python3
"""
Latencia por rota, com cache frio e com cache quente.

PROTOCOLO. Herdado do benchmark da versao 2.0 para que a figura "2.0 contra 3.0"
compare duas medidas da mesma coisa: cache limpo antes de cada repeticao fria,
intervalo entre repeticoes, e uma bateria quente logo em seguida sobre a mesma
chave. O que muda e a largura: a 2.0 media duas familias de rota, esta mede
vinte.

O N FRIO E MENOR QUE O QUENTE, DE PROPOSITO. Uma repeticao quente custa uma
consulta ao Redis. Uma repeticao fria custa o que a rota gastar em chamadas a
bases publicas, que a suite de requisicoes mediu entre 2 e 11 por consulta. Com
N=12 frio em dez alvos de nove familias, esta suite sozinha passaria de tres mil
chamadas ao Ensembl, ao gnomAD e ao ClinVar por corrida, e o proprio uso justo
dessas bases e por IP: a varredura derruba o acesso do projeto inteiro e o
benchmark deixa de ser re-executavel na revisao do trabalho. Entao rota que sai
para a rede tem N=3 frio em cinco alvos, e rota que nao sai tem N=8. O intervalo
de confianca da mediana acompanha cada linha para que a perda de precisao dessa
escolha fique visivel em vez de implicita.

AS ROTAS DE ESCRITA NAO EXISTEM: a API e so de leitura, entao nao ha efeito de
ordem entre repeticoes alem do cache, que e justamente o que se controla.

Uso:
  python3 benchmark-final/servidor/latencia.py --url http://localhost:8000 --rotulo local
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ))

import comum  # noqa: E402
import alvos  # noqa: E402
import httpx  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

console = Console()

N_FRIO_REDE = 3
N_FRIO_LOCAL = 8
N_QUENTE = 20
PAUSA_FRIA_S = 1.0
ALVOS_REDE = 5

# Familias que saem para bases publicas quando o cache erra. A lista decide
# quantas repeticoes frias cada rota recebe, e por isso precisa existir ANTES de
# medir. Ela nao decide a classificacao publicada: essa e derivada da contagem
# medida em `requisicoes.csv` por `recomputar.py`, e a divergencia entre as duas
# ja apareceu uma vez, com `/api/sources` e as duas rotas de saude, que saem
# para a rede e estavam de fora daqui.
FAMILIAS_DE_REDE = {"gene", "variante", "doenca", "painel", "escore"}

PREFIXOS = ("gene:", "genevars:", "genephen:", "variant:", "disease:",
            "diseasevars:", "panel:", "pgs:")


def limpa_cache(url_redis):
    try:
        import redis
        r = redis.Redis.from_url(url_redis)
        n = 0
        for p in PREFIXOS:
            chaves = list(r.scan_iter(match=f"{p}*", count=2000))
            if chaves:
                n += r.delete(*chaves)
        return n
    except Exception as e:
        console.print(f"  [red]cache nao limpo: {e}[/red]")
        return -1


async def _uma(cliente, base, caminho):
    t0 = time.perf_counter()
    try:
        r = await cliente.get(base + caminho, timeout=180.0)
        return (time.perf_counter() - t0) * 1000, r.status_code, len(r.content)
    except Exception:
        return (time.perf_counter() - t0) * 1000, 0, 0


async def main():
    ap = argparse.ArgumentParser(description="Latencia por rota, frio e quente")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--redis", default=os.environ.get("REDIS_URL", "redis://localhost:6379"))
    ap.add_argument("--rotulo", default="local")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    ap.add_argument("--alvos-rede", type=int, default=ALVOS_REDE,
                    help="alvos por rota de rede; menor reduz a carga sobre as fontes")
    ap.add_argument("--familias", default=None,
                    help="mede so estas familias, separadas por virgula")
    ap.add_argument("--anexar", action="store_true",
                    help="acrescenta ao CSV existente em vez de sobrescrever, para a "
                         "medicao poder ser feita em blocos")
    args = ap.parse_args()
    saida = Path(args.saida)

    todos = alvos.rotas()
    # Rota de rede entra com menos alvos; o resto entra inteiro.
    selecao = []
    vistos = {}
    for nome, caminho, familia in todos:
        vistos[nome] = vistos.get(nome, 0) + 1
        if familia in FAMILIAS_DE_REDE and vistos[nome] > args.alvos_rede:
            continue
        if args.familias and familia not in args.familias.split(","):
            continue
        selecao.append((nome, caminho, familia))

    console.print(f"\n[bold]Latencia por rota[/bold]  ({args.rotulo})")
    console.print(f"  {len(selecao)} alvos, frio N={N_FRIO_REDE} em rota de rede e "
                  f"N={N_FRIO_LOCAL} nas demais, quente N={N_QUENTE}\n")

    bruto, resumos = [], []
    async with httpx.AsyncClient() as cliente:
        for i, (nome, caminho, familia) in enumerate(selecao, 1):
            de_rede = familia in FAMILIAS_DE_REDE
            n_frio = N_FRIO_REDE if de_rede else N_FRIO_LOCAL

            frios, status = [], set()
            for _ in range(n_frio):
                limpa_cache(args.redis)
                await asyncio.sleep(PAUSA_FRIA_S)
                ms, st, tam = await _uma(cliente, args.url, caminho)
                status.add(st)
                if st == 200:
                    frios.append(ms)
                bruto.append({"rotulo": args.rotulo, "nome": nome, "caminho": caminho,
                              "familia": familia, "estado": "frio", "ms": round(ms, 3),
                              "status": st, "bytes": tam})

            quentes, tam_q = [], 0
            for _ in range(N_QUENTE):
                ms, st, tam = await _uma(cliente, args.url, caminho)
                status.add(st)
                if st == 200:
                    quentes.append(ms)
                    tam_q = tam
                bruto.append({"rotulo": args.rotulo, "nome": nome, "caminho": caminho,
                              "familia": familia, "estado": "quente", "ms": round(ms, 3),
                              "status": st, "bytes": tam})

            rf, rq = comum.resumo(frios), comum.resumo(quentes)
            resumos.append({
                "rotulo": args.rotulo, "nome": nome, "caminho": caminho, "familia": familia,
                "de_rede": de_rede, "status": ";".join(str(s) for s in sorted(status)),
                "bytes": tam_q,
                **{f"frio_{k}": v for k, v in rf.items()},
                **{f"quente_{k}": v for k, v in rq.items()},
                "ganho_cache": round(rf["mediana"] / rq["mediana"], 2)
                if rf["mediana"] and rq["mediana"] else None,
            })
            g = resumos[-1]["ganho_cache"]
            console.print(f"  {i:>3}/{len(selecao)} {nome:<24} "
                          f"frio {rf['mediana'] or 0:8.1f} ms   "
                          f"quente {rq['mediana'] or 0:6.1f} ms   "
                          f"{'x' + str(g) if g else '—'}")

    # Em blocos, o CSV bruto acumula: o resumo e sempre refeito por
    # `recomputar.py` sobre o bruto inteiro, entao acrescentar aqui e suficiente.
    if args.anexar and (saida / "latencia_bruto.csv").exists():
        import csv as _csv
        with (saida / "latencia_bruto.csv").open(encoding="utf-8") as fh:
            antigo = list(_csv.DictReader(fh))
        bruto = antigo + bruto
    comum.grava_csv(saida / "latencia_bruto.csv", bruto)
    comum.grava_csv(saida / "latencia.csv", resumos)
    comum.grava_json(saida / "ambiente.json", comum.ambiente(args.rotulo))

    t = Table(title=f"Latencia mediana por familia ({args.rotulo})")
    for c in ("Familia", "Alvos", "Frio", "Quente", "Ganho"):
        t.add_column(c, justify="left" if c == "Familia" else "right")
    for familia in dict.fromkeys(f for _, _, f in selecao):
        # Rota que nao devolveu 200 em nenhuma repeticao entra no CSV com resumo
        # vazio e fica FORA da tabela: ela nao tem mediana, e ordenar None com
        # float derrubava a suite depois de os dados ja terem sido gravados.
        ls = [r for r in resumos if r["familia"] == familia
              and r["frio_mediana"] is not None and r["quente_mediana"] is not None]
        if not ls:
            continue
        f = sorted(r["frio_mediana"] for r in ls)[len(ls) // 2]
        q = sorted(r["quente_mediana"] for r in ls)[len(ls) // 2]
        t.add_row(familia, str(len(ls)), f"{f:.1f} ms", f"{q:.1f} ms",
                  f"{f / q:.0f}x" if q else "—")
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
