"""
Estilo unico das figuras, herdado do benchmark da versao 2.0.

A paleta e a do Nature Publishing Group, a mesma do `ggsci::scale_color_npg`,
porque foi a usada nas figuras da 2.0 e trocar de paleta entre as duas versoes
faria a figura comparativa parecer comparar coisas diferentes.

Regras que valem para todas as figuras, e que existem porque cada uma ja apareceu
quebrada em alguma prova:

  - Titulo em portugues, com inicial maiuscula em cada palavra significativa.
  - Sem moldura em cima e a direita: a caixa fechada rouba tinta do dado.
  - Legenda ABAIXO da area de dados, nunca por cima, e nunca dentro: legenda
    dentro cobre a serie mais alta, que costuma ser a que interessa.
  - Rotulo de valor em cima da barra, com folga: numero encostado na barra le
    como parte dela.
  - Eixo logaritmico onde a razao entre o maior e o menor passa de cem, e a
    escala e declarada no rotulo do eixo.
  - Nada de rotulo girado a 90 graus: ilegivel impresso. Rotulo longo vai a 30
    graus com alinhamento a direita, ou a figura vira barra horizontal.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

# Paleta NPG
VERMELHO = "#E64B35"
AZUL_CLARO = "#4DBBD5"
VERDE = "#00A087"
MARINHO = "#3C5488"
SALMAO = "#F39B7F"
ARDOSIA = "#8491B4"
MENTA = "#91D1C2"
MARROM = "#7E6148"

PRINCIPAL = MARINHO
SECUNDARIA = AZUL_CLARO
BOM = VERDE
ATENCAO = SALMAO
RUIM = VERMELHO
NEUTRA = ARDOSIA
CICLO = [MARINHO, AZUL_CLARO, VERDE, SALMAO, ARDOSIA, MARROM, MENTA, VERMELHO]

DPI = 200


def aplicar():
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 9,
        "axes.titlesize": 11,
        "axes.labelsize": 9.5,
        "xtick.labelsize": 8.5,
        "ytick.labelsize": 8.5,
        "legend.fontsize": 8.5,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.alpha": 0.25,
        "grid.linewidth": 0.6,
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "savefig.facecolor": "white",
    })


def milhar(x, _=None):
    """Separador de milhar do portugues: ponto, nao virgula."""
    if x >= 1000:
        return f"{x:,.0f}".replace(",", ".")
    if x == int(x):
        return f"{int(x)}"
    return f"{x:.1f}".replace(".", ",")


def eixo_milhar(ax, eixo="y"):
    (ax.yaxis if eixo == "y" else ax.xaxis).set_major_formatter(FuncFormatter(milhar))


def legenda_abaixo(ax, n=None, y=-0.18):
    alcas, rotulos = ax.get_legend_handles_labels()
    if not rotulos:
        return
    ax.legend(alcas, rotulos, loc="upper center", bbox_to_anchor=(0.5, y),
              ncol=n or min(len(rotulos), 4), frameon=False)


def rotular_barras(ax, barras, fmt="{:.0f}", folga=0.02, cor="#222222", tamanho=8):
    """Rotulo acima da barra, com folga proporcional a altura do eixo."""
    lo, hi = ax.get_ylim()
    d = (hi - lo) * folga
    for b in barras:
        h = b.get_height()
        if h is None:
            continue
        ax.text(b.get_x() + b.get_width() / 2, h + d, fmt.format(h),
                ha="center", va="bottom", fontsize=tamanho, color=cor)


def rotular_barras_h(ax, barras, fmt="{:.0f}", folga=0.02, cor="#222222", tamanho=8):
    lo, hi = ax.get_xlim()
    d = (hi - lo) * folga
    for b in barras:
        w = b.get_width()
        ax.text(w + d, b.get_y() + b.get_height() / 2, fmt.format(w),
                va="center", ha="left", fontsize=tamanho, color=cor)


def salvar(fig, caminho, dpi=DPI):
    from pathlib import Path
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(caminho, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return caminho.stat().st_size / 1024
