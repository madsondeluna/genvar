import { useQuery } from '@tanstack/react-query'
import Icon from '../components/Icon'
import { fetchSourcesHealth, fetchEndpointsHealth } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'

// Pagina de status: valida ao vivo as fontes externas (/api/health/sources) e
// os nossos proprios endpoints (/api/health/endpoints). Em producao mostra cada
// item verde ou vermelho; no sandbox as fontes e os endpoints externos falham
// porque o egress e bloqueado (os internos passam).
export default function StatusPage() {
  const sources = useQuery({
    queryKey: ['health-sources'],
    queryFn: fetchSourcesHealth,
    staleTime: 1000 * 30,
  })
  const endpoints = useQuery({
    queryKey: ['health-endpoints'],
    queryFn: fetchEndpointsHealth,
    staleTime: 1000 * 30,
  })

  const refetchAll = () => {
    sources.refetch()
    endpoints.refetch()
  }
  const busy = sources.isFetching || endpoints.isFetching

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96 stagger stagger-fade">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Icon name="chart-line" />
            Status
          </p>
          <div className="flex items-center justify-between gap-16 mb-12 flex-wrap">
            <h1 className="display">Saúde do sistema</h1>
            <button
              type="button"
              onClick={refetchAll}
              className="pill pill-sm"
              disabled={busy}
              aria-label="Recarregar status"
            >
              <Icon name="refresh" />
              {busy ? 'Verificando...' : 'Recarregar'}
            </button>
          </div>
          <p className="text-15 leading-normal">
            Verifica em tempo real os serviços da API do GenVar e as fontes externas de dados.
            Resultado cacheado no servidor. Endpoints e fontes que dependem de rede aparecem em
            falha quando a origem está indisponível.
          </p>
        </header>

        {/* Servicos da API (nossos endpoints) */}
        <section className="mb-24" aria-labelledby="services-title">
          <div className="flex items-center justify-between gap-16 mb-12 flex-wrap">
            <h2 id="services-title" className="section-title flex items-center gap-8">
              <Icon name="database" className="text-muted" />
              Serviços da API
            </h2>
            {endpoints.data && (
              <p className="label">
                internos {endpoints.data.internal_ok_count}/{endpoints.data.internal_total}
                <span className={`status ml-8 ${endpoints.data.internal_ok_count === endpoints.data.internal_total ? 'status-good' : 'status-critical'}`}>
                  {endpoints.data.internal_ok_count === endpoints.data.internal_total ? 'Operacional' : 'Falha interna'}
                </span>
              </p>
            )}
          </div>
          {endpoints.isLoading && <LoadingSpinner />}
          {endpoints.error && <ErrorAlert message={endpoints.error.message} />}
          {endpoints.data && (
            <div className="card overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="table-header">Endpoint</th>
                    <th className="table-header w-px whitespace-nowrap">Tipo</th>
                    <th className="table-header num w-px">Latência</th>
                    <th className="table-header w-px whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.data.endpoints.map((e) => (
                    <tr key={e.path} className="border-t border-border">
                      <td className="px-16 py-12">
                        <span className="text-14 font-medium text-text block">{e.name}</span>
                        <span className="mono text-11 text-muted">{e.path}</span>
                      </td>
                      <td className="px-16 py-12">
                        <span className={`pill pill-sm ${e.external ? 'tint-warning' : 'tint-good'}`}>
                          {e.external ? 'externo' : 'interno'}
                        </span>
                      </td>
                      <td className="px-16 py-12 mono num text-13 text-muted">
                        {e.latency_ms != null ? `${e.latency_ms} ms` : 'n/d'}
                      </td>
                      <td className="px-16 py-12">
                        <span className={`status ${e.ok ? 'status-good' : 'status-critical'}`}>
                          {e.ok ? 'OK' : (e.detail || 'Falha')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Fontes externas de dados */}
        <section aria-labelledby="sources-title">
          <div className="flex items-center justify-between gap-16 mb-12 flex-wrap">
            <h2 id="sources-title" className="section-title flex items-center gap-8">
              <Icon name="chart-line" className="text-muted" />
              Fontes externas
            </h2>
            {sources.data && (
              <p className="label">
                {sources.data.ok_count}/{sources.data.total} respondendo
                <span className={`status ml-8 ${sources.data.all_ok ? 'status-good' : 'status-warning'}`}>
                  {sources.data.all_ok ? 'Tudo no ar' : 'Atenção'}
                </span>
              </p>
            )}
          </div>
          {sources.isLoading && <LoadingSpinner />}
          {sources.error && <ErrorAlert message={sources.error.message} />}
          {sources.data && (
            <div className="card overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="table-header">Fonte</th>
                    <th className="table-header w-px whitespace-nowrap">Host</th>
                    <th className="table-header num w-px">Latência</th>
                    <th className="table-header w-px whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.data.sources.map((s) => (
                    <tr key={s.name} className="border-t border-border">
                      <td className="px-16 py-12 text-14 font-medium text-text">{s.name}</td>
                      <td className="px-16 py-12 mono text-12 text-muted">{s.host}</td>
                      <td className="px-16 py-12 mono num text-13 text-muted">
                        {s.latency_ms != null ? `${s.latency_ms} ms` : 'n/d'}
                      </td>
                      <td className="px-16 py-12">
                        <span className={`status ${s.ok ? 'status-good' : 'status-critical'}`}>
                          {s.ok ? 'OK' : (s.detail || 'Falha')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
