'use strict';
// One entry point for every game Broch can run. The classic game, Cities & Knights and their expansions live in
// game.js; each standalone game is its own engine behind the same five calls (create, act, view, summary, migrate).
const base = require('./game');

const STANDALONE = {
  energies: require('./energies'),
  humankind: require('./humankind'),
  inkas: require('./inkas'),
  explorers: require('./explorers'), // Explorers & Pirates: its own engine, shown in the lobby as an expansion
};
const engineOf = mode => STANDALONE[mode] || base;
const MODES = ['classic', 'knights', ...Object.keys(STANDALONE)];

module.exports = {
  GameError: base.GameError,
  MODES, STANDALONE: Object.keys(STANDALONE),
  defaultVp: (mode, scenario) => { const sp = STANDALONE[mode] && STANDALONE[mode]._internal.spec; return sp ? (sp.vpFor && scenario ? sp.vpFor(scenario) : sp.vpTarget) : 10; },
  maxPlayers: mode => (STANDALONE[mode] && STANDALONE[mode]._internal.spec.maxPlayers) || 4,
  isStandalone: mode => !!STANDALONE[mode],
  fixedVp: mode => !!(STANDALONE[mode] && STANDALONE[mode]._internal.fixedVp), // the end of the game is not a points target
  minPlayers: mode => (STANDALONE[mode] && (STANDALONE[mode]._internal.minPlayers || (STANDALONE[mode]._internal.spec && STANDALONE[mode]._internal.spec.minPlayers))) || 2,
  maxPlayers: mode => (STANDALONE[mode] && STANDALONE[mode]._internal.spec && STANDALONE[mode]._internal.spec.maxPlayers) || 4,
  createGame: opts => engineOf(opts.mode).createGame(opts),
  act: (s, p, a) => engineOf(s.mode).act(s, p, a),
  viewFor: (s, p) => engineOf(s.mode).viewFor(s, p),
  summary: s => engineOf(s.mode).summary(s),
  migrate: s => (s ? engineOf(s.mode).migrate(s) : s),
  vp: (s, p) => (STANDALONE[s.mode] ? STANDALONE[s.mode]._internal.spec.vp(s, p) : base.vp(s, p)),
};
