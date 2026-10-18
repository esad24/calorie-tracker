  function updateNav(today) {
    $('rel-label').textContent = relLabel(viewKey, today);
    $('day-date').textContent = fmtDate(viewKey, { weekday: 'long', day: 'numeric', month: 'long' });
    $('next').disabled = viewKey >= today;
    $('daylabel').setAttribute('aria-label', viewKey === today ? 'Heute' : 'Zurück zu heute');
    $('for-day').textContent = 'Wird eingetragen für: ' + dayLabel(viewKey);
    var adding = !!(addTarget && addTarget.date === viewKey);
    $('add-banner').hidden = !adding;
    $('for-day').hidden = adding;
    $('h-add').textContent = changeMode ? 'Änderung vornehmen' : adding ? 'Mahlzeit ergänzen' : 'Mahlzeit hinzufügen';
    if (adding) $('add-banner-text').textContent = 'Wird zur Mahlzeit von ' + String(addTarget.meal.time || '–').slice(0, 5) + ' ' + '(' + dayLabel(viewKey) + ') ergänzt. Die Uhrzeit bleibt gleich.';
  }

  function goTo(k) {
    var today = keyOf(new Date());
    if (k > today) k = today;
    if (k !== viewKey) { editKey = null; cafEditKey = null; mealDraft = null; cafDraft = null; }
    var dir = viewKey && k !== viewKey ? (k < viewKey ? -1 : 1) : 0;
    viewKey = k;
    following = k === today;
    render(true);
    if (dir) slideDay(dir);
  }
  /* The new day slides in from the side it comes from (earlier days from the left) */
  function slideDay(dir) {
    if (REDUCED) return;
    var page = document.querySelector('.page');
    if (!page || !page.animate) return;
    page.animate([{ transform: 'translateX(' + (dir * 28) + 'px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
      { duration: 240, easing: 'cubic-bezier(.2, .9, .25, 1)' });
  }

  /* Re-renders rebuild the DOM. Keep what the person was doing: the horizontal scroll of each keyed
     table (data-k) and the focused field (by id). */
  function saveViewState() {
    var a = document.activeElement;
    var st = { focus: null, scroll: [] };
    if (a && a.id && a.matches && a.matches('input,select,textarea')) st.focus = a.id;
    document.querySelectorAll('.tbl-wrap[data-k]').forEach(function (w) { if (w.scrollLeft) st.scroll.push([w.getAttribute('data-k'), w.scrollLeft]); });
    return st;
  }
  function restoreViewState(st) {
    st.scroll.forEach(function (s) {
      var w = document.querySelector('.tbl-wrap[data-k="' + CSS.escape(s[0]) + '"]');
      if (w && w.scrollLeft !== s[1]) w.scrollLeft = s[1];
    });
    if (st.focus) {
      var f = document.getElementById(st.focus);
      if (f && f !== document.activeElement) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    }
  }

  /* An edit commits on "change", which fires while the finger or mouse that moved focus is still down.
     Rebuilding then would swallow that tap (on the next field or on Speichern), so wait until it is up. */
  var pointerIsDown = false, pendingCommits = [];
  function renderCommit() { render(true); }
  function afterTap(fn) {
    if (pendingCommits.indexOf(fn) < 0) pendingCommits.push(fn);
    if (!pointerIsDown) setTimeout(flushCommits, 0);
  }
  function flushCommits() {
    if (pointerIsDown || !pendingCommits.length) return;
    var list = pendingCommits;
    pendingCommits = [];
    list.forEach(function (fn) { fn(); });
  }
  document.addEventListener('pointerdown', function () { pointerIsDown = true; }, true);
  ['pointerup', 'pointercancel'].forEach(function (t) {
    document.addEventListener(t, function () { pointerIsDown = false; if (pendingCommits.length) setTimeout(flushCommits, 0); }, true);
  });

  function render(force) {
    var view = saveViewState();
    renderForce = force === true;
    var today = keyOf(new Date());
    var byDate = new Map();
    days.forEach(function (d) { byDate.set(d.date, d); });
    if (following || !viewKey || viewKey > today) { viewKey = today; following = true; }
    renderToday(viewKey, today, byDate.get(viewKey));
    renderWater(viewKey, byDate.get(viewKey));
    renderCoffee(viewKey, byDate.get(viewKey));
    renderCafTable(viewKey, byDate.get(viewKey));
    updateNav(today);
    renderChart(today, byDate);
    renderHistory(today);
    renderForce = false;
    restoreViewState(view);
  }

