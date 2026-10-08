'use strict';
// Catan – Energiewende. A standalone game on the classic island: towns and cities make resources (cities also science),
// power plants turn science into energy. Fossil plants are cheap but dirty, renewable plants cost more and clean up.
// Every turn begins with events drawn from a bag of discs; the dirtier the world, the more discs are drawn and the
// nastier they are. First to 10 points wins - or, when the bag runs dry, whoever has built the greenest.
//
// The rules are rebuilt from public descriptions of the board game, so numbers that were not available (disc counts,
// plant output, event effects) are this project's own balance.

const { generate, shuffle } = require('./board');
const { createKit, fail, log, sum } = require('./kit');
const C = require('./constants');

const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const HAND = [...RES, 'science', 'energy'];
const TERRAIN_RES = { forest: 'lumber', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'ore' };
const PLANT_COST = { fossil: 1, renewable: 3 }; // science
const OUTPUT = { fossil: 2, renewable: 1 }; // energy when the tile's number comes up
const SLOTS = { settlement: 1, city: 3 };
const PIECES = { road: 15, settlement: 5, city: 4, fossil: 6, renewable: 9 };
const HAZARDS = 10;
const BROWN = { smog: 22, blackout: 18, drought: 18, fossilBoom: 12, heatwave: 20, energyCrisis: 20 };
const GREEN_ORDER = ['sun', 'cleanAir', 'subsidy', 'research', 'bonus'];
const COSTS = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
};
const UNIT = 'energies';

// ---------------------------------------------------------------- footprints
const plantsOf = (s, p, kind) => s.plants.filter(x => x.p === p && (!kind || x.kind === kind));
const lf = (s, p) => plantsOf(s, p, 'fossil').length - plantsOf(s, p, 'renewable').length; // local footprint
const gf = s => Math.max(0, s.plants.filter(x => x.kind === 'fossil').length - s.plants.filter(x => x.kind === 'renewable').length); // global footprint
const discsPerTurn = s => 1 + (gf(s) >= 4 ? 1 : 0) + (gf(s) >= 8 ? 1 : 0);
// the cleanest world: the one player with the lowest footprint, if it is below zero
function cleanest(s) {
  const l = s.players.map((_, p) => lf(s, p));
  const min = Math.min(...l);
  if (min >= 0 || l.filter(x => x === min).length !== 1) return null;
  return l.indexOf(min);
}
const hazardsOnBoard = s => Object.values(s.buildings).filter(b => b.hazard).length + s.plants.filter(x => x.hazard).length;

// ---------------------------------------------------------------- points
function vp(s, p) {
  let pts = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) pts += b.type === 'city' ? 2 : 1;
  if (s.longestRoad.p === p) pts += 2;
  if (cleanest(s) === p) pts += 2;
  return pts;
}
function breakdown(s, p) {
  return {
    settlements: K.count(s, p, 'settlement'), cities: K.count(s, p, 'city'), longestRoad: s.longestRoad.p === p,
    cleanest: cleanest(s) === p, fossil: plantsOf(s, p, 'fossil').length, renewable: plantsOf(s, p, 'renewable').length,
    lf: lf(s, p), total: vp(s, p),
  };
}

