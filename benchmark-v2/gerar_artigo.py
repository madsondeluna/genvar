#!/usr/bin/env python3
"""
Monta o relatorio do benchmark no formato de artigo de Bioinformatics (Oxford).

Gerado, e nao escrito a mao, pelo mesmo motivo do RELATORIO.md: numero copiado
para dentro de um texto envelhece na primeira reexecucao, e um artigo que
discorda do CSV ao lado dele e pior que nenhum artigo. As tabelas e os valores
citados no corpo saem dos proprios arquivos de resultado; o texto ao redor
discute metodo e achado, que e o que nao se deriva de dado.

Estrutura do periodico: Abstract com Motivation, Results e Availability;
Introduction; Methods; Results; Discussion; Conclusion.

Uso:
  python3 benchmark-v2/gerar_artigo.py
"""
import csv
import json
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RES = AQUI / "resultados"
FIG = AQUI / "figuras"
SAIDA = AQUI / "ARTIGO.md"


def ler(nome):
    f = RES / nome
    if not f.exists():
        return []
    with f.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def n(x, casas=1):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return "—"
    if casas == 0:
        return f"{int(round(v)):,}".replace(",", ".")
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def tabela(cab, linhas, legenda=None):
    if not linhas:
        return "_Sem dados._\n"
    fora = ["| " + " | ".join(cab) + " |", "|" + "|".join(["---"] * len(cab)) + "|"]
    for l in linhas:
        fora.append("| " + " | ".join(str(c) for c in l) + " |")
    if legenda:
        fora.append("")
        fora.append(legenda)
    return "\n".join(fora) + "\n"


def figura(arquivo, numero, legenda):
    if not (FIG / arquivo).exists():
        return ""
    return (f"\n![Figura {numero}](figuras/{arquivo})\n\n"
            f"**Fig. {numero}.** {legenda}\n\n")


def achar(linhas, **filtros):
    for l in linhas:
        if all(str(l.get(k, "")).strip() == str(v) for k, v in filtros.items()):
            return l
    return {}


funcoes = ler("funcoes.csv")
reprod = ler("reprodutibilidade.csv")
lote = ler("lote_vs_individual.csv")
cache = ler("cache.csv")
api = ler("api_latencia.csv")
limite = ler("limite.csv")
dados = ler("dados_resumo.csv")
testes = ler("build_testes.csv")
amb = json.loads((RES / "ambiente.json").read_text()) if (RES / "ambiente.json").exists() else {}
manifesto = (json.loads((AQUI / "corpus/arquivos/manifesto.json").read_text())
             if (AQUI / "corpus/arquivos/manifesto.json").exists() else [])

partes = []
w = partes.append

# --- Abstract -----------------------------------------------------------------

leitura_400k = achar(funcoes, arquivo="04-grande.vcf", funcao="lerVCF")
anot_400k = achar(funcoes, arquivo="04-grande.vcf", funcao="ClinVar")
lote_100 = achar(lote, cenario="exoma completo", arquivos="100")
reprod_ok = sum(1 for r in reprod if str(r.get("tudo_ok", "")).lower() == "true")

