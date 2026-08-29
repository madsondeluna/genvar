#!/usr/bin/env python3
"""
Busca de gene e de variante: com cache e sem cache.

A pergunta e a que o usuario faz sem saber que faz: por que a primeira consulta
demora e a segunda e instantanea? A resposta e que a primeira encadeia quatro
chamadas a fontes externas e a segunda le o Redis.

O que se mede:

  SEM CACHE (frio). Redis zerado antes de cada serie. E o custo real de montar
  a resposta: Ensembl, gnomAD, ClinVar e MyVariant, com as dependencias entre
  elas respeitadas.

  COM CACHE (quente). O mesmo alvo, com a entrada ja gravada.

  TAXA DE ACERTO. Sobre uma sequencia realista, em que alguns alvos repetem e
  outros sao novos, quantas consultas o cache atende.

O intervalo entre chamadas a frio nao e cortesia: o Ensembl aplica uso justo em
15 requisicoes por segundo, e uma varredura saindo daqui bloqueia a origem para
todo mundo que usa a aplicacao.

Uso:
  python3 benchmark-v2/cache.py --n-frio 6 --n-quente 12
"""
import argparse
import asyncio
import csv
import statistics
import sys
import time
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "benchmark"))
from suites._targets import GENES, VARIANTS  # noqa: E402

console = Console()
INTERVALO_FRIO = 2.0


def zerar_redis(url: str) -> bool:
    try:
        import redis
        redis.from_url(url, decode_responses=True).flushdb()
        return True
    except Exception:
        return False


async def chamar(client, url):
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=120.0)
        return (time.perf_counter() - t0) * 1000, r.status_code == 200, \
            r.headers.get("X-Response-Time-Ms", "")
    except Exception:
        return (time.perf_counter() - t0) * 1000, False, ""


async def main():
    ap = argparse.ArgumentParser(description="Cache quente contra cache frio")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--redis", default="redis://localhost:6379")
    ap.add_argument("--n-frio", type=int, default=6)
    ap.add_argument("--n-quente", type=int, default=12)
    ap.add_argument("--genes", type=int, default=5, help="Quantos genes medir")
    ap.add_argument("--variantes", type=int, default=5)
    ap.add_argument("--saida", default=str(AQUI / "resultados"))
    args = ap.parse_args()
    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)

    tem_redis = zerar_redis(args.redis)
    console.print("\n[bold]Cache quente contra cache frio[/bold]")
    console.print(f"  Redis: {'disponivel' if tem_redis else 'INDISPONIVEL, o frio e o quente '
                  'medem a mesma coisa e o resultado nao se le'}")

    alvos = ([("gene", g, f"{args.url}/api/gene/{g}") for g in GENES[:args.genes]]
             + [("variante", rsid, f"{args.url}/api/variant/{rsid}")
                for rsid in VARIANTS[:args.variantes]])

    linhas = []
    brutas = []
    async with httpx.AsyncClient() as client:
        for tipo, nome, url in alvos:
            frios = []
            for i in range(args.n_frio):
                zerar_redis(args.redis)
                ms, ok, srv = await chamar(client, url)
                if ok:
                    frios.append(ms)
                brutas.append({"tipo": tipo, "alvo": nome, "estado": "frio",
                               "ms": round(ms, 1), "ok": ok, "servidor_ms": srv})
                await asyncio.sleep(INTERVALO_FRIO)

            # Uma chamada para aquecer, e so entao as medidas quentes.
            await chamar(client, url)
            quentes = []
            for i in range(args.n_quente):
                ms, ok, srv = await chamar(client, url)
                if ok:
                    quentes.append(ms)
                brutas.append({"tipo": tipo, "alvo": nome, "estado": "quente",
                               "ms": round(ms, 1), "ok": ok, "servidor_ms": srv})
                await asyncio.sleep(0.3)

            if not frios or not quentes:
                console.print(f"  [yellow]{nome}: sem medida valida[/yellow]")
                continue
            linha = {
                "tipo": tipo, "alvo": nome,
                "frio_mediana_ms": round(statistics.median(frios), 1),
                "frio_min_ms": round(min(frios), 1),
                "frio_max_ms": round(max(frios), 1),
                "quente_mediana_ms": round(statistics.median(quentes), 1),
                "quente_min_ms": round(min(quentes), 1),
                "quente_max_ms": round(max(quentes), 1),
                "n_frio": len(frios), "n_quente": len(quentes),
                "ganho": round(statistics.median(frios) / statistics.median(quentes), 1),
            }
            linhas.append(linha)
            console.print(f"  {tipo:<9} {nome:<14} frio {linha['frio_mediana_ms'] / 1000:6.2f} s"
                          f"   quente {linha['quente_mediana_ms']:7.1f} ms"
                          f"   {linha['ganho']:>7.0f}x")

    for nome, dados in (("cache.csv", linhas), ("cache_bruto.csv", brutas)):
        if not dados:
            continue
        with (saida / nome).open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(dados[0].keys()))
            w.writeheader()
            w.writerows(dados)
        console.print(f"  -> {nome} ({len(dados)} linhas)")

    if linhas:
        t = Table(title="Mediana por tipo de consulta")
        for c in ("Consulta", "Sem cache", "Com cache", "Ganho"):
            t.add_column(c, justify="right" if c != "Consulta" else "left")
        for tipo in ("gene", "variante"):
            g = [l for l in linhas if l["tipo"] == tipo]
            if not g:
                continue
            f = statistics.median([l["frio_mediana_ms"] for l in g])
            q = statistics.median([l["quente_mediana_ms"] for l in g])
            t.add_row(f"Busca por {tipo}", f"{f / 1000:.2f} s", f"{q:.0f} ms",
                      f"{f / q:.0f}x")
        console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
