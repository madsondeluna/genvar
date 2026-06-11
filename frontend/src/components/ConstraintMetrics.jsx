// Orientação unificada: toda barra preenche de tolerante (vazia, verde) para restrito
// (cheia, vermelha), independente da matemática de cada métrica. "fill" é a posição 0..1
// no espectro de restrição; as bordas das faixas caem exatamente em 1/3 e 2/3, então o
// comprimento da barra sempre concorda com a cor. Cada métrica mapeia seu valor bruto para
// esse espectro por pontos de ancoragem (extremo tolerante -> 0, extremo restrito -> 1).
//
// Faixas (mesmos limiares do gnomAD):
//   pLI:   >= 0.9 restrito, >= 0.1 intermediário, < 0.1 tolerante
//   LOEUF: <= 0.35 restrito, <= 0.6 intermediário, > 0.6 tolerante
//   lofz:  >= 3.09 restrito, >= 1 intermediário, < 1 tolerante (pode ser negativo)
//   o/e:   <= 0.5 restrito, <= 0.8 intermediário, > 0.8 tolerante

const ANCHORS = {
  // valor crescente = mais restrito
  pli: [{ v: 0, f: 0 }, { v: 0.1, f: 1 / 3 }, { v: 0.9, f: 2 / 3 }, { v: 1, f: 1 }],
  lofz: [{ v: -4, f: 0 }, { v: 1, f: 1 / 3 }, { v: 3.09, f: 2 / 3 }, { v: 8, f: 1 }],
  // valor decrescente = mais restrito
  loeuf: [{ v: 4, f: 0 }, { v: 0.6, f: 1 / 3 }, { v: 0.35, f: 2 / 3 }, { v: 0, f: 1 }],
  oe: [{ v: 2, f: 0 }, { v: 0.8, f: 1 / 3 }, { v: 0.5, f: 2 / 3 }, { v: 0, f: 1 }],
}

// Interpolação linear por partes sobre pontos monotônicos em v (crescentes ou decrescentes).
// Retorna fill em [0, 1], saturando nos extremos: nunca estoura nem fica negativo.
function constraintFill(value, metric) {
  const pts = ANCHORS[metric]
  if (!pts || value == null) return 0
  const first = pts[0]
  const last = pts[pts.length - 1]
  const ascending = last.v > first.v
  if (ascending) {
    if (value <= first.v) return first.f
    if (value >= last.v) return last.f
  } else {
    if (value >= first.v) return first.f
    if (value <= last.v) return last.f
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const lo = Math.min(a.v, b.v)
    const hi = Math.max(a.v, b.v)
    if (value >= lo && value <= hi) {
      const frac = (value - a.v) / (b.v - a.v)
      return a.f + frac * (b.f - a.f)
    }
  }
  return last.f
}

function constraintBand(value, metric) {
  if (value == null) {
    return { label: 'Indisponível', bar: '#E5E5E5', text: 'text-gray-400', bg: 'bg-gray-100' }
  }
  let band
  if (metric === 'pli') band = value >= 0.9 ? 'res' : value >= 0.1 ? 'int' : 'tol'
  else if (metric === 'lofz') band = value >= 3.09 ? 'res' : value >= 1 ? 'int' : 'tol'
  else if (metric === 'loeuf') band = value <= 0.35 ? 'res' : value <= 0.6 ? 'int' : 'tol'
  else band = value <= 0.5 ? 'res' : value <= 0.8 ? 'int' : 'tol'

  if (band === 'res') return { label: 'Altamente restrito', bar: '#DC2626', text: 'text-red-600', bg: 'bg-red-50' }
  if (band === 'int') return { label: 'Intermediário', bar: '#D97706', text: 'text-amber-600', bg: 'bg-amber-50' }
  return { label: 'Tolerante', bar: '#16A34A', text: 'text-green-600', bg: 'bg-green-50' }
}

