'use strict';
// CATAN – New Energies (Energien / Energiewende), rebuilt after the official rulebook (Teuber, Kosmos 2024, no. 684365).
//
// The island of Catan starts the industrial age: every player begins with a village AND a research city. Cities make
// research cards, power plants turn the board's numbers into energy tokens. Brown plants (1 research card) are cheap
// but pollute, green plants (3 research cards) clean the air and put their green event chip into the bag. Every turn
// begins with 1-3 event chips drawn from the bag (the global pollution bar decides how many). A chip goes onto the
// slots of its event; when the last free slot of an event is filled the event happens. Brown events hurt (damages on
// number chips, villages and cities), green events reward the greenest players. The Environmental inspector replaces
// the robber. First to 10 points in their own turn wins; when the bag runs dry the game ends early and only a player
// with more green than brown plants can win (biggest difference).

const { generate, shuffle, expand } = require('../shared/board');
const { createKit, fail, log, sum } = require('../shared/kit');

// ---------------------------------------------------------------- the book's numbers
const RES = ['wood', 'clay', 'fiber', 'food', 'metal']; // Holz, Ziegel, Naturfasern, Nahrung, Metall
const HAND = [...RES, 'research', 'energy'];
const LIMITED = [...RES, 'research']; // the cards in the hand (energy tokens are no hand cards)
const TERRAIN_RES = { forest: 'wood', hills: 'clay', pasture: 'fiber', fields: 'food', mountains: 'metal' };
const PORT_RES = { lumber: 'wood', brick: 'clay', wool: 'fiber', grain: 'food', ore: 'metal' };
const PIECES = { road: 12, settlement: 5, city: 4, brown: 6, green: 9 };
const COSTS = {
  road: { wood: 1, clay: 1 },
  settlement: { wood: 1, clay: 1, fiber: 1, food: 1 },
  city: { food: 2, metal: 3 },
  dev: { metal: 1, fiber: 1, food: 1 },
};
const PLANT_COST = { brown: { research: 1 }, green: { research: 3 } };
const SUPPLY = { wood: 19, clay: 19, fiber: 19, food: 19, metal: 19, research: 20 };
const ENERGY_MAX = 5;
const DAMAGE_MAX = 10;
const HAND_LIMIT = 7, HAND_LIMIT_WAREHOUSE = 10;
const WAREHOUSE_COST = 2;
const SWAP_COST = 2;
// events: the number of slots on the frame, the colour of the chips that can trigger them
const EVENTS = {
  disaster: { slots: 4, tone: 'brown' }, // Umweltkatastrophe
  flood: { slots: 4, tone: 'brown' }, // Starkregen und Überflutung
  smog: { slots: 3, tone: 'brown' }, // Luftverschmutzung
  boom: { slots: 3, tone: 'brown' }, // Produktionssteigerung
  climate: { slots: 4, tone: 'neutral' }, // Klimakonferenz (brown and green chips)
  sustain: { slots: 3, tone: 'green' }, // Nachhaltige Produktion
  subsidy: { slots: 4, tone: 'green' }, // Staatliche Förderung
};
const BROWN_CHIPS = { climate: 9, boom: 9, smog: 9, flood: 8, disaster: 8 }; // 43 in the bag at the start
const GREEN_CHIPS = { 3: { climate: 3, sustain: 12, subsidy: 12 }, 4: { climate: 4, sustain: 16, subsidy: 16 } }; // 27 / 36
const DECK = { victoryPoint: 5, funding: 2, roadBuilding: 2, boost: 2, protection: 14 }; // 25 development cards
const CHIP_LETTERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11]; // chips A-R
const START_MARK = { 3: 9, 4: 12 }; // where the pollution marker starts (3 villages' worth per player)
const MARK_MAX = { 3: 21, 4: 28 };
// how many chips a turn begins with, by the marker's field on the global pollution bar
const chipsAt = m => (m <= 5 ? 2 : m <= 18 ? 1 : m <= 23 ? 2 : 3);
const UNIT = 'energies';

// ---------------------------------------------------------------- the kit
const ownPlants = (s, p, kind) => s.plants.filter(x => x.p === p && (!kind || x.kind === kind));
const nBrown = (s, p) => ownPlants(s, p, 'brown').length;
const nGreen = (s, p) => ownPlants(s, p, 'green').length;
// the personal environmental balance: the + symbols you show (villages 1, cities 2, brown plants 1) minus the - symbols (green plants)
function bal(s, p) { return K.count(s, p, 'settlement') + 2 * K.count(s, p, 'city') + nBrown(s, p) - nGreen(s, p); }
const pollution = s => s.players.reduce((a, _, p) => a + bal(s, p), 0);
const marker = s => Math.max(0, Math.min(MARK_MAX[s.players.length] || 28, pollution(s)));
const handLimit = (s, p) => (s.players[p].warehouse ? HAND_LIMIT_WAREHOUSE : HAND_LIMIT);
const dmgUsed = s => Object.keys(s.dmg.h).length + Object.keys(s.dmg.v).length;
const dmgLeft = s => DAMAGE_MAX - dmgUsed(s);
const hasDmgOn = s => dmgUsed(s) > 0;
// the 2 or 3 chips... are decided at the start of the turn; the marker only sets the number then
const hexRes = h => TERRAIN_RES[h.terrain] || null;
const numbered = h => !!h.number && !!hexRes(h);

