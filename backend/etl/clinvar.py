#!/usr/bin/env python3
"""ClinVar -> tabela de anotacao clinica que o navegador consulta sem rede.

Fonte: clinvar.vcf.gz do NCBI, GRCh38. Um arquivo so, ja normalizado em
POS/REF/ALT, e com tudo que o relatorio precisa: CLNSIG (classificacao),
CLNREVSTAT (nivel de revisao), CLNDN (condicao), GENEINFO, MC (consequencia
molecular), RS (dbSNP) e tres frequencias populacionais herdadas (ESP, ExAC,
1000 Genomes).

DUAS CHAVES, e a razao de serem duas esta medida. O NIST/GIAB de teste e
GRCh37: cruzar coordenada GRCh38 contra ele nao erra por pouco, troca o gene
(1.847.983 bases de deslocamento so no BRCA1). Mas 96% das variantes dele tem
rsID, e rsID independe de build. Entao:

  - chave primaria  rsID + REF + ALT
  - chave secundaria  cromossomo + POS + REF + ALT, so para GRCh38

REF e ALT entram nas DUAS chaves de proposito. Um rsID agrupa um sitio, nao um
alelo: rs1801133 tem alelos com classificacoes diferentes, e casar so pelo
numero imprimiria "patogenica" para quem carrega o alelo benigno. Quando o
rsID casa e o alelo nao, o dado sai como "rsID conhecido, alelo nao confere",
que e informacao; o outro caminho seria um laudo errado com cara de certo.

Saida em colunas, uma pasta por camada e um arquivo por cromossomo, porque
carregar 4,4 milhoes de linhas de uma vez nao e opcao no navegador:

  clinvar/aviso-<chr>.json   patogenica, provavelmente patogenica, conflitante,
                             resposta a farmaco e fator de risco
  clinvar/incerta-<chr>.json variante de significado incerto (VUS)
  clinvar/benigna-<chr>.json benigna e provavelmente benigna

A pagina carrega SEMPRE a camada de aviso dos cromossomos presentes no arquivo
do usuario, e as outras duas so quando ele pede.
"""
import gzip
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
ENTRADA = Path(__file__).parent / ".cache" / "clinvar" / "clinvar.vcf.gz"
SAIDA = RAIZ / "frontend" / "public" / "data" / "clinvar"

# Escala de estrelas do ClinVar. E o unico numero que separa "tres laboratorios
# concordam" de "um enviou e ninguem conferiu", e um laudo que nao mostra isso
# trata as duas coisas como a mesma.
ESTRELAS = {
    "practice_guideline": 4,
    "reviewed_by_expert_panel": 3,
    "criteria_provided,_multiple_submitters,_no_conflicts": 2,
    "criteria_provided,_conflicting_classifications": 1,
    "criteria_provided,_single_submitter": 1,
    "no_assertion_criteria_provided": 0,
    "no_classification_provided": 0,
    "no_classifications_from_unflagged_records": 0,
    "no_classification_for_the_single_variant": 0,
}

# Codigo numerico da classificacao. O rotulo em portugues mora no frontend:
# aqui vai o codigo, que nao muda de tamanho nem de idioma.
SIG = {
    "Pathogenic": 1,
    "Likely_pathogenic": 2,
    "Pathogenic/Likely_pathogenic": 3,
    "Conflicting_classifications_of_pathogenicity": 4,
    "Uncertain_significance": 5,
    "Benign": 6,
    "Likely_benign": 7,
    "Benign/Likely_benign": 8,
    "drug_response": 9,
    "risk_factor": 10,
    "association": 11,
    "protective": 12,
    "Uncertain_risk_allele": 5,
    "Likely_risk_allele": 10,
}
AVISO = {1, 2, 3, 4, 9, 10, 11, 12}
INCERTA = {5}
BENIGNA = {6, 7, 8}

CAMADA = {"aviso": AVISO, "incerta": INCERTA, "benigna": BENIGNA}

CROMOSSOMOS = [str(i) for i in range(1, 23)] + ["X", "Y", "MT"]

# Consequencia molecular do Sequence Ontology, encurtada. O campo MC vem como
# "SO:0001583|missense_variant".
CONSEQ = {
    "missense_variant": 1, "synonymous_variant": 2, "nonsense": 3,
    "frameshift_variant": 4, "splice_donor_variant": 5, "splice_acceptor_variant": 6,
    "intron_variant": 7, "5_prime_UTR_variant": 8, "3_prime_UTR_variant": 9,
    "inframe_deletion": 10, "inframe_insertion": 11, "initiator_codon_variant": 12,
    "stop_lost": 13, "non-coding_transcript_variant": 14, "genic_upstream_transcript_variant": 15,
    "genic_downstream_transcript_variant": 16, "no_sequence_alteration": 17,
    "inframe_indel": 18,
}

RE_INFO = re.compile(r"([^=;]+)=([^;]*)")


def info(campo):
    return dict(RE_INFO.findall(campo))


