import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import ManhattanPlot from '../burden/ManhattanPlot'
import FilterBar from '../burden/FilterBar'
import ForestPlot from '../burden/ForestPlot'
import BiobankMap from '../burden/BiobankMap'
import { loadGenes, loadPhenotypes, loadAllResults, loadAllAncestries, loadBiobanks, loadProvenance, buildGenomeLayout } from '../burden/data'
import { seFromBetaLp, heterogeneity, i2Tier } from '../burden/stats'
import { toCsv, downloadCsv } from '../utils/csv'
import {
  TESTS, MASK_LABEL, ANCESTRY_LABEL, ANCESTRY_SHORT, ANCESTRY_COLOR, DEFAULTS,
  LP_CAUCHY, LP_BONFERRONI, LP_SUGGEST,
} from '../burden/constants'

const BURDEN_TEST = TESTS.indexOf('Burden')
// Ancestrias que entram como estudos no forest (a 'All' e a meta; non_EUR e um
// agrupamento, nao um estudo).
const STUDY_ANC = ['EUR', 'AFR', 'AMR', 'EAS', 'SAS']

// Localiza a linha (gene, fenotipo, mascara, maf, teste) numa tabela colunar.
function findRow(tbl, geneIdx, phenoIdx, maskIndex, mafIndex, testIdx) {
  if (!tbl) return null
  const n = tbl.lp.length
  for (let i = 0; i < n; i++) {
    if (tbl.gene_idx[i] === geneIdx && tbl.pheno_idx[i] === phenoIdx &&
        tbl.mask_idx[i] === maskIndex && tbl.maf_idx[i] === mafIndex &&
        tbl.test_idx[i] === testIdx) {
      // se real quando o ETL o inclui; senao null (reconstruido de beta+p).
      return { beta: tbl.beta[i], lp: tbl.lp[i], se: tbl.se ? tbl.se[i] : null }
    }
  }
  return null
}

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

// O menor double positivo é 4,9e-324, então todo p abaixo disso chega aqui
// grudado nesse valor. Imprimi-lo como se fosse a medida é afirmar precisão que
// o formato não tem: 74 linhas do conjunto atual estão nesse teto, com p reais
// que diferem por ordens de grandeza e foram todos achatados no mesmo número.
// Acima do teto o que se pode dizer é o limite, não o valor.
const LP_TETO = 320
const noTeto = (lp) => lp >= LP_TETO
const fmtP = (lp) => (noTeto(lp) ? '< 1e-320' : Math.pow(10, -lp).toExponential(1))

