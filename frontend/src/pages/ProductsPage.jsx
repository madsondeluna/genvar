import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import {
  fetchDiseaseStats, fetchPanelStats, fetchPgsScores, fetchSources, fetchSuggestions,
} from '../api/client'
import { seriesStyle } from '../utils/seriesSlot'

// Página de produtos, organizada por TRABALHO A FAZER e não por camada de
// genética.
//
// A versão anterior tinha três cartões chamados monogênico, multigênico e
// poligênico, cada um descrevendo um catálogo. Isso é como um bioinformata
// organiza o assunto, não como alguém chega com uma necessidade: ninguém abre um
// site querendo "um catálogo curado", abre querendo saber o que fazer com uma
// variante, se um gene explica um quadro, ou se há algo relevante num arquivo de
// trinta mil linhas.
//
// Público primário: profissional de saúde e pesquisa (geneticista clínico,
// bioinformata). O paciente é leitor secundário, que chega por um link
// compartilhado, e para ele existe o modo de leitura na navegação.
//
// Os números também mudaram de lado. "3.739 doenças" mede o esforço de quem
// carregou o dado, e o usuário não tem como saber se é muito ou pouco. A única
// pergunta que ele faz é se a DELE está lá, e isso é uma busca, não um cartaz.

// Maturidade com significado. Antes os três cartões diziam "Beta disponível", e
// um rótulo que não distingue nada não informa nada.
const MATURIDADE = {
  pronto: { rotulo: 'Pronto para uso', tint: 'tint-good' },
  beta: { rotulo: 'Beta', tint: 'tint-warning' },
  exploratorio: { rotulo: 'Exploratório', tint: 'tint-series' },
}

const PRODUTOS = [
  {
    id: 'vcf',
    slot: 8,
    icon: 'file',
    to: '/vcf',
    destaque: true,
    maturidade: 'pronto',
    trabalho: 'Tenho um arquivo de variantes e preciso saber o que há nele',
    nome: 'Análise de VCF',
    entra: 'um .vcf, .vcf.gz ou .zip',
    sai: 'laudo em PDF, VCF anotado, planilha e tabela',
    desc: 'O arquivo é lido no navegador e não é enviado a servidor nenhum. Sai um relatório com '
        + 'os achados do ClinVar, os critérios ACMG avaliáveis, o controle de qualidade da chamada '
        + 'e, com um trio, as variantes de novo e o heterozigoto composto em trans.',
    diferencial: 'O arquivo do paciente não sai do computador dele. Sem upload não há '
        + 'consentimento a coletar, retenção a justificar nem vazamento possível.',
    itens: [
      'Balanço alélico, Ti/Tv separado entre conhecidas e novas, verificação de sexo',
      'Filtro por painel: 424 do PanelApp mais os genes acionáveis do ACMG SF v3.2',
      'Frequência por população do gnomAD, consultada só para os achados',
      'Quatro arquivos de exemplo para experimentar sem ter um VCF à mão',
    ],
  },
  {
    id: 'consulta',
    slot: 1,
    icon: 'search',
    to: '/',
    maturidade: 'pronto',
    trabalho: 'Encontrei um gene ou uma variante e preciso do contexto completo',
    nome: 'Consulta de gene e variante',
    entra: 'um símbolo HGNC ou um rsID',
    sai: 'ficha consolidada com estrutura, restrição e significado clínico',
    desc: 'Uma tela reúne o que hoje exige abrir oito portais: coordenadas e consequência do '
        + 'Ensembl, frequência por população do gnomAD, classificação do ClinVar, escores '
        + 'preditivos do dbNSFP, estrutura predita do AlphaFold e anotação funcional do UniProt.',
    diferencial: 'Em português, com a citação e a licença de cada fonte declaradas por campo.',
    itens: [
      'Restrição gênica (LOEUF e pLI) ao vivo, não em cópia local',
      'Estrutura tridimensional colorida por confiança da predição',
      'Tabelas de variantes patogênicas, incertas e benignas, com exportação',
    ],
  },
  {
    id: 'clinico',
    slot: 3,
    icon: 'users',
    to: '/doencas',
    maturidade: 'beta',
    trabalho: 'Tenho um quadro clínico e preciso chegar aos genes candidatos',
    nome: 'Do quadro clínico ao gene',
    entra: 'nome da doença ou sinais clínicos',
    sai: 'genes causais com herança, evidência e o que existe no Brasil',
    desc: 'Catálogo do Orphanet com genes causais, padrão de herança, prevalência e fenótipos '
        + 'HPO, mais os painéis do PanelApp por condição. Cada gene abre na ficha completa.',
    diferencial: 'Fenótipos HPO em português, com 96% de cobertura, e o contexto brasileiro que '
        + 'nenhuma base internacional traz: cobertura pelo SUS, protocolo clínico e triagem '
        + 'neonatal por doença.',
    itens: [
      'Só associação de mutação germinativa causadora; suscetibilidade fica em campo à parte',
      'Painéis com o nível de evidência do PanelApp, não lista solta de genes',
      'Restrição gênica de cada gene causal, buscada na hora',
    ],
  },
  {
    id: 'risco',
    slot: 5,
    icon: 'chart-line',
    to: '/poligenico',
    maturidade: 'exploratorio',
    trabalho: 'Preciso situar o risco além da variante de grande efeito',
    nome: 'Risco poligênico e associação',
    entra: 'um fenótipo ou um gene',
    sai: 'escores publicados e associação por burden de variantes raras',
    desc: 'Escores do PGS Catalog com a ancestria em que foram desenvolvidos, e resultados de '
        + 'associação gene-fenótipo por burden, meta-analisados por ancestria.',
    diferencial: 'A ancestria de desenvolvimento aparece em cada escore. Um PGS treinado em '
        + 'coorte europeia perde acurácia em população brasileira miscigenada, e esconder isso '
        + 'transforma um número frágil em número confiável.',
    itens: [
      'Camada de pesquisa, não de conduta clínica',
      'Ancestria latina e miscigenada das Américas entre as analisadas',
      'A procedência dos sumários de burden não está registrada; os números não devem ser citados',
    ],
  },
]

