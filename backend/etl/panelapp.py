"""ETL do PanelApp (Genomics England) para o catalogo de paineis do GenVar.

Roda fora do ciclo de request: painel nao muda por requisicao, e sao 433 deles.
O resultado e um JSON versionado que o backend carrega na inicializacao.

Cache em disco por painel (`etl/.cache/panelapp/<id>.json`). Uma segunda
execucao nao repete nenhuma chamada de rede, entao dá para interromper e
retomar, e o ETL fica reproduzivel sem depender do servico estar no ar.

Uso:
    python -m etl.panelapp            # incremental, usa o cache
    python -m etl.panelapp --refresh  # ignora o cache e rebaixa tudo
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

API = "https://panelapp.genomicsengland.co.uk/api/v1"
CACHE = Path(__file__).parent / ".cache" / "panelapp"
SAIDA = Path(__file__).parent.parent / "app" / "data" / "panelapp_panels.json"

# Nivel 3 e o verde do PanelApp: evidencia suficiente para uso diagnostico.
# Ambar (2) e vermelho (1) ficam de fora do conjunto principal e entram
# separados, porque misturar os tres transforma um painel diagnostico numa
# lista de candidatos.
VERDE = "3"
AMBAR = "2"

# Requisicoes simultaneas. O servico e publico e gratuito; oito e suficiente
# para 433 paineis em pouco tempo sem parecer abuso.
CONCORRENCIA = 2
# Pausa entre requisicoes de um mesmo worker. O servico devolve 429 sem
# Retry-After em alguns casos, entao o ritmo tem de ser respeitoso na origem.
PAUSA = 0.35
TIMEOUT = 30.0


# O PanelApp acumulou nomes de grupo de geracoes diferentes de curadoria, entao
# "Neurology" e "Neurology and neurodevelopmental disorders" convivem, assim
# como "Metabolic" e "Metabolic disorders". Sao 41 rotulos para cerca de 17
# assuntos. Normalizar aqui, no ETL, e o que mantem a limpeza reproduzivel: a
# proxima execucao aplica o mesmo mapa em vez de alguem arrumar na mao.
CATEGORIA = {
    "Neurology": "Neurologia",
    "Neurology and neurodevelopmental disorders": "Neurologia",
    "Developmental disorders": "Neurologia",
    "Endocrinology": "Endocrinologia",
    "Endocrine disorders": "Endocrinologia",
    "Growth disorders": "Endocrinologia",
    "Metabolic": "Metabolismo",
    "Metabolic disorders": "Metabolismo",
    "Lipids": "Metabolismo",
    "Haematology": "Hematologia",
    "Haematological disorders": "Hematologia",
    "Haematological and immunological disorders": "Hematologia",
    "Inherited cancer": "Oncogenética",
    "Cancer Programme": "Oncogenética",
    "Cancer susceptibility": "Oncogenética",
    "Tumour syndromes": "Oncogenética",
    "Cardiology": "Cardiologia",
    "Cardiovascular disorders": "Cardiologia",
    "Dermatology": "Dermatologia",
    "Dermatological disorders": "Dermatologia",
    "Mitochondrial": "Mitocondrial",
    "Musculoskeletal": "Musculoesquelético",
    "Skeletal disorders": "Musculoesquelético",
    "Rheumatological disorders": "Musculoesquelético",
    "Immunology": "Imunologia",
    "Ophthalmology": "Oftalmologia",
    "Ophthalmological disorders": "Oftalmologia",
    "Renal": "Nefrologia",
    "Renal and urinary tract disorders": "Nefrologia",
    "Respiratory": "Pneumologia",
    "Respiratory disorders": "Pneumologia",
    "Gastrohepatology": "Gastro-hepatologia",
    "Gastroenterological disorders": "Gastro-hepatologia",
    "Dysmorphic and congenital abnormality syndromes": "Malformações congênitas",
    "Ciliopathies": "Malformações congênitas",
    "Fetal (including NIPD)": "Malformações congênitas",
    "Hearing and ear disorders": "Otorrinolaringologia",
    "Audiology": "Otorrinolaringologia",
    "Multispecialty": "Outros",
    "Viral research": "Outros",
}


def categoria(grupo: str) -> str:
    return CATEGORIA.get((grupo or "").strip(), "Outros")


def slug(nome: str) -> str:
    s = unicodedata.normalize("NFD", nome or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "painel"



def _agora() -> str:
    """Data da extracao, em UTC. Vai no JSON porque a pagina de fontes precisa
    dizer QUANDO cada catalogo foi extraido: dado publico muda, e um catalogo
    sem data e um catalogo sem validade declarada."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def _cliente() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, headers={"Accept": "application/json"},
                        follow_redirects=True)


