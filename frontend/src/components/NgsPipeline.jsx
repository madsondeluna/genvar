import Icon from './Icon'
import { seriesStyle } from '../utils/seriesSlot'

// Do sequenciamento ao VCF, com o que cada arquivo carrega e o que ele perde.
//
// A cadeia é a mesma em qualquer laboratório, e entendê-la explica o que o VCF
// pode e não pode responder: ele guarda as posições em que a amostra difere da
// referência, e nada sobre as posições em que ela é igual. É por isso que um
// VCF não prova ausência de variante, só registra presença.
const ETAPAS = [
  {
    slot: 1, icone: 'molecule', arquivo: 'Amostra',
    formato: 'DNA',
    titulo: 'Extração e biblioteca',
    carrega: 'Fragmentos de DNA com adaptadores nas pontas. Em exoma, uma etapa de captura enriquece só as regiões que codificam proteína, cerca de 1% do genoma.',
    perde: 'A escolha aqui define o que existirá no fim: o que não foi capturado não aparece em nenhum arquivo adiante.',
  },
  {
    slot: 2, icone: 'terminal', arquivo: 'FASTQ',
    formato: '.fastq.gz',
    titulo: 'Sequenciamento',
    carrega: 'Leituras curtas, tipicamente de 100 a 150 bases, cada uma com a qualidade estimada de cada base em escala Phred. Um exoma gera dezenas de milhões delas.',
    perde: 'Nenhuma leitura sabe de onde veio: o arquivo é uma pilha de pedaços sem posição no genoma.',
  },
  {
    slot: 3, icone: 'chart-bar', arquivo: 'BAM ou CRAM',
    formato: '.bam / .cram',
    titulo: 'Alinhamento',
    carrega: 'Cada leitura recebe uma posição na referência, uma qualidade de mapeamento e o registro de onde ela diverge. É aqui que nasce a profundidade: quantas leituras cobrem cada base.',
    perde: 'Regiões repetitivas recebem leituras que poderiam vir de vários lugares, e a qualidade de mapeamento baixa marca essa incerteza.',
  },
  {
    slot: 4, icone: 'filter', arquivo: 'VCF',
    formato: '.vcf / .vcf.gz',
    titulo: 'Chamada de variantes',
    carrega: 'Uma linha por posição que difere da referência, com o alelo observado, a qualidade da chamada, o genótipo e a profundidade. O resto do genoma, que é a maior parte, fica de fora.',
    perde: 'A leitura individual some. O VCF diz que a posição difere e com que confiança, não mostra as leituras que sustentaram a conclusão.',
  },
  {
    slot: 5, icone: 'sparkle', arquivo: 'VCF anotado',
    formato: '.vcf anotado',
    titulo: 'Anotação',
    carrega: 'Cada variante ganha contexto: em que gene cai, que consequência tem na proteína, com que frequência aparece em populações e o que bases clínicas já registraram sobre ela.',
    perde: 'Nada é perdido; o que se acrescenta depende inteiramente de quais bases foram consultadas e de quando elas foram atualizadas.',
  },
]

export default function NgsPipeline() {
  return (
    <ol className="ngs-fluxo" aria-label="Do sequenciamento ao VCF">
      {ETAPAS.map((e, i) => (
        <li key={e.arquivo} className="ngs-etapa">
          {/* haste vertical entre as etapas: fluxo é coluna e não tela livre,
              porque rearranjo livre exige posição absoluta por nó e medida a
              cada quadro, e a cadeia aqui tem ordem fixa mesmo */}
          <span className="ngs-trilho" aria-hidden="true">
            <span className="ngs-marca" style={seriesStyle(e.slot)}>
              <Icon name={e.icone} size="md" />
            </span>
          </span>

          <article
            className="card-glass glass-frost tint-series ngs-cartao"
            style={seriesStyle(e.slot)}
          >
            <span className="ngs-cabeca">
              <span className="flex items-baseline gap-8 flex-wrap">
                <h3 className="text-16 font-medium text-text">{e.arquivo}</h3>
                <span className="text-12 mono">{e.formato}</span>
              </span>
              <span className="label">{e.titulo}</span>
            </span>

            <p className="text-13 leading-snug about-left">{e.carrega}</p>

            <p className="text-12 leading-snug about-left ngs-perde">
              <Icon name="minus" className="text-muted" />
              <span>{e.perde}</span>
            </p>
          </article>
        </li>
      ))}
    </ol>
  )
}
