import { ExternalLink } from 'lucide-react'

export default function ExternalLinkButton({ href, label, download = false, ariaLabel }) {
  return (
    <a
      href={href}
      target={download ? undefined : '_blank'}
      rel={download ? undefined : 'noopener noreferrer'}
      download={download || undefined}
      aria-label={ariaLabel || `Abrir ${label} em nova aba`}
      className="pill pill-sm"
    >
      {label}
      <ExternalLink className="w-12 h-12" aria-hidden="true" />
    </a>
  )
}
