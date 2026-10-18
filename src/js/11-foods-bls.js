  /* Eigene Lebensmittel-Datenbank: Werte pro 100 g, gespeichert nach jeder Mahlzeit; nur Treffer mit gleichem Namen werden lokal berechnet. */
  function foodKey(name) {
    return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
  function compactName(s) { return foodKey(s).replace(/-/g, ''); }
  function loadBls() {
    fetch('bls.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !Array.isArray(d.foods)) return;
      BLS = d.foods.map(function (e) { return { e: e, c: compactName(e.n), w: compactName(String(e.n).split(/[ ,\/]/)[0]) }; });
      BLSMap = {};
      BLS.forEach(function (x) { if (!BLSMap[x.c]) BLSMap[x.c] = x; });
      BLSWords = {};
      BLS.forEach(function (x) { (BLSWords[x.w] = BLSWords[x.w] || []).push(x); });
    }).catch(function () {});
  }
  /* BLS 4.0: exakter Name, sonst kürzester Eintrag, der mit dem Namen beginnt */
  function blsLookup(name) {
    var c = compactName(name);
    if (!BLS || c.length < 3) return null;
    var x = BLSMap[c];
    if (!x && c.length >= 4) {
      // nur wenn genau ein Eintrag mit diesem ersten Wort existiert, sonst mehrdeutig -> Claude
      var cand = BLS.filter(function (y) { return y.w === c; });
      if (cand.length === 1) x = cand[0];
    }
    if (!x) return null;
    var e = x.e;
    return { name: e.n, per100: { kcal: e.k, protein: e.p || 0, carbs: e.c || 0, fat: e.f || 0, sugar: e.s || 0, salt: e.l || 0, potassium: e.m || 0 }, gi: null, unitG: null };
  }
  function entryToFood(e) {
    return { name: e.n, per100: { kcal: e.k, protein: e.p || 0, carbs: e.c || 0, fat: e.f || 0, sugar: e.s || 0, salt: e.l || 0, potassium: e.m || 0 }, gi: null, unitG: null };
  }
  /* mehrere BLS-Einträge mit demselben ersten Wort: Auswahl per Popup */
  function blsCandidates(name) {
    var c = compactName(name);
    if (!BLS || c.length < 4) return [];
    return BLS.filter(function (y) { return y.w === c; }).sort(function (a, b) { return a.c.length - b.c.length; });
  }
  /* Question sheet: one row per option, optional free text. Resolves the option index, the typed text,
     or -1 when skipped or dismissed (pull down, scrim, Escape). */
  function askChoice(question, options, skipLabel, allowText) {
    return new Promise(function (resolve) {
      var result = -1;
      var sheet = makeSheet({ title: '', cancel: skipLabel || 'Überspringen', role: 'dialog', onDismiss: function () { resolve(result); } });
      sheet.sheet.setAttribute('aria-label', question);
      function pick(v) { result = v; sheet.close('done'); }
      var q = el('h3', 'choice-q', question);
      var list = el('div', 'grp-list choice-list');
      options.forEach(function (o, i) {
        var cell = el('div', 'cell');
        var b = el('button', 'cell-btn');
        b.type = 'button';
        b.append(el('b', null, String.fromCharCode(65 + i)), document.createTextNode(o));
        b.addEventListener('click', function () { pick(i); });
        cell.append(b);
        list.append(cell);
      });
      sheet.body.append(q, list);
      if (allowText) {
        var row = el('div', 'ask-row');
        var inp = el('input');
        inp.type = 'text';
        inp.id = 'choice-text-' + sheetSeq;
        inp.placeholder = 'Oder selbst genauer beschreiben…';
        inp.setAttribute('aria-label', 'Selbst genauer beschreiben');
        inp.enterKeyHint = 'done';
        var ok = el('button', 'btn', 'OK');
        ok.type = 'button';
        var submit = function () { var v = inp.value.trim(); if (v) pick(v); };
        ok.addEventListener('click', submit);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        row.append(inp, ok);
        sheet.body.append(row);
      }
      sheet.open();
    });
  }
  /* Tippfehler: Levenshtein-Abstand mit frühem Abbruch */
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i], low = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function typoCandidates(name) {
    var c = compactName(name), n = c.length;
    var max = n <= 4 ? 0 : n <= 8 ? 1 : 2;
    if (!BLS || !max) return [];
    var scored = [];
    Object.keys(BLSWords).forEach(function (w) {
      var d = lev(c, w, max);
      if (d > 0 && d <= max) BLSWords[w].forEach(function (x) { scored.push({ x: x, d: d }); });
    });
    BLS.forEach(function (x) {
      var d = lev(c, x.c, max);
      if (d > 0 && d <= max) scored.push({ x: x, d: d });
    });
    var seen = {}, out = [];
    scored.sort(function (a, b) { return a.d - b.d || a.x.c.length - b.x.c.length; }).forEach(function (s) {
      if (!seen[s.x.c]) { seen[s.x.c] = 1; out.push(s.x); }
    });
    return out.length > 12 ? [] : out;
  }
  /* Suche mit den von Claude korrigierten Namen */
  function blsByTerms(terms) {
    var seen = {}, out = [];
    function add(x) { if (x && !seen[x.c]) { seen[x.c] = 1; out.push(x); } }
    terms.forEach(function (t) {
      var c = compactName(t);
      if (!BLS || c.length < 3) return;
      add(BLSMap[c]);
      (BLSWords[c] || []).slice().sort(function (a, b) { return a.c.length - b.c.length; }).forEach(add);
      if (c.length >= 6) BLS.forEach(function (y) { if (y.c.indexOf(c) === 0) add(y); });
    });
    return out;
  }
  function buildNormPrompt(lines) {
    return [
      'You map short food descriptions (usually German, may contain typos, English words or slang) to German food names as used in the German food composition table Bundeslebensmittelschluessel (BLS). Reply with JSON only, no prose.',
      'For each input line return: i (the line number), name (the corrected German food name, e.g. "Hähnchenflügel"), terms (1 to 4 German names as they could appear at the start of a BLS entry, most specific first, e.g. ["Hähnchen Flügel","Hähnchen"]), qty (number), unit ("g", "ml", "Stück" or "Portion"), unit_g (typical grams of one Stück or Portion, otherwise null), qty_assumed (true if no amount was given and you assumed a typical portion).',
      'Format: {"items":[{"i":0,"name":"","terms":[""],"qty":0,"unit":"g","unit_g":null,"qty_assumed":false}]}',
      'Lines:',
      lines.map(function (r, i) { return i + ': ' + String(r).replace(/\n/g, ' '); }).join('\n')
    ].join('\n');
  }
  function splitMeal(text) {
    var re = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stück|stk\.?|portionen|portion)?\b/i;
    var pieces = [];
    text = text.replace(/(^|\s)(ca\.?|circa|etwa|ungefähr|~)(?=\s|\d)/gi, ' ');
    text.split(/[,;\n]+|\s+und\s+/i).forEach(function (seg) {
      // zusätzlich vor jeder Mengenangabe trennen: "100g apfel 200g hähnchen 1 banane"
      seg.split(/\s+(?=\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|stück|stk\.?|portionen|portion)?\s+[a-zäöüß])/i).forEach(function (p) { pieces.push(p); });
    });
    return pieces.map(function (s) { return s.trim(); }).filter(Boolean).map(function (raw) {
      var m = re.exec(raw);
      if (!m) return { raw: raw, qty: null };
      var o = parseAmount(raw);
      var name = (raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length)).replace(/(^|\s)(ca\.?|circa|etwa|ungefähr)(?=\s|$)/gi, ' ').replace(/^\s*(von|of)\s+/i, '').replace(/\s+/g, ' ').trim();
      return { raw: raw, qty: o.qty, unit: o.unit, name: name };
    });
  }
  function foodFromDb(s) {
    if (!(s.qty > 0) || !s.name) return null;
    var f = FOODS[foodKey(s.name)];
    if (!f || !f.per100) f = (s.unit === 'g' || s.unit === 'ml') ? blsLookup(s.name) : null;
    if (!f || !f.per100) return null;
    return partFromFood(s, f);
  }
  function partFromFood(s, f) {
    var grams = (s.unit === 'g' || s.unit === 'ml') ? s.qty : (f.unitG > 0 ? s.qty * f.unitG : 0);
    if (!(grams > 0)) return null;
    var q = round2(s.qty);
    var p = { name: f.name, qty: q, unit: s.unit, amount: fmtQty(q) + ' ' + s.unit, kcal: num((Number(f.per100.kcal) || 0) * grams / 100, 0), estimate: false, fromDb: true, _per100: f.per100 };
    if (s.unit !== 'g' && s.unit !== 'ml' && f.unitG > 0) p.unitG = f.unitG;
    p.gi = f.gi > 0 ? f.gi : null;
    NUTS.forEach(function (n) { p[n.key] = num((Number(f.per100[n.key]) || 0) * grams / 100, n.dec); });
    if (p.sugar > p.carbs) p.sugar = p.carbs;
    return p;
  }
  function saveFoods(saved, src) {
    if (!dbRef) return;
    saved.forEach(function (p, i) {
      var sp = src[i] || {};
      if (sp.fromDb && !sp.alias) return;
      var key = foodKey(sp.alias || p.name);
      if (!key) return;
      var grams = (p.unit === 'g' || p.unit === 'ml') ? p.qty : (p.unitG > 0 ? p.qty * p.unitG : 0);
      if (!(grams > 0)) return;
      var ex = FOODS[key];
      var per100 = {};
      ['kcal'].concat(NUTS.map(function (n) { return n.key; })).forEach(function (k) {
        per100[k] = Math.round((Number(p[k]) || 0) * 100 / grams * 1000) / 1000;
      });
      if (sp._per100) per100 = Object.assign({}, sp._per100);
      var unitG = p.unitG > 0 ? p.unitG : (ex && ex.unitG > 0 ? ex.unitG : null);
      dbRef.doc('foods/' + key).set({ key: key, name: p.name, per100: per100, gi: p.gi > 0 ? p.gi : null, unitG: unitG }).catch(function () {});
    });
  }

  function doneKey(inp) {
    inp.enterKeyHint = 'done';
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
  }

  var estimating = false;
  function setBusy(on) {
    busy = on;
    if (!on) estimating = false;
    var eb = $('estimate');
    eb.classList.toggle('loading', on && estimating);
    if (on && estimating) eb.setAttribute('aria-busy', 'true'); else eb.removeAttribute('aria-busy');
    $('estimate').disabled = on || !capsReady || !dbRef || !sampleRef;
  }

