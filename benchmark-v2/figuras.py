#!/usr/bin/env python3
"""
Figuras do benchmark, no guia de figuras da Nature Portfolio.

O GUIA, e o que cada regra obriga:

  Largura. Coluna simples 89 mm, coluna dupla 183 mm, altura maxima 247 mm. A
  figura e desenhada NO TAMANHO FINAL, em milimetros, e nao desenhada grande e
  encolhida depois: encolher reduz o corpo do texto junto e derruba o rotulo
  abaixo do minimo legivel.

  Tipo. Sans-serif, 5 a 7 pt no tamanho final. Aqui 7 pt para rotulo de eixo e
  6 pt para tique e legenda. Titulo dentro da figura NAO existe: a legenda do
  artigo faz esse papel, e titulo repetido e ruido.

  Traco. 0,25 a 1 pt. Eixo em 0,5, serie em 0,9, marcador pequeno.

  Cor. Paleta NPG, atribuida em sequencia. Nenhuma informacao depende so de cor:
  serie tambem se distingue por marcador, e barra tambem por rotulo.

SOBREPOSICAO, que e o defeito que mais estraga figura de artigo. As decisoes
tomadas aqui, todas por causa dela:

  - `layout='constrained'` e nao `tight_layout`. O tight mede uma vez e desiste;
    o constrained resolve o espaco como restricao e acomoda legenda fora do eixo
    sem cortar, que e exatamente onde o tight falha.
  - Categoria de nome longo entra em barra HORIZONTAL. Rotulo girado a 45 graus
    e a fonte mais comum de texto encavalado, e girar nao resolve, so espalha.
  - Legenda FORA do eixo, abaixo, em colunas contadas. Legenda dentro cobre
    dado, e `loc='best'` decide isso a cada rodada de dados.
  - Escala logaritmica quando a faixa passa de duas decadas. Sem ela as series
    pequenas colapsam na linha do zero e os rotulos delas se empilham.
  - Nenhum valor escrito sobre a barra quando as barras sao muitas: o numero vai
    para o CSV, que e onde ele se le sem atropelar o vizinho.

Uso:
  python3 benchmark-v2/figuras.py
  python3 benchmark-v2/figuras.py --dpi 600 --formato pdf
"""
import argparse
import csv
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent

MM = 1 / 25.4
COLUNA_SIMPLES = 89 * MM
COLUNA_DUPLA = 183 * MM
ALTURA_MAX = 247 * MM

# Paleta NPG (ggsci::scale_color_npg), atribuida em sequencia.
NPG = ["#3C5488", "#E64B35", "#00A087", "#4DBBD5", "#F39B7F",
       "#8491B4", "#91D1C2", "#7E6148", "#B09C85", "#DC0000"]
CINZA = "#8491B4"

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
    "font.size": 7,
    "axes.labelsize": 7,
    "axes.titlesize": 7,
    "xtick.labelsize": 6,
    "ytick.labelsize": 6,
    "legend.fontsize": 6,
    "axes.linewidth": 0.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.major.width": 0.5,
    "ytick.major.width": 0.5,
    "xtick.major.size": 2,
    "ytick.major.size": 2,
    "lines.linewidth": 0.9,
    "lines.markersize": 3,
    "legend.frameon": False,
    "legend.handlelength": 1.4,
    "legend.columnspacing": 1.0,
    "legend.handletextpad": 0.5,
    "figure.dpi": 300,
})


# Figuras cujo conteudo passou da caixa declarada. Preenchido por `salvar`.
TRANSBORDOU = []


def salvar(fig, caminho, dpi, formato, conferir=True):
    """Grava no tamanho final e confere se algo ficou de fora.

    `bbox_inches=None` e obrigatorio aqui: a figura e desenhada em milimetros
    para sair no tamanho de coluna do artigo, e `bbox_inches='tight'` mudaria a
    largura final, derrubando o corpo do texto junto. O preco e que qualquer
    elemento fora da caixa some CORTADO, sem aviso nenhum.

    A conferencia troca esse silencio por um numero: grava tambem em 'tight' e
    compara os dois retangulos. Se o tight for maior, tem coisa fora da caixa.
    Tolerancia de 1 mm porque o tight inclui a espessura do traco da borda.
    """
    caminho = caminho.with_suffix(f".{formato}")
    fig.savefig(caminho, dpi=dpi, facecolor="white", bbox_inches=None)

    nota = ""
    if conferir:
        declarada = fig.get_size_inches()
        bb = fig.get_tightbbox(fig.canvas.get_renderer())
        sobra_x = bb.width - declarada[0]
        sobra_y = bb.height - declarada[1]
        if sobra_x > 1 * MM or sobra_y > 1 * MM:
            TRANSBORDOU.append((caminho.name, round(sobra_x / MM, 1),
                                round(sobra_y / MM, 1)))
            nota = f"   TRANSBORDA {sobra_x / MM:.1f} x {sobra_y / MM:.1f} mm"

    plt.close(fig)
    print(f"  {caminho.name}{nota}")


