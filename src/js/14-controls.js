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
