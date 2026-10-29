/* Área da nutri: agenda, recados do site, lembretes e retornos (dados no navegador). */
(function () {
  'use strict';
  const S = window.SITE || {};
  const P = S.painel || {};
  const esc = U.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const A = P.assistente || 'Flora';
  const NUTRI = (S.nome || 'Nutri').split(' ')[0];

  /* ============================================================
     Regras da agenda (usadas também pela assistente)
     ============================================================ */
  const AGC = Object.assign({ dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00', pausa: null, passo: 30, duracoes: {} }, P.agenda || {});
  const RETORNO = +P.retornoDias || 30;
  const TIPOS = DB.TIPOS;
  const COR = { 'Primeira consulta': '#6d5891', Retorno: '#5e7135' };
  const toMin = (hm) => { const p = String(hm || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  const toHM = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const dur = (tipo) => +(AGC.duracoes && AGC.duracoes[tipo]) || 60;
  const ativa = (a) => a.status !== 'cancelada';
  const cor = (tipo) => COR[tipo] || '#6d5891';

  // horários de início possíveis num dia, para um tipo de consulta
  function grade(data, tipo) {
    if (AGC.dias.indexOf(U.diaSemana(data)) < 0) return [];
    const d = dur(tipo || TIPOS[0]), out = [];
    for (let m = toMin(AGC.inicio); m + d <= toMin(AGC.fim); m += AGC.passo) {
      if (AGC.pausa && m < toMin(AGC.pausa[1]) && m + d > toMin(AGC.pausa[0])) continue;
      out.push(toHM(m));
    }
    return out;
  }
  // conflito: qualquer consulta ativa que se sobreponha no tempo (a nutri atende uma de cada vez)
  function ocupado(data, hora, tipo, ignorar) {
    const ini = toMin(hora), fim = ini + dur(tipo || TIPOS[0]);
    return DB.list('agenda').find((a) => a.id !== ignorar && ativa(a) && a.data === data &&
      toMin(a.hora) < fim && toMin(a.hora) + dur(a.tipo) > ini) || null;
  }
  function noPeriodo(h, periodo) {
    if (!periodo || periodo === 'Tanto faz') return true;
    return periodo === 'Manhã' ? toMin(h) < 720 : toMin(h) >= 720;
  }
  function livres(data, tipo, periodo) {
    const hoje = U.hojeISO(), agora = toMin(U.agoraHM()) + 30;
    return grade(data, tipo).filter((h) => (data !== hoje || toMin(h) >= agora) && noPeriodo(h, periodo) && !ocupado(data, h, tipo));
  }
  function proximos(tipo, periodo, n, desde) {
    const out = [];
    let d = desde && desde > U.hojeISO() ? desde : U.hojeISO();
    for (let i = 0; i < 60 && out.length < n; i++, d = U.somaDias(d, 1)) {
      const l = livres(d, tipo, periodo);
      if (l.length) out.push({ data: d, hora: l[0] });
      if (l.length > 3 && out.length < n) out.push({ data: d, hora: l[Math.ceil(l.length / 2)] });
    }
    return out.slice(0, n);
  }
  function criarConsulta(c, lembrar) {
    const nova = DB.add('agenda', {
      paciente: c.paciente, telefone: U.soDigitos(c.telefone || ''), data: c.data, hora: c.hora,
      tipo: c.tipo || TIPOS[0], modo: c.modo || '', status: c.status || 'agendada', obs: c.obs || '', recadoId: c.recadoId || ''
    });
    if (c.recadoId) DB.update('recados', c.recadoId, { status: 'agendado' });
    if (lembrar !== false) {
      const dia = U.somaDias(c.data, -1) >= U.hojeISO() ? U.somaDias(c.data, -1) : U.hojeISO();
      DB.add('lembretes', { texto: 'Confirmar ' + (nova.tipo === 'Retorno' ? 'retorno' : 'consulta') + ' de ' + c.paciente + ' (' + U.dataBR(c.data) + ' às ' + c.hora + ')', data: dia, hora: '09:00', telefone: nova.telefone, feito: false, consultaId: nova.id });
    }
    return nova;
  }
  const primeiro = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';
  const modoTxt = (a) => (a.modo === 'Online' ? ' (online)' : a.modo === 'Presencial' ? ' (presencial)' : '');
  const oi = (nome) => 'Olá, ' + primeiro(nome) + '! Aqui é a ' + NUTRI + ', nutricionista. ';
  const msgConfirma = (a) => oi(a.paciente) + 'Sua ' + (a.tipo === 'Retorno' ? 'consulta de retorno' : 'consulta') + ' está marcada para ' + U.dataBR(a.data) + ' às ' + a.hora + modoTxt(a) + '. Posso confirmar sua presença?';
  const msgRecado = (r) => oi(r.nome) + 'Recebi sua mensagem pelo site' + (r.objetivo ? ' sobre ' + r.objetivo.toLowerCase() : '') + ' e quero muito te conhecer. Vamos combinar o melhor horário?';
  const msgSlot = (r, s) => oi(r.nome) + 'Recebi sua mensagem pelo site' + (r.objetivo ? ' sobre ' + r.objetivo.toLowerCase() : '') + '. Tenho horário em ' + U.dataBR(s.data) + ' às ' + s.hora + '. Fica bom para você?';
  const msgRetorno = (a, s) => oi(a.paciente) + 'Já está chegando a hora do seu retorno — ele é parte do processo! ' + (s ? 'Tenho horário em ' + U.dataBR(s.data) + ' às ' + s.hora + '. Fica bom?' : 'Qual dia fica melhor para você?');

  // pacientes atendidas há (retorno − 7) dias ou mais, sem consulta futura marcada
  function retornosPendentes() {
    const hoje = U.hojeISO(), ag = DB.list('agenda');
    const ultimo = {};
    ag.filter((a) => a.status === 'realizada').forEach((a) => {
      const k = U.norm(a.paciente);
      if (!ultimo[k] || a.data > ultimo[k].data) ultimo[k] = a;
    });
    return Object.keys(ultimo).map((k) => ultimo[k]).filter((a) => {
      const k = U.norm(a.paciente);
      const futura = ag.some((b) => U.norm(b.paciente) === k && ativa(b) && b.status !== 'realizada' && b.data >= hoje);
      return !futura && U.difDias(a.data, hoje) >= RETORNO - 7;
    }).sort((a, b) => a.data.localeCompare(b.data));
  }
  const dataRetorno = (a) => { const d = U.somaDias(a.data, RETORNO); return d > U.hojeISO() ? d : U.hojeISO(); };

  window.AG = { AGC, RETORNO, TIPOS, toMin, toHM, dur, cor, grade, ocupado, livres, proximos, criarConsulta, msgConfirma, msgRecado, msgSlot, msgRetorno, retornosPendentes, dataRetorno, primeiro };

  /* ============================================================
     Interface
     ============================================================ */
  const hhmm = (s) => String(s || '').slice(0, 5);
  const agoraISO = () => U.hojeISO() + 'T' + U.agoraHM();
  const dt = (i) => new Date(i + 'T12:00:00');
  const isoDe = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const iniSemana = (i) => U.somaDias(i, -((dt(i).getDay() + 6) % 7));
  function somaMeses(i, n) {
    const d = dt(i), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
    const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(dia, ult)); return isoDe(d);
  }
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ICO = (id) => '<svg aria-hidden="true"><use href="#' + id + '"/></svg>';
  const modoIco = (a) => (a.modo === 'Online' ? '<span class="modo" title="Online">' + ICO('p-video') + '</span>' : a.modo === 'Presencial' ? '<span class="modo" title="Presencial">' + ICO('p-pin') + '</span>' : '');
  const tag = (st) => '<span class="tag ' + esc(st) + '">' + esc(st) + '</span>';

  let dia = U.hojeISO(), visao = 'semana', fModo = '', filtro = 'novo';

  const h = new Date().getHours();
  $('#saudacao').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + NUTRI + '.';
  $('#hojeData').textContent = cap1(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  $$('[data-ia-nome]').forEach((el) => { el.textContent = A; });
  $('#filtroModo').addEventListener('change', (e) => { fModo = e.target.value; agenda(); });

  /* ---------- abas ---------- */
  function aba(nome) {
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === nome)));
    $$('.aba').forEach((s) => { s.hidden = s.id !== 'aba-' + nome; });
    $('.main').scrollTop = 0; window.scrollTo(0, 0);
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => aba(b.dataset.aba)));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-ir]'); if (b) aba(b.dataset.ir); });

  /* ---------- assistente: gaveta no tablet/celular ---------- */
  const app = $('.app');
  function abrirIa() { app.classList.add('ia-aberta'); $('#nIa').hidden = true; setTimeout(() => $('#iaIn').focus({ preventScroll: true }), 250); }
  function fecharIa() { app.classList.remove('ia-aberta'); }
  $('#abrirIa').addEventListener('click', abrirIa);
  $('#iaFab').addEventListener('click', abrirIa);
  $('#fecharIa').addEventListener('click', fecharIa);

  /* ---------- números do dia ---------- */
  function stats() {
    const hoje = U.hojeISO();
    const ag = DB.list('agenda').filter((a) => a.data === hoje && ativa(a));
    const conf = ag.filter((a) => a.status === 'confirmada' || a.status === 'realizada').length;
    const recs = DB.list('recados').filter((r) => r.status === 'novo');
    const lembs = DB.list('lembretes').filter((l) => !l.feito);
    const atras = lembs.filter((l) => l.data + 'T' + l.hora <= agoraISO());
    const ret = retornosPendentes();
    $('#stats').innerHTML =
      '<button type="button" data-ir="agenda"><strong>' + ag.length + '</strong><span>consulta' + (ag.length === 1 ? '' : 's') + ' hoje</span><small>' + conf + ' confirmada' + (conf === 1 ? '' : 's') + '</small></button>' +
      '<button type="button" data-ir="recados"><strong>' + recs.length + '</strong><span>recado' + (recs.length === 1 ? '' : 's') + ' novo' + (recs.length === 1 ? '' : 's') + '</span><small>do site</small></button>' +
      '<button type="button" data-ir="lembretes"><strong>' + lembs.length + '</strong><span>lembrete' + (lembs.length === 1 ? '' : 's') + '</span><small>' + atras.length + ' vencido' + (atras.length === 1 ? '' : 's') + '</small></button>' +
      '<button type="button" data-ia="retornos pendentes"><strong>' + ret.length + '</strong><span>retorno' + (ret.length === 1 ? '' : 's') + ' a agendar</span><small>a cada ' + RETORNO + ' dias</small></button>';
    const nr = $('#nRec'), nb = $('#nLemb');
    nr.hidden = !recs.length; nr.textContent = recs.length;
    nb.hidden = !atras.length; nb.textContent = atras.length;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ia]'); if (!b || !window.PNIA) return;
    abrirIa(); window.PNIA.entrada(b.dataset.ia);
  });

  /* ---------- hoje ---------- */
  function hoje() {
    const d = U.hojeISO(), agora = U.agoraHM();
    const l = DB.list('agenda').filter((a) => a.data === d).sort((a, b) => a.hora.localeCompare(b.hora));
    const prox = l.find((a) => ativa(a) && a.status !== 'realizada' && toMin(a.hora) + dur(a.tipo) > toMin(agora));
    $('#linhaDia').innerHTML = l.length ? l.map((a) => {
      const fim = toHM(toMin(a.hora) + dur(a.tipo));
      const passou = a.status === 'realizada' || a.status === 'cancelada' || a.status === 'faltou';
      return '<li class="ld ' + (passou ? 'feito ' : '') + (prox && prox.id === a.id ? 'agora' : '') + '" style="--c:' + cor(a.tipo) + '">' +
        '<span class="ld__h">' + esc(hhmm(a.hora)) + '<small>' + esc(fim) + '</small></span>' +
        '<div class="ld__card"><div class="ld__t"><strong>' + esc(a.paciente) + '</strong>' + modoIco(a) + tag(a.status) + '</div>' +
        '<small>' + esc(a.tipo) + (a.obs ? ' · ' + esc(a.obs) : '') + '</small>' +
        '<div class="ld__acoes">' +
          (a.telefone && (a.status === 'agendada') ? '<a target="_blank" rel="noopener" href="' + esc(U.wa(a.telefone, msgConfirma(a))) + '">Confirmar no WhatsApp</a>' : '') +
          (a.status === 'agendada' || a.status === 'confirmada' ? '<button type="button" data-ac="realizada" data-id="' + esc(a.id) + '">Atendida</button><button type="button" data-ac="faltou" data-id="' + esc(a.id) + '">Faltou</button>' : '') +
          '<button type="button" data-ac="editar" data-id="' + esc(a.id) + '">Editar</button>' +
        '</div></div></li>';
    }).join('') : '<li class="vazio">Nenhuma consulta hoje. ' + (grade(d).length ? livres(d, TIPOS[0], '').length + ' horários livres.' : 'Dia sem atendimento na grade.') + '</li>';

    const r = DB.list('recados').filter((x) => x.status === 'novo').slice(0, 3);
    $('#recNovos').innerHTML = r.length ? r.map((x) => {
      const sug = proximos(TIPOS[0], '', 2);
      return '<article class="mini-rec"><div><strong>' + esc(x.nome) + '</strong><small>' + esc(x.objetivo || 'Objetivo não informado') + (x.modalidade ? ' · ' + esc(x.modalidade) : '') + '</small></div>' +
        '<div class="sug">' + sug.map((s) => '<button type="button" data-ac="slot" data-id="' + esc(x.id) + '" data-d="' + esc(s.data) + '" data-h="' + esc(s.hora) + '">' + esc(U.dataCurta(s.data)) + ' ' + esc(s.hora) + '</button>').join('') + '</div></article>';
    }).join('') : '<div class="vazio">Nenhum recado novo.</div>';

    const lb = DB.list('lembretes').filter((x) => !x.feito && x.data <= d).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).slice(0, 5);
    $('#lembHoje').innerHTML = lb.length ? lb.map((x) => '<label class="mini-lemb ' + (x.data + 'T' + x.hora <= agoraISO() ? 'atraso' : '') + '"><input type="checkbox" data-ac="feito" data-id="' + esc(x.id) + '"><span>' + esc(x.texto) + '<small>' + esc(x.data === d ? 'hoje' : U.dataCurta(x.data)) + ' · ' + esc(x.hora) + '</small></span></label>').join('') : '<div class="vazio">Nada pendente para hoje.</div>';
  }
  $('#aba-hoje').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ac]'); if (!b || b.dataset.ac === 'slot') return;
    const a = DB.list('agenda').find((x) => x.id === b.dataset.id); if (!a) return;
    if (b.dataset.ac === 'editar') abrirCons(a);
    if (b.dataset.ac === 'realizada' || b.dataset.ac === 'faltou') mudarStatus(a, b.dataset.ac);
  });
  $('#lembHoje').addEventListener('change', (e) => { const c = e.target.closest('[data-ac="feito"]'); if (c) DB.update('lembretes', c.dataset.id, { feito: c.checked }); });

  // depois da consulta, a assistente já oferece o retorno
  function mudarStatus(a, st) {
    DB.update('agenda', a.id, { status: st });
    if (window.PNIA) { if (st === 'realizada') window.PNIA.depoisDaConsulta(a); else window.PNIA.faltou(a); }
    if (st === 'realizada' && !app.classList.contains('ia-aberta') && window.innerWidth < 1200) { $('#nIa').hidden = false; $('#nIa').textContent = '1'; }
  }

  /* ---------- agenda ---------- */
  const doAgenda = () => DB.list('agenda').filter((a) => ativa(a) && (!fModo || a.modo === fModo));
  const chip = (a) => '<span class="chip" role="button" tabindex="0" data-id="' + esc(a.id) + '" style="--c:' + cor(a.tipo) + '" title="' + esc(a.paciente + ' · ' + a.tipo + modoTxt(a)) + '">' + esc(hhmm(a.hora)) + ' ' + esc(primeiro(a.paciente)) + '</span>';
  const NOMES_DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  function visaoSemana() {
    const ini = iniSemana(dia), fim = U.somaDias(ini, 6), hj = U.hojeISO();
    $('#rotulo').textContent = dt(ini).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' – ' + dt(fim).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    const dias = [0, 1, 2, 3, 4, 5, 6].map((i) => U.somaDias(ini, i));
    const todos = doAgenda().filter((a) => a.data >= ini && a.data <= fim);
    let h0 = Math.floor(toMin(AGC.inicio) / 60), h1 = Math.ceil(toMin(AGC.fim) / 60) - 1;
    todos.forEach((a) => { const hh = parseInt(a.hora, 10); if (hh < h0) h0 = hh; if (hh > h1) h1 = hh; });
    let html = '<div class="sem"><div class="sem-cab"></div>' + dias.map((d, i) =>
      '<button type="button" class="sem-cab dia ' + (d === hj ? 'hoje ' : '') + (d === dia ? 'sel' : '') + '" data-d="' + d + '">' + NOMES_DIA[i] + '<strong>' + d.slice(8) + '</strong></button>').join('');
    for (let hh = h0; hh <= h1; hh++) {
      html += '<div class="sem-hora">' + String(hh).padStart(2, '0') + ':00</div>' + dias.map((d) => {
        const fechado = AGC.dias.indexOf(U.diaSemana(d)) < 0 || (AGC.pausa && hh * 60 >= toMin(AGC.pausa[0]) && hh * 60 + 60 <= toMin(AGC.pausa[1]));
        return '<div class="sem-cel ' + (d === dia ? 'sel ' : '') + (fechado ? 'fechado' : '') + '" data-d="' + d + '" data-h="' + hh + '">' +
          todos.filter((a) => a.data === d && parseInt(a.hora, 10) === hh).sort((a, b) => a.hora.localeCompare(b.hora)).map(chip).join('') + '</div>';
      }).join('');
    }
    $('#visao').innerHTML = html + '</div>';
  }
  function visaoMes() {
    const prim = dia.slice(0, 8) + '01', hj = U.hojeISO(), mes = dia.slice(0, 7);
    $('#rotulo').textContent = cap1(dt(prim).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    const ini = iniSemana(prim), todos = doAgenda();
    const ult = new Date(dt(prim).getFullYear(), dt(prim).getMonth() + 1, 0).getDate();
    const semanas = Math.ceil((((dt(prim).getDay() + 6) % 7) + ult) / 7);
    let html = '<div class="mes">' + NOMES_DIA.map((n) => '<div class="mes-cab">' + n + '</div>').join('');
    for (let i = 0; i < semanas * 7; i++) {
      const d = U.somaDias(ini, i), lista = todos.filter((a) => a.data === d).sort((a, b) => a.hora.localeCompare(b.hora));
      html += '<div class="mes-cel ' + (d.slice(0, 7) !== mes ? 'fora ' : '') + (d === hj ? 'hoje ' : '') + (d === dia ? 'sel' : '') + '" data-d="' + d + '"><b>' + Number(d.slice(8)) + '</b>' +
        lista.slice(0, 2).map(chip).join('') + (lista.length > 2 ? '<small>+' + (lista.length - 2) + '</small>' : '') + '</div>';
    }
    $('#visao').innerHTML = html + '</div>';
  }
  function agenda() {
    $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === visao)));
    if (visao === 'semana') visaoSemana(); else visaoMes();
    $('#titDia').textContent = cap1(dt(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
    const lista = DB.list('agenda').filter((a) => a.data === dia && (!fModo || a.modo === fModo)).sort((a, b) => a.hora.localeCompare(b.hora));
    $('#listaAgenda').innerHTML = lista.length ? lista.map((a) =>
      '<article class="item ' + (a.status === 'realizada' || a.status === 'cancelada' ? 'feito' : '') + '" style="--c:' + cor(a.tipo) + '"><div class="hora">' + esc(hhmm(a.hora)) + '<small>' + esc(toHM(toMin(a.hora) + dur(a.tipo))) + '</small></div>' +
      '<div><h4>' + esc(a.paciente) + modoIco(a) + tag(a.status) + '</h4><p>' + esc(a.tipo) + (a.modo ? ' · ' + esc(a.modo) : '') + (a.obs ? ' · ' + esc(a.obs) : '') + '</p></div>' +
      '<div class="acoes">' +
        (a.telefone && a.status === 'agendada' ? '<a target="_blank" rel="noopener" href="' + esc(U.wa(a.telefone, msgConfirma(a))) + '">Confirmar no WhatsApp</a>' : '') +
        (a.status === 'agendada' ? '<button type="button" data-ac="confirmar" data-id="' + esc(a.id) + '">Confirmada</button>' : '') +
        (a.status === 'agendada' || a.status === 'confirmada' ? '<button type="button" data-ac="realizada" data-id="' + esc(a.id) + '">Atendida</button>' : '') +
        '<button type="button" data-ac="editar" data-id="' + esc(a.id) + '">Editar</button><button type="button" data-ac="excluir" data-id="' + esc(a.id) + '">Excluir</button></div></article>').join('')
      : '<div class="vazio">Nenhuma consulta neste dia.' + (grade(dia).length ? ' Livres para primeira consulta: ' + esc(livres(dia, TIPOS[0], '').slice(0, 8).join(', ') || 'nenhum') + '.' : ' Dia sem atendimento na grade.') + '</div>';
  }
  $$('.seg button').forEach((b) => b.addEventListener('click', () => { visao = b.dataset.v; agenda(); }));
  $('#navAnt').onclick = () => { dia = visao === 'semana' ? U.somaDias(dia, -7) : somaMeses(dia, -1); agenda(); };
  $('#navProx').onclick = () => { dia = visao === 'semana' ? U.somaDias(dia, 7) : somaMeses(dia, 1); agenda(); };
  $('#navHoje').onclick = () => { dia = U.hojeISO(); agenda(); };
  $('#visao').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (c) { const a = DB.list('agenda').find((x) => x.id === c.dataset.id); if (a) abrirCons(a); return; }
    const cab = e.target.closest('.sem-cab.dia'); if (cab) { dia = cab.dataset.d; agenda(); return; }
    const cel = e.target.closest('[data-d]'); if (!cel) return;
    dia = cel.dataset.d;
    if (cel.dataset.h && !cel.classList.contains('fechado')) { agenda(); abrirCons({ data: dia, hora: String(cel.dataset.h).padStart(2, '0') + ':00' }); } else agenda();
  });
  $('#visao').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('chip')) { e.preventDefault(); e.target.click(); } });
  $('#listaAgenda').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ac]'); if (!b) return;
    const a = DB.list('agenda').find((x) => x.id === b.dataset.id); if (!a) return;
    if (b.dataset.ac === 'editar') abrirCons(a);
    if (b.dataset.ac === 'confirmar') DB.update('agenda', a.id, { status: 'confirmada' });
    if (b.dataset.ac === 'realizada') mudarStatus(a, 'realizada');
    if (b.dataset.ac === 'excluir' && confirm('Excluir a consulta de ' + a.paciente + '?')) DB.remove('agenda', a.id);
  });

  /* ---------- modal de consulta ---------- */
  const modal = $('#modal'), form = $('#formCons');
  function abrirCons(a) {
    a = a || {};
    form.reset(); $('#erroCons').hidden = true;
    $('#modalTit').textContent = a.id ? 'Editar consulta' : (a.tipo === 'Retorno' ? 'Novo retorno' : 'Nova consulta');
    ['id', 'recadoId', 'paciente', 'telefone', 'data', 'hora', 'tipo', 'modo', 'status', 'obs'].forEach((k) => {
      if (!form.elements[k]) return;
      const padrao = k === 'data' ? dia : k === 'status' ? 'agendada' : k === 'tipo' ? TIPOS[0] : '';
      form.elements[k].value = a[k] != null ? (k === 'telefone' ? U.fone(a[k]) : a[k]) : padrao;
    });
    form.elements.lembrar.checked = !a.id;
    modal.hidden = false;
    (a.paciente ? form.elements.hora : form.elements.paciente).focus();
  }
  $('#novaConsulta').onclick = () => abrirCons();
  $('#cancelaCons').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    if (f.status !== 'cancelada') {
      const conflito = ocupado(f.data, f.hora, f.tipo, f.id);
      if (conflito) {
        const sug = livres(f.data, f.tipo, '').slice(0, 4);
        const er = $('#erroCons');
        er.textContent = 'Conflito: ' + conflito.paciente + ' está às ' + conflito.hora + ' (' + conflito.tipo.toLowerCase() + ', ' + dur(conflito.tipo) + ' min).' + (sug.length ? ' Livres: ' + sug.join(', ') + '.' : '');
        er.hidden = false; return;
      }
    }
    const dados = { paciente: f.paciente.trim(), telefone: U.soDigitos(f.telefone), data: f.data, hora: f.hora, tipo: f.tipo, modo: f.modo, status: f.status, obs: f.obs.trim() };
    if (f.id) DB.update('agenda', f.id, dados);
    else criarConsulta(Object.assign(dados, { recadoId: f.recadoId }), !!f.lembrar);
    dia = f.data; modal.hidden = true; toast('Consulta salva.');
  });

  /* ---------- recados ---------- */
  const ST = { novo: 'Novo', respondido: 'Respondido', agendado: 'Agendado', arquivado: 'Arquivado' };
  const FILTROS = [['novo', 'Novos'], ['respondido', 'Respondidos'], ['agendado', 'Agendados'], ['arquivado', 'Arquivados'], ['todos', 'Todos']];
  function recados() {
    const todos = DB.list('recados');
    $('#filtroRec').innerHTML = FILTROS.map((s) => '<button type="button" data-f="' + s[0] + '" class="' + (filtro === s[0] ? 'sel' : '') + '">' + s[1] + ' <b>' + (s[0] === 'todos' ? todos.length : todos.filter((l) => l.status === s[0]).length) + '</b></button>').join('');
    const l = todos.filter((x) => filtro === 'todos' || x.status === filtro);
    $('#listaRec').innerHTML = l.length ? l.map((x) => {
      const sug = x.status === 'novo' || x.status === 'respondido' ? proximos(TIPOS[0], '', 3) : [];
      return '<article class="recado"><div class="recado__top"><h4>' + esc(x.nome) + '<span class="tag r-' + esc(x.status) + '">' + ST[x.status] + '</span></h4>' +
        '<time>' + esc(new Date(x.criado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })) + '</time></div>' +
        '<dl class="recado__dados">' +
          '<div><dt>Objetivo</dt><dd>' + esc(x.objetivo || '—') + '</dd></div>' +
          '<div><dt>Relação com dietas</dt><dd>' + esc(x.dietas || '—') + '</dd></div>' +
          '<div><dt>Modalidade</dt><dd>' + esc(x.modalidade || 'Não informou') + '</dd></div>' +
          '<div><dt>Contato</dt><dd>' + (x.telefone ? esc(U.fone(x.telefone)) : 'Sem WhatsApp') + ' · ' + esc(x.origem || 'Site') + '</dd></div>' +
        '</dl>' +
        '<blockquote>' + (x.recado ? '“' + esc(x.recado) + '”' : '<em>Não escreveu a história.</em>') + '</blockquote>' +
        (sug.length ? '<div class="sug sug--big"><span>Sugestões da ' + esc(A) + '</span>' + sug.map((s) => '<button type="button" data-ac="slot" data-id="' + esc(x.id) + '" data-d="' + esc(s.data) + '" data-h="' + esc(s.hora) + '">' + esc(U.dataCurta(s.data)) + ' · ' + esc(s.hora) + '</button>').join('') + '</div>' : '') +
        '<div class="acoes">' + (x.telefone ? '<a target="_blank" rel="noopener" data-ac="contatar" data-id="' + esc(x.id) + '" href="' + esc(U.wa(x.telefone, sug[0] ? msgSlot(x, sug[0]) : msgRecado(x))) + '">Responder no WhatsApp</a>' : '') +
        '<button type="button" data-ac="agendar" data-id="' + esc(x.id) + '">Agendar</button>' +
        (x.status === 'novo' ? '<button type="button" data-ac="respondido" data-id="' + esc(x.id) + '">Marcar respondido</button>' : '') +
        '<button type="button" data-ac="arquivar" data-id="' + esc(x.id) + '">Arquivar</button><button type="button" data-ac="excluir" data-id="' + esc(x.id) + '">Excluir</button></div></article>';
    }).join('') : '<div class="vazio">Nenhum recado aqui. Quem preencher o formulário do site aparece nesta lista.</div>';
  }
  $('#filtroRec').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filtro = b.dataset.f; recados(); } });

  function agendarSlot(id, data, hora) {
    const x = DB.list('recados').find((r) => r.id === id); if (!x) return null;
    if (ocupado(data, hora, TIPOS[0])) { toast('Esse horário acabou de ser ocupado. Escolha outro.'); return null; }
    const modo = /online/i.test(x.modalidade || '') ? 'Online' : /presencial/i.test(x.modalidade || '') ? 'Presencial' : '';
    const a = criarConsulta({ paciente: x.nome, telefone: x.telefone, data, hora, tipo: TIPOS[0], modo, obs: x.objetivo ? 'Objetivo: ' + x.objetivo : '', recadoId: x.id }, true);
    toast('Consulta de ' + x.nome + ' marcada para ' + U.dataBR(data) + ' às ' + hora + '.');
    return a;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ac="slot"]'); if (!b) return;
    const a = agendarSlot(b.dataset.id, b.dataset.d, b.dataset.h);
    if (a && window.PNIA) window.PNIA.avisarAgendado(a);
  });
  $('#listaRec').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ac]'); if (!el || el.dataset.ac === 'slot') return;
    const x = DB.list('recados').find((l) => l.id === el.dataset.id); if (!x) return;
    if ((el.dataset.ac === 'contatar' || el.dataset.ac === 'respondido') && x.status === 'novo') DB.update('recados', x.id, { status: 'respondido' });
    if (el.dataset.ac === 'agendar') { aba('agenda'); abrirCons({ paciente: x.nome, telefone: x.telefone, tipo: TIPOS[0], modo: /online/i.test(x.modalidade || '') ? 'Online' : /presencial/i.test(x.modalidade || '') ? 'Presencial' : '', obs: x.objetivo ? 'Objetivo: ' + x.objetivo : '', recadoId: x.id }); }
    if (el.dataset.ac === 'arquivar') DB.update('recados', x.id, { status: 'arquivado' });
    if (el.dataset.ac === 'excluir' && confirm('Excluir o recado de ' + x.nome + '?')) DB.remove('recados', x.id);
  });

  /* ---------- lembretes ---------- */
  function lembretes() {
    const l = DB.list('lembretes').sort((a, b) => (a.feito - b.feito) || (a.data + a.hora).localeCompare(b.data + b.hora));
    const agora = agoraISO();
    $('#listaLemb').innerHTML = l.length ? l.map((x) => {
      const atraso = !x.feito && x.data + 'T' + x.hora <= agora;
      return '<article class="item lemb ' + (x.feito ? 'feito' : atraso ? 'atraso' : '') + '"><input type="checkbox" data-ac="feito" data-id="' + esc(x.id) + '" ' + (x.feito ? 'checked' : '') + ' aria-label="Concluir lembrete">' +
        '<div><h4>' + esc(x.texto) + (atraso ? '<span class="tag faltou">vencido</span>' : '') + '</h4><p>' + esc(U.dataBR(x.data)) + ' às ' + esc(x.hora) + '</p></div>' +
        '<div class="acoes">' + (x.telefone ? '<a target="_blank" rel="noopener" href="' + esc(U.wa(x.telefone)) + '">WhatsApp</a>' : '') + '<button type="button" data-ac="excluir" data-id="' + esc(x.id) + '">Excluir</button></div></article>';
    }).join('') : '<div class="vazio">Nenhum lembrete. Ao marcar uma consulta, a ' + esc(A) + ' cria sozinha o lembrete de confirmação.</div>';
    $('#notifInfo').innerHTML = ('Notification' in window && Notification.permission === 'default')
      ? 'Quer receber avisos com a área aberta? <a href="#" id="pedeNotif">Ativar avisos</a>.' : 'Os lembretes avisam na tela quando vencem, com a área aberta.';
  }
  $('#formLemb').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    DB.add('lembretes', { texto: f.texto.trim(), data: f.data, hora: f.hora, feito: false });
    e.target.reset(); $('#lembData').value = U.hojeISO(); $('#lembHora').value = '09:00';
  });
  $('#listaLemb').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ac]'); if (!el) return;
    if (el.dataset.ac === 'feito') DB.update('lembretes', el.dataset.id, { feito: el.checked });
    if (el.dataset.ac === 'excluir') DB.remove('lembretes', el.dataset.id);
  });
  document.addEventListener('click', (e) => { if (e.target.id === 'pedeNotif') { e.preventDefault(); Notification.requestPermission().then(lembretes); } });
  function verificarVencidos() {
    const agora = agoraISO();
    const novos = DB.list('lembretes').filter((x) => !x.feito && !x.avisado && x.data + 'T' + x.hora <= agora);
    if (!novos.length) return;
    novos.forEach((x) => DB.update('lembretes', x.id, { avisado: true }));
    const texto = novos.length === 1 ? 'Lembrete: ' + novos[0].texto : novos.length + ' lembretes vencidos. Veja em Lembretes.';
    toast(texto, 'lemb');
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Lembrete · Área da nutri', { body: texto });
  }

  /* ---------- avisos e dados ---------- */
  function toast(t, cls) {
    const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = t;
    $('#toasts').appendChild(d); setTimeout(() => d.remove(), 6000);
  }
  const dlg = $('#modalDados');
  $$('[data-dados]').forEach((b) => { b.onclick = () => { dlg.hidden = false; }; });
  $('#fechaDados').onclick = () => { dlg.hidden = true; };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.hidden = true; });
  $('#btnExp').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([DB.exportar()], { type: 'application/json' }));
    a.download = 'backup-area-nutri-' + U.hojeISO() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#fileImp').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { if (confirm('Isso substitui os dados atuais. Continuar?')) { DB.importar(t); toast('Backup restaurado.'); dlg.hidden = true; } })
      .catch(() => toast('Arquivo inválido.'));
    e.target.value = '';
  });
  $('#btnLimpa').onclick = () => { if (confirm('Apagar todas as consultas, recados e lembretes deste navegador?')) { DB.limpar(); dlg.hidden = true; } };

  // dados fictícios para demonstração
  function demo() {
    const hj = U.hojeISO();
    const uteis = []; let d = hj;
    while (uteis.length < 6) { if (AGC.dias.indexOf(U.diaSemana(d)) >= 0) uteis.push(d); d = U.somaDias(d, 1); }
    const passado = (n) => { let x = U.somaDias(hj, -n); while (AGC.dias.indexOf(U.diaSemana(x)) < 0) x = U.somaDias(x, -1); return x; };
    const P1 = 'Primeira consulta', R = 'Retorno';
    // telefones com DDD 00 (inexistente): nenhum botão de WhatsApp abre conversa com número real
    [['Mariana Teles', '00988881111', uteis[0], '08:30', P1, 'Presencial', 'confirmada', 'Objetivo: reeducação alimentar'],
      ['Juliana Prado', '00977772222', uteis[0], '10:00', R, 'Online', 'agendada', ''],
      ['Camila Ribeiro', '00966663333', uteis[0], '14:00', P1, 'Online', 'agendada', 'Objetivo: engravidar / fertilidade'],
      ['Letícia Alves', '00955554444', uteis[0], '16:00', R, 'Presencial', 'confirmada', ''],
      ['Patrícia Gomes', '00944445555', uteis[1], '09:00', P1, 'Presencial', 'agendada', ''],
      ['Beatriz Rocha', '00933336666', uteis[1], '15:30', R, 'Online', 'agendada', ''],
      ['Larissa Mendes', '00922227777', uteis[2], '10:30', P1, 'Online', 'agendada', 'Objetivo: humor e bem-estar'],
      ['Renata Lima', '00911118888', uteis[3], '14:30', R, 'Presencial', 'agendada', ''],
      ['Fernanda Lopes', '00999990000', passado(27), '09:00', P1, 'Presencial', 'realizada', ''],
      ['Aline Duarte', '00912341234', passado(34), '15:00', R, 'Online', 'realizada', ''],
      ['Mariana Teles', '00988881111', passado(40), '11:00', P1, 'Presencial', 'realizada', '']]
      .forEach((a) => DB.add('agenda', { paciente: a[0], telefone: a[1], data: a[2], hora: a[3], tipo: a[4], modo: a[5], status: a[6], obs: a[7] }));
    DB.add('recados', { nome: 'Gabriela Nunes', telefone: '00987654321', objetivo: 'Engravidar / fertilidade', dietas: 'Já fiz várias dietas e não consegui manter', modalidade: 'Online', status: 'novo', origem: 'Formulário do site · WhatsApp', recado: 'Estou tentando engravidar há um ano e queria entender o que posso ajustar na alimentação.' });
    DB.add('recados', { nome: 'Tatiane Freitas', telefone: '00991112222', objetivo: 'Humor e bem-estar', dietas: 'Comecei algumas vezes, mas parei no meio', modalidade: 'Presencial', status: 'novo', origem: 'Formulário do site · WhatsApp', recado: 'Sinto muita oscilação de humor na TPM e belisco o dia todo.' });
    DB.add('recados', { nome: 'Vanessa Costa', telefone: '', objetivo: 'Reeducação alimentar', dietas: 'Nunca fiz acompanhamento nutricional', modalidade: '', status: 'novo', origem: 'Formulário do site · Instagram', recado: '' });
    DB.add('lembretes', { texto: 'Enviar plano alimentar da Mariana Teles', data: hj, hora: '08:00', feito: false });
    DB.add('lembretes', { texto: 'Confirmar consulta de Patrícia Gomes (' + U.dataBR(uteis[1]) + ' às 09:00)', data: uteis[0], hora: '17:00', telefone: '00944445555', feito: false });
  }
  $('#btnDemo').onclick = () => { demo(); dlg.hidden = true; toast('Dados de exemplo carregados.'); };

  function tudo() { stats(); hoje(); agenda(); recados(); lembretes(); }
  window.addEventListener('db:change', tudo);
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(DB.PREFIXO) === 0) { tudo(); window.dispatchEvent(new CustomEvent('db:externo')); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { modal.hidden = true; dlg.hidden = true; fecharIa(); } });
  $('#lembData').value = U.hojeISO();
  try {
    if (!localStorage.getItem(DB.chave('demo_feito')) && !DB.list('agenda').length) {
      localStorage.setItem(DB.chave('demo_feito'), '1');
      demo();
    }
  } catch (e) { /* sem armazenamento */ }
  tudo(); verificarVencidos();
  setInterval(() => { verificarVencidos(); stats(); }, 30000);

  window.PN = { aba, abrirCons, toast, agendarSlot, abrirIa, mudarStatus, render: tudo, ir: (d) => { dia = d; agenda(); } };
})();
