  function openPicker(mode) {
    if (pickOpen) return;
    if (busy) { toast('Warte, bis die Schätzung fertig ist.'); return; }
    var isFavMode = mode === 'fav';
    var source = isFavMode ? 'Favoriten' : 'vergangenen Lebensmitteln';
    var sel = [];
    var portions = new Map();
    var typeFilter = 'all';
    /* Every way of closing (Fertig, pull down, scrim, Escape) keeps the selection, as before */
    var sheet = makeSheet({
      title: isFavMode ? 'Favoriten' : 'Vergangene Lebensmittel', done: 'Fertig', cls: 'pick-sheet',
      onDismiss: function () {
        pickOpen = null;
        if (sel.length) openSelection(sel, source);
      }
    });
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
      var seg = el('div', 'ios-seg');
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
    var done = sheet.doneBtn;
    foot.append(sum, clear);
    sheet.body.append(forDay, tools, list);
    sheet.addFoot().append(foot);

    function updateFoot() {
      var kc = sel.reduce(function (s, it) { return s + it.parts.reduce(function (a, p) { return a + (Number(p.kcal) || 0); }, 0); }, 0);
      sum.textContent = sel.length ? sel.length + ' ausgewählt · ' + fmtN(kc) + ' kcal' : 'Nichts ausgewählt';
      clear.hidden = !sel.length;
      done.textContent = sel.length ? 'Übernehmen' : 'Fertig';
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
    clear.addEventListener('click', function () { sel = []; updateFoot(); });
    search.addEventListener('input', rerender);
    sortSel.addEventListener('change', function () {
      PICK_SORT = sortSel.value;
      try { localStorage.setItem('calorie-log-pick-sort', PICK_SORT); } catch (e) {}
      rerender();
    });
    pickOpen = { mode: mode, rerender: rerender };
    updateFoot();
    rerender();
    sheet.open();
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