function vp(s, p, showHidden) {
  let pts = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) pts += b.type === 'city' ? 2 : 1;
  if (s.longestRoad.p === p) pts += 2;
  if (s.activist && s.activist.p === p) pts += 2;
  if (showHidden !== false) pts += hiddenVp(s, p);
  return pts;
}
const hiddenVp = (s, p) => s.players[p].devs.filter(d => d.k === 'victoryPoint').length;
function breakdown(s, p) {
  return {
    settlements: K.count(s, p, 'settlement'), cities: K.count(s, p, 'city'), longestRoad: s.longestRoad.p === p,
    activist: !!s.activist && s.activist.p === p, vpCards: hiddenVp(s, p), brown: nBrown(s, p), green: nGreen(s, p), bal: bal(s, p),
    total: vp(s, p),
  };
}

const spec = {
  hand: HAND, limited: LIMITED, tradeKeys: HAND, vpTarget: 10, minPlayers: 3, maxPlayers: 4,
  supply: () => ({ ...SUPPLY }),
  costs: COSTS, pieces: PIECES,
  terrainCard: t => TERRAIN_RES[t] || null,
  vp, breakdown,
  bankBuys: [...RES, 'research'],
  handLimit,
  setupPays: false,
  longestLog: ['{@p} now holds the Longest Trade Route ({n}).', 'Nobody holds the Longest Trade Route any more.'],
  // 4:1 for resources (3:1 or 2:1 at harbors), 3:1 for research cards, 2:1 for energy tokens
  bankRate(s, p, give) {
    if (give === 'energy') return SWAP_COST;
    if (give === 'research') return 3;
    let r = 4;
    for (const [v, b] of Object.entries(s.buildings)) {
      if (b.p !== p) continue;
      const port = K.V(s, +v).port;
      if (port === 'any') r = Math.min(r, 3); else if (port && port === give) r = 2;
    }
    return r;
  },
  afterSetupSettlement(s, p, v) { // round 2: the research city
    if (s.setup.idx < s.players.length) return;
    s.buildings[v].type = 'city';
    s.log[s.log.length - 1].k = '{@p} placed a city.';
  },
  roll: s => roll(s),
  afterSetupRoad(s, p) {
    if (s.setup.idx < s.players.length) return;
    // first yields: 1 card per land tile around the research city, plus 1 research card
    const pl = K.P(s, p), got = {};
    for (const h of K.V(s, s.setup.last).hexes) {
      const k = hexRes(s.board.hexes[h]);
      if (k) { const m = K.take(s, pl, k, 1); if (m) got[k] = (got[k] || 0) + m; }
    }
    const r = K.take(s, pl, 'research', 1);
    if (r) got.research = r;
    if (sum(got)) { s.stats.gained[p] += sum(got); log(s, '{@p} receives {$c}.', { p, c: got }); }
  },
};
const K = createKit(spec);

// ---------------------------------------------------------------- board
function spiralNumbers(board) {
  const hexes = board.hexes;
  const ring = h => { const d = Math.hypot(h.x, h.y); return d < 0.5 ? 0 : d < 2.5 ? 1 : 2; };
  const ang = h => Math.atan2(-h.y, h.x); // counter-clockwise on the screen
  const byAngle = list => list.slice().sort((a, b) => ang(a) - ang(b));
  const rot = (list, i) => list.slice(i).concat(list.slice(0, i));
  const outer = byAngle(hexes.filter(h => ring(h) === 2));
  const corners = outer.map((h, i) => [h, i]).filter(([h]) => Math.hypot(h.x, h.y) > 3.3);
  const start = corners[Math.floor(Math.random() * corners.length)][1];
  const o = rot(outer, start);
  const last = o[o.length - 1];
  const mid = byAngle(hexes.filter(h => ring(h) === 1));
  let mi = 0, best = 1e9;
  mid.forEach((h, i) => { const d = Math.hypot(h.x - last.x, h.y - last.y); if (d < best) { best = d; mi = i; } });
  return [...o, ...rot(mid, mi), ...hexes.filter(h => ring(h) === 0)];
}
function buildBoard() {
  const b = generate('standard');
  const terrains = shuffle(expand({ forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 }));
  b.hexes.forEach((h, i) => { h.terrain = terrains[i]; h.number = null; });
  let ci = 0;
  for (const h of spiralNumbers(b)) {
    if (h.terrain === 'desert') continue;
    h.number = CHIP_LETTERS[ci++];
  }
  // harbours trade the book's resources
  b.ports.forEach(p => { p.type = PORT_RES[p.type] || p.type; });
  b.vertices.forEach(v => { if (v.port) v.port = PORT_RES[v.port] || v.port; });
  return b;
}

// ---------------------------------------------------------------- creation
function createGame({ id, players, options = {} }) {
  const n = players.length;
  if (n < 3 || n > 4) fail('New Energies is for 3–4 players');
  const s = K.baseState({ id, mode: UNIT, players, options });
  s.board = buildBoard();
  s.inspector = s.board.hexes.find(h => h.terrain === 'desert').id;
  s.plants = []; s.plantSeq = 0;
  s.dmg = { h: {}, v: {} }; // environmental damages on number chips (hex id) and villages / cities (vertex id)
  s.bag = shuffle(Object.entries(BROWN_CHIPS).flatMap(([k, c]) => Array.from({ length: c }, () => ({ k, g: false }))));
  s.slots = Object.fromEntries(Object.keys(EVENTS).map(k => [k, []])); // chips lying on each event's slots ('b' / 'g')
  const green = shuffle(Object.entries(GREEN_CHIPS[n]).flatMap(([k, c]) => Array(c).fill(k)));
  s.green = s.players.map((_, i) => green.slice(i * 9, i * 9 + 9)); // the hidden chips under each player's 9 green plants
  s.deck = shuffle(Object.entries(DECK).flatMap(([k, c]) => Array(c).fill(k)));
  s.activist = null;
  s.ev = null; s.eventSeq = 0; s.lastEvents = [];
  s.players.forEach(pl => { pl.devs = []; pl.played = {}; pl.warehouse = false; });
  Object.assign(s.bank, SUPPLY);
  K.start(s);
  return s;
}

