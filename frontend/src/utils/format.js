// Sequence Ontology / Ensembl VEP consequence terms translated to PT-BR. The English term in
// parentheses is kept where it is the form used in the literature, so the table stays useful
// for both lay readers and people checking against the API.
const CONSEQUENCE_PT = {
  transcript_ablation: 'ablação do transcrito',
  splice_acceptor_variant: 'sítio aceptor de splicing',
  splice_donor_variant: 'sítio doador de splicing',
  stop_gained: 'ganho de códon de parada',
  frameshift_variant: 'mudança de matriz de leitura (frameshift)',
  stop_lost: 'perda de códon de parada',
  start_lost: 'perda de códon de início',
  transcript_amplification: 'amplificação do transcrito',
  feature_elongation: 'alongamento de elemento',
  feature_truncation: 'truncamento de elemento',
  inframe_insertion: 'inserção em matriz (inframe)',
  inframe_deletion: 'deleção em matriz (inframe)',
  missense_variant: 'troca de aminoácido (missense)',
  protein_altering_variant: 'altera a proteína',
  splice_donor_5th_base_variant: '5ª base do sítio doador de splicing',
  splice_region_variant: 'região de splicing',
  splice_donor_region_variant: 'região do sítio doador de splicing',
  splice_polypyrimidine_tract_variant: 'trato polipirimidínico de splicing',
  incomplete_terminal_codon_variant: 'códon terminal incompleto',
  start_retained_variant: 'códon de início mantido',
  stop_retained_variant: 'códon de parada mantido',
  synonymous_variant: 'sinônima (silenciosa)',
  coding_sequence_variant: 'sequência codificante',
  mature_mirna_variant: 'miRNA maduro',
  '5_prime_utr_variant': "região 5' não traduzida (5' UTR)",
  '3_prime_utr_variant': "região 3' não traduzida (3' UTR)",
  non_coding_transcript_exon_variant: 'éxon de transcrito não codificante',
  intron_variant: 'intrônica',
  nmd_transcript_variant: 'transcrito alvo de NMD',
  non_coding_transcript_variant: 'transcrito não codificante',
  coding_transcript_variant: 'transcrito codificante',
  upstream_gene_variant: 'a montante do gene',
  downstream_gene_variant: 'a jusante do gene',
  tfbs_ablation: 'ablação de sítio de ligação de fator de transcrição',
  tfbs_amplification: 'amplificação de sítio de ligação de fator de transcrição',
  tf_binding_site_variant: 'sítio de ligação de fator de transcrição',
  regulatory_region_ablation: 'ablação de região regulatória',
  regulatory_region_amplification: 'amplificação de região regulatória',
  regulatory_region_variant: 'região regulatória',
  intergenic_variant: 'intergênica',
  sequence_variant: 'variante de sequência',
}

export function formatConsequence(value) {
  if (!value) return 'desconhecida'
  const key = value.trim().toLowerCase().replace(/\s+/g, '_')
  return CONSEQUENCE_PT[key] || value.replace(/_/g, ' ')
}

export function formatAF(value) {
  if (value == null) return null
  if (value === 0) return '0'
  if (value < 0.0001) return value.toExponential(3)
  return value.toFixed(6)
}

export function formatInteger(value) {
  if (value == null) return null
  return value.toLocaleString()
}

export function formatPosition(value) {
  if (value == null) return null
  return value.toLocaleString()
}

export function stripEnsemblSource(description) {
  if (!description) return ''
  return description.replace(/\[Source:.*\]/, '').trim()
}

export function classifySignificance(sig) {
  if (!sig) return 'unknown'
  const s = sig.toLowerCase()
  if (s.includes('likely pathogenic')) return 'likely-pathogenic'
  if (s.includes('pathogenic') && !s.includes('conflicting')) return 'pathogenic'
  if (s.includes('likely benign')) return 'likely-benign'
  if (s.includes('benign') && !s.includes('conflicting')) return 'benign'
  if (s.includes('conflicting')) return 'conflicting'
  if (s.includes('uncertain') || s.includes('vus')) return 'vus'
  return 'other'
}
