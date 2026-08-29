"""
Infraestrutura compartilhada: ambiente, estatistica e escrita de CSV.

Uma decisao vale ser explicada, porque muda o que as figuras dizem. O resumo de
cada medicao traz mediana e intervalo de confianca da mediana por bootstrap, e
nao media com desvio. Latencia de rede tem cauda longa e assimetrica: a media e
puxada por uma chamada lenta em vinte, e o desvio de uma distribuicao assim nao
delimita nada. A mediana descreve o caso tipico e o p95 descreve a cauda, que e
a pergunta que interessa em servico. O desvio fica registrado na mesma linha
para quem quiser conferir a dispersao, mas nao e o que as figuras usam.
"""
import csv
import json
import platform
import random
import subprocess
import time
from pathlib import Path
from statistics import median, pstdev

RAIZ = Path(__file__).resolve().parent


def _cmd(args, padrao=""):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return padrao


def ambiente(rotulo):
    """Tudo que precisa aparecer no metodo para a medicao ser reproduzivel."""
    return {
        "rotulo": rotulo,
        "quando": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "sistema": f"{platform.system()} {platform.release()}",
        "maquina": platform.machine(),
        "cpu": _cmd(["sysctl", "-n", "machdep.cpu.brand_string"]) or platform.processor(),
        "nucleos": _cmd(["sysctl", "-n", "hw.ncpu"]),
        "memoria_gb": round(int(_cmd(["sysctl", "-n", "hw.memsize"], "0") or 0) / 1024**3, 1),
        "python": platform.python_version(),
        "node": _cmd(["node", "-v"]),
        "docker": _cmd(["docker", "--version"]),
        "commit": _cmd(["git", "-C", str(RAIZ.parent), "rev-parse", "--short", "HEAD"]),
        "branch": _cmd(["git", "-C", str(RAIZ.parent), "rev-parse", "--abbrev-ref", "HEAD"]),
    }


def ic_mediana(amostra, confianca=0.95, reamostras=2000, semente=20260829):
    """Intervalo de confianca da mediana por bootstrap percentil.

    Semente fixa: o intervalo tem de sair igual em duas execucoes sobre os
    mesmos dados, senao o numero publicado nao e conferivel.
    """
    if len(amostra) < 3:
        return (None, None)
    rnd = random.Random(semente)
    n = len(amostra)
    medianas = sorted(median(rnd.choices(amostra, k=n)) for _ in range(reamostras))
    lo = medianas[int((1 - confianca) / 2 * reamostras)]
    hi = medianas[int((1 + confianca) / 2 * reamostras) - 1]
    return (round(lo, 3), round(hi, 3))


def percentil(amostra, p):
    """Percentil por interpolacao linear, o metodo 7 do R, que e o padrao."""
    if not amostra:
        return None
    s = sorted(amostra)
    if len(s) == 1:
        return s[0]
    k = (len(s) - 1) * p
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (k - f) * (s[c] - s[f])


# Abaixo deste N o p95 nao e um p95: com tres observacoes, o percentil 95
# interpolado cai entre a segunda e a terceira, ou seja, e o maximo com outro
# nome. Publicar isso como "p95" sugere uma estimativa de cauda que os dados nao
# sustentam. Vinte e o piso a partir do qual a 95a posicao existe de fato na
# amostra em vez de ser extrapolada da ponta.
N_MINIMO_P95 = 20


def resumo(amostra):
    """O resumo padrao de toda medicao repetida, na mesma ordem de colunas.

    `p95` so e preenchido quando ha amostra para ele. Quando nao ha, a cauda e
    descrita pelo MAXIMO OBSERVADO, e a coluna `cauda` diz qual dos dois foi
    usado, para que a figura e o texto nao precisem adivinhar.
    """
    if not amostra:
        return {"n": 0, "mediana": None, "ic_baixo": None, "ic_alto": None,
                "p95": None, "max": None, "cauda": "sem amostra",
                "min": None, "desvio": None}
    lo, hi = ic_mediana(amostra)
    tem_p95 = len(amostra) >= N_MINIMO_P95
    return {
        "n": len(amostra),
        "mediana": round(median(amostra), 3),
        "ic_baixo": lo,
        "ic_alto": hi,
        "p95": round(percentil(amostra, 0.95), 3) if tem_p95 else None,
        "max": round(max(amostra), 3),
        "cauda": "p95" if tem_p95 else f"maximo de {len(amostra)}",
        "min": round(min(amostra), 3),
        "desvio": round(pstdev(amostra), 3) if len(amostra) > 1 else 0.0,
    }


def grava_csv(caminho, linhas):
    """Escreve o CSV com a uniao ordenada das chaves, para coluna ausente numa
    linha nao deslocar o resto."""
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    if not linhas:
        caminho.write_text("", encoding="utf-8")
        return caminho
    campos = list(linhas[0].keys())
    for l in linhas:
        for k in l:
            if k not in campos:
                campos.append(k)
    with caminho.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        w.writerows(linhas)
    return caminho


def grava_json(caminho, obj):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return caminho