// ---------------------------------------------------------------- small helpers
const order = s => s.players.map((_, i) => (s.current + i) % s.players.length);
const bldAt = (s, v) => s.buildings[v];
const victimsAt = (s, p, h) => [...new Set(s.board.hexes[h].verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p))];
const inspectorHexes = s => s.board.hexes.filter(h => h.id !== s.inspector && !s.dmg.h[h.id]).map(h => h.id);
const handKeys = (pl, keys = LIMITED) => keys.filter(k => pl.res[k] > 0);
// the players with the lowest / highest value (all of them in turn order), or [] when everybody is level
function extremes(s, fn, wantMax) {
  const vals = s.players.map((_, p) => fn(p));
  if (vals.every(v => v === vals[0])) return [];
  const target = wantMax ? Math.max(...vals) : Math.min(...vals);
  return order(s).filter(p => vals[p] === target);
}
const bestBal = s => extremes(s, p => bal(s, p), false);
const worstBal = s => extremes(s, p => bal(s, p), true);
function addEnergy(s, p, n) {
  const pl = K.P(s, p);
  const got = Math.max(0, Math.min(n, ENERGY_MAX - pl.res.energy));
  pl.res.energy += got;
  return got;
}
function takeable(s) { return [...RES, 'research'].filter(k => s.bank[k] > 0); }
function stealFrom(s, p, q) {
  const k = K.randomCard(s, K.P(s, q), LIMITED);
  if (!k) { log(s, '{@p} finds nothing to take from {@q}.', { p, q }); return; }
  K.moveCard(K.P(s, q), K.P(s, p), k, 1);
  s.lastSteal = { by: p, from: q, card: k, at: Date.now() };
  log(s, '{@p} stole a card from {@q}.', { p, q });
}

// ---------------------------------------------------------------- power plants
const plantsAt = (s, v) => s.plants.filter(x => x.v === v);
const slotsOf = (s, v) => (bldAt(s, v).type === 'city' ? 3 : 1);
const plantHexes = (s, v) => K.V(s, v).hexes.filter(h => numbered(s.board.hexes[h]));
// where p may put a plant: building -> its free numbered tiles (a city: 1 plant per tile and city)
function plantSpots(s, p) {
  const out = {};
  for (const v of K.ownBuildings(s, p)) {
    if (plantsAt(s, v).length >= slotsOf(s, v)) continue;
    const free = plantHexes(s, v).filter(h => !plantsAt(s, v).some(x => x.hex === h));
    if (free.length) out[v] = free;
  }
  return out;
}
function placePlant(s, p, kind, v, h) {
  const b = bldAt(s, v);
  if (!b || b.p !== p) fail('Pick one of your villages or research cities.');
  if (plantsAt(s, v).length >= slotsOf(s, v)) fail('That building has no free slot.');
  if (!plantHexes(s, v).includes(h) || plantsAt(s, v).some(x => x.hex === h)) fail('The power plant goes on a numbered tile next to the building.');
  if (ownPlants(s, p, kind).length >= PIECES[kind]) fail('No power plants of that kind left.');
  const x = { id: ++s.plantSeq, p, kind, v, hex: h };
  s.plants.push(x);
  return x;
}
function addGreenChip(s, p) {
  const k = s.green[p].pop();
  if (k) s.bag.push({ k, g: true });
  return k;
}

// ---------------------------------------------------------------- damages
function dmgTargets(s, p, kinds) { // own undamaged buildings of the given types
  return K.ownBuildings(s, p).filter(v => !s.dmg.v[v] && kinds.includes(s.buildings[v].type));
}
function putDmg(s, p, v) {
  if (dmgLeft(s) <= 0) { log(s, 'No environmental damages are left.'); return false; }
  s.dmg.v[v] = true;
  log(s, '{@p} gets an environmental damage on a {#t}.', { p, v, t: s.buildings[v].type === 'city' ? 'research city' : 'village' });
  return true;
}
// ask p to place a damage (auto when there is no choice)
function askDmg(s, p, options) {
  if (!options.length) { log(s, '{@p} has nothing left that a damage could hit.', { p }); return; }
  if (dmgLeft(s) <= 0) { log(s, 'No environmental damages are left.'); return; }
  if (options.length === 1) { putDmg(s, p, options[0]); return; }
  K.pushPending(s, [{ type: 'placeDamage', player: p, options }]);
}

