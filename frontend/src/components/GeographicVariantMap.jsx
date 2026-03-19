import Plot from 'react-plotly.js'

// Blue-to-red colorscale: low frequency = blue, high frequency = red
const FREQ_COLORSCALE = [
  [0,    '#DBEAFE'], // blue-100
  [0.15, '#3B82F6'], // blue-500
  [0.4,  '#8B5CF6'], // violet-500
  [0.65, '#F59E0B'], // amber-500
  [0.85, '#EF4444'], // red-500
  [1,    '#991B1B'], // red-800
]

const POP_COORDS = {
  AFR: { lat: 0,  lon: 20  },
  AMR: { lat: 10, lon: -80 },
  ASJ: { lat: 31, lon: 35  },
  EAS: { lat: 35, lon: 105 },
  FIN: { lat: 64, lon: 26  },
  NFE: { lat: 50, lon: 10  },
  SAS: { lat: 20, lon: 78  },
  MID: { lat: 30, lon: 50  },
  AMI: { lat: 40, lon: -82 },
}

const POP_NAMES = {
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

export default function GeographicVariantMap({ frequencies }) {
  if (!frequencies || frequencies.length === 0) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Geographic Distribution</h3>
        <p className="text-sm text-gray-400">No population frequency data available.</p>
      </div>
    )
  }

  const lats = [], lons = [], afs = [], texts = [], sizes = [], popLabels = []

  for (const pop of frequencies) {
    const code = pop.population.toUpperCase()
    const coords = POP_COORDS[code]
    if (!coords) continue

    const af = pop.allele_frequency
    lats.push(coords.lat)
    lons.push(coords.lon)
    afs.push(af)
    popLabels.push(code)
    texts.push(
      `<b>${POP_NAMES[code] || pop.population_name}</b> (${code})<br>` +
      `Allele Frequency: ${af.toExponential(3)}<br>` +
      `AC: ${pop.allele_count.toLocaleString()} / AN: ${pop.allele_number.toLocaleString()}`
    )
    // Marker size proportional to log frequency, minimum 12
    const logAf = af > 0 ? Math.max(Math.log10(af) + 6, 0) : 0
    sizes.push(Math.max(12, logAf * 12))
  }

  const plotData = [
    {
      type: 'scattergeo',
      mode: 'markers+text',
      lat: lats,
      lon: lons,
      text: popLabels,
      customdata: texts,
      hovertemplate: '%{customdata}<extra></extra>',
      textposition: 'top center',
      textfont: { family: 'Geist Mono', size: 9, color: '#374151' },
      marker: {
        size: sizes,
        color: afs,
        colorscale: FREQ_COLORSCALE,
        showscale: true,
        colorbar: {
          title: { text: 'AF', font: { family: 'Geist Mono', size: 11 } },
          tickfont: { family: 'Geist Mono', size: 9 },
          thickness: 12,
          len: 0.7,
        },
        line: { color: 'white', width: 1.5 },
        opacity: 0.9,
      },
    },
  ]

  const layout = {
    geo: {
      scope: 'world',
      projection: { type: 'natural earth' },
      showland: true,
      landcolor: '#F3F4F6',
      showocean: true,
      oceancolor: '#EFF6FF',
      showcoastlines: true,
      coastlinecolor: '#D1D5DB',
      showframe: false,
      bgcolor: 'white',
      showlakes: false,
      showcountries: true,
      countrycolor: '#E5E7EB',
    },
    margin: { l: 0, r: 60, t: 10, b: 0 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    font: { family: 'Geist Mono', color: '#171717' },
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'Geist Mono', size: 12 },
      align: 'left',
    },
  }

  return (
    <div className="card-flat">
      <h3 className="section-title">Geographic Distribution</h3>
      <p className="text-xs text-gray-400 mb-2">
        Marker size proportional to allele frequency (log scale). Color: blue (rare) to red (common).
        Hover over each population for details.
      </p>
      <Plot
        data={plotData}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '380px' }}
      />
    </div>
  )
}
