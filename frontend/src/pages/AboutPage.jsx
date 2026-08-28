import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import { fetchDiseaseStats, fetchPanelStats, fetchPgsScores } from '../api/client'
import { seriesStyle } from '../utils/seriesSlot'

// Página sobre o projeto.
//
// Layout: dois eixos, como a linguagem prescreve. A explicação de cada seção
// fica na coluna da esquerda, dentro da medida de prosa, e o conteúdo ocupa a
// direita. Prosa esticada a 1232px é ilegível, e prosa na medida com o resto da
// faixa vazia é desperdício: a coluna dupla resolve os dois.
//
// Material: .card chapado, o mesmo do resto do app. Vidro e realce de ponteiro
// ficaram de fora de propósito, para a página não destoar das outras.

const DIFERENCIAIS = [
  {
    slot: 1, icone: 'book', pronto: true,
    titulo: 'Português, do rótulo ao fenótipo',
    texto: 'Interface, nomes de doença e sinais clínicos em português. Os nomes vêm da '
         + 'nomenclatura oficial do Orphanet e os fenótipos da tradução oficial do HPO. '
         + 'Nenhum termo é traduzido por máquina.',
  },
  {
    slot: 2, icone: 'branch', pronto: true,
    titulo: 'Do raro ao poligênico na mesma tela',
    texto: 'Uma variante rara de grande efeito define a suscetibilidade, mas o fundo '
         + 'poligênico modula quem de fato adoece. O GenVar liga os dois: a doença '
         + 'monogênica, o painel de genes e o escore poligênico da mesma condição.',
  },
  {
    slot: 3, icone: 'shield', pronto: false,
    titulo: 'O que existe no SUS',
    texto: 'Cobertura no sistema público, protocolo do Conitec e triagem neonatal por '
         + 'doença. Hoje mapeado para 8 doenças; a ampliação é curadoria manual sobre os '
         + 'protocolos publicados.',
  },
  {
    slot: 4, icone: 'users', pronto: false,
    titulo: 'Frequência em população brasileira',
    texto: 'A gnomAD sub-representa ancestralidade admixada, e um alelo raro nela pode ser '
         + 'comum aqui. Cada variante liga para a coorte brasileira do ABraOM, mantida '
         + 'pela USP, em vez de redistribuir o dado.',
  },
]

const FAIR = [
  {
    letra: 'F', slot: 1, nome: 'Findable', titulo: 'Localizável',
    texto: 'Todo registro carrega o identificador da fonte: ORPHA para doença, HGNC e Ensembl '
         + 'para gene, rsID para variante, PGS para escore, HPO para fenótipo. A busca aceita '
         + 'qualquer um deles e responde por API.',
  },
  {
    letra: 'A', slot: 2, nome: 'Accessible', titulo: 'Acessível',
    texto: 'API HTTP aberta, sem chave, sem cadastro e sem cota. O que a interface mostra, a '
         + 'API devolve em JSON. O código é MIT e o repositório é público.',
  },
  {
    letra: 'I', slot: 3, nome: 'Interoperable', titulo: 'Interoperável',
    texto: 'Nenhum vocabulário próprio inventado: doença em ORPHA, MONDO, OMIM e ICD, fenótipo '
         + 'em HPO, traço em EFO, gene em HGNC e Ensembl. Quem consome o GenVar cruza com '
         + 'qualquer base que fale os mesmos identificadores.',
  },
  {
    letra: 'R', slot: 4, nome: 'Reusable', titulo: 'Reutilizável',
    texto: 'Cada fonte declara licença, uso e citação formal, com a data em que foi extraída. '
         + 'Os ETLs guardam a página crua em cache, então qualquer pessoa refaz o catálogo e '
         + 'chega ao mesmo resultado.',
  },
]

const FORMACAO = [
  'Nextflow Ambassador, Seqera',
  'Doutorando em Bioinformática, UFMG',
  'MBA em Engenharia de Software, USP',
  'Especialista em Data Science e Analytics, PUC',
  'Mestre em Genética e Biologia Molecular, UFPE',
  'Bacharel em Ciências Biomédicas, UFPE',
]

// Seção de dois eixos: explicação à esquerda, conteúdo à direita. Abaixo do
// ponto de quebra as duas viram uma coluna só, na ordem de leitura.
function Secao({ id, titulo, children, aside }) {
  return (
    <section className="mb-96" aria-labelledby={id}>
      <div className="grid gap-48 items-start about-split">
        <div className="flex flex-col gap-12" style={{ maxWidth: 'var(--measure-prose)' }}>
          <h2 id={id} className="section-title">{titulo}</h2>
          {aside}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  )
}

