import { Info } from 'lucide-react'

// Aviso global e persistente: a aplicacao e informativa/de pesquisa e nao
// substitui avaliacao medica. Renderizado uma vez no App, aparece em todas as
// paginas. Tokens Pure Design, discreto e legivel nos dois temas.
export default function MedicalDisclaimer() {
  return (
    <aside className="border-t border-border bg-bg" role="note" aria-label="Aviso">
      <div className="max-w-xl mx-auto px-24 py-16 flex items-start gap-10">
        <Info className="w-14 h-14 text-muted flex-shrink-0 mt-2" aria-hidden="true" />
        <p className="text-12 text-muted leading-snug">
          Esta aplicação é para fins de informação e pesquisa. Não substitui avaliação, diagnóstico
          ou aconselhamento médico. Para orientação clínica, procure um profissional de saúde
          especializado.
        </p>
      </div>
    </aside>
  )
}
