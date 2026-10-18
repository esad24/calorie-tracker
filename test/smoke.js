// Headless smoke test: phone (402x874) and desktop, light and dark, against the mock db with sample data.
// Usage: node build.js && node test/smoke.js   (BLS=/path/to/bls.json optional). Screenshots land in test/shots/.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { sampleDb } = require('./sample-data');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
const page = SKELETON + fs.readFileSync(path.join(ROOT, 'dist/app.html'), 'utf8') + '</body></html>';
const mock = fs.readFileSync(path.join(__dirname, 'mock-claude.js'), 'utf8');
const bls = process.env.BLS && fs.existsSync(process.env.BLS) ? fs.readFileSync(process.env.BLS) : null;

let failed = 0;
function check(name, ok, info) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  (' + info + ')' : ''));
  if (!ok) failed++;
}

const server = http.createServer((req, res) => {
  if (req.url === '/bls.json') {
    if (!bls) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(bls); return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page);
});

async function open(browser, opts) {
  const ctx = await browser.newContext(opts.phone
    ? { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: opts.scheme }
    : { viewport: { width: 1300, height: 850 }, colorScheme: opts.scheme });
  const seed = sampleDb(new Date());
  await ctx.addInitScript(({ seed, theme }) => {
    window.__SEED = seed;
    try { localStorage.setItem('calorie-log-theme', theme); } catch (e) {}
  }, { seed, theme: opts.scheme });
  await ctx.addInitScript(mock);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/zxing|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await p.goto('http://localhost:' + server.address().port + '/');
  await p.waitForFunction(() => document.querySelectorAll('#meals .meal-card').length > 0, null, { timeout: 8000 });
  await p.waitForTimeout(300);
  return { ctx, p, errors };
}

// Synthetic touch drag on an element (enough for simple swipes; real pointer events are not produced).
async function swipe(p, selector, dx, dy) {
  await p.evaluate(async ({ selector, dx, dy }) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + Math.min(20, r.height / 2);
    const t = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const fire = (type, x, y) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t(x, y)], changedTouches: [t(x, y)] }));
    fire('touchstart', x0, y0);
    for (let i = 1; i <= 8; i++) { fire('touchmove', x0 + dx * i / 8, y0 + dy * i / 8); await new Promise((r) => setTimeout(r, 16)); }
    fire('touchend', x0 + dx, y0 + dy);
  }, { selector, dx, dy });
}

