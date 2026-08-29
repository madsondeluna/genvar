"""
Limitador de taxa: comportamento sob carga e resistencia a cabecalho forjado.

O limite existe para proteger o ACESSO DO PROJETO as fontes, nao o servidor:
Ensembl, gnomAD e NCBI aplicam uso justo por IP de origem, e uma varredura
saindo daqui bloqueia a origem para todos de uma vez.

Duas coisas sao medidas, e a segunda e a que separa limite real de limite
decorativo. `X-Forwarded-For` e uma lista em que cada proxy ACRESCENTA ao fim
quem falou com ele, e o cliente pode mandar a sua propria lista, que chega
inteira na frente. Lendo o primeiro elemento, trocar o cabecalho a cada
requisicao burla o limite por completo.

Saida: results/limite.csv
"""
import asyncio
import csv
import time
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

# benchmark-final/infra/suites/ e um nivel mais fundo que
# benchmark-v2/suites/, de onde estes arquivos vieram.
RAIZ = Path(__file__).resolve().parents[3]

# Rota barata e sem chamada externa: o que se mede e o limitador, nao a fonte.
# `/api/sources` monta a lista de procedencia e leva 220 ms, e sob rajada de 80
# em paralelo a maioria das requisicoes morria em tempo limite, contando como
# falha e nao como bloqueio: media de servidor lento com aparencia de limite.
ROTA = "/api/panel/stats"
ROTA_ISENTA = "/health"

# Pool explicito e tempo limite curto: com o padrao do httpx a rajada enfileira
# e o que se mede passa a ser a fila do cliente.
LIMITES = httpx.Limits(max_connections=100, max_keepalive_connections=100)
ESPERA = 10.0


async def _rajada(client: httpx.AsyncClient, url: str, n: int, cabecalhos=None) -> dict:
    """Dispara n requisicoes em paralelo e conta o que passou."""
    t0 = time.perf_counter()

    async def uma():
        try:
            r = await client.get(url, headers=cabecalhos or {}, timeout=ESPERA)
            return r.status_code
        except Exception:
            return 0

    codigos = await asyncio.gather(*[uma() for _ in range(n)])
    return {
        "enviadas": n,
        "ok": sum(1 for c in codigos if c == 200),
        "bloqueadas": sum(1 for c in codigos if c == 429),
        "falhas": sum(1 for c in codigos if c not in (200, 429)),
        "segundos": round(time.perf_counter() - t0, 2),
    }


def _config() -> dict:
    """Os tres numeros sem os quais o resultado nao se le. `20 de 80 passaram`
    parece defeito ate saber que o teto por segundo e 10 e a rajada durou 2,6 s."""
    try:
        import sys
        sys.path.insert(0, str(RAIZ / "backend"))
        from app.config import settings
        return {
            "limite_por_minuto": settings.rate_limit_per_minute,
            "limite_por_segundo": settings.rate_limit_per_second,
            "proxies_confiaveis": settings.trusted_proxy_hops,
        }
    except Exception:
        return {"limite_por_minuto": "", "limite_por_segundo": "", "proxies_confiaveis": ""}


