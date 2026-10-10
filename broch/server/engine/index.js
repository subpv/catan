'use strict';
// One entry point for every game Broch can run, one folder per game. The classic game (modes 'classic' and 'knights', with the
// Seafarers and Traders & Barbarians expansions) is classic/game.js with knights/, seafarers/ and traders-barbarians/ plugged in;
// each standalone game is its own engine behind the same five calls (create, act, view, summary, migrate).
const base = require('./classic/game');

const STANDALONE = {
  energies: require('./energies/energies'),
  humankind: require('./humankind/humankind'),
  inkas: require('./inkas/inkas'),
  explorers: require('./explorers-pirates/explorers'), // Explorers & Pirates: its own engine, shown in the lobby as an expansion
};
const isOwn = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key); // never ask a plain object about a client-supplied key without this: 'constructor' is "in" every object
const SA = mode => (isOwn(STANDALONE, mode) ? STANDALONE[mode] : undefined);
const engineOf = mode => (isOwn(STANDALONE, mode) ? STANDALONE[mode] : base);

// The simplified Explorers & Pirates that once ran inside the classic engine (mode 'classic' or 'knights' with expansion
// 'explorers') is gone. A running game saved with it is restarted, in place, as a fresh game of the full standalone
// Explorers & Pirates with the same players (finished games are only history and stay as they are).
function restartRetiredExplorers(s) {
  const players = s.players.map(pl => ({ id: pl.userId, name: pl.name, color: pl.color, country: pl.country }));
  const fresh = STANDALONE.explorers.createGame({ id: s.id, players, options: { scenario: 2 } });
  fresh.log.push({ turn: fresh.turn, k: 'This game was saved with the retired simplified Explorers & Pirates and starts again as the full Explorers & Pirates.', a: {}, at: Date.now() });
  Object.keys(s).forEach(k => { delete s[k]; });
  return Object.assign(s, fresh);
}

// ---- the one door every player action goes through (WebSocket and computer players alike)
// 1. Hostile shapes are refused before any rule code sees them: the action must be a plain object whose keys and string
//    values are not Object.prototype names ('constructor', '__proto__', ...), because the rules look ids up in plain objects.
//    The fields that name a board piece (hex, h, e, v, ship, idx) must be integers: "5" or [5] would otherwise be stored as is.
// 2. The action is atomic. Rules sometimes change the state before they notice that the move is illegal (or crash on a value
//    nobody foresaw); the state is therefore restored from a snapshot whenever act() throws, so a failed action never leaves
//    a half-applied game behind.
const PROTO_NAMES = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
const INT_FIELDS = ['hex', 'h', 'e', 'v', 'ship', 'idx'];
function badAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.type !== 'string') return true;
  for (const f of INT_FIELDS) if (a[f] != null && !Number.isInteger(a[f])) return true;
  let nodes = 0;
  const bad = (x, depth) => {
    if (typeof x === 'string') return PROTO_NAMES.has(x);
    if (!x || typeof x !== 'object') return false;
    if (depth > 6 || ++nodes > 2000) return true;
    for (const k of Object.keys(x)) if (PROTO_NAMES.has(k) || bad(x[k], depth + 1)) return true;
    return false;
  };
  return bad(a, 0);
}
function act(s, p, a) {
  if (badAction(a)) throw new base.GameError('Bad action.');
  const snap = JSON.stringify(s);
  try {
    return engineOf(s.mode).act(s, p, a);
  } catch (e) {
    if (JSON.stringify(s) !== snap) { // restore in place: other code holds on to this very object
      const old = JSON.parse(snap);
      Object.keys(s).forEach(k => { delete s[k]; });
      Object.assign(s, old);
    }
    throw e;
  }
}
const MODES = ['classic', 'knights', ...Object.keys(STANDALONE)];

module.exports = {
  GameError: base.GameError,
  MODES, STANDALONE: Object.keys(STANDALONE),
  defaultVp: (mode, scenario) => { const sp = SA(mode) && SA(mode)._internal.spec; return sp ? (sp.vpFor && scenario ? sp.vpFor(scenario) : sp.vpTarget) : 10; },
  isStandalone: mode => isOwn(STANDALONE, mode),
  fixedVp: mode => !!(SA(mode) && SA(mode)._internal.fixedVp), // the end of the game is not a points target
  minPlayers: mode => (SA(mode) && (SA(mode)._internal.minPlayers || (SA(mode)._internal.spec && SA(mode)._internal.spec.minPlayers))) || 2,
  maxPlayers: mode => (SA(mode) && SA(mode)._internal.spec && SA(mode)._internal.spec.maxPlayers) || 4,
  createGame: opts => engineOf(opts.mode).createGame(opts),
  act,
  isOwn,
  viewFor: (s, p) => engineOf(s.mode).viewFor(s, p),
  summary: s => engineOf(s.mode).summary(s),
  migrate: s => (!s ? s : s.expansion === 'explorers' && !SA(s.mode) && s.phase !== 'over' ? restartRetiredExplorers(s) : engineOf(s.mode).migrate(s)),
  vp: (s, p) => (SA(s.mode) ? SA(s.mode)._internal.spec.vp(s, p) : base.vp(s, p)),
};
