import { useEffect, useState } from 'react'

// Um listener só, compartilhado pela barra e pelo rodapé: ambos reagem ao
// mesmo limiar, então a página abre limpa e o chrome entra junto no scroll.
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    // Histerese: entra num limiar e sai noutro mais baixo. Com limiar único o
    // estado pisca quando o scroll oscila exatamente sobre ele, e o morph da
    // marca fica indo e voltando no meio da transição.
    const enter = threshold * 2
    const exit = Math.max(0, Math.floor(threshold / 2))
    function onScroll() {
      setScrolled((prev) => (prev ? window.scrollY > exit : window.scrollY > enter))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}
