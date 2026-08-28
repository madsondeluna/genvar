import Icon from './Icon'
// Aviso medico global e persistente. Renderizado uma vez no App, aparece em
// todas as paginas.
//
// A atribuicao das fontes NAO mora aqui: ela vive em /fontes, alcancavel de
// qualquer pagina pelo item "Fontes" da barra de navegacao. O CC BY 4.0 do
// Orphanet, do PanelApp e do PGS Catalog exige atribuicao "de maneira razoavel
// para o meio", e uma pagina de creditos ligada na navegacao cumpre isso; o que
// nao cumpriria seria nao existir credito nenhum.
export default function MedicalDisclaimer() {
  return (
    <aside className="border-t border-border bg-bg reserva-rodape" role="note" aria-label="Aviso">
      <div className="max-w-xl mx-auto px-24 py-16 flex items-start gap-10">
        <Icon name="info" className="text-muted mt-2" />
        <p className="text-12 leading-snug">
          Esta aplicação é para fins de informação e pesquisa. Não substitui avaliação, diagnóstico
          ou aconselhamento médico. Para orientação clínica, procure um profissional de saúde
          especializado.
        </p>
      </div>
    </aside>
  )
}
