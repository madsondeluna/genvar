#!/usr/bin/env python3
"""
Refaz os resumos de latencia a partir das medicoes brutas.

Existe porque duas correcoes de CRITERIO nao exigem remedir, so recontar:

  1. O p95 estava sendo publicado sobre amostras de tres observacoes, onde ele e
     o maximo com outro nome. O resumo passa a trazer p95 apenas quando ha vinte
     ou mais observacoes, e o maximo observado quando nao ha.

  2. A classificacao "rota que consulta a rede" era uma lista escrita a mao, e
     ela errava: `/api/sources`, `/api/health/sources` e `/api/health/endpoints`
     saem para a rede e estavam do lado errado. Agora ela e DERIVADA da contagem
     medida em `requisicoes.csv`. Se a contagem nao existir, a rota fica marcada
     como indeterminada em vez de adivinhada.

As medicoes em si continuam validas: o que estava errado era o resumo delas, e
refazer o resumo sobre o mesmo bruto e mais honesto do que gastar outras
seiscentas chamadas as bases publicas para chegar aos mesmos numeros.

Uso:
  python3 benchmark-final/servidor/recomputar.py --saida benchmark-final/resultados/local
"""
import argparse
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ))

import comum  # noqa: E402
import pandas as pd  # noqa: E402
from rich.console import Console  # noqa: E402

console = Console()


def classificacao_medida(saida):
    """Rota -> usa rede, a partir da contagem medida. Vazio se nao houver medida."""
    caminho = Path(saida) / "requisicoes.csv"
    if not caminho.exists():
        return {}
    d = pd.read_csv(caminho)
    d = d[(d.status_frio == 200)]
    return (d.groupby("familia").requisicoes_frio.max() > 0).to_dict()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    args = ap.parse_args()
    saida = Path(args.saida)

    bruto = pd.read_csv(saida / "latencia_bruto.csv")
    medida = classificacao_medida(saida)
    console.print(f"\n[bold]Recomputando resumos de latencia[/bold]")
    console.print(f"  {len(bruto)} medicoes brutas, "
                  f"{len(medida)} familias com contagem de requisicoes medida\n")

    linhas, indeterminadas = [], set()
    for (rotulo, nome, caminho, familia), g in bruto.groupby(
            ["rotulo", "nome", "caminho", "familia"], sort=False):
        ok = g[g.status == 200]
        frios = ok[ok.estado == "frio"].ms.tolist()
        quentes = ok[ok.estado == "quente"].ms.tolist()
        rf, rq = comum.resumo(frios), comum.resumo(quentes)
        if nome in medida:
            de_rede = bool(medida[nome])
        else:
            de_rede = None
            indeterminadas.add(nome)
        linhas.append({
            "rotulo": rotulo, "nome": nome, "caminho": caminho, "familia": familia,
            "de_rede": de_rede,
            "status": ";".join(str(s) for s in sorted(g.status.unique())),
            "bytes": int(ok.bytes.max()) if not ok.empty else 0,
            **{f"frio_{k}": v for k, v in rf.items()},
            **{f"quente_{k}": v for k, v in rq.items()},
            # Ganho da LINHA: razao entre as duas medianas da propria linha. As
            # figuras que agregam por familia usam razao das medianas da familia,
            # e nao mediana destas razoes, para que a tabela e o grafico digam o
            # mesmo numero.
            "ganho_cache": round(rf["mediana"] / rq["mediana"], 2)
            if rf["mediana"] and rq["mediana"] else None,
        })

    comum.grava_csv(saida / "latencia.csv", linhas)
    d = pd.DataFrame(linhas)
    console.print(f"  {len(d)} rotas resumidas")
    console.print(f"  com p95 valido: {d.frio_p95.notna().sum()} frias, "
                  f"{d.quente_p95.notna().sum()} quentes")
    if indeterminadas:
        console.print(f"  [yellow]sem contagem de requisicoes, ficaram indeterminadas: "
                      f"{', '.join(sorted(indeterminadas))}[/yellow]")
    rede = d[d.de_rede == True]  # noqa: E712
    console.print(f"  classificadas como de rede pela medicao: "
                  f"{sorted(set(rede.nome))}")


if __name__ == "__main__":
    main()
