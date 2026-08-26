import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { fetchDiseaseStats } from '../api/client'

// Panorama do catalogo: barras horizontais de magnitude (contagem), uma so cor
// (hue unico --accent, seguindo o metodo dataviz para magnitude), com rotulo e
// valor diretos. Reusa o .meter do Pure Design; funciona nos dois temas.
function BarRow({ label, count, max, title }) {
  const fill = max > 0 ? count / max : 0
  return (
    <div className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-12" title={title}>
      <span className="text-12 text-muted truncate">{label}</span>
      <span className="meter" role="img" aria-label={`${label}: ${count}`}>
        <span style={{ transform: `scaleX(${fill})`, background: 'var(--accent)' }} />
      </span>
      <span className="mono num text-12 text-text text-right">{count}</span>
    </div>
  )
}

function BarGroup({ title, items }) {
  if (!items?.length) return null
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <div>
      <p className="label mb-12">{title}</p>
      <div className="flex flex-col gap-8">
        {items.map((i) => (
          <BarRow key={i.key} label={i.label} count={i.count} max={max}
            title={`${i.label}: ${i.count} ${i.count === 1 ? 'doenca' : 'doencas'}`} />
        ))}
      </div>
    </div>
  )
}

export default function CatalogOverview() {
  const { data } = useQuery({
    queryKey: ['disease-stats'],
    queryFn: fetchDiseaseStats,
    staleTime: 1000 * 60 * 30,
  })
  if (!data) return null

  return (
    <section className="card mb-24" aria-labelledby="overview-title">
      <div className="flex items-start justify-between mb-16">
        <h2 id="overview-title" className="section-title flex items-center gap-8">
          <BarChart3 className="w-16 h-16 text-muted" aria-hidden="true" />
          Panorama do catálogo
        </h2>
        <span className="text-12 text-muted mono">{data.total} doenças</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-24">
        <BarGroup title="Por herança" items={data.by_inheritance} />
        <BarGroup title="Por categoria" items={data.by_category.slice(0, 6)} />
      </div>
    </section>
  )
}
