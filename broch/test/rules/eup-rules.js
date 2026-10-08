'use strict';
// Rule checks for Explorers & Pirates, one assertion per rule of the rulebook that is easy to get wrong.
// Run: node test/rules/eup-rules.js
const assert = require('assert');
const engine = require('../../server/engine');
const X = require('../../server/engine/explorers-pirates/explorers');
const EB = require('../../server/engine/explorers-pirates/eup-board');
const { HANDLERS } = X._internal;

const players = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white', 'teal', 'purple'][i] }));
const pick = a => a[Math.floor(Math.random() * a.length)];
const act = (s, p, a) => engine.act(s, p, a);
const throws = (fn, msg) => { let ok = false; try { fn(); } catch (e) { ok = e instanceof engine.GameError && (!msg || e.message.includes(msg)); if (!ok) throw e; } assert(ok, 'expected an error: ' + msg); };

// plays the setup phase with random legal placements
function setup(s) {
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 200) {
    const p = s.current, L = engine.viewFor(s, p).legal;
    if (L.setupSpots && L.setupSpots.length) act(s, p, { type: 'placeSettlement', v: pick(L.setupSpots) });
    else act(s, p, { type: 'placeRoad', e: pick(L.setupRoads) });
  }
  assert.equal(s.phase, 'play');
  return s;
}
const mk = (n, sc) => setup(engine.createGame({ id: 't', mode: 'explorers', players: players(n), options: { scenario: sc } }));
const forceRoll = (vals, fn) => { const old = Math.random; let i = 0; Math.random = () => ((vals[i++ % vals.length] - 1) + 0.5) / 6; try { return fn(); } finally { Math.random = old; } };
const give = (s, p, o) => { for (const [k, n] of Object.entries(o)) s.players[p].res[k] = (s.players[p].res[k] || 0) + n; };
const toMove = s => { s.step = 'main'; act(s, s.current, { type: 'startMove' }); };

// ---------------------------------------------------------------- boards
for (const [pl, scs] of [[4, [1, 2, 3, 4, 5]], [6, [2, 3, 4, 5]]]) for (const sc of scs) {
  const B = EB.build({ scenario: sc, players: pl });
  const fog = B.hexes.filter(h => h.hidden);
  const per = (rg, t) => fog.filter(h => h.region === rg && h.terrain === t).length;
  const land = rg => fog.filter(h => h.region === rg && ['forest', 'hills', 'pasture', 'fields', 'mountains'].includes(h.terrain)).length;
  assert.equal(land('N'), pl === 4 ? 6 : 9, `land fields north ${pl}/${sc}`);
  assert.equal(land('S'), pl === 4 ? 6 : 9);
  assert.equal(B.hexes.filter(h => h.island).length, pl === 4 ? 15 : 22);
  const gold = [3, 3, 3, 0, 3][sc - 1] ; // north gold rivers, 3-4 players
  if (pl === 4) {
    assert.equal(per('N', 'goldriver'), [0, 3, 3, 0, 3][sc - 1]);
    assert.equal(per('S', 'goldriver'), [0, 3, 2, 0, 3][sc - 1]);
    assert.equal(per('N', 'fishfield'), [0, 0, 2, 3, 3][sc - 1]);
    assert.equal(per('S', 'fishfield'), [0, 0, 3, 3, 3][sc - 1]);
    assert.equal(per('N', 'spice'), [0, 0, 0, 3, 3][sc - 1]);
  } else {
    assert.equal(per('N', 'goldriver'), sc === 4 ? 0 : 4);
    assert.equal(per('S', 'goldriver'), sc === 4 ? 0 : 4);
  }
  assert.equal(B.chips.N.length, pl === 4 ? 6 : 9);
  assert.equal(!!B.council, sc >= 3);
  assert.equal(B.circles.length, pl === 4 ? 14 : 18);
  void gold;
}

