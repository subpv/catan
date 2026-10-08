'use strict';
// Phone check: starts the server, plays games with bots up to the main phase and takes screenshots at phone size,
// plus measurements (horizontal scroll, tap targets under 40px, text under 11px).
// Usage: node test/e2e/mobile-shots.js [outDir] [width] [height] [mode...]
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const classic = require('../../server/bots/classic');
const standalone = require('../../server/bots/standalone');
const engine = require('../../server/engine');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); }

const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'broch-mobile'));
const W = +process.argv[3] || 390, H = +process.argv[4] || 844;
const MODES = process.argv.slice(5);
const PORT = 21000 + Math.floor(Math.random() * 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-mob-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server', 'index.js')], { env: { ...process.env, PORT, DATA_DIR: dir, BROCH_BOT_DELAY: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let cookie = '';
function call(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api' + url, method, headers: { 'Content-Type': 'application/json', Cookie: cookie } }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { const sc = res.headers['set-cookie']; if (sc) cookie = sc.map(x => x.split(';')[0]).join('; '); let j = {}; try { j = JSON.parse(d); } catch { } if (res.statusCode >= 400) reject(new Error(res.statusCode + ' ' + (j.error || d))); else resolve(j); });
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
const GAMES = {
  classic: { mode: 'classic', expansion: 'none' },
  knights: { mode: 'knights', expansion: 'none' },
  seafarers: { mode: 'classic', expansion: 'seafarers', scenario: 'shores' },
  traders: { mode: 'classic', expansion: 'traders', variants: { fishermen: true } },
  big: { mode: 'classic', expansion: 'none', big: true, maxPlayers: 5 },
  energies: { mode: 'energies' },
  humankind: { mode: 'humankind' },
  inkas: { mode: 'inkas' },
  explorers: { mode: 'explorers', escen: 2 },
};
// plays the human seat with the bot brain until `until(view)` is true
async function playUntil(id, mode, until, maxMs = 20000) {
  const brain = engine.isStandalone(mode) ? standalone : classic;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let cache = null, done = false, moves = 0;
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t !== 'state' || done) return;
    const v = m.state; if (v.board) cache = v.board; else v.board = cache;
    if (until(v)) { done = true; return; }
    let a = null; try { a = brain.decide(v); } catch { }
    if (a) ws.send(JSON.stringify({ t: 'act', game: id, action: a, rid: ++moves }));
  });
  ws.send(JSON.stringify({ t: 'watch', game: id }));
  const t0 = Date.now();
  while (!done && Date.now() - t0 < maxMs) await sleep(100);
  ws.close();
  return done;
}
async function measure(page, label) {
  return page.evaluate(label => {
    const vw = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth - vw;
    const small = [], tiny = [];
    document.querySelectorAll('button, a, [data-do], [role=button], input, select, .chip').forEach(e => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) return;
      if (getComputedStyle(e).visibility === 'hidden' || getComputedStyle(e).display === 'none') return;
      if (r.height < 36 || r.width < 36) small.push(`${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)}"`);
    });
    document.querySelectorAll('p, span, small, b, div, label').forEach(e => {
      if (e.children.length) return;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 11 && (e.textContent || '').trim().length > 2) tiny.push(`${Math.round(fs * 10) / 10}px "${e.textContent.trim().slice(0, 24)}"`);
    });
    return { label, viewport: [vw, innerHeight], horizontalOverflow: over, smallTargets: [...new Set(small)].slice(0, 25), tinyText: [...new Set(tiny)].slice(0, 15) };
  }, label);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  try {
    for (let i = 0; i < 40 && !/listening/.test(out); i++) await sleep(150);
    await call('POST', '/register', { email: 'm@b.cd', name: 'Marlo', password: 'secret-password', country: 'DE' });
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE' });
    const [name, value] = cookie.split(';')[0].split('=');
    await ctx.addCookies([{ name, value, url: `http://127.0.0.1:${PORT}` }]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    const shot = async (label, wait = 700) => { await sleep(wait); await page.screenshot({ path: path.join(OUT, label + '.png') }); report.push(await measure(page, label)); };
    await page.goto(`http://127.0.0.1:${PORT}/#/`); await shot('01-lobby', 1500);
    await page.screenshot({ path: path.join(OUT, '01-lobby-full.png'), fullPage: true });
    await page.goto(`http://127.0.0.1:${PORT}/#/stats`); await shot('02-stats');
    await page.goto(`http://127.0.0.1:${PORT}/#/profile`); await shot('03-profile');
    const modes = MODES.length ? MODES : ['classic', 'knights'];
    for (const key of modes) {
      const spec = GAMES[key]; if (!spec) continue;
      const n = key === 'big' ? 5 : 4;
      const { game } = await call('POST', '/games', { name: 'M-' + key, maxPlayers: n, ...spec });
      for (let i = 0; i < n - 1; i++) await call('POST', `/games/${game.id}/bots`, { action: 'add' });
      await call('POST', `/games/${game.id}/start`);
      await page.goto(`http://127.0.0.1:${PORT}/#/game/${game.id}`);
      await shot(`10-${key}-setup`, 1500);
      const ok = await playUntil(game.id, spec.mode, v => v.phase === 'play' && v.current === v.me && (v.step === 'main' || v.step === 'roll'));
      await page.waitForTimeout(800);
      await shot(`11-${key}-turn`, 1200);
      for (const [tab, sel] of [['feed', '.tabs [data-tab]']]) { /* tabs are shot below */ }
      const tabs = await page.$$('.feed-tabs button, .tabs button, [data-tab]');
      for (let i = 0; i < Math.min(tabs.length, 4); i++) { try { await tabs[i].click(); await shot(`12-${key}-tab${i}`, 600); } catch { } }
      if (!ok) report.push({ label: key, note: 'never reached the main phase' });
    }
    report.push({ label: 'pageerrors', errors });
    await browser.close();
  } catch (e) { report.push({ error: e.stack }); process.exitCode = 1; } finally { srv.kill(); }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.map(r => ({ l: r.label, over: r.horizontalOverflow, small: (r.smallTargets || []).length, tiny: (r.tinyText || []).length, e: r.error || r.note || (r.errors && r.errors.length) })), null, 0));
  console.log('screenshots in', OUT);
})();
