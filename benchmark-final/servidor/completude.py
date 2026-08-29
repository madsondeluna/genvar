#!/usr/bin/env python3
"""
Completude: que fracao dos campos de cada resposta vem preenchida.

A DEFINICAO E A MESMA DA VERSAO 2.0, letra por letra, e isso e deliberado: e a
unica forma de a figura "2.0 contra 3.0" comparar dois numeros da mesma coisa em
vez de duas definicoes diferentes com o mesmo nome. Um campo conta como
preenchido quando nao e nulo, nao e cadeia vazia depois de aparado, e nao e
lista nem objeto vazio. A varredura desce um nivel: `restricao.pli` conta como
campo proprio, `restricao` inteiro nao.

O QUE A MEDIDA NAO DIZ, e vale declarar antes de alguem ler o grafico como nota
de qualidade: campo vazio nem sempre e defeito. Um gene sem estrutura resolvida
no AlphaFold devolve `pdb_url` nulo porque a estrutura nao existe, nao porque a
consulta falhou. Por isso a suite tambem grava, por campo, em quantos alvos ele
veio vazio: campo vazio em UM alvo e propriedade daquele gene, campo vazio em
TODOS e limitacao da fonte ou da integracao, e essa segunda lista e o resultado
que interessa.

Uso:
  python3 benchmark-final/servidor/completude.py --url http://localhost:8000 --rotulo local
"""
import argparse
import asyncio
import sys
from collections import defaultdict
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


def preenchido(v):
    if v is None:
        return False
    if isinstance(v, (list, dict)):
        return len(v) > 0
    if isinstance(v, str):
        return v.strip() != ""
    return True


def campos(dados):
    saida = {}
    for chave, valor in dados.items():
        if isinstance(valor, dict):
            for sub, subvalor in valor.items():
                saida[f"{chave}.{sub}"] = preenchido(subvalor)
        else:
            saida[chave] = preenchido(valor)
    return saida


async def main():
    ap = argparse.ArgumentParser(description="Completude por rota")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--rotulo", default="local")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    args = ap.parse_args()

    familias = [
        ("gene", [f"/api/gene/{g}" for g in alvos.GENES]),
        ("gene fenotipos", [f"/api/gene/{g}/phenotypes" for g in alvos.GENES]),
        ("variante", [f"/api/variant/{v}" for v in alvos.VARIANTES]),
        ("doenca", [f"/api/disease/{d}" for d in alvos.DOENCAS]),
        ("painel", [f"/api/panel/{p}" for p in alvos.PAINEIS]),
        ("escore", [f"/api/pgs/{e}" for e in alvos.ESCORES]),
    ]

    console.print(f"\n[bold]Completude por rota[/bold]  ({args.rotulo})")
    linhas, por_campo = [], defaultdict(lambda: {"cheio": 0, "total": 0})
    async with httpx.AsyncClient() as cliente:
        for familia, caminhos in familias:
            for caminho in caminhos:
                try:
                    r = await cliente.get(args.url + caminho, timeout=180.0)
                    dados = r.json() if r.status_code == 200 else None
                except Exception:
                    dados = None
                if not isinstance(dados, dict):
                    console.print(f"  [yellow]{caminho}: sem resposta utilizavel[/yellow]")
                    continue
                estado = campos(dados)
                cheios = sum(1 for v in estado.values() if v)
                for nome, v in estado.items():
                    chave = f"{familia}|{nome}"
                    por_campo[chave]["total"] += 1
                    por_campo[chave]["cheio"] += 1 if v else 0
                linhas.append({
                    "rotulo": args.rotulo, "familia": familia, "caminho": caminho,
                    "campos": len(estado), "preenchidos": cheios,
                    "completude_pct": round(cheios / len(estado) * 100, 1) if estado else 0.0,
                    "vazios": ";".join(sorted(k for k, v in estado.items() if not v)),
                })
            ls = [l for l in linhas if l["familia"] == familia]
            if ls:
                med = sorted(l["completude_pct"] for l in ls)[len(ls) // 2]
                console.print(f"  {familia:<18} {len(ls)} alvos   "
                              f"{ls[0]['campos']:>3} campos   completude mediana {med:5.1f}%")

    vazios = [{"rotulo": args.rotulo, "familia": k.split("|")[0], "campo": k.split("|")[1],
               "alvos": v["total"], "preenchido_em": v["cheio"],
               "vazio_em": v["total"] - v["cheio"],
               "sempre_vazio": v["cheio"] == 0}
              for k, v in sorted(por_campo.items())]

    comum.grava_csv(Path(args.saida) / "completude.csv", linhas)
    comum.grava_csv(Path(args.saida) / "completude_campos.csv", vazios)

    t = Table(title=f"Campos sempre vazios, que sao limitacao e nao propriedade do alvo ({args.rotulo})")
    for c in ("Familia", "Campo", "Alvos"):
        t.add_column(c, justify="left" if c != "Alvos" else "right")
    for v in vazios:
        if v["sempre_vazio"]:
            t.add_row(v["familia"], v["campo"], str(v["alvos"]))
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
