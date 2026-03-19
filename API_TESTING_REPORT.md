# API Testing Report - GenVar Dashboard

Date: 2026-03-18
Tested by: Claude Code (automated testing before implementation)

---

## 1. Ensembl REST API

**Base URL:** `https://rest.ensembl.org`

### Endpoint: Gene Lookup

`GET /lookup/symbol/homo_sapiens/{gene_symbol}`

**Test: BRCA1**
```json
{
  "source": "ensembl_havana",
  "db_type": "core",
  "description": "BRCA1 DNA repair associated [Source:HGNC Symbol;Acc:HGNC:1100]",
  "logic_name": "ensembl_havana_gene_homo_sapiens",
  "display_name": "BRCA1",
  "seq_region_name": "17",
  "object_type": "Gene",
  "version": 27,
  "strand": -1,
  "biotype": "protein_coding",
  "assembly_name": "GRCh38",
  "start": 43044292,
  "species": "homo_sapiens",
  "id": "ENSG00000012048",
  "canonical_transcript": "ENST00000357654.9",
  "end": 43170245
}
```

**Key fields:** `id`, `display_name`, `description`, `seq_region_name`, `start`, `end`, `strand`, `biotype`, `assembly_name`

**Error response (invalid gene):**
```json
{"error": "No valid lookup found for symbol FAKEGENE123"}
```
HTTP status: 400

### Endpoint: Gene Variants (Overlap)

`GET /overlap/id/{gene_id}?feature=variation`

**Test: ENSG00000012048 (BRCA1)**
- Returns array of variant objects
- BRCA1 returns 57,556 variants (large dataset - must limit)
- Each variant:
```json
{
  "source": "dbSNP",
  "id": "rs1201986605",
  "feature_type": "variation",
  "clinical_significance": [],
  "seq_region_name": "17",
  "consequence_type": "intergenic_variant",
  "end": 43044293,
  "alleles": ["G", "T"],
  "start": 43044293,
  "strand": 1,
  "assembly_name": "GRCh38"
}
```

**Key fields:** `id` (rsID), `clinical_significance` (array, may be empty), `consequence_type`, `start`, `end`, `alleles`

**Note:** `clinical_significance` is an array of strings like `["pathogenic"]`, `["benign"]`, `["uncertain significance"]` or `[]`

### Endpoint: Variant Effect Predictor

`GET /vep/human/id/{rsid}?content-type=application/json`

**Test: rs429358**

Top-level keys: `strand`, `assembly_name`, `colocated_variants`, `most_severe_consequence`, `end`, `id`, `seq_region_name`, `input`, `allele_string`, `transcript_consequences`, `start`

First transcript consequence keys:
`cdna_start`, `cds_end`, `strand`, `consequence_terms`, `protein_start`, `codons`, `amino_acids`, `gene_symbol`, `transcript_id`, `cdna_end`, `cds_start`, `gene_id`, `impact`, `gene_symbol_source`, `sift_score`, `variant_allele`, `hgnc_id`, `biotype`, `protein_end`, `sift_prediction`

**Note:** `polyphen_score` and `polyphen_prediction` were absent for rs429358 - fields are optional.

**VEP response structure:**
```json
[{
  "id": "rs429358",
  "seq_region_name": "19",
  "start": 44908684,
  "end": 44908684,
  "allele_string": "T/C",
  "most_severe_consequence": "missense_variant",
  "transcript_consequences": [{
    "gene_symbol": "APOE",
    "gene_id": "ENSG00000130203",
    "transcript_id": "ENST00000252486",
    "consequence_terms": ["missense_variant"],
    "sift_score": 1.0,
    "sift_prediction": "tolerated",
    "polyphen_score": null,
    "polyphen_prediction": null,
    "amino_acids": "C/R",
    "codons": "Tgc/Cgc",
    "protein_start": 130,
    "impact": "MODERATE"
  }]
}]
```

---

## 2. gnomAD GraphQL API

**Endpoint:** `https://gnomad.broadinstitute.org/api`

### CRITICAL DISCREPANCY: af field on populations

The documentation example shows `af` on populations, but the API returns an error:
```
"Cannot query field \"af\" on type \"VariantPopulation\". Did you mean \"ac\" or \"an\"?"
```

**Fix:** Calculate AF as `ac / an` in application code.

### CRITICAL DISCREPANCY: loeuf field name

`loeuf` does NOT exist. The correct field is `oe_lof_upper`. Use `lof_z` for the z-score.

### VariantPopulation fields (from introspection):
`id`, `ac`, `an`, `homozygote_count`, `hemizygote_count`, `ac_hom`, `ac_hemi`

### GnomadConstraint fields (from introspection):
`exp_lof`, `exp_mis`, `exp_syn`, `obs_lof`, `obs_mis`, `obs_syn`,
`oe_lof`, `oe_lof_lower`, `oe_lof_upper` (LOEUF), `oe_mis`, `oe_mis_lower`, `oe_mis_upper`,
`oe_syn`, `oe_syn_lower`, `oe_syn_upper`, `lof_z`, `mis_z`, `syn_z`, `pli`, `pLI`, `flags`

### Population IDs in gnomAD r4:
Main populations (no `_` or `:` in ID):
- `afr` = African/African American
- `amr` = Latino/Admixed American
- `asj` = Ashkenazi Jewish
- `eas` = East Asian
- `fin` = Finnish
- `nfe` = Non-Finnish European
- `sas` = South Asian
- `mid` = Middle Eastern
- `ami` = Amish
- `remaining` = Other/Remaining