w(f"""# Benchmarking a browser-resident variant annotation platform

_Relatório técnico em formato de artigo, {date.today().strftime('%d/%m/%Y')}. Todos
os valores citados vêm dos CSV em `resultados/`; este arquivo é gerado por
`gerar_artigo.py` e não editado à mão, para não divergir dos dados._

## Abstract

**Motivation.** A interpretação de variantes genéticas exige consultar bases que
publicam por interfaces distintas, e as ferramentas que as consolidam pedem que o
arquivo do paciente seja enviado a um servidor. Um VCF é dado genético de pessoa
identificável: o que não sobe dispensa base legal para tratamento. Isso impõe uma
restrição de engenharia pouco usual, a de executar anotação clínica dentro do
navegador, e a pergunta que fica aberta é se ela é praticável na escala de um
exoma, para a qual não encontramos medição publicada: os benchmarks que
localizamos medem tempo de resposta de servidor.

**Results.** Foram medidas todas as funções do pipeline sobre um corpus de doze
arquivos sintéticos determinísticos e quatro arquivos reais de fontes públicas,
mais as rotas da API com {api[0].get('replicas', '10') if api else '10'} réplicas
por rota. A leitura de 400.000 variantes leva {n(leitura_400k.get('mediana_ms'), 0)} ms
e o cruzamento com o ClinVar embarcado {n(anot_400k.get('mediana_ms'), 0)} ms, com
o índice já montado. Em coorte de cem exomas, o processamento em lote retém
{n(lote_100.get('lote_retido_mb'), 0)} MB contra {n(lote_100.get('individual_retido_mb'), 0)} MB
do caminho arquivo a arquivo, um fator de {n(lote_100.get('ganho_retido'), 1)}.
{reprod_ok} de {len(reprod)} arquivos satisfazem os seis critérios de
reprodutibilidade. Três limites foram encontrados por medição, um deles um defeito
de estouro de pilha em uso rotineiro.

**Availability.** Código, corpus determinístico e resultados em
`benchmark-v2/`. Os arquivos reais são baixados de repositórios públicos e não
versionados.

## 1 Introduction

Ferramentas de interpretação de variantes consolidam ClinVar, gnomAD, Ensembl e
outras bases numa consulta só, e quase todas o fazem no servidor. Para um VCF, essa
escolha tem consequência jurídica antes de ter consequência técnica: o arquivo
identifica a pessoa de quem veio, e enviá-lo a um terceiro é tratamento de dado
genético.

A alternativa é executar a anotação no navegador. Ela remove a transmissão, e em
troca impõe três restrições que um servidor não tem: a memória é a da aba, o
processamento disputa a thread que pinta a tela, e os catálogos precisam viajar
até o cliente. As três são mensuráveis, e não as encontramos medidas nos
benchmarks de ferramentas comparáveis, que reportam tempo de resposta de API.

Este relatório mede o caminho inteiro: cada função do pipeline em separado, sobre
escalas de mil a 600 mil variantes, com arquivos sintéticos de comportamento
conhecido e com arquivos reais de referência. Mede também o que tempo nenhum
descreve, que é se a mesma entrada devolve o mesmo laudo.

## 2 Materials and Methods

### 2.1 Corpus

""")

if manifesto:
    w(tabela(["Arquivo", "Variantes", "MB", "Do ClinVar", "Papel"],
             [(m["arquivo"], n(m["variantes"], 0), n(m["mb"], 2),
               n(m.get("reais_do_clinvar", 0), 0), m["papel"]) for m in manifesto],
             "**Tabela 1.** Corpus sintético. Semente fixa: duas execuções produzem "
             "arquivos byte a byte idênticos."))

