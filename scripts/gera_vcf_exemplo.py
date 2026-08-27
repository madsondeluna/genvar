#!/usr/bin/env python3
"""Gera um VCF de mundo ideal para testar o modulo de anotacao.

O arquivo real de teste (NIST, GIAB) e GRCh37 e nao declara nada alem da
referencia: serve para exercitar o caminho degradado, em que o cruzamento com
genes fica desligado. Este aqui exercita o caminho completo, e por isso cada
coisa que o parser le esta presente e correta:

  - VCFv4.3 com ##reference e ##contig assembly=GRCh38 (o build vem declarado,
    nao deduzido pelo comprimento do cromossomo 1)
  - contigs com os comprimentos GRCh38, na ordem canonica
  - FILTER=PASS em toda linha, QUAL alto, DP e GQ presentes
  - um nucleo de variantes REAIS do ClinVar (coordenada, rsID, REF e ALT como
    o NCBI publica), para que o cruzamento por rsID e o por coordenada tenham
    os dois o que devolver, e o relatorio saia com achado de verdade
  - o resto sorteado DENTRO de genes reais do conjunto que a pagina carrega
  - Ti/Tv alvo 2.1, que o valor esperado de exoma humano e a faixa que a propria pagina usa como referencia

Semente fixa: rodar duas vezes da o mesmo arquivo.
"""
import json
import random
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GENES = RAIZ / 'frontend/public/data/burden/genes.json'
SAIDA = RAIZ / 'frontend/public/exemplo-grch38.vcf'
CLINVAR = RAIZ / 'frontend/public/data/clinvar'

# Quantas variantes reais do ClinVar entram, por camada. Numeros pequenos de
# proposito: um exoma real tem poucas patogenicas e muitas benignas, e um
# arquivo de exemplo que invertesse isso ensinaria a ler errado.
DO_CLINVAR = {'aviso': 40, 'incerta': 260, 'benigna': 700}

# GRCh38.p14, sequencias primarias.
CONTIGS = [
    ('1', 248956422), ('2', 242193529), ('3', 198295559), ('4', 190214555),
    ('5', 181538259), ('6', 170805979), ('7', 159345973), ('8', 145138636),
    ('9', 138394717), ('10', 133797422), ('11', 135086622), ('12', 133275309),
    ('13', 114364328), ('14', 107043718), ('15', 101991189), ('16', 90338345),
    ('17', 83257441), ('18', 80373285), ('19', 58617616), ('20', 64444167),
    ('21', 46709983), ('22', 50818468), ('X', 156040895), ('Y', 57227415),
    ('MT', 16569),
]
ORDEM = {c: i for i, (c, _) in enumerate(CONTIGS)}

BASES = 'ACGT'
TRANSICAO = {'A': 'G', 'G': 'A', 'C': 'T', 'T': 'C'}
N_VARIANTES = 6000
FRACAO_INDEL = 0.12
TITV = 3.0

rng = random.Random(20260827)


def transversao(ref):
    return rng.choice([b for b in BASES if b != ref and b != TRANSICAO[ref]])


