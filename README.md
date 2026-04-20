# GenVar Dashboard

| Campo | Informação |
|---|---|
| **Instituição** | Escola Superior de Agricultura Luiz de Queiroz (ESALQ), Universidade de São Paulo (USP) |
| **Curso** | MBA em Engenharia de Software |
| **Modalidade** | Trabalho de Conclusão de Curso (TCC) |
| **Autor** | Madson A. de Luna Aragão |
| **Repositório** | https://github.com/madsondeluna/genvar |
| **Versão** | 2.0.0 |
| **Idioma da interface** | Português do Brasil (PT-BR) |


## Descrição do projeto

GenVar Dashboard é uma aplicação web full-stack para exploração interativa de genes e variantes genéticas humanas. A plataforma integra dados de seis bancos públicos internacionais (Ensembl, gnomAD, ClinVar, AlphaFold, UniProt e MyVariant.info/dbNSFP) em uma interface unificada em português do Brasil, eliminando a necessidade de consultar múltiplos portais separados para obter uma visão consolidada de uma variante ou gene de interesse.

O sistema é voltado para pesquisadores, clínicos e estudantes das áreas de bioinformática, genética médica e medicina de precisão, permitindo a exploração de anotações funcionais, frequências populacionais, significado clínico, escores de patogenicidade, conservação evolutiva, predição de splicing e estrutura proteica de forma integrada e visualmente acessível.


## Motivação e justificativa

A interpretação de variantes genéticas é um dos desafios centrais da genômica moderna. Ferramentas como gnomAD, ClinVar, Ensembl e dbNSFP são amplamente utilizadas na comunidade científica, mas cada uma oferece apenas uma perspectiva parcial. A ausência de uma interface que consolide essas fontes em um fluxo de consulta único representa um gargalo operacional em pesquisa e em contextos de diagnóstico genômico.

Este projeto aplica práticas de engenharia de software (arquitetura em camadas, APIs REST e GraphQL, testes automatizados, containerização e design de interfaces) ao domínio da bioinformática, demonstrando como técnicas de desenvolvimento moderno podem acelerar fluxos de trabalho científicos.


## Funcionalidades

### Busca por gene (símbolo HGNC)

- Informações básicas: ID Ensembl, cromossomo, locus genômico, fita, biotipo, montagem.
- Métricas de restrição evolutiva: pLI, LOEUF (`oe_lof_upper`), o/e LoF, o/e Missense, Z-score de LoF.
- Resumo de variantes em cinco categorias: total, patogênicas, VUS, benignas e sem classificação.
- Ideograma cromossômico interativo (ideogram.js) com bandeamento G. O locus do gene aparece destacado por halo amarelo e um triângulo marcador, com as variantes classificadas coloridas por significado clínico.
- Distribuição de variantes ao longo do gene em barras empilhadas com bins de 1 kb, incluindo variantes sem curadoria no ClinVar em cinza.
- Estrutura proteica predita pelo AlphaFold: imagem PAE, visualizador 3D interativo (NGL) colorido por confiança pLDDT, opção de download do PDB.
- Tabelas de variantes com ordenação, paginação, filtro por rs ID ou consequência e exportação em CSV.
- Links externos: NCBI Gene, gnomAD, UniProt, AlphaFold.
- Compartilhamento de URL com botão de copiar link.

### Busca por variante (rs ID do dbSNP)

- Anotação funcional completa via Variant Effect Predictor (VEP) do Ensembl, com SIFT e PolyPhen-2.
- Agregado de predições via MyVariant.info / dbNSFP, organizado em quatro grupos:
  - **Patogenicidade**: CADD Phred e rankscore, REVEL, AlphaMissense, MetaLR, MetaSVM, PrimateAI, FATHMM, MutPred, DANN.
  - **Conservação evolutiva**: PhyloP (100 vertebrados), PhastCons (100 vertebrados), GERP++ RS.
  - **Splicing**: SpliceAI (delta score máximo), dbscSNV ADA, dbscSNV RF.
  - **Domínios proteicos InterPro** e referências cruzadas: ID ClinVar, IDs COSMIC, AF no 1000 Genomes, AF no ExAC.
