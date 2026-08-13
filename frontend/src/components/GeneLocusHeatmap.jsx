import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { chartColors, baseLayout, CHART_FONT } from '../utils/chartTheme'

// Classificação clínica é estado, então as pilhas usam --status-*:
// patogênica = critical, VUS = warning, benigna = good. Nunca um slot de série.

export default function GeneLocusHeatmap({ geneData }) {
  const built = useMemo(() => {
    if (!geneData) return null
    const bins = geneData.variant_distribution || []
    const classifiedTotal = bins.reduce((sum, b) => sum + b.pathogenic + b.vus + b.benign, 0)
    if (!bins.length || classifiedTotal === 0) return null

    const c = chartColors()
    // Numeric x in Mb gives a real coordinate axis that lines up with the chr{n} ideogram above,
    // instead of opaque bin indices. Bar width equals the bin size so bars are contiguous.
    const xMb = bins.map((b) => b.start / 1_000_000)
    const widthMb = (geneData.variant_bin_size || 1000) / 1_000_000
    const hover = '%{x:.3f} Mb (chr' + geneData.chromosome + ')<br>%{fullData.name}: %{y}<extra></extra>'

    const data = [
      {
        type: 'bar',
        name: 'Patogênica',
        x: xMb,
        y: bins.map((b) => b.pathogenic),
        width: widthMb,
        marker: { color: c.critical },
        hovertemplate: hover,
      },
      {
        type: 'bar',
        name: 'VUS / Conflitante',
        x: xMb,
        y: bins.map((b) => b.vus),
        width: widthMb,
        marker: { color: c.warning },
        hovertemplate: hover,
      },
      {
        type: 'bar',
        name: 'Benigna',
        x: xMb,
        y: bins.map((b) => b.benign),
        width: widthMb,
        marker: { color: c.good },
        hovertemplate: hover,
      },
    ]

    const layout = {
      ...baseLayout(c),
      barmode: 'stack',
      bargap: 0,
      xaxis: {
        title: { text: `Posição em chr${geneData.chromosome} (Mb)`, font: { family: CHART_FONT, size: 11 } },
        tickfont: { family: CHART_FONT, size: 10 },
        tickformat: '.2f',
        range: [geneData.start / 1_000_000, geneData.end / 1_000_000],
      },
      yaxis: {
        title: { text: 'Variantes classificadas', font: { family: CHART_FONT, size: 11 } },
        gridcolor: c.grid,
        tickfont: { family: CHART_FONT, size: 10 },
      },
      legend: {
        font: { family: CHART_FONT, size: 11 },
        orientation: 'h',
        y: -0.3,
      },
      margin: { l: 55, r: 20, t: 20, b: 80 },
    }

    return { data, layout }
  }, [geneData])

  if (!geneData) return null

  if (!built) {
    return (
      <div className="card">
        <h3 className="section-title mb-8">Onde estão as variantes clínicas no gene</h3>
        <div className="empty">Nenhuma variante classificada pelo ClinVar para este gene.</div>
      </div>
    )
  }

  const binKb = Math.round((geneData.variant_bin_size || 1000) / 1000)

  return (
    <div className="card">
      <h3 className="section-title mb-8">Onde estão as variantes clínicas no gene</h3>
      <p className="text-12 text-muted mb-8">
        O eixo horizontal é a posição no cromossomo {geneData.chromosome} (em milhões de bases, Mb),
        a mesma coordenada do mapa cromossômico acima. Cada barra cobre {binKb} kb do gene; a altura
        mostra quantas variantes com classificação clínica no ClinVar caem ali, em patogênica
        (vermelho), de significado incerto (âmbar) e benigna (verde). Variantes ainda sem curadoria no
        ClinVar não entram neste gráfico.
        chr{geneData.chromosome}:{geneData.start.toLocaleString('pt-BR')}-{geneData.end.toLocaleString('pt-BR')}
      </p>
      <Plot
        data={built.data}
        layout={built.layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />
    </div>
  )
}
