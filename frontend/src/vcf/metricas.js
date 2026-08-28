// Métricas de um conjunto de variantes. Tudo é derivado do próprio VCF, sem
// rede: são os números que um laboratório olha primeiro para decidir se o
// arquivo presta antes de interpretar qualquer variante.

import { CHR_ORDER } from '../burden/constants'

// Exoma humano fica perto de 3,0 e genoma perto de 2,0. Abaixo de 1,5 o
// conjunto costuma carregar chamada falsa em excesso: transversão é mais rara
// que transição na biologia, então ruído aleatório puxa a razão para baixo.
export const TITV_ESPERADO = { exoma: [2.8, 3.3], genoma: [1.9, 2.1] }

export function resumo(variantes) {
  const t = { total: variantes.length, passa: 0, tipos: {}, cromossomos: {}, zigosidade: {},
              transicoes: 0, transversoes: 0, comRsid: 0, filtros: {} }
  for (const v of variantes) {
    if (v.passa) t.passa += 1
    t.tipos[v.tipo] = (t.tipos[v.tipo] || 0) + 1
    t.cromossomos[v.chrom] = (t.cromossomos[v.chrom] || 0) + 1
    t.zigosidade[v.zigosidade] = (t.zigosidade[v.zigosidade] || 0) + 1
    t.filtros[v.filtro] = (t.filtros[v.filtro] || 0) + 1
    if (v.transicao === true) t.transicoes += 1
    else if (v.transicao === false) t.transversoes += 1
    if (v.rsid) t.comRsid += 1
  }
  t.titv = t.transversoes ? t.transicoes / t.transversoes : null
  // Fração já catalogada no dbSNP. Baixa demais indica ruído; alta demais num
  // conjunto que deveria ter achado novo indica filtro agressivo.
  t.fracaoConhecida = t.total ? t.comRsid / t.total : 0
  return t
}

// Histograma de um campo numérico, em faixas de largura fixa. Serve para
// profundidade e qualidade, que são as duas distribuições que revelam
// cobertura irregular antes de qualquer interpretação clínica.
export function histograma(variantes, campo, { faixas = 20, max = null } = {}) {
  const vals = variantes.map((v) => v[campo]).filter((x) => x != null && Number.isFinite(x))
  if (!vals.length) return { faixas: [], n: 0 }
  // Laço em vez de `Math.max(...vals)`: espalhar um vetor num argumento empurra
  // um item por posição de pilha, e um exoma de 400 mil variantes estoura com
  // `Maximum call stack size exceeded` dentro do cálculo de uma métrica.
  let maior = -Infinity
  for (const v of vals) if (v > maior) maior = v
  const topo = max ?? Math.min(maior, quantil(vals, 0.99))
  const largura = topo / faixas || 1
  const bins = Array.from({ length: faixas }, (_, i) => ({
    de: +(i * largura).toFixed(1), ate: +((i + 1) * largura).toFixed(1), n: 0,
  }))
  for (const v of vals) {
    const i = Math.min(faixas - 1, Math.floor(v / largura))
    if (i >= 0) bins[i].n += 1
  }
  return { faixas: bins, n: vals.length, mediana: quantil(vals, 0.5), media: vals.reduce((a, b) => a + b, 0) / vals.length }
}

export function quantil(vals, q) {
  const s = [...vals].sort((a, b) => a - b)
  const i = (s.length - 1) * q
  const lo = Math.floor(i), hi = Math.ceil(i)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo)
}

// Densidade por cromossomo, na ordem canônica. Um pico isolado costuma ser
// região de baixa mapeabilidade, não descoberta biológica.
export function porCromossomo(variantes) {
  const c = {}
  for (const v of variantes) c[v.chrom] = (c[v.chrom] || 0) + 1
  return CHR_ORDER.filter((k) => c[k]).map((k) => ({ chr: k, n: c[k] }))
}

// Índice de genes por coordenada, montado do genes.json da camada de burden
// (20.033 genes com cromossomo, início e fim). Busca binária por cromossomo:
// varredura linear sobre 20 mil genes vezes 100 mil variantes não termina.
export function indiceDeGenes(genesJson) {
  const porChr = {}
  const { symbols, chr, start, end } = genesJson
  for (let i = 0; i < symbols.length; i += 1) {
    const c = String(chr[i]).replace(/^chr/i, '')
    ;(porChr[c] ||= []).push({ s: symbols[i], a: start[i], b: end[i] })
  }
  for (const c of Object.keys(porChr)) porChr[c].sort((x, y) => x.a - y.a)
  return porChr
}

