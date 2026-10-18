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
