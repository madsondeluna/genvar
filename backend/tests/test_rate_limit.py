"""Limitacao de taxa. O tempo entra como parametro para o teste ser deterministico:
medir contra o relogio real faria o resultado depender da latencia da maquina, e
foi assim que a primeira tentativa passou sem exercitar limite nenhum."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.rate_limit import RateLimitMiddleware, _Janela, ISENTOS

# A suite roda com o limitador DESLIGADO (RATE_LIMIT_PER_MINUTE=0 no conftest),
# senao os testes de doenca reprovariam por 429 saindo todos do mesmo IP. Quem
# testa o limitador monta o seu proprio app com os limites que quer, o que
# tambem tira a dependencia dos valores de producao: mudar o teto la nao pode
# quebrar teste aqui.
LIMITE_POR_MINUTO = 12
LIMITE_POR_SEGUNDO = 4


def _app():
    a = FastAPI()
    a.add_middleware(RateLimitMiddleware,
                     limite_minuto=LIMITE_POR_MINUTO, limite_segundo=LIMITE_POR_SEGUNDO)

    @a.get("/api/coisa")
    async def coisa():
        return {"ok": True}

    @a.get("/health")
    async def health():
        return {"ok": True}

    return a


def test_rajada_no_mesmo_instante_e_barrada():
    j = _Janela()
    t = 1000.0
    for i in range(LIMITE_POR_SEGUNDO):
        permitida, _ = j.registrar(t, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)
        assert permitida, f"a requisicao {i + 1} deveria passar"
    permitida, espera = j.registrar(t, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)
    assert not permitida
    assert espera > 0


def test_um_segundo_depois_a_rajada_libera():
    j = _Janela()
    t = 1000.0
    for _ in range(LIMITE_POR_SEGUNDO):
        j.registrar(t, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)
    assert not j.registrar(t, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)[0]
    # Passado o segundo, a rajada some mas o minuto continua contando.
    assert j.registrar(t + 1.01, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)[0]


def test_teto_por_minuto_barra_mesmo_espacado():
    j = _Janela()
    t = 1000.0
    # Espacadas o bastante para nunca disparar o limite por segundo.
    for i in range(LIMITE_POR_MINUTO):
        assert j.registrar(t + i * 0.5, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)[0]
    permitida, espera = j.registrar(t + LIMITE_POR_MINUTO * 0.5, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)
    assert not permitida
    assert espera > 0


def test_a_janela_desliza_e_nao_acumula():
    j = _Janela()
    for i in range(LIMITE_POR_MINUTO):
        j.registrar(1000.0 + i * 0.5, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)
    assert not j.registrar(1000.0 + LIMITE_POR_MINUTO * 0.5, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)[0]
    # As 60 marcas cobrem 30 segundos (60 x 0,5), entao em t+61 a maioria ainda
    # esta dentro da janela: a ultima entrou em t+29,5. O ponto em que tudo saiu
    # e depois da ULTIMA marca mais 60 segundos.
    ultima = 1000.0 + (LIMITE_POR_MINUTO - 1) * 0.5
    assert j.registrar(ultima + 60.1, LIMITE_POR_MINUTO, LIMITE_POR_SEGUNDO)[0]
    assert len(j.marcas) == 1


@pytest.mark.parametrize("rota", ["/health", "/api/health/sources", "/docs"])
def test_sonda_de_saude_nao_e_limitada(rota):
    assert rota.startswith(ISENTOS)


def test_ips_distintos_tem_contadores_separados():
    cliente = TestClient(_app())
    # Um IP estoura o teto.
    for _ in range(LIMITE_POR_MINUTO + 2):
        cliente.get("/api/coisa", headers={"x-forwarded-for": "198.51.100.1"})
    assert cliente.get("/api/coisa",
                       headers={"x-forwarded-for": "198.51.100.1"}).status_code == 429
    # O vizinho nao paga por isso.
    assert cliente.get("/api/coisa",
                       headers={"x-forwarded-for": "198.51.100.2"}).status_code == 200


def test_sonda_passa_mesmo_com_o_ip_bloqueado():
    cliente = TestClient(_app())
    for _ in range(LIMITE_POR_MINUTO + 2):
        cliente.get("/api/coisa", headers={"x-forwarded-for": "198.51.100.9"})
    assert cliente.get("/api/coisa",
                       headers={"x-forwarded-for": "198.51.100.9"}).status_code == 429
    # Se a sonda tambem fosse limitada, o servico pareceria fora do ar justamente
    # quando alguem esta conferindo se ele esta no ar.
    assert cliente.get("/health",
                       headers={"x-forwarded-for": "198.51.100.9"}).status_code == 200


def test_resposta_429_explica_e_traz_retry_after():
    cliente = TestClient(_app())
    for _ in range(LIMITE_POR_MINUTO + 5):
        r = cliente.get("/api/coisa", headers={"x-forwarded-for": "203.0.113.77"})
        if r.status_code == 429:
            break
    else:
        pytest.fail("o limite por minuto nunca disparou")

    assert "Retry-After" in r.headers
    corpo = r.json()
    assert corpo["limite_por_minuto"] == LIMITE_POR_MINUTO
    # A mensagem tem de dizer POR QUE existe o limite: sem isso, quem bate nele
    # conclui que a aplicacao esta com defeito.
    assert "Ensembl" in corpo["detail"]
