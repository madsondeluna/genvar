import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dna, Search, FlaskConical } from 'lucide-react'
import { fetchDiseases } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import { inheritanceMeta, INHERITANCE_ORDER } from '../utils/inheritance'

// Hub do módulo de Doenças Raras (beta): catálogo curado com busca por nome/gene
// e facetas por padrão de herança. Cada cartão leva ao detalhe /doenca/{id}.
export default function DiseasesPage() {
  const [searchParams] = useSearchParams()
  // A busca unificada pode cair aqui com ?q=; pre-preenche o filtro.
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [inh, setInh] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['diseases'],
    queryFn: fetchDiseases,
    staleTime: 1000 * 60 * 30,
  })

  const diseases = data || []

  // Facetas de herança presentes no catálogo, na ordem canônica.
  const facets = useMemo(() => {
    const present = new Set(diseases.map((d) => d.inheritance))
    return INHERITANCE_ORDER.filter((code) => present.has(code))
  }, [diseases])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return diseases.filter((d) => {
      if (inh !== 'all' && d.inheritance !== inh) return false
      if (!q) return true
      const hay = `${d.name} ${d.category} ${d.genes.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [diseases, query, inh])

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
            Catálogo curado de doenças monogênicas com genes causais, padrão de herança e
            referências (Orphanet, OMIM, MONDO). Cada doença conecta aos genes e variantes já
            reunidos pelo GenVar a partir de Ensembl, gnomAD e ClinVar.
          </p>
        </header>

        {/* Busca + facetas */}
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
            {facets.map((code) => {
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

        {isLoading && <LoadingSpinner />}
        {error && <ErrorAlert message={error.message} />}

        {!isLoading && !error && (
          <>
            <p className="label mb-12">
              {filtered.length} {filtered.length === 1 ? 'doença' : 'doenças'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 stagger">
              {filtered.map((d) => {
                const m = inheritanceMeta(d.inheritance)
                return (
                  <Link
                    key={d.id}
                    to={`/doenca/${d.id}`}
                    className="card hover-surface fade-up flex flex-col gap-8 cursor-pointer"
                  >
                    <span className="flex items-center justify-between gap-8">
                      <span className="eyebrow">{d.category}</span>
                      <span className={`pill pill-sm ${m.tint}`} title={m.label}>{m.short}</span>
                    </span>
                    <span className="text-16 font-medium text-text flex items-center gap-8">
                      <Dna className="w-16 h-16 text-muted flex-shrink-0" aria-hidden="true" />
                      {d.name}
                    </span>
                    <span className="text-12 text-muted leading-snug">{d.short}</span>
                    <span className="flex flex-wrap gap-6 mt-4">
                      {d.genes.slice(0, 5).map((g) => (
                        <span key={g} className="pill pill-solid pill-sm mono">{g}</span>
                      ))}
                    </span>
                  </Link>
                )
              })}
            </div>
            {filtered.length === 0 && (
              <p className="text-14 text-muted mt-16">
                Nenhuma doença corresponde ao filtro. Ajuste a busca ou o padrão de herança.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
