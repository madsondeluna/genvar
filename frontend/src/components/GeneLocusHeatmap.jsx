import Plot from 'react-plotly.js'

function buildBins(variants, geneStart, geneEnd, binSizeKb = 1) {
  const binSize = binSizeKb * 1000
  const numBins = Math.max(1, Math.ceil((geneEnd - geneStart) / binSize))
  const bins = Array.from({ length: numBins }, (_, i) => ({
    start: geneStart + i * binSize,
    pathogenic: 0,
    vus: 0,
    benign: 0,
    other: 0,
  }))

  const allVariants = [
    ...(variants.pathogenic_variants || []).map((v) => ({ ...v, category: 'pathogenic' })),
    ...(variants.vus_variants || []).map((v) => ({ ...v, category: 'vus' })),
    ...(variants.benign_variants || []).map((v) => ({ ...v, category: 'benign' })),
    ...(variants.other_variants || []).map((v) => ({ ...v, category: 'other' })),
  ]

  for (const v of allVariants) {
    const idx = Math.floor((v.position - geneStart) / binSize)
    if (idx >= 0 && idx < bins.length) {
      bins[idx][v.category] += 1
    }
  }

  return bins
}

export default function GeneLocusHeatmap({ geneData }) {
  if (!geneData) return null

  const hasVariants =
    geneData.pathogenic_variants?.length ||
    geneData.vus_variants?.length ||
    geneData.benign_variants?.length ||
    geneData.other_variants?.length

  if (!hasVariants) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Distribuição de variantes ao longo do gene</h3>
        <p className="text-sm text-gray-500">Nenhuma variante classificada disponível para este gene.</p>
      </div>
    )
  }

  const bins = buildBins(geneData, geneData.start, geneData.end)
  const xLabels = bins.map((b) => `${Math.round(b.start / 1000)}kb`)

  const data = [
    {
      type: 'bar',
      name: 'Patogênica / Potencialmente patogênica',
      x: xLabels,
      y: bins.map((b) => b.pathogenic),
      marker: { color: '#DC2626' },
      hovertemplate: 'Posição: %{x}<br>Patogênica: %{y}<extra></extra>',
    },
    {
      type: 'bar',
      name: 'VUS / Conflitante',
      x: xLabels,
      y: bins.map((b) => b.vus),
      marker: { color: '#D97706' },
      hovertemplate: 'Posição: %{x}<br>VUS: %{y}<extra></extra>',
    },
    {
      type: 'bar',
      name: 'Benigna / Potencialmente benigna',
      x: xLabels,
      y: bins.map((b) => b.benign),
      marker: { color: '#16A34A' },
      hovertemplate: 'Posição: %{x}<br>Benigna: %{y}<extra></extra>',
    },
    {
      type: 'bar',
      name: 'Sem classificação',
      x: xLabels,
      y: bins.map((b) => b.other),
      marker: { color: '#A3A3A3' },
      hovertemplate: 'Posição: %{x}<br>Sem classificação: %{y}<extra></extra>',
    },
  ]

  const layout = {
    barmode: 'stack',
    xaxis: {
      title: { text: 'Posição genômica', font: { family: 'Ubuntu', size: 11 } },
      tickfont: { family: 'Ubuntu', size: 9 },
      showticklabels: bins.length < 80,
    },
    yaxis: {
      title: { text: 'Contagem de variantes', font: { family: 'Ubuntu', size: 11 } },
      gridcolor: '#E5E5E5',
      tickfont: { family: 'Ubuntu', size: 10 },
    },
    legend: {
      font: { family: 'Ubuntu', size: 11 },
      orientation: 'h',
      y: -0.25,
    },
    margin: { l: 55, r: 20, t: 20, b: 70 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    font: { family: 'Ubuntu', color: '#171717' },
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'Ubuntu', size: 12 },
    },
  }

  return (
    <div className="card-flat">
      <h3 className="section-title">Distribuição de variantes ao longo do gene</h3>
      <p className="text-xs text-gray-600 mb-2">
        Todas as variantes do Ensembl agrupadas em janelas de 1 kb, coloridas pela classificação do
        ClinVar. Variantes sem curadoria no ClinVar aparecem em cinza.
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
