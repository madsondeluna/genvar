import { classifySignificance, translateSignificance } from '../utils/format'

const PRESET = {
  pathogenic: { cls: 'tag tag-pathogenic', label: 'Patogênica' },
  'likely-pathogenic': { cls: 'tag tag-likely-pathogenic', label: 'Potencialmente patogênica' },
  benign: { cls: 'tag tag-benign', label: 'Benigna' },
  'likely-benign': { cls: 'tag tag-likely-benign', label: 'Potencialmente benigna' },
  vus: { cls: 'tag tag-vus', label: 'VUS' },
  conflicting: { cls: 'tag tag-conflicting', label: 'Conflitante' },
  other: { cls: 'tag tag-other', label: null },
  unknown: { cls: 'tag tag-other', label: 'Desconhecida' },
}

export default function SignificanceTag({ value, raw = false }) {
  if (!value) return <span className="tag tag-other">Desconhecida</span>
  const key = classifySignificance(value)
  const preset = PRESET[key] || PRESET.other
  const label = raw ? translateSignificance(value) : preset.label || translateSignificance(value)
  return (
    <span className={preset.cls}>
      {label}
    </span>
  )
}
