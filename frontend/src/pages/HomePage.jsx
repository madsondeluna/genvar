import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Search, Dna, Activity, Clock, X } from 'lucide-react'
import { fetchGene, fetchVariant } from '../api/client'
import { useSearchHistory } from '../hooks/useSearchHistory'
import BrandMorphNav from '../components/BrandMorphNav'
import { useScrolled } from '../hooks/useScrolled'

const GENE_EXAMPLES = ['MLH1', 'HBB', 'MSH2', 'VHL', 'LDLR', 'RB1']
const VARIANT_EXAMPLES = ['rs334', 'rs1800562', 'rs6025', 'rs1799853']

// Casos curados: porta de entrada com contexto clínico real
const SHOWCASE = [
  {
    kind: 'variant',
    id: 'rs334',
    name: 'Anemia falciforme',
    desc: 'Troca E6V na beta-globina (HBB); o exemplo clássico de variante missense patogênica.',
  },
  {
    kind: 'gene',
    id: 'MLH1',
    name: 'Síndrome de Lynch',
    desc: 'Gene de reparo de DNA; variantes de perda de função elevam o risco de câncer colorretal.',
  },
  {
    kind: 'variant',
    id: 'rs6025',
    name: 'Fator V de Leiden',
    desc: 'Variante do gene F5 associada a trombofilia hereditária, a mais comum em europeus.',
  },
  {
    kind: 'gene',
    id: 'LDLR',
    name: 'Hipercolesterolemia familiar',
    desc: 'Receptor de LDL; variantes patogênicas elevam o colesterol desde a infância.',
  },
  {
    kind: 'variant',
    id: 'rs1800562',
    name: 'Hemocromatose hereditária',
    desc: 'C282Y no gene HFE; sobrecarga de ferro com herança recessiva e penetrância variável.',
  },
  {
    kind: 'gene',
    id: 'VHL',
    name: 'Doença de von Hippel-Lindau',
    desc: 'Supressor tumoral; variantes germinativas predispõem a tumores altamente vascularizados.',
  },
]

