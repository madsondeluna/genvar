import { AlertCircle } from 'lucide-react'

export default function ErrorAlert({ message }) {
  return (
    <div className="flex items-start gap-12 p-16 border rounded-media tint-critical" role="alert">
      <AlertCircle className="w-20 h-20 flex-shrink-0" style={{ color: 'var(--state-critical)' }} aria-hidden="true" />
      <div>
        <p className="text-14 font-medium" style={{ color: 'var(--state-critical)' }}>Erro</p>
        <p className="text-14 text-muted mt-2">{message}</p>
      </div>
    </div>
  )
}