def do_clinvar():
    """Amostra variantes reais dos turnos que o proprio site distribui."""
    import gzip as gz
    fora = []
    for camada, quantas in DO_CLINVAR.items():
        por_chrom = max(1, quantas // 24)
        for chrom in [c for c, _ in CONTIGS if c != 'MT']:
            arq = CLINVAR / f'{camada}-{chrom}.json.gz'
            if not arq.exists():
                continue
            with gz.open(arq, 'rt') as fh:
                t = json.load(fh)
            n = t['n']
            if not n:
                continue
            refs = t['ref'].split(',')
            alts = t['alt'].split(',')
            # posDelta e cumulativo: reconstruir a posicao exige somar do inicio.
            pos = []
            acc = 0
            for d in t['posDelta']:
                acc += d
                pos.append(acc)
            escolhidos = rng.sample(range(n), min(por_chrom, n))
            for i in escolhidos:
                if len(refs[i]) > 20 or len(alts[i]) > 20:
                    continue
                rs = t['rs'][i]
                fora.append((chrom, pos[i], refs[i], alts[i],
                             f'rs{rs}' if rs else '.', t['genes'][t['geneIdx'][i]]))
    return fora


def main():
    g = json.loads(GENES.read_text())
    genes = [
        (s, c, ini, fim)
        for s, c, ini, fim in zip(g['symbols'], g['chr'], g['start'], g['end'])
        if c in ORDEM and fim - ini > 2000
    ]

    # Ti/Tv 2.1 significa 21 transicoes para 10 transversoes.
    p_transicao = TITV / (1 + TITV)

    reais = do_clinvar()
    print(f'{len(reais)} variantes reais do ClinVar entraram no exemplo')

    linhas = []
    for i in range(N_VARIANTES + len(reais)):
        real = reais[i] if i < len(reais) else None
        if real:
            chrom, pos, ref, alt, rsid, simbolo = real
            tipo = 'SNV' if len(ref) == 1 and len(alt) == 1 else ('INS' if len(alt) > len(ref) else 'DEL')
        else:
            simbolo, chrom, ini, fim = genes[rng.randrange(len(genes))]
            pos = rng.randint(ini + 1, fim - 1)
            ref = rng.choice(BASES)
            rsid = f'rs{9_000_000 + i * 7}'

        if real:
            pass
        elif rng.random() < FRACAO_INDEL:
            # Indel curto, sempre com a base ancora que o formato exige.
            n = rng.choice([1, 1, 1, 2, 2, 3, 4, 6])
            cauda = ''.join(rng.choice(BASES) for _ in range(n))
            if rng.random() < 0.5:
                ref, alt, tipo = ref, ref + cauda, 'INS'
            else:
                ref, alt, tipo = ref + cauda, ref, 'DEL'
        else:
            alt = TRANSICAO[ref] if rng.random() < p_transicao else transversao(ref)
            tipo = 'SNV'

        # Zigosidade: exoma tipico fica perto de 2 heterozigotos por homozigoto
        # alternativo, e o alelo materno/paterno vem fasado.
        het = rng.random() < 0.66
        gt = rng.choice(['0|1', '1|0']) if het else '1|1'
        dp = max(12, int(rng.gauss(52, 14)))
        # Cobertura balanceada no heterozigoto, quase toda alternativa no homo.
        alt_reads = int(dp * (rng.gauss(0.50, 0.05) if het else rng.gauss(0.98, 0.015)))
        alt_reads = min(dp, max(1, alt_reads))
        ad = f'{dp - alt_reads},{alt_reads}'
        gq = min(99, max(30, int(rng.gauss(85, 12))))
        qual = round(min(4000, max(120, rng.gauss(900, 350))), 1)
        pl = '0,0,0'
        if het:
            pl = f'{int(qual)},0,{int(qual)}'
        else:
            pl = f'{int(qual)},{gq},0'

        info = f'DP={dp};AF={alt_reads / dp:.3f};TIPO={tipo};GENE={simbolo}'
        linhas.append((
            ORDEM[chrom], pos,
            f'{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t{qual}\tPASS\t{info}'
            f'\tGT:AD:DP:GQ:PL\t{gt}:{ad}:{dp}:{gq}:{pl}'
        ))

    linhas.sort(key=lambda t: (t[0], t[1]))

    cab = [
        '##fileformat=VCFv4.3',
        '##fileDate=20260827',
        '##source=genvar-exemplo-v1',
        '##reference=file:///ref/GRCh38.p14/GCA_000001405.29_GRCh38.p14_genomic.fna',
        '##phasing=full',
    ]
    cab += [f'##contig=<ID={c},length={n},assembly=GRCh38,species="Homo sapiens">'
            for c, n in CONTIGS]
    cab += [
        '##FILTER=<ID=PASS,Description="Passou em todos os filtros">',
        '##INFO=<ID=DP,Number=1,Type=Integer,Description="Profundidade combinada">',
        '##INFO=<ID=AF,Number=A,Type=Float,Description="Fracao do alelo alternativo">',
        '##INFO=<ID=TIPO,Number=1,Type=String,Description="SNV, INS ou DEL">',
        '##INFO=<ID=GENE,Number=1,Type=String,Description="Simbolo do gene que contem a posicao">',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotipo">',
        '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Leituras por alelo">',
        '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Profundidade da amostra">',
        '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Qualidade do genotipo">',
        '##FORMAT=<ID=PL,Number=G,Type=Integer,Description="Verossimilhanca em escala Phred">',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tAMOSTRA-IDEAL',
    ]

    SAIDA.write_text('\n'.join(cab + [l[2] for l in linhas]) + '\n')
    print(f'{SAIDA}: {len(linhas)} variantes, {SAIDA.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
