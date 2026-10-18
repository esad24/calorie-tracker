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