def painel(ax, letra, dx=0.0):
    """Letra do painel, acima e a esquerda do eixo.

    Posicionada em coordenadas de FIGURA e nao de eixo: em coordenadas de eixo,
    um deslocamento fixo (-0,16) cai sobre o rotulo do eixo y numa figura de
    89 mm e fora da tela numa de 183 mm, porque a mesma fracao vale larguras
    diferentes. Em pontos a partir do canto do eixo, vale o mesmo nos dois.
    """
    ax.annotate(letra, xy=(0, 1), xycoords="axes fraction",
                xytext=(-26 + dx, 8), textcoords="offset points",
                fontsize=8, fontweight="bold", va="bottom", ha="left")


def legenda_abaixo(ax, ncol, y=None):
    """Legenda ABAIXO do eixo, acomodada pelo layout e nao por um deslocamento.

    `bbox_to_anchor` com um y chutado e a origem mais comum de legenda colada no
    rotulo do eixo ou cortada pela borda: o valor certo depende do numero de
    linhas da legenda, que so se sabe depois de desenhar. `loc='outside lower
    center'` entrega isso ao constrained layout, que reserva o espaco antes.
    """
    fig = ax.get_figure()
    fig.legend(*ax.get_legend_handles_labels(), loc="outside lower center", ncol=ncol)


