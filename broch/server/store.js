'use strict';
// Tiny JSON-file persistence. Everything lives in DATA_DIR (mount this as a TrueNAS dataset).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GAMES_DIR = path.join(DATA_DIR, 'games');
fs.mkdirSync(GAMES_DIR, { recursive: true, mode: 0o700 });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); // accounts and sessions: readable by the app user only
  fs.renameSync(tmp, file);
}

const timers = new Map();
function debounced(key, fn, ms = 400) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); try { fn(); } catch (e) { console.error('save failed', key, e); } }, ms));
}
function flushAll() { for (const [k, t] of timers) { clearTimeout(t); timers.delete(k); } }

const db = {
  users: readJson(path.join(DATA_DIR, 'users.json'), []),
  sessions: readJson(path.join(DATA_DIR, 'sessions.json'), {}),
  history: readJson(path.join(DATA_DIR, 'history.json'), []),
  games: new Map(),
};

for (const f of fs.readdirSync(GAMES_DIR)) {
  if (!f.endsWith('.json')) continue;
  const g = readJson(path.join(GAMES_DIR, f), null);
  if (g && g.meta) db.games.set(g.meta.id, g);
}

const saveUsers = () => writeJson(path.join(DATA_DIR, 'users.json'), db.users);
const saveSessions = () => debounced('sessions', () => writeJson(path.join(DATA_DIR, 'sessions.json'), db.sessions));
const saveHistory = () => writeJson(path.join(DATA_DIR, 'history.json'), db.history);
function saveGame(g, now = false) {
  const write = () => writeJson(path.join(GAMES_DIR, g.meta.id + '.json'), g);
  if (now) write(); else debounced('game:' + g.meta.id, write);
}
function deleteGame(id) {
  db.games.delete(id);
  try { fs.unlinkSync(path.join(GAMES_DIR, id + '.json')); } catch { /* gone */ }
}
function saveEverythingNow() {
  flushAll();
  saveUsers();
  writeJson(path.join(DATA_DIR, 'sessions.json'), db.sessions);
  saveHistory();
  for (const g of db.games.values()) saveGame(g, true);
}

// files written by an older version may be readable by everybody: tighten them once at start
for (const f of ['users.json', 'sessions.json', 'history.json']) { try { fs.chmodSync(path.join(DATA_DIR, f), 0o600); } catch { /* not there yet or not ours */ } }
try { fs.chmodSync(DATA_DIR, 0o700); } catch { /* not ours (a mounted dataset): fine */ }

module.exports = { db, DATA_DIR, saveUsers, saveSessions, saveHistory, saveGame, deleteGame, saveEverythingNow };
