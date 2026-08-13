import { classifySignificance, translateSignificance } from '../utils/format'

// Estado clínico usa cor de status, nunca um slot de série: a cor vem sempre
// acompanhada do rótulo (regra do ponto + palavra do .status).
const PRESET = {
  pathogenic: { cls: 'status status-critical', label: 'Patogênica' },
  'likely-pathogenic': { cls: 'status status-serious', label: 'Potencialmente patogênica' },
  benign: { cls: 'status status-good', label: 'Benigna' },
  'likely-benign': { cls: 'status status-good', label: 'Potencialmente benigna' },
  vus: { cls: 'status status-warning', label: 'VUS' },
  conflicting: { cls: 'status status-warning', label: 'Conflitante' },
  other: { cls: 'status status-none', label: null },
  unknown: { cls: 'status status-none', label: 'Desconhecida' },
}

export default function SignificanceTag({ value, raw = false }) {
  if (!value) return <span className="status status-none">Desconhecida</span>
  const key = classifySignificance(value)
  const preset = PRESET[key] || PRESET.other
  const label = raw ? translateSignificance(value) : preset.label || translateSignificance(value)
  return <span className={preset.cls}>{label}</span>
}
