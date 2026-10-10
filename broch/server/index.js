'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');
const { db } = store;
const engine = require('./engine');
const { COLORS, tradersVp } = require('./engine/shared/constants');
const { SCENARIOS: SEA_SCENARIOS } = require('./engine/seafarers/scenarios');
const { createRunner, isBotId } = require('./bots/runner');
const { botName } = require('./bots/names');

const PORT = +process.env.PORT || 8080;
const REGISTRATION_CODE = process.env.REGISTRATION_CODE || '';
// FEEDBACK_URL unset: the default feedback form; set but empty (FEEDBACK_URL=""): no feedback link anywhere (footer and error banner hide it)
const FEEDBACK_URL = process.env.FEEDBACK_URL ?? 'https://feedback.maidev.dk/';
// text from a visitor or a request goes into the log only as one short line without control characters (no forged log lines)
const logText = (v, max = 300) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').slice(0, max);
const PUBLIC = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 60;
// Behind Cloudflare (tunnel or proxy) set TRUST_PROXY=1: the real visitor address comes from CF-Connecting-IP and https from X-Forwarded-Proto.
// Without it these headers are ignored (anybody could fake them when talking to the server directly).
const TRUST_PROXY = /^(1|true|yes|cloudflare)$/i.test(process.env.TRUST_PROXY || '');
const MIN_PASSWORD = 8;

// ------------------------------------------------------------ auth helpers
const newId = (n = 9) => crypto.randomBytes(n).toString('base64url');
// scrypt runs on the libuv thread pool (async), so a burst of logins cannot freeze the game traffic of everybody else
const scryptAsync = (pw, salt) => new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
async function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: (await scryptAsync(pw, salt)).toString('hex') };
}
async function checkPassword(user, pw) {
  const h = await scryptAsync(pw, user.salt);
  return crypto.timingSafeEqual(h, Buffer.from(user.hash, 'hex'));
}
const MAX_PASSWORD = 256, MAX_EMAIL = 254, MAX_SESSIONS_PER_USER = 20, MAX_OPEN_GAMES_PER_USER = 8;
const publicUser = u => u && ({ id: u.id, name: u.name, color: u.color, country: u.country || null, admin: !!u.admin });
// a seat is a registered user or a bot of that game (meta.bots)
const seatUser = (g, id) => (isBotId(id) ? { id, name: (g.meta.bots && g.meta.bots[id] && g.meta.bots[id].name) || 'Bot', color: null, country: null, bot: true } : publicUser(db.users.find(x => x.id === id)));
const meUser = u => u && ({ ...publicUser(u), email: u.email, lang: u.lang || null });
// a malformed %-escape in a cookie must never throw (it is visitor input): keep the raw text then
function safeDecode(v) { try { return decodeURIComponent(v); } catch { return v; } }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, safeDecode(v.join('='))]));
}
// The cookie holds a random token; only its SHA-256 is stored on disk, so a copy of sessions.json cannot be used to log in.
const hashToken = tok => crypto.createHash('sha256').update(String(tok)).digest('hex');
function sessionKey(req) {
  const tok = cookies(req).broch_session;
  if (!tok) return null;
  const key = hashToken(tok);
  if (db.sessions[key]) return key;
  if (db.sessions[tok]) { db.sessions[key] = db.sessions[tok]; delete db.sessions[tok]; store.saveSessions(); return key; } // session of an older version: stored hashed from now on
  return null;
}
function userFromReq(req) {
  const key = sessionKey(req);
  const sess = key && db.sessions[key];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users.find(u => u.id === sess.userId) || null;
}
const clientIp = req => (TRUST_PROXY && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress;
const isHttps = req => TRUST_PROXY && (req.headers['x-forwarded-proto'] === 'https' || /"scheme":"https"/.test(req.headers['cf-visitor'] || ''));
function startSession(req, res, user) {
  const tok = newId(24);
  db.sessions[hashToken(tok)] = { userId: user.id, exp: Date.now() + SESSION_DAYS * 864e5 };
  // at most MAX_SESSIONS_PER_USER logins stay valid per account: the oldest ones are dropped (sessions.json cannot grow without limit)
  const mine = Object.entries(db.sessions).filter(([, v]) => v.userId === user.id).sort((a, b) => a[1].exp - b[1].exp);
  for (const [k] of mine.slice(0, Math.max(0, mine.length - MAX_SESSIONS_PER_USER))) { delete db.sessions[k]; closeSockets(c => c.key === k); }
  store.saveSessions();
  res.setHeader('Set-Cookie', `broch_session=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`);
}
function dropSessionsOf(userId, keep) {
  for (const [k, v] of Object.entries(db.sessions)) if (v.userId === userId && k !== keep) { delete db.sessions[k]; closeSockets(c => c.key === k); }
  store.saveSessions();
}
function purgeSessions() {
  let n = 0;
  for (const [k, v] of Object.entries(db.sessions)) if (!v || v.exp < Date.now()) { delete db.sessions[k]; n++; }
  if (n) store.saveSessions();
}

const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_USER = { salt: DUMMY_SALT, hash: crypto.scryptSync('dummy-' + crypto.randomBytes(8).toString('hex'), DUMMY_SALT, 64).toString('hex') }; // a failed login for an unknown email takes as long as one for a known email
function sameSecret(a, b) {
  const x = crypto.createHash('sha256').update(String(a || '')).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const attempts = new Map();
function rateLimited(ip) {
  const a = (attempts.get(ip) || []).filter(t => Date.now() - t < 10 * 60e3);
  attempts.set(ip, a);
  return a.length >= 15;
}
// without an invite code anybody may sign up, so one address can only create a few accounts per hour (no bulk accounts from a script)
const signups = new Map();
const SIGNUPS_PER_HOUR = 10;
function signupLimited(ip) {
  const a = (signups.get(ip) || []).filter(t => Date.now() - t < 3600e3);
  signups.set(ip, a);
  return a.length >= SIGNUPS_PER_HOUR;
}
function noteFailure(ip) { (attempts.get(ip) || attempts.set(ip, []).get(ip)).push(Date.now()); }
// Every login attempt (also a right password) counts per address: a script cannot hammer the password hashing or pile up sessions.
// A shared home address needs far less than the limit. Also used for the manual stats entries (per user).
const rates = new Map();
function rateHit(key, windowMs, max) {
  const now = Date.now();
  const a = (rates.get(key) || []).filter(t => now - t < windowMs);
  if (a.length >= max) { rates.set(key, a); return true; }
  a.push(now); rates.set(key, a);
  return false;
}
setInterval(() => { // forget old counters
  const now = Date.now();
  for (const [k, a] of rates) if (!a.length || now - a[a.length - 1] > 3600e3) rates.delete(k);
  for (const m of [attempts, signups]) for (const [k, a] of m) if (!a.length || now - a[a.length - 1] > 3600e3) m.delete(k);
}, 600e3).unref();

// ------------------------------------------------------------ http helpers
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => {
      try {
        const v = data ? JSON.parse(data) : {};
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object'); // null, [] or a number would crash the routes below
        resolve(v);
      } catch { reject(new HttpError(400, 'Bad JSON')); }
    });
    req.on('error', reject);
  });
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