export function geneDaPosicao(indice, chrom, pos) {
  const lista = indice[chrom]
  if (!lista) return null
  let lo = 0, hi = lista.length - 1, achado = null
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (lista[m].a > pos) hi = m - 1
    else { if (pos <= lista[m].b) achado = lista[m].s; lo = m + 1 }
  }
  if (achado) return achado
  // genes se sobrepõem: a busca acima acha o de menor início que contém a
  // posição, e um vizinho pode contê-la também. Confere os anteriores.
  for (let i = Math.max(0, lo - 6); i < Math.min(lista.length, lo + 1); i += 1) {
    if (pos >= lista[i].a && pos <= lista[i].b) return lista[i].s
  }
  return null
}

// Espectro de substituição, as seis classes canônicas. Como a fita é dupla,
// C>A e G>T são a mesma troca vista de lados opostos: colapsar em pirimidina
// (C ou T) é a convenção, e sem ela o mesmo evento aparece em duas barras.
//
// O perfil é assinatura de processo: excesso de C>T em CpG é desaminação
// espontânea de citosina metilada, o relógio molecular de qualquer amostra
// humana; excesso de C>A costuma ser oxidação de guanina durante o preparo da
// biblioteca, ou seja, artefato de bancada e não biologia.
const COMPLEMENTO = { A: 'T', T: 'A', C: 'G', G: 'C' }
export const CLASSES_SUBST = ['C>A', 'C>G', 'C>T', 'T>A', 'T>C', 'T>G']

export function espectroSubstituicao(variantes) {
  const c = Object.fromEntries(CLASSES_SUBST.map((k) => [k, 0]))
  let n = 0
  for (const v of variantes) {
    if (v.ref?.length !== 1 || v.alt?.length !== 1) continue
    let [r, a] = [v.ref.toUpperCase(), v.alt.toUpperCase()]
    if (!COMPLEMENTO[r] || !COMPLEMENTO[a] || r === a) continue
    if (r === 'A' || r === 'G') { r = COMPLEMENTO[r]; a = COMPLEMENTO[a] }
    const k = `${r}>${a}`
    if (k in c) { c[k] += 1; n += 1 }
  }
  return { classes: CLASSES_SUBST.map((k) => ({ rotulo: k, n: c[k] })), n }
}

// --- Balanço alélico --------------------------------------------------------
//
// Heterozigoto verdadeiro fica perto de 0,5: as duas cópias do cromossomo são
// amplificadas igualmente, então metade das leituras traz cada alelo. O desvio
// tem causa, e a causa muda a conduta: abaixo de 0,25 costuma ser artefato de
// alinhamento ou contaminação; acima de 0,75 num heterozigoto costuma ser perda
// do alelo de referência, que é sinal de deleção na região.
//
// A faixa aceitável é 0,25 a 0,75, que é o intervalo usado na prática clínica.
// Ela é larga de propósito: em profundidade baixa a variação binomial sozinha
// já joga um heterozigoto real para longe de 0,5, e apertar o corte transformaria
// cobertura baixa em achado.
export const AB_MIN = 0.25
export const AB_MAX = 0.75

export function balancoAlelico(variantes) {
  const faixas = Array.from({ length: 20 }, (_, i) => ({
    de: +(i * 0.05).toFixed(2), ate: +((i + 1) * 0.05).toFixed(2), n: 0,
  }))
  let n = 0, desviados = 0
  const suspeitas = []
  for (const v of variantes) {
    if (v.ab == null || v.zigosidade !== 'Heterozigoto') continue
    n += 1
    faixas[Math.min(19, Math.floor(v.ab / 0.05))].n += 1
    if (v.ab < AB_MIN || v.ab > AB_MAX) {
      desviados += 1
      if (suspeitas.length < 200) suspeitas.push(v)
    }
  }
  const vals = variantes.filter((v) => v.ab != null && v.zigosidade === 'Heterozigoto').map((v) => v.ab)
  return {
    faixas, n, desviados,
    fracaoDesviada: n ? desviados / n : 0,
    mediana: vals.length ? quantil(vals, 0.5) : null,
    suspeitas,
  }
}

