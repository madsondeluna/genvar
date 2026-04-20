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
import ChromosomeIdeogram from '../components/ChromosomeIdeogram'
import { VariantPageSkeleton } from '../components/Skeleton'
import { useSearchHistory } from '../hooks/useSearchHistory'
import { formatAF, formatConsequence, formatInteger } from '../utils/format'
import { buildVariantAnnotation, VARIANT_LEGEND } from '../utils/ideogramAnnotations'
import { ArrowLeft, Search } from 'lucide-react'

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
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
          <div className="flex flex-col gap-8">

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
                <InfoRow label="Cromossomo" value={`chr${data.chromosome}`} />
                <InfoRow label="Posição" value={formatInteger(data.position)} />
                <InfoRow label="Alelos" value={`${data.ref_allele} > ${data.alt_allele}`} />
                <InfoRow label="Consequência" value={formatConsequence(data.consequence)} />
                <InfoRow label="Troca de aminoácido" value={data.amino_acid_change} />
                <InfoRow label="AF global (gnomAD)" value={formatAF(data.gnomad_global_af)} />
                <InfoRow label="AC global" value={formatInteger(data.gnomad_ac)} />
                <InfoRow label="AN global" value={formatInteger(data.gnomad_an)} />
              </div>
            </section>

            <ChromosomeIdeogram
              annotations={buildVariantAnnotation(data)}
              title={`Cromossomo ${data.chromosome}`}
              description={`Posição da variante em ${data.position?.toLocaleString('pt-BR')}. Rótulos de banda G exibidos.`}
              focusChromosome={data.chromosome}
              legendItems={VARIANT_LEGEND}
              expandSinglePointBy={300_000}
            />

            {(data.clinvar_significance || data.clinvar_conditions?.length > 0) && (
              <section className="card-flat" aria-labelledby="clinvar-title">
                <h3 id="clinvar-title" className="section-title">Classificação ClinVar</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-4">
                    <InfoRow label="Significado clínico" value={data.clinvar_significance} />
                    <InfoRow label="Status de revisão" value={data.clinvar_review_status} />
                    <InfoRow label="Última avaliação" value={data.clinvar_last_evaluated} />
                  </div>
                  {data.clinvar_conditions?.length > 0 && (
                    <div>
                      <p className="label mb-2">Condições associadas</p>
                      <ul className="flex flex-col gap-1">
                        {data.clinvar_conditions.map((c, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-gray-400 mt-0.5" aria-hidden="true">-</span>
                            {c}
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
