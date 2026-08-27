// Anotação clínica das variantes, contra o ClinVar embarcado.
//
// DUAS CHAVES, e a segunda é o que salva o arquivo real. O NIST/GIAB de teste
// é GRCh37: cruzar coordenada GRCh38 contra ele troca o gene, não erra por
// pouco. Mas 96% das variantes dele carregam rsID, e rsID independe de build.
// Então casa-se por rsID quando ele existe, e por coordenada só em GRCh38.
//
// REF e ALT entram nas duas chaves. Um rsID nomeia um SÍTIO, não um alelo:
// casar só pelo número imprimiria "patogênica" para quem carrega o alelo
// benigno do mesmo rs. Quando o número casa e o alelo não, o resultado sai
// marcado como `aleloDivergente` em vez de virar achado.

const BASE = `${import.meta.env.BASE_URL}data/clinvar/`

export const ROTULO = {
  1: 'patogênica',
  2: 'provavelmente patogênica',
  3: 'patogênica / provavelmente patogênica',
  4: 'classificações conflitantes',
  5: 'significado incerto',
  6: 'benigna',
  7: 'provavelmente benigna',
  8: 'benigna / provavelmente benigna',
  9: 'resposta a fármaco',
  10: 'fator de risco',
  11: 'associação',
  12: 'protetora',
}

// Slot de série por classificação. Estado não usa slot de série e série não usa
// cor de estado: aqui a classificação É a categoria da tabela, não um estado da
// interface, então slot de série é o correto.
export const SLOT = { 1: 8, 2: 8, 3: 8, 4: 6, 5: 2, 6: 4, 7: 4, 8: 4, 9: 7, 10: 6, 11: 3, 12: 4 }

export const ORDEM_GRAVIDADE = [1, 3, 2, 4, 10, 9, 11, 5, 12, 8, 6, 7]

export const CONSEQUENCIA = {
  1: 'troca de aminoácido', 2: 'sinônima', 3: 'códon de parada',
  4: 'mudança de matriz de leitura', 5: 'sítio doador de splicing',
  6: 'sítio aceptor de splicing', 7: 'intrônica', 8: 'região 5′ não traduzida',
  9: 'região 3′ não traduzida', 10: 'deleção em matriz', 11: 'inserção em matriz',
  12: 'códon iniciador', 13: 'perda do códon de parada', 14: 'transcrito não codificante',
  15: 'a montante do gene', 16: 'a jusante do gene', 17: 'sem alteração de sequência',
  18: 'indel em matriz',
}

// Tiers de impacto do Ensembl. Não é gravidade clínica: é quanto a troca
// mexe na proteína. Alto interrompe a leitura (parada prematura, mudança de
// matriz, sítio de splicing); moderado troca um aminoácido; baixo não muda a
// proteína; modificador cai fora da região codificante. Uma variante de alto
// impacto pode ser inofensiva num gene que não importa, e é por isso que
// impacto e classificação são duas colunas, nunca uma.
export const IMPACTO = {
  3: 'alto', 4: 'alto', 5: 'alto', 6: 'alto', 12: 'alto', 13: 'alto',
  1: 'moderado', 10: 'moderado', 11: 'moderado', 18: 'moderado',
  2: 'baixo', 17: 'baixo',
  7: 'modificador', 8: 'modificador', 9: 'modificador',
  14: 'modificador', 15: 'modificador', 16: 'modificador',
}

// Slot de série por tier, do mais forte ao mais fraco. Ordem fixa: impacto é
// escala ordenada, não categoria solta.
export const ORDEM_IMPACTO = ['alto', 'moderado', 'baixo', 'modificador']
export const SLOT_IMPACTO = { alto: 8, moderado: 6, baixo: 3, modificador: 1 }

export const ESTRELAS = {
  0: 'sem critério declarado',
  1: 'um laboratório, com critério',
  2: 'vários laboratórios, sem conflito',
  3: 'painel de especialistas',
  4: 'diretriz de prática clínica',
}

// Os turnos vêm gravados em gzip. Não é economia de disco: 157 MB de JSON cru
// entrariam no repositório e no artefato publicado, 28 MB comprimidos não.
async function buscarGz(url) {
  const r = await fetch(url)
  if (!r.ok) return null
  // O nome do arquivo não decide, os dois primeiros bytes decidem. Servidor
  // estático varia: alguns anunciam Content-Encoding: gzip num .gz e o
  // navegador já o desfaz sozinho, outros o entregam cru. Descomprimir o que
  // já veio descomprimido devolve "incorrect header check" e a tabela chega
  // vazia sem erro nenhum na tela, que foi exatamente o que aconteceu aqui.
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(fluxo).text())
}

// Nome da camada em texto corrido, para o relatório dizer o que foi consultado.
const NOME_CAMADA = {
  aviso: 'patogênica, provavelmente patogênica, conflitante, fármaco e risco',
  incerta: 'significado incerto',
  benigna: 'benigna e provavelmente benigna',
}

let indice = null

export async function carregarIndice() {
  if (!indice) indice = await fetch(`${BASE}index.json`).then((r) => r.json())
  return indice
}