// --- Ti/Tv separado entre conhecidas e novas ---------------------------------
//
// A razão global esconde o que interessa. Variante já depositada no dbSNP quase
// sempre tem Ti/Tv bom, porque passou pelo crivo de já ter sido vista antes; o
// ruído de chamada se concentra nas novas. Um arquivo com Ti/Tv global de 2,7 e
// Ti/Tv de variante nova em 1,1 tem problema, e a razão global não mostra isso.
export function titvSeparado(variantes) {
  const c = {
    conhecidas: { ti: 0, tv: 0 },
    novas: { ti: 0, tv: 0 },
  }
  for (const v of variantes) {
    if (v.transicao == null) continue
    const g = v.rsid ? c.conhecidas : c.novas
    if (v.transicao) g.ti += 1
    else g.tv += 1
  }
  const razao = (g) => (g.tv ? g.ti / g.tv : null)
  return {
    conhecidas: { ...c.conhecidas, n: c.conhecidas.ti + c.conhecidas.tv, titv: razao(c.conhecidas) },
    novas: { ...c.novas, n: c.novas.ti + c.novas.tv, titv: razao(c.novas) },
  }
}

// --- Verificação de sexo ------------------------------------------------------
//
// Pega troca de amostra, que é o erro mais banal e mais grave de um laboratório.
// Dois sinais independentes, e é a concordância entre eles que dá a resposta:
//
//   heterozigose no X fora da região pseudoautossômica. XY tem uma cópia só do
//   X ali, então heterozigoto é raro. XX tem duas, e heterozigoto é comum.
//   presença de variante no Y. XY tem Y, XX não tem.
//
// As duas regiões pseudoautossômicas do X (PAR1 e PAR2) são excluídas porque
// nelas o X e o Y recombinam e um XY é diploide de verdade: contá-las faria todo
// homem parecer XX. Coordenadas GRCh38.
const PAR_X = [[10001, 2781479], [155701383, 156030895]]
const naPAR = (pos) => PAR_X.some(([a, b]) => pos >= a && pos <= b)

export function verificarSexo(variantes) {
  let xHet = 0, xTotal = 0, yVariantes = 0
  for (const v of variantes) {
    if (v.chrom === 'X' && !naPAR(v.pos)) {
      if (v.zigosidade === 'Heterozigoto' || v.zigosidade === 'Homozigoto alt') {
        xTotal += 1
        if (v.zigosidade === 'Heterozigoto') xHet += 1
      }
    } else if (v.chrom === 'Y') {
      yVariantes += 1
    }
  }
  const fracaoHetX = xTotal ? xHet / xTotal : null

  // Sem X suficiente não há inferência. Um painel de 40 genes pode não ter
  // nenhuma variante no X, e responder "XY" a partir de zero seria inventar.
  if (xTotal < 20) {
    return { inferido: null, motivo: 'poucas variantes no X para inferir', xTotal, xHet, fracaoHetX, yVariantes }
  }
  const temY = yVariantes >= 5
  const xDiploide = fracaoHetX > 0.2
  let inferido = null
  if (xDiploide && !temY) inferido = 'XX'
  else if (!xDiploide && temY) inferido = 'XY'
  return {
    inferido,
    motivo: inferido ? null : 'os dois sinais discordam: heterozigose no X e presença de Y não fecham',
    xTotal, xHet, fracaoHetX, yVariantes,
    discordante: !inferido && xTotal >= 20,
  }
}

// --- Candidatos a heterozigoto composto ---------------------------------------
//
// Duas variantes em heterozigose no mesmo gene. É o mecanismo da maioria das
// doenças recessivas, e nenhuma das duas isolada chama atenção numa lista
// ordenada por gravidade individual.
//
// CANDIDATO, não achado, e a diferença é de fase. Duas variantes em heterozigose
// só formam um composto se estiverem em cromossomos OPOSTOS (em trans): aí as
// duas cópias do gene estão comprometidas. Em cis, as duas viajam no mesmo
// cromossomo, a outra cópia está intacta e o efeito é o de um heterozigoto
// comum. Sem fase não há como distinguir, e o que resolve é genótipo dos pais ou
// fasamento por leitura.
export function heterozigotosCompostos(variantes, { apenasAnotadas = false } = {}) {
  const porGene = {}
  for (const v of variantes) {
    if (v.zigosidade !== 'Heterozigoto') continue
    const g = v.gene || v.clinvar?.gene
    if (!g) continue
    if (apenasAnotadas && !v.clinvar) continue
    ;(porGene[g] ||= []).push(v)
  }
  const out = []
  for (const [gene, lista] of Object.entries(porGene)) {
    if (lista.length < 2) continue
    // Duas variantes na mesma posição são o mesmo sítio com alelos diferentes,
    // não duas cópias comprometidas.
    const posicoes = new Set(lista.map((v) => v.pos))
    if (posicoes.size < 2) continue
    out.push({
      gene,
      variantes: lista.sort((a, b) => a.pos - b.pos),
      n: lista.length,
      // Fase declarada nas duas E na mesma linha de origem não basta para dizer
      // trans: fase de VCF é por bloco, e blocos diferentes não são comparáveis.
      // O que dá para afirmar é se há fase alguma.
      temFase: lista.every((v) => v.fasado),
      patogenicas: lista.filter((v) => [1, 2, 3].includes(v.clinvar?.sig)).length,
      incertas: lista.filter((v) => v.clinvar?.sig === 5).length,
    })
  }
  return out.sort((a, b) =>
    b.patogenicas - a.patogenicas || b.incertas - a.incertas || b.n - a.n)
}

