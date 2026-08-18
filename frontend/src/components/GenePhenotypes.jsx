import { useQuery } from '@tanstack/react-query'
import { fetchGenePhenotypes } from '../api/client'
import ExternalLinkButton from './ExternalLinkButton'

// Doenças e fenótipos associados ao gene, com a divisão que a fonte permite
// sustentar: doenças mendelianas vindas de curadoria clínica (OMIM, Orphanet,
// GenCC, G2P via Ensembl) e sinais poligênicos do GWAS Catalog (NHGRI-EBI).
// O modo de herança vem dos termos HPO que a curadoria Orphanet embute.

const SOURCE_LABELS = {
  'MIM morbid': 'OMIM',
  Orphanet: 'Orphanet',
  GenCC: 'GenCC',
  G2P: 'G2P',
  DDG2P: 'G2P',
}

function SourceTag({ source }) {
  return (
    <span className="text-11 mono text-muted border border-border rounded-mark px-4">
      {SOURCE_LABELS[source] || source}
    </span>
  )
}

export default function GenePhenotypes({ symbol }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['gene-phenotypes', symbol],
    queryFn: () => fetchGenePhenotypes(symbol),
    retry: 1,
    staleTime: 1000 * 60 * 10,
  })

  return (
    <section className="card" aria-labelledby="phenotypes-title">
      <h3 id="phenotypes-title" className="section-title mb-8">Doenças e fenótipos associados</h3>
      <p className="text-12 text-muted mb-12">
        Associações gene-doença de fontes com curadoria clínica (OMIM, Orphanet, GenCC e G2P,
        agregadas pelo Ensembl). O modo de herança, quando exibido, vem da curadoria Orphanet.
        Abaixo, características influenciadas por muitas variantes de efeito pequeno
        (arquitetura poligênica), do GWAS Catalog.
      </p>

      {isLoading && (
        <div className="text-12 text-muted py-8" aria-live="polite">
          Buscando associações curadas...
        </div>
      )}

      {error && (
        <div className="empty">Não foi possível carregar as associações agora.</div>
      )}

      {data && data.mendelian.length === 0 && data.gwas.length === 0 && (
        <div className="empty">Nenhuma associação curada registrada para este gene.</div>
      )}

      {data && data.mendelian.length > 0 && (
        <div className="mb-16">
          <p className="label mb-8">Doenças mendelianas (monogênicas)</p>
          <ul className="flex flex-col gap-8">
            {data.mendelian.map((d) => (
              <li
                key={d.description}
                className="flex items-start justify-between gap-12 pb-8 border-b border-hairline last:border-b-0"
              >
                <div className="flex flex-col gap-4">
                  <span className="text-14 text-text">{d.description}</span>
                  {d.inheritance.length > 0 && (
                    <span className="text-12 text-muted">
                      Herança {d.inheritance.join(', ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap justify-end shrink-0">
                  {d.sources
                    .filter((s) => !(s === 'MIM morbid' && d.omim_id))
                    .map((s) => (
                      <SourceTag key={s} source={s} />
                    ))}
                  {d.omim_id && (
                    <ExternalLinkButton
                      href={`https://omim.org/entry/${d.omim_id}`}
                      label="OMIM"
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.gwas.length > 0 && (
        <div>
          <p className="label mb-8">Associações poligênicas (GWAS Catalog)</p>
          <ul className="flex flex-wrap gap-8">
            {data.gwas.map((g) => (
              <li
                key={g.trait}
                className="text-12 text-muted border border-border rounded-control px-8 py-2"
                title={
                  g.best_p_value != null
                    ? `${g.association_count} associações no catálogo; menor p = ${g.best_p_value.toExponential(1)}`
                    : `${g.association_count} associações no catálogo`
                }
              >
                {g.trait} <span className="mono num">({g.association_count})</span>
              </li>
            ))}
          </ul>
          {(data.gwas_trait_total > data.gwas.length || data.gwas_truncated) && (
            <p className="text-12 text-muted mt-8">
              Mostrando as {data.gwas.length} características com mais associações
              {data.gwas_trait_total > data.gwas.length &&
                `, de ${data.gwas_trait_total.toLocaleString('pt-BR')} distintas`}
              ; {data.gwas_association_total.toLocaleString('pt-BR')} associações registradas
              para o gene no catálogo.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
