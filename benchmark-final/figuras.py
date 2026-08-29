#!/usr/bin/env python3
"""
Gera as figuras do benchmark a partir dos CSV de resultados.

Cada funcao produz UMA figura e devolve o nome do arquivo. O texto de
RESULTADOS.md cita as figuras pelo numero, entao a ordem aqui e a ordem la.

Uso:
  python3 benchmark-final/figuras.py
  python3 benchmark-final/figuras.py --resultados benchmark-final/resultados/local
"""
import argparse
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import estilo  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

estilo.aplicar()

ORDEM_FAMILIA = ["gene", "variante", "doenca", "painel", "escore", "listagem", "meta"]
ROTULO_FAMILIA = {"gene": "Gene", "variante": "Variante", "doenca": "Doença",
                  "painel": "Painel", "escore": "Escore poligênico",
                  "listagem": "Listagem", "meta": "Meta"}


def _le(base, nome):
    caminho = Path(base) / nome
    if not caminho.exists() or caminho.stat().st_size == 0:
        return None
    return pd.read_csv(caminho)


# --------------------------------------------------------------- latencia ----
def fig_latencia_familia(base, saida):
    """Frio contra quente por familia, em escala logaritmica."""
    d = _le(base, "latencia.csv")
    if d is None:
        return None
    d = d[d["frio_mediana"].notna() & d["quente_mediana"].notna()]
    fam = [f for f in ORDEM_FAMILIA if f in set(d["familia"])]
    frio = [d[d.familia == f]["frio_mediana"].median() for f in fam]
    quente = [d[d.familia == f]["quente_mediana"].median() for f in fam]

    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    x = np.arange(len(fam))
    l = 0.38
    b1 = ax.bar(x - l / 2, frio, l, label="Cache frio", color=estilo.ATENCAO)
    b2 = ax.bar(x + l / 2, quente, l, label="Cache quente", color=estilo.PRINCIPAL)
    ax.set_yscale("log")
    ax.set_ylabel("Latência mediana, em milissegundos (escala logarítmica)")
    ax.set_xticks(x)
    ax.set_xticklabels([ROTULO_FAMILIA[f] for f in fam], rotation=20, ha="right")
    ax.set_title("Latência por Família de Rota, com Cache Frio e Quente")
    ax.set_ylim(1, max(frio) * 6)
    for b, v in list(zip(b1, frio)) + list(zip(b2, quente)):
        ax.text(b.get_x() + b.get_width() / 2, v * 1.15,
                estilo.milhar(v), ha="center", va="bottom", fontsize=7.5)
    estilo.legenda_abaixo(ax, 2, y=-0.24)
    return estilo.salvar(fig, Path(saida) / "fig01_latencia_familia.png"), \
        "fig01_latencia_familia.png"


def fig_ganho_cache(base, saida):
    """Quantas vezes o cache acelera cada rota."""
    d = _le(base, "latencia.csv")
    if d is None:
        return None
    d = d[d["ganho_cache"].notna()].copy()
    g = d.groupby("nome")["ganho_cache"].median().sort_values()
    fig, ax = plt.subplots(figsize=(7.2, max(3.2, 0.30 * len(g))))
    cores = [estilo.BOM if v >= 100 else estilo.SECUNDARIA if v >= 10 else estilo.NEUTRA
             for v in g.values]
    barras = ax.barh(range(len(g)), g.values, color=cores, height=0.66)
    ax.set_yticks(range(len(g)))
    ax.set_yticklabels(g.index)
    ax.set_xscale("log")
    ax.set_xlabel("Vezes mais rápido com cache quente (escala logarítmica)")
    ax.set_title("Ganho do Cache por Rota")
    ax.axvline(1, color=estilo.NEUTRA, linestyle="--", linewidth=0.9)
    ax.set_xlim(0.7, max(g.values) * 3)
    for b, v in zip(barras, g.values):
        ax.text(v * 1.12, b.get_y() + b.get_height() / 2,
                f"{estilo.milhar(v)}x", va="center", fontsize=7.5)
    return estilo.salvar(fig, Path(saida) / "fig02_ganho_cache.png"), \
        "fig02_ganho_cache.png"


def fig_dispersao_latencia(base, saida):
    """Mediana com intervalo de confianca e p95, por rota, no estado frio."""
    d = _le(base, "latencia.csv")
    if d is None:
        return None
    d = d[(d["de_rede"] == True) & d["frio_mediana"].notna()].copy()  # noqa: E712
    d = d.groupby("nome").agg(
        mediana=("frio_mediana", "median"), lo=("frio_ic_baixo", "median"),
        hi=("frio_ic_alto", "median"), cauda=("frio_max", "median")).sort_values("mediana")
    fig, ax = plt.subplots(figsize=(7.2, 3.4))
    y = np.arange(len(d))
    erro = np.vstack([(d["mediana"] - d["lo"]).clip(lower=0),
                      (d["hi"] - d["mediana"]).clip(lower=0)])
    ax.errorbar(d["mediana"] / 1000, y, xerr=erro / 1000, fmt="o", color=estilo.PRINCIPAL,
                capsize=3, markersize=5, linewidth=1.2, label="Mediana e IC 95%")
    ax.scatter(d["cauda"] / 1000, y, marker="|", s=90, color=estilo.RUIM,
               label="Máximo observado")
    ax.set_yticks(y)
    ax.set_yticklabels(d.index)
    ax.set_xlabel("Segundos até a resposta, com cache frio")
    ax.set_title("Dispersão da Latência Fria nas Rotas Que Consultam a Rede")
    estilo.legenda_abaixo(ax, 2, y=-0.30)
    return estilo.salvar(fig, Path(saida) / "fig03_dispersao_latencia.png"), \
        "fig03_dispersao_latencia.png"


