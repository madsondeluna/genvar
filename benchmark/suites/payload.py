"""
Payload suite: measures data enrichment -- how many fields GenVar returns compared
to each individual external API called in isolation.

Enrichment ratio = genvar_fields / max(individual_api_fields)

Shows the aggregation value of the tool: one request returns data that would
require N separate API calls, and delivers more structured fields than any single source.

Outputs: results/payload.csv, results/payload_per_api.csv
"""
import asyncio
import csv
import json
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

from ._targets import GENES as TEST_GENES, VARIANTS as TEST_VARIANTS, VARIANT_COORDS

ENSEMBL_VEP   = "https://rest.ensembl.org"
GNOMAD_API    = "https://gnomad.broadinstitute.org/api"
CLINVAR_API   = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
MYVARIANT_API = "https://myvariant.info/v1"
UNIPROT_API   = "https://rest.uniprot.org"

GNOMAD_VARIANT_QUERY = """
query V($id: String!, $ds: DatasetId!) {
  variant(variantId: $id, dataset: $ds) {
    variantId chrom pos ref alt
    genome { ac an af populations { id ac an } }
    exome  { ac an af populations { id ac an } }
  }
}
"""

GNOMAD_GENE_QUERY = """
query G($gene: String!, $ds: DatasetId!) {
  gene(gene_symbol: $gene, reference_genome: GRCh38) {
    gnomad_constraint { pLI oe_lof oe_lof_upper oe_mis lof_z }
  }
}
"""


def _count_fields(obj, prefix="") -> int:
    """Recursively count non-null leaf fields in a JSON object."""
    if obj is None:
        return 0
    if isinstance(obj, dict):
        return sum(_count_fields(v, f"{prefix}.{k}") for k, v in obj.items())
    if isinstance(obj, list):
        if not obj:
            return 0
        # Count fields in first item as representative
        return _count_fields(obj[0], prefix)
    return 1 if obj is not None else 0


def _byte_size(obj) -> int:
    return len(json.dumps(obj).encode("utf-8"))


async def _safe_get(client: httpx.AsyncClient, url: str, **kwargs) -> dict | list | None:
    try:
        r = await client.get(url, timeout=30.0, **kwargs)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


async def _safe_post(client: httpx.AsyncClient, url: str, **kwargs) -> dict | None:
    try:
        r = await client.post(url, timeout=30.0, **kwargs)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


async def _measure_variant_apis(client: httpx.AsyncClient, rsid: str) -> dict:
    chrom, pos, ref, alt = VARIANT_COORDS[rsid]
    results = {}

    # Ensembl VEP
    data = await _safe_get(client, f"{ENSEMBL_VEP}/vep/human/id/{rsid}",
                           params={"content-type": "application/json"})
    vep = data[0] if isinstance(data, list) and data else (data or {})
    results["ensembl_vep"] = {"fields": _count_fields(vep), "bytes": _byte_size(vep)}
    await asyncio.sleep(0.5)

    # gnomAD
    variant_id = f"{chrom}-{pos}-{ref}-{alt}"
    data = await _safe_post(client, GNOMAD_API,
                            json={"query": GNOMAD_VARIANT_QUERY,
                                  "variables": {"id": variant_id, "ds": "gnomad_r4"}})
    gdata = (data or {}).get("data", {}).get("variant") or {}
    results["gnomad"] = {"fields": _count_fields(gdata), "bytes": _byte_size(gdata)}
    await asyncio.sleep(0.5)

    # ClinVar
    search = await _safe_get(client, f"{CLINVAR_API}/esearch.fcgi",
                              params={"db": "clinvar", "term": rsid, "retmode": "json", "retmax": "1"})
    ids = (search or {}).get("esearchresult", {}).get("idlist", [])
    cdata = {}
    if ids:
        await asyncio.sleep(0.4)
        summary = await _safe_get(client, f"{CLINVAR_API}/esummary.fcgi",
                                  params={"db": "clinvar", "id": ids[0], "retmode": "json"})
        cdata = (summary or {}).get("result", {}).get(ids[0], {})
    results["clinvar"] = {"fields": _count_fields(cdata), "bytes": _byte_size(cdata)}
    await asyncio.sleep(0.5)

    # MyVariant.info
    data = await _safe_get(client, f"{MYVARIANT_API}/query",
                           params={"q": rsid, "fields": "dbnsfp,cadd,revel,clinvar", "size": "1"})
    hits = (data or {}).get("hits", [{}])
    mvdata = hits[0] if hits else {}
    results["myvariant"] = {"fields": _count_fields(mvdata), "bytes": _byte_size(mvdata)}

    return results