// Descompacta um turno colunar em duas tabelas de busca: uma por rsID e outra
// por coordenada. Objeto por variante seria mais legível e não passa: são
// centenas de milhares de linhas por cromossomo.
function expandir(t) {
  const refs = t.ref.split(',')
  const alts = t.alt.split(',')
  const linhas = new Array(t.n)
  let pos = 0
  for (let i = 0; i < t.n; i += 1) {
    pos += t.posDelta[i]
    linhas[i] = {
      chrom: t.chrom,
      pos,
      ref: refs[i],
      alt: alts[i],
      rs: t.rs[i],
      sig: t.sig[i],
      estrelas: t.rev[i],
      consequencia: t.mc[i],
      af: t.af[i] < 0 ? null : t.af[i],
      gene: t.genes[t.geneIdx[i]],
      condicao: t.conds[t.condIdx[i]],
    }
  }
  return linhas
}

// Uma tabela por camada, montada uma vez e reaproveitada entre relatórios.
const cache = new Map()

async function camada(nome, cromossomos) {
  const chave = `${nome}:${[...cromossomos].sort().join()}`
  if (cache.has(chave)) return cache.get(chave)
  const idx = await carregarIndice()
  const existentes = cromossomos.filter((c) => idx.camadas[nome]?.[c])
  const partes = await Promise.all(
    existentes.map((c) => buscarGz(`${BASE}${nome}-${c}.json.gz`).catch((e) => {
      console.error(`ClinVar ${nome}-${c}: ${e.message}`)
      return null
    })),
  )
  const porRs = new Map()
  const porPos = new Map()
  const rsSemAlelo = new Map()
  for (const t of partes) {
    if (!t) continue
    for (const l of expandir(t)) {
      if (l.rs) {
        porRs.set(`${l.rs}|${l.ref}|${l.alt}`, l)
        if (!rsSemAlelo.has(l.rs)) rsSemAlelo.set(l.rs, l)
      }
      porPos.set(`${l.chrom}|${l.pos}|${l.ref}|${l.alt}`, l)
    }
  }
  const tabela = { porRs, porPos, rsSemAlelo }
  cache.set(chave, tabela)
  return tabela
}

// Anota em bloco. `camadas` decide o que entra: a de aviso é a que a página
// carrega sempre, as outras duas entram quando o usuário pede, porque VUS
// sozinha tem 1,3 milhão de linhas.
export async function anotar(variantes, { camadas = ['aviso'], build = null, onProgresso } = {}) {
  const cromossomos = [...new Set(variantes.map((v) => v.chrom))]
  const podeCoordenada = build === 'GRCh38'
  let casadas = 0
  let divergentes = 0

  for (const nome of camadas) {
    onProgresso?.({ camada: nome })
    const { porRs, porPos, rsSemAlelo } = await camada(nome, cromossomos)
    for (const v of variantes) {
      if (v.clinvar) continue
      let achado = null
      let via = null
      if (v.rsid) {
        const n = +v.rsid.slice(2)
        achado = porRs.get(`${n}|${v.ref}|${v.alt}`) || null
        if (achado) via = 'rsid'
        else if (rsSemAlelo.has(n)) {
          v.aleloDivergente = rsSemAlelo.get(n)
          divergentes += 1
        }
      }
      if (!achado && podeCoordenada) {
        achado = porPos.get(`${v.chrom}|${v.pos}|${v.ref}|${v.alt}`) || null
        if (achado) via = 'coordenada'
      }
      if (achado) {
        v.clinvar = achado
        v.clinvarVia = via
        casadas += 1
      }
    }
  }
  return {
    casadas, divergentes, cromossomos, podeCoordenada,
    camadasCarregadas: camadas.map((c) => NOME_CAMADA[c] || c).join(' e '),
  }
}

export function resumoClinico(variantes) {
  const porSig = {}
  const porConsequencia = {}
  const porImpacto = {}
  const genes = {}
  for (const v of variantes) {
    if (!v.clinvar) continue
    if (v.clinvar.consequencia > 0) {
      const c = v.clinvar.consequencia
      porConsequencia[c] = (porConsequencia[c] || 0) + 1
      const imp = IMPACTO[c]
      if (imp) porImpacto[imp] = (porImpacto[imp] || 0) + 1
    }
    const s = v.clinvar.sig
    porSig[s] = (porSig[s] || 0) + 1
    const g = v.clinvar.gene
    if (!g) continue
    genes[g] ||= { gene: g, total: 0, patogenicas: 0, incertas: 0, condicoes: new Set() }
    genes[g].total += 1
    if (s === 1 || s === 2 || s === 3) genes[g].patogenicas += 1
    if (s === 5) genes[g].incertas += 1
    if (v.clinvar.condicao) genes[g].condicoes.add(v.clinvar.condicao)
  }
  const lista = Object.values(genes)
    .map((g) => ({ ...g, condicoes: [...g.condicoes].slice(0, 4) }))
    .sort((a, b) => b.patogenicas - a.patogenicas || b.incertas - a.incertas || b.total - a.total)
  return { porSig, porConsequencia, porImpacto, genes: lista }
}
