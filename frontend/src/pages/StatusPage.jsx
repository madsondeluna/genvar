import { useQuery } from '@tanstack/react-query'
import { Activity, RefreshCw } from 'lucide-react'
import { fetchSourcesHealth } from '../api/client'
import PageNav from '../components/PageNav'
import ErrorAlert from '../components/ErrorAlert'
import LoadingSpinner from '../components/LoadingSpinner'

// Pagina de status: valida ao vivo as fontes externas via /api/health/sources.
// Em producao mostra cada API verde ou vermelha; no ambiente restrito do
// sandbox as fontes aparecem em falha porque o egress e bloqueado.
export default function StatusPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health-sources'],
    queryFn: fetchSourcesHealth,
    staleTime: 1000 * 30,
  })

  return (
    <main className="min-h-screen bg-bg">
      <PageNav />
      <div className="max-w-xl mx-auto px-24 py-32 pb-96">

        <header className="mb-24">
          <p className="eyebrow mb-8 flex items-center gap-8">
            <Activity className="w-12 h-12" aria-hidden="true" />
            Status das fontes
          </p>
          <h1 className="display mb-12">Saúde das APIs</h1>
          <p className="text-15 text-muted leading-normal">
            Verifica em tempo real se as fontes externas do GenVar estão respondendo: Ensembl,
            gnomAD, ClinVar, AlphaFold, UniProt, MyVariant e GWAS Catalog. Resultado cacheado por
            60 s no servidor.
          </p>
        </header>

        <div className="flex items-center justify-between gap-16 mb-16 flex-wrap">
          {data && (
            <p className="label">
              {data.ok_count}/{data.total} fontes respondendo
              <span
                className={`status ml-8 ${data.all_ok ? 'status-good' : 'status-warning'}`}
              >
                {data.all_ok ? 'Tudo no ar' : 'Atenção'}
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="pill pill-sm"
            disabled={isFetching}
            aria-label="Recarregar status"
          >
            <RefreshCw className="w-12 h-12" aria-hidden="true" />
            {isFetching ? 'Verificando...' : 'Recarregar'}
          </button>
        </div>

        {isLoading && <LoadingSpinner />}
        {error && <ErrorAlert message={error.message} />}

        {data && (
          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="label pb-8 pr-12">Fonte</th>
                    <th className="label pb-8 pr-12">Host</th>
                    <th className="label pb-8 pr-12">Latência</th>
                    <th className="label pb-8">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((s) => (
                    <tr key={s.name} className="border-t border-border">
                      <td className="py-8 pr-12 text-14 font-medium text-text">{s.name}</td>
                      <td className="py-8 pr-12 mono text-12 text-muted">{s.host}</td>
                      <td className="py-8 pr-12 mono num text-13 text-muted">
                        {s.latency_ms != null ? `${s.latency_ms} ms` : 'n/d'}
                      </td>
                      <td className="py-8">
                        <span className={`status ${s.ok ? 'status-good' : 'status-critical'}`}>
                          {s.ok ? 'OK' : (s.detail || 'Falha')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
