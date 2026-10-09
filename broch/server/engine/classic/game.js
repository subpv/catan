'use strict';
// Broch rules engine for the classic game. Pure state machine: createGame() -> state, act(state, seat, action) mutates state.
// viewFor(state, seat) returns what one player may see, including legal moves.
// Cities & Knights lives in ../knights/knights.js, Seafarers in ../seafarers and Traders & Barbarians in ../traders-barbarians;
// expansions.js glues the two expansions in. They all receive the helpers of this file at the bottom (core) and this file
// calls their hooks (KN.*, X.*) where they change a classic rule.

const C = require('../shared/constants');
const { generate, shuffle, expand } = require('../shared/board');

class GameError extends Error { constructor(msg, params) { super(msg); this.params = params; } }
const fail = (msg, params) => { throw new GameError(msg, params); };

const d6 = () => 1 + Math.floor(Math.random() * 6);
const isRes = t => C.RES.includes(t);
const isComm = t => C.COMM.includes(t);
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- creation

function createGame({ id, mode = 'classic', players, options = {} }) {
  if (!['classic', 'knights'].includes(mode)) fail('Unknown mode');
  if (players.length < 2 || players.length > 6) fail('Broch needs 2–6 players');
  const knights = mode === 'knights';
  const expansion = C.EXPANSIONS.includes(options.expansion) ? options.expansion : 'none';
  const sea = expansion === 'seafarers';
  // the 5–6 player set (30 tiles, 28 chips, 11 harbors) is needed from five players on; with fewer it is a switch (a bigger board)
  const big = players.length > 4 || (options.big ?? false);
  const scenario = X.SCENARIOS[options.scenario] ? options.scenario : 'shores';
  const kind = sea ? 'sea' : big ? 'extended' : 'standard';
  const def = C.BOARDS[big ? 'extended' : 'standard'];
  const variants = expansion === 'traders' ? X.hub.normalize(options.variants, { big, players: players.length, knights }) : {};
  const board = X.makeBoard({ expansion, mode, options: { ...options, big, scenario, variants }, players: players.length, generate });
  // the frame piece with the barbarian track replaces the frame piece with a 3:1 harbor (rulebook, set-up)
  if (knights && !sea) KN.dropHarbor(board);
  const defaultVp = (knights ? (expansion === 'seafarers' ? X.SCENARIOS[scenario].vp + 2 : 13) : sea ? X.SCENARIOS[scenario].vp : expansion === 'traders' ? X.hub.defaultVp(variants) : 10) + (knights && variants.harbors ? 1 : 0);
  const order = shuffle(players.map((_, i) => i));
  const seats = order.map(i => players[i]);
  const n = seats.length;
  const extraStart = !!options.expExtraStart && expansion !== 'traders' && !(board.rules && board.rules.thirdSettlement);
  const s = {
    id, mode, kind, expansion,
    options: {
      vpTarget: options.vpTarget || defaultVp,
      // 5–6 players: two players share every turn (stone 1 and stone 2, see nextTurn). The old special building phase is only kept for games saved before.
      specialBuild: false,
      paired: n > 4,
      // house rules (switches in the lobby); with all of them off the rulebook applies
      robberReturn: !!options.robberReturn,
      startBoth: !!options.startBoth,
      knightsFree: !!options.knightsFree && !knights,
      // experiment: building is allowed in every player's turn (after the dice), not only in your own
      vpAtOnce: !!options.vpAtOnce && !knights,
      expBuildAnytime: !!options.expBuildAnytime,
      // experiment: a third setup round - classic: 2 settlements + 1 city, Cities & Knights: 1 settlement + 2 cities
      expExtraStart: extraStart,
      big, scenario: sea ? scenario : null, variable: sea && !!options.variable, variants,
    },
    board,
    robber: expansion === 'traders' && X.hub.initialRobber(board, variants) !== undefined ? X.hub.initialRobber(board, variants) : board.desert != null ? board.desert : board.hexes.find(h => h.terrain === 'desert').id,
    buildings: {}, roads: {}, knights: {},
    players: seats.map((pl, i) => ({
      userId: pl.id, name: pl.name, color: pl.color || C.COLORS[i], country: pl.country || null,
      res: zero(C.RES), comm: zero(C.COMM),
      dev: [], devPlayed: 0, knightsPlayed: 0,
      ...KN.newPlayer(),
    })),
    phase: 'setup', step: null, turn: 0, current: 0,
    setup: { queue: [...[...Array(n).keys()], ...[...Array(n).keys()].reverse(), ...((board.rules && board.rules.thirdSettlement) || extraStart ? [...Array(n).keys()] : [])], idx: 0, need: 'settlement', last: null, payFrom: board.rules && board.rules.thirdSettlement ? 2 * n : n, ...(extraStart ? { needs: knights ? ['settlement', 'city', 'city'] : ['settlement', 'settlement', 'city'] } : {}) },
    dice: null, pending: [], pgroup: 0,
    bank: zero(C.RES),
    devDeck: knights ? [] : shuffle(expand(def.dev)),
    longestRoad: { p: null, len: 0 }, largestArmy: { p: null, count: 0 },
    trade: null, tradeSeq: 0,
    flags: {}, free: { roads: 0, promotes: 0 },
    sbp: null, pair: null,
    log: [], chat: [],
    stats: { rolls: zero([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), gained: seats.map(() => 0), robbed: seats.map(() => 0), turns: 0 },
    winner: null, startedAt: Date.now(), finishedAt: null, version: 0,
  };
  KN.initState(s);
  C.RES.forEach(r => { s.bank[r] = def.bank; });
  X.initState(s, { ...options, variants });
  s.current = s.setup.queue[0];
  log(s, 'Game started. {@ps} take their seats.', { ps: seats.map((_, i) => i) });
  log(s, '{@p} places first.', { p: s.current });
  return s;
}

// Log entries are English templates plus parameters so every client can translate them.
// Placeholders: {@x} player index (or list), {$x} cards object, {#x} game term, {%x} card name, {x} plain value.
function log(s, k, a = {}) {
  s.log.push({ turn: s.turn, k, a, at: Date.now() });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

// ---------------------------------------------------------------- helpers

const K = s => s.mode === 'knights';
const P = (s, i) => s.players[i];
const V = (s, v) => s.board.vertices[v];
const E = (s, e) => s.board.edges[e];

function hand(pl) { return sum(pl.res) + sum(pl.comm); }
function has(pl, cost) {
  return Object.entries(cost).every(([k, n]) => (k === 'gold' ? pl.gold : isRes(k) ? pl.res[k] : pl.comm[k]) >= n);
}
function pay(s, pl, cost) {
  for (const [k, n] of Object.entries(cost)) {
    if (k === 'gold') pl.gold -= n;
    else if (isRes(k)) { pl.res[k] -= n; s.bank[k] += n; } else pl.comm[k] -= n;
  }
}
function take(s, pl, type, n) {
  if (type === 'gold') { pl.gold += n; return n; }
  if (isRes(type)) {
    const got = Math.min(n, s.bank[type]);
    s.bank[type] -= got; pl.res[type] += got; return got;
  }
  pl.comm[type] += n; return n;
}
function moveCard(from, to, type, n = 1) {
  if (type === 'gold') { const k = Math.min(n, from.gold); from.gold -= k; to.gold += k; return k; }
  const a = isRes(type) ? 'res' : 'comm';
  const k = Math.min(n, from[a][type]);
  from[a][type] -= k; to[a][type] += k; return k;
}
function randomCard(pl) {
  const cards = [];
  for (const k of C.RES) for (let i = 0; i < pl.res[k]; i++) cards.push(k);
  for (const k of C.COMM) for (let i = 0; i < pl.comm[k]; i++) cards.push(k);
  return cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
}
function validCards(obj, knights, gold = false) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.entries(obj).every(([k, n]) => (isRes(k) || (knights && isComm(k)) || (gold && k === 'gold')) && Number.isInteger(n) && n >= 0);
}

function countPieces(s, p) {
  let settlements = 0, cities = 0, walls = 0, roads = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) {
    if (b.type === 'settlement') settlements++; else cities++;
    if (b.wall) walls++;
  }
  for (const o of Object.values(s.roads)) if (o === p) roads++;
  const knights = [0, 0, 0, 0];
  for (const k of Object.values(s.knights)) if (k.p === p) knights[k.level]++;
  return { settlements, cities, walls, roads, knights };
}
function handLimit(s, p) { return 7 + (K(s) ? KN.handLimitBonus(s, p) : 0); }

