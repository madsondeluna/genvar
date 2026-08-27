#!/usr/bin/env python3
"""Fixtures de VCF com defeito e com estrutura conhecidos.

O exemplo de mundo ideal nao serve para testar nada disto, e a razao esta na
propria geracao dele: o balanco alelico e construido com heterozigoto em 0,50 e
homozigoto em 0,98, entao nenhuma linha desvia nunca; a fase e sorteada entre
`0|1` e `1|0`, entao qualquer leitura de fase produz um resultado confiante e
inventado; e ha uma amostra so, entao trio nao existe.

Aqui os defeitos e as estruturas sao COLOCADOS, com a posicao anotada no
cabecalho, para o teste poder afirmar o numero esperado em vez de conferir que
"parece razoavel":

  trio-grch38.vcf       pai, mae e crianca. 12 de novo verdadeiros, 8 sitios com
                        cobertura parental insuficiente (que NAO podem ser
                        contados como de novo), 6 compostos em trans, 4 em cis,
                        5 recessivas homozigotas herdadas dos dois lados
  ruim-grch38.vcf       heterozigoto com balanco alelico torto, Ti/Tv de
                        variante nova em ~0,9, metade sem passar no filtro
  feminino-grch38.vcf   perfil XX: X heterozigoto, nenhum Y
  masculino-grch38.vcf  perfil XY: X hemizigoto, com Y

Semente fixa: rodar duas vezes da os mesmos arquivos.
"""
import json
import random
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GENES = RAIZ / 'frontend/public/data/burden/genes.json'
SAIDA = RAIZ / 'frontend/public/fixtures'

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

# Regioes pseudoautossomicas do X em GRCh38. Variante ali nao serve para inferir
# sexo, porque nelas o XY tambem e diploide.
PAR_X = [(10001, 2781479), (155701383, 156030895)]

rng = random.Random(20260827)


def transversao(ref):
    return rng.choice([b for b in BASES if b != ref and b != TRANSICAO[ref]])


def cabecalho(amostras, notas=()):
    linhas = [
        '##fileformat=VCFv4.3',
        '##fileDate=20260827',
        '##source=genvar-fixture-v1',
        '##reference=file:///ref/GRCh38.p14/GCA_000001405.29_GRCh38.p14_genomic.fna',
    ]
    linhas += [f'##genvar_esperado={n}' for n in notas]
    linhas += [f'##contig=<ID={c},length={n},assembly=GRCh38,species="Homo sapiens">'
               for c, n in CONTIGS]
    linhas += [
        '##FILTER=<ID=PASS,Description="Passou em todos os filtros">',
        '##FILTER=<ID=LowQual,Description="Qualidade abaixo do corte">',
        '##FILTER=<ID=StrandBias,Description="Desequilibrio de fita">',
        '##INFO=<ID=DP,Number=1,Type=Integer,Description="Profundidade combinada">',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotipo">',
        '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Leituras por alelo">',
        '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Profundidade da amostra">',
        '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Qualidade do genotipo">',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t' + '\t'.join(amostras),
    ]
    return linhas


def amostra(gt, dp, ab=None, gq=None):
    """Monta um campo de amostra coerente: AD que reproduz o AB pedido."""
    if gt in ('0/0', '0|0'):
        alt = 0
    elif gt in ('1/1', '1|1'):
        alt = round(dp * (ab if ab is not None else 0.98))
    else:
        alt = round(dp * (ab if ab is not None else rng.gauss(0.50, 0.05)))
    alt = max(0, min(dp, alt))
    if gt not in ('0/0', '0|0') and alt == 0:
        alt = 1
    gq = gq if gq is not None else min(99, max(20, int(rng.gauss(80, 12))))
    return f'{gt}:{dp - alt},{alt}:{dp}:{gq}'


def linha(chrom, pos, ref, alt, campos, rsid='.', filtro='PASS', qual=None):
    q = qual if qual is not None else round(max(50, rng.gauss(800, 250)), 1)
    return (ORDEM[chrom], pos,
            f'{chrom}\t{pos}\t{rsid}\t{ref}\t{alt}\t{q}\t{filtro}\tDP=60\t'
            f'GT:AD:DP:GQ\t' + '\t'.join(campos))


def genes_utilizaveis():
    g = json.loads(GENES.read_text())
    return [(s, c, ini, fim)
            for s, c, ini, fim in zip(g['symbols'], g['chr'], g['start'], g['end'])
            if c in ORDEM and c not in ('X', 'Y', 'MT') and fim - ini > 20000]


