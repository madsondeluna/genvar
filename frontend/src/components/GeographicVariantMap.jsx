import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { chartColors, baseLayout, withAlpha, populationColor, CHART_FONT } from '../utils/chartTheme'

// Cor identifica a população (slots --chart-1..8, em sequência); o tamanho
// carrega a frequência (escala log). Bolhas de vidro: preenchimento translúcido
// com borda sólida da mesma cor.

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
  AFR: 'Africana / Afro-americana',
  AMR: 'Latina / Americana mista',
  ASJ: 'Judaica asquenaze',
  EAS: 'Asiática oriental',
  FIN: 'Finlandesa',
  NFE: 'Europeia não finlandesa',
  SAS: 'Sul asiática',
  MID: 'Oriente Médio',
  AMI: 'Amish',
}

export default function GeographicVariantMap({ frequencies }) {
  const built = useMemo(() => {
    if (!frequencies || frequencies.length === 0) return null
    const c = chartColors()

    const lats = [], lons = [], texts = [], sizes = [], popLabels = []
    const fills = [], edges = []

    for (const pop of frequencies) {
      const code = pop.population.toUpperCase()
      const coords = POP_COORDS[code]
      if (!coords) continue

      const af = pop.allele_frequency
      lats.push(coords.lat)
      lons.push(coords.lon)
      popLabels.push(code)
      const color = populationColor(code, c)
      fills.push(withAlpha(color, 0.45))
      edges.push(color)
      texts.push(
        `<b>${POP_NAMES[code] || pop.population_name}</b> (${code})<br>` +
        `Frequência alélica: ${af.toExponential(3)}<br>` +
        `AC: ${pop.allele_count.toLocaleString('pt-BR')} / AN: ${pop.allele_number.toLocaleString('pt-BR')}`
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
        textfont: { family: CHART_FONT, size: 9, color: c.inkMuted },
        marker: {
          size: sizes,
          color: fills,
          line: { color: edges, width: 1.5 },
        },
      },
    ]

    const layout = {
      ...baseLayout(c),
      geo: {
        scope: 'world',
        projection: { type: 'natural earth' },
        showland: true,
        landcolor: c.dim,
        showocean: true,
        oceancolor: c.surface,
        showcoastlines: true,
        coastlinecolor: c.border,
        showframe: false,
        bgcolor: c.surface,
        showlakes: false,
        showcountries: true,
        countrycolor: c.border,
      },
      margin: { l: 0, r: 60, t: 10, b: 0 },
    }

    return { plotData, layout }
  }, [frequencies])

  if (!built) {
    return (
      <div className="card">
        <h3 className="section-title mb-8">Distribuição geográfica</h3>
        <div className="empty">Sem dados populacionais disponíveis.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="section-title mb-8">Distribuição geográfica</h3>
      <p className="text-12 mb-8">
        Cor identifica a população, a mesma do gráfico de frequências abaixo. Tamanho do marcador
        proporcional à frequência alélica (escala log). Passe o mouse sobre cada população para
        detalhes.
      </p>
      <Plot
        data={built.plotData}
        layout={built.layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '380px' }}
      />
    </div>
  )
}