// ---------------------------------------------------------------- events
function levelNote(s, kind) { return `${s.slots[kind].length}/${EVENTS[kind].slots}`; }
function eventDone(s, note) { if (note) Object.assign(s.lastEvents[s.lastEvents.length - 1], note); }
function applyEvent(s, kind) {
  const cur = s.current, ord = order(s);
  switch (kind) {
    case 'climate': { // best balance takes a card, worst gives one back
      const best = bestBal(s), worst = worstBal(s);
      if (!best.length) { log(s, 'Everybody is level: nothing happens.'); return; }
      const items = [];
      for (const p of best) if (takeable(s).length) items.push({ type: 'takeCard', player: p, why: 'climate' });
      for (const p of worst) if (handKeys(K.P(s, p)).length) items.push({ type: 'dropCard', player: p });
      log(s, 'Climate conference: {@ps} have the best balance, {@qs} the worst.', { ps: best, qs: worst });
      K.pushPending(s, items);
      return;
    }
    case 'sustain': {
      const top = extremes(s, p => nGreen(s, p), true);
      if (!top.length) { log(s, 'Everybody is level: nothing happens.'); return; }
      log(s, 'Sustainable production: {@ps} built the most green power plants.', { ps: top });
      K.pushPending(s, top.filter(() => takeable(s).length).map(p => ({ type: 'takeCard', player: p, why: 'sustain' })));
      return;
    }
    case 'subsidy': {
      const best = bestBal(s);
      if (!best.length) { log(s, 'Everybody is level: nothing happens.'); return; }
      for (const p of best) {
        const k = s.deck.shift();
        if (!k) { log(s, 'The development card deck is empty.'); break; }
        K.P(s, p).devs.push({ k, t: s.turn });
        log(s, '{@p} receives a development card from the state.', { p });
      }
      return;
    }
    case 'boom': {
      const worst = worstBal(s);
      if (!worst.length) { log(s, 'Everybody is level: nothing happens.'); return; }
      log(s, 'Production boom: {@ps} have the worst balance and may build a brown power plant for free.', { ps: worst });
      K.pushPending(s, worst.filter(p => nBrown(s, p) < PIECES.brown && Object.keys(plantSpots(s, p)).length).map(p => ({ type: 'freePlant', player: p })));
      return;
    }
    case 'smog': {
      const worst = worstBal(s);
      if (!worst.length) { log(s, 'Everybody is level: nothing happens.'); return; }
      for (const p of worst) {
        let opts = dmgTargets(s, p, ['city']);
        if (!opts.length) opts = dmgTargets(s, p, ['settlement']);
        askDmg(s, p, opts);
      }
      return;
    }
    case 'flood': {
      for (const p of ord) askDmg(s, p, dmgTargets(s, p, ['settlement', 'city']));
      return;
    }
    case 'disaster': {
      let a, b;
      do { a = K.d6(); b = K.d6(); } while (a + b === 7);
      const n = a + b;
      eventDone(s, { roll: [a, b] });
      log(s, 'Environmental disaster! {@p} rolls {n}.', { p: cur, n });
      let any = false;
      for (const h of s.board.hexes) {
        if (h.number !== n) continue;
        if (h.id === s.inspector || s.dmg.h[h.id]) continue;
        if (dmgLeft(s) <= 0) { log(s, 'No environmental damages are left.'); break; }
        s.dmg.h[h.id] = true; any = true;
        log(s, 'An environmental damage lands on the {n} of the {#t}.', { n, h: h.id, t: h.terrain });
      }
      if (!any) log(s, 'The disaster passes without damage.');
      return;
    }
    default:
  }
}

function drawOne(s) {
  const i = Math.floor(Math.random() * s.bag.length);
  const chip = s.bag.splice(i, 1)[0];
  s.ev.left--;
  const slot = s.slots[chip.k];
  slot.push(chip.g ? 'g' : 'b');
  const full = slot.length >= EVENTS[chip.k].slots;
  s.lastEvents.push({ seq: ++s.eventSeq, kind: chip.k, g: chip.g, trigger: full, fill: slot.length, slots: EVENTS[chip.k].slots, p: s.current });
  log(s, '{@p} draws an event chip: {#e} ({n}/{m}).', { p: s.current, e: chip.k, n: slot.length, m: EVENTS[chip.k].slots });
  if (full) {
    s.slots[chip.k] = []; // the chips go back into the box
    log(s, 'The event happens: {#e}!', { e: chip.k });
    applyEvent(s, chip.k);
  }
}
function runEvents(s) {
  while (s.ev && !s.pending.length && s.phase === 'play') {
    if (s.ev.left <= 0) {
      const ender = s.ev.ender;
      s.ev = null;
      if (ender) { endByBag(s); return; }
      s.flags.drawn = true;
      return;
    }
    if (!s.bag.length) { s.ev = null; endByBag(s); return; }
    drawOne(s);
  }
}
// the bag ran dry: only a player with more green than brown plants can win (largest difference)
function endByBag(s) {
  const diff = s.players.map((_, p) => nGreen(s, p) - nBrown(s, p));
  const best = Math.max(...diff);
  if (best <= 0) {
    s.lost = true;
    K.finish(s, null, 'The event bag is empty and nobody built more green than brown power plants. Everybody loses.');
    return;
  }
  const cand = order(s).filter(p => diff[p] === best);
  cand.sort((a, b) => vp(s, b) - vp(s, a));
  const w = cand[0];
  K.finish(s, w, 'The event bag is empty. {@p} invested most in green power plants and wins!', { p: w });
}

// ---------------------------------------------------------------- dice and production
function roll(s) {
  const total = K.rollDice(s);
  if (total === 7) {
    log(s, 'A 7: the Environmental inspector comes.');
    K.sevenDiscards(s);
    K.pushPending(s, [{ type: 'inspector', player: s.current }]);
    return;
  }
  produce(s, total);
}
function produce(s, total) {
  const want = s.players.map(() => ({}));
  const add = (p, k, n) => { want[p][k] = (want[p][k] || 0) + n; };
  const rolled = s.board.hexes.filter(h => h.number === total);
  for (const h of rolled) {
    const res = hexRes(h);
    if (!res || s.dmg.h[h.id] || h.id === s.inspector) continue; // damages and the inspector block a tile completely
    for (const v of h.verts) {
      const b = s.buildings[v];
      if (!b || s.dmg.v[v]) continue;
      add(b.p, res, 1);
      if (b.type === 'city') add(b.p, 'research', 1);
    }
    for (const x of s.plants) if (x.hex === h.id && !s.dmg.v[x.v]) add(x.p, 'energy', 1);
  }
  // not enough cards in the supply: nobody gets that card (unless only one player is waiting for it)
  for (const r of LIMITED) {
    const takers = want.map((w, p) => [p, w[r] || 0]).filter(([, n]) => n > 0);
    if (takers.reduce((a, [, n]) => a + n, 0) > s.bank[r] && takers.length > 1) {
      takers.forEach(([p]) => { delete want[p][r]; });
      log(s, 'The supply ran short of {#r}; nobody receives it.', { r });
    }
  }
  want.forEach((w, p) => {
    const got = {};
    for (const [k, n] of Object.entries(w)) {
      const g = k === 'energy' ? addEnergy(s, p, n) : K.take(s, K.P(s, p), k, n);
      if (g) { got[k] = g; s.stats.gained[p] += g; }
    }
    if (Object.keys(got).length) log(s, '{@p} receives {$c}.', { p, c: got });
  });
  // damages that blocked a rolled number are cleaned up now (not where the inspector stands)
  let cleaned = 0;
  for (const h of rolled) {
    if (h.id === s.inspector) continue;
    if (s.dmg.h[h.id]) { delete s.dmg.h[h.id]; cleaned++; }
    for (const v of h.verts) if (s.dmg.v[v]) { delete s.dmg.v[v]; cleaned++; }
  }
  if (cleaned) log(s, 'The Catanians clear {n} environmental damages.', { n: cleaned });
}

