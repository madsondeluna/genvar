"""Testes das transformacoes dos tres ETLs.

Cobrem a funcao pura de cada um, com um registro montado a mao no formato que a
fonte devolve. Nao ha rede aqui: o que se testa e a REGRA, e a regra e onde
esta o risco. Cada teste abaixo corresponde a uma decisao de curadoria que, se
mudar em silencio, muda o que o app afirma clinicamente.
"""
import pytest

from etl import panelapp, pgscatalog, orphanet


# ---------------------------------------------------------------- PanelApp

def _painel(genes):
    return {"id": 42, "name": "Teste de painel", "version": "1.0",
            "disease_group": "Neurology", "disease_sub_group": "",
            "relevant_disorders": ["R100"], "genes": genes}


def _gene(symbol, conf, moi="BIALLELIC"):
    return {"entity_type": "gene", "entity_name": symbol, "confidence_level": conf,
            "mode_of_inheritance": moi, "phenotypes": [],
            "gene_data": {"hgnc_id": "HGNC:1", "gene_name": symbol, "ensembl_genes": {}}}


def test_panelapp_so_verde_entra_no_conjunto_principal():
    d = _painel([_gene("AAA", "3"), _gene("BBB", "2"), _gene("CCC", "1")])
    t = panelapp.transformar(d)
    assert t["genes"] == ["AAA"], "ambar e vermelho nao podem virar gene do painel"
    assert t["genes_amber"] == ["BBB"]


def test_panelapp_sem_gene_verde_e_descartado():
    # painel so de candidatos nao e diagnostico, e listar como se fosse afirma
    # uma evidencia que o PanelApp nao afirma
    assert panelapp.transformar(_painel([_gene("AAA", "2")])) is None


def test_panelapp_categoria_normaliza_os_nomes_duplicados_da_fonte():
    assert panelapp.categoria("Neurology") == "Neurologia"
    assert panelapp.categoria("Neurology and neurodevelopmental disorders") == "Neurologia"
    assert panelapp.categoria("Metabolic") == panelapp.categoria("Metabolic disorders")
    assert panelapp.categoria("Coisa que nao existe") == "Outros"


def test_panelapp_heranca_resume_os_modos_dos_genes_verdes():
    assert panelapp.heranca([_gene("A", "3", "BIALLELIC")]) == "Autossômica recessiva"
    misto = panelapp.heranca([_gene("A", "3", "BIALLELIC"), _gene("B", "3", "MONOALLELIC")])
    assert "recessiva" in misto and "dominante" in misto
    assert panelapp.heranca([_gene("A", "3", "")]) == "Não especificada"


# ------------------------------------------------------------- PGS Catalog

def _escore(dist, efo_id="EFO_0000305"):
    return {"id": "PGS999999", "name": "teste", "trait_reported": "Teste",
            "trait_efo": [{"id": efo_id, "label": "teste"}],
            "variants_number": 10, "variants_genomebuild": "GRCh38",
            "method_name": "metodo", "publication": {"firstauthor": "Fulano", "pub_year": 2020},
            "ancestry_distribution": {"gwas": {"dist": dist}}}


def test_pgs_marca_escore_desenvolvido_so_em_europeus():
    # e a informacao que decide se o escore se aplica a alguem fora da Europa
    assert pgscatalog.transformar(_escore({"EUR": 100}), {})["eur_only"] is True
    assert pgscatalog.transformar(_escore({"EUR": 60, "AFR": 40}), {})["eur_only"] is False


def test_pgs_mapeia_ancestria_para_o_vocabulario_do_app():
    t = pgscatalog.transformar(_escore({"GME": 50, "MAE": 50}), {})
    # as duas chaves do catalogo caem na mesma do app, entao somam
    assert t["ancestry"] == {"MID": 100}


def test_pgs_categoria_vem_da_taxonomia_do_catalogo():
    t = pgscatalog.transformar(_escore({"EUR": 100}, "EFO_1"), {"EFO_1": "Lipídeos"})
    assert t["category"] == "Lipídeos"
    # trait fora da taxonomia nao inventa categoria
    assert pgscatalog.transformar(_escore({"EUR": 100}, "EFO_X"), {})["category"] == "Outros traços"


# ---------------------------------------------------------------- Orphanet

def test_orphanet_prioridade_resolve_doenca_em_varias_classificacoes():
    # Marfan esta em sete classificacoes do Orphanet. Sem prioridade, a
    # categoria e a primeira que o disco devolver, o que e sortear.
    cats = {"Cardiologia", "Oftalmologia", "Musculoesquelético",
            "Malformações congênitas", "Tecido conjuntivo"}
    assert orphanet.primaria(cats) == "Tecido conjuntivo"
    assert orphanet.primaria({"Outros", "Oncogenética"}) == "Oncogenética"
    assert orphanet.primaria(set()) == "Outros"


def test_orphanet_mapeia_especialidade_para_categoria():
    assert orphanet.categoria_de("Orphanet classification of rare cardiac diseases") == "Cardiologia"
    # o erro que essa funcao ja cometeu: anomalias do desenvolvimento sao
    # malformacao congenita, nao neurologia
    assert orphanet.categoria_de(
        "Orphanet classification of rare developmental anomalies during embryogenesis"
    ) == "Malformações congênitas"
    assert orphanet.categoria_de("Orphanet classification of rare genetic diseases") is None


def test_orphanet_so_mutacao_causadora_conta_como_gene_causal():
    assert "Disease-causing germline mutation(s) in" in orphanet.TIPOS_CAUSAIS
    assert "Major susceptibility factor in" not in orphanet.TIPOS_CAUSAIS
    assert "Candidate gene tested in" not in orphanet.TIPOS_CAUSAIS
