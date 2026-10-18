// Syntax-checks the inlined script of the built page without running it.
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) throw new Error(`expected 1 inline script, found ${scripts.length}`);
new Function(scripts[0]);
console.log('dist/index.html: inline script parses');
