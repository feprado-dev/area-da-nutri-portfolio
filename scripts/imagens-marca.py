"""Gera a imagem de compartilhamento (og.jpg, 1200x630) com a marca e uma foto do site.

Uso, na raiz do projeto:  python3 scripts/imagens-marca.py
Requisitos: Playwright para Python e Pillow (mesmos do scripts/capturas.py).
"""
import io
import re

from PIL import Image
from playwright.sync_api import sync_playwright

from capturas import NAVEGADOR, RAIZ, servir

OG = """<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..600,0..100;1,9..144,300..600,0..100&display=swap" rel="stylesheet">
<style>
  body{margin:0;width:1200px;height:630px;display:grid;grid-template-columns:660px 540px;background:#15100c;font-family:Figtree,sans-serif;color:#d6d3c7;overflow:hidden}
  .txt{padding:62px 0 0 64px;display:flex;flex-direction:column}
  .marca{display:flex;flex-direction:column;align-items:center;width:fit-content;--logo-p:#fff;--logo-g:#fff}
  .marca svg{width:58px;height:62px;margin-bottom:8px}
  .marca b{font:700 30px/1.1 Figtree,sans-serif;letter-spacing:-.01em;color:#fff}
  .marca small{margin-top:4px;font-size:12px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:#fff}
  h1{margin:58px 0 0;font:400 60px/1.04 Fraunces,serif;font-variation-settings:"SOFT" 60;color:#fff;max-width:540px}
  h1 em{color:#cfc3e4}
  p{margin:auto 0 54px;font-size:16px;letter-spacing:.04em;color:rgba(214,211,199,.72)}
  .img{background:url(%(base)sassets/img/mosaico.jpg) 50%% 22%%/cover no-repeat;
       -webkit-mask-image:linear-gradient(90deg,transparent,#000 30%%);mask-image:linear-gradient(90deg,transparent,#000 30%%)}
</style></head><body>
<svg width="0" height="0" style="position:absolute">%(simbolo)s</svg>
<div class="txt">
  <div class="marca"><svg><use href="#i-simbolo"/></svg><b>Júlia Monteiro</b><small>Nutricionista</small></div>
  <h1>Nutrição leve, possível e feita para a <em>vida real</em>.</h1>
  <p>Projeto de portfólio · nutricionista fictícia, foto de modelo</p>
</div>
<div class="img"></div>
</body></html>"""

if __name__ == "__main__":
    base = servir()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=NAVEGADOR, headless=True) if NAVEGADOR else p.chromium.launch(headless=True)
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.goto(base + "index.html")  # mesma origem, para as imagens carregarem
        simbolo = re.search(r'<symbol id="i-simbolo".*?</symbol>', (RAIZ / "index.html").read_text(), re.S).group(0)
        pg.set_content(OG % {"base": base, "simbolo": simbolo}, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(500)
        Image.open(io.BytesIO(pg.screenshot())).convert("RGB").save(RAIZ / "assets/img/og.jpg", "JPEG", quality=86, optimize=True)
        print("assets/img/og.jpg")
        b.close()