// ---------------------------------------------------------------- development cards
const DEV_KEYS = Object.keys(DECK);
const devUsable = (s, p, k) => s.players[p].devs.some(d => d.k === k && d.t !== s.turn);
function activistUpdate(s) {
  const cnt = s.players.map(pl => pl.played.protection || 0);
  const h = s.activist ? s.activist.p : null;
  let w = h;
  if (h === null) { const i = cnt.findIndex(c => c >= 3); w = i < 0 ? null : i; }
  else { const top = Math.max(...cnt); if (cnt[h] < top) w = cnt.indexOf(top); }
  if (w !== null && w !== h) { s.activist = { p: w }; log(s, '{@p} is now the most active environmentalist (+2 points).', { p: w }); }
}
function damageList(s) { // every damage on the board
  return [...Object.keys(s.dmg.h).map(h => ({ h: +h })), ...Object.keys(s.dmg.v).map(v => ({ v: +v }))];
}
function removeDmg(s, t) {
  if (t && t.h != null && s.dmg.h[t.h]) { delete s.dmg.h[t.h]; return true; }
  if (t && t.v != null && s.dmg.v[t.v]) { delete s.dmg.v[t.v]; return true; }
  return false;
}
function pickVictim(s, p, victims, given) {
  if (!victims.length) return null;
  const v = victims.length === 1 ? victims[0] : given;
  if (!victims.includes(v)) fail('Pick a player to take a card from.');
  return v;
}
const freeDevTurn = (s, p) => s.phase === 'play' && p === s.current && !s.pending.length && (s.step === 'roll' || s.step === 'main') && !s.ev;

