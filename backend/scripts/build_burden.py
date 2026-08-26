"""ETL da camada de associacao por burden a partir de sumarios publicos.

Le resultados gene-based (formato SAIGE-GENE / Meta-SAIGE: uma linha por
gene x grupo x MAF, com Pvalue e BETA/SE do teste Burden e Pvalue dos testes
SKAT e SKAT-O) e gera os JSON colunares consumidos pelo frontend em
frontend/public/data/burden:

  - all_results.<ANC>.json : anc, n, pheno_idx, gene_idx, mask_idx, maf_idx,
    test_idx, lp (-log10 p), beta e SE (erro-padrao real do Burden).
  - phenotypes.json, biobanks.json : metadados (reaproveitados se ja existirem).
  - provenance.json : fonte, versao e data do release, para a UI mostrar
    "dados de <fonte>, atualizado em <data>".

A ORDEM das constantes abaixo e um contrato de fio com
frontend/src/burden/constants.js: os JSON usam indices inteiros nesses arrays.
Mantenha as duas listas identicas.

Entrada esperada (--input): um diretorio com um arquivo por fenotipo x
ancestria, nomeado <PHENO>.<ANC>.txt(.gz), ou um manifest.json que mapeie
arquivos para (pheno, anc). A referencia de genes (chr/start/end e a ordem do
eixo do Manhattan) vem de genes.json ja presente na saida, por padrao.

Rode onde a rede e aberta (o sandbox bloqueia o egress):

    python -m scripts.build_burden --input ./sumarios
    python -m scripts.build_burden --input ./sumarios --full \
        --source "Meta-analise multi-biobanco" --version v1 --date 2026-01-15

Este script NAO roda no sandbox; use a maquina local, a CI ou producao.
"""
import argparse
import csv
import gzip
import io
import json
import math
import re
from pathlib import Path

# --- Contrato de fio com frontend/src/burden/constants.js (nao reordenar) ---
ANCESTRIES = ["All", "EUR", "AFR", "AMR", "EAS", "SAS", "non_EUR"]
MASKS = [
    "pLoF",
    "damaging_missense_or_protein_altering",
    "other_missense_or_protein_altering",
    "synonymous",
    "pLoF;damaging_missense_or_protein_altering",
    "pLoF;damaging_missense_or_protein_altering;other_missense_or_protein_altering;synonymous",
]
MAFS = [0.001, 0.0001]
TESTS = ["Burden", "SKAT", "SKAT-O"]

# Piso do -log10(p): p abaixo do representavel vira este teto (mesma convencao
# do frontend). Sinais mais fracos que este limiar entram so no modo --full.
LP_FLOOR = 323.0
SAMPLE_LP_MIN = 4.0  # p <= 1e-4, para a amostra enxuta do repositorio

OUT_DEFAULT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "burden"

# Nomes de coluna do sumario. Ajuste aqui se o release usar outros rotulos.
COLS = {
    "gene": ["Region", "Gene", "gene", "GENE"],
    "group": ["Group", "annotation", "Annotation", "mask"],
    "maf": ["max_MAF", "maxMAF", "max_maf", "MAF"],
    "p_skato": ["Pvalue", "Pvalue_SKATO", "P_SKATO"],
    "p_burden": ["Pvalue_Burden", "P_Burden"],
    "p_skat": ["Pvalue_SKAT", "P_SKAT"],
    "beta": ["BETA_Burden", "Beta_Burden", "beta"],
    "se": ["SE_Burden", "Se_Burden", "se"],
}

# Aliases de grupo (mascara) que aparecem nos releases -> nossa forma canonica.
MASK_ALIAS = {
    "damaging_missense": "damaging_missense_or_protein_altering",
    "other_missense": "other_missense_or_protein_altering",
    "pLoF_damaging": "pLoF;damaging_missense_or_protein_altering",
}


def _open_text(path: Path):
    if path.suffix == ".gz":
        return io.TextIOWrapper(gzip.open(path, "rb"), encoding="utf-8")
    return open(path, "r", encoding="utf-8")


