'use strict';
// End-to-end test of the computer players on the real server: starts the server, registers a human, opens a game, adds bots through the
// lobby API, starts it and plays the human seat with the same bot brain until the game is over. Usage: node test/e2e/bots-server.js [mode...]
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const classic = require('../../server/bots/classic');
const standalone = require('../../server/bots/standalone');
const engine = require('../../server/engine');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-bots-'));
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
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); };

async function playMode(label, create, humans = 1, bots = 3) {
  const { game } = await call('POST', '/games', { name: label, ...create });
  const id = game.id;
  // not host / full / unknown id
  let g = game;
  for (let i = 0; i < bots; i++) g = (await call('POST', `/games/${id}/bots`, { action: 'add' })).game;
  assert(g.seats.length === 1 + bots, 'seats after adding bots');
  assert(g.seats.filter(s => s.bot).length === bots, 'bots flagged in the lobby card');
  assert(new Set(g.seats.map(s => s.name)).size === g.seats.length, 'bot names are distinct');
  assert(new Set(g.seats.map(s => s.color)).size === g.seats.length, 'colors are distinct');
  const rm = (await call('POST', `/games/${id}/bots`, { action: 'remove', id: g.seats.find(s => s.bot).id })).game;
  assert(rm.seats.length === bots, 'a bot can be removed');
  g = (await call('POST', `/games/${id}/bots`, { action: 'add' })).game;
  await call('POST', `/games/${id}/start`);
  const me = (await call('GET', '/me').catch(() => ({}))).user;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let boardCache = null, over = false, last = null, moves = 0, errors = 0, lastMove = Date.now();
  const brain = engine.isStandalone(create.mode) ? standalone : classic;
  const fuzz = engine.isStandalone(create.mode) ? require(`../../server/bots/fuzz-${create.mode}`) : null;
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'state') {
      const v = m.state; if (v.board) boardCache = v.board; else v.board = boardCache; last = v; if (!global.__dbg) { global.__dbg = 1; console.log('first state', v.phase, 'me', v.me, 'current', v.current, Object.keys(v.legal || {}).join(',')); } if (v.phase === 'over') { over = true; return; }
      let a = null; try { a = brain.decide(v); } catch { }
      if (a) { ws.send(JSON.stringify({ t: 'act', game: id, action: a, rid: ++moves })); lastMove = Date.now(); }
    } else if (m.t === 'err') { errors++; if (errors < 4) console.log('refused:', m.msg); }
  });
  ws.send(JSON.stringify({ t: 'watch', game: id }));
  const t0 = Date.now();
  while (!over && Date.now() - t0 < 120000) {
    await sleep(200);
    // the human brain is not perfect: when it has nothing to say for a while, give it a random legal-ish move
    if (!over && last && Date.now() - lastMove > 1500) {
      lastMove = Date.now();
      if (fuzz) { const c = fuzz(last, last.me).filter(Boolean); if (c.length) ws.send(JSON.stringify({ t: 'act', game: id, action: c[Math.floor(Math.random() * c.length)], rid: ++moves })); }
      else ws.send(JSON.stringify({ t: 'act', game: id, action: { type: 'endTurn' }, rid: ++moves }));
    }
  }
  ws.close();
  if (!over && last) console.log('last', last.phase, 'me', last.me, 'current', last.current, 'legal', Object.keys(last.legal || {}).join(','), 'setup', JSON.stringify(last.setup), 'pending', JSON.stringify(last.pending).slice(0, 200));
  assert(over, `${label}: the game did not finish (turn ${last && last.turn}, phase ${last && last.phase})`);
  const hist = await call('GET', '/stats');
  assert(!hist.history.some(h => h.id === id), 'games with bots stay out of the statistics');
  console.log(`ok   ${label}: finished in ${last.turn} turns with ${bots} bots (${moves} human moves, ${errors} refused)`);
}

(async () => {
  const only = process.argv.slice(2);
  try {
    for (let i = 0; i < 40 && !/listening/.test(out); i++) await sleep(150);
    await call('POST', '/register', { email: 'a@b.cd', name: 'Human', password: 'secret-password', country: 'DE' });
    const modes = {
      classic: { mode: 'classic', maxPlayers: 4 },
      knights: { mode: 'knights', maxPlayers: 4 },
      energies: { mode: 'energies', maxPlayers: 4 },
      inkas: { mode: 'inkas', maxPlayers: 4 },
      humankind: { mode: 'humankind', maxPlayers: 4 },
      explorers: { mode: 'explorers', maxPlayers: 4, scenario: 1 },
      seafarers: { mode: 'classic', expansion: 'seafarers', maxPlayers: 4 },
      traders: { mode: 'classic', expansion: 'traders', variants: { fishermen: true, events: true }, maxPlayers: 4 },
      merchant: { mode: 'classic', expansion: 'traders', variants: { caravans: true }, maxPlayers: 4 },
      barbarians: { mode: 'classic', expansion: 'traders', variants: { barbarians: true }, maxPlayers: 4 },
      wagons: { mode: 'classic', expansion: 'traders', variants: { traders: true }, maxPlayers: 4 },
      classic56: { mode: 'classic', maxPlayers: 6, big: true },
      barbarians56: { mode: 'classic', expansion: 'traders', variants: { barbarians: true }, maxPlayers: 6, big: true },
    };
    for (const [k, v] of Object.entries(modes)) if (!only.length || only.includes(k)) await playMode(k, v, 1, k === 'explorers' ? 1 : /56$/.test(k) ? 5 : 3);
    console.log('bots on the server: ok');
  } catch (e) { console.error(e.message); console.error(out.split('\n').slice(-15).join('\n')); process.exitCode = 1; }
  await new Promise(r => { srv.on('exit', r); srv.kill('SIGKILL'); });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
})();
