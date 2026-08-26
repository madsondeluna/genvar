// Icone da linguagem Pure: usa o sprite servido em public/pure/icons.svg via
// <use>, com a espessura e o tamanho vindos da classe .icon (token --stroke).
// currentColor em toda a familia, entao o icone assume a tinta do container.
// Tamanhos: 'sm' (16, metadado), 'md' (20, controle), 'lg' (24, titulo).
const SIZE = { sm: 'icon-sm', md: '', lg: 'icon-lg' }

export default function Icon({ name, size = 'sm', className = '', style, title }) {
  const base = import.meta.env.BASE_URL
  const cls = `icon ${SIZE[size] || ''} ${className}`.replace(/\s+/g, ' ').trim()
  return (
    <svg className={cls} style={style} {...(title ? { role: 'img' } : { 'aria-hidden': true })}>
      {title ? <title>{title}</title> : null}
      <use href={`${base}pure/icons.svg#${name}`} />
    </svg>
  )
}
