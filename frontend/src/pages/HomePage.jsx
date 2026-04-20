import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Dna, Activity, Clock, X } from 'lucide-react'
import { fetchGene, fetchVariant } from '../api/client'
import { useSearchHistory } from '../hooks/useSearchHistory'

const GENE_EXAMPLES = ['MLH1', 'HBB', 'MSH2', 'VHL', 'LDLR', 'RB1']
const VARIANT_EXAMPLES = ['rs334', 'rs1800562', 'rs6025', 'rs1799853']

export default function HomePage() {
  const [geneInput, setGeneInput] = useState('')
  const [variantInput, setVariantInput] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { entries, push, clear } = useSearchHistory()

  function prefetchGene(symbol) {
    queryClient.prefetchQuery({
      queryKey: ['gene', symbol],
      queryFn: () => fetchGene(symbol),
      staleTime: 1000 * 60 * 10,
    })
  }

  function prefetchVariant(rsid) {
    queryClient.prefetchQuery({
      queryKey: ['variant', rsid],
      queryFn: () => fetchVariant(rsid),
      staleTime: 1000 * 60 * 10,
    })
  }

  function handleGeneSearch(e) {
    e.preventDefault()
    const val = geneInput.trim().toUpperCase()
    if (!val) return
    push('gene', val)
    navigate(`/gene/${val}`)
  }

  function handleVariantSearch(e) {
    e.preventDefault()
    const val = variantInput.trim().toLowerCase()
    if (!val) return
    push('variant', val)
    navigate(`/variant/${val}`)
  }

  function openGene(symbol) {
    push('gene', symbol)
    navigate(`/gene/${symbol}`)
  }

  function openVariant(rsid) {
    push('variant', rsid)
    navigate(`/variant/${rsid}`)
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-20">

        <header className="mb-16">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-widest mb-3">
            Explorador de Variantes Genéticas
          </p>
          <h1 className="text-5xl font-bold text-gray-900 tracking-tight leading-tight mb-4">
            GenVar Dashboard
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed max-w-2xl">
            Dados agregados de genes e variantes a partir do Ensembl, gnomAD, ClinVar, AlphaFold e
            UniProt. Pesquise por símbolo de gene ou rs ID para consultar significado clínico,
            frequências populacionais, métricas de restrição e estrutura proteica.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">

          <section className="card" aria-labelledby="gene-search-title">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-md flex items-center justify-center">
                <Dna className="w-5 h-5 text-gray-700" aria-hidden="true" />
              </div>
              <div>
                <h2 id="gene-search-title" className="text-base font-semibold text-gray-900">Buscar Gene</h2>
                <p className="text-xs text-gray-600">Símbolo HGNC do gene</p>
              </div>
            </div>
            <form onSubmit={handleGeneSearch} className="flex flex-col gap-3">
              <label htmlFor="gene-input" className="sr-only">Símbolo do gene</label>
              <input
                id="gene-input"
                type="text"
                className="input"
                placeholder="ex.: BRCA1"
                value={geneInput}
                onChange={(e) => setGeneInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Search className="w-4 h-4" aria-hidden="true" />
                Buscar gene
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {GENE_EXAMPLES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:border-gray-400 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 transition-colors"
                  onClick={() => openGene(g)}
                  onMouseEnter={() => prefetchGene(g)}
                  onFocus={() => prefetchGene(g)}
                  aria-label={`Buscar gene ${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="variant-search-title">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-md flex items-center justify-center">
                <Activity className="w-5 h-5 text-gray-700" aria-hidden="true" />
              </div>
              <div>
                <h2 id="variant-search-title" className="text-base font-semibold text-gray-900">Buscar Variante</h2>
                <p className="text-xs text-gray-600">Identificador rs do dbSNP</p>
              </div>
            </div>
            <form onSubmit={handleVariantSearch} className="flex flex-col gap-3">
              <label htmlFor="variant-input" className="sr-only">rs ID da variante</label>
              <input
                id="variant-input"
                type="text"
                className="input"
                placeholder="ex.: rs429358"
                value={variantInput}
                onChange={(e) => setVariantInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Search className="w-4 h-4" aria-hidden="true" />
                Buscar variante
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {VARIANT_EXAMPLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:border-gray-400 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 transition-colors"
                  onClick={() => openVariant(v)}
                  onMouseEnter={() => prefetchVariant(v)}
                  onFocus={() => prefetchVariant(v)}
                  aria-label={`Buscar variante ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </section>
        </div>

        {entries.length > 0 && (
          <section className="mb-16" aria-labelledby="recent-title">
            <div className="flex items-center justify-between mb-3">
              <h2 id="recent-title" className="label flex items-center gap-2">
                <Clock className="w-3 h-3" aria-hidden="true" />
                Buscas recentes
              </h2>
              <button
                type="button"
                onClick={clear}
                className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 rounded"
                aria-label="Limpar histórico de busca"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                Limpar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {entries.map((entry) => (
                <button
                  key={`${entry.kind}-${entry.value}`}
                  type="button"
                  onClick={() => (entry.kind === 'gene' ? openGene(entry.value) : openVariant(entry.value))}
                  onMouseEnter={() =>
                    entry.kind === 'gene' ? prefetchGene(entry.value) : prefetchVariant(entry.value)
                  }
                  className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-700 hover:border-gray-400 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1 transition-colors flex items-center gap-1.5"
                >
                  <span className="text-gray-400">{entry.kind === 'gene' ? 'gene' : 'rs'}</span>
                  {entry.value}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="border-t border-gray-200 pt-12">
          <p className="label mb-6">Fontes de dados</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { name: 'Ensembl', desc: 'Anotação de genes' },
              { name: 'gnomAD', desc: 'Frequências populacionais' },
              { name: 'ClinVar', desc: 'Significado clínico' },
              { name: 'AlphaFold', desc: 'Estrutura proteica' },
              { name: 'UniProt', desc: 'Banco de proteínas' },
            ].map((src) => (
              <div key={src.name} className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-gray-900">{src.name}</p>
                <p className="text-xs text-gray-600">{src.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-100 flex flex-col items-center gap-1">
          <p className="text-xs text-gray-500">
            Desenvolvido por Madson A. de Luna Aragao
          </p>
          <p className="text-xs text-gray-500">
            <a
              href="https://github.com/madsondeluna/genvar"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-gray-900"
            >
              github.com/madsondeluna/genvar
            </a>
            <span className="mx-2 text-gray-300" aria-hidden="true">|</span>
            <span>v2.0.0</span>
          </p>
        </div>

      </div>
    </main>
  )
}
