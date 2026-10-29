/* Mini banco de dados no navegador (localStorage): recados, agenda e lembretes.
   Protótipo: os dados ficam só neste navegador. Para produção, trocar por um banco
   real (ex.: Supabase) mantendo esta mesma interface (list/add/update/remove). */
(function () {
  'use strict';
  var mem = {};
  // prefixo de todas as chaves no localStorage (evita colisão com outros sites na mesma origem)
  var PREFIXO = 'nutri_';
  var CHAVE = function (c) { return PREFIXO + c; };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  var COLECOES = ['recados', 'agenda', 'lembretes'];
  var STATUS = {
    recados: ['novo', 'respondido', 'agendado', 'arquivado'],
    agenda: ['agendada', 'confirmada', 'realizada', 'faltou', 'cancelada']
  };
  var TIPOS = ['Primeira consulta', 'Retorno'];
  var MODOS = ['Online', 'Presencial', ''];
  var LONGOS = { recado: 600, obs: 600, texto: 300 };
  var txt = function (v, n) { return String(v == null ? '' : v).slice(0, n || 160); };

  // Tudo o que vem do armazenamento (ou de um backup importado) é tratado como não confiável.
  function limpar(c, x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    var o = {};
    Object.keys(x).slice(0, 30).forEach(function (k) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,29}$/.test(k)) return;
      var v = x[k];
      if (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) o[k] = v;
      else o[k] = txt(v, LONGOS[k] || 160);
    });
    o.id = txt(o.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || uid();
    if (STATUS[c] && STATUS[c].indexOf(o.status) < 0) o.status = STATUS[c][0];
    if (c === 'agenda') {
      if (TIPOS.indexOf(o.tipo) < 0) o.tipo = TIPOS[0];
      if (MODOS.indexOf(o.modo || '') < 0) o.modo = '';
    }
    if (o.data && !/^\d{4}-\d{2}-\d{2}$/.test(o.data)) o.data = '';
    if (o.hora && !/^\d{2}:\d{2}$/.test(o.hora)) o.hora = '';
    return o;
  }
  function read(c) {
    var bruto;
    try { bruto = JSON.parse(localStorage.getItem(CHAVE(c))); } catch (e) { bruto = mem[c]; }
    return (Array.isArray(bruto) ? bruto : []).slice(0, 5000).map(function (x) { return limpar(c, x); }).filter(Boolean);
  }
  function write(c, v) {
    try { localStorage.setItem(CHAVE(c), JSON.stringify(v)); } catch (e) { mem[c] = v; }
    window.dispatchEvent(new CustomEvent('db:change', { detail: c }));
  }

  window.DB = {
    TIPOS: TIPOS,
    PREFIXO: PREFIXO,
    chave: CHAVE,
    list: read,
    add: function (c, item) {
      var novo = Object.assign({ id: uid(), criado: new Date().toISOString() }, item);
      write(c, [novo].concat(read(c)));
      return novo;
    },
    update: function (c, id, patch) {
      write(c, read(c).map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; }));
    },
    remove: function (c, id) { write(c, read(c).filter(function (x) { return x.id !== id; })); },
    exportar: function () {
      var o = {}; COLECOES.forEach(function (c) { o[c] = read(c); });
      return JSON.stringify(o, null, 2);
    },
    importar: function (texto) {
      if (typeof texto !== 'string' || texto.length > 2000000) throw new Error('arquivo grande demais');
      var d = JSON.parse(texto);
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('formato inválido');
      COLECOES.forEach(function (c) {
        if (Array.isArray(d[c])) write(c, d[c].slice(0, 5000).map(function (x) { return limpar(c, x); }).filter(Boolean));
      });
    },
    limpar: function () { COLECOES.forEach(function (c) { write(c, []); }); }
  };

  window.U = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    },
    norm: function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); },
    hojeISO: function () { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
    agoraHM: function () { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
    somaDias: function (iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); },
    difDias: function (a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); },
    diaSemana: function (iso) { return new Date(iso + 'T12:00:00').getDay(); },
    dataBR: function (iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }); },
    dataCurta: function (iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', ''); },
    soDigitos: function (s) { return String(s || '').replace(/\D/g, ''); },
    fone: function (s) {
      var d = String(s || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
      if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
      if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
      return s || '';
    },
    wa: function (tel, msg) {
      var n = String(tel || '').replace(/\D/g, '');
      if (n.length <= 11) n = '55' + n;
      return 'https://wa.me/' + n + (msg ? '?text=' + encodeURIComponent(msg) : '');
    }
  };
})();
