# Calorie Log

German calorie and nutrient log, published as a private Claude artifact:
https://claude.ai/artifact/882Zc5DQew2vJNCJikcdxN (pinned by the owner, used daily on an iPhone).
UI text is German. Code comments are German in older parts, English in newer ones.

## Commands

- `node build.js`: stitches `src/` into `dist/app.html` (the file that gets published). Fails on a JS syntax error (prints `file:line`) and on files under `src/` that nothing includes.
- `npm test` (or `node test/smoke.js` after a build): headless Chromium smoke test, phone 402×874 and desktop 1300×850, light and dark. Prints `ok`/`FAIL` per check and saves screenshots to `test/shots/` (git-ignored). Set `BLS=/path/to/bls.json` to serve the food table locally.

## File map

`src/index.html` lists every include in order. That order is the cascade order for CSS and the top-to-bottom order of one shared JS scope (everything runs inside one IIFE), so a `var` used by top-level code must come from an earlier file.

- `src/markup.html`: page markup, the Settings sheet and the toast.
- Fonts: Apple system font only (SF Pro via `-apple-system`), for everything including descriptions and numbers. No web fonts and no mono face; digits align with `tabular-nums`. All controls inherit the font.
- `src/css/01-base.css`: tokens. Dark-first: dark values on bare `:root`; light values twice (`prefers-color-scheme: light` guard and `[data-theme="light"]`), keep both in sync. iOS surface tokens (`--sheet-bg`, `--cell`, `--sep`, `--seg-*`, `--scrim`, `--toast-act`) live here too.
- `src/css/02…05`: the original content styles (hero, tables, composer, trackers, chart, history, mobile tweaks).
- `src/css/06-ios.css`: the iOS layer. 16px minimum on fields, touch feedback, sheets, inset grouped lists, segmented control, lazy history paint.
- `src/js/01-state.js`: constants, columns, state, write queue (`dbTask` with retries), formatters (cached `Intl`), `toast` / `undoToast`.
- `src/js/01b-sheet.js`: bottom sheets and the delete confirmation. `sheetCtl(back, {keep, onDismiss})` wires existing markup (Settings); `makeSheet({title, cancel, done, onDone, onDismiss})` builds one. Handles the slide animation, scrim, Escape, pull to close and keyboard (`--kb`).
- `src/js/02-data.js`: amounts and units, meal values, GL and Na:K, `removeMeal` / `restoreMeal` (Undo), draft edits (`applyEdit`).
- `src/js/03-tables.js`, `04-meal-card.js`: nutrient tables and meal cards, including edit mode.
- `src/js/05-view-today.js`, `06-chart-history.js`: hero, chips, GL card, 30-day chart, paged lazy history.
- `src/js/07-water-coffee.js`, `08-caf-draft.js`, `08b-caf-table.js`: water and caffeine trackers and the caffeine table.
- `src/js/09-render.js`: `render()`, `goTo()`, day slide animation, view-state keeping, `afterTap()`.
- `src/js/10…13`: estimation. Prompts, Open Food Facts lookup through the Parallel Search connector, the BLS food table, preview, refine.
- `src/js/14-settings.js`: settings fields and sheet, day swipe and keys. `15`: photo, label and barcode. `16`: export. `17`, `18`: favorites and the picker sheet. `19`: live subscriptions and start.
- `test/sample-data.js`: deterministic sample log (seeded PRNG, ~150 days, German foods, `demo: true`). `test/mock-claude.js`: in-page mock of `claude.use()` (db with snapshots, canned `sample`). `test/smoke.js`: the checks.

## Data model (artifact `db` capability)

- `days/<YYYY-MM-DD>`: `{ date, meals: [...], water (ml), coffee (ml), caffeine (mg), cola (ml), cafLog: [{t:'HH:MM', h, k:'coffee'|'cola', ml, mg}] }`
  - meal: `{ id, time:'HH:MM'|'–', name, items, kcal, protein, carbs, fat, sugar, salt, potassium, gl, parts: [...] }`
  - part: `{ name, qty, unit:'g'|'ml'|'Stück'|'Portion', unitG?, amount, kcal, protein, carbs, fat, sugar, salt (g table salt), potassium (mg), gi? }`
- `foods/<key>`: the person's own food values per 100 g: `{ key, name, per100, gi, unitG }`.
- `settings/goals`: goals and limits (see `GOAL_FIELDS`), plus `balFrom` / `balVal` for the calorie balance.
- `settings/favorites`: `{ list: [{type:'meal'|'food', key, meal|food}] }`.
- Per-device conveniences in `localStorage`: `calorie-log-theme`, `calorie-log-model`, `calorie-log-pick-sort`.
- Published file `bls.json` (German food table, about 750 KB) sits next to the page and is not in this repo. A republish that leaves it out keeps it.

## Runtime behavior worth knowing

- Writes go through `dbTask`: one at a time, re-read before write, 20 s timeout, up to 3 retries on `unavailable` and `resource_exhausted`. `quota_exceeded` shows a plain message.
- Edits commit on `change` but rebuild only after the pointer is up (`afterTap`), so the tap that moved focus or hit Speichern still lands. `render()` keeps each keyed table's horizontal scroll (`data-k`) and the focused field (by id).
- Deletes (meal, draft rows, caffeine rows, preview rows) have two safety steps: a "… löschen?" action sheet (`askConfirm` / `confirmTap` in `01b-sheet.js`), then an Undo toast. The owner wants both; keep them.
- Calorie ring with a balance (Saldo ≠ 0): red mark at the budget (Tagesbedarf − Saldo), where today must end for the balance to be 0. With a deficit the budget exceeds the daily need, so the ring then spans the budget (red mark at its end) and a grey mark shows the daily need. `placeRingMark` in `05-view-today.js`.
- History shows 60 days and loads more near the end. A day's tables are built only when it is opened.
- Day swipe: more than 60 px and 1.6× more horizontal than vertical, not from fields, tables, chart, history, preview or sheets.

## Publishing

1. `node build.js && npm test`
2. Read the live artifact first (`Artifact` action `read`) and merge anything changed there since the last publish. Others may edit it from a session or chat.
3. Publish `dist/app.html` to the URL above. Omit `capabilities` (keeps `db`, `downloads`, `mcp` Parallel Search `web_fetch`, `sample` with images) and omit `icon`.

## Known limits

- Tested only in headless Chromium with a mock db. Not verified on a real iPhone: Safari rendering, finger feel of pull-to-close and day swipe, iOS keyboard behavior inside the Claude app (especially whether focus survives a re-render after tapping from one table field to the next).
- Meal tables stay wide (1158 px) and scroll sideways inside their card. There is no sticky name column, by design (one scroll axis at a time).
- Settings changes apply on Fertig. The theme does not preview live.
