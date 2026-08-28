// Processamento em lote: muitos VCF numa passada.
//
// O módulo lia um arquivo por vez, e um laboratório processa dezenas por dia. A
// diferença entre demonstração e ferramenta de rotina está aqui.
//
// A DECISÃO QUE FAZ ISSO ESCALAR é o que se guarda de cada arquivo. Cinquenta
// exomas de 30 mil variantes são 1,5 milhão de objetos, e o navegador não
// aguenta segurar todos: o pico de memória derruba a aba antes do décimo
// arquivo. Então cada arquivo é lido, anotado, resumido e DESCARTADO, ficando
// apenas as métricas e os achados, que são algumas centenas de linhas. É a
// mesma razão pela qual um pipeline de verdade não carrega a coorte inteira em
// memória.
//
// Serial e não paralelo, também de propósito: a leitura já satura um núcleo, e
// abrir cinco em paralelo troca tempo total por risco de estourar a memória.

import { lerVCF, extrairDoZip } from './parse'
import { resumo, balancoAlelico, titvSeparado, verificarSexo, indiceDeGenes, geneDaPosicao } from './metricas'
import { anotar, resumoClinico } from './clinvar'
import { anotarClinGen, anotarCPIC, anotarACMG, aplicarPainel, resolverSimbolo } from './interpretacao'
import { sha256 } from './exportar'

// Classificações que entram como achado. Benigna e provavelmente benigna ficam
// de fora do consolidado: numa triagem de coorte elas são ruído por volume.
const ACHADO = new Set([1, 2, 3, 4, 9, 10, 11])

export const LIMITE_ARQUIVOS = 200

export function ehVcf(arquivo) {
  return /\.(vcf|vcf\.gz|gz|zip)$/i.test(arquivo.name)
}

// Um arquivo, do começo ao fim, guardando só o que sobrevive.
async function processarUm(arquivo, ctx, onEtapa) {
  const inicio = performance.now()
  let alvo = arquivo
  let extras = 0

  if (/\.zip$/i.test(arquivo.name)) {
    onEtapa?.('abrindo o zip')
    const r = await extrairDoZip(arquivo)
    alvo = r.arquivo
    extras = r.outros
  }

  onEtapa?.('impressão digital')
  const impressao = await sha256(alvo).catch(() => null)

  onEtapa?.('lendo')
  const { meta, variantes, lidos, truncado } = await lerVCF(alvo, { limite: ctx.teto })
  if (!variantes.length) throw new Error('nenhuma variante; o arquivo é mesmo um VCF?')

  const podeMapear = meta.build === 'GRCh38'
  if (podeMapear && ctx.indiceGenes) {
    for (const v of variantes) v.gene = geneDaPosicao(ctx.indiceGenes, v.chrom, v.pos)
  }

  onEtapa?.('anotando')
  const info = await anotar(variantes, {
    camadas: ctx.camadas, build: meta.build, cromossomos: ctx.cromossomos,
  })
  anotarClinGen(variantes, ctx.clingen, ctx.simbolos)
  anotarCPIC(variantes, ctx.cpic)
  anotarACMG(variantes)

  const noPainel = ctx.painel ? aplicarPainel(variantes, ctx.painel, ctx.simbolos).variantes : variantes
  const metricas = resumo(noPainel)
  const cli = resumoClinico(noPainel)

  // O que sobrevive ao descarte: achados e números. Tudo o mais é liberado.
  const achados = noPainel
    .filter((v) => v.clinvar && ACHADO.has(v.clinvar.sig))
    .map((v) => ({
      amostra: meta.amostras[0] || arquivo.name,
      chrom: v.chrom, pos: v.pos, ref: v.ref, alt: v.alt, rsid: v.rsid,
      gene: v.clinvar.gene || v.gene || null,
      sig: v.clinvar.sig, estrelas: v.clinvar.estrelas,
      condicao: v.clinvar.condicao, consequencia: v.clinvar.consequencia,
      af: v.clinvar.af, zigosidade: v.zigosidade, ab: v.ab, dp: v.dp, qual: v.qual,
      heranca: v.clingen?.heranca_sigla || null,
      validade: v.clingen?.classificacao || null,
      acmg: (v.acmg || []).map((c) => c.id),
      cpic: v.cpic ? v.cpic.gene : null,
    }))

  const ab = balancoAlelico(noPainel)
  const titv = titvSeparado(noPainel)
  const sexo = verificarSexo(variantes)

  return {
    nome: arquivo.name,
    tamanho: arquivo.size,
    sha256: impressao,
    outrosNoZip: extras,
    amostras: meta.amostras,
    build: meta.build,
    buildOrigem: meta.buildPresumido ? 'presumido' : meta.buildDeduzido ? 'deduzido' : 'declarado',
    chamador: meta.chamador,
    lidos,
    truncado,
    genesMapeados: podeMapear,
    metricas,
    // Só o que a tela e o consolidado leem, sem a lista inteira de variantes.
    qualidade: {
      titvGlobal: metricas.titv,
      titvConhecidas: titv.conhecidas.titv,
      titvNovas: titv.novas.titv,
      abMediana: ab.mediana,
      abDesviados: ab.desviados,
      abFracaoDesviada: ab.fracaoDesviada,
      abTotal: ab.n,
      sexo: sexo.inferido,
      sexoMotivo: sexo.motivo,
      fracaoConhecida: metricas.fracaoConhecida,
      passa: metricas.passa,
      total: metricas.total,
    },
    porSig: cli.porSig,
    achados,
    casadas: info.casadas,
    segundos: (performance.now() - inicio) / 1000,
    erro: null,
  }
}