function occupied(s, v) { return !!(s.buildings[v] || s.knights[v]); }
function foreignAt(s, v, p) {
  const b = s.buildings[v], k = s.knights[v];
  return (b && b.p !== p) || (k && k.p !== p);
}
function touchesOwnRoad(s, v, p) { return V(s, v).edges.some(e => s.roads[e] === p); }
function touchesOwnRoute(s, v, p) { return V(s, v).edges.some(e => s.roads[e] === p || (s.ships[e] && s.ships[e].p === p)); }
function distanceOk(s, v) { return !s.buildings[v] && V(s, v).adj.every(a => !s.buildings[a]); }

// ---------------------------------------------------------------- victory points

function vp(s, p, includeHidden = true) {
  const pl = P(s, p);
  let pts = 0;
  for (const b of Object.values(s.buildings)) if (b.p === p) pts += b.type === 'city' ? 2 : 1;
  if (s.longestRoad.p === p) pts += 2;
  if (!K(s)) {
    if (s.largestArmy.p === p) pts += 2;
    pts += pl.dev.filter(d => d.type === 'victoryPoint' && (includeHidden || d.revealed)).length;
  } else pts += KN.points(s, p);
  pts += X.vpExtra(s, p);
  return Math.max(0, pts);
}
function vpBreakdown(s, p) {
  const pl = P(s, p), c = countPieces(s, p);
  return {
    settlements: c.settlements, cities: c.cities,
    longestRoad: s.longestRoad.p === p, largestArmy: s.largestArmy.p === p,
    vpCards: pl.dev.filter(d => d.type === 'victoryPoint').length,
    ...KN.breakdown(s, p),
    extras: X.vpExtra(s, p),
    total: vp(s, p),
  };
}

function checkWin(s) {
  if (s.phase !== 'play') return;
  // Cloth for Broch: the game ends when only three villages still hold cloth
  const ended = X.endWinner(s);
  if (ended !== null) {
    s.phase = 'over'; s.winner = ended; s.finishedAt = Date.now(); s.pending = []; s.trade = null;
    log(s, '{@p} wins with {n} victory points!', { p: ended, n: vp(s, ended) });
    snapshot(s, true);
    return;
  }
  let p = s.current;
  // 5–6 players: if both players of one turn reach the target in that turn, the holder of stone 1 has won
  if (s.pair && s.pair.phase === 2 && vp(s, s.pair.one) >= X.vpTarget(s, s.pair.one)) p = s.pair.one;
  // Wonders of Broch: a finished wonder wins, or a taller wonder than everybody else with enough points
  const wonderWon = X.wonderWin(s, p);
  if (wonderWon !== null ? wonderWon : vp(s, p) >= X.vpTarget(s, p)) {
    s.phase = 'over'; s.winner = p; s.finishedAt = Date.now(); s.pending = []; s.trade = null;
    log(s, '{@p} wins with {n} victory points!', { p, n: vp(s, p) });
    snapshot(s, true);
  }
}

// ---------------------------------------------------------------- longest road

// length of the longest trail; with `withPath` also the trail itself (edges in order), so the board can light it up
function longestFor(s, p, withPath = false) {
  const own = new Map();
  for (const e of Object.keys(s.roads)) if (s.roads[e] === p) own.set(+e, 'r');
  for (const e of Object.keys(s.ships)) if (s.ships[e].p === p) own.set(+e, 's');
  if (!own.size) return withPath ? { len: 0, edges: [] } : 0;
  let best = 0, bestPath = [];
  const used = new Set();
  const path = [];
  const dfs = (v, len, last) => {
    if (len > best) { best = len; if (withPath) bestPath = path.slice(); }
    if (len > 0 && foreignAt(s, v, p)) return; // can't continue through opponent pieces
    for (const e of V(s, v).edges) {
      if (!own.has(e) || used.has(e)) continue;
      const kind = own.get(e);
      // roads and ships only join at one of your settlements or cities
      if (last && last !== kind && !(s.buildings[v] && s.buildings[v].p === p)) continue;
      used.add(e); path.push(e);
      const [a, b] = E(s, e).v;
      dfs(a === v ? b : a, len + X.roadWeight(s, e), kind);
      path.pop(); used.delete(e);
    }
  };
  const starts = new Set();
  own.forEach((k, e) => E(s, e).v.forEach(v => starts.add(v)));
  starts.forEach(v => dfs(v, 0, null));
  return withPath ? { len: best, edges: bestPath } : best;
}