// ---------------------------------------------------------------- the kit
const spec = {
  hand: HAND, limited: [...RES, 'science'], tradeKeys: HAND, vpTarget: 10,
  supply: n => ({ ...Object.fromEntries(RES.map(r => [r, 19])), science: 25, energy: 20 }),
  costs: COSTS, pieces: PIECES,
  terrainCard: t => TERRAIN_RES[t] || null,
  vp, breakdown,
  bankBuys: RES,
  bankRate(s, p, give) {
    if (give === 'energy') return 2;
    if (give === 'science') return 3;
    let r = 4;
    for (const [v, b] of Object.entries(s.buildings)) {
      if (b.p !== p) continue;
      const port = K.V(s, +v).port;
      if (port === 'any') r = Math.min(r, 3); else if (port && port === give) r = 2;
    }
    return r;
  },
  onTurnStart: s => eventPhase(s),
  roll: s => roll(s),
};
const K = createKit(spec);

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  if (players.length < 2 || players.length > 4) fail('New Energies is for 2–4 players');
  const s = K.baseState({ id, mode: UNIT, players, options });
  s.board = generate('standard');
  s.robber = null;
  s.plants = []; s.plantSeq = 0;
  s.greenBuilt = s.players.map(() => 0);
  s.bag = shuffle(Object.entries(BROWN).flatMap(([k, n]) => Array(n).fill(k)));
  s.eventsSeq = 0; s.lastEvents = [];
  s.cheap = { fossil: 0, renewable: 0 };
  RES.forEach(r => { s.bank[r] = 19; });
  K.start(s);
  return s;
}

