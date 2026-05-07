import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings
from app.routers import gene, variant


class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        return response


app = FastAPI(
    title="GenVar Dashboard API",
    description="Genetic variant exploration API aggregating Ensembl, gnomAD, ClinVar, AlphaFold, UniProt, and MyVariant.info",
    version="2.0.0",
)

app.add_middleware(TimingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(gene.router, prefix="/api/gene", tags=["gene"])
app.include_router(variant.router, prefix="/api/variant", tags=["variant"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "GenVar Dashboard API", "version": "2.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}
