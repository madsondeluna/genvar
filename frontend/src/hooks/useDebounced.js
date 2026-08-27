import { useEffect, useState } from 'react'

// Atrasa o valor por `ms`. Sugestao dispara a cada tecla, e sem isto uma
// palavra de oito letras vira oito requisicoes das quais sete sao descartadas.
export function useDebounced(value, ms = 180) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
