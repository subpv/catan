'use strict';
// Security checks on a real server: no emails or password data leave the server, sessions are stored hashed, cookies are Secure behind https,
// foreign web pages cannot open the WebSocket, security headers are set, the data files are private. Usage: node test/e2e/security.js
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
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
