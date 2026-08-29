#!/usr/bin/env python3
"""
Gera os diagramas de arquitetura em SVG.

Sao figuras de documentacao, nao interface: cor em hexadecimal literal e
Helvetica, porque `var(--token)` nao resolve quando o GitHub renderiza o SVG
dentro do README nem quando o arquivo entra no PDF da monografia. A paleta e a
mesma do draw.io que as duas primeiras versoes ja usavam, para as tres figuras
sairem iguais.

Seta e sempre marcador desenhado, nunca o caractere U+2192: Helvetica nao tem
glifo para ele e o texto sai truncado no PDF.

Uso: python3 scripts/gera_diagramas.py
"""
from pathlib import Path
from xml.sax.saxutils import escape

DOCS = Path(__file__).resolve().parent.parent / "docs"
FONTE = 'Helvetica, Arial, sans-serif'

# Paleta draw.io, uma familia por camada.
AZUL, AZUL_B, AZUL_T = "#dae8fc", "#6c8ebf", "#eef4fc"      # apresentacao
VERDE, VERDE_B, VERDE_T = "#d5e8d4", "#82b366", "#eef6ec"   # aplicacao
LARANJA, LARANJA_B = "#ffe6cc", "#d79b00"                   # cache
ROXO, ROXO_B, ROXO_T = "#e1d5e7", "#9673a6", "#f3eef7"      # fontes ao vivo
AMARELO, AMARELO_B = "#fff2cc", "#d6b656"                   # dados embarcados
CINZA, CINZA_B, CINZA_T = "#f5f5f5", "#666666", "#fafafa"   # etapa offline
TINTA, RISCO = "#222222", "#555555"


# Larguras da Helvetica, em milesimos de em. Nao e a metrica completa da fonte:
# e o suficiente para quebrar a linha perto da largura certa. O alinhamento fino
# fica por conta de `textLength`, que forca a largura exata e nao depende desta
# estimativa estar perfeita.
_L = {" ": 278, ".": 278, ",": 278, ":": 278, ";": 278, "-": 333, "(": 333,
      ")": 333, "/": 278, "'": 191, '"': 355, "?": 556, "!": 278, "\u00b7": 333}
for _c, _w in zip("abcdefghijklmnopqrstuvwxyz",
                  (556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
                   556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500)):
    _L[_c] = _w
for _c, _w in zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                  (667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
                   722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611)):
    _L[_c] = _w
for _c in "0123456789":
    _L[_c] = 556
# Vogal acentuada mede o mesmo que a base; sem isso toda linha em portugues sai
# subestimada e a justificacao estica o que ja estava cheio.
for _a, _b in zip("áàâãäéêëíîïóôõöúûüçñ", "aaaaaeeeiiiooooouuucn"):
    _L[_a] = _L[_b]
    _L[_a.upper()] = _L[_b.upper()]


def _mede(txt, size):
    return sum(_L.get(c, 500) for c in txt) * size / 1000


