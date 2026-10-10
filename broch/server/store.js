'use strict';
// Tiny JSON-file persistence. Everything lives in DATA_DIR (mount this as a TrueNAS dataset).
//
// Safety rules (so a power cut, a restored dataset or a hand edit cannot silently wipe the accounts):
//  - a file that is MISSING is a fresh install and starts empty; a file that exists but cannot be read or parsed, or has the wrong shape, is NOT "no data":
//    the previous copy (<file>.bak, written on every save of users.json and history.json) is used if it is good;
//    otherwise users.json stops the server with a clear message (nothing is overwritten), history.json and sessions.json are moved to <file>.corrupt-<time> and start empty;
//  - writes go to <file>.tmp, are flushed to disk (users, history) and then renamed over the real file, so a crash leaves either the old or the new file;
//  - a game file that is damaged is moved to games/_broken/ and the other games keep running.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GAMES_DIR = path.join(DATA_DIR, 'games');
const BROKEN_DIR = path.join(GAMES_DIR, '_broken');
fs.mkdirSync(GAMES_DIR, { recursive: true, mode: 0o700 });

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validUsers = v => Array.isArray(v) && v.every(u => isObj(u) && ['id', 'email', 'name', 'salt', 'hash'].every(k => typeof u[k] === 'string'));
const validHistory = v => Array.isArray(v) && v.every(isObj);
const validSessions = v => isObj(v);
// A game needs at least an id, a seat list and (when it has started) a players list. Deeper problems are caught per game by the callers (see index.js).
const validGame = g => isObj(g) && isObj(g.meta) && /^[\w-]+$/.test(String(g.meta.id)) && Array.isArray(g.meta.seats) && typeof g.meta.status === 'string'
  && (g.state == null || (isObj(g.state) && Array.isArray(g.state.players)));

function readRaw(file) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (err) { return err && err.code === 'ENOENT' ? { missing: true } : { error: err }; }
}
// moves a damaged file out of the way (kept for a human to inspect); returns the new path or null
function quarantine(file, dir) {
  const target = path.join(dir || path.dirname(file), path.basename(file) + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-'));
  try { fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); fs.renameSync(file, target); return target; } catch { return null; }
}
function fatal(msg) { console.error('\n' + msg + '\n'); process.exit(1); }

// critical: the server must not start without this file (accounts); otherwise a damaged file is set aside and the data starts empty
function loadJson(file, fallback, valid, critical) {
  const name = path.basename(file);
  const r = readRaw(file);
  if (r.ok && valid(r.data)) return r.data;
  const bak = readRaw(file + '.bak');
  const useBak = bak.ok && valid(bak.data);
  if (r.missing) {
    if (!useBak) return fallback(); // a fresh install
    console.error(`WARNING: ${name} is missing, restored from ${name}.bak (the state of the save before the last one).`);
    return bak.data;
  }
  const why = r.ok ? 'it has an unexpected structure' : (r.error && r.error.code === 'EACCES' ? 'the app user may not read it (wrong owner or permissions)' : 'it is not valid JSON (' + (r.error && r.error.message) + ')');
  if (useBak) {
    const moved = quarantine(file);
    console.error(`WARNING: ${name} is damaged (${why}). Restored from ${name}.bak; the damaged file was kept as ${moved || 'itself'}. Changes since the previous save may be missing.`);
    return bak.data;
  }
  if (critical) {
    fatal(`FATAL: ${file} exists but cannot be used: ${why}.\n`
      + `The server stops here on purpose: starting would treat this as "no accounts" and overwrite the file.\n`
      + `What to do: fix the owner/permissions (the app user must be able to read and write ${DATA_DIR}), or restore ${name} from a snapshot/backup.\n`
      + `Only if the accounts are really lost: delete ${file} and start again (the first account to sign up becomes the admin).`);
  }
  const moved = quarantine(file);
  if (!moved) fatal(`FATAL: ${file} is damaged (${why}) and cannot be moved out of the way. Fix the permissions of ${DATA_DIR} or delete the file.`);
  console.error(`WARNING: ${name} is damaged (${why}). Moved to ${moved}; starting with empty ${name}.`);
  return fallback();
}

