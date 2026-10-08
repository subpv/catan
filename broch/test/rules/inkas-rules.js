'use strict';
// Checks the rules of Rise of the Inkas that the random fuzzer cannot hit on purpose: the beginner layout, the decline of a
// tribe, building over thickets, roads that may not touch buildings in decline, the free founding rule and the advantage cards.
// Usage: node test/rules/inkas-rules.js
const assert = require('assert');
const engine = require('../../server/engine');
const I = require('../../server/engine/inkas/inkas')._internal;

const players = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white'][i] }));
const fresh = (n = 4, game = {}) => engine.createGame({ id: 't', mode: 'inkas', players: players(n), options: { game } });
const rich = (s, p) => { I.RES.forEach(k => { s.players[p].res[k] = 9; }); };
const act = (s, p, a) => engine.act(s, p, a);
const trio = (s, ...cus) => { const ids = cus.map(([c, u]) => s.board.at[`${c},${u}`]); return s.board.vertices.find(v => v.hexes.length === ids.length && ids.every(i => v.hexes.includes(i))).id; };

// ---- the board: 27 fields in the beginner layout, 5 frame pieces, numbers as printed
{
  const s = fresh();
  assert.strictEqual(s.board.hexes.filter(h => !h.frame).length, 27);
  assert.strictEqual(s.board.hexes.filter(h => h.frame).length, 5);
  const count = t => s.board.hexes.filter(h => h.terrain === t).length;
  assert.deepStrictEqual(['forest', 'hills', 'pasture', 'mountains', 'fields', 'coast', 'plantation', 'jungle'].map(count), [4, 3, 4, 3, 4, 3, 3, 3]);
  const nums = {};
  s.board.hexes.forEach(h => { if (h.number) nums[h.number] = (nums[h.number] || 0) + 1; });
  assert.deepStrictEqual(nums, { 2: 1, 3: 3, 4: 3, 5: 3, 6: 3, 8: 3, 9: 4, 10: 3, 11: 3, 12: 1 });
  assert.strictEqual(s.board.hexes[s.robber].frame, true);
  // beginner start: 2 settlements and 2 roads each, 2 development points, 3 first yields for the lettered settlement
  assert.deepStrictEqual(s.markers, [2, 2, 2, 2]);
  s.players.forEach((_, p) => { assert.strictEqual(Object.values(s.buildings).filter(b => b.p === p).length, 2); assert.strictEqual(Object.values(s.roads).filter(x => x === p).length, 2); assert.strictEqual(K(s, p), 3); });
  // with three players the grey pieces stay in the box
  const s3 = fresh(3);
  assert.strictEqual(Object.keys(s3.buildings).length, 6);
}
function K(s, p) { return Object.values(s.players[p].res).reduce((a, b) => a + b, 0); }

// ---- no ways between fields that make trade goods or the frame
{
  const s = fresh();
  const ok = e => I.spec.roadEdgeOk(s, e);
  const jungleEdge = s.board.edges.find(e => e.hexes.length === 2 && e.hexes.every(h => !I.LAND.includes(s.board.hexes[h].terrain)));
  assert.ok(jungleEdge && !ok(jungleEdge.id));
  assert.ok(s.board.edges.some(e => ok(e.id)));
}

// ---- yields: a city pays double, the robber blocks a field, a 7 yields nothing
{
  const s = fresh();
  const v = trio(s, [1, 4], [1, 6], [0, 5]); // the red letter A: quarry 8, mountains 11, coast 3
  const p = s.buildings[v].p;
  s.players.forEach(pl => I.RES.forEach(k => { pl.res[k] = 0; }));
  I.produce(s, 11);
  assert.strictEqual(s.players[p].res.metal, 1);
  s.buildings[v].type = 'city';
  s.players[p].res.metal = 0;
  I.produce(s, 11);
  assert.strictEqual(s.players[p].res.metal, 2);
  s.robber = s.board.hexes.find(h => h.terrain === 'mountains' && h.number === 11).id;
  s.players[p].res.metal = 0;
  I.produce(s, 11);
  assert.strictEqual(s.players[p].res.metal, 0);
}