class Svg:
    def __init__(self, w, h, titulo, subtitulo):
        self.w, self.h = w, h
        self.p = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" font-family="{FONTE}">',
            f'<rect width="{w}" height="{h}" fill="#ffffff"/>',
            '<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7.5" refY="3.2" '
            'orient="auto" markerUnits="userSpaceOnUse">'
            f'<path d="M0,0 L8,3.2 L0,6.4 z" fill="{RISCO}"/></marker></defs>',
        ]
        self.txt(w / 2, 38, titulo, 18, 700, "middle")
        self.txt(w / 2, 60, subtitulo, 12.5, 400, "middle", "#555555")

    def txt(self, x, y, s, size=11, weight=400, anchor="start", fill=TINTA):
        self.p.append(
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')

    def caixa(self, x, y, w, h, fill, stroke, rx=6, dash=None, largura=1.6):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" ry="{rx}" '
                      f'fill="{fill}" stroke="{stroke}" stroke-width="{largura}"{d}/>')

    def bloco(self, x, y, w, h, titulo, linhas, fill, stroke, rx=6, size=11):
        """Caixa com titulo em negrito e linhas centradas abaixo dele."""
        self.caixa(x, y, w, h, fill, stroke, rx)
        cx = x + w / 2
        self.txt(cx, y + 21, titulo, 12.5, 700, "middle")
        for i, l in enumerate(linhas):
            self.txt(cx, y + 39 + i * 15, l, size, 400, "middle", "#333333")

    def banda(self, x, y, w, h, rotulo, fill, stroke):
        self.caixa(x, y, w, h, fill, stroke, 8, dash="6 4", largura=1.4)
        self.txt(x + 20, y + 23, rotulo, 12, 700, "start", stroke)

    def seta(self, pontos, dash=None, largura=1.6):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        pts = " ".join(f"{a},{b}" for a, b in pontos)
        self.p.append(f'<polyline points="{pts}" fill="none" stroke="{RISCO}" '
                      f'stroke-width="{largura}"{d} marker-end="url(#arr)"/>')

    def etiqueta(self, x, y, s, size=10.5):
        w = len(s) * size * 0.52 + 14
        self.caixa(x - w / 2, y - 12, w, 19, "#ffffff", RISCO, 9, largura=0.8)
        self.txt(x, y + 1.5, s, size, 400, "middle", "#333333")

    def paragrafo(self, x, y, largura, texto, size=11, entrelinha=15, fill="#333333"):
        """Texto quebrado na largura e justificado, menos a ultima linha.

        SVG nao tem justificacao: o que existe e `textLength`, que forca a
        largura da linha, com `lengthAdjust="spacing"` distribuindo a diferenca
        pelos espacos em vez de esticar os glifos. Quebrar perto da largura
        certa antes disso e o que impede o estica-lo de aparecer.
        """
        palavras, linhas, atual = texto.split(), [], []
        for pal in palavras:
            teste = " ".join(atual + [pal])
            if atual and _mede(teste, size) > largura:
                linhas.append(atual)
                atual = [pal]
            else:
                atual.append(pal)
        if atual:
            linhas.append(atual)
        for i, linha in enumerate(linhas):
            txt = " ".join(linha)
            ultima = i == len(linhas) - 1
            comp = "" if ultima or len(linha) == 1 else (
                f' textLength="{largura:g}" lengthAdjust="spacing"')
            self.p.append(f'<text x="{x}" y="{y + i * entrelinha}" font-size="{size}" '
                          f'fill="{fill}"{comp}>{escape(txt)}</text>')
        return y + len(linhas) * entrelinha

    def legenda(self, y, itens):
        x = 64
        for fill, stroke, rotulo in itens:
            self.caixa(x, y, 22, 14, fill, stroke, 3, largura=1.3)
            self.txt(x + 30, y + 11.5, rotulo, 11, 400, "start", "#333333")
            x += 30 + len(rotulo) * 5.9 + 26

    def grava(self, nome):
        self.p.append("</svg>")
        alvo = DOCS / nome
        alvo.write_text("\n".join(self.p) + "\n", encoding="utf-8")
        print(f"  {nome}  {alvo.stat().st_size / 1024:.1f} KB")


