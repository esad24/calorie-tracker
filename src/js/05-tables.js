/* Tabellen */
function colgroup() {
  var cg = document.createElement('colgroup');
  [NAME_W, QTY_W, UNIT_W].concat(COLS.map(function (c) { return c.w; })).concat([ACT_W]).forEach(function (w) {
    var x = document.createElement('col');
    x.style.width = w + 'px';
    cg.append(x);
  });
  return cg;
}
function thead() {
  var head = document.createElement('thead');
  var tr = document.createElement('tr');
  var th = el('th', 'c-name', 'Lebensmittel');
  th.scope = 'col';
  var q = el('th', 'num', 'Menge');
  q.scope = 'col';
  var u = el('th', 'unit-h', 'Einheit');
  u.scope = 'col';
  tr.append(th, q, u);
  COLS.forEach(function (c) {
    var h = el('th', 'num');
    h.scope = 'col';
    h.append(document.createTextNode(c.label));
    if (c.unit) h.append(el('small', null, c.unit));
    tr.append(h);
  });
  var ha = el('th', 'num');
  ha.scope = 'col';
  ha.setAttribute('aria-label', 'Aktionen');
  tr.append(ha);
  head.append(tr);
  return head;
}
function nameCell(name, estimate) {
  var th = el('th', 'c-name');
  th.scope = 'row';
  th.append(document.createTextNode(name));
  if (estimate) th.append(document.createTextNode(' '), el('span', 'est', '(Schätzung)'));
  return th;
}
function unitOptions(cur) {
  return UNITS.indexOf(cur) >= 0 ? UNITS : UNITS.concat([cur]);
}
function qtyCells(tr, p, ctx) {
  var o = qtyOf(p);
  var tdq = el('td', 'qty');
  var tdu = el('td', 'unit');
  if (ctx && ctx.edit && o.qty > 0) {
    var base = ctx.date + '-' + ctx.meal._i + '-' + p._pi;
    var inp = el('input', 'q-in');
    inp.type = 'number';
    inp.step = 'any';
    inp.min = '0';
    inp.inputMode = 'decimal';
    inp.id = 'q-' + base;
    doneKey(inp);
    inp.value = String(round2(o.qty));
    inp.setAttribute('aria-label', 'Menge für ' + p.name);
    inp.addEventListener('change', function () { commitQty(ctx.date, ctx.meal, p, o, inp.value); });
    tdq.append(inp);
    var sel = el('select', 'u-sel');
    sel.id = 'u-' + base;
    sel.setAttribute('aria-label', 'Einheit für ' + p.name);
    unitOptions(o.unit).forEach(function (u) {
      var op = document.createElement('option');
      op.value = u;
      op.textContent = u;
      if (u === o.unit) op.selected = true;
      sel.append(op);
    });
    sel.addEventListener('change', function () { commitUnit(ctx.date, ctx.meal, p, o, sel.value); });
    tdu.append(sel);
  } else {
    tdq.textContent = o.qty > 0 ? fmtQty(o.qty) : '–';
    tdu.textContent = o.qty > 0 ? o.unit : '';
  }
  tr.append(tdq, tdu);
}
function foodRow(p, ctx) {
  var tr = document.createElement('tr');
  tr.append(nameCell(String(p.name || p.items || ''), false));
  qtyCells(tr, p, ctx);
  COLS.forEach(function (c) { tr.append(ctx && ctx.edit ? editCell(c, p, ctx) : numCell(c, p)); });
  var ta = el('td', 'act');
  if (ctx && ctx.edit) {
    var del = iconBtn('trash', 'Lebensmittel entfernen', 'row-del');
    confirmTap(del, function () { applyEdit(ctx.date, ctx.meal, p, function () { return { remove: true }; }); }, 'Lebensmittel löschen?', String(p.name || ''));
    ta.append(del);
  }
  tr.append(ta);
  return tr;
}
function iconBtn(name, label, cls) {
  var b = el('button', 'icon-btn' + (cls ? ' ' + cls : ''));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = ICONS[name];
  return b;
}
/* Mülltonne: Popup mit Abbrechen | Löschen */
function askConfirm(title, text) {
  return new Promise(function (resolve) {
    var back = el('div', 'modal-back');
    var m = el('div', 'modal');
    m.setAttribute('role', 'alertdialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', title);
    m.append(el('h3', null, title));
    if (text) m.append(el('p', 'note', text));
    var row = el('div', 'ask-row');
    var cancel = el('button', 'btn ghost', 'Abbrechen');
    cancel.type = 'button';
    var ok = el('button', 'btn danger', 'Löschen');
    ok.type = 'button';
    cancel.style.flex = '1';
    ok.style.flex = '1';
    function onKey(e) { if (e.key === 'Escape') close(false); }
    function close(v) { document.removeEventListener('keydown', onKey); back.remove(); resolve(v); }
    cancel.addEventListener('click', function () { close(false); });
    ok.addEventListener('click', function () { close(true); });
    back.addEventListener('click', function (e) { if (e.target === back) close(false); });
    document.addEventListener('keydown', onKey);
    row.append(cancel, ok);
    m.append(row);
    back.append(m);
    document.body.append(back);
    cancel.focus();
  });
}
function confirmTap(btn, action, title, text) {
  btn.addEventListener('click', async function () {
    if (await askConfirm(title || 'Wirklich löschen?', text)) action();
  });
}
function editCell(c, p, ctx) {
  if (c.calc && c.key !== 'gi') return numCell(c, p);
  var td = el('td', 'num');
  var inp = el('input', 'n-in');
  inp.type = 'number';
  inp.step = 'any';
  inp.min = '0';
  inp.inputMode = 'decimal';
  inp.id = 'e-' + ctx.date + '-' + ctx.meal._i + '-' + p._pi + '-' + c.key;
  doneKey(inp);
  inp.value = String(c.key === 'gi' ? (Number(p.gi) > 0 ? p.gi : '') : (p[c.key] != null ? p[c.key] : ''));
  inp.setAttribute('aria-label', c.label + ' für ' + p.name);
  inp.addEventListener('change', function () {
    var raw = String(inp.value).replace(',', '.').trim();
    var v = raw === '' ? 0 : Number(raw);
    if (isNaN(v) || v < 0 || v > 100000) { toast('Bitte eine Zahl größer oder gleich 0 eingeben.'); render(true); return; }
    applyEdit(ctx.date, ctx.meal, p, function (sp) {
      var np = Object.assign({}, sp);
      if (c.key === 'gi') { if (v > 0) np.gi = Math.min(150, Math.round(v)); else delete np.gi; }
      else np[c.key] = c.key === 'kcal' ? Math.round(v) : num(v, c.dec);
      return { part: np, msg: 'Gespeichert.' };
    });
  });
  td.append(inp);
  return td;
}
function numCell(c, p) {
  var v = partVal(c.key, p);
  var td = el('td', 'num');
  if (c.key === 'gl' && v != null) {
    var r = ratePart(v);
    td.title = 'Glykämische Last: ' + r.label;
    td.append(el('span', 'rate-dot r-' + r.k), document.createTextNode(cellVal(c, v)));
  } else if (c.key === 'nak' && v != null) {
    var rn = rateNaK(v);
    td.title = 'Natrium zu Kalium: ' + rn.label;
    td.append(el('span', 'rate-dot r-' + rn.k), document.createTextNode(cellVal(c, v)));
  } else {
    td.textContent = cellVal(c, v);
  }
  return td;
}
function sumRow(label, getter) {
  var tr = el('tr', 'sum');
  var th = el('th', 'c-name', label);
  th.scope = 'row';
  tr.append(th, el('td', 'qty'), el('td', 'unit'));
  COLS.forEach(function (c) {
    var v = getter(c.key);
    var td = el('td', 'num');
    if (c.key === 'nak' && v != null) {
      td.append(el('span', 'rate-dot r-' + rateNaK(v).k), document.createTextNode(cellVal(c, v)));
    } else td.textContent = cellVal(c, v);
    tr.append(td);
  });
  tr.append(el('td', 'act'));
  return tr;
}


