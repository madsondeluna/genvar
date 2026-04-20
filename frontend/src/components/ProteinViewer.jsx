import { useEffect, useRef, useState } from 'react'

const REPR_OPTIONS = [
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'surface', label: 'Superfície' },
  { value: 'ball+stick', label: 'Bola e bastão' },
  { value: 'ribbon', label: 'Fita' },
]

export default function ProteinViewer({ pdbUrl, uniprotId }) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const componentRef = useRef(null)
  const [repr, setRepr] = useState('cartoon')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!containerRef.current || !pdbUrl) return

    let cancelled = false
    let resizeObserver = null

    async function init() {
      const NGL = await import('ngl')
      if (cancelled) return

      const stage = new NGL.Stage(containerRef.current, {
        backgroundColor: 'white',
        quality: 'medium',
      })
      stageRef.current = stage

      resizeObserver = new ResizeObserver(() => stage.handleResize())
      resizeObserver.observe(containerRef.current)

      try {
        const comp = await stage.loadFile(pdbUrl, { ext: 'pdb' })
        if (cancelled) return

        componentRef.current = comp
        comp.addRepresentation('cartoon', {
          colorScheme: 'bfactor',
          colorScale: 'RdYlBu',
          colorReverse: true,
        })
        comp.autoView()
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Falha ao carregar a estrutura')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      componentRef.current = null
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (stageRef.current) {
        stageRef.current.dispose()
        stageRef.current = null
      }
    }
  }, [pdbUrl])

  function getReprParams(reprType) {
    // bfactor colorScheme only works reliably on cartoon/ribbon
    const usesBfactor = reprType === 'cartoon' || reprType === 'ribbon'
    return usesBfactor
      ? { colorScheme: 'bfactor', colorScale: 'RdYlBu', colorReverse: true }
      : { colorScheme: 'chainname' }
  }

  function changeRepresentation(newRepr) {
    setRepr(newRepr)
    const comp = componentRef.current
    if (!comp) return
    comp.removeAllRepresentations()
    comp.addRepresentation(newRepr, getReprParams(newRepr))
    comp.autoView()
  }

  function resetView() {
    componentRef.current?.autoView(500)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {REPR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => changeRepresentation(opt.value)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                repr === opt.value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={resetView}
          className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          aria-label="Resetar visualização"
        >
          Resetar
        </button>
      </div>

      <div
        className="relative w-full rounded border border-gray-200 overflow-hidden"
        style={{ height: 400 }}
        role="img"
        aria-label={uniprotId ? `Visualizador 3D para UniProt ${uniprotId}` : 'Visualizador 3D da proteína'}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10" aria-live="polite">
            <span className="text-sm text-gray-500">Carregando estrutura...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10" role="alert">
            <span className="text-sm text-red-600">{error}</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      <div className="flex items-center gap-6">
        <p className="text-xs text-gray-500">
          Arraste para girar &nbsp;|&nbsp; Use a roda para aplicar zoom &nbsp;|&nbsp; Clique direito + arrastar para mover
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500">Confiança:</span>
          <div className="flex items-center gap-1">
            <div className="w-16 h-2 rounded" style={{ background: 'linear-gradient(to right, #d73027, #fee090, #4575b4)' }} />
            <span className="text-xs text-gray-500">Baixa &rarr; Alta</span>
          </div>
        </div>
      </div>
    </div>
  )
}
