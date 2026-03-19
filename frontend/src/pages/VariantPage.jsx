import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchVariant } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorAlert from '../components/ErrorAlert'
import GeographicVariantMap from '../components/GeographicVariantMap'
import FrequencyBarChart from '../components/FrequencyBarChart'
import PredictionScoresRadar from '../components/PredictionScoresRadar'
import { ArrowLeft, Search, ExternalLink } from 'lucide-react'

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

function SignificanceBadge({ sig }) {
  if (!sig) return null
  const s = sig.toLowerCase()
  let cls = 'tag tag-other'
  if (s.includes('pathogenic') && !s.includes('conflicting')) cls = 'tag tag-pathogenic'
  else if (s.includes('benign')) cls = 'tag tag-benign'
  else if (s.includes('uncertain') || s.includes('vus')) cls = 'tag tag-vus'
  else if (s.includes('conflicting')) cls = 'tag tag-vus'
  return <span className={cls}>{sig}</span>
}

export default function VariantPage() {
  const { rsid } = useParams()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['variant', rsid],
    queryFn: () => fetchVariant(rsid),
    retry: 1,
    staleTime: 1000 * 60 * 10,
  })

  function handleSearch(e) {
    e.preventDefault()
    const val = searchInput.trim().toLowerCase()
    if (val) navigate(`/variant/${val}`)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            GenVar
          </Link>
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-xs">
            <input
              type="text"
              className="input py-1.5 text-sm"
              placeholder="Search variant..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              spellCheck={false}
            />
            <button type="submit" className="btn-primary py-1.5 px-3">
              <Search className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {isLoading && (
          <LoadingSpinner message={`Fetching data for ${rsid} from Ensembl VEP, gnomAD, ClinVar...`} />
        )}

        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="flex flex-col gap-8">

            {/* Variant Header */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Variant</p>
                  <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{data.variant_id}</h1>
                  <div className="flex items-center gap-3 mt-2">
                    {data.gene_symbol && (
                      <Link
                        to={`/gene/${data.gene_symbol}`}
                        className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
                      >
                        {data.gene_symbol}
                      </Link>
                    )}
                    {data.most_severe_consequence && (
                      <span className="text-sm text-gray-500">{data.most_severe_consequence.replace(/_/g, ' ')}</span>
                    )}
                    {data.clinvar_significance && (
                      <SignificanceBadge sig={data.clinvar_significance} />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/snp/${data.variant_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                  >
                    dbSNP <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://gnomad.broadinstitute.org/variant/${data.chromosome}-${data.position}-${data.ref_allele}-${data.alt_allele}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                  >
                    gnomAD <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Variant basic info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-gray-50 rounded-lg">
                <InfoRow label="Chromosome" value={`chr${data.chromosome}`} />
                <InfoRow label="Position" value={data.position?.toLocaleString()} />
                <InfoRow label="Alleles" value={`${data.ref_allele} > ${data.alt_allele}`} />
                <InfoRow label="Consequence" value={data.consequence?.replace(/_/g, ' ')} />
                <InfoRow label="Amino Acid Change" value={data.amino_acid_change} />
                <InfoRow
                  label="Global AF (gnomAD)"
                  value={data.gnomad_global_af != null ? data.gnomad_global_af.toExponential(3) : null}
                />
                <InfoRow
                  label="Global AC"
                  value={data.gnomad_ac != null ? data.gnomad_ac.toLocaleString() : null}
                />
                <InfoRow
                  label="Global AN"
                  value={data.gnomad_an != null ? data.gnomad_an.toLocaleString() : null}
                />
              </div>
            </div>

            {/* ClinVar */}
            {(data.clinvar_significance || data.clinvar_conditions?.length > 0) && (
              <div className="card-flat">
                <h3 className="section-title">ClinVar Classification</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-4">
                    <InfoRow label="Clinical Significance" value={data.clinvar_significance} />
                    <InfoRow label="Review Status" value={data.clinvar_review_status} />
                    <InfoRow label="Last Evaluated" value={data.clinvar_last_evaluated} />
                  </div>
                  {data.clinvar_conditions?.length > 0 && (
                    <div>
                      <p className="label mb-2">Associated Conditions</p>
                      <ul className="flex flex-col gap-1">
                        {data.clinvar_conditions.map((c, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-gray-300 mt-0.5">-</span>
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Predictions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PredictionScoresRadar
                sift={data.sift_score}
                polyphen={data.polyphen_score}
                cadd={data.cadd_phred}
                revel={data.revel_score}
              />
              <div className="card-flat">
                <h3 className="section-title">Prediction Score Details</h3>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="label mb-1">SIFT Score</p>
                      {data.sift_score != null ? (
                        <>
                          <p className="value">{data.sift_score.toFixed(4)}</p>
                          <p className="text-xs text-gray-400">{data.sift_prediction || ''}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">N/A</p>
                      )}
                    </div>
                    <div>
                      <p className="label mb-1">PolyPhen-2 Score</p>
                      {data.polyphen_score != null ? (
                        <>
                          <p className="value">{data.polyphen_score.toFixed(4)}</p>
                          <p className="text-xs text-gray-400">{data.polyphen_prediction || ''}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">N/A</p>
                      )}
                    </div>
                    <div>
                      <p className="label mb-1">CADD Phred</p>
                      {data.cadd_phred != null ? (
                        <p className="value">{data.cadd_phred.toFixed(2)}</p>
                      ) : (
                        <p className="text-sm text-gray-400">N/A</p>
                      )}
                    </div>
                    <div>
                      <p className="label mb-1">REVEL Score</p>
                      {data.revel_score != null ? (
                        <p className="value">{data.revel_score.toFixed(4)}</p>
                      ) : (
                        <p className="text-sm text-gray-400">N/A</p>
                      )}
                    </div>
                  </div>
                  <div className="divider pt-2">
                    <p className="text-xs text-gray-400 pt-3">
                      SIFT: tolerated if score &gt; 0.05. PolyPhen: probably damaging if &gt; 0.908.
                      CADD Phred: pathogenic if &gt; 15. REVEL: likely pathogenic if &gt; 0.5.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Population Frequencies */}
            {data.gnomad_frequencies?.length > 0 && (
              <div className="flex flex-col gap-6">
                <GeographicVariantMap frequencies={data.gnomad_frequencies} />
                <FrequencyBarChart frequencies={data.gnomad_frequencies} />
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
