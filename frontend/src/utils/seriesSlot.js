// Mapeia uma chave categorica para um slot da paleta de series do Pure.
// A ordem e a da lista canonica recebida, entao o mesmo valor recebe sempre o
// mesmo slot enquanto a lista nao mudar. A paleta tem oito slots e NAO cicla:
// a nona categoria em diante fica sem tinta, em superficie neutra, porque
// repetir cor faria duas categorias diferentes lerem como a mesma.
export const SERIES_SLOTS = 8

export function seriesSlot(key, orderedKeys) {
  const i = orderedKeys.indexOf(key)
  if (i < 0 || i >= SERIES_SLOTS) return null
  return i + 1
}

// Estilo pronto para o elemento: define a propriedade local que .tint-series e
// .series-mark leem. Sem slot, devolve undefined e o bloco fica neutro.
export function seriesStyle(slot) {
  return slot ? { '--series': `var(--chart-${slot})` } : undefined
}
