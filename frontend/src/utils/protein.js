// Amino acids: 1-letter -> [3-letter, PT-BR name]. '*'/Ter = stop codon.
const AA = {
  A: ['Ala', 'Alanina'],
  R: ['Arg', 'Arginina'],
  N: ['Asn', 'Asparagina'],
  D: ['Asp', 'Aspartato'],
  C: ['Cys', 'Cisteína'],
  E: ['Glu', 'Glutamato'],
  Q: ['Gln', 'Glutamina'],
  G: ['Gly', 'Glicina'],
  H: ['His', 'Histidina'],
  I: ['Ile', 'Isoleucina'],
  L: ['Leu', 'Leucina'],
  K: ['Lys', 'Lisina'],
  M: ['Met', 'Metionina'],
  F: ['Phe', 'Fenilalanina'],
  P: ['Pro', 'Prolina'],
  S: ['Ser', 'Serina'],
  T: ['Thr', 'Treonina'],
  W: ['Trp', 'Triptofano'],
  Y: ['Tyr', 'Tirosina'],
  V: ['Val', 'Valina'],
  '*': ['Ter', 'parada (stop)'],
}

const THREE_TO_ONE = Object.fromEntries(
  Object.entries(AA).map(([one, [three]]) => [three.toLowerCase(), one]),
)
THREE_TO_ONE['ter'] = '*'

function residue(token) {
  if (!token) return null
  let one = token
  if (token.length === 3) one = THREE_TO_ONE[token.toLowerCase()] || token
  if (token.toLowerCase() === 'ter' || token === '*') one = '*'
  const entry = AA[one]
  if (!entry) return null
  return { code: one, three: entry[0], name: entry[1] }
}

// Parse an HGVS protein change ("p.C282Y", "p.Cys282Tyr", "p.Arg408Ter", "p.Gly12=") into a
// structured form. Returns null when it is not a residue-level change we can render.
export function parseProteinChange(hgvs) {
  if (!hgvs) return null
  const s = hgvs.replace(/^p\.?/i, '').replace(/[()]/g, '').trim()

  if (/fs/i.test(s)) {
    const m = s.match(/^([A-Z][a-z]{2}|[A-Z])(\d+)/)
    return m ? { kind: 'frameshift', wt: residue(m[1]), pos: Number(m[2]) } : { kind: 'frameshift' }
  }

  const m = s.match(/^([A-Z][a-z]{2}|[A-Z])(\d+)([A-Z][a-z]{2}|[A-Z*=]|Ter)$/)
  if (!m) return null
  const wt = residue(m[1])
  const pos = Number(m[2])
  const mutTok = m[3]
  if (mutTok === '=' || (wt && mutTok === wt.code)) {
    return { kind: 'synonymous', wt, pos }
  }
  const mut = residue(mutTok)
  if (!wt || !mut) return null
  return { kind: mut.code === '*' ? 'nonsense' : 'missense', wt, pos, mut }
}
