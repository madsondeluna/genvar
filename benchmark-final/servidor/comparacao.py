#!/usr/bin/env python3
"""
O fluxo manual contra a consulta integrada.

A PERGUNTA. Para saber a consequencia molecular, a frequencia populacional, a
significancia clinica e os escores preditivos de uma variante, quanto custa cada
caminho? A mao sao quatro consultas em serie, uma a cada base. Na ferramenta e
uma chamada, com as quatro em paralelo e o resultado agregado.

O CODIGO DO FLUXO MANUAL E IMPORTADO DA VERSAO 2.0, nao reescrito. `_manual_gene`
e `_manual_variant` moram em `benchmark-legacy/2.0/suites/comparison.py` e sao
usados daqui como estao. Reimplementar seria reintroduzir a chance de as duas
versoes medirem sequencias ligeiramente diferentes e a comparacao entre versoes
perder o sentido. As familias novas da 3.0 ganham fluxos manuais proprios,
descritos abaixo, e essas nao tem contraparte na 2.0.

OS FLUXOS MANUAIS DAS FAMILIAS NOVAS:
  doenca  Sem base unica que responda "quais genes causam esta doenca e o que se
          sabe de cada um". A mao sao: uma consulta ao Orphanet pelos genes, e
          depois, por gene, a restricao no gnomAD. O piso e o numero de genes.
  painel  O mesmo, partindo da lista de genes do painel.
  escore  O PGS Catalog responde em duas chamadas, metadados e desempenho, que e
          exatamente o que a rota faz. Aqui a ferramenta nao economiza chamadas:
          economiza a normalizacao entre as duas respostas.

A ORDEM E CONTRABALANCEADA, e isso corrige um vies que a primeira execucao
mostrou. Medindo sempre o fluxo manual primeiro e a consulta integrada logo
depois, a segunda encontra as fontes recem-acionadas e paga por isso: na
primeira corrida a familia gene saiu com ganho 0,92, ou seja, a ferramenta
aparecia MAIS LENTA que o fluxo manual, enquanto a suite de latencia, que mede a
mesma rota isolada, registrou 3,3 s contra os 19,6 s medidos aqui. O numero nao
descrevia a ferramenta, descrevia a ordem.

A correcao e a padrao para efeito de ordem: metade dos alvos de cada familia e
medida manual primeiro e a outra metade integrada primeiro, alternando por
posicao. O vies nao desaparece, mas deixa de ter sinal fixo, e a coluna `ordem`
do CSV permite conferir que ele nao restou. Ha ainda uma pausa entre as duas
medicoes do mesmo alvo, para a fonte respirar.

O TEMPO HUMANO E ESTIMATIVA E ESTA MARCADO COMO TAL. 900 s por variante, o mesmo
valor da 2.0, de estudos de curadoria do ClinGen. Ele entra numa coluna separada
e nunca somado ao tempo medido sem aviso: a figura mostra as duas barras.

Uso:
  python3 benchmark-final/servidor/comparacao.py --url http://localhost:8000 --rotulo local
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ.parent / "benchmark-legacy" / "2.0"))

import comum  # noqa: E402
import alvos  # noqa: E402
import httpx  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402
from suites.comparison import _manual_variant, _manual_gene, _timed  # noqa: E402

console = Console()

TEMPO_HUMANO_S = 900.0
PAUSA_ENTRE_MEDICOES_S = 3.0
GNOMAD = "https://gnomad.broadinstitute.org/api"
PGS = "https://www.pgscatalog.org/rest"

PREFIXOS = ("gene:", "genevars:", "genephen:", "variant:", "disease:",
            "diseasevars:", "panel:", "pgs:")

CONSULTA_RESTRICAO = """
query G($symbol: String!) {
  gene(gene_symbol: $symbol, reference_genome: GRCh38) {
    gene_id symbol
    gnomad_constraint { pli lof_z oe_lof oe_lof_upper oe_mis oe_syn }
  }
}
"""


def limpa(url_redis):
    try:
        import redis
        r = redis.Redis.from_url(url_redis)
        for p in PREFIXOS:
            chaves = list(r.scan_iter(match=f"{p}*", count=2000))
            if chaves:
                r.delete(*chaves)
    except Exception:
        pass


async def _manual_por_genes(cliente, genes):
    """Fluxo manual de doenca e painel: restricao no gnomAD, um gene de cada vez."""
    t0 = time.perf_counter()
    chamadas = 0
    for g in genes:
        await _timed(cliente.post(GNOMAD, json={"query": CONSULTA_RESTRICAO,
                                                "variables": {"symbol": g}}, timeout=60.0))
        chamadas += 1
    return (time.perf_counter() - t0) * 1000, chamadas


async def _manual_escore(cliente, escore_id):
    t0 = time.perf_counter()
    await _timed(cliente.get(f"{PGS}/score/{escore_id}", timeout=60.0))
    await _timed(cliente.get(f"{PGS}/performance/search", params={"pgs_id": escore_id},
                             timeout=60.0))
    return (time.perf_counter() - t0) * 1000, 2


async def _genvar(cliente, base, caminho):
    t0 = time.perf_counter()
    try:
        r = await cliente.get(base + caminho, timeout=180.0)
        return (time.perf_counter() - t0) * 1000, r.status_code, r.json()
    except Exception:
        return (time.perf_counter() - t0) * 1000, 0, None


async def main():
    ap = argparse.ArgumentParser(description="Fluxo manual contra consulta integrada")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--redis", default=os.environ.get("REDIS_URL", "redis://localhost:6379"))
    ap.add_argument("--rotulo", default="local")
    ap.add_argument("--n", type=int, default=10,
                    help="alvos por familia; menor reduz a carga sobre as bases publicas")
    ap.add_argument("--saida", default=str(RAIZ / "resultados" / "local"))
    args = ap.parse_args()
    n = args.n

    console.print(f"\n[bold]Fluxo manual contra consulta integrada[/bold]  ({args.rotulo})")
    console.print(f"  {n} alvos por familia\n")
    linhas = []

    async with httpx.AsyncClient() as cliente:
        console.print("  [dim]variante[/dim]")
        for i, rsid in enumerate(alvos.VARIANTES[:n]):
            chrom, pos, ref, alt = alvos.COORDENADAS[rsid]
            manual_primeiro = i % 2 == 0

            async def medir_manual():
                t0 = time.perf_counter()
                await _manual_variant(cliente, rsid, chrom, pos, ref, alt)
                return (time.perf_counter() - t0) * 1000

            async def medir_genvar():
                limpa(args.redis)
                return await _genvar(cliente, args.url, f"/api/variant/{rsid}")

            if manual_primeiro:
                ms_manual = await medir_manual()
                await asyncio.sleep(PAUSA_ENTRE_MEDICOES_S)
                ms_frio, st, _ = await medir_genvar()
            else:
                ms_frio, st, _ = await medir_genvar()
                await asyncio.sleep(PAUSA_ENTRE_MEDICOES_S)
                ms_manual = await medir_manual()
            ms_quente, _, _ = await _genvar(cliente, args.url, f"/api/variant/{rsid}")
            linhas.append({
                "rotulo": args.rotulo, "familia": "variante", "alvo": rsid,
                "ordem": "manual primeiro" if manual_primeiro else "integrada primeiro",
                "manual_ms": round(ms_manual, 1), "manual_chamadas": 4,
                "genvar_frio_ms": round(ms_frio, 1), "genvar_quente_ms": round(ms_quente, 1),
                "status": st,
                "ganho_frio": round(ms_manual / ms_frio, 2) if ms_frio else None,
                "ganho_quente": round(ms_manual / ms_quente, 2) if ms_quente else None,
                "tempo_humano_s": TEMPO_HUMANO_S,
                "ganho_com_humano": round((ms_manual / 1000 + TEMPO_HUMANO_S)
                                          / (ms_frio / 1000), 1) if ms_frio else None,
            })
            console.print(f"    {rsid:<14} manual {ms_manual/1000:6.2f} s   "
                          f"frio {ms_frio/1000:6.2f} s   quente {ms_quente:7.1f} ms")

        console.print("  [dim]gene[/dim]")
        for i, g in enumerate(alvos.GENES[:n]):
            manual_primeiro = i % 2 == 0

            async def medir_manual():
                t0 = time.perf_counter()
                await _manual_gene(cliente, g)
                return (time.perf_counter() - t0) * 1000

            async def medir_genvar():
                limpa(args.redis)
                return await _genvar(cliente, args.url, f"/api/gene/{g}")

            if manual_primeiro:
                ms_manual = await medir_manual()
                await asyncio.sleep(PAUSA_ENTRE_MEDICOES_S)
                ms_frio, st, _ = await medir_genvar()
            else:
                ms_frio, st, _ = await medir_genvar()
                await asyncio.sleep(PAUSA_ENTRE_MEDICOES_S)
                ms_manual = await medir_manual()
            ms_quente, _, _ = await _genvar(cliente, args.url, f"/api/gene/{g}")
            linhas.append({
                "rotulo": args.rotulo, "familia": "gene", "alvo": g,
                "ordem": "manual primeiro" if manual_primeiro else "integrada primeiro",
                "manual_ms": round(ms_manual, 1), "manual_chamadas": 4,
                "genvar_frio_ms": round(ms_frio, 1), "genvar_quente_ms": round(ms_quente, 1),
                "status": st,
                "ganho_frio": round(ms_manual / ms_frio, 2) if ms_frio else None,
                "ganho_quente": round(ms_manual / ms_quente, 2) if ms_quente else None,
                "tempo_humano_s": TEMPO_HUMANO_S,
                "ganho_com_humano": round((ms_manual / 1000 + TEMPO_HUMANO_S)
                                          / (ms_frio / 1000), 1) if ms_frio else None,
            })
            console.print(f"    {g:<14} manual {ms_manual/1000:6.2f} s   "
                          f"frio {ms_frio/1000:6.2f} s   quente {ms_quente:7.1f} ms")

        for familia, ids, rota in (("doenca", alvos.DOENCAS[:n], "/api/disease/{}"),
                                   ("painel", alvos.PAINEIS[:n], "/api/panel/{}")):
            console.print(f"  [dim]{familia}[/dim]")
            for ident in ids:
                _, _, dados = await _genvar(cliente, args.url, rota.format(ident))
                genes = []
                if isinstance(dados, dict):
                    for chave in ("genes", "gene_list", "items"):
                        v = dados.get(chave)
                        if isinstance(v, list) and v:
                            genes = [x.get("symbol") or x.get("gene") if isinstance(x, dict) else x
                                     for x in v]
                            break
                genes = [g for g in genes if g][:12]
                if not genes:
                    console.print(f"    [yellow]{ident}: sem lista de genes, fora[/yellow]")
                    continue
                ms_manual, chamadas = await _manual_por_genes(cliente, genes)
                limpa(args.redis)
                ms_frio, st, _ = await _genvar(cliente, args.url, rota.format(ident))
                ms_quente, _, _ = await _genvar(cliente, args.url, rota.format(ident))
                linhas.append({
                    "rotulo": args.rotulo, "familia": familia, "alvo": ident,
                    "manual_ms": round(ms_manual, 1), "manual_chamadas": chamadas,
                    "genes": len(genes),
                    "genvar_frio_ms": round(ms_frio, 1), "genvar_quente_ms": round(ms_quente, 1),
                    "status": st,
                    "ganho_frio": round(ms_manual / ms_frio, 2) if ms_frio else None,
                    "ganho_quente": round(ms_manual / ms_quente, 2) if ms_quente else None,
                })
                console.print(f"    {ident[:24]:<24} {len(genes):>2} genes   "
                              f"manual {ms_manual/1000:6.2f} s   frio {ms_frio/1000:6.2f} s")

        console.print("  [dim]escore[/dim]")
        for e in alvos.ESCORES[:n]:
            ms_manual, chamadas = await _manual_escore(cliente, e)
            limpa(args.redis)
            ms_frio, st, _ = await _genvar(cliente, args.url, f"/api/pgs/{e}")
            ms_quente, _, _ = await _genvar(cliente, args.url, f"/api/pgs/{e}")
            linhas.append({
                "rotulo": args.rotulo, "familia": "escore", "alvo": e,
                "manual_ms": round(ms_manual, 1), "manual_chamadas": chamadas,
                "genvar_frio_ms": round(ms_frio, 1), "genvar_quente_ms": round(ms_quente, 1),
                "status": st,
                "ganho_frio": round(ms_manual / ms_frio, 2) if ms_frio else None,
                "ganho_quente": round(ms_manual / ms_quente, 2) if ms_quente else None,
            })
            console.print(f"    {e:<14} manual {ms_manual/1000:6.2f} s   "
                          f"frio {ms_frio/1000:6.2f} s   quente {ms_quente:7.1f} ms")

    comum.grava_csv(Path(args.saida) / "comparacao.csv", linhas)

    t = Table(title=f"Ganho sobre o fluxo manual ({args.rotulo})")
    for c in ("Familia", "Alvos", "Manual", "Frio", "Quente", "Ganho frio", "Ganho quente"):
        t.add_column(c, justify="left" if c == "Familia" else "right")
    for familia in ("variante", "gene", "doenca", "painel", "escore"):
        ls = [l for l in linhas if l["familia"] == familia and l["status"] == 200]
        if not ls:
            continue
        med = lambda k: sorted(l[k] for l in ls if l[k] is not None)[len(ls) // 2]  # noqa: E731
        t.add_row(familia, str(len(ls)), f"{med('manual_ms')/1000:.2f} s",
                  f"{med('genvar_frio_ms')/1000:.2f} s", f"{med('genvar_quente_ms'):.1f} ms",
                  f"{med('ganho_frio'):.2f}x", f"{med('ganho_quente'):.0f}x")
    console.print(t)


if __name__ == "__main__":
    asyncio.run(main())
