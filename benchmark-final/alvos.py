"""
Conjunto de alvos canonico, compartilhado por todas as suites.

Os mesmos identificadores em todas as medicoes: sem isso, uma suite mede MLH1 e
outra mede BRCA1, e a comparacao entre suites deixa de existir.

Os dez genes e as dez variantes sao os mesmos do benchmark da versao 2.0
(`benchmark-legacy/2.0/suites/_targets.py`), preservados letra por letra. E a
unica forma de a figura "2.0 contra 3.0" comparar duas medidas da mesma coisa.

Doencas, paineis e escores sao superficie nova da 3.0, sem linha de base. Foram
tirados do proprio catalogo em 2026-08-29, escolhendo os dez primeiros de cada
listagem para nao selecionar a dedo o que responde melhor.
"""

# --- Herdados da 2.0, nao alterar: sustentam a comparacao entre versoes -------
GENES = [
    "MLH1", "HBB", "MSH2", "VHL", "LDLR",
    "RB1", "BRCA1", "TP53", "CFTR", "PAH",
]

VARIANTES = [
    "rs334", "rs1800562", "rs6025", "rs1799853", "rs429358",
    "rs1801133", "rs1042522", "rs5030858", "rs28929474", "rs121913529",
]

# Coordenadas em GRCh38, que e o conjunto do gnomad_r4 usado pelo backend. Na
# 2.0 elas estavam em GRCh37 e as chamadas manuais ao gnomAD voltavam vazias.
COORDENADAS = {
    "rs334":       ("11", 5227002,   "T", "G"),  # HBB
    "rs1800562":   ("6",  26092913,  "G", "A"),  # HFE
    "rs6025":      ("1",  169549811, "C", "T"),  # F5
    "rs1799853":   ("10", 94942290,  "C", "T"),  # CYP2C9
    "rs429358":    ("19", 44908684,  "T", "C"),  # APOE
    "rs1801133":   ("1",  11796321,  "G", "C"),  # MTHFR
    "rs1042522":   ("17", 7676154,   "G", "T"),  # TP53
    "rs5030858":   ("12", 102840493, "G", "A"),  # PAH
    "rs28929474":  ("14", 94378610,  "C", "T"),  # SERPINA1
    "rs121913529": ("12", 25245350,  "C", "T"),  # KRAS
}

# --- Superficie nova da 3.0 ---------------------------------------------------
DOENCAS = [
    "anemia-falciforme", "talassemia-beta", "sindrome-de-lynch",
    "cancer-mama-ovario-hereditario", "polipose-adenomatosa-familiar",
    "sindrome-de-li-fraumeni", "von-hippel-lindau", "neurofibromatose-tipo-1",
    "hipercolesterolemia-familiar", "hemocromatose-hereditaria",
]

PAINEIS = [
    "cancer-mama-ovario-hereditario", "cancer-colorretal-hereditario",
    "cardiomiopatia-hipertrofica", "cardiomiopatia-dilatada",
    "arritmias-hereditarias", "hipercolesterolemia-familiar",
    "surdez-nao-sindromica", "retinopatias-hereditarias",
    "epilepsias-geneticas", "pa-brugada-syndrome-and-cardiac-sodium-channel-disease",
]

ESCORES = [
    "PGS000004", "PGS000001", "PGS000013", "PGS000018", "PGS000021",
    "PGS000027", "PGS000034", "PGS000055", "PGS000002", "PGS000003",
]

PREFIXOS_SUGESTAO = ["BRC", "MLH", "TP5", "CFT", "HBB", "LDL", "MSH", "VHL", "PAH", "RB1"]


def rotas(n=None):
    """As rotas medidas, com um alvo real em cada uma.

    Devolve (nome, caminho, familia). A familia agrupa a figura; o nome e o
    rotulo do eixo. `n` limita quantos alvos por familia, para as suites que
    tocam fontes externas.
    """
    k = n or 10
    r = [
        ("gene", f"/api/gene/{g}", "gene") for g in GENES[:k]
    ] + [
        ("gene sem variantes", f"/api/gene/{g}?variantes=false", "gene") for g in GENES[:k]
    ] + [
        ("gene variantes", f"/api/gene/{g}/variants", "gene") for g in GENES[:k]
    ] + [
        ("gene fenotipos", f"/api/gene/{g}/phenotypes", "gene") for g in GENES[:k]
    ] + [
        ("variante", f"/api/variant/{v}", "variante") for v in VARIANTES[:k]
    ] + [
        ("doenca", f"/api/disease/{d}", "doenca") for d in DOENCAS[:k]
    ] + [
        ("doenca variantes", f"/api/disease/{d}/variants", "doenca") for d in DOENCAS[:k]
    ] + [
        ("painel", f"/api/panel/{p}", "painel") for p in PAINEIS[:k]
    ] + [
        ("escore", f"/api/pgs/{e}", "escore") for e in ESCORES[:k]
    ] + [
        ("sugestao", f"/api/suggest?q={q}", "meta") for q in PREFIXOS_SUGESTAO[:k]
    ] + [
        ("catalogo de doencas", "/api/disease", "listagem"),
        ("estatistica de doencas", "/api/disease/stats", "listagem"),
        ("catalogo de paineis", "/api/panel", "listagem"),
        ("estatistica de paineis", "/api/panel/stats", "listagem"),
        ("catalogo de escores", "/api/pgs", "listagem"),
        ("raro x poligenico", "/api/pgs/interplay", "listagem"),
        ("fontes", "/api/sources", "meta"),
        ("saude das fontes", "/api/health/sources", "meta"),
        ("saude das rotas", "/api/health/endpoints", "meta"),
        # As duas de vida. Nao respondem dado nenhum e por isso e tentador
        # deixa-las de fora; sao justamente as que um balanceador consulta a cada
        # poucos segundos, e o piso de latencia delas e o piso da aplicacao.
        ("raiz", "/", "meta"),
        ("vida", "/health", "meta"),
    ]
    return r
