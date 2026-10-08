'use strict';
// Explorers & Pirates (Entdecker & Piraten), built from the German rulebooks (3-4 players and the 5-6 player extension).
// A standalone engine behind the same five calls as the other games (create, act, view, summary, migrate).
//
// What the book asks for, in short:
//  * a start island and two undiscovered regions (parrots in the north, geese in the south); ships (4 moves a turn) uncover
//    them one field at a time and earn a resource (land) or 2 gold (anything else)
//  * no cities, no development cards, no robber, no harbors and no 4:1 trade: 3:1 with the supply (also for gold),
//    2 gold buy a resource (twice a turn); players with no income on a roll get 1 gold
//  * settlements (1 point) can be upgraded to harbor settlements (2 points) that hold a basin; explorers found settlements
//    from a ship; units fight pirate lairs and trade with the spice villages
//  * a turn: income, trade and build, then the movement phase (move ships, load, unload, discover, found, deliver)
//  * on a 7 a pirate ship (every player has one, only one is ever on the board) is placed and steals; foreign pirates take tribute
//  * scenarios 1-5 add the missions The Pirate Lairs, Fish for Catan and Spices for Catan, each with a track and a special point
//  * 5-6 players: two players are in the turn at once (ship 1 rolls and trades, ship 2 only builds and moves)

const { GameError } = require('./game');
const { shuffle } = require('./board');
const EB = require('./eup-board');

const fail = (msg, params) => { throw new GameError(msg, params); };
const d6 = () => 1 + Math.floor(Math.random() * 6);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const clean = o => Object.fromEntries(Object.entries(o || {}).filter(([, n]) => n > 0));

const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const HAND = [...RES, 'gold'];
const TERRAIN_RES = { forest: 'lumber', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'ore' };
const LAND = Object.keys(TERRAIN_RES);
const COSTS = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  harbor: { grain: 2, ore: 2 },
  ship: { lumber: 1, wool: 1 },
  explorer: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  unit: { wool: 1, ore: 1 },
};
const PIECES = { road: 15, settlement: 5, harbor: 4, ship: 3, explorer: 2, unit: 9 };
const SCEN = {
  1: { vp: 8, missions: [], units: false },
  2: { vp: 12, missions: ['lairs'], units: true },
  3: { vp: 15, missions: ['lairs', 'fish'], units: true },
  4: { vp: 15, missions: ['fish', 'spice'], units: true },
  5: { vp: 17, missions: ['lairs', 'fish', 'spice'], units: true },
};
// points shown on the mission tracks, by marker position (0 = the square start field)
const TRACKS = { lairs: [0, 1, 1, 2, 2, 2, 3, 3], fish: [0, 1, 1, 2, 2, 2, 3, 3], spice: [0, 1, 1, 2, 2, 3, 3] };
const MISSION_NAME = { lairs: 'The Pirate Lairs', fish: 'Fish for Broch', spice: 'Spices for Broch' };
const BASE_MOVES = 4, EXTRA_MOVES = 2, CAPACITY = 2;
const SIZE = { E: 2, F: 2, U: 1, S: 1 }; // explorer, fish swarm, unit, spice bag

const P = (s, i) => s.players[i];
const V = (s, v) => s.board.vertices[v];
const E = (s, e) => s.board.edges[e];
const H = (s, h) => s.board.hexes[h];

function log(s, k, a = {}) {
  s.log.push({ turn: s.turn, k, a, at: Date.now() });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  const n = players.length;
  if (n < 2 || n > 6) fail('Explorers & Pirates is for 2–6 players');
  const big = n > 4;
  let scenario = Math.max(1, Math.min(5, Number(options.scenario) || 2));
  if (big && scenario === 1) scenario = 2; // the 5-6 player book starts with scenario 2
  const sc = SCEN[scenario];
  const board = EB.build({ scenario, players: n, randomIsland: !!options.randomIsland });
  const order = shuffle(players.map((_, i) => i));
  const seats = order.map(i => players[i]);
  const COLORS = ['red', 'blue', 'orange', 'white', 'teal', 'purple'];
  const s = {
    id, mode: 'explorers', kind: 'explorers', expansion: 'none',
    options: { vpTarget: options.vpTarget || sc.vp, scenario, missions: sc.missions.slice(), units: sc.units, pairs: big },
    cards: HAND.slice(), board,
    buildings: {}, roads: {}, knights: {}, ships: {}, shipSeq: 0, neutral: { verts: [], roads: [] },
    players: seats.map((pl, i) => ({
      userId: pl.id, name: pl.name, color: pl.color || COLORS[i], country: pl.country || null,
      res: Object.fromEntries(HAND.map(k => [k, 0])),
    })),
    phase: 'setup', step: null, turn: 0, current: 0, second: false, pair: 0,
    setup: null,
    dice: null, pending: [], pgroup: 0,
    bank: Object.fromEntries(RES.map(r => [r, big ? 24 : 19])),
    trade: null, tradeSeq: 0, flags: {},
    pirates: { hex: null, owner: null },
    fishLeft: sc.missions.includes('fish') ? (big ? 8 : 6) : 0,
    lairPile: [], completed: [],
    mis: {}, misSeq: 0,
    longestRoad: { p: null, len: 0 }, largestArmy: { p: null, count: 0 },
    log: [], chat: [],
    stats: { rolls: Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(k => [k, 0])), gained: seats.map(() => 0), turns: 0 },
    winner: null, startedAt: Date.now(), finishedAt: null, version: 0,
  };
  sc.missions.forEach(k => { s.mis[k] = { pos: seats.map(() => 0), at: seats.map(() => 0) }; });
  if (sc.missions.includes('lairs')) s.lairPile = board.lairNumbers.slice();
  s.players.forEach(pl => { pl.res.gold = 2; });
  const hs = s.board.hexes;
  // the council's base (scenario 3 and up) and its two harbors
  if (board.council != null) hs[board.council].council = true;
  log(s, 'Game started. {@ps} take their seats.', { ps: seats.map((_, i) => i) });
  startSetup(s);
  return s;
}

// ---------------------------------------------------------------- pieces and containers
const sizeOf = cargo => cargo.reduce((a, c) => a + SIZE[c.t], 0);
const roomOf = cargo => CAPACITY - sizeOf(cargo);
const shipsOf = (s, p) => Object.values(s.ships).filter(x => x.p === p);
const ownBuildings = (s, p, type) => Object.entries(s.buildings).filter(([, b]) => b.p === p && (!type || b.type === type)).map(([v]) => +v);

function countPieces(s, p) {
  let settlements = 0, harbors = 0, roads = 0, explorers = 0, units = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) {
    if (b.type === 'harbor') harbors++; else settlements++;
    for (const c of b.cargo || []) { if (c.t === 'E') explorers++; if (c.t === 'U') units++; }
  }
  for (const o of Object.values(s.roads)) if (o === p) roads++;
  let ships = 0;
  for (const sh of Object.values(s.ships)) if (sh.p === p) {
    ships++;
    for (const c of sh.cargo) { if (c.t === 'E') explorers++; if (c.t === 'U') units++; }
  }
  for (const h of s.board.hexes) {
    if (h.lair) units += h.lair.units[p] || 0;
    if (h.units) units += h.units[p] || 0;
    if (h.village && h.village.friends.includes(p)) units++;
  }
  return { settlements, harbors, roads, ships, explorers, units };
}
// explorers that already founded a settlement are gone for good (they went into the supply with the ship), so only
// those standing on the board or in a basin count against the 2 pieces

// ---------------------------------------------------------------- the board's rules
const landish = h => !h.hidden && (LAND.includes(h.terrain) || h.terrain === 'goldriver' || h.terrain === 'spice');
const seaish = h => !h.hidden && (h.terrain === 'sea' || h.terrain === 'fishfield');
const lairOpen = h => h.terrain === 'goldriver' && h.lair && !h.lair.conquered;

