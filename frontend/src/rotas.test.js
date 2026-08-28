import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Toda rota anunciada na interface existe em App.jsx.
//
// Este teste nasceu de um defeito: a faixa de ferramentas linkava
// `/concordancia` e `/cobertura` antes de as páginas existirem, e quem clicava
// caía numa tela em branco. Nenhum teste pegou porque nenhuma página tinha
// teste, e a verificação inteira cabe em poucas linhas.
//
// Ler o código-fonte em vez de renderizar é deliberado: montar a árvore de React
// exigiria ambiente de DOM e um roteador de mentira, e o que se quer saber é uma
// afirmação estática, se o alvo do link consta da tabela de rotas.

const AQUI = dirname(fileURLToPath(import.meta.url))

function arquivosFonte(dir = AQUI, fora = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('._') || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) arquivosFonte(p, fora)
    else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name)) fora.push(p)
  }
  return fora
}

const APP = readFileSync(resolve(AQUI, 'App.jsx'), 'utf8')

// `path="/x"` e `path="/x/:id"`. A rota com parâmetro casa por prefixo.
const ROTAS = [...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1])

function rotaExiste(destino) {
  if (destino === '*' || destino.startsWith('http') || destino.startsWith('#')) return true
  const alvo = destino.split('?')[0].split('#')[0]
  return ROTAS.some((r) => {
    if (r === alvo) return true
    // /gene/:symbol cobre /gene/BRCA1
    const partesR = r.split('/')
    const partesA = alvo.split('/')
    if (partesR.length !== partesA.length) return false
    return partesR.every((p, i) => p.startsWith(':') || p === partesA[i])
  })
}

// Destinos escritos como literal: `to="/x"` e `to='/x'`. Os montados por
// template (`to={\`/gene/${g}\`}`) ficam de fora porque o valor só existe em
// tempo de execução; o prefixo deles é conferido à parte.
function destinosLiterais(fonte) {
  return [
    ...[...fonte.matchAll(/\bto="(\/[^"]*)"/g)].map((m) => m[1]),
    ...[...fonte.matchAll(/\bto=\{'(\/[^']*)'\}/g)].map((m) => m[1]),
    ...[...fonte.matchAll(/\bto:\s*'(\/[^']*)'/g)].map((m) => m[1]),
  ]
}

describe('rotas', () => {
  it('a tabela de rotas não está vazia', () => {
    expect(ROTAS.length).toBeGreaterThan(10)
    expect(ROTAS).toContain('/')
  })

  it('todo destino literal de link existe na tabela de rotas', () => {
    const quebrados = []
    for (const arq of arquivosFonte()) {
      const fonte = readFileSync(arq, 'utf8')
      for (const d of destinosLiterais(fonte)) {
        if (!rotaExiste(d)) quebrados.push(`${arq.replace(AQUI, 'src')} -> ${d}`)
      }
    }
    expect(quebrados).toEqual([])
  })

  it('todo prefixo de rota montada por template existe', () => {
    // `to={`/gene/${x}`}` tem de ter /gene/:algo na tabela.
    const quebrados = []
    for (const arq of arquivosFonte()) {
      const fonte = readFileSync(arq, 'utf8')
      for (const m of fonte.matchAll(/\bto=\{`(\/[a-z-]+)\/\$\{/g)) {
        const prefixo = m[1]
        if (!ROTAS.some((r) => r.startsWith(`${prefixo}/`))) {
          quebrados.push(`${arq.replace(AQUI, 'src')} -> ${prefixo}/...`)
        }
      }
    }
    expect(quebrados).toEqual([])
  })

  it('toda rota da tabela tem um componente importado', () => {
    const semComponente = []
    for (const m of APP.matchAll(/path="[^"]+"\s+element=\{<(\w+)/g)) {
      if (!new RegExp(`\\b${m[1]}\\b`).test(APP.split('<Routes')[0])) {
        semComponente.push(m[1])
      }
    }
    expect(semComponente).toEqual([])
  })

  it('ferramenta em construção não carrega um `to`', () => {
    // Ferramenta cuja página ainda não existe guarda `rotaPrevista`, não `to`.
    // A distinção não é cosmética: `to` é o que vira link, e um link para rota
    // inexistente leva a uma tela em branco, que se lê como aplicação quebrada.
    const fonte = readFileSync(resolve(AQUI, 'components/FerramentasVcf.jsx'), 'utf8')
    for (const m of fonte.matchAll(/\bto:\s*'(\/[^']*)'/g)) {
      expect(rotaExiste(m[1]), `${m[1]} tem \`to\` mas não existe em App.jsx`).toBe(true)
    }
    // E toda rota prevista é, de fato, ainda inexistente: assim que a página
    // for criada, este teste lembra de promover o campo para `to`.
    for (const m of fonte.matchAll(/rotaPrevista:\s*'(\/[^']*)'/g)) {
      expect(rotaExiste(m[1]), `${m[1]} já existe: troque rotaPrevista por to`).toBe(false)
    }
  })
})
