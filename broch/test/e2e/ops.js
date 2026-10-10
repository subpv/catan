'use strict';
// Operations checks on real servers (a scratch DATA_DIR each): damaged data files never wipe accounts or stop the server, /api/client-error cannot flood or forge the log,
// FEEDBACK_URL="" turns the feedback link off, and scripts/admin.js resets a forgotten password. Usage: node test/e2e/ops.js
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('ok   ' + m); };
let nextPort = 19900 + Math.floor(Math.random() * 90);
const dirs = [];
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'broch-ops-')); dirs.push(d); return d; };

function start(dir, env = {}) {
  const port = nextPort++;
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env: { ...process.env, PORT: port, DATA_DIR: dir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const s = { port, p, out: '', exited: null };
  p.stdout.on('data', d => { s.out += d; }); p.stderr.on('data', d => { s.out += d; });
  p.on('exit', code => { s.exited = code; });
  return s;
}
async function ready(s) { for (let i = 0; i < 60 && !/listening/.test(s.out) && s.exited === null; i++) await sleep(100); return /listening/.test(s.out); }
async function stop(s) { if (s.exited === null) { s.p.kill('SIGTERM'); for (let i = 0; i < 50 && s.exited === null; i++) await sleep(100); } }
function call(s, method, url, body, jar = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: s.port, path: url, method, headers: { 'Content-Type': 'application/json', Cookie: jar.c || '' } }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { const sc = res.headers['set-cookie']; if (sc) jar.c = sc.map(x => x.split(';')[0]).join('; '); let j = null; try { j = JSON.parse(d); } catch { } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
const reg = (s, email, name, pw, code = '', jar = {}) => call(s, 'POST', '/api/register', { email, name, password: pw, country: 'DE', code }, jar);

(async () => {
  try {
    // ---------- 1. damaged users.json
    let dir = tmpDir();
    let s = start(dir, { REGISTRATION_CODE: 'secret' });
    assert(await ready(s), 'server starts on an empty data folder');
    assert((await reg(s, 'alice@example.com', 'Alice', 'alice-password-1')).body.user.admin === true, 'the first account is admin');
    await stop(s);
    const good = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
    fs.writeFileSync(path.join(dir, 'users.json'), good.slice(0, 40));
    fs.rmSync(path.join(dir, 'users.json.bak'), { force: true });
    s = start(dir, { REGISTRATION_CODE: 'secret' });
    for (let i = 0; i < 50 && s.exited === null; i++) await sleep(100);
    assert(s.exited === 1 && /FATAL/.test(s.out) && /users\.json/.test(s.out), 'a truncated users.json without a backup stops the server with a clear message');
    assert(fs.readFileSync(path.join(dir, 'users.json'), 'utf8') === good.slice(0, 40), 'and the damaged file is left untouched (not overwritten)');
    // empty file
    fs.writeFileSync(path.join(dir, 'users.json'), '');
    s = start(dir, { REGISTRATION_CODE: 'secret' });
    for (let i = 0; i < 50 && s.exited === null; i++) await sleep(100);
    assert(s.exited === 1, 'an empty users.json does not make the next visitor an admin without the invite code');
    // wrong shape
    for (const bad of ['null', '{}', '[1,2]', '[{"id":"a"}]']) {
      fs.writeFileSync(path.join(dir, 'users.json'), bad);
      s = start(dir);
      for (let i = 0; i < 50 && s.exited === null; i++) await sleep(100);
      assert(s.exited === 1 && /FATAL/.test(s.out), `users.json = ${bad} stops the server with a message, not a stack trace`);
    }
    // the backup restores it
    fs.writeFileSync(path.join(dir, 'users.json'), good);
    s = start(dir, { REGISTRATION_CODE: 'secret' });
    assert(await ready(s), 'a good users.json starts again');
    assert((await reg(s, 'bob@example.com', 'Bob', 'bob-password-12', 'secret')).status === 200, 'a second account is saved (this writes users.json.bak)');
    await stop(s);
    assert(fs.existsSync(path.join(dir, 'users.json.bak')), 'users.json.bak exists after saves');
    fs.writeFileSync(path.join(dir, 'users.json'), '');
    s = start(dir, { REGISTRATION_CODE: 'secret' });
    assert(await ready(s), 'a zero-length users.json with a good .bak: the server starts');
    assert(/restored from users\.json\.bak/i.test(s.out) && fs.readdirSync(dir).some(f => f.startsWith('users.json.corrupt-')), 'it says so loudly and keeps the damaged file');
    const cfg = await call(s, 'GET', '/api/config');
    assert(cfg.body.firstUser === false, 'the accounts came back from the backup (nobody is "first user")');
    assert((await reg(s, 'evil@example.com', 'Evil', 'evil-password-1', '')).status === 403, 'registering without the invite code is still refused');
    await stop(s);

    // ---------- 2. damaged history/sessions/game files
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'games'));
    fs.writeFileSync(path.join(dir, 'history.json'), '{"a":1}');
    fs.writeFileSync(path.join(dir, 'sessions.json'), 'not json');
    fs.writeFileSync(path.join(dir, 'games', 'zzz.json'), JSON.stringify({ meta: { id: 'zzz', status: 'playing', seats: ['a'], mode: 'classic', name: 'x' }, state: {} }));
    fs.writeFileSync(path.join(dir, 'games', 'noseats.json'), JSON.stringify({ meta: { id: 'noseats', status: 'playing' }, state: null }));
    fs.writeFileSync(path.join(dir, 'games', 'torn.json'), '{"meta":{"id":"torn"');
    fs.writeFileSync(path.join(dir, 'games', 'deep.json'), JSON.stringify({ meta: { id: 'deep', status: 'playing', seats: ['a'], mode: 'classic', name: 'x' }, state: { players: [], phase: 'main' } }));
    s = start(dir);
    assert(await ready(s), 'wrong-shaped history, broken sessions and four bad game files do not stop the server');
    assert(fs.readdirSync(dir).some(f => f.startsWith('history.json.corrupt-')) && fs.readdirSync(dir).some(f => f.startsWith('sessions.json.corrupt-')), 'history.json and sessions.json are set aside, not overwritten');
    const broken = fs.existsSync(path.join(dir, 'games', '_broken')) ? fs.readdirSync(path.join(dir, 'games', '_broken')) : [];
    assert(['zzz', 'noseats', 'torn', 'deep'].every(n => broken.some(f => f.startsWith(n + '.json.corrupt-'))), 'every bad game file is moved to games/_broken/');
    const jar = {};
    await reg(s, 'carol@example.com', 'Carol', 'carol-password-1', '', jar);
    assert((await call(s, 'GET', '/api/lobby', null, jar)).status === 200, 'the lobby works');
    await stop(s);

    // ---------- 3. client-error: rate limit, size limit, no forged log lines; the feedback link switch
    dir = tmpDir();
    s = start(dir, { FEEDBACK_URL: '' });
    assert(await ready(s), 'server starts with FEEDBACK_URL=""');
    assert((await call(s, 'GET', '/api/config')).body.feedbackUrl === '', 'an empty FEEDBACK_URL means no feedback link');
    const codes = [];
    for (let i = 0; i < 40; i++) codes.push((await call(s, 'POST', '/api/client-error', { message: 'hello\n[client-error] Admin forged line\r x', stack: 's'.repeat(2000) })).status);
    assert(codes.filter(c => c === 200).length === 20 && codes.filter(c => c === 429).length === 20, 'anonymous /api/client-error is limited to 20 per minute and address (429 after that)');
    await sleep(200);
    assert(!/^\[client-error\] Admin forged line/m.test(s.out) && /hello \[client-error\] Admin forged line/.test(s.out), 'newlines and control characters in a report cannot forge a log line');
    assert(s.out.length < 60000, 'the log stays small (' + s.out.length + ' bytes for 40 posts)');
    await stop(s);
    s = start(tmpDir());
    await ready(s);
    assert(/maidev/.test((await call(s, 'GET', '/api/config')).body.feedbackUrl), 'FEEDBACK_URL unset: the default feedback form');
    await stop(s);

    // ---------- 4. scripts/admin.js: a forgotten password
    dir = tmpDir();
    s = start(dir, { REGISTRATION_CODE: 'secret' });
    await ready(s);
    const jf = {};
    await reg(s, 'friend@example.com', 'Friend', 'old-password-123', '', jf);
    await stop(s);
    const run = (args, env = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'admin.js'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
    let r = run(['list-users', dir]);
    assert(r.status === 0 && /friend@example\.com/.test(r.stdout), 'admin.js list-users shows the accounts');
    r = run(['reset-password', 'nobody@example.com', dir], { BROCH_NEW_PASSWORD: 'new-password-123' });
    assert(r.status === 1 && /no account/.test(r.stderr), 'an unknown email is refused');
    r = run(['reset-password', 'friend@example.com', dir], { BROCH_NEW_PASSWORD: 'short' });
    assert(r.status === 1, 'a too short password is refused');
    r = run(['reset-password', 'Friend@Example.com', dir], { BROCH_NEW_PASSWORD: 'new-password-123' });
    assert(r.status === 0 && /changed/.test(r.stdout), 'admin.js reset-password changes the password');
    s = start(dir, { REGISTRATION_CODE: 'secret' });
    await ready(s);
    assert(!(await call(s, 'GET', '/api/me', null, jf)).body.user, 'the old login (cookie) of that account no longer works');
    assert((await call(s, 'POST', '/api/login', { email: 'friend@example.com', password: 'old-password-123' })).status === 401, 'the old password is refused');
    assert((await call(s, 'POST', '/api/login', { email: 'friend@example.com', password: 'new-password-123' })).status === 200, 'the new password works');
    await stop(s);
    r = run(['delete-user', 'friend@example.com', dir]);
    assert(r.status === 1 && /only admin/.test(r.stderr), 'the only admin cannot be deleted');
    console.log('\nAll ops checks passed.');
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode || 0), 100).unref();
  }
})();
