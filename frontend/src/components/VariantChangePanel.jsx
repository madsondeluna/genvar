import Icon from './Icon'
import { parseProteinChange } from '../utils/protein'
import { formatConsequence } from '../utils/format'

const KIND_LABEL = {
  missense: 'Troca de aminoácido (missense)',
  nonsense: 'Códon de parada prematuro (nonsense)',
  synonymous: 'Sinônima: o aminoácido não muda',
  frameshift: 'Mudança de matriz de leitura (frameshift)',
}

// Severidade usa status: warning para troca, critical para truncagem, good para sinônima.
const KIND_TONE = {
  missense: 'warning',
  nonsense: 'critical',
  synonymous: 'good',
  frameshift: 'critical',
}

const TONE_CLASS = {
  neutral: 'tint-neutral',
  warning: 'tint-warning',
  critical: 'tint-critical',
  good: 'tint-good',
}

const TONE_INK = {
  neutral: 'var(--text)',
  warning: 'var(--state-warning)',
  critical: 'var(--state-critical)',
  good: 'var(--state-good)',
}

function Box({ caption, value, sub, tone = 'neutral' }) {
  return (
    <div className={`flex-1 rounded-media border p-12 ${TONE_CLASS[tone]}`} style={{ minWidth: 'calc(var(--photo-sm) * 1.25)' }}>
      <p className="label mb-4">{caption}</p>
      <p className="text-18 font-medium mono" style={{ color: TONE_INK[tone] }}>{value}</p>
      {sub && <p className="text-12 mt-2">{sub}</p>}
    </div>
  )
}

function ChangeRow({ refValue, refSub, altValue, altSub, altTone }) {
  return (
    <div className="flex items-stretch gap-8">
      <Box caption="Referência" value={refValue} sub={refSub} tone="neutral" />
      <div className="flex items-center text-muted" aria-hidden="true">
        <Icon name="arrow-right" size="md" />
      </div>
      <Box caption="Variante" value={altValue} sub={altSub} tone={altTone} />
    </div>
  )
}

export default function VariantChangePanel({ data }) {
  if (!data) return null
  const change = parseProteinChange(data.amino_acid_change)
  const hasDna = data.ref_allele && data.alt_allele

  return (
    <section className="card" aria-labelledby="change-title">
      <h3 id="change-title" className="section-title mb-8">O que a variante muda</h3>
      <p className="text-12 mb-16">
        Comparação entre a sequência de referência e a variante, no DNA e, quando se aplica, na
        proteína. A referência é a forma mais comum na população; a variante é a alteração descrita
        por este rs ID.
      </p>

      <div className="flex flex-col gap-20">
        {hasDna && (
          <div>
            <p className="label mb-8">No DNA (base nitrogenada)</p>
            <ChangeRow
              refValue={data.ref_allele}
              altValue={data.alt_allele}
              altTone="warning"
            />
            <p className="text-12 mt-8">
              Posição chr{data.chromosome}:{data.position?.toLocaleString('pt-BR')}. A base{' '}
              {data.ref_allele} é trocada por {data.alt_allele}.
            </p>
          </div>
        )}

        {change && change.kind !== 'frameshift' && change.wt && (
          <div>
            <p className="label mb-8">Na proteína (aminoácido)</p>
            {change.kind === 'synonymous' ? (
              <div className="rounded-media border p-12 tint-good">
                <p className="text-14 font-medium" style={{ color: 'var(--state-good)' }}>
                  O aminoácido permanece {change.wt.name} ({change.wt.three}) na posição {change.pos}.
                </p>
              </div>
            ) : (
              <ChangeRow
                refValue={`${change.wt.name} (${change.wt.three})`}
                refSub={`Posição ${change.pos}`}
                altValue={
                  change.mut.code === '*'
                    ? 'Parada (stop)'
                    : `${change.mut.name} (${change.mut.three})`
                }
                altSub={change.mut.code === '*' ? 'Proteína truncada' : `Posição ${change.pos}`}
                altTone={KIND_TONE[change.kind]}
              />
            )}
            <p className="text-12 mt-8">
              {KIND_LABEL[change.kind]}
              {data.amino_acid_change ? ` (${data.amino_acid_change})` : ''}.
            </p>
          </div>
        )}

        {change && change.kind === 'frameshift' && (
          <div>
            <p className="label mb-8">Na proteína (aminoácido)</p>
            <div className="rounded-media border p-12 tint-critical">
              <p className="text-14 font-medium" style={{ color: 'var(--state-critical)' }}>
                A leitura da proteína sai do lugar a partir do resíduo {change.pos ?? '?'}, alterando
                toda a sequência seguinte.
              </p>
            </div>
            <p className="text-12 mt-8">
              Mudança de matriz de leitura (frameshift)
              {data.amino_acid_change ? ` (${data.amino_acid_change})` : ''}.
            </p>
          </div>
        )}

        {!change && (
          <p className="text-12">
            Esta variante não altera diretamente um aminoácido. Efeito previsto:{' '}
            {formatConsequence(data.consequence || data.most_severe_consequence)}.
          </p>
        )}
      </div>
    </section>
  )
}
