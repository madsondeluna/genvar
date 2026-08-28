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

// CSV separado por PONTO E VIRGULA. O Excel em configuracao brasileira usa a
// virgula como separador decimal, entao um CSV com virgula abre com tudo numa
// coluna so. O ponto e virgula e o que o Excel pt-BR espera, e o LibreOffice e o
// Sheets detectam sozinhos.
//
// O BOM no inicio nao e enfeite: sem ele o Excel le UTF-8 como Latin-1 e
// "patogênica" vira "patogÃªnica" em toda linha.
export function paraCSV(variantes) {
  const escapa = (x) => {
    const t = String(x ?? '')
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const linhas = [CABECALHO.map(escapa).join(';')]
  for (const l of linhasTabulares(variantes)) {
    // Decimal com virgula, para o Excel pt-BR ler numero como numero.
    linhas.push(l.map((v) => escapa(typeof v === 'number' ? String(v).replace('.', ',') : v)).join(';'))
  }
  return '\uFEFF' + linhas.join('\r\n') + '\r\n'
}

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

// --- VCF anotado --------------------------------------------------------------
//
// O filtrado saía em tabela e morria ali. Saindo em VCF, ele volta para o
// pipeline de quem enviou.
//
// A anotação entra em campos INFO com prefixo próprio (GENVAR_), e não
// sobrescrevendo campos existentes: um VCF que altera INFO alheio quebra o passo
// seguinte de quem o consome. Todo campo novo é declarado no cabeçalho, porque
// INFO sem ##INFO correspondente é VCF inválido, e a maioria dos validadores
// reclama disso antes de qualquer outra coisa.
import { ROTULO as SIG_ROTULO, CONSEQUENCIA as CONSEQ_ROTULO } from './clinvar'

// Ponto e vírgula, espaço, igual e vírgula são separadores dentro de INFO. O
// padrão manda percent-encode; sem isso uma condição como "Lynch syndrome,
// type 1" divide o campo em dois.
const infoSeguro = (s) => String(s ?? '')
  .replace(/%/g, '%25').replace(/;/g, '%3B').replace(/=/g, '%3D')
  .replace(/,/g, '%2C').replace(/ /g, '_').replace(/[\t\r\n]/g, '_')

const CAMPOS_INFO = [
  ['GENVAR_GENE', '1', 'String', 'Gene que contém a posição, por coordenada ou pelo ClinVar',
    (v) => v.gene || v.clinvar?.gene || null],
  ['GENVAR_CLNSIG', '1', 'String', 'Classificação clínica do ClinVar',
    (v) => (v.clinvar ? SIG_ROTULO[v.clinvar.sig] : null)],
  ['GENVAR_CLNREV', '1', 'Integer', 'Nível de revisão do ClinVar, de 0 a 4 estrelas',
    (v) => (v.clinvar ? v.clinvar.estrelas : null)],
  ['GENVAR_CLNDN', '1', 'String', 'Condição associada no ClinVar',
    (v) => v.clinvar?.condicao || null],
  ['GENVAR_CSQ', '1', 'String', 'Consequência molecular',
    (v) => (v.clinvar?.consequencia ? CONSEQ_ROTULO[v.clinvar.consequencia] : null)],
  ['GENVAR_AF', '1', 'Float', 'Frequência populacional publicada pelo ClinVar (ExAC, 1000 Genomes ou ESP)',
    (v) => (v.clinvar?.af != null ? v.clinvar.af : null)],
  ['GENVAR_GNOMAD_AF', '1', 'Float', 'Frequência global no gnomAD, quando consultado',
    (v) => (v.gnomad?.af != null ? v.gnomad.af : null)],
  ['GENVAR_AB', '1', 'Float', 'Balanço alélico da amostra em foco',
    (v) => (v.ab != null ? +v.ab.toFixed(4) : null)],
  ['GENVAR_ACMG', '.', 'String', 'Critérios ACMG avaliáveis por este módulo',
    (v) => (v.acmg?.length ? v.acmg.map((c) => c.id).join('|') : null)],
  ['GENVAR_CLINGEN', '1', 'String', 'Validade gene-doença curada pelo ClinGen',
    (v) => (v.clingen ? `${v.clingen.classificacao}|${v.clingen.heranca_sigla}` : null)],
  ['GENVAR_CPIC', '1', 'String', 'Gene com diretriz farmacogenética do CPIC',
    (v) => (v.cpic ? v.cpic.gene : null)],
  ['GENVAR_MATCH', '1', 'String', 'Como a variante casou com o ClinVar: rsid ou coordenada',
    (v) => v.clinvarVia || null],
]

export function paraVCF({ variantes, meta, nome, sha256, versaoClinvar, painel }) {
  const agora = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const cab = [
    '##fileformat=VCFv4.3',
    `##fileDate=${agora}`,
    '##source=GenVar',
    '##genvar_uso=Pesquisa_e_ensino._Nao_e_laudo_diagnostico.',
  ]
  if (meta.referencia) cab.push(`##reference=${meta.referencia}`)
  cab.push(`##genvar_build=${meta.build}${meta.buildPresumido ? '_presumido' : meta.buildDeduzido ? '_deduzido' : '_declarado'}`)
  if (sha256) cab.push(`##genvar_sha256_entrada=${sha256}`)
  if (versaoClinvar) cab.push(`##genvar_clinvar=${infoSeguro(versaoClinvar)}`)
  if (nome) cab.push(`##genvar_arquivo_origem=${infoSeguro(nome)}`)
  if (painel) cab.push(`##genvar_painel=${infoSeguro(painel.nome)}`)

  for (const c of meta.contigs || []) {
    if (c.id && c.length) cab.push(`##contig=<ID=${c.id},length=${c.length}>`)
  }
  for (const f of meta.filtros || []) {
    cab.push(`##FILTER=<ID=${f.id},Description="${(f.desc || f.id).replace(/"/g, "'")}">`)
  }
  for (const [id, num, tipo, desc] of CAMPOS_INFO) {
    cab.push(`##INFO=<ID=${id},Number=${num},Type=${tipo},Description="${desc}">`)
  }
  cab.push('##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotipo">')
  cab.push('##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Leituras por alelo">')
  cab.push('##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Profundidade da amostra">')
  cab.push('##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Qualidade do genotipo">')

  const amostras = meta.amostras || []
  cab.push(['#CHROM', 'POS', 'ID', 'REF', 'ALT', 'QUAL', 'FILTER', 'INFO',
    ...(amostras.length ? ['FORMAT', ...amostras] : [])].join('\t'))

  const linhas = variantes.map((v) => {
    const info = []
    for (const [id, , tipo, , get] of CAMPOS_INFO) {
      const val = get(v)
      if (val == null || val === '') continue
      info.push(`${id}=${tipo === 'String' ? infoSeguro(val) : val}`)
    }
    const campos = [
      v.chrom, v.pos, v.rsid || v.id || '.', v.ref, v.alt,
      v.qual != null ? v.qual : '.', v.filtro || '.',
      info.length ? info.join(';') : '.',
    ]
    if (amostras.length) {
      campos.push('GT:AD:DP:GQ')
      for (const a of v.amostras) {
        const ad = a.ad ? `${a.ad.ref},${a.ad.alt}` : '.'
        campos.push(`${a.gt || './.'}:${ad}:${a.dp ?? '.'}:${a.gq ?? '.'}`)
      }
    }
    return campos.join('\t')
  })

  return [...cab, ...linhas].join('\n') + '\n'
}

// SHA-256 do arquivo de entrada. Sem ele dois laudos do mesmo paciente em meses
// diferentes não são comparáveis e ninguém prova de qual arquivo cada um saiu.
// Roda em blocos porque um genoma passa de centenas de MB e o navegador não
// precisa segurar tudo de uma vez.
export async function sha256(arquivo) {
  if (!globalThis.crypto?.subtle) return null
  const buf = await arquivo.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
