# GenVar Dashboard

**Trabalho de Conclusao de Curso - MBA em Engenharia de Software**
Escola Politecnica da Universidade de Sao Paulo (USP)

**Autor:** Madson A. de Luna Aragao
**Vinculo:** Doutorando em Bioinformatica - Universidade Federal de Minas Gerais (UFMG)
**Repositorio:** https://github.com/madsondeluna/genvar
**Versao:** 1.0.0

---

## Descricao do Projeto

GenVar Dashboard e uma aplicacao web full-stack para exploracao interativa de genes e variantes geneticas humanas. A plataforma integra dados de cinco bancos de dados publicos internacionais - Ensembl, gnomAD, ClinVar, AlphaFold e UniProt - em uma interface unificada, eliminando a necessidade de o usuario consultar multiplos portais separados para obter uma visao abrangente de uma variante ou gene de interesse.

O sistema e voltado para pesquisadores, clinicos e estudantes das areas de bioinformatica, genetica medica e medicina de precisao, permitindo a exploracao de anotacoes funcionais, frequencias populacionais, significado clinico, escores de patogenicidade e estrutura proteica de forma integrada e visualmente acessivel.

---

## Motivacao e Justificativa

A interpretacao de variantes geneticas e um dos desafios centrais da genomica moderna. Ferramentas como gnomAD, ClinVar e Ensembl sao amplamente utilizadas na comunidade cientifica, mas cada uma oferece apenas uma perspectiva parcial. A ausencia de uma interface que consolide essas fontes em um fluxo de consulta unico representa um gargalo operacional em pesquisa e em contextos de diagnostico genomico.

Este projeto aplica praticas de Engenharia de Software - arquitetura em camadas, APIs REST e GraphQL, testes automatizados, containerizacao e design de interfaces - ao dominio da bioinformatica, demonstrando como tecnicas de desenvolvimento moderno podem acelerar fluxos de trabalho cientificos.

---

## Funcionalidades

**Busca por Gene (simbolo HGNC)**
- Informacoes basicas: ID Ensembl, cromossomo, locus genomico, fita, biotipo
- Metricas de restricao evolutiva: pLI, LOEUF (oe_lof_upper), o/e LoF, o/e Missense
- Resumo de variantes: total, patogenicas, VUS, benignas
- Visualizacao de distribuicao de variantes ao longo do gene (heatmap por bins de 1kb)
- Link para estrutura proteica predita pelo AlphaFold (imagem PAE + download PDB)
- Links externos: NCBI Gene, gnomAD, UniProt, AlphaFold

**Busca por Variante (dbSNP rs ID)**
- Anotacao funcional completa via Variant Effect Predictor (VEP) do Ensembl
- Frequencias alelicas populacionais do gnomAD (genoma, 9 populacoes principais)
- Mapa geografico interativo com distribuicao global das frequencias
- Grafico de barras de frequencias por populacao (escala logaritmica)
- Classificacao clinica do ClinVar: significado, status de revisao, data, condicoes associadas
- Escores de patogenicidade em grafico radar: SIFT, PolyPhen-2, CADD, REVEL

---

## Bancos de Dados e APIs Integrados

### 1. Ensembl REST API
**Instituicao:** European Bioinformatics Institute (EMBL-EBI) / Wellcome Sanger Institute
**URL:** https://rest.ensembl.org
**Tipo de API:** REST (JSON)
**Autenticacao:** Nenhuma (publica)
**Rate limit:** 15 requisicoes/segundo

**Endpoints utilizados:**

| Endpoint | Descricao |
|----------|-----------|
| `GET /lookup/symbol/homo_sapiens/{symbol}` | Recupera metadados do gene: ID Ensembl, cromossomo, locus, fita, biotipo, assembly |
| `GET /overlap/id/{gene_id}?feature=variation` | Lista variantes sobrepostas ao gene, com consequencia e significado clinico bruto |
| `GET /vep/human/id/{rsid}` | Variant Effect Predictor: anotacao funcional completa com SIFT, PolyPhen, consequencia molecular, mudanca de aminoacido |

