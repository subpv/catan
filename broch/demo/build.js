// Builds the demo that runs Broch entirely in the browser (the real rules engine, bots play the other seats).
//   node demo/build.js            one self-contained HTML file: dist/broch-demo.html (open it from anywhere, no server needed)
//   node demo/build.js --public   the PUBLIC demo for the real site: public/demo/ (index.html + ES module + chunks + demo.css), served at /demo by the server.
//                                 No inline script or style (the strict CSP script-src 'self' applies), the same css files as the app, one lazy chunk per language.
//                                 public/demo/ is generated (git-ignored). --out <dir> writes it somewhere else (scripts/make-dist.js builds it straight into the release staging folder).
// Needs esbuild (npm i -D esbuild).
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const pub = process.argv.includes('--public');
const read = f => fs.readFileSync(path.join(root, 'public', f), 'utf8');

(pub ? buildPublic() : Promise.resolve(buildSingle())).catch(e => { console.error(e.message || e); process.exit(1); });

function buildSingle() {
  const out = path.join(root, '..', 'dist', 'broch-demo.html'); // the file that is handed out
  const entry = `import './mock.js';\nimport '../public/js/app.js';\n`;
  const js = esbuild.buildSync({
    stdin: { contents: entry, resolveDir: __dirname, sourcefile: 'entry.js' },
    bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', logOverride: { 'empty-glob': 'silent' },
  }).outputFiles[0].text;

  const sheets = [...read('index.html').matchAll(/<link rel="stylesheet" href="\/([^"]+\.css)">/g)].map(m => m[1]); // every local stylesheet of the app, in page order
  const css = sheets.map(read).join('\n');
  const icon = 'data:image/svg+xml,' + encodeURIComponent(read('icon.svg'));
  let inlined = 0;
  const html = read('index.html')
    .replace(/<link rel="(icon|apple-touch-icon)" href="\/icon.svg">/g, `<link rel="$1" href="${icon}">`)
    .replace('<title>Broch</title>', '<title>Broch Demo</title>')
    .replace(/<!--[\s\S]*?-->\s*/g, '').replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
    .replace(/<meta (property="og:|name="twitter:|name="description")[^>]*>\s*/g, '').replace(/<link rel="canonical"[^>]*>\s*/g, '')
    .replace(/<link rel="stylesheet" href="\/[^"]+\.css">\s*/g, () => (inlined++ ? '' : `<style>${css}</style>\n`))
    .replace('<script type="module" src="/js/app.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log('wrote', out, Math.round(html.length / 1024) + ' KB');
}

async function buildPublic() {
  const i = process.argv.indexOf('--out');
  const out = i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(root, 'public', 'demo');
  fs.rmSync(out, { recursive: true, force: true });
  const entry = `import './public-prelude.js';\nimport './mock.js';\nimport '../public/js/app.js';\n`; // the prelude runs first: flag + storage shim
  // the developer progress overview (German notes for the owner) is not part of the public demo
  const noProgress = { name: 'no-progress', setup(b) { b.onResolve({ filter: /progress-data\.js$/ }, () => ({ path: 'progress-data', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {};', loader: 'js' })); } };
  const r = await esbuild.build({
    stdin: { contents: entry, resolveDir: __dirname, sourcefile: 'entry.js' },
    bundle: true, format: 'esm', splitting: true, minify: true, target: 'es2020', logOverride: { 'empty-glob': 'silent' },
    outdir: out, entryNames: 'demo', chunkNames: 'chunks/[name]-[hash]', metafile: true, plugins: [noProgress],
  });
  fs.copyFileSync(path.join(__dirname, 'demo.css'), path.join(out, 'demo.css'));
  // the same page as the app, minus everything that belongs to the real app (manifest, preloads of the app's own modules, build stamp)
  const html = read('index.html')
    .replace('<title>Broch</title>', '<title>Broch Demo</title>')
    .replace(/<!--[\s\S]*?-->\s*/g, '').replace(/<link rel="modulepreload"[^>]*>\s*/g, '').replace(/<link rel="manifest"[^>]*>\s*/g, '')
    .replace(/<meta name="broch-build"[^>]*>\s*/, '') // no build stamp: the demo's texts are bundled, not fetched with ?v=
    .replace(/(<meta property="og:url" content=")[^"]*"/, '$1__ORIGIN__/demo/"').replace(/(<link rel="canonical" href=")[^"]*"/, '$1__ORIGIN__/demo/"')
    .replace('</head>', '<link rel="stylesheet" href="/demo/demo.css">\n</head>')
    .replace('<script type="module" src="/js/app.js"></script>', '<script type="module" src="/demo/demo.js"></script>');
  if (/<script(?![^>]*\bsrc=)/i.test(html) || /\son[a-z]+=/i.test(html)) throw new Error('the public demo page must not contain inline script');
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const files = Object.keys(r.metafile.outputs).length + 2;
  console.log('wrote', out, `(${files} files, ${Math.round(fs.statSync(path.join(out, 'demo.js')).size / 1024)} KB entry)`);
}
