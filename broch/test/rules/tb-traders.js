'use strict';
// Rule checks for the scenario "Traders & Barbarians" (the wagon scenario), after the English 6th edition (book p20-24) and the
// 5-6 player book (p10-12). Run: node test/rules/tb-traders.js
require('../seed');
const assert = require('assert');
const engine = require('../../server/engine');
const C = require('../../server/engine/shared/constants');

const players = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: C.COLORS[i] }));
const pick = a => a[Math.floor(Math.random() * a.length)];
const act = (s, p, a) => engine.act(s, p, a);
const throws = (fn, msg) => { let ok = false; try { fn(); } catch (e) { ok = e instanceof engine.GameError && (!msg || e.message.includes(msg)); if (!ok) throw e; } assert(ok, 'expected an error: ' + msg); };
const forceDice = (vals, fn) => { const old = Math.random; let i = 0; Math.random = () => ((vals[i++ % vals.length] - 1) + 0.5) / 6; try { return fn(); } finally { Math.random = old; } };
const mk = (n, extra = {}, vars = {}) => engine.createGame({ id: 't', mode: 'classic', players: players(n), options: { expansion: 'traders', variants: { traders: true, ...vars }, ...extra } });
const L = (s, p) => engine.viewFor(s, p).legal;

// plays the setup phase with random legal placements; returns the log of what each placement was
function setup(s) {
  const kinds = [];
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 400) {
    const p = s.current, l = L(s, p);
    if (s.setup.need === 'city') { kinds.push('city'); act(s, p, { type: 'placeCity', v: pick(l.setupSpots) }); } else if (s.setup.need === 'settlement') { kinds.push('settlement'); act(s, p, { type: 'placeSettlement', v: pick(l.setupSpots) }); } else act(s, p, { type: 'placeRoad', e: pick(l.setupRoads) });
  }
  assert.equal(s.phase, 'play');
  return kinds;
}
const toMain = s => { s.step = 'main'; s.flags.rolled = true; s.dice = s.dice || { red: 1, yellow: 1, total: 2 }; };
const resHand = (s, p) => Object.values(s.players[p].res).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- the 3-4 player map (book p21)
{
  const s = mk(4);
  const b = s.board;
  assert.equal(b.hexes.length, 19);
  assert.deepEqual(Object.values(b.targets).sort(), ['castle', 'glassworks', 'quarry']);
  const terr = {};
  b.hexes.forEach(h => { terr[h.terrain] = (terr[h.terrain] || 0) + 1; });
  // 1 pasture, 1 field and the desert are back in the box: 3 hills, 4 forest, 3 pasture, 3 fields, 3 mountains
  assert.deepEqual(terr, { hills: 3, forest: 4, pasture: 3, fields: 3, mountains: 3, castle: 1, quarry: 1, glassworks: 1 });
  const nums = b.hexes.filter(h => h.number).map(h => h.number).sort((x, y) => x - y);
  assert.deepEqual(nums, [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11], 'no 2 and no 12');
  assert.equal(b.blocked.length, 9, '9 X markers');
  for (const id of Object.keys(b.targets)) {
    assert.equal(b.paths[id], 4);
    assert.equal(b.edges.filter(e => e.inner && e.hexes[0] === +id).length, 4, 'four interior paths');
    assert.equal(b.hexes[id].edges.filter(e => b.blocked.includes(e)).length, 3, 'three X markers on the sea side');
  }
  assert.equal(b.ports.length, 9);
  assert(b.ports.every(p => !b.blocked.includes(p.edge)), 'no harbour on an X side');
  assert.equal(b.barbStart.length, 3);
  assert.equal(s.hub.tb.stacks.quarry.length, 12);
  assert.equal(s.options.vpTarget, 13, 'win with 13');
  assert.equal(s.robber, null, 'no robber');
  assert.equal(s.devDeck.length, 25, '25 development cards');
  const cnt = {};
  s.devDeck.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; });
  assert.deepEqual(cnt, { knight: 16, victoryPoint: 3, roadBuilding: 3, goodTrip: 3 });
  s.players.forEach(pl => assert.equal(pl.gold, 5, 'everybody starts with 5 gold'));
  s.players.forEach((pl, i) => assert.deepEqual(s.hub.tb.tab[i], { level: 1, ware: null, delivered: 0 }));
}

