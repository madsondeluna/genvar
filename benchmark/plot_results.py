#!/usr/bin/env python3
"""
Generate benchmark figures for the TCC.

Reads CSVs from results/ and saves PNG figures to results/figures/.

Usage:
  cd benchmark
  python plot_results.py
  python plot_results.py --results results/ --dpi 150
"""
import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import pandas as pd
import numpy as np

GRAY      = "#4B5563"
BLUE      = "#2563EB"
TEAL      = "#0891B2"
GREEN     = "#16A34A"
AMBER     = "#D97706"
RED       = "#DC2626"
LIGHT     = "#F3F4F6"
FONT_MONO = "monospace"

plt.rcParams.update({
    "font.family": "monospace",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "grid.linestyle": "--",
    "figure.dpi": 100,
})


def _save(fig: plt.Figure, path: Path, dpi: int) -> None:
    fig.savefig(path, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"  Saved {path.name}")


# ---------------------------------------------------------------------------
# Fig 1: Cold vs Warm latency -- grouped bar per target
# ---------------------------------------------------------------------------
def fig_latency_coldwarm(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "latency_stats.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    for endpoint in ("gene", "variant"):
        sub = df[df["endpoint"] == endpoint].copy()
        if sub.empty:
            continue

        targets = sorted(sub["target"].unique())
        x = np.arange(len(targets))
        width = 0.35

        cold = sub[sub["phase"] == "cold"].set_index("target").reindex(targets)
        warm = sub[sub["phase"] == "warm"].set_index("target").reindex(targets)

        fig, ax = plt.subplots(figsize=(max(6, len(targets) * 1.6), 5))
        bars_cold = ax.bar(x - width / 2, cold["mean"].fillna(0), width, yerr=cold["std"].fillna(0),
                           color=BLUE, alpha=0.85, capsize=4, label="Cold (sem cache)")
        bars_warm = ax.bar(x + width / 2, warm["mean"].fillna(0), width, yerr=warm["std"].fillna(0),
                           color=GREEN, alpha=0.85, capsize=4, label="Warm (com cache)")

        # P95 markers
        for i, tgt in enumerate(targets):
            cold_row = cold.loc[tgt] if tgt in cold.index else None
            warm_row = warm.loc[tgt] if tgt in warm.index else None
            if cold_row is not None and not pd.isna(cold_row["p95"]):
                ax.plot(i - width / 2, cold_row["p95"], "^", color="white", markersize=6, zorder=5)
            if warm_row is not None and not pd.isna(warm_row["p95"]):
                ax.plot(i + width / 2, warm_row["p95"], "^", color="white", markersize=6, zorder=5)

        ax.set_xticks(x)
        ax.set_xticklabels(targets)
        ax.set_ylabel("Latencia media (ms)")
        ax.set_title(f"Latencia por endpoint /{endpoint} -- cold vs warm\n(triangulo = p95)")
        ax.legend()
        fig.tight_layout()
        _save(fig, figures_dir / f"fig_latency_{endpoint}.png", dpi)


# ---------------------------------------------------------------------------
# Fig 2: Cache speedup bar chart
# ---------------------------------------------------------------------------
def fig_cache_speedup(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "latency_stats.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    cold = df[df["phase"] == "cold"].set_index(["endpoint", "target"])["mean"]
    warm = df[df["phase"] == "warm"].set_index(["endpoint", "target"])["mean"]
    speedup = (cold / warm).dropna().reset_index()
    speedup.columns = ["endpoint", "target", "speedup"]
    speedup["label"] = speedup["endpoint"] + "/" + speedup["target"]
    speedup = speedup.sort_values("speedup", ascending=True)

    fig, ax = plt.subplots(figsize=(7, max(4, len(speedup) * 0.55)))
    colors = [GREEN if s >= 10 else TEAL if s >= 3 else AMBER for s in speedup["speedup"]]
    bars = ax.barh(speedup["label"], speedup["speedup"], color=colors, alpha=0.85)

    for bar, val in zip(bars, speedup["speedup"]):
        ax.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height() / 2,
                f"{val:.1f}x", va="center", fontsize=9)

    ax.set_xlabel("Speedup (cold_mean / warm_mean)")
    ax.set_title("Ganho de cache por endpoint (vezes mais rapido)")
    ax.axvline(1, color=GRAY, linewidth=0.8, linestyle="--")
    fig.tight_layout()
    _save(fig, figures_dir / "fig_cache_speedup.png", dpi)


# ---------------------------------------------------------------------------
# Fig 3: Manual vs GenVar speedup (comparison suite)
# ---------------------------------------------------------------------------
def fig_comparison_speedup(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "comparison.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    variants = df["rsid"].tolist()
    x = np.arange(len(variants))
    width = 0.35

    fig, ax = plt.subplots(figsize=(max(6, len(variants) * 1.8), 5))
    ax.bar(x - width / 2, df["api_speedup"], width, color=TEAL, alpha=0.85, label="API speedup\n(paralelismo)")
    ax.bar(x + width / 2, df["total_speedup"], width, color=BLUE, alpha=0.85,
           label="Speedup total\n(API + 15 min processamento manual)")

    ax.set_xticks(x)
    ax.set_xticklabels(variants)
    ax.set_ylabel("Vezes mais rapido")
    ax.set_title("GenVar vs fluxo manual sequencial por variante")
    ax.legend()
    ax.axhline(1, color=GRAY, linewidth=0.8, linestyle="--")

    for i, row in df.iterrows():
        ax.text(i - width / 2, row["api_speedup"] + 0.3, f"{row['api_speedup']:.1f}x",
                ha="center", fontsize=8)
        ax.text(i + width / 2, row["total_speedup"] + 0.3, f"{row['total_speedup']:.0f}x",
                ha="center", fontsize=8)

    fig.tight_layout()
    _save(fig, figures_dir / "fig_comparison_speedup.png", dpi)


# ---------------------------------------------------------------------------
# Fig 4: Sequential API breakdown (stacked bar, time per API step)
# ---------------------------------------------------------------------------
def fig_comparison_breakdown(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "comparison.csv"
    if not path.exists():
        return

    df = pd.read_csv(path)
    api_cols  = ["ensembl_vep_ms", "gnomad_ms", "clinvar_search_ms", "clinvar_fetch_ms", "myvariant_ms"]
    api_labels = ["Ensembl VEP", "gnomAD", "ClinVar search", "ClinVar fetch", "MyVariant.info"]
    colors_stack = [BLUE, TEAL, AMBER, RED, GRAY]

    fig, ax = plt.subplots(figsize=(max(6, len(df) * 1.8), 5))
    bottom = np.zeros(len(df))

    for col, label, color in zip(api_cols, api_labels, colors_stack):
        vals = df[col].fillna(0).values
        ax.bar(df["rsid"], vals, bottom=bottom, label=label, color=color, alpha=0.85)
        bottom += vals

    genvar_vals = df["genvar_uncached_ms"].values
    ax.scatter(df["rsid"], genvar_vals, color="black", zorder=5, s=60, label="GenVar (paralelo)")
    ax.plot(df["rsid"], genvar_vals, color="black", linewidth=1.2, zorder=4)

    ax.set_ylabel("Tempo (ms)")
    ax.set_title("Tempo acumulado de chamadas manuais vs GenVar\n(ponto preto = GenVar sem cache)")
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_comparison_breakdown.png", dpi)


# ---------------------------------------------------------------------------
# Fig 5: Exhaustion -- concurrent throughput
# ---------------------------------------------------------------------------
def fig_exhaustion(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "exhaustion.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    warm = df[df["phase"] == "concurrent_warm"].copy()
    if warm.empty:
        return

    summary = warm.groupby("concurrency").agg(
        avg_ms=("elapsed_ms", "mean"),
        max_ms=("elapsed_ms", "max"),
        errors=("ok", lambda x: (~x).sum()),
    ).reset_index()

    fig, ax1 = plt.subplots(figsize=(7, 4))
    ax2 = ax1.twinx()

    ax1.plot(summary["concurrency"], summary["avg_ms"], "o-", color=BLUE, label="Media (ms)")
    ax1.fill_between(summary["concurrency"], summary["avg_ms"], summary["max_ms"],
                     alpha=0.15, color=BLUE, label="Ate max (ms)")
    ax2.bar(summary["concurrency"], summary["errors"], color=RED, alpha=0.5, width=1.5, label="Erros")

    ax1.set_xlabel("Requisicoes concorrentes")
    ax1.set_ylabel("Latencia (ms)", color=BLUE)
    ax2.set_ylabel("Erros", color=RED)
    ax1.set_title("Throughput sob carga concorrente (cache aquecido)")

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, fontsize=8)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_exhaustion_concurrent.png", dpi)

    # Sequential rate levels
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

    fig, ax = plt.subplots(figsize=(6, 4))
    x = np.arange(len(seq_summary))
    ax.bar(x, seq_summary["avg_ms"], color=TEAL, alpha=0.85)
    ax.set_xticks(x)
    ax.set_xticklabels(seq_summary["rate"])
    ax.set_ylabel("Latencia media (ms)")
    ax.set_title("Latencia por taxa de requisicoes (sem cache)")
    for i, (_, row) in enumerate(seq_summary.iterrows()):
        ax.text(i, row["avg_ms"] + 20, f"{row['avg_ms']:.0f}ms", ha="center", fontsize=9)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_exhaustion_sequential.png", dpi)


# ---------------------------------------------------------------------------
# Fig 6: Data completeness horizontal bar
# ---------------------------------------------------------------------------
def fig_completeness(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "completeness.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    df["label"] = df["endpoint"] + "/" + df["target"]
    df = df.sort_values("completeness_pct", ascending=True)

    fig, ax = plt.subplots(figsize=(7, max(4, len(df) * 0.5)))
    colors = [GREEN if p >= 80 else TEAL if p >= 60 else AMBER for p in df["completeness_pct"]]
    bars = ax.barh(df["label"], df["completeness_pct"], color=colors, alpha=0.85)

    for bar, val, row in zip(bars, df["completeness_pct"], df.itertuples()):
        ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                f"{val:.0f}%  ({row.filled_fields}/{row.total_fields})",
                va="center", fontsize=8)

    ax.set_xlim(0, 115)
    ax.set_xlabel("Completude (%)")
    ax.set_title("Cobertura de campos por consulta")
    ax.axvline(80, color=GRAY, linewidth=0.8, linestyle="--", alpha=0.5)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_completeness.png", dpi)


# ---------------------------------------------------------------------------
# Fig 7: Data enrichment (payload suite)
# ---------------------------------------------------------------------------
def fig_enrichment(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    agg_path = results_dir / "payload.csv"
    per_path = results_dir / "payload_per_api.csv"
    if not agg_path.exists() or not per_path.exists():
        print(f"  [skip] payload CSVs not found")
        return

    agg = pd.read_csv(agg_path)
    per = pd.read_csv(per_path)

    # Grouped bar: GenVar fields vs each individual API, per variant
    for endpoint in ("variant", "gene"):
        sub_agg = agg[agg["endpoint"] == endpoint]
        sub_per = per[per["endpoint"] == endpoint]
        if sub_agg.empty:
            continue

        targets = sub_agg["target"].tolist()
        apis = sorted(sub_per["api"].unique())
        all_labels = apis + ["GenVar"]
        x = np.arange(len(targets))
        n = len(all_labels)
        width = 0.8 / n

        api_colors = [GRAY, TEAL, AMBER, RED, GREEN, BLUE]
        genvar_color = BLUE

        fig, ax = plt.subplots(figsize=(max(7, len(targets) * 2), 5))

        for i, api in enumerate(apis):
            api_df = sub_per[sub_per["api"] == api].set_index("target").reindex(targets)
            offset = (i - n / 2 + 0.5) * width
            ax.bar(x + offset, api_df["fields"].fillna(0), width * 0.9,
                   color=api_colors[i % len(api_colors)], alpha=0.75, label=api)

        # GenVar bar (last group)
        offset = (n - 1 - n / 2 + 0.5) * width
        ax.bar(x + offset, sub_agg.set_index("target").reindex(targets)["genvar_fields"].fillna(0),
               width * 0.9, color=BLUE, alpha=0.9, label="GenVar")

        ax.set_xticks(x)
        ax.set_xticklabels(targets)
        ax.set_ylabel("Numero de campos")
        ax.set_title(f"Campos retornados: GenVar vs APIs individuais ({endpoint})")
        ax.legend(fontsize=8, ncol=2)
        fig.tight_layout()
        _save(fig, figures_dir / f"fig_enrichment_{endpoint}.png", dpi)

    # Enrichment ratio bar
    fig, ax = plt.subplots(figsize=(max(6, len(agg) * 1.4), 4))
    agg["label"] = agg["endpoint"] + "/" + agg["target"]
    colors = [GREEN if r >= 3 else TEAL for r in agg["enrichment_ratio"].fillna(0)]
    bars = ax.bar(agg["label"], agg["enrichment_ratio"].fillna(0), color=colors, alpha=0.85)
    for bar, val in zip(bars, agg["enrichment_ratio"].fillna(0)):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.05,
                f"{val:.1f}x", ha="center", fontsize=9)
    ax.axhline(1, color=GRAY, linewidth=0.8, linestyle="--")
    ax.set_ylabel("Razao de enriquecimento")
    ax.set_title("Campos GenVar / melhor API individual")
    plt.xticks(rotation=20, ha="right")
    fig.tight_layout()
    _save(fig, figures_dir / "fig_enrichment_ratio.png", dpi)


# ---------------------------------------------------------------------------
# Fig 8: Error handling matrix
# ---------------------------------------------------------------------------
def fig_errors(results_dir: Path, figures_dir: Path, dpi: int) -> None:
    path = results_dir / "errors.csv"
    if not path.exists():
        print(f"  [skip] {path.name} not found")
        return

    df = pd.read_csv(path)
    df["result"] = df["pass"].map({True: "PASS", False: "FAIL"})
    df["status_label"] = df.apply(
        lambda r: f"exp {r['expected_status']} / got {r['actual_status']}", axis=1
    )

    fig, ax = plt.subplots(figsize=(9, max(4, len(df) * 0.45)))
    ax.axis("off")

    col_labels = ["Endpoint", "Caso", "Entrada", "Esperado", "Obtido", "Resultado"]
    table_data = [
        [row["endpoint"], row["label"], row["input"][:20],
         str(row["expected_status"]), str(row["actual_status"]),
         "PASS" if row["pass"] else "FAIL"]
        for _, row in df.iterrows()
    ]

    tbl = ax.table(cellText=table_data, colLabels=col_labels, loc="center", cellLoc="center")
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(8)
    tbl.scale(1, 1.4)

    for (row_idx, col_idx), cell in tbl.get_celld().items():
        if row_idx == 0:
            cell.set_facecolor(GRAY)
            cell.set_text_props(color="white")
        elif col_idx == 5:
            text = cell.get_text().get_text()
            cell.set_facecolor(GREEN if text == "PASS" else RED)
            cell.set_text_props(color="white")
        else:
            cell.set_facecolor(LIGHT if row_idx % 2 == 0 else "white")

    total = len(df)
    passed = df["pass"].sum()
    ax.set_title(f"Resultado dos testes de erro  --  {passed}/{total} corretos", pad=12)
    fig.tight_layout()
    _save(fig, figures_dir / "fig_errors_matrix.png", dpi)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Generate benchmark figures for TCC")
    parser.add_argument("--results", default="results", help="Directory with CSV files")
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
    fig_exhaustion(results_dir, figures_dir, args.dpi)
    fig_completeness(results_dir, figures_dir, args.dpi)
    fig_enrichment(results_dir, figures_dir, args.dpi)
    fig_errors(results_dir, figures_dir, args.dpi)

    print(f"\nDone. {len(list(figures_dir.glob('*.png')))} figures saved.")


if __name__ == "__main__":
    main()