function updateLongest(s) {
  if (X.noLongest(s)) return;
  const lens = s.players.map((_, p) => longestFor(s, p));
  const max = Math.max(...lens);
  const h = s.longestRoad.p;
  const prev = h;
  if (h !== null && lens[h] >= 5 && lens[h] === max) {
    s.longestRoad.len = lens[h];
  } else {
    const top = lens.map((l, i) => [l, i]).filter(([l]) => l === max);
    if (max >= 5 && top.length === 1) s.longestRoad = { p: top[0][1], len: max };
    else s.longestRoad = { p: null, len: 0 };
  }
  // the trail itself, for the golden road on the board
  s.longestRoad.edges = s.longestRoad.p !== null ? longestFor(s, s.longestRoad.p, true).edges : [];
  if (s.longestRoad.p !== prev) {
    if (s.longestRoad.p !== null) log(s, '{@p} now holds the Longest Road ({n}).', { p: s.longestRoad.p, n: s.longestRoad.len });
    else log(s, 'Nobody holds the Longest Road any more.');
  }
}

// ---------------------------------------------------------------- pending decisions

function pushPending(s, items, front = false) {
  if (!items.length) return;
  const g = ++s.pgroup;
  items.forEach(it => { it.group = g; });
  if (front) s.pending.unshift(...items); else s.pending.push(...items);
}
function activePending(s) {
  if (!s.pending.length) return [];
  const g = s.pending[0].group;
  return s.pending.filter(it => it.group === g);
}
function findPending(s, p, type) {
  return activePending(s).find(it => it.player === p && (!type || it.type === type));
}
function resolvePending(s, item) {
  s.pending.splice(s.pending.indexOf(item), 1);
}

// ---------------------------------------------------------------- legality helpers

function legalSetupSettlements(s) {
  return s.board.vertices.filter(v => distanceOk(s, v.id) && X.setupSpotOk(s, v.id)).map(v => v.id);
}
function legalSetupRoads(s) {
  const v = s.setup.last;
  return V(s, v).edges.filter(e => s.roads[e] === undefined && X.roadEdgeOk(s, e, s.current));
}
function legalSettlements(s, p) {
  return s.board.vertices.filter(v => distanceOk(s, v.id) && X.landVertex(s, v.id) && !s.knights[v.id] && touchesOwnRoute(s, v.id, p) && X.settlementOk(s, v.id, p)).map(v => v.id);
}
function legalRoads(s, p) {
  return s.board.edges.filter(e => {
    if (s.roads[e.id] !== undefined || s.ships[e.id] || !X.roadEdgeOk(s, e.id, p)) return false;
    return e.v.some(v => {
      const b = s.buildings[v];
      if (b && b.p === p) return true;
      if (foreignAt(s, v, p)) return false;
      return touchesOwnRoad(s, v, p);
    });
  }).map(e => e.id);
}
function ownSettlements(s, p) {
  return Object.entries(s.buildings).filter(([, b]) => b.p === p && b.type === 'settlement').map(([v]) => +v);
}
function bankRatio(s, p, type) {
  let r = 4;
  for (const [v, b] of Object.entries(s.buildings)) {
    if (b.p !== p) continue;
    // printed harbours, and the harbours won from the forgotten tribe (Seafarers)
    const port = V(s, +v).port || (s.dynPorts && s.dynPorts[v] && s.dynPorts[v].p === p ? s.dynPorts[v].type : null);
    if (port && !X.portUsable(s, +v)) continue;
    if (port === 'any') r = Math.min(r, 3);
    else if (port && port === type) r = 2;
  }
  return K(s) ? KN.bankRatio(s, p, type, r) : r;
}

function isActor(s, p) {
  if (s.phase !== 'play' || s.pending.length) return false;
  if (s.step === 'main') return p === s.current;
  if (s.step === 'sbp') return p === s.sbp.queue[0];
  return false;
}

// ---------------------------------------------------------------- dice & production

function roll(s, forced) {
  const rv = (!forced && X.rollValues(s)) || { red: forced ? forced[0] : d6(), yellow: forced ? forced[1] : d6(), card: null };
  const red = rv.red;
  const yellow = rv.yellow;
  const total = rv.total != null ? rv.total : red + yellow;
  const event = K(s) ? KN.rollEvent() : null;
  s.dice = { red, yellow, total, event, card: rv.card ? { ev: rv.card.ev, n: rv.card.n } : undefined };
  s.stats.rolls[total]++;
  s.flags.rolled = true;
  s.step = 'main';
  if (rv.card) log(s, '{@p} turned over an event card ({n}).', { p: s.current, n: total });
  else if (event) log(s, '{@p} rolled {n} ({#e}).', { p: s.current, n: total, e: event === 'ship' ? 'barbarian ship' : `${event} gate` });
  else log(s, '{@p} rolled {n}.', { p: s.current, n: total });

  // Event Cards: the text of the card first, then (Cities & Knights) the event die and the red die, then the Production phase
  if (rv.card) X.runCard(s, rv.card);
  if (rv.card && event) log(s, 'Event die: {#e}.', { e: event === 'ship' ? 'barbarian ship' : `${event} gate` });
  if (K(s)) KN.afterRoll(s, event, red);
  if (rv.card) {
    if (total !== 7) produce(s, total);
  } else if (total === 7) handleSeven(s);
  else produce(s, total);
  checkWin(s);
}

function produce(s, total) {
  const want = s.players.map(() => ({}));
  const goldWant = s.players.map(() => 0);
  const hexes = s.board.hexes.filter(h => X.hexPays(s, h, total) && h.id !== s.robber && !h.hidden);
  for (const h of hexes) {
    const res = C.TERRAIN_RES[h.terrain];
    for (const v of h.verts) {
      const b = s.buildings[v];
      if (!b) continue;
      if (h.terrain === 'gold') { goldWant[b.p] += b.type === 'city' ? 2 : 1; continue; }
      if (!res) continue;
      const w = want[b.p];
      if (b.type === 'settlement') w[res] = (w[res] || 0) + 1;
      else if (s.flags.plague) w[res] = (w[res] || 0) + 1; // plague: a city yields only one resource
      else if (K(s) && KN.cityYield(w, h, res)) { /* knights: a resource and a commodity */ }
      else w[res] = (w[res] || 0) + 2;
    }
  }
  // bank shortage rule
  for (const r of C.RES) {
    const takers = want.map((w, p) => [p, w[r] || 0]).filter(([, n]) => n > 0);
    const need = takers.reduce((a, [, n]) => a + n, 0);
    if (need > s.bank[r] && takers.length > 1) {
      takers.forEach(([p]) => { delete want[p][r]; });
      log(s, 'The bank ran short of {#r}; nobody receives it.', { r });
    }
  }
  const gotAny = s.players.map(() => false);
  want.forEach((w, p) => {
    const got = {};
    for (const [k, n] of Object.entries(w)) {
      const g = take(s, P(s, p), k, n);
      if (g) { got[k] = g; gotAny[p] = true; s.stats.gained[p] += g; }
    }
    if (Object.keys(got).length) log(s, '{@p} receives {$c}.', { p, c: got });
  });
  if (K(s)) KN.aqueducts(s, gotAny, goldWant);
  X.afterProduce(s, total, goldWant);
}

