// Roda o VCF real pelo MESMO pipeline da pagina e grava todas as saidas.
//
// Nao e uma simulacao: sao os modulos que o navegador carrega, chamados na
// mesma ordem em que a pagina os chama. O que muda e so o ambiente, Node em vez
// de aba, e por isso os caminhos de `/data/...` sao resolvidos contra o disco.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = '/Volumes/promethion/genvar-app'
const SRC = `${RAIZ}/frontend/src`
const PUBLICO = `${RAIZ}/frontend/public`
const SAIDA = `${RAIZ}/mock-results-vcf-test`
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

const parse = await import(`${SRC}/vcf/parse.js`)
const met = await import(`${SRC}/vcf/metricas.js`)
const clinvar = await import(`${SRC}/vcf/clinvar.js`)
const interp = await import(`${SRC}/vcf/interpretacao.js`)
const exportar = await import(`${SRC}/vcf/exportar.js`)
const saidas = await import(`${SRC}/vcf/saidas.js`)

const ENTRADA = `${RAIZ}/benchmark-v2/corpus/reais/nist-usuario.vcf.gz`
const bytes = readFileSync(ENTRADA)
const arq = new Blob([bytes])
Object.defineProperty(arq, 'name', { value: 'NIST-HG001.vcf.gz' })

console.log('Lendo', basename(ENTRADA), `(${(bytes.length / 1048576).toFixed(2)} MB)`)
const { variantes, meta, lidos, truncado } = await parse.lerVCF(arq, { limite: 400000 })
console.log(`  ${variantes.length} variantes, build ${meta.build}, amostras ${(meta.amostras || []).join(', ')}`)

const sha = await exportar.sha256(new Blob([bytes]))
console.log('  sha256', sha.slice(0, 24), '...')

// Catalogos, na mesma ordem da pagina.
const [paineis, simbolos, clingen, cpic] = await Promise.all([
  interp.carregarPaineis(), interp.carregarSimbolos(),
  interp.carregarClinGen(), interp.carregarCPIC(),
])

const anot = await clinvar.anotar(variantes, { camadas: ['aviso'], build: meta.build })
console.log(`  ClinVar: ${anot.casadas} casadas, ${anot.divergentes} com alelo divergente`)
interp.anotarClinGen(variantes, clingen, simbolos)
interp.anotarCPIC(variantes, cpic)
const nAcmg = interp.anotarACMG(variantes)
console.log(`  ACMG: ${nAcmg} variantes com pelo menos um criterio`)

const genesJson = JSON.parse(readFileSync(join(PUBLICO, 'data/burden/genes.json'), 'utf8'))
const idx = met.indiceDeGenes(genesJson)
for (const v of variantes) v.gene = v.gene || met.geneDaPosicao(idx, v.chrom, v.pos)

const metricas = met.resumo(variantes)
const resumoCli = clinvar.resumoClinico(variantes)
console.log(`  Ti/Tv ${metricas.titv?.toFixed(2)}, ${(metricas.fracaoConhecida * 100).toFixed(1)}% ja no dbSNP`)

const base = { nome: 'NIST-HG001.vcf.gz', tamanho: bytes.length, meta, variantes, lidos,
  truncado, metricas, resumoCli, genesMapeados: meta.build === 'GRCh38',
  sha256: sha, versaoClinvar: '2026-08-22', painel: null }

// Saidas de texto, pelas mesmas funcoes que os botoes chamam.
writeFileSync(join(SAIDA, 'NIST-HG001-genvar.tsv'), exportar.paraTSV(variantes))
writeFileSync(join(SAIDA, 'NIST-HG001-genvar.csv'), exportar.paraCSV(variantes))
// O JSON sai indentado e da 21 MB com 30 mil variantes. Gravado ja comprimido,
// porque a alternativa e lembrar de comprimir a mao a cada corrida, e quem
// esquecer versiona os 21 MB.
writeFileSync(join(SAIDA, 'NIST-HG001-genvar.json.gz'),
  gzipSync(Buffer.from(exportar.paraJSON(base)), { level: 9 }))
writeFileSync(join(SAIDA, 'NIST-HG001-genvar.vcf'), exportar.paraVCF({
  variantes, meta, nome: base.nome, sha256: sha, versaoClinvar: '2026-08-22', painel: null }))
console.log('  TSV, CSV, JSON.gz e VCF anotado gravados')

const dp = met.histograma(variantes, 'dp')
const qual = met.histograma(variantes, 'qual')
const cromo = met.porCromossomo(variantes)
const espectro = met.espectroSubstituicao(variantes)
const porGene = Object.entries(variantes.reduce((c, v) => {
  if (v.gene) c[v.gene] = (c[v.gene] || 0) + 1
  return c
}, {})).sort((a, b) => b[1] - a[1]).slice(0, 12)

const completo = { ...base, dp, qual, cromo, espectro, porGene, papeis: {}, termos: [],
  anotacao: { casadas: anot.casadas, divergentes: anot.divergentes,
    podeCoordenada: meta.build === 'GRCh38', camadasCarregadas: 'aviso' } }

// A planilha vem depois do `completo` porque a aba Metodologia le a anotacao.
const xlsx = await exportar.paraXLSX(saidas.abasXLSX(completo))
writeFileSync(join(SAIDA, 'NIST-HG001-genvar.xlsx'), Buffer.from(await xlsx.arrayBuffer()))
console.log(`  XLSX gravado, ${(xlsx.size / 1024).toFixed(0)} KB`)

const { gerarPDF } = await import(`${SRC}/vcf/pdf.jsx`)
const blob = await gerarPDF(completo)
writeFileSync(join(SAIDA, 'NIST-HG001-genvar.pdf'), Buffer.from(await blob.arrayBuffer()))
console.log(`  PDF gravado, ${(blob.size / 1024).toFixed(0)} KB`)

writeFileSync(join(SAIDA, 'resumo.json'), JSON.stringify({
  arquivo: base.nome, sha256: sha, build: meta.build, build_presumido: !!meta.buildPresumido,
  chamador: meta.chamador || null, amostras: meta.amostras,
  variantes: variantes.length, linhas_lidas: lidos, truncado,
  titv: metricas.titv, fracao_no_dbsnp: metricas.fracaoConhecida,
  clinvar_casadas: anot.casadas, clinvar_divergentes: anot.divergentes,
  acmg_com_criterio: nAcmg, por_classificacao: resumoCli.porSig,
}, null, 2) + '\n')
console.log('  resumo.json gravado')