// ---------------------------------------------------------------- the 5-6 player map (5-6 book p10-11)
for (const n of [5, 6]) {
  const s = mk(n);
  const b = s.board;
  assert(s.options.big && s.options.paired, '5-6 players: big board, paired turns');
  assert.equal(b.hexes.length, 37);
  assert.deepEqual(C.BOARDS.extended.rows, [3, 4, 5, 6, 5, 4, 3], 'the base 5-6 board is untouched');
  const kind = t => Object.entries(b.targets).filter(([, k]) => k === t).map(([id]) => +id);
  assert.equal(kind('quarry').length, 3); assert.equal(kind('glassworks').length, 3); assert.equal(kind('castle').length, 1);
  assert.equal(b.hexes.filter(h => h.terrain === 'desert').length, 2);
  const nums = b.hexes.filter(h => h.number).map(h => h.number).sort((x, y) => x - y);
  assert.deepEqual(nums, C.BOARDS.extended.numbers.slice().sort((x, y) => x - y), 'the 28 discs of the 5-6 set, 2 and 12 included');
  const terr = {};
  b.hexes.filter(h => !b.targets[h.id] && h.terrain !== 'desert').forEach(h => { terr[h.terrain] = (terr[h.terrain] || 0) + 1; });
  assert.deepEqual(terr, { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5 });
  // four paths and X markers: the quarry at the top left and the glassworks at the bottom right; the other five have six paths
  const four = Object.keys(b.paths).filter(id => b.paths[id] === 4).map(Number).sort((x, y) => x - y);
  assert.deepEqual(four, [0, 36]);
  assert.equal(b.blocked.length, 6, '6 X markers on the two old hexes');
  for (const id of Object.keys(b.targets)) {
    assert.equal(b.edges.filter(e => e.inner && e.hexes[0] === +id).length, b.paths[id], 'interior paths of hex ' + id);
    assert.equal(b.hexes[id].edges.filter(e => b.blocked.includes(e)).length, b.paths[id] === 4 ? 3 : 0);
  }
  assert.equal(b.ports.length, 11);
  assert(b.ports.every(p => !b.blocked.includes(p.edge)));
  // the three barbarians stand on the printed paths
  const between = e => b.edges[e].hexes.slice().sort((x, y) => x - y).join('-');
  assert.deepEqual(b.barbStart.map(between), ['2-7', '16-22', '31-32']);
  assert.deepEqual(Object.keys(s.hub.tb.barb).map(Number).sort((x, y) => x - y), b.barbStart.slice().sort((x, y) => x - y));
  // 18 commodity tokens per stack, all quarries draw from one stack
  for (const t of ['quarry', 'glassworks', 'castle']) assert.equal(s.hub.tb.stacks[t].length, 18);
  // the dice: 2 and 12 pay, no reroll
  assert.equal(s.devDeck.length, 25 + 12, 'the 12 cards of the 5-6 box are in the deck');
  // wagons and tableaux for every seat
  assert.equal(Object.keys(s.hub.tb.tab).length, n);
  // the game starts: the second placement is a city
  const kinds = setup(s);
  assert.equal(kinds.filter(k => k === 'city').length, n);
  assert.equal(kinds.filter(k => k === 'settlement').length, n);
  assert.equal(Object.keys(s.hub.tb.wagons).length, n, 'a wagon on every city');
}
{
  // a 3-4 player table may use the big map (the box adds players, it does not have to)
  const s = mk(3, { big: true });
  assert.equal(s.board.hexes.length, 37);
  assert(!s.options.paired);
}
// the lobby: all three big scenarios have a 5-6 map, none works with Cities & Knights
throws(() => engine.createGame({ id: 't', mode: 'knights', players: players(3), options: { expansion: 'traders', variants: { traders: true } } }), 'classic rules');

// ---------------------------------------------------------------- production: 2 and 12
{
  const s = mk(4); setup(s);
  const roll = () => { s.step = 'roll'; s.dice = null; s.flags = {}; act(s, s.current, { type: 'roll' }); return s.dice.total; };
  // 3-4 players: a 2 or 12 is rolled again
  assert.equal(forceDice([1, 1, 6, 6, 3, 4], roll), 7);
  s.pending = []; s.step = 'main';
  assert.equal(s.stats.rolls[2] + s.stats.rolls[12], 0, 'the 2 and the 12 never count');
}
{
  const s = mk(5); setup(s);
  s.step = 'roll'; s.dice = null; s.flags = {};
  forceDice([1, 1], () => act(s, s.current, { type: 'roll' }));
  assert.equal(s.dice.total, 2, '5-6 players: the 2 is a number that pays');
  assert(s.hub.big);
}

