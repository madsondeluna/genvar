import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { ROTULO, ORDEM_GRAVIDADE, ESTRELAS, CONSEQUENCIA, IMPACTO, ORDEM_IMPACTO } from './clinvar'
import { CRITERIOS as CRITERIOS_PDF, NAO_AVALIADOS } from './interpretacao'

// Relatório em PDF, na forma de um laudo e com a ressalva de um relatório de
// pesquisa. Carregado por import dinâmico a partir do botão: a biblioteca pesa
// centenas de KB e quem nunca gera um PDF não deve pagar por ela no primeiro
// carregamento da página.
//
// A ressalva aparece na capa E no rodapé de toda página, e as duas coisas são
// deliberadas. Um PDF circula por partes: alguém imprime a página do achado e
// entrega, e essa folha solta tem de dizer sozinha o que é. Sem laboratório
// habilitado por trás, um documento que se apresenta como diagnóstico não é um
// detalhe de redação.
//
// A paleta é fixa aqui, e não vem dos tokens, por uma razão de meio: o PDF é
// impresso e não tem modo claro nem escuro. Os valores são os do modo claro da
// linguagem, que é o único que faz sentido em papel.
const TINTA = '#0d1321'
const APAGADO = '#3e5c76'
const LINHA = '#dde1e9'
const FUNDO = '#ebeef3'
const ALERTA = '#8a6116'
const SERIE = ['#3973b1', '#9f8322', '#9e527f', '#49955c', '#745ba5', '#ba6f3e', '#1990ad', '#ac5551']

// Slot de série por classificação e por impacto, os mesmos da tela: o papel e a
// tela dizem a mesma coisa com a mesma cor, ou a leitura não transfere.
const COR_SIG = { 1: SERIE[7], 2: SERIE[7], 3: SERIE[7], 4: SERIE[5], 5: SERIE[1], 6: SERIE[3], 7: SERIE[3], 8: SERIE[3], 9: SERIE[6], 10: SERIE[5], 11: SERIE[2], 12: SERIE[3] }
const COR_IMPACTO = { Alto: SERIE[7], Moderado: SERIE[5], Baixo: SERIE[2], Modificador: SERIE[0] }

// Colunas da tabela completa: rotulo, largura e como tirar o valor da variante.
//
// UMA definicao para o cabecalho E para as celulas, e isso conserta um defeito
// que estava na tela. As duas eram listas separadas e tinham divergido: o
// cabecalho dizia Classificacao 54 e a celula usava 84, Rev. 16 contra 54,
// Impacto 30 contra 46. As larguras do cabecalho somavam 498, que cabe na
// largura util de uma A4 em retrato (595 menos 96 de margem), e as das celulas
// somavam 582, que nao cabe: as ultimas colunas saiam empurradas para fora da
// pagina e as demais desalinhadas do titulo. Derivando as duas da mesma lista,
// divergir deixa de ser possivel.
//
// A soma esta travada por um teste, porque acrescentar coluna sem tirar largura
// de outra e o jeito silencioso de quebrar a pagina de novo.
const COLS_TABELA = [
  ['Posição', 36, (v) => `${v.chrom}:${fmt(v.pos)}`],
  ['rsID', 36, (v) => v.rsid || '—'],
  ['Troca', 28, (v) => `${v.ref.slice(0, 4)}→${v.alt.slice(0, 4)}`],
  ['Ti/Tv', 18, (v) => (v.transicao == null ? '—' : v.transicao ? 'Ti' : 'Tv')],
  ['Gene', 34, (v) => v.clinvar.gene || v.gene || '—'],
  ['Classificação', 54, (v) => ROTULO[v.clinvar.sig], (v) => ({ color: COR_SIG[v.clinvar.sig] })],
  ['Rev.', 18, (v) => `${v.clinvar.estrelas}/4`],
  ['Impacto', 34, (v) => IMPACTO[v.clinvar.consequencia] || '—',
    (v) => ({ color: COR_IMPACTO[IMPACTO[v.clinvar.consequencia]] || TINTA })],
  ['Consequência', 38, (v) => (v.clinvar.consequencia ? CONSEQUENCIA[v.clinvar.consequencia] : '—')],
  ['Frequência', 36, (v) => freqDe(v)],
  ['Maior em', 34, (v) => maiorPop(v)],
  ['Herança', 26, (v) => v.clingen?.heranca_sigla || '—'],
  ['Genótipo', 28, (v) => v.zigosidade],
  ['AB', 18, (v) => (v.ab != null ? v.ab.toFixed(2) : '—')],
  ['DP', 16, (v) => v.dp ?? '—'],
  ['ACMG', 26, (v) => (v.acmg?.length ? v.acmg.map((c) => c.id).join(' ') : '—')],
  // O asterisco marca escore que contem criterio nao verificado. A legenda dele
  // esta na pagina de metodologia, e nao aqui: coluna de 18 pontos nao comporta
  // explicacao, e simbolo sem legenda em nenhum lugar seria pior que ausencia.
  ['Pts', 18, (v) => (v.acmgPontos
    ? `${v.acmgPontos.pontos > 0 ? '+' : ''}${v.acmgPontos.pontos}`
      + (v.acmgPontos.naoVerificados.length ? '*' : '')
    : '—')],
]

