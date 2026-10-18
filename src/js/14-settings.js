  /* Einstellungen */
  /* grid: which settings group the field appears in */
  var GOAL_FIELDS = [{ key: 'kcal', label: 'Kalorien', unit: 'kcal', dec: 0, grid: 'goal-grid' }].concat(NUTS.map(function (n) {
    return { key: n.key, label: n.label, note: n.max ? 'Maximum' : '', unit: n.key === 'potassium' ? 'g' : n.unit, dec: n.dec, div: n.key === 'potassium' ? 1000 : 0, grid: 'goal-grid' };
  })).concat([
    { key: 'water', label: 'Wasser', unit: 'ml', dec: 0, def: 2500, grid: 'goal-grid' },
    { key: 'glLow', label: 'GL pro Tag: niedrig bis', unit: 'GL', dec: 0, def: 80, grid: 'goal-grid-limits' },
    { key: 'glMid', label: 'GL pro Tag: mittel bis', unit: 'GL', dec: 0, def: 120, grid: 'goal-grid-limits' },
    { key: 'nakGood', label: 'Na:K gut ab', note: '1 : x', unit: 'x', dec: 1, def: 2, grid: 'goal-grid-limits' },
    { key: 'nakMid', label: 'Na:K mittel ab', note: '1 : x', unit: 'x', dec: 1, def: 1, grid: 'goal-grid-limits' },
    { key: 'caffeine', label: 'Koffein', note: 'Maximum pro Tag', unit: 'mg', dec: 0, def: 400, grid: 'goal-grid-caf' },
    { key: 'cafCutoff', label: 'Kein Koffein nach', unit: 'Uhr', dec: 0, def: 15, grid: 'goal-grid-caf' },
    { key: 'weight', label: 'Körpergewicht', unit: 'kg', dec: 1, def: 70, grid: 'goal-grid-caf' }
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
    [['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'Automatisch']].forEach(function (o) {
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
  /* One settings cell per goal: label left, value and unit right; an empty value means no goal */
  function buildGoalGrid() {
    ['goal-grid', 'goal-grid-limits', 'goal-grid-caf'].forEach(function (id) { $(id).replaceChildren(); });
    GOAL_FIELDS.forEach(function (f) {
      var cell = el('label', 'cell');
      cell.htmlFor = 'g-' + f.key;
      var lab = el('span', 'cell-l', f.label);
      if (f.note) lab.append(el('small', null, f.note));
      var inp = el('input', 'cell-in');
      inp.type = 'number';
      inp.id = 'g-' + f.key;
      inp.min = '0';
      inp.step = 'any';
      inp.inputMode = 'decimal';
      inp.placeholder = 'kein';
      doneKey(inp);
      cell.append(lab, inp, el('span', 'cell-u', f.unit));
      $(f.grid).append(cell);
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
  /* Abbrechen, the scrim, Escape and pulling the sheet down all discard unsaved changes; Fertig saves */
  var settingsSheet = sheetCtl($('settings'), {
    keep: true,
    onDismiss: function () {
      $('open-settings').setAttribute('aria-expanded', 'false');
      $('model-tier').value = MODEL_SAVED;
      fillGoalInputs();
    }
  });
  function openSettings() {
    themeDraft = THEME;
    renderThemeSeg();
    $('model-tier').value = MODEL_SAVED;
    fillGoalInputs();
    settingsSheet.body.scrollTop = 0;
    settingsSheet.open();
    $('open-settings').setAttribute('aria-expanded', 'true');
  }
  function closeSettings() { settingsSheet.close('cancel'); }
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
    if (SHEETS.length) return;
    if (e.key === 'ArrowLeft') goTo(addDays(viewKey, -1));
    else if (e.key === 'ArrowRight') goTo(addDays(viewKey, 1));
  });
  /* Swipe between days: clearly horizontal (over 60 px and 1.6x the vertical movement), never from
     fields, wide tables, the chart, history, the preview or an open sheet. A swipe also closes the keyboard. */
  var swipeX = null, swipeY = null;
  document.addEventListener('touchstart', function (e) {
    var tgt = e.target;
    if (e.touches.length !== 1 || SHEETS.length || (tgt && tgt.closest && tgt.closest('textarea,input,select,.tbl-wrap,#chart,#history,.preview,.toast,.sheet-back'))) { swipeX = null; return; }
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (swipeX == null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - swipeX, dy = t.clientY - swipeY;
    swipeX = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    var f = document.activeElement;
    if (f && f.matches && f.matches('input,textarea,select')) f.blur();
    goTo(addDays(viewKey, dx > 0 ? -1 : 1));
  }, { passive: true });

  renderThemeSeg();
  buildGoalGrid();
  $('open-settings').addEventListener('click', openSettings);

