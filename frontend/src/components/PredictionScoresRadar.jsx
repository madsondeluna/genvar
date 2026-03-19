import Plot from 'react-plotly.js'

const SCORE_META = {
  SIFT: {
    description: 'Sorting Intolerant from Tolerant. Predicts whether an amino acid substitution affects protein function. Score < 0.05 = damaging.',
    thresholds: [
      { color: '#DC2626', label: 'Damaging (< 0.05)', range: '0.95 - 1.0 normalized' },
      { color: '#16A34A', label: 'Tolerated (> 0.05)', range: '0.0 - 0.95 normalized' },
    ],
  },
  PolyPhen: {
    description: 'Polymorphism Phenotyping v2. Predicts impact of missense mutations on protein structure. Score > 0.908 = probably damaging.',
    thresholds: [
      { color: '#DC2626', label: 'Probably damaging (> 0.908)' },
      { color: '#D97706', label: 'Possibly damaging (0.446 - 0.908)' },
      { color: '#16A34A', label: 'Benign (< 0.446)' },
    ],
  },
  CADD: {
    description: 'Combined Annotation Dependent Depletion. Integrates multiple annotations. Phred score > 20 = top 1% most deleterious. Normalized by dividing by 40.',
    thresholds: [
      { color: '#DC2626', label: 'High impact (Phred > 20)' },
      { color: '#D97706', label: 'Moderate (Phred 10-20)' },
      { color: '#16A34A', label: 'Low impact (Phred < 10)' },
    ],
  },
  REVEL: {
    description: 'Rare Exome Variant Ensemble Learner. Ensemble score for rare missense variants. Score > 0.5 = likely pathogenic.',
    thresholds: [
      { color: '#DC2626', label: 'Likely pathogenic (> 0.5)' },
      { color: '#16A34A', label: 'Likely benign (< 0.5)' },
    ],
  },
}

function normalizeSift(score) {
  if (score == null) return null
  return 1 - score
}

function normalizePolyphen(score) {
  return score
}

function normalizeCadd(score) {
  if (score == null) return null
  return Math.min(1, score / 40)
}

function normalizeRevel(score) {
  return score
}

function pathogenicityColor(avgScore) {
  if (avgScore == null) return { fill: 'rgba(115,115,115,0.15)', line: '#737373' }
  if (avgScore >= 0.6) return { fill: 'rgba(220,38,38,0.15)', line: '#DC2626' }
  if (avgScore >= 0.3) return { fill: 'rgba(217,119,6,0.15)', line: '#D97706' }
  return { fill: 'rgba(22,163,74,0.15)', line: '#16A34A' }
}

function pathogenicityLabel(avgScore) {
  if (avgScore == null) return null
  if (avgScore >= 0.6) return { text: 'Likely pathogenic', cls: 'text-red-600 bg-red-50' }
  if (avgScore >= 0.3) return { text: 'Uncertain', cls: 'text-amber-600 bg-amber-50' }
  return { text: 'Likely benign', cls: 'text-green-600 bg-green-50' }
}

export default function PredictionScoresRadar({ sift, polyphen, cadd, revel }) {
  const raw = { SIFT: sift, PolyPhen: polyphen, CADD: cadd, REVEL: revel }
  const normalized = {
    SIFT: normalizeSift(sift),
    PolyPhen: normalizePolyphen(polyphen),
    CADD: normalizeCadd(cadd),
    REVEL: normalizeRevel(revel),
  }

  const presentValues = Object.values(normalized).filter((v) => v != null)
  const hasAny = presentValues.length > 0
  const avgScore = hasAny ? presentValues.reduce((a, b) => a + b, 0) / presentValues.length : null

  if (!hasAny) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Pathogenicity Predictions</h3>
        <p className="text-sm text-gray-400">No prediction scores available for this variant.</p>
      </div>
    )
  }

  const categories = Object.keys(normalized)
  const values = categories.map((k) => normalized[k] ?? 0)
  const displayLabels = categories.map((k) => {
    const r = raw[k]
    return r != null ? `${k}: ${Number(r).toFixed(3)}` : `${k}: N/A`
  })

  const palette = pathogenicityColor(avgScore)
  const verdict = pathogenicityLabel(avgScore)

  const plotData = [
    {
      type: 'scatterpolar',
      r: [...values, values[0]],
      theta: [...displayLabels, displayLabels[0]],
      fill: 'toself',
      fillcolor: palette.fill,
      line: { color: palette.line, width: 2 },
      marker: { color: palette.line, size: 6 },
      hovertemplate: '<b>%{theta}</b><br>Normalized: %{r:.3f}<extra></extra>',
    },
  ]

  const layout = {
    polar: {
      radialaxis: {
        visible: true,
        range: [0, 1],
        gridcolor: '#E5E5E5',
        tickfont: { family: 'Geist Mono', size: 9 },
        tickcolor: '#A3A3A3',
        linecolor: '#D4D4D4',
        tickvals: [0, 0.25, 0.5, 0.75, 1],
        ticktext: ['0', '0.25', '0.5', '0.75', '1'],
      },
      angularaxis: {
        tickfont: { family: 'Geist Mono', size: 10 },
        linecolor: '#D4D4D4',
        gridcolor: '#E5E5E5',
      },
      bgcolor: 'white',
    },
    margin: { l: 70, r: 70, t: 40, b: 30 },
    paper_bgcolor: 'white',
    font: { family: 'Geist Mono', color: '#171717' },
    showlegend: false,
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'Geist Mono', size: 12 },
    },
  }

  return (
    <div className="card-flat">
      <div className="flex items-center justify-between mb-1">
        <h3 className="section-title mb-0">Pathogenicity Predictions</h3>
        {verdict && (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${verdict.cls}`}>
            {verdict.text}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        All scores normalized to 0-1 (0 = benign, 1 = pathogenic). SIFT is inverted.
        Color reflects the average across available scores.
      </p>

      <Plot
        data={plotData}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />

      {/* Per-score legend */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 gap-3">
        {categories.map((k) => {
          const r = raw[k]
          const n = normalized[k]
          const meta = SCORE_META[k]
          return (
            <div key={k} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{k}</span>
                <span className="text-xs text-gray-500">
                  {r != null ? `raw: ${Number(r).toFixed(4)}` : 'N/A'}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{meta.description}</p>
              <div className="flex flex-wrap gap-2 mt-0.5">
                {meta.thresholds.map((t) => (
                  <div key={t.label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-xs text-gray-400">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
