// Camada de interpretação: painel, ClinGen, CPIC, gnomAD ao vivo e critérios ACMG.
//
// Nenhuma destas funções decide se uma variante causa doença. Elas reúnem o que
// as fontes públicas dizem e mostram de onde veio cada afirmação, que é a
// diferença entre uma ferramenta de apoio e um oráculo.

import { pontuarACMG } from './acmg'

const BASE = import.meta.env.BASE_URL

async function buscarGz(url) {
  const r = await fetch(url)
  if (!r.ok) return null
  // Os dois primeiros bytes decidem, não a extensão: servidor estático varia se
  // anuncia Content-Encoding: gzip, e descomprimir o já descomprimido devolve
  // "incorrect header check" com a tabela vazia e nenhum erro na tela.
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(fluxo).text())
}

const memo = new Map()
function uma(chave, fn) {
  if (!memo.has(chave)) memo.set(chave, fn().catch((e) => { memo.delete(chave); throw e }))
  return memo.get(chave)
}

export const carregarPaineis = () => uma('paineis', () => buscarGz(`${BASE}data/paineis/paineis.json.gz`))
export const carregarSimbolos = () => uma('simbolos', () => buscarGz(`${BASE}data/paineis/simbolos.json.gz`))
export const carregarClinGen = () => uma('clingen', () => buscarGz(`${BASE}data/farmaco/clingen.json.gz`))
export const carregarCPIC = () => uma('cpic', () => buscarGz(`${BASE}data/farmaco/cpic.json.gz`))

// --- Painel -------------------------------------------------------------------
//
// O símbolo do gene na variante nem sempre é o símbolo aprovado no painel: AARS
// e AARS1 são o mesmo gene, e casar em texto puro perde 162 dos 4.308 genes
// verdes do PanelApp em silêncio. Um filtro que perde em silêncio é pior que
// filtro nenhum, porque ele lê como "seu exoma está limpo para epilepsia".
export function resolverSimbolo(simbolos, s) {
  if (!s) return null
  return simbolos?.alias?.[s] || s
}

export function aplicarPainel(variantes, painel, simbolos) {
  if (!painel) return { variantes, painel: null }
  const conjunto = new Set(painel.genes)
  const dentro = variantes.filter((v) => {
    const g = resolverSimbolo(simbolos, v.gene || v.clinvar?.gene)
    return g && conjunto.has(g)
  })
  return {
    variantes: dentro,
    painel,
    genesComVariante: new Set(dentro.map((v) => resolverSimbolo(simbolos, v.gene || v.clinvar?.gene))).size,
  }
}

// --- ClinGen ------------------------------------------------------------------
//
// Responde a pergunta anterior à classificação: este gene é mesmo um gene de
// doença? Variante patogênica num gene de validade Limited não é achado forte;
// é achado num gene sobre o qual o campo ainda não concorda.
export function anotarClinGen(variantes, clingen, simbolos) {
  if (!clingen) return 0
  let n = 0
  for (const v of variantes) {
    const g = resolverSimbolo(simbolos, v.gene || v.clinvar?.gene)
    const c = g && clingen.genes[g]
    if (c?.length) { v.clingen = c[0]; v.clingenTodas = c; n += 1 }
  }
  return n
}

// --- CPIC ---------------------------------------------------------------------
//
// Chega pelo rsID, que é a única chave que um VCF de variante curta oferece para
// farmacogenômica. O diplótipo (*1/*4) NÃO sai daqui: ele exige fase e número de
// cópias, e nenhum dos dois está no arquivo.
export function anotarCPIC(variantes, cpic) {
  if (!cpic) return 0
  let n = 0
  for (const v of variantes) {
    const c = v.rsid && cpic.por_rsid[v.rsid]
    if (c) { v.cpic = c; n += 1 }
  }
  return n
}

// --- gnomAD ao vivo -----------------------------------------------------------
//
// A frequência embarcada vem de ExAC, 1000 Genomes ou ESP, conforme o ClinVar
// publica, e `null` ali significa "o ClinVar não publicou frequência", não
// "ausente das bases populacionais". A distinção decide um critério ACMG inteiro
// (PM2), então a frequência estratificada por população tem de vir do gnomAD.
//
// Sai daqui apenas a coordenada e o alelo. Não identificam pessoa, e é o mesmo
// contrato que a página declara desde o começo.
const GNOMAD = 'https://gnomad.broadinstitute.org/api'

const POPULACAO = {
  afr: 'Africana', amr: 'Latina', asj: 'Judaica asquenaze', eas: 'Leste asiático',
  fin: 'Finlandesa', nfe: 'Europeia não finlandesa', sas: 'Sul da Ásia',
  mid: 'Oriente médio', remaining: 'Demais',
}