// Sinaliza o que merece o olho de um humano antes do resto. É triagem, não
// classificação: a regra é grosseira de propósito, e o que ela ordena é a fila
// de revisão, não o laudo.
export function sinaisDeAtencao(r) {
  const s = []
  const q = r.qualidade
  if (q.titvNovas != null && q.titvNovas < 1.5) {
    s.push({ nivel: 'critico', texto: `Ti/Tv de variante nova em ${q.titvNovas.toFixed(2)}` })
  }
  if (q.abTotal > 50 && q.abFracaoDesviada > 0.1) {
    s.push({ nivel: 'critico', texto: `${(q.abFracaoDesviada * 100).toFixed(0)}% dos heterozigotos com balanço fora da faixa` })
  }
  if (!q.sexo) s.push({ nivel: 'aviso', texto: q.sexoMotivo || 'sexo cromossômico não inferido' })
  if (q.total && q.passa / q.total < 0.8) {
    s.push({ nivel: 'aviso', texto: `${((1 - q.passa / q.total) * 100).toFixed(0)}% reprovadas no filtro do chamador` })
  }
  if (r.truncado) s.push({ nivel: 'aviso', texto: 'arquivo maior que o teto de leitura' })
  if (r.buildOrigem === 'presumido') s.push({ nivel: 'aviso', texto: 'build de referência presumido' })
  if (!r.genesMapeados) s.push({ nivel: 'aviso', texto: 'cruzamento com genes desligado' })
  const patog = [1, 2, 3].reduce((n, k) => n + (r.porSig[k] || 0), 0)
  if (patog > 0) s.push({ nivel: 'achado', texto: `${patog} patogênica${patog > 1 ? 's' : ''}` })
  return s
}

export async function processarLote(arquivos, {
  camadas = ['aviso'], painel = null, teto = 400_000,
  clingen = null, cpic = null, simbolos = null, indiceGenes = null,
  onProgresso,
} = {}) {
  const lista = [...arquivos].filter(ehVcf).slice(0, LIMITE_ARQUIVOS)
  // Um índice do ClinVar para o lote inteiro, e não um por arquivo. Sem isto o
  // índice é remontado a cada arquivo cujo conjunto de cromossomos difira, e
  // cada remontagem expande meio milhão de linhas.
  const TODOS_CROMOSSOMOS = [...Array(22)].map((_, i) => String(i + 1)).concat(['X', 'Y', 'MT'])
  const ctx = {
    camadas, painel, teto, clingen, cpic, simbolos, indiceGenes,
    cromossomos: TODOS_CROMOSSOMOS,
  }
  const resultados = []

  for (let i = 0; i < lista.length; i += 1) {
    const arquivo = lista[i]
    onProgresso?.({ i, total: lista.length, nome: arquivo.name, etapa: 'começando', resultados })
    try {
      const r = await processarUm(arquivo, ctx, (etapa) =>
        onProgresso?.({ i, total: lista.length, nome: arquivo.name, etapa, resultados }))
      resultados.push(r)
    } catch (e) {
      // Um arquivo ruim não derruba o lote. Ele entra na lista com o motivo,
      // que é o que permite reprocessar só o que falhou.
      resultados.push({
        nome: arquivo.name, tamanho: arquivo.size, erro: e.message || String(e),
        achados: [], porSig: {}, qualidade: {}, metricas: {},
      })
    }
    // Cede a thread entre arquivos: sem isto a barra de progresso congela e a
    // aba parece travada durante todo o lote.
    await new Promise((r) => setTimeout(r, 0))
  }

  onProgresso?.({ i: lista.length, total: lista.length, etapa: 'concluído', resultados })
  return resultados
}

// --- consolidado da coorte ---------------------------------------------------