# ------------------------------------------------------ requisicoes externas ----
def fig_requisicoes(base, saida):
    """Quantas chamadas a bases publicas cada consulta dispara, frio e quente."""
    d = _le(base, "requisicoes.csv")
    if d is None:
        return None
    d = d[(d.status_frio == 200) & (d.status_quente == 200)]
    g = d.groupby("familia").agg(frio=("requisicoes_frio", "mean"),
                                 quente=("requisicoes_quente", "mean"))
    g = g[g.frio > 0].sort_values("frio", ascending=True)
    fig, ax = plt.subplots(figsize=(7.2, max(3.0, 0.42 * len(g))))
    y = np.arange(len(g))
    b1 = ax.barh(y + 0.19, g.frio, 0.36, label="Cache frio", color=estilo.ATENCAO)
    ax.barh(y - 0.19, g.quente, 0.36, label="Cache quente", color=estilo.PRINCIPAL)
    ax.set_yticks(y)
    ax.set_yticklabels(g.index)
    ax.set_xlabel("Requisições a bases públicas por consulta")
    ax.set_title("Pressão Sobre as Fontes Externas por Consulta")
    ax.set_xlim(0, g.frio.max() * 1.3)
    for b, v in zip(b1, g.frio):
        ax.text(v + g.frio.max() * 0.02, b.get_y() + b.get_height() / 2,
                f"{v:.0f}".replace(".0", ""), va="center", fontsize=8)
    ax.text(g.frio.max() * 0.62, -0.6,
            "Com cache quente, todas as famílias fazem zero requisições.",
            fontsize=8, color=estilo.NEUTRA, style="italic")
    estilo.legenda_abaixo(ax, 2, y=-0.16 - 0.02 * len(g))
    return estilo.salvar(fig, Path(saida) / "fig04_requisicoes.png"), "fig04_requisicoes.png"


def fig_requisicoes_host(base, saida):
    """A qual base cada consulta vai, e quantas vezes."""
    d = _le(base, "requisicoes.csv")
    if d is None or "hosts" not in d.columns:
        return None
    linhas = {}
    for _, r in d[d.status_frio == 200].iterrows():
        if not isinstance(r["hosts"], str) or not r["hosts"]:
            continue
        for par in r["hosts"].split(";"):
            if "=" not in par:
                continue
            host, n = par.rsplit("=", 1)
            linhas.setdefault(r["familia"], {}).setdefault(host, 0)
            linhas[r["familia"]][host] += int(n)
    if not linhas:
        return None
    m = pd.DataFrame(linhas).fillna(0).T
    m = m.div([len(d[(d.familia == f) & (d.status_frio == 200)]) for f in m.index], axis=0)
    m = m.loc[m.sum(axis=1).sort_values().index]
    fig, ax = plt.subplots(figsize=(7.6, max(3.0, 0.42 * len(m))))
    esq = np.zeros(len(m))
    for i, host in enumerate(m.columns):
        ax.barh(m.index, m[host], left=esq, label=host.replace("www.", ""),
                color=estilo.CICLO[i % len(estilo.CICLO)], height=0.62)
        esq += m[host].values
    ax.set_xlabel("Requisições por consulta, com cache frio")
    ax.set_title("Para Onde Vão as Requisições de Cada Consulta")
    estilo.legenda_abaixo(ax, 3, y=-0.16 - 0.03 * len(m))
    return estilo.salvar(fig, Path(saida) / "fig05_requisicoes_host.png"), \
        "fig05_requisicoes_host.png"


# ------------------------------------------------------------------- cache ----
def fig_cache_memoria(base, saida):
    """Quanto o cache economiza contra quanto ele ocupa."""
    d = _le(base, "cache_por_rota.csv")
    if d is None:
        return None
    g = d.groupby("familia").agg(ganho=("ganho", "median"),
                                 kb=("bytes_no_redis", "median")).dropna()
    g["kb"] /= 1024
    fig, ax = plt.subplots(figsize=(7.0, 4.2))
    ax.scatter(g.kb, g.ganho, s=90, color=estilo.PRINCIPAL, zorder=3)
    for nome, r in g.iterrows():
        ax.annotate(nome, (r.kb, r.ganho), textcoords="offset points",
                    xytext=(7, 4), fontsize=8.5)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Memória ocupada no Redis por consulta, em KB (escala logarítmica)")
    ax.set_ylabel("Vezes mais rápido (escala logarítmica)")
    ax.set_title("O Que o Cache Economiza Contra o Que Ele Ocupa")
    ax.set_xlim(g.kb.min() * 0.4, g.kb.max() * 3.5)
    ax.set_ylim(g.ganho.min() * 0.4, g.ganho.max() * 3.5)
    return estilo.salvar(fig, Path(saida) / "fig06_cache_memoria.png"), \
        "fig06_cache_memoria.png"


