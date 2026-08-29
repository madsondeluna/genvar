"""
Generate the local vs Docker comparison figures (Nature/NPG style).

Each figure confronts the same experiment measured in two environments: the services running
locally (uvicorn, Vite, native Redis) and containerized (Docker Compose). The goal is to
quantify the cost of containerization.

Honesty decisions built in:
  - Gene backend performance uses the LATENCY suite (clean in both environments), not the
    manual simulation from the comparison suite, which hammers Ensembl on the host and is
    rate-limited on large genes (so the slowdown is not a Docker effect).
  - The manual flow bars (breakdown) are measured on the HOST; they are shown once (local)
    and labeled as such, with the GenVar points of both environments over the same base.
  - Genes where the Docker VM exceeded the time limit or became disproportionate (TP53 and
    CFTR with no completeness response; CFTR/MSH2 in the heavy aggregation) get an asterisk.

Fixed encoding in every figure: Local = navy, Docker = salmon.

Input : results/local (local) and results/docker (Docker), each with the CSVs emitted by
        run_benchmarks.py in the respective environment.
Output: results/figures/fig_cmp_*.png
Usage : python plot_comparison.py
        python plot_comparison.py --local results/local --docker results/docker --out results/figures
"""
import argparse
import csv
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

# NPG palette.
NAVY = "#3C5488"; SALMON = "#F39B7F"; BLUE = "#4DBBD5"; GREEN = "#00A087"
RED = "#E64B35"; SLATE = "#8491B4"; GRAY = "#8491B4"; INK = "#333333"
LOCAL = NAVY      # local environment
DOCKER = SALMON   # containerized environment

BASE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(BASE, "results", "local")     # local
DD = os.path.join(BASE, "results", "docker")    # docker
FIG = os.path.join(BASE, "results", "figures")
DPI = 150

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
    # Returns {(endpoint,target): {"cold": max_cold_ms, "warm": mean_warm_ms}}.
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
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"saved {name}")


# ---------------------------------------------------------------------------
# Fig A: latency (cold | warm) local vs Docker, two panels. Gene and variant.
# ---------------------------------------------------------------------------
def fig_latencia(endpoint, targets, nome, fname):
    lat_l, lat_d = load_latency(DL), load_latency(DD)
    x = np.arange(len(targets)); w = 0.38
    # The cold and warm y-axes cannot be the same (they differ a thousandfold; warm would
    # vanish). But so that gene and variant are comparable, we fix the SAME range per phase
    # in both figures: the global range of the phase, over gene and variant and both
    # environments. So the cold gene panel and the cold variant panel use the same scale.
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
# Fig B: cache speedup, local vs Docker, grouped horizontal bars.
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
# Fig C: concurrency (mean latency x simultaneous), two lines.
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
# Fig D: latency per sequential rate (cold), gene and variant, local vs Docker.
# ---------------------------------------------------------------------------
def fig_sequencial():
    def serie(d, endpoint):
        m = {}
        for r in _rows(os.path.join(d, "exhaustion.csv")):
            if r["phase"] == "sequential_cold" and r["endpoint"] == endpoint:
                m.setdefault(r["rate"], []).append(float(r["elapsed_ms"]))
        taxas = sorted(m, key=lambda s: float(s.split()[0]))
        return taxas, [np.mean(m[t]) / 1000 for t in taxas]
    # sharey: gene and variant measure the same quantity (latency in s), so the two panels
    # share the y-axis for the comparison to be valid.
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
# Fig E: API speedup per variant, local vs Docker.
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
# Fig F: variant breakdown (manual on host) + GenVar local and Docker points.
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
# Fig G: gene breakdown (manual on host, local) + GenVar local and Docker (clean latency).
# Heavy genes where the Docker VM overruns get an asterisk.
# ---------------------------------------------------------------------------
ATIPICOS_DOCKER = {"CFTR", "MSH2"}  # the Docker VM chokes on aggregating 119k-150k variants


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
# Fig H: completeness, local vs Docker. Genes with no Docker response get an asterisk.
# ---------------------------------------------------------------------------
def fig_completude():
    cl, cd = load_completeness(DL), load_completeness(DD)
    alvos = GENES + VARS
    faltam = [t for t in alvos if t in cl and t not in cd]
    rot = [t + ("*" if t in faltam else "") for t in alvos]
    x = np.arange(len(alvos)); w = 0.38
    vl = [cl.get(t, np.nan) for t in alvos]
    vd = [cd.get(t, 0.0) for t in alvos]   # missing in Docker = zero bar marked with *
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


def main():
    global DL, DD, FIG, DPI
    ap = argparse.ArgumentParser(description="GenVar local vs Docker comparison figures")
    ap.add_argument("--local", default=DL, help="Directory with the local-environment CSVs")
    ap.add_argument("--docker", default=DD, help="Directory with the Docker-environment CSVs")
    ap.add_argument("--out", default=FIG, help="Output directory for the PNGs")
    ap.add_argument("--dpi", type=int, default=DPI)
    args = ap.parse_args()
    DL, DD, FIG, DPI = args.local, args.docker, args.out, args.dpi
    os.makedirs(FIG, exist_ok=True)

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


if __name__ == "__main__":
    main()
