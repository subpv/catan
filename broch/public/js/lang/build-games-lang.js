// Builds lang/x/<code>.js from lang/games/*.tsv (the texts of the standalone games).
// Every line of a .tsv is: English <TAB> de <TAB> da <TAB> sv <TAB> nb <TAB> nl <TAB> fr <TAB> es <TAB> it <TAB> pt <TAB> pl <TAB> tr <TAB> uk <TAB> ko <TAB> ja <TAB> zh
// The English text is the key the code uses. Placeholders like {n} or {@p} must be kept. Usage: node public/js/lang/build-games-lang.js
const fs = require('fs');
const path = require('path');

const CODES = ['de', 'da', 'sv', 'nb', 'nl', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'uk', 'ko', 'ja', 'zh'];
const dir = path.join(__dirname, 'games');
const ph = s => (s.match(/\{[@$#%]?\w+\}/g) || []).sort().join(' ');
const out = Object.fromEntries(CODES.map(c => [c, {}]));
let problems = 0, rows = 0;

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.tsv')).sort()) {
  fs.readFileSync(path.join(dir, file), 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const cols = line.split('\t');
    if (cols.length !== CODES.length + 1) { console.log(`${file}:${i + 1}: ${cols.length} columns, expected ${CODES.length + 1}: ${cols[0].slice(0, 50)}`); problems++; return; }
    rows++;
    CODES.forEach((c, k) => {
      const text = cols[k + 1].trim();
      if (!text) { console.log(`${file}:${i + 1}: empty ${c}: ${cols[0].slice(0, 50)}`); problems++; return; }
      if (ph(cols[0]) !== ph(text)) { console.log(`${file}:${i + 1}: placeholders differ in ${c}: "${cols[0]}" -> "${text}"`); problems++; return; }
      out[c][cols[0]] = text;
    });
  });
}
fs.mkdirSync(path.join(__dirname, 'x'), { recursive: true });
for (const c of CODES) fs.writeFileSync(path.join(__dirname, 'x', `${c}.js`), `// Generated from lang/games/*.tsv by build-games-lang.js. Edit the .tsv and rebuild.\nexport default ${JSON.stringify(out[c]).replace(/","/g, '",\n"')};\n`);
console.log(`${rows} texts x ${CODES.length} languages${problems ? `, ${problems} problems` : ''}`);
process.exit(problems ? 1 : 0);