def fig_cache_sessao(base, saida):
    """Tempo acumulado de uma sessao de consultas, com e sem cache."""
    d = _le(base, "cache_sessao.csv")
    if d is None:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    for modo, cor in (("sem cache", estilo.ATENCAO), ("com cache", estilo.PRINCIPAL)):
        s = d[(d.modo == modo) & (d.status == 200)].sort_values("ordem")
        if s.empty:
            continue
        ax.plot(s.ordem, s.ms.cumsum() / 1000, color=cor, linewidth=2,
                label=f"{modo.capitalize()}: {s.ms.sum()/1000:.0f} s ao fim".replace(".", ","))
    ax.set_xlabel("Consultas na ordem em que foram feitas")
    ax.set_ylabel("Tempo acumulado, em segundos")
    ax.set_title("Sessão de Consultas com Repetição, com e sem Cache")
    estilo.legenda_abaixo(ax, 2, y=-0.20)
    return estilo.salvar(fig, Path(saida) / "fig07_cache_sessao.png"), "fig07_cache_sessao.png"


def fig_cache_recorte(base, saida):
    """A chave guarda o recorte: `com` nao serve `sem`."""
    d = _le(base, "cache_recorte.csv")
    if d is None:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    x = np.arange(len(d))
    l = 0.26
    b1 = ax.bar(x - l, d.ms_com_frio, l, label="Com variantes, cache frio", color=estilo.ATENCAO)
    b2 = ax.bar(x, d.ms_sem_apos_com, l, label="Sem variantes, logo após o `com`",
                color=estilo.SECUNDARIA)
    b3 = ax.bar(x + l, d.ms_sem_quente, l, label="Sem variantes, cache quente",
                color=estilo.PRINCIPAL)
    ax.set_yscale("log")
    ax.set_xticks(x)
    ax.set_xticklabels(d.gene)
    ax.set_ylabel("Milissegundos (escala logarítmica)")
    ax.set_title("O Recorte Com ou Sem Variantes Faz Parte da Chave")
    ax.set_ylim(1, max(d.ms_com_frio) * 8)
    estilo.legenda_abaixo(ax, 3, y=-0.24)
    return estilo.salvar(fig, Path(saida) / "fig08_cache_recorte.png"), "fig08_cache_recorte.png"


# ----------------------------------------------------------------- carga ----
def fig_concorrencia(base, saida):
    """Motor contra produto: capacidade e onde o limitador corta."""
    d = _le(base, "exaustao.csv")
    if d is None:
        return None
    d = d[d.fase == "concorrente"].copy()
    # A coluna `nivel` guarda inteiro na fase concorrente e texto na sequencial
    # ("0,5 req/s"), entao ela chega do CSV como objeto e `sorted` ordena como
    # texto: 1, 10, 160, 20, 40, 5, 80. O eixo saia fora de ordem e os rotulos
    # empilhados no canto.
    d["nivel"] = pd.to_numeric(d.nivel, errors="coerce")
    d = d[d.nivel.notna()]
    d["nivel"] = d.nivel.astype(int)
    niveis = sorted(d.nivel.unique())
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 4.0))

    for modo, cor in (("motor", estilo.PRINCIPAL), ("produto", estilo.ATENCAO)):
        med = [d[(d.modo == modo) & (d.nivel == n) & (d.status == 200)].ms.median()
               for n in niveis]
        a1.plot(niveis, med, "o-", color=cor, linewidth=2, markersize=5,
                label="Motor, sem limitador" if modo == "motor" else "Produto, com limitador")
    a1.set_xscale("log", base=2)
    a1.set_yscale("log")
    a1.set_xticks(niveis)
    a1.set_xticklabels(niveis)
    a1.set_xlabel("Requisições simultâneas")
    a1.set_ylabel("Latência mediana, em ms (escala logarítmica)")
    a1.set_title("Latência sob Concorrência")
    estilo.legenda_abaixo(a1, 1, y=-0.26)

    p = d[d.modo == "produto"]
    frac = [100 * len(p[(p.nivel == n) & (p.status == 429)]) / max(1, len(p[p.nivel == n]))
            for n in niveis]
    barras = a2.bar([str(n) for n in niveis], frac, color=estilo.RUIM, width=0.62)
    a2.set_xlabel("Requisições simultâneas")
    a2.set_ylabel("Requisições recusadas com 429, em %")
    a2.set_title("Onde o Limitador de Taxa Corta")
    a2.set_ylim(0, 105)
    estilo.rotular_barras(a2, barras, "{:.0f}%")
    return estilo.salvar(fig, Path(saida) / "fig09_concorrencia.png"), "fig09_concorrencia.png"


# ----------------------------------------------------------------- erros ----
def fig_erros(base, saida):
    """Entrada invalida por familia: aprovado, reprovado, e quantos 500."""
    d = _le(base, "erros.csv")
    if d is None:
        return None
    g = d.groupby("familia").agg(casos=("caso", "count"),
                                 aprovados=("aprovado", "sum"))
    g["reprovados"] = g.casos - g.aprovados
    g = g.sort_values("casos", ascending=False)
    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    x = np.arange(len(g))
    b1 = ax.bar(x, g.aprovados, 0.6, label="Tratado corretamente", color=estilo.BOM)
    ax.bar(x, g.reprovados, 0.6, bottom=g.aprovados, label="Fora do esperado",
           color=estilo.RUIM)
    ax.set_xticks(x)
    ax.set_xticklabels(g.index, rotation=15, ha="right")
    ax.set_ylabel("Casos de entrada inválida")
    ax.set_title("Tratamento de Entrada Inválida por Família de Rota")
    ax.set_ylim(0, g.casos.max() * 1.25)
    for xi, (a, c) in enumerate(zip(g.aprovados, g.casos)):
        ax.text(xi, c + g.casos.max() * 0.03, f"{a}/{c}", ha="center", fontsize=8)
    estilo.legenda_abaixo(ax, 2, y=-0.26)
    return estilo.salvar(fig, Path(saida) / "fig10_erros.png"), "fig10_erros.png"


