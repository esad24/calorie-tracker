// Deterministic, realistic sample log (German foods, ~5 months) for tests. Every day doc carries demo:true.
'use strict';

// per 100 g: kcal, protein, carbs, fat, sugar, salt (g), potassium (mg), gi
const F = {
  'Haferflocken': [370, 13.5, 58.7, 7, 1.1, 0, 360, 55],
  'Milch 1,5 %': [47, 3.4, 4.9, 1.5, 4.9, 0.1, 155, 31],
  'Banane': [93, 1.2, 20, 0.2, 17, 0, 370, 51],
  'Vollkornbrot': [216, 7, 39, 1.2, 3, 1.1, 290, 51],
  'Butter': [741, 0.7, 0.6, 83, 0.6, 0, 16, null],
  'Gouda': [356, 25, 0, 28, 0, 2, 120, null],
  'Hähnchenbrust': [110, 23.5, 0, 1.5, 0, 0.2, 360, null],
  'Reis gekocht': [130, 2.7, 28, 0.3, 0.1, 0, 35, 73],
  'Brokkoli': [34, 3.8, 2.7, 0.2, 1.7, 0, 330, 15],
  'Nudeln gekocht': [150, 5.2, 30, 0.9, 0.6, 0, 45, 49],
  'Tomatensoße': [55, 1.5, 7, 2, 5.5, 0.9, 300, 45],
  'Apfel': [54, 0.3, 12, 0.2, 10, 0, 120, 36],
  'Naturjoghurt 3,5 %': [66, 3.8, 4.7, 3.5, 4.7, 0.1, 170, 35],
  'Ei': [137, 12.9, 0.7, 9.3, 0.7, 0.4, 145, null],
  'Lachs': [202, 20, 0, 13.6, 0, 0.1, 380, null],
  'Kartoffeln gekocht': [72, 2, 15, 0.1, 0.8, 0, 400, 78],
  'Magerquark': [67, 12, 4, 0.2, 4, 0.1, 160, 30],
  'Erdbeeren': [32, 0.8, 5.5, 0.4, 5.5, 0, 150, 40],
  'Avocado': [160, 2, 3.6, 15, 0.7, 0, 485, 15],
  'Olivenöl': [884, 0, 0, 100, 0, 0, 1, null],
  'Döner im Fladenbrot': [215, 11, 22, 9, 3, 1.3, 260, 60],
  'Pizza Margherita': [240, 10, 30, 8.5, 3.5, 1.2, 200, 61],
  'Müsli mit Früchten': [360, 9, 64, 6, 22, 0.1, 400, 57],
  'Frischkäse': [240, 6, 3.5, 23, 3.5, 0.8, 120, null],
  'Gurke': [12, 0.6, 1.8, 0.2, 1.7, 0, 140, 15],
  'Vollkornbrötchen mit Frischkäse, Räucherlachs und Gurke (selbst belegt)': [228, 11, 24, 9, 3, 1.6, 230, 55],
  'Linsen gekocht': [116, 9, 17, 0.4, 1.8, 0, 370, 32],
  'Zartbitterschokolade 70 %': [580, 8, 34, 42, 28, 0, 715, 23],
  'Mandeln': [612, 24, 5.7, 54, 4.4, 0, 700, 15]
};

const MEALS = [
  { name: 'Haferbrei mit Banane', t: [7, 9], parts: [['Haferflocken', 60, 90], ['Milch 1,5 %', 200, 300, 'ml'], ['Banane', 100, 130]] },
  { name: 'Käsebrot', t: [7, 9], parts: [['Vollkornbrot', 80, 120], ['Butter', 8, 12], ['Gouda', 30, 45]] },
  { name: 'Quark mit Erdbeeren', t: [7, 10], parts: [['Magerquark', 200, 250], ['Erdbeeren', 120, 180]] },
  { name: 'Müsli', t: [7, 9], parts: [['Müsli mit Früchten', 50, 80], ['Milch 1,5 %', 150, 200, 'ml']] },
  { name: 'Hähnchen mit Reis', t: [12, 14], parts: [['Hähnchenbrust', 150, 200], ['Reis gekocht', 180, 250], ['Brokkoli', 120, 180], ['Olivenöl', 5, 10, 'ml']] },
  { name: 'Nudeln mit Tomatensoße', t: [12, 14], parts: [['Nudeln gekocht', 220, 300], ['Tomatensoße', 120, 160], ['Gouda', 15, 25]] },
  { name: 'Döner', t: [12, 14], parts: [['Döner im Fladenbrot', 380, 450]] },
  { name: 'Lachs mit Kartoffeln', t: [18, 20], parts: [['Lachs', 140, 180], ['Kartoffeln gekocht', 220, 300], ['Brokkoli', 100, 150]] },
  { name: 'Pizza', t: [18, 21], parts: [['Pizza Margherita', 320, 400]] },
  { name: 'Linsen-Bowl', t: [18, 20], parts: [['Linsen gekocht', 200, 260], ['Avocado', 60, 90], ['Gurke', 80, 120], ['Olivenöl', 5, 10, 'ml']] },
  { name: 'Brötchen mit Lachs', t: [12, 13], parts: [['Vollkornbrötchen mit Frischkäse, Räucherlachs und Gurke (selbst belegt)', 140, 170]] },
  { name: 'Rührei', t: [8, 10], parts: [['Ei', 110, 170], ['Butter', 5, 8], ['Vollkornbrot', 50, 60]] }
];
const SNACKS = [
  { name: 'Apfel', parts: [['Apfel', 140, 190]] },
  { name: 'Joghurt', parts: [['Naturjoghurt 3,5 %', 150, 200]] },
  { name: 'Schokolade', parts: [['Zartbitterschokolade 70 %', 20, 40]] },
  { name: 'Mandeln', parts: [['Mandeln', 25, 40]] }
];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const r1 = (v) => Math.round(v * 10) / 10;

