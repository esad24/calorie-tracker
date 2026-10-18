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
      del.addEventListener('click', function () {
        var before = mealDraft ? mealDraft.parts.slice() : null, key = mealDraft && mealDraft.key;
        applyEdit(ctx.date, ctx.meal, p, function () { return { remove: true }; });
        if (before) undoToast(String(p.name || 'Lebensmittel') + ' entfernt.', function () {
          if (mealDraft && mealDraft.key === key) { mealDraft.parts = before; render(true); }
        });
      });
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