function handleSeven(s) {
  const discards = [];
  s.players.forEach((pl, p) => {
    const h = hand(pl);
    if (h > handLimit(s, p)) discards.push({ type: 'discard', player: p, count: Math.floor(h / 2) });
  });
  pushPending(s, discards);
  if (X.noRobber(s)) X.hub.sevenWithoutRobber(s);
  else if (KN.robberActive(s)) pushPending(s, [{ type: 'moveRobber', player: s.current }]);
  else log(s, 'The barbarians have not attacked yet, so the robber stays put.');
}

// ---------------------------------------------------------------- turn flow

// 5–6 player rules: the player with stone 2 sits three places to the left of the one with stone 1
const STONE2_GAP = 3;

// one small record per finished turn: public points, hand sizes and resources gained so far (drives the graphs)
function snapshot(s, final = false) {
  if (!s.track) s.track = [];
  s.track.push({
    t: s.turn, p: s.current, d: s.dice ? s.dice.total : null,
    vp: s.players.map((_, i) => vp(s, i, final)),
    c: s.players.map(pl => hand(pl)),
    g: s.stats.gained.slice(),
  });
  if (s.track.length > 600) s.track.splice(0, s.track.length - 600);
}

function nextTurn(s) {
  snapshot(s);
  s.trade = null;
  s.flags = {};
  s.free = { roads: 0, promotes: 0 };
  s.sbp = null;
  const n = s.players.length;
  if (s.pair && s.pair.phase === 1) {
    // 5–6 players: after the turn of stone 1 comes the adapted turn of stone 2 (3 places to the left):
    // no dice, trade with the bank only, build, 1 development card
    s.pair.phase = 2;
    s.current = (s.pair.one + STONE2_GAP) % n;
    s.step = 'main';
    s.flags = { rolled: true, stone2: true };
  } else {
    if (s.pair) {
      // both stones (and the dice) move one seat to the left
      s.pair.one = (s.pair.one + 1) % n; s.pair.phase = 1;
      s.current = s.pair.one;
    } else s.current = (s.current + 1) % n;
    s.step = 'roll';
    s.dice = null;
  }
  s.turn++;
  s.stats.turns++;
  if (s.flags.stone2) log(s, '{@p} has stone 2: no dice, trade with the bank only.', { p: s.current });
  checkWin(s);
}

function canAffordAnyBuild(s, p) {
  const pl = P(s, p);
  const opts = [C.COSTS.road, C.COSTS.settlement, C.COSTS.city];
  if (K(s)) opts.push(...KN.buildCosts());
  else opts.push(C.COSTS.dev);
  if (s.sea) opts.push(C.COSTS.ship);
  if (s.rivers) opts.push(C.COSTS.bridge);
  if (opts.some(c => has(pl, c))) return true;
  return K(s) && KN.canImprove(s, p);
}

function endTurn(s) {
  if (X.beginEnd(s, s.current)) return; // a scenario has a few more steps before the turn passes
  finishTurn(s);
}
function finishTurn(s) {
  if (s.options.specialBuild && s.players.length > 2) {
    const n = s.players.length;
    const queue = [];
    for (let i = 1; i < n; i++) {
      const p = (s.current + i) % n;
      if (canAffordAnyBuild(s, p)) queue.push(p);
    }
    if (queue.length) {
      s.trade = null; s.free = { roads: 0, promotes: 0 };
      s.step = 'sbp'; s.sbp = { queue };
      log(s, 'Special building phase: {@ps}.', { ps: queue });
      return;
    }
  }
  nextTurn(s);
}

function advanceSbp(s) {
  s.sbp.queue.shift();
  if (!s.sbp.queue.length) nextTurn(s);
}

// ---------------------------------------------------------------- building

function buildRoad(s, p, e, free) {
  if (!legalRoads(s, p).includes(e)) fail('You cannot build a road there.');
  if (countPieces(s, p).roads >= C.PIECES.road) fail('No roads left.');
  if (!free) { if (!has(P(s, p), C.COSTS.road)) fail('Not enough resources.'); pay(s, P(s, p), C.COSTS.road); }
  s.roads[e] = p;
  log(s, '{@p} built a road.', { p });
  X.reveal(s, p, E(s, e).v);
  X.built(s, p, 'road', e);
  updateLongest(s);
}

function act(s, p, a) {
  if (!a || typeof a.type !== 'string') fail('Bad action.');
  if (s.phase === 'over') fail('The game is over.');
  if (p < 0 || p >= s.players.length) fail('You are not in this game.');
  const handler = HANDLERS[a.type];
  if (!handler) fail('Unknown action.');
  handler(s, p, a);
  s.version++;
  X.afterAct(s);
  if (s.phase === 'play' && !s.pending.length) checkWin(s);
}

// Experiment "build anytime": once the dice are down, everybody may build, not only the player whose turn it is
const anytimeBuilder = (s, p) => !!s.options.expBuildAnytime && s.phase === 'play' && !s.pending.length && s.step === 'main' && p >= 0 && p < s.players.length;
function requireActor(s, p) { if (!isActor(s, p) && !anytimeBuilder(s, p)) fail('It is not your move right now.'); }
function requireMain(s, p) {
  if (s.phase !== 'play' || s.pending.length || s.step !== 'main' || p !== s.current) fail('Not allowed right now.');
}
function requireTurnAny(s, p) {
  // own turn, before or after rolling, no pending
  if (s.phase !== 'play' || s.pending.length || p !== s.current || s.step === 'sbp') fail('Not allowed right now.');
}

// the founding phase moves on once the road (or, in Seafarers, the ship) of a settlement is down
function finishSetupRoad(s) {
  s.setup.idx++;
  const n = s.players.length;
  if (s.setup.idx >= s.setup.queue.length) {
    s.phase = 'play'; s.step = 'roll'; s.turn = 1; s.current = s.setup.queue[0]; s.setup = null;
    s.stats.turns = 1;
    log(s, 'Setup complete. {@p} begins.', { p: s.current });
    if (s.options.paired) {
      s.pair = { one: s.current, phase: 1 };
      log(s, 'Stone 1: {@p}. Stone 2: {@q}.', { p: s.current, q: (s.current + STONE2_GAP) % n });
    }
    s.track = [];
    snapshot(s);
    s.track[0].t = 0;
    updateLongest(s);
    return;
  }
  s.current = s.setup.queue[s.setup.idx];
  // C&K and the Traders & Barbarians city start: the second round places cities (a third Cloth round places settlements)
  s.setup.need = s.setup.needs ? s.setup.needs[Math.floor(s.setup.idx / n)] : (K(s) || X.cityStart(s)) && s.setup.idx >= n && s.setup.idx < 2 * n ? 'city' : 'settlement';
  s.setup.last = null;
}

