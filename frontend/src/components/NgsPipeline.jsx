import { useEffect, useState } from 'react'
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
    exemplo: { titulo: 'Não é arquivo', texto: 'Esta etapa não gera arquivo: gera a biblioteca física que entra no sequenciador. O que existe aqui é protocolo de bancada, e a decisão de capturar exoma ou sequenciar o genoma inteiro é tomada agora.' },
    formato: 'DNA',
    titulo: 'Extração e biblioteca',
    carrega: 'Fragmentos de DNA com adaptadores nas pontas. Em exoma, uma etapa de captura enriquece só as regiões que codificam proteína, cerca de 1% do genoma.',
    perde: 'A escolha aqui define o que existirá no fim: o que não foi capturado não aparece em nenhum arquivo adiante.',
  },
  {
    slot: 2, icone: 'terminal', arquivo: 'FASTQ',
    exemplo: { titulo: 'Quatro linhas por leitura', texto: 'Identificador, sequência, um separador e a qualidade de cada base codificada em ASCII. O caractere I vale Q40, ou uma chance em dez mil de a base estar errada.', codigo: '@A00627:18:HGV7TDSXX:4:1101:5764:1000 1:N:0:ATCACG\nGATCGGAAGAGCACACGTCTGAACTCCAGTCACATCACGATCTCGTATGC\n+\nFFFFFFFFFFFFFFFFFF:FFFFFFFFFFF,FFFFFFFFF:FFFFFFFFF' },
    formato: '.fastq.gz',
    titulo: 'Sequenciamento',
    carrega: 'Leituras curtas, tipicamente de 100 a 150 bases, cada uma com a qualidade estimada de cada base em escala Phred. Um exoma gera dezenas de milhões delas.',
    perde: 'Nenhuma leitura sabe de onde veio: o arquivo é uma pilha de pedaços sem posição no genoma.',
  },
  {
    slot: 3, icone: 'chart-bar', arquivo: 'BAM ou CRAM',
    exemplo: { titulo: 'Uma linha por leitura alinhada', texto: 'O BAM é a forma binária deste texto. Cada leitura traz a posição na referência, a qualidade de mapeamento e o CIGAR, que descreve como ela encaixa: 50M significa 50 bases casadas em sequência.', codigo: 'A00627:18:HGV7TDSXX:4:1101:5764:1000\t99\tchr11\t5227001\t60\t50M\t=\t5227180\t229\nGATCGGAAGAGCACACGTCTGAACTCCAGTCACATCACGATCTCGTATGC\tFFFFFFFF...\tNM:i:1\tMD:Z:1A48' },
    formato: '.bam / .cram',
    titulo: 'Alinhamento',
    carrega: 'Cada leitura recebe uma posição na referência, uma qualidade de mapeamento e o registro de onde ela diverge. É aqui que nasce a profundidade: quantas leituras cobrem cada base.',
    perde: 'Regiões repetitivas recebem leituras que poderiam vir de vários lugares, e a qualidade de mapeamento baixa marca essa incerteza.',
  },
  {
    slot: 4, icone: 'filter', arquivo: 'VCF',
    exemplo: { titulo: 'Uma linha por posição variante', texto: 'As oito colunas fixas, e depois o genótipo por amostra. Aqui, 0/1 na profundidade 54 com qualidade 1284: heterozigoto bem sustentado.', codigo: '##fileformat=VCFv4.2\n##reference=GRCh38\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tAMOSTRA\n11\t5227002\trs334\tT\tA\t1284.7\tPASS\tDP=54\tGT:DP:GQ\t0/1:54:99' },
    formato: '.vcf / .vcf.gz',
    titulo: 'Chamada de variantes',
    carrega: 'Uma linha por posição que difere da referência, com o alelo observado, a qualidade da chamada, o genótipo e a profundidade. O resto do genoma, que é a maior parte, fica de fora.',
    perde: 'A leitura individual some. O VCF diz que a posição difere e com que confiança, não mostra as leituras que sustentaram a conclusão.',
  },
  {
    slot: 5, icone: 'sparkle', arquivo: 'VCF anotado',
    exemplo: { titulo: 'O mesmo VCF, com o campo INFO crescido', texto: 'A anotação não muda as colunas: acrescenta chaves ao INFO. Aqui, o gene, a consequência na proteína, a frequência na gnomAD e a classificação do ClinVar.', codigo: '11\t5227002\trs334\tT\tA\t1284.7\tPASS\tDP=54;ANN=A|missense_variant|MODERATE|HBB|ENSG00000244734|p.Glu7Val;gnomAD_AF=0.0104;CLNSIG=Pathogenic\tGT:DP:GQ\t0/1:54:99' },
    formato: '.vcf anotado',
    titulo: 'Anotação',
    carrega: 'Cada variante ganha contexto: em que gene cai, que consequência tem na proteína, com que frequência aparece em populações e o que bases clínicas já registraram sobre ela.',
    perde: 'Nada é perdido; o que se acrescenta depende inteiramente de quais bases foram consultadas e de quando elas foram atualizadas.',
  },
]

