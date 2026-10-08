'use strict';
// Builds everything that is handed out: ../dist/broch-demo.html (the playable demo), ../PROGRESS.md and ../dist/broch.zip.
// Usage: cd broch && node scripts/make-dist.js   (needs esbuild: npm i --no-save esbuild, and the zip command)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
run(process.execPath, [path.join(__dirname, '..', 'demo', 'progress.js')], root);
run(process.execPath, [path.join(__dirname, '..', 'demo', 'build.js')], root);
const zip = path.join(root, 'dist', 'broch.zip');
fs.rmSync(zip, { force: true });
run('zip', ['-qr', zip, 'broch', '-x', 'broch/node_modules/*', 'broch/data/*', 'broch/.git/*'], root);
console.log('dist/ is ready');
