'use strict';
// Builds everything that is handed out:
//   dist/broch-demo.html  the playable demo (open it in a browser, no server needed)
//   dist/broch-app.zip    the server app, ready to unpack into the TrueNAS dataset (includes the production node_modules, so nothing has to be installed there)
//   PROGRESS.md           status of every mode
// Usage: cd broch && node scripts/make-dist.js   (needs esbuild: npm i --no-save esbuild, plus the zip and npm commands)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const app = path.join(__dirname, '..');
const root = path.join(app, '..');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
run(process.execPath, [path.join(app, 'demo', 'progress.js')], root);
run(process.execPath, [path.join(app, 'demo', 'build.js')], root);

// the server app: only what runs in production
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-app-'));
for (const f of ['server', 'public']) fs.cpSync(path.join(app, f), path.join(stage, f), { recursive: true });
for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(app, f), path.join(stage, f));
run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], stage);
const zip = path.join(root, 'dist', 'broch-app.zip');
fs.rmSync(zip, { force: true });
run('zip', ['-qr', zip, '.'], stage);
fs.rmSync(stage, { recursive: true, force: true });
console.log('dist/ is ready:', fs.readdirSync(path.join(root, 'dist')).join(', '));
