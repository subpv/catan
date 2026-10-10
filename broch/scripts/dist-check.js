#!/usr/bin/env node
'use strict';
// Is dist/broch-app.zip up to date with the source? Compares server/, public/ (without the generated public/demo) and scripts/admin.js inside the zip with the files on disk.
// Run it as the last step before you hand the zip out:  node scripts/make-dist.js && npm run dist:check   (needs the unzip command)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const app = path.join(__dirname, '..');
const zip = path.join(app, '..', 'dist', 'broch-app.zip');
if (!fs.existsSync(zip)) { console.error('dist/broch-app.zip does not exist: run node scripts/make-dist.js'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-check-'));
let bad = 0;
try {
  execFileSync('unzip', ['-q', zip, '-d', tmp]);
  const walk = (base, rel = '') => fs.readdirSync(path.join(base, rel), { withFileTypes: true }).flatMap(e => {
    const r = path.join(rel, e.name);
    if (r === path.join('public', 'demo')) return [];
    return e.isDirectory() ? walk(base, r) : [r];
  });
  const inZip = new Set(['server', 'public'].flatMap(d => walk(tmp, d)).concat(['scripts/admin.js']));
  const onDisk = new Set(['server', 'public'].flatMap(d => walk(app, d)).concat(['scripts/admin.js']));
  for (const f of new Set([...inZip, ...onDisk])) {
    let why = null;
    if (!inZip.has(f)) why = 'missing in the zip';
    else if (!onDisk.has(f)) why = 'only in the zip (deleted from the source)';
    else if (!fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(app, f)))) why = 'differs';
    if (why) { bad++; if (bad <= 30) console.log(`  ${f}: ${why}`); }
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (bad) { console.error(`dist/broch-app.zip is STALE (${bad} file(s)). Rebuild: node scripts/make-dist.js`); process.exit(1); }
console.log('dist/broch-app.zip matches server/, public/ and scripts/admin.js.');
