"""
Unit tests for service modules using mocked HTTP calls.
Run with: pytest tests/test_services.py -v
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services import ensembl, gnomad, clinvar, uniprot, alphafold


@pytest.mark.asyncio
async def test_ensembl_get_gene_info_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
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
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await ensembl.get_gene_info("BRCA1")

    assert result["gene_id"] == "ENSG00000012048"
    assert result["gene_symbol"] == "BRCA1"
    assert result["chromosome"] == "17"
    assert result["strand"] == -1


@pytest.mark.asyncio
async def test_ensembl_get_gene_info_not_found():
    from fastapi import HTTPException
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.json.return_value = {"error": "No valid lookup found for symbol FAKE"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await ensembl.get_gene_info("FAKE")
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_gnomad_get_gene_constraint_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
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
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await gnomad.get_gene_constraint("BRCA1")

    assert result["pli"] == 1.5e-34
    assert result["lof_z"] == 2.617
    assert result["oe_lof"] == 0.766


@pytest.mark.asyncio
async def test_clinvar_get_variant_success():
    search_response = MagicMock()
    search_response.status_code = 200
    search_response.json.return_value = {
        "esearchresult": {"idlist": ["17864"]}
    }
    search_response.raise_for_status = MagicMock()

    summary_response = MagicMock()
    summary_response.status_code = 200
    summary_response.json.return_value = {
        "result": {
            "17864": {
                "uid": "17864",
                "accession": "VCV000017864",
                "title": "NM_000041.4(APOE):c.388T>C (p.Cys130Arg)",
                "germline_classification": {
                    "description": "Conflicting classifications of pathogenicity",
                    "review_status": "criteria provided, conflicting classifications",
                    "last_evaluated": "2025/09/10 00:00",
                    "trait_set": [
                        {"trait_name": "Alzheimer disease"},
                    ],
                },
            }
        }
    }
    summary_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=[search_response, summary_response])
        mock_client_cls.return_value = mock_client

        result = await clinvar.get_variant_clinvar("rs429358")

    assert result["significance"] == "Conflicting classifications of pathogenicity"
    assert result["review_status"] == "criteria provided, conflicting classifications"
    assert "Alzheimer disease" in result["conditions"]


@pytest.mark.asyncio
async def test_uniprot_get_id_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "results": [{"primaryAccession": "P38398", "genes": [{"geneName": {"value": "BRCA1"}}]}]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await uniprot.get_uniprot_id("BRCA1")

    assert result == "P38398"


@pytest.mark.asyncio
async def test_alphafold_get_prediction_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
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
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await alphafold.get_prediction("P38398")

    assert result["entry_id"] == "AF-P38398-F1"
    assert "pdb" in result["pdb_url"]
    assert result["global_metric"] == 41.59
