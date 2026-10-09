'use strict';
// The computer players wait until the human's screen has shown everything (client message {t:'fx', v}): without the report a bot makes
// at most one move per state it sent, with the report it goes on at once; a client that never reports does not slow the bots down.
// Usage: node test/e2e/bot-pacing.js
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 24000 + Math.floor(Math.random() * 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-pace-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server', 'index.js')], { env: { ...process.env, PORT, DATA_DIR: dir, BROCH_BOT_DELAY: '150' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok   ' + m); };

// opens a game with one bot until the bot has the first turn; returns the websocket and a live list of state versions
async function startBotFirst(ack) {
  for (let i = 0; i < 12; i++) {
    const { game } = await call('POST', '/games', { name: 'pace', mode: 'classic', maxPlayers: 2 });
    await call('POST', `/games/${game.id}/bots`, { action: 'add' });
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie } });
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    const seen = [];
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t !== 'state') return;
      seen.push({ v: m.state.version, me: m.state.me, current: m.state.current, at: Date.now() });
      if (ack === 'always' || seen.length === 1) ws.send(JSON.stringify({ t: 'fx', game: game.id, v: m.state.version })); // 'once': only the first state is reported
    });
    ws.send(JSON.stringify({ t: 'watch', game: game.id }));
    await sleep(150);
    await call('POST', `/games/${game.id}/start`);
    await sleep(500);
    const first = seen.find(x => x.v > 0 || true);
    if (first && first.current !== first.me) return { ws, seen, id: game.id };
    ws.close(); await call('POST', `/games/${game.id}/abandon`, {}).catch(() => {});
  }
  throw new Error('never got a game where the bot starts');
}

(async () => {
  try {
    for (let i = 0; i < 40 && !/listening/.test(out); i++) await sleep(150);
    await call('POST', '/register', { email: 'p@b.cd', name: 'Pace', password: 'secret-password', country: 'DE' });

    // 1) a client that reports once (so the server knows it can) and then stays silent: the bot must stop after its first move
    let t = await startBotFirst('once');
    await sleep(2500);
    const n1 = t.seen.length;
    await sleep(1500);
    assert(t.seen.length === n1, `a silent client holds the bot back (${n1} states, none new in 1.5 s)`);
    // 2) the report releases the bot
    const last = t.seen[t.seen.length - 1];
    t.ws.send(JSON.stringify({ t: 'fx', game: t.id, v: last.v }));
    await sleep(900);
    assert(t.seen.length > n1, 'the report lets the bot go on');
    t.ws.close();

    // 3) a client that reports every state is not slowed down noticeably
    t = await startBotFirst('always');
    await sleep(1500);
    assert(t.seen.length >= 3, `with reports the bot keeps moving (${t.seen.length} states in 1.5 s)`);
    t.ws.close();

    // 4) a client that never reports at all (old page) does not hold the bot back
    const { game } = await call('POST', '/games', { name: 'old', mode: 'classic', maxPlayers: 2 });
    await call('POST', `/games/${game.id}/bots`, { action: 'add' });
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie } });
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    let n = 0; ws.on('message', raw => { if (JSON.parse(raw).t === 'state') n++; });
    ws.send(JSON.stringify({ t: 'watch', game: game.id }));
    await sleep(150); await call('POST', `/games/${game.id}/start`); await sleep(1500);
    assert(n >= 2, 'a client without reports (old page) is ignored');
    ws.close();
    console.log('bot pacing: all ok');
  } catch (e) { console.log(e.message); process.exitCode = 1; } finally { srv.kill(); }
})();
