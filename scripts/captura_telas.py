#!/usr/bin/env python3
"""
Captura as telas do README em pagina inteira, via CDP.

O motivo de existir: `chrome --headless --screenshot` fotografa a JANELA, entao
qualquer pagina mais alta que a janela sai cortada no rodape, e foi assim que as
capturas anteriores perderam o fim de metade das telas. `Page.captureScreenshot`
com `captureBeyondViewport` fotografa o DOCUMENTO, seja qual for a altura.

Duas coisas que a versao ingenua erra e esta trata:

  - Esperar `load` nao basta numa SPA: o HTML chega vazio e o conteudo aparece
    depois da consulta. A espera aqui e pelo conteudo, com teto de tempo.
  - `deviceScaleFactor` 2 dobra a resolucao sem mexer no layout, que continua
    sendo o de 1440 CSS. Sem isso o PNG fica na escala do texto da tela.

Uso:
  python3 scripts/captura_telas.py                    # producao
  python3 scripts/captura_telas.py --base http://localhost:3000
"""
import argparse
import asyncio
import base64
import json
import shutil
import subprocess
import tempfile
import time
import io
import urllib.request
from pathlib import Path

import websockets
from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DOCS = Path(__file__).resolve().parent.parent / "docs"
LARGURA = 1440
ESCALA = 2

# (arquivo, rota, marca de conteudo, altura minima esperada em px CSS)
TELAS = [
    ("tela-inicio", "/", "Doenças", 1400),
    ("tela-doencas", "/doencas", "Anemia falciforme", 3800),
    ("tela-doenca-detalhe", "/doenca/anemia-falciforme", "HBB", 2600),
    ("tela-paineis", "/paineis", "genes", 3300),
    ("tela-painel-detalhe", "/painel/epilepsias-geneticas", "SCN1A", 1250),
    ("tela-vcf", "/vcf", "VCF", 2150),
    ("tela-lote", "/lote", "Lote", 950),
    ("tela-gene", "/gene/BRCA1", "Resumo de variantes", 6500),
    ("tela-variante", "/variant/rs334", "HBB", 3700),
    ("tela-poligenico", "/poligenico", "PGS", 3700),
    ("tela-escore-detalhe", "/escore/PGS000004", "GWAS de origem", 4700),
    ("tela-associacao", "/associacao", "burden", 3100),
    ("tela-produtos", "/produtos", "Produtos", 2700),
    ("tela-status", "/status", "ms", 1900),
    ("tela-fontes", "/fontes", "Ensembl", 2900),
    ("tela-sobre", "/sobre", "Números do catálogo", 2450),
    ("tela-colabore", "/colabore", "Frentes abertas", 2000),
]


# Teto de altura da captura, em pixels do dispositivo. Acima disso o Chrome
# devolve a imagem com a pagina repetida em vez de cortada, porque
# `captureBeyondViewport` compoe a foto numa textura e a textura tem limite. O
# defeito e silencioso: sai um PNG do tamanho pedido, com o conteudo duplicado.
# Medido nesta maquina entre 14.784 (a tela de gene, correta) e 16.648 (o laudo
# do VCF, duplicado), entao o teto real esta nos 16.384 de sempre.
TETO_TEXTURA = 16000


async def estabiliza(cdp, tentativas=20):
    """Espera a altura do documento parar de mudar e devolve ela.

    Nao e paranoia: no relatorio de VCF a mesma pagina mediu 8.324, 8.477 e 8.426
    em leituras seguidas, porque tabela e grafico ainda montavam. Fotografar com
    altura obsoleta faz o Chrome preencher o que sobra repetindo o topo, e sai um
    PNG do tamanho certo com o conteudo duplicado no rodape.
    """
    anterior, iguais = None, 0
    for _ in range(tentativas):
        m = await cdp.cmd("Page.getLayoutMetrics")
        alt = round(m["cssContentSize"]["height"])
        iguais = iguais + 1 if alt == anterior else 0
        anterior = alt
        if iguais >= 2:
            return alt
        await asyncio.sleep(1.0)
    return anterior


ALTURA_FATIA = 900


