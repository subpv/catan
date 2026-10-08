'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');
const { db } = store;
const engine = require('./engine');
const { COLORS } = require('./engine/constants');

const PORT = +process.env.PORT || 8080;
const REGISTRATION_CODE = process.env.REGISTRATION_CODE || '';
const FEEDBACK_URL = process.env.FEEDBACK_URL || 'https://feedback.maidev.dk/';
const PUBLIC = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 60;

// ------------------------------------------------------------ auth helpers
const newId = (n = 9) => crypto.randomBytes(n).toString('base64url');
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(user, pw) {
  const h = crypto.scryptSync(pw, user.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(user.hash, 'hex'));
}
const publicUser = u => u && ({ id: u.id, name: u.name, color: u.color, country: u.country || null, admin: !!u.admin });
const meUser = u => u && ({ ...publicUser(u), email: u.email, lang: u.lang || null });
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function userFromReq(req) {
  const tok = cookies(req).broch_session;
  const sess = tok && db.sessions[tok];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users.find(u => u.id === sess.userId) || null;
}
function startSession(res, user) {
  const tok = newId(24);
  db.sessions[tok] = { userId: user.id, exp: Date.now() + SESSION_DAYS * 864e5 };
  store.saveSessions();
  res.setHeader('Set-Cookie', `broch_session=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
}

const attempts = new Map();
function rateLimited(ip) {
  const a = (attempts.get(ip) || []).filter(t => Date.now() - t < 10 * 60e3);
  attempts.set(ip, a);
  return a.length >= 15;
}
function noteFailure(ip) { (attempts.get(ip) || attempts.set(ip, []).get(ip)).push(Date.now()); }

// ------------------------------------------------------------ http helpers
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, 'Bad JSON')); } });
  });
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

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
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  const e = loadStatic(file);
  if (!e) { res.writeHead(404); return res.end('Not found'); }
  const headers = { 'Content-Type': e.type, 'Cache-Control': 'no-cache', ETag: e.etag, Vary: 'Accept-Encoding' };
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
function fixSeatColors(meta) {
  meta.colors = meta.colors || {};
  for (const id of Object.keys(meta.colors)) if (!meta.seats.includes(id)) delete meta.colors[id];
  const used = new Set();
  for (const id of meta.seats) {
    let c = meta.colors[id];
    if (!c || used.has(c) || !COLORS.includes(c)) {
      const fav = (db.users.find(u => u.id === id) || {}).color;
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
    expansion: m.expansion || 'none', scenario: m.scenario || null, big: !!m.big, variants: m.variants || null, missions: m.missions || null, robberReturn: !!m.robberReturn, startBoth: !!m.startBoth,
    host: m.host, createdAt: m.createdAt,
    seats: m.seats.map(id => {
      const u = publicUser(db.users.find(x => x.id === id)) || { id, name: '?' };
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
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const user = userFromReq(req);
  const need = () => { if (!user) throw new HttpError(401, 'Please log in.'); return user; };

  if (route === '/config' && method === 'GET') {
    return send(res, 200, { feedbackUrl: FEEDBACK_URL, needsCode: !!REGISTRATION_CODE, colors: COLORS, firstUser: db.users.length === 0 });
  }
  if (route === '/register' && method === 'POST') {
    if (rateLimited(ip)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await readBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 24);
    const pw = String(b.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email.');
    if (!name) throw new HttpError(400, 'Pick a display name.');
    if (pw.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
    const country = String(b.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'Pick your country.');
    if (REGISTRATION_CODE && b.code !== REGISTRATION_CODE && db.users.length > 0) { noteFailure(ip); throw new HttpError(403, 'Wrong invite code.'); }
    if (db.users.some(u => u.email === email)) throw new HttpError(409, 'That email is already registered.');
    if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'That name is taken.');
    const taken = db.users.map(u => u.color);
    const u = { id: newId(), email, name, country, color: COLORS.find(c => !taken.includes(c)) || COLORS[db.users.length % COLORS.length], ...hashPassword(pw), createdAt: Date.now(), admin: db.users.length === 0, colorsV: 2 };
    db.users.push(u); store.saveUsers();
    startSession(res, u);
    return send(res, 200, { user: meUser(u) });
  }
  if (route === '/login' && method === 'POST') {
    if (rateLimited(ip)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const b = await readBody(req);
    const u = db.users.find(x => x.email === String(b.email || '').trim().toLowerCase());
    if (!u || !checkPassword(u, String(b.password || ''))) { noteFailure(ip); throw new HttpError(401, 'Wrong email or password.'); }
    startSession(res, u);
    return send(res, 200, { user: meUser(u) });
  }
  if (route === '/logout' && method === 'POST') {
    const tok = cookies(req).broch_session;
    if (tok) { delete db.sessions[tok]; store.saveSessions(); }
    res.setHeader('Set-Cookie', 'broch_session=; Path=/; Max-Age=0');
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
    if (b.lang != null) { if (!/^[a-z]{2}$/.test(b.lang)) throw new HttpError(400, 'Unknown language.'); u.lang = b.lang; }
    if (b.newPassword) {
      if (!checkPassword(u, String(b.password || ''))) throw new HttpError(401, 'Current password is wrong.');
      if (String(b.newPassword).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
      Object.assign(u, hashPassword(String(b.newPassword)));
    }
    store.saveUsers();
    return send(res, 200, { user: meUser(u) });
  }
  if (route === '/users' && method === 'GET') { need(); return send(res, 200, { users: db.users.map(publicUser) }); }

  // ---- lobby
  if (route === '/lobby' && method === 'GET') return send(res, 200, lobbyFor(need()));
  if (route === '/games' && method === 'POST') {
    const u = need(); const b = await readBody(req);
    const mode = b.mode === 'knights' || engine.isStandalone(b.mode) ? b.mode : 'classic';
    const standalone = engine.isStandalone(mode);
    const maxPlayers = Math.max(2, Math.min(standalone ? 4 : 6, b.maxPlayers | 0 || 4));
    const expansion = !standalone && ['seafarers', 'traders', 'explorers'].includes(b.expansion) ? b.expansion : 'none';
    const scenario = expansion === 'seafarers' ? (['shores', 'islands', 'fog'].includes(b.scenario) ? b.scenario : 'shores') : null;
    const bv = b.variants || {};
    const variants = expansion === 'traders' ? { fishermen: !!bv.fishermen, rivers: !!bv.rivers, events: !!bv.events } : null;
    const missions = expansion === 'explorers' ? (Array.isArray(b.missions) ? b.missions.filter(x => ['fish', 'spice', 'lairs'].includes(x)) : ['fish', 'spice', 'lairs']) : null;
    const def = standalone ? engine.defaultVp(mode) : mode === 'knights' ? 13 : expansion === 'seafarers' ? { shores: 14, islands: 13, fog: 12 }[scenario] : expansion === 'explorers' ? 12 : 10;
    const vpTarget = Math.max(5, Math.min(20, b.vpTarget | 0 || def));
    const big = !standalone && (typeof b.big === 'boolean' ? b.big : maxPlayers > 4);
    const g = { meta: { id: newId(6), name: String(b.name || '').slice(0, 40), mode, expansion, scenario, variants, missions, big, robberReturn: !!b.robberReturn, startBoth: !!b.startBoth, maxPlayers, vpTarget, specialBuild: b.specialBuild !== false, host: u.id, seats: [u.id], status: 'open', createdAt: Date.now() }, state: null };
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
  m = route.match(/^\/games\/([\w-]+)\/(join|leave|start|abandon)$/);
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
      if (!meta.seats.length) { store.deleteGame(meta.id); broadcastLobby(); return send(res, 200, { ok: true }); }
      if (meta.host === u.id) meta.host = meta.seats[0];
    } else if (m[2] === 'start') {
      if (meta.host !== u.id) throw new HttpError(403, 'Only the host can start.');
      if (meta.status !== 'open') throw new HttpError(400, 'Already started.');
      if (meta.seats.length < 2) throw new HttpError(400, 'Wait for at least one more player.');
      fixSeatColors(meta);
      const players = meta.seats.map(id => { const x = db.users.find(y => y.id === id); return { id, name: x.name, color: meta.colors[id], country: x.country || null }; });
      g.state = engine.createGame({ id: meta.id, mode: meta.mode, players, options: { vpTarget: meta.vpTarget, specialBuild: meta.specialBuild && players.length > 4, expansion: meta.expansion, scenario: meta.scenario, variants: meta.variants, missions: meta.missions, robberReturn: !!meta.robberReturn, startBoth: !!meta.startBoth, big: meta.big ?? players.length > 4 } });
      meta.status = 'playing'; meta.startedAt = Date.now();
    } else if (m[2] === 'abandon') {
      if (meta.host !== u.id && !u.admin) throw new HttpError(403, 'Only the host can abandon the game.');
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
    const players = Array.isArray(b.players) ? b.players.filter(id => db.users.some(x => x.id === id)) : [];
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
    const b = await readBody(req).catch(() => ({}));
    console.warn('[client-error]', user ? user.name : 'anon', String(b.message || '').slice(0, 500), String(b.stack || '').slice(0, 1500));
    return send(res, 200, { ok: true });
  }
  if (route === '/health') return send(res, 200, { ok: true, games: db.games.size, users: db.users.length });
  throw new HttpError(404, 'Unknown endpoint');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try { await api(req, res, url); } catch (e) {
      if (e instanceof HttpError) return send(res, e.code, { error: e.message });
      console.error('API error', req.method, url.pathname, e);
      return send(res, 500, { error: 'Server error: ' + e.message, internal: true });
    }
    return;
  }
  serveStatic(req, res);
});

// ------------------------------------------------------------ websockets
// compress bigger messages (game states are repetitive JSON); small ones go out as they are
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 }, concurrencyLimit: 4 } });
const clients = new Set(); // {ws, user, game}

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
    sendWs(c, { t: 'state', game: g.meta.id, state: stateFor(c, g), online });
  });
}
function onlineIn(g) {
  const ids = new Set([...clients].filter(c => c.game === g.meta.id).map(c => c.user.id));
  return g.meta.seats.filter(id => ids.has(id));
}

function finishGame(g) {
  const sum = engine.summary(g.state);
  if (!db.history.some(h => h.id === sum.id)) { db.history.push(sum); store.saveHistory(); }
  g.meta.status = 'over'; g.meta.finishedAt = Date.now();
  store.saveGame(g, true);
  broadcastLobby();
  broadcastAll({ t: 'stats' });
}

wss.on('connection', (ws, req) => {
  const user = userFromReq(req);
  if (!user) { ws.close(4001, 'login'); return; }
  const c = { ws, user, game: null };
  clients.add(c);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try {
      if (msg.t === 'watch') {
        const prev = c.game ? db.games.get(c.game) : null;
        c.game = msg.game || null;
        c.cache = null; // (re)watching always starts with a full state
        if (prev) broadcastState(prev);
        const g = c.game && db.games.get(c.game);
        if (!g) { if (c.game) sendWs(c, { t: 'abandoned' }); return; }
        if (g.state) broadcastState(g);
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
        sendWs(c, { t: 'ok', rid: msg.rid });
      }
    } catch (e) {
      const internal = !(e instanceof engine.GameError);
      if (internal) console.error('Action crashed', msg && msg.action, e);
      sendWs(c, { t: 'err', rid: msg.rid, msg: internal ? 'Server error: ' + e.message : e.message, params: e.params, internal });
    }
  });
  ws.on('close', () => {
    clients.delete(c);
    const g = c.game && db.games.get(c.game);
    if (g) broadcastState(g);
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
}, 30000);

// colors were renamed in v1.1: old 'green' is now 'teal', old 'brown' (shown purple) is now 'purple'
(function migrateColors() {
  if (db.users.some(u => u.colorsV === 2)) return;
  const map = c => ({ green: 'teal', brown: 'purple' }[c] || c);
  db.users.forEach(u => { u.color = map(u.color); u.colorsV = 2; });
  db.history.forEach(h => (h.players || []).forEach(p => { p.color = map(p.color); }));
  db.games.forEach(g => { if (g.state) g.state.players.forEach(p => { p.color = map(p.color); }); if (g.meta.colors) for (const k in g.meta.colors) g.meta.colors[k] = map(g.meta.colors[k]); store.saveGame(g, true); });
  if (db.users.length) { store.saveUsers(); store.saveHistory(); }
})();

// make sure finished-but-unrecorded games (e.g. crash right at the end) land in history
for (const g of db.games.values()) if (g.state) engine.migrate(g.state);
for (const g of db.games.values()) if (g.state && g.state.phase === 'over' && g.meta.status !== 'over') finishGame(g);

function shutdown() { console.log('Saving and shutting down…'); store.saveEverythingNow(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`Broch listening on :${PORT} (data in ${store.DATA_DIR})`));
