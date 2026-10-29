(function () {
  "use strict";

  var C = window.SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- medição (Meta Pixel / GA / GTM, se forem instalados) ---------- */
  function track(name, data) {
    try {
      (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data || {}));
      if (window.fbq) window.fbq("trackCustom", name, data || {});
      if (window.gtag) window.gtag("event", name, data || {});
    } catch (e) { /* sem medição instalada */ }
  }

  /* ---------- contatos ---------- */
  var digits = function (s) { return String(s || "").replace(/\D/g, ""); };
  var waNumber = digits(C.whatsapp);
  var hasWa = waNumber.length >= 12;
  var igUser = C.instagram || "";
  var igLink = "https://ig.me/m/" + igUser;
  // sem WhatsApp e sem Instagram (ou com demo: true): o formulário só grava o recado na Área
  var modoDemo = !!C.demo || (!hasWa && !igUser);
  var nutri = String(C.nome || "").split(" ")[0] || "nutri";
  var waLink = function (msg) { return "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(msg); };
  function fmtPhone(n) {
    var d = digits(n).replace(/^55/, "");
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return n;
  }
  function joinList(list) {
    if (list.length < 2) return list.join("");
    return list.slice(0, -1).join(", ") + " e " + list[list.length - 1];
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* ---------- prévia ---------- */
  function pend(label) {
    var s = document.createElement("span");
    s.className = "cfg-pend";
    s.textContent = label || "a confirmar";
    return s;
  }
  var bar = null;
  if (C.rascunho || modoDemo) {
    bar = document.createElement("div");
    bar.className = "draft-bar";
    bar.textContent = C.rascunho
      ? "Prévia para aprovação · itens “a confirmar” aguardam os dados reais."
      : "Projeto de portfólio · nutricionista fictícia, fotos de modelo. ✕";
    if (!C.rascunho) {
      bar.title = "Fechar aviso";
      bar.addEventListener("click", function () { bar.remove(); bar = null; });
    }
    document.body.appendChild(bar);
  }

  /* ---------- dados do config ---------- */
  var atend = Array.isArray(C.atendimento) ? C.atendimento.filter(Boolean) : [];
  var locais = Array.isArray(C.locais) ? C.locais.filter(function (l) { return l && l.endereco; }) : [];
  var temOnline = atend.some(function (a) { return /online/i.test(a); });
  var atendLower = joinList(atend.map(function (a) { return a.toLowerCase(); }));
  var values = {
    crn: C.crn || null,
    cidade: C.cidade || null,
    whatsappTexto: hasWa ? fmtPhone(waNumber) : null,
    atendimentoCurto: atend.length ? atendLower.charAt(0).toUpperCase() + atendLower.slice(1) : null,
    atendimentoFaq: atend.length
      ? "Atendo nas modalidades " + atendLower + (C.cidade ? " (" + C.cidade + ")" : "") + ". Me chama que a gente escolhe juntas a melhor opção para você."
      : null
  };

  $$("[data-cfg]").forEach(function (el) {
    var key = el.getAttribute("data-cfg");
    var val = values[key];
    var wrap = el.closest("[data-cfg-wrap]") || el.closest(".badges li");
    if (val) { el.textContent = (el.getAttribute("data-prefix") || "") + val; return; }
    if (el.hasAttribute("data-silent")) { if (wrap) wrap.hidden = true; return; }
    if (key === "atendimentoFaq") { if (C.rascunho) el.parentNode.appendChild(pend()); return; }
    if (C.rascunho) {
      el.textContent = el.getAttribute("data-prefix") || "";
      el.appendChild(pend(key === "crn" ? "CRN a confirmar" : "a confirmar"));
    } else if (wrap) {
      wrap.hidden = true;
    } else {
      el.remove();
    }
  });
  $$("[data-cfg-wrap]").forEach(function (w) {
    var k = w.getAttribute("data-cfg-wrap");
    var ok = k === "whatsapp" ? hasWa : !!C[k];
    if (!ok && !C.rascunho) w.hidden = true;
  });
  $$('a[href*="instagram.com/"]').forEach(function (a) {
    if (igUser) a.href = "https://www.instagram.com/" + igUser + "/";
    else (a.closest("li") || a).hidden = true;
  });

  /* ---------- onde atendo ---------- */
  var ondeGrid = $("[data-onde]"), ondeSec = $("#onde");
  if (ondeGrid) {
    var cards = [];
    var mapaFalso =
      '<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="320" height="200" fill="#e4e8da"/>' +
      '<g fill="none" stroke="#fdfdfa" stroke-linecap="round"><path stroke-width="10" d="M-10 140 C80 120 140 160 330 110"/>' +
      '<path stroke-width="7" d="M60 -10 L110 210M210 -10 C200 60 240 120 220 210M-10 60 H330"/><path stroke-width="4" d="M150 -10 V210M-10 20 L330 90M260 -10 L300 210"/></g>' +
      '<rect x="22" y="78" width="40" height="34" rx="6" fill="#d7dec6"/><rect x="236" y="138" width="56" height="40" rx="6" fill="#d7dec6"/>' +
      '<g transform="translate(160 96)"><ellipse cx="0" cy="22" rx="12" ry="4" fill="#23251d" opacity=".15"/><path d="M0 20s-16-15-16-28a16 16 0 0 1 32 0C16 5 0 20 0 20Z" fill="#6d5891"/><circle cx="0" cy="-8" r="6" fill="#fff"/></g></svg>';
    var telaGrande = '<svg viewBox="0 0 220 150" aria-hidden="true"><use href="#il-online"/></svg>';

    if (temOnline || C.rascunho) {
      cards.push(
        '<article class="local reveal"><div class="local__map local__map--online">' + telaGrande + "</div>" +
        '<div class="local__body"><h3>Consulta online' + (temOnline ? "" : ' <span class="cfg-pend">a confirmar</span>') + "</h3>" +
        "<p>Consultas por videochamada, de onde você estiver, com o mesmo cuidado e atenção individualizada.</p>" +
        '<a href="#agendar" data-cta="onde-online">Agendar online <svg aria-hidden="true"><use href="#i-seta"/></svg></a></div></article>'
      );
    }
    locais.forEach(function (l, i) {
      var q = encodeURIComponent(l.endereco);
      cards.push(
        '<article class="local reveal"><div class="local__map"><iframe title="Mapa: ' + esc(l.nome || "Consultório") + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=' + q + '&amp;output=embed"></iframe></div>' +
        '<div class="local__body"><h3>' + esc(l.nome || "Consultório " + (i + 1)) + "</h3><p>" + esc(l.endereco) + "</p>" +
        '<a href="https://www.google.com/maps/search/?api=1&amp;query=' + q + '" target="_blank" rel="noopener">Abrir no Google Maps <svg aria-hidden="true"><use href="#i-seta"/></svg></a></div></article>'
      );
    });
    if (!locais.length && C.rascunho) {
      cards.push(
        '<article class="local reveal"><div class="local__map">' + mapaFalso + "</div>" +
        '<div class="local__body"><h3>Consultório presencial <span class="cfg-pend">a confirmar</span></h3>' +
        "<p>Endereço, cidade e mapa entram aqui assim que forem informados.</p></div></article>"
      );
    }

    if (!cards.length) {
      ondeSec.hidden = true;
      $$('a[href="#onde"]').forEach(function (a) { a.hidden = true; });
    } else {
      ondeGrid.innerHTML = cards.join("");
      var sub = $("[data-onde-sub]");
      if (temOnline && locais.length) sub.textContent = "Consultas online ou presenciais: escolha o formato que combina com a sua rotina.";
      else if (temOnline) sub.textContent = "Consultas online, de onde você estiver.";
      else if (locais.length) sub.textContent = "Consultas presenciais no consultório.";
    }
  }

  /* ---------- botões de agendar ---------- */
  function bindCta(a) {
    if (hasWa) {
      a.href = waLink(a.getAttribute("data-msg") || C.mensagemPadrao);
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.addEventListener("click", function () {
      track("cta_agendar", { local: a.getAttribute("data-cta"), destino: hasWa ? "whatsapp" : "formulario" });
      closeMenu();
    });
  }
  $$("[data-cta]").forEach(bindCta);
  if (!hasWa) {
    var fabIc = $("[data-fab-ic] use");
    if (fabIc) fabIc.setAttribute("href", "#i-escuta");
  }

  /* ---------- formulário em 3 passos ---------- */
  var quiz = $("#quiz");
  var step = 1;
  var goToStep = function () {};
  if (quiz) {
    var steps = $$(".quiz__step", quiz);
    var erro = $(".quiz__erro", quiz);
    var barFill = $(".quiz__bar i", quiz);
    var stepN = $("[data-step-n]", quiz);
    var viaPointer = false;

    // O recado sempre fica registrado para a Área da nutri, e a nota diz isso em todos os modos.
    var nota = $("[data-form-nota]", quiz);
    if (modoDemo) {
      $("[data-form-label]", quiz).textContent = "Enviar recado";
      $("[data-form-ic] use", quiz).setAttribute("href", "#i-escuta");
      nota.textContent = "Demonstração: nenhuma mensagem é enviada. O recado fica salvo só neste navegador e aparece na Área da nutri (link no rodapé).";
    } else if (!hasWa) {
      $("[data-form-label]", quiz).textContent = "Enviar pelo Instagram";
      $("[data-form-ic] use", quiz).setAttribute("href", "#i-insta");
      nota.textContent = "Sem WhatsApp por enquanto: copiamos sua mensagem e abrimos o Direct da " + nutri + " — é só colar e enviar. Uma cópia do recado fica registrada para a " + nutri + " responder.";
    } else {
      nota.textContent = "Sua mensagem abre direto na conversa com a " + nutri + ". Uma cópia do recado fica registrada para ela responder.";
    }
    if (atend.length > 1) {
      var fs = $("#modalidade", quiz);
      atend.forEach(function (m) {
        var l = document.createElement("label");
        l.innerHTML = '<input type="radio" name="modalidade"><span></span>';
        l.querySelector("input").value = m;
        l.querySelector("span").textContent = m;
        fs.appendChild(l);
      });
      fs.hidden = false;
    }

    var chosen = function (n) {
      var name = n === 1 ? "objetivo" : n === 2 ? "dietas" : null;
      return name ? !!quiz.querySelector('input[name="' + name + '"]:checked') : true;
    };
    var syncNext = function () {
      $$("[data-next]", quiz).forEach(function (b) {
        var n = +b.closest(".quiz__step").getAttribute("data-step");
        b.setAttribute("aria-disabled", String(!chosen(n)));
      });
    };
    goToStep = function (n, focus) {
      step = Math.max(1, Math.min(3, n));
      steps.forEach(function (s) { s.classList.toggle("is-active", +s.getAttribute("data-step") === step); });
      barFill.style.width = (step / 3) * 100 + "%";
      stepN.textContent = step;
      erro.textContent = "";
      if (focus) {
        var lg = $(".quiz__step.is-active legend", quiz);
        if (lg) lg.focus({ preventScroll: true });
      }
    };
    var next = function () {
      if (!chosen(step)) { erro.textContent = "Escolha uma opção para continuar."; return; }
      goToStep(step + 1, true);
      track("quiz_passo", { passo: step });
    };

    quiz.addEventListener("pointerdown", function (e) { viaPointer = !!e.target.closest(".opt"); });
    quiz.addEventListener("change", function (e) {
      erro.textContent = "";
      syncNext();
      var n = +e.target.closest(".quiz__step").getAttribute("data-step");
      if (viaPointer && (n === 1 || n === 2) && e.target.type === "radio") {
        viaPointer = false;
        setTimeout(next, 260);
      }
    });
    $$("[data-next]", quiz).forEach(function (b) { b.addEventListener("click", next); });
    $$("[data-back]", quiz).forEach(function (b) { b.addEventListener("click", function () { goToStep(step - 1, true); }); });

    quiz.addEventListener("submit", function (e) {
      e.preventDefault();
      if (step < 3) { next(); return; }
      var fd = new FormData(quiz);
      var nome = String(fd.get("nome") || "").trim();
      var obj = fd.get("objetivo");
      var dietas = fd.get("dietas");
      var mod = fd.get("modalidade");
      var hist = String(fd.get("historia") || "").trim();
      var tel = String(fd.get("telefone") || "").replace(/\D/g, "");
      if (!obj) { goToStep(1, true); erro.textContent = "Escolha o seu principal objetivo."; return; }
      if (nome.length < 2) { erro.textContent = "Me conta o seu nome?"; quiz.nome.focus(); return; }
      if (tel && (tel.length < 10 || tel.length > 13)) { erro.textContent = "Confira o WhatsApp (com DDD) ou deixe em branco."; quiz.telefone.focus(); return; }

      var linhas = [
        "Olá, " + nutri + "! Me chamo " + nome + " e vim pelo site.",
        "Quero agendar uma consulta.",
        "Meu principal objetivo: " + obj + "."
      ];
      if (dietas) linhas.push("Sobre dietas: " + dietas + ".");
      if (mod) linhas.push("Prefiro atendimento: " + mod + ".");
      if (hist) linhas.push("", "Um pouco da minha história: " + hist);
      var msg = linhas.join("\n");

      var destino = modoDemo ? "demo" : hasWa ? "whatsapp" : "instagram";
      track("lead_formulario", { objetivo: obj, dietas: dietas || "", destino: destino });
      // recado para a Área da nutri (no protótipo, fica neste navegador)
      if (window.DB) {
        try {
          window.DB.add("recados", {
            nome: nome, telefone: tel, objetivo: obj, dietas: dietas || "", modalidade: mod || "",
            recado: hist, origem: { demo: "Formulário do site · demonstração", whatsapp: "Formulário do site · WhatsApp", instagram: "Formulário do site · Instagram" }[destino], status: "novo"
          });
        } catch (err) { /* sem armazenamento */ }
      }
      if (modoDemo) {
        toast("Recado salvo! Abra a Área da nutri (rodapé) para ver como ele chega.");
        quiz.reset();
        goToStep(1, false);
        syncNext();
      } else if (hasWa) {
        window.open(waLink(msg), "_blank", "noopener");
        toast("Abrindo o WhatsApp com a sua mensagem…");
      } else {
        var copied = copy(msg);
        window.open(igLink, "_blank", "noopener");
        toast(copied ? "Mensagem copiada! No Direct do Instagram, é só colar e enviar." : "Abrindo o Direct do Instagram…");
      }
    });

    goToStep(1, false);
    syncNext();
  }

  // "Quero esse cuidado": já marca o objetivo e pula para o passo 2
  $$("[data-objetivo]").forEach(function (a) {
    a.addEventListener("click", function () {
      var v = a.getAttribute("data-objetivo");
      var r = quiz && quiz.querySelector('input[name="objetivo"][value="' + v + '"]');
      if (r) {
        r.checked = true;
        r.dispatchEvent(new Event("change", { bubbles: true }));
        goToStep(2, false);
      }
      track("atendimento_escolhido", { objetivo: v });
    });
  });

  // copia de forma síncrona (funciona mesmo abrindo outra aba logo em seguida)
  function copy(text) {
    var ok = false;
    var t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(t); t.select();
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    t.remove();
    if (!ok && navigator.clipboard && window.isSecureContext) {
      ok = true;
      navigator.clipboard.writeText(text).catch(function () { /* sem cópia */ });
    }
    return ok;
  }

  var toastEl = $(".toast"), toastT;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 4200);
  }

  /* ---------- menu suspenso "Atendimentos" ---------- */
  var dd = $(".dd"), ddBtn = $(".dd__btn");
  function closeDd() { if (dd) { dd.classList.remove("is-open"); ddBtn.setAttribute("aria-expanded", "false"); } }
  if (dd) {
    ddBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !dd.classList.contains("is-open");
      dd.classList.toggle("is-open", open);
      ddBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", function (e) { if (!dd.contains(e.target)) closeDd(); });
    $$(".dd__panel a", dd).forEach(function (a) {
      a.addEventListener("click", function () { closeDd(); a.blur(); });
    });
  }

  /* ---------- menu do celular ---------- */
  var hdr = $(".hdr"), nav = $("#menu"), burger = $(".burger");
  function closeMenu() {
    if (!nav || !nav.classList.contains("is-open")) return;
    nav.classList.remove("is-open");
    hdr.classList.remove("menu-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Abrir menu");
    requestTick();
  }
  if (burger) {
    burger.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      if (open) nav.style.setProperty("--nav-top", Math.max(0, hdr.getBoundingClientRect().bottom) + "px");
      nav.classList.toggle("is-open", open);
      hdr.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      requestTick();
    });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", closeMenu); });
    window.addEventListener("resize", function () { if (window.innerWidth > 980) closeMenu(); });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); closeDd(); } });

  /* ---------- rolagem: cabeçalho, botão flutuante e entradas ---------- */
  var hero = $(".hero"), agendar = $("#agendar"), rodape = $(".rodape"), fab = $(".fab");
  var reveals = $$(".reveal");
  var groups = new Map();
  reveals.forEach(function (el) {
    var p = el.parentNode, i = groups.get(p) || 0;
    el.style.setProperty("--d", Math.min(i * 0.08, 0.4) + "s");
    groups.set(p, i + 1);
  });

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight;
    if (hdr) hdr.classList.toggle("is-scrolled", y > 10);

    if (fab && hero && agendar) {
      var pastHero = hero.getBoundingClientRect().bottom < vh * 0.4;
      var r = agendar.getBoundingClientRect();
      var formVisible = r.top < vh * 0.85 && r.bottom > vh * 0.15;
      var nearEnd = rodape && rodape.getBoundingClientRect().top < vh;
      fab.classList.toggle("is-on", pastHero && !formVisible && !nearEnd && !(nav && nav.classList.contains("is-open")));
      if (bar) bar.hidden = !!nearEnd;
    }

    for (var i = reveals.length - 1; i >= 0; i--) {
      var el = reveals[i];
      if (el.getBoundingClientRect().top < vh * 0.92) {
        el.classList.add("is-in");
        reveals.splice(i, 1);
      }
    }
  }
  var ticking = false;
  function requestTick() {
    if (ticking) return;
    ticking = true;
    (window.requestAnimationFrame || setTimeout)(function () { ticking = false; onScroll(); });
  }
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick);
  window.addEventListener("load", onScroll);
  onScroll();
  if (reduce) reveals.forEach(function (el) { el.classList.add("is-in"); });

  $$("[data-ano]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
