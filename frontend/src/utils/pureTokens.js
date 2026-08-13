// Resolve tokens do Pure Design para valores computados. Libs de gráfico
// (Plotly, ideogram, NGL) pintam atributos e canvas e não entendem var(--token).

export function pureToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Resolve uma expressão CSS de cor (var(), color-mix, cor relativa) para um
// valor que qualquer lib entende. O probe resolve a expressão no cascade; o
// canvas normaliza o resultado (ex.: oklch) para hex/rgb, que o Plotly aceita.
let probe = null
let ctx = null
export function resolveColor(expression) {
  if (!probe) {
    probe = document.createElement('div')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
  }
  probe.style.color = ''
  probe.style.color = expression
  const computed = getComputedStyle(probe).color
  // fillStyle preserva a serialização moderna (oklch), que o Plotly não lê;
  // pintar um pixel e ler de volta garante rgb numérico.
  if (!ctx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  }
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}
