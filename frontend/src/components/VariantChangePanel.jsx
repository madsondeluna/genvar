import { ArrowRight } from 'lucide-react'
import { parseProteinChange } from '../utils/protein'
import { formatConsequence } from '../utils/format'

const KIND_LABEL = {
  missense: 'Troca de aminoácido (missense)',
  nonsense: 'Códon de parada prematuro (nonsense)',
  synonymous: 'Sinônima: o aminoácido não muda',
  frameshift: 'Mudança de matriz de leitura (frameshift)',
}

const KIND_TONE = {
  missense: 'amber',
  nonsense: 'red',
  synonymous: 'green',
  frameshift: 'red',
}

const TONES = {
  neutral: 'bg-gray-50 border-gray-200 text-gray-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  green: 'bg-green-50 border-green-200 text-green-800',
}

function Box({ caption, value, sub, tone = 'neutral' }) {
  return (
    <div className={`flex-1 min-w-[120px] rounded-md border p-3 ${TONES[tone]}`}>
      <p className="text-xs uppercase tracking-wide opacity-70 mb-1">{caption}</p>
      <p className="text-lg font-bold tracking-tight font-mono">{value}</p>
      {sub && <p className="text-xs opacity-80 mt-0.5">{sub}</p>}
    </div>
  )
}

function ChangeRow({ refValue, refSub, altValue, altSub, altTone }) {
  return (
    <div className="flex items-stretch gap-2">
      <Box caption="Referência" value={refValue} sub={refSub} tone="neutral" />
      <div className="flex items-center text-gray-400" aria-hidden="true">
        <ArrowRight className="w-5 h-5" />
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
    <section className="card-flat" aria-labelledby="change-title">
      <h3 id="change-title" className="section-title">O que a variante muda</h3>
      <p className="text-xs text-gray-600 mb-4">
        Comparação entre a sequência de referência e a variante, no DNA e, quando se aplica, na
        proteína. A referência é a forma mais comum na população; a variante é a alteração descrita
        por este rs ID.
      </p>

      <div className="flex flex-col gap-5">
        {hasDna && (
          <div>
            <p className="label mb-2">No DNA (base nitrogenada)</p>
            <ChangeRow
              refValue={data.ref_allele}
              altValue={data.alt_allele}
              altTone="amber"
            />
            <p className="text-xs text-gray-500 mt-2">
              Posição chr{data.chromosome}:{data.position?.toLocaleString('pt-BR')}. A base{' '}
              {data.ref_allele} é trocada por {data.alt_allele}.
            </p>
          </div>
        )}

        {change && change.kind !== 'frameshift' && change.wt && (
          <div>
            <p className="label mb-2">Na proteína (aminoácido)</p>
            {change.kind === 'synonymous' ? (
              <div className={`rounded-md border p-3 ${TONES.green}`}>
                <p className="text-sm font-medium">
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
            <p className="text-xs text-gray-500 mt-2">
              {KIND_LABEL[change.kind]}
              {data.amino_acid_change ? ` (${data.amino_acid_change})` : ''}.
            </p>
          </div>
        )}

        {change && change.kind === 'frameshift' && (
          <div>
            <p className="label mb-2">Na proteína (aminoácido)</p>
            <div className={`rounded-md border p-3 ${TONES.red}`}>
              <p className="text-sm font-medium">
                A leitura da proteína sai do lugar a partir do resíduo {change.pos ?? '?'}, alterando
                toda a sequência seguinte.
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Mudança de matriz de leitura (frameshift)
              {data.amino_acid_change ? ` (${data.amino_acid_change})` : ''}.
            </p>
          </div>
        )}

        {!change && (
          <p className="text-xs text-gray-500">
            Esta variante não altera diretamente um aminoácido. Efeito previsto:{' '}
            {formatConsequence(data.consequence || data.most_severe_consequence)}.
          </p>
        )}
      </div>
    </section>
  )
}
