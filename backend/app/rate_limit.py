"""Limitacao de taxa por IP, em memoria.

O que ela protege nao e o servidor: e o acesso do projeto as fontes. A API do
GenVar repassa para Ensembl, gnomAD e NCBI, todas com politica de uso justo por
IP de origem. Uma varredura contra `/api/gene/{simbolo}` vira uma varredura
contra o Ensembl saindo do IP do Render, e a consequencia nao e lentidao: e o
bloqueio da origem, que derruba a aplicacao inteira para todo mundo.

Janela deslizante em memoria, e a escolha e declarada. O Render de plano
gratuito roda um processo so e reinicia por inatividade, entao um contador em
memoria basta e nao acrescenta o Redis como dependencia obrigatoria para subir.
O preco esta claro: com mais de uma instancia, cada uma conta o seu proprio
limite, e o limite efetivo passa a ser o produto. Com varias instancias, isto
migra para o Redis que o cache ja usa.

`/health` e `/api/health/*` ficam de fora: sonda de disponibilidade e o
monitoramento do proprio Render, e limita-la faz o servico parecer fora do ar
justamente quando alguem esta conferindo se ele esta no ar.

SOBRE O IP DE ORIGEM. `X-Forwarded-For` e uma LISTA em que cada proxy ACRESCENTA
ao final o endereco de quem falou com ele. O cliente pode mandar a sua propria
lista, e ela chega inteira na frente da que o proxy escreveu. Ler o primeiro
elemento, que e a leitura obvia, le exatamente o que o atacante escolheu: medido,
60 de 60 requisicoes passam trocando o cabecalho a cada uma, ou seja, o limitador
barra script honesto e nao barra ninguem que esteja tentando.

O unico elemento confiavel e o que o SEU proxy escreveu, contado a partir do FIM.
`TRUSTED_PROXY_HOPS` diz quantos proxies existem entre o cliente e a aplicacao:
no Render e um. Errar esse numero tem consequencia nos dois sentidos, e nenhum
dos dois e silencioso: alto demais e todo mundo divide o IP do proxy e o limite
vira global; baixo demais e o cabecalho volta a ser controlado pelo cliente.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

# Teto por IP, vindo da configuracao. Sessenta por minuto cobre com folga uma
# pessoa navegando: a pagina de gene faz cerca de cinco chamadas e a de variante
# quatro, entao o limite so incomoda quem esta iterando por script. Zero desliga.
LIMITE_POR_MINUTO = settings.rate_limit_per_minute

# Rajada curta, para nao punir o carregamento simultaneo de uma pagina que
# dispara varias chamadas de uma vez.
LIMITE_POR_SEGUNDO = settings.rate_limit_per_second

ISENTOS = ("/health", "/api/health", "/docs", "/openapi.json", "/redoc")

# Proxies entre o cliente e esta aplicacao. No Render e um. Rodando direto, sem
# proxy nenhum, o valor e zero e o X-Forwarded-For e ignorado por inteiro, que e
# o correto: sem proxy, qualquer XFF que chegue foi o cliente quem escreveu.
TRUSTED_PROXY_HOPS = settings.trusted_proxy_hops

# Quantos IPs distintos guardar. Sem teto, uma varredura de IPs de origem
# forjados faria o proprio limitador consumir a memoria que ele protege.
MAX_IPS = 20_000


class _Janela:
    """Marcas de tempo das requisicoes recentes de um IP."""

    __slots__ = ("marcas",)

    def __init__(self) -> None:
        self.marcas: Deque[float] = deque()

    def registrar(self, agora: float, por_minuto: int = LIMITE_POR_MINUTO,
                  por_segundo: int = LIMITE_POR_SEGUNDO) -> tuple[bool, float]:
        """Registra a requisicao. Devolve (permitida, segundos ate liberar)."""
        if por_minuto <= 0:
            return True, 0.0
        # Descarta o que saiu da janela de um minuto antes de contar.
        while self.marcas and agora - self.marcas[0] > 60.0:
            self.marcas.popleft()

        no_minuto = len(self.marcas)
        no_segundo = sum(1 for m in self.marcas if agora - m <= 1.0)

        if por_segundo > 0 and no_segundo >= por_segundo:
            return False, 1.0
        if no_minuto >= por_minuto:
            return False, max(1.0, 60.0 - (agora - self.marcas[0]))

        self.marcas.append(agora)
        return True, 0.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limite_minuto: int | None = None,
                 limite_segundo: int | None = None, hops: int | None = None) -> None:
        super().__init__(app)
        self.limite_minuto = LIMITE_POR_MINUTO if limite_minuto is None else limite_minuto
        self.limite_segundo = LIMITE_POR_SEGUNDO if limite_segundo is None else limite_segundo
        self.hops = TRUSTED_PROXY_HOPS if hops is None else hops
        self._por_ip: Dict[str, _Janela] = defaultdict(_Janela)

    def _ip(self, request: Request) -> str:
        direto = request.client.host if request.client else "desconhecido"
        if self.hops <= 0:
            return direto

        encaminhado = request.headers.get("x-forwarded-for")
        if not encaminhado:
            return direto

        cadeia = [p.strip() for p in encaminhado.split(",") if p.strip()]
        # Conta do FIM: a ultima posicao foi escrita pelo proxy mais proximo
        # daqui, a penultima pelo anterior, e assim por diante. Tudo que estiver
        # antes de `hops` posicoes veio do cliente e nao vale nada.
        if len(cadeia) >= self.hops:
            return cadeia[-self.hops]
        # Cadeia mais curta que o esperado: ou a configuracao esta errada, ou
        # alguem chegou por um caminho que nao passa pelo proxy. Nos dois casos o
        # endereco da conexao e mais confiavel que adivinhar na lista.
        return direto

    def _podar(self, agora: float) -> None:
        if len(self._por_ip) <= MAX_IPS:
            return
        # Remove quem nao aparece ha mais de um minuto: a janela ja o esvaziou.
        mortos = [ip for ip, j in self._por_ip.items()
                  if not j.marcas or agora - j.marcas[-1] > 60.0]
        for ip in mortos:
            del self._por_ip[ip]
        # Se ainda assim estourou, sao todos ativos: derruba o limitador em vez
        # de crescer sem fim. Preferir passar requisicao a estourar a memoria.
        if len(self._por_ip) > MAX_IPS:
            self._por_ip.clear()

    async def dispatch(self, request: Request, call_next):
        if self.limite_minuto <= 0:
            return await call_next(request)

        caminho = request.url.path
        if caminho.startswith(ISENTOS):
            return await call_next(request)

        agora = time.monotonic()
        self._podar(agora)
        permitida, espera = self._por_ip[self._ip(request)].registrar(
            agora, self.limite_minuto, self.limite_segundo)

        if not permitida:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        "Limite de requisições excedido. A API do GenVar repassa consultas "
                        "para Ensembl, gnomAD e NCBI, que aplicam política de uso justo por "
                        "IP de origem; o limite existe para não derrubar o acesso do projeto "
                        "a essas fontes."
                    ),
                    "limite_por_minuto": self.limite_minuto,
                    "limite_por_segundo": self.limite_segundo,
                    "tente_em_segundos": round(espera, 1),
                },
                headers={"Retry-After": str(int(espera) + 1)},
            )

        return await call_next(request)