- Frequências alélicas populacionais do gnomAD (genoma, 9 populações principais).
- Mapa geográfico interativo com distribuição global das frequências.
- Gráfico de barras de frequências por população em escala logarítmica.
- Classificação clínica do ClinVar: significado, status de revisão, data, condições associadas.
- Gráfico radar com veredito agregado (SIFT, PolyPhen-2, CADD, REVEL normalizados de 0 a 1).
- Ideograma cromossômico com a posição da variante destacada.
- Histórico de buscas recentes armazenado em `localStorage`, com prefetch ao passar o mouse sobre exemplos da página inicial.


## Bancos de dados e APIs integrados

### 1. Ensembl REST API

- **Instituição**: European Bioinformatics Institute (EMBL-EBI) e Wellcome Sanger Institute.
- **URL**: https://rest.ensembl.org
- **Tipo**: REST (JSON).
- **Autenticação**: pública, sem chave.
- **Rate limit**: 15 requisições por segundo.

Endpoints utilizados:

| Endpoint | Descrição |
|----------|-----------|
| `GET /lookup/symbol/homo_sapiens/{symbol}` | Metadados do gene: ID Ensembl, cromossomo, locus, fita, biotipo, assembly. |
| `GET /overlap/id/{gene_id}?feature=variation` | Lista de variantes sobrepostas ao gene, com consequência e significado clínico bruto. |
| `GET /vep/human/id/{rsid}` | Variant Effect Predictor: anotação funcional completa, SIFT, PolyPhen, consequência molecular, troca de aminoácido. |

### 2. gnomAD GraphQL API

- **Instituição**: Broad Institute of MIT and Harvard.
- **URL**: https://gnomad.broadinstitute.org/api
- **Tipo**: GraphQL.
- **Autenticação**: pública.
- **Dataset**: gnomAD r4 (genoma).

Queries utilizadas:

| Query | Descrição |
|-------|-----------|
| `variant(variantId, dataset)` | Frequências alélicas por população (AC, AN, AF calculado como AC/AN). |
| `gene(gene_symbol, reference_genome)` | Métricas de restrição evolutiva do gene. |

Populações retornadas e exibidas:

| ID (API) | População |
|----------|-----------|
| `afr` | Africana / Afro-americana |
| `amr` | Latina / Americana mista |
| `asj` | Judaica asquenaze |
| `eas` | Asiática oriental |
| `fin` | Finlandesa |
| `nfe` | Europeia não finlandesa |
| `sas` | Sul asiática |
| `mid` | Oriente Médio |
| `ami` | Amish |

**Nota técnica**: o campo `af` não existe no tipo `VariantPopulation` da API atual. A frequência é calculada no backend como `ac / an`. Os IDs de população são minúsculos (`afr`, `amr`), divergindo de alguns exemplos antigos de documentação.

### 3. ClinVar via NCBI E-utilities

- **Instituição**: National Center for Biotechnology Information (NCBI), National Library of Medicine (NLM).
- **URL**: https://eutils.ncbi.nlm.nih.gov/entrez/eutils
- **Tipo**: REST (JSON/XML).
- **Autenticação**: pública.
- **Rate limit**: 3 requisições por segundo sem chave de API.

Fluxo de consulta em dois passos:

| Passo | Endpoint | Descrição |
|-------|----------|-----------|
| 1 | `GET /esearch.fcgi?db=clinvar&term={rsid}&retmode=json` | Recupera lista de UIDs ClinVar associados ao rs ID. |
| 2 | `GET /esummary.fcgi?db=clinvar&id={uids}&retmode=json` | Recupera sumário de múltiplos registros em lote. |

Campos utilizados do objeto retornado:

| Campo | Descrição |
|-------|-----------|
| `germline_classification.description` | Classificação clínica textual: Pathogenic, Benign, VUS, Conflicting, entre outras. |
| `germline_classification.review_status` | Nível de evidência da classificação. |
| `germline_classification.last_evaluated` | Data da última avaliação. |
| `germline_classification.trait_set[].trait_name` | Condições clínicas associadas. |
| `accession` | Identificador VCV (agregado) ou RCV (submissão individual). |

