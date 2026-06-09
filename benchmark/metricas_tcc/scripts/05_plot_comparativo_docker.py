"""
Gera as figuras comparativas local vs Docker do GenVar, no padrao Nature/NPG.

Cada figura confronta o mesmo experimento medido em dois ambientes: os servicos rodando
localmente (uvicorn, Vite, Redis nativo) e conteinerizados (Docker Compose). O objetivo e
quantificar o custo da containerizacao (objetivo v).

Decisoes de honestidade embutidas:
  - O desempenho do backend de gene usa a suite de LATENCIA (limpa nos dois ambientes), e
    nao a simulacao manual da suite de comparacao, que martela o Ensembl no host e sofre
    rate-limit em genes grandes (logo, nao e efeito do Docker).
  - As barras do fluxo manual (breakdown) sao medidas no HOST; sao mostradas uma vez (local)
    e rotuladas como tal, com os pontos GenVar dos dois ambientes sobre a mesma base.
  - Genes em que a VM do Docker estourou o tempo ou ficou desproporcional (TP53 e CFTR sem
    resposta na completude; CFTR/MSH2 na agregacao pesada) recebem um asterisco e nota.

Codificacao fixa em todas as figuras: Local = azul-marinho, Docker = salmao.

Entrada: ../dados (local) e ../dados_docker (Docker).
Saida: ../figuras/fig_cmp_*.png
Uso: python 05_plot_comparativo_docker.py
"""
import csv
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

# Paleta NPG.
NAVY = "#3C5488"; SALMON = "#F39B7F"; BLUE = "#4DBBD5"; GREEN = "#00A087"
RED = "#E64B35"; SLATE = "#8491B4"; GRAY = "#8491B4"; INK = "#333333"
LOCAL = NAVY      # ambiente local
DOCKER = SALMON   # ambiente conteinerizado

BASE = os.path.dirname(__file__)
DL = os.path.join(BASE, "..", "dados")          # local
DD = os.path.join(BASE, "..", "dados_docker")   # docker
FIG = os.path.join(BASE, "..", "figuras")

GENES = ["MLH1", "HBB", "MSH2", "VHL", "LDLR", "RB1", "BRCA1", "TP53", "CFTR", "PAH"]
VARS = ["rs334", "rs1800562", "rs6025", "rs1799853", "rs429358",
        "rs1801133", "rs1042522", "rs5030858", "rs28929474", "rs121913529"]

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11, "axes.titlesize": 13,
    "axes.titlepad": 14, "axes.titleweight": "normal", "axes.edgecolor": "#333333",
    "axes.linewidth": 0.8, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": False, "legend.fontsize": 9, "figure.dpi": 100,
})

_STOP = {"de", "da", "do", "das", "dos", "e", "ou", "o", "a", "os", "as", "no", "na",
         "nos", "nas", "em", "por", "para", "com", "sem", "vs", "ate"}
_UNITS = {"ms", "s", "kb"}


def tc(s):
    out, first = [], False
    for w in s.split(" "):
        core = w.strip("()[],.;:").lower()
        if core in _UNITS:
            out.append(w)
        elif not first and any(c.isalpha() for c in w):
            out.append(w[:1].upper() + w[1:]); first = True
        elif core in _STOP:
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:] if w[:1].isalpha() else w)
    return " ".join(out)


def _rows(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def load_latency(d):
    # Retorna {(endpoint,target): {"cold": max_frio_ms, "warm": media_quente_ms}}.
    out = {}
    for r in _rows(os.path.join(d, "latency_stats.csv")):
        key = (r["endpoint"], r["target"])
        out.setdefault(key, {})
        if r["phase"] == "cold":
            out[key]["cold"] = float(r["max"])
        elif r["phase"] == "warm":
            out[key]["warm"] = float(r["mean"])
    return out


def load_comp(d, gene=False):
    rows = _rows(os.path.join(d, "comparison_gene.csv" if gene else "comparison.csv"))
    key = "gene" if gene else "rsid"
    return {r[key]: r for r in rows}


def load_completeness(d):
    return {r["target"]: float(r["completeness_pct"])
            for r in _rows(os.path.join(d, "completeness.csv"))}


def _legend_below(ax, handles=None, labels=None, ncol=2):
    kw = dict(loc="upper center", bbox_to_anchor=(0.5, -0.18), ncol=ncol,
              frameon=False, borderaxespad=0)
    if handles is not None:
        ax.legend(handles, labels, **kw)
    else:
        ax.legend(**kw)


def _save(fig, name):
    path = os.path.join(FIG, name)
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"salvo {name}")