**Dados retornados utilizados no sistema:**
- `id` (ENSG...) - identificador Ensembl do gene
- `seq_region_name` - cromossomo
- `start`, `end`, `strand` - locus genomico
- `consequence_type` - tipo de consequencia molecular da variante
- `clinical_significance` - array com classificacoes clinicas brutas
- `sift_score`, `sift_prediction` - escore SIFT de tolerancia a substituicao
- `polyphen_score`, `polyphen_prediction` - escore PolyPhen-2 de dano estrutural
- `amino_acids`, `codons` - mudanca de aminoacido e codon

---

### 2. gnomAD GraphQL API
**Instituicao:** Broad Institute of MIT and Harvard
**URL:** https://gnomad.broadinstitute.org/api
**Tipo de API:** GraphQL
**Autenticacao:** Nenhuma (publica)
**Dataset utilizado:** gnomAD r4 (genoma)

**Queries utilizadas:**

| Query | Descricao |
|-------|-----------|
| `variant(variantId, dataset)` | Frequencias alelicas por populacao (AC, AN, AF calculado como AC/AN) |
| `gene(gene_symbol, reference_genome)` | Metricas de restricao evolutiva do gene |

**Populacoes retornadas e utilizadas:**

| ID (API) | Populacao |
|----------|-----------|
| `afr` | African / African American |
| `amr` | Latino / Admixed American |
| `asj` | Ashkenazi Jewish |
| `eas` | East Asian |
| `fin` | Finnish |
| `nfe` | Non-Finnish European |
| `sas` | South Asian |
| `mid` | Middle Eastern |
| `ami` | Amish |

**Campos de restricao utilizados:**

| Campo | Descricao |
|-------|-----------|
| `pli` | Probabilidade de intolerancia a variantes de perda de funcao (0-1) |
| `oe_lof_upper` | LOEUF - upper bound do intervalo de confianca de o/e LoF |
| `oe_lof` | Razao observado/esperado para variantes LoF |
| `oe_mis` | Razao observado/esperado para variantes missense |
| `lof_z` | Z-score de restricao para LoF |

**Nota tecnica:** O campo `af` nao existe no tipo `VariantPopulation` da API - o valor e calculado no backend como `ac / an`. Os IDs de populacao sao em minusculas na API (`afr`, `amr`), divergindo da documentacao.

---

### 3. ClinVar via NCBI E-utilities
**Instituicao:** National Center for Biotechnology Information (NCBI) / National Library of Medicine (NLM)
**URL:** https://eutils.ncbi.nlm.nih.gov/entrez/eutils
**Tipo de API:** REST (JSON/XML)
**Autenticacao:** Nenhuma (publica)
**Rate limit:** 3 requisicoes/segundo sem chave de API

**Fluxo de consulta (dois passos):**

| Passo | Endpoint | Descricao |
|-------|----------|-----------|
| 1 | `GET /esearch.fcgi?db=clinvar&term={rsid}&retmode=json` | Recupera lista de UIDs ClinVar associados ao rs ID |
| 2 | `GET /esummary.fcgi?db=clinvar&id={uids}&retmode=json` | Recupera sumario de multiplos registros em lote |

**Campos utilizados do objeto retornado:**

| Campo | Descricao |
|-------|-----------|
| `germline_classification.description` | Classificacao clinica textual (Pathogenic, Benign, VUS, Conflicting...) |
| `germline_classification.review_status` | Nivel de evidencia da classificacao |
| `germline_classification.last_evaluated` | Data da ultima avaliacao |
| `germline_classification.trait_set[].trait_name` | Condicoes clinicas associadas |
| `accession` | Identificador VCV (aggregate) ou RCV (submissao individual) |

**Nota tecnica:** O campo historico `clinical_significance` foi substituido por `germline_classification` na versao atual da API. O sistema busca todos os UIDs em lote e seleciona o registro VCV mais abrangente (maior numero de condicoes associadas = registro agregado).

---

### 4. AlphaFold Protein Structure Database API
**Instituicao:** DeepMind / European Bioinformatics Institute (EMBL-EBI)
**URL:** https://alphafold.ebi.ac.uk/api
**Tipo de API:** REST (JSON)
**Autenticacao:** Nenhuma (publica)

**Endpoint utilizado:**

| Endpoint | Descricao |
|----------|-----------|
| `GET /prediction/{uniprot_id}` | Recupera metadados e URLs da estrutura proteica predita |

