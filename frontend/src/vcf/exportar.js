// Saídas tabulares do relatório: TSV, JSON e XLSX.
//
// XLSX sem biblioteca de planilha. Um .xlsx é um zip de XML, e o JSZip já é
// dependência daqui (é ele que abre o .zip de entrada); SheetJS custaria ~400 KB
// de bundle para escrever quatro tabelas planas. O que segue é o mínimo do
// SpreadsheetML que o Excel, o LibreOffice e o Google Sheets abrem.

import { ROTULO, CONSEQUENCIA, ESTRELAS } from './clinvar'

const COLUNAS = [
  ['cromossomo', (v) => v.chrom],
  ['posicao', (v) => v.pos],
  ['ref', (v) => v.ref],
  ['alt', (v) => v.alt],
  ['tipo', (v) => v.tipo],
  ['rsid', (v) => v.rsid || ''],
  ['gene', (v) => v.gene || v.clinvar?.gene || ''],
  ['genotipo', (v) => v.gt || ''],
  ['zigosidade', (v) => v.zigosidade || ''],
  ['qualidade_phred', (v) => (v.qual != null ? v.qual : '')],
  ['profundidade', (v) => (v.dp != null ? v.dp : '')],
  ['qualidade_genotipo', (v) => (v.gq != null ? v.gq : '')],
  ['filtro', (v) => v.filtro],
  ['clinvar_classificacao', (v) => (v.clinvar ? ROTULO[v.clinvar.sig] : '')],
  ['clinvar_estrelas', (v) => (v.clinvar ? v.clinvar.estrelas : '')],
  ['clinvar_revisao', (v) => (v.clinvar ? ESTRELAS[v.clinvar.estrelas] : '')],
  ['clinvar_condicao', (v) => v.clinvar?.condicao || ''],
  ['consequencia', (v) => (v.clinvar?.consequencia ? CONSEQUENCIA[v.clinvar.consequencia] || '' : '')],
  ['frequencia_populacional', (v) => (v.clinvar?.af != null ? v.clinvar.af : '')],
  ['casado_por', (v) => v.clinvarVia || ''],
  ['alelo_divergente', (v) => (v.aleloDivergente ? `${v.aleloDivergente.ref}>${v.aleloDivergente.alt}` : '')],
]

export const CABECALHO = COLUNAS.map(([c]) => c)

export function linhasTabulares(variantes) {
  return variantes.map((v) => COLUNAS.map(([, f]) => f(v)))
}

// Campo com tabulação ou quebra de linha destruiria o arquivo; o TSV não tem
// convenção de escape, então o caractere é trocado por espaço, uma vez, aqui.
const limpo = (x) => String(x ?? '').replace(/[\t\r\n]+/g, ' ')

export function paraTSV(variantes) {
  const linhas = [CABECALHO.join('\t')]
  for (const l of linhasTabulares(variantes)) linhas.push(l.map(limpo).join('\t'))
  return linhas.join('\n') + '\n'
}

export function paraJSON({ nome, meta, metricas, variantes, resumoCli, genesMapeados }) {
  return JSON.stringify({
    gerador: 'GenVar',
    aviso: 'Uso em pesquisa e ensino. Não é laudo diagnóstico.',
    arquivo: {
      nome,
      build: meta.build,
      buildDeduzido: !!meta.buildDeduzido,
      chamador: meta.chamador,
      amostras: meta.amostras,
    },
    genesMapeados,
    metricas: {
      total: metricas.total,
      passaramNoFiltro: metricas.passa,
      titv: metricas.titv,
      fracaoNoDbsnp: metricas.fracaoConhecida,
      tipos: metricas.tipos,
      zigosidade: metricas.zigosidade,
    },
    achados: resumoCli
      ? Object.entries(resumoCli.porSig).map(([sig, n]) => ({ classificacao: ROTULO[sig], n: Number(n) }))
      : [],
    variantes: variantes.map((v) => Object.fromEntries(COLUNAS.map(([c, f]) => [c, f(v)]))),
  }, null, 1)
}

// --- XLSX -------------------------------------------------------------------

// O XML 1.0 não admite caractere de controle fora de tab, LF e CR. Um byte
// desses num campo faz o Excel recusar a planilha inteira sem dizer por quê, e
// campo de VCF vem de arquivo de terceiro: o filtro é obrigatório, não zelo.
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(CONTROLE, '')

function coluna(n) {
  let s = ''
  let k = n + 1
  while (k > 0) {
    const r = (k - 1) % 26
    s = String.fromCharCode(65 + r) + s
    k = Math.floor((k - 1) / 26)
  }
  return s
}

function folha(linhas) {
  const corpo = linhas.map((linha, i) => {
    const celulas = linha.map((valor, j) => {
      const ref = `${coluna(j)}${i + 1}`
      if (typeof valor === 'number' && Number.isFinite(valor)) {
        return `<c r="${ref}"><v>${valor}</v></c>`
      }
      const t = esc(valor)
      if (t === '') return ''
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`
    }).join('')
    return `<row r="${i + 1}">${celulas}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${corpo}</sheetData></worksheet>`
}

export async function paraXLSX(abas) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const nomes = abas.map((a) => a.nome)

  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + nomes.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `</Types>`)

  zip.file('_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`)

  zip.file('xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
    + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
    + nomes.map((n, i) => `<sheet name="${esc(n).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + `</sheets></workbook>`)

  zip.file('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + nomes.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `</Relationships>`)

  abas.forEach((a, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, folha(a.linhas)))

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function baixar(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
