import { useState } from 'react'
import { ANCESTRY_COLOR, ANCESTRY_SHORT } from './constants'

// Mapa mundial de biobancos numa projecao equiretangular (x pela longitude, y
// pela latitude). Sem geometria de costa (nao ha base geografica disponivel no
// ambiente): grade de meridianos/paralelos e rotulos de continente dao a
// referencia; cada biobanco e um marcador na coordenada real, dimensionado pela
// amostra. Cores estruturais dos tokens Pure Design.
const W = 720
const H = 360
const projX = (lng) => ((lng + 180) / 360) * W
const projY = (lat) => ((90 - lat) / 180) * H

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
  const rMax = Math.max(...biobanks.map((b) => b.sample_size))
  const radius = (n) => 4 + 12 * Math.sqrt(n / rMax)

  return (
    <div className="relative" style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W, display: 'block' }}
        role="img"
        aria-label="Mapa mundial dos biobancos por coordenada geografica"
      >
        <rect x="0" y="0" width={W} height={H}
          style={{ fill: 'var(--dim)' }} rx="8" />

        {/* grade: meridianos a cada 30 e paralelos a cada 30 */}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => (
          <line key={`m${lng}`} x1={projX(lng)} x2={projX(lng)} y1={0} y2={H}
            style={{ stroke: 'var(--border)' }} strokeWidth="1" opacity="0.4" />
        ))}
        {[60, 30, 0, -30, -60].map((lat) => (
          <line key={`p${lat}`} x1={0} x2={W} y1={projY(lat)} y2={projY(lat)}
            style={{ stroke: 'var(--border)' }} strokeWidth="1" opacity="0.4" />
        ))}
        {/* equador um pouco mais marcado */}
        <line x1={0} x2={W} y1={projY(0)} y2={projY(0)}
          style={{ stroke: 'var(--border)' }} strokeWidth="1.5" opacity="0.7" />

        {CONTINENTS.map((c) => (
          <text key={c.label} x={projX(c.lng)} y={projY(c.lat)} textAnchor="middle"
            style={{ fill: 'var(--muted)', font: '11px Ubuntu, system-ui, sans-serif' }}
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
              strokeWidth="2" opacity="0.85"
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
          top: `calc(${(tip.y / H) * 100}% + 8px)`,
          pointerEvents: 'none', padding: '8px 12px', zIndex: 5, minWidth: 180,
        }}>
          <p className="text-13 font-medium text-text">{tip.b.name}</p>
          <p className="text-12">{tip.b.country} · {fmtN(tip.b.sample_size)} amostras</p>
          <p className="text-11 text-muted mt-4">
            {Object.entries(tip.b.ancestry_n || {})
              .sort((a, c) => c[1] - a[1]).slice(0, 3)
              .map(([k, v]) => `${ANCESTRY_SHORT[k] || k}: ${fmtN(v)}`).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
