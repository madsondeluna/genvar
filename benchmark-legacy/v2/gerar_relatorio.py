#!/usr/bin/env python3
"""
Monta o relatorio do benchmark a partir dos CSV e das figuras.

Gerado, e nao escrito a mao, por um motivo pratico: numero copiado a mao para
dentro de um texto envelhece na primeira reexecucao, e um relatorio que discorda
do CSV ao lado dele e pior que nenhum relatorio. Aqui as tabelas saem dos
proprios arquivos de resultado, e o texto ao redor comenta o metodo, nao os
valores.

Uso:
  python3 benchmark-v2/gerar_relatorio.py
"""
import csv
import json
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RES = AQUI / "resultados"
FIG = AQUI / "figuras"
SAIDA = AQUI / "RELATORIO.md"


def ler(nome):
    f = RES / nome
    if not f.exists():
        return []
    with f.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def num(x, casas=1):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return "—"
    if casas == 0:
        return f"{int(round(v)):,}".replace(",", ".")
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def tabela(cabecalho, linhas):
    if not linhas:
        return "_Sem dados._\n"
    fora = ["| " + " | ".join(cabecalho) + " |",
            "|" + "|".join(["---"] * len(cabecalho)) + "|"]
    for l in linhas:
        fora.append("| " + " | ".join(str(c) for c in l) + " |")
    return "\n".join(fora) + "\n"


def secao_figura(arquivo, legenda):
    if not (FIG / arquivo).exists():
        return ""
    return f"\n![{legenda}](figuras/{arquivo})\n\n**{legenda}**\n\n"


partes = []
w = partes.append

funcoes = ler("funcoes.csv")
reprod = ler("reprodutibilidade.csv")
lote = ler("lote_vs_individual.csv")
cache = ler("cache.csv")
ganho = ler("ganho_projecao.csv")
manifesto = []
mf = AQUI / "corpus/arquivos/manifesto.json"
if mf.exists():
    manifesto = json.loads(mf.read_text())

amb = {}
af = RES / "ambiente.json"
if af.exists():
    amb = json.loads(af.read_text())

w(f"""# Relatório do benchmark

Medição de {date.today().strftime('%d/%m/%Y')}. Todos os números vêm dos CSV em
`resultados/`; este arquivo é gerado por `gerar_relatorio.py` e não editado à
mão, para não divergir dos dados ao lado.

| Item | Valor |
|---|---|
| Node | {amb.get('node', '—')} |
| Plataforma | {amb.get('plataforma', '—')} {amb.get('arch', '')} |
| Repetições por medida, suíte de funções | {amb.get('repeticoes', '—')} |
| Teto de heap, suíte de funções | {amb.get('teto_heap_mb', '—')} MB |
| Anotação clínica ativa | {'sim' if amb.get('anotacao_ativa') else 'NÃO'} |
| Medições registradas | {len(funcoes)} |

Cada suíte roda com os seus parâmetros, e eles não são os mesmos: a tabela acima
vale para a suíte de funções. As repetições e o teto de heap das demais aparecem
na seção de cada uma, tirados do próprio CSV.

A anotação ativa não é detalhe de rodapé: com o índice do ClinVar indisponível,
o módulo degrada para camada vazia, e todas as etapas seguintes medem o caminho
sem achado, com números melhores e sem nenhum sinal de que algo faltou. A coluna
`anotacao_ativa` acompanha cada linha do CSV por essa razão.
""")

# --- corpus ---
w("\n## Corpus\n")
if manifesto:
    linhas = [(m["arquivo"], num(m["variantes"], 0), num(m["mb"], 2),
               num(m.get("reais_do_clinvar", 0), 0),
               num(100 * float(m.get("fracao_real", 0)), 1) + "%",
               m["papel"]) for m in manifesto]
    w(tabela(["Arquivo", "Variantes", "MB", "Do ClinVar", "Fração", "Papel"], linhas))
    w("""
A coluna "do ClinVar" é o piso do que a anotação tem de casar. Uma primeira
versão deste corpus usava posição e rsID sorteados: casou 16 variantes em
400.000 e divergiu em 58, ou seja, exercitava o ramo "rsID conhecido, alelo não
confere" e deixava resumo clínico, critérios ACMG, filtro por painel e a largura
das linhas exportadas medindo o caso vazio.
""")

reais = [l for l in funcoes if l["arquivo"].endswith((".gz", ".vcf"))
         and l["arquivo"] in {"nist-usuario.vcf.gz", "giab-hg002-grch38.vcf.gz",
                              "htslib-teste.vcf", "1000g-chrY.vcf.gz"}]
