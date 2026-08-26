import { NavLink } from 'react-router-dom'
import { Home, Dna, Layers } from 'lucide-react'

// Menu de seções compartilhado entre as barras (páginas internas e home).
// Um único ponto de verdade para os destinos de topo do produto.
const LINKS = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/doencas', label: 'Doenças Raras', icon: Dna },
  { to: '/produtos', label: 'Produtos', icon: Layers },
]

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
    </nav>
  )
}
