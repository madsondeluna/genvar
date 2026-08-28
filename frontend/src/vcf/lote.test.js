import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  processarLote, resumoDoLote, genesRecorrentes, variantesRecorrentes,
  sinaisDeAtencao, linhasDoLote, linhasDeAchados, CABECALHO_LOTE, CABECALHO_ACHADOS, ehVcf,
} from './lote'

// Mecânica do lote, sem rede. As camadas do ClinVar são buscadas por fetch
// relativo, que não existe aqui, e o carregador já degrada para tabela vazia:
// o que se verifica é que o lote ATRAVESSA os arquivos, resume cada um, isola
// a falha de um só e consolida a coorte. A anotação em si tem os seus testes.

const AQUI = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(AQUI, '../../public/fixtures')

function arquivo(nome, caminho = FIXTURES) {
  return new File([readFileSync(resolve(caminho, nome))], nome, { type: 'text/plain' })
}

describe('lote', { timeout: 120000 }, () => {
  let out

  beforeAll(async () => {
    out = await processarLote([
      arquivo('trio-grch38.vcf'),
      arquivo('ruim-grch38.vcf'),
      arquivo('feminino-grch38.vcf'),
      arquivo('masculino-grch38.vcf'),
      // Um arquivo que não é VCF, para provar que a falha de um não derruba o lote.
      new File(['isto nao e um vcf\n'], 'quebrado.vcf', { type: 'text/plain' }),
    ])
  })

  it('reconhece os formatos aceitos e recusa o resto', () => {
    for (const n of ['a.vcf', 'a.vcf.gz', 'a.gz', 'a.zip', 'A.VCF']) {
      expect(ehVcf({ name: n })).toBe(true)
    }
    for (const n of ['a.bam', 'a.txt', 'a.fastq', 'planilha.xlsx']) {
      expect(ehVcf({ name: n })).toBe(false)
    }
  })

  it('atravessa todos os arquivos, inclusive depois de um falhar', () => {
    expect(out).toHaveLength(5)
    expect(out.filter((r) => !r.erro)).toHaveLength(4)
    const ruim = out.find((r) => r.nome === 'quebrado.vcf')
    expect(ruim.erro).toBeTruthy()
    // A falha entra na lista com o motivo, e é o que permite reprocessar só ela.
    expect(ruim.achados).toEqual([])
  })

  it('guarda métricas por arquivo e não as variantes', () => {
    const r = out.find((r2) => r2.nome === 'trio-grch38.vcf')
    expect(r.metricas.total).toBeGreaterThan(2000)
    expect(r.qualidade.titvNovas).toBeTypeOf('number')
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
    // É esta ausência que faz o lote escalar: cinquenta exomas com todas as
    // variantes na memória derrubam a aba antes do décimo arquivo.
    expect(r.variantes).toBeUndefined()
  })

  it('infere o sexo de cada amostra separadamente', () => {
    const f = out.find((r) => r.nome === 'feminino-grch38.vcf')
    const m = out.find((r) => r.nome === 'masculino-grch38.vcf')
    expect(f.qualidade.sexo).toBe('XX')
    expect(m.qualidade.sexo).toBe('XY')
  })

  it('sinaliza o arquivo com defeito e não sinaliza o limpo', () => {
    const ruim = sinaisDeAtencao(out.find((r) => r.nome === 'ruim-grch38.vcf'))
    const trio = sinaisDeAtencao(out.find((r) => r.nome === 'trio-grch38.vcf'))
    const criticos = (s) => s.filter((x) => x.nivel === 'critico')
    expect(criticos(ruim).length).toBeGreaterThan(0)
    expect(criticos(ruim).some((s) => /Ti\/Tv/.test(s.texto))).toBe(true)
    expect(criticos(trio)).toHaveLength(0)
  })

  it('consolida a coorte', () => {
    const t = resumoDoLote(out)
    expect(t.arquivos).toBe(5)
    expect(t.processados).toBe(4)
    expect(t.comFalha).toBe(1)
    expect(t.variantes).toBeGreaterThan(5000)
    expect(t.porSegundo).toBeGreaterThan(0)
  })

  it('exporta uma linha por arquivo, com as colunas do cabeçalho', () => {
    const linhas = linhasDoLote(out)
    expect(linhas).toHaveLength(5)
    for (const l of linhas) expect(l).toHaveLength(CABECALHO_LOTE.length)
    // O arquivo que falhou aparece na planilha com o motivo, não some dela.
    expect(linhas.find((l) => l[0] === 'quebrado.vcf').at(-1)).toBeTruthy()
  })

  it('exporta os achados com as colunas do cabeçalho', () => {
    for (const l of linhasDeAchados(out)) expect(l).toHaveLength(CABECALHO_ACHADOS.length)
  })

  it('agrupa gene e variante recorrentes sem achado nenhum', () => {
    // Sem rede não há anotação, então não há achado: as duas funções têm de
    // devolver lista vazia em vez de quebrar.
    expect(genesRecorrentes(out)).toEqual([])
    expect(variantesRecorrentes(out)).toEqual([])
  })

  it('conta a mesma variante em amostras diferentes', () => {
    const falso = [
      { nome: 'a.vcf', achados: [
        { chrom: '1', pos: 100, ref: 'A', alt: 'G', gene: 'BRCA1', sig: 1, condicao: 'X' },
        { chrom: '2', pos: 200, ref: 'C', alt: 'T', gene: 'TP53', sig: 4, condicao: 'Y' },
      ] },
      { nome: 'b.vcf', achados: [
        { chrom: '1', pos: 100, ref: 'A', alt: 'G', gene: 'BRCA1', sig: 1, condicao: 'X' },
      ] },
      { nome: 'c.vcf', achados: [
        { chrom: '1', pos: 100, ref: 'A', alt: 'G', gene: 'BRCA1', sig: 1, condicao: 'X' },
      ] },
    ]
    const rec = variantesRecorrentes(falso)
    expect(rec).toHaveLength(1)
    expect(rec[0].amostras).toBe(3)
    expect(rec[0].nomes).toEqual(['a.vcf', 'b.vcf', 'c.vcf'])

    const genes = genesRecorrentes(falso)
    expect(genes[0].gene).toBe('BRCA1')
    expect(genes[0].amostras).toBe(3)
    expect(genes[0].patogenicas).toBe(3)
  })

  it('conta um gene uma vez por amostra, mesmo com várias variantes nele', () => {
    const falso = [{ nome: 'a.vcf', achados: [
      { chrom: '1', pos: 1, ref: 'A', alt: 'G', gene: 'BRCA1', sig: 1, condicao: 'X' },
      { chrom: '1', pos: 2, ref: 'A', alt: 'T', gene: 'BRCA1', sig: 1, condicao: 'X' },
      { chrom: '1', pos: 3, ref: 'C', alt: 'G', gene: 'BRCA1', sig: 2, condicao: 'X' },
    ] }]
    const g = genesRecorrentes(falso)
    expect(g).toHaveLength(1)
    expect(g[0].amostras).toBe(1)
  })
})
