import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchVariant } from '../api/client'
import ErrorAlert from '../components/ErrorAlert'
import GeographicVariantMap from '../components/GeographicVariantMap'
import FrequencyBarChart from '../components/FrequencyBarChart'
import PredictionScoresRadar from '../components/PredictionScoresRadar'
import PredictionDetails from '../components/PredictionDetails'
import SignificanceTag from '../components/SignificanceTag'
import ExternalLinkButton from '../components/ExternalLinkButton'
import CopyLinkButton from '../components/CopyLinkButton'
import VariantChangePanel from '../components/VariantChangePanel'
import PageNav from '../components/PageNav'
import { VariantPageSkeleton } from '../components/Skeleton'
import { useSearchHistory } from '../hooks/useSearchHistory'
import {
  formatAF,
  formatConsequence,
  formatInteger,
  translateSignificance,
  translateReviewStatus,
  formatClinvarDate,
} from '../utils/format'
import { translateCondition } from '../utils/conditions'

// Drop placeholder conditions ClinVar uses when no real disease is linked
const PLACEHOLDER_CONDITIONS = new Set(['not provided', 'not specified', 'see cases'])
function isRealCondition(c) {
  return c && !PLACEHOLDER_CONDITIONS.has(c.trim().toLowerCase())
}

function InfoRow({ label, value, hint }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="block text-12 leading-snug mt-2">{hint}</span>}
    </div>
  )
}

export default function VariantPage() {
  const { rsid } = useParams()
  const { push } = useSearchHistory()

  const { data, isLoading, error } = useQuery({
    queryKey: ['variant', rsid],
    queryFn: () => fetchVariant(rsid),
    retry: 1,
    staleTime: 1000 * 60 * 10,
  })

  useEffect(() => {
    if (data?.variant_id) push('variant', data.variant_id)
  }, [data?.variant_id, push])

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />

      <div className="max-w-xl mx-auto px-24 py-24">

        {isLoading && <VariantPageSkeleton />}

        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="flex flex-col gap-24 stagger stagger-fade">

            <section aria-labelledby="variant-title">
              <div className="flex items-start justify-between gap-16 mb-12 flex-wrap">
                <div>
                  <p className="eyebrow mb-4">Variante</p>
                  <h1 id="variant-title" className="mono text-40 leading-tight text-text">
                    {data.variant_id}
                  </h1>
                  <div className="flex items-center gap-12 mt-8 flex-wrap">
                    {data.gene_symbol && (
                      <Link
                        to={`/gene/${data.gene_symbol}`}
                        className="link-muted text-14 underline underline-offset-2"
                      >
                        {data.gene_symbol}
                      </Link>
                    )}
                    {data.most_severe_consequence && (
                      <span className="text-14">
                        {formatConsequence(data.most_severe_consequence)}
                      </span>
                    )}
                    {data.clinvar_significance && (
                      <SignificanceTag value={data.clinvar_significance} raw />
                    )}
                  </div>
                </div>
                <div className="flex gap-8 flex-wrap">
                  <CopyLinkButton />
                  <ExternalLinkButton
                    href={`https://www.ncbi.nlm.nih.gov/snp/${data.variant_id}`}
                    label="dbSNP"
                  />
                  <ExternalLinkButton
                    href={`https://gnomad.broadinstitute.org/variant/${data.chromosome}-${data.position}-${data.ref_allele}-${data.alt_allele}`}
                    label="gnomAD"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-24 p-16 bg-dim rounded-surface">
                <InfoRow
                  label="Cromossomo"
                  value={<span className="mono">{`chr${data.chromosome}`}</span>}
                  hint="Cromossomo onde a variante se encontra."
                />
                <InfoRow
                  label="Posição"
                  value={<span className="mono num">{formatInteger(data.position)}</span>}
                  hint="Coordenada da variante no cromossomo."
                />
                <InfoRow
                  label="Alelos"
                  value={<span className="mono">{`${data.ref_allele} > ${data.alt_allele}`}</span>}
                  hint="Base de referência > base alterada."
                />
                <InfoRow
                  label="Consequência"
                  value={formatConsequence(data.consequence)}
                  hint="Efeito previsto da variante sobre o gene."
                />
                <InfoRow
                  label="Troca de aminoácido"
                  value={<span className="mono">{data.amino_acid_change}</span>}
                  hint="Aminoácido original e o que o substitui na proteína."
                />
                <InfoRow
                  label="AF global (gnomAD)"
                  value={<span className="mono num">{formatAF(data.gnomad_global_af)}</span>}
                  hint="Frequência do alelo alterado na população (AF)."
                />
                {data.abraom_af != null && (
                  <InfoRow
                    label="AF Brasil (ABraOM)"
                    value={<span className="mono num">{formatAF(data.abraom_af)}</span>}
                    hint="Frequência do alelo em coorte brasileira (ABraOM/DNA do Brasil). A gnomAD sub-representa a ancestralidade brasileira."
                  />
                )}
                <InfoRow
                  label="AC global"
                  value={<span className="mono num">{formatInteger(data.gnomad_ac)}</span>}
                  hint="Quantas cópias do alelo alterado foram observadas (AC)."
                />
                <InfoRow
                  label="AN global"
                  value={<span className="mono num">{formatInteger(data.gnomad_an)}</span>}
                  hint="Total de alelos analisados na amostra (AN)."
                />
              </div>
            </section>

            <VariantChangePanel data={data} />

            {(data.clinvar_significance || data.clinvar_conditions?.length > 0) && (
              <section className="card" aria-labelledby="clinvar-title">
                <h3 id="clinvar-title" className="section-title mb-16">Classificação ClinVar</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-24">
                  <div className="flex flex-col gap-16">
                    <InfoRow
                      label="Significado clínico"
                      value={translateSignificance(data.clinvar_significance)}
                    />
                    <InfoRow
                      label="Status de revisão"
                      value={translateReviewStatus(data.clinvar_review_status)}
                    />
                    <InfoRow
                      label="Última avaliação"
                      value={formatClinvarDate(data.clinvar_last_evaluated)}
                    />
                  </div>
                  {data.clinvar_conditions?.filter(isRealCondition).length > 0 && (
                    <div>
                      <p className="label mb-8">Condições associadas</p>
                      <ul className="flex flex-col gap-4">
                        {data.clinvar_conditions.filter(isRealCondition).map((c, i) => (
                          <li key={i} className="text-14 text-text flex items-start gap-8">
                            <span className="text-muted" aria-hidden="true">-</span>
                            {translateCondition(c)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-24">
              <PredictionScoresRadar
                sift={data.sift_score}
                polyphen={data.polyphen_score}
                cadd={data.cadd_phred}
                revel={data.revel_score}
              />
              <PredictionDetails data={data} />
            </div>

            {data.gnomad_frequencies?.length > 0 && (
              <div className="flex flex-col gap-24">
                <GeographicVariantMap frequencies={data.gnomad_frequencies} />
                <FrequencyBarChart frequencies={data.gnomad_frequencies} />
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  )
}
