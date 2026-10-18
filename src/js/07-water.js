/* Wasser: Tagesmenge in ml im Tagesdokument (Feld water) */
var waterBusy = false;
function waterGoal() { return GOALS.water > 0 ? GOALS.water : 2500; }
function fmtL(ml) { return (ml / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + ' L'; }
async function addWater(date, delta) {
  if (!dbRef) return;
  try {
    await dbTask(async function () {
    var ref = dbRef.doc('days/' + date);
    var snap = await ref.get();
    var data = snap.exists ? snap.data() : null;
    var cur = Math.max(0, Number(data && data.water) || 0);
    var next = Math.min(20000, Math.max(0, Math.round(cur + delta)));
    if (data) await ref.update({ water: next });
    else await ref.set({ date: date, meals: [], water: next });
    });
  } catch (e) {
    toast('Das Wasser konnte nicht gespeichert werden.');
  }
}
function renderWater(view, day) {
  var box = $('water');
  box.replaceChildren();
  var ml = Math.max(0, Number(day && day.water) || 0);
  var goal = waterGoal();
  var ready = status === 'ready';
  var top = el('div', 'water-top');
  top.append(el('p', 'water-val', ready ? fmtL(ml) + ' von ' + fmtL(goal) : '—'));
  if (ready && ml >= goal) {
    var pill = el('span', 'rate-pill');
    pill.append(el('span', 'rate-dot r-low'), document.createTextNode('Ziel erreicht'));
    top.append(pill);
  }
  var bar = el('div', 'water-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Wasser heute');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(goal));
  bar.setAttribute('aria-valuenow', String(ml));
  var fill = el('div', 'water-fill' + (ml >= goal ? ' done' : ''));
  fill.style.width = Math.min(100, ml / goal * 100) + '%';
  bar.append(fill);
  var btns = el('div', 'caf-grid three');
  [[100, '0,1 L'], [250, '0,25 L'], [500, '0,5 L']].forEach(function (o) {
    btns.append(splitBtn('water', o[1], ready,
      function () { addWater(view, -o[0]); },
      function () { addWater(view, o[0]); }));
  });
  box.append(top, bar, btns);
  var hw = $('hero-water');
  hw.replaceChildren();
  if (ready) {
    var hbar = el('div', 'hw-bar');
    var hfill = el('div', 'hw-fill' + (ml >= goal ? ' done' : ''));
    hfill.style.width = Math.min(100, ml / goal * 100) + '%';
    hbar.append(hfill);
    hw.append(el('span', 'hw-label', 'Wasser ' + fmtL(ml) + ' / ' + fmtL(goal)), hbar);
  }
}

/* Gemeinsamer − | + Knopf für Wasser, Kaffee und Cola */
function splitBtn(cls, label, ready, onMinus, onPlus) {
  var sp = el('div', 'split ' + cls);
  var m = el('button', 'sp-minus');
  m.type = 'button';
  m.disabled = !ready;
  m.setAttribute('aria-label', label + ' entfernen');
  m.addEventListener('click', onMinus);
  var p = el('button', 'sp-plus');
  p.append(el('span', 'sp-sign'), el('span', 'sp-lbl', label));
  p.type = 'button';
  p.disabled = !ready;
  p.setAttribute('aria-label', label + ' hinzufügen');
  p.addEventListener('click', onPlus);
  sp.append(m, p);
  return sp;
}

/* Info-Symbol: Beschreibungen erscheinen erst nach Tippen auf das i */
function infoPair(content, corner) {
  var b = el('button', 'info-btn' + (corner ? ' corner' : ''), 'i');
  b.type = 'button';
  b.setAttribute('aria-label', 'Info anzeigen');
  b.setAttribute('aria-expanded', 'false');
  var t = el('p', 'note info-text');
  (Array.isArray(content) ? content : [content]).forEach(function (s) {
    var l = el('span', '', s);
    l.style.display = 'block';
    t.append(l);
  });
  t.hidden = true;
  b._t = t;
  return [b, t];
}
function infoEl(content, corner) {
  var p = infoPair(content, corner);
  var w = el('div', corner ? 'info c' : 'info');
  w.append(p[0], p[1]);
  return w;
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest ? e.target.closest('.info-btn') : null;
  if (!b) return;
  var t = b._t || b.nextElementSibling;
  if (!t) return;
  t.hidden = !t.hidden;
  b.setAttribute('aria-expanded', t.hidden ? 'false' : 'true');
});
