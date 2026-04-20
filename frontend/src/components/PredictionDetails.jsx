const PREDICTORS = [
  {
    label: 'SIFT',
    field: 'sift_score',
    predField: 'sift_prediction',
    hint: '< 0,05 = deletério',
    color: (v) => (v == null ? null : v < 0.05 ? 'red' : 'green'),
  },
  {
    label: 'PolyPhen-2',
    field: 'polyphen_score',
    predField: 'polyphen_prediction',
    hint: '> 0,908 = provavelmente deletério',
    color: (v) => (v == null ? null : v > 0.908 ? 'red' : v > 0.446 ? 'amber' : 'green'),
  },
  {
    label: 'CADD Phred',
    field: 'cadd_phred',
    hint: '> 20 = alto impacto',
    color: (v) => (v == null ? null : v > 20 ? 'red' : v > 10 ? 'amber' : 'green'),
  },
  {
    label: 'REVEL',
    field: 'revel_score',
    hint: '> 0,5 = potencialmente patogênica',
    color: (v) => (v == null ? null : v > 0.5 ? 'red' : 'green'),
  },
  {
    label: 'AlphaMissense',
    field: 'alphamissense_score',
    predField: 'alphamissense_pred',
    hint: '> 0,564 = potencialmente patogênica',
    color: (v) => (v == null ? null : v > 0.564 ? 'red' : v > 0.340 ? 'amber' : 'green'),
  },
  {
    label: 'MetaLR',
    field: 'metalr_score',
    predField: 'metalr_pred',
    hint: '> 0,5 = deletério (ensemble)',
    color: (v) => (v == null ? null : v > 0.5 ? 'red' : 'green'),
  },
  {
    label: 'MetaSVM',
    field: 'metasvm_score',
    predField: 'metasvm_pred',
    hint: '> 0 = deletério',
    color: (v) => (v == null ? null : v > 0 ? 'red' : 'green'),
  },
  {
    label: 'PrimateAI',
    field: 'primateai_score',
    predField: 'primateai_pred',
    hint: '> 0,803 = patogênica',
    color: (v) => (v == null ? null : v > 0.803 ? 'red' : v > 0.5 ? 'amber' : 'green'),
  },
  {
    label: 'FATHMM',
    field: 'fathmm_score',
    predField: 'fathmm_pred',
    hint: '< -1,5 = deletério',
    color: (v) => (v == null ? null : v < -1.5 ? 'red' : 'green'),
  },
  {
    label: 'MutPred',
    field: 'mutpred_score',
    hint: '> 0,5 = provavelmente prejudicial',
    color: (v) => (v == null ? null : v > 0.5 ? 'red' : 'green'),
  },
  {
    label: 'DANN',
    field: 'dann_score',
    hint: 'Rede neural profunda, > 0,96 = deletério',
    color: (v) => (v == null ? null : v > 0.96 ? 'red' : v > 0.5 ? 'amber' : 'green'),
  },
]

const CONSERVATION = [
  {
    label: 'PhyloP',
    field: 'phylop_score',
    hint: 'Conservação entre 100 vertebrados. Positivo = conservado.',
    color: (v) => (v == null ? null : v > 2 ? 'red' : v > 0 ? 'amber' : 'green'),
  },
  {
    label: 'PhastCons',
    field: 'phastcons_score',
    hint: 'Probabilidade de conservação (0-1).',
    color: (v) => (v == null ? null : v > 0.8 ? 'red' : v > 0.4 ? 'amber' : 'green'),
  },
  {
    label: 'GERP++ RS',
    field: 'gerp_rs',
    hint: 'Rejected substitutions. > 2 = restrição evolutiva.',
    color: (v) => (v == null ? null : v > 4 ? 'red' : v > 2 ? 'amber' : 'green'),
  },
]

const SPLICE = [
  {
    label: 'SpliceAI (máx)',
    field: 'spliceai_max',
    hint: '> 0,5 = impacto alto no splicing',
    color: (v) => (v == null ? null : v > 0.5 ? 'red' : v > 0.2 ? 'amber' : 'green'),
  },
  {
    label: 'dbscSNV ADA',
    field: 'dbscsnv_ada',
    hint: 'Adaptive Boosting, > 0,6 = splice-altering',
    color: (v) => (v == null ? null : v > 0.6 ? 'red' : 'green'),
  },
  {
    label: 'dbscSNV RF',
    field: 'dbscsnv_rf',
    hint: 'Random Forest, > 0,6 = splice-altering',
    color: (v) => (v == null ? null : v > 0.6 ? 'red' : 'green'),
  },
]

