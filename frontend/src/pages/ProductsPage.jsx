import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import { fetchDiseaseStats, fetchPanelStats, fetchPgsScores, fetchSources } from '../api/client'
import { seriesStyle } from '../utils/seriesSlot'

// Aba Produtos (marketing, sem auth): apresenta as linhas do GenVar rumo a SaaS
// e explica como o raro (monogênico) e o poligênico se relacionam.
const LINES = [
  {
    id: 'raras',
    slot: 1,
    icon: 'helix',
    name: 'Doenças e mutações raras',
    tag: 'Monogênico',
    status: { label: 'Beta disponível', tint: 'tint-good' },
    to: '/doencas',
    desc: 'Catálogo curado de doenças monogênicas com genes causais, herança e referências, '
        + 'ligado às variantes patogênicas, à restrição gênica e à estrutura proteica já '
        + 'reunidas pelo GenVar.',
    bullets: [
      'Busca por doença, gene ou variante em uma única interface',
      'Restrição gênica (LOEUF/pLI) ao vivo da gnomAD',
      'Ponte para ClinVar, Ensembl, AlphaFold e UniProt',
    ],
  },
  {
    id: 'multigenico',
    slot: 2,
    icon: 'branch',
    name: 'Doenças multigênicas',
    tag: 'Multigênico',
    status: { label: 'Beta disponível', tint: 'tint-good' },
    to: '/paineis',
    desc: 'Painéis de genes e visão digênica/oligogênica para condições em que mais de um gene '
        + 'contribui para o fenótipo, com priorização por evidência.',
    bullets: [
      'Painéis de genes por condição',
      'Herança complexa e modificadores',
      'Evidência gene-doença agregada',
    ],
  },
  {
    id: 'poligenico',
    slot: 3,
    icon: 'sparkle',
    name: 'Fatores poligênicos',
    tag: 'Poligênico / PGS',
    status: { label: 'Beta disponível', tint: 'tint-good' },
    to: '/poligenico',
    desc: 'Escores poligênicos (PGS) e distribuições de risco por ancestria, integrados ao '
        + 'PGS Catalog, com interpretação individual calibrada.',
    bullets: [
      'Integração com o PGS Catalog',
      'Distribuições de PRS ajustadas por ancestria',
      'PheWAS por escore poligênico',
    ],
  },
]

function StatusBadge({ status }) {
  return <span className={`pill pill-sm ${status.tint}`}>{status.label}</span>
}

