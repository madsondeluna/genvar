# Como rodar o GenVar Dashboard

Guia prático para subir a aplicação localmente, executar os testes e rodar a suite completa de benchmarks do TCC.

## Pré-requisitos

| Ferramenta | Versão mínima | Verificação |
|---|---|---|
| Python | 3.12 | `python3 --version` |
| Node.js | 20 | `node --version` |
| npm | 9 | `npm --version` |
| Redis | 7 | `redis-cli ping` (deve retornar `PONG`) |
| Git | qualquer | `git --version` |

Instalação rápida (macOS):

```bash
brew install python@3.12 node redis
brew services start redis
```

Instalação rápida (Ubuntu/Debian):

```bash
sudo apt install python3.12 python3.12-venv nodejs npm redis-server
sudo systemctl start redis
```


## 1. Clonar o repositório

```bash
git clone https://github.com/madsondeluna/genvar.git
cd genvar
```


## 2. Subir o backend (FastAPI)

Abra um terminal e execute:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Linux / macOS
# .venv\Scripts\activate           # Windows

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Saída esperada:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Mantenha esse terminal aberto. A documentação interativa fica em http://localhost:8000/docs.


## 3. Subir o frontend (React + Vite)

Abra outro terminal e execute:

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


## 4. Variáveis de ambiente (opcional)

Crie `backend/.env` para alterar comportamento padrão:

```env
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=3600
ENSEMBL_MAX_VARIANTS=500
LOG_LEVEL=INFO
GNOMAD_DATASET=gnomad_r4
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

Sem o arquivo, os valores acima são usados automaticamente.


## 5. Alternativa: Docker Compose

Sobe backend, frontend e Redis em um único comando, sem configurar venv ou npm:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

Para parar: `Ctrl+C` e depois `docker compose down`.


## 6. Testes

### Testes unitários (sem rede, usa mocks)

```bash
cd backend
source .venv/bin/activate
pytest tests/test_services.py -v
```

Resultado esperado: 14 testes passando.

### Testes de integração (chamam APIs reais, exige internet)

```bash
pytest tests/test_apis.py -v
```

Para pular em ambientes sem rede:

```bash
pytest --ignore=tests/test_apis.py
```


## 7. Benchmarks (suite de metrificação do TCC)

Os benchmarks exigem o backend rodando (passo 2). Redis é opcional — sem ele as métricas de speedup de cache não são coletadas, mas as demais funcionam normalmente.

### Instalar dependências do benchmark

```bash
cd benchmark
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Executar todas as suítes

```bash
python run_benchmarks.py
```

Tempo estimado: 10 a 20 minutos (as suítes de latência e exaustão fazem pausas entre chamadas para respeitar rate limits das APIs externas).

### Executar uma suíte individual

```bash
python run_benchmarks.py --suite latency
python run_benchmarks.py --suite exhaustion
python run_benchmarks.py --suite errors
python run_benchmarks.py --suite comparison
python run_benchmarks.py --suite completeness
python run_benchmarks.py --suite payload
```

### Gerar as figuras PNG

Após rodar os benchmarks (CSVs em `results/`):

```bash
python plot_results.py
```

As figuras são salvas em `results/figures/`.

### Suítes disponíveis

| Suíte | Arquivo | O que mede |
|---|---|---|
| `latency` | `latency_raw.csv`, `latency_stats.csv` | Tempo de resposta cold/warm, speedup de cache |
| `exhaustion` | `exhaustion.csv` | Comportamento sob carga sequencial e concorrente |
| `errors` | `errors.csv` | Robustez a entradas inválidas (404 e 422) |
| `comparison` | `comparison.csv` | GenVar vs consulta manual API por API |
| `completeness` | `completeness.csv` | Cobertura de campos por resposta |
| `payload` | `payload.csv` | Enriquecimento de dados vs APIs individuais |

### Figuras geradas

| Figura | Descrição |
|---|---|
| `fig_latency_gene.png` | Latência cold/warm por gene (barras + desvio padrão + p95) |
| `fig_latency_variant.png` | Latência cold/warm por variante |
| `fig_cache_speedup.png` | Fator de speedup por endpoint |
| `fig_exhaustion_concurrent.png` | Latência por nível de concorrência |
| `fig_exhaustion_sequential.png` | Latência por taxa de requisição |
| `fig_comparison_speedup.png` | Speedup GenVar vs fluxo manual |
| `fig_comparison_breakdown.png` | Tempo por API no fluxo manual |
| `fig_completeness.png` | Campos retornados por fonte de dados |
| `fig_enrichment_variant.png` | Campos de variante por API individual |
| `fig_enrichment_gene.png` | Campos de gene por API individual |
| `fig_enrichment_ratio.png` | Razão de enriquecimento GenVar vs melhor API |
| `fig_errors_matrix.png` | Matriz de resultados dos testes de erro |


## Estrutura de diretórios do benchmark

```
benchmark/
├── run_benchmarks.py       orquestrador principal
├── plot_results.py         gerador de figuras
├── requirements.txt        dependências (httpx, pandas, matplotlib, rich)
├── suites/
│   ├── latency.py
│   ├── exhaustion.py
│   ├── errors.py
│   ├── comparison.py
│   ├── completeness.py
│   └── payload.py
└── results/
    ├── *.csv               gerados automaticamente ao rodar os benchmarks
    └── figures/
        └── *.png           gerados automaticamente ao rodar plot_results.py
```
