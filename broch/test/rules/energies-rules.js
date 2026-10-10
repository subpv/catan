'use strict';
// Rule checks for New Energies against the official rulebook. Usage: node test/rules/energies-rules.js
const assert = require('assert');
const engine = require('../../server/engine');
const E = require('../../server/engine/energies/energies');
const I = E._internal;
const K = I.K;

function game(n) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white'][i] }));
  return engine.createGame({ id: 'g', mode: 'energies', players, options: {} });
}
const pick = a => a[0];
// play the setup with the first legal spots
function setup(s) {
  while (s.phase === 'setup') {
    const p = s.current;
    const v = engine.viewFor(s, p);
    if (v.legal.setupSpots) engine.act(s, p, { type: 'placeSettlement', v: pick(v.legal.setupSpots) });
    else engine.act(s, p, { type: 'placeRoad', e: pick(v.legal.setupRoads) });
  }
  return s;
}
const ok = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } };
const throws = (fn, msg) => assert.throws(fn, e => (msg ? e.message.includes(msg) : true));
const act = (s, p, a) => engine.act(s, p, a);
// a research city of p on a vertex with 3 numbered tiles (moves the existing one there)
function richCity(s, p) {
  const old = K.ownBuildings(s, p, 'city')[0];
  const ok = v => K.V(s, v).hexes.filter(h => s.board.hexes[h].number).length === 3;
  if (ok(old)) return old;
  const v = s.board.vertices.find(x => ok(x.id) && K.distanceOk(s, x.id)).id;
  delete s.buildings[old]; s.buildings[v] = { p, type: 'city' };
  return v;
}
const cardsOf = (s, p) => I.LIMITED.reduce((a, k) => a + s.players[p].res[k], 0);

