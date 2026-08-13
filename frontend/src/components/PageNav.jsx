import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'

// Barra das páginas internas: a marca leva para a home e o campo de busca
// repete a consulta da página em que se está.
export default function PageNav({ inputId, placeholder, ariaLabel, value, onChange, onSubmit }) {
  return (
    <nav className="app-nav z-10" aria-label="Principal">
      <div className="max-w-xl mx-auto px-24 py-12 flex items-center justify-between gap-24 flex-wrap">
        <Link to="/" className="flex items-center gap-8 text-14 text-text hover:opacity-70">
          <img src="/brand/genvar-mark.svg" alt="Marca do GenVar" className="w-24 h-24" />
          GenVar Dashboard
        </Link>
        <form onSubmit={onSubmit} className="flex gap-8 flex-1 max-w-sm" role="search">
          <label htmlFor={inputId} className="sr-only">{ariaLabel}</label>
          <input
            id={inputId}
            type="text"
            className="input mono"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            spellCheck={false}
          />
          <button type="submit" className="pill" aria-label={ariaLabel}>
            <Search className="w-16 h-16" aria-hidden="true" />
          </button>
        </form>
      </div>
    </nav>
  )
}