def escrever(nome, amostras, linhas, notas):
    linhas.sort(key=lambda t: (t[0], t[1]))
    texto = '\n'.join(cabecalho(amostras, notas) + [l[2] for l in linhas]) + '\n'
    (SAIDA / nome).write_text(texto)
    print(f'{nome}: {len(linhas)} variantes, {len(texto)/1024:.0f} KB')


# --- trio ---------------------------------------------------------------------

def trio(genes):
    """Pai, mae e crianca, com de novo e compostos colocados de proposito."""
    N_DENOVO, N_SEM_COBERTURA = 12, 8
    N_TRANS, N_CIS, N_RECESSIVAS = 6, 4, 5
    N_FUNDO = 3000

    linhas = []
    usados = set()

    def sitio(gene=None):
        while True:
            s, c, ini, fim = gene or genes[rng.randrange(len(genes))]
            pos = rng.randint(ini + 1000, fim - 1000)
            if (c, pos) not in usados:
                usados.add((c, pos))
                return s, c, pos

    def snv():
        ref = rng.choice(BASES)
        return ref, (TRANSICAO[ref] if rng.random() < 0.75 else transversao(ref))

    # Fundo herdado: a crianca carrega o que veio dos pais.
    for _ in range(N_FUNDO):
        _s, c, pos = sitio()
        ref, alt = snv()
        gm = rng.choice(['0/0', '0/1', '0/1', '1/1'])
        gp = rng.choice(['0/0', '0/1', '0/1', '1/1'])
        if gm == '0/0' and gp == '0/0':
            continue
        # Genotipo da crianca por transmissao mendeliana simples.
        def alelo(g):
            return rng.choice(g.split('/'))
        gc = '/'.join(sorted([alelo(gm), alelo(gp)]))
        if gc == '0/0':
            continue
        dp = max(15, int(rng.gauss(55, 12)))
        linhas.append(linha(c, pos, ref, alt, [
            amostra(gc, dp), amostra(gm, max(15, int(rng.gauss(55, 12)))),
            amostra(gp, max(15, int(rng.gauss(55, 12)))),
        ]))

    # De novo verdadeiros: pais com referencia homozigota E boa cobertura.
    for _ in range(N_DENOVO):
        _s, c, pos = sitio()
        ref, alt = snv()
        linhas.append(linha(c, pos, ref, alt, [
            amostra('0/1', 60), amostra('0/0', 45), amostra('0/0', 48),
        ]))

    # Sitios que PARECEM de novo e nao podem ser contados: pais com 4 e 5
    # leituras, abaixo do piso. Nao se sabe se os pais tem.
    for _ in range(N_SEM_COBERTURA):
        _s, c, pos = sitio()
        ref, alt = snv()
        linhas.append(linha(c, pos, ref, alt, [
            amostra('0/1', 55), amostra('0/0', 4), amostra('0/0', 5),
        ]))

    # Composto em trans: uma variante de cada lado, no mesmo gene.
    for _ in range(N_TRANS):
        g = genes[rng.randrange(len(genes))]
        _s, c, p1 = sitio(g)
        _s, _c, p2 = sitio(g)
        r1, a1 = snv(); r2, a2 = snv()
        linhas.append(linha(c, p1, r1, a1, [
            amostra('0/1', 58), amostra('0/1', 52), amostra('0/0', 50)]))
        linhas.append(linha(c, p2, r2, a2, [
            amostra('0/1', 56), amostra('0/0', 51), amostra('0/1', 54)]))

    # Composto em cis: as duas do MESMO lado. Parece composto e nao e, porque a
    # outra copia do gene esta intacta.
    for _ in range(N_CIS):
        g = genes[rng.randrange(len(genes))]
        _s, c, p1 = sitio(g)
        _s, _c, p2 = sitio(g)
        r1, a1 = snv(); r2, a2 = snv()
        for pos, r, a in ((p1, r1, a1), (p2, r2, a2)):
            linhas.append(linha(c, pos, r, a, [
                amostra('0/1', 57), amostra('0/1', 53), amostra('0/0', 49)]))

    # Recessiva homozigota: cada pai carrega uma copia.
    for _ in range(N_RECESSIVAS):
        _s, c, pos = sitio()
        ref, alt = snv()
        linhas.append(linha(c, pos, ref, alt, [
            amostra('1/1', 62), amostra('0/1', 55), amostra('0/1', 58)]))

    escrever('trio-grch38.vcf', ['CRIANCA', 'MAE', 'PAI'], linhas, [
        f'de_novo_verdadeiros={N_DENOVO}',
        f'sitios_sem_cobertura_parental={N_SEM_COBERTURA}',
        f'compostos_em_trans={N_TRANS}',
        f'compostos_em_cis={N_CIS}',
        f'recessivas_homozigotas={N_RECESSIVAS}',
        'ordem_das_amostras=crianca,mae,pai',
    ])


