'use strict';
// CATAN - Dawn of Humankind (Aufbruch der Menschheit): the world map with 49 landscape fields, camps that give yields,
// explorers that walk along paths with the help of Fur or Meat, discovery fields behind Clothing and Construction,
// camp sites that are worth victory points, two threats (Neanderthal and Saber-toothed tiger) and four progress tracks.
// First to 10 victory points wins. The rules follow the official rulebook (683221); see the README for the few
// places where the book leaves something open.
//
// Points come only from tiles and markers: camp site tiles (1 each), hunting markers (1 each), progress markers (1 each),
// Most Successful Hunter (1), Fastest Collector (2) and Collector (1). Camps on the board are worth nothing.

const { shuffle } = require('./board');
const { createKit, fail, log, sum } = require('./kit');
const MAP = require('./humankind-map');

const RES = ['fur', 'bone', 'meat', 'flint'];
const TERRAIN_RES = MAP.TERRAIN_RES; // forest -> fur, wasteland -> bone, grassland -> meat, mountains -> flint
const TRACKS = ['clothing', 'construction', 'food', 'hunt'];
const UNIT = 'humankind';
const PIECES = { explorers: 2, camps: 6 };
const COSTS = { explorer: { fur: 1, meat: 1 }, camp: { fur: 1, bone: 1, flint: 1 } };
// the cost of reaching level 1, 2, 3, 4 on any progress track (cost overview card)
const STEP_COST = [{ flint: 1 }, { bone: 1 }, { bone: 1, flint: 1 }, { meat: 1, bone: 1, flint: 1 }];
const BASE_RANGE = 3;
const REGIONS = ['europe', 'asia', 'australia', 'namerica', 'samerica'];
const COLORS = ['europe', 'asia', 'australia', 'america']; // the four colours of the camp site tiles
const colorOf = region => (region === 'namerica' || region === 'samerica' ? 'america' : region);
// what is on the back of the discovery tiles (page 10): per region, 1 hunting luck, 2 desertifications, a threat
const BACKS = {
  europe: ['jagd', 'erode:wasteland', 'erode:forest', 'threat'],
  asia: ['jagd', 'erode:mountains', 'erode:grassland', 'threat'],
  australia: ['jagd', 'erode:mountains', 'erode:wasteland', 'threat'],
  namerica: ['jagd', 'erode:grassland', 'erode:wasteland'],
  samerica: ['jagd', 'erode:forest', 'threat'],
};
// a threat may only stand in these regions
const THREAT_REGIONS = { neanderthal: ['europe', 'asia'], tiger: ['australia', 'namerica', 'samerica'] };
const THREATS = ['neanderthal', 'tiger'];

// ---------------------------------------------------------------- points
const bestOf = (s, p) => s.tiles[p];
function vp(s, p) {
  let n = s.owned[p].length + s.jagd.filter(x => x.by === p).length;
  n += TRACKS.filter(k => s.marks[k] === p).length;
  if (s.special.hunter === p) n += 1;
  if (s.special.fastest === p) n += 2;
  if (s.special.collectors.includes(p)) n += 1;
  return n;
}
function breakdown(s, p) {
  return {
    sites: s.owned[p].length, tiles: { ...bestOf(s, p) }, jagd: s.jagd.filter(x => x.by === p).map(x => x.region),
    progress: TRACKS.filter(k => s.marks[k] === p), hunter: s.special.hunter === p, fastest: s.special.fastest === p,
    collector: s.special.collectors.includes(p), finds: s.finds[p].length, total: vp(s, p),
  };
}

