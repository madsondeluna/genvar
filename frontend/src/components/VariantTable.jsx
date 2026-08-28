import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from './Icon'
import SignificanceTag from './SignificanceTag'
import { formatConsequence, formatPosition } from '../utils/format'
import { toCsv, downloadCsv } from '../utils/csv'

const CSV_COLUMNS = [
  { label: 'variant_id', get: (v) => v.variant_id },
  { label: 'position', get: (v) => v.position },
  { label: 'consequence', get: (v) => v.consequence },
  { label: 'clinical_significance', get: (v) => v.clinical_significance },
  { label: 'alleles', get: (v) => (v.alleles ? v.alleles.join('/') : '') },
]

// Estado padrão dos controles; só o que difere disto vai para a URL
const CONTROL_DEFAULTS = { q: '', c: 'all', o: 'position.asc', p: '1' }

export default function VariantTable({
  variants,
  title = 'Variantes',
  maxRows = 500,
  csvPrefix = 'variantes',
  totalCount = null,
  paramPrefix = null,
}) {
  // Com paramPrefix, filtros, ordenação e página vivem na query string (?pat_q=...),
  // então o link copiado reproduz exatamente a vista atual. Sem prefixo, estado local.
  const [searchParams, setSearchParams] = useSearchParams()
  const [localState, setLocalState] = useState(CONTROL_DEFAULTS)
  const urlMode = Boolean(paramPrefix)

  const read = (name) =>
    (urlMode ? searchParams.get(`${paramPrefix}_${name}`) : localState[name]) ?? CONTROL_DEFAULTS[name]

  const query = read('q')
  const consequenceFilter = read('c')
  const [sortKey, sortDir] = read('o').split('.')
  const sortAsc = sortDir !== 'desc'
  const page = Math.max(0, (parseInt(read('p'), 10) || 1) - 1)

  function updateControls(changes) {
    if (urlMode) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [name, value] of Object.entries(changes)) {
            const key = `${paramPrefix}_${name}`
            if (value === CONTROL_DEFAULTS[name]) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true }
      )
    } else {
      setLocalState((s) => ({ ...s, ...changes }))
    }
  }

  const setQuery = (v) => updateControls({ q: v, p: '1' })
  const setConsequenceFilter = (v) => updateControls({ c: v, p: '1' })
  const setPage = (idx) => updateControls({ p: String(idx + 1) })
  const PAGE_SIZE = 20

  const limited = useMemo(() => (variants || []).slice(0, maxRows), [variants, maxRows])

  const consequenceOptions = useMemo(() => {
    const set = new Set()
    for (const v of limited) if (v.consequence) set.add(v.consequence)
    return Array.from(set).sort()
  }, [limited])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return limited.filter((v) => {
      if (consequenceFilter !== 'all' && v.consequence !== consequenceFilter) return false
      if (!q) return true
      const id = (v.variant_id || '').toLowerCase()
      const sig = (v.clinical_significance || '').toLowerCase()
      return id.includes(q) || sig.includes(q)
    })
  }, [limited, query, consequenceFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
    return arr
  }, [filtered, sortKey, sortAsc])

  if (!variants || variants.length === 0) {
    return (
      <section className="card" aria-labelledby={`${csvPrefix}-title`}>
        <h3 id={`${csvPrefix}-title`} className="section-title mb-8">{title}</h3>
        <div className="empty">Sem variantes para exibir.</div>
      </section>
    )
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  function toggleSort(key) {
    const nextAsc = sortKey === key ? !sortAsc : true
    updateControls({ o: `${key}.${nextAsc ? 'asc' : 'desc'}`, p: '1' })
  }

  function handleExport() {
    const content = toCsv(sorted, CSV_COLUMNS)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`${csvPrefix}-${stamp}.csv`, content)
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <Icon name="chevron-up" className="opacity-40" />
    return sortAsc ? (
      <Icon name="chevron-up" />
    ) : (
      <Icon name="chevron-down" />
    )
  }

  const truncated = variants.length > maxRows
  // When the gene has more variants than the sampled list, say so instead of implying completeness
  const isSample = totalCount != null && totalCount > variants.length
  const titleId = `${csvPrefix}-title`

  return (
    <section className="card" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-12 mb-16 flex-wrap">
        <div className="flex items-baseline gap-12">
          <h3 id={titleId} className="section-title">{title}</h3>
          <span className="text-12 text-muted mono num">
            {isSample
              ? `amostra de ${variants.length.toLocaleString('pt-BR')} ao longo do gene (de ${totalCount.toLocaleString('pt-BR')})`
              : `${sorted.length.toLocaleString('pt-BR')} de ${variants.length.toLocaleString('pt-BR')}`}
            {truncated && ` (exibindo as primeiras ${maxRows.toLocaleString('pt-BR')})`}
          </span>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="pill pill-sm"
          aria-label={`Exportar ${title} como CSV`}
        >
          <Icon name="download" />
          Exportar CSV
        </button>
      </div>

      <div className="flex gap-12 mb-16 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 'calc(var(--photo-sm) * 2)' }}>
          <Icon name="search" className="text-muted absolute top-1/2 -translate-y-1/2" style={{ left: 'var(--space-12)' }} />
          <input
            type="search"
            className="input"
            style={{ paddingLeft: 'var(--space-40)' }}
            placeholder="Filtrar por rs ID ou classificação..."
            aria-label="Filtrar variantes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="select-shell w-auto">
          <select
            className="select"
            value={consequenceFilter}
            onChange={(e) => setConsequenceFilter(e.target.value)}
            aria-label="Filtrar por consequência"
          >
            <option value="all">Todas as consequências</option>
            {consequenceOptions.map((c) => (
              <option key={c} value={c}>{formatConsequence(c)}</option>
            ))}
          </select>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="tabela">
          <thead className="bg-dim">
            <tr>
              {[
                { key: 'variant_id', label: 'ID da variante' },
                { key: 'position', label: 'Posição' },
                { key: 'consequence', label: 'Consequência' },
                { key: 'clinical_significance', label: 'Classificação' },
              ].map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="table-header cursor-pointer select-none"
                  onClick={() => toggleSort(col.key)}
                  aria-sort={sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="flex items-center gap-4">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="table-cell text-muted text-center py-24">
                  Nenhuma variante corresponde ao filtro atual.
                </td>
              </tr>
            ) : (
              pageRows.map((v) => (
                <tr key={`${v.variant_id}-${v.position}`} className="table-row">
                  <td className="table-cell mono text-12">{v.variant_id}</td>
                  <td className="table-cell mono num text-12 text-muted">{formatPosition(v.position)}</td>
                  <td className="table-cell text-12">{formatConsequence(v.consequence)}</td>
                  <td className="table-cell">
                    <SignificanceTag value={v.clinical_significance} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-16 pt-12 border-t border-border">
          <button
            type="button"
            className="pill pill-solid pill-sm disabled:opacity-40"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
          >
            Anterior
          </button>
          <span className="text-12 text-muted mono num" aria-live="polite">
            Página {currentPage + 1} de {totalPages}
          </span>
          <button
            type="button"
            className="pill pill-solid pill-sm disabled:opacity-40"
            onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  )
}
