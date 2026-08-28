"""Proveniencia: quais dados o GenVar usa, de onde vem e sob que licenca.

Existe por obrigacao, nao por cortesia. O Orphanet e publicado sob CC BY 4.0,
que exige credito visivel a fonte; PanelApp e PGS Catalog tambem pedem citacao.
Um app que redistribui esses dados sem creditar esta em desacordo com a licenca
que o autoriza a usa-los.

A data de extracao de cada catalogo estatico vem do proprio arquivo gerado pelo
ETL, e nao de uma constante: um numero escrito a mao envelhece em silencio.
"""
import gzip
import json
from datetime import date
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter

from app.models.schemas import SourceItem, SourcesResponse

router = APIRouter()

_DATA = Path(__file__).parent.parent / "data"
# Os catalogos servidos ao navegador moram fora de `backend/`, e contar niveis
# de `..` no caminho de cada entrada e o jeito de errar em silencio: o caminho
# resolve para uma pasta que nao existe e a data sai vazia sem aviso. Uma
# entrada que comece por `web:` e resolvida a partir da RAIZ do repositorio.
_RAIZ = Path(__file__).resolve().parents[3]


def _extraido(arquivo: str) -> Tuple[Optional[str], Optional[str]]:
    """Data de extracao do catalogo, e DE ONDE ela saiu.

    A origem viaja junto porque as duas possiveis nao valem o mesmo. Quando o
    proprio arquivo declara a data, ela e o momento em que o ETL leu a fonte.
    Quando nao declara, o que resta e a data de modificacao do arquivo, que e
    quando ele foi ESCRITO: quase sempre igual, mas nao a mesma coisa, e
    apresentar uma pela outra sem dizer seria inventar precisao.

    Os catalogos servidos ao navegador ficam fora de `app/data` e alguns sao
    gzip, entao o caminho pode subir de diretorio e a leitura pode precisar
    descomprimir.
    """
    p = ((_RAIZ / arquivo[4:]) if arquivo.startswith("web:") else (_DATA / arquivo)).resolve()
    if not p.exists():
        return None, None
    try:
        abrir = gzip.open if p.suffix == ".gz" else open
        with abrir(p, "rt", encoding="utf-8") as fh:
            d = json.load(fh)
        declarada = d.get("generated_at") or d.get("versao") or d.get("extraido_em")
        if declarada:
            return str(declarada)[:10], "declarada no arquivo"
    except (OSError, json.JSONDecodeError, EOFError):
        return None, None
    return date.fromtimestamp(p.stat().st_mtime).isoformat(), "data do arquivo"


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

