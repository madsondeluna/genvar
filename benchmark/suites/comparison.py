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

from ._targets import GENES, VARIANTS, VARIANT_COORDS

# (rsid, chrom, pos, ref, alt) -- pre-resolved to avoid extra lookup in simulation
TEST_VARIANTS = [(rsid, *VARIANT_COORDS[rsid]) for rsid in VARIANTS]

ENSEMBL_VEP     = "https://rest.ensembl.org"
GNOMAD_API      = "https://gnomad.broadinstitute.org/api"
CLINVAR_EUTILS  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
MYVARIANT_API   = "https://myvariant.info/v1"
UNIPROT_API     = "https://rest.uniprot.org"
ALPHAFOLD_API   = "https://alphafold.ebi.ac.uk/api"

GNOMAD_QUERY = """
query V($id: String!, $ds: DatasetId!) {
  variant(variantId: $id, dataset: $ds) { variantId genome { ac an af } exome { ac an af } }
}
"""

# Constraint do gene: a mesma consulta GraphQL que o endpoint de gene da GenVar usa.
GNOMAD_GENE_QUERY = """
query G($symbol: String!) {
  gene(gene_symbol: $symbol, reference_genome: GRCh38) {
    gene_id symbol
    gnomad_constraint { pli lof_z oe_lof oe_lof_upper oe_mis oe_syn }
  }
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


async def _manual_gene(client: httpx.AsyncClient, symbol: str) -> dict:
    """Chamadas em serie a cada API externa, espelhando o que o endpoint de gene faz.

    A GenVar executa esses passos com paralelismo: lookup primeiro, depois overlap,
    constraint e uniprot juntos, e alphafold por ultimo. Aqui medimos o custo de fazer
    tudo em sequencia, como faria um pesquisador consultando cada base na mao. O passo
    de overlap traz todas as variantes do gene (dezenas de milhares), igual ao backend.
    """
    timings = {}

    # Passo 1: lookup do gene no Ensembl (simbolo -> gene_id), pre-requisito dos demais.
    info_resp, t = await _timed(client.get(
        f"{ENSEMBL_VEP}/lookup/symbol/homo_sapiens/{symbol}",
        params={"content-type": "application/json"},
        timeout=30.0,
    ))
    timings["ensembl_lookup_ms"] = t
    await asyncio.sleep(0.5)

    gene_id = None
    if info_resp is not None and info_resp.status_code == 200:
        gene_id = info_resp.json().get("id")

    # Passo 2: overlap de variantes do gene (a chamada pesada, todas as variantes).
    overlap_ms = 0.0
    if gene_id:
        _, overlap_ms = await _timed(client.get(
            f"{ENSEMBL_VEP}/overlap/id/{gene_id}",
            params={"feature": "variation", "content-type": "application/json"},
            timeout=60.0,
        ))
        await asyncio.sleep(0.5)
    timings["ensembl_overlap_ms"] = overlap_ms

    # Passo 3: constraint do gene no gnomAD.
    _, t = await _timed(client.post(
        GNOMAD_API,
        json={"query": GNOMAD_GENE_QUERY, "variables": {"symbol": symbol}},
        timeout=30.0,
    ))
    timings["gnomad_ms"] = t
    await asyncio.sleep(0.5)

    # Passo 4: identificador UniProt do gene.
    up_resp, t = await _timed(client.get(
        f"{UNIPROT_API}/uniprotkb/search",
        params={
            "query": f"gene:{symbol} AND organism_id:9606 AND reviewed:true",
            "format": "json", "fields": "accession,gene_names", "size": "1",
        },
        timeout=30.0,
    ))
    timings["uniprot_ms"] = t
    await asyncio.sleep(0.5)

    uniprot_id = None
    if up_resp is not None and up_resp.status_code == 200:
        results = up_resp.json().get("results", [])
        if results:
            uniprot_id = results[0].get("primaryAccession")

    # Passo 5: predicao AlphaFold, so quando ha UniProt (espelha o if do router).
    alphafold_ms = 0.0
    if uniprot_id:
        _, alphafold_ms = await _timed(client.get(
            f"{ALPHAFOLD_API}/prediction/{uniprot_id}",
            timeout=30.0,
        ))
    timings["alphafold_ms"] = alphafold_ms

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

    # ---------------------------------------------------------------------
    # Parte 2: mesma comparacao para os 10 genes do conjunto.
    # ---------------------------------------------------------------------
    console.print("\n[bold cyan]Suite 4b: Manual vs GenVar Comparison (genes)[/bold cyan]")
    gene_rows = []

    async with httpx.AsyncClient() as client:
        for symbol in GENES:
            console.print(f"  Gene {symbol}")

            console.print("    [dim]running manual simulation...[/dim]")
            manual = await _manual_gene(client, symbol)
            console.print(f"    sequential_api={manual['sequential_api_ms']:.0f}ms")

            _flush_redis(redis_url)
            await asyncio.sleep(1.0)
            console.print("    [dim]running genvar (uncached)...[/dim]")
            t0 = time.perf_counter()
            r = await client.get(f"{backend_url}/api/gene/{symbol}", timeout=120.0)
            genvar_uncached_ms = round((time.perf_counter() - t0) * 1000, 2)
            console.print(f"    genvar_uncached={genvar_uncached_ms:.0f}ms  status={r.status_code}")

            await asyncio.sleep(0.5)
            t0 = time.perf_counter()
            r2 = await client.get(f"{backend_url}/api/gene/{symbol}", timeout=120.0)
            genvar_cached_ms = round((time.perf_counter() - t0) * 1000, 2)
            console.print(f"    genvar_cached={genvar_cached_ms:.0f}ms")

            api_speedup = round(manual["sequential_api_ms"] / genvar_uncached_ms, 2) if genvar_uncached_ms > 0 else None
            manual_total_s = manual["sequential_api_ms"] / 1000 + HUMAN_PROC_S
            genvar_total_s = genvar_uncached_ms / 1000
            total_speedup = round(manual_total_s / genvar_total_s, 1) if genvar_total_s > 0 else None

            gene_rows.append({
                "gene": symbol,
                **manual,
                "genvar_uncached_ms": genvar_uncached_ms,
                "genvar_cached_ms": genvar_cached_ms,
                "api_speedup": api_speedup,
                "human_proc_s": HUMAN_PROC_S,
                "manual_total_s": round(manual_total_s, 1),
                "total_speedup": total_speedup,
            })

            await asyncio.sleep(2.0)

    gene_out = results_dir / "comparison_gene.csv"
    gene_fields = [
        "gene", "ensembl_lookup_ms", "ensembl_overlap_ms", "gnomad_ms", "uniprot_ms",
        "alphafold_ms", "sequential_api_ms", "genvar_uncached_ms", "genvar_cached_ms",
        "api_speedup", "human_proc_s", "manual_total_s", "total_speedup",
    ]
    with open(gene_out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=gene_fields)
        w.writeheader()
        for row in gene_rows:
            w.writerow({k: row.get(k, "") for k in gene_fields})

    gene_table = Table(title="Speedup Summary (manual sequential vs GenVar, genes)")
    gene_table.add_column("Gene")
    gene_table.add_column("Manual API (ms)", justify="right")
    gene_table.add_column("GenVar (ms)", justify="right")
    gene_table.add_column("API speedup", justify="right")
    gene_table.add_column("Total speedup", justify="right")
    for row in gene_rows:
        gene_table.add_row(
            row["gene"], str(row["sequential_api_ms"]), str(row["genvar_uncached_ms"]),
            str(row["api_speedup"]) + "x", str(row["total_speedup"]) + "x",
        )
    console.print(gene_table)
    console.print(f"  [dim]Saved {gene_out.name}[/dim]")
