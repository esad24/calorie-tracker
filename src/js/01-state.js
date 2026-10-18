  var TARGET = 2100; // Tagesbedarf in kcal, vom Nutzer festgelegt
  var LOCALE = 'de-DE';
  var NS = 'http://www.w3.org/2000/svg';
  var KEY = /^\d{4}-\d{2}-\d{2}$/;
  var UNITS = ['g', 'ml', 'Stück', 'Portion'];
  var NUTS = [
    { key: 'protein', label: 'Protein', unit: 'g', dec: 1 },
    { key: 'carbs', label: 'Kohlenhydrate', short: 'Kohlenh.', unit: 'g', dec: 1 },
    { key: 'fat', label: 'Fett', unit: 'g', dec: 1 },
    { key: 'sugar', label: 'Zucker', unit: 'g', dec: 1, max: true },
    { key: 'salt', label: 'Salz', unit: 'g', dec: 1, max: true },
    { key: 'potassium', label: 'Kalium', unit: 'mg', dec: 0 }
  ];
  var COLS = [
    { key: 'kcal', label: 'kcal', unit: '', w: 68, dec: 0 },
    { key: 'protein', label: 'Protein', unit: 'g', w: 74, dec: 1 },
    { key: 'carbs', label: 'Kohlenh.', unit: 'g', w: 80, dec: 1 },
    { key: 'fat', label: 'Fett', unit: 'g', w: 68, dec: 1 },
    { key: 'sugar', label: 'Zucker', unit: 'g', w: 74, dec: 1 },
    { key: 'salt', label: 'Salz', unit: 'g', w: 68, dec: 1 },
    { key: 'potassium', label: 'Kalium', unit: 'mg', w: 78, dec: 0 },
    { key: 'gi', label: 'GI', unit: '', w: 62, dec: 0, calc: true },
    { key: 'gl', label: 'GL', unit: 'Portion', w: 62, dec: 0, calc: true },
    { key: 'nak', label: 'Na:K', unit: 'mg', w: 86, dec: 1, calc: true }
  ];
  var NAME_W = 150, QTY_W = 72, UNIT_W = 96, ACT_W = 48;
  var ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/></svg>'
  };
  var editKey = null;
  var addTarget = null;
  var days = [];
  var status = 'loading';
  var selectedKey = null;
  var dbRef = null;
  var sampleRef = null;
  var mcpRef = null;
  var capsReady = false;
  var busy = false;
  var editBusy = false;
  /* Alle Schreibvorgänge laufen nacheinander (nie zwei gleichzeitig) und brechen nach 20 s ab,
     damit nichts hängen bleibt und keine Änderung eine andere überschreibt. */
  var writeChain = Promise.resolve();
  function withTimeout(pr, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
      pr.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function dbTask(fn) {
    var run = writeChain.then(function () { return withTimeout(Promise.resolve().then(fn), 20000); });
    writeChain = run.catch(function () {});
    return run;
  }
  var mealDraft = null, cafDraft = null, renderForce = false;
  function editDate() { return editKey ? String(editKey).split('|')[0] : null; }
  function lockMeals(inHistory) {
    if (renderForce || editKey === null) return false;
    return inHistory ? editDate() !== viewKey : editDate() === viewKey;
  }
  var openDays = new Set();
  function lockCaf(date) { return !renderForce && cafEditKey === date; }
  var pending = null;
  var toastTimer = null;
  var viewKey = null;
  var following = true;
  var GOALS = {};
  var FOODS = {};
  var BLS = null, BLSMap = {}, BLSWords = {};
  var THEME = 'dark';
  try {
    var savedTheme = localStorage.getItem('calorie-log-theme');
    if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') THEME = savedTheme;
  } catch (e) {}
  applyTheme();

  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
  function dayDiff(a, b) { return Math.round((parseKey(a) - parseKey(b)) / 86400000); }
  function fmtN(n) { return Math.round(n).toLocaleString(LOCALE); }
  function fmtD(n) { return n.toLocaleString(LOCALE, { maximumFractionDigits: 1 }); }
  function fmtNut(n, v) { return n.dec === 0 ? fmtN(v) : fmtD(v); }
  function fmtCol(c, v) { return c.key === 'nak' ? fmtNaK(v) : c.dec === 0 ? fmtN(v) : fmtD(v); }
  // Na:K als „1 : x“ – x = Kalium(mg) / Natrium(mg), Natrium = Salz(g) × 400
  function nakOf(salt, k) {
    var na = (Number(salt) || 0) * 400, kk = Number(k) || 0;
    if (salt == null || k == null || !(na > 0) || !(kk > 0)) return null;
    return kk / na;
  }
  function fmtNaK(x) { return '1 : ' + (x >= 10 ? fmtN(x) : x.toFixed(1).replace('.', ',')); }
  var NAK = { good: 2, mid: 1 };
  function rateNaK(x) { return x >= NAK.good ? { k: 'low', label: 'gut' } : x >= NAK.mid ? { k: 'mid', label: 'mittel' } : { k: 'high', label: 'ungünstig' }; }
  function cellVal(c, v) { return v == null || isNaN(Number(v)) ? '–' : fmtCol(c, Number(v)); }
  function fmtQty(q) { return q.toLocaleString(LOCALE, { maximumFractionDigits: 2 }); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function fmtDate(k, opts) { return parseKey(k).toLocaleDateString(LOCALE, opts); }
  function relLabel(k, today) {
    var n = dayDiff(today, k);
    return n <= 0 ? 'Heute' : n === 1 ? 'Gestern' : n === 2 ? 'Vorgestern' : 'Vor ' + n + ' Tagen';
  }
  function dayLabel(k) {
    return relLabel(k, keyOf(new Date())) + ', ' + fmtDate(k, { day: 'numeric', month: 'short' });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function toast(text, sticky) {
    var t = $('toast');
    clearTimeout(toastTimer);
    if (!text) { t.hidden = true; return; }
    t.textContent = text;
    t.hidden = false;
    if (!sticky) toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }
  function num(v, dec) {
    var n = Math.max(0, Number(v) || 0);
    var f = Math.pow(10, dec);
    return Math.round(n * f) / f;
  }

