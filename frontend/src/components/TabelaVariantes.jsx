import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { ROTULO, SLOT, ORDEM_GRAVIDADE, CONSEQUENCIA, IMPACTO, ORDEM_IMPACTO, SLOT_IMPACTO } from '../vcf/clinvar'
import { trocaTexto } from './AchadosClinicos'
import { seriesStyle } from '../utils/seriesSlot'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

// Faixas de frequência. Doença rara não anda com alelo comum, e é por isso que
// o corte de 1% é o filtro que mais reduz uma lista de candidatas.
const FAIXAS_AF = [
  ['Qualquer', () => true],
  ['Ausente das coortes', (af) => af === 0 || af == null],
  ['Abaixo de 0,1%', (af) => af != null && af < 0.001],
  ['Abaixo de 1%', (af) => af != null && af < 0.01],
  ['1% ou mais', (af) => af != null && af >= 0.01],
]

const COLUNAS = [
  { k: 'pos', r: 'Posição', ord: (v) => [v.chrom, v.pos] },
  { k: 'troca', r: 'Troca' },
  { k: 'tipo', r: 'Tipo', ord: (v) => v.tipo },
  { k: 'gene', r: 'Gene', ord: (v) => v.gene || v.clinvar?.gene || '' },
  { k: 'sig', r: 'ClinVar', ord: (v) => (v.clinvar ? ORDEM_GRAVIDADE.indexOf(v.clinvar.sig) : 99) },
  { k: 'estrelas', r: 'Revisão', ord: (v) => -(v.clinvar?.estrelas ?? -1), num: true },
  { k: 'conseq', r: 'Efeito na proteína', ord: (v) => (v.clinvar?.consequencia ? ORDEM_IMPACTO.indexOf(IMPACTO[v.clinvar.consequencia]) : 9), num: true },
  { k: 'condicao', r: 'Condição' },
  { k: 'af', r: 'Frequência na população', ord: (v) => (v.clinvar?.af ?? -1), num: true },
  { k: 'qual', r: 'Qual', ord: (v) => -(v.qual ?? -1), num: true },
  { k: 'dp', r: 'Prof', ord: (v) => -(v.dp ?? -1), num: true },
  { k: 'zig', r: 'Genótipo' },
  { k: 'rsid', r: 'rsID' },
]

const VAZIO = {
  busca: '', chrom: '', sigs: [], estrelas: 0, conseq: '', impacto: '', zig: '', af: 0,
  soPassa: false, soAnotadas: false, qualMin: '', dpMin: '',
}

