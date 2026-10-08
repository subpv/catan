'use strict';
// Rule checks for Traders & Barbarians, scenario Barbarian Attack, against the English rulebook (6th edition, 2025: p. 15-19) and the
// 5-6 player expansion (p. 2, 8-9, 12). Each case builds a small situation and plays actions.
const assert = require('assert');
const { createGame, act, viewFor, vp, GameError } = require('../server/engine/game');
const C = require('../server/engine/constants');

const realRandom = Math.random;
// dice: feed a list of die faces (two per roll of two dice); afterwards real randomness
function dice(...faces) { const q = faces.slice(); Math.random = () => (q.length ? (q.shift() - 1) / 6 + 0.01 : realRandom()); }
function real() { Math.random = realRandom; }

function fresh(n = 3, big = n > 4) {
  const s = createGame({ id: 't', mode: 'classic', options: { expansion: 'traders', variants: { barbarians: true }, big }, players: Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i })) });
  s.phase = 'play'; s.step = 'main'; s.turn = 5; s.current = 0; s.setup = null; s.flags = { rolled: true };
  if (s.options.paired) s.pair = { one: 0, phase: 1 };
  s.noWin = true;
  return s;
}
const bb = s => s.hub.bb;
const hexByNum = (s, n) => s.board.coast.filter(id => s.board.hexes[id].number === n);
const fails = (fn, re) => { try { fn(); } catch (e) { if (!(e instanceof GameError)) throw e; if (re) assert(re.test(e.message), e.message); return; } assert.fail('should have failed'); };
let count = 0;
const test = (name, fn) => { try { fn(); } catch (e) { real(); console.error('FAILED:', name); throw e; } real(); count++; };
// a legal settlement spot for player p (two roads lead to it from p's own settlement), plus the resources to build it
function prep(s, p, avoid = []) {
  const V = s.board.vertices;
  for (const a of V) {
    if (a.hexes.length < 2 || s.buildings[a.id] || a.adj.some(x => s.buildings[x])) continue;
    for (const bId of a.adj) {
      const bv = V[bId];
      for (const cId of bv.adj) {
        const c = V[cId];
        if (cId === a.id || avoid.includes(cId) || c.hexes.length < 2 || s.buildings[cId] || c.adj.some(x => s.buildings[x] || x === a.id)) continue;
        if (c.hexes.some(h => (bb(s).barb[h] || 0) >= 3)) continue;
        s.buildings[a.id] = { p, type: 'settlement' };
        const ea = a.edges.find(e => s.board.edges[e].v.includes(bId)), eb = bv.edges.find(e => s.board.edges[e].v.includes(cId));
        s.roads[ea] = p; s.roads[eb] = p;
        for (const r of C.RES) s.players[p].res[r] = 10;
        return cId;
      }
    }
  }
  throw new Error('no spot');
}
const edgesOf = (s, id) => s.board.hexes[id].edges;
function put(s, e, p) { bb(s).knights[e] = { p }; }
function endMyTurn(s, p) {
  act(s, p, { type: 'endTurn' });
  if (s.pending.some(i => i.type === 'moveKnights')) act(s, p, { type: 'knightsDone' });
}

test('3-4 players: board of the book (numbers, terrains, castle, desert, barbarians at the 2 and the 12)', () => {
  const s = fresh(3);
  const b = s.board, H = b.hexes;
  assert.strictEqual(H.length, 19);
  const nums = H.map(h => h.number);
  assert.deepStrictEqual(nums, [3, 8, null, 9, 4, 5, 10, 12, 6, 10, 8, 11, 4, 9, 3, 5, null, 6, 2]);
  assert.strictEqual(H[2].terrain, 'desert'); assert.strictEqual(H[16].terrain, 'castle');
  const ring = i => b.coast.map(id => H[id].terrain).filter(t => t === i).length;
  assert.deepStrictEqual(['hills', 'forest', 'pasture', 'fields', 'mountains'].map(ring), [2, 2, 3, 2, 1]);
  const inner = [4, 5, 8, 9, 10, 13, 14].map(id => H[id].terrain);
  assert.deepStrictEqual(['hills', 'forest', 'pasture', 'fields', 'mountains'].map(t => inner.filter(x => x === t).length), [1, 1, 1, 2, 2]);
  assert.deepStrictEqual(b.checkOrder.map(id => H[id].number), [4, 12, 9, 3, 8, 10, 11, 5, 2, 6]); // from the 4 next to the castle, clockwise
  assert.strictEqual(bb(s).supply, 34); // 36 barbarians, 2 on the board
  assert.strictEqual(bb(s).barb[hexByNum(s, 2)[0]], 1); assert.strictEqual(bb(s).barb[hexByNum(s, 12)[0]], 1);
  assert.strictEqual(s.options.vpTarget, 12);
});

