import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { lerVCF } from './parse'
import { resumo, histograma, porCromossomo, espectroSubstituicao } from './metricas'

// O laudo em PDF caía inteiro por um número inválido numa borda, e o erro só
// aparecia depois de carregar um VCF, consultar o gnomAD e clicar no botão: um
// caminho de mais de um minuto que só existia no navegador. Montar o documento
// aqui torna a falha reproduzível em meio segundo, e o teste passa a impedir a
// volta dela.
//
// Não se verifica o visual, e sim que o documento FECHA. É o que estava
// quebrado: uma barra fora de escala não saía torta, apagava o laudo.

const AQUI = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(AQUI, '../../public/fixtures')

function arquivo(nome) {
  return new File([readFileSync(resolve(FIXTURES, nome))], nome, { type: 'text/plain' })
}

// Frequências por população como o gnomAD devolve, incluindo os casos que
// quebraram: alelo ausente numa população (af 0) e frequência minúscula, que é
// onde a divisão pela maior frequência estoura.
function comGnomad(v, af, extremos = false) {
  const pops = extremos
    ? [
      { id: 'afr', rotulo: 'africana', ac: 0, an: 20000, af: 0 },
      { id: 'nfe', rotulo: 'europeia não finlandesa', ac: 1, an: 1000000, af: 1e-6 },
      { id: 'eas', rotulo: 'leste asiático', ac: 0, an: 5000, af: 0 },
    ]
    : [
      { id: 'nfe', rotulo: 'europeia não finlandesa', ac: 120, an: 100000, af: 0.0012 },
      { id: 'afr', rotulo: 'africana', ac: 3, an: 20000, af: 0.00015 },
    ]
  return { ...v, gnomad: { dataset: 'gnomad_r4', ac: 1, an: 100000, af, populacoes: pops } }
}

describe('laudo em PDF', { timeout: 60000 }, () => {
  let base

  beforeAll(async () => {
    const { meta, variantes, lidos } = await lerVCF(arquivo('trio-grch38.vcf'))
    // Anotação mínima, com os campos que o laudo lê.
    const anotadas = variantes.slice(0, 40).map((v, i) => ({
      ...v,
      gene: `GENE${i % 7}`,
      clinvar: {
        sig: [1, 2, 3, 4, 5, 9, 10][i % 7],
        estrelas: i % 5,
        condicao: i % 3 ? `Condição de teste ${i}` : '',
        consequencia: [1, 2, 3, 4, 7, 0][i % 6],
        gene: `GENE${i % 7}`,
        af: i % 4 === 0 ? null : 10 ** -(2 + (i % 6)),
      },
      clingen: i % 2 ? { classificacao: 'Definitive', heranca: 'autossômica recessiva', heranca_sigla: 'AR', forca: 6 } : null,
      acmg: i % 3 ? [{ id: 'PM2', valor: 0, fonte: 'teste' }] : [],
    }))
    const todas = [...anotadas, ...variantes.slice(40)]

    base = {
      nome: 'trio-grch38.vcf',
      tamanho: 214000,
      meta,
      lidos,
      truncado: false,
      variantes: todas,
      metricas: resumo(todas),
      genesMapeados: true,
      sha256: 'a'.repeat(64),
      versaoClinvar: '2026-08-22',
      painel: null,
      papeis: { proband: 0, mae: 1, pai: 2 },
      termos: ['epilepsia'],
      dp: histograma(todas, 'dp'),
      qual: histograma(todas, 'qual'),
      cromo: porCromossomo(todas),
      espectro: espectroSubstituicao(todas),
      porGene: [['GENE0', 12], ['GENE1', 8], ['GENE2', 3]],
      resumoCli: {
        porSig: { 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 9: 5, 10: 5 },
        porConsequencia: { 1: 7, 2: 7, 3: 7, 4: 7, 7: 6 },
        porImpacto: { Alto: 14, Moderado: 7, Baixo: 7, Modificador: 6 },
        genes: [{ gene: 'GENE0', total: 6, patogenicas: 2, incertas: 1, condicoes: ['Condição de teste 1'] }],
      },
      anotacao: { casadas: 40, divergentes: 3, podeCoordenada: true, camadasCarregadas: 'aviso' },
    }
  })

  it('fecha o documento com um conjunto completo', async () => {
    const { gerarPDF } = await import('./pdf.jsx')
    const blob = await gerarPDF(base)
    expect(blob.size).toBeGreaterThan(5000)
  })

  it('fecha com frequência por população, inclusive alelo ausente e frequência mínima', async () => {
    const { gerarPDF } = await import('./pdf.jsx')
    const variantes = base.variantes.map((v, i) =>
      (v.clinvar ? comGnomad(v, i % 3 === 0 ? 0.31 : 1e-6, i % 2 === 0) : v))
    const blob = await gerarPDF({ ...base, variantes })
    expect(blob.size).toBeGreaterThan(5000)
  })

  // Foi assim que o laudo caía: uma frequência de população muito maior que a
  // usada como máximo, ou um máximo zerado, produzia largura de barra em notação
  // exponencial, e o gerador recusa o documento INTEIRO com "unsupported number".
  it('fecha mesmo com frequência absurda, que antes derrubava o documento', async () => {
    const { gerarPDF } = await import('./pdf.jsx')
    const variantes = base.variantes.map((v) => (v.clinvar ? {
      ...v,
      gnomad: {
        dataset: 'gnomad_r4', ac: 1, an: 10, af: 1e-300,
        populacoes: [
          { id: 'nfe', rotulo: 'europeia não finlandesa', ac: 1, an: 10, af: 1e-300 },
          { id: 'afr', rotulo: 'africana', ac: 0, an: 0, af: null },
          { id: 'eas', rotulo: 'leste asiático', ac: 0, an: 10, af: 0 },
        ],
      },
    } : v))
    const blob = await gerarPDF({ ...base, variantes })
    expect(blob.size).toBeGreaterThan(5000)
  })

  it('fecha sem nenhuma anotação clínica', async () => {
    const { gerarPDF } = await import('./pdf.jsx')
    const variantes = base.variantes.map(({ clinvar, clingen, acmg, ...v }) => v)
    const blob = await gerarPDF({
      ...base, variantes, resumoCli: { porSig: {}, porConsequencia: {}, porImpacto: {}, genes: [] },
    })
    expect(blob.size).toBeGreaterThan(3000)
  })

  it('fecha com o cruzamento de genes desligado', async () => {
    const { gerarPDF } = await import('./pdf.jsx')
    const blob = await gerarPDF({ ...base, genesMapeados: false, porGene: [] })
    expect(blob.size).toBeGreaterThan(3000)
  })
})