// ---------------------------------------------------------------- upgrades (wagon board, book p22)
{
  const s = mk(4); setup(s); toMain(s);
  const p = s.current, pl = s.players[p];
  const costs = [{ lumber: 1, wool: 1, ore: 1 }, { lumber: 1, wool: 1, ore: 1 }, { lumber: 2, wool: 1, ore: 1 }, { lumber: 2, wool: 1, ore: 1 }];
  for (let lvl = 1; lvl <= 4; lvl++) {
    pl.res = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    throws(() => act(s, p, { type: 'upgradeWagon' }), 'Not enough');
    Object.entries(costs[lvl - 1]).forEach(([k, n]) => { pl.res[k] = n; });
    pl.res.brick = 3; // not needed, must stay
    const before = engine.vp(s, p);
    act(s, p, { type: 'upgradeWagon' });
    assert.equal(s.hub.tb.tab[p].level, lvl + 1);
    assert.equal(pl.res.brick, 3);
    assert.equal(engine.vp(s, p) - before, lvl === 4 ? 1 : 0, 'the full upgrade (4 upgrades) is worth 1 point');
  }
  pl.res = { lumber: 9, brick: 0, wool: 9, grain: 0, ore: 9 };
  throws(() => act(s, p, { type: 'upgradeWagon' }), 'fully upgraded');
}

// ---------------------------------------------------------------- wagon movement (book p23)
function wagonSetup(n = 4, extra = {}) {
  const s = mk(n, extra); setup(s); toMain(s);
  const p = s.current, t = s.hub.tb;
  s.pending = [];
  // a corner with three ordinary paths, far from the commodity hexes, with nobody's roads around
  const v = s.board.vertices.find(x => !x.center && x.edges.length === 3 && x.edges.every(e => !s.board.edges[e].inner && !s.board.blocked.includes(e) && s.roads[e] === undefined) && x.adj.every(a => !s.board.vertices[a].center));
  t.wagons[p] = v.id; t.barb = {};
  return { s, p, t, v, other: (p + 1) % n };
}
const steps = (s, p) => L(s, p).wagon.steps;
{
  const { s, p, t, v, other } = wagonSetup();
  const [e0, e1, e2] = v.edges;
  s.roads[e1] = p; s.roads[e2] = other; t.barb[e1] = true;
  act(s, p, { type: 'endTurn' });
  assert.equal(L(s, p).wagon.mp, 4, 'a wagon starts with 4 movement points');
  const st = Object.fromEntries(steps(s, p).map(x => [x.edge, x]));
  assert.equal(st[e0].cost, 2, 'an edge without a road: 2 MP');
  assert.equal(st[e1].cost, 3, 'own road 1 MP, +2 with a barbarian');
  assert.equal(st[e1].pays, null);
  assert.equal(st[e2].cost, 1, "another player's road: 1 MP ...");
  assert.equal(st[e2].pays, other, '... and 1 gold for its owner');
  const g0 = [s.players[p].gold, s.players[other].gold];
  const to = st[e2].to;
  act(s, p, { type: 'wagonStep', to });
  assert.equal(s.players[p].gold, g0[0] - 1); assert.equal(s.players[other].gold, g0[1] + 1);
  assert.equal(L(s, p).wagon.mp, 3);
  assert.equal(t.wagons[p], to);
}
{
  // without gold the road of somebody else is closed
  const { s, p, v, other } = wagonSetup();
  s.roads[v.edges[0]] = other; s.players[p].gold = 0;
  act(s, p, { type: 'endTurn' });
  assert(!steps(s, p).some(x => x.edge === v.edges[0]));
}
{
  // oxen: 1 grain, 2 more movement points, once per turn; coins do not count as cards for the 7
  const { s, p } = wagonSetup();
  s.players[p].res.grain = 2;
  act(s, p, { type: 'endTurn' });
  act(s, p, { type: 'wagonGrain' });
  assert.equal(L(s, p).wagon.mp, 6); assert.equal(s.players[p].res.grain, 1);
  throws(() => act(s, p, { type: 'wagonGrain' }), 'Once per turn');
}
{
  // damaged road (event card Earthquake): as an ordinary path, 2 MP, nothing to pay
  const { s, p, v, other } = wagonSetup();
  s.roads[v.edges[0]] = other; s.damaged = { [v.edges[0]]: true };
  act(s, p, { type: 'endTurn' });
  const x = steps(s, p).find(y => y.edge === v.edges[0]);
  assert.equal(x.cost, 2); assert.equal(x.pays, null);
}
{
  // driving off a barbarian: level 2: 6, level 3: 5-6, level 4: 4-6, level 5: 3-6; one try per barbarian and turn
  const book = { 2: [6], 3: [5, 6], 4: [4, 5, 6], 5: [3, 4, 5, 6] };
  for (let lvl = 1; lvl <= 5; lvl++) for (let r = 1; r <= 6; r++) {
    const { s, p, t, v } = wagonSetup();
    t.tab[p].level = lvl; t.barb[v.edges[0]] = true;
    act(s, p, { type: 'endTurn' });
    if (lvl === 1) { throws(() => act(s, p, { type: 'wagonExpel', edge: v.edges[0] }), 'second level'); continue; }
    const hand = resHand(s, (p + 1) % 4);
    forceDice([r], () => act(s, p, { type: 'wagonExpel', edge: v.edges[0] }));
    const ok = book[lvl].includes(r);
    assert.equal(!!L(s, p).wagon.placing, ok, `level ${lvl}, die ${r}`);
    if (!ok) throws(() => act(s, p, { type: 'wagonExpel', edge: v.edges[0] }), 'already tried');
    else {
      // a driven-off barbarian goes to any edge without a barbarian; nobody is robbed
      const target = L(s, p).wagon.barbTargets.find(e => s.roads[e] !== undefined && s.roads[e] !== p) ?? L(s, p).wagon.barbTargets[0];
      act(s, p, { type: 'wagonBarbTo', to: target });
      assert(t.barb[target] && !t.barb[v.edges[0]]);
      assert.equal(resHand(s, (p + 1) % 4), hand, 'no card is stolen');
    }
  }
}
{
  // Swift Journey: move again with the full movement points; the grain and the barbarian attempts stay limited per turn
  const { s, p, t, v } = wagonSetup();
  t.tab[p].level = 2; t.barb[v.edges[0]] = true;
  s.players[p].res.grain = 3;
  s.players[p].dev.push({ type: 'goodTrip', turn: 0 });
  act(s, p, { type: 'endTurn' });
  throws(() => act(s, p, { type: 'playGoodTrip' }), 'Move your wagon first');
  forceDice([1], () => act(s, p, { type: 'wagonExpel', edge: v.edges[0] }));
  act(s, p, { type: 'wagonGrain' });
  act(s, p, { type: 'wagonStep', to: steps(s, p)[0].to });
  act(s, p, { type: 'playGoodTrip' });
  assert.equal(L(s, p).wagon.mp, 5, 'the whole tableau value again');
  throws(() => act(s, p, { type: 'wagonGrain' }), 'Once per turn');
  throws(() => act(s, p, { type: 'wagonExpel', edge: v.edges[0] }), 'already tried');
  assert(!s.players[p].dev.length, 'the card is spent');
}