export async function frequenciaGnomad(variantes, { build = 'GRCh38', onProgresso } = {}) {
  // O conjunto do gnomAD segue o build do arquivo: r2.1 é GRCh37 e r4 é GRCh38.
  // Consultar coordenada de um contra o outro devolve ausente para quase tudo.
  const dataset = build === 'GRCh37' ? 'gnomad_r2_1' : 'gnomad_r4'
  const alvos = variantes.filter((v) => v.ref.length < 40 && v.alt.length < 40)
  let ok = 0, ausentes = 0, falhas = 0

  for (let i = 0; i < alvos.length; i += 1) {
    const v = alvos[i]
    const id = `${v.chrom}-${v.pos}-${v.ref}-${v.alt}`
    try {
      const r = await fetch(GNOMAD, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Nada de variável a mais: o GraphQL rejeita a consulta INTEIRA quando
          // uma variável declarada não é usada, e a rejeição chegava aqui como
          // `variant: null`, ou seja, com a mesma cara de "não existe no gnomAD".
          // Isso fazia toda variante sair como ausente e disparava PM2, que é um
          // critério patogênico, em variante que está no banco a 0,037%.
          query: `query($id:String!,$ds:DatasetId!){
            variant(variantId:$id,dataset:$ds){
              variant_id rsids
              genome{ac an populations{id ac an}}
              exome{ac an populations{id ac an}}
            }
          }`.replace(/\s+/g, ' '),
          variables: { id, ds: dataset },
        }),
      })
      const j = await r.json()
      // Erro de consulta NÃO é ausência. Confundir os dois foi o defeito acima,
      // e a diferença tem de sobreviver até a tela.
      if (j?.errors?.length) throw new Error(j.errors[0].message)
      const d = j?.data?.variant
      if (!d) { ausentes += 1; v.gnomad = { ausente: true, dataset }; continue }

      const somar = () => {
        const acc = {}
        for (const fonte of ['exome', 'genome']) {
          for (const p of d[fonte]?.populations || []) {
            if (!POPULACAO[p.id]) continue
            acc[p.id] ||= { ac: 0, an: 0 }
            acc[p.id].ac += p.ac
            acc[p.id].an += p.an
          }
        }
        return acc
      }
      const pops = somar()
      const ac = (d.exome?.ac || 0) + (d.genome?.ac || 0)
      const an = (d.exome?.an || 0) + (d.genome?.an || 0)
      v.gnomad = {
        dataset,
        ac, an,
        af: an ? ac / an : null,
        populacoes: Object.entries(pops)
          .map(([pop, x]) => ({ id: pop, rotulo: POPULACAO[pop], ac: x.ac, an: x.an, af: x.an ? x.ac / x.an : null }))
          .filter((p) => p.an > 0)
          .sort((a, b) => (b.af ?? 0) - (a.af ?? 0)),
      }
      ok += 1
    } catch (e) {
      falhas += 1
      v.gnomad = { falhou: true, dataset, motivo: e.message }
    }
    onProgresso?.({ feitas: i + 1, total: alvos.length, ok, ausentes, falhas })
  }
  return { total: alvos.length, ok, ausentes, falhas, dataset }
}

// --- Critérios ACMG/AMP -------------------------------------------------------
//
// Só os que saem mecanicamente do que está carregado. Não é classificação ACMG:
// a regra completa combina 28 critérios, vários deles exigindo literatura,
// segregação familiar e ensaio funcional que nenhum arquivo carrega. O que sai
// aqui são os critérios avaliáveis, com a fonte de cada um, e a lista explícita
// do que NÃO foi avaliado, porque um laudo que mostra 3 critérios sem dizer que
// existem 25 sugere uma conclusão que ninguém tirou.
//
// BA1 usa a frequência do gnomAD quando ela existe. Com a frequência embarcada
// do ClinVar o critério ainda funciona, mas a base muda (ExAC, 1000 Genomes ou
// ESP) e a coorte é menor, então a origem sai declarada junto.
export const CRITERIOS = {
  BA1: { forca: 'Benigno autônomo', texto: 'Frequência acima de 5% numa população de referência' },
  BS1: { forca: 'Benigno forte', texto: 'Frequência maior do que a esperada para a doença' },
  PM2: { forca: 'Patogênico moderado', texto: 'Ausente ou muito rara nas bases populacionais' },
  PVS1: { forca: 'Patogênico muito forte', texto: 'Perda de função em gene cujo mecanismo de doença é perda de função' },
  PP5: { forca: 'Patogênico de apoio', texto: 'Fonte respeitada relata a variante como patogênica' },
  BP6: { forca: 'Benigno de apoio', texto: 'Fonte respeitada relata a variante como benigna' },
  BP7: { forca: 'Benigno de apoio', texto: 'Variante sinônima sem efeito previsto sobre splicing' },
}

// Critérios que este módulo NÃO avalia, e por quê. Sai impresso no laudo.
export const NAO_AVALIADOS = [
  ['PS1, PM5', 'Exigem comparar a troca de aminoácido com outra variante já classificada'],
  ['PS2, PM6', 'Exigem confirmação de paternidade e maternidade, não só o trio'],
  ['PS3, BS3', 'Exigem ensaio funcional publicado'],
  ['PS4', 'Exige estudo caso-controle'],
  ['PM1', 'Exige domínio funcional mapeado e sem variação benigna'],
  ['PM3, BP2', 'Exigem fase confirmada com uma variante patogênica conhecida'],
  ['PM4, BP3', 'Exigem anotação de região repetitiva'],
  ['PP1, BS4', 'Exigem segregação em vários membros da família'],
  ['PP2, BP1', 'Exigem a distribuição de missense benigna e patogênica do gene'],
  ['PP3, BP4', 'Exigem predição in silico, que este módulo não executa'],
  ['PP4', 'Exige quadro clínico altamente específico avaliado por médico'],
  ['BS2', 'Exige a variante observada em indivíduo saudável adulto'],
]

