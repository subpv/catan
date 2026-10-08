'use strict';
// Dawn of Humankind. A standalone game on the classic island, set in the stone age: the world starts hidden in the
// mist, your trails reveal it tile by tile (and every new land hides a find: a rich hunting ground, a herd, a bright
// idea... or a sleeping Smilodon). Four resources (meat, hide, flint, bone), four progress tracks (Fire, Tools,
// Language, Art), a prowling Smilodon in place of the robber. First to 10 points wins.
//
// The rules are rebuilt from public descriptions of the board game; everything numeric (costs, track perks, find
// frequencies) is this project's own balance.

const { generate, shuffle } = require('./board');
const { createKit, fail, log, sum } = require('./kit');
const C = require('./constants');

const RES = ['meat', 'hide', 'flint', 'bone'];
const TERRAIN_RES = { forest: 'hide', hills: 'flint', pasture: 'meat', fields: 'meat', mountains: 'bone' };
const PORT_RES = { lumber: 'hide', brick: 'flint', wool: 'meat', grain: 'meat', ore: 'bone', any: 'any' };
const TRACKS = ['fire', 'tools', 'language', 'art'];
const TRACK_RES = { fire: 'meat', tools: 'flint', language: 'hide', art: 'bone' };
const STEP_COST = [2, 3, 4];
const PIECES = { road: 15, settlement: 5, city: 4 };
const FINDS = { bounty: 6, herd: 3, spark: 3, den: 2 }; // the rest of the land has nothing hidden
const UNIT = 'humankind';

const COSTS = {
  road: { hide: 1, flint: 1 },
  settlement: { hide: 1, flint: 1, meat: 2 },
  city: { meat: 2, bone: 3 },
};
// what the Tools track changes
function costsFor(s, p) {
  const tools = s.tracks[p].tools;
  return {
    road: tools >= 1 ? { hide: 1 } : COSTS.road,
    settlement: tools >= 2 ? { hide: 1, flint: 1, meat: 1 } : COSTS.settlement,
    city: tools >= 3 ? { meat: 2, bone: 2 } : COSTS.city,
  };
}

// ---------------------------------------------------------------- points
const pathfinder = s => {
  const max = Math.max(...s.explored);
  const top = s.explored.map((n, p) => [n, p]).filter(([n]) => n === max);
  return max >= 3 && top.length === 1 ? top[0][1] : null;
};
function trackVp(s, p) {
  const t = s.tracks[p];
  return (t.fire >= 3 ? 1 : 0) + (t.tools >= 3 ? 1 : 0) + (t.language >= 3 ? 1 : 0) + t.art;
}
function vp(s, p) {
  let pts = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) pts += b.type === 'city' ? 2 : 1;
  if (s.longestRoad.p === p) pts += 2;
  if (pathfinder(s) === p) pts += 2;
  return pts + trackVp(s, p);
}
function breakdown(s, p) {
  return {
    settlements: K.count(s, p, 'settlement'), cities: K.count(s, p, 'city'), longestRoad: s.longestRoad.p === p,
    pathfinder: pathfinder(s) === p, explored: s.explored[p], tracks: { ...s.tracks[p] }, trackVp: trackVp(s, p), total: vp(s, p),
  };
}

