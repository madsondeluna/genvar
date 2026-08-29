"""
Custo de construir e de verificar: pacote entregue ao navegador e suites de teste.

Tres numeros que nenhuma suite de rede alcanca e que decidem a primeira visita
e o ciclo de trabalho: quanto pesa o JavaScript que o navegador baixa, quanto
dele e carregado de imediato contra o que espera a rota, e quanto tempo leva
para provar que a aplicacao continua correta.

O pacote e medido em disco E comprimido, porque o servidor entrega comprimido e
citar o numero cru infla o resultado em cerca de tres vezes.

Saida: results/build_pacote.csv, results/build_testes.csv
"""
import csv
import gzip
import subprocess
import sys
import time
from pathlib import Path

from rich.console import Console
from rich.table import Table

RAIZ = Path(__file__).resolve().parents[2]
DIST = RAIZ / "frontend" / "dist"

# Entrada da aplicacao contra o resto: o primeiro grupo e o que atrasa a
# primeira tela, o segundo so chega quando a rota e visitada.
def _papel(nome: str) -> str:
    if "index" in nome and nome.endswith(".js"):
        return "entrada"
    if nome.endswith(".css"):
        return "estilo"
    return "rota ou biblioteca"


def _pacote(console: Console) -> list[dict]:
    if not DIST.exists():
        console.print("  [yellow]frontend/dist nao existe; rode `npm run build` antes[/yellow]")
        return []
    linhas = []
    for arq in sorted(DIST.rglob("*")):
        if not arq.is_file() or arq.name.startswith("._"):
            continue
        if arq.suffix not in (".js", ".css"):
            continue
        bruto = arq.read_bytes()
        linhas.append({
            "arquivo": str(arq.relative_to(DIST)),
            "papel": _papel(arq.name),
            "tipo": arq.suffix.lstrip("."),
            "bytes": len(bruto),
            "kb": round(len(bruto) / 1024, 1),
            "kb_gzip": round(len(gzip.compress(bruto, 9)) / 1024, 1),
        })
    return linhas


def _testes(console: Console) -> list[dict]:
    """Roda as duas suites e cronometra. O tempo e do processo inteiro,
    incluindo a subida do runner, porque e esse o tempo que o autor espera."""
    casos = [
        ("frontend (vitest)", ["npm", "run", "test", "--", "--run"], RAIZ / "frontend"),
        # `sys.executable` e nao "python": em macOS com Homebrew so existe `python3`,
        # e o `python` cru falha com FileNotFoundError, que a suite registrava
        # como codigo -1 e zero testes, ou seja, como se a suite nao existisse.
        ("backend (pytest)", [sys.executable, "-m", "pytest", "-q"], RAIZ / "backend"),
    ]
    linhas = []
    for nome, cmd, cwd in casos:
        t0 = time.perf_counter()
        try:
            p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=900)
            saida = (p.stdout or "") + (p.stderr or "")
            rc = p.returncode
        except Exception as e:
            saida, rc = str(e), -1
        seg = time.perf_counter() - t0
        # Contagem tirada da saida do proprio runner, e nao de um numero
        # escrito a mao aqui: teste novo entra na conta sozinho.
        passou = 0
        for linha in saida.splitlines():
            l = linha.strip()
            if "passed" in l and rc == 0:
                for pedaco in l.replace("(", " ").replace(")", " ").split():
                    if pedaco.isdigit():
                        passou = max(passou, int(pedaco))
            if l.startswith("Tests ") and "passed" in l:
                for pedaco in l.split():
                    if pedaco.isdigit():
                        passou = max(passou, int(pedaco))
        linhas.append({
            "suite": nome,
            "codigo_saida": rc,
            "segundos": round(seg, 2),
            "testes": passou,
        })
        cor = "green" if rc == 0 else "red"
        console.print(f"  [{cor}]{nome:20} {seg:6.1f} s, {passou} testes, saida {rc}[/{cor}]")
    return linhas


async def run(results_dir: Path, console: Console, com_testes: bool = True) -> None:
    console.print("\n[bold]Pacote e verificacao[/bold]")

    pacote = _pacote(console)
    if pacote:
        with (results_dir / "build_pacote.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(pacote[0].keys()))
            w.writeheader()
            w.writerows(pacote)

        t = Table(title="Pacote entregue ao navegador")
        for c in ("Papel", "Arquivos", "KB em disco", "KB comprimido"):
            t.add_column(c, justify="right" if c != "Papel" else "left")
        for papel in ("entrada", "estilo", "rota ou biblioteca"):
            g = [l for l in pacote if l["papel"] == papel]
            if not g:
                continue
            t.add_row(papel, str(len(g)),
                      f'{sum(l["kb"] for l in g):.0f}',
                      f'{sum(l["kb_gzip"] for l in g):.0f}')
        t.add_row("total", str(len(pacote)),
                  f'{sum(l["kb"] for l in pacote):.0f}',
                  f'{sum(l["kb_gzip"] for l in pacote):.0f}')
        console.print(t)

    if not com_testes:
        return
    testes = _testes(console)
    with (results_dir / "build_testes.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(testes[0].keys()))
        w.writeheader()
        w.writerows(testes)
