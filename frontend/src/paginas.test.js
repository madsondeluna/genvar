import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Todo módulo de interface tem de COMPILAR.
//
// Existe por um defeito que chegou ao navegador: um comentário JSX posto dentro
// do corpo de uma seta com parênteses, onde só cabe uma expressão, quebrou a
// página inteira com "Failed to fetch dynamically imported module". Nenhum teste
// pegou, porque nenhum deles importava uma página: a suíte cobre os módulos de
// VCF, que são funções puras, e as rotas, que são uma tabela de strings.
//
// Importar não prova que a tela está certa, e não é isso que se afirma aqui. O
// que se afirma é o degrau abaixo, que é o mais barato de garantir e o mais caro
// de descobrir tarde: o módulo é sintaticamente válido e suas importações
// resolvem.
//
// ERRO DE AMBIENTE NÃO É ERRO DE MÓDULO, e a distinção é o que torna o teste
// utilizável fora do navegador. Componentes de gráfico carregam bibliotecas que
// leem `document` e `self` no topo do arquivo; em Node isso lança, e o módulo
// está perfeitamente correto. Só um erro de análise sintática ou de importação
// não resolvida reprova.

globalThis.self = globalThis.self || globalThis

const AQUI = dirname(fileURLToPath(import.meta.url))
const PASTAS = ['pages', 'components', 'burden', 'vcf', 'hooks', 'utils', 'api']

const AMBIENTE = /is not defined|Cannot read properties of (undefined|null)|navigator|localStorage/i

function modulos(pasta) {
  let fora = []
  try {
    fora = readdirSync(resolve(AQUI, pasta))
  } catch {
    return []
  }
  return fora
    .filter((f) => /\.(jsx|js)$/.test(f) && !f.startsWith('._') && !f.includes('.test.'))
    .map((f) => `${pasta}/${f}`)
}

describe('todo módulo de interface compila', () => {
  const alvos = PASTAS.flatMap(modulos)

  it('encontra os módulos', () => {
    expect(alvos.length).toBeGreaterThan(40)
  })

  for (const alvo of alvos) {
    it(alvo, async () => {
      try {
        await import(/* @vite-ignore */ `./${alvo}`)
      } catch (e) {
        const msg = String(e?.message || e)
        if (AMBIENTE.test(msg)) return
        throw new Error(`${alvo} não compila: ${msg.split('\n')[0]}`)
      }
    })
  }
})
