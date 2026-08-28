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

// Cicla os tres modos de cor: claro, azul profundo e grafite.
//
// Deixou de ser um interruptor de dois estados, entao `aria-pressed` saiu: ele
// descreve ligado ou desligado, e um controle de tres posicoes anunciado assim
// mente para o leitor de tela. O rotulo diz o modo ATUAL e para onde o toque
// leva, que e o que o interruptor booleano nao precisava dizer.
const PROXIMO = { light: 'azul profundo', 'deep-blue': 'grafite', dark: 'claro' }
const NOME = { light: 'Claro', 'deep-blue': 'Azul profundo', dark: 'Grafite' }
// Um ícone POR modo, e não o mesmo desenho em dois deles. Com a lua nos dois
// escuros o botão não dizia em qual dos dois se estava, e um controle que muda
// de estado sem mudar de aparência não é um controle: é um botão que às vezes
// funciona. O meio-círculo é o intermediário convencional, e a sequência lê
// como uma progressão: sol cheio, meia luz, noite.
const ICONE = { light: 'sun', 'deep-blue': 'contrast', dark: 'moon' }

function ColorModeToggle() {
  const mode = useColorMode()
  return (
    <button
      type="button"
      onClick={toggleColorMode}
      className="pill pill-sm hit"
      aria-label={`Modo de cor: ${NOME[mode] || 'claro'}. Mudar para ${PROXIMO[mode] || 'escuro'}`}
      title={`${NOME[mode] || 'Claro'} · mudar para ${PROXIMO[mode] || 'escuro'}`}
    >
      <Icon name={ICONE[mode] || 'sun'} />
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
