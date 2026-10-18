  function renderChart(today, byDate) {
    var N = 30, W = 600, H = 220, L = 44, R = 8, T = 12, B = 28;
    var host = $('chart');
    host.replaceChildren();
    if (status !== 'ready') {
      $('avg7').textContent = '—';
      $('logged').textContent = '—';
      $('readout').textContent = '';
      return;
    }
    var base = parseKey(today);
    var keys = [];
    for (var i = N - 1; i >= 0; i--) {
      var d = new Date(base);
      d.setDate(d.getDate() - i);
      keys.push(keyOf(d));
    }
    var vals = keys.map(function (k) { return byDate.has(k) ? totalOf(byDate.get(k)) : null; });
    var max = Math.max.apply(null, [0, TARGET].concat(vals.filter(function (v) { return v != null; })));
    var step = max <= 2500 ? 500 : 1000;
    var top = Math.max(step * 2, Math.ceil(max / step) * step);
    var ph = H - T - B, slot = (W - L - R) / N, bw = slot * 0.68;
    function y(v) { return T + ph * (1 - v / top); }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'group',
      'aria-label': 'Kalorien pro Tag der letzten 30 Tage mit Linie beim Tagesbedarf von ' + fmtN(TARGET)
    });

    var hits = [];
    keys.forEach(function (k, i) {
      var v = vals[i];
      var hit = svgEl('rect', {
        x: L + i * slot, y: T, width: slot, height: ph, class: 'hit', tabindex: '0',
        'aria-label': fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + (v ? fmtN(v) + ' Kilokalorien' : 'nichts eingetragen')
      });
      ['mouseenter', 'click', 'focus'].forEach(function (ev) {
        hit.addEventListener(ev, function () { select(i); });
      });
      hits.push(hit);
      svg.append(hit);
    });

    for (var t = 0; t <= top; t += step) {
      svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: 'grid', 'pointer-events': 'none' }));
      var lab = svgEl('text', { x: L - 8, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' });
      lab.textContent = fmtN(t);
      svg.append(lab);
    }

    keys.forEach(function (k, i) {
      var x = L + i * slot + (slot - bw) / 2, v = vals[i];
      var r;
      if (!v) {
        r = svgEl('rect', { x: x, y: y(0) - 2, width: bw, height: 2, rx: 1, class: 'bar-empty' });
      } else {
        var cls = v > TARGET ? 'bar-over' : (i === N - 1 ? 'bar bar-today' : 'bar');
        r = svgEl('rect', { x: x, y: y(v), width: bw, height: y(0) - y(v), rx: 2, class: cls });
      }
      r.setAttribute('pointer-events', 'none');
      svg.append(r);
    });

    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(TARGET), y2: y(TARGET), class: 'target', 'pointer-events': 'none' }));
    var tl = svgEl('text', { x: L + 4, y: y(TARGET) - 5, class: 'tick', 'text-anchor': 'start', 'pointer-events': 'none' });
    tl.textContent = 'Tagesbedarf ' + fmtN(TARGET);
    svg.append(tl);

    for (var j = N - 1; j >= 0; j -= 7) {
      var xl = svgEl('text', { x: L + j * slot + slot / 2, y: H - 8, class: 'tick', 'text-anchor': 'middle' });
      xl.textContent = fmtDate(keys[j], { day: 'numeric', month: 'short' });
      svg.append(xl);
    }
    host.append(svg);

    function select(i) {
      hits.forEach(function (h, n) { h.classList.toggle('sel', n === i); });
      selectedKey = keys[i];
      var v = vals[i];
      $('readout').textContent = fmtDate(keys[i], { weekday: 'short', day: 'numeric', month: 'short' }) +
        ' · ' + (v ? fmtN(v) + ' kcal' : 'nichts eingetragen');
    }
    var si = selectedKey ? keys.indexOf(selectedKey) : -1;
    if (si >= 0) select(si); else $('readout').textContent = 'Tippe auf einen Balken, um den Tag zu sehen.';

    var past = [];
    for (var n = 1; n <= 7; n++) {
      var kk = keys[N - 1 - n];
      var tot = byDate.has(kk) ? totalOf(byDate.get(kk)) : 0;
      if (tot > 0) past.push(tot);
    }
    $('avg7').textContent = past.length
      ? fmtN(past.reduce(function (a, b) { return a + b; }, 0) / past.length) + ' kcal'
      : '—';
    $('logged').textContent = String(days.filter(function (dd) { return mealsOf(dd).length > 0; }).length);
  }

  /* Earlier days: 60 at a time (more load as you scroll near the end). A day's tables are built only
     when it is opened, so a long history costs a list of summaries, not hundreds of wide tables. */
  var HIST_PAGE = 60, histLimit = HIST_PAGE, moreObserver = null;
  function renderHistory(today) {
    var box = $('history');
    if (lockMeals(true) && box.children.length) return;
    box.replaceChildren();
    if (moreObserver) moreObserver.disconnect();
    var past = days
      .filter(function (d) { return d.date < today && mealsOf(d).length > 0; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    $('history-empty').hidden = status !== 'ready' || past.length > 0;
    past.slice(0, histLimit).forEach(function (d) {
      var det = el('details', 'day');
      var t = dayTotals(d);
      var built = false;
      function build() {
        if (built) return;
        built = true;
        var body = el('div', 'day-body');
        body.append(chips(t));
        mealCards(d, d.date).forEach(function (c) { body.append(c); });
        det.append(body);
      }
      det.addEventListener('toggle', function () {
        if (det.open) { openDays.add(d.date); build(); } else openDays.delete(d.date);
      });
      var sum = el('summary');
      var diff = Math.round(t.kcal - TARGET);
      sum.append(
        el('span', 'd-date', fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })),
        el('span', 'd-total', fmtN(t.kcal) + ' kcal (' + (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmtN(Math.abs(diff)) + ')' +
          (t.gl != null ? ' · GL ' + fmtN(t.gl) : ''))
      );
      det.append(sum);
      if (openDays.has(d.date) || editDate() === d.date) { det.open = true; build(); }
      box.append(det);
    });
    if (past.length > histLimit) {
      var more = el('button', 'more-btn', 'Weitere Tage anzeigen (' + histLimit + ' von ' + past.length + ')');
      more.type = 'button';
      more.addEventListener('click', function () { histLimit += HIST_PAGE; renderHistory(keyOf(new Date())); });
      box.append(more);
      if ('IntersectionObserver' in window) {
        if (!moreObserver) moreObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) { moreObserver.unobserve(e.target); e.target.click(); } });
        }, { rootMargin: '0px 0px 600px 0px' });
        moreObserver.observe(more);
      }
    }
  }


