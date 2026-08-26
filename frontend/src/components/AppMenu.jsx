import { NavLink } from 'react-router-dom'
import { Home, Dna, Layers, Activity, User, Stethoscope } from 'lucide-react'
import { useViewMode, setViewMode } from '../hooks/useViewMode'

// Menu de seções compartilhado entre as barras (páginas internas e home).
// Um único ponto de verdade para os destinos de topo do produto.
const LINKS = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/doencas', label: 'Doenças Raras', icon: Dna },
  { to: '/produtos', label: 'Produtos', icon: Layers },
  { to: '/status', label: 'Status', icon: Activity },
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
        <User className="w-12 h-12" aria-hidden="true" />
        Paciente
      </button>
      <button
        type="button"
        onClick={() => setViewMode('profissional')}
        className={`pill pill-sm ${mode === 'profissional' ? 'pill-solid' : ''}`}
        aria-pressed={mode === 'profissional'}
        title="Detalhe tecnico completo, para profissionais"
      >
        <Stethoscope className="w-12 h-12" aria-hidden="true" />
        Profissional
      </button>
    </div>
  )
}

export default function AppMenu({ className = '' }) {
  return (
    <nav className={`flex items-center gap-8 flex-wrap ${className}`} aria-label="Seções">
      {LINKS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `pill pill-sm ${isActive ? 'pill-solid' : ''}`
          }
        >
          <Icon className="w-12 h-12" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
      <ModeToggle />
    </nav>
  )
}