**Nota técnica**: o campo histórico `clinical_significance` foi substituído por `germline_classification` na versão atual da API. O sistema busca todos os UIDs em lote e seleciona o registro VCV mais abrangente, priorizando o de maior número de condições associadas (agregado).

### 4. AlphaFold Protein Structure Database API

- **Instituição**: DeepMind e European Bioinformatics Institute (EMBL-EBI).
- **URL**: https://alphafold.ebi.ac.uk/api
- **Tipo**: REST (JSON).
- **Autenticação**: pública.

Endpoint utilizado:

| Endpoint | Descrição |
|----------|-----------|
| `GET /prediction/{uniprot_id}` | Metadados e URLs da estrutura proteica predita. |

Campos utilizados:

| Campo | Descrição |
|-------|-----------|
| `pdbUrl` | URL para download da estrutura em formato PDB. |
| `cifUrl` | URL para download em formato mmCIF. |
| `paeImageUrl` | URL da imagem do Predicted Aligned Error (PAE). |
| `globalMetricValue` | Score global de confiança pLDDT médio. |
| `latestVersion` | Versão mais recente do modelo. |
| `entryId` | Identificador do modelo, por exemplo `AF-P38398-F1`. |

**Nota técnica**: a API retorna um array (múltiplos fragmentos para proteínas longas). O sistema utiliza sempre o primeiro elemento, que corresponde ao modelo canônico.

### 5. UniProt REST API

- **Instituição**: Universal Protein Resource Consortium (UniProt), formado por EMBL-EBI, SIB e PIR.
- **URL**: https://rest.uniprot.org
- **Tipo**: REST (JSON).
- **Autenticação**: pública.

Endpoint utilizado:

| Endpoint | Descrição |
|----------|-----------|
| `GET /uniprotkb/search?query=gene:{symbol}+AND+organism_id:9606+AND+reviewed:true` | Mapeia símbolo HGNC para accession UniProtKB Swiss-Prot. |

Campos utilizados:

| Campo | Descrição |
|-------|-----------|
| `results[0].primaryAccession` | Accession UniProt canônica, por exemplo P38398 para BRCA1. |

**Nota técnica**: o filtro `reviewed:true` garante que apenas entradas Swiss-Prot (curadas manualmente) sejam retornadas, excluindo entradas TrEMBL (preditas automaticamente). O UniProt ID obtido é utilizado para consultar o AlphaFold.

### 6. MyVariant.info (dbNSFP e múltiplas fontes)

- **Instituição**: BioThings, The Scripps Research Institute.
- **URL**: https://myvariant.info/v1
- **Tipo**: REST (JSON).
- **Autenticação**: pública.
- **Cobertura**: dbNSFP v4.x, CADD, dbscSNV, SpliceAI, ClinVar, COSMIC, dbSNP, ExAC, 1000 Genomes, gnomAD.

Endpoints utilizados:

| Endpoint | Descrição |
|----------|-----------|
| `GET /variant/chr{chr}:g.{pos}{ref}>{alt}?assembly=hg38&fields=...` | Consulta por HGVS genômico (preferencial quando há coordenadas). |
| `GET /query?q=dbsnp.rsid:{rsid}&fields=...&assembly=hg38` | Consulta por rs ID (fallback). |

Campos extraídos e mapeados para o `VariantResponse`:

| Grupo | Campos |
|-------|--------|
| Patogenicidade | `cadd.phred`, `dbnsfp.cadd.raw_rankscore`, `dbnsfp.revel.score`, `dbnsfp.alphamissense.score/pred`, `dbnsfp.metalr.score/pred`, `dbnsfp.metasvm.score/pred`, `dbnsfp.primateai.score/pred`, `dbnsfp.mutpred.score`, `dbnsfp.fathmm.score/pred`, `dbnsfp.dann.score` |
| Conservação | `dbnsfp.phylop100way_vertebrate.score`, `dbnsfp.phastcons100way_vertebrate.score`, `dbnsfp.gerp++.rs` |
| Splicing | `cadd.spliceai.ds_ag/al/dg/dl` (máximo), `dbscsnv.ada_score`, `dbscsnv.rf_score` |
| Proteína | `dbnsfp.interpro_domain` |
| Frequências | `1000g.af`, `exac.af` |
| Cross-refs | `clinvar.variant_id`, `cosmic.cosmic_id` |

