"""Configuracao comum da suite.

`test_apis.py` inteiro e teste de contrato externo: cada funcao ali faz uma
chamada de rede real. Marcar as quinze uma a uma seria quinze decoradores para
dizer a mesma coisa sobre o arquivo, e a marca sairia do lugar assim que alguem
acrescentasse um teste. A marca por caminho vale para o arquivo e continua
valendo para o que entrar nele depois.
"""
import os
import pytest

ARQUIVOS_DE_INTEGRACAO = {"test_apis.py"}


def pytest_collection_modifyitems(config, items):
    for item in items:
        if item.path.name in ARQUIVOS_DE_INTEGRACAO:
            item.add_marker(pytest.mark.integration)


# A limitacao de taxa fica desligada na suite. Todos os testes saem do mesmo IP
# do TestClient e estourariam o teto juntos, fazendo um teste de doenca reprovar
# por 429 e apontar para o lugar errado. Quem testa o limitador liga o dele.
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "0")