def _col(header, names):
    for n in names:
        if n in header:
            return n
    return None


def _to_float(v):
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _lp(p):
    if p is None or p <= 0:
        return LP_FLOOR
    return min(LP_FLOOR, -math.log10(p))


def _mask_index(group):
    g = (group or "").strip()
    g = MASK_ALIAS.get(g, g)
    return MASKS.index(g) if g in MASKS else None


def _maf_index(maf):
    f = _to_float(maf)
    if f is None:
        return None
    for i, m in enumerate(MAFS):
        if abs(f - m) < 1e-9:
            return i
    return None


def _iter_input_files(input_dir: Path):
    """Rende (pheno_id, anc, path). Usa manifest.json se existir, senao o
    padrao de nome <PHENO>.<ANC>.txt(.gz)."""
    manifest = input_dir / "manifest.json"
    if manifest.exists():
        m = json.loads(manifest.read_text(encoding="utf-8"))
        for entry in m.get("files", []):
            yield entry["pheno"], entry["anc"], input_dir / entry["file"]
        return
    pat = re.compile(r"^(?P<pheno>.+)\.(?P<anc>All|EUR|AFR|AMR|EAS|SAS|non_EUR)\.(txt|tsv)(\.gz)?$")
    for p in sorted(input_dir.iterdir()):
        mm = pat.match(p.name)
        if mm:
            yield mm.group("pheno"), mm.group("anc"), p


def _load_gene_index(out_dir: Path):
    """Mapa id/simbolo -> indice, a partir de genes.json ja presente na saida."""
    gp = out_dir / "genes.json"
    if not gp.exists():
        raise SystemExit(
            f"genes.json nao encontrado em {out_dir}. Gere ou copie a referencia "
            "de genes (ids, symbols, chr, start, end) antes de rodar o ETL."
        )
    g = json.loads(gp.read_text(encoding="utf-8"))
    by_id = {gid: i for i, gid in enumerate(g["ids"])}
    by_sym = {s: i for i, s in enumerate(g["symbols"])}
    return by_id, by_sym


def _pheno_index(out_dir: Path):
    pp = out_dir / "phenotypes.json"
    if not pp.exists():
        raise SystemExit(
            f"phenotypes.json nao encontrado em {out_dir}. Forneca a lista de "
            "fenotipos (id, name, category, type) na ordem canonica."
        )
    ph = json.loads(pp.read_text(encoding="utf-8"))["phenotypes"]
    return {p["id"]: i for i, p in enumerate(ph)}


def _rows_from_file(path: Path):
    """Rende (gene, mask_idx, maf_idx, test_idx, p, beta, se) por linha do
    sumario, explodindo cada linha nos tres testes (Burden, SKAT, SKAT-O)."""
    with _open_text(path) as fh:
        reader = csv.reader(fh, delimiter="\t")
        header = next(reader, None)
        if not header:
            return
        idx = {k: (header.index(_col(header, names)) if _col(header, names) else None)
               for k, names in COLS.items()}
        if idx["gene"] is None or idx["group"] is None or idx["maf"] is None:
            raise SystemExit(f"Colunas essenciais ausentes em {path.name}: {header}")
        for row in reader:
            if len(row) <= max(v for v in idx.values() if v is not None):
                continue
            mi = _mask_index(row[idx["group"]])
            fi = _maf_index(row[idx["maf"]])
            if mi is None or fi is None:
                continue
            gene = row[idx["gene"]]
            beta = _to_float(row[idx["beta"]]) if idx["beta"] is not None else None
            se = _to_float(row[idx["se"]]) if idx["se"] is not None else None
            beta = beta if beta is not None else 0.0
            se = se if (se is not None and se > 0) else None
            # Burden, SKAT, SKAT-O compartilham beta/se do Burden (efeito de
            # exibicao); o que muda entre eles e o p-valor.
            for ti, key in ((0, "p_burden"), (1, "p_skat"), (2, "p_skato")):
                ci = idx[key]
                if ci is None:
                    continue
                p = _to_float(row[ci])
                if p is None:
                    continue
                yield gene, mi, fi, ti, p, beta, se


