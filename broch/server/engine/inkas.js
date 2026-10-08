'use strict';
// Rise of the Inkas (Der Aufstieg der Inka), a standalone game that follows the official rulebook (Teuber, Kosmos 2018).
//
// The board is the 27-field landscape of Peru in its frame: the Pacific in the west (3 coastal-water fields), the jungle
// in the east (3 jungle and 3 jungle-plantation fields) and 18 land fields (forest, quarry, pasture, mountains, fields)
// between them. Pointy sides left and right: the hexes are flat-top, columns run from west (S) to east (E).
//
// Every player leads three tribes one after the other. Each building (settlement or city upgrade) puts one development
// marker on the tribe tablet: 4 for the first tribe, 4 for the second, 3 for the third. When a tribe's goal is reached it
// declines: its roads are taken back, its buildings are covered with thickets (still paying, but they may be built over),
// and the player founds the first settlement of the next tribe for free, which ends the turn. 11 markers win the game.
//
// Not in the rulebook that is available (the almanac is missing), so this project fills the gaps: the contents of the two
// development card decks, the 19 cards of every kind in the supply, and the shortage rule for the supply (as in Catan).

const { geometryFromCenters, shuffle } = require('./board');
const { createKit, fail, log, sum, clean } = require('./kit');

// ---------------------------------------------------------------- rules constants
const RAW = ['timber', 'stone', 'fleece', 'metal', 'potato']; // wood, stone, wool, ore, potatoes
const GOODS = ['catch', 'coca', 'feathers']; // trade goods: fish, coca, feathers
const RES = [...RAW, ...GOODS];
const TERRAIN_RES = { forest: 'timber', hills: 'stone', pasture: 'fleece', mountains: 'metal', fields: 'potato', coast: 'catch', plantation: 'coca', jungle: 'feathers' };
const LAND = ['forest', 'hills', 'pasture', 'mountains', 'fields']; // the five landscapes that make raw materials
const UNIT = 'inkas';
const GOAL = [4, 8, 11]; // development markers when tribe 1, 2 and 3 are done
const TOTAL = 11;
const PIECES = { road: 7, settlement: 8, city: 2, thicket: 4 };
const COSTS = {
  road: { timber: 1, stone: 1 },
  settlement: { timber: 1, stone: 1, potato: 1, fleece: 1 },
  city: { potato: 2, metal: 3 },
  dev: { potato: 1, fleece: 1, metal: 1 },
};
const MIN_ROAD = 3; // Longest Trade Road: 3 connected roads
const ARMY_MIN = 2; // Greatest Combat Skill: 2 played combat skill cards
const SUPPLY = 19;
const DEV = ['combat', 'roadBuilding', 'invention', 'inMonopoly'];
// the rulebook does not list the decks (they are in the almanac): deck "1" is in play from the start, deck "2" joins when
// every player has led their first tribe to success
const DECK1 = { combat: 6, roadBuilding: 2, invention: 2, inMonopoly: 2 };
const DECK2 = { combat: 5, roadBuilding: 2, invention: 2, inMonopoly: 2 };