// ---------------------------------------------------------------- commodity tokens: pick up and deliver (book p23)
{
  for (let lvl = 1; lvl <= 5; lvl++) {
    const { s, p, t } = wagonSetup();
    t.tab[p].level = lvl;
    const hexId = +Object.keys(s.board.targets).find(id => s.board.targets[id] === 'quarry');
    const c = s.board.centers[hexId];
    // first visit: no gold, a token is drawn from the stack of that hex
    t.wagons[p] = s.board.landCorners[hexId][0];
    s.roads[s.board.vertices[c].edges[0]] = p; // own road on that interior path: 1 MP
    const stack = t.stacks.quarry.length;
    act(s, p, { type: 'endTurn' });
    const gold0 = s.players[p].gold;
    const edge = s.board.vertices[t.wagons[p]].edges.find(e => s.board.edges[e].inner);
    s.roads[edge] = p;
    act(s, p, { type: 'wagonStep', to: c });
    assert.equal(t.wagons[p], c);
    assert.equal(L(s, p).wagon.mp, 0, 'the move ends in the plaza');
    assert(t.tab[p].ware, 'a token is drawn'); assert.equal(t.stacks.quarry.length, stack - 1);
    assert.equal(s.players[p].gold, gold0);
    assert(['marble', 'sand'].includes(t.tab[p].ware), 'a quarry gives sand or marble');
    // delivery: tools to the quarry, points and the gold of the level (1..5)
    s.pending = []; t.move = null; s.hub.ending = false;
    t.tab[p].ware = 'tools'; t.tab[p].delivered = 0;
    s.step = 'main'; s.current = p; s.flags = { rolled: true };
    const vp0 = engine.vp(s, p);
    t.wagons[p] = s.board.landCorners[hexId][0];
    act(s, p, { type: 'endTurn' });
    act(s, p, { type: 'wagonStep', to: c });
    assert.equal(s.players[p].gold - gold0, lvl, `a delivery pays ${lvl} gold at level ${lvl}`);
    assert.equal(t.tab[p].delivered, 1);
    assert.equal(engine.vp(s, p) - vp0, 1, 'a delivery is worth 1 point');
    assert(t.tab[p].ware, 'a new token is drawn after a delivery');
  }
}
{
  // a token the hex does not want is not delivered and nothing new is drawn
  const { s, p, t } = wagonSetup();
  const hexId = +Object.keys(s.board.targets).find(id => s.board.targets[id] === 'glassworks');
  const c = s.board.centers[hexId];
  t.wagons[p] = s.board.landCorners[hexId][0];
  t.tab[p].ware = 'marble';
  // no road on the paths into the plaza, else the step costs a toll and the gold check below would depend on the random setup
  for (const e of s.board.vertices[c].edges) delete s.roads[e];
  act(s, p, { type: 'endTurn' });
  const g0 = s.players[p].gold, n0 = t.stacks.glassworks.length;
  act(s, p, { type: 'wagonStep', to: c });
  assert.equal(t.tab[p].ware, 'marble'); assert.equal(t.tab[p].delivered, 0); assert.equal(s.players[p].gold, g0); assert.equal(t.stacks.glassworks.length, n0);
}

