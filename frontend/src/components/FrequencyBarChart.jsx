import Plot from 'react-plotly.js'

function afToGray(af) {
  if (af <= 0) return '#F5F5F5'
  const log = Math.log10(af)
  // log range roughly -6 to 0
  const t = Math.min(1, Math.max(0, (log + 6) / 6))
  const grays = ['#F5F5F5', '#D4D4D4', '#A3A3A3', '#737373', '#525252', '#171717']
  const idx = Math.floor(t * (grays.length - 1))
  return grays[idx]
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
  const colors = sorted.map((p) => afToGray(p.allele_frequency))
  const texts = sorted.map(
    (p) =>
      `${p.population_name}<br>AF: ${p.allele_frequency.toExponential(3)}<br>AC: ${p.allele_count} / AN: ${p.allele_number}`
  )

  const data = [
    {
      type: 'bar',
      x: labels,
      y: values,
      text: texts,
      hoverinfo: 'text',
      marker: { color: colors, line: { color: '#171717', width: 0.5 } },
    },
  ]

  const layout = {
    yaxis: {
      type: 'log',
      title: { text: 'Allele Frequency (log)', font: { family: 'JetBrains Mono', size: 11 } },
      gridcolor: '#E5E5E5',
      tickfont: { family: 'JetBrains Mono', size: 10 },
      zeroline: false,
    },
    xaxis: {
      tickfont: { family: 'JetBrains Mono', size: 11 },
      tickangle: 0,
    },
    margin: { l: 60, r: 20, t: 20, b: 50 },
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
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />
    </div>
  )
}