// ---------------------------------------------------------------- the board (beginner layout of the rulebook, pages 2-3)
// [column, u, landscape, number]: columns 0..4 run west to east, u counts half hex heights from the top
const FIELDS = [
  [0, 1, 'coast', 6], [0, 5, 'coast', 3], [0, 9, 'coast', 9],
  [1, 0, 'pasture', 4], [1, 2, 'forest', 5], [1, 4, 'hills', 8], [1, 6, 'mountains', 11], [1, 8, 'mountains', 8], [1, 10, 'pasture', 10],
  [2, -1, 'hills', 11], [2, 1, 'fields', 6], [2, 3, 'fields', 10], [2, 5, 'pasture', 12], [2, 7, 'pasture', 3], [2, 9, 'fields', 5], [2, 11, 'fields', 3],
  [3, 0, 'forest', 2], [3, 2, 'forest', 9], [3, 4, 'hills', 4], [3, 6, 'mountains', 9], [3, 8, 'forest', 6], [3, 10, 'plantation', 9],
  [4, 1, 'jungle', 8], [4, 3, 'plantation', 11], [4, 5, 'jungle', 10], [4, 7, 'plantation', 5], [4, 9, 'jungle', 4],
];
// the 5 frame pieces with jungle where the robber may stand (no number, no yield)
const FRAME = [[4, -1], [5, 2], [5, 6], [5, 10], [4, 11]];
const ROBBER_START = 1; // index in FRAME
// the starting layout for beginners: per player colour (red, orange, blue, grey) two settlements and two roads. A
// settlement is named by the three fields around it, a road by the two fields it runs between. `first` marks the
// settlement with the letter (A, B, C, D) that collects the first yields. With three players grey stays in the box.
const START = [
  [{ s: [[1, 4], [1, 6], [0, 5]], r: [[1, 6], [0, 5]], first: true }, { s: [[1, 0], [1, 2], [2, 1]], r: [[1, 0], [2, 1]] }],
  [{ s: [[3, 2], [3, 4], [4, 3]], r: [[3, 2], [4, 3]], first: true }, { s: [[1, 8], [1, 10], [2, 9]], r: [[1, 8], [1, 10]] }],
  [{ s: [[3, 4], [3, 6], [4, 5]], r: [[3, 4], [3, 6]], first: true }, { s: [[3, 8], [2, 7], [2, 9]], r: [[3, 8], [2, 9]] }],
  [{ s: [[3, 6], [3, 8], [4, 7]], r: [[3, 6], [3, 8]], first: true }, { s: [[1, 4], [2, 3], [2, 5]], r: [[1, 4], [2, 3]] }],
];

function buildBoard() {
  const cells = [...FIELDS.map(([c, u]) => [c, u]), ...FRAME];
  const geo = geometryFromCenters(cells.map(([c, u]) => ({ x: c * 1.5, y: u * Math.sqrt(3) / 2 })), true);
  const at = {};
  geo.hexes.forEach((h, i) => {
    const [c, u] = cells[i];
    h.col = c; h.u = u;
    if (i < FIELDS.length) { h.terrain = FIELDS[i][2]; h.number = FIELDS[i][3]; } else { h.terrain = 'frame'; h.number = null; h.frame = true; }
    at[`${c},${u}`] = h.id;
  });
  return { kind: 'inkas', hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports: [], at };
}
const hexId = (board, cu) => board.at[`${cu[0]},${cu[1]}`];
const vertexOfFields = (board, trio) => {
  const ids = trio.map(cu => hexId(board, cu));
  return board.vertices.find(v => v.hexes.length === ids.length && ids.every(id => v.hexes.includes(id))).id;
};
const edgeOfFields = (board, duo) => {
  const ids = duo.map(cu => hexId(board, cu));
  return board.edges.find(e => ids.every(id => e.hexes.includes(id))).id;
};

// ---------------------------------------------------------------- geometry rules
const hexOf = (s, h) => s.board.hexes[h];
const isLandHex = (s, h) => LAND.includes(hexOf(s, h).terrain);
const edgeExists = (s, e) => s.board.edges[e].hexes.some(h => isLandHex(s, h)); // no ways between jungle / sea / frame
const vertexLand = (s, v) => s.board.vertices[v].hexes.some(h => isLandHex(s, h));
const frameSpots = s => s.board.hexes.filter(h => h.frame).map(h => h.id);

