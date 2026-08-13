import { useEffect, useMemo, useRef, useState } from 'react'

let uid = 0

function nextContainerId() {
  uid += 1
  return `ideogram-container-${uid}-${Date.now()}`
}

export default function ChromosomeIdeogram({
  annotations = [],
  title = 'Mapa cromossômico',
  description,
  focusChromosome = null,
  chrHeight,
  chrMargin,
  annotationsLayout = 'overlay',
  annotationHeight,
  legendItems = null,
  showBandLabels = null,
  expandSinglePointBy = 0,
}) {
  const [containerId] = useState(nextContainerId)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const ideogramRef = useRef(null)

  const effectiveAnnotations = useMemo(() => {
    if (!expandSinglePointBy) return annotations
    return annotations.map((a) => {
      if (a.stop - a.start <= 1) {
        const half = Math.floor(expandSinglePointBy / 2)
        return { ...a, start: Math.max(1, a.start - half), stop: a.start + half }
      }
      return a
    })
  }, [annotations, expandSinglePointBy])

  const annotationsKey = useMemo(
    () => effectiveAnnotations.map((a) => `${a.chr}:${a.start}:${a.stop}:${a.color}`).join('|'),
    [effectiveAnnotations],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function render() {
      try {
        const mod = await import('ideogram')
        if (cancelled) return
        const Ideogram = mod.default || mod
        const el = document.getElementById(containerId)
        if (!el) return
        el.innerHTML = ''

        const isFocus = Boolean(focusChromosome)

        const config = {
          organism: 'human',
          assembly: 'GRCh38',
          container: `#${containerId}`,
          chrLabelSize: 11,
          rotatable: false,
          annotationHeight: annotationHeight ?? (isFocus ? 26 : 12),
          annotationsLayout,
          annotations: effectiveAnnotations,
          chrHeight: chrHeight ?? (isFocus ? 700 : 140),
          chrMargin: chrMargin ?? (isFocus ? 40 : 10),
          chrWidth: isFocus ? 26 : 14,
          showBandLabels: showBandLabels ?? isFocus,
          orientation: isFocus ? 'horizontal' : 'vertical',
          onLoad: () => {
            if (!cancelled) setLoading(false)
          },
        }

        if (isFocus) {
          config.chromosomes = [String(focusChromosome)]
        }

        ideogramRef.current = new Ideogram(config)
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to render ideogram')
          setLoading(false)
        }
      }
    }

    render()

    return () => {
      cancelled = true
      const el = document.getElementById(containerId)
      if (el) el.innerHTML = ''
      ideogramRef.current = null
    }
  }, [containerId, annotationsKey, focusChromosome, annotationsLayout, annotationHeight, chrHeight, chrMargin, showBandLabels])

  return (
    <section className="card" aria-labelledby={`${containerId}-title`}>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-8">
        <h3 id={`${containerId}-title`} className="section-title">{title}</h3>
        <span className="text-12 text-muted mono">GRCh38</span>
      </div>
      {description && <p className="text-12 text-muted mb-12">{description}</p>}

      {legendItems && legendItems.length > 0 && (
        <div className="flex flex-wrap gap-x-16 gap-y-8 mb-12">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-6">
              <span
                className="inline-block w-10 h-10 flex-shrink-0"
                style={{ backgroundColor: item.color, borderRadius: 'var(--radius-mark)' }}
                aria-hidden="true"
              />
              <span className="text-12 text-muted">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-14 py-16" style={{ color: 'var(--state-critical)' }} role="alert">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="text-12 text-muted py-8" aria-live="polite">
          Carregando mapa cromossômico...
        </div>
      )}

      <div
        id={containerId}
        className="ideogram-host overflow-x-auto"
        style={{ minHeight: 'calc(var(--photo-sm) * 1.25)' }}
      />

      {!loading && effectiveAnnotations.length === 0 && (
        <p className="text-12 text-muted mt-8">Sem dados posicionais para exibir.</p>
      )}
    </section>
  )
}