def listar_paineis(cli: httpx.Client, refresh: bool = False) -> List[Dict[str, Any]]:
    """Percorre a paginacao da lista, que traz o indice mas nao os genes.

    O indice tambem vai para o cache: sem isso uma retomada apos 429 gasta as
    cinco primeiras chamadas so para redescobrir o que ja sabiamos.
    """
    alvo = CACHE / "_indice.json"
    if alvo.exists() and not refresh:
        return json.loads(alvo.read_text(encoding="utf-8"))
    out: List[Dict[str, Any]] = []
    url: Optional[str] = f"{API}/panels/"
    while url:
        # o indice leva o mesmo recuo do detalhe: uma janela de limite atinge
        # a paginacao tanto quanto o resto, e sem isto a retomada morre na
        # primeira pagina e nada do que ja foi baixado aproveita
        for tentativa in range(6):
            r = cli.get(url)
            if r.status_code != 429:
                break
            espera = float(r.headers.get("Retry-After") or (10 * (tentativa + 1)))
            print(f"  limite de taxa, aguardando {espera:.0f}s", flush=True)
            time.sleep(min(espera, 90))
        r.raise_for_status()
        d = r.json()
        out.extend(d.get("results") or [])
        url = d.get("next")
        print(f"  indice: {len(out)} paineis", end="\r", flush=True)
        time.sleep(PAUSA)
    print()
    alvo.parent.mkdir(parents=True, exist_ok=True)
    alvo.write_text(json.dumps(out), encoding="utf-8")
    return out


