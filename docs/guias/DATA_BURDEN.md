# Camada de burden: dados publicos e ETL

O modulo de associacao (`/associacao`) usa resultados de burden de variantes
raras por gene, meta-analisados por ancestria. Este documento explica de onde
vem o dado publico, como gerar os JSON que o frontend consome e como manter tudo
atualizado.

## O que ja e ao vivo (APIs publicas)

As paginas de gene, variante e doenca ja consultam APIs publicas em tempo real,
entao se atualizam sozinhas em producao (no sandbox de desenvolvimento o egress
e bloqueado e essas chamadas degradam):

- gnomAD: constraint (LOEUF/pLI) e frequencia alelica por populacao.
- ClinVar / MyVariant: significancia clinica das variantes.
- Ensembl: overlap de variantes e coordenadas de gene.
- GWAS Catalog: associacoes comuns por gene.

Nao ha o que rodar para essas camadas: elas puxam da fonte a cada requisicao.

## Burden: um release estatico, nao uma API

Os sumarios de burden (SAIGE-GENE / Meta-SAIGE) sao publicados como um release
estatico de estatisticas-resumo, nao como uma API ao vivo. "Manter atualizado"
aqui significa rerodar o ETL quando sai uma versao nova do release.

### Formato de entrada esperado

Um diretorio com um arquivo por fenotipo x ancestria, no formato gene-based
(uma linha por gene x grupo funcional x MAF), com as colunas:

- `Region` (gene, ENSG ou simbolo), `Group` (mascara), `max_MAF`
- `Pvalue` (SKAT-O), `Pvalue_Burden`, `Pvalue_SKAT`
- `BETA_Burden`, `SE_Burden` (efeito e erro-padrao do teste Burden)

Nomeie cada arquivo `<PHENO>.<ANC>.txt` (ou `.tsv`, `.gz`), por exemplo
`LDL.EUR.txt.gz`, ou forneca um `manifest.json` mapeando arquivos para
`(pheno, anc)`. Se o release usar outros nomes de coluna, ajuste o dicionario
`COLS` no topo de `backend/scripts/build_burden.py`.

A referencia de genes (ordem do eixo do Manhattan e coordenadas) vem de
`genes.json` ja presente na saida; a lista de fenotipos, de `phenotypes.json`.

### Rodar o ETL

Fora do sandbox (a rede precisa estar aberta), a partir de `backend/`:

    # amostra enxuta (so p <= 1e-4), boa para embarcar no proprio site
    python -m scripts.build_burden --input ./sumarios \
        --source "Meta-analise multi-biobanco de variantes raras" \
        --version v1 --date 2026-01-15

    # dataset completo (todos os genes), para hospedar a parte
    python -m scripts.build_burden --input ./sumarios --full \
        --out ./dist-burden --source "..." --version v1 --date 2026-01-15

Saida padrao: `frontend/public/data/burden/`. Gera
`all_results.<ANC>.json` (agora com a coluna `se` real, entao o IC do forest
deixa de ser reconstruido de beta+p), alem de `provenance.json` com fonte,
versao e data, que a pagina mostra como "Fonte: ... atualizado em ...".

### Servir o dataset completo (opcional)

O dataset completo e grande demais para o bundle. Gere com `--full` para um
diretorio e hospede como estatico (qualquer CDN/bucket). Depois aponte o
frontend para ele sem rebuildar o resto:

    VITE_BURDEN_DATA_URL=https://<seu-host>/burden npm run build

Sem essa variavel, o frontend usa a amostra em `public/data/burden/`.

## Procedencia

Cite a fonte publica do release (nome do consorcio e DOI/URL do dado) nos
campos `--source`/`--version`/`--date`; eles aparecem na UI. gnomAD, ClinVar,
Ensembl e GWAS Catalog sao citados nas paginas correspondentes.
