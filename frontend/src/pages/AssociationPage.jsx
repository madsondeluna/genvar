import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Activity, ExternalLink } from 'lucide-react'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import ManhattanPlot from '../burden/ManhattanPlot'
import FilterBar from '../burden/FilterBar'
import { loadGenes, loadPhenotypes, loadAllResults, buildGenomeLayout } from '../burden/data'
import {
  TESTS, MASK_LABEL, ANCESTRY_LABEL, DEFAULTS,
  LP_CAUCHY, LP_BONFERRONI, LP_SUGGEST,
} from '../burden/constants'

// Pagina de associacao por burden: Manhattan genome-wide filtravel por
// ancestria, mascara, MAF e teste, com dados de ancestria latina (AMR) e
// mundial. Tabela de maiores sinais abaixo do plot. Cada metrica traz uma
// explicacao e uma escala do que e forte ou fraco.

// Classifica um sinal pelo -log10(p) contra os limiares do campo.
function tierOf(lp) {
  if (lp >= LP_BONFERRONI) return { key: 'critical', label: 'Significativo (Bonferroni)' }
  if (lp >= LP_CAUCHY) return { key: 'serious', label: 'Significativo (Cauchy)' }
  if (lp >= LP_SUGGEST) return { key: 'warning', label: 'Sugestivo' }
  return { key: 'neutral', label: 'Nao significativo' }
}

const fmtP = (lp) => Math.pow(10, -lp).toExponential(1)

