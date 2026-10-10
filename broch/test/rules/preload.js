'use strict';
// public/index.html lists every ES module the app loads on start as <link rel="modulepreload">, so the browser fetches them all in one
// round trip instead of one import level at a time. This walks the static import graph from app.js and fails when a module is missing
// from that list (or the list names a file that is gone). Fix: add or remove the matching <link> line in public/index.html.
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');

const listed = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(m => m[1]);
const seen = new Set();
(function walk(url) {
  if (seen.has(url)) return;
  seen.add(url);
  const src = fs.readFileSync(path.join(pub, url), 'utf8');
  // static imports only: `import x from './a.js'`, `import './a.js'`, `export * from './a.js'` (also over several lines)
  for (const m of src.matchAll(/(?:^|[;\n])\s*(?:import|export)\s[^'"`;]*?['"](\.{1,2}\/[^'"]+\.js)['"]|(?:^|[;\n])\s*import\s*['"](\.{1,2}\/[^'"]+\.js)['"]/g)) {
    const rel = m[1] || m[2];
    walk(path.posix.normalize(path.posix.join(path.posix.dirname(url), rel)));
  }
})('/js/app.js');

const missing = [...seen].filter(u => !listed.includes(u) && u !== '/js/app.js');
const stale = listed.filter(u => !fs.existsSync(path.join(pub, u)));
const dups = listed.filter((u, i) => listed.indexOf(u) !== i);
if (missing.length || stale.length || dups.length) {
  if (missing.length) console.error('Missing <link rel="modulepreload"> in public/index.html for:\n  ' + missing.join('\n  '));
  if (stale.length) console.error('modulepreload points to files that do not exist:\n  ' + stale.join('\n  '));
  if (dups.length) console.error('modulepreload listed twice:\n  ' + dups.join('\n  '));
  process.exit(1);
}
console.log(`modulepreload: all ${seen.size} modules of app.js are preloaded`);
