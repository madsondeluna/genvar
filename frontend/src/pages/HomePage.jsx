import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Dna, Activity } from 'lucide-react'

const GENE_EXAMPLES = ['BRCA1', 'TP53', 'APOE', 'CFTR', 'KRAS', 'PTEN']
const VARIANT_EXAMPLES = ['rs429358', 'rs7412', 'rs28897672', 'rs80357906']

export default function HomePage() {
  const [geneInput, setGeneInput] = useState('')
  const [variantInput, setVariantInput] = useState('')
  const navigate = useNavigate()

  function handleGeneSearch(e) {
    e.preventDefault()
    const val = geneInput.trim().toUpperCase()
    if (val) navigate(`/gene/${val}`)
  }

  function handleVariantSearch(e) {
    e.preventDefault()
    const val = variantInput.trim().toLowerCase()
    if (val) navigate(`/variant/${val}`)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-20">

        {/* Header */}
        <div className="mb-16">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
            Genetic Variant Explorer
          </p>
          <h1 className="text-5xl font-bold text-gray-900 tracking-tight leading-tight mb-4">
            GenVar Dashboard
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed max-w-2xl text-justify">
            Search genes and variants. Get clinical significance, population frequencies, protein
            structure predictions, and constraint metrics... All in one place!
          </p>
        </div>

        {/* Search Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">

          {/* Gene Search */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-md flex items-center justify-center">
                <Dna className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Gene Search</h2>
                <p className="text-xs text-gray-400">HGNC gene symbol</p>
              </div>
            </div>
            <form onSubmit={handleGeneSearch} className="flex flex-col gap-3">
              <input
                type="text"
                className="input"
                placeholder="e.g. BRCA1"
                value={geneInput}
                onChange={(e) => setGeneInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Search className="w-4 h-4" />
                Search Gene
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {GENE_EXAMPLES.map((g) => (
                <button
                  key={g}
                  className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  onClick={() => navigate(`/gene/${g}`)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Variant Search */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-md flex items-center justify-center">
                <Activity className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Variant Search</h2>
                <p className="text-xs text-gray-400">dbSNP rs identifier</p>
              </div>
            </div>
            <form onSubmit={handleVariantSearch} className="flex flex-col gap-3">
              <input
                type="text"
                className="input"
                placeholder="e.g. rs429358"
                value={variantInput}
                onChange={(e) => setVariantInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Search className="w-4 h-4" />
                Search Variant
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {VARIANT_EXAMPLES.map((v) => (
                <button
                  key={v}
                  className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  onClick={() => navigate(`/variant/${v}`)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Data Sources */}
        <div className="border-t border-gray-200 pt-12">
          <p className="label mb-6">Data Sources</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { name: 'Ensembl', desc: 'Gene annotation' },
              { name: 'gnomAD', desc: 'Population frequencies' },
              { name: 'ClinVar', desc: 'Clinical significance' },
              { name: 'AlphaFold', desc: 'Protein structure' },
              { name: 'UniProt', desc: 'Protein database' },
            ].map((src) => (
              <div key={src.name} className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-gray-900">{src.name}</p>
                <p className="text-xs text-gray-400">{src.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer credit */}
        <div className="mt-12 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            Developed by Madson A. de Luna Aragao
          </p>
        </div>

      </div>
    </div>
  )
}