# ------------------------------------------------------------- completude ----
def fig_completude(base, saida):
    """Fracao de campos preenchidos por familia."""
    d = _le(base, "completude.csv")
    if d is None:
        return None
    fam = [f for f in ORDEM_FAMILIA if f in set(d.familia)]
    dados = [d[d.familia == f].completude_pct.values for f in fam]
    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    bp = ax.boxplot(dados, patch_artist=True, widths=0.55, medianprops=dict(color="white"))
    for c, cx in zip(bp["boxes"], estilo.CICLO):
        c.set_facecolor(cx)
    ax.set_xticklabels([ROTULO_FAMILIA.get(f, f) for f in fam], rotation=15, ha="right")
    ax.set_ylabel("Campos preenchidos na resposta, em %")
    ax.set_title("Completude da Resposta por Família de Rota")
    ax.set_ylim(0, 105)
    for i, v in enumerate(dados):
        ax.text(i + 1, 102, f"n={len(v)}", ha="center", fontsize=7.5, color=estilo.NEUTRA)
    return estilo.salvar(fig, Path(saida) / "fig11_completude.png"), "fig11_completude.png"


def fig_campos_vazios(base, saida):
    """Campos que vem vazios em TODOS os alvos: limitacao, nao propriedade do alvo."""
    d = _le(base, "completude_campos.csv")
    if d is None:
        return None
    d = d[d.sempre_vazio].copy()
    if d.empty:
        return None
    d["rotulo"] = d.familia + " · " + d.campo
    d = d.sort_values(["familia", "campo"]).tail(24)
    fig, ax = plt.subplots(figsize=(7.4, max(3.0, 0.26 * len(d))))
    ax.barh(d.rotulo, d.alvos, color=estilo.NEUTRA, height=0.62)
    ax.set_xlabel("Alvos em que o campo veio vazio, de todos os testados")
    ax.set_title("Campos Sempre Vazios: Limitação da Integração, Não do Alvo")
    return estilo.salvar(fig, Path(saida) / "fig12_campos_vazios.png"), "fig12_campos_vazios.png"


# ------------------------------------------------------------ comparacao ----
def fig_comparacao(base, saida):
    """Fluxo manual contra consulta integrada, por familia."""
    d = _le(base, "comparacao.csv")
    if d is None:
        return None
    d = d[d.status == 200]
    fam = [f for f in ORDEM_FAMILIA if f in set(d.familia)]
    manual = [d[d.familia == f].manual_ms.median() / 1000 for f in fam]
    frio = [d[d.familia == f].genvar_frio_ms.median() / 1000 for f in fam]
    quente = [d[d.familia == f].genvar_quente_ms.median() / 1000 for f in fam]
    fig, ax = plt.subplots(figsize=(7.6, 4.2))
    x = np.arange(len(fam))
    l = 0.26
    ax.bar(x - l, manual, l, label="Fluxo manual, fontes em série", color=estilo.NEUTRA)
    ax.bar(x, frio, l, label="GenVar, cache frio", color=estilo.ATENCAO)
    ax.bar(x + l, quente, l, label="GenVar, cache quente", color=estilo.PRINCIPAL)
    ax.set_yscale("log")
    ax.set_xticks(x)
    ax.set_xticklabels([ROTULO_FAMILIA.get(f, f) for f in fam], rotation=15, ha="right")
    ax.set_ylabel("Segundos até a resposta (escala logarítmica)")
    ax.set_title("Fluxo Manual Contra Consulta Integrada")
    estilo.legenda_abaixo(ax, 3, y=-0.26)
    return estilo.salvar(fig, Path(saida) / "fig13_comparacao.png"), "fig13_comparacao.png"


# --------------------------------------------------- pipeline no navegador ----
def fig_custo_por_escala(base, saida):
    """Custo de cada etapa em funcao do tamanho do arquivo."""
    d = _le(base, "funcoes.csv")
    if d is None:
        return None
    d = d[d.erro.isna() & d.variantes.notna() & d.mediana_ms.notna()]
    etapas = ["leitura", "qualidade", "anotacao", "genes", "saida"]
    rotulo = {"leitura": "Leitura do arquivo", "qualidade": "Métricas de qualidade",
              "anotacao": "Anotação clínica", "genes": "Mapeamento de genes",
              "saida": "Geração das saídas"}
    fig, ax = plt.subplots(figsize=(7.4, 4.4))
    for i, e in enumerate(etapas):
        s_ = d[d.etapa == e].groupby("variantes").mediana_ms.sum().sort_index()
        if s_.empty:
            continue
        ax.plot(s_.index, s_.values, "o-", color=estilo.CICLO[i], linewidth=1.8,
                markersize=4, label=rotulo.get(e, e))
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Variantes no arquivo (escala logarítmica)")
    ax.set_ylabel("Milissegundos por etapa (escala logarítmica)")
    ax.set_title("Custo de Cada Etapa em Função da Escala do Arquivo")
    estilo.legenda_abaixo(ax, 3, y=-0.24)
    return estilo.salvar(fig, Path(saida) / "fig14_custo_por_escala.png"), \
        "fig14_custo_por_escala.png"


