  /* Name der Mahlzeit in der Vorschau: Vorschlag von Claude, bis die Person selbst etwas eintippt */
  var previewName = null, previewNameTouched = false;
  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60); }
  function mergingPreview() { return !!(addTarget && addTarget.date === viewKey); }
  function setPreviewName(n) {
    n = cleanName(n);
    if (!n || previewNameTouched) return;
    previewName = n;
    var inp = $('p-name');
    if (inp) inp.value = n;
  }
  async function suggestMealName(parts) {
    if (!sampleRef || mergingPreview()) return;
    try {
      var r = await sampleRef.json('Give a short German name for this meal, 1 to 4 words, the way a person would call it (for example "Döner-Teller", "Obstschale", "Nudeln mit Fischstäbchen"). No amounts, no calories. Reply with JSON only: {"meal_name":string}\nFoods: ' + JSON.stringify(parts.map(partText)), { modelTier: 'quick', cache: false });
      if (pending && pending.parts === parts) setPreviewName(r && r.meal_name);
    } catch (e) {}
  }

  function showPreview(parts, note, name) {
    var box = $('preview');
    var view = saveViewState();
    box.replaceChildren();
    if (name !== undefined) { previewName = cleanName(name); previewNameTouched = false; }
    var inputs = [];
    var wrap = el('div', 'tbl-wrap');
    wrap.setAttribute('data-k', 'preview');
    var tbl = el('table', 'ntable');
    var body = document.createElement('tbody');
    var kcalSum = null;

    function sumKcal() {
      return inputs.reduce(function (s, i) { return s + Math.max(0, Math.round(Number(i.value) || 0)); }, 0);
    }
    function updateTotal() { if (kcalSum) kcalSum.textContent = fmtN(sumKcal()); }
    function rebuild(skip) {
      parts.forEach(function (pp, n) { if (n !== skip && inputs[n]) pp.kcal = Math.max(0, Math.round(Number(inputs[n].value) || 0)); });
      afterTap(function () { showPreview(parts, note); });
    }
    function applyQty(p, i, q, unit) {
      var cur = Math.max(0, Math.round(Number(inputs[i].value) || 0));
      p.kcal = cur;
      var f = q / p.qty;
      COLS.forEach(function (c) {
        if (!c.calc && p[c.key] != null) p[c.key] = num(Number(p[c.key]) * f, c.dec);
      });
      p.qty = round2(q);
      p.unit = unit;
      p.amount = fmtQty(p.qty) + ' ' + unit;
    }
    function previewQtyCells(tr, p, i) {
      var tdq = el('td', 'qty');
      var tdu = el('td', 'unit');
      var inp = el('input', 'q-in');
      inp.type = 'number';
      inp.step = 'any';
      inp.min = '0';
      inp.inputMode = 'decimal';
      inp.id = 'p-qty-' + i;
      doneKey(inp);
      inp.value = String(round2(p.qty));
      inp.setAttribute('aria-label', 'Menge für ' + p.name);
      inp.addEventListener('change', function () {
        var q = Number(String(inp.value).replace(',', '.'));
        if (!(q > 0) || q > 100000) { toast('Bitte eine Menge größer als 0 eingeben.'); rebuild(); return; }
        var changed = round2(q) !== round2(p.qty);
        if (changed) applyQty(p, i, q, p.unit);
        rebuild(changed ? i : -1);
      });
      tdq.append(inp);
      var sel = el('select', 'u-sel');
      sel.id = 'p-unit-' + i;
      sel.setAttribute('aria-label', 'Einheit für ' + p.name);
      unitOptions(p.unit).forEach(function (u) {
        var op = document.createElement('option');
        op.value = u;
        op.textContent = u;
        if (u === p.unit) op.selected = true;
        sel.append(op);
      });
      sel.addEventListener('change', function () {
        var u = sel.value;
        if (u === p.unit) return;
        var gOld = gramsPer(p.unitG, p.unit), gNew = gramsPer(p.unitG, u);
        if (!gOld || !gNew) {
          toast('Umrechnung nicht möglich: Für dieses Lebensmittel ist kein Gewicht pro ' + u + ' bekannt.');
          rebuild();
          return;
        }
        p.qty = round2(p.qty * gOld / gNew);
        p.unit = u;
        p.amount = fmtQty(p.qty) + ' ' + u;
        rebuild();
      });
      tdu.append(sel);
      tr.append(tdq, tdu);
    }

    function previewNutInput(c, p, i) {
      var inp = el('input', 'n-in');
      inp.type = 'number';
      inp.step = 'any';
      inp.min = '0';
      inp.inputMode = 'decimal';
      inp.id = 'p-' + c.key + '-' + i;
      doneKey(inp);
      inp.value = c.key === 'gi' ? (Number(p.gi) > 0 ? String(p.gi) : '') : String(p[c.key] != null ? p[c.key] : 0);
      inp.setAttribute('aria-label', c.label + ' für ' + p.name);
      inp.addEventListener('change', function () {
        var raw = String(inp.value).replace(',', '.').trim();
        var v = raw === '' ? 0 : Number(raw);
        if (isNaN(v) || v < 0 || v > 100000) { toast('Bitte eine Zahl größer oder gleich 0 eingeben.'); rebuild(); return; }
        if (c.key === 'gi') p.gi = v > 0 ? Math.min(150, Math.round(v)) : null;
        else p[c.key] = num(v, c.dec);
        rebuild();
      });
      return inp;
    }
    function removeRow(i) {
      parts.forEach(function (pp, n) { if (inputs[n]) pp.kcal = Math.max(0, Math.round(Number(inputs[n].value) || 0)); });
      parts.splice(i, 1);
      if (!parts.length) { pending = null; box.hidden = true; box.replaceChildren(); setChangeMode(false, true); return; }
      showPreview(parts, note);
    }

    parts.forEach(function (p, i) {
      var tr = document.createElement('tr');
      tr.append(nameCell(p.name, p.estimate));
      previewQtyCells(tr, p, i);
      COLS.forEach(function (c) {
        var td = el('td', 'num');
        if (c.key === 'kcal') {
          var inp = el('input', 'p-kcal');
          inp.type = 'number';
          inp.min = '0';
          inp.step = '1';
          inp.inputMode = 'numeric';
          inp.id = 'p-kcal-' + i;
          doneKey(inp);
          inp.value = String(p.kcal);
          inp.setAttribute('aria-label', 'Kalorien für ' + p.name);
          inp.addEventListener('input', updateTotal);
          inputs.push(inp);
          td.append(inp);
        } else if (!c.calc || c.key === 'gi') {
          td.append(previewNutInput(c, p, i));
        } else {
          td.textContent = cellVal(c, partVal(c.key, p));
        }
        tr.append(td);
      });
      var tdAct = el('td', 'act');
      var rdel = iconBtn('trash', 'Lebensmittel entfernen', 'row-del');
      rdel.addEventListener('click', function () {
        var removed = p;
        removeRow(i);
        undoToast(String(removed.name || 'Lebensmittel') + ' entfernt.', function () {
          parts.splice(Math.min(i, parts.length), 0, removed);
          showPreview(parts, note);
        });
      });
      tdAct.append(rdel);
      tr.append(tdAct);
      body.append(tr);
    });

    var sums = {};
    NUTS.forEach(function (n) {
      sums[n.key] = parts.reduce(function (s, p) { return s + p[n.key]; }, 0);
    });
    sums.gl = glOfParts(parts);
    sums.gi = weightedGI(parts);
    sums.nak = nakOf(sums.salt, sums.potassium);
    var total = el('tr', 'sum');
    var th = el('th', 'c-name', 'Mahlzeit gesamt');
    th.scope = 'row';
    total.append(th, el('td', 'qty'), el('td', 'unit'));
    COLS.forEach(function (c) {
      var td = el('td', 'num', c.key === 'kcal' ? '' : cellVal(c, sums[c.key]));
      if (c.key === 'kcal') kcalSum = td;
      total.append(td);
    });
    total.append(el('td', 'act'));
    body.append(total);
    updateTotal();

    tbl.append(colgroup(), thead(), body);
    wrap.append(tbl);
    if (!mergingPreview()) {
      var nrow = el('div', 'goal');
      var nl = el('label', null, 'Name der Mahlzeit');
      nl.htmlFor = 'p-name';
      var ni = el('input', 'name-in');
      ni.type = 'text';
      ni.id = 'p-name';
      ni.maxLength = 60;
      ni.value = previewName || '';
      ni.placeholder = fallbackMealName(parts);
      doneKey(ni);
      ni.addEventListener('input', function () { previewName = ni.value; previewNameTouched = true; });
      nrow.append(nl, ni);
      box.append(nrow);
    }
    box.append(wrap);
    var pvInfo = [];
    if (note) pvInfo.push(String(note).slice(0, 300));
    pvInfo.push((mergingPreview() ? 'Wird zur Mahlzeit von ' + String(addTarget.meal.time || '–').slice(0, 5) + ' ergänzt (' + dayLabel(viewKey) + ')' : 'Wird eingetragen für: ' + dayLabel(viewKey)) + '. In der Vorschau kannst du Menge, Einheit und alle Werte ändern oder ein Lebensmittel entfernen. Ändert sich die Menge, passen sich die Werte an.');
    box.append(infoEl(pvInfo));
    var actions = el('div', 'row');
    var save = el('button', 'btn', 'Mahlzeit speichern');
    save.type = 'button';
    var discard = el('button', 'btn ghost', 'Verwerfen');
    discard.type = 'button';
    actions.append(save, discard);
    box.append(actions);
    box.hidden = false;

    pending = { parts: parts, inputs: inputs, save: save, date: viewKey };
    save.addEventListener('click', saveMeal);
    discard.addEventListener('click', function () { pending = null; box.hidden = true; box.replaceChildren(); setChangeMode(false, true); });
    setChangeMode(true);
    restoreViewState(view);
  }

  var MODELS = {
    haiku: { model: 'claude-haiku-5-5', tier: 'quick' },
    sonnet: { model: 'claude-sonnet-5-5', tier: 'default' },
    opus: { model: 'claude-opus-5-5', tier: 'complex' }
  };
  function currentChoice() {
    return MODELS[$('model-tier').value] || MODELS.haiku;
  }
  var MODEL_SAVED = 'haiku';
  try {
    var savedModel = localStorage.getItem('calorie-log-model');
    if (MODELS[savedModel]) MODEL_SAVED = savedModel;
  } catch (e) {}
  $('model-tier').value = MODEL_SAVED;


