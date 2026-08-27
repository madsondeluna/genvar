import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Icon from '../components/Icon'
import { fetchPanel } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'

// Faixa do LOEUF: <=0.35 muito restrito (intolerante a perda de funcao),
// <=0.6 restrito, acima disso tolerante. Mesma convencao da pagina de doenca.
function loeufBand(v) {
  if (v == null) return { key: 'neutral', label: 'Sem dado' }
  if (v <= 0.35) return { key: 'critical', label: 'Muito restrito' }
  if (v <= 0.6) return { key: 'serious', label: 'Restrito' }
  if (v <= 1.0) return { key: 'warning', label: 'Intermediario' }
  return { key: 'good', label: 'Tolerante' }
}

function GeneCard({ g }) {
  const band = loeufBand(g.loeuf)
  return (
    <Link
      to={`/gene/${g.symbol}`}
      className="card hover-surface flex flex-col gap-8 cursor-pointer"
    >
      <span className="flex items-center justify-between gap-8">
        <span className="mono font-medium text-text">{g.symbol}</span>
        <span className={`pill pill-sm tint-${band.key === 'neutral' ? 'neutral' : band.key}`}>
          {band.label}
        </span>
      </span>
      {g.constraint_available ? (
        <div className="flex gap-16">
          <span className="flex flex-col">
            <span className="label">LOEUF</span>
            <span className="value num">{g.loeuf != null ? g.loeuf.toFixed(2) : '-'}</span>
          </span>
          <span className="flex flex-col">
            <span className="label">pLI</span>
            <span className="value num">{g.pli != null ? g.pli.toFixed(2) : '-'}</span>
          </span>
        </div>
      ) : (
        <span className="text-12">Constraint indisponível (fonte externa).</span>
      )}
    </Link>
  )
}

export default function PanelPage() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['panel', id],
    queryFn: () => fetchPanel(id),
    retry: 1,
    staleTime: 1000 * 60 * 30,
  })

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade flex flex-col gap-24">
        <Link to="/paineis" className="pill pill-sm self-start">
          <Icon name="arrow-left" />
          Painéis
        </Link>

        {error && <ErrorAlert message={error.message} />}
        {isLoading && <LoadingSpinner message="Carregando painel..." />}

        {data && (
          <>
            <header>
              <p className="eyebrow mb-8 flex items-center gap-8">
                <Icon name="branch" />
                {data.category}
              </p>
              <h1 className="display mb-12">{data.name}</h1>
              {data.short && <p className="text-15 leading-normal">{data.short}</p>}
              <div className="flex flex-wrap gap-8 mt-12">
                {data.inheritance && <span className="pill pill-sm tint-neutral">{data.inheritance}</span>}
                <span className="pill pill-sm tint-neutral">{data.genes.length} genes</span>
                {!data.degraded && (
                  <span className="pill pill-sm tint-serious">
                    {data.constrained_count} restritos a perda de função
                  </span>
                )}
              </div>
            </header>

            {data.digenic && (
              <section className="card tint-warning flex items-start gap-12">
                <Icon name="branch" size="md" style={{ color: 'var(--state-warning)' }} />
                <div>
                  <p className="label mb-4">Herança digênica / oligogênica</p>
                  <p className="text-14 text-text leading-snug">{data.digenic}</p>
                </div>
              </section>
            )}

            <section className="flex flex-col gap-12">
              <div className="flex items-baseline justify-between gap-16 flex-wrap">
                <h2 className="section-title">Genes do painel</h2>
                <p className="label">restrição por gene (LOEUF/pLI)</p>
              </div>
              {data.degraded && (
                <p className="text-12">
                  A restrição por gene (gnomAD) está indisponível no momento; os
                  genes e a estrutura do painel seguem abaixo.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                {data.panel_genes.map((g) => <GeneCard key={g.symbol} g={g} />)}
              </div>
              <p className="text-12 leading-snug">
                LOEUF mede a tolerância do gene a perda de função: quanto menor,
                mais o gene é conservado (variantes que o desligam tendem a ser
                deletérias). Até 0,35 é muito restrito; acima de 1,0, tolerante.
              </p>
            </section>

            {data.conditions.length > 0 && (
              <section className="flex flex-col gap-12">
                <h2 className="section-title">Condições relacionadas</h2>
                <div className="flex flex-col gap-8">
                  {data.conditions.map((c) => (
                    c.disease_id ? (
                      <Link
                        key={c.name}
                        to={`/doenca/${c.disease_id}`}
                        className="card hover-surface flex items-center justify-between gap-8 cursor-pointer"
                      >
                        <span className="text-14 text-text">{c.name}</span>
                        <span className="pill pill-sm">ver doença</span>
                      </Link>
                    ) : (
                      <div key={c.name} className="card flex items-center gap-8">
                        <span className="text-14 text-text">{c.name}</span>
                      </div>
                    )
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
