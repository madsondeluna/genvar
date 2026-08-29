import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings
from app.rate_limit import RateLimitMiddleware
from app.routers import gene, variant, disease, panel, pgs, health, suggest, sources

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("genvar")


class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        return response


# Uma constante, dois pontos de uso. Escrita duas vezes, a versao do `/` e a do
# OpenAPI divergem sem que nada quebre, e foi assim que a API ficou anunciando
# 2.0.0 depois que o resto do projeto ja era 3.0.0.
VERSAO = "3.0.0"

app = FastAPI(
    title="GenVar API",
    description="Genetic variant exploration API aggregating Ensembl, gnomAD, ClinVar, AlphaFold, UniProt, and MyVariant.info",
    version=VERSAO,
)

app.add_middleware(TimingMiddleware)
# Antes do CORS na ordem de adicao, o que o poe DEPOIS na execucao: a resposta
# 429 precisa sair com os cabecalhos de CORS, ou o navegador a esconde atras de
# um erro de rede e ninguem descobre que foi limite de taxa.
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(gene.router, prefix="/api/gene", tags=["gene"])
app.include_router(variant.router, prefix="/api/variant", tags=["variant"])
app.include_router(disease.router, prefix="/api/disease", tags=["disease"])
app.include_router(panel.router, prefix="/api/panel", tags=["panel"])
app.include_router(pgs.router, prefix="/api/pgs", tags=["pgs"])
app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(suggest.router, prefix="/api/suggest", tags=["suggest"])
app.include_router(sources.router, prefix="/api/sources", tags=["sources"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "GenVar API", "version": VERSAO}


@app.get("/health")
async def health():
    return {"status": "ok"}