if reais:
    w("\n### Arquivos reais\n")
    vistos = {}
    for l in reais:
        vistos.setdefault(l["arquivo"], {})[l["funcao"]] = l
    linhas = []
    for nome, fs in vistos.items():
        ler_ = fs.get("lerVCF")
        cv = fs.get("ClinVar")
        lim = fs.get("variantes x amostras")
        if lim:
            linhas.append((nome, "não coube", "—", "—", "—",
                           lim.get("erro", "")))
            continue
        linhas.append((
            nome,
            num(ler_.get("lidas"), 0) if ler_ else "—",
            (ler_.get("build") or "—") if ler_ else "—",
            num(ler_["mediana_ms"]) + " ms" if ler_ else "—",
            num(cv.get("casadas"), 0) if cv else "—",
            "truncado no teto" if ler_ and ler_.get("truncado") == "true" else "",
        ))
    w(tabela(["Arquivo", "Variantes lidas", "Build", "Leitura", "Casadas no ClinVar",
              "Observação"], linhas))

# --- funcoes ---
w("\n## Custo de cada função\n")
w(secao_figura("fig1_custo_por_escala.png",
               "Figura 1. Tempo mediano de cada função contra o número de variantes, "
               "em escala log-log. (a) funções cujo custo domina o pipeline; "
               "(b) funções de custo desprezível na mesma escala."))
w(secao_figura("fig2_pipeline_por_arquivo.png",
               "Figura 2. Pipeline completo por arquivo do corpus. (a) tempo total, em "
               "escala logarítmica; (b) composição percentual por etapa, em escala "
               "linear. As duas perguntas ficam em painéis separados porque barra "
               "empilhada em eixo logarítmico desenha comprimentos que dependem de onde "
               "cada segmento começa."))

catalogo = [l for l in funcoes if l["etapa"] == "catalogo"]
if catalogo:
    w("\n### Custo fixo, uma vez por sessão\n")
    w(tabela(["Etapa", "Tempo mediano"],
             [(l["funcao"], num(l["mediana_ms"]) + " ms") for l in catalogo]))
    w("""
A montagem do índice do ClinVar acontece uma vez por conjunto de cromossomos, e
não uma vez por arquivo. Medi-la junto do primeiro arquivo produzia uma curva de
anotação que **descia** de mil para 25 mil variantes, sugerindo que anotar mais
custa menos: o que descia era o custo fixo sendo diluído.

A chave do cache é o conjunto de cromossomos pedido. Um arquivo que cubra um
conjunto diferente do que está em cache paga a montagem de novo, e é por isso
que `01-pequeno.vcf`, `nist-usuario.vcf.gz` e `htslib-teste.vcf` aparecem com
anotação mais cara que arquivos vinte vezes maiores: nenhum deles cobre os 25
cromossomos que o aquecimento carregou.
""")

# --- saidas ---
w("\n## Saídas\n")
w(secao_figura("fig3_saidas.png",
               "Figura 3. Tempo de geração por formato de saída. A linha tracejada marca "
               "1 s, limite prático entre uma interface que responde e uma que trava: a "
               "geração roda na thread principal."))

# --- reprodutibilidade ---
w("\n## Reprodutibilidade\n")
w("""
Tempo é metade da promessa. A outra é que a mesma entrada devolva o mesmo
resultado, e é a metade que um fluxo manual com oito portais abertos não tem como
sustentar: dois analistas chegam a duas planilhas, o mesmo analista em dois dias
chega a duas, e não há artefato que prove de qual arquivo cada uma saiu.

Seis critérios, todos binários:
""")
if reprod:
    linhas = [(l["arquivo"], num(l["variantes"], 0),
               f'{l["criterios_ok"]}/{l["criterios_total"]}',
               "sim" if l["tudo_ok"].lower() == "true" else "NÃO",
               l["sha_entrada"][:12]) for l in reprod]
    w(tabela(["Arquivo", "Variantes", "Critérios", "Reprodutível", "SHA-256 da entrada"],
             linhas))
w(secao_figura("fig4_reprodutibilidade.png",
               "Figura 4. Matriz de reprodutibilidade. Verde é critério satisfeito."))
w("""
Os critérios: TSV, CSV e VCF anotado byte a byte idênticos entre duas execuções;
métricas invariantes à ordem das linhas da entrada, verificada com embaralhamento
determinístico; e o artefato carregando o SHA-256 do arquivo de entrada e a
versão da compilação do ClinVar, sem os quais dois laudos do mesmo paciente em
meses diferentes não são comparáveis.
""")

# --- lote ---
w("\n## Lote contra individual\n")
w(secao_figura("fig7_lote_vs_individual.png",
               "Figura 7. Processamento em lote contra arquivo a arquivo, em dois "
               "cenários de coorte. (a, c) tempo total; (b, d) memória retida ao fim, em "
               "escala logarítmica."))
