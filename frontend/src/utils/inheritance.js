// Rotulos e identidade visual dos padroes de heranca do catalogo de doencas.
// A cor vem dos slots categoricos do Pure, atribuidos em sequencia na ordem
// canonica e sem ciclar. Antes vinha de --status-*: AD era tint-warning e AR
// era tint-good, ou seja, a interface afirmava que dominante e alerta e que
// recessiva e boa. Heranca e categoria, nao estado, e cor de status nunca
// carrega identidade de serie.
export const INHERITANCE = {
  AD:  { label: 'Autossômica dominante',  short: 'AD',  slot: 1 },
  AR:  { label: 'Autossômica recessiva',  short: 'AR',  slot: 2 },
  XLR: { label: 'Ligada ao X recessiva',  short: 'XLR', slot: 3 },
  XLD: { label: 'Ligada ao X dominante',  short: 'XLD', slot: 4 },
  XL:  { label: 'Ligada ao X',            short: 'XL',  slot: 5 },
  // Entraram com o catalogo do Orphanet. Os tres primeiros tem slot; os dois
  // ultimos ficam sem, porque a paleta tem oito e NAO cicla: repetir uma cor
  // faria dois padroes distintos lerem como o mesmo.
  MF:  { label: 'Multifatorial',          short: 'MF',  slot: 6 },
  MT:  { label: 'Mitocondrial',           short: 'MT',  slot: 7 },
  SD:  { label: 'Semidominante',          short: 'SD',  slot: 8 },
  OL:  { label: 'Oligogênica',            short: 'OL',  slot: null },
  YL:  { label: 'Ligada ao Y',            short: 'YL',  slot: null },
}

export function inheritanceMeta(code) {
  return INHERITANCE[code] || { label: code, short: code, slot: null }
}

// Ordem estavel das facetas no hub e da legenda.
export const INHERITANCE_ORDER = ['AD', 'AR', 'XLR', 'XLD', 'XL', 'MF', 'MT', 'SD', 'OL', 'YL']
