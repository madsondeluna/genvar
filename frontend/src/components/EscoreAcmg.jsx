import { PONTOS, FAIXAS, TETO, PISO } from '../vcf/acmg'
import { CRITERIOS } from '../vcf/interpretacao'

// Régua do escore de evidência ACMG.
//
// O desenho tem uma regra que decide tudo o mais: a régua mostra ONDE o escore
// caiu, e nunca o NOME da faixa em que ele caiu. A diferença não é de estilo. A
// regra ACMG/AMP combina 28 critérios e este módulo avalia sete; imprimir
// "Significado incerto" a partir de sete seria uma classificação clínica
// fabricada, e a mais fácil de fabricar por acidente: PM2 sozinho, que é uma
// consulta de frequência, pontua +2 e cai exatamente nessa janela.
//
// Então as faixas aparecem como marcas na régua, sem rótulo, e o que se lê em
// texto é o número, o lado e quantos critérios ficaram de fora.

// Cor do MARCADOR e do rótulo do lado. São tokens de estado, porque é estado o
// que eles comunicam; o trilho da régua usa a paleta divergente de dados. A
// linguagem separa as duas famílias e não deixa uma ocupar o papel da outra.
const COR = {
  patogenica: 'var(--status-critical)',
  benigna: 'var(--status-good)',
  // Evidência insuficiente é um estado, e `--muted` é cor de texto apagado, não
  // de estado: num marcador ela lê como "desligado" em vez de "inconclusivo".
  incerta: 'var(--status-warning)',
  neutra: 'var(--status-warning)',
}

const LADO = {
  patogenica: 'evidência patogênica',
  benigna: 'evidência benigna',
  incerta: 'evidência insuficiente',
  neutra: 'evidência insuficiente',
}

// Fronteiras internas das faixas, como fração da régua. São as marcas de escala:
// sem elas o número não tem referência nenhuma.
const MARCAS = FAIXAS
  .map((f) => f.de)
  .filter((p) => Number.isFinite(p) && p > PISO && p <= TETO)
  .map((p) => ({ pontos: p, fracao: (p - PISO) / (TETO - PISO) }))

export default function EscoreAcmg({ escore, criterios = [], compacto = false }) {
  if (!escore) return null
  const { pontos, direcao, avaliados, naoAvaliados, naoVerificados, fracao } = escore
  const cor = COR[direcao] || COR.incerta
  const sinal = pontos > 0 ? '+' : ''

  return (
    // A régua e os rótulos das pontas dividem a mesma largura máxima: soltos, a
    // régua parava no meio do cartão e "benigna" e "patogênica" ficavam nas
    // bordas, rotulando extremidades que não eram as dela.
    <div className={`flex flex-col ${compacto ? 'gap-4' : 'gap-8'}`}
      style={compacto ? undefined : { maxWidth: 'var(--measure-wide)' }}>
      <span className="flex items-baseline gap-8">
        <span className="mono num text-16 text-text">{sinal}{pontos}</span>
        <span className="text-12" style={{ color: cor }}>{LADO[direcao]}</span>
        {naoVerificados?.length > 0 && (
          <span className="label" style={{ color: 'var(--status-warning)' }}
            title={`${naoVerificados.join(', ')}: a evidência do critério não foi verificada por completo`}>
            contém critério não verificado
          </span>
        )}
      </span>

      {/* Régua de PISO a TETO, com o marcador na posição do escore. As marcas
          são as fronteiras das faixas, sem nome: elas dão escala ao número. */}
      <span className="escore-regua" role="img"
        aria-label={`${sinal}${pontos} pontos de ${LADO[direcao]}, `
          + `${avaliados} critérios avaliados e ${naoAvaliados} não avaliados`}>
        {MARCAS.map((m) => (
          <span key={m.pontos} className="escore-marca" style={{ left: `${m.fracao * 100}%` }} />
        ))}
        <span className="escore-ponto"
          style={{ left: `${Math.min(1, Math.max(0, fracao)) * 100}%`, background: cor }} />
      </span>

      {/* LEGENDA, sempre, inclusive na forma compacta, e DEPOIS das pontas da
          escala, para o texto explicar o que já está desenhado. Um número
          sozinho numa célula de tabela é a forma mais fácil de o escore ser
          lido como nota de classificação: quem vê "+10" ao lado de uma variante
          não tem como saber que ele sai de dois critérios de 28 se ninguém
          disser. */}
      {compacto ? (
        <span className="label" style={{ lineHeight: 'var(--leading-snug)' }}>
          Parcial: {avaliados} de {escore.computaveis} critérios, {naoAvaliados} não avaliados
        </span>
      ) : (
        <>
          <span className="flex justify-between label">
            <span>benigna</span>
            <span>patogênica</span>
          </span>
          {criterios.length > 0 && (
            <span className="flex gap-4 flex-wrap">
              {criterios.map((c) => (
                <span key={c.id} className="tag tag-sm mono"
                  title={`${CRITERIOS[c.id]?.forca}: ${CRITERIOS[c.id]?.texto}`
                    + (c.ressalva ? `. Ressalva: ${c.ressalva}` : '')}>
                  {c.id} {PONTOS[c.id] > 0 ? '+' : ''}{PONTOS[c.id]}
                  {c.ressalva ? ' ·' : ''}
                </span>
              ))}
            </span>
          )}
          <span className="text-12">
            <strong className="text-text font-medium">Escore de evidência, não
            classificação.</strong> Soma os pontos do sistema bayesiano de Tavtigian,
            adotado pelo ClinGen: muito forte 8, forte 4, moderado 2, apoio 1, com sinal
            negativo para os critérios benignos. Aqui {avaliados} de {escore.computaveis} critérios
            computáveis dispararam, e outros {naoAvaliados} da regra ACMG/AMP não foram
            avaliados, porque exigem literatura, segregação familiar ou ensaio funcional.
            O escore serve para ordenar a fila de revisão e não nomeia a classe da variante.
          </span>
        </>
      )}
    </div>
  )
}