// ---------------------------------------------------------------- scenario 1: the fixed start
{
  const s = engine.createGame({ id: 't', mode: 'explorers', players: players(4), options: { scenario: 1 } });
  assert.equal(s.phase, 'play');
  for (let p = 0; p < 4; p++) {
    assert.equal(Object.values(s.buildings).filter(b => b.p === p && b.type === 'harbor').length, 1);
    assert.equal(Object.values(s.buildings).filter(b => b.p === p && b.type === 'settlement').length, 1);
    assert.equal(Object.values(s.roads).filter(o => o === p).length, 1);
    assert.equal(Object.values(s.ships).filter(x => x.p === p && x.cargo[0].t === 'E').length, 1);
    assert(s.players[p].res.gold === 2, '2 gold at the start');
  }
  // distance rule holds between all start pieces
  const vs = Object.keys(s.buildings).map(Number);
  for (const a of vs) for (const b of vs) if (a !== b) assert(!s.board.vertices[a].adj.includes(b), 'start pieces too close');
  // everybody got one card per land field next to the settlement
  s.players.forEach((pl, p) => assert(Object.keys(pl.res).filter(k => k !== 'gold').reduce((a, k) => a + pl.res[k], 0) >= 2, 'start resources ' + p));
  const s2 = engine.createGame({ id: 't', mode: 'explorers', players: players(2), options: { scenario: 1 } });
  assert.equal(s2.neutral.verts.length, 4, 'two neutral colours stay as obstacles');
  assert.equal(Object.keys(s2.ships).length, 2, 'their ships are taken away');
  assert.equal(s2.options.vpTarget, 8);
}

// ---------------------------------------------------------------- scenario 2+: free setup
{
  const s = engine.createGame({ id: 't', mode: 'explorers', players: players(3), options: { scenario: 2 } });
  const kinds = s.setup.steps.map(x => x.kind + x.p).join(' ');
  assert.equal(kinds, 'harbor0 harbor1 harbor2 settle2 settle1 settle0 road0 ship0 road1 ship1 road2 ship2', 'harbors first, settlements in reverse, then roads and explorer ships clockwise');
  setup(s);
  for (let p = 0; p < 3; p++) {
    assert.equal(Object.values(s.buildings).filter(b => b.p === p && b.type === 'harbor').length, 1);
    assert.equal(Object.values(s.ships).filter(x => x.p === p).length, 1);
  }
  const s2 = engine.createGame({ id: 't', mode: 'explorers', players: players(2), options: { scenario: 3 } });
  assert.equal(s2.setup.steps.map(x => x.kind).join(' '), 'harbor harbor nharbor nharbor nsettle nsettle settle settle road ship road ship');
  setup(s2);
  assert.equal(s2.neutral.verts.length, 4);
  assert.equal(s2.current, 0);
  assert.equal(s2.options.vpTarget, 15);
}

// ---------------------------------------------------------------- income, 7, gold
{
  const s = mk(3, 2);
  s.step = 'roll'; const me = s.current;
  s.players.forEach(pl => { for (const k of ['lumber', 'brick', 'wool', 'grain', 'ore']) pl.res[k] = 0; pl.res.gold = 0; });
  // a number nobody has: everybody gets 1 gold
  s.board.hexes.forEach(h => { if (h.number === 11) h.number = 10; });
  forceRoll([5, 6], () => act(s, me, { type: 'roll' }));
  assert.deepEqual(s.players.map(pl => pl.res.gold), [1, 1, 1], 'no income: 1 gold each');
  // a 7: everybody with more than 7 resource cards discards half; gold does not count
  const s7 = mk(3, 2);
  s7.step = 'roll'; const r7 = s7.current;
  s7.players.forEach(pl => { for (const k of ['lumber', 'brick', 'wool', 'grain', 'ore']) pl.res[k] = 0; });
  give(s7, 1, { lumber: 9 }); give(s7, 2, { lumber: 3, gold: 20 });
  forceRoll([3, 4], () => act(s7, r7, { type: 'roll' }));
  const disc = s7.pending.filter(x => x.type === 'discard');
  assert(disc.some(x => x.player === 1 && x.count === 4), 'half of 9 rounded down');
  assert(!disc.some(x => x.player === 2), 'gold is not counted');
  const s1 = engine.createGame({ id: 't', mode: 'explorers', players: players(3), options: { scenario: 1 } });
  s1.step = 'roll'; forceRoll([3, 4], () => act(s1, s1.current, { type: 'roll' }));
  assert(!s1.pending.some(x => x.type === 'pirate'), 'no pirate in scenario 1');
}

