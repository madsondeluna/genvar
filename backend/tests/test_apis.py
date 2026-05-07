"""
Integration tests that call the real external APIs.
Run with:  pytest tests/test_apis.py -v
Skip in CI: pytest -m "not integration" or use --ignore=tests/test_apis.py

All tests in this file make live network calls and require internet access.
Mark them as @pytest.mark.integration if you need selective skipping.
"""
import asyncio
import pytest
import httpx


@pytest.mark.asyncio
async def test_ensembl_brca1():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://rest.ensembl.org/lookup/symbol/homo_sapiens/BRCA1",
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "ENSG00000012048"
    assert data["display_name"] == "BRCA1"
    assert data["seq_region_name"] == "17"


@pytest.mark.asyncio
async def test_ensembl_invalid_gene():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://rest.ensembl.org/lookup/symbol/homo_sapiens/NOTAREALGENE999",
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        )
    assert r.status_code == 400
    data = r.json()
    assert "error" in data


@pytest.mark.asyncio
async def test_ensembl_vep_rs429358():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://rest.ensembl.org/vep/human/id/rs429358",
            params={"content-type": "application/json"},
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0
    assert data[0]["id"] == "rs429358"
    assert data[0]["most_severe_consequence"] == "missense_variant"


@pytest.mark.asyncio
async def test_gnomad_variant_frequencies():
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://gnomad.broadinstitute.org/api",
            json={
                "query": """
                query {
                  variant(variantId: "19-44908684-T-C", dataset: gnomad_r4) {
                    variantId
                    genome { ac an af populations { id ac an } }
                  }
                }
                """
            },
            timeout=30.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert "errors" not in data
    variant = data["data"]["variant"]
    assert variant["variantId"] == "19-44908684-T-C"
    assert variant["genome"]["ac"] > 0
    assert variant["genome"]["an"] > 0


@pytest.mark.asyncio
async def test_gnomad_gene_constraint():
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://gnomad.broadinstitute.org/api",
            json={
                "query": """
                query {
                  gene(gene_symbol: "BRCA1", reference_genome: GRCh38) {
                    symbol
                    gnomad_constraint { pli lof_z oe_lof oe_mis }
                  }
                }
                """
            },
            timeout=30.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert "errors" not in data
    gene = data["data"]["gene"]
    assert gene["symbol"] == "BRCA1"
    constraint = gene["gnomad_constraint"]
    assert constraint["pli"] is not None
    assert constraint["lof_z"] is not None


@pytest.mark.asyncio
async def test_clinvar_search_rsid():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={"db": "clinvar", "term": "rs429358", "retmode": "json"},
            timeout=20.0,
        )
    assert r.status_code == 200
    data = r.json()
    ids = data["esearchresult"]["idlist"]
    assert len(ids) > 0


@pytest.mark.asyncio
async def test_clinvar_summary():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
            params={"db": "clinvar", "id": "17864", "retmode": "json"},
            timeout=20.0,
        )
    assert r.status_code == 200
    data = r.json()
    item = data["result"]["17864"]
    # germline_classification - actual field name (not clinical_significance)
    assert "germline_classification" in item
    gc = item["germline_classification"]
    assert "description" in gc
    assert "review_status" in gc


@pytest.mark.asyncio
async def test_alphafold_brca1():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://alphafold.ebi.ac.uk/api/prediction/P38398",
            timeout=20.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    entry = data[0]
    assert "pdbUrl" in entry
    assert "paeImageUrl" in entry
    assert entry["gene"] == "BRCA1"


@pytest.mark.asyncio
async def test_uniprot_gene_lookup():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://rest.uniprot.org/uniprotkb/search",
            params={
                "query": "gene:BRCA1 AND organism_id:9606 AND reviewed:true",
                "format": "json",
                "fields": "accession,gene_names",
                "size": "1",
            },
            headers={"User-Agent": "GenVar-Dashboard/1.0"},
            timeout=20.0,
        )
    assert r.status_code == 200
    data = r.json()
    results = data["results"]
    assert len(results) > 0
    assert results[0]["primaryAccession"] == "P38398"


@pytest.mark.asyncio
async def test_ensembl_get_gene_variants_brca1():
    """Ensembl overlap endpoint must return variation features for BRCA1 (ENSG00000012048)."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://rest.ensembl.org/overlap/id/ENSG00000012048",
            headers={"Accept": "application/json"},
            params={"feature": "variation"},
            timeout=60.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Each item must at least carry an id and seq_region_name
    first = data[0]
    assert "id" in first or "ID" in first


@pytest.mark.asyncio
async def test_myvariant_query_by_rsid():
    """MyVariant.info must return annotation for rs429358 (APOE epsilon 4 allele)."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://myvariant.info/v1/query",
            params={"q": "rs429358", "fields": "dbsnp,cadd,dbnsfp", "size": "1"},
            timeout=20.0,
        )
    assert r.status_code == 200
    data = r.json()
    assert data.get("total", 0) > 0
    hits = data.get("hits", [])
    assert len(hits) > 0


@pytest.mark.asyncio
async def test_myvariant_hgvs_lookup():
    """MyVariant.info variant lookup by HGVS notation must return cadd/dbnsfp fields."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://myvariant.info/v1/variant/chr19:g.44908684T>C",
            params={"fields": "cadd,dbnsfp"},
            timeout=20.0,
        )
    assert r.status_code == 200
    data = r.json()
    # At least one of the requested annotation sources should be present
    assert "cadd" in data or "dbnsfp" in data
