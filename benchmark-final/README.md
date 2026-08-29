# Benchmark do GenVar 3.0

Medição quantitativa de tudo que a aplicação faz, em duas frentes que ela mantém
separadas por desenho: a API, que agrega fontes públicas no servidor, e o módulo
de VCF, que roda inteiramente no navegador e não fala com o servidor.

O resultado está em [`RESULTADOS.md`](RESULTADOS.md): 24 figuras, cada uma com
legenda e citada no texto. Nenhum número do documento é escrito à mão; todos
saem de uma leitura dos CSV no momento em que ele é gerado, de modo que remedir
e regerar mantém texto e dados consistentes.

## Onde mora o quê

| Pasta | Papel |
|---|---|
| `servidor/` | Sete suítes contra a API |
| `navegador/` | Três suítes contra o pipeline de VCF |
| `infra/` | Build, tetos de memória e ganho sobre o fluxo manual |
| `corpus/` | Doze VCF sintéticos, gerados com semente fixa, mais quatro reais não versionados |
| `resultados/local/` e `resultados/docker/` | CSV das duas execuções |
| `figuras/` | As 24 figuras |
| `../benchmark-legacy/` | As medições anteriores, congeladas. `2.0/` é a linha de base de junho de 2026 |

## Como reproduzir

Precisa do backend em `localhost:8000`, do Redis em `localhost:6379` e, para o
eixo conteinerizado, do Docker.

```bash
# 1. corpus sintético, determinístico
python3 benchmark-final/corpus/gerar.py

# 2. arquivos reais, de fontes públicas, não versionados
mkdir -p benchmark-final/corpus/reais && cd benchmark-final/corpus/reais
curl -LO https://raw.githubusercontent.com/samtools/htslib/develop/test/tabix/vcf_file.vcf
curl -L -o 1000g-chrY.vcf.gz https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chrY.phase3_integrated_v2b.20130502.genotypes.vcf.gz
curl -L -o giab-hg002-grch38.vcf.gz https://ftp-trace.ncbi.nlm.nih.gov/ReferenceSamples/giab/release/AshkenazimTrio/HG002_NA24385_son/NISTv4.2.1/GRCh38/HG002_GRCh38_1_22_v4.2.1_benchmark.vcf.gz
cd -

# 3. servidor, ambiente direto
D=benchmark-final/resultados/local
python3 benchmark-final/servidor/requisicoes.py --saida $D --rotulo local
python3 benchmark-final/servidor/latencia.py    --saida $D --rotulo local
python3 benchmark-final/servidor/recomputar.py  --saida $D
python3 benchmark-final/servidor/erros.py       --saida $D --rotulo local
python3 benchmark-final/servidor/completude.py  --saida $D --rotulo local
python3 benchmark-final/servidor/cache.py       --saida $D --rotulo local
python3 benchmark-final/servidor/exaustao.py    --saida $D --rotulo local
python3 benchmark-final/servidor/comparacao.py  --saida $D --rotulo local --n 10

# 4. navegador, a partir de frontend/
cd frontend
export NODE_OPTIONS="--expose-gc --max-old-space-size=12288"
npx vite-node ../benchmark-final/navegador/executar.mjs -- --repeticoes 3 --saida ../benchmark-final/resultados/local
npx vite-node ../benchmark-final/navegador/reprodutibilidade.mjs -- --saida ../benchmark-final/resultados/local
npx vite-node ../benchmark-final/navegador/lote.mjs -- --coortes 1,5,10,25,50,100 --saida ../benchmark-final/resultados/local
cd -

# 5. servidor, ambiente conteinerizado
docker compose -f docker-compose.yml -f docker-compose.benchmark.yml up -d
DD=benchmark-final/resultados/docker
U=http://localhost:8001; R=redis://localhost:6380
REDIS_URL=$R python3 benchmark-final/servidor/requisicoes.py --saida $DD --rotulo docker
python3 benchmark-final/servidor/latencia.py --url $U --redis $R --saida $DD --rotulo docker --alvos-rede 2
python3 benchmark-final/servidor/recomputar.py --saida $DD
python3 benchmark-final/servidor/erros.py      --url $U --saida $DD --rotulo docker
python3 benchmark-final/servidor/completude.py --url $U --saida $DD --rotulo docker
python3 benchmark-final/servidor/exaustao.py   --url $U --redis $R --saida $DD --rotulo docker

# 6. figuras e documento
python3 benchmark-final/figuras.py
python3 benchmark-final/gerar_resultados.py
```

`--expose-gc` não é opcional nas suítes que reportam memória: sem ele a medida de
memória retida não força coleta antes de ler, e o número passa a descrever o
momento da última coleta em vez do consumo.

## Decisões de protocolo que mudam a leitura dos números

**A mediana, não a média.** Latência de rede tem cauda longa e assimétrica.

**O p95 só existe com N maior ou igual a 20.** Com três repetições, o percentil
95 interpolado é o máximo com outro nome. Abaixo do piso, a cauda é o máximo
observado, e a coluna `cauda` de cada CSV diz qual dos dois foi usado.

**O N das suítes que tocam a rede é menor de propósito.** Uma repetição fria
custa entre 2 e 18 requisições a bases públicas, e o uso justo delas é por IP:
uma varredura larga derruba o acesso do projeto e o benchmark deixa de ser
reproduzível na revisão do trabalho.

**Motor e produto são medidas diferentes e não se somam.** O limitador de taxa
dispensa quem chega pelo loopback. Medir sem ele responde quanto o servidor
aguenta; medir com ele responde o que o usuário encontra. A suíte de exaustão
mede as duas separadamente e cada nível espera a janela do minuto esvaziar,
porque o limitador tem dois tetos e a rajada de um nível gastava o orçamento do
seguinte.

**A ordem da comparação é contrabalanceada.** Medindo sempre o fluxo manual
primeiro, a consulta integrada encontrava as fontes recém-acionadas e a família
gene saía com ganho 0,92, isto é, a ferramenta aparecendo mais lenta que o
caminho que ela substitui.

**O limitador fica com o mesmo ajuste nos dois ambientes.** Dentro do contêiner
ninguém chega pelo loopback, então sem igualar o ajuste a comparação entre
ambientes viraria uma comparação entre duas políticas de vazão.

**A fria da versão 2.0 foi reconstruída.** A suíte de junho limpava o cache uma
vez antes das doze repetições frias, não a cada uma: da segunda em diante ela
media cache quente. A comparação entre versões usa a primeira repetição de cada
alvo, a única que encontrou o cache vazio.
