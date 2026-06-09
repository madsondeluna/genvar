#!/usr/bin/env python3
"""
Generate benchmark figures for the TCC.

Reads CSVs from results/local/ and saves PNG figures to results/local/figures/.
All chart titles and axis labels are in PT-BR with Title Case (first letter of
every word capitalized), per TCC styling.

Usage:
  cd benchmark
  python plot_results.py
  python plot_results.py --results results/docker --dpi 150
"""
import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# Nature Publishing Group (NPG) palette, as in ggsci::scale_color_npg
NPG_RED    = "#E64B35"
NPG_BLUE   = "#4DBBD5"
NPG_GREEN  = "#00A087"
NPG_NAVY   = "#3C5488"
NPG_SALMON = "#F39B7F"
NPG_SLATE  = "#8491B4"
NPG_MINT   = "#91D1C2"
NPG_BROWN  = "#7E6148"

# Semantic mapping used across the figures
PRIMARY = NPG_NAVY     # main series / GenVar
ACCENT  = NPG_BLUE     # secondary series
GOOD    = NPG_GREEN    # positive / com cache
WARN    = NPG_SALMON   # caveat / divergence
BAD     = NPG_RED      # errors
NEUTRAL = NPG_SLATE
LIGHT   = "#F3F4F6"
GRAY    = NPG_SLATE
# Ordered palette for categorical series (e.g. stacked APIs)
CYCLE = [NPG_NAVY, NPG_BLUE, NPG_GREEN, NPG_SALMON, NPG_SLATE, NPG_BROWN, NPG_MINT]

# Aliases so the figure code reads with the NPG palette
BLUE  = PRIMARY   # navy, main series
TEAL  = ACCENT    # light blue, secondary series
GREEN = GOOD
AMBER = WARN
RED   = BAD

TITLE_PAD = 14  # standardized distance from title to plot, applied globally

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 11,
    "axes.titlesize": 13,
    "axes.titlepad": TITLE_PAD,
    "axes.titleweight": "normal",
    "axes.labelsize": 11,
    "axes.edgecolor": "#333333",
    "axes.linewidth": 0.8,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": False,
    "xtick.direction": "out",
    "ytick.direction": "out",
    "xtick.major.size": 4,
    "ytick.major.size": 4,
    "legend.fontsize": 9,
    "figure.dpi": 100,
})


def _legend_below(ax, ncol: int = 2, handles=None, labels=None) -> None:
    """Place the legend outside, centered below the axes (standardized)."""
    kw = dict(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=ncol,
              frameon=False, borderaxespad=0)
    if handles is not None:
        ax.legend(handles, labels, **kw)
    else:
        ax.legend(**kw)


_UNITS = {"ms", "s", "kb", "pb", "bp", "req/s", "%"}
# PT-BR minor words kept lowercase in Title Case (unless they are the first word)
_STOP = {
    "de", "da", "do", "das", "dos", "e", "ou", "o", "a", "os", "as",
    "ao", "aos", "à", "às", "no", "na", "nos", "nas", "em", "um", "uma",
    "por", "para", "com", "sem", "vs",
}


def _cap(word: str) -> str:
    for i, ch in enumerate(word):
        if ch.isalpha():
            return word[:i] + ch.upper() + word[i + 1:]
    return word


def tc(s: str) -> str:
    """Title Case for chart text: capitalize the first letter of each word, but keep
    PT-BR minor words (de, da, do, por, ...) and measurement units lowercase. The first
    word of the string is always capitalized."""
    out = []
    first_done = False
    for w in s.split(" "):
        core = w.strip("()[],.;:").lower()
        if core in _UNITS:
            out.append(w)
        elif not first_done and any(ch.isalpha() for ch in w):
            out.append(_cap(w))
            first_done = True
        elif core in _STOP:
            out.append(w)
        else:
            out.append(_cap(w))
    return " ".join(out)


def _save(fig: plt.Figure, path: Path, dpi: int) -> None:
    fig.savefig(path, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"  Saved {path.name}")