export default function AssociationPage() {
  const [filters, setFilters] = useState({
    ancestry: DEFAULTS.ancestry,
    maskIndex: DEFAULTS.maskIndex,
    mafIndex: DEFAULTS.mafIndex,
    test: DEFAULTS.test,
    phenoIndex: 'all',
  })
  // Gene + fenotipo selecionados para o forest cross-ancestry.
  const [selected, setSelected] = useState(null)

  const genesQ = useQuery({ queryKey: ['burden', 'genes'], queryFn: loadGenes, staleTime: Infinity })
  const phenosQ = useQuery({ queryKey: ['burden', 'phenotypes'], queryFn: loadPhenotypes, staleTime: Infinity })
  const biobanksQ = useQuery({ queryKey: ['burden', 'biobanks'], queryFn: loadBiobanks, staleTime: Infinity })
  const provQ = useQuery({ queryKey: ['burden', 'provenance'], queryFn: loadProvenance, staleTime: Infinity })
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

  // Seleciona um gene + fenotipo (do plot ou da tabela) para o forest.
  const select = (p) => setSelected({ geneIdx: p.geneIdx, phenoIdx: p.phenoIdx })

  // Exporta o conjunto filtrado (todas as associacoes) para CSV.
  const exportCsv = () => {
    const sorted = [...points].sort((a, b) => b.lp - a.lp)
    const columns = [
      { label: 'gene', get: (p) => genes.symbols[p.geneIdx] },
      { label: 'fenotipo', get: (p) => phenos[p.phenoIdx]?.name || '' },
      { label: 'beta', get: (p) => p.beta.toFixed(4) },
      { label: 'p', get: (p) => fmtP(p.lp) },
      { label: 'menos_log10_p', get: (p) => p.lp.toFixed(2) },
      { label: 'evidencia', get: (p) => tierOf(p.lp).label },
    ]
    downloadCsv(
      `genvar-associacao-${filters.ancestry}-${filters.test}.csv`,
      toCsv(sorted, columns),
    )
  }

  // Carrega todas as ancestrias so quando ha selecao (para o forest).
  const allAncQ = useQuery({
    queryKey: ['burden', 'allAncestries'],
    queryFn: loadAllAncestries,
    enabled: !!selected,
    staleTime: Infinity,
  })

  // Monta o modelo do forest: efeito Burden por ancestria com IC de 95%
  // (se reconstruido de beta e p), meta pela linha 'All' e heterogeneidade I^2.
  const forest = useMemo(() => {
    if (!selected || !allAncQ.data) return null
    const byAnc = allAncQ.data
    const mk = (anc) => {
      const row = findRow(byAnc[anc], selected.geneIdx, selected.phenoIdx, filters.maskIndex, filters.mafIndex, BURDEN_TEST)
      if (!row) return null
      // se real do dado quando disponivel; senao reconstruido de beta e p.
      const se = (row.se != null && row.se > 0) ? row.se : seFromBetaLp(row.beta, row.lp)
      return {
        anc, label: ANCESTRY_SHORT[anc], color: ANCESTRY_COLOR[anc],
        beta: row.beta, se, lo: row.beta - 1.96 * se, hi: row.beta + 1.96 * se,
      }
    }
    const studies = STUDY_ANC.map(mk).filter(Boolean)
    const metaRaw = mk('All')
    const meta = metaRaw ? { ...metaRaw, isMeta: true } : null
    if (!studies.length && !meta) return { empty: true }
    const het = heterogeneity(studies)
    return { studies, meta, het }
  }, [selected, allAncQ.data, filters.maskIndex, filters.mafIndex])

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade flex flex-col gap-24">

        <header>
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="chart-line" />
            Associação por burden · beta
          </p>
          <h1 className="display mb-12">Associação gene-fenótipo</h1>
          <p className="text-15 leading-normal">
            Resultados de burden de variantes raras por gene, meta-analisados por
            ancestria (inclusive latina/miscigenada das Américas e mundial). Cada
            ponto do Manhattan é um gene; a altura é a força da evidência de
            associação com o fenótipo. Ajuste os filtros para ver a máscara
            funcional, o limite de frequência e o teste estatístico.
          </p>
          {provQ.data?.fonte && (
            <p className="label mt-8">
              Fonte: {provQ.data.fonte}
              {provQ.data.versao ? ` · ${provQ.data.versao}` : ''}
              {provQ.data.data ? ` · atualizado em ${provQ.data.data}` : ''}
              {provQ.data.escopo ? ` · ${provQ.data.escopo}` : ''}
            </p>
          )}
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
                onSelect={select}
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
                  Sugestivo a partir de p &lt; 1e-4, que é também o piso do arquivo
                </ThresholdKey>
              </div>

              <p className="text-12 leading-snug">
                Como ler: o eixo vertical é -log10(p), então quanto mais alto o
                ponto, mais improvável que a associação seja acaso. Acima da linha
                tracejada vermelha o sinal é robusto mesmo corrigindo todos os
                testes; entre as duas linhas é significativo por gene. Clique num
                ponto para ver o efeito por ancestria.
              </p>
              <p className="text-12 leading-snug">
                <strong className="text-text font-medium">
                  Este recorte guarda apenas os testes com p ≤ 1e-4.
                </strong>{' '}
                Um Manhattan completo mostra uma nuvem densa de pontos não
                significativos, e é o contraste com ela que dá escala aos picos.
                Aqui a nuvem não existe: ela foi cortada na geração do arquivo,
                não pelos filtros da tela. Nenhum ponto visível é ruído, e nenhuma
                ausência de ponto significa gene testado e negativo, porque o gene
                testado e negativo simplesmente não está no arquivo. O conjunto
                completo, sem corte, roda pelo mesmo ETL com a opção que inclui
                todos os genes.
              </p>
            </section>

            {selected && (
              <ForestSection
                selected={selected}
                genes={genes}
                phenos={phenos}
                maskIndex={filters.maskIndex}
                mafIndex={filters.mafIndex}
                forest={forest}
                loading={allAncQ.isLoading}
                onClose={() => setSelected(null)}
              />
            )}

            <section className="flex flex-col gap-12">
              <div className="flex items-baseline justify-between gap-16 flex-wrap">
                <h2 className="section-title">Maiores sinais</h2>
                <span className="flex items-center gap-12">
                  <p className="label">{points.length} associações no filtro</p>
                  {points.length > 0 && (
                    <button type="button" className="pill pill-sm" onClick={exportCsv}>
                      <Icon name="download" />
                      Exportar CSV
                    </button>
                  )}
                </span>
              </div>

              {topHits.length === 0 ? (
                <p className="text-14">
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
                            onClick={() => select(p)}
                            title="Ver efeito por ancestria"
                          >
                            <td className="table-cell">
                              <Link
                                to={`/gene/${sym}`}
                                className="mono font-medium hover:underline"
                                onClick={(e) => e.stopPropagation()}
                                title={`Abrir a pagina do gene ${sym}`}
                              >
                                {sym}
                              </Link>
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

            {biobanksQ.data?.biobanks && (
              <BiobankSection biobanks={biobanksQ.data.biobanks} />
            )}
          </>
        )}
      </div>
    </main>
  )
}

