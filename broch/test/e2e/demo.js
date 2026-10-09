'use strict';
// The public demo (served at /demo): build, serving, headers, link preview tags, and a real browser playing a classic game against bots.
// Usage: NODE_PATH=$(npm root -g) node test/e2e/demo.js     (needs esbuild and playwright with a chromium; npm run test:demo)
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); }

const app = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok   ' + m); };

function start(port, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-demo-'));
  const proc = spawn(process.execPath, [path.join(app, 'server', 'index.js')], { env: { ...process.env, PORT: port, DATA_DIR: dir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const s = { proc, out: '' };
  proc.stdout.on('data', d => { s.out += d; }); proc.stderr.on('data', d => { s.out += d; });
  return s;
}
function get(port, url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}

(async () => {
  const PORT = 22000 + Math.floor(Math.random() * 900);
  const servers = [start(PORT, { TRUST_PROXY: '1', BROCH_BOT_DELAY: '0' }), start(PORT + 1000, { TRUST_PROXY: '', BROCH_BOT_DELAY: '0' })];
  let browser;
  try {
    execFileSync(process.execPath, [path.join(app, 'demo', 'build.js'), '--public'], { stdio: 'inherit' });
    for (let i = 0; i < 40 && !servers.every(s => /listening/.test(s.out)); i++) await sleep(150);

    // ---- serving
    let r = await get(PORT, '/demo/', { 'x-forwarded-proto': 'https', host: 'catan.example.org' });
    assert(r.status === 200 && /text\/html/.test(r.headers['content-type']), '/demo/ serves 200 html');
    assert((await get(PORT, '/demo')).status === 200, '/demo (no slash) serves the page too');
    const csp = r.headers['content-security-policy'] || '';
    const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
    assert(/'self'/.test(scriptSrc) && !/unsafe-inline|unsafe-eval|\*/.test(scriptSrc), "CSP script-src is 'self' only (no unsafe-inline)");
    assert(!/<script(?![^>]*\bsrc=)/i.test(r.body) && !/\son[a-z]+\s*=/i.test(r.body), 'the demo page has no inline script or event handler');
    assert(/Cache-Control/i.test(Object.keys(r.headers).join()) && /private/.test(r.headers['cache-control']) && r.headers.etag, 'private no-cache with an ETag, like every static file');
    assert((await get(PORT, '/demo/', { 'if-none-match': r.headers.etag, 'x-forwarded-proto': 'https', host: 'catan.example.org' })).status === 304, 'revalidating with the ETag answers 304');
    const js = (r.body.match(/src="(\/demo\/[^"]+\.js)"/) || [])[1];
    const jr = js && await get(PORT, js, { 'accept-encoding': 'br' });
    assert(jr && jr.status === 200 && jr.headers['content-encoding'] === 'br' && /javascript/.test(jr.headers['content-type']), 'the demo module is served as javascript, brotli compressed');
    assert((await get(PORT, '/demo/does-not-exist.js')).status === 404 && (await get(PORT, '/demo/chunks/')).status === 404, 'unknown files below /demo are 404');
    assert(/<link rel="stylesheet" href="\/css\/mobile-shell\.css">/.test(r.body) && /href="\/styles\.css"/.test(r.body), 'the demo uses the same css files as the app');

    // ---- link preview tags
    const abs = u => new RegExp(`content="https://catan\\.example\\.org${u}"`);
    assert(!/__ORIGIN__/.test(r.body), '__ORIGIN__ is replaced in the demo page');
    assert(abs('/og-image\\.png').test(r.body) && /<meta property="og:url" content="https:\/\/catan\.example\.org\/demo\/">/.test(r.body), 'demo: og:image / og:url are absolute https urls (x-forwarded-proto https, TRUST_PROXY=1)');
    const home = await get(PORT, '/', { 'x-forwarded-proto': 'https', host: 'catan.example.org' });
    assert(!/__ORIGIN__/.test(home.body) && /property="og:image" content="https:\/\/catan\.example\.org\/og-image\.png"/.test(home.body), 'index.html: og:image is an absolute https url');
    assert(/<link rel="canonical" href="https:\/\/catan\.example\.org\/?">/.test(home.body), 'index.html: canonical is absolute');
    const plain = await get(PORT + 1000, '/', { 'x-forwarded-proto': 'https', host: 'localhost:8080' });
    assert(/content="http:\/\/localhost:8080\/og-image\.png"/.test(plain.body), 'without TRUST_PROXY x-forwarded-proto is ignored (http from the connection)');
    const evil = await get(PORT, '/', { host: 'x"><script>alert(1)</script>' });
    assert(evil.status !== 200 || !/<script>alert/.test(evil.body), 'a hostile Host header cannot inject markup');
    const og = await get(PORT, '/og-image.png');
    assert(og.status === 200 && /image\/png/.test(og.headers['content-type']), '/og-image.png is served');

    // ---- a real browser
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    async function visit(opts, fn) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
      const page = await ctx.newPage();
      const log = { problems: [], requests: [], sockets: 0 };
      await page.addInitScript(() => {
        window.BROCH_BOT_DELAY = 1;
        document.addEventListener('securitypolicyviolation', e => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI));
      });
      page.on('console', m => { if (m.type() === 'error' && (!m.location().url || m.location().url.startsWith(`http://localhost:${PORT}`))) log.problems.push(m.text()); });
      page.on('pageerror', e => log.problems.push('pageerror: ' + e.message));
      page.on('request', q => log.requests.push(new URL(q.url()).pathname + (q.url().startsWith(`http://localhost:${PORT}`) ? '' : ' (external)')));
      page.on('websocket', () => { log.sockets++; });
      await page.goto(`http://localhost:${PORT}/demo/`, { waitUntil: 'networkidle' });
      try { await fn(page, log); } finally { await ctx.close(); }
    }
    const setup = async page => { // start a classic game against bots from the lobby
      await page.waitForSelector('#create');
      await page.click('#create');
      await page.waitForSelector('[data-addbot]');
      await page.click('[data-addbot]'); // one computer player keeps the test short
      await page.waitForFunction(() => document.querySelector('[data-start]') && !document.querySelector('[data-start]').disabled);
      await page.click('[data-start]');
      await page.waitForSelector('svg.board');
    };

    await visit({ locale: 'en-US' }, async (page, log) => {
      const bar = await page.textContent('.demo-bar');
      assert(/This is a demo against computer players\. Nothing is saved\. Create an account to play with your friends\./.test(bar), 'the demo banner is shown');
      assert(await page.getAttribute('.demo-cta', 'href') === '/#/register' && await page.getAttribute('.demo-back', 'href') === '/', 'banner: "Create account" -> /#/register, "Back" -> /');
      assert(!(await page.$('text=Fortschritt')), 'no developer "Fortschritt" button');
      assert(/^You$/.test((await page.textContent('.nav-links a[href="#/profile"]')).trim()), 'the demo player is called "You"');
      await setup(page);
      let rolled = false;
      for (let i = 0; i < 240 && !rolled; i++) {
        if (await page.$('.roll-btn')) { await page.click('.roll-btn'); rolled = true; break; }
        const v = await page.$('[data-v]:not(.hl-v)'), e = await page.$('[data-e]:not(.hl-e)');
        const hv = await page.$('.hl-v'), he = await page.$('.hl-e');
        if (hv && v) await v.click({ force: true }).catch(() => {});
        else if (he && e) await e.click({ force: true }).catch(() => {});
        await sleep(250);
      }
      assert(rolled, 'the first placements are done and the dice can be rolled');
      await page.waitForFunction(() => !document.querySelector('.roll-btn'), null, { timeout: 8000 });
      assert(true, 'the dice were rolled');
      await sleep(600);
      assert(log.problems.length === 0, 'no console errors / CSP violations' + (log.problems.length ? ': ' + log.problems.join(' | ') : ''));
      assert(!log.requests.some(u => u.startsWith('/api/')) && log.sockets === 0, 'the demo never calls /api and never opens a WebSocket');
      const keys = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }));
      assert(keys.local.every(k => ['broch_lang', 'broch_muted'].includes(k)) && !keys.session.length && !keys.cookie, 'nothing but language / sound preferences is stored: ' + JSON.stringify(keys));
    });

    await visit({ locale: 'de-DE', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (page, log) => {
      await page.waitForFunction(() => /Demo gegen Computerspieler/.test(document.querySelector('.demo-bar')?.textContent || ''), null, { timeout: 8000 });
      assert(true, 'the banner follows the visitor language (de)');
      assert(/^Du$/.test((await page.textContent('.nav-links a[href="#/profile"]')).trim()) || /Du/.test(await page.textContent('.nav-links')), 'the demo player is named in the visitor language');
      const lang = log.requests.filter(u => /\/demo\/chunks\//.test(u));
      assert(lang.some(u => /chunks\/de-/.test(u)) && !lang.some(u => /chunks\/(fr|es|it|ja|ko|zh|tr)-/.test(u)), 'only the visitor language is fetched (' + lang.length + ' chunks)');
      const sel = await page.evaluate(() => { const b = document.querySelector('.demo-bar').getBoundingClientRect(), t = document.querySelector('.nav-links')?.getBoundingClientRect(); return { barBottom: b.bottom, tabTop: t && t.top, scrollW: document.documentElement.scrollWidth, w: innerWidth }; });
      assert(sel.scrollW <= sel.w, 'phone: no horizontal scroll with the banner');
      assert(sel.tabTop == null || sel.barBottom < sel.tabTop, 'phone: the banner does not cover the tab bar');
      assert(log.problems.length === 0, 'phone: no console errors' + (log.problems.length ? ': ' + log.problems.join(' | ') : ''));
    });

    console.log('\nall demo checks passed');
  } catch (e) {
    console.error(e.message);
    servers.forEach(s => console.error(s.out.slice(-600)));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    servers.forEach(s => s.proc.kill());
  }
})();