const SCORE_BG = {
  red: 'bg-red-50',
  amber: 'bg-amber-50',
  green: 'bg-green-50',
}

const SCORE_TEXT = {
  red: 'text-red-700',
  amber: 'text-amber-700',
  green: 'text-green-700',
}

function ScoreCard({ label, score, prediction, color, hint }) {
  const bg = color ? SCORE_BG[color] : 'bg-gray-50'
  const txt = color ? SCORE_TEXT[color] : 'text-gray-700'
  return (
    <div className={`rounded-md p-3 ${bg}`}>
      <p className="label mb-1">{label}</p>
      {score != null ? (
        <>
          <p className={`text-lg font-bold tracking-tight ${txt}`}>
            {typeof score === 'number' ? score.toFixed(3) : score}
          </p>
          {prediction && <p className={`text-xs font-medium mt-0.5 ${txt}`}>{prediction}</p>}
          {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
        </>
      ) : (
        <p className="text-sm text-gray-400">Indisponível</p>
      )}
    </div>
  )
}

function ScoreGroup({ title, items, data }) {
  const present = items.filter((it) => data[it.field] != null)
  if (present.length === 0) return null
  return (
    <div>
      <h4 className="label mb-2">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((it) => (
          <ScoreCard
            key={it.label}
            label={it.label}
            score={data[it.field]}
            prediction={it.predField ? data[it.predField] : null}
            color={it.color(data[it.field])}
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
    <section className="card-flat" aria-labelledby="score-details-title">
      <h3 id="score-details-title" className="section-title">Detalhes dos scores preditivos</h3>
      <p className="text-xs text-gray-600 mb-4">
        Agregado de SIFT, PolyPhen-2 (Ensembl VEP) e dbNSFP via MyVariant.info (CADD, REVEL,
        AlphaMissense, MetaLR, MetaSVM, PrimateAI, FATHMM, MutPred, DANN), conservação (PhyloP,
        PhastCons, GERP++) e predição de splicing (SpliceAI, dbscSNV).
      </p>

      <div className="flex flex-col gap-6">
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
            <h4 className="label mb-2">Domínios InterPro</h4>
            <div className="flex flex-wrap gap-2">
              {data.interpro_domains.map((d) => (
                <span key={d} className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-700 bg-gray-50">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasCrossRefs && (
          <div>
            <h4 className="label mb-2">Frequências e referências cruzadas</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {data.thousand_genomes_af != null && (
                <div className="rounded-md p-3 bg-gray-50">
                  <p className="label mb-1">1000 Genomes AF</p>
                  <p className="text-sm font-bold text-gray-800">{data.thousand_genomes_af.toExponential(3)}</p>
                </div>
              )}
              {data.exac_af != null && (
                <div className="rounded-md p-3 bg-gray-50">
                  <p className="label mb-1">ExAC AF</p>
                  <p className="text-sm font-bold text-gray-800">{data.exac_af.toExponential(3)}</p>
                </div>
              )}
              {data.clinvar_variation_id && (
                <div className="rounded-md p-3 bg-gray-50">
                  <p className="label mb-1">ID ClinVar</p>
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/clinvar/variation/${data.clinvar_variation_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-gray-900 underline underline-offset-2"
                  >
                    {data.clinvar_variation_id}
                  </a>
                </div>
              )}
              {data.cosmic_ids && data.cosmic_ids.length > 0 && (
                <div className="rounded-md p-3 bg-gray-50">
                  <p className="label mb-1">IDs COSMIC</p>
                  <p className="text-xs text-gray-800 break-words">{data.cosmic_ids.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!hasPathogenicity && !hasConservation && !hasSplice && !hasDomains && !hasCrossRefs && (
          <p className="text-sm text-gray-500">
            Nenhum score preditivo ou anotação adicional disponível para esta variante.
          </p>
        )}
      </div>
    </section>
  )
}
