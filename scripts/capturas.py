"""Gera as capturas de tela do README (docs/capturas) e do manual (assets/manual).

Uso, na raiz do projeto:
    python3 scripts/capturas.py            # tudo
    python3 scripts/capturas.py readme     # só as do README
    python3 scripts/capturas.py manual     # só as do manual

Requisitos: Playwright para Python (testado com 1.58) e Pillow. Usa o Brave em modo
headless; para usar o Chromium do Playwright, troque NAVEGADOR por None.
A data e a hora ficam fixas (page.clock.set_fixed_time) para as capturas saírem iguais.
"""
import datetime
import functools
import http.server
import io
import pathlib
import sys
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
NAVEGADOR = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
AGORA = datetime.datetime(2026, 10, 28, 9, 40)  # quarta-feira, 9h40
HOJE = AGORA.strftime("%Y-%m-%d")
AMANHA = (AGORA + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

# sem animações, tudo já "revelado", imagens sem carregamento preguiçoso
SEM_ANIMACAO = """*,*::before,*::after{transition:none!important;animation:none!important}
html{scroll-behavior:auto!important}.toasts,.toast{display:none!important}"""
REVELAR = """document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'));
document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; });"""


class _Quieto(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir():
    """Servidor local temporário (porta livre) para a pasta do projeto."""
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quieto, directory=str(RAIZ)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}/"


def salvar_jpg(png, destino, largura=None, qualidade=84):
    im = Image.open(io.BytesIO(png)).convert("RGB")
    if largura and im.width != largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, "JPEG", quality=qualidade, optimize=True, progressive=True)
    print(destino.relative_to(RAIZ), im.size)
    return im


def abrir(ctx, url, espera=2600):
    pg = ctx.new_page()
    pg.clock.set_fixed_time(AGORA)
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(url, wait_until="networkidle")
    pg.add_style_tag(content=SEM_ANIMACAO)
    pg.evaluate(REVELAR)
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(espera)
    pg.erros = erros
    return pg


def falar(pg, texto):
    pg.fill("#iaIn", texto)
    pg.press("#iaIn", "Enter")
    pg.wait_for_timeout(1300)


def recorte_ia(pg, inicio):
    """Recorta a coluna da assistente: do balão `inicio` até o fim das mensagens."""
    ia = pg.locator(".ia").bounding_box()
    msgs = pg.locator("#iaMsgs").bounding_box()
    topo = max(msgs["y"], pg.locator(inicio).last.bounding_box()["y"] - 16)
    return pg.screenshot(clip={"x": ia["x"], "y": topo, "width": ia["width"], "height": msgs["y"] + msgs["height"] - topo})


def ajustar_manual():
    """Atualiza width/height das capturas no manual.html com o tamanho real dos arquivos."""
    import re
    arq = RAIZ / "manual.html"
    html = arq.read_text()

    def troca(m):
        w, h = Image.open(RAIZ / m.group(1)).size
        return f'{m.group(0).split(" width=")[0]} width="{w}" height="{h}"'
    html = re.sub(r'src="(assets/manual/[\w-]+\.jpg)"[^>]*? width="\d+" height="\d+"', troca, html)
    arq.write_text(html)


def lado_a_lado(imagens, destino, fundo=(230, 236, 250), margem=48, largura=None):
    """Junta capturas de celular numa imagem só (para o README)."""
    h = max(i.height for i in imagens)
    w = sum(i.width for i in imagens) + margem * (len(imagens) + 1)
    tela = Image.new("RGB", (w, h + 2 * margem), fundo)
    x = margem
    for i in imagens:
        tela.paste(i, (x, margem))
        x += i.width + margem
    buf = io.BytesIO()
    tela.save(buf, "PNG")
    return salvar_jpg(buf.getvalue(), destino, largura)


def readme(b, base):
    pasta = RAIZ / "docs" / "capturas"
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, locale="pt-BR")
    pg = abrir(ctx, base + "index.html")
    salvar_jpg(pg.screenshot(), pasta / "site-topo.jpg")
    pg.locator("#por-que").scroll_into_view_if_needed()
    salvar_jpg(pg.locator("#por-que").screenshot(), pasta / "site-mosaico.jpg", 1200)
    salvar_jpg(pg.locator("#atendimentos").screenshot(), pasta / "site-atendimentos.jpg", 1200)
    # formulário no passo 3 (com a modalidade escolhida, se houver)
    pg.click('a[data-objetivo="Engravidar / fertilidade"]')
    pg.click('#quiz [data-step="2"] label.opt >> nth=0')
    pg.wait_for_timeout(500)
    if pg.locator("#modalidade label").count():  # só aparece com 2+ modalidades no config
        pg.click("#modalidade label >> nth=0")
    pg.fill('#quiz input[name="nome"]', "Bruna")
    pg.fill('#quiz textarea[name="historia"]', "Quero entender o que ajustar na alimentação para engravidar.")
    salvar_jpg(pg.locator("#agendar").screenshot(), pasta / "site-formulario.jpg", 1200)
    assert not pg.erros, pg.erros
    ctx.close()

    ctx = b.new_context(viewport={"width": 375, "height": 812}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="pt-BR")
    pg = abrir(ctx, base + "index.html")
    pg.click(".draft-bar")  # fecha o aviso de portfólio para não cobrir os botões
    cel = [Image.open(io.BytesIO(pg.screenshot()))]
    for alvo in ("#atendimentos .cards", "#quiz"):
        pg.locator(alvo).evaluate("e => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 90)")
        pg.wait_for_timeout(400)
        cel.append(Image.open(io.BytesIO(pg.screenshot())))
    lado_a_lado(cel, pasta / "site-celular.jpg", largura=1200)
    ctx.close()

    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, locale="pt-BR")
    pg = abrir(ctx, base + "painel.html")
    salvar_jpg(pg.screenshot(), pasta / "area-hoje.jpg")
    pg.evaluate("PN.aba('agenda')")
    pg.wait_for_timeout(300)
    salvar_jpg(pg.screenshot(), pasta / "area-agenda.jpg")
    pg.evaluate("PN.aba('recados')")
    pg.wait_for_timeout(300)
    falar(pg, "marcar Ana Teixeira amanhã 14h online")
    falar(pg, "retornos pendentes")
    salvar_jpg(pg.screenshot(), pasta / "area-assistente.jpg")
    assert not pg.erros, pg.erros
    ctx.close()

    ctx = b.new_context(viewport={"width": 375, "height": 812}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="pt-BR")
    pg = abrir(ctx, base + "painel.html")
    cel = [Image.open(io.BytesIO(pg.screenshot()))]
    pg.evaluate("PN.aba('agenda')")
    pg.wait_for_timeout(300)
    cel.append(Image.open(io.BytesIO(pg.screenshot())))
    pg.click("#iaFab")
    pg.wait_for_timeout(800)
    cel.append(Image.open(io.BytesIO(pg.screenshot())))
    lado_a_lado(cel, pasta / "area-celular.jpg", largura=1200)
    ctx.close()


