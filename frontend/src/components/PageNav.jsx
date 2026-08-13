import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'

// A barra da home entra depois que a página rola além da altura do hero.
function useRevealOnScroll(enabled, threshold = 160) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!enabled) return
    function onScroll() {
      setVisible(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled, threshold])
  return visible
}

// Barra persistente: a marca leva para a home e o campo de busca só aparece
// nas páginas internas, que recebem as props do formulário.
export default function PageNav({ inputId, placeholder, ariaLabel, value, onChange, onSubmit, revealOnScroll = false }) {
  const hasSearch = Boolean(onSubmit)
  const visible = useRevealOnScroll(revealOnScroll)
  return (
    <nav
      className={`app-nav z-10 ${revealOnScroll ? 'app-nav-reveal' : ''}`}
      data-visible={revealOnScroll ? String(visible) : undefined}
      aria-hidden={revealOnScroll && !visible ? 'true' : undefined}
      inert={revealOnScroll && !visible ? '' : undefined}
      aria-label="Principal"
    >
      <div className="max-w-xl mx-auto px-24 py-12 flex items-center justify-between gap-24 flex-wrap">
        <Link to="/" className="flex items-center gap-8 text-14 text-text hover:opacity-70">
          <img src="/brand/genvar-mark.svg" alt="Marca do GenVar" className="w-24 h-24" />
          GenVar Dashboard
        </Link>
        {hasSearch && (
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
        )}
      </div>
    </nav>
  )
}
