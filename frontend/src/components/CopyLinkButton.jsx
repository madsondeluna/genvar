import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

export default function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copiar link da página"
      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" aria-hidden="true" />
          Copiado
        </>
      ) : (
        <>
          <Link2 className="w-3 h-3" aria-hidden="true" />
          Compartilhar link
        </>
      )}
    </button>
  )
}
