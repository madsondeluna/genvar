# Exemplo de análise completa

Saída de uma execução do pipeline de VCF sobre um arquivo real, gerada por
`scripts/gera_saidas_exemplo.mjs`, que importa os mesmos módulos que a página
`/vcf` carrega no navegador e os chama na mesma ordem. O que muda é só o
ambiente: Node em vez de aba.

## A entrada

**GIAB/NIST HG001**, a linhagem NA12878 do Genome in a Bottle Consortium,
distribuída publicamente pelo NIST e pelo Coriell com consentimento para uso
aberto. Não é dado de paciente. É sequenciamento humano real, não sintético.

| Item | Valor |
|---|---|
| Arquivo | `NIST-HG001.vcf.gz`, 1,39 MB comprimido, 7,30 MB expandido |
| sha256 | `8926b10552e1229e1c295cbe396eb60e83fa8c21ee3df971c8641fc69b71a0a8` |
| Amostra | `NIST-hg001-7001` |
| Referência | GRCh37, declarada no cabeçalho |
| Chamador | GATK SelectVariants 2.8, chamada de 2014 |

O arquivo de entrada não é versionado: mora em
`benchmark-v2/corpus/reais/nist-usuario.vcf.gz`, que o `benchmark-v2/README.md`
explica como obter.

## As saídas

Os seis formatos que a página produz, todos a partir da mesma tabela.

| Arquivo | O que traz |
|---|---|
| `NIST-HG001-genvar.tsv` | Uma linha por variante, 28 colunas, sete delas de ACMG |
| `NIST-HG001-genvar.csv` | O mesmo conteúdo em vírgula, para planilha |
| `NIST-HG001-genvar.xlsx` | Quatro abas: Variantes, Achados, Qualidade e Metodologia |
| `NIST-HG001-genvar.json.gz` | Cabeçalho, métricas, achados, farmacogenômica e cobertura |
| `NIST-HG001-genvar.vcf` | O VCF de entrada com as anotações em campos `GENVAR_*` |
| `NIST-HG001-genvar.pdf` | Laudo, o mesmo que o botão "Laudo em PDF" produz |
| `resumo.json` | Os números abaixo, legíveis por máquina |
| `tela-laudo.png` | A tela do relatório em página inteira, 8.324 px de altura |

## O que a análise encontrou

| Métrica | Valor |
|---|---|
| Variantes | 30.009, das quais 26.218 (87,4%) passaram no filtro |
| Razão Ti/Tv | 2,73 |
| Já no dbSNP | 96,0%, 28.819 com rsID |
| Casadas no ClinVar | 131, com 86 de alelo divergente |
| Patogênicas | 7 |
| Com diretriz farmacogenética | 18 |
| Com critério ACMG | 97 |
| Maior evidência | TPP1 · rs56144125, escore +9 (PVS1 +8, PP5 +1) |

## Como refazer

```bash
cd frontend
NODE_OPTIONS="--max-old-space-size=8192" npx vite-node ../scripts/gera_saidas_exemplo.mjs
```

A captura da tela sai de:

```bash
python3 scripts/captura_telas.py --so laudo --vcf benchmark-v2/corpus/reais/nist-usuario.vcf.gz
```
