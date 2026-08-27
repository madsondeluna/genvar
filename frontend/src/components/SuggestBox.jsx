import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Icon from './Icon'
import { fetchSuggestions } from '../api/client'
import { useDebounced } from '../hooks/useDebounced'

// Campo de busca com sugestoes ao digitar. Semantica de combobox: o input
// carrega role="combobox" e aria-activedescendant, a lista e um listbox e a
// selecao anda pelo teclado. Sem isto o leitor de tela nao anuncia que
// apareceram opcoes, e a lista vira decoracao.
//
// A lista NAO fecha por blur imediato: um clique numa opcao dispara blur antes
// do click, e fechar ali cancela a propria escolha. Fecha por Escape, por
// selecao, ou por clique fora, que e o unico que sabe se o alvo era a lista.

const KIND_ICON = { disease: 'helix', panel: 'branch', gene: 'molecule', variant: 'chart-line' }
const KIND_ROUTE = {
  disease: (id) => `/doenca/${id}`,
  panel: (id) => `/painel/${id}`,
  gene: (id) => `/gene/${encodeURIComponent(id)}`,
  variant: (id) => `/variant/${encodeURIComponent(id)}`,
}

export default function SuggestBox({
  value, onChange, onPick, placeholder = '', className = '',
  inputClassName = 'input', label, kinds, autoFocus = false, id,
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef(null)
  const uid = useId()
  // quem ja tem um <label for=...> visivel passa o mesmo id; senao geramos um
  const inputId = id || `in-${uid}`
  const listId = `sug-${uid}`
  const debounced = useDebounced(value, 180)

  const { data } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => fetchSuggestions(debounced, 8),
    enabled: debounced.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
  })

  const all = data?.items ?? []
  const items = kinds ? all.filter((i) => kinds.includes(i.kind)) : all
  const show = open && items.length > 0

  useEffect(() => { setActive(-1) }, [debounced])

  // clique fora fecha; o alvo diz se saiu do componente, o blur nao diria
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  function pick(item) {
    setOpen(false)
    setActive(-1)
    onPick(item, KIND_ROUTE[item.kind]?.(item.id))
  }

  function onKeyDown(e) {
    if (!show) {
      if (e.key === 'ArrowDown' && items.length) { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length : i) - 1) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1) }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      {label && !id && <label htmlFor={inputId} className="sr-only">{label}</label>}
      <input
        id={inputId}
        onBlur={(e) => {
          // fecha quando o foco sai do componente, e so entao: relatedTarget
          // diz para onde o foco foi, o que blur sozinho nao diz. Cobre a saida
          // por Tab, que pointerdown fora nunca ve.
          if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false)
        }}
        type="text"
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        spellCheck={false}
        autoComplete="off"
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="suggest-list"
        >
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${it.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`suggest-item ${i === active ? 'is-active' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(it)}
              onMouseEnter={() => setActive(i)}
            >
              <Icon name={KIND_ICON[it.kind] || 'search'} className="text-muted" />
              <span className="suggest-label">{it.label}</span>
              {it.hint && <span className="tag tag-series suggest-hint">{it.hint}</span>}
              {it.extra && <span className="suggest-extra">{it.extra}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