**Nota técnica**: a chamada é feita em paralelo com gnomAD e ClinVar via `asyncio.gather()`. Erros ou respostas 404 caem em `{}` graciosamente, sem bloquear a resposta. A API aceita tanto HGVS genômico quanto rs ID. O sistema tenta HGVS primeiro (mais preciso quando há coordenadas do VEP) e utiliza rs ID como fallback.


## Arquitetura do sistema

![Diagrama de Arquitetura GenVar](docs/arquitetura-genvar.svg)

**Fluxo de uma requisição de gene:**

1. Frontend envia `GET /api/gene/MLH1`.
2. Backend valida o símbolo via `validate_gene_symbol()` (regex HGNC).
3. Verifica cache Redis com chave versionada `gene:v2:MLH1`. Retorna imediatamente em caso de cache hit.
4. Se cache miss: `ensembl.get_gene_info()`, sequencial (necessário para obter o `gene_id`).
5. Com o `gene_id`, executa em paralelo via `asyncio.gather()`:
   - `ensembl.get_gene_variants(gene_id)`: lista de variantes com `clinical_significance`.
   - `gnomad.get_gene_constraint(symbol)`: pLI, LOEUF, oe_lof, oe_mis, lof_z.
   - `uniprot.get_uniprot_id(symbol)`: accession Swiss-Prot.
6. Com o UniProt ID: `alphafold.get_prediction(uniprot_id)` retorna `pdbUrl` e `paeImageUrl`.
7. `classify_clinical_significance()` classifica variantes em pathogenic, VUS, benign e other. Todas as quatro listas são devolvidas (truncadas em 500 por categoria).
8. `GeneResponse` (Pydantic v2) valida e serializa o resultado.
9. `cache_set(TTL 3600s)` armazena no Redis.
10. Frontend renderiza via TanStack Query, com cache client-side adicional e `staleTime` de 10 minutos.

**Fluxo de uma requisição de variante:**

1. Frontend envia `GET /api/variant/rs429358`.
2. Backend valida o rs ID via `validate_rsid()` (regex `^rs\d+$`).
3. Verifica cache Redis com chave versionada `variant:v2:rs429358`.
4. Se cache miss: `ensembl.get_vep_annotation()`, sequencial (necessário para obter chrom/pos/ref/alt).
5. Em paralelo via `asyncio.gather()`:
   - `gnomad.get_variant_frequencies(chrom, pos, ref, alt)`: frequências por população.
   - `clinvar.get_variant_clinvar(rsid)`: busca em lote e seleção do VCV mais abrangente.
   - `myvariant.get_variant_annotations(rsid, chrom, pos, ref, alt)`: dbNSFP completo.
6. `VariantResponse` com mais de 40 campos serializados.
7. `cache_set(TTL 3600s)` armazena no Redis.


## Tecnologias utilizadas

### Backend

| Tecnologia | Versão | Função |
|------------|--------|--------|
| Python | 3.12+ | Linguagem principal do backend. |
| FastAPI | 0.115 | Framework web assíncrono com OpenAPI automático. |
| Uvicorn | 0.32 | Servidor ASGI de alta performance. |
| httpx | 0.27 | Cliente HTTP assíncrono para consultas às APIs externas. |
| Pydantic v2 | 2.9 | Validação e serialização de dados (schemas de resposta). |
| pydantic-settings | 2.5 | Configurações via variáveis de ambiente. |
| Redis | 7 | Cache de respostas das APIs, com TTL configurável. |
| pytest | 8.3 | Framework de testes unitários e de integração. |
| pytest-asyncio | 0.24 | Suporte a testes de funções assíncronas. |

