#!/usr/bin/env python3
"""
Corpus de VCF para o benchmark da plataforma.

Doze arquivos, e a lista nao e arbitraria: cada um existe para exercitar um
caminho que os outros nao alcancam. Medir doze copias do mesmo arquivo em
tamanhos diferentes mede o parser e mais nada; o que decide se a plataforma
funciona e o que ela faz com arquivo torto, com build errado, com trio, com
multi-amostra e com formato comprimido.

  01-pequeno         1.000 variantes, limpo. Piso de tempo de toda funcao.
  02-medio          25.000 variantes. Painel de genes tipico.
  03-exoma         100.000 variantes. Escala de exoma clinico.
  04-grande        400.000 variantes. Teto declarado de leitura.
  05-acima-do-teto 600.000 variantes. O que acontece PASSANDO do teto.
  06-gz             25.000 comprimido. Caminho do DecompressionStream.
  07-zip            25.000 dentro de zip. Caminho do JSZip.
  08-grch37         25.000 em GRCh37. Cruzamento por coordenada precisa ser
                    DESLIGADO, e o por rsID precisa continuar.
  09-sem-build      25.000 sem cabecalho de build. Presuncao de GRCh38.
  10-trio           pai, mae e crianca com de novo e compostos plantados.
  11-ruim           balanco alelico torto, Ti/Tv baixo, metade reprovada.
  12-multiamostra   cinco amostras num arquivo so.

Semente fixa por arquivo: rodar duas vezes da byte por byte o mesmo conteudo,
que e o que permite a suite de reprodutibilidade afirmar alguma coisa.

Uso:
  python3 benchmark-final/corpus/gerar.py
  python3 benchmark-final/corpus/gerar.py --saida /outro/caminho
"""
import argparse
import gzip
import json
import random
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
GENES = RAIZ / "frontend/public/data/burden/genes.json"
CLINVAR = RAIZ / "frontend/public/data/clinvar"

# Fracao de cada arquivo tirada do PROPRIO ClinVar embarcado.
#
# Sem isto o corpus mede o caminho do ERRO e nada mais. Posicao sorteada nunca
# cai num registro do ClinVar, e `rs` sorteado num intervalo grande as vezes
# colide com um rsID que existe mas com outro alelo: medido na primeira versao,
# 400 mil variantes casaram 16 e DIVERGIRAM 58. Ou seja, o cruzamento estava
# sendo exercitado no ramo "rsID conhecido, alelo nao confere", e tudo a jusante
# (resumo clinico, ACMG, filtro por painel, e a largura das linhas exportadas)
# media o caso vazio.
#
# 8% e o numero de um exoma real depois do filtro de qualidade, na ordem de
# grandeza do que o ClinVar cobre de um exoma clinico. Nao e para o arquivo
# parecer um caso raro: e para as etapas seguintes terem o que fazer.
FRACAO_CLINVAR = 0.08

BASES = "ACGT"
TRANSICAO = {"A": "G", "G": "A", "C": "T", "T": "C"}

# Comprimento dos cromossomos em GRCh38, para a posicao sorteada cair dentro do
# contig que a linha declara. Fora disso o arquivo e sintaticamente valido e
# biologicamente impossivel, e ferramenta que confere contig rejeita tudo.
CONTIGS_38 = [
    ("1", 248956422), ("2", 242193529), ("3", 198295559), ("4", 190214555),
    ("5", 181538259), ("6", 170805979), ("7", 159345973), ("8", 145138636),
    ("9", 138394717), ("10", 133797422), ("11", 135086622), ("12", 133275309),
    ("13", 114364328), ("14", 107043718), ("15", 101991189), ("16", 90338345),
    ("17", 83257441), ("18", 80373285), ("19", 58617616), ("20", 64444167),
    ("21", 46709983), ("22", 50818468), ("X", 156040895), ("Y", 57227415),
]
# GRCh37 tem outros comprimentos, e usar os de 38 num arquivo que se declara 37
# seria plantar a incoerencia que o teste deveria pegar.
CONTIGS_37 = [
    ("1", 249250621), ("2", 243199373), ("3", 198022430), ("4", 191154276),
    ("5", 180915260), ("6", 171115067), ("7", 159138663), ("8", 146364022),
    ("9", 141213431), ("10", 135534747), ("11", 135006516), ("12", 133851895),
    ("13", 115169878), ("14", 107349540), ("15", 102531392), ("16", 90354753),
    ("17", 81195210), ("18", 78077248), ("19", 59128983), ("20", 63025520),
    ("21", 48129895), ("22", 51304566), ("X", 155270560), ("Y", 59373566),
]


