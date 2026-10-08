'use strict';
// Traders & Barbarians, scenario "Der Barbarenüberfall" (the Barbarian Attack). Barbarians land on the coast tiles, three of
// them conquer a tile (no yield, no building, houses on it are lost for points). Knights from the castle stand on edges,
// march 3 edges (5 for 1 grain) at the end of the turn and drive the barbarians off when they outnumber them; the
// prisoners are worth a point for every two. First to 12 points wins. No robber, no Largest Army.

const C = require('./constants');

module.exports = function make(core, HB) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, hand, countPieces } = core;
  const hex = (s, id) => s.board.hexes[id];
  const KNIGHTS = 6;
  // 36 barbarians in the box; the 5-6 player expansion adds 12 more
  const BARBARIANS = { standard: 36, extended: 48 };
  // the 26 development cards: 14 Knighthood, 4 Swift Knight, 4 Treason, 4 Capture (card list of the English rulebook, 6th edition)
  const DECK = { consecration: 14, strong: 4, treason: 4, captive: 4 };
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // The two fixed layouts of the books (hex ids run row by row). 3-4 players (book p. 15): desert top right, castle bottom left.
  // 5-6 players (5-6 book p. 8): 30 hexes in rows of 3-4-5-6-5-4-3, two castles and two deserts on the coast, the 12 and the 2 chip
  // once each; the numbers 5 and 9 are on two coast hexes each.
  const LAYOUT = {
    standard: {
      numbers: { 0: 3, 1: 8, 3: 9, 4: 4, 5: 5, 6: 10, 7: 12, 8: 6, 9: 10, 10: 8, 11: 11, 12: 4, 13: 9, 14: 3, 15: 5, 17: 6, 18: 2 },
      coast: [0, 1, 3, 6, 7, 11, 12, 15, 17, 18], inner: [4, 5, 8, 9, 10, 13, 14], deserts: [2], castles: [16],
      coastT: ['hills', 'hills', 'forest', 'forest', 'pasture', 'pasture', 'pasture', 'fields', 'fields', 'mountains'],
      innerT: ['hills', 'forest', 'pasture', 'fields', 'fields', 'mountains', 'mountains'],
      start: 4, // the expelling starts with the number 4 hex next to the castle
    },
    extended: {
      numbers: { 0: 12, 1: 9, 2: 3, 3: 4, 4: 5, 5: 10, 6: 8, 7: 5, 8: 11, 9: 6, 10: 3, 13: 8, 14: 10, 15: 4, 16: 6, 19: 3, 20: 8, 21: 11, 22: 9, 23: 6, 24: 4, 25: 9, 26: 10, 27: 2, 28: 5, 29: 11 },
      coast: [0, 1, 2, 3, 6, 7, 22, 23, 26, 27, 28, 29], inner: [4, 5, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 24, 25], deserts: [11, 18], castles: [12, 17],
      coastT: ['hills', 'hills', 'hills', 'forest', 'forest', 'forest', 'pasture', 'pasture', 'fields', 'fields', 'mountains', 'mountains'],
      innerT: ['hills', 'hills', 'forest', 'forest', 'pasture', 'pasture', 'pasture', 'fields', 'fields', 'fields', 'fields', 'mountains', 'mountains', 'mountains'],
      start: 5, // ... with the number 5 hex next to a castle
    },
  };
  // the three pairs of castle edges: die 1 or 6 = purple, 2 or 5 = green, 3 or 4 = brown (English rulebook p. 18)
  const DIE_COLOUR = { 1: 'purple', 2: 'green', 3: 'brown', 4: 'brown', 5: 'green', 6: 'purple' };

  function makeBoard({ kind, geometry, placePorts, shuffle: sh }) {
    const { BOARDS } = C;
    const def = BOARDS[kind], L = LAYOUT[kind];
    const geo = geometry(def.rows);
    const coastT = sh(L.coastT.slice());
    const innerT = sh(L.innerT.slice());
    geo.hexes.forEach(h => { h.number = L.numbers[h.id] ?? null; });
    L.coast.forEach((id, i) => { geo.hexes[id].terrain = coastT[i]; geo.hexes[id].coast = true; });
    L.inner.forEach((id, i) => { geo.hexes[id].terrain = innerT[i]; });
    L.deserts.forEach(id => { geo.hexes[id].terrain = 'desert'; geo.hexes[id].number = null; });
    L.castles.forEach(id => { geo.hexes[id].terrain = 'castle'; geo.hexes[id].number = null; });
    const ports = placePorts(geo, def.ports);
    ports.forEach(p => geo.edges[p.edge].v.forEach(v => { geo.vertices[v].port = p.type; }));
    const board = { kind, hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports };
    board.castle = L.castles[0]; board.castles = L.castles.slice(); board.desert = L.deserts[0];
    board.coast = L.coast.slice();
    // the edges of the castle carry three colours, one per direction: "/" purple, "\" green, upright brown (picture on p. 15)
    board.edgeDir = geo.edges.map(e => {
      const [a, b] = e.v.map(i => geo.vertices[i]);
      const dx = b.x - a.x, dy = b.y - a.y;
      return Math.abs(dx) < 1e-6 ? 'brown' : dx * dy < 0 ? 'purple' : 'green';
    });
    // clockwise order of the coast hexes, starting at the hex with the number 4 (5 with 5-6 players) next to the castle
    const ang = id => Math.atan2(geo.hexes[id].y, geo.hexes[id].x);
    const ring = L.coast.concat(L.deserts, L.castles).sort((x, y) => ang(x) - ang(y));
    let si = ring.findIndex(id => L.coast.includes(id) && geo.hexes[id].number === L.start && geo.hexes[id].neighbors.some(n => L.castles.includes(n)));
    if (si < 0) si = 0;
    board.checkOrder = ring.slice(si).concat(ring.slice(0, si)).filter(id => L.coast.includes(id));
    return board;
  }

  function init(s) {
    const barb = {};
    s.board.coast.forEach(id => { barb[id] = 0; });
    // set-up: 1 barbarian on the hex with the number 2 and 1 on the hex with the number 12
    s.board.coast.forEach(id => { if (hex(s, id).number === 2 || hex(s, id).number === 12) barb[id] = 1; });
    const deck = [];
    Object.entries(DECK).forEach(([k, n]) => { for (let i = 0; i < n; i++) deck.push(k); });
    s.hub.bb = { barb, supply: BARBARIANS[s.board.kind === 'extended' ? 'extended' : 'standard'] - Object.values(barb).reduce((a, b) => a + b, 0), knights: {}, deck: shuffle(deck), discard: [], prisoners: s.players.map(() => 0), moved: {}, last: null };
    s.noRobberPlay = true;
  }

  // ------------------------------------------------------------ state helpers
  const bb = s => s.hub.bb;
  const conqueredHex = (s, id) => bb(s).barb[id] >= 3;
  const isCoast = (s, id) => s.board.coast.includes(id);
  const knightsOf = (s, p) => Object.values(bb(s).knights).filter(k => k.p === p).length;
  const reserve = (s, p) => KNIGHTS - knightsOf(s, p);
  const edgeConquered = (s, e) => E(s, e).hexes.some(id => isCoast(s, id) && conqueredHex(s, id));
  const castlesOf = s => s.board.castles || [s.board.castle];
  const castleEdges = s => [].concat(...castlesOf(s).map(c => hex(s, c).edges));
  // a settlement or city is lost when every tile around it is a conquered coast tile
  function conquered(s, v) {
    const hs = V(s, v).hexes;
    return hs.every(id => isCoast(s, id) && conqueredHex(s, id));
  }
  const edgeFree = (s, e) => !bb(s).knights[e];

  function addBarb(s, id) {
    const b = bb(s);
    if (b.supply <= 0 || b.barb[id] >= 3) return false;
    b.barb[id]++; b.supply--;
    if (b.barb[id] === 3) { log(s, 'The barbarians conquer the {n} tile.', { n: hex(s, id).number, h: id }); core.updateLongest(s); }
    return true;
  }
  function removeBarb(s, id) {
    const b = bb(s);
    if (b.barb[id] <= 0) return false;
    const was = b.barb[id];
    b.barb[id]--;
    if (was === 3) log(s, 'The {n} tile is free again.', { n: hex(s, id).number, h: id });
    return true;
  }

  // ------------------------------------------------------------ barbarians land (after every settlement or city)
  // Roll the dice until the result is not a 7 and not a number already rolled; the coast hex with that number gets 1 barbarian
  // (if it holds fewer than 3). Three numbers, as long as the supply is not empty. With 5-6 players the numbers 5 and 9 are on
  // two hexes each: both get a barbarian.
  function raid(s, p) {
    const b = bb(s);
    if (b.supply <= 0) return;
    const seen = [];
    let guard = 0;
    while (seen.length < 3 && b.supply > 0 && guard++ < 500) {
      const n = d6() + d6();
      if (n === 7 || seen.includes(n)) continue;
      seen.push(n);
      s.board.coast.filter(i => hex(s, i).number === n).forEach(id => { if (b.supply > 0 && b.barb[id] < 3) addBarb(s, id); });
    }
    log(s, 'Barbarians land: {n}.', { p, n: seen.join(', '), ns: seen });
  }

  // ------------------------------------------------------------ rules the engine asks about
  const roadEdgeOk = (s, e) => !edgeConquered(s, e);
  const settlementOk = (s, v) => !V(s, v).hexes.some(id => isCoast(s, id) && conqueredHex(s, id));
  const cityOk = settlementOk;
  const hexPays = (s, h) => !(isCoast(s, h.id) && conqueredHex(s, h.id));
  function built(s, p, kind) {
    if (s.phase !== 'play') return;
    if (kind === 'settlement' || kind === 'city') { log(s, '{@p} has built, so barbarians land.', { p }); raid(s, p); }
  }
  function vpExtra(s, p) {
    let pts = Math.floor(bb(s).prisoners[p] / 2);
    for (const [v, b] of Object.entries(s.buildings)) if (b.p === p && conquered(s, +v)) pts -= b.type === 'city' ? 2 : 1;
    return pts;
  }
  const seven = s => {
    const opts = HB.helpers.stealOptions(s, s.current);
    if (opts.length) pushPending(s, [{ type: 'steal', player: s.current, options: opts }]);
  };
  const knightScore = (s, p) => knightsOf(s, p); // Conflict (event card): the most knights placed on the board
  const cardKnights = () => 0; // Tournament counts face-up Knight cards: there are none in this scenario (the cards are played at once and discarded)

  // ------------------------------------------------------------ development cards (turned over and played at once)
  const devDeck = s => bb(s).deck.concat(bb(s).discard);
  function drawCard(s) {
    const b = bb(s);
    if (!b.deck.length) { b.deck = shuffle(b.discard.splice(0)); }
    return b.deck.pop();
  }
  function buyDev(s, p) {
    core.requireActor(s, p);
    const pl = P(s, p);
    if (!devDeck(s).length) fail('The development deck is empty.');
    if (!has(pl, C.COSTS.dev)) fail('Not enough resources.');
    pay(s, pl, C.COSTS.dev);
    let card = drawCard(s), guard = 0;
    // a captive card with no barbarian on the board is put aside and a new card is drawn
    while (card === 'captive' && !boardHasBarbs(s) && guard++ < 40) { bb(s).discard.push(card); card = devDeck(s).length ? drawCard(s) : null; if (!card) break; }
    if (!card) { log(s, '{@p} bought a development card.', { p }); return true; }
    log(s, '{@p} turned over {%c}.', { p, c: card });
    bb(s).discard.push(card);
    playCard(s, p, card);
    return true;
  }
  const boardHasBarbs = s => Object.values(bb(s).barb).some(n => n > 0);
  function playCard(s, p, card) {
    const b = bb(s);
    switch (card) {
      case 'consecration': {
        const edges = castleEdges(s).filter(e => edgeFree(s, e));
        if (reserve(s, p) > 0 && edges.length) pushPending(s, [{ type: 'placeKnight', player: p, pub: { edges } }], true);
        else log(s, '{@p} has no knight to place.', { p });
        break;
      }
      case 'strong': {
        const edges = s.board.edges.map(e => e.id).filter(e => edgeFree(s, e));
        if (reserve(s, p) > 0) pushPending(s, [{ type: 'placeKnight', player: p, pub: { edges } }], true);
        else log(s, '{@p} has no knight to place.', { p });
        break;
      }
      case 'treason':
        P(s, p).gold += 2;
        log(s, '{@p} earns {n} gold.', { p, n: 2 });
        if (boardHasBarbs(s) || b.supply > 0) pushPending(s, [{ type: 'treason', player: p }], true);
        break;
      case 'captive':
        pushPending(s, [{ type: 'captive', player: p }], true);
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------ knights on edges
  function neighbours(s, e) {
    const out = new Set();
    E(s, e).v.forEach(v => V(s, v).edges.forEach(x => { if (x !== e) out.add(x); }));
    return [...out];
  }
  // edges within `max` steps of `from`, with their distance
  function reach(s, from, max) {
    const dist = new Map([[from, 0]]);
    let frontier = [from];
    for (let d = 1; d <= max; d++) {
      const next = [];
      for (const e of frontier) for (const x of neighbours(s, e)) if (!dist.has(x)) { dist.set(x, d); next.push(x); }
      frontier = next;
    }
    return dist;
  }
  function moveOptions(s, p, from) {
    const grain = P(s, p).res.grain >= 1;
    const dist = reach(s, from, grain ? 5 : 3);
    const castle = castleEdges(s);
    const near = [], far = [];
    dist.forEach((d, e) => {
      if (e === from || !edgeFree(s, e) || castle.includes(e)) return;
      (d <= 3 ? near : far).push(e);
    });
    return { near, far };
  }
  const movableKnights = (s, p) => Object.entries(bb(s).knights).filter(([e, k]) => k.p === p && !bb(s).moved[e]).map(([e]) => +e);
  const onCastle = (s, p) => Object.entries(bb(s).knights).filter(([e, k]) => k.p === p && castleEdges(s).includes(+e)).map(([e]) => +e);

  // ------------------------------------------------------------ victory over the barbarians (after every turn)
  const roll2 = () => d6() + d6();
  function victory(s) {
    const b = bb(s);
    for (const id of s.board.checkOrder) {
      const n = b.barb[id];
      if (n <= 0) continue;
      const near = {};
      hex(s, id).edges.forEach(e => { const k = b.knights[e]; if (k) near[k.p] = (near[k.p] || 0) + 1; });
      const total = Object.values(near).reduce((a, c) => a + c, 0);
      if (total <= n) continue;
      const wasConquered = n >= 3;
      b.barb[id] = 0; // the barbarians do not return to the supply: they become prisoners
      log(s, 'The knights defeat the barbarians on the {n} tile.', { n: hex(s, id).number, h: id });
      if (wasConquered) log(s, 'The {n} tile is free again.', { n: hex(s, id).number, h: id });
      const who = Object.keys(near).map(Number);
      share(s, who, n, near);
      // after each victory a die is rolled: the knights involved (on the edges of this hex) that stand on the pair of edges with the
      // indicated orientation go back to their owner's supply, 3 gold for each
      const die = d6(), colour = DIE_COLOUR[die];
      log(s, 'The die shows {n}: the {#c} edges.', { n: die, c: colour });
      hex(s, id).edges.forEach(e => {
        const k = b.knights[e];
        if (!k || s.board.edgeDir[e] !== colour) return;
        delete b.knights[e];
        P(s, k.p).gold += 3;
        log(s, '{@p} loses a knight and receives 3 gold.', { p: k.p });
      });
      core.updateLongest(s);
    }
  }
  // who gets the prisoners
  function share(s, who, n, near) {
    const b = bb(s);
    const give = (p, k) => { b.prisoners[p] += k; log(s, '{@p} takes {n} prisoners.', { p, n: k }); };
    const consolation = p => { P(s, p).gold += 3; log(s, '{@p} receives 3 gold.', { p }); };
    if (who.length === 1) { give(who[0], n); return; }
    if (n < who.length) { // dice for the prisoners: the highest throws get one each, the others get gold
      let pool = who.slice(), got = [], left = n;
      while (left > 0 && pool.length) {
        const rolls = pool.map(p => [roll2(), p]);
        const max = Math.max(...rolls.map(r => r[0]));
        const top = rolls.filter(r => r[0] === max).map(r => r[1]);
        if (top.length <= left) { got.push(...top); left -= top.length; pool = pool.filter(p => !top.includes(p)); } else pool = top; // a tie for the last place is thrown again
      }
      got.forEach(p => give(p, 1));
      who.filter(p => !got.includes(p)).forEach(consolation);
      return;
    }
    who.forEach(p => give(p, 1));
    let rest = n - who.length;
    if (rest > 0) {
      const mx = Math.max(...who.map(p => near[p]));
      const lead = who.filter(p => near[p] === mx);
      if (lead.length === 1) give(lead[0], rest);
      else {
        let pool = lead.slice();
        while (pool.length > 1) {
          const rolls = pool.map(p => [roll2(), p]);
          const max = Math.max(...rolls.map(r => r[0]));
          pool = rolls.filter(r => r[0] === max).map(r => r[1]);
        }
        give(pool[0], rest);
        lead.filter(p => p !== pool[0]).forEach(consolation); // the other tied player(s) get 3 gold
      }
    }
  }

  // ------------------------------------------------------------ end of the turn
  function beginEnd(s, p) {
    if (movableKnights(s, p).length || onCastle(s, p).length) {
      s.hub.ending = true;
      bb(s).moved = {};
      pushPending(s, [{ type: 'moveKnights', player: p }]);
      return true;
    }
    victory(s);
    return false;
  }
  function continueEnd(s) {
    victory(s);
    s.hub.ending = false;
    bb(s).moved = {};
    core.finishTurn(s);
  }

  // ------------------------------------------------------------ handlers
  const handlers = {
    placeKnight(s, p, a) {
      const it = findPending(s, p, 'placeKnight');
      if (!it) fail('No knight to place.');
      if (!it.pub.edges.includes(a.e) || !edgeFree(s, a.e)) fail('Pick a free path.');
      if (reserve(s, p) <= 0) fail('No knights left.');
      bb(s).knights[a.e] = { p };
      resolvePending(s, it);
      log(s, '{@p} sets a knight.', { p });
    },
    treason(s, p, a) {
      const it = findPending(s, p, 'treason');
      if (!it) fail('Nothing to move.');
      const b = bb(s);
      const from = (a.from || []).map(Number), to = (a.to || []).map(Number);
      const withBarb = s.board.coast.filter(id => b.barb[id] > 0);
      const nFrom = Math.min(2, withBarb.length);
      if (new Set(from).size !== from.length || from.length !== nFrom || !from.every(id => b.barb[id] > 0)) fail('Pick two tiles with barbarians.');
      if (new Set(to).size !== to.length || to.length !== 2 || !to.every(id => isCoast(s, id) && b.barb[id] < 3 && !from.includes(id))) fail('Pick two other coast tiles that are not conquered.');
      from.forEach(id => removeBarb(s, id));
      b.supply += from.length; // back into the pool, then placed again
      to.forEach(id => addBarb(s, id));
      resolvePending(s, it);
      log(s, '{@p} sets barbarians against each other.', { p });
      core.updateLongest(s);
    },
    captive(s, p, a) {
      const it = findPending(s, p, 'captive');
      if (!it) fail('Nothing to take.');
      if (!isCoast(s, a.hex) || bb(s).barb[a.hex] <= 0) fail('Pick a tile with barbarians.');
      removeBarb(s, a.hex);
      bb(s).prisoners[p]++;
      resolvePending(s, it);
      log(s, '{@p} takes a prisoner.', { p });
      core.updateLongest(s);
    },
    moveKnight(s, p, a) {
      const it = findPending(s, p, 'moveKnights');
      if (!it) fail('It is not time to move knights.');
      const b = bb(s);
      const k = b.knights[a.from];
      if (!k || k.p !== p || b.moved[a.from]) fail('Pick one of your knights that has not moved.');
      const { near, far } = moveOptions(s, p, a.from);
      const isFar = far.includes(a.to);
      if (!near.includes(a.to) && !isFar) fail('The knight cannot go there.');
      if (isFar) { if (!has(P(s, p), { grain: 1 })) fail('Moving 5 paths costs 1 grain.'); pay(s, P(s, p), { grain: 1 }); }
      delete b.knights[a.from];
      b.knights[a.to] = k;
      b.moved[a.to] = true;
      log(s, '{@p} moves a knight.', { p });
    },
    knightsDone(s, p) {
      const it = findPending(s, p, 'moveKnights');
      if (!it) fail('It is not time to move knights.');
      if (onCastle(s, p).length) fail('Knights must leave the castle.');
      resolvePending(s, it);
    },
  };

  const legalExtra = (s, p, L, actor, main) => {
    for (const it of core.activePending(s).filter(i => i.player === p)) {
      if (it.type === 'placeKnight') L.knightPlace = it.pub.edges;
      if (it.type === 'captive') L.barbHexes = s.board.coast.filter(id => bb(s).barb[id] > 0);
      if (it.type === 'treason') { L.barbHexes = s.board.coast.filter(id => bb(s).barb[id] > 0); L.treasonTargets = s.board.coast.filter(id => bb(s).barb[id] < 3); }
      if (it.type === 'moveKnights') {
        L.knightMoves = {};
        movableKnights(s, p).forEach(e => { const o = moveOptions(s, p, e); if (o.near.length || o.far.length) L.knightMoves[e] = o; });
        L.knightsOnCastle = onCastle(s, p);
      }
    }
    if (main || actor) L.canBuyDev = actor && has(P(s, p), C.COSTS.dev) && devDeck(s).length > 0;
  };

  const viewBoard = (s, vb) => { vb.castle = s.board.castle; vb.castles = castlesOf(s); vb.edgeDir = s.board.edgeDir; vb.coast = s.board.coast; };
  const viewExtra = (s, me, v) => {
    const b = bb(s);
    v.hub.bb = {
      barb: b.barb, supply: b.supply, knights: b.knights, deck: devDeck(s).length, prisoners: b.prisoners, reserve: s.players.map((_, p) => reserve(s, p)),
      conquered: s.board.coast.filter(id => conqueredHex(s, id)),
      lost: Object.keys(s.buildings).map(Number).filter(vv => conquered(s, vv)),
    };
    v.players.forEach((pv, i) => { pv.prisoners = b.prisoners[i]; pv.pieces.knightsBb = reserve(s, i); });
  };

  return {
    makeBoard, init, roadEdgeOk, settlementOk, cityOk, hexPays, built, vpExtra, seven, knightScore, cardKnights, conquered,
    buyDev, devDeck, beginEnd, continueEnd, handlers, legalExtra, viewBoard, viewExtra,
    portUsable: (s, v) => !conquered(s, v),
  };
};