if lote:
    linhas = []
    for l in lote:
        if not l.get("individual_ms"):
            linhas.append((l["cenario"], l["arquivos"], "não coube", "—", "—", "—", "—"))
            continue
        linhas.append((
            l["cenario"], l["arquivos"],
            num(float(l["individual_ms"]) / 1000, 2) + " s",
            num(float(l["lote_ms"]) / 1000, 2) + " s",
            num(l["individual_retido_mb"], 0) + " MB",
            num(l["lote_retido_mb"], 0) + " MB",
            num(l["ganho_retido"], 1) + "x",
        ))
    w(tabela(["Cenário", "Arquivos", "Individual", "Lote", "Retido individual",
              "Retido lote", "Ganho de memória"], linhas))
    tetos = sorted({l.get("teto_heap_mb", "") for l in lote if l.get("teto_heap_mb")})
    reps = sorted({l.get("repeticoes", "") for l in lote if l.get("repeticoes")})
    w(f"""
Repetições por ponto: {', '.join(reps) or '—'}. Teto de heap: {', '.join(tetos) or '—'} MB.

**O teto de heap muda o resultado e por isso viaja com ele.** Com o padrão do
Node, perto de 2 GB, o caminho individual morre antes de terminar a coorte de
50; as linhas acima de 25 arquivos vêm de uma rodada com teto alto, onde o que
se mede é o algoritmo e não o limite da máquina. Um navegador está mais perto do
teto padrão, e é lá que a aba morre.
""")
w("""
Dois cenários, e a distinção decide o resultado. Numa coorte em que todos os
arquivos cobrem os mesmos cromossomos, o índice do ClinVar é montado uma vez nos
dois caminhos, e o lote **não ganha tempo**: ganha memória. Numa coorte de
painéis dirigidos, cada arquivo cobre um punhado de cromossomos diferente e paga
a própria montagem, e aí a união de cromossomos do lote vira ganho de tempo
também.

O número que decide se roda no navegador é a memória retida, não o tempo. Ela
cresce linearmente com a coorte no caminho individual e fica praticamente
constante no lote, porque cada arquivo é lido, anotado, resumido e descartado.
""")

# --- cache ---
if cache:
    w("\n## Consulta com cache e sem cache\n")
    linhas = [(l["tipo"], l["alvo"],
               num(float(l["frio_mediana_ms"]) / 1000, 2) + " s",
               num(l["quente_mediana_ms"], 0) + " ms",
               num(l["ganho"], 0) + "x") for l in cache]
    w(tabela(["Tipo", "Alvo", "Sem cache", "Com cache", "Ganho"], linhas))
    nf = sorted({l.get("n_frio", "") for l in cache if l.get("n_frio")})
    nq = sorted({l.get("n_quente", "") for l in cache if l.get("n_quente")})
    w(f"\nChamadas por alvo: {', '.join(nf) or '—'} sem cache, "
      f"{', '.join(nq) or '—'} com cache.\n")
    w("""
Sem cache, a resposta é montada encadeando Ensembl, gnomAD, ClinVar e MyVariant,
com as dependências entre elas respeitadas. Com cache, é uma leitura do Redis.
O intervalo entre as chamadas a frio não é cortesia: o Ensembl aplica uso justo
em 15 requisições por segundo, e uma varredura saindo daqui bloqueia a origem
para todos os usuários da aplicação de uma vez.
""")

# --- ganho ---
if ganho:
    w("\n## Ganho de tempo sobre o fluxo manual\n")
    linhas = [(num(l["variantes"], 0), num(l["manual_horas"], 1) + " h",
               num(l.get("embarcado_segundos", 0), 1) + " s") for l in ganho]
    w(tabela(["Variantes", "A mão", "ClinVar embarcado"], linhas))
    w(secao_figura("fig5_ganho.png",
                   "Figura 5. Tempo total para anotar N variantes por cada caminho, em "
                   "escala logarítmica."))
    w("""
**As duas últimas colunas são projeção, não medida nessa escala.** Mede-se o
custo real por variante numa amostra pequena e multiplica-se. Medir 100 mil
variantes a mão levaria dias e bloquearia o acesso do projeto às fontes.

O que a projeção não inclui, e que só aumentaria a diferença: tempo humano de
navegação, erro de transcrição, e o retrabalho de refazer tudo quando alguém
pergunta de qual arquivo aquela planilha saiu.

A API do GenVar não entra nesta projeção de propósito. Ela existe para a
consulta de **uma** variante, e o custo dela por variante está na tabela acima;
ninguém anota cem mil variantes chamando-a um rsID de cada vez. A anotação em
massa é o que o ClinVar embarcado faz, numa passada e sem rede, e é essa a
comparação com o fluxo manual.
""")

w("\n## Memória\n")
w(secao_figura("fig6_memoria.png",
               "Figura 6. Memória retida após a leitura, contra o número de variantes."))

SAIDA.write_text("\n".join(partes))
print(f"  {SAIDA.relative_to(AQUI.parent)}  ({len(''.join(partes).splitlines())} linhas)")
