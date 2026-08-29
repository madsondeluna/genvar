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

  // Foi assim que o laudo caía com dado real: 131 variantes anotadas, das quais
  // 124 caem na tabela de "fármaco e risco", e a tabela atravessa varias
  // paginas. O cabecalho marcado como `fixed` se repetia a cada quebra e a
  // geometria da borda saia como "unsupported number: -3.8e+21", derrubando o
  // documento inteiro. Com 40 variantes, que era o tamanho do outro teste, a
  // tabela cabia numa pagina so e nada quebrava.
  it('fecha com tabela longa o bastante para atravessar páginas', async () => {
    const { gerarPDF } = await import('./pdf.jsx')
    const base3 = { ...base }
    const anotadas = []
    for (let i = 0; i < 140; i += 1) {
      const v = base.variantes[i % base.variantes.length]
      anotadas.push({
        ...v,
        pos: v.pos + i,
        rsid: `rs${10000000 + i}`,
        gene: `GENE${i % 30}`,
        clinvar: {
          // Maioria em classificação conflitante, que é a que enche a segunda
          // tabela, exatamente como no arquivo real.
          sig: i % 9 === 0 ? 1 : [4, 9, 10, 11][i % 4],
          estrelas: i % 5,
          condicao: `Condição associada razoavelmente longa número ${i}`,
          consequencia: [1, 2, 3, 4, 7][i % 5],
          gene: `GENE${i % 30}`,
          af: 10 ** -(2 + (i % 5)),
        },
        clingen: { classificacao: 'Definitive', heranca: 'autossômica recessiva', heranca_sigla: 'AR', forca: 6 },
        acmg: [{ id: 'PM2', valor: 0, fonte: 'teste' }, { id: 'PP5', valor: null, fonte: 'teste' }],
      })
    }
    const blob = await gerarPDF({ ...base3, variantes: [...anotadas, ...base.variantes.slice(200)] })
    expect(blob.size).toBeGreaterThan(20000)
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

  it('mantém a tabela dentro da largura útil da página', async () => {
    // Trava a soma das colunas. O cabeçalho e as células já foram duas listas
    // separadas e divergiram: o cabeçalho somava 498, que cabe, e as células
    // 582, que não cabe, então as últimas colunas saíam empurradas para fora da
    // página e as demais desalinhadas do título. Agora saem da mesma definição,
    // e este teste impede que a soma cresça de novo sem alguém perceber.
    const { LARGURA_TABELA, LARGURA_UTIL } = await import('./pdf.jsx')
    expect(LARGURA_TABELA).toBeLessThanOrEqual(LARGURA_UTIL)
  })

  it('imprime o escore ACMG sem nomear a faixa', async () => {
    // A mesma garantia do motor de pontuação, cobrada no artefato que circula:
    // o PDF tem forma de laudo clínico, e é onde um nome de classe faria mais
    // estrago. Se algum dia alguém imprimir a faixa aqui, este teste reprova.
    const { gerarPDF } = await import('./pdf.jsx')
    const variantes = base.variantes.map((v, i) => (i === 0 ? {
      ...v,
      acmg: [{ id: 'PM2', valor: 0, fonte: 'ausente do gnomAD' }],
      acmgPontos: {
        pontos: 2, direcao: 'incerta', avaliados: 1, computaveis: 7,
        naoAvaliados: 21, naoVerificados: [], teto: 11, piso: -10, fracao: 0.57,
      },
    } : v))
    const blob = await gerarPDF({ ...base, variantes })
    expect(blob.size).toBeGreaterThan(3000)

    const texto = await blob.text().catch(() => '')
    for (const proibido of ['Significado incerto', 'Provavelmente patogênica', 'VUS']) {
      expect(texto).not.toContain(proibido)
    }
  })

  it('mantém TODA tabela dentro da largura útil da página', async () => {
    // Duas tabelas, a mesma trava. A de achados graves somava 614 pontos contra
    // 499 úteis, e o excesso não some: comprime. Cada coluna recebia menos
    // espaço do que declarava, o texto quebrava dentro dela e a célula
    // encavalava a vizinha, que é o defeito que aparecia impresso.
    const { LARGURA_TABELA, LARGURA_GRAVES, LARGURA_UTIL } = await import('./pdf.jsx')
    expect(LARGURA_TABELA).toBeLessThanOrEqual(LARGURA_UTIL)
    expect(LARGURA_GRAVES).toBeLessThanOrEqual(LARGURA_UTIL)
  })

  it('não usa símbolo fora da fonte padrão do PDF', async () => {
    // Helvetica é a fonte base do formato e não tem glifo para U+2192: o
    // react-pdf não avisa, imprime outro caractere, e "C→A" saía como "C'A" em
    // toda linha da tabela. O teste lê o próprio fonte do módulo porque o
    // defeito não faz o PDF falhar: ele fecha, e sai errado.
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(new URL('./pdf.jsx', import.meta.url), 'utf8')
    const semComentario = fonte.replace(/\/\/[^\n]*/g, '')
    for (const simbolo of ['→', '←', '≥', '≤', '±', '×', '≠']) {
      expect(semComentario).not.toContain(simbolo)
    }
  })

  it('trunca a célula de tabela para caber em uma linha', async () => {
    // O defeito: com texto que quebra em duas linhas, o gerador de PDF produz
    // uma coordenada absurda ao paginar a tabela e derruba o documento inteiro
    // com "unsupported number: -5.7e+21". Medido antes da correção: um arquivo
    // com 259 variantes anotadas gerava o laudo e um com 260 não, porque é aí
    // que a tabela passa da primeira página. Nenhum dos 153 testes via isso,
    // porque todos usavam conjuntos pequenos.
    //
    // A trava tem duas metades e as duas são verificadas aqui: a linha tem
    // altura fixa, e a célula é truncada pela largura REAL do texto na
    // Helvetica, não por contagem de caracteres.
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(new URL('./pdf.jsx', import.meta.url), 'utf8')
    expect(fonte).toContain('height: ALTURA_LINHA')
    // Toda célula das duas tabelas grandes passa pelo truncamento.
    const semComentario = fonte.replace(/\/\/[^\n]*/g, '')
    const celulas = semComentario.match(/style=\{\[s\.td[^\]]*\]\}>\{([^}]+)\}/g) || []
    expect(celulas.length).toBeGreaterThan(0)
    for (const c of celulas) expect(c).toContain('umaLinha(')
    // `lineHeight` no estilo da célula colapsa a caixa de linha e a célula sai
    // vazia, com a borda desenhada e o texto invisível: um defeito mais
    // silencioso que o travamento, porque o PDF fecha bem.
    expect(semComentario).not.toMatch(/td:\s*\{[^}]*lineHeight/)
  })
})
