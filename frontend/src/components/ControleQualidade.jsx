import { useMemo } from 'react'
import Icon from './Icon'
import { Histograma, BarrasNomeadas } from './Grafico'
import { balancoAlelico, titvSeparado, verificarSexo, AB_MIN, AB_MAX } from '../vcf/metricas'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const dec = (n, c = 2) => (n == null ? '—' : n.toFixed(c).replace('.', ','))
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1).replace('.', ',')}%`)

// Controles que dizem se o arquivo presta, e que não dependem de base externa
// nenhuma. Balanço alélico, Ti/Tv separado e verificação de sexo: os três são
// derivados do próprio VCF e os três pegam classes de erro que a contagem de
// variantes não pega.
export default function ControleQualidade({ variantes }) {
  const ab = useMemo(() => balancoAlelico(variantes), [variantes])
  const titv = useMemo(() => titvSeparado(variantes), [variantes])
  const sexo = useMemo(() => verificarSexo(variantes), [variantes])

  const abRuim = ab.n > 0 && ab.fracaoDesviada > 0.1
  const novasRuim = titv.novas.titv != null && titv.novas.titv < 1.5

  return (
    <div className="grid gap-16 about-cards">
      <article className="card flex flex-col gap-12">
        <span className="flex items-baseline justify-between gap-8 flex-wrap">
          <h3 className="text-16 font-medium text-text">Balanço alélico dos heterozigotos</h3>
          <span className="label">
            {ab.n ? `mediana ${dec(ab.mediana)}` : 'O arquivo não traz AD'}
          </span>
        </span>
        <p className="text-12 leading-snug about-left">
          Fração das leituras que trazem o alelo alternativo. Heterozigoto verdadeiro fica perto de
          0,5, porque as duas cópias do cromossomo são lidas igualmente. Abaixo de {dec(AB_MIN)}
          {' '}costuma ser artefato de alinhamento ou contaminação; acima de {dec(AB_MAX)} num
          heterozigoto costuma ser perda do alelo de referência, que é sinal de deleção na região.
        </p>
        {ab.n > 0 ? (
          <>
            <Histograma
              h={{ faixas: ab.faixas, n: ab.n, mediana: ab.mediana }}
              slot={3}
              rotuloX="fração de leituras com o alelo alternativo"
            />
            <p className={`text-12 leading-snug ${abRuim ? 'text-text' : ''}`}>
              {fmt(ab.desviados)} de {fmt(ab.n)} heterozigotos ({pct(ab.fracaoDesviada)}) estão fora
              da faixa de {dec(AB_MIN)} a {dec(AB_MAX)}.
              {abRuim && ' Acima de 10% a distribuição não é a de uma amostra limpa.'}
            </p>
          </>
        ) : (
          <p className="text-13">
            O campo <span className="mono">AD</span> não está no arquivo, e sem ele não há como
            contar leituras por alelo. É opcional no formato, e alguns chamadores o omitem.
          </p>
        )}
      </article>

      <article className="card flex flex-col gap-12">
        <h3 className="text-16 font-medium text-text">Ti/Tv separado por catalogação</h3>
        <p className="text-12 leading-snug about-left">
          A razão global esconde o que interessa. Variante já depositada no dbSNP quase sempre tem
          Ti/Tv bom, porque passou pelo crivo de já ter sido vista antes; o ruído de chamada se
          concentra nas novas. Um arquivo com razão global boa e razão de variante nova em 1,1 tem
          problema, e só esta separação mostra.
        </p>
        <BarrasNomeadas
          itens={[
            { rotulo: 'Já no dbSNP', n: titv.conhecidas.n, slot: 3 },
            { rotulo: 'Novas', n: titv.novas.n, slot: 6 },
          ]}
          total={titv.conhecidas.n + titv.novas.n}
          slot={1}
          colunaRotulo="8rem"
          rotuloX="substituições"
        />
        <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {[
            ['Ti/Tv das conhecidas', dec(titv.conhecidas.titv), `${fmt(titv.conhecidas.n)} variantes`],
            ['Ti/Tv das novas', dec(titv.novas.titv), `${fmt(titv.novas.n)} variantes`],
          ].map(([k, v, n]) => (
            <li key={k} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: 'minmax(0,11rem) auto 1fr' }}>
              <span className="label">{k}</span>
              <span className="text-16 mono num text-text">{v}</span>
              <span className="label">{n}</span>
            </li>
          ))}
        </ul>
        {novasRuim && (
          <p className="text-12 leading-snug">
            A razão das variantes novas está em {dec(titv.novas.titv)}. Abaixo de 1,5 a fração de
            chamada falsa entre elas é alta, e é justamente entre as novas que estaria um achado
            inédito.
          </p>
        )}
      </article>

      <article className="card flex flex-col gap-12">
        <span className="flex items-baseline justify-between gap-8 flex-wrap">
          <h3 className="text-16 font-medium text-text">Verificação de sexo cromossômico</h3>
          {sexo.inferido && <span className="tag mono">{sexo.inferido}</span>}
        </span>
        <p className="text-12 leading-snug about-left">
          Pega troca de amostra, que é o erro mais banal e mais grave de um laboratório. Dois sinais
          independentes decidem, e é a concordância entre eles que dá a resposta: heterozigose no X
          fora das regiões pseudoautossômicas, onde um XY tem uma cópia só, e presença de variante
          no Y.
        </p>
        <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {[
            ['Variantes no X', fmt(sexo.xTotal), 'fora das regiões pseudoautossômicas'],
            ['Heterozigose no X', pct(sexo.fracaoHetX), `${fmt(sexo.xHet)} heterozigotas`],
            ['Variantes no Y', fmt(sexo.yVariantes), sexo.yVariantes >= 5 ? 'Y presente' : 'Y ausente ou residual'],
          ].map(([k, v, n]) => (
            <li key={k} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: 'minmax(0,10rem) auto 1fr' }}>
              <span className="label">{k}</span>
              <span className="text-13 mono num text-text">{v}</span>
              <span className="label">{n}</span>
            </li>
          ))}
        </ul>
        {!sexo.inferido && (
          <p className="text-12 leading-snug flex items-start gap-8">
            <Icon name="alert" size="sm" className="text-muted mt-2" />
            <span>
              {sexo.motivo}
              {sexo.discordante && ' Discordância entre os dois sinais aponta contaminação entre amostras, '
                + 'anomalia de número de cromossomos sexuais, ou troca de amostra. Nenhuma das três '
                + 'se resolve neste arquivo.'}
            </span>
          </p>
        )}
      </article>
    </div>
  )
}
