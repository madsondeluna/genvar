import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import SuggestBox from './SuggestBox'
import { fetchDiseases } from '../api/client'

// Busca unificada: reconhece variante (rsID), doenca (catalogo) ou gene (HGNC)
// e leva para a rota certa. Escalavel: nao carrega o catalogo inteiro; faz uma
// checagem leve no servidor (page_size pequeno) para decidir o destino.
// Sem `placeholder` o campo fica sem texto de exemplo (caso da nav); o rotulo
// sr-only continua nomeando o campo para leitor de tela.
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
      <SuggestBox
        className={full ? 'flex-1' : 'flex-1'}
        inputClassName="input mono"
        label="Buscar gene, variante ou doença"
        placeholder={placeholder || ''}
        value={value}
        onChange={setValue}
        onPick={(item, rota) => { setValue(item.label); navigate(rota) }}
      />
      <button type="submit" className="pill" aria-label="Buscar" disabled={busy}>
        <Icon name="search" />
      </button>
    </form>
  )
}
