"""
Unit tests for service modules using mocked HTTP calls.
Run with: pytest tests/test_services.py -v

Patch paths use the module-level httpx reference inside each service
(e.g. "app.services.ensembl.httpx.AsyncClient") rather than the global
"httpx.AsyncClient". This ensures mocks stay effective even if a service
switches from `import httpx` to `from httpx import AsyncClient`.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services import ensembl, gnomad, clinvar, uniprot, alphafold


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_client(get_side_effect=None, post_side_effect=None):
    """Return a pre-wired AsyncMock that acts as an httpx.AsyncClient context manager."""
    mock = AsyncMock()
    mock.__aenter__ = AsyncMock(return_value=mock)
    mock.__aexit__ = AsyncMock(return_value=None)
    if get_side_effect is not None:
        mock.get = AsyncMock(side_effect=get_side_effect)
    if post_side_effect is not None:
        mock.post = AsyncMock(side_effect=post_side_effect)
    return mock


def _ok_response(body):
    r = MagicMock()
    r.status_code = 200
    r.json.return_value = body
    r.raise_for_status = MagicMock()
    return r


def _error_response(status_code):
    r = MagicMock()
    r.status_code = status_code
    r.json.return_value = {}
    r.raise_for_status = MagicMock()
    return r


# ---------------------------------------------------------------------------
# ensembl
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ensembl_get_gene_info_success():
    body = {
        "id": "ENSG00000012048",
        "display_name": "BRCA1",
        "description": "BRCA1 DNA repair associated",
        "seq_region_name": "17",
        "start": 43044292,
        "end": 43170245,
        "strand": -1,
        "biotype": "protein_coding",
        "assembly_name": "GRCh38",
    }
    client = _mock_client(get_side_effect=[_ok_response(body)])

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=client):
        result = await ensembl.get_gene_info("BRCA1")

    assert result["gene_id"] == "ENSG00000012048"
    assert result["gene_symbol"] == "BRCA1"
    assert result["chromosome"] == "17"
    assert result["strand"] == -1


@pytest.mark.asyncio
async def test_ensembl_get_gene_info_not_found():
    """Ensembl returns 400 for unknown symbols; service must raise HTTP 404."""
    from fastapi import HTTPException
    client = _mock_client(get_side_effect=[_error_response(400)])

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=client):
        with pytest.raises(HTTPException) as exc_info:
            await ensembl.get_gene_info("NOTAREALGENE")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_ensembl_get_gene_variants_returns_empty_on_404():
    """A 404 from the overlap endpoint means no variants; should return [] not raise."""
    client = _mock_client(get_side_effect=[_error_response(404)])

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=client):
        result = await ensembl.get_gene_variants("ENSG00000012048")

    assert result == []


@pytest.mark.asyncio
async def test_ensembl_get_gene_variants_respects_limit():
    """Variant list must be truncated to the requested limit."""
    variants = [{"id": f"rs{i}", "start": i} for i in range(10)]
    client = _mock_client(get_side_effect=[_ok_response(variants)])

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=client):
        result = await ensembl.get_gene_variants("ENSG00000012048", limit=3)

    assert len(result) == 3


# ---------------------------------------------------------------------------
# gnomad
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gnomad_get_gene_constraint_success():
    body = {
        "data": {
            "gene": {
                "gene_id": "ENSG00000012048",
                "symbol": "BRCA1",
                "gnomad_constraint": {
                    "pli": 1.5e-34,
                    "lof_z": 2.617,
                    "oe_lof": 0.766,
                    "oe_lof_upper": None,
                    "oe_mis": 0.865,
                    "oe_syn": 0.826,
                },
            }
        }
    }
    client = _mock_client(post_side_effect=[_ok_response(body)])

    with patch("app.services.gnomad.httpx.AsyncClient", return_value=client):
        result = await gnomad.get_gene_constraint("BRCA1")

    assert result["pli"] == 1.5e-34
    assert result["lof_z"] == 2.617
    assert result["oe_lof"] == 0.766


@pytest.mark.asyncio
async def test_gnomad_get_gene_constraint_graphql_error_returns_empty():
    """GraphQL errors in the response body should not raise; return {} instead."""
    body = {"errors": [{"message": "Gene not found"}], "data": None}
    client = _mock_client(post_side_effect=[_ok_response(body)])

    with patch("app.services.gnomad.httpx.AsyncClient", return_value=client):
        result = await gnomad.get_gene_constraint("FAKEGENE")

    assert result == {}


@pytest.mark.asyncio
async def test_gnomad_get_variant_frequencies_no_data_returns_empty():
    """When the variant is absent in gnomAD the data field is null; return {}."""
    body = {"data": {"variant": None}}
    client = _mock_client(post_side_effect=[_ok_response(body)])

    with patch("app.services.gnomad.httpx.AsyncClient", return_value=client):
        result = await gnomad.get_variant_frequencies("11", 5227002, "T", "A")

    assert result == {}


# ---------------------------------------------------------------------------
# clinvar
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clinvar_get_variant_success():
    search_resp = _ok_response({"esearchresult": {"idlist": ["17864"]}})
    summary_resp = _ok_response({
        "result": {
            "17864": {
                "uid": "17864",
                "accession": "VCV000017864",
                "title": "NM_000041.4(APOE):c.388T>C (p.Cys130Arg)",
                "germline_classification": {
                    "description": "Conflicting classifications of pathogenicity",
                    "review_status": "criteria provided, conflicting classifications",
                    "last_evaluated": "2025/09/10 00:00",
                    "trait_set": [{"trait_name": "Alzheimer disease"}],
                },
            }
        }
    })
    client = _mock_client(get_side_effect=[search_resp, summary_resp])

    with patch("app.services.clinvar.httpx.AsyncClient", return_value=client):
        result = await clinvar.get_variant_clinvar("rs429358")

    assert result["significance"] == "Conflicting classifications of pathogenicity"
    assert result["review_status"] == "criteria provided, conflicting classifications"
    assert "Alzheimer disease" in result["conditions"]


@pytest.mark.asyncio
async def test_clinvar_get_variant_not_found_returns_empty():
    """When ClinVar returns no UIDs for the rsID the result should be {}."""
    search_resp = _ok_response({"esearchresult": {"idlist": []}})
    client = _mock_client(get_side_effect=[search_resp])

    with patch("app.services.clinvar.httpx.AsyncClient", return_value=client):
        result = await clinvar.get_variant_clinvar("rs000000000")

    assert result == {}


@pytest.mark.asyncio
async def test_clinvar_batch_summary_skips_no_classification_records():
    """Records whose description starts with 'no classification' must be ignored."""
    summary_resp = _ok_response({
        "result": {
            "1": {
                "accession": "RCV000001",
                "germline_classification": {
                    "description": "no classification provided",
                    "review_status": "",
                    "trait_set": [],
                },
            },
            "2": {
                "accession": "VCV000002",
                "germline_classification": {
                    "description": "Pathogenic",
                    "review_status": "reviewed by expert panel",
                    "trait_set": [{"trait_name": "Hereditary breast cancer"}],
                },
            },
        }
    })
    client = _mock_client(get_side_effect=[summary_resp])

    with patch("app.services.clinvar.httpx.AsyncClient", return_value=client):
        result = await clinvar.get_clinvar_batch_summary(["1", "2"])

    assert result["significance"] == "Pathogenic"
    assert result["accession"] == "VCV000002"


# ---------------------------------------------------------------------------
# uniprot
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_uniprot_get_id_success():
    body = {
        "results": [{"primaryAccession": "P38398", "genes": [{"geneName": {"value": "BRCA1"}}]}]
    }
    client = _mock_client(get_side_effect=[_ok_response(body)])

    with patch("app.services.uniprot.httpx.AsyncClient", return_value=client):
        result = await uniprot.get_uniprot_id("BRCA1")

    assert result == "P38398"


@pytest.mark.asyncio
async def test_uniprot_get_id_no_results_returns_none():
    """An empty results list means no Swiss-Prot entry; return None."""
    client = _mock_client(get_side_effect=[_ok_response({"results": []})])

    with patch("app.services.uniprot.httpx.AsyncClient", return_value=client):
        result = await uniprot.get_uniprot_id("FAKEGENE")

    assert result is None


# ---------------------------------------------------------------------------
# alphafold
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_alphafold_get_prediction_success():
    body = [
        {
            "entryId": "AF-P38398-F1",
            "gene": "BRCA1",
            "pdbUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.pdb",
            "paeImageUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-predicted_aligned_error_v6.png",
            "cifUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.cif",
            "globalMetricValue": 41.59,
            "latestVersion": 6,
        }
    ]
    client = _mock_client(get_side_effect=[_ok_response(body)])

    with patch("app.services.alphafold.httpx.AsyncClient", return_value=client):
        result = await alphafold.get_prediction("P38398")

    assert result["entry_id"] == "AF-P38398-F1"
    assert "pdb" in result["pdb_url"]
    assert result["global_metric"] == 41.59


@pytest.mark.asyncio
async def test_alphafold_get_prediction_404_returns_none():
    """AlphaFold returns 404 for proteins without a predicted structure."""
    client = _mock_client(get_side_effect=[_error_response(404)])

    with patch("app.services.alphafold.httpx.AsyncClient", return_value=client):
        result = await alphafold.get_prediction("UNKNOWN")

    assert result is None