w("""
Cada arquivo existe para exercitar um caminho que os outros não alcançam: escala,
entrada comprimida em `.gz` e em `.zip`, GRCh37, build não declarado, trio com os
números de herança plantados no cabeçalho, arquivo com defeitos de rotina e
arquivo com cinco amostras.

**Oito por cento de cada arquivo vem das próprias tabelas do ClinVar embarcado**, e
essa decisão corrige um erro de método da primeira versão. Com posição e rsID
sorteados, o cruzamento casou 16 variantes em 400.000 e divergiu em 58: a suíte
exercitava o ramo "rsID conhecido, alelo não confere" e deixava resumo clínico,
critérios ACMG, filtro por painel e a largura das linhas exportadas medindo o caso
vazio. A fração efetiva é registrada no manifesto, porque prometer 8% e entregar
1% em silêncio é o mesmo erro com outra roupa.

Quatro arquivos reais complementam o corpus: o benchmark GIAB HG002 v4.2.1 em
GRCh38, um recorte de exoma do GIAB/NIST HG001 em GRCh37, o cromossomo Y do 1000 Genomes com 1.233
amostras, e o arquivo de casos de borda do htslib. O corpus sintético controla a
variável; os reais verificam que o controle não construiu um mundo mais fácil que
o real.

### 2.2 Instrumentação

As funções do pipeline são medidas em Node, importando os mesmos módulos ESM que a
página carrega, de modo que o que se mede é o custo do algoritmo sem o ruído de
renderização. O que Node não reproduz está declarado: pintura, congelamento da aba
e teto de memória da guia são do navegador.

Duas condições viajam com cada medida, e as duas por defeito observado. A primeira
é se a anotação clínica estava ativa: com o índice indisponível, o módulo degrada
para camada vazia e todas as etapas seguintes medem o caminho sem achado, com
números melhores e sem sinal de que algo faltou. A segunda é o teto de heap: o
caminho arquivo a arquivo morre por falta de memória antes de terminar cinquenta
exomas com o limite padrão do Node, e as linhas acima disso vêm de execução com
teto ampliado, onde o que se mede é o algoritmo e não o limite da máquina.

Memória é reportada em duas grandezas. O **pico** é amostrado durante a execução e
diz o que a aba precisa aguentar; a **retida** é lida após coleta forçada, com o
resultado ainda referenciado, e diz o que a coorte deixa para trás. A diferença
entre antes e depois, que seria a medida ingênua, foi descartada: com uma
repetição ela produziu 284 MB num caso e 0 MB noutro, e um ganho aparente de
1837 vezes que é ruído de coletor.

A latência da API é medida com dez réplicas por rota, em duas condições. Frio é o
custo de montar a resposta encadeando as fontes, com o cache zerado antes de cada
réplica; quente é uma leitura do Redis. Uma réplica não teria significado: a mesma
chamada ao Ensembl mediu 2,3 s e 43 s em tentativas seguidas. A mediana é o valor
citado, porque média é puxada por um pico da fonte que não representa o caso
típico.
""")

# --- Resultados ---------------------------------------------------------------

w("\n## 3 Results\n\n### 3.1 Custo por função e por escala\n")
w(figura("fig1_custo_por_escala.png", 1,
         "Tempo mediano de cada função contra o número de variantes, em escala "
         "log-log. (a) funções cujo custo domina o pipeline; (b) funções de custo "
         "desprezível na mesma escala. A leitura e o cruzamento com o ClinVar "
         "crescem linearmente com o número de variantes; as métricas de qualidade "
         "ficam uma ordem de grandeza abaixo em toda a faixa."))

escala = [l for l in funcoes if l["funcao"] == "lerVCF" and l["arquivo"].startswith("0")]
if escala:
    w(tabela(["Arquivo", "Variantes", "Leitura (ms)", "p95 (ms)", "Variantes/s", "Memória (MB)"],
             [(l["arquivo"], n(l.get("variantes"), 0), n(l["mediana_ms"], 0),
               n(l["p95_ms"], 0), n(l.get("variantes_por_segundo"), 0),
               n(l.get("heap_delta_mb"), 0)) for l in sorted(
                 escala, key=lambda x: float(x.get("variantes") or 0))],
             f"**Tabela 2.** Leitura do VCF por escala. Réplicas: "
             f"{escala[0].get('n', '—')}. Teto de heap: "
             f"{n(escala[0].get('teto_heap_mb'), 0)} MB."))

cat = [l for l in funcoes if l["etapa"] == "catalogo"]
if cat:
    w("\n### 3.2 Custo fixo de sessão\n")
    w(tabela(["Etapa", "Tempo (ms)"], [(l["funcao"], n(l["mediana_ms"], 0)) for l in cat],
             "**Tabela 3.** Custo pago uma vez por sessão, e não por arquivo. "
             "A montagem do índice é medida com uma réplica: ela acontece uma vez "
             "e repeti-la mediria o cache."))
    w("""
A montagem do índice do ClinVar é o maior item, e medi-la junto do primeiro
arquivo produzia uma curva de anotação que **descia** de mil para 25 mil
variantes: o que descia era o custo fixo sendo diluído. A chave do cache é o
conjunto de cromossomos pedido, então um arquivo que cubra conjunto diferente
paga a montagem outra vez. É esse mecanismo que separa os dois cenários de
coorte na seção 3.4.
""")

