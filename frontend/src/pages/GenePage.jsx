import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchGene } from '../api/client'
import ErrorAlert from '../components/ErrorAlert'
import ConstraintMetrics from '../components/ConstraintMetrics'
import GeneLocusHeatmap from '../components/GeneLocusHeatmap'
import VariantTable from '../components/VariantTable'
import ProteinViewer from '../components/ProteinViewer'
import ExternalLinkButton from '../components/ExternalLinkButton'
import CopyLinkButton from '../components/CopyLinkButton'
import ChromosomeIdeogram from '../components/ChromosomeIdeogram'
import { GenePageSkeleton } from '../components/Skeleton'
import { useSearchHistory } from '../hooks/useSearchHistory'
import { stripEnsemblSource } from '../utils/format'
import { buildGeneAnnotations, GENE_LEGEND } from '../utils/ideogramAnnotations'
import { ArrowLeft, Search } from 'lucide-react'

function InfoRow({ label, value, hint }) {
  // Explicit null/empty check so falsy-but-valid values (0, strand=-1) are still rendered
  if (value == null || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="block text-xs text-gray-500 leading-snug mt-0.5 min-h-[2.25rem]">{hint}</span>}
    </div>
  )
}

function StatCard({ label, value, hint, dotColor }) {
  return (
    <div className="flex flex-col gap-1 p-4 border border-gray-200 rounded-md">
      <span className="text-2xl font-bold text-gray-900 tracking-tight">
        {(value || 0).toLocaleString('pt-BR')}
      </span>
      <span className="label flex items-center gap-1.5">
        {dotColor && (
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
        )}
        {label}
      </span>
      {hint && <span className="text-xs text-gray-500 leading-snug">{hint}</span>}
    </div>
  )
}