// Perda de função: interrompe a leitura da proteína.
const LOF = new Set([3, 4, 5, 6, 12])

export function criteriosACMG(v) {
  const criterios = []
  const af = v.gnomad?.af ?? null
  const fonteAf = v.gnomad ? `gnomAD ${v.gnomad.dataset}` : (v.clinvar?.af != null ? 'ClinVar (ExAC, 1000 Genomes ou ESP)' : null)
  const afUsada = af ?? v.clinvar?.af ?? null

  if (afUsada != null && afUsada >= 0.05) {
    criterios.push({ id: 'BA1', valor: afUsada, fonte: fonteAf })
  } else if (afUsada != null && afUsada >= 0.01) {
    criterios.push({ id: 'BS1', valor: afUsada, fonte: fonteAf })
  }

  // PM2 exige saber que a variante é ausente, e "o ClinVar não publicou
  // frequência" não é ausência. Só dispara com gnomAD consultado.
  if (v.gnomad && !v.gnomad.ausente && v.gnomad.af != null && v.gnomad.af < 0.0001) {
    criterios.push({ id: 'PM2', valor: v.gnomad.af, fonte: `gnomAD ${v.gnomad.dataset}` })
  } else if (v.gnomad?.ausente && !v.gnomad.falhou) {
    criterios.push({ id: 'PM2', valor: 0, fonte: `ausente do gnomAD ${v.gnomad.dataset}` })
  }

  // PVS1 só com o mecanismo confirmado: perda de função num gene cuja doença
  // acontece por ganho de função é o contrário do critério.
  if (LOF.has(v.clinvar?.consequencia) && v.clingen?.forca >= 5) {
    criterios.push({
      id: 'PVS1',
      valor: null,
      fonte: `ClinGen: ${v.clingen.classificacao} para ${v.clingen.doenca}`,
      ressalva: 'o mecanismo de perda de função não foi verificado gene a gene; a força vem da validade gene-doença',
    })
  }

  if ([1, 2, 3].includes(v.clinvar?.sig) && v.clinvar.estrelas >= 2) {
    criterios.push({ id: 'PP5', valor: null, fonte: `ClinVar, ${v.clinvar.estrelas} estrelas` })
  }
  if ([6, 7, 8].includes(v.clinvar?.sig) && v.clinvar.estrelas >= 2) {
    criterios.push({ id: 'BP6', valor: null, fonte: `ClinVar, ${v.clinvar.estrelas} estrelas` })
  }
  if (v.clinvar?.consequencia === 2) {
    criterios.push({
      id: 'BP7', valor: null, fonte: 'consequência sinônima pelo ClinVar',
      ressalva: 'o efeito sobre splicing não foi previsto; BP7 completo exige essa predição',
    })
  }

  return criterios
}

export function anotarACMG(variantes) {
  let n = 0
  for (const v of variantes) {
    const c = criteriosACMG(v)
    if (c.length) {
      v.acmg = c
      // A pontuação anda junto dos critérios: gerar uma sem os outros deixaria
      // a tela e o CSV podendo discordar sobre a mesma variante.
      v.acmgPontos = pontuarACMG(c)
      n += 1
    }
  }
  return n
}

// --- Priorização por fenótipo (HPO) -------------------------------------------
//
// Ordena os genes pela concordância entre o quadro clínico informado e as
// condições associadas ao gene. É apoio de triagem, não diagnóstico: a
// concordância mede sobreposição de texto entre termos, e termo ausente da base
// não significa fenótipo ausente do paciente.
export function priorizarPorFenotipo(variantes, termos) {
  const alvo = termos.map((t) => t.toLowerCase().trim()).filter(Boolean)
  if (!alvo.length) return []

  const porGene = {}
  for (const v of variantes) {
    const g = v.gene || v.clinvar?.gene
    if (!g) continue
    porGene[g] ||= { gene: g, variantes: [], textos: new Set() }
    porGene[g].variantes.push(v)
    if (v.clinvar?.condicao) porGene[g].textos.add(v.clinvar.condicao.toLowerCase())
    for (const c of v.clingenTodas || []) porGene[g].textos.add((c.doenca || '').toLowerCase())
  }

  return Object.values(porGene)
    .map((g) => {
      const casados = alvo.filter((t) => [...g.textos].some((x) => x.includes(t)))
      return {
        ...g,
        textos: [...g.textos].filter(Boolean).slice(0, 5),
        casados,
        escore: casados.length / alvo.length,
        patogenicas: g.variantes.filter((v) => [1, 2, 3].includes(v.clinvar?.sig)).length,
      }
    })
    .filter((g) => g.casados.length > 0)
    .sort((a, b) => b.escore - a.escore || b.patogenicas - a.patogenicas)
}
