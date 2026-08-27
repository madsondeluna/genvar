import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { BarrasNomeadas } from './Grafico'
import { ROTULO, SLOT, ORDEM_GRAVIDADE, ESTRELAS, CONSEQUENCIA, IMPACTO, ORDEM_IMPACTO, SLOT_IMPACTO } from '../vcf/clinvar'
import { seriesStyle } from '../utils/seriesSlot'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

// Frequência populacional em texto. 0,0004 não se lê; 1 em 2.500 se lê.
export function freqTexto(af) {
  if (af == null) return 'sem frequência publicada'
  if (af === 0) return 'não observada nas coortes de referência'
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

export default function AchadosClinicos({ variantes, resumoCli, anotacao, onCarregarVUS, vus }) {
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
        <p className="text-12 leading-snug about-left" style={{ maxWidth: 'var(--measure-wide)' }}>
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
          <p className="text-12 leading-snug about-left" style={{ maxWidth: 'var(--measure-wide)' }}>
            Ordenadas pelo nível de revisão, que é o que separa um painel de especialistas de um
            único envio sem critério declarado. Achado aqui não é diagnóstico: precisa de
            confirmação em laboratório clínico e de aconselhamento genético.
          </p>
          <div className="table-scroll">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Gene', 'Variante', 'Troca', 'Classificação', 'Revisão', 'Condição', 'Frequência na população', 'Genótipo'].map((c) => (
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
                      <td className="px-16 py-12 text-12" style={{ maxWidth: '18rem' }}>
                        {v.clinvar.condicao || '—'}
                      </td>
                      <td className="px-16 py-12 text-12 whitespace-nowrap">
                        {freqTexto(v.clinvar.af)}
                        {conflito && (
                          <span className="block label" style={{ color: 'var(--status-warning)' }}>
                            comum demais para doença rara
                          </span>
                        )}
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
                .map(([c, n]) => ({ rotulo: CONSEQUENCIA[c] || 'outra', n, slot: SLOT_IMPACTO[IMPACTO[+c]] || 1 }))}
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
              { rotulo: 'com rsID', n: comRsid, slot: 3 },
              { rotulo: 'sem rsID', n: variantes.length - comRsid, slot: 6 },
              { rotulo: 'no ClinVar', n: anotadas.length, slot: 1 },
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
              ['Camada carregada', vus ? 'aviso e significado incerto' : 'aviso (patogênica, conflitante, fármaco, risco)'],
              ['Casadas', `${fmt(anotacao?.casadas ?? 0)} variantes`],
              ['Por coordenada', anotacao?.podeCoordenada ? 'ligado (arquivo em GRCh38)' : 'desligado (o arquivo não é GRCh38)'],
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

          {!vus && (
            <span className="flex flex-col gap-8 items-start">
              <button type="button" className="pill" onClick={onCarregarVUS}>
                <Icon name="download" />
                Carregar também as de significado incerto
              </button>
              <span className="label">
                2,3 milhões de registros no ClinVar; a página baixa só os cromossomos do seu arquivo
              </span>
            </span>
          )}
        </article>
      </div>
    </div>
  )
}