// --- Trio: de novo e segregação ------------------------------------------------
//
// A regra ingênua (heterozigoto na criança, referência nos dois pais) é uma
// fábrica de falso positivo, e o motivo é cobertura: um pai com 3 leituras
// naquele sítio sai como referência homozigota porque nenhuma das 3 calhou de
// trazer o alelo. O piso de profundidade parental é o que separa "os pais não
// têm" de "não se sabe se os pais têm".
//
// O número de sítios EXCLUÍDOS por cobertura parental insuficiente sai junto, e
// não é detalhe: "3 de novo" e "3 de novo, com 400 sítios que não deu para
// avaliar" são leituras opostas do mesmo arquivo.
export const DP_PARENTAL_MIN = 10

export function analiseTrio(variantes, { proband = 0, mae = null, pai = null } = {}) {
  if (mae == null || pai == null) return null
  const deNovo = []
  const recessivas = []
  const compostosTrans = []
  let semCoberturaParental = 0
  let avaliadas = 0

  const porGene = {}

  for (const v of variantes) {
    const c = v.amostras[proband]
    const m = v.amostras[mae]
    const p = v.amostras[pai]
    if (!c || !m || !p || !c.tem) continue
    avaliadas += 1

    const paisCobertos = (m.dp ?? 0) >= DP_PARENTAL_MIN && (p.dp ?? 0) >= DP_PARENTAL_MIN
    const paisSemAlelo = m.refHom && p.refHom && (m.ad?.alt ?? 0) === 0 && (p.ad?.alt ?? 0) === 0

    if (paisSemAlelo) {
      if (paisCobertos) deNovo.push(v)
      else semCoberturaParental += 1
    }

    // Recessiva homozigota: criança com as duas cópias, cada pai carregando uma.
    if (c.zigosidade === 'Homozigoto alt' && m.tem && p.tem
        && m.zigosidade === 'Heterozigoto' && p.zigosidade === 'Heterozigoto') {
      recessivas.push(v)
    }

    // Para o composto em trans: guardar de qual lado veio cada heterozigoto.
    if (c.zigosidade === 'Heterozigoto') {
      const g = v.gene || v.clinvar?.gene
      if (g) {
        const daMae = m.tem && !p.tem
        const doPai = p.tem && !m.tem
        if (daMae || doPai) (porGene[g] ||= []).push({ v, origem: daMae ? 'mãe' : 'pai' })
      }
    }
  }

  // Duas heterozigotas no mesmo gene, uma herdada de cada lado: isso É trans, e
  // é a única forma de afirmar composto sem fasamento por leitura.
  for (const [gene, lista] of Object.entries(porGene)) {
    const daMae = lista.filter((x) => x.origem === 'mãe')
    const doPai = lista.filter((x) => x.origem === 'pai')
    if (daMae.length && doPai.length) {
      compostosTrans.push({
        gene,
        variantes: [...daMae, ...doPai].map((x) => x.v).sort((a, b) => a.pos - b.pos),
        origens: Object.fromEntries([...daMae, ...doPai].map((x) => [`${x.v.chrom}:${x.v.pos}`, x.origem])),
        patogenicas: [...daMae, ...doPai].filter((x) => [1, 2, 3].includes(x.v.clinvar?.sig)).length,
      })
    }
  }

  return {
    deNovo: deNovo.sort((a, b) => (b.clinvar ? 1 : 0) - (a.clinvar ? 1 : 0)),
    recessivas,
    compostosTrans: compostosTrans.sort((a, b) => b.patogenicas - a.patogenicas),
    semCoberturaParental,
    avaliadas,
    dpMin: DP_PARENTAL_MIN,
  }
}
