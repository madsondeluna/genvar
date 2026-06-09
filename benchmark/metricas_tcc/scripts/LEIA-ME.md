# Scripts de apoio às métricas

Esta pasta reúne os scripts auxiliares escritos para gerar e conferir as métricas do TCC.
Todos têm comentários descritivos em português. A bateria de benchmarks em si fica no
repositório do projeto, em `genvar-dashboard/benchmark/`, e é a fonte dos dados em `../dados/`
e das figuras em `../figuras/`.

## Scripts desta pasta

- `01_validar_conjunto_teste.py`: confere se os 10 genes e as 10 variantes do conjunto
  retornam dados completos do backend antes de rodar os benchmarks.
- `02_extrair_coordenadas.py`: busca no backend as coordenadas GRCh38 das 10 variantes,
  no formato usado pela simulação de consulta manual ao gnomAD.
- `03_aceleracao_cache.py`: calcula a aceleração por cache a partir de `latency_stats.csv`,
  usando a chamada mais lenta da fase fria como linha de base sem cache.

## Bateria de benchmarks (no repositório do projeto)

Em `genvar-dashboard/benchmark/`:

- `run_benchmarks.py`: orquestra as seis suites e grava os CSV em `results/`.
- `plot_results.py`: gera as figuras PNG a partir dos CSV.
- `suites/_targets.py`: define o conjunto padronizado de 10 genes e 10 variantes, com as
  coordenadas GRCh38, importado por todas as suites.
- `suites/latency.py`, `comparison.py`, `errors.py`, `completeness.py`, `payload.py`,
  `exhaustion.py`: as seis suites de medição.

## Como reproduzir

Com o backend e o Redis em execução:

```
cd genvar-dashboard/benchmark
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run_benchmarks.py
python plot_results.py
```

Ambiente das medições reportadas: Apple M2, 8 núcleos, 8 GB de memória, macOS 26.5,
Python 3.12.11.
