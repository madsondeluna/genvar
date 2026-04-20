export function formatConsequence(value) {
  if (!value) return 'desconhecida'
  return value.replace(/_/g, ' ')
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