ok('only 3-4 players', () => {
  throws(() => game(2), '3–4');
  throws(() => game(5), '3–4');
});
ok('setup: village + research city, pollution 9 / 12, 43 brown chips, 9 green chips each', () => {
  for (const [n, pol] of [[3, 9], [4, 12]]) {
    const s = setup(game(n));
    assert.strictEqual(I.pollution(s), pol);
    assert.strictEqual(I.marker(s), pol);
    assert.strictEqual(s.bag.length, 43);
    assert(s.bag.every(c => !c.g));
    assert.deepStrictEqual(s.green.map(g => g.length), Array(n).fill(9));
    for (let p = 0; p < n; p++) { assert.strictEqual(K.count(s, p, 'settlement'), 1); assert.strictEqual(K.count(s, p, 'city'), 1); assert.strictEqual(engine.vp(s, p), 3); assert.strictEqual(s.players[p].res.research >= 1, true); }
    const g = s.green.flat();
    assert.strictEqual(g.length, n === 3 ? 27 : 36);
    assert.strictEqual(g.filter(k => k === 'climate').length, n === 3 ? 3 : 4);
    assert.strictEqual(g.filter(k => k === 'sustain').length, n === 3 ? 12 : 16);
    assert.strictEqual(s.deck.length, 25);
    assert.strictEqual(s.board.hexes.filter(h => h.terrain === 'desert').length, 1);
    assert.strictEqual(s.inspector, s.board.hexes.find(h => h.terrain === 'desert').id);
  }
});
ok('chips per turn by marker', () => {
  const c = I.chipsAt;
  assert.deepStrictEqual([0, 5, 6, 18, 19, 21, 23, 24, 28].map(c), [2, 2, 1, 1, 2, 2, 2, 3, 3]);
});
ok('board numbers: 18 chips, desert has none, standard counts', () => {
  const s = game(3);
  const nums = s.board.hexes.filter(h => h.number).map(h => h.number).sort((a, b) => a - b);
  assert.deepStrictEqual(nums, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  assert.strictEqual(s.board.hexes.length, 19);
  assert.strictEqual(s.board.ports.length, 9);
});
ok('turn starts with the draw; roll before drawing is refused; a turn draws the marker count', () => {
  const s = setup(game(3));
  const p = s.current;
  throws(() => act(s, p, { type: 'roll' }), 'Draw the event chips first');
  const n = I.chipsAt(I.marker(s));
  const bag = s.bag.length;
  act(s, p, { type: 'drawChips' });
  // events may leave decisions; resolve until the roll is possible
  assert.strictEqual(bag - s.bag.length, n);
});
ok('an event happens only when its last slot is filled', () => {
  const s = setup(game(3));
  const p = s.current;
  s.bag = [{ k: 'flood', g: false }, { k: 'flood', g: false }, { k: 'flood', g: false }, { k: 'flood', g: false }];
  s.slots.flood = ['b', 'b', 'b'];
  s.ev = { left: 1, total: 1, ender: false };
  I.runEvents(s);
  assert.strictEqual(s.slots.flood.length, 0); // 4th chip: event happened, chips back into the box
  assert.strictEqual(s.bag.length, 3);
  assert(s.pending.length > 0 || Object.keys(s.dmg.v).length > 0);
  s.current = p;
});
ok('flood: everybody gets one damage on a village or city (turn order from the active player)', () => {
  const s = setup(game(4));
  I.applyEvent(s, 'flood');
  const mine = new Set();
  // every player has 2 buildings: a choice is pending for each, one group at a time
  let guard = 0;
  while (s.pending.length && guard++ < 20) {
    const it = s.pending[0];
    act(s, it.player, { type: 'placeDamage', v: it.options[0] });
    mine.add(it.player);
  }
  assert.strictEqual(mine.size, 4);
  assert.strictEqual(Object.keys(s.dmg.v).length, 4);
});
ok('air pollution: worst balance puts a damage on a research city', () => {
  const s = setup(game(3));
  s.buildings[Object.keys(s.buildings).find(v => s.buildings[v].p === 0 && s.buildings[v].type === 'settlement')];
  // give player 1 a brown plant so they are the worst
  const v1 = K.ownBuildings(s, 1, 'city')[0];
  s.plants.push({ id: 1, p: 1, kind: 'brown', v: v1, hex: I.K.V(s, v1).hexes.find(h => s.board.hexes[h].number) });
  assert.strictEqual(I.bal(s, 1), 4);
  I.applyEvent(s, 'smog');
  assert(s.dmg.v[v1] || (s.pending.length && s.pending[0].player === 1 && s.pending[0].options.includes(v1)));
});
ok('climate conference: best takes a card, worst gives one back; all equal does nothing', () => {
  const s = setup(game(3));
  I.applyEvent(s, 'climate');
  assert.strictEqual(s.pending.length, 0);
  const v1 = K.ownBuildings(s, 1, 'city')[0];
  s.plants.push({ id: 1, p: 1, kind: 'brown', v: v1, hex: K.V(s, v1).hexes.find(h => s.board.hexes[h].number) });
  const v2 = K.ownBuildings(s, 2, 'city')[0];
  s.plants.push({ id: 2, p: 2, kind: 'green', v: v2, hex: K.V(s, v2).hexes.find(h => s.board.hexes[h].number) });
  I.applyEvent(s, 'climate');
  const types = s.pending.map(x => x.type + x.player).sort();
  assert.deepStrictEqual(types, ['dropCard1', 'takeCard2']);
});
ok('sustainable production rewards the most green plants; development card event gives the top card to the best balance', () => {
  const s = setup(game(3));
  const v2 = K.ownBuildings(s, 2, 'city')[0];
  s.plants.push({ id: 2, p: 2, kind: 'green', v: v2, hex: K.V(s, v2).hexes.find(h => s.board.hexes[h].number) });
  I.applyEvent(s, 'sustain');
  assert.deepStrictEqual(s.pending.map(x => x.player), [2]);
  s.pending = [];
  const top = s.deck[0];
  I.applyEvent(s, 'subsidy');
  assert.strictEqual(s.players[2].devs.length, 1);
  assert.strictEqual(s.players[2].devs[0].k, top);
});
ok('disaster rolls (never 7) and damages every tile with that number except the inspector tile', () => {
  const s = setup(game(3));
  for (let i = 0; i < 40; i++) { s.dmg = { h: {}, v: {} }; s.lastEvents = [{}]; I.applyEvent(s, 'disaster'); const r = s.lastEvents[0].roll; assert.notStrictEqual(r[0] + r[1], 7); const n = r[0] + r[1]; const hs = s.board.hexes.filter(h => h.number === n && h.id !== s.inspector); assert.strictEqual(Object.keys(s.dmg.h).length, hs.length); }
});
ok('production: damages and the inspector block, damages clear when their number is rolled (not at the inspector)', () => {
  const s = setup(game(3));
  const v = richCity(s, 0);
  K.ownBuildings(s, 0, 'settlement').forEach(x => { delete s.buildings[x]; });
  const hexes = K.V(s, v).hexes.filter(h => s.board.hexes[h].number);
  const [h1, h2, h3] = hexes;
  s.board.hexes[h3].number = 4;
  s.players[0].res = { wood: 0, clay: 0, fiber: 0, food: 0, metal: 0, research: 0, energy: 0 };
  s.board.hexes[h1].number = 6; s.board.hexes[h2].number = 5;
  s.plants.push({ id: 1, p: 0, kind: 'brown', v, hex: h1 });
  s.dmg.h[h1] = true; s.dmg.v[v] = true;
  I.produce(s, 6);
  assert.strictEqual(cardsOf(s, 0), 0);
  assert.strictEqual(s.players[0].res.energy, 0);
  assert(!s.dmg.h[h1] && !s.dmg.v[v], 'damages cleared');
  // inspector tile: nothing, and no clearing
  s.dmg.h[h1] = true; s.dmg.v[v] = true; s.inspector = h1;
  I.produce(s, 6);
  assert(s.dmg.h[h1] && s.dmg.v[v], 'damages stay where the inspector stands');
  assert.strictEqual(cardsOf(s, 0), 0);
  // normal yield: a city makes a resource and a research card, a plant 1 energy
  s.dmg = { h: {}, v: {} }; s.inspector = h2;
  I.produce(s, 6);
  assert.strictEqual(s.players[0].res.research, 1);
  assert.strictEqual(s.players[0].res.energy, 1);
});
ok('at most 5 energy tokens', () => {
  const s = setup(game(3));
  const v = richCity(s, 0);
  const h = K.V(s, v).hexes.find(x => s.board.hexes[x].number);
  K.V(s, v).hexes.forEach(x => { if (s.board.hexes[x].number) s.board.hexes[x].number = 4; });
  s.board.hexes[h].number = 9;
  s.plants.push({ id: 1, p: 0, kind: 'brown', v, hex: h });
  s.players[0].res.energy = 5;
  I.produce(s, 9);
  assert.strictEqual(s.players[0].res.energy, 5);
});
ok('plants: one per build phase, 1 research brown / 3 green, a village holds 1, a city 3 (1 per tile)', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  s.players[p].res.research = 5;
  const city = richCity(s, p);
  let vil = K.ownBuildings(s, p, 'settlement')[0];
  if (!K.V(s, vil).hexes.some(h => s.board.hexes[h].number)) { const nv = s.board.vertices.find(x => K.distanceOk(s, x.id) && x.hexes.some(h => s.board.hexes[h].number)).id; delete s.buildings[vil]; s.buildings[nv] = { p, type: 'settlement' }; vil = nv; }
  const hs = K.V(s, city).hexes.filter(h => s.board.hexes[h].number);
  act(s, p, { type: 'buildPlant', kind: 'brown', v: city, h: hs[0] });
  assert.strictEqual(s.players[p].res.research, 4);
  throws(() => act(s, p, { type: 'buildPlant', kind: 'brown', v: city, h: hs[1] }), 'one power plant');
  s.flags.plantBuilt = false;
  throws(() => act(s, p, { type: 'buildPlant', kind: 'brown', v: city, h: hs[0] }), 'numbered tile');
  act(s, p, { type: 'buildPlant', kind: 'green', v: city, h: hs[1] });
  assert.strictEqual(s.players[p].res.research, 1);
  assert.strictEqual(s.bag.filter(c => c.g).length, 1);
  assert.strictEqual(s.green[p].length, 8);
  assert.strictEqual(I.bal(s, p), 3 + 1 - 1);
  s.flags.plantBuilt = false;
  const vh = K.V(s, vil).hexes.find(h => s.board.hexes[h].number);
  s.players[p].res.research = 3;
  act(s, p, { type: 'buildPlant', kind: 'brown', v: vil, h: vh });
  s.flags.plantBuilt = false;
  throws(() => act(s, p, { type: 'buildPlant', kind: 'brown', v: vil, h: vh }), 'free slot');
});
ok('demolish a brown plant: 1 energy, once per turn; warehouse 2 energy, hand limit 10', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  const city = K.ownBuildings(s, p, 'city')[0];
  const h = K.V(s, city).hexes.find(x => s.board.hexes[x].number);
  s.plants.push({ id: 1, p, kind: 'brown', v: city, hex: h });
  throws(() => act(s, p, { type: 'demolishPlant', plant: 1 }), 'energy');
  s.players[p].res.energy = 3;
  const bal = I.bal(s, p);
  act(s, p, { type: 'demolishPlant', plant: 1 });
  assert.strictEqual(I.bal(s, p), bal - 1);
  assert.strictEqual(s.players[p].res.energy, 2);
  act(s, p, { type: 'buyWarehouse' });
  assert.strictEqual(s.players[p].warehouse, true);
  assert.strictEqual(engine.viewFor(s, p).players[p].handLimit, 10);
  throws(() => act(s, p, { type: 'buyWarehouse' }), 'already');
});
ok('7: discard half above 7 (10 with a warehouse), inspector moves, steals from a neighbour', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'roll'; s.flags = { drawn: true };
  s.players[p].res = { wood: 3, clay: 3, fiber: 3, food: 0, metal: 0, research: 0, energy: 0 };
  s.players[(p + 1) % 3].warehouse = true;
  s.players[(p + 1) % 3].res = { wood: 5, clay: 5, fiber: 0, food: 0, metal: 0, research: 0, energy: 0 };
  s.players[(p + 2) % 3].res = { wood: 0, clay: 0, fiber: 0, food: 0, metal: 0, research: 0, energy: 0 };
  I.K.rollDice; // 7 via the kit
  const total = K.rollDice(s, [3, 4]);
  assert.strictEqual(total, 7);
  s.step = 'main';
  K.sevenDiscards(s);
  K.pushPending(s, [{ type: 'inspector', player: p }]);
  const disc = s.pending.filter(x => x.type === 'discard');
  assert.deepStrictEqual(disc.map(x => [x.player, x.count]), [[p, 4]]); // 9 cards -> 4, warehouse owner (10) keeps theirs
});
ok('inspector: cannot move onto a damaged tile or stay; steals a card', () => {
  const s = setup(game(3));
  const p = s.current;
  const target = s.board.hexes.find(h => h.id !== s.inspector && h.verts.some(v => s.buildings[v] && s.buildings[v].p !== p));
  const victim = target.verts.map(v => s.buildings[v]).find(b => b && b.p !== p).p;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  s.pending = []; K.pushPending(s, [{ type: 'inspector', player: p }]);
  s.dmg.h[target.id] = true;
  throws(() => act(s, p, { type: 'moveInspector', h: target.id }), 'another tile');
  throws(() => act(s, p, { type: 'moveInspector', h: s.inspector }), 'another tile');
  delete s.dmg.h[target.id];
  s.players[victim].res.wood = 1;
  const before = cardsOf(s, p);
  act(s, p, { type: 'moveInspector', h: target.id, victim });
  assert.strictEqual(s.inspector, target.id);
  assert.strictEqual(cardsOf(s, p), before + 1);
});
ok('trading: 4:1 / 3:1 research / 2:1 energy; same-kind swaps and more than 5 energy refused', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  const pl = s.players[p];
  pl.res = { wood: 0, clay: 0, fiber: 0, food: 0, metal: 0, research: 3, energy: 2 };
  assert.strictEqual(I.spec.bankRate(s, p, 'energy'), 2);
  assert.strictEqual(I.spec.bankRate(s, p, 'research'), 3);
  act(s, p, { type: 'bankTrade', give: 'energy', get: 'research' });
  assert.strictEqual(pl.res.energy, 0); assert.strictEqual(pl.res.research, 4);
  act(s, p, { type: 'bankTrade', give: 'research', get: 'wood' });
  assert.strictEqual(pl.res.research, 1); assert.strictEqual(pl.res.wood, 1);
  throws(() => act(s, p, { type: 'bankTrade', give: 'research', get: 'research' }));
  throws(() => act(s, p, { type: 'offerTrade', give: { wood: 1 }, get: { wood: 1 } }), 'same kind');
  const q = (p + 1) % 3;
  s.players[q].res.energy = 5;
  pl.res.energy = 1;
  act(s, p, { type: 'offerTrade', give: { energy: 1 }, get: { food: 1 } });
  throws(() => act(s, q, { type: 'respondTrade', id: s.trade.id, accept: true }), '5 energy');
});
ok('development cards: 25, play 1 per turn, not the turn you got it, victory points count', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  const pl = s.players[p];
  pl.res = { wood: 0, clay: 0, fiber: 1, food: 1, metal: 1, research: 0, energy: 0 };
  const deck = s.deck.slice();
  act(s, p, { type: 'buyDev' });
  assert.strictEqual(pl.devs.length, 1);
  assert.strictEqual(s.deck.length, 24);
  if (pl.devs[0].k !== 'victoryPoint') throws(() => act(s, p, { type: 'playDev', card: pl.devs[0].k }), 'just bought');
  pl.devs = [{ k: 'victoryPoint', t: 0 }, { k: 'victoryPoint', t: 0 }];
  assert.strictEqual(engine.vp(s, p), 3 + 2);
  assert.strictEqual(engine.viewFor(s, (p + 1) % 3).players[p].vp, 3);
  pl.devs = [{ k: 'funding', t: 0 }, { k: 'funding', t: 0 }];
  act(s, p, { type: 'playDev', card: 'funding', take: { research: 2 } });
  assert.strictEqual(pl.res.research, 2);
  throws(() => act(s, p, { type: 'playDev', card: 'funding', take: { research: 2 } }), 'one development card');
});
ok('Environmental protection: three played cards win the Most active environmentalist (2 points)', () => {
  const s = setup(game(3));
  const p = s.current;
  for (let i = 0; i < 3; i++) {
    s.step = 'main'; s.flags = { drawn: true, rolled: true }; s.pending = [];
    s.players[p].devs = [{ k: 'protection', t: 0 }];
    const h = s.board.hexes.find(x => x.id !== s.inspector && !s.dmg.h[x.id] && x.verts.every(v => !s.buildings[v]));
    act(s, p, { type: 'playDev', card: 'protection', mode: 'move', h: h.id });
  }
  assert.strictEqual(s.activist.p, p);
  assert.strictEqual(engine.vp(s, p), 3 + 2);
});
ok('Road building: 2 free roads; Performance boost: 1 card per tile with a green plant', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  s.players[p].devs = [{ k: 'roadBuilding', t: 0 }];
  const roads = K.countRoads(s, p);
  act(s, p, { type: 'playDev', card: 'roadBuilding' });
  act(s, p, { type: 'buildRoad', e: K.legalRoads(s, p)[0] });
  act(s, p, { type: 'buildRoad', e: K.legalRoads(s, p)[0] });
  assert.strictEqual(K.countRoads(s, p), roads + 2);
  assert.strictEqual(s.pending.length, 0);
  s.flags = { drawn: true, rolled: true };
  const city = richCity(s, p);
  const hs = K.V(s, city).hexes.filter(h => s.board.hexes[h].number);
  s.plants.push({ id: 1, p, kind: 'green', v: city, hex: hs[0] }, { id: 2, p, kind: 'green', v: city, hex: hs[1] });
  s.players[p].devs = [{ k: 'boost', t: 0 }];
  const before = cardsOf(s, p);
  act(s, p, { type: 'playDev', card: 'boost', hexes: [hs[0], hs[1]] });
  assert.strictEqual(cardsOf(s, p), before + 2);
});
ok('end of game: bag empty -> biggest green minus brown wins; nobody above 0 -> everybody loses', () => {
  const s = setup(game(3));
  const c = K.ownBuildings(s, 0, 'city')[0];
  const hs = K.V(s, c).hexes.filter(h => s.board.hexes[h].number);
  s.plants.push({ id: 1, p: 0, kind: 'green', v: c, hex: hs[0] });
  I.endByBag(s);
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.winner, 0);
  const s2 = setup(game(3));
  I.endByBag(s2);
  assert.strictEqual(s2.winner, null);
});
ok('bag runs out in the middle of the draw: remaining chips are drawn, then the game ends', () => {
  const s = setup(game(3));
  const p = s.current;
  s.bag = [{ k: 'smog', g: false }];
  s.ev = null;
  s.step = 'roll';
  s.players.forEach(pl => { pl.res.energy = 0; });
  // marker 9 -> 1 chip: exactly the one in the bag, the game goes on; the next turn ends it
  act(s, p, { type: 'drawChips' });
  assert.strictEqual(s.phase, 'play');
  s.step = 'main';
  act(s, p, { type: 'endTurn' });
  act(s, s.current, { type: 'drawChips' });
  assert.strictEqual(s.phase, 'over');
});
ok('10 points in your own turn win', () => {
  const s = setup(game(3));
  const p = s.current;
  s.step = 'main'; s.flags = { drawn: true, rolled: true };
  s.players[p].devs = Array.from({ length: 7 }, () => ({ k: 'victoryPoint', t: 0 }));
  act(s, p, { type: 'chat', text: 'x' });
  s.version++;
  K.checkWin(s);
  assert.strictEqual(s.winner, p);
});

console.log(process.exitCode ? 'some checks FAILED' : 'all rule checks passed');
