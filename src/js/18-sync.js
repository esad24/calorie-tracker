/* Live-Abos; stirbt eines (Fehler oder Verbindungsabbruch), wird es nach kurzer Pause neu aufgebaut */
var subs = {};
function subscribe(name, make) {
  if (subs[name]) return;
  var retry = function () {
    if (subs[name]) { try { subs[name](); } catch (e) {} }
    subs[name] = null;
    setTimeout(function () { subscribe(name, make); }, 3000);
  };
  try { subs[name] = make(retry); } catch (e) { subs[name] = null; setTimeout(function () { subscribe(name, make); }, 3000); }
}
function subscribeAll() {
  if (!dbRef) return;
  subscribe('foods', function (fail) {
    return dbRef.collection('foods').limit(1000).onSnapshot(function (snap) {
      FOODS = {};
      snap.docs.forEach(function (d) {
        var x = d.data();
        if (x && x.key && x.per100) FOODS[x.key] = x;
      });
    }, fail);
  });
  subscribe('goals', function (fail) {
    return dbRef.doc('settings/goals').onSnapshot(function (snap) {
      GOALS = snap.exists ? sanitizeGoals(snap.data()) : {};
      applyGoals();
      if ($('settings').hidden) fillGoalInputs();
      render();
    }, fail);
  });
  subscribe('favs', function (fail) {
    return dbRef.doc('settings/favorites').onSnapshot(function (snap) {
      var d = snap.exists ? snap.data() : null;
      FAVS = d && Array.isArray(d.list) ? d.list.filter(function (f) { return f && f.key && f.meal; }) : [];
      if (pickOpen) pickOpen.rerender();
    }, fail);
  });
  subscribe('days', function (fail) {
    return dbRef.collection('days').orderBy('date', 'desc').limit(1000).onSnapshot(function (snap) {
      days = snap.docs
        .map(function (d) { return d.data(); })
        .filter(function (d) { return d && typeof d.date === 'string' && KEY.test(d.date); });
      status = 'ready';
      render();
    }, function (e) {
      if (status !== 'ready') { status = 'error'; render(); }
      fail(e);
    });
  });
}
document.addEventListener('visibilitychange', function () { if (!document.hidden) { subscribeAll(); render(); } });
render();

loadBls();
(async function start() {
  var c = window.claude;
  try { dbRef = c && c.use ? await c.use('db') : null; } catch (e) { dbRef = null; }
  try { sampleRef = c && c.use ? await c.use('sample') : null; } catch (e) { sampleRef = null; }
  try { mcpRef = c && c.use ? await c.use('mcp') : null; } catch (e) { mcpRef = null; }
  capsReady = true;
  setBusy(false);
  if (!dbRef) { status = 'unavailable'; render(); return; }
  if (!sampleRef) toast('Schätzen ist in dieser Ansicht nicht verfügbar. Du kannst Mahlzeiten weiterhin im Chat eintragen.');
  subscribeAll();
})();
