  /* Barcode: Foto aus der Kamera-App, Nummer mit ZXing lesen, Zeile "Menge + EAN" einfügen */
  /* Nährwerttabelle fotografieren: Claude liest die Werte pro 100 g ab (nichts geschätzt), nach Bestätigung in die eigene Datenbank */
  var WEB_ON = false;
  var pendingEan = '';
  function toNum(v, dec) { var n = Number(String(v).replace(',', '.')); return isNaN(n) || n < 0 ? 0 : num(n, dec); }
  function labelPrompt(ctx) {
    return [
      'The image is a photo taken with a phone camera. First decide what it shows: "label" (the nutrition facts table of a packaged food, probably in German), "meal" (food or a drink ready to eat, for example a plate, bowl or glass) or "other". Reply with JSON only, no prose.',
      'If type is "label": read the table exactly as printed. Do not estimate or complete missing values. If type is "meal": estimate the foods and portion sizes you see, as described under MEAL below. If type is "other": set found to false.',
      'Format (the label fields are used for type label, items for type meal): {"type":string,"found":boolean,"items":array (meal only, see MEAL),"name":string or null,"per100":{"kcal":number,"fat":number,"carbs":number,"sugar":number,"protein":number,"salt":number,"potassium":number or null},"serving_g":number or null,"gi":integer or null,"note":string}',
      'Rules:',
      '- Use the column "pro 100 g" or "pro 100 ml", never the per-serving column. kcal is the kilocalorie value, not kJ.',
      '- fat is total fat, carbs is total carbohydrate, sugar is "davon Zucker" (never more than carbs). salt is in grams; if only sodium is printed, salt = sodium in g x 2.5. potassium (Kalium) in mg, null if not printed.',
      '- A value that is not printed is 0 (potassium: null). "<0,5" means 0.5. Use a dot as decimal separator in the JSON.',
      '- serving_g: grams or ml of one serving, portion or piece when the label states it (for example "Portion 30 g"), otherwise null.',
      '- name: the product name only if it is visible in the image, otherwise null. For type meal: a short German name for the whole meal, 1 to 4 words (for example "Döner-Teller").',
      '- gi: your best estimate of the glycemic index of the food as eaten (University of Sydney tables), an integer; null when carbs are under 2 g.',
      '- If the image does not show a readable nutrition table, set found to false.',
      '- note: at most one short German sentence about anything unclear (blurry digits, values that do not fit together).',
      'MEAL: items is a list of objects {"name":string (German),"qty":number,"unit":"g" or "ml" or "Stück" or "Portion","unit_g":number,"kcal":integer,"protein":number,"carbs":number,"fat":number,"sugar":number,"salt":number,"potassium":integer,"gi":integer or null,"estimate":true}. All values are for the whole qty. Split the plate into its separate foods and estimate each weight in grams from the visible portion (use plate size, cutlery, hands or packaging for scale). Include oil, sauce or dressing only when clearly visible. salt is grams of table salt, potassium is mg, sugar is part of carbs. For type meal set found to true. note: one short German sentence naming the main assumptions, for example plate size or hidden ingredients.'
    ].concat(ctx ? ['The person added this note about the photo (German, as a JSON string). Treat it as reliable context: it can name the product, say how much was eaten, add or remove ingredients, or correct what the image shows. Use it together with the image: ' + JSON.stringify(ctx)] : []).join('\n');
  }

  /* Foto: Vorschau mit optionalem Text als Kontext, dann auswerten */
  function askPhotoContext(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var result = null;
      var sheet = makeSheet({
        title: 'Foto auswerten', cancel: 'Abbrechen', done: 'Auswerten',
        onDone: function () { result = ta.value.trim().slice(0, 500); sheet.close('done'); },
        onDismiss: function () { URL.revokeObjectURL(url); resolve(result); }
      });
      var img = el('img');
      img.src = url;
      img.alt = 'Aufgenommenes Foto';
      img.style.cssText = 'width:100%;max-height:240px;object-fit:contain;border-radius:12px;background:var(--cell)';
      var lab = el('label', 'hint', 'Kontext (optional)');
      lab.htmlFor = 'photo-ctx';
      var ta = el('textarea');
      ta.id = 'photo-ctx';
      ta.rows = 3;
      ta.maxLength = 500;
      ta.placeholder = 'z. B. Portion halb gegessen, mit Olivenöl gebraten, Produktname …';
      sheet.body.append(img, lab, ta);
      sheet.open();
    });
  }
  $('nut-file').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f || busy) return;
    if (!sampleRef || !dbRef) { toast('Das Lesen der Nährwerttabelle ist in dieser Ansicht nicht verfügbar.'); return; }
    var photoCtx = await askPhotoContext(f);
    if (photoCtx === null) return;
    lastPhoto = f;
    lastPhotoCtx = photoCtx;
    setBusy(true);
    toast('Analysiere Foto…', true);
    try {
      var lim = null;
      try { lim = await sampleRef.limits(); } catch (e) {}
      if (!lim || !lim.images) { toast('Bilder werden in dieser Ansicht nicht unterstützt.'); setBusy(false); return; }
      var cc = currentChoice();
      var so = { images: [f], cache: false };
      if (cc.tier === 'quick') so.modelTier = 'default'; else { so.model = cc.model; so.modelTier = cc.tier; }
      var r = await sampleRef.json(labelPrompt(photoCtx), so);
      if (r && r.type === 'meal' && Array.isArray(r.items) && r.items.length) {
        var mp = normalize({ items: r.items });
        mp.forEach(function (p) { p.estimate = true; });
        if (mp.length) {
          toast('');
          showPreview(mp, r.note ? String(r.note).slice(0, 240) : 'Mahlzeit aus Foto geschätzt. Prüfe die Mengen.', cleanName(r.name));
          if (!cleanName(r.name)) suggestMealName(mp);
          setBusy(false);
          return;
        }
      }
      var pr = r && r.per100;
      if (!r || !r.found || !pr || isNaN(Number(String(pr.kcal).replace(',', '.')))) {
        toast('Auf dem Foto war weder eine lesbare Nährwerttabelle noch eine Mahlzeit zu erkennen. Versuche es näher und schärfer noch einmal.');
        setBusy(false);
        return;
      }
      toast('');
      var per = { kcal: Math.round(toNum(pr.kcal, 0)), protein: toNum(pr.protein, 1), carbs: toNum(pr.carbs, 1), fat: toNum(pr.fat, 1), sugar: toNum(pr.sugar, 1), salt: toNum(pr.salt, 2), potassium: Math.round(toNum(pr.potassium, 0)) };
      if (per.sugar > per.carbs) per.sugar = per.carbs;
      var calc = 4 * per.protein + 4 * per.carbs + 9 * per.fat;
      var warn = per.kcal > 0 && Math.abs(calc - per.kcal) / per.kcal > 0.3 ? ' Achtung: kcal und Nährstoffe passen nicht gut zusammen.' : '';
      var guess = r.name ? String(r.name).slice(0, 60) : (pendingEan ? 'Produkt ' + pendingEan : 'Neues Produkt');
      var nm = await askChoice('Wie heißt das Produkt?', [guess], null, true);
      var name = typeof nm === 'string' ? nm.trim().slice(0, 60) : (nm === 0 ? guess : '');
      if (!name) { setBusy(false); return; }
      var sum = name + ' pro 100 g: ' + per.kcal + ' kcal, Fett ' + fmtD(per.fat) + ' g, Kohlenhydrate ' + fmtD(per.carbs) + ' g (Zucker ' + fmtD(per.sugar) + ' g), Eiweiß ' + fmtD(per.protein) + ' g, Salz ' + fmtD(per.salt) + ' g' + (per.potassium ? ', Kalium ' + fmtN(per.potassium) + ' mg' : '') + '.' + warn + (r.note ? ' ' + String(r.note).slice(0, 160) : '');
      var copts = ['Stimmt, speichern'];
      if (pendingEan) copts = ['Stimmt, speichern (Barcode ' + pendingEan + ' merken)', 'Stimmt, ohne Barcode speichern'];
      copts.push('Abbrechen');
      var ci = await askChoice(sum, copts, null, false);
      if (typeof ci !== 'number' || ci < 0 || ci === copts.length - 1) { setBusy(false); return; }
      var link = pendingEan && ci === 0 ? pendingEan : '';
      var sg = Number(r.serving_g) > 0 ? Number(r.serving_g) : null;
      var gi = Number(r.gi) > 0 && Number(r.gi) <= 150 ? Math.round(Number(r.gi)) : null;
      var keys = [foodKey(name)];
      if (link) keys.push(foodKey(link));
      keys.forEach(function (k) {
        if (!k) return;
        var obj = { key: k, name: name, per100: Object.assign({}, per), gi: gi, unitG: sg };
        FOODS[k] = obj;
        dbRef.doc('foods/' + k).set(obj).catch(function () {});
      });
      var qopts = sg ? ['1 Portion', '100 g'] : ['100 g', '50 g', '200 g'];
      var qa = await askChoice('Wie viel hast du gegessen?' + (sg ? ' (1 Portion = ' + fmtN(sg) + ' g)' : ''), qopts, null, true);
      var qt = typeof qa === 'string' ? qa : (qa >= 0 ? qopts[qa] : '');
      var po = parseAmount(qt);
      if (!(po.qty > 0) || ((po.unit === 'Portion' || po.unit === 'Stück') && !sg)) qt = '100 g';
      var ta = $('meal-input');
      ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + qt.trim() + ' ' + (link || name);
      pendingEan = '';
      toast('Gespeichert. Tippe auf Schätzen.');
    } catch (e) {
      toast('Die Nährwerttabelle konnte nicht gelesen werden. Versuche es mit einem schärferen Foto noch einmal.');
    }
    setBusy(false);
  });
  async function readBarcode(url) {
    var Z = window.ZXing;
    var hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    var reader = new Z.BrowserMultiFormatReader(hints);
    try {
      var r = await reader.decodeFromImageUrl(url);
      return String(r.getText());
    } finally {
      try { reader.reset(); } catch (e) {}
    }
  }
  $('scan-file').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f || busy) return;
    if (!window.ZXing) { toast('Der Barcode-Leser konnte nicht geladen werden. Tippe die Nummer mit Menge von Hand ein, zum Beispiel 1 Portion 4001234567890.'); return; }
    toast('Lese Barcode…', true);
    var url = URL.createObjectURL(f);
    var code = '';
    try { code = await readBarcode(url); } catch (e) { code = ''; }
    URL.revokeObjectURL(url);
    code = code.replace(/\D/g, '');
    if (code.length < 8) { toast('Kein Barcode erkannt. Halte ihn gerade, scharf und gut beleuchtet oder tippe die Nummer ein.'); return; }
    toast('');
    if (!FOODS[foodKey(code)]) {
      pendingEan = code;
      toast('Neuer Barcode ' + code + '. Tippe auf das Kamera-Symbol und fotografiere die Nährwerttabelle.', true);
      return;
    }
    pendingEan = '';
    var opts = ['1 Portion', '100 g', '1 Stück'];
    var ans = await askChoice('Barcode ' + code + ' gelesen. Wie viel hast du gegessen?', opts, null, true);
    var q = typeof ans === 'string' ? ans : (ans >= 0 ? opts[ans] : '');
    if (!(parseAmount(q).qty > 0)) q = '1 Portion';
    var ta = $('meal-input');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + q.trim() + ' ' + code;
    toast('Barcode eingetragen. Tippe auf Schätzen.');
  });
  $('add-cancel').addEventListener('click', function () { addTarget = null; render(); });
  $('manage-perms').addEventListener('click', async function () {
    try {
      var pm = window.claude && window.claude.use ? await window.claude.use('permissions') : null;
      if (!pm) { toast('Berechtigungen sind in dieser Ansicht nicht verfügbar. Nutze das Permissions-Menü des Artifacts.'); return; }
      await pm.manage();
    } catch (e) {
      toast('Das Berechtigungs-Fenster konnte nicht geöffnet werden. Nutze das Permissions-Menü des Artifacts.');
    }
  });