// a short id of the server code and the page files on disk (shown in the footer, so you can see which version is running)
const BUILD_ID = (() => {
  const h = crypto.createHash('sha1');
  const walk = d => { try { fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).forEach(e => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else h.update(e.name).update(fs.readFileSync(f)); }); } catch { /* unreadable */ } };
  walk(path.join(__dirname)); walk(path.join(__dirname, '..', 'public'));
  return h.digest('hex').slice(0, 7);
})();
// Static files are kept in memory with an ETag and ready-made gzip/brotli copies, so phones only download
// what changed (a 304 otherwise) and get it compressed. A changed file on disk is picked up automatically.
const zlib = require('zlib');
const staticCache = new Map();
function loadStatic(file) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  if (!st.isFile()) return null;
  const hit = staticCache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit;
  const buf = fs.readFileSync(file);
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  const text = /^(text|application\/(json|manifest)|image\/svg)/.test(type);
  const entry = {
    mtime: st.mtimeMs, size: st.size, type, buf,
    etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"',
    br: text && buf.length > 1024 ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : null,
    gz: text && buf.length > 1024 ? zlib.gzipSync(buf, { level: 9 }) : null,
  };
  staticCache.set(file, entry);
  return entry;
}
// The origin the visitor used (protocol + host), for the absolute urls in index.html. The protocol comes from x-forwarded-proto only with TRUST_PROXY=1, else from the connection.
// The Host header is visitor input and ends up in an html attribute: anything that is not a plain host[:port] is replaced.
function originOf(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return `${isHttps(req) || req.socket.encrypted ? 'https' : 'http'}://${/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/.test(host) ? host : 'localhost:' + PORT}`;
}
// index.html with __ORIGIN__ replaced; one copy per origin (a visitor can send any Host, so at most 8 are kept and the rest is built per request)
function withOrigin(e, origin) {
  e.origins = e.origins || new Map();
  let v = e.origins.get(origin);
  if (v) return v;
  const buf = Buffer.from(e.buf.toString().split('__ORIGIN__').join(origin));
  v = { type: e.type, buf, etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"', br: buf.length > 1024 ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : null, gz: buf.length > 1024 ? zlib.gzipSync(buf, { level: 9 }) : null };
  if (e.origins.size < 8) e.origins.set(origin, v);
  return v;
}
function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end('Bad request'); } // %zz or a malformed target
  if (p.includes('\0')) { res.writeHead(400); return res.end('Bad request'); }
  // the public demo (node demo/build.js --public writes it to public/demo/): /demo and /demo/ are its page, its files live below /demo/. A checkout without a built demo answers 404.
  if (p === '/demo' || p === '/demo/') p = '/demo/index.html';
  else if (p === '/' || (!path.extname(p) && !p.startsWith('/demo/'))) p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  let e = loadStatic(file);
  if (!e) { res.writeHead(404); return res.end('Not found'); }
  // the page carries the build id, so the script files it loads can be asked for with it (a proxy or browser cannot serve old ones)
  if (path.basename(file) === 'index.html' && e.buf.includes('name="broch-build" content=""')) {
    if (!e.stamped) { const buf = Buffer.from(e.buf.toString().replace('name="broch-build" content=""', `name="broch-build" content="${BUILD_ID}"`)); e = staticCache.get(file); e.buf = buf; e.etag = '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"'; e.br = e.gz = null; e.stamped = true; }
  }
  if (path.basename(file) === 'index.html' && e.buf.includes('__ORIGIN__')) e = withOrigin(e, originOf(req)); // link previews need absolute urls (og:url, og:image, canonical)
  // private + no-cache: browsers revalidate with the ETag (cheap 304), and Cloudflare or any other shared cache never keeps a copy (it would serve old scripts after an update)
  const headers = { 'Content-Type': e.type, 'Cache-Control': 'private, no-cache', 'CDN-Cache-Control': 'no-store', ETag: e.etag, Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, headers); return res.end(); }
  const ae = req.headers['accept-encoding'] || '';
  let body = e.buf;
  if (e.br && /\bbr\b/.test(ae)) { body = e.br; headers['Content-Encoding'] = 'br'; }
  else if (e.gz && /\bgzip\b/.test(ae)) { body = e.gz; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

// ------------------------------------------------------------ lobby helpers
// every seat in an open game holds a distinct color; keep the user's favourite when it's free
// per-game switches from the lobby (standalone games): plain booleans under short names
function cleanOptions(o) {
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (/^[A-Za-z]{1,24}$/.test(k) && typeof v === 'boolean') out[k] = v;
  return out;
}
function fixSeatColors(meta) {
  meta.colors = meta.colors || {};
  for (const id of Object.keys(meta.colors)) if (!meta.seats.includes(id)) delete meta.colors[id];
  const used = new Set();
  for (const id of meta.seats) {
    let c = meta.colors[id];
    if (!c || used.has(c) || !COLORS.includes(c)) {
      const fav = (db.users.find(u => u.id === id) || {}).color; // (bots have none)
      c = fav && !used.has(fav) ? fav : COLORS.find(x => !used.has(x));
    }
    meta.colors[id] = c; used.add(c);
  }
}
function gameCard(g) {
  const m = g.meta;
  if (m.status === 'open') fixSeatColors(m);
  return {
    id: m.id, name: m.name, mode: m.mode, maxPlayers: m.maxPlayers, vpTarget: m.vpTarget, status: m.status,
    expansion: m.expansion || 'none', scenario: m.scenario || null, big: !!m.big, variants: m.variants || null, robberReturn: !!m.robberReturn, startBoth: !!m.startBoth, variable: !!m.variable, knightsFree: !!m.knightsFree,
    host: m.host, createdAt: m.createdAt,
    seats: m.seats.map(id => {
      const u = seatUser(g, id) || { id, name: '?' };
      const inGame = g.state && g.state.players.find(p => p.userId === id);
      return { ...u, color: inGame ? inGame.color : (m.colors && m.colors[id]) || u.color };
    }),
    current: g.state && g.state.phase !== 'over' ? g.state.players[g.state.current].userId : null,
    turn: g.state ? g.state.turn : 0,
  };
}
function lobbyFor(user) {
  const all = [...db.games.values()].filter(g => g.meta.status !== 'over' && g.meta.status !== 'abandoned');
  return {
    open: all.filter(g => g.meta.status === 'open').map(gameCard),
    playing: all.filter(g => g.meta.status === 'playing').map(gameCard),
    mine: all.filter(g => g.meta.seats.includes(user.id)).map(g => g.meta.id),
  };
}
function getGame(id) {
  const g = db.games.get(id);
  if (!g) throw new HttpError(404, 'Game not found');
  return g;
}

// ------------------------------------------------------------ API routes
async function api(req, res, url) {
  const method = req.method;
  const route = url.pathname.replace(/^\/api/, '');
  const ip = clientIp(req);
  const user = userFromReq(req);
  const need = () => { if (!user) throw new HttpError(401, 'Please log in.'); return user; };

  if (route === '/config' && method === 'GET') {
    return send(res, 200, { build: BUILD_ID, feedbackUrl: FEEDBACK_URL, needsCode: !!REGISTRATION_CODE, colors: COLORS, firstUser: db.users.length === 0 });
  }
  if (route === '/register' && method === 'POST') {
    if (rateLimited(ip)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await readBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 24);
    const pw = String(b.password || '');
    if (email.length > MAX_EMAIL || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');
    if (!name) throw new HttpError(400, 'Pick a display name.');
    if (pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) throw new HttpError(400, 'Password must be at least 8 characters.');
    const country = String(b.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'Pick your country.');
    if (REGISTRATION_CODE && !sameSecret(b.code, REGISTRATION_CODE) && db.users.length > 0) { noteFailure(ip); throw new HttpError(403, 'Wrong invite code.'); }
    if (signupLimited(ip)) throw new HttpError(429, 'Too many new accounts from this address. Try again in an hour.');
    const pwHash = await hashPassword(pw); // (async: the checks and the insert below follow without another await, so two sign-ups cannot take the same name)
    if (db.users.some(u => u.email === email)) throw new HttpError(409, 'That email is already registered.');
    if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'That name is taken.');
    const taken = db.users.map(u => u.color);
    const u = { id: newId(), email, name, country, color: COLORS.find(c => !taken.includes(c)) || COLORS[db.users.length % COLORS.length], ...pwHash, createdAt: Date.now(), admin: db.users.length === 0, colorsV: 2 };
    db.users.push(u); store.saveUsers();
    signups.get(ip).push(Date.now());
    startSession(req, res, u);
    return send(res, 200, { user: meUser(u) });
  }
  if (route === '/login' && method === 'POST') {
    if (rateLimited(ip) || rateHit('login:' + ip, 10 * 60e3, 60)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await readBody(req);
    const u = db.users.find(x => x.email === String(b.email || '').trim().toLowerCase());
    const pw = String(b.password || '');
    const ok = pw.length <= MAX_PASSWORD && await checkPassword(u || DUMMY_USER, pw); // (the dummy check keeps unknown emails as slow as known ones)
    if (!u || !ok) { noteFailure(ip); throw new HttpError(401, 'Wrong email or password.'); }
    startSession(req, res, u);
    return send(res, 200, { user: meUser(u) });
  }
  if (route === '/logout' && method === 'POST') {
    const key = sessionKey(req);
    if (key) { delete db.sessions[key]; store.saveSessions(); closeSockets(c => c.key === key); }
    res.setHeader('Set-Cookie', `broch_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isHttps(req) ? '; Secure' : ''}`);
    return send(res, 200, { ok: true });
  }
  if (route === '/me' && method === 'GET') return send(res, 200, { user: meUser(user) });
  if (route === '/me' && method === 'PATCH') {
    const u = need(); const b = await readBody(req);
    if (b.name != null) {
      const name = String(b.name).trim().slice(0, 24);
      if (!name) throw new HttpError(400, 'Name cannot be empty.');
      if (db.users.some(x => x !== u && x.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'That name is taken.');
      u.name = name;
    }
    if (b.color != null) { if (!COLORS.includes(b.color)) throw new HttpError(400, 'Unknown color.'); u.color = b.color; }
    if (b.country != null) { const c = String(b.country).toUpperCase(); if (!/^[A-Z]{2}$/.test(c)) throw new HttpError(400, 'Pick your country.'); u.country = c; }
    if (b.lang != null) { if (typeof b.lang !== 'string' || !/^[a-z]{2}$/.test(b.lang)) throw new HttpError(400, 'Unknown language.'); u.lang = b.lang; }
    if (b.newPassword) {
      if (rateHit('pw:' + u.id, 10 * 60e3, 20)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
      if (String(b.password || '').length > MAX_PASSWORD || !(await checkPassword(u, String(b.password || '')))) throw new HttpError(401, 'Current password is wrong.');
      if (String(b.newPassword).length < MIN_PASSWORD || String(b.newPassword).length > MAX_PASSWORD) throw new HttpError(400, 'Password must be at least 8 characters.');
      Object.assign(u, await hashPassword(String(b.newPassword)));
      dropSessionsOf(u.id, sessionKey(req)); // everybody else who was logged in with the old password is logged out
    }
    store.saveUsers();
    return send(res, 200, { user: meUser(u) });
  }
  if (route === '/users' && method === 'GET') { need(); return send(res, 200, { users: db.users.map(publicUser) }); }

  // ---- lobby
  if (route === '/lobby' && method === 'GET') return send(res, 200, lobbyFor(need()));
  if (route === '/games' && method === 'POST') {
    const u = need(); const b = await readBody(req);
    // one account cannot flood the lobby: a limited number of games it hosts that are open or running
    let hosted = 0;
    for (const x of db.games.values()) if (x.meta.host === u.id && (x.meta.status === 'open' || x.meta.status === 'playing')) hosted++;
    if (hosted >= MAX_OPEN_GAMES_PER_USER) throw new HttpError(429, 'You already host too many open or running games.');
    const mode = b.mode === 'knights' || engine.isStandalone(b.mode) ? b.mode : 'classic';
    const standalone = engine.isStandalone(mode);
    const maxPlayers = Math.max(standalone ? engine.minPlayers(mode) : 2, Math.min(standalone ? engine.maxPlayers(mode) : 6, b.maxPlayers | 0 || 4));
    const expansion = !standalone && ['seafarers', 'traders'].includes(b.expansion) ? b.expansion : 'none';
    const scenario = expansion === 'seafarers' ? (typeof b.scenario === 'string' && Object.hasOwn(SEA_SCENARIOS, b.scenario) ? b.scenario : 'shores') : mode === 'explorers' ? String(Math.max(1, Math.min(5, b.escen | 0 || 2))) : null;
    const bv = b.variants || {};
    const variants = expansion === 'traders' ? { fishermen: !!bv.fishermen, rivers: !!bv.rivers, caravans: !!bv.caravans, barbarians: !!bv.barbarians, traders: !!bv.traders, events: !!bv.events, friendly: !!bv.friendly, harbors: !!bv.harbors } : null;
    if (variants && (variants.caravans || variants.barbarians || variants.traders) && mode === 'knights') throw new HttpError(400, 'This scenario is for the classic rules.');
    const def = standalone ? engine.defaultVp(mode, scenario) : mode === 'knights' ? (expansion === 'seafarers' ? SEA_SCENARIOS[scenario].vp + 2 : 13) + (variants && variants.harbors ? 1 : 0) : expansion === 'seafarers' ? SEA_SCENARIOS[scenario].vp : expansion === 'traders' ? tradersVp(variants) : 10;
    const vpTarget = standalone && engine.fixedVp(mode) ? def : Math.max(5, Math.min(20, b.vpTarget | 0 || def));
    const big = !standalone && (typeof b.big === 'boolean' ? b.big : maxPlayers > 4);
    const g = { meta: { id: newId(6), name: String(b.name || '').slice(0, 40), mode, expansion, scenario, variants, big, variable: expansion === 'seafarers' && !!b.variable, robberReturn: !!b.robberReturn, startBoth: !!b.startBoth, knightsFree: !!b.knightsFree && b.mode !== 'knights', vpAtOnce: !!b.vpAtOnce && mode === 'classic', expBuildAnytime: !!b.expBuildAnytime && (mode === 'classic' || mode === 'knights'), expExtraStart: !!b.expExtraStart && (mode === 'classic' || mode === 'knights') && expansion !== 'traders', gameOptions: standalone ? cleanOptions(b.gameOptions) : null, maxPlayers, vpTarget, host: u.id, seats: [u.id], status: 'open', createdAt: Date.now() }, state: null };
    db.games.set(g.meta.id, g); store.saveGame(g, true);
    broadcastLobby();
    return send(res, 200, { game: gameCard(g) });
  }
  let m = route.match(/^\/games\/([\w-]+)\/color$/);
  if (m && method === 'POST') {
    const u = need(); const g = getGame(m[1]); const meta = g.meta; const b = await readBody(req);
    if (meta.status !== 'open') throw new HttpError(400, 'The game already started.');
    if (!meta.seats.includes(u.id)) throw new HttpError(400, 'Join the game first.');
    if (!COLORS.includes(b.color)) throw new HttpError(400, 'Unknown color.');
    fixSeatColors(meta);
    const owner = Object.keys(meta.colors).find(id => meta.colors[id] === b.color && id !== u.id);
    if (owner) throw new HttpError(409, 'Someone else already has that color.');
    meta.colors[u.id] = b.color;
    store.saveGame(g, true);
    broadcastLobby();
    return send(res, 200, { game: gameCard(g) });
  }
  m = route.match(/^\/games\/([\w-]+)\/bots$/);
  if (m && method === 'POST') {
    const u = need(); const g = getGame(m[1]); const meta = g.meta; const b = await readBody(req);
    if (meta.status !== 'open') throw new HttpError(400, 'The game already started.');
    if (meta.host !== u.id) throw new HttpError(403, 'Only the host can add or remove bots.');
    meta.bots = meta.bots || {};
    if (b.action === 'remove') {
      if (!isBotId(b.id) || !meta.seats.includes(b.id)) throw new HttpError(400, 'No such bot.');
      meta.seats = meta.seats.filter(x => x !== b.id); delete meta.bots[b.id];
    } else {
      if (meta.seats.length >= meta.maxPlayers) throw new HttpError(400, 'The game is full.');
      const id = 'bot_' + newId(5);
      const taken = [...db.users.map(x => x.name), ...Object.values(meta.bots).map(x => x.name)];
      meta.bots[id] = { name: botName(taken) };
      meta.seats.push(id);
    }
    fixSeatColors(meta);
    store.saveGame(g, true);
    broadcastLobby();
    return send(res, 200, { game: gameCard(g) });
  }
  m = route.match(/^\/games\/([\w-]+)\/(join|leave|start|abandon|resign)$/);
  if (m && method === 'POST') {
    const u = need(); const g = getGame(m[1]); const meta = g.meta;
    if (m[2] === 'join') {
      if (meta.status !== 'open') throw new HttpError(400, 'That game already started.');
      if (!meta.seats.includes(u.id)) {
        if (meta.seats.length >= meta.maxPlayers) throw new HttpError(400, 'The game is full.');
        meta.seats.push(u.id);
      }
    } else if (m[2] === 'leave') {
      if (meta.status !== 'open') throw new HttpError(400, 'You cannot leave a running game. The host can abandon it.');
      meta.seats = meta.seats.filter(x => x !== u.id);
      if (!meta.seats.some(x => !isBotId(x))) { store.deleteGame(meta.id); broadcastLobby(); return send(res, 200, { ok: true }); }
      if (meta.host === u.id) meta.host = meta.seats.find(x => !isBotId(x));
    } else if (m[2] === 'start') {
      if (meta.host !== u.id) throw new HttpError(403, 'Only the host can start.');
      if (meta.status !== 'open') throw new HttpError(400, 'Already started.');
      if (meta.seats.length < engine.minPlayers(meta.mode)) throw new HttpError(400, engine.minPlayers(meta.mode) > 2 ? 'This game needs more players.' : 'Wait for at least one more player.');
      fixSeatColors(meta);
      const players = meta.seats.map(id => { const x = seatUser(g, id); return { id, name: x.name, color: meta.colors[id], country: x.country || null }; });
      g.state = engine.createGame({ id: meta.id, mode: meta.mode, players, options: { vpTarget: meta.vpTarget, expansion: meta.expansion, scenario: meta.scenario, variants: meta.variants, robberReturn: !!meta.robberReturn, startBoth: !!meta.startBoth, variable: !!meta.variable, knightsFree: !!meta.knightsFree, vpAtOnce: !!meta.vpAtOnce, expBuildAnytime: !!meta.expBuildAnytime, expExtraStart: !!meta.expExtraStart, game: meta.gameOptions || {}, big: meta.big ?? players.length > 4 } });
      meta.status = 'playing'; meta.startedAt = Date.now();
      runner.schedule(g);
    } else if (m[2] === 'resign') {
      // leaving a running game: a bot takes the seat (the game then counts for no statistics); the last human closes it
      if (meta.status !== 'playing' || !g.state) throw new HttpError(400, 'The game is not running.');
      if (!meta.seats.includes(u.id)) throw new HttpError(403, 'You are not in this game.');
      if (g.state.phase === 'over') throw new HttpError(400, 'The game is over.');
      if (!meta.seats.some(x => x !== u.id && !isBotId(x))) {
        runner.cancel(meta.id); store.deleteGame(meta.id); broadcastGame(g, { t: 'abandoned' }); broadcastLobby();
        return send(res, 200, { ok: true });
      }
      meta.bots = meta.bots || {};
      const id = 'bot_' + newId(5);
      const taken = [...db.users.map(x => x.name), ...Object.values(meta.bots).map(x => x.name)];
      const name = botName(taken);
      meta.bots[id] = { name };
      meta.seats = meta.seats.map(x => (x === u.id ? id : x));
      if (meta.colors && meta.colors[u.id]) { meta.colors[id] = meta.colors[u.id]; delete meta.colors[u.id]; }
      if (meta.host === u.id) meta.host = meta.seats.find(x => !isBotId(x));
      const pl = g.state.players.find(p => p.userId === u.id);
      if (pl) { pl.userId = id; pl.name = name; }
      store.saveGame(g, true);
      broadcastLobby(); broadcastState(g);
      runner.schedule(g);
      return send(res, 200, { ok: true });
    } else if (m[2] === 'abandon') {
      if (meta.host !== u.id && !u.admin) throw new HttpError(403, 'Only the host can abandon the game.');
      runner.cancel(meta.id);
      store.deleteGame(meta.id);
      broadcastGame(g, { t: 'abandoned' });
      broadcastLobby();
      return send(res, 200, { ok: true });
    }
    store.saveGame(g, true);
    broadcastLobby();
    if (g.state) broadcastState(g);
    return send(res, 200, { game: gameCard(g) });
  }
  m = route.match(/^\/games\/([\w-]+)$/);
  if (m && method === 'GET') { need(); return send(res, 200, { game: gameCard(getGame(m[1])) }); }

  // ---- stats
  if (route === '/stats' && method === 'GET') {
    need();
    return send(res, 200, { history: db.history, users: db.users.map(publicUser) });
  }
  if (route === '/stats/manual' && method === 'POST') {
    const u = need(); const b = await readBody(req);
    if (rateHit('manual:' + u.id, 3600e3, 30)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const players = Array.isArray(b.players) ? [...new Set(b.players)].filter(id => typeof id === 'string' && db.users.some(x => x.id === id)).slice(0, 6) : [];
    if (!players.includes(b.winner)) throw new HttpError(400, 'Pick the winner among the players.');
    const date = Date.parse(b.date) || Date.now();
    const entry = {
      id: 'm' + newId(6), manual: true, createdBy: u.id, mode: b.mode === 'knights' ? 'knights' : 'classic',
      startedAt: date, finishedAt: date, winner: b.winner,
      players: players.map(id => { const x = db.users.find(y => y.id === id); return { userId: id, name: x.name, color: x.color }; }),
    };
    db.history.push(entry); store.saveHistory();
    broadcastAll({ t: 'stats' });
    return send(res, 200, { entry });
  }
  m = route.match(/^\/stats\/([\w-]+)$/);
  if (m && method === 'DELETE') {
    const u = need();
    const i = db.history.findIndex(h => h.id === m[1]);
    if (i < 0) throw new HttpError(404, 'Not found');
    const h = db.history[i];
    if (!(u.admin || (h.manual && h.createdBy === u.id))) throw new HttpError(403, 'Only the person who logged it (or an admin) can delete it.');
    db.history.splice(i, 1); store.saveHistory();
    broadcastAll({ t: 'stats' });
    return send(res, 200, { ok: true });
  }

  if (route === '/client-error' && method === 'POST') {
    // open to visitors who are not logged in (the login page can fail too), so: few per minute and address, small, one clean line each
    if (rateHit('cerr:' + ip, 60e3, 20)) throw new HttpError(429, 'Too many reports.');
    if (+req.headers['content-length'] > 16384) throw new HttpError(413, 'Report too large.');
    const b = await readBody(req).catch(() => ({}));
    console.warn('[client-error]', logText(user ? user.name : 'anon', 40), logText(b.message, 500), logText(b.stack, 1500));
    return send(res, 200, { ok: true });
  }
  if (route === '/health') return send(res, 200, { ok: true, build: BUILD_ID });
  throw new HttpError(404, 'Unknown endpoint');
}

// Headers on every answer: no framing (clickjacking), no content sniffing, no referrer, and a content security policy that only allows
// the app's own scripts (plus the Google fonts the page uses).
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
function securityHeaders(req, res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
// Nothing a visitor sends may take the process down: the whole handler is guarded (bad request target, bad %-escape, a failing file read).
const server = http.createServer(async (req, res) => {
  try {
    securityHeaders(req, res);
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end('Bad request'); }
    if (url.pathname.startsWith('/api/')) {
      try { await api(req, res, url); } catch (e) {
        if (res.headersSent) { try { res.end(); } catch { /* connection gone */ } return; }
        if (e instanceof HttpError) return send(res, e.code, { error: e.message });
        console.error('API error', req.method, url.pathname, e);
        return send(res, 500, { error: 'Server error: ' + e.message, internal: true });
      }
      return;
    }
    serveStatic(req, res);
  } catch (e) {
    console.error('Request crashed', req.method, String(req.url).slice(0, 200), e);
    try { if (!res.headersSent) res.writeHead(500); res.end(); } catch { /* connection gone */ }
  }
});

// ------------------------------------------------------------ websockets
// compress bigger messages (game states are repetitive JSON); small ones go out as they are
// a web page of another site must not be able to open a WebSocket with the visitor's cookie: the Origin has to be this site
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true; // not a browser
  try { return new URL(o).host === (req.headers['x-forwarded-host'] && TRUST_PROXY ? req.headers['x-forwarded-host'] : req.headers.host); } catch { return false; }
}
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024, verifyClient: ({ req }) => sameOrigin(req), perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 }, concurrencyLimit: 4 } });
const clients = new Set(); // {ws, user, key (hash of the session token), game}
// close the sockets of logged-out or dropped sessions (a socket is authenticated once, when it opens)
function closeSockets(pred) { for (const c of clients) if (pred(c)) { try { c.ws.close(4001, 'login'); } catch { /* already closed */ } } }
wss.on('error', e => console.error('WebSocket server error', e && e.message));