def fig_saidas(base, saida):
    """Custo de gerar cada formato, e o tamanho do que sai."""
    d = _le(base, "funcoes.csv")
    if d is None:
        return None
    d = d[(d.etapa == "saida") & d.erro.isna() & d.mediana_ms.notna()]
    d = d[d.funcao.isin(["TSV", "CSV", "JSON", "VCF anotado", "XLSX", "PDF"])]
    if d.empty:
        return None
    ordem = ["CSV", "TSV", "VCF anotado", "JSON", "XLSX", "PDF"]
    ordem = [o for o in ordem if o in set(d.funcao)]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 4.0))
    med = [d[d.funcao == f].mediana_ms.median() for f in ordem]
    cores = [estilo.RUIM if f == "PDF" else estilo.SECUNDARIA if f == "XLSX"
             else estilo.PRINCIPAL for f in ordem]
    b = a1.bar(ordem, med, color=cores, width=0.62)
    a1.set_yscale("log")
    a1.set_ylabel("Milissegundos, mediana do corpus (escala logarítmica)")
    a1.set_title("Custo de Gerar Cada Formato")
    a1.axhline(1000, color=estilo.RUIM, linestyle="--", linewidth=0.9)
    a1.text(len(ordem) - 0.4, 1100, "1 s", fontsize=8, color=estilo.RUIM, ha="right")
    a1.set_ylim(min(med) * 0.4, max(med) * 5)
    for bi, v in zip(b, med):
        a1.text(bi.get_x() + bi.get_width() / 2, v * 1.18, estilo.milhar(v),
                ha="center", fontsize=7.5)
    a1.tick_params(axis="x", rotation=20)

    tam = [d[d.funcao == f].bytes.median() / 1024 for f in ordem]
    b2 = a2.bar(ordem, tam, color=cores, width=0.62)
    a2.set_yscale("log")
    a2.set_ylabel("Tamanho do arquivo, em KB (escala logarítmica)")
    a2.set_title("Tamanho do Que Sai")
    a2.set_ylim(min(t for t in tam if t > 0) * 0.4, max(tam) * 5)
    for bi, v in zip(b2, tam):
        a2.text(bi.get_x() + bi.get_width() / 2, v * 1.18, estilo.milhar(v),
                ha="center", fontsize=7.5)
    a2.tick_params(axis="x", rotation=20)
    return estilo.salvar(fig, Path(saida) / "fig15_saidas.png"), "fig15_saidas.png"


def fig_funcoes_piso(base, saida):
    """Piso de tempo de cada funcao no menor arquivo: o que custa so por existir."""
    d = _le(base, "funcoes.csv")
    if d is None:
        return None
    d = d[d.erro.isna() & d.mediana_ms.notna() & (d.arquivo == "01-pequeno.vcf")]
    if d.empty:
        return None
    g = d.groupby("funcao").mediana_ms.median().sort_values()
    fig, ax = plt.subplots(figsize=(7.4, max(3.4, 0.24 * len(g))))
    ax.barh(g.index, g.values, color=estilo.PRINCIPAL, height=0.66)
    ax.set_xscale("log")
    ax.set_xlabel("Milissegundos no menor arquivo do corpus (escala logarítmica)")
    ax.set_title("Piso de Tempo de Cada Função do Pipeline")
    return estilo.salvar(fig, Path(saida) / "fig16_funcoes_piso.png"), "fig16_funcoes_piso.png"


def fig_lote(base, saida):
    """Lote contra individual, em varias escalas de coorte."""
    d = _le(base, "lote_vs_individual.csv")
    if d is None:
        return None
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 4.0))
    for i, cen in enumerate(sorted(d.cenario.unique())):
        s_ = d[d.cenario == cen].sort_values("arquivos")
        a1.plot(s_.arquivos, s_.individual_ms / 1000, "o--", color=estilo.CICLO[i],
                linewidth=1.6, markersize=4, label=f"{cen}, individual")
        a1.plot(s_.arquivos, s_.lote_ms / 1000, "o-", color=estilo.CICLO[i],
                linewidth=2.2, markersize=5, label=f"{cen}, em lote")
        # Sem rotulo no segundo painel: as series sao as mesmas, e duas legendas
        # identicas gastam a metade inferior da figura repetindo informacao.
        a2.plot(s_.arquivos, s_.individual_retido_mb, "o--", color=estilo.CICLO[i],
                linewidth=1.6, markersize=4)
        a2.plot(s_.arquivos, s_.lote_retido_mb, "o-", color=estilo.CICLO[i],
                linewidth=2.2, markersize=5)
    for a, rot, tit in ((a1, "Segundos até o fim da coorte", "Tempo Total da Coorte"),
                        (a2, "Memória retida ao fim, em MB", "Memória Retida ao Fim")):
        a.set_xscale("log")
        a.set_yscale("log")
        a.set_xlabel("Arquivos na coorte (escala logarítmica)")
        a.set_ylabel(rot)
        a.set_title(tit)
    alcas, rotulos = a1.get_legend_handles_labels()
    fig.legend(alcas, rotulos, loc="lower center", ncol=4, frameon=False,
               bbox_to_anchor=(0.5, -0.06))
    return estilo.salvar(fig, Path(saida) / "fig17_lote.png"), "fig17_lote.png"


