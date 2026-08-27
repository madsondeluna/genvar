import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { carregarPaineis } from '../vcf/interpretacao'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

// Duas escolhas que mudam tudo o que vem depois: contra qual painel de genes o
// arquivo é lido, e qual amostra é quem, quando há mais de uma.
//
// Painel primeiro porque é assim que um laboratório trabalha: não se analisa o
// exoma inteiro, analisa-se o exoma contra o painel da suspeita clínica. Trinta
// mil variantes viram quarenta, e as quarenta são as que alguém consegue olhar.
export default function PainelETrio({
  painel, onPainel, amostras, papeis, onPapeis, termos, onTermos, nVariantes, nFiltradas,
}) {
  const [paineis, setPaineis] = useState(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [rascunho, setRascunho] = useState('')

  useEffect(() => { carregarPaineis().then(setPaineis).catch(() => setPaineis(false)) }, [])

  const encontrados = useMemo(() => {
    if (!paineis?.paineis) return []
    const q = busca.trim().toLowerCase()
    const lista = paineis.paineis
    if (!q) return lista.slice(0, 40)
    return lista.filter((p) =>
      p.nome.toLowerCase().includes(q)
      || (p.condicoes || []).some((c) => c.toLowerCase().includes(q))
      || p.genes.some((g) => g.toLowerCase() === q),
    ).slice(0, 40)
  }, [paineis, busca])

  const multi = amostras.length > 1

  function definirPapel(i, papel) {
    const novo = { ...papeis }
    for (const k of Object.keys(novo)) if (novo[k] === i) delete novo[k]
    if (papel) novo[papel] = i
    onPapeis(novo)
  }

  const papelDe = (i) => Object.entries(papeis).find(([, v]) => v === i)?.[0] || ''

  return (
    <div className="card flex flex-col gap-16 mb-24">
      <div className="grid gap-24 about-cards">
        <section className="flex flex-col gap-8">
          <span className="flex items-baseline justify-between gap-8 flex-wrap">
            <h3 className="text-16 font-medium text-text">Painel de genes</h3>
            {painel && (
              <span className="label">
                {fmt(nFiltradas)} de {fmt(nVariantes)} variantes no painel
              </span>
            )}
          </span>
          <p className="text-12 leading-snug about-left">
            É assim que um laboratório clínico lê um exoma: contra o painel da suspeita, não inteiro.
            Os painéis são os genes verdes do PanelApp, que é o nível de evidência suficiente para
            uso diagnóstico, mais os genes acionáveis do ACMG SF v3.2.
          </p>

          {paineis === false && <p className="text-13">Não foi possível carregar os painéis.</p>}
          {paineis === null && <p className="text-13">Carregando painéis...</p>}

          {paineis && (
            <>
              <div className="flex gap-8 flex-wrap items-center">
                {painel ? (
                  <>
                    <span className="tag">{painel.nome}</span>
                    <span className="label">{fmt(painel.genes.length)} genes</span>
                    <button type="button" className="pill pill-sm" onClick={() => onPainel(null)}>
                      <Icon name="close" /> Analisar o arquivo inteiro
                    </button>
                  </>
                ) : (
                  <span className="label">Nenhum painel: o arquivo inteiro está sendo analisado</span>
                )}
                <button type="button" className="pill pill-sm" aria-expanded={aberto}
                        onClick={() => setAberto((x) => !x)}>
                  <Icon name="filter" /> {painel ? 'Trocar de painel' : 'Escolher um painel'}
                </button>
              </div>

              {aberto && (
                <div className="flex flex-col gap-8">
                  <label className="filtro">
                    <span className="label">Buscar painel, condição ou gene</span>
                    <input className="input" type="search" value={busca} autoFocus
                           placeholder="epilepsia, cardiomiopatia, BRCA1"
                           onChange={(e) => setBusca(e.target.value)} />
                  </label>
                  <ul className="lista-painel">
                    {encontrados.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="gene-linha"
                                onClick={() => { onPainel(p); setAberto(false) }}>
                          <span className="flex flex-col gap-2" style={{ minWidth: 0 }}>
                            <span className="text-13 text-text truncate">{p.nome}</span>
                            {p.condicoes?.length > 0 && (
                              <span className="label truncate">{p.condicoes.slice(0, 2).join('; ')}</span>
                            )}
                          </span>
                          <span className="label whitespace-nowrap">{p.genes.length} genes</span>
                        </button>
                      </li>
                    ))}
                    {encontrados.length === 0 && <li className="text-13">Nenhum painel com esse termo.</li>}
                  </ul>
                </div>
              )}

              {painel?.genes_sem_coordenada?.length > 0 && (
                <p className="text-12 leading-snug">
                  {painel.genes_sem_coordenada.length} genes deste painel não têm coordenada no
                  conjunto usado ({painel.genes_sem_coordenada.slice(0, 5).join(', ')}
                  {painel.genes_sem_coordenada.length > 5 ? ' e outros' : ''}). São RNA não
                  codificante, imunoglobulina ou gene mitocondrial, e variantes neles não aparecem
                  no filtro.
                </p>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-8">
          <h3 className="text-16 font-medium text-text">
            {multi ? 'Quem é quem no arquivo' : 'Sinais clínicos'}
          </h3>

          {multi && (
            <>
              <p className="text-12 leading-snug about-left">
                O arquivo traz {amostras.length} amostras. Dizendo qual é a criança e quais são os
                pais, aparecem as variantes de novo, as recessivas herdadas dos dois lados e o
                heterozigoto composto em trans, que sem os pais não passa de candidato.
              </p>
              <ul className="flex flex-col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {amostras.map((nome, i) => (
                  <li key={nome} className="grid gap-12 items-center" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span className="text-13 mono truncate">{nome}</span>
                    <select className="select" value={papelDe(i)}
                            onChange={(e) => definirPapel(i, e.target.value)}
                            aria-label={`Papel de ${nome}`}>
                      <option value="">Não usar</option>
                      <option value="proband">Criança</option>
                      <option value="mae">Mãe</option>
                      <option value="pai">Pai</option>
                    </select>
                  </li>
                ))}
              </ul>
            </>
          )}

          <label className="filtro mt-8">
            <span className="label">Sinais clínicos, um por linha ou separados por vírgula</span>
            <textarea className="textarea" rows={multi ? 3 : 5} value={rascunho}
                      placeholder="epilepsia, atraso do desenvolvimento, hipotonia"
                      onChange={(e) => setRascunho(e.target.value)} />
          </label>
          <span className="flex gap-8 flex-wrap items-center">
            <button type="button" className="pill pill-sm"
                    onClick={() => onTermos(rascunho.split(/[,\n;]/).map((t) => t.trim()).filter(Boolean))}>
              <Icon name="search" /> Priorizar por fenótipo
            </button>
            {termos.length > 0 && (
              <>
                <span className="label">{termos.length} termos ativos</span>
                <button type="button" className="pill pill-sm"
                        onClick={() => { onTermos([]); setRascunho('') }}>
                  <Icon name="close" /> Limpar
                </button>
              </>
            )}
          </span>
          <p className="text-12 leading-snug about-left">
            A concordância é entre o termo digitado e o texto das condições associadas ao gene. É
            apoio de triagem: termo ausente da base não significa fenótipo ausente do paciente.
          </p>
        </section>
      </div>
    </div>
  )
}
