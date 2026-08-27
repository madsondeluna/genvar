import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import SuggestBox from './SuggestBox'

// Busca da barra: um botão de ícone que abre um painel abaixo da navbar.
//
// A barra tem marca, dez seções e a busca. Com o campo aberto o tempo todo,
// ele espremia até virar um retângulo vazio de 40px, que lê como campo
// quebrado. O ícone devolve o espaço e o painel abre com a largura inteira.
//
// A abertura usa .motion-dropdown da linguagem, com data-origin no canto do
// gatilho: o painel nasce onde o botão está, senão cresce do centro e não se
// liga a nada. Fechar é mais rápido que abrir, porque a decisão já foi tomada.
export default function NavSearch() {
  const [aberto, setAberto] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [valor, setValor] = useState('')
  const raiz = useRef(null)
  const navigate = useNavigate()

  function fechar() {
    if (!aberto) return
    setFechando(true)
    setAberto(false)
    // o painel sai da árvore só depois da transição; com visibility e não com
    // opacity, para não continuar alcançável pelo teclado enquanto some
    setTimeout(() => setFechando(false), 200)
  }

  useEffect(() => {
    if (!aberto) return
    const porFora = (e) => { if (!raiz.current?.contains(e.target)) fechar() }
    const porTecla = (e) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('pointerdown', porFora)
    document.addEventListener('keydown', porTecla)
    return () => {
      document.removeEventListener('pointerdown', porFora)
      document.removeEventListener('keydown', porTecla)
    }
  }, [aberto])

  return (
    <div ref={raiz} className="nav-search">
      <button
        type="button"
        className={`pill pill-sm hit ${aberto ? 'pill-solid' : ''}`}
        aria-label={aberto ? 'Fechar a busca' : 'Abrir a busca'}
        aria-expanded={aberto}
        onClick={() => (aberto ? fechar() : setAberto(true))}
      >
        <Icon name={aberto ? 'close' : 'search'} />
      </button>

      {(aberto || fechando) && (
        <div
          className={`nav-search-panel card-glass glass-deep motion-dropdown ${aberto ? 'is-open' : 'is-closing'}`}
          data-origin="top-right"
          role="search"
        >
          <div className="flex items-center gap-8">
            <Icon name="search" className="text-muted" />
            <SuggestBox
              className="flex-1"
              inputClassName="input"
              label="Buscar gene, variante ou doença"
              placeholder="Gene (ex.: BRCA1), variante (ex.: rs334) ou doença (ex.: Lynch)"
              value={valor}
              onChange={setValor}
              autoFocus
              onPick={(item, rota) => { setValor(''); fechar(); navigate(rota) }}
            />
          </div>
          <p className="text-12 mt-8">
            Um só campo: reconhece símbolo de gene, rs ID de variante ou nome de doença.
          </p>
        </div>
      )}
    </div>
  )
}
