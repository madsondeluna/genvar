import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Icon from '../components/Icon'
import { fetchGene, fetchVariant } from '../api/client'
import { useSearchHistory } from '../hooks/useSearchHistory'
import PageNav from '../components/PageNav'
import UnifiedSearch from '../components/UnifiedSearch'
import SuggestBox from '../components/SuggestBox'
import { useScrolled } from '../hooks/useScrolled'

const GENE_EXAMPLES = ['MLH1', 'HBB', 'MSH2', 'VHL', 'LDLR', 'RB1']
const VARIANT_EXAMPLES = ['rs334', 'rs1800562', 'rs6025', 'rs1799853']

// Atalhos para o módulo de Doenças Raras (ids do catálogo em rare_diseases.py)
const DISEASE_SHORTCUTS = [
  { id: 'sindrome-de-lynch', name: 'Síndrome de Lynch' },
  { id: 'hipercolesterolemia-familiar', name: 'Hipercolesterolemia familiar' },
  { id: 'anemia-falciforme', name: 'Anemia falciforme' },
  { id: 'von-hippel-lindau', name: 'von Hippel-Lindau' },
  { id: 'hemocromatose-hereditaria', name: 'Hemocromatose hereditária' },
  { id: 'fibrose-cistica', name: 'Fibrose cística' },
]

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

  function openDisease(id) {
    navigate(`/doenca/${id}`)
  }

  return (
    <main className="min-h-screen bg-bg">
      <PageNav showSearch={false} />
      <div className="max-w-xl mx-auto px-24 py-48 pb-96">

        <header className="mb-48 stagger stagger-fade">
          <p className="eyebrow mb-12">Explorador de variantes genéticas</p>
          {/* a marca mora na barra, em todas as páginas, e só lá: o hero
              repetia o mesmo símbolo em outro tamanho e outro lugar */}
          <h1 className="display text-40 mb-12">GenVar</h1>
          <p className="text-15 leading-normal">
            <strong className="text-text font-medium">3.739 doenças raras, 434 painéis de genes e
            6.982 escores poligênicos</strong>, em português, cruzados ao vivo com Ensembl, gnomAD,
            ClinVar, AlphaFold e UniProt. Digite um gene, um rs ID ou o nome de uma doença e receba
            de uma vez o <strong className="text-text font-medium">significado clínico</strong>, a
            <strong className="text-text font-medium"> frequência na população</strong>, a
            <strong className="text-text font-medium"> restrição gênica</strong> e a
            <strong className="text-text font-medium"> estrutura da proteína</strong>. Sem cadastro
            e sem custo.
          </p>
        </header>

        <section className="card fade-up mb-24" aria-labelledby="unified-search-title">
          <div className="flex items-center gap-12 mb-16">
            <div className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
              <Icon name="search" size="md" className="text-muted" />
            </div>
            <h2 id="unified-search-title" className="text-16 font-medium text-text">Busca unificada</h2>
          </div>
          <UnifiedSearch full placeholder="Gene (ex.: BRCA1), variante (ex.: rs334) ou doença (ex.: Lynch)" />
          <p className="text-12 mt-12">
            Um só campo: reconhece símbolo de gene, rs ID de variante ou nome de doença e leva para
            a página certa.
          </p>
        </section>

        <p className="label mb-12">Busca específica</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-24 mb-48 stagger">

          <section className="card fade-up" aria-labelledby="gene-search-title">
            <div className="flex items-center gap-12 mb-16">
              <div className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
                <Icon name="helix" size="md" className="text-muted" />
              </div>
              <h2 id="gene-search-title" className="text-16 font-medium text-text">Buscar gene</h2>
            </div>
            <form onSubmit={handleGeneSearch} className="flex flex-col gap-12">
              <label htmlFor="gene-input" className="field-label">Símbolo HGNC do gene</label>
              <SuggestBox
                id="gene-input"
                inputClassName="input mono"
                label="Símbolo HGNC do gene"
                placeholder="ex.: BRCA1"
                value={geneInput}
                onChange={setGeneInput}
                kinds={['gene']}
                onPick={(item, rota) => navigate(rota)}
              />
              <button type="submit" className="pill w-full">
                <Icon name="search" />
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
                <Icon name="chart-line" size="md" className="text-muted" />
              </div>
              <h2 id="variant-search-title" className="text-16 font-medium text-text">Buscar variante</h2>
            </div>
            <form onSubmit={handleVariantSearch} className="flex flex-col gap-12">
              <label htmlFor="variant-input" className="field-label">Identificador rs do dbSNP</label>
              <SuggestBox
                id="variant-input"
                inputClassName="input mono"
                label="Identificador rs do dbSNP"
                placeholder="ex.: rs429358"
                value={variantInput}
                onChange={setVariantInput}
                kinds={['variant']}
                onPick={(item, rota) => navigate(rota)}
              />
              <button type="submit" className="pill w-full">
                <Icon name="search" />
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

        <section className="mb-48 fade-up" aria-labelledby="diseases-title">
          <div className="flex items-center justify-between gap-16 mb-12 flex-wrap">
            <h2 id="diseases-title" className="label">Comece por uma doença</h2>
            <button
              type="button"
              onClick={() => navigate('/doencas')}
              className="link-muted mono text-12"
            >
              Ver todas
            </button>
          </div>
          <div className="flex flex-wrap gap-8">
            {DISEASE_SHORTCUTS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => openDisease(d.id)}
                className="pill pill-solid pill-sm"
                aria-label={`Abrir a doença ${d.name}`}
              >
                <Icon name="helix" className="text-muted" />
                {d.name}
              </button>
            ))}
          </div>
        </section>

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
                    <Icon name="helix" className="text-muted" />
                  ) : (
                    <Icon name="chart-line" className="text-muted" />
                  )}
                  <span className="mono text-12 text-muted">{c.id}</span>
                </span>
                <span className="text-14 font-medium text-text">{c.name}</span>
                <span className="text-12 leading-snug">{c.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {entries.length > 0 && (
          <section className="fade-up" aria-labelledby="recent-title">
            <div className="flex items-center gap-16 mb-12">
              <h2 id="recent-title" className="label flex items-center gap-8">
                <Icon name="clock" />
                Buscas recentes
              </h2>
              <button
                type="button"
                onClick={clear}
                className="link-muted mono text-12 flex items-center gap-4"
                aria-label="Limpar histórico de busca"
              >
                <Icon name="close" />
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
                    <Icon name="helix" className="text-muted" />
                  ) : (
                    <Icon name="chart-line" className="text-muted" />
                  )}
                  {entry.value}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Os créditos saíram daqui: a página Sobre os tem por inteiro,
            com formação, orientação e o enquadramento do MVP. */}

      </div>

      <footer className="app-footer app-footer-reveal" data-visible={String(scrolled)}>
        <div className="max-w-xl mx-auto px-24 py-12 flex items-center justify-center gap-24 flex-wrap">
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
