import { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { chartColors, baseLayout, withAlpha, CHART_FONT } from '../utils/chartTheme'

// Classificação clínica é estado, então as pilhas usam --status-*:
// patogênica = critical, VUS = warning, benigna = good. Nunca um slot de série.
// Barras de vidro: preenchimento translúcido, borda sólida da mesma cor.

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
        marker: { color: withAlpha(c.critical, 0.55), line: { color: c.critical, width: 1 } },
        hovertemplate: hover,
      },
      {
        type: 'bar',
        name: 'VUS / Conflitante',
        x: xMb,
        y: bins.map((b) => b.vus),
        width: widthMb,
        marker: { color: withAlpha(c.warning, 0.55), line: { color: c.warning, width: 1 } },
        hovertemplate: hover,
      },
      {
        type: 'bar',
        name: 'Benigna',
        x: xMb,
        y: bins.map((b) => b.benign),
        width: widthMb,
        marker: { color: withAlpha(c.good, 0.55), line: { color: c.good, width: 1 } },
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

    // Resumo da janela plotada: totais por classe e o trecho mais denso
    const totals = bins.reduce(
      (acc, b) => {
        acc.pathogenic += b.pathogenic
        acc.vus += b.vus
        acc.benign += b.benign
        return acc
      },
      { pathogenic: 0, vus: 0, benign: 0 }
    )
    const hotspot = bins.reduce((best, b) => {
      const count = b.pathogenic + b.vus + b.benign
      return count > (best?.count || 0) ? { start: b.start, count } : best
    }, null)

    return { data, layout, totals, classifiedTotal, hotspot }
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
      <p className="text-12 mb-8">
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

      {/* resumo da janela plotada, derivado dos mesmos bins do gráfico */}
      <div className="mt-16 pt-12 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-16">
        <div className="flex flex-col gap-2">
          <span className="text-18 font-medium mono num text-text">
            {built.classifiedTotal.toLocaleString('pt-BR')}
          </span>
          <span className="label">Classificadas no gráfico</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-18 font-medium mono num" style={{ color: 'var(--state-critical)' }}>
            {built.totals.pathogenic.toLocaleString('pt-BR')}
          </span>
          <span className="status status-critical text-12">Patogênicas</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-18 font-medium mono num" style={{ color: 'var(--state-warning)' }}>
            {built.totals.vus.toLocaleString('pt-BR')}
          </span>
          <span className="status status-warning text-12">VUS / Conflitantes</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-18 font-medium mono num" style={{ color: 'var(--state-good)' }}>
            {built.totals.benign.toLocaleString('pt-BR')}
          </span>
          <span className="status status-good text-12">Benignas</span>
        </div>
      </div>
      {built.hotspot && (
        <p className="text-12 mt-12">
          Trecho mais denso: {(built.hotspot.start / 1_000_000).toFixed(3)} Mb, com{' '}
          {built.hotspot.count.toLocaleString('pt-BR')} variantes classificadas em {binKb} kb.
        </p>
      )}
    </div>
  )
}
