#!/usr/bin/env python3
"""
Ganho de tempo: anotar um VCF a mao contra anotar na plataforma.

A comparacao honesta nao e "o GenVar e rapido". E: para saber o significado
clinico, a frequencia populacional e a consequencia molecular de N variantes,
quanto custa cada caminho?

  A MAO. Quatro consultas por variante, uma de cada vez, a fontes publicas:
  VEP do Ensembl, gnomAD, ClinVar pelo E-utilities e MyVariant. Sao as mesmas
  quatro que a pagina de variante do proprio GenVar faz, entao o numero nao e
  uma caricatura de fluxo manual: e o piso dele, sem contar o tempo de abrir
  portal, digitar identificador, ler a tela e copiar para a planilha.

  NA PLATAFORMA. O cruzamento roda no navegador contra o ClinVar embarcado, em
  uma passada sobre o arquivo inteiro. O custo por variante sai de
  resultados/funcoes.csv, medido pelo executar.mjs.

O NUMERO GRANDE E UMA PROJECAO, e ela esta declarada. Medir 25.000 variantes a
mao levaria dias e queimaria o acesso do projeto as fontes, que aplicam uso
justo por IP: uma varredura dessas bloqueia a origem para todo mundo. Entao
mede-se o custo real por variante numa amostra pequena e multiplica-se, com o
intervalo da amostra transportado para a projecao.

O que a projecao NAO inclui, e que so aumentaria a diferenca: tempo humano de
navegacao, erro de transcricao, e o retrabalho de refazer tudo quando alguem
pergunta de qual arquivo aquela planilha saiu.

Uso:
  python3 benchmark-final/infra/ganho.py --amostra 15
"""
import argparse
import asyncio
import csv
import json
import statistics
import sys
import time
from pathlib import Path

import httpx
from rich.console import Console
from rich.table import Table

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "benchmark"))

from suites.comparison import _manual_variant  # noqa: E402
from suites._targets import VARIANTS, VARIANT_COORDS  # noqa: E402

console = Console()


async def _plataforma(client, base, rsid):
    """A mesma pergunta, uma chamada so, com as quatro fontes ja consolidadas."""
    t0 = time.perf_counter()
    try:
        r = await client.get(f"{base}/api/variant/{rsid}", timeout=90.0)
        return (time.perf_counter() - t0) * 1000, r.status_code == 200
    except Exception:
        return (time.perf_counter() - t0) * 1000, False


def _custo_local_por_variante(resultados: Path) -> dict:
    """Custo da anotacao embarcada, tirado do CSV do executar.mjs."""
    arq = resultados / "funcoes.csv"
    if not arq.exists():
        return {}
    melhor = {}
    with arq.open(encoding="utf-8") as fh:
        for l in csv.DictReader(fh):
            if l["etapa"] != "anotacao" or l["funcao"] != "ClinVar":
                continue
            try:
                n = int(l["variantes"])
                ms = float(l["mediana_ms"])
            except (ValueError, KeyError):
                continue
            if n >= 25_000:
                melhor[l["arquivo"]] = {"variantes": n, "ms": ms, "ms_por_variante": ms / n}
    if not melhor:
        return {}
    # O maior arquivo: e nele que o custo fixo de montar o indice se dilui e o
    # numero passa a descrever o cruzamento, e nao a preparacao.
    k = max(melhor, key=lambda x: melhor[x]["variantes"])
    return {"arquivo": k, **melhor[k]}


