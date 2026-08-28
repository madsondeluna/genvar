import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { heterozigotosCompostos, analiseTrio, DP_PARENTAL_MIN } from '../vcf/metricas'
import { priorizarPorFenotipo } from '../vcf/interpretacao'
import { ROTULO, SLOT } from '../vcf/clinvar'
import { seriesStyle } from '../utils/seriesSlot'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

function LinhaVariante({ v, origem }) {
  return (
    <li className="text-12 flex gap-8 flex-wrap items-baseline">
      <span className="mono text-text">{v.chrom}:{fmt(v.pos)} {v.ref}→{v.alt}</span>
      {v.rsid && <span className="mono text-muted">{v.rsid}</span>}
      {v.clinvar && (
        <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[v.clinvar.sig])}>
          {ROTULO[v.clinvar.sig]}
        </span>
      )}
      {origem && <span className="label">herdada do lado {origem === 'mãe' ? 'materno' : 'paterno'}</span>}
      {v.ab != null && <span className="label">balanço {v.ab.toFixed(2).replace('.', ',')}</span>}
    </li>
  )
}

// Herança: o que só aparece olhando as variantes em conjunto, e não uma a uma.
// Uma lista ordenada por gravidade individual nunca mostra um composto, porque
// cada metade dele, sozinha, é um heterozigoto comum.
export default function Heranca({ variantes, papeis, termos }) {
  const temTrio = papeis?.proband != null && papeis?.mae != null && papeis?.pai != null

  const compostos = useMemo(() => heterozigotosCompostos(variantes).slice(0, 20), [variantes])
  const trio = useMemo(
    () => (temTrio ? analiseTrio(variantes, papeis) : null),
    [variantes, papeis, temTrio],
  )
  const fenotipo = useMemo(
    () => (termos?.length ? priorizarPorFenotipo(variantes, termos).slice(0, 20) : []),
    [variantes, termos],
  )

  return (
    <div className="flex flex-col gap-16">
      {temTrio && trio && (
        <>
          <article className="card flex flex-col gap-12">
            <span className="flex items-baseline justify-between gap-16 flex-wrap">
              <h3 className="text-16 font-medium text-text">Variantes de novo</h3>
              <span className="label">{fmt(trio.deNovo.length)} candidatas</span>
            </span>
            <p className="text-12 leading-snug about-left">
              Presentes na criança e ausentes nos dois pais. A regra ingênua é uma fábrica de falso
              positivo, e o motivo é cobertura: um pai com três leituras naquela posição sai como
              referência homozigota porque nenhuma das três calhou de trazer o alelo. Aqui os pais
              precisam de pelo menos {DP_PARENTAL_MIN} leituras e zero leitura do alelo alternativo.
            </p>
            <p className="text-12 leading-snug">
              <strong className="text-text font-medium">{fmt(trio.semCoberturaParental)} posições</strong>{' '}
              pareciam de novo e ficaram de fora por cobertura parental insuficiente. Não são
              negativas: são posições em que não se sabe se os pais têm. Sem esse número,
              &ldquo;{fmt(trio.deNovo.length)} de novo&rdquo; e &ldquo;{fmt(trio.deNovo.length)} de
              novo com {fmt(trio.semCoberturaParental)} posições não avaliáveis&rdquo; leem igual.
            </p>
            {trio.deNovo.length === 0 && <p className="text-13">Nenhuma candidata a de novo.</p>}
            <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {trio.deNovo.slice(0, 30).map((v, i) => (
                <LinhaVariante key={i} v={v} />
              ))}
            </ul>
          </article>

          <div className="grid gap-16 about-cards">
            <article className="card flex flex-col gap-12">
              <span className="flex items-baseline justify-between gap-8 flex-wrap">
                <h3 className="text-16 font-medium text-text">Heterozigoto composto em trans</h3>
                <span className="label">{fmt(trio.compostosTrans.length)} genes</span>
              </span>
              <p className="text-12 leading-snug about-left">
                Duas variantes no mesmo gene, uma herdada de cada lado. Isso <em>é</em> trans, e as
                duas cópias do gene estão comprometidas. É a única forma de afirmar composto sem
                fasamento por leitura, e é por isso que o trio muda a resposta.
              </p>
              {trio.compostosTrans.length === 0 && <p className="text-13">Nenhum encontrado.</p>}
              {trio.compostosTrans.slice(0, 10).map((c) => (
                <div key={c.gene} className="flex flex-col gap-4">
                  <span className="text-13 mono text-text">
                    <Link to={`/gene/${c.gene}`} className="link-muted underline underline-offset-2">{c.gene}</Link>
                  </span>
                  <ul className="gene-detalhe">
                    {c.variantes.map((v, i) => (
                      <LinhaVariante key={i} v={v} origem={c.origens[`${v.chrom}:${v.pos}`]} />
                    ))}
                  </ul>
                </div>
              ))}
            </article>

            <article className="card flex flex-col gap-12">
              <span className="flex items-baseline justify-between gap-8 flex-wrap">
                <h3 className="text-16 font-medium text-text">Recessivas homozigotas</h3>
                <span className="label">{fmt(trio.recessivas.length)}</span>
              </span>
              <p className="text-12 leading-snug about-left">
                A criança carrega as duas cópias e cada pai carrega uma. É o padrão clássico de
                doença recessiva, e a herança confirmada dos dois lados exclui a explicação
                alternativa mais comum, que é deleção de uma das cópias fazendo um heterozigoto
                parecer homozigoto.
              </p>
              {trio.recessivas.length === 0 && <p className="text-13">Nenhuma encontrada.</p>}
              <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {trio.recessivas.slice(0, 20).map((v, i) => <LinhaVariante key={i} v={v} />)}
              </ul>
            </article>
          </div>
        </>
      )}

      <article className="card flex flex-col gap-12">
        <span className="flex items-baseline justify-between gap-16 flex-wrap">
          <h3 className="text-16 font-medium text-text">
            {temTrio ? 'Outros candidatos a heterozigoto composto' : 'Candidatos a heterozigoto composto'}
          </h3>
          <span className="label">{fmt(compostos.length)} genes</span>
        </span>
        <p className="text-12 leading-snug about-left">
          Duas variantes em heterozigose no mesmo gene. <strong className="text-text font-medium">
          Candidato, não achado</strong>, e a diferença é de fase: só há composto se as duas
          estiverem em cromossomos opostos. Se viajarem no mesmo cromossomo, a outra cópia do gene
          está intacta e o efeito é o de um heterozigoto comum. O que resolve é o genótipo dos pais
          ou fasamento por leitura, e nenhum dos dois sai de um VCF de amostra única.
        </p>
        {compostos.length === 0 && (
          <p className="text-13">
            Nenhum gene com duas variantes em heterozigose. Sem cruzamento com genes, não há como
            agrupar: confira se o arquivo está em GRCh38.
          </p>
        )}
        {compostos.map((c) => (
          <div key={c.gene} className="flex flex-col gap-4">
            <span className="flex gap-8 items-baseline flex-wrap">
              <Link to={`/gene/${c.gene}`} className="text-13 mono link-muted underline underline-offset-2">{c.gene}</Link>
              <span className="label">{c.n} variantes</span>
              {c.patogenicas > 0 && (
                <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[1])}>
                  {c.patogenicas} patogênica{c.patogenicas > 1 ? 's' : ''}
                </span>
              )}
            </span>
            <ul className="gene-detalhe">
              {c.variantes.slice(0, 6).map((v, i) => <LinhaVariante key={i} v={v} />)}
            </ul>
          </div>
        ))}
      </article>

      {termos?.length > 0 && (
        <article className="card flex flex-col gap-12">
          <span className="flex items-baseline justify-between gap-16 flex-wrap">
            <h3 className="text-16 font-medium text-text">Genes que combinam com o quadro clínico</h3>
            <span className="label">{termos.join(', ')}</span>
          </span>
          <p className="text-12 leading-snug about-left">
            A concordância é entre o termo digitado e o texto das condições associadas ao gene, pelo
            ClinVar e pelo ClinGen. Serve para ordenar uma lista longa, não para concluir: termo
            ausente da base não significa fenótipo ausente do paciente, e sobreposição de texto não
            é sobreposição de significado.
          </p>
          {fenotipo.length === 0 && (
            <p className="text-13">Nenhum gene com condição que contenha esses termos.</p>
          )}
          <ul className="flex flex-col gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {fenotipo.map((g) => (
              <li key={g.gene} className="flex flex-col gap-2">
                <span className="flex gap-8 items-baseline flex-wrap">
                  <Link to={`/gene/${g.gene}`} className="text-13 mono link-muted underline underline-offset-2">{g.gene}</Link>
                  <span className="label">
                    {g.casados.length} de {termos.length} termos
                  </span>
                  {g.patogenicas > 0 && (
                    <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[1])}>
                      {g.patogenicas} patogênica{g.patogenicas > 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="label">{g.variantes.length} variantes</span>
                </span>
                <span className="text-12 text-muted">{g.textos.join('; ')}</span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {!temTrio && (
        <p className="text-12 leading-snug flex items-start gap-8">
          <Icon name="info" size="sm" className="text-muted mt-2" />
          <span>
            Com um VCF de trio, indicando quem é a criança e quem são os pais, esta seção passa a
            mostrar variantes de novo, recessivas herdadas dos dois lados e composto em trans
            confirmado.
          </span>
        </p>
      )}
    </div>
  )
}
