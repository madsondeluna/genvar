import { useMemo, useState } from 'react'
import { Histograma, BarrasNomeadas } from './Grafico'
import TabelaVariantes from './TabelaVariantes'
import AchadosClinicos from './AchadosClinicos'
import Icon from './Icon'
import { histograma, porCromossomo, espectroSubstituicao, TITV_ESPERADO } from '../vcf/metricas'
import { seriesStyle } from '../utils/seriesSlot'

// Relatório do VCF. Tudo aqui é derivado do arquivo, sem rede: são as métricas
// que dizem se o conjunto presta antes de interpretar variante nenhuma.

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const pct = (n) => `${(n * 100).toFixed(1)}%`

function Ficha({ rotulo, valor, nota, slot }) {
  return (
    <div className="tint-series" style={seriesStyle(slot)}>
      <span className="text-24 mono num text-text leading-none">{valor}</span>
      <span className="text-12">{rotulo}</span>
      {nota && <span className="label">{nota}</span>}
    </div>
  )
}

export default function VcfReport({ dados, anotacao, resumoCli, vus, onCarregarVUS }) {
  const { meta, variantes, metricas, nome, tamanho, lidos, truncado, genesMapeados } = dados
  const [aba, setAba] = useState('clinica')
  const [pdf, setPdf] = useState('parado')  // parado | gerando | erro

  // A biblioteca de PDF pesa centenas de KB e entra por import dinâmico: quem
  // só olha o relatório na tela não paga por ela no carregamento da página.
  async function baixarPDF() {
    setPdf('gerando')
    try {
      const { gerarPDF } = await import('../vcf/pdf.jsx')
      const blob = await gerarPDF({ ...dados, porGene, dp, qual, cromo, resumoCli, anotacao })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nome.replace(/\.(vcf|gz|zip)$/gi, '')}-genvar.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setPdf('parado')
    } catch (e) {
      setPdf('erro')
    }
  }

  const dp = useMemo(() => histograma(variantes, 'dp'), [variantes])
  const qual = useMemo(() => histograma(variantes, 'qual'), [variantes])
  const cromo = useMemo(() => porCromossomo(variantes), [variantes])
  const espectro = useMemo(() => espectroSubstituicao(variantes), [variantes])
  const maxCromo = Math.max(1, ...cromo.map((c) => c.n))

  // Genes com mais variantes: a lista que responde "onde isso se concentra".
  const porGene = useMemo(() => {
    const c = {}
    for (const v of variantes) if (v.gene) c[v.gene] = (c[v.gene] || 0) + 1
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [variantes])

  const titv = metricas.titv
  const faixaExoma = TITV_ESPERADO.exoma
  const titvOk = titv != null && titv >= 1.5

  return (
    <>
      <section className="mb-96" aria-labelledby="rel-title">
        <h2 id="rel-title" className="section-title mb-8">Relatório</h2>
        <p className="text-14 leading-normal mb-24" style={{ maxWidth: 'var(--measure-wide)' }}>
          <span className="mono">{nome}</span>, {fmt(Math.round(tamanho / 1024))} KB.{' '}
          Referência <strong className="text-text font-medium">{meta.build}</strong>
          {meta.buildPresumido
            ? ', presumida: o cabeçalho não a declara e os contigs não permitem deduzi-la. GRCh38 é o padrão da indústria desde 2017 e o build de toda base pública corrente.'
            : meta.buildDeduzido
              ? ', deduzida do comprimento do cromossomo 1, porque o cabeçalho não a declara.'
              : ', declarada no cabeçalho.'}
          {meta.chamador && <> Chamador: <span className="mono">{meta.chamador}</span>.</>}
          {truncado && <> O arquivo excede o teto de leitura e o relatório cobre as primeiras {fmt(lidos)} linhas.</>}
        </p>

        <div className="card faixa-numeros glass-panel mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
          <Ficha slot={1} valor={fmt(metricas.total)} rotulo="variantes" nota={`${fmt(lidos)} linhas`} />
          <Ficha slot={2} valor={fmt(metricas.passa)} rotulo="passaram no filtro" nota={pct(metricas.total ? metricas.passa / metricas.total : 0)} />
          <Ficha slot={3} valor={titv ? titv.toFixed(2) : '—'} rotulo="razão Ti/Tv" nota={`exoma ${faixaExoma[0]}–${faixaExoma[1]}`} />
          <Ficha slot={4} valor={pct(metricas.fracaoConhecida)} rotulo="já no dbSNP" nota={`${fmt(metricas.comRsid)} com rsID`} />
          <Ficha slot={5} valor={fmt(meta.amostras.length)} rotulo="amostras" nota={meta.amostras.join(', ').slice(0, 20) || 'sem genótipo'} />
        </div>

        {meta.buildPresumido && genesMapeados && (
          <div className="card tint-warning mb-24 flex items-start gap-10">
            <Icon name="alert" className="text-muted mt-2" />
            <p className="text-13 leading-snug about-left">
              O arquivo <strong className="text-text font-medium">não diz</strong> contra qual
              genoma de referência foi chamado, e os contigs não permitem deduzir. O relatório
              seguiu em <span className="mono">GRCh38</span>, que é o padrão da indústria e o build
              do ClinVar, do gnomAD v4 e do Ensembl. Se o arquivo for GRCh37, o gene e a anotação
              por coordenada saem trocados: entre os dois builds o deslocamento chega a milhões de
              bases. O casamento por rsID não depende disso e continua válido nos dois casos.
            </p>
          </div>
        )}

        {!genesMapeados && (
          <div className="card tint-warning mb-24 flex items-start gap-10">
            <Icon name="alert" className="text-muted mt-2" />
            <p className="text-13 leading-snug about-left">
              O cruzamento com genes foi <strong className="text-text font-medium">desligado</strong> para
              este arquivo. As coordenadas de gene que o GenVar distribui são GRCh38, e este VCF
              está em <span className="mono">{meta.build}</span>.
              Entre GRCh37 e GRCh38 o deslocamento chega a milhões de bases: só no BRCA1 são
              1.847.983. Cruzar assim não erra por pouco, troca o gene inteiro, e gene errado com
              cara de certo é pior que gene nenhum. As métricas de qualidade abaixo não dependem
              do build e continuam válidas.
            </p>
          </div>
        )}

        {titv != null && !titvOk && (
          <div className="card tint-warning mb-24 flex items-start gap-10">
            <Icon name="alert" className="text-muted mt-2" />
            <p className="text-13 leading-snug about-left">
              A razão transição/transversão está em {titv.toFixed(2)}. Transversão é biologicamente
              mais rara que transição, então ruído de chamada puxa essa razão para baixo: valores
              abaixo de 1,5 costumam indicar chamada falsa em excesso. Exoma fica perto de 3,0 e
              genoma perto de 2,0.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-16 flex-wrap mb-16">
        <div className="flex flex-wrap gap-8" role="tablist" aria-label="Seções do relatório">
          {[['clinica', 'Achados clínicos'], ['qualidade', 'Qualidade'], ['distribuicao', 'Distribuição'], ['genes', 'Genes'], ['tabela', 'Variantes']].map(([k, r]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              className={`pill pill-sm ${aba === k ? 'pill-solid' : ''}`}
              onClick={() => setAba(k)}
            >
              {r}
            </button>
          ))}
        </div>

        <span className="flex items-center gap-12 flex-wrap">
          <button type="button" className="pill pill-solid" onClick={baixarPDF} disabled={pdf === 'gerando'}>
            <Icon name="download" />
            {pdf === 'gerando' ? 'Montando o PDF...' : 'Baixar relatório em PDF'}
          </button>
          {pdf === 'erro' && <span className="field-error" role="alert">Não foi possível montar o PDF.</span>}
        </span>
        </div>

        {aba === 'qualidade' && (
          <div className="grid gap-16 about-cards">
            <article className="card flex flex-col gap-12">
              <span className="flex items-baseline justify-between gap-8">
                <h3 className="text-16 font-medium text-text">Profundidade de leitura</h3>
                <span className="label">mediana {dp.mediana != null ? dp.mediana.toFixed(0) : '—'}×</span>
              </span>
              <p className="text-12 leading-snug about-left">
                Quantas leituras cobrem cada posição. Abaixo de 10× a chamada de heterozigoto fica
                pouco confiável: o alelo menos representado pode simplesmente não ter sido lido.
              </p>
              <Histograma h={dp} slot={1} unidade="×" rotuloX="profundidade de leitura, em número de leituras por posição" />
            </article>

            <article className="card flex flex-col gap-12">
              <span className="flex items-baseline justify-between gap-8">
                <h3 className="text-16 font-medium text-text">Qualidade da chamada</h3>
                <span className="label">mediana {qual.mediana != null ? qual.mediana.toFixed(0) : '—'}</span>
              </span>
              <p className="text-12 leading-snug about-left">
                Escala Phred: 30 significa uma chance em mil de a variante não existir; 20, uma em
                cem. O acúmulo de chamadas em qualidade baixa é o sinal mais direto de ruído.
              </p>
              <Histograma h={qual} slot={2} rotuloX="qualidade da chamada, em escala Phred" />
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Filtros do chamador</h3>
              <p className="text-12 leading-snug about-left">
                O que o programa que gerou o arquivo marcou como aprovado ou suspeito.
              </p>
              <BarrasNomeadas
                itens={Object.entries(metricas.filtros).sort((a, b) => b[1] - a[1]).slice(0, 6)
                  .map(([f, n]) => ({ rotulo: f === '.' ? 'sem filtro' : f, n, slot: f === 'PASS' ? 4 : 8 }))}
                max={metricas.total}
                total={metricas.total}
                slot={8}
                colunaRotulo="9rem"
                rotuloX="variantes marcadas com esse filtro"
              />
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Zigosidade</h3>
              <p className="text-12 leading-snug about-left">
                Heterozigoto tem um alelo alterado, homozigoto tem os dois. A proporção entre eles
                é constante numa amostra sadia; desvio grande indica consanguinidade, perda de
                heterozigosidade ou erro de chamada.
              </p>
              <BarrasNomeadas
                itens={Object.entries(metricas.zigosidade).sort((a, b) => b[1] - a[1]).map(([z, n]) => ({ rotulo: z, n }))}
                max={metricas.total}
                total={metricas.total}
                slot={3}
                colunaRotulo="9rem"
                rotuloX="variantes com essa zigosidade"
              />
            </article>
          </div>
        )}

        {aba === 'distribuicao' && (
          <div className="grid gap-16 about-cards">
            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Por cromossomo</h3>
              <p className="text-12 leading-snug about-left">
                Um pico isolado costuma ser região de baixa mapeabilidade, não descoberta.
              </p>
              <BarrasNomeadas
                itens={cromo.map((c) => ({ rotulo: c.chr, n: c.n }))}
                max={maxCromo}
                total={metricas.total}
                slot={1}
                colunaRotulo="2.5rem"
                rotuloX="variantes no cromossomo"
              />
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Troca de base</h3>
              <p className="text-12 leading-snug about-left">
                As seis classes de substituição. Como a fita é dupla, C&gt;A e G&gt;T são o mesmo
                evento visto de lados opostos, e a convenção é contar pela pirimidina. O perfil é
                assinatura de processo: C&gt;T em excesso é desaminação de citosina metilada, que
                toda amostra humana tem; C&gt;A em excesso costuma ser oxidação de guanina no
                preparo da biblioteca, ou seja, bancada e não biologia.
              </p>
              <BarrasNomeadas
                itens={espectro.classes.map((c, i) => ({ rotulo: c.rotulo.replace('>', '→'), n: c.n, slot: (i % 8) + 1 }))}
                total={espectro.n}
                slot={1}
                colunaRotulo="4rem"
                rotuloX="substituições dessa classe"
              />
            </article>

            <article className="card flex flex-col gap-8">
              <h3 className="text-16 font-medium text-text">Tipo de variante</h3>
              <p className="text-12 leading-snug about-left">
                Troca de uma base (SNV), inserção, deleção ou bloco. Indel é mais difícil de chamar
                que SNV, então excesso deles também aponta ruído.
              </p>
              <BarrasNomeadas
                itens={Object.entries(metricas.tipos).sort((a, b) => b[1] - a[1])
                  .map(([t, n], i) => ({ rotulo: t, n, slot: (i % 8) + 1 }))}
                max={metricas.total}
                total={metricas.total}
                slot={1}
                colunaRotulo="7rem"
                rotuloX="variantes desse tipo"
              />
            </article>
          </div>
        )}

        {aba === 'genes' && (
          <article className="card flex flex-col gap-12">
            <h3 className="text-16 font-medium text-text">Genes com mais variantes</h3>
            <p className="text-12 leading-snug about-left" style={{ maxWidth: 'var(--measure-wide)' }}>
              A posição de cada variante foi cruzada com as coordenadas de 20.033 genes, sem
              consultar a rede. Gene grande acumula mais variantes por tamanho, não por relevância:
              a lista é ponto de partida, não achado.
            </p>
            {!genesMapeados && (
              <p className="text-13">
                Indisponível para este arquivo: o mapa de genes é GRCh38 e o VCF não está nesse build.
              </p>
            )}
            {genesMapeados && porGene.length === 0 && (
              <p className="text-13">Nenhuma variante caiu dentro de um gene conhecido.</p>
            )}
            {porGene.length > 0 && (
              <BarrasNomeadas
                itens={porGene.map(([g, n], i) => ({ rotulo: g, n, slot: (i % 8) + 1 }))}
                max={porGene[0][1]}
                slot={1}
                colunaRotulo="8rem"
                href={(it) => `/gene/${it.rotulo}`}
                rotuloX="variantes dentro do gene"
              />
            )}
          </article>
        )}

        {aba === 'clinica' && (
          resumoCli
            ? (
              <AchadosClinicos
                variantes={variantes}
                resumoCli={resumoCli}
                anotacao={anotacao}
                vus={vus}
                onCarregarVUS={onCarregarVUS}
              />
            )
            : <p className="text-13">Consultando o ClinVar...</p>
        )}

        {aba === 'tabela' && (
          <TabelaVariantes
            variantes={variantes}
            dados={dados}
            resumoCli={resumoCli}
            temAnotacao={!!resumoCli}
          />
        )}
      </section>
    </>
  )
}
