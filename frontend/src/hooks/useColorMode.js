import { useEffect, useState } from 'react'

// Modo de cor global. TRES modos, e nao dois.
//
// A linguagem Pure define quatro (claro, creme, azul profundo e grafite) e o app
// expunha so o claro e o grafite. O grafite tem fundo #0e0f13, quase preto, e a
// separacao entre fundo e cartao fica em 1,30:1: a borda do cartao quase nao
// aparece, e sobre preto duro o texto claro espalha na retina de muita gente.
//
// O azul profundo resolve isso sem inventar paleta: #0d1321 de fundo, contraste
// de texto medido em 12,84:1 contra 13,59:1 do grafite, praticamente o mesmo,
// com a diferenca perceptiva que importa. Ele ja vinha calibrado, com o `muted`
// subido de slate-500 para slate-400 para o piso de 4,5 valer nele.
//
// A ORDEM do ciclo vai do mais claro ao mais escuro, e nao e alfabetica: e a
// unica ordem em que apertar o mesmo botao duas vezes tem efeito previsivel.
const MODOS = ['light', 'deep-blue', 'dark']

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
    if (MODOS.includes(saved)) return saved
  } catch {
    // localStorage indisponivel: cai para a preferencia do sistema
  }
  // Sem escolha salva, a preferencia do sistema decide entre claro e escuro, e o
  // escuro padrao e o AZUL: e o mais legivel dos dois, e quem prefere o grafite
  // chega nele com um toque.
  return systemPrefersDark() ? 'deep-blue' : 'light'
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
  const raiz = document.documentElement
  // As classes sao exclusivas: `deep-blue` e `dark` redeclaram os mesmos tokens,
  // e as duas juntas deixam vencer a ultima do arquivo, que nao e a pedida.
  raiz.classList.remove('dark', 'deep-blue', 'paper-like')
  if (mode === 'dark' || mode === 'deep-blue') raiz.classList.add(mode)
  syncThemeColor()
}

export function setColorMode(mode) {
  current = MODOS.includes(mode) ? mode : 'light'
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // localStorage indisponivel: mantem so em memoria
  }
  applyColorMode(current)
  listeners.forEach((l) => l(current))
}

export function toggleColorMode() {
  setColorMode(MODOS[(MODOS.indexOf(current) + 1) % MODOS.length])
}

export function ehEscuro(mode) {
  return mode === 'dark' || mode === 'deep-blue'
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