function sendWs(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function broadcastAll(msg) { clients.forEach(c => sendWs(c, msg)); }
function broadcastLobby() { broadcastAll({ t: 'lobby' }); }
function broadcastGame(g, msg) { clients.forEach(c => { if (c.game === g.meta.id) sendWs(c, msg); }); }
function seatOf(g, userId) { return g.state ? g.state.players.findIndex(p => p.userId === userId) : -1; }
// Each connection remembers the board and the per-turn history it already has, so a normal update only carries
// what changed: the board is left out while it is the same, and only new turns of the history are sent.
function stateFor(c, g) {
  const view = engine.viewFor(g.state, seatOf(g, c.user.id));
  if (!c.cache || c.cache.game !== g.meta.id) c.cache = { game: g.meta.id, board: null, trackLen: 0, trackHead: null };
  const k = c.cache;
  const bj = JSON.stringify(view.board);
  if (k.board === bj) { delete view.board; view.boardSame = true; } else k.board = bj;
  const tr = view.track || [];
  const head = tr.length ? tr[0].t : null;
  if (k.trackLen && tr.length >= k.trackLen && k.trackHead === head) { view.trackFrom = k.trackLen; view.track = tr.slice(k.trackLen); }
  k.trackLen = tr.length; k.trackHead = head;
  return view;
}
function broadcastState(g) {
  const online = onlineIn(g);
  clients.forEach(c => {
    if (c.game !== g.meta.id || !g.state) return;
    c.sentV = g.state.version; c.sentAt = Date.now();
    sendWs(c, { t: 'state', game: g.meta.id, state: stateFor(c, g), online });
  });
}
// A player's screen plays animations (dice, building, loot). Their client reports {t:'fx', v} when it has shown everything up to state version v,
// and the computer players wait for that, so a bot never races ahead of what the human sees. At most 8 s per move; clients that never report are ignored.
const FX_WAIT_MS = 8000;
function viewersBehind(g) {
  const now = Date.now();
  for (const c of clients) {
    if (c.game !== g.meta.id || c.fxV === undefined || c.sentV === undefined) continue;
    if (c.fxV < c.sentV && now - c.sentAt < FX_WAIT_MS && seatOf(g, c.user.id) >= 0) return true;
  }
  return false;
}
function onlineIn(g) {
  const ids = new Set([...clients].filter(c => c.game === g.meta.id).map(c => c.user.id));
  return g.meta.seats.filter(id => ids.has(id) || isBotId(id)); // bots are always at the table
}

function finishGame(g) {
  const sum = engine.summary(g.state);
  // games with computer players do not count for the statistics (nobody earns a win against a bot)
  const withBots = g.state.players.some(p => isBotId(p.userId));
  if (!withBots && !db.history.some(h => h.id === sum.id)) { db.history.push(sum); store.saveHistory(); }
  g.meta.status = 'over'; g.meta.finishedAt = Date.now();
  store.saveGame(g, true);
  broadcastLobby();
  broadcastAll({ t: 'stats' });
}

const runner = createRunner({ engine, store, broadcastState, finishGame, viewersBehind });

wss.on('connection', (ws, req) => {
  // a frame that is too big or not valid text makes ws emit 'error' on the socket; without a listener that would end the process
  ws.on('error', e => { console.warn('WebSocket error:', e && e.message); try { ws.terminate(); } catch { /* gone */ } });
  let user, key;
  try { key = sessionKey(req); user = userFromReq(req); } catch (e) { user = null; }
  if (!user) { ws.close(4001, 'login'); return; }
  const c = { ws, user, key, game: null };
  clients.add(c);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let burstAt = Date.now(), burst = 0;
  ws.on('message', raw => {
    // the login is checked again on every message: logout, a password change or an expired session ends the socket
    const sess = db.sessions[c.key];
    if (!sess || sess.exp < Date.now() || !db.users.includes(user)) { ws.close(4001, 'login'); return; }
    if (Date.now() - burstAt > 1000) { burstAt = Date.now(); burst = 0; }
    if (++burst > 200) { ws.close(1008, 'too fast'); return; } // far more than a client ever sends per second (the bot test at zero delay peaks below this)
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    try {
      if (msg.t === 'watch') {
        const prev = c.game ? db.games.get(c.game) : null;
        c.game = msg.game || null;
        c.cache = null; // (re)watching always starts with a full state
        if (prev) broadcastState(prev);
        const g = c.game && db.games.get(c.game);
        if (!g) { if (c.game) sendWs(c, { t: 'abandoned' }); return; }
        if (g.state) broadcastState(g);
      } else if (msg.t === 'ping') {
        sendWs(c, { t: 'pong' }); // the client's heartbeat: it replaces a connection that goes silent (public/js/core/core.js)
      } else if (msg.t === 'fx') {
        if (msg.game === c.game && Number.isFinite(+msg.v)) c.fxV = +msg.v;
      } else if (msg.t === 'act') {
        const g = db.games.get(msg.game);
        if (!g || !g.state) throw new engine.GameError('Game not running.');
        const seat = seatOf(g, user.id);
        if (seat < 0) throw new engine.GameError('You are watching this game.');
        const wasOver = g.state.phase === 'over';
        engine.act(g.state, seat, msg.action);
        store.saveGame(g);
        broadcastState(g);
        if (!wasOver && g.state.phase === 'over') finishGame(g);
        runner.schedule(g);
        sendWs(c, { t: 'ok', rid: msg.rid });
      }
    } catch (e) {
      const internal = !(e instanceof engine.GameError);
      if (internal) console.error('Action crashed:', logText(msg.action && msg.action.type, 60), '|', logText(e && e.message, 200), '|', logText(String((e && e.stack) || '').split('\n').slice(1, 4).join(' '), 400)); // (never the action itself: it is visitor data)
      sendWs(c, { t: 'err', rid: msg.rid, msg: internal ? 'Server error: ' + e.message : e.message, params: e.params, internal });
    }
  });
  ws.on('close', () => {
    clients.delete(c);
    const g = c.game && db.games.get(c.game);
    if (g) broadcastState(g);
  });
});

purgeSessions();
setInterval(purgeSessions, 6 * 3600e3).unref();
if (!REGISTRATION_CODE) console.warn('WARNING: REGISTRATION_CODE is not set: anybody who finds the address can create an account. Set it before the site is public.');
if (!TRUST_PROXY) console.log('TRUST_PROXY is off: set TRUST_PROXY=1 when the app runs behind Cloudflare (needed for the Secure cookie and the real visitor address).');
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
}, 30000);