/* Entwurf speichern: Zutaten, Uhrzeit und Datum (anderer Tag = Mahlzeit wandert dorthin) */
async function saveMealEdit() {
  var d = mealDraft;
  if (!d || !dbRef || editBusy) return;
  editBusy = true;
  var done = false;
  try {
    await dbTask(async function () {
    var date = d.date;
    var ref = dbRef.doc('days/' + date);
    var snap = await ref.get();
    var data = snap.exists ? snap.data() : null;
    var idx = locateMeal(data, d.orig);
    if (idx < 0) {
      toast('Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.');
    } else if (!d.parts.length) {
      var rest0 = data.meals.slice();
      rest0.splice(idx, 1);
      await ref.update({ meals: rest0 });
      toast('Mahlzeit entfernt.');
      done = true;
    } else {
      var cur = data.meals[idx];
      var upd = recomputeMeal(cur, d.parts);
      upd.time = d.time || '–';
      upd.name = cleanName(d.name) || fallbackMealName(d.parts);
      upd.id = cur.id || newId();
      if (d.newDate === date) {
        var same = data.meals.slice();
        same[idx] = upd;
        await ref.update({ meals: same });
        toast('Gespeichert.');
      } else {
        var tref = dbRef.doc('days/' + d.newDate);
        var tsnap = await tref.get();
        var tdata = tsnap.exists ? tsnap.data() : null;
        var tmeals = tdata && Array.isArray(tdata.meals) ? tdata.meals.filter(function (x) { return !(x && x.id === upd.id); }) : [];
        if (tdata) await tref.update({ meals: tmeals.concat([upd]) });
        else await tref.set({ date: d.newDate, meals: [upd] });
        var rest = data.meals.slice();
        rest.splice(idx, 1);
        try {
          await ref.update({ meals: rest });
        } catch (e2) {
          /* Quelle nicht geändert: Kopie am Zieltag wieder entfernen, damit nichts doppelt ist */
          try { if (tdata) await tref.update({ meals: tmeals }); else await tref.delete(); } catch (e3) {}
          throw e2;
        }
        toast('Gespeichert und nach ' + dayLabel(d.newDate) + ' verschoben.');
      }
      done = true;
    }
    });
  } catch (e) {
    toast('Die Änderungen konnten nicht gespeichert werden.');
  }
  if (done) { editKey = null; mealDraft = null; }
  editBusy = false;
  render(true);
}

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
