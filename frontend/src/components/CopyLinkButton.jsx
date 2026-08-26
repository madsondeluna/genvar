import { useState } from 'react'
import Icon from './Icon'
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
          <Icon name="check" />
          Copiado
        </>
      ) : (
        <>
          <Icon name="link" />
          Compartilhar link
        </>
      )}
    </button>
  )
}
