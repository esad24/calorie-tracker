  /* Bottom sheets (iOS style): grabber, Cancel | Title | Done bar, slide in and out, pull down to close.
     sheetCtl wires an existing .sheet-back (Settings); makeSheet builds one for pickers and questions. */
  var SHEETS = []; // open sheets, topmost last
  var sheetSeq = 0;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function syncScrollLock() { document.body.style.overflow = SHEETS.length ? 'hidden' : ''; }

  /* o: { keep: true to hide instead of remove on close, onDismiss(reason) once per close ('done' or 'cancel') } */
  function sheetCtl(back, o) {
    o = o || {};
    var sh = back.querySelector('.sheet');
    var ctl = { isOpen: false, back: back, sheet: sh, body: sh.querySelector('.sheet-body'), onDismiss: o.onDismiss };
    var opener = null, hideTimer = null;
    ctl.open = function () {
      if (ctl.isOpen) return;
      ctl.isOpen = true;
      opener = document.activeElement;
      clearTimeout(hideTimer);
      back.hidden = false;
      sh.classList.remove('dragging');
      sh.style.transform = '';
      void back.offsetHeight; // start the slide-in from the closed position
      back.classList.add('open');
      SHEETS.push(ctl);
      syncScrollLock();
      updateKeyboard();
    };
    ctl.close = function (reason) {
      if (!ctl.isOpen) return;
      ctl.isOpen = false;
      SHEETS = SHEETS.filter(function (s) { return s !== ctl; });
      var f = document.activeElement;
      if (f && sh.contains(f)) f.blur();
      sh.classList.remove('dragging', 'typing');
      sh.style.transform = '';
      sh.style.setProperty('--kb', '0px');
      back.classList.remove('open');
      hideTimer = setTimeout(function () { if (o.keep) back.hidden = true; else back.remove(); }, REDUCED ? 30 : 340);
      syncScrollLock();
      // Return focus for keyboard users; never to a text field, which would pop the iOS keyboard
      if (opener && opener.focus && document.contains(opener) && !opener.matches('input,textarea,select')) {
        try { opener.focus({ preventScroll: true }); } catch (e) {}
      }
      if (ctl.onDismiss) ctl.onDismiss(reason || 'cancel');
    };
    back.addEventListener('click', function (e) { if (e.target === back) ctl.close('cancel'); });
    attachPull(ctl);
    return ctl;
  }

  /* o: { title, cancel, done (button labels or null), role, cls, onDone, onDismiss } */
  function makeSheet(o) {
    var back = el('div', 'sheet-back');
    var sh = el('div', 'sheet' + (o.cls ? ' ' + o.cls : ''));
    sh.setAttribute('role', o.role || 'dialog');
    sh.setAttribute('aria-modal', 'true');
    var grab = el('div', 'sheet-grab');
    grab.setAttribute('aria-hidden', 'true');
    var head = el('div', 'sheet-head');
    var cancel = o.cancel ? el('button', 'sheet-cancel', o.cancel) : el('span');
    var title = el('h2', 'sheet-title', o.title || '');
    title.id = 'sheet-title-' + (++sheetSeq);
    sh.setAttribute('aria-labelledby', title.id);
    var done = o.done ? el('button', 'sheet-done', o.done) : el('span');
    if (o.cancel) cancel.type = 'button';
    if (o.done) done.type = 'button';
    head.append(cancel, title, done);
    var body = el('div', 'sheet-body');
    sh.append(grab, head, body);
    back.append(sh);
    back.hidden = true;
    document.body.append(back);
    var ctl = sheetCtl(back, { onDismiss: o.onDismiss });
    if (o.cancel) cancel.addEventListener('click', function () { ctl.close('cancel'); });
    if (o.done) done.addEventListener('click', function () { if (o.onDone) o.onDone(); else ctl.close('done'); });
    ctl.title = title;
    ctl.doneBtn = o.done ? done : null;
    ctl.cancelBtn = o.cancel ? cancel : null;
    ctl.addFoot = function () { var f = el('div', 'sheet-foot'); sh.append(f); return f; };
    return ctl;
  }

  /* Pull down to close: from the grabber or title bar at once, from the content only when it is scrolled to the top.
     The first pull with the keyboard up only dismisses the keyboard. */
  function attachPull(ctl) {
    var sh = ctl.sheet;
    var y0 = null, x0 = 0, dy = 0, t0 = 0, decided = false, claimed = false, fromHead = false;
    sh.addEventListener('touchstart', function (e) {
      y0 = null;
      if (e.touches.length !== 1 || !ctl.isOpen) return;
      var t = e.target;
      fromHead = !!(t.closest && t.closest('.sheet-grab,.sheet-head'));
      if (!fromHead && t.closest && t.closest('input,textarea,select,.tbl-wrap,.ios-seg,.pick-por')) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
      t0 = Date.now();
      decided = false;
      claimed = false;
    }, { passive: true });
    sh.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      var y = e.touches[0].clientY, x = e.touches[0].clientX;
      dy = y - y0;
      if (!decided) {
        if (Math.abs(dy) < 8 && Math.abs(x - x0) < 8) return;
        decided = true;
        var body = sh.querySelector('.sheet-body');
        claimed = dy > 0 && Math.abs(dy) > Math.abs(x - x0) * 1.5 && (fromHead || !body || body.scrollTop <= 0);
        if (!claimed) { y0 = null; return; }
        var f = document.activeElement;
        if (f && sh.contains(f) && f.matches('input,textarea,select')) { f.blur(); y0 = null; claimed = false; return; }
        sh.classList.add('dragging');
        y0 = y;
        dy = 0;
      }
      e.preventDefault();
      sh.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
    }, { passive: false });
    function end() {
      if (y0 == null || !claimed) { y0 = null; return; }
      var fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.6;
      y0 = null;
      claimed = false;
      sh.classList.remove('dragging');
      if (dy > 100 || fast) ctl.close('cancel');
      else sh.style.transform = '';
    }
    sh.addEventListener('touchend', end);
    sh.addEventListener('touchcancel', end);
  }

  /* Keyboard: lift sheet content above the iOS keyboard and let the sheet grow while a field has focus */
  function updateKeyboard() {
    var vv = window.visualViewport;
    var kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    if (kb < 60) kb = 0;
    SHEETS.forEach(function (s) { s.sheet.style.setProperty('--kb', kb + 'px'); });
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboard);
    window.visualViewport.addEventListener('scroll', updateKeyboard);
  }
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    var sh = t && t.closest && t.closest('.sheet');
    if (sh && t.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea')) sh.classList.add('typing');
  });
  document.addEventListener('focusout', function (e) {
    var sh = e.target && e.target.closest && e.target.closest('.sheet');
    if (sh) setTimeout(function () { if (!sh.contains(document.activeElement)) sh.classList.remove('typing'); }, 0);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && SHEETS.length) { e.preventDefault(); SHEETS[SHEETS.length - 1].close('cancel'); }
  });