// Mapa mundial dos biobancos e a camada de cobertura por ancestria, com
// destaque para AMR (latina/miscigenada das Americas).
function BiobankSection({ biobanks }) {
  const totals = {}
  let grand = 0
  for (const b of biobanks) {
    for (const [k, v] of Object.entries(b.ancestry_n || {})) {
      totals[k] = (totals[k] || 0) + (v || 0)
      grand += v || 0
    }
  }
  // ordem de exibicao: AMR primeiro para dar destaque, depois por tamanho.
  const order = Object.keys(totals).sort((a, b) => {
    if (a === 'AMR') return -1
    if (b === 'AMR') return 1
    return totals[b] - totals[a]
  })
  const amr = totals.AMR || 0
  const fmt = (n) => n.toLocaleString('pt-BR')

  return (
    <section className="card flex flex-col gap-16">
      <div className="flex items-baseline justify-between gap-16 flex-wrap">
        <h2 className="section-title">Biobancos e ancestrias</h2>
        <p className="label">{biobanks.length} biobancos · {fmt(grand)} amostras</p>
      </div>

      <BiobankMap biobanks={biobanks} />

      <div className="flex flex-col gap-8">
        <span className="label">Cobertura por ancestria (amostras somadas)</span>
        {/* barra empilhada da composicao global por ancestria */}
        <div className="flex" style={{ height: 10, borderRadius: 'var(--radius-control)', overflow: 'hidden' }}>
          {order.map((k) => (
            <span
              key={k}
              title={`${ANCESTRY_LABEL[k] || k}: ${fmt(totals[k])}`}
              style={{ width: `${(totals[k] / grand) * 100}%`, background: ANCESTRY_COLOR[k] || 'var(--muted)' }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-16 gap-y-6">
          {order.map((k) => (
            <span key={k} className="flex items-center gap-6 text-12">
              <span aria-hidden="true" style={{
                width: 10, height: 10, borderRadius: 2, background: ANCESTRY_COLOR[k] || 'var(--muted)',
                display: 'inline-block',
              }} />
              {ANCESTRY_LABEL[k] || k}: {fmt(totals[k])}
            </span>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-4">
        <span className="label">Camada latina (AMR)</span>
        <p className="text-14 text-text">
          {fmt(amr)} amostras de ancestria latina/miscigenada das Américas
          ({((amr / grand) * 100).toFixed(1)}% do total), distribuídas entre os
          biobancos com essa cobertura. É a base que permite estimar o efeito
          nessa população no forest cross-ancestry.
        </p>
      </div>

      <p className="text-12 leading-snug">
        Cada marcador é um biobanco na sua coordenada real, com o tamanho
        proporcional à amostra e a cor da ancestria predominante. Passe o mouse
        para ver país, tamanho e as principais ancestrias.
      </p>
    </section>
  )
}

// Forest cross-ancestry do gene + fenotipo selecionado, com metrica de
// heterogeneidade (I^2) e a sua escala do que e bom ou ruim.
function ForestSection({ selected, genes, phenos, maskIndex, mafIndex, forest, loading, onClose }) {
  const sym = genes.symbols[selected.geneIdx]
  const ph = phenos[selected.phenoIdx]?.name || ''
  const het = forest && !forest.empty ? forest.het : null
  const tier = het ? i2Tier(het.i2) : null

  return (
    <section className="card flex flex-col gap-16">
      <div className="flex items-start justify-between gap-16">
        <div>
          <h2 className="section-title">Efeito por ancestria</h2>
          <p className="text-13 mt-4">
            <Link to={`/gene/${sym}`} className="mono font-medium hover:underline">{sym}</Link>
            {ph ? <> · {ph}</> : null} · {MASK_LABEL[maskIndex]} · teste Burden
          </p>
        </div>
        <button
          type="button"
          className="pill pill-sm"
          onClick={onClose}
          aria-label="Fechar o forest"
        >
          <Icon name="close" />
          Fechar
        </button>
      </div>

      {loading && <LoadingSpinner message="Carregando efeito por ancestria..." />}

      {!loading && forest?.empty && (
        <p className="text-14">
          Sem estimativa de efeito Burden para este gene e fenótipo nesta máscara.
          Troque a máscara ou escolha outro sinal.
        </p>
      )}

      {!loading && forest && !forest.empty && (
        <>
          <ForestPlot studies={forest.studies} meta={forest.meta} />

          {het && forest.studies.length >= 2 && (
            <div className="flex flex-col gap-8">
              <div className="flex items-center justify-between gap-16 flex-wrap">
                <span className="label">Heterogeneidade entre ancestrias (I²)</span>
                <span className={`pill pill-sm tint-${tier.key}`}>
                  {het.i2.toFixed(0)}% · {tier.label}
                </span>
              </div>
              {/* escala do bom ao ruim: baixa (consistente) a alta (diverge) */}
              <I2Scale i2={het.i2} />
              <p className="text-12 leading-snug">
                O I² mede quanto os efeitos divergem entre as ancestrias além do
                acaso. Abaixo de 25% os resultados são consistentes (o efeito
                genético se transfere entre populações); acima de 75% divergem
                bastante, sinal de que o efeito depende da ancestria e a meta deve
                ser lida com cautela.
              </p>
            </div>
          )}

          <p className="text-12 leading-snug">
            Cada quadrado é a estimativa de efeito (beta) do teste Burden numa
            ancestria; a reta é o intervalo de confiança de 95%, reconstruído de
            beta e p. O losango é a meta-análise (todas as ancestrias). Quando o
            intervalo cruza a linha do zero, o efeito não é distinguível de nulo
            naquela população. AMR é a ancestria latina/miscigenada das Américas.
          </p>
        </>
      )}
    </section>
  )
}

// Escala visual do I^2: faixa de 0 a 100% com marcador na posicao atual.
function I2Scale({ i2 }) {
  const stops = [
    { to: 25, key: 'good' },
    { to: 50, key: 'warning' },
    { to: 75, key: 'serious' },
    { to: 100, key: 'critical' },
  ]
  let prev = 0
  return (
    <div className="relative" style={{ height: 10 }}>
      <div className="flex" style={{ height: 6, borderRadius: 'var(--radius-control)', overflow: 'hidden' }}>
        {stops.map((s) => {
          const w = s.to - prev; prev = s.to
          return (
            <span
              key={s.key}
              style={{ width: `${w}%`, background: `var(--state-${s.key})`, opacity: 0.55 }}
            />
          )
        })}
      </div>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: -2, left: `${Math.min(100, Math.max(0, i2))}%`,
          width: 2, height: 10, background: 'var(--text)', transform: 'translateX(-1px)',
        }}
      />
    </div>
  )
}

function ThresholdKey({ color, dash, children }) {
  return (
    <span className="flex items-center gap-8 text-12">
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
