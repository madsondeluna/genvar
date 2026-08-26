import { Link } from 'react-router-dom'
import AppMenu from './AppMenu'
import UnifiedSearch from './UnifiedSearch'

// Barra das páginas internas: marca (leva à home), menu de seções e a busca
// unificada (gene, variante ou doença). Passar `showSearch={false}` esconde a
// busca; `initialQuery` pré-preenche o campo com a consulta da página atual.
export default function PageNav({ showSearch = true, initialQuery = '' }) {
  return (
    <nav className="app-nav z-10" aria-label="Principal">
      <div className="max-w-xl mx-auto px-24 py-12 flex items-center justify-between gap-16 flex-wrap">
        <Link to="/" className="flex items-center gap-8 text-14 text-text hover:opacity-70">
          <img src={`${import.meta.env.BASE_URL}brand/genvar-mark.svg`} alt="Marca do GenVar" className="w-24 h-24" />
          GenVar Dashboard
        </Link>
        <AppMenu />
        {showSearch && <UnifiedSearch initialValue={initialQuery} />}
      </div>
    </nav>
  )
}
