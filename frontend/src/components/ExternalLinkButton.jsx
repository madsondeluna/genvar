import { ExternalLink } from 'lucide-react'

export default function ExternalLinkButton({ href, label, download = false, ariaLabel }) {
  return (
    <a
      href={href}
      target={download ? undefined : '_blank'}
      rel={download ? undefined : 'noopener noreferrer'}
      download={download || undefined}
      aria-label={ariaLabel || `Abrir ${label} em nova aba`}
      className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
    >
      {label}
      <ExternalLink className="w-3 h-3" aria-hidden="true" />
    </a>
  )
}
