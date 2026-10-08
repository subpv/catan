'use strict';
// Rise of the Inkas. A standalone game on the classic island, played through three eras (Chavín, Moche, Inca). Goods
// come from the coast (fish), the rainforest (feathers), the highlands (coca) and the peaks (gold). The prize of every
// era is a handful of culture tokens (4 + 4 + 3 = 11) that players claim by bringing a whole set of goods as tribute.
// When the last token of an era is gone the era collapses: villages shrink to camps, jungle thickets creep over the
// land and the next tribe takes over. A 7 lets the jungle grow instead of a robber. Six culture tokens clinch the
// game; if nobody gets there, whoever holds the most tokens after the third era wins.
//
// The rules are rebuilt from public descriptions of the board game; the numbers (sets, costs, era effects) are this
// project's own balance.

const { generate, shuffle } = require('./board');
const { createKit, fail, log, sum } = require('./kit');

const RES = ['catch', 'feathers', 'coca', 'nugget']; // catch = fish, nugget = gold (the keys differ from the Traders ones on purpose)
const GOODS = ['catch', 'feathers', 'coca']; // what a tribute is made of; gold stands in for any of them
const TERRAIN_RES = { fields: 'catch', forest: 'feathers', pasture: 'coca', hills: 'coca', mountains: 'nugget' };
const PORT_RES = { lumber: 'feathers', brick: 'coca', wool: 'catch', grain: 'catch', ore: 'nugget', any: 'any' };
const PIECES = { road: 15, settlement: 5, city: 4 };
const MAX_THICKETS = 5;
const CLEAR_COST = { feathers: 1, coca: 1 };
const ERAS = [
  { id: 'chavin', tokens: 4, tribute: { catch: 1, feathers: 1, coca: 1 }, thickets: 0 },
  { id: 'moche', tokens: 4, tribute: { catch: 2, feathers: 1, coca: 2 }, thickets: 2 },
  { id: 'inca', tokens: 3, tribute: { catch: 2, feathers: 2, coca: 2 }, thickets: 3 },
];
const TOTAL = ERAS.reduce((a, e) => a + e.tokens, 0); // 11
const UNIT = 'inkas';
const COSTS = {
  road: { feathers: 1, coca: 1 },
  settlement: { catch: 1, feathers: 1, coca: 2 },
  city: { coca: 2, nugget: 2 },
};
const costsFor = s => ({ ...COSTS, road: s.era === 2 ? { coca: 1 } : COSTS.road });

// ---------------------------------------------------------------- points
const vp = (s, p) => s.culture[p];
function breakdown(s, p) {
  return { culture: s.culture[p], perEra: s.eraScore.map(e => e[p]), settlements: K.count(s, p, 'settlement'), cities: K.count(s, p, 'city'), total: vp(s, p) };
}

// ---------------------------------------------------------------- the kit
const spec = {
  hand: RES, limited: RES, tradeKeys: RES, vpTarget: 6, noLongestRoad: true,
  supply: () => ({ catch: 19, feathers: 19, coca: 25, nugget: 14 }),
  costs: (s) => costsFor(s), pieces: PIECES,
  terrainCard: t => TERRAIN_RES[t] || null,
  vp, breakdown,
  bankBuys: RES,
  bankRate(s, p, give) {
    let r = 4;
    for (const [v, b] of Object.entries(s.buildings)) {
      if (b.p !== p) continue;
      const port = K.V(s, +v).port;
      if (port === 'any') r = Math.min(r, 3); else if (port && port === give) r = 2;
    }
    return r;
  },
  onTurnStart: () => {},
  roll: s => roll(s),
};
const K = createKit(spec);

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  if (players.length < 2 || players.length > 4) fail('Rise of the Inkas is for 2–4 players');
  const s = K.baseState({ id, mode: UNIT, players, options });
  s.board = generate('standard');
  s.board.ports.forEach(p => { p.type = PORT_RES[p.type] || p.type; });
  s.board.vertices.forEach(v => { if (v.port) v.port = PORT_RES[v.port] || v.port; });
  s.robber = null;
  s.era = 0; s.left = ERAS[0].tokens;
  s.culture = s.players.map(() => 0);
  s.eraScore = ERAS.map(() => s.players.map(() => 0));
  s.thickets = [];
  s.claims = []; s.claimSeq = 0; // the last tributes, for the scene
  s.ending = null; s.endSeq = 0; // the last era change, for the scene
  RES.forEach(r => { s.bank[r] = spec.supply()[r]; });
  K.start(s);
  return s;
}

