import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { fetchDiseases } from '../api/client'

// Busca unificada: reconhece variante (rsID), doenca (catalogo) ou gene (HGNC)
// e leva para a rota certa. Escalavel: nao carrega o catalogo inteiro; faz uma
// checagem leve no servidor (page_size pequeno) para decidir o destino.
export default function UnifiedSearch({ initialValue = '', full = false, placeholder }) {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    if (/^rs\d+$/i.test(v)) return navigate(`/variant/${v.toLowerCase()}`)

    setBusy(true)
    try {
      const res = await fetchDiseases({ q: v, page_size: 5 })
      if (res.total === 1) return navigate(`/doenca/${res.items[0].id}`)
      if (res.total > 1) return navigate(`/doencas?q=${encodeURIComponent(v)}`)
    } catch {
      // se a checagem falhar, cai para as heuristicas abaixo
    } finally {
      setBusy(false)
    }

    // sem doenca correspondente: trata como simbolo de gene, senao vai ao hub
    if (/^[A-Za-z][A-Za-z0-9.\-]{0,49}$/.test(v)) return navigate(`/gene/${v.toUpperCase()}`)
    navigate(`/doencas?q=${encodeURIComponent(v)}`)
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
      <button type="submit" className="pill" aria-label="Buscar" disabled={busy}>
        <Search className="w-16 h-16" aria-hidden="true" />
      </button>
    </form>
  )
}