def cabecalho(amostras, build="GRCh38", contigs=CONTIGS_38, notas=()):
    linhas = ["##fileformat=VCFv4.2", "##source=genvar-benchmark-v2"]
    if build:
        linhas.append(f"##reference={build}")
    for nome, tam in contigs:
        linhas.append(f"##contig=<ID={nome},length={tam}>")
    linhas += [
        '##FILTER=<ID=LowQual,Description="Baixa qualidade">',
        '##INFO=<ID=DP,Number=1,Type=Integer,Description="Profundidade">',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotipo">',
        '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Leituras por alelo">',
        '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Profundidade">',
        '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Qualidade do genotipo">',
    ]
    linhas += [f"##genvar_nota={n}" for n in notas]
    linhas.append("#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t"
                  + "\t".join(amostras))
    return "\n".join(linhas)


def _amostra(rng, gt, dp=None, ab=0.5):
    dp = dp or rng.randint(20, 80)
    if gt in ("0/1", "0|1", "1|0"):
        alt = max(1, round(dp * ab))
    elif gt in ("1/1", "1|1"):
        alt = round(dp * 0.98)
    else:
        alt = 0
    return f"{gt}:{dp - alt},{alt}:{dp}:{rng.randint(30, 99)}"


_CACHE_REAIS = {}


