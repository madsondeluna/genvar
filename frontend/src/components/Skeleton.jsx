export function SkeletonLine({ className = '' }) {
  return <div className={`h-4 bg-gray-100 rounded animate-pulse ${className}`} />
}

export function SkeletonBlock({ className = '' }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />
}

export function GenePageSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div>
        <SkeletonLine className="w-20 mb-3" />
        <SkeletonBlock className="h-10 w-64 mb-3" />
        <SkeletonLine className="w-full max-w-2xl mb-2" />
        <SkeletonLine className="w-3/4 max-w-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-gray-50 rounded-lg mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <SkeletonLine className="w-20 h-3" />
              <SkeletonLine className="w-28" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <SkeletonLine className="w-40 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-20" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
      <SkeletonBlock className="h-48" />
    </div>
  )
}

export function VariantPageSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div>
        <SkeletonLine className="w-20 mb-3" />
        <SkeletonBlock className="h-10 w-64 mb-3" />
        <SkeletonLine className="w-80 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 bg-gray-50 rounded-lg">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <SkeletonLine className="w-20 h-3" />
              <SkeletonLine className="w-28" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonBlock className="h-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
      <SkeletonBlock className="h-80" />
    </div>
  )
}
