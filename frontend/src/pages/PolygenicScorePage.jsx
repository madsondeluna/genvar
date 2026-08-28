import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import Icon from '../components/Icon'
import { fetchPgsScore } from '../api/client'
import { seriesStyle } from '../utils/seriesSlot'

// Detalhe de um escore poligênico, servido por nós.
//
// Os cards da listagem levavam para a página do PGS Catalog, e isso entregava a
// leitura a outro site: o que o usuário precisa saber sobre um escore está numa
// API pública, e mandá-lo embora para ler é abrir mão da parte que interessa.
// O dado continua sendo deles e a procedência está declarada em toda seção;
// o que muda é onde ele é lido, em português e ligado ao resto da plataforma.
//
// A ANCESTRIA É A SEÇÃO PRINCIPAL, e não um detalhe de rodapé. Um escore
// poligênico é uma soma ponderada de alelos, e os pesos vêm de um GWAS feito
// numa população: aplicado fora dela, o escore perde calibração porque o
// desequilíbrio de ligação entre o marcador e a variante causal muda. Por isso
// as três fases aparecem separadas, e não somadas: a do GWAS que gerou os
// pesos, a do ajuste do escore e a das coortes onde ele foi testado.

const NOME_ANCESTRIA = {
  EUR: 'Europeia', AFR: 'Africana', EAS: 'Leste asiática', SAS: 'Sul asiática',
  AMR: 'Hispânica ou latina', ASN: 'Asiática', OTH: 'Outra', NR: 'Não informada',
  MAE: 'Múltiplas, com maioria europeia', MAO: 'Múltiplas, sem maioria europeia',
  GME: 'Oriente Médio', 'Multi-ancestry (including European)': 'Múltiplas, com europeia',
  'Multi-ancestry (excluding European)': 'Múltiplas, sem europeia',
}

const FASES = [
  ['ancestry_gwas', 'GWAS de origem', 'População do estudo de associação que produziu os pesos.'],
  ['ancestry_dist_dev', 'Desenvolvimento', 'População em que o escore foi ajustado.'],
  ['ancestry_eval', 'Avaliação', 'Populações em que o desempenho foi medido.'],
]

const num = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

// Decimal com VÍRGULA. O catálogo devolve ponto, e um laudo em português que
// escreve "1.61" para uma razão de chances é lido como mil seiscentos e um por
// quem está acostumado com o separador de milhar brasileiro.
const dec = (n) => (n == null ? '—' : String(n).replace('.', ','))

function Faixa({ dist, colunas = 1 }) {
  const itens = Object.entries(dist || {}).sort((a, b) => b[1] - a[1])
  if (!itens.length) return <span className="text-12">Não informada.</span>
  return (
    <>
      <span className="flex rounded-media overflow-hidden" style={{ height: 'var(--space-10)' }}>
        {itens.map(([sigla, pct], i) => (
          <span key={sigla} title={`${NOME_ANCESTRIA[sigla] || sigla}: ${pct}%`}
            style={{ ...seriesStyle((i % 8) + 1), width: `${pct}%`, background: 'var(--series)' }} />
        ))}
      </span>
      {/* A legenda flui em colunas quando o card é largo: em uma coluna só, um
          card de largura inteira com oito ancestrias vira uma lista estreita
          com metade da linha vazia à direita. */}
      <span className="grid gap-x-24 gap-y-4"
        style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
        {itens.map(([sigla, pct], i) => (
          <span key={sigla} className="flex items-baseline gap-8 text-12">
            <span className="rounded-mark" aria-hidden="true"
              style={{ ...seriesStyle((i % 8) + 1), background: 'var(--series)',
                width: 'var(--space-8)', height: 'var(--space-8)' }} />
            <span className="flex-1">{NOME_ANCESTRIA[sigla] || sigla}</span>
            <span className="mono num">{String(pct).replace('.', ',')}%</span>
          </span>
        ))}
      </span>
    </>
  )
}

function Metrica({ m }) {
  const tem = m.ic_min != null && m.ic_max != null
  return (
    // Nome em cima, número embaixo. Lado a lado, a estimativa e o intervalo
    // empurravam o nome da métrica para uma segunda linha e a coluna perdia o
    // alinhamento com as vizinhas.
    <span className="flex flex-col gap-2">
      <span className="text-12">{m.nome || m.sigla}</span>
      <span className="mono num text-text">
        {dec(m.estimativa)}
        {tem && (
          <span className="label"> (IC 95% {dec(m.ic_min)}–{dec(m.ic_max)})</span>
        )}
      </span>
    </span>
  )
}