def build(input_dir: Path, out_dir: Path, full: bool, sample_min: float):
    by_id, by_sym = _load_gene_index(out_dir)
    pheno_idx = _pheno_index(out_dir)

    # Acumula por ancestria as colunas do all_results.
    cols = {a: {k: [] for k in ("pheno_idx", "gene_idx", "mask_idx", "maf_idx",
                                "test_idx", "lp", "beta", "se")} for a in ANCESTRIES}
    counts = {a: 0 for a in ANCESTRIES}
    skipped_gene = 0
    lp_min = LP_FLOOR if full else sample_min

    for pheno_id, anc, path in _iter_input_files(input_dir):
        if anc not in cols:
            continue
        pi = pheno_idx.get(pheno_id)
        if pi is None:
            print(f"Aviso: fenotipo desconhecido '{pheno_id}' ({path.name}); ignorado.")
            continue
        for gene, mi, fi, ti, p, beta, se in _rows_from_file(path):
            gi = by_id.get(gene)
            if gi is None:
                gi = by_sym.get(gene)
            if gi is None:
                skipped_gene += 1
                continue
            lp = _lp(p)
            if lp < lp_min:
                continue
            c = cols[anc]
            c["pheno_idx"].append(pi)
            c["gene_idx"].append(gi)
            c["mask_idx"].append(mi)
            c["maf_idx"].append(fi)
            c["test_idx"].append(ti)
            c["lp"].append(round(lp, 2))
            c["beta"].append(round(beta, 6))
            # se real quando disponivel; None deixa o frontend reconstruir de beta+p.
            c["se"].append(round(se, 6) if se is not None else None)
            counts[anc] += 1

    written = []
    for anc in ANCESTRIES:
        c = cols[anc]
        payload = {"anc": anc, "n": counts[anc], **c}
        # Se nenhuma linha tem se real, omite a coluna (frontend reconstroi).
        if all(v is None for v in c["se"]):
            payload.pop("se", None)
        outp = out_dir / f"all_results.{anc}.json"
        outp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        written.append((anc, counts[anc]))

    if skipped_gene:
        print(f"Aviso: {skipped_gene} linhas ignoradas por gene fora de genes.json.")
    return written


def write_provenance(out_dir: Path, source: str, version: str, date: str, full: bool):
    prov = {
        "source": source or "Sumarios publicos de burden (gene-based)",
        "version": version or "",
        "date": date or "",
        "scope": "completo" if full else "amostra (p <= 1e-4)",
    }
    (out_dir / "provenance.json").write_text(
        json.dumps(prov, ensure_ascii=False, indent=1), encoding="utf-8")
    return prov


def main():
    ap = argparse.ArgumentParser(description="ETL de burden -> JSON colunar")
    ap.add_argument("--input", required=True, help="diretorio com os sumarios gene-based")
    ap.add_argument("--out", default=str(OUT_DEFAULT), help="saida (default: public/data/burden)")
    ap.add_argument("--full", action="store_true", help="inclui todos os genes (nao so p<=1e-4)")
    ap.add_argument("--sample-min", type=float, default=SAMPLE_LP_MIN, help="-log10(p) minimo da amostra")
    ap.add_argument("--source", default="", help="nome da fonte publica")
    ap.add_argument("--version", default="", help="versao do release")
    ap.add_argument("--date", default="", help="data do release (YYYY-MM-DD)")
    args = ap.parse_args()

    input_dir = Path(args.input)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    written = build(input_dir, out_dir, args.full, args.sample_min)
    prov = write_provenance(out_dir, args.source, args.version, args.date, args.full)

    total = sum(n for _, n in written)
    print(f"Gerado all_results por ancestria em {out_dir} ({total} linhas): "
          + ", ".join(f"{a}={n}" for a, n in written))
    print(f"provenance.json: {prov}")


if __name__ == "__main__":
    main()