async def fotografa(cdp, _alt=None):
    """Monta a pagina inteira rolando e fotografando o viewport, fatia por fatia.

    Os dois caminhos diretos falham nesta aplicacao, e os dois falham em silencio,
    devolvendo um PNG do tamanho certo com o topo da pagina repetido no rodape:

      `captureBeyondViewport` compoe a imagem fora do viewport e preenche com o
      topo o que sobra entre a altura que pediu e o que foi pintado. E sobra
      sempre, porque a pagina ainda reflui: o relatorio de VCF mediu 8.324, 8.477
      e 8.426 em leituras seguidas.

      Alargar a janela emulada ate a altura do documento faz o documento crescer
      junto, porque ha elemento dimensionado pelo viewport. Medido: 8.324 vira
      8.477, que vira 8.528, e a foto nunca alcanca.

    Fotografar o viewport e o unico caminho que nao tem altura para errar. A
    posicao de cada fatia vem do `scrollY` que o navegador de fato assumiu, e nao
    do que foi pedido, entao a ultima fatia, que o navegador trava antes do fim,
    cai no lugar certo em vez de sobrepor a anterior.
    """
    # A barra e `position: sticky` e apareceria no alto de TODA fatia. Solta, ela
    # rola junto e fica so onde esta na tela, no comeco da pagina.
    await cdp.js("""(() => {
      for (const n of document.querySelectorAll('nav, header, .app-nav')) {
        const p = getComputedStyle(n).position;
        if (p === 'sticky' || p === 'fixed') n.style.setProperty('position', 'static', 'important');
      }
      return true;
    })()""")
    await asyncio.sleep(0.5)

    # Tres leituras iguais, e nunca aceitar altura menor que uma ja vista: numa
    # lista que monta em partes, duas leituras seguidas coincidem enquanto a
    # pagina ainda esta pela metade. Foi assim que a tela de doencas saiu com 951
    # px de 4.028, ou seja, so o cabecalho.
    alt, iguais = 0, 0
    for _ in range(70):
        m = await cdp.cmd("Page.getLayoutMetrics")
        nova = round(m["cssContentSize"]["height"])
        iguais = iguais + 1 if nova == alt else 0
        alt = max(alt, nova)
        if iguais >= 5:
            break
        await asyncio.sleep(1.0)

    escala = ESCALA if alt * ESCALA <= TETO_TEXTURA else 1
    await cdp.cmd("Emulation.setDeviceMetricsOverride", width=LARGURA,
                  height=ALTURA_FATIA, deviceScaleFactor=escala, mobile=False)
    await asyncio.sleep(0.6)

    folha = Image.new("RGB", (LARGURA * escala, alt * escala), "white")
    y = 0
    while y < alt:
        await cdp.js(f"window.scrollTo(0, {y})")
        await asyncio.sleep(0.35)
        real = round(await cdp.js("window.scrollY"))
        r = await cdp.cmd("Page.captureScreenshot", format="png", optimizeForSpeed=False)
        fatia = Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")
        folha.paste(fatia, (0, real * escala))
        if real + ALTURA_FATIA >= alt:
            break
        y = real + ALTURA_FATIA

    buf = io.BytesIO()
    folha.save(buf, "PNG")
    return buf.getvalue(), escala, alt


def grava(dados, alvo):
    """Paleta adaptativa de 256 cores: interface fica igual e o arquivo cai a 40%."""
    im = Image.open(io.BytesIO(dados)).convert("RGB")
    im.quantize(colors=256, dither=Image.FLOYDSTEINBERG).save(alvo, "PNG", optimize=True)
    return alvo.stat().st_size / 1024


