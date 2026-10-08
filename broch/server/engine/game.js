'use strict';
// Broch rules engine. Pure state machine: createGame() -> state, act(state, seat, action) mutates state.
// viewFor(state, seat) returns what one player may see, including legal moves.

const C = require('./constants');
const { generate, shuffle, expand } = require('./board');

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
  const sea = expansion === 'seafarers' || expansion === 'explorers';
  // the 5–6 player set (30 tiles, 28 chips, 11 harbors) is needed from five players on; with fewer it is a switch (a bigger board)
  const big = players.length > 4 || (options.big ?? false);
  const scenario = expansion === 'explorers' ? 'fog' : (X.SCENARIOS[options.scenario] ? options.scenario : 'shores');
  const kind = sea ? 'sea' : big ? 'extended' : 'standard';
  const def = C.BOARDS[big ? 'extended' : 'standard'];
  const variants = expansion === 'traders' ? X.hub.normalize(options.variants, { big, players: players.length, knights }) : {};
  const board = X.makeBoard({ expansion, mode, options: { ...options, big, scenario, variants }, players: players.length, generate });
  // the frame piece with the barbarian track replaces the frame piece with a 3:1 harbor (rulebook, set-up)
  if (knights && !sea) dropHarbor(board);
  const defaultVp = (knights ? (expansion === 'seafarers' ? X.SCENARIOS[scenario].vp + 2 : 13) : sea ? (expansion === 'explorers' ? 12 : X.SCENARIOS[scenario].vp) : expansion === 'traders' ? X.hub.defaultVp(variants) : 10) + (knights && variants.harbors ? 1 : 0);
  const order = shuffle(players.map((_, i) => i));
  const seats = order.map(i => players[i]);
  const n = seats.length;
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
      big, scenario: sea ? scenario : null, variable: sea && !!options.variable, variants, missions: expansion === 'explorers' ? (options.missions || C.MISSIONS) : null,
    },
    board,
    robber: expansion === 'traders' && X.hub.initialRobber(board, variants) !== undefined ? X.hub.initialRobber(board, variants) : board.desert != null ? board.desert : board.hexes.find(h => h.terrain === 'desert').id,
    merchant: null,
    buildings: {}, roads: {}, knights: {},
    players: seats.map((pl, i) => ({
      userId: pl.id, name: pl.name, color: pl.color || C.COLORS[i], country: pl.country || null,
      res: zero(C.RES), comm: zero(C.COMM),
      dev: [], devPlayed: 0, knightsPlayed: 0, aqueduct: null,
      progress: [], vpCards: 0, defender: 0,
      improvements: { trade: 0, politics: 0, science: 0 },
    })),
    phase: 'setup', step: null, turn: 0, current: 0,
    setup: { queue: [...[...Array(n).keys()], ...[...Array(n).keys()].reverse(), ...(board.rules && board.rules.thirdSettlement ? [...Array(n).keys()] : [])], idx: 0, need: 'settlement', last: null, payFrom: board.rules && board.rules.thirdSettlement ? 2 * n : n },
    dice: null, pending: [], pgroup: 0,
    bank: zero(C.RES),
    devDeck: knights ? [] : shuffle(expand(def.dev)),
    progressDecks: knights ? Object.fromEntries(Object.entries(C.PROGRESS).map(([k, v]) => [k, shuffle(expand(v))])) : null,
    longestRoad: { p: null, len: 0 }, largestArmy: { p: null, count: 0 },
    barbarian: knights ? { pos: 0, attacks: 0 } : null,
    metropolis: knights ? { trade: null, politics: null, science: null } : null,
    trade: null, tradeSeq: 0,
    flags: {}, free: { roads: 0, promotes: 0 },
    sbp: null, pair: null,
    log: [], chat: [],
    stats: { rolls: zero([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), gained: seats.map(() => 0), turns: 0 },
    winner: null, startedAt: Date.now(), finishedAt: null, version: 0,
  };
  C.RES.forEach(r => { s.bank[r] = def.bank; });
  X.initState(s, { ...options, variants, missions: s.options.missions });
  s.current = s.setup.queue[0];
  log(s, 'Game started. {@ps} take their seats.', { ps: seats.map((_, i) => i) });
  log(s, '{@p} places first.', { p: s.current });
  return s;
}

