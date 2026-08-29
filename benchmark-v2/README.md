# Benchmark da plataforma GenVar

Metrificação de ponta a ponta do GenVar: cada função do pipeline de VCF, sobre
um corpus de doze arquivos sintéticos controlados e quatro arquivos reais de
fontes públicas, mais as consultas da API com e sem cache.

Substitui e amplia o benchmark da versão anterior, que media apenas a API. O
anterior continua em `benchmark/` e cobre latência, exaustão, erros, completude
e enriquecimento de payload dos endpoints; este cobre o que roda no navegador,
que é onde está o trabalho pesado desta versão.

## Como reproduzir

```bash
# 1. corpus sintético (determinístico, mesma semente sempre)
python3 benchmark-v2/corpus/gerar.py

# 2. arquivos reais, de fontes públicas (não versionados)
mkdir -p benchmark-v2/corpus/reais && cd benchmark-v2/corpus/reais
curl -LO https://raw.githubusercontent.com/samtools/htslib/develop/test/tabix/vcf_file.vcf
curl -L -o 1000g-chrY.vcf.gz https://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chrY.phase3_integrated_v2b.20130502.genotypes.vcf.gz
curl -L -o giab-hg002-grch38.vcf.gz https://ftp-trace.ncbi.nlm.nih.gov/ReferenceSamples/giab/release/AshkenazimTrio/HG002_NA24385_son/NISTv4.2.1/GRCh38/HG002_GRCh38_1_22_v4.2.1_benchmark.vcf.gz

# 3. as suítes locais, a partir de frontend/ (o vite-node resolve os imports sem extensão)
cd frontend
export NODE_OPTIONS="--expose-gc --max-old-space-size=12288"
npx vite-node ../benchmark-v2/executar.mjs -- --repeticoes 3
npx vite-node ../benchmark-v2/reprodutibilidade.mjs
npx vite-node ../benchmark-v2/lote.mjs -- --coortes 1,5,10,25,50,100

# 4. as suítes de rede (backend e Redis no ar)
python3 benchmark-v2/cache.py
python3 benchmark-v2/ganho.py --amostra 15

# 5. figuras
python3 benchmark-v2/figuras.py
```

`--expose-gc` não é opcional nas suítes que reportam memória: sem ele a medida
de memória retida não força coleta antes de ler, e o número passa a descrever o
atraso do coletor em vez do que o programa segurou.

**`--max-old-space-size=12288` também não é decoração, e o que ele muda está
declarado em toda linha do CSV, na coluna `teto_heap_mb`.** Com o teto padrão do
Node, perto de 2 GB, o caminho individual morre por falta de memória antes de
terminar a coorte de 50, e a rodada não chega aos 100. Com 12 GB ela chega, e é
dessa condição que vêm as linhas de 50 e 100 arquivos.

Os dois números respondem perguntas diferentes e não devem ser lidos juntos. Com
teto alto, o que se mede é o **algoritmo**: quanto cada caminho gasta quando a
memória não é a restrição. Com o teto padrão, o que se mede é o **limite
prático**, e um navegador está mais perto dele do que dos 12 GB: a aba morre, e
onde ela morre é o resultado. As duas condições estão registradas, e é por isso
que o teto viaja com o dado em vez de ficar no comando.

## O corpus

Doze arquivos sintéticos, cada um existente para exercitar um caminho que os
outros não alcançam. Semente fixa: rodar duas vezes dá byte por byte o mesmo
conteúdo, que é o que permite a suíte de reprodutibilidade afirmar alguma coisa.

| Arquivo | Variantes | Papel |
|---|---|---|
| `01-pequeno.vcf` | 1.000 | Piso de tempo de toda função |
| `02-medio.vcf` | 25.000 | Escala de painel de genes |
| `03-exoma.vcf` | 100.000 | Escala de exoma clínico |
| `04-grande.vcf` | 400.000 | Teto declarado de leitura |
| `05-acima-do-teto.vcf` | 600.000 | O que acontece passando do teto |
| `06-medio.vcf.gz` | 25.000 | Caminho do `DecompressionStream` |
| `07-medio.zip` | 25.000 | Caminho do JSZip |
| `08-grch37.vcf` | 25.000 | GRCh37: cruzamento por coordenada desligado |
| `09-sem-build.vcf` | 25.000 | Build não declarado, presumido GRCh38 |
| `10-trio.vcf` | 4.045 | Herança, com os números plantados no cabeçalho |
| `11-ruim.vcf` | 25.000 | Balanço alélico torto, Ti/Tv baixo, metade reprovada |
| `12-multiamostra.vcf` | 25.000 | Cinco amostras num arquivo |

**8% de cada arquivo vem do próprio ClinVar embarcado.** Sem isso o corpus mede
o caminho do erro e nada mais: posição sorteada nunca cai num registro real, e
uma primeira versão deste corpus casou 16 variantes em 400.000 e divergiu em 58,
ou seja, exercitava o ramo "rsID conhecido, alelo não confere" e deixava resumo
clínico, ACMG, filtro por painel e a largura das linhas exportadas medindo o
caso vazio. A fração efetiva vai para o manifesto, porque prometer 8% e entregar
1% em silêncio é o mesmo erro de medição com outra roupa.