async def _measure_gene_apis(client: httpx.AsyncClient, symbol: str) -> dict:
    results = {}

    # Ensembl lookup
    data = await _safe_get(client, f"{ENSEMBL_VEP}/lookup/symbol/homo_sapiens/{symbol}",
                           params={"content-type": "application/json"})
    results["ensembl_gene"] = {"fields": _count_fields(data or {}), "bytes": _byte_size(data or {})}
    await asyncio.sleep(0.5)

    # UniProt
    data = await _safe_get(client, "https://rest.uniprot.org/uniprotkb/search",
                           params={"query": f"gene:{symbol} AND organism_id:9606 AND reviewed:true",
                                   "format": "json", "fields": "accession,gene_names,protein_name,function", "size": "1"})
    udata = (data or {}).get("results", [{}])[0] if (data or {}).get("results") else {}
    results["uniprot"] = {"fields": _count_fields(udata), "bytes": _byte_size(udata)}
    await asyncio.sleep(0.5)

    # gnomAD constraint
    data = await _safe_post(client, GNOMAD_API,
                            json={"query": GNOMAD_GENE_QUERY,
                                  "variables": {"gene": symbol, "ds": "gnomad_r4"}})
    gdata = (data or {}).get("data", {}).get("gene", {})
    results["gnomad_constraint"] = {"fields": _count_fields(gdata), "bytes": _byte_size(gdata)}

    return results


async def run(backend_url: str, results_dir: Path, console: Console) -> None:
    console.print("\n[bold cyan]Suite 6: Payload Enrichment[/bold cyan]")

    rows = []
    per_api_rows = []

    async with httpx.AsyncClient() as client:

        # Variants
        for rsid in TEST_VARIANTS:
            genvar_data = await _safe_get(client, f"{backend_url}/api/variant/{rsid}")
            if genvar_data is None:
                console.print(f"  [yellow]No GenVar response for {rsid}[/yellow]")
                continue

            genvar_fields = _count_fields(genvar_data)
            genvar_bytes  = _byte_size(genvar_data)

            await asyncio.sleep(0.5)
            api_results = await _measure_variant_apis(client, rsid)

            max_single_api_fields = max(v["fields"] for v in api_results.values()) if api_results else 1
            enrichment_ratio = round(genvar_fields / max_single_api_fields, 2) if max_single_api_fields > 0 else None
            total_raw_fields = sum(v["fields"] for v in api_results.values())

            rows.append({
                "endpoint": "variant",
                "target": rsid,
                "genvar_fields": genvar_fields,
                "genvar_bytes": genvar_bytes,
                "max_single_api_fields": max_single_api_fields,
                "total_raw_api_fields": total_raw_fields,
                "enrichment_ratio": enrichment_ratio,
                "num_apis_aggregated": len(api_results),
            })

            for api_name, stats in api_results.items():
                per_api_rows.append({"endpoint": "variant", "target": rsid,
                                     "api": api_name, **stats})

            console.print(
                f"  variant/{rsid}: genvar={genvar_fields} fields  "
                f"max_single={max_single_api_fields}  enrichment={enrichment_ratio}x"
            )
            await asyncio.sleep(2.0)

        # Genes
        for symbol in TEST_GENES:
            genvar_data = await _safe_get(client, f"{backend_url}/api/gene/{symbol}")
            if genvar_data is None:
                console.print(f"  [yellow]No GenVar response for {symbol}[/yellow]")
                continue

            genvar_fields = _count_fields(genvar_data)
            genvar_bytes  = _byte_size(genvar_data)

            await asyncio.sleep(0.5)
            api_results = await _measure_gene_apis(client, symbol)

            max_single_api_fields = max(v["fields"] for v in api_results.values()) if api_results else 1
            enrichment_ratio = round(genvar_fields / max_single_api_fields, 2) if max_single_api_fields > 0 else None
            total_raw_fields = sum(v["fields"] for v in api_results.values())

            rows.append({
                "endpoint": "gene",
                "target": symbol,
                "genvar_fields": genvar_fields,
                "genvar_bytes": genvar_bytes,
                "max_single_api_fields": max_single_api_fields,
                "total_raw_api_fields": total_raw_fields,
                "enrichment_ratio": enrichment_ratio,
                "num_apis_aggregated": len(api_results),
            })

            for api_name, stats in api_results.items():
                per_api_rows.append({"endpoint": "gene", "target": symbol,
                                     "api": api_name, **stats})

            console.print(
                f"  gene/{symbol}: genvar={genvar_fields} fields  "
                f"max_single={max_single_api_fields}  enrichment={enrichment_ratio}x"
            )
            await asyncio.sleep(2.0)

    out_path = results_dir / "payload.csv"
    fields = ["endpoint", "target", "genvar_fields", "genvar_bytes",
              "max_single_api_fields", "total_raw_api_fields", "enrichment_ratio", "num_apis_aggregated"]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow(row)

    per_api_path = results_dir / "payload_per_api.csv"
    with open(per_api_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["endpoint", "target", "api", "fields", "bytes"])
        w.writeheader()
        for row in per_api_rows:
            w.writerow(row)

    table = Table(title="Data Enrichment (GenVar vs best single API)")
    table.add_column("Endpoint")
    table.add_column("Target")
    table.add_column("GenVar fields", justify="right")
    table.add_column("Best single API", justify="right")
    table.add_column("Enrichment", justify="right")
    table.add_column("APIs aggregated", justify="right")

    for row in rows:
        table.add_row(
            row["endpoint"], row["target"],
            str(row["genvar_fields"]), str(row["max_single_api_fields"]),
            str(row["enrichment_ratio"]) + "x", str(row["num_apis_aggregated"]),
        )

    console.print(table)
    console.print(f"  [dim]Saved {out_path.name}, {per_api_path.name}[/dim]")
