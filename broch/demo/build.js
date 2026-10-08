// Builds a single self-contained HTML file that runs Broch entirely in the browser.
// Usage: node demo/build.js  (needs esbuild: npm i -D esbuild)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const out = path.join(root, '..', 'dist', 'broch-demo.html'); // the file that is handed out

const entry = `import './mock.js';\nimport '../public/js/app.js';\n`;
const js = esbuild.buildSync({
  stdin: { contents: entry, resolveDir: __dirname, sourcefile: 'entry.js' },
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', logOverride: { 'empty-glob': 'silent' },
}).outputFiles[0].text;

const css = ['styles.css', 'css/mobile-shell.css', 'css/mobile-game.css', 'css/mobile-dialogs.css'].map(f => fs.readFileSync(path.join(root, 'public', f), 'utf8')).join('\n');
const icon = 'data:image/svg+xml,' + encodeURIComponent(fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace(/<link rel="(icon|apple-touch-icon)" href="\/icon.svg">/g, `<link rel="$1" href="${icon}">`)
  .replace('<title>Broch</title>', '<title>Broch Demo</title>')
  .replace(/<!--[^>]*-->\s*/g, '').replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet" href="\/css\/mobile-[a-z]+\.css">\s*/g, '')
  .replace('<link rel="stylesheet" href="/styles.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="/js/app.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, Math.round(html.length / 1024) + ' KB');
