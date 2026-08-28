import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { BarrasNomeadas } from './Grafico'
import { ROTULO, SLOT, ORDEM_GRAVIDADE, ESTRELAS, CONSEQUENCIA, IMPACTO, ORDEM_IMPACTO, SLOT_IMPACTO } from '../vcf/clinvar'
import { CRITERIOS, NAO_AVALIADOS } from '../vcf/interpretacao'
import { seriesStyle } from '../utils/seriesSlot'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

// Frequência populacional em texto. 0,0004 não se lê; 1 em 2.500 se lê.
export function freqTexto(af) {
  if (af == null) return 'Sem frequência publicada'
  if (af === 0) return 'Não observada nas coortes de referência'
  const pc = af * 100
  const pct = pc >= 1 ? pc.toFixed(1) : pc >= 0.01 ? pc.toFixed(2) : pc.toPrecision(2)
  return `${String(pct).replace('.', ',')}% · 1 em ${fmt(Math.round(1 / af))}`
}

// Troca de base, com o nome que a genética usa. Transição é purina por purina
// (A<->G) ou pirimidina por pirimidina (C<->T); qualquer outra é transversão, e
// é biologicamente mais rara, que é o que a razão Ti/Tv mede.
export function trocaTexto(v) {
  if (v.ref?.length !== 1 || v.alt?.length !== 1) return null
  return {
    troca: `${v.ref.toUpperCase()}→${v.alt.toUpperCase()}`,
    classe: v.transicao === true ? 'transição' : v.transicao === false ? 'transversão' : null,
  }
}

// Uma frequência alta contradiz uma classificação grave, e é o cruzamento que
// mais desfaz susto: doença rara não anda com alelo comum.
export function conflitoFrequencia(v) {
  const s = v.clinvar?.sig
  const af = v.clinvar?.af
  if (af == null || af < 0.01) return null
  if (s === 1 || s === 2 || s === 3) return af
  return null
}

