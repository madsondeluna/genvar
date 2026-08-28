"""ETL do PGS Catalog para o modulo poligenico do GenVar.

Mesmo desenho do ETL do PanelApp: roda fora do request, guarda cada pagina em
cache de disco e escreve um JSON versionado. Sao quase 7 mil escores, entao a
lista vem paginada e o cache torna a retomada barata.

Uso:
    python -m etl.pgscatalog
    python -m etl.pgscatalog --refresh
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

API = "https://www.pgscatalog.org/rest"
CACHE = Path(__file__).parent / ".cache" / "pgscatalog"
SAIDA = Path(__file__).parent.parent / "app" / "data" / "pgs_catalog.json"

PAGINA = 250
PAUSA = 0.25
TIMEOUT = 45.0

# Ancestrias do PGS Catalog mapeadas para as chaves que a camada de burden ja
# usa. Sem isso o poligenico e o burden falariam de ancestria com vocabularios
# diferentes na mesma tela.
ANC = {
    "EUR": "EUR", "AFR": "AFR", "AMR": "AMR", "EAS": "EAS", "SAS": "SAS",
    "GME": "MID", "MAE": "MID", "OTH": "OTH", "NR": "NR", "MAO": "OTH",
}


# O proprio PGS Catalog mantem uma taxonomia de 16 categorias, com os traits
# EFO de cada uma. Usar a dele, e nao uma regra de palavra-chave minha, e o que
# separa classificacao de chute: 6982 escores cobrem traits demais para
# qualquer heuristica escrita a mao acertar.
CATEGORIA_PT = {
    "Biological process": "Processo biológico",
    "Body measurement": "Medida corporal",
    "Cardiovascular disease": "Doença cardiovascular",
    "Cardiovascular measurement": "Medida cardiovascular",
    "Digestive system disorder": "Aparelho digestivo",
    "Hematological measurement": "Medida hematológica",
    "Immune system disorder": "Sistema imune",
    "Inflammatory measurement": "Medida inflamatória",
    "Lipid or lipoprotein measurement": "Lipídeos",
    "Metabolic disorder": "Doença metabólica",
    "Neurological disorder": "Doença neurológica",
    "Other disease": "Outras doenças",
    "Other measurement": "Outras medidas",
    "Other trait": "Outros traços",
    "Response to drug": "Resposta a fármaco",
    "Sex-specific PGS": "Específico por sexo",
    "Cancer": "Câncer",
}


def mapa_categorias(cli: httpx.Client, refresh: bool) -> Dict[str, str]:
    """EFO trait id -> rotulo de categoria, direto da taxonomia do catalogo."""
    alvo = CACHE / "_categorias.json"
    if alvo.exists() and not refresh:
        try:
            return json.loads(alvo.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            alvo.unlink(missing_ok=True)
    r = cli.get(f"{API}/trait_category/all")
    r.raise_for_status()
    d = r.json()
    res = d.get("results") if isinstance(d, dict) else d
    out: Dict[str, str] = {}
    for c in res or []:
        rotulo = CATEGORIA_PT.get(c.get("label"), c.get("label") or "Outros traços")
        for t in c.get("efotraits") or []:
            if t.get("id"):
                out[t["id"]] = rotulo
    alvo.parent.mkdir(parents=True, exist_ok=True)
    alvo.write_text(json.dumps(out), encoding="utf-8")
    return out



def _agora() -> str:
    """Data da extracao, em UTC. Vai no JSON porque a pagina de fontes precisa
    dizer QUANDO cada catalogo foi extraido: dado publico muda, e um catalogo
    sem data e um catalogo sem validade declarada."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def _cli() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, headers={"Accept": "application/json"},
                        follow_redirects=True)