export default function AssociationPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    ancestry: DEFAULTS.ancestry,
    maskIndex: DEFAULTS.maskIndex,
    mafIndex: DEFAULTS.mafIndex,
    test: DEFAULTS.test,
    phenoIndex: 'all',
  })

  const genesQ = useQuery({ queryKey: ['burden', 'genes'], queryFn: loadGenes, staleTime: Infinity })
  const phenosQ = useQuery({ queryKey: ['burden', 'phenotypes'], queryFn: loadPhenotypes, staleTime: Infinity })
  const resultsQ = useQuery({
    queryKey: ['burden', 'results', filters.ancestry],
    queryFn: () => loadAllResults(filters.ancestry),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  })

  const genes = genesQ.data
  const phenos = phenosQ.data?.phenotypes || []
  const results = resultsQ.data

  const layout = useMemo(() => (genes ? buildGenomeLayout(genes) : null), [genes])

  // Filtra as linhas colunares pelos indices selecionados; um ponto por gene.
  const points = useMemo(() => {
    if (!results) return []
    const testIdx = TESTS.indexOf(filters.test)
    const pheno = filters.phenoIndex === 'all' ? null : Number(filters.phenoIndex)
    const out = []
    const n = results.lp.length
    for (let i = 0; i < n; i++) {
      if (results.mask_idx[i] !== filters.maskIndex) continue
      if (results.maf_idx[i] !== filters.mafIndex) continue
      if (results.test_idx[i] !== testIdx) continue
      if (pheno != null && results.pheno_idx[i] !== pheno) continue
      out.push({
        geneIdx: results.gene_idx[i],
        phenoIdx: results.pheno_idx[i],
        lp: results.lp[i],
        beta: results.beta[i],
      })
    }
    return out
  }, [results, filters.maskIndex, filters.mafIndex, filters.test, filters.phenoIndex])

  // Maiores sinais para a tabela.
  const topHits = useMemo(
    () => [...points].sort((a, b) => b.lp - a.lp).slice(0, 25),
    [points],
  )

  const loading = genesQ.isLoading || phenosQ.isLoading || resultsQ.isLoading
  const error = genesQ.error || phenosQ.error || resultsQ.error

  const openGene = (p) => {
    const sym = genes?.symbols?.[p.geneIdx]
    if (sym) navigate(`/gene/${sym}`)
  }

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-4xl mx-auto px-24 py-32 pb-96 flex flex-col gap-24">

        <header>
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Activity className="w-12 h-12" aria-hidden="true" />
            Associação por burden · beta
          </p>
          <h1 className="display mb-12">Associação gene-fenótipo</h1>
          <p className="text-15 text-muted leading-normal">
            Resultados de burden de variantes raras por gene, meta-analisados por
            ancestria (inclusive latina/miscigenada das Américas e mundial). Cada
            ponto do Manhattan é um gene; a altura é a força da evidência de
            associação com o fenótipo. Ajuste os filtros para ver a máscara
            funcional, o limite de frequência e o teste estatístico.
          </p>
        </header>

        {error && <ErrorAlert message={error.message} />}
        {loading && <LoadingSpinner message="Carregando dados de associação..." />}

        {!loading && !error && genes && (
          <>
            <FilterBar
              phenotypes={phenos}
              ancestry={filters.ancestry}
              maskIndex={filters.maskIndex}
              mafIndex={filters.mafIndex}
              test={filters.test}
              phenoIndex={filters.phenoIndex}
              onChange={setFilters}
            />

            <section className="card flex flex-col gap-16">
              <div className="flex items-baseline justify-between gap-16 flex-wrap">
                <h2 className="section-title">Manhattan plot</h2>
                <p className="label">
                  {ANCESTRY_LABEL[filters.ancestry]} · {MASK_LABEL[filters.maskIndex]} · {filters.test}
                </p>
              </div>

              <ManhattanPlot
                points={points}
                genes={genes}
                layout={layout}
                phenos={phenos}
                onSelect={openGene}
              />

              {/* legenda dos limiares: o que e um sinal forte ou fraco */}
              <div className="flex flex-wrap gap-x-24 gap-y-8">
                <ThresholdKey color="var(--state-critical)" dash>
                  Significância por gene x máscara (Bonferroni, p &lt; 1,4e-7)
                </ThresholdKey>
                <ThresholdKey color="var(--state-serious)" dash>
                  Significância por gene (Cauchy, p &lt; 2,5e-6)
                </ThresholdKey>
                <ThresholdKey color="var(--muted)">
                  Sugestivo a partir de p &lt; 1e-4; abaixo disso, ruído esperado
                </ThresholdKey>
              </div>

              <p className="text-12 text-muted leading-snug">
                Como ler: o eixo vertical é -log10(p), então quanto mais alto o
                ponto, mais improvável que a associação seja acaso. Acima da linha
                tracejada vermelha o sinal é robusto mesmo corrigindo todos os
                testes; entre as duas linhas é significativo por gene; abaixo da
                faixa cinza o resultado não se distingue do esperado ao acaso.
                Clique num ponto para abrir o gene.
              </p>
            </section>

            <section className="flex flex-col gap-12">
              <div className="flex items-baseline justify-between gap-16 flex-wrap">
                <h2 className="section-title">Maiores sinais</h2>
                <p className="label">{points.length} associações no filtro</p>
              </div>

              {topHits.length === 0 ? (
                <p className="text-14 text-muted">
                  Nenhuma associação para esta combinação de filtros. Troque a
                  ancestria, a máscara ou o teste.
                </p>
              ) : (
                <div className="card p-0 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="table-header">Gene</th>
                        <th className="table-header">Fenótipo</th>
                        <th className="table-header num">beta</th>
                        <th className="table-header num">p</th>
                        <th className="table-header">Evidência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topHits.map((p, i) => {
                        const sym = genes.symbols[p.geneIdx]
                        const ph = phenos[p.phenoIdx]?.name || ''
                        const t = tierOf(p.lp)
                        return (
                          <tr
                            key={`${p.geneIdx}-${p.phenoIdx}-${i}`}
                            className="table-row cursor-pointer"
                            onClick={() => openGene(p)}
                          >
                            <td className="table-cell">
                              <span className="mono font-medium flex items-center gap-6">
                                {sym}
                                <ExternalLink className="w-12 h-12 text-muted" aria-hidden="true" />
                              </span>
                            </td>
                            <td className="table-cell">{ph}</td>
                            <td className="table-cell num">{p.beta.toFixed(3)}</td>
                            <td className="table-cell num">{fmtP(p.lp)}</td>
                            <td className="table-cell">
                              <span className={`pill pill-sm tint-${t.key === 'neutral' ? 'neutral' : t.key}`}>
                                {t.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function ThresholdKey({ color, dash, children }) {
  return (
    <span className="flex items-center gap-8 text-12 text-muted">
      <span
        aria-hidden="true"
        style={{
          width: 24, height: 0,
          borderTop: `2px ${dash ? 'dashed' : 'solid'} ${color}`,
          display: 'inline-block',
        }}
      />
      {children}
    </span>
  )
}
