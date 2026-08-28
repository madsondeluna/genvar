import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { lerVCF, zigosidade } from './parse'
import {
  resumo, balancoAlelico, titvSeparado, verificarSexo,
  heterozigotosCompostos, analiseTrio, espectroSubstituicao,
  AB_MIN, AB_MAX, DP_PARENTAL_MIN,
} from './metricas'
import { paraTSV, CABECALHO } from './exportar'

// As fixtures trazem o resultado esperado no proprio cabecalho
// (##genvar_esperado=...), escrito por scripts/gera_vcf_teste.py. O teste le de
// la em vez de repetir o numero: se o gerador mudar, o teste acompanha, e um
// numero que nao bate passa a ser defeito do codigo e nao do teste.
const AQUI = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(AQUI, '../../public/fixtures')

function arquivo(nome) {
  const bytes = readFileSync(resolve(FIXTURES, nome))
  // O parser recebe algo com .stream() e .slice(); um File do Node serve.
  return new File([bytes], nome, { type: 'text/plain' })
}

function esperado(texto) {
  const out = {}
  for (const m of texto.matchAll(/##genvar_esperado=([^=\n]+)=([^\n]+)/g)) out[m[1]] = m[2]
  return out
}

async function carregar(nome) {
  const cru = readFileSync(resolve(FIXTURES, nome), 'utf8')
  const r = await lerVCF(arquivo(nome))
  return { ...r, esperado: esperado(cru) }
}

describe('zigosidade', () => {
  it('lê as quatro formas de genótipo', () => {
    expect(zigosidade('0/1')).toBe('Heterozigoto')
    expect(zigosidade('1|0')).toBe('Heterozigoto')
    expect(zigosidade('1/1')).toBe('Homozigoto alt')
    expect(zigosidade('0/0')).toBe('Homozigoto ref')
    expect(zigosidade('./.')).toBe('Ausente')
    expect(zigosidade('0/.')).toBe('Parcial')
  })
})

describe('parse', () => {
  let trio
  beforeAll(async () => { trio = await carregar('trio-grch38.vcf') })

  it('declara GRCh38 pelo cabeçalho, sem deduzir nem presumir', () => {
    expect(trio.meta.build).toBe('GRCh38')
    expect(trio.meta.buildDeduzido).toBeFalsy()
    expect(trio.meta.buildPresumido).toBeFalsy()
  })

  it('lê as três amostras, não só a primeira', () => {
    expect(trio.meta.amostras).toEqual(['CRIANCA', 'MAE', 'PAI'])
    expect(trio.variantes[0].amostras).toHaveLength(3)
  })

  it('calcula o balanço alélico a partir do AD, por amostra', () => {
    const v = trio.variantes.find((x) => x.amostras[0].zigosidade === 'Heterozigoto' && x.amostras[0].ad)
    const { ref, alt } = v.amostras[0].ad
    expect(v.amostras[0].ab).toBeCloseTo(alt / (ref + alt), 10)
  })

  it('distingue referência homozigota de ausência de chamada', () => {
    const v = trio.variantes.find((x) => x.amostras[1].zigosidade === 'Homozigoto ref')
    expect(v.amostras[1].refHom).toBe(true)
    expect(v.amostras[1].semChamada).toBe(false)
    expect(v.amostras[1].tem).toBe(false)
  })
})

describe('balanço alélico', () => {
  it('não acusa desvio no arquivo bem comportado', async () => {
    const { variantes } = await carregar('trio-grch38.vcf')
    const ab = balancoAlelico(variantes)
    expect(ab.n).toBeGreaterThan(500)
    expect(ab.fracaoDesviada).toBeLessThan(0.1)
    expect(ab.mediana).toBeGreaterThan(0.4)
    expect(ab.mediana).toBeLessThan(0.6)
  })

  it('acusa os heterozigotos tortos que a fixture ruim planta', async () => {
    const { variantes, esperado: exp } = await carregar('ruim-grch38.vcf')
    const ab = balancoAlelico(variantes)
    const plantados = Number(exp.heterozigotos_com_ab_torto)
    // O piso 0,25 a 0,75 nao captura tudo que foi plantado nas bordas da faixa
    // sorteada, entao o teste exige a ordem de grandeza, nao a igualdade.
    expect(ab.desviados).toBeGreaterThan(plantados * 0.8)
    expect(ab.desviados).toBeLessThanOrEqual(plantados)
    for (const v of ab.suspeitas) {
      expect(v.ab < AB_MIN || v.ab > AB_MAX).toBe(true)
    }
  })
})

describe('Ti/Tv separado', () => {
  it('separa conhecida de nova e expõe a nova ruim que a global esconde', async () => {
    const { variantes } = await carregar('ruim-grch38.vcf')
    const t = titvSeparado(variantes)
    const global = resumo(variantes).titv

    expect(t.conhecidas.n).toBeGreaterThan(0)
    expect(t.novas.n).toBeGreaterThan(0)
    expect(t.conhecidas.titv).toBeGreaterThan(2)
    expect(t.novas.titv).toBeLessThan(1.2)
    // O ponto do indicador: a razao global fica entre as duas e nao denuncia.
    expect(global).toBeGreaterThan(t.novas.titv)
    expect(global).toBeLessThan(t.conhecidas.titv)
  })
})

describe('verificação de sexo', () => {
  it('infere XX', async () => {
    const { variantes, esperado: exp } = await carregar('feminino-grch38.vcf')
    const s = verificarSexo(variantes)
    expect(s.inferido).toBe(exp.sexo_esperado)
    expect(s.yVariantes).toBe(0)
  })

  it('infere XY', async () => {
    const { variantes, esperado: exp } = await carregar('masculino-grch38.vcf')
    const s = verificarSexo(variantes)
    expect(s.inferido).toBe(exp.sexo_esperado)
    expect(s.yVariantes).toBeGreaterThan(0)
  })

  it('não responde quando o X não tem variantes suficientes', async () => {
    const { variantes } = await carregar('feminino-grch38.vcf')
    const poucas = variantes.filter((v) => v.chrom !== 'X').slice(0, 300)
    const s = verificarSexo(poucas)
    expect(s.inferido).toBeNull()
    expect(s.motivo).toMatch(/poucas variantes/)
  })
})

describe('heterozigoto composto', () => {
  it('só junta variantes em posições distintas do mesmo gene', async () => {
    const { variantes } = await carregar('trio-grch38.vcf')
    // Sem gene atribuido nao ha o que agrupar: a funcao devolve vazio em vez de
    // agrupar tudo num balde nulo.
    expect(heterozigotosCompostos(variantes)).toEqual([])

    const comGene = variantes.map((v, i) => ({ ...v, gene: `G${i % 40}` }))
    const c = heterozigotosCompostos(comGene)
    expect(c.length).toBeGreaterThan(0)
    for (const g of c) {
      expect(g.n).toBeGreaterThanOrEqual(2)
      expect(new Set(g.variantes.map((v) => v.pos)).size).toBeGreaterThanOrEqual(2)
      for (const v of g.variantes) expect(v.zigosidade).toBe('Heterozigoto')
    }
  })
})

describe('trio', () => {
  let trio
  beforeAll(async () => { trio = await carregar('trio-grch38.vcf') })

  it('devolve null sem os índices dos pais', () => {
    expect(analiseTrio(trio.variantes, { proband: 0 })).toBeNull()
  })

  it('conta os de novo verdadeiros e não conta os sem cobertura parental', () => {
    const t = analiseTrio(trio.variantes, { proband: 0, mae: 1, pai: 2 })
    expect(t.deNovo).toHaveLength(Number(trio.esperado.de_novo_verdadeiros))
    expect(t.semCoberturaParental).toBe(Number(trio.esperado.sitios_sem_cobertura_parental))
    // A regra ingenua somaria os dois: e a diferenca entre 12 e 20.
    expect(t.deNovo.length + t.semCoberturaParental).toBe(20)
    for (const v of t.deNovo) {
      expect(v.amostras[1].dp).toBeGreaterThanOrEqual(DP_PARENTAL_MIN)
      expect(v.amostras[2].dp).toBeGreaterThanOrEqual(DP_PARENTAL_MIN)
    }
  })

  it('acha o composto em trans pela origem parental e ignora o em cis', () => {
    const comGene = trio.variantes.map((v) => ({ ...v, gene: `${v.chrom}:${Math.floor(v.pos / 1e6)}` }))
    const t = analiseTrio(comGene, { proband: 0, mae: 1, pai: 2 })
    expect(t.compostosTrans.length).toBeGreaterThan(0)
    for (const c of t.compostosTrans) {
      const origens = new Set(Object.values(c.origens))
      // Trans significa que veio uma de cada lado. Se as duas vieram do mesmo
      // pai, e cis, e nao pode entrar aqui.
      expect(origens.has('mãe') && origens.has('pai')).toBe(true)
    }
  })

  it('acha as recessivas homozigotas herdadas dos dois lados', () => {
    const t = analiseTrio(trio.variantes, { proband: 0, mae: 1, pai: 2 })
    expect(t.recessivas.length).toBeGreaterThanOrEqual(Number(trio.esperado.recessivas_homozigotas))
    for (const v of t.recessivas) {
      expect(v.amostras[0].zigosidade).toBe('Homozigoto alt')
      expect(v.amostras[1].zigosidade).toBe('Heterozigoto')
      expect(v.amostras[2].zigosidade).toBe('Heterozigoto')
    }
  })
})

describe('espectro de substituição', () => {
  it('colapsa pela pirimidina: G>A conta como C>T', () => {
    const e = espectroSubstituicao([
      { ref: 'G', alt: 'A' }, { ref: 'C', alt: 'T' }, { ref: 'A', alt: 'C' },
    ])
    expect(e.n).toBe(3)
    const m = Object.fromEntries(e.classes.map((c) => [c.rotulo, c.n]))
    expect(m['C>T']).toBe(2)
    expect(m['T>G']).toBe(1)
  })
})

describe('exportação TSV', () => {
  it('mantém uma coluna por cabeçalho e não quebra a linha com tabulação', async () => {
    const { variantes } = await carregar('ruim-grch38.vcf')
    const tsv = paraTSV(variantes.slice(0, 50))
    // Sem `trim()`: as colunas do fim vem vazias na maioria das linhas, entao a
    // linha termina em tabulacao, e `trim()` comeria as da ULTIMA linha, fazendo
    // um exportador correto parecer que perde coluna. Tira-se so a quebra final.
    const linhas = tsv.replace(/\n$/, '').split('\n')
    expect(linhas[0].split('\t')).toEqual(CABECALHO)
    expect(linhas).toHaveLength(51)
    for (const l of linhas) expect(l.split('\t')).toHaveLength(CABECALHO.length)
  })
})
