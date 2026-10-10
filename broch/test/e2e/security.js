'use strict';
// Security checks on a real server: no emails or password data leave the server, sessions are stored hashed, cookies are Secure behind https,
// foreign web pages cannot open the WebSocket, security headers are set, the data files are private. Usage: node test/e2e/security.js
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
const WebSocket = require('ws');

const PORT = 19000 + Math.floor(Math.random() * 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-sec-'));
const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server', 'index.js')], { env: { ...process.env, PORT, DATA_DIR: dir, TRUST_PROXY: '1', REGISTRATION_CODE: 'letmein-123' }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok   ' + m); };

function call(method, url, body, headers = {}, jar = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: url, method, headers: { 'Content-Type': 'application/json', Cookie: jar.c || '', ...headers } }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { const sc = res.headers['set-cookie']; if (sc) jar.c = sc.map(x => x.split(';')[0]).join('; '); let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: res.statusCode, headers: res.headers, body: j, raw: d }); });
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
const reg = (email, name, pw, code, jar, h) => call('POST', '/api/register', { email, name, password: pw, country: 'DE', code }, h, jar);

(async () => {
  try {
    for (let i = 0; i < 40 && !/listening/.test(out); i++) await sleep(150);
    const a = {}, b = {};
    const https = { 'X-Forwarded-Proto': 'https', 'CF-Connecting-IP': '203.0.113.7' };
    let r = await reg('first@example.com', 'First', 'short', '', a, https);
    assert(r.status === 400, 'a password under 8 characters is refused');
    r = await reg('first@example.com', 'First', 'a-long-password', '', a, https);
    assert(r.status === 200, 'the first account needs no invite code');
    assert(/Secure/.test(r.headers['set-cookie'][0]) && /HttpOnly/.test(r.headers['set-cookie'][0]), 'the session cookie is Secure and HttpOnly behind https');
    const plain = await reg('x@example.com', 'Plain', 'a-long-password', 'letmein-123', {}, {});
    assert(!/Secure/.test(plain.headers['set-cookie'][0]), 'without the proxy headers the cookie is not marked Secure (so plain http still works locally)');
    r = await reg('second@example.com', 'Second', 'another-long-pw', 'wrong', b, https);
    assert(r.status === 403, 'a second account needs the invite code');
    r = await reg('second@example.com', 'Second', 'another-long-pw', 'letmein-123', b, https);
    assert(r.status === 200, 'the invite code lets a friend register');
    // nobody sees other people's email, password hash or salt anywhere
    const game = await call('POST', '/api/games', { name: 't', mode: 'classic', maxPlayers: 4 }, https, a);
    await call('POST', `/api/games/${game.body.game.id}/join`, {}, https, b);
    const seen = [(await call('GET', '/api/users', null, https, b)).raw, (await call('GET', '/api/lobby', null, https, b)).raw, (await call('GET', '/api/stats', null, https, b)).raw, (await call('GET', `/api/games/${game.body.game.id}`, null, https, b)).raw, (await call('GET', '/api/me', null, https, b)).raw];
    assert(!/first@example|x@example/.test(seen.slice(0, 4).join('')), "other people's email addresses are in no list, lobby, stats or game answer");
    assert(/second@example/.test(seen[4]) && !/first@example/.test(seen[4]), 'you only see your own email address');
    assert(!/"hash"|"salt"|a-long-password|another-long-pw/.test(seen.join('')), 'no password, hash or salt in any answer');
    assert((await call('GET', '/api/users')).status === 401, 'the user list needs a login');
    // what is on disk
    await sleep(700);
    const users = fs.readFileSync(path.join(dir, 'users.json'), 'utf8'), sess = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8');
    assert(!/a-long-password|another-long-pw/.test(users), 'passwords are not stored in clear text');
    const tok = a.c.split('=')[1];
    assert(!sess.includes(tok), 'the session token from the cookie is not stored in sessions.json (only its hash)');
    for (const f of ['users.json', 'sessions.json']) assert((fs.statSync(path.join(dir, f)).mode & 0o077) === 0, `${f} is readable by the app user only`);
    // headers
    r = await call('GET', '/', null, https);
    for (const h of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'strict-transport-security']) assert(r.headers[h], `header ${h} is set`);
    // websocket from another site
    const wsTry = origin => new Promise(resolve => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: a.c, ...(origin ? { Origin: origin } : {}) } }); ws.on('open', () => { ws.close(); resolve(true); }); ws.on('error', () => resolve(false)); ws.on('unexpected-response', () => resolve(false)); });
    assert(!(await wsTry('https://evil.example')), 'a web page of another site cannot open the game WebSocket');
    assert(await wsTry(`http://127.0.0.1:${PORT}`), 'the site itself can');
    // nothing a visitor sends may take the server down (each of these once killed the process)
    const alive = async label => { const h = await call('GET', '/api/health'); assert(h.status === 200 && h.body && h.body.ok, `the server still answers after: ${label}`); };
    const rawHttp = text => new Promise(resolve => { const s = net.connect(PORT, '127.0.0.1', () => s.write(text)); let d = ''; s.on('data', x => { d += x; }); s.on('close', () => resolve(d)); s.on('error', () => resolve(d)); setTimeout(() => { s.destroy(); }, 800); });
    assert(/ 400 /.test((await rawHttp('GET /%E0%A4%A HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')).split('\r\n')[0]), 'a malformed %-escape in a page address is answered with 400');
    await alive('a malformed %-escape in a page address');
    await rawHttp('GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'); await alive('a bad request target (//[)');
    await rawHttp('GET /demo/%e0%a4%a HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'); await alive('a malformed escape below /demo/');
    r = await call('GET', '/api/me', null, { Cookie: 'broch_session=%E0%A4%A' }); assert(r.status === 200 && r.body.user === null, 'a malformed cookie means "not logged in" (no 500)');
    r = await call('POST', '/api/login', null, {}); assert(r.status === 401, 'an empty login body is just a wrong login');
    const rawBody = await new Promise(resolve => { const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, x => { x.resume(); resolve(x.statusCode); }); q.end('null'); });
    assert(rawBody === 400, 'a JSON body that is not an object (null) is refused with 400');
    const wsRun = (headers, fn) => new Promise(resolve => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers }); const done = () => resolve(); ws.on('open', () => fn(ws)); ws.on('close', done); ws.on('error', done); setTimeout(() => { try { ws.terminate(); } catch { } done(); }, 1500); });
    await wsRun({ Cookie: 'broch_session=%E0%A4%A' }, () => { }); await alive('a WebSocket with a malformed cookie');
    await wsRun({}, ws => ws.send('x'.repeat(70000))); await alive('an oversized WebSocket frame without login');
    await wsRun({ Cookie: a.c }, ws => ws.send('x'.repeat(70000))); await alive('an oversized WebSocket frame when logged in');
    await wsRun({ Cookie: a.c }, ws => { ws.send('null'); ws.send('"str"'); ws.send('[1]'); ws.send('{'); setTimeout(() => ws.close(), 200); }); await alive('WebSocket messages null, string, array and broken JSON');
    await wsRun({ Cookie: a.c }, ws => ws._socket.write(Buffer.from([0x81, 0x82, 0, 0, 0, 0, 0xff, 0xfe]))); await alive('a WebSocket frame with invalid UTF-8');
    // a WebSocket loses its login with the session: logout and password change close it
    {
      const jar = {}; r = await call('POST', '/api/login', { email: 'second@example.com', password: 'another-long-pw' }, { 'CF-Connecting-IP': '203.0.113.60' }, jar);
      const closed = key => new Promise(resolve => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: jar.c } }); let code = null; ws.on('open', async () => { await sleep(100); await key(); await sleep(100); ws.send(JSON.stringify({ t: 'watch', game: null })); }); ws.on('close', c => { code = c; resolve(c); }); setTimeout(() => { try { ws.terminate(); } catch { } resolve(code); }, 2000); });
      const code = await closed(() => call('POST', '/api/logout', {}, {}, jar));
      assert(code === 4001, 'a WebSocket is closed (4001) when its session logs out');
      const j2 = {}, j3 = {}; await call('POST', '/api/login', { email: 'second@example.com', password: 'another-long-pw' }, { 'CF-Connecting-IP': '203.0.113.60' }, j2); await call('POST', '/api/login', { email: 'second@example.com', password: 'another-long-pw' }, { 'CF-Connecting-IP': '203.0.113.60' }, j3);
      jar.c = j2.c;
      const code2 = await closed(() => call('PATCH', '/api/me', { newPassword: 'another-long-pw2', password: 'another-long-pw' }, {}, j3));
      assert(code2 === 4001, 'a WebSocket of another device is closed when the password changes');
      await call('PATCH', '/api/me', { newPassword: 'another-long-pw', password: 'another-long-pw2' }, {}, j3);
      await call('POST', '/api/login', { email: 'second@example.com', password: 'another-long-pw' }, { 'CF-Connecting-IP': '203.0.113.60' }, b); // (the password change logged b out too)
    }
    // input limits
    r = await reg('x'.repeat(300) + '@example.com', 'Long', 'a-long-password', 'letmein-123', {}, { 'CF-Connecting-IP': '203.0.113.61' }); assert(r.status === 400, 'an email longer than 254 characters is refused');
    r = await reg('long@example.com', 'Long', 'p'.repeat(300), 'letmein-123', {}, { 'CF-Connecting-IP': '203.0.113.61' }); assert(r.status === 400, 'a password longer than 256 characters is refused');
    r = await call('PATCH', '/api/me', { lang: ['en'] }, https, a); assert(r.status === 400, 'a language that is not a plain string is refused');
    r = await call('GET', '/api/users', null, https, a); const meId = (await call('GET', '/api/me', null, https, a)).body.user.id;
    r = await call('POST', '/api/stats/manual', { players: [meId, meId, meId], winner: meId, mode: 'classic' }, https, a);
    assert(r.status === 200 && r.body.entry.players.length === 1, 'a player listed several times in a manual game counts once');
    let cap = null;
    for (let i = 0; i < 12 && !cap; i++) { const x = await call('POST', '/api/games', { name: 'g' + i, mode: 'classic', maxPlayers: 2 }, https, a); if (x.status === 429) cap = i; }
    assert(cap !== null && cap >= 5, `one account can only host a limited number of games (stopped at the ${cap + 1}th)`);
    // logins are counted too (also the right password), and the sessions of one account are capped
    {
      const secondId = (await call('GET', '/api/me', null, https, b)).body.user.id;
      const ipH = { 'CF-Connecting-IP': '203.0.113.99', 'X-Forwarded-Proto': 'https' }; let limited = 0, okc = 0;
      for (let i = 0; i < 70; i++) { const x = await call('POST', '/api/login', { email: 'second@example.com', password: 'another-long-pw' }, ipH); if (x.status === 429) limited++; else if (x.status === 200) okc++; }
      assert(limited > 0 && okc >= 50, `even correct logins are rate limited per address (${okc} accepted, ${limited} refused)`);
      await sleep(700);
      const sessions = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'));
      assert(Object.values(sessions).filter(x => x.userId === secondId).length <= 20, 'an account keeps at most 20 sessions');
    }
    // an abandoned game stays gone (a pending delayed save used to write its file again)
    {
      await call('POST', '/api/login', { email: 'second@example.com', password: 'another-long-pw' }, { 'CF-Connecting-IP': '203.0.113.62' }, b);
      const g = await call('POST', '/api/games', { name: 'gone', mode: 'classic', maxPlayers: 2 }, https, b);
      const gid = g.body.game.id;
      await call('POST', `/api/games/${gid}/bots`, {}, https, b); await call('POST', `/api/games/${gid}/start`, {}, https, b);
      await new Promise(resolve => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: b.c } }); ws.on('open', async () => { ws.send(JSON.stringify({ t: 'watch', game: gid })); await sleep(150); ws.send(JSON.stringify({ t: 'act', game: gid, rid: 1, action: { type: 'chat', text: 'hi' } })); await sleep(100); resolve(); }); });
      const gf = path.join(dir, 'games', gid + '.json');
      assert((await call('POST', `/api/games/${gid}/abandon`, {}, https, b)).status === 200, 'the host abandons a running game right after a move');
      await sleep(900);
      assert(!fs.existsSync(gf), 'an abandoned game is not written to disk again');
    }
    // brute force
    let blocked = false;
    for (let i = 0; i < 20 && !blocked; i++) { const x = await call('POST', '/api/login', { email: 'first@example.com', password: 'nope-nope-' + i }, { 'CF-Connecting-IP': '198.51.100.9', 'X-Forwarded-Proto': 'https' }); if (x.status === 429) blocked = true; }
    assert(blocked, 'repeated wrong passwords from one address are blocked');
    const other = await call('POST', '/api/login', { email: 'first@example.com', password: 'a-long-password' }, { 'CF-Connecting-IP': '203.0.113.50' });
    assert(other.status === 200, 'another visitor address is not blocked (the rate limit uses the Cloudflare visitor address)');
    console.log('security: ok');
  } catch (e) { console.error(e.message); console.error(out.split('\n').slice(-10).join('\n')); process.exitCode = 1; }
  await new Promise(r => { srv.on('exit', r); srv.kill('SIGKILL'); });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
})();