Quatro arquivos reais, baixados de fontes públicas e nunca versionados:

| Arquivo | Origem | Build | Amostras |
|---|---|---|---|
| `nist-usuario.vcf.gz` | GIAB/NIST HG001 (NA12878), recorte de exoma | GRCh37 | 1 |
| `giab-hg002-grch38.vcf.gz` | GIAB HG002 v4.2.1, referência de ouro | GRCh38 | 1 |
| `1000g-chrY.vcf.gz` | 1000 Genomes, cromossomo Y | GRCh37 | 1.233 |
| `htslib-teste.vcf` | htslib, casos de borda de sintaxe | GRCh37 | 2 |

O corpus sintético controla a variável; os reais provam que o controle não
inventou um mundo mais fácil que o real.

## Figuras

No guia de figuras da Nature Portfolio: coluna simples 89 mm, coluna dupla
183 mm, altura máxima 247 mm, sans-serif de 5 a 7 pt no tamanho final, traço de
0,25 a 1 pt, paleta NPG atribuída em sequência.

A figura é desenhada **no tamanho final**, em milímetros, e não desenhada grande
e encolhida depois: encolher reduz o corpo do texto junto e derruba o rótulo
abaixo do mínimo legível. Não há título dentro da figura, porque a legenda do
artigo faz esse papel.

Decisões tomadas contra sobreposição, que é o defeito que mais estraga figura de
artigo:

- `layout='constrained'` e não `tight_layout`. O tight mede uma vez e desiste; o
  constrained resolve o espaço como restrição e acomoda legenda fora do eixo sem
  cortar, que é exatamente onde o tight falha.
- Categoria de nome longo entra em barra horizontal. Rótulo girado a 45 graus é a
  fonte mais comum de texto encavalado, e girar não resolve, só espalha.
- Legenda fora do eixo, em `loc='outside lower center'`, que entrega o
  posicionamento ao layout. `bbox_to_anchor` com um `y` chutado é a origem mais
  comum de legenda colada no rótulo do eixo: o valor certo depende do número de
  linhas da legenda, que só se sabe depois de desenhar.
- A letra do painel é posicionada em pontos a partir do canto do eixo, e não em
  fração dele: a mesma fração vale larguras diferentes em 89 e em 183 mm, e um
  deslocamento fixo cai sobre o rótulo do eixo y numa e sai da tela na outra.
- Escala logarítmica quando a faixa passa de duas décadas.

**Barra empilhada em eixo logarítmico está errada, e por isso não existe aqui.**
`barh(left=x, width=w)` desenha de `x` a `x+w`; no log o comprimento aparente
vira `log(x+w) − log(x)`, que depende de onde o segmento começa. Duas etapas de
50 ms saem com tamanhos diferentes conforme a ordem da pilha, e a primeira começa
em `log(0)`. Como os totais aqui cobrem quatro ordens de grandeza, tirar o log
também não serve: os arquivos pequenos somem. A figura 2 separa as duas
perguntas, uma por painel: quanto custa, em barra simples e log; e onde o tempo é
gasto, em composição percentual e escala linear, onde empilhar é correto por
construção porque toda barra soma 100.

`figuras.py` grava cada figura duas vezes, uma no tamanho declarado e outra em
`bbox_inches='tight'`, e compara os retângulos. Se o tight for maior, algum
elemento ficou fora da caixa e seria cortado na publicação; o script falha o
build em vez de gravar a figura cortada em silêncio.

## Limites encontrados

Medir até quebrar é parte do método: um limite que ninguém procurou é um limite
que o usuário encontra sozinho, em produção.

**Teto de leitura conta variantes, não genótipos.** A aplicação corta em 400.000
variantes, e o corte ignora o número de amostras. O 1000 Genomes chrY tem 1.233
amostras: 400.000 variantes dele seriam 493 milhões de genótipos, e o processo
morre por falta de memória antes de terminar de ler. Com uma amostra, as mesmas
400.000 variantes cabem em cerca de 500 MB. O teto correto seria em genótipos,
ou seja, variantes vezes amostras, e não em linhas.

**`Math.max(...vetor)` estoura a pilha a 400 mil elementos.** Encontrado pelo
próprio benchmark, em `histograma` de `metricas.js`: espalhar um vetor num
argumento gasta uma posição de pilha por item, e um exoma de 400 mil variantes
derrubava o cálculo de uma métrica com `Maximum call stack size exceeded`.
Corrigido por laço, e o mesmo padrão foi corrigido no Manhattan plot da página
de associação, onde o conjunto de pontos também é do tamanho do dado.

**Cinquenta exomas não cabem no caminho individual.** Com o limite de memória
padrão do Node, cerca de 2 GB, o caminho que guarda as variantes de cada arquivo
morre entre 25 e 50 arquivos de 25.000 variantes. O caminho em lote atravessa os
mesmos 50 com memória retida na casa de dezenas de megabytes.

**XLSX é a saída mais cara por uma ordem de grandeza.** Acima de 100.000 linhas
a geração passa de dois minutos e a aba fica sem pintar, porque a construção do
SpreadsheetML roda na thread principal. As saídas de texto (TSV, CSV, VCF)
ficam abaixo de um segundo na mesma escala.