// may anybody build on the roads and corners of this field (for player p)?
function hexBlocks(s, h, p) {
  if (h.hidden) return true;
  if (h.terrain === 'goldriver') {
    if (!h.lair || !h.lair.conquered) return true;
    return h.neighbors.some(n => { const o = H(s, n); return o.hidden || lairOpen(o); });
  }
  if (h.terrain === 'spice') return p == null || !h.village.friends.includes(p);
  return false;
}
function vertexBuildable(s, v, p) {
  const hs = V(s, v).hexes.map(i => H(s, i));
  if (hs.some(h => h.hidden)) return false;
  const lands = hs.filter(landish);
  if (!lands.length) return false;
  return !lands.some(h => hexBlocks(s, h, p));
}
function edgeRoadOk(s, e, p) {
  const hs = E(s, e).hexes.map(i => H(s, i));
  if (hs.some(h => h.hidden)) return false;
  const lands = hs.filter(landish);
  if (!lands.length) return false;
  return !lands.some(h => hexBlocks(s, h, p));
}
const neutralAt = (s, v) => s.neutral.verts.includes(v);
const occupied = (s, v) => !!s.buildings[v] || neutralAt(s, v);
const distanceOk = (s, v) => !occupied(s, v) && V(s, v).adj.every(a => !occupied(s, a));
const touchesOwnRoad = (s, v, p) => V(s, v).edges.some(e => s.roads[e] === p);
const foreignAt = (s, v, p) => (s.buildings[v] && s.buildings[v].p !== p) || neutralAt(s, v);
const roadFree = (s, e) => s.roads[e] === undefined && !s.neutral.roads.includes(e);

// sea paths: the edges of sea fields and the edges where the frame meets sea or land
function shipEdgeOk(s, e) {
  const hs = E(s, e).hexes.map(i => H(s, i));
  if (hs.length === 1) return !hs[0].hidden;
  return hs.some(seaish);
}
const edgeTouchesFog = (s, e) => E(s, e).v.some(v => V(s, v).hexes.some(i => H(s, i).hidden));
const shipsOnEdge = (s, e) => Object.values(s.ships).filter(x => x.e === e).length;
function shipBuildable(s, e) {
  if (!shipEdgeOk(s, e)) return false;
  if (E(s, e).hexes.some(i => H(s, i).hidden)) return false; // never next to an undiscovered field
  return shipsOnEdge(s, e) < 2;
}
const adjEdges = (s, e) => E(s, e).v.flatMap(v => V(s, v).edges.filter(x => x !== e));

function legalRoads(s, p) {
  return s.board.edges.filter(e => {
    if (!roadFree(s, e.id) || !edgeRoadOk(s, e.id, p)) return false;
    return e.v.some(v => {
      const b = s.buildings[v];
      if (b && b.p === p) return true;
      if (foreignAt(s, v, p)) return false;
      return touchesOwnRoad(s, v, p);
    });
  }).map(e => e.id);
}
function legalSettlements(s, p) {
  return s.board.vertices.filter(v => distanceOk(s, v.id) && vertexBuildable(s, v.id, p) && touchesOwnRoad(s, v.id, p)).map(v => v.id);
}
// a settlement may become a harbor settlement when it stands on a coast (it touches a sea field)
const isCoast = (s, v) => V(s, v).hexes.some(i => seaish(H(s, i)));
function legalUpgrades(s, p) {
  return ownBuildings(s, p, 'settlement').filter(v => isCoast(s, v));
}
function legalShipBuilds(s, p) {
  const out = new Set();
  for (const v of ownBuildings(s, p, 'harbor')) for (const e of V(s, v).edges) if (shipBuildable(s, e)) out.add(e);
  return [...out];
}
// where a new explorer or unit can be put: the basin of an own harbor, or a ship next to one
function legalCargoTargets(s, p, item) {
  const need = SIZE[item];
  const out = [];
  for (const v of ownBuildings(s, p, 'harbor')) out.push({ kind: 'harbor', v, room: roomOf(s.buildings[v].cargo) >= need });
  for (const sh of shipsOf(s, p)) {
    if (E(s, sh.e).v.some(v => s.buildings[v] && s.buildings[v].p === p && s.buildings[v].type === 'harbor')) out.push({ kind: 'ship', id: sh.id, room: roomOf(sh.cargo) >= need });
  }
  return out;
}

// ---------------------------------------------------------------- scoring
function missionVp(s, k, p) {
  const m = s.mis[k];
  if (!m) return 0;
  let v = TRACKS[k][m.pos[p]];
  if (holder(s, k) === p) v += 1;
  return v;
}
// the special point goes to the marker that is furthest ahead; on a tie the one at the bottom of the stack (it arrived first)
function holder(s, k) {
  const m = s.mis[k];
  if (!m) return null;
  const top = Math.max(...m.pos);
  if (top < 1) return null;
  let best = null;
  m.pos.forEach((x, p) => { if (x === top && (best === null || m.at[p] < m.at[best])) best = p; });
  return best;
}
function advance(s, k, p, n = 1) {
  const m = s.mis[k];
  if (!m) return;
  const max = TRACKS[k].length - 1;
  for (let i = 0; i < n; i++) {
    if (m.pos[p] >= max) break;
    m.pos[p]++; m.at[p] = ++s.misSeq;
  }
  log(s, '{@p} moves ahead on the mission "{#m}" ({n}).', { p, m: MISSION_NAME[k], n: m.pos[p] });
}
function vp(s, p) {
  let pts = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) pts += b.type === 'harbor' ? 2 : 1;
  for (const k of Object.keys(s.mis)) pts += missionVp(s, k, p);
  return pts;
}
function breakdown(s, p) {
  const c = countPieces(s, p);
  const mis = {};
  for (const k of Object.keys(s.mis)) mis[k] = missionVp(s, k, p);
  return { settlements: c.settlements, harbors: c.harbors, missions: mis, total: vp(s, p) };
}
function checkWin(s) {
  if (s.phase !== 'play' || s.winner !== null) return;
  const p = s.current;
  if (vp(s, p) >= s.options.vpTarget) {
    s.phase = 'over'; s.winner = p; s.finishedAt = Date.now(); s.pending = []; s.trade = null;
    log(s, '{@p} wins with {n} victory points!', { p, n: vp(s, p) });
    snapshot(s, true);
  }
}
function snapshot(s, final = false) {
  if (!s.track) s.track = [];
  s.track.push({ t: s.turn, p: s.current, d: s.dice ? s.dice.total : null, vp: s.players.map((_, i) => vp(s, i)), c: s.players.map(pl => handCount(pl)), g: s.stats.gained.slice() });
  if (s.track.length > 600) s.track.splice(0, s.track.length - 600);
}