def carregar(resultados):
    f = resultados / "funcoes.csv"
    if not f.exists():
        raise SystemExit(f"Nao encontrei {f}. Rode o executar.mjs primeiro.")
    df = pd.read_csv(f)
    for c in ("variantes", "mediana_ms", "p95_ms", "min_ms", "max_ms", "heap_delta_mb"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


# --- Figura 1: custo de cada funcao contra a escala ---------------------------
def fig_escala(df, figuras, dpi, formato):
    d = df[(df["etapa"].isin(["leitura", "qualidade", "genes", "anotacao"]))
           & df["variantes"].notna()].copy()
    # So os arquivos da serie de escala: misturar o trio e o multi-amostra aqui
    # poria dois pontos com o mesmo n e comportamento diferente sobre a mesma
    # curva, e a curva passaria a descrever duas coisas.
    escala = ["01-pequeno.vcf", "02-medio.vcf", "03-exoma.vcf", "04-grande.vcf"]
    d = d[d["arquivo"].isin(escala)]
    if d.empty:
        return

    fig, (a, b) = plt.subplots(1, 2, figsize=(COLUNA_DUPLA, 75 * MM),
                               layout="constrained")

    caras = ["lerVCF", "ClinVar", "histograma de qualidade",
             "histograma de profundidade", "espectro de substituição",
             "balanço alélico"]
    baratas = ["resumo", "Ti/Tv separado", "verificação de sexo",
               "por cromossomo", "gene por posição", "resumo clínico"]

    # UMA legenda para a figura inteira, e nao uma por painel. Duas chamadas de
    # `fig.legend` com o mesmo `loc` empilham as duas no mesmo ponto, uma por
    # cima da outra: medido, e o texto sai ilegivel. Como os dois paineis tem
    # series diferentes, a legenda combina as doze entradas em quatro colunas.
    handles, labels = [], []
    # O indice de cor CONTINUA de um painel para o outro. Reiniciando em zero,
    # a legenda combinada sai com duas entradas do mesmo tom e do mesmo
    # marcador, e nao ha como saber a qual painel cada uma pertence.
    cor = 0
    for ax, grupo, letra in ((a, caras, "a"), (b, baratas, "b")):
        for i, nome in enumerate(grupo):
            g = d[d["funcao"] == nome].sort_values("variantes")
            if g.empty:
                continue
            linha, = ax.plot(g["variantes"], g["mediana_ms"], marker="os^Dv<*P"[cor % 8],
                             color=NPG[cor % len(NPG)], label=nome)
            cor += 1
            if nome not in labels:
                handles.append(linha)
                labels.append(nome)
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_xlabel("Variantes no arquivo")
        ax.set_ylabel("Tempo mediano (ms)")
        painel(ax, letra)
    fig.legend(handles, labels, loc="outside lower center", ncol=4)

    salvar(fig, figuras / "fig1_custo_por_escala", dpi, formato)


# --- Figura 2: o pipeline inteiro, por arquivo do corpus ----------------------
def fig_pipeline(df, figuras, dpi, formato):
    ETAPAS = ["leitura", "qualidade", "genes", "anotacao", "heranca", "saida"]
    # O CSV guarda a etapa sem acento, porque e chave; a figura mostra o nome
    # como se escreve.
    ROTULO = {"leitura": "leitura", "qualidade": "qualidade", "genes": "genes",
              "anotacao": "anotação", "heranca": "herança", "saida": "saída"}
    d = df[df["etapa"].isin(ETAPAS) & (df["arquivo"] != "—")]
    if d.empty:
        return
    piv = d.pivot_table(index="arquivo", columns="etapa", values="mediana_ms",
                        aggfunc="sum").reindex(columns=ETAPAS).fillna(0)
    piv = piv.loc[piv.sum(axis=1).sort_values().index]
    total = piv.sum(axis=1)

    # DOIS PAINEIS, e a divisao conserta um erro de desenho, nao um gosto.
    #
    # Barra empilhada em eixo logaritmico esta ERRADA: `barh(left=x, width=w)`
    # desenha de `x` a `x+w`, e no log o comprimento aparente vira
    # log(x+w) - log(x), que depende de ONDE o segmento comeca. Duas etapas de
    # 50 ms saem com tamanhos diferentes conforme a ordem da pilha, e a primeira
    # comeca em log(0). Como os totais cobrem quatro ordens de grandeza, tirar o
    # log tambem nao serve: os arquivos pequenos somem.
    #
    # A saida e separar as duas perguntas. O painel a responde QUANTO custa, em
    # barra simples e log, onde empilhamento nenhum acontece. O painel b
    # responde ONDE o tempo e gasto, em composicao percentual e escala linear,
    # onde empilhar e correto por construcao, porque toda barra soma 100.
    alt = max(70, 8 * len(piv) + 34) * MM
    fig, (a, b) = plt.subplots(1, 2, figsize=(COLUNA_DUPLA, min(alt, ALTURA_MAX)),
                               layout="constrained", sharey=True)
    y = np.arange(len(piv))

    a.barh(y, total.values, height=0.62, color=NPG[0])
    a.set_xscale("log")
    a.set_yticks(y)
    a.set_yticklabels(piv.index)
    a.set_xlabel("Tempo total do pipeline (ms)")
    painel(a, "a")

    pct = piv.div(total, axis=0) * 100
    esq = np.zeros(len(piv))
    for i, e in enumerate(ETAPAS):
        b.barh(y, pct[e].values, left=esq, height=0.62, color=NPG[i],
               label=ROTULO[e], edgecolor="white", linewidth=0.3)
        esq += pct[e].values
    b.set_xlim(0, 100)
    b.set_xlabel("Composição do tempo (%)")
    painel(b, "b")
    # Legenda da FIGURA e nao do eixo: com seis entradas sob um eixo de 89 mm a
    # legenda do eixo transborda o quadro declarado, e `bbox_inches=None` corta
    # em vez de encolher.
    fig.legend(*b.get_legend_handles_labels(), loc="outside lower center", ncol=6)

    salvar(fig, figuras / "fig2_pipeline_por_arquivo", dpi, formato)


# --- Figura 3: saidas tabulares -----------------------------------------------
def fig_saidas(df, figuras, dpi, formato):
    d = df[(df["etapa"] == "saida") & df["variantes"].notna()].copy()
    escala = ["01-pequeno.vcf", "02-medio.vcf", "03-exoma.vcf", "04-grande.vcf"]
    d = d[d["arquivo"].isin(escala)]
    if d.empty:
        return
    fig, ax = plt.subplots(figsize=(COLUNA_SIMPLES, 70 * MM), layout="constrained")
    for i, (nome, g) in enumerate(d.groupby("funcao")):
        g = g.sort_values("variantes")
        ax.plot(g["variantes"], g["mediana_ms"] / 1000, marker="os^Dv"[i % 5],
                color=NPG[i % len(NPG)], label=nome)
    # Um segundo separa "respondeu" de "travou": acima disso a aba fica sem
    # pintar, porque a geracao roda na thread principal.
    ax.axhline(1.0, color=CINZA, ls=(0, (3, 2)), lw=0.5)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Variantes exportadas")
    ax.set_ylabel("Tempo mediano (s)")
    legenda_abaixo(ax, ncol=3, y=-0.30)
    salvar(fig, figuras / "fig3_saidas", dpi, formato)


# --- Figura 4: reprodutibilidade ----------------------------------------------
def fig_reprodutibilidade(resultados, figuras, dpi, formato):
    f = resultados / "reprodutibilidade.csv"
    if not f.exists():
        return
    d = pd.read_csv(f)
    crit = ["tsv_identico", "csv_identico", "vcf_identico",
            "metricas_independem_da_ordem", "vcf_carrega_sha_da_entrada",
            "vcf_carrega_versao_clinvar"]
    rot = ["TSV idêntico", "CSV idêntico", "VCF idêntico",
           "Métrica independente\nda ordem", "Carrega SHA-256\nda entrada",
           "Carrega versão\ndo ClinVar"]
    m = d[crit].apply(lambda c: c.astype(str).str.lower() == "true").values.astype(float)

    fig, ax = plt.subplots(figsize=(COLUNA_DUPLA, (14 + 7 * len(d)) * MM),
                           layout="constrained")
    ax.imshow(m, cmap=matplotlib.colors.ListedColormap(["#F2F3F5", NPG[2]]),
              vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(range(len(crit)))
    ax.set_xticklabels(rot)
    ax.set_yticks(range(len(d)))
    ax.set_yticklabels(d["arquivo"])
    # Grade branca separando as celulas, e nao linha de eixo por cima do dado.
    ax.set_xticks(np.arange(-0.5, len(crit), 1), minor=True)
    ax.set_yticks(np.arange(-0.5, len(d), 1), minor=True)
    ax.grid(which="minor", color="white", linewidth=1.2)
    ax.tick_params(which="minor", length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    salvar(fig, figuras / "fig4_reprodutibilidade", dpi, formato)


# --- Figura 5: ganho de tempo -------------------------------------------------
def fig_ganho(resultados, figuras, dpi, formato):
    f = resultados / "ganho_projecao.csv"
    if not f.exists():
        return
    d = pd.read_csv(f)
    fig, ax = plt.subplots(figsize=(COLUNA_SIMPLES, 70 * MM), layout="constrained")
    x = np.arange(len(d))
    larg = 0.26
    seg_manual = d["manual_horas"] * 3600
    seg_api = d["api_genvar_horas"] * 3600
    ax.bar(x - larg, seg_manual, larg, color=NPG[1], label="A mão, 4 consultas")
    ax.bar(x, seg_api, larg, color=NPG[0], label="API do GenVar")
    if "embarcado_segundos" in d:
        ax.bar(x + larg, d["embarcado_segundos"], larg, color=NPG[2],
               label="ClinVar embarcado")
    ax.set_yscale("log")
    ax.set_xticks(x)
    ax.set_xticklabels([f'{int(v):,}'.replace(",", ".") for v in d["variantes"]])
    ax.set_xlabel("Variantes anotadas")
    ax.set_ylabel("Tempo total (s)")
    legenda_abaixo(ax, ncol=1, y=-0.24)
    salvar(fig, figuras / "fig5_ganho", dpi, formato)


# --- Figura 6: memoria retida -------------------------------------------------
def fig_memoria(df, figuras, dpi, formato):
    d = df[(df["funcao"] == "lerVCF") & df["variantes"].notna()].copy()
    if d.empty:
        return
    d = d.sort_values("variantes")
    fig, ax = plt.subplots(figsize=(COLUNA_SIMPLES, 62 * MM), layout="constrained")
    ax.plot(d["variantes"], d["heap_delta_mb"], marker="o", color=NPG[0])
    ax.set_xscale("log")
    ax.set_xlabel("Variantes no arquivo")
    ax.set_ylabel("Memória retida (MB)")
    ax.axhline(0, color=CINZA, lw=0.5)
    salvar(fig, figuras / "fig6_memoria", dpi, formato)


# --- Figura 7: lote contra individual -----------------------------------------
def fig_lote(resultados, figuras, dpi, formato):
    f = resultados / "lote_vs_individual.csv"
    if not f.exists():
        return
    d = pd.read_csv(f)
    # A coluna de estouro so aparece quando alguma coorte nao coube. Numa rodada
    # com heap folgado ela nao existe, e exigi-la derruba a figura.
    if "individual_estourou" in d:
        d = d[d["individual_estourou"].astype(str).str.lower() != "true"]
    for c in ("arquivos", "individual_ms", "lote_ms", "individual_retido_mb",
              "lote_retido_mb", "individual_pico_mb", "lote_pico_mb"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["individual_ms"])
    if d.empty:
        return

    cenarios = list(dict.fromkeys(d["cenario"]))
    fig, eixos = plt.subplots(2, len(cenarios), figsize=(COLUNA_DUPLA, 105 * MM),
                              layout="constrained", squeeze=False)

    letras = iter("abcdef")
    for col, cen in enumerate(cenarios):
        g = d[d["cenario"] == cen].sort_values("arquivos")

        a = eixos[0][col]
        a.plot(g["arquivos"], g["individual_ms"] / 1000, marker="o", color=NPG[1],
               label="individual")
        a.plot(g["arquivos"], g["lote_ms"] / 1000, marker="s", color=NPG[0], label="lote")
        a.set_ylabel("Tempo total (s)")
        a.set_title(cen, fontsize=7)
        painel(a, next(letras))

        b = eixos[1][col]
        b.plot(g["arquivos"], g["individual_retido_mb"], marker="o", color=NPG[1],
               label="individual")
        b.plot(g["arquivos"], g["lote_retido_mb"], marker="s", color=NPG[0], label="lote")
        b.set_yscale("log")
        b.set_xlabel("Arquivos na coorte")
        b.set_ylabel("Memória retida (MB)")
        painel(b, next(letras))

    fig.legend(*eixos[0][0].get_legend_handles_labels(),
               loc="outside lower center", ncol=2)
    salvar(fig, figuras / "fig7_lote_vs_individual", dpi, formato)


# --- Figura 8: consulta com e sem cache ---------------------------------------
def fig_cache(resultados, figuras, dpi, formato):
    f = resultados / "cache.csv"
    if not f.exists():
        return
    d = pd.read_csv(f)
    if d.empty:
        return
    d = d.sort_values(["tipo", "alvo"])

    fig, (a, b) = plt.subplots(1, 2, figsize=(COLUNA_DUPLA, 68 * MM),
                               layout="constrained")

    y = np.arange(len(d))
    alt = 0.36
    a.barh(y - alt / 2, d["frio_mediana_ms"], alt, color=NPG[1], label="sem cache")
    a.barh(y + alt / 2, d["quente_mediana_ms"], alt, color=NPG[0], label="com cache")
    a.set_xscale("log")
    a.set_yticks(y)
    a.set_yticklabels(d["alvo"])
    a.set_xlabel("Tempo mediano (ms)")
    painel(a, "a")

    # O ganho por alvo, que e a leitura que o numero unico esconde: ele varia
    # com quantas chamadas externas a resposta daquele alvo encadeia.
    # Uma cor so. Duas cores aqui codificariam gene contra variante sem chave
    # que as explique, e a distincao ja esta no proprio rotulo: rsID comeca com
    # "rs" e simbolo de gene e maiusculo.
    b.barh(y, d["ganho"], height=0.62, color=NPG[0])
    b.set_yticks(y)
    b.set_yticklabels(d["alvo"])
    b.set_xlabel("Ganho do cache (vezes)")
    painel(b, "b")

    fig.legend(*a.get_legend_handles_labels(), loc="outside lower center", ncol=2)
    salvar(fig, figuras / "fig8_cache", dpi, formato)


def main():
    ap = argparse.ArgumentParser(description="Figuras do benchmark, padrão Nature")
    ap.add_argument("--resultados", default=str(AQUI / "resultados"))
    ap.add_argument("--figuras", default=str(AQUI / "figuras"))
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--formato", default="png", choices=["png", "pdf", "svg"])
    args = ap.parse_args()

    resultados = Path(args.resultados)
    figuras = Path(args.figuras)
    figuras.mkdir(parents=True, exist_ok=True)

    df = carregar(resultados)
    print(f"\nFiguras em {figuras}/\n")
    fig_escala(df, figuras, args.dpi, args.formato)
    fig_pipeline(df, figuras, args.dpi, args.formato)
    fig_saidas(df, figuras, args.dpi, args.formato)
    fig_reprodutibilidade(resultados, figuras, args.dpi, args.formato)
    fig_ganho(resultados, figuras, args.dpi, args.formato)
    fig_memoria(df, figuras, args.dpi, args.formato)
    fig_lote(resultados, figuras, args.dpi, args.formato)
    fig_cache(resultados, figuras, args.dpi, args.formato)
    n = len(list(figuras.glob(f"*.{args.formato}")))
    print(f"\n{n} figuras.")
    if TRANSBORDOU:
        print("\nConteudo fora da caixa declarada, seria cortado na publicacao:")
        for nome, dx, dy in TRANSBORDOU:
            print(f"  {nome}: sobra {dx} mm na largura, {dy} mm na altura")
        raise SystemExit(1)
    print("Nenhuma figura transborda a caixa declarada.")


if __name__ == "__main__":
    main()
