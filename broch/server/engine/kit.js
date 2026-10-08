'use strict';
// Shared building blocks for the standalone games (Energiewende, Aufbruch der Menschheit, Der Aufstieg der Inka).
// A game describes itself with a `spec`; the kit supplies everything the games have in common with Broch itself:
// seats and setup, the dice, trading with players and the bank, turn flow, the point history behind the graphs and
// the plumbing around act()/viewFor(). Games add their own handlers and view fields on top.
//
// State shape every standalone game shares (so the client feed, the dice scenes and the graphs keep working):
//   players[i].res  every hand item by key (resources, science, energy, ...), s.bank the limited supplies
//   buildings{v:{p,type}}, roads{e:p}, board, phase/step/turn/current, pending, trade, log, chat, stats, track

const { GameError } = require('./game');
const { shuffle } = require('./board');
const C = require('./constants');

const fail = (msg, params) => { throw new GameError(msg, params); };
const d6 = () => 1 + Math.floor(Math.random() * 6);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const clean = o => Object.fromEntries(Object.entries(o || {}).filter(([, n]) => n > 0));

function log(s, k, a = {}) {
  s.log.push({ turn: s.turn, k, a, at: Date.now() });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

const P = (s, i) => s.players[i];
const V = (s, v) => s.board.vertices[v];
const E = (s, e) => s.board.edges[e];

function createKit(spec) {
  const KEYS = spec.hand; // every item a player can hold
  const isCard = k => KEYS.includes(k);

  // ---------------------------------------------------------------- cards
  const handCount = (s, pl) => (spec.limited || KEYS).reduce((a, k) => a + (pl.res[k] || 0), 0);
  const has = (pl, cost) => Object.entries(cost).every(([k, n]) => (pl.res[k] || 0) >= n);
  function pay(s, pl, cost) {
    for (const [k, n] of Object.entries(cost)) { pl.res[k] -= n; if (s.bank[k] !== undefined) s.bank[k] += n; }
  }
  function take(s, pl, k, n) {
    const got = s.bank[k] !== undefined ? Math.min(n, s.bank[k]) : n;
    if (s.bank[k] !== undefined) s.bank[k] -= got;
    pl.res[k] += got;
    return got;
  }
  function moveCard(from, to, k, n = 1) { const m = Math.min(n, from.res[k]); from.res[k] -= m; to.res[k] += m; return m; }
  function validCards(obj, keys = KEYS) {
    return !!obj && typeof obj === 'object' && Object.entries(obj).every(([k, n]) => keys.includes(k) && Number.isInteger(n) && n >= 0);
  }
  function randomCard(s, pl, keys = spec.limited || KEYS) {
    const pool = [];
    for (const k of keys) for (let i = 0; i < pl.res[k]; i++) pool.push(k);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // ---------------------------------------------------------------- creation
  function seatPlayers(players) {
    const order = shuffle(players.map((_, i) => i));
    return order.map(i => players[i]);
  }
  function baseState({ id, mode, players, options }) {
    const seats = seatPlayers(players);
    const n = seats.length;
    const s = {
      id, mode, kind: mode, expansion: 'none',
      options: { vpTarget: options.vpTarget || spec.vpTarget, ...(options.game || {}) },
      cards: KEYS.slice(), // the client shows exactly these items in the hand
      board: null,
      buildings: {}, roads: {}, knights: {}, ships: {},
      players: seats.map((pl, i) => ({
        userId: pl.id, name: pl.name, color: pl.color || C.COLORS[i], country: pl.country || null,
        res: zero(KEYS),
      })),
      phase: 'setup', step: null, turn: 0, current: 0,
      setup: { queue: [...[...Array(n).keys()], ...[...Array(n).keys()].reverse()], idx: 0, need: 'settlement', last: null },
      dice: null, pending: [], pgroup: 0,
      bank: spec.supply ? { ...spec.supply(n) } : {},
      longestRoad: { p: null, len: 0 }, largestArmy: { p: null, count: 0 },
      trade: null, tradeSeq: 0, flags: {},
      log: [], chat: [],
      stats: { rolls: zero([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), gained: seats.map(() => 0), turns: 0 },
      winner: null, startedAt: Date.now(), finishedAt: null, version: 0,
    };
    return s;
  }
  function start(s) {
    s.current = s.setup.queue[0];
    log(s, 'Game started. {@ps} take their seats.', { ps: s.players.map((_, i) => i) });
    log(s, '{@p} places first.', { p: s.current });
  }

  // ---------------------------------------------------------------- geometry helpers
  const distanceOk = (s, v) => !s.buildings[v] && V(s, v).adj.every(a => !s.buildings[a]);
  const landVertex = (s, v) => V(s, v).hexes.some(h => s.board.hexes[h].terrain !== 'sea');
  const touchesOwnRoad = (s, v, p) => V(s, v).edges.some(e => s.roads[e] === p);
  const foreignAt = (s, v, p) => !!(s.buildings[v] && s.buildings[v].p !== p);
  const edgeOk = (s, e) => spec.roadEdgeOk ? spec.roadEdgeOk(s, e) : true;
  const vertexOk = (s, v) => (spec.settleSpotOk ? spec.settleSpotOk(s, v) : true) && landVertex(s, v);

  function legalSetupSettlements(s) { return s.board.vertices.filter(v => distanceOk(s, v.id) && vertexOk(s, v.id)).map(v => v.id); }
  function legalSetupRoads(s) { return V(s, s.setup.last).edges.filter(e => s.roads[e] === undefined && edgeOk(s, e)); }
  function legalRoads(s, p) {
    return s.board.edges.filter(e => {
      if (s.roads[e.id] !== undefined || !edgeOk(s, e.id)) return false;
      return e.v.some(v => {
        const b = s.buildings[v];
        if (b && b.p === p) return true;
        if (foreignAt(s, v, p)) return false;
        return touchesOwnRoad(s, v, p);
      });
    }).map(e => e.id);
  }
  function legalSettlements(s, p) {
    return s.board.vertices.filter(v => distanceOk(s, v.id) && vertexOk(s, v.id) && touchesOwnRoad(s, v.id, p)).map(v => v.id);
  }
  const ownBuildings = (s, p, type) => Object.entries(s.buildings).filter(([, b]) => b.p === p && (!type || b.type === type)).map(([v]) => +v);
  const countRoads = (s, p) => Object.values(s.roads).filter(o => o === p).length;
  const count = (s, p, type) => ownBuildings(s, p, type).length;

  // ---------------------------------------------------------------- longest road
  function longestFor(s, p, withPath = false) {
    const own = new Set(Object.keys(s.roads).filter(e => s.roads[e] === p).map(Number));
    if (!own.size) return withPath ? { len: 0, edges: [] } : 0;
    let best = 0, bestPath = [];
    const used = new Set(), path = [];
    const dfs = (v, len) => {
      if (len > best) { best = len; if (withPath) bestPath = path.slice(); }
      if (len > 0 && foreignAt(s, v, p)) return;
      for (const e of V(s, v).edges) {
        if (!own.has(e) || used.has(e)) continue;
        used.add(e); path.push(e);
        const [a, b] = E(s, e).v;
        dfs(a === v ? b : a, len + 1);
        path.pop(); used.delete(e);
      }
    };
    const starts = new Set();
    own.forEach(e => E(s, e).v.forEach(v => starts.add(v)));
    starts.forEach(v => dfs(v, 0));
    return withPath ? { len: best, edges: bestPath } : best;
  }
  function updateLongest(s) {
    if (spec.noLongestRoad) return;
    const lens = s.players.map((_, p) => longestFor(s, p));
    const max = Math.max(...lens), h = s.longestRoad.p, prev = h;
    if (h !== null && lens[h] >= 5 && lens[h] === max) s.longestRoad.len = lens[h];
    else {
      const top = lens.map((l, i) => [l, i]).filter(([l]) => l === max);
      if (max >= 5 && top.length === 1) s.longestRoad = { p: top[0][1], len: max };
      else s.longestRoad = { p: null, len: 0 };
    }
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
  const activePending = s => (s.pending.length ? s.pending.filter(it => it.group === s.pending[0].group) : []);
  const findPending = (s, p, type) => activePending(s).find(it => it.player === p && (!type || it.type === type));
  const resolvePending = (s, item) => { s.pending.splice(s.pending.indexOf(item), 1); };

  // ---------------------------------------------------------------- turn flow
  function snapshot(s, final = false) {
    if (!s.track) s.track = [];
    s.track.push({
      t: s.turn, p: s.current, d: s.dice ? s.dice.total : null,
      vp: s.players.map((_, i) => spec.vp(s, i, final)),
      c: s.players.map(pl => handCount(s, pl)),
      g: s.stats.gained.slice(),
    });
    if (s.track.length > 600) s.track.splice(0, s.track.length - 600);
  }
  function finish(s, winner, message, params) {
    s.phase = 'over'; s.winner = winner; s.finishedAt = Date.now(); s.pending = []; s.trade = null;
    if (message) log(s, message, params || {});
    snapshot(s, true);
  }
  function checkWin(s) {
    if (s.phase !== 'play' || s.winner !== null) return;
    const p = s.current;
    if (spec.vp(s, p) >= (s.options.vpTarget)) finish(s, p, '{@p} wins with {n} victory points!', { p, n: spec.vp(s, p) });
  }
  function nextTurn(s) {
    snapshot(s);
    s.trade = null; s.flags = {};
    s.current = (s.current + 1) % s.players.length;
    s.turn++; s.stats.turns++;
    s.step = 'roll'; s.dice = null;
    if (spec.onTurnStart) spec.onTurnStart(s);
    checkWin(s);
  }

  const isActor = (s, p) => s.phase === 'play' && !s.pending.length && s.step === 'main' && p === s.current;
  function requireActor(s, p) { if (!isActor(s, p)) fail('It is not your move right now.'); }
  function requireMain(s, p) { if (s.phase !== 'play' || s.pending.length || s.step !== 'main' || p !== s.current) fail('Not allowed right now.'); }

  // ---------------------------------------------------------------- production
  // `producers(s, total)` returns, per player, what they want; the kit applies the bank shortage rule
  function rollDice(s, forced) {
    const red = forced ? forced[0] : d6(), yellow = forced ? forced[1] : d6();
    const total = red + yellow;
    s.dice = { red, yellow, total, event: null };
    s.stats.rolls[total]++;
    s.flags.rolled = true;
    s.step = 'main';
    log(s, '{@p} rolled {n}.', { p: s.current, n: total });
    return total;
  }

  // ---------------------------------------------------------------- handlers shared by every game
  const H = {
    chat(s, p, a) {
      const text = String(a.text || '').slice(0, 300).trim();
      if (!text) return;
      s.chat.push({ p, text, at: Date.now() });
      if (s.chat.length > 150) s.chat.shift();
      s.version--; // chat is not a game move
    },
    placeSettlement(s, p, a) {
      if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'settlement') fail('Not your placement.');
      if (!legalSetupSettlements(s).includes(a.v)) fail('Too close to another building.');
      s.buildings[a.v] = { p, type: 'settlement' };
      s.setup.last = a.v; s.setup.need = 'road';
      log(s, '{@p} placed a settlement.', { p });
      if (spec.afterSetupSettlement) spec.afterSetupSettlement(s, p, a.v);
    },
    placeRoad(s, p, a) {
      if (s.phase !== 'setup' || p !== s.current || s.setup.need !== 'road') fail('Not your placement.');
      if (!legalSetupRoads(s).includes(a.e)) fail('The road must touch your new building.');
      s.roads[a.e] = p;
      s.setup.idx++;
      const n = s.players.length;
      // the second building pays one card per neighbouring tile
      if (s.setup.idx > n && spec.setupPays !== false) setupPay(s, p, s.setup.last);
      if (s.setup.idx >= s.setup.queue.length) {
        s.phase = 'play'; s.step = 'roll'; s.turn = 1; s.current = s.setup.queue[0]; s.setup = null;
        s.stats.turns = 1;
        log(s, 'Setup complete. {@p} begins.', { p: s.current });
        s.track = [];
        snapshot(s); s.track[0].t = 0;
        updateLongest(s);
        if (spec.onTurnStart) spec.onTurnStart(s);
        return;
      }
      s.current = s.setup.queue[s.setup.idx];
      s.setup.need = 'settlement'; s.setup.last = null;
    },
    roll(s, p) {
      if (s.phase !== 'play' || s.pending.length || p !== s.current) fail('Not allowed right now.');
      if (s.step !== 'roll') fail('Already rolled.');
      spec.roll(s);
      checkWin(s);
    },
    endTurn(s, p) { requireMain(s, p); nextTurn(s); },
    buildRoad(s, p, a) {
      requireActor(s, p);
      if (!legalRoads(s, p).includes(a.e)) fail('You cannot build a road there.');
      if (countRoads(s, p) >= spec.pieces.road) fail('No roads left.');
      const pl = P(s, p), cost = spec.costs.road;
      if (!has(pl, cost)) fail('Not enough resources.');
      pay(s, pl, cost);
      s.roads[a.e] = p;
      log(s, '{@p} built a road.', { p });
      updateLongest(s);
    },
    buildSettlement(s, p, a) {
      requireActor(s, p);
      if (!legalSettlements(s, p).includes(a.v)) fail('You cannot build a settlement there.');
      if (count(s, p, 'settlement') >= spec.pieces.settlement) fail('No settlements left.');
      const pl = P(s, p), cost = spec.costs.settlement;
      if (!has(pl, cost)) fail('Not enough resources.');
      pay(s, pl, cost);
      s.buildings[a.v] = { p, type: 'settlement' };
      log(s, '{@p} built a settlement.', { p });
      updateLongest(s);
      if (spec.afterBuild) spec.afterBuild(s, p, 'settlement', a.v);
    },
    buildCity(s, p, a) {
      requireActor(s, p);
      const b = s.buildings[a.v];
      if (!b || b.p !== p || b.type !== 'settlement') fail('Pick one of your settlements.');
      if (count(s, p, 'city') >= spec.pieces.city) fail('No cities left.');
      const pl = P(s, p), cost = spec.costs.city;
      if (!has(pl, cost)) fail('Not enough resources.');
      pay(s, pl, cost);
      b.type = 'city';
      log(s, '{@p} built a city.', { p });
      if (spec.afterBuild) spec.afterBuild(s, p, 'city', a.v);
    },
    // ---- trading between players
    offerTrade(s, p, a) {
      requireMain(s, p);
      const keys = spec.tradeKeys || KEYS;
      if (!validCards(a.give, keys) || !validCards(a.get, keys) || !sum(a.give) || !sum(a.get)) fail('Set up both sides of the trade.');
      if (!has(P(s, p), a.give)) fail('You do not have those cards.');
      s.trade = { id: ++s.tradeSeq, from: p, give: clean(a.give), get: clean(a.get), responses: {} };
      log(s, '{@p} offers {$g} for {$w}.', { p, g: clean(a.give), w: clean(a.get) });
    },
    respondTrade(s, p, a) {
      const t = s.trade;
      if (!t || t.id !== a.id || p === t.from) fail('No such offer.');
      if (a.accept && !has(P(s, p), t.get)) fail('You do not have the requested cards.');
      t.responses[p] = a.accept ? 'accept' : 'reject';
    },
    confirmTrade(s, p, a) {
      requireMain(s, p);
      const t = s.trade;
      if (!t || t.from !== p || t.responses[a.with] !== 'accept') fail('That player has not accepted.');
      const me = P(s, p), them = P(s, a.with);
      if (!has(me, t.give) || !has(them, t.get)) fail('Someone no longer has the cards.');
      for (const [k, n] of Object.entries(t.give)) moveCard(me, them, k, n);
      for (const [k, n] of Object.entries(t.get)) moveCard(them, me, k, n);
      log(s, '{@p} traded {$g} with {@q} for {$w}.', { p, q: a.with, g: t.give, w: t.get });
      s.trade = null;
    },
    cancelTrade(s, p) {
      if (!s.trade || s.trade.from !== p) fail('No offer to cancel.');
      s.trade = null;
    },
    // ---- the bank: spec.bankRate(s, p, give) gives how many of `give` buy one card of `get`
    bankTrade(s, p, a) {
      requireMain(s, p);
      const pl = P(s, p);
      const give = a.give, get = a.get;
      const buys = spec.bankBuys || KEYS.filter(k => s.bank[k] !== undefined);
      if (!KEYS.includes(give) || !buys.includes(get) || give === get) fail('Pick what to trade.');
      const ratio = spec.bankRate(s, p, give);
      if (!ratio) fail('The bank does not take that.');
      if (pl.res[give] < ratio) fail('Not enough resources.');
      if (s.bank[get] !== undefined && s.bank[get] < 1) fail('The bank does not have that.');
      pay(s, pl, { [give]: ratio });
      take(s, pl, get, 1);
      log(s, '{@p} traded {$g} with the bank for {$w}.', { p, g: { [give]: ratio }, w: { [get]: 1 } });
    },
    // answering a 7: discard half of an oversized hand
    discard(s, p, a) {
      const it = findPending(s, p, 'discard');
      if (!it) fail('Nothing to discard.');
      const keys = spec.limited || KEYS;
      if (!validCards(a.cards, keys) || sum(a.cards) !== it.count) fail('Choose exactly {n} cards.', { n: it.count });
      const pl = P(s, p);
      if (!has(pl, a.cards)) fail('You do not have those cards.');
      pay(s, pl, a.cards);
      log(s, '{@p} discarded cards: {n}.', { p, n: it.count });
      resolvePending(s, it);
    },
  };

  // each player's free starting cards from the second building
  function setupPay(s, p, v) {
    const got = {};
    for (const h of V(s, v).hexes) {
      const k = spec.terrainCard(s.board.hexes[h].terrain, s.board.hexes[h]);
      if (k) { const m = take(s, P(s, p), k, 1); if (m) got[k] = (got[k] || 0) + m; }
    }
    if (sum(got)) { log(s, '{@p} receives {$c}.', { p, c: got }); }
  }

  // hand limit check after a 7: everyone above the limit owes half
  function sevenDiscards(s) {
    const items = [];
    s.players.forEach((pl, p) => {
      const h = handCount(s, pl);
      const lim = spec.handLimit ? spec.handLimit(s, p) : 7;
      if (h > lim) items.push({ type: 'discard', player: p, count: Math.floor(h / 2) });
    });
    pushPending(s, items);
  }

  // ---------------------------------------------------------------- act / view
  function act(s, p, a, HANDLERS) {
    if (!a || typeof a.type !== 'string') fail('Bad action.');
    if (s.phase === 'over') fail('The game is over.');
    if (p < 0 || p >= s.players.length) fail('You are not in this game.');
    const handler = HANDLERS[a.type];
    if (!handler) fail('Unknown action.');
    handler(s, p, a);
    s.version++;
    if (s.phase === 'play' && !s.pending.length) checkWin(s);
  }

  // what any seat may know: everything public plus its own hand
  function viewCommon(s, me, extraPlayer) {
    const board = {
      hexes: s.board.hexes.map(h => (spec.viewHex ? spec.viewHex(s, h) : { id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, verts: h.verts })),
      vertices: s.board.vertices.map(v => ({ id: v.id, x: v.x, y: v.y })),
      edges: s.board.edges.map(e => ({ id: e.id, v: e.v })),
      ports: s.board.ports || [],
    };
    const activeGroup = s.pending.length ? s.pending[0].group : null;
    const view = {
      id: s.id, mode: s.mode, kind: s.mode, expansion: 'none', options: s.options, me, cards: s.cards,
      phase: s.phase, step: s.step, turn: s.turn, current: s.current,
      setup: s.setup && { need: s.setup.need, round: s.setup.idx < s.players.length ? 1 : 2 },
      board,
      robber: null, merchant: null,
      buildings: s.buildings, roads: s.roads, knights: {}, ships: {}, bridges: {},
      players: s.players.map((pl, i) => {
        const self = i === me || s.phase === 'over';
        return {
          name: pl.name, color: pl.color, country: pl.country, userId: pl.userId,
          cards: handCount(s, pl), res: self ? pl.res : null,
          vp: spec.vp(s, i, self), breakdown: self ? spec.breakdown(s, i) : null,
          handLimit: spec.handLimit ? spec.handLimit(s, i) : 7,
          ...(extraPlayer ? extraPlayer(s, i, self) : {}),
        };
      }),
      longestRoad: s.longestRoad, largestArmy: s.largestArmy,
      dice: s.dice,
      pending: s.pending.map(it => ({ ...it })), activeGroup,
      trade: s.trade, flags: {}, free: { roads: 0, promotes: 0 },
      bank: s.bank,
      log: s.log.slice(-80), chat: s.chat.slice(-80),
      stats: { rolls: s.stats.rolls, gained: s.stats.gained },
      track: s.track || [],
      winner: s.winner,
      version: s.version,
    };
    return view;
  }

  function summary(s) {
    return {
      id: s.id, mode: s.mode, kind: s.mode, expansion: 'none', scenario: null, variants: null, big: false, vpTarget: s.options.vpTarget,
      startedAt: s.startedAt, finishedAt: s.finishedAt, turns: s.stats.turns,
      winner: s.winner === null ? null : s.players[s.winner].userId,
      lost: s.winner === null,
      players: s.players.map((pl, i) => ({
        userId: pl.userId, name: pl.name, color: pl.color, country: pl.country || null, vp: spec.vp(s, i),
        breakdown: spec.breakdown(s, i), gained: s.stats.gained[i], knightsPlayed: 0,
      })),
      rolls: s.stats.rolls,
    };
  }

  return {
    spec, fail, log, d6, sum, zero, clean, P, V, E, KEYS, isCard,
    handCount, has, pay, take, moveCard, validCards, randomCard,
    baseState, start, distanceOk, landVertex, touchesOwnRoad, foreignAt,
    legalSetupSettlements, legalSetupRoads, legalRoads, legalSettlements, ownBuildings, countRoads, count,
    longestFor, updateLongest, pushPending, activePending, findPending, resolvePending,
    snapshot, finish, checkWin, nextTurn, isActor, requireActor, requireMain, rollDice, setupPay, sevenDiscards,
    HANDLERS: H, act, viewCommon, summary,
  };
}

module.exports = { createKit, fail, log, d6, sum, zero, clean, P, V, E, shuffle };
