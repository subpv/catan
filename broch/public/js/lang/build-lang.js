// Builds lang/<code>.js from lang/src/<code>.txt.
// Each source line is "N|translation" where N is the line number of the English text in _keys.json.
// Checks that every line exists and that placeholders like {n} or {@p} are kept.
// Usage: node public/js/lang/build-lang.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const keys = JSON.parse(fs.readFileSync(path.join(dir, '_keys.json'), 'utf8'));
const ph = s => (s.match(/\{[@$#%]?\w+\}/g) || []).sort().join(' ');
let problems = 0;

for (const file of fs.readdirSync(path.join(dir, 'src')).filter(f => f.endsWith('.txt')).sort()) {
  const code = file.replace('.txt', '');
  const lines = fs.readFileSync(path.join(dir, 'src', file), 'utf8').split('\n').filter(l => l.trim());
  const out = {};
  const seen = new Set();
  for (const line of lines) {
    const m = /^(\d+)\|(.*)$/.exec(line);
    if (!m) { console.log(`${code}: bad line: ${line.slice(0, 60)}`); problems++; continue; }
    const n = +m[1], text = m[2].trim();
    const key = keys[n - 1];
    if (key == null) { console.log(`${code}: line ${n} has no English key`); problems++; continue; }
    if (ph(key) !== ph(text)) { console.log(`${code}: placeholder mismatch at ${n}: "${key}" -> "${text}"`); problems++; continue; }
    seen.add(n);
    out[key] = text;
  }
  const missing = keys.map((_, i) => i + 1).filter(n => !seen.has(n));
  if (missing.length) { console.log(`${code}: missing ${missing.length} lines: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`); problems += missing.length; }
  fs.writeFileSync(path.join(dir, `${code}.js`), `// Generated from src/${file} by build-lang.js. Edit the .txt and rebuild.\nexport default ${JSON.stringify(out, null, 0).replace(/","/g, '",\n"')};\n`);
  console.log(`${code}: ${Object.keys(out).length}/${keys.length}`);
}
process.exit(problems ? 1 : 0);
