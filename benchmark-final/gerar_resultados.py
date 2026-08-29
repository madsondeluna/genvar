#!/usr/bin/env python3
"""
Monta RESULTADOS.md a partir dos CSV, com as figuras numeradas e citadas.

REGRA QUE SUSTENTA O DOCUMENTO: nenhum numero e escrito a mao. Todo valor no
texto sai de uma leitura do CSV no momento da geracao. Assim, remedir e
regenerar deixa o texto consistente com os dados, e um numero que muda no CSV
nao fica contradito por uma frase que ninguem lembrou de atualizar.

A numeracao das figuras e sequencial e vem da ordem em que `figura()` e chamada.
Cada chamada devolve o rotulo "Fig. N", que o texto usa para citar. Assim nao ha
como o texto citar uma figura que nao existe nem numerar duas vezes a mesma.

Uso:
  python3 benchmark-final/gerar_resultados.py
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import pandas as pd  # noqa: E402


class Documento:
    def __init__(self, resultados, figuras):
        self.res = Path(resultados)
        self.figs = Path(figuras)
        self.partes = []
        self.n = 0
        self.faltando = []

    # --- leitura -------------------------------------------------------------
    def csv(self, nome, rotulo=None):
        caminho = self.res / nome
        if not caminho.exists() or caminho.stat().st_size == 0:
            self.faltando.append(nome)
            return None
        d = pd.read_csv(caminho)
        return d if rotulo is None or "rotulo" not in d.columns else d[d.rotulo == rotulo]

    def json_(self, nome):
        caminho = self.res / nome
        if not caminho.exists():
            self.faltando.append(nome)
            return None
        return json.loads(caminho.read_text(encoding="utf-8"))

    # --- escrita -------------------------------------------------------------
    def txt(self, s):
        self.partes.append(s.rstrip() + "\n\n")

    def titulo(self, nivel, s):
        self.partes.append(f"{'#' * nivel} {s}\n\n")

    def tabela(self, cabecalho, linhas):
        self.partes.append("| " + " | ".join(cabecalho) + " |\n")
        self.partes.append("|" + "|".join("---" for _ in cabecalho) + "|\n")
        for l in linhas:
            self.partes.append("| " + " | ".join(str(c) for c in l) + " |\n")
        self.partes.append("\n")

    def figura(self, arquivo, legenda):
        """Insere a figura e devolve o rotulo com que o texto deve cita-la."""
        if not (self.figs / arquivo).exists():
            self.faltando.append(f"figuras/{arquivo}")
            return "[figura ausente]"
        self.n += 1
        self.partes.append(f"![Figura {self.n}](figuras/{arquivo})\n\n")
        self.partes.append(f"**Fig. {self.n}.** {legenda}\n\n")
        return f"Fig. {self.n}"

    def grava(self, caminho):
        Path(caminho).write_text("".join(self.partes), encoding="utf-8")
        return Path(caminho)


def num(v, casas=1):
    """Numero no padrao do portugues: milhar com ponto, decimal com virgula."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "—"
    if casas == 0 or float(v) == int(v):
        return f"{int(round(float(v))):,}".replace(",", ".")
    return f"{float(v):,.{casas}f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resultados", default=str(AQUI / "resultados" / "local"))
    ap.add_argument("--figuras", default=str(AQUI / "figuras"))
    ap.add_argument("--saida", default=str(AQUI / "RESULTADOS.md"))
    args = ap.parse_args()

    d = Documento(args.resultados, args.figuras)
    from secoes import escrever  # noqa: E402
    escrever(d, num)
    caminho = d.grava(args.saida)
    print(f"{caminho} escrito, {d.n} figuras citadas")
    if d.faltando:
        print("  ausentes (secoes correspondentes foram omitidas):")
        for f in sorted(set(d.faltando)):
            print(f"    {f}")


if __name__ == "__main__":
    main()
