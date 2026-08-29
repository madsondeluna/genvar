"""
Exhaustion suite: measures system behavior under increasing sequential and concurrent load.

Phase 1 (cold, sequential): three rate levels (0.5, 1, 2 req/s), cache flushed per batch.
Phase 2 (warm, concurrent): cache pre-warmed, then bursts of 5/10/20 concurrent requests.

Outputs: results/exhaustion.csv
"""
import asyncio
import csv
import time
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

TEST_SUBJECTS = [
    ("gene", "MLH1"),
    ("gene", "HBB"),
    ("gene", "LDLR"),
    ("variant", "rs334"),
    ("variant", "rs1800562"),
    ("variant", "rs6025"),
]
BATCH_SIZE = 6  # one pass through all subjects per batch
RATE_LEVELS = [
    ("0.5 req/s", 2.0),
    ("1 req/s", 1.0),
    ("2 req/s", 0.5),
]
CONCURRENCY_LEVELS = [5, 10, 20]


def _flush_redis(redis_url: str, console: Console) -> None:
    try:
        import redis as redis_lib
        r = redis_lib.from_url(redis_url, decode_responses=True)
        r.flushdb()
    except Exception:
        console.print("  [yellow]Redis unavailable, cold exhaustion run may have residual cache[/yellow]")


def _url(backend_url: str, endpoint: str, target: str) -> str:
    return f"{backend_url}/api/{endpoint}/{target}"


async def _call(client: httpx.AsyncClient, url: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=60.0)
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        return {"elapsed_ms": elapsed, "status": r.status_code, "ok": r.status_code == 200, "error": ""}
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        return {"elapsed_ms": elapsed, "status": 0, "ok": False, "error": str(e)[:80]}


async def _prewarm(client: httpx.AsyncClient, backend_url: str, console: Console) -> None:
    console.print("  [dim]Pre-warming cache...[/dim]")
    for endpoint, target in TEST_SUBJECTS:
        await _call(client, _url(backend_url, endpoint, target))
        await asyncio.sleep(1.5)


async def run(backend_url: str, redis_url: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold cyan]Suite 2: Exhaustion[/bold cyan]")
    rows = []

    async with httpx.AsyncClient() as client:

        # Phase 1: sequential, cold, increasing rate
        console.print("  Phase 1: sequential cold load")
        for rate_label, delay_s in RATE_LEVELS:
            _flush_redis(redis_url, console)
            t_batch_start = time.perf_counter()
            batch_errors = 0

            for endpoint, target in TEST_SUBJECTS:
                result = await _call(client, _url(backend_url, endpoint, target))
                if not result["ok"]:
                    batch_errors += 1
                rows.append({
                    "phase": "sequential_cold",
                    "rate": rate_label,
                    "concurrency": 1,
                    "endpoint": endpoint,
                    "target": target,
                    **result,
                })
                await asyncio.sleep(delay_s)

            batch_elapsed = round((time.perf_counter() - t_batch_start) * 1000, 2)
            console.print(f"  {rate_label:10s}: batch_time={batch_elapsed:.0f}ms  errors={batch_errors}/{BATCH_SIZE}")

        # Phase 2: concurrent, warm cache
        console.print("  Phase 2: concurrent warm load")
        await _prewarm(client, backend_url, console)

        for concurrency in CONCURRENCY_LEVELS:
            # Build task list: repeat subjects to fill concurrency slots
            tasks_input = []
            for i in range(concurrency):
                ep, tgt = TEST_SUBJECTS[i % len(TEST_SUBJECTS)]
                tasks_input.append((ep, tgt))

            t0 = time.perf_counter()
            results = await asyncio.gather(
                *[_call(client, _url(backend_url, ep, tgt)) for ep, tgt in tasks_input]
            )
            total_elapsed = round((time.perf_counter() - t0) * 1000, 2)
            errors = sum(1 for r in results if not r["ok"])
            times = [r["elapsed_ms"] for r in results if r["ok"]]
            avg = round(sum(times) / len(times), 2) if times else 0

            for (ep, tgt), result in zip(tasks_input, results):
                rows.append({
                    "phase": "concurrent_warm",
                    "rate": "burst",
                    "concurrency": concurrency,
                    "endpoint": ep,
                    "target": tgt,
                    **result,
                })

            console.print(
                f"  concurrency={concurrency:3d}: total={total_elapsed:.0f}ms  avg_per_req={avg:.1f}ms  errors={errors}/{concurrency}"
            )

    out_path = results_dir / "exhaustion.csv"
    fields = ["phase", "rate", "concurrency", "endpoint", "target", "elapsed_ms", "status", "ok", "error"]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})

    table = Table(title="Concurrent Throughput (warm cache)")
    table.add_column("Concurrency", justify="right")
    table.add_column("Total time (ms)", justify="right")
    table.add_column("Avg/req (ms)", justify="right")
    table.add_column("Errors", justify="right")

    for concurrency in CONCURRENCY_LEVELS:
        batch = [r for r in rows if r["phase"] == "concurrent_warm" and r["concurrency"] == concurrency]
        times = [r["elapsed_ms"] for r in batch if r["ok"]]
        errs = sum(1 for r in batch if not r["ok"])
        if times:
            table.add_row(str(concurrency), str(round(max(times), 1)), str(round(sum(times) / len(times), 1)), str(errs))

    console.print(table)
    console.print(f"  [dim]Saved {out_path.name}[/dim]")
