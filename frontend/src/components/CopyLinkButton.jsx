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
      className="pill pill-sm"
    >
      {copied ? (
        <>
          <Check className="w-12 h-12" aria-hidden="true" />
          Copiado
        </>
      ) : (
        <>
          <Link2 className="w-12 h-12" aria-hidden="true" />
          Compartilhar link
        </>
      )}
    </button>
  )
}
