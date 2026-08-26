import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Plot from 'react-plotly.js'
import { chartColors, baseLayout, withAlpha, CHART_FONT } from '../utils/chartTheme'

// Mapa lollipop das variantes clinicamente classificadas sobre o modelo do gene,
// no padrão dos browsers de variantes raras (por exemplo, gnomAD): eixo alternável entre
// a coordenada genômica e os éxons do transcrito canônico com os íntrons removidos.
// Classificação clínica é estado, então as hastes usam --state-*, nunca slot de série.

const AXIS_PARAM = 'eixo'

// Gap visual entre éxons no eixo exônico, em fração do comprimento exônico total.
// Limitado para que genes com centenas de éxons (TTN) não virem só gaps.
function exonGap(totalLen, nExons) {
  if (nExons < 2) return 0
  return Math.min(Math.max(1, Math.round(totalLen * 0.008)), Math.round((totalLen * 0.25) / (nExons - 1)))
}

function buildExonScale(exons) {
  const totalLen = exons.reduce((sum, e) => sum + (e.end - e.start + 1), 0)
  const gap = exonGap(totalLen, exons.length)
  let cursor = 0
  const mapped = exons.map((e) => {
    const m = { start: e.start, end: e.end, x0: cursor, x1: cursor + (e.end - e.start) }
    cursor = m.x1 + gap
    return m
  })
  const span = mapped[mapped.length - 1].x1
  const mapPos = (pos) => {
    for (const e of mapped) {
      if (pos >= e.start && pos <= e.end) return e.x0 + (pos - e.start)
    }
    return null
  }
  return { mapped, span, mapPos }
}

// Agrega variantes da mesma classe que caem na mesma posição do eixo
function aggregate(rows, toX) {
  const byX = new Map()
  let dropped = 0
  for (const v of rows || []) {
    const x = toX(v.position)
    if (x == null) {
      dropped += 1
      continue
    }
    const cur = byX.get(x)
    if (cur) {
      cur.count += 1
      if (cur.ids.length < 3) cur.ids.push(v.variant_id)
    } else {
      byX.set(x, { x, count: 1, ids: [v.variant_id], position: v.position })
    }
  }
  return { points: Array.from(byX.values()), dropped }
}

