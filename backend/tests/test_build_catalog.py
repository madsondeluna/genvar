"""Testes do parser do ETL do Orphanet (offline, sem rede)."""
import xml.etree.ElementTree as ET
from scripts.build_catalog import parse_genes, parse_defs

PRODUCT6 = """
<JDBOR><DisorderList>
 <Disorder>
  <OrphaCode>558</OrphaCode>
  <Name lang="en">Marfan syndrome</Name>
  <DisorderGeneAssociationList>
   <DisorderGeneAssociation>
    <Gene><Symbol>FBN1</Symbol></Gene>
    <DisorderGeneAssociationType><Name>disease-causing germline mutation(s) in</Name></DisorderGeneAssociationType>
   </DisorderGeneAssociation>
   <DisorderGeneAssociation>
    <Gene><Symbol>TGFBR2</Symbol></Gene>
    <DisorderGeneAssociationType><Name>major susceptibility factor in</Name></DisorderGeneAssociationType>
   </DisorderGeneAssociation>
  </DisorderGeneAssociationList>
 </Disorder>
 <Disorder>
  <OrphaCode>99999</OrphaCode>
  <Name lang="en">Doenca sem gene</Name>
  <DisorderGeneAssociationList></DisorderGeneAssociationList>
 </Disorder>
</DisorderList></JDBOR>
"""

PRODUCT1 = """
<JDBOR><DisorderList>
 <Disorder>
  <OrphaCode>558</OrphaCode>
  <SummaryInformationList><SummaryInformation><TextSectionList>
    <TextSection><Contents>Marfan syndrome is a systemic connective tissue disorder.</Contents></TextSection>
  </TextSectionList></SummaryInformation></SummaryInformationList>
  <ExternalReferenceList>
    <ExternalReference><Source>OMIM</Source><Reference>154700</Reference></ExternalReference>
  </ExternalReferenceList>
 </Disorder>
</DisorderList></JDBOR>
"""


def test_parse_genes_keeps_only_causal_with_genes():
    genes = parse_genes(ET.fromstring(PRODUCT6))
    # 558 tem gene causal FBN1; TGFBR2 (susceptibilidade) e ignorado
    assert "558" in genes
    assert genes["558"]["genes"] == ["FBN1"]
    assert genes["558"]["name"] == "Marfan syndrome"
    # doenca sem gene nao entra
    assert "99999" not in genes


def test_parse_defs_extracts_definition_and_omim():
    defs = parse_defs(ET.fromstring(PRODUCT1))
    assert "558" in defs
    assert defs["558"]["omim"] == "154700"
    assert "connective tissue" in defs["558"]["short"]
