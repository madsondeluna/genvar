import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import { seriesStyle } from '../utils/seriesSlot'

// Chamada para colaboradores.
//
// O formulário NÃO envia nada para um servidor do GenVar: ele monta a URL de
// uma issue do GitHub com os campos já preenchidos e abre em outra aba. Assim
// não há back-end de inscrição para manter, não há dado pessoal guardado aqui,
// e a candidatura nasce pública e rastreável, que é como um projeto aberto
// deve funcionar. O template `colaborador.yml` vive em .github/ISSUE_TEMPLATE.

const REPO = 'https://github.com/madsondeluna/genvar'

const FRENTES = [
  {
    slot: 1, icone: 'shield', peso: 'a mais necessária',
    titulo: 'Dados brasileiros',
    texto: 'Mapear quais doenças têm protocolo no SUS, triagem neonatal e prevalência '
         + 'nacional. Hoje são 8 de 3.739. É curadoria sobre documento público, não código.',
    quem: 'geneticista, residente, profissional do SUS',
  },
  {
    slot: 2, icone: 'book', peso: 'alto impacto',
    titulo: 'Revisão de fenótipos',
    texto: 'Os sinais clínicos vêm da tradução oficial do HPO, que cobre 42% dos termos. '
         + 'O resto foi traduzido pelo projeto e precisa de olhar clínico.',
    quem: 'quem atende paciente e conhece o vocabulário',
  },
  {
    slot: 3, icone: 'database', peso: 'contínuo',
    titulo: 'Backend e dados',
    texto: 'API, ETL, cache e limite de taxa. Python, FastAPI e um ETL por fonte, com '
         + 'cache em disco para ser reproduzível.',
    quem: 'quem programa em Python',
  },
  {
    slot: 4, icone: 'grid', peso: 'contínuo',
    titulo: 'Interface e visualização',
    texto: 'React, acessibilidade e visualização de dado. A linguagem de design é própria '
         + 'e documentada; não há decisão de cor ou espaçamento para inventar.',
    quem: 'quem faz front-end ou design de dado',
  },
]

// Cada opção do select espelha uma opção do template no GitHub. Se uma mudar,
// a outra precisa mudar junto: são o mesmo formulário em dois lugares.
const AREAS = [
  'Genética médica ou clínica',
  'Bioinformática',
  'Desenvolvimento de software',
  'Design e interface',
  'Ciência de dados',
  'Divulgação científica',
  'Paciente, familiar ou associação',
  'Outra',
]

const PAR = 'text-14 leading-normal'