// As oito bases, ditas do lado do usuário: o que ele deixa de abrir.
const FONTES = [
  ['Ensembl', 'coordenadas, transcritos e consequência'],
  ['gnomAD', 'frequência por população e restrição gênica'],
  ['ClinVar', 'classificação clínica e nível de revisão'],
  ['AlphaFold', 'estrutura proteica predita'],
  ['UniProt', 'anotação funcional e domínios'],
  ['Orphanet', 'doenças raras, herança e fenótipos'],
  ['PanelApp', 'painéis diagnósticos com nível de evidência'],
  ['PGS Catalog', 'escores poligênicos publicados'],
]

function Selo({ chave }) {
  const m = MATURIDADE[chave]
  return <span className={`pill pill-sm ${m.tint}`}>{m.rotulo}</span>
}

// Cobertura como resposta, não como cartaz. O número sozinho não diz nada a
// quem chega: "3.739 doenças" só vira informação quando responde "a minha está
// entre elas?".
function Cobertura() {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const navegar = useNavigate()
  const caixaRef = useRef(null)

  const doencas = useQuery({ queryKey: ['disease-stats'], queryFn: fetchDiseaseStats, staleTime: 1000 * 60 * 30 })
  const paineis = useQuery({ queryKey: ['panel-stats'], queryFn: fetchPanelStats, staleTime: 1000 * 60 * 30 })
  const pgs = useQuery({ queryKey: ['pgs', 'all'], queryFn: () => fetchPgsScores({ category: 'all' }), staleTime: 1000 * 60 * 30 })
  const fontes = useQuery({ queryKey: ['sources'], queryFn: fetchSources, staleTime: 1000 * 60 * 60 })

  const termo = q.trim()
  const sugestoes = useQuery({
    queryKey: ['suggest', termo],
    queryFn: () => fetchSuggestions(termo, 6),
    enabled: termo.length >= 2,
    staleTime: 1000 * 60 * 5,
  })

  const itens = sugestoes.data?.items || []
  const semResultado = termo.length >= 2 && !sugestoes.isLoading && itens.length === 0

  const n = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'))
  const rota = (it) => (it.kind === 'disease' ? `/doenca/${it.id}`
    : it.kind === 'gene' ? `/gene/${it.id}`
      : it.kind === 'panel' ? `/painel/${it.id}` : `/variant/${it.id}`)

  const numeros = useMemo(() => [
    { slot: 1, to: '/doencas', valor: n(doencas.data?.total), rotulo: 'doenças raras catalogadas',
      nota: `${n(doencas.data?.total_genes)} genes causais` },
    { slot: 3, to: '/paineis', valor: n(paineis.data?.total), rotulo: 'painéis diagnósticos',
      nota: `${n(paineis.data?.total_genes)} genes distintos` },
    { slot: 5, to: '/poligenico', valor: n(pgs.data?.total), rotulo: 'escores poligênicos',
      nota: 'com a ancestria de desenvolvimento declarada' },
    { slot: 7, to: '/fontes', valor: n(fontes.data?.items?.length), rotulo: 'bases integradas',
      nota: 'licença e citação por fonte' },
  ], [doencas.data, paineis.data, pgs.data, fontes.data])

  return (
    <section className="mb-96" aria-labelledby="cobertura-title">
      <h2 id="cobertura-title" className="section-title mb-8">O que está aqui é o que você precisa?</h2>
      <p className="text-14 leading-normal texto-colunas mb-24">
        A pergunta que importa não é quantas doenças o catálogo tem, e sim se a sua está entre
        elas. Digite a doença, o gene ou o rsID e veja antes de navegar. Os números abaixo vêm da
        API neste momento, não estão fixados na página, e o acesso é público e gratuito.
      </p>

      <div className="card mb-24 flex flex-col gap-8" ref={caixaRef}>
        <label className="filtro" style={{ position: 'relative' }}>
          <span className="label">Buscar no catálogo</span>
          <input
            className="input"
            type="search"
            value={q}
            placeholder="Marfan, BRCA1, rs334"
            onChange={(e) => { setQ(e.target.value); setAberto(true) }}
            onFocus={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 150)}
            role="combobox"
            aria-expanded={aberto && termo.length >= 2}
            aria-controls="cobertura-sugestoes"
            aria-autocomplete="list"
          />
          {aberto && termo.length >= 2 && (
            <ul className="suggest-list" id="cobertura-sugestoes" role="listbox">
              {sugestoes.isLoading && <li className="text-12 px-12 py-8">Procurando...</li>}
              {itens.map((it) => (
                <li key={`${it.kind}-${it.id}`} role="option" aria-selected="false">
                  <button
                    type="button"
                    className="gene-linha"
                    onMouseDown={(e) => { e.preventDefault(); navegar(rota(it)) }}
                  >
                    <span className="flex flex-col gap-2" style={{ minWidth: 0 }}>
                      <span className="text-13 text-text truncate">{it.label}</span>
                      {it.hint && <span className="label truncate">{it.hint}</span>}
                    </span>
                    {it.extra && <span className="text-12 mono text-muted">{it.extra}</span>}
                  </button>
                </li>
              ))}
              {semResultado && (
                <li className="text-12 px-12 py-8">
                  Nada com esse termo. O catálogo cobre doença rara, gene humano e variante com
                  rsID; se for uma dessas, escreva de outra forma.
                </li>
              )}
            </ul>
          )}
        </label>
      </div>

      <div
        className="grid gap-16"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}
      >
        {numeros.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="card tint-series hover-surface flex flex-col gap-4 cursor-pointer"
            style={seriesStyle(l.slot)}
          >
            <span className="text-32 mono num text-text leading-none">{l.valor}</span>
            <span className="text-14 text-text">{l.rotulo}</span>
            <span className="label">{l.nota}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function ProductsPage() {
  const [destaque, ...demais] = PRODUTOS

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="sparkle" />
            O que dá para fazer aqui
          </p>
          <h1 className="display mb-12">Quatro trabalhos, do arquivo ao laudo</h1>
          <p className="text-15 leading-normal texto-colunas">
            O GenVar é para quem precisa decidir alguma coisa a partir de genética: geneticista
            clínico, bioinformata, pesquisador. Cada bloco abaixo começa por um trabalho concreto e
            diz o que entra, o que sai e por que a resposta é melhor aqui do que somando oito
            portais. Tudo é público, gratuito e de código aberto. Nada aqui substitui avaliação
            médica.
          </p>
        </header>

        {/* Destaque: o único módulo com fluxo completo, entrada de arquivo e
            artefato de saída. Vinha faltando por inteiro nesta página. */}
        <Link
          to={destaque.to}
          className="card tint-series hover-surface fade-up flex flex-col gap-12 cursor-pointer mb-16"
          style={seriesStyle(destaque.slot)}
        >
          <span className="flex items-center justify-between gap-8 flex-wrap">
            <span className="flex items-center gap-12">
              <span className="w-40 h-40 series-mark rounded-media flex items-center justify-center">
                <Icon name={destaque.icon} size="md" />
              </span>
              <span className="eyebrow">{destaque.trabalho}</span>
            </span>
            <Selo chave={destaque.maturidade} />
          </span>

          <span className="text-24 display text-text">{destaque.nome}</span>

          <span className="grid gap-24 about-cards">
            <span className="flex flex-col gap-8">
              <span className="text-14 leading-normal about-left">{destaque.desc}</span>
              <span className="flex flex-col gap-6">
                {destaque.itens.map((b) => (
                  <span key={b} className="text-12 flex items-start gap-6">
                    <span aria-hidden="true">·</span>{b}
                  </span>
                ))}
              </span>
            </span>
            <span className="flex flex-col gap-12">
              <span className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0,5rem) 1fr' }}>
                <span className="label">Entra</span>
                <span className="text-13">{destaque.entra}</span>
                <span className="label">Sai</span>
                <span className="text-13">{destaque.sai}</span>
              </span>
              <span className="rounded-media border border-border p-16 flex flex-col gap-4">
                <span className="label">Por que aqui</span>
                <span className="text-13 leading-snug about-left">{destaque.diferencial}</span>
              </span>
            </span>
          </span>

          <span className="pill pill-solid self-start">
            Analisar um VCF <Icon name="arrow-right" />
          </span>
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 mb-96 stagger">
          {demais.map((p) => (
            <Link
              key={p.id}
              to={p.to}
              className="card tint-series hover-surface fade-up flex flex-col gap-8 cursor-pointer"
              style={seriesStyle(p.slot)}
            >
              <span className="flex items-center justify-between gap-8">
                <span className="w-40 h-40 series-mark rounded-media flex items-center justify-center">
                  <Icon name={p.icon} size="md" />
                </span>
                <Selo chave={p.maturidade} />
              </span>
              <span className="eyebrow">{p.trabalho}</span>
              <span className="text-16 font-medium text-text">{p.nome}</span>
              <span className="text-12 leading-snug about-left">{p.desc}</span>

              <span className="grid gap-6 mt-4" style={{ gridTemplateColumns: 'minmax(0,3.2rem) 1fr' }}>
                <span className="label">Entra</span>
                <span className="text-12">{p.entra}</span>
                <span className="label">Sai</span>
                <span className="text-12">{p.sai}</span>
              </span>

              <span className="rounded-media border border-border p-12 flex flex-col gap-4 mt-4">
                <span className="label">Por que aqui</span>
                <span className="text-12 leading-snug about-left">{p.diferencial}</span>
              </span>

              <span className="flex flex-col gap-6 mt-4">
                {p.itens.map((b) => (
                  <span key={b} className="text-12 flex items-start gap-6">
                    <span aria-hidden="true">·</span>{b}
                  </span>
                ))}
              </span>

              <span className="pill pill-sm mt-8 self-start">
                Abrir <Icon name="arrow-right" />
              </span>
            </Link>
          ))}
        </div>

        <Cobertura />

        <section className="mb-96" aria-labelledby="fontes-title">
          <h2 id="fontes-title" className="section-title mb-8">O que você deixa de abrir</h2>
          <p className="text-14 leading-normal texto-colunas mb-24">
            Cada uma destas bases responde uma parte da pergunta e nenhuma responde sozinha. O
            trabalho que o GenVar faz é reunir as oito na mesma tela, em português, com a licença e
            a citação de cada uma declaradas.
          </p>
          <ul className="grid gap-12 about-cards" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {FONTES.map(([nome, papel], i) => (
              <li key={nome} className="grid gap-12 items-baseline"
                  style={{ gridTemplateColumns: 'minmax(0,7rem) 1fr' }}>
                <span className="tag tag-series tag-sm" style={seriesStyle((i % 8) + 1)}>{nome}</span>
                <span className="text-13">{papel}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-96" aria-labelledby="maturidade-title">
          <h2 id="maturidade-title" className="section-title mb-8">O que cada selo quer dizer</h2>
          <p className="text-14 leading-normal texto-colunas mb-24">
            Um rótulo que não distingue nada não informa nada, e antes os três módulos diziam a
            mesma coisa. Aqui o selo separa o que está pronto para uso do que ainda não está, e
            dizer isso em voz alta vale mais do que parecer completo.
          </p>
          <ul className="flex flex-col gap-12" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[
              ['pronto', 'O fluxo está completo e testado, e o resultado pode ser usado no trabalho '
                + 'de todo dia. Continua sendo material de pesquisa e ensino: não é laudo '
                + 'diagnóstico e não substitui laboratório clínico habilitado.'],
              ['beta', 'Funciona e é útil, mas há cobertura incompleta ou decisão de curadoria '
                + 'ainda em aberto. Confira contra a fonte primária antes de agir.'],
              ['exploratorio', 'Camada de pesquisa. Serve para levantar hipótese, não para embasar '
                + 'conduta, e há limitação declarada na própria página do módulo.'],
            ].map(([chave, texto]) => (
              <li key={chave} className="grid gap-12 items-baseline"
                  style={{ gridTemplateColumns: 'minmax(0,10rem) 1fr' }}>
                <Selo chave={chave} />
                <span className="text-13 leading-snug about-left">{texto}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="rel-title">
          <h2 id="rel-title" className="section-title mb-8">Por que os quatro se ligam</h2>
          <p className="text-14 leading-normal about-left mb-16">
            Uma mesma doença raramente é só monogênica ou só poligênica. Uma variante rara de
            grande efeito define o principal risco, mas o{' '}
            <span className="text-text font-medium">fundo poligênico</span>, a soma de muitas
            variantes comuns de pequeno efeito, modula quem de fato adoece. É por isso que
            portadores da mesma mutação têm evoluções diferentes, e é por isso que a análise de um
            VCF e a consulta de um escore poligênico não são produtos separados: são dois pedaços
            da mesma resposta.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            {[
              [1, 'Variante rara', 'Grande efeito, baixa frequência. Define a suscetibilidade '
                + 'monogênica, como LDLR na hipercolesterolemia familiar. É o que a análise de VCF '
                + 'e a consulta de variante encontram.'],
              [3, 'Fundo poligênico', 'Muitas variantes comuns de pequeno efeito. Desloca o risco '
                + 'para cima ou para baixo em cada indivíduo, e a ancestria muda a calibração.'],
              [5, 'Penetrância observada', 'O resultado clínico é a combinação dos dois, ainda '
                + 'modulada por ambiente. Nenhum dos módulos calcula isso hoje, e dizer que calcula '
                + 'seria a promessa que a genética ainda não cumpre.'],
            ].map(([slot, titulo, texto]) => (
              <div key={titulo} className="rounded-media border border-border p-16 flex flex-col gap-4 tint-series"
                   style={seriesStyle(slot)}>
                <p className="label">{titulo}</p>
                <p className="text-13 leading-snug about-left">{texto}</p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}
