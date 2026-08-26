// Resolve uma consulta livre para a rota certa: variante (rsID), doença (catálogo)
// ou gene (símbolo HGNC). Função pura, para ser testável e reusada pela busca
// unificada em qualquer barra.
const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function resolveSearch(raw, diseases = []) {
  const q = (raw || '').trim()
  if (!q) return null

  // 1. rsID do dbSNP -> variante
  if (/^rs\d+$/i.test(q)) return `/variant/${q.toLowerCase()}`

  const nq = norm(q)

  // 2. id exato do catálogo (slug)
  const slug = nq.replace(/\s+/g, '-')
  const byId = diseases.find((d) => d.id === slug)
  if (byId) return `/doenca/${byId.id}`

  // 3. nome de doença: match único e razoável leva ao detalhe; vários vão ao hub
  const nameMatches = diseases.filter((d) => norm(d.name).includes(nq))
  if (nq.length >= 3 && nameMatches.length === 1) return `/doenca/${nameMatches[0].id}`
  if (nameMatches.length > 1) return `/doencas?q=${encodeURIComponent(q)}`

  // 4. símbolo de gene (padrão HGNC) -> página de gene
  if (/^[A-Za-z][A-Za-z0-9.\-]{0,49}$/.test(q)) return `/gene/${q.toUpperCase()}`

  // 5. fallback: busca no hub de doenças
  return `/doencas?q=${encodeURIComponent(q)}`
}
