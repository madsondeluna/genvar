"""
Unit tests for service modules using mocked HTTP calls.
Run with: pytest tests/test_services.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services import ensembl, gnomad, clinvar, uniprot, alphafold


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ok_response(payload):
    """Return a mock httpx response with status 200 and the given JSON payload."""
    r = MagicMock()
    r.status_code = 200
    r.json.return_value = payload
    r.raise_for_status = MagicMock()
    return r


def _error_response(status: int):
    """Return a mock httpx response with the given non-2xx status code."""
    r = MagicMock()
    r.status_code = status
    r.json.return_value = {}
    r.raise_for_status = MagicMock()
    return r


def _mock_client(responses, method="get"):
    """
    Build a mock AsyncClient context-manager.

    responses: a single mock response or a list used as side_effect.
    method: "get" or "post" -- which client method to patch.
    """
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    handler = AsyncMock(side_effect=responses if isinstance(responses, list) else None,
                        return_value=responses if not isinstance(responses, list) else None)
    setattr(mock_client, method, handler)
    return mock_client


# ---------------------------------------------------------------------------
# ensembl
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ensembl_get_gene_info_success():
    resp = _ok_response({
        "id": "ENSG00000012048",
        "display_name": "BRCA1",
        "description": "BRCA1 DNA repair associated",
        "seq_region_name": "17",
        "start": 43044292,
        "end": 43170245,
        "strand": -1,
        "biotype": "protein_coding",
        "assembly_name": "GRCh38",
    })

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await ensembl.get_gene_info("BRCA1")

    assert result["gene_id"] == "ENSG00000012048"
    assert result["gene_symbol"] == "BRCA1"
    assert result["chromosome"] == "17"
    assert result["strand"] == -1


@pytest.mark.asyncio
async def test_ensembl_get_gene_info_not_found():
    from fastapi import HTTPException
    resp = _error_response(400)
    resp.json.return_value = {"error": "No valid lookup found for symbol FAKE"}

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=_mock_client(resp)):
        with pytest.raises(HTTPException) as exc_info:
            await ensembl.get_gene_info("FAKE")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_ensembl_get_gene_variants_returns_empty_on_404():
    """get_gene_variants must return [] rather than raising when Ensembl returns 404."""
    resp = _error_response(404)

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await ensembl.get_gene_variants("ENSG00000012048")

    assert result == []


@pytest.mark.asyncio
async def test_ensembl_get_gene_variants_respects_limit():
    """get_gene_variants must truncate results to the requested limit."""
    variants = [{"id": f"rs{i}"} for i in range(600)]
    resp = _ok_response(variants)

    with patch("app.services.ensembl.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await ensembl.get_gene_variants("ENSG00000012048", limit=100)

    assert len(result) == 100


# ---------------------------------------------------------------------------
# gnomad
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gnomad_get_gene_constraint_success():
    resp = _ok_response({
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
    })

    with patch("app.services.gnomad.httpx.AsyncClient", return_value=_mock_client(resp, method="post")):
        result = await gnomad.get_gene_constraint("BRCA1")

    assert result["pli"] == 1.5e-34
    assert result["lof_z"] == 2.617
    assert result["oe_lof"] == 0.766


@pytest.mark.asyncio
async def test_gnomad_get_gene_constraint_returns_empty_on_graphql_error():
    """GraphQL errors in the response body must result in an empty dict, not a crash."""
    resp = _ok_response({"errors": [{"message": "gene not found"}], "data": {"gene": None}})

    with patch("app.services.gnomad.httpx.AsyncClient", return_value=_mock_client(resp, method="post")):
        result = await gnomad.get_gene_constraint("NOTREAL")

    assert result == {}


@pytest.mark.asyncio
async def test_gnomad_get_variant_frequencies_returns_empty_when_no_variant():
    """Missing variant in gnomAD response must return {} without raising."""
    resp = _ok_response({"data": {"variant": None}})

    with patch("app.services.gnomad.httpx.AsyncClient", return_value=_mock_client(resp, method="post")):
        result = await gnomad.get_variant_frequencies("19", 44908684, "T", "C")

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

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(side_effect=[search_resp, summary_resp])

    with patch("app.services.clinvar.httpx.AsyncClient", return_value=mock_client):
        result = await clinvar.get_variant_clinvar("rs429358")

    assert result["significance"] == "Conflicting classifications of pathogenicity"
    assert result["review_status"] == "criteria provided, conflicting classifications"
    assert "Alzheimer disease" in result["conditions"]


@pytest.mark.asyncio
async def test_clinvar_get_variant_not_found_returns_empty():
    """Empty idlist from ClinVar esearch must return {} without raising."""
    resp = _ok_response({"esearchresult": {"idlist": []}})

    with patch("app.services.clinvar.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await clinvar.get_variant_clinvar("rs999999999")

    assert result == {}


@pytest.mark.asyncio
async def test_clinvar_batch_summary_skips_no_classification_records():
    """Records whose description starts with 'no classification' must be skipped."""
    summary_resp = _ok_response({
        "result": {
            "111": {
                "germline_classification": {
                    "description": "no classification provided",
                    "review_status": "",
                    "trait_set": [],
                }
            },
            "222": {
                "accession": "VCV000222",
                "title": "Some variant",
                "germline_classification": {
                    "description": "Pathogenic",
                    "review_status": "criteria provided, single submitter",
                    "last_evaluated": "2024/01/01",
                    "trait_set": [{"trait_name": "Breast cancer"}],
                },
            },
        }
    })

    with patch("app.services.clinvar.httpx.AsyncClient", return_value=_mock_client(summary_resp)):
        result = await clinvar.get_clinvar_batch_summary(["111", "222"])

    # uid 111 must be ignored; the pathogenic record from uid 222 selected
    assert result["significance"] == "Pathogenic"


# ---------------------------------------------------------------------------
# uniprot
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_uniprot_get_id_success():
    resp = _ok_response({
        "results": [{"primaryAccession": "P38398", "genes": [{"geneName": {"value": "BRCA1"}}]}]
    })

    with patch("app.services.uniprot.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await uniprot.get_uniprot_id("BRCA1")

    assert result == "P38398"


@pytest.mark.asyncio
async def test_uniprot_get_id_no_results_returns_none():
    """Empty results list from UniProt must return None, not crash."""
    resp = _ok_response({"results": []})

    with patch("app.services.uniprot.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await uniprot.get_uniprot_id("NOTAPROTEIN")

    assert result is None


# ---------------------------------------------------------------------------
# alphafold
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_alphafold_get_prediction_success():
    resp = _ok_response([
        {
            "entryId": "AF-P38398-F1",
            "gene": "BRCA1",
            "pdbUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.pdb",
            "paeImageUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-predicted_aligned_error_v6.png",
            "cifUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.cif",
            "globalMetricValue": 41.59,
            "latestVersion": 6,
        }
    ])

    with patch("app.services.alphafold.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await alphafold.get_prediction("P38398")

    assert result["entry_id"] == "AF-P38398-F1"
    assert "pdb" in result["pdb_url"]
    assert result["global_metric"] == 41.59


@pytest.mark.asyncio
async def test_alphafold_get_prediction_not_found_returns_none():
    """HTTP 404 from AlphaFold API must return None, not raise."""
    resp = _error_response(404)

    with patch("app.services.alphafold.httpx.AsyncClient", return_value=_mock_client(resp)):
        result = await alphafold.get_prediction("NOTAUNIPROTID")

    assert result is None
