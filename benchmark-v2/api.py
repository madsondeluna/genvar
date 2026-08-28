#!/usr/bin/env python3
"""
API: latencia de toda rota publica, com replicas suficientes para dizer algo.

E a suite que a pagina /status mostra ao vivo, medida com rigor: a pagina sonda
uma vez e reporta um numero, o que basta para dizer se a rota responde e nao
basta para dizer quanto ela custa. Uma unica medida de rota que depende de fonte
externa nao tem significado: o `overlap` do Ensembl mediu 2,3 s e 43 s para o
MESMO gene em chamadas seguidas.

Dez replicas por rota, e o numero nao e arbitrario: com dez, a mediana ja nao se
move com um valor extremo, e o intervalo entre o menor e o maior descreve a
variacao que o usuario de fato encontra. Media nao entra: uma pausa de coletor
ou um pico da fonte puxa a media e nao representa o caso tipico.

FRIO E QUENTE SAO MEDIDOS EM SEPARADO, e a distincao decide a leitura. Frio e o
custo de montar a resposta encadeando as fontes; quente e uma leitura do Redis.
Reportar so a media dos dois dá um numero que nao acontece nunca.

Saida: resultados/api_latencia.csv, resultados/api_bruto.csv
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
console = Console()

# As mesmas rotas que a sonda de /status cobre, lidas de la para as duas listas
# nao divergirem: uma rota nova na aplicacao tem de aparecer nas duas.
def _rotas():
    sys.path.insert(0, str(AQUI.parent / "backend"))
    try:
        from app.routers.health import ENDPOINTS
        return [(e["name"], e["path"], e["external"]) for e in ENDPOINTS]
    except Exception:
        return [("Health", "/health", False)]


def _flush(url: str) -> bool:
    try:
        import redis
        redis.from_url(url, decode_responses=True).flushdb()
        return True
    except Exception:
        return False


async def _uma(client, base, caminho, teto):
    t0 = time.perf_counter()
    try:
        r = await client.get(base + caminho, timeout=teto)
        return (time.perf_counter() - t0) * 1000, r.status_code, len(r.content)
    except Exception as e:
        return (time.perf_counter() - t0) * 1000, 0, 0


def _resumo(v):
    if not v:
        return {}
    s = sorted(v)
    return {
        "n": len(v),
        "mediana_ms": round(statistics.median(v), 1),
        "min_ms": round(s[0], 1),
        "max_ms": round(s[-1], 1),
        "p95_ms": round(s[min(len(s) - 1, int(len(s) * 0.95))], 1),
        # Desvio so com tres ou mais: com dois, `stdev` e uma diferenca dividida
        # por raiz de dois, e apresentar isso como dispersao e enfeite.
        "desvio_ms": round(statistics.stdev(v), 1) if len(v) > 2 else "",
    }


async def main():
    ap = argparse.ArgumentParser(description="Latencia da API, com replicas")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--redis", default="redis://localhost:6379")
    ap.add_argument("--replicas", type=int, default=10)
    ap.add_argument("--intervalo", type=float, default=1.0,
                    help="Segundos entre chamadas a frio, por respeito ao uso justo das fontes")
    ap.add_argument("--saida", default=str(AQUI / "resultados"))
    args = ap.parse_args()
    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)

    rotas = _rotas()
    tem_redis = _flush(args.redis)
    console.print("\n[bold]Latencia da API[/bold]")
    console.print(f"  rotas: {len(rotas)} | replicas: {args.replicas} | "
                  f"Redis: {'disponivel' if tem_redis else 'INDISPONIVEL, frio e quente medem o mesmo'}")

    linhas, brutas = [], []
    async with httpx.AsyncClient() as client:
        for nome, caminho, externa in rotas:
            teto = 90.0 if externa else 30.0
            frios, quentes = [], []

            for i in range(args.replicas):
                # Zera o cache ANTES de cada medida a frio: sem isso, da segunda
                # em diante o que se mede e o cache, e a serie inteira vira uma
                # media entre duas coisas diferentes.
                _flush(args.redis)
                ms, status, tam = await _uma(client, args.url, caminho, teto)
                brutas.append({"rota": nome, "caminho": caminho, "estado": "frio",
                               "replica": i + 1, "ms": round(ms, 1), "status": status,
                               "bytes": tam})
                if status == 200:
                    frios.append(ms)
                await asyncio.sleep(args.intervalo)

            await _uma(client, args.url, caminho, teto)  # aquece
            for i in range(args.replicas):
                ms, status, tam = await _uma(client, args.url, caminho, teto)
                brutas.append({"rota": nome, "caminho": caminho, "estado": "quente",
                               "replica": i + 1, "ms": round(ms, 1), "status": status,
                               "bytes": tam})
                if status == 200:
                    quentes.append(ms)
                await asyncio.sleep(0.2)

            f, q = _resumo(frios), _resumo(quentes)
            linha = {
                "rota": nome, "caminho": caminho,
                "externa": externa, "replicas": args.replicas,
                **{f"frio_{k}": v for k, v in f.items()},
                **{f"quente_{k}": v for k, v in q.items()},
                "ganho_cache": (round(f["mediana_ms"] / q["mediana_ms"], 1)
                                if f and q and q.get("mediana_ms") else ""),
                "bytes": brutas[-1]["bytes"],
            }
            linhas.append(linha)
            console.print(f"  {nome:26} frio {f.get('mediana_ms', 0):8.0f} ms  "
                          f"quente {q.get('mediana_ms', 0):7.1f} ms  "
                          f"{linha['ganho_cache'] or '—'}x")

    for nome, dados in (("api_latencia.csv", linhas), ("api_bruto.csv", brutas)):
        if not dados:
            continue
        cols = list({k: None for d in dados for k in d})
        with (saida / nome).open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            w.writerows(dados)
        console.print(f"  -> {nome} ({len(dados)} linhas)")

    t = Table(title=f"Latencia por rota, mediana de {args.replicas} replicas")
    for c in ("Rota", "Tipo", "Sem cache", "Com cache", "Ganho"):
        t.add_column(c, justify="right" if c not in ("Rota", "Tipo") else "left")
    for l in linhas:
        t.add_row(l["rota"], "externa" if l["externa"] else "interna",
                  f'{l.get("frio_mediana_ms", 0) / 1000:.2f} s',
                  f'{l.get("quente_mediana_ms", 0):.0f} ms',
                  f'{l["ganho_cache"]}x' if l["ganho_cache"] else "—")
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
