// Onde a leitura para de caber, medido em processo proprio.
//
// POR QUE SEPARADO. Um arquivo de muitas amostras nao estoura por numero de
// variantes: estoura por variantes VEZES amostras, que e o que ocupa memoria. O
// 1000 Genomes chrY tem 1.233 amostras, e 60 mil variantes dele sao 76 milhoes
// de genotipos. Medido junto dos outros, o estouro derrubava a corrida inteira e
// os outros onze arquivos ficavam sem medida; a versao anterior deste benchmark
// resolvia isso PULANDO o arquivo por estimativa, o que troca um resultado por
// uma suposicao. Em processo proprio, o estouro e o resultado e nao um acidente.
//
// O QUE SE MEDE. Vazao de leitura e heap a cada cinco mil variantes, ate o
// orcamento de tempo. O numero que interessa nao e "estourou": e a curva de
// vazao contra heap, que mostra o ponto em que a maquina passa a paginar e o
// custo por variante decola.
//
// Uso, a partir de frontend/:
//   NODE_OPTIONS="--expose-gc --max-old-space-size=12288" \
//     npx vite-node ../benchmark-final/navegador/teto_memoria.mjs -- \
//       --arquivo ../benchmark-final/corpus/reais/1000g-chrY.vcf.gz
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const BENCH = resolve(AQUI, '..')
const RAIZ = resolve(AQUI, '../..')
const SRC = join(RAIZ, 'frontend/src')
const PUBLICO = join(RAIZ, 'frontend/public')

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}
const ARQUIVO = resolve(arg('arquivo', join(BENCH, 'corpus/reais/1000g-chrY.vcf.gz')))
const SAIDA = resolve(arg('saida', join(BENCH, 'resultados/local')))
const ORCAMENTO_S = Number(arg('orcamento', '420'))
const PASSO = Number(arg('passo', '5000'))

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

if (!existsSync(ARQUIVO)) {
  console.log(`arquivo ausente: ${ARQUIVO}`)
  process.exit(0)
}

const parse = await import(join(SRC, 'vcf/parse.js'))
const heapMB = () => process.memoryUsage().heapUsed / 1048576

const bytesArquivo = readFileSync(ARQUIVO)
console.log(`\nTeto de memoria: ${basename(ARQUIVO)}, ${(bytesArquivo.length / 1048576).toFixed(1)} MB`)
console.log(`  orcamento de ${ORCAMENTO_S} s, amostra a cada ${PASSO} variantes\n`)

const amostras = []
const t0 = Date.now()
let ultimo = 0
let desfecho = 'concluiu'
let variantesFinais = 0

try {
  const r = await parse.lerVCF(new File([bytesArquivo], basename(ARQUIVO)), {
    onProgresso: ({ variantes: n, bytes }) => {
      const s = (Date.now() - t0) / 1000
      if (n - ultimo >= PASSO) {
        ultimo = n
        const linha = { variantes: n, mb_lidos: +(bytes / 1048576).toFixed(1),
          segundos: +s.toFixed(1), heap_mb: +heapMB().toFixed(0),
          variantes_por_segundo: +(n / s).toFixed(0) }
        amostras.push(linha)
        console.log(`    ${String(n).padStart(7)} variantes  ${String(linha.mb_lidos).padStart(6)} MB  `
          + `${String(linha.segundos).padStart(6)} s  heap ${String(linha.heap_mb).padStart(6)} MB  `
          + `${String(linha.variantes_por_segundo).padStart(5)} var/s`)
      }
      if (s > ORCAMENTO_S) throw new Error(`orcamento esgotado em ${n} variantes`)
    },
  })
  variantesFinais = r.variantes.length
} catch (e) {
  desfecho = e.message.includes('orcamento') ? 'orcamento esgotado' : `erro: ${e.message}`
  variantesFinais = ultimo
}

const seg = (Date.now() - t0) / 1000
console.log(`\n  desfecho: ${desfecho} apos ${seg.toFixed(1)} s, heap ${heapMB().toFixed(0)} MB`)

// O achado e a QUEDA de vazao, nao o estouro: onde a vazao cai a uma fracao do
// pico, a maquina passou a paginar e o custo por variante deixou de ser linear.
if (amostras.length >= 2) {
  const pico = Math.max(...amostras.map((a) => a.variantes_por_segundo))
  const fim = amostras[amostras.length - 1]
  const joelho = amostras.find((a) => a.variantes_por_segundo < pico / 2)
  console.log(`  vazao de pico ${pico} var/s, final ${fim.variantes_por_segundo} var/s `
    + `(${(pico / fim.variantes_por_segundo).toFixed(1)}x mais lenta)`)
  if (joelho) {
    console.log(`  metade da vazao de pico em ${joelho.variantes} variantes, `
      + `com heap de ${joelho.heap_mb} MB`)
  }
}

mkdirSync(SAIDA, { recursive: true })
writeFileSync(join(SAIDA, 'teto_memoria.csv'),
  ['arquivo,variantes,mb_lidos,segundos,heap_mb,variantes_por_segundo,desfecho']
    .concat(amostras.map((a) => [basename(ARQUIVO), a.variantes, a.mb_lidos, a.segundos,
      a.heap_mb, a.variantes_por_segundo, desfecho].join(','))).join('\n') + '\n')
console.log(`  -> teto_memoria.csv (${amostras.length} amostras)`)
