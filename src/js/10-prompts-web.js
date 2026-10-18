  /* Mahlzeit hinzufügen: Claude schätzt, die Person prüft die Kalorien, dann wird gespeichert. */
  /* Unklare Zeilen mit ihren BLS-Kandidaten an Claude; Claude wählt einen Eintrag (Werte aus dem BLS) oder schätzt selbst */
  function missingLines(missing) {
    return missing.map(function (m, i) {
      return i + ': ' + m.raw + (m.cands.length ? '  | BLS candidates: ' + m.cands.map(function (c, j) { return '[' + j + '] ' + c.e.n; }).join('; ') : '');
    }).join('\n');
  }
  /* Markenprodukte: Open Food Facts über den Connector Parallel Search (web_fetch). Nur wenn Claude brand setzt oder eine EAN in der Zeile steht. */
  var WEB = { server: 'Parallel Search', args: {} };
  var OFF_FIELDS = 'code,product_name,brands,quantity,nutriments';
  async function webArg(tool, prefs) {
    if (WEB.args[tool]) return WEB.args[tool];
    var a = { key: prefs[0], arr: false, extra: {} };
    try {
      var d = await mcpRef.describeTool(WEB.server, tool);
      var pr = (d && d.inputSchema && d.inputSchema.properties) || {};
      for (var i = 0; i < prefs.length; i++) if (pr[prefs[i]]) { a.key = prefs[i]; break; }
      a.arr = !!(pr[a.key] && pr[a.key].type === 'array');
      var req = (d && d.inputSchema && d.inputSchema.required) || [];
      req.forEach(function (r) {
        if (r !== a.key && pr[r] && pr[r].type === 'string') a.extra[r] = 'Return the full response text of the URL verbatim.';
      });
    } catch (e) {}
    WEB.args[tool] = a;
    return a;
  }
  async function webFetch(url) {
    var a = await webArg('web_fetch', ['url', 'urls']);
    var input = Object.assign({}, a.extra);
    input[a.key] = a.arr ? [url] : url;
    var r = await mcpRef.callTool(WEB.server, 'web_fetch', input, { signal: AbortSignal.timeout(45000) });
    var pl = r && r.payload;
    return typeof pl === 'string' ? pl : JSON.stringify(pl != null ? pl : (r && r.content));
  }
  function findOff(v, depth) {
    if (depth > 4 || v == null) return null;
    if (typeof v === 'string') {
      var a = v.indexOf('{'), b = v.lastIndexOf('}');
      if (a < 0 || b <= a) return null;
      try { return findOff(JSON.parse(v.slice(a, b + 1)), depth + 1); } catch (e) { return null; }
    }
    if (typeof v !== 'object') return null;
    if (Array.isArray(v.products) || (v.product && typeof v.product === 'object')) return v;
    var ks = Object.keys(v);
    for (var i = 0; i < ks.length; i++) {
      var r = findOff(v[ks[i]], depth + 1);
      if (r) return r;
    }
    return null;
  }
  function trimProd(p) {
    if (!p) return null;
    var n = p.nutriments || {};
    var kcal = n['energy-kcal_100g'];
    if (kcal == null && n.energy_100g != null) kcal = Number(n.energy_100g) / 4.184;
    if (kcal == null || isNaN(Number(kcal))) return null;
    function v(x, f) { return x == null || isNaN(Number(x)) ? null : Math.round(Number(x) * (f || 1) * 10) / 10; }
    var salt = n.salt_100g != null ? v(n.salt_100g) : (n.sodium_100g != null ? v(n.sodium_100g, 2.5) : null);
    var name = [p.brands ? String(p.brands).split(',')[0].trim() : '', p.product_name || ''].filter(Boolean).join(' ').slice(0, 80);
    if (!name) return null;
    return { name: name, qty: p.quantity ? String(p.quantity).slice(0, 20) : '', per100: { kcal: Math.round(Number(kcal)), protein: v(n.proteins_100g), carbs: v(n.carbohydrates_100g), fat: v(n.fat_100g), sugar: v(n.sugars_100g), salt: salt, potassium: v(n.potassium_100g, 1000) } };
  }
  async function lookupProduct(q) {
    var ean = /^\d{8,14}$/.test(q);
    var url = ean
      ? 'https://world.openfoodfacts.org/api/v2/product/' + q + '.json?fields=' + OFF_FIELDS
      : 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=5&fields=' + OFF_FIELDS;
    var data = findOff(await webFetch(url), 0);
    var list = data ? (Array.isArray(data.products) ? data.products : [data.product]) : [];
    return list.map(trimProd).filter(Boolean).slice(0, 5);
  }
  function brandedLines(res, missing) {
    var seen = {}, out = [];
    (res && Array.isArray(res.items) ? res.items : []).forEach(function (it) {
      var ln = Number(it && it.line), m = missing[ln];
      if (!m || seen[ln]) return;
      var ean = /(?:^|\D)(\d{8,14})(?:\D|$)/.exec(m.raw);
      var br = it.brand && typeof it.brand === 'string' ? it.brand.trim() : '';
      if (!ean && !br) return;
      seen[ln] = 1;
      var q = ean ? (ean[1].length === 12 ? '0' + ean[1] : ean[1]) : (m.name.toLowerCase().indexOf(br.toLowerCase()) >= 0 ? m.name : br + ' ' + m.name);
      out.push({ line: ln, q: q.replace(/\s+/g, ' ').trim().slice(0, 80) });
    });
    return out.slice(0, 6);
  }
  function webPrompt(wl, prods, missing) {
    return ['Pick the product from the Open Food Facts results that is exactly the one the person means: same brand, same product and same variant (for example sweetened or unsweetened, flavour, fat level). If none clearly matches, use null. Reply with JSON only: {"picks":[{"line":number,"off":number or null}]}.']
      .concat(wl.map(function (ln) {
        return 'Line ' + ln + ': ' + missing[Number(ln)].raw + '\n' + prods[ln].map(function (p, i) {
          return '  [' + i + '] ' + p.name + (p.qty ? ' (' + p.qty + ')' : '') + ' | ' + p.per100.kcal + ' kcal, C ' + p.per100.carbs + ', Sugar ' + p.per100.sugar + ', F ' + p.per100.fat + ', P ' + p.per100.protein;
        }).join('\n');
      })).join('\n');
  }

  function claudeParts(res, missing, web) {
    var out = [];
    (res && Array.isArray(res.items) ? res.items : []).forEach(function (it) {
      if (!it) return;
      var m = missing[Number(it.line)];
      var wl = Number(it.line);
      var wk = web && web.picks ? web.picks[wl] : null;
      if (m && wk != null && web.prods[wl] && web.prods[wl][wk]) {
        var pr = web.prods[wl][wk];
        var wu = normUnit(it.unit) || 'g';
        var wq = Number(it.qty) > 0 ? round2(Number(it.qty)) : 0;
        var wf = { name: pr.name, per100: Object.assign({}, pr.per100), gi: null, unitG: Number(it.unit_g) > 0 ? Number(it.unit_g) : null };
        var wg = (wu === 'g' || wu === 'ml') ? wq : (wf.unitG ? wq * wf.unitG : 0);
        if (wf.per100.potassium == null) wf.per100.potassium = wg > 0 ? (Number(it.potassium) || 0) * 100 / wg : 0;
        ['protein', 'carbs', 'fat', 'sugar', 'salt'].forEach(function (k) { if (wf.per100[k] == null) wf.per100[k] = 0; });
        var wpart = wq > 0 ? partFromFood({ qty: wq, unit: wu, name: m.name }, wf) : null;
        if (wpart) {
          wpart.alias = m.name;
          var wgi = Number(it.gi);
          if (wgi > 0 && wgi <= 150) wpart.gi = Math.round(wgi);
          out.push(wpart);
          return;
        }
      }
      var bi = it.bls == null ? -1 : Number(it.bls);
      if (m && bi >= 0 && m.cands[bi]) {
        var u = normUnit(it.unit) || 'g';
        var q = Number(it.qty) > 0 ? round2(Number(it.qty)) : 0;
        var f = entryToFood(m.cands[bi].e);
        f.unitG = Number(it.unit_g) > 0 ? Number(it.unit_g) : null;
        var p = q > 0 ? partFromFood({ qty: q, unit: u, name: m.name }, f) : null;
        if (p) {
          p.alias = m.name;
          var g = Number(it.gi);
          if (g > 0 && g <= 150) p.gi = Math.round(g);
          if (it.estimate) p.estimate = true;
          out.push(p);
          return;
        }
      }
      normalize({ items: [it] }).forEach(function (p) { out.push(p); });
    });
    return out.slice(0, 30);
  }
  function buildPrompt(text, noQ) {
    return [
      'You estimate calories and nutrients for one meal a person describes (usually in German). Reply with JSON only, no prose.',
      'Rules:',
      '- Use standard reference values per 100 g (USDA / Bundeslebensmittelschluessel style) and scale them to the given amount. Use the same value every time for the same food.',
      '- If a weight is given, use it. If raw or cooked is not stated, use the usual state (pasta, rice and meat cooked) for your best-guess values and ask about it (see questions).',
      '- If an amount is missing, assume one typical portion and set estimate to true for that item.',
      '- For restaurant or whole dishes without ingredients, split them into main components with typical portion sizes and set estimate to true on each.',
      '- Add cooking oil, butter or sauce only when it is mentioned or clearly implied, and say so in the note.',
      '- Amount: qty is a number and unit is one of "g", "ml", "Stück", "Portion". Use g (or ml for drinks) when a weight or volume is given or assumed. Use Stück or Portion only when the person gave a count without a weight. unit_g is the typical weight in grams of one Stück or Portion (use 1 for g and ml). name must not contain the amount.',
      '- Units per item: kcal integer; protein, carbs, fat, sugar in grams with one decimal; salt in grams of table salt (not sodium; sodium g x 2.5) with one decimal; potassium in mg as an integer. All values are for the whole qty, not per 100 g.',
      '- sugar is part of carbs and must not exceed carbs. kcal should roughly equal 4 x protein + 4 x carbs + 9 x fat.',
      '- Salt and potassium are the least certain values. Include salt that is added in processed foods, bread, cheese, cured meat and restaurant dishes.',
      '- gi is the glycemic index of the food as eaten (glucose = 100), an integer taken from published GI tables (University of Sydney, International Tables of Glycemic Index). Estimate it for composite items. Use null only when the item has under 2 g carbohydrates (meat, fish, eggs, oil, plain cheese). Do not compute the glycemic load; the app does that.',
      'Format: {"items":[{"name":string,"qty":number,"unit":string,"unit_g":number,"kcal":integer,"protein":number,"carbs":number,"fat":number,"sugar":number,"salt":number,"potassium":integer,"gi":integer or null,"brand":string or null,"estimate":boolean}],"meal_name":string,"note":string}',
      'name and note are in the language of the meal description. note: at most two short sentences naming the assumptions the person should check.',
      'meal_name: a short German name for the whole meal, 1 to 4 words, the way a person would call it (for example "Döner-Teller", "Obstschale", "Nudeln mit Fischstäbchen"). No amounts, no calories.',
      'The description has numbered lines. Add to every item "line" (the number of the input line it came from) and "bls".',
      'Add to every item "brand": the manufacturer or brand name when the line is a packaged branded product (for example Alpro, Ehrmann, Barilla, Rewe Bio) or contains a barcode number; otherwise null. The app then looks the product up and uses its label values. Still give your best-guess values.',
      'A line that contains a barcode number: never guess the product from the number. Use the name "Produkt " plus the number, set estimate to true and brand to null, and give a typical packaged-food portion as best guess. The app looks the number up itself.',
      'Some lines list BLS candidates (entries of the German food composition table). If one candidate clearly is the food meant, including its state (raw, cooked, dried, fried), set "bls" to its number in brackets; the app then takes the nutrient values from the table, but still fill in every field. If no candidate fits, set "bls" to null and estimate yourself. If several candidates fit and the choice changes the calories noticeably, ask a question whose options are those candidate names.',
      (noQ
        ? 'Do not ask questions. Use the clarifications given in the description and set "questions" to [].'
        : 'Never silently pick a variant. Whenever the description leaves open a variant that commonly exists and changes calories, sugar or fat (for example sweetened or unsweetened plant drinks and yogurts, fat level of milk, quark, cheese or meat, raw or cooked, with or without skin, fried or not, with or without sauce or dressing), you must ask: still give your best-guess items, and add one entry per open choice to a top-level "questions" array: {"item":string,"question":string (short, German),"options":[2 to 4 short German options]}. Ask only what is really needed (no question when the answer would change the values only slightly), at most 6 questions, biggest effect first. Each question covers exactly ONE topic, for example only the portion size, or only the preparation method, or only the variant: never combine two topics in one question or in its options. Questions may also be about a missing amount or portion size when it changes calories noticeably. Several questions about the same food are fine when they are different topics. Example: "Hafermilch" without more detail needs the question "Hafermilch gesüßt oder ungesüßt?". If nothing is open, "questions" is [].'),
      'Meal description: """' + text.replace(/"""/g, '"') + '"""'
    ].join('\n');
  }

  function normalize(res) {
    var items = res && Array.isArray(res.items) ? res.items : [];
    return items.map(function (it) {
      it = it || {};
      var unit = normUnit(it.unit);
      var qty = Number(it.qty);
      if (!(qty > 0) || !unit) {
        var o = parseAmount(String(it.amount || ''));
        if (o.qty > 0) { qty = o.qty; unit = o.unit; }
      }
      if (!(qty > 0)) { qty = 1; unit = unit || 'Portion'; }
      unit = unit || 'g';
      qty = round2(qty);
      var p = {
        name: String(it.name || '').slice(0, 80),
        qty: qty,
        unit: unit,
        amount: fmtQty(qty) + ' ' + unit,
        kcal: num(it.kcal, 0),
        estimate: !!it.estimate
      };
      var ug = Number(it.unit_g);
      if (unit !== 'g' && unit !== 'ml' && ug > 0) p.unitG = ug;
      var gi = Number(it.gi);
      p.gi = gi > 0 && gi <= 150 ? Math.round(gi) : null;
      NUTS.forEach(function (n) { p[n.key] = num(it[n.key], n.dec); });
      if (p.sugar > p.carbs) p.sugar = p.carbs;
      return p;
    }).filter(function (p) { return p.name; }).slice(0, 30);
  }

