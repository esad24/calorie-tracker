  function mealCard(m, date) {
    var card = el('article', 'meal-card');
    var parts = partsOf(m);
    var editable = parts.length > 0;
    if (!parts.length) {
      var single = { name: String(m.items || '') };
      COLS.forEach(function (c) { single[c.key] = mealValue(m, c.key); });
      parts = [single];
    }
    var head = el('div', 'mc-head');
    var mkey = date + '|' + (m.id || m._i);
    var edit = editable && editKey === mkey;
    var dm = m;
    if (edit) {
      if (!mealDraft || mealDraft.key !== mkey) {
        mealDraft = { key: mkey, date: date, orig: m, newDate: date, time: validTimeOf(m.time), name: mealTitle(m), dirty: false, parts: partsOf(m).map(function (pp) { var c = Object.assign({}, pp); delete c._pi; return c; }) };
      }
      dm = recomputeMeal(m, mealDraft.parts);
      dm.time = mealDraft.time || '–';
      parts = partsOf(dm);
    }
    var pen = iconBtn('pencil', edit ? 'Bearbeiten abbrechen' : 'Mahlzeit bearbeiten', edit ? 'on' : '');
    pen.disabled = !editable;
    pen.addEventListener('click', function () { editKey = edit ? null : mkey; mealDraft = null; render(true); });
    var rm = iconBtn('trash', 'Mahlzeit entfernen', '');
    confirmTap(rm, function () { rm.disabled = true; editKey = null; mealDraft = null; removeMeal(date, m); }, 'Mahlzeit löschen?', 'Alle Lebensmittel dieser Mahlzeit werden entfernt.');
    var fav = isFav(mealKeyOf(m));
    var star = iconBtn('star', fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen', fav ? 'fav-on' : '');
    star.setAttribute('aria-pressed', String(fav));
    star.disabled = !editable;
    star.addEventListener('click', async function () { star.disabled = true; await toggleFavMeal(m); render(true); });
    var plus = null;
    if (edit) {
      plus = iconBtn('plus', 'Lebensmittel ergänzen', '');
      plus.addEventListener('click', function () {
        if (mealDraft && mealDraft.dirty) { toast('Speichere oder verwerfe zuerst deine Änderungen.'); return; }
        addTarget = { date: date, meal: m };
        render(true);
        var ta = $('meal-input');
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ta.focus();
      });
    }
    var mgl = mealValue(dm, 'gl');
    var pill = null;
    if (mgl != null) {
      var mr = rateMeal(mgl);
      pill = el('span', 'rate-pill');
      pill.title = 'Glykämische Last der Mahlzeit (Richtwert)';
      pill.append(el('span', 'rate-dot r-' + mr.k), document.createTextNode('GL ' + fmtN(mgl) + ' · ' + mr.label));
    }
    var left = el('div', 'mc-left');
    if (edit) {
      var safe = String(mkey).replace(/[^a-zA-Z0-9]+/g, '-');
      var di = el('input', 'n-in mc-dt');
      di.type = 'date';
      di.id = 'md-' + safe;
      di.value = mealDraft.newDate;
      di.max = keyOf(new Date());
      di.setAttribute('aria-label', 'Datum der Mahlzeit');
      var ti = el('input', 'n-in mc-dt');
      ti.type = 'time';
      ti.id = 'mt-' + safe;
      ti.value = mealDraft.time;
      ti.setAttribute('aria-label', 'Uhrzeit der Mahlzeit');
      di.addEventListener('change', function () {
        if (!KEY.test(di.value) || di.value > keyOf(new Date())) { toast('Bitte ein gültiges Datum eingeben (nicht in der Zukunft).'); di.value = mealDraft.newDate; return; }
        mealDraft.newDate = di.value;
        mealDraft.dirty = true;
      });
      ti.addEventListener('change', function () { mealDraft.time = ti.value; mealDraft.dirty = true; });
      left.append(di, ti, el('span', 'mc-count', parts.length + ' Lebensmittel'));
    } else {
      left.append(
        el('span', 'mc-name', mealTitle(m)),
        el('span', 'mc-time', String(m.time || '–').slice(0, 5)),
        el('span', 'mc-count', parts.length + ' Lebensmittel')
      );
    }
    if (pill) left.append(pill);
    var acts = el('div', 'mc-actions');
    if (plus) acts.append(plus);
    if (edit) acts.append(rm); else acts.append(star);
    acts.append(pen);
    head.append(left, el('span', 'mc-kcal', fmtN(Number(dm.kcal) || 0) + ' kcal'), acts);
    if (edit) {
      var nm = el('input', 'name-in mc-name-in');
      nm.type = 'text';
      nm.id = 'mn-' + safe;
      nm.maxLength = 60;
      nm.value = mealDraft.name;
      nm.placeholder = fallbackMealName(mealDraft.parts);
      nm.setAttribute('aria-label', 'Name der Mahlzeit');
      doneKey(nm);
      nm.addEventListener('input', function () { mealDraft.name = nm.value; mealDraft.dirty = true; });
      head.append(nm);
    }
    var wrap = el('div', 'tbl-wrap');
    var tbl = el('table', 'ntable');
    var body = document.createElement('tbody');
    var ctx = editable ? { editable: true, date: date, meal: m, edit: edit } : null;
    parts.forEach(function (p) { body.append(foodRow(p, ctx)); });
    if (parts.length > 1) body.append(sumRow('Mahlzeit gesamt', function (key) { return mealValue(dm, key); }));
    tbl.append(colgroup(), thead(), body);
    wrap.append(tbl);
    card.append(head, wrap);
    if (edit) {
      var foot = el('div', 'row mc-foot');
      var sv = el('button', 'btn', 'Speichern');
      sv.type = 'button';
      sv.addEventListener('click', function () { sv.disabled = true; sv.textContent = 'Speichert …'; saveMealEdit(); });
      var cn = el('button', 'btn ghost', 'Abbrechen');
      cn.type = 'button';
      cn.addEventListener('click', function () { editKey = null; mealDraft = null; render(true); });
      foot.append(sv, cn);
      card.append(foot);
    }
    return card;
  }
  function mealCards(day, date) {
    return mealsOf(day).sort(byTime).map(function (m) { return mealCard(m, date); });
  }
  function chips(t) {
    var g = el('div', 'chips');
    NUTS.forEach(function (n) {
      var c = el('div', 'chip');
      var goal = GOALS[n.key] > 0 ? GOALS[n.key] : 0;
      var kg = n.key === 'potassium';
      function showV(v) { return kg ? (v / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + ' g' : fmtNut(n, v) + ' ' + n.unit; }
      c.append(el('span', 'chip-label', n.short || n.label), el('span', 'chip-val', t ? showV(t[n.key]) : '—'));
      if (t && goal) {
        c.append(el('span', 'chip-goal', (n.max ? 'max. ' : 'Ziel ') + showV(goal)));
        var bar = el('div', 'chip-bar');
        var fill = el('div', 'chip-fill');
        fill.style.width = Math.min(100, (t[n.key] / goal) * 100) + '%';
        if (n.max && t[n.key] > goal) fill.classList.add('over');
        bar.append(fill);
        c.append(bar);
      }
      g.append(c);
    });
    return g;
  }