// ---------------------------------------------------------------- the kit
const spec = {
  hand: RES, limited: RES, tradeKeys: RES, vpTarget: TOTAL, noLongestRoad: true,
  supply: () => Object.fromEntries(RES.map(k => [k, SUPPLY])),
  costs: COSTS, pieces: PIECES,
  terrainCard: t => TERRAIN_RES[t] || null,
  vp: (s, p) => s.markers[p],
  breakdown: (s, p) => ({
    markers: s.markers[p], tribe: s.tribe[p] + 1, settlements: K.count(s, p, 'settlement'), cities: K.count(s, p, 'city'),
    longestRoad: s.longestRoad.p === p ? 1 : 0, army: s.largestArmy.p === p ? 1 : 0, total: s.markers[p],
  }),
  bankBuys: RES,
  // 3 equal raw materials for any other card; 2 equal trade goods for any other card
  bankRate: (s, p, give) => (GOODS.includes(give) ? 2 : 3),
  handLimit: (s, p) => 7 + s.players[p].played, // every open combat skill card protects one more hand card on a 7
  settleSpotOk: (s, v) => vertexLand(s, v),
  roadEdgeOk: (s, e) => edgeExists(s, e),
  afterSetupSettlement(s, p, v) { s.buildings[v].tribe = 0; s.markers[p]++; },
  roll: s => roll(s),
};
const K = createKit(spec);

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  if (players.length < 3 || players.length > 4) fail('Rise of the Inkas is for 3–4 players');
  const s = K.baseState({ id, mode: UNIT, players, options });
  s.options.vpTarget = TOTAL;
  s.board = buildBoard();
  s.robber = frameSpots(s)[ROBBER_START];
  s.markers = s.players.map(() => 0);
  s.tribe = s.players.map(() => 0); // the active tribe: 0, 1 or 2
  s.players.forEach(pl => { pl.dev = Object.fromEntries(DEV.map(c => [c, 0])); pl.played = 0; });
  const deck = (counts) => shuffle(Object.entries(counts).flatMap(([c, n]) => Array(n).fill(c)));
  s.devDeck = deck(DECK1); s.devDeck2 = deck(DECK2); s.deck2In = false;
  s.freeStart = !!(s.options.freeStart);
  s.declines = []; s.declineSeq = 0; // the last tribes that fell into decline, for the scene
  if (s.freeStart) K.start(s);
  else beginnerStart(s);
  return s;
}
function beginnerStart(s) {
  log(s, 'Game started. {@ps} take their seats.', { ps: s.players.map((_, i) => i) });
  s.setup = null; s.phase = 'play'; s.step = 'roll'; s.turn = 1; s.current = 0; s.stats.turns = 1;
  s.players.forEach((_, p) => {
    for (const st of START[p]) {
      const v = vertexOfFields(s.board, st.s);
      s.buildings[v] = { p, type: 'settlement', tribe: 0 };
      const e = edgeOfFields(s.board, st.r);
      s.roads[e] = p;
      s.markers[p]++;
      if (st.first) K.setupPay(s, p, v);
    }
  });
  log(s, 'Setup complete. {@p} begins.', { p: s.current });
  s.track = [];
  K.snapshot(s); s.track[0].t = 0;
}

// ---------------------------------------------------------------- production and the robber
function roll(s) {
  const total = K.rollDice(s);
  if (total === 7) {
    log(s, 'A 7: nobody gets anything, the robber is on the move.');
    K.sevenDiscards(s);
    K.pushPending(s, [{ type: 'robber', player: s.current, reason: 'seven' }]);
    return;
  }
  produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  for (const h of s.board.hexes.filter(x => x.number === total && x.id !== s.robber)) {
    const res = TERRAIN_RES[h.terrain];
    if (!res) continue;
    for (const v of h.verts) {
      const b = s.buildings[v];
      if (!b) continue;
      want[b.p][res] = (want[b.p][res] || 0) + (b.type === 'city' ? 2 : 1);
    }
  }
  for (const r of RES) {
    const takers = want.map((w, p) => [p, w[r] || 0]).filter(([, n]) => n > 0);
    if (takers.reduce((a, [, n]) => a + n, 0) > s.bank[r] && takers.length > 1) {
      takers.forEach(([p]) => { delete want[p][r]; });
      log(s, 'The supply ran short of {#r}; nobody receives it.', { r });
    }
  }
  want.forEach((w, p) => {
    const got = {};
    for (const [k, n] of Object.entries(w)) {
      const g = K.take(s, K.P(s, p), k, n);
      if (g) { got[k] = g; s.stats.gained[p] += g; }
    }
    if (Object.keys(got).length) log(s, '{@p} receives {$c}.', { p, c: got });
  });
}
const buildingNear = (s, p, h) => hexOf(s, h).verts.some(v => s.buildings[v] && s.buildings[v].p === p);
// where the robber may go: every other land field and every jungle frame piece; the fields that make trade goods are barred
function robberTargets(s, me) {
  const out = {};
  for (const h of s.board.hexes) {
    if (h.id === s.robber || !(LAND.includes(h.terrain) || h.frame)) continue;
    const victims = h.frame ? [] : [...new Set(h.verts.map(v => s.buildings[v]).filter(b => b && b.p !== me).map(b => b.p))].filter(q => K.handCount(s, K.P(s, q)) > 0);
    out[h.id] = victims;
  }
  return out;
}