**Campos utilizados:**

| Campo | Descricao |
|-------|-----------|
| `pdbUrl` | URL para download da estrutura em formato PDB |
| `cifUrl` | URL para download em formato mmCIF |
| `paeImageUrl` | URL da imagem do Predicted Aligned Error (PAE) |
| `globalMetricValue` | Score global de confianca pLDDT medio |
| `latestVersion` | Versao mais recente do modelo |
| `entryId` | Identificador do modelo (ex: AF-P38398-F1) |

**Nota tecnica:** A API retorna um array de objetos (multiplos fragmentos para proteinas longas). O sistema utiliza sempre o primeiro elemento (`[0]`), que corresponde ao modelo canonico.

---

### 5. UniProt REST API
**Instituicao:** Universal Protein Resource Consortium (UniProt) - EMBL-EBI / SIB / PIR
**URL:** https://rest.uniprot.org
**Tipo de API:** REST (JSON)
**Autenticacao:** Nenhuma (publica)

**Endpoint utilizado:**

| Endpoint | Descricao |
|----------|-----------|
| `GET /uniprotkb/search?query=gene:{symbol}+AND+organism_id:9606+AND+reviewed:true` | Mapeia simbolo HGNC para accession UniProtKB Swiss-Prot |

**Campos utilizados:**

| Campo | Descricao |
|-------|-----------|
| `results[0].primaryAccession` | Accession UniProt canonica (ex: P38398 para BRCA1) |

**Nota tecnica:** O filtro `reviewed:true` garante que apenas entradas Swiss-Prot (curadas manualmente) sejam retornadas, excluindo entradas TrEMBL (preditas automaticamente). O UniProt ID obtido e utilizado para consultar o AlphaFold.

---

## Arquitetura do Sistema

```
                           Usuario (Browser)
                                  |
                         http://localhost:3000
                                  |
                    +-------------+-------------+
                    |       Frontend (React)     |
                    |  Vite | TanStack Query      |
                    |  Plotly.js | Tailwind CSS   |
                    +-------------+-------------+
                                  |
                           /api/* (proxy)
                                  |
                    +-------------+-------------+
                    |      Backend (FastAPI)      |
                    |   asyncio.gather()          |
                    |   Pydantic v2 schemas       |
                    +--+--------+--------+--------+
                       |        |        |
                    Redis    Ensembl  gnomAD
                    Cache    REST     GraphQL
                               |        |
                            ClinVar  AlphaFold
                            E-utils  REST
                               |
                            UniProt
                            REST
```

**Fluxo de uma requisicao de gene:**
1. Frontend envia `GET /api/gene/BRCA1`
2. Backend valida o simbolo (regex HGNC)
3. Verifica cache Redis (TTL: 1 hora)
4. Se cache miss: executa em paralelo via `asyncio.gather()`:
   - Ensembl: metadados do gene + lista de variantes
   - gnomAD: metricas de restricao
   - UniProt: accession da proteina
5. Com o UniProt ID, consulta AlphaFold
6. Agrega, valida com Pydantic e retorna JSON
7. Armazena no Redis
8. Frontend renderiza com TanStack Query (cache client-side adicional)

---

## Tecnologias Utilizadas

### Backend

| Tecnologia | Versao | Funcao |
|------------|--------|--------|
| Python | 3.12+ | Linguagem principal do backend |
| FastAPI | 0.115 | Framework web async com OpenAPI automatico |
| Uvicorn | 0.32 | Servidor ASGI de alta performance |
| httpx | 0.27 | Cliente HTTP async para consultas as APIs externas |
| Pydantic v2 | 2.9 | Validacao e serializacao de dados (schemas de resposta) |
| pydantic-settings | 2.5 | Gerenciamento de configuracoes via variaveis de ambiente |
| Redis | 7 | Cache de respostas das APIs (TTL configuravel) |
| pytest | 8.3 | Framework de testes unitarios e de integracao |
| pytest-asyncio | 0.24 | Suporte a testes de funcoes async |

### Frontend

