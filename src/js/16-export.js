/* Datenexport */
var dlRef = null;
(async function () {
  try { dlRef = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dlRef = null; }
  if (!dlRef) $('export-group').hidden = true;
})();
function exportStamp() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function sortedDays() {
  return days.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}
function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : '';
  var t = String(v);
  return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function buildCsv() {
  var rows = [];
  sortedDays().forEach(function (d) {
    (d.meals || []).forEach(function (m) {
      var parts = Array.isArray(m.parts) && m.parts.length ? m.parts : [null];
      parts.forEach(function (p) {
        rows.push({ date: d.date, time: m.time || '', meal: mealTitle(m), food: p ? p.name : (m.items || ''), amount: p ? p.amount : '', nums: p || m });
      });
    });
  });
  var keys = [], seen = {};
  rows.forEach(function (r) {
    Object.keys(r.nums).forEach(function (k) {
      if (typeof r.nums[k] === 'number' && !seen[k]) { seen[k] = true; keys.push(k); }
    });
  });
  var first = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'salt'];
  keys.sort(function (a, b) {
    var ia = first.indexOf(a), ib = first.indexOf(b);
    if (ia < 0) ia = 99; if (ib < 0) ib = 99;
    return ia - ib || (a < b ? -1 : 1);
  });
  var lines = [['Datum', 'Uhrzeit', 'Mahlzeit', 'Lebensmittel', 'Menge'].concat(keys).join(';')];
  rows.forEach(function (r) {
    lines.push([r.date, r.time, r.meal, r.food, r.amount].map(csvCell).concat(keys.map(function (k) { return csvCell(r.nums[k]); })).join(';'));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
function buildJson() {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    days: sortedDays(),
    goals: GOALS,
    favorites: FAVS,
    foods: Object.keys(FOODS).map(function (k) { return FOODS[k]; })
  }, null, 2);
}
async function runExport(kind) {
  if (!dlRef) { toast('Export ist in dieser Ansicht nicht verfügbar.'); return; }
  if (status !== 'ready') { toast('Die Daten werden noch geladen. Versuch es gleich nochmal.'); return; }
  if (!days.length) { toast('Noch keine Einträge zum Exportieren.'); return; }
  try {
    var r = await dlRef.save({
      filename: 'kalorien-log-' + exportStamp() + (kind === 'csv' ? '.csv' : '.json'),
      data: kind === 'csv' ? buildCsv() : buildJson()
    });
    if (r && r.status === 'saved') toast('Export gespeichert.');
  } catch (e) {
    var c = e && e.code;
    if (c === 'declined') return;
    if (c === 'rate_limited') { toast('Ein Speichern-Dialog ist schon offen.'); return; }
    toast('Export fehlgeschlagen.');
  }
}
$('export-csv').addEventListener('click', function () { runExport('csv'); });
$('export-json').addEventListener('click', function () { runExport('json'); });
$('close-settings').addEventListener('click', closeSettings);
$('save-goals').addEventListener('click', saveSettings);
