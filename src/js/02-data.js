  /* Menge und Einheit */
  function parseAmount(s) {
    var m = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stück|stk\.?|portionen|portion)?\b/i.exec(s);
    if (!m) return { qty: null, unit: 'Portion', unitG: null };
    var q = Number(m[1].replace(',', '.'));
    var u = (m[2] || '').toLowerCase();
    if (u === 'kg') { q *= 1000; u = 'g'; }
    else if (u === 'l') { q *= 1000; u = 'ml'; }
    else if (u === 'g' || u === 'ml') { /* bleibt */ }
    else if (u.indexOf('port') === 0) u = 'Portion';
    else u = 'Stück';
    return { qty: q, unit: u, unitG: null };
  }
  function normUnit(u) {
    var s = String(u || '').toLowerCase().trim();
    if (s === 'g' || s === 'gramm') return 'g';
    if (s === 'ml') return 'ml';
    if (s.indexOf('st') === 0) return 'Stück';
    if (s.indexOf('port') === 0) return 'Portion';
    return null;
  }
  function qtyOf(p) {
    if (Number(p.qty) > 0 && typeof p.unit === 'string' && p.unit) {
      return { qty: Number(p.qty), unit: p.unit, unitG: Number(p.unitG) > 0 ? Number(p.unitG) : null };
    }
    return parseAmount(String(p.amount || ''));
  }
  function gramsPer(unitG, unit) {
    if (unit === 'g' || unit === 'ml') return 1;
    return unitG > 0 ? unitG : null;
  }
  function gramsOf(p) {
    var o = qtyOf(p);
    var g = gramsPer(o.unitG, o.unit);
    return o.qty > 0 && g ? o.qty * g : null;
  }
  function partText(p) {
    var o = qtyOf(p);
    return (o.qty > 0 ? fmtQty(o.qty) + ' ' + o.unit + ' ' : '') + String(p.name || '');
  }

  /* Name einer Mahlzeit: von Claude vorgeschlagen oder selbst vergeben; sonst aus den Lebensmitteln */
  function fallbackMealName(parts) {
    var names = parts.map(function (p) { return String(p.name || '').split(/[,(]/)[0].trim(); }).filter(Boolean);
    if (!names.length) return '';
    return (names.length > 2 ? names.slice(0, 2).join(', ') + ' u. a.' : names.join(' & ')).slice(0, 60);
  }
  function mealTitle(m) {
    return String(m.name || '').trim() || fallbackMealName(Array.isArray(m.parts) ? m.parts : []) || String(m.items || '').slice(0, 60);
  }

  /* Daten */
  function mealsOf(d) {
    var out = [];
    if (d && Array.isArray(d.meals)) {
      d.meals.forEach(function (m, i) {
        if (m && typeof m === 'object') out.push(Object.assign({}, m, { _i: i }));
      });
    }
    return out;
  }
  function partsOf(m) {
    var out = [];
    if (Array.isArray(m.parts)) {
      m.parts.forEach(function (p, i) {
        if (p && typeof p === 'object') out.push(Object.assign({}, p, { _pi: i }));
      });
    }
    return out;
  }
  /* Glykämischer Index (GI) und Glykämische Last (GL = GI x Kohlenhydrate in g / 100) */
  function partGL(p) {
    var gi = Number(p.gi);
    var carbs = Number(p.carbs) || 0;
    if (!(gi > 0)) return carbs < 2 ? 0 : null;
    return (gi * carbs) / 100;
  }
  function partVal(key, p) {
    if (key === 'gl') return partGL(p);
    if (key === 'nak') return nakOf(p.salt, p.potassium);
    if (key === 'gi') return Number(p.gi) > 0 ? Number(p.gi) : ((Number(p.carbs) || 0) < 2 ? 0 : null);
    return p[key];
  }
  function glOfParts(parts) {
    var s = 0, any = false;
    parts.forEach(function (p) {
      var g = partGL(p);
      if (g != null) { s += g; any = true; }
    });
    return any ? s : null;
  }
  function weightedGI(parts) {
    var gl = glOfParts(parts), cw = 0;
    parts.forEach(function (p) { if (Number(p.gi) > 0) cw += Number(p.carbs) || 0; });
    return gl != null && cw > 0 ? (gl / cw) * 100 : null;
  }
  function rateWith(v, lowMax, midMax) {
    return v <= lowMax ? { k: 'low', label: 'niedrig' } : v <= midMax ? { k: 'mid', label: 'mittel' } : { k: 'high', label: 'hoch' };
  }
  function ratePart(gl) { return rateWith(gl, 10, 19); }
  var GLT = { low: 80, mid: 120 };
  function rateMeal(gl) { return rateWith(gl, Math.round(GLT.low / 3), Math.round(GLT.mid / 3)); }
  function rateDay(gl) { return rateWith(gl, GLT.low, GLT.mid); }

  function mealValue(m, key) {
    if (key === 'gl') return glOfParts(partsOf(m));
    if (key === 'nak') return nakOf(mealValue(m, 'salt'), mealValue(m, 'potassium'));
    if (key === 'gi') return weightedGI(partsOf(m));
    if (m[key] != null) return Number(m[key]) || 0;
    var have = partsOf(m).filter(function (p) { return p[key] != null; });
    if (!have.length) return null;
    return have.reduce(function (s, p) { return s + (Number(p[key]) || 0); }, 0);
  }
  function totalOf(d) {
    return mealsOf(d).reduce(function (s, m) { return s + (Number(m.kcal) || 0); }, 0);
  }
  // Kalorien-Saldo: Summe (gegessen − Tagesbedarf) aller Tage mit Einträgen VOR dem Tag `key`.
  // Negativ = Defizit (heute mehr erlaubt), positiv = Überschuss (heute weniger). Leere Tage zählen nicht.
  // Saldo wird immer auf 50er abgerundet (Endung 0 oder 50), im Betrag: -1.690 -> -1.650, 1.690 -> 1.650.
  function round50(v) { return Math.trunc(v / 50) * 50 || 0; }
  // Ist in den Einstellungen ein Saldo gesetzt (balVal ab balFrom), startet die Rechnung dort.
  function balanceBefore(key) {
    var from = GOALS.balFrom;
    var anchored = typeof from === 'string' && KEY.test(from) && key >= from;
    var sum = anchored ? GOALS.balVal : 0, n = anchored ? 1 : 0;
    days.forEach(function (d) {
      if (d.date < key && (!anchored || d.date >= from) && mealsOf(d).length > 0) { sum += totalOf(d) - TARGET; n++; }
    });
    return { sum: sum, n: n };
  }
  function dayTotals(d) {
    var t = { kcal: 0 };
    NUTS.forEach(function (n) { t[n.key] = 0; });
    mealsOf(d).forEach(function (m) {
      t.kcal += Number(m.kcal) || 0;
      NUTS.forEach(function (n) { t[n.key] += mealValue(m, n.key) || 0; });
    });
    var all = [], miss = false;
    mealsOf(d).forEach(function (m) {
      var ps = partsOf(m);
      ps.forEach(function (p) { all.push(p); });
      if (!ps.length && (Number(m.carbs) || 0) >= 2) miss = true;
    });
    t.gl = glOfParts(all);
    t.gi = weightedGI(all);
    t.nak = nakOf(t.salt, t.potassium);
    t.glMissing = miss || all.some(function (p) { return partGL(p) == null; });
    return t;
  }
  function byTime(a, b) {
    var x = String(a.time || ''), y = String(b.time || '');
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function locateMeal(data, meal) {
    if (!data || !Array.isArray(data.meals)) return -1;
    if (meal.id) return data.meals.findIndex(function (m) { return m && m.id === meal.id; });
    var m = data.meals[meal._i];
    return m && m.items === meal.items && m.kcal === meal.kcal && m.time === meal.time ? meal._i : -1;
  }

  async function removeMeal(date, meal) {
    if (!dbRef) return;
    try {
      await dbTask(async function () {
      var ref = dbRef.doc('days/' + date);
      var snap = await ref.get();
      var data = snap.exists ? snap.data() : null;
      var idx = locateMeal(data, meal);
      if (idx < 0) { toast('Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.'); return; }
      var next = data.meals.slice();
      next.splice(idx, 1);
      await ref.update({ meals: next });
      toast('Eintrag entfernt.');
      });
    } catch (e) {
      toast('Der Eintrag konnte nicht entfernt werden.');
    }
  }

  /* Entwurf einer Mahlzeit: Änderungen werden erst mit Speichern in die Datenbank geschrieben */
  function validTimeOf(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    return m ? pad(Number(m[1])) + ':' + m[2] : '';
  }
  function recomputeMeal(base, parts) {
    var nm = Object.assign({}, base, { parts: parts });
    nm.kcal = parts.reduce(function (s, p) { return s + (Number(p.kcal) || 0); }, 0);
    NUTS.forEach(function (n) {
      var have = parts.filter(function (p) { return p[n.key] != null; });
      if (have.length) nm[n.key] = num(have.reduce(function (s, p) { return s + (Number(p[n.key]) || 0); }, 0), n.dec);
    });
    nm.items = parts.map(partText).join(', ').slice(0, 300);
    var mgl = glOfParts(parts);
    if (mgl != null) nm.gl = round2(mgl); else delete nm.gl;
    return nm;
  }
  /* Eine Zutat im Entwurf ändern: transform bekommt die Zutat und liefert die neue oder einen Fehlertext. */
  function applyEdit(date, meal, part, transform) {
    var d = mealDraft;
    if (!d) { render(true); return; }
    var cur = d.parts[part._pi];
    if (!cur || cur.name !== part.name) {
      toast('Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.');
      render(true);
      return;
    }
    var res = transform(cur);
    if (res.error) { toast(res.error); render(true); return; }
    if (res.remove) d.parts.splice(part._pi, 1); else d.parts[part._pi] = res.part;
    d.dirty = true;
    render(true);
  }

  function commitQty(date, meal, part, old, raw) {
    var q = Number(String(raw).replace(',', '.'));
    if (!(q > 0) || q > 100000) { toast('Bitte eine Menge größer als 0 eingeben.'); render(true); return; }
    q = round2(q);
    if (q === round2(old.qty)) { render(true); return; }
    applyEdit(date, meal, part, function (sp) {
      var o = qtyOf(sp);
      if (!(o.qty > 0)) return { error: 'Für dieses Lebensmittel ist keine Menge gespeichert.' };
      var f = q / o.qty;
      var np = Object.assign({}, sp);
      COLS.forEach(function (c) {
        if (!c.calc && sp[c.key] != null) np[c.key] = num(Number(sp[c.key]) * f, c.dec);
      });
      np.qty = q;
      np.unit = o.unit;
      if (o.unitG) np.unitG = o.unitG;
      np.amount = fmtQty(q) + ' ' + o.unit;
      return { part: np };
    });
  }

  function commitUnit(date, meal, part, old, unit) {
    if (unit === old.unit) { render(true); return; }
    applyEdit(date, meal, part, function (sp) {
      var o = qtyOf(sp);
      var gOld = gramsPer(o.unitG, o.unit), gNew = gramsPer(o.unitG, unit);
      if (!gOld || !gNew || !(o.qty > 0)) {
        return { error: 'Umrechnung nicht möglich: Für dieses Lebensmittel ist kein Gewicht pro ' + unit + ' bekannt.' };
      }
      var np = Object.assign({}, sp);
      np.qty = round2(o.qty * gOld / gNew);
      np.unit = unit;
      if (o.unitG) np.unitG = o.unitG;
      np.amount = fmtQty(np.qty) + ' ' + unit;
      return { part: np };
    });
  }