export default function AchadosClinicos({ variantes, resumoCli, anotacao, onCarregarVUS, carregandoVus, vus, gnomad, onConsultarGnomad }) {
  const [gene, setGene] = useState(null)

  const anotadas = useMemo(() => variantes.filter((v) => v.clinvar), [variantes])
  const graves = useMemo(
    () => anotadas
      .filter((v) => [1, 2, 3].includes(v.clinvar.sig))
      .sort((a, b) => b.clinvar.estrelas - a.clinvar.estrelas || a.clinvar.sig - b.clinvar.sig),
    [anotadas],
  )
  const comRsid = useMemo(() => variantes.filter((v) => v.rsid).length, [variantes])
  const divergentes = useMemo(() => variantes.filter((v) => v.aleloDivergente && !v.clinvar), [variantes])

  const porClasse = ORDEM_GRAVIDADE
    .filter((s) => resumoCli.porSig[s])
    .map((s) => ({ rotulo: ROTULO[s], n: resumoCli.porSig[s], slot: SLOT[s] }))

  const genesLista = resumoCli.genes.slice(0, 12)
  const detalhe = gene ? anotadas.filter((v) => v.clinvar.gene === gene) : null

  return (
    <div className="flex flex-col gap-16">
      <article className="card flex flex-col gap-12">
        <span className="flex items-baseline justify-between gap-16 flex-wrap">
          <h3 className="text-16 font-medium text-text">O que o ClinVar diz das suas variantes</h3>
          <span className="label">
            {fmt(anotadas.length)} de {fmt(variantes.length)} encontradas
          </span>
        </span>
        <p className="text-12 leading-snug about-left">
          Cada variante foi procurada no ClinVar por{' '}
          <strong className="text-text font-medium">rsID mais alelo</strong>
          {anotacao?.podeCoordenada && <>, e por coordenada quando não havia rsID</>}. O alelo entra
          na chave porque um rsID nomeia um sítio, não uma troca: o mesmo número pode carregar um
          alelo patogênico e outro benigno, e casar só pelo número imprimiria a classificação de
          quem você não é.
        </p>

        <BarrasNomeadas
          itens={porClasse}
          total={variantes.length}
          slot={2}
          colunaRotulo="14rem"
          rotuloX="variantes com essa classificação"
        />
      </article>

      {graves.length > 0 && (
        <article className="card flex flex-col gap-12">
          <span className="flex items-baseline justify-between gap-16 flex-wrap">
            <h3 className="text-16 font-medium text-text">Variantes classificadas como patogênicas</h3>
            <span className="label">{fmt(graves.length)}</span>
          </span>
          <p className="text-12 leading-snug about-left">
            Ordenadas pelo nível de revisão, que é o que separa um painel de especialistas de um
            único envio sem critério declarado. Achado aqui não é diagnóstico: precisa de
            confirmação em laboratório clínico e de aconselhamento genético.
          </p>

          <span className="flex items-center gap-12 flex-wrap">
            {gnomad === 'pronto' ? (
              <span className="label">Frequência do gnomAD consultada para estes achados</span>
            ) : gnomad ? (
              <span className="label" role="status">
                Consultando o gnomAD: {gnomad.feitas} de {gnomad.total}
              </span>
            ) : (
              <button type="button" className="pill pill-sm"
                      onClick={() => onConsultarGnomad?.(graves)}>
                <Icon name="database" /> Consultar a frequência no gnomAD
              </button>
            )}
            <span className="label">
              Sai daqui coordenada e alelo, uma requisição por variante; nada que identifique o paciente
            </span>
          </span>
          <div className="table-scroll">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Gene', 'Variante', 'Troca', 'Classificação', 'Revisão', 'Gene-doença (ClinGen)', 'Condição', 'Frequência na população', 'ACMG', 'Genótipo'].map((c) => (
                    <th key={c} className="table-header w-px whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {graves.slice(0, 60).map((v, i) => {
                  const conflito = conflitoFrequencia(v)
                  const troca = trocaTexto(v)
                  return (
                    <tr key={`${v.chrom}-${v.pos}-${v.alt}-${i}`} className="border-t border-border">
                      <td className="px-16 py-12 text-12 mono">
                        {v.clinvar.gene
                          ? <Link to={`/gene/${v.clinvar.gene}`} className="link-muted underline underline-offset-2">{v.clinvar.gene}</Link>
                          : '—'}
                      </td>
                      <td className="px-16 py-12 text-12 mono whitespace-nowrap">
                        {v.chrom}:{fmt(v.pos)} {v.ref}&gt;{v.alt}
                        {v.rsid && <span className="text-muted"> · {v.rsid}</span>}
                      </td>
                      <td className="px-16 py-12 text-12 whitespace-nowrap">
                        {troca ? (
                          <>
                            <span className="mono text-text">{troca.troca}</span>
                            {troca.classe && <span className="block label">{troca.classe}</span>}
                          </>
                        ) : (
                          <span className="label">{v.tipo}</span>
                        )}
                      </td>
                      <td className="px-16 py-12 text-12">
                        <span className="tag tag-series" style={seriesStyle(SLOT[v.clinvar.sig])}>
                          {ROTULO[v.clinvar.sig]}
                        </span>
                      </td>
                      <td className="px-16 py-12 text-12 whitespace-nowrap">
                        <span className="mono num">{v.clinvar.estrelas}</span>
                        <span className="text-muted"> / 4</span>
                      </td>
                      <td className="px-16 py-12 text-12 whitespace-nowrap">
                        {v.clingen ? (
                          <>
                            <span className="text-text">{v.clingen.classificacao}</span>
                            <span className="block label">{v.clingen.heranca}</span>
                          </>
                        ) : <span className="label">sem curadoria</span>}
                      </td>
                      <td className="px-16 py-12 text-12" style={{ maxWidth: '18rem' }}>
                        {v.clinvar.condicao || '—'}
                      </td>
                      <td className="px-16 py-12 text-12 whitespace-nowrap">
                        {v.gnomad?.af != null ? (
                          <>
                            {freqTexto(v.gnomad.af)}
                            <span className="block label">gnomAD, global</span>
                            {v.gnomad.populacoes?.[0] && (
                              <span className="block label">
                                maior em {v.gnomad.populacoes[0].rotulo}: {freqTexto(v.gnomad.populacoes[0].af)}
                              </span>
                            )}
                          </>
                        ) : v.gnomad?.falhou ? (
                          <>
                            {freqTexto(v.clinvar.af)}
                            <span className="block label">a consulta ao gnomAD falhou</span>
                          </>
                        ) : v.gnomad?.ausente ? (
                          <>
                            <span>ausente do gnomAD</span>
                            <span className="block label">{v.gnomad.dataset}</span>
                          </>
                        ) : (
                          <>
                            {freqTexto(v.clinvar.af)}
                            {v.clinvar.af != null && <span className="block label">ExAC, 1000 Genomes ou ESP</span>}
                          </>
                        )}
                        {conflito && (
                          <span className="block label" style={{ color: 'var(--status-warning)' }}>
                            comum demais para doença rara
                          </span>
                        )}
                      </td>
                      <td className="px-16 py-12 text-12">
                        {v.acmg?.length ? (
                          <span className="flex gap-4 flex-wrap">
                            {v.acmg.map((c) => (
                              <span key={c.id} className="tag tag-sm mono" title={`${CRITERIOS[c.id]?.forca}: ${CRITERIOS[c.id]?.texto}`}>
                                {c.id}
                              </span>
                            ))}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-16 py-12 text-12 whitespace-nowrap">{v.zigosidade}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {graves.length > 60 && (
            <p className="label">Mostrando as 60 primeiras. O TSV e o XLSX trazem todas.</p>
          )}
        </article>
      )}

      {variantes.some((v) => v.gnomad?.populacoes?.length) && (
        <article className="card flex flex-col gap-12">
          <span className="flex items-baseline justify-between gap-16 flex-wrap">
            <h3 className="text-16 font-medium text-text">Frequência por população</h3>
            <span className="label">
              {fmt(variantes.filter((v) => v.gnomad?.populacoes?.length).length)} variantes consultadas no gnomAD
            </span>
          </span>
          <p className="text-12 leading-snug about-left">
            Uma variante rara no conjunto global e comum numa população específica muda a leitura:
            pode ser variante fundadora, e pode ser artefato de sub-representação daquela população
            nas coortes. As populações do gnomAD são grupos de ancestralidade genética inferida,
            não categorias de raça ou nacionalidade autodeclaradas, e a maior delas por larga
            margem é a europeia, o que faz frequência baixa em população não europeia significar
            menos do que o mesmo número na europeia.
          </p>
          {variantes
            .filter((v) => v.gnomad?.populacoes?.length)
            .sort((a, b) => ORDEM_GRAVIDADE.indexOf(a.clinvar?.sig) - ORDEM_GRAVIDADE.indexOf(b.clinvar?.sig))
            .slice(0, 8)
            .map((v, i) => (
              <div key={i} className="flex flex-col gap-6">
                <span className="flex gap-8 items-baseline flex-wrap">
                  {(v.clinvar?.gene || v.gene) && (
                    <Link to={`/gene/${v.clinvar?.gene || v.gene}`}
                          className="text-13 mono link-muted underline underline-offset-2">
                      {v.clinvar?.gene || v.gene}
                    </Link>
                  )}
                  <span className="text-12 mono">{v.chrom}:{fmt(v.pos)} {v.ref}→{v.alt}</span>
                  {v.rsid && <span className="text-12 mono text-muted">{v.rsid}</span>}
                  {v.clinvar && (
                    <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[v.clinvar.sig])}>
                      {ROTULO[v.clinvar.sig]}
                    </span>
                  )}
                  <span className="label">
                    global {freqTexto(v.gnomad.af)}
                    {v.gnomad.an ? ` em ${fmt(v.gnomad.an)} cromossomos` : ''}
                  </span>
                </span>
                <BarrasNomeadas
                  itens={v.gnomad.populacoes.map((p, j) => ({
                    rotulo: p.rotulo,
                    n: p.af != null ? +(p.af * 1e6).toFixed(0) : 0,
                    slot: (j % 8) + 1,
                  }))}
                  slot={1}
                  colunaRotulo="11rem"
                  rotuloX="frequência em partes por milhão"
                />
              </div>
            ))}
        </article>
      )}

      {variantes.some((v) => v.cpic) && (
        <article className="card flex flex-col gap-12">
          <span className="flex items-baseline justify-between gap-16 flex-wrap">
            <h3 className="text-16 font-medium text-text">Farmacogenômica</h3>
            <span className="label">{fmt(variantes.filter((v) => v.cpic).length)} variantes com diretriz</span>
          </span>
          <p className="text-12 leading-snug about-left">
            <strong className="text-text font-medium">Isto não é um diplótipo.</strong> Dizer
            &ldquo;*1/*4&rdquo; exige fase e número de cópias, e um VCF de variante curta não carrega
            nenhum dos dois. O que está aqui é que estes rsID participam da definição dos alelos
            estrela de genes com diretriz publicada pelo CPIC, e para quais fármacos essa diretriz
            existe. Prescrição continua sendo do médico, com genotipagem farmacogenética própria.
          </p>
          <div className="table-scroll">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Gene', 'Variante', 'Alelos que ela define', 'Fármacos com diretriz', 'Genótipo'].map((c) => (
                    <th key={c} className="table-header w-px whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variantes.filter((v) => v.cpic).slice(0, 40).map((v, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-16 py-12 text-12 mono">{v.cpic.gene}</td>
                    <td className="px-16 py-12 text-12 mono whitespace-nowrap">
                      {v.rsid}
                      {v.cpic.nome && <span className="block label">{v.cpic.nome}</span>}
                    </td>
                    <td className="px-16 py-12 text-12" style={{ maxWidth: '14rem' }}>
                      {v.cpic.alelos.map((a) => a.alelo).join(', ') || '—'}
                      {v.cpic.alelos_total > v.cpic.alelos.length && (
                        <span className="block label">e outros {v.cpic.alelos_total - v.cpic.alelos.length}</span>
                      )}
                    </td>
                    <td className="px-16 py-12 text-12" style={{ maxWidth: '20rem' }}>
                      <span className="flex gap-4 flex-wrap">
                        {v.cpic.farmacos.slice(0, 6).map((f) => (
                          <span key={f.farmaco}
                                className={`tag tag-sm ${f.acionavel ? 'tag-series' : ''}`}
                                style={f.acionavel ? seriesStyle(SLOT[9]) : undefined}
                                title={f.diretriz ? f.diretriz.nome : `Nível CPIC ${f.nivel}`}>
                            {f.farmaco}
                          </span>
                        ))}
                      </span>
                      {v.cpic.farmacos.length > 6 && (
                        <span className="block label">e outros {v.cpic.farmacos.length - 6}</span>
                      )}
                    </td>
                    <td className="px-16 py-12 text-12 whitespace-nowrap">{v.zigosidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="label">
            Etiqueta destacada indica nível CPIC A ou B, que são os que têm recomendação de conduta.
          </p>
        </article>
      )}

      {variantes.some((v) => v.acmg?.length) && (
        <article className="card flex flex-col gap-12">
          <h3 className="text-16 font-medium text-text">Critérios ACMG/AMP avaliados</h3>
          <p className="text-12 leading-snug about-left">
            <strong className="text-text font-medium">Isto não é uma classificação ACMG.</strong> A
            regra completa combina 28 critérios, e a maioria exige literatura, segregação familiar
            ou ensaio funcional que nenhum arquivo carrega. Abaixo estão os critérios que saem
            mecanicamente do que está carregado, com a fonte de cada um, e a lista do que não foi
            avaliado, porque mostrar três critérios sem dizer que existem vinte e cinco sugere uma
            conclusão que ninguém tirou.
          </p>
          <div className="grid gap-24 about-cards">
            <ul className="flex flex-col gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {Object.entries(CRITERIOS).map(([id, c]) => {
                const n = variantes.filter((v) => v.acmg?.some((x) => x.id === id)).length
                return (
                  <li key={id} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: '4rem 1fr auto' }}>
                    <span className="mono text-13 text-text">{id}</span>
                    <span className="text-12">
                      {c.texto}
                      <span className="block label">{c.forca}</span>
                    </span>
                    <span className="mono num text-13">{n ? fmt(n) : '—'}</span>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-col gap-8">
              <span className="label">Não avaliados por este módulo</span>
              <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {NAO_AVALIADOS.map(([ids, motivo]) => (
                  <li key={ids} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: '5.5rem 1fr' }}>
                    <span className="mono text-12 text-text">{ids}</span>
                    <span className="text-12">{motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      )}

      <div className="grid gap-16 about-cards">
        <article className="card flex flex-col gap-12">
          <h3 className="text-16 font-medium text-text">Efeito na proteína</h3>
          <p className="text-12 leading-snug about-left">
            Impacto não é gravidade clínica: é quanto a troca mexe na proteína. Alto interrompe a
            leitura, por códon de parada prematuro, mudança de matriz ou sítio de splicing;
            moderado troca um aminoácido; baixo não altera a proteína; modificador cai fora da
            região codificante. Uma variante de alto impacto num gene que não importa continua
            inofensiva, e é por isso que impacto e classificação são duas colunas e nunca uma.
          </p>
          <BarrasNomeadas
            itens={ORDEM_IMPACTO
              .filter((i) => resumoCli.porImpacto?.[i])
              .map((i) => ({ rotulo: i, n: resumoCli.porImpacto[i], slot: SLOT_IMPACTO[i] }))}
            total={anotadas.length}
            slot={1}
            colunaRotulo="8rem"
            rotuloX="variantes com esse impacto"
          />
          {Object.keys(resumoCli.porConsequencia || {}).length > 0 && (
            <BarrasNomeadas
              itens={Object.entries(resumoCli.porConsequencia)
                .sort((a, b) => b[1] - a[1]).slice(0, 8)
                .map(([c, n]) => ({ rotulo: CONSEQUENCIA[c] || 'Outra', n, slot: SLOT_IMPACTO[IMPACTO[+c]] || 1 }))}
              total={anotadas.length}
              slot={1}
              colunaRotulo="12rem"
              rotuloX="variantes com essa consequência"
            />
          )}
        </article>

        <article className="card flex flex-col gap-12">
          <h3 className="text-16 font-medium text-text">Polimorfismos já catalogados</h3>
          <p className="text-12 leading-snug about-left">
            Um rsID significa que aquela posição e aquele alelo já foram vistos e depositados no
            dbSNP. Não diz nada sobre efeito: rsID é identificador, não classificação. O que ele
            separa é o já descrito do que o arquivo traz de novo, e num arquivo clínico é essa
            segunda fração que merece atenção antes de qualquer outra.
          </p>
          <BarrasNomeadas
            itens={[
              { rotulo: 'Com rsID', n: comRsid, slot: 3 },
              { rotulo: 'Sem rsID', n: variantes.length - comRsid, slot: 6 },
              { rotulo: 'No ClinVar', n: anotadas.length, slot: 1 },
            ]}
            max={variantes.length}
            total={variantes.length}
            slot={1}
            colunaRotulo="8rem"
            rotuloX="variantes"
          />
        </article>

        <article className="card flex flex-col gap-12">
          <h3 className="text-16 font-medium text-text">Genes com achado</h3>
          <p className="text-12 leading-snug about-left">
            Ordenados por variante patogênica e depois por variante de significado incerto. Clique
            num gene para ver as variantes dele.
          </p>
          {genesLista.length === 0 && <p className="text-13">Nenhum gene com variante catalogada.</p>}
          <ul className="flex flex-col gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {genesLista.map((g) => (
              <li key={g.gene}>
                <button
                  type="button"
                  className={`gene-linha ${gene === g.gene ? 'is-ativo' : ''}`}
                  aria-expanded={gene === g.gene}
                  onClick={() => setGene(gene === g.gene ? null : g.gene)}
                >
                  <span className="text-13 mono text-text">{g.gene}</span>
                  <span className="flex gap-6 flex-wrap">
                    {g.patogenicas > 0 && (
                      <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[1])}>
                        {g.patogenicas} patogênica{g.patogenicas > 1 ? 's' : ''}
                      </span>
                    )}
                    {g.incertas > 0 && (
                      <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[5])}>
                        {g.incertas} incerta{g.incertas > 1 ? 's' : ''}
                      </span>
                    )}
                    {g.patogenicas === 0 && g.incertas === 0 && (
                      <span className="label">{g.total} catalogada{g.total > 1 ? 's' : ''}</span>
                    )}
                  </span>
                </button>
                {gene === g.gene && (
                  <ul className="gene-detalhe">
                    {detalhe.slice(0, 20).map((v, i) => (
                      <li key={i} className="text-12 flex gap-8 flex-wrap items-baseline">
                        <span className="mono">{v.chrom}:{fmt(v.pos)} {v.ref}&gt;{v.alt}</span>
                        <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[v.clinvar.sig])}>
                          {ROTULO[v.clinvar.sig]}
                        </span>
                        {v.clinvar.consequencia > 0 && (
                          <span className="text-muted">{CONSEQUENCIA[v.clinvar.consequencia]}</span>
                        )}
                        <span className="text-muted">{ESTRELAS[v.clinvar.estrelas]}</span>
                      </li>
                    ))}
                    {g.condicoes.length > 0 && (
                      <li className="text-12 text-muted">
                        Condições: {g.condicoes.join('; ')}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="card flex flex-col gap-12">
          <h3 className="text-16 font-medium text-text">Cobertura desta anotação</h3>
          <ul className="flex flex-col gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[
              ['Camada carregada', vus ? 'Aviso e significado incerto' : 'Aviso: patogênica, conflitante, fármaco e risco'],
              ['Casadas', `${fmt(anotacao?.casadas ?? 0)} variantes`],
              ['Por coordenada', anotacao?.podeCoordenada ? 'Ligado, arquivo em GRCh38' : 'Desligado, o arquivo não é GRCh38'],
              ['rsID com alelo diferente', `${fmt(divergentes.length)}`],
            ].map(([k, v]) => (
              <li key={k} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: 'minmax(0,11rem) 1fr' }}>
                <span className="label">{k}</span>
                <span className="text-13">{v}</span>
              </li>
            ))}
          </ul>

          {divergentes.length > 0 && (
            <p className="text-12 leading-snug about-left">
              {fmt(divergentes.length)} variantes têm um rsID que o ClinVar conhece, mas com outro
              alelo. Elas ficam de fora do achado de propósito: a classificação daquele registro
              descreve uma troca que não é a sua.
            </p>
          )}

          {!vus && carregandoVus?.etapa !== 'baixando' && (
            <span className="flex flex-col gap-8 items-start">
              <button type="button" className="pill" onClick={onCarregarVUS}>
                <Icon name="download" />
                Carregar também as de significado incerto
              </button>
              <span className="label">
                2,3 milhões de registros no ClinVar; a página baixa só os cromossomos do seu
                arquivo, e a espera passa de meio minuto
              </span>
            </span>
          )}

          {carregandoVus?.etapa === 'baixando' && (
            <span className="flex flex-col gap-8 items-start" role="status" aria-live="polite">
              <span className="flex items-center gap-8">
                <span className="spinner" aria-hidden="true" />
                <span className="text-13">
                  {carregandoVus.etapaInterna === 'montando'
                    ? 'Montando o índice de significado incerto'
                    : 'Baixando a camada de significado incerto'}
                  {carregandoVus.cromossomo ? `: cromossomo ${carregandoVus.cromossomo}` : '...'}
                </span>
              </span>
              <span className="label">
                {carregandoVus.feitos != null
                  ? `${carregandoVus.feitos} de ${carregandoVus.total} cromossomos`
                  : 'São dezenas de megabytes; o arquivo do paciente continua no computador dele'}
              </span>
            </span>
          )}

          {carregandoVus?.etapa === 'pronto' && (
            <p className="text-13" role="status">
              Camada de significado incerto carregada:{' '}
              <strong className="text-text font-medium">
                {fmt(carregandoVus.novas)} variantes novas
              </strong>{' '}
              entraram no relatório, e a contagem por classificação acima já as inclui.
            </p>
          )}

          {carregandoVus?.etapa === 'erro' && (
            <p className="field-error" role="alert">
              Não foi possível baixar a camada: {carregandoVus.motivo}
            </p>
          )}
        </article>
      </div>
    </div>
  )
}