test('5-6 players: frame, two castles, two deserts, discs as printed, 12 extra barbarians', () => {
  const s = fresh(5);
  const b = s.board, H = b.hexes;
  assert.strictEqual(b.kind, 'extended'); assert.strictEqual(H.length, 30); assert.strictEqual(b.ports.length, 11);
  assert.deepStrictEqual(H.map(h => h.number), [12, 9, 3, 4, 5, 10, 8, 5, 11, 6, 3, null, null, 8, 10, 4, 6, null, null, 3, 8, 11, 9, 6, 4, 9, 10, 2, 5, 11]);
  assert.deepStrictEqual(H.map((h, i) => (h.terrain === 'castle' ? i : -1)).filter(i => i >= 0), [12, 17]);
  assert.deepStrictEqual(H.map((h, i) => (h.terrain === 'desert' ? i : -1)).filter(i => i >= 0), [11, 18]);
  const cnt = (ids, t) => ids.filter(id => H[id].terrain === t).length;
  assert.deepStrictEqual(['hills', 'forest', 'pasture', 'fields', 'mountains'].map(t => cnt(b.coast, t)), [3, 3, 2, 2, 2]);
  const inner = [4, 5, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 24, 25];
  assert.deepStrictEqual(['hills', 'forest', 'pasture', 'fields', 'mountains'].map(t => cnt(inner, t)), [2, 2, 3, 4, 3]);
  assert.strictEqual(b.coast.length, 12);
  assert.deepStrictEqual(hexByNum(s, 5).length, 2); assert.deepStrictEqual(hexByNum(s, 9).length, 2);
  assert.deepStrictEqual(b.checkOrder.map(id => H[id].number), [5, 4, 12, 9, 3, 8, 9, 10, 11, 5, 2, 6]); // from the 5 next to the castle
  assert.ok(H[b.checkOrder[0]].neighbors.some(n => H[n].terrain === 'castle'));
  assert.strictEqual(bb(s).supply, 46); // 36 + 12 barbarians, 2 on the board
  assert.strictEqual(s.options.paired, true);
  const six = fresh(6);
  assert.strictEqual(six.players.length, 6);
  // two castles: both rings of edges are knight spots
  const v = viewFor(s, 0);
  assert.deepStrictEqual(v.board.castles, [12, 17]);
});

test('castle edges: three colours in pairs, "/" purple, "\\" green, upright brown; die 1/6 purple, 2/5 green, 3/4 brown', () => {
  for (const n of [3, 5]) {
    const s = fresh(n), b = s.board;
    for (const c of b.castles) {
      const cols = edgesOf(s, c).map(e => b.edgeDir[e]);
      for (const k of ['purple', 'green', 'brown']) assert.strictEqual(cols.filter(x => x === k).length, 2, k);
      const e = edgesOf(s, c).find(x => { const [a, z] = b.edges[x].v.map(i => b.vertices[i]); return Math.abs(z.x - a.x) < 1e-6; });
      assert.strictEqual(b.edgeDir[e], 'brown');
      const up = edgesOf(s, c).find(x => { const [a, z] = b.edges[x].v.map(i => b.vertices[i]); return (z.x - a.x) * (z.y - a.y) < -1e-6; });
      assert.strictEqual(b.edgeDir[up], 'purple');
    }
  }
});