// ---------------------------------------------------------------- roads and the advantage cards
function updateLongest(s) {
  const lens = s.players.map((_, p) => K.longestFor(s, p));
  const max = Math.max(...lens), h = s.longestRoad.p, prev = h;
  if (h !== null && lens[h] >= MIN_ROAD && lens[h] === max) s.longestRoad.len = lens[h];
  else {
    const top = lens.map((l, i) => [l, i]).filter(([l]) => l === max);
    if (max >= MIN_ROAD && top.length === 1) s.longestRoad = { p: top[0][1], len: max };
    else s.longestRoad = { p: null, len: 0 }; // nobody, or a tie: the card is put aside
  }
  s.longestRoad.edges = s.longestRoad.p !== null ? K.longestFor(s, s.longestRoad.p, true).edges : [];
  if (s.longestRoad.p !== prev) {
    if (s.longestRoad.p !== null) log(s, '{@p} now holds the Longest Trade Road ({n}).', { p: s.longestRoad.p, n: s.longestRoad.len });
    else log(s, 'Nobody holds the Longest Trade Road any more.');
  }
}
function updateArmy(s, who) {
  const counts = s.players.map(pl => pl.played), max = Math.max(...counts), h = s.largestArmy.p;
  if (h !== null && counts[h] >= max) { s.largestArmy.count = counts[h]; return; }
  if (max < ARMY_MIN) return;
  const p = h !== null || counts[who] === max ? who : counts.indexOf(max);
  if (counts[p] !== max) return;
  s.largestArmy = { p, count: max };
  log(s, '{@p} now holds the Greatest Combat Skill.', { p });
}

// legal ways: an own road or building at one end, but never through a building under thicket or a foreign building
function anchored(s, v, p) {
  const b = s.buildings[v];
  if (b) return b.p === p && !b.decline;
  return K.touchesOwnRoad(s, v, p);
}
function legalRoads(s, p) {
  if (K.countRoads(s, p) >= PIECES.road) return [];
  return s.board.edges.filter(e => s.roads[e.id] === undefined && edgeExists(s, e.id) && e.v.some(v => anchored(s, v, p))).map(e => e.id);
}
const settlementCount = (s, p) => K.ownBuildings(s, p).filter(v => s.buildings[v].type === 'settlement').length;
const cityCount = (s, p) => K.ownBuildings(s, p).filter(v => s.buildings[v].type === 'city').length;
const spaceFree = (s, v) => K.V(s, v).adj.every(a => !s.buildings[a]);
// a settlement may go on a free crossing that an own road leads to, or over a building under thicket
function legalSettlements(s, p) {
  return s.board.vertices.filter(x => {
    const b = s.buildings[x.id];
    if (b && !b.decline) return false;
    if (!spaceFree(s, x.id) || !vertexLand(s, x.id) || !K.touchesOwnRoad(s, x.id, p)) return false;
    const mineBack = b && b.p === p && b.type === 'settlement' ? 1 : 0; // the figure that is removed goes back to its owner
    return settlementCount(s, p) - mineBack < PIECES.settlement;
  }).map(x => x.id);
}
// the free settlement of a new tribe: any free crossing with a way to it, but not a building spot of an active tribe
function foundSpots(s, p, strict = true) {
  return s.board.vertices.filter(x => {
    if (s.buildings[x.id] || !spaceFree(s, x.id) || !vertexLand(s, x.id)) return false;
    if (strict && s.players.some((_, q) => q !== p && K.touchesOwnRoad(s, x.id, q))) return false;
    return true;
  }).map(x => x.id);
}
function legalCities(s, p) {
  if (cityCount(s, p) >= PIECES.city) return [];
  if (K.ownBuildings(s, p, 'city').some(v => !s.buildings[v].decline)) return []; // one city per tribe
  return K.ownBuildings(s, p, 'settlement').filter(v => !s.buildings[v].decline);
}

