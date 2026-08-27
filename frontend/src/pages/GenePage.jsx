import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
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
import ExonVariantMap from '../components/ExonVariantMap'
import GenePhenotypes from '../components/GenePhenotypes'
import PageNav from '../components/PageNav'
import { GenePageSkeleton } from '../components/Skeleton'
import { useSearchHistory } from '../hooks/useSearchHistory'
import { stripEnsemblSource } from '../utils/format'
import { buildGeneAnnotations, geneLegend } from '../utils/ideogramAnnotations'

// Dados posicionais exatos exibidos sob o ideograma: banda citogenética,
// coordenadas em pb e a fração do cromossomo que o gene ocupa.
function buildLocusFacts(data) {
  const facts = []
  if (data.cytobands?.length) {
    facts.push({
      label: 'Banda citogenética',
      value: `${data.chromosome}${data.cytobands.join('-')}`,
      hint: 'Banda G onde o gene se localiza, na nomenclatura ISCN.',
    })
  }
  if (data.start && data.end) {
    facts.push({
      label: 'Coordenadas (GRCh38)',
      value: `${data.start.toLocaleString('pt-BR')} - ${data.end.toLocaleString('pt-BR')} pb`,
      hint: 'Primeiro e último par de bases do gene no cromossomo.',
    })
  }
  if (data.chromosome_length) {
    facts.push({
      label: 'Comprimento do cromossomo',
      value: `${(data.chromosome_length / 1_000_000).toFixed(1)} Mb`,
      hint: `${data.chromosome_length.toLocaleString('pt-BR')} pares de base.`,
    })
    if (data.start) {
      const pct = ((data.start + data.end) / 2 / data.chromosome_length) * 100
      facts.push({
        label: 'Posição relativa',
        value: `${pct.toFixed(1)}% do cromossomo`,
        hint: 'Distância do início do cromossomo até o centro do gene.',
      })
    }
  }
  if (data.exons?.length) {
    facts.push({
      label: 'Éxons (transcrito canônico)',
      value: String(data.exons.length),
      hint: data.canonical_transcript_id || undefined,
    })
  }
  if (data.total_variants) {
    facts.push({
      label: 'Densidade de variantes',
      value: `${Math.round(data.total_variants / ((data.end - data.start) / 1000)).toLocaleString('pt-BR')} por kb`,
      hint: 'Variantes catalogadas divididas pela extensão do gene.',
    })
  }
  return facts
}

function InfoRow({ label, value, hint }) {
  // Explicit null/empty check so falsy-but-valid values (0, strand=-1) are still rendered
  if (value == null || value === '') return null
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="block text-12 leading-snug mt-2">{hint}</span>}
    </div>
  )
}

function StatCard({ label, value, hint, statusClass }) {
  return (
    <div className="flex flex-col gap-4 p-16 border border-border rounded-media">
      <span className="text-24 font-medium text-text num">
        {(value || 0).toLocaleString('pt-BR')}
      </span>
      {statusClass ? (
        <span className={`status ${statusClass} text-12`}>{label}</span>
      ) : (
        <span className="label">{label}</span>
      )}
      {hint && <span className="text-12 leading-snug">{hint}</span>}
    </div>
  )
}

