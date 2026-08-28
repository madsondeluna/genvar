import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import FerramentasVcf from '../components/FerramentasVcf'
import { BarrasNomeadas } from '../components/Grafico'
import { seriesStyle } from '../utils/seriesSlot'
import { ROTULO, SLOT, ORDEM_GRAVIDADE, CONSEQUENCIA, ESTRELAS } from '../vcf/clinvar'
import { carregarClinGen, carregarCPIC, carregarSimbolos } from '../vcf/interpretacao'
import { indiceDeGenes } from '../vcf/metricas'
import {
  processarLote, resumoDoLote, genesRecorrentes, variantesRecorrentes,
  sinaisDeAtencao, linhasDoLote, linhasDeAchados,
  CABECALHO_LOTE, CABECALHO_ACHADOS, LIMITE_ARQUIVOS, ehVcf,
} from '../vcf/lote'
import { paraXLSX, baixar } from '../vcf/exportar'

// Triagem de coorte: muitos VCF numa passada.
//
// O que esta página faz e a de uma amostra não faz é ver o CONJUNTO. Variante
// que aparece em metade do lote quase nunca é achado clínico, é artefato do
// pipeline ou da captura, e isso só é visível com a coorte na frente. O mesmo
// vale para gene recorrente e para a distribuição de qualidade entre amostras.

const PAR = 'text-14 leading-normal'
const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const dec = (n, c = 2) => (n == null ? '—' : n.toFixed(c).replace('.', ','))

const CORES_SINAL = { critico: 'var(--status-critical)', aviso: 'var(--status-warning)', achado: 'var(--status-serious)' }

