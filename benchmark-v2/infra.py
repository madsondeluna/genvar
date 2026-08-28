#!/usr/bin/env python3
"""
Infraestrutura: catalogos, limitador de taxa e pacote entregue.

Tres suites que nao tocam o pipeline de VCF nem as consultas de API, e por isso
ficam num executor proprio: o que elas medem e o que a plataforma CARREGA (os
catalogos versionados), o que ela PROTEGE (o acesso do projeto as fontes) e o
que ela ENTREGA ao navegador (o pacote e o custo de provar que continua certa).

Uso:
  python3 benchmark-v2/infra.py                 # as tres
  python3 benchmark-v2/infra.py --suite dados   # so os catalogos, sem backend
  python3 benchmark-v2/infra.py --suite limite  # precisa do backend no ar
  python3 benchmark-v2/infra.py --suite build --sem-testes
"""
import argparse
import asyncio
import sys
from pathlib import Path

import httpx
from rich.console import Console

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from suites import dados, limite, build  # noqa: E402

console = Console()


async def backend_no_ar(url: str) -> bool:
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{url}/health", timeout=5.0)
            return r.status_code == 200
    except Exception:
        return False


async def main():
    ap = argparse.ArgumentParser(description="Infraestrutura da plataforma")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--suite", default="all",
                    choices=["all", "dados", "limite", "build"])
    ap.add_argument("--sem-testes", action="store_true",
                    help="Na suite build, mede so o pacote e nao roda os testes")
    ap.add_argument("--saida", default=str(AQUI / "resultados"))
    args = ap.parse_args()

    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    todas = args.suite == "all"

    console.print("\n[bold]Infraestrutura[/bold]")
    console.print(f"  saida: {saida}")

    # Estas duas leem disco e nao tocam a rede: rodam sem backend no ar.
    if todas or args.suite == "dados":
        await dados.run(saida, console)
    if todas or args.suite == "build":
        await build.run(saida, console, com_testes=not args.sem_testes)

    if todas or args.suite == "limite":
        if await backend_no_ar(args.url):
            await limite.run(args.url, saida, console)
        else:
            console.print(f"  [yellow]Backend fora do ar em {args.url}; "
                          "a suite do limitador foi pulada.[/yellow]")

    console.print(f"\n[bold green]Concluido.[/bold green] Resultados em {saida}/")


if __name__ == "__main__":
    asyncio.run(main())