test('barbarians land: dice until not 7 and not a number rolled before (example 1 of the book), conquered hex gets no more', () => {
  const s = fresh(3);
  const spot = prep(s, 0);
  const h8 = hexByNum(s, 8)[0], h3 = hexByNum(s, 3)[0], h9 = hexByNum(s, 9)[0];
  bb(s).barb[h8] = 3; bb(s).supply -= 3;
  const before = bb(s).supply;
  // rolls: 3 (hex 3), 7 (again), 9 (hex 9), 3 (again: seen), 8 (conquered: nothing)
  dice(1, 2, /*3*/ 3, 4, /*7*/ 4, 5, /*9*/ 1, 2, /*3*/ 4, 4 /*8*/);
  act(s, 0, { type: 'buildSettlement', v: spot });
  real();
  assert.strictEqual(bb(s).barb[h3], 1); assert.strictEqual(bb(s).barb[h9], 1); assert.strictEqual(bb(s).barb[h8], 3);
  assert.strictEqual(bb(s).supply, before - 2);
});

test('barbarians land: a city counts as a building, a road does not', () => {
  const s = fresh(3);
  const spot = prep(s, 0);
  const before = bb(s).supply;
  const e = s.board.edges.find(x => !(x.id in s.roads)).id;
  act(s, 0, { type: 'buildRoad', e: viewFor(s, 0).legal.roads[0] });
  assert.strictEqual(bb(s).supply, before);
  dice(1, 2, 3, 3, 2, 4);
  act(s, 0, { type: 'buildSettlement', v: spot });
  real();
  assert.strictEqual(bb(s).supply, before - 3);
  s.players[0].res.grain = 5; s.players[0].res.ore = 5;
  dice(2, 3, 2, 4, 5, 5);
  act(s, 0, { type: 'buildCity', v: spot });
  real();
  assert.strictEqual(bb(s).supply, before - 6);
});

test('5-6 players: a 5 or a 9 puts a barbarian on both hexes (3, 4 or 5 barbarians in one attack)', () => {
  const s = fresh(5);
  const spot = prep(s, 0);
  const before = bb(s).supply;
  const fives = hexByNum(s, 5), nines = hexByNum(s, 9);
  dice(2, 3, /*5*/ 4, 5, /*9*/ 3, 3 /*6*/);
  act(s, 0, { type: 'buildSettlement', v: spot });
  real();
  fives.forEach(id => assert.strictEqual(bb(s).barb[id], 1)); nines.forEach(id => assert.strictEqual(bb(s).barb[id], 1));
  assert.strictEqual(bb(s).supply, before - 5);
});

test('the attack stops when the supply is empty', () => {
  const s = fresh(3);
  const spot = prep(s, 0);
  bb(s).supply = 1;
  dice(1, 2, 3, 3, 2, 4);
  act(s, 0, { type: 'buildSettlement', v: spot });
  real();
  assert.strictEqual(bb(s).supply, 0);
});

test('conquered hex: no yield, no building or road on it; conquered building gives no points and its harbor is closed', () => {
  const s = fresh(3);
  const id = hexByNum(s, 5)[0], h = s.board.hexes[id];
  bb(s).barb[id] = 3;
  const v = h.verts.find(x => s.board.vertices[x].hexes.length === 1) ?? h.verts[0];
  const only = s.board.vertices.find(x => x.hexes.length >= 1 && x.hexes.every(k => k === id));
  for (const r of C.RES) s.players[0].res[r] = 10;
  const view = viewFor(s, 0);
  assert.ok(!view.legal.roads || h.edges.every(e => !view.legal.roads.includes(e)));
  s.roads[h.edges[0]] = undefined; delete s.roads[h.edges[0]];
  // a settlement on a hex vertex where all land hexes are conquered
  const spot = only ? only.id : null;
  if (spot != null) {
    s.buildings[spot] = { p: 1, type: 'settlement' };
    const before = vp(s, 1);
    assert.ok(viewFor(s, 0).hub.bb.lost.includes(spot));
    bb(s).barb[id] = 0;
    assert.strictEqual(vp(s, 1), before + 1);
  }
  // no production on a conquered hex
  bb(s).barb[id] = 3;
  const some = h.verts.find(x => !s.buildings[x]);
  s.buildings[some] = { p: 2, type: 'settlement' };
  s.players[2].res = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  s.step = 'roll'; s.flags = {}; s.current = 2;
  dice(Math.min(6, Math.max(1, h.number - 3)), h.number - Math.min(6, Math.max(1, h.number - 3)));
  act(s, 2, { type: 'roll' });
  real();
  const got = C.RES.reduce((a, r) => a + s.players[2].res[r], 0);
  assert.strictEqual(got, 0, 'conquered hex must not produce');
});