// ---------------------------------------------------------------- tribes
// every settlement or city that goes up puts one development marker on the tablet
function placeMarker(s, p) {
  s.markers[p]++;
  const t = s.tribe[p];
  if (s.markers[p] < GOAL[t]) return;
  if (t === 2) { K.finish(s, p, '{@p} leads the third tribe to success and wins the game!', { p }); return; }
  decline(s, p);
}
function decline(s, p) {
  const t = s.tribe[p];
  log(s, '{@p} leads the {#tribe} to success. Its buildings fall into decline.', { p, tribe: t === 0 ? 'tribe1' : 'tribe2' });
  if (t === 1) { // the figures of the first tribe, thickets included, go back to their owner
    for (const v of K.ownBuildings(s, p)) if (s.buildings[v].tribe === 0) delete s.buildings[v];
  }
  for (const e of Object.keys(s.roads)) if (s.roads[e] === p) delete s.roads[e];
  for (const v of K.ownBuildings(s, p)) if (s.buildings[v].tribe === t) s.buildings[v].decline = true;
  updateLongest(s);
  s.tribe[p] = t + 1;
  s.declines.push({ seq: ++s.declineSeq, p, tribe: t });
  if (s.declines.length > 8) s.declines.shift();
  if (!s.deck2In && s.tribe.every(x => x >= 1)) {
    s.deck2In = true;
    s.devDeck = [...s.devDeck2, ...s.devDeck]; // pushed under the cards with the "1" (the top is the end of the list)
    s.devDeck2 = [];
    log(s, 'Every player has led a tribe to success: the development cards "2" join the deck.');
  }
  K.pushPending(s, [{ type: 'found', player: p }]);
}

// ---------------------------------------------------------------- handlers
const needTurn = (s, p, steps) => {
  if (s.phase !== 'play' || s.pending.length || p !== s.current || !steps.includes(s.step)) fail('Not allowed right now.');
};
const bought = (s, c) => (s.flags.bought && s.flags.bought[c]) || 0;
function freeRoadsLeft(s, p, n) { return Math.min(n, PIECES.road - K.countRoads(s, p)); }