_NOVAS = [
    {
        "id": "hgnc", "name": "HGNC",
        "url": "https://www.genenames.org",
        "data_url": "https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt",
        "license": "CC0 1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "kind": "catalogo", "arquivo": "web:frontend/public/data/paineis/simbolos.json.gz",
        "usage": "Nomenclatura oficial de gene: resolve símbolo antigo e sinônimo para o "
                 "símbolo corrente. Sem isso, o filtro por painel perde os genes que apenas "
                 "mudaram de nome: cruzar direto casa 96,2% dos genes verdes do PanelApp, e "
                 "com o mapa de sinônimos a taxa vai a 98,6%.",
        "citation": "Seal RL, Braschi B, Gray K, et al. Genenames.org: the HGNC resources in "
                    "2023. Nucleic Acids Res. 2023;51:D1003-D1009.",
    },
    {
        "id": "clingen", "name": "ClinGen",
        "url": "https://clinicalgenome.org",
        "data_url": "https://search.clinicalgenome.org/kb/gene-validity",
        "license": "CC0 1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "kind": "catalogo", "arquivo": "web:frontend/public/data/farmaco/clingen.json.gz",
        "usage": "Validade gene-doença curada por painel de especialistas, com o padrão de "
                 "herança. É o que permite dizer se a associação entre um gene e uma doença é "
                 "definitiva ou apenas relatada, e é a fonte do critério PVS1 no módulo de VCF.",
        "citation": "Strande NT, Riggs ER, Buchanan AH, et al. Evaluating the Clinical Validity "
                    "of Gene-Disease Associations. Am J Hum Genet. 2017;100:895-906.",
    },
    {
        "id": "cpic", "name": "CPIC",
        "url": "https://cpicpgx.org",
        "data_url": "https://api.cpicpgx.org/v1/",
        "license": "CC BY-SA 4.0", "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "kind": "catalogo", "arquivo": "web:frontend/public/data/farmaco/cpic.json.gz",
        "usage": "Diretrizes de farmacogenômica: quais genes têm recomendação de dose ou de "
                 "escolha de fármaco. Limite declarado: o GenVar sinaliza o gene, e não "
                 "determina diplotipo, porque chamada de alelo estrela exige fase e número de "
                 "cópias, ausentes de um VCF de variante curta.",
        "citation": "Relling MV, Klein TE. CPIC: Clinical Pharmacogenetics Implementation "
                    "Consortium. Clin Pharmacol Ther. 2011;89:464-467.",
    },
    {
        "id": "clinvar-embarcado", "name": "ClinVar (compilação embarcada)",
        "url": "https://www.ncbi.nlm.nih.gov/clinvar/",
        "data_url": "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/",
        "license": "Domínio público",
        "license_url": "https://www.ncbi.nlm.nih.gov/home/about/policies/",
        "kind": "catalogo", "arquivo": "web:frontend/public/data/clinvar/index.json",
        "usage": "A mesma base do ClinVar, compilada em JSON colunar comprimido e servida ao "
                 "navegador: 4,2 milhões de variantes em três camadas e um arquivo por "
                 "cromossomo. Existe porque o módulo de VCF roda inteiro no navegador, e "
                 "consultar a API por variante entregaria o arquivo do paciente a um terceiro.",
        "citation": "Landrum MJ, Chitipiralla S, Brown GR, et al. ClinVar: improvements to "
                    "accessing data. Nucleic Acids Res. 2020;48:D835-D844.",
    },
    {
        "id": "gwas-catalog", "name": "GWAS Catalog",
        "url": "https://www.ebi.ac.uk/gwas/",
        "data_url": "https://www.ebi.ac.uk/gwas/rest/api/",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Associações de variante comum com traço, usadas na página de gene para "
                 "separar o que é monogênico do que é característica de arquitetura poligênica.",
        "citation": "Sollis E, Mosaku A, Abid A, et al. The NHGRI-EBI GWAS Catalog. "
                    "Nucleic Acids Res. 2023;51:D977-D985.",
    },
    {
        "id": "myvariant", "name": "MyVariant.info",
        "url": "https://myvariant.info",
        "data_url": "https://myvariant.info/v1/",
        "license": "Apache 2.0", "license_url": "https://www.apache.org/licenses/LICENSE-2.0",
        "kind": "ao vivo", "arquivo": None,
        "usage": "Agregador de escores preditivos sobre o dbNSFP: CADD, REVEL, AlphaMissense, "
                 "SIFT, PolyPhen-2, conservação e predição de splicing, na página de variante.",
        "citation": "Xin J, Mark A, Afrasiabi C, et al. High-performance web services for "
                    "querying gene and variant annotation. Genome Biol. 2016;17:91.",
    },
]

_FONTES = _FONTES + _NOVAS


@router.get("", response_model=SourcesResponse)
async def sources():
    itens: List[SourceItem] = []
    for f in _FONTES:
        quando, origem = _extraido(f["arquivo"]) if f.get("arquivo") else (None, None)
        itens.append(SourceItem(
            id=f["id"], name=f["name"], url=f["url"], data_url=f["data_url"],
            license=f["license"], license_url=f["license_url"], kind=f["kind"],
            usage=f["usage"], citation=f["citation"],
            extracted_at=quando, extracted_from=origem,
        ))
    return SourcesResponse(items=itens)