// ---------------------------------------------------------------- handlers
const HANDLERS = {
  ...K.HANDLERS,
  // phase 1: draw the event chips (a development card may be played first)
  drawChips(s, p) {
    if (s.phase !== 'play' || p !== s.current || s.pending.length || s.step !== 'roll' || s.flags.drawn || s.ev) fail('Not allowed right now.');
    const m = marker(s), n = chipsAt(m);
    s.ev = { left: n, total: n, ender: s.bag.length < n };
    s.lastEvents = [];
    log(s, '{@p} draws {n} event chip(s). The pollution marker is on {m}.', { p, n, m });
    runEvents(s);
  },
  roll(s, p, a) {
    if (s.phase === 'play' && p === s.current && s.step === 'roll' && !s.flags.drawn && !s.pending.length) fail('Draw the event chips first.');
    K.HANDLERS.roll(s, p, a);
  },
  // answers to the events
  takeCard(s, p, a) {
    const it = K.findPending(s, p, 'takeCard');
    if (!it) fail('Nothing to take.');
    if (![...RES, 'research'].includes(a.key) || s.bank[a.key] < 1) fail('The supply has none of that left.');
    K.take(s, K.P(s, p), a.key, 1);
    s.stats.gained[p]++;
    log(s, '{@p} receives {$c}.', { p, c: { [a.key]: 1 } });
    K.resolvePending(s, it);
  },
  dropCard(s, p, a) {
    const it = K.findPending(s, p, 'dropCard');
    if (!it) fail('Nothing to give back.');
    if (!LIMITED.includes(a.key) || K.P(s, p).res[a.key] < 1) fail('You do not have that card.');
    K.pay(s, K.P(s, p), { [a.key]: 1 });
    log(s, '{@p} puts a card back into the supply.', { p });
    K.resolvePending(s, it);
  },
  placeDamage(s, p, a) {
    const it = K.findPending(s, p, 'placeDamage');
    if (!it) fail('Nothing to place.');
    if (!it.options.includes(a.v)) fail('Pick one of the marked buildings.');
    K.resolvePending(s, it);
    putDmg(s, p, a.v);
  },
  skipPlant(s, p) {
    const it = K.findPending(s, p, 'freePlant');
    if (!it) fail('Nothing to skip.');
    K.resolvePending(s, it);
    log(s, '{@p} does not build a free power plant.', { p });
  },
  buildPlant(s, p, a) {
    const it = K.findPending(s, p, 'freePlant');
    const kind = a.kind;
    if (!PLANT_COST[kind]) fail('Pick a power plant type.');
    if (it) { // production boom: one brown plant for free, plus a card of the tile's resource
      if (kind !== 'brown') fail('Only a brown power plant is free.');
      const x = placePlant(s, p, 'brown', a.v, a.h);
      K.resolvePending(s, it);
      log(s, '{@p} builds a free brown power plant.', { p, h: a.h });
      const res = hexRes(s.board.hexes[a.h]);
      const got = res ? K.take(s, K.P(s, p), res, 1) : 0;
      if (got) { s.stats.gained[p]++; log(s, '{@p} receives {$c}.', { p, c: { [res]: 1 } }); }
      return x;
    }
    K.requireActor(s, p);
    if (s.flags.plantBuilt) fail('Only one power plant per building phase.');
    const pl = K.P(s, p), cost = PLANT_COST[kind];
    if (!K.has(pl, cost)) fail('Not enough resources.');
    const x = placePlant(s, p, kind, a.v, a.h);
    K.pay(s, pl, cost);
    s.flags.plantBuilt = true;
    if (kind === 'brown') log(s, '{@p} built a brown power plant.', { p, h: a.h });
    else {
      log(s, '{@p} built a green power plant.', { p, h: a.h });
      if (addGreenChip(s, p)) log(s, '{@p} puts a green event chip into the bag.', { p });
    }
    return x;
  },
  // the 7: move the inspector and take a card
  moveInspector(s, p, a) {
    const it = K.findPending(s, p, 'inspector');
    if (!it) fail('Nothing to move.');
    if (!inspectorHexes(s).includes(a.h)) fail('Pick another tile without a damage on its number.');
    const victim = pickVictim(s, p, victimsAt(s, p, a.h), a.victim);
    K.resolvePending(s, it);
    s.inspector = a.h;
    log(s, '{@p} moves the Environmental inspector.', { p, h: a.h });
    if (victim !== null) stealFrom(s, p, victim);
  },
  // free roads from the Road building card
  buildRoad(s, p, a) {
    const it = K.findPending(s, p, 'freeRoad');
    if (!it) return K.HANDLERS.buildRoad(s, p, a);
    if (!K.legalRoads(s, p).includes(a.e)) fail('You cannot build a road there.');
    if (K.countRoads(s, p) >= PIECES.road) fail('No roads left.');
    s.roads[a.e] = p;
    log(s, '{@p} built a road.', { p });
    K.updateLongest(s);
    it.left--;
    if (it.left <= 0 || !K.legalRoads(s, p).length || K.countRoads(s, p) >= PIECES.road) K.resolvePending(s, it);
  },
  skipRoads(s, p) {
    const it = K.findPending(s, p, 'freeRoad');
    if (!it) fail('Nothing to skip.');
    K.resolvePending(s, it);
  },
  buildSettlement(s, p, a) { K.HANDLERS.buildSettlement(s, p, a); },
  // energy tokens
  buyWarehouse(s, p) {
    K.requireActor(s, p);
    const pl = K.P(s, p);
    if (pl.warehouse) fail('You already own a warehouse.');
    if (pl.res.energy < WAREHOUSE_COST) fail('You need 2 energy tokens.');
    K.pay(s, pl, { energy: WAREHOUSE_COST });
    pl.warehouse = true;
    log(s, '{@p} buys a warehouse: the hand limit is now 10.', { p });
  },
  removeDamage(s, p, a) { // 1 energy token removes any damage on the board
    K.requireActor(s, p);
    const pl = K.P(s, p);
    if (pl.res.energy < 1) fail('You need an energy token.');
    if (!removeDmg(s, a)) fail('There is no damage there.');
    K.pay(s, pl, { energy: 1 });
    log(s, '{@p} clears an environmental damage with an energy token.', { p });
  },
  demolishPlant(s, p, a) { // once per turn, after the roll
    K.requireActor(s, p);
    if (s.flags.demolished) fail('You may tear down only one power plant per turn.');
    const x = s.plants.find(y => y.id === a.plant && y.p === p && y.kind === 'brown');
    if (!x) fail('Pick one of your brown power plants.');
    const pl = K.P(s, p);
    if (pl.res.energy < 1) fail('You need an energy token.');
    K.pay(s, pl, { energy: 1 });
    s.plants.splice(s.plants.indexOf(x), 1);
    s.flags.demolished = true;
    log(s, '{@p} tears down a brown power plant.', { p });
  },
  // buying and playing development cards
  buyDev(s, p) {
    K.requireActor(s, p);
    const pl = K.P(s, p);
    if (!s.deck.length) fail('The development card deck is empty.');
    if (!K.has(pl, COSTS.dev)) fail('Not enough resources.');
    K.pay(s, pl, COSTS.dev);
    pl.devs.push({ k: s.deck.shift(), t: s.turn });
    log(s, '{@p} bought a development card.', { p });
  },
  playDev(s, p, a) {
    if (!freeDevTurn(s, p)) fail('Not allowed right now.');
    if (s.flags.devPlayed) fail('You may play only one development card per turn.');
    const k = a.card, pl = K.P(s, p);
    if (!DEV_KEYS.includes(k) || k === 'victoryPoint') fail('That card cannot be played.');
    let victim = null;
    const idx = pl.devs.findIndex(d => d.k === k && d.t !== s.turn);
    if (idx < 0) fail('You cannot play a card you just bought or received.');
    switch (k) {
      case 'roadBuilding':
        if (!K.legalRoads(s, p).length || K.countRoads(s, p) >= PIECES.road) fail('You cannot build a road anywhere.');
        break;
      case 'funding': {
        const take = a.take || {};
        if (!K.validCards(take, [...RES, 'research']) || sum(take) !== 2) fail('Choose exactly {n} cards.', { n: 2 });
        for (const [c, n] of Object.entries(take)) if (s.bank[c] < n) fail('The supply has none of that left.');
        break;
      }
      case 'boost': {
        const hs = [...new Set(a.hexes || [])];
        const mine = new Set(ownPlants(s, p, 'green').map(x => x.hex));
        if (!hs.length || hs.length > 3 || !hs.every(h => mine.has(h))) fail('Pick up to 3 different tiles where you have a green power plant.');
        break;
      }
      case 'protection': {
        if (a.mode === 'remove') {
          const tg = a.target || {};
          if (!hasDmgOn(s)) fail('There is no damage to remove.');
          if (!((tg.h != null && s.dmg.h[tg.h]) || (tg.v != null && s.dmg.v[tg.v]))) fail('There is no damage there.');
          victim = pickVictim(s, p, s.players.map((_, q) => q).filter(q => q !== p && bal(s, q) >= bal(s, p)), a.victim);
        } else {
          if (!inspectorHexes(s).includes(a.h)) fail('Pick another tile without a damage on its number.');
          victim = pickVictim(s, p, victimsAt(s, p, a.h), a.victim);
        }
        break;
      }
      default:
    }
    // all checks passed: the card is played
    pl.devs.splice(idx, 1);
    s.flags.devPlayed = true;
    log(s, '{@p} played {%c}.', { p, c: k });
    switch (k) {
      case 'roadBuilding': K.pushPending(s, [{ type: 'freeRoad', player: p, left: 2 }]); break;
      case 'funding': {
        for (const [c, n] of Object.entries(a.take)) K.take(s, pl, c, n);
        s.stats.gained[p] += 2;
        log(s, '{@p} receives {$c}.', { p, c: K.clean(a.take) });
        break;
      }
      case 'boost': {
        const got = {};
        for (const h of [...new Set(a.hexes)]) { const r = hexRes(s.board.hexes[h]); if (r && K.take(s, pl, r, 1)) got[r] = (got[r] || 0) + 1; }
        s.stats.gained[p] += sum(got);
        if (sum(got)) log(s, '{@p} receives {$c}.', { p, c: got });
        break;
      }
      case 'protection': {
        pl.played.protection = (pl.played.protection || 0) + 1;
        if (a.mode === 'remove') {
          removeDmg(s, a.target);
          log(s, '{@p} removes an environmental damage.', { p });
          if (victim !== null) stealFrom(s, p, victim);
        } else {
          s.inspector = a.h;
          log(s, '{@p} moves the Environmental inspector.', { p, h: a.h });
          if (victim !== null) stealFrom(s, p, victim);
        }
        activistUpdate(s);
        break;
      }
      default:
    }
  },
  // trading: the book forbids gifts, same-kind swaps and more than 5 energy tokens
  offerTrade(s, p, a) {
    const g = a.give || {}, w = a.get || {};
    if (Object.keys(g).some(k => g[k] > 0 && w[k] > 0)) fail('You may not swap a card for the same kind of card.');
    K.HANDLERS.offerTrade(s, p, a);
  },
  respondTrade(s, p, a) {
    const t = s.trade;
    if (a.accept && t && (t.give.energy || 0) + K.P(s, p).res.energy > ENERGY_MAX) fail('You may hold at most 5 energy tokens.');
    K.HANDLERS.respondTrade(s, p, a);
  },
  counterTrade(s, p, a) {
    const g = a.give || {}, w = a.get || {};
    if (Object.keys(g).some(k => g[k] > 0 && w[k] > 0)) fail('You may not swap a card for the same kind of card.');
    if (K.P(s, p).res.energy + (w.energy || 0) - (g.energy || 0) > ENERGY_MAX) fail('You may hold at most 5 energy tokens.');
    K.HANDLERS.counterTrade(s, p, a);
  },
  confirmTrade(s, p, a) {
    const t = s.trade;
    const x = t && t.responses[a.with] === 'counter' ? t.counters[a.with] : t;
    if (x && (x.get.energy || 0) + K.P(s, p).res.energy - (x.give.energy || 0) > ENERGY_MAX) fail('You may hold at most 5 energy tokens.');
    K.HANDLERS.confirmTrade(s, p, a);
  },
  bankTrade(s, p, a) {
    K.requireMain(s, p);
    const pl = K.P(s, p), give = a.give, get = a.get;
    if (!HAND.includes(give) || ![...RES, 'research'].includes(get) || give === get) fail('Pick what to trade.');
    if (give === 'research' && get === 'research') fail('Pick what to trade.');
    const ratio = spec.bankRate(s, p, give);
    if (pl.res[give] < ratio) fail('Not enough resources.');
    if (s.bank[get] < 1) fail('The supply has none of that left.');
    K.pay(s, pl, { [give]: ratio });
    K.take(s, pl, get, 1);
    log(s, '{@p} traded {$g} with the bank for {$w}.', { p, g: { [give]: ratio }, w: { [get]: 1 } });
  },
};

