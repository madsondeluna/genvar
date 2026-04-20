import { AlertCircle } from 'lucide-react'

export default function ErrorAlert({ message }) {
  return (
    <div className="flex items-start gap-3 p-4 border border-gray-300 rounded-md bg-gray-50">
      <AlertCircle className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-gray-900">Erro</p>
        <p className="text-sm text-gray-600 mt-0.5">{message}</p>
      </div>
    </div>
  )
}