def fig_reprodutibilidade(base, saida):
    """A mesma entrada devolve a mesma saida, e a saida carrega a procedencia."""
    d = _le(base, "reprodutibilidade.csv")
    if d is None:
        return None
    criterios = [
        ("tsv_identico", "TSV idêntico entre réplicas"),
        ("csv_identico", "CSV idêntico entre réplicas"),
        ("vcf_identico", "VCF anotado idêntico entre réplicas"),
        ("metricas_independem_da_ordem", "Métricas independem da ordem de leitura"),
        ("vcf_carrega_sha_da_entrada", "Saída carrega o sha256 da entrada"),
        ("vcf_carrega_versao_clinvar", "Saída carrega a versão do ClinVar"),
    ]
    criterios = [(c, r) for c, r in criterios if c in d.columns]
    if not criterios:
        return None
    frac = [100 * d[c].mean() for c, _ in criterios]
    fig, ax = plt.subplots(figsize=(7.6, 3.6))
    cores = [estilo.BOM if f == 100 else estilo.RUIM for f in frac]
    barras = ax.barh([r for _, r in criterios], frac, color=cores, height=0.62)
    ax.set_xlim(0, 108)
    ax.set_xlabel(f"Arquivos do corpus que satisfazem o critério, em % (n = {len(d)})")
    ax.set_title("Reprodutibilidade e Procedência da Saída")
    estilo.rotular_barras_h(ax, barras, "{:.0f}%")
    return estilo.salvar(fig, Path(saida) / "fig18_reprodutibilidade.png"), \
        "fig18_reprodutibilidade.png"


def fig_acmg(base, saida):
    """Custo da pontuacao ACMG contra o numero de variantes com criterio."""
    d = _le(base, "funcoes.csv")
    if d is None or "variantes_com_criterio" not in d.columns:
        return None
    d = d[(d.funcao == "pontuação ACMG") & d.erro.isna()
          & d.variantes_com_criterio.notna() & (d.variantes_com_criterio > 0)]
    if len(d) < 3:
        return None
    fig, ax = plt.subplots(figsize=(7.0, 4.0))
    ax.scatter(d.variantes_com_criterio, d.mediana_ms, s=70,
               color=estilo.PRINCIPAL, zorder=3)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Variantes com ao menos um critério ACMG (escala logarítmica)")
    ax.set_ylabel("Milissegundos para pontuar todas (escala logarítmica)")
    ax.set_title("Custo da Pontuação ACMG em Função do Que Há Para Pontuar")
    return estilo.salvar(fig, Path(saida) / "fig19_acmg.png"), "fig19_acmg.png"


def fig_catalogo(base, saida):
    """Custo de carregar cada catalogo embarcado, uma vez por sessao."""
    d = _le(base, "funcoes.csv")
    if d is None:
        return None
    d = d[(d.etapa == "catalogo") & d.erro.isna() & d.mediana_ms.notna()]
    if d.empty:
        return None
    g = d.groupby("funcao").mediana_ms.median().sort_values()
    fig, ax = plt.subplots(figsize=(7.2, max(2.8, 0.42 * len(g))))
    barras = ax.barh(g.index, g.values, color=estilo.SECUNDARIA, height=0.62)
    ax.set_xscale("log")
    ax.set_xlabel("Milissegundos, uma vez por sessão (escala logarítmica)")
    ax.set_title("Custo de Preparar os Catálogos Embarcados")
    ax.set_xlim(g.values.min() * 0.5, g.values.max() * 3)
    estilo.rotular_barras_h(ax, barras, "{:.0f}", folga=0.0)
    return estilo.salvar(fig, Path(saida) / "fig20_catalogo.png"), "fig20_catalogo.png"




# ------------------------------------------------------- local x conteiner ----
def _le_par(nome):
    a = _le(AQUI / "resultados" / "local", nome)
    b = _le(AQUI / "resultados" / "docker", nome)
    return (a, b) if a is not None and b is not None else (None, None)


def fig_ambiente_latencia(base, saida):
    """A mesma medicao, direto na maquina e em conteiner."""
    a, b = _le_par("latencia.csv")
    if a is None:
        return None
    fam = [f for f in ORDEM_FAMILIA if f in set(a.familia) and f in set(b.familia)]
    if not fam:
        return None
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 4.0))
    x = np.arange(len(fam))
    l = 0.38
    for eixo, coluna, titulo in ((a1, "frio_mediana", "Com Cache Frio"),
                                 (a2, "quente_mediana", "Com Cache Quente")):
        va = [a[a.familia == f][coluna].median() for f in fam]
        vb = [b[b.familia == f][coluna].median() for f in fam]
        b1 = eixo.bar(x - l / 2, va, l, label="Direto na máquina", color=estilo.PRINCIPAL)
        b2 = eixo.bar(x + l / 2, vb, l, label="Em contêiner", color=estilo.SECUNDARIA)
        eixo.set_yscale("log")
        eixo.set_xticks(x)
        eixo.set_xticklabels([ROTULO_FAMILIA[f] for f in fam], rotation=25, ha="right")
        eixo.set_ylabel("Latência mediana, em ms (escala logarítmica)")
        eixo.set_title(titulo)
        eixo.set_ylim(min(min(va), min(vb)) * 0.5, max(max(va), max(vb)) * 9)
        # Rotulos escalonados em duas alturas: onde as duas barras sao quase
        # iguais, dois rotulos na mesma altura se sobrepoem e viram um numero
        # unico ilegivel ("3.303.384" por 3.303 e 3.384).
        for bi, v in zip(b1, va):
            eixo.text(bi.get_x() + bi.get_width() / 2, v * 1.9, estilo.milhar(v),
                      ha="center", fontsize=7, color=estilo.PRINCIPAL)
        for bi, v in zip(b2, vb):
            eixo.text(bi.get_x() + bi.get_width() / 2, v * 1.15, estilo.milhar(v),
                      ha="center", fontsize=7, color="#2A7A93")
    alcas, rotulos = a1.get_legend_handles_labels()
    fig.legend(alcas, rotulos, loc="lower center", ncol=2, frameon=False,
               bbox_to_anchor=(0.5, -0.08))
    return estilo.salvar(fig, Path(saida) / "fig21_ambiente.png"), "fig21_ambiente.png"


