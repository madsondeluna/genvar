#!/usr/bin/env python3
"""
Quantas requisicoes externas cada consulta dispara, frio e quente.

E a medida que liga tres coisas que as outras suites veem separadas: o custo de
uma consulta, o efeito do cache e a pressao que a ferramenta exerce sobre as
bases publicas. Uma rota que responde em 900 ms fazendo nove requisicoes ao
Ensembl nao e a mesma coisa que uma que responde em 900 ms fazendo uma, ainda
que o grafico de latencia as pinte iguais.

COMO E CONTADO. O aplicativo e importado no processo e `httpx.AsyncClient.send`
e substituido por um contador. Todo cliente de fonte deste backend abre o seu
proprio `httpx.AsyncClient` e chama `.get`, e `.get` termina em `.send`, entao o
ponto e unico e nao ha caminho que escape dele. A contagem inclui RETENTATIVA: o
`_ensembl_get` repete ate tres vezes em timeout ou 429, e uma consulta que
parece de nove requisicoes pode custar mais que isso a fonte. Contar o que foi
pedido, e nao o que a funcao pretendia pedir, e o ponto da medicao.

POR QUE NO PROCESSO E NAO CONTRA O SERVIDOR SERVIDO. Nao ha como observar de
fora quantas chamadas o backend fez a terceiros sem interpor um proxy em todas
as fontes, o que mudaria os tempos. O codigo exercitado e o mesmo modulo que o
Uvicorn serve, entao a contagem e a mesma; o que nao se mede assim e a latencia,
e essa vem da suite de latencia, contra o servidor de verdade.

O LIMITADOR DE TAXA FICA DESLIGADO AQUI, e isso e declarado porque muda o que a
suite pode dizer. O cliente de teste se apresenta como `testserver`, que nao e
loopback, entao `_nasceu_aqui()` nao o dispensa e o limitador devolve 429 antes
de a rota rodar. Uma consulta barrada conta zero requisicoes externas, o que
pareceria uma economia e e uma medicao perdida. Como esta suite mede CONTAGEM e
nao vazao, desligar o limitador nao distorce o numero: ele so garante que a rota
tenha rodado. Vazao e o umbral do 429 sao medidos pela suite de exaustao, contra
o servidor de verdade, com o limitador ativo.

Uso:
  python3 benchmark-final/servidor/requisicoes.py --saida benchmark-final/resultados/local
"""
import argparse
import asyncio
import logging
import os
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

# Antes de qualquer importacao do aplicativo: os limites viram constantes de
# modulo no momento em que `app.rate_limit` e carregado.
os.environ.setdefault("RATE_LIMIT_PER_SECOND", "100000")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")
logging.getLogger("httpx").setLevel(logging.WARNING)

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ.parent / "backend"))

import comum  # noqa: E402
import alvos  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

console = Console()

# Familia de rota -> um alvo. Contar as dez de cada familia multiplicaria as
# chamadas as fontes publicas por dez sem mudar a resposta: o numero de
# requisicoes por consulta e propriedade da ROTA, nao do alvo. O que varia com o
# alvo, e por isso tres alvos por familia entram, e o gene sem proteina no
# UniProt, que pula a chamada ao AlphaFold.
def _casos():
    return [
        ("gene", [f"/api/gene/{g}" for g in alvos.GENES[:3]]),
        ("gene sem variantes", [f"/api/gene/{g}?variantes=false" for g in alvos.GENES[:3]]),
        ("gene variantes", [f"/api/gene/{g}/variants" for g in alvos.GENES[:3]]),
        ("gene fenotipos", [f"/api/gene/{g}/phenotypes" for g in alvos.GENES[:3]]),
        ("variante", [f"/api/variant/{v}" for v in alvos.VARIANTES[:3]]),
        ("doenca", [f"/api/disease/{d}" for d in alvos.DOENCAS[:3]]),
        ("doenca variantes", [f"/api/disease/{d}/variants" for d in alvos.DOENCAS[:3]]),
        ("painel", [f"/api/panel/{p}" for p in alvos.PAINEIS[:3]]),
        ("escore", [f"/api/pgs/{e}" for e in alvos.ESCORES[:3]]),
        ("sugestao", [f"/api/suggest?q={q}" for q in alvos.PREFIXOS_SUGESTAO[:3]]),
        ("catalogo de doencas", ["/api/disease"]),
        ("catalogo de paineis", ["/api/panel"]),
        ("catalogo de escores", ["/api/pgs"]),
        ("raro x poligenico", ["/api/pgs/interplay"]),
        ("fontes", ["/api/sources"]),
        # As quatro abaixo faltavam, e a ausencia levou a classifica-las como
        # rotas que nao usam rede quando `saude das rotas` chegou a 9,4 s de
        # maximo: ela sonda todas as fontes. Uma rota que a suite de latencia
        # mede tem de estar aqui, senao a classificacao volta a ser palpite.
        ("estatistica de doencas", ["/api/disease/stats"]),
        ("estatistica de paineis", ["/api/panel/stats"]),
        ("saude das fontes", ["/api/health/sources"]),
        ("saude das rotas", ["/api/health/endpoints"]),
    ]


