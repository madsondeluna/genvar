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

# O CACHE tambem fica desligado, e nao por comodidade: ligado, a suite passa ou
# reprova conforme o que houver no Redis da maquina, que e estado de fora dela.
#
# Medido: `test_detail_degrades_when_constraint_unavailable` substitui a chamada
# a gnomAD por uma que nao devolve nada e exige que todo gene saia marcado como
# "sem constraint". Com o Redis populado por outra execucao, a rota devolve o
# registro cacheado antes de chegar na chamada substituida, e o teste reprova
# apontando para um defeito que nao existe. Com o Redis vazio, passa. Um teste
# cujo resultado depende de o Redis estar vazio nao esta testando o codigo.
#
# Apontar para um banco inexistente e o jeito mais direto: `get_redis` ja trata
# falha de conexao devolvendo None, e nesse caminho `cache_get` sempre erra e
# `cache_set` nao grava, que e exatamente o comportamento desejado na suite.
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:1")
