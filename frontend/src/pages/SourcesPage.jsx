import { useQuery } from '@tanstack/react-query'
import Icon from '../components/Icon'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'
import { fetchSources } from '../api/client'
import { seriesStyle } from '../utils/seriesSlot'

// Página de proveniência. Existe por obrigação: o Orphanet, o PanelApp e o
// PGS Catalog são publicados sob CC BY 4.0, que exige crédito visível a quem
// redistribui os dados. Cada fonte traz licença, uso e citação, e os catálogos
// trazem a data em que foram extraídos.
const KIND_SLOT = { catalogo: 1, 'ao vivo': 2 }

export default function SourcesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
    staleTime: 1000 * 60 * 60,
  })
  const itens = data?.items ?? []
  const catalogos = itens.filter((f) => f.kind === 'catalogo')
  const aoVivo = itens.filter((f) => f.kind === 'ao vivo')

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96">
        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="book" />
            Fontes
          </p>
          <h1 className="display mb-12">Dados, licenças e citação</h1>
          <p className="text-15 leading-normal">
            O GenVar não gera dado primário. Tudo o que ele mostra vem de bases públicas
            mantidas por consórcios e institutos, e cada uma é usada sob a licença que a
            acompanha. Esta página lista as oito, com o que é extraído de cada uma, quando,
            e como citá-la.
          </p>
        </header>

        {error && <ErrorAlert message={error.message} />}
        {isLoading && <LoadingSpinner />}

        {!!catalogos.length && (
          <Grupo
            titulo="Catálogos"
            explicacao="Baixados por ETL e versionados com o app. O número tem a idade da extração."
            itens={catalogos}
          />
        )}
        {!!aoVivo.length && (
          <Grupo
            titulo="Consulta ao vivo"
            explicacao="Consultados a cada requisição. O número tem a idade da consulta."
            itens={aoVivo}
          />
        )}
      </div>
    </main>
  )
}

function Grupo({ titulo, explicacao, itens }) {
  return (
    <section className="mb-32">
      <h2 className="section-title mb-4">{titulo}</h2>
      <p className="text-13 mb-16">{explicacao}</p>
      <div className="flex flex-col gap-16">
        {itens.map((f) => (
          <article
            key={f.id}
            className="card tint-series flex flex-col gap-8"
            style={seriesStyle(KIND_SLOT[f.kind])}
          >
            <div className="flex items-baseline justify-between gap-16 flex-wrap">
              <h3 className="text-16 font-medium text-text">{f.name}</h3>
              <span className="flex items-center gap-8">
                <span className="tag">{f.license}</span>
                {f.extracted_at && (
                  <span className="label">Extraído em {f.extracted_at}</span>
                )}
              </span>
            </div>
            <p className="text-13 leading-snug">{f.usage}</p>
            <p className="text-12 mono leading-snug">{f.citation}</p>
            <div className="flex flex-wrap gap-8 mt-4">
              <a className="pill pill-sm" href={f.url} target="_blank" rel="noreferrer">
                Site <Icon name="external" />
              </a>
              <a className="pill pill-sm" href={f.data_url} target="_blank" rel="noreferrer">
                Dados <Icon name="external" />
              </a>
              <a className="pill pill-sm" href={f.license_url} target="_blank" rel="noreferrer">
                Licença <Icon name="external" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