async function phoneChecks(browser, scheme) {
  const { ctx, p, errors } = await open(browser, { phone: true, scheme });
  const tag = 'phone-' + scheme;
  await p.screenshot({ path: path.join(SHOTS, tag + '-top.png') });

  check(tag + ': no horizontal page overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const fonts = await p.evaluate(() => {
    const bad = new Set();
    document.querySelectorAll('body *').forEach((e) => { const f = getComputedStyle(e).fontFamily; if (!/^-apple-system/.test(f)) bad.add(f); });
    return { bad: [...bad], links: document.querySelectorAll('link[href*="fonts.googleapis"]').length };
  });
  check(tag + ': only Apple system fonts', fonts.bad.length === 0 && fonts.links === 0, fonts.bad.slice(0, 3).join(' | '));
  check(tag + ': nutrient tables scroll on one axis', await p.evaluate(() => [...document.querySelectorAll('.tbl-wrap')].every((w) => getComputedStyle(w).overflowY === 'hidden')));

  // Navigation timing (each click renders synchronously)
  const ms = await p.evaluate(() => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) { document.getElementById('prev').click(); }
    for (let i = 0; i < 5; i++) { document.getElementById('next').click(); }
    return (performance.now() - t0) / 10;
  });
  check(tag + ': day change renders fast', ms < 120, ms.toFixed(1) + ' ms per render');

  // History pages its days and builds bodies lazily
  const hist = await p.evaluate(() => ({ days: document.querySelectorAll('#history .day').length, bodies: document.querySelectorAll('#history .day:not([open]) .meal-card').length }));
  check(tag + ': history pages days', hist.days > 0 && hist.days <= 60, hist.days + ' rendered');
  check(tag + ': closed history days are not built', hist.bodies === 0, hist.bodies + ' cards in closed days');

  // Edit a meal: all inputs >= 16px, table scroll and focus survive a commit
  await p.evaluate(() => window.scrollTo(0, document.getElementById('meals').offsetTop - 80));
  await p.click('#meals .meal-card .mc-actions button[aria-label="Mahlzeit bearbeiten"]');
  await p.waitForSelector('#meals .meal-card .q-in');
  const small = await p.evaluate(() => [...document.querySelectorAll('input:not([type=file]),select,textarea')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.className));
  check(tag + ': visible inputs are at least 16px', small.length === 0, small.slice(0, 5).join(', '));
  await p.evaluate(() => { const w = document.querySelector('#meals .meal-card .tbl-wrap'); w.scrollLeft = 300; });
  const ids = await p.evaluate(() => [...document.querySelectorAll('#meals .meal-card td.num .n-in')].slice(0, 2).map((e) => e.id));
  await p.focus('#' + CSS_escape(ids[0]));
  await p.fill('#' + CSS_escape(ids[0]), '321');
  await p.click('#' + CSS_escape(ids[1]));
  await p.waitForTimeout(100);
  const after = await p.evaluate(() => ({ left: document.querySelector('#meals .meal-card .tbl-wrap').scrollLeft, active: document.activeElement && document.activeElement.id }));
  check(tag + ': table keeps its scroll after an edit', Math.abs(after.left - 300) < 2, 'scrollLeft ' + after.left);
  check(tag + ': next field keeps focus after an edit', after.active === ids[1], 'active ' + after.active);
  await p.screenshot({ path: path.join(SHOTS, tag + '-edit.png') });

  // Delete the meal from edit mode: confirm sheet first (Abbrechen keeps it), then Löschen, then Undo
  const before = await p.evaluate(() => document.querySelectorAll('#meals .meal-card').length);
  await p.click('#meals .meal-card .mc-actions button[aria-label="Mahlzeit entfernen"]');
  await p.waitForSelector('.sheet .confirm-del', { timeout: 3000 }).catch(() => {});
  check(tag + ': delete asks "Mahlzeit löschen?" first', await p.evaluate(() => /Mahlzeit löschen\?/.test((document.querySelector('.sheet .confirm-q') || {}).textContent || '')));
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOTS, tag + '-confirm.png') });
  await p.click('.sheet-back.open .sheet-cancel');
  await p.waitForTimeout(450);
  check(tag + ': Abbrechen keeps the meal', await p.evaluate(() => document.querySelectorAll('#meals .meal-card').length) === before);
  await p.click('#meals .meal-card .mc-actions button[aria-label="Mahlzeit entfernen"]');
  await p.waitForSelector('.sheet-back.open .confirm-del', { timeout: 3000 });
  await p.waitForTimeout(350);
  await p.click('.sheet-back.open .confirm-del');
  await p.waitForFunction((n) => document.querySelectorAll('#meals .meal-card').length === n - 1, before, { timeout: 3000 }).catch(() => {});
  const gone = await p.evaluate(() => document.querySelectorAll('#meals .meal-card').length);
  check(tag + ': Löschen deletes the meal', gone === before - 1, before + ' -> ' + gone);
  const undo = await p.$('#toast .toast-act');
  check(tag + ': delete offers Undo', !!undo && await undo.isVisible());
  await p.screenshot({ path: path.join(SHOTS, tag + '-undo.png') });
  if (undo) {
    await undo.click();
    await p.waitForFunction((n) => document.querySelectorAll('#meals .meal-card').length === n, before, { timeout: 3000 }).catch(() => {});
    check(tag + ': Undo restores the meal', await p.evaluate(() => document.querySelectorAll('#meals .meal-card').length) === before);
  }

  // Settings sheet: opens, pull down closes
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#open-settings');
  await p.waitForTimeout(450);
  const sheetOpen = await p.evaluate(() => { const s = document.querySelector('#settings .sheet'); return !!s && !document.getElementById('settings').hidden && s.getBoundingClientRect().top < innerHeight; });
  check(tag + ': settings opens as a sheet', sheetOpen);
  const small2 = await p.evaluate(() => [...document.querySelectorAll('#settings input,#settings select')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id));
  check(tag + ': settings inputs are at least 16px', small2.length === 0, small2.slice(0, 5).join(', '));
  await p.screenshot({ path: path.join(SHOTS, tag + '-settings.png') });
  await swipe(p, '#settings .sheet-grab', 0, 220);
  await p.waitForTimeout(500);
  check(tag + ': pulling the settings sheet down closes it', await p.evaluate(() => document.getElementById('settings').hidden));

  // Picker sheet
  await p.click('#open-recent');
  await p.waitForSelector('.sheet .pick-row', { timeout: 3000 }).catch(() => {});
  const rows = await p.evaluate(() => document.querySelectorAll('.sheet .pick-row').length);
  check(tag + ': food picker opens as a sheet with rows', rows > 0, rows + ' rows');
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOTS, tag + '-picker.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  check(tag + ': Escape closes the picker', await p.evaluate(() => !document.querySelector('.sheet-back:not(#settings)')));

  // Day swipe on the hero card
  await swipe(p, '.hero-card', 160, 4);
  await p.waitForTimeout(350);
  check(tag + ': swiping right goes to yesterday', await p.evaluate(() => document.getElementById('rel-label').textContent) === 'Gestern');
  await p.click('#daylabel');

  // A transient write failure is retried
  await p.evaluate(() => { window.__failNext = 1; window.__writes.length = 0; });
  await p.click('#water .split.water .sp-plus');
  await p.waitForTimeout(1800);
  const w = await p.evaluate(() => ({ writes: window.__writes.map((x) => x.path), toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }));
  check(tag + ': water write retried after a transient failure', w.writes.some((x) => x.startsWith('days/')) && !/nicht gespeichert/.test(w.toast), w.writes.join(', ') + ' ' + w.toast);

  // Bottom of the page clears the edge
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(400);
  const hist2 = await p.evaluate(() => document.querySelectorAll('#history .day').length);
  check(tag + ': scrolling down loads more history', hist2 > hist.days, hist.days + ' -> ' + hist2);
  await p.screenshot({ path: path.join(SHOTS, tag + '-bottom.png') });

  check(tag + ': no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function desktopChecks(browser, scheme) {
  const { ctx, p, errors } = await open(browser, { phone: false, scheme });
  const tag = 'desktop-' + scheme;
  await p.screenshot({ path: path.join(SHOTS, tag + '.png') });
  await p.click('#open-settings');
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(SHOTS, tag + '-settings.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  check(tag + ': Escape closes settings', await p.evaluate(() => document.getElementById('settings').hidden));
  check(tag + ': no horizontal page overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check(tag + ': no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

function CSS_escape(s) { return s.replace(/([^a-zA-Z0-9_-])/g, '\\$1'); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  try {
    for (const scheme of ['light', 'dark']) await phoneChecks(browser, scheme);
    for (const scheme of ['light', 'dark']) await desktopChecks(browser, scheme);
  } catch (e) {
    console.log('FAIL crashed: ' + (e && e.stack || e));
    failed++;
  }
  await browser.close();
  server.close();
  console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