// act(): resolve the answer, then go on with the event chips that are still to be drawn
function act(s, p, a) {
  K.act(s, p, a, HANDLERS);
  if (s.ev && s.phase === 'play') {
    const v0 = s.version;
    runEvents(s);
    if (s.version === v0) s.version++;
  }
}

// ---------------------------------------------------------------- legal moves and view
function costsLeft(s, me) {
  const pl = K.P(s, me);
  return { road: K.countRoads(s, me) < PIECES.road, settlement: K.count(s, me, 'settlement') < PIECES.settlement, city: K.count(s, me, 'city') < PIECES.city, has: c => K.has(pl, c) };
}
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
    if (pend.type === 'inspector') { L.inspector = {}; inspectorHexes(s).forEach(h => { L.inspector[h] = victimsAt(s, me, h); }); }
    if (pend.type === 'freePlant') L.plantSpots = plantSpots(s, me);
    if (pend.type === 'freeRoad') L.roads = K.legalRoads(s, me);
    if (pend.type === 'takeCard') L.take = takeable(s);
    if (pend.type === 'placeDamage') L.damageOptions = pend.options;
    return L;
  }
  if (me !== s.current) return L;
  const pl = K.P(s, me);
  const dev = {};
  for (const k of DEV_KEYS) { const n = pl.devs.filter(d => d.k === k).length; if (n) dev[k] = { n, playable: k !== 'victoryPoint' && !s.flags.devPlayed && devUsable(s, me, k) }; }
  L.dev = dev;
  L.devCost = COSTS.dev;
  L.playDev = {
    freeSeat: freeDevTurn(s, me),
    roadSpots: K.legalRoads(s, me).length > 0 && K.countRoads(s, me) < PIECES.road,
    greenHexes: [...new Set(ownPlants(s, me, 'green').map(x => x.hex))],
    inspector: Object.fromEntries(inspectorHexes(s).map(h => [h, victimsAt(s, me, h)])),
    damages: damageList(s),
    worse: s.players.map((_, q) => q).filter(q => q !== me && bal(s, q) >= bal(s, me)),
    supply: takeable(s),
  };
  if (s.step === 'roll') { L.draw = !s.flags.drawn && !s.ev; L.chips = chipsAt(marker(s)); }
  if (!K.isActor(s, me)) return L;
  const c = costsLeft(s, me);
  L.roads = c.road && c.has(COSTS.road) ? K.legalRoads(s, me) : [];
  L.settlements = c.settlement && c.has(COSTS.settlement) ? K.legalSettlements(s, me) : [];
  L.cities = c.city && c.has(COSTS.city) ? K.ownBuildings(s, me, 'settlement') : [];
  L.plantSpots = s.flags.plantBuilt ? {} : plantSpots(s, me);
  L.plantCost = PLANT_COST;
  L.plantLeft = { brown: PIECES.brown - nBrown(s, me), green: PIECES.green - nGreen(s, me) };
  L.demolish = s.flags.demolished ? [] : ownPlants(s, me, 'brown').map(x => x.id);
  L.damages = damageList(s);
  L.warehouse = !pl.warehouse;
  L.ratios = Object.fromEntries(HAND.map(k => [k, spec.bankRate(s, me, k)]));
  return L;
}
const tableau = (s, i) => ({
  villages: K.count(s, i, 'settlement'), cities: K.count(s, i, 'city'), roads: K.countRoads(s, i),
  brown: nBrown(s, i), green: nGreen(s, i),
});
function viewFor(s, me) {
  const v = K.viewCommon(s, me, (st, i, self) => ({
    bal: bal(st, i), tab: tableau(st, i), warehouse: st.players[i].warehouse, energy: st.players[i].res.energy,
    devs: st.players[i].devs.length, protection: st.players[i].played.protection || 0, greenLeft: st.green[i].length,
    pieces: {
      roads: PIECES.road - K.countRoads(st, i), settlements: PIECES.settlement - K.count(st, i, 'settlement'), cities: PIECES.city - K.count(st, i, 'city'),
      brown: PIECES.brown - nBrown(st, i), green: PIECES.green - nGreen(st, i),
    },
    ...(self ? { devList: st.players[i].devs.map(d => ({ k: d.k, fresh: d.t === st.turn })) } : {}),
  }));
  v.plants = s.plants;
  v.damages = { h: Object.keys(s.dmg.h).map(Number), v: Object.keys(s.dmg.v).map(Number) };
  v.inspector = s.inspector;
  v.activist = s.activist ? s.activist.p : null;
  v.lastSteal = s.lastSteal && (s.lastSteal.by === me || s.lastSteal.from === me) ? s.lastSteal : null;
  v.flags = { rolled: !!s.flags.rolled, drawn: !!s.flags.drawn, plantBuilt: !!s.flags.plantBuilt, devPlayed: !!s.flags.devPlayed, demolished: !!s.flags.demolished };
  const m = marker(s);
  v.energies = {
    pollution: pollution(s), marker: m, markerMax: MARK_MAX[s.players.length], chips: chipsAt(m),
    bag: s.bag.length, brown: s.bag.filter(c => !c.g).length, green: s.bag.filter(c => c.g).length,
    slots: Object.fromEntries(Object.entries(EVENTS).map(([k, e]) => [k, { n: e.slots, tone: e.tone, fill: s.slots[k].slice() }])),
    last: s.lastEvents, deck: s.deck.length, damageLeft: dmgLeft(s), damageMax: DAMAGE_MAX,
    drawing: s.ev ? s.ev.left : 0, lost: !!s.lost,
  };
  v.legal = legalFor(s, me);
  return v;
}

