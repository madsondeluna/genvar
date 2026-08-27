import { useEffect, useState } from 'react'

// Modo de cor global: 'light' (padrao da linguagem Pure) ou 'dark' (grafite
// neutro, :root.dark). Espelha o padrao de useViewMode: store minimo, um
// listener por componente, persistido em localStorage. Sem valor salvo, segue
// a preferencia do sistema.
const KEY = 'genvar-color-mode'
const listeners = new Set()

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function read() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // localStorage indisponivel: cai para a preferencia do sistema
  }
  return systemPrefersDark() ? 'dark' : 'light'
}

let current = read()

// A cor da barra do navegador acompanha o modo. Le --bg computado em vez de
// fixar um hex: token e a fonte da verdade. Se o CSS ainda nao chegou, o valor
// vem vazio ou como var(...) nao resolvido, e ai a meta fica como esta.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (!bg || bg.includes('var(')) return
  meta.setAttribute('content', bg)
}

export function applyColorMode(mode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  syncThemeColor()
}

export function setColorMode(mode) {
  current = mode === 'dark' ? 'dark' : 'light'
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // localStorage indisponivel: mantem so em memoria
  }
  applyColorMode(current)
  listeners.forEach((l) => l(current))
}

export function toggleColorMode() {
  setColorMode(current === 'dark' ? 'light' : 'dark')
}

export function useColorMode() {
  const [mode, setMode] = useState(current)
  useEffect(() => {
    applyColorMode(current)
    const l = (v) => setMode(v)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])
  return mode
}
