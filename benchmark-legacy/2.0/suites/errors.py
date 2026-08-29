"""
Error suite: validates error handling for invalid and edge-case inputs.

Tests: malformed gene symbols, invalid rsIDs, boundary inputs.
Expected: HTTP 404 or 422 with JSON error body; no 500s.
Outputs: results/errors.csv
"""
import asyncio
import csv
import time
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

GENE_CASES = [
    ("invalid_name",    "FAKEGENE123",          404),
    ("special_chars",   "!@#$%^",               422),
    ("too_long",        "A" * 60,               422),
    ("digits_only",     "123456",               422),
    ("lowercase_valid", "mlh1",                 200),  # should normalize
    ("mixed_case",      "mLh1",                 200),  # should normalize
    ("empty_path",      "_",                    422),  # path will be /api/gene/_
    ("invalid_underscore", "ACTB_MOUSE",        422),  # underscore not allowed by the symbol regex
]

VARIANT_CASES = [
    ("invalid_rsid",    "rs0",                  404),
    ("no_rs_prefix",    "1234567",              422),
    ("letters_in_rsid", "rsABC",                422),
    ("uppercase_rs",    "RS334",                200),  # validate_rsid lowercases, so RS334 -> rs334
    ("too_long_rsid",   "rs" + "9" * 20,        422),
    ("valid_known",     "rs334",                200),  # sanity check
]


async def _call(client: httpx.AsyncClient, url: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=30.0)
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        try:
            body = r.json()
        except Exception:
            body = {}
        detail = body.get("detail", "") if isinstance(body, dict) else ""
        return {
            "elapsed_ms": elapsed,
            "status": r.status_code,
            "detail": str(detail)[:120],
        }
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        return {"elapsed_ms": elapsed, "status": 0, "detail": str(e)[:120]}


async def run(backend_url: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold cyan]Suite 3: Error Handling[/bold cyan]")
    rows = []

    async with httpx.AsyncClient() as client:
        for endpoint, cases in [("gene", GENE_CASES), ("variant", VARIANT_CASES)]:
            console.print(f"  Testing /api/{endpoint}/*")
            for label, input_val, expected_status in cases:
                url = f"{backend_url}/api/{endpoint}/{input_val}"
                result = await _call(client, url)
                correct = result["status"] == expected_status
                marker = "[green]PASS[/green]" if correct else "[red]FAIL[/red]"
                console.print(
                    f"  {marker} [{label}] input={input_val!r:25s} expected={expected_status} got={result['status']}"
                )
                rows.append({
                    "endpoint": endpoint,
                    "label": label,
                    "input": input_val,
                    "expected_status": expected_status,
                    "actual_status": result["status"],
                    "pass": correct,
                    "elapsed_ms": result["elapsed_ms"],
                    "detail": result["detail"],
                })
                await asyncio.sleep(0.5)

    out_path = results_dir / "errors.csv"
    fields = ["endpoint", "label", "input", "expected_status", "actual_status", "pass", "elapsed_ms", "detail"]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})

    total = len(rows)
    passed = sum(1 for r in rows if r["pass"])
    failed = total - passed
    server_errors = sum(1 for r in rows if str(r["actual_status"]).startswith("5"))

    table = Table(title="Error Handling Summary")
    table.add_column("Result", justify="center")
    table.add_column("Count", justify="right")
    table.add_row("Pass", str(passed))
    table.add_row("[red]Fail[/red]", str(failed))
    table.add_row("[bold red]Server errors (5xx)[/bold red]", str(server_errors))
    table.add_row("Total", str(total))
    console.print(table)
    console.print(f"  [dim]Saved {out_path.name}[/dim]")
