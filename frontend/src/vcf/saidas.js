// Um lugar só para gerar as saídas tabulares.
//
// A lógica estava dentro da tabela de variantes, e por isso quem quisesse o dado
// tinha de achar a aba primeiro. Extraída aqui, o botão do topo e o da tabela
// chamam a mesma coisa e não há duas versões da aba Metodologia para divergirem.

import { ROTULO, ORDEM_GRAVIDADE } from './clinvar'
import {
  paraCSV, paraTSV, paraJSON, paraXLSX, paraVCF, baixar,
  CABECALHO, linhasTabulares,
} from './exportar'

const MIME = {
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  json: 'application/json',
  vcf: 'text/plain;charset=utf-8',
}

// Metodologia da planilha. Fica aqui e não duplicada em cada chamador: é o que
// permite reconstruir a origem de cada número, e duas versões dela divergindo é
// pior que não ter nenhuma.
function metodologia(dados, variantes) {
  const { meta, painel, genesMapeados, sha256, versaoClinvar, nome, termos } = dados
  return [
    ['item', 'valor'],
    ['gerador', 'GenVar'],
    ['uso', 'Pesquisa e ensino. Nao e laudo diagnostico. Achado exige confirmacao em '
      + 'laboratorio clinico e aconselhamento genetico.'],
    ['arquivo', nome],
    ['sha256 do arquivo de entrada', sha256 || 'nao calculado'],
    ['build de referencia', meta.build || 'nao declarado'],
    ['origem do build', meta.buildPresumido ? 'presumido' : meta.buildDeduzido ? 'deduzido do contig' : 'declarado no cabecalho'],
    ['chamador declarado', meta.chamador || 'nao declarado'],
    ['amostras no arquivo', (meta.amostras || []).join(', ') || 'nenhuma'],
    ['painel aplicado', painel ? `${painel.nome} (${painel.genes.length} genes)` : 'nenhum'],
    ['sinais clinicos informados', (termos || []).join('; ') || 'nenhum'],
    ['cruzamento com genes', genesMapeados ? 'ligado' : 'desligado (build diferente de GRCh38)'],
    ['anotacao clinica', `ClinVar (NCBI), dominio publico${versaoClinvar ? `, compilacao de ${versaoClinvar}` : ''}`],
    ['chave de cruzamento', 'rsID + REF + ALT; coordenada + REF + ALT apenas em GRCh38'],
    ['validade gene-doenca', 'ClinGen Gene-Disease Validity, CC0'],
    ['farmacogenomica', 'CPIC, CC BY-SA 4.0. Nao determina diplotipo: alelo estrela exige fase '
      + 'e numero de copias, ausentes de um VCF de variante curta.'],
    ['frequencia embarcada', 'ExAC, senao 1000 Genomes, senao ESP, conforme o ClinVar publica'],
    ['frequencia por populacao', variantes.some((v) => v.gnomad)
      ? 'gnomAD, consultado ao vivo para os achados'
      : 'nao consultada'],
    ['criterios ACMG', 'apenas os avaliaveis sem literatura, segregacao ou ensaio funcional. '
      + 'Nao constitui classificacao ACMG.'],
    ['linhas exportadas', variantes.length],
  ]
}

function qualidade(metricas) {
  return [
    ['metrica', 'valor'],
    ['variantes analisadas', metricas.total],
    ['passaram no filtro', metricas.passa],
    ['razao Ti/Tv', metricas.titv != null ? +metricas.titv.toFixed(3) : ''],
    ['fracao com rsID', +metricas.fracaoConhecida.toFixed(4)],
    ...Object.entries(metricas.zigosidade).map(([k, n]) => [`zigosidade: ${k}`, n]),
    ...Object.entries(metricas.tipos).map(([k, n]) => [`tipo: ${k}`, n]),
    ...Object.entries(metricas.filtros).map(([k, n]) => [`filtro: ${k === '.' ? 'sem filtro' : k}`, n]),
  ]
}

// Uma linha por população e por variante consultada. É o recorte que mais se
// pede depois do laudo, e reconstruí-lo a partir da tabela larga é trabalhoso.
function populacoes(variantes) {
  const linhas = [['cromossomo', 'posicao', 'ref', 'alt', 'rsid', 'gene',
    'populacao', 'frequencia', 'alelos_alternativos', 'cromossomos_analisados']]
  for (const v of variantes) {
    for (const p of v.gnomad?.populacoes || []) {
      linhas.push([v.chrom, v.pos, v.ref, v.alt, v.rsid || '', v.clinvar?.gene || v.gene || '',
        p.rotulo, p.af != null ? +p.af.toFixed(8) : '', p.ac, p.an])
    }
  }
  return linhas
}

export async function exportarVariantes(formato, dados) {
  const { nome, variantes, metricas, resumoCli, painel } = dados
  const base = nome.replace(/\.(vcf|gz|zip)$/gi, '')

  if (formato === 'csv' || formato === 'tsv') {
    const texto = formato === 'csv' ? paraCSV(variantes) : paraTSV(variantes)
    baixar(new Blob([texto], { type: MIME[formato] }), `${base}-genvar.${formato}`)
    return
  }

  if (formato === 'json') {
    baixar(new Blob([paraJSON(dados)], { type: MIME.json }), `${base}-genvar.json`)
    return
  }

  if (formato === 'vcf') {
    const texto = paraVCF({
      variantes, meta: dados.meta, nome, sha256: dados.sha256,
      versaoClinvar: dados.versaoClinvar, painel,
    })
    baixar(new Blob([texto], { type: MIME.vcf }), `${base}-genvar.vcf`)
    return
  }

  const abas = [
    { nome: 'Variantes', linhas: [CABECALHO, ...linhasTabulares(variantes)] },
    {
      nome: 'Achados',
      linhas: [['classificacao', 'variantes'], ...(resumoCli
        ? ORDEM_GRAVIDADE.filter((s) => resumoCli.porSig[s]).map((s) => [ROTULO[s], resumoCli.porSig[s]])
        : [])],
    },
    { nome: 'Qualidade', linhas: qualidade(metricas) },
    { nome: 'Metodologia', linhas: metodologia(dados, variantes) },
  ]
  const pops = populacoes(variantes)
  if (pops.length > 1) abas.splice(2, 0, { nome: 'Populacoes', linhas: pops })

  baixar(await paraXLSX(abas), `${base}-genvar.xlsx`)
}
