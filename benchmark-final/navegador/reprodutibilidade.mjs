#!/usr/bin/env node
/**
 * Reprodutibilidade: a mesma entrada devolve o mesmo laudo?
 *
 * Esta e a metade da promessa que tempo nenhum mede. Um fluxo manual, com oito
 * portais abertos e copia e cola, nao tem como responder a isso: dois analistas
 * chegam a duas planilhas, o mesmo analista em dois dias chega a duas, e nao ha
 * artefato que prove de qual arquivo cada uma saiu.
 *
 * O que se mede aqui e concreto e binario:
 *
 *   1. IDEMPOTENCIA. O mesmo arquivo, lido e exportado duas vezes, produz
 *      saidas byte a byte identicas? Compara SHA-256.
 *   2. ORDEM DA ENTRADA. Embaralhar as linhas do VCF muda o resultado das
 *      metricas? Nao deveria, e contagem que dependa de ordem e defeito.
 *   3. PROCEDENCIA. O artefato carrega o SHA-256 da entrada e a versao da
 *      compilacao do ClinVar, sem os quais dois laudos do mesmo paciente em
 *      meses diferentes nao sao comparaveis?
 *
 * Uso, a partir de frontend/:
 *   npx vite-node ../benchmark-final/navegador/reprodutibilidade.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '../..')
const SRC = join(RAIZ, 'frontend/src')
const PUBLICO = join(RAIZ, 'frontend/public')
const CORPUS = join(resolve(AQUI, '..'), 'corpus/arquivos')
const SAIDA = join(resolve(AQUI, '..'), 'resultados/local')
mkdirSync(SAIDA, { recursive: true })

const fetchOriginal = globalThis.fetch
globalThis.fetch = async (e, i) => {
  const url = typeof e === 'string' ? e : e?.url ?? String(e)
  if (url.startsWith('/')) {
    const c = join(PUBLICO, url.split('?')[0])
    if (!existsSync(c)) return new Response(null, { status: 404 })
    return new Response(readFileSync(c), { status: 200 })
  }
  return fetchOriginal(e, i)
}

const parse = await import(join(SRC, 'vcf/parse.js'))
const metricas = await import(join(SRC, 'vcf/metricas.js'))
const clinvar = await import(join(SRC, 'vcf/clinvar.js'))
const exportar = await import(join(SRC, 'vcf/exportar.js'))

const sha = (t) => createHash('sha256').update(t).digest('hex')

function arquivoDe(caminho) {
  const f = new Blob([readFileSync(caminho)])
  Object.defineProperty(f, 'name', { value: basename(caminho) })
  return f
}

async function laudoDe(caminho, { embaralhar = false, semente = 1 } = {}) {
  const { variantes, meta } = await parse.lerVCF(arquivoDe(caminho), { limite: 400000 })
  if (embaralhar) {
    // Embaralhamento deterministico. `Math.random` daria uma ordem diferente a
    // cada execucao e a comparacao deixaria de significar coisa alguma.
    let s = semente
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let i = variantes.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1))
      ;[variantes[i], variantes[j]] = [variantes[j], variantes[i]]
    }
  }
  await clinvar.anotar(variantes, { camadas: ['aviso'], build: meta.build })
  return { variantes, meta }
}

// O que se compara sao as CONTAGENS, com as chaves ordenadas, e nao a lista de
// variantes, que muda de ordem por construcao quando a entrada e embaralhada.
const estavel = (o) => JSON.stringify(o, Object.keys(o).sort())

function metricasDe(v) {
  const r = metricas.resumo(v)
  return sha(estavel({
    total: r.total, passa: r.passa,
    titv: r.titv == null ? null : +r.titv.toFixed(9),
    fracaoConhecida: +r.fracaoConhecida.toFixed(9),
    zigosidade: r.zigosidade, tipos: r.tipos, filtros: r.filtros,
    ab: metricas.balancoAlelico(v).fracaoDesviada,
    espectro: metricas.espectroSubstituicao(v),
    cromossomos: metricas.porCromossomo(v),
  }))
}

const alvos = ['01-pequeno.vcf', '02-medio.vcf', '06-medio.vcf.gz', '07-medio.zip',
  '08-grch37.vcf', '09-sem-build.vcf', '10-trio.vcf', '11-ruim.vcf',
  '12-multiamostra.vcf']

const linhas = []
console.log('\nReprodutibilidade\n')

for (const nome of alvos) {
  const caminho = join(CORPUS, nome)
  if (!existsSync(caminho)) continue

  const a = await laudoDe(caminho)
  const b = await laudoDe(caminho)
  const c = await laudoDe(caminho, { embaralhar: true })

  const saida = (x) => ({
    TSV: sha(exportar.paraTSV(x.variantes)),
    CSV: sha(exportar.paraCSV(x.variantes)),
    VCF: sha(exportar.paraVCF({ variantes: x.variantes, meta: x.meta, nome,
      sha256: 'a'.repeat(64), versaoClinvar: '2026-08-22', painel: null })),
  })
  const sa = saida(a)
  const sb = saida(b)

  const marca = 'deadbeef'.repeat(8)
  const vcfTexto = exportar.paraVCF({ variantes: a.variantes, meta: a.meta, nome,
    sha256: marca, versaoClinvar: '2026-08-22', painel: null })

  const linha = {
    arquivo: nome,
    variantes: a.variantes.length,
    tsv_identico: sa.TSV === sb.TSV,
    csv_identico: sa.CSV === sb.CSV,
    vcf_identico: sa.VCF === sb.VCF,
    metricas_independem_da_ordem: metricasDe(a.variantes) === metricasDe(c.variantes),
    vcf_carrega_sha_da_entrada: vcfTexto.includes(marca),
    vcf_carrega_versao_clinvar: vcfTexto.includes('2026-08-22'),
    sha_entrada: await exportar.sha256(arquivoDe(caminho)),
    sha_tsv: sa.TSV,
  }
  const criterios = ['tsv_identico', 'csv_identico', 'vcf_identico',
    'metricas_independem_da_ordem', 'vcf_carrega_sha_da_entrada',
    'vcf_carrega_versao_clinvar']
  linha.criterios_ok = criterios.filter((k) => linha[k] === true).length
  linha.criterios_total = criterios.length
  linha.tudo_ok = linha.criterios_ok === criterios.length
  linhas.push(linha)

  const falhas = criterios.filter((k) => linha[k] !== true)
  console.log(`  ${nome.padEnd(22)} ${linha.criterios_ok}/${criterios.length}`
    + (falhas.length ? `  falhou: ${falhas.join(', ')}` : '  reprodutivel'))
}

const cols = Object.keys(linhas[0])
writeFileSync(join(SAIDA, 'reprodutibilidade.csv'),
  [cols.join(','), ...linhas.map((l) => cols.map((c) => l[c]).join(','))].join('\n') + '\n')
console.log(`\n  -> reprodutibilidade.csv (${linhas.length} linhas)`)
console.log(`  ${linhas.filter((l) => l.tudo_ok).length} de ${linhas.length} arquivos`
  + ' reprodutiveis em todos os criterios.')