function dropHarbor(board) {
  const any = board.ports.filter(pt => pt.type === 'any');
  if (!any.length) return;
  const gone = any[Math.floor(Math.random() * any.length)];
  board.ports = board.ports.filter(pt => pt !== gone);
  board.edges[gone.edge].v.forEach(v => { if (board.vertices[v].port === 'any') board.vertices[v].port = null; });
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
function cardList(cards) {
  return Object.entries(cards).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing';
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
function handLimit(s, p) { return 7 + (K(s) ? countPieces(s, p).walls * 2 : 0); }

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
  for (const b of Object.values(s.buildings)) if (b.p === p) {
    pts += b.type === 'city' ? 2 : 1;
    if (b.metro) pts += 2;
  }
  if (s.longestRoad.p === p) pts += 2;
  if (!K(s)) {
    if (s.largestArmy.p === p) pts += 2;
    if (includeHidden) pts += pl.dev.filter(d => d.type === 'victoryPoint').length;
  } else {
    pts += pl.defender + pl.vpCards;
    if (s.merchant && s.merchant.owner === p) pts += 1;
  }
  pts += X.vpExtra(s, p);
  return Math.max(0, pts);
}
function vpBreakdown(s, p) {
  const pl = P(s, p), c = countPieces(s, p);
  const metros = Object.values(s.buildings).filter(b => b.p === p && b.metro).length;
  return {
    settlements: c.settlements, cities: c.cities, metropolis: metros,
    longestRoad: s.longestRoad.p === p, largestArmy: s.largestArmy.p === p,
    vpCards: K(s) ? pl.vpCards : pl.dev.filter(d => d.type === 'victoryPoint').length,
    defender: pl.defender, merchant: !!(s.merchant && s.merchant.owner === p),
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
function ownCities(s, p, filter = () => true) {
  return Object.entries(s.buildings).filter(([, b]) => b.p === p && b.type === 'city' && filter(b)).map(([v]) => +v);
}
function ownSettlements(s, p) {
  return Object.entries(s.buildings).filter(([, b]) => b.p === p && b.type === 'settlement').map(([v]) => +v);
}
function legalKnightSpots(s, p) {
  return s.board.vertices.filter(v => !occupied(s, v.id) && X.landVertex(s, v.id) && touchesOwnRoute(s, v.id, p)).map(v => v.id);
}
// BFS along the player's roads (and ships, with Seafarers) from vertex `from`; returns {empty:[], knights:[]} reachable
function roadReach(s, p, from) {
  const seen = new Set([from]);
  const q = [from];
  const empty = [], foreignKnights = [];
  while (q.length) {
    const v = q.shift();
    for (const e of V(s, v).edges) {
      if (s.roads[e] !== p && !(s.ships && s.ships[e] && s.ships[e].p === p)) continue;
      const [a, b] = E(s, e).v; const u = a === v ? b : a;
      if (seen.has(u)) continue;
      seen.add(u);
      if (foreignAt(s, u, p)) {
        if (s.knights[u] && s.knights[u].p !== p) foreignKnights.push(u);
        continue;
      }
      if (!occupied(s, u)) empty.push(u);
      q.push(u);
    }
  }
  return { empty, foreignKnights };
}
function knightCountAt(s, p, level) { return countPieces(s, p).knights[level]; }
function maxKnightLevel(s, p) { return P(s, p).improvements.politics >= 3 ? 3 : 2; }
function robberActive(s) { return !K(s) || s.barbarian.attacks > 0; }
// a knight may chase the robber from one of the three tiles around its corner (with Seafarers also the pirate at sea)
function nextToRobber(s, v) { const hs = V(s, v).hexes; return hs.includes(s.robber) || (s.sea && s.pirate != null && hs.includes(s.pirate)); }

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
  if (K(s)) {
    if (isComm(type) && P(s, p).improvements.trade >= 3) r = 2;
    if (s.merchant && s.merchant.owner === p && C.TERRAIN_RES[s.board.hexes[s.merchant.hex].terrain] === type) r = 2;
    if (s.flags.fleet === type) r = 2;
  }
  return r;
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
  const event = K(s) ? C.EVENT_FACES[Math.floor(Math.random() * 6)] : null;
  s.dice = { red, yellow, total, event, card: rv.card ? { ev: rv.card.ev, n: rv.card.n } : undefined };
  s.stats.rolls[total]++;
  s.flags.rolled = true;
  s.step = 'main';
  if (rv.card) log(s, '{@p} turned over an event card ({n}).', { p: s.current, n: total });
  else if (event) log(s, '{@p} rolled {n} ({#e}).', { p: s.current, n: total, e: event === 'ship' ? 'barbarian ship' : `${event} gate` });
  else log(s, '{@p} rolled {n}.', { p: s.current, n: total });

  if (K(s)) {
    if (event === 'ship') advanceBarbarians(s);
    else drawProgressForGate(s, event, red);
  }
  if (rv.card) {
    X.runCard(s, rv.card);                 // the event first, the yields after it
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
      else if (K(s) && C.TERRAIN_COMM[h.terrain]) {
        w[res] = (w[res] || 0) + 1;
        const c = C.TERRAIN_COMM[h.terrain];
        w[c] = (w[c] || 0) + 1;
      } else w[res] = (w[res] || 0) + 2;
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
  if (K(s)) {
    const aq = [];
    s.players.forEach((pl, p) => {
      if (gotAny[p] || goldWant[p] || pl.improvements.science < 3) return;
      // the resource was chosen once; from then on the aqueduct pays it out by itself
      if (pl.aqueduct && s.bank[pl.aqueduct] > 0) {
        take(s, pl, pl.aqueduct, 1);
        s.stats.gained[p] += 1;
        log(s, "{@p}'s aqueduct provides {$c}.", { p, c: { [pl.aqueduct]: 1 } });
      } else if (!pl.aqueduct) aq.push({ type: 'aqueduct', player: p });
    });
    pushPending(s, aq);
  }
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
  else if (robberActive(s)) pushPending(s, [{ type: 'moveRobber', player: s.current }]);
  else log(s, 'The barbarians have not attacked yet, so the robber stays put.');
}

// ---------------------------------------------------------------- knights mode: barbarians & progress

function advanceBarbarians(s) {
  s.barbarian.pos++;
  if (s.barbarian.pos < C.BARBARIAN_STEPS) {
    log(s, 'The barbarian ship advances ({n}/{m}).', { n: s.barbarian.pos, m: C.BARBARIAN_STEPS });
    return;
  }
  s.barbarian.pos = 0;
  s.barbarian.attacks++;
  const strength = Object.values(s.buildings).filter(b => b.type === 'city').length;
  const contrib = s.players.map((_, p) => Object.values(s.knights).filter(k => k.p === p && k.active).reduce((a, k) => a + k.level, 0));
  const defense = contrib.reduce((a, b) => a + b, 0);
  // k: each player's active knight strength, c: each player's cities (the clients show who saved or lost what)
  const cities = s.players.map((_, p) => Object.values(s.buildings).filter(b => b.p === p && b.type === 'city').length);
  log(s, "The barbarians attack! Strength {n} against the knights' {m}.", { n: strength, m: defense, k: contrib, c: cities });
  if (defense >= strength) {
    const max = Math.max(...contrib);
    const top = contrib.map((c, p) => [c, p]).filter(([c]) => c === max && c > 0).map(([, p]) => p);
    if (top.length === 1) {
      P(s, top[0]).defender++;
      log(s, 'The barbarians are repelled. {@p} is named Defender of Broch (+1 VP).', { p: top[0] });
    } else if (top.length > 1) {
      log(s, 'The barbarians are repelled. {@ps} share the glory and each draw a progress card.', { ps: top });
      pushPending(s, top.map(p => ({ type: 'chooseProgress', player: p })));
    } else log(s, 'The barbarians are repelled.');
  } else {
    const eligible = s.players.map((_, p) => p).filter(p => ownCities(s, p, b => !b.metro).length > 0);
    if (eligible.length) {
      const min = Math.min(...eligible.map(p => contrib[p]));
      const losers = eligible.filter(p => contrib[p] === min);
      log(s, 'The barbarians win! {@ps} each lose a city.', { ps: losers });
      const items = [];
      for (const p of losers) {
        const opts = ownCities(s, p, b => !b.metro);
        if (opts.length === 1) downgradeCity(s, opts[0]);
        else items.push({ type: 'loseCity', player: p });
      }
      pushPending(s, items);
    } else log(s, 'The barbarians win, but there are no unprotected cities to pillage.');
  }
  Object.values(s.knights).forEach(k => { k.active = false; });
  updateLongest(s);
}

function downgradeCity(s, v) {
  const b = s.buildings[v];
  b.type = 'settlement'; b.wall = false;
  log(s, "{@p}'s city is reduced to a settlement.", { p: b.p });
}

function drawProgressForGate(s, track, red) {
  const n = s.players.length;
  for (let i = 0; i < n; i++) {
    const p = (s.current + i) % n;
    const lvl = P(s, p).improvements[track];
    if (lvl >= 1 && red <= lvl + 1) drawProgress(s, p, track);
  }
}

function drawProgress(s, p, deck) {
  const card = s.progressDecks[deck].shift();
  if (!card) { log(s, 'The {#d} deck is empty.', { d: deck }); return; }
  const pl = P(s, p);
  if (C.PROGRESS_VP.includes(card)) {
    pl.vpCards++;
    log(s, '{@p} reveals {%c} (+1 VP).', { p, c: card });
    return;
  }
  pl.progress.push({ type: card, deck });
  log(s, '{@p} draws a progress card ({#d}).', { p, d: deck });
  checkProgressLimit(s, p, false);
}

// Nobody may hold more than 4 hidden progress cards. A 5th card on your own turn must be played at once;
// when it is not your turn you hand any one of your cards back (under its deck).
function checkProgressLimit(s, p, front) {
  const pl = P(s, p);
  if (pl.progress.length <= 4 || s.pending.some(i => i.type === 'discardProgress' && i.player === p)) return;
  const mustPlay = p === s.current && s.step === 'main' && s.phase === 'play';
  pushPending(s, [{ type: 'discardProgress', player: p, mustPlay }], front);
}
// a coarse check whether a card could do anything at all right now (decides whether a forced play may be skipped)
function couldPlayNow(s, p, type) {
  const pl = P(s, p);
  const others = s.players.map((_, i) => i).filter(i => i !== p);
  switch (type) {
    case 'alchemist': return false;
    case 'engineer': return ownCities(s, p, b => !b.wall).length > 0 && countPieces(s, p).walls < C.PIECES.wall;
    case 'medicine': return ownSettlements(s, p).length > 0 && countPieces(s, p).cities < C.PIECES.city && has(pl, C.COSTS.medicine);
    case 'masterMerchant': return others.some(q => vp(s, q, false) > vp(s, p, false) && hand(P(s, q)) > 0);
    case 'bishop': return robberActive(s);
    case 'deserter': return others.some(q => Object.values(s.knights).some(k => k.p === q));
    case 'diplomat': return openRoads(s).length > 0;
    case 'intrigue': return Object.keys(s.knights).some(v => s.knights[v].p !== p && touchesOwnRoute(s, +v, p));
    case 'spy': return others.some(q => P(s, q).progress.length > 0);
    default: return true;
  }
}

function title(card) { return card.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }

// Level 4 (or level 5, taking it over) of a track brings the metropolis. It sits on one of your cities that has none yet:
// who has no such city may not build that level (rulebook: with 1 city that already carries a metropolis, only up to level 3).
function metropolisAt(s, p, track, level) {
  const holder = s.metropolis[track];
  if (level === 4 && holder === null) return true;
  return level === 5 && holder !== null && holder !== p && P(s, holder).improvements[track] < 5;
}
function improveBlock(s, p, track) {
  const lvl = P(s, p).improvements[track];
  if (lvl >= 5) return 'Already at the top.';
  if (!ownCities(s, p).length) return 'You need a city first.';
  if (metropolisAt(s, p, track, lvl + 1) && !ownCities(s, p, b => !b.metro).length) return 'You need a city without a metropolis for this level.';
  return null;
}

function awardMetropolis(s, p, track) {
  const opts = ownCities(s, p, b => !b.metro);
  s.metropolis[track] = p;
  if (opts.length === 1) { s.buildings[opts[0]].metro = track; log(s, '{@p} raises a metropolis ({#t}).', { p, t: track }); }
  else pushPending(s, [{ type: 'placeMetropolis', player: p, track }], true);
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
  // over-limit progress cards from own turn
  checkWin(s);
}

function canAffordAnyBuild(s, p) {
  const pl = P(s, p);
  const opts = [C.COSTS.road, C.COSTS.settlement, C.COSTS.city];
  if (K(s)) opts.push(C.COSTS.knight, C.COSTS.wall, C.COSTS.activate);
  else opts.push(C.COSTS.dev);
  if (s.sea) opts.push(C.COSTS.ship);
  if (s.rivers) opts.push(C.COSTS.bridge);
  if (opts.some(c => has(pl, c))) return true;
  if (K(s)) return Object.keys(C.TRACK_COMM).some(t => pl.comm[C.TRACK_COMM[t]] >= pl.improvements[t] + 1);
  return false;
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

function requireActor(s, p) { if (!isActor(s, p)) fail('It is not your move right now.'); }
function requireMain(s, p) {
  if (s.phase !== 'play' || s.pending.length || s.step !== 'main' || p !== s.current) fail('Not allowed right now.');
}
function requireKnights(s) { if (!K(s)) fail('Only in knights mode.'); }
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
  s.setup.need = (K(s) || X.cityStart(s)) && s.setup.idx >= n && s.setup.idx < 2 * n ? 'city' : 'settlement';
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

  // ---- knights mode
  buildKnight(s, p, a) {
    requireKnights(s); requireActor(s, p);
    const pl = P(s, p);
    if (!legalKnightSpots(s, p).includes(a.v)) fail('Knights go on an empty corner next to your road.');
    if (knightCountAt(s, p, 1) >= C.PIECES.knightPerLevel) fail('No basic knights left.');
    if (!has(pl, C.COSTS.knight)) fail('Not enough resources.');
    pay(s, pl, C.COSTS.knight);
    s.knights[a.v] = { p, level: 1, active: false, activatedTurn: null, promotedTurn: null };
    log(s, '{@p} recruited a knight.', { p });
    updateLongest(s);
  },
  activateKnight(s, p, a) {
    requireKnights(s); requireActor(s, p);
    const k = s.knights[a.v];
    if (!k || k.p !== p || k.active) fail('Pick one of your inactive knights.');
    if (!has(P(s, p), C.COSTS.activate)) fail('Activating needs 1 grain.');
    pay(s, P(s, p), C.COSTS.activate);
    k.active = true; k.activatedTurn = s.turn;
    log(s, '{@p} activated a knight.', { p });
  },
  promoteKnight(s, p, a) {
    requireKnights(s); requireActor(s, p);
    const k = s.knights[a.v];
    if (!k || k.p !== p) fail('Pick one of your knights.');
    if (k.promotedTurn === s.turn) fail('A knight can only be promoted once per turn.');
    if (k.level >= maxKnightLevel(s, p)) fail(k.level === 2 ? 'Mighty knights need politics level 3.' : 'Already at the highest level.');
    if (knightCountAt(s, p, k.level + 1) >= C.PIECES.knightPerLevel) fail('No knights of the next level left.');
    const free = s.free.promotes > 0 && p === s.current;
    if (!free) {
      if (!has(P(s, p), C.COSTS.promote)) fail('Not enough resources.');
      pay(s, P(s, p), C.COSTS.promote);
    } else s.free.promotes--;
    k.level++; k.promotedTurn = s.turn;
    log(s, '{@p} promoted a knight ({#l}).', { p, l: ['', 'basic', 'strong', 'mighty'][k.level] });
  },
  moveKnight(s, p, a) {
    requireKnights(s); requireMain(s, p);
    const k = readyKnight(s, p, a.from);
    if (!roadReach(s, p, a.from).empty.includes(a.to)) fail('The knight cannot reach that corner.');
    delete s.knights[a.from];
    k.active = false; s.knights[a.to] = k;
    log(s, '{@p} moved a knight.', { p });
    updateLongest(s);
  },
  displaceKnight(s, p, a) {
    requireKnights(s); requireMain(s, p);
    const k = readyKnight(s, p, a.from);
    const target = s.knights[a.to];
    if (!target || !roadReach(s, p, a.from).foreignKnights.includes(a.to)) fail('No reachable opposing knight there.');
    if (target.level >= k.level) fail('You can only displace a weaker knight.');
    delete s.knights[a.from];
    delete s.knights[a.to];
    k.active = false; s.knights[a.to] = k;
    log(s, "{@p}'s knight displaces {@q}'s knight.", { p, q: target.p });
    displaced(s, target, a.to);
    updateLongest(s);
  },
  chaseRobber(s, p, a) {
    requireKnights(s); requireMain(s, p);
    if (!robberActive(s)) fail('The robber cannot be moved before the first barbarian attack.');
    const k = readyKnight(s, p, a.v);
    if (!nextToRobber(s, a.v)) fail('That knight is not next to the robber.');
    k.active = false;
    log(s, "{@p}'s knight chases the robber away.", { p });
    pushPending(s, [{ type: 'moveRobber', player: p }], true);
  },
  relocateKnight(s, p, a) {
    const it = findPending(s, p, 'relocateKnight');
    if (!it) fail('No knight to relocate.');
    if (a.v == null || !it.options.includes(a.v) || occupied(s, a.v)) fail('Pick a highlighted corner.');
    s.knights[a.v] = it.knight;
    resolvePending(s, it);
    log(s, '{@p} relocated a displaced knight.', { p });
    updateLongest(s);
  },
  buildWall(s, p, a) {
    requireKnights(s); requireActor(s, p);
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'city' || b.wall) fail('Walls go around your cities.');
    if (countPieces(s, p).walls >= C.PIECES.wall) fail('No walls left.');
    if (!has(P(s, p), C.COSTS.wall)) fail('Not enough resources.');
    pay(s, P(s, p), C.COSTS.wall);
    b.wall = true;
    log(s, '{@p} built a city wall.', { p });
  },
  improve(s, p, a) {
    requireKnights(s); requireActor(s, p);
    const pl = P(s, p);
    if (!C.TRACK_COMM[a.track]) fail('Unknown improvement.');
    const block = improveBlock(s, p, a.track);
    if (block) fail(block);
    const lvl = pl.improvements[a.track];
    const comm = C.TRACK_COMM[a.track];
    let cost = lvl + 1;
    if (s.flags.crane && p === s.current) cost = Math.max(0, cost - 1);
    if (pl.comm[comm] < cost) fail('You need {$c}.', { c: { [comm]: cost } });
    const nl = lvl + 1;
    const holder = s.metropolis[a.track];
    const takes = metropolisAt(s, p, a.track, nl);
    pl.comm[comm] -= cost;
    if (s.flags.crane && p === s.current) s.flags.crane = false;
    pl.improvements[a.track] = nl;
    log(s, '{@p} improved {#t} to level {n}.', { p, t: a.track, n: nl });
    if (takes) {
      if (holder !== null) {
        for (const b of Object.values(s.buildings)) if (b.metro === a.track) b.metro = null;
        log(s, '{@p} takes the metropolis ({#t}) from {@q}.', { p, q: holder, t: a.track });
      }
      awardMetropolis(s, p, a.track);
    }
  },
  placeMetropolis(s, p, a) {
    const it = findPending(s, p, 'placeMetropolis');
    if (!it) fail('No metropolis to place.');
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'city' || b.metro) fail('Pick one of your cities.');
    b.metro = it.track;
    resolvePending(s, it);
    log(s, '{@p} raises a metropolis ({#t}).', { p, t: it.track });
  },
  loseCity(s, p, a) {
    const it = findPending(s, p, 'loseCity');
    if (!it) fail('Nothing to lose.');
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'city' || b.metro) fail('Pick one of your unprotected cities.');
    downgradeCity(s, a.v);
    resolvePending(s, it);
  },
  chooseProgress(s, p, a) {
    const it = findPending(s, p, 'chooseProgress');
    if (!it || !C.PROGRESS[a.deck]) fail('Pick a deck.');
    resolvePending(s, it);
    drawProgress(s, p, a.deck);
  },
  discardProgress(s, p, a) {
    const it = findPending(s, p, 'discardProgress');
    if (!it) fail('Nothing to discard.');
    const pl = P(s, p);
    if (!pl.progress[a.idx]) fail('Pick a card.');
    if (it.mustPlay && pl.progress.some(c => couldPlayNow(s, p, c.type))) fail('You must play one of your progress cards now.');
    const [c] = pl.progress.splice(a.idx, 1);
    s.progressDecks[c.deck].push(c.type);
    log(s, '{@p} discarded a progress card.', { p });
    if (pl.progress.length <= 4) resolvePending(s, it);
  },
  aqueduct(s, p, a) {
    const it = findPending(s, p, 'aqueduct');
    if (!it || !isRes(a.res)) fail('Pick a resource.');
    const pl = P(s, p);
    pl.aqueduct = a.res;
    if (take(s, pl, a.res, 1)) {
      s.stats.gained[p] += 1;
      log(s, "{@p}'s aqueduct provides {$c}.", { p, c: { [a.res]: 1 } });
    }
    resolvePending(s, it);
  },
  // choose (or change) the resource the aqueduct pays out; allowed any time once science is at level 3
  setAqueduct(s, p, a) {
    requireKnights(s);
    const pl = P(s, p);
    if (pl.improvements.science < 3) fail('You need the aqueduct first.');
    if (!isRes(a.res)) fail('Pick a resource.');
    pl.aqueduct = a.res;
  },
  placeFreeKnight(s, p, a) {
    const it = findPending(s, p, 'placeFreeKnight');
    if (!it) fail('No knight to place.');
    if (a.v != null) {
      if (!legalKnightSpots(s, p).includes(a.v)) fail('Pick an empty corner next to your road.');
      s.knights[a.v] = { p, level: it.level, active: !!it.active, activatedTurn: null, promotedTurn: null };
      log(s, '{@p} places the deserting knight.', { p });
      updateLongest(s);
    }
    resolvePending(s, it);
  },
  spyTake(s, p, a) {
    const it = findPending(s, p, 'spy');
    if (!it) fail('Nothing to take.');
    const t = P(s, it.target);
    if (a.idx != null) {
      if (!t.progress[a.idx]) fail('Pick a card.');
      const [c] = t.progress.splice(a.idx, 1);
      P(s, p).progress.push(c);
      log(s, "{@p}'s spy steals a progress card from {@q}.", { p, q: it.target });
    }
    resolvePending(s, it);
    checkProgressLimit(s, p, true);
  },
  harborGive(s, p, a) {
    const it = findPending(s, p, 'harborGive');
    if (!it) fail('Nothing to give.');
    const pl = P(s, p), to = P(s, it.to);
    if (!isComm(a.comm) || pl.comm[a.comm] < 1) fail('Pick a commodity you hold.');
    resolvePending(s, it);
    if (to.res[it.res] < 1) return; // cannot happen: the offered card stays in the hand
    moveCard(to, pl, it.res, 1);
    moveCard(pl, to, a.comm, 1);
    log(s, "{@p} swaps {$g} for {@q}'s {$w}.", { p: it.to, q: p, g: { [it.res]: 1 }, w: { [a.comm]: 1 } });
  },
  // Deserter: the player who is hit chooses which of their knights leaves the board
  deserterPick(s, p, a) {
    const it = findPending(s, p, 'deserterPick');
    if (!it) fail('No knight to give up.');
    const k = s.knights[a.v];
    if (!k || k.p !== p) fail('Pick one of your knights.');
    removeDeserter(s, it, a.v);
  },
  takeCards(s, p, a) {
    const it = findPending(s, p, 'masterMerchant');
    if (!it) fail('Nothing to take.');
    const t = P(s, it.target);
    const n = Math.min(2, hand(t));
    if (!validCards(a.cards, true) || sum(a.cards) !== n || !has(t, a.cards)) fail('Choose {n} of their cards.', { n });
    for (const [k, m] of Object.entries(a.cards)) moveCard(t, P(s, p), k, m);
    resolvePending(s, it);
    log(s, '{@p} takes cards from {@q}: {n}.', { p, q: it.target, n });
  },

  // ---- progress cards
  playProgress(s, p, a) {
    requireKnights(s);
    // a 5th card on your own turn must be played at once: that lifts the pending decision (put back if the card fails)
    const forced = findPending(s, p, 'discardProgress');
    const mustPlay = forced && forced.mustPlay && p === s.current;
    if (!mustPlay) requireTurnAny(s, p);
    else if (s.phase !== 'play' || s.step !== 'main') fail('Not allowed right now.');
    const pl = P(s, p);
    const card = pl.progress[a.idx];
    if (!card) fail('Pick a card.');
    if (card.type === 'alchemist') { if (s.step !== 'roll') fail('Play the Alchemist before rolling.'); }
    else if (s.step !== 'main') fail('Roll the dice first.');
    const at = mustPlay ? s.pending.indexOf(forced) : -1;
    if (mustPlay) resolvePending(s, forced);
    try { PROGRESS_FX[card.type](s, p, a); } catch (e) { if (mustPlay) s.pending.splice(at, 0, forced); throw e; }
    // effect succeeded -> back under its deck
    pl.progress.splice(pl.progress.indexOf(card), 1);
    s.progressDecks[card.deck].push(card.type);
    log(s, '{@p} played {%c}.', { p, c: card.type });
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

function readyKnight(s, p, v) {
  const k = s.knights[v];
  if (!k || k.p !== p) fail('Pick one of your knights.');
  if (!k.active) fail('That knight is not active.');
  if (k.activatedTurn === s.turn) fail('A knight activated this turn must wait until next turn.');
  return k;
}

function displaced(s, knight, from) {
  const q = knight.p;
  const opts = roadReach(s, q, from).empty.filter(v => v !== from);
  if (!opts.length) { log(s, "{@p}'s knight has nowhere to go and leaves the board.", { p: q }); return; }
  pushPending(s, [{ type: 'relocateKnight', player: q, knight, options: opts }], true);
}

function openRoads(s) {
  // a road is "open" if one of its ends has no other road and no settlement, city or knight of the owner
  return Object.entries(s.roads).map(([e, q]) => [+e, q]).filter(([e, q]) => E(s, e).v.some(v => {
    const b = s.buildings[v], k = s.knights[v];
    if ((b && b.p === q) || (k && k.p === q)) return false;
    return V(s, v).edges.filter(x => x !== e && s.roads[x] === q).length === 0;
  })).map(([e]) => e);
}

function adjacentHexesOfType(s, p, terrain) {
  const set = new Set();
  for (const [v, b] of Object.entries(s.buildings)) if (b.p === p) {
    V(s, +v).hexes.forEach(h => { if (s.board.hexes[h].terrain === terrain) set.add(h); });
  }
  return [...set];
}

// Deserter: the knight chosen by its owner leaves; the player of the card sets up a knight of the same level (or the
// highest lower level still in the supply) with the same status, even a mighty one without the Fortress.
function removeDeserter(s, it, v) {
  const k = s.knights[v];
  delete s.knights[v];
  log(s, "One of {@p}'s knights deserts.", { p: k.p });
  if (s.pending.includes(it)) resolvePending(s, it);
  updateLongest(s);
  let level = k.level;
  while (level >= 1 && knightCountAt(s, it.to, level) >= C.PIECES.knightPerLevel) level--;
  if (level >= 1 && legalKnightSpots(s, it.to).length) pushPending(s, [{ type: 'placeFreeKnight', player: it.to, level, active: !!k.active }], true);
}

const PROGRESS_FX = {
  alchemist(s, p, a) {
    const r = a.red | 0, y = a.yellow | 0;
    if (r < 1 || r > 6 || y < 1 || y > 6) fail('Choose both dice.');
    roll(s, [r, y]);
  },
  inventor(s, p, a) {
    const A = s.board.hexes[a.a], B = s.board.hexes[a.b];
    const bad = h => !h || h.number == null || [2, 12, 6, 8].includes(h.number);
    if (bad(A) || bad(B) || a.a === a.b) fail('Pick two number tiles (not 2, 6, 8 or 12).');
    [A.number, B.number] = [B.number, A.number];
  },
  crane(s) { s.flags.crane = true; },
  engineer(s, p, a) {
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'city' || b.wall) fail('Pick one of your cities without a wall.');
    if (countPieces(s, p).walls >= C.PIECES.wall) fail('No walls left.');
    b.wall = true;
  },
  irrigation(s, p) {
    const n = adjacentHexesOfType(s, p, 'fields').length;
    take(s, P(s, p), 'grain', 2 * n);
  },
  mining(s, p) {
    const n = adjacentHexesOfType(s, p, 'mountains').length;
    take(s, P(s, p), 'ore', 2 * n);
  },
  medicine(s, p, a) {
    const b = s.buildings[a.v];
    if (!b || b.p !== p || b.type !== 'settlement') fail('Pick one of your settlements.');
    if (countPieces(s, p).cities >= C.PIECES.city) fail('No cities left.');
    if (!has(P(s, p), C.COSTS.medicine)) fail('Medicine needs 1 grain and 2 ore.');
    pay(s, P(s, p), C.COSTS.medicine);
    b.type = 'city';
  },
  roadBuilding(s, p) { s.free.roads = Math.min(2, C.PIECES.road - countPieces(s, p).roads); },
  smith(s) { s.free.promotes = 2; },
  // Commercial Harbor: offer 1 resource card to every other player (a.offers = { seat: resource }, any mix); whoever owns a
  // commodity must hand over one of their choice. Players without one are skipped, and you cannot offer more cards than you hold.
  commercialHarbor(s, p, a) {
    const pl = P(s, p);
    const offers = a.offers && typeof a.offers === 'object' ? a.offers : {};
    const n = s.players.length;
    const spent = {};
    const items = [];
    for (let i = 1; i < n; i++) {
      const q = (p + i) % n;
      const res = offers[q];
      if (res == null) continue;
      if (!isRes(res)) fail('Pick a resource.');
      const o = P(s, q);
      if (!C.COMM.some(c => o.comm[c] > 0)) { log(s, '{@q} has no commodity, so there is no swap.', { q }); continue; }
      if (pl.res[res] - (spent[res] || 0) < 1) continue;
      spent[res] = (spent[res] || 0) + 1;
      items.push({ type: 'harborGive', player: q, to: p, res });
    }
    pushPending(s, items, true);
  },
  masterMerchant(s, p, a) {
    const t = a.target;
    if (t === p || !P(s, t) || vp(s, t, false) <= vp(s, p, false)) fail('Pick a player with more points than you.');
    if (!hand(P(s, t))) fail('They have no cards.');
    pushPending(s, [{ type: 'masterMerchant', player: p, target: t }], true);
  },
  merchant(s, p, a) {
    const h = s.board.hexes[a.hex];
    if (!h || h.hidden || !C.TERRAIN_RES[h.terrain]) fail('Pick a land tile.');
    if (!h.verts.some(v => s.buildings[v] && s.buildings[v].p === p)) fail('The merchant must stand next to your settlement or city.');
    s.merchant = { hex: a.hex, owner: p };
  },
  merchantFleet(s, p, a) {
    if (!isRes(a.kind) && !isComm(a.kind)) fail('Pick a card type.');
    s.flags.fleet = a.kind;
  },
  resourceMonopoly(s, p, a) {
    if (!isRes(a.kind)) fail('Pick a resource.');
    let t = 0;
    s.players.forEach((o, q) => { if (q !== p) t += moveCard(o, P(s, p), a.kind, 2); });
    log(s, '{@p} collects {$c}.', { p, c: { [a.kind]: t } });
  },
  tradeMonopoly(s, p, a) {
    if (!isComm(a.kind)) fail('Pick a commodity.');
    let t = 0;
    s.players.forEach((o, q) => { if (q !== p) t += moveCard(o, P(s, p), a.kind, 1); });
    log(s, '{@p} collects {$c}.', { p, c: { [a.kind]: t } });
  },
  bishop(s, p) {
    if (!robberActive(s)) fail('The robber cannot move before the first barbarian attack.');
    pushPending(s, [{ type: 'moveRobber', player: p, bishop: true }], true);
  },
  deserter(s, p, a) {
    const t = a.target;
    if (t === p || !P(s, t)) fail('Pick a player who has knights.');
    const theirs = Object.keys(s.knights).filter(v => s.knights[v].p === t);
    if (!theirs.length) fail('Pick a player who has knights.');
    const it = { type: 'deserterPick', player: t, to: p };
    if (theirs.length === 1) removeDeserter(s, it, +theirs[0]);
    else pushPending(s, [it], true);
  },
  diplomat(s, p, a) {
    if (!openRoads(s).includes(a.e)) fail('Pick an open road (one with a loose end).');
    const q = s.roads[a.e];
    delete s.roads[a.e];
    if (q === p) s.free.roads++;
    log(s, '{@p} removed a road of {@q}.', { p, q });
    updateLongest(s);
  },
  intrigue(s, p, a) {
    const k = s.knights[a.v];
    if (!k || k.p === p || !touchesOwnRoute(s, a.v, p)) fail('Pick an opposing knight on one of your roads.');
    delete s.knights[a.v];
    displaced(s, k, a.v);
    updateLongest(s);
  },
  saboteur(s, p) {
    const mine = vp(s, p, false);
    const items = [];
    s.players.forEach((o, q) => {
      if (q !== p && vp(s, q, false) >= mine && hand(o) >= 2) items.push({ type: 'discard', player: q, count: Math.floor(hand(o) / 2) });
    });
    pushPending(s, items, true);
  },
  spy(s, p, a) {
    const t = a.target;
    if (t === p || !P(s, t)) fail('Pick an opponent.');
    if (!P(s, t).progress.length) fail('They have no progress cards.');
    pushPending(s, [{ type: 'spy', player: p, target: t }], true);
  },
  warlord(s, p) {
    Object.values(s.knights).forEach(k => { if (k.p === p && !k.active) { k.active = true; k.activatedTurn = s.turn; } });
  },
  wedding(s, p) {
    const mine = vp(s, p, false);
    const items = [];
    s.players.forEach((o, q) => {
      if (q !== p && vp(s, q, false) > mine && hand(o) > 0) items.push({ type: 'give', player: q, to: p, count: Math.min(2, hand(o)) });
    });
    pushPending(s, items, true);
  },
};

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
    if (it.type === 'relocateKnight') L.relocate = it.options.filter(v => !occupied(s, v));
    if (it.type === 'placeMetropolis') L.metroCities = ownCities(s, p, b => !b.metro);
    if (it.type === 'loseCity') L.loseCities = ownCities(s, p, b => !b.metro);
    if (it.type === 'placeFreeKnight') L.freeKnightSpots = legalKnightSpots(s, p);
    if (it.type === 'deserterPick') L.giveKnights = Object.keys(s.knights).filter(v => s.knights[v].p === p).map(Number);
  }
  const freeRoad = s.free.roads > 0 && p === s.current && !s.pending.length && s.step !== 'sbp';
  if (freeRoad) { L.roads = legalRoads(s, p); if (s.sea) L.ships = X.legalShips(s, p); }
  if (isActor(s, p)) {
    const c = countPieces(s, p);
    if (has(pl, C.COSTS.road) && c.roads < C.PIECES.road) L.roads = legalRoads(s, p);
    if (has(pl, C.COSTS.settlement) && c.settlements < C.PIECES.settlement) L.settlements = legalSettlements(s, p);
    if (has(pl, C.COSTS.city) && c.cities < C.PIECES.city) L.cities = ownSettlements(s, p).filter(v => X.cityOk(s, v, p));
    if (!K(s)) L.canBuyDev = has(pl, C.COSTS.dev) && s.devDeck.length > 0;
    if (K(s)) {
      if (has(pl, C.COSTS.knight) && c.knights[1] < 2) L.knightSpots = legalKnightSpots(s, p);
      if (has(pl, C.COSTS.wall) && c.walls < C.PIECES.wall) L.walls = ownCities(s, p, b => !b.wall);
      L.improve = {};
      for (const t of Object.keys(C.TRACK_COMM)) {
        const lvl = pl.improvements[t];
        let cost = lvl + 1; if (s.flags.crane && p === s.current) cost = Math.max(0, cost - 1);
        const block = improveBlock(s, p, t);
        L.improve[t] = { cost, ok: !block && pl.comm[C.TRACK_COMM[t]] >= cost, block };
      }
      L.knights = {};
      const main = s.step === 'main' && p === s.current;
      for (const [v, k] of Object.entries(s.knights)) {
        if (k.p !== p) continue;
        const ready = main && k.active && k.activatedTurn !== s.turn;
        const reach = ready ? roadReach(s, p, +v) : { empty: [], foreignKnights: [] };
        const nextLvl = k.level + 1;
        L.knights[v] = {
          activate: !k.active && has(pl, C.COSTS.activate),
          promote: k.promotedTurn !== s.turn && k.level < maxKnightLevel(s, p) && c.knights[nextLvl] < 2 &&
            (has(pl, C.COSTS.promote) || (s.free.promotes > 0 && p === s.current)),
          moves: reach.empty,
          displace: reach.foreignKnights.filter(u => s.knights[u].level < k.level),
          chase: ready && robberActive(s) && nextToRobber(s, +v),
        };
      }
    }
  }
  const mainNow = p === s.current && s.phase === 'play' && !s.pending.length && s.step !== 'sbp';
  X.legalExtra(s, p, L, isActor(s, p), mainNow && s.step === 'main');
  if (p === s.current && s.phase === 'play' && !s.pending.length && s.step !== 'sbp') {
    L.ratios = {};
    [...C.RES, ...(K(s) ? C.COMM : [])].forEach(t => { L.ratios[t] = bankRatio(s, p, t); });
    if (K(s)) {
      L.openRoads = openRoads(s);
      L.intrigue = Object.keys(s.knights).map(Number).filter(v => s.knights[v].p !== p && touchesOwnRoute(s, v, p));
      L.merchantHexes = s.board.hexes.filter(h => !h.hidden && C.TERRAIN_RES[h.terrain] && h.verts.some(v => s.buildings[v] && s.buildings[v].p === p)).map(h => h.id);
      L.inventorHexes = s.board.hexes.filter(h => h.number != null && ![2, 12, 6, 8].includes(h.number)).map(h => h.id);
    }
  }
  return L;
}

