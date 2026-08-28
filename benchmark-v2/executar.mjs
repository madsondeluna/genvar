#!/usr/bin/env node
/**
 * Benchmark da plataforma: toda funcao, sobre todo arquivo do corpus.
 *
 * A suite anterior media a API e uma escala sintetica unica. Ela nao alcanca o
 * que decide se a plataforma serve para trabalho: o que cada funcao faz com
 * arquivo torto, com build antigo, com trio, com multi-amostra e com formato
 * comprimido. Aqui cada uma das 12 entradas do corpus atravessa o pipeline
 * inteiro e cada etapa e cronometrada em separado.
 *
 * Roda em Node e nao em navegador, e a razao esta declarada: os modulos sao ESM
 * puro e as mesmas funcoes que a pagina chama, entao o que se mede e o custo do
 * algoritmo sem o ruido de renderizacao. O que Node NAO reproduz esta dito em
 * cada saida: pintura, congelamento da aba e teto de memoria da guia sao do
 * navegador.
 *
 * Uso, a partir de frontend/ (o vite-node resolve os imports sem extensao):
 *   npx vite-node ../benchmark-v2/executar.mjs
 *   npx vite-node ../benchmark-v2/executar.mjs -- --repeticoes 3
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import v8 from 'node:v8'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')
const SRC = join(RAIZ, 'frontend/src')
const PUBLICO = join(RAIZ, 'frontend/public')

// Teto de genotipos desta rodada. Nao e o teto da aplicacao: e o ponto ate onde
// o processo de medida chega sem ser morto pelo coletor. Fica declarado porque
// um arquivo pulado em silencio le como um arquivo que passou.
const LIMITE_CELULAS = 40_000_000

const arg = (n, p) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const REPETICOES = Number(arg('repeticoes', '3'))
const CORPUS = resolve(arg('corpus', join(AQUI, 'corpus/arquivos')))
const SAIDA = resolve(arg('saida', join(AQUI, 'resultados')))
mkdirSync(SAIDA, { recursive: true })

// --- os dados embarcados, servidos do disco ----------------------------------
//
// `clinvar.js` e `interpretacao.js` buscam `/data/...`, caminho absoluto de raiz
// de site. Em Node nao existe raiz de site: `fetch` rejeita, o modulo degrada
// para camada vazia (o mesmo caminho que protege o usuario quando o indice nao
// sobe) e a rodada mede o pipeline SEM anotacao clinica, que e a etapa cara.
// Uma rodada assim tem a mesma cara de uma boa, com numeros melhores.
const fetchOriginal = globalThis.fetch
globalThis.fetch = async (entrada, init) => {
  const url = typeof entrada === 'string' ? entrada : entrada?.url ?? String(entrada)
  if (url.startsWith('/')) {
    const caminho = join(PUBLICO, url.split('?')[0])
    if (!existsSync(caminho)) return new Response(null, { status: 404 })
    return new Response(readFileSync(caminho), { status: 200 })
  }
  return fetchOriginal(entrada, init)
}

let ANOTACAO_ATIVA = false
try {
  const r = await fetch('/data/clinvar/index.json')
  ANOTACAO_ATIVA = r.ok && Boolean((await r.json()).camadas)
} catch { ANOTACAO_ATIVA = false }

// --- medida ------------------------------------------------------------------

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const percentil = (v, p) => {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}
const desvio = (v) => {
  if (v.length < 2) return 0
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
}
const heapMB = () => {
  if (global.gc) global.gc()
  return process.memoryUsage().heapUsed / 1048576
}

// Teto de heap desta rodada, gravado em toda linha. Sem isso `funcoes.csv`
// acumula medidas de execucoes com tetos diferentes e a mediana do arquivo passa
// a misturar condicoes, que e exatamente o erro que a secao de metodo do artigo
// diz ter corrigido.
const TETO_HEAP_MB = Math.round(v8.getHeapStatistics().heap_size_limit / 1048576)

const linhas = []

// Grava a cada arquivo terminado, e nao so no fim. O 1000 Genomes chrY derrubou
// o processo por falta de memoria no meio da rodada e levou junto as 283
// medidas ja feitas: benchmark que so grava no fim perde tudo exatamente quando
// encontra o limite que ele existe para encontrar.
function gravarParcial() {
  if (!linhas.length) return
  const cols = [...new Set(linhas.flatMap((d) => Object.keys(d)))]
  const esc = (x) => {
    const t = x == null ? '' : String(x)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  writeFileSync(join(SAIDA, 'funcoes.csv'),
    [cols.join(','), ...linhas.map((d) => cols.map((c) => esc(d[c])).join(','))].join('\n') + '\n')
}

async function medir(arquivo, etapa, funcao, fn, n = REPETICOES, extra = {}) {
  const tempos = []
  let r
  let erro = ''
  const antes = heapMB()
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now()
    try {
      r = await fn()
    } catch (e) {
      erro = e?.message || String(e)
      tempos.push(performance.now() - t0)
      break
    }
    tempos.push(performance.now() - t0)
  }
  const linha = {
    arquivo, etapa, funcao,
    n: tempos.length,
    mediana_ms: +mediana(tempos).toFixed(3),
    p95_ms: +percentil(tempos, 0.95).toFixed(3),
    min_ms: +Math.min(...tempos).toFixed(3),
    max_ms: +Math.max(...tempos).toFixed(3),
    desvio_ms: +desvio(tempos).toFixed(3),
    heap_delta_mb: +(heapMB() - antes).toFixed(2),
    anotacao_ativa: ANOTACAO_ATIVA,
    teto_heap_mb: TETO_HEAP_MB,
    erro,
    ...extra,
  }
  linhas.push(linha)
  const marca = erro ? 'ERRO' : `${linha.mediana_ms.toFixed(1)} ms`
  console.log(`    ${funcao.padEnd(28)} ${marca.padStart(12)}`
    + (erro ? `  ${erro.slice(0, 60)}` : ''))
  return r
}

// --- modulos medidos ---------------------------------------------------------

const parse = await import(join(SRC, 'vcf/parse.js'))
const metricas = await import(join(SRC, 'vcf/metricas.js'))
const clinvar = await import(join(SRC, 'vcf/clinvar.js'))
const interp = await import(join(SRC, 'vcf/interpretacao.js'))
const exportar = await import(join(SRC, 'vcf/exportar.js'))

// O File do navegador, sobre bytes do disco. `lerVCF` so precisa de `name`,
// `size`, `slice` e `stream`, e todos existem no Blob do Node.
function arquivoDe(caminho) {
  const bytes = readFileSync(caminho)
  const f = new Blob([bytes])
  f.name = basename(caminho)
  Object.defineProperty(f, 'name', { value: basename(caminho), writable: false })
  return f
}

const manifesto = JSON.parse(readFileSync(join(CORPUS, 'manifesto.json'), 'utf8'))

// Arquivos REAIS, baixados de fontes publicas e nunca versionados. O corpus
// sintetico controla a variavel; estes provam que o controle nao inventou um
// mundo mais facil que o real. Ficam em corpus/reais/ e entram se existirem, e
// a contagem de variantes sai da propria leitura, porque arquivo de fora nao
// vem com manifesto.
const DIR_REAIS = join(dirname(CORPUS), 'reais')
// `amostras` e `variantes_aprox` medidos com zcat antes da rodada; servem para
// o executor decidir o que cabe SEM antes gastar minutos lendo o arquivo.
const REAIS = [
  ['nist-usuario.vcf.gz', 'GIAB/NIST, GRCh37, exoma de rotina', 1, 30_000],
  ['htslib-teste.vcf', 'htslib, casos de borda de sintaxe', 2, 15],
  ['giab-hg002-grch38.vcf.gz', 'GIAB HG002 v4.2.1, GRCh38, referencia de ouro', 1, 4_100_000],
  ['1000g-chrY.vcf.gz', '1000 Genomes chrY, GRCh37, 1.233 amostras', 1233, 62_000],
]
for (const [nome, papel, amostras, aprox] of REAIS) {
  const c = join(DIR_REAIS, nome)
  if (!existsSync(c)) continue
  manifesto.push({
    arquivo: join('..', 'reais', nome), papel, real: true,
    variantes: null, mb: +(statSync(c).size / 1048576).toFixed(3),
    reais_do_clinvar: null, amostras_declaradas: amostras,
    // O teto de leitura corta em 400 mil VARIANTES, entao o que chega a memoria
    // e min(variantes, 400k) vezes amostras.
    celulas_estimadas: Math.min(aprox, 400_000) * amostras,
  })
}

console.log('\nBenchmark da plataforma GenVar')
console.log(`  corpus     : ${manifesto.length} arquivos em ${CORPUS}`)
console.log(`  repeticoes : ${REPETICOES}`)
console.log(`  anotacao   : ${ANOTACAO_ATIVA ? 'ativa' : 'INDISPONIVEL'}`)
console.log(`  node       : ${process.version}`)

// Catalogos carregados uma vez: na pagina eles tambem sao carregados uma vez
// por sessao, e cobra-los de cada arquivo inventaria um custo que nao existe.
console.log('\n[0] Catalogos (uma vez por sessao)')
const paineis = await medir('—', 'catalogo', 'carregar painéis',
  () => interp.carregarPaineis(), 1)
const simbolos = await medir('—', 'catalogo', 'carregar símbolos',
  () => interp.carregarSimbolos(), 1)
const clingen = await medir('—', 'catalogo', 'carregar ClinGen',
  () => interp.carregarClinGen(), 1)
const cpic = await medir('—', 'catalogo', 'carregar CPIC',
  () => interp.carregarCPIC(), 1)
const genesJson = JSON.parse(readFileSync(join(PUBLICO, 'data/burden/genes.json'), 'utf8'))
const indiceGenes = await medir('—', 'catalogo', 'índice de genes',
  () => metricas.indiceDeGenes(genesJson), 3)

const painelAlvo = paineis?.paineis?.find((p) => (p.genes || []).length > 50)
  || paineis?.paineis?.[0]

// O INDICE DO CLINVAR e montado aqui, antes do laco, e medido em separado.
//
// Sem isto o custo de montar (baixar as camadas dos cromossomos, descomprimir e
// expandir o JSON colunar em mapa de busca) cai inteiro sobre o PRIMEIRO
// arquivo medido, que e o menor. O efeito na figura e uma curva de anotacao que
// DESCE de mil para 25 mil variantes, sugerindo que anotar mais custa menos.
// Montar o indice acontece uma vez por sessao e nao uma vez por arquivo, entao
// cobra-lo do primeiro arquivo atribui a mil variantes um trabalho que
// independe de quantas elas sao.
{
  const semente = [{ chrom: '1', pos: 1, ref: 'A', alt: 'G', rsid: null }]
  await medir('—', 'catalogo', 'montagem do índice ClinVar',
    () => clinvar.anotar(semente, { camadas: ['aviso'], build: 'GRCh38',
      cromossomos: [...Array(22)].map((_, i) => String(i + 1)).concat(['X', 'Y', 'MT']) }), 1)
}

// --- o corpo do benchmark ----------------------------------------------------

const saidasPorArquivo = new Map()

for (const item of manifesto) {
  const caminho = join(CORPUS, item.arquivo)
  if (!existsSync(caminho)) continue
  const rotulo = basename(item.arquivo)
  console.log(`\n[${rotulo}]${item.real ? ' (real)' : ''} ${item.papel}`)
  item.arquivo = rotulo

  // Arquivo com MUITAS amostras nao cabe, e o teto da aplicacao nao percebe:
  // ele conta VARIANTES, e o que ocupa memoria e variantes vezes amostras. O
  // 1000 Genomes chrY tem 1.233 amostras, e 60 mil variantes dele sao 74
  // milhoes de genotipos. Medir isso ate o estouro e o resultado; deixar o
  // estouro derrubar os outros onze arquivos nao e.
  const celulas = item.celulas_estimadas || 0
  if (celulas && celulas > LIMITE_CELULAS) {
    console.log(`    pulado: ~${(celulas / 1e6).toFixed(0)} milhoes de genotipos, `
      + `acima do teto de ${(LIMITE_CELULAS / 1e6).toFixed(0)} milhoes desta rodada`)
    linhas.push({ arquivo: rotulo, etapa: 'limite', funcao: 'variantes x amostras',
      n: 0, mediana_ms: 0, erro: 'acima do teto de genotipos desta rodada',
      celulas_estimadas: celulas, anotacao_ativa: ANOTACAO_ATIVA })
    gravarParcial()
    continue
  }

  await medir(item.arquivo, 'integridade', 'sha256',
    () => exportar.sha256(arquivoDe(caminho)), REPETICOES,
    { variantes: item.variantes, mb: item.mb })

  // ZIP passa por `extrairDoZip` ANTES da leitura, que e o que a pagina e o
  // lote fazem. Entregar o .zip direto a `lerVCF` foi a primeira versao disto,
  // e ela mediu o parser lendo bytes comprimidos como texto: 25 mil linhas
  // saiam mesmo assim, com o cabecalho perdido, e o resultado aparecia como
  // "arquivo em zip perde as amostras e presume o build". O defeito era do
  // medidor. Vale a licao: harness que nao repete o caminho da aplicacao mede
  // o harness.
  //
  // O JSZip do Node nao le o Blob que o resto da suite usa, entao aqui entra o
  // Uint8Array. No navegador quem chega e um File, que ele le direto.
  let entrada = caminho
  if (caminho.endsWith('.zip')) {
    const r = await medir(item.arquivo, 'leitura', 'extrairDoZip',
      () => parse.extrairDoZip(new Uint8Array(readFileSync(caminho))), REPETICOES,
      { variantes: item.variantes, mb: item.mb })
    if (!r) continue
    entrada = r.arquivo
  }

  const abrir = () => (typeof entrada === 'string' ? arquivoDe(entrada) : entrada)

  // Leitura. O teto e o mesmo da pagina; o arquivo 05 existe para atravessa-lo.
  const lido = await medir(item.arquivo, 'leitura', 'lerVCF',
    () => parse.lerVCF(abrir(), { limite: 400000 }), REPETICOES,
    { variantes: item.variantes, mb: item.mb })
  if (!lido) continue

  const v = lido.variantes
  const meta = lido.meta
  const ultima = linhas[linhas.length - 1]
  ultima.lidas = v.length
  ultima.truncado = Boolean(lido.truncado)
  ultima.build = meta.build || ''
  ultima.build_presumido = Boolean(meta.buildPresumido)
  ultima.amostras = (meta.amostras || []).length
  ultima.variantes_por_segundo = Math.round(v.length / (ultima.mediana_ms / 1000))
  ultima.mb_por_segundo = +(item.mb / (ultima.mediana_ms / 1000)).toFixed(2)

  const comum = { variantes: v.length, mb: item.mb }

  await medir(item.arquivo, 'qualidade', 'resumo', () => metricas.resumo(v), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'balanço alélico',
    () => metricas.balancoAlelico(v), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'Ti/Tv separado',
    () => metricas.titvSeparado(v), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'verificação de sexo',
    () => metricas.verificarSexo(v), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'espectro de substituição',
    () => metricas.espectroSubstituicao(v), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'histograma de profundidade',
    () => metricas.histograma(v, 'dp'), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'histograma de qualidade',
    () => metricas.histograma(v, 'qual'), REPETICOES, comum)
  await medir(item.arquivo, 'qualidade', 'por cromossomo',
    () => metricas.porCromossomo(v), REPETICOES, comum)

  await medir(item.arquivo, 'genes', 'gene por posição',
    () => v.map((x) => metricas.geneDaPosicao(indiceGenes, x.chrom, x.pos)),
    REPETICOES, comum)

  // Anotacao clinica. O cruzamento por coordenada so vale em GRCh38, e o
  // arquivo 08 existe para provar que ele fica desligado em GRCh37 sem levar o
  // cruzamento por rsID junto.
  const anot = await medir(item.arquivo, 'anotacao', 'ClinVar',
    () => clinvar.anotar(v, { camadas: ['aviso'], build: meta.build }), 1, comum)
  const la = linhas[linhas.length - 1]
  la.casadas = anot?.casadas ?? 0
  la.divergentes = anot?.divergentes ?? 0
  la.fracao_casada = +((anot?.casadas ?? 0) / Math.max(1, v.length)).toFixed(6)

  await medir(item.arquivo, 'anotacao', 'resumo clínico',
    () => clinvar.resumoClinico(v), REPETICOES, comum)
  await medir(item.arquivo, 'anotacao', 'ClinGen',
    () => interp.anotarClinGen(v, clingen, simbolos), REPETICOES, comum)
  await medir(item.arquivo, 'anotacao', 'CPIC',
    () => interp.anotarCPIC(v, cpic), REPETICOES, comum)
  await medir(item.arquivo, 'anotacao', 'critérios ACMG',
    () => interp.anotarACMG(v), REPETICOES, comum)
  if (painelAlvo) {
    await medir(item.arquivo, 'anotacao', 'filtro por painel',
      () => interp.aplicarPainel(v, painelAlvo, simbolos), REPETICOES,
      { ...comum, painel: painelAlvo.nome, genes_do_painel: painelAlvo.genes.length })
  }

  await medir(item.arquivo, 'heranca', 'heterozigoto composto',
    () => metricas.heterozigotosCompostos(v), REPETICOES, comum)
  if ((meta.amostras || []).length >= 3) {
    await medir(item.arquivo, 'heranca', 'análise de trio',
      () => metricas.analiseTrio(v, { proband: 0, mae: 1, pai: 2 }), REPETICOES, comum)
  }

  // Saidas. Guardadas para a suite de reprodutibilidade comparar hash depois.
  const saidas = {}
  saidas.TSV = await medir(item.arquivo, 'saida', 'TSV',
    () => exportar.paraTSV(v), REPETICOES, comum)
  saidas.CSV = await medir(item.arquivo, 'saida', 'CSV',
    () => exportar.paraCSV(v), REPETICOES, comum)
  saidas.JSON = await medir(item.arquivo, 'saida', 'JSON',
    () => exportar.paraJSON({ nome: item.arquivo, meta, metricas: metricas.resumo(v),
      variantes: v, resumoCli: null, genesMapeados: true }), REPETICOES, comum)
  saidas.VCF = await medir(item.arquivo, 'saida', 'VCF anotado',
    () => exportar.paraVCF({ variantes: v, meta, nome: item.arquivo,
      sha256: 'a'.repeat(64), versaoClinvar: '2026-08-22', painel: null }),
    REPETICOES, comum)
  // XLSX so ate 100 mil: acima disso passa de dois minutos por repeticao e o
  // que se aprende com o terceiro ponto ja esta na curva dos dois primeiros.
  if (v.length <= 100_000) {
    const blob = await medir(item.arquivo, 'saida', 'XLSX',
      () => exportar.paraXLSX([{ nome: 'Variantes',
        linhas: [exportar.CABECALHO, ...exportar.linhasTabulares(v)] }]),
      Math.min(2, REPETICOES), comum)
    if (blob) linhas[linhas.length - 1].bytes = blob.size
  }
  for (const [f, texto] of Object.entries(saidas)) {
    const l = linhas.find((x) => x.arquivo === item.arquivo && x.funcao === f
      || (f === 'VCF' && x.arquivo === item.arquivo && x.funcao === 'VCF anotado'))
    if (l && typeof texto === 'string') {
      l.bytes = Buffer.byteLength(texto)
      l.mb_por_segundo = +((l.bytes / 1048576) / (l.mediana_ms / 1000)).toFixed(2)
    }
  }
  gravarParcial()
  saidasPorArquivo.set(item.arquivo, {
    TSV: createHash('sha256').update(saidas.TSV || '').digest('hex'),
    CSV: createHash('sha256').update(saidas.CSV || '').digest('hex'),
    VCF: createHash('sha256').update(saidas.VCF || '').digest('hex'),
  })
}

// --- gravacao ----------------------------------------------------------------

function csv(nome, dados) {
  if (!dados.length) return
  const cols = [...new Set(dados.flatMap((d) => Object.keys(d)))]
  const esc = (x) => {
    const t = x == null ? '' : String(x)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  writeFileSync(join(SAIDA, nome),
    [cols.join(','), ...dados.map((d) => cols.map((c) => esc(d[c])).join(','))].join('\n') + '\n')
  console.log(`\n  -> ${nome} (${dados.length} linhas)`)
}

gravarParcial()
writeFileSync(join(SAIDA, 'hashes_de_saida.json'),
  JSON.stringify(Object.fromEntries(saidasPorArquivo), null, 2) + '\n')
writeFileSync(join(SAIDA, 'ambiente.json'), JSON.stringify({
  node: process.version, plataforma: process.platform, arch: process.arch,
  repeticoes: REPETICOES, anotacao_ativa: ANOTACAO_ATIVA,
  // O teto de heap decide ate onde a medida chega nos arquivos grandes, entao
  // ele e parte da condicao e nao do ambiente incidental.
  teto_heap_mb: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576),
}, null, 2) + '\n')
console.log('\nConcluido.')