// Largura util de uma A4 em retrato: 595,28 pontos menos os 48 de margem de
// cada lado. A tabela nao pode passar disto, e o teste confere.
export const LARGURA_UTIL = 595.28 - 48 * 2
export const LARGURA_TABELA = COLS_TABELA.reduce((t, [, w]) => t + w, 0)

const RESSALVA = 'Documento de pesquisa e ensino. Não é laudo diagnóstico, não foi emitido por '
  + 'laboratório clínico habilitado e não substitui avaliação médica. Todo achado exige '
  + 'confirmação por método independente em laboratório clínico e aconselhamento genético.'

const s = StyleSheet.create({
  pagina: { paddingTop: 44, paddingBottom: 62, paddingHorizontal: 48, fontSize: 9, color: TINTA, fontFamily: 'Helvetica' },
  eyebrow: { fontSize: 8, color: APAGADO, letterSpacing: 0.6, marginBottom: 4 },
  h1: { fontSize: 22, marginBottom: 6 },
  h2: { fontSize: 12, marginTop: 18, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  h3: { fontSize: 9.5, marginTop: 12, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  p: { fontSize: 9, lineHeight: 1.5, color: TINTA, marginBottom: 6 },
  apagado: { color: APAGADO },

  ressalva: { borderWidth: 0.8, borderColor: ALERTA, borderRadius: 4, padding: 10, marginTop: 14, marginBottom: 6 },
  ressalvaTitulo: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: ALERTA, marginBottom: 3 },
  ressalvaTexto: { fontSize: 8.5, lineHeight: 1.45, color: TINTA },

  campos: { marginTop: 10 },
  campo: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: LINHA, paddingVertical: 4 },
  campoRotulo: { width: 150, fontSize: 8, color: APAGADO },
  campoValor: { flex: 1, fontSize: 8.5 },

  fichas: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 4 },
  ficha: { flex: 1, padding: 8, backgroundColor: FUNDO, borderRadius: 4 },
  fichaValor: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  fichaRotulo: { fontSize: 7.5, color: APAGADO, marginTop: 2 },

  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  rotulo: { width: 118, fontSize: 8 },
  trilho: { flex: 1, height: 5, backgroundColor: FUNDO, borderRadius: 3 },
  valor: { width: 58, fontSize: 8, textAlign: 'right' },

  th: { fontSize: 7.5, color: APAGADO, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 7.5, paddingVertical: 3, paddingHorizontal: 4 },
  tr: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: LINHA },

  rodape: { position: 'absolute', bottom: 26, left: 48, right: 48, fontSize: 6.5, color: APAGADO,
            borderTopWidth: 0.5, borderTopColor: LINHA, paddingTop: 6, lineHeight: 1.4 },
})

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')}%`

function freq(af) {
  if (af == null) return 'sem frequência publicada'
  if (af === 0) return 'não observada'
  const pc = af * 100
  const p = pc >= 1 ? pc.toFixed(1) : pc >= 0.01 ? pc.toFixed(2) : pc.toPrecision(2)
  return `${String(p).replace('.', ',')}% (1 em ${fmt(Math.round(1 / af))})`
}

// Frequencia da melhor fonte disponivel. O gnomAD, quando consultado, vence a
// embarcada: ele e a coorte maior e a unica estratificada por populacao.
function freqDe(v) {
  if (v.gnomad?.af != null) return freq(v.gnomad.af)
  if (v.gnomad?.ausente) return 'ausente do gnomAD'
  return freq(v.clinvar?.af)
}

// Populacao em que o alelo e mais comum. Uma variante rara no conjunto global e
// comum numa populacao especifica muda a leitura: pode ser variante fundadora, e
// pode ser artefato de sub-representacao daquela populacao nas coortes.
function maiorPop(v) {
  const p = v.gnomad?.populacoes?.[0]
  if (!p || p.af == null) return '—'
  const pc = p.af * 100
  const n = pc >= 1 ? pc.toFixed(1) : pc.toPrecision(2)
  return `${p.rotulo}: ${String(n).replace('.', ',')}%`
}

// A largura e SEMPRE uma porcentagem entre 0 e 100. Sem o limite, um `max`
// muito pequeno produzia largura em notacao exponencial ("1e+21%"), que o
// gerador de PDF recusa com "unsupported number" e derruba o documento INTEIRO:
// uma barra fora de escala apagava o laudo em vez de sair torta.
function larguraPct(n, max) {
  if (!Number.isFinite(n) || !Number.isFinite(max) || max <= 0) return 0
  const pct = (n / max) * 100
  if (!Number.isFinite(pct)) return 0
  return Math.min(100, Math.max(0, pct))
}