# --- arquivo ruim -------------------------------------------------------------

def ruim(genes):
    """Defeitos reais de rotina, cada um em quantidade conhecida."""
    N = 4000
    FRACAO_AB_TORTO = 0.30
    FRACAO_REPROVADA = 0.45

    linhas = []
    ab_tortos = 0
    reprovadas = 0
    for i in range(N):
        s, c, ini, fim = genes[rng.randrange(len(genes))]
        pos = rng.randint(ini + 1, fim - 1)
        ref = rng.choice(BASES)

        # Ti/Tv de variante nova propositalmente ruim: quase metade transversao.
        conhecida = rng.random() < 0.55
        p_ti = 0.75 if conhecida else 0.47
        alt = TRANSICAO[ref] if rng.random() < p_ti else transversao(ref)
        rsid = f'rs{4_000_000 + i * 3}' if conhecida else '.'

        gt = '0/1' if rng.random() < 0.7 else '1/1'
        dp = max(6, int(rng.gauss(28, 12)))
        ab = None
        if gt == '0/1' and rng.random() < FRACAO_AB_TORTO:
            ab = rng.choice([rng.uniform(0.05, 0.22), rng.uniform(0.78, 0.95)])
            ab_tortos += 1

        filtro = 'PASS'
        if rng.random() < FRACAO_REPROVADA:
            filtro = rng.choice(['LowQual', 'StrandBias'])
            reprovadas += 1

        linhas.append(linha(c, pos, ref, alt, [amostra(gt, dp, ab)],
                            rsid=rsid, filtro=filtro,
                            qual=round(rng.uniform(20, 120), 1)))

    escrever('ruim-grch38.vcf', ['AMOSTRA-RUIM'], linhas, [
        f'heterozigotos_com_ab_torto={ab_tortos}',
        f'reprovadas_no_filtro={reprovadas}',
        'titv_de_variante_nova=proximo_de_0.9',
    ])


# --- perfis de sexo -----------------------------------------------------------

def sexo(genes, perfil):
    """XX ou XY, pelos dois sinais que a inferencia usa."""
    linhas = []
    # Fundo autossomico, para o arquivo parecer um exoma e nao um cromossomo solto.
    for _ in range(800):
        s, c, ini, fim = genes[rng.randrange(len(genes))]
        pos = rng.randint(ini + 1, fim - 1)
        ref = rng.choice(BASES)
        alt = TRANSICAO[ref]
        linhas.append(linha(c, pos, ref, alt, [amostra(rng.choice(['0/1', '1/1']), 55)]))

    # X fora das regioes pseudoautossomicas.
    for _ in range(260):
        pos = rng.randint(3_000_000, 155_000_000)
        if any(a <= pos <= b for a, b in PAR_X):
            continue
        ref = rng.choice(BASES)
        alt = TRANSICAO[ref]
        if perfil == 'feminino':
            gt = '0/1' if rng.random() < 0.62 else '1/1'
        else:
            # XY tem uma copia so: o chamador reporta homozigoto.
            gt = '1/1'
        linhas.append(linha('X', pos, ref, alt, [amostra(gt, 50)]))

    if perfil == 'masculino':
        for _ in range(40):
            pos = rng.randint(2_800_000, 26_000_000)
            ref = rng.choice(BASES)
            linhas.append(linha('Y', pos, ref, TRANSICAO[ref], [amostra('1/1', 30)]))

    escrever(f'{perfil}-grch38.vcf', [f'AMOSTRA-{perfil.upper()}'], linhas, [
        f'sexo_esperado={"XX" if perfil == "feminino" else "XY"}',
    ])


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    genes = genes_utilizaveis()
    trio(genes)
    ruim(genes)
    sexo(genes, 'feminino')
    sexo(genes, 'masculino')


if __name__ == '__main__':
    main()
