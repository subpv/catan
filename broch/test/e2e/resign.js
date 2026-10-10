'use strict';
// Leaving a running game: a bot takes the seat, the last human closes the game, only the host can close it for everybody.
// Usage: node test/e2e/resign.js
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PORT = 20000 + Math.floor(Math.random() * 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-resign-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server', 'index.js')], { env: { ...process.env, PORT, DATA_DIR: dir, REGISTRATION_CODE: 'in-123', BROCH_BOT_DELAY: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok   ' + m); };
function call(jar, method, url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api' + url, method, headers: { 'Content-Type': 'application/json', Cookie: jar.c || '' } }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { const sc = res.headers['set-cookie']; if (sc) jar.c = sc.map(x => x.split(';')[0]).join('; '); let j = {}; try { j = JSON.parse(d); } catch { } resolve({ status: res.statusCode, j }); });
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
(async () => {
  try {
    for (let i = 0; i < 40 && !/listening/.test(out); i++) await sleep(150);
    const a = {}, b = {};
    await call(a, 'POST', '/register', { email: 'a@x.de', name: 'Anna', password: 'long-password-1', country: 'DE' });
    await call(b, 'POST', '/register', { email: 'b@x.de', name: 'Ben', password: 'long-password-2', country: 'DE', code: 'in-123' });
    const start = async () => {
      const { j } = await call(a, 'POST', '/games', { name: 'T', mode: 'classic' });
      await call(b, 'POST', `/games/${j.game.id}/join`, {});
      await call(a, 'POST', `/games/${j.game.id}/start`, {});
      return j.game.id;
    };
    let id = await start();
    let r = await call(b, 'POST', `/games/${id}/abandon`, {});
    assert(r.status === 403, 'a guest cannot close the game for everybody');
    r = await call(b, 'POST', `/games/${id}/resign`, {});
    assert(r.status === 200, 'a guest can resign');
    let lobby = (await call(a, 'GET', '/lobby')).j;
    let card = lobby.playing.find(g => g.id === id);
    assert(card && card.seats.some(s => s.bot) && !card.seats.some(s => s.name === 'Ben'), 'a bot sits where Ben sat');
    r = await call(a, 'POST', `/games/${id}/resign`, {});
    assert(r.status === 200, 'the last human can resign');
    assert((await call(a, 'GET', `/games/${id}`)).status === 404, 'and the game is closed');
    id = await start();
    assert((await call(a, 'POST', `/games/${id}/abandon`, {})).status === 200, 'the host can close the game for everybody');
    assert((await call(b, 'POST', `/games/${id}/resign`, {})).status >= 400, 'a closed game cannot be left again');
    console.log('resign: all ok');
  } catch (e) { console.log(e.message); process.exitCode = 1; } finally { srv.kill(); }
})();
