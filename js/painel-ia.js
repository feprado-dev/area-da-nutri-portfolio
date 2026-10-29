/* Assistente da Área da nutri (por regras, funciona sem servidor e sem enviar dados).
   Recebe os recados do site, sugere horários livres, marca, remarca, cancela e confirma
   consultas, cuida dos retornos, cria lembretes e prepara mensagens de WhatsApp.
   Entende pedidos em português do tipo "marcar Ana Teixeira amanhã 14h online".
   Não é IA: é um interpretador de linguagem por regras (expressões regulares + pequenos fluxos de pergunta). */
(function () {
  'use strict';
  const S = window.SITE || {};
  const P = S.painel || {};
  const esc = U.esc, norm = U.norm;
  const A = P.assistente || 'Flora';
  const $ = (id) => document.getElementById(id);
  const msgs = $('iaMsgs'), chipsEl = $('iaChips'), input = $('iaIn');
  const hoje = () => U.hojeISO();
  const ativa = (a) => a.status !== 'cancelada';
  const PRI = AG.TIPOS[0], RET = AG.TIPOS[1];

  /* ---------- conversa ---------- */
  const RUN = {}; let runN = 0;
  function acao(rotulo, fn, cls) { const k = 'r' + (++runN); RUN[k] = fn; return '<button type="button" class="ia-act ' + (cls || '') + '" data-run="' + k + '">' + esc(rotulo) + '</button>'; }
  function waLink(tel, msg, rotulo) { return tel ? '<a class="ia-act ia-act--wa" target="_blank" rel="noopener" href="' + esc(U.wa(tel, msg)) + '">' + esc(rotulo || 'WhatsApp') + '</a>' : ''; }
  function bolha(html, cls) {
    const d = document.createElement('div');
    d.className = 'imsg ' + cls; d.innerHTML = html;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  let fila = Promise.resolve();
  function diz(html, chips) {
    fila = fila.then(() => new Promise((ok) => {
      const t = bolha('<i></i><i></i><i></i>', 'bot typing');
      setTimeout(() => { t.remove(); bolha(html, 'bot'); if (chips) setChips(chips); ok(); }, 360);
    }));
    return fila;
  }
  const RAPIDOS = ['Resumo de hoje', 'Recados novos', 'Retornos pendentes', 'Horários livres amanhã', 'Confirmar consultas de amanhã', 'Ajuda'];
  function setChips(lista) {
    chipsEl.innerHTML = '';
    (lista || RAPIDOS).forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
      b.addEventListener('click', () => entrada(c));
      chipsEl.appendChild(b);
    });
  }
  function eu(t) { bolha(esc(t), 'eu'); }
  msgs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-run]'); if (!b) return;
    const fn = RUN[b.dataset.run]; if (!fn) return;
    b.closest('.imsg').querySelectorAll('[data-run]').forEach((x) => { x.disabled = true; });
    fn();
  });
  $('iaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim(); if (!v) return;
    input.value = ''; entrada(v);
  });

  /* ---------- leitura de datas, horas, nomes ---------- */
  const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  function parseData(n) {
    let m;
    if (/depois de amanha/.test(n)) return { iso: U.somaDias(hoje(), 2), rx: /depois de amanha/ };
    if (/\bamanha\b/.test(n)) return { iso: U.somaDias(hoje(), 1), rx: /\bamanha\b/ };
    if (/\bhoje\b/.test(n)) return { iso: hoje(), rx: /\bhoje\b/ };
    if ((m = n.match(/\bdaqui a (\d{1,3}) dias\b/))) return { iso: U.somaDias(hoje(), +m[1]), rx: new RegExp(m[0]) };
    if ((m = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      const ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : hoje().slice(0, 4);
      let iso = ano + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
      if (isNaN(new Date(iso + 'T12:00:00'))) return null;
      if (!m[3] && iso < hoje()) iso = (+ano + 1) + iso.slice(4);
      return { iso, rx: new RegExp(m[0].replace(/\//g, '\\/')) };
    }
    if ((m = n.match(/\bdia (\d{1,2})\b/))) {
      const d = +m[1]; if (d < 1 || d > 31) return null;
      let iso = hoje().slice(0, 8) + String(d).padStart(2, '0');
      if (iso < hoje()) { const x = new Date(hoje() + 'T12:00:00'); x.setDate(1); x.setMonth(x.getMonth() + 1); iso = x.toISOString().slice(0, 8) + String(d).padStart(2, '0'); }
      return { iso, rx: new RegExp(m[0]) };
    }
    if ((m = n.match(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[- ]feira)?( que vem| da semana que vem)?\b/))) {
      const alvo = DIAS[m[1]], atual = U.diaSemana(hoje());
      let diff = (alvo - atual + 7) % 7;
      if (m[2]) diff = diff === 0 ? 7 : diff + (diff < 3 ? 7 : 0);
      return { iso: U.somaDias(hoje(), diff), rx: new RegExp(m[0]) };
    }
    return null;
  }
  function parseHora(n) {
    const m = n.match(/\b(\d{1,2})\s*(?:h|hs|:|horas?)\s*(\d{2})?\b/) || n.match(/\bas (\d{1,2})(?::(\d{2}))?\b/) || n.match(/\b(\d{1,2}) da (manha|tarde)\b/);
    if (!m) return null;
    let h = +m[1]; const mi = m[2] && /^\d+$/.test(m[2]) ? +m[2] : 0;
    if (m[2] === 'tarde' && h < 12) h += 12;
    if (h >= 1 && h <= 6) h += 12; // "às 3" num consultório quer dizer 15h
    if (h > 23 || mi > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }
  const parsePeriodo = (n) => (/\bmanha\b/.test(n) ? 'Manhã' : /\btarde\b/.test(n) ? 'Tarde' : '');
  const parseTipo = (n) => (/\bretorno\b/.test(n) ? RET : /\b(primeira|nova paciente|avaliacao inicial)\b/.test(n) ? PRI : '');
  const parseModo = (n) => (/\b(online|on-line|video|videochamada|virtual)\b/.test(n) ? 'Online' : /\b(presencial|consultorio)\b/.test(n) ? 'Presencial' : '');
  const STOP = new Set(['para', 'pra', 'na', 'no', 'nas', 'nos', 'em', 'dia', 'as', 'a', 'o', 'hoje', 'amanha', 'depois', 'daqui', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'consulta', 'com', 'que', 'vem', 'proxima', 'proximo', 'manha', 'tarde', 'noite', 'horario', 'ao', 'h', 'e', 'pela', 'pelo', 'feira', 'semana', 'retorno', 'primeira', 'avaliacao', 'online', 'presencial', 'video', 'tel', 'telefone', 'whatsapp', 'fone', 'como', 'confirmada', 'confirmado', 'faltou', 'atendida', 'atendido', 'realizada', 'compareceu', 'veio', 'nao', 'foi', 'ja', 'esta', 'ela']);
  const LEAD = new Set(['consulta', 'uma', 'um', 'a', 'o', 'para', 'pra', 'paciente', 'com', 'da', 'do', 'de', 'retorno', 'primeira']);
  const LIGA = new Set(['da', 'de', 'do', 'dos', 'das']);
  const cap = (w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w);
  function parseNome(orig, verbRx) {
    const m = norm(orig).match(verbRx);
    if (!m) return '';
    const resto = orig.slice(m.index + m[0].length).trim().split(/\s+/).filter(Boolean);
    while (resto.length && LEAD.has(norm(resto[0]))) resto.shift();
    const out = [];
    for (let i = 0; i < resto.length && out.length < 5; i++) {
      const w = resto[i].replace(/[.,;:!?]/g, ''), nw = norm(w);
      if (!nw) break;
      if (LIGA.has(nw) && out.length && resto[i + 1] && /^[A-ZÀ-Ý]/.test(resto[i + 1]) && !STOP.has(norm(resto[i + 1]))) { out.push(nw); continue; }
      if (STOP.has(nw) || LIGA.has(nw) || /\d/.test(nw)) break;
      out.push(cap(w));
    }
    return out.join(' ');
  }
  const parseTel = (t) => { const m = t.replace(/[^\d\s()-]/g, ' ').match(/(\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4})/); const d = m ? U.soDigitos(m[1]) : ''; return d.length >= 10 && d.length <= 11 ? d : ''; };
  const dataPalavra = (iso) => (iso === hoje() ? 'hoje' : iso === U.somaDias(hoje(), 1) ? 'amanhã' : U.dataBR(iso));
  const modoTxt = (m) => (m ? ' · ' + m.toLowerCase() : '');

  /* ---------- consultas ---------- */
  const consultas = (d) => DB.list('agenda').filter((a) => a.data === d && ativa(a)).sort((a, b) => a.hora.localeCompare(b.hora));
  const deHoje = () => DB.list('agenda').filter((a) => ativa(a) && a.data >= hoje() && a.status !== 'realizada').sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  // cada palavra digitada tem de ser o começo de uma palavra do nome ("Ana" não casa com "Mariana")
  const casaNome = (nome, paciente) => {
    const k = norm(nome).split(/\s+/).filter((x) => x.length > 1), w = norm(paciente).split(/\s+/);
    return k.length > 0 && k.every((x) => w.some((p) => p.indexOf(x) === 0));
  };
  function porNome(nome, lista) {
    return (lista || deHoje()).filter((a) => casaNome(nome, a.paciente));
  }
  const jaFoiAtendida = (nome) => DB.list('agenda').some((a) => a.status === 'realizada' && norm(a.paciente) === norm(nome));
  const linha = (a) => '<li style="--c:' + AG.cor(a.tipo) + '"><b>' + esc(a.hora) + '</b> ' + esc(a.paciente) + ' <small>· ' + esc(a.tipo.toLowerCase()) + esc(modoTxt(a.modo)) + '</small> <span class="tag ' + esc(a.status) + '">' + esc(a.status) + '</span></li>';

  /* ---------- comandos ---------- */
  function resumoDia(d) {
    d = d || hoje();
    const l = consultas(d), conf = l.filter((a) => a.status === 'confirmada').length;
    const online = l.filter((a) => a.modo === 'Online').length;
    const proxima = d === hoje() ? l.find((a) => a.hora >= U.agoraHM() && a.status !== 'realizada') : l[0];
    const rec = DB.list('recados').filter((r) => r.status === 'novo').length;
    const venc = DB.list('lembretes').filter((x) => !x.feito && x.data + 'T' + x.hora <= hoje() + 'T' + U.agoraHM()).length;
    const ret = AG.retornosPendentes().length;
    let html = '<p><b>' + esc(dataPalavra(d).replace(/^./, (c) => c.toUpperCase())) + '</b>: ' + (l.length ? l.length + ' consulta' + (l.length > 1 ? 's' : '') + ' (' + conf + ' confirmada' + (conf === 1 ? '' : 's') + (online ? ', ' + online + ' online' : '') + ').' : 'nenhuma consulta marcada.') + '</p>';
    if (l.length) html += '<ul class="ia-list">' + l.slice(0, 10).map(linha).join('') + '</ul>';
    if (proxima && d === hoje()) html += '<p>Próxima: <b>' + esc(proxima.hora) + '</b> com ' + esc(proxima.paciente) + '.</p>';
    if (d === hoje()) {
      const partes = [];
      partes.push(rec ? rec + ' recado' + (rec > 1 ? 's' : '') + ' novo' + (rec > 1 ? 's' : '') + ' do site' : 'nenhum recado novo');
      if (venc) partes.push(venc + ' lembrete' + (venc > 1 ? 's' : '') + ' vencido' + (venc > 1 ? 's' : ''));
      if (ret) partes.push(ret + ' retorno' + (ret > 1 ? 's' : '') + ' para agendar');
      html += '<p>' + esc(partes.join(' · ').replace(/^./, (c) => c.toUpperCase())) + '.</p>';
    }
    const livres = AG.livres(d, PRI, '').length;
    html += '<p class="ia-muted">' + (AG.grade(d).length ? livres + ' horário' + (livres === 1 ? '' : 's') + ' livre' + (livres === 1 ? '' : 's') + ' para primeira consulta.' : 'Dia sem atendimento na grade configurada.') + '</p>';
    const extra = [];
    if (rec && d === hoje()) extra.push('Recados novos');
    if (ret && d === hoje()) extra.push('Retornos pendentes');
    extra.push(d === hoje() ? 'Horários livres amanhã' : 'Resumo de hoje');
    return diz(html, extra.concat(['Confirmar consultas de amanhã', 'Ajuda']));
  }

  function livresCmd(orig, n) {
    const pd = parseData(n), tipo = parseTipo(n) || PRI, per = parsePeriodo(n);
    let d = pd ? pd.iso : hoje();
    if (!pd && !AG.livres(d, tipo, per).length) { let k = 0; while (k++ < 14 && !AG.livres(d, tipo, per).length) d = U.somaDias(d, 1); }
    const l = AG.livres(d, tipo, per);
    if (!AG.grade(d, tipo).length) return diz('Não há atendimento em ' + esc(U.dataBR(d)) + ' (pela grade configurada).', ['Horários livres amanhã', 'Ajuda']);
    if (!l.length) {
      const prox = AG.proximos(tipo, per, 3, U.somaDias(d, 1));
      return diz('Não há horário livre para ' + esc(tipo.toLowerCase()) + ' em ' + esc(dataPalavra(d)) + (per ? ' à ' + esc(per.toLowerCase()) : '') + '. Próximos livres: ' +
        prox.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => window.PN.abrirCons({ data: s.data, hora: s.hora, tipo }))).join(' '));
    }
    return diz('<p>Livres para <b>' + esc(tipo.toLowerCase()) + '</b> (' + AG.dur(tipo) + ' min) ' + esc(dataPalavra(d)) + (per ? ' à ' + esc(per.toLowerCase()) : '') + ':</p><div class="ia-slots">' +
      l.slice(0, 14).map((h) => acao(h, () => window.PN.abrirCons({ data: d, hora: h, tipo }))).join('') + '</div><p class="ia-muted">Toque num horário para marcar.</p>');
  }

  // ---- marcar (com perguntas quando faltar algo)
  let fluxo = null;
  function marcarCmd(orig, n) {
    const pd = parseData(n);
    const d = { nome: parseNome(orig, /\b(marcar|marca|agendar|agenda|encaixar|encaixa)\b/), tel: parseTel(orig), tipo: parseTipo(n), modo: parseModo(n), hora: parseHora(n.replace((pd || {}).rx || /$^/, ' ')) };
    if (pd) d.data = pd.iso;
    d.periodo = parsePeriodo(n);
    fluxo = { tipo: 'marcar', d };
    return marcarSeguir();
  }
  function ligarRecado(d) {
    if (!d.nome || d.recadoId) return;
    const r = DB.list('recados').find((x) => x.status !== 'agendado' && x.status !== 'arquivado' && porNome(d.nome, [{ paciente: x.nome }]).length);
    if (r) { d.recadoId = r.id; d.tel = d.tel || r.telefone; d.nome = r.nome; d.modo = d.modo || (/online/i.test(r.modalidade) ? 'Online' : /presencial/i.test(r.modalidade) ? 'Presencial' : ''); d.obs = r.objetivo ? 'Objetivo: ' + r.objetivo : ''; }
  }
  // "Juliana" vira "Juliana Prado" se houver uma só paciente com esse nome na agenda
  function resolverPaciente(d) {
    const nomes = Array.from(new Set(DB.list('agenda').map((a) => a.paciente).filter((p) => casaNome(d.nome, p))));
    if (nomes.length === 1) d.nome = nomes[0];
    if (!d.tel) { const a = DB.list('agenda').find((x) => norm(x.paciente) === norm(d.nome) && x.telefone); if (a) d.tel = a.telefone; }
    if (!d.modo) { const a = DB.list('agenda').filter((x) => norm(x.paciente) === norm(d.nome) && x.modo).sort((x, y) => y.data.localeCompare(x.data))[0]; if (a) d.modo = a.modo; }
  }
  function marcarSeguir() {
    const d = fluxo.d;
    ligarRecado(d);
    if (!d.nome) { fluxo.falta = 'nome'; return diz('Qual é o nome da paciente?'); }
    resolverPaciente(d);
    if (!d.tipo) d.tipo = jaFoiAtendida(d.nome) ? RET : PRI;
    if (!d.data) {
      fluxo.falta = 'data';
      const sug = AG.proximos(d.tipo, d.periodo, 4);
      return diz('Para que dia? Próximos horários livres para ' + esc(d.tipo.toLowerCase()) + ':<div class="ia-slots">' +
        sug.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => { d.data = s.data; d.hora = s.hora; marcarSeguir(); })).join('') + '</div>', ['Hoje', 'Amanhã', 'Cancelar']);
    }
    if (!d.hora) {
      fluxo.falta = 'hora';
      const l = AG.livres(d.data, d.tipo, d.periodo);
      if (!l.length) {
        const prox = AG.proximos(d.tipo, d.periodo, 4, U.somaDias(d.data, 1));
        return diz('Não há horário livre ' + esc(dataPalavra(d.data)) + '. Que tal:<div class="ia-slots">' +
          prox.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => { d.data = s.data; d.hora = s.hora; marcarSeguir(); })).join('') + '</div>', ['Cancelar']);
      }
      return diz('Que horas? Livres ' + esc(dataPalavra(d.data)) + ':<div class="ia-slots">' + l.slice(0, 12).map((h) => acao(h, () => { d.hora = h; marcarSeguir(); })).join('') + '</div>', ['Cancelar']);
    }
    const conflito = AG.ocupado(d.data, d.hora, d.tipo);
    if (conflito) {
      const alt = AG.livres(d.data, d.tipo, '').filter((h) => Math.abs(AG.toMin(h) - AG.toMin(d.hora)) <= 150).slice(0, 5);
      d.hora = null; fluxo.falta = 'hora';
      return diz('Esse horário bate com <b>' + esc(conflito.paciente) + '</b> (' + esc(conflito.hora) + ', ' + esc(conflito.tipo.toLowerCase()) + '). ' +
        (alt.length ? 'Livres perto dele:<div class="ia-slots">' + alt.map((h) => acao(h, () => { d.hora = h; marcarSeguir(); })).join('') + '</div>' : 'Diga outro horário.'), ['Cancelar']);
    }
    const foraGrade = AG.grade(d.data, d.tipo).indexOf(d.hora) < 0;
    const a = AG.criarConsulta({ paciente: d.nome, telefone: d.tel, data: d.data, hora: d.hora, tipo: d.tipo, modo: d.modo, obs: d.obs, recadoId: d.recadoId }, true);
    fluxo = null;
    return diz('<p>Pronto! Marquei <b>' + esc(a.paciente) + '</b> ' + esc(dataPalavra(a.data)) + ' às <b>' + esc(a.hora) + '</b> · ' + esc(a.tipo.toLowerCase()) + ' (' + AG.dur(a.tipo) + ' min)' + esc(modoTxt(a.modo)) + '.</p>' +
      (foraGrade ? '<p class="ia-muted">Atenção: esse horário fica fora da grade configurada.</p>' : '') +
      (d.recadoId ? '<p class="ia-muted">Liguei ao recado que chegou pelo site e marquei como agendado.</p>' : '') +
      '<p class="ia-muted">Criei um lembrete para confirmar na véspera.</p><div class="ia-acts">' +
      (a.modo ? '' : acao('Online', () => { DB.update('agenda', a.id, { modo: 'Online' }); diz('Anotado: online.'); }) + acao('Presencial', () => { DB.update('agenda', a.id, { modo: 'Presencial' }); diz('Anotado: presencial.'); })) +
      (a.telefone ? waLink(a.telefone, AG.msgConfirma(Object.assign({}, a)), 'Enviar confirmação') : acao('Adicionar WhatsApp', () => window.PN.abrirCons(a))) +
      acao('Desfazer', () => desfazerCriar(a.id)) + acao('Ver na agenda', () => { window.PN.aba('agenda'); window.PN.ir(a.data); }) + '</div>');
  }
  function desfazerCriar(id) {
    const a = DB.list('agenda').find((x) => x.id === id); if (!a) return diz('Essa consulta já não existe.');
    DB.remove('agenda', id);
    DB.list('lembretes').filter((l) => l.consultaId === id).forEach((l) => DB.remove('lembretes', l.id));
    if (a.recadoId) DB.update('recados', a.recadoId, { status: 'novo' });
    return diz('Desfeito: removi a consulta de ' + esc(a.paciente) + ' e o lembrete dela.');
  }
  function escolher(lista, texto, fn) {
    if (lista.length === 1) { fn(lista[0]); return fila; }
    return diz(texto + '<div class="ia-slots">' + lista.slice(0, 6).map((a) => acao(a.paciente + ' · ' + U.dataCurta(a.data) + ' ' + a.hora, () => fn(a))).join('') + '</div>');
  }

  // ---- remarcar
  function remarcarCmd(orig, n) {
    const nome = parseNome(orig, /\b(remarcar|remarca|reagendar|reagenda|mudar|muda|transferir|passar|passa)\b/);
    if (!nome) return diz('De quem é a consulta que você quer remarcar? Ex.: "remarcar Juliana para sexta 10h".');
    const l = porNome(nome);
    if (!l.length) return diz('Não encontrei consulta de hoje em diante para <b>' + esc(nome) + '</b>.');
    const pd = parseData(n);
    const nova = { data: pd ? pd.iso : '', hora: parseHora(n.replace(pd ? pd.rx : /$^/, ' ')) || '' };
    return escolher(l, 'Encontrei mais de uma. Qual delas?', (a) => { fluxo = { tipo: 'remarcar', alvo: a, d: nova }; remarcarSeguir(); });
  }
  function remarcarSeguir() {
    const a = fluxo.alvo, d = fluxo.d;
    if (!d.data) {
      fluxo.falta = 'data';
      const sug = AG.proximos(a.tipo, '', 4);
      return diz('Para quando vamos passar a consulta de ' + esc(a.paciente) + ' (hoje em ' + esc(U.dataBR(a.data)) + ' às ' + esc(a.hora) + ')?<div class="ia-slots">' +
        sug.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => { d.data = s.data; d.hora = s.hora; remarcarSeguir(); })).join('') + '</div>', ['Cancelar']);
    }
    if (!d.hora) {
      fluxo.falta = 'hora';
      const l = AG.livres(d.data, a.tipo, '');
      return diz('Que horas? Livres ' + esc(dataPalavra(d.data)) + ':<div class="ia-slots">' + l.slice(0, 12).map((h) => acao(h, () => { d.hora = h; remarcarSeguir(); })).join('') + '</div>', ['Cancelar']);
    }
    const conflito = AG.ocupado(d.data, d.hora, a.tipo, a.id);
    if (conflito) { d.hora = ''; fluxo.falta = 'hora'; return diz('Às ' + esc(conflito.hora) + ' já tem ' + esc(conflito.paciente) + '. Escolha outro horário.', ['Cancelar']); }
    const antes = { data: a.data, hora: a.hora, status: a.status };
    DB.update('agenda', a.id, { data: d.data, hora: d.hora, status: 'agendada' });
    fluxo = null;
    const msg = 'Olá, ' + AG.primeiro(a.paciente) + '! Aqui é a ' + (S.nome || 'Nutri').split(' ')[0] + ', nutricionista. Sua consulta foi remarcada para ' + U.dataBR(d.data) + ' às ' + d.hora + '. Fica bom para você?';
    return diz('Remarquei <b>' + esc(a.paciente) + '</b> para ' + esc(dataPalavra(d.data)) + ' às <b>' + esc(d.hora) + '</b>.<div class="ia-acts">' +
      waLink(a.telefone, msg, 'Avisar no WhatsApp') + acao('Desfazer', () => { DB.update('agenda', a.id, antes); diz('Desfeito: a consulta voltou para ' + esc(U.dataBR(antes.data)) + ' às ' + esc(antes.hora) + '.'); }) + '</div>');
  }

  // ---- cancelar
  function cancelarCmd(orig) {
    const nome = parseNome(orig, /\b(cancelar|cancela|desmarcar|desmarca)\b/);
    if (!nome) return diz('De quem é a consulta que você quer cancelar? Ex.: "cancelar a consulta da Juliana".');
    const l = porNome(nome);
    if (!l.length) return diz('Não encontrei consulta de hoje em diante para <b>' + esc(nome) + '</b>.');
    return escolher(l, 'Encontrei mais de uma. Qual delas?', (a) => diz('Cancelar a consulta de <b>' + esc(a.paciente) + '</b> em ' + esc(U.dataBR(a.data)) + ' às ' + esc(a.hora) + '?<div class="ia-acts">' +
      acao('Sim, cancelar', () => {
        const antes = a.status;
        DB.update('agenda', a.id, { status: 'cancelada' });
        const msg = 'Olá, ' + AG.primeiro(a.paciente) + '! Sua consulta de ' + U.dataBR(a.data) + ' às ' + a.hora + ' foi cancelada. Quer remarcar para outro dia?';
        diz('Consulta cancelada. O horário ficou livre.<div class="ia-acts">' + waLink(a.telefone, msg, 'Avisar no WhatsApp') + acao('Desfazer', () => { DB.update('agenda', a.id, { status: antes }); diz('Desfeito: a consulta de ' + esc(a.paciente) + ' voltou para a agenda.'); }) + '</div>');
      }, 'ia-act--danger') + acao('Não', () => diz('Tudo bem, mantive a consulta.')) + '</div>'));
  }

  // ---- confirmar
  function confirmarCmd(orig, n) {
    const nome = parseNome(orig, /\b(confirmar|confirma|confirmou)\b/);
    if (nome && !/consultas?|todas|amanha|hoje/.test(norm(nome))) {
      const l = porNome(nome);
      if (!l.length) return diz('Não encontrei consulta de hoje em diante para <b>' + esc(nome) + '</b>.');
      return escolher(l, 'Qual delas foi confirmada?', (a) => { DB.update('agenda', a.id, { status: 'confirmada' }); diz('Marquei como confirmada: <b>' + esc(a.paciente) + '</b>, ' + esc(dataPalavra(a.data)) + ' às ' + esc(a.hora) + '.'); });
    }
    const pd = parseData(n), d = pd ? pd.iso : U.somaDias(hoje(), 1);
    const l = consultas(d).filter((a) => a.status === 'agendada');
    if (!l.length) return diz('Todas as consultas de ' + esc(dataPalavra(d)) + ' já estão confirmadas (ou não há consultas).');
    return diz('<p>Faltam confirmar ' + l.length + ' consulta' + (l.length > 1 ? 's' : '') + ' de ' + esc(dataPalavra(d)) + '. Mensagens prontas:</p><ul class="ia-list ia-list--acts">' +
      l.map((a) => '<li style="--c:' + AG.cor(a.tipo) + '"><span><b>' + esc(a.hora) + '</b> ' + esc(a.paciente) + '</span><span>' +
        (a.telefone ? waLink(a.telefone, AG.msgConfirma(a), 'WhatsApp') : '<small>sem WhatsApp</small>') +
        acao('Confirmada', () => { DB.update('agenda', a.id, { status: 'confirmada' }); diz('Ok, ' + esc(a.paciente) + ' confirmada.'); }) + '</span></li>').join('') + '</ul>');
  }

  // ---- depois da consulta: retorno
  function depoisDaConsulta(a) {
    const alvo = AG.dataRetorno(a);
    const sug = AG.proximos(RET, '', 3, U.somaDias(alvo, -3));
    return diz('<p>Consulta de <b>' + esc(a.paciente) + '</b> concluída. ' + esc('O retorno é parte do processo:') + ' quer deixar marcado para daqui a ~' + AG.RETORNO + ' dias?</p>' +
      (sug.length ? '<div class="ia-slots">' + sug.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => {
        const r = AG.criarConsulta({ paciente: a.paciente, telefone: a.telefone, data: s.data, hora: s.hora, tipo: RET, modo: a.modo }, true);
        diz('Retorno marcado: <b>' + esc(r.paciente) + '</b>, ' + esc(U.dataBR(r.data)) + ' às <b>' + esc(r.hora) + '</b>' + esc(modoTxt(r.modo)) + '.<div class="ia-acts">' + waLink(r.telefone, AG.msgConfirma(r), 'Avisar no WhatsApp') + acao('Desfazer', () => desfazerCriar(r.id)) + '</div>');
      })).join('') + '</div>' : '') +
      '<div class="ia-acts">' + acao('Lembrar de agendar depois', () => {
        const dia = U.somaDias(alvo, -7) > hoje() ? U.somaDias(alvo, -7) : hoje();
        DB.add('lembretes', { texto: 'Agendar retorno de ' + a.paciente, data: dia, hora: '09:00', telefone: a.telefone || '', feito: false });
        diz('Combinado: em ' + esc(U.dataBR(dia)) + ' eu te lembro de agendar o retorno de ' + esc(a.paciente) + '.');
      }) + acao('Agora não', () => diz('Tudo bem. Ela vai aparecer em "Retornos pendentes" quando chegar a hora.')) + '</div>');
  }
  function faltou(a) {
    return diz('Registrei que <b>' + esc(a.paciente) + '</b> faltou.' + (a.telefone ? '<div class="ia-acts">' + waLink(a.telefone, 'Olá, ' + AG.primeiro(a.paciente) + '! Senti sua falta hoje na consulta. Quer remarcar? Me diz o melhor dia para você.', 'Oferecer remarcação') + '</div>' : ''));
  }
  function statusCmd(orig, n, status) {
    const nome = parseNome(orig, status === 'faltou' ? /\b(faltou|falta)\b/ : /\b(atendida|atendido|realizada|realizado|compareceu|veio|atendi)\b/) || parseNome(orig, /^/);
    const lista = DB.list('agenda').filter((a) => ativa(a) && a.data <= hoje() && a.status !== status).sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
    const l = porNome(nome, lista).slice(0, 4);
    if (!l.length) return diz('Não encontrei consulta recente de <b>' + esc(nome || '?') + '</b>.');
    return escolher(l, 'Qual delas?', (a) => { window.PN.mudarStatus(a, status); });
  }

  // ---- retornos pendentes
  function retornosCmd() {
    const l = AG.retornosPendentes();
    if (!l.length) return diz('Nenhum retorno pendente: todas as pacientes atendidas já têm a próxima consulta marcada (ou ainda é cedo).');
    return diz('<p>' + l.length + ' paciente' + (l.length > 1 ? 's' : '') + ' sem retorno marcado:</p>' + l.slice(0, 6).map((a) => {
      const dias = U.difDias(a.data, hoje());
      const sug = AG.proximos(RET, '', 2, AG.dataRetorno(a));
      return '<div class="ia-rec" style="--c:' + AG.cor(RET) + '"><p><b>' + esc(a.paciente) + '</b> · última consulta há ' + dias + ' dias' + esc(modoTxt(a.modo)) + '</p>' +
        (sug.length ? '<div class="ia-slots">' + sug.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => {
          const r = AG.criarConsulta({ paciente: a.paciente, telefone: a.telefone, data: s.data, hora: s.hora, tipo: RET, modo: a.modo }, true);
          diz('Retorno de <b>' + esc(r.paciente) + '</b> marcado para ' + esc(U.dataBR(r.data)) + ' às <b>' + esc(r.hora) + '</b>.<div class="ia-acts">' + waLink(r.telefone, AG.msgConfirma(r), 'Avisar no WhatsApp') + acao('Desfazer', () => desfazerCriar(r.id)) + '</div>');
        })).join('') + '</div>' : '') +
        '<div class="ia-acts">' + waLink(a.telefone, AG.msgRetorno(a, sug[0]), 'Convidar no WhatsApp') + '</div></div>';
    }).join(''));
  }

  // ---- recados
  function recadosCmd(lista, intro) {
    const l = lista || DB.list('recados').filter((r) => r.status === 'novo');
    if (!l.length) return diz('Nenhum recado novo por enquanto. Quando alguém preencher o formulário do site, eu aviso aqui.');
    return diz((intro || '<p>' + l.length + ' recado' + (l.length > 1 ? 's' : '') + ' novo' + (l.length > 1 ? 's' : '') + ':</p>') + l.slice(0, 5).map(cartaoRecado).join(''));
  }
  function cartaoRecado(r) {
    const sug = AG.proximos(PRI, '', 3);
    return '<div class="ia-rec" style="--c:' + AG.cor(PRI) + '"><p><b>' + esc(r.nome) + '</b> · ' + esc(r.objetivo || 'objetivo não informado') + (r.modalidade ? ' · ' + esc(r.modalidade.toLowerCase()) : '') + '</p>' +
      (r.dietas ? '<p class="ia-muted">' + esc(r.dietas) + '</p>' : '') +
      (r.recado ? '<p class="ia-quote">“' + esc(r.recado) + '”</p>' : '') +
      (sug.length ? '<p class="ia-muted">Sugiro para a primeira consulta:</p><div class="ia-slots">' + sug.map((s) => acao(U.dataCurta(s.data) + ' · ' + s.hora, () => {
        const a = window.PN.agendarSlot(r.id, s.data, s.hora);
        if (a) avisarAgendado(a);
      })).join('') + '</div>' : '') +
      '<div class="ia-acts">' + (r.telefone ? waLink(r.telefone, sug[0] ? AG.msgSlot(r, sug[0]) : AG.msgRecado(r), 'Responder no WhatsApp') : '<small class="ia-muted">Sem WhatsApp: ' + (/Instagram/.test(r.origem || '') ? 'a mensagem dela foi pelo Instagram.' : 'ela não deixou número.') + '</small>') +
      acao('Arquivar', () => { DB.update('recados', r.id, { status: 'arquivado' }); diz('Recado de ' + esc(r.nome) + ' arquivado.'); }) + '</div></div>';
  }
  function avisarAgendado(a) {
    return diz('Marquei <b>' + esc(a.paciente) + '</b> para ' + esc(dataPalavra(a.data)) + ' às <b>' + esc(a.hora) + '</b> · primeira consulta' + esc(modoTxt(a.modo)) + '. O recado ficou como agendado e criei o lembrete de confirmação.<div class="ia-acts">' +
      waLink(a.telefone, AG.msgConfirma(a), 'Enviar confirmação') + acao('Desfazer', () => desfazerCriar(a.id)) + '</div>');
  }

  // ---- lembretes
  function lembreteCmd(orig, n) {
    const m = orig.match(/(?:lembrar|lembra|lembre|lembrete|anotar|anota)(?:-me)?\s*(?:de|que|:)?\s*(.+)$/i);
    let texto = m ? m[1] : '';
    if (!texto || /^(s|vencidos|abertos|de hoje)?$/.test(norm(texto))) {
      const l = DB.list('lembretes').filter((x) => !x.feito).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
      if (!l.length) return diz('Nenhum lembrete aberto.');
      return diz('<p>Lembretes abertos:</p><ul class="ia-list">' + l.slice(0, 8).map((x) => '<li><b>' + esc(U.dataCurta(x.data)) + ' ' + esc(x.hora) + '</b> ' + esc(x.texto) + '</li>').join('') + '</ul>');
    }
    const pd = parseData(n);
    let hora = parseHora(n.replace(pd ? pd.rx : /$^/, ' '));
    const data = pd ? pd.iso : (hora && hora > U.agoraHM() ? hoje() : U.somaDias(hoje(), 1));
    hora = hora || '09:00';
    texto = texto.replace(/(^|\s)(depois de amanh[ãa]|amanh[ãa]|hoje)(?=\s|$|[.,!?])/gi, ' ').replace(/\bdaqui a \d{1,3} dias\b/gi, '').replace(/\b(às|as)\s*\d{1,2}(:\d{2})?\s*h?\b/gi, '').replace(/\b\d{1,2}\s*(h|:)\s*\d{0,2}\b/gi, '').replace(/\bdia \d{1,2}\b/gi, '').replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '').replace(/\s{2,}/g, ' ').trim();
    texto = texto.charAt(0).toUpperCase() + texto.slice(1);
    const l = DB.add('lembretes', { texto: texto.slice(0, 140), data, hora, feito: false });
    return diz('Anotado: <b>' + esc(l.texto) + '</b>, ' + esc(dataPalavra(data)) + ' às ' + esc(hora) + '. Eu aviso na tela quando chegar a hora.<div class="ia-acts">' + acao('Desfazer', () => { DB.remove('lembretes', l.id); diz('Lembrete removido.'); }) + '</div>');
  }

  // ---- semana
  function semanaCmd() {
    let html = '<p>Próximos 7 dias:</p><ul class="ia-list">';
    let total = 0, pri = 0, ret = 0, onl = 0;
    for (let i = 0; i < 7; i++) {
      const d = U.somaDias(hoje(), i), l = consultas(d);
      total += l.length; l.forEach((a) => { if (a.tipo === RET) ret++; else pri++; if (a.modo === 'Online') onl++; });
      if (!AG.grade(d).length && !l.length) continue;
      const pend = l.filter((a) => a.status === 'agendada').length;
      html += '<li><b>' + esc(U.dataCurta(d)) + '</b> ' + l.length + ' consulta' + (l.length === 1 ? '' : 's') + (pend ? ' <small>· ' + pend + ' a confirmar</small>' : '') + ' <small>· ' + AG.livres(d, PRI, '').length + ' livres</small></li>';
    }
    html += '</ul><p>Total: <b>' + total + '</b>' + (total ? ' · ' + pri + ' primeira' + (pri === 1 ? '' : 's') + ' consulta' + (pri === 1 ? '' : 's') + ', ' + ret + ' retorno' + (ret === 1 ? '' : 's') + ', ' + onl + ' online' : '') + '.</p>';
    return diz(html, ['Conflitos na agenda', 'Retornos pendentes', 'Ajuda']);
  }
  function conflitosCmd() {
    const l = DB.list('agenda').filter((a) => ativa(a) && a.data >= hoje()).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)), achados = [];
    l.forEach((a, i) => l.slice(i + 1).forEach((b) => {
      if (a.data === b.data && AG.toMin(a.hora) < AG.toMin(b.hora) + AG.dur(b.tipo) && AG.toMin(b.hora) < AG.toMin(a.hora) + AG.dur(a.tipo)) achados.push([a, b]);
    }));
    if (!achados.length) return diz('Nenhum conflito: não há consultas sobrepostas.');
    return diz('<p>Consultas sobrepostas:</p><ul class="ia-list">' + achados.map((p) => '<li><b>' + esc(U.dataCurta(p[0].data)) + '</b> ' + esc(p[0].hora) + ' ' + esc(p[0].paciente) + ' × ' + esc(p[1].hora) + ' ' + esc(p[1].paciente) + '</li>').join('') + '</ul><p class="ia-muted">Para resolver, diga por exemplo "remarcar Nome para sexta 10h".</p>');
  }
  function ajudaCmd() {
    return diz('<p>Eu recebo os recados do site e cuido da agenda com você. Experimente:</p><ul class="ia-list ia-list--plain">' +
      ['marcar Ana Teixeira amanhã 14h online', 'horários livres sexta à tarde', 'retorno da Juliana daqui a 30 dias', 'remarcar Camila para quinta 10h', 'cancelar a consulta da Beatriz',
        'confirmar consultas de amanhã', 'Letícia foi atendida', 'retornos pendentes', 'lembrar de enviar o plano da Mariana amanhã 9h', 'resumo da semana']
        .map((t) => '<li>' + acao(t, () => entrada(t), 'ia-act--ex') + '</li>').join('') + '</ul>' +
      '<p class="ia-muted">Passo a passo completo no <a href="manual.html">manual de uso</a>.</p><p class="ia-muted">Neste protótipo eu funciono por regras, sem enviar dados a ninguém. Na versão final, posso ser ligada a uma IA de verdade (como o Claude) por um servidor seguro.</p>');
  }

  /* ---------- roteador ---------- */
  function entrada(texto) {
    eu(texto);
    const orig = texto.trim(), n = norm(orig);
    if (fluxo && /^(cancelar|cancela|deixa( pra la)?|esquece|parar|sair|nao)$/.test(n)) { fluxo = null; return diz('Tudo bem, deixei para lá.'); }
    if (fluxo) return responderFluxo(orig, n);
    return rotear(orig, n) || naoEntendi();
  }
  function naoEntendi() {
    return diz('Não entendi bem. Posso marcar, remarcar, cancelar e confirmar consultas, cuidar dos retornos, achar horários livres, organizar os recados do site e criar lembretes.', ['Ajuda', 'Resumo de hoje', 'Recados novos']);
  }
  function rotear(orig, n) {
    fluxo = null;
    if (/\b(ajuda|comandos)\b|o que (voce )?(faz|sabe fazer)|como (te )?uso/.test(n)) return ajudaCmd();
    if (/\b(conflit|choque|sobrepost|duplicad)\w*/.test(n)) return conflitosCmd();
    if (/\bretornos? (pendentes?|atrasados?|a agendar|para agendar)\b|^retornos$/.test(n)) return retornosCmd();
    if (/\bsemana\b/.test(n)) return semanaCmd();
    if (/\b(remarc|reagend)\w*|\b(mudar|transferir|passar) (a )?(consulta )?(d[aoe] )?/.test(n)) return remarcarCmd(orig, n);
    if (/\b(cancel|desmarc)\w*/.test(n)) return cancelarCmd(orig, n);
    if (/\bconfirm\w*/.test(n)) return confirmarCmd(orig, n);
    if (/\b(lembr|anot)\w*/.test(n)) return lembreteCmd(orig, n);
    if (/\b(faltou)\b/.test(n)) return statusCmd(orig, n, 'faltou');
    if (/\b(atendid[oa]|realizad[oa]|compareceu|atendi)\b/.test(n)) return statusCmd(orig, n, 'realizada');
    if (/^retorno (d[aoe] )?\S/.test(n)) return marcarCmd('marcar ' + orig, 'marcar ' + n);
    if (/\b(marcar|marca|agendar|encaixar|encaixa)\b/.test(n)) return marcarCmd(orig, n);
    if (/\b(livres?|vagas?|disponive(l|is)|horarios?)\b/.test(n)) return livresCmd(orig, n);
    if (/\b(recados?|pedidos?|mensagens?)\b/.test(n)) return recadosCmd();
    if (/\b(resumo|agenda|hoje|amanha|como (esta|ta)|dia)\b/.test(n) || parseData(n)) { const pd = parseData(n); return resumoDia(pd ? pd.iso : hoje()); }
    if (/\b(oi|ola|bom dia|boa tarde|boa noite|e ai)\b/.test(n)) return resumoDia(hoje());
    if (/obrigad|valeu/.test(n)) return diz('Por nada! Estou por aqui.');
    return null;
  }
  function responderFluxo(orig, n) {
    const atual = fluxo, d = fluxo.d;
    const outro = (pergunta, chips) => { const r = rotear(orig, n); if (r) return r; fluxo = atual; return diz(pergunta, chips); };
    if (atual.falta === 'nome') {
      if (/\d/.test(n) || n.split(/\s+/).length > 5 || /\b(faltou|confirm|cancel|remarc|livres?|horarios?|recados?|lembr|resumo|semana|conflit|ajuda|retornos)\w*/.test(n)) return outro('Qual é o nome da paciente?', ['Cancelar']);
      d.nome = orig.split(/\s+/).slice(0, 5).map(cap).join(' ');
    } else if (atual.falta === 'data') {
      const pd = parseData(n);
      if (!pd) return outro('Não entendi a data. Pode dizer "amanhã", "sexta" ou "25/11".', ['Hoje', 'Amanhã', 'Cancelar']);
      d.data = pd.iso; d.hora = d.hora || parseHora(n.replace(pd.rx, ' '));
    } else if (atual.falta === 'hora') {
      const hh = parseHora(n) || (/^\d{1,2}$/.test(n) ? parseHora(n + 'h') : null);
      if (!hh) return outro('Não entendi o horário. Pode dizer "14h" ou "9:30".', ['Cancelar']);
      d.hora = hh;
    }
    fluxo = atual;
    return atual.tipo === 'remarcar' ? remarcarSeguir() : marcarSeguir();
  }

  /* ---------- recados que chegam do site ---------- */
  const VISTOS = DB.chave('ia_vistos');
  function vistos() { try { return JSON.parse(localStorage.getItem(VISTOS)) || []; } catch (e) { return []; } }
  function marcarVistos(ids) { try { localStorage.setItem(VISTOS, JSON.stringify(vistos().concat(ids).slice(-500))); } catch (e) { /* sem armazenamento */ } }
  function novosRecados() {
    const v = vistos();
    const l = DB.list('recados').filter((r) => r.status === 'novo' && v.indexOf(r.id) < 0);
    if (!l.length) return;
    marcarVistos(l.map((r) => r.id));
    recadosCmd(l, '<p><b>' + (l.length > 1 ? 'Chegaram ' + l.length + ' recados novos' : 'Chegou um recado novo') + '</b> pelo site:</p>');
  }
  window.addEventListener('db:externo', novosRecados);

  window.PNIA = { avisarAgendado, entrada, depoisDaConsulta, faltou };

  /* ---------- início ---------- */
  setChips();
  const primeiraVez = (() => { try { const p = !localStorage.getItem(DB.chave('ia_ola')); localStorage.setItem(DB.chave('ia_ola'), '1'); return p; } catch (e) { return false; } })();
  const hh = new Date().getHours();
  const nutri = (S.nome || 'Nutri').split(' ')[0];
  diz('<p>' + (hh < 12 ? 'Bom dia' : hh < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + esc(nutri) + '! ' + (primeiraVez
    ? 'Eu sou a ' + esc(A) + ', sua assistente. Recebo os recados que chegam pelo site, sugiro horários, cuido dos retornos e dos lembretes. É só escrever do seu jeito.'
    : 'Aqui está o seu dia.') + '</p>').then(() => resumoDia(hoje())).then(novosRecados);
})();