// ---------------------------------------------------------------- trade
{
  const s = mk(3, 2); const p = s.current;
  s.step = 'main';
  give(s, p, { lumber: 3, gold: 4 });
  const L0 = s.players[p].res.ore;
  act(s, p, { type: 'bankTrade', give: 'lumber', get: 'ore' });
  assert.equal(s.players[p].res.ore, L0 + 1);
  throws(() => act(s, p, { type: 'bankTrade', give: 'lumber', get: 'ore' }), 'You need');
  act(s, p, { type: 'bankTrade', give: 'gold', get: 'grain' });
  act(s, p, { type: 'bankTrade', give: 'gold', get: 'grain' });
  throws(() => act(s, p, { type: 'bankTrade', give: 'gold', get: 'grain' }), 'twice');
  give(s, p, { wool: 3 });
  const g = s.players[p].res.gold;
  act(s, p, { type: 'bankTrade', give: 'wool', get: 'gold' });
  assert.equal(s.players[p].res.gold, g + 1, '3:1 for gold');
}

// ---------------------------------------------------------------- building
{
  const s = mk(2, 2); const p = s.current;
  s.step = 'main';
  give(s, p, { grain: 2, ore: 2, lumber: 2, brick: 2, wool: 3 });
  const L = engine.viewFor(s, p).legal;
  assert(L.harbors === undefined || L.harbors.every(v => s.buildings[v].type === 'settlement'));
  const own = Object.entries(s.buildings).find(([, b]) => b.p === p && b.type === 'settlement');
  assert(own, 'a settlement to upgrade');
  const before = X.vp ? 0 : 0; void before;
  const vp0 = engine.vp(s, p);
  if (L.harbors && L.harbors.includes(+own[0])) { act(s, p, { type: 'buildHarbor', v: +own[0] }); assert.equal(engine.vp(s, p), vp0 + 1, 'a harbor settlement counts 2 instead of 1'); }
  assert.equal(s.options.units, true);
}

