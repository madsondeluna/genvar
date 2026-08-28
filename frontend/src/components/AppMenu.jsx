import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { useColorMode, toggleColorMode } from '../hooks/useColorMode'

// Menu de seções compartilhado entre as barras (páginas internas e home).
// Um único ponto de verdade para os destinos de topo do produto. Icones da
// linguagem Pure (nomes do sprite).
//
// UMA fileira com os doze. Coube depois de medir o que sobrava e cortar nos
// três lugares que não custam leitura: a marca voltou a 24px, a folga entre as
// colunas da barra caiu de 16 para 8, e a pilula do menu perdeu 4px de cada
// lado. Somam 97px, que era exatamente o quanto faltava em 1280.
const LINKS = [
  { to: '/', label: 'Início', icon: 'grid', end: true },
  { to: '/doencas', label: 'Doenças Raras', icon: 'helix' },
  { to: '/paineis', label: 'Painéis', icon: 'branch' },
  { to: '/poligenico', label: 'Poligênico', icon: 'sparkle' },
  { to: '/associacao', label: 'Associação', icon: 'chart-bar' },
  { to: '/vcf', label: 'VCF', icon: 'file' },
  { to: '/lote', label: 'Lote', icon: 'list' },
  { to: '/produtos', label: 'Produtos', icon: 'grid' },
  { to: '/status', label: 'Status', icon: 'chart-line' },
  { to: '/fontes', label: 'Fontes', icon: 'book' },
  { to: '/sobre', label: 'Sobre', icon: 'info' },
  { to: '/colabore', label: 'Colabore', icon: 'users' },
]

// Alterna entre o modo claro e o escuro (grafite neutro da linguagem Pure).
// Controle so de icone: o rotulo acessivel fica no botao, nao no desenho.
function ColorModeToggle() {
  const mode = useColorMode()
  const dark = mode === 'dark'
  return (
    <button
      type="button"
      onClick={toggleColorMode}
      className="pill pill-sm hit"
      aria-pressed={dark}
      aria-label={dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      title={dark ? 'Modo claro' : 'Modo escuro'}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  )
}

export { ColorModeToggle }

export default function AppMenu({ className = '' }) {
  return (
    <nav className={`barra-menu flex items-center gap-8 flex-wrap ${className}`} aria-label="Seções">
      {LINKS.map(({ to, label, icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `pill pill-sm ${isActive ? 'pill-solid' : ''}`}
        >
          <Icon name={icon} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
