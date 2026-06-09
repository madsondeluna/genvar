# Plano de resultados preliminares: GenVar Dashboard

Documento de trabalho. Organiza quais métricas mostrar na seção Resultados Preliminares e como elas se ligam aos objetivos específicos do TCC. Os números são preenchidos a partir dos arquivos em `dados/` depois que a bateria de benchmarks termina. Nada aqui deve ir para o TCC com valor inventado: campos marcados como `[A PREENCHER]` aguardam os CSVs.

## Quais resultados mostrar (resposta à pergunta "o que eu deveria mostrar")

Dois resultados isolam o valor de engenharia da plataforma e devem liderar a seção:

1. Comparação consulta única vs. consulta manual API por API (suite `comparison`): quantifica a premissa central do trabalho (fragmentação dos dados). É o resultado de maior impacto.
2. Aceleração por cache, frio vs. quente (suite `latency`): ganho de desempenho atribuível à plataforma, não às APIs externas.

A latência ponta a ponta isolada é dominada pelas APIs de terceiros (Ensembl, gnomAD, NCBI), que o projeto não controla. Deve ser reportada, mas com essa ressalva explícita.

## Mapa métrica -> objetivo específico

| Objetivo específico | Métrica/evidência | Fonte |
|---|---|---|
| (i) Orquestração de consultas paralelas e tratamento de exceções | Speedup paralelo vs. manual; matriz de robustez a entradas inválidas (404/422); demonstração de retorno parcial com uma API indisponível | `comparison.csv`, `errors.csv` |
| (ii) Visualizações interativas | Inventário de tipos de visualização; fontes integradas por tela; capturas de tela; campos por fonte e consolidação em vista única | `figuras/`, `completeness.csv`, `payload.csv` |
| (iii) Cache em memória com TTL | Aceleração frio/quente por endpoint | `latency_stats.csv`, `latency_raw.csv` |
| (iv) Testes automatizados | 26 testes (14 unitários + 12 de integração); cobertura por módulo de serviço | pytest + cobertura |
| (v) Containerização | 3 serviços (backend, frontend, Redis); frontend com build multi-estágio; healthcheck; volume persistente | `docker-compose.yml`, Dockerfiles |

## Metodologia de medição (bloco de reprodutibilidade)

- Data de execução: 8 de junho de 2026.
- Máquina: Apple M2, 8 núcleos, 8 GB RAM, macOS 26.5.
- Runtime: Python 3.12.11 (backend e benchmark), Node.js no frontend.
- Backend em `localhost:8000`, Redis 7 em `localhost:6379`.
- Latência: 12 execuções na fase fria e 20 na fase quente por alvo. A fase fria faz flush do Redis uma vez no início, então apenas a primeira execução de cada alvo é genuinamente sem cache; as demais já leem do cache. Por isso, o tempo frio real é lido da primeira execução no CSV bruto (`latency_raw.csv`), e a média da fase frio é interpretada como mista.
- Conjunto de teste padronizado (MVP), igual em todas as suites de comparação: 10 genes (MLH1, HBB, MSH2, VHL, LDLR, RB1, BRCA1, TP53, CFTR, PAH) e 10 variantes (rs334, rs1800562, rs6025, rs1799853, rs429358, rs1801133, rs1042522, rs5030858, rs28929474, rs121913529). Os alvos foram escolhidos por cobertura nas cinco fontes e por diversidade clínica (patogênica, benigna, conflitante e resposta a medicamento). As coordenadas usam GRCh38, consistentes com o conjunto gnomAD r4.
- Os tempos incluem as viagens de ida e volta às APIs externas e, portanto, carregam a variância de serviços de terceiros.

## Suites e o que cada uma produz

| Suite | Arquivo(s) | Mede |
|---|---|---|
| latency | `latency_raw.csv`, `latency_stats.csv` | Tempo frio/quente, aceleração por cache |
| exhaustion | `exhaustion.csv` | Comportamento sob carga sequencial e concorrente |
| errors | `errors.csv` | Resposta a entradas inválidas (404 e 422) |
| comparison | `comparison.csv` | GenVar (consulta única) vs. fluxo manual API por API |
| completeness | `completeness.csv` | Campos preenchidos por resposta |
| payload | `payload.csv` | Enriquecimento de dados vs. APIs individuais |

## Métricas de código (coletadas)

- Backend (Python, `app/`): 1.197 linhas.
- Frontend (`src/`, JSX/JS): 3.270 linhas.
- Componentes React: 17.
- Serviços de integração (um por fonte + agregação): 6 módulos.
- Endpoints de API: `/api/gene/{símbolo}`, `/api/variant/{rs id}`, mais `/` e `/health`.
- Fontes públicas integradas: 5 (Ensembl, gnomAD, ClinVar, AlphaFold, UniProt).

## Resultados quantitativos (preencher após benchmark)

### Aceleração por cache (frio real vs. quente)
[A PREENCHER a partir de latency_raw.csv: primeira execução fria por alvo vs. média quente]

### Comparação consulta única vs. manual
[A PREENCHER a partir de comparison.csv]

### Robustez a erros (matriz 404/422)
[A PREENCHER a partir de errors.csv]

### Enriquecimento e completude
[A PREENCHER a partir de payload.csv e completeness.csv]

### Comportamento sob carga
[A PREENCHER a partir de exhaustion.csv]

### Cobertura de testes
[A PREENCHER: rodar cobertura combinada após o benchmark]

## Pendências

- Gerar as figuras PNG (`plot_results.py`) para `figuras/`.
- Capturar telas (home, página de gene, página de variante) para `figuras/`.
- Rodar cobertura combinada (unitários + integração) sem concorrência com o benchmark.
- Redigir a prosa final da seção Resultados Preliminares em `RESULTADOS_PRELIMINARES.md` (entregue na pasta, sem editar o arquivo do TCC sem confirmação).
