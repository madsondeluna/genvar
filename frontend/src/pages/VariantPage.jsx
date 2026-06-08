import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
import { ArrowLeft, Search } from 'lucide-react'

// Drop placeholder conditions ClinVar uses when no real disease is linked
const PLACEHOLDER_CONDITIONS = new Set(['not provided', 'not specified', 'see cases'])
function isRealCondition(c) {
  return c && !PLACEHOLDER_CONDITIONS.has(c.trim().toLowerCase())
}

function InfoRow({ label, value, hint }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="block text-xs text-gray-500 leading-snug mt-0.5 min-h-[2.25rem]">{hint}</span>}
    </div>
  )
}

export default function VariantPage() {
  const { rsid } = useParams()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
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

  function handleSearch(e) {
    e.preventDefault()
    const val = searchInput.trim().toLowerCase()
    if (val) navigate(`/variant/${val}`)
  }

  return (
    <main className="min-h-screen bg-white">
      <nav className="sticky-header" aria-label="Principal">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            GenVar
          </Link>
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-xs" role="search">
            <label htmlFor="variant-nav-search" className="sr-only">Buscar variante</label>
            <input
              id="variant-nav-search"
              type="text"
              className="input py-1.5 text-sm"
              placeholder="Buscar variante..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              spellCheck={false}
            />
            <button type="submit" className="btn-primary py-1.5 px-3" aria-label="Buscar variante">
              <Search className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {isLoading && <VariantPageSkeleton />}

        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="flex flex-col gap-5">

            <section aria-labelledby="variant-title">
              <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Variante</p>
                  <h1 id="variant-title" className="text-4xl font-bold text-gray-900 tracking-tight">
                    {data.variant_id}
                  </h1>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {data.gene_symbol && (
                      <Link
                        to={`/gene/${data.gene_symbol}`}
                        className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2"
                      >
                        {data.gene_symbol}
                      </Link>
                    )}
                    {data.most_severe_consequence && (
                      <span className="text-sm text-gray-600">
                        {formatConsequence(data.most_severe_consequence)}
                      </span>
                    )}
                    {data.clinvar_significance && (
                      <SignificanceTag value={data.clinvar_significance} raw />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-gray-50 rounded-lg">
                <InfoRow
                  label="Cromossomo"
                  value={`chr${data.chromosome}`}
                  hint="Cromossomo onde a variante se encontra."
                />
                <InfoRow
                  label="Posição"
                  value={formatInteger(data.position)}
                  hint="Coordenada da variante no cromossomo."
                />
                <InfoRow
                  label="Alelos"
                  value={`${data.ref_allele} > ${data.alt_allele}`}
                  hint="Base de referência > base alterada."
                />
                <InfoRow
                  label="Consequência"
                  value={formatConsequence(data.consequence)}
                  hint="Efeito previsto da variante sobre o gene."
                />
                <InfoRow
                  label="Troca de aminoácido"
                  value={data.amino_acid_change}
                  hint="Aminoácido original e o que o substitui na proteína."
                />
                <InfoRow
                  label="AF global (gnomAD)"
                  value={formatAF(data.gnomad_global_af)}
                  hint="Frequência do alelo alterado na população (AF)."
                />
                <InfoRow
                  label="AC global"
                  value={formatInteger(data.gnomad_ac)}
                  hint="Quantas cópias do alelo alterado foram observadas (AC)."
                />
                <InfoRow
                  label="AN global"
                  value={formatInteger(data.gnomad_an)}
                  hint="Total de alelos analisados na amostra (AN)."
                />
              </div>
            </section>

            <VariantChangePanel data={data} />

            {(data.clinvar_significance || data.clinvar_conditions?.length > 0) && (
              <section className="card-flat" aria-labelledby="clinvar-title">
                <h3 id="clinvar-title" className="section-title">Classificação ClinVar</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-4">
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
                      <p className="label mb-2">Condições associadas</p>
                      <ul className="flex flex-col gap-1">
                        {data.clinvar_conditions.filter(isRealCondition).map((c, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-gray-400 mt-0.5" aria-hidden="true">-</span>
                            {translateCondition(c)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <PredictionScoresRadar
                sift={data.sift_score}
                polyphen={data.polyphen_score}
                cadd={data.cadd_phred}
                revel={data.revel_score}
              />
              <PredictionDetails data={data} />
            </div>

            {data.gnomad_frequencies?.length > 0 && (
              <div className="flex flex-col gap-6">
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