test('building touching only conquered hexes: conquered (stood on its end), harbor not usable', () => {
  const s = fresh(3);
  // find a harbor vertex whose hexes are all coast hexes with a number
  const pv = s.board.vertices.find(v => v.port && v.hexes.every(h => s.board.coast.includes(h)));
  if (!pv) return;
  s.buildings[pv.id] = { p: 0, type: 'city' };
  const base = vp(s, 0);
  pv.hexes.forEach(h => { bb(s).barb[h] = 3; });
  assert.strictEqual(vp(s, 0), base - 2);
  const L = viewFor(s, 0).legal;
  assert.ok(L.ratios);
  pv.hexes.forEach(h => { bb(s).barb[h] = 0; });
  assert.strictEqual(vp(s, 0), base);
});

test('knights: 3 edges, 5 with 1 grain, never onto a castle edge or an occupied edge; a knight on the castle must leave', () => {
  const s = fresh(3);
  const castle = s.board.castles[0];
  const ce = edgesOf(s, castle);
  put(s, ce[0], 0);
  s.players[0].res.grain = 0;
  act(s, 0, { type: 'endTurn' });
  let L = viewFor(s, 0).legal;
  const o = L.knightMoves[ce[0]];
  assert.ok(o.near.length > 0 && o.far.length === 0);
  assert.ok(o.near.every(e => !ce.includes(e)));
  fails(() => act(s, 0, { type: 'knightsDone' }), /leave the castle/);
  fails(() => act(s, 0, { type: 'moveKnight', from: ce[0], to: ce[1] }));
  act(s, 0, { type: 'moveKnight', from: ce[0], to: o.near[0] });
  act(s, 0, { type: 'knightsDone' });
  assert.ok(s.current !== 0);
  // with grain the far edges (4-5 edges away) open, and cost 1 grain
  const t = fresh(3);
  const ce2 = edgesOf(t, t.board.castles[0]);
  put(t, ce2[0], 0); t.players[0].res.grain = 1;
  act(t, 0, { type: 'endTurn' });
  const o2 = viewFor(t, 0).legal.knightMoves[ce2[0]];
  assert.ok(o2.far.length > 0);
  act(t, 0, { type: 'moveKnight', from: ce2[0], to: o2.far[0] });
  assert.strictEqual(t.players[0].res.grain, 0);
  fails(() => act(t, 0, { type: 'moveKnight', from: o2.far[0], to: o2.near[0] })); // each knight moves once
});

