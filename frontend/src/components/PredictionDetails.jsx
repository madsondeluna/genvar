import { translatePrediction } from '../utils/format'

// Veredito de cada preditor em token de status: critical = deletério,
// warning = intermediário, good = benigno.

const PREDICTORS = [
  {
    label: 'SIFT',
    field: 'sift_score',
    predField: 'sift_prediction',
    hint: '< 0,05 = deletério',
    tone: (v) => (v == null ? null : v < 0.05 ? 'critical' : 'good'),
  },
  {
    label: 'PolyPhen-2',
    field: 'polyphen_score',
    predField: 'polyphen_prediction',
    hint: '> 0,908 = provavelmente deletério',
    tone: (v) => (v == null ? null : v > 0.908 ? 'critical' : v > 0.446 ? 'warning' : 'good'),
  },
  {
    label: 'CADD Phred',
    field: 'cadd_phred',
    hint: '> 20 = alto impacto',
    tone: (v) => (v == null ? null : v > 20 ? 'critical' : v > 10 ? 'warning' : 'good'),
  },
  {
    label: 'REVEL',
    field: 'revel_score',
    hint: '> 0,5 = potencialmente patogênica',
    tone: (v) => (v == null ? null : v > 0.5 ? 'critical' : 'good'),
  },
  {
    label: 'AlphaMissense',
    field: 'alphamissense_score',
    predField: 'alphamissense_pred',
    hint: '> 0,564 = potencialmente patogênica',
    tone: (v) => (v == null ? null : v > 0.564 ? 'critical' : v > 0.340 ? 'warning' : 'good'),
  },
  {
    label: 'MetaLR',
    field: 'metalr_score',
    predField: 'metalr_pred',
    hint: '> 0,5 = deletério (ensemble)',
    tone: (v) => (v == null ? null : v > 0.5 ? 'critical' : 'good'),
  },
  {
    label: 'MetaSVM',
    field: 'metasvm_score',
    predField: 'metasvm_pred',
    hint: '> 0 = deletério',
    tone: (v) => (v == null ? null : v > 0 ? 'critical' : 'good'),
  },
  {
    label: 'PrimateAI',
    field: 'primateai_score',
    predField: 'primateai_pred',
    hint: '> 0,803 = patogênica',
    tone: (v) => (v == null ? null : v > 0.803 ? 'critical' : v > 0.5 ? 'warning' : 'good'),
  },
  {
    label: 'FATHMM',
    field: 'fathmm_score',
    predField: 'fathmm_pred',
    hint: '< -1,5 = deletério',
    tone: (v) => (v == null ? null : v < -1.5 ? 'critical' : 'good'),
  },
  {
    label: 'MutPred',
    field: 'mutpred_score',
    hint: '> 0,5 = provavelmente prejudicial',
    tone: (v) => (v == null ? null : v > 0.5 ? 'critical' : 'good'),
  },
  {
    label: 'DANN',
    field: 'dann_score',
    hint: 'Rede neural profunda, > 0,96 = deletério',
    tone: (v) => (v == null ? null : v > 0.96 ? 'critical' : v > 0.5 ? 'warning' : 'good'),
  },
]

const CONSERVATION = [
  {
    label: 'PhyloP',
    field: 'phylop_score',
    hint: 'Conservação entre 100 vertebrados. Positivo = conservado.',
    tone: (v) => (v == null ? null : v > 2 ? 'critical' : v > 0 ? 'warning' : 'good'),
  },
  {
    label: 'PhastCons',
    field: 'phastcons_score',
    hint: 'Probabilidade de conservação (0-1).',
    tone: (v) => (v == null ? null : v > 0.8 ? 'critical' : v > 0.4 ? 'warning' : 'good'),
  },
  {
    label: 'GERP++ RS',
    field: 'gerp_rs',
    hint: 'Rejected substitutions. > 2 = restrição evolutiva.',
    tone: (v) => (v == null ? null : v > 4 ? 'critical' : v > 2 ? 'warning' : 'good'),
  },
]

const SPLICE = [
  {
    label: 'SpliceAI (máx)',
    field: 'spliceai_max',
    hint: '> 0,5 = impacto alto no splicing',
    tone: (v) => (v == null ? null : v > 0.5 ? 'critical' : v > 0.2 ? 'warning' : 'good'),
  },
  {
    label: 'dbscSNV ADA',
    field: 'dbscsnv_ada',
    hint: 'Adaptive Boosting, > 0,6 = splice-altering',
    tone: (v) => (v == null ? null : v > 0.6 ? 'critical' : 'good'),
  },
  {
    label: 'dbscSNV RF',
    field: 'dbscsnv_rf',
    hint: 'Random Forest, > 0,6 = splice-altering',
    tone: (v) => (v == null ? null : v > 0.6 ? 'critical' : 'good'),
  },
]

const TONE_CLASS = {
  critical: 'tint-critical',
  warning: 'tint-warning',
  good: 'tint-good',
}

