"""Canonical MVP test set: 10 genes and 10 variants, shared by all benchmark suites
so the comparisons are standardized.

The 10 genes and 10 variants were chosen for full coverage across the five sources and
for clinical diversity (pathogenic, benign, conflicting and drug-response classifications).
Coordinates are GRCh38 (chrom, pos, ref, alt), matching the gnomad_r4 dataset used by the
backend; the previous hard-coded coordinates were GRCh37 and made the manual gnomAD calls
in the comparison/payload suites return nothing.
"""

GENES = [
    "MLH1", "HBB", "MSH2", "VHL", "LDLR",
    "RB1", "BRCA1", "TP53", "CFTR", "PAH",
]

VARIANTS = [
    "rs334", "rs1800562", "rs6025", "rs1799853", "rs429358",
    "rs1801133", "rs1042522", "rs5030858", "rs28929474", "rs121913529",
]

VARIANT_COORDS = {
    "rs334":       ("11", 5227002,   "T", "G"),  # HBB
    "rs1800562":   ("6",  26092913,  "G", "A"),  # HFE
    "rs6025":      ("1",  169549811, "C", "T"),  # F5
    "rs1799853":   ("10", 94942290,  "C", "T"),  # CYP2C9
    "rs429358":    ("19", 44908684,  "T", "C"),  # APOE
    "rs1801133":   ("1",  11796321,  "G", "C"),  # MTHFR
    "rs1042522":   ("17", 7676154,   "G", "T"),  # TP53
    "rs5030858":   ("12", 102840493, "G", "A"),  # PAH
    "rs28929474":  ("14", 94378610,  "C", "T"),  # SERPINA1
    "rs121913529": ("12", 25245350,  "C", "T"),  # KRAS
}