// ---------------------------------------------------------------- cards
const handCount = pl => RES.reduce((a, k) => a + pl.res[k], 0);
const has = (pl, cost) => Object.entries(cost).every(([k, n]) => pl.res[k] >= n);
function pay(s, pl, cost) {
  for (const [k, n] of Object.entries(cost)) { pl.res[k] -= n; if (s.bank[k] !== undefined) s.bank[k] += n; }
}
function take(s, pl, k, n) {
  if (k === 'gold') { pl.res.gold += n; return n; }
  const got = Math.min(n, s.bank[k]);
  s.bank[k] -= got; pl.res[k] += got;
  return got;
}
function moveCard(from, to, k, n = 1) { const m = Math.min(n, from.res[k]); from.res[k] -= m; to.res[k] += m; return m; }
function validCards(obj, keys) {
  return !!obj && typeof obj === 'object' && Object.entries(obj).every(([k, n]) => keys.includes(k) && Number.isInteger(n) && n >= 0);
}
function randomCard(pl) {
  const pool = [];
  for (const k of RES) for (let i = 0; i < pl.res[k]; i++) pool.push(k);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// ---------------------------------------------------------------- pending decisions (7s, pirates)
function pushPending(s, items, front = false) {
  if (!items.length) return;
  const g = ++s.pgroup;
  items.forEach(it => { it.group = g; });
  if (front) s.pending.unshift(...items); else s.pending.push(...items);
}
const activePending = s => (s.pending.length ? s.pending.filter(it => it.group === s.pending[0].group) : []);
const findPending = (s, p, type) => activePending(s).find(it => it.player === p && (!type || it.type === type));
const resolvePending = (s, item) => { s.pending.splice(s.pending.indexOf(item), 1); };

// ---------------------------------------------------------------- turn order
// With 5-6 players two people play at once: ship 1 (rolls the dice, trades with everyone) and, 3 seats to the left, ship 2
// (builds and moves, trades only with the supply). Both tokens then pass to the left.
function pairOrder(s, k) { const n = s.players.length; return [k % n, (k + 3) % n]; }
function beginTurn(s) {
  s.flags = { goldBuys: 0, goodGold: 0, fishRolled: false };
  s.trade = null;
  s.completed = [];
  s.step = s.second ? 'main' : 'roll';
  if (!s.second) s.dice = null;
}
function nextTurn(s) {
  snapshot(s);
  const n = s.players.length;
  if (s.options.pairs) {
    if (!s.second) { s.second = true; s.current = pairOrder(s, s.pair)[1]; }
    else { s.second = false; s.pair++; s.current = pairOrder(s, s.pair)[0]; }
  } else s.current = (s.current + 1) % n;
  s.turn++; s.stats.turns++;
  beginTurn(s);
  checkWin(s);
}

// ---------------------------------------------------------------- setup
function startSetup(s) {
  const n = s.players.length, sc = s.options.scenario;
  const all = [...Array(n).keys()];
  s.setup = { steps: [], idx: 0, need: 'settlement', kind: 'harbor', last: null, round: 1 };
  if (sc === 1 && s.board.fixedStart) {
    // scenario 1 is not set up freely: everybody gets the pieces shown in the picture
    const slots = s.board.fixedStart;
    slots.forEach((slot, i) => {
      if (i < n) {
        s.buildings[slot.settlement] = { p: i, type: 'settlement' };
        s.buildings[slot.harbor] = { p: i, type: 'harbor', cargo: [] };
        s.roads[slot.road] = i;
        const ship = newShip(s, i, slot.ship);
        ship.cargo.push({ t: 'E' });
      } else if (n === 2) {
        // pieces of colours nobody plays stay on the island as obstacles (only their ships are taken away)
        s.neutral.verts.push(slot.settlement, slot.harbor);
        s.neutral.roads.push(slot.road);
      }
    });
    all.forEach(p => startResources(s, p, slots[p].settlement));
    return beginPlay(s);
  }
  const steps = [];
  all.forEach(p => steps.push({ p, kind: 'harbor' }));
  if (n === 2) {
    steps.push({ p: 0, kind: 'nharbor' }, { p: 1, kind: 'nharbor' });
    steps.push({ p: 1, kind: 'nsettle' }, { p: 0, kind: 'nsettle' });
  }
  [...all].reverse().forEach(p => steps.push({ p, kind: 'settle' }));
  all.forEach(p => { steps.push({ p, kind: 'road' }); steps.push({ p, kind: 'ship' }); });
  s.setup.steps = steps;
  setStep(s);
}
function setStep(s) {
  const st = s.setup.steps[s.setup.idx];
  s.current = st.p;
  s.setup.kind = st.kind;
  s.setup.need = st.kind === 'road' ? 'road' : 'settlement';
  s.setup.round = s.setup.idx < s.players.length ? 1 : 2;
}
function setupSpots(s) {
  const kind = s.setup.kind, p = s.current;
  const isl = new Set(s.board.hexes.filter(h => h.island).flatMap(h => h.verts));
  if (kind === 'harbor' || kind === 'nharbor') return s.board.circles.filter(v => distanceOk(s, v));
  if (kind === 'settle' || kind === 'nsettle') return [...isl].filter(v => distanceOk(s, v));
  return [];
}
function setupEdges(s) {
  const kind = s.setup.kind, p = s.current;
  if (kind === 'road') {
    const v = lastOf(s, p, 'settlement');
    return V(s, v).edges.filter(e => roadFree(s, e) && edgeRoadOk(s, e, p));
  }
  if (kind === 'ship') {
    const v = lastOf(s, p, 'harbor');
    return V(s, v).edges.filter(e => shipBuildable(s, e));
  }
  return [];
}
const lastOf = (s, p, type) => {
  const vs = ownBuildings(s, p, type);
  return vs[vs.length - 1];
};
function startResources(s, p, v) {
  const got = {};
  for (const hi of V(s, v).hexes) {
    const r = TERRAIN_RES[H(s, hi).terrain];
    if (r && !H(s, hi).hidden) { const g = take(s, P(s, p), r, 1); if (g) got[r] = (got[r] || 0) + g; }
  }
  if (sum(got)) log(s, '{@p} receives {$c}.', { p, c: got });
}
function beginPlay(s) {
  s.phase = 'play'; s.setup = null;
  s.turn = 1; s.stats.turns = 1; s.pair = 0; s.second = false;
  s.current = s.options.pairs ? pairOrder(s, 0)[0] : 0;
  s.track = [];
  beginTurn(s);
  snapshot(s); s.track[0].t = 0;
  log(s, 'Setup complete. {@p} begins.', { p: s.current });
}
function newShip(s, p, e) {
  const id = ++s.shipSeq;
  s.ships[id] = { id, p, e, cargo: [], mp: 0, paid: false, moved: false, attacked: false, extended: false };
  return s.ships[id];
}

// ---------------------------------------------------------------- dice and income
function roll(s) {
  const red = d6(), yellow = d6(), total = red + yellow;
  s.dice = { red, yellow, total, event: null };
  s.stats.rolls[total]++;
  s.step = 'main';
  log(s, '{@p} rolled {n}.', { p: s.current, n: total });
  if (total === 7) handleSeven(s);
  else produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  const gold = s.players.map(() => 0);
  for (const h of s.board.hexes) {
    if (h.number !== total || h.hidden) continue;
    if (h.terrain === 'goldriver') {
      if (!h.lair || !h.lair.conquered) continue;
      for (const v of h.verts) { const b = s.buildings[v]; if (b) gold[b.p] += 2; }
      continue;
    }
    const r = TERRAIN_RES[h.terrain];
    if (!r) continue;
    for (const v of h.verts) { const b = s.buildings[v]; if (b) want[b.p][r] = (want[b.p][r] || 0) + 1; }
  }
  for (const r of RES) {
    const takers = want.map((w, p) => [p, w[r] || 0]).filter(([, k]) => k > 0);
    if (takers.reduce((a, [, k]) => a + k, 0) > s.bank[r] && takers.length > 1) {
      takers.forEach(([p]) => { delete want[p][r]; });
      log(s, 'The bank ran short of {#r}; nobody receives it.', { r });
    }
  }
  const got = s.players.map(() => false);
  want.forEach((w, p) => {
    const g = {};
    for (const [k, n] of Object.entries(w)) { const m = take(s, P(s, p), k, n); if (m) { g[k] = m; got[p] = true; s.stats.gained[p] += m; } }
    if (sum(g)) log(s, '{@p} receives {$c}.', { p, c: g });
  });
  gold.forEach((n, p) => { if (n) { P(s, p).res.gold += n; log(s, '{@p} earns {n} gold from the gold rivers.', { p, n }); } });
  // everybody who got no resources for this number is paid 1 gold
  s.players.forEach((pl, p) => { if (!got[p]) { pl.res.gold += 1; log(s, '{@p} receives {$c}.', { p, c: { gold: 1 } }); } });
}
function handleSeven(s) {
  const items = [];
  s.players.forEach((pl, p) => { const h = handCount(pl); if (h > 7) items.push({ type: 'discard', player: p, count: Math.floor(h / 2) }); });
  pushPending(s, items);
  if (s.options.units) {
    if (pirateHexes(s, s.current).length) pushPending(s, [{ type: 'pirate', player: s.current }]);
  } else log(s, 'No pirates sail in this scenario.');
}

// ---------------------------------------------------------------- the pirate ship
function pirateHexes(s, p) {
  return s.board.hexes.filter(h => {
    if (!seaish(h) || h.council) return false;
    if (h.neighbors.some(n => H(s, n).island)) return false;
    if (s.pirates.owner === p && s.pirates.hex === h.id) return false;
    return true;
  }).map(h => h.id);
}
function placePirate(s, p, hex) {
  const old = s.pirates;
  if (old.hex != null && old.owner !== p) log(s, "{@p}'s pirate ship is sent home.", { p: old.owner });
  s.pirates = { hex, owner: p };
  const h = H(s, hex);
  log(s, '{@p} sets the pirate ship on a new field.', { p, h: hex });
  if (h.swarm) { h.swarm = false; s.fishLeft++; log(s, 'The fish swarm is scared away by the pirates.'); }
  // steal from somebody with a ship on the field
  const prey = [...new Set(Object.values(s.ships).filter(x => H(s, hex).edges.includes(x.e) && x.p !== p).map(x => x.p))]
    .filter(q => handCount(P(s, q)) > 0 || P(s, q).res.gold > 0);
  if (prey.length === 1) steal(s, p, prey[0]);
  else if (prey.length > 1) pushPending(s, [{ type: 'steal', player: p, options: prey }], true);
}
function steal(s, p, q) {
  const card = randomCard(P(s, q));
  if (card) {
    moveCard(P(s, q), P(s, p), card, 1);
    log(s, '{@p} stole a card from {@q}.', { p, q });
    s.lastSteal = { by: p, from: q, card, at: Date.now() };
  } else if (P(s, q).res.gold > 0) {
    moveCard(P(s, q), P(s, p), 'gold', 1);
    log(s, '{@p} takes 1 gold from {@q}.', { p, q });
  }
}

// ---------------------------------------------------------------- discovering
function discover(s, p, e) {
  const found = [];
  for (const v of E(s, e).v) for (const hi of V(s, v).hexes) { const h = H(s, hi); if (h.hidden && !found.includes(h)) found.push(h); }
  for (const h of found) {
    h.hidden = false;
    const pl = P(s, p);
    if (LAND.includes(h.terrain)) {
      h.number = s.board.chips[h.region].pop();
      log(s, '{@p} discovers land: {#t}.', { p, t: h.terrain, h: h.id });
      const r = TERRAIN_RES[h.terrain];
      if (take(s, pl, r, 1)) { s.stats.gained[p]++; log(s, '{@p} receives {$c}.', { p, c: { [r]: 1 } }); }
      continue;
    }
    if (h.terrain === 'sea') log(s, '{@p} sails into open water.', { p, h: h.id });
    else if (h.terrain === 'fishfield') log(s, '{@p} discovers a fishing ground.', { p, h: h.id });
    else if (h.terrain === 'spice') {
      log(s, '{@p} discovers a spice island.', { p, h: h.id });
      h.village.bags = s.players.length;
    } else if (h.terrain === 'goldriver') {
      log(s, '{@p} discovers a gold river.', { p, h: h.id });
      if (s.options.missions.includes('lairs') && s.lairPile.length) h.lair = { number: s.lairPile.pop(), units: {}, conquered: false };
      else h.number = null;
    }
    pl.res.gold += 2;
    log(s, '{@p} receives {$c}.', { p, c: { gold: 2 } });
  }
  return found.length;
}

// ---------------------------------------------------------------- moving ships
function friends(s, p) {
  const f = { fast: 0, gold: 0, pirate: [] };
  for (const h of s.board.hexes) if (h.village && h.village.friends.includes(p)) {
    if (h.village.kind === 'fast') f.fast++;
    else if (h.village.kind === 'gold') f.gold++;
    else f.pirate.push(h.village.die);
  }
  return f;
}
// every edge this ship can reach this turn: { edge: [moves used, pays tribute] }
function reach(s, ship) {
  const p = ship.p;
  if (ship.mp <= 0) return {};
  const foreign = s.pirates.hex != null && s.pirates.owner !== p;
  const pe = foreign ? new Set(H(s, s.pirates.hex).edges) : new Set();
  const flag = e => (!ship.paid && pe.has(e) ? 1 : 0);
  const best = new Map();
  const key = (e, f) => e * 2 + f;
  const start = ship.e;
  const q = [[start, flag(start), 0]];
  best.set(key(start, flag(start)), 0);
  while (q.length) {
    const [e, f, c] = q.shift();
    if (c >= ship.mp) continue;
    if (c > 0 && edgeTouchesFog(s, e)) continue; // a discovery ends the move
    for (const n of adjEdges(s, e)) {
      if (!shipEdgeOk(s, n)) continue;
      const nf = f || flag(n);
      const k = key(n, nf);
      if (best.has(k)) continue;
      best.set(k, c + 1);
      q.push([n, nf, c + 1]);
    }
  }
  const out = {};
  const gold = P(s, p).res.gold;
  for (let e = 0; e < s.board.edges.length; e++) {
    if (e === start || shipsOnEdge(s, e) >= 2) continue;
    const free = best.get(key(e, 0)), paid = best.get(key(e, 1));
    if (free !== undefined) out[e] = [free, 0];
    else if (paid !== undefined && gold >= 1) out[e] = [paid, 1];
  }
  return out;
}
const tipsAt = (s, ship) => E(s, ship.e).v;
const tipOnHex = (s, ship, h) => tipsAt(s, ship).some(v => h.verts.includes(v));

// ---------------------------------------------------------------- missions: conquering lairs
function resolveConquests(s) {
  const lairs = s.completed.slice();
  s.completed = [];
  const n = s.players.length;
  for (const hid of lairs) {
    const h = H(s, hid);
    const order = [];
    for (let i = 0; i < n; i++) { const p = (s.current + i) % n; if ((h.lair.units[p] || 0) > 0) order.push(p); }
    log(s, 'The pirate lair is conquered!');
    order.forEach(p => { P(s, p).res.gold += 2; log(s, '{@p} receives {$c}.', { p, c: { gold: 2 } }); advance(s, 'lairs', p); });
    // the hero: everybody rolls one die and adds the units they have there; the best loses a unit but moves one more field
    let tied = order.slice();
    let hero = tied[0];
    if (order.length > 1) {
      for (let guard = 0; guard < 20; guard++) {
        const score = tied.map(p => { const d = d6(); const u = h.lair.units[p]; log(s, '{@p} rolls {n} and has {m} units there.', { p, n: d, m: u }); return { p, tot: d + u, u }; });
        const top = Math.max(...score.map(x => x.tot));
        let c = score.filter(x => x.tot === top);
        if (c.length > 1) { const mu = Math.max(...c.map(x => x.u)); c = c.filter(x => x.u === mu); }
        if (c.length === 1) { hero = c[0].p; break; }
        tied = c.map(x => x.p);
      }
    }
    log(s, '{@p} is the hero of the battle.', { p: hero });
    h.lair.units[hero]--;
    advance(s, 'lairs', hero);
    h.lair.conquered = true;
    h.number = h.lair.number;
    h.units = Object.fromEntries(Object.entries(h.lair.units).filter(([, k]) => k > 0));
  }
}

// ---------------------------------------------------------------- helpers for actions
const isRoller = (s, p) => p === s.current && !s.second;
function requireTurn(s, p) {
  if (s.phase !== 'play' || s.pending.length || p !== s.current) fail('Not allowed right now.');
}
function requireBuild(s, p) {
  requireTurn(s, p);
  if (s.step !== 'main') fail('Not allowed right now.');
}
function requireMove(s, p) {
  requireTurn(s, p);
  if (s.step !== 'move') fail('That is only possible in the movement phase.');
}
function ownShip(s, p, id) {
  const sh = s.ships[id];
  if (!sh || sh.p !== p) fail('Pick one of your ships.');
  return sh;
}

function endTurn(s) {
  if (s.completed.length) resolveConquests(s);
  checkWin(s); // points from a conquest count in the turn that ends
  if (s.phase === 'play') nextTurn(s);
}

// ---------------------------------------------------------------- handlers
const HANDLERS = {
  chat(s, p, a) {
    const text = String(a.text || '').slice(0, 300).trim();
    if (!text) return;
    s.chat.push({ p, text, at: Date.now() });
    if (s.chat.length > 150) s.chat.shift();
    s.version--;
  },
  // ---- setup
  placeSettlement(s, p, a) {
    if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'settlement' || !['harbor', 'settle', 'nharbor', 'nsettle'].includes(s.setup.kind)) fail('Not your placement.');
    if (!setupSpots(s).includes(a.v)) fail('Too close to another building.');
    const kind = s.setup.kind;
    if (kind === 'harbor') { s.buildings[a.v] = { p, type: 'harbor', cargo: [] }; log(s, '{@p} placed a harbor settlement.', { p }); }
    else if (kind === 'settle') { s.buildings[a.v] = { p, type: 'settlement' }; log(s, '{@p} placed a settlement.', { p }); }
    else { s.neutral.verts.push(a.v); log(s, '{@p} places a neutral piece.', { p }); }
    advanceSetup(s);
  },
  placeRoad(s, p, a) {
    if (s.phase !== 'setup' || p !== s.current || !['road', 'ship'].includes(s.setup.kind)) fail('Not your placement.');
    if (!setupEdges(s).includes(a.e)) fail(s.setup.kind === 'ship' ? 'The ship goes on a sea path next to your harbor settlement.' : 'The road must touch your new building.');
    if (s.setup.kind === 'road') { s.roads[a.e] = p; log(s, '{@p} built a road.', { p }); }
    else { const sh = newShip(s, p, a.e); sh.cargo.push({ t: 'E' }); log(s, '{@p} sets out with an explorer ship.', { p }); }
    advanceSetup(s);
  },
  // ---- turn
  roll(s, p) {
    requireTurn(s, p);
    if (s.step !== 'roll' || !isRoller(s, p)) fail('Already rolled.');
    roll(s);
    checkWin(s);
  },
  startMove(s, p) {
    requireBuild(s, p);
    s.step = 'move'; s.trade = null;
    const f = friends(s, p);
    for (const sh of shipsOf(s, p)) Object.assign(sh, { mp: BASE_MOVES + f.fast, paid: false, moved: false, attacked: false, extended: false });
    log(s, '{@p} begins the movement phase.', { p });
  },
  endTurn(s, p) {
    requireTurn(s, p);
    if (s.step === 'roll') fail('Roll the dice first.');
    endTurn(s);
  },
  // ---- building
  buildRoad(s, p, a) {
    requireBuild(s, p);
    if (countPieces(s, p).roads >= PIECES.road) fail('No roads left.');
    if (!legalRoads(s, p).includes(a.e)) fail('You cannot build a road there.');
    if (!has(P(s, p), COSTS.road)) fail('Not enough resources.');
    pay(s, P(s, p), COSTS.road);
    s.roads[a.e] = p;
    log(s, '{@p} built a road.', { p });
  },
  buildSettlement(s, p, a) {
    requireBuild(s, p);
    if (countPieces(s, p).settlements >= PIECES.settlement) fail('No settlements left.');
    if (!legalSettlements(s, p).includes(a.v)) fail('You cannot build a settlement there.');
    if (!has(P(s, p), COSTS.settlement)) fail('Not enough resources.');
    pay(s, P(s, p), COSTS.settlement);
    s.buildings[a.v] = { p, type: 'settlement' };
    log(s, '{@p} built a settlement.', { p });
  },
  buildHarbor(s, p, a) {
    requireBuild(s, p);
    if (countPieces(s, p).harbors >= PIECES.harbor) fail('No harbor settlements left.');
    if (!legalUpgrades(s, p).includes(a.v)) fail('Upgrade one of your settlements on a coast.');
    if (!has(P(s, p), COSTS.harbor)) fail('Not enough resources.');
    pay(s, P(s, p), COSTS.harbor);
    s.buildings[a.v] = { p, type: 'harbor', cargo: [] };
    log(s, '{@p} built a harbor settlement.', { p });
  },
  buildShip(s, p, a) {
    requireBuild(s, p);
    const mine = shipsOf(s, p);
    let old = null;
    if (mine.length >= PIECES.ship) {
      if (a.remove == null) fail('All your ships are on the board. Pick one to take back.');
      old = ownShip(s, p, a.remove);
      delete s.ships[old.id]; // taken off for the check; put back if the new spot is no good
    }
    if (!legalShipBuilds(s, p).includes(a.e) || !has(P(s, p), COSTS.ship)) {
      if (old) s.ships[old.id] = old;
      fail(!has(P(s, p), COSTS.ship) ? 'Not enough resources.' : 'The ship goes on a sea path next to one of your harbor settlements.');
    }
    if (old && old.cargo.length) log(s, "The cargo of {@p}'s ship is lost.", { p });
    pay(s, P(s, p), COSTS.ship);
    newShip(s, p, a.e);
    log(s, '{@p} built a ship.', { p });
  },
  buildExplorer(s, p, a) { buildFigure(s, p, a, 'E'); },
  buildUnit(s, p, a) {
    if (!s.options.units) fail('There are no units in this scenario.');
    buildFigure(s, p, a, 'U');
  },
  // ---- trading
  offerTrade(s, p, a) {
    requireBuild(s, p);
    if (!isRoller(s, p)) fail('With ship 2 you trade only with the supply, not with the other players.');
    if (!validCards(a.give, HAND) || !validCards(a.get, HAND) || !sum(a.give) || !sum(a.get)) fail('Set up both sides of the trade.');
    if (!has(P(s, p), a.give)) fail('You do not have those cards.');
    s.trade = { id: ++s.tradeSeq, from: p, give: clean(a.give), get: clean(a.get), responses: {}, counters: {} };
    log(s, '{@p} offers {$g} for {$w}.', { p, g: clean(a.give), w: clean(a.get) });
  },
  respondTrade(s, p, a) {
    const t = s.trade;
    if (!t || t.id !== a.id || p === t.from) fail('No such offer.');
    if (a.accept && !has(P(s, p), t.get)) fail('You do not have the requested cards.');
    t.responses[p] = a.accept ? 'accept' : 'reject';
  },
  counterTrade(s, p, a) {
    const t = s.trade;
    if (!t || t.id !== a.id || p === t.from) fail('No such offer.');
    if (!validCards(a.give, HAND) || !validCards(a.get, HAND) || !sum(a.give) || !sum(a.get)) fail('Set up both sides of the trade.');
    if (!has(P(s, p), a.give)) fail('You do not have those cards.');
    (t.counters = t.counters || {})[p] = { give: clean(a.get), get: clean(a.give) };
    t.responses[p] = 'counter';
    log(s, '{@p} counters: gives {$g} for {$w}.', { p, g: clean(a.give), w: clean(a.get) });
  },
  confirmTrade(s, p, a) {
    requireBuild(s, p);
    const t = s.trade;
    if (!t || t.from !== p) fail('That player has not accepted.');
    const r = t.responses[a.with];
    if (r !== 'accept' && r !== 'counter') fail('That player has not accepted.');
    const x = r === 'counter' ? t.counters[a.with] : t; // a counter-offer carries its own terms
    const me = P(s, p), them = P(s, a.with);
    if (!has(me, x.give) || !has(them, x.get)) fail('Someone no longer has the cards.');
    for (const [k, n] of Object.entries(x.give)) moveCard(me, them, k, n);
    for (const [k, n] of Object.entries(x.get)) moveCard(them, me, k, n);
    log(s, '{@p} traded {$g} with {@q} for {$w}.', { p, q: a.with, g: x.give, w: x.get });
    s.trade = null;
  },
  cancelTrade(s, p) {
    if (!s.trade || s.trade.from !== p) fail('No offer to cancel.');
    s.trade = null;
  },
  // 3 identical resources buy 1 other resource or 1 gold; 2 gold buy 1 resource (twice a turn)
  bankTrade(s, p, a) {
    requireBuild(s, p);
    const pl = P(s, p), give = a.give, get = a.get;
    if (!HAND.includes(give) || !HAND.includes(get) || give === get) fail('Pick what to give and what to get.');
    if (give === 'gold') {
      if (get === 'gold') fail('Pick what to give and what to get.');
      if (s.flags.goldBuys >= 2) fail('You can buy only twice per turn with gold.');
      if (pl.res.gold < 2) fail('You need 2 gold.');
      if (s.bank[get] < 1) fail('The bank does not have that.');
      pl.res.gold -= 2; s.flags.goldBuys++;
      take(s, pl, get, 1);
      log(s, '{@p} buys {$c} for 2 gold.', { p, c: { [get]: 1 } });
      return;
    }
    if (pl.res[give] < 3) fail('You need {$c}.', { c: { [give]: 3 } });
    if (get !== 'gold' && s.bank[get] < 1) fail('The bank does not have that.');
    pay(s, pl, { [give]: 3 });
    take(s, pl, get, 1);
    log(s, '{@p} traded {$g} with the bank for {$w}.', { p, g: { [give]: 3 }, w: { [get]: 1 } });
  },
  // the villages "Good Gold": 1 resource for 1 gold, once per friendly village and turn
  goodGold(s, p, a) {
    requireBuild(s, p);
    if (!RES.includes(a.res)) fail('Pick a resource.');
    if (s.flags.goodGold >= friends(s, p).gold) fail('The gold traders do not take more from you this turn.');
    if (P(s, p).res[a.res] < 1) fail('You do not have that.');
    pay(s, P(s, p), { [a.res]: 1 });
    P(s, p).res.gold += 1; s.flags.goodGold++;
    log(s, '{@p} sells {$c} to the gold traders for 1 gold.', { p, c: { [a.res]: 1 } });
  },
  discard(s, p, a) {
    const it = findPending(s, p, 'discard');
    if (!it) fail('Nothing to discard.');
    if (!validCards(a.cards, RES) || sum(a.cards) !== it.count) fail('Choose exactly {n} cards.', { n: it.count });
    if (!has(P(s, p), a.cards)) fail('You do not have those cards.');
    pay(s, P(s, p), a.cards);
    log(s, '{@p} discarded cards: {n}.', { p, n: it.count });
    resolvePending(s, it);
  },
  movePirate(s, p, a) {
    const it = findPending(s, p, 'pirate');
    if (!it) fail('You are not moving the pirate.');
    if (!pirateHexes(s, p).includes(a.hex)) fail('Pirates cannot go there.');
    resolvePending(s, it);
    placePirate(s, p, a.hex);
  },
  steal(s, p, a) {
    const it = findPending(s, p, 'steal');
    if (!it || !it.options.includes(a.from)) fail('Choose someone next to the pirate.');
    resolvePending(s, it);
    steal(s, p, a.from);
  },
  // ---- movement phase
  sail(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship);
    const r = reach(s, ship)[a.to];
    if (!r) fail('That ship cannot go there.');
    if (r[1]) { P(s, p).res.gold -= 1; ship.paid = true; log(s, '{@p} pays 1 gold tribute to the pirates.', { p }); }
    ship.mp -= r[0]; ship.e = a.to; ship.moved = true;
    log(s, '{@p} sailed a ship to a new spot.', { p });
    if (edgeTouchesFog(s, ship.e)) { if (discover(s, p, ship.e)) ship.mp = 0; }
  },
  buyMoves(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship);
    if (ship.extended) fail('Each ship can buy extra moves only once per turn.');
    if (!has(P(s, p), { wool: 1 })) fail('You need 1 wool.');
    pay(s, P(s, p), { wool: 1 });
    ship.mp += EXTRA_MOVES; ship.extended = true;
    log(s, '{@p} pays 1 wool for 2 more moves.', { p });
  },
  rollFish(s, p) {
    requireMove(s, p);
    if (!s.options.missions.includes('fish')) fail('There is no fishing in this scenario.');
    if (s.flags.fishRolled) fail('You can try to roll in a swarm only once per turn.');
    s.flags.fishRolled = true;
    const d = d6();
    const h = s.board.hexes.find(x => x.terrain === 'fishfield' && x.die === d && !x.hidden);
    log(s, '{@p} rolls a {n} for the fish.', { p, n: d });
    if (!h || h.swarm || (s.pirates.hex === h.id) || s.fishLeft < 1) { log(s, 'No fish swarm appears.'); return; }
    h.swarm = true; s.fishLeft--;
    log(s, 'A fish swarm appears.', { h: h.id });
  },
  catchFish(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship), h = H(s, a.hex);
    if (!h || !h.swarm || !tipOnHex(s, ship, h)) fail('There is no fish swarm next to that ship.');
    if (roomOf(ship.cargo) < SIZE.F) fail('The ship has no room for a fish swarm.');
    h.swarm = false; ship.cargo.push({ t: 'F' });
    log(s, '{@p} catches a fish swarm.', { p });
  },
  deliver(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship);
    if (!s.board.harbors.some(v => tipsAt(s, ship).includes(v))) fail('Deliveries go to a harbor of the council.');
    const fish = ship.cargo.filter(c => c.t === 'F').length, spice = ship.cargo.filter(c => c.t === 'S').length;
    if (!fish && !spice) fail('You have nothing to deliver.');
    ship.cargo = ship.cargo.filter(c => c.t !== 'F' && c.t !== 'S');
    s.fishLeft += fish;
    if (fish) { log(s, '{@p} delivers {n} fish swarm to the council.', { p, n: fish }); advance(s, 'fish', p, fish); }
    if (spice) { log(s, '{@p} delivers {n} spice to the council.', { p, n: spice }); advance(s, 'spice', p, spice); }
  },
  dropCargo(s, p, a) {
    if (s.phase !== 'play' || p !== s.current || s.pending.length) fail('Not allowed right now.');
    const ship = ownShip(s, p, a.ship);
    const c = ship.cargo[a.idx];
    if (!c) fail('Pick something on the ship.');
    ship.cargo.splice(a.idx, 1);
    if (c.t === 'F') s.fishLeft++;
    log(s, '{@p} puts a piece back into the supply.', { p });
  },
  // exchange between a ship and the harbor settlement it points at
  swap(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship);
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'harbor' || !tipsAt(s, ship).includes(a.v)) fail('The ship must point at one of your harbor settlements.');
    const give = [...new Set(a.give || [])], take_ = [...new Set(a.take || [])];
    if (give.some(i => !ship.cargo[i]) || take_.some(i => !b.cargo[i])) fail('Pick pieces that are there.');
    if (!give.length && !take_.length) fail('Pick what to move.');
    const toHarbor = give.map(i => ship.cargo[i]), toShip = take_.map(i => b.cargo[i]);
    const newShipCargo = ship.cargo.filter((_, i) => !give.includes(i)).concat(toShip);
    const newBasin = b.cargo.filter((_, i) => !take_.includes(i)).concat(toHarbor);
    if (sizeOf(newShipCargo) > CAPACITY || sizeOf(newBasin) > CAPACITY) fail('There is not enough room.');
    ship.cargo = newShipCargo; b.cargo = newBasin;
    log(s, '{@p} loads and unloads at a harbor settlement.', { p });
  },
  // fighting for a pirate lair
  dropUnits(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship), h = H(s, a.hex);
    if (!h || !lairOpen(h) || !tipOnHex(s, ship, h)) fail('There is no pirate lair next to that ship.');
    const have = ship.cargo.filter(c => c.t === 'U').length;
    if (!have) fail('Your ship carries no units.');
    const there = sum(h.lair.units);
    const n = Math.min(have, 3 - there, a.n == null ? 99 : Math.max(1, a.n | 0));
    if (n < 1) fail('The lair is full.');
    for (let i = 0; i < n; i++) ship.cargo.splice(ship.cargo.findIndex(c => c.t === 'U'), 1);
    h.lair.units[p] = (h.lair.units[p] || 0) + n;
    log(s, '{@p} lands {n} units on a pirate lair.', { p, n });
    if (sum(h.lair.units) >= 3 && !s.completed.includes(h.id)) s.completed.push(h.id);
  },
  // after the conquest the units that are left stand next to the lair and can be fetched
  pickUnits(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship), h = H(s, a.hex);
    if (!h || !h.units || !(h.units[p] > 0) || !tipOnHex(s, ship, h)) fail('You have no units there.');
    const n = Math.min(h.units[p], roomOf(ship.cargo));
    if (n < 1) fail('The ship has no room.');
    h.units[p] -= n; if (h.units[p] <= 0) delete h.units[p];
    for (let i = 0; i < n; i++) ship.cargo.push({ t: 'U' });
    log(s, '{@p} picks up {n} units.', { p, n });
  },
  // a spice village: one unit stays, the ship gets a spice bag, and the village's advantage is yours
  dropVillage(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship), h = H(s, a.hex);
    if (!h || h.terrain !== 'spice' || h.hidden || !tipOnHex(s, ship, h)) fail('There is no spice village next to that ship.');
    if (h.village.friends.includes(p)) fail('You are already friends with this village.');
    const i = ship.cargo.findIndex(c => c.t === 'U');
    if (i < 0) fail('Your ship carries no units.');
    if (h.village.bags < 1) fail('The village has no spice left.');
    ship.cargo.splice(i, 1);
    h.village.friends.push(p); h.village.bags--;
    ship.cargo.push({ t: 'S' });
    // quick sailing helps at once: every ship of yours gets 1 more move
    if (h.village.kind === 'fast') for (const x of shipsOf(s, p)) x.mp += 1;
    log(s, '{@p} befriends a spice village and loads a bag of spice.', { p, h: h.id });
  },
  // found a settlement from an explorer ship (the ship and the explorer go back to the supply)
  settle(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship);
    if (!ship.cargo.some(c => c.t === 'E')) fail('Your ship carries no explorer.');
    if (!tipsAt(s, ship).includes(a.v)) fail('The ship must point at the corner.');
    if (!distanceOk(s, a.v) || !vertexBuildable(s, a.v, p)) fail('You cannot build a settlement there.');
    if (countPieces(s, p).settlements >= PIECES.settlement) fail('No settlements left.');
    delete s.ships[ship.id];
    s.buildings[a.v] = { p, type: 'settlement' };
    log(s, '{@p} founds a settlement with an explorer.', { p });
  },
  // a ship's chance to chase a foreign pirate (a 6, or the numbers of friendly pirate-fighting villages)
  attackPirate(s, p, a) {
    requireMove(s, p);
    const ship = ownShip(s, p, a.ship);
    if (s.pirates.hex == null || s.pirates.owner === p) fail('There is no foreign pirate to chase.');
    if (ship.moved || ship.attacked) fail('Only a ship that has not moved yet can fight, and only once.');
    const h = H(s, s.pirates.hex);
    if (!tipOnHex(s, ship, h)) fail('The ship must be next to the pirate.');
    ship.attacked = true;
    const d = d6();
    const need = [6, ...friends(s, p).pirate];
    log(s, '{@p} rolls a {n} against the pirates.', { p, n: d });
    if (need.includes(d)) {
      const victim = s.pirates.owner;
      s.pirates = { hex: null, owner: null };
      log(s, "{@p} chases away {@q}'s pirate ship.", { p, q: victim });
      if (pirateHexes(s, p).length) pushPending(s, [{ type: 'pirate', player: p }], true);
    } else log(s, 'The pirates stay.');
  },
};

