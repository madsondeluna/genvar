import asyncio
import httpx
from typing import Dict, Any, List, Optional
from fastapi import HTTPException


BASE_URL = "https://rest.ensembl.org"
# Ensembl REST requires Accept, not Content-Type, for response negotiation
HEADERS = {"Accept": "application/json"}
TIMEOUT = 30.0
# Ensembl REST is intermittently flaky (transient 5xx and 429 rate limits); a single hiccup
# should not blank the whole gene page, so transient failures are retried with backoff.
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES = 3


async def _ensembl_get(
    client: httpx.AsyncClient, url: str, *, params: dict | None = None, timeout: float = TIMEOUT
) -> httpx.Response:
    response = None
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(url, headers=HEADERS, timeout=timeout, params=params)
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == MAX_RETRIES - 1:
                raise
            await asyncio.sleep(0.5 * 2 ** attempt)
            continue
        if response.status_code in RETRY_STATUSES and attempt < MAX_RETRIES - 1:
            retry_after = response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 0.5 * 2 ** attempt
            await asyncio.sleep(min(delay, 5.0))
            continue
        return response
    return response


async def get_gene_info(gene_symbol: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/lookup/symbol/homo_sapiens/{gene_symbol}"
        response = await _ensembl_get(client, url)

        if response.status_code == 400:
            raise HTTPException(status_code=404, detail=f"Gene not found: {gene_symbol}")

        response.raise_for_status()
        data = response.json()

        return {
            "gene_id": data.get("id"),
            "gene_symbol": data.get("display_name"),
            "description": data.get("description"),
            "chromosome": data.get("seq_region_name"),
            "start": data.get("start"),
            "end": data.get("end"),
            "strand": data.get("strand"),
            "biotype": data.get("biotype"),
            "assembly_name": data.get("assembly_name"),
        }


async def get_gene_variants(gene_id: str, limit: int | None = None) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/overlap/id/{gene_id}"
        # feature=variation must be a query param, not embedded in the URL string
        response = await _ensembl_get(client, url, params={"feature": "variation"}, timeout=60.0)

        if response.status_code == 404:
            return []

        response.raise_for_status()
        variants = response.json()

        # clinical_significance and start come inline in the overlap response, so the full
        # set is available without per-variant enrichment. Returning all of them lets the
        # router compute representative counts and a positional distribution over the whole
        # gene instead of the 5'-most slice. limit is kept for callers that want a cap.
        return variants[:limit] if limit else variants


def _transcript_rank(t: Dict[str, Any]) -> tuple:
    """Canônico do Ensembl primeiro (coincide com o MANE Select na maioria dos genes
    codificantes desde a release 110), depois protein_coding, depois o mais longo."""
    return (
        1 if t.get("is_canonical") == 1 else 0,
        1 if t.get("biotype") == "protein_coding" else 0,
        (t.get("end") or 0) - (t.get("start") or 0),
    )


async def get_canonical_exons(gene_id: str) -> Dict[str, Any]:
    """Éxons do transcrito canônico do gene, para o mapa de variantes por éxon."""
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/lookup/id/{gene_id}"
        response = await _ensembl_get(client, url, params={"expand": 1}, timeout=60.0)

        if response.status_code in (400, 404):
            return {}

        response.raise_for_status()
        data = response.json()

        transcripts = data.get("Transcript") or []
        if not transcripts:
            return {}

        best = max(transcripts, key=_transcript_rank)
        exons = sorted(
            (
                {"start": e["start"], "end": e["end"]}
                for e in best.get("Exon") or []
                if e.get("start") and e.get("end")
            ),
            key=lambda e: e["start"],
        )
        if not exons:
            return {}

        return {
            "transcript_id": best.get("id"),
            "is_canonical": best.get("is_canonical") == 1,
            "exons": exons,
        }


def _tc_rank(tc: Dict[str, Any]) -> tuple:
    """Rank transcript consequences so the canonical protein_coding one with scores wins.

    Avoids picking a random transcript's SIFT/PolyPhen for a multi-transcript gene; the
    MANE/canonical transcript is the standard reference for clinical reporting.
    """
    return (
        1 if tc.get("mane_select") else 0,
        1 if tc.get("canonical") == 1 else 0,
        1 if tc.get("biotype") == "protein_coding" else 0,
        1 if tc.get("sift_score") is not None else 0,
        1 if tc.get("polyphen_score") is not None else 0,
    )


def _consequence_from_tc(tc: Dict[str, Any], vep: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten one VEP transcript_consequence into the fields the variant route consumes."""
    aa_change = None
    aa = tc.get("amino_acids")
    if aa:
        pos = tc.get("protein_start", "")
        aa_change = f"p.{aa.replace('/', str(pos))}" if pos else aa
    return {
        "gene_symbol": tc.get("gene_symbol"),
        "gene_id": tc.get("gene_id"),
        "consequence": (tc.get("consequence_terms") or [vep.get("most_severe_consequence", "unknown")])[0],
        "sift_score": tc.get("sift_score"),
        "sift_prediction": tc.get("sift_prediction"),
        "polyphen_score": tc.get("polyphen_score"),
        "polyphen_prediction": tc.get("polyphen_prediction"),
        "amino_acid_change": aa_change,
        "protein_id": tc.get("transcript_id"),
    }


async def get_vep_annotation(rsid: str) -> Optional[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/vep/human/id/{rsid}"
        # canonical/mane flags let _tc_rank prefer the MANE Select / canonical transcript
        # instead of an arbitrary protein_coding one when a gene has many transcripts.
        response = await _ensembl_get(
            client, url, params={"content-type": "application/json", "canonical": 1, "mane": 1}
        )

        if response.status_code in (400, 404):
            return None

        response.raise_for_status()
        results = response.json()

        if not results:
            return None

        vep = results[0]
        transcript_consequences = vep.get("transcript_consequences", [])

        # VEP returns a consequence block per alternate allele. For a multi-allelic rsID
        # (e.g. rs334 = T/A/C/G) each alt has its own SIFT/PolyPhen/amino-acid change, so we
        # keep the best block PER allele. The caller resolves which alt to display and reads
        # the matching block from consequences_by_allele; a single global "best" would risk
        # showing the prediction of one allele next to the frequencies of another.
        best_by_allele: Dict[str, Dict[str, Any]] = {}
        for tc in transcript_consequences:
            allele = tc.get("variant_allele")
            if allele is None:
                continue
            cur = best_by_allele.get(allele)
            if cur is None or _tc_rank(tc) > _tc_rank(cur):
                best_by_allele[allele] = tc

        consequences_by_allele = {
            allele: _consequence_from_tc(tc, vep) for allele, tc in best_by_allele.items()
        }

        # colocated_variants not used (CADD/REVEL require VEP plugins not enabled here)
        _ = vep.get("colocated_variants", [])

        # Parse alleles from allele_string like "T/C" or multi-allelic "T/A/C/G".
        # The first token is the reference; every later token is a candidate alternate.
        allele_parts = [p for p in vep.get("allele_string", "/").split("/") if p]
        ref_allele = allele_parts[0] if allele_parts else "N"
        alt_alleles = allele_parts[1:] if len(allele_parts) > 1 else ["N"]

        # Default block: the first alt that has a consequence, used until the caller resolves
        # the displayed allele and overrides with the matching block.
        default_cons = next(
            (consequences_by_allele[a] for a in alt_alleles if a in consequences_by_allele), {}
        )

        result = {
            "variant_id": vep.get("id"),
            "chromosome": vep.get("seq_region_name"),
            "position": vep.get("start"),
            "allele_string": vep.get("allele_string", "/"),
            "most_severe_consequence": vep.get("most_severe_consequence"),
            "consequence": vep.get("most_severe_consequence", "unknown"),
            "ref_allele": ref_allele,
            "alt_allele": alt_alleles[0],
            "alt_alleles": alt_alleles,
            "consequences_by_allele": consequences_by_allele,
            "gene_symbol": None,
            "gene_id": None,
            "sift_score": None,
            "sift_prediction": None,
            "polyphen_score": None,
            "polyphen_prediction": None,
            "amino_acid_change": None,
            "protein_id": None,
            **default_cons,
        }

        return result


# Fontes de associacao gene-doenca com curadoria manual; tudo mais (ClinVar por
# variante, HGMD, dbGaP) fica de fora do painel mendeliano.
MENDELIAN_SOURCES = {"MIM morbid", "Orphanet", "GenCC", "G2P", "DDG2P"}

# Termos HPO de modo de heranca que a curadoria Orphanet embute nas acessoes
# ontologicas de cada doenca. So mapeamos os modos classicos e inequivocos.
HP_INHERITANCE = {
    "HP:0000006": "autossômica dominante",
    "HP:0000007": "autossômica recessiva",
    "HP:0001417": "ligada ao X",
    "HP:0001419": "ligada ao X recessiva",
    "HP:0001423": "ligada ao X dominante",
    "HP:0001427": "mitocondrial",
    "HP:0001450": "ligada ao Y",
    "HP:0001426": "multifatorial",
}


def _display_case(description: str) -> str:
    """MIM morbid vem em caixa alta; rebaixa sem tocar no que ja esta misto."""
    if description.isupper():
        return description.capitalize()
    return description


async def get_gene_diseases(gene_symbol: str) -> List[Dict[str, Any]]:
    """Associacoes gene-doenca com curadoria clinica (OMIM, Orphanet, GenCC, G2P),
    agregadas pelo Ensembl. Sem include_associated: o payload por variante e pesado
    demais (dezenas de milhares de entradas ClinVar) e o GWAS vem do proprio catalogo."""
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/phenotype/gene/homo_sapiens/{gene_symbol}"
        # Este endpoint do Ensembl oscila entre 2 s e ~100 s para o mesmo gene.
        # Tentativa unica com timeout longo: com os retries de 30 s o total
        # passava de 90 s e o painel caia por timeout mesmo com o dado vindo.
        response = await client.get(url, headers=HEADERS, timeout=100.0)

        if response.status_code in (400, 404):
            return []

        response.raise_for_status()
        entries = response.json()

    mendelian: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        if e.get("source") not in MENDELIAN_SOURCES:
            continue
        description = (e.get("description") or "").strip()
        if not description:
            continue
        key = description.lower()
        item = mendelian.setdefault(
            key,
            {
                "description": _display_case(description),
                "sources": [],
                "omim_id": None,
                "orphanet_id": None,
                "inheritance": [],
            },
        )
        source = e.get("source")
        if source not in item["sources"]:
            item["sources"].append(source)
        for acc in e.get("ontology_accessions") or []:
            mode = HP_INHERITANCE.get(acc)
            if mode and mode not in item["inheritance"]:
                item["inheritance"].append(mode)
            if acc.startswith("Orphanet:") and not item["orphanet_id"]:
                item["orphanet_id"] = acc.split(":", 1)[1]
        if source == "MIM morbid" and not item["omim_id"]:
            ext = (e.get("attributes") or {}).get("external_id")
            if ext and str(ext).isdigit():
                item["omim_id"] = str(ext)

    def _rank(item: Dict[str, Any]) -> tuple:
        # OMIM/Orphanet primeiro (curadoria clinica classica), depois GenCC/G2P
        classic = "MIM morbid" in item["sources"] or "Orphanet" in item["sources"]
        return (0 if classic else 1, item["description"].lower())

    return sorted(mendelian.values(), key=_rank)


async def get_cytogenetic_context(chromosome: str, start: int, end: int) -> Dict[str, Any]:
    """Banda(s) citogenetica(s) que o gene ocupa e o comprimento do cromossomo,
    para o painel posicional do mapa cromossomico."""
    async with httpx.AsyncClient() as client:
        band_url = f"{BASE_URL}/overlap/region/human/{chromosome}:{start}-{end}"
        assembly_url = f"{BASE_URL}/info/assembly/homo_sapiens/{chromosome}"
        band_resp, assembly_resp = await asyncio.gather(
            _ensembl_get(client, band_url, params={"feature": "band"}),
            _ensembl_get(client, assembly_url),
        )

    cytobands: List[str] = []
    if band_resp is not None and band_resp.status_code == 200:
        for b in band_resp.json():
            band_id = b.get("id")
            if band_id and band_id not in cytobands:
                cytobands.append(band_id)

    chromosome_length = None
    if assembly_resp is not None and assembly_resp.status_code == 200:
        chromosome_length = assembly_resp.json().get("length")

    return {"cytobands": cytobands, "chromosome_length": chromosome_length}
