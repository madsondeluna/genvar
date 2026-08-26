import { Component } from 'react'
import Icon from './Icon'
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
      <div className="min-h-screen bg-bg flex items-center justify-center px-24">
        <div className="card max-w-sm w-full flex flex-col gap-16">
          <div className="flex items-start gap-12">
            <Icon name="alert" size="md" style={{ color: 'var(--state-critical)' }} />
            <div>
              <p className="text-14 font-medium text-text">Algo quebrou nesta página.</p>
              <p className="text-14 text-muted mt-4">
                {this.state.error?.message || 'Erro inesperado de renderização.'}
              </p>
            </div>
          </div>
          <div className="flex gap-8">
            <button type="button" className="pill pill-sm" onClick={this.handleReset}>
              Tentar novamente
            </button>
            <a href="/" className="pill pill-solid pill-sm">
              Voltar para a home
            </a>
          </div>
        </div>
      </div>
    )
  }
}
