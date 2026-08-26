import {
  ANCESTRIES, ANCESTRY_LABEL,
  MASK_LABEL, MAF_LABEL, TESTS,
} from './constants'

// Barra de filtros da camada de associacao: ancestria, mascara de variantes,
// limite de MAF e teste estatistico. Numa linha so, acima dos plots (padrao da
// linguagem de UX). Controles nativos com tokens Pure Design (.select-shell).
function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-4 min-w-0">
      <span className="label" title={hint}>{label}</span>
      <span className="select-shell">{children}</span>
    </label>
  )
}

export default function FilterBar({
  phenotypes, ancestry, maskIndex, mafIndex, test, phenoIndex, onChange,
}) {
  const set = (patch) => onChange({ ancestry, maskIndex, mafIndex, test, phenoIndex, ...patch })

  return (
    <div className="card grid grid-cols-2 md:grid-cols-5 gap-16">
      <Field label="Fenótipo" hint="Traço ou doença analisada">
        <select
          className="select"
          value={phenoIndex}
          onChange={(e) => set({ phenoIndex: e.target.value })}
        >
          <option value="all">Todos os fenótipos</option>
          {phenotypes.map((p, i) => (
            <option key={p.id} value={i}>{p.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Ancestria" hint="Populacao de origem; AMR = latina/miscigenada das Américas">
        <select
          className="select"
          value={ancestry}
          onChange={(e) => set({ ancestry: e.target.value })}
        >
          {ANCESTRIES.map((a) => (
            <option key={a} value={a}>{ANCESTRY_LABEL[a]}</option>
          ))}
        </select>
      </Field>

      <Field label="Máscara" hint="Categoria funcional das variantes agregadas no gene">
        <select
          className="select"
          value={maskIndex}
          onChange={(e) => set({ maskIndex: Number(e.target.value) })}
        >
          {MASK_LABEL.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
      </Field>

      <Field label="MAF máx." hint="Frequência alélica menor: só variantes mais raras que o limite">
        <select
          className="select"
          value={mafIndex}
          onChange={(e) => set({ mafIndex: Number(e.target.value) })}
        >
          {MAF_LABEL.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
      </Field>

      <Field label="Teste" hint="Teste de associação gene-based">
        <select
          className="select"
          value={test}
          onChange={(e) => set({ test: e.target.value })}
        >
          {TESTS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
    </div>
  )
}
