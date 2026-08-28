// Pontuação de evidência ACMG, pelo sistema de pontos bayesiano.
//
// O módulo já avaliava sete critérios e os listava como rótulos soltos. Um
// rótulo solto não se soma nem se ordena: com PVS1 numa variante e BA1 noutra,
// não há como dizer qual merece o olho primeiro. O sistema de pontos resolve
// isso porque atribui um peso a cada FORÇA de critério e os pesos somam.
//
// A tabela é a de Tavtigian et al. (2018, Genet Med 20:1054; refinada em 2020,
// Hum Mutat 41:1734), adotada pelo ClinGen Sequence Variant Interpretation
// Working Group. Ela mostrou que a regra combinatória original da ACMG/AMP de
// 2015 é equivalente a um classificador bayesiano em que cada degrau de força
// dobra o peso: apoio 1, moderado 2, forte 4, muito forte 8.
//
// O QUE ESTE MÓDULO NÃO FAZ, e é a parte que decide o desenho da saída: ele não
// classifica. A regra completa combina 28 critérios e este módulo avalia sete;
// os outros 21 exigem literatura, segregação familiar, ensaio funcional ou
// predição in silico que nenhum arquivo VCF carrega. Somar sete e imprimir o
// nome da faixa em que a soma cai produziria uma classificação ACMG a partir de
// uma fração da evidência: PM2 sozinho, que é só uma consulta de frequência,
// pontua +2 e cairia na janela do VUS. Num laudo de laboratório, "VUS" significa
// "a evidência foi avaliada e ficou inconclusiva", e não "sete de 28 critérios
// foram olhados". Por isso o que sai daqui são os PONTOS e a DIREÇÃO para onde
// eles apontam, nunca o nome de uma classe.
//
// As faixas ficam registradas em `FAIXAS` porque são o que dá escala ao número:
// sem elas, +11 é um inteiro sem referência. Elas servem para posicionar o
// marcador na régua da tela, e não para nomear a variante.

// Pontos por critério. O sinal é a direção: positivo é evidência patogênica,
// negativo é benigna.
export const PONTOS = {
  PVS1: 8,   // patogênico muito forte
  PS1: 4, PS2: 4, PS3: 4, PS4: 4,
  PM1: 2, PM2: 2, PM3: 2, PM4: 2, PM5: 2, PM6: 2,
  PP1: 1, PP2: 1, PP3: 1, PP4: 1, PP5: 1,
  BA1: -8,   // benigno autônomo
  BS1: -4, BS2: -4, BS3: -4, BS4: -4,
  BP1: -1, BP2: -1, BP3: -1, BP4: -1, BP5: -1, BP6: -1, BP7: -1,
}

// Faixas do sistema de pontos. Existem para dar escala ao número na régua da
// tela; o nome NÃO é impresso como classificação da variante.
export const FAIXAS = [
  { de: 10, ate: Infinity, nome: 'Patogênica', direcao: 'patogenica' },
  { de: 6, ate: 9, nome: 'Provavelmente patogênica', direcao: 'patogenica' },
  { de: 0, ate: 5, nome: 'Significado incerto', direcao: 'incerta' },
  { de: -6, ate: -1, nome: 'Provavelmente benigna', direcao: 'benigna' },
  { de: -Infinity, ate: -7, nome: 'Benigna', direcao: 'benigna' },
]

// Extremos que os sete critérios computáveis alcançam. São o que transforma a
// pontuação em fração de uma escala: +11 de um teto de +11 é uma coisa, +11 de
// um teto de +30 seria outra.
export const TETO = PONTOS.PVS1 + PONTOS.PM2 + PONTOS.PP5          // +11
export const PISO = PONTOS.BA1 + PONTOS.BP6 + PONTOS.BP7           // -10

// Total de critérios da regra ACMG/AMP de 2015. Os 21 que faltam saem impressos
// junto do escore: mostrar sete sem dizer que existem 28 sugere uma conclusão
// que ninguém tirou.
export const TOTAL_CRITERIOS = 28
export const COMPUTAVEIS = 7

export function direcaoDe(pontos) {
  for (const f of FAIXAS) {
    if (pontos >= f.de && pontos <= f.ate) return f
  }
  return FAIXAS[2]
}

