// Predições de patogenicidade apresentadas como uma barra por preditor (0 = benigno, 1 = dano).
// Cada preditor traz seu próprio veredito em palavra, o token de status e o valor bruto, para
// leitura direta por leigos. A barra é o score normalizado; o número à direita é o valor bruto.
// Estado usa --status-*: critical = dano, warning = intermediário, good = benigno.

const CRITICAL = { ink: 'var(--state-critical)', tint: 'tint-critical', damaging: true }
const WARNING = { ink: 'var(--state-warning)', tint: 'tint-warning', damaging: true }
const GOOD = { ink: 'var(--state-good)', tint: 'tint-good', damaging: false }

const PREDICTORS = [
  {
    key: 'SIFT',
    description:
      'Sorting Intolerant from Tolerant. Prevê se a troca de aminoácido afeta a função da proteína. Quanto menor o valor bruto, mais provável o dano.',
    normalize: (s) => (s == null ? null : 1 - s),
    rawDisplay: (s) => s.toFixed(3),
    verdict: (s) => (s < 0.05 ? { ...CRITICAL, label: 'Deletério' } : { ...GOOD, label: 'Tolerado' }),
    thresholds: [
      { ink: 'var(--state-critical)', label: 'Deletério (< 0,05)' },
      { ink: 'var(--state-good)', label: 'Tolerado (> 0,05)' },
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
        ? { ...CRITICAL, label: 'Provavelmente deletério' }
        : s >= 0.446
          ? { ...WARNING, label: 'Possivelmente deletério' }
          : { ...GOOD, label: 'Benigno' },
    thresholds: [
      { ink: 'var(--state-critical)', label: 'Provavelmente deletério (> 0,908)' },
      { ink: 'var(--state-warning)', label: 'Possivelmente deletério (0,446 - 0,908)' },
      { ink: 'var(--state-good)', label: 'Benigno (< 0,446)' },
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
        ? { ...CRITICAL, label: 'Alto impacto' }
        : s >= 10
          ? { ...WARNING, label: 'Moderado' }
          : { ...GOOD, label: 'Baixo impacto' },
    thresholds: [
      { ink: 'var(--state-critical)', label: 'Alto impacto (Phred > 20)' },
      { ink: 'var(--state-warning)', label: 'Moderado (Phred 10 - 20)' },
      { ink: 'var(--state-good)', label: 'Baixo impacto (Phred < 10)' },
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
        ? { ...CRITICAL, label: 'Potencialmente patogênica' }
        : { ...GOOD, label: 'Potencialmente benigna' },
    thresholds: [
      { ink: 'var(--state-critical)', label: 'Potencialmente patogênica (> 0,5)' },
      { ink: 'var(--state-good)', label: 'Potencialmente benigna (< 0,5)' },
    ],
  },
]

function overallVerdict(avgScore) {
  if (avgScore == null) return null
  if (avgScore >= 0.6) return { text: 'Potencialmente patogênica', cls: 'status-critical' }
  if (avgScore >= 0.3) return { text: 'Incerta', cls: 'status-warning' }
  return { text: 'Potencialmente benigna', cls: 'status-good' }
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
      <div className="card">
        <h3 className="section-title mb-8">Predições de patogenicidade</h3>
        <div className="empty">Nenhum score de predição disponível para esta variante.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">Predições de patogenicidade</h3>
        {verdict && <span className={`status ${verdict.cls} text-12`}>{verdict.text}</span>}
      </div>
      <p className="text-12 mb-12">
        Cada barra vai de 0 (benigno, verde) a 1 (dano, vermelho). O número à direita é o valor bruto
        do preditor. {damagingCount} de {present.length}{' '}
        {present.length === 1 ? 'preditor disponível indica' : 'preditores disponíveis indicam'} dano.
      </p>

      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className={`flex flex-col gap-6 py-16 ${i > 0 ? 'border-t border-border' : 'pt-0'}`}
          >
            <div className="grid grid-cols-[var(--photo-sm)_1fr_auto] items-center gap-8">
              <span className="text-12 mono text-text">{r.key}</span>
              <div className="min-w-0">
                {r.available ? (
                  <span className="status text-12" style={{ color: r.band.ink }}>
                    {r.band.label}
                  </span>
                ) : (
                  <span className="text-12">Sem dado</span>
                )}
              </div>
              <span className="text-12 mono num text-text text-right">
                {r.available ? r.rawText : '-'}
              </span>
            </div>
            <div className="meter">
              <span
                style={{
                  transform: `scaleX(${r.available ? Math.min(1, r.norm) : 0})`,
                  background: r.available ? r.band.ink : 'var(--border)',
                }}
              />
            </div>
            <p className="text-12 leading-relaxed">{r.description}</p>
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              {r.thresholds.map((t) => (
                <span key={t.label} className="status text-12" style={{ color: t.ink }}>
                  <span className="text-muted">{t.label}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
