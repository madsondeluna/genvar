import Plot from 'react-plotly.js'

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

export default function PredictionScoresRadar({ sift, polyphen, cadd, revel }) {
  const scores = {
    SIFT: normalizeSift(sift),
    PolyPhen: normalizePolyphen(polyphen),
    CADD: normalizeCadd(cadd),
    REVEL: normalizeRevel(revel),
  }

  const hasAny = Object.values(scores).some((v) => v != null)

  if (!hasAny) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Pathogenicity Predictions</h3>
        <p className="text-sm text-gray-400">No prediction scores available for this variant.</p>
      </div>
    )
  }

  const categories = Object.keys(scores)
  const values = categories.map((k) => scores[k] ?? 0)
  const customdata = categories.map((k) => {
    const raw = { SIFT: sift, PolyPhen: polyphen, CADD: cadd, REVEL: revel }[k]
    return raw != null ? raw.toFixed(4) : 'N/A'
  })

  const displayLabels = categories.map((k) => {
    const raw = { SIFT: sift, PolyPhen: polyphen, CADD: cadd, REVEL: revel }[k]
    return raw != null ? `${k}: ${Number(raw).toFixed(3)}` : `${k}: N/A`
  })

  const data = [
    {
      type: 'scatterpolar',
      r: [...values, values[0]],
      theta: [...displayLabels, displayLabels[0]],
      fill: 'toself',
      fillcolor: 'rgba(23, 23, 23, 0.15)',
      line: { color: '#171717', width: 2 },
      marker: { color: '#171717', size: 6 },
      hovertemplate: '<b>%{theta}</b><br>Normalized: %{r:.3f}<extra></extra>',
    },
  ]

  const layout = {
    polar: {
      radialaxis: {
        visible: true,
        range: [0, 1],
        gridcolor: '#E5E5E5',
        tickfont: { family: 'JetBrains Mono', size: 9 },
        tickcolor: '#A3A3A3',
        linecolor: '#D4D4D4',
      },
      angularaxis: {
        tickfont: { family: 'JetBrains Mono', size: 10 },
        linecolor: '#D4D4D4',
        gridcolor: '#E5E5E5',
      },
      bgcolor: 'white',
    },
    margin: { l: 60, r: 60, t: 30, b: 30 },
    paper_bgcolor: 'white',
    font: { family: 'JetBrains Mono', color: '#171717' },
    showlegend: false,
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'JetBrains Mono', size: 12 },
    },
  }

  return (
    <div className="card-flat">
      <h3 className="section-title">Pathogenicity Predictions</h3>
      <p className="text-xs text-gray-400 mb-2">
        All scores normalized 0-1 (higher = more pathogenic). SIFT inverted.
      </p>
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '320px' }}
      />
    </div>
  )
}
