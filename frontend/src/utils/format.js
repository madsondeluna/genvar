// Sequence Ontology / Ensembl VEP consequence terms translated to PT-BR. The English term in
// parentheses is kept where it is the form used in the literature, so the table stays useful
// for both lay readers and people checking against the API.
const CONSEQUENCE_PT = {
  transcript_ablation: 'Ablação do transcrito',
  splice_acceptor_variant: 'Sítio aceptor de splicing',
  splice_donor_variant: 'Sítio doador de splicing',
  stop_gained: 'Ganho de códon de parada',
  frameshift_variant: 'Mudança de matriz de leitura (frameshift)',
  stop_lost: 'Perda de códon de parada',
  start_lost: 'Perda de códon de início',
  transcript_amplification: 'Amplificação do transcrito',
  feature_elongation: 'Alongamento de elemento',
  feature_truncation: 'Truncamento de elemento',
  inframe_insertion: 'Inserção em matriz (inframe)',
  inframe_deletion: 'Deleção em matriz (inframe)',
  missense_variant: 'Troca de aminoácido (missense)',
  protein_altering_variant: 'Altera a proteína',
  splice_donor_5th_base_variant: '5ª base do sítio doador de splicing',
  splice_region_variant: 'Região de splicing',
  splice_donor_region_variant: 'Região do sítio doador de splicing',
  splice_polypyrimidine_tract_variant: 'Trato polipirimidínico de splicing',
  incomplete_terminal_codon_variant: 'Códon terminal incompleto',
  start_retained_variant: 'Códon de início mantido',
  stop_retained_variant: 'Códon de parada mantido',
  synonymous_variant: 'Sinônima (silenciosa)',
  coding_sequence_variant: 'Sequência codificante',
  mature_mirna_variant: 'MiRNA maduro',
  '5_prime_utr_variant': "região 5' não traduzida (5' UTR)",
  '3_prime_utr_variant': "região 3' não traduzida (3' UTR)",
  non_coding_transcript_exon_variant: 'Éxon de transcrito não codificante',
  intron_variant: 'Intrônica',
  nmd_transcript_variant: 'Transcrito alvo de NMD',
  non_coding_transcript_variant: 'Transcrito não codificante',
  coding_transcript_variant: 'Transcrito codificante',
  upstream_gene_variant: 'A montante do gene',
  downstream_gene_variant: 'A jusante do gene',
  tfbs_ablation: 'Ablação de sítio de ligação de fator de transcrição',
  tfbs_amplification: 'Amplificação de sítio de ligação de fator de transcrição',
  tf_binding_site_variant: 'Sítio de ligação de fator de transcrição',
  regulatory_region_ablation: 'Ablação de região regulatória',
  regulatory_region_amplification: 'Amplificação de região regulatória',
  regulatory_region_variant: 'Região regulatória',
  intergenic_variant: 'Intergênica',
  sequence_variant: 'Variante de sequência',
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

// dbNSFP / VEP prediction codes and words. Single letters are tool-dependent, so the common
// resolutions are used: D = deletério, T = tolerado, P = patogênica (AlphaMissense), B = benigno.
const PREDICTION_PT = {
  deleterious: 'Deletério',
  deleterious_low_confidence: 'Deletério (baixa confiança)',
  tolerated: 'Tolerado',
  tolerated_low_confidence: 'Tolerado (baixa confiança)',
  benign: 'Benigno',
  possibly_damaging: 'Possivelmente deletério',
  probably_damaging: 'Provavelmente deletério',
  damaging: 'Deletério',
  pathogenic: 'Patogênica',
  ambiguous: 'Ambígua',
  neutral: 'Neutro',
  d: 'Deletério',
  t: 'Tolerado',
  p: 'Patogênica',
  b: 'Benigno',
  n: 'Neutro',
  a: 'Ambígua',
  u: 'Desconhecida',
}

export function translatePrediction(value) {
  if (!value) return value
  const key = String(value).trim().toLowerCase().replace(/\s+/g, '_')
  return PREDICTION_PT[key] || value
}

// ClinVar significance terms. A compound string ("Pathogenic/Pathogenic, low penetrance; risk
// factor") is split on / ; , and each segment translated, keeping the separators.
const SIGNIFICANCE_PT = {
  pathogenic: 'Patogênica',
  'likely pathogenic': 'Provavelmente patogênica',
  benign: 'Benigna',
  'likely benign': 'Provavelmente benigna',
  'uncertain significance': 'Significado incerto',
  'uncertain risk allele': 'Alelo de risco incerto',
  'low penetrance': 'Baixa penetrância',
  'risk factor': 'Fator de risco',
  'established risk allele': 'Alelo de risco estabelecido',
  'likely risk allele': 'Provável alelo de risco',
  'drug response': 'Resposta a medicamento',
  association: 'Associação',
  protective: 'Protetora',
  affects: 'Afeta',
  'conflicting interpretations of pathogenicity': 'Classificações conflitantes',
  'conflicting classifications of pathogenicity': 'Classificações conflitantes',
  'not provided': 'Não informado',
  other: 'Outro',
  'no classification for the single variant': 'Sem classificação para a variante isolada',
  'no classifications from unflagged records': 'Sem classificações em registros válidos',
}

function translateSigSegment(part) {
  const translated = part
    .split(/([;,])/)
    .map((s) => {
      if (/^[;,]$/.test(s)) return s
      const key = s.trim().toLowerCase()
      if (!key) return s
      const pt = SIGNIFICANCE_PT[key]
      return pt ? s.replace(s.trim(), pt) : s
    })
    .join('')
    .trim()
  return translated.charAt(0).toUpperCase() + translated.slice(1)
}

export function translateSignificance(value) {
  if (!value) return value
  // ClinVar joins classifications with '/'. Drop a part that is only a prefix of another
  // (e.g. "Pathogenic" next to "Pathogenic, low penetrance") so it does not read "X/X".
  const parts = value.split('/').map((p) => p.trim()).filter(Boolean)
  const kept = parts.filter(
    (p, i) =>
      !parts.some(
        (q, j) => j !== i && q.toLowerCase().startsWith(p.toLowerCase()) && q.length > p.length,
      ),
  )
  return [...new Set(kept)].map(translateSigSegment).join(' / ')
}

// ClinVar review status (star rating) phrases, translated whole.
const REVIEW_STATUS_PT = {
  'practice guideline': 'Diretriz de prática clínica',
  'reviewed by expert panel': 'Revisado por painel de especialistas',
  'criteria provided, multiple submitters, no conflicts':
    'Com critérios, vários submissores, sem conflitos',
  'criteria provided, conflicting classifications': 'Com critérios, classificações conflitantes',
  'criteria provided, conflicting interpretations': 'Com critérios, interpretações conflitantes',
  'criteria provided, single submitter': 'Com critérios, um submissor',
  'no assertion criteria provided': 'Sem critérios de avaliação informados',
  'no assertion provided': 'Sem avaliação informada',
  'no classification provided': 'Sem classificação informada',
  'no classifications from unflagged records': 'Sem classificações em registros válidos',
  'flagged submission': 'Submissão sinalizada',
}

export function translateReviewStatus(value) {
  if (!value) return value
  return REVIEW_STATUS_PT[value.trim().toLowerCase()] || value
}

// ClinVar last_evaluated comes as "YYYY/MM/DD HH:MM"; show as DD/MM/YYYY.
export function formatClinvarDate(value) {
  if (!value) return value
  const m = String(value).match(/^(\d{4})\/(\d{2})\/(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}
