// Predições de patogenicidade apresentadas como uma barra por preditor (0 = benigno, 1 = dano).
// Cada preditor traz seu próprio veredito em palavra, a cor da faixa e o valor bruto, para
// leitura direta por leigos. A barra é o score normalizado; o número à direita é o valor bruto.

const RED = { color: '#DC2626', text: 'text-red-600', bg: 'bg-red-50', damaging: true }
const AMBER = { color: '#D97706', text: 'text-amber-600', bg: 'bg-amber-50', damaging: true }
const GREEN = { color: '#16A34A', text: 'text-green-600', bg: 'bg-green-50', damaging: false }

const PREDICTORS = [
  {
    key: 'SIFT',
    description:
      'Sorting Intolerant from Tolerant. Prevê se a troca de aminoácido afeta a função da proteína. Quanto menor o valor bruto, mais provável o dano.',
    normalize: (s) => (s == null ? null : 1 - s),
    rawDisplay: (s) => s.toFixed(3),
    verdict: (s) => (s < 0.05 ? { ...RED, label: 'Deletério' } : { ...GREEN, label: 'Tolerado' }),
    thresholds: [
      { color: '#DC2626', label: 'Deletério (< 0,05)' },
      { color: '#16A34A', label: 'Tolerado (> 0,05)' },
    ],
  },
  {
    key: 'PolyPhen',
    description:
      'Polymorphism Phenotyping v2. Prevê o impacto da mutação na estrutura da proteína. Quanto maior o valor bruto, mais provável o dano.',
    normalize: (s) => s,
    rawDisplay: (s) => s.toFixed(3),
    verdict: (s) =>
      s > 0.908
        ? { ...RED, label: 'Provavelmente deletério' }
        : s >= 0.446
          ? { ...AMBER, label: 'Possivelmente deletério' }
          : { ...GREEN, label: 'Benigno' },
    thresholds: [
      { color: '#DC2626', label: 'Provavelmente deletério (> 0,908)' },
      { color: '#D97706', label: 'Possivelmente deletério (0,446 - 0,908)' },
      { color: '#16A34A', label: 'Benigno (< 0,446)' },
    ],
  },
  {
    key: 'CADD',
    description:
      'Combined Annotation Dependent Depletion. Integra várias anotações num score Phred. A barra é o Phred dividido por 40.',
    normalize: (s) => (s == null ? null : Math.min(1, s / 40)),
    rawDisplay: (s) => `${s.toFixed(1)} Phred`,
    verdict: (s) =>
      s > 20
        ? { ...RED, label: 'Alto impacto' }
        : s >= 10
          ? { ...AMBER, label: 'Moderado' }
          : { ...GREEN, label: 'Baixo impacto' },
    thresholds: [
      { color: '#DC2626', label: 'Alto impacto (Phred > 20)' },
      { color: '#D97706', label: 'Moderado (Phred 10 - 20)' },
      { color: '#16A34A', label: 'Baixo impacto (Phred < 10)' },
    ],
  },
  {
    key: 'REVEL',
    description:
      'Rare Exome Variant Ensemble Learner. Score agregado para variantes missense raras. Quanto maior, mais provável a patogenicidade.',
    normalize: (s) => s,
    rawDisplay: (s) => s.toFixed(3),
    verdict: (s) =>
      s > 0.5
        ? { ...RED, label: 'Potencialmente patogênica' }
        : { ...GREEN, label: 'Potencialmente benigna' },
    thresholds: [
      { color: '#DC2626', label: 'Potencialmente patogênica (> 0,5)' },
      { color: '#16A34A', label: 'Potencialmente benigna (< 0,5)' },
    ],
  },
]

function overallVerdict(avgScore) {
  if (avgScore == null) return null
  if (avgScore >= 0.6) return { text: 'Potencialmente patogênica', cls: 'text-red-600 bg-red-50' }
  if (avgScore >= 0.3) return { text: 'Incerta', cls: 'text-amber-600 bg-amber-50' }
  return { text: 'Potencialmente benigna', cls: 'text-green-600 bg-green-50' }
}

export default function PredictionScoresRadar({ sift, polyphen, cadd, revel }) {
  const raw = { SIFT: sift, PolyPhen: polyphen, CADD: cadd, REVEL: revel }

  const rows = PREDICTORS.map((p) => {
    const value = raw[p.key]
    if (value == null) return { ...p, available: false }
    return {
      ...p,
      available: true,
      norm: p.normalize(value),
      band: p.verdict(value),
      rawText: p.rawDisplay(value),
    }
  })

  const present = rows.filter((r) => r.available)
  const hasAny = present.length > 0
  const avgScore = hasAny ? present.reduce((a, r) => a + r.norm, 0) / present.length : null
  const damagingCount = present.filter((r) => r.band.damaging).length
  const verdict = overallVerdict(avgScore)

  if (!hasAny) {
    return (
      <div className="card-flat">
        <h3 className="section-title">Predições de patogenicidade</h3>
        <p className="text-sm text-gray-500">Nenhum score de predição disponível para esta variante.</p>
      </div>
    )
  }

  return (
    <div className="card-flat">
      <div className="flex items-center justify-between mb-1">
        <h3 className="section-title mb-0">Predições de patogenicidade</h3>
        {verdict && (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${verdict.cls}`}>
            {verdict.text}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 mb-3">
        Cada barra vai de 0 (benigno, verde) a 1 (dano, vermelho). O número à direita é o valor bruto
        do preditor. {damagingCount} de {present.length}{' '}
        {present.length === 1 ? 'preditor disponível indica' : 'preditores disponíveis indicam'} dano.
      </p>

      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className={`flex flex-col gap-1.5 py-4 ${i > 0 ? 'border-t border-gray-100' : 'pt-0'}`}
          >
            <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">{r.key}</span>
              <div className="min-w-0">
                {r.available ? (
                  <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${r.band.bg} ${r.band.text}`}>
                    {r.band.label}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Sem dado</span>
                )}
              </div>
              <span className="text-xs font-semibold text-gray-700 text-right tabular-nums">
                {r.available ? r.rawText : '-'}
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: r.available ? `${Math.min(100, r.norm * 100)}%` : '0%',
                  backgroundColor: r.available ? r.band.color : '#E5E5E5',
                }}
              />
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{r.description}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {r.thresholds.map((t) => (
                <div key={t.label} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-xs text-gray-500">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
