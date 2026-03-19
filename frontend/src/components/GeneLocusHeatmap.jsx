import Plot from 'react-plotly.js'

function buildBins(variants, geneStart, geneEnd, binSizeKb = 1) {
  const binSize = binSizeKb * 1000
  const numBins = Math.max(1, Math.ceil((geneEnd - geneStart) / binSize))
  const bins = Array.from({ length: numBins }, (_, i) => ({
    start: geneStart + i * binSize,
    pathogenic: 0,
    vus: 0,
    benign: 0,
  }))

  const allVariants = [
    ...variants.pathogenic_variants.map((v) => ({ ...v, category: 'pathogenic' })),
    ...variants.vus_variants.map((v) => ({ ...v, category: 'vus' })),
    ...variants.benign_variants.map((v) => ({ ...v, category: 'benign' })),
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
    geneData.benign_variants?.length

  if (!hasVariants) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Variant Distribution Along Gene</h3>
        <p className="text-sm text-gray-400">No classified variants available for this gene.</p>
      </div>
    )
  }

  const bins = buildBins(geneData, geneData.start, geneData.end)
  const xLabels = bins.map((b) => `${Math.round(b.start / 1000)}kb`)

  const data = [
    {
      type: 'bar',
      name: 'Pathogenic / Likely Pathogenic',
      x: xLabels,
      y: bins.map((b) => b.pathogenic),
      marker: { color: '#DC2626' },
      hovertemplate: 'Position: %{x}<br>Pathogenic: %{y}<extra></extra>',
    },
    {
      type: 'bar',
      name: 'VUS / Conflicting',
      x: xLabels,
      y: bins.map((b) => b.vus),
      marker: { color: '#D97706' },
      hovertemplate: 'Position: %{x}<br>VUS: %{y}<extra></extra>',
    },
    {
      type: 'bar',
      name: 'Benign / Likely Benign',
      x: xLabels,
      y: bins.map((b) => b.benign),
      marker: { color: '#16A34A' },
      hovertemplate: 'Position: %{x}<br>Benign: %{y}<extra></extra>',
    },
  ]

  const layout = {
    barmode: 'stack',
    xaxis: {
      title: { text: 'Genomic Position', font: { family: 'Geist Mono', size: 11 } },
      tickfont: { family: 'Geist Mono', size: 9 },
      showticklabels: bins.length < 80,
    },
    yaxis: {
      title: { text: 'Variant Count', font: { family: 'Geist Mono', size: 11 } },
      gridcolor: '#E5E5E5',
      tickfont: { family: 'Geist Mono', size: 10 },
    },
    legend: {
      font: { family: 'Geist Mono', size: 11 },
      orientation: 'h',
      y: -0.25,
    },
    margin: { l: 55, r: 20, t: 20, b: 70 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    font: { family: 'Geist Mono', color: '#171717' },
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#D4D4D4',
      font: { family: 'Geist Mono', size: 12 },
    },
  }

  return (
    <div className="card-flat">
      <h3 className="section-title">Variant Distribution Along Gene</h3>
      <p className="text-xs text-gray-400 mb-2">
        Variants classified by ClinVar grouped into 1kb bins.
        chr{geneData.chromosome}:{geneData.start.toLocaleString()}-{geneData.end.toLocaleString()}
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
