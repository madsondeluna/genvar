import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

// Gráficos do relatório de VCF.
//
// Duas coisas que faltavam e que decidem se o desenho informa ou decora: os
// eixos e a leitura de cada barra. Um histograma sem eixo é uma silhueta, e o
// número que ele guarda só aparecia no `title` do navegador, que não existe no
// teclado nem no leitor de tela.
//
// A interação é uma só, e ela serve ponteiro e teclado com o mesmo mecanismo:
// cada barra é um botão focável, e apontar ou tabular para ela escreve numa
// linha de leitura acima do gráfico. Não há balão que segue o cursor, porque
// balão de hover não tem equivalente de teclado.
//
// Cor: a barra usa `--chart-n`, o rótulo de eixo nunca. Slot de série tem
// contraste de marca, não de texto (`--chart-2` dá 3,38:1), então tudo que se
// lê fica em `--muted`.

const fmt = (n) => n.toLocaleString('pt-BR')
// Borda de faixa: decimal com vírgula, e sem casa nenhuma quando é inteiro.
const dec = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

// Rótulo de eixo compacto: 12.400 vira 12,4 mil, para caber no gutter.
function curto(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} mi`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',')} mil`
  return fmt(n)
}

export function Histograma({ h, slot, unidade = '', rotuloX, rotuloY = 'variantes' }) {
  const [ativo, setAtivo] = useState(null)
  const id = useId()
  if (!h.n) return <p className="text-12">O arquivo não traz esse campo.</p>

  const max = Math.max(...h.faixas.map((f) => f.n))
  const f = ativo != null ? h.faixas[ativo] : null
  const total = h.n

  return (
    <figure className="grafico" style={{ margin: 0 }}>
      <figcaption className="grafico-leitura" id={`${id}-leitura`} aria-live="polite">
        {f ? (
          <>
            <span className="mono text-text">{dec(f.de)}–{dec(f.ate)}{unidade}</span>
            <span className="text-muted">
              {fmt(f.n)} {rotuloY} ({((f.n / total) * 100).toFixed(1).replace('.', ',')}%)
            </span>
          </>
        ) : (
          <span className="text-muted">Aponte ou tabule uma barra para ler a faixa</span>
        )}
      </figcaption>

      <div className="grafico-corpo">
        <div className="grafico-eixo-y" aria-hidden="true">
          <span>{curto(max)}</span>
          <span>{curto(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div className="grafico-area">
          <div className="grafico-grade" aria-hidden="true" />
          <div className="histo" role="group" aria-describedby={`${id}-leitura`}>
            {h.faixas.map((faixa, i) => (
              <button
                key={faixa.de}
                type="button"
                className={`histo-barra ${ativo === i ? 'is-ativo' : ''}`}
                style={{ '--h': `${max ? (faixa.n / max) * 100 : 0}%`, '--cor': `var(--chart-${slot})` }}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
              >
                <span className="sr-only">
                  {dec(faixa.de)} a {dec(faixa.ate)}{unidade}: {fmt(faixa.n)} {rotuloY}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grafico-eixo-x" aria-hidden="true">
        <span>{dec(h.faixas[0].de)}{unidade}</span>
        <span>{dec(h.faixas[Math.floor(h.faixas.length / 2)].de)}{unidade}</span>
        <span>{dec(h.faixas[h.faixas.length - 1].ate)}{unidade}</span>
      </div>

      <p className="grafico-legenda">
        Eixo horizontal: {rotuloX}. Eixo vertical: número de {rotuloY} em cada faixa.
        {h.mediana != null && <> Mediana {h.mediana.toFixed(1).replace('.', ',')}{unidade}.</>}
      </p>
    </figure>
  )
}

// Barras horizontais nomeadas (cromossomo, filtro, zigosidade, gene). Aqui o
// eixo vertical é a própria lista de rótulos, então o que faltava era só o
// horizontal: a barra dizia "maior que a outra" sem dizer maior em quê.
export function BarrasNomeadas({ itens, max, slot, rotuloX, total = null, colunaRotulo = '8rem', href = null }) {
  const [ativo, setAtivo] = useState(null)
  const id = useId()
  // Vazio é um desenho próprio, e não um gráfico com eixo de 0 a 1: o eixo
  // desenhado sobre nada afirma uma escala que não existe.
  if (!itens.length) {
    return <p className="text-12">Nada a mostrar: nenhuma linha entrou nesta contagem.</p>
  }
  const topo = max ?? Math.max(1, ...itens.map((i) => i.n))
  const a = ativo != null ? itens[ativo] : null

  return (
    <figure className="grafico" style={{ margin: 0 }}>
      <figcaption className="grafico-leitura" id={`${id}-leitura`} aria-live="polite">
        {a ? (
          <>
            <span className="mono text-text">{a.rotulo}</span>
            <span className="text-muted">
              {fmt(a.n)} {rotuloX}
              {total ? ` (${((a.n / total) * 100).toFixed(1).replace('.', ',')}% do arquivo)` : ''}
            </span>
          </>
        ) : (
          <span className="text-muted">Aponte ou tabule uma linha para ler o valor</span>
        )}
      </figcaption>

      <ul className="barras" aria-describedby={`${id}-leitura`}>
        {itens.map((it, i) => (
          <li key={it.rotulo} className="barras-linha" style={{ '--col': colunaRotulo }}>
            {href ? (
              <Link to={href(it)} className="text-12 mono link-muted underline underline-offset-2 truncate">{it.rotulo}</Link>
            ) : (
              <span className="text-12 mono truncate">{it.rotulo}</span>
            )}
            <button
              type="button"
              className={`barra-alvo ${ativo === i ? 'is-ativo' : ''}`}
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
            >
              <span
                className="barra-preenche"
                style={{ '--w': `${(it.n / topo) * 100}%`, '--cor': `var(--chart-${it.slot ?? slot})` }}
              />
              <span className="sr-only">{it.rotulo}: {fmt(it.n)} {rotuloX}</span>
            </button>
            <span className="text-12 mono num">{fmt(it.n)}</span>
          </li>
        ))}
      </ul>

      <div className="grafico-eixo-x grafico-eixo-x-recuado" style={{ '--col': colunaRotulo }} aria-hidden="true">
        <span>0</span>
        <span>{curto(Math.round(topo / 2))}</span>
        <span>{curto(topo)}</span>
      </div>

      <p className="grafico-legenda">Eixo horizontal: {rotuloX}.</p>
    </figure>
  )
}
