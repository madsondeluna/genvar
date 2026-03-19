function MetricBar({ label, value, max = 1, description }) {
  if (value == null) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="label">{label}</span>
          <span className="text-xs text-gray-400">N/A</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full" />
        {description && <p className="text-xs text-gray-400">{description}</p>}
      </div>
    )
  }

  const pct = Math.min(100, (value / max) * 100)
  const fillClass = pct > 75 ? 'bg-gray-900' : pct > 40 ? 'bg-gray-600' : 'bg-gray-300'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="label">{label}</span>
        <span className="text-xs font-medium text-gray-700">{value.toFixed(4)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}

function ScoreGauge({ label, value, interpretation }) {
  if (value == null) {
    return (
      <div className="card-flat">
        <p className="label mb-2">{label}</p>
        <p className="text-2xl font-bold text-gray-300">N/A</p>
        <p className="text-xs text-gray-400 mt-1">{interpretation || 'Not available'}</p>
      </div>
    )
  }

  const pct = Math.min(100, value * 100)
  const level = value > 0.9 ? 'High constraint' : value > 0.5 ? 'Moderate constraint' : 'Low constraint'

  return (
    <div className="card-flat">
      <p className="label mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900 tracking-tight">{value.toFixed(4)}</p>
      <p className="text-xs text-gray-500 mt-1">{level}</p>
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {interpretation && <p className="text-xs text-gray-400 mt-1">{interpretation}</p>}
    </div>
  )
}

export default function ConstraintMetrics({ data }) {
  if (!data) return null

  const { pli_score, lof_z_score, oe_lof, oe_lof_upper, oe_mis } = data

  return (
    <div className="card-flat">
      <h3 className="section-title">Constraint Metrics (gnomAD)</h3>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ScoreGauge
          label="pLI Score"
          value={pli_score}
          interpretation="Probability of being loss-of-function intolerant"
        />
        <ScoreGauge
          label="LOEUF"
          value={oe_lof_upper}
          interpretation="LoF observed/expected upper bound fraction"
        />
      </div>
      <div className="flex flex-col gap-4">
        <MetricBar
          label="LoF Z-score"
          value={lof_z_score}
          max={5}
          description="Loss-of-function constraint z-score"
        />
        <MetricBar
          label="o/e LoF"
          value={oe_lof}
          max={1}
          description="Observed/expected loss-of-function ratio"
        />
        <MetricBar
          label="o/e Missense"
          value={oe_mis}
          max={1}
          description="Observed/expected missense ratio"
        />
      </div>
    </div>
  )
}
