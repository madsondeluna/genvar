# GenVar Dashboard

Full-stack web application for genetic variant exploration.
TCC de Engenharia de Software - MBA USP
Developed by Madson A. de Luna Aragão (PhD Student in Bioinformatics, UFMG)

## Overview

GenVar Dashboard aggregates data from five public genomic databases to provide
a unified interface for exploring genes and genetic variants:

- **Ensembl**: Gene annotation, variant overlap, and Variant Effect Predictor (VEP)
- **gnomAD**: Population allele frequencies and gene constraint metrics
- **ClinVar**: Clinical variant classifications and associated conditions
- **AlphaFold**: Protein structure predictions
- **UniProt**: Protein database and gene-to-protein mapping

## Features

- Gene search: constraint metrics (pLI, LOEUF), variant distribution heatmap, AlphaFold structure
- Variant search: geographic distribution map, population frequency charts, prediction radar chart
- All charts use Plotly.js with interactive hover tooltips
- Redis caching to avoid redundant API calls
- Parallel API queries via asyncio.gather

## Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- Redis (optional, gracefully disabled if unavailable)
- Docker + Docker Compose (optional)

### Running with Docker Compose

```bash
cd genvar-dashboard
docker-compose up --build
```

Frontend: http://localhost:3000
Backend API: http://localhost:8000
API docs: http://localhost:8000/docs

### Running Locally

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000 and proxies `/api` calls to the backend.

## Testing

**Backend unit tests:**
```bash
cd backend
pytest tests/test_services.py -v
```

**Backend integration tests (requires internet):**
```bash
pytest tests/test_apis.py -v
```

## Project Structure

```
genvar-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py               FastAPI app and CORS config
│   │   ├── config.py             Settings from environment variables
│   │   ├── routers/
│   │   │   ├── gene.py           GET /api/gene/{symbol}
│   │   │   └── variant.py        GET /api/variant/{rsid}
│   │   ├── services/
│   │   │   ├── ensembl.py        Ensembl REST API client
│   │   │   ├── gnomad.py         gnomAD GraphQL client
│   │   │   ├── clinvar.py        ClinVar E-utilities client
│   │   │   ├── alphafold.py      AlphaFold API client
│   │   │   └── uniprot.py        UniProt REST API client
│   │   ├── models/schemas.py     Pydantic response models
│   │   └── utils/
│   │       ├── cache.py          Redis cache helpers
│   │       └── validators.py     Input validation
│   └── tests/
│       ├── test_apis.py          Live integration tests
│       └── test_services.py      Unit tests with mocks
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── GeographicVariantMap.jsx    World map (Plotly scattergeo)
│       │   ├── GeneLocusHeatmap.jsx        1kb bin stacked bar chart
│       │   ├── PredictionScoresRadar.jsx   Radar chart (SIFT/PolyPhen/CADD/REVEL)
│       │   ├── FrequencyBarChart.jsx       Log-scale population bar chart
│       │   ├── ConstraintMetrics.jsx       pLI/LOEUF visual gauges
│       │   ├── VariantTable.jsx            Sortable paginated table
│       │   ├── LoadingSpinner.jsx
│       │   └── ErrorAlert.jsx
│       └── pages/
│           ├── HomePage.jsx
│           ├── GenePage.jsx
│           └── VariantPage.jsx
├── docker-compose.yml
└── API_TESTING_REPORT.md         Documents actual API behavior vs documentation
```

## API Endpoints

```
GET /api/gene/{gene_symbol}
  Returns gene info, variant summary, constraint metrics, AlphaFold URLs

GET /api/variant/{rsid}
  Returns variant annotation, population frequencies, ClinVar data, predictions
```

Full API documentation available at http://localhost:8000/docs (Swagger UI).

## Key Implementation Notes

Based on testing documented in API_TESTING_REPORT.md:

1. gnomAD populations do not expose `af` directly - it is calculated as `ac / an`
2. gnomAD constraint uses `oe_lof_upper` for LOEUF (not `loeuf`), `pli` for pLI
3. ClinVar uses `germline_classification.description` (not `clinical_significance`)
4. AlphaFold returns an array - the first item is the canonical model
5. gnomAD population IDs are lowercase (`afr`, `amr`) not uppercase
