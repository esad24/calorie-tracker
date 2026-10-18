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