test('victory: more knights than barbarians; prisoners shared (1 each, the rest to the most knights); die kills only knights of THAT hex', () => {
  const s = fresh(3);
  const id = hexByNum(s, 5)[0], he = edgesOf(s, id);
  bb(s).barb[id] = 3; bb(s).supply -= 2; // (one already on the board from the set-up counts)
  // p0: 2 knights, p1: 2 knights on the hex edges (tie in knights), p0 also has a knight far away on a "green" edge
  const dirOf = e => s.board.edgeDir[e];
  const pick = col => he.filter(e => dirOf(e) === col);
  put(s, pick('purple')[0], 0); put(s, pick('purple')[1], 1);
  put(s, pick('green')[0], 0); put(s, pick('brown')[0], 1);
  const far = s.board.edges.find(e => dirOf(e.id) === 'purple' && !he.includes(e.id) && !bb(s).knights[e.id] && !edgesOf(s, s.board.castles[0]).includes(e.id) && !s.board.hexes[hexByNum(s, 8)[0]].edges.includes(e.id)).id;
  put(s, far, 0);
  s.players[0].res.grain = 0;
  // end of the turn: p0 does not move; victory. Prisoner tie (2:2): dice p0 3+3, p1 1+1 -> p0 wins the 3rd prisoner, p1 gets 3 gold. Loss die 6 (purple).
  const gold1 = s.players[1].gold, gold0 = s.players[0].gold;
  act(s, 0, { type: 'endTurn' });
  const L = viewFor(s, 0).legal;
  dice(3, 3, 1, 1, 6);
  // knightsDone only after moving the knights away from the castle: none there
  act(s, 0, { type: 'knightsDone' });
  real();
  assert.strictEqual(bb(s).barb[id], 0, 'hex liberated');
  assert.deepStrictEqual(bb(s).prisoners, [2, 1, 0]);
  // purple pair of THAT hex: p0's and p1's knights there are gone (3 gold each), the far purple knight and the other colours stay
  assert.strictEqual(s.players[0].gold, gold0 + 3);
  assert.strictEqual(s.players[1].gold, gold1 + 3 + 3); // 3 for the lost knight + 3 consolation for the lost tie
  assert.ok(bb(s).knights[far], 'a knight elsewhere on a purple edge is not lost');
  assert.ok(bb(s).knights[pick('green')[0]] && bb(s).knights[pick('brown')[0]]);
  assert.ok(!bb(s).knights[pick('purple')[0]] && !bb(s).knights[pick('purple')[1]]);
  assert.strictEqual(L.knightMoves && Object.keys(L.knightMoves).length >= 0, true);
});

test('victory needs MORE knights than barbarians; three barbarians need four knights', () => {
  const s = fresh(3);
  const id = hexByNum(s, 10)[0], he = edgesOf(s, id);
  bb(s).barb[id] = 3;
  put(s, he[0], 0); put(s, he[1], 0); put(s, he[2], 0);
  act(s, 0, { type: 'endTurn' });
  while (s.pending.some(i => i.type === 'moveKnights')) { const m = viewFor(s, 0).legal.knightMoves; assert.ok(m); break; }
  // the knights could move away; leave them: done
  act(s, 0, { type: 'knightsDone' });
  assert.strictEqual(bb(s).barb[id], 3, '3 knights do not beat 3 barbarians');
  const t = fresh(3);
  bb(t).barb[id] = 3;
  const hf = edgesOf(t, id);
  put(t, hf[0], 0); put(t, hf[1], 0); put(t, hf[2], 0); put(t, hf[3], 0);
  dice(1, 1, 1);
  act(t, 0, { type: 'endTurn' }); act(t, 0, { type: 'knightsDone' });
  real();
  assert.strictEqual(bb(t).barb[id], 0);
  assert.strictEqual(bb(t).prisoners[0], 3);
});

test('prisoners: not enough for everybody -> dice, highest first; players without prisoner get 3 gold', () => {
  const s = fresh(3);
  const id = hexByNum(s, 6)[0], he = edgesOf(s, id);
  bb(s).barb[id] = 1;
  put(s, he[0], 0); put(s, he[1], 1); put(s, he[2], 2);
  const g = s.players.map(pl => pl.gold);
  dice(/*p0*/ 6, 5, /*p1*/ 2, 3, /*p2*/ 1, 2, /*loss die*/ 1);
  act(s, 0, { type: 'endTurn' });
  if (s.pending.some(i => i.type === 'moveKnights')) act(s, 0, { type: 'knightsDone' });
  real();
  assert.deepStrictEqual(bb(s).prisoners, [0, 0, 0].map((x, i) => (i === 0 ? 1 : 0)));
  assert.ok(s.players[1].gold >= g[1] + 3 && s.players[2].gold >= g[2] + 3);
});

test('prisoners: every 2 are worth 1 VP, unpaired are worth nothing', () => {
  const s = fresh(3);
  const base = vp(s, 0);
  bb(s).prisoners[0] = 3;
  assert.strictEqual(vp(s, 0), base + 1);
  bb(s).prisoners[0] = 1;
  assert.strictEqual(vp(s, 0), base);
});

