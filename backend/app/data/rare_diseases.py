"""Catalogo curado de doencas raras (monogenicas), semente do beta.

Fonte de verdade unica do modulo de Doencas Raras. Cada entrada e curada em
PT-BR e cruza referencias publicas (Orphanet, OMIM, MONDO). Os genes causais
sao enriquecidos ao vivo (constraint da gnomAD) pelo router /api/disease.

IDs de referencia sao ponteiros para busca externa; quando um numero exato nao
e conhecido com seguranca, o campo fica em None e a UI cai para uma busca por
nome. Ampliar este catalogo e o primeiro item da Fase 1 do ROADMAP.
"""

from typing import Optional, List, Dict, Any

# Padroes de heranca usados nas facetas do hub:
#   AD  autossomica dominante   AR  autossomica recessiva
#   XLR ligada ao X recessiva   XLD ligada ao X dominante
#   XL  ligada ao X (padrao misto/variavel)
RARE_DISEASES: List[Dict[str, Any]] = [
    {
        "id": "anemia-falciforme",
        "name": "Anemia falciforme",
        "category": "Hematologia",
        "inheritance": "AR",
        "genes": ["HBB"],
        "short": "Substituicao E6V na beta-globina (HBB) que polimeriza a hemoglobina "
                 "em baixa tensao de oxigenio, deformando as hemacias em foice.",
        "hpo": ["Anemia hemolitica", "Crises vaso-oclusivas", "Dactilite", "Esplenomegalia"],
        "prevalence": "~1:2.500 (alta em populacoes africanas)",
        "orphanet": "232", "omim": "603903", "mondo": "MONDO:0011382",
        "example": {"kind": "variant", "id": "rs334"},
    },
    {
        "id": "talassemia-beta",
        "name": "Talassemia beta",
        "category": "Hematologia",
        "inheritance": "AR",
        "genes": ["HBB"],
        "short": "Reducao ou ausencia de sintese da cadeia beta da hemoglobina, "
                 "levando a anemia microcitica de gravidade variavel.",
        "hpo": ["Anemia microcitica", "Hepatoesplenomegalia", "Deformidades osseas", "Sobrecarga de ferro"],
        "prevalence": "Alta no Mediterraneo, Oriente Medio e Sudeste Asiatico",
        "orphanet": "848", "omim": "613985", "mondo": "MONDO:0019402",
    },
    {
        "id": "sindrome-de-lynch",
        "name": "Sindrome de Lynch",
        "category": "Oncogenetica",
        "inheritance": "AD",
        "genes": ["MLH1", "MSH2", "MSH6", "PMS2", "EPCAM"],
        "short": "Deficiencia de reparo de malpareamento (MMR); variantes de perda de "
                 "funcao elevam o risco de cancer colorretal e de endometrio.",
        "hpo": ["Cancer colorretal", "Cancer de endometrio", "Instabilidade de microssatelites"],
        "prevalence": "~1:279",
        "orphanet": "144", "omim": "120435", "mondo": "MONDO:0005835",
        "example": {"kind": "gene", "id": "MLH1"},
    },
    {
        "id": "cancer-mama-ovario-hereditario",
        "name": "Cancer de mama e ovario hereditario",
        "category": "Oncogenetica",
        "inheritance": "AD",
        "genes": ["BRCA1", "BRCA2"],
        "short": "Variantes germinativas em genes de reparo por recombinacao homologa "
                 "que aumentam muito o risco de cancer de mama e ovario.",
        "hpo": ["Cancer de mama", "Cancer de ovario", "Historia familiar precoce"],
        "prevalence": "~1:400 (portadores BRCA1/2)",
        "orphanet": "145", "omim": "604370", "mondo": "MONDO:0003582",
    },
    {
        "id": "polipose-adenomatosa-familiar",
        "name": "Polipose adenomatosa familiar",
        "category": "Oncogenetica",
        "inheritance": "AD",
        "genes": ["APC"],
        "short": "Centenas a milhares de polipos adenomatosos no colon por perda de "
                 "funcao do supressor tumoral APC, com risco quase certo de cancer.",
        "hpo": ["Polipose colonica", "Cancer colorretal", "Hipertrofia do epitelio pigmentar da retina"],
        "prevalence": "~1:8.000",
        "orphanet": "733", "omim": "175100", "mondo": "MONDO:0021056",
    },
    {
        "id": "sindrome-de-li-fraumeni",
        "name": "Sindrome de Li-Fraumeni",
        "category": "Oncogenetica",
        "inheritance": "AD",
        "genes": ["TP53"],
        "short": "Predisposicao a multiplos tumores por variantes germinativas no "
                 "guardiao do genoma TP53.",
        "hpo": ["Sarcomas", "Cancer de mama precoce", "Tumores cerebrais", "Carcinoma adrenocortical"],
        "prevalence": "Rara",
        "orphanet": "524", "omim": "151623", "mondo": "MONDO:0018875",
    },
    {
        "id": "von-hippel-lindau",
        "name": "Doenca de von Hippel-Lindau",
        "category": "Oncogenetica",
        "inheritance": "AD",
        "genes": ["VHL"],
        "short": "Supressor tumoral; variantes germinativas predispoem a tumores "
                 "altamente vascularizados em varios orgaos.",
        "hpo": ["Hemangioblastomas", "Carcinoma renal de celulas claras", "Feocromocitoma"],
        "prevalence": "~1:36.000",
        "orphanet": "892", "omim": "193300", "mondo": "MONDO:0008667",
        "example": {"kind": "gene", "id": "VHL"},
    },
    {
        "id": "neurofibromatose-tipo-1",
        "name": "Neurofibromatose tipo 1",
        "category": "Oncogenetica",
        "inheritance": "AD",
        "genes": ["NF1"],
        "short": "Perda de funcao da neurofibromina, regulador da via RAS, com "
                 "manchas cafe-com-leite e neurofibromas.",
        "hpo": ["Manchas cafe-com-leite", "Neurofibromas", "Nodulos de Lisch", "Gliomas opticos"],
        "prevalence": "~1:3.000",
        "orphanet": "636", "omim": "162200", "mondo": "MONDO:0018975",
    },
    {
        "id": "hipercolesterolemia-familiar",
        "name": "Hipercolesterolemia familiar",
        "category": "Cardiometabolico",
        "inheritance": "AD",
        "genes": ["LDLR", "APOB", "PCSK9"],
        "short": "Receptor de LDL e vias associadas; variantes patogenicas elevam o "
                 "colesterol LDL desde a infancia e antecipam a doenca cardiovascular.",
        "hpo": ["LDL muito elevado", "Xantomas tendineos", "Doenca coronariana precoce"],
        "prevalence": "~1:250",
        "orphanet": "391665", "omim": "143890", "mondo": "MONDO:0007750",
        "example": {"kind": "gene", "id": "LDLR"},
    },
    {
        "id": "hemocromatose-hereditaria",
        "name": "Hemocromatose hereditaria",
        "category": "Cardiometabolico",
        "inheritance": "AR",
        "genes": ["HFE"],
        "short": "C282Y no gene HFE; absorcao excessiva de ferro com penetrancia "
                 "variavel e sobrecarga em figado, coracao e pancreas.",
        "hpo": ["Sobrecarga de ferro", "Cirrose", "Diabetes", "Artropatia"],
        "prevalence": "~1:200 (homozigotos C282Y em europeus)",
        "orphanet": "465508", "omim": "235200", "mondo": "MONDO:0021001",
        "example": {"kind": "variant", "id": "rs1800562"},
    },
    {
        "id": "trombofilia-fator-v-leiden",
        "name": "Trombofilia por Fator V de Leiden",
        "category": "Cardiometabolico",
        "inheritance": "AD",
        "genes": ["F5"],
        "short": "Variante do gene F5 que torna o Fator Va resistente a clivagem pela "
                 "proteina C ativada, a trombofilia hereditaria mais comum em europeus.",
        "hpo": ["Trombose venosa profunda", "Embolia pulmonar", "Trombofilia"],
        "prevalence": "~3-8% de heterozigotos em europeus",
        "orphanet": "465", "omim": "188055", "mondo": "MONDO:0008090",
        "example": {"kind": "variant", "id": "rs6025"},
    },
    {
        "id": "cardiomiopatia-hipertrofica",
        "name": "Cardiomiopatia hipertrofica familiar",
        "category": "Cardiometabolico",
        "inheritance": "AD",
        "genes": ["MYH7", "MYBPC3", "TNNT2", "TNNI3"],
        "short": "Hipertrofia ventricular por variantes em genes do sarcomero; causa "
                 "importante de morte subita em jovens.",
        "hpo": ["Hipertrofia ventricular esquerda", "Arritmias", "Morte subita cardiaca"],
        "prevalence": "~1:500",
        "orphanet": "217569", "omim": "192600", "mondo": "MONDO:0005045",
    },
    {
        "id": "fibrose-cistica",
        "name": "Fibrose cistica",
        "category": "Multissistemico",
        "inheritance": "AR",
        "genes": ["CFTR"],
        "short": "Disfuncao do canal de cloreto CFTR (mais comum F508del) com secrecoes "
                 "espessas em pulmoes, pancreas e intestino.",
        "hpo": ["Doenca pulmonar cronica", "Insuficiencia pancreatica", "Cloreto elevado no suor"],
        "prevalence": "~1:2.500 em europeus",
        "orphanet": "586", "omim": "219700", "mondo": "MONDO:0009061",
    },
    {
        "id": "deficiencia-alfa1-antitripsina",
        "name": "Deficiencia de alfa-1 antitripsina",
        "category": "Multissistemico",
        "inheritance": "AR",
        "genes": ["SERPINA1"],
        "short": "Niveis baixos de alfa-1 antitripsina (aleles PiZ/PiS) predispondo a "
                 "enfisema precoce e doenca hepatica.",
        "hpo": ["Enfisema precoce", "Doenca hepatica", "DPOC"],
        "prevalence": "~1:2.000-5.000 em europeus",
        "orphanet": "60", "omim": "613490", "mondo": "MONDO:0013282",
    },
    {
        "id": "doenca-de-wilson",
        "name": "Doenca de Wilson",
        "category": "Multissistemico",
        "inheritance": "AR",
        "genes": ["ATP7B"],
        "short": "Acumulo toxico de cobre por defeito na ATPase ATP7B, afetando figado "
                 "e sistema nervoso.",
        "hpo": ["Cirrose", "Aneis de Kayser-Fleischer", "Distonia", "Tremor"],
        "prevalence": "~1:30.000",
        "orphanet": "905", "omim": "277900", "mondo": "MONDO:0010200",
    },
    {
        "id": "fenilcetonuria",
        "name": "Fenilcetonuria (PKU)",
        "category": "Erros inatos do metabolismo",
        "inheritance": "AR",
        "genes": ["PAH"],
        "short": "Deficiencia da fenilalanina hidroxilase; o acumulo de fenilalanina "
                 "causa lesao neurologica evitavel por dieta.",
        "hpo": ["Deficiencia intelectual (se nao tratada)", "Convulsoes", "Hipopigmentacao"],
        "prevalence": "~1:10.000",
        "orphanet": "716", "omim": "261600", "mondo": "MONDO:0009861",
    },
    {
        "id": "doenca-de-tay-sachs",
        "name": "Doenca de Tay-Sachs",
        "category": "Erros inatos do metabolismo",
        "inheritance": "AR",
        "genes": ["HEXA"],
        "short": "Deficiencia da hexosaminidase A com acumulo de gangliosideos GM2 e "
                 "neurodegeneracao progressiva.",
        "hpo": ["Regressao neurologica", "Mancha vermelho-cereja na macula", "Hipotonia"],
        "prevalence": "Elevada em judeus ashkenazi",
        "orphanet": "845", "omim": "272800", "mondo": "MONDO:0010056",
    },
    {
        "id": "distrofia-muscular-duchenne",
        "name": "Distrofia muscular de Duchenne",
        "category": "Neuromuscular",
        "inheritance": "XLR",
        "genes": ["DMD"],
        "short": "Ausencia de distrofina funcional por variantes no maior gene humano, "
                 "com fraqueza muscular progressiva na infancia.",
        "hpo": ["Fraqueza muscular progressiva", "Sinal de Gowers", "CK muito elevada", "Cardiomiopatia"],
        "prevalence": "~1:3.500-5.000 meninos",
        "orphanet": "98896", "omim": "310200", "mondo": "MONDO:0010679",
    },
    {
        "id": "atrofia-muscular-espinhal",
        "name": "Atrofia muscular espinhal",
        "category": "Neuromuscular",
        "inheritance": "AR",
        "genes": ["SMN1"],
        "short": "Perda de neuronios motores por deficiencia de SMN1; gravidade "
                 "modulada pelo numero de copias de SMN2.",
        "hpo": ["Hipotonia", "Fraqueza proximal", "Insuficiencia respiratoria"],
        "prevalence": "~1:10.000",
        "orphanet": "83330", "omim": "253300", "mondo": "MONDO:0018634",
    },
    {
        "id": "doenca-de-huntington",
        "name": "Doenca de Huntington",
        "category": "Neurologico",
        "inheritance": "AD",
        "genes": ["HTT"],
        "short": "Expansao de repeticoes CAG no gene HTT causando neurodegeneracao "
                 "com antecipacao entre geracoes.",
        "hpo": ["Coreia", "Declinio cognitivo", "Alteracoes psiquiatricas"],
        "prevalence": "~1:10.000 em europeus",
        "orphanet": "399", "omim": "143100", "mondo": "MONDO:0007739",
    },
    {
        "id": "sindrome-do-x-fragil",
        "name": "Sindrome do X fragil",
        "category": "Neurologico",
        "inheritance": "XL",
        "genes": ["FMR1"],
        "short": "Expansao CGG que silencia FMR1; causa hereditaria mais comum de "
                 "deficiencia intelectual e forma sindromica de autismo.",
        "hpo": ["Deficiencia intelectual", "Autismo", "Face alongada", "Macrorquidia"],
        "prevalence": "~1:4.000 homens",
        "orphanet": "908", "omim": "300624", "mondo": "MONDO:0010383",
    },
    {
        "id": "sindrome-de-rett",
        "name": "Sindrome de Rett",
        "category": "Neurologico",
        "inheritance": "XLD",
        "genes": ["MECP2"],
        "short": "Regressao do neurodesenvolvimento em meninas por variantes em MECP2, "
                 "com perda do uso proposital das maos.",
        "hpo": ["Regressao do desenvolvimento", "Estereotipias manuais", "Microcefalia adquirida"],
        "prevalence": "~1:10.000 meninas",
        "orphanet": "778", "omim": "312750", "mondo": "MONDO:0010726",
    },
    {
        "id": "sindrome-de-marfan",
        "name": "Sindrome de Marfan",
        "category": "Tecido conjuntivo",
        "inheritance": "AD",
        "genes": ["FBN1"],
        "short": "Defeito da fibrilina-1 com envolvimento esqueletico, ocular e "
                 "aortico; a dilatacao da aorta e o principal risco.",
        "hpo": ["Aracnodactilia", "Ectopia do cristalino", "Dilatacao da raiz da aorta", "Estatura alta"],
        "prevalence": "~1:5.000",
        "orphanet": "558", "omim": "154700", "mondo": "MONDO:0007947",
    },
    {
        "id": "ehlers-danlos-classica",
        "name": "Sindrome de Ehlers-Danlos (classica)",
        "category": "Tecido conjuntivo",
        "inheritance": "AD",
        "genes": ["COL5A1", "COL5A2"],
        "short": "Defeito do colageno tipo V com hiperextensibilidade da pele, "
                 "cicatrizacao anormal e hipermobilidade articular.",
        "hpo": ["Hiperextensibilidade cutanea", "Hipermobilidade articular", "Cicatrizes atroficas"],
        "prevalence": "~1:20.000",
        "orphanet": "287", "omim": "130000", "mondo": "MONDO:0007522",
    },
    {
        "id": "doenca-renal-policistica-ad",
        "name": "Doenca renal policistica autossomica dominante",
        "category": "Renal",
        "inheritance": "AD",
        "genes": ["PKD1", "PKD2"],
        "short": "Cistos renais progressivos que levam a insuficiencia renal; causa "
                 "hereditaria mais comum de doenca renal cronica.",
        "hpo": ["Cistos renais", "Hipertensao", "Insuficiencia renal", "Aneurismas intracranianos"],
        "prevalence": "~1:1.000",
        "orphanet": "730", "omim": "173900", "mondo": "MONDO:0008170",
    },
    {
        "id": "retinose-pigmentar",
        "name": "Retinose pigmentar",
        "category": "Oftalmogenetica",
        "inheritance": "AD",
        "genes": ["RHO", "RPGR", "USH2A"],
        "short": "Grupo geneticamente heterogeneo de degeneracoes de retina com perda "
                 "progressiva de fotorreceptores; heranca AD, AR ou ligada ao X.",
        "hpo": ["Cegueira noturna", "Constricao do campo visual", "Depositos pigmentares na retina"],
        "prevalence": "~1:4.000",
        "orphanet": "791", "omim": "268000", "mondo": "MONDO:0019200",
    },
]

# Indice por id para lookup O(1) no router de detalhe.
_BY_ID: Dict[str, Dict[str, Any]] = {d["id"]: d for d in RARE_DISEASES}


def all_diseases() -> List[Dict[str, Any]]:
    return RARE_DISEASES


def get_disease(disease_id: str) -> Optional[Dict[str, Any]]:
    return _BY_ID.get(disease_id)
