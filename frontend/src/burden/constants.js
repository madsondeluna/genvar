// Constantes canonicas da camada de associacao por burden. A ORDEM e um
// contrato de fio: os dados usam indices inteiros nestes arrays. Nunca
// reordenar, so acrescentar.

export const ANCESTRIES = ['All', 'EUR', 'AFR', 'AMR', 'EAS', 'SAS', 'non_EUR']
export const ANCESTRY_INDEX = Object.fromEntries(ANCESTRIES.map((a, i) => [a, i]))

// Rotulo amigavel por ancestria (AMR = latino/miscigenado das Americas).
export const ANCESTRY_LABEL = {
  All: 'Meta (todas)',
  EUR: 'Europeia',
  AFR: 'Africana',
  AMR: 'Latina (Admixed American)',
  EAS: 'Leste Asiático',
  SAS: 'Sul da Ásia',
  MID: 'Oriente Médio',
  non_EUR: 'Não europeia',
}

// Rotulo curto por ancestria, para colunas estreitas (forest).
export const ANCESTRY_SHORT = {
  All: 'Meta (todas)',
  EUR: 'Europeia',
  AFR: 'Africana',
  AMR: 'Latina (AMR)',
  EAS: 'Leste Asiático',
  SAS: 'Sul da Ásia',
  MID: 'Oriente Médio',
  non_EUR: 'Não europeia',
}

// Cor por ancestria: slots categoricos do Pure, atribuidos em sequencia e
// nunca ciclados. Eram sete hex escolhidos a mao, presos ao modo claro. 'All'
// e agregado, nao serie, entao fica em tinta de grafico. Consumidores em SVG e
// DOM leem o var() direto; canvas passa por resolveColor().
export const ANCESTRY_COLOR = {
  All: 'var(--chart-ink)',
  EUR: 'var(--chart-1)',
  AFR: 'var(--chart-2)',
  AMR: 'var(--chart-3)',
  EAS: 'var(--chart-4)',
  SAS: 'var(--chart-5)',
  MID: 'var(--chart-6)',
  non_EUR: 'var(--chart-7)',
}

export const MASKS = [
  'pLoF',
  'damaging_missense_or_protein_altering',
  'other_missense_or_protein_altering',
  'synonymous',
  'pLoF;damaging_missense_or_protein_altering',
  'pLoF;damaging_missense_or_protein_altering;other_missense_or_protein_altering;synonymous',
]
export const MASK_LABEL = [
  'pLoF',
  'Missense danoso',
  'Outro missense',
  'Sinonimo',
  'pLoF ou missense danoso',
  'Todas as categorias',
]

export const MAFS = [0.001, 0.0001]
export const MAF_LABEL = ['< 0,1%', '< 0,01%']

export const TESTS = ['Burden', 'SKAT', 'SKAT-O']

// Limiares de significancia da literatura de burden gene-based, como -log10(p)
// para os plots (Cauchy por gene e Bonferroni por gene x mascara).
export const SIG_GENE_CAUCHY = 2.5e-6
export const SIG_GENE_MASK_BONFERRONI = 1.39e-7
export const SIG_SUGGEST = 1e-4
export const LP_CAUCHY = -Math.log10(SIG_GENE_CAUCHY) // ~5.60
export const LP_BONFERRONI = -Math.log10(SIG_GENE_MASK_BONFERRONI) // ~6.86
export const LP_SUGGEST = -Math.log10(SIG_SUGGEST) // 4

export const DEFAULTS = {
  ancestry: 'All',
  maskIndex: 4, // pLoF ou missense danoso
  mafIndex: 0, // < 0,1%
  test: 'SKAT-O',
}

// Ordem dos cromossomos no eixo do Manhattan (Y fica de fora).
export const CHR_ORDER = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','X']
