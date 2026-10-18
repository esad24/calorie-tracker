// Stitches src/index.html and its "<!-- @include path -->" lines into dist/app.html, the file that gets published.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist', 'app.html');
const INCLUDE = /^\s*<!-- @include (\S+) -->\s*$/;

const used = new Set();
const lineMap = []; // output line -> "file:line", for readable syntax errors

function expand(rel) {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) throw new Error('Missing include: ' + rel);
  used.add(rel);
  const lines = fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = INCLUDE.exec(line);
    if (m) { out.push(...expand(m[1])); return; }
    out.push({ text: line, from: rel + ':' + (i + 1) });
  });
  return out;
}

const lines = expand('index.html');
lines.forEach((l) => lineMap.push(l.from));
const html = lines.map((l) => l.text).join('\n') + '\n';

// Syntax-check the inline app script (the last <script> without src).
const start = html.lastIndexOf('<script>');
const end = html.indexOf('</script>', start);
const script = html.slice(start + '<script>'.length, end);
const firstLine = html.slice(0, start).split('\n').length - 1;
try {
  new vm.Script(script, { filename: 'app.js' });
} catch (e) {
  const m = /app\.js:(\d+)/.exec(e.stack || '');
  const at = m ? lineMap[firstLine + Number(m[1]) - 1] : '?';
  console.error('Syntax error at ' + at + ': ' + e.message);
  process.exit(1);
}

// Every file under src/ must be included somewhere, so nothing is silently dropped.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.relative(SRC, path.join(dir, d.name))]);
}
const orphans = walk(SRC).filter((f) => !used.has(f));
if (orphans.length) {
  console.error('Orphan files (not included): ' + orphans.join(', '));
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('Built ' + path.relative(__dirname, OUT) + ' (' + Math.round(html.length / 1024) + ' KB, ' + lines.length + ' lines)');