def pagina(cli: httpx.Client, offset: int, refresh: bool) -> Optional[Dict[str, Any]]:
    alvo = CACHE / f"offset-{offset}.json"
    if alvo.exists() and not refresh:
        try:
            return json.loads(alvo.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            alvo.unlink(missing_ok=True)
    for tentativa in range(5):
        try:
            r = cli.get(f"{API}/score/all", params={"limit": PAGINA, "offset": offset})
            if r.status_code == 429:
                time.sleep(min(float(r.headers.get("Retry-After") or 10 * (tentativa + 1)), 60))
                continue
            r.raise_for_status()
            d = r.json()
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(json.dumps(d), encoding="utf-8")
            time.sleep(PAUSA)
            return d
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            if tentativa == 4:
                print(f"\n  offset {offset} falhou: {e}", file=sys.stderr)
                return None
            time.sleep(3.0 * (tentativa + 1))
    return None


def _ancestria(d: Dict[str, Any]) -> Dict[str, int]:
    """Composicao de ancestria do conjunto de DESENVOLVIMENTO do escore.

    E o numero que decide se um escore se aplica a uma populacao: um PGS
    treinado 100% em EUR tem desempenho conhecido pior fora dela, e essa e a
    informacao que falta na maioria das interfaces de risco poligenico.
    """
    ad = (d.get("ancestry_distribution") or {}).get("gwas") or {}
    dist = ad.get("dist") or {}
    out: Dict[str, int] = {}
    for k, v in dist.items():
        chave = ANC.get(k, k)
        out[chave] = out.get(chave, 0) + int(round(float(v)))
    return out


# Traducao dos tracos, do arquivo ao lado. Os 200 mais frequentes cobrem 52% das
# aparicoes; o resto fica no ingles do PGS Catalog, que e melhor que traducao
# automatica errada num nome de doenca.
_TRADUCOES = Path(__file__).parent / "traducoes" / "pgs_traits_pt_br.tsv"


def _carregar_traducoes() -> Dict[str, str]:
    if not _TRADUCOES.exists():
        return {}
    fora = {}
    for i, linha in enumerate(_TRADUCOES.read_text(encoding="utf-8").splitlines()):
        if i == 0 or not linha.strip():
            continue
        col = linha.split("\t")
        if len(col) >= 2 and col[1].strip():
            fora[col[0].strip()] = col[1].strip()
    return fora


TRAITS_PT = _carregar_traducoes()


def traduzir_trait(nome: str) -> str:
    return TRAITS_PT.get(nome.strip(), nome)


# Nomes de metodo estatistico. Sao termos tecnicos com traducao estabelecida na
# literatura em portugues; os que nao tem ficam como estao, porque inventar
# traducao para nome de metodo atrapalha quem vai procurar o artigo.
METODOS_PT = {
    "Pruning and Thresholding (P+T)": "Poda e limiar (P+T)",
    "Clumping and Thresholding (C+T)": "Agrupamento e limiar (C+T)",
    "LDpred": "LDpred",
    "LDpred2": "LDpred2",
    "lassosum": "lassosum",
    "PRS-CS": "PRS-CS",
    "PRScs": "PRS-CS",
    "SBayesR": "SBayesR",
    "Genome-wide significant variants": "Variantes com significância genômica",
    "Genome-wide significant associations": "Associações com significância genômica",
    "Established variants": "Variantes já estabelecidas",
    "Known susceptibility variants": "Variantes de suscetibilidade conhecidas",
    "Weighted sum of risk alleles": "Soma ponderada de alelos de risco",
    "Unweighted sum of risk alleles": "Soma não ponderada de alelos de risco",
    "log-OR weighted sum of risk allele dosages":
        "Soma de dosagens de alelo de risco ponderada pelo log da razao de chances",
    "Metascore": "Metaescore",
    "Hard thresholding": "Limiar rígido",
    "Hazard model with stepwise selection of SNP inclusion":
        "Modelo de riscos proporcionais com seleção de SNP passo a passo",
    "Interaction modelling": "Modelagem de interação",
    "Genome-wide significant associations and interaction modelling":
        "Associações com significância genômica e modelagem de interação",
    "Snpnet": "snpnet",
    "Elastic net": "Rede elástica",
    "Lasso": "Lasso",
    "Ridge regression": "Regressão de crista",
    "Bayesian": "Bayesiano",
    "Stepwise regression": "Regressão passo a passo",
    "Polygenic hazard score": "Escore poligênico de risco proporcional",
    "Meta-analysis": "Metanálise",
    "Hard-Thresholding Stepwise Forward Regression":
        "Regressão passo a passo progressiva com limiar rígido",
    "Stepwise Forward Regression": "Regressão passo a passo progressiva",
    "Weighted sum of risk allele dosages": "Soma ponderada de dosagens de alelo de risco",
    "Sum of risk alleles": "Soma de alelos de risco",
}


def traduzir_metodo(nome: str) -> str:
    n = nome.strip()
    if n in METODOS_PT:
        return METODOS_PT[n]
    # Traducao parcial e pior que nenhuma: "Associacoes com significancia
    # genomica and interaction modelling" mistura os dois idiomas na mesma frase.
    # So se aceita o prefixo quando o que sobra tambem tem traducao.
    for en, pt in METODOS_PT.items():
        for sep in (" and ", ", ", " with ", " + "):
            if n.startswith(en + sep):
                resto = n[len(en) + len(sep):]
                if resto in METODOS_PT:
                    ligacao = {" and ": " e ", ", ": ", ", " with ": " com ", " + ": " + "}[sep]
                    return pt + ligacao + METODOS_PT[resto][0].lower() + METODOS_PT[resto][1:]
    return n


def transformar(d: Dict[str, Any], cats: Dict[str, str]) -> Optional[Dict[str, Any]]:
    if not d.get("id"):
        return None
    pub = d.get("publication") or {}
    efo = d.get("trait_efo") or []
    anc = _ancestria(d)
    # um escore pode ter mais de um trait EFO; fica com a primeira categoria
    # conhecida, e cai em "Outros tracos" quando nenhuma delas esta na taxonomia
    categoria = next((cats[t["id"]] for t in efo if t.get("id") in cats), "Outros traços")
    return {
        "id": d["id"],
        "source": "pgs_catalog",
        "name": d.get("name") or d["id"],
        "trait": traduzir_trait(d.get("trait_reported") or ""),
        # O nome como o PGS Catalog publica, sempre. A traducao e para leitura;
        # a busca por termo em ingles tem de continuar funcionando, e a citacao
        # do escore precisa bater com a fonte.
        "trait_original": d.get("trait_reported") or "",
        "category": categoria,
        "trait_efo": [{"id": t.get("id"), "label": t.get("label")} for t in efo],
        "n_variants": d.get("variants_number"),
        "build": d.get("variants_genomebuild"),
        "method": traduzir_metodo(d.get("method_name") or ""),
        "method_original": d.get("method_name") or "",
        "citation": " ".join(x for x in [pub.get("firstauthor"), str(pub.get("pub_year") or "")] if x).strip(),
        "journal": pub.get("journal") or "",
        "doi": pub.get("doi") or "",
        "ancestry": anc,
        # um escore desenvolvido so em europeus e o caso mais comum e o mais
        # problematico; marcar isso aqui evita recalcular em toda tela
        "eur_only": set(anc) == {"EUR"},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--max", type=int, default=0, help="teto de escores, para teste")
    args = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    escores: List[Dict[str, Any]] = []
    with _cli() as cli:
        cats = mapa_categorias(cli, args.refresh)
        print(f"{len(cats)} traits EFO mapeados para categoria")
        primeira = pagina(cli, 0, args.refresh)
        if not primeira:
            print("nao foi possivel ler a primeira pagina", file=sys.stderr)
            return 1
        total = primeira["count"]
        if args.max:
            total = min(total, args.max)
        escores.extend(primeira["results"])
        offset = PAGINA
        while offset < total:
            d = pagina(cli, offset, args.refresh)
            if d:
                escores.extend(d["results"])
            offset += PAGINA
            print(f"  {min(len(escores), total)}/{total} escores", end="\r", flush=True)
    print()

    saida = [t for t in (transformar(e, cats) for e in escores[: args.max or None]) if t]
    saida.sort(key=lambda s: s["id"])
    SAIDA.write_text(json.dumps({
        "source": "PGS Catalog",
        "api": API,
        "generated_at": _agora(),
        "scores": saida,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    so_eur = sum(1 for s in saida if s["eur_only"])
    print(f"{len(saida)} escores, {so_eur} desenvolvidos so em europeus "
          f"({round(so_eur / max(len(saida), 1) * 100)}%)")
    print(f"escrito em {SAIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