function advanceSetup(s) {
  s.setup.idx++;
  if (s.setup.idx >= s.setup.steps.length) {
    // each player's starting resources come from the settlement they placed last
    s.players.forEach((_, p) => { const v = lastOf(s, p, 'settlement'); if (v != null) startResources(s, p, v); });
    return beginPlay(s);
  }
  setStep(s);
}

// building an explorer or a unit: into the basin of an own harbor settlement or into a ship that stands next to one
function buildFigure(s, p, a, t) {
  requireBuild(s, p);
  const key = t === 'E' ? 'explorer' : 'unit';
  const pc = countPieces(s, p);
  if (pc[t === 'E' ? 'explorers' : 'units'] >= PIECES[key]) fail(t === 'E' ? 'No explorers left.' : 'No units left.');
  const opts = legalCargoTargets(s, p, t);
  const tg = a.target || {};
  const o = opts.find(x => x.kind === tg.kind && (tg.kind === 'harbor' ? x.v === tg.v : x.id === tg.id));
  if (!o) fail('Pick a harbor settlement or a ship next to one.');
  if (!has(P(s, p), COSTS[key])) fail('Not enough resources.');
  const box = o.kind === 'harbor' ? s.buildings[o.v] : s.ships[o.id];
  if (!o.room) {
    // an explorer may push out whatever stands in its way when both places are taken
    if (t !== 'E' || opts.some(x => x.room)) fail('There is no room there.');
    box.cargo = [];
  }
  pay(s, P(s, p), COSTS[key]);
  box.cargo.push({ t });
  log(s, t === 'E' ? '{@p} sends out an explorer.' : '{@p} recruits a unit.', { p });
}

