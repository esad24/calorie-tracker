# calorie-tracker

Source of the **Calorie Log** Claude artifact: a German-language daily food log with
nutrient tables, glycemic load, water/coffee/caffeine tracking, a 30-day chart and
Claude-assisted meal estimation (text, barcode, nutrition-label photos).

## Layout

```
src/
  index.html        page markup; build:css / build:js placeholders
  styles.css        all styles
  js/               app code, split by concern, concatenated in file-name order
    01-config.js        constants, shared state, write queue
    02-util.js          date/number formatting, DOM helpers
    03-meals.js         amounts & units, day/meal data, GI/GL, calorie balance
    04-meal-edit.js     meal draft editing
    05-tables.js        nutrient tables, meal cards
    06-view.js          hero ring, chips, GL card, chart, history
    07-water.js         water tracking, shared +/− buttons, info toggles
    08-caffeine.js      coffee/cola, caffeine table
    09-render.js        day navigation, top-level render()
    10-estimate-sources.js  prompts, Open Food Facts lookup via web_fetch
    11-foods.js         own food DB, BLS lookup, typo matching
    12-estimate.js      preview, refine, estimate, save meal
    13-settings.js      theme, goals, settings dialog
    14-controls.js      navigation/settings event wiring
    15-photo.js         barcode scan, nutrition-label / meal photos
    16-export.js        CSV / JSON export
    17-favorites.js     recent meals & favorites picker
    18-sync.js          live DB subscriptions, startup
scripts/
  build.mjs         builds dist/index.html (single file) + dist/bls.json
  check.mjs         syntax-checks the built script
data/
  bls.json          food reference table (BLS 4.0, Max Rubner-Institut, CC BY 4.0)
  db/               export of the artifact database (days, foods, settings)
```

The JS modules are plain scripts that share one scope: the build wraps them, in
order, in a single IIFE, so top-level `var`/`function` names in one file are visible
in the others. Function declarations are hoisted; top-level statements (event
wiring, `render()`, startup) run in file order.

## Build

```
npm run build    # -> dist/index.html, dist/bls.json
npm run check    # build + syntax check
```

Publish `dist/index.html` as the artifact page with `bls.json` as a supporting
file. The page needs the artifact runtime capabilities `db`, `sample`, `mcp`
(Parallel Search `web_fetch`) and `downloads`.

## Data

`data/db/` mirrors the artifact database, one JSON file per document:

- `days/<YYYY-MM-DD>.json` – meals (with per-food `parts`), water, coffee, cola, `cafLog`
- `foods/<key>.json` – saved foods with values per 100 g
- `settings/goals.json`, `settings/favorites.json`
