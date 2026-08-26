import { Link } from 'react-router-dom'
import { Dna, Layers, Network, ArrowRight, Sparkles } from 'lucide-react'
import PageNav from '../components/PageNav'

// Aba Produtos (marketing, sem auth): apresenta as linhas do GenVar rumo a SaaS
// e explica como o raro (monogênico) e o poligênico se relacionam.
const LINES = [
  {
    id: 'raras',
    icon: Dna,
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
    icon: Network,
    name: 'Doenças multigênicas',
    tag: 'Multigênico',
    status: { label: 'Em breve', tint: 'tint-warning' },
    to: null,
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
    icon: Layers,
    name: 'Fatores poligênicos',
    tag: 'Poligênico / PGS',
    status: { label: 'Em breve', tint: 'tint-warning' },
    to: null,
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

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Sparkles className="w-12 h-12" aria-hidden="true" />
            Produtos
          </p>
          <h1 className="display mb-12">Do gene ao risco, em um só lugar</h1>
          <p className="text-15 text-muted leading-normal">
            O GenVar começa pelas doenças e mutações raras e evolui para uma plataforma que une o
            monogênico, o multigênico e o poligênico — a base genética completa de uma condição.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 mb-32 stagger">
          {LINES.map((l) => {
            const Icon = l.icon
            const card = (
              <>
                <span className="flex items-center justify-between gap-8 mb-4">
                  <span className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
                    <Icon className="w-20 h-20 text-muted" aria-hidden="true" />
                  </span>
                  <StatusBadge status={l.status} />
                </span>
                <span className="eyebrow">{l.tag}</span>
                <span className="text-16 font-medium text-text">{l.name}</span>
                <span className="text-12 text-muted leading-snug">{l.desc}</span>
                <span className="flex flex-col gap-6 mt-8">
                  {l.bullets.map((b) => (
                    <span key={b} className="text-12 text-muted flex items-start gap-6">
                      <span aria-hidden="true">·</span>{b}
                    </span>
                  ))}
                </span>
                {l.to && (
                  <span className="pill pill-sm mt-8 self-start">
                    Explorar <ArrowRight className="w-12 h-12" aria-hidden="true" />
                  </span>
                )}
              </>
            )
            return l.to ? (
              <Link key={l.id} to={l.to} className="card hover-surface fade-up flex flex-col gap-8 cursor-pointer">
                {card}
              </Link>
            ) : (
              <div key={l.id} className="card fade-up flex flex-col gap-8">{card}</div>
            )
          })}
        </div>

        {/* Como raro e poligênico se relacionam */}
        <section className="card mb-24" aria-labelledby="rel-title">
          <h2 id="rel-title" className="section-title mb-4">Como o raro e o poligênico se relacionam</h2>
          <p className="text-14 text-muted leading-normal mb-16">
            Uma mesma doença raramente é só monogênica ou só poligênica. Uma variante rara de grande
            efeito define o principal risco, mas o <span className="text-text font-medium">fundo
            poligênico</span> — a soma de muitas variantes comuns de pequeno efeito — modula quem, de
            fato, adoece. É por isso que portadores da mesma mutação têm evoluções diferentes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="rounded-media border border-border p-16 flex flex-col gap-4">
              <p className="label">Variante rara</p>
              <p className="text-13 text-muted leading-snug">
                Grande efeito, baixa frequência. Define a suscetibilidade monogênica (ex.: LDLR na
                hipercolesterolemia familiar).
              </p>
            </div>
            <div className="rounded-media border border-border p-16 flex flex-col gap-4">
              <p className="label">Fundo poligênico (PGS)</p>
              <p className="text-13 text-muted leading-snug">
                Muitas variantes comuns de pequeno efeito. Desloca o risco para cima ou para baixo em
                cada indivíduo.
              </p>
            </div>
            <div className="rounded-media border border-border p-16 flex flex-col gap-4">
              <p className="label">Penetrância observada</p>
              <p className="text-13 text-muted leading-snug">
                O resultado clínico é a combinação dos dois, ainda calibrada por ancestria e
                ambiente. É o que o GenVar quer mostrar em uma só tela.
              </p>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="saas-title">
          <h2 id="saas-title" className="section-title mb-4">Para onde vamos</h2>
          <p className="text-14 text-muted leading-normal">
            O beta é público e gratuito. As próximas fases abrem API programática, exportação e a
            possibilidade de trazer seus próprios dados (burden, GWAS, PGS) para o mesmo ambiente,
            comparados com dados públicos de consórcios. O roadmap detalhado está em
            {' '}<span className="mono">ROADMAP.md</span> no repositório.
          </p>
        </section>
      </div>
    </main>
  )
}
