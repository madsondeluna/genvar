import re
from fastapi import HTTPException


GENE_SYMBOL_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9\-\.]{0,49}$")
RSID_PATTERN = re.compile(r"^rs\d+$", re.IGNORECASE)


def validate_gene_symbol(symbol: str) -> str:
    clean = symbol.strip().upper()
    if not GENE_SYMBOL_PATTERN.match(clean):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid gene symbol: '{symbol}'. Expected HGNC format (e.g. BRCA1, TP53).",
        )
    return clean


def validate_rsid(rsid: str) -> str:
    clean = rsid.strip().lower()
    if not RSID_PATTERN.match(clean):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid variant ID: '{rsid}'. Expected dbSNP rs ID (e.g. rs429358).",
        )
    return clean


def classify_clinical_significance(sig: str) -> str:
    if not sig:
        return "unknown"
    s = sig.lower()
    if "pathogenic" in s and "likely" not in s and "conflicting" not in s:
        return "pathogenic"
    if "likely pathogenic" in s:
        return "pathogenic"
    if "benign" in s and "likely" not in s and "conflicting" not in s:
        return "benign"
    if "likely benign" in s:
        return "benign"
    if "uncertain" in s or "vus" in s:
        return "vus"
    if "conflicting" in s:
        return "vus"
    return "other"
