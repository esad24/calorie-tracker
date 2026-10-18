var estimating = false;
function setBusy(on) {
  busy = on;
  if (!on) estimating = false;
  var eb = $('estimate');
  eb.classList.toggle('loading', on && estimating);
  if (on && estimating) eb.setAttribute('aria-busy', 'true'); else eb.removeAttribute('aria-busy');
  $('estimate').disabled = on || !capsReady || !dbRef || !sampleRef;
}

function showPreview(parts, note) {
  var box = $('preview');
  box.replaceChildren();
  var inputs = [];
  var wrap = el('div', 'tbl-wrap');
  var tbl = el('table', 'ntable');
  var body = document.createElement('tbody');
  var kcalSum = null;

  function sumKcal() {
    return inputs.reduce(function (s, i) { return s + Math.max(0, Math.round(Number(i.value) || 0)); }, 0);
  }
  function updateTotal() { if (kcalSum) kcalSum.textContent = fmtN(sumKcal()); }
  function rebuild(skip) {
    parts.forEach(function (pp, n) { if (n !== skip && inputs[n]) pp.kcal = Math.max(0, Math.round(Number(inputs[n].value) || 0)); });
    showPreview(parts, note);
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
    confirmTap(rdel, function () { removeRow(i); }, 'Lebensmittel entfernen?', String(p.name || ''));
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
  box.append(wrap);
  var pvInfo = [];
  if (note) pvInfo.push(String(note).slice(0, 300));
  pvInfo.push((addTarget && addTarget.date === viewKey ? 'Wird zur Mahlzeit von ' + String(addTarget.meal.time || '–').slice(0, 5) + ' ergänzt (' + dayLabel(viewKey) + ')' : 'Wird eingetragen für: ' + dayLabel(viewKey)) + '. In der Vorschau kannst du Menge, Einheit und alle Werte ändern oder ein Lebensmittel entfernen. Ändert sich die Menge, passen sich die Werte an.');
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


/* Änderungsmodus: Sobald eine Vorschau da ist, geht Text an Claude mit dem bisherigen Stand als Kontext */
var changeMode = false, lastMealText = '', lastPhoto = null, lastPhotoCtx = '';
var MEAL_PLACEHOLDER = '150 g Haferflocken, 250 ml Milch, 1 Banane (120 g)';
function setChangeMode(on, restore) {
  var ta = $('meal-input');
  if (on && !changeMode) {
    lastMealText = ta.value;
    ta.value = '';
  } else if (!on && changeMode && restore) {
    ta.value = lastMealText;
  }
  changeMode = on;
  if (!on) { lastMealText = ''; lastPhoto = null; lastPhotoCtx = ''; }
  $('h-add').textContent = on ? 'Änderung vornehmen' : (addTarget && addTarget.date === viewKey ? 'Mahlzeit ergänzen' : 'Mahlzeit hinzufügen');
  ta.placeholder = on ? 'Was soll geändert oder ergänzt werden? z. B. „Mango nur 80 g, dazu 1 EL Honig“' : MEAL_PLACEHOLDER;
  ta.setAttribute('aria-label', on ? 'Änderung oder Ergänzung für den Vorschlag' : 'Was hast du gegessen?');
  $('estimate').textContent = on ? 'Änderung senden' : 'Schätzen';
  $('scan-label').hidden = on;
  $('nut-label').hidden = on;
}
function refinePrompt(prev, parts, change) {
  var lines = buildPrompt('', true).split('\n');
  lines.pop();
  lines = lines.filter(function (l) {
    return !/^The description has numbered lines|^Add to every item "brand"|^A line that contains a barcode|^Some lines list BLS/.test(l);
  });
  var cur = parts.map(function (p) {
    var o = { name: p.name, qty: p.qty, unit: p.unit, unit_g: p.unitG > 0 ? p.unitG : 1, kcal: p.kcal, gi: p.gi || null, estimate: !!p.estimate };
    NUTS.forEach(function (n) { o[n.key] = p[n.key]; });
    return o;
  });
  lines.push('You are revising a meal estimate you gave before. Below is everything the person gave you (original description and photo note, current items as JSON including their own edits, and their change request in German). Answer with the complete updated list of items in the Format above, "questions": [] and a short German note on what you changed.');
  lines.push('Original description: """' + String(prev || '').replace(/"""/g, '"') + '"""');
  lines.push('Current items: ' + JSON.stringify(cur));
  lines.push('Change request: """' + String(change).replace(/"""/g, '"') + '"""');
  return lines.join('\n');
}
async function refine() {
  var text = $('meal-input').value.trim();
  if (!text || busy || !pending) return;
  if (!capsReady || !sampleRef) { toast('Schätzen ist in dieser Ansicht nicht verfügbar.'); return; }
  var parts = pending.parts;
  pending.inputs.forEach(function (inp, i) { if (parts[i] && inp) parts[i].kcal = Math.max(0, Math.round(Number(inp.value) || 0)); });
  estimating = true;
  setBusy(true);
  toast('');
  try {
    var prevText = lastMealText + (lastPhotoCtx ? (lastMealText ? '\n' : '') + 'Note the person wrote with the photo: ' + lastPhotoCtx : '');
    var cc = currentChoice();
    var so = { model: cc.model, modelTier: cc.tier, cache: false };
    if (lastPhoto) {
      var lim = null;
      try { lim = await sampleRef.limits(); } catch (e) {}
      if (lim && lim.images) {
        so = { images: [lastPhoto], cache: false };
        if (cc.tier === 'quick') so.modelTier = 'default'; else { so.model = cc.model; so.modelTier = cc.tier; }
      }
    }
    var res = await sampleRef.json(refinePrompt(prevText, parts, text) + (so.images ? '\nThe original photo is attached again.' : ''), so);
    var np = normalize(res);
    if (!np.length) {
      toast('Die Änderung konnte nicht gelesen werden. Formuliere sie anders und versuche es erneut.');
    } else {
      $('meal-input').value = '';
      toast('');
      showPreview(np, res && res.note ? String(res.note) : 'Änderung übernommen. Prüfe die Werte.');
    }
  } catch (e) {
    var code = e && e.code;
    toast(
      code === 'not_granted' ? 'Schätzen wurde für diese Seite nicht erlaubt. Erlaube es und versuche es erneut.' :
      code === 'rate_limited' ? 'Zu viele Anfragen. Warte einen Moment und versuche es erneut.' :
      'Die Änderung ist fehlgeschlagen. Versuche es erneut.'
    );
  }
  setBusy(false);
}

async function estimate() {
  if (changeMode) { refine(); return; }
  lastPhoto = null;
  lastPhotoCtx = '';
  var text = $('meal-input').value.trim();
  if (!text || busy) return;
  if (!capsReady) { toast('Verbindung wird noch aufgebaut. Versuche es gleich noch einmal.'); return; }
  if (!sampleRef) { toast('Schätzen ist in dieser Ansicht nicht verfügbar.'); return; }
  estimating = true;
  setBusy(true);
  toast('');
  $('preview').hidden = true;
  pending = null;
  var local = [], missing = [], segs = splitMeal(text);
  for (var si = 0; si < segs.length; si++) {
    var s = segs[si];
    var hit = foodFromDb(s);
    var cands = [];
    if (!hit && s.name) {
      cands = blsCandidates(s.name);
      if (cands.length > 12) cands = [];
      else if (!cands.length) cands = typoCandidates(s.name);
    }
    if (hit) local.push(hit); else missing.push({ raw: s.raw, name: s.name || s.raw, cands: cands });
  }
  try {
    if (!missing.length) {
      toast('');
      showPreview(local, 'Alle Lebensmittel stammen aus deiner Datenbank bzw. dem BLS.');
      setBusy(false);
      return;
    }
    var lines = missingLines(missing);
    var res = await sampleRef.json(buildPrompt(lines), { model: currentChoice().model, modelTier: currentChoice().tier, cache: false });
    var qs = (res && Array.isArray(res.questions) ? res.questions : []).filter(function (q) {
      return q && q.question && Array.isArray(q.options) && q.options.length >= 2;
    }).slice(0, 6);
    if (qs.length) {
      var answers = [];
      toast('');
      for (var qi = 0; qi < qs.length; qi++) {
        var ans = await askChoice(String(qs[qi].question), qs[qi].options.slice(0, 4).map(String), null, true);
        var qh = String(qs[qi].item || '') + ' (' + String(qs[qi].question).slice(0, 120) + ')';
        if (typeof ans === 'string') answers.push(qh + ': ' + ans.slice(0, 200));
        else if (ans >= 0) answers.push(qh + ': ' + String(qs[qi].options[ans]));
      }
      if (answers.length) {
        toast('');
        res = await sampleRef.json(buildPrompt(lines + '\nClarifications from the person: ' + answers.join('; '), true), { model: currentChoice().model, modelTier: currentChoice().tier, cache: false });
      }
    }
    var web = null, webNote = '';
    if (mcpRef && WEB_ON) {
      var bl = brandedLines(res, missing);
      if (bl.length) {
        toast('Suche Produktdaten…', true);
        web = { prods: {}, picks: {} };
        var failed = null;
        await Promise.all(bl.map(async function (b) {
          try { var r = await lookupProduct(b.q); if (r.length) web.prods[b.line] = r; }
          catch (e) { failed = failed || (e && e.code) || 'error'; }
        }));
        var wlist = Object.keys(web.prods);
        if (wlist.length) {
          try {
            var pk = await sampleRef.json(webPrompt(wlist, web.prods, missing), { modelTier: 'quick', cache: false });
            (pk && Array.isArray(pk.picks) ? pk.picks : []).forEach(function (k) {
              var ln = k && Number(k.line), ix = k && k.off != null ? Number(k.off) : -1;
              if (web.prods[ln] && web.prods[ln][ix]) web.picks[ln] = ix;
            });
          } catch (e) {}
        }
        var nPick = Object.keys(web.picks).length;
        if (nPick) webNote = nPick + ' Produkt(e) aus Open Food Facts. ';
        else if (failed === 'server_not_connected' || failed === 'not_in_manifest' || failed === 'approval_required' || failed === 'consent_required') webNote = 'Produktsuche nicht erlaubt oder Parallel Search nicht verbunden, Werte geschätzt. ';
        else if (failed) webNote = 'Produktsuche fehlgeschlagen, Werte geschätzt. ';
        else webNote = 'Kein eindeutiger Produkttreffer, Werte geschätzt. ';
      }
    }
    var parts = local.concat(claudeParts(res, missing, web));
    if (!parts.length) {
      toast('Das konnte nicht gelesen werden. Schreibe die Lebensmittel mit Mengen auf.');
    } else {
      toast('');
      var note = (local.length ? local.length + ' aus Datenbank/BLS. ' : '') + webNote + (res && res.note ? res.note : '');
      showPreview(parts, note.trim());
    }
  } catch (e) {
    var code = e && e.code;
    toast(
      code === 'not_granted' ? 'Schätzen wurde für diese Seite nicht erlaubt. Erlaube es und versuche es erneut.' :
      code === 'rate_limited' ? 'Zu viele Anfragen. Warte einen Moment und versuche es erneut.' :
      'Die Schätzung ist fehlgeschlagen. Versuche es erneut.'
    );
  }
  setBusy(false);
}

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

async function saveMeal() {
  if (!pending || !dbRef || busy) return;
  var p = pending;
  setBusy(true);
  p.save.disabled = true;
  var parts = p.parts.map(function (part, i) {
    var out = {
      name: part.name,
      qty: part.qty,
      unit: part.unit,
      amount: part.amount,
      kcal: Math.max(0, Math.round(Number(p.inputs[i].value) || 0))
    };
    if (part.unitG > 0) out.unitG = part.unitG;
    if (part.gi > 0) out.gi = part.gi;
    NUTS.forEach(function (n) { out[n.key] = part[n.key]; });
    return out;
  });
  var now = new Date();
  var date = p.date || keyOf(now);
  var meal = {
    id: newId(),
    time: date === keyOf(now) ? pad(now.getHours()) + ':' + pad(now.getMinutes()) : '–',
    items: parts.map(partText).join(', ').slice(0, 300),
    kcal: parts.reduce(function (s, x) { return s + x.kcal; }, 0),
    parts: parts
  };
  NUTS.forEach(function (n) {
    meal[n.key] = num(parts.reduce(function (s, x) { return s + x[n.key]; }, 0), n.dec);
  });
  var mgl = glOfParts(parts);
  if (mgl != null) meal.gl = round2(mgl);
  var merged = null;
  try {
    await dbTask(async function () {
    var ref = dbRef.doc('days/' + date);
    var snap = await ref.get();
    var cur = snap.exists ? snap.data() : null;
    merged = null;
    if (addTarget && addTarget.date === date && cur && Array.isArray(cur.meals)) {
      var ti = locateMeal(cur, addTarget.meal);
      if (ti >= 0 && Array.isArray(cur.meals[ti].parts)) {
        var ex = cur.meals[ti];
        var allParts = ex.parts.concat(parts);
        var nm = Object.assign({}, ex, { parts: allParts });
        nm.kcal = allParts.reduce(function (s, x) { return s + (Number(x.kcal) || 0); }, 0);
        NUTS.forEach(function (n) {
          var have = allParts.filter(function (x) { return x[n.key] != null; });
          if (have.length) nm[n.key] = num(have.reduce(function (s, x) { return s + (Number(x[n.key]) || 0); }, 0), n.dec);
        });
        nm.items = allParts.map(partText).join(', ').slice(0, 300);
        var ngl = glOfParts(allParts);
        if (ngl != null) nm.gl = round2(ngl); else delete nm.gl;
        var nmeals = cur.meals.slice();
        nmeals[ti] = nm;
        await ref.update({ meals: nmeals });
        merged = nm;
      }
    }
    if (merged) {
      /* Mahlzeit ergaenzt, Uhrzeit und ID bleiben */
    } else if (cur && Array.isArray(cur.meals)) {
      await ref.update({ meals: cur.meals.concat([meal]) });
    } else {
      await ref.set({ date: date, meals: [meal] });
    }
    });
    saveFoods(parts, p.parts);
    if (merged) { addTarget = null; editKey = null; mealDraft = null; }
    pending = null;
    $('preview').hidden = true;
    $('preview').replaceChildren();
    setChangeMode(false, false);
    $('meal-input').value = '';
    toast((merged ? 'Ergänzt: +' : 'Gespeichert: ') + fmtN(meal.kcal) + ' kcal' + (merged ? ' zur Mahlzeit um ' + String(merged.time || '–').slice(0, 5) + '.' : ' für ' + dayLabel(date) + '.'));
  } catch (e) {
    p.save.disabled = false;
    toast('Das Speichern ist fehlgeschlagen. Es wurde nichts hinzugefügt.');
  }
  setBusy(false);
}