// Pontua a lista de critérios que `criteriosACMG` produziu.
//
// Critério com `ressalva` entra com os PONTOS CHEIOS e o escore sai marcado.
// A alternativa era rebaixar um degrau de força, que é o padrão de decremento
// do ClinGen SVI para evidência não confirmada; a marca foi a escolha, e a
// diferença importa: PVS1 vale 8 dos 10 pontos que a faixa patogênica pede, e
// ele dispara aqui a partir da validade gene-doença do ClinGen, sem o mecanismo
// de perda de função verificado gene a gene. Quem lê o escore precisa saber
// disso, e por isso `naoVerificados` acompanha o número em toda saída, incluindo
// a coluna do CSV: um escore marcado é honesto, um escore silencioso não é.
export function pontuarACMG(criterios) {
  if (!criterios?.length) return null

  let pontos = 0
  const naoVerificados = []
  for (const c of criterios) {
    const p = PONTOS[c.id]
    if (p == null) continue
    pontos += p
    if (c.ressalva) naoVerificados.push(c.id)
  }

  const faixa = direcaoDe(pontos)
  return {
    pontos,
    // Nunca o nome da faixa: só o lado para onde a evidência aponta.
    direcao: pontos === 0 ? 'neutra' : faixa.direcao,
    avaliados: criterios.length,
    computaveis: COMPUTAVEIS,
    naoAvaliados: TOTAL_CRITERIOS - COMPUTAVEIS,
    naoVerificados,
    teto: TETO,
    piso: PISO,
    // Posição de 0 a 1 na régua entre o piso e o teto do que é computável.
    // Serve ao desenho e nada mais.
    fracao: (pontos - PISO) / (TETO - PISO),
  }
}

// Ordem de revisão: quem tem mais evidência patogênica primeiro. É o que o
// escore permite e a lista de rótulos não permitia.
export function ordenarPorEvidencia(variantes) {
  return [...variantes].sort((a, b) => (b.acmgPontos?.pontos ?? -Infinity)
    - (a.acmgPontos?.pontos ?? -Infinity))
}


// --- A mesma pontuação, para as variantes que vêm da API ----------------------
//
// A página de variante e as tabelas das páginas de gene e de doença mostram
// significado clínico e frequência, que são as mesmas entradas de que os
// critérios do módulo de VCF saem. O que difere é o FORMATO: o VCF embarcado
// guarda código inteiro (`sig`, `estrelas`, `consequencia`) e a API devolve o
// texto do ClinVar. Traduzir aqui, e não duplicar a regra, é o que mantém uma
// tabela de pontos só: um escore que discordasse de si mesmo entre duas telas
// do mesmo produto seria pior que nenhum escore.
//
// PVS1 NÃO entra por este caminho, e a ausência é deliberada. Ele exige a
// validade gene-doença do ClinGen para confirmar que o mecanismo da doença é
// perda de função, e essas páginas não carregam esse dado. Um PVS1 disparado só
// pela consequência molecular valeria 8 dos 10 pontos da faixa patogênica a
// partir de evidência que ninguém verificou.

const REVISAO_ESTRELAS = [
  [/practice guideline/i, 4],
  [/reviewed by expert panel/i, 3],
  [/multiple submitters.*no conflicts/i, 2],
  [/criteria provided.*conflicting/i, 1],
  [/criteria provided.*single submitter/i, 1],
  [/no assertion|no classification|flagged/i, 0],
]

export function estrelasDaRevisao(texto) {
  if (!texto) return 0
  for (const [re, n] of REVISAO_ESTRELAS) if (re.test(texto)) return n
  return 0
}

const PATOGENICO = /^(pathogenic|likely pathogenic|pathogenic\/likely pathogenic)/i
const BENIGNO = /^(benign|likely benign|benign\/likely benign)/i

export function criteriosDaApi({ significado, revisao, af, consequencia } = {}) {
  const criterios = []
  const estrelas = estrelasDaRevisao(revisao)

  if (af != null && af >= 0.05) {
    criterios.push({ id: 'BA1', valor: af, fonte: 'gnomAD' })
  } else if (af != null && af >= 0.01) {
    criterios.push({ id: 'BS1', valor: af, fonte: 'gnomAD' })
  } else if (af != null && af < 0.0001) {
    // Frequência conhecida e muito baixa. Ausência de valor NÃO dispara PM2
    // aqui: "a API não devolveu frequência" não é "a variante é ausente das
    // bases populacionais", e confundir os dois marca de rara uma variante que
    // simplesmente não foi consultada.
    criterios.push({ id: 'PM2', valor: af, fonte: 'gnomAD' })
  }

  if (significado && PATOGENICO.test(significado) && estrelas >= 2) {
    criterios.push({ id: 'PP5', valor: null, fonte: `ClinVar, ${estrelas} estrelas` })
  }
  if (significado && BENIGNO.test(significado) && estrelas >= 2) {
    criterios.push({ id: 'BP6', valor: null, fonte: `ClinVar, ${estrelas} estrelas` })
  }
  if (consequencia && /synonymous/i.test(consequencia)) {
    criterios.push({
      id: 'BP7', valor: null, fonte: 'consequência sinônima',
      ressalva: 'o efeito sobre splicing não foi previsto; BP7 completo exige essa predição',
    })
  }

  return criterios
}

// Atalho para as telas: dos campos da API direto ao escore.
export function escoreDaApi(campos) {
  const c = criteriosDaApi(campos)
  const escore = pontuarACMG(c)
  return escore ? { escore, criterios: c } : null
}
