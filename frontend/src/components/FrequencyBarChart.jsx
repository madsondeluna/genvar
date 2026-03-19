import Plot from 'react-plotly.js'

// Distinct colors per population for easy differentiation
const POP_COLORS = {
  AFR: '#2563EB', // blue
  AMR: '#D97706', // amber
  ASJ: '#7C3AED', // violet
  EAS: '#DC2626', // red
  FIN: '#0891B2', // cyan
  NFE: '#059669', // emerald
  SAS: '#EA580C', // orange
  MID: '#BE185D', // pink
  AMI: '#65A30D', // lime
}

const POP_DESCRIPTIONS = {
  AFR: 'African / African American',
  AMR: 'Latino / Admixed American',
  ASJ: 'Ashkenazi Jewish',
  EAS: 'East Asian',
  FIN: 'Finnish',
  NFE: 'Non-Finnish European',
  SAS: 'South Asian',
  MID: 'Middle Eastern',
  AMI: 'Amish',
}

export default function FrequencyBarChart({ frequencies }) {
  if (!frequencies || frequencies.length === 0) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Population Allele Frequencies</h3>
        <p className="text-sm text-gray-400">No frequency data available.</p>
      </div>
    )
  }

  const sorted = [...frequencies].sort((a, b) => b.allele_frequency - a.allele_frequency)
  const labels = sorted.map((p) => p.population)
  const values = sorted.map((p) => p.allele_frequency)
  const colors = sorted.map((p) => POP_COLORS[p.population] || '#737373')
  const texts = sorted.map(
    (p) =>
      `<b>${POP_DESCRIPTIONS[p.population] || p.population_name}</b><br>` +
      `AF: ${p.allele_frequency.toExponential(3)}<br>` +
      `AC: ${p.allele_count.toLocaleString()} / AN: ${p.allele_number.toLocaleString()}`
  )

  const plotData = [
    {
      type: 'bar',
      x: labels,
      y: values,
      text: texts,
      hoverinfo: 'text',
      marker: {
        color: colors,
        line: { color: 'white', width: 1 },
        opacity: 0.88,
      },
    },
  ]

  const layout = {
    yaxis: {
      type: 'log',
      title: { text: 'Allele Frequency (log scale)', font: { family: 'JetBrains Mono', size: 11 } },
      gridcolor: '#E5E5E5',
      tickfont: { family: 'JetBrains Mono', size: 10 },
      zeroline: false,
    },
    xaxis: {
      tickfont: { family: 'JetBrains Mono', size: 11 },
      tickangle: 0,
    },
    margin: { l: 70, r: 20, t: 20, b: 50 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    font: { family: 'JetBrains Mono', color: '#171717' },
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'JetBrains Mono', size: 12 },
    },
  }

  return (
    <div className="card-flat">
      <h3 className="section-title">Population Allele Frequencies</h3>
      <p className="text-xs text-gray-400 mb-3">
        Allele frequency (AC/AN) per gnomAD population. Log scale. Hover for details.
      </p>

      <Plot
        data={plotData}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />

      {/* Population legend */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-2">
        {sorted.map((p) => (
          <div key={p.population} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: POP_COLORS[p.population] || '#737373' }}
            />
            <span className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{p.population}</span>
              {' '}{POP_DESCRIPTIONS[p.population] || p.population_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
