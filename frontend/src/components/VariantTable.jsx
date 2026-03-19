import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

function SignificanceTag({ sig }) {
  if (!sig) return <span className="tag tag-other">Unknown</span>
  const s = sig.toLowerCase()
  if (s.includes('likely pathogenic')) return <span className="tag tag-likely-pathogenic">Likely Pathogenic</span>
  if (s.includes('pathogenic') && !s.includes('conflicting')) return <span className="tag tag-pathogenic">Pathogenic</span>
  if (s.includes('likely benign')) return <span className="tag tag-likely-benign">Likely Benign</span>
  if (s.includes('benign')) return <span className="tag tag-benign">Benign</span>
  if (s.includes('uncertain') || s.includes('vus')) return <span className="tag tag-vus">VUS</span>
  if (s.includes('conflicting')) return <span className="tag tag-conflicting">Conflicting</span>
  return <span className="tag tag-other">{sig}</span>
}

export default function VariantTable({ variants, title = 'Variants', maxRows = 50 }) {
  const [sortKey, setSortKey] = useState('position')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  if (!variants || variants.length === 0) {
    return (
      <div className="card-flat">
        <h3 className="section-title">{title}</h3>
        <p className="text-sm text-gray-400">No variants to display.</p>
      </div>
    )
  }

  const limited = variants.slice(0, maxRows)
  const sorted = [...limited].sort((a, b) => {
    const va = a[sortKey] ?? ''
    const vb = b[sortKey] ?? ''
    if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va
    return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
    setPage(0)
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-300" />
    return sortAsc ? (
      <ChevronUp className="w-3 h-3 text-gray-700" />
    ) : (
      <ChevronDown className="w-3 h-3 text-gray-700" />
    )
  }

  return (
    <div className="card-flat">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title mb-0">{title}</h3>
        <span className="text-xs text-gray-400">{variants.length} variants</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {[
                { key: 'variant_id', label: 'Variant ID' },
                { key: 'position', label: 'Position' },
                { key: 'consequence', label: 'Consequence' },
                { key: 'clinical_significance', label: 'Classification' },
              ].map((col) => (
                <th
                  key={col.key}
                  className="table-header cursor-pointer select-none"
                  onClick={() => toggleSort(col.key)}
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
            {pageRows.map((v, i) => (
              <tr key={v.variant_id + i} className="table-row">
                <td className="table-cell font-mono text-xs text-gray-700">{v.variant_id}</td>
                <td className="table-cell text-gray-600">{v.position?.toLocaleString()}</td>
                <td className="table-cell text-xs text-gray-600">{v.consequence || 'unknown'}</td>
                <td className="table-cell">
                  <SignificanceTag sig={v.clinical_significance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <button
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