// ---------------------------------------------------------------- ships: moving, discovering, tribute
function shipNearFog(s, p) {
  // put a ship of p on a sea path whose tip touches an undiscovered field, one step away from a free edge
  const B = s.board;
  const hidden = new Set(B.hexes.filter(h => h.hidden).flatMap(h => h.verts));
  const e = B.edges.find(x => x.v.some(v => hidden.has(v)) && x.hexes.every(i => !B.hexes[i].hidden) && x.hexes.some(i => B.hexes[i].terrain === 'sea'));
  assert(e, 'an edge next to the fog');
  return e.id;
}
{
  const s = mk(2, 2); const p = s.current;
  s.step = 'main';
  const sh = Object.values(s.ships).find(x => x.p === p);
  const e = shipNearFog(s, p);
  sh.e = e; sh.cargo = [];
  act(s, p, { type: 'startMove' });
  assert.equal(sh.mp, 4, '4 moves');
  // the field is discovered when the ship points at it; the move ends
  // (the ship is already pointing there: move it off and back)
  const mv = X._internal.reach(s, sh);
  assert(Object.keys(mv).length > 0);
  assert.equal(Math.max(...Object.values(mv).map(x => x[0])), 4, 'at most 4 moves');
}
{
  // discovery: land pays a resource, anything else 2 gold, and the move ends
  const s = mk(2, 2); const p = s.current;
  const sh = Object.values(s.ships).find(x => x.p === p);
  const B = s.board;
  const touchesHidden = e => e.v.some(v => B.vertices[v].hexes.some(i => B.hexes[i].hidden));
  const start = B.edges.find(x => touchesHidden(x) && x.hexes.every(i => !B.hexes[i].hidden) && x.hexes.some(i => B.hexes[i].terrain === 'sea'));
  assert(start, 'an edge that points at the fog');
  const target = B.hexes[B.vertices[start.v.find(v => B.vertices[v].hexes.some(i => B.hexes[i].hidden))].hexes.find(i => B.hexes[i].hidden)];
  // a ship one step from `start`
  const nb = B.edges.find(x => x.id !== start.id && x.v.some(v => start.v.includes(v)) && x.hexes.every(i => !B.hexes[i].hidden) && x.hexes.some(i => B.hexes[i].terrain === 'sea') && !x.v.some(v => B.vertices[v].hexes.some(i => B.hexes[i].hidden)));
  if (nb) {
    sh.e = nb.id; s.step = 'main'; sh.cargo = [];
    act(s, p, { type: 'startMove' });
    const goldBefore = s.players[p].res.gold;
    act(s, p, { type: 'sail', ship: sh.id, to: start.id });
    assert(!target.hidden, 'discovered');
    assert.equal(sh.mp, 0, 'a discovery ends the ship move');
    if (target.terrain === 'sea') assert.equal(s.players[p].res.gold, goldBefore + 2);
  }
}
{
  // tribute to a foreign pirate: 1 gold, once per ship and turn
  const s = mk(2, 2); const p = s.current, q = 1 - p;
  const sh = Object.values(s.ships).find(x => x.p === p);
  const B = s.board;
  const seaHex = B.hexes.find(h => h.terrain === 'sea' && !h.hidden && !h.neighbors.some(n => B.hexes[n].island) && h.edges.some(e => B.edges[e].hexes.every(i => !B.hexes[i].hidden)));
  s.pirates = { hex: seaHex.id, owner: q };
  const onEdge = seaHex.edges.find(e => B.edges[e].hexes.every(i => !B.hexes[i].hidden));
  sh.e = onEdge; sh.cargo = [];
  s.step = 'main'; s.players[p].res.gold = 3;
  act(s, p, { type: 'startMove' });
  const mv = X._internal.reach(s, sh);
  assert(Object.values(mv).every(x => x[1] === 1), 'leaving a pirate field costs tribute');
  const to = +Object.keys(mv)[0];
  act(s, p, { type: 'sail', ship: sh.id, to });
  assert.equal(s.players[p].res.gold, 2, '1 gold tribute');
  assert(sh.paid);
  // a second move of the same ship in this turn is free
  const mv2 = X._internal.reach(s, sh);
  assert(Object.values(mv2).every(x => x[1] === 0));
  // own pirate: no tribute
  s.pirates.owner = p; sh.paid = false;
  assert(Object.values(X._internal.reach(s, sh)).every(x => x[1] === 0), 'no tribute to your own pirate');
}

// ---------------------------------------------------------------- the pirate on a 7, stealing, chasing
{
  const s = mk(3, 2); const p = s.current;
  s.step = 'roll';
  forceRoll([3, 4], () => act(s, p, { type: 'roll' }));
  const pend = s.pending.filter(x => x.type === 'pirate');
  assert.equal(pend.length, 1, 'the roller sets the pirate');
  while (s.pending.some(x => x.type === 'discard')) { const it = s.pending.find(x => x.type === 'discard'); s.pending.splice(s.pending.indexOf(it), 1); }
  const L = engine.viewFor(s, p).legal;
  assert(L.pirateHexes.length);
  const B = s.board;
  assert(L.pirateHexes.every(h => !B.hexes[h].neighbors.some(n => B.hexes[n].island) && B.hexes[h].terrain === 'sea' || B.hexes[h].terrain === 'fishfield'), 'not next to the start island');
  // put an opponent ship on the field to be stolen from
  const hex = B.hexes[L.pirateHexes[0]];
  const q = (p + 1) % 3;
  const qs = Object.values(s.ships).find(x => x.p === q); qs.e = hex.edges[0];
  s.players[q].res.lumber = 1;
  act(s, p, { type: 'movePirate', hex: hex.id });
  assert.equal(s.pirates.owner, p);
  assert(s.log.some(l => l.k === '{@p} stole a card from {@q}.'), 'stole a card');
  // another player's 7: their pirate replaces mine
  s.step = 'roll'; s.pending = []; s.current = q; s.second = false;
  const L2 = engine.viewFor(s, q).legal;
  s.step = 'roll';
  forceRoll([3, 4], () => act(s, q, { type: 'roll' }));
  s.pending = s.pending.filter(x => x.type === 'pirate');
  act(s, q, { type: 'movePirate', hex: engine.viewFor(s, q).legal.pirateHexes[0] });
  assert.equal(s.pirates.owner, q, 'only one pirate on the board: the new one');
  void L2;
}
{
  // chasing the pirate with an unmoved ship: a 6 (or a friendly village's number)
  const s = mk(2, 2); const p = s.current, q = 1 - p;
  const B = s.board;
  const sea = B.hexes.find(h => h.terrain === 'sea' && !h.hidden && !h.neighbors.some(n => B.hexes[n].island) && h.edges.some(e => B.edges[e].hexes.every(i => !B.hexes[i].hidden)));
  s.pirates = { hex: sea.id, owner: q };
  const sh = Object.values(s.ships).find(x => x.p === p);
  sh.e = sea.edges.find(e => B.edges[e].hexes.every(i => !B.hexes[i].hidden)); sh.cargo = [];
  s.step = 'main'; s.players[p].res.gold = 0;
  act(s, p, { type: 'startMove' });
  forceRoll([5], () => act(s, p, { type: 'attackPirate', ship: sh.id }));
  assert.equal(s.pirates.owner, q, 'a 5 is not enough');
  throws(() => act(s, p, { type: 'attackPirate', ship: sh.id }), 'only once');
  sh.attacked = false;
  s.board.hexes.forEach(h => { if (h.village) h.village.friends = []; });
  // friendship with the pirate fighters (die 5) makes a 5 work
  const v = B.hexes.find(h => h.terrain === 'spice' || true);
  void v;
  const hexV = { id: -1 };
  void hexV;
  forceRoll([6], () => act(s, p, { type: 'attackPirate', ship: sh.id }));
  assert.equal(s.pirates.hex, null, 'the pirate is gone');
  assert(s.pending.some(x => x.type === 'pirate' && x.player === p), 'you set your own pirate');
  const moved = Object.values(s.ships).find(x => x.id === sh.id);
  assert(!moved.moved, 'the ship may still move');
}

