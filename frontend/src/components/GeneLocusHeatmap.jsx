import Plot from 'react-plotly.js'

export default function GeneLocusHeatmap({ geneData }) {
  if (!geneData) return null

  const bins = geneData.variant_distribution || []
  const binKb = Math.round((geneData.variant_bin_size || 1000) / 1000)
  const classifiedTotal = bins.reduce((sum, b) => sum + b.pathogenic + b.vus + b.benign, 0)

  if (!bins.length || classifiedTotal === 0) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Onde estão as variantes clínicas no gene</h3>
        <p className="text-sm text-gray-500">Nenhuma variante classificada pelo ClinVar para este gene.</p>
      </div>
    )
  }

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
      marker: { color: '#DC2626' },
      hovertemplate: hover,
    },
    {
      type: 'bar',
      name: 'VUS / Conflitante',
      x: xMb,
      y: bins.map((b) => b.vus),
      width: widthMb,
      marker: { color: '#D97706' },
      hovertemplate: hover,
    },
    {
      type: 'bar',
      name: 'Benigna',
      x: xMb,
      y: bins.map((b) => b.benign),
      width: widthMb,
      marker: { color: '#16A34A' },
      hovertemplate: hover,
    },
  ]

  const layout = {
    barmode: 'stack',
    bargap: 0,
    xaxis: {
      title: { text: `Posição em chr${geneData.chromosome} (Mb)`, font: { family: 'Ubuntu', size: 11 } },
      tickfont: { family: 'Ubuntu', size: 10 },
      tickformat: '.2f',
      range: [geneData.start / 1_000_000, geneData.end / 1_000_000],
    },
    yaxis: {
      title: { text: 'Variantes classificadas', font: { family: 'Ubuntu', size: 11 } },
      gridcolor: '#E5E5E5',
      tickfont: { family: 'Ubuntu', size: 10 },
    },
    legend: {
      font: { family: 'Ubuntu', size: 11 },
      orientation: 'h',
      y: -0.3,
    },
    margin: { l: 55, r: 20, t: 20, b: 80 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    font: { family: 'Ubuntu', color: '#171717' },
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'Ubuntu', size: 12, color: '#000000' },
    },
  }

  return (
    <div className="card-flat">
      <h3 className="section-title">Onde estão as variantes clínicas no gene</h3>
      <p className="text-xs text-gray-600 mb-2">
        O eixo horizontal é a posição no cromossomo {geneData.chromosome} (em milhões de bases, Mb),
        a mesma coordenada do mapa cromossômico acima. Cada barra cobre {binKb} kb do gene; a altura
        mostra quantas variantes com classificação clínica no ClinVar caem ali, em patogênica
        (vermelho), de significado incerto (âmbar) e benigna (verde). Variantes ainda sem curadoria no
        ClinVar não entram neste gráfico.
        chr{geneData.chromosome}:{geneData.start.toLocaleString('pt-BR')}-{geneData.end.toLocaleString('pt-BR')}
      </p>
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />
    </div>
  )
}
