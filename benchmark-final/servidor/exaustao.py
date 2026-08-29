#!/usr/bin/env python3
"""
Comportamento sob carga: onde a vazao satura e onde o limitador corta.

SAO DUAS MEDICOES DIFERENTES E ELAS NAO SE SOMAM. A versao 3.0 tem um limitador
de taxa que a 2.0 nao tinha, e ele dispensa quem chega pelo loopback sem
`X-Forwarded-For` (`RateLimitMiddleware._nasceu_aqui`). Isso da duas perguntas
distintas, e responder as duas com um numero so seria errado nas duas pontas:

  MOTOR. Cliente de loopback, limitador dispensado. Mede quanto o servidor
  aguenta: onde a vazao para de crescer com a concorrencia e onde a latencia
  explode. E o numero comparavel com a medicao da 2.0, que nao tinha limitador.

  PRODUTO. Mesmo cliente, com `X-Forwarded-For` preenchido, que e como o backend
  ve qualquer requisicao vinda do proxy do Render. Mede o que um usuario real
  encontra, e aqui o achado nao e a vazao: e o umbral do 429 e a fracao de
  requisicoes recusadas em cada nivel de concorrencia. Verificado antes de
  medir: 10 requisicoes passam e a 11a no mesmo segundo e recusada.

FASE SEQUENCIAL, HERDADA DA 2.0. Tres taxas com cache limpo a cada lote, para
medir o servidor no pior caso, quando toda consulta sai para a rede. E o unico
regime em que o tempo de resposta e dominado pelas fontes publicas e nao pelo
servidor, e por isso ele satura muito antes.

FASE CONCORRENTE. Cache aquecido de proposito: com cache frio a medicao viraria
um teste de carga contra o Ensembl e o gnomAD, o que alem de nao medir o GenVar
seria abuso das bases publicas.

Uso:
  python3 benchmark-final/servidor/exaustao.py --url http://localhost:8000 --rotulo local
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

TAXAS = [("0,5 req/s", 2.0), ("1 req/s", 1.0), ("2 req/s", 0.5)]
CONCORRENCIAS = [1, 5, 10, 20, 40, 80, 160]
REPETICOES_CONCORRENTES = 3
IP_FALSO = "203.0.113.5"

PREFIXOS = ("gene:", "genevars:", "genephen:", "variant:", "disease:",
            "diseasevars:", "panel:", "pgs:")


def limpa(url_redis):
    try:
        import redis
        r = redis.Redis.from_url(url_redis)
        n = 0
        for p in PREFIXOS:
            chaves = list(r.scan_iter(match=f"{p}*", count=2000))
            if chaves:
                n += r.delete(*chaves)
        return n
    except Exception:
        return -1


def _sujeitos():
    """Mistura de rotas leves e pesadas, para a carga nao medir so uma delas."""
    return ([f"/api/gene/{g}" for g in alvos.GENES[:3]]
            + [f"/api/variant/{v}" for v in alvos.VARIANTES[:3]]
            + [f"/api/disease/{d}" for d in alvos.DOENCAS[:2]]
            + [f"/api/panel/{p}" for p in alvos.PAINEIS[:2]])


async def _uma(cliente, url, cabecalhos):
    t0 = time.perf_counter()
    try:
        r = await cliente.get(url, headers=cabecalhos, timeout=180.0)
        return (time.perf_counter() - t0) * 1000, r.status_code
    except Exception:
        return (time.perf_counter() - t0) * 1000, 0


async def sequencial(cliente, base, url_redis, rotulo):
    linhas = []
    sujeitos = _sujeitos()[:6]
    console.print("\n  [dim]Fase sequencial, cache limpo a cada lote[/dim]")
    for nome_taxa, pausa in TAXAS:
        limpa(url_redis)
        tempos, erros, t0 = [], 0, time.perf_counter()
        for caminho in sujeitos:
            ms, st = await _uma(cliente, base + caminho, {})
            tempos.append(ms)
            erros += 0 if st == 200 else 1
            linhas.append({"rotulo": rotulo, "fase": "sequencial", "modo": "motor",
                           "nivel": nome_taxa, "caminho": caminho,
                           "ms": round(ms, 2), "status": st})
            await asyncio.sleep(pausa)
        decorrido = time.perf_counter() - t0
        rs = comum.resumo(tempos)
        console.print(f"    {nome_taxa:<10} mediana {rs['mediana']:8.1f} ms   "
                      f"p95 {rs['p95']:8.1f} ms   {erros} erros em {len(sujeitos)}   "
                      f"{decorrido:.1f} s")
    return linhas


async def concorrente(cliente, base, url_redis, rotulo, modo, cabecalhos):
    linhas = []
    sujeitos = _sujeitos()
    # Aquece: a fase concorrente mede o servidor, nao as fontes publicas.
    for caminho in sujeitos:
        await _uma(cliente, base + caminho, {})

    console.print(f"\n  [dim]Fase concorrente, modo {modo}, cache quente[/dim]")
    for n in CONCORRENCIAS:
        for rep in range(REPETICOES_CONCORRENTES):
            pedidos = [sujeitos[i % len(sujeitos)] for i in range(n)]
            t0 = time.perf_counter()
            saidas = await asyncio.gather(
                *[_uma(cliente, base + c, cabecalhos) for c in pedidos])
            decorrido = time.perf_counter() - t0
            for (ms, st), caminho in zip(saidas, pedidos):
                linhas.append({"rotulo": rotulo, "fase": "concorrente", "modo": modo,
                               "nivel": n, "repeticao": rep, "caminho": caminho,
                               "ms": round(ms, 2), "status": st,
                               "decorrido_s": round(decorrido, 4)})
        ls = [l for l in linhas if l["nivel"] == n and l["modo"] == modo]
        ok = [l["ms"] for l in ls if l["status"] == 200]
        recusadas = sum(1 for l in ls if l["status"] == 429)
        outros = sum(1 for l in ls if l["status"] not in (200, 429))
        rs = comum.resumo(ok)
        total_s = sum(
            l["decorrido_s"] for l in ls[::n]) if n else 0
        vazao = len(ok) / total_s if total_s else 0
        console.print(f"    {n:>4} simultaneas   mediana {rs['mediana'] or 0:8.1f} ms   "
                      f"p95 {rs['p95'] or 0:8.1f} ms   vazao {vazao:6.1f} req/s   "
                      f"429: {recusadas:>3}   outros erros: {outros}")
    return linhas


async def main():
    ap = argparse.ArgumentParser(description="Carga e limites")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--redis", default=os.environ.get("REDIS_URL", "redis://localhost:6379"))
    ap.add_argument("--rotulo", default="local")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    args = ap.parse_args()

    console.print(f"\n[bold]Carga e limites[/bold]  ({args.rotulo})")
    linhas = []
    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=200)) as cliente:
        linhas += await sequencial(cliente, args.url, args.redis, args.rotulo)
        linhas += await concorrente(cliente, args.url, args.redis, args.rotulo,
                                    "motor", {})
        # Uma pausa para a janela do limitador esvaziar antes do outro modo.
        await asyncio.sleep(65)
        linhas += await concorrente(cliente, args.url, args.redis, args.rotulo,
                                    "produto", {"X-Forwarded-For": IP_FALSO})

    comum.grava_csv(Path(args.saida) / "exaustao.csv", linhas)

    t = Table(title=f"Concorrencia: motor contra produto ({args.rotulo})")
    for c in ("Simultaneas", "Motor mediana", "Motor p95", "Produto 200", "Produto 429"):
        t.add_column(c, justify="right")
    for n in CONCORRENCIAS:
        m = [l["ms"] for l in linhas if l["fase"] == "concorrente"
             and l["modo"] == "motor" and l["nivel"] == n and l["status"] == 200]
        p = [l for l in linhas if l["fase"] == "concorrente"
             and l["modo"] == "produto" and l["nivel"] == n]
        rm = comum.resumo(m)
        t.add_row(str(n), f"{rm['mediana'] or 0:.1f} ms", f"{rm['p95'] or 0:.1f} ms",
                  str(sum(1 for l in p if l["status"] == 200)),
                  str(sum(1 for l in p if l["status"] == 429)))
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