// ---------------------------------------------------------------- the kit
const spec = {
  hand: RES, limited: RES, tradeKeys: RES, vpTarget: 10,
  supply: () => Object.fromEntries(RES.map(r => [r, 20])),
  costs: COSTS, pieces: PIECES,
  terrainCard: t => TERRAIN_RES[t] || null,
  vp, breakdown,
  bankBuys: RES,
  handLimit: () => 7,
  bankRate: (s, p, give) => (RES.includes(give) ? 3 : 0),
  viewHex: (s, h) => ({ id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, dry: h.number == null, region: h.region, verts: h.verts }),
  onTurnStart: s => { s.explorers.forEach(e => { e.moved = false; }); s.lastFinds = []; },
  roll: s => roll(s),
};
const K = createKit(spec);
const { P, V } = K;

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  if (players.length < 3 || players.length > 4) fail('Dawn of Humankind is for 3 or 4 players');
  const s = K.baseState({ id, mode: UNIT, players, options });
  const n = players.length;
  s.board = MAP.buildBoard(n);
  s.options.free = !!s.options.free; // variable set-up: free founding of the first camps
  s.buildings = {}; s.roads = {};
  s.explorers = []; // { p, v, moved }
  s.tracks = players.map(() => ({ clothing: 0, construction: 0, food: 0, hunt: 0 }));
  s.tiles = players.map(() => ({ europe: 0, asia: 0, australia: 0, america: 0 }));
  s.owned = players.map(() => []); // camp site tiles (vertex ids)
  s.finds = players.map(() => []); // discovery tiles ('jagd' | 'erode' | 'threat')
  s.sites = { ...s.board.sites }; // vertex -> region while the tile still lies there
  s.jagd = REGIONS.map(region => ({ region, by: null }));
  s.marks = Object.fromEntries(TRACKS.map(k => [k, null]));
  s.special = { hunter: null, fastest: null, collectors: [], maxCollectors: n >= 4 ? 3 : 2 };
  s.threats = { neanderthal: null, tiger: null };
  s.lastFinds = []; s.findSeq = 0; s.lastSteal = null;
  // discovery tiles: every region's tiles are mixed and dealt face down onto its discovery fields
  s.df = [];
  for (const region of REGIONS) {
    const fields = s.board.dfs.filter(d => d.region === region);
    const backs = shuffle(BACKS[region].slice());
    fields.forEach((d, i) => { const [kind, terrain] = backs[i].split(':'); s.df.push({ id: d.id, region, kind, terrain: terrain || null, taken: null }); });
  }
  s.df.sort((a, b) => a.id - b.id);
  // starting resources: 1 fur and 1 bone from the supply
  s.players.forEach((_, p) => { K.take(s, P(s, p), 'fur', 1); K.take(s, P(s, p), 'bone', 1); });
  log(s, 'Game started. {@ps} take their seats.', { ps: s.players.map((_, i) => i) });
  if (s.options.free) {
    const order = [...Array(n).keys()];
    const q = [];
    order.forEach(p => q.push({ p, need: 'camp' }));
    [...order].reverse().forEach(p => q.push({ p, need: 'camp' }));
    order.forEach(p => q.push({ p, need: 'camp' }));
    [...order].reverse().forEach(p => q.push({ p, need: 'explorer' }));
    s.setup = { queue: q, idx: 0, need: 'camp', last: null };
    s.current = q[0].p;
    log(s, '{@p} places first.', { p: s.current });
  } else {
    s.board.standard.slice(0, n).forEach((set, p) => {
      set.camps.forEach(v => { s.buildings[v] = { p, type: 'camp' }; });
      s.explorers.push({ p, v: set.explorer, moved: false });
    });
    log(s, 'The printed start is set up: 3 camps and 1 explorer each.');
    beginPlay(s);
  }
  return s;
}
function beginPlay(s) {
  s.phase = 'play'; s.step = 'roll'; s.turn = 1; s.current = 0; s.setup = null;
  s.stats.turns = 1;
  log(s, 'Setup complete. {@p} begins.', { p: s.current });
  s.track = [];
  K.snapshot(s); s.track[0].t = 0;
}

