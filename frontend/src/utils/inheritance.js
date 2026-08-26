// Rótulos e tom de status para os padrões de herança do catálogo de doenças raras.
// Usado no hub (facetas/chips) e na página de detalhe.
export const INHERITANCE = {
  AD: { label: 'Autossômica dominante', short: 'AD', tint: 'tint-warning' },
  AR: { label: 'Autossômica recessiva', short: 'AR', tint: 'tint-good' },
  XLR: { label: 'Ligada ao X recessiva', short: 'XLR', tint: 'tint-neutral' },
  XLD: { label: 'Ligada ao X dominante', short: 'XLD', tint: 'tint-neutral' },
  XL: { label: 'Ligada ao X', short: 'XL', tint: 'tint-neutral' },
}

export function inheritanceMeta(code) {
  return INHERITANCE[code] || { label: code, short: code, tint: 'tint-neutral' }
}

// Ordem estável das facetas no hub.
export const INHERITANCE_ORDER = ['AD', 'AR', 'XLR', 'XLD', 'XL']
