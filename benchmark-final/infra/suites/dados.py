"""
Camada de dados: tamanho, compressao e custo de leitura de cada catalogo.

Mede o que o usuario baixa e o que o servidor carrega. Sao numeros que nenhuma
suite anterior tocava, e que decidem tres coisas praticas: quanto pesa a
primeira visita, quanto o repositorio cresce a cada versao do ClinVar, e quanto
tempo o backend leva para subir.

A razao de compressao entra porque ela e o argumento da decisao de gravar em
gzip: 157 MB de JSON cru contra 27 MB comprimidos foi o que permitiu versionar
os catalogos em vez de baixa-los em tempo de execucao.

Saida: results/dados_catalogos.csv, results/dados_resumo.csv
"""
import csv
import gzip
import json
import time
from pathlib import Path

from rich.console import Console
from rich.table import Table

# benchmark-final/infra/suites/ e um nivel mais fundo que
# benchmark-v2/suites/, de onde estes arquivos vieram.
RAIZ = Path(__file__).resolve().parents[3]

# Pasta, para que serve, e se o arquivo vai para o navegador ou fica no servidor.
GRUPOS = [
    ("frontend/public/data/clinvar", "Anotacao clinica", "navegador"),
    ("frontend/public/data/paineis", "Paineis e sinonimos", "navegador"),
    ("frontend/public/data/farmaco", "ClinGen e CPIC", "navegador"),
    ("frontend/public/data/burden", "Coordenadas e associacao", "navegador"),
    ("backend/app/data", "Catalogos servidos pela API", "servidor"),
]


def _linhas_json(caminho: Path) -> int:
    """Numero de registros do arquivo, pela chave que cada formato usa."""
    try:
        abrir = gzip.open if caminho.suffix == ".gz" else open
        with abrir(caminho, "rt", encoding="utf-8") as fh:
            d = json.load(fh)
    except Exception:
        return 0
    if isinstance(d, list):
        return len(d)
    if not isinstance(d, dict):
        return 0
    # Cada catalogo nomeia a sua colecao de um jeito (`paineis`, `alias`,
    # `genes`, `por_rsid`), e a lista de nomes conhecidos envelhece a cada ETL
    # novo, devolvendo zero em silencio. A maior colecao do primeiro nivel e o
    # conteudo; o resto e cabecalho de procedencia.
    maior = 0
    for v in d.values():
        if isinstance(v, (list, dict)):
            maior = max(maior, len(v))
        elif isinstance(v, int):
            maior = max(maior, v)
    return maior


async def run(results_dir: Path, console: Console) -> None:
    console.print("\n[bold]Camada de dados[/bold]")

    linhas = []
    for rel, papel, onde in GRUPOS:
        pasta = RAIZ / rel
        if not pasta.exists():
            console.print(f"  [yellow]{rel} nao existe; pulado[/yellow]")
            continue
        for arq in sorted(pasta.rglob("*.json*")):
            if arq.name.startswith("._"):
                continue
            bytes_disco = arq.stat().st_size

            t0 = time.perf_counter()
            bruto = arq.read_bytes()
            ms_leitura = (time.perf_counter() - t0) * 1000

            comprimido = arq.suffix == ".gz"
            if comprimido:
                t1 = time.perf_counter()
                try:
                    cru = gzip.decompress(bruto)
                except Exception:
                    cru = b""
                ms_descompressao = (time.perf_counter() - t1) * 1000
            else:
                cru, ms_descompressao = bruto, 0.0

            t2 = time.perf_counter()
            registros = _linhas_json(arq)
            ms_parse = (time.perf_counter() - t2) * 1000

            linhas.append({
                "grupo": rel,
                "papel": papel,
                "onde": onde,
                "arquivo": arq.name,
                "comprimido": comprimido,
                "bytes_disco": bytes_disco,
                "mb_disco": round(bytes_disco / 1048576, 3),
                "bytes_cru": len(cru),
                "mb_cru": round(len(cru) / 1048576, 3),
                "razao_compressao": round(len(cru) / bytes_disco, 2) if comprimido and bytes_disco else 1.0,
                "registros": registros,
                "bytes_por_registro": round(bytes_disco / registros, 1) if registros else "",
                "ms_leitura": round(ms_leitura, 2),
                "ms_descompressao": round(ms_descompressao, 2),
                "ms_parse_json": round(ms_parse, 2),
            })

    if not linhas:
        console.print("  [yellow]Nenhum catalogo encontrado[/yellow]")
        return

    with (results_dir / "dados_catalogos.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(linhas[0].keys()))
        w.writeheader()
        w.writerows(linhas)

    # Resumo por grupo, que e o numero que se cita.
    resumo = {}
    for l in linhas:
        g = resumo.setdefault(l["grupo"], {
            "grupo": l["grupo"], "papel": l["papel"], "onde": l["onde"],
            "arquivos": 0, "mb_disco": 0.0, "mb_cru": 0.0, "registros": 0,
            "ms_leitura": 0.0, "ms_descompressao": 0.0, "ms_parse_json": 0.0,
        })
        g["arquivos"] += 1
        g["mb_disco"] += l["mb_disco"]
        g["mb_cru"] += l["mb_cru"]
        g["registros"] += l["registros"]
        for k in ("ms_leitura", "ms_descompressao", "ms_parse_json"):
            g[k] += l[k]

    for g in resumo.values():
        for k in ("mb_disco", "mb_cru"):
            g[k] = round(g[k], 2)
        for k in ("ms_leitura", "ms_descompressao", "ms_parse_json"):
            g[k] = round(g[k], 1)
        g["razao_compressao"] = round(g["mb_cru"] / g["mb_disco"], 2) if g["mb_disco"] else 1.0
        g["ms_total"] = round(g["ms_leitura"] + g["ms_descompressao"] + g["ms_parse_json"], 1)

    with (results_dir / "dados_resumo.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(next(iter(resumo.values())).keys()))
        w.writeheader()
        w.writerows(resumo.values())

    t = Table(title="Catalogos por grupo")
    for c in ("Grupo", "Onde", "Arq.", "MB em disco", "MB cru", "Razao", "Registros", "ms total"):
        t.add_column(c, justify="right" if c not in ("Grupo", "Onde") else "left")
    for g in resumo.values():
        t.add_row(g["grupo"].split("/")[-1], g["onde"], str(g["arquivos"]),
                  f'{g["mb_disco"]:.1f}', f'{g["mb_cru"]:.1f}',
                  f'{g["razao_compressao"]:.1f}x', f'{g["registros"]:,}'.replace(",", "."),
                  f'{g["ms_total"]:.0f}')
    console.print(t)

    total_nav = sum(g["mb_disco"] for g in resumo.values() if g["onde"] == "navegador")
    console.print(f"  [dim]O navegador baixa no maximo {total_nav:.1f} MB, e so os cromossomos "
                  f"presentes no arquivo do usuario.[/dim]")