export default function GenePage() {
  const { symbol } = useParams()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const { push } = useSearchHistory()

  const { data, isLoading, error } = useQuery({
    queryKey: ['gene', symbol],
    queryFn: () => fetchGene(symbol),
    retry: 1,
    staleTime: 1000 * 60 * 10,
  })

  useEffect(() => {
    if (data?.gene_symbol) push('gene', data.gene_symbol)
  }, [data?.gene_symbol, push])

  function handleSearch(e) {
    e.preventDefault()
    const val = searchInput.trim().toUpperCase()
    if (val) navigate(`/gene/${val}`)
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
            <label htmlFor="gene-nav-search" className="sr-only">Buscar gene</label>
            <input
              id="gene-nav-search"
              type="text"
              className="input py-1.5 text-sm"
              placeholder="Buscar gene..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              spellCheck={false}
            />
            <button type="submit" className="btn-primary py-1.5 px-3" aria-label="Buscar gene">
              <Search className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {isLoading && <GenePageSkeleton />}

        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="flex flex-col gap-5">

            <section aria-labelledby="gene-title">
              <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">Gene</p>
                  <h1 id="gene-title" className="text-4xl font-bold text-gray-900 tracking-tight">
                    {data.gene_symbol}
                  </h1>
                  {data.description && (
                    <p className="text-gray-600 mt-2 text-sm max-w-2xl leading-relaxed">
                      {stripEnsemblSource(data.description)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <CopyLinkButton />
                  <ExternalLinkButton
                    href={`https://www.ncbi.nlm.nih.gov/gene/?term=${data.gene_symbol}`}
                    label="NCBI"
                  />
                  <ExternalLinkButton
                    href={`https://gnomad.broadinstitute.org/gene/${data.gene_id}`}
                    label="gnomAD"
                  />
                  {data.uniprot_id && (
                    <ExternalLinkButton
                      href={`https://www.uniprot.org/uniprotkb/${data.uniprot_id}`}
                      label="UniProt"
                    />
                  )}
                  {data.alphafold_pdb_url && (
                    <ExternalLinkButton
                      href={`https://alphafold.ebi.ac.uk/entry/${data.uniprot_id}`}
                      label="AlphaFold"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-gray-50 rounded-lg">
                <InfoRow
                  label="ID Ensembl"
                  value={data.gene_id}
                  hint="Identificador único do gene no banco Ensembl."
                />
                <InfoRow
                  label="Cromossomo"
                  value={`chr${data.chromosome}`}
                  hint="Cromossomo em que o gene se encontra."
                />
                <InfoRow
                  label="Locus (posição no cromossomo)"
                  value={`${data.start?.toLocaleString('pt-BR')} - ${data.end?.toLocaleString('pt-BR')}`}
                  hint="Início e fim do gene no cromossomo (em pares de base)."
                />
                <InfoRow
                  label="Fita"
                  value={data.strand === 1 ? 'Direta (+)' : 'Reversa (-)'}
                  hint="Fita da dupla-hélice em que o gene é lido."
                />
                <InfoRow
                  label="Tipo de gene"
                  value={data.biotype}
                  hint="protein_coding = codifica uma proteína."
                />
                <InfoRow
                  label="Montagem"
                  value={data.assembly_name}
                  hint="Versão do genoma humano de referência."
                />
                <InfoRow
                  label="ID UniProt"
                  value={data.uniprot_id}
                  hint="Identificador da proteína no banco UniProt."
                />
                <InfoRow
                  label="Tamanho do gene"
                  value={data.start && data.end ? `${((data.end - data.start) / 1000).toFixed(1)} kb` : null}
                  hint="Extensão do gene (kb = mil pares de base, pb)."
                />
              </div>
            </section>

            <section aria-labelledby="variant-summary-title">
              <h2 id="variant-summary-title" className="section-title mb-1">Resumo de variantes</h2>
              <p className="text-xs text-gray-600 mb-3">
                Variantes do gene catalogadas no Ensembl, agrupadas pela classificação clínica do
                ClinVar. As cores seguem o gráfico de distribuição.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard
                  label="Total"
                  value={data.total_variants}
                  hint="Todas as variantes já registradas neste gene."
                />
                <StatCard
                  label="Patogênicas"
                  value={data.pathogenic_count}
                  dotColor="#DC2626"
                  hint="Causam ou contribuem para doença."
                />
                <StatCard
                  label="VUS"
                  value={data.vus_count}
                  dotColor="#D97706"
                  hint="Significado incerto: evidência ainda insuficiente."
                />
                <StatCard
                  label="Benignas"
                  value={data.benign_count}
                  dotColor="#16A34A"
                  hint="Sem efeito conhecido sobre a saúde."
                />
                <StatCard
                  label="Sem classificação"
                  value={data.other_count}
                  dotColor="#A3A3A3"
                  hint="Ainda sem avaliação clínica no ClinVar."
                />
              </div>
            </section>

            <ChromosomeIdeogram
              annotations={buildGeneAnnotations(data)}
              title={`Cromossomo ${data.chromosome}`}
              description="Posição do gene no cromossomo, com os rótulos das bandas G."
              focusChromosome={data.chromosome}
              legendItems={GENE_LEGEND}
              expandSinglePointBy={200_000}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConstraintMetrics data={data} />
              <GeneLocusHeatmap geneData={data} />
            </div>

            {data.alphafold_pae_url && (
              <section className="card-flat" aria-labelledby="structure-title">
                <h3 id="structure-title" className="section-title">Estrutura proteica (AlphaFold)</h3>

                <div className="flex gap-6 items-start mb-6 flex-wrap">
                  <img
                    src={data.alphafold_pae_url}
                    alt={`Gráfico de erro de alinhamento previsto para ${data.gene_symbol}`}
                    className="w-48 h-48 object-contain border border-gray-200 rounded"
                  />
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="label mb-1">Erro de alinhamento previsto (PAE)</p>
                      <p className="text-sm text-gray-600">
                        Valores menores indicam maior confiança nas posições relativas dos resíduos.
                      </p>
                    </div>
                    {data.alphafold_pdb_url && (
                      <ExternalLinkButton
                        href={data.alphafold_pdb_url}
                        label="Baixar PDB"
                        download
                      />
                    )}
                  </div>
                </div>

                {data.alphafold_pdb_url && (
                  <div>
                    <p className="label mb-3">Estrutura 3D interativa</p>
                    <ProteinViewer
                      pdbUrl={data.alphafold_pdb_url}
                      uniprotId={data.uniprot_id}
                    />
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-col gap-6">
              {data.pathogenic_variants?.length > 0 && (
                <VariantTable
                  variants={data.pathogenic_variants}
                  title="Variantes patogênicas"
                  csvPrefix={`${data.gene_symbol}-patogenicas`}
                  totalCount={data.pathogenic_count}
                />
              )}
              {data.vus_variants?.length > 0 && (
                <VariantTable
                  variants={data.vus_variants}
                  title="Variantes de significado incerto"
                  csvPrefix={`${data.gene_symbol}-vus`}
                  totalCount={data.vus_count}
                />
              )}
              {data.benign_variants?.length > 0 && (
                <VariantTable
                  variants={data.benign_variants}
                  title="Variantes benignas"
                  csvPrefix={`${data.gene_symbol}-benignas`}
                  totalCount={data.benign_count}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