### Frontend

| Tecnologia | Versão | Função |
|------------|--------|--------|
| React | 18.2 | Biblioteca de interface declarativa baseada em componentes. |
| Vite | 5.0 | Build tool e dev server com HMR. |
| Tailwind CSS | 3.3 | Framework CSS utility-first, paleta cinza e cores semânticas. |
| TanStack Query | 5.17 | Estado assíncrono e cache client-side. |
| Axios | 1.6 | Cliente HTTP com interceptors de erro. |
| Plotly.js | 2.27 | Visualização interativa. |
| react-plotly.js | 2.6 | Wrapper React para Plotly.js. |
| ideogram | 1.53 | Ideograma cromossômico humano com bandeamento G (GRCh38). |
| NGL | 2.3 | Visualizador 3D de estruturas moleculares (PDB) no browser. |
| Lucide React | 0.294 | Ícones SVG. |
| react-router-dom | 6.20 | Roteamento client-side (SPA). |
| Google Fonts | Ubuntu e Ubuntu Mono | Tipografia sans-serif para prosa, mono para identificadores. |

### Infraestrutura

| Tecnologia | Versão | Função |
|------------|--------|--------|
| Docker | 24+ | Containerização de backend e frontend. |
| Docker Compose | 2.x | Orquestração local dos serviços. |
| Nginx | Alpine | Servidor de arquivos estáticos e proxy reverso (produção). |


## Visualizações implementadas

| Componente | Tipo | Dados | Biblioteca |
|------------|------|-------|------------|
| `ChromosomeIdeogram` | Ideograma horizontal GRCh38 com bandeamento G | Locus do gene, variantes classificadas ou posição da variante única | ideogram.js |
| `GeographicVariantMap` | Mapa mundial (scattergeo) | Frequências alélicas por população (gnomAD) | Plotly.js |
| `FrequencyBarChart` | Barras em escala log | AC, AN e AF por população (gnomAD) | Plotly.js |
| `PredictionScoresRadar` | Radar polar | SIFT, PolyPhen-2, CADD, REVEL normalizados de 0 a 1 | Plotly.js |
| `PredictionDetails` | Grupos de cartões coloridos | CADD, REVEL, AlphaMissense, MetaLR, MetaSVM, PrimateAI, FATHMM, MutPred, DANN, PhyloP, PhastCons, GERP++, SpliceAI, dbscSNV, InterPro, COSMIC | React, sem dependência de chart |
| `GeneLocusHeatmap` | Barras empilhadas | Distribuição de variantes em bins de 1 kb (4 categorias) | Plotly.js |
| `ConstraintMetrics` | Gauges e barras de progresso | pLI, LOEUF, o/e LoF, o/e Missense (gnomAD) | CSS nativo |
| `ProteinViewer` | Visualizador 3D interativo | Estrutura AlphaFold (PDB) colorida por pLDDT, representações Cartoon, Superfície, Bola e Bastão, Fita | NGL |
| `VariantTable` | Tabela com ordenação, filtro, paginação e exportação CSV | Lista de variantes classificadas por categoria clínica | React |
| `SignificanceTag` | Badge colorido | Classificação ClinVar unificada | React |

**Normalização dos escores de patogenicidade no gráfico radar:**

| Escore | Direção original | Normalização para 0 a 1 (0 = benigno, 1 = patogênico) |
|--------|-----------------|-------------------------------------------------------|
| SIFT | Menor = mais deletério | `1 - score` |
| PolyPhen-2 | Maior = mais deletério | Sem alteração |
| CADD Phred | Maior = mais deletério | `min(1, score / 40)` |
| REVEL | Maior = mais deletério | Sem alteração |


## Estrutura do projeto

