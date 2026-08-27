// Marca do GenVar em SVG inline. O arquivo em public/brand e monocromatico
// (#0E0F13 em todas as demaos), e como <img> nao deixa o CSS alcancar o
// interior, a tinta aqui e currentColor: a marca segue --text e acompanha os
// quatro modos sem um segundo arquivo. Tinta cheia em todos os aneis: com as
// opacidades originais (0.4 e 0.18) o simbolo saia lavado ao lado do letreiro.
export default function BrandMark({ className = '', title = 'Marca do GenVar' }) {
  return (
    <svg
      viewBox="0 0 162 166"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <path
        d="M141.692 99.1058C130.367 130.171 96.9317 147.181 65.1617 138.061M53.4617 133.411C24.1217 118.171 11.5667 82.8308 24.6917 52.4858M30.8267 41.4908C49.7267 14.3708 86.3717 6.46577 114.782 23.3858"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M100.863 117.454C86.0883 123.199 69.3783 120.454 57.2133 110.299C45.0483 100.144 39.3783 84.1686 42.3933 68.6136C45.4083 53.0586 56.6583 40.3836 71.7333 35.5086"
        stroke="currentColor"
        strokeWidth="13.5"
        strokeLinecap="round"
      />
      <rect
        x="68.5965"
        y="69.5086"
        width="78"
        height="15"
        rx="6"
        fill="currentColor"
      />
      <circle cx="80.5965" cy="77.5086" r="12" fill="currentColor" />
    </svg>
  )
}