const TONE_INK = {
  critical: 'var(--state-critical)',
  warning: 'var(--state-warning)',
  good: 'var(--state-good)',
}

function ScoreCard({ label, score, prediction, tone, hint }) {
  const tint = tone ? TONE_CLASS[tone] : 'tint-neutral'
  const ink = tone ? TONE_INK[tone] : 'var(--text)'
  return (
    <div className={`rounded-media border p-12 ${tint}`}>
      <p className="label mb-4">{label}</p>
      {score != null ? (
        <>
          <p className="text-18 font-medium mono num" style={{ color: ink }}>
            {typeof score === 'number' ? score.toFixed(3) : score}
          </p>
          {prediction && (
            <p className="text-12 font-medium mt-2" style={{ color: ink }}>
              {translatePrediction(prediction)}
            </p>
          )}
          {hint && <p className="text-12 mt-4">{hint}</p>}
        </>
      ) : (
        <p className="text-14">Indisponível</p>
      )}
    </div>
  )
}

function ScoreGroup({ title, items, data }) {
  const present = items.filter((it) => data[it.field] != null)
  if (present.length === 0) return null
  return (
    <div>
      <h4 className="label mb-8">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
        {items.map((it) => (
          <ScoreCard
            key={it.label}
            label={it.label}
            score={data[it.field]}
            prediction={it.predField ? data[it.predField] : null}
            tone={it.tone(data[it.field])}
            hint={it.hint}
          />
        ))}
      </div>
    </div>
  )
}

export default function PredictionDetails({ data }) {
  const hasPathogenicity = PREDICTORS.some((p) => data[p.field] != null)
  const hasConservation = CONSERVATION.some((c) => data[c.field] != null)
  const hasSplice = SPLICE.some((s) => data[s.field] != null)
  const hasDomains = data.interpro_domains?.length > 0
  const hasCrossRefs =
    data.thousand_genomes_af != null ||
    data.exac_af != null ||
    data.clinvar_variation_id ||
    (data.cosmic_ids && data.cosmic_ids.length > 0)

  return (
    <section className="card" aria-labelledby="score-details-title">
      <h3 id="score-details-title" className="section-title mb-8">Detalhes dos scores preditivos</h3>
      <p className="text-12 mb-16">
        Agregado de SIFT, PolyPhen-2 (Ensembl VEP) e dbNSFP via MyVariant.info (CADD, REVEL,
        AlphaMissense, MetaLR, MetaSVM, PrimateAI, FATHMM, MutPred, DANN), conservação (PhyloP,
        PhastCons, GERP++) e predição de splicing (SpliceAI, dbscSNV).
      </p>

      <div className="flex flex-col gap-24">
        {hasPathogenicity && (
          <ScoreGroup title="Patogenicidade" items={PREDICTORS} data={data} />
        )}
        {hasConservation && (
          <ScoreGroup title="Conservação evolutiva" items={CONSERVATION} data={data} />
        )}
        {hasSplice && (
          <ScoreGroup title="Impacto no splicing" items={SPLICE} data={data} />
        )}

        {hasDomains && (
          <div>
            <h4 className="label mb-8">Domínios InterPro</h4>
            <div className="flex flex-wrap gap-8">
              {data.interpro_domains.map((d) => (
                <span key={d} className="tag border-border bg-dim text-muted">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasCrossRefs && (
          <div>
            <h4 className="label mb-8">Frequências e referências cruzadas</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
              {data.thousand_genomes_af != null && (
                <div className="rounded-media p-12 bg-dim">
                  <p className="label mb-4">1000 Genomes AF</p>
                  <p className="text-14 font-medium mono num text-text">
                    {data.thousand_genomes_af.toExponential(3)}
                  </p>
                </div>
              )}
              {data.exac_af != null && (
                <div className="rounded-media p-12 bg-dim">
                  <p className="label mb-4">ExAC AF</p>
                  <p className="text-14 font-medium mono num text-text">
                    {data.exac_af.toExponential(3)}
                  </p>
                </div>
              )}
              {data.clinvar_variation_id && (
                <div className="rounded-media p-12 bg-dim">
                  <p className="label mb-4">ID ClinVar</p>
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/clinvar/variation/${data.clinvar_variation_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-14 font-medium mono text-text underline underline-offset-2"
                  >
                    {data.clinvar_variation_id}
                  </a>
                </div>
              )}
              {data.cosmic_ids && data.cosmic_ids.length > 0 && (
                <div className="rounded-media p-12 bg-dim">
                  <p className="label mb-4">IDs COSMIC</p>
                  <p className="text-12 mono text-text break-words">{data.cosmic_ids.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!hasPathogenicity && !hasConservation && !hasSplice && !hasDomains && !hasCrossRefs && (
          <div className="empty">
            Nenhum score preditivo ou anotação adicional disponível para esta variante.
          </div>
        )}
      </div>
    </section>
  )
}