// ---------------------------------------------------------------- the kit
const spec = {
  hand: RES, limited: RES, tradeKeys: RES, vpTarget: 10,
  supply: () => ({ meat: 25, hide: 19, flint: 19, bone: 19 }),
  costs: costsFor, pieces: PIECES,
  terrainCard: t => TERRAIN_RES[t] || null,
  vp, breakdown,
  bankBuys: RES,
  handLimit: (s, p) => 7 + 2 * s.tracks[p].fire,
  bankRate(s, p, give) {
    const lang = s.tracks[p].language;
    let r = 4;
    for (const [v, b] of Object.entries(s.buildings)) {
      if (b.p !== p) continue;
      const port = K.V(s, +v).port;
      if (port === 'any') r = Math.min(r, 3); else if (port && port === give) r = 2;
    }
    if (lang >= 1) r = Math.min(r, 3);
    if (lang >= 2 && (give === 'meat' || give === 'hide')) r = Math.min(r, 2);
    if (lang >= 3) r = Math.min(r, 2);
    return r;
  },
  viewHex: (s, h) => (s.seen[h.id]
    ? { id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, verts: h.verts }
    : { id: h.id, x: h.x, y: h.y, terrain: 'fog', number: null, verts: h.verts }),
  afterSetupSettlement: (s, p, v) => reveal(s, p, [v], true),
  afterSetupRoad: (s, p, e) => reveal(s, p, K.E(s, e).v, true),
  afterRoad: (s, p, e) => reveal(s, p, K.E(s, e).v, false),
  onTurnStart: s => { s.lastFinds = []; },
  roll: s => roll(s),
};
const K = createKit(spec);

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  if (players.length < 2 || players.length > 4) fail('Dawn of Humankind is for 2–4 players');
  const s = K.baseState({ id, mode: UNIT, players, options });
  s.board = generate('standard');
  // harbors trade the new resources
  s.board.ports.forEach(p => { p.type = PORT_RES[p.type] || p.type; });
  s.board.vertices.forEach(v => { if (v.port) v.port = PORT_RES[v.port] || v.port; });
  s.robber = null;
  s.seen = s.board.hexes.map(() => false);
  const land = s.board.hexes.filter(h => TERRAIN_RES[h.terrain]);
  const deck = shuffle([...Object.entries(FINDS).flatMap(([k, n]) => Array(n).fill(k)), ...Array(Math.max(0, land.length - sum(FINDS))).fill('none')]);
  s.finds = {};
  land.forEach((h, i) => { s.finds[h.id] = deck[i] || 'none'; });
  const desert = s.board.hexes.find(h => h.terrain === 'desert');
  s.beast = desert ? desert.id : land[0].id;
  s.tracks = s.players.map(() => ({ fire: 0, tools: 0, language: 0, art: 0 }));
  s.ideas = s.players.map(() => 0);
  s.explored = s.players.map(() => 0);
  s.lastFinds = []; s.findSeq = 0;
  RES.forEach(r => { s.bank[r] = spec.supply()[r]; });
  K.start(s);
  return s;
}

// ---------------------------------------------------------------- exploring
function reveal(s, p, verts, setup) {
  const fresh = [];
  for (const v of verts) for (const h of K.V(s, v).hexes) {
    const hex = s.board.hexes[h];
    if (hex.terrain === 'sea' || s.seen[h]) continue;
    s.seen[h] = true;
    fresh.push(h);
  }
  if (setup) { fresh.forEach(h => { s.finds[h] = 'none'; }); return; }
  for (const h of fresh) {
    s.explored[p]++;
    applyFind(s, p, h);
  }
  if (fresh.length) {
    const was = s._pf;
    const now = pathfinder(s);
    if (now !== was) {
      s._pf = now;
      if (now !== null) log(s, '{@p} is now the Pathfinder: the most explored land.', { p: now });
    }
  }
}
function applyFind(s, p, h) {
  const kind = s.finds[h] || 'none';
  s.finds[h] = 'none';
  const hex = s.board.hexes[h];
  const pl = K.P(s, p);
  const note = { seq: ++s.findSeq, p, h, kind };
  switch (kind) {
    case 'bounty': {
      const res = TERRAIN_RES[hex.terrain];
      const got = res ? K.take(s, pl, res, 2) : 0;
      if (got) { s.stats.gained[p] += got; note.cards = { [res]: got }; log(s, '{@p} discovers new land and finds {$c}.', { p, h, c: note.cards }); }
      else { note.kind = 'none'; log(s, '{@p} discovers new land.', { p, h }); }
      break;
    }
    case 'herd': {
      const c = {};
      const m = K.take(s, pl, 'meat', 1), hd = K.take(s, pl, 'hide', 1);
      if (m) c.meat = m; if (hd) c.hide = hd;
      if (sum(c)) { s.stats.gained[p] += sum(c); note.cards = c; log(s, '{@p} discovers new land and finds {$c}.', { p, h, c }); }
      else { note.kind = 'none'; log(s, '{@p} discovers new land.', { p, h }); }
      break;
    }
    case 'spark':
      s.ideas[p]++;
      log(s, '{@p} has a bright idea: the next step on a progress track is cheaper.', { p, h });
      break;
    case 'den': {
      s.beast = h;
      const k = K.randomCard(s, pl, RES);
      if (k) { K.pay(s, pl, { [k]: 1 }); note.lost = k; }
      log(s, '{@p} wakes a Smilodon in its den and loses a card.', { p, h });
      break;
    }
    default:
      log(s, '{@p} discovers new land.', { p, h });
  }
  s.lastFinds.push(note);
}