function MetricBar({ label, value, metric, description }) {
  const band = constraintBand(value, metric)
  const pct = value != null ? constraintFill(value, metric) * 100 : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="label">{label}</span>
          {value != null && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${band.bg} ${band.text}`}>
              {band.label}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold text-gray-700">
          {value != null ? value.toFixed(4) : 'Indisponível'}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: band.bar }}
        />
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}

function ScoreGauge({ label, value, metric, interpretation }) {
  const band = constraintBand(value, metric)
  const pct = value != null ? constraintFill(value, metric) * 100 : 0

  return (
    <div className={`rounded-lg border p-4 ${value != null ? band.bg : 'bg-gray-50'} border-gray-200`}>
      <p className="label mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${value != null ? band.text : 'text-gray-300'}`}>
        {value != null ? value.toFixed(4) : 'Indisponível'}
      </p>
      <p className={`text-xs font-medium mt-1 ${value != null ? band.text : 'text-gray-400'}`}>
        {value != null ? band.label : 'Não disponível'}
      </p>
      <div className="mt-3 h-1.5 bg-white bg-opacity-60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: band.bar }}
        />
      </div>
      {interpretation && <p className="text-xs text-gray-500 mt-2">{interpretation}</p>}
    </div>
  )
}

// Escala direcional: orienta a leitura de todas as barras antes dos números.
function DirectionScale() {
  return (
    <div className="mb-4">
      <div
        className="h-2 rounded-full"
        style={{ background: 'linear-gradient(to right, #16A34A, #D97706, #DC2626)' }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-500">Tolerante (barra vazia)</span>
        <span className="text-xs text-gray-500">Altamente restrito (barra cheia)</span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Todas as barras seguem esta direção: quanto mais cheia e mais vermelha, mais restrito o
        gene. Genes tolerantes ficam com a barra curta e verde.
      </p>
    </div>
  )
}

export default function ConstraintMetrics({ data }) {
  if (!data) return null

  const { lof_z_score, oe_lof, oe_lof_upper, oe_mis } = data

  return (
    <div className="card-flat">
      <div className="flex items-start justify-between mb-1">
        <h3 className="section-title mb-0">Métricas de restrição</h3>
        <span className="text-xs text-gray-500">gnomAD r4</span>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        Mostra se o gene tolera perder função. Variantes de perda de função (LoF) desligam o produto
        do gene; genes importantes acumulam bem menos dessas variantes do que o esperado por acaso, e
        são ditos restritos. Quanto mais restrito, maior a chance de uma mutação grave ali causar
        doença. Métricas calculadas pelo gnomAD (r4).
      </p>

      <div className="mb-4 rounded-md bg-gray-50 border border-gray-200 p-3">
        <p className="text-xs text-gray-700">
          <span className="font-semibold">O que é LoF:</span> sigla de loss of function (perda de
          função). É uma mutação que inativa o gene, fazendo-o parar de produzir sua proteína normal.
          Genes em que perder a função causa doença tendem a acumular poucas variantes LoF na
          população saudável.
        </p>
      </div>

      <DirectionScale />

      <div className="mb-5">
        <ScoreGauge
          label="LOEUF (limite superior da razão observado/esperado de LoF)"
          value={oe_lof_upper}
          metric="loeuf"
          interpretation="Quanto menor, menos o gene tolera perder função. Formalmente: limite superior do intervalo de confiança da razão observado/esperado para LoF; abaixo de 0,35 indica restrição forte."
        />
      </div>

      <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-gray-100">
        <MetricBar
          label="Z-score de LoF"
          value={lof_z_score}
          metric="lofz"
          description="Maior = o gene evita mais as variantes que o desligam. Formalmente: z-score do déficit de variantes LoF observadas vs. esperadas; acima de 3,09 indica restrição. Valores negativos indicam mais LoF do que o esperado."
        />
        <MetricBar
          label="o/e LoF"
          value={oe_lof}
          metric="oe"
          description="Menor = o gene tolera menos perder função. Formalmente: variantes de LoF observadas divididas pelas esperadas (o/e); abaixo de 0,5 indica restrição forte. Acima de 1 há mais LoF do que o esperado."
        />
        <MetricBar
          label="o/e Missense"
          value={oe_mis}
          metric="oe"
          description="Menor = o gene tolera menos trocas de aminoácido. Formalmente: variantes missense observadas divididas pelas esperadas (o/e); perto de 1 indica tolerância."
        />
      </div>
    </div>
  )
}