function Barra({ rotulo, n, max, cor, sufixo }) {
  const largura = larguraPct(n, max)
  return (
    <View style={s.linha}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <View style={s.trilho}>
        <View style={{
          width: `${largura === 0 ? 0 : Math.max(1, largura).toFixed(2)}%`,
          height: 5, backgroundColor: cor, borderRadius: 3,
        }} />
      </View>
      <Text style={s.valor}>{Number.isFinite(n) ? fmt(n) : '\u2014'}{sufixo || ''}</Text>
    </View>
  )
}

function Campo({ rotulo, children }) {
  return (
    <View style={s.campo}>
      <Text style={s.campoRotulo}>{rotulo}</Text>
      <Text style={s.campoValor}>{children}</Text>
    </View>
  )
}

function Rodape({ gerado }) {
  return (
    <Text style={s.rodape} fixed render={({ pageNumber, totalPages }) =>
      `GenVar · relatório de chamada de variantes · gerado em ${gerado} · página ${pageNumber} de ${totalPages}\n${RESSALVA}`
    } />
  )
}

export function RelatorioVCF({ dados, gerado }) {
  const {
    nome, tamanho, meta, metricas, variantes, lidos, truncado,
    porGene, dp, qual, cromo, resumoCli, anotacao, genesMapeados, espectro,
    sha256, versaoClinvar, painel, papeis, termos,
  } = dados
  const maxCromo = Math.max(1, ...cromo.map((c) => c.n))

  const anotadas = variantes.filter((v) => v.clinvar)
  const graves = anotadas
    .filter((v) => [1, 2, 3].includes(v.clinvar.sig))
    .sort((a, b) => b.clinvar.estrelas - a.clinvar.estrelas || a.clinvar.sig - b.clinvar.sig)
  const outrosAvisos = anotadas
    .filter((v) => [4, 9, 10, 11].includes(v.clinvar.sig))
    .sort((a, b) => b.clinvar.estrelas - a.clinvar.estrelas)
  const comRsid = variantes.filter((v) => v.rsid).length
  const comGnomad = anotadas
    .filter((v) => v.gnomad?.populacoes?.length)
    .sort((a, b) => ORDEM_GRAVIDADE.indexOf(a.clinvar.sig) - ORDEM_GRAVIDADE.indexOf(b.clinvar.sig))

  return (
    <Document title={`GenVar — relatório de ${nome}`} author="GenVar" creator="GenVar">

      {/* 1. Identificação, ressalva e sumário */}
      <Page size="A4" style={s.pagina}>
        <Text style={s.eyebrow}>GenVar · relatório de chamada de variantes</Text>
        <Text style={s.h1}>{nome}</Text>
        <Text style={[s.p, s.apagado]}>
          {fmt(Math.round(tamanho / 1024))} KB · {fmt(lidos)} linhas de variante · referência{' '}
          {meta.build}
          {meta.buildPresumido ? ' (presumida)' : meta.buildDeduzido ? ' (deduzida)' : ' (declarada)'}
          {meta.chamador ? ` · chamador ${meta.chamador}` : ''}
        </Text>

        <View style={s.ressalva}>
          <Text style={s.ressalvaTitulo}>Natureza deste documento</Text>
          <Text style={s.ressalvaTexto}>{RESSALVA}</Text>
        </View>

        <Text style={s.h2}>Identificação do material</Text>
        <View style={s.campos}>
          <Campo rotulo="Arquivo">{nome}</Campo>
          <Campo rotulo="Amostras no arquivo">
            {meta.amostras.length ? meta.amostras.join(', ') : 'nenhuma coluna de genótipo'}
          </Campo>
          <Campo rotulo="Genoma de referência">
            {meta.build}
            {meta.buildPresumido
              ? ' — presumido: o cabeçalho não declara e os contigs não permitem deduzir'
              : meta.buildDeduzido
                ? ' — deduzido do comprimento do cromossomo 1'
                : ' — declarado no cabeçalho do arquivo'}
          </Campo>
          <Campo rotulo="Programa de chamada">{meta.chamador || 'não declarado no cabeçalho'}</Campo>
          <Campo rotulo="Variantes analisadas">
            {fmt(metricas.total)}
            {truncado ? ` (arquivo maior que o teto de leitura; cobertas as primeiras ${fmt(lidos)} linhas)` : ''}
          </Campo>
          <Campo rotulo="Processamento">
            integralmente no navegador; o arquivo do paciente não foi transmitido a servidor
          </Campo>
          <Campo rotulo="Painel aplicado">
            {painel ? `${painel.nome} — ${painel.genes.length} genes` : 'nenhum; o arquivo inteiro foi analisado'}
          </Campo>
          {termos?.length > 0 && (
            <Campo rotulo="Sinais clínicos informados">{termos.join('; ')}</Campo>
          )}
          <Campo rotulo="SHA-256 do arquivo">
            {sha256 || 'não calculado'}
          </Campo>
          <Campo rotulo="Data de emissão">{gerado}</Campo>
        </View>

        <Text style={s.h2}>Sumário</Text>
        <View style={s.fichas}>
          {[
            [fmt(metricas.total), 'variantes'],
            [fmt(graves.length), 'patogênicas'],
            [fmt(resumoCli?.porSig?.[5] || 0), 'significado incerto'],
            [fmt(outrosAvisos.length), 'risco / fármaco'],
            [pct(metricas.fracaoConhecida), 'já no dbSNP'],
          ].map(([v, r], i) => (
            <View key={r} style={[s.ficha, { borderLeftWidth: 2, borderLeftColor: SERIE[i] }]}>
              <Text style={s.fichaValor}>{v}</Text>
              <Text style={s.fichaRotulo}>{r}</Text>
            </View>
          ))}
        </View>

        {resumoCli && Object.keys(resumoCli.porSig).length > 0 && (
          <>
            <Text style={s.h3}>Classificação clínica das variantes encontradas no ClinVar</Text>
            {ORDEM_GRAVIDADE.filter((k) => resumoCli.porSig[k]).map((k) => (
              <Barra key={k} rotulo={ROTULO[k]} n={resumoCli.porSig[k]} max={anotadas.length || 1} cor={COR_SIG[k]} />
            ))}
          </>
        )}

        {!genesMapeados && (
          <Text style={[s.p, s.apagado, { marginTop: 12 }]}>
            O cruzamento com coordenadas de gene foi desligado para este arquivo: as coordenadas
            distribuídas pelo GenVar são GRCh38 e este VCF está em {meta.build}. Entre os dois
            builds o deslocamento chega a milhões de bases, e o gene sairia trocado. A anotação
            clínica por rsID não depende do build e permanece válida.
          </Text>
        )}

        <Rodape gerado={gerado} />
      </Page>

      {/* 2. Achados */}
      <Page size="A4" style={s.pagina}>
        <Text style={s.h2}>Achados classificados como patogênicos</Text>
        <Text style={s.p}>
          {graves.length === 0
            ? 'Nenhuma variante deste arquivo consta no ClinVar com classificação patogênica ou provavelmente patogênica na camada consultada.'
            : `${fmt(graves.length)} variantes, ordenadas pelo nível de revisão do ClinVar, que separa `
              + 'um painel de especialistas de um único envio sem critério declarado.'}
        </Text>

        {graves.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', backgroundColor: FUNDO }} fixed>
              {[['Gene', 46], ['Posição', 66], ['rsID', 58], ['Troca', 42], ['Efeito', 62], ['Classificação', 70], ['Rev.', 22], ['Condição', 86], ['Frequência', 62], ['Maior em', 60], ['Genótipo', 40]].map(([c, w]) => (
                <Text key={c} style={[s.th, { width: w }]}>{c}</Text>
              ))}
            </View>
            {graves.slice(0, 80).map((v, i) => (
              <View key={i} style={s.tr} wrap={false}>
                {COLS_TABELA.map(([c, w, valor, estilo]) => (
                  <Text key={c} style={[s.td, { width: w }, estilo ? estilo(v) : null]}>
                    {valor(v)}
                  </Text>
                ))}
              </View>
            ))}
            {graves.length > 80 && (
              <Text style={[s.p, s.apagado, { marginTop: 6 }]}>
                Listadas as 80 primeiras de {fmt(graves.length)}. A exportação em TSV e XLSX traz todas.
              </Text>
            )}
            <Text style={[s.p, s.apagado, { marginTop: 8 }]}>
              Frequência acima de 1% contradiz classificação patogênica para doença rara: um alelo
              comum na população não causa condição rara, e o registro correspondente costuma ser
              antigo ou específico de um contexto. Essas linhas merecem conferência antes de
              qualquer conduta.
            </Text>
          </>
        )}

        {outrosAvisos.length > 0 && (
          <>
            <Text style={s.h2}>Fator de risco, resposta a fármaco e classificação conflitante</Text>
            <Text style={s.p}>
              Não são achados de doença. Resposta a fármaco descreve metabolização e dose; fator de
              risco descreve alteração de probabilidade, não causa; classificação conflitante
              significa que laboratórios discordam sobre a mesma variante.
            </Text>
            <View style={{ flexDirection: 'row', backgroundColor: FUNDO }} fixed>
              {[['Gene', 52], ['Posição', 78], ['Troca', 48], ['Classificação', 96], ['Rev.', 26], ['Condição ou fármaco', 130], ['Frequência', 72]].map(([c, w]) => (
                <Text key={c} style={[s.th, { width: w }]}>{c}</Text>
              ))}
            </View>
            {outrosAvisos.slice(0, 40).map((v, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: 52 }]}>{v.clinvar.gene || '—'}</Text>
                <Text style={[s.td, { width: 78 }]}>{v.chrom}:{fmt(v.pos)}</Text>
                <Text style={[s.td, { width: 48 }]}>{v.ref.slice(0, 5)}&gt;{v.alt.slice(0, 5)}</Text>
                <Text style={[s.td, { width: 96, color: COR_SIG[v.clinvar.sig] }]}>{ROTULO[v.clinvar.sig]}</Text>
                <Text style={[s.td, { width: 26 }]}>{v.clinvar.estrelas}/4</Text>
                <Text style={[s.td, { width: 130 }]}>{v.clinvar.condicao || '—'}</Text>
                <Text style={[s.td, { width: 72 }]}>{freq(v.clinvar.af)}</Text>
              </View>
            ))}
          </>
        )}

        <Rodape gerado={gerado} />
      </Page>

      {/* 4. Frequencia por populacao e tabela completa */}
      {comGnomad.length > 0 && (
        <Page size="A4" style={s.pagina}>
          <Text style={s.h2}>Frequência por população</Text>
          <Text style={s.p}>
            Consulta ao gnomAD, feita variante a variante e apenas para os achados. Uma variante
            rara no conjunto global e comum numa população específica muda a leitura: pode ser
            variante fundadora, e pode ser artefato de sub-representação daquela população nas
            coortes. As populações do gnomAD são grupos de ancestralidade genética inferida, não
            categorias de raça ou nacionalidade autodeclaradas.
          </Text>

          {comGnomad.slice(0, 12).map((v, i) => (
            <View key={i} style={{ marginTop: 10 }} wrap={false}>
              <Text style={s.h3}>
                {v.clinvar?.gene || v.gene || 'sem gene'} · {v.chrom}:{fmt(v.pos)}{' '}
                {v.ref.slice(0, 6)}→{v.alt.slice(0, 6)}
                {v.rsid ? ` · ${v.rsid}` : ''}
              </Text>
              <Text style={[s.p, s.apagado, { marginBottom: 4 }]}>
                {v.clinvar ? `${ROTULO[v.clinvar.sig]}, ${v.clinvar.estrelas}/4 estrelas. ` : ''}
                Global {freq(v.gnomad.af)}
                {v.gnomad.an ? ` em ${fmt(v.gnomad.an)} cromossomos` : ''}.
              </Text>
              {v.gnomad.populacoes.slice(0, 8).map((pop, j) => (
                <Barra
                  key={pop.id}
                  rotulo={pop.rotulo}
                  n={pop.af != null ? +(pop.af * 100).toFixed(3) : 0}
                  max={Math.max(...v.gnomad.populacoes.map((x) => (x.af || 0) * 100), 0.001)}
                  cor={SERIE[j % 8]}
                  sufixo="%"
                />
              ))}
            </View>
          ))}

          <Rodape gerado={gerado} />
        </Page>
      )}

      {/* 5. Tabela completa das variantes anotadas.

          RETRATO, e nao paisagem. Uma pagina `orientation="landscape"` no mesmo
          Document das outras derruba o PDF INTEIRO com "unsupported number:
          -3.8e+21" na geometria da borda, e o numero e sempre o mesmo, o que
          denuncia leitura de medida nao inicializada. Nao e a largura das
          colunas: o erro persiste com elas somando 498, que cabe em retrato.
          Trocar a orientacao resolve, e o teste `fecha com tabela longa o
          bastante para atravessar paginas` tranca isso.

          O preco e coluna estreita. Foi pago encurtando rotulo e cortando o que
          ja aparece em outra pagina, e nao espremendo tudo. */}
      {anotadas.length > 0 && (
        <Page size="A4" style={s.pagina}>
          <Text style={s.h2}>Todas as variantes com anotação clínica</Text>
          <Text style={s.p}>
            {fmt(anotadas.length)} variantes que o ClinVar conhece, ordenadas por gravidade e
            depois por nível de revisão. A exportação em TSV, CSV e XLSX traz o arquivo inteiro,
            inclusive as que não constam do catálogo.
          </Text>
          <View style={{ flexDirection: 'row', backgroundColor: FUNDO }} fixed>
            {COLS_TABELA.map(([c, w]) => (
              <Text key={c} style={[s.th, { width: w }]}>{c}</Text>
            ))}
          </View>
          {anotadas
            .slice()
            .sort((a, b) => ORDEM_GRAVIDADE.indexOf(a.clinvar.sig) - ORDEM_GRAVIDADE.indexOf(b.clinvar.sig)
              || b.clinvar.estrelas - a.clinvar.estrelas)
            .slice(0, 400)
            .map((v, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: 34 }]}>{v.chrom}:{fmt(v.pos)}</Text>
                <Text style={[s.td, { width: 38 }]}>{v.rsid || '—'}</Text>
                <Text style={[s.td, { width: 30 }]}>{v.ref.slice(0, 4)}→{v.alt.slice(0, 4)}</Text>
                <Text style={[s.td, { width: 18 }]}>
                  {v.transicao == null ? '—' : v.transicao ? 'Ti' : 'Tv'}
                </Text>
                <Text style={[s.td, { width: 32 }]}>{v.clinvar.gene || v.gene || '—'}</Text>
                <Text style={[s.td, { width: 84, color: COR_SIG[v.clinvar.sig] }]}>
                  {ROTULO[v.clinvar.sig]}
                </Text>
                <Text style={[s.td, { width: 54 }]}>{v.clinvar.estrelas}/4</Text>
                <Text style={[s.td, { width: 46, color: COR_IMPACTO[IMPACTO[v.clinvar.consequencia]] || TINTA }]}>
                  {IMPACTO[v.clinvar.consequencia] || '—'}
                </Text>
                <Text style={[s.td, { width: 16 }]}>
                  {v.clinvar.consequencia ? CONSEQUENCIA[v.clinvar.consequencia] : '—'}
                </Text>
                <Text style={[s.td, { width: 30 }]}>{freqDe(v)}</Text>
                <Text style={[s.td, { width: 48 }]}>{maiorPop(v)}</Text>
                <Text style={[s.td, { width: 38 }]}>{v.clingen?.heranca_sigla || '—'}</Text>
                <Text style={[s.td, { width: 40 }]}>{v.zigosidade}</Text>
                <Text style={[s.td, { width: 26 }]}>{v.ab != null ? v.ab.toFixed(2) : '—'}</Text>
                <Text style={[s.td, { width: 28 }]}>{v.dp ?? '—'}</Text>
                <Text style={[s.td, { width: 20 }]}>
                  {v.acmg?.length ? v.acmg.map((c) => c.id).join(' ') : '—'}
                </Text>
                <Text style={[s.td, { width: 14 }]}>
                  {v.acmgPontos
                    ? `${v.acmgPontos.pontos > 0 ? '+' : ''}${v.acmgPontos.pontos}`
                      + (v.acmgPontos.naoVerificados.length ? '*' : '')
                    : '—'}
                </Text>
              </View>
            ))}
          {anotadas.length > 400 && (
            <Text style={[s.p, s.apagado, { marginTop: 6 }]}>
              Listadas as 400 primeiras de {fmt(anotadas.length)}. A exportação tabular traz todas.
            </Text>
          )}
          <Rodape gerado={gerado} />
        </Page>
      )}

      {/* 3. Genes, impacto e polimorfismos */}
      <Page size="A4" style={s.pagina}>
        {resumoCli?.genes?.length > 0 && (
          <>
            <Text style={s.h2}>Genes com variante catalogada</Text>
            <View style={{ flexDirection: 'row', backgroundColor: FUNDO }} fixed>
              {[['Gene', 60], ['Patogênicas', 56], ['Incertas', 48], ['Total', 40], ['Condições associadas', 296]].map(([c, w]) => (
                <Text key={c} style={[s.th, { width: w }]}>{c}</Text>
              ))}
            </View>
            {resumoCli.genes.slice(0, 30).map((g) => (
              <View key={g.gene} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: 60 }]}>{g.gene}</Text>
                <Text style={[s.td, { width: 56, textAlign: 'right' }]}>{g.patogenicas || '—'}</Text>
                <Text style={[s.td, { width: 48, textAlign: 'right' }]}>{g.incertas || '—'}</Text>
                <Text style={[s.td, { width: 40, textAlign: 'right' }]}>{g.total}</Text>
                <Text style={[s.td, { width: 296 }]}>{g.condicoes.join('; ') || '—'}</Text>
              </View>
            ))}
          </>
        )}

        {resumoCli?.porImpacto && Object.keys(resumoCli.porImpacto).length > 0 && (
          <>
            <Text style={s.h2}>Efeito na proteína</Text>
            <Text style={s.p}>
              Impacto mede quanto a troca altera a proteína, não gravidade clínica. Alto interrompe
              a leitura, por códon de parada prematuro, mudança de matriz ou sítio de splicing;
              moderado troca um aminoácido; baixo não altera a proteína; modificador cai fora da
              região codificante.
            </Text>
            {ORDEM_IMPACTO.filter((i) => resumoCli.porImpacto[i]).map((i) => (
              <Barra key={i} rotulo={i} n={resumoCli.porImpacto[i]} max={anotadas.length || 1} cor={COR_IMPACTO[i]} />
            ))}

            {Object.keys(resumoCli.porConsequencia || {}).length > 0 && (
              <>
                <Text style={s.h3}>Consequência molecular</Text>
                {Object.entries(resumoCli.porConsequencia).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => (
                  <Barra key={c} rotulo={CONSEQUENCIA[c] || 'outra'} n={n} max={anotadas.length || 1}
                         cor={COR_IMPACTO[IMPACTO[+c]] || SERIE[0]} />
                ))}
              </>
            )}
          </>
        )}

        <Text style={s.h2}>Polimorfismos já catalogados</Text>
        <Text style={s.p}>
          Um rsID indica que a posição e o alelo já foram depositados no dbSNP. É identificador, não
          classificação: não diz nada sobre efeito. O que ele separa é o já descrito do que o
          arquivo traz de novo.
        </Text>
        <Barra rotulo="com rsID" n={comRsid} max={variantes.length} cor={SERIE[2]} />
        <Barra rotulo="sem rsID" n={variantes.length - comRsid} max={variantes.length} cor={SERIE[5]} />
        <Barra rotulo="presentes no ClinVar" n={anotadas.length} max={variantes.length} cor={SERIE[0]} />

        {genesMapeados && porGene.length > 0 && (
          <>
            <Text style={s.h2}>Genes com mais variantes no arquivo</Text>
            <Text style={s.p}>
              Contagem por coordenada, sobre 20.033 genes. Gene grande acumula mais variantes por
              tamanho e não por relevância: a lista é ponto de partida, não achado.
            </Text>
            {porGene.map(([g, n], i) => (
              <Barra key={g} rotulo={g} n={n} max={porGene[0]?.[1] || 1} cor={SERIE[i % 8]} />
            ))}
          </>
        )}

        <Rodape gerado={gerado} />
      </Page>

      {/* 4. Controle de qualidade */}
      <Page size="A4" style={s.pagina}>
        <Text style={s.h2}>Controle de qualidade do conjunto</Text>
        <Text style={s.p}>
          Estas métricas dizem se o arquivo presta antes de qualquer interpretação, e não dependem
          de base externa nenhuma. A razão transição/transversão é o controle mais barato: a
          transversão é biologicamente mais rara que a transição, então ruído de chamada puxa a
          razão para baixo. Exoma fica perto de 3,0 e genoma perto de 2,0.
        </Text>

        <View style={s.campos}>
          <Campo rotulo="Razão Ti/Tv">
            {metricas.titv != null ? metricas.titv.toFixed(2).replace('.', ',') : '—'}
            {metricas.titv != null && metricas.titv < 1.5 ? ' — abaixo do esperado; sugere chamada falsa em excesso' : ''}
          </Campo>
          <Campo rotulo="Profundidade mediana">
            {dp.mediana != null ? `${dp.mediana.toFixed(0)}×` : '—'} — abaixo de 10× a chamada de heterozigoto fica pouco confiável
          </Campo>
          <Campo rotulo="Qualidade mediana">
            {qual.mediana != null ? qual.mediana.toFixed(0) : '—'} na escala Phred, em que 30 é uma chance em mil de a variante não existir
          </Campo>
          <Campo rotulo="Passaram no filtro">
            {fmt(metricas.passa)} de {fmt(metricas.total)} ({pct(metricas.total ? metricas.passa / metricas.total : 0)})
          </Campo>
          <Campo rotulo="Já no dbSNP">
            {fmt(metricas.comRsid)} ({pct(metricas.fracaoConhecida)})
          </Campo>
        </View>

        <Text style={s.h3}>Filtros do programa de chamada</Text>
        {Object.entries(metricas.filtros).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => (
          <Barra key={f} rotulo={f === '.' ? 'sem filtro' : f} n={n} max={metricas.total} cor={f === 'PASS' ? SERIE[3] : SERIE[7]} />
        ))}

        <Text style={s.h3}>Zigosidade</Text>
        {Object.entries(metricas.zigosidade).sort((a, b) => b[1] - a[1]).map(([z, n], i) => (
          <Barra key={z} rotulo={z} n={n} max={metricas.total} cor={SERIE[i % 8]} />
        ))}

        <Text style={s.h3}>Tipo de variante</Text>
        {Object.entries(metricas.tipos).sort((a, b) => b[1] - a[1]).map(([t, n], i) => (
          <Barra key={t} rotulo={t} n={n} max={metricas.total} cor={SERIE[i % 8]} />
        ))}

        {espectro?.n > 0 && (
          <>
            <Text style={s.h3}>Troca de base</Text>
            <Text style={[s.p, s.apagado]}>
              As seis classes de substituição, contadas pela pirimidina porque a fita é dupla e
              C&gt;A e G&gt;T são o mesmo evento. Excesso de C&gt;T é desaminação de citosina
              metilada, presente em toda amostra humana; excesso de C&gt;A costuma ser oxidação de
              guanina no preparo da biblioteca, ou seja, bancada e não biologia.
            </Text>
            {espectro.classes.map((c, i) => (
              <Barra key={c.rotulo} rotulo={c.rotulo.replace('>', '→')} n={c.n} max={espectro.n} cor={SERIE[i % 8]} />
            ))}
          </>
        )}

        <Text style={s.h3}>Distribuição por cromossomo</Text>
        {cromo.map((c, i) => (
          <Barra key={c.chr} rotulo={`cromossomo ${c.chr}`} n={c.n} max={maxCromo} cor={SERIE[i % 8]} />
        ))}

        <Rodape gerado={gerado} />
      </Page>

      {/* 5. Metodologia, fontes e limitações */}
      <Page size="A4" style={s.pagina}>
        <Text style={s.h2}>Metodologia</Text>
        <View style={s.campos}>
          <Campo rotulo="Leitura do arquivo">
            fluxo linha a linha no navegador; nenhum byte transmitido a servidor
          </Campo>
          <Campo rotulo="Anotação clínica">
            ClinVar (NCBI), domínio público{versaoClinvar ? `, compilação de ${versaoClinvar}` : ''}
          </Campo>
          <Campo rotulo="Validade gene-doença">ClinGen Gene-Disease Validity, CC0</Campo>
          <Campo rotulo="Farmacogenômica">
            CPIC, CC BY-SA 4.0. Não determina diplótipo: alelo estrela exige fase e número de cópias,
            ausentes de um VCF de variante curta
          </Campo>
          <Campo rotulo="Painéis de genes">
            Genomics England PanelApp, genes verdes, CC BY-SA 4.0, mais ACMG SF v3.2. Símbolos
            resolvidos pelo HGNC
          </Campo>
          <Campo rotulo="Critérios ACMG/AMP">
            {'apenas os avaliáveis sem literatura, segregação ou ensaio funcional: '
              + Object.keys(CRITERIOS_PDF).join(', ')
              + '. Não constitui classificação ACMG'}
          </Campo>
          <Campo rotulo="Escore de evidência (coluna Pts)">
            {'sistema de pontos de Tavtigian et al. (2018, 2020), adotado pelo ClinGen SVI: '
              + 'muito forte 8, forte 4, moderado 2, apoio 1, com sinal negativo para os '
              + 'critérios benignos. PARCIAL, por somar 7 dos 28 critérios da regra: o escore '
              + 'ordena a fila de revisão e NÃO classifica a variante. O asterisco marca escore '
              + 'que contém critério cuja evidência não foi verificada por completo'}
          </Campo>
          <Campo rotulo="SHA-256 do arquivo de entrada">{sha256 || 'não calculado'}</Campo>
          <Campo rotulo="Chave de cruzamento">
            rsID + REF + ALT como chave primária; cromossomo + posição + REF + ALT apenas quando o
            arquivo é GRCh38
          </Campo>
          <Campo rotulo="Camada consultada">
            {anotacao?.camadasCarregadas || 'patogênica, provavelmente patogênica, conflitante, fármaco e risco'}
          </Campo>
          <Campo rotulo="Variantes cruzadas">
            {fmt(anotacao?.casadas ?? anotadas.length)} de {fmt(variantes.length)}
          </Campo>
          <Campo rotulo="Frequência populacional">
            ExAC, na falta dela 1000 Genomes, na falta dela ESP, conforme o ClinVar publica por
            variante
          </Campo>
          <Campo rotulo="Coordenadas de gene">
            20.033 genes em GRCh38; cruzamento {genesMapeados ? 'aplicado' : 'desligado para este arquivo'}
          </Campo>
          <Campo rotulo="Escala de revisão">
            0 a 4 estrelas do ClinVar: {Object.entries(ESTRELAS).map(([k, v]) => `${k} = ${v}`).join('; ')}
          </Campo>
        </View>

        <Text style={s.h2}>O que este relatório não responde</Text>
        <Text style={s.p}>
          Um VCF registra onde a amostra difere da referência, e nada sobre onde ela é igual: a
          ausência de uma variante aqui não prova que ela não existe na amostra, apenas que não foi
          chamada. Região de cobertura baixa, região repetitiva e variante estrutural grande escapam
          da chamada de variante curta, e não aparecem como falta neste documento.
        </Text>
        <Text style={s.p}>
          A classificação vem do ClinVar como ele estava na data desta compilação, e classificação
          muda: variante hoje incerta pode ser reclassificada em qualquer direção. O nível de
          revisão está em cada linha porque um envio único sem critério declarado e um painel de
          especialistas não têm o mesmo peso.
        </Text>
        <Text style={s.p}>
          Ausência de achado não é resultado negativo. A camada carregada cobre uma parte do
          ClinVar, o arquivo pode não conter a região de interesse, e variante ausente do catálogo
          não é variante benigna: é variante não descrita.
        </Text>

        <Text style={s.h2}>Critérios ACMG que este relatório não avalia</Text>
        <View style={s.campos}>
          {NAO_AVALIADOS.map(([ids, motivo]) => (
            <Campo key={ids} rotulo={ids}>{motivo}</Campo>
          ))}
        </View>

        <Text style={s.h2}>Fontes</Text>
        <Text style={[s.p, s.apagado]}>
          ClinVar e dbSNP, National Center for Biotechnology Information, domínio público.
          ClinGen Gene-Disease Validity, CC0. CPIC, CC BY-SA 4.0. Genomics England PanelApp,
          CC BY-SA 4.0. HGNC, CC0. gnomAD, Broad Institute, quando consultado. Coordenadas gênicas
          do Ensembl, GRCh38. Frequências de ExAC, 1000 Genomes Project e NHLBI Exome Sequencing
          Project, redistribuídas pelo ClinVar. Nomes de doença e fenótipos exibidos na aplicação
          vêm de Orphanet e HPO.
        </Text>

        <View style={s.ressalva}>
          <Text style={s.ressalvaTitulo}>Natureza deste documento</Text>
          <Text style={s.ressalvaTexto}>{RESSALVA}</Text>
        </View>

        <Rodape gerado={gerado} />
      </Page>
    </Document>
  )
}

export async function gerarPDF(dados) {
  const gerado = new Date().toLocaleString('pt-BR')
  return pdf(<RelatorioVCF dados={dados} gerado={gerado} />).toBlob()
}
