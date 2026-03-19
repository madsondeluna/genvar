from pydantic import BaseModel
from typing import Optional, List


class GeneVariant(BaseModel):
    variant_id: str
    position: int
    consequence: str
    clinical_significance: Optional[str] = None
    gnomad_af: Optional[float] = None
    alleles: Optional[List[str]] = None


class GeneResponse(BaseModel):
    gene_symbol: str
    gene_id: str
    description: Optional[str] = None
    chromosome: str
    start: int
    end: int
    strand: int
    biotype: Optional[str] = None
    assembly_name: Optional[str] = None

    total_variants: int = 0
    pathogenic_count: int = 0
    vus_count: int = 0
    benign_count: int = 0

    pathogenic_variants: List[GeneVariant] = []
    vus_variants: List[GeneVariant] = []
    benign_variants: List[GeneVariant] = []

    pli_score: Optional[float] = None
    lof_z_score: Optional[float] = None
    oe_lof: Optional[float] = None
    oe_lof_upper: Optional[float] = None
    oe_mis: Optional[float] = None

    uniprot_id: Optional[str] = None
    alphafold_pdb_url: Optional[str] = None
    alphafold_pae_url: Optional[str] = None


class PopulationFrequency(BaseModel):
    population: str
    population_name: str
    allele_frequency: float
    allele_count: int
    allele_number: int


class VariantResponse(BaseModel):
    variant_id: str
    gene_symbol: Optional[str] = None
    chromosome: str
    position: int
    ref_allele: str
    alt_allele: str
    consequence: str
    most_severe_consequence: Optional[str] = None

    gnomad_frequencies: List[PopulationFrequency] = []
    gnomad_global_af: Optional[float] = None
    gnomad_ac: Optional[int] = None
    gnomad_an: Optional[int] = None

    clinvar_significance: Optional[str] = None
    clinvar_review_status: Optional[str] = None
    clinvar_conditions: List[str] = []
    clinvar_last_evaluated: Optional[str] = None

    sift_score: Optional[float] = None
    sift_prediction: Optional[str] = None
    polyphen_score: Optional[float] = None
    polyphen_prediction: Optional[str] = None
    cadd_phred: Optional[float] = None
    revel_score: Optional[float] = None

    protein_id: Optional[str] = None
    amino_acid_change: Optional[str] = None
