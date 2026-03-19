import Plot from 'react-plotly.js'

const GRAY_COLORSCALE = [
  [0, '#F5F5F5'],
  [0.2, '#D4D4D4'],
  [0.4, '#A3A3A3'],
  [0.6, '#737373'],
  [0.8, '#525252'],
  [1, '#171717'],
]

const POP_COORDS = {
  AFR: { lat: 0, lon: 20 },
  AMR: { lat: 10, lon: -80 },
  ASJ: { lat: 31, lon: 35 },
  EAS: { lat: 35, lon: 105 },
  FIN: { lat: 64, lon: 26 },
  NFE: { lat: 50, lon: 10 },
  SAS: { lat: 20, lon: 78 },
  MID: { lat: 30, lon: 50 },
  AMI: { lat: 40, lon: -82 },
}

export default function GeographicVariantMap({ frequencies }) {
  if (!frequencies || frequencies.length === 0) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Geographic Distribution</h3>
        <p className="text-sm text-gray-400">No population frequency data available.</p>
      </div>
    )
  }

  const lats = []
  const lons = []
  const afs = []
  const texts = []
  const sizes = []

  for (const pop of frequencies) {
    const code = pop.population.toUpperCase()
    const coords = POP_COORDS[code]
    if (!coords) continue

    const af = pop.allele_frequency
    lats.push(coords.lat)
    lons.push(coords.lon)
    afs.push(af)
    texts.push(
      `${pop.population_name}<br>` +
      `AF: ${af.toExponential(3)}<br>` +
      `AC: ${pop.allele_count.toLocaleString()}<br>` +
      `AN: ${pop.allele_number.toLocaleString()}`
    )
    // Log scale sizing, minimum 8
    const logAf = af > 0 ? Math.max(Math.log10(af) + 6, 0) : 0
    sizes.push(Math.max(8, logAf * 10))
  }

  const data = [
    {
      type: 'scattergeo',
      mode: 'markers',
      lat: lats,
      lon: lons,
      text: texts,
      hoverinfo: 'text',
      marker: {
        size: sizes,
        color: afs,
        colorscale: GRAY_COLORSCALE,
        showscale: true,
        colorbar: {
          title: { text: 'Allele Frequency', font: { family: 'JetBrains Mono', size: 11 } },
          tickfont: { family: 'JetBrains Mono', size: 10 },
          thickness: 14,
        },
        line: { color: '#171717', width: 1 },
        opacity: 0.85,
      },
    },
  ]

  const layout = {
    geo: {
      scope: 'world',
      projection: { type: 'natural earth' },
      showland: true,
      landcolor: '#F5F5F5',
      showocean: true,
      oceancolor: '#FAFAFA',
      showcoastlines: true,
      coastlinecolor: '#D4D4D4',
      showframe: false,
      bgcolor: 'white',
      showlakes: false,
      showcountries: true,
      countrycolor: '#E5E5E5',
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
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
      <h3 className="section-title">Geographic Distribution</h3>
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '380px' }}
      />
    </div>
  )
}