const HANDLERS = {
  // ---- setup
  placeSettlement(s, p, a) {
    if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'settlement') fail('Not your placement.');
    if (!legalSetupSettlements(s).includes(a.v)) fail('Too close to another building.');
    s.buildings[a.v] = { p, type: 'settlement' };
    s.setup.last = a.v; s.setup.need = 'road';
    log(s, '{@p} placed a settlement.', { p });
    X.built(s, p, 'settlement', a.v);
    // normally only the second building pays out; the house rule pays for both (a C&K city still counts like a settlement)
    if (s.options.startBoth || (!K(s) && !X.cityStart(s) && s.setup.idx >= (s.setup.payFrom ?? s.players.length))) startingResources(s, p, a.v, 'settlement');
  },
  placeCity(s, p, a) {
    if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'city') fail('Not your placement.');
    if (!legalSetupSettlements(s).includes(a.v)) fail('Too close to another building.');
    s.buildings[a.v] = { p, type: 'city' };
    s.setup.last = a.v; s.setup.need = 'road';
    log(s, '{@p} placed a city.', { p });
    X.built(s, p, 'city', a.v);
    startingResources(s, p, a.v, 'city');
  },
  placeRoad(s, p, a) {
    if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'road') fail('Not your placement.');
    if (!legalSetupRoads(s).includes(a.e)) fail('The road must touch your new building.');
    s.roads[a.e] = p;
    X.built(s, p, 'road', a.e);
    X.reveal(s, p, E(s, a.e).v);
    finishSetupRoad(s);
  },

  // ---- turn
  roll(s, p) {
    requireTurnAny(s, p);
    if (s.step !== 'roll') fail('Already rolled.');
    roll(s);
  },
  endTurn(s, p) {
    requireMain(s, p);
    s.flags.ending = true;
    endTurn(s);
  },
  skipFreeRoads(s, p) {
    if (p !== s.current || !s.free.roads) fail('No free roads to skip.');
    s.free.roads = 0;
  },
  endSpecialBuild(s, p) {
    if (s.step !== 'sbp' || s.pending.length || s.sbp.queue[0] !== p) fail('Not your special build.');
    advanceSbp(s);
  },
  buildRoad(s, p, a) {
    const free = s.free.roads > 0 && p === s.current && s.phase === 'play' && !s.pending.length && s.step !== 'sbp';
    if (!free) requireActor(s, p);
    buildRoad(s, p, a.e, free);
    if (free) s.free.roads--;
  },
  buildSettlement(s, p, a) {
    requireActor(s, p);
    const pl = P(s, p);
    if (!legalSettlements(s, p).includes(a.v)) fail('You cannot build a settlement there.');
    if (countPieces(s, p).settlements >= C.PIECES.settlement) fail('No settlements left.');
    if (!has(pl, C.COSTS.settlement)) fail('Not enough resources.');
    pay(s, pl, C.COSTS.settlement);
    s.buildings[a.v] = { p, type: 'settlement' };
    log(s, '{@p} built a settlement.', { p });
    X.islandBonus(s, p, a.v);
    X.reveal(s, p, [a.v]);
    X.built(s, p, 'settlement', a.v);
    updateLongest(s);
  },
  buildCity(s, p, a) {
    requireActor(s, p);
    const pl = P(s, p);
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'settlement') fail('Upgrade one of your settlements.');
    if (countPieces(s, p).cities >= C.PIECES.city) fail('No cities left.');
    if (!X.cityOk(s, a.v, p)) fail('You cannot upgrade that settlement.');
    if (!has(pl, C.COSTS.city)) fail('Not enough resources.');
    pay(s, pl, C.COSTS.city);
    b.type = 'city';
    log(s, '{@p} built a city.', { p });
    X.built(s, p, 'city', a.v);
  },

  // ---- classic development cards
  buyDev(s, p) {
    if (K(s)) fail('No development cards in knights mode.');
    if (X.buyDev(s, p)) return; // a scenario with its own cards
    requireActor(s, p);
    const pl = P(s, p);
    if (!s.devDeck.length) fail('The development deck is empty.');
    if (!has(pl, C.COSTS.dev)) fail('Not enough resources.');
    pay(s, pl, C.COSTS.dev);
    const type = s.devDeck.pop();
    pl.dev.push({ type, turn: s.turn });
    log(s, '{@p} bought a development card.', { p });
    // house rule: a victory point card is shown (and counts for everybody) the moment it is bought
    if (type === 'victoryPoint' && s.options.vpAtOnce) { pl.dev[pl.dev.length - 1].revealed = true; log(s, '{@p} reveals {%c} (+1 VP).', { p, c: 'victoryPoint' }); }
  },
  playDev(s, p, a) {
    if (K(s)) fail('No development cards in knights mode.');
    requireTurnAny(s, p);
    const pl = P(s, p);
    // rulebook: only one development card per turn. House rule "knights without a limit": knights do not count against it.
    if (s.flags.devPlayed && !(a.card === 'knight' && s.options.knightsFree)) fail('Only one development card per turn.');
    const idx = pl.dev.findIndex(d => d.type === a.card && d.turn < s.turn);
    if (idx < 0 || a.card === 'victoryPoint') fail('You have no playable card of that kind (new cards wait a turn).');
    switch (a.card) {
      case 'knight':
        pl.knightsPlayed++;
        log(s, '{@p} played {%c}.', { p, c: 'knight' });
        // Barbarian Attack leaves the Largest Army in the box; in Traders & Barbarians the tile stays and its knight moves a barbarian
        if (!X.noRobber(s) || X.hub.armyCounts(s)) {
          if (pl.knightsPlayed >= 3 && pl.knightsPlayed > s.largestArmy.count && s.largestArmy.p !== p) {
            s.largestArmy = { p, count: pl.knightsPlayed };
            log(s, '{@p} now has the Largest Army.', { p });
          } else if (s.largestArmy.p === p) s.largestArmy.count = pl.knightsPlayed;
        }
        if (X.noRobber(s)) { X.hub.knightCard(s, p); break; } // Traders & Barbarians: the knight moves a barbarian
        pushPending(s, [{ type: 'moveRobber', player: p }], true);
        break;
      case 'goodTrip':
        fail('Play it while you move your wagon.');
        break;
      case 'roadBuilding':
        s.free.roads = Math.min(2, C.PIECES.road - countPieces(s, p).roads + (s.sea ? C.PIECES.ship - X.countShips(s, p) : 0));
        log(s, '{@p} played {%c}.', { p, c: 'roadBuilding' });
        break;
      case 'yearOfPlenty': {
        const picks = [a.a, a.b];
        if (!picks.every(isRes)) fail('Pick two resources.');
        const need = {}; picks.forEach(r => { need[r] = (need[r] || 0) + 1; });
        if (Object.entries(need).some(([r, n]) => s.bank[r] < n)) fail('The bank does not have those.');
        picks.forEach(r => take(s, pl, r, 1));
        log(s, '{@p} played {%c} and took {$c2}.', { p, c: 'yearOfPlenty', c2: need });
        break;
      }
      case 'monopoly': {
        if (!isRes(a.res)) fail('Pick a resource.');
        let total = 0;
        s.players.forEach((o, i) => { if (i !== p) total += moveCard(o, pl, a.res, o.res[a.res]); });
        log(s, '{@p} played {%c} on {#r} and collected {n}.', { p, c: 'monopoly', r: a.res, n: total });
        break;
      }
      default: fail('Unknown card.');
    }
    pl.dev.splice(idx, 1);
    pl.devPlayed++;
    if (!(a.card === 'knight' && s.options.knightsFree)) s.flags.devPlayed = true;
  },

  // ---- robber / pending
  discard(s, p, a) {
    const it = findPending(s, p, 'discard');
    if (!it) fail('Nothing to discard.');
    if (!validCards(a.cards, K(s)) || sum(a.cards) !== it.count) fail('Choose exactly {n} cards.', { n: it.count });
    const pl = P(s, p);
    if (!has(pl, a.cards)) fail('You do not have those cards.');
    pay(s, pl, a.cards);
    log(s, '{@p} discarded cards: {n}.', { p, n: it.count });
    resolvePending(s, it);
  },
  give(s, p, a) {
    const it = findPending(s, p, 'give');
    if (!it) fail('Nothing to give.');
    if (!validCards(a.cards, K(s)) || sum(a.cards) !== it.count) fail('Choose exactly {n} cards.', { n: it.count });
    const pl = P(s, p);
    if (!has(pl, a.cards)) fail('You do not have those cards.');
    for (const [k, n] of Object.entries(a.cards)) moveCard(pl, P(s, it.to), k, n);
    log(s, '{@p} gives {@q} cards: {n}.', { p, q: it.to, n: it.count });
    resolvePending(s, it);
  },
  moveRobber(s, p, a) {
    const it = findPending(s, p, 'moveRobber');
    if (!it) fail('You are not moving the robber.');
    if (a.hex === -1 && s.expansion === 'seafarers') {
      // Seafarers: the pirate may also be set on the frame, where he blocks nothing and robs nobody
      if (s.pirate == null) fail('Move the pirate to a different sea tile.');
      s.pirate = null;
      resolvePending(s, it);
      log(s, '{@p} put the pirate on the frame.', { p });
      return;
    }
    const h = s.board.hexes[a.hex];
    if (!h || h.hidden) fail('Move the robber to a different tile.');
    if (h.terrain === 'sea') {
      if (s.board.rules && s.board.rules.noPirate) fail('The pirate is not in this game.');
      if (!s.sea || a.hex === s.pirate) fail('Move the pirate to a different sea tile.');
      if (s.villages && !X.villagesReached(s, p)) fail('You can only move the pirate once a shipping line of yours has reached a village.');
      s.pirate = a.hex;
      resolvePending(s, it);
      log(s, '{@p} moved the pirate.', { p, h: a.hex });
      const prey = [...new Set(h.edges.map(e => s.ships[e]).filter(x => x && x.p !== p).map(x => x.p))].filter(q => hand(P(s, q)) > 0 || (s.villages && P(s, q).cloth > 0));
      if (s.villages) { if (prey.length) pushPending(s, [{ type: 'steal', player: p, options: prey, cloth: true }], true); }
      else if (prey.length === 1) steal(s, p, prey[0]);
      else if (prey.length > 1) pushPending(s, [{ type: 'steal', player: p, options: prey }], true);
      return;
    }
    if (a.hex === s.robber) fail('Move the robber to a different tile.');
    if (h.small) fail('The robber cannot go to the small islands.');
    if (s.board.rules && s.board.rules.noReturn && a.hex === s.robberStart) fail('The robber cannot return to his first desert.');
    if (!X.robberHexes(s, p, [a.hex]).length) fail('The robber cannot go to that tile.');
    s.robber = a.hex;
    resolvePending(s, it);
    log(s, '{@p} moved the robber.', { p, h: a.hex });
    // statistics: who had the robber on their land (once per move, whatever the hand)
    if (!s.stats.robbed) s.stats.robbed = s.players.map(() => 0);
    new Set(h.verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p)).forEach(q => { s.stats.robbed[q]++; });
    const victims = [...new Set(h.verts.map(v => s.buildings[v]).filter(b => b && b.p !== p).map(b => b.p))]
      .filter(q => hand(P(s, q)) > 0 && X.victimOk(s, p, q));
    if (it.bishop) {
      victims.forEach(q => steal(s, p, q));
    } else if (victims.length === 1) steal(s, p, victims[0]);
    else if (victims.length > 1) pushPending(s, [{ type: 'steal', player: p, options: victims }], true);
  },
  leaveRobber(s, p, a) {
    // house rule: a forgotten robber goes back to the desert
    if (!s.options.robberReturn) fail('That house rule is not switched on.');
    const it = findPending(s, p, 'moveRobber');
    if (!it) fail('You are not moving the robber.');
    const hb = X.robberHome(s);
    const d = hb !== undefined ? (hb == null ? null : s.board.hexes[hb]) : s.board.hexes.find(h => h.terrain === 'desert');
    resolvePending(s, it);
    if (hb !== undefined) s.robber = hb;
    else if (d) s.robber = d.id;
    log(s, '{@p} forgot to move the robber, so it goes back to the desert (house rule).', { p, h: d ? d.id : undefined });
    if (a && a.endTurn && s.phase === 'play' && s.step === 'main' && !s.pending.length && p === s.current) { s.flags.ending = true; endTurn(s); }
  },
  steal(s, p, a) {
    const it = findPending(s, p, 'steal');
    if (!it || !it.options.includes(a.from)) fail('Choose someone next to the robber.');
    if (it.cloth && a.cloth) {
      if (!(P(s, a.from).cloth > 0)) fail('They have no cloth.');
      resolvePending(s, it);
      P(s, a.from).cloth--; P(s, p).cloth++;
      log(s, '{@p} steals a bale of cloth from {@q}.', { p, q: a.from });
      return;
    }
    if (!hand(P(s, a.from))) fail('They have no cards.');
    resolvePending(s, it);
    steal(s, p, a.from);
  },

  // ---- trading
  offerTrade(s, p, a) {
    requireMain(s, p);
    if (s.flags.stone2) fail('With stone 2 you may only trade with the bank.');
    if (!validCards(a.give, K(s), s.gold) || !validCards(a.get, K(s), s.gold) || !sum(a.give) || !sum(a.get)) fail('Set up both sides of the trade.');
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
    if (!validCards(a.give, K(s), s.gold) || !validCards(a.get, K(s), s.gold) || !sum(a.give) || !sum(a.get)) fail('Set up both sides of the trade.');
    if (!has(P(s, p), a.give)) fail('You do not have those cards.');
    (t.counters = t.counters || {})[p] = { give: clean(a.get), get: clean(a.give) };
    t.responses[p] = 'counter';
    log(s, '{@p} counters: gives {$g} for {$w}.', { p, g: clean(a.give), w: clean(a.get) });
  },
  confirmTrade(s, p, a) {
    requireMain(s, p);
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
  bankTrade(s, p, a) {
    requireMain(s, p);
    const pl = P(s, p);
    const okType = t => isRes(t) || (K(s) && isComm(t));
    if (a.get === 'gold' && s.gold && okType(a.give)) { // the Gold-Tauschkurs card: 4:1, 3:1 or 2:1 for one gold
      const rate = bankRatio(s, p, a.give);
      const tm = Math.max(1, Math.min(10, a.times | 0 || 1));
      if ((isRes(a.give) ? pl.res[a.give] : pl.comm[a.give]) < rate * tm) fail('You need {$c}.', { c: { [a.give]: rate * tm } });
      pay(s, pl, { [a.give]: rate * tm });
      pl.gold += tm;
      log(s, '{@p} traded {$g} with the bank for {n} gold.', { p, g: { [a.give]: rate * tm }, n: tm });
      return;
    }
    if (!okType(a.give) || !okType(a.get) || a.give === a.get) fail('Pick what to give and what to get.');
    const times = Math.max(1, Math.min(10, a.times | 0 || 1));
    const ratio = bankRatio(s, p, a.give);
    const have = isRes(a.give) ? pl.res[a.give] : pl.comm[a.give];
    if (have < ratio * times) fail('You need {$c}.', { c: { [a.give]: ratio * times } });
    if (isRes(a.get) && s.bank[a.get] < times) fail('The bank is out of that.');
    pay(s, pl, { [a.give]: ratio * times });
    take(s, pl, a.get, times);
    log(s, '{@p} traded {$g} with the bank for {$w}.', { p, g: { [a.give]: ratio * times }, w: { [a.get]: times } });
  },

  chat(s, p, a) {
    const text = String(a.text || '').slice(0, 300).trim();
    if (!text) return;
    s.chat.push({ p, text, at: Date.now() });
    if (s.chat.length > 150) s.chat.shift();
    s.version--; // chat doesn't count as a game move
  },
};

