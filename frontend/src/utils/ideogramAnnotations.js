const CATEGORY_COLOR = {
  gene: '#171717',
  variant: '#2563EB',
  pathogenic: '#DC2626',
  vus: '#D97706',
  benign: '#16A34A',
  halo: '#FDE68A',
}

export const GENE_LEGEND = [
  { label: 'Região do gene', color: CATEGORY_COLOR.halo },
  { label: 'Locus do gene', color: CATEGORY_COLOR.gene },
  { label: 'Patogênica', color: CATEGORY_COLOR.pathogenic },
  { label: 'VUS / Conflitante', color: CATEGORY_COLOR.vus },
  { label: 'Benigna', color: CATEGORY_COLOR.benign },
]

export const VARIANT_LEGEND = [
  { label: 'Região da variante', color: CATEGORY_COLOR.halo },
  { label: 'Patogênica', color: CATEGORY_COLOR.pathogenic },
  { label: 'Benigna', color: CATEGORY_COLOR.benign },
  { label: 'Outra', color: CATEGORY_COLOR.variant },
]

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
    color: CATEGORY_COLOR.gene,
  }
}

function variantToAnnotation(variant, chr, category) {
  const position = variant.position
  if (!position) return null
  return {
    name: variant.variant_id || `${chr}:${position}`,
    chr,
    start: position,
    stop: position + 1,
    color: CATEGORY_COLOR[category],
  }
}

export function buildGeneAnnotations(gene, { maxPerCategory = 60, haloPaddingBp = 800_000 } = {}) {
  const chr = sanitizeChr(gene.chromosome)
  if (!chr) return []

  const out = []

  if (gene.start && gene.end) {
    out.push({
      name: `${gene.gene_symbol} region`,
      chr,
      start: Math.max(1, gene.start - haloPaddingBp),
      stop: gene.end + haloPaddingBp,
      color: CATEGORY_COLOR.halo,
    })
  }

  const geneAnn = buildGeneAnnotation(gene)
  if (geneAnn) out.push(geneAnn)

  const push = (list, category) => {
    for (const v of (list || []).slice(0, maxPerCategory)) {
      const ann = variantToAnnotation(v, chr, category)
      if (ann) out.push(ann)
    }
  }

  push(gene.pathogenic_variants, 'pathogenic')
  push(gene.vus_variants, 'vus')
  push(gene.benign_variants, 'benign')

  return out
}

export function buildVariantAnnotation(variant, { haloPaddingBp = 1_500_000 } = {}) {
  const chr = sanitizeChr(variant.chromosome)
  if (!chr || !variant.position) return []

  const sig = (variant.clinvar_significance || '').toLowerCase()
  let category = 'variant'
  if (sig.includes('pathogenic')) category = 'pathogenic'
  else if (sig.includes('benign')) category = 'benign'

  return [
    {
      name: `${variant.variant_id} region`,
      chr,
      start: Math.max(1, variant.position - haloPaddingBp),
      stop: variant.position + haloPaddingBp,
      color: CATEGORY_COLOR.halo,
    },
    {
      name: variant.variant_id,
      chr,
      start: variant.position,
      stop: variant.position + 1,
      color: CATEGORY_COLOR[category],
    },
  ]
}