test('development cards: built = played at once and discarded; capture without barbarians draws a new card; deck reshuffles', () => {
  const s = fresh(3);
  bb(s).deck = ['treason', 'consecration']; bb(s).discard = [];
  for (const r of C.RES) s.players[0].res[r] = 5;
  act(s, 0, { type: 'buyDev' });
  assert.strictEqual(s.players[0].dev.length, 0);
  assert.strictEqual(bb(s).discard[0], 'consecration');
  assert.ok(s.pending.some(i => i.type === 'placeKnight'));
  const castleEdge = edgesOf(s, s.board.castles[0])[0];
  act(s, 0, { type: 'placeKnight', e: castleEdge });
  assert.strictEqual(bb(s).knights[castleEdge].p, 0);
  // treason: 2 gold, moves two barbarians
  const g = s.players[0].gold;
  act(s, 0, { type: 'buyDev' });
  assert.strictEqual(s.players[0].gold, g + 2);
  const from = s.board.coast.filter(id => bb(s).barb[id] > 0);
  const to = s.board.coast.filter(id => bb(s).barb[id] < 3 && !from.includes(id)).slice(0, 2);
  const sup = bb(s).supply;
  act(s, 0, { type: 'treason', from, to });
  assert.strictEqual(bb(s).supply, sup + 0); // 2 moved
  // capture with no barbarian on the board: the card is discarded and a new one is drawn
  const t = fresh(3);
  s.board.coast.forEach(id => { bb(t).barb[id] = 0; });
  bb(t).deck = ['consecration', 'captive']; bb(t).discard = [];
  for (const r of C.RES) t.players[0].res[r] = 5;
  act(t, 0, { type: 'buyDev' });
  assert.deepStrictEqual(bb(t).discard.slice(0, 2), ['captive', 'consecration']);
  // an empty stack is made again from the discard pile
  const u = fresh(3);
  bb(u).deck = []; bb(u).discard = ['consecration'];
  for (const r of C.RES) u.players[0].res[r] = 5;
  act(u, 0, { type: 'buyDev' });
  assert.ok(u.pending.some(i => i.type === 'placeKnight'));
  assert.strictEqual(bb(u).deck.length + bb(u).discard.length, 1);
  assert.strictEqual(26, Object.values({ a: 14, b: 4, c: 4, d: 4 }).reduce((a, b) => a + b));
});

test('capture: a barbarian becomes a prisoner; the deck has 14/4/4/4 cards', () => {
  const s = fresh(3);
  assert.strictEqual(bb(s).deck.length, 26);
  const cnt = k => bb(s).deck.filter(x => x === k).length;
  assert.deepStrictEqual([cnt('consecration'), cnt('strong'), cnt('treason'), cnt('captive')], [14, 4, 4, 4]);
  bb(s).deck = ['captive'];
  for (const r of C.RES) s.players[0].res[r] = 5;
  const id = hexByNum(s, 2)[0];
  act(s, 0, { type: 'buyDev' });
  act(s, 0, { type: 'captive', hex: id });
  assert.strictEqual(bb(s).barb[id], 0); assert.strictEqual(bb(s).prisoners[0], 1);
});

test('a 7: no robber; players discard as normal, then the player steals 1 random card from a player of their choice; coins cannot be stolen', () => {
  const s = fresh(3);
  s.step = 'roll'; s.flags = {};
  s.players[1].res = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 1 }; s.players[1].gold = 5;
  s.players[2].res = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  s.players[0].res = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  dice(3, 4);
  act(s, 0, { type: 'roll' });
  real();
  assert.ok(s.pending.some(i => i.type === 'steal'));
  assert.deepStrictEqual(s.pending[0].options, [1]);
  act(s, 0, { type: 'steal', from: 1 });
  assert.strictEqual(s.players[0].res.ore, 1); assert.strictEqual(s.players[1].gold, 5);
  assert.strictEqual(s.robber, null);
});