// ---------------------------------------------------------------- act
function act(s, p, a) {
  if (!a || typeof a.type !== 'string') fail('Bad action.');
  if (s.phase === 'over') fail('The game is over.');
  if (p < 0 || p >= s.players.length) fail('You are not in this game.');
  const handler = HANDLERS[a.type];
  if (!handler) fail('Unknown action.');
  handler(s, p, a);
  s.version++;
  if (s.phase === 'play' && !s.pending.length) checkWin(s);
}

// ---------------------------------------------------------------- legal moves for the client
function shipOptions(s, p, sh) {
  const o = {};
  const tips = tipsAt(s, sh);
  const f = friends(s, p);
  const hexes = s.board.hexes.filter(h => !h.hidden && tips.some(v => h.verts.includes(v)));
  o.mp = sh.mp;
  const mv = reach(s, sh);
  if (Object.keys(mv).length) o.moves = mv;
  o.extend = !sh.extended && P(s, p).res.wool >= 1;
  const harbors = tips.filter(v => s.buildings[v] && s.buildings[v].p === p && s.buildings[v].type === 'harbor');
  if (harbors.length) o.swap = harbors;
  if (s.board.harbors.some(v => tips.includes(v)) && sh.cargo.some(c => c.t === 'F' || c.t === 'S')) o.deliver = s.board.harbors.find(v => tips.includes(v));
  const units = sh.cargo.filter(c => c.t === 'U').length;
  if (units) {
    const lairs = hexes.filter(h => lairOpen(h) && sum(h.lair.units) < 3).map(h => h.id);
    if (lairs.length) o.lairs = lairs;
    const vill = hexes.filter(h => h.terrain === 'spice' && !h.village.friends.includes(p) && h.village.bags > 0).map(h => h.id);
    if (vill.length) o.villages = vill;
  }
  const pick = hexes.filter(h => h.units && h.units[p] > 0).map(h => h.id);
  if (pick.length && roomOf(sh.cargo) > 0) o.pick = pick;
  const fish = hexes.filter(h => h.swarm).map(h => h.id);
  if (fish.length && roomOf(sh.cargo) >= SIZE.F) o.catch = fish;
  if (sh.cargo.some(c => c.t === 'E')) {
    const vs = tips.filter(v => distanceOk(s, v) && vertexBuildable(s, v, p));
    if (vs.length && countPieces(s, p).settlements < PIECES.settlement) o.settle = vs;
  }
  if (s.pirates.hex != null && s.pirates.owner !== p && !sh.moved && !sh.attacked && tipOnHex(s, sh, H(s, s.pirates.hex))) o.attack = true;
  o.cargo = sh.cargo.length;
  return o;
}
function legalFor(s, p) {
  const L = {};
  if (s.phase === 'setup') {
    if (s.current !== p) return L;
    if (s.setup.need === 'road') L.setupRoads = setupEdges(s);
    else if (s.setup.kind === 'ship') L.setupRoads = setupEdges(s);
    else L.setupSpots = setupSpots(s);
    return L;
  }
  if (s.phase !== 'play') return L;
  const pl = P(s, p);
  for (const it of activePending(s).filter(i => i.player === p)) {
    if (it.type === 'pirate') L.pirateHexes = pirateHexes(s, p);
  }
  if (p !== s.current || s.pending.length) return L;
  const roller = isRoller(s, p);
  if (s.step === 'main') {
    const pc = countPieces(s, p);
    if (has(pl, COSTS.road) && pc.roads < PIECES.road) L.roads = legalRoads(s, p);
    if (has(pl, COSTS.settlement) && pc.settlements < PIECES.settlement) L.settlements = legalSettlements(s, p);
    if (has(pl, COSTS.harbor) && pc.harbors < PIECES.harbor) L.harbors = legalUpgrades(s, p);
    if (has(pl, COSTS.ship)) {
      const e = legalShipBuilds(s, p);
      if (e.length) L.ships = { edges: e, replace: pc.ships >= PIECES.ship ? shipsOf(s, p).map(x => x.id) : null };
    }
    if (has(pl, COSTS.explorer) && pc.explorers < PIECES.explorer) {
      const t = legalCargoTargets(s, p, 'E'); if (t.length) L.explorer = t;
    }
    if (s.options.units && has(pl, COSTS.unit) && pc.units < PIECES.unit) {
      const t = legalCargoTargets(s, p, 'U').filter(x => x.room); if (t.length) L.unit = t;
    }
    L.ratios = { lumber: 3, brick: 3, wool: 3, grain: 3, ore: 3, gold: s.flags.goldBuys < 2 && pl.res.gold >= 2 ? 2 : 0 };
    const f = friends(s, p);
    L.goodGold = f.gold - s.flags.goodGold;
    L.canTrade = roller;
    L.canMove = true;
  }
  if (s.step === 'move') {
    L.ship = {};
    for (const sh of shipsOf(s, p)) L.ship[sh.id] = shipOptions(s, p, sh);
    L.rollFish = s.options.missions.includes('fish') && !s.flags.fishRolled && s.board.hexes.some(h => h.terrain === 'fishfield' && !h.hidden);
  }
  return L;
}

