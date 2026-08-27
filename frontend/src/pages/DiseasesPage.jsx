import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import Icon from '../components/Icon'
import { fetchDiseases, fetchDiseaseStats } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import SuggestBox from '../components/SuggestBox'
import LoadingSpinner from '../components/LoadingSpinner'
import CatalogOverview from '../components/CatalogOverview'
import { inheritanceMeta, INHERITANCE_ORDER } from '../utils/inheritance'
import { seriesSlot, seriesStyle } from '../utils/seriesSlot'

const PAGE_SIZE = 30

// Hub do modulo de Doencas Raras: busca e facetas resolvidas no servidor, com
// paginacao "carregar mais", para aguentar o catalogo completo do Orphanet.
export default function DiseasesPage() {
  const navigate = useNavigate()
  // mesma queryKey do CatalogOverview: o react-query serve do cache e nao ha
  // segunda ida a rede so para descobrir a ordem canonica das categorias
  const statsQ = useQuery({
    queryKey: ['disease-stats'],
    queryFn: fetchDiseaseStats,
    staleTime: 1000 * 60 * 30,
  })
  const categoryKeys = (statsQ.data?.by_category ?? []).map((c) => c.key)
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
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="molecule" />
            Doenças Raras · beta
          </p>
          <h1 className="display mb-12">Doenças e mutações raras</h1>
          <p className="text-15 leading-normal">
            Catálogo de doenças monogênicas com genes causais, padrão de herança e referências
            (Orphanet, OMIM, MONDO). Cada doença conecta aos genes e variantes reunidos pelo GenVar
            a partir de Ensembl, gnomAD e ClinVar.
          </p>
        </header>

        {/* Busca e heranca na mesma linha. A heranca virou seletor: sao dez
            opcoes mutuamente exclusivas, e dez botoes com o nome por extenso
            viravam uma parede de pilulas maior que o proprio conteudo. O nome
            completo continua visivel, dentro do seletor, e a marca colorida
            aparece no cartao de cada doenca. */}
        <div className="card mb-24 flex items-end gap-16 flex-wrap">
          <div className="flex items-center gap-8 flex-1 min-w-0" style={{ flex: '1 1 24rem' }}>
            <Icon name="search" className="text-muted" />
            <SuggestBox
              className="flex-1"
              inputClassName="input"
              label="Buscar doença ou gene"
              placeholder="Buscar por doença, categoria ou gene (ex.: BRCA1, câncer)"
              value={query}
              onChange={setQuery}
              kinds={['disease','gene']}
              onPick={(item, rota) => navigate(rota)}
            />
          </div>
          <label className="flex flex-col gap-4 min-w-0" style={{ flex: '0 1 16rem' }}>
            <span className="label">Herança</span>
            <span className="select-shell">
              <select
                className="select"
                value={inh}
                onChange={(e) => setInh(e.target.value)}
              >
                <option value="all">Todas as heranças</option>
                {INHERITANCE_ORDER.map((code) => {
                  const m = inheritanceMeta(code)
                  return <option key={code} value={code}>{m.short} · {m.label}</option>
                })}
              </select>
            </span>
          </label>
        </div>

        <CatalogOverview />

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
                    className="card tint-series hover-surface flex flex-col gap-8 cursor-pointer"
                    style={seriesStyle(seriesSlot(d.category, categoryKeys))}
                  >
                    <span className="flex items-center justify-between gap-8">
                      <span className="eyebrow">{d.category}</span>
                      {d.inheritance && (
                        <span className="tag tag-series" style={seriesStyle(m.slot)} title={m.label}>{m.short}</span>
                      )}
                    </span>
                    <span className="text-16 font-medium text-text">{d.name}</span>
                    {d.short && <span className="text-12 leading-snug">{d.short}</span>}
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
              <p className="text-14 mt-16">
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
