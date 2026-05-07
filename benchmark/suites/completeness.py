"""
Completeness suite: measures what fraction of response fields are non-null per endpoint.

Counts all top-level fields, list fields (non-empty = filled), and nested scalar fields.
Identifies consistently-null fields (API limitations) across all test subjects.

Outputs: results/completeness.csv, results/completeness_null_fields.csv
"""
import asyncio
import csv
from pathlib import Path
from collections import defaultdict

import httpx
from rich.console import Console
from rich.table import Table

TEST_GENES = ["MLH1", "HBB", "LDLR", "RB1", "VHL", "MSH2"]
TEST_VARIANTS = ["rs334", "rs1800562", "rs6025", "rs1799853"]


def _is_filled(value) -> bool:
    if value is None:
        return False
    if isinstance(value, (list, dict)):
        return len(value) > 0
    if isinstance(value, str):
        return value.strip() != ""
    return True


def _score_response(data: dict) -> dict:
    """Returns field-level fill status for a flat + one-level-deep JSON response."""
    result = {}
    for key, value in data.items():
        if isinstance(value, dict):
            for subkey, subvalue in value.items():
                result[f"{key}.{subkey}"] = _is_filled(subvalue)
        else:
            result[key] = _is_filled(value)
    return result


async def _fetch(client: httpx.AsyncClient, url: str) -> dict | None:
    try:
        r = await client.get(url, timeout=60.0)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


async def run(backend_url: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold cyan]Suite 5: Data Completeness[/bold cyan]")

    rows = []
    field_fill_tracker: dict = defaultdict(lambda: {"filled": 0, "total": 0})

    async with httpx.AsyncClient() as client:
        for endpoint, targets in [("gene", TEST_GENES), ("variant", TEST_VARIANTS)]:
            for target in targets:
                url = f"{backend_url}/api/{endpoint}/{target}"
                data = await _fetch(client, url)

                if data is None:
                    console.print(f"  [yellow]No response for {endpoint}/{target}[/yellow]")
                    continue

                field_scores = _score_response(data)
                filled = sum(1 for v in field_scores.values() if v)
                total = len(field_scores)
                score = round(filled / total * 100, 1) if total > 0 else 0.0

                rows.append({
                    "endpoint": endpoint,
                    "target": target,
                    "total_fields": total,
                    "filled_fields": filled,
                    "null_fields": total - filled,
                    "completeness_pct": score,
                })

                for field, is_filled in field_scores.items():
                    tracker_key = (endpoint, field)
                    field_fill_tracker[tracker_key]["total"] += 1
                    if is_filled:
                        field_fill_tracker[tracker_key]["filled"] += 1

                console.print(f"  {endpoint}/{target:<12s}: {filled}/{total} fields filled  ({score}%)")
                await asyncio.sleep(0.3)

    out_path = results_dir / "completeness.csv"
    fields = ["endpoint", "target", "total_fields", "filled_fields", "null_fields", "completeness_pct"]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow(row)

    # Consistently null fields (never filled across all subjects for that endpoint)
    null_path = results_dir / "completeness_null_fields.csv"
    null_rows = []
    for (endpoint, field), counts in sorted(field_fill_tracker.items()):
        fill_rate = round(counts["filled"] / counts["total"] * 100, 1) if counts["total"] > 0 else 0.0
        null_rows.append({
            "endpoint": endpoint,
            "field": field,
            "fill_rate_pct": fill_rate,
            "filled_n": counts["filled"],
            "total_n": counts["total"],
        })
    null_rows.sort(key=lambda r: r["fill_rate_pct"])

    with open(null_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["endpoint", "field", "fill_rate_pct", "filled_n", "total_n"])
        w.writeheader()
        for row in null_rows:
            w.writerow(row)

    # Summary table by endpoint
    table = Table(title="Average Completeness by Endpoint")
    table.add_column("Endpoint")
    table.add_column("Subjects", justify="right")
    table.add_column("Avg completeness", justify="right")
    table.add_column("Always-null fields", justify="right")

    for endpoint in ("gene", "variant"):
        ep_rows = [r for r in rows if r["endpoint"] == endpoint]
        if not ep_rows:
            continue
        avg = round(sum(r["completeness_pct"] for r in ep_rows) / len(ep_rows), 1)
        always_null = sum(
            1 for (ep, _), c in field_fill_tracker.items()
            if ep == endpoint and c["filled"] == 0
        )
        table.add_row(endpoint, str(len(ep_rows)), f"{avg}%", str(always_null))

    console.print(table)
    console.print(f"  [dim]Saved {out_path.name}, {null_path.name}[/dim]")