class Contador:
    """Substitui `AsyncClient.send` e registra host e caminho de cada requisicao."""

    def __init__(self):
        self.por_host = Counter()
        self.total = 0
        self._original = None

    def __enter__(self):
        import httpx
        self._original = httpx.AsyncClient.send
        contador = self

        async def send(cliente, request, *a, **kw):
            contador.total += 1
            contador.por_host[urlsplit(str(request.url)).netloc] += 1
            return await contador._original(cliente, request, *a, **kw)

        httpx.AsyncClient.send = send
        return self

    def __exit__(self, *exc):
        import httpx
        httpx.AsyncClient.send = self._original

    def zera(self):
        self.por_host.clear()
        self.total = 0


def _limpa_cache(padrao="*"):
    """Apaga as chaves do GenVar, e so as dele: a instancia pode ser compartilhada."""
    try:
        import redis
        r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))
        apagadas = 0
        for prefixo in ("gene:", "genevars:", "genephen:", "variant:", "disease:",
                        "diseasevars:", "panel:", "pgs:"):
            chaves = list(r.scan_iter(match=f"{prefixo}{padrao}", count=1000))
            if chaves:
                apagadas += r.delete(*chaves)
        return apagadas
    except Exception as e:
        console.print(f"  [yellow]cache nao limpo: {e}[/yellow]")
        return -1


async def main():
    ap = argparse.ArgumentParser(description="Requisicoes externas por consulta")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    ap.add_argument("--rotulo", default="local")
    args = ap.parse_args()

    from fastapi.testclient import TestClient
    from app.main import app

    linhas = []
    with Contador() as contador, TestClient(app) as cliente:
        console.print("\n[bold]Requisicoes externas por consulta[/bold]")
        console.print("  contadas em httpx.AsyncClient.send, retentativas incluidas\n")

        for familia, caminhos in _casos():
            frios, quentes, hosts_frio = [], [], Counter()
            for caminho in caminhos:
                _limpa_cache()
                contador.zera()
                t0 = time.perf_counter()
                r1 = cliente.get(caminho, timeout=180)
                ms_frio = (time.perf_counter() - t0) * 1000
                n_frio = contador.total
                hosts_frio.update(contador.por_host)

                contador.zera()
                t0 = time.perf_counter()
                r2 = cliente.get(caminho, timeout=180)
                ms_quente = (time.perf_counter() - t0) * 1000
                n_quente = contador.total

                if r1.status_code == 200 and r2.status_code == 200:
                    frios.append(n_frio)
                    quentes.append(n_quente)
                else:
                    console.print(f"    [yellow]{caminho}: {r1.status_code}/"
                                  f"{r2.status_code}, fora da estatistica[/yellow]")
                linhas.append({
                    "familia": familia, "caminho": caminho,
                    "status_frio": r1.status_code, "status_quente": r2.status_code,
                    "requisicoes_frio": n_frio, "requisicoes_quente": n_quente,
                    "ms_frio": round(ms_frio, 1), "ms_quente": round(ms_quente, 1),
                    "hosts": ";".join(f"{h}={n}" for h, n in sorted(contador.por_host.items())) or "",
                })
            if frios:
                console.print(f"  {familia:<22} frio {sum(frios)/len(frios):5.1f}   "
                              f"quente {sum(quentes)/len(quentes):4.1f}   "
                              f"{', '.join(f'{h}:{n}' for h, n in hosts_frio.most_common(4))}")

    comum.grava_csv(Path(args.saida) / "requisicoes.csv", linhas)
    comum.grava_json(Path(args.saida) / "ambiente_requisicoes.json",
                     comum.ambiente(args.rotulo))

    t = Table(title="Requisicoes externas por consulta")
    for c in ("Familia", "Frio", "Quente", "Economia"):
        t.add_column(c, justify="left" if c == "Familia" else "right")
    for familia, _ in _casos():
        ls = [l for l in linhas if l["familia"] == familia and l["status_frio"] == 200]
        if not ls:
            continue
        f = sum(l["requisicoes_frio"] for l in ls) / len(ls)
        q = sum(l["requisicoes_quente"] for l in ls) / len(ls)
        # Rota que nunca sai para a rede tem economia indefinida, e nao total:
        # 0 de 0 nao e 100%.
        if not f:
            economia = "nao usa rede"
        elif q == 0:
            economia = "todas"
        else:
            economia = f"{(1 - q / f) * 100:.0f}%"
        t.add_row(familia, f"{f:.1f}", f"{q:.1f}", economia)
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