| Tecnologia | Versao | Funcao |
|------------|--------|--------|
| React | 18.2 | Biblioteca de interface declarativa baseada em componentes |
| Vite | 5.0 | Build tool e dev server com HMR |
| Tailwind CSS | 3.3 | Framework CSS utility-first (paleta cinza exclusiva) |
| TanStack Query | 5.17 | Gerenciamento de estado assincrono e cache client-side |
| Axios | 1.6 | Cliente HTTP com interceptors de erro |
| Plotly.js | 2.27 | Biblioteca de visualizacao interativa (5 tipos de grafico) |
| react-plotly.js | 2.6 | Wrapper React para Plotly.js |
| Lucide React | 0.294 | Biblioteca de icones SVG |
| react-router-dom | 6.20 | Roteamento client-side (SPA) |

### Infraestrutura

| Tecnologia | Versao | Funcao |
|------------|--------|--------|
| Docker | 24+ | Containerizacao de backend e frontend |
| Docker Compose | 2.x | Orquestracao local dos servicos |
| Nginx | Alpine | Servidor de arquivos estaticos + proxy reverso (producao) |

---

## Visualizacoes Implementadas

| Componente | Tipo | Dados | Biblioteca |
|------------|------|-------|------------|
| `GeographicVariantMap` | Mapa mundial (scattergeo) | Frequencias alelicas por populacao (gnomAD) | Plotly.js |
| `FrequencyBarChart` | Barras (escala log) | AC/AN/AF por populacao (gnomAD) | Plotly.js |
| `PredictionScoresRadar` | Radar/polar | SIFT, PolyPhen-2, CADD, REVEL normalizados 0-1 | Plotly.js |
| `GeneLocusHeatmap` | Barras empilhadas | Distribuicao de variantes em bins de 1kb ao longo do gene | Plotly.js |
| `ConstraintMetrics` | Gauges + barras de progresso | pLI, LOEUF, o/e LoF, o/e Missense (gnomAD) | CSS nativo |
| `VariantTable` | Tabela ordenavel + paginacao | Lista de variantes classificadas por categoria clinica | React |

**Normalizacao dos escores de patogenicidade no radar chart:**

| Escore | Direcao original | Normalizacao para 0-1 (0=benigno, 1=patogenico) |
|--------|-----------------|--------------------------------------------------|
| SIFT | Menor = mais deletério | `1 - score` |
| PolyPhen-2 | Maior = mais deletério | Sem alteracao |
| CADD Phred | Maior = mais deletério | `min(1, score / 40)` |
| REVEL | Maior = mais deletério | Sem alteracao |

---

## Estrutura do Projeto

```
genvar-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py                  FastAPI app, CORS, registro de routers
│   │   ├── config.py                Configuracoes via variaveis de ambiente (pydantic-settings)
│   │   ├── routers/
│   │   │   ├── gene.py              GET /api/gene/{symbol} - agregacao paralela
│   │   │   └── variant.py           GET /api/variant/{rsid} - agregacao paralela
│   │   ├── services/
│   │   │   ├── ensembl.py           Cliente Ensembl REST API
│   │   │   ├── gnomad.py            Cliente gnomAD GraphQL API
│   │   │   ├── clinvar.py           Cliente ClinVar E-utilities (busca em lote)
│   │   │   ├── alphafold.py         Cliente AlphaFold REST API
│   │   │   └── uniprot.py           Cliente UniProt REST API
│   │   ├── models/
│   │   │   └── schemas.py           Modelos Pydantic v2 (GeneResponse, VariantResponse)
│   │   └── utils/
│   │       ├── cache.py             Helpers Redis (graceful fallback sem Redis)
│   │       └── validators.py        Validacao de entrada + classificacao clinica
│   └── tests/
│       ├── test_apis.py             9 testes de integracao contra APIs reais
│       └── test_services.py         6 testes unitarios com mocks
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js            Instancia Axios + interceptors de erro
│   │   ├── components/
│   │   │   ├── GeographicVariantMap.jsx
│   │   │   ├── FrequencyBarChart.jsx
│   │   │   ├── PredictionScoresRadar.jsx
│   │   │   ├── GeneLocusHeatmap.jsx
│   │   │   ├── ConstraintMetrics.jsx
│   │   │   ├── VariantTable.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── ErrorAlert.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx         Pagina inicial com busca por gene e variante
│   │   │   ├── GenePage.jsx         Dashboard completo de gene
│   │   │   └── VariantPage.jsx      Dashboard completo de variante
│   │   ├── App.jsx                  Roteamento e QueryClient provider
│   │   └── index.css                Tailwind base + componentes customizados
│   ├── package.json
│   ├── vite.config.js               Proxy /api -> backend:8000
│   └── tailwind.config.js           Paleta cinza + fonte JetBrains Mono
├── docker-compose.yml               Orquestracao: backend + frontend + redis
├── API_TESTING_REPORT.md            Relatorio de testes e discrepancias das APIs
└── README.md
```

