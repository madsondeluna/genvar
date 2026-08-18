import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScrolled } from '../hooks/useScrolled'

// Um único bloco de marca que atravessa dois estados: no topo da página ele
// aparece grande, alinhado ao hero; ao rolar, ele encolhe e assenta no centro
// da barra fixa. A ida e a volta são a mesma transição, invertida.
// Só transform e opacity animam: a barra reserva sua altura desde sempre.

const HERO_SCALE = 2.6
const THRESHOLD = 8

export default function BrandMorphNav({ heroSlotRef }) {
  const brandRef = useRef(null)
  const scrolled = useScrolled(THRESHOLD)
  const [offset, setOffset] = useState(null)

  // mede a distância entre a posição de repouso (centro da barra) e o slot do
  // hero, com a página no topo; o resultado vira o transform do estado grande
  useLayoutEffect(() => {
    function measure() {
      const brand = brandRef.current
      const slot = heroSlotRef.current
      if (!brand || !slot) return
      // O resize dispara com o brand possivelmente já transformado no estado
      // hero; medir o retângulo escalado corrompe o offset. Zera o transform
      // durante a leitura e restaura na mesma tarefa, antes de qualquer paint.
      const prev = brand.style.transform
      brand.style.transform = 'none'
      const b = brand.getBoundingClientRect()
      const s = slot.getBoundingClientRect()
      brand.style.transform = prev
      const scrollY = window.scrollY
      setOffset({
        dx: s.left - b.left,
        dy: s.top + scrollY + s.height / 2 - (b.top + b.height / 2),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    if (document.fonts?.ready) document.fonts.ready.then(measure)
    return () => window.removeEventListener('resize', measure)
  }, [heroSlotRef])

  const atHero = !scrolled && offset

  return (
    <nav
      className="app-nav app-nav-morph z-10"
      data-scrolled={String(scrolled)}
      aria-label="Principal"
    >
      <div className="max-w-xl mx-auto px-24 py-12 flex items-center justify-center">
        <Link
          ref={brandRef}
          to="/"
          className="brand-morph flex items-center gap-8 text-14 text-text"
          style={
            atHero
              ? { transform: `translate(${offset.dx}px, ${offset.dy}px) scale(${HERO_SCALE})` }
              : undefined
          }
        >
          <img src="/brand/genvar-mark.svg" alt="Marca do GenVar" className="w-24 h-24" />
          GenVar Dashboard
        </Link>
      </div>
    </nav>
  )
}
