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
const engineOf = mode => STANDALONE[mode] || base;

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
const MODES = ['classic', 'knights', ...Object.keys(STANDALONE)];

module.exports = {
  GameError: base.GameError,
  MODES, STANDALONE: Object.keys(STANDALONE),
  defaultVp: (mode, scenario) => { const sp = STANDALONE[mode] && STANDALONE[mode]._internal.spec; return sp ? (sp.vpFor && scenario ? sp.vpFor(scenario) : sp.vpTarget) : 10; },
  isStandalone: mode => !!STANDALONE[mode],
  fixedVp: mode => !!(STANDALONE[mode] && STANDALONE[mode]._internal.fixedVp), // the end of the game is not a points target
  minPlayers: mode => (STANDALONE[mode] && (STANDALONE[mode]._internal.minPlayers || (STANDALONE[mode]._internal.spec && STANDALONE[mode]._internal.spec.minPlayers))) || 2,
  maxPlayers: mode => (STANDALONE[mode] && STANDALONE[mode]._internal.spec && STANDALONE[mode]._internal.spec.maxPlayers) || 4,
  createGame: opts => engineOf(opts.mode).createGame(opts),
  act: (s, p, a) => engineOf(s.mode).act(s, p, a),
  viewFor: (s, p) => engineOf(s.mode).viewFor(s, p),
  summary: s => engineOf(s.mode).summary(s),
  migrate: s => (!s ? s : s.expansion === 'explorers' && !STANDALONE[s.mode] && s.phase !== 'over' ? restartRetiredExplorers(s) : engineOf(s.mode).migrate(s)),
  vp: (s, p) => (STANDALONE[s.mode] ? STANDALONE[s.mode]._internal.spec.vp(s, p) : base.vp(s, p)),
};
