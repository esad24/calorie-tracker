// Builds the single-file artifact page: inlines src/styles.css and wraps the
// src/js/*.js modules (in file-name order) in one IIFE so they share a scope.
// Output: dist/index.html plus dist/bls.json, ready to publish as the artifact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

const indent = (text) => text.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');

const jsDir = path.join(src, 'js');
const modules = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
const js = '(function () {\n' +
  modules.map((f) => indent(fs.readFileSync(path.join(jsDir, f), 'utf8').trimEnd())).join('\n\n') +
  '\n})();';
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8').trimEnd();

const template = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
for (const marker of ['/* build:css */', '/* build:js */']) {
  if (!template.includes(marker)) throw new Error('src/index.html is missing ' + marker);
}
// Function replacers, so "$" sequences in the code are not treated as patterns.
const html = template.replace('/* build:css */', () => css).replace('/* build:js */', () => js);

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.copyFileSync(path.join(root, 'data', 'bls.json'), path.join(dist, 'bls.json'));
console.log(`dist/index.html: ${modules.length} modules, ${(html.length / 1024).toFixed(1)} KB`);