// ---------------------------------------------------------------- production and the jungle
const landHexes = s => s.board.hexes.filter(h => TERRAIN_RES[h.terrain]);
function eraBonus(s, h, b) {
  // Moche: the fisheries pay a camp 2 fish. Inca: the terraces pay a village 3 coca.
  if (s.era === 1 && h.terrain === 'fields' && b.type === 'settlement') return 1;
  if (s.era === 2 && (h.terrain === 'pasture' || h.terrain === 'hills') && b.type === 'city') return 1;
  return 0;
}
function roll(s) {
  const total = K.rollDice(s);
  if (total === 7) {
    log(s, 'A 7: the jungle creeps in.');
    K.sevenDiscards(s);
    K.pushPending(s, [{ type: 'thicket', player: s.current }]);
    return;
  }
  produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  for (const h of s.board.hexes.filter(x => x.number === total && !s.thickets.includes(x.id))) {
    const res = TERRAIN_RES[h.terrain];
    if (!res) continue;
    for (const v of h.verts) {
      const b = s.buildings[v];
      if (!b) continue;
      want[b.p][res] = (want[b.p][res] || 0) + (b.type === 'city' ? 2 : 1) + eraBonus(s, h, b);
    }
  }
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
function growThicket(s, h) {
  s.thickets.push(h);
  if (s.thickets.length > MAX_THICKETS) {
    const gone = s.thickets.shift();
    log(s, 'The oldest thicket withers away.', { h: gone });
  }
}

// ---------------------------------------------------------------- tributes and eras
// what a tribute costs this player: the era's set, with gold standing in for any good that is missing
function tributeFor(s, p) {
  const need = ERAS[s.era].tribute, have = K.P(s, p).res;
  const pay = {};
  let gold = 0;
  for (const g of GOODS) {
    const n = need[g] || 0, own = Math.min(n, have[g]);
    if (own) pay[g] = own;
    gold += n - own;
  }
  if (gold) pay.nugget = gold;
  return { need, pay, gold, ok: have.nugget >= gold };
}
function endEra(s) {
  const was = s.era;
  const shrunk = [];
  for (const [v, b] of Object.entries(s.buildings)) if (b.type === 'city') { b.type = 'settlement'; shrunk.push(+v); }
  s.thickets = [];
  if (was >= ERAS.length - 1) { endGame(s); return; }
  s.era = was + 1; s.left = ERAS[s.era].tokens;
  const free = shuffle(landHexes(s).map(h => h.id).filter(id => s.board.hexes[id].number));
  free.slice(0, ERAS[s.era].thickets).forEach(id => s.thickets.push(id));
  s.ending = { seq: ++s.endSeq, from: was, to: s.era, shrunk };
  log(s, 'The era ends: villages shrink to camps and the jungle claims the land. A new tribe rises.', { era: s.era });
}
function endGame(s) {
  const score = p => s.culture[p] * 1000 + K.count(s, p, 'city') * 10 + K.count(s, p, 'settlement');
  const best = Math.max(...s.players.map((_, p) => score(p)));
  const top = s.players.map((_, p) => p).filter(p => score(p) === best);
  const w = top[0];
  s.ending = { seq: ++s.endSeq, from: s.era, to: null, shrunk: [] };
  K.finish(s, w, 'The last era has ended. {@p} holds the most culture and wins!', { p: w });
}

// ---------------------------------------------------------------- handlers
const hasBuilding = (s, p, h) => s.board.hexes[h].verts.some(v => s.buildings[v] && s.buildings[v].p === p);
const thicketSpots = s => landHexes(s).filter(h => h.number && !s.thickets.includes(h.id)).map(h => h.id);
const HANDLERS = {
  ...K.HANDLERS,
  growThicket(s, p, a) {
    const it = K.findPending(s, p, 'thicket');
    if (!it) fail('Nothing to place.');
    if (!thicketSpots(s).includes(a.h)) fail('Pick a tile for the thicket.');
    const victims = [...new Set(s.board.hexes[a.h].verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p))].filter(q => K.handCount(s, K.P(s, q)) > 0);
    const q = victims.length ? (victims.length === 1 ? victims[0] : a.victim) : null;
    if (victims.length && !victims.includes(q)) fail('Pick a player to take a card from.');
    K.resolvePending(s, it);
    growThicket(s, a.h);
    log(s, '{@p} lets a thicket grow.', { p, h: a.h });
    if (q != null) {
      const k = K.randomCard(s, K.P(s, q), RES);
      if (k) { K.moveCard(K.P(s, q), K.P(s, p), k, 1); log(s, '{@p} takes a card from {@q}.', { p, q }); }
    }
  },
  clearThicket(s, p, a) {
    K.requireActor(s, p);
    if (!s.thickets.includes(a.h)) fail('There is no thicket there.');
    if (!hasBuilding(s, p, a.h)) fail('You need a camp or village next to the thicket.');
    const pl = K.P(s, p);
    if (!K.has(pl, CLEAR_COST)) fail('Not enough resources.');
    K.pay(s, pl, CLEAR_COST);
    s.thickets.splice(s.thickets.indexOf(a.h), 1);
    log(s, '{@p} clears a thicket.', { p, h: a.h });
  },
  tribute(s, p) {
    K.requireActor(s, p);
    if (s.flags.tribute) fail('Only one tribute per turn.');
    if (!K.ownBuildings(s, p).length) fail('You need a camp or village.');
    const t = tributeFor(s, p);
    if (!t.ok) fail('You lack the goods for the tribute.');
    K.pay(s, K.P(s, p), t.pay);
    s.flags.tribute = true;
    s.culture[p]++; s.eraScore[s.era][p]++; s.left--;
    s.claims.push({ seq: ++s.claimSeq, p, era: s.era, gold: t.gold });
    if (s.claims.length > 8) s.claims.shift();
    log(s, '{@p} brings a tribute and claims a culture token.', { p, era: s.era });
    if (s.culture[p] >= s.options.vpTarget) return; // clinched; checkWin ends the game
    if (s.left <= 0) endEra(s);
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
    if (pend.type === 'thicket') {
      L.thicket = {};
      thicketSpots(s).forEach(h => {
        L.thicket[h] = [...new Set(s.board.hexes[h].verts.map(v => s.buildings[v]).filter(b => b && b.p !== me).map(b => b.p))].filter(q => K.handCount(s, K.P(s, q)) > 0);
      });
    }
    return L;
  }
  if (!K.isActor(s, me)) return L;
  const pl = K.P(s, me), cost = costsFor(s);
  L.cost = cost;
  L.roads = K.has(pl, cost.road) && K.countRoads(s, me) < PIECES.road ? K.legalRoads(s, me) : [];
  L.settlements = K.has(pl, cost.settlement) && K.count(s, me, 'settlement') < PIECES.settlement ? K.legalSettlements(s, me) : [];
  L.cities = K.has(pl, cost.city) && K.count(s, me, 'city') < PIECES.city ? K.ownBuildings(s, me, 'settlement') : [];
  const t = tributeFor(s, me);
  L.tribute = { ...t, can: t.ok && !s.flags.tribute && K.ownBuildings(s, me).length > 0, used: !!s.flags.tribute };
  L.clear = s.thickets.filter(h => hasBuilding(s, me, h));
  L.clearCost = K.has(pl, CLEAR_COST) ? CLEAR_COST : null;
  L.ratios = Object.fromEntries(RES.map(k => [k, spec.bankRate(s, me, k)]));
  return L;
}
function viewFor(s, me) {
  const v = K.viewCommon(s, me, (st, i) => ({
    culture: st.culture[i], perEra: st.eraScore.map(e => e[i]),
    pieces: { roads: PIECES.road - K.countRoads(st, i), settlements: PIECES.settlement - K.count(st, i, 'settlement'), cities: PIECES.city - K.count(st, i, 'city') },
  }));
  v.inkas = {
    era: s.era, left: s.left, eras: ERAS.map(e => ({ id: e.id, tokens: e.tokens, tribute: e.tribute })), total: TOTAL,
    thickets: s.thickets, claims: s.claims, ending: s.ending,
  };
  v.legal = legalFor(s, me);
  v.flags = { rolled: !!s.flags.rolled, tribute: !!s.flags.tribute };
  return v;
}

function migrate(s) { return s; }
module.exports = {
  createGame, act: (s, p, a) => K.act(s, p, a, HANDLERS), viewFor, summary: s => K.summary(s), migrate,
  _internal: { K, spec, produce, HANDLERS, PIECES, COSTS, ERAS, TERRAIN_RES, RES, GOODS, tributeFor, endEra },
};