```
genvar-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py                  FastAPI app, CORS, registro de routers.
│   │   ├── config.py                Configurações via variáveis de ambiente.
│   │   ├── routers/
│   │   │   ├── gene.py              GET /api/gene/{symbol}, agregação paralela.
│   │   │   └── variant.py           GET /api/variant/{rsid}, agregação paralela.
│   │   ├── services/
│   │   │   ├── ensembl.py           Cliente Ensembl REST API.
│   │   │   ├── gnomad.py            Cliente gnomAD GraphQL API.
│   │   │   ├── clinvar.py           Cliente ClinVar E-utilities (busca em lote).
│   │   │   ├── alphafold.py         Cliente AlphaFold REST API.
│   │   │   ├── uniprot.py           Cliente UniProt REST API.
│   │   │   └── myvariant.py         Cliente MyVariant.info (dbNSFP agregado).
│   │   ├── models/
│   │   │   └── schemas.py           Modelos Pydantic v2 (GeneResponse, VariantResponse).
│   │   └── utils/
│   │       ├── cache.py             Helpers Redis, fallback gracioso.
│   │       └── validators.py        Validação de entrada e classificação clínica.
│   └── tests/
│       ├── test_apis.py             Testes de integração com APIs reais.
│       └── test_services.py         Testes unitários com mocks.
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js            Instância Axios e interceptors de erro.
│   │   ├── components/
│   │   │   ├── ChromosomeIdeogram.jsx
│   │   │   ├── GeographicVariantMap.jsx
│   │   │   ├── FrequencyBarChart.jsx
│   │   │   ├── PredictionScoresRadar.jsx
│   │   │   ├── PredictionDetails.jsx
│   │   │   ├── GeneLocusHeatmap.jsx
│   │   │   ├── ConstraintMetrics.jsx
│   │   │   ├── ProteinViewer.jsx
│   │   │   ├── VariantTable.jsx
│   │   │   ├── SignificanceTag.jsx
│   │   │   ├── ExternalLinkButton.jsx
│   │   │   ├── CopyLinkButton.jsx
│   │   │   ├── Skeleton.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   └── ErrorAlert.jsx
│   │   ├── hooks/
│   │   │   └── useSearchHistory.js  Histórico de buscas em localStorage.
│   │   ├── pages/
│   │   │   ├── HomePage.jsx         Página inicial com busca por gene e variante.
│   │   │   ├── GenePage.jsx         Dashboard completo de gene.
│   │   │   └── VariantPage.jsx      Dashboard completo de variante.
│   │   ├── utils/
│   │   │   ├── format.js            Formatadores e classificação de significância.
│   │   │   ├── csv.js               Exportação de tabelas para CSV.
│   │   │   └── ideogramAnnotations.js   Montagem de anotações para o ideograma.
│   │   ├── App.jsx                  Roteamento, QueryClient, ErrorBoundary global.
│   │   └── index.css                Tailwind base e componentes customizados.
│   ├── package.json
│   ├── vite.config.js               Proxy /api para backend:8000.
│   └── tailwind.config.js           Paleta cinza e fonte Ubuntu.
├── docker-compose.yml               Orquestração: backend, frontend e Redis.
├── API_TESTING_REPORT.md            Relatório de testes e discrepâncias das APIs.
└── README.md
```


## Endpoints da API backend

### GET /api/gene/{gene_symbol}

Retorna informações consolidadas de um gene a partir do símbolo HGNC.

**Parâmetros:**

