from pydantic import BaseModel
from typing import Optional, List


class GeneVariant(BaseModel):
    variant_id: str
    position: int
    consequence: str
    clinical_significance: Optional[str] = None
    gnomad_af: Optional[float] = None
    alleles: Optional[List[str]] = None


class Exon(BaseModel):
    start: int
    end: int


class VariantBin(BaseModel):
    start: int
    pathogenic: int = 0
    vus: int = 0
    benign: int = 0
    other: int = 0


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
    other_count: int = 0

    pathogenic_variants: List[GeneVariant] = []
    vus_variants: List[GeneVariant] = []
    benign_variants: List[GeneVariant] = []
    other_variants: List[GeneVariant] = []

    # Positional distribution computed server-side over all variants (not the capped lists)
    variant_distribution: List[VariantBin] = []
    variant_bin_size: int = 0
    displayed_variants: int = 0

    pli_score: Optional[float] = None
    lof_z_score: Optional[float] = None
    oe_lof: Optional[float] = None
    oe_lof_upper: Optional[float] = None
    oe_mis: Optional[float] = None

    uniprot_id: Optional[str] = None
    alphafold_pdb_url: Optional[str] = None
    alphafold_pae_url: Optional[str] = None

    # Exons do transcrito canonico (Ensembl), para o mapa de variantes por exon
    canonical_transcript_id: Optional[str] = None
    exons: List[Exon] = []

    # Contexto citogenetico para o painel posicional do mapa cromossomico
    cytobands: List[str] = []
    chromosome_length: Optional[int] = None


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
    cadd_rankscore: Optional[float] = None
    revel_score: Optional[float] = None
    alphamissense_score: Optional[float] = None
    alphamissense_pred: Optional[str] = None
    metalr_score: Optional[float] = None
    metalr_pred: Optional[str] = None
    metasvm_score: Optional[float] = None
    metasvm_pred: Optional[str] = None
    primateai_score: Optional[float] = None
    primateai_pred: Optional[str] = None
    mutpred_score: Optional[float] = None
    fathmm_score: Optional[float] = None
    fathmm_pred: Optional[str] = None
    dann_score: Optional[float] = None

    phylop_score: Optional[float] = None
    phastcons_score: Optional[float] = None
    gerp_rs: Optional[float] = None

    spliceai_max: Optional[float] = None
    dbscsnv_ada: Optional[float] = None
    dbscsnv_rf: Optional[float] = None

    interpro_domains: List[str] = []
    thousand_genomes_af: Optional[float] = None
    exac_af: Optional[float] = None
    clinvar_variation_id: Optional[str] = None
    cosmic_ids: List[str] = []

    protein_id: Optional[str] = None
    amino_acid_change: Optional[str] = None


class MendelianDisease(BaseModel):
    description: str
    sources: List[str] = []
    omim_id: Optional[str] = None
    orphanet_id: Optional[str] = None
    inheritance: List[str] = []


class GwasTrait(BaseModel):
    trait: str
    association_count: int
    best_p_value: Optional[float] = None


class GenePhenotypesResponse(BaseModel):
    gene_symbol: str
    mendelian: List[MendelianDisease] = []
    gwas: List[GwasTrait] = []
    gwas_trait_total: int = 0
    gwas_association_total: int = 0
    gwas_truncated: bool = False


# --- Modulo de Doencas Raras (monogenico) ---

class DiseaseSummary(BaseModel):
    """Cartao de doenca no hub /doencas (servido direto do catalogo curado)."""
    id: str
    name: str
    category: str
    inheritance: str
    genes: List[str] = []
    short: str
    prevalence: Optional[str] = None


class DiseaseListResponse(BaseModel):
    """Lista paginada do catalogo para o hub (busca no servidor)."""
    items: List[DiseaseSummary] = []
    total: int = 0
    page: int = 1
    page_size: int = 30


class CausalGene(BaseModel):
    """Gene causal com constraint enriquecido ao vivo pela gnomAD."""
    symbol: str
    pli: Optional[float] = None
    # LOEUF = limite superior do intervalo de oe_lof; quanto menor, mais restrito
    loeuf: Optional[float] = None
    oe_lof: Optional[float] = None
    oe_mis: Optional[float] = None
    constraint_available: bool = False


class DiseaseDetail(BaseModel):
    """Pagina /doenca/{id}: metadados curados + genes causais enriquecidos."""
    id: str
    name: str
    category: str
    inheritance: str
    short: str
    prevalence: Optional[str] = None
    hpo: List[str] = []
    orphanet: Optional[str] = None
    omim: Optional[str] = None
    mondo: Optional[str] = None
    genes: List[str] = []
    causal_genes: List[CausalGene] = []
    example_kind: Optional[str] = None
    example_id: Optional[str] = None


class DiseasePathogenicGene(BaseModel):
    """Variantes patogenicas de um gene causal (via overlap do Ensembl)."""
    symbol: str
    pathogenic_count: int = 0
    variants: List[GeneVariant] = []


class DiseaseVariantsResponse(BaseModel):
    """Pagina /doenca/{id}: variantes patogenicas agrupadas por gene causal.
    Carregada em separado do detalhe para nao atrasar a pagina."""
    id: str
    genes: List[DiseasePathogenicGene] = []
    degraded: bool = False


# --- Saude das fontes externas ---

class SourceHealth(BaseModel):
    name: str
    host: str
    ok: bool
    status: Optional[int] = None
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class HealthSourcesResponse(BaseModel):
    all_ok: bool
    ok_count: int
    total: int
    sources: List[SourceHealth] = []
