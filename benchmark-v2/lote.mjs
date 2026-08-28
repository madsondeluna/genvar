#!/usr/bin/env node
/**
 * Lote contra individual: onde esta a diferenca, e por que ela existe.
 *
 * Processar N arquivos um a um NAO e a mesma coisa que processar os N de uma
 * vez, e as duas razoes sao estruturais:
 *
 *   O INDICE DO CLINVAR. A chave do cache e o CONJUNTO de cromossomos pedido.
 *   Arquivo a arquivo, cada um pede o seu conjunto, e todo conjunto diferente
 *   remonta o indice, expandindo meia milhao de linhas de novo. Em lote o
 *   indice e montado uma vez, para a uniao dos cromossomos da coorte.
 *
 *   O QUE SE GUARDA. Individual, quem chama fica com as variantes de cada
 *   arquivo na mao. Cinquenta exomas de 30 mil sao 1,5 milhao de objetos, e o
 *   pico derruba a aba antes do decimo. Em lote cada arquivo e lido, anotado,
 *   resumido e DESCARTADO, e sobra o resumo, que sao centenas de linhas.
 *
 * Mede-se tempo E memoria retida nos dois caminhos, para varios tamanhos de
 * coorte. Memoria e o numero que decide se roda no navegador; tempo, so quanto
 * demora.
 *
 * Uso, a partir de frontend/:
 *   npx vite-node ../benchmark-v2/lote.mjs -- --coortes 1,5,10,25,50
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import v8 from 'node:v8'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')
const SRC = join(RAIZ, 'frontend/src')
const PUBLICO = join(RAIZ, 'frontend/public')
const CORPUS = join(AQUI, 'corpus/arquivos')
const SAIDA = join(AQUI, 'resultados')
mkdirSync(SAIDA, { recursive: true })

const arg = (n, p) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const COORTES = arg('coortes', '1,5,10,25,50').split(',').map(Number)
const REPETICOES = Number(arg('repeticoes', '2'))

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
const interp = await import(join(SRC, 'vcf/interpretacao.js'))
const lote = await import(join(SRC, 'vcf/lote.js'))

const heapMB = () => process.memoryUsage().heapUsed / 1048576

// TETO DE HEAP DESTA RODADA, e ele vai em toda linha do CSV.
//
// O caminho individual morre por falta de memoria antes de terminar coortes
// grandes, entao o teto decide ate onde a medida chega: com o padrao do Node,
// perto de 2 GB, a coorte de 50 nao termina; com 12 GB, a de 100 termina. Sao
// numeros de condicoes diferentes, e um CSV que nao diz qual condicao valia
// deixa os dois parecerem o mesmo resultado. Um navegador nao tem 12 GB: a
// linha medida com teto alto descreve o algoritmo, nao a aba.
const TETO_HEAP_MB = Math.round(v8.getHeapStatistics().heap_size_limit / 1048576)

// PICO amostrado durante a execucao, e nao a diferenca entre antes e depois.
//
// A diferenca e imprestavel e foi medido o quanto: com uma repeticao ela deu
// 284 MB no caso de um arquivo e 0 MB no de dez, produzindo um "ganho de
// memoria de 1837x" que e ruido de coleta de lixo, nao comportamento. O que
// decide se roda no navegador e o PICO que a aba precisa aguentar enquanto o
// trabalho acontece; depois que ele termina, o coletor ja levou o que podia.
async function comPico(fn, intervaloMs = 25) {
  if (global.gc) global.gc()
  const base = heapMB()
  let pico = base
  const timer = setInterval(() => {
    const h = heapMB()
    if (h > pico) pico = h
  }, intervaloMs)
  try {
    const t0 = performance.now()
    const r = await fn()
    const ms = performance.now() - t0
    // Uma ultima leitura: a coorte pequena termina antes do primeiro tique.
    const h = heapMB()
    if (h > pico) pico = h
    // RETIDO: o que sobra depois da coleta, com o resultado AINDA na mao. E
    // este numero, e nao o pico, que prova o descarte: o pico e dominado pela
    // alocacao transitoria do parse, que os dois caminhos pagam igual; o retido
    // e o que a coorte deixa para tras e o que cresce, ou nao, com o tamanho
    // dela. `void r` depois da medida existe para o compilador nao poder
    // considerar `r` morto antes dela.
    if (global.gc) { global.gc(); global.gc() }
    const retido = heapMB() - base
    void r
    return { ms, pico: pico - base, retido, resultado: r }
  } finally {
    clearInterval(timer)
  }
}

const mediana = (v) => {
  const t = [...v].sort((a, b) => a - b)
  const m = t.length >> 1
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2
}

// DOIS CENARIOS de coorte, e a distincao decide o resultado.
//
// A chave do cache do indice do ClinVar e o CONJUNTO de cromossomos pedido.
// Numa coorte em que todos os arquivos cobrem os mesmos cromossomos (exoma
// completo, que e o caso de 02-medio.vcf), o indice e montado uma vez mesmo no
// caminho individual, e o lote nao ganha tempo nenhum: ganha memoria. Numa
// coorte de PAINEIS DIRIGIDOS, cada arquivo cobre um punhado de cromossomos
// diferente, e ai cada arquivo remonta o indice sozinho: e nesse caso que a
// uniao de cromossomos do lote vira ganho de tempo.
//
// Medir so o primeiro cenario e concluir "o lote nao acelera"; medir so o
// segundo e concluir "o lote acelera dez vezes". Os dois estao aqui.
const BASE = join(CORPUS, '02-medio.vcf')
const textoBase = readFileSync(BASE, 'utf8')
const linhasBase = textoBase.split('\n')
const cabBase = linhasBase.filter((l) => l.startsWith('#'))
const dadosBase = linhasBase.filter((l) => l && !l.startsWith('#'))

function blobDe(texto, nome) {
  const f = new Blob([texto])
  Object.defineProperty(f, 'name', { value: nome })
  return f
}

function coorteCompleta(k) {
  return Array.from({ length: k }, (_, i) =>
    blobDe(textoBase, `amostra-${i + 1}.vcf`))
}

// Painel dirigido: cada arquivo fica com tres cromossomos, girando pela lista,
// entao dois arquivos consecutivos quase nunca pedem o mesmo conjunto.
const CROMOSSOMOS = [...Array(22)].map((_, i) => String(i + 1)).concat(['X', 'Y'])

function coorteDirigida(k) {
  return Array.from({ length: k }, (_, i) => {
    const alvo = new Set([
      CROMOSSOMOS[(i * 3) % CROMOSSOMOS.length],
      CROMOSSOMOS[(i * 3 + 1) % CROMOSSOMOS.length],
      CROMOSSOMOS[(i * 3 + 2) % CROMOSSOMOS.length],
    ])
    const corpo = dadosBase.filter((l) => alvo.has(l.slice(0, l.indexOf('\t'))))
    return blobDe(cabBase.join('\n') + '\n' + corpo.join('\n') + '\n',
      `painel-${i + 1}.vcf`)
  })
}

// O caminho INDIVIDUAL, escrito como quem usa a pagina de um arquivo so: abre,
// le, anota, calcula, e SEGURA o resultado, porque a tela mostra tudo.
async function individual(arquivos) {
  const guardados = []
  for (const f of arquivos) {
    const { variantes, meta } = await parse.lerVCF(f, { limite: 400000 })
    // Sem `cromossomos` forcado: cada arquivo pede o SEU conjunto, que e o que
    // acontece quando a pessoa abre um arquivo de cada vez.
    await clinvar.anotar(variantes, { camadas: ['aviso'], build: meta.build })
    guardados.push({
      nome: f.name, meta, variantes,
      metricas: metricas.resumo(variantes),
      ab: metricas.balancoAlelico(variantes),
      titv: metricas.titvSeparado(variantes),
      sexo: metricas.verificarSexo(variantes),
      clinico: clinvar.resumoClinico(variantes),
    })
  }
  return guardados
}

const linhas = []

// Grava a cada ponto. O caminho individual ESTOURA a memoria em coortes
// grandes, e o estouro mata o processo: sem gravacao incremental, a rodada que
// encontra o limite e exatamente a que perde todos os pontos ate ele.
function gravar() {
  if (!linhas.length) return
  const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
  writeFileSync(join(SAIDA, 'lote_vs_individual.csv'),
    [cols.join(','), ...linhas.map((l) => cols.map((c) => l[c] ?? '').join(','))]
      .join('\n') + '\n')
}

console.log('\nLote contra individual')
console.log(`  teto de heap desta rodada: ${TETO_HEAP_MB} MB`
  + (TETO_HEAP_MB > 4096 ? '  (acima do que um navegador oferece)' : ''))
console.log('')

const catalogos = {
  clingen: await interp.carregarClinGen(),
  cpic: await interp.carregarCPIC(),
  simbolos: await interp.carregarSimbolos(),
}

async function medida(fn) {
  const ts = []
  const picos = []
  const retidos = []
  for (let i = 0; i < REPETICOES; i += 1) {
    const r = await comPico(fn)
    ts.push(r.ms)
    picos.push(r.pico)
    retidos.push(r.retido)
  }
  return { ms: mediana(ts), pico: mediana(picos), retido: mediana(retidos) }
}

const CENARIOS = [
  ['exoma completo', coorteCompleta,
   'todos os arquivos cobrem os mesmos cromossomos'],
  ['painel dirigido', coorteDirigida,
   'cada arquivo cobre tres cromossomos diferentes'],
]

for (const [cenario, fabrica, nota] of CENARIOS) {
  console.log(`\n  ${cenario}: ${nota}`)
  console.log('  coorte  individual pico/retido    lote pico/retido      diferenca')
  for (const k of COORTES) {
    const amostra = fabrica(1)[0]
    const nPorArquivo = (await parse.lerVCF(amostra, { limite: 400000 })).variantes.length

    // O individual pode nao caber, e quando nao cabe isso E o resultado: e o
    // limite que separa "processa a coorte" de "derruba a aba".
    //
    // O estouro do V8 e FATAL e nao passa por `try/catch`: o processo morre no
    // meio da coleta, sem lancar nada que o JavaScript possa pegar. Entao a
    // marca e gravada ANTES da tentativa. Se o processo sobrevive, a linha e
    // substituida pelo resultado; se morre, a marca fica no CSV e diz onde.
    const marca = {
      cenario, arquivos: k, repeticoes: REPETICOES, teto_heap_mb: TETO_HEAP_MB,
      individual_estourou: true,
      erro: 'processo morreu por falta de memoria durante o caminho individual',
    }
    linhas.push(marca)
    gravar()

    const ind = await medida(() => individual(fabrica(k)))
    linhas.pop()
    const lt = await medida(() => lote.processarLote(fabrica(k), {
      camadas: ['aviso'], ...catalogos,
    }))

    const linha = {
      cenario,
      arquivos: k,
      teto_heap_mb: TETO_HEAP_MB,
      variantes_por_arquivo: nPorArquivo,
      variantes_totais: k * nPorArquivo,
      repeticoes: REPETICOES,
      individual_ms: +ind.ms.toFixed(1),
      lote_ms: +lt.ms.toFixed(1),
      individual_pico_mb: +ind.pico.toFixed(1),
      lote_pico_mb: +lt.pico.toFixed(1),
      individual_retido_mb: +ind.retido.toFixed(1),
      lote_retido_mb: +lt.retido.toFixed(1),
      ganho_tempo: +(ind.ms / lt.ms).toFixed(2),
      ganho_pico: +(ind.pico / Math.max(1, lt.pico)).toFixed(2),
      ganho_retido: +(ind.retido / Math.max(1, lt.retido)).toFixed(2),
      individual_s_por_arquivo: +(ind.ms / 1000 / k).toFixed(3),
      lote_s_por_arquivo: +(lt.ms / 1000 / k).toFixed(3),
    }
    linhas.push(linha)
    console.log(`  ${String(k).padStart(4)}   `
      + `${(ind.ms / 1000).toFixed(2).padStart(6)} s ${ind.pico.toFixed(0).padStart(4)}/`
      + `${ind.retido.toFixed(0).padStart(4)} MB  `
      + `${(lt.ms / 1000).toFixed(2).padStart(6)} s ${lt.pico.toFixed(0).padStart(4)}/`
      + `${lt.retido.toFixed(0).padStart(4)} MB  `
      + `${linha.ganho_tempo.toFixed(2)}x t, ${linha.ganho_retido.toFixed(1)}x retido`)
  }
}

gravar()
console.log(`\n  -> lote_vs_individual.csv (${linhas.length} linhas)`)