// ---------------------------------------------------------------- roads and settlements on commodity hexes
{
  const s = mk(4); setup(s); toMain(s);
  const b = s.board;
  const id = +Object.keys(b.targets)[0];
  const c = b.centers[id];
  s.players[s.current].res = { lumber: 9, brick: 9, wool: 9, grain: 9, ore: 9 };
  assert(!(engine.viewFor(s, s.current).legal.settlements || []).includes(c), 'no settlement in the center');
  throws(() => act(s, s.current, { type: 'buildSettlement', v: c }), 'cannot build');
  const blocked = b.blocked[0];
  const hex = b.hexes[b.edges[blocked].hexes[0]];
  assert(hex, 'blocked edges belong to a hex');
  // nobody may build a road on an X edge or build a settlement on the sea corners of a four-path hex
  const p = s.current;
  s.players[p].res = { lumber: 9, brick: 9, wool: 9, grain: 9, ore: 9 };
  for (const e of b.blocked) throws(() => act(s, p, { type: 'buildRoad', e }), 'cannot build a road');
}
{
  // five and six players: the six-path hexes are open on all sides (settlements on every corner, roads on every edge)
  const s = mk(5);
  const six = +Object.keys(s.board.paths).find(id => s.board.paths[id] === 6);
  assert.equal(s.board.landCorners[six].length, 6);
  assert(s.board.seaCorners.every(v => s.board.hexes[0].verts.includes(v) || s.board.hexes[36].verts.includes(v)), 'sea corners only on the two four-path hexes');
}

// ---------------------------------------------------------------- a 7 and the knight card: barbarians, no robber, the Largest Army
{
  const s = mk(4); setup(s); toMain(s);
  const p = s.current, q = (p + 1) % 4;
  // a 7: the barbarian moves; on a road, one random resource card of its owner (never gold) is stolen
  // a road of q with no barbarian on it yet (a random setup road can lie under one of the start barbarians, which refuses a second one)
  const road = Object.keys(s.roads).map(Number).find(e => s.roads[e] === q && s.hub.tb.barb[e] === undefined);
  assert(road !== undefined, 'q has a road without a barbarian');
  s.players[q].res = { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 };
  s.players[q].gold = 7;
  s.players.forEach((pl, i) => { if (i !== q) pl.res = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }; });
  s.step = 'roll'; s.dice = null; s.flags = {};
  forceDice([3, 4], () => act(s, p, { type: 'roll' }));
  assert.equal(s.dice.total, 7);
  const it = s.pending.find(x => x.type === 'moveBarb');
  assert(it, 'the active player moves a barbarian');
  const from = +Object.keys(s.hub.tb.barb)[0];
  assert(!s.board.blocked.includes(road));
  act(s, p, { type: 'moveBarb', from, to: road });
  assert.equal(s.players[q].res.lumber, 0, 'the road owner is robbed');
  assert.equal(s.players[q].gold, 7, 'gold cannot be stolen');
  assert.equal(s.players[p].res.lumber, 1);
  // an edge that already has a barbarian is refused
  s.pending = []; s.step = 'main'; s.flags.rolled = true;
  const others = Object.keys(s.hub.tb.barb).map(Number).filter(e => e !== road);
  s.pending = [{ type: 'moveBarb', player: p }]; s.pendingGroup = 0;
  throws(() => act(s, p, { type: 'moveBarb', from: others[0], to: others[1] }), 'cannot go there');
}
{
  // knight cards: 3 knights are the Largest Army (2 points); the card moves a barbarian instead of the robber
  const s = mk(4); setup(s);
  const p = s.current;
  let before = engine.vp(s, p);
  for (let i = 0; i < 3; i++) {
    s.step = 'main'; s.flags = { rolled: true }; s.pending = []; s.turn += 1;
    s.players[p].dev.push({ type: 'knight', turn: 0 });
    act(s, p, { type: 'playDev', card: 'knight' });
    const it = s.pending.find(x => x.type === 'moveBarb');
    assert(it, 'the knight moves a barbarian');
    const from = +Object.keys(s.hub.tb.barb)[0];
    const to = s.board.edges.map(e => e.id).find(e => !s.board.blocked.includes(e) && !s.hub.tb.barb[e] && s.roads[e] === undefined);
    act(s, p, { type: 'moveBarb', from, to });
    assert.equal(s.largestArmy.p, i === 2 ? p : null);
  }
  assert.equal(engine.vp(s, p) - before, 2, 'Largest Army is worth 2 points');
}

