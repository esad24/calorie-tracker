/* Vergangene Mahlzeiten (nach Häufigkeit) und Favoriten: Popup, "+" fügt eine Kopie zum angezeigten Tag hinzu */
var FAVS = [];
var pickOpen = null; // { mode, rerender }
function mealKeyOf(m) { return String(m.items || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function mealSnapshot(m) {
  var c = {};
  Object.keys(m).forEach(function (k) { if (k !== 'id' && k !== 'time' && k.charAt(0) !== '_') c[k] = m[k]; });
  return JSON.parse(JSON.stringify(c));
}
function pastMeals() {
  var map = new Map();
  days.forEach(function (d) {
    mealsOf(d).forEach(function (m) {
      var k = mealKeyOf(m);
      if (!k) return;
      var e = map.get(k);
      if (!e) { e = { key: k, count: 0, last: '', meal: m }; map.set(k, e); }
      e.count++;
      if (d.date >= e.last) { e.last = d.date; e.meal = m; }
    });
  });
  return Array.from(map.values()).sort(function (a, b) {
    return b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0);
  });
}
function isFav(k) { return FAVS.some(function (f) { return f.key === k; }); }
async function saveFavs(next) {
  if (!dbRef) { toast('Speichern ist in dieser Ansicht nicht verfügbar.'); return false; }
  try {
    await dbTask(function () { return dbRef.doc('settings/favorites').set({ list: next }); });
    FAVS = next;
    return true;
  } catch (e) {
    toast('Favoriten konnten nicht gespeichert werden.');
    return false;
  }
}
async function toggleFav(m) {
  var k = mealKeyOf(m);
  var next = isFav(k)
    ? FAVS.filter(function (f) { return f.key !== k; })
    : FAVS.concat([{ key: k, meal: mealSnapshot(m) }]);
  if (await saveFavs(next)) {
    toast(isFav(k) ? 'Zu Favoriten hinzugefügt.' : 'Aus Favoriten entfernt.');
    if (pickOpen) pickOpen.rerender();
  }
}
async function addCopyToDay(m) {
  if (!dbRef) { toast('Speichern ist in dieser Ansicht nicht verfügbar.'); return false; }
  var now = new Date();
  var date = viewKey || keyOf(now);
  var meal = mealSnapshot(m);
  meal.id = newId();
  meal.time = date === keyOf(now) ? pad(now.getHours()) + ':' + pad(now.getMinutes()) : '–';
  try {
    await dbTask(async function () {
      var ref = dbRef.doc('days/' + date);
      var snap = await ref.get();
      var cur = snap.exists ? snap.data() : null;
      if (cur && Array.isArray(cur.meals)) await ref.update({ meals: cur.meals.concat([meal]) });
      else if (cur) await ref.update({ meals: [meal] });
      else await ref.set({ date: date, meals: [meal] });
    });
    toast('Hinzugefügt: ' + fmtN(Number(meal.kcal) || 0) + ' kcal für ' + dayLabel(date) + '.');
    return true;
  } catch (e) {
    toast('Das Hinzufügen ist fehlgeschlagen.');
    return false;
  }
}
function openPicker(mode) {
  if (pickOpen) return;
  var back = el('div', 'modal-back');
  var m = el('div', 'modal pick-modal');
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-labelledby', 'pick-title');
  var head = el('div', 'pick-head');
  var h = el('h3', null, mode === 'fav' ? '★ Favoriten' : '↺ Vergangene Mahlzeiten');
  h.id = 'pick-title';
  var x = el('button', 'pick-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Schließen');
  head.append(h, x);
  var forDay = el('p', 'pick-for', 'Wird hinzugefügt zu: ' + dayLabel(viewKey || keyOf(new Date())));
  var search = el('input', 'pick-search');
  search.type = 'search';
  search.placeholder = 'Suchen…';
  search.setAttribute('aria-label', 'Mahlzeiten durchsuchen');
  var list = el('div', 'pick-list');
  m.append(head, forDay, search, list);
  back.append(m);
  document.body.append(back);
  document.body.style.overflow = 'hidden';

  function rerender() {
    var q = search.value.toLowerCase().trim();
    var counts = new Map();
    var past = pastMeals();
    past.forEach(function (e) { counts.set(e.key, e.count); });
    var rows = mode === 'fav'
      ? FAVS.map(function (f) { return { key: f.key, meal: f.meal, count: counts.get(f.key) || 0 }; })
          .sort(function (a, b) { return b.count - a.count; })
      : past;
    if (q) rows = rows.filter(function (r) { return r.key.indexOf(q) >= 0; });
    list.replaceChildren();
    if (status !== 'ready') { list.append(el('p', 'note', 'Lade dein Protokoll…')); return; }
    if (!rows.length) {
      list.append(el('p', 'note', q ? 'Nichts gefunden.' :
        mode === 'fav' ? 'Noch keine Favoriten. Markiere Mahlzeiten unter „Vergangene“ mit ☆.' : 'Noch keine Mahlzeiten eingetragen.'));
      return;
    }
    rows.slice(0, 100).forEach(function (r) {
      var row = el('div', 'pick-row');
      var txt = el('div', 'pick-txt');
      txt.append(
        el('span', 'pick-name', r.meal.items || '—'),
        el('span', 'pick-meta', fmtN(Number(r.meal.kcal) || 0) + ' kcal' + (r.count ? ' · ' + r.count + '×' : ''))
      );
      var fav = isFav(r.key);
      var star = el('button', 'pick-btn star' + (fav ? ' on' : ''), fav ? '★' : '☆');
      star.type = 'button';
      star.setAttribute('aria-label', fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
      star.setAttribute('aria-pressed', String(fav));
      star.addEventListener('click', async function () { star.disabled = true; await toggleFav(r.meal); star.disabled = false; });
      var add = el('button', 'pick-btn add', '+');
      add.type = 'button';
      add.setAttribute('aria-label', 'Zum Tag hinzufügen: ' + (r.meal.items || ''));
      add.addEventListener('click', async function () {
        add.disabled = true;
        var ok = await addCopyToDay(r.meal);
        add.disabled = false;
        if (ok) { add.textContent = '✓'; setTimeout(function () { add.textContent = '+'; }, 1200); }
      });
      row.append(txt, star, add);
      list.append(row);
    });
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    document.removeEventListener('keydown', onKey);
    back.remove();
    document.body.style.overflow = '';
    pickOpen = null;
    $(mode === 'fav' ? 'open-favs' : 'open-recent').focus();
  }
  x.addEventListener('click', close);
  back.addEventListener('click', function (e) { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  search.addEventListener('input', rerender);
  pickOpen = { mode: mode, rerender: rerender };
  rerender();
  x.focus();
}
$('open-recent').addEventListener('click', function () { openPicker('recent'); });
$('open-favs').addEventListener('click', function () { openPicker('fav'); });
try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
    if (THEME === 'system') applyTheme();
  });
} catch (e) {}

$('estimate').addEventListener('click', estimate);
$('meal-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) estimate();
});