// games saved by the first (unofficial) version of this mode cannot continue: they are closed as finished
function migrate(s) {
  if (!s || s.dmg) return s;
  const desert = s.board.hexes.find(h => h.terrain === 'desert');
  Object.assign(s, {
    phase: 'over', winner: null, lost: true, pending: [], trade: null, finishedAt: s.finishedAt || Date.now(), ev: null, lastEvents: [], plants: [], plantSeq: 0,
    dmg: { h: {}, v: {} }, bag: [], slots: Object.fromEntries(Object.keys(EVENTS).map(k => [k, []])), green: s.players.map(() => []), deck: [], activist: null,
    inspector: desert ? desert.id : 0, eventSeq: 0,
  });
  s.players.forEach(pl => { pl.devs = []; pl.played = {}; pl.warehouse = false; });
  return s;
}
module.exports = {
  createGame, act, viewFor, summary: s => K.summary(s), migrate,
  _internal: {
    K, spec, bal, pollution, marker, chipsAt, produce, applyEvent, runEvents, HANDLERS, PIECES, COSTS, EVENTS, RES, HAND, LIMITED, TERRAIN_RES,
    ENERGY_MAX, DAMAGE_MAX, DECK, BROWN_CHIPS, GREEN_CHIPS, PLANT_COST, plantSpots, nBrown, nGreen, dmgLeft, takeable, buildBoard, endByBag, victimsAt,
  },
};
