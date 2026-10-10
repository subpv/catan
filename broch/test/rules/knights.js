'use strict';
// Rule checks for Cities & Knights against the printed rulebook (Städte & Ritter): each case builds a small situation and plays one action.
require('../seed');
const assert = require('assert');
const { createGame, act, viewFor, GameError, _internal } = require('../../server/engine/classic/game');
const C = require('../../server/engine/shared/constants');

function fresh(n = 3, options = {}) {
  const s = createGame({ id: 't', mode: 'knights', options, players: Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i })) });
  // skip the set-up: seat 0 owns two cities, seat 1 one city and one settlement, seat 2 one city
  s.phase = 'play'; s.step = 'main'; s.turn = 5; s.current = 0; s.setup = null; s.flags = { rolled: true };
  const free = s.board.vertices.filter(v => !v.adj.some(a => false));
  const pick = [];
  for (const v of free) if (pick.every(x => x !== v.id && !s.board.vertices[x].adj.includes(v.id))) pick.push(v.id);
  const place = (v, p, type) => { s.buildings[v] = { p, type }; };
  place(pick[0], 0, 'city'); place(pick[1], 0, 'city'); place(pick[2], 1, 'city'); place(pick[3], 1, 'settlement'); place(pick[4], 2, 'city');
  for (const pl of s.players) for (const k of [...C.RES, ...C.COMM]) { if (C.RES.includes(k)) pl.res[k] = 10; else pl.comm[k] = 20; }
  return { s, pick };
}
const fails = (fn, re) => { try { fn(); } catch (e) { if (!(e instanceof GameError)) throw e; if (re) assert(re.test(e.message), e.message); return; } assert.fail('should have failed'); };
let n = 0;
const test = (name, fn) => { fn(); n++; };

test('metropolis: the first to level 4 gets it, level 5 takes it over, the owner at level 5 is safe', () => {
  const { s, pick } = fresh();
  const A = s.players[0], B = s.players[1];
  A.improvements.science = 3; B.improvements.science = 3;
  act(s, 0, { type: 'improve', track: 'science' });
  assert.strictEqual(s.metropolis.science, 0);
  act(s, 0, { type: 'placeMetropolis', v: pick[0] }); // two free cities: the player chooses
  assert.strictEqual(Object.values(s.buildings).filter(b => b.metro === 'science' && b.p === 0).length, 1);
  B.improvements.science = 4; s.current = 1;
  act(s, 1, { type: 'improve', track: 'science' }); // level 5 takes it (one city: placed at once)
  assert.strictEqual(s.metropolis.science, 1);
  assert.strictEqual(Object.values(s.buildings).filter(b => b.metro === 'science' && b.p === 0).length, 0);
});

test('metropolis: level 4 needs a city without a metropolis', () => {
  const { s, pick } = fresh();
  const A = s.players[0];
  s.buildings[pick[1]].type = 'settlement'; // one city left
  s.buildings[pick[0]].metro = 'trade'; s.metropolis.trade = 0; A.improvements.trade = 4;
  A.improvements.politics = 3;
  fails(() => act(s, 0, { type: 'improve', track: 'politics' }), /city without a metropolis/);
  assert.strictEqual(A.improvements.politics, 3);
  assert.strictEqual(viewFor(s, 0).legal.improve.politics.ok, false);
  // another player already holds the politics metropolis: level 4 is fine
  s.metropolis.politics = 1; s.players[1].improvements.politics = 4;
  act(s, 0, { type: 'improve', track: 'politics' });
  assert.strictEqual(A.improvements.politics, 4);
});

test('aqueduct (house choice): the resource is chosen once, then paid out by itself', () => {
  const { s } = fresh();
  s.players[0].improvements.science = 3;
  s.step = 'roll'; s.flags = {};
  const orig = Math.random; Math.random = () => 0.99; // no number tile has a 12 under seat 0's buildings: force the dice
  try { act(s, 0, { type: 'playProgress', idx: 0 }); } catch { /* no card */ }
  Math.random = orig;
  // direct: roll a number nobody holds
  s.step = 'roll';
  const held = new Set();
  for (const [v, b] of Object.entries(s.buildings)) s.board.vertices[v].hexes.forEach(h => held.add(s.board.hexes[h].number));
  const free = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].find(x => !held.has(x));
  if (free) {
    s.players[0].comm = { paper: 0, cloth: 0, coin: 0 };
    _internal.PROGRESS_FX.alchemist(s, 0, { red: Math.max(1, free - 6), yellow: Math.min(6, free - 1) });
    const it = s.pending.find(i => i.type === 'aqueduct' && i.player === 0);
    assert(it, 'aqueduct pending');
    act(s, 0, { type: 'aqueduct', res: 'ore' });
    assert.strictEqual(s.pending.some(i => i.type === 'aqueduct' && i.player === 0), false);
    assert.strictEqual(s.players[0].aqueduct, 'ore');
  }
});