export default function ExonVariantMap({ geneData }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const exons = geneData?.exons || []
  const hasExons = exons.length > 0
  const axis = hasExons && searchParams.get(AXIS_PARAM) !== 'genomica' ? 'exons' : 'genomica'

  function setAxis(value) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'genomica') next.set(AXIS_PARAM, 'genomica')
        else next.delete(AXIS_PARAM)
        return next
      },
      { replace: true }
    )
  }

  const built = useMemo(() => {
    if (!geneData) return null
    const classes = [
      { key: 'pathogenic', label: 'Patogênica', rows: geneData.pathogenic_variants, colorKey: 'critical' },
      { key: 'vus', label: 'VUS / Conflitante', rows: geneData.vus_variants, colorKey: 'warning' },
      { key: 'benign', label: 'Benigna', rows: geneData.benign_variants, colorKey: 'good' },
    ].filter((cl) => cl.rows?.length)
    if (!classes.length) return null

    const c = chartColors()
    const exonic = axis === 'exons'
    const scale = exonic ? buildExonScale(exons) : null
    const toX = exonic ? scale.mapPos : (pos) => pos / 1_000_000

    let droppedIntronic = 0
    const series = classes.map((cl) => {
      const { points, dropped } = aggregate(cl.rows, toX)
      droppedIntronic += dropped
      return { ...cl, points }
    })

    const maxCount = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.count)))
    const trackH = Math.max(0.4, maxCount * 0.12)
    const xSpan = exonic
      ? scale.span
      : (geneData.end - geneData.start) / 1_000_000

    const data = []
    for (const s of series) {
      const color = c[s.colorKey]
      const hover = s.points.map((p) => {
        const ids = p.ids.join(', ') + (p.count > p.ids.length ? '…' : '')
        const where = `chr${geneData.chromosome}:${p.position.toLocaleString('pt-BR')}`
        return p.count > 1 ? `${p.count} variantes (${ids})<br>${where}` : `${ids}<br>${where}`
      })
      // Haste do lollipop: barra fina translúcida da cor do estado
      data.push({
        type: 'bar',
        x: s.points.map((p) => p.x),
        y: s.points.map((p) => p.count),
        width: Math.max(xSpan / 900, exonic ? 1 : 0.000003),
        marker: { color: withAlpha(color, 0.25) },
        hoverinfo: 'skip',
        showlegend: false,
        legendgroup: s.key,
      })
      // Cabeça: marcador de vidro, preenchimento translúcido e borda sólida
      data.push({
        type: 'scatter',
        mode: 'markers',
        name: s.label,
        x: s.points.map((p) => p.x),
        y: s.points.map((p) => p.count),
        marker: { size: 5, color: withAlpha(color, 0.45), line: { color, width: 1 } },
        text: hover,
        hovertemplate: '%{text}<extra>' + s.label + '</extra>',
        legendgroup: s.key,
      })
    }

    // Modelo do gene abaixo de y=0: caixas de éxon e, no eixo genômico, a linha do íntron
    const shapes = []
    const annotations = []
    const boxTop = -trackH * 0.35
    const boxBottom = -trackH * 1.15
    // Decisão do usuário: os íntrons ganham vermelho para se destacarem do
    // modelo cinza dos éxons. No eixo exônico viram conectores nos gaps.
    const intronColor = withAlpha(c.critical, 0.6)
    const midY = (boxTop + boxBottom) / 2
    if (exonic) {
      const n = scale.mapped.length
      const labelEvery = Math.max(1, Math.ceil(n / 24))
      scale.mapped.forEach((e, i) => {
        if (i > 0) {
          shapes.push({
            type: 'line',
            x0: scale.mapped[i - 1].x1,
            x1: e.x0,
            y0: midY,
            y1: midY,
            line: { color: intronColor, width: 1.5 },
          })
        }
      })
      scale.mapped.forEach((e, i) => {
        shapes.push({
          type: 'rect',
          x0: e.x0,
          x1: Math.max(e.x1, e.x0 + scale.span / 900),
          y0: boxBottom,
          y1: boxTop,
          fillcolor: withAlpha(c.inkMuted, 0.3),
          line: { color: c.inkMuted, width: 0.5 },
        })
        // Numeração na ordem de transcrição: na fita reversa o éxon 1 é o da direita
        const number = geneData.strand === -1 ? n - i : i + 1
        if ((number - 1) % labelEvery === 0 || n <= 24) {
          annotations.push({
            x: (e.x0 + e.x1) / 2,
            y: boxBottom,
            yshift: -6,
            yanchor: 'top',
            text: String(number),
            showarrow: false,
            font: { family: CHART_FONT, size: 9, color: c.inkMuted },
          })
        }
      })
    } else {
      shapes.push({
        type: 'line',
        x0: geneData.start / 1_000_000,
        x1: geneData.end / 1_000_000,
        y0: midY,
        y1: midY,
        line: { color: intronColor, width: 1.5 },
      })
      for (const e of exons) {
        shapes.push({
          type: 'rect',
          x0: e.start / 1_000_000,
          x1: e.end / 1_000_000,
          y0: boxBottom,
          y1: boxTop,
          fillcolor: withAlpha(c.inkMuted, 0.3),
          line: { color: c.inkMuted, width: 0.5 },
        })
      }
    }

    const layout = {
      ...baseLayout(c),
      barmode: 'overlay',
      shapes,
      annotations,
      xaxis: exonic
        ? {
            title: {
              text: 'Éxons do transcrito canônico (íntrons removidos)',
              font: { family: CHART_FONT, size: 11 },
            },
            showticklabels: false,
            showgrid: false,
            zeroline: false,
            range: [-scale.span * 0.01, scale.span * 1.01],
          }
        : {
            title: {
              text: `Posição em chr${geneData.chromosome} (Mb)`,
              font: { family: CHART_FONT, size: 11 },
            },
            tickfont: { family: CHART_FONT, size: 10 },
            tickformat: '.3f',
            showgrid: false,
            zeroline: false,
            range: [geneData.start / 1_000_000, geneData.end / 1_000_000],
          },
      yaxis: {
        title: { text: 'Variantes na posição', font: { family: CHART_FONT, size: 11 } },
        gridcolor: c.grid,
        tickfont: { family: CHART_FONT, size: 10 },
        dtick: maxCount <= 5 ? 1 : undefined,
        range: [boxBottom - trackH * 0.7, maxCount * 1.2],
        zeroline: false,
      },
      legend: { font: { family: CHART_FONT, size: 11 }, orientation: 'h', y: -0.28 },
      margin: { l: 55, r: 20, t: 12, b: 76 },
    }

    const plotted = series.reduce((sum, s) => sum + s.points.reduce((a, p) => a + p.count, 0), 0)
    return { data, layout, plotted, droppedIntronic }
  }, [geneData, axis, exons])

  if (!geneData || !built) return null

  const sampled =
    (geneData.pathogenic_count || 0) + (geneData.vus_count || 0) + (geneData.benign_count || 0) >
    (geneData.pathogenic_variants?.length || 0) +
      (geneData.vus_variants?.length || 0) +
      (geneData.benign_variants?.length || 0)

  return (
    <section className="card" aria-labelledby="exon-map-title">
      <div className="flex items-center justify-between gap-16 mb-8 flex-wrap">
        <h3 id="exon-map-title" className="section-title">Variantes ao longo do gene</h3>
        {hasExons && (
          <div className="flex items-center gap-8">
            <button
              type="button"
              className="pill pill-sm"
              aria-pressed={axis === 'exons'}
              style={axis === 'exons' ? { borderColor: 'var(--text)' } : undefined}
              onClick={() => setAxis('exons')}
            >
              Éxons
            </button>
            <button
              type="button"
              className="pill pill-sm"
              aria-pressed={axis === 'genomica'}
              style={axis === 'genomica' ? { borderColor: 'var(--text)' } : undefined}
              onClick={() => setAxis('genomica')}
            >
              Genômica
            </button>
          </div>
        )}
      </div>
      <p className="text-12 text-muted mb-8">
        Cada haste marca a posição de uma variante com classificação clínica no ClinVar; a altura
        conta variantes na mesma posição. As caixas cinzas são os éxons
        {geneData.canonical_transcript_id ? (
          <> do transcrito canônico <span className="mono">{geneData.canonical_transcript_id}</span></>
        ) : (
          ' do transcrito canônico'
        )}
        {axis === 'exons'
          ? '; no eixo exônico os íntrons são comprimidos nos conectores vermelhos entre as caixas, como nos browsers de variantes raras.'
          : '; no eixo genômico a linha vermelha entre as caixas são os íntrons.'}
        {sampled &&
          ' Os pontos vêm da amostra de variantes distribuída ao longo do gene, a mesma das tabelas abaixo.'}
        {axis === 'exons' && built.droppedIntronic > 0 && (
          <> {built.droppedIntronic.toLocaleString('pt-BR')} variantes intrônicas ou fora do
          transcrito não aparecem neste eixo.</>
        )}
      </p>
      <Plot
        data={built.data}
        layout={built.layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '340px' }}
      />
    </section>
  )
}
