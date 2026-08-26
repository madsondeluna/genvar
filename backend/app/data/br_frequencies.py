"""Frequencias alelicas brasileiras por rsID (ABraOM / DNA do Brasil).

A gnomAD sub-representa a ancestralidade admixada brasileira; esta camada
mostra a frequencia em coortes brasileiras quando disponivel. O dicionario
comeca vazio de proposito: numeros so entram por um dataset real (ETL), nunca
inventados. Enquanto vazio, a UI indica "em integracao".

Chave = rsID (minusculo). Valor = frequencia alelica (0..1) na coorte BR.
Para popular: gerar de ABraOM (https://abraom.ib.usp.br/) ou DNA do Brasil e
salvar aqui ou em um JSON irmao carregado por este modulo.
"""
from typing import Optional, Dict

BR_ALLELE_FREQ: Dict[str, float] = {
    # exemplo de shape (comentado; preencher com dataset real):
    # "rs334": 0.012,
}


def get_br_freq(rsid: str) -> Optional[float]:
    return BR_ALLELE_FREQ.get((rsid or "").lower())
