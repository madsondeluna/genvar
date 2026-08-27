import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { histograma, porCromossomo, TITV_ESPERADO } from '../vcf/metricas'
import { seriesStyle } from '../utils/seriesSlot'

// Relatório do VCF. Tudo aqui é derivado do arquivo, sem rede: são as métricas
// que dizem se o conjunto presta antes de interpretar variante nenhuma.

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const pct = (n) => `${(n * 100).toFixed(1)}%`

// Barra horizontal. Cresce por transform, nunca por width, que é a regra da
// linguagem para medidor.
function Barra({ valor, max, slot }) {
  return (
    <span className="meter" role="img" aria-label={`${valor} de ${max}`}>
      <span style={{ transform: `scaleX(${max ? valor / max : 0})`, background: `var(--chart-${slot || 1})` }} />
    </span>
  )
}

function Ficha({ rotulo, valor, nota, slot }) {
  return (
    <div className="tint-series" style={seriesStyle(slot)}>
      <span className="text-24 mono num text-text leading-none">{valor}</span>
      <span className="text-12">{rotulo}</span>
      {nota && <span className="label">{nota}</span>}
    </div>
  )
}

export default function VcfReport({ dados }) {
  const { meta, variantes, metricas, nome, tamanho, lidos, truncado } = dados
  const [aba, setAba] = useState('qualidade')

  const dp = useMemo(() => histograma(variantes, 'dp'), [variantes])
  const qual = useMemo(() => histograma(variantes, 'qual'), [variantes])
  const cromo = useMemo(() => porCromossomo(variantes), [variantes])
  const maxCromo = Math.max(1, ...cromo.map((c) => c.n))

  // Genes com mais variantes: a lista que responde "onde isso se concentra".
  const porGene = useMemo(() => {
    const c = {}
    for (const v of variantes) if (v.gene) c[v.gene] = (c[v.gene] || 0) + 1
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [variantes])

  const titv = metricas.titv
  const faixaExoma = TITV_ESPERADO.exoma
  const titvOk = titv != null && titv >= 1.5

  return (
    <>
      <section className="mb-96" aria-labelledby="rel-title">
        <h2 id="rel-title" className="section-title mb-8">Relatório</h2>
        <p className="text-14 leading-normal mb-24" style={{ maxWidth: 'var(--measure-wide)' }}>
          <span className="mono">{nome}</span>, {fmt(Math.round(tamanho / 1024))} KB.{' '}
          {meta.build
            ? <>Referência <strong className="text-text font-medium">{meta.build}</strong>, declarada no cabeçalho.</>
            : <>O cabeçalho <strong className="text-text font-medium">não declara o build</strong> de referência, então as coordenadas não podem ser cruzadas com segurança.</>}
          {meta.chamador && <> Chamador: <span className="mono">{meta.chamador}</span>.</>}
          {truncado && <> O arquivo excede o teto de leitura e o relatório cobre as primeiras {fmt(lidos)} linhas.</>}
        </p>

        <div className="card faixa-numeros glass-panel mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
          <Ficha slot={1} valor={fmt(metricas.total)} rotulo="variantes" nota={`${fmt(lidos)} linhas`} />
          <Ficha slot={2} valor={fmt(metricas.passa)} rotulo="passaram no filtro" nota={pct(metricas.total ? metricas.passa / metricas.total : 0)} />
          <Ficha slot={3} valor={titv ? titv.toFixed(2) : '—'} rotulo="razão Ti/Tv" nota={`exoma ${faixaExoma[0]}–${faixaExoma[1]}`} />
          <Ficha slot={4} valor={pct(metricas.fracaoConhecida)} rotulo="já no dbSNP" nota={`${fmt(metricas.comRsid)} com rsID`} />
          <Ficha slot={5} valor={fmt(meta.amostras.length)} rotulo="amostras" nota={meta.amostras.join(', ').slice(0, 20) || 'sem genótipo'} />
        </div>

        {titv != null && !titvOk && (
          <div className="card tint-warning mb-24 flex items-start gap-10">
            <Icon name="alert" className="text-muted mt-2" />
            <p className="text-13 leading-snug about-left">
              A razão transição/transversão está em {titv.toFixed(2)}. Transversão é biologicamente
              mais rara que transição, então ruído de chamada puxa essa razão para baixo: valores
              abaixo de 1,5 costumam indicar chamada falsa em excesso. Exoma fica perto de 3,0 e
              genoma perto de 2,0.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-8 mb-16" role="tablist" aria-label="Seções do relatório">
          {[['qualidade', 'Qualidade'], ['distribuicao', 'Distribuição'], ['genes', 'Genes'], ['tabela', 'Variantes']].map(([k, r]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              className={`pill pill-sm ${aba === k ? 'pill-solid' : ''}`}
              onClick={() => setAba(k)}
            >
              {r}
            </button>
          ))}
        </div>

        {aba === 'qualidade' && (
          <div className="grid gap-16 about-cards">
            <article className="card flex flex-col gap-12">
              <span className="flex items-baseline justify-between gap-8">
                <h3 className="text-16 font-medium text-text">Profundidade de leitura</h3>
                <span className="label">mediana {dp.mediana != null ? dp.mediana.toFixed(0) : '—'}×</span>
              </span>
              <p className="text-12 leading-snug about-left">
                Quantas leituras cobrem cada posição. Abaixo de 10× a chamada de heterozigoto fica
                pouco confiável: o alelo menos representado pode simplesmente não ter sido lido.
              </p>
              <Histo h={dp} slot={1} unidade="×" />
            </article>

            <article className="card flex flex-col gap-12">
              <span className="flex items-baseline justify-between gap-8">
                <h3 className="text-16 font-medium text-text">Qualidade da chamada</h3>
                <span className="label">mediana {qual.mediana != null ? qual.mediana.toFixed(0) : '—'}</span>
              </span>
              <p className="text-12 leading-snug about-left">
                Escala Phred: 30 significa uma chance em mil de a variante não existir; 20, uma em
                cem. O acúmulo de chamadas em qualidade baixa é o sinal mais direto de ruído.
              </p>
              <Histo h={qual} slot={2} />
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Filtros do chamador</h3>
              <p className="text-12 leading-snug about-left">
                O que o programa que gerou o arquivo marcou como aprovado ou suspeito.
              </p>
              <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {Object.entries(metricas.filtros).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => (
                  <li key={f} className="grid items-center gap-12" style={{ gridTemplateColumns: 'minmax(0,9rem) 1fr auto' }}>
                    <span className="text-12 mono truncate">{f === '.' ? 'sem filtro' : f}</span>
                    <Barra valor={n} max={metricas.total} slot={f === 'PASS' ? 4 : 8} />
                    <span className="text-12 mono num">{fmt(n)}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Zigosidade</h3>
              <p className="text-12 leading-snug about-left">
                Heterozigoto tem um alelo alterado, homozigoto tem os dois. A proporção entre eles
                é constante numa amostra sadia; desvio grande indica consanguinidade, perda de
                heterozigosidade ou erro de chamada.
              </p>
              <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {Object.entries(metricas.zigosidade).sort((a, b) => b[1] - a[1]).map(([z, n]) => (
                  <li key={z} className="grid items-center gap-12" style={{ gridTemplateColumns: 'minmax(0,9rem) 1fr auto' }}>
                    <span className="text-12 truncate">{z}</span>
                    <Barra valor={n} max={metricas.total} slot={3} />
                    <span className="text-12 mono num">{fmt(n)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        )}

        {aba === 'distribuicao' && (
          <div className="grid gap-16 about-cards">
            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Por cromossomo</h3>
              <p className="text-12 leading-snug about-left">
                Um pico isolado costuma ser região de baixa mapeabilidade, não descoberta.
              </p>
              <ul className="flex flex-col gap-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {cromo.map((c) => (
                  <li key={c.chr} className="grid items-center gap-12" style={{ gridTemplateColumns: '2.5rem 1fr auto' }}>
                    <span className="text-12 mono">{c.chr}</span>
                    <Barra valor={c.n} max={maxCromo} slot={1} />
                    <span className="text-12 mono num">{fmt(c.n)}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Tipo de variante</h3>
              <p className="text-12 leading-snug about-left">
                Troca de uma base (SNV), inserção, deleção ou bloco. Indel é mais difícil de chamar
                que SNV, então excesso deles também aponta ruído.
              </p>
              <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {Object.entries(metricas.tipos).sort((a, b) => b[1] - a[1]).map(([t, n], i) => (
                  <li key={t} className="grid items-center gap-12" style={{ gridTemplateColumns: 'minmax(0,7rem) 1fr auto' }}>
                    <span className="text-12 truncate">{t}</span>
                    <Barra valor={n} max={metricas.total} slot={(i % 8) + 1} />
                    <span className="text-12 mono num">{fmt(n)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        )}

        {aba === 'genes' && (
          <article className="card flex flex-col gap-12">
            <h3 className="text-16 font-medium text-text">Genes com mais variantes</h3>
            <p className="text-12 leading-snug about-left" style={{ maxWidth: 'var(--measure-wide)' }}>
              A posição de cada variante foi cruzada com as coordenadas de 20.033 genes, sem
              consultar a rede. Gene grande acumula mais variantes por tamanho, não por relevância:
              a lista é ponto de partida, não achado.
            </p>
            {porGene.length === 0 && <p className="text-13">Nenhuma variante caiu dentro de um gene conhecido.</p>}
            <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {porGene.map(([g, n], i) => (
                <li key={g} className="grid items-center gap-12" style={{ gridTemplateColumns: 'minmax(0,8rem) 1fr auto auto' }}>
                  <Link to={`/gene/${g}`} className="text-13 mono link-muted underline underline-offset-2 truncate">{g}</Link>
                  <Barra valor={n} max={porGene[0][1]} slot={(i % 8) + 1} />
                  <span className="text-12 mono num">{fmt(n)}</span>
                  <Icon name="arrow-right" className="text-muted" />
                </li>
              ))}
            </ul>
          </article>
        )}

        {aba === 'tabela' && <TabelaVariantes variantes={variantes} />}
      </section>
    </>
  )
}

function Histo({ h, slot, unidade = '' }) {
  if (!h.n) return <p className="text-12">O arquivo não traz esse campo.</p>
  const max = Math.max(...h.faixas.map((f) => f.n))
  return (
    <div className="histo" role="img" aria-label={`Histograma, mediana ${h.mediana?.toFixed(1)}${unidade}`}>
      {h.faixas.map((f) => (
        <span
          key={f.de}
          className="histo-barra"
          style={{ blockSize: `${max ? (f.n / max) * 100 : 0}%`, background: `var(--chart-${slot})` }}
          title={`${f.de}–${f.ate}${unidade}: ${f.n.toLocaleString('pt-BR')}`}
        />
      ))}
    </div>
  )
}

function TabelaVariantes({ variantes }) {
  const [pagina, setPagina] = useState(0)
  const porPagina = 25
  const total = Math.ceil(variantes.length / porPagina)
  const fatia = variantes.slice(pagina * porPagina, (pagina + 1) * porPagina)
  return (
    <article className="card flex flex-col gap-12">
      <span className="flex items-baseline justify-between gap-16 flex-wrap">
        <h3 className="text-16 font-medium text-text">Variantes</h3>
        <span className="label">{fmt(variantes.length)} no total</span>
      </span>
      <div className="table-scroll">
        <table className="w-full text-left">
          <thead>
            <tr>
              {['Posição', 'Ref', 'Alt', 'Tipo', 'Gene', 'Qual', 'Prof', 'Genótipo', 'rsID'].map((c) => (
                <th key={c} className="table-header w-px whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fatia.map((v, i) => (
              <tr key={`${v.chrom}-${v.pos}-${v.alt}-${i}`} className="border-t border-border">
                <td className="px-16 py-12 mono text-12 whitespace-nowrap">{v.chrom}:{fmt(v.pos)}</td>
                <td className="px-16 py-12 mono text-12">{v.ref.slice(0, 10)}</td>
                <td className="px-16 py-12 mono text-12">{v.alt.slice(0, 10)}</td>
                <td className="px-16 py-12 text-12 whitespace-nowrap">{v.tipo}</td>
                <td className="px-16 py-12 text-12 mono">
                  {v.gene ? <Link to={`/gene/${v.gene}`} className="link-muted underline underline-offset-2">{v.gene}</Link> : '—'}
                </td>
                <td className="px-16 py-12 mono num text-12 text-right">{v.qual != null ? v.qual.toFixed(0) : '—'}</td>
                <td className="px-16 py-12 mono num text-12 text-right">{v.dp ?? '—'}</td>
                <td className="px-16 py-12 text-12 whitespace-nowrap">{v.zigosidade}</td>
                <td className="px-16 py-12 mono text-12">
                  {v.rsid ? <Link to={`/variant/${v.rsid}`} className="link-muted underline underline-offset-2">{v.rsid}</Link> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 1 && (
        <span className="flex items-center gap-8 flex-wrap">
          <button type="button" className="pill pill-sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
            <Icon name="arrow-left" /> Anterior
          </button>
          <span className="label">{pagina + 1} de {fmt(total)}</span>
          <button type="button" className="pill pill-sm" disabled={pagina >= total - 1} onClick={() => setPagina((p) => p + 1)}>
            Próxima <Icon name="arrow-right" />
          </button>
        </span>
      )}
    </article>
  )
}