def fig_ambiente_carga(base, saida):
    """Capacidade sob concorrencia nos dois ambientes."""
    a, b = _le_par("exaustao.csv")
    if a is None:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    for d_, nome, cor in ((a, "Direto na máquina", estilo.PRINCIPAL),
                          (b, "Em contêiner", estilo.SECUNDARIA)):
        d_ = d_[(d_.fase == "concorrente") & (d_.modo == "motor")].copy()
        d_["nivel"] = pd.to_numeric(d_.nivel, errors="coerce")
        d_ = d_[d_.nivel.notna() & (d_.status == 200)]
        if d_.empty:
            continue
        g = d_.groupby("nivel").ms.median().sort_index()
        ax.plot(g.index, g.values, "o-", color=cor, linewidth=2, markersize=5, label=nome)
    ax.set_xscale("log", base=2)
    ax.set_yscale("log")
    ax.minorticks_off()
    ax.set_xlabel("Requisições simultâneas")
    ax.set_ylabel("Latência mediana, em ms (escala logarítmica)")
    ax.set_title("Capacidade sob Concorrência nos Dois Ambientes")
    estilo.legenda_abaixo(ax, 2, y=-0.20)
    return estilo.salvar(fig, Path(saida) / "fig22_ambiente_carga.png"), \
        "fig22_ambiente_carga.png"


# ---------------------------------------------------------- 2.0 contra 3.0 ----
LEGADO = AQUI.parent / "benchmark-legacy" / "2.0" / "results" / "local"


def _frio_da_2_0():
    """A fria de verdade da 2.0, reconstruida da PRIMEIRA repeticao de cada alvo.

    A suite da 2.0 limpava o Redis UMA vez antes das doze repeticoes frias, entao
    da segunda em diante ela media cache quente. A mediana publicada como fria,
    15,3 ms para gene, e um numero quente. Aqui so a repeticao 1 de cada alvo
    entra, que e a unica que encontrou o cache vazio.
    """
    caminho = LEGADO / "latency_raw.csv"
    if not caminho.exists():
        return None
    d = pd.read_csv(caminho)
    d = d[(d.phase == "cold") & (d.status == 200) & (d.run == 1)]
    return d.groupby("endpoint").elapsed_ms.median()


def _quente_da_2_0():
    caminho = LEGADO / "latency_raw.csv"
    if not caminho.exists():
        return None
    d = pd.read_csv(caminho)
    d = d[(d.phase == "warm") & (d.status == 200)]
    return d.groupby("endpoint").elapsed_ms.median()


def fig_versoes(base, saida):
    """As duas metricas cujo protocolo e identico nas duas versoes."""
    frio20, quente20 = _frio_da_2_0(), _quente_da_2_0()
    d30 = _le(base, "latencia.csv")
    if frio20 is None or d30 is None:
        return None
    # Comparar pela FAMILIA seria comparar coisas diferentes: em 3.0 a familia
    # gene reune quatro formatos de rota (`/gene/X`, `?variantes=false`,
    # `/variants` e `/phenotypes`) e em 2.0 ela era so `/api/gene/X`. A
    # comparacao usa o NOME da rota, que e o mesmo objeto nas duas versoes.
    mapa = {"gene": "gene", "variant": "variante"}
    fam = [f for f in mapa if f in frio20.index and mapa[f] in set(d30.nome)]
    if not fam:
        return None
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.2, 4.0))
    x = np.arange(len(fam))
    l = 0.38
    for eixo, v20, coluna, titulo in (
            (a1, frio20, "frio_mediana", "Com Cache Frio"),
            (a2, quente20, "quente_mediana", "Com Cache Quente")):
        va = [v20[f] for f in fam]
        vb = [d30[d30.nome == mapa[f]][coluna].median() for f in fam]
        b1 = eixo.bar(x - l / 2, va, l, label="Versão 2.0, junho de 2026",
                      color=estilo.NEUTRA)
        b2 = eixo.bar(x + l / 2, vb, l, label="Versão 3.0, agosto de 2026",
                      color=estilo.PRINCIPAL)
        eixo.set_yscale("log")
        eixo.set_xticks(x)
        eixo.set_xticklabels([ROTULO_FAMILIA[mapa[f]] for f in fam])
        eixo.set_ylabel("Latência mediana, em ms (escala logarítmica)")
        eixo.set_title(titulo)
        eixo.set_ylim(min(min(va), min(vb)) * 0.4, max(max(va), max(vb)) * 6)
        for bi, v in list(zip(b1, va)) + list(zip(b2, vb)):
            eixo.text(bi.get_x() + bi.get_width() / 2, v * 1.2, estilo.milhar(v),
                      ha="center", fontsize=8)
    alcas, rotulos = a1.get_legend_handles_labels()
    fig.legend(alcas, rotulos, loc="lower center", ncol=2, frameon=False,
               bbox_to_anchor=(0.5, -0.06))
    return estilo.salvar(fig, Path(saida) / "fig23_versoes.png"), "fig23_versoes.png"


