import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'

// Faixa das ferramentas de arquivo. Elas são quatro trabalhos diferentes sobre
// o mesmo tipo de entrada, e amontoá-las numa página só faria o que a página de
// VCF já é: longa demais. Cada uma tem a sua, e esta faixa é o que liga as
// quatro sem acrescentar quatro itens à navegação, que já tem onze.
export const FERRAMENTAS = [
  {
    to: '/vcf',
    icone: 'file',
    nome: 'Uma amostra',
    resumo: 'Laudo completo, herança e painel',
  },
  {
    to: '/lote',
    icone: 'list',
    nome: 'Lote',
    resumo: 'Muitos arquivos, consolidado da coorte',
  },
  {
    to: '/concordancia',
    icone: 'branch',
    nome: 'Concordância',
    resumo: 'Dois VCF da mesma amostra, sensibilidade e precisão',
    pronta: false,
  },
  {
    to: '/cobertura',
    icone: 'chart-bar',
    nome: 'Cobertura',
    resumo: 'O que o exame não conseguiu avaliar',
    pronta: false,
  },
]

export default function FerramentasVcf() {
  const { pathname } = useLocation()
  return (
    <nav className="ferramentas mb-24" aria-label="Ferramentas de arquivo">
      {FERRAMENTAS.map((f) => {
        const ativa = pathname === f.to
        const conteudo = (
          <>
            <Icon name={f.icone} />
            <span className="flex flex-col gap-2" style={{ minWidth: 0 }}>
              <span className="text-13 text-text">
                {f.nome}
                {f.pronta === false && <span className="label"> · em construção</span>}
              </span>
              <span className="label truncate">{f.resumo}</span>
            </span>
          </>
        )
        // Ferramenta ainda não construída NÃO vira link. Um link para uma rota
        // que não existe leva a uma tela em branco, e a leitura disso é que a
        // aplicação quebrou, não que o recurso está em construção.
        if (f.pronta === false) {
          return (
            <span key={f.to} className="ferramenta is-pendente" aria-disabled="true">
              {conteudo}
            </span>
          )
        }
        return (
          <Link
            key={f.to}
            to={f.to}
            className={`ferramenta ${ativa ? 'is-ativa' : ''}`}
            aria-current={ativa ? 'page' : undefined}
          >
            {conteudo}
          </Link>
        )
      })}
    </nav>
  )
}
