import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { useViewMode, setViewMode } from '../hooks/useViewMode'

// Menu de seções compartilhado entre as barras (páginas internas e home).
// Um único ponto de verdade para os destinos de topo do produto. Icones da
// linguagem Pure (nomes do sprite).
const LINKS = [
  { to: '/', label: 'Início', icon: 'grid', end: true },
  { to: '/doencas', label: 'Doenças Raras', icon: 'helix' },
  { to: '/paineis', label: 'Painéis', icon: 'branch' },
  { to: '/poligenico', label: 'Poligênico', icon: 'sparkle' },
  { to: '/associacao', label: 'Associação', icon: 'chart-bar' },
  { to: '/produtos', label: 'Produtos', icon: 'list' },
  { to: '/status', label: 'Status', icon: 'chart-line' },
]

// Alterna o modo de leitura global (linguagem simples x tecnico completo).
function ModeToggle() {
  const mode = useViewMode()
  return (
    <div className="flex items-center gap-4" role="group" aria-label="Modo de leitura">
      <button
        type="button"
        onClick={() => setViewMode('paciente')}
        className={`pill pill-sm ${mode === 'paciente' ? 'pill-solid' : ''}`}
        aria-pressed={mode === 'paciente'}
        title="Linguagem simples, para pacientes e familias"
      >
        <Icon name="user" />
        Paciente
      </button>
      <button
        type="button"
        onClick={() => setViewMode('profissional')}
        className={`pill pill-sm ${mode === 'profissional' ? 'pill-solid' : ''}`}
        aria-pressed={mode === 'profissional'}
        title="Detalhe tecnico completo, para profissionais"
      >
        <Icon name="shield" />
        Profissional
      </button>
    </div>
  )
}

export default function AppMenu({ className = '' }) {
  return (
    <nav className={`flex items-center gap-8 flex-wrap ${className}`} aria-label="Seções">
      {LINKS.map(({ to, label, icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `pill pill-sm ${isActive ? 'pill-solid' : ''}`
          }
        >
          <Icon name={icon} />
          {label}
        </NavLink>
      ))}
      <ModeToggle />
    </nav>
  )
}
