  /* Einstellungen */
  var GOAL_FIELDS = [{ key: 'kcal', label: 'Kalorien', unit: 'kcal', dec: 0 }].concat(NUTS.map(function (n) {
    return { key: n.key, label: n.label + (n.max ? ' (Maximum)' : ''), unit: n.key === 'potassium' ? 'g' : n.unit, dec: n.dec, div: n.key === 'potassium' ? 1000 : 0 };
  })).concat([
    { key: 'water', label: 'Wasser', unit: 'ml', dec: 0, def: 2500 },
    { key: 'glLow', label: 'GL pro Tag: niedrig bis', unit: 'GL', dec: 0, def: 80 },
    { key: 'glMid', label: 'GL pro Tag: mittel bis', unit: 'GL', dec: 0, def: 120 },
    { key: 'caffeine', label: 'Koffein (Maximum)', unit: 'mg', dec: 0, def: 400 },
    { key: 'weight', label: 'Körpergewicht', unit: 'kg', dec: 1, def: 70 },
    { key: 'cafCutoff', label: 'Kein Koffein nach (Uhr)', unit: 'Uhr', dec: 0, def: 15 },
    { key: 'nakGood', label: 'Na:K gut ab (1 : x)', unit: 'x', dec: 1, def: 2 },
    { key: 'nakMid', label: 'Na:K mittel ab (1 : x)', unit: 'x', dec: 1, def: 1 }
  ]);
  var themeDraft = 'dark';
  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', THEME === 'system' ? systemTheme() : THEME);
  }
  function renderThemeSeg() {
    var seg = $('theme-seg');
    seg.replaceChildren();
    [['dark', 'Dunkel'], ['light', 'Hell'], ['system', 'System']].forEach(function (o) {
      var b = el('button', null, o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(themeDraft === o[0]));
      b.addEventListener('click', function () {
        themeDraft = o[0];
        renderThemeSeg();
      });
      seg.append(b);
    });
  }
  function buildGoalGrid() {
    var grid = $('goal-grid');
    grid.replaceChildren();
    GOAL_FIELDS.forEach(function (f) {
      var wrap = el('div', 'goal');
      var lab = el('label', null, f.label + ' (' + f.unit + ')');
      lab.htmlFor = 'g-' + f.key;
      var inp = el('input');
      inp.type = 'number';
      inp.id = 'g-' + f.key;
      inp.min = '0';
      inp.step = 'any';
      inp.inputMode = 'decimal';
      wrap.append(lab, inp);
      grid.append(wrap);
    });
  }
  function fillGoalInputs() {
    GOAL_FIELDS.forEach(function (f) {
      var v = f.key === 'kcal' ? TARGET : f.def ? (GOALS[f.key] > 0 ? GOALS[f.key] : f.def) : GOALS[f.key];
      if (f.div && v > 0) v = v / f.div;
      $('g-' + f.key).value = v > 0 ? String(v) : '';
    });
    $('g-bal').value = String(round50(balanceBefore(keyOf(new Date())).sum));
    $('g-bal').step = '50';
  }
  function sanitizeGoals(d) {
    var out = {};
    GOAL_FIELDS.forEach(function (f) {
      var v = Number(d && d[f.key]);
      if (v > 0 && v <= 100000) out[f.key] = (f.key === 'potassium' && v < 50) ? v * 1000 : v;
    });
    var bv = Number(d && d.balVal);
    if (d && typeof d.balFrom === 'string' && KEY.test(d.balFrom) && isFinite(bv) && Math.abs(bv) <= 1000000) {
      out.balFrom = d.balFrom;
      out.balVal = Math.round(bv);
    }
    return out;
  }
  function applyGoals() {
    TARGET = GOALS.kcal > 0 ? GOALS.kcal : 2100;
    var lo = GOALS.glLow > 0 ? GOALS.glLow : 80, mi = GOALS.glMid > 0 ? GOALS.glMid : 120;
    if (mi <= lo) { lo = 80; mi = 120; }
    GLT.low = lo; GLT.mid = mi;
    CAF_MAX = GOALS.caffeine > 0 ? GOALS.caffeine : 400;
    ADI_KG = GOALS.weight > 0 ? GOALS.weight : 70;
    CAF_CUT = GOALS.cafCutoff >= 1 && GOALS.cafCutoff <= 23 ? Math.round(GOALS.cafCutoff) : 15;
    var ng = GOALS.nakGood > 0 ? GOALS.nakGood : 2, nm = GOALS.nakMid > 0 ? GOALS.nakMid : 1;
    if (nm >= ng) { ng = 2; nm = 1; }
    NAK.good = ng; NAK.mid = nm;
  }
  async function saveGoals() {
    if (!dbRef || busy) { toast('Speichern ist in dieser Ansicht nicht verfügbar.'); return false; }
    var out = {}, bad = false;
    GOAL_FIELDS.forEach(function (f) {
      var raw = $('g-' + f.key).value.trim().replace(',', '.');
      if (!raw) return;
      var v = Number(raw);
      if (!(v > 0) || v > 100000) { bad = true; return; }
      out[f.key] = f.div ? Math.round(v * f.div) : num(v, f.dec);
    });
    if (bad) { toast('Bitte nur Zahlen größer als 0 eingeben.'); return false; }
    if (!out.kcal) { toast('Bitte ein Kalorienziel eingeben.'); return false; }
    var glLo = out.glLow || 80, glMi = out.glMid || 120;
    if (glMi <= glLo) { toast('Bei der GL muss „mittel bis“ größer sein als „niedrig bis“.'); return false; }
    if ((out.nakMid || 1) >= (out.nakGood || 2)) { toast('Bei Na:K muss „gut ab“ größer sein als „mittel ab“.'); return false; }
    if (out.cafCutoff && (out.cafCutoff < 1 || out.cafCutoff > 23)) { toast('Die Uhrzeit für Koffein muss zwischen 1 und 23 liegen.'); return false; }
    // Saldo: nur neu verankern, wenn der Wert geändert wurde; sonst bestehende Verankerung behalten.
    if (GOALS.balFrom) { out.balFrom = GOALS.balFrom; out.balVal = GOALS.balVal; }
    var balRaw = $('g-bal').value.trim().replace(',', '.');
    if (balRaw) {
      var bal = Number(balRaw);
      if (!isFinite(bal) || Math.abs(bal) > 1000000) { toast('Bitte beim Saldo eine gültige Zahl eingeben.'); return false; }
      bal = round50(bal);
      var todayK = keyOf(new Date());
      if (bal !== round50(balanceBefore(todayK).sum)) { out.balVal = bal; out.balFrom = todayK; }
    }
    var ok = false;
    setBusy(true);
    try {
      await dbTask(function () { return dbRef.doc('settings/goals').set(out); });
      ok = true;
    } catch (e) {
      toast('Die Einstellungen konnten nicht gespeichert werden.');
    }
    setBusy(false);
    return ok;
  }
  function openSettings() {
    themeDraft = THEME;
    renderThemeSeg();
    $('model-tier').value = MODEL_SAVED;
    fillGoalInputs();
    $('settings').hidden = false;
    $('open-settings').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    $('save-goals').focus();
  }
  function closeSettings() {
    $('settings').hidden = true;
    $('open-settings').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    $('model-tier').value = MODEL_SAVED;
    fillGoalInputs();
  }
  async function saveSettings() {
    if (dbRef) {
      var ok = await saveGoals();
      if (!ok) return;
    }
    THEME = themeDraft;
    MODEL_SAVED = $('model-tier').value;
    try {
      localStorage.setItem('calorie-log-theme', THEME);
      localStorage.setItem('calorie-log-model', MODEL_SAVED);
    } catch (e) {}
    applyTheme();
    closeSettings();
    toast('Einstellungen gespeichert.');
  }

  /* Bedienung */
  $('prev').addEventListener('click', function () { goTo(addDays(viewKey, -1)); });
  $('next').addEventListener('click', function () { goTo(addDays(viewKey, 1)); });
  $('daylabel').addEventListener('click', function () { goTo(keyOf(new Date())); });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.closest && e.target.closest('textarea,input,select')) return;
    if (!$('settings').hidden) return;
    if (e.key === 'ArrowLeft') goTo(addDays(viewKey, -1));
    else if (e.key === 'ArrowRight') goTo(addDays(viewKey, 1));
  });
  var swipeX = null, swipeY = null;
  document.addEventListener('touchstart', function (e) {
    var tgt = e.target;
    if (e.touches.length !== 1 || (tgt && tgt.closest && tgt.closest('textarea,input,select,.tbl-wrap,#chart,#history,.preview,.toast,#settings'))) { swipeX = null; return; }
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (swipeX == null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - swipeX, dy = t.clientY - swipeY;
    swipeX = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goTo(addDays(viewKey, dx > 0 ? -1 : 1));
  }, { passive: true });

  renderThemeSeg();
  buildGoalGrid();
  $('open-settings').addEventListener('click', openSettings);
  $('settings').addEventListener('click', function (e) { if (e.target === $('settings')) closeSettings(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('settings').hidden) closeSettings(); });

