"""
Testes do router de Doencas Raras (/api/disease).

Nao fazem chamadas de rede: o enriquecimento de constraint da gnomAD e mockado.
Rodar com: pytest tests/test_disease.py -v
"""
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.data.rare_diseases import all_diseases

client = TestClient(app)


def test_list_diseases_returns_full_catalog():
    r = client.get("/api/disease")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == len(all_diseases())
    # shape do DiseaseSummary
    first = body[0]
    for key in ("id", "name", "category", "inheritance", "genes", "short"):
        assert key in first
    assert isinstance(first["genes"], list)


def test_unknown_disease_returns_404():
    r = client.get("/api/disease/nao-existe-no-catalogo")
    assert r.status_code == 404


def test_detail_enriches_causal_genes_with_constraint():
    fake_constraint = {
        "pli": 0.98,
        "lof_z": 3.2,
        "oe_lof": 0.21,
        "oe_lof_upper": 0.33,
        "oe_mis": 0.85,
        "oe_syn": 0.99,
    }
    with patch(
        "app.services.gnomad.get_gene_constraint",
        new=AsyncMock(return_value=fake_constraint),
    ):
        r = client.get("/api/disease/hipercolesterolemia-familiar")

    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "hipercolesterolemia-familiar"
    assert body["causal_genes"], "deve haver genes causais enriquecidos"
    for g in body["causal_genes"]:
        assert g["constraint_available"] is True
        assert g["loeuf"] == 0.33  # oe_lof_upper -> loeuf
        assert g["pli"] == 0.98


def test_detail_degrades_when_constraint_unavailable():
    with patch(
        "app.services.gnomad.get_gene_constraint",
        new=AsyncMock(return_value={}),
    ):
        r = client.get("/api/disease/anemia-falciforme")

    assert r.status_code == 200
    body = r.json()
    assert body["causal_genes"]
    assert all(g["constraint_available"] is False for g in body["causal_genes"])
    assert all(g["loeuf"] is None for g in body["causal_genes"])


# --- /api/disease/{id}/variants ---

def _variant_row(rsid, sig, pos):
    return {
        "id": rsid,
        "start": pos,
        "consequence_type": "missense_variant",
        "clinical_significance": [sig],
        "alleles": ["A", "T"],
    }


def test_disease_variants_filters_pathogenic():
    fake_variants = [
        _variant_row("rs1", "pathogenic", 100),
        _variant_row("rs2", "benign", 200),
        _variant_row("rs3", "likely pathogenic", 300),
        _variant_row("rs4", "uncertain significance", 400),
    ]
    with patch(
        "app.services.ensembl.get_gene_info",
        new=AsyncMock(return_value={"gene_id": "ENSG00000001"}),
    ), patch(
        "app.services.ensembl.get_gene_variants",
        new=AsyncMock(return_value=fake_variants),
    ):
        r = client.get("/api/disease/anemia-falciforme/variants")

    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is False
    assert body["genes"], "deve haver ao menos um gene"
    gene = body["genes"][0]
    assert gene["symbol"] == "HBB"
    # rs1 (pathogenic) e rs3 (likely pathogenic) contam; rs2 e rs4 nao
    assert gene["pathogenic_count"] == 2
    ids = {v["variant_id"] for v in gene["variants"]}
    assert ids == {"rs1", "rs3"}


def test_disease_variants_degrades_when_ensembl_fails():
    with patch(
        "app.services.ensembl.get_gene_info",
        new=AsyncMock(side_effect=RuntimeError("ensembl down")),
    ):
        r = client.get("/api/disease/fibrose-cistica/variants")

    assert r.status_code == 200
    body = r.json()
    assert body["degraded"] is True
    assert body["genes"] == []


def test_disease_variants_unknown_returns_404():
    r = client.get("/api/disease/nao-existe/variants")
    assert r.status_code == 404
