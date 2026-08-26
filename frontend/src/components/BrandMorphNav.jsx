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
      // A medição precisa do brand em repouso, mas ele pode estar no estado
      // hero, e com a transição de transform ativa o `transform: none` não
      // zera nada na hora: só inicia uma animação, e o getBoundingClientRect
      // lê o retângulo ainda escalado, corrompendo o offset (o brand pousava
      // sobre o eyebrow). Desliga a transição durante a leitura e restaura
      // tudo na mesma tarefa, com um reflow entre transform e transição para
      // o restauro não animar.
      const prevTransform = brand.style.transform
      const prevTransition = brand.style.transition
      brand.style.transition = 'none'
      brand.style.transform = 'none'
      const b = brand.getBoundingClientRect()
      const s = slot.getBoundingClientRect()
      brand.style.transform = prevTransform
      void brand.offsetWidth
      brand.style.transition = prevTransition
      const scrollY = window.scrollY
      // Num viewport estreito a escala cheia estoura a lateral direita e cria
      // scroll horizontal (visto no celular): limita a escala ao espaço entre
      // o slot do hero e a margem direita da página.
      const available = document.documentElement.clientWidth - 24 - s.left
      const scale = Math.max(1, Math.min(HERO_SCALE, available / b.width))
      setOffset({
        dx: s.left - b.left,
        dy: s.top + scrollY + s.height / 2 - (b.top + b.height / 2),
        scale,
      })
    }
    measure()
    // No mobile a barra de URL do navegador dispara resize a cada mudança de
    // direção do scroll, mudando só a altura; re-medir nesses eventos troca o
    // alvo do morph no meio da animação. Só a largura interessa à medida.
    let lastWidth = window.innerWidth
    function onResize() {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      measure()
    }
    window.addEventListener('resize', onResize)
    if (document.fonts?.ready) document.fonts.ready.then(measure)
    // O slot participa do fade-up de entrada (translateY de 12px, 500ms com
    // stagger); qualquer medida tirada nesse intervalo sai deslocada. Uma
    // última medição depois de tudo assentar corrige o alvo definitivo.
    const settle = setTimeout(measure, 900)
    return () => {
      clearTimeout(settle)
      window.removeEventListener('resize', onResize)
    }
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
              ? { transform: `translate(${offset.dx}px, ${offset.dy}px) scale(${offset.scale})` }
              : undefined
          }
        >
          <img src={`${import.meta.env.BASE_URL}brand/genvar-mark.svg`} alt="Marca do GenVar" className="w-24 h-24" />
          GenVar Dashboard
        </Link>
      </div>
    </nav>
  )
}
