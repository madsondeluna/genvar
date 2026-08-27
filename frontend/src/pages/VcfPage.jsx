import { useCallback, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import NgsPipeline from '../components/NgsPipeline'
import VcfReport from '../components/VcfReport'
import { lerVCF, extrairDoZip } from '../vcf/parse'
import { resumo, indiceDeGenes, geneDaPosicao } from '../vcf/metricas'
import { anotar, resumoClinico, carregarIndice } from '../vcf/clinvar'
import {
  carregarPaineis, carregarSimbolos, carregarClinGen, carregarCPIC,
  anotarClinGen, anotarCPIC, anotarACMG, frequenciaGnomad,
} from '../vcf/interpretacao'
import { sha256 } from '../vcf/exportar'

// Anotação de VCF, inteira no navegador.
//
// O arquivo não sobe para servidor nenhum. Isso não é escolha de arquitetura,
// é o que dispensa base legal sob a LGPD: VCF é dado genético de pessoa
// identificável. As APIs recebem coordenada e rsID, que não identificam.
//
// Teto de leitura: um genoma passa de 4 milhões de variantes e anotar tudo
// levaria horas. O filtro acontece ANTES de qualquer chamada de rede.
const TETO_VARIANTES = 400_000

const PAR = 'text-14 leading-normal'

export default function VcfPage() {
  const [estado, setEstado] = useState('vazio')  // vazio | lendo | pronto | erro
  const [progresso, setProgresso] = useState(null)
  const [dados, setDados] = useState(null)
  const [anotacao, setAnotacao] = useState(null)
  const [resumoCli, setResumoCli] = useState(null)
  const [vus, setVus] = useState(false)
  const [gnomad, setGnomad] = useState(null)   // null | {feitas,total,...} | 'pronto'
  const [erro, setErro] = useState(null)
  const inputRef = useRef(null)

  const processar = useCallback(async (arquivo) => {
    if (!arquivo) return
    setEstado('lendo'); setErro(null); setDados(null); setProgresso(null)
    setAnotacao(null); setResumoCli(null); setVus(false); setGnomad(null)
    try {
      let extras = 0
      if (/\.zip$/i.test(arquivo.name)) {
        const r = await extrairDoZip(arquivo)
        arquivo = r.arquivo
        extras = r.outros
      }
      // Impressão digital do arquivo, antes de qualquer leitura. Sem ela dois
      // laudos do mesmo paciente em meses diferentes não são comparáveis.
      const impressao = await sha256(arquivo).catch(() => null)
      const genesJson = await fetch(`${import.meta.env.BASE_URL}data/burden/genes.json`).then((r) => r.json())
      const indice = indiceDeGenes(genesJson)

      const { meta, variantes, lidos, truncado } = await lerVCF(arquivo, {
        limite: TETO_VARIANTES,
        onProgresso: (p) => setProgresso(p),
      })
      if (!variantes.length) throw new Error('Nenhuma variante encontrada. O arquivo é mesmo um VCF?')

      // Gene por coordenada, sem rede. SÓ para GRCh38: o conjunto de genes é
      // GRCh38, e cruzar coordenada de GRCh37 contra ele não desloca um pouco,
      // troca o gene. Sem o build declarado, também não se cruza: gene errado
      // com cara de certo é pior que gene nenhum.
      const podeMapear = meta.build === 'GRCh38'
      if (podeMapear) {
        for (const v of variantes) v.gene = geneDaPosicao(indice, v.chrom, v.pos)
      }

      const alvo = {
        nome: arquivo.name,
        outrosNoZip: extras,
        tamanho: arquivo.size,
        meta,
        variantes,
        lidos,
        truncado,
        metricas: resumo(variantes),
        genesMapeados: podeMapear,
        sha256: impressao,
      }
      setDados(alvo)
      setEstado('pronto')

      // A anotação clínica vem DEPOIS de a tela existir. São megabytes de
      // ClinVar por cromossomo: prender o relatório inteiro nisso deixaria o
      // usuário olhando um carregando enquanto as métricas de qualidade, que
      // não dependem de rede nenhuma, já estavam prontas.
      const [info, clingen, cpic, simbolos, indiceCv] = await Promise.all([
        anotar(variantes, { camadas: ['aviso'], build: meta.build }),
        carregarClinGen().catch(() => null),
        carregarCPIC().catch(() => null),
        carregarSimbolos().catch(() => null),
        carregarIndice().catch(() => null),
      ])
      anotarClinGen(variantes, clingen, simbolos)
      anotarCPIC(variantes, cpic)
      anotarACMG(variantes)
      setDados((d) => ({ ...d, versaoClinvar: indiceCv?.versao || null, simbolos }))
      setAnotacao(info)
      setResumoCli(resumoClinico(variantes))
    } catch (e) {
      setErro(e.message || String(e))
      setEstado('erro')
    }
  }, [])

  // A camada de significado incerto tem 2,3 milhões de registros e só entra a
  // pedido: baixá-la por padrão custaria dezenas de megabytes para uma leitura
  // que, por definição, não conclui nada.
  const carregarVUS = useCallback(async () => {
    if (!dados) return
    const info = await anotar(dados.variantes, { camadas: ['incerta'], build: dados.meta.build })
    setAnotacao((a) => ({
      ...a,
      casadas: (a?.casadas || 0) + info.casadas,
      camadasCarregadas: [a?.camadasCarregadas, info.camadasCarregadas].filter(Boolean).join('; '),
    }))
    anotarACMG(dados.variantes)
    setResumoCli(resumoClinico(dados.variantes))
    setVus(true)
  }, [dados])

  // gnomAD ao vivo, só para o que já tem achado. Sai daqui coordenada e alelo,
  // que não identificam pessoa, e é uma requisição por variante: mandar 30 mil
  // seria abuso de um serviço público e levaria horas.
  const consultarGnomad = useCallback(async (alvos) => {
    if (!dados || !alvos?.length) return
    setGnomad({ feitas: 0, total: alvos.length })
    await frequenciaGnomad(alvos, {
      build: dados.meta.build,
      onProgresso: (p) => setGnomad(p),
    })
    anotarACMG(dados.variantes)
    setResumoCli(resumoClinico(dados.variantes))
    setGnomad('pronto')
  }, [dados])

  const aoSoltar = useCallback((e) => {
    e.preventDefault()
    processar(e.dataTransfer.files?.[0])
  }, [processar])

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="file" />
            Chamada de variantes, do sequenciador ao significado
          </p>
          <h1 className="display text-40">VCF</h1>
        </header>

        {/* Abertura em fluxo contínuo na faixa inteira. Estava em duas colunas
            lado a lado, e ler uma coluna até o fim para voltar ao topo da outra
            é o que a leitura corrida evita. */}
        <p className={`${PAR} texto-colunas mb-96`}>
          Um VCF lista as posições em que uma amostra difere do genoma de referência. Ele não é o
          sequenciamento: é o último arquivo de uma cadeia, e o que ele pode responder depende do
          que cada etapa anterior guardou e do que descartou.{' '}
          <strong className="text-text font-medium">O arquivo não sai do seu computador.</strong>{' '}
          A leitura acontece no navegador; só coordenada e identificador de variante chegam às
          bases públicas, e nenhum dos dois identifica uma pessoa.
        </p>

        <section className="mb-96" aria-labelledby="fluxo-title">
          <h2 id="fluxo-title" className="section-title mb-8">Como se chega a um VCF</h2>
          <p className={`${PAR} texto-colunas mb-24`}>
            Cinco etapas, e cada uma guarda uma coisa e perde outra. A linha apagada de cada etapa
            é a perda, porque é ela que explica o que o arquivo final não consegue responder: um
            VCF registra onde a amostra difere da referência, e nada sobre onde ela é igual, e é
            por isso que ele nunca prova a ausência de uma variante.
          </p>
          <NgsPipeline />
        </section>

        <section className="mb-96" aria-labelledby="upload-title">
          <h2 id="upload-title" className="section-title mb-8">Analise o seu arquivo</h2>
          <p className={`${PAR} texto-colunas mb-24`}>
            A leitura acontece aqui, no navegador. Nenhum byte do arquivo é enviado a servidor
            nenhum, e é isso que dispensa cadastro, consentimento e retenção: VCF é dado genético
            de pessoa identificável, e o que não sobe não precisa ser protegido em trânsito.
          </p>

          <div
            className="card vcf-solta grid gap-24 items-center about-cards"
            onDragOver={(e) => e.preventDefault()}
            onDrop={aoSoltar}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".vcf,.gz,.zip,text/plain,application/zip"
              className="sr-only"
              id="vcf-input"
              onChange={(e) => processar(e.target.files?.[0])}
            />
            <div className="flex flex-col items-center gap-12 text-center">
              <span className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
                <Icon name="upload" size="md" className="text-muted" />
              </span>
              <p className="text-15 text-text">Arraste o VCF ou o zip aqui, ou escolha um arquivo</p>
              <label htmlFor="vcf-input" className="pill pill-solid" style={{ cursor: 'pointer' }}>
                <Icon name="folder" />
                Escolher arquivo
              </label>
              {estado === 'lendo' && (
                <p className="label" role="status">
                  Lendo{progresso ? `: ${progresso.lidos.toLocaleString('pt-BR')} linhas` : '...'}
                </p>
              )}
              {estado === 'erro' && (
                <p className="field-error" role="alert">{erro}</p>
              )}
            </div>

            <ul className="flex flex-col gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[
                ['Formatos', '.vcf, .vcf.gz e .zip com um VCF dentro'],
                ['Teto', `${TETO_VARIANTES.toLocaleString('pt-BR')} variantes`],
                ['Onde roda', 'no seu navegador, sem upload'],
                ['O que sai daqui', 'nada: o arquivo não é enviado'],
                ['Genes', '20.033 mapeados por coordenada, sem rede'],
              ].map(([k, v]) => (
                <li key={k} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: 'minmax(0,9rem) 1fr' }}>
                  <span className="label">{k}</span>
                  <span className="text-13">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {estado === 'pronto' && dados && (
          <VcfReport
            dados={dados}
            anotacao={anotacao}
            resumoCli={resumoCli}
            vus={vus}
            onCarregarVUS={carregarVUS}
            gnomad={gnomad}
            onConsultarGnomad={consultarGnomad}
          />
        )}
      </div>
    </main>
  )
}