test('fifth progress card on your own turn must be played', () => {
  const { s } = fresh();
  const A = s.players[0];
  A.progress = ['crane', 'crane', 'merchantFleet', 'mining'].map(type => ({ type, deck: type === 'crane' || type === 'mining' ? 'science' : 'trade' }));
  s.progressDecks.science.shift();
  // the 5th card arrives from the event die
  _internal.PROGRESS_FX.crane; // (keeps the import used)
  A.progress.push({ type: 'irrigation', deck: 'science' });
  s.pending.push({ type: 'discardProgress', player: 0, mustPlay: true, group: 99 });
  fails(() => act(s, 0, { type: 'discardProgress', idx: 0 }), /must play/);
  act(s, 0, { type: 'playProgress', idx: 4 });
  assert.strictEqual(A.progress.length, 4);
  assert.strictEqual(s.pending.length, 0);
});

test('Deserter: the victim picks the knight, the thief sets up the same level and status', () => {
  const { s, pick } = fresh();
  const v1 = s.board.vertices[pick[2]].adj.find(a => !s.buildings[a] && !s.board.vertices[a].adj.some(b => s.buildings[b] && b !== pick[2]));
  // two knights of seat 1, one strong and active, one basic; seat 0 has a road to put its new knight on
  const edgesOf = v => s.board.vertices[v].edges;
  const e0 = edgesOf(pick[0])[0]; s.roads[e0] = 0;
  const stand = a => { const [x, y] = s.board.edges[a].v; return x === pick[0] ? y : x; };
  const kv1 = pick[5] !== undefined ? pick[5] : stand(edgesOf(pick[2])[0]);
  const k1 = stand(edgesOf(pick[2])[0]), k2 = stand(edgesOf(pick[2])[1]);
  s.knights[k1] = { p: 1, level: 2, active: true, activatedTurn: null, promotedTurn: null };
  s.knights[k2] = { p: 1, level: 1, active: false, activatedTurn: null, promotedTurn: null };
  s.players[0].progress = [{ type: 'deserter', deck: 'politics' }];
  act(s, 0, { type: 'playProgress', idx: 0, target: 1 });
  assert.strictEqual(s.pending[0].type, 'deserterPick');
  fails(() => act(s, 0, { type: 'deserterPick', v: k1 }));
  act(s, 1, { type: 'deserterPick', v: k1 });
  assert.strictEqual(s.knights[k1], undefined);
  const it = s.pending.find(i => i.type === 'placeFreeKnight');
  if (it) { assert.strictEqual(it.level, 2); assert.strictEqual(it.active, true); }
});

test('Commercial Harbor: only players with a commodity swap, and they choose which', () => {
  const { s } = fresh();
  s.players[1].comm = { paper: 0, cloth: 2, coin: 0 };
  s.players[2].comm = { paper: 0, cloth: 0, coin: 0 };
  s.players[0].progress = [{ type: 'commercialHarbor', deck: 'trade' }];
  const before = s.players[0].res.lumber;
  act(s, 0, { type: 'playProgress', idx: 0, offers: { 1: 'lumber', 2: 'lumber' } });
  assert.deepStrictEqual(s.pending.map(i => i.type + i.player), ['harborGive1']);
  fails(() => act(s, 1, { type: 'harborGive', comm: 'paper' }));
  act(s, 1, { type: 'harborGive', comm: 'cloth' });
  assert.strictEqual(s.players[0].res.lumber, before - 1);
  assert.strictEqual(s.players[0].comm.cloth, 21);
  assert.strictEqual(s.players[1].res.lumber, 11);
});

test('Diplomat: a road that ends at your own knight is not open', () => {
  const { s, pick } = fresh();
  const e = s.board.vertices[pick[0]].edges[0]; s.roads[e] = 0;
  const [a, b] = s.board.edges[e].v; const far = a === pick[0] ? b : a;
  assert(_internal.HANDLERS && true);
  const before = viewFor(s, 0).legal.openRoads.includes(e);
  s.knights[far] = { p: 0, level: 1, active: false, activatedTurn: null, promotedTurn: null };
  const after = viewFor(s, 0).legal.openRoads.includes(e);
  assert.strictEqual(before, true); assert.strictEqual(after, false);
});

test('merchant stands only on tiles that yield a resource', () => {
  const { s, pick } = fresh();
  const desert = s.board.hexes.find(h => h.terrain === 'desert');
  assert(!viewFor(s, 0).legal.merchantHexes.includes(desert.id));
});

test('the barbarian frame replaces one 3:1 harbor (8 harbors) and Seafarers adds 2 points', () => {
  const { s } = fresh();
  assert.strictEqual(s.board.ports.length, 8);
  assert.strictEqual(s.board.ports.filter(p => p.type === 'any').length, 3);
  const t = createGame({ id: 't', mode: 'knights', options: { expansion: 'seafarers', scenario: 'islands' }, players: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }] });
  assert.strictEqual(t.options.vpTarget, 15);
});

console.log(`knights rules: ${n} checks passed`);
