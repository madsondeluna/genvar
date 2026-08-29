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

# (arquivo, rota, marca que so aparece com o conteudo na tela)
TELAS = [
    ("tela-inicio", "/", "Doenças"),
    ("tela-doencas", "/doencas", "doenças"),
    ("tela-doenca-detalhe", "/doenca/anemia-falciforme", "falciforme"),
    ("tela-paineis", "/paineis", "painéis"),
    ("tela-painel-detalhe", "/painel/epilepsias-geneticas", "genes"),
    ("tela-vcf", "/vcf", "VCF"),
    ("tela-lote", "/lote", "Lote"),
    ("tela-gene", "/gene/BRCA1", "BRCA1"),
    ("tela-variante", "/variant/rs334", "rs334"),
    ("tela-poligenico", "/poligenico", "poligênic"),
    ("tela-escore-detalhe", "/escore/PGS000004", "PGS000004"),
    ("tela-associacao", "/associacao", "burden"),
    ("tela-produtos", "/produtos", "Produtos"),
    ("tela-status", "/status", "Status"),
    ("tela-fontes", "/fontes", "Fontes"),
    ("tela-sobre", "/sobre", "Números do catálogo"),
    ("tela-colabore", "/colabore", "Frentes abertas"),
]


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


async def captura(cdp, arquivo, url, marca, espera_max):
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

    r = await cdp.cmd("Page.captureScreenshot", format="png",
                      captureBeyondViewport=True, optimizeForSpeed=False)
    dados = base64.b64decode(r["data"])
    # Paleta adaptativa de 256 cores: numa captura de interface o resultado e
    # visualmente identico e o arquivo cai para 40% do tamanho. Quinze telas de
    # pagina inteira em x2 somam 17 MB sem isso, e elas sao refeitas a cada
    # mudanca de interface, ou seja, o historico carregaria cada versao inteira.
    im = Image.open(io.BytesIO(dados)).convert("RGB")
    im.quantize(colors=256, dither=Image.FLOYDSTEINBERG).save(
        DOCS / f"{arquivo}.png", "PNG", optimize=True)
    kb = (DOCS / f"{arquivo}.png").stat().st_size / 1024
    print(f"  {arquivo:<24} {LARGURA} x {alt:>5} css   {kb:6.0f} KB")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://genvar.delunalab.dev")
    ap.add_argument("--espera", type=float, default=25.0)
    ap.add_argument("--porta", type=int, default=9333)
    ap.add_argument("--so", help="captura so as telas cujo nome contenha isto")
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

        telas = [t for t in TELAS if not args.so or args.so in t[0]]
        print(f"Capturando {len(telas)} telas de {args.base} em {LARGURA} css x{ESCALA}")
        async with websockets.connect(alvo["webSocketDebuggerUrl"],
                                      max_size=200 * 1024 * 1024) as ws:
            cdp = Cdp(ws)
            for m in ("Page.enable", "Runtime.enable"):
                await cdp.cmd(m)
            for arquivo, rota, marca in telas:
                await captura(cdp, arquivo, args.base + rota, marca, args.espera)
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        shutil.rmtree(perfil, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