def detalhe(cli: httpx.Client, pid: int, refresh: bool) -> Optional[Dict[str, Any]]:
    """Detalhe de um painel, do cache quando ja baixado."""
    alvo = CACHE / f"{pid}.json"
    if alvo.exists() and not refresh:
        try:
            return json.loads(alvo.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            alvo.unlink(missing_ok=True)  # cache corrompido nao vale retomada

    for tentativa in range(5):
        try:
            r = cli.get(f"{API}/panels/{pid}/")
            if r.status_code == 429:
                # respeita o Retry-After quando existe; senao recua em degraus
                espera = float(r.headers.get("Retry-After") or (5 * (tentativa + 1)))
                time.sleep(min(espera, 60))
                continue
            r.raise_for_status()
            d = r.json()
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(json.dumps(d), encoding="utf-8")
            time.sleep(PAUSA)
            return d
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            if tentativa == 4:
                print(f"\n  painel {pid} falhou: {e}", file=sys.stderr)
                return None
            time.sleep(3.0 * (tentativa + 1))
    return None


_MOI_CURTO = [
    ("BIALLELIC", "Autossômica recessiva"),
    ("MONOALLELIC", "Autossômica dominante"),
    ("X-LINKED", "Ligada ao X"),
    ("MITOCHONDRIAL", "Mitocondrial"),
]


def heranca(genes: List[Dict[str, Any]]) -> str:
    """Resume os modos de heranca dos genes verdes num rotulo curto."""
    modos = set()
    for g in genes:
        m = (g.get("mode_of_inheritance") or "").upper()
        for chave, rotulo in _MOI_CURTO:
            if chave in m:
                modos.add(rotulo)
    if not modos:
        return "Não especificada"
    ordem = [r for _, r in _MOI_CURTO if r in modos]
    return " e ".join(ordem) if len(ordem) <= 2 else "Heterogênea"


def _gene(g: Dict[str, Any]) -> Dict[str, Any]:
    gd = g.get("gene_data") or {}
    ens = gd.get("ensembl_genes") or {}
    # o id Ensembl vem aninhado por build e por release; pegamos GRCh38
    ensembl = None
    b38 = ens.get("GRCh38") or {}
    if isinstance(b38, dict) and b38:
        primeiro = next(iter(b38.values()), None)
        if isinstance(primeiro, dict):
            ensembl = primeiro.get("ensembl_id")
    return {
        "symbol": g.get("entity_name"),
        "hgnc": gd.get("hgnc_id"),
        "ensembl": ensembl,
        "name": gd.get("gene_name"),
        "moi": g.get("mode_of_inheritance") or None,
        "phenotypes": g.get("phenotypes") or [],
    }


def _unicos(nomes: List[Optional[str]]) -> List[str]:
    """Remove repeticao preservando a ordem de aparicao."""
    visto, fora = set(), []
    for n in nomes:
        if n and n not in visto:
            visto.add(n)
            fora.append(n)
    return fora


def _unicos_por_simbolo(genes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """A primeira entrada de cada simbolo fica. Quando o mesmo gene aparece duas
    vezes no painel com modos de heranca diferentes, a divergencia e do dado de
    origem e escolher a segunda seria escolher pela ordem do arquivo."""
    visto, fora = set(), []
    for g in genes:
        s = g.get("symbol")
        if s and s not in visto:
            visto.add(s)
            fora.append(g)
    return fora


def transformar(d: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    genes = [g for g in (d.get("genes") or []) if g.get("entity_type") == "gene"]
    verdes = [g for g in genes if str(g.get("confidence_level")) == VERDE]
    ambares = [g for g in genes if str(g.get("confidence_level")) == AMBAR]
    if not verdes:
        return None  # painel sem gene verde nao e diagnostico, e so candidato

    nome = d.get("name") or ""
    return {
        "id": f"pa-{slug(nome)}",
        "source": "panelapp",
        "source_id": d.get("id"),
        "version": d.get("version"),
        "name": nome,
        "category": categoria(d.get("disease_group")),
        "category_source": d.get("disease_group") or "",
        "sub_category": d.get("disease_sub_group") or "",
        "inheritance": heranca(verdes),
        # Sem repeticao. Treze paineis do PanelApp trazem o mesmo gene duas
        # vezes, e os super paineis trazem por juntarem sub-paineis que se
        # sobrepoem. Na tela isso virava chave de React duplicada, que o React
        # avisa e cujo efeito e omitir ou duplicar linha em silencio.
        "genes": _unicos([g.get("entity_name") for g in verdes]),
        "genes_detail": _unicos_por_simbolo([_gene(g) for g in verdes]),
        "genes_amber": _unicos([g.get("entity_name") for g in ambares]),
        "conditions": d.get("relevant_disorders") or [],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="ignora o cache em disco")
    ap.add_argument("--limit", type=int, default=0, help="so os N primeiros, para teste")
    args = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    with _cliente() as cli:
        print("Baixando o indice do PanelApp...")
        indice = listar_paineis(cli, args.refresh)
        if args.limit:
            indice = indice[: args.limit]
        print(f"{len(indice)} paineis no indice. Buscando detalhes...")

        detalhes: List[Dict[str, Any]] = []
        feitos = 0
        with ThreadPoolExecutor(max_workers=CONCORRENCIA) as pool:
            for d in pool.map(lambda p: detalhe(cli, p["id"], args.refresh), indice):
                feitos += 1
                if d:
                    detalhes.append(d)
                print(f"  detalhes: {feitos}/{len(indice)}", end="\r", flush=True)
        print()

    paineis = [t for t in (transformar(d) for d in detalhes) if t]
    paineis.sort(key=lambda p: (p["category"], p["name"]))

    genes = sorted({g for p in paineis for g in p["genes"]})

    # Normaliza o detalhe por gene antes de gravar. Um gene aparece em media em
    # oito paineis, e o simbolo, o HGNC, o Ensembl e o nome sao os mesmos em
    # todos: repeti-los custava 1,8 MB. As listas de fenotipo tambem se repetem,
    # porque o mesmo gene costuma trazer o mesmo conjunto em paineis diferentes,
    # entao elas viram um repertorio referenciado por indice. O modo de heranca
    # (MOI) NAO entra nisso: o PanelApp o cura por painel, e o mesmo gene pode
    # ter heranca diferente em contextos diferentes.
    catalogo: Dict[str, Dict[str, Any]] = {}
    fenotipos: List[List[str]] = []
    indice_fen: Dict[str, int] = {}
    for pa in paineis:
        magro = []
        for g in pa.pop("genes_detail", []):
            sim = g["symbol"]
            catalogo.setdefault(sim, {
                "hgnc": g.get("hgnc"), "ensembl": g.get("ensembl"), "name": g.get("name"),
            })
            fen = g.get("phenotypes") or []
            chave = "\u0000".join(fen)
            if chave not in indice_fen:
                indice_fen[chave] = len(fenotipos)
                fenotipos.append(fen)
            magro.append([sim, g.get("moi") or "", indice_fen[chave]])
        pa["genes_ref"] = magro

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps({
        "source": "Genomics England PanelApp",
        "api": API,
        "generated_at": _agora(),
        "formato": "genes_ref e [simbolo, heranca, indice em fenotipos]; o resto do gene mora em catalogo_genes",
        "catalogo_genes": catalogo,
        "fenotipos": fenotipos,
        "panels": paineis,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{len(paineis)} paineis com gene verde, {len(genes)} genes distintos")
    print(f"{len(catalogo)} genes no catalogo, {len(fenotipos)} listas de fenotipo distintas")
    print(f"{SAIDA.stat().st_size/1e6:.1f} MB")
    print(f"escrito em {SAIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
