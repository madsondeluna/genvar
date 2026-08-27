import { useEffect, useRef, useState } from 'react'
import { ANCESTRY_COLOR, ANCESTRY_SHORT } from './constants'

// Mapa mundial de biobancos numa projecao equiretangular (x pela longitude, y
// pela latitude). Sem geometria de costa (nao ha base geografica disponivel no
// ambiente): grade de meridianos/paralelos e rotulos de continente dao a
// referencia; cada biobanco e um marcador na coordenada real, dimensionado pela
// amostra. Cores estruturais dos tokens Pure Design.
//
// O mapa ocupa a largura inteira do cartao. Ficava travado em 720px dentro de um
// contentor de 1182, deixando 462px vazios a direita. Para caber sem virar uma
// faixa alta demais, a janela corta as calotas polares, que nao tem biobanco
// nenhum: sobra a America do Sul, a Africa e a Oceania, e sao justamente elas
// que sustentam a leitura, porque a ausencia de marcador ali e o achado.
const W = 720
const H = 360
const projX = (lng) => ((lng + 180) / 360) * W
const projY = (lat) => ((90 - lat) / 180) * H

// Janela visivel: latitude 78N a 56S. Recorte de terra habitada, nao de dado.
const VB_TOPO = projY(78)
const VB_ALTURA = projY(-56) - projY(78)

// Tamanhos em PIXEL DE TELA, nao em unidade de viewBox. O SVG escala com o
// contentor, entao um texto de 11 unidades vira 18px num cartao de 1182 e 6px
// num celular de 375: ilegivel nas duas pontas por motivos opostos. O fator k
// converte pixel de tela para unidade de viewBox a cada medida.
const FONTE_ROTULO = 11
const RAIO_MIN = 5
const RAIO_MAX = 13
const TRACO_MARCADOR = 1.5

// Abaixo desta largura os rotulos de continente colidem: "America do Norte" mede
// ~95px em 11px, e num mapa de 340px o setor da America do Norte tem ~70px. Some
// o rotulo em vez de encolher a fonte, porque fonte menor nesse tamanho nao e
// legivel de qualquer jeito, e o marcador sozinho continua dizendo onde esta.
const LARGURA_MIN_ROTULOS = 640

const CONTINENTS = [
  { label: 'América do Norte', lat: 44, lng: -100 },
  { label: 'América do Sul', lat: -14, lng: -60 },
  { label: 'Europa', lat: 54, lng: 15 },
  { label: 'África', lat: 2, lng: 20 },
  { label: 'Ásia', lat: 46, lng: 90 },
  { label: 'Oceania', lat: -25, lng: 134 },
]

const fmtN = (n) => (n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n))

function dominant(anc) {
  let best = null, bv = -1
  for (const [k, v] of Object.entries(anc || {})) if (v > bv) { bv = v; best = k }
  return best
}

export default function BiobankMap({ biobanks }) {
  const [tip, setTip] = useState(null)
  const [largura, setLargura] = useState(W)
  const wrapRef = useRef(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const obs = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      if (w > 0) setLargura(w)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Unidade de viewBox por pixel de tela.
  const k = W / largura

  const rMax = Math.max(...biobanks.map((b) => b.sample_size))
  const radius = (n) => (RAIO_MIN + (RAIO_MAX - RAIO_MIN) * Math.sqrt(n / rMax)) * k

  return (
    <div ref={wrapRef} className="relative" style={{ width: '100%' }}>
      <svg
        viewBox={`0 ${VB_TOPO} ${W} ${VB_ALTURA}`}
        width="100%"
        style={{ display: 'block' }}
        role="img"
        aria-label="Mapa mundial dos biobancos por coordenada geografica"
      >
        <rect x="0" y={VB_TOPO} width={W} height={VB_ALTURA}
          style={{ fill: 'var(--dim)' }} rx={8 * k} />

        {/* grade: meridianos a cada 30 e paralelos a cada 30 */}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => (
          <line key={`m${lng}`} x1={projX(lng)} x2={projX(lng)} y1={VB_TOPO} y2={VB_TOPO + VB_ALTURA}
            style={{ stroke: 'var(--border)' }} strokeWidth={k} opacity="0.4" />
        ))}
        {[60, 30, 0, -30].map((lat) => (
          <line key={`p${lat}`} x1={0} x2={W} y1={projY(lat)} y2={projY(lat)}
            style={{ stroke: 'var(--border)' }} strokeWidth={k} opacity="0.4" />
        ))}
        {/* equador um pouco mais marcado */}
        <line x1={0} x2={W} y1={projY(0)} y2={projY(0)}
          style={{ stroke: 'var(--border)' }} strokeWidth={1.5 * k} opacity="0.7" />

        {largura >= LARGURA_MIN_ROTULOS && CONTINENTS.map((c) => (
          <text key={c.label} x={projX(c.lng)} y={projY(c.lat)} textAnchor="middle"
            style={{ fill: 'var(--muted)', fontSize: FONTE_ROTULO * k, fontFamily: 'Ubuntu, system-ui, sans-serif' }}
            opacity="0.8">{c.label}</text>
        ))}

        {biobanks.map((b) => {
          const cx = projX(b.lng), cy = projY(b.lat)
          const r = radius(b.sample_size)
          const col = ANCESTRY_COLOR[dominant(b.ancestry_n)] || 'var(--accent)'
          return (
            <circle
              key={b.id} cx={cx} cy={cy} r={r}
              style={{ fill: col, stroke: 'var(--surface)', cursor: 'pointer' }}
              strokeWidth={TRACO_MARCADOR * k} opacity="0.85"
              onMouseEnter={() => setTip({ x: cx, y: cy, b })}
              onMouseLeave={() => setTip(null)}
            />
          )
        })}
      </svg>

      {tip && (
        <div className="card" style={{
          position: 'absolute',
          left: `min(${(tip.x / W) * 100}%, calc(100% - 220px))`,
          top: `calc(${((tip.y - VB_TOPO) / VB_ALTURA) * 100}% + 8px)`,
          pointerEvents: 'none', padding: '8px 12px', zIndex: 5, minWidth: 180,
        }}>
          <p className="text-13 font-medium text-text">{tip.b.name}</p>
          <p className="text-12">{tip.b.country} · {fmtN(tip.b.sample_size)} amostras</p>
          <p className="text-11 text-muted mt-4">
            {Object.entries(tip.b.ancestry_n || {})
              .sort((a, c) => c[1] - a[1]).slice(0, 3)
              .map(([k2, v]) => `${ANCESTRY_SHORT[k2] || k2}: ${fmtN(v)}`).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