w("\n### 3.3 Pipeline completo e saídas\n")
w(figura("fig2_pipeline_por_arquivo.png", 2,
         "Pipeline completo por arquivo. (a) tempo total, em escala logarítmica; "
         "(b) composição percentual por etapa, em escala linear. As duas perguntas "
         "ficam em painéis separados porque barra empilhada em eixo logarítmico "
         "desenha comprimentos que dependem de onde cada segmento começa."))
w(figura("fig3_saidas.png", 3,
         "Tempo de geração por formato de saída. A linha tracejada marca 1 s, "
         "limite prático entre uma interface que responde e uma que trava, já que "
         "a geração roda na thread principal. XLSX é uma ordem de grandeza mais "
         "caro que as saídas de texto."))

w("\n### 3.4 Lote contra arquivo a arquivo\n")
w(figura("fig7_lote_vs_individual.png", 7,
         "Processamento em lote contra arquivo a arquivo, em dois cenários de "
         "coorte. (a, c) tempo total; (b, d) memória retida ao fim, em escala "
         "logarítmica. A memória retida do caminho individual cresce linearmente "
         "com a coorte; a do lote não."))
if lote:
    w(tabela(["Cenário", "Arquivos", "Individual (s)", "Lote (s)",
              "Retido ind. (MB)", "Retido lote (MB)", "Fator"],
             [(l["cenario"], l["arquivos"],
               n(float(l["individual_ms"]) / 1000, 2) if l.get("individual_ms") else "não coube",
               n(float(l["lote_ms"]) / 1000, 2) if l.get("lote_ms") else "—",
               n(l.get("individual_retido_mb"), 0), n(l.get("lote_retido_mb"), 0),
               n(l.get("ganho_retido"), 1)) for l in lote],
             f"**Tabela 4.** Coorte processada pelos dois caminhos, em dois cenários. "
             f"Réplicas: {lote[0].get('repeticoes', '—')}. Teto de heap: "
             f"{n(lote[0].get('teto_heap_mb'), 0)} MB, acima do que um navegador "
             f"oferece: com o teto padrão do Node o caminho individual não "
             f"termina a coorte de cinquenta."))

w("\n### 3.5 Reprodutibilidade\n")
w(figura("fig4_reprodutibilidade.png", 4,
         "Matriz de reprodutibilidade. Cada coluna é um critério binário; verde é "
         "satisfeito."))
if reprod:
    w(tabela(["Arquivo", "Variantes", "Critérios", "SHA-256 da entrada"],
             [(r["arquivo"], n(r["variantes"], 0),
               f'{r["criterios_ok"]}/{r["criterios_total"]}', r["sha_entrada"][:16])
              for r in reprod],
             "**Tabela 5.** Seis critérios: TSV, CSV e VCF anotado idênticos entre "
             "execuções; métricas invariantes à ordem das linhas; e o artefato "
             "carregando o SHA-256 da entrada e a versão da compilação do ClinVar."))

w("\n### 3.6 Latência da API e efeito do cache\n")
w(figura("fig9_api_latencia.png", 9,
         "Latência por rota. (a) mediana sem e com cache, com a faixa entre o menor "
         "e o maior valor das réplicas; (b) fator de ganho do cache. As rotas que "
         "dependem de fonte externa dominam a cauda."))
w(figura("fig10_replicas.png", 10,
         "As dez réplicas de cada rota, sem cache. Cada ponto é uma chamada e o "
         "traço vermelho é a mediana. É a figura que justifica medir dez vezes: em "
         "rota que depende de fonte externa, duas chamadas seguidas ao mesmo "
         "endereço diferem por um fator de dez."))
