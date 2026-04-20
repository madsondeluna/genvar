// pLI:   > 0.9 = highly constrained (red), 0.1-0.9 = intermediate (amber), < 0.1 = tolerant (green)
// LOEUF: < 0.35 = highly constrained (red), 0.35-0.6 = intermediate (amber), > 0.6 = tolerant (green)
// oe_lof/oe_mis: < 0.5 = constrained (red), 0.5-0.8 = intermediate (amber), > 0.8 = tolerant (green)

function constraintColor(value, metric) {
  if (value == null) return { bar: '#E5E5E5', text: 'text-gray-400', label: 'Indisponível', bg: 'bg-gray-100' }
  if (metric === 'pli') {
    if (value >= 0.9) return { bar: '#DC2626', text: 'text-red-600', label: 'Altamente restrito', bg: 'bg-red-50' }
    if (value >= 0.1) return { bar: '#D97706', text: 'text-amber-600', label: 'Intermediário', bg: 'bg-amber-50' }
    return { bar: '#16A34A', text: 'text-green-600', label: 'Tolerante a LoF', bg: 'bg-green-50' }
  }
  if (metric === 'loeuf') {
    if (value <= 0.35) return { bar: '#DC2626', text: 'text-red-600', label: 'Altamente restrito', bg: 'bg-red-50' }
    if (value <= 0.6) return { bar: '#D97706', text: 'text-amber-600', label: 'Intermediário', bg: 'bg-amber-50' }
    return { bar: '#16A34A', text: 'text-green-600', label: 'Tolerante a LoF', bg: 'bg-green-50' }
  }
  if (value <= 0.5) return { bar: '#DC2626', text: 'text-red-600', label: 'Restrição forte', bg: 'bg-red-50' }
  if (value <= 0.8) return { bar: '#D97706', text: 'text-amber-600', label: 'Restrição moderada', bg: 'bg-amber-50' }
  return { bar: '#16A34A', text: 'text-green-600', label: 'Próximo do esperado', bg: 'bg-green-50' }
}

function MetricBar({ label, value, max = 1, metric, description }) {
  const color = constraintColor(value, metric)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="label">{label}</span>
          {value != null && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}>
              {color.label}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold text-gray-700">
          {value != null ? value.toFixed(4) : 'Indisponível'}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: value != null ? `${Math.min(100, (value / max) * 100)}%` : '0%',
            backgroundColor: color.bar,
          }}
        />
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}

function ScoreGauge({ label, value, metric, interpretation }) {
  const color = constraintColor(value, metric)
  const pct = value != null ? Math.min(100, value * 100) : 0

  return (
    <div className={`rounded-lg border p-4 ${value != null ? color.bg : 'bg-gray-50'} border-gray-200`}>
      <p className="label mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${value != null ? color.text : 'text-gray-300'}`}>
        {value != null ? value.toFixed(4) : 'Indisponível'}
      </p>
      <p className={`text-xs font-medium mt-1 ${value != null ? color.text : 'text-gray-400'}`}>
        {value != null ? color.label : 'Não disponível'}
      </p>
      <div className="mt-3 h-1.5 bg-white bg-opacity-60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color.bar }}
        />
      </div>
      {interpretation && <p className="text-xs text-gray-500 mt-2">{interpretation}</p>}
    </div>
  )
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-3 mt-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-xs text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function ConstraintMetrics({ data }) {
  if (!data) return null

  const { pli_score, lof_z_score, oe_lof, oe_lof_upper, oe_mis } = data

  return (
    <div className="card-flat">
      <div className="flex items-start justify-between mb-1">
        <h3 className="section-title mb-0">Métricas de restrição</h3>
        <span className="text-xs text-gray-500">gnomAD r4</span>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        Restrição evolutiva indica o quanto a seleção natural atua contra variantes de perda de função
        neste gene. Genes altamente restritos são intolerantes a mutações.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <ScoreGauge
          label="Score pLI"
          value={pli_score}
          metric="pli"
          interpretation="Probabilidade de intolerância a LoF. > 0,9 = alta restrição."
        />
        <ScoreGauge
          label="LOEUF"
          value={oe_lof_upper}
          metric="loeuf"
          interpretation="Limite superior de o/e para LoF. < 0,35 = alta restrição."
        />
      </div>

      <Legend
        items={[
          { color: '#DC2626', label: 'Altamente restrito' },
          { color: '#D97706', label: 'Intermediário' },
          { color: '#16A34A', label: 'Tolerante' },
        ]}
      />

      <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-gray-100">
        <MetricBar
          label="Z-score de LoF"
          value={lof_z_score}
          max={5}
          metric="pli"
          description="Z-score da depleção de variantes LoF. Maior = mais restrito."
        />
        <MetricBar
          label="o/e LoF"
          value={oe_lof}
          max={1}
          metric="loeuf"
          description="Razão observado/esperado para variantes LoF. Menor = restrição mais forte."
        />
        <MetricBar
          label="o/e Missense"
          value={oe_mis}
          max={1}
          metric="loeuf"
          description="Razão observado/esperado para variantes missense. Menor = restrição mais forte."
        />
      </div>
    </div>
  )
}
