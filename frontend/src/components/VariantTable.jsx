import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, Download, Search } from 'lucide-react'
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

export default function VariantTable({ variants, title = 'Variantes', maxRows = 500, csvPrefix = 'variantes' }) {
  const [sortKey, setSortKey] = useState('position')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [consequenceFilter, setConsequenceFilter] = useState('all')
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
      <section className="card-flat" aria-labelledby={`${csvPrefix}-title`}>
        <h3 id={`${csvPrefix}-title`} className="section-title">{title}</h3>
        <p className="text-sm text-gray-500">Sem variantes para exibir.</p>
      </section>
    )
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
    setPage(0)
  }

  function handleExport() {
    const content = toCsv(sorted, CSV_COLUMNS)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`${csvPrefix}-${stamp}.csv`, content)
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-300" aria-hidden="true" />
    return sortAsc ? (
      <ChevronUp className="w-3 h-3 text-gray-700" aria-hidden="true" />
    ) : (
      <ChevronDown className="w-3 h-3 text-gray-700" aria-hidden="true" />
    )
  }

  const truncated = variants.length > maxRows
  const titleId = `${csvPrefix}-title`

  return (
    <section className="card-flat" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h3 id={titleId} className="section-title mb-0">{title}</h3>
          <span className="text-xs text-gray-500">
            {sorted.length.toLocaleString('pt-BR')} de {variants.length.toLocaleString('pt-BR')}
            {truncated && ` (exibindo as primeiras ${maxRows.toLocaleString('pt-BR')})`}
          </span>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
          aria-label={`Exportar ${title} como CSV`}
        >
          <Download className="w-3 h-3" aria-hidden="true" />
          Exportar CSV
        </button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            className="input pl-9 py-1.5 text-sm"
            placeholder="Filtrar por rs ID ou classificação..."
            aria-label="Filtrar variantes"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span className="sr-only">Filtrar por consequência</span>
          <select
            className="input py-1.5 px-2 text-sm w-auto"
            value={consequenceFilter}
            onChange={(e) => {
              setConsequenceFilter(e.target.value)
              setPage(0)
            }}
            aria-label="Filtrar por consequência"
          >
            <option value="all">Todas as consequências</option>
            {consequenceOptions.map((c) => (
              <option key={c} value={c}>{formatConsequence(c)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
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
                  <span className="flex items-center gap-1">
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
                <td colSpan={4} className="table-cell text-gray-500 text-center py-6">
                  Nenhuma variante corresponde ao filtro atual.
                </td>
              </tr>
            ) : (
              pageRows.map((v) => (
                <tr key={`${v.variant_id}-${v.position}`} className="table-row">
                  <td className="table-cell font-mono text-xs text-gray-700">{v.variant_id}</td>
                  <td className="table-cell text-gray-600">{formatPosition(v.position)}</td>
                  <td className="table-cell text-xs text-gray-600">{formatConsequence(v.consequence)}</td>
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
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <button
            type="button"
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            Anterior
          </button>
          <span className="text-xs text-gray-600" aria-live="polite">
            Página {currentPage + 1} de {totalPages}
          </span>
          <button
            type="button"
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  )
}