def main():
    if not ENTRADA.exists():
        sys.exit(f"falta {ENTRADA}: baixe clinvar.vcf.gz do NCBI primeiro")
    SAIDA.mkdir(parents=True, exist_ok=True)

    # Um acumulador por (camada, cromossomo).
    acc = {(c, k): [] for c in CAMADA for k in CROMOSSOMOS}
    lidos = 0
    guardados = 0
    versao = None

    with gzip.open(ENTRADA, "rt") as fh:
        for linha in fh:
            if linha.startswith("##"):
                if linha.startswith("##fileDate=") and versao is None:
                    versao = linha.strip().split("=", 1)[1]
                continue
            if linha.startswith("#"):
                continue
            lidos += 1
            campos = linha.rstrip("\n").split("\t")
            if len(campos) < 8:
                continue
            chrom, pos, _id, ref, alt = campos[0], campos[1], campos[2], campos[3], campos[4]
            if chrom not in CROMOSSOMOS or alt in (".", ""):
                continue
            # Alelo longo nao serve para casar com VCF de chamada curta e
            # dominaria o arquivo em bytes: 200 bases numa linha de 30.
            if len(ref) > 60 or len(alt) > 60:
                continue

            d = info(campos[7])
            sig = SIG.get(d.get("CLNSIG", ""))
            if sig is None:
                continue
            camada = next((c for c, conj in CAMADA.items() if sig in conj), None)
            if camada is None:
                continue

            rs = d.get("RS", "")
            rs = int(rs.split("|")[0]) if rs.split("|")[0].isdigit() else 0
            estrelas = ESTRELAS.get(d.get("CLNREVSTAT", ""), 0)
            gene = (d.get("GENEINFO", "") or "").split(":")[0].split("|")[0]
            cond = (d.get("CLNDN", "") or "").split("|")[0].replace("_", " ")
            if cond in ("not provided", "not specified", ""):
                cond = ""
            mc = d.get("MC", "")
            conseq = 0
            if mc:
                nome = mc.split("|")[-1].split(",")[0]
                conseq = CONSEQ.get(nome, 0)
            # Tres frequencias herdadas. A melhor disponivel vence, na ordem de
            # tamanho de coorte: ExAC (60k), 1000 Genomes (2,5k), ESP (6,5k).
            af = None
            for k in ("AF_EXAC", "AF_TGP", "AF_ESP"):
                if d.get(k):
                    try:
                        af = float(d[k])
                        break
                    except ValueError:
                        pass

            acc[(camada, chrom)].append(
                (int(pos), ref, alt, rs, sig, estrelas, gene, cond, conseq, af)
            )
            guardados += 1
            if lidos % 500_000 == 0:
                print(f"  {lidos:,} lidas, {guardados:,} guardadas", flush=True)

    total_bytes = 0
    indice = {}
    for (camada, chrom), linhas in sorted(acc.items()):
        if not linhas:
            continue
        linhas.sort(key=lambda t: (t[0], t[1], t[2]))

        genes, gidx = [], {}
        conds, cidx = [], {}
        pos_delta, anterior = [], 0
        refs, alts, rss, sigs, revs, gs, cs, mcs, afs = [], [], [], [], [], [], [], [], []
        for pos, ref, alt, rs, sig, est, gene, cond, conseq, af in linhas:
            pos_delta.append(pos - anterior)
            anterior = pos
            refs.append(ref); alts.append(alt); rss.append(rs)
            sigs.append(sig); revs.append(est); mcs.append(conseq)
            if gene not in gidx:
                gidx[gene] = len(genes); genes.append(gene)
            gs.append(gidx[gene])
            if cond not in cidx:
                cidx[cond] = len(conds); conds.append(cond)
            cs.append(cidx[cond])
            afs.append(round(af, 6) if af is not None else -1)

        obj = {
            "chrom": chrom, "camada": camada, "n": len(linhas),
            "posDelta": pos_delta,
            "ref": ",".join(refs), "alt": ",".join(alts),
            "rs": rss, "sig": sigs, "rev": revs, "mc": mcs, "af": afs,
            "geneIdx": gs, "genes": genes,
            "condIdx": cs, "conds": conds,
        }
        # Gravado comprimido, e nao por economia de disco: 157 MB de JSON cru
        # entram no repositorio e no artefato publicado, 28 MB comprimidos nao.
        # O navegador desfaz com DecompressionStream, que o modulo de VCF ja usa
        # para ler .vcf.gz, entao nenhuma dependencia nova entra por isto.
        arq = SAIDA / f"{camada}-{chrom}.json.gz"
        with gzip.open(arq, "wt", compresslevel=9, encoding="utf-8") as out:
            json.dump(obj, out, separators=(",", ":"), ensure_ascii=False)
        total_bytes += arq.stat().st_size
        indice.setdefault(camada, {})[chrom] = len(linhas)
        print(f"  {arq.name}: {len(linhas):,} linhas, {arq.stat().st_size/1e6:.1f} MB", flush=True)

    (SAIDA / "index.json").write_text(json.dumps({
        "fonte": "ClinVar (NCBI)",
        "url": "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz",
        "build": "GRCh38",
        "versao": versao,
        "licenca": "dominio publico (NCBI)",
        "camadas": indice,
        "sig": {v: k for k, v in SIG.items()},
        "conseq": {v: k for k, v in CONSEQ.items()},
        "formato": "JSON em colunas, comprimido em gzip; o navegador desfaz com DecompressionStream",
        "frequencia": "AF_EXAC, senao AF_TGP, senao AF_ESP; -1 quando nenhuma existe",
    }, ensure_ascii=False, indent=1))

    print(f"lidas {lidos:,}, guardadas {guardados:,}, {total_bytes/1e6:.0f} MB em disco")


if __name__ == "__main__":
    main()