def manual(b, base):
    pasta = RAIZ / "assets" / "manual"
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, locale="pt-BR")
    pg = abrir(ctx, base + "painel.html")
    pg.add_style_tag(content=".aviso{display:none!important}")
    salvar_jpg(pg.screenshot(), pasta / "visao-geral.jpg", 1800)
    lado = pg.locator(".side").bounding_box()
    fim_abas = pg.locator(".tabs").bounding_box()
    menu = pg.screenshot(clip={"x": lado["x"], "y": lado["y"], "width": lado["width"], "height": fim_abas["y"] + fim_abas["height"] + 24 - lado["y"]})
    salvar_jpg(menu, pasta / "menu.jpg", 500)
    salvar_jpg(pg.locator("#stats").screenshot(), pasta / "numeros.jpg", 1440)
    salvar_jpg(pg.locator("#aba-hoje .hoje > .card").screenshot(), pasta / "linha-dia.jpg", 794)
    salvar_jpg(pg.locator(".hoje__side .card").first.screenshot(), pasta / "recados-novos.jpg", 612)
    pg.evaluate("PN.aba('agenda')")
    pg.wait_for_timeout(300)
    salvar_jpg(pg.screenshot(), pasta / "agenda.jpg", 1800)
    pg.evaluate("PN.abrirCons({paciente:'Ana Teixeira', telefone:'00991234567', data:'%s', hora:'14:00', tipo:'Primeira consulta', modo:'Online'}); document.activeElement.blur()" % AMANHA)
    pg.wait_for_timeout(300)
    salvar_jpg(pg.locator("#formCons").screenshot(), pasta / "nova-consulta.jpg", 960)
    pg.evaluate("document.getElementById('modal').hidden = true; PN.aba('recados')")
    pg.wait_for_timeout(300)
    salvar_jpg(pg.locator("#listaRec .recado").nth(2).screenshot(), pasta / "recado.jpg", 1440)
    pg.evaluate("PN.aba('lembretes')")
    pg.wait_for_timeout(300)
    salvar_jpg(pg.locator("#aba-lembretes").screenshot(), pasta / "lembretes.jpg", 1440)
    pg.evaluate("PN.aba('hoje'); document.getElementById('modalDados').hidden = false")
    pg.wait_for_timeout(300)
    salvar_jpg(pg.locator("#modalDados .modal__box").screenshot(), pasta / "dados.jpg", 960)
    pg.evaluate("document.getElementById('modalDados').hidden = true")
    falar(pg, "ajuda")
    salvar_jpg(recorte_ia(pg, ".imsg.eu"), pasta / "flora-ajuda.jpg", 780)
    falar(pg, "marcar Ana Teixeira amanhã 14h online")
    salvar_jpg(recorte_ia(pg, ".imsg.eu"), pasta / "flora-marcar.jpg", 780)
    pg.evaluate("(() => { const a = DB.list('agenda').find(x => x.paciente === 'Mariana Teles' && x.data === '%s'); PN.mudarStatus(a, 'realizada'); })()" % HOJE)
    pg.wait_for_timeout(1400)
    salvar_jpg(recorte_ia(pg, ".imsg.bot"), pasta / "flora-retorno.jpg", 780)
    assert not pg.erros, pg.erros
    ctx.close()

    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, locale="pt-BR")
    pg = abrir(ctx, base + "painel.html")
    pg.add_style_tag(content=".aviso{display:none!important}")
    salvar_jpg(pg.screenshot(), pasta / "celular.jpg")
    pg.click("#iaFab")
    pg.wait_for_timeout(800)
    salvar_jpg(pg.screenshot(), pasta / "celular-flora.jpg")
    ctx.close()
    ajustar_manual()


if __name__ == "__main__":
    quais = sys.argv[1:] or ["readme", "manual"]
    base = servir()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=NAVEGADOR, headless=True) if NAVEGADOR else p.chromium.launch(headless=True)
        if "readme" in quais:
            readme(b, base)
        if "manual" in quais:
            manual(b, base)
        b.close()
    print("ok")