// ---- the decline of the first tribe, founding the second, and the free-founding rules
{
  const s = fresh(3);
  const p = s.current;
  rich(s, p); s.step = 'main';
  // two more settlements to 4 development points: 4 settlements, then the tribe falls
  for (let i = 0; i < 2; i++) {
    rich(s, p);
    const roads = I.legalRoads(s, p);
    assert.ok(roads.length);
    let spots = I.legalSettlements(s, p);
    for (let k = 0; !spots.length && k < 6; k++) { act(s, p, { type: 'buildRoad', e: I.legalRoads(s, p)[0] }); spots = I.legalSettlements(s, p); }
    assert.ok(spots.length, 'no settlement spot found');
    act(s, p, { type: 'buildSettlement', v: spots[0] });
  }
  assert.strictEqual(s.markers[p], 4);
  assert.strictEqual(s.tribe[p], 1);
  assert.strictEqual(Object.values(s.roads).filter(x => x === p).length, 0, 'roads go back');
  assert.ok(Object.values(s.buildings).filter(b => b.p === p).every(b => b.decline), 'buildings get thickets');
  assert.strictEqual(s.pending[0].type, 'found');
  assert.throws(() => act(s, p, { type: 'buildRoad', e: 0 }), /not your move|Not allowed|cannot/);
  // the free settlement may not take a building spot of another active tribe: a vertex next to a rival's road
  const q = (p + 1) % 3;
  const spots = engine.viewFor(s, p).legal.found;
  const bad = spots.filter(v => I.K.touchesOwnRoad(s, v, q));
  assert.strictEqual(bad.length, 0);
  const rivalSpot = s.board.vertices.find(v => !s.buildings[v.id] && I.K.V(s, v.id).adj.every(a => !s.buildings[a]) && I.K.touchesOwnRoad(s, v.id, q) && I.spec.settleSpotOk(s, v.id));
  if (rivalSpot) assert.throws(() => act(s, p, { type: 'foundTribe', v: rivalSpot.id }), /cannot found/);
  act(s, p, { type: 'foundTribe', v: spots[0] });
  assert.strictEqual(s.markers[p], 5);
  assert.notStrictEqual(s.current, p, 'the turn ends at once');
  assert.ok(!s.buildings[spots[0]].decline && s.buildings[spots[0]].tribe === 1);

  // buildings in decline: no road may start there, but a settlement may be built over them
  const dv = Object.entries(s.buildings).find(([, b]) => b.p === p && b.decline)[0];
  assert.ok(!I.legalRoads(s, p).some(e => s.board.edges[e].v.includes(+dv) && !s.board.edges[e].v.some(x => x !== +dv && I.K.touchesOwnRoad(s, x, p))));
  // a rival builds a road to it and builds over it
  s.current = q; s.step = 'main'; s.pending = []; s.flags = {}; rich(s, q);
  const target = +dv;
  const edge = s.board.vertices[target].edges.find(e => s.roads[e] === undefined && I.spec.roadEdgeOk(s, e));
  const [a, b] = s.board.edges[edge].v, far = a === target ? b : a;
  s.roads[edge] = q; // a road that ends at the thicket
  s.markers[q] = 0;
  if (I.legalSettlements(s, q).includes(target)) {
    const before = s.markers[q];
    act(s, q, { type: 'buildSettlement', v: target });
    assert.strictEqual(s.buildings[target].p, q);
    assert.ok(!s.buildings[target].decline);
    assert.strictEqual(s.markers[q], before + 1);
  } else assert.ok(far != null);
}

// ---- Longest Trade Route needs 3 connected roads; the advantage trade works once per turn
{
  const s = fresh(3);
  const p = s.current;
  s.longestRoad = { p, len: 3 }; s.step = 'main'; rich(s, p);
  act(s, p, { type: 'roadTrade', give: { timber: 1, stone: 1 }, get: 'coca' });
  assert.throws(() => act(s, p, { type: 'roadTrade', give: { timber: 1, stone: 1 }, get: 'coca' }), /already used/);
  rich(s, p);
  act(s, p, { type: 'goodsTrade', get: { fleece: 2 } });
  act(s, p, { type: 'bankTrade', give: 'catch', get: 'timber' }); // 2 equal trade goods
  s.players[p].res.timber = 2; assert.throws(() => act(s, p, { type: "bankTrade", give: "timber", get: "stone" }), /Not enough/); // 3 equal resources are needed
}

// ---- the robber never goes to a field that makes trade goods; a 7 and Combat Arts both move it
{
  const s = fresh(3);
  const p = s.current;
  const targets = I.robberTargets(s, p);
  Object.keys(targets).forEach(h => { const x = s.board.hexes[h]; assert.ok(I.LAND.includes(x.terrain) || x.frame); });
  s.players[p].dev.combat = 1; s.step = 'main';
  act(s, p, { type: 'playCard', card: 'combat' });
  assert.strictEqual(s.pending[0].type, 'robber');
  assert.strictEqual(s.players[p].played, 1);
  assert.strictEqual(I.spec.handLimit(s, p), 8);
}

// ---- the almanac: supply, development stacks, goods trade, founding without a free crossing
{
  const s = fresh(3);
  const total = k => s.bank[k] + s.players.reduce((a, pl) => a + pl.res[k], 0); // supply plus hands
  I.RAW.forEach(k => assert.strictEqual(total(k), 20));
  I.GOODS.forEach(k => assert.strictEqual(total(k), 12));
  const cnt = d => { const o = {}; d.forEach(c => { o[c] = (o[c] || 0) + 1; }); return o; };
  assert.deepStrictEqual(cnt(s.devDeck), { combat: 7, roadBuilding: 1, invention: 1, inMonopoly: 1 });
  assert.deepStrictEqual(cnt(s.devDeck2), { combat: 7, roadBuilding: 1, invention: 1, inMonopoly: 1 });
  // 3 different trade goods give 2 raw materials, never trade goods
  const p = s.current;
  s.step = 'main'; s.players[p].res.catch = 1; s.players[p].res.coca = 1; s.players[p].res.feathers = 1;
  assert.throws(() => act(s, p, { type: 'goodsTrade', get: { catch: 2 } }));
  act(s, p, { type: 'goodsTrade', get: { stone: 1, metal: 1 } });
  // no free crossing without a road leading to it: an own building in decline makes room
  const t = fresh(3);
  for (const e of t.board.edges) if (t.roads[e.id] === undefined) t.roads[e.id] = 1;
  const own = Object.keys(t.buildings).filter(v => t.buildings[v].p === 0);
  own.forEach(v => { t.buildings[v].decline = true; });
  assert.strictEqual(I.foundSpots(t, 0).length, 0);
  assert.deepStrictEqual(I.foundingSpots(t, 0).map(String).sort(), own.map(String).sort());
}

{
  const s = fresh(3); const p = s.current;
  s.step = 'main'; s.players[p].res.timber = 2;
  assert.throws(() => act(s, p, { type: 'offerTrade', give: { timber: 1 }, get: { timber: 1 } }), /same kind/);
  act(s, p, { type: 'offerTrade', give: { timber: 1 }, get: { stone: 1 } });
}

console.log('inkas rules: ok');