const HANDLERS = {
  ...K.HANDLERS,
  buildRoad(s, p, a) {
    K.requireActor(s, p);
    if (!legalRoads(s, p).includes(a.e)) fail('You cannot build a road there.');
    const pl = K.P(s, p);
    if (!K.has(pl, COSTS.road)) fail('Not enough resources.');
    K.pay(s, pl, COSTS.road);
    s.roads[a.e] = p;
    log(s, '{@p} built a road.', { p });
    updateLongest(s);
  },
  buildSettlement(s, p, a) {
    K.requireActor(s, p);
    if (!legalSettlements(s, p).includes(a.v)) fail('You cannot build a settlement there.');
    const pl = K.P(s, p);
    if (!K.has(pl, COSTS.settlement)) fail('Not enough resources.');
    K.pay(s, pl, COSTS.settlement);
    const old = s.buildings[a.v];
    if (old) log(s, '{@p} builds over a building of {@q} that is in decline.', { p, q: old.p });
    s.buildings[a.v] = { p, type: 'settlement', tribe: s.tribe[p] };
    log(s, '{@p} built a settlement.', { p });
    updateLongest(s);
    placeMarker(s, p);
  },
  buildCity(s, p, a) {
    K.requireActor(s, p);
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'settlement') fail('Pick one of your settlements.');
    if (b.decline) fail('A building in decline cannot be expanded.');
    if (cityCount(s, p) >= PIECES.city) fail('No cities left.');
    if (!legalCities(s, p).length) fail('Only one city per tribe.');
    const pl = K.P(s, p);
    if (!K.has(pl, COSTS.city)) fail('Not enough resources.');
    K.pay(s, pl, COSTS.city);
    b.type = 'city';
    log(s, '{@p} built a city.', { p });
    placeMarker(s, p);
  },
  buyCard(s, p) {
    K.requireActor(s, p);
    if (!s.devDeck.length) fail('No development cards left.');
    const pl = K.P(s, p);
    if (!K.has(pl, COSTS.dev)) fail('Not enough resources.');
    K.pay(s, pl, COSTS.dev);
    const c = s.devDeck.pop();
    pl.dev[c]++;
    s.flags.bought = { ...(s.flags.bought || {}), [c]: bought(s, c) + 1 };
    log(s, '{@p} bought a development card.', { p });
  },
  // one development card per turn, any time (even before the roll), but not one bought this turn
  playCard(s, p, a) {
    needTurn(s, p, ['roll', 'main']);
    if (s.flags.cardPlayed) fail('You may play only one development card per turn.');
    const c = a.card, pl = K.P(s, p);
    if (!DEV.includes(c)) fail('Unknown card.');
    if (pl.dev[c] - bought(s, c) < 1) fail('You cannot play that card now.');
    if (c === 'invention') {
      if (!K.validCards(a.take, RES) || sum(a.take) !== 2) fail('Take exactly 2 cards.');
      for (const [k, n] of Object.entries(a.take)) if (s.bank[k] < n) fail('The supply does not have that.');
    }
    if (c === 'inMonopoly' && !RES.includes(a.res)) fail('Pick a resource or trade good.');
    if (c === 'roadBuilding' && !legalRoads(s, p).length) fail('You cannot build a road there.');
    pl.dev[c]--; s.flags.cardPlayed = true;
    log(s, '{@p} played {%c}.', { p, c });
    if (c === 'combat') {
      pl.played++;
      updateArmy(s, p);
      K.pushPending(s, [{ type: 'robber', player: p, reason: 'combat' }]);
    } else if (c === 'roadBuilding') {
      K.pushPending(s, [{ type: 'freeroad', player: p, left: freeRoadsLeft(s, p, 2) }]);
    } else if (c === 'invention') {
      const got = {};
      for (const [k, n] of Object.entries(clean(a.take))) { const m = K.take(s, pl, k, n); if (m) got[k] = m; }
      s.stats.gained[p] += sum(got);
      log(s, '{@p} receives {$c}.', { p, c: got });
    } else if (c === 'inMonopoly') {
      const got = {};
      s.players.forEach((q, i) => { if (i !== p) { const m = K.moveCard(q, pl, a.res, 2); if (m) got[a.res] = (got[a.res] || 0) + m; } });
      log(s, '{@p} calls a monopoly on {#r} and receives {$c}.', { p, r: a.res, c: got });
    }
  },
  placeFreeRoad(s, p, a) {
    const it = K.findPending(s, p, 'freeroad');
    if (!it) fail('Nothing to place.');
    if (!legalRoads(s, p).includes(a.e)) fail('You cannot build a road there.');
    s.roads[a.e] = p;
    log(s, '{@p} built a road.', { p });
    updateLongest(s);
    it.left = freeRoadsLeft(s, p, it.left - 1);
    if (it.left <= 0 || !legalRoads(s, p).length) K.resolvePending(s, it);
  },
  skipFreeRoad(s, p) {
    const it = K.findPending(s, p, 'freeroad');
    if (!it) fail('Nothing to place.');
    K.resolvePending(s, it);
  },
  // a 7 or a combat skill card: move the robber and take one hand card from a player next to the field
  moveRobber(s, p, a) {
    const it = K.findPending(s, p, 'robber');
    if (!it) fail('Nothing to move.');
    const targets = robberTargets(s, p);
    if (!targets[a.h]) fail('The robber cannot go there.');
    const victims = targets[a.h];
    const q = victims.length ? (victims.length === 1 ? victims[0] : a.victim) : null;
    if (victims.length && !victims.includes(q)) fail('Pick a player to take a card from.');
    K.resolvePending(s, it);
    s.robber = a.h;
    log(s, '{@p} moved the robber.', { p, h: a.h });
    if (q != null) {
      const k = K.randomCard(s, K.P(s, q), RES);
      if (k) { K.moveCard(K.P(s, q), K.P(s, p), k, 1); log(s, '{@p} stole a card from {@q}.', { p, q }); }
    }
  },
  // the Greatest Combat Skill: once a turn, even before the roll, the robber leaves a field next to your building for the frame
  armyMove(s, p, a) {
    needTurn(s, p, ['roll', 'main']);
    if (s.largestArmy.p !== p) fail('You do not hold that card.');
    if (s.flags.armyUsed) fail('You already used that this turn.');
    const from = hexOf(s, s.robber);
    if (!LAND.includes(from.terrain) || !buildingNear(s, p, from.id)) fail('The robber must stand next to one of your buildings.');
    if (!frameSpots(s).includes(a.h)) fail('Pick a jungle frame piece.');
    s.flags.armyUsed = true;
    s.robber = a.h;
    const k = TERRAIN_RES[from.terrain];
    const got = K.take(s, K.P(s, p), k, 1);
    log(s, '{@p} moved the robber.', { p, h: a.h });
    if (got) { s.stats.gained[p] += 1; log(s, '{@p} receives {$c}.', { p, c: { [k]: 1 } }); }
  },
  // the Longest Trade Road: once per turn, 2 cards for 1 other card from the supply
  roadTrade(s, p, a) {
    K.requireMain(s, p);
    if (s.longestRoad.p !== p) fail('You do not hold that card.');
    if (s.flags.roadTrade) fail('You already used that this turn.');
    const pl = K.P(s, p);
    if (!K.validCards(a.give, RES) || sum(a.give) !== 2) fail('Give exactly 2 cards.');
    if (!RES.includes(a.get) || a.give[a.get]) fail('Pick what to trade.');
    if (!K.has(pl, a.give)) fail('You do not have those cards.');
    if (s.bank[a.get] < 1) fail('The supply does not have that.');
    K.pay(s, pl, a.give);
    K.take(s, pl, a.get, 1);
    s.flags.roadTrade = true;
    log(s, '{@p} traded {$g} with the supply for {$w}.', { p, g: clean(a.give), w: { [a.get]: 1 } });
  },
  // three different trade goods for any 2 cards
  goodsTrade(s, p, a) {
    K.requireMain(s, p);
    const pl = K.P(s, p), give = Object.fromEntries(GOODS.map(g => [g, 1]));
    if (!K.validCards(a.get, RES) || sum(a.get) !== 2) fail('Take exactly 2 cards.');
    if (!K.has(pl, give)) fail('You need 3 different trade goods.');
    for (const [k, n] of Object.entries(a.get)) if (s.bank[k] + (give[k] || 0) < n) fail('The supply does not have that.');
    K.pay(s, pl, give);
    for (const [k, n] of Object.entries(clean(a.get))) K.take(s, pl, k, n);
    log(s, '{@p} traded {$g} with the supply for {$w}.', { p, g: give, w: clean(a.get) });
  },
  // the first settlement of the next tribe: free, no road, no yield, and the turn ends at once
  foundTribe(s, p, a) {
    const it = K.findPending(s, p, 'found');
    if (!it) fail('Nothing to place.');
    let spots = foundSpots(s, p);
    if (!spots.length) spots = foundSpots(s, p, false);
    if (!spots.includes(a.v)) fail('You cannot found a settlement there.');
    K.resolvePending(s, it);
    s.buildings[a.v] = { p, type: 'settlement', tribe: s.tribe[p] };
    log(s, '{@p} founded a new settlement for free.', { p });
    updateLongest(s);
    placeMarker(s, p);
    if (s.phase === 'play') K.nextTurn(s);
  },
};

