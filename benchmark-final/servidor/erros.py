#!/usr/bin/env python3
"""
Tratamento de erro: entrada invalida devolve 4xx com corpo util, nunca 500.

O CRITERIO E BINARIO E ESTA DECLARADO ANTES DE MEDIR. Uma resposta e aceita
quando o codigo esta na faixa esperada para aquele caso E o corpo e JSON com uma
mensagem. Um 500 e falha mesmo que a mensagem seja boa: significa que a excecao
chegou ao topo sem ser tratada, e num servico publico isso vaza rastro de pilha.
Um 200 onde se esperava 404 tambem e falha, e mais grave que o inverso: devolver
corpo vazio com sucesso faz o cliente exibir uma pagina em branco em vez de dizer
que nao encontrou.

A 2.0 cobria duas familias de rota. A 3.0 tem vinte, e cada tipo de
identificador tem a sua propria validacao: simbolo HGNC por expressao regular,
rsID por `^rs\\d+$`, e os identificadores de doenca, painel e escore por
existencia no catalogo. Os casos de borda abaixo exercitam as tres formas.

Uso:
  python3 benchmark-final/servidor/erros.py --url http://localhost:8000 --rotulo local
"""
import argparse
import asyncio
import sys
from pathlib import Path
from urllib.parse import quote

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ))

import comum  # noqa: E402
import httpx  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

console = Console()

# (familia, caso, caminho, codigos aceitos)
CASOS = [
    ("gene", "simbolo inexistente", "/api/gene/FAKEGENE123", (404,)),
    ("gene", "caracteres especiais", f"/api/gene/{quote('!@#$%^')}", (400, 404, 422)),
    ("gene", "comprimento absurdo", "/api/gene/" + "A" * 60, (400, 404, 422)),
    ("gene", "so digitos", "/api/gene/123456", (400, 404, 422)),
    ("gene", "minusculas de simbolo valido", "/api/gene/mlh1", (200,)),
    ("gene", "espaco no meio", f"/api/gene/{quote('BR CA1')}", (400, 404, 422)),
    ("gene", "injecao de caminho", f"/api/gene/{quote('../../etc/passwd')}", (400, 404, 422)),
    ("gene", "variantes de gene inexistente", "/api/gene/FAKEGENE123/variants", (404,)),
    ("gene", "fenotipos de gene inexistente", "/api/gene/FAKEGENE123/phenotypes", (404,)),
    ("variante", "rsid sem digitos", "/api/variant/rsABC", (400, 404, 422)),
    # rs999999999 EXISTE (chr6:58.247.859, G>A): conferido no Ensembl em
    # 2026-08-29. O caso original usava esse identificador supondo que nao
    # existisse, e reprovava a API por acertar. Onze digitos passa do maior rsID
    # atribuido e nao casa com nada.
    ("variante", "rsid inexistente", "/api/variant/rs99999999999", (404,)),
    ("variante", "sem prefixo rs", "/api/variant/334", (400, 404, 422)),
    ("variante", "rsid negativo", "/api/variant/rs-1", (400, 404, 422)),
    ("variante", "rsid gigante", "/api/variant/rs" + "9" * 30, (400, 404, 422)),
    ("doenca", "identificador inexistente", "/api/disease/doenca-que-nao-existe", (404,)),
    ("doenca", "identificador vazio", "/api/disease/%20", (400, 404, 422)),
    ("doenca", "variantes de doenca inexistente", "/api/disease/nao-existe/variants", (404,)),
    ("painel", "identificador inexistente", "/api/panel/painel-que-nao-existe", (404,)),
    ("painel", "injecao de caminho", f"/api/panel/{quote('../../etc/passwd')}", (400, 404, 422)),
    ("escore", "identificador fora do padrao", "/api/pgs/ABC123", (400, 404, 422)),
    ("escore", "escore inexistente", "/api/pgs/PGS999999", (404,)),
    ("sugestao", "consulta vazia", "/api/suggest?q=", (200, 400, 422)),
    ("sugestao", "consulta de um caractere", "/api/suggest?q=B", (200,)),
    ("sugestao", "consulta gigante", "/api/suggest?q=" + "A" * 300, (200, 400, 414, 422)),
    ("meta", "rota inexistente", "/api/nao-existe", (404,)),
    ("meta", "metodo em rota de leitura", "/api/gene/MLH1", (200,)),
]


async def main():
    ap = argparse.ArgumentParser(description="Tratamento de erro")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--rotulo", default="local")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    args = ap.parse_args()

    console.print(f"\n[bold]Tratamento de erro[/bold]  ({args.rotulo})")
    linhas = []
    async with httpx.AsyncClient() as cliente:
        for familia, caso, caminho, aceitos in CASOS:
            try:
                r = await cliente.get(args.url + caminho, timeout=180.0)
                status, corpo = r.status_code, r.text[:400]
                try:
                    json_ok = isinstance(r.json(), (dict, list))
                except Exception:
                    json_ok = False
            except Exception as e:
                status, corpo, json_ok = 0, f"excecao: {type(e).__name__}", False

            ok = status in aceitos and json_ok and status != 500
            linhas.append({
                "rotulo": args.rotulo, "familia": familia, "caso": caso,
                "caminho": caminho, "esperado": "|".join(str(a) for a in aceitos),
                "status": status, "corpo_json": json_ok, "aprovado": ok,
                "trecho": corpo.replace("\n", " ")[:200],
            })
            cor = "green" if ok else "red"
            console.print(f"  [{cor}]{'ok ' if ok else 'FALHA'}[/{cor}] "
                          f"{familia:<10} {caso:<32} {status}")

    comum.grava_csv(Path(args.saida) / "erros.csv", linhas)
    aprovados = sum(1 for l in linhas if l["aprovado"])
    quinhentos = sum(1 for l in linhas if l["status"] == 500)

    t = Table(title=f"Tratamento de erro ({args.rotulo})")
    for c in ("Familia", "Casos", "Aprovados", "500"):
        t.add_column(c, justify="left" if c == "Familia" else "right")
    for familia in dict.fromkeys(f for f, *_ in CASOS):
        ls = [l for l in linhas if l["familia"] == familia]
        t.add_row(familia, str(len(ls)), str(sum(1 for l in ls if l["aprovado"])),
                  str(sum(1 for l in ls if l["status"] == 500)))
    t.add_row("[bold]total[/bold]", f"[bold]{len(linhas)}[/bold]",
              f"[bold]{aprovados}[/bold]", f"[bold]{quinhentos}[/bold]")
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