---

## Endpoints da API Backend

### GET /api/gene/{gene_symbol}

Retorna informacoes consolidadas de um gene a partir do simbolo HGNC.

**Parametros:**
- `gene_symbol` (path): simbolo HGNC, ex: `BRCA1`, `TP53`, `APOE`

**Resposta (resumo):**
```json
{
  "gene_symbol": "BRCA1",
  "gene_id": "ENSG00000012048",
  "chromosome": "17",
  "start": 43044292,
  "end": 43170245,
  "strand": -1,
  "total_variants": 500,
  "pathogenic_count": 12,
  "vus_count": 48,
  "benign_count": 31,
  "pli_score": 1.54e-34,
  "lof_z_score": 2.617,
  "oe_lof": 0.766,
  "uniprot_id": "P38398",
  "alphafold_pdb_url": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.pdb",
  "pathogenic_variants": [...],
  "vus_variants": [...],
  "benign_variants": [...]
}
```

### GET /api/variant/{variant_id}

Retorna anotacao completa de uma variante a partir do rs ID do dbSNP.

**Parametros:**
- `variant_id` (path): rs ID, ex: `rs429358`, `rs7412`

**Resposta (resumo):**
```json
{
  "variant_id": "rs429358",
  "gene_symbol": "APOE",
  "chromosome": "19",
  "position": 44908684,
  "ref_allele": "T",
  "alt_allele": "C",
  "consequence": "missense_variant",
  "gnomad_global_af": 0.1574,
  "gnomad_frequencies": [
    {"population": "AFR", "allele_frequency": 0.2157, "allele_count": 8954, "allele_number": 41512},
    ...
  ],
  "clinvar_significance": "Conflicting classifications of pathogenicity; other; risk factor",
  "clinvar_review_status": "criteria provided, conflicting classifications",
  "clinvar_conditions": ["Alzheimer disease", "Familial hypercholesterolemia", ...],
  "sift_score": 1.0,
  "sift_prediction": "tolerated",
  "polyphen_score": null,
  "polyphen_prediction": null
}
```

Documentacao interativa Swagger UI disponivel em `http://localhost:8000/docs`.

---

## Instalacao e Execucao

### Opcao 1 - Execucao Local (recomendada para desenvolvimento)

Esta e a forma mais rapida de rodar a aplicacao no seu computador sem precisar de Docker.

#### Passo 1 - Clonar o repositorio

```bash
git clone https://github.com/madsondeluna/genvar.git
cd genvar
```

#### Passo 2 - Verificar pre-requisitos

Confirme que voce tem Python e Node.js instalados:

```bash
python3 --version    # deve ser 3.12 ou superior
node --version       # deve ser 20 ou superior
npm --version        # deve ser 9 ou superior
```

Caso nao tenha Python 3.12+:
- macOS: `brew install python@3.12`
- Ubuntu/Debian: `sudo apt install python3.12 python3.12-venv`
- Windows: baixar em https://www.python.org/downloads/

Caso nao tenha Node.js 20+:
- macOS: `brew install node`
- Ubuntu/Debian: `sudo apt install nodejs npm`
- Windows: baixar em https://nodejs.org/

#### Passo 3 - Subir o backend (FastAPI)

Abra um terminal e execute:

```bash
# Entrar na pasta do backend
cd backend

# Criar ambiente virtual Python isolado
python3 -m venv .venv

# Ativar o ambiente virtual
source .venv/bin/activate          # Linux / macOS
# .venv\Scripts\activate           # Windows (PowerShell ou CMD)

# Instalar dependencias Python
pip install -r requirements.txt

# Iniciar o servidor de desenvolvimento
uvicorn app.main:app --reload --port 8000
```