def arquitetura():
    """Duas trilhas independentes: a que passa pela API e a que nao passa."""
    W, H = 1180, 1440
    s = Svg(W, H, "GenVar 3.0 — Arquitetura do sistema",
            "Dezessete telas no navegador, dezoito rotas de API, e um módulo de VCF que "
            "nunca fala com o servidor")

    s.bloco(490, 80, 200, 46, "Usuário", ["navegador web"], "#ffffff", "#666666", 12)
    s.seta([(590, 126), (590, 158)])

    # ---------------------------------------------------------------- navegador
    s.banda(40, 160, 1100, 400, "NAVEGADOR  —  React 18 + Vite · build estático · react-router",
            AZUL_T, AZUL_B)

    rotas = [
        ("Exploração", ["/gene/:símbolo · /variant/:rs", "/doencas · /doenca/:id"], AZUL, AZUL_B),
        ("Painéis e escores", ["/paineis · /painel/:id", "/poligenico · /escore/:id · /associacao"], AZUL, AZUL_B),
        ("Análise de VCF", ["/vcf · /lote", "sem chamada ao backend"], AMARELO, AMARELO_B),
        ("Meta", ["/ · /produtos · /status", "/fontes · /sobre · /colabore"], AZUL, AZUL_B),
    ]
    for i, (t, ls, f, st) in enumerate(rotas):
        s.bloco(64 + i * 267, 204, 249, 64, t, ls, f, st, size=10.5)

    s.bloco(64, 290, 520, 104, "Visualizações",
            ["Plotly.js · NGL (estrutura 3D) · Ideogram",
             "Manhattan em canvas · réguas ACMG",
             "@react-pdf/renderer para o laudo"], AZUL, AZUL_B)
    s.bloco(602, 290, 514, 104, "Módulo de VCF — treze módulos, tudo no navegador",
            ["parse · metricas · clinvar · interpretacao · acmg",
             "lote · saidas · exportar · pdf",
             "o arquivo do usuário não é enviado a servidor nenhum"], AMARELO, AMARELO_B)

    s.bloco(64, 412, 520, 104, "Cliente HTTP",
            ["axios sobre /api · TanStack Query",
             "chaves por rota, revalidação em foco",
             "erro e vazio são estados desenhados"], AZUL, AZUL_B)
    s.bloco(602, 412, 514, 104, "Catálogos embarcados — 41 MB de assets estáticos",
            ["ClinVar GRCh38 2026-08-22, 4.207.945 variantes",
             "76 fatias .json.gz por cromossomo e camada",
             "painéis · símbolos HGNC · ClinGen · CPIC · burden"], AMARELO, AMARELO_B)
    s.seta([(859, 394), (859, 412)])

    # ------------------------------------------------------------------ backend
    s.seta([(324, 516), (324, 600)])
    s.etiqueta(324, 558, "HTTP / JSON")
    s.banda(40, 600, 1100, 336, "BACKEND  —  FastAPI / Uvicorn · python:3.12-slim · porta 8000",
            VERDE_T, VERDE_B)

    s.bloco(64, 640, 350, 80, "Roteadores (8)",
            ["gene · variant · disease · panel",
             "pgs · suggest · sources · health"], VERDE, VERDE_B)
    s.bloco(432, 640, 310, 80, "Middleware",
            ["tempo de resposta · limite de taxa",
             "CORS · compressão"], VERDE, VERDE_B)
    s.bloco(760, 640, 356, 80, "Orquestração assíncrona",
            ["asyncio.gather, chamadas em paralelo",
             "agregação e classificação no servidor"], VERDE, VERDE_B)

    s.bloco(64, 740, 520, 96, "Serviços (8, um por fonte ao vivo)",
            ["ensembl · gnomad · clinvar · myvariant",
             "uniprot · alphafold · gwas_catalog · pgs_catalog"], VERDE, VERDE_B)
    s.bloco(602, 740, 514, 96, "Cache Redis 7 — read-through, TTL 1 h",
            ["gene:v6:{símbolo}:{com|sem} · genevars:v1 · genephen:v2",
             "variant:v3 · disease:v1 · diseasevars:v1 · panel:v1 · pgs:v3"],
            LARANJA, LARANJA_B, size=10.5)

    s.bloco(64, 856, 1052, 62, "Catálogos em memória do processo",
            ["orphanet_diseases.json 3,0 MB · panelapp_panels.json 4,2 MB · "
             "pgs_catalog.json 4,0 MB · painéis e doenças raras em módulos Python"],
            AMARELO, AMARELO_B, size=10.5)

    # ------------------------------------------------------------------- fontes
    s.seta([(590, 936), (590, 992)])
    s.etiqueta(590, 964, "requisições paralelas")
    s.banda(40, 992, 1100, 212,
            "FONTES CONSULTADAS AO VIVO  —  HTTPS, dentro do tempo da requisição", ROXO_T, ROXO_B)
    fontes = [
        ("Ensembl", ["REST · gene, VEP,", "overlap de variantes"]),
        ("gnomAD", ["GraphQL · frequências", "e restrição"]),
        ("ClinVar", ["E-utilities ·", "significância clínica"]),
        ("MyVariant.info", ["REST · escores", "preditivos"]),
        ("UniProt", ["REST · identificador", "da proteína"]),
        ("AlphaFold", ["REST · estrutura 3D", "e confiança pLDDT"]),
        ("GWAS Catalog", ["REST · associações", "genótipo-fenótipo"]),
        ("PGS Catalog", ["REST · escores", "poligênicos"]),
    ]
    for i, (t, ls) in enumerate(fontes):
        s.bloco(64 + (i % 4) * 267, 1032 + (i // 4) * 84, 249, 72, t, ls, ROXO, ROXO_B, size=10.5)

    # ---------------------------------------------------------------------- etl
    s.banda(40, 1240, 1100, 116,
            "COMPILAÇÃO PRÉVIA  —  ETL, fora do tempo da requisição", CINZA_T, CINZA_B)
    etl = ["clinvar.py", "orphanet.py", "panelapp.py", "pgscatalog.py",
           "clingen_cpic.py", "simbolos_e_paineis.py"]
    for i, nome in enumerate(etl):
        s.caixa(64 + i * 177, 1276, 165, 52, CINZA, CINZA_B, 6, largura=1.3)
        s.txt(64 + i * 177 + 82, 1298, nome, 11, 700, "middle")
        s.txt(64 + i * 177 + 82, 1315, "backend/etl", 10, 400, "middle", "#666666")

    # O ETL alimenta os dois conjuntos de catalogos, e os dois ficam longe dele.
    # As duas rotas correm pelas margens, fora de qualquer banda.
    s.seta([(40, 1298), (18, 1298), (18, 887), (64, 887)], dash="5 4", largura=1.4)
    s.seta([(1140, 1298), (1162, 1298), (1162, 464), (1116, 464)], dash="5 4", largura=1.4)

    s.legenda(1390, [
        (AZUL, AZUL_B, "Apresentação"),
        (VERDE, VERDE_B, "Aplicação"),
        (LARANJA, LARANJA_B, "Cache"),
        (ROXO, ROXO_B, "Fonte externa ao vivo"),
        (AMARELO, AMARELO_B, "Dado embarcado"),
        (CINZA, CINZA_B, "Etapa offline"),
    ])
    s.grava("genvar-arquitetura.svg")


def fluxo_vcf():
    """A trilha que nao passa pelo servidor, do arquivo ao laudo."""
    W, H = 980, 1110
    s = Svg(W, H, "GenVar 3.0 — Fluxo da análise de VCF no navegador",
            "Da escolha do arquivo às saídas, sem nenhuma requisição ao backend")

    cx, cw = 300, 300
    x = cx - cw / 2  # 150

    s.bloco(x, 86, cw, 60, "Usuário escolhe um arquivo",
            [".vcf ou .vcf.gz, do disco local"], "#f5f5f5", "#666666", 12)

    etapas = [
        (176, 84, "parse.js", ["descompressão por DecompressionStream",
                               "varredura por linha, sem carregar tudo em memória"]),
        (296, 84, "metricas.js", ["Ti/Tv, profundidade, qualidade, fração em dbSNP",
                                  "histogramas cortados no percentil 99"]),
        (416, 84, "clinvar.js", ["índice por cromossomo e camada de significado",
                                 "baixa só as fatias que o arquivo toca"]),
        (536, 100, "interpretacao.js + acmg.js", ["critérios ACMG e pontuação bayesiana",
                                                  "Tavtigian et al. (2018, 2020)",
                                                  "banda derivada do ponto, nunca fixada à mão"]),
        (672, 84, "saidas.js · exportar.js · pdf.jsx", ["mesma tabela para todos os formatos",
                                                        "sha256 do arquivo em toda saída"]),
    ]
    ant = 146
    for y, h, t, ls in etapas:
        s.seta([(cx, ant), (cx, y)])
        s.bloco(x, y, cw, h, t, ls, VERDE, VERDE_B, size=10.5)
        ant = y + h

    # Catalogo embarcado, o unico que trafega, e no sentido servidor para navegador.
    s.bloco(520, 400, 400, 116, "Catálogos embarcados (assets estáticos)",
            ["ClinVar GRCh38, versão 2026-08-22",
             "4.207.945 variantes em 76 arquivos .json.gz",
             "41 MB servidos como qualquer outro asset;",
             "é o único dado que trafega, e só nesse sentido"],
            AMARELO, AMARELO_B, size=10.5)
    s.seta([(520, 458), (450, 458)])

    # Triagem de coorte: a mesma sequencia, N arquivos. Faixa alta ao lado do
    # pipeline, porque lote.js nao e uma etapa dele: e o pipeline inteiro repetido.
    s.caixa(16, 176, 104, 580, AZUL, AZUL_B, 8)
    s.p.append(f'<text x="68" y="466" font-size="12.5" font-weight="700" fill="{TINTA}" '
               'text-anchor="middle" transform="rotate(-90 68 466)">lote.js  ·  /lote</text>')
    s.p.append(f'<text x="90" y="466" font-size="10.5" fill="#333333" text-anchor="middle" '
               'transform="rotate(-90 90 466)">a mesma sequência, N arquivos, resultado agregado'
               '</text>')
    s.seta([(120, 218), (146, 218)], dash="5 4", largura=1.4)

    # Saidas
    s.p.append(f'<polyline points="{cx},756 {cx},780" fill="none" stroke="{RISCO}" '
               'stroke-width="1.6"/>')
    saidas = [("TSV", "tabular"), ("CSV", "planilha"), ("JSON", "estruturado"),
              ("VCF", "anotado"), ("PDF", "laudo")]
    for i, (t, sub) in enumerate(saidas):
        bx = 64 + i * 172
        s.bloco(bx, 800, 156, 62, t, [sub], LARANJA, LARANJA_B, 12)
        s.seta([(bx + 78, 780), (bx + 78, 800)])
    s.p.append(f'<polyline points="64,780 916,780" fill="none" stroke="{RISCO}" stroke-width="1.6"/>')

    s.caixa(64, 900, 852, 92, "#ffffff", "#b3b3b3", 8, largura=1.4)
    s.txt(84, 926, "O arquivo do usuário não sai do navegador", 12.5, 700)
    s.paragrafo(84, 946, 812,
                "Nenhuma etapa acima faz requisição ao backend: não há upload, não há "
                "identificador de sessão e não há registro do que foi analisado. O que trafega "
                "são os catálogos embarcados, no sentido servidor para navegador, e eles são os "
                "mesmos para qualquer usuário. O sha256 do arquivo de entrada aparece em todas "
                "as saídas para que um resultado possa ser conferido contra o arquivo que o "
                "gerou, sem que o arquivo precise ser guardado.")

    s.legenda(1032, [
        ("#f5f5f5", "#666666", "Entrada do usuário"),
        (VERDE, VERDE_B, "Etapa no navegador"),
        (AZUL, AZUL_B, "Caminho de coorte"),
        (AMARELO, AMARELO_B, "Dado embarcado"),
        (LARANJA, LARANJA_B, "Saída"),
    ])
    s.grava("genvar-fluxo-vcf.svg")


if __name__ == "__main__":
    print("Gerando diagramas em docs/")
    arquitetura()
    fluxo_vcf()
