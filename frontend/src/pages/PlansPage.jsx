import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'

// Pagina de Planos (marketing). Sem cobranca nem autenticacao no beta: os
// planos pagos ficam como "em breve". O nucleo de auth/billing e um passo
// dedicado, fora do beta publico.
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 'Gratuito',
    tagline: 'Para explorar e pesquisar.',
    tint: 'tint-good',
    cta: { label: 'Comecar agora', to: '/' },
    features: [
      'Busca de genes, variantes e doencas',
      'Catalogo de doencas raras e paineis de genes',
      'Associacao por burden e escores poligenicos',
      'Contexto Brasil (SUS, triagem neonatal)',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Em breve',
    tagline: 'Para uso clinico e de pesquisa intensivo.',
    tint: 'tint-serious',
    highlight: true,
    cta: { label: 'Em breve', to: null },
    features: [
      'Tudo do Free',
      'Exportacao de tabelas e figuras',
      'Historico e listas salvas',
      'Acesso a API publica com limites ampliados',
      'Suporte prioritario',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Sob consulta',
    tagline: 'Para instituicoes e times.',
    tint: 'tint-neutral',
    cta: { label: 'Em breve', to: null },
    features: [
      'Tudo do Pro',
      'Traga seus proprios dados (BYOD)',
      'Multiusuario e controle de acesso',
      'Integracao e SLA dedicado',
    ],
  },
]

export default function PlansPage() {
  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 flex flex-col gap-24">
        <header>
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="sparkle" />
            Planos
          </p>
          <h1 className="display mb-12">Planos e acesso</h1>
          <p className="text-15 leading-normal">
            O beta e publico e gratuito. Os planos pagos, com exportacao, API
            ampliada e dados proprios, entram numa fase seguinte; abaixo a
            estrutura pretendida.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`card flex flex-col gap-16 ${p.highlight ? p.tint : ''}`}
            >
              <div className="flex flex-col gap-4">
                <span className="section-title">{p.name}</span>
                <span className="text-20 font-medium text-text">{p.price}</span>
                <span className="text-12">{p.tagline}</span>
              </div>
              <ul className="flex flex-col gap-8 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-8 text-13 text-text">
                    <Icon name="check" className="mt-2" style={{ color: 'var(--state-good)' }} />
                    {f}
                  </li>
                ))}
              </ul>
              {p.cta.to ? (
                <Link to={p.cta.to} className="pill pill-solid self-start">{p.cta.label}</Link>
              ) : (
                <span className="pill pill-sm tint-neutral self-start">{p.cta.label}</span>
              )}
            </div>
          ))}
        </div>

        <section className="card flex flex-col gap-8">
          <h2 className="section-title">API publica</h2>
          <p className="text-14 leading-normal">
            O GenVar ja expoe uma API REST publica (a mesma que alimenta o site):
            genes, variantes, doencas, paineis, associacao por burden e escores
            poligenicos. A documentacao interativa fica em <span className="mono">/docs</span> no
            servidor da API. Limites por plano e chaves de acesso entram junto do
            plano Pro.
          </p>
          <Link to="/produtos" className="pill pill-sm self-start">Ver as linhas do produto</Link>
        </section>

        <p className="text-12 leading-snug">
          Autenticacao, cobranca e multiusuario nao fazem parte do beta publico:
          sao um passo dedicado, com as decisoes de provedor de identidade,
          pagamento e isolamento de dados a definir.
        </p>
      </div>
    </main>
  )
}