// O que ja esta no ar, contado na propria API e nao escrito a mao: numero em
// pagina de produto envelhece no dia seguinte ao commit se for constante.
function Entregues() {
  const doencas = useQuery({ queryKey: ['disease-stats'], queryFn: fetchDiseaseStats, staleTime: 1000 * 60 * 30 })
  const paineis = useQuery({ queryKey: ['panel-stats'], queryFn: fetchPanelStats, staleTime: 1000 * 60 * 30 })
  const pgs = useQuery({ queryKey: ['pgs', 'all'], queryFn: () => fetchPgsScores({ category: 'all' }), staleTime: 1000 * 60 * 30 })
  const fontes = useQuery({ queryKey: ['sources'], queryFn: fetchSources, staleTime: 1000 * 60 * 60 })

  const n = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'))
  const linhas = [
    { slot: 1, to: '/doencas', valor: n(doencas.data?.total), rotulo: 'doenças raras',
      nota: `${n(doencas.data?.total_genes)} genes causais` },
    { slot: 2, to: '/paineis', valor: n(paineis.data?.total), rotulo: 'painéis de genes',
      nota: `${n(paineis.data?.total_genes)} genes distintos` },
    { slot: 3, to: '/poligenico', valor: n(pgs.data?.total), rotulo: 'escores poligênicos',
      nota: 'com ancestria de desenvolvimento' },
    { slot: 4, to: '/associacao', valor: '44', rotulo: 'fenótipos em burden',
      nota: '20.033 genes, 10 biobancos' },
    { slot: 5, to: '/fontes', valor: n(fontes.data?.items?.length), rotulo: 'bases integradas',
      nota: 'licença e citação por fonte' },
  ]

  return (
    <section className="mb-32" aria-labelledby="entregues-title">
      <h2 id="entregues-title" className="section-title mb-4">O que já está no ar</h2>
      <p className="text-14 leading-normal mb-16">
        Números lidos da API neste momento, não fixados na página. O beta é público e gratuito.
      </p>
      <div
        className="grid gap-16"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}
      >
        {linhas.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="card tint-series hover-surface flex flex-col gap-4 cursor-pointer"
            style={seriesStyle(l.slot)}
          >
            <span className="text-32 mono num text-text leading-none">{l.valor}</span>
            <span className="text-14 text-text">{l.rotulo}</span>
            <span className="label">{l.nota}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="sparkle" />
            Produtos
          </p>
          <h1 className="display mb-12">Do gene ao risco, em um só lugar</h1>
          <p className="text-15 leading-normal">
            O GenVar começa pelas doenças e mutações raras e evolui para uma plataforma que une o
            monogênico, o multigênico e o poligênico: a base genética completa de uma condição.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 mb-32 stagger">
          {LINES.map((l) => {
            const card = (
              <>
                <span className="flex items-center justify-between gap-8 mb-4">
                  <span className="w-40 h-40 series-mark rounded-media flex items-center justify-center">
                    <Icon name={l.icon} size="md" />
                  </span>
                  <StatusBadge status={l.status} />
                </span>
                <span className="eyebrow">{l.tag}</span>
                <span className="text-16 font-medium text-text">{l.name}</span>
                <span className="text-12 leading-snug">{l.desc}</span>
                <span className="flex flex-col gap-6 mt-8">
                  {l.bullets.map((b) => (
                    <span key={b} className="text-12 flex items-start gap-6">
                      <span aria-hidden="true">·</span>{b}
                    </span>
                  ))}
                </span>
                {l.to && (
                  <span className="pill pill-sm mt-8 self-start">
                    Explorar <Icon name="arrow-right" />
                  </span>
                )}
              </>
            )
            return l.to ? (
              <Link key={l.id} to={l.to} className="card tint-series hover-surface fade-up flex flex-col gap-8 cursor-pointer"
                style={{ '--series': `var(--chart-${l.slot})` }}>
                {card}
              </Link>
            ) : (
              <div key={l.id} className="card tint-series fade-up flex flex-col gap-8"
                style={{ '--series': `var(--chart-${l.slot})` }}>{card}</div>
            )
          })}
        </div>

        <Entregues />

        {/* Como raro e poligênico se relacionam */}
        <section className="card mb-24" aria-labelledby="rel-title">
          <h2 id="rel-title" className="section-title mb-4">Como o raro e o poligênico se relacionam</h2>
          <p className="text-14 leading-normal mb-16">
            Uma mesma doença raramente é só monogênica ou só poligênica. Uma variante rara de grande
            efeito define o principal risco, mas o <span className="text-text font-medium">fundo
            poligênico</span>, a soma de muitas variantes comuns de pequeno efeito, modula quem, de
            fato, adoece. É por isso que portadores da mesma mutação têm evoluções diferentes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="rounded-media border border-border p-16 flex flex-col gap-4 tint-series"
                 style={{ '--series': 'var(--chart-1)' }}>
              <p className="label">Variante rara</p>
              <p className="text-13 leading-snug">
                Grande efeito, baixa frequência. Define a suscetibilidade monogênica (ex.: LDLR na
                hipercolesterolemia familiar).
              </p>
            </div>
            <div className="rounded-media border border-border p-16 flex flex-col gap-4 tint-series"
                 style={{ '--series': 'var(--chart-2)' }}>
              <p className="label">Fundo poligênico (PGS)</p>
              <p className="text-13 leading-snug">
                Muitas variantes comuns de pequeno efeito. Desloca o risco para cima ou para baixo em
                cada indivíduo.
              </p>
            </div>
            <div className="rounded-media border border-border p-16 flex flex-col gap-4 tint-series"
                 style={{ '--series': 'var(--chart-3)' }}>
              <p className="label">Penetrância observada</p>
              <p className="text-13 leading-snug">
                O resultado clínico é a combinação dos dois, ainda calibrada por ancestria e
                ambiente. É o que o GenVar quer mostrar em uma só tela.
              </p>
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}