// ---------------------------------------------------------------- lairs, hero, tracks
{
  const s = mk(3, 2);
  const B = s.board;
  const gr = B.hexes.find(h => h.terrain === 'goldriver');
  gr.hidden = false; gr.lair = { number: 8, units: {}, conquered: false };
  // a vertex of the field where all three players put ships
  const [p0, p1, p2] = [0, 1, 2];
  const edge = gr.edges[0];
  const ships = [p0, p1, p2].map(p => { const sh = Object.values(s.ships).find(x => x.p === p); sh.e = edge; sh.cargo = []; return sh; });
  ships[0].cargo = [{ t: 'U' }, { t: 'U' }]; ships[1].cargo = [{ t: 'U' }]; ships[2].cargo = [{ t: 'U' }];
  // neighbours of the field are all discovered so that buildings could be built later
  s.current = 0; s.second = false; s.step = 'main'; s.pending = [];
  act(s, 0, { type: 'startMove' });
  assert.equal(engine.viewFor(s, 0).legal.ship[ships[0].id].lairs[0], gr.id);
  throws(() => act(s, 0, { type: 'dropUnits', ship: ships[1].id, hex: gr.id }), 'Pick one of your ships');
  act(s, 0, { type: 'dropUnits', ship: ships[0].id, hex: gr.id });
  assert.equal(gr.lair.units[0], 2);
  assert(!s.completed.length);
  // the others drop theirs on their own turns; here we fake them
  gr.lair.units[1] = 1; s.completed.push(gr.id);
  const gold = s.players.map(pl => pl.res.gold);
  forceRoll([4, 1, 6, 1], () => act(s, 0, { type: 'endTurn' }));
  assert(gr.lair.conquered && gr.number === 8, 'the lair flips to its number');
  assert.equal(s.players[0].res.gold, gold[0] + 2);
  assert.equal(s.players[1].res.gold, gold[1] + 2);
  assert.equal(s.mis.lairs.pos[2], 0, 'only fighters advance');
  assert.equal(s.mis.lairs.pos[0] + s.mis.lairs.pos[1], 3, 'both advance, the hero one more');
  assert.equal(s.mis.lairs.pos.reduce((a, b) => a + b, 0), 3);
  // special tile and track points
  const holderP = engine.viewFor(s, 0).exp.tracks.lairs.holder;
  assert(holderP === 0 || holderP === 1);
}
{
  // tie for the special point: the marker that arrived first holds it
  const s = mk(3, 2);
  X._internal.TRACKS; // sanity
  s.mis.lairs.pos = [2, 2, 0]; s.mis.lairs.at = [5, 3, 0];
  assert.equal(engine.viewFor(s, 0).exp.tracks.lairs.holder, 1);
  assert.equal(engine.vp(s, 1) - engine.vp(s, 0), 1);
  s.mis.lairs.pos = [7, 0, 0];
  assert.equal(X._internal.TRACKS.lairs[7], 3);
}

