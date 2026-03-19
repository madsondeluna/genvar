import httpx
from typing import Dict, Any, Optional, List

GNOMAD_API = "https://gnomad.broadinstitute.org/api"
TIMEOUT = 30.0

# Populations with coordinates for the geographic map
POPULATION_META = {
    "afr": {"name": "African/African American", "lat": 0.0, "lon": 20.0},
    "amr": {"name": "Latino/Admixed American", "lat": 10.0, "lon": -80.0},
    "asj": {"name": "Ashkenazi Jewish", "lat": 31.0, "lon": 35.0},
    "eas": {"name": "East Asian", "lat": 35.0, "lon": 105.0},
    "fin": {"name": "Finnish", "lat": 64.0, "lon": 26.0},
    "nfe": {"name": "Non-Finnish European", "lat": 50.0, "lon": 10.0},
    "sas": {"name": "South Asian", "lat": 20.0, "lon": 78.0},
    "mid": {"name": "Middle Eastern", "lat": 30.0, "lon": 50.0},
    "ami": {"name": "Amish", "lat": 40.0, "lon": -82.0},
}


def _is_main_population(pop_id: str) -> bool:
    return "_" not in pop_id and ":" not in pop_id and pop_id in POPULATION_META


async def get_variant_frequencies(
    chrom: str, pos: int, ref: str, alt: str, dataset: str = "gnomad_r4"
) -> Dict[str, Any]:
    variant_id = f"{chrom}-{pos}-{ref}-{alt}"

    query = """
    query VariantFrequencies($variantId: String!, $dataset: DatasetId!) {
      variant(variantId: $variantId, dataset: $dataset) {
        variantId
        chrom
        pos
        ref
        alt
        genome {
          ac
          an
          af
          populations {
            id
            ac
            an
          }
        }
        exome {
          ac
          an
          af
          populations {
            id
            ac
            an
          }
        }
      }
    }
    """

    async with httpx.AsyncClient() as client:
        response = await client.post(
            GNOMAD_API,
            json={"query": query, "variables": {"variantId": variant_id, "dataset": dataset}},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

    errors = data.get("errors")
    if errors:
        return {}

    variant = data.get("data", {}).get("variant")
    if not variant:
        return {}

    # Prefer genome data, fall back to exome
    source = variant.get("genome") or variant.get("exome")
    if not source:
        return {}

    global_af = source.get("af")
    global_ac = source.get("ac")
    global_an = source.get("an")

    populations = []
    for pop in source.get("populations", []):
        pid = pop.get("id", "")
        if not _is_main_population(pid):
            continue
        ac = pop.get("ac", 0)
        an = pop.get("an", 0)
        af = ac / an if an > 0 else 0.0
        meta = POPULATION_META[pid]
        populations.append({
            "population": pid.upper(),
            "population_id": pid,
            "population_name": meta["name"],
            "allele_frequency": af,
            "allele_count": ac,
            "allele_number": an,
            "lat": meta["lat"],
            "lon": meta["lon"],
        })

    return {
        "global_af": global_af,
        "global_ac": global_ac,
        "global_an": global_an,
        "populations": populations,
    }


async def get_gene_constraint(gene_symbol: str) -> Dict[str, Any]:
    query = """
    query GeneConstraint($geneSymbol: String!) {
      gene(gene_symbol: $geneSymbol, reference_genome: GRCh38) {
        gene_id
        symbol
        gnomad_constraint {
          pli
          lof_z
          oe_lof
          oe_lof_upper
          oe_mis
          oe_syn
        }
      }
    }
    """

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                GNOMAD_API,
                json={"query": query, "variables": {"geneSymbol": gene_symbol}},
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return {}

    errors = data.get("errors")
    if errors:
        return {}

    gene = data.get("data", {}).get("gene")
    if not gene:
        return {}

    constraint = gene.get("gnomad_constraint") or {}
    return {
        "pli": constraint.get("pli"),
        "lof_z": constraint.get("lof_z"),
        "oe_lof": constraint.get("oe_lof"),
        "oe_lof_upper": constraint.get("oe_lof_upper"),
        "oe_mis": constraint.get("oe_mis"),
        "oe_syn": constraint.get("oe_syn"),
    }


async def rsid_to_gnomad_variant(
    chrom: str, pos: int, ref: str, alt: str
) -> Optional[Dict[str, Any]]:
    return await get_variant_frequencies(chrom, pos, ref, alt)
