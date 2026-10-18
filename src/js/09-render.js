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
  viewKey = k;
  following = k === today;
  render(true);
}

function render(force) {
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
}
