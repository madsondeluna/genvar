export default function LoadingSpinner({ message = 'Carregando...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-64 gap-16">
      <div className="spinner" aria-hidden="true" />
      <p className="text-14 text-muted">{message}</p>
    </div>
  )
}
