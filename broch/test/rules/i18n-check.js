// i18n checks (no server needed): the word "Catan" must not appear in visible texts, and the texts that the
// Traders & Barbarians screens look up from plain tables must have a translation in all 15 languages.
// Usage: node test/rules/i18n-check.js   (set I18N_VERBOSE=1 to list every untranslated key)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const CODES = ['de', 'da', 'sv', 'nb', 'nl', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'uk', 'ko', 'ja', 'zh'];
let failed = 0;
const fail = m => { failed++; console.log('FAIL ' + m); };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'demo') walk(p, out); } else out.push(p);
  }
  return out;
}

// 1. The product name of the original game must not show up in the UI (code comments are fine).
const BAD = /catan|カタン|卡坦|카탄|катан/i;
for (const f of walk(path.join(root, 'public', 'js')).concat(fs.readdirSync(path.join(root, 'demo')).filter(n => n.endsWith('.js')).map(n => path.join(root, 'demo', n)))) {
  if (!/\.(js|tsv|txt|json)$/.test(f)) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = f.endsWith('.js') ? line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '') : line;
    if (BAD.test(code)) fail(`${path.relative(root, f)}:${i + 1} contains the word Catan: ${code.trim().slice(0, 80)}`);
  });
}

// 2. Texts held in plain tables (invisible to a grep for t('...')) must be translated.
async function main() {
  const dict = {};
  for (const c of CODES) dict[c] = { ...(await import(path.join(root, 'public/js/lang', c + '.js'))).default, ...(await import(path.join(root, 'public/js/lang/x', c + '.js'))).default };
  const hub = fs.readFileSync(path.join(root, 'public/js/games/traders-barbarians/hub.js'), 'utf8');
  const keys = new Set(['bank {n}']);
  for (const m of hub.matchAll(/'(Waiting for \{names\}[^']*)'/g)) keys.add(m[1]);
  for (const k of keys) {
    const miss = CODES.filter(c => !dict[c][k]);
    if (miss.length) fail(`no translation (${miss.join(',')}): ${k}`);
  }
  console.log(failed ? `i18n-check: ${failed} problems` : `i18n-check: ok (${keys.size} table texts x ${CODES.length} languages)`);
  process.exit(failed ? 1 : 0);
}
main();