export default function PolygenicScorePage() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['pgs', id],
    queryFn: () => fetchPgsScore(id),
    retry: 1,
  })

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">
        {isLoading && <LoadingSpinner />}
        {error && <ErrorAlert message="Não foi possível carregar este escore." />}

        {data && (
          <>
            <header className="mb-48 flex flex-col gap-12">
              <p className="eyebrow flex items-center gap-8">
                <Icon name="sparkle" />
                <Link to="/poligenico" className="hover:opacity-70">Escore poligênico</Link>
                <span className="mono">{data.id}</span>
              </p>
              <h1 className="display text-40">{data.trait}</h1>
              {data.short && <p className="text-15 leading-normal about-left">{data.short}</p>}
              {data.publication?.title && (
                <p className="text-13">
                  {data.publication.title}
                  {data.publication.author && <> · {data.publication.author}</>}
                  {data.publication.journal && <> · {data.publication.journal}</>}
                  {data.publication.year && <> · {data.publication.year}</>}
                  {data.publication.doi && (
                    <> · <a className="link" href={`https://doi.org/${data.publication.doi}`}
                      target="_blank" rel="noreferrer">doi:{data.publication.doi}</a></>
                  )}
                </p>
              )}
            </header>

            <section className="mb-96" aria-labelledby="ficha">
              <h2 id="ficha" className="sr-only">Ficha do escore</h2>
              {/* NÚMERO na faixa, TEXTO na ficha. O nome do método tem 46
                  caracteres e, posto numa célula desenhada para um numeral,
                  quebrava em três linhas de corpo 20 e deformava as vizinhas. */}
              <div className="card faixa-numeros glass-panel mb-24"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
                {[
                  [1, num(data.n_variants), 'variantes', 'somadas no escore'],
                  [2, num(data.performance?.length), 'avaliações', 'coortes onde foi testado'],
                  [3, data.genome_build || '—', 'build', 'referência das coordenadas'],
                  [4, data.ancestry_eval?.count != null ? num(data.ancestry_eval.count) : '—',
                    'pessoas avaliadas', 'somadas nas coortes de teste'],
                ].map(([slot, valor, rotulo, nota]) => (
                  <div key={rotulo} className="tint-series" style={seriesStyle(slot)}>
                    <span className="text-24 mono num text-text leading-none">{valor}</span>
                    <span className="text-12">{rotulo}</span>
                    <span className="label">{nota}</span>
                  </div>
                ))}
              </div>
              <dl className="card grid gap-16 about-cards">
                {[
                  ['Método', data.method, 'Como os pesos das variantes foram ajustados.'],
                  ['Tipo de peso', data.weight_type,
                    'Escala em que o peso de cada variante é expresso.'],
                  ['Traço mapeado', (data.trait_efo || []).join(', '),
                    'Termo do vocabulário EFO a que o traço foi ligado.'],
                ].filter(([, v]) => v).map(([rotulo, valor, nota]) => (
                  <span key={rotulo} className="flex flex-col gap-4">
                    <dt className="label">{rotulo}</dt>
                    <dd className="text-14 text-text leading-snug">{valor}</dd>
                    <span className="label">{nota}</span>
                  </span>
                ))}
              </dl>
            </section>

            <section className="mb-96" aria-labelledby="anc">
              <h2 id="anc" className="section-title mb-16">Em quem este escore foi construído e testado</h2>
              <p className="text-14 leading-normal about-left mb-24">
                Um escore poligênico soma alelos com pesos vindos de um estudo de associação feito
                numa população. Aplicado fora dela, ele perde calibração: o desequilíbrio de ligação
                entre o marcador medido e a variante causal muda de população para população, e o
                peso deixa de valer o que valia. As três fases aparecem separadas porque respondem a
                perguntas diferentes, e somá-las numa média apagaria exatamente essa distinção.
              </p>
              <div className="grid gap-24 about-cards">
                {FASES.map(([chave, titulo, explicacao], idx) => {
                  const fase = data[chave]
                  // A fase de AVALIAÇÃO ocupa a linha inteira: ela é a que traz
                  // muitas ancestrias, e sozinha na segunda linha de uma grade
                  // de dois deixava metade da página vazia.
                  const largo = idx === 2
                  return (
                    <article key={chave}
                      className="card flex flex-col gap-12"
                      style={largo ? { gridColumn: '1 / -1' } : undefined}>
                      <span className="flex items-baseline justify-between gap-8">
                        <h3 className="text-14 font-medium text-text">{titulo}</h3>
                        {fase?.count != null && (
                          <span className="label mono num">{num(fase.count)} pessoas</span>
                        )}
                      </span>
                      <span className="label">{explicacao}</span>
                      <Faixa dist={fase?.dist} colunas={largo ? 3 : 1} />
                    </article>
                  )
                })}
              </div>
            </section>

            {data.performance?.length > 0 && (
              <section className="mb-96" aria-labelledby="perf">
                <h2 id="perf" className="section-title mb-16">Desempenho publicado</h2>
                <p className="text-14 leading-normal about-left mb-24">
                  Cada linha é uma avaliação independente, com a coorte, a ancestria das pessoas
                  nela e o efeito medido com intervalo de confiança. Um escore sem avaliação fora da
                  população de desenvolvimento não está errado: está não testado, e a distinção
                  desaparece quando a página mostra apenas o número de variantes.
                </p>
                <div className="table-scroll">
                  <table className="w-full text-13">
                    <thead>
                      {/* A classe `.label` é `display: block`, e aplicada ao
                          próprio `th` derruba o `display: table-cell`: as cinco
                          colunas do cabeçalho saíam empilhadas uma sobre a
                          outra. Ela vai num span dentro da célula. */}
                      <tr className="text-left">
                        {['Coorte', 'Ancestria', 'Pessoas', 'Efeito', 'Discriminação'].map((c) => (
                          <th key={c} className={`px-12 py-8 align-top${c === 'Pessoas' ? ' text-right' : ''}`}>
                            <span className="label">{c}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.performance.map((p) => (
                        <tr key={p.id} style={{ borderTop: 'var(--hairline) solid var(--border)' }}>
                          <td className="px-12 py-8 align-top">
                            <span className="mono">{p.coorte || '—'}</span>
                            {p.fenotipo && <span className="block label">{p.fenotipo}</span>}
                          </td>
                          <td className="px-12 py-8 align-top">
                            {p.ancestrias?.length ? p.ancestrias.join(', ') : '—'}
                          </td>
                          <td className="px-12 py-8 align-top text-right mono num">
                            {num(p.n_amostras)}
                          </td>
                          <td className="px-12 py-8 align-top">
                            {p.efeitos?.length
                              ? <span className="flex flex-col gap-8">
                                {p.efeitos.map((m, i) => <Metrica key={i} m={m} />)}
                              </span>
                              : '—'}
                          </td>
                          <td className="px-12 py-8 align-top">
                            {p.discriminacao?.length
                              ? <span className="flex flex-col gap-8">
                                {p.discriminacao.map((m, i) => <Metrica key={i} m={m} />)}
                              </span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section aria-labelledby="proc">
              <h2 id="proc" className="section-title mb-16">Procedência</h2>
              <div className="card flex flex-col gap-12">
                <p className="text-14 leading-normal about-left">
                  Todo o dado desta página vem do <strong className="text-text font-medium">PGS
                  Catalog</strong>, mantido pelo EMBL-EBI, consultado ao vivo pela API REST pública
                  em cada visita. O GenVar não gera escore poligênico nem recalcula peso: traduz,
                  organiza e liga ao resto da plataforma o que o catálogo publica.
                </p>
                <dl className="grid gap-12 about-cards">
                  {[
                    ['Registro canônico', <a key="a" className="link" href={data.pgs_catalog_url}
                      target="_blank" rel="noreferrer">{data.id} no PGS Catalog</a>],
                    ['Licença', data.license || 'consultar o catálogo'],
                    ['Publicado em', data.release_date || '—'],
                    ['Arquivo de pesos', data.scoring_file
                      ? <a key="b" className="link" href={data.scoring_file} target="_blank"
                        rel="noreferrer">baixar do catálogo</a>
                      : '—'],
                  ].map(([rotulo, valor]) => (
                    <span key={rotulo} className="flex flex-col gap-4">
                      <dt className="label">{rotulo}</dt>
                      <dd className="text-13">{valor}</dd>
                    </span>
                  ))}
                </dl>
                <p className="text-12">
                  Citação: PGS Catalog. Lambert SA, Gil L, Jupp S, et al. The Polygenic Score
                  Catalog as an open database for reproducibility and systematic evaluation.
                  Nat Genet. 2021;53:420-425.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