// ---------------------------------------------------------------- views
function viewHex(s, h) {
  if (h.hidden) return { id: h.id, x: h.x, y: h.y, terrain: 'fog', number: null, verts: h.verts, region: h.region, r: h.r, xh: h.xh, hidden: true };
  // a fishing ground is a sea field with a die face; the board draws it like open water
  const o = { id: h.id, x: h.x, y: h.y, terrain: h.terrain === 'fishfield' ? 'sea' : h.terrain, number: h.number, verts: h.verts, r: h.r, xh: h.xh };
  if (h.terrain === 'fishfield') o.fish = true;
  if (h.island) o.start = true;
  if (h.council) o.council = true;
  if (h.die) o.die = h.die;
  if (h.swarm) o.swarm = true;
  if (h.village) o.village = { kind: h.village.kind, die: h.village.die, bags: h.village.bags, friends: h.village.friends };
  if (h.lair) o.lair = { number: h.lair.number, units: h.lair.units, conquered: h.lair.conquered };
  if (h.units) o.units = h.units;
  return o;
}
function viewFor(s, me) {
  const board = {
    hexes: s.board.hexes.map(h => viewHex(s, h)),
    vertices: s.board.vertices.map(v => ({ id: v.id, x: v.x, y: v.y })),
    edges: s.board.edges.map(e => ({ id: e.id, v: e.v })),
    ports: [], harbors: s.board.harbors, circles: s.board.circles, rows: s.board.rows, size: s.board.size, scenario: s.board.scenario,
  };
  const activeGroup = s.pending.length ? s.pending[0].group : null;
  const pieces = i => { const c = countPieces(s, i); return { roads: PIECES.road - c.roads, settlements: PIECES.settlement - c.settlements, harbors: PIECES.harbor - c.harbors, ships: PIECES.ship - c.ships, explorers: PIECES.explorer - c.explorers, units: PIECES.unit - c.units }; };
  const tracks = {};
  for (const k of Object.keys(s.mis)) tracks[k] = { pos: s.mis[k].pos, at: s.mis[k].at, holder: holder(s, k), values: TRACKS[k] };
  return {
    id: s.id, mode: s.mode, kind: s.mode, expansion: 'none', options: s.options, me, cards: s.cards, version: s.version,
    phase: s.phase, step: s.step, turn: s.turn, current: s.current, second: s.second, pair: s.pair,
    setup: s.setup && { need: s.setup.need, kind: s.setup.kind, round: s.setup.round },
    board, robber: null, merchant: null,
    buildings: s.buildings, roads: s.roads, knights: {}, ships: {}, bridges: {},
    exp: {
      ships: s.ships, neutral: s.neutral, pirate: s.pirates, tracks, fishLeft: s.fishLeft, scenario: s.options.scenario,
      completed: s.completed, ship1: s.options.pairs ? pairOrder(s, s.pair)[0] : null, ship2: s.options.pairs ? pairOrder(s, s.pair)[1] : null,
    },
    players: s.players.map((pl, i) => {
      const self = i === me || s.phase === 'over';
      const f = friends(s, i);
      return {
        name: pl.name, color: pl.color, country: pl.country, userId: pl.userId,
        cards: handCount(pl), gold: pl.res.gold, res: self ? pl.res : null,
        vp: vp(s, i), breakdown: self ? breakdown(s, i) : null, handLimit: 7,
        pieces: pieces(i), friends: { fast: f.fast, gold: f.gold, pirate: f.pirate },
      };
    }),
    longestRoad: s.longestRoad, largestArmy: s.largestArmy,
    dice: s.dice,
    pending: s.pending.map(it => { const o = { type: it.type, player: it.player, group: it.group }; if (it.count != null) o.count = it.count; if (it.options) o.options = it.options; return o; }),
    activeGroup, trade: s.trade, flags: {}, free: { roads: 0, promotes: 0 },
    bank: s.bank, log: s.log.slice(-80), chat: s.chat.slice(-80),
    lastSteal: s.lastSteal && (s.lastSteal.by === me || s.lastSteal.from === me) ? s.lastSteal : null,
    stats: { rolls: s.stats.rolls, gained: s.stats.gained }, track: s.track || [],
    winner: s.winner,
    legal: legalFor(s, me),
  };
}
function summary(s) {
  return {
    id: s.id, mode: s.mode, kind: s.mode, expansion: 'none', scenario: String(s.options.scenario), variants: null, big: s.options.pairs, vpTarget: s.options.vpTarget,
    startedAt: s.startedAt, finishedAt: s.finishedAt, turns: s.stats.turns,
    winner: s.winner === null ? null : s.players[s.winner].userId,
    players: s.players.map((pl, i) => ({
      userId: pl.userId, name: pl.name, color: pl.color, country: pl.country || null, vp: vp(s, i),
      breakdown: breakdown(s, i), gained: s.stats.gained[i], knightsPlayed: 0,
    })),
    rolls: s.stats.rolls,
  };
}
function migrate(s) { return s; }

module.exports = {
  createGame, act, viewFor, summary, migrate,
  _internal: {
    spec: { vpTarget: 12, maxPlayers: 6, vpFor: sc => (SCEN[sc] || SCEN[2]).vp, vp: (s, p) => vp(s, p) },
    legalFor, reach, SCEN, COSTS, PIECES, TRACKS, countPieces, pirateHexes, HANDLERS,
  },
};
