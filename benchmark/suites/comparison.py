"""
Comparison suite: sequential manual API simulation vs GenVar integrated endpoint.

Manual simulation: calls each external API in series (no parallelism, no cache),
replicating what a researcher does when consulting each database individually.

Human processing estimate: 900s per variant (15 min), based on ClinGen curation
workflow studies (Byers et al. 2022, J Med Genet; Landrum et al. 2018, NAR).

Speedup metrics:
  api_speedup    = sequential_api_time / genvar_uncached_time
  total_speedup  = (sequential_api_time + HUMAN_PROC_S) / genvar_uncached_time

Outputs: results/comparison.csv
"""
import asyncio
import csv
import time
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

HUMAN_PROC_S = 900.0  # seconds of human reading/copying per variant

TEST_VARIANTS = [
    # (rsid, chrom, pos, ref, alt)  -- pre-resolved to avoid extra lookup in simulation
    ("rs334",      "11", 5227002,  "T", "A"),
    ("rs1800562",  "6",  26093141, "G", "A"),
    ("rs6025",     "1",  169519049,"G", "A"),
    ("rs1799853",  "10", 94942290, "C", "T"),
]

ENSEMBL_VEP     = "https://rest.ensembl.org"
GNOMAD_API      = "https://gnomad.broadinstitute.org/api"
CLINVAR_EUTILS  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
MYVARIANT_API   = "https://myvariant.info/v1"

GNOMAD_QUERY = """
query V($id: String!, $ds: DatasetId!) {
  variant(variantId: $id, dataset: $ds) { variantId genome { ac an af } exome { ac an af } }
}
"""


def _flush_redis(redis_url: str) -> None:
    try:
        import redis as redis_lib
        r = redis_lib.from_url(redis_url, decode_responses=True)
        r.flushdb()
    except Exception:
        pass


async def _timed(coro) -> tuple:
    """Returns (result, elapsed_ms). On exception returns (None, elapsed_ms)."""
    t0 = time.perf_counter()
    try:
        result = await coro
        return result, round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        return None, round((time.perf_counter() - t0) * 1000, 2)


async def _manual_variant(client: httpx.AsyncClient, rsid: str, chrom: str, pos: int, ref: str, alt: str) -> dict:
    """Sequential calls to each external API, simulating manual workflow."""
    timings = {}

    # Step 1: Ensembl VEP
    _, t = await _timed(client.get(
        f"{ENSEMBL_VEP}/vep/human/id/{rsid}",
        params={"content-type": "application/json"},
        timeout=30.0,
    ))
    timings["ensembl_vep_ms"] = t
    await asyncio.sleep(0.5)

    # Step 2: gnomAD (needs chrom-pos-ref-alt from VEP step)
    variant_id = f"{chrom}-{pos}-{ref}-{alt}"
    _, t = await _timed(client.post(
        GNOMAD_API,
        json={"query": GNOMAD_QUERY, "variables": {"id": variant_id, "ds": "gnomad_r4"}},
        timeout=30.0,
    ))
    timings["gnomad_ms"] = t
    await asyncio.sleep(0.5)

    # Step 3: ClinVar (search + fetch first result)
    search_resp, t1 = await _timed(client.get(
        f"{CLINVAR_EUTILS}/esearch.fcgi",
        params={"db": "clinvar", "term": rsid, "retmode": "json", "retmax": "1"},
        timeout=20.0,
    ))
    timings["clinvar_search_ms"] = t1
    await asyncio.sleep(0.4)

    clinvar_fetch_ms = 0.0
    if search_resp is not None and search_resp.status_code == 200:
        ids = search_resp.json().get("esearchresult", {}).get("idlist", [])
        if ids:
            _, t2 = await _timed(client.get(
                f"{CLINVAR_EUTILS}/esummary.fcgi",
                params={"db": "clinvar", "id": ids[0], "retmode": "json"},
                timeout=20.0,
            ))
            clinvar_fetch_ms = t2
            await asyncio.sleep(0.4)
    timings["clinvar_fetch_ms"] = clinvar_fetch_ms

    # Step 4: MyVariant.info
    _, t = await _timed(client.get(
        f"{MYVARIANT_API}/query",
        params={"q": rsid, "fields": "cadd,revel,dbnsfp.alphamissense", "size": "1"},
        timeout=25.0,
    ))
    timings["myvariant_ms"] = t

    sequential_ms = sum(timings.values())
    return {**timings, "sequential_api_ms": round(sequential_ms, 2)}


