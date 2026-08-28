// Marca do GenVar em SVG inline, redesenhada a partir do arquivo original em
// public/brand/genvar-mark.svg.
//
// A tinta e `currentColor` e nao o `#0E0F13` do arquivo: como <img> nao deixa o
// CSS alcancar o interior, inline e a unica forma de a marca seguir `--text` e
// acompanhar os quatro modos sem um segundo arquivo por modo.
//
// A HIERARQUIA DE TONS vem do original e nao e enfeite: sao quatro pesos, e
// eles e que separam os aneis um do outro. Aneis externos em 0,4, anel interno
// em 0,18, barra em 0,4 e o ponto cheio. Uma versao anterior pintou tudo com
// tinta cheia para o simbolo nao sair lavado a 24px; o efeito foi o oposto, os
// aneis fundiram num borrao unico e o desenho sumiu dentro de si mesmo. A 32px
// os tons voltam a caber, e e o tamanho que a barra usa hoje.
//
// Ficaram de fora os `filter` de sombra e os `foreignObject` de desfoque do
// export do Figma. Os dois foram desenhados para a arte em 512px: a 32px uma
// sombra de 6px de raio e mais larga que o traco que a projeta, e o desenho sai
// exatamente com a aparencia de imagem de baixa resolucao que se quer evitar.
//
// A caixa foi recortada na TINTA, medida com getBBox mais metade do traco: a
// original tinha 12 de folga a esquerda, 13 a direita, 7 em cima e 18 embaixo,
// e a assimetria empurrava a marca para cima dentro do quadrado.
export default function BrandMark({ className = '', title = 'Marca do GenVar' }) {
  return (
    <svg
      viewBox="10.1 7 141 141"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <path
        d="M141.692 99.1058C130.367 130.171 96.9317 147.181 65.1617 138.061M53.4617 133.411C24.1217 118.171 11.5667 82.8308 24.6917 52.4858M30.8267 41.4908C49.7267 14.3708 86.3717 6.46577 114.782 23.3858"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M100.863 117.454C86.0883 123.199 69.3783 120.454 57.2133 110.299C45.0483 100.144 39.3783 84.1686 42.3933 68.6136C45.4083 53.0586 56.6583 40.3836 71.7333 35.5086"
        stroke="currentColor"
        strokeOpacity="0.18"
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
        fillOpacity="0.4"
      />
      <circle cx="80.5965" cy="77.5086" r="12" fill="currentColor" />
    </svg>
  )
}