// Genes recorrentes: quantas amostras trazem achado no mesmo gene. Numa coorte,
// gene que aparece em muitas amostras é candidato a causa comum ou a artefato
// da região, e as duas leituras pedem o mesmo primeiro passo, que é olhar.
export function genesRecorrentes(resultados) {
  const porGene = {}
  for (const r of resultados) {
    const vistos = new Set()
    for (const a of r.achados) {
      if (!a.gene || vistos.has(a.gene)) continue
      vistos.add(a.gene)
      porGene[a.gene] ||= { gene: a.gene, amostras: 0, patogenicas: 0, condicoes: new Set() }
      porGene[a.gene].amostras += 1
      if ([1, 2, 3].includes(a.sig)) porGene[a.gene].patogenicas += 1
      if (a.condicao) porGene[a.gene].condicoes.add(a.condicao)
    }
  }
  return Object.values(porGene)
    .map((g) => ({ ...g, condicoes: [...g.condicoes].slice(0, 3) }))
    .sort((a, b) => b.patogenicas - a.patogenicas || b.amostras - a.amostras)
}

// Variantes recorrentes. Uma variante em muitas amostras de um mesmo lote quase
// nunca é achado clínico: é artefato do pipeline, da captura ou do lote de
// sequenciamento. Ver isso exige a coorte, e é impossível arquivo a arquivo.
export function variantesRecorrentes(resultados, minAmostras = 2) {
  const c = {}
  for (const r of resultados) {
    for (const a of r.achados) {
      const k = `${a.chrom}:${a.pos}:${a.ref}>${a.alt}`
      c[k] ||= { chave: k, ...a, amostras: 0, nomes: [] }
      c[k].amostras += 1
      if (c[k].nomes.length < 8) c[k].nomes.push(r.nome)
    }
  }
  return Object.values(c)
    .filter((v) => v.amostras >= minAmostras)
    .sort((a, b) => b.amostras - a.amostras)
}

export function resumoDoLote(resultados) {
  const ok = resultados.filter((r) => !r.erro)
  const comFalha = resultados.filter((r) => r.erro)
  const achados = ok.flatMap((r) => r.achados)
  const patogenicas = achados.filter((a) => [1, 2, 3].includes(a.sig))
  const comAchado = ok.filter((r) => r.achados.some((a) => [1, 2, 3].includes(a.sig)))
  const segundos = ok.reduce((s, r) => s + (r.segundos || 0), 0)
  return {
    arquivos: resultados.length,
    processados: ok.length,
    comFalha: comFalha.length,
    variantes: ok.reduce((s, r) => s + (r.metricas.total || 0), 0),
    achados: achados.length,
    patogenicas: patogenicas.length,
    amostrasComPatogenica: comAchado.length,
    segundos,
    porSegundo: segundos ? ok.reduce((s, r) => s + (r.metricas.total || 0), 0) / segundos : 0,
  }
}

// --- exportação do consolidado -----------------------------------------------

export const CABECALHO_LOTE = [
  'arquivo', 'amostra', 'sha256', 'build', 'origem_do_build', 'chamador',
  'variantes', 'passaram_no_filtro', 'titv_global', 'titv_conhecidas', 'titv_novas',
  'balanco_alelico_mediana', 'heterozigotos_fora_da_faixa', 'sexo_inferido',
  'fracao_no_dbsnp', 'achados', 'patogenicas', 'incertas', 'erro',
]

export function linhasDoLote(resultados) {
  return resultados.map((r) => {
    const q = r.qualidade || {}
    const p = (k) => r.porSig?.[k] || 0
    return [
      r.nome, (r.amostras || [])[0] || '', r.sha256 || '', r.build || '', r.buildOrigem || '',
      r.chamador || '', r.metricas?.total ?? '', q.passa ?? '',
      q.titvGlobal != null ? +q.titvGlobal.toFixed(3) : '',
      q.titvConhecidas != null ? +q.titvConhecidas.toFixed(3) : '',
      q.titvNovas != null ? +q.titvNovas.toFixed(3) : '',
      q.abMediana != null ? +q.abMediana.toFixed(3) : '',
      q.abDesviados ?? '', q.sexo || '',
      q.fracaoConhecida != null ? +q.fracaoConhecida.toFixed(4) : '',
      r.achados.length, p(1) + p(2) + p(3), p(5), r.erro || '',
    ]
  })
}

export const CABECALHO_ACHADOS = [
  'arquivo', 'amostra', 'cromossomo', 'posicao', 'ref', 'alt', 'rsid', 'gene',
  'classificacao_codigo', 'estrelas', 'condicao', 'consequencia_codigo',
  'frequencia', 'zigosidade', 'balanco_alelico', 'profundidade', 'qualidade',
  'heranca_clingen', 'validade_clingen', 'criterios_acmg', 'gene_cpic',
]

export function linhasDeAchados(resultados) {
  const fora = []
  for (const r of resultados) {
    for (const a of r.achados) {
      fora.push([
        r.nome, a.amostra, a.chrom, a.pos, a.ref, a.alt, a.rsid || '', a.gene || '',
        a.sig, a.estrelas, a.condicao || '', a.consequencia || '',
        a.af != null ? a.af : '', a.zigosidade || '',
        a.ab != null ? +a.ab.toFixed(4) : '', a.dp ?? '', a.qual ?? '',
        a.heranca || '', a.validade || '', (a.acmg || []).join('|'), a.cpic || '',
      ])
    }
  }
  return fora
}