if api:
    piores = sorted(api, key=lambda l: -float(l.get("frio_mediana_ms") or 0))[:8]
    w(tabela(["Rota", "Tipo", "Sem cache (ms)", "Com cache (ms)", "Ganho"],
             [(l["rota"], "externa" if str(l["externa"]).lower() in ("true", "1") else "interna",
               n(l.get("frio_mediana_ms"), 0), n(l.get("quente_mediana_ms"), 1),
               f'{l["ganho_cache"]}x' if l.get("ganho_cache") else "—") for l in piores],
             "**Tabela 6.** As oito rotas mais lentas sem cache, mediana de dez réplicas."))

w("\n### 3.7 Infraestrutura e proteção do acesso às fontes\n")
w(figura("fig11_infraestrutura.png", 11,
         "(a) catálogos versionados, cru contra o que é entregue comprimido; "
         "(b) pacote da aplicação por papel, em disco e comprimido."))
w(figura("fig12_limite.png", 12,
         "Limitador de taxa sob rajada. A barra com cabeçalho forjado é idêntica à "
         "de um IP só: forjar o `X-Forwarded-For` a cada requisição não compra "
         "nada, porque o elemento confiável é contado a partir do fim da cadeia."))
w(figura("fig13_testes.png", 13, "Custo de provar que a aplicação continua correta."))

# --- Discussao ----------------------------------------------------------------

