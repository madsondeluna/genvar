// Forest plot cross-ancestry (SVG desenhado a mao, sem libs). Cada linha e uma
// ancestria: quadrado no beta (efeito), reta no IC de 95%, cor da ancestria. O
// losango e a meta-analise (linha 'All'). A reta vertical marca o efeito nulo.
// Cores estruturais vem de tokens Pure Design; a cor da ancestria e categorica.
const M = { top: 12, right: 16, bottom: 34, left: 120, rowH: 30 }
const PLOT_W = 280 // largura da area de plot dentro do viewBox
const VALUE_X = M.left + PLOT_W + 20
const VALUE_W = 172 // espaco do rotulo beta [IC] a direita

function scale(d0, d1, r0, r1) {
  const s = (r1 - r0) / (d1 - d0 || 1)
  return (v) => r0 + (v - d0) * s
}

const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(3)

export default function ForestPlot({ studies, meta }) {
  const rows = [...studies, meta].filter(Boolean)
  if (rows.length === 0) return null

  const lo = Math.min(0, ...rows.map((r) => r.lo))
  const hi = Math.max(0, ...rows.map((r) => r.hi))
  const pad = (hi - lo) * 0.08 || 0.1
  const x = scale(lo - pad, hi + pad, M.left, M.left + PLOT_W)

  const bodyH = rows.length * M.rowH
  const height = M.top + bodyH + M.bottom
  const viewW = VALUE_X + VALUE_W

  // pesos para dimensionar o quadrado (inverso da variancia), normalizados.
  const weights = studies.map((s) => 1 / (s.se * s.se))
  const wMax = Math.max(...weights, 1)
  const sizeOf = (se) => {
    const w = 1 / (se * se)
    return 4 + 5 * Math.sqrt(w / wMax) // 4..9 px de meia-aresta
  }

  const x0 = x(0)
  const ticks = niceTicks(lo - pad, hi + pad, 5)

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${viewW} ${height}`}
        width="100%"
        style={{ maxWidth: viewW, display: 'block' }}
        role="img"
        aria-label="Forest plot do efeito por ancestria com intervalo de confianca de 95%"
      >
        {/* grade de ticks do eixo x */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + bodyH}
              style={{ stroke: 'var(--border)' }} strokeWidth="1" opacity="0.5"
            />
            <text
              x={x(t)} y={M.top + bodyH + 16} textAnchor="middle"
              style={{ fill: 'var(--muted)', font: '11px Ubuntu, system-ui, sans-serif' }}
            >{t}</text>
          </g>
        ))}

        {/* linha do efeito nulo */}
        <line
          x1={x0} x2={x0} y1={M.top} y2={M.top + bodyH}
          style={{ stroke: 'var(--muted)' }} strokeWidth="1.5" strokeDasharray="3 3"
        />
        <text
          x={x0} y={M.top + bodyH + 30} textAnchor="middle"
          style={{ fill: 'var(--muted)', font: '11px Ubuntu, system-ui, sans-serif' }}
        >beta (efeito)</text>

        {rows.map((r, i) => {
          const cy = M.top + i * M.rowH + M.rowH / 2
          const half = r.isMeta ? 7 : sizeOf(r.se)
          return (
            <g key={r.anc}>
              <text
                x={M.left - 12} y={cy} textAnchor="end" dominantBaseline="middle"
                style={{
                  fill: 'var(--text)',
                  font: `${r.isMeta ? '600 ' : ''}12px Ubuntu, system-ui, sans-serif`,
                }}
              >{r.label}</text>

              {/* reta do IC */}
              <line
                x1={x(r.lo)} x2={x(r.hi)} y1={cy} y2={cy}
                style={{ stroke: r.color }} strokeWidth={r.isMeta ? 2 : 1.5}
              />

              {r.isMeta ? (
                // losango da meta-analise
                <path
                  d={`M ${x(r.beta)} ${cy - half} L ${x(r.hi)} ${cy} L ${x(r.beta)} ${cy + half} L ${x(r.lo)} ${cy} Z`}
                  style={{ fill: r.color }}
                />
              ) : (
                <rect
                  x={x(r.beta) - half} y={cy - half} width={half * 2} height={half * 2}
                  style={{ fill: r.color }}
                />
              )}

              <text
                x={VALUE_X} y={cy} dominantBaseline="middle"
                style={{
                  fill: 'var(--text)',
                  font: '11px Ubuntu, system-ui, sans-serif',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >{`${fmt(r.beta)} [${fmt(r.lo)}, ${fmt(r.hi)}]`}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ticks arredondados para o eixo do efeito.
function niceTicks(lo, hi, target) {
  const span = hi - lo || 1
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const start = Math.ceil(lo / step) * step
  const out = []
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(3)))
  return out
}