- `gene_symbol` (path): símbolo HGNC, por exemplo `BRCA1`, `TP53`, `APOE`.

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
  "pathogenic_count": 0,
  "vus_count": 27,
  "benign_count": 9,
  "other_count": 464,
  "pli_score": 1.54e-34,
  "lof_z_score": 2.617,
  "oe_lof": 0.766,
  "uniprot_id": "P38398",
  "alphafold_pdb_url": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.pdb",
  "pathogenic_variants": [],
  "vus_variants": [],
  "benign_variants": [],
  "other_variants": []
}
```

### GET /api/variant/{variant_id}

Retorna anotação completa de uma variante a partir do rs ID do dbSNP.

**Parâmetros:**

- `variant_id` (path): rs ID, por exemplo `rs429358`, `rs7412`.

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
    {"population": "AFR", "allele_frequency": 0.2157, "allele_count": 8954, "allele_number": 41512}
  ],
  "clinvar_significance": "Conflicting classifications of pathogenicity; other; risk factor",
  "clinvar_review_status": "criteria provided, conflicting classifications",
  "clinvar_conditions": ["Alzheimer disease", "Familial hypercholesterolemia"],
  "sift_score": 1.0,
  "sift_prediction": "tolerated",
  "polyphen_score": null,
  "cadd_phred": 16.6,
  "cadd_rankscore": 0.39,
  "revel_score": 0.229,
  "alphamissense_score": 0.0365,
  "alphamissense_pred": "B",
  "metalr_score": 0.0,
  "metasvm_score": -1.0126,
  "primateai_score": 0.549,
  "fathmm_score": -0.24,
  "dann_score": 0.217,
  "phylop_score": null,
  "phastcons_score": null,
  "gerp_rs": null,
  "spliceai_max": null,
  "interpro_domains": [],
  "clinvar_variation_id": "441269",
  "cosmic_ids": []
}
```

Documentação interativa Swagger UI disponível em `http://localhost:8000/docs`.


## Instalação e execução

### Opção 1. Execução local (recomendada para desenvolvimento)

Forma mais rápida de rodar a aplicação localmente sem Docker.

#### Passo 1. Clonar o repositório

```bash
git clone https://github.com/madsondeluna/genvar.git
cd genvar
```

#### Passo 2. Verificar pré-requisitos

```bash
python3 --version    # 3.12 ou superior
node --version       # 20 ou superior
npm --version        # 9 ou superior
```

Se não tiver Python 3.12:

- macOS: `brew install python@3.12`.
- Ubuntu ou Debian: `sudo apt install python3.12 python3.12-venv`.
- Windows: baixar em https://www.python.org/downloads/.

Se não tiver Node.js 20:

- macOS: `brew install node`.
- Ubuntu ou Debian: `sudo apt install nodejs npm`.
- Windows: baixar em https://nodejs.org/.

#### Passo 3. Subir o backend (FastAPI)

Em um terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Linux ou macOS
# .venv\Scripts\activate           # Windows (PowerShell ou CMD)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Saída esperada:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Swagger UI: http://localhost:8000/docs. Mantenha esse terminal aberto.

#### Passo 4. Subir o frontend (React)

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Saída esperada:

```
  VITE v5.x.x  ready in XXX ms
  Local:   http://localhost:3000/
```

Acesse http://localhost:3000.

#### Passo 5. Usar a aplicação

Na página inicial, você pode buscar por:

- Gene (símbolo HGNC): `MLH1`, `HBB`, `MSH2`, `VHL`, `LDLR`, `RB1`.
- Variante (rs ID do dbSNP): `rs334`, `rs1800562`, `rs6025`, `rs1799853`.

A primeira busca pode levar alguns segundos enquanto as APIs externas são consultadas em tempo real. Buscas subsequentes do mesmo gene ou variante são instantâneas (cache).

### Opção 2. Execução com Docker Compose

