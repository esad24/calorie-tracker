  /* Änderungsmodus: Sobald eine Vorschau da ist, geht Text an Claude mit dem bisherigen Stand als Kontext */
  var changeMode = false, lastMealText = '', lastPhoto = null, lastPhotoCtx = '', pickContext = '';
  var MEAL_PLACEHOLDER = '150 g Haferflocken, 250 ml Milch, 1 Banane (120 g)';
  function setChangeMode(on, restore) {
    var ta = $('meal-input');
    if (on && !changeMode) {
      lastMealText = ta.value;
      ta.value = '';
    } else if (!on && changeMode && restore) {
      ta.value = lastMealText;
    }
    changeMode = on;
    if (!on) { lastMealText = ''; lastPhoto = null; lastPhotoCtx = ''; pickContext = ''; previewName = null; previewNameTouched = false; }
    $('h-add').textContent = on ? 'Änderung vornehmen' : (addTarget && addTarget.date === viewKey ? 'Mahlzeit ergänzen' : 'Mahlzeit hinzufügen');
    ta.placeholder = on ? 'Was soll geändert oder ergänzt werden? z. B. „Mango nur 80 g, dazu 1 EL Honig“' : MEAL_PLACEHOLDER;
    ta.setAttribute('aria-label', on ? 'Änderung oder Ergänzung für den Vorschlag' : 'Was hast du gegessen?');
    $('estimate').textContent = on ? 'Änderung senden' : 'Schätzen';
    $('scan-label').hidden = on;
    $('nut-label').hidden = on;
  }
  function refinePrompt(prev, parts, change) {
    var lines = buildPrompt('', true).split('\n');
    lines.pop();
    lines = lines.filter(function (l) {
      return !/^The description has numbered lines|^Add to every item "brand"|^A line that contains a barcode|^Some lines list BLS/.test(l);
    });
    var cur = parts.map(function (p) {
      var o = { name: p.name, qty: p.qty, unit: p.unit, unit_g: p.unitG > 0 ? p.unitG : 1, kcal: p.kcal, gi: p.gi || null, estimate: !!p.estimate };
      NUTS.forEach(function (n) { o[n.key] = p[n.key]; });
      return o;
    });
    lines.push('You are revising a meal estimate you gave before. Below is everything the person gave you (original description and photo note, current items as JSON including their own edits, and their change request in German). Answer with the complete updated list of items in the Format above, "questions": [] and a short German note on what you changed.');
    lines.push('meal_name: keep the current meal name unless the change makes it wrong or the person asks for a different name.');
    lines.push('Original description: """' + String(prev || '').replace(/"""/g, '"') + '"""');
    lines.push('Current meal name: ' + JSON.stringify(cleanName(previewName)));
    lines.push('Current items: ' + JSON.stringify(cur));
    lines.push('Change request: """' + String(change).replace(/"""/g, '"') + '"""');
    return lines.join('\n');
  }
  async function refine() {
    var text = $('meal-input').value.trim();
    if (!text || busy || !pending) return;
    if (!capsReady || !sampleRef) { toast('Schätzen ist in dieser Ansicht nicht verfügbar.'); return; }
    var parts = pending.parts;
    pending.inputs.forEach(function (inp, i) { if (parts[i] && inp) parts[i].kcal = Math.max(0, Math.round(Number(inp.value) || 0)); });
    estimating = true;
    setBusy(true);
    toast('');
    try {
      var prevText = [lastMealText, lastPhotoCtx ? 'Note the person wrote with the photo: ' + lastPhotoCtx : '', pickContext ? 'Items the person picked from their history (German): ' + pickContext : ''].filter(Boolean).join('\n');
      var cc = currentChoice();
      var so = { model: cc.model, modelTier: cc.tier, cache: false };
      if (lastPhoto) {
        var lim = null;
        try { lim = await sampleRef.limits(); } catch (e) {}
        if (lim && lim.images) {
          so = { images: [lastPhoto], cache: false };
          if (cc.tier === 'quick') so.modelTier = 'default'; else { so.model = cc.model; so.modelTier = cc.tier; }
        }
      }
      var res = await sampleRef.json(refinePrompt(prevText, parts, text) + (so.images ? '\nThe original photo is attached again.' : ''), so);
      var np = normalize(res);
      if (!np.length) {
        toast('Die Änderung konnte nicht gelesen werden. Formuliere sie anders und versuche es erneut.');
      } else {
        $('meal-input').value = '';
        toast('');
        var nn = cleanName(res && res.meal_name);
        if (nn && nn !== cleanName(previewName)) { previewName = nn; previewNameTouched = false; }
        showPreview(np, res && res.note ? String(res.note) : 'Änderung übernommen. Prüfe die Werte.');
        if (!cleanName(previewName)) suggestMealName(np);
      }
    } catch (e) {
      var code = e && e.code;
      toast(
        code === 'not_granted' ? 'Schätzen wurde für diese Seite nicht erlaubt. Erlaube es und versuche es erneut.' :
        code === 'rate_limited' ? 'Zu viele Anfragen. Warte einen Moment und versuche es erneut.' :
        'Die Änderung ist fehlgeschlagen. Versuche es erneut.'
      );
    }
    setBusy(false);
  }

  async function estimate() {
    if (changeMode) { refine(); return; }
    lastPhoto = null;
    lastPhotoCtx = '';
    var text = $('meal-input').value.trim();
    if (!text || busy) return;
    if (!capsReady) { toast('Verbindung wird noch aufgebaut. Versuche es gleich noch einmal.'); return; }
    if (!sampleRef) { toast('Schätzen ist in dieser Ansicht nicht verfügbar.'); return; }
    estimating = true;
    setBusy(true);
    toast('');
    $('preview').hidden = true;
    pending = null;
    var local = [], missing = [], segs = splitMeal(text);
    for (var si = 0; si < segs.length; si++) {
      var s = segs[si];
      var hit = foodFromDb(s);
      var cands = [];
      if (!hit && s.name) {
        cands = blsCandidates(s.name);
        if (cands.length > 12) cands = [];
        else if (!cands.length) cands = typoCandidates(s.name);
      }
      if (hit) local.push(hit); else missing.push({ raw: s.raw, name: s.name || s.raw, cands: cands });
    }
    try {
      if (!missing.length) {
        toast('');
        showPreview(local, 'Alle Lebensmittel stammen aus deiner Datenbank bzw. dem BLS.', '');
        suggestMealName(local);
        setBusy(false);
        return;
      }
      var lines = missingLines(missing);
      var res = await sampleRef.json(buildPrompt(lines), { model: currentChoice().model, modelTier: currentChoice().tier, cache: false });
      var qs = (res && Array.isArray(res.questions) ? res.questions : []).filter(function (q) {
        return q && q.question && Array.isArray(q.options) && q.options.length >= 2;
      }).slice(0, 6);
      if (qs.length) {
        var answers = [];
        toast('');
        for (var qi = 0; qi < qs.length; qi++) {
          var ans = await askChoice(String(qs[qi].question), qs[qi].options.slice(0, 4).map(String), null, true);
          var qh = String(qs[qi].item || '') + ' (' + String(qs[qi].question).slice(0, 120) + ')';
          if (typeof ans === 'string') answers.push(qh + ': ' + ans.slice(0, 200));
          else if (ans >= 0) answers.push(qh + ': ' + String(qs[qi].options[ans]));
        }
        if (answers.length) {
          toast('');
          res = await sampleRef.json(buildPrompt(lines + '\nClarifications from the person: ' + answers.join('; '), true), { model: currentChoice().model, modelTier: currentChoice().tier, cache: false });
        }
      }
      var web = null, webNote = '';
      if (mcpRef && WEB_ON) {
        var bl = brandedLines(res, missing);
        if (bl.length) {
          toast('Suche Produktdaten…', true);
          web = { prods: {}, picks: {} };
          var failed = null;
          await Promise.all(bl.map(async function (b) {
            try { var r = await lookupProduct(b.q); if (r.length) web.prods[b.line] = r; }
            catch (e) { failed = failed || (e && e.code) || 'error'; }
          }));
          var wlist = Object.keys(web.prods);
          if (wlist.length) {
            try {
              var pk = await sampleRef.json(webPrompt(wlist, web.prods, missing), { modelTier: 'quick', cache: false });
              (pk && Array.isArray(pk.picks) ? pk.picks : []).forEach(function (k) {
                var ln = k && Number(k.line), ix = k && k.off != null ? Number(k.off) : -1;
                if (web.prods[ln] && web.prods[ln][ix]) web.picks[ln] = ix;
              });
            } catch (e) {}
          }
          var nPick = Object.keys(web.picks).length;
          if (nPick) webNote = nPick + ' Produkt(e) aus Open Food Facts. ';
          else if (failed === 'server_not_connected' || failed === 'not_in_manifest' || failed === 'approval_required' || failed === 'consent_required') webNote = 'Produktsuche nicht erlaubt oder Parallel Search nicht verbunden, Werte geschätzt. ';
          else if (failed) webNote = 'Produktsuche fehlgeschlagen, Werte geschätzt. ';
          else webNote = 'Kein eindeutiger Produkttreffer, Werte geschätzt. ';
        }
      }
      var parts = local.concat(claudeParts(res, missing, web));
      if (!parts.length) {
        toast('Das konnte nicht gelesen werden. Schreibe die Lebensmittel mit Mengen auf.');
      } else {
        toast('');
        var note = (local.length ? local.length + ' aus Datenbank/BLS. ' : '') + webNote + (res && res.note ? res.note : '');
        var mn = cleanName(res && res.meal_name);
        showPreview(parts, note.trim(), mn);
        if (!mn) suggestMealName(parts);
      }
    } catch (e) {
      var code = e && e.code;
      toast(
        code === 'not_granted' ? 'Schätzen wurde für diese Seite nicht erlaubt. Erlaube es und versuche es erneut.' :
        code === 'rate_limited' ? 'Zu viele Anfragen. Warte einen Moment und versuche es erneut.' :
        'Die Schätzung ist fehlgeschlagen. Versuche es erneut.'
      );
    }
    setBusy(false);
  }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  async function saveMeal() {
    if (!pending || !dbRef || busy) return;
    var p = pending;
    setBusy(true);
    p.save.disabled = true;
    var parts = p.parts.map(function (part, i) {
      var out = {
        name: part.name,
        qty: part.qty,
        unit: part.unit,
        amount: part.amount,
        kcal: Math.max(0, Math.round(Number(p.inputs[i].value) || 0))
      };
      if (part.unitG > 0) out.unitG = part.unitG;
      if (part.gi > 0) out.gi = part.gi;
      NUTS.forEach(function (n) { out[n.key] = part[n.key]; });
      return out;
    });
    var now = new Date();
    var date = p.date || keyOf(now);
    var meal = {
      id: newId(),
      time: date === keyOf(now) ? pad(now.getHours()) + ':' + pad(now.getMinutes()) : '–',
      name: cleanName(previewName) || fallbackMealName(parts),
      items: parts.map(partText).join(', ').slice(0, 300),
      kcal: parts.reduce(function (s, x) { return s + x.kcal; }, 0),
      parts: parts
    };
    NUTS.forEach(function (n) {
      meal[n.key] = num(parts.reduce(function (s, x) { return s + x[n.key]; }, 0), n.dec);
    });
    var mgl = glOfParts(parts);
    if (mgl != null) meal.gl = round2(mgl);
    var merged = null;
    try {
      await dbTask(async function () {
      var ref = dbRef.doc('days/' + date);
      var snap = await ref.get();
      var cur = snap.exists ? snap.data() : null;
      merged = null;
      if (addTarget && addTarget.date === date && cur && Array.isArray(cur.meals)) {
        var ti = locateMeal(cur, addTarget.meal);
        if (ti >= 0 && Array.isArray(cur.meals[ti].parts)) {
          var ex = cur.meals[ti];
          var allParts = ex.parts.concat(parts);
          var nm = Object.assign({}, ex, { parts: allParts });
          nm.kcal = allParts.reduce(function (s, x) { return s + (Number(x.kcal) || 0); }, 0);
          NUTS.forEach(function (n) {
            var have = allParts.filter(function (x) { return x[n.key] != null; });
            if (have.length) nm[n.key] = num(have.reduce(function (s, x) { return s + (Number(x[n.key]) || 0); }, 0), n.dec);
          });
          nm.items = allParts.map(partText).join(', ').slice(0, 300);
          var ngl = glOfParts(allParts);
          if (ngl != null) nm.gl = round2(ngl); else delete nm.gl;
          var nmeals = cur.meals.slice();
          nmeals[ti] = nm;
          await ref.update({ meals: nmeals });
          merged = nm;
        }
      }
      if (merged) {
        /* Mahlzeit ergaenzt, Uhrzeit und ID bleiben */
      } else if (cur && Array.isArray(cur.meals)) {
        await ref.update({ meals: cur.meals.concat([meal]) });
      } else {
        await ref.set({ date: date, meals: [meal] });
      }
      });
      saveFoods(parts, p.parts);
      if (merged) { addTarget = null; editKey = null; mealDraft = null; }
      pending = null;
      $('preview').hidden = true;
      $('preview').replaceChildren();
      setChangeMode(false, false);
      $('meal-input').value = '';
      toast((merged ? 'Ergänzt: +' : 'Gespeichert: ') + fmtN(meal.kcal) + ' kcal' + (merged ? ' zur Mahlzeit um ' + String(merged.time || '–').slice(0, 5) + '.' : ' für ' + dayLabel(date) + '.'));
    } catch (e) {
      p.save.disabled = false;
      toast('Das Speichern ist fehlgeschlagen. Es wurde nichts hinzugefügt.');
    }
    setBusy(false);
  }

