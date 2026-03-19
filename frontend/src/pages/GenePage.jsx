import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchGene } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorAlert from '../components/ErrorAlert'
import ConstraintMetrics from '../components/ConstraintMetrics'
import GeneLocusHeatmap from '../components/GeneLocusHeatmap'
import VariantTable from '../components/VariantTable'
import { ArrowLeft, Search, ExternalLink } from 'lucide-react'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="flex flex-col gap-1 p-4 border border-gray-200 rounded-md">
      <span className="text-2xl font-bold text-gray-900 tracking-tight">
        {(value || 0).toLocaleString()}
      </span>
      <span className="label">{label}</span>
    </div>
  )
}

export default function GenePage() {
  const { symbol } = useParams()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['gene', symbol],
    queryFn: () => fetchGene(symbol),
    retry: 1,
    staleTime: 1000 * 60 * 10,
  })

  function handleSearch(e) {
    e.preventDefault()
    const val = searchInput.trim().toUpperCase()
    if (val) navigate(`/gene/${val}`)
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
              placeholder="Search gene..."
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
          <LoadingSpinner message={`Building profile for ${symbol}...`} />
        )}

        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="flex flex-col gap-8">

            {/* Gene Header */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Gene</p>
                  <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{data.gene_symbol}</h1>
                  {data.description && (
                    <p className="text-gray-500 mt-2 text-sm max-w-2xl leading-relaxed">
                      {data.description.replace(/\[Source:.*\]/, '').trim()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/gene/?term=${data.gene_symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                  >
                    NCBI <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://gnomad.broadinstitute.org/gene/${data.gene_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                  >
                    gnomAD <ExternalLink className="w-3 h-3" />
                  </a>
                  {data.uniprot_id && (
                    <a
                      href={`https://www.uniprot.org/uniprotkb/${data.uniprot_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                    >
                      UniProt <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {data.alphafold_pdb_url && (
                    <a
                      href={`https://alphafold.ebi.ac.uk/entry/${data.uniprot_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                    >
                      AlphaFold <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Basic info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-gray-50 rounded-lg">
                <InfoRow label="Ensembl ID" value={data.gene_id} />
                <InfoRow label="Chromosome" value={`chr${data.chromosome}`} />
                <InfoRow
                  label="Locus"
                  value={`${data.start?.toLocaleString()} - ${data.end?.toLocaleString()}`}
                />
                <InfoRow label="Strand" value={data.strand === 1 ? 'Forward (+)' : 'Reverse (-)'} />
                <InfoRow label="Biotype" value={data.biotype} />
                <InfoRow label="Assembly" value={data.assembly_name} />
                <InfoRow label="UniProt ID" value={data.uniprot_id} />
                <InfoRow
                  label="Gene Length"
                  value={data.start && data.end ? `${((data.end - data.start) / 1000).toFixed(1)} kb` : null}
                />
              </div>
            </div>

            {/* Variant Summary */}
            <div>
              <h2 className="section-title">Variant Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Variants" value={data.total_variants} />
                <StatCard label="Pathogenic" value={data.pathogenic_count} />
                <StatCard label="VUS" value={data.vus_count} />
                <StatCard label="Benign" value={data.benign_count} />
              </div>
            </div>

            {/* Constraint + Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConstraintMetrics data={data} />
              <GeneLocusHeatmap geneData={data} />
            </div>

            {/* AlphaFold Structure */}
            {data.alphafold_pae_url && (
              <div className="card-flat">
                <h3 className="section-title">Protein Structure (AlphaFold)</h3>
                <div className="flex gap-6 items-start">
                  <img
                    src={data.alphafold_pae_url}
                    alt="AlphaFold predicted alignment error"
                    className="w-48 h-48 object-contain border border-gray-200 rounded"
                  />
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="label mb-1">Predicted Alignment Error (PAE)</p>
                      <p className="text-sm text-gray-500">
                        Lower values indicate higher confidence in the relative positions of residues.
                      </p>
                    </div>
                    {data.alphafold_pdb_url && (
                      <a
                        href={data.alphafold_pdb_url}
                        download
                        className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 self-start"
                      >
                        Download PDB <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Variant Tables */}
            <div className="flex flex-col gap-6">
              {data.pathogenic_variants?.length > 0 && (
                <VariantTable
                  variants={data.pathogenic_variants}
                  title="Pathogenic Variants"
                />
              )}
              {data.vus_variants?.length > 0 && (
                <VariantTable
                  variants={data.vus_variants}
                  title="Variants of Uncertain Significance"
                />
              )}
              {data.benign_variants?.length > 0 && (
                <VariantTable
                  variants={data.benign_variants}
                  title="Benign Variants"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
