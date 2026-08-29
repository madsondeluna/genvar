

def test_panel_detail_accepts_both_condition_shapes():
    """Duas formas de `conditions`, dois produtores, um consumidor.

    O catalogo curado escreve objeto e o ETL do PanelApp escreve string. O
    roteador lia so objeto e estourava TypeError nos 337 paineis importados: 16
    dos 30 paineis listados em /paineis devolviam 500 e nao abriam. Encontrado
    pela suite de completude do benchmark, nao pelos testes, porque nenhum teste
    abria um painel de prefixo `pa-`.
    """
    from app.routers.panel import _condicoes

    assert [c.name for c in _condicoes(["Arrhythmogenic cardiomyopathy", "R133"])] \
        == ["Arrhythmogenic cardiomyopathy", "R133"]
    assert [c.name for c in _condicoes([{"name": "Sindrome de Lynch",
                                         "disease_id": "ORPHA:144"}])] == ["Sindrome de Lynch"]
    assert _condicoes([]) == []
    assert _condicoes(None) == []
    # String vazia nao vira condicao sem nome.
    assert _condicoes(["", "  "]) == []
