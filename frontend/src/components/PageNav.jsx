import { Link } from 'react-router-dom'
import AppMenu, { ColorModeToggle } from './AppMenu'
import BrandMark from './BrandMark'
import NavSearch from './NavSearch'

// Barra das páginas internas: marca (leva à home), menu de seções e a busca.
// Passar `showSearch={false}` esconde a busca.
export default function PageNav({ showSearch = true }) {
  return (
    <nav className="app-nav z-10" aria-label="Principal">
      <div className="max-w-xl mx-auto px-24 py-12 flex items-center justify-between gap-16 flex-wrap">
        <Link to="/" className="flex items-center gap-8 text-14 text-text hover:opacity-70">
          <BrandMark className="w-24 h-24" />
          GenVar
        </Link>
        {/* menu, busca e modo de cor sao UM grupo, com o mesmo intervalo entre
            si dos itens do menu. Antes o justify-between distribuia a sobra
            entre eles e abria um vao no meio da barra. A busca vem antes do
            alternador de cor: e a acao mais usada da barra. */}
        <div className="flex items-center gap-8 flex-wrap">
          <AppMenu />
          {showSearch && <NavSearch />}
          <ColorModeToggle />
        </div>
      </div>
    </nav>
  )
}
