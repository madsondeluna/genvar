import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { chartColors, baseLayout, withAlpha, populationColor, CHART_FONT } from '../utils/chartTheme'

// Cor identifica a população (slots --chart-1..8, em sequência), a mesma do
// mapa geográfico. Barras de vidro: preenchimento translúcido, borda sólida.
// A cor da série fica na marca; o rótulo da legenda fica em tinta de texto.

const POP_DESCRIPTIONS = {
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

export default function FrequencyBarChart({ frequencies }) {
  const { plotData, layout, sorted, legendColors } = useMemo(() => {
    if (!frequencies || frequencies.length === 0) return {}
    const c = chartColors()
    const sorted = [...frequencies].sort((a, b) => b.allele_frequency - a.allele_frequency)
    const labels = sorted.map((p) => p.population)
    const values = sorted.map((p) => p.allele_frequency)
    const edges = sorted.map((p) => populationColor(p.population.toUpperCase(), c))
    const fills = edges.map((color) => withAlpha(color, 0.45))
    const texts = sorted.map(
      (p) =>
        `<b>${POP_DESCRIPTIONS[p.population] || p.population_name}</b><br>` +
        `AF: ${p.allele_frequency.toExponential(3)}<br>` +
        `AC: ${p.allele_count.toLocaleString('pt-BR')} / AN: ${p.allele_number.toLocaleString('pt-BR')}`
    )

    const plotData = [
      {
        type: 'bar',
        x: labels,
        y: values,
        hovertext: texts,
        hoverinfo: 'text',
        marker: {
          color: fills,
          line: { color: edges, width: 1.5 },
        },
      },
    ]

    const layout = {
      ...baseLayout(c),
      yaxis: {
        type: 'log',
        title: { text: 'Frequência alélica (escala log)', font: { family: CHART_FONT, size: 11 } },
        gridcolor: c.grid,
        tickfont: { family: CHART_FONT, size: 10 },
        zeroline: false,
      },
      xaxis: {
        tickfont: { family: CHART_FONT, size: 11 },
        tickangle: 0,
      },
      margin: { l: 70, r: 20, t: 20, b: 50 },
    }

    const legendColors = Object.fromEntries(
      sorted.map((p) => [p.population, populationColor(p.population.toUpperCase(), c)])
    )

    return { plotData, layout, sorted, legendColors }
  }, [frequencies])

  if (!frequencies || frequencies.length === 0) {
    return (
      <div className="card">
        <h3 className="section-title mb-8">Frequências alélicas por população</h3>
        <div className="empty">Sem dados de frequência disponíveis.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="section-title mb-8">Frequências alélicas por população</h3>
      <p className="text-12 text-muted mb-12">
        Frequência alélica (AC/AN) por população do gnomAD. Escala logarítmica. Passe o mouse para detalhes.
      </p>

      <Plot
        data={plotData}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />

      {/* Códigos e nomes das populações; a cor da série fica na marca */}
      <div className="mt-16 pt-12 border-t border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-16 gap-y-8">
        {sorted.map((p) => (
          <span key={p.population} className="flex items-start gap-6 text-12 text-muted leading-snug">
            <span
              className="inline-block flex-shrink-0 w-10 h-10 mt-2"
              style={{ backgroundColor: legendColors[p.population], borderRadius: 'var(--radius-mark)' }}
              aria-hidden="true"
            />
            <span>
              <span className="mono text-text">{p.population}</span>
              {' '}{POP_DESCRIPTIONS[p.population] || p.population_name}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
