import { useEffect, useRef, useState } from 'react'
import { resolveColor } from '../utils/pureTokens'
import { LP_CAUCHY, LP_BONFERRONI } from './constants'

// Manhattan plot em canvas: x = posicao genomica do gene, y = -log10(p).
// Cores resolvidas dos tokens Pure Design; linhas de limiar de significancia;
// hover com tooltip. Escala linear inline (sem libs).
const H = 300
const M = { top: 16, right: 16, bottom: 28, left: 48 }

function scaleLinear(d0, d1, r0, r1) {
  const s = (r1 - r0) / (d1 - d0 || 1)
  return (v) => r0 + (v - d0) * s
}

export default function ManhattanPlot({ points, genes, layout, phenos, onSelect }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const marksRef = useRef([])
  const [width, setWidth] = useState(900)
  const [tip, setTip] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = Math.max(320, Math.floor(entries[0].contentRect.width))
      setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, H)

    const col = {
      grid: resolveColor('var(--border)'),
      ink: resolveColor('var(--muted)'),
      bandA: resolveColor('var(--accent)'),
      bandB: resolveColor('color-mix(in srgb, var(--accent) 42%, var(--surface))'),
      cauchy: resolveColor('var(--state-serious)'),
      bonf: resolveColor('var(--state-critical)'),
    }

    const maxLp = Math.max(LP_BONFERRONI + 1, ...points.map((p) => p.lp), 8) * 1.05
    const x = scaleLinear(0, layout.total, M.left, width - M.right)
    const y = scaleLinear(0, maxLp, H - M.bottom, M.top)

    // grade + eixo y
    ctx.strokeStyle = col.grid
    ctx.fillStyle = col.ink
    ctx.font = '11px Ubuntu, system-ui, sans-serif'
    ctx.lineWidth = 1
    const step = maxLp > 200 ? 50 : maxLp > 100 ? 25 : maxLp > 40 ? 10 : maxLp > 20 ? 5 : maxLp > 10 ? 2 : 1
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let v = 0; v <= maxLp; v += step) {
      const yy = y(v)
      ctx.globalAlpha = 0.5
      ctx.beginPath(); ctx.moveTo(M.left, yy); ctx.lineTo(width - M.right, yy); ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillText(String(v), M.left - 6, yy)
    }

    // linhas de limiar
    for (const [lp, color] of [[LP_CAUCHY, col.cauchy], [LP_BONFERRONI, col.bonf]]) {
      const yy = y(lp)
      ctx.strokeStyle = color
      ctx.setLineDash(lp === LP_CAUCHY ? [7, 4] : [2, 4])
      ctx.beginPath(); ctx.moveTo(M.left, yy); ctx.lineTo(width - M.right, yy); ctx.stroke()
    }
    ctx.setLineDash([])

    // pontos, cor alternada por cromossomo
    const marks = []
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const gp = layout.pos(p.geneIdx)
      if (gp == null) continue
      const sx = x(gp)
      const sy = y(p.lp)
      const chrIdx = Number(genes.chr[p.geneIdx]) || 0
      ctx.fillStyle = chrIdx % 2 === 0 ? col.bandB : col.bandA
      ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, Math.PI * 2); ctx.fill()
      marks.push({ sx, sy, i })
    }
    marksRef.current = marks

    // rotulos dos cromossomos
    ctx.fillStyle = col.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const c of layout.centers) {
      ctx.fillText(c.chr, x(c.x), H - M.bottom + 6)
    }
    // rotulo do eixo y
    ctx.save()
    ctx.translate(12, (H - M.bottom + M.top) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('-log10(p)', 0, 0)
    ctx.restore()
  }, [points, genes, layout, width])

  function onMove(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let best = null
    let bd = 64 // 8px de raio ao quadrado
    for (const m of marksRef.current) {
      const dx = m.sx - mx, dy = m.sy - my
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = m }
    }
    if (best) {
      const p = points[best.i]
      const g = genes.symbols[p.geneIdx]
      const ph = phenos?.[p.phenoIdx]?.name || ''
      // Abaixo de 4,9e-324 o double satura: o que se pode dizer é o limite.
      const pval = p.lp >= 320 ? '< 1e-320' : Math.pow(10, -p.lp).toExponential(1)
      setTip({
        x: best.sx, y: best.sy,
        text: `${g}${ph ? ' · ' + ph : ''} · p=${pval}`,
        i: best.i,
      })
    } else if (tip) {
      setTip(null)
    }
  }

  function onClick() {
    if (tip && onSelect) onSelect(points[tip.i])
  }

  return (
    <div ref={wrapRef} className="relative" style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: H, cursor: tip ? 'pointer' : 'default', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
        onClick={onClick}
        role="img"
        aria-label="Manhattan plot das associacoes gene-fenotipo por burden"
      />
      {tip && (
        <div
          className="card"
          style={{
            position: 'absolute', left: Math.min(tip.x + 8, width - 220), top: Math.max(0, tip.y - 40),
            pointerEvents: 'none', padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', zIndex: 5,
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  )
}
