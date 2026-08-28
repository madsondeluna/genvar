import { Link } from 'react-router-dom'
import AppMenu, { ColorModeToggle } from './AppMenu'
import BrandMark from './BrandMark'
import NavSearch from './NavSearch'

// Barra das páginas internas: marca (leva à home), menu de seções e a busca.
// Passar `showSearch={false}` esconde a busca.
//
// O menu QUEBRA em linha nova quando não cabe, e não rola na horizontal.
// Rolagem foi tentada para deixar a barra com uma linha só em toda página, e o
// preço apareceu na tela: o último item fica cortado pela metade, e item de
// menu pela metade lê como defeito, não como "arraste para ver o resto".
//
// DUAS LINHAS, e elas são assumidas em vez de acontecerem. Doze destinos com
// rótulo, mais marca, busca e alternador, não cabem numa linha em 1280px: não
// existe arranjo de linha única aqui, só arranjos que escondem item ou cortam
// rótulo. Então a barra é uma GRADE de três colunas, marca, menu e controles,
// com o menu quebrando dentro da coluna do meio.
//
// O que isso conserta é o alinhamento. Numa fileira flexível, marca e controles
// ficavam centrados contra o bloco de DUAS linhas do menu, ou seja, alinhados a
// coisa nenhuma, e sobrava um item solto embaixo. Na grade as três colunas
// ancoram no TOPO (`align-items: start`), então a marca, a primeira fileira de
// itens e os controles dividem a mesma linha de base, e o que transborda desce
// alinhado ao primeiro item, e não à marca.
export default function PageNav({ showSearch = true }) {
  return (
    <nav className="app-nav z-10" aria-label="Principal">
      <div className="max-w-xl mx-auto px-24 py-12 barra-grade">
        {/* Marca e letreiro no tamanho menor: a barra cabe numa linha so, e os
            doze destinos com rotulo valem mais do que uma assinatura maior. */}
        <Link to="/" className="barra-marca flex items-center gap-8 text-14 text-text hover:opacity-70">
          <BrandMark className="w-24 h-24" />
          GenVar
        </Link>
        {/* A busca vem antes do alternador de cor: e a acao mais usada da barra. */}
        <AppMenu />
        <div className="barra-controles flex items-center gap-8">
          {showSearch && <NavSearch />}
          <ColorModeToggle />
        </div>
      </div>
    </nav>
  )
}