export default function LotePage() {
  const [estado, setEstado] = useState('vazio')  // vazio | rodando | pronto
  const [progresso, setProgresso] = useState(null)
  const [resultados, setResultados] = useState([])
  const [erro, setErro] = useState(null)
  const [aba, setAba] = useState('amostras')
  const [saida, setSaida] = useState('parado')
  const inputRef = useRef(null)

  const processar = useCallback(async (lista) => {
    const arquivos = [...(lista || [])].filter(ehVcf)
    if (!arquivos.length) {
      setErro('Nenhum arquivo reconhecido. Aceita .vcf, .vcf.gz e .zip com um VCF dentro.')
      setEstado('vazio')
      return
    }
    setEstado('rodando'); setErro(null); setResultados([]); setProgresso(null)
    try {
      const [clingen, cpic, simbolos, genesJson] = await Promise.all([
        carregarClinGen().catch(() => null),
        carregarCPIC().catch(() => null),
        carregarSimbolos().catch(() => null),
        fetch(`${import.meta.env.BASE_URL}data/burden/genes.json`).then((r) => r.json()).catch(() => null),
      ])
      const out = await processarLote(arquivos, {
        clingen, cpic, simbolos,
        indiceGenes: genesJson ? indiceDeGenes(genesJson) : null,
        onProgresso: (p) => setProgresso({ ...p, resultados: undefined, feitos: p.resultados.length }),
      })
      setResultados(out)
      setEstado('pronto')
    } catch (e) {
      setErro(e.message || String(e))
      setEstado('vazio')
    }
  }, [])

  const total = useMemo(() => (resultados.length ? resumoDoLote(resultados) : null), [resultados])
  const genes = useMemo(() => genesRecorrentes(resultados).slice(0, 20), [resultados])
  const recorrentes = useMemo(() => variantesRecorrentes(resultados).slice(0, 30), [resultados])
  const comFalha = useMemo(() => resultados.filter((r) => r.erro), [resultados])

  const porClasse = useMemo(() => {
    const c = {}
    for (const r of resultados) for (const [k, n] of Object.entries(r.porSig || {})) c[k] = (c[k] || 0) + n
    return ORDEM_GRAVIDADE.filter((s) => c[s]).map((s) => ({ rotulo: ROTULO[s], n: c[s], slot: SLOT[s] }))
  }, [resultados])

  async function exportar() {
    setSaida('gerando')
    try {
      const blob = await paraXLSX([
        { nome: 'Amostras', linhas: [CABECALHO_LOTE, ...linhasDoLote(resultados)] },
        { nome: 'Achados', linhas: [CABECALHO_ACHADOS, ...linhasDeAchados(resultados)] },
        {
          nome: 'Genes recorrentes',
          linhas: [['gene', 'amostras_com_achado', 'patogenicas', 'condicoes'],
            ...genesRecorrentes(resultados).map((g) => [g.gene, g.amostras, g.patogenicas, g.condicoes.join('; ')])],
        },
        {
          nome: 'Variantes recorrentes',
          linhas: [['variante', 'amostras', 'gene', 'classificacao_codigo', 'arquivos'],
            ...variantesRecorrentes(resultados).map((v) => [v.chave, v.amostras, v.gene || '', v.sig, v.nomes.join('; ')])],
        },
        {
          nome: 'Metodologia',
          linhas: [
            ['item', 'valor'],
            ['gerador', 'GenVar, triagem de coorte'],
            ['uso', 'Pesquisa e ensino. Nao e laudo diagnostico.'],
            ['arquivos submetidos', resultados.length],
            ['processados', total?.processados ?? 0],
            ['com falha', total?.comFalha ?? 0],
            ['camada consultada', 'patogenica, provavelmente patogenica, conflitante, farmaco e risco'],
            ['chave de cruzamento', 'rsID + REF + ALT; coordenada + REF + ALT apenas em GRCh38'],
            ['processamento', 'inteiramente no navegador; nenhum arquivo foi transmitido'],
            ['limite por arquivo', '400.000 variantes'],
          ],
        },
      ])
      baixar(blob, `genvar-lote-${resultados.length}-amostras.xlsx`)
      setSaida('parado')
    } catch (e) {
      setSaida('erro')
    }
  }

  const aoSoltar = useCallback((e) => { e.preventDefault(); processar(e.dataTransfer.files) }, [processar])

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="list" />
            Triagem de coorte
          </p>
          <h1 className="display text-40">Lote</h1>
        </header>

        <FerramentasVcf />

        <p className={`${PAR} texto-colunas mb-96`}>
          Muitos VCF numa passada, com um consolidado no fim. O que esta página mostra e a de uma
          amostra não mostra é o <strong className="text-text font-medium">conjunto</strong>: uma
          variante que aparece em metade do lote quase nunca é achado clínico, é artefato do
          pipeline, da captura ou do lote de sequenciamento, e isso é invisível arquivo a arquivo.
          Como no resto do módulo, nada sobe: os arquivos são lidos no seu computador e o que sai
          daqui é a planilha que você baixar.
        </p>

        <section className="mb-96" aria-labelledby="entrada-title">
          <h2 id="entrada-title" className="section-title mb-8">Envie os arquivos</h2>
          <p className={`${PAR} texto-colunas mb-24`}>
            Cada arquivo é lido, anotado, resumido e descartado, ficando só as métricas e os
            achados. É essa troca que permite processar dezenas: guardar as variantes de todos
            estouraria a memória da aba antes do décimo arquivo.
          </p>

          <div
            className="card vcf-solta grid gap-24 items-center about-cards"
            onDragOver={(e) => e.preventDefault()}
            onDrop={aoSoltar}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".vcf,.gz,.zip,text/plain,application/zip"
              className="sr-only"
              id="lote-input"
              onChange={(e) => processar(e.target.files)}
            />
            <div className="flex flex-col items-center gap-12 text-center">
              <span className="w-40 h-40 bg-dim rounded-media flex items-center justify-center">
                <Icon name="upload" size="md" className="text-muted" />
              </span>
              <p className="text-15 text-text">Arraste os arquivos aqui, ou escolha vários de uma vez</p>
              <label htmlFor="lote-input" className="pill pill-solid" style={{ cursor: 'pointer' }}>
                <Icon name="folder" />
                Escolher arquivos
              </label>
              {estado === 'rodando' && progresso && (
                <span className="flex flex-col gap-4 items-center" role="status" aria-live="polite">
                  <span className="flex items-center gap-8">
                    <span className="spinner" aria-hidden="true" />
                    <span className="text-13">
                      {progresso.nome ? `${progresso.nome}: ${progresso.etapa}` : progresso.etapa}
                    </span>
                  </span>
                  <span className="label">{progresso.feitos} de {progresso.total} arquivos</span>
                </span>
              )}
              {erro && <p className="field-error" role="alert">{erro}</p>}
            </div>

            <ul className="flex flex-col gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[
                ['Formatos', '.vcf, .vcf.gz e .zip com um VCF dentro'],
                ['Teto', `${LIMITE_ARQUIVOS} arquivos por lote, 400.000 variantes cada`],
                ['Ordem', 'um de cada vez; paralelo troca tempo por risco de estourar a memória'],
                ['Se um falhar', 'entra na lista com o motivo e o lote continua'],
                ['O que sai daqui', 'nada: nenhum arquivo é enviado'],
              ].map(([k, v]) => (
                <li key={k} className="grid gap-12 items-baseline" style={{ gridTemplateColumns: 'minmax(0,9rem) 1fr' }}>
                  <span className="label">{k}</span>
                  <span className="text-13">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {estado === 'pronto' && total && (
          <section aria-labelledby="res-title">
            <h2 id="res-title" className="section-title mb-8">Consolidado</h2>
            <p className={`${PAR} texto-colunas mb-24`}>
              {fmt(total.processados)} de {fmt(total.arquivos)} arquivos processados
              {total.comFalha > 0 && `, ${fmt(total.comFalha)} com falha`}, em{' '}
              {dec(total.segundos, 0)} segundos: {fmt(Math.round(total.porSegundo))} variantes por
              segundo.
            </p>

            <div className="card faixa-numeros glass-panel mb-24"
                 style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
              {[
                [1, fmt(total.processados), 'amostras', `${fmt(total.arquivos)} enviadas`],
                [2, fmt(total.variantes), 'variantes lidas', 'somando o lote'],
                [8, fmt(total.patogenicas), 'achados patogênicos', `em ${fmt(total.amostrasComPatogenica)} amostras`],
                [6, fmt(total.achados), 'achados no total', 'inclui risco e fármaco'],
                [3, fmt(recorrentes.length), 'variantes recorrentes', 'em duas amostras ou mais'],
              ].map(([slot, valor, rotulo, nota]) => (
                <div key={rotulo} className="tint-series" style={seriesStyle(slot)}>
                  <span className="text-24 mono num text-text leading-none">{valor}</span>
                  <span className="text-12">{rotulo}</span>
                  <span className="label">{nota}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-16 flex-wrap mb-16">
              <div className="flex flex-wrap gap-8" role="tablist" aria-label="Seções do consolidado">
                {[['amostras', 'Amostras'], ['achados', 'Achados'], ['genes', 'Genes recorrentes'],
                  ['recorrentes', 'Variantes recorrentes']].map(([k, r]) => (
                  <button key={k} type="button" role="tab" aria-selected={aba === k}
                          className={`pill pill-sm ${aba === k ? 'pill-solid' : ''}`}
                          onClick={() => setAba(k)}>{r}</button>
                ))}
              </div>
              <span className="flex items-center gap-8 flex-wrap">
                <button type="button" className="pill pill-solid" onClick={exportar} disabled={saida === 'gerando'}>
                  <Icon name="download" />
                  {saida === 'gerando' ? 'Montando...' : 'Planilha do lote'}
                </button>
                {saida === 'erro' && <span className="field-error" role="alert">Não foi possível gerar.</span>}
              </span>
            </div>

            {porClasse.length > 0 && (
              <article className="card mb-16 flex flex-col gap-12">
                <h3 className="text-16 font-medium text-text">Classificação somada no lote</h3>
                <BarrasNomeadas itens={porClasse} slot={2} colunaRotulo="14rem"
                                total={total.achados} rotuloX="achados com essa classificação" />
              </article>
            )}

            {aba === 'amostras' && (
              <article className="card flex flex-col gap-12">
                <h3 className="text-16 font-medium text-text">Uma linha por amostra</h3>
                <p className="text-12 leading-snug about-left">
                  Os sinais de atenção ordenam a fila de revisão; são triagem grosseira de
                  propósito, e não classificação.
                </p>
                <div className="table-scroll">
                  <table className="w-full text-left">
                    <thead>
                      <tr>{['Arquivo', 'Amostra', 'Build', 'Variantes', 'Ti/Tv novas', 'Balanço', 'Sexo', 'Achados', 'Sinais']
                        .map((c) => <th key={c} className="table-header w-px whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, i) => {
                        const sinais = r.erro ? [] : sinaisDeAtencao(r)
                        const q = r.qualidade || {}
                        return (
                          <tr key={i} className="border-t border-border">
                            <td className="px-16 py-12 text-12 mono" style={{ maxWidth: '14rem' }}>{r.nome}</td>
                            <td className="px-16 py-12 text-12">{(r.amostras || [])[0] || '—'}</td>
                            <td className="px-16 py-12 text-12 whitespace-nowrap">
                              {r.build || '—'}
                              {r.buildOrigem && <span className="block label">{r.buildOrigem}</span>}
                            </td>
                            <td className="px-16 py-12 text-12 mono num text-right">{fmt(r.metricas?.total)}</td>
                            <td className="px-16 py-12 text-12 mono num text-right">{dec(q.titvNovas)}</td>
                            <td className="px-16 py-12 text-12 mono num text-right">{dec(q.abMediana)}</td>
                            <td className="px-16 py-12 text-12">{q.sexo || '—'}</td>
                            <td className="px-16 py-12 text-12 mono num text-right">{r.achados.length}</td>
                            <td className="px-16 py-12 text-12" style={{ maxWidth: '20rem' }}>
                              {r.erro
                                ? <span className="field-error">{r.erro}</span>
                                : sinais.length
                                  ? <span className="flex gap-4 flex-wrap">
                                    {sinais.map((s, j) => (
                                      <span key={j} className="tag tag-sm"
                                            style={{ color: CORES_SINAL[s.nivel] }}>{s.texto}</span>
                                    ))}
                                  </span>
                                  : <span className="label">nada a sinalizar</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {comFalha.length > 0 && (
                  <p className="text-12 leading-snug">
                    {fmt(comFalha.length)} arquivos falharam e o lote seguiu. O motivo de cada um
                    está na coluna de sinais, e é o que permite reprocessar só o que falhou.
                  </p>
                )}
              </article>
            )}

            {aba === 'achados' && (
              <article className="card flex flex-col gap-12">
                <span className="flex items-baseline justify-between gap-16 flex-wrap">
                  <h3 className="text-16 font-medium text-text">Achados de todas as amostras</h3>
                  <span className="label">{fmt(total.achados)} no total, mostrando 200</span>
                </span>
                <div className="table-scroll">
                  <table className="w-full text-left">
                    <thead>
                      <tr>{['Amostra', 'Gene', 'Variante', 'Classificação', 'Revisão', 'Condição', 'Genótipo']
                        .map((c) => <th key={c} className="table-header w-px whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {resultados.flatMap((r) => r.achados.map((a) => ({ ...a, arquivo: r.nome })))
                        .sort((a, b) => ORDEM_GRAVIDADE.indexOf(a.sig) - ORDEM_GRAVIDADE.indexOf(b.sig)
                          || b.estrelas - a.estrelas)
                        .slice(0, 200)
                        .map((a, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-16 py-12 text-12" style={{ maxWidth: '10rem' }}>{a.amostra}</td>
                            <td className="px-16 py-12 text-12 mono">
                              {a.gene ? <Link to={`/gene/${a.gene}`} className="link-muted underline underline-offset-2">{a.gene}</Link> : '—'}
                            </td>
                            <td className="px-16 py-12 text-12 mono whitespace-nowrap">
                              {a.chrom}:{fmt(a.pos)} {a.ref}→{a.alt}
                              {a.rsid && <span className="block label">{a.rsid}</span>}
                            </td>
                            <td className="px-16 py-12 text-12">
                              <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[a.sig])}>{ROTULO[a.sig]}</span>
                            </td>
                            <td className="px-16 py-12 text-12 whitespace-nowrap" title={ESTRELAS[a.estrelas]}>
                              {a.estrelas}/4
                            </td>
                            <td className="px-16 py-12 text-12" style={{ maxWidth: '16rem' }}>{a.condicao || '—'}</td>
                            <td className="px-16 py-12 text-12 whitespace-nowrap">{a.zigosidade}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            {aba === 'genes' && (
              <article className="card flex flex-col gap-12">
                <h3 className="text-16 font-medium text-text">Genes com achado em mais de uma amostra</h3>
                <p className="text-12 leading-snug about-left" style={{ maxWidth: 'var(--measure-wide)' }}>
                  Gene que aparece em muitas amostras da mesma coorte é candidato a causa comum ou
                  a artefato da região, e as duas leituras pedem o mesmo primeiro passo, que é
                  olhar.
                </p>
                {genes.length === 0 && <p className="text-13">Nenhum gene com achado.</p>}
                {genes.length > 0 && (
                  <BarrasNomeadas
                    itens={genes.map((g, i) => ({ rotulo: g.gene, n: g.amostras, slot: (i % 8) + 1 }))}
                    max={Math.max(...genes.map((g) => g.amostras))}
                    total={total.processados}
                    slot={1}
                    colunaRotulo="8rem"
                    href={(it) => `/gene/${it.rotulo}`}
                    rotuloX="amostras com achado nesse gene"
                  />
                )}
              </article>
            )}

            {aba === 'recorrentes' && (
              <article className="card flex flex-col gap-12">
                <h3 className="text-16 font-medium text-text">Variantes em duas amostras ou mais</h3>
                <p className="text-12 leading-snug about-left" style={{ maxWidth: 'var(--measure-wide)' }}>
                  <strong className="text-text font-medium">Recorrência num lote é suspeita, não
                  confirmação.</strong> Uma variante rara que aparece em várias amostras do mesmo
                  lote costuma ser artefato do pipeline, da captura ou do lote de sequenciamento.
                  Numa coorte de parentes ou numa população fundadora ela pode ser real, e a
                  distinção é do analista, não da ferramenta.
                </p>
                {recorrentes.length === 0 && (
                  <p className="text-13">Nenhuma variante aparece em duas amostras ou mais.</p>
                )}
                <div className="table-scroll">
                  <table className="w-full text-left">
                    <thead>
                      <tr>{['Variante', 'Amostras', 'Gene', 'Classificação', 'Consequência', 'Arquivos']
                        .map((c) => <th key={c} className="table-header w-px whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {recorrentes.map((v, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-16 py-12 text-12 mono whitespace-nowrap">{v.chave}</td>
                          <td className="px-16 py-12 text-12 mono num text-right">
                            {v.amostras}
                            <span className="block label">de {total.processados}</span>
                          </td>
                          <td className="px-16 py-12 text-12 mono">{v.gene || '—'}</td>
                          <td className="px-16 py-12 text-12">
                            <span className="tag tag-series tag-sm" style={seriesStyle(SLOT[v.sig])}>{ROTULO[v.sig]}</span>
                          </td>
                          <td className="px-16 py-12 text-12">{CONSEQUENCIA[v.consequencia] || '—'}</td>
                          <td className="px-16 py-12 text-12" style={{ maxWidth: '18rem' }}>
                            <span className="label">{v.nomes.join(', ')}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