export default function GenePage() {
  const { symbol } = useParams()
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

  return (
    <main className="min-h-screen bg-bg">
      <PageNav initialQuery={symbol} />

      <div className="max-w-xl mx-auto px-24 py-24">

        {isLoading && <GenePageSkeleton />}

        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="flex flex-col gap-24 stagger stagger-fade">

            <section aria-labelledby="gene-title">
              <div className="flex items-start justify-between gap-16 mb-12 flex-wrap">
                <div>
                  <p className="eyebrow mb-4">Gene</p>
                  <h1 id="gene-title" className="display text-40">
                    {data.gene_symbol}
                  </h1>
                  {data.description && (
                    <p className="prose mt-8 text-14 max-w-(--measure-wide)">
                      {stripEnsemblSource(data.description)}
                    </p>
                  )}
                </div>
                <div className="flex gap-8 flex-wrap">
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-24 p-16 bg-dim rounded-surface">
                <InfoRow
                  label="ID Ensembl"
                  value={<span className="mono">{data.gene_id}</span>}
                  hint="Identificador único do gene no banco Ensembl."
                />
                <InfoRow
                  label="Cromossomo"
                  value={<span className="mono">{`chr${data.chromosome}`}</span>}
                  hint="Cromossomo em que o gene se encontra."
                />
                <InfoRow
                  label="Locus (posição no cromossomo)"
                  value={
                    <span className="mono num">
                      {`${data.start?.toLocaleString('pt-BR')} - ${data.end?.toLocaleString('pt-BR')}`}
                    </span>
                  }
                  hint="Início e fim do gene no cromossomo."
                />
                <InfoRow
                  label="Fita"
                  value={data.strand === 1 ? 'Direta (+)' : 'Reversa (-)'}
                  hint="Fita da dupla-hélice em que o gene é lido."
                />
                <InfoRow
                  label="Tipo de gene"
                  value={<span className="mono">{data.biotype}</span>}
                  hint="protein_coding = codifica uma proteína."
                />
                <InfoRow
                  label="Montagem"
                  value={<span className="mono">{data.assembly_name}</span>}
                  hint="Versão do genoma humano de referência."
                />
                <InfoRow
                  label="ID UniProt"
                  value={<span className="mono">{data.uniprot_id}</span>}
                  hint="Identificador da proteína no banco UniProt."
                />
                <InfoRow
                  label="Tamanho do gene"
                  value={
                    data.start && data.end ? (
                      <span className="mono num">{`${((data.end - data.start) / 1000).toFixed(1)} kb`}</span>
                    ) : null
                  }
                  hint="Extensão do gene (kb = mil pares de base, pb)."
                />
              </div>
            </section>

            <section aria-labelledby="variant-summary-title">
              <h2 id="variant-summary-title" className="section-title mb-4">Resumo de variantes</h2>
              <p className="text-12 mb-12">
                Variantes do gene catalogadas no Ensembl, agrupadas pela classificação clínica do
                ClinVar. As cores seguem o gráfico de distribuição.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-16">
                <StatCard
                  label="Total"
                  value={data.total_variants}
                  hint="Todas as variantes já registradas neste gene."
                />
                <StatCard
                  label="Patogênicas"
                  value={data.pathogenic_count}
                  statusClass="status-critical"
                  hint="Causam ou contribuem para doença."
                />
                <StatCard
                  label="VUS"
                  value={data.vus_count}
                  statusClass="status-warning"
                  hint="Significado incerto: evidência ainda insuficiente."
                />
                <StatCard
                  label="Benignas"
                  value={data.benign_count}
                  statusClass="status-good"
                  hint="Sem efeito conhecido sobre a saúde."
                />
                <StatCard
                  label="Sem classificação"
                  value={data.other_count}
                  statusClass="status-none"
                  hint="Ainda sem avaliação clínica no ClinVar."
                />
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
              <ChromosomeIdeogram
                annotations={buildGeneAnnotations(data)}
                title={`Cromossomo ${data.chromosome}`}
                description="Posição do gene no cromossomo, com os rótulos das bandas G."
                focusChromosome={data.chromosome}
                legendItems={geneLegend()}
                expandSinglePointBy={200_000}
                facts={buildLocusFacts(data)}
              />
              <GenePhenotypes symbol={data.gene_symbol} />
            </div>

            <ExonVariantMap geneData={data} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
              <ConstraintMetrics data={data} />
              <GeneLocusHeatmap geneData={data} />
            </div>

            {data.alphafold_pae_url && (
              <section className="card" aria-labelledby="structure-title">
                <h3 id="structure-title" className="section-title mb-16">Estrutura proteica (AlphaFold)</h3>

                <div className="flex gap-24 items-start mb-24 flex-wrap">
                  <img
                    src={data.alphafold_pae_url}
                    alt={`Gráfico de erro de alinhamento previsto para ${data.gene_symbol}`}
                    className="object-contain border border-border rounded-media"
                    style={{ width: 'calc(var(--photo-sm) * 2)', height: 'calc(var(--photo-sm) * 2)' }}
                  />
                  <div className="flex flex-col gap-12">
                    <div>
                      <p className="label mb-4">Erro de alinhamento previsto (PAE)</p>
                      <p className="text-14">
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
                    <p className="label mb-12">Estrutura 3D interativa</p>
                    <ProteinViewer
                      pdbUrl={data.alphafold_pdb_url}
                      uniprotId={data.uniprot_id}
                    />
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-col gap-24">
              {data.pathogenic_variants?.length > 0 && (
                <VariantTable
                  variants={data.pathogenic_variants}
                  title="Variantes patogênicas"
                  csvPrefix={`${data.gene_symbol}-patogenicas`}
                  totalCount={data.pathogenic_count}
                  paramPrefix="pat"
                />
              )}
              {data.vus_variants?.length > 0 && (
                <VariantTable
                  variants={data.vus_variants}
                  title="Variantes de significado incerto"
                  csvPrefix={`${data.gene_symbol}-vus`}
                  totalCount={data.vus_count}
                  paramPrefix="vus"
                />
              )}
              {data.benign_variants?.length > 0 && (
                <VariantTable
                  variants={data.benign_variants}
                  title="Variantes benignas"
                  csvPrefix={`${data.gene_symbol}-benignas`}
                  totalCount={data.benign_count}
                  paramPrefix="ben"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