// ---------------------------------------------------------------- victory: 13 points, victory point cards count
{
  const s = mk(4); setup(s); toMain(s);
  const p = s.current;
  const base = engine.vp(s, p);
  assert.equal(base, 3, 'a settlement and a city');
  s.players[p].dev = Array.from({ length: 3 }, () => ({ type: 'victoryPoint', turn: s.turn })); // even cards built this turn count
  assert.equal(engine.vp(s, p), 6);
  s.players[p].gold = 99; // gold is no victory point
  assert.equal(engine.vp(s, p), 6);
  s.players[p].dev = [];
  const t = s.hub.tb;
  t.tab[p].delivered = 8; t.tab[p].level = 5; t.tab[p].ware = 'tools'; // 3 + 8 + 1 (full upgrade) = 12
  const hexId = +Object.keys(s.board.targets).find(id => s.board.targets[id] === 'quarry');
  t.wagons[p] = s.board.landCorners[hexId][0];
  act(s, p, { type: 'endTurn' });
  assert.equal(engine.vp(s, p), 12); assert.equal(s.phase, 'play');
  act(s, p, { type: 'wagonStep', to: s.board.centers[hexId] });
  assert.equal(s.phase, 'over', 'the delivery that brings the 13th point wins at once'); assert.equal(s.winner, p);
}

// ---------------------------------------------------------------- 5-6 players: paired turns (5-6 book p4 and p12)
{
  const s = mk(6); setup(s);
  const one = s.current, two = (one + 3) % 6;
  assert.equal(s.pair.one, one);
  s.step = 'main'; s.flags = { rolled: true }; s.dice = { red: 3, yellow: 4, total: 7 };
  act(s, one, { type: 'endTurn' });
  assert(s.pending.some(x => x.type === 'moveWagon' && x.player === one), 'player 1 moves the wagon at the end of the turn');
  act(s, one, { type: 'wagonDone' });
  assert.equal(s.current, two, 'then player 2, three seats to the left');
  assert(s.flags.stone2 && s.step === 'main', 'no dice for player 2');
  throws(() => act(s, two, { type: 'offerTrade', give: { lumber: 1 }, get: { brick: 1 } }), 'bank');
  // player 2 spends coins at the supply, upgrades the wagon and moves it
  s.players[two].gold = 4;
  act(s, two, { type: 'goldTrade', res: 'ore' });
  assert.equal(s.players[two].gold, 2);
  s.players[two].res = { lumber: 1, brick: 0, wool: 1, grain: 0, ore: 1 };
  act(s, two, { type: 'upgradeWagon' });
  assert.equal(s.hub.tb.tab[two].level, 2);
  act(s, two, { type: 'endTurn' });
  assert(s.pending.some(x => x.type === 'moveWagon' && x.player === two), 'player 2 moves the wagon too');
  act(s, two, { type: 'wagonDone' });
  assert.equal(s.current, (one + 1) % 6, 'the stones move one seat to the left');
  assert.equal(s.step, 'roll');
}

console.log('tb-traders: all rule checks passed');