async def run(base: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold]Limitador de taxa[/bold]")
    cfg = _config()
    console.print(f"  [dim]teto {cfg['limite_por_minuto']}/min e {cfg['limite_por_segundo']}/s, "
                  f"{cfg['proxies_confiaveis']} proxy(s) confiavel(is)[/dim]")

    # IP distinto a cada RODADA, e nao so a cada caso: o backend fica de pe
    # entre execucoes e a janela de um minuto do IP anterior ainda esta cheia,
    # entao repetir a suite dentro do mesmo minuto devolvia "0 de 80 passaram",
    # que le como limite mais duro do que ele e.
    marca = int(time.time()) % 1000

    linhas = []
    async with httpx.AsyncClient(limits=LIMITES) as client:
        # O limitador guarda o IP em memoria por janela. Cada caso usa um IP
        # diferente para nao herdar a contagem do caso anterior.
        casos = [
            # O elemento CONFIAVEL e o ULTIMO: e o que o proxy mais proximo
            # escreveu sobre quem falou com ele. Escrever o IP do caso na frente
            # e deixar um endereco fixo no fim, que foi a primeira versao deste
            # arquivo, faz todos os casos caírem no MESMO IP e a suite reporta
            # "0 de 80 passaram" como se o limite fosse mais duro do que e.
            ("rajada de 30, um IP", 30,
             {"x-forwarded-for": f"198.51.{marca // 256}.{marca % 256}"}),
            ("rajada de 80, um IP", 80,
             {"x-forwarded-for": f"198.52.{marca // 256}.{marca % 256}"}),
            ("rajada de 30, sem cabecalho", 30, None),
        ]
        for nome, n, cab in casos:
            r = await _rajada(client, base + ROTA, n, cab)
            r["caso"] = nome
            r["rota"] = ROTA
            linhas.append(r)
            console.print(f"  {nome:34} {r['ok']:3} passaram, {r['bloqueadas']:3} bloqueadas, "
                          f"{r['falhas']:3} falhas")

        # O ataque: um IP forjado diferente a cada requisicao. Com a leitura
        # ingenua do primeiro elemento, TODAS passam.
        t0 = time.perf_counter()

        async def forjada(i):
            try:
                r = await client.get(base + ROTA, timeout=ESPERA, headers={
                    # O atacante escreve a sua propria lista, que chega INTEIRA
                    # na frente; o proxy acrescenta o endereco real no fim. Se o
                    # limitador contasse do comeco, cada requisicao seria um IP
                    # novo e as 80 passariam.
                    "x-forwarded-for": f"10.{marca % 200}.{i // 256}.{i % 256}, "
                                       f"198.54.{marca // 256}.{marca % 256}",
                })
                return r.status_code
            except Exception:
                return 0

        codigos = await asyncio.gather(*[forjada(i) for i in range(80)])
        linha = {
            "caso": "rajada de 80 com X-Forwarded-For forjado",
            "rota": ROTA,
            "enviadas": 80,
            "ok": sum(1 for c in codigos if c == 200),
            "bloqueadas": sum(1 for c in codigos if c == 429),
            "falhas": sum(1 for c in codigos if c not in (200, 429)),
            "segundos": round(time.perf_counter() - t0, 2),
        }
        linhas.append(linha)
        console.print(f"  {'com cabecalho forjado':34} {linha['ok']:3} passaram, "
                      f"{linha['bloqueadas']:3} bloqueadas, {linha['falhas']:3} falhas")

        # Sonda de saude nao pode ser limitada: limita-la faz o servico parecer
        # fora do ar justamente quando alguem confere se ele esta no ar.
        r = await _rajada(client, base + ROTA_ISENTA, 60,
                          {"x-forwarded-for": f"198.53.{marca // 256}.{marca % 256}"})
        r["caso"] = "sonda de saude, 60 requisicoes"
        r["rota"] = ROTA_ISENTA
        linhas.append(r)
        console.print(f"  {'sonda de saude':34} {r['ok']:3} passaram, {r['bloqueadas']:3} bloqueadas, "
                      f"{r['falhas']:3} falhas")

    for l in linhas:
        l.update(cfg)

    with (results_dir / "limite.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["caso", "rota", "enviadas", "ok", "bloqueadas",
                                           "falhas", "segundos", "limite_por_minuto",
                                           "limite_por_segundo", "proxies_confiaveis"])
        w.writeheader()
        w.writerows(linhas)

    t = Table(title="Limitador de taxa")
    for c in ("Caso", "Enviadas", "Passaram", "Bloqueadas", "Falhas", "s"):
        t.add_column(c, justify="right" if c != "Caso" else "left")
    for l in linhas:
        t.add_row(l["caso"], str(l["enviadas"]), str(l["ok"]), str(l["bloqueadas"]),
                  str(l["falhas"]), f'{l["segundos"]:.1f}')
    console.print(t)

    forjado = next((l for l in linhas if "forjado" in l["caso"]), None)
    honesto = next((l for l in linhas if l["caso"] == "rajada de 80, um IP"), None)
    if forjado and honesto:
        console.print(f"  [dim]Forjando o cabecalho a cada requisicao passaram {forjado['ok']} "
                      f"de 80; com um IP so, {honesto['ok']} de 80. Iguais e o resultado "
                      f"esperado: a forja nao compra nada.[/dim]")
    if forjado and forjado["ok"] >= 60:
        console.print("  [bold red]O cabecalho forjado passou: o limitador esta lendo o "
                      "primeiro elemento do X-Forwarded-For.[/bold red]")
