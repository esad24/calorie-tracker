  /* Ansicht */
  function renderGLCard(t) {
    var box = $('glcard');
    box.replaceChildren();
    var card = el('div', 'glcard');
    card.append(el('h3', 'gl-title', 'Glykämische Last (Akne-Check)'));
    if (t.gl == null) {
      card.append(el('p', 'note', 'Für die eingetragenen Mahlzeiten gibt es noch keine GI-Werte. Neu geschätzte Mahlzeiten bekommen GI und GL automatisch.'));
      box.append(card);
      return;
    }
    var r = rateDay(t.gl);
    var top = el('div', 'gl-top');
    var pill = el('span', 'rate-pill');
    pill.append(el('span', 'rate-dot r-' + r.k), document.createTextNode(r.label));
    top.append(el('span', 'gl-num', fmtN(t.gl)), pill);
    if (t.gi != null) top.append(el('span', 'gl-sub', 'GI im Schnitt ' + fmtN(t.gi)));
    var bar = el('div', 'gl-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', 'Glykämische Last heute ' + fmtN(t.gl) + ', ' + r.label);
    var zones = el('div', 'gl-zones');
    var zl = el('span', 'z-low'), zm = el('span', 'z-mid'), zh = el('span', 'z-high');
    zl.style.flex = GLT.low + ' 0 0';
    zm.style.flex = (GLT.mid - GLT.low) + ' 0 0';
    zh.style.flex = (GLT.mid * 0.25) + ' 0 0';
    zones.append(zl, zm, zh);
    var mark = el('div', 'gl-mark');
    mark.style.left = Math.min(100, (t.gl / (GLT.mid * 1.25)) * 100) + '%';
    bar.append(zones, mark);
    card.append(top, bar);
    var glLines = ['Tageswert: niedrig bis ' + GLT.low + ', mittel bis ' + GLT.mid + ', hoch darüber (in den Einstellungen änderbar).',
     'GL = GI × Kohlenhydrate / 100, je Lebensmittel.',
     'Die Werte sind Schätzungen.'];
    if (t.glMissing) glLines.push('Einträge ohne GI-Wert sind nicht mitgezählt.');
    card.append(infoEl(glLines, true));
    box.append(card);
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function miniRing(frac, cls, label) {
    var r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac)) * c;
    var svg = sv('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
    svg.append(sv('circle', { class: 'trk', cx: 32, cy: 32, r: r }));
    if (f > 0) svg.append(sv('circle', { class: 'arc ' + cls, cx: 32, cy: 32, r: r, 'stroke-dasharray': f.toFixed(1) + ' ' + c.toFixed(1), transform: 'rotate(-90 32 32)' }));
    var tx = sv('text', { class: 'mid', x: 32, y: 32, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    tx.textContent = label;
    svg.append(tx);
    return svg;
  }
  /* Na links, K rechts (passend zu Na:K): K ist die Scheibe rechts ab 12 Uhr, Na die Fläche links */
  function miniPie(na, k) {
    var svg = sv('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
    var tot = na + k, R = 30;
    if (!(tot > 0)) { svg.append(sv('circle', { class: 'f-empty', cx: 32, cy: 32, r: R })); return svg; }
    var fa = k / tot;
    if (fa <= 0 || fa >= 1) { svg.append(sv('circle', { class: fa >= 1 ? 'f-k' : 'f-na', cx: 32, cy: 32, r: R })); return svg; }
    svg.append(sv('circle', { class: 'f-na', cx: 32, cy: 32, r: R }));
    var ang = fa * 2 * Math.PI;
    var x = 32 + R * Math.sin(ang), y = 32 - R * Math.cos(ang);
    svg.append(sv('path', { class: 'f-k', d: 'M32 32 L32 2 A' + R + ' ' + R + ' 0 ' + (fa > 0.5 ? 1 : 0) + ' 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Z' }));
    return svg;
  }
  function renderHeroStats(t) {
    var box = $('hero-stats');
    function tile(label, graphic, valText, note) {
      var d = el('div', 'mini');
      var dd = el('dd', '', valText);
      if (note) dd.append(note);
      d.append(graphic, el('dt', '', label), dd);
      box.append(d);
    }
    // Protein
    var pn = NUTS.filter(function (n) { return n.key === 'protein'; })[0];
    var pg = Number(t.protein) || 0;
    var pGoal = GOALS.protein > 0 ? GOALS.protein : 0;
    tile('Protein',
      miniRing(pGoal ? pg / pGoal : 0, 'c-acc', pGoal ? Math.round(pg / pGoal * 100) + '%' : '–'),
      fmtNut(pn, pg) + ' g', pGoal ? el('small', '', 'Ziel ' + fmtNut(pn, pGoal) + ' g') : null);
    // Na:K – Salz in g Kochsalz -> Natrium in mg (Salz / 2,5)
    var na = (Number(t.salt) || 0) * 400;
    var k = Number(t.potassium) || 0;
    var naNote = el('small');
    var l1 = el('span'), l2 = el('span');
    l1.append(el('span', 'leg f-na'), document.createTextNode('Na ' + fmtN(na) + ' mg'));
    l2.append(el('span', 'leg f-k'), document.createTextNode('K ' + fmtN(k) + ' mg'));
    l1.style.display = l2.style.display = 'block';
    naNote.append(l1, l2);
    var nak = nakOf(t.salt, t.potassium);
    if (nak != null) { var rl = el('span', '', rateNaK(nak).label); rl.style.display = 'block'; naNote.prepend(rl); }
    tile('Na:K', miniPie(na, k), nak != null ? fmtNaK(nak) : '—', naNote);
    // GL
    if (t.gl != null) {
      var r = rateDay(t.gl);
      var cls = r.k === 'low' ? 'c-good' : r.k === 'mid' ? 'c-warn' : 'c-bad';
      tile('GL', miniRing(t.gl / GLT.mid, cls, fmtN(t.gl)), fmtN(t.gl), el('small', '', r.label + ' · max ' + GLT.mid));
    } else {
      tile('GL', miniRing(0, 'c-good', '–'), '—');
    }
  }
  function setRing(p) {
    var c = 402.1;
    var f = Math.max(0, Math.min(1, p)) * c;
    $('progress-fill').setAttribute('stroke-dasharray', f.toFixed(1) + ' ' + c);
  }
  function renderToday(view, today, day) {
    var box = $('meals');
    var keepMeals = lockMeals() && box.children.length > 0;
    if (!keepMeals) box.replaceChildren();
    var empty = $('meals-empty');
    empty.hidden = true;
    var nuts = $('nuts');
    nuts.replaceChildren();
    $('glcard').replaceChildren();
    $('hero-stats').replaceChildren();
    var hero = $('hero'), prog = $('progress');
    hero.classList.remove('over');
    prog.classList.remove('over');
    setRing(0);
    prog.setAttribute('aria-valuenow', '0');
    prog.setAttribute('aria-valuemax', String(TARGET));
    if (status !== 'ready') {
      $('today-total').textContent = '—';
      $('today-sub').textContent =
        status === 'loading' ? 'Lade dein Protokoll…' :
        status === 'error' ? 'Das Protokoll konnte nicht geladen werden. Lade die Seite neu.' :
        'Speicher ist in dieser Ansicht nicht verfügbar.';
      nuts.append(chips(null));
      return;
    }
    var meals = mealsOf(day);
    var t = dayTotals(day);
    $('today-total').textContent = fmtN(t.kcal);
    setRing(t.kcal / TARGET);
    prog.setAttribute('aria-valuenow', String(Math.round(t.kcal)));
    var left = TARGET - t.kcal;
    var isToday = view === today;
    if (left < 0) { hero.classList.add('over'); prog.classList.add('over'); }
    var sub = $('today-sub');
    sub.replaceChildren(
      el('p', 'kcal-left' + (left < 0 ? ' over' : ''), left >= 0 ? fmtN(left) + ' kcal übrig' : fmtN(-left) + ' kcal drüber'),
      el('p', 'kcal-max', fmtN(TARGET) + ' kcal max')
    );
    var bal = balanceBefore(view);
    if (bal.n > 0) {
      var carry = round50(bal.sum);
      var budget = Math.max(0, TARGET - carry);
      var leftAdj = budget - t.kcal;
      var box2 = el('div', 'kcal-bal');
      box2.append(
        el('p', 'bal-line ' + (carry > 0 ? 'bal-over' : carry < 0 ? 'bal-good' : ''),
          carry === 0 ? 'Saldo: ausgeglichen' :
          'Saldo: ' + fmtN(Math.abs(carry)) + ' kcal ' + (carry < 0 ? 'Defizit' : 'Überschuss')),
        el('p', 'bal-sub', 'Mit Saldo: ' + fmtN(budget) + ' kcal Budget · ' +
          (leftAdj >= 0 ? fmtN(leftAdj) + ' übrig' : fmtN(-leftAdj) + ' drüber'))
      );
      sub.append(box2);
    }
    nuts.append(chips(t));
    if (meals.length > 0) renderHeroStats(t);
    if (meals.length > 0) renderGLCard(t);
    if (meals.length === 0) { empty.hidden = false; return; }
    if (!keepMeals) mealCards(day, view).forEach(function (c) { box.append(c); });
  }