# ---------------------------------------------------------------------------
# Fig 1: cold (sem cache) vs warm (com cache) latency, log scale
# ---------------------------------------------------------------------------
def fig_latency_coldwarm(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "latency_stats.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    nome = {"gene": "Gene", "variant": "Variante"}
    for endpoint in ("gene", "variant"):
        sub = df[df["endpoint"] == endpoint].copy()
        if sub.empty:
            continue

        targets = sorted(sub["target"].unique())
        x = np.arange(len(targets))
        width = 0.38

        # Cold baseline = max of cold phase (the single genuinely uncached call);
        # warm = mean of cached calls.
        cold = sub[sub["phase"] == "cold"].set_index("target").reindex(targets)
        warm = sub[sub["phase"] == "warm"].set_index("target").reindex(targets)

        fig, ax = plt.subplots(figsize=(min(12, max(7, len(targets) * 1.1)), 5))
        b1 = ax.bar(x - width / 2, cold["max"].fillna(0), width, color=BLUE, alpha=0.9,
                    label="Sem Cache (1ª Chamada)")
        b2 = ax.bar(x + width / 2, warm["mean"].fillna(0), width, color=GREEN, alpha=0.9,
                    label="Com Cache (Média)")

        ax.set_yscale("log")
        ax.set_ylim(1, max(cold["max"].max(), 1) * 2.5)
        for bars, vals in ((b1, cold["max"].fillna(0)), (b2, warm["mean"].fillna(0))):
            for bar, v in zip(bars, vals):
                if v > 0:
                    txt = f"{v/1000:.1f}s" if v >= 1000 else f"{v:.0f}ms"
                    ax.text(bar.get_x() + bar.get_width() / 2, v * 1.1, txt,
                            ha="center", va="bottom", fontsize=8)

        ax.set_xticks(x)
        # rs IDs are long; rotate to avoid overlap. Gene symbols are short and stay horizontal.
        ax.set_xticklabels(targets, rotation=20 if endpoint == "variant" else 0,
                           ha="right" if endpoint == "variant" else "center")
        ax.set_ylabel(tc("latência (ms, escala logarítmica)"))
        ax.set_title(tc(f"latência da consulta de {nome[endpoint].lower()}: sem cache vs com cache"))
        _legend_below(ax, ncol=2)
        fig.tight_layout()
        _save(fig, figures_dir / f"fig_latency_{endpoint}.png", dpi)


# ---------------------------------------------------------------------------
# Fig 2: cache speedup (cold max / warm mean)
# ---------------------------------------------------------------------------
def fig_cache_speedup(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "latency_stats.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    cold = df[df["phase"] == "cold"].set_index(["endpoint", "target"])["max"]
    warm = df[df["phase"] == "warm"].set_index(["endpoint", "target"])["mean"]
    speedup = (cold / warm).dropna().reset_index()
    speedup.columns = ["endpoint", "target", "speedup"]
    speedup["label"] = speedup["endpoint"] + "/" + speedup["target"]
    speedup = speedup.sort_values("speedup", ascending=True)

    fig, ax = plt.subplots(figsize=(8.5, min(11, max(4, len(speedup) * 0.5))))
    bars = ax.barh(speedup["label"], speedup["speedup"], color=GREEN, alpha=0.9, edgecolor="white")
    for bar, val in zip(bars, speedup["speedup"]):
        ax.text(bar.get_width() * 1.01, bar.get_y() + bar.get_height() / 2,
                f"{val:.0f}x", va="center", fontsize=10)

    ax.set_xlim(0, speedup["speedup"].max() * 1.15)
    ax.set_xlabel(tc("aceleração da resposta em cache (vezes)"))
    ax.set_title(tc("ganho de cache por consulta"))
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_cache_speedup.png", dpi)


# ---------------------------------------------------------------------------
# Fig 3: manual vs GenVar speedup, log scale so both series are visible
# ---------------------------------------------------------------------------
def fig_comparison_speedup(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "comparison.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    variants = df["rsid"].tolist()
    x = np.arange(len(variants))
    width = 0.38

    fig, ax = plt.subplots(figsize=(min(12, max(8, len(variants) * 1.0)), 5.2))
    b1 = ax.bar(x - width / 2, df["api_speedup"], width, color=TEAL, alpha=0.9,
                label=tc("aceleração de API (só paralelismo)"))
    b2 = ax.bar(x + width / 2, df["total_speedup"], width, color=BLUE, alpha=0.9,
                label=tc("aceleração total (API + 15 min de trabalho manual)"))

    ax.set_yscale("log")
    ax.set_ylim(0.8, df["total_speedup"].max() * 2.6)
    for bars, col in ((b1, "api_speedup"), (b2, "total_speedup")):
        for bar, v in zip(bars, df[col]):
            label = f"{v:.1f}x" if v < 10 else f"{v:.0f}x"
            ax.text(bar.get_x() + bar.get_width() / 2, v * 1.08, label,
                    ha="center", va="bottom", fontsize=8)

    ax.axhline(1, color=GRAY, linewidth=0.8, linestyle="--")
    ax.set_xticks(x)
    ax.set_xticklabels(variants, rotation=20, ha="right")
    ax.set_ylabel(tc("vezes mais rápido (escala logarítmica)"))
    ax.set_title(tc("GenVar vs fluxo manual por variante"))
    _legend_below(ax, ncol=2)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_comparison_speedup.png", dpi)


# ---------------------------------------------------------------------------
# Fig 4: sequential API time breakdown (stacked) vs GenVar parallel
# ---------------------------------------------------------------------------
def fig_comparison_breakdown(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "comparison.csv"
    if not path.exists():
        return

    df = pd.read_csv(path)
    api_cols  = ["ensembl_vep_ms", "gnomad_ms", "clinvar_search_ms", "clinvar_fetch_ms", "myvariant_ms"]
    api_labels = ["Ensembl VEP", "gnomAD", "ClinVar (Busca)", "ClinVar (Recuperação)", "MyVariant.info"]
    colors_stack = [BLUE, TEAL, AMBER, RED, GRAY]

    fig, ax = plt.subplots(figsize=(min(12, max(8, len(df) * 1.0)), 5))
    bottom = np.zeros(len(df))
    for col, label, color in zip(api_cols, api_labels, colors_stack):
        vals = df[col].fillna(0).values
        ax.bar(df["rsid"], vals, bottom=bottom, label=label, color=color, alpha=0.9)
        bottom += vals

    genvar_vals = df["genvar_uncached_ms"].values
    ax.scatter(df["rsid"], genvar_vals, color="black", zorder=5, s=70,
               label=tc("GenVar em paralelo (sem cache)"))
    ax.plot(df["rsid"], genvar_vals, color="black", linewidth=1.2, zorder=4)

    ax.set_ylabel(tc("tempo acumulado (ms)"))
    ax.set_title(tc("tempo das chamadas manuais em sequência vs GenVar em paralelo"))
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    _legend_below(ax, ncol=3)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_comparison_breakdown.png", dpi)


# ---------------------------------------------------------------------------
# Fig 4b: sequential API time breakdown (stacked) vs GenVar parallel, genes
# ---------------------------------------------------------------------------
def fig_comparison_breakdown_gene(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "comparison_gene.csv"
    if not path.exists():
        return

    df = pd.read_csv(path)
    api_cols   = ["ensembl_lookup_ms", "ensembl_overlap_ms", "gnomad_ms", "uniprot_ms", "alphafold_ms"]
    api_labels = ["Ensembl (Lookup)", "Ensembl (Overlap)", "gnomAD", "UniProt", "AlphaFold"]
    colors_stack = [BLUE, TEAL, AMBER, RED, GRAY]

    fig, ax = plt.subplots(figsize=(min(12, max(8, len(df) * 1.0)), 5))
    bottom = np.zeros(len(df))
    for col, label, color in zip(api_cols, api_labels, colors_stack):
        vals = df[col].fillna(0).values
        ax.bar(df["gene"], vals, bottom=bottom, label=label, color=color, alpha=0.9)
        bottom += vals

    genvar_vals = df["genvar_uncached_ms"].values
    ax.scatter(df["gene"], genvar_vals, color="black", zorder=5, s=70,
               label=tc("GenVar integrada (sem cache)"))
    ax.plot(df["gene"], genvar_vals, color="black", linewidth=1.2, zorder=4)

    ax.set_ylabel(tc("tempo acumulado (ms)"))
    ax.set_title(tc("tempo das consultas manuais em sequência vs GenVar integrada"))
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    _legend_below(ax, ncol=3)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_comparison_breakdown_gene.png", dpi)


# ---------------------------------------------------------------------------
# Fig 5: exhaustion -- concurrent and sequential
# ---------------------------------------------------------------------------
def fig_exhaustion(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "exhaustion.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    warm = df[df["phase"] == "concurrent_warm"].copy()
    if not warm.empty:
        summary = warm.groupby("concurrency").agg(
            avg_ms=("elapsed_ms", "mean"),
            max_ms=("elapsed_ms", "max"),
            errors=("ok", lambda x: (~x).sum()),
        ).reset_index()

        fig, ax1 = plt.subplots(figsize=(7.5, 4.5))
        ax2 = ax1.twinx()
        ax1.plot(summary["concurrency"], summary["avg_ms"], "o-", color=BLUE,
                 label=tc("latência média (ms)"))
        ax1.fill_between(summary["concurrency"], summary["avg_ms"], summary["max_ms"],
                         alpha=0.15, color=BLUE, label=tc("faixa até o máximo (ms)"))
        ax2.bar(summary["concurrency"], summary["errors"], color=RED, alpha=0.5, width=1.5,
                label=tc("erros"))

        ax1.set_xlabel(tc("requisições concorrentes"))
        ax1.set_ylabel(tc("latência (ms)"), color=BLUE)
        ax2.set_ylabel(tc("número de erros"), color=RED)
        ax2.set_ylim(0, max(1, summary["errors"].max() * 4))
        ax2.grid(False)
        ax1.set_title(tc("desempenho sob carga concorrente (com cache)"))
        lines1, labels1 = ax1.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        _legend_below(ax1, ncol=3, handles=lines1 + lines2, labels=labels1 + labels2)
        fig.tight_layout()
        _save(fig, figures_dir / "fig_exhaustion_concurrent.png", dpi)

    seq = df[df["phase"] == "sequential_cold"].copy()
    if seq.empty:
        return
    seq_summary = seq.groupby("rate").agg(
        avg_ms=("elapsed_ms", "mean"),
        errors=("ok", lambda x: (~x).sum()),
    ).reset_index()
    rate_order = ["0.5 req/s", "1 req/s", "2 req/s"]
    seq_summary["rate"] = pd.Categorical(seq_summary["rate"], categories=rate_order, ordered=True)
    seq_summary = seq_summary.sort_values("rate")

    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    x = np.arange(len(seq_summary))
    ax.bar(x, seq_summary["avg_ms"], color=TEAL, alpha=0.9, width=0.6)
    ax.set_xticks(x)
    ax.set_xticklabels(seq_summary["rate"])
    ax.set_ylabel(tc("latência média (ms)"))
    ax.set_xlabel(tc("taxa de requisições"))
    ax.set_ylim(0, seq_summary["avg_ms"].max() * 1.2)
    ax.set_title(tc("latência por taxa de requisições (sem cache)"))
    for i, (_, row) in enumerate(seq_summary.iterrows()):
        ax.text(i, row["avg_ms"] * 1.02, f"{row['avg_ms']:.0f}ms", ha="center", va="bottom", fontsize=9)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_exhaustion_sequential.png", dpi)


# ---------------------------------------------------------------------------
# Fig 6: completeness
# ---------------------------------------------------------------------------
def fig_completeness(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "completeness.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    df["label"] = df["endpoint"] + "/" + df["target"]
    df = df.sort_values("completeness_pct", ascending=True)

    fig, ax = plt.subplots(figsize=(8.5, min(11, max(4, len(df) * 0.5))))
    colors = [GREEN if p >= 80 else TEAL if p >= 60 else AMBER for p in df["completeness_pct"]]
    bars = ax.barh(df["label"], df["completeness_pct"], color=colors, alpha=0.9, edgecolor="white")
    for bar, val, row in zip(bars, df["completeness_pct"], df.itertuples()):
        ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height() / 2,
                f"{val:.0f}%  ({row.filled_fields}/{row.total_fields})", va="center", fontsize=8)

    ax.set_xlim(0, 122)
    ax.set_xlabel(tc("campos preenchidos (%)"))
    ax.set_title(tc("completude dos dados por consulta"))
    ax.axvline(80, color=GRAY, linewidth=0.8, linestyle="--", alpha=0.5)
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_completeness.png", dpi)


# ---------------------------------------------------------------------------
# Fig 7: enrichment
# ---------------------------------------------------------------------------
def fig_enrichment(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    agg_path = results_dir / "payload.csv"
    per_path = results_dir / "payload_per_api.csv"
    if not agg_path.exists() or not per_path.exists():
        print(f"  [skip] payload CSVs not found")
        return

    agg = pd.read_csv(agg_path)
    per = pd.read_csv(per_path)
    nome = {"gene": "Gene", "variant": "Variante"}

    # So a figura de variante e gerada. A de gene foi retirada por nao ser uma comparacao
    # informativa: o valor do GenVar para genes esta na integracao das fontes (ver a suite
    # de comparacao), nao na contagem de campos. Para variantes, o MyVariant.info e excluido
    # da comparacao porque devolve centenas de campos brutos aninhados (duplicacoes por
    # transcrito) que nao sao comparaveis a contagem normalizada das demais fontes; seus
    # escores continuam integrados pelo GenVar.
    EXCLUDED_APIS = {"myvariant"}

    for endpoint in ("variant",):
        sub_agg = agg[agg["endpoint"] == endpoint]
        sub_per = per[(per["endpoint"] == endpoint) & (~per["api"].isin(EXCLUDED_APIS))]
        if sub_agg.empty:
            continue

        # Rotulos legiveis para a legenda, casando com a figura de breakdown.
        API_LABEL = {"clinvar": "ClinVar", "ensembl_vep": "Ensembl VEP", "gnomad": "gnomAD"}

        targets = sub_agg["target"].tolist()
        apis = sorted(sub_per["api"].unique())
        all_labels = apis + ["GenVar"]
        x = np.arange(len(targets))
        n = len(all_labels)
        width = 0.8 / n
        api_colors = [GRAY, TEAL, AMBER, RED, GREEN]

        fig, ax = plt.subplots(figsize=(min(13, max(8, len(targets) * 1.2)), 5))
        for i, api in enumerate(apis):
            api_df = sub_per[sub_per["api"] == api].set_index("target").reindex(targets)
            offset = (i - n / 2 + 0.5) * width
            ax.bar(x + offset, api_df["fields"].fillna(0), width * 0.9,
                   color=api_colors[i % len(api_colors)], alpha=0.8, label=API_LABEL.get(api, api))
        offset = (n - 1 - n / 2 + 0.5) * width
        ax.bar(x + offset, sub_agg.set_index("target").reindex(targets)["genvar_fields"].fillna(0),
               width * 0.9, color=BLUE, alpha=0.95, label="GenVar")

        ax.set_xticks(x)
        ax.set_xticklabels(targets, rotation=20 if endpoint == "variant" else 0,
                           ha="right" if endpoint == "variant" else "center")
        ax.set_ylabel(tc("número de campos"))
        ax.set_title(tc(f"campos retornados: GenVar vs APIs individuais ({nome[endpoint].lower()})"))
        _legend_below(ax, ncol=3)
        fig.tight_layout()
        _save(fig, figures_dir / f"fig_enrichment_{endpoint}.png", dpi)


# ---------------------------------------------------------------------------
# Fig 8: error-handling matrix
# ---------------------------------------------------------------------------
def fig_errors(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "errors.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    total = len(df)
    passed = int(df["pass"].sum())

    fig, ax = plt.subplots(figsize=(9.5, 0.9 + len(df) * 0.34))
    ax.axis("off")

    col_labels = [tc("consulta"), tc("caso"), tc("entrada"), tc("esperado"), tc("obtido"), tc("resultado")]
    table_data = [
        [row["endpoint"], row["label"], str(row["input"])[:20],
         str(row["expected_status"]), str(row["actual_status"]),
         "OK" if row["pass"] else "Diverge"]
        for _, row in df.iterrows()
    ]

    # bbox preenche o eixo: a tabela ocupa toda a area, sem o vao que sobrava com
    # loc="center". O titulo fica logo acima, no padrao das demais figuras.
    tbl = ax.table(cellText=table_data, colLabels=col_labels,
                   cellLoc="center", bbox=[0, 0, 1, 1])
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(9)
    for (row_idx, col_idx), cell in tbl.get_celld().items():
        # Grade discreta: so linhas finas claras, sem moldura pesada.
        cell.set_edgecolor("#E5E7EB")
        cell.set_linewidth(0.6)
        cell.PAD = 0.04
        if row_idx == 0:
            cell.set_facecolor(NPG_NAVY)
            cell.set_text_props(color="white", weight="bold")
        elif col_idx == 5:
            text = cell.get_text().get_text()
            cell.set_facecolor(GREEN if text == "OK" else AMBER)
            cell.set_text_props(color="white", weight="bold")
        else:
            cell.set_facecolor(LIGHT if row_idx % 2 == 0 else "white")
            # Destaca a divergencia na coluna "obtido" quando difere do esperado.
            if col_idx == 4 and not df.iloc[row_idx - 1]["pass"]:
                cell.set_text_props(color=NPG_RED, weight="bold")

    ax.set_title(tc(f"robustez a entradas inválidas: {passed} de {total} conforme o esperado, sem erro de servidor"),
                 pad=10)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_errors_matrix.png", dpi)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate benchmark figures for TCC")
    parser.add_argument("--results", default="results/local", help="Directory with CSV files")
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    results_dir = Path(args.results)
    if not results_dir.exists():
        print(f"Results directory not found: {results_dir}")
        sys.exit(1)

    figures_dir = results_dir / "figures"
    figures_dir.mkdir(exist_ok=True)

    print(f"Reading CSVs from {results_dir}/")
    print(f"Saving figures to  {figures_dir}/\n")

    fig_latency_coldwarm(results_dir, figures_dir, args.dpi)
    fig_cache_speedup(results_dir, figures_dir, args.dpi)
    fig_comparison_speedup(results_dir, figures_dir, args.dpi)
    fig_comparison_breakdown(results_dir, figures_dir, args.dpi)
    fig_comparison_breakdown_gene(results_dir, figures_dir, args.dpi)
    fig_exhaustion(results_dir, figures_dir, args.dpi)
    fig_completeness(results_dir, figures_dir, args.dpi)
    # Figura de enriquecimento aposentada: a contagem bruta de campos por fonte nao
    # traduz valor informacional e induz leitura equivocada. A consolidacao de fontes
    # e reportada apenas em texto. A funcao fig_enrichment fica mantida para referencia.
    # Figura de robustez (matriz de erros) tambem aposentada a pedido: era a unica tabela,
    # destoava do padrao grafico das demais; a robustez e reportada apenas em texto.
    # A funcao fig_errors fica mantida para referencia.

    print(f"\nDone. {len(list(figures_dir.glob('*.png')))} figures saved.")


if __name__ == "__main__":
    main()
