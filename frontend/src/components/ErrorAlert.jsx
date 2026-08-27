import Icon from './Icon'
export default function ErrorAlert({ message }) {
  return (
    <div className="flex items-start gap-12 p-16 border rounded-media tint-critical" role="alert">
      <Icon name="alert" size="md" style={{ color: 'var(--state-critical)' }} />
      <div>
        <p className="text-14 font-medium" style={{ color: 'var(--state-critical)' }}>Erro</p>
        <p className="text-14 mt-2">{message}</p>
      </div>
    </div>
  )
}
