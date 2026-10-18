  /* Wasser: Tagesmenge in ml im Tagesdokument (Feld water) */
  var waterBusy = false;
  function waterGoal() { return GOALS.water > 0 ? GOALS.water : 2500; }
  function fmtL(ml) { return nf(2).format(ml / 1000) + ' L'; }
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

  /* Kaffee: Menge in ml und geschätztes Koffein in mg im Tagesdokument (Felder coffee und caffeine) */
  var coffeeBusy = false;
  var CAF_MAX = 400;
  var CAF_CUT = 15;
  /* Kaffee: 0,4 mg/ml. Cola (Coke Zero): Koffein 9,7 mg, Aspartam ca. 35 mg und Acesulfam-K ca. 12 mg je 100 ml (Schätzwerte). */
  var CAF_COLA = 0.097, ASP_COLA = 0.35, ACE_COLA = 0.12;
  var ADI_KG = 70, ADI_ASP = 40, ADI_ACE = 9;
  var CUPS = [
    { kind: 'coffee', short: '0,1 L Kaffee', ml: 100, mg: 40 },
    { kind: 'coffee', short: '0,25 L Kaffee', ml: 250, mg: 100 },
    { kind: 'cola', short: '0,25 L Cola', ml: 250, mg: 0 },
    { kind: 'cola', short: '0,5 L Cola', ml: 500, mg: 0 }
  ];
  async function addCoffee(date, kind, dml, dmg) {
    if (cafDraft) { toast('Speichere oder verwirf zuerst die Änderungen in der Koffein-Tabelle.'); return; }
    if (!dbRef) return;
    var tapAt = new Date();
    try {
      await dbTask(async function () {
      var ref = dbRef.doc('days/' + date);
      var snap = await ref.get();
      var data = snap.exists ? snap.data() : null;
      var upd;
      if (kind === 'cola') {
        upd = { cola: Math.min(10000, Math.max(0, Math.round((Number(data && data.cola) || 0) + dml))) };
      } else {
        upd = {
          coffee: Math.min(10000, Math.max(0, Math.round((Number(data && data.coffee) || 0) + dml))),
          caffeine: Math.min(5000, Math.max(0, Math.round((Number(data && data.caffeine) || 0) + dmg)))
        };
      }
      /* Protokoll mit Stunde (abgerundet) je Eintrag; Minus entfernt den letzten passenden Eintrag */
      var lg = data && Array.isArray(data.cafLog) ? data.cafLog.slice() : [];
      if (dml > 0) {
        var nowD = tapAt;
        lg.push({ t: pad(nowD.getHours()) + ':' + pad(nowD.getMinutes()), h: nowD.getHours(), k: kind, ml: dml, mg: dmg });
        if (lg.length > 200) lg = lg.slice(lg.length - 200);
      } else {
        for (var li = lg.length - 1; li >= 0; li--) {
          if (lg[li] && lg[li].k === kind && Number(lg[li].ml) === -dml) { lg.splice(li, 1); break; }
        }
      }
      upd.cafLog = lg;
      if (data) await ref.update(upd);
      else await ref.set(Object.assign({ date: date, meals: [] }, upd));
      });
    } catch (e) {
      toast('Der Kaffee konnte nicht gespeichert werden.');
    }
  }
  function renderCoffee(view, day) {
    var box = $('coffee');
    box.replaceChildren();
    var ml = Math.max(0, Number(day && day.coffee) || 0);
    var cmg = Math.max(0, Number(day && day.caffeine) || 0);
    var cola = Math.max(0, Number(day && day.cola) || 0);
    var lmg = cola * CAF_COLA;
    var mg = cmg + lmg;
    var asp = cola * ASP_COLA, ace = cola * ACE_COLA;
    var ready = status === 'ready';
    var over = mg > CAF_MAX;
    var ip = infoPair('Kaffee: 0,4 mg Koffein je ml. Coke Zero: 9,7 mg Koffein, ca. 35 mg Aspartam und ca. 12 mg Acesulfam-K je 100 ml. Alle Werte sind Schätzungen. Richtwert Koffein: bis ' + CAF_MAX + ' mg pro Tag, nicht nach ' + CAF_CUT + ' Uhr. ADI: Aspartam 40, Acesulfam-K 9 mg je kg Körpergewicht.', true);
    var top = el('div', 'water-top');
    top.style.paddingRight = '34px';
    var tv = el('p', 'water-val');
    tv.append(document.createTextNode(ready ? fmtN(Math.round(mg)) : '—'), el('span', 'caf-of', ' / ' + CAF_MAX + ' mg Koffein'));
    var tr = el('div', 'caf-tr');
    if (ready && over) {
      var pill = el('span', 'rate-pill');
      pill.append(el('span', 'rate-dot r-high'), document.createTextNode('Über'));
      tr.append(pill);
    }
    top.append(tv, tr);
    var bar = el('div', 'water-bar stack');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Koffein heute');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(CAF_MAX));
    bar.setAttribute('aria-valuenow', String(Math.round(mg)));
    var scale = Math.max(CAF_MAX, mg);
    var f1 = el('div', 'water-fill coffee');
    f1.style.width = (cmg / scale * 100) + '%';
    var f2 = el('div', 'water-fill cola');
    f2.style.width = (lmg / scale * 100) + '%';
    bar.append(f1, f2);
    /* Koffein ab der Grenzuhrzeit aus dem Protokoll (genaue Uhrzeit je Eintrag steht in cafLog) */
    var lateMg = 0;
    (day && Array.isArray(day.cafLog) ? day.cafLog : []).forEach(function (e) {
      if (!e || (e.k !== 'coffee' && e.k !== 'cola') || !(Number(e.ml) > 0)) return;
      var hh = /^\d{1,2}:\d{2}$/.test(String(e.t || '')) ? Number(String(e.t).split(':')[0]) : Number(e.h);
      if (!(hh >= CAF_CUT && hh <= 23)) return;
      lateMg += e.k === 'cola' ? Number(e.ml) * CAF_COLA : Math.max(0, Number(e.mg) || 0);
    });
    if (ready && lateMg > 0) {
      var lp = el('span', 'rate-pill');
      lp.append(el('span', 'rate-dot r-high'), document.createTextNode('Ab ' + CAF_CUT + ' Uhr: ' + fmtN(Math.round(lateMg)) + ' mg'));
      tr.append(lp);
    }
    var capLine = el('p', 'sweet-line', 'Ziel: kein Koffein nach ' + CAF_CUT + ' Uhr' + '');
    var tiles = el('div', 'caf-tiles');
    function tile(dot, label, val, sub, wide) {
      var t = el('div', 'caf-tile' + (wide ? ' wide' : ''));
      var l = el('div', 't-l');
      if (dot) { var d = el('span', 'dot-c'); d.style.background = dot; l.append(d); }
      l.append(document.createTextNode(label));
      t.append(l, el('div', 't-v', val));
      if (sub) t.append(el('div', 't-s', sub));
      tiles.append(t);
    }
    tile('#8A5A2B', 'Kaffee', ready ? fmtN(ml) + ' ml' : '—', ready ? fmtN(Math.round(cmg)) + ' mg Koffein' : '');
    tile('var(--over)', 'Cola', ready ? fmtN(cola) + ' ml' : '—', ready ? fmtN(Math.round(lmg)) + ' mg Koffein' : '');
    var btns = el('div', 'caf-grid');
    CUPS.forEach(function (c) {
      btns.append(splitBtn(c.kind, c.short, ready,
        function () { addCoffee(view, c.kind, -c.ml, -c.mg); },
        function () { addCoffee(view, c.kind, c.ml, c.mg); }));
    });
    box.append(ip[0], top, ip[1], bar, capLine, tiles, btns);
  }


