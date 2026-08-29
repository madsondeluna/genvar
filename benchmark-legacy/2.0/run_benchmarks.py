#!/usr/bin/env python3
"""
GenVar benchmark suite.

Requires: backend running at --url (default http://localhost:8000)
          Redis running at --redis (default redis://localhost:6379)

Usage:
  cd benchmark
  pip install -r requirements.txt
  python run_benchmarks.py                        # all suites
  python run_benchmarks.py --suite latency
  python run_benchmarks.py --suite exhaustion
  python run_benchmarks.py --suite errors
  python run_benchmarks.py --suite comparison
  python run_benchmarks.py --suite completeness
  python run_benchmarks.py --out results/local        # local environment (default)
  python run_benchmarks.py --out results/docker       # containerized run, for plot_comparison.py
"""
import argparse
import asyncio
import sys
from pathlib import Path

import httpx
from rich.console import Console

sys.path.insert(0, str(Path(__file__).parent))

from suites import latency, exhaustion, errors, comparison, completeness, payload

BACKEND_URL = "http://localhost:8000"
REDIS_URL = "redis://localhost:6379"
RESULTS_DIR = Path(__file__).parent / "results" / "local"

console = Console()


async def check_backend(url: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{url}/health", timeout=5.0)
            return r.status_code == 200
    except Exception:
        return False


async def main() -> None:
    parser = argparse.ArgumentParser(description="GenVar benchmark suite")
    parser.add_argument("--url", default=BACKEND_URL, help="Backend base URL")
    parser.add_argument("--redis", default=REDIS_URL, help="Redis URL")
    parser.add_argument(
        "--suite",
        default="all",
        choices=["all", "latency", "exhaustion", "errors", "comparison", "completeness",
                 "payload"],
    )
    parser.add_argument("--out", default=str(RESULTS_DIR), help="Output directory for CSVs")
    args = parser.parse_args()

    results_dir = Path(args.out)
    results_dir.mkdir(parents=True, exist_ok=True)

    console.print(f"\n[bold]GenVar Benchmark Suite[/bold]")
    console.print(f"  Backend : {args.url}")
    console.print(f"  Redis   : {args.redis}")
    console.print(f"  Output  : {results_dir}")
    console.print(f"  Suite   : {args.suite}")

    if not await check_backend(args.url):
        console.print(f"\n[bold red]Backend not reachable at {args.url}[/bold red]")
        console.print("  Start with: cd backend && uvicorn app.main:app --reload --port 8000")
        sys.exit(1)

    console.print(f"\n[green]Backend OK[/green]")

    run_all = args.suite == "all"

    if run_all or args.suite == "latency":
        await latency.run(args.url, args.redis, results_dir, console)

    if run_all or args.suite == "exhaustion":
        await exhaustion.run(args.url, args.redis, results_dir, console)

    if run_all or args.suite == "errors":
        await errors.run(args.url, results_dir, console)

    if run_all or args.suite == "comparison":
        await comparison.run(args.url, args.redis, results_dir, console)

    if run_all or args.suite == "completeness":
        await completeness.run(args.url, results_dir, console)

    if run_all or args.suite == "payload":
        await payload.run(args.url, results_dir, console)

    console.print(f"\n[bold green]Done.[/bold green] Results in {results_dir}/")


if __name__ == "__main__":
    asyncio.run(main())
