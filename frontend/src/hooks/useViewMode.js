import { useEffect, useState } from 'react'

// Modo de leitura global: 'paciente' (linguagem simples) ou 'profissional'
// (tecnico completo). Persistido em localStorage e sincronizado entre os
// componentes por um store minimo (a nav troca, a pagina reage).
const KEY = 'genvar-view-mode'
const DEFAULT = 'profissional'
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(KEY) === 'paciente' ? 'paciente' : DEFAULT
  } catch {
    return DEFAULT
  }
}

let current = read()

export function setViewMode(mode) {
  current = mode === 'paciente' ? 'paciente' : 'profissional'
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // localStorage indisponivel: mantem so em memoria
  }
  listeners.forEach((l) => l(current))
}

export function useViewMode() {
  const [mode, setMode] = useState(current)
  useEffect(() => {
    const l = (v) => setMode(v)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])
  return mode
}