// colors were renamed in v1.1: old 'green' is now 'teal', old 'brown' (shown purple) is now 'purple'
// One damaged game must never stop the server: every start-up step below runs per game, and a game that makes it throw is set aside (store.quarantineGame).
function eachGame(step, fn) {
  for (const g of [...db.games.values()]) { try { fn(g); } catch (e) { store.quarantineGame(g.meta.id, step + ': ' + (e && e.message)); } }
}
(function migrateColors() {
  if (db.users.some(u => u.colorsV === 2)) return;
  const map = c => ({ green: 'teal', brown: 'purple' }[c] || c);
  db.users.forEach(u => { u.color = map(u.color); u.colorsV = 2; });
  db.history.forEach(h => { if (Array.isArray(h.players)) h.players.forEach(p => { if (p) p.color = map(p.color); }); });
  eachGame('color migration', g => { if (g.state) g.state.players.forEach(p => { p.color = map(p.color); }); if (g.meta.colors) for (const k in g.meta.colors) g.meta.colors[k] = map(g.meta.colors[k]); store.saveGame(g, true); });
  if (db.users.length) { store.saveUsers(); store.saveHistory(); }
})();

// make sure finished-but-unrecorded games (e.g. crash right at the end) land in history
eachGame('migrate', g => { if (g.state) engine.migrate(g.state); });
// open and running games of the retired simplified Explorers & Pirates (expansion 'explorers') are now the standalone game
eachGame('explorers migration', g => {
  const m = g.meta;
  if (m.expansion !== 'explorers' || engine.isStandalone(m.mode) || (g.state && g.state.mode !== 'explorers')) return;
  Object.assign(m, { mode: 'explorers', expansion: 'none', scenario: '2', variants: null, big: false, variable: false, gameOptions: {} });
  m.maxPlayers = Math.max(engine.minPlayers('explorers'), Math.min(engine.maxPlayers('explorers'), m.maxPlayers));
  m.vpTarget = engine.defaultVp('explorers', m.scenario);
  delete m.missions;
  store.saveGame(g, true);
});
eachGame('finish', g => { if (g.state && g.state.phase === 'over' && g.meta.status !== 'over') finishGame(g); });

function shutdown() { console.log('Saving and shutting down…'); store.saveEverythingNow(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// Safety net: an error nobody caught (a bug in one request, a timer or a socket) is logged and the data saved, but the server keeps running
// so one bad request cannot interrupt everybody's games. (Anything that ends up here is a bug to fix: the log line says where.)
function survive(kind, e) {
  console.error(kind, e && e.stack ? e.stack : e);
  try { store.saveEverythingNow(); } catch (err) { console.error('save after error failed', err && err.message); }
}
process.on('uncaughtException', e => survive('Uncaught exception', e));
process.on('unhandledRejection', e => survive('Unhandled rejection', e));

// games with bots that were running when the server stopped: let the bots go on
eachGame('bots', g => { if (g.state && g.meta.status === 'playing') runner.schedule(g); });

server.listen(PORT, () => console.log(`Broch listening on :${PORT} (data in ${store.DATA_DIR})`));
