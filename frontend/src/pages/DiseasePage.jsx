import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dna, Activity, ArrowRight, ArrowLeft, Stethoscope, FlaskConical } from 'lucide-react'
import { fetchDisease, fetchDiseaseVariants } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import ExternalLinkButton from '../components/ExternalLinkButton'
import SignificanceTag from '../components/SignificanceTag'
import { inheritanceMeta } from '../utils/inheritance'

// Variantes do Ensembl trazem o id do dbSNP; so linkamos para a pagina de
// variante quando o id e um rsID valido.
const RSID = /^rs\d+$/

// Faixa de restrição do LOEUF (mesmos limiares do gnomAD usados em ConstraintMetrics).
function loeufBand(v) {
  if (v == null) return { label: 'Indisponível', ink: 'var(--muted)' }
  if (v <= 0.35) return { label: 'Altamente restrito', ink: 'var(--state-critical)' }
  if (v <= 0.6) return { label: 'Intermediário', ink: 'var(--state-warning)' }
  return { label: 'Tolerante', ink: 'var(--state-good)' }
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

// Cartão compacto de gene causal com constraint enriquecido ao vivo e link para
// a página de gene completa (variantes, estrutura, frequências).
function CausalGeneCard({ gene }) {
  const band = loeufBand(gene.loeuf)
  return (
    <Link to={`/gene/${gene.symbol}`} className="card hover-surface flex flex-col gap-8 cursor-pointer">
      <span className="flex items-center justify-between gap-8">
        <span className="text-15 font-medium text-text flex items-center gap-8">
          <Dna className="w-16 h-16 text-muted" aria-hidden="true" />
          <span className="mono">{gene.symbol}</span>
        </span>
        <ArrowRight className="w-14 h-14 text-muted" aria-hidden="true" />
      </span>
      {gene.constraint_available ? (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <span className="label">LOEUF</span>
            <span className="text-12 mono num text-text">
              {gene.loeuf != null ? gene.loeuf.toFixed(3) : 'n/d'}
            </span>
          </div>
          <span className="status text-12" style={{ color: band.ink }}>{band.label}</span>
          <div className="flex justify-between items-center mt-4">
            <span className="label">pLI</span>
            <span className="text-12 mono num text-text">
              {gene.pli != null ? gene.pli.toFixed(3) : 'n/d'}
            </span>
          </div>
        </div>
      ) : (
        <span className="text-12 text-muted">Constraint indisponível na gnomAD.</span>
      )}
    </Link>
  )
}

function VariantRow({ v }) {
  const isRsid = RSID.test(v.variant_id)
  return (
    <tr className="border-t border-border">
      <td className="py-8 pr-12">
        {isRsid ? (
          <Link to={`/variant/${v.variant_id}`} className="link-muted mono text-13 inline-flex items-center gap-4">
            <Activity className="w-12 h-12" aria-hidden="true" />
            {v.variant_id}
          </Link>
        ) : (
          <span className="mono text-13 text-muted">{v.variant_id || 'n/d'}</span>
        )}
      </td>
      <td className="py-8 pr-12 mono num text-13 text-muted">{v.position || 'n/d'}</td>
      <td className="py-8 pr-12 text-13 text-muted">{v.consequence}</td>
      <td className="py-8"><SignificanceTag value={v.clinical_significance} /></td>
    </tr>
  )
}

// Secao assincrona: variantes patogenicas por gene causal, carregada em separado
// do detalhe da doenca para nao atrasar a pagina.
function PathogenicVariantsSection({ id }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['disease-variants', id],
    queryFn: () => fetchDiseaseVariants(id),
    retry: 1,
    staleTime: 1000 * 60 * 30,
  })

  const genesWithHits = data?.genes?.filter((g) => g.pathogenic_count > 0) || []

  return (
    <section className="mb-24" aria-labelledby="pathogenic-title">
      <div className="flex items-start justify-between mb-4">
        <h2 id="pathogenic-title" className="section-title flex items-center gap-8">
          <FlaskConical className="w-16 h-16 text-muted" aria-hidden="true" />
          Variantes patogênicas
        </h2>
        <span className="text-12 text-muted mono">ClinVar via Ensembl</span>
      </div>
      <p className="text-12 text-muted mb-16">
        Variantes classificadas como patogênicas ou potencialmente patogênicas em cada gene causal.
        Amostra representativa por gene; a página de gene traz o conjunto completo. Clique num rsID
        para abrir a variante.
      </p>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorAlert message={error.message} />}

      {data && !isLoading && (
        <>
          {genesWithHits.length === 0 && (
            <p className="text-14 text-muted">
              Nenhuma variante patogênica encontrada para os genes causais no momento.
            </p>
          )}
          <div className="flex flex-col gap-16">
            {genesWithHits.map((g) => (
              <div key={g.symbol} className="card">
                <div className="flex items-center justify-between gap-8 mb-12">
                  <Link to={`/gene/${g.symbol}`} className="text-15 font-medium text-text mono inline-flex items-center gap-8">
                    <Dna className="w-16 h-16 text-muted" aria-hidden="true" />
                    {g.symbol}
                  </Link>
                  <span className="label">
                    {g.pathogenic_count} {g.pathogenic_count === 1 ? 'patogênica' : 'patogênicas'}
                    {g.pathogenic_count > g.variants.length ? ` (mostrando ${g.variants.length})` : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className="label pb-8 pr-12">Variante</th>
                        <th className="label pb-8 pr-12">Posição</th>
                        <th className="label pb-8 pr-12">Consequência</th>
                        <th className="label pb-8">Classificação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.variants.map((v) => (
                        <VariantRow key={v.variant_id || `${g.symbol}-${v.position}`} v={v} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          {data.degraded && (
            <p className="text-12 text-muted mt-12">
              Parte dos genes não pôde ser carregada agora; tente recarregar em instantes.
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default function DiseasePage() {
  const { id } = useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ['disease', id],
    queryFn: () => fetchDisease(id),
    retry: 1,
    staleTime: 1000 * 60 * 30,
  })

  const m = data ? inheritanceMeta(data.inheritance) : null

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96">
        <Link to="/doencas" className="link-muted text-12 mono mb-16 inline-flex items-center gap-4">
          <ArrowLeft className="w-12 h-12" aria-hidden="true" />
          Doenças Raras
        </Link>

        {isLoading && <LoadingSpinner />}
        {error && <ErrorAlert message={error.message} />}

        {data && (
          <>
            <header className="card mb-24">
              <div className="flex items-start justify-between gap-16 flex-wrap mb-12">
                <div>
                  <p className="eyebrow mb-4">{data.category}</p>
                  <h1 className="display">{data.name}</h1>
                </div>
                <span className={`pill ${m.tint}`} title={m.label}>{m.label}</span>
              </div>
              <p className="text-14 text-muted leading-normal mb-16">{data.short}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-16 mb-16">
                <InfoRow label="Herança" value={m.label} />
                <InfoRow label="Prevalência" value={data.prevalence} />
                <InfoRow label="Genes" value={data.genes.join(', ')} />
                <InfoRow label="MONDO" value={data.mondo} />
              </div>

              <div className="flex flex-wrap gap-8">
                {data.orphanet && (
                  <ExternalLinkButton
                    href={`https://www.orpha.net/en/disease/detail/${data.orphanet}`}
                    label={`Orphanet ${data.orphanet}`}
                  />
                )}
                {data.omim && (
                  <ExternalLinkButton
                    href={`https://www.omim.org/entry/${data.omim}`}
                    label={`OMIM ${data.omim}`}
                  />
                )}
                {data.mondo && (
                  <ExternalLinkButton
                    href={`https://monarchinitiative.org/${data.mondo}`}
                    label="MONDO"
                  />
                )}
                {data.example_id && (
                  <Link
                    to={data.example_kind === 'gene' ? `/gene/${data.example_id}` : `/variant/${data.example_id}`}
                    className="pill pill-sm"
                  >
                    <Activity className="w-12 h-12" aria-hidden="true" />
                    Exemplo: {data.example_id}
                  </Link>
                )}
              </div>
            </header>

            {/* Genes causais: dado vivo (constraint gnomAD) */}
            <section className="mb-24" aria-labelledby="causal-title">
              <div className="flex items-start justify-between mb-4">
                <h2 id="causal-title" className="section-title">Genes causais</h2>
                <span className="text-12 text-muted mono">gnomAD r4</span>
              </div>
              <p className="text-12 text-muted mb-16">
                Restrição de cada gene causal, medida pela gnomAD. LOEUF baixo (e pLI alto) indica
                genes que toleram pouco perder função, onde variantes graves têm mais chance de
                causar doença. Clique num gene para ver variantes, estrutura e frequências.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
                {data.causal_genes.map((g) => (
                  <CausalGeneCard key={g.symbol} gene={g} />
                ))}
              </div>
            </section>

            {/* Variantes patogênicas por gene causal (assíncrono) */}
            <PathogenicVariantsSection id={id} />

            {/* Sinais clínicos (HPO) */}
            {data.hpo.length > 0 && (
              <section className="card" aria-labelledby="hpo-title">
                <h2 id="hpo-title" className="section-title mb-4 flex items-center gap-8">
                  <Stethoscope className="w-16 h-16 text-muted" aria-hidden="true" />
                  Sinais e manifestações
                </h2>
                <p className="text-12 text-muted mb-16">
                  Principais achados clínicos associados (curados). O mapeamento completo para HPO e
                  Orphanet está na Fase 1 do roadmap.
                </p>
                <div className="flex flex-wrap gap-8">
                  {data.hpo.map((h) => (
                    <span key={h} className="pill pill-solid pill-sm">{h}</span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
