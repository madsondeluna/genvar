import httpx
from typing import Any, Dict, Optional

# O glossario de metodos ja existe no ETL e e mantido la. Importar em vez de
# copiar: duas listas do mesmo vocabulario divergem na primeira vez que alguem
# acrescenta um metodo a uma delas.
try:
    from etl.pgscatalog import traduzir_metodo
except Exception:  # pragma: no cover - o ETL nao acompanha a imagem de runtime
    def traduzir_metodo(nome):
        return nome

# Ancestria por extenso, como o catalogo escreve no bloco de desempenho. O bloco
# de distribuicao usa sigla e e traduzido no front; aqui vem o nome completo.
ANCESTRIA_PT = {
    "European": "Europeia",
    "African": "Africana",
    "African American or Afro-Caribbean": "Afro-americana ou afro-caribenha",
    "African unspecified": "Africana não especificada",
    "East Asian": "Leste asiática",
    "South Asian": "Sul asiática",
    "South East Asian": "Sudeste asiática",
    "Asian unspecified": "Asiática não especificada",
    "Hispanic or Latin American": "Hispânica ou latino-americana",
    "Greater Middle Eastern (Middle Eastern, North African or Persian)":
        "Oriente Médio, Norte da África ou Persa",
    "Oceanian": "Oceânica",
    "Native American": "Nativa americana",
    "Aboriginal Australian": "Aborígene australiana",
    "Additional Asian Ancestries": "Outras ancestrias asiáticas",
    "Additional Diverse Ancestries": "Outras ancestrias",
    "Multi-ancestry (including European)": "Múltiplas, incluindo europeia",
    "Multi-ancestry (excluding European)": "Múltiplas, excluindo europeia",
    "Not reported": "Não informada",
    "NR": "Não informada",
}

# Identificacao da origem. Servico publico sem User-Agent e a primeira coisa
# que um mantenedor bloqueia quando precisa cortar trafego anonimo.
UA = "GenVar/2.0 (+https://github.com/madsondeluna/genvar)"

# PGS Catalog (EBI), API publica REST. Enriquece um escore poligenico com o
# numero de variantes, a publicacao e a distribuicao de ancestrias das amostras
# de desenvolvimento e avaliacao. Fonte que mantem o dado atualizado por API.
BASE_URL = "https://www.pgscatalog.org/rest"
TIMEOUT = 30.0


async def get_score(score_id: str) -> Optional[Dict[str, Any]]:
    """Detalhe de um escore (PGS ID) pela API do PGS Catalog. None se ausente."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/score/{score_id}",
            timeout=TIMEOUT,
            headers={"Accept": "application/json", "User-Agent": UA},
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data = response.json()

    pub = data.get("publication") or {}
    samples = data.get("samples_variants") or []
    # Ancestrias das amostras de desenvolvimento (broad ancestry category).
    ancestries: Dict[str, int] = {}
    for s in samples:
        anc = s.get("ancestry_broad")
        n = s.get("sample_number") or 0
        if anc:
            ancestries[anc] = ancestries.get(anc, 0) + int(n)

    # `ancestry_distribution` traz as TRES fases separadas, e a separacao e o
    # ponto: `gwas` e a populacao do estudo de associacao que gerou os pesos,
    # `dev` e a do ajuste do escore e `eval` e a das coortes onde ele foi
    # testado. Um escore treinado so em europeus e avaliado so em europeus nao
    # diz nada sobre quem nao e, e somar as tres numa media esconde exatamente
    # isso.
    dist = data.get("ancestry_distribution") or {}

    def _fase(nome):
        f = dist.get(nome) or {}
        return {"dist": f.get("dist") or {}, "count": f.get("count")}

    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "trait_reported": data.get("trait_reported"),
        "trait_efo": [t.get("label") for t in (data.get("trait_efo") or []) if t.get("label")],
        "n_variants": data.get("variants_number"),
        "method": traduzir_metodo(data.get("method_name") or "") or None,
        "method_params": data.get("method_params"),
        "genome_build": data.get("variants_genomebuild"),
        # "NR" e como o catalogo grava "nao reportado". Deixar a sigla vazar
        # para a tela poe o leitor para adivinhar.
        "weight_type": (None if (data.get("weight_type") or "").strip() in ("", "NR")
                        else data.get("weight_type")),
        "release_date": data.get("date_release"),
        "license": data.get("license"),
        "scoring_file": data.get("ftp_scoring_file"),
        "publication": {
            "title": pub.get("title"),
            "author": pub.get("firstauthor"),
            "journal": pub.get("journal"),
            "year": pub.get("date_publication", "")[:4] if pub.get("date_publication") else None,
            "doi": pub.get("doi"),
            "pmid": str(pub["PMID"]) if pub.get("PMID") is not None else None,
        },
        "ancestry_dev": ancestries,
        "ancestry_gwas": _fase("gwas"),
        "ancestry_dist_dev": _fase("dev"),
        "ancestry_eval": _fase("eval"),
    }


# Metrica de desempenho a mostrar. O catalogo publica tres familias e a ordem
# aqui e a de utilidade clinica: tamanho de efeito primeiro, depois discriminacao
# (AUROC, C-index), depois o resto.
async def get_performance(score_id: str, limite: int = 40):
    """Avaliacoes publicadas de um escore, com coorte, ancestria e efeito.

    E o que responde "esse escore funciona, e em quem". Um escore sem avaliacao
    fora da populacao de desenvolvimento nao esta errado: esta nao testado, e a
    distincao some quando a pagina mostra so o numero de variantes.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/performance/search",
            params={"pgs_id": score_id, "limit": limite},
            timeout=TIMEOUT,
            headers={"Accept": "application/json", "User-Agent": UA},
        )
        if r.status_code == 404:
            return []
        r.raise_for_status()
        payload = r.json()

    fora = []
    for item in payload.get("results", []) or []:
        conjunto = item.get("sampleset") or {}
        amostras = conjunto.get("samples") or []
        ancestrias = sorted({ANCESTRIA_PT.get(a.get("ancestry_broad"), a.get("ancestry_broad"))
                             for a in amostras if a.get("ancestry_broad")})
        n = sum(int(a.get("sample_number") or 0) for a in amostras)
        metricas = item.get("performance_metrics") or {}

        def _metricas(chave):
            fora_m = []
            for m in metricas.get(chave) or []:
                fora_m.append({
                    "nome": m.get("name_long") or m.get("name_short"),
                    "sigla": m.get("name_short"),
                    "estimativa": m.get("estimate"),
                    "ic_min": m.get("ci_lower"),
                    "ic_max": m.get("ci_upper"),
                    "unidade": m.get("unit"),
                })
            return fora_m

        fora.append({
            "id": item.get("id"),
            "fenotipo": item.get("phenotyping_reported"),
            "coorte": conjunto.get("name") or conjunto.get("id"),
            "ancestrias": ancestrias,
            "n_amostras": n or None,
            "efeitos": _metricas("effect_sizes"),
            "discriminacao": _metricas("class_acc"),
            "outras": _metricas("othermetrics"),
            "covariaveis": item.get("covariates"),
            "publicacao": (item.get("publication") or {}).get("firstauthor"),
            "ano": ((item.get("publication") or {}).get("date_publication") or "")[:4] or None,
        })
    return fora
