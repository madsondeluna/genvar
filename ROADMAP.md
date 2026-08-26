# Roadmap do GenVar

Do explorador de genes e variantes (MVP acadêmico) a uma plataforma SaaS de
genética que une o monogênico, o multigênico e o poligênico.

O plano é incremental: cada fase entrega algo público e utilizável antes da
seguinte. O foco inicial é doenças e mutações raras (monogênico).

## Contexto

Concorrentes recentes (por exemplo, o BRaVa browser) mostram resultados de
*burden* de variantes raras por gene, com *forest plots* e *Manhattan plots*,
sobre um back-end estático e um conjunto pequeno de fenótipos. O GenVar já vai
além em pontos-chave: backend real (FastAPI + Redis), agregação de múltiplas
fontes (Ensembl, gnomAD, ClinVar, AlphaFold, UniProt, dbNSFP, GWAS Catalog) e
resolução de variante única, que o concorrente não tem.

O diferencial estratégico é a lacuna que ninguém cobre bem: unir o raro
(monogênico) com o poligênico (PGS) na mesma experiência, com uma camada de
doença curada por cima e, no futuro, dados próprios do cliente (BYOD).

## Princípios

- Reuso primeiro: aproveitar a agregação, o cache e os componentes já
  existentes antes de criar algo novo.
- PT-BR e Pure Design: toda a UI em português e baseada em tokens
  (`frontend/src/pure/*`), sem literais de cor ou tamanho.
- Degradação graciosa: fontes externas podem falhar; nunca fixar no cache um
  resultado degradado.
- Beta público agora, monetização depois.

## Fase 0: Módulo de Doenças Raras (beta), entregue

Esqueleto navegável do produto de doenças raras, com dado real reusando a
infraestrutura atual.

- Navegação compartilhada: Início, Doenças Raras, Produtos
  (`frontend/src/components/AppMenu.jsx`).
- Catálogo curado de cerca de 26 doenças monogênicas em PT-BR
  (`backend/app/data/rare_diseases.py`): nome, herança, genes causais,
  referências (Orphanet, OMIM, MONDO), sinais e prevalência.
- Backend `GET /api/disease` e `GET /api/disease/{id}`
  (`backend/app/routers/disease.py`), com enriquecimento ao vivo da restrição
  gênica (LOEUF, pLI) da gnomAD e cache Redis.
- Páginas: hub `/doencas` (busca e facetas de herança), detalhe `/doenca/{id}`
  (genes causais vivos com link para a página de gene), aba `/produtos`.

## Fase 1: Monogênico completo

Transformar o catálogo semente em um produto de referência para doença rara.

- Ampliar o catálogo (centenas de doenças) e mapear ontologias (MONDO, HPO,
  Orphanet) via EBI OLS4, sem chave de API.
- Busca unificada entre doença, gene e variante (autocomplete único).
- Variantes patogênicas por doença direto do ClinVar (reuso do serviço
  `clinvar.py`), agrupadas por gene.
- Endpoint leve `GET /api/gene/{símbolo}/summary` (só constraint e contagens),
  para acelerar o detalhe da doença sem puxar todas as variantes.
- Exportação CSV/JSON por doença e URLs de consulta reproduzíveis.

## Fase 2: Doenças multigênicas

- Painéis de genes por condição e visão digênica ou oligogênica.
- Evidência gene-doença agregada (por exemplo, ClinGen) e priorização por
  força de evidência.
- Modificadores e herança complexa.

## Fase 3: Fatores poligênicos (PGS)

O grande diferencial: trazer o comum e poligênico para o lado do raro.

- Integração com o PGS Catalog (escores, metadados, arquivos de score).
- Distribuições de PRS por ancestria e percentis calibrados.
- Relação entre o raro e o poligênico: mostrar como o fundo poligênico modula a
  penetrância de variantes raras na mesma tela de doença.
- PheWAS por escore poligênico.

## Fase 4: Camada de burden (estilo BRaVa, e além)

- Ingestão de sumários de associação por *burden* (SAIGE-GENE, Meta-SAIGE),
  com ETL em Python/Polars para JSON colunar.
- *Forest plots* cross-ancestry (PheWAS por gene) e *Manhattan plot* por
  fenótipo, para igualar o concorrente.
- Diferencial: manter a variante única e a camada de doença e poligênico que o
  concorrente não oferece.

## Fase 5: SaaS

- Autenticação e planos (free/pro).
- API pública documentada e limites por plano.
- Traga seus próprios dados (BYOD): upload seguro de resultados (burden, GWAS,
  PGS) para o mesmo ambiente, comparados com dados públicos de consórcios, em
  multi-tenant isolado.
- Proveniência, versionamento e exportação FAIR; SSO para clientes
  corporativos.

## Estado atual

| Área | Situação |
|------|----------|
| Explorador de gene / variante | Produção |
| Módulo de Doenças Raras (beta) | Fase 0, entregue |
| Multigênico | Planejado (Fase 2) |
| Poligênico / PGS | Planejado (Fase 3) |
| Burden / PheWAS | Planejado (Fase 4) |
| Contas / API / BYOD | Planejado (Fase 5) |

> Este roadmap é um guia vivo e será refinado a cada fase entregue.
