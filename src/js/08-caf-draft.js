  /* Koffein-Tabelle: Einträge mit Uhrzeit (Feld cafLog), Summen in coffee, caffeine und cola */
  var cafEditKey = null;
  function cafTime(e) {
    if (/^\d{1,2}:\d{2}$/.test(String(e.t || ''))) { var q = String(e.t).split(':'); return pad(Number(q[0])) + ':' + q[1]; }
    return pad(Math.max(0, Math.min(23, Math.floor(Number(e.h) || 0)))) + ':00';
  }
  function cafRows(day) {
    var raw = day && Array.isArray(day.cafLog) ? day.cafLog : [];
    var rows = [];
    raw.forEach(function (e, i) {
      if (!e || (e.k !== 'coffee' && e.k !== 'cola') || !(Number(e.ml) > 0)) return;
      var ml = Number(e.ml);
      rows.push({ _i: i, k: e.k, ml: ml, mg: e.k === 'cola' ? ml * CAF_COLA : Math.max(0, Number(e.mg) || 0), t: cafTime(e) });
    });
    rows.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : a._i - b._i; });
    var cml = 0, cmg = 0, lml = 0;
    rows.forEach(function (r) { if (r.k === 'cola') lml += r.ml; else { cml += r.ml; cmg += r.mg; } });
    var tc = Math.max(0, Number(day && day.coffee) || 0), tg = Math.max(0, Number(day && day.caffeine) || 0), tl = Math.max(0, Number(day && day.cola) || 0);
    var un = [];
    if (tc - cml > 0 || tg - cmg > 0) un.push({ untimed: true, k: 'coffee', ml: Math.max(0, tc - cml), mg: Math.max(0, tg - cmg) });
    if (tl - lml > 0) un.push({ untimed: true, k: 'cola', ml: tl - lml, mg: (tl - lml) * CAF_COLA });
    return { rows: un.concat(rows), totalMl: tc + tl, totalMg: tg + tl * CAF_COLA };
  }
  function cafStateFrom(day, date) {
    return {
      date: date,
      coffee: Number(day && day.coffee) || 0,
      caffeine: Number(day && day.caffeine) || 0,
      cola: Number(day && day.cola) || 0,
      log: day && Array.isArray(day.cafLog) ? day.cafLog.map(function (e) { return e && typeof e === 'object' ? Object.assign({}, e) : e; }) : [],
      dirty: false
    };
  }
  /* Änderung im Entwurf der Koffein-Tabelle; geschrieben wird erst mit Speichern */
  function editCaf(date, mutate) {
    var st = cafDraft;
    if (!st || st.date !== date) { afterTap(renderCommit); return; }
    var err = mutate(st);
    if (err) { toast(err); afterTap(renderCommit); return; }
    function cl(v, mx) { return Math.min(mx, Math.max(0, Math.round(v))); }
    st.coffee = cl(st.coffee, 10000);
    st.caffeine = cl(st.caffeine, 5000);
    st.cola = cl(st.cola, 10000);
    if (st.log.length > 200) st.log = st.log.slice(-200);
    st.dirty = true;
    afterTap(renderCommit);
  }
  async function saveCafDraft() {
    var d = cafDraft;
    if (!d || !dbRef || coffeeBusy) return;
    coffeeBusy = true;
    var ok = false;
    try {
      await dbTask(async function () {
      var ref = dbRef.doc('days/' + d.date);
      var snap = await ref.get();
      var upd = { coffee: d.coffee, caffeine: d.caffeine, cola: d.cola, cafLog: d.log };
      if (snap.exists) await ref.update(upd);
      else await ref.set(Object.assign({ date: d.date, meals: [] }, upd));
      });
      ok = true;
      toast('Koffein gespeichert.');
    } catch (e) {
      toast('Die Änderungen konnten nicht gespeichert werden.');
    }
    if (ok) { cafDraft = null; cafEditKey = null; }
    coffeeBusy = false;
    render(true);
  }
  function cafFoot(date) {
    var foot = el('div', 'row mc-foot');
    var sv = el('button', 'btn', 'Speichern');
    sv.type = 'button';
    sv.addEventListener('click', function () { sv.disabled = true; sv.textContent = 'Speichert …'; saveCafDraft(); });
    var cn = el('button', 'btn ghost', 'Abbrechen');
    cn.type = 'button';
    cn.addEventListener('click', function () { cafEditKey = null; cafDraft = null; render(true); });
    foot.append(sv, cn);
    return foot;
  }
  function cafContrib(st, e, sign) {
    if (e.k === 'cola') st.cola += sign * Number(e.ml);
    else { st.coffee += sign * Number(e.ml); st.caffeine += sign * (Number(e.mg) || 0); }
  }
  function cafCheck(st, r) {
    var e = st.log[r._i];
    return e && e.k === r.k && Number(e.ml) === r.ml ? e : null;
  }
  function cafUntimedNow(st, k) {
    var ml = 0, mg = 0;
    st.log.forEach(function (e) {
      if (!e || e.k !== k) return;
      ml += Number(e.ml) || 0;
      if (k === 'coffee') mg += Number(e.mg) || 0;
    });
    return k === 'cola' ? { ml: Math.max(0, st.cola - ml), mg: 0 } : { ml: Math.max(0, st.coffee - ml), mg: Math.max(0, st.caffeine - mg) };
  }
  function cafInput(id, label, value, onChange) {
    var inp = el('input', 'n-in');
    inp.type = 'number';
    inp.step = '1';
    inp.min = '0';
    inp.inputMode = 'numeric';
    inp.id = id;
    inp.value = String(Math.round(value));
    inp.setAttribute('aria-label', label);
    doneKey(inp);
    inp.addEventListener('change', function () {
      var v = Number(String(inp.value).replace(',', '.'));
      if (isNaN(v) || v < 0 || v > 5000) { toast('Bitte eine Zahl zwischen 0 und 5000 eingeben.'); render(true); return; }
      onChange(Math.round(v));
    });
    return inp;
  }