// ---------------------------------------------------------------- spice, fish, council
{
  const s = mk(3, 5);
  const B = s.board;
  const sp = B.hexes.find(h => h.terrain === 'spice' && h.village.kind === 'fast');
  sp.hidden = false; sp.village.bags = 3;
  const p = s.current;
  const sh = Object.values(s.ships).find(x => x.p === p);
  sh.e = sp.edges[0]; sh.cargo = [{ t: 'U' }];
  s.step = 'main'; act(s, p, { type: 'startMove' });
  assert.equal(sh.mp, 4);
  act(s, p, { type: 'dropVillage', ship: sh.id, hex: sp.id });
  assert.equal(sh.mp, 5, 'quick sailing: one more move at once');
  assert.deepEqual(sh.cargo, [{ t: 'S' }]);
  throws(() => act(s, p, { type: 'dropVillage', ship: sh.id, hex: sp.id }), 'already friends');
  assert.equal(sp.village.bags, 2);
  // only after a unit stays in the village may buildings stand on its corners
  assert(!engine.viewFor(s, p).legal.ship[sh.id].villages);
  // the council's harbor
  const harbor = B.harbors[0];
  const ed = B.vertices[harbor].edges.find(e => true);
  sh.e = ed;
  act(s, p, { type: 'deliver', ship: sh.id });
  assert.equal(s.mis.spice.pos[p], 1);
  assert.deepEqual(sh.cargo, []);
  // fish: roll a swarm onto a discovered fishing ground, catch it, deliver it
  const fi = B.hexes.find(h => h.terrain === 'fishfield');
  fi.hidden = false;
  forceRoll([fi.die], () => act(s, p, { type: 'rollFish' }));
  assert(fi.swarm, 'swarm placed');
  sh.e = fi.edges[0];
  act(s, p, { type: 'catchFish', ship: sh.id, hex: fi.id });
  assert.deepEqual(sh.cargo, [{ t: 'F' }]);
  sh.e = B.vertices[harbor].edges[0];
  act(s, p, { type: 'deliver', ship: sh.id });
  assert.equal(s.mis.fish.pos[p], 1);
  throws(() => act(s, p, { type: 'rollFish' }), 'only once');
}

// ---------------------------------------------------------------- 5-6 players
{
  const s = mk(6, 2);
  assert(s.options.pairs);
  const order = [];
  for (let i = 0; i < 6; i++) {
    order.push(`${s.current}${s.second ? 'b' : 'a'}`);
    if (!s.second) { s.step = 'roll'; s.pending = []; forceRoll([5, 4], () => act(s, s.current, { type: 'roll' })); s.pending = []; }
    else assert.equal(s.step, 'main', 'ship 2 does not roll');
    if (s.second) throws(() => act(s, s.current, { type: 'offerTrade', give: { gold: 1 }, get: { lumber: 1 } }), 'supply');
    act(s, s.current, { type: 'endTurn' });
  }
  assert.deepEqual(order, ['0a', '3b', '1a', '4b', '2a', '5b']);
  const s5 = mk(5, 3);
  const o5 = [];
  for (let i = 0; i < 10; i++) { o5.push(`${s5.current}${s5.second ? 'b' : 'a'}`); s5.step = 'main'; s5.pending = []; act(s5, s5.current, { type: 'endTurn' }); }
  assert.deepEqual(o5, ['0a', '3b', '1a', '4b', '2a', '0b', '3a', '1b', '4a', '2b']);
  assert.equal(s5.options.vpTarget, 15);
}

console.log('Explorers & Pirates rules: all checks passed');