class Cdp:
    def __init__(self, ws):
        self.ws, self.n = ws, 0

    async def cmd(self, metodo, **params):
        self.n += 1
        await self.ws.send(json.dumps({"id": self.n, "method": metodo, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(f"{metodo}: {msg['error']}")
                return msg.get("result", {})

    async def js(self, expr):
        r = await self.cmd("Runtime.evaluate", expression=expr,
                           awaitPromise=True, returnByValue=True)
        return r.get("result", {}).get("value")


async def captura(cdp, arquivo, url, marca, espera_max, piso=0):
    await cdp.cmd("Emulation.setDeviceMetricsOverride", width=LARGURA, height=900,
                  deviceScaleFactor=ESCALA, mobile=False)
    # O Chrome sem cabeca responde `dark` a `prefers-color-scheme`, e o perfil e
    # novo a cada corrida, entao nao ha modo guardado para vencer isso. Sem a
    # emulacao explicita metade da galeria sairia no modo grafite e a outra
    # metade no claro, dependendo de quando cada captura foi feita.
    await cdp.cmd("Emulation.setEmulatedMedia", features=[
        {"name": "prefers-color-scheme", "value": "light"}])
    await cdp.cmd("Page.navigate", url=url)

    # A SPA monta depois da rota e do fetch. A marca e o sinal de que a tela
    # chegou; o teto de tempo evita travar numa fonte fora do ar.
    t0 = time.time()
    while time.time() - t0 < espera_max:
        await asyncio.sleep(0.5)
        pronto = await cdp.js(
            "document.readyState === 'complete' && "
            f"document.body && document.body.innerText.includes({json.dumps(marca)})")
        if pronto:
            break
    else:
        print(f"  {arquivo}: marca {marca!r} nao apareceu em {espera_max}s, capturando assim mesmo")

    # Um respiro para grafico e imagem assentarem depois do texto, e a rolagem
    # ao topo porque `captureBeyondViewport` fotografa a partir da posicao atual.
    await asyncio.sleep(2.5)
    await cdp.js("window.scrollTo(0, 0)")
    await asyncio.sleep(0.3)
    alt = await cdp.js("document.documentElement.scrollHeight")

    # O piso tambem e criterio de espera, e nao so de aviso. Na tela de gene as
    # tabelas de variantes vem de uma rota separada e demoram: a altura fica
    # parada tempo suficiente para a estabilizacao dar por pronta uma pagina de
    # 3.433 px que termina com 7.392.
    if piso:
        t1 = time.time()
        while time.time() - t1 < espera_max:
            m = await cdp.cmd("Page.getLayoutMetrics")
            if round(m["cssContentSize"]["height"]) >= piso:
                break
            await asyncio.sleep(1.0)

    dados, escala, alt = await fotografa(cdp)
    kb = grava(dados, DOCS / f"{arquivo}.png")
    aviso = "  ATENCAO: abaixo do piso de {}, a tela provavelmente veio sem dado".format(piso) \
        if piso and alt < piso else ""
    print(f"  {arquivo:<24} {LARGURA} x {alt:>5} css  x{escala}  {kb:6.0f} KB{aviso}")


async def captura_laudo(cdp, base, entrada, espera_max):
    """A tela do laudo, que so existe depois que um arquivo entra na pagina.

    O arquivo vai pelo `DOM.setFileInputFiles`, que aceita um caminho do disco e
    e o que o proprio Chrome usa: nada de simular clique no seletor, que abre uma
    janela nativa, e nada de fabricar um `File` em javascript, que perde o nome e
    o tamanho reais. O arquivo nao sai da maquina: o modulo de VCF le no
    navegador, e e essa a propriedade que a captura ilustra.
    """
    await cdp.cmd("Emulation.setDeviceMetricsOverride", width=LARGURA, height=900,
                  deviceScaleFactor=ESCALA, mobile=False)
    await cdp.cmd("Emulation.setEmulatedMedia", features=[
        {"name": "prefers-color-scheme", "value": "light"}])
    await cdp.cmd("Page.navigate", url=base + "/vcf")
    for _ in range(60):
        await asyncio.sleep(0.5)
        if await cdp.js("!!document.getElementById('vcf-input')"):
            break

    await cdp.cmd("DOM.enable")
    doc = await cdp.cmd("DOM.getDocument")
    no = await cdp.cmd("DOM.querySelector", nodeId=doc["root"]["nodeId"],
                       selector="#vcf-input")
    await cdp.cmd("DOM.setFileInputFiles", nodeId=no["nodeId"],
                  files=[str(Path(entrada).resolve())])

    t0 = time.time()
    while time.time() - t0 < espera_max:
        await asyncio.sleep(1.0)
        pronto = await cdp.js(
            "document.body.innerText.includes('Critérios ACMG') && "
            "!document.body.innerText.includes('Consultando o ClinVar')")
        if pronto:
            break
    else:
        print("  laudo: o relatorio nao ficou pronto no tempo, capturando assim mesmo")

    await asyncio.sleep(3.0)
    await cdp.js("window.scrollTo(0, 0)")
    await asyncio.sleep(0.3)
    alt = await cdp.js("document.documentElement.scrollHeight")
    dados, escala, alt = await fotografa(cdp)
    alvo = Path(__file__).resolve().parent.parent / "mock-results-vcf-test" / "tela-laudo.png"
    kb = grava(dados, alvo)
    print(f"  tela-laudo               {LARGURA} x {alt:>5} css  x{escala}  {kb:6.0f} KB")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://genvar.delunalab.dev")
    ap.add_argument("--espera", type=float, default=75.0)
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--so", help="captura so as telas cujo nome contenha isto")
    ap.add_argument("--vcf", metavar="ARQUIVO",
                    help="captura tambem a tela do laudo, com este VCF carregado")
    args = ap.parse_args()

    perfil = tempfile.mkdtemp(prefix="genvar-captura-")
    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={args.porta}",
         f"--user-data-dir={perfil}", "--hide-scrollbars", "--no-first-run",
         # WebGL por software. `--disable-gpu`, o flag de praxe em headless,
         # derruba o WebGL junto, e a pagina de gene sai com a mensagem de falha
         # do visualizador de estrutura no lugar da proteina.
         "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
         f"--window-size={LARGURA},900", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        alvo = None
        for _ in range(40):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{args.porta}/json") as fh:
                    abas = json.load(fh)
                alvo = next(a for a in abas if a["type"] == "page")
                break
            except Exception:
                continue
        if not alvo:
            raise SystemExit("o Chrome nao abriu a porta de depuracao")

        if not args.so:
            print("  aquecendo a API...")
            for rota in ("/disease", "/panel", "/pgs", "/sources", "/gene/BRCA1"):
                try:
                    urllib.request.urlopen(
                        f"https://genvar-backend.onrender.com/api{rota}", timeout=60).read(1)
                except Exception:
                    pass

        telas = [] if args.so == "laudo" else [
            t for t in TELAS if not args.so or args.so in t[0]]
        print(f"Capturando {len(telas)} telas de {args.base} em {LARGURA} css x{ESCALA}")
        async with websockets.connect(alvo["webSocketDebuggerUrl"],
                                      max_size=200 * 1024 * 1024) as ws:
            cdp = Cdp(ws)
            for m in ("Page.enable", "Runtime.enable"):
                await cdp.cmd(m)
            for arquivo, rota, marca, piso in telas:
                await captura(cdp, arquivo, args.base + rota, marca, args.espera, piso)
            if args.vcf:
                await captura_laudo(cdp, args.base, args.vcf, max(args.espera, 90))
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        shutil.rmtree(perfil, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