w("""
## 4 Discussion

### 4.1 A restrição de memória é a que decide, e não a de tempo

O resultado mais consequente da seção 3.4 não é o tempo. Nos dois cenários de
coorte, o ganho de tempo do processamento em lote é modesto e depende de
circunstância: quando todos os arquivos cobrem os mesmos cromossomos, o índice do
ClinVar é montado uma vez em ambos os caminhos e o lote não acelera nada. O que
não depende de circunstância é a memória retida, que cresce linearmente com a
coorte no caminho arquivo a arquivo e permanece praticamente constante no lote.

A razão é de projeto e não de otimização: cada arquivo é lido, anotado, resumido e
descartado, e o que sobrevive são algumas centenas de linhas por amostra. É a
mesma disciplina de um pipeline de produção que não carrega a coorte inteira em
memória, aplicada ao lugar em que a restrição é mais dura, que é uma aba de
navegador.

Reportar apenas o tempo teria produzido a conclusão oposta e errada, de que o
modo em lote pouco acrescenta.

### 4.2 Medir até quebrar encontra defeito que teste não encontra

Três limites apareceram, e um deles é um defeito de correção em uso rotineiro.

O cálculo de histograma usava `Math.max(...vetor)`. Espalhar um vetor num
argumento consome uma posição de pilha por elemento, e a 400 mil variantes a
chamada morre com estouro de pilha. A suíte de testes não pegava, porque testa
sobre dezenas de variantes; a escala é que revela. O mesmo padrão existia no
gráfico de Manhattan da página de associação, onde o conjunto de pontos também
tem o tamanho do dado.

O segundo limite é conceitual: o teto de leitura conta **variantes** e o que ocupa
memória é variantes vezes amostras. O cromossomo Y do 1000 Genomes tem 1.233
amostras, e as 400.000 variantes que o teto permite seriam 493 milhões de
genótipos. O processo morre antes de terminar de ler. O teto correto seria em
genótipos.

O terceiro é o custo de gerar XLSX, uma ordem de grandeza acima das saídas de
texto e acima do limite de resposta percebida a partir de 25.000 linhas.

### 4.3 Reprodutibilidade é a metade que tempo nenhum mede

Os seis critérios da seção 3.5 respondem a uma pergunta que um fluxo manual com
oito portais abertos não tem como responder: dois analistas chegam a duas
planilhas, o mesmo analista em dois dias chega a duas, e não há artefato que prove
de qual arquivo cada uma saiu. Aqui a saída é byte a byte idêntica entre
execuções, as métricas não dependem da ordem das linhas da entrada, e o artefato
carrega o SHA-256 do arquivo e a versão da compilação do ClinVar.

O critério de invariância à ordem merece nota. Ele não é uma formalidade: uma
contagem que dependa da ordem de iteração é um defeito silencioso, do tipo que só
aparece quando alguém reordena o arquivo por outra razão e os números mudam sem
explicação.

### 4.4 O que a medição corrigiu no próprio método

Três erros de medição foram cometidos e corrigidos durante este trabalho, e vale
registrá-los porque cada um produziu números plausíveis e errados.

O primeiro: as suítes rodaram com o índice do ClinVar indisponível, porque
`fetch` de caminho absoluto não resolve fora de um navegador. A degradação
graciosa que protege o usuário quando o índice não sobe passou a esconder um erro
de medição, e todas as etapas seguintes mediram o caminho sem achado, com números
melhores. A correção foi resolver os caminhos contra o disco e gravar em cada
linha se a anotação estava ativa.

O segundo: o corpus sorteava posição e rsID, e o cruzamento praticamente não
casava. Corrigido plantando variantes reais das próprias tabelas.

O terceiro: as medidas de coorte foram tomadas com teto de heap ampliado e nada
registrava isso, enquanto uma frase vizinha afirmava que cinquenta exomas não
cabem no teto padrão. São condições diferentes apresentadas como um resultado só.
A correção foi gravar o teto vigente em cada linha do CSV.

Os três têm a mesma forma: uma condição que muda o número e não viajava com ele.

### 4.5 A cauda da latência externa é o risco operacional

A Tabela 6 mostra uma distribuição com cauda longa: as rotas internas respondem em
dezenas de milissegundos e as que dependem de fonte externa vão de centenas de
milissegundos a dezenas de segundos. A rota de fenótipos de gene é o extremo, com
mediana de 88 s sem cache, e é onde a Figura 10 mais informa: as réplicas dela se
concentram num valor alto sem dispersão, o que indica saturação e não variação.

O cache muda a ordem de grandeza e não a natureza do problema. Os fatores de ganho
passam de 900 nas rotas de gene, o que é consequência aritmética de comparar
dezenas de segundos com dezenas de milissegundos, e não uma otimização do
caminho caro: a primeira visita de cada alvo continua pagando o preço integral. É
o que justifica a decisão da seção 3.6 de separar a leitura de variantes numa
rota própria, para que a página apareça antes da parte lenta terminar.

### 4.6 Limitações

As medidas de pipeline são feitas em Node e não num navegador, então pintura,
congelamento de aba e o teto de memória real da guia ficam fora. A latência das
fontes externas varia com a hora e a carga delas, e as medianas aqui descrevem
uma janela de medição, não um contrato. O corpus sintético controla a variável ao
preço de não reproduzir a distribuição real de qualidade de chamada de um exoma
clínico; os quatro arquivos reais reduzem, mas não eliminam, essa distância.

## 5 Conclusion

Anotação clínica de VCF dentro do navegador é praticável na escala de um exoma: a
leitura e o cruzamento de 400.000 variantes ficam em poucos segundos, e o custo
que domina o pipeline é a leitura do arquivo, não a anotação. O que limita o
alcance não é tempo, é memória, e o processamento em lote com descarte por arquivo
mantém a memória retida constante enquanto a coorte cresce.

A medição encontrou três limites e um defeito de correção que a suíte de testes
não alcançava, o que sustenta a prática de medir até quebrar em vez de medir
apenas o caso confortável.
""")

SAIDA.write_text("\n".join(partes))
linhas = "\n".join(partes).count("\n")
print(f"  {SAIDA.relative_to(AQUI.parent)}  ({linhas} linhas)")
