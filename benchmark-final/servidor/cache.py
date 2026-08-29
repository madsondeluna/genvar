#!/usr/bin/env python3
"""
O que o cache muda: tempo, memoria e pressao sobre as fontes.

Quatro medicoes, porque "o cache acelera" e uma frase, nao um resultado.

  A. GANHO POR FAMILIA. Mediana fria contra mediana quente por rota. E o numero
     que a suite de latencia tambem produz; aqui ele e refeito com o cache sob
     controle direto para servir de conferencia cruzada entre as duas suites.

  B. CUSTO EM MEMORIA. `MEMORY USAGE` de cada chave no Redis. Uma rota que
     economiza dois segundos guardando 40 KB e diferente de uma que economiza os
     mesmos dois segundos guardando 4 MB, e a segunda decide o dimensionamento
     da instancia. E a unica das quatro que responde "quanto custa manter".

  C. O RECORTE FAZ PARTE DA CHAVE. `gene:v6:{simbolo}:{com|sem}` guarda duas
     entradas para o mesmo gene, uma com a tabela de variantes e outra sem. A
     medicao mostra que uma nao serve a outra e quanto cada uma ocupa. E o
     desenho que permitiu tirar a tabela pesada da rota principal sem quebrar
     quem a pedia.

  D. SESSAO REALISTA. As tres primeiras medem uma consulta isolada, e nenhuma
     sessao de uso e assim: um usuario volta ao mesmo gene, e a taxa de acerto
     do cache depende de quanto ele repete. A sessao aqui sorteia consultas por
     uma lei de Zipf, que e a forma como acesso a catalogo se distribui na
     pratica, com semente fixa para ser reproduzivel, e mede o tempo total e a
     taxa de acerto com o cache ligado e com ele desligado a cada consulta.

  E. O TTL ESTA ONDE DEVERIA. Esperar uma hora pela expiracao nao acrescentaria
     informacao: uma chave expirada e indistinguivel de uma chave ausente, que e
     o que a medicao fria ja exercita. O que NAO e indistinguivel, e por isso e
     medido aqui, e se toda chave escrita recebeu prazo. Uma chave sem prazo
     nunca expira: ela nao aparece em nenhuma medicao de latencia, nao devolve
     dado errado, e vai ocupando memoria ate a instancia encher. E o unico
     defeito de cache que nao se manifesta como lentidao, e por isso o unico que
     precisa ser procurado de proposito.

Uso:
  python3 benchmark-final/servidor/cache.py --url http://localhost:8000 --rotulo local
"""
import argparse
import asyncio
import os
import random
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

PREFIXOS = ("gene:", "genevars:", "genephen:", "variant:", "disease:",
            "diseasevars:", "panel:", "pgs:")
N_SESSAO = 60
ZIPF_A = 1.4
SEMENTE = 20260829


def _redis(url):
    import redis
    return redis.Redis.from_url(url)


def limpa(r):
    n = 0
    for p in PREFIXOS:
        chaves = list(r.scan_iter(match=f"{p}*", count=2000))
        if chaves:
            n += r.delete(*chaves)
    return n


def chaves_com_tamanho(r):
    saida = {}
    for p in PREFIXOS:
        for c in r.scan_iter(match=f"{p}*", count=2000):
            nome = c.decode() if isinstance(c, bytes) else c
            try:
                saida[nome] = r.memory_usage(nome) or 0
            except Exception:
                saida[nome] = 0
    return saida


async def _get(cliente, base, caminho):
    t0 = time.perf_counter()
    r = await cliente.get(base + caminho, timeout=180.0)
    return (time.perf_counter() - t0) * 1000, r.status_code