export default function ContributePage() {
  const [nome, setNome] = useState('')
  const [contato, setContato] = useState('')
  const [area, setArea] = useState(AREAS[0])
  const [frente, setFrente] = useState(FRENTES[0].titulo)
  const [contexto, setContexto] = useState('')
  // Erros aparecem SÓ depois de tentar enviar: campo em branco que ainda não
  // foi visitado não é erro, é campo em branco.
  const [erros, setErros] = useState({})
  const refNome = useRef(null)
  const refContato = useRef(null)

  const url = useMemo(() => {
    const corpo = [
      `**Nome:** ${nome || '(preencher)'}`,
      `**Onde me achar:** ${contato || '(preencher)'}`,
      `**De onde venho:** ${area}`,
      `**Frente:** ${frente}`,
      '',
      contexto || '(conte o que quiser sobre você, o que já fez e quanto tempo tem)',
    ].join('\n')
    const p = new URLSearchParams({
      template: 'colaborador.yml',
      title: `[colaboração] ${nome || 'quero ajudar'}`,
      body: corpo,
      labels: 'colaboração,quero-ajudar',
    })
    return `${REPO}/issues/new?${p}`
  }, [nome, contato, area, frente, contexto])

  function validar() {
    const e = {}
    if (nome.trim().length < 2) e.nome = 'Diga como você quer ser creditado.'
    if (contato.trim().length < 3) e.contato = 'Precisamos de um jeito de te achar.'
    return e
  }

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        {/* Ritmo da página: texto, depois blocos. A prosa fica sempre na medida
            e os blocos ocupam a faixa inteira. Não há coluna paralela: numa
            página que se lê de cima a baixo, a coluna lateral compete com o
            texto em vez de complementá-lo. */}

        <header className="mb-48">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="users" />
            Colabore
          </p>
          <h1 className="display text-40 mb-16">Entre no time</h1>
          <div className="flex flex-col gap-12" style={{ maxWidth: 'var(--measure-wide)' }}>
            <p className={PAR}>
              O GenVar é aberto e mantido por quem aparece. Não há vaga, contrato nem
              exclusividade: há frentes de trabalho, e quem pega uma entra no time.
            </p>
            <p className={PAR}>
              A frente que mais precisa de gente não é a de código. Um catálogo de 3.739 doenças
              em português tem 8 delas com o protocolo do SUS mapeado, e ampliar isso é leitura de
              documento público, não programação.
            </p>
          </div>
        </header>

        <section className="mb-96" aria-labelledby="frentes-title">
          <h2 id="frentes-title" className="section-title mb-8">Frentes abertas</h2>
          <p className={`${PAR} mb-24`} style={{ maxWidth: 'var(--measure-wide)' }}>
            Quatro, da mais necessária para a mais contínua. Cada uma diz para quem serve, porque
            a maioria delas não pede que você saiba programar.
          </p>
          <div className="grid gap-16 about-cards">
            {FRENTES.map((f) => (
              <article
                key={f.titulo}
                className="card tint-series flex flex-col gap-8"
                style={seriesStyle(f.slot)}
              >
                <span className="flex items-center justify-between gap-8">
                  <span className="w-40 h-40 series-mark rounded-media flex items-center justify-center">
                    <Icon name={f.icone} size="md" />
                  </span>
                  <span className="tag tint-neutral">{f.peso}</span>
                </span>
                <h3 className="text-16 font-medium text-text">{f.titulo}</h3>
                <p className="text-13 leading-snug about-left">{f.texto}</p>
                <p className="label mt-4">Para {f.quem}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-96" aria-labelledby="form-title">
          <h2 id="form-title" className="section-title mb-8">Inscrição</h2>
          <div className="flex flex-col gap-12 mb-24" style={{ maxWidth: 'var(--measure-wide)' }}>
            <p className={PAR}>
              Preencher aqui não envia nada para o GenVar. O botão monta uma issue no repositório,
              já preenchida com o que você escreveu, e abre para você conferir e confirmar. Não há
              back-end de inscrição, não há dado seu guardado neste site, e a candidatura nasce
              pública.
            </p>
            <p className={PAR}>
              Precisa de conta no GitHub. Sem ela, o caminho é o site do autor, na página Sobre.
            </p>
          </div>

          <form
            className="card flex flex-col gap-16"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              // O botão nunca desabilita: enviar incompleto é o que revela o
              // que falta. Desabilitado, o formulário não diz por quê.
              const achados = validar()
              setErros(achados)
              if (Object.keys(achados).length) {
                (achados.nome ? refNome : refContato).current?.focus()
                return
              }
              window.open(url, '_blank', 'noopener')
            }}
          >
            <div className="grid gap-16 about-cards">
            <label className="field">
              <span className="field-label">Nome</span>
              <input
                ref={refNome}
                className="input"
                value={nome}
                onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: null })) }}
                placeholder="como você quer ser creditado"
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? 'erro-nome' : undefined}
              />
              {erros.nome && <span id="erro-nome" className="field-error" role="alert">{erros.nome}</span>}
            </label>

            <label className="field">
              <span className="field-label">Onde te achar</span>
              <input
                ref={refContato}
                className="input"
                value={contato}
                onChange={(e) => { setContato(e.target.value); setErros((x) => ({ ...x, contato: null })) }}
                placeholder="perfil, site, ORCID, Lattes ou e-mail"
                aria-invalid={!!erros.contato}
                aria-describedby={erros.contato ? 'erro-contato' : undefined}
              />
              {erros.contato && <span id="erro-contato" className="field-error" role="alert">{erros.contato}</span>}
            </label>

              <label className="field">
                <span className="field-label">De onde você vem</span>
                <span className="select-shell">
                  <select className="select" value={area} onChange={(e) => setArea(e.target.value)}>
                    {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </span>
              </label>

              <label className="field">
                <span className="field-label">Em que você quer ajudar</span>
                <span className="select-shell">
                  <select className="select" value={frente} onChange={(e) => setFrente(e.target.value)}>
                    {FRENTES.map((f) => <option key={f.titulo} value={f.titulo}>{f.titulo}</option>)}
                    <option value="Ainda não sei, quero conversar">Ainda não sei, quero conversar</option>
                  </select>
                </span>
              </label>
            </div>

            <label className="field">
              <span className="field-label">Alguma coisa que ajude a te conhecer</span>
              <textarea
                className="input textarea"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                placeholder="opcional"
                rows={4}
              />
            </label>

            <span className="flex items-center gap-16 flex-wrap">
              <button type="submit" className="pill pill-solid">
                <Icon name="external" />
                Abrir a inscrição no GitHub
              </button>
              <span className="text-12">Você confere e confirma lá.</span>
            </span>
          </form>
        </section>

        <section aria-labelledby="regras-title">
          <h2 id="regras-title" className="section-title mb-8">Como contribuir</h2>
          <p className={`${PAR} mb-24`} style={{ maxWidth: 'var(--measure-wide)' }}>
            O caminho é o mesmo para todas as frentes: um pull request contra a branch
            <span className="mono"> beta</span>. Não há revisão de duas pessoas nem integração
            contínua ainda, então a suíte local é o que separa uma mudança boa de uma regressão
            silenciosa.
          </p>
          <div className="grid gap-16 about-cards">
            <article className="card flex flex-col gap-8">
              <span className="label">Antes de abrir o PR</span>
              <pre className="code-block text-12 mono" style={{ margin: 0 }}>
{`cd backend && pytest
cd frontend && npm run build`}
              </pre>
              <p className="text-13 leading-snug about-left">
                São 51 testes unitários, sem rede, em cerca de um segundo e meio. Os 12 marcados
                como <span className="mono">integration</span> ficam de fora por padrão: batem em
                Ensembl, gnomAD e ClinVar de verdade e reprovam quando um serviço de terceiro muda
                ou limita a taxa, o que não diz nada sobre o seu código.
              </p>
            </article>

            <article className="card flex flex-col gap-8">
              <span className="label">Mudança de catálogo</span>
              <p className="text-13 leading-snug about-left">
                Os JSON em <span className="mono">app/data/</span> são gerados, não editados.
                Corrija o ETL da fonte e rode <span className="mono">python -m etl.orphanet</span>,
                <span className="mono"> etl.panelapp</span> ou
                <span className="mono"> etl.pgscatalog</span>. As páginas cruas ficam em cache,
                então rodar de novo não repete rede e qualquer pessoa chega ao mesmo arquivo. Uma
                edição manual se perde na execução seguinte.
              </p>
            </article>

            <article className="card flex flex-col gap-8">
              <span className="label">Licença do que você escrever</span>
              <p className="text-13 leading-snug about-left">
                Código entra sob MIT. Dado é outra história: um arquivo derivado de uma fonte
                herda a licença dela, e nem todas são permissivas. O ABraOM é ODbL, que obriga a
                redistribuir qualquer derivado sob ODbL, e por isso o GenVar liga para lá em vez
                de copiar o número. Fonte nova entra em
                <span className="mono"> routers/sources.py</span> antes de o dado entrar no app.
              </p>
            </article>

            <article className="card flex flex-col gap-8">
              <span className="label">Crédito</span>
              <p className="text-13 leading-snug about-left">
                O histórico do git é o registro: o commit fica com a sua autoria e o
                <span className="mono"> git log</span> diz quem fez o quê. Contribuição de
                curadoria, que não vira commit de código, entra como coautoria no commit que
                aplica a curadoria.
              </p>
            </article>
          </div>
        </section>

      </div>
    </main>
  )
}