def fig_versoes_superficie(base, saida):
    """O que cresceu de uma versao para a outra."""
    d30 = _le(base, "latencia.csv")
    r30 = _le(base, "requisicoes.csv")
    if d30 is None:
        return None
    itens = [
        ("Rotas de API medidas", 2, int(d30.nome.nunique())),
        ("Famílias de rota", 2, int(d30.familia.nunique())),
        ("Fontes consultadas ao vivo", 6, 8),
        ("Catálogos embarcados", 0, 4),
        ("Formatos de saída do VCF", 0, 6),
    ]
    if r30 is not None:
        itens.append(("Rotas com contagem de requisições", 0,
                      int(r30.familia.nunique())))
    fig, ax = plt.subplots(figsize=(7.4, 3.8))
    y = np.arange(len(itens))
    l = 0.38
    b1 = ax.barh(y + l / 2, [i[1] for i in itens], l, label="Versão 2.0",
                 color=estilo.NEUTRA)
    b2 = ax.barh(y - l / 2, [i[2] for i in itens], l, label="Versão 3.0",
                 color=estilo.PRINCIPAL)
    ax.set_yticks(y)
    ax.set_yticklabels([i[0] for i in itens])
    ax.set_xlabel("Contagem")
    ax.set_title("Superfície Medida em Cada Versão")
    estilo.rotular_barras_h(ax, list(b1) + list(b2), "{:.0f}")
    estilo.legenda_abaixo(ax, 2, y=-0.22)
    return estilo.salvar(fig, Path(saida) / "fig24_versoes_superficie.png"), \
        "fig24_versoes_superficie.png"


def fig_teto_memoria(base, saida):
    """Onde a leitura para de caber: vazao contra heap."""
    d = _le(base, "teto_memoria.csv")
    if d is None or len(d) < 3:
        return None
    fig, ax = plt.subplots(figsize=(7.4, 4.2))
    ax.plot(d.heap_mb / 1024, d.variantes_por_segundo, "o-", color=estilo.PRINCIPAL,
            linewidth=2, markersize=6)
    for _, r in d.iterrows():
        ax.annotate(estilo.milhar(r.variantes), (r.heap_mb / 1024, r.variantes_por_segundo),
                    textcoords="offset points", xytext=(6, 6), fontsize=7.5,
                    color=estilo.NEUTRA)
    # A memoria fisica da maquina e onde a curva vira: acima dela o sistema pagina.
    ax.axvline(8, color=estilo.RUIM, linestyle="--", linewidth=1.1)
    ax.text(8.1, d.variantes_por_segundo.max() * 0.75,
            "memória física\nda máquina", fontsize=8, color=estilo.RUIM)
    ax.set_yscale("log")
    ax.set_xlabel("Heap em uso, em GB")
    ax.set_ylabel("Variantes lidas por segundo (escala logarítmica)")
    ax.set_title("Onde a Leitura Deixa de Caber na Memória")
    return estilo.salvar(fig, Path(saida) / "fig25_teto_memoria.png"), \
        "fig25_teto_memoria.png"


def fig_cache_ttl(base, saida):
    """Toda chave escrita recebeu prazo de expiracao?"""
    d = _le(base, "cache_ttl.csv")
    if d is None or d.empty:
        return None
    g = d.groupby("prefixo").agg(chaves=("chave", "count"),
                                 com_prazo=("tem_prazo", "sum"),
                                 ttl=("ttl_s", "median")).sort_values("ttl")
    fig, ax = plt.subplots(figsize=(7.2, max(2.8, 0.42 * len(g))))
    cores = [estilo.BOM if c == n else estilo.RUIM
             for c, n in zip(g.com_prazo, g.chaves)]
    barras = ax.barh(g.index, g.ttl, color=cores, height=0.62)
    ax.axvline(3600, color=estilo.NEUTRA, linestyle="--", linewidth=1.1)
    ax.text(3610, len(g) - 0.6, "TTL declarado:\numa hora", fontsize=8,
            color=estilo.NEUTRA)
    ax.set_xlabel("Prazo restante da chave no momento da leitura, em segundos")
    ax.set_title("Prazo de Expiração por Tipo de Chave")
    ax.set_xlim(0, 4200)
    estilo.rotular_barras_h(ax, barras, "{:.0f} s", folga=0.01)
    return estilo.salvar(fig, Path(saida) / "fig26_cache_ttl.png"), "fig26_cache_ttl.png"


FIGURAS = [fig_latencia_familia, fig_ganho_cache, fig_dispersao_latencia,
           fig_requisicoes, fig_requisicoes_host, fig_cache_memoria,
           fig_cache_sessao, fig_cache_recorte, fig_concorrencia,
           fig_erros, fig_completude, fig_campos_vazios, fig_comparacao,
           fig_custo_por_escala, fig_saidas, fig_funcoes_piso, fig_lote,
           fig_reprodutibilidade, fig_acmg, fig_catalogo,
           fig_ambiente_latencia, fig_ambiente_carga,
           fig_versoes, fig_versoes_superficie, fig_teto_memoria,
           fig_cache_ttl]


def main():
    ap = argparse.ArgumentParser(description="Figuras do benchmark")
    ap.add_argument("--resultados", default=str(AQUI / "resultados" / "local"))
    ap.add_argument("--saida", default=str(AQUI / "figuras"))
    args = ap.parse_args()
    print(f"Gerando figuras de {args.resultados}")
    for f in FIGURAS:
        r = f(args.resultados, args.saida)
        if r is None:
            print(f"  [pulada] {f.__name__}: sem dados")
        else:
            kb, nome = r
            print(f"  {nome:<40} {kb:6.0f} KB")


if __name__ == "__main__":
    main()