# ---------------------------------------------------------------------------
# Fig A: latencia (frio | quente) local vs Docker, em dois paineis. Gene e variante.
# ---------------------------------------------------------------------------
def fig_latencia(endpoint, targets, nome, fname):
    lat_l, lat_d = load_latency(DL), load_latency(DD)
    x = np.arange(len(targets)); w = 0.38
    # O eixo y de frio e quente nao pode ser o mesmo (diferem mil vezes; o quente
    # sumiria). Mas, para gene e variante serem comparaveis, fixamos o MESMO range em
    # cada fase nas duas figuras: o range global da fase, somando gene e variante e os
    # dois ambientes. Assim o painel frio de gene e o de variante usam a mesma escala.
    def faixa(fase):
        vs = [d[fase] for lat in (lat_l, lat_d) for d in lat.values() if d.get(fase)]
        return min(vs) * 0.7, max(vs) * 1.45
    fig, axes = plt.subplots(1, 2, figsize=(12, 5.4))
    for ax, fase, titulo in ((axes[0], "cold", "sem cache (1ª chamada)"),
                             (axes[1], "warm", "com cache")):
        vl = [lat_l.get((endpoint, t), {}).get(fase, np.nan) for t in targets]
        vd = [lat_d.get((endpoint, t), {}).get(fase, np.nan) for t in targets]
        ax.bar(x - w/2, vl, w, color=LOCAL, label="Local")
        ax.bar(x + w/2, vd, w, color=DOCKER, label="Docker")
        ax.set_yscale("log")
        ax.set_ylim(*faixa(fase))
        ax.set_xticks(x)
        ax.set_xticklabels(targets, rotation=20 if endpoint == "variant" else 0,
                           ha="right" if endpoint == "variant" else "center", fontsize=8)
        ax.set_title(tc(titulo), fontsize=11)
        ax.set_ylabel(tc("latência (ms, log)"))
    h = [Patch(facecolor=LOCAL, label="Local"), Patch(facecolor=DOCKER, label="Docker")]
    fig.suptitle(tc(f"latência da consulta de {nome}: local vs Docker"))
    fig.tight_layout(rect=[0, 0.11, 1, 0.95])
    fig.legend(handles=h, loc="lower center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 0.015))
    _save(fig, fname)


# ---------------------------------------------------------------------------
# Fig B: aceleracao por cache, local vs Docker, barras horizontais agrupadas.
# ---------------------------------------------------------------------------
def fig_cache():
    lat_l, lat_d = load_latency(DL), load_latency(DD)
    alvos = [("gene", g) for g in GENES] + [("variant", v) for v in VARS]
    def acc(lat, k):
        d = lat.get(k, {})
        return d["cold"] / d["warm"] if d.get("cold") and d.get("warm") else np.nan
    dados = [(f"{e}/{t}", acc(lat_l, (e, t)), acc(lat_d, (e, t))) for e, t in alvos]
    dados = [d for d in dados if not (np.isnan(d[1]) and np.isnan(d[2]))]
    dados.sort(key=lambda r: (np.nan_to_num(r[1]) + np.nan_to_num(r[2])) / 2)
    rot = [d[0] for d in dados]; vl = [d[1] for d in dados]; vd = [d[2] for d in dados]
    y = np.arange(len(rot)); h = 0.38
    fig, ax = plt.subplots(figsize=(9, max(5, len(rot) * 0.34)))
    ax.barh(y - h/2, vl, h, color=LOCAL, label="Local")
    ax.barh(y + h/2, vd, h, color=DOCKER, label="Docker")
    ax.set_yticks(y); ax.set_yticklabels(rot, fontsize=7.5)
    ax.set_xlabel(tc("aceleração por cache (vezes)"))
    ax.set_title(tc("aceleração por cache por consulta: local vs Docker"))
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.07), ncol=2, frameon=False)
    fig.tight_layout()
    _save(fig, "fig_cmp_cache.png")


# ---------------------------------------------------------------------------
# Fig C: concorrencia (latencia media x simultaneas), duas linhas.
# ---------------------------------------------------------------------------
def fig_concorrencia():
    def serie(d):
        m = {}
        for r in _rows(os.path.join(d, "exhaustion.csv")):
            if r["phase"] == "concurrent_warm":
                c = int(r["concurrency"]); m.setdefault(c, []).append(float(r["elapsed_ms"]))
        return sorted(m), [np.mean(m[c]) for c in sorted(m)]
    cl, yl = serie(DL); cd, yd = serie(DD)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(cl, yl, "o-", color=LOCAL, label="Local", linewidth=1.6, markersize=7)
    ax.plot(cd, yd, "s-", color=DOCKER, label="Docker", linewidth=1.6, markersize=7)
    ax.set_xticks(cl)
    ax.set_xlabel(tc("requisições simultâneas"))
    ax.set_ylabel(tc("latência média (ms)"))
    ax.set_ylim(0, max(max(yl), max(yd)) * 1.25)
    ax.set_title(tc("latência sob rajadas concorrentes (com cache): local vs Docker"))
    _legend_below(ax, ncol=2)
    fig.tight_layout()
    _save(fig, "fig_cmp_concorrencia.png")