// ---------------------------------------------------------------- legal moves and view
function legalFor(s, me) {
  const L = {};
  if (s.phase === 'setup' && me === s.current) {
    if (s.setup.need === 'settlement') L.setupSpots = K.legalSetupSettlements(s);
    else L.setupRoads = K.legalSetupRoads(s);
    return L;
  }
  if (s.phase !== 'play') return L;
  const pend = K.findPending(s, me);
  if (pend) {
    L.pending = pend.type;
    if (pend.type === 'robber') L.robber = robberTargets(s, me);
    if (pend.type === 'found') { const sp = foundSpots(s, me); L.found = sp.length ? sp : foundSpots(s, me, false); }
    if (pend.type === 'freeroad') { L.roads = legalRoads(s, me); L.left = pend.left; }
    return L;
  }
  if (me !== s.current) return L;
  const pl = K.P(s, me), have = c => pl.dev[c] - bought(s, c);
  L.cost = COSTS;
  // cards and advantage cards work before the roll as well
  if (['roll', 'main'].includes(s.step)) {
    L.cards = Object.fromEntries(DEV.map(c => [c, !s.flags.cardPlayed && have(c) > 0 && (c !== 'roadBuilding' || legalRoads(s, me).length > 0)]));
    const from = hexOf(s, s.robber);
    L.army = s.largestArmy.p === me && !s.flags.armyUsed && LAND.includes(from.terrain) && buildingNear(s, me, from.id) ? frameSpots(s) : [];
  }
  if (!K.isActor(s, me)) return L;
  L.roads = K.has(pl, COSTS.road) ? legalRoads(s, me) : [];
  const set = K.has(pl, COSTS.settlement) ? legalSettlements(s, me) : [];
  L.settlements = set;
  L.overbuild = set.filter(v => s.buildings[v]);
  L.cities = K.has(pl, COSTS.city) ? legalCities(s, me) : [];
  L.canBuy = K.has(pl, COSTS.dev) && s.devDeck.length > 0;
  L.roadTrade = s.longestRoad.p === me && !s.flags.roadTrade && K.handCount(s, pl) >= 2;
  L.goodsTrade = K.has(pl, Object.fromEntries(GOODS.map(g => [g, 1])));
  L.ratios = Object.fromEntries(RES.map(k => [k, spec.bankRate(s, me, k)]));
  return L;
}
function viewFor(s, me) {
  const v = K.viewCommon(s, me, (st, i, self) => {
    const pl = st.players[i];
    return {
      markers: st.markers[i], tribe: st.tribe[i], played: pl.played,
      devCount: sum(pl.dev), dev: self ? pl.dev : null,
      pieces: {
        roads: PIECES.road - K.countRoads(st, i), settlements: PIECES.settlement - settlementCount(st, i), cities: PIECES.city - cityCount(st, i),
        thickets: PIECES.thicket - K.ownBuildings(st, i).filter(x => st.buildings[x].decline).length,
      },
    };
  });
  v.robber = s.robber;
  v.inkas = {
    goal: GOAL, spots: frameSpots(s), deck: s.devDeck.length, deck2: s.deck2In, deck2Left: s.devDeck2.length,
    army: { p: s.largestArmy.p, count: s.largestArmy.count }, declines: s.declines, freeStart: s.freeStart, bought: s.flags.bought || {},
  };
  v.legal = legalFor(s, me);
  v.flags = { rolled: !!s.flags.rolled, cardPlayed: !!s.flags.cardPlayed, armyUsed: !!s.flags.armyUsed, roadTrade: !!s.flags.roadTrade };
  return v;
}

// games saved with the earlier rules of this mode (eras and culture tokens) cannot continue: they start over
function migrate(s) {
  if (!s || s.markers) return s;
  const fresh = createGame({ id: s.id, players: s.players.map(pl => ({ id: pl.userId, name: pl.name, color: pl.color, country: pl.country })), options: { vpTarget: TOTAL } });
  fresh.startedAt = s.startedAt;
  return fresh;
}

module.exports = {
  createGame, act: (s, p, a) => K.act(s, p, a, HANDLERS), viewFor, summary: s => K.summary(s), migrate,
  _internal: {
    K, spec, HANDLERS, PIECES, COSTS, GOAL, RES, RAW, GOODS, LAND, DEV, TERRAIN_RES, START, FIELDS, FRAME,
    produce, legalRoads, legalSettlements, legalCities, foundSpots, robberTargets, updateLongest, minPlayers: 3, fixedVp: true,
  },
};