function clean(o) { return Object.fromEntries(Object.entries(o).filter(([, n]) => n > 0)); }

function steal(s, p, q) {
  const card = randomCard(P(s, q));
  if (!card) return;
  moveCard(P(s, q), P(s, p), card, 1);
  log(s, '{@p} stole a card from {@q}.', { p, q });
  s.lastSteal = { by: p, from: q, card, at: Date.now() };
}

function startingResources(s, p, v, type) {
  const got = {};
  for (const h of V(s, v).hexes) {
    const hx = s.board.hexes[h];
    const r = hx.hidden ? null : C.TERRAIN_RES[hx.terrain];
    if (r) { take(s, P(s, p), r, 1); got[r] = (got[r] || 0) + 1; }
  }
  if (Object.keys(got).length) log(s, '{@p} receives {$c}.', { p, c: got });
}

// ---------------------------------------------------------------- views

function legalFor(s, p) {
  const L = {};
  if (s.phase === 'setup' && s.current === p) {
    if (s.setup.need === 'road') { L.setupRoads = legalSetupRoads(s); if (s.sea) L.setupShips = X.legalSetupShips(s); }
    else L.setupSpots = legalSetupSettlements(s);
    return L;
  }
  if (s.phase !== 'play') return L;
  const pl = P(s, p);
  for (const it of activePending(s).filter(i => i.player === p)) {
    if (it.type === 'moveRobber' && s.options.robberReturn) L.leaveRobber = true;
    if (it.type === 'moveRobber' && s.expansion === 'seafarers' && s.pirate != null && !it.bishop) L.pirateFrame = true;
    if (it.type === 'moveRobber') L.robberHexes = X.robberHexes(s, p, s.board.hexes.filter(h => !h.hidden && (h.terrain === 'sea' ? s.sea && h.id !== s.pirate : h.id !== s.robber)).map(h => h.id));
    KN.legalPending(s, p, it, L);
  }
  const freeRoad = s.free.roads > 0 && p === s.current && !s.pending.length && s.step !== 'sbp';
  if (freeRoad) { L.roads = legalRoads(s, p); if (s.sea) L.ships = X.legalShips(s, p); }
  if (isActor(s, p) || anytimeBuilder(s, p)) {
    const c = countPieces(s, p);
    if (has(pl, C.COSTS.road) && c.roads < C.PIECES.road) L.roads = legalRoads(s, p);
    if (has(pl, C.COSTS.settlement) && c.settlements < C.PIECES.settlement) L.settlements = legalSettlements(s, p);
    if (has(pl, C.COSTS.city) && c.cities < C.PIECES.city) L.cities = ownSettlements(s, p).filter(v => X.cityOk(s, v, p));
    if (!K(s)) L.canBuyDev = has(pl, C.COSTS.dev) && s.devDeck.length > 0;
    if (K(s)) KN.legal(s, p, L, c);
  }
  const mainNow = p === s.current && s.phase === 'play' && !s.pending.length && s.step !== 'sbp';
  X.legalExtra(s, p, L, isActor(s, p), mainNow && s.step === 'main');
  if (p === s.current && s.phase === 'play' && !s.pending.length && s.step !== 'sbp') {
    L.ratios = {};
    [...C.RES, ...(K(s) ? C.COMM : [])].forEach(t => { L.ratios[t] = bankRatio(s, p, t); });
    if (K(s)) KN.legalTurn(s, p, L);
  } else if (K(s) && p === s.current && s.phase === 'play' && s.pending.some(i => i.type === 'discardProgress' && i.mustPlay && i.player === p)) {
    // a forced progress-card play happens while the question is still open: the targets of the cards (roads, tiles, knights) are needed now
    KN.legalTurn(s, p, L);
  }
  return L;
}

