import { pureToken, resolveColor } from './pureTokens'

// As cores são resolvidas na hora da chamada: a lib do ideograma
// pinta atributos SVG e não entende var(--token).
// O cromossomo e desenhado em niveis de tinta (as bandas G sao intensidade de
// coloracao, dado ordinal). A marca do gene precisa se separar disso, entao ela
// vem de um SLOT DE SERIE e nao da tinta: em --chart-ink ela desaparecia contra
// a banda mais corada, e o halo usava --state-warning, cor de estado para uma
// marca que nao e estado nenhum.
function categoryColors() {
  return {
    gene: pureToken('--chart-1'),
    halo: resolveColor('color-mix(in srgb, var(--chart-1) 40%, var(--surface))'),
  }
}

// Variant marks are sub-pixel at whole-chromosome scale (a 260kb gene is <1px on a 242Mb
// chromosome), so the ideogram only conveys where the gene sits. Legend reflects that.
export function geneLegend() {
  const c = categoryColors()
  return [
    { label: 'Região do gene', color: c.halo },
    { label: 'Locus do gene', color: c.gene },
  ]
}

function sanitizeChr(chromosome) {
  if (chromosome == null) return null
  return String(chromosome).replace(/^chr/i, '').toUpperCase()
}

export function buildGeneAnnotation(gene) {
  const chr = sanitizeChr(gene.chromosome)
  if (!chr || !gene.start || !gene.end) return null
  return {
    name: gene.gene_symbol,
    chr,
    start: gene.start,
    stop: gene.end,
    color: categoryColors().gene,
  }
}

export function buildGeneAnnotations(gene, { haloPaddingBp = 800_000 } = {}) {
  const chr = sanitizeChr(gene.chromosome)
  if (!chr) return []

  const out = []

  if (gene.start && gene.end) {
    out.push({
      name: `${gene.gene_symbol} region`,
      chr,
      start: Math.max(1, gene.start - haloPaddingBp),
      stop: gene.end + haloPaddingBp,
      color: categoryColors().halo,
    })
  }

  const geneAnn = buildGeneAnnotation(gene)
  if (geneAnn) out.push(geneAnn)

  return out
}
