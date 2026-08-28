import { describe, it, expect } from 'vitest'
import { pontuarACMG, direcaoDe, PONTOS, TETO, PISO, FAIXAS } from './acmg'
import { criteriosACMG } from './interpretacao'

describe('pontuação ACMG', () => {
  it('soma os pesos por força de critério', () => {
    // PVS1 8 + PM2 2 + PP5 1 = 11, que é o teto do que este módulo computa.
    const r = pontuarACMG([{ id: 'PVS1' }, { id: 'PM2' }, { id: 'PP5' }])
    expect(r.pontos).toBe(11)
    expect(r.pontos).toBe(TETO)
    expect(r.direcao).toBe('patogenica')
  })

  it('soma evidência benigna como negativa', () => {
    const r = pontuarACMG([{ id: 'BA1' }, { id: 'BP6' }, { id: 'BP7' }])
    expect(r.pontos).toBe(-10)
    expect(r.pontos).toBe(PISO)
    expect(r.direcao).toBe('benigna')
  })

  it('cancela evidência oposta em vez de escolher um lado', () => {
    // BS1 -4 com PM2 +2 dá -2: a soma é o mecanismo, e não uma regra de
    // precedência que decidiria qual dos dois critérios "vence".
    const r = pontuarACMG([{ id: 'BS1' }, { id: 'PM2' }])
    expect(r.pontos).toBe(-2)
    expect(r.direcao).toBe('benigna')
  })

  it('NUNCA devolve o nome de uma faixa', () => {
    // A garantia que mais importa: PM2 sozinho pontua +2, que cai na janela do
    // significado incerto. Se algum campo do retorno trouxesse esse nome, uma
    // consulta de frequência viraria um VUS na tela e no PDF.
    const r = pontuarACMG([{ id: 'PM2' }])
    expect(r.pontos).toBe(2)
    expect(r.direcao).toBe('incerta')
    const texto = JSON.stringify(r).toLowerCase()
    for (const f of FAIXAS) {
      expect(texto).not.toContain(f.nome.toLowerCase())
    }
    expect(texto).not.toContain('vus')
  })

  it('marca o escore quando um critério entrou com ressalva', () => {
    // PVS1 vale 8 dos 10 pontos da faixa patogênica e dispara a partir da
    // validade gene-doença, sem o mecanismo de perda de função verificado. Os
    // pontos são cheios por decisão, então a marca é o que resta.
    const r = pontuarACMG([
      { id: 'PVS1', ressalva: 'mecanismo não verificado' },
      { id: 'PM2' },
    ])
    expect(r.pontos).toBe(10)
    expect(r.naoVerificados).toEqual(['PVS1'])
  })

  it('não marca escore cujos critérios são todos verificados', () => {
    expect(pontuarACMG([{ id: 'PM2' }, { id: 'PP5' }]).naoVerificados).toEqual([])
  })

  it('declara quantos critérios ficaram de fora', () => {
    const r = pontuarACMG([{ id: 'PM2' }])
    expect(r.computaveis).toBe(7)
    expect(r.naoAvaliados).toBe(21)
    expect(r.avaliados).toBe(1)
  })

  it('devolve null sem critério nenhum', () => {
    expect(pontuarACMG([])).toBeNull()
    expect(pontuarACMG(undefined)).toBeNull()
  })

  it('ignora identificador que não está na tabela de pontos', () => {
    // Critério novo, escrito errado ou vindo de uma versão futura não pode
    // somar NaN e contaminar o escore inteiro em silêncio.
    const r = pontuarACMG([{ id: 'PM2' }, { id: 'PX9' }])
    expect(r.pontos).toBe(2)
    expect(Number.isFinite(r.pontos)).toBe(true)
  })

  it('mantém a fração dentro da régua', () => {
    expect(pontuarACMG([{ id: 'PVS1' }, { id: 'PM2' }, { id: 'PP5' }]).fracao).toBe(1)
    expect(pontuarACMG([{ id: 'BA1' }, { id: 'BP6' }, { id: 'BP7' }]).fracao).toBe(0)
  })

  it('dobra o peso a cada degrau de força, como a tabela de Tavtigian', () => {
    expect(PONTOS.PP5).toBe(1)
    expect(PONTOS.PM2).toBe(2)
    expect(PONTOS.PS1).toBe(4)
    expect(PONTOS.PVS1).toBe(8)
    expect(PONTOS.BP6).toBe(-1)
    expect(PONTOS.BS1).toBe(-4)
    expect(PONTOS.BA1).toBe(-8)
  })

  it('põe as fronteiras das faixas onde o sistema de pontos as põe', () => {
    expect(direcaoDe(10).nome).toBe('Patogênica')
    expect(direcaoDe(9).nome).toBe('Provavelmente patogênica')
    expect(direcaoDe(6).nome).toBe('Provavelmente patogênica')
    expect(direcaoDe(5).nome).toBe('Significado incerto')
    expect(direcaoDe(0).nome).toBe('Significado incerto')
    expect(direcaoDe(-1).nome).toBe('Provavelmente benigna')
    expect(direcaoDe(-6).nome).toBe('Provavelmente benigna')
    expect(direcaoDe(-7).nome).toBe('Benigna')
  })
})

