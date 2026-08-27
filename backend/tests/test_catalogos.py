"""Testes do merge dos tres catalogos e das rotas que entraram hoje.

O merge e onde mora um risco silencioso: cada catalogo tem uma parte curada em
PT-BR e uma parte publica, e a regra e que a curada VENCE. Se ela inverter, o
app passa a mostrar o texto generico no lugar do texto escrito a mao, e nada
quebra: so piora.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.data.gene_panels import all_panels, GENE_PANELS
from app.data.polygenic import all_scores, POLYGENIC_SCORES
from app.data.rare_diseases import all_diseases, CURATED_DISEASES

cliente = TestClient(app)


# ------------------------------------------------------------------ merge

def test_curados_vem_primeiro_e_sao_preservados():
    for todos, curados in [(all_panels(), GENE_PANELS),
                           (all_scores(), POLYGENIC_SCORES),
                           (all_diseases(), CURATED_DISEASES)]:
        assert len(todos) >= len(curados)
        assert [x["id"] for x in todos[:len(curados)]] == [x["id"] for x in curados]


def test_nenhum_id_repetido_em_nenhum_catalogo():
    # id duplicado faz a rota de detalhe devolver o registro errado, em silencio
    for todos in (all_panels(), all_scores(), all_diseases()):
        ids = [x["id"] for x in todos]
        assert len(ids) == len(set(ids))


def test_doenca_curada_vence_o_orphanet_pelo_mesmo_codigo():
    codigos = {d["orphanet"] for d in CURATED_DISEASES if d.get("orphanet")}
    assert codigos, "o teste so vale se alguma curada tiver codigo Orphanet"
    do_orphanet = [d for d in all_diseases() if d.get("source") == "orphanet"]
    assert not (codigos & {d.get("orphanet") for d in do_orphanet})


def test_escore_curado_vence_o_pgs_catalog_pelo_mesmo_id():
    curados = {s["id"] for s in POLYGENIC_SCORES}
    do_catalogo = [s["id"] for s in all_scores() if s.get("source") == "pgs_catalog"]
    assert not (curados & set(do_catalogo))


def test_todo_registro_declara_a_procedencia():
    # a pagina de fontes e o credito dependem disso para dizer de onde veio o dado
    for todos in (all_panels(), all_scores(), all_diseases()):
        assert all(x.get("source") for x in todos)


def test_categorias_falam_um_vocabulario_so():
    # o defeito que isto trava: "Oncogenetica" e "Oncogenética" viravam dois
    # filtros diferentes para a mesma coisa
    cats = {d["category"] for d in all_diseases()} | {p["category"] for p in all_panels()}
    assert "Oncogenetica" not in cats and "Oncogenética" in cats
    assert "Cardiometabolico" not in cats


# --------------------------------------------------------------- sugestao

def test_sugestao_exige_duas_letras():
    assert cliente.get("/api/suggest?q=b").json()["items"] == []
    assert cliente.get("/api/suggest?q=").json()["items"] == []


def test_sugestao_poe_prefixo_na_frente():
    itens = cliente.get("/api/suggest?q=brca1&limit=8").json()["items"]
    assert itens and itens[0]["label"] == "BRCA1"


def test_sugestao_respeita_o_limite_e_declara_o_tipo():
    itens = cliente.get("/api/suggest?q=car&limit=3").json()["items"]
    assert len(itens) <= 3
    assert all(i["kind"] in {"disease", "panel", "gene", "variant"} for i in itens)


def test_sugestao_ignora_acento_e_caixa():
    a = cliente.get("/api/suggest?q=MARFAN").json()["items"]
    b = cliente.get("/api/suggest?q=marfan").json()["items"]
    assert a and [i["id"] for i in a] == [i["id"] for i in b]


# ----------------------------------------------------------------- fontes

def test_fontes_declaram_licenca_e_citacao():
    itens = cliente.get("/api/sources").json()["items"]
    assert len(itens) >= 8
    for f in itens:
        assert f["license"] and f["license_url"] and f["citation"]


def test_fontes_cc_by_estao_presentes():
    # sao as que EXIGEM atribuicao; se sumirem daqui, o rodape mente
    ids = {f["id"] for f in cliente.get("/api/sources").json()["items"]}
    assert {"orphanet", "panelapp", "pgs_catalog"} <= ids


def test_catalogo_declara_quando_foi_extraido():
    itens = cliente.get("/api/sources").json()["items"]
    for f in itens:
        if f["kind"] == "catalogo":
            assert f["extracted_at"], f"{f['id']} sem data de extracao"
