import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'genvar:search-history:v1'
const MAX_ENTRIES = 8

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => e && typeof e.value === 'string' && typeof e.kind === 'string')
  } catch {
    return []
  }
}

function writeStorage(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* quota or private mode */
  }
}

export function useSearchHistory() {
  const [entries, setEntries] = useState([])

  useEffect(() => {
    setEntries(readStorage())
  }, [])

  const push = useCallback((kind, value) => {
    const entry = { kind, value, ts: Date.now() }
    setEntries((prev) => {
      const filtered = prev.filter((e) => !(e.kind === kind && e.value === value))
      const next = [entry, ...filtered].slice(0, MAX_ENTRIES)
      writeStorage(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    writeStorage([])
    setEntries([])
  }, [])

  return { entries, push, clear }
}
