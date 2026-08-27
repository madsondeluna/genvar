"""Proveniencia: quais dados o GenVar usa, de onde vem e sob que licenca.

Existe por obrigacao, nao por cortesia. O Orphanet e publicado sob CC BY 4.0,
que exige credito visivel a fonte; PanelApp e PGS Catalog tambem pedem citacao.
Um app que redistribui esses dados sem creditar esta em desacordo com a licenca
que o autoriza a usa-los.

A data de extracao de cada catalogo estatico vem do proprio arquivo gerado pelo
ETL, e nao de uma constante: um numero escrito a mao envelhece em silencio.
"""
import json
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter

from app.models.schemas import SourceItem, SourcesResponse

router = APIRouter()

_DATA = Path(__file__).parent.parent / "data"


def _extraido(arquivo: str) -> Optional[str]:
    p = _DATA / arquivo
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("generated_at")
    except (OSError, json.JSONDecodeError):
        return None


# `kind` separa o que e baixado uma vez (catalogo) do que e consultado a cada
# requisicao (ao vivo). A distincao importa para quem le: um numero de catalogo
# tem a idade da extracao, um numero ao vivo tem a idade da consulta.
_FONTES = [
    {
        "id": "orphanet", "name": "Orphanet",
        "url": "https://www.orpha.net", "data_url": "https://www.orphadata.com",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "kind": "catalogo", "arquivo": "orphanet_diseases.json",
        "usage": "Catálogo de doenças raras: nomes em português, genes causais, "
                 "padrão de herança, prevalência, fenótipos HPO e referências OMIM, MONDO e ICD.",
        "citation": "Orphanet: an online database of rare diseases and orphan drugs. "
                    "INSERM 1997. Disponível em https://www.orpha.net",
    },
    {
        "id": "panelapp", "name": "Genomics England PanelApp",
        "url": "https://panelapp.genomicsengland.co.uk",
        "data_url": "https://panelapp.genomicsengland.co.uk/api/v1/",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "kind": "catalogo", "arquivo": "panelapp_panels.json",
        "usage": "Painéis de genes com nível de evidência por gene. O GenVar usa apenas "
                 "os genes verdes, de evidência suficiente para uso diagnóstico.",
        "citation": "Martin AR et al. PanelApp crowdsources expert knowledge to establish "
                    "consensus diagnostic gene panels. Nat Genet. 2019;51:1560-1565.",
    },
    {
        "id": "pgs_catalog", "name": "PGS Catalog",
        "url": "https://www.pgscatalog.org", "data_url": "https://www.pgscatalog.org/rest/",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "kind": "catalogo", "arquivo": "pgs_catalog.json",
        "usage": "Escores poligênicos publicados, com número de variantes, método e "
                 "composição de ancestria da população em que cada escore foi desenvolvido.",
        "citation": "Lambert SA et al. The Polygenic Score Catalog as an open database for "
                    "reproducibility and systematic evaluation. Nat Genet. 2021;53:420-425.",
    },
    {
        "id": "ensembl", "name": "Ensembl",
        "url": "https://www.ensembl.org", "data_url": "https://rest.ensembl.org",
        "license": "Apache 2.0", "license_url": "https://www.apache.org/licenses/LICENSE-2.0",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Coordenadas e estrutura de genes, consequência de variantes (VEP) e "
                 "agregação de variantes por região.",
        "citation": "Harrison PW et al. Ensembl 2024. Nucleic Acids Res. 2024;52:D891-D899.",
    },
    {
        "id": "gnomad", "name": "gnomAD",
        "url": "https://gnomad.broadinstitute.org",
        "data_url": "https://gnomad.broadinstitute.org/api",
        "license": "CC0 1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Frequências alélicas por população e métricas de restrição gênica "
                 "(LOEUF e pLI), consultadas a cada abertura de gene ou painel.",
        "citation": "Chen S et al. A genomic mutational constraint map using variation in "
                    "76,156 human genomes. Nature. 2024;625:92-100.",
    },
    {
        "id": "clinvar", "name": "ClinVar",
        "url": "https://www.ncbi.nlm.nih.gov/clinvar/",
        "data_url": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
        "license": "Domínio público (NCBI)",
        "license_url": "https://www.ncbi.nlm.nih.gov/home/about/policies/",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Significância clínica das variantes, incluindo a classificação "
                 "patogênica ou provavelmente patogênica exibida nas páginas de doença e gene.",
        "citation": "Landrum MJ et al. ClinVar: improvements to accessing data. "
                    "Nucleic Acids Res. 2020;48:D835-D844.",
    },
    {
        "id": "alphafold", "name": "AlphaFold DB",
        "url": "https://alphafold.ebi.ac.uk", "data_url": "https://alphafold.ebi.ac.uk/api/",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Estrutura tridimensional predita da proteína, exibida na página de gene.",
        "citation": "Varadi M et al. AlphaFold Protein Structure Database in 2024. "
                    "Nucleic Acids Res. 2024;52:D368-D375.",
    },
    {
        "id": "uniprot", "name": "UniProt",
        "url": "https://www.uniprot.org", "data_url": "https://rest.uniprot.org",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Identificador e metadados da proteína codificada pelo gene.",
        "citation": "The UniProt Consortium. UniProt: the Universal Protein Knowledgebase "
                    "in 2025. Nucleic Acids Res. 2025;53:D609-D617.",
    },
]


@router.get("", response_model=SourcesResponse)
async def sources():
    itens: List[SourceItem] = []
    for f in _FONTES:
        itens.append(SourceItem(
            id=f["id"], name=f["name"], url=f["url"], data_url=f["data_url"],
            license=f["license"], license_url=f["license_url"], kind=f["kind"],
            usage=f["usage"], citation=f["citation"],
            extracted_at=_extraido(f["arquivo"]) if f["arquivo"] else None,
        ))
    return SourcesResponse(items=itens)