async def run(backend_url: str, redis_url: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold cyan]Suite 4: Manual vs GenVar Comparison[/bold cyan]")
    rows = []

    async with httpx.AsyncClient() as client:
        for rsid, chrom, pos, ref, alt in TEST_VARIANTS:
            console.print(f"  Variant {rsid}")

            # Manual sequential simulation
            console.print("    [dim]running manual simulation...[/dim]")
            manual = await _manual_variant(client, rsid, chrom, pos, ref, alt)
            console.print(f"    sequential_api={manual['sequential_api_ms']:.0f}ms")

            # GenVar uncached
            _flush_redis(redis_url)
            await asyncio.sleep(1.0)
            console.print("    [dim]running genvar (uncached)...[/dim]")
            t0 = time.perf_counter()
            r = await client.get(f"{backend_url}/api/variant/{rsid}", timeout=60.0)
            genvar_uncached_ms = round((time.perf_counter() - t0) * 1000, 2)
            console.print(f"    genvar_uncached={genvar_uncached_ms:.0f}ms  status={r.status_code}")

            # GenVar cached
            await asyncio.sleep(0.5)
            t0 = time.perf_counter()
            r2 = await client.get(f"{backend_url}/api/variant/{rsid}", timeout=60.0)
            genvar_cached_ms = round((time.perf_counter() - t0) * 1000, 2)
            console.print(f"    genvar_cached={genvar_cached_ms:.0f}ms")

            api_speedup = round(manual["sequential_api_ms"] / genvar_uncached_ms, 2) if genvar_uncached_ms > 0 else None
            manual_total_s = manual["sequential_api_ms"] / 1000 + HUMAN_PROC_S
            genvar_total_s = genvar_uncached_ms / 1000
            total_speedup = round(manual_total_s / genvar_total_s, 1) if genvar_total_s > 0 else None

            rows.append({
                "rsid": rsid,
                **manual,
                "genvar_uncached_ms": genvar_uncached_ms,
                "genvar_cached_ms": genvar_cached_ms,
                "api_speedup": api_speedup,
                "human_proc_s": HUMAN_PROC_S,
                "manual_total_s": round(manual_total_s, 1),
                "total_speedup": total_speedup,
            })

            await asyncio.sleep(2.0)

    out_path = results_dir / "comparison.csv"
    fields = [
        "rsid", "ensembl_vep_ms", "gnomad_ms", "clinvar_search_ms", "clinvar_fetch_ms",
        "myvariant_ms", "sequential_api_ms", "genvar_uncached_ms", "genvar_cached_ms",
        "api_speedup", "human_proc_s", "manual_total_s", "total_speedup",
    ]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})

    table = Table(title="Speedup Summary (manual sequential vs GenVar)")
    table.add_column("Variant")
    table.add_column("Manual API (ms)", justify="right")
    table.add_column("GenVar (ms)", justify="right")
    table.add_column("API speedup", justify="right")
    table.add_column("Manual total (s)", justify="right")
    table.add_column("Total speedup", justify="right")

    for row in rows:
        table.add_row(
            row["rsid"],
            str(row["sequential_api_ms"]),
            str(row["genvar_uncached_ms"]),
            str(row["api_speedup"]) + "x",
            str(row["manual_total_s"]),
            str(row["total_speedup"]) + "x",
        )

    console.print(table)
    console.print(f"  [dim]Human processing estimate: {HUMAN_PROC_S}s per variant (ClinGen 2022)[/dim]")
    console.print(f"  [dim]Saved {out_path.name}[/dim]")