// ---------------------------------------------------------------- dice and production
function roll(s) {
  const total = K.rollDice(s);
  if (total === 7) {
    log(s, 'A 7: the Smilodon prowls.');
    K.sevenDiscards(s);
    K.pushPending(s, [{ type: 'beast', player: s.current }]);
    return;
  }
  produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  for (const h of s.board.hexes.filter(x => x.number === total && s.seen[x.id] && x.id !== s.beast)) {
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

// ---------------------------------------------------------------- the Smilodon
const victimsAt = (s, p, h) => [...new Set(s.board.hexes[h].verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p))]
  .filter(q => K.handCount(s, K.P(s, q)) > 0);
const beastHexes = s => s.board.hexes.filter(h => s.seen[h.id] && h.terrain !== 'sea' && h.id !== s.beast).map(h => h.id);

// ---------------------------------------------------------------- handlers
const stepCost = (s, p, track) => {
  const lvl = s.tracks[p][track];
  const base = STEP_COST[lvl];
  return s.ideas[p] > 0 ? Math.max(1, base - 1) : base;
};
const HANDLERS = {
  ...K.HANDLERS,
  moveBeast(s, p, a) {
    const it = K.findPending(s, p, 'beast');
    if (!it) fail('Nothing to move.');
    if (!beastHexes(s).includes(a.h)) fail('Pick a tile for the Smilodon.');
    const victims = victimsAt(s, p, a.h);
    let victim = null;
    if (victims.length) {
      victim = victims.length === 1 ? victims[0] : a.victim;
      if (!victims.includes(victim)) fail('Pick a player to take a card from.');
    }
    s.beast = a.h;
    K.resolvePending(s, it);
    log(s, '{@p} moves the Smilodon.', { p, h: a.h });
    if (victim != null) {
      const k = K.randomCard(s, K.P(s, victim), RES);
      if (k) {
        K.moveCard(K.P(s, victim), K.P(s, p), k, 1);
        s.lastSteal = { by: p, from: victim, card: k };
        log(s, '{@p} takes a card from {@q}.', { p, q: victim });
      }
    }
  },
  advance(s, p, a) {
    K.requireActor(s, p);
    const track = a.track;
    if (!TRACKS.includes(track)) fail('Pick a progress track.');
    const lvl = s.tracks[p][track];
    if (lvl >= 3) fail('That track is complete.');
    const res = TRACK_RES[track], cost = stepCost(s, p, track);
    const pl = K.P(s, p);
    if (pl.res[res] < cost) fail('Not enough resources.');
    if (s.ideas[p] > 0) s.ideas[p]--;
    K.pay(s, pl, { [res]: cost });
    s.tracks[p][track] = lvl + 1;
    log(s, '{@p} reaches level {n} of {#k}.', { p, n: lvl + 1, k: track });
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
    if (pend.type === 'beast') {
      L.beast = {};
      beastHexes(s).forEach(h => { L.beast[h] = victimsAt(s, me, h); });
    }
    return L;
  }
  if (!K.isActor(s, me)) return L;
  const pl = K.P(s, me), cost = costsFor(s, me);
  L.cost = cost;
  L.roads = K.has(pl, cost.road) && K.countRoads(s, me) < PIECES.road ? K.legalRoads(s, me) : [];
  L.settlements = K.has(pl, cost.settlement) && K.count(s, me, 'settlement') < PIECES.settlement ? K.legalSettlements(s, me) : [];
  L.cities = K.has(pl, cost.city) && K.count(s, me, 'city') < PIECES.city ? K.ownBuildings(s, me, 'settlement') : [];
  L.advance = Object.fromEntries(TRACKS.map(k => [k, s.tracks[me][k] >= 3 ? null : { res: TRACK_RES[k], cost: stepCost(s, me, k) }]));
  L.ratios = Object.fromEntries(RES.map(k => [k, spec.bankRate(s, me, k)]));
  return L;
}
function viewFor(s, me) {
  const v = K.viewCommon(s, me, (st, i) => ({
    tracks: st.tracks[i], ideas: st.ideas[i], explored: st.explored[i],
    pieces: { roads: PIECES.road - K.countRoads(st, i), settlements: PIECES.settlement - K.count(st, i, 'settlement'), cities: PIECES.city - K.count(st, i, 'city') },
  }));
  v.humankind = {
    beast: s.seen[s.beast] ? s.beast : null,
    finds: s.lastFinds, pathfinder: pathfinder(s),
    hidden: s.seen.filter((x, i) => !x && s.board.hexes[i].terrain !== 'sea').length,
    lastSteal: s.lastSteal || null,
  };
  v.legal = legalFor(s, me);
  v.flags = { rolled: !!s.flags.rolled };
  return v;
}

function migrate(s) { return s; }
module.exports = {
  createGame, act: (s, p, a) => K.act(s, p, a, HANDLERS), viewFor, summary: s => K.summary(s), migrate,
  _internal: { K, spec, produce, HANDLERS, PIECES, COSTS, TERRAIN_RES, TRACKS, TRACK_RES, RES, applyFind, reveal, costsFor },
};
