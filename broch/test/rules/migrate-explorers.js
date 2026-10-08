'use strict';
// Games saved with the retired simplified Explorers & Pirates (classic/knights mode with expansion 'explorers') must not
// crash the server: engine.migrate() restarts them, in place, as a fresh standalone Explorers & Pirates game.
// Run: node test/rules/migrate-explorers.js
const assert = require('assert');
const engine = require('../../server/engine');

const oldState = (mode, phase = 'play') => ({
  id: 'old1', mode, kind: 'sea', expansion: 'explorers', phase, turn: 12, current: 1,
  options: { vpTarget: 12, scenario: 'fog', missions: ['fish', 'spice', 'lairs'] },
  players: [
    { userId: 'u-ann', name: 'Ann', color: 'red', country: 'DE', res: {}, comm: {}, cargo: { fish: 1, spice: 0 }, delivered: { fish: 0, spice: 0 } },
    { userId: 'u-bob', name: 'Bob', color: 'blue', country: null, res: {}, comm: {}, cargo: { fish: 0, spice: 0 }, delivered: { fish: 0, spice: 0 } },
    { userId: 'u-cy', name: 'Cy', color: 'teal', country: 'FR', res: {}, comm: {}, cargo: { fish: 0, spice: 0 }, delivered: { fish: 0, spice: 0 } },
  ],
  missions: ['fish', 'spice', 'lairs'], lairs: [], lairOwners: {},
});

for (const mode of ['classic', 'knights']) {
  const s = oldState(mode);
  const same = s;
  const out = engine.migrate(s);
  assert.strictEqual(out, same, 'migrate works in place');
  assert.strictEqual(out.mode, 'explorers');
  assert.strictEqual(out.id, 'old1');
  assert.strictEqual(out.expansion, 'none');
  assert.strictEqual(out.missions, undefined, 'nothing of the old state is left');
  assert.deepStrictEqual(out.players.map(p => [p.userId, p.name, p.color, p.country]).sort(), [['u-ann', 'Ann', 'red', 'DE'], ['u-bob', 'Bob', 'blue', null], ['u-cy', 'Cy', 'teal', 'FR']]);
  assert.strictEqual(out.phase, 'setup', 'a fresh game');
  assert.ok(out.log.some(e => /retired simplified Explorers/.test(e.k)), 'the restart is logged');
  assert.ok(engine.isStandalone(out.mode));
  out.players.forEach((_, i) => assert.ok(engine.viewFor(out, i).legal));
  assert.ok(engine.summary(out));
  // the migrated game is a normal one: the player to move can act, and a second migrate changes nothing
  const before = JSON.stringify(out);
  engine.migrate(out);
  assert.strictEqual(JSON.stringify(out), before, 'migrating twice is harmless');
}

// a finished game is only history: it stays as it is
const done = oldState('classic', 'over');
assert.strictEqual(engine.migrate(done).mode, 'classic');

// a standalone Explorers & Pirates game is not touched
const real = engine.createGame({ id: 'r1', mode: 'explorers', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], options: { scenario: 2 } });
const snap = JSON.stringify(real);
engine.migrate(real);
assert.strictEqual(JSON.stringify(real), snap);

// and the classic engine no longer knows the old expansion: it just plays the plain game
const plain = engine.createGame({ id: 'p1', mode: 'classic', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], options: { expansion: 'explorers' } });
assert.strictEqual(plain.expansion, 'none');
assert.strictEqual(plain.sea, false);

console.log('ok');