function part(name, g, unit) {
  const [k, p, c, f, s, l, m, gi] = F[name];
  const x = g / 100;
  const o = { name, qty: g, unit: unit || 'g', amount: g + ' ' + (unit || 'g'), kcal: Math.round(k * x), protein: r1(p * x), carbs: r1(c * x), fat: r1(f * x), sugar: r1(s * x), salt: r1(l * x), potassium: Math.round(m * x) };
  if (gi) o.gi = gi;
  return o;
}
function meal(def, time, rand, id) {
  const parts = def.parts.map(([n, a, b, u]) => part(n, Math.round((a + rand() * (b - a)) / 5) * 5, u));
  const m = { id, time, name: def.name, items: parts.map((p) => p.amount + ' ' + p.name).join(', ').slice(0, 300), parts };
  ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'salt', 'potassium'].forEach((k) => {
    const v = parts.reduce((s, p) => s + p[k], 0);
    m[k] = k === 'kcal' || k === 'potassium' ? Math.round(v) : r1(v);
  });
  const gl = parts.reduce((s, p) => s + (p.gi ? p.gi * p.carbs / 100 : 0), 0);
  m.gl = Math.round(gl * 100) / 100;
  return m;
}

// Returns { [path]: data } for the mock db. today: Date.
function sampleDb(today, days = 150) {
  const rand = rng(42);
  const db = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = keyOf(d);
    if (i > 0 && rand() < 0.12) continue; // some days not logged
    const pick = (lo, hi) => MEALS.filter((m) => m.t[0] >= lo && m.t[0] <= hi);
    const slots = [pick(7, 10), pick(12, 14), pick(18, 21)];
    const meals = [];
    slots.forEach((list, si) => {
      if (i === 0 && si === 2) return; // today: dinner not eaten yet
      const def = list[Math.floor(rand() * list.length)];
      const h = def.t[0] + Math.floor(rand() * (def.t[1] - def.t[0] + 1));
      meals.push(meal(def, pad(h) + ':' + pad(Math.floor(rand() * 4) * 15), rand, key + '-' + si));
    });
    if (rand() < 0.55) {
      const def = SNACKS[Math.floor(rand() * SNACKS.length)];
      meals.push(meal(def, pad(15 + Math.floor(rand() * 3)) + ':' + pad(Math.floor(rand() * 4) * 15), rand, key + '-s'));
    }
    const cafLog = [];
    let coffee = 0, caffeine = 0, cola = 0;
    const cups = 1 + Math.floor(rand() * 3);
    for (let c = 0; c < cups; c++) {
      const h = 7 + c * 3 + Math.floor(rand() * 2);
      const kind = rand() < 0.8 ? 'coffee' : 'cola';
      const ml = kind === 'coffee' ? (rand() < 0.5 ? 250 : 100) : (rand() < 0.5 ? 250 : 500);
      const mg = kind === 'coffee' ? Math.round(ml * 0.4) : 0;
      cafLog.push({ t: pad(h) + ':' + pad(Math.floor(rand() * 60)), h, k: kind, ml, mg });
      if (kind === 'coffee') { coffee += ml; caffeine += mg; } else cola += ml;
    }
    db['days/' + key] = { date: key, demo: true, meals, water: Math.round(rand() * 12) * 250, coffee, caffeine, cola, cafLog };
  }
  db['settings/goals'] = { kcal: 2100, protein: 120, carbs: 230, fat: 70, sugar: 50, salt: 6, potassium: 4000, water: 2500 };
  const anyDay = Object.keys(db).find((k) => k.startsWith('days/'));
  const fm = db[anyDay].meals[0];
  db['settings/favorites'] = { list: [{ type: 'meal', key: fm.items.toLowerCase(), meal: Object.assign({}, fm, { id: undefined, time: undefined }) }] };
  return db;
}

module.exports = { sampleDb };