É necessário ter Docker Desktop instalado (https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/madsondeluna/genvar.git
cd genvar
docker compose up --build
```

Aguarde o build (pode levar alguns minutos na primeira execução). Depois:

- Frontend: http://localhost:3000.
- Backend API: http://localhost:8000.
- Swagger UI: http://localhost:8000/docs.

Para parar: `Ctrl+C` e depois `docker compose down`.

### Opção 3. Deploy no Render (produção)

O repositório contém um Blueprint (`render.yaml`) que provisiona três serviços no Render:

- `genvar-cache` (Key Value/Redis free, cache de respostas das APIs externas).
- `genvar-backend` (Web Service, Docker, Python 3.12 + FastAPI + uvicorn).
- `genvar-frontend` (Static Site, build Vite, CDN global).

Passos:

1. Faça push do repositório para o GitHub.
2. Em https://dashboard.render.com, clique em **New**, depois **Blueprint**, e conecte o repositório.
3. Render detecta o `render.yaml` e propõe os três serviços; confirme a criação.
4. Aguarde o build (cerca de 5 a 8 minutos na primeira vez).
5. Após o deploy, acesse o frontend em `https://genvar-frontend.onrender.com`.

Notas importantes:

- Os nomes de serviço no `render.yaml` (`genvar-backend`, `genvar-frontend`) precisam ser únicos dentro da sua conta Render. Caso já existam, ajuste os nomes e as URLs em `ALLOWED_ORIGINS` e `VITE_API_URL` antes do deploy.
- O plano free do Render põe o backend em modo dormente após 15 minutos sem requisições. A primeira chamada depois desse intervalo leva 30 a 60 segundos para acordar; chamadas subsequentes são instantâneas.
- O Redis free tem 25 MB de memória com política `allkeys-lru`; é suficiente para o cache, dado que as respostas são pequenas e expiram em 1 hora.
- A variável `VITE_API_URL` é injetada em tempo de build; qualquer mudança no URL do backend exige redeploy do frontend.
- O backend valida a origem via `ALLOWED_ORIGINS` (lista separada por vírgulas). Aceite múltiplas URLs se usar domínio custom: `https://app.seudominio.com,https://genvar-frontend.onrender.com`.

Para fazer deploy em outra plataforma (Railway, Fly.io, AWS), use o mesmo Dockerfile do backend (respeita `$PORT`) e sirva o `frontend/dist` em qualquer CDN estático, passando `VITE_API_URL` no build.

### Variáveis de ambiente (opcionais)

Crie `backend/.env` para personalizar o comportamento:

```env
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=3600
ENSEMBL_MAX_VARIANTS=500
LOG_LEVEL=INFO
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

Se o arquivo `.env` não existir, os valores padrão acima são usados.

No frontend, o `VITE_API_URL` pode ser definido em `frontend/.env` para apontar para um backend remoto durante o desenvolvimento local:

```env
VITE_API_URL=https://genvar-backend.onrender.com/api
```

Sem essa variável, o frontend usa o caminho `/api` relativo, que é redirecionado pelo proxy configurado em `vite.config.js`.

**Nota sobre Redis**: o Redis é opcional. Sem ele, o sistema funciona normalmente, apenas sem cache server-side. Instalação local:

- macOS: `brew install redis && brew services start redis`.
- Ubuntu: `sudo apt install redis-server && sudo systemctl start redis`.


## Testes

Testes unitários (com mocks, sem rede):

```bash
cd backend
pytest tests/test_services.py -v
```

Testes de integração (chamam APIs reais):

```bash
pytest tests/test_apis.py -v
```


## Notas técnicas sobre as APIs

Discrepâncias identificadas durante os testes e documentadas em `API_TESTING_REPORT.md`:

1. **gnomAD**: o campo `af` não existe no tipo `VariantPopulation`. A frequência é calculada no backend como `ac / an`.
2. **gnomAD**: o campo de restrição é `oe_lof_upper` (LOEUF), não `loeuf` como aparece em alguns exemplos antigos.
3. **gnomAD**: IDs de população são minúsculos (`afr`, `amr`) e incluem subconjuntos com separador `:` (por exemplo `hgdp:japanese`) que são filtrados pelo sistema.
4. **ClinVar**: o campo `clinical_significance` foi substituído por `germline_classification` na API atual.
5. **ClinVar**: a busca retorna múltiplos UIDs (VCV e RCV). O sistema faz batch fetch e seleciona o registro com maior número de condições associadas (VCV agregado).
6. **AlphaFold**: o endpoint retorna array. `[0]` corresponde ao modelo canônico.
7. **MyVariant.info**: preferir HGVS genômico (`chr{chr}:g.{pos}{ref}>{alt}`) quando há coordenadas do VEP. Em caso de falha, o sistema recorre à busca por `dbsnp.rsid`.

As chaves de cache são versionadas (`gene:v2:`, `variant:v2:`) para invalidar respostas antigas após mudanças no schema.


## Licença

MIT License. Os dados científicos provêm de bases públicas com uso livre para fins de pesquisa e educação.
