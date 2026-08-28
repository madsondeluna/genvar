import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Icon from '../components/Icon'
import { fetchPgsScores, fetchPgsInterplay } from '../api/client'
import PageNav from '../components/PageNav'
import { seriesSlot, seriesStyle } from '../utils/seriesSlot'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'


// Pagina do Poligenico: escores PGS (semente curada, detalhe canonico no PGS
// Catalog) e a relacao raro x poligenico (modulacao de penetrancia), que e o
// diferencial da plataforma.
export default function PolygenicPage() {
  const [category, setCategory] = useState('all')
  const scoresQ = useQuery({
    queryKey: ['pgs', category],
    queryFn: () => fetchPgsScores({ category }),
    staleTime: 1000 * 60 * 10,
  })
  const interQ = useQuery({
    queryKey: ['pgs-interplay'],
    queryFn: fetchPgsInterplay,
    staleTime: 1000 * 60 * 30,
  })

  const scores = scoresQ.data?.items ?? []
  const categories = scoresQ.data?.by_category ?? []
  // ordem canonica das categorias: cada uma recebe sempre o mesmo slot
  const categoryKeys = categories.map((c) => c.key)
  const interplay = interQ.data?.items ?? []

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade flex flex-col gap-24">

        <header>
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="sparkle" />
            Poligênico · beta
          </p>
          <h1 className="display mb-12">Escores poligênicos e penetrância</h1>
          <p className="text-15 leading-normal">
            Um escore poligênico (PGS) soma o efeito de muitas variantes comuns de
            pequeno efeito para estimar a predisposição a um traço ou doença. Aqui
            reunimos escores públicos notáveis e, sobretudo, como o fundo
            poligênico modula a penetrância de uma variante rara monogênica.
          </p>
        </header>

        {/* Diferencial: raro x poligenico, primeiro por ser o mais estrategico */}
        <section className="flex flex-col gap-12">
          <h2 className="section-title">Raro x poligênico</h2>
          <p className="text-13">
            Por que portadores da mesma mutação têm quadros diferentes: o escore
            poligênico se soma ao efeito monogênico e ajuda a explicar a penetrância.
          </p>
          {interQ.isLoading && <LoadingSpinner />}
          {interQ.error && <ErrorAlert message={interQ.error.message} />}
          <div className="flex flex-col gap-12">
            {interplay.map((it) => (
              <div key={it.condition} className="card tint-serious flex items-start gap-12">
                <Icon name="branch" size="md" style={{ color: 'var(--state-serious)' }} />
                <div className="flex flex-col gap-8">
                  <span className="flex items-center gap-8 flex-wrap">
                    {it.disease_id ? (
                      <Link to={`/doenca/${it.disease_id}`} className="text-15 font-medium text-text hover:underline">
                        {it.condition}
                      </Link>
                    ) : (
                      <span className="text-15 font-medium text-text">{it.condition}</span>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-6">
                    {it.monogenic.map((g) => (
                      <Link key={g} to={`/gene/${g}`} className="pill pill-solid pill-sm mono">{g}</Link>
                    ))}
                  </span>
                  <p className="text-13 leading-snug">{it.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Escores poligenicos publicos */}
        <section className="flex flex-col gap-12">
          <div className="flex items-baseline justify-between gap-16 flex-wrap">
            <h2 className="section-title">Escores poligênicos</h2>
            <p className="label">detalhe canônico no PGS Catalog</p>
          </div>

          <div className="flex flex-wrap gap-8" role="group" aria-label="Filtrar por categoria">
            <button
              type="button"
              className={`pill pill-sm ${category === 'all' ? 'pill-solid' : ''}`}
              onClick={() => setCategory('all')}
            >
              Todas
            </button>
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`pill pill-sm ${category === c.key ? 'pill-solid' : ''}`}
                onClick={() => setCategory(c.key)}
              >
                {c.label} ({c.count})
              </button>
            ))}
          </div>

          {scoresQ.isLoading && <LoadingSpinner />}
          {scoresQ.error && <ErrorAlert message={scoresQ.error.message} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
            {/* Link INTERNO. Antes o card levava para a página do PGS Catalog,
                e isso entregava a leitura a outro site: o que se precisa saber
                sobre um escore está numa API pública, e mandar o usuário embora
                para ler é abrir mão da entrega. A procedência não se perde, ela
                fica declarada na nossa página, que também traz o link canônico.

                O comentário fica AQUI e não dentro do `map`: o corpo de uma
                seta com parênteses é uma expressão só, e um comentário JSX
                dentro dele é um segundo filho sem elemento que o contenha. */}
            {scores.map((s) => (
              <Link
                key={s.id}
                to={`/escore/${s.id}`}
                className="card tint-series hover-surface flex flex-col gap-8"
                style={seriesStyle(seriesSlot(s.category, categoryKeys))}
              >
                <span className="flex items-center justify-between gap-8">
                  <span className="eyebrow">{s.category}</span>
                  <span className="pill pill-sm tint-neutral mono">{s.id}</span>
                </span>
                <span className="text-16 font-medium text-text">{s.trait}</span>
                {s.short && <span className="text-12 leading-snug">{s.short}</span>}
                <span className="flex items-center justify-between gap-8 mt-4">
                  <span className="label">{s.citation}</span>
                  <span className="text-12 flex items-center gap-4">
                    {s.n_variants != null
                      ? `${s.n_variants.toLocaleString('pt-BR')} variantes`
                      : 'abrir o escore'}
                    <Icon name="arrow-right" />
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="text-12 leading-snug">
            Os escores e suas métricas (número de variantes, ancestrias das
            amostras, desempenho) são mantidos pelo PGS Catalog e atualizados na
            fonte; cada card abre a página canônica do escore.
          </p>
        </section>
      </div>
    </main>
  )
}
