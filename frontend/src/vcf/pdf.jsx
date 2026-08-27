import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer'

// Relatório em PDF. Carregado por import dinâmico a partir do botão: a
// biblioteca pesa centenas de KB e quem nunca gera um PDF não deve pagar por
// ela no primeiro carregamento da página.
//
// A paleta é fixa aqui, e não vem dos tokens, por uma razão de meio: o PDF é
// impresso e não tem modo claro nem escuro. Os valores são os do modo claro da
// linguagem, que é o único que faz sentido em papel.
const TINTA = '#0d1321'
const APAGADO = '#3e5c76'
const LINHA = '#dde1e9'
const FUNDO = '#ebeef3'
const SERIE = ['#3973b1', '#9f8322', '#9e527f', '#49955c', '#745ba5', '#ba6f3e', '#1990ad', '#ac5551']

const s = StyleSheet.create({
  pagina: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9, color: TINTA, fontFamily: 'Helvetica' },
  eyebrow: { fontSize: 8, color: APAGADO, letterSpacing: 0.6, marginBottom: 4 },
  h1: { fontSize: 20, marginBottom: 8 },
  h2: { fontSize: 12, marginTop: 20, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  p: { fontSize: 9, lineHeight: 1.5, color: TINTA, marginBottom: 6 },
  apagado: { color: APAGADO },
  fichas: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 4 },
  ficha: { flex: 1, padding: 8, backgroundColor: FUNDO, borderRadius: 4 },
  fichaValor: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  fichaRotulo: { fontSize: 7.5, color: APAGADO, marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  rotulo: { width: 110, fontSize: 8 },
  trilho: { flex: 1, height: 5, backgroundColor: FUNDO, borderRadius: 3 },
  valor: { width: 52, fontSize: 8, textAlign: 'right' },
  th: { fontSize: 7.5, color: APAGADO, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 7.5, paddingVertical: 3, paddingHorizontal: 4 },
  tr: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: LINHA },
  rodape: { position: 'absolute', bottom: 28, left: 48, right: 48, fontSize: 7, color: APAGADO,
            borderTopWidth: 0.5, borderTopColor: LINHA, paddingTop: 6 },
})

const fmt = (n) => (n == null ? '—' : n.toLocaleString('pt-BR'))

function Barra({ rotulo, n, max, cor, sufixo }) {
  return (
    <View style={s.linha}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <View style={s.trilho}>
        <View style={{ width: `${max ? Math.max(1, (n / max) * 100) : 0}%`, height: 5, backgroundColor: cor, borderRadius: 3 }} />
      </View>
      <Text style={s.valor}>{fmt(n)}{sufixo || ''}</Text>
    </View>
  )
}

function Rodape({ gerado }) {
  return (
    <Text style={s.rodape} fixed render={({ pageNumber, totalPages }) =>
      `GenVar · relatório de VCF · gerado em ${gerado} · página ${pageNumber} de ${totalPages} · `
      + 'para fins de informação e pesquisa; não substitui avaliação médica'
    } />
  )
}