export default function HomePage() {
  const heroSlotRef = useRef(null)
  const scrolled = useScrolled()
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
    <main className="min-h-screen bg-bg">
      <BrandMorphNav heroSlotRef={heroSlotRef} />
      <div className="max-w-lg mx-auto px-24 py-48 pb-96">

        <header className="mb-48 stagger stagger-fade">
          <p className="eyebrow mb-12">Explorador de variantes genéticas</p>
          {/* o slot reserva o espaço da marca; quem desenha é a barra, que
              traz o mesmo bloco para cá enquanto a página está no topo */}
          <h1 className="sr-only">GenVar Dashboard</h1>
          <div ref={heroSlotRef} className="mb-12" style={{ height: 'var(--space-56)' }} aria-hidden="true" />
          <p className="text-15 text-muted leading-normal">
            Ensembl, gnomAD, ClinVar, AlphaFold e UniProt em uma consulta única. Busque um símbolo
            de gene ou um rs ID para reunir significado clínico, frequências populacionais,
            métricas de restrição e estrutura proteica.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-24 mb-48 stagger">

          <section className="card fade-up" aria-labelledby="gene-search-title">
            <div className="flex items-center gap-12 mb-16">
              <div className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
                <Dna className="w-20 h-20 text-muted" aria-hidden="true" />
              </div>
              <h2 id="gene-search-title" className="text-16 font-medium text-text">Buscar gene</h2>
            </div>
            <form onSubmit={handleGeneSearch} className="flex flex-col gap-12">
              <label htmlFor="gene-input" className="field-label">Símbolo HGNC do gene</label>
              <input
                id="gene-input"
                type="text"
                className="input mono"
                placeholder="ex.: BRCA1"
                value={geneInput}
                onChange={(e) => setGeneInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="pill w-full">
                <Search className="w-16 h-16" aria-hidden="true" />
                Buscar gene
              </button>
            </form>
            <div className="mt-16 flex flex-wrap gap-8">
              {GENE_EXAMPLES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="pill pill-solid pill-sm"
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

          <section className="card fade-up" aria-labelledby="variant-search-title">
            <div className="flex items-center gap-12 mb-16">
              <div className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
                <Activity className="w-20 h-20 text-muted" aria-hidden="true" />
              </div>
              <h2 id="variant-search-title" className="text-16 font-medium text-text">Buscar variante</h2>
            </div>
            <form onSubmit={handleVariantSearch} className="flex flex-col gap-12">
              <label htmlFor="variant-input" className="field-label">Identificador rs do dbSNP</label>
              <input
                id="variant-input"
                type="text"
                className="input mono"
                placeholder="ex.: rs429358"
                value={variantInput}
                onChange={(e) => setVariantInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="pill w-full">
                <Search className="w-16 h-16" aria-hidden="true" />
                Buscar variante
              </button>
            </form>
            <div className="mt-16 flex flex-wrap gap-8">
              {VARIANT_EXAMPLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="pill pill-solid pill-sm"
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

        <section className="mb-48 fade-up" aria-labelledby="showcase-title">
          <h2 id="showcase-title" className="label mb-12">Casos de exemplo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 stagger">
            {SHOWCASE.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => (c.kind === 'gene' ? openGene(c.id) : openVariant(c.id))}
                onMouseEnter={() => (c.kind === 'gene' ? prefetchGene(c.id) : prefetchVariant(c.id))}
                onFocus={() => (c.kind === 'gene' ? prefetchGene(c.id) : prefetchVariant(c.id))}
                className="card hover-surface fade-up text-left flex flex-col gap-8 cursor-pointer"
              >
                <span className="flex items-center gap-8">
                  {c.kind === 'gene' ? (
                    <Dna className="w-12 h-12 text-muted" aria-hidden="true" />
                  ) : (
                    <Activity className="w-12 h-12 text-muted" aria-hidden="true" />
                  )}
                  <span className="mono text-12 text-muted">{c.id}</span>
                </span>
                <span className="text-14 font-medium text-text">{c.name}</span>
                <span className="text-12 text-muted leading-snug">{c.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {entries.length > 0 && (
          <section className="fade-up" aria-labelledby="recent-title">
            <div className="flex items-center gap-16 mb-12">
              <h2 id="recent-title" className="label flex items-center gap-8">
                <Clock className="w-12 h-12" aria-hidden="true" />
                Buscas recentes
              </h2>
              <button
                type="button"
                onClick={clear}
                className="link-muted mono text-12 flex items-center gap-4"
                aria-label="Limpar histórico de busca"
              >
                <X className="w-12 h-12" aria-hidden="true" />
                Limpar
              </button>
            </div>
            <div className="flex flex-wrap gap-8">
              {entries.map((entry) => (
                <button
                  key={`${entry.kind}-${entry.value}`}
                  type="button"
                  onClick={() => (entry.kind === 'gene' ? openGene(entry.value) : openVariant(entry.value))}
                  onMouseEnter={() =>
                    entry.kind === 'gene' ? prefetchGene(entry.value) : prefetchVariant(entry.value)
                  }
                  className="pill pill-solid pill-sm"
                >
                  {entry.kind === 'gene' ? (
                    <Dna className="w-12 h-12 text-muted" aria-hidden="true" />
                  ) : (
                    <Activity className="w-12 h-12 text-muted" aria-hidden="true" />
                  )}
                  {entry.value}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-48 fade-up" aria-labelledby="credits-title">
          <h2 id="credits-title" className="label mb-12">Créditos do projeto/MVP</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 items-stretch stagger">
            <div className="card fade-up h-full flex flex-col gap-8">
              <p className="label">Autor</p>
              <p className="text-14 font-medium text-text">Madson A. de Luna Aragão</p>
              <p className="text-12 text-muted leading-snug">
                Doutorando em Bioinformática (UFMG), estudante de MBA em Engenharia de Software
                (USP), especialista em Data Science &amp; Analytics (PUC-Rio), mestre em Genética
                e Biologia Molecular (UFPE) e biomédico (UFPE).
              </p>
            </div>
            <div className="card fade-up h-full flex flex-col gap-8">
              <p className="label">Orientação</p>
              <p className="text-14 font-medium text-text">Marcelo Pereira da Silva</p>
              <p className="text-12 text-muted leading-snug">
                Orientador do trabalho. Mestre em Ciência da Computação e doutorando em Ciência
                da Informação.
              </p>
            </div>
            <div className="card fade-up h-full flex flex-col gap-8">
              <p className="label">Programa</p>
              <p className="text-14 font-medium text-text">MBA em Engenharia de Software, USP</p>
              <p className="text-12 text-muted leading-snug">
                Este produto é o MVP apresentado como critério para obtenção do título de MBA em
                Engenharia de Software pela Universidade de São Paulo, em 2026.
              </p>
            </div>
          </div>
        </section>

      </div>

      <footer className="app-footer app-footer-reveal" data-visible={String(scrolled)}>
        <div className="max-w-lg mx-auto px-24 py-12 flex items-center justify-center gap-24 flex-wrap">
          <span className="text-12 text-muted mono flex items-center justify-center gap-16 flex-wrap">
            <a
              href="https://delunalab.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="link-muted underline underline-offset-2"
            >
              delunalab.dev
            </a>
            <a
              href="https://madsondeluna.com"
              target="_blank"
              rel="noopener noreferrer"
              className="link-muted underline underline-offset-2"
            >
              madsondeluna.com
            </a>
            <a
              href="https://github.com/madsondeluna/genvar"
              target="_blank"
              rel="noopener noreferrer"
              className="link-muted underline underline-offset-2"
            >
              github.com/madsondeluna/genvar
            </a>
          </span>
        </div>
      </footer>
    </main>
  )
}