function viewFor(s, me) {
  const pending = s.pending.map(it => {
    const o = { type: it.type, player: it.player, group: it.group };
    if (it.count != null) o.count = it.count;
    if (it.to != null) o.to = it.to;
    if (it.options && it.type === 'steal') { o.options = it.options; if (it.cloth) o.cloth = true; }
    if (it.bishop) o.bishop = true;
    if (it.res) o.res = it.res;
    KN.pendingView(s, it, o);
    if (it.pub) Object.assign(o, it.pub);
    return o;
  });
  const activeGroup = s.pending.length ? s.pending[0].group : null;
  const view = {
    id: s.id, mode: s.mode, kind: s.kind, expansion: s.expansion, options: s.options, version: s.version,
    phase: s.phase, step: s.step, turn: s.turn, current: s.current, me,
    setup: s.setup && { need: s.setup.need, round: Math.min(3, Math.floor(s.setup.idx / s.players.length) + 1), pays: s.setup.idx >= (s.setup.payFrom ?? s.players.length) },
    board: X.viewBoard(s, {
      vertices: s.board.vertices.map(v => ({ id: v.id, x: v.x, y: v.y })),
      edges: s.board.edges.map(e => ({ id: e.id, v: e.v })),
      ports: s.board.ports,
    }),
    robber: s.robber,
    buildings: s.buildings, roads: s.roads,
    players: s.players.map((pl, i) => {
      const self = i === me || s.phase === 'over';
      const c = countPieces(s, i);
      return {
        name: pl.name, color: pl.color, country: pl.country || null, userId: pl.userId,
        cards: hand(pl), devCount: pl.dev.length,
        res: self ? pl.res : null,
        dev: self ? pl.dev.map(d => ({ type: d.type, fresh: d.turn >= s.turn })) : null,
        knightsPlayed: pl.knightsPlayed,
        vp: self ? vp(s, i) : vp(s, i, false),
        ...KN.playerView(s, i, self),
        pieces: {
          roads: C.PIECES.road - c.roads, settlements: C.PIECES.settlement - c.settlements,
          cities: C.PIECES.city - c.cities,
          ...KN.pieces(c),
        },
        handLimit: handLimit(s, i),
        breakdown: self ? vpBreakdown(s, i) : null,
      };
    }),
    longestRoad: s.longestRoad, largestArmy: s.largestArmy,
    dice: s.dice, pending, activeGroup, reveal: KN.reveal(s, me),
    trade: s.trade, flags: { devPlayed: !!s.flags.devPlayed, ...KN.viewFlags(s), rolled: !!s.flags.rolled, stone2: !!s.flags.stone2 },
    pair: s.pair ? { one: s.pair.one, two: (s.pair.one + STONE2_GAP) % s.players.length, phase: s.pair.phase } : null,
    free: s.free, sbp: s.sbp,
    bank: s.bank, devDeck: s.devDeck.length,
    ...KN.viewState(s),
    log: s.log.slice(-80), chat: s.chat.slice(-80),
    lastSteal: s.lastSteal && (s.lastSteal.by === me || s.lastSteal.from === me) ? s.lastSteal : null,
    stats: { rolls: s.stats.rolls, gained: s.stats.gained, robbed: s.stats.robbed },
    track: s.track || [],
    winner: s.winner,
    legal: legalFor(s, me),
  };
  return X.viewExtra(s, me, view);
}

