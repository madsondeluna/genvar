from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import gene, variant

app = FastAPI(
    title="GenVar Dashboard API",
    description="Genetic variant exploration API aggregating Ensembl, gnomAD, ClinVar, AlphaFold, UniProt, and MyVariant.info",
    version="2.0.0",
)

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