export default function TabelaVariantes({ variantes, dados, resumoCli, temAnotacao, painel }) {
  const [f, setF] = useState(VAZIO)
  const [pagina, setPagina] = useState(0)
  const [ordem, setOrdem] = useState(null)
  const [saida, setSaida] = useState('parado')
  const porPagina = 25

  const set = (campo, valor) => { setF((x) => ({ ...x, [campo]: valor })); setPagina(0) }

  const opcoes = useMemo(() => {
    const chroms = [...new Set(variantes.map((v) => v.chrom))]
    const zigs = [...new Set(variantes.map((v) => v.zigosidade).filter(Boolean))]
    const conseqs = [...new Set(variantes.map((v) => v.clinvar?.consequencia).filter((c) => c > 0))]
    const sigs = ORDEM_GRAVIDADE.filter((s) => resumoCli?.porSig?.[s])
    return { chroms, zigs, conseqs, sigs }
  }, [variantes, resumoCli])

  const filtradas = useMemo(() => {
    const busca = f.busca.trim().toLowerCase()
    const passaAf = FAIXAS_AF[f.af][1]
    let out = variantes.filter((v) => {
      if (f.chrom && v.chrom !== f.chrom) return false
      if (f.soPassa && !v.passa) return false
      if (f.soAnotadas && !v.clinvar) return false
      if (f.sigs.length && !(v.clinvar && f.sigs.includes(v.clinvar.sig))) return false
      if (f.estrelas && !(v.clinvar && v.clinvar.estrelas >= f.estrelas)) return false
      if (f.conseq && v.clinvar?.consequencia !== +f.conseq) return false
      if (f.impacto && IMPACTO[v.clinvar?.consequencia] !== f.impacto) return false
      if (f.zig && v.zigosidade !== f.zig) return false
      if (f.af && !(v.clinvar && passaAf(v.clinvar.af))) return false
      if (f.qualMin !== '' && !(v.qual != null && v.qual >= +f.qualMin)) return false
      if (f.dpMin !== '' && !(v.dp != null && v.dp >= +f.dpMin)) return false
      if (busca) {
        const alvo = `${v.chrom}:${v.pos} ${v.rsid || ''} ${v.gene || ''} ${v.clinvar?.gene || ''} ${v.clinvar?.condicao || ''}`.toLowerCase()
        if (!alvo.includes(busca)) return false
      }
      return true
    })
    if (ordem) {
      const col = COLUNAS.find((c) => c.k === ordem.k)
      if (col?.ord) {
        const sinal = ordem.desc ? -1 : 1
        out = [...out].sort((a, b) => {
          const x = col.ord(a), y = col.ord(b)
          const cmp = Array.isArray(x)
            ? (String(x[0]).localeCompare(String(y[0]), undefined, { numeric: true }) || x[1] - y[1])
            : (typeof x === 'number' ? x - y : String(x).localeCompare(String(y)))
          return cmp * sinal
        })
      }
    }
    return out
  }, [variantes, f, ordem])

  const totalPag = Math.max(1, Math.ceil(filtradas.length / porPagina))
  const fatia = filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const ativos = JSON.stringify(f) !== JSON.stringify(VAZIO)
  const base = dados.nome.replace(/\.(vcf|gz|zip)$/gi, '')

  async function exportar(formato) {
    setSaida('gerando')
    try {
      const { exportarVariantes } = await import('../vcf/saidas')
      // Exporta o que está FILTRADO, não o arquivo inteiro: o botão fica embaixo
      // da tabela filtrada e exportar outra coisa seria mentir sobre o alvo.
      await exportarVariantes(formato, { ...dados, variantes: filtradas, resumoCli, painel })
      setSaida('parado')
    } catch (e) {
      setSaida('erro')
    }
  }

  function ordenar(k) {
    setOrdem((o) => (o?.k === k ? { k, desc: !o.desc } : { k, desc: false }))
    setPagina(0)
  }

  return (
    <article className="card flex flex-col gap-16">
      <span className="flex items-baseline justify-between gap-16 flex-wrap">
        <h3 className="text-16 font-medium text-text">Variantes anotadas</h3>
        <span className="label">
          {fmt(filtradas.length)} de {fmt(variantes.length)}
          {ativos ? ' após os filtros' : ' no arquivo'}
        </span>
      </span>

      <div className="filtros" role="group" aria-label="Filtros da tabela">
        <label className="filtro filtro-largo">
          <span className="label">Buscar</span>
          <input
            className="input"
            type="search"
            value={f.busca}
            placeholder="gene, rsID, condição ou 17:43044295"
            onChange={(e) => set('busca', e.target.value)}
          />
        </label>

        <label className="filtro">
          <span className="label">Cromossomo</span>
          <select className="select" value={f.chrom} onChange={(e) => set('chrom', e.target.value)}>
            <option value="">Todos</option>
            {opcoes.chroms.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="filtro">
          <span className="label">Genótipo</span>
          <select className="select" value={f.zig} onChange={(e) => set('zig', e.target.value)}>
            <option value="">Todos</option>
            {opcoes.zigs.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>

        <label className="filtro">
          <span className="label">Frequência</span>
          <select className="select" value={f.af} onChange={(e) => set('af', +e.target.value)}>
            {FAIXAS_AF.map(([r], i) => <option key={r} value={i}>{r}</option>)}
          </select>
        </label>

        <label className="filtro">
          <span className="label">Revisão mínima</span>
          <select className="select" value={f.estrelas} onChange={(e) => set('estrelas', +e.target.value)}>
            <option value={0}>Qualquer</option>
            <option value={1}>1 estrela ou mais</option>
            <option value={2}>2 estrelas ou mais</option>
            <option value={3}>Painel de especialistas</option>
            <option value={4}>Diretriz de prática</option>
          </select>
        </label>

        <label className="filtro">
          <span className="label">Impacto</span>
          <select className="select" value={f.impacto} onChange={(e) => set('impacto', e.target.value)}>
            <option value="">Qualquer</option>
            {ORDEM_IMPACTO.filter((i) => resumoCli?.porImpacto?.[i]).map((i) => (
              <option key={i} value={i}>{i} ({resumoCli.porImpacto[i]})</option>
            ))}
          </select>
        </label>

        <label className="filtro">
          <span className="label">Consequência</span>
          <select className="select" value={f.conseq} onChange={(e) => set('conseq', e.target.value)}>
            <option value="">Todas</option>
            {opcoes.conseqs.map((c) => <option key={c} value={c}>{CONSEQUENCIA[c]}</option>)}
          </select>
        </label>

        <label className="filtro">
          <span className="label">Qualidade mínima</span>
          <input className="input" type="number" min="0" value={f.qualMin}
                 onChange={(e) => set('qualMin', e.target.value)} placeholder="Phred" />
        </label>

        <label className="filtro">
          <span className="label">Profundidade mínima</span>
          <input className="input" type="number" min="0" value={f.dpMin}
                 onChange={(e) => set('dpMin', e.target.value)} placeholder="leituras" />
        </label>
      </div>

      {opcoes.sigs.length > 0 && (
        <div className="flex gap-8 flex-wrap items-center">
          <span className="label">Classificação</span>
          {opcoes.sigs.map((s) => {
            const on = f.sigs.includes(s)
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                className={`pill pill-sm ${on ? 'pill-solid' : ''}`}
                style={on ? undefined : seriesStyle(SLOT[s])}
                onClick={() => set('sigs', on ? f.sigs.filter((x) => x !== s) : [...f.sigs, s])}
              >
                {ROTULO[s]}
                <span className="mono num text-muted"> {fmt(resumoCli.porSig[s])}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-8 flex-wrap items-center">
        <label className="check">
          <input type="checkbox" checked={f.soPassa} onChange={(e) => set('soPassa', e.target.checked)} />
          <span className="text-12">só as que passaram no filtro do chamador</span>
        </label>
        {temAnotacao && (
          <label className="check">
            <input type="checkbox" checked={f.soAnotadas} onChange={(e) => set('soAnotadas', e.target.checked)} />
            <span className="text-12">só as que o ClinVar conhece</span>
          </label>
        )}
        {ativos && (
          <button type="button" className="pill pill-sm" onClick={() => { setF(VAZIO); setPagina(0) }}>
            <Icon name="close" /> Limpar filtros
          </button>
        )}
      </div>

      <div className="table-scroll">
        <table className="w-full text-left">
          <thead>
            <tr>
              {COLUNAS.map((c) => (
                <th key={c.k} className="table-header w-px whitespace-nowrap" aria-sort={ordem?.k === c.k ? (ordem.desc ? 'descending' : 'ascending') : 'none'}>
                  {c.ord ? (
                    <button type="button" className="th-ordenar" onClick={() => ordenar(c.k)}>
                      {c.r}
                      <Icon name={ordem?.k === c.k && ordem.desc ? 'chevron-up' : 'chevron-down'} size="sm" />
                    </button>
                  ) : c.r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fatia.map((v, i) => (
              <tr key={`${v.chrom}-${v.pos}-${v.alt}-${i}`} className="border-t border-border">
                <td className="px-16 py-12 mono text-12 whitespace-nowrap">{v.chrom}:{fmt(v.pos)}</td>
                <td className="px-16 py-12 text-12 whitespace-nowrap">
                  <span className="mono text-text">{v.ref.slice(0, 8)}→{v.alt.slice(0, 8)}</span>
                  {v.transicao != null && (
                    <span className="block label">{v.transicao ? 'transição' : 'transversão'}</span>
                  )}
                </td>
                <td className="px-16 py-12 text-12 whitespace-nowrap">{v.tipo}</td>
                <td className="px-16 py-12 text-12 mono">
                  {(v.gene || v.clinvar?.gene)
                    ? <Link to={`/gene/${v.gene || v.clinvar.gene}`} className="link-muted underline underline-offset-2">{v.gene || v.clinvar.gene}</Link>
                    : '—'}
                </td>
                <td className="px-16 py-12 text-12">
                  {v.clinvar ? (
                    <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[v.clinvar.sig])}>{ROTULO[v.clinvar.sig]}</span>
                  ) : v.aleloDivergente ? (
                    <span className="label">rsID conhecido, alelo não confere</span>
                  ) : '—'}
                </td>
                <td className="px-16 py-12 text-12 mono num text-right">
                  {v.clinvar ? `${v.clinvar.estrelas}/4` : '—'}
                </td>
                <td className="px-16 py-12 text-12 whitespace-nowrap">
                  {v.clinvar?.consequencia > 0 ? (
                    <>
                      <span className="tag tag-series tag-sm" style={seriesStyle(SLOT_IMPACTO[IMPACTO[v.clinvar.consequencia]] || 1)}>
                        {IMPACTO[v.clinvar.consequencia] || 'Não classificado'}
                      </span>
                      <span className="block label">{CONSEQUENCIA[v.clinvar.consequencia]}</span>
                    </>
                  ) : '—'}
                </td>
                <td className="px-16 py-12 text-12" style={{ maxWidth: '16rem' }}>
                  {v.clinvar?.condicao || '—'}
                </td>
                <td className="px-16 py-12 text-12 mono num text-right whitespace-nowrap">
                  {v.clinvar?.af != null
                    ? (v.clinvar.af === 0
                      ? '0%'
                      : `${(v.clinvar.af * 100 >= 1
                        ? (v.clinvar.af * 100).toFixed(1)
                        : (v.clinvar.af * 100).toPrecision(2)).replace('.', ',')}%`)
                    : '—'}
                </td>
                <td className="px-16 py-12 mono num text-12 text-right">{v.qual != null ? v.qual.toFixed(0) : '—'}</td>
                <td className="px-16 py-12 mono num text-12 text-right">{v.dp ?? '—'}</td>
                <td className="px-16 py-12 text-12 whitespace-nowrap">{v.zigosidade}</td>
                <td className="px-16 py-12 mono text-12">
                  {v.rsid ? <Link to={`/variant/${v.rsid}`} className="link-muted underline underline-offset-2">{v.rsid}</Link> : '—'}
                </td>
              </tr>
            ))}
            {fatia.length === 0 && (
              <tr><td colSpan={COLUNAS.length} className="px-16 py-24 text-13 text-center">
                Nenhuma variante atende a esses filtros.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-16 flex-wrap">
        <span className="flex items-center gap-8 flex-wrap">
          <button type="button" className="pill pill-sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
            <Icon name="arrow-left" /> Anterior
          </button>
          <span className="label">{pagina + 1} de {fmt(totalPag)}</span>
          <button type="button" className="pill pill-sm" disabled={pagina >= totalPag - 1} onClick={() => setPagina((p) => p + 1)}>
            Próxima <Icon name="arrow-right" />
          </button>
        </span>

        <span className="flex items-center gap-8 flex-wrap">
          <span className="label">Baixar {ativos ? 'o que está filtrado' : 'tudo'}</span>
          {[['csv', 'CSV'], ['tsv', 'TSV'], ['xlsx', 'XLSX'], ['vcf', 'VCF'], ['json', 'JSON']].map(([k, r]) => (
            <button key={k} type="button" className="pill pill-sm" disabled={saida === 'gerando'} onClick={() => exportar(k)}>
              <Icon name="download" /> {r}
            </button>
          ))}
          {saida === 'erro' && <span className="field-error" role="alert">Não foi possível gerar o arquivo.</span>}
        </span>
      </div>
    </article>
  )
}
