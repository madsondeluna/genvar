// Carregadores dos dados de associacao (burden), servidos como JSON estatico
// em public/data/burden (amostra de demonstracao; em producao o ETL gera o
// conjunto completo). Cache em memoria, imutavel por release.
import { CHR_ORDER, ANCESTRIES } from './constants'

// Fonte dos dados de burden. Por padrao os JSON sao servidos do proprio site
// (public/data/burden). Em producao, aponte VITE_BURDEN_DATA_URL para o host do
// dataset completo (ex.: um bucket estatico) sem rebuildar o resto do app.
const CONFIGURED = import.meta.env.VITE_BURDEN_DATA_URL
const BASE = (CONFIGURED && CONFIGURED.replace(/\/$/, '')) || `${import.meta.env.BASE_URL}data/burden`
const _cache = new Map()

function getJSON(url) {
  if (!_cache.has(url)) {
    _cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar ${url}`)
      return r.json()
    }).catch((e) => { _cache.delete(url); throw e }))
  }
  return _cache.get(url)
}

export const loadGenes = () => getJSON(`${BASE}/genes.json`)
export const loadPhenotypes = () => getJSON(`${BASE}/phenotypes.json`)
export const loadBiobanks = () => getJSON(`${BASE}/biobanks.json`)
// Procedencia do dado (fonte, versao, data). Opcional: degrada para null se o
// arquivo nao existir (amostra sem provenance.json).
export const loadProvenance = () => getJSON(`${BASE}/provenance.json`).catch(() => null)
export const loadAllResults = (anc) => getJSON(`${BASE}/all_results.${anc || 'All'}.json`)

// Todos os resultados por ancestria, para montar o forest cross-ancestry de um
// gene. Retorna um mapa ancestria -> tabela colunar.
export function loadAllAncestries() {
  return Promise.all(ANCESTRIES.map((a) => loadAllResults(a).then((d) => [a, d])))
    .then((pairs) => Object.fromEntries(pairs))
}

// Layout do genoma: concatena os cromossomos de ponta a ponta a partir das
// posicoes de genes.json. O span de cada cromossomo e o maior 'end' observado.
export function buildGenomeLayout(genes) {
  const spans = {}
  for (let i = 0; i < genes.chr.length; i++) {
    const c = genes.chr[i]
    const end = genes.end[i]
    if (end > (spans[c] || 0)) spans[c] = end
  }
  const offset = {}
  let total = 0
  for (const c of CHR_ORDER) {
    offset[c] = total
    total += spans[c] || 0
  }
  const pos = (geneIdx) => {
    const c = genes.chr[geneIdx]
    if (offset[c] == null) return null
    return offset[c] + (genes.start[geneIdx] + genes.end[geneIdx]) / 2
  }
  // centros dos cromossomos, para os rotulos do eixo x
  const centers = CHR_ORDER.filter((c) => spans[c]).map((c) => ({
    chr: c, x: offset[c] + (spans[c] || 0) / 2,
  }))
  return { total, pos, offset, spans, centers }
}