export function RelatorioVCF({ dados, gerado }) {
  const { nome, tamanho, meta, metricas, variantes, lidos, truncado, porGene, dp, qual, cromo } = dados
  const maxCromo = Math.max(1, ...cromo.map((c) => c.n))
  const primeiras = variantes.slice(0, 40)

  return (
    <Document title={`GenVar — relatório de ${nome}`} author="GenVar" creator="GenVar">
      <Page size="A4" style={s.pagina}>
        <Text style={s.eyebrow}>GenVar · relatório de chamada de variantes</Text>
        <Text style={s.h1}>{nome}</Text>
        <Text style={[s.p, s.apagado]}>
          {fmt(Math.round(tamanho / 1024))} KB · {fmt(lidos)} linhas de variante ·{' '}
          {meta.build ? `referência ${meta.build}` : 'referência não declarada no cabeçalho'}
          {meta.chamador ? ` · chamador ${meta.chamador}` : ''}
          {truncado ? ' · arquivo maior que o teto de leitura; o relatório cobre o início' : ''}
        </Text>

        <View style={s.fichas}>
          {[
            [fmt(metricas.total), 'variantes'],
            [fmt(metricas.passa), 'passaram no filtro'],
            [metricas.titv ? metricas.titv.toFixed(2) : '—', 'razão Ti/Tv'],
            [`${(metricas.fracaoConhecida * 100).toFixed(1)}%`, 'já no dbSNP'],
            [fmt(meta.amostras.length), 'amostras'],
          ].map(([v, r], i) => (
            <View key={r} style={[s.ficha, { borderLeftWidth: 2, borderLeftColor: SERIE[i] }]}>
              <Text style={s.fichaValor}>{v}</Text>
              <Text style={s.fichaRotulo}>{r}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Qualidade do conjunto</Text>
        <Text style={s.p}>
          A razão transição/transversão é o controle mais barato de um VCF. Transversão é
          biologicamente mais rara que transição, então ruído de chamada puxa a razão para baixo:
          exoma fica perto de 3,0 e genoma perto de 2,0.{' '}
          {metricas.titv != null && metricas.titv < 1.5
            ? `Este arquivo está em ${metricas.titv.toFixed(2)}, abaixo do esperado.`
            : metricas.titv != null ? `Este arquivo está em ${metricas.titv.toFixed(2)}.` : ''}
          {' '}Profundidade mediana de {dp.mediana != null ? dp.mediana.toFixed(0) : '—'}×
          {' '}e qualidade mediana de {qual.mediana != null ? qual.mediana.toFixed(0) : '—'} na
          escala Phred, em que 30 significa uma chance em mil de a variante não existir.
        </Text>

        <Text style={s.h2}>Filtros do chamador</Text>
        {Object.entries(metricas.filtros).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n], i) => (
          <Barra key={f} rotulo={f === '.' ? 'sem filtro' : f} n={n} max={metricas.total} cor={f === 'PASS' ? SERIE[3] : SERIE[7]} />
        ))}

        <Text style={s.h2}>Zigosidade</Text>
        {Object.entries(metricas.zigosidade).sort((a, b) => b[1] - a[1]).map(([z, n], i) => (
          <Barra key={z} rotulo={z} n={n} max={metricas.total} cor={SERIE[i % 8]} />
        ))}

        <Text style={s.h2}>Tipo de variante</Text>
        {Object.entries(metricas.tipos).sort((a, b) => b[1] - a[1]).map(([t, n], i) => (
          <Barra key={t} rotulo={t} n={n} max={metricas.total} cor={SERIE[i % 8]} />
        ))}

        <Rodape gerado={gerado} />
      </Page>

      <Page size="A4" style={s.pagina}>
        <Text style={s.h2}>Distribuição por cromossomo</Text>
        <Text style={s.p}>
          Um pico isolado costuma ser região de baixa mapeabilidade, não descoberta biológica.
        </Text>
        {cromo.map((c, i) => (
          <Barra key={c.chr} rotulo={`chr ${c.chr}`} n={c.n} max={maxCromo} cor={SERIE[i % 8]} />
        ))}

        <Text style={s.h2}>Genes com mais variantes</Text>
        <Text style={s.p}>
          A posição de cada variante foi cruzada com as coordenadas de 20.033 genes. Gene grande
          acumula mais variantes por tamanho, não por relevância: a lista é ponto de partida.
        </Text>
        {porGene.map(([g, n], i) => (
          <Barra key={g} rotulo={g} n={n} max={porGene[0]?.[1] || 1} cor={SERIE[i % 8]} />
        ))}

        <Rodape gerado={gerado} />
      </Page>

      <Page size="A4" style={s.pagina}>
        <Text style={s.h2}>Primeiras {primeiras.length} variantes</Text>
        <Text style={s.p}>
          Amostra do conjunto, na ordem do arquivo. O conjunto completo tem {fmt(variantes.length)}.
        </Text>
        <View style={{ flexDirection: 'row', backgroundColor: FUNDO }} fixed>
          {[['Posição', 90], ['Ref', 45], ['Alt', 45], ['Tipo', 55], ['Gene', 60], ['Qual', 40], ['Prof', 35], ['Genótipo', 70], ['rsID', 70]].map(([c, w]) => (
            <Text key={c} style={[s.th, { width: w }]}>{c}</Text>
          ))}
        </View>
        {primeiras.map((v, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: 90 }]}>{v.chrom}:{fmt(v.pos)}</Text>
            <Text style={[s.td, { width: 45 }]}>{v.ref.slice(0, 6)}</Text>
            <Text style={[s.td, { width: 45 }]}>{v.alt.slice(0, 6)}</Text>
            <Text style={[s.td, { width: 55 }]}>{v.tipo}</Text>
            <Text style={[s.td, { width: 60 }]}>{v.gene || '—'}</Text>
            <Text style={[s.td, { width: 40, textAlign: 'right' }]}>{v.qual != null ? v.qual.toFixed(0) : '—'}</Text>
            <Text style={[s.td, { width: 35, textAlign: 'right' }]}>{v.dp ?? '—'}</Text>
            <Text style={[s.td, { width: 70 }]}>{v.zigosidade}</Text>
            <Text style={[s.td, { width: 70 }]}>{v.rsid || '—'}</Text>
          </View>
        ))}

        <Text style={s.h2}>Procedência</Text>
        <Text style={[s.p, s.apagado]}>
          Métricas derivadas do próprio arquivo, sem consulta externa. O mapeamento de gene por
          coordenada usa o conjunto de 20.033 genes distribuído com o GenVar. Nomes de doença e
          fenótipos, quando exibidos na aplicação, vêm de Orphanet e HPO; frequências, de gnomAD;
          significância clínica, de ClinVar. Este documento é para informação e pesquisa e não
          substitui avaliação, diagnóstico ou aconselhamento médico.
        </Text>

        <Rodape gerado={gerado} />
      </Page>
    </Document>
  )
}

export async function gerarPDF(dados) {
  const gerado = new Date().toLocaleString('pt-BR')
  const blob = await pdf(<RelatorioVCF dados={dados} gerado={gerado} />).toBlob()
  return blob
}