const PAR = 'text-14 leading-normal'

export default function AboutPage() {
  const doencas = useQuery({ queryKey: ['disease-stats'], queryFn: fetchDiseaseStats, staleTime: 1000 * 60 * 30 })
  const paineis = useQuery({ queryKey: ['panel-stats'], queryFn: fetchPanelStats, staleTime: 1000 * 60 * 30 })
  const pgs = useQuery({ queryKey: ['pgs', 'all'], queryFn: () => fetchPgsScores({ category: 'all' }), staleTime: 1000 * 60 * 30 })
  const n = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'))

  const numeros = [
    { slot: 1, v: n(doencas.data?.total), r: 'Doenças raras' },
    { slot: 2, v: n(paineis.data?.total), r: 'Painéis de genes' },
    { slot: 3, v: n(pgs.data?.total), r: 'Escores poligênicos' },
    { slot: 4, v: n(doencas.data?.total_genes), r: 'Genes causais' },
  ]

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-48 grid gap-48 items-end about-split">
          <div className="flex flex-col gap-12" style={{ maxWidth: 'var(--measure-prose)' }}>
            <p className="eyebrow flex items-center gap-8">
              <Icon name="info" />
              Sobre
            </p>
            <h1 className="display text-40">
              A genética de uma condição, inteira e em português
            </h1>
          </div>
          <p className={PAR}>
            O GenVar reúne bases públicas de genética humana numa consulta só. Ele não gera dado
            primário: pega o que Orphanet, PanelApp, PGS Catalog, Ensembl, gnomAD, ClinVar,
            AlphaFold e UniProt publicam, e mostra junto o que hoje exige abrir oito portais.
            É gratuito, de código aberto e sem cadastro.
          </p>
        </header>

        <section className="mb-96" aria-labelledby="num-title">
          <h2 id="num-title" className="sr-only">Números do catálogo</h2>
          {/* `faixa-numeros` zera o padding do cartão: o .glass-panel já traz
              borda e raio próprios, e sem isso a faixa aparece como um quadro
              branco em volta de quatro quadros tintos. Mesma faixa do relatório
              de VCF e da triagem em lote, agora com a mesma classe. */}
          <div
            className="card faixa-numeros glass-panel"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}
          >
            {numeros.map((x) => (
              <div key={x.r} className="tint-series" style={seriesStyle(x.slot)}>
                <span className="text-32 mono num text-text leading-none">{x.v}</span>
                <span className="text-12">{x.r}</span>
              </div>
            ))}
          </div>
        </section>

        <Secao
          id="dif-title"
          titulo="O que o diferencia"
          aside={
            <p className={PAR}>
              Agregar base pública numa interface não é original: Varsome, Franklin, MARRVEL e a
              Open Targets Platform fazem isso. O que segue é o que o GenVar tem e essas não têm,
              com o estado real de cada item.
            </p>
          }
        >
          <div className="grid gap-16 about-cards">
            {DIFERENCIAIS.map((d) => (
              <article
                key={d.titulo}
                className="card tint-series flex flex-col gap-8"
                style={seriesStyle(d.slot)}
              >
                <span className="flex items-center justify-between gap-8">
                  <span className="w-40 h-40 series-mark rounded-media flex items-center justify-center">
                    <Icon name={d.icone} size="md" />
                  </span>
                  <span className={`tag ${d.pronto ? 'tint-good' : 'tint-neutral'}`}>
                    {d.pronto ? 'implementado' : 'Em construção'}
                  </span>
                </span>
                <h3 className="text-16 font-medium text-text">{d.titulo}</h3>
                <p className="text-13 leading-snug about-left">{d.texto}</p>
              </article>
            ))}
          </div>
        </Secao>

        <Secao
          id="fair-title"
          titulo="Dados FAIR"
          aside={
            <>
              <p className={PAR}>
                Os princípios FAIR, publicados por Wilkinson e colaboradores em 2016, pedem que
                dado científico seja localizável, acessível, interoperável e reutilizável. Eles
                são uma recomendação, não uma norma: não há certificação, não há auditoria e a
                conformidade é autodeclarada por quem publica.
              </p>
              <p className={PAR}>
                O resultado é conhecido em bioinformática. Coordenada sem build declarado, tabela
                suplementar em PDF, identificador interno que não resolve em lugar nenhum, versão
                de base sem data: nada disso viola regra alguma, e cada um inviabiliza refazer a
                análise. O custo não aparece na publicação; aparece anos depois, quando alguém
                tenta reproduzir e não consegue.
              </p>
              <p className={PAR}>
                Por isso as quatro linhas ao lado apontam para mecanismo no código, e não para
                intenção. Cada uma pode ser conferida abrindo o repositório.
              </p>
            </>
          }
        >
          <div className="grid gap-16 about-cards">
            {FAIR.map((f) => (
              <article
                key={f.letra}
                className="card tint-series flex flex-col gap-8"
                style={seriesStyle(f.slot)}
              >
                <span className="flex items-baseline gap-8">
                  <span className="text-32 mono text-text leading-none">{f.letra}</span>
                  <span className="label">{f.nome}</span>
                </span>
                <h3 className="text-16 font-medium text-text">{f.titulo}</h3>
                <p className="text-13 leading-snug about-left">{f.texto}</p>
              </article>
            ))}
          </div>
        </Secao>

        <Secao
          id="quem-title"
          titulo="Quem faz"
          aside={
            <p className={PAR}>
              O GenVar é o MVP apresentado como critério para obtenção do título de MBA em
              Engenharia de Software pela Universidade de São Paulo, em 2026.
            </p>
          }
        >
          <article className="card flex gap-24 items-start flex-wrap mb-16">
            <img
              src={`${import.meta.env.BASE_URL}brand/madson.jpg`}
              alt="Madson A. de Luna Aragão"
              width="160"
              height="160"
              className="rounded-circle"
              style={{ inlineSize: '10rem', blockSize: '10rem', objectFit: 'cover', flex: 'none' }}
            />
            <div className="flex flex-col gap-8 min-w-0" style={{ flex: '1 1 18rem' }}>
              <span className="label">Autor</span>
              <h3 className="text-18 font-medium text-text">Madson A. de Luna Aragão</h3>
              <p className="text-13 leading-snug about-left">
                Bioinformata e biomédico, em Belo Horizonte. Trabalha na fronteira entre genética
                e engenharia de software, que é de onde o GenVar saiu.
              </p>
              <ul className="flex flex-col gap-4 mt-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {FORMACAO.map((f) => (
                  <li key={f} className="text-12 flex items-start gap-6">
                    <Icon name="dot" className="text-muted mt-2" />
                    {f}
                  </li>
                ))}
              </ul>
              <span className="flex flex-wrap gap-8 mt-8">
                <a className="pill pill-sm" href="https://madsondeluna.com" target="_blank" rel="noreferrer">
                  madsondeluna.com <Icon name="external" />
                </a>
                <a className="pill pill-sm" href="https://github.com/madsondeluna" target="_blank" rel="noreferrer">
                  github.com/madsondeluna <Icon name="external" />
                </a>
              </span>
            </div>
          </article>

          <article className="card flex flex-col gap-8">
            <span className="label">Orientação</span>
            <h3 className="text-16 font-medium text-text">Marcelo Pereira da Silva</h3>
            <p className="text-13 leading-snug about-left">
              Orientador do trabalho. Mestre em Ciência da Computação e doutorando em Ciência da
              Informação.
            </p>
          </article>
        </Secao>

        <Secao
          id="agrad-title"
          titulo="Agradecimentos"
          aside={
            <p className={PAR}>
              O trabalho aqui é de integração. O dado é de quem o produz e o mantém.
            </p>
          }
        >
          <div className="flex flex-col gap-16">
            <div className="card flex flex-col gap-8">
              <span className="label">Universidade de São Paulo</span>
              <p className="text-13 leading-snug about-left">
                Pelo conhecimento que estruturou este trabalho, e aos professores do MBA em
                Engenharia de Software, cujas disciplinas se veem no que o GenVar tem de
                arquitetura, de teste e de disciplina de dado. O que aqui é catálogo, API e
                verificação veio dessas aulas, não de tentativa e erro.
              </p>
            </div>
            <div className="card flex flex-col gap-8">
              <span className="label">Consórcios e institutos</span>
              <p className="text-13 leading-snug about-left">
                Orphanet, Genomics England, PGS Catalog, EMBL-EBI, Broad Institute e NCBI mantêm
                as bases públicas que o projeto usa. Sem elas não há GenVar.
              </p>
              <span className="flex flex-wrap gap-8 mt-4">
                <Link to="/fontes" className="pill pill-sm">
                  Fontes e licenças <Icon name="arrow-right" />
                </Link>
                <Link to="/colabore" className="pill pill-sm">
                  Colaborar <Icon name="arrow-right" />
                </Link>
              </span>
            </div>
          </div>
        </Secao>
      </div>
    </main>
  )
}