async def main():
    ap = argparse.ArgumentParser(description="Ganho de tempo: manual x plataforma")
    ap.add_argument("--amostra", type=int, default=15,
                    help="Variantes medidas de verdade nos dois caminhos")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--saida", default=str(AQUI / "resultados"))
    args = ap.parse_args()
    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)

    # `VARIANTS` sao rsIDs; a chamada manual precisa tambem de coordenada, que
    # mora em `VARIANT_COORDS`. As duas vem do mesmo conjunto padrao das suites
    # anteriores, para os numeros serem comparaveis entre as duas geracoes.
    base = [(rsid, *VARIANT_COORDS[rsid]) for rsid in VARIANTS]
    alvos = (base * ((args.amostra // len(base)) + 1))[:args.amostra]

    console.print("\n[bold]Ganho de tempo: a mao contra a plataforma[/bold]")
    console.print(f"  amostra medida de verdade: {len(alvos)} variantes\n")

    linhas = []
    async with httpx.AsyncClient() as client:
        for i, (rsid, chrom, pos, ref, alt) in enumerate(alvos, 1):
            t0 = time.perf_counter()
            try:
                await _manual_variant(client, rsid, chrom, pos, ref, alt)
                manual_ms = (time.perf_counter() - t0) * 1000
                manual_ok = True
            except Exception:
                manual_ms = (time.perf_counter() - t0) * 1000
                manual_ok = False

            plat_ms, plat_ok = await _plataforma(client, args.url, rsid)
            linhas.append({
                "rsid": rsid, "manual_ms": round(manual_ms, 1),
                "manual_ok": manual_ok, "plataforma_ms": round(plat_ms, 1),
                "plataforma_ok": plat_ok,
                "ganho": round(manual_ms / plat_ms, 2) if plat_ms else "",
            })
            console.print(f"  {i:>2}/{len(alvos)} {rsid:<14} "
                          f"a mao {manual_ms / 1000:6.2f} s   "
                          f"plataforma {plat_ms / 1000:6.2f} s")

    with (saida / "ganho_por_variante.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(linhas[0].keys()))
        w.writeheader()
        w.writerows(linhas)

    manuais = [l["manual_ms"] for l in linhas if l["manual_ok"]]
    plats = [l["plataforma_ms"] for l in linhas if l["plataforma_ok"]]
    if not manuais or not plats:
        console.print("[red]Sem medida valida suficiente[/red]")
        return

    med_manual = statistics.median(manuais)
    med_plat = statistics.median(plats)
    local = _custo_local_por_variante(saida)

    t = Table(title="Custo por variante")
    for c in ("Caminho", "Mediana", "Menor", "Maior", "O que faz"):
        t.add_column(c, justify="right" if c != "Caminho" and c != "O que faz" else "left")
    t.add_row("A mao, 4 consultas", f"{med_manual / 1000:.2f} s",
              f"{min(manuais) / 1000:.2f} s", f"{max(manuais) / 1000:.2f} s",
              "VEP, gnomAD, ClinVar e MyVariant, uma de cada vez")
    t.add_row("API do GenVar", f"{med_plat / 1000:.2f} s",
              f"{min(plats) / 1000:.2f} s", f"{max(plats) / 1000:.2f} s",
              "uma chamada, as quatro fontes consolidadas")
    if local:
        t.add_row("ClinVar embarcado", f"{local['ms_por_variante']:.4f} ms", "", "",
                  f"passada unica sobre {local['variantes']:,} variantes".replace(",", "."))
    console.print(t)

    # Projecao para as escalas do corpus, com a base declarada.
    #
    # A comparacao que interessa e MANUAL contra EMBARCADO, e nao manual contra
    # a API. Ninguem anota cem mil variantes chamando a API um rsID de cada vez:
    # a API existe para a consulta de UMA variante, e a anotacao em massa e o
    # que o ClinVar embarcado faz, numa passada, sem rede. Manter a coluna da
    # API na projecao convida a pergunta errada, entao ela sai daqui e fica
    # apenas na tabela por variante, que e onde ela responde alguma coisa.
    proj = []
    for n in (100, 1_000, 25_000, 100_000):
        p = {
            "variantes": n,
            "manual_horas": round(med_manual * n / 1000 / 3600, 2),
        }
        if local:
            p["embarcado_segundos"] = round(local["ms_por_variante"] * n / 1000, 3)
        proj.append(p)

    with (saida / "ganho_projecao.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(proj[0].keys()))
        w.writeheader()
        w.writerows(proj)

    t2 = Table(title="Projecao (extrapolada da mediana medida, nao medida nesta escala)")
    for c in ("Variantes", "A mao", "ClinVar embarcado"):
        t2.add_column(c, justify="right" if c != "Variantes" else "left")
    for p in proj:
        t2.add_row(f'{p["variantes"]:,}'.replace(",", "."),
                   f'{p["manual_horas"]:.1f} h',
                   f'{p.get("embarcado_segundos", 0):.1f} s' if local else "—")
    console.print(t2)
    # A razao entre as duas colunas e CONSTANTE por construcao, porque as duas
    # escalam linearmente com n. Repeti-la em cada linha da a impressao de um
    # resultado por escala onde ha um numero so.
    if local:
        razao = med_manual / local["ms_por_variante"]
        console.print(f"  [dim]Razao constante de {razao:,.0f}x".replace(",", ".")
                      + " por variante: as duas colunas escalam linearmente com n.[/dim]")
    console.print("  [dim]Nenhuma das duas foi medida nessas escalas: sao a mediana por "
                  "variante multiplicada. Medir 100 mil a mao levaria dias e bloquearia o "
                  "acesso do projeto as fontes.[/dim]")

    (saida / "ganho_resumo.json").write_text(json.dumps({
        "amostra": len(alvos),
        "manual_mediana_ms": round(med_manual, 1),
        "plataforma_mediana_ms": round(med_plat, 1),
        "ganho_api": round(med_manual / med_plat, 2),
        "embarcado": local,
    }, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
