// Leitor de VCF, inteiro no navegador. O arquivo NUNCA sai da máquina: um VCF
// é dado genético de pessoa identificável, e processar localmente é o que
// dispensa base legal, retenção e aviso de incidente. As APIs só recebem
// coordenada e rsID, que não identificam ninguém.
//
// Especificação: VCFv4.x (https://samtools.github.io/hts-specs/VCFv4.3.pdf).
// Colunas fixas: CHROM POS ID REF ALT QUAL FILTER INFO [FORMAT amostra...]

export const COLUNAS_FIXAS = ['CHROM', 'POS', 'ID', 'REF', 'ALT', 'QUAL', 'FILTER', 'INFO']

// Purinas e pirimidinas: a razão transição/transversão é o controle de
// qualidade mais barato de um VCF. Exoma humano fica perto de 3,0 e genoma
// perto de 2,0; muito abaixo disso indica ruído de chamada.
const PURINA = new Set(['A', 'G'])
const PIRIMIDINA = new Set(['C', 'T'])

export function tipoDaVariante(ref, alt) {
  if (ref.length === 1 && alt.length === 1) return 'SNV'
  if (ref.length === alt.length) return 'MNV'
  if (alt.startsWith('<') || alt.includes('[') || alt.includes(']')) return 'estrutural'
  return alt.length > ref.length ? 'inserção' : 'deleção'
}

export function ehTransicao(ref, alt) {
  if (ref.length !== 1 || alt.length !== 1) return null
  return (PURINA.has(ref) && PURINA.has(alt)) || (PIRIMIDINA.has(ref) && PIRIMIDINA.has(alt))
}

// GT vem como 0/1, 1|1, ./. e variações. O separador diz se a fase é conhecida.
export function zigosidade(gt) {
  if (!gt || gt === '.' || gt === './.' || gt === '.|.') return 'ausente'
  const alelos = gt.split(/[/|]/)
  if (alelos.some((a) => a === '.')) return 'parcial'
  const unicos = new Set(alelos)
  if (unicos.size === 1) return alelos[0] === '0' ? 'homozigoto ref' : 'homozigoto alt'
  return 'heterozigoto'
}

function parseInfo(campo) {
  const out = {}
  if (!campo || campo === '.') return out
  for (const par of campo.split(';')) {
    const i = par.indexOf('=')
    if (i === -1) out[par] = true
    else out[par.slice(0, i)] = par.slice(i + 1)
  }
  return out
}

// Cabeçalho: metadados que dizem de onde o arquivo veio. É o que permite ao
// relatório afirmar o build de referência em vez de supor, e supor errado
// desloca toda coordenada em milhões de bases.
function parseCabecalho(linhas) {
  const meta = { contigs: [], filtros: [], amostras: [], infoDefs: {}, formatDefs: {} }
  for (const l of linhas) {
    if (l.startsWith('##reference=')) meta.referencia = l.slice(12).trim()
    else if (l.startsWith('##fileformat=')) meta.fileformat = l.slice(13).trim()
    else if (l.startsWith('##source=')) meta.chamador = l.slice(9).trim()
    else if (l.startsWith('##fileDate=')) meta.data = l.slice(11).trim()
    else if (l.startsWith('##contig=')) {
      const id = /ID=([^,>]+)/.exec(l)?.[1]
      const len = /length=(\d+)/.exec(l)?.[1]
      const assembly = /assembly=([^,>]+)/.exec(l)?.[1]
      if (id) meta.contigs.push({ id, length: len ? +len : null, assembly })
    } else if (l.startsWith('##FILTER=')) {
      const id = /ID=([^,>]+)/.exec(l)?.[1]
      const desc = /Description="([^"]*)"/.exec(l)?.[1]
      if (id) meta.filtros.push({ id, desc })
    } else if (l.startsWith('##INFO=')) {
      const id = /ID=([^,>]+)/.exec(l)?.[1]
      const desc = /Description="([^"]*)"/.exec(l)?.[1]
      if (id) meta.infoDefs[id] = desc || ''
    } else if (l.startsWith('##FORMAT=')) {
      const id = /ID=([^,>]+)/.exec(l)?.[1]
      const desc = /Description="([^"]*)"/.exec(l)?.[1]
      if (id) meta.formatDefs[id] = desc || ''
    } else if (l.startsWith('#CHROM')) {
      const cols = l.slice(1).split('\t')
      meta.amostras = cols.slice(9)
      meta.colunas = cols
    }
  }
  // O build decide se as coordenadas podem ser cruzadas com qualquer outra
  // coisa. Entre GRCh37 e GRCh38 o deslocamento chega a milhões de bases (só
  // no BRCA1 são 1.847.983), então errar o build não desloca um pouco: troca o
  // gene inteiro. Três fontes, da mais confiável para a menos.
  const ref = (meta.referencia || '') + ' ' + (meta.contigs[0]?.assembly || '')
  if (/GRCh38|hg38/i.test(ref)) meta.build = 'GRCh38'
  else if (/GRCh37|hg19|b37/i.test(ref)) meta.build = 'GRCh37'
  else {
    // Sem declaração textual, o comprimento do cromossomo 1 identifica o build:
    // são valores fixos e diferentes em cada um. É dedução, e o relatório diz
    // que foi deduzida.
    const chr1 = meta.contigs.find((c) => c.id === '1' || c.id === 'chr1')
    if (chr1?.length === 248956422) { meta.build = 'GRCh38'; meta.buildDeduzido = true }
    else if (chr1?.length === 249250621) { meta.build = 'GRCh37'; meta.buildDeduzido = true }
    else {
      // Sem declaração e sem contig que sirva: assume GRCh38, que é o que a
      // indústria usa desde 2017 e o build de toda base pública corrente
      // (ClinVar, gnomAD v4, Ensembl). Assumir é diferente de saber, então a
      // presunção sai marcada e o relatório a repete na tela: um GRCh37 mudo
      // cai aqui e sairia com gene trocado sem ninguém perceber.
      meta.build = 'GRCh38'
      meta.buildPresumido = true
    }
  }
  return meta
}

