  /* Koffein-Tabelle: Ansicht und Bearbeitung der Einträge (Entwurf siehe 08-caf-draft.js) */
  function renderCafTable(date, day) {
    var box = $('caf-table');
    if (lockCaf(date) && box.children.length) return;
    box.replaceChildren();
    var ready = status === 'ready';
    var edit = cafEditKey === date;
    if (edit && (!cafDraft || cafDraft.date !== date)) cafDraft = cafStateFrom(day, date);
    var info = cafRows(edit ? { coffee: cafDraft.coffee, caffeine: cafDraft.caffeine, cola: cafDraft.cola, cafLog: cafDraft.log } : day);
    var card = el('article', 'meal-card');
    var head = el('div', 'mc-head');
    var pen = iconBtn('pencil', edit ? 'Bearbeiten beenden' : 'Koffein bearbeiten', edit ? 'on' : '');
    pen.disabled = !ready;
    pen.addEventListener('click', function () { cafEditKey = edit ? null : date; cafDraft = null; render(true); });
    var plus = iconBtn('plus', 'Eintrag hinzufügen', '');
    plus.disabled = !ready;
    plus.addEventListener('click', function () {
      var d = new Date();
      var ne = { t: pad(d.getHours()) + ':' + pad(d.getMinutes()), h: d.getHours(), k: 'coffee', ml: 250, mg: 100 };
      cafEditKey = date;
      editCaf(date, function (st) { st.log.push(ne); cafContrib(st, ne, 1); }, 'Eintrag hinzugefügt. Passe Uhrzeit und Menge an.');
    });
    var left = el('div', 'mc-left');
    left.append(el('span', 'mc-time', 'Koffein'), el('span', 'mc-count', info.rows.length + (info.rows.length === 1 ? ' Eintrag' : ' Einträge')));
    var acts = el('div', 'mc-actions');
    if (edit) acts.append(plus);
    acts.append(pen);
    head.append(left, el('span', 'mc-kcal', ready ? fmtN(Math.round(info.totalMg)) + ' mg' : '—'), acts);
    card.append(head);
    if (!info.rows.length) {
      var emp = el('p', 'note', ready ? 'Noch kein Kaffee oder Cola eingetragen. Tippe auf den Stift, um einen Eintrag hinzuzufügen.' : 'Lade…');
      emp.style.padding = '0 16px 14px';
      card.append(emp);
      if (edit) card.append(cafFoot(date));
      box.append(card);
      return;
    }
    var wrap = el('div', 'tbl-wrap');
    wrap.setAttribute('data-k', 'caf-' + date);
    var tbl = el('table', 'ntable ctable');
    var thd = document.createElement('thead');
    var htr = el('tr');
    [['Uhrzeit', 'cl'], ['Getränk', 'cl'], ['Menge (ml)', ''], ['Koffein (mg)', ''], ['', '']].forEach(function (h) {
      var th = el('th', h[1] === 'cl' ? 'c-name' : '', h[0]);
      th.scope = 'col';
      if (h[1] === 'cl') th.style.paddingLeft = '16px';
      htr.append(th);
    });
    thd.append(htr);
    var body = document.createElement('tbody');
    info.rows.forEach(function (r, ri) {
      var tr = el('tr');
      var idb = 'c-' + date + '-' + (r.untimed ? 'u' + r.k : r._i);
      /* Uhrzeit */
      var tdT = el('td', 'cl');
      var late = !r.untimed && Number(r.t.split(':')[0]) >= CAF_CUT;
      if (edit) {
        var ti = el('input', 'n-in t-in');
        ti.type = 'time';
        ti.id = idb + '-t';
        ti.value = r.untimed ? '' : r.t;
        ti.setAttribute('aria-label', 'Uhrzeit');
        /* Der Entwurf wird sofort still angepasst (ohne Neuzeichnen), sonst schließt das Uhrzeit-Popup.
           Neu gezeichnet und sortiert wird erst beim Verlassen des Feldes. */
        var tDirty = false, pushed = null;
        ti.addEventListener('change', function () {
          var m = /^(\d{1,2}):(\d{2})$/.exec(ti.value);
          if (!m || !cafDraft || cafDraft.date !== date) return;
          var tt = pad(Number(m[1])) + ':' + m[2], hh = Number(m[1]);
          var st = cafDraft;
          if (r.untimed) {
            if (pushed) { pushed.t = tt; pushed.h = hh; }
            else {
              var rem = cafUntimedNow(st, r.k);
              if (!(rem.ml > 0)) return;
              pushed = { t: tt, h: hh, k: r.k, ml: Math.round(rem.ml), mg: Math.round(rem.mg) };
              st.log.push(pushed);
            }
          } else {
            var e = cafCheck(st, r);
            if (!e) return;
            e.t = tt; e.h = hh;
          }
          st.dirty = true;
          tDirty = true;
        });
        ti.addEventListener('blur', function () { setTimeout(function () { if (tDirty && document.activeElement !== ti) { tDirty = false; render(true); } }, 350); });
        tdT.append(ti);
      } else {
        if (late) tdT.append(el('span', 'rate-dot r-high'));
        tdT.append(document.createTextNode(r.untimed ? 'ohne Uhrzeit' : r.t));
        if (late) tdT.title = 'Nach ' + CAF_CUT + ' Uhr';
      }
      /* Getränk */
      var tdK = el('td', 'cl');
      if (edit && !r.untimed) {
        var ks = el('select', 'u-sel k-sel');
        ks.id = idb + '-k';
        ks.setAttribute('aria-label', 'Getränk');
        [['coffee', 'Kaffee'], ['cola', 'Cola']].forEach(function (o) {
          var op = el('option', null, o[1]);
          op.value = o[0];
          if (o[0] === r.k) op.selected = true;
          ks.append(op);
        });
        ks.addEventListener('change', function () {
          var nk = ks.value;
          editCaf(date, function (st) {
            var e = cafCheck(st, r);
            if (!e) return 'Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.';
            cafContrib(st, e, -1);
            e.k = nk;
            e.mg = nk === 'cola' ? 0 : Math.round(Number(e.ml) * 0.4);
            cafContrib(st, e, 1);
          }, 'Gespeichert.');
        });
        tdK.append(ks);
      } else {
        var dt = el('span', 'dot-c');
        dt.style.background = r.k === 'cola' ? 'var(--over)' : '#8A5A2B';
        dt.style.display = 'inline-block';
        dt.style.marginRight = '8px';
        tdK.append(dt, document.createTextNode(r.k === 'cola' ? 'Cola' : 'Kaffee'));
      }
      /* Menge */
      var tdM = el('td', 'num');
      if (edit && !r.untimed) {
        tdM.append(cafInput(idb + '-ml', 'Menge in ml', r.ml, function (v) {
          if (!(v > 0)) { toast('Die Menge muss größer als 0 sein.'); render(true); return; }
          editCaf(date, function (st) {
            var e = cafCheck(st, r);
            if (!e) return 'Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.';
            cafContrib(st, e, -1);
            e.ml = v;
            e.mg = e.k === 'cola' ? 0 : Math.round(v * 0.4);
            cafContrib(st, e, 1);
          }, 'Gespeichert.');
        }));
      } else tdM.textContent = fmtN(r.ml);
      /* Koffein */
      var tdG = el('td', 'num');
      if (edit && !r.untimed && r.k === 'coffee') {
        tdG.append(cafInput(idb + '-mg', 'Koffein in mg', r.mg, function (v) {
          editCaf(date, function (st) {
            var e = cafCheck(st, r);
            if (!e) return 'Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.';
            cafContrib(st, e, -1);
            e.mg = v;
            cafContrib(st, e, 1);
          }, 'Gespeichert.');
        }));
      } else tdG.textContent = (r.k === 'cola' ? '≈ ' : '') + fmtN(Math.round(r.mg));
      /* Löschen */
      var tdA = el('td', 'act');
      if (edit) {
        var del = iconBtn('trash', 'Eintrag entfernen', 'row-del');
        confirmTap(del, function () {
          del.disabled = true;
          var snapshot = cafDraft ? JSON.parse(JSON.stringify(cafDraft)) : null;
          undoToast('Eintrag entfernt.', function () {
            if (snapshot && cafDraft && cafDraft.date === snapshot.date) { cafDraft = snapshot; render(true); }
          });
          editCaf(date, function (st) {
            if (r.untimed) {
              var rem = cafUntimedNow(st, r.k);
              if (r.k === 'cola') st.cola -= rem.ml; else { st.coffee -= rem.ml; st.caffeine -= rem.mg; }
            } else {
              var e = cafCheck(st, r);
              if (!e) return 'Der Eintrag hat sich geändert. Lade die Seite neu und versuche es erneut.';
              cafContrib(st, e, -1);
              st.log.splice(r._i, 1);
            }
          });
        }, 'Eintrag löschen?', 'Menge und Koffein werden vom Tag abgezogen.');
        tdA.append(del);
      }
      tr.append(tdT, tdK, tdM, tdG, tdA);
      body.append(tr);
    });
    if (info.rows.length > 1) {
      var sr = el('tr', 'sum');
      var th0 = el('th', 'c-name', 'Gesamt');
      th0.scope = 'row';
      th0.style.paddingLeft = '16px';
      sr.append(th0, el('td'), el('td', 'num', fmtN(info.totalMl)), el('td', 'num', fmtN(Math.round(info.totalMg))), el('td', 'act'));
      body.append(sr);
    }
    tbl.append(thd, body);
    wrap.append(tbl);
    card.append(wrap);
    var colaMl = 0;
    info.rows.forEach(function (r) { if (r.k === 'cola') colaMl += r.ml; });
    var aspT = colaMl * ASP_COLA, aceT = colaMl * ACE_COLA;
    var adiT = Math.max(aspT / (ADI_ASP * ADI_KG), aceT / (ADI_ACE * ADI_KG)) * 100;
    var sw = el('p', 'sweet-line', 'Süßungsmittel ca. ' + fmtN(Math.round(aspT + aceT)) + ' mg · Aspartam ' + fmtN(Math.round(aspT)) + ' · Acesulfam-K ' + fmtN(Math.round(aceT)) + ' · ' + fmtN(Math.round(adiT)) + ' % ADI (' + ADI_KG + ' kg)');
    sw.style.padding = '10px 16px 12px';
    card.append(sw);
    if (edit) card.append(cafFoot(date));
    box.append(card);
  }

