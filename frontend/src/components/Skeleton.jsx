// O esqueleto copia a caixa do conteúdo final (.skeleton e .skeleton-line
// vêm do patterns.css). Alturas de gráfico acompanham as dos componentes reais.

export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton skeleton-line ${className}`} />
}

export function SkeletonBlock({ className = '', style }) {
  return <div className={`skeleton rounded-media ${className}`} style={style} />
}

export function GenePageSkeleton() {
  return (
    <div className="flex flex-col gap-32" aria-busy="true" aria-live="polite">
      <div>
        <SkeletonLine className="w-80 mb-12" />
        <SkeletonBlock className="h-40 w-64 mb-12" style={{ width: 'calc(var(--photo-sm) * 2.5)' }} />
        <SkeletonLine className="w-full max-w-(--measure-wide) mb-8" />
        <SkeletonLine className="w-3/4 max-w-(--measure-wide)" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-24 p-16 bg-dim rounded-surface mt-16">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-8">
              <SkeletonLine className="w-80" />
              <SkeletonLine className="w-96" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <SkeletonLine className="w-96 mb-16" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-80" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
        <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 2.5)' }} />
        <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 2.5)' }} />
      </div>
      <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 2)' }} />
    </div>
  )
}

export function VariantPageSkeleton() {
  return (
    <div className="flex flex-col gap-32" aria-busy="true" aria-live="polite">
      <div>
        <SkeletonLine className="w-80 mb-12" />
        <SkeletonBlock className="h-40 mb-12" style={{ width: 'calc(var(--photo-sm) * 2.5)' }} />
        <SkeletonLine className="mb-16" style={{ width: 'calc(var(--photo-sm) * 3)' }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-24 p-16 bg-dim rounded-surface">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-8">
              <SkeletonLine className="w-80" />
              <SkeletonLine className="w-96" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 2)' }} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
        <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 2.5)' }} />
        <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 2.5)' }} />
      </div>
      <SkeletonBlock style={{ height: 'calc(var(--photo-sm) * 3.5)' }} />
    </div>
  )
}