// Uma linha de VCF pode carregar vários ALT separados por vírgula. Cada um é
// uma variante distinta, e contá-los como uma só subestima o total.
function expandirAlts(campos, meta) {
  const [chrom, pos, id, ref, altBruto, qual, filtro, info, formato, ...amostras] = campos
  const infoObj = parseInfo(info)
  const chaves = formato ? formato.split(':') : []
  const porAmostra = amostras.map((a, i) => {
    const vals = a.split(':')
    const o = {}
    chaves.forEach((k, j) => { o[k] = vals[j] })
    return { nome: meta.amostras[i] || `amostra${i + 1}`, ...o }
  })
  return altBruto.split(',').map((alt) => ({
    chrom: chrom.replace(/^chr/i, ''),
    pos: +pos,
    id: id && id !== '.' ? id : null,
    rsid: (id || '').split(';').find((x) => /^rs\d+$/i.test(x)) || null,
    ref,
    alt,
    qual: qual === '.' ? null : parseFloat(qual),
    filtro: filtro || '.',
    passa: filtro === 'PASS' || filtro === '.',
    tipo: tipoDaVariante(ref, alt),
    transicao: ehTransicao(ref, alt),
    info: infoObj,
    amostras: porAmostra,
    gt: porAmostra[0]?.GT || null,
    zigosidade: zigosidade(porAmostra[0]?.GT),
    dp: porAmostra[0]?.DP ? +porAmostra[0].DP : (infoObj.DP ? +infoObj.DP : null),
    gq: porAmostra[0]?.GQ ? parseFloat(porAmostra[0].GQ) : null,
  }))
}

// Um .zip é um contêiner, não um fluxo comprimido: DecompressionStream lê
// gzip e deflate crus, e não o índice de entradas do ZIP. A biblioteca entra
// por import dinâmico, e só quando o arquivo é mesmo um zip.
export async function extrairDoZip(arquivo) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(arquivo)
  const entradas = Object.values(zip.files).filter((f) => !f.dir)
  const vcfs = entradas.filter((f) => /\.vcf(\.gz)?$/i.test(f.name) && !/^__MACOSX\//.test(f.name))
  if (!vcfs.length) {
    const nomes = entradas.map((f) => f.name).slice(0, 4).join(', ')
    throw new Error(
      entradas.length
        ? `O zip não tem nenhum .vcf dentro. Encontrei: ${nomes}${entradas.length > 4 ? '...' : ''}.`
        : 'O zip está vazio.',
    )
  }
  // mais de um VCF: fica com o maior, que é o conjunto completo em quase todo
  // pacote de laboratório, e o relatório diz qual foi escolhido
  vcfs.sort((a, b) => (b._data?.uncompressedSize || 0) - (a._data?.uncompressedSize || 0))
  const escolhido = vcfs[0]
  const conteudo = await escolhido.async('blob')
  const nome = escolhido.name.split('/').pop()
  return { arquivo: new File([conteudo], nome, { type: 'text/plain' }), outros: vcfs.length - 1 }
}

// Lê o arquivo em fluxo, linha a linha. Um genoma passa de 4 milhões de
// variantes e o texto inteiro não cabe confortavelmente em memória; o fluxo
// mantém o pico baixo e permite relatar progresso.
export async function lerVCF(arquivo, { onProgresso, limite = 0 } = {}) {
  // O nome não decide: quem decide são os dois primeiros bytes. Um .vcf.gz
  // servido com Content-Encoding: gzip chega aqui já descompactado, e um VCF
  // renomeado para .gz nunca foi comprimido; nos dois casos gunzipar devolve
  // "incorrect header check" em cima de um arquivo perfeitamente legível.
  const assinatura = new Uint8Array(await arquivo.slice(0, 2).arrayBuffer())
  const gz = assinatura[0] === 0x1f && assinatura[1] === 0x8b
  let stream = arquivo.stream()
  if (gz) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador não descompacta .gz. Envie o VCF descompactado.')
    }
    stream = stream.pipeThrough(new DecompressionStream('gzip'))
  }
  const leitor = stream.pipeThrough(new TextDecoderStream()).getReader()

  const cabecalho = []
  const variantes = []
  let meta = null
  let resto = ''
  let lidos = 0
  let bytes = 0

  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    bytes += value.length
    const linhas = (resto + value).split('\n')
    resto = linhas.pop()
    for (const linha of linhas) {
      if (!linha) continue
      if (linha.startsWith('#')) { cabecalho.push(linha); continue }
      if (!meta) meta = parseCabecalho(cabecalho)
      const campos = linha.split('\t')
      if (campos.length < 8) continue
      lidos += 1
      if (!limite || variantes.length < limite) variantes.push(...expandirAlts(campos, meta))
    }
    if (onProgresso) onProgresso({ lidos, bytes, variantes: variantes.length })
  }
  if (resto && !resto.startsWith('#')) {
    if (!meta) meta = parseCabecalho(cabecalho)
    const campos = resto.split('\t')
    if (campos.length >= 8) { lidos += 1; variantes.push(...expandirAlts(campos, meta)) }
  }
  if (!meta) meta = parseCabecalho(cabecalho)
  return { meta, variantes, lidos, truncado: !!limite && lidos > limite }
}