Se tudo correu bem, voce vera:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Acesse http://localhost:8000/docs para ver a documentacao interativa da API (Swagger UI).

**Deixe este terminal aberto.**

#### Passo 4 - Subir o frontend (React)

Abra **outro terminal** (mantenha o backend rodando no primeiro) e execute:

```bash
# A partir da raiz do repositorio clonado
cd frontend

# Instalar dependencias Node.js
npm install

# Iniciar o servidor de desenvolvimento
npm run dev
```

Se tudo correu bem, voce vera:

```
  VITE v5.x.x  ready in XXX ms

  Local:   http://localhost:3000/
```

Acesse http://localhost:3000 no navegador para usar a aplicacao.

#### Passo 5 - Usar a aplicacao

Na pagina inicial, voce pode buscar por:

- **Gene** (simbolo HGNC): `BRCA1`, `TP53`, `APOE`, `CFTR`, `KRAS`
- **Variante** (rs ID do dbSNP): `rs429358`, `rs7412`, `rs28897672`

A primeira busca pode demorar alguns segundos pois as APIs externas sao consultadas em tempo real. Buscas subsequentes do mesmo gene/variante sao instantaneas (cache).

---

### Opcao 2 - Execucao com Docker Compose

Necessario ter Docker Desktop instalado (https://www.docker.com/products/docker-desktop).

```bash
git clone https://github.com/madsondeluna/genvar.git
cd genvar

# Construir e subir todos os servicos (backend + frontend + redis)
docker-compose up --build
```

Aguarde o build completar (pode levar alguns minutos na primeira vez). Depois:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

Para parar: `Ctrl+C` e depois `docker-compose down`.

---

### Variaveis de Ambiente (opcionais)

Crie um arquivo `backend/.env` para personalizar o comportamento:

```env
# URL do Redis para cache (opcional - sem Redis o sistema funciona normalmente)
REDIS_URL=redis://localhost:6379

# Tempo de cache em segundos (padrao: 1 hora)
CACHE_TTL_SECONDS=3600

# Limite de variantes retornadas pelo Ensembl por gene
ENSEMBL_MAX_VARIANTS=500

# Nivel de log
LOG_LEVEL=INFO
```

Se o arquivo `.env` nao existir, os valores padrao acima sao usados automaticamente.

**Nota sobre Redis:** O Redis e opcional. Se nao estiver disponivel, o sistema funciona normalmente sem cache - apenas cada requisicao vai consultar as APIs externas novamente. Para instalar o Redis localmente:
- macOS: `brew install redis && brew services start redis`
- Ubuntu: `sudo apt install redis-server && sudo systemctl start redis`

---

## Testes

**Testes unitarios (sem acesso a internet, com mocks):**
```bash
cd backend
pytest tests/test_services.py -v
```

**Testes de integracao (chamam as APIs reais):**
```bash
pytest tests/test_apis.py -v
```

**Resultado atual:** 15/15 testes passando (6 unitarios + 9 integracao).

---

## Notas Tecnicas sobre as APIs

Discrepancias identificadas durante os testes e documentadas em `API_TESTING_REPORT.md`:

1. **gnomAD:** O campo `af` nao existe no tipo `VariantPopulation` - frequencia calculada como `ac / an` no backend
2. **gnomAD:** Campo de restricao e `oe_lof_upper` (LOEUF), nao `loeuf` como aparece em alguns exemplos de documentacao
3. **gnomAD:** IDs de populacao sao minusculos (`afr`, `amr`) e incluem subconjuntos com separador `:` (ex: `hgdp:japanese`) que sao filtrados pelo sistema
4. **ClinVar:** Campo `clinical_significance` foi substituido por `germline_classification` na API atual
5. **ClinVar:** A busca retorna multiplos UIDs (VCV e RCV); o sistema faz batch fetch e seleciona o registro com maior numero de condicoes associadas (registro VCV agregado)
6. **AlphaFold:** Endpoint retorna array de objetos; `[0]` corresponde ao modelo canonico

---

## Licenca

MIT License. Dados cientificos provenientes de bases publicas com uso livre para fins de pesquisa e educacao.