describe('do critério ao escore, no caminho real', () => {
  it('pontua uma variante frequente como evidência benigna', () => {
    // 8% numa base populacional dispara BA1, que sozinho é -8.
    const v = { gnomad: { af: 0.08, dataset: 'gnomad_r4' } }
    const r = pontuarACMG(criteriosACMG(v))
    expect(r.pontos).toBe(-8)
    expect(r.direcao).toBe('benigna')
  })

  it('não pontua PM2 quando a frequência veio só do ClinVar', () => {
    // "O ClinVar não publicou frequência" não é "ausente das bases
    // populacionais", e PM2 sobre essa confusão marca de patogênica uma
    // variante que existe.
    const v = { clinvar: { af: null, sig: 5, estrelas: 1 } }
    expect(pontuarACMG(criteriosACMG(v))).toBeNull()
  })
})

describe('escore a partir da resposta da API', () => {
  it('lê as estrelas do texto de revisão do ClinVar', async () => {
    const { estrelasDaRevisao } = await import('./acmg')
    expect(estrelasDaRevisao('practice guideline')).toBe(4)
    expect(estrelasDaRevisao('reviewed by expert panel')).toBe(3)
    expect(estrelasDaRevisao('criteria provided, multiple submitters, no conflicts')).toBe(2)
    expect(estrelasDaRevisao('criteria provided, single submitter')).toBe(1)
    expect(estrelasDaRevisao('no assertion criteria provided')).toBe(0)
    expect(estrelasDaRevisao(null)).toBe(0)
  })

  it('pontua patogênica bem revisada com frequência baixa', async () => {
    const { escoreDaApi } = await import('./acmg')
    const r = escoreDaApi({
      significado: 'Pathogenic',
      revisao: 'reviewed by expert panel',
      af: 0.00001,
    })
    // PM2 +2 e PP5 +1 somam 3, que ainda cai na janela 0 a 5. A direcao vem da
    // FAIXA e nao do sinal, e essa e a leitura conservadora certa: tres pontos
    // sao evidencia patogenica INSUFICIENTE, nao evidencia patogenica fraca. Um
    // escore positivo que ja se anunciasse como "patogenica" deixaria frequencia
    // baixa mais uma classificacao de terceiro apontando para o lado patogenico
    // numa tela clinica.
    expect(r.escore.pontos).toBe(3)
    expect(r.escore.direcao).toBe('incerta')
  })

  it('aponta patogenica so quando o escore alcanca a faixa', async () => {
    const { pontuarACMG } = await import('./acmg')
    expect(pontuarACMG([{ id: 'PM2' }, { id: 'PP5' }]).direcao).toBe('incerta')
    expect(pontuarACMG([{ id: 'PVS1' }, { id: 'PM2' }]).direcao).toBe('patogenica')
  })

  it('não dispara PP5 com uma estrela só', async () => {
    const { escoreDaApi } = await import('./acmg')
    const r = escoreDaApi({
      significado: 'Pathogenic',
      revisao: 'criteria provided, single submitter',
      af: 0.2,
    })
    expect(r.criterios.map((c) => c.id)).toEqual(['BA1'])
  })

  it('nunca dispara PM2 quando a frequência não veio', async () => {
    // "A API não devolveu frequência" não é "ausente das bases populacionais".
    const { escoreDaApi } = await import('./acmg')
    const r = escoreDaApi({ significado: 'Pathogenic', revisao: 'practice guideline', af: null })
    expect(r.criterios.map((c) => c.id)).toEqual(['PP5'])
  })

  it('nunca produz PVS1 por este caminho', async () => {
    // PVS1 vale 8 dos 10 pontos da faixa patogênica e exige a validade
    // gene-doença do ClinGen, que estas telas não carregam.
    const { criteriosDaApi } = await import('./acmg')
    for (const c of ['frameshift_variant', 'stop_gained', 'splice_donor_variant']) {
      const r = criteriosDaApi({ significado: 'Pathogenic', revisao: 'practice guideline',
        af: 0.000001, consequencia: c })
      expect(r.map((x) => x.id)).not.toContain('PVS1')
    }
  })
})
