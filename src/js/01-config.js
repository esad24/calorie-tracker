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
