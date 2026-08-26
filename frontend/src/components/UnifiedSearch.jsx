import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { fetchDiseases } from '../api/client'
import { resolveSearch } from '../utils/search'

// Busca unificada: um campo que reconhece gene (HGNC), variante (rsID) ou doença
// (catálogo) e leva para a rota certa. Usa o catálogo de doenças (cacheado) para
// casar nomes; se ainda não carregou, cai para gene/variante/hub sem travar.
export default function UnifiedSearch({ initialValue = '', full = false, placeholder }) {
  const [value, setValue] = useState(initialValue)
  const navigate = useNavigate()

  const { data: diseases } = useQuery({
    queryKey: ['diseases'],
    queryFn: fetchDiseases,
    staleTime: 1000 * 60 * 30,
  })

  function handleSubmit(e) {
    e.preventDefault()
    const target = resolveSearch(value, diseases || [])
    if (target) navigate(target)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex gap-8 ${full ? 'w-full' : 'flex-1 max-w-sm'}`}
      role="search"
    >
      <label htmlFor="unified-search" className="sr-only">Buscar gene, variante ou doença</label>
      <input
        id="unified-search"
        type="text"
        className="input mono"
        placeholder={placeholder || 'Gene, variante (rsID) ou doença'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
      <button type="submit" className="pill" aria-label="Buscar">
        <Search className="w-16 h-16" aria-hidden="true" />
      </button>
    </form>
  )
}
