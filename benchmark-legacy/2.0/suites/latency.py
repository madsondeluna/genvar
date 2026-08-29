"""
Latency suite: measures response time per endpoint with cold (no cache) and warm (cached) runs.
Outputs: results/latency_raw.csv, results/latency_stats.csv
"""
import asyncio
import csv
import time
from collections import defaultdict
from pathlib import Path
from statistics import mean, median, stdev

import httpx
from rich.console import Console
from rich.table import Table

from ._targets import GENES as TEST_GENES, VARIANTS as TEST_VARIANTS
N_COLD = 12
N_WARM = 20
COLD_DELAY_S = 2.0


def _flush_redis(redis_url: str, console: Console) -> None:
    try:
        import redis as redis_lib
        r = redis_lib.from_url(redis_url, decode_responses=True)
        r.flushdb()
        console.print("  [dim]Redis flushed[/dim]")
    except Exception as e:
        console.print(f"  [yellow]Redis unavailable ({e}), cold run may have residual cache[/yellow]")


async def _call(client: httpx.AsyncClient, url: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=60.0)
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "elapsed_ms": elapsed,
            "server_ms": r.headers.get("X-Response-Time-Ms", ""),
            "status": r.status_code,
            "ok": r.status_code == 200,
            "error": "",
        }
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        return {"elapsed_ms": elapsed, "server_ms": "", "status": 0, "ok": False, "error": str(e)[:80]}


def _stats(values: list) -> dict:
    if not values:
        return {"n": 0, "mean": 0, "median": 0, "p95": 0, "p99": 0, "min": 0, "max": 0, "std": 0}
    s = sorted(values)
    n = len(s)
    p95 = s[min(int(n * 0.95), n - 1)]
    p99 = s[min(int(n * 0.99), n - 1)]
    return {
        "n": n,
        "mean": round(mean(values), 2),
        "median": round(median(values), 2),
        "p95": round(p95, 2),
        "p99": round(p99, 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "std": round(stdev(values), 2) if n > 1 else 0.0,
    }


async def run(backend_url: str, redis_url: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold cyan]Suite 1: Latency[/bold cyan]")
    rows = []

    async with httpx.AsyncClient() as client:
        for phase, n_runs, delay in [("cold", N_COLD, COLD_DELAY_S), ("warm", N_WARM, 0.3)]:
            if phase == "cold":
                _flush_redis(redis_url, console)

            for endpoint, targets in [("gene", TEST_GENES), ("variant", TEST_VARIANTS)]:
                for target in targets:
                    path = f"/api/gene/{target}" if endpoint == "gene" else f"/api/variant/{target}"
                    url = f"{backend_url}{path}"
                    timings = []

                    for i in range(n_runs):
                        result = await _call(client, url)
                        timings.append(result["elapsed_ms"])
                        rows.append({"phase": phase, "endpoint": endpoint, "target": target, "run": i + 1, **result})
                        await asyncio.sleep(delay)

                    s = _stats(timings)
                    console.print(f"  {phase:4s}  /{endpoint}/{target:<12s}  mean={s['mean']:>8.1f}ms  p95={s['p95']:>8.1f}ms")

    raw_path = results_dir / "latency_raw.csv"
    with open(raw_path, "w", newline="") as f:
        fields = ["phase", "endpoint", "target", "run", "elapsed_ms", "server_ms", "status", "ok", "error"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})

    groups: dict = defaultdict(list)
    for row in rows:
        groups[(row["phase"], row["endpoint"], row["target"])].append(row["elapsed_ms"])

    stats_path = results_dir / "latency_stats.csv"
    with open(stats_path, "w", newline="") as f:
        fields = ["phase", "endpoint", "target", "n", "mean", "median", "p95", "p99", "min", "max", "std"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for (phase, endpoint, target), times in sorted(groups.items()):
            s = _stats(times)
            w.writerow({"phase": phase, "endpoint": endpoint, "target": target, **s})

    # Cache speedup summary
    table = Table(title="Cache Speedup (cold_mean / warm_mean)")
    table.add_column("Endpoint")
    table.add_column("Target")
    table.add_column("Cold mean (ms)", justify="right")
    table.add_column("Warm mean (ms)", justify="right")
    table.add_column("Speedup", justify="right")

    for endpoint in ("gene", "variant"):
        targets = TEST_GENES if endpoint == "gene" else TEST_VARIANTS
        for target in targets:
            cold = _stats(groups.get(("cold", endpoint, target), []))
            warm = _stats(groups.get(("warm", endpoint, target), []))
            speedup = round(cold["mean"] / warm["mean"], 1) if warm["mean"] > 0 else "N/A"
            table.add_row(endpoint, target, str(cold["mean"]), str(warm["mean"]), str(speedup) + "x")

    console.print(table)
    console.print(f"  [dim]Saved {raw_path.name}, {stats_path.name}[/dim]")