// ---------------------------------------------------------------- the paths
const occupied = (s, v) => !!s.buildings[v] || s.explorers.some(e => e.v === v);
const dfAt = (s, v) => { const id = s.board.vertices[v].df; return id == null ? null : { def: s.board.dfs[id], state: s.df[id] }; };
const cond = (s, p, d) => s.tracks[p].clothing >= d.kl && s.tracks[p].construction >= d.ko;
const rangeOf = (s, p) => BASE_RANGE + s.tracks[p].food;
const passable = (s, p, v) => { const d = dfAt(s, v); return !d || cond(s, p, d.def); };
function distances(s, p, from, max) {
  const dist = new Map([[from, 0]]);
  let layer = [from];
  for (let step = 1; step <= max; step++) {
    const next = [];
    for (const v of layer) for (const a of s.board.vertices[v].adj) {
      if (dist.has(a) || !passable(s, p, a)) continue;
      dist.set(a, step); next.push(a);
    }
    layer = next;
  }
  return dist;
}
// where an explorer may stop: free crossings within its reach (nobody stands there, no camp)
function reach(s, p, from) {
  const dist = distances(s, p, from, rangeOf(s, p));
  return [...dist.entries()].filter(([v, d]) => d > 0 && !occupied(s, v)).map(([v]) => v);
}
// the way an explorer takes: of all ways within its reach the one that picks up the most discovery tiles
function planRoute(s, p, from, to) {
  const max = rangeOf(s, p);
  const dist = distances(s, p, from, max);
  const bits = new Map();
  for (const [v, d] of dist) { const f = dfAt(s, v); if (f && f.state.taken == null && d <= max) bits.set(v, 1 << bits.size); }
  const pop = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
  let layer = [{ v: from, mask: 0, prev: null }];
  const seen = new Set([`${from}|0`]);
  let best = null;
  for (let step = 1; step <= max && layer.length; step++) {
    const next = [];
    for (const node of layer) for (const a of s.board.vertices[node.v].adj) {
      if (!passable(s, p, a)) continue;
      const mask = node.mask | (bits.get(a) || 0);
      const k = `${a}|${mask}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const nn = { v: a, mask, prev: node };
      next.push(nn);
      if (a === to && (!best || pop(mask) > pop(best.mask))) best = nn;
    }
    layer = next;
  }
  if (!best) return null;
  const path = [];
  for (let n = best; n; n = n.prev) path.unshift(n.v);
  return path;
}

// ---------------------------------------------------------------- dice and yields
function roll(s) {
  const total = K.rollDice(s);
  if (total === 7) {
    log(s, 'A 7: nobody receives anything and the threats stir.');
    K.sevenDiscards(s);
    K.pushPending(s, [{ type: 'threat', player: s.current, optional: false, why: 'seven' }]);
    return;
  }
  produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  for (const h of s.board.hexes) {
    if (h.number !== total || THREATS.some(t => s.threats[t] === h.id)) continue;
    const res = TERRAIN_RES[h.terrain];
    for (const v of h.verts) {
      const b = s.buildings[v];
      if (b) want[b.p][res] = (want[b.p][res] || 0) + 1; // only camps harvest, never explorers
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
      const g = K.take(s, P(s, p), k, n);
      if (g) { got[k] = g; s.stats.gained[p] += g; }
    }
    if (Object.keys(got).length) log(s, '{@p} receives {$c}.', { p, c: got });
  });
}

// ---------------------------------------------------------------- tiles, markers, awards
function updateHunter(s, p) {
  const n = s.finds[p].length, h = s.special.hunter;
  if (n < 2 || h === p) return;
  if (h === null || n > s.finds[h].length) {
    s.special.hunter = p;
    log(s, '{@p} is now the Most Successful Hunter (+1 VP).', { p });
  }
}
function updateCollectors(s, p) {
  const t = s.tiles[p];
  if (!COLORS.every(c => t[c] > 0)) return;
  if (s.special.fastest === null) { s.special.fastest = p; log(s, '{@p} is the Fastest Collector (+2 VP).', { p }); return; }
  if (s.special.fastest === p || s.special.collectors.includes(p) || s.special.collectors.length >= s.special.maxCollectors) return;
  s.special.collectors.push(p);
  log(s, '{@p} becomes a Collector (+1 VP).', { p });
}
const erodeOptions = (s, terrain) => s.board.hexes.filter(h => h.region === 'africa' && h.terrain === terrain && h.number != null).map(h => h.id);
// the player reaches a discovery field: the tile is turned over, its effect happens at once, then it lies in front of the player
function takeTile(s, p, id) {
  const st = s.df[id], def = s.board.dfs[id];
  st.taken = p;
  s.finds[p].push(st.kind);
  const note = { seq: ++s.findSeq, p, df: id, region: st.region, kind: st.kind, terrain: st.terrain, v: def.v };
  s.lastFinds.push(note);
  log(s, '{@p} reaches a discovery field and turns over the tile.', { p, df: id, kind: st.kind });
  if (st.kind === 'jagd') {
    const m = s.jagd.find(x => x.region === st.region);
    if (m && m.by === null) { m.by = p; log(s, '{@p} takes the hunting marker of {#r} (+1 VP).', { p, r: st.region }); }
  } else if (st.kind === 'erode') {
    const opts = erodeOptions(s, st.terrain);
    if (!opts.length) log(s, 'No {#l} field in Africa has a number chip left.', { l: st.terrain });
    else if (opts.length === 1) removeChip(s, p, opts[0]);
    else K.pushPending(s, [{ type: 'erode', player: p, terrain: st.terrain }]);
  } else {
    K.pushPending(s, [{ type: 'threat', player: p, optional: false, why: 'tile' }]);
  }
  updateHunter(s, p);
}
function removeChip(s, p, h) {
  const hex = s.board.hexes[h];
  const n = hex.number;
  hex.number = null;
  log(s, '{@p} removes the number chip {n} from an African {#l} field.', { p, n, l: hex.terrain, h });
}

// ---------------------------------------------------------------- threats
const threatHexes = (s, t) => s.board.hexes.filter(h => THREAT_REGIONS[t].includes(h.region) && h.number != null && s.threats[t] !== h.id).map(h => h.id);
const victimsAt = (s, p, h) => [...new Set(s.board.hexes[h].verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p))]
  .filter(q => K.handCount(s, P(s, q)) > 0);
function moveThreat(s, p, t, h, victim) {
  s.threats[t] = h;
  log(s, '{@p} moves the {#t}.', { p, t, h });
  const victims = victimsAt(s, p, h);
  if (victims.length) {
    const q = victims.length === 1 ? victims[0] : victim;
    if (!victims.includes(q)) fail('Pick a player to take a card from.');
    const k = K.randomCard(s, P(s, q), RES);
    if (k) {
      K.moveCard(P(s, q), P(s, p), k, 1);
      s.lastSteal = { by: p, from: q, card: k, seq: (s.lastSteal ? s.lastSteal.seq : 0) + 1 };
      log(s, '{@p} stole a card from {@q}.', { p, q });
    }
  }
}

// ---------------------------------------------------------------- handlers
function campsLeft(s, p) { return PIECES.camps - K.count(s, p, 'camp'); }
const explorersOf = (s, p) => s.explorers.filter(e => e.p === p);
const nextToOwnCamp = (s, p, v) => s.board.vertices[v].adj.some(a => s.buildings[a] && s.buildings[a].p === p);
const isStart = (s, v) => !!s.board.vertices[v].start;
const placeableExplorerSpots = (s, p) => s.board.vertices.filter(x => x.kind === 'land' && x.df == null && !occupied(s, x.id) && nextToOwnCamp(s, p, x.id)).map(x => x.id);

function advanceSetup(s) {
  s.setup.idx++;
  if (s.setup.idx >= s.setup.queue.length) { beginPlay(s); return; }
  const e = s.setup.queue[s.setup.idx];
  s.current = e.p; s.setup.need = e.need;
}
// the kit's handlers for settlements, roads and cities make no sense here
const { placeSettlement, placeRoad, buildRoad, buildSettlement, buildCity, ...KIT_HANDLERS } = K.HANDLERS;
const HANDLERS = {
  ...KIT_HANDLERS,
  // the free founding (variable set-up): camps on the Startplätze, then one explorer
  placeCamp(s, p, a) {
    if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'camp') fail('Not your placement.');
    if (!s.board.starts.includes(a.v) || occupied(s, a.v)) fail('Pick a free starting place in Africa.');
    s.buildings[a.v] = { p, type: 'camp' };
    log(s, '{@p} places a camp.', { p, v: a.v });
    advanceSetup(s);
  },
  placeExplorer(s, p, a) {
    if (s.phase === 'setup') {
      if (p !== s.current || s.setup.need !== 'explorer') fail('Not your placement.');
      if (!placeableExplorerSpots(s, p).includes(a.v)) fail('The explorer needs a free crossing next to one of your camps.');
      s.explorers.push({ p, v: a.v, moved: false });
      log(s, '{@p} places an explorer.', { p, v: a.v });
      advanceSetup(s);
      return;
    }
    K.requireActor(s, p);
    if (!placeableExplorerSpots(s, p).includes(a.v)) fail('The explorer needs a free crossing next to one of your camps.');
    const pl = P(s, p);
    if (!K.has(pl, COSTS.explorer)) fail('Not enough resources.');
    const mine = explorersOf(s, p);
    if (mine.length >= PIECES.explorers) {
      const gone = mine.find(e => e.v === a.remove && !e.moved);
      if (!gone) fail('First take one of your explorers off the board (one that has not moved this turn).');
      s.explorers.splice(s.explorers.indexOf(gone), 1);
    }
    K.pay(s, pl, COSTS.explorer);
    s.explorers.push({ p, v: a.v, moved: false });
    log(s, '{@p} places an explorer.', { p, v: a.v });
  },
  moveExplorer(s, p, a) {
    K.requireActor(s, p);
    const ex = s.explorers.find(e => e.p === p && e.v === a.from);
    if (!ex) fail('Pick one of your explorers.');
    if (ex.moved) fail('That explorer has already moved this turn.');
    if (!reach(s, p, ex.v).includes(a.to)) fail('The explorer cannot get there.');
    const pay = a.pay === 'meat' ? 'meat' : 'fur';
    const pl = P(s, p);
    if (!(pl.res[pay] > 0)) fail('Not enough resources.');
    const route = planRoute(s, p, ex.v, a.to);
    if (!route) fail('The explorer cannot get there.');
    K.pay(s, pl, { [pay]: 1 });
    ex.v = a.to; ex.moved = true;
    log(s, '{@p} moves an explorer.', { p, from: route[0], v: a.to, n: route.length - 1 });
    const seen = new Set();
    for (const v of route.slice(1)) {
      const f = dfAt(s, v);
      if (f && f.state.taken == null && !seen.has(v)) { seen.add(v); takeTile(s, p, f.def.id); }
    }
  },
  buildCamp(s, p, a) {
    K.requireActor(s, p);
    const ex = s.explorers.find(e => e.p === p && e.v === a.v);
    if (!ex) fail('Pick one of your explorers.');
    const region = s.sites[a.v];
    if (!region) fail('A camp can only be built on a free camp site with a tile.');
    const pl = P(s, p);
    if (!K.has(pl, COSTS.camp)) fail('Not enough resources.');
    if (campsLeft(s, p) <= 0) {
      const inAfrica = Object.entries(s.buildings).filter(([v, b]) => b.p === p && isStart(s, +v)).map(([v]) => +v);
      const mine = Object.entries(s.buildings).filter(([, b]) => b.p === p).map(([v]) => +v);
      const pool = inAfrica.length ? inAfrica : mine;
      const gone = pool.length === 1 ? pool[0] : a.remove;
      if (!pool.includes(gone)) fail('First take one of your camps off the board (from Africa if you have one there).');
      delete s.buildings[gone];
      log(s, '{@p} takes a camp from the board to set it up again.', { p, v: gone });
    }
    K.pay(s, pl, COSTS.camp);
    s.explorers.splice(s.explorers.indexOf(ex), 1);
    s.buildings[a.v] = { p, type: 'camp' };
    delete s.sites[a.v];
    s.owned[p].push(a.v);
    s.tiles[p][colorOf(region)]++;
    log(s, '{@p} turns an explorer into a camp and takes the tile (+1 VP).', { p, v: a.v, r: colorOf(region) });
    updateCollectors(s, p);
  },
  advance(s, p, a) {
    K.requireActor(s, p);
    const track = a.track;
    if (!TRACKS.includes(track)) fail('Pick a progress track.');
    const lvl = s.tracks[p][track];
    if (lvl >= 4) fail('That track is complete.');
    const cost = STEP_COST[lvl], pl = P(s, p);
    if (!K.has(pl, cost)) fail('Not enough resources.');
    K.pay(s, pl, cost);
    s.tracks[p][track] = lvl + 1;
    log(s, '{@p} reaches level {n} of {#t}.', { p, n: lvl + 1, t: track });
    if (lvl + 1 === 4 && s.marks[track] === null) { s.marks[track] = p; log(s, '{@p} is first on level 4 of {#t} and takes the marker (+1 VP).', { p, t: track }); }
    if (track === 'hunt') K.pushPending(s, [{ type: 'threat', player: p, optional: true, why: 'hunt' }]);
  },
  moveThreat(s, p, a) {
    const it = K.findPending(s, p, 'threat');
    if (!it) fail('Nothing to move.');
    if (!THREATS.includes(a.threat)) fail('Pick the Neanderthal or the Saber-toothed tiger.');
    if (!threatHexes(s, a.threat).includes(a.h)) fail('Pick a field for the threat.');
    const victims = victimsAt(s, p, a.h);
    if (victims.length > 1 && !victims.includes(a.victim)) fail('Pick a player to take a card from.');
    K.resolvePending(s, it);
    moveThreat(s, p, a.threat, a.h, a.victim);
  },
  skipThreat(s, p) {
    const it = K.findPending(s, p, 'threat');
    if (!it || !it.optional) fail('You have to move a threat.');
    K.resolvePending(s, it);
    log(s, '{@p} leaves the threats where they are.', { p });
  },
  erode(s, p, a) {
    const it = K.findPending(s, p, 'erode');
    if (!it) fail('Nothing to remove.');
    if (!erodeOptions(s, it.terrain).includes(a.h)) fail('Pick a field with a number chip.');
    K.resolvePending(s, it);
    removeChip(s, p, a.h);
  },
};
// ---------------------------------------------------------------- legal moves and view
function legalFor(s, me) {
  const L = {};
  if (s.phase === 'setup') {
    if (me !== s.current) return L;
    if (s.setup.need === 'camp') L.setupCamps = s.board.starts.filter(v => !occupied(s, v));
    else L.setupExplorers = placeableExplorerSpots(s, me);
    return L;
  }
  if (s.phase !== 'play') return L;
  const pend = K.findPending(s, me);
  if (pend) {
    L.pending = pend.type;
    if (pend.type === 'threat') {
      L.threat = {};
      for (const t of THREATS) { L.threat[t] = {}; threatHexes(s, t).forEach(h => { L.threat[t][h] = victimsAt(s, me, h); }); }
      L.threatOptional = !!pend.optional;
      L.threatNow = { ...s.threats };
    }
    if (pend.type === 'erode') L.erode = erodeOptions(s, pend.terrain);
    return L;
  }
  if (!K.isActor(s, me)) return L;
  const pl = P(s, me);
  L.cost = COSTS;
  L.range = rangeOf(s, me);
  const mine = explorersOf(s, me);
  L.explorerSpots = K.has(pl, COSTS.explorer) ? placeableExplorerSpots(s, me) : [];
  L.explorerRemove = mine.length >= PIECES.explorers ? mine.filter(e => !e.moved).map(e => e.v) : null;
  if (L.explorerRemove && !L.explorerRemove.length) L.explorerSpots = [];
  L.moves = {};
  if (pl.res.fur > 0 || pl.res.meat > 0) mine.filter(e => !e.moved).forEach(e => { const r = reach(s, me, e.v); if (r.length) L.moves[e.v] = r; });
  L.camps = K.has(pl, COSTS.camp) ? mine.filter(e => s.sites[e.v]).map(e => e.v) : [];
  if (campsLeft(s, me) <= 0) {
    const africa = Object.entries(s.buildings).filter(([v, b]) => b.p === me && isStart(s, +v)).map(([v]) => +v);
    L.campRemove = africa.length ? africa : Object.entries(s.buildings).filter(([, b]) => b.p === me).map(([v]) => +v);
  } else L.campRemove = null;
  L.advance = Object.fromEntries(TRACKS.map(k => [k, s.tracks[me][k] >= 4 ? null : { level: s.tracks[me][k] + 1, cost: STEP_COST[s.tracks[me][k]] }]));
  L.ratios = Object.fromEntries(RES.map(k => [k, spec.bankRate(s, me, k)]));
  return L;
}
function viewFor(s, me) {
  const v = K.viewCommon(s, me, (st, i) => ({
    tracks: st.tracks[i], tiles: st.tiles[i], finds: st.finds[i].length, owned: st.owned[i].length,
    jagd: st.jagd.filter(x => x.by === i).map(x => x.region), marks: TRACKS.filter(k => st.marks[k] === i),
    hunter: st.special.hunter === i, fastest: st.special.fastest === i, collector: st.special.collectors.includes(i),
    pieces: { explorers: PIECES.explorers - explorersOf(st, i).length, camps: campsLeft(st, i) },
  }));
  const b = s.board;
  v.board = {
    hexes: v.board.hexes,
    vertices: b.vertices.map(x => ({ id: x.id, x: x.x, y: x.y, kind: x.kind })),
    edges: b.edges.map(e => ({ id: e.id, v: e.v })),
    ports: [], border: b.border, starts: b.starts, side: b.side, clouds: b.clouds, home: b.home,
    dfs: b.dfs.map(d => ({ id: d.id, v: d.v, region: d.region, kl: d.kl, ko: d.ko })),
    siteRegions: Object.fromEntries(Object.entries(b.sites).map(([k, r]) => [k, r])),
  };
  v.humankind = {
    threats: s.threats, explorers: s.explorers.map(e => ({ p: e.p, v: e.v, moved: e.moved })),
    sites: s.sites, df: s.df.map(d => ({ id: d.id, region: d.region, taken: d.taken })),
    jagd: s.jagd, marks: s.marks, special: s.special, finds: s.lastFinds, free: !!s.options.free,
    range: s.phase === 'play' ? rangeOf(s, me >= 0 ? me : s.current) : BASE_RANGE,
    lastSteal: s.lastSteal ? { by: s.lastSteal.by, from: s.lastSteal.from, seq: s.lastSteal.seq, card: me === s.lastSteal.by || me === s.lastSteal.from ? s.lastSteal.card : null } : null,
  };
  v.legal = me >= 0 ? legalFor(s, me) : {};
  v.flags = { rolled: !!s.flags.rolled };
  return v;
}

function migrate(s) { return s; }
module.exports = {
  createGame, act: (s, p, a) => K.act(s, p, a, HANDLERS), viewFor, summary: s => K.summary(s), migrate,
  _internal: { K, spec, produce, HANDLERS, PIECES, COSTS, STEP_COST, TRACKS, RES, REGIONS, TERRAIN_RES, THREAT_REGIONS, MIN_PLAYERS: 3, minPlayers: 3, reach, planRoute, legalFor, takeTile, rangeOf },
};