// ---------------------------------------------------------------- events
// every turn starts with 1-3 discs from the bag: more when the world is dirty
function eventPhase(s) {
  s.lastEvents = [];
  s.flags.extraPlant = 0;
  const n = discsPerTurn(s);
  drawDiscs(s, n);
}
function drawDiscs(s, n) {
  for (let i = 0; i < n; i++) {
    if (s.phase !== 'play') return;
    if (!s.bag.length) {
      endByBag(s);
      return;
    }
    const kind = s.bag.pop();
    const green = GREEN_ORDER.includes(kind);
    s.eventsSeq++;
    log(s, '{@p} draws an event disc: {#e}.', { p: s.current, e: kind });
    const note = applyEvent(s, kind);
    s.lastEvents.push({ kind, green, note: note || null, seq: s.eventsSeq });
  }
  if (!s.bag.length && s.phase === 'play') {
    log(s, 'The event bag is empty. The next disc ends the game.');
  }
}
function addHazard(s, target, what) {
  if (hazardsOnBoard(s) >= HAZARDS) { log(s, 'No hazard tokens are left.'); return false; }
  target.hazard = true;
  log(s, what.k, what.a);
  return true;
}
function applyEvent(s, kind) {
  const cur = s.current;
  switch (kind) {
    case 'smog': {
      const l = s.players.map((_, p) => lf(s, p));
      const max = Math.max(...l);
      if (max < 1) { log(s, 'The air stays clear.'); return 'clear'; }
      let hit = 0;
      s.players.forEach((_, p) => {
        if (l[p] !== max) return;
        const own = K.ownBuildings(s, p).filter(v => !s.buildings[v].hazard);
        const pick = own.find(v => s.buildings[v].type === 'city') ?? own[0];
        if (pick == null) return;
        if (addHazard(s, s.buildings[pick], { k: 'Smog settles over {@q}.', a: { q: p, v: pick } })) hit++;
      });
      return hit ? 'hazard' : 'clear';
    }
    case 'blackout': {
      const pool = s.plants.filter(x => x.kind === 'fossil' && !x.hazard);
      if (!pool.length) { log(s, 'Nothing is hit by the blackout.'); return 'clear'; }
      const x = pool[Math.floor(Math.random() * pool.length)];
      return addHazard(s, x, { k: 'A blackout hits a fossil plant of {@q}.', a: { q: x.p, id: x.id } }) ? 'hazard' : 'clear';
    }
    case 'drought': {
      const hexes = s.board.hexes.filter(h => h.number && TERRAIN_RES[h.terrain]);
      const owners = [];
      hexes.forEach(h => h.verts.forEach(v => { const b = s.buildings[v]; if (b && !b.hazard) owners.push([v, h.id]); }));
      if (!owners.length) { log(s, 'The drought passes without damage.'); return 'clear'; }
      const [v, h] = owners[Math.floor(Math.random() * owners.length)];
      return addHazard(s, s.buildings[v], { k: 'A drought parches the land around {@q}.', a: { q: s.buildings[v].p, v, h } }) ? 'hazard' : 'clear';
    }
    case 'fossilBoom':
      s.cheap.fossil = Math.min(2, s.cheap.fossil + 1);
      log(s, 'Cheap coal: the next fossil plant is free.');
      return 'cheap';
    case 'heatwave': {
      let any = false;
      s.players.forEach((pl, p) => {
        if (lf(s, p) < 2) return;
        const k = K.randomCard(s, pl, RES);
        if (!k) return;
        K.pay(s, pl, { [k]: 1 });
        log(s, '{@p} loses a card to the heat wave.', { p });
        any = true;
      });
      return any ? 'loss' : 'clear';
    }
    case 'energyCrisis': {
      s.players.forEach((pl, p) => {
        if (pl.res.energy >= 1) { K.pay(s, pl, { energy: 1 }); log(s, '{@p} spends 1 energy in the energy crisis.', { p }); return; }
        const k = K.randomCard(s, pl, RES);
        if (k) { K.pay(s, pl, { [k]: 1 }); log(s, '{@p} loses a card in the energy crisis.', { p }); }
      });
      return 'loss';
    }
    case 'sun': {
      s.players.forEach((pl, p) => {
        const n = plantsOf(s, p, 'renewable').filter(x => !x.hazard && !s.buildings[x.v].hazard).length;
        if (!n) return;
        const got = K.take(s, pl, 'energy', n);
        if (got) { s.stats.gained[p] += got; log(s, '{@p} receives {$c}.', { p, c: { energy: got } }); }
      });
      return 'gain';
    }
    case 'cleanAir': {
      const b = Object.entries(s.buildings).find(([, x]) => x.p === cur && x.hazard);
      const pl = s.plants.find(x => x.p === cur && x.hazard);
      if (b) { b[1].hazard = false; log(s, 'The wind clears the hazard over {@p}.', { p: cur }); return 'cleared'; }
      if (pl) { pl.hazard = false; log(s, 'The wind clears the hazard over {@p}.', { p: cur }); return 'cleared'; }
      log(s, 'The wind blows, but there is nothing to clear.');
      return 'clear';
    }
    case 'subsidy':
      s.cheap.renewable = Math.min(2, s.cheap.renewable + 1);
      log(s, 'Green subsidy: the next renewable plant costs 1 science less.');
      return 'cheap';
    case 'research': {
      const got = K.take(s, K.P(s, cur), 'science', 2);
      if (got) { s.stats.gained[cur] += got; log(s, '{@p} receives {$c}.', { p: cur, c: { science: got } }); }
      return 'gain';
    }
    case 'bonus': {
      let any = false;
      s.players.forEach((pl, p) => {
        if (lf(s, p) > -1) return;
        const got = K.take(s, pl, 'energy', 2);
        if (got) { s.stats.gained[p] += got; log(s, '{@p} receives {$c}.', { p, c: { energy: got } }); any = true; }
      });
      return any ? 'gain' : 'clear';
    }
    default: return null;
  }
}
// the bag ran dry: the greenest builder wins, if there is one
function endByBag(s) {
  const bal = s.players.map((_, p) => plantsOf(s, p, 'renewable').length - plantsOf(s, p, 'fossil').length);
  const best = Math.max(...bal);
  if (best <= 0) {
    s.lost = true;
    K.finish(s, null, 'The event bag is empty and nobody built more renewable than fossil plants. Everybody loses.');
    return;
  }
  const cand = bal.map((b, p) => [b, p]).filter(([b]) => b === best).map(([, p]) => p);
  cand.sort((a, b) => vp(s, b) - vp(s, a));
  const w = cand[0];
  s.lost = false;
  K.finish(s, w, 'The event bag is empty. {@p} built the greenest world and wins!', { p: w });
}

