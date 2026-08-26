import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Dna, Search, FlaskConical } from 'lucide-react'
import { fetchDiseases } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import { inheritanceMeta, INHERITANCE_ORDER } from '../utils/inheritance'

const PAGE_SIZE = 30

// Hub do modulo de Doencas Raras: busca e facetas resolvidas no servidor, com
// paginacao "carregar mais", para aguentar o catalogo completo do Orphanet.
export default function DiseasesPage() {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [debounced, setDebounced] = useState(query.trim())
  const [inh, setInh] = useState('all')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])

  // debounce da busca; qualquer mudanca volta para a pagina 1
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => { setPage(1) }, [inh])

  const { data, isFetching, error } = useQuery({
    queryKey: ['diseases', debounced, inh, page],
    queryFn: () => fetchDiseases({ q: debounced, inheritance: inh, page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 10,
  })

  // acumula as paginas; a pagina 1 reinicia a lista (nova busca/faceta)
  useEffect(() => {
    if (!data) return
    setItems((prev) => (data.page === 1 ? data.items : [...prev, ...data.items]))
  }, [data])

  const total = data?.total ?? 0
  const hasMore = items.length < total

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <FlaskConical className="w-12 h-12" aria-hidden="true" />
            Doenças Raras · beta
          </p>
          <h1 className="display mb-12">Doenças e mutações raras</h1>
          <p className="text-15 text-muted leading-normal">
            Catálogo de doenças monogênicas com genes causais, padrão de herança e referências
            (Orphanet, OMIM, MONDO). Cada doença conecta aos genes e variantes reunidos pelo GenVar
            a partir de Ensembl, gnomAD e ClinVar.
          </p>
        </header>

        <div className="card mb-24 flex flex-col gap-16">
          <div className="flex items-center gap-8">
            <Search className="w-16 h-16 text-muted" aria-hidden="true" />
            <label htmlFor="disease-search" className="sr-only">Buscar doença ou gene</label>
            <input
              id="disease-search"
              type="text"
              className="input flex-1"
              placeholder="Buscar por doença, categoria ou gene (ex.: BRCA1, câncer)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-8" role="group" aria-label="Filtrar por herança">
            <button
              type="button"
              className={`pill pill-sm ${inh === 'all' ? 'pill-solid' : ''}`}
              onClick={() => setInh('all')}
            >
              Todas
            </button>
            {INHERITANCE_ORDER.map((code) => {
              const m = inheritanceMeta(code)
              return (
                <button
                  key={code}
                  type="button"
                  className={`pill pill-sm ${inh === code ? 'pill-solid' : ''}`}
                  onClick={() => setInh(code)}
                  title={m.label}
                >
                  {m.short}
                </button>
              )
            })}
          </div>
        </div>

        {error && <ErrorAlert message={error.message} />}
        {isFetching && items.length === 0 && <LoadingSpinner />}

        {!error && (items.length > 0 || !isFetching) && (
          <>
            <p className="label mb-12">
              {total} {total === 1 ? 'doença' : 'doenças'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              {items.map((d) => {
                const m = inheritanceMeta(d.inheritance)
                return (
                  <Link
                    key={d.id}
                    to={`/doenca/${d.id}`}
                    className="card hover-surface flex flex-col gap-8 cursor-pointer"
                  >
                    <span className="flex items-center justify-between gap-8">
                      <span className="eyebrow">{d.category}</span>
                      {d.inheritance && (
                        <span className={`pill pill-sm ${m.tint}`} title={m.label}>{m.short}</span>
                      )}
                    </span>
                    <span className="text-16 font-medium text-text flex items-center gap-8">
                      <Dna className="w-16 h-16 text-muted flex-shrink-0" aria-hidden="true" />
                      {d.name}
                    </span>
                    {d.short && <span className="text-12 text-muted leading-snug">{d.short}</span>}
                    <span className="flex flex-wrap gap-6 mt-4">
                      {d.genes.slice(0, 5).map((g) => (
                        <span key={g} className="pill pill-solid pill-sm mono">{g}</span>
                      ))}
                    </span>
                  </Link>
                )
              })}
            </div>

            {items.length === 0 && (
              <p className="text-14 text-muted mt-16">
                Nenhuma doença corresponde ao filtro. Ajuste a busca ou o padrão de herança.
              </p>
            )}

            {hasMore && (
              <div className="flex justify-center mt-24">
                <button
                  type="button"
                  className="pill"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isFetching}
                >
                  {isFetching ? 'Carregando...' : `Carregar mais (${items.length}/${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