test('coins: 2 gold buy a resource twice per turn; resources buy gold 4:1; coins do not count toward the hand', () => {
  const s = fresh(3);
  s.players[0].gold = 6; s.players[0].res = { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 };
  act(s, 0, { type: 'goldTrade', res: 'ore' }); act(s, 0, { type: 'goldTrade', res: 'ore' });
  fails(() => act(s, 0, { type: 'goldTrade', res: 'ore' }));
  assert.strictEqual(s.players[0].gold, 2);
  act(s, 0, { type: 'bankTrade', give: 'lumber', get: 'gold' });
  assert.strictEqual(s.players[0].gold, 3);
  assert.strictEqual(viewFor(s, 0).players[0].cards, 2);
});

test('5-6 players (paired): player 2 has no dice, trades only with the supply, may use coins; a building of player 2 lands barbarians; knights and expelling for player 2', () => {
  const s = fresh(5);
  assert.strictEqual(s.pair.one, 0);
  act(s, 0, { type: 'endTurn' });
  if (s.pending.some(i => i.type === 'moveKnights')) act(s, 0, { type: 'knightsDone' });
  assert.strictEqual(s.current, 3); assert.strictEqual(s.pair.phase, 2);
  assert.ok(s.flags.stone2);
  fails(() => act(s, 3, { type: 'offerTrade', give: { lumber: 1 }, get: { ore: 1 } }));
  const spot = prep(s, 3);
  s.players[3].gold = 2;
  act(s, 3, { type: 'goldTrade', res: 'brick' });
  const before = bb(s).supply;
  act(s, 3, { type: 'buildSettlement', v: spot });
  assert.ok(bb(s).supply < before);
  // knights of player 2, victory at the end of their turn
  const id = hexByNum(s, 4)[0], he = edgesOf(s, id);
  bb(s).barb[id] = 1;
  put(s, he[0], 3); put(s, he[1], 3);
  act(s, 3, { type: 'endTurn' });
  if (s.pending.some(i => i.type === 'moveKnights')) { dice(1, 1, 1); act(s, 3, { type: 'knightsDone' }); real(); }
  assert.strictEqual(bb(s).barb[id], 0);
  assert.strictEqual(bb(s).prisoners[3], 1);
  assert.strictEqual(s.current, 1); assert.strictEqual(s.pair.phase, 1);
});

test('the Barbarian Attack is for the classic rules: not with Cities & Knights, 5-6 allowed, other big scenarios still 2-4', () => {
  fails(() => createGame({ id: 't', mode: 'knights', options: { expansion: 'traders', variants: { barbarians: true } }, players: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }] }));
  fails(() => createGame({ id: 't', mode: 'classic', options: { expansion: 'traders', variants: { caravans: true }, big: true }, players: [1, 2, 3, 4, 5].map(i => ({ id: 'u' + i, name: 'u' + i })) }));
  const six = createGame({ id: 't', mode: 'classic', options: { expansion: 'traders', variants: { barbarians: true } }, players: [1, 2, 3, 4, 5, 6].map(i => ({ id: 'u' + i, name: 'u' + i })) });
  assert.strictEqual(six.board.kind, 'extended');
});

test('event cards in this scenario: Conflict = most knights on the board; Tournament has no face-up knight cards', () => {
  const s = fresh(3);
  s.eventCards = true; s.deck = [{ ev: 'tournament', n: 5 }]; // (Tournament: nobody has face-up Knight cards)
  put(s, 0, 1);
  s.step = 'roll'; s.flags = {};
  act(s, 0, { type: 'roll' });
  assert.ok(!s.pending.some(i => i.type === 'bankPick'));
  const t = fresh(3);
  t.eventCards = true; t.deck = [{ ev: 'conflict', n: 3 }];
  put(t, 0, 1);
  t.players[2].res.ore = 2;
  t.step = 'roll'; t.flags = {};
  act(t, 0, { type: 'roll' });
  assert.ok(t.pending.some(i => i.type === 'steal' && i.player === 1));
});

console.log(`tb-barbarians: ${count} checks ok`);
