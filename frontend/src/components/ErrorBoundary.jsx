import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') {
      console.error('[GenVar] UI crashed:', error, info?.componentStack)
    }
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full border border-gray-200 rounded-lg p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-gray-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Algo quebrou nesta página.</p>
              <p className="text-sm text-gray-600 mt-1">
                {this.state.error?.message || 'Erro inesperado de renderização.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary py-1.5 px-3 text-xs"
              onClick={this.handleReset}
            >
              Tentar novamente
            </button>
            <a href="/" className="btn-secondary py-1.5 px-3 text-xs">
              Voltar para a home
            </a>
          </div>
        </div>
      </div>
    )
  }
}