Sex-stratified: `afr_XX`, `afr_XY`, etc. (filter out with `_` check)
Sub-populations: `hgdp:japanese`, `1kg:ceu`, etc. (filter out with `:` check)

### Variant Query (corrected):
```graphql
query VariantQuery($variantId: String!, $dataset: DatasetId!) {
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
```

### Constraint Query (corrected):
```graphql
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
```

### Test result for BRCA1 constraint:
```json
{
  "pli": 1.547e-34,
  "lof_z": 2.617,
  "oe_lof": 0.766,
  "oe_lof_upper": null,
  "oe_mis": 0.865,
  "oe_syn": 0.826
}
```

---

## 3. ClinVar via NCBI E-utilities

**Base URL:** `https://eutils.ncbi.nlm.nih.gov/entrez/eutils`

### Step 1: esearch

`GET /esearch.fcgi?db=clinvar&term={rsid}&retmode=json`

Response for rs429358:
```json
{
  "esearchresult": {
    "count": "8",
    "retmax": "8",
    "idlist": ["694742", "694585", "441269", "441268", "441267", "440870", "17864", "17863"]
  }
}
```

### Step 2: esummary

`GET /esummary.fcgi?db=clinvar&id={uid}&retmode=json`

**CRITICAL DISCREPANCY:** Field is `germline_classification` not `clinical_significance`.

```json
{
  "uid": "17864",
  "accession": "VCV000017864",
  "title": "NM_000041.4(APOE):c.388T>C (p.Cys130Arg)",
  "germline_classification": {
    "description": "Conflicting classifications of pathogenicity; other; risk factor",
    "last_evaluated": "2025/09/10 00:00",
    "review_status": "criteria provided, conflicting classifications",
    "trait_set": [
      {"trait_name": "Alzheimer disease 2", "trait_xrefs": [...]},
      ...
    ]
  },
  "genes": [...],
  "protein_change": "...",
  "molecular_consequence_list": [...]
}
```

**Key fields:**
- `germline_classification.description` -> clinical significance string
- `germline_classification.review_status` -> review status
- `germline_classification.last_evaluated` -> last evaluation date
- `germline_classification.trait_set[].trait_name` -> associated conditions

---

## 4. AlphaFold Protein Structure Database API

**Base URL:** `https://alphafold.ebi.ac.uk/api`

### Endpoint: Prediction

`GET /prediction/{uniprot_id}`

**Test: P38398 (BRCA1)**

Returns an ARRAY of prediction objects (multiple versions/fragments).

First object:
```json
{
  "entryId": "AF-P38398-F1",
  "gene": "BRCA1",
  "uniprotAccession": "P38398",
  "uniprotId": "BRCA1_HUMAN",
  "uniprotDescription": "Breast cancer type 1 susceptibility protein",
  "taxId": 9606,
  "globalMetricValue": 41.59,
  "latestVersion": 6,
  "pdbUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.pdb",
  "cifUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.cif",
  "bcifUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-model_v6.bcif",
  "paeImageUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-predicted_aligned_error_v6.png",
  "paeDocUrl": "https://alphafold.ebi.ac.uk/files/AF-P38398-F1-predicted_aligned_error_v6.json",
  "fractionPlddtVeryLow": 0.804,
  "fractionPlddtLow": 0.022,
  "fractionPlddtConfident": 0.063,
  "fractionPlddtVeryHigh": 0.111,
  "sequenceStart": 1,
  "sequenceEnd": 1863
}
```

**Key fields:** `pdbUrl`, `paeImageUrl`, `cifUrl`, `globalMetricValue`, `entryId`

**Note:** Always use `results[0]` (first item = canonical model).

---

## 5. UniProt REST API

**Base URL:** `https://rest.uniprot.org`

### Endpoint: Search

`GET /uniprotkb/search?query=gene:{symbol}+AND+organism_id:9606+AND+reviewed:true&format=json&fields=accession,gene_names`

**Test: BRCA1**
```json
{
  "results": [{
    "entryType": "UniProtKB reviewed (Swiss-Prot)",
    "primaryAccession": "P38398",
    "genes": [{
      "geneName": {"value": "BRCA1"},
      "synonyms": [{"value": "RNF53"}]
    }]
  }]
}
```

**Test: TP53** -> primaryAccession: `P04637`

**Key fields:** `results[0].primaryAccession` -> UniProt ID

**Note:** Adding `reviewed:true` filter ensures we get the canonical Swiss-Prot entry, not unreviewed TrEMBL entries.

---

## Summary of Discrepancies (Docs vs Reality)

| API | Documented | Actual |
|-----|-----------|--------|
| gnomAD | `populations { af }` | `af` not available, calculate `ac/an` |
| gnomAD | `loeuf` in constraint | Field is `oe_lof_upper`, z-score is `lof_z` |
| gnomAD | population IDs uppercase (AFR, AMR) | IDs are lowercase (afr, amr) |
| ClinVar | `clinical_significance` | Field is `germline_classification` |
| AlphaFold | Single object | Returns array, use `[0]` |

---

## Rate Limits

| API | Limit | Notes |
|-----|-------|-------|
| Ensembl | 15 req/sec | No key needed |
| gnomAD | ~10 req/sec | No key needed |
| ClinVar | 3 req/sec | No key needed, consider batching |
| AlphaFold | No stated limit | Reasonable usage |
| UniProt | No stated limit | Add User-Agent header |