def reais_do_clinvar(camada="aviso", quantas=40_000, semente=99):
    """Variantes REAIS, tiradas das tabelas que o proprio site distribui.

    O formato e colunar e `posDelta` e cumulativo: reconstruir a posicao exige
    somar do comeco. E o mesmo caminho de leitura de `scripts/gera_vcf_exemplo.py`.
    """
    chave = (camada, quantas, semente)
    if chave in _CACHE_REAIS:
        return _CACHE_REAIS[chave]
    rng = random.Random(semente)
    fora = []
    por_chrom = max(1, quantas // 24)
    for chrom, _ in CONTIGS_38:
        arq = CLINVAR / f"{camada}-{chrom}.json.gz"
        if not arq.exists():
            continue
        with gzip.open(arq, "rt", encoding="utf-8") as fh:
            t = json.load(fh)
        n = t.get("n") or 0
        if not n:
            continue
        refs = t["ref"].split(",")
        alts = t["alt"].split(",")
        pos, acc = [], 0
        for d in t["posDelta"]:
            acc += d
            pos.append(acc)
        for i in rng.sample(range(n), min(por_chrom, n)):
            # Indel comprido vira linha gigante e distorce o tamanho do arquivo
            # sem acrescentar caminho de codigo novo.
            if len(refs[i]) > 20 or len(alts[i]) > 20:
                continue
            rs = t["rs"][i]
            fora.append((chrom, pos[i], refs[i], alts[i], f"rs{rs}" if rs else "."))
    rng.shuffle(fora)
    _CACHE_REAIS[chave] = fora
    return fora


def corpo(n, semente, contigs=CONTIGS_38, amostras=1, torto=False,
          fracao_real=FRACAO_CLINVAR):
    """n linhas de VCF. `torto` planta os defeitos de rotina.

    Uma fracao vem do ClinVar embarcado, para o cruzamento ter o que casar; o
    resto e sorteado, para o arquivo ter o fundo que um exoma tem. Devolve
    (texto, quantas_reais), e a contagem vai para o manifesto: corpus com taxa
    de casamento quebrada nao pode se ler como rodada boa.
    """
    rng = random.Random(semente)
    # Cruzar por coordenada so vale em GRCh38, e as tabelas embarcadas sao
    # GRCh38: plantar coordenada de 38 num arquivo que se declara 37 seria
    # plantar a incoerencia que o proprio teste deveria pegar. Em 37 as reais
    # entram assim mesmo, e o que sobrevive e o cruzamento por rsID, que
    # independe de build. E exatamente o caso que o arquivo 08 existe para medir.
    # O poco de reais e finito (o que a camada de aviso tem, amostrado por
    # cromossomo). Quando ele nao cobre a fracao pedida, a fracao EFETIVA cai, e
    # e ela que vai para o manifesto: prometer 8% e entregar 1% em silencio e o
    # mesmo erro de medicao de sempre, com outra roupa.
    reais = reais_do_clinvar() if fracao_real > 0 else []
    alvo_real = min(len(reais), int(n * fracao_real))
    indices_reais = set(rng.sample(range(n), alvo_real)) if alvo_real else set()
    prox_real = 0

    linhas = []
    for idx in range(n):
        if idx in indices_reais and prox_real < len(reais):
            chrom, pos, ref, alt, rsid = reais[prox_real]
            prox_real += 1
            filtro = "LowQual" if (torto and rng.random() < 0.5) else "PASS"
            qual = round(rng.uniform(3, 40) if torto else rng.uniform(30, 900), 1)
            campos = []
            for _ in range(amostras):
                gt = rng.choice(["0/1", "0/1", "1/1", "0/0"])
                ab = rng.uniform(0.05, 0.22) if (torto and rng.random() < 0.35) else 0.5
                campos.append(_amostra(rng, gt, ab=ab))
            linhas.append(f"{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t{qual}\t{filtro}\t"
                          f"DP={rng.randint(20, 90)}\tGT:AD:DP:GQ\t" + "\t".join(campos))
            continue
        chrom, tam = contigs[rng.randrange(len(contigs))]
        pos = rng.randint(10_000, tam - 10_000)
        ref = BASES[rng.randrange(4)]
        # 72% de transicao devolve Ti/Tv perto de 2,6, que e a faixa de exoma.
        # No arquivo torto a proporcao cai e a razao vai para perto de 0,9.
        troca = rng.random() < (0.30 if torto else 0.72)
        alt = TRANSICAO[ref] if troca else BASES[rng.randrange(4)]
        if alt == ref:
            alt = TRANSICAO[ref]
        rsid = f"rs{rng.randint(1_000, 99_999_999)}" if rng.random() < 0.86 else "."
        filtro = "LowQual" if (torto and rng.random() < 0.5) else "PASS"
        qual = round(rng.uniform(3, 40) if torto else rng.uniform(30, 900), 1)
        campos = []
        for _ in range(amostras):
            gt = rng.choice(["0/1", "0/1", "1/1", "0/0"])
            ab = rng.uniform(0.05, 0.22) if (torto and rng.random() < 0.35) else 0.5
            campos.append(_amostra(rng, gt, ab=ab))
        linhas.append(f"{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t{qual}\t{filtro}\t"
                      f"DP={rng.randint(20, 90)}\tGT:AD:DP:GQ\t" + "\t".join(campos))
    return "\n".join(linhas), prox_real


def trio(semente=11):
    """Trio com de novo e compostos plantados, e a contagem no cabecalho.

    A regra ingenua de de novo e uma fabrica de falso positivo: pai com tres
    leituras no sitio sai como referencia homozigota porque nenhuma das tres
    trouxe o alelo. Por isso oito sitios entram com cobertura parental baixa de
    proposito: eles NAO podem ser contados, e o numero de excluidos tem de sair
    junto do resultado.
    """
    rng = random.Random(semente)
    linhas = []
    de_novo, sem_cobertura, trans, cis, recessivas = 12, 8, 6, 4, 5

    def linha(chrom, pos, ref, alt, c, m, p, rsid="."):
        return (f"{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t500\tPASS\tDP=60\t"
                f"GT:AD:DP:GQ\t{c}\t{m}\t{p}")

    pos = 1_000_000
    for _ in range(de_novo):
        pos += 5_000
        linhas.append(linha("1", pos, "A", "G",
                            _amostra(rng, "0/1"), _amostra(rng, "0/0", dp=40),
                            _amostra(rng, "0/0", dp=40)))
    for _ in range(sem_cobertura):
        pos += 5_000
        # DP 3 nos dois pais: ausencia do alelo aqui nao e informacao.
        linhas.append(linha("1", pos, "C", "T",
                            _amostra(rng, "0/1"), _amostra(rng, "0/0", dp=3),
                            _amostra(rng, "0/0", dp=3)))
    for i in range(trans):
        pos += 5_000
        linhas.append(linha("2", pos, "G", "A", _amostra(rng, "0|1"),
                            _amostra(rng, "0/1"), _amostra(rng, "0/0", dp=40)))
        linhas.append(linha("2", pos + 300, "T", "C", _amostra(rng, "1|0"),
                            _amostra(rng, "0/0", dp=40), _amostra(rng, "0/1")))
    for i in range(cis):
        pos += 5_000
        linhas.append(linha("3", pos, "G", "T", _amostra(rng, "0|1"),
                            _amostra(rng, "0/1"), _amostra(rng, "0/0", dp=40)))
        linhas.append(linha("3", pos + 300, "A", "C", _amostra(rng, "0|1"),
                            _amostra(rng, "0/1"), _amostra(rng, "0/0", dp=40)))
    for _ in range(recessivas):
        pos += 5_000
        linhas.append(linha("4", pos, "C", "G", _amostra(rng, "1/1"),
                            _amostra(rng, "0/1"), _amostra(rng, "0/1")))
    # Fundo, para o arquivo nao ser so o que foi plantado.
    fundo, reais_no_fundo = corpo(4_000, semente + 1, amostras=3)
    notas = (
        f"de_novo={de_novo}", f"sem_cobertura_parental={sem_cobertura}",
        f"compostos_trans={trans}", f"compostos_cis={cis}",
        f"recessivas_homozigotas={recessivas}",
    )
    return (cabecalho(["crianca", "mae", "pai"], notas=notas) + "\n"
            + "\n".join(linhas) + "\n" + fundo + "\n"), reais_no_fundo


ARQUIVOS = []


def registrar(nome, fn, papel):
    ARQUIVOS.append((nome, fn, papel))


def _simples(n, semente, **kw):
    """Cabecalho mais corpo, propagando a contagem de variantes reais."""
    def fn():
        texto, reais = corpo(n, semente, contigs=kw.get("contigs", CONTIGS_38),
                             amostras=kw.get("amostras", 1),
                             torto=kw.get("torto", False))
        cab = cabecalho(kw.get("amostras_nomes", ["amostra"]),
                        build=kw.get("build", "GRCh38"),
                        contigs=kw.get("contigs", CONTIGS_38),
                        notas=kw.get("notas", ()))
        return cab + "\n" + texto + "\n", reais
    return fn


registrar("01-pequeno.vcf", _simples(1_000, 1), "piso de tempo")
registrar("02-medio.vcf", _simples(25_000, 2), "escala de painel")
registrar("03-exoma.vcf", _simples(100_000, 3), "escala de exoma")
registrar("04-grande.vcf", _simples(400_000, 4), "teto declarado")
registrar("05-acima-do-teto.vcf", _simples(600_000, 5), "passando do teto")
registrar("06-medio.vcf.gz", _simples(25_000, 6), "entrada comprimida")
registrar("07-medio.zip", _simples(25_000, 7), "entrada em zip")
registrar("08-grch37.vcf", _simples(25_000, 8, build="GRCh37", contigs=CONTIGS_37),
          "build antigo, cruzamento por coordenada desligado")
registrar("09-sem-build.vcf", _simples(25_000, 9, build=None), "build nao declarado, presumido")
registrar("10-trio.vcf", trio, "heranca com numeros plantados")
registrar("11-ruim.vcf", _simples(25_000, 11, torto=True, notas=("perfil=defeituoso",)),
          "controle de qualidade")
registrar("12-multiamostra.vcf",
          _simples(25_000, 12, amostras=5,
                   amostras_nomes=[f"amostra{i + 1}" for i in range(5)]),
          "cinco amostras num arquivo")


def main():
    ap = argparse.ArgumentParser(description="Gera o corpus do benchmark")
    ap.add_argument("--saida", default=str(Path(__file__).parent / "arquivos"))
    args = ap.parse_args()
    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)

    manifesto = []
    for nome, fn, papel in ARQUIVOS:
        texto, reais = fn()
        destino = saida / nome
        if nome.endswith(".gz"):
            # mtime fixo: o gzip grava a hora no cabecalho, e sem fixar isso
            # dois arquivos de conteudo identico saem com bytes diferentes e a
            # suite de reprodutibilidade acusa uma divergencia que nao existe.
            with gzip.GzipFile(filename="", mode="wb", fileobj=destino.open("wb"),
                               compresslevel=6, mtime=0) as fh:
                fh.write(texto.encode())
        elif nome.endswith(".zip"):
            with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
                info = zipfile.ZipInfo("amostra.vcf", date_time=(1980, 1, 1, 0, 0, 0))
                z.writestr(info, texto)
        else:
            destino.write_text(texto)
        n = sum(1 for l in texto.splitlines() if l and not l.startswith("#"))
        manifesto.append({
            "arquivo": nome, "papel": papel, "variantes": n,
            "bytes": destino.stat().st_size,
            "mb": round(destino.stat().st_size / 1048576, 3),
            # Quantas vieram do ClinVar embarcado. E o piso do que a anotacao
            # TEM de casar: se o executar.mjs reportar muito menos que isto, o
            # defeito e do cruzamento e nao do corpus.
            "reais_do_clinvar": reais,
            "fracao_real": round(reais / n, 4) if n else 0,
        })
        print(f"  {nome:24} {n:>8} variantes  {manifesto[-1]['mb']:>8.2f} MB"
              f"  {reais:>5} do ClinVar  {papel}")

    (saida / "manifesto.json").write_text(
        json.dumps(manifesto, ensure_ascii=False, indent=2) + "\n")
    total = sum(m["mb"] for m in manifesto)
    print(f"\n  {len(manifesto)} arquivos, {total:.1f} MB, em {saida}")


if __name__ == "__main__":
    main()
