"""Configuracao comum da suite.

`test_apis.py` inteiro e teste de contrato externo: cada funcao ali faz uma
chamada de rede real. Marcar as quinze uma a uma seria quinze decoradores para
dizer a mesma coisa sobre o arquivo, e a marca sairia do lugar assim que alguem
acrescentasse um teste. A marca por caminho vale para o arquivo e continua
valendo para o que entrar nele depois.
"""
import pytest

ARQUIVOS_DE_INTEGRACAO = {"test_apis.py"}


def pytest_collection_modifyitems(config, items):
    for item in items:
        if item.path.name in ARQUIVOS_DE_INTEGRACAO:
            item.add_marker(pytest.mark.integration)