// bring a game saved by an older version up to date
function migrate(s) {
  if (!s) return s;
  if (!s.ships) {
    s.expansion = 'none'; s.sea = false; s.ships = {}; s.bridges = {}; s.pirate = null; s.islandBonus = {};
    s.rivers = false; s.fishing = false; s.eventCards = false; s.fish = null; s.deck = null;
    s.options.big = s.options.big ?? (s.kind === 'extended');
    s.players.forEach(pl => { pl.gold = 0; pl.fish = 0; });
  }
  // games saved before the house rule had its own switch were played with unlimited knights
  if (s.options && s.options.knightsFree === undefined) s.options.knightsFree = s.mode !== 'knights';
  if (s.options && s.options.paired === undefined) s.options.paired = false;
  if (s.pair === undefined) s.pair = null;
  if (!s.dynPorts) s.dynPorts = {};
  s.players.forEach(pl => { if (!pl.harborTokens) { pl.harborTokens = []; pl.chips = 0; } });
  if (s.expansion === 'traders') X.hub.migrate(s);
  // games saved before the trail was kept: find it once so the golden road shows up
  if (s.longestRoad && s.longestRoad.p != null && !s.longestRoad.edges) s.longestRoad.edges = longestFor(s, s.longestRoad.p, true).edges;
  return s;
}

function summary(s) {
  return {
    id: s.id, mode: s.mode, kind: s.kind, expansion: s.expansion, scenario: s.options.scenario, variants: s.options.variants, big: s.options.big, vpTarget: s.options.vpTarget,
    startedAt: s.startedAt, finishedAt: s.finishedAt, turns: s.stats.turns,
    winner: s.winner === null ? null : s.players[s.winner].userId,
    players: s.players.map((pl, i) => ({
      userId: pl.userId, name: pl.name, color: pl.color, country: pl.country || null, vp: vp(s, i),
      breakdown: vpBreakdown(s, i), gained: s.stats.gained[i], robbed: (s.stats.robbed || [])[i] || 0, knightsPlayed: pl.knightsPlayed,
    })),
    rolls: s.stats.rolls,
  };
}

// expansion rules live in expansions.js (Seafarers, Traders & Barbarians) and get the helpers they need from here
const X = require('./expansions')({
  log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, sum, countPieces, randomCard, moveCard, updateLongest, isRes,
  foreignAt, requireActor, requireMain, requireTurnAny, steal, K, activePending, vp, longestFor, handleSeven, finishTurn, nextTurn, checkWin, snapshot, legalRoads,
  legalSettlements, distanceOk, occupied, handLimit, d6, finishSetupRoad,
});
const KN = require('../knights/knights')({
  log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, sum, countPieces, moveCard, updateLongest, isRes, isComm,
  foreignAt, occupied, touchesOwnRoute, landVertex: (s, v) => X.landVertex(s, v), requireActor, requireMain, requireTurnAny, K, vp, activePending, roll, validCards, ownSettlements,
});
Object.assign(HANDLERS, KN.handlers, X.handlers);

module.exports = { createGame, migrate, act, viewFor, summary, GameError, vp, _internal: { legalFor, activePending, hand, longestFor, PROGRESS_FX: KN.PROGRESS_FX, HANDLERS } };