# ---------------------------------------------------------------------------
# Fig D: latencia por taxa sequencial (frio), gene e variante, local vs Docker.
# ---------------------------------------------------------------------------
def fig_sequencial():
    def serie(d, endpoint):
        m = {}
        for r in _rows(os.path.join(d, "exhaustion.csv")):
            if r["phase"] == "sequential_cold" and r["endpoint"] == endpoint:
                m.setdefault(r["rate"], []).append(float(r["elapsed_ms"]))
        taxas = sorted(m, key=lambda s: float(s.split()[0]))
        return taxas, [np.mean(m[t]) / 1000 for t in taxas]
    # sharey: gene e variante medem a mesma grandeza (latencia em s), entao os dois
    # paineis compartilham o eixo y para a comparacao ser valida.
    fig, axes = plt.subplots(1, 2, figsize=(11, 5.0), sharey=True)
    for ax, endpoint, nome in ((axes[0], "gene", "gene"), (axes[1], "variant", "variante")):
        tl, yl = serie(DL, endpoint); td, yd = serie(DD, endpoint)
        x = np.arange(len(tl)); w = 0.38
        ax.bar(x - w/2, yl, w, color=LOCAL, label="Local")
        ax.bar(x + w/2, yd, w, color=DOCKER, label="Docker")
        ax.set_xticks(x); ax.set_xticklabels(tl, fontsize=9)
        ax.set_xlabel(tc("taxa de requisições"))
        ax.set_ylabel(tc("latência média (s)"))
        ax.set_title(tc(f"consulta de {nome}"), fontsize=11)
    h = [Patch(facecolor=LOCAL, label="Local"), Patch(facecolor=DOCKER, label="Docker")]
    fig.suptitle(tc("latência por taxa sequencial sem cache (subconjunto): local vs Docker"))
    fig.tight_layout(rect=[0, 0.10, 1, 0.95])
    fig.legend(handles=h, loc="lower center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 0.02))
    _save(fig, "fig_cmp_sequencial.png")


# ---------------------------------------------------------------------------
# Fig E: speedup de API por variante, local vs Docker.
# ---------------------------------------------------------------------------
def fig_speedup_variante():
    cl, cd = load_comp(DL), load_comp(DD)
    x = np.arange(len(VARS)); w = 0.38
    vl = [float(cl[v]["api_speedup"]) for v in VARS]
    vd = [float(cd[v]["api_speedup"]) for v in VARS]
    fig, ax = plt.subplots(figsize=(11, 4.8))
    ax.bar(x - w/2, vl, w, color=LOCAL, label="Local")
    ax.bar(x + w/2, vd, w, color=DOCKER, label="Docker")
    ax.axhline(1, color=GRAY, linewidth=0.8, linestyle="--")
    ax.set_xticks(x); ax.set_xticklabels(VARS, rotation=20, ha="right", fontsize=8)
    ax.set_ylabel(tc("aceleração de API (vezes)"))
    ax.set_title(tc("aceleração da paralelização por variante: local vs Docker"))
    _legend_below(ax, ncol=2)
    fig.tight_layout()
    _save(fig, "fig_cmp_speedup_variante.png")


# ---------------------------------------------------------------------------
# Fig F: breakdown da variante (manual no host) + pontos GenVar local e Docker.
# ---------------------------------------------------------------------------
def fig_breakdown_variante():
    cl, cd = load_comp(DL), load_comp(DD)
    cols = ["ensembl_vep_ms", "gnomad_ms", "clinvar_search_ms", "clinvar_fetch_ms", "myvariant_ms"]
    labs = ["Ensembl VEP", "gnomAD", "ClinVar (Busca)", "ClinVar (Recuperação)", "MyVariant.info"]
    cores = [NAVY, BLUE, "#F7C6A0", RED, SLATE]
    x = np.arange(len(VARS))
    fig, ax = plt.subplots(figsize=(12, 5))
    bottom = np.zeros(len(VARS))
    for c, lab, cor in zip(cols, labs, cores):
        vals = np.array([float(cl[v][c]) for v in VARS])
        ax.bar(x, vals, bottom=bottom, color=cor, label=lab, alpha=0.9, width=0.6)
        bottom += vals
    gl = [float(cl[v]["genvar_uncached_ms"]) for v in VARS]
    gd = [float(cd[v]["genvar_uncached_ms"]) for v in VARS]
    ax.plot(x, gl, "o", color="black", markersize=8, zorder=5, label="GenVar local")
    ax.plot(x, gd, "D", color=DOCKER, markeredgecolor="black", markersize=8, zorder=5, label="GenVar Docker")
    ax.set_xticks(x); ax.set_xticklabels(VARS, rotation=20, ha="right", fontsize=8)
    ax.set_ylabel(tc("tempo acumulado (ms)"))
    ax.set_title(tc("fluxo manual (host) e GenVar local vs Docker, por variante"))
    _legend_below(ax, ncol=4)
    fig.tight_layout()
    _save(fig, "fig_cmp_breakdown_variante.png")


# ---------------------------------------------------------------------------
# Fig G: breakdown do gene (manual no host, local) + GenVar local e Docker (latencia limpa).
# Genes pesados onde a VM do Docker estoura recebem asterisco.
# ---------------------------------------------------------------------------
ATIPICOS_DOCKER = {"CFTR", "MSH2"}  # VM do Docker afoga na agregacao de 119k-150k variantes


def fig_breakdown_gene():
    cg = load_comp(DL, gene=True)
    lat_d = load_latency(DD)
    cols = ["ensembl_lookup_ms", "ensembl_overlap_ms", "gnomad_ms", "uniprot_ms", "alphafold_ms"]
    labs = ["Ensembl (Lookup)", "Ensembl (Overlap)", "gnomAD", "UniProt", "AlphaFold"]
    cores = [NAVY, BLUE, "#F7C6A0", RED, SLATE]
    rot = [g + ("*" if g in ATIPICOS_DOCKER else "") for g in GENES]
    x = np.arange(len(GENES))
    fig, ax = plt.subplots(figsize=(12, 5))
    bottom = np.zeros(len(GENES))
    for c, lab, cor in zip(cols, labs, cores):
        vals = np.array([float(cg[g][c]) for g in GENES])
        ax.bar(x, vals, bottom=bottom, color=cor, label=lab, alpha=0.9, width=0.6)
        bottom += vals
    gl = [float(cg[g]["genvar_uncached_ms"]) for g in GENES]
    gd = [lat_d.get(("gene", g), {}).get("cold", np.nan) for g in GENES]
    ax.plot(x, gl, "o", color="black", markersize=8, zorder=5, label="GenVar local")
    ax.plot(x, gd, "D", color=DOCKER, markeredgecolor="black", markersize=8, zorder=5, label="GenVar Docker")
    ax.set_xticks(x); ax.set_xticklabels(rot, fontsize=9)
    ax.set_ylabel(tc("tempo acumulado (ms)"))
    ax.set_title(tc("fluxo manual (host) e GenVar local vs Docker, por gene"))
    ax.text(0.0, -0.46, "* a VM do Docker estoura o tempo na agregação de mais de 100 mil variantes",
            transform=ax.transAxes, fontsize=8, color=INK)
    _legend_below(ax, ncol=4)
    fig.tight_layout()
    _save(fig, "fig_cmp_breakdown_gene.png")


# ---------------------------------------------------------------------------
# Fig H: completude, local vs Docker. Genes sem resposta no Docker recebem asterisco.
# ---------------------------------------------------------------------------
def fig_completude():
    cl, cd = load_completeness(DL), load_completeness(DD)
    alvos = GENES + VARS
    faltam = [t for t in alvos if t in cl and t not in cd]
    rot = [t + ("*" if t in faltam else "") for t in alvos]
    x = np.arange(len(alvos)); w = 0.38
    vl = [cl.get(t, np.nan) for t in alvos]
    vd = [cd.get(t, 0.0) for t in alvos]   # ausente no Docker = barra zero marcada com *
    fig, ax = plt.subplots(figsize=(13, 4.8))
    ax.bar(x - w/2, vl, w, color=LOCAL, label="Local")
    ax.bar(x + w/2, vd, w, color=DOCKER, label="Docker")
    ax.axhline(80, color=GRAY, linewidth=0.8, linestyle="--")
    ax.set_xticks(x); ax.set_xticklabels(rot, rotation=35, ha="right", fontsize=7.5)
    ax.set_ylabel(tc("campos preenchidos (%)")); ax.set_ylim(0, 105)
    ax.set_title(tc("completude dos dados por consulta: local vs Docker"))
    ax.text(0.0, -0.42, "* alvo sem resposta no Docker por timeout intermitente da VM (dado idêntico quando responde)",
            transform=ax.transAxes, fontsize=8, color=INK)
    _legend_below(ax, ncol=2)
    fig.tight_layout()
    _save(fig, "fig_cmp_completude.png")


if __name__ == "__main__":
    fig_latencia("gene", GENES, "gene", "fig_cmp_latencia_gene.png")
    fig_latencia("variant", VARS, "variante", "fig_cmp_latencia_variante.png")
    fig_cache()
    fig_concorrencia()
    fig_sequencial()
    fig_speedup_variante()
    fig_breakdown_variante()
    fig_breakdown_gene()
    fig_completude()
    print("Done.")
