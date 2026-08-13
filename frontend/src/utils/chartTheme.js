import { pureToken, resolveColor } from './pureTokens'

// Tema Plotly derivado dos tokens do Pure Design.
// Tipos e rótulos de dados usam a família mono, como o resto dos metadados.

export const CHART_FONT = "'Ubuntu', sans-serif"

export function chartColors() {
  return {
    ink: pureToken('--chart-ink'),
    inkMuted: pureToken('--chart-ink-muted'),
    grid: pureToken('--chart-grid'),
    surface: pureToken('--surface'),
    bg: pureToken('--bg'),
    dim: pureToken('--dim'),
    border: pureToken('--border'),
    text: pureToken('--text'),
    muted: pureToken('--muted'),
    good: resolveColor('var(--state-good)'),
    warning: resolveColor('var(--state-warning)'),
    serious: resolveColor('var(--state-serious)'),
    critical: resolveColor('var(--state-critical)'),
    series: Array.from({ length: 8 }, (_, i) => pureToken(`--chart-${i + 1}`)),
    seq: Array.from({ length: 7 }, (_, i) => pureToken(`--seq-${i + 1}`)),
    div: Array.from({ length: 9 }, (_, i) => pureToken(`--div-${i + 1}`)),
  }
}

// Cor (hex ou rgb) -> "rgba(r, g, b, a)": o vidro dos gráficos é preenchimento
// translúcido com borda sólida da mesma cor, já que SVG não tem backdrop-filter.
export function withAlpha(color, alpha) {
  let r, g, b
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex
    r = parseInt(full.slice(0, 2), 16)
    g = parseInt(full.slice(2, 4), 16)
    b = parseInt(full.slice(4, 6), 16)
  } else {
    const m = color.match(/\d+/g)
    if (!m) return color
    ;[r, g, b] = m
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Slots categóricos por população, atribuídos em sequência fixa, nunca ciclados.
// A nona população (AMI) fica fora dos oito slots e recebe tinta neutra.
const POP_SLOT_ORDER = ['AFR', 'NFE', 'EAS', 'SAS', 'AMR', 'ASJ', 'FIN', 'MID']

export function populationColor(code, c) {
  const idx = POP_SLOT_ORDER.indexOf(code)
  return idx >= 0 ? c.series[idx] : c.inkMuted
}

export function baseLayout(c) {
  return {
    paper_bgcolor: c.surface,
    plot_bgcolor: c.surface,
    font: { family: CHART_FONT, color: c.inkMuted, size: 11 },
    hoverlabel: {
      bgcolor: c.bg,
      bordercolor: c.border,
      font: { family: CHART_FONT, size: 12, color: c.text },
    },
  }
}