function viewFor(s, me) {
  const knights = K(s);
  const pending = s.pending.map(it => {
    const o = { type: it.type, player: it.player, group: it.group };
    if (it.count != null) o.count = it.count;
    if (it.to != null) o.to = it.to;
    if (it.options && it.type === 'steal') { o.options = it.options; if (it.cloth) o.cloth = true; }
    if (it.track) o.track = it.track;
    if (it.level) o.level = it.level;
    if (it.target != null) o.target = it.target;
    if (it.bishop) o.bishop = true;
    if (it.res) o.res = it.res;
    if (it.mustPlay) o.mustPlay = true;
    if (it.type === 'placeFreeKnight') o.active = !!it.active;
    if (it.type === 'discardProgress' && it.mustPlay) o.canGiveBack = !P(s, it.player).progress.some(c => couldPlayNow(s, it.player, c.type));
    if (it.pub) Object.assign(o, it.pub);
    return o;
  });
  const activeGroup = s.pending.length ? s.pending[0].group : null;
  let reveal = null;
  const mine = activePending(s).find(i => i.player === me && (i.type === 'spy' || i.type === 'masterMerchant'));
  if (mine) {
    const t = P(s, mine.target);
    reveal = mine.type === 'spy' ? { target: mine.target, progress: t.progress.map(c => c.type) } : { target: mine.target, res: t.res, comm: t.comm };
  }
  const view = {
    id: s.id, mode: s.mode, kind: s.kind, expansion: s.expansion, options: s.options, version: s.version,
    phase: s.phase, step: s.step, turn: s.turn, current: s.current, me,
    setup: s.setup && { need: s.setup.need, round: Math.min(3, Math.floor(s.setup.idx / s.players.length) + 1), pays: s.setup.idx >= (s.setup.payFrom ?? s.players.length) },
    board: X.viewBoard(s, {
      vertices: s.board.vertices.map(v => ({ id: v.id, x: v.x, y: v.y })),
      edges: s.board.edges.map(e => ({ id: e.id, v: e.v })),
      ports: s.board.ports,
    }),
    robber: s.robber, merchant: s.merchant,
    buildings: s.buildings, roads: s.roads, knights: s.knights,
    players: s.players.map((pl, i) => {
      const self = i === me || s.phase === 'over';
      const c = countPieces(s, i);
      return {
        name: pl.name, color: pl.color, country: pl.country || null, userId: pl.userId,
        cards: hand(pl), devCount: pl.dev.length, progressCount: pl.progress.length,
        res: self ? pl.res : null, comm: self && knights ? pl.comm : null,
        dev: self ? pl.dev.map(d => ({ type: d.type, fresh: d.turn >= s.turn })) : null,
        progress: self ? pl.progress.map(c2 => c2.type) : null,
        knightsPlayed: pl.knightsPlayed,
        vp: self ? vp(s, i) : vp(s, i, false),
        improvements: pl.improvements, aqueduct: self ? pl.aqueduct || null : undefined, defender: pl.defender, vpCards: knights ? pl.vpCards : undefined,
        pieces: {
          roads: C.PIECES.road - c.roads, settlements: C.PIECES.settlement - c.settlements,
          cities: C.PIECES.city - c.cities, walls: C.PIECES.wall - c.walls,
          knights: [0, 2 - c.knights[1], 2 - c.knights[2], 2 - c.knights[3]],
        },
        handLimit: handLimit(s, i),
        breakdown: self ? vpBreakdown(s, i) : null,
      };
    }),
    longestRoad: s.longestRoad, largestArmy: s.largestArmy,
    dice: s.dice, pending, activeGroup, reveal,
    trade: s.trade, flags: { devPlayed: !!s.flags.devPlayed, crane: !!s.flags.crane, fleet: s.flags.fleet || null, rolled: !!s.flags.rolled, stone2: !!s.flags.stone2 },
    pair: s.pair ? { one: s.pair.one, two: (s.pair.one + STONE2_GAP) % s.players.length, phase: s.pair.phase } : null,
    free: s.free, sbp: s.sbp,
    bank: s.bank, devDeck: s.devDeck.length,
    progressDecks: s.progressDecks && Object.fromEntries(Object.entries(s.progressDecks).map(([k, v]) => [k, v.length])),
    barbarian: s.barbarian, metropolis: s.metropolis,
    log: s.log.slice(-80), chat: s.chat.slice(-80),
    lastSteal: s.lastSteal && (s.lastSteal.by === me || s.lastSteal.from === me) ? s.lastSteal : null,
    stats: { rolls: s.stats.rolls, gained: s.stats.gained },
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
    s.players.forEach(pl => { pl.gold = 0; pl.fish = 0; pl.cargo = { fish: 0, spice: 0 }; pl.delivered = { fish: 0, spice: 0 }; });
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
      breakdown: vpBreakdown(s, i), gained: s.stats.gained[i], knightsPlayed: pl.knightsPlayed,
    })),
    rolls: s.stats.rolls,
  };
}

// expansion rules live in expansions.js and get the helpers they need from here
const X = require('./expansions')({
  log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, sum, countPieces, randomCard, moveCard, updateLongest, isRes,
  foreignAt, requireActor, requireMain, requireTurnAny, steal, K, activePending, vp, longestFor, handleSeven, finishTurn, nextTurn, checkWin, snapshot, legalRoads,
  legalSettlements, distanceOk, occupied, handLimit, d6, finishSetupRoad,
});
Object.assign(HANDLERS, X.handlers);

module.exports = { createGame, migrate, act, viewFor, summary, GameError, vp, _internal: { legalFor, activePending, hand, longestFor, PROGRESS_FX, HANDLERS } };