export default function NgsPipeline() {
  const [aberto, setAberto] = useState(null)
  const [fechando, setFechando] = useState(false)

  function fechar() {
    setFechando(true)
    setTimeout(() => { setAberto(null); setFechando(false) }, 160)
  }

  // Escape fecha, como em qualquer sobreposição. O foco não é preso porque a
  // janela não tem controle além do fechar: prender foco num diálogo de leitura
  // atrapalha mais do que ajuda.
  useEffect(() => {
    if (!aberto) return
    const t = (e) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', t)
    return () => document.removeEventListener('keydown', t)
  }, [aberto])

  return (
    <>
      <ol className="ngs-fluxo" aria-label="Do sequenciamento ao VCF">
        {ETAPAS.map((e) => (
          <li key={e.arquivo} className="ngs-etapa">
            <span className="ngs-trilho" aria-hidden="true">
              <span className="ngs-marca" style={seriesStyle(e.slot)}>
                <Icon name={e.icone} size="md" />
              </span>
            </span>

            <button
              type="button"
              className="card-glass glass-frost tint-series ngs-cartao"
              style={seriesStyle(e.slot)}
              onClick={() => setAberto(e)}
              aria-haspopup="dialog"
            >
              <span className="ngs-cabeca">
                <span className="flex items-baseline gap-8 flex-wrap">
                  <span className="text-16 font-medium text-text">{e.arquivo}</span>
                  <span className="text-12 mono">{e.formato}</span>
                </span>
                <span className="label">{e.titulo}</span>
                <span className="label ngs-ver">Ver exemplo <Icon name="chevron-right" className="icon-sm" /></span>
              </span>

              <span className="text-13 leading-snug about-left">{e.carrega}</span>

              <span className="text-12 leading-snug about-left ngs-perde">
                <Icon name="minus" className="text-muted" />
                <span>{e.perde}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {aberto && (
        <div
          className={`overlay motion-modal ${fechando ? 'is-closing' : 'is-open'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ngs-dialogo"
          onClick={(ev) => { if (ev.target === ev.currentTarget) fechar() }}
        >
          <article className="card-glass glass-frost ngs-janela" style={seriesStyle(aberto.slot)}>
            <header className="flex items-start justify-between gap-16">
              <span className="flex flex-col gap-4">
                <span className="label">{aberto.titulo}</span>
                <span className="flex items-baseline gap-8 flex-wrap">
                  <h3 id="ngs-dialogo" className="section-title">{aberto.arquivo}</h3>
                  <span className="text-12 mono">{aberto.formato}</span>
                </span>
              </span>
              <button type="button" className="pill pill-sm hit" onClick={fechar} aria-label="Fechar">
                <Icon name="close" />
              </button>
            </header>

            <p className="text-14 font-medium text-text">{aberto.exemplo.titulo}</p>
            <p className="text-13 leading-snug about-left">{aberto.exemplo.texto}</p>

            {aberto.exemplo.codigo && (
              <pre className="code-block code-wrap text-12 mono" style={{ margin: 0 }}>{aberto.exemplo.codigo}</pre>
            )}

            <p className="text-12 leading-snug about-left ngs-perde">
              <Icon name="minus" className="text-muted" />
              <span>{aberto.perde}</span>
            </p>
          </article>
        </div>
      )}
    </>
  )
}