async def main():
    ap = argparse.ArgumentParser(description="Efeito do cache")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--redis", default=os.environ.get("REDIS_URL", "redis://localhost:6379"))
    ap.add_argument("--rotulo", default="local")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    args = ap.parse_args()
    saida = Path(args.saida)
    r = _redis(args.redis)

    console.print(f"\n[bold]Efeito do cache[/bold]  ({args.rotulo})")

    # --- A e B: ganho e custo em memoria, por familia -------------------------
    casos = [
        ("gene", [f"/api/gene/{g}" for g in alvos.GENES[:5]]),
        ("gene sem variantes", [f"/api/gene/{g}?variantes=false" for g in alvos.GENES[:5]]),
        ("gene variantes", [f"/api/gene/{g}/variants" for g in alvos.GENES[:5]]),
        ("gene fenotipos", [f"/api/gene/{g}/phenotypes" for g in alvos.GENES[:5]]),
        ("variante", [f"/api/variant/{v}" for v in alvos.VARIANTES[:5]]),
        ("doenca", [f"/api/disease/{d}" for d in alvos.DOENCAS[:5]]),
        ("doenca variantes", [f"/api/disease/{d}/variants" for d in alvos.DOENCAS[:5]]),
        ("painel", [f"/api/panel/{p}" for p in alvos.PAINEIS[:5]]),
        ("escore", [f"/api/pgs/{e}" for e in alvos.ESCORES[:5]]),
    ]
    linhas = []
    async with httpx.AsyncClient() as cliente:
        console.print("\n  [dim]A e B: ganho e custo em memoria[/dim]")
        for familia, caminhos in casos:
            for caminho in caminhos:
                limpa(r)
                antes = set(chaves_com_tamanho(r))
                ms_frio, st = await _get(cliente, args.url, caminho)
                if st != 200:
                    console.print(f"    [yellow]{caminho}: {st}, fora da estatistica[/yellow]")
                    continue
                depois = chaves_com_tamanho(r)
                novas = {k: v for k, v in depois.items() if k not in antes}

                quentes = []
                for _ in range(10):
                    ms, st2 = await _get(cliente, args.url, caminho)
                    if st2 == 200:
                        quentes.append(ms)
                rq = comum.resumo(quentes)
                linhas.append({
                    "rotulo": args.rotulo, "familia": familia, "caminho": caminho,
                    "ms_frio": round(ms_frio, 2),
                    "ms_quente_mediana": rq["mediana"], "ms_quente_p95": rq["p95"],
                    "ganho": round(ms_frio / rq["mediana"], 2) if rq["mediana"] else None,
                    "chaves_criadas": len(novas),
                    "bytes_no_redis": sum(novas.values()),
                    "chaves": ";".join(sorted(novas)),
                })
            ls = [l for l in linhas if l["familia"] == familia]
            if ls:
                g = sorted(l["ganho"] for l in ls if l["ganho"])
                b = sum(l["bytes_no_redis"] for l in ls) / len(ls)
                console.print(f"    {familia:<22} ganho x{g[len(g)//2] if g else 0:<8.0f} "
                              f"{b/1024:8.1f} KB por consulta")
    comum.grava_csv(saida / "cache_por_rota.csv", linhas)

    # --- C: o recorte com|sem faz parte da chave ------------------------------
    console.print("\n  [dim]C: o recorte com|sem variantes[/dim]")
    recorte = []
    async with httpx.AsyncClient() as cliente:
        for g in alvos.GENES[:5]:
            limpa(r)
            ms_com, _ = await _get(cliente, args.url, f"/api/gene/{g}")
            k_com = chaves_com_tamanho(r)
            # Sem limpar: se `sem` fosse servido pela entrada de `com`, nao
            # haveria chave nova nem custo de rede na proxima linha.
            ms_sem, _ = await _get(cliente, args.url, f"/api/gene/{g}?variantes=false")
            k_ambos = chaves_com_tamanho(r)
            novas = {k: v for k, v in k_ambos.items() if k not in k_com}
            ms_sem_q, _ = await _get(cliente, args.url, f"/api/gene/{g}?variantes=false")
            recorte.append({
                "rotulo": args.rotulo, "gene": g,
                "ms_com_frio": round(ms_com, 2),
                "ms_sem_apos_com": round(ms_sem, 2),
                "ms_sem_quente": round(ms_sem_q, 2),
                "chaves_apos_com": len(k_com), "chaves_novas_do_sem": len(novas),
                "bytes_com": sum(v for k, v in k_com.items() if k.startswith("gene:v6")),
                "bytes_sem": sum(novas.values()),
                "serviu_do_cache_de_com": ms_sem < 50,
            })
            console.print(f"    {g:<8} com {ms_com:8.1f} ms   sem depois de com "
                          f"{ms_sem:8.1f} ms   chaves novas {len(novas)}")
    comum.grava_csv(saida / "cache_recorte.csv", recorte)

    # --- D: sessao realista, com e sem cache ----------------------------------
    console.print("\n  [dim]D: sessao de 60 consultas com repeticao Zipf[/dim]")
    universo = ([f"/api/gene/{g}" for g in alvos.GENES]
                + [f"/api/variant/{v}" for v in alvos.VARIANTES]
                + [f"/api/disease/{d}" for d in alvos.DOENCAS])
    # Zipf construida a mao em vez de tirada de uma biblioteca: o vetor de pesos
    # e visivel, o sorteio e `random.choices` com semente fixa, e a sequencia sai
    # identica em qualquer maquina e qualquer versao. Um gerador de biblioteca
    # muda de implementacao entre versoes e a sessao deixa de ser reproduzivel.
    rnd = random.Random(SEMENTE)
    pesos = [1.0 / (i ** ZIPF_A) for i in range(1, len(universo) + 1)]
    sequencia = rnd.choices(universo, weights=pesos, k=N_SESSAO)
    unicos = len(set(sequencia))

    sessao = []
    async with httpx.AsyncClient() as cliente:
        for modo in ("com cache", "sem cache"):
            limpa(r)
            vistos, acertos, t_total = set(), 0, 0.0
            for i, caminho in enumerate(sequencia, 1):
                if modo == "sem cache":
                    limpa(r)
                acerto = modo == "com cache" and caminho in vistos
                ms, st = await _get(cliente, args.url, caminho)
                t_total += ms
                acertos += 1 if acerto else 0
                vistos.add(caminho)
                sessao.append({"rotulo": args.rotulo, "modo": modo, "ordem": i,
                               "caminho": caminho, "ms": round(ms, 2),
                               "acerto_previsto": acerto, "status": st})
            console.print(f"    {modo:<12} {t_total/1000:7.1f} s no total, "
                          f"{acertos}/{N_SESSAO} acertos previstos, "
                          f"{unicos} consultas distintas")
    comum.grava_csv(saida / "cache_sessao.csv", sessao)

    # --- E: toda chave escrita tem prazo? --------------------------------------
    console.print("\n  [dim]E: prazo de expiracao das chaves[/dim]")
    limpa(r)
    async with httpx.AsyncClient() as cliente:
        for familia, caminhos in casos:
            await _get(cliente, args.url, caminhos[0])
    prazos = []
    for chave, bytes_ in chaves_com_tamanho(r).items():
        ttl = r.ttl(chave)
        prazos.append({
            "rotulo": args.rotulo, "chave": chave, "bytes": bytes_,
            "ttl_s": ttl,
            # -1 e a resposta do Redis para "existe e nunca expira"; -2 e "nao
            # existe". A primeira e o vazamento que esta medicao procura.
            "tem_prazo": ttl is not None and ttl > 0,
            "prefixo": chave.split(":")[0],
        })
    comum.grava_csv(saida / "cache_ttl.csv", prazos)
    sem_prazo = [p for p in prazos if not p["tem_prazo"]]
    t3 = Table(title=f"Prazo das chaves ({args.rotulo})")
    for c in ("Prefixo", "Chaves", "Com prazo", "TTL mediano"):
        t3.add_column(c, justify="left" if c == "Prefixo" else "right")
    for pref in sorted({p["prefixo"] for p in prazos}):
        ls = [p for p in prazos if p["prefixo"] == pref]
        ttls = sorted(p["ttl_s"] for p in ls if p["tem_prazo"])
        t3.add_row(pref, str(len(ls)),
                   str(sum(1 for p in ls if p["tem_prazo"])),
                   f"{ttls[len(ttls) // 2]} s" if ttls else "—")
    console.print(t3)
    if sem_prazo:
        console.print(f"  [red]{len(sem_prazo)} chaves SEM prazo: nunca expiram e "
                      f"ocupam memoria para sempre[/red]")
        for p in sem_prazo[:5]:
            console.print(f"    {p['chave']}")
    else:
        console.print(f"  [green]as {len(prazos)} chaves escritas tem prazo[/green]")

    t = Table(title=f"Sessao de {N_SESSAO} consultas, {unicos} distintas ({args.rotulo})")
    for c in ("Modo", "Tempo total", "Mediana", "p95"):
        t.add_column(c, justify="left" if c == "Modo" else "right")
    for modo in ("com cache", "sem cache"):
        ms = [l["ms"] for l in sessao if l["modo"] == modo and l["status"] == 200]
        rs = comum.resumo(ms)
        t.add_row(modo, f"{sum(ms)/1000:.1f} s", f"{rs['mediana']:.1f} ms", f"{rs['p95']:.1f} ms")
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