// ---------------------------------------------------------------- dice and production
function roll(s) {
  const total = K.rollDice(s);
  if (total === 7) {
    log(s, 'A 7: the grid is overloaded.');
    K.sevenDiscards(s);
    drawDiscs(s, 1);
    return;
  }
  produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  const add = (p, k, n) => { want[p][k] = (want[p][k] || 0) + n; };
  for (const h of s.board.hexes.filter(x => x.number === total)) {
    const res = TERRAIN_RES[h.terrain];
    for (const v of h.verts) {
      const b = s.buildings[v];
      if (!b || b.hazard || !res) continue;
      add(b.p, res, 1);
      if (b.type === 'city') add(b.p, 'science', 1);
    }
    for (const x of s.plants) {
      if (x.hex !== h.id || x.hazard || s.buildings[x.v].hazard) continue;
      add(x.p, 'energy', OUTPUT[x.kind]);
    }
  }
  // bank shortage: nobody gets a resource the bank cannot cover (unless only one player is waiting for it)
  for (const r of RES) {
    const takers = want.map((w, p) => [p, w[r] || 0]).filter(([, n]) => n > 0);
    if (takers.reduce((a, [, n]) => a + n, 0) > s.bank[r] && takers.length > 1) {
      takers.forEach(([p]) => { delete want[p][r]; });
      log(s, 'The bank ran short of {#r}; nobody receives it.', { r });
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

// ---------------------------------------------------------------- power plants
const freeSlots = (s, v) => SLOTS[s.buildings[v].type] - s.plants.filter(x => x.v === v).length;
function plantCost(s, kind) {
  let c = PLANT_COST[kind];
  if (kind === 'fossil' && s.cheap.fossil > 0) c = 0;
  if (kind === 'renewable' && s.cheap.renewable > 0) c = Math.max(1, c - 1);
  return c;
}
const plantHexes = (s, v) => K.V(s, v).hexes.filter(h => s.board.hexes[h].number && TERRAIN_RES[s.board.hexes[h].terrain]);
function plantLimit(s, p) { return s.flags.plantBuilt >= 1 + (s.flags.extraPlant || 0); }

const HANDLERS = {
  ...K.HANDLERS,
  buildPlant(s, p, a) {
    K.requireActor(s, p);
    const kind = a.kind;
    if (!PLANT_COST[kind]) fail('Pick a plant type.');
    const b = s.buildings[a.v];
    if (!b || b.p !== p) fail('Pick one of your towns or cities.');
    if (freeSlots(s, a.v) < 1) fail('That building has no free slot.');
    if (!plantHexes(s, a.v).includes(a.h)) fail('The plant goes on a tile next to the building.');
    if (plantLimit(s, p)) fail('Only one power plant per turn.');
    if (plantsOf(s, p, kind).length >= PIECES[kind]) fail('No plants left.');
    const pl = K.P(s, p), cost = plantCost(s, kind);
    if (pl.res.science < cost) fail('You need more science.');
    const usedCheap = (kind === 'fossil' && s.cheap.fossil > 0) || (kind === 'renewable' && s.cheap.renewable > 0);
    if (cost) K.pay(s, pl, { science: cost });
    if (usedCheap) s.cheap[kind]--;
    s.plants.push({ id: ++s.plantSeq, p, kind, v: a.v, hex: a.h, hazard: false });
    s.flags.plantBuilt = (s.flags.plantBuilt || 0) + 1;
    log(s, kind === 'fossil' ? '{@p} built a fossil power plant.' : '{@p} built a renewable power plant.', { p, h: a.h });
    if (kind === 'renewable') {
      const type = GREEN_ORDER[s.greenBuilt[p] % GREEN_ORDER.length];
      s.greenBuilt[p]++;
      s.bag.splice(Math.floor(Math.random() * (s.bag.length + 1)), 0, type);
      log(s, '{@p} adds a green disc to the event bag.', { p });
    }
  },
  removeHazard(s, p, a) {
    K.requireMain(s, p);
    const target = a.plant != null ? s.plants.find(x => x.id === a.plant && x.p === p) : (s.buildings[a.v] && s.buildings[a.v].p === p ? s.buildings[a.v] : null);
    if (!target || !target.hazard) fail('There is no hazard there.');
    if (K.P(s, p).res.energy < 2) fail('You need 2 energy.');
    K.pay(s, K.P(s, p), { energy: 2 });
    target.hazard = false;
    log(s, '{@p} clears a hazard with energy.', { p });
  },
  demolishPlant(s, p, a) {
    K.requireMain(s, p);
    const x = s.plants.find(y => y.id === a.plant && y.p === p && y.kind === 'fossil');
    if (!x) fail('Pick one of your fossil plants.');
    if (K.P(s, p).res.energy < 3) fail('You need 3 energy.');
    K.pay(s, K.P(s, p), { energy: 3 });
    s.plants.splice(s.plants.indexOf(x), 1);
    log(s, '{@p} demolishes a fossil power plant.', { p });
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
  if (pend) { L.pending = pend.type; return L; }
  if (!K.isActor(s, me)) return L;
  const pl = K.P(s, me);
  L.roads = K.has(pl, COSTS.road) && K.countRoads(s, me) < PIECES.road ? K.legalRoads(s, me) : [];
  L.settlements = K.has(pl, COSTS.settlement) && K.count(s, me, 'settlement') < PIECES.settlement ? K.legalSettlements(s, me) : [];
  L.cities = K.has(pl, COSTS.city) && K.count(s, me, 'city') < PIECES.city ? K.ownBuildings(s, me, 'settlement') : [];
  // where plants can go: building -> its free tiles
  L.plantSpots = {};
  if (!plantLimit(s, me)) {
    for (const v of K.ownBuildings(s, me)) if (freeSlots(s, v) > 0) L.plantSpots[v] = plantHexes(s, v);
  }
  L.plantCost = { fossil: plantCost(s, 'fossil'), renewable: plantCost(s, 'renewable') };
  L.hazards = [
    ...Object.entries(s.buildings).filter(([, b]) => b.p === me && b.hazard).map(([v]) => ({ v: +v })),
    ...s.plants.filter(x => x.p === me && x.hazard).map(x => ({ plant: x.id })),
  ];
  L.demolish = s.plants.filter(x => x.p === me && x.kind === 'fossil').map(x => x.id);
  L.ratios = Object.fromEntries(HAND.filter(k => k !== 'ore' || true).map(k => [k, spec.bankRate(s, me, k)]));
  return L;
}
function viewFor(s, me) {
  const v = K.viewCommon(s, me, (st, i) => ({
    energy: st.players[i].res.energy, lf: lf(st, i),
    fossil: plantsOf(st, i, 'fossil').length, renewable: plantsOf(st, i, 'renewable').length,
    pieces: {
      roads: PIECES.road - K.countRoads(st, i), settlements: PIECES.settlement - K.count(st, i, 'settlement'), cities: PIECES.city - K.count(st, i, 'city'),
      fossil: PIECES.fossil - plantsOf(st, i, 'fossil').length, renewable: PIECES.renewable - plantsOf(st, i, 'renewable').length,
    },
  }));
  v.plants = s.plants;
  v.flags = { plantBuilt: s.flags.plantBuilt || 0, extraPlant: s.flags.extraPlant || 0, rolled: !!s.flags.rolled };
  v.cheap = s.cheap;
  v.energies = {
    bag: s.bag.length, brown: s.bag.filter(k => BROWN[k]).length, green: s.bag.filter(k => !BROWN[k]).length,
    gf: gf(s), discs: discsPerTurn(s), hazards: hazardsOnBoard(s), hazardMax: HAZARDS,
    last: s.lastEvents, cleanest: cleanest(s), lost: !!s.lost,
  };
  v.legal = legalFor(s, me);
  return v;
}

function migrate(s) { return s; }
module.exports = {
  createGame, act: (s, p, a) => K.act(s, p, a, HANDLERS), viewFor, summary: s => K.summary(s), migrate,
  _internal: { K, spec, lf, gf, produce, applyEvent, discsPerTurn, HANDLERS, BROWN, GREEN_ORDER, PIECES, COSTS, OUTPUT, TERRAIN_RES, HAND, RES },
};
