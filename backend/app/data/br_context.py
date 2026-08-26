"""Contexto brasileiro curado por doenca: cobertura no SUS (PCDT e testes
incorporados) e triagem neonatal (teste do pezinho).

Curadoria manual, para verificacao e ampliacao. Onde nao ha certeza sobre o
link exato do protocolo, usamos a busca oficial de PCDT do Ministerio da Saude
em vez de fixar uma URL que pode mudar.

Chave = id da doenca no catalogo (backend/app/data/rare_diseases.py).
"""
from typing import Optional, Dict, Any

# Busca oficial de Protocolos Clinicos e Diretrizes Terapeuticas (PCDT).
PCDT_SEARCH = "https://www.gov.br/conitec/pt-br/pcdt"

# Cobertura no SUS por doenca. pcdt: existe protocolo; tests: exames moleculares
# ou laboratoriais relevantes (incorporados ou usuais no diagnostico).
SUS: Dict[str, Dict[str, Any]] = {
    "anemia-falciforme": {
        "pcdt": True,
        "pcdt_name": "PCDT Doenca Falciforme",
        "tests": ["Eletroforese de hemoglobina", "Triagem neonatal (teste do pezinho)"],
        "note": "Doenca falciforme tem PCDT no SUS e rastreio no teste do pezinho.",
    },
    "fibrose-cistica": {
        "pcdt": True,
        "pcdt_name": "PCDT Fibrose Cistica",
        "tests": ["Dosagem de tripsina imunorreativa (IRT)", "Teste do suor", "Analise molecular do CFTR"],
        "note": "Diagnostico e acompanhamento previstos no SUS; rastreio neonatal por IRT.",
    },
    "fenilcetonuria": {
        "pcdt": True,
        "pcdt_name": "PCDT Fenilcetonuria",
        "tests": ["Dosagem de fenilalanina", "Triagem neonatal (teste do pezinho)"],
        "note": "PKU e uma das doencas historicas do teste do pezinho.",
    },
    "doenca-de-wilson": {
        "pcdt": True,
        "pcdt_name": "PCDT Doenca de Wilson",
        "tests": ["Ceruloplasmina", "Cobre urinario 24h", "Analise molecular do ATP7B"],
        "note": None,
    },
    "atrofia-muscular-espinhal": {
        "pcdt": True,
        "pcdt_name": "PCDT Atrofia Muscular Espinhal 5q",
        "tests": ["Analise molecular do SMN1", "Numero de copias de SMN2"],
        "note": "AME tem PCDT e terapias incorporadas; incluida na ampliacao do teste do pezinho.",
    },
    "hipercolesterolemia-familiar": {
        "pcdt": False,
        "pcdt_name": None,
        "tests": ["Perfil lipidico", "Analise molecular de LDLR/APOB/PCSK9 (nem sempre no SUS)"],
        "note": "Diagnostico clinico/laboratorial; teste molecular nem sempre disponivel no SUS.",
    },
    "distrofia-muscular-duchenne": {
        "pcdt": True,
        "pcdt_name": "PCDT Distrofia Muscular de Duchenne",
        "tests": ["CK serica", "Analise molecular do DMD (MLPA/sequenciamento)"],
        "note": None,
    },
    "hemocromatose-hereditaria": {
        "pcdt": False,
        "pcdt_name": None,
        "tests": ["Saturacao de transferrina e ferritina", "Genotipagem HFE (C282Y/H63D)"],
        "note": "Rastreio bioquimico amplamente disponivel; genotipagem HFE conforme servico.",
    },
}

# Triagem neonatal (teste do pezinho). etapa: fase da ampliacao pela Lei 14.154.
NEWBORN: Dict[str, Dict[str, Any]] = {
    "anemia-falciforme": {"covered": True, "note": "Rastreada desde o teste do pezinho basico."},
    "fenilcetonuria": {"covered": True, "note": "Rastreada desde o teste do pezinho basico."},
    "fibrose-cistica": {"covered": True, "note": "Rastreada por IRT no teste do pezinho."},
    "atrofia-muscular-espinhal": {"covered": True, "note": "Incluida na ampliacao (Lei 14.154); implantacao gradual por estado."},
}


def get_sus(disease_id: str) -> Optional[Dict[str, Any]]:
    return SUS.get(disease_id)


def get_newborn(disease_id: str) -> Optional[Dict[str, Any]]:
    return NEWBORN.get(disease_id)
