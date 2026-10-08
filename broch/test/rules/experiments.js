'use strict';
// Experiments (lobby switches beyond the rulebook): build anytime, and the robber statistics.
// Usage: node test/rules/experiments.js
const assert = require('assert');
const engine = require('../../server/engine');
const players = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white'][i] }));
const act = (s, p, a) => engine.act(s, p, a);
const ok = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } };

function started(exp) {
  const s = engine.createGame({ id: 'x', mode: 'classic', players: players(3), options: { expBuildAnytime: exp } });
  let g = 0;
  while (s.phase === 'setup' && g++ < 200) {
    const p = s.current, L = engine.viewFor(s, p).legal || {};
    if (L.setupSpots) act(s, p, { type: 'placeSettlement', v: L.setupSpots[0] });
    else if (L.setupRoads) act(s, p, { type: 'placeRoad', e: L.setupRoads[0] });
    else throw new Error('setup stuck');
  }
  s.dice = null;
  if (s.step === 'roll') act(s, s.current, { type: 'roll', forced: [1, 2] });
  s.pending = []; s.step = 'main';
  return s;
}
const other = s => (s.current + 1) % s.players.length;

ok('off: nobody builds out of turn', () => {
  const s = started(false), q = other(s);
  Object.assign(s.players[q].res, { lumber: 5, brick: 5 });
  assert.strictEqual((engine.viewFor(s, q).legal || {}).roads, undefined);
  assert.throws(() => act(s, q, { type: 'buildRoad', e: 0 }), /not your move/);
});
ok('on: after the dice every player may build', () => {
  const s = started(true), q = other(s);
  Object.assign(s.players[q].res, { lumber: 5, brick: 5 });
  const roads = (engine.viewFor(s, q).legal || {}).roads;
  assert.ok(roads && roads.length, 'legal roads are offered');
  act(s, q, { type: 'buildRoad', e: roads[0] });
  assert.ok(s.roads[roads[0]] !== undefined);
});
ok('on: not before the dice', () => {
  const s = started(true), q = other(s);
  s.step = 'roll';
  Object.assign(s.players[q].res, { lumber: 5, brick: 5 });
  assert.throws(() => act(s, q, { type: 'buildRoad', e: 0 }), /not your move/);
});
ok('robber statistics count the owners of the land', () => {
  const s = started(false);
  const p = s.current;
  const h = s.board.hexes.find(x => x.id !== s.robber && x.verts.some(v => s.buildings[v] && s.buildings[v].p !== p));
  assert.ok(h, 'a tile next to a foreign building');
  s.pending = [{ type: 'moveRobber', player: p }];
  const owners = new Set(h.verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p));
  act(s, p, { type: 'moveRobber', hex: h.id });
  owners.forEach(q => assert.strictEqual(s.stats.robbed[q], 1));
  assert.strictEqual(s.stats.robbed[p], 0);
  assert.strictEqual(engine.summary(s).players.reduce((a, x) => a + x.robbed, 0), owners.size);
});
ok('on: Cities & Knights - knights, walls and improvements out of turn', () => {
  const s = engine.createGame({ id: 'k', mode: 'knights', players: players(3), options: { expBuildAnytime: true } });
  let g = 0;
  while (s.phase === 'setup' && g++ < 300) {
    const p = s.current, L = engine.viewFor(s, p).legal || {};
    if (L.setupSpots) act(s, p, { type: s.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: L.setupSpots[0] });
    else if (L.setupRoads) act(s, p, { type: 'placeRoad', e: L.setupRoads[0] });
    else throw new Error('setup stuck');
  }
  s.pending = []; s.step = 'main';
  const q = other(s);
  Object.assign(s.players[q].res, { wool: 3, grain: 3, ore: 3 });
  const spots = (engine.viewFor(s, q).legal || {}).knightSpots;
  assert.ok(spots && spots.length, 'knight spots offered');
  act(s, q, { type: 'buildKnight', v: spots[0] });
  assert.ok(s.knights[spots[0]] && s.knights[spots[0]].p === q);
  assert.throws(() => act(s, q, { type: 'moveKnight', from: spots[0], to: spots[0] }), /./, 'moving stays a turn action');
});