// keep: first copy the current file to <file>.bak; sync: flush to the disk before the rename
function writeJson(file, data, { keep = false, sync = false } = {}) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600); // accounts and sessions: readable by the app user only
  try {
    fs.writeFileSync(fd, JSON.stringify(data));
    if (sync) fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  if (keep) { try { fs.copyFileSync(file, file + '.bak'); } catch { /* nothing to keep yet */ } }
  fs.renameSync(tmp, file);
}

const timers = new Map();
function debounced(key, fn, ms = 400) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); try { fn(); } catch (e) { console.error('save failed', key, e); } }, ms));
}
function flushAll() { for (const [k, t] of timers) { clearTimeout(t); timers.delete(k); } }

const db = {
  users: loadJson(path.join(DATA_DIR, 'users.json'), () => [], validUsers, true),
  sessions: loadJson(path.join(DATA_DIR, 'sessions.json'), () => ({}), validSessions, false),
  history: loadJson(path.join(DATA_DIR, 'history.json'), () => [], validHistory, false),
  games: new Map(),
};

// a game file that is damaged or has the wrong shape is set aside in games/_broken/; the rest keeps running
for (const f of fs.readdirSync(GAMES_DIR)) {
  if (!f.endsWith('.json')) continue;
  const file = path.join(GAMES_DIR, f);
  const r = readRaw(file);
  if (r.ok && validGame(r.data)) { db.games.set(r.data.meta.id, r.data); continue; }
  if (r.ok && r.data && isObj(r.data) && !r.data.meta) continue; // not a game file at all: leave it alone
  const moved = quarantine(file, BROKEN_DIR);
  console.error(`WARNING: game file ${f} is damaged (${r.ok ? 'unexpected structure' : r.error && r.error.message}); ${moved ? 'moved to ' + moved : 'could not be moved, ignored'}.`);
}

const saveUsers = () => writeJson(path.join(DATA_DIR, 'users.json'), db.users, { keep: true, sync: true });
const saveSessions = () => debounced('sessions', () => writeJson(path.join(DATA_DIR, 'sessions.json'), db.sessions));
const saveHistory = () => writeJson(path.join(DATA_DIR, 'history.json'), db.history, { keep: true, sync: true });
function saveGame(g, now = false) {
  // (a game that was deleted meanwhile must not be written again: a pending debounced save would bring it back after a restart)
  const write = () => { if (db.games.get(g.meta.id) === g) writeJson(path.join(GAMES_DIR, g.meta.id + '.json'), g); };
  if (now) write(); else debounced('game:' + g.meta.id, write);
}
function deleteGame(id) {
  clearTimeout(timers.get('game:' + id)); timers.delete('game:' + id); // no pending save may bring the file back
  db.games.delete(id);
  try { fs.unlinkSync(path.join(GAMES_DIR, id + '.json')); } catch { /* gone */ }
}
// a game whose data makes the rules crash: take it out of play but keep the file for inspection (games/_broken/)
function quarantineGame(id, why) {
  clearTimeout(timers.get('game:' + id)); timers.delete('game:' + id);
  db.games.delete(id);
  const moved = quarantine(path.join(GAMES_DIR, id + '.json'), BROKEN_DIR);
  console.error(`WARNING: game ${id} is broken (${why}); ${moved ? 'moved to ' + moved : 'removed from play'}.`);
}
function saveEverythingNow() {
  flushAll();
  saveUsers();
  writeJson(path.join(DATA_DIR, 'sessions.json'), db.sessions);
  saveHistory();
  for (const g of db.games.values()) saveGame(g, true);
}

// files written by an older version may be readable by everybody: tighten them once at start
for (const f of ['users.json', 'sessions.json', 'history.json', 'users.json.bak', 'history.json.bak']) { try { fs.chmodSync(path.join(DATA_DIR, f), 0o600); } catch { /* not there yet or not ours */ } }
try { fs.chmodSync(DATA_DIR, 0o700); } catch { /* not ours (a mounted dataset): fine */ }

module.exports = { db, DATA_DIR, saveUsers, saveSessions, saveHistory, saveGame, deleteGame, quarantineGame, saveEverythingNow };
