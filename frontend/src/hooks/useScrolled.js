import { useEffect, useState } from 'react'

// Um listener só, compartilhado pela barra e pelo rodapé: ambos reagem ao
// mesmo limiar, então a página abre limpa e o chrome entra junto no scroll.
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}
