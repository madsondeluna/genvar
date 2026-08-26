import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import Icon from '../components/Icon'
import { fetchPanels, fetchPanelStats } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'

const PAGE_SIZE = 30

// Hub de Paineis de genes (multigenico): busca e facetas por categoria, cards
// com a contagem de genes. Cada card leva ao detalhe agregado.
export default function PanelsPage() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const statsQ = useQuery({ queryKey: ['panel-stats'], queryFn: fetchPanelStats, staleTime: 1000 * 60 * 10 })
  const { data, isFetching, error } = useQuery({
    queryKey: ['panels', debounced, category],
    queryFn: () => fetchPanels({ q: debounced, category, page: 1, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 10,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const categories = statsQ.data?.by_category ?? []

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="list" />
            Multigênico · beta
          </p>
          <h1 className="display mb-12">Painéis de genes</h1>
          <p className="text-15 text-muted leading-normal">
            Grupos de genes que, juntos, respondem por uma condição ou por
            condições relacionadas. Cada painel agrega a restrição (LOEUF/pLI) de
            todos os seus genes e destaca a herança complexa e os efeitos
            digênicos/oligogênicos quando existem.
          </p>
          {statsQ.data && (
            <p className="label mt-8">
              {statsQ.data.total} painéis · {statsQ.data.total_genes} genes distintos
            </p>
          )}
        </header>

        <div className="card mb-24 flex flex-col gap-16">
          <div className="flex items-center gap-8">
            <Icon name="search" className="text-muted" />
            <label htmlFor="panel-search" className="sr-only">Buscar painel ou gene</label>
            <input
              id="panel-search"
              type="text"
              className="input flex-1"
              placeholder="Buscar por painel, categoria ou gene (ex.: MYH7, cancer)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
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
        </div>

        {error && <ErrorAlert message={error.message} />}
        {isFetching && items.length === 0 && <LoadingSpinner />}

        {!error && (
          <>
            <p className="label mb-12">{total} {total === 1 ? 'painel' : 'painéis'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              {items.map((p) => (
                <Link
                  key={p.id}
                  to={`/painel/${p.id}`}
                  className="card hover-surface flex flex-col gap-8 cursor-pointer"
                >
                  <span className="flex items-center justify-between gap-8">
                    <span className="eyebrow">{p.category}</span>
                    <span className="pill pill-sm tint-neutral">{p.gene_count} genes</span>
                  </span>
                  <span className="text-16 font-medium text-text">{p.name}</span>
                  {p.short && <span className="text-12 text-muted leading-snug">{p.short}</span>}
                  <span className="flex flex-wrap gap-6 mt-4">
                    {p.genes.slice(0, 6).map((g) => (
                      <span key={g} className="pill pill-solid pill-sm mono">{g}</span>
                    ))}
                    {p.genes.length > 6 && (
                      <span className="pill pill-sm tint-neutral">+{p.genes.length - 6}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>

            {items.length === 0 && !isFetching && (
              <p className="text-14 text-muted mt-16">
                Nenhum painel corresponde ao filtro. Ajuste a busca ou a categoria.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
