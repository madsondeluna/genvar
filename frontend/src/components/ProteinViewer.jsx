import { useEffect, useRef, useState } from 'react'
import { pureToken } from '../utils/pureTokens'

// A escala de confiança (pLDDT, campo bfactor) usa a rampa divergente do Pure:
// --div-9 (baixa) a --div-1 (alta), passando pelo neutro. A legenda desenha a
// mesma rampa com os mesmos tokens, então viewer e legenda nunca divergem.

const REPR_OPTIONS = [
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'surface', label: 'Superfície' },
  { value: 'ball+stick', label: 'Bola e bastão' },
  { value: 'ribbon', label: 'Fita' },
]

function confidenceScale() {
  // pLDDT baixo -> alto: vermelho -> neutro -> azul
  return ['--div-9', '--div-7', '--div-5', '--div-3', '--div-1'].map(pureToken)
}

export default function ProteinViewer({ pdbUrl, uniprotId }) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const componentRef = useRef(null)
  const [repr, setRepr] = useState('cartoon')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function getReprParams(reprType) {
    // bfactor colorScheme only works reliably on cartoon/ribbon
    const usesBfactor = reprType === 'cartoon' || reprType === 'ribbon'
    return usesBfactor
      ? { colorScheme: 'bfactor', colorScale: confidenceScale() }
      : { colorScheme: 'chainname' }
  }

  useEffect(() => {
    if (!containerRef.current || !pdbUrl) return

    let cancelled = false
    let resizeObserver = null

    async function init() {
      const NGL = await import('ngl')
      if (cancelled) return

      const stage = new NGL.Stage(containerRef.current, {
        backgroundColor: pureToken('--surface'),
        quality: 'medium',
      })
      stageRef.current = stage

      resizeObserver = new ResizeObserver(() => stage.handleResize())
      resizeObserver.observe(containerRef.current)

      try {
        // Abort after 30 s to avoid hanging indefinitely on slow AlphaFold CDN responses
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)
        const comp = await stage.loadFile(pdbUrl, { ext: 'pdb', signal: controller.signal })
        clearTimeout(timeoutId)
        if (cancelled) return

        componentRef.current = comp
        comp.addRepresentation('cartoon', getReprParams('cartoon'))
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
    <div className="flex flex-col gap-12">
      <div className="flex items-center justify-between gap-16 flex-wrap">
        <div className="flex items-center gap-8">
          {REPR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => changeRepresentation(opt.value)}
              className="pill pill-sm"
              aria-pressed={repr === opt.value}
              style={repr === opt.value ? { borderColor: 'var(--text)' } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={resetView}
          className="pill pill-solid pill-sm"
          aria-label="Resetar visualização"
        >
          Resetar
        </button>
      </div>

      <div
        className="relative w-full rounded-media border border-border overflow-hidden"
        style={{ height: 'calc(var(--photo-sm) * 4)' }}
        role="img"
        aria-label={uniprotId ? `Visualizador 3D para UniProt ${uniprotId}` : 'Visualizador 3D da proteína'}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dim z-10" aria-live="polite">
            <span className="text-14 text-muted">Carregando estrutura...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dim z-10" role="alert">
            <span className="text-14" style={{ color: 'var(--state-critical)' }}>{error}</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      <div className="flex items-center gap-24 flex-wrap">
        <p className="text-12 text-muted">
          Arraste para girar | Use a roda para aplicar zoom | Clique direito + arrastar para mover
        </p>
        <div className="flex items-center gap-8 ml-auto">
          <span className="text-12 text-muted">Confiança:</span>
          <div className="flex items-center gap-4">
            <div
              className="w-64 h-8"
              style={{
                borderRadius: 'var(--radius-mark)',
                background:
                  'linear-gradient(to right, var(--div-9), var(--div-7), var(--div-5), var(--div-3), var(--div-1))',
              }}
            />
            <span className="text-12 text-muted">Baixa &rarr; Alta</span>
          </div>
        </div>
      </div>
    </div>
  )
}
