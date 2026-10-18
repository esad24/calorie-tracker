/* Vergangene Lebensmittel (je 100 g) und Favoriten (Mahlzeiten oder Lebensmittel): Popup mit Mehrfachauswahl.
   "+" legt ein Lebensmittel mit der eingestellten Portion in die Auswahl; beim Schließen erscheint die Auswahl als Vorschau. */
var FAVS = [];
var pickOpen = null; // { mode, rerender }
var PICK_SORT = 'freq';
try {
  var savedSort = localStorage.getItem('calorie-log-pick-sort');
  if (savedSort === 'freq' || savedSort === 'recent') PICK_SORT = savedSort;
} catch (e) {}
function mealKeyOf(m) { return String(m.items || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function mealSnapshot(m) {
  var c = {};
  Object.keys(m).forEach(function (k) { if (k !== 'id' && k !== 'time' && k.charAt(0) !== '_') c[k] = m[k]; });
  return JSON.parse(JSON.stringify(c));
}
function favType(f) { return f.type || (f.meal ? 'meal' : 'food'); }
function foodFavKey(key) { return 'food:' + key; }
function per100Of(p) {
  var g = gramsOf(p);
  if (!(g > 0)) return null;
  var o = {};
  ['kcal'].concat(NUTS.map(function (n) { return n.key; })).forEach(function (k) {
    o[k] = Math.round((Number(p[k]) || 0) * 100 / g * 1000) / 1000;
  });
  return o;
}
function useStamp(d, m) { return d.date + ' ' + (validTimeOf(m.time) || '00:00'); }

/* Alle Lebensmittel aus den Mahlzeiten, mit Häufigkeit und letzter Nutzung; Werte je 100 g (eigene Datenbank zuerst) */
function pastFoods() {
  var map = new Map();
  days.forEach(function (d) {
    mealsOf(d).forEach(function (m) {
      var st = useStamp(d, m);
      partsOf(m).forEach(function (p) {
        var k = foodKey(p.name);
        if (!k) return;
        var e = map.get(k);
        if (!e) { e = { key: k, count: 0, last: '', part: null }; map.set(k, e); }
        e.count++;
        if (st >= e.last && per100Of(p)) { e.last = st; e.part = p; }
        else if (st > e.last) e.last = st;
      });
    });
  });
  Object.keys(FOODS).forEach(function (k) { if (!map.has(k)) map.set(k, { key: k, count: 0, last: '', part: null }); });
  var out = [];
  map.forEach(function (e) {
    var f = FOODS[e.key];
    var p = e.part;
    var per100 = f && f.per100 ? f.per100 : (p ? per100Of(p) : null);
    if (!per100) return;
    out.push({
      key: e.key,
      name: (f && f.name) || (p && p.name) || e.key,
      per100: per100,
      gi: f && f.gi > 0 ? f.gi : (p && p.gi > 0 ? p.gi : null),
      unitG: f && f.unitG > 0 ? f.unitG : (p && p.unitG > 0 ? p.unitG : null),
      unit: p && qtyOf(p).unit === 'ml' ? 'ml' : 'g',
      count: e.count,
      last: e.last
    });
  });
  return out;
}
function pastMealStats() {
  var map = new Map();
  days.forEach(function (d) {
    mealsOf(d).forEach(function (m) {
      var k = mealKeyOf(m);
      if (!k) return;
      var e = map.get(k) || { count: 0, last: '' };
      e.count++;
      var st = useStamp(d, m);
      if (st > e.last) e.last = st;
      map.set(k, e);
    });
  });
  return map;
}
function sortPicks(rows, by) {
  return rows.sort(function (a, b) {
    var byLast = a.last < b.last ? 1 : a.last > b.last ? -1 : 0;
    return by === 'recent' ? byLast || b.count - a.count : b.count - a.count || byLast;
  });
}
function foodPart(f, qty) {
  return partFromFood({ qty: qty, unit: f.unit, name: f.name }, { name: f.name, per100: f.per100, gi: f.gi, unitG: f.unitG });
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
async function toggleFav(k, entry) {
  var was = isFav(k);
  var next = was ? FAVS.filter(function (f) { return f.key !== k; }) : FAVS.concat([entry]);
  if (await saveFavs(next)) {
    toast(was ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.');
    if (pickOpen) pickOpen.rerender();
  }
}
function toggleFavMeal(m) {
  var snap = mealSnapshot(m);
  snap.name = mealTitle(m);
  return toggleFav(mealKeyOf(m), { type: 'meal', key: mealKeyOf(m), meal: snap });
}
function toggleFavFood(f) {
  return toggleFav(foodFavKey(f.key), { type: 'food', key: foodFavKey(f.key), food: { key: f.key, name: f.name, per100: f.per100, gi: f.gi, unitG: f.unitG, unit: f.unit } });
}

/* Auswahl als Vorschau im Feld "Änderung vornehmen"; der Auswahltext geht bei Änderungen als Kontext an Claude */
function openSelection(sel, source) {
  var parts = [];
  sel.forEach(function (s) { s.parts.forEach(function (p) { parts.push(p); }); });
  var ctx = 'Aus ' + source + ' ausgewählt: ' + sel.map(function (s) { return s.label; }).join(', ');
  if (pending) {
    pending.inputs.forEach(function (inp, i) { if (pending.parts[i] && inp) pending.parts[i].kcal = Math.max(0, Math.round(Number(inp.value) || 0)); });
    var all = pending.parts.concat(parts);
    showPreview(all, 'Auswahl ergänzt. Prüfe die Werte.');
    pickContext = (pickContext ? pickContext + '\n' : '') + ctx;
    if (!cleanName(previewName)) suggestMealName(all);
  } else {
    var name = sel.length === 1 && sel[0].name ? sel[0].name : '';
    showPreview(parts, 'Aus ' + source + ' übernommen. Ändere die Mengen hier oder beschreibe unten eine Änderung für Claude.', name);
    pickContext = ctx;
    if (!name) suggestMealName(parts);
  }
  $('preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openPicker(mode) {
  if (pickOpen) return;
  if (busy) { toast('Warte, bis die Schätzung fertig ist.'); return; }
  var isFavMode = mode === 'fav';
  var source = isFavMode ? 'Favoriten' : 'vergangenen Lebensmitteln';
  var sel = [];
  var portions = new Map();
  var typeFilter = 'all';
  var back = el('div', 'modal-back');
  var m = el('div', 'modal pick-modal');
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-labelledby', 'pick-title');
  var head = el('div', 'pick-head');
  var h = el('h3', null, isFavMode ? '★ Favoriten' : '↺ Vergangene Lebensmittel');
  h.id = 'pick-title';
  var x = el('button', 'pick-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Schließen');
  head.append(h, x);
  var forDay = el('p', 'pick-for', 'Für: ' + dayLabel(viewKey || keyOf(new Date())) + '. Werte je 100 g; Portion einstellen und mit + auswählen.');
  var tools = el('div', 'pick-tools');
  var search = el('input', 'pick-search');
  search.type = 'search';
  search.placeholder = 'Suchen…';
  search.setAttribute('aria-label', 'Durchsuchen');
  var sortSel = el('select', 'u-sel');
  sortSel.setAttribute('aria-label', 'Sortierung');
  [['freq', 'Am häufigsten'], ['recent', 'Zuletzt verwendet']].forEach(function (o) {
    var op = document.createElement('option');
    op.value = o[0];
    op.textContent = o[1];
    sortSel.append(op);
  });
  sortSel.value = PICK_SORT;
  tools.append(search, sortSel);
  if (isFavMode) {
    var seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Art');
    [['all', 'Alle'], ['meal', 'Mahlzeiten'], ['food', 'Lebensmittel']].forEach(function (o) {
      var b = el('button', null, o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o[0] === typeFilter));
      b.addEventListener('click', function () {
        typeFilter = o[0];
        seg.querySelectorAll('button').forEach(function (bb) { bb.setAttribute('aria-pressed', String(bb === b)); });
        rerender();
      });
      seg.append(b);
    });
    tools.append(seg);
  }
  var list = el('div', 'pick-list');
  var foot = el('div', 'pick-foot');
  var sum = el('span', 'pick-sum');
  var clear = el('button', 'btn ghost', 'Leeren');
  clear.type = 'button';
  var done = el('button', 'btn', 'Fertig');
  done.type = 'button';
  foot.append(sum, clear, done);
  m.append(head, forDay, tools, list, foot);
  back.append(m);
  document.body.append(back);
  document.body.style.overflow = 'hidden';

  function updateFoot() {
    var kc = sel.reduce(function (s, it) { return s + it.parts.reduce(function (a, p) { return a + (Number(p.kcal) || 0); }, 0); }, 0);
    sum.textContent = sel.length ? sel.length + ' ausgewählt · ' + fmtN(kc) + ' kcal' : 'Nichts ausgewählt';
    clear.hidden = !sel.length;
    done.textContent = sel.length ? 'Übernehmen' : 'Schließen';
  }
  function flash(btn) { btn.textContent = '✓'; setTimeout(function () { btn.textContent = '+'; }, 900); }
  function starBtn(fav, onClick) {
    var star = el('button', 'pick-btn star' + (fav ? ' on' : ''), fav ? '★' : '☆');
    star.type = 'button';
    star.setAttribute('aria-label', fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
    star.setAttribute('aria-pressed', String(fav));
    star.addEventListener('click', async function () { star.disabled = true; await onClick(); star.disabled = false; });
    return star;
  }
  function foodRowEl(f, count) {
    var row = el('div', 'pick-row food');
    var txt = el('div', 'pick-txt');
    var p = f.per100;
    txt.append(
      el('span', 'pick-name', f.name),
      el('span', 'pick-meta', '100 ' + f.unit + ': ' + fmtN(Number(p.kcal) || 0) + ' kcal · P ' + fmtD(Number(p.protein) || 0) + ' · KH ' + fmtD(Number(p.carbs) || 0) + ' · F ' + fmtD(Number(p.fat) || 0) + (count ? ' · ' + count + '×' : ''))
    );
    var por = el('label', 'pick-por');
    var qi = el('input', 'q-in');
    qi.type = 'number';
    qi.min = '0';
    qi.step = 'any';
    qi.inputMode = 'decimal';
    qi.value = String(portions.get(f.key) || 100);
    qi.setAttribute('aria-label', 'Portion für ' + f.name + ' in ' + f.unit);
    doneKey(qi);
    var kc = el('span');
    function qty() { return Number(String(qi.value).replace(',', '.')); }
    function showKcal() { var q = qty(); kc.textContent = f.unit + (q > 0 ? ' = ' + fmtN((Number(p.kcal) || 0) * q / 100) + ' kcal' : ''); }
    qi.addEventListener('input', function () { if (qty() > 0) portions.set(f.key, qty()); showKcal(); });
    showKcal();
    por.append(qi, kc);
    var add = el('button', 'pick-btn add', '+');
    add.type = 'button';
    add.setAttribute('aria-label', 'Auswählen: ' + f.name);
    add.addEventListener('click', function () {
      var q = qty();
      if (!(q > 0) || q > 100000) { toast('Bitte eine Portion größer als 0 eingeben.'); return; }
      /* dasselbe Lebensmittel mehrmals: Portionen zusammenzählen */
      var prev = sel.find(function (s) { return s.foodKey === f.key; });
      var part = foodPart(f, round2(q + (prev ? prev.qty : 0)));
      if (!part) return;
      if (prev) { prev.qty = part.qty; prev.parts = [part]; prev.label = partText(part); }
      else sel.push({ foodKey: f.key, qty: part.qty, label: partText(part), parts: [part] });
      flash(add);
      updateFoot();
    });
    row.append(txt, por, starBtn(isFav(foodFavKey(f.key)), function () { return toggleFavFood(f); }), add);
    return row;
  }
  function mealRowEl(fm, count) {
    var meal = fm.meal;
    var row = el('div', 'pick-row');
    var txt = el('div', 'pick-txt');
    txt.append(
      el('span', 'pick-name', mealTitle(meal)),
      el('span', 'pick-meta', fmtN(Number(meal.kcal) || 0) + ' kcal' + (count ? ' · ' + count + '×' : '') + ' · ' + String(meal.items || '').slice(0, 80))
    );
    var add = el('button', 'pick-btn add', '+');
    add.type = 'button';
    add.setAttribute('aria-label', 'Auswählen: ' + mealTitle(meal));
    add.addEventListener('click', function () {
      var parts = partsOf(meal).map(function (pp) { var c = Object.assign({}, pp, { fromDb: true }); delete c._pi; return c; });
      if (!parts.length) { toast('Diese Mahlzeit hat keine einzelnen Lebensmittel.'); return; }
      sel.push({ label: mealTitle(meal), name: mealTitle(meal), parts: parts });
      flash(add);
      updateFoot();
    });
    row.append(txt, starBtn(true, function () { return toggleFav(fm.key); }), add);
    return row;
  }
  function rerender() {
    var q = search.value.toLowerCase().trim();
    list.replaceChildren();
    if (status !== 'ready') { list.append(el('p', 'note', 'Lade dein Protokoll…')); return; }
    var foods = pastFoods();
    var rows;
    if (isFavMode) {
      var byKey = new Map(foods.map(function (f) { return [f.key, f]; }));
      var mstats = pastMealStats();
      rows = FAVS.filter(function (f) { return typeFilter === 'all' || favType(f) === typeFilter; }).map(function (f) {
        if (favType(f) === 'meal') {
          var st = mstats.get(f.key) || { count: 0, last: '' };
          return { kind: 'meal', fav: f, text: (mealTitle(f.meal) + ' ' + (f.meal.items || '')).toLowerCase(), count: st.count, last: st.last };
        }
        var live = byKey.get(f.food.key);
        var food = live || Object.assign({ unit: 'g' }, f.food);
        return { kind: 'food', food: food, text: food.name.toLowerCase(), count: live ? live.count : 0, last: live ? live.last : '' };
      });
    } else {
      rows = foods.map(function (f) { return { kind: 'food', food: f, text: f.name.toLowerCase(), count: f.count, last: f.last }; });
    }
    if (q) rows = rows.filter(function (r) { return r.text.indexOf(q) >= 0; });
    sortPicks(rows, PICK_SORT);
    if (!rows.length) {
      list.append(el('p', 'note', q ? 'Nichts gefunden.' :
        isFavMode ? 'Noch keine Favoriten. Markiere Mahlzeiten mit dem Stern an der Mahlzeit oder Lebensmittel unter „Vergangene“ mit ☆.' : 'Noch keine Lebensmittel eingetragen.'));
      return;
    }
    rows.slice(0, 150).forEach(function (r) {
      list.append(r.kind === 'meal' ? mealRowEl(r.fav, r.count) : foodRowEl(r.food, r.count));
    });
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    document.removeEventListener('keydown', onKey);
    back.remove();
    document.body.style.overflow = '';
    pickOpen = null;
    if (sel.length) openSelection(sel, source);
    else $(isFavMode ? 'open-favs' : 'open-recent').focus();
  }
  x.addEventListener('click', close);
  done.addEventListener('click', close);
  clear.addEventListener('click', function () { sel = []; updateFoot(); });
  back.addEventListener('click', function (e) { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  search.addEventListener('input', rerender);
  sortSel.addEventListener('change', function () {
    PICK_SORT = sortSel.value;
    try { localStorage.setItem('calorie-log-pick-sort', PICK_SORT); } catch (e) {}
    rerender();
  });
  pickOpen = { mode: mode, rerender: rerender };
  updateFoot();
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
