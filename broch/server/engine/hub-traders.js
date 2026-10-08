'use strict';
// Traders & Barbarians, the scenario "Händler & Barbaren": glass and marble for the castle, sand for the glassworks, tools
// for the quarry. Everybody has a wagon and a wagon tableau; at the end of the turn the wagon rolls along the paths (a path
// costs 2 movement points, a road 1, somebody else's road 1 point and 1 gold to its owner, a barbarian 2 more). A delivery
// is worth a point and gold, a full tableau is worth a point. Three barbarians sit on the paths. No robber, no Longest Road.
// First to 13 points wins.

const C = require('./constants');

module.exports = function make(core, HB) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, steal } = core;
  const hex = (s, id) => s.board.hexes[id];
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // tableau, per level 1..5
  const MOVE = [4, 5, 6, 7, 7];
  const EXPEL = [null, [6], [5, 6], [4, 5, 6], [3, 4, 5, 6]]; // dice results that drive a barbarian off, from level 2 on
  const REWARD = [1, 2, 3, 4, 5];
  const UPGRADE = { 1: { lumber: 1, wool: 1, ore: 1 }, 2: { lumber: 1, wool: 1, ore: 1 }, 3: { lumber: 2, wool: 1, ore: 1 }, 4: { lumber: 2, wool: 1, ore: 1 } }; // read from the small pictures on the tableau
  const START_GOLD = 5;
  // what each tile of the book shows and where it has to go
  const FACES = { castle: ['tools', 'sand'], quarry: ['marble', 'sand'], glassworks: ['glass', 'tools'] };
  const DEST = { glass: 'castle', marble: 'castle', tools: 'quarry', sand: 'glassworks' };
  const DEV = { knight: 16, victoryPoint: 3, roadBuilding: 3, goodTrip: 3 }; // the 25 cards of the English rulebook: 16 Knight, 3 Road Building, 3 Swift Journey, 3 Victory Point
  // UNKNOWN: the 5-6 box adds "12 development cards" that are shuffled into the deck (5-6 book p3 and p10), but neither book prints which
  // cards they are (the page shows only the card back). This is a PLACEHOLDER, the 12 split in the proportions of the basic deck
  // (16:3:3:3). Replace it as soon as the real composition is known; it is the only place that says what the 5-6 deck holds.
  const DEV_EXTRA_56 = { knight: 8, victoryPoint: 1, roadBuilding: 2, goodTrip: 1 };

  // The two printed maps. 3-4 players (book p21): 16 land tiles dealt at random and the numbers without 2 and 12 around the
  // three commodity hexes (4 interior paths, the three sea sides carry an X marker). 5-6 players (5-6 book p10-11): a 37-tile
  // island with 7 commodity hexes (3 quarries, 3 glassworks, 1 castle), 2 deserts, the 28 number discs of the 5-6 set (2 and 12
  // ARE used) on the printed places and the remaining 28 land tiles dealt at random. Only 2 quarries, 2 glassworks and the castle are
  // new: they have SIX interior paths (no X markers); the quarry at the top left and the glassworks at the bottom right come
  // from the basic box and have four.
  const MAP34 = { rows: C.BOARDS.standard.rows, hexes: { 2: ['quarry', 4], 7: ['castle', 4], 18: ['glassworks', 4] }, tokens: 12 };
  const MAP56 = {
    rows: [4, 5, 6, 7, 6, 5, 4],
    hexes: { 0: ['quarry', 4], 3: ['glassworks', 6], 15: ['glassworks', 6], 18: ['castle', 6], 21: ['quarry', 6], 33: ['quarry', 6], 36: ['glassworks', 4] },
    deserts: [5, 31],
    numbers: { 1: 6, 2: 10, 4: 4, 6: 3, 7: 12, 8: 8, 9: 3, 10: 5, 11: 10, 12: 5, 13: 9, 14: 11, 16: 8, 17: 12, 19: 2, 20: 6, 22: 11, 23: 9, 24: 4, 25: 9, 26: 5, 27: 3, 28: 6, 29: 2, 30: 11, 32: 4, 34: 10, 35: 8 },
    land: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5 }, // the 5-6 set without its two deserts
    barbs: [[2, 7], [16, 22], [31, 32]], // the two hexes on both sides of each barbarian's path
    tokens: 18, // 12 from the basic box + 6 from the 5-6 box for each of the three stacks
  };
  const LAND34 = { hills: 3, forest: 4, pasture: 3, fields: 3, mountains: 3 }; // the basic set without the desert, 1 pasture and 1 field

  function makeBoard({ kind, geometry, placePorts, shuffle: sh, numberLand, edgeBetween }) {
    const { BOARDS } = C;
    const big = kind === 'extended';
    const map = big ? MAP56 : MAP34;
    const geo = geometry(map.rows);
    const ids = Object.keys(map.hexes).map(Number);
    const pool = sh(Object.entries(big ? MAP56.land : LAND34).flatMap(([t, n]) => Array(n).fill(t)));
    const rest = geo.hexes.map(h => h.id).filter(id => !ids.includes(id) && !(map.deserts || []).includes(id));
    rest.forEach((id, i) => { geo.hexes[id].terrain = pool[i]; });
    (map.deserts || []).forEach(id => { geo.hexes[id].terrain = 'desert'; geo.hexes[id].number = null; });
    ids.forEach(id => { geo.hexes[id].terrain = map.hexes[id][0]; geo.hexes[id].number = null; });
    const board = { kind, hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports: [] };
    if (big) rest.forEach(id => { geo.hexes[id].number = MAP56.numbers[id]; });
    else numberLand(board, rest, BOARDS.standard.numbers.filter(n => n !== 2 && n !== 12));
    // the paths inside a commodity hex: from its middle (never built on) to the corners
    board.centers = {}; board.landCorners = {}; board.blocked = []; board.targets = {}; board.paths = {};
    ids.forEach(id => {
      const [t, paths] = map.hexes[id];
      const h = geo.hexes[id];
      board.targets[id] = t; board.paths[id] = paths;
      // four paths: the three sides on the sea have none and carry an X marker; six paths: every corner and edge is open
      const landEdges = paths === 4 ? h.edges.filter(e => geo.edges[e].hexes.length === 2) : h.edges;
      const seaEdges = paths === 4 ? h.edges.filter(e => geo.edges[e].hexes.length === 1) : [];
      const corners = [...new Set(landEdges.flatMap(e => geo.edges[e].v))];
      const A = { id: geo.vertices.length, x: h.x, y: h.y, hexes: [id], adj: [], edges: [], center: true };
      geo.vertices.push(A);
      corners.forEach(c => {
        const e = { id: geo.edges.length, v: [c, A.id], hexes: [id], inner: true };
        geo.edges.push(e);
        A.adj.push(c); A.edges.push(e.id); geo.vertices[c].adj.push(A.id); geo.vertices[c].edges.push(e.id);
      });
      board.centers[id] = A.id;
      board.landCorners[id] = corners;
      seaEdges.forEach(e => board.blocked.push(e));
    });
    board.seaCorners = new Set();
    ids.forEach(id => geo.hexes[id].verts.forEach(v => { if (!board.landCorners[id].includes(v)) board.seaCorners.add(v); }));
    // harbours: not on the X-marked sea side of a commodity hex
    const portTypes = BOARDS[big ? 'extended' : 'standard'].ports;
    for (let i = 0; i < 400; i++) {
      const ports = placePorts(geo, portTypes);
      if (ports.every(p => !board.blocked.includes(p.edge) && geo.edges[p.edge].v.every(v => !board.seaCorners.has(v)))) { board.ports = ports; break; }
      if (i === 399) board.ports = ports;
    }
    geo.vertices.forEach(v => { delete v.port; });
    board.ports.forEach(p => geo.edges[p.edge].v.forEach(v => { geo.vertices[v].port = p.type; }));
    board.seaCorners = [...board.seaCorners];
    // three barbarians on paths, as printed
    board.barbStart = big
      ? MAP56.barbs.map(([a, b]) => edgeBetween(geo, a, b).id)
      : [geo.hexes[1].edges[2], geo.hexes[8].edges[3], geo.hexes[14].edges[1]];
    board.tokens = map.tokens;
    board.desert = undefined;
    return board;
  }

  function init(s) {
    const tb = { barb: {}, stacks: {}, tab: {}, wagons: {}, move: null };
    s.board.barbStart.forEach(e => { tb.barb[e] = true; });
    // one stack of commodity tokens per kind of commodity hex (12 each, 18 with the 5-6 box); all hexes of a kind draw from it
    Object.keys(FACES).forEach(t => {
      const tiles = [];
      for (let i = 0; i < s.board.tokens; i++) tiles.push(FACES[t][i % 2]);
      tb.stacks[t] = shuffle(tiles);
    });
    s.players.forEach((pl, p) => { pl.gold = START_GOLD; tb.tab[p] = { level: 1, ware: null, delivered: 0 }; });
    s.hub.tb = tb;
    const deck = [];
    const counts = { ...DEV };
    if (s.options.big) Object.entries(DEV_EXTRA_56).forEach(([k, n]) => { counts[k] = (counts[k] || 0) + n; });
    Object.entries(counts).forEach(([k, n]) => { for (let i = 0; i < n; i++) deck.push(k); });
    s.devDeck = shuffle(deck);
  }

  const tb = s => s.hub.tb;
  const targetOfHex = (s, id) => s.board.targets[id];
  const hexName = (s, ware) => DEST[ware];

  // ------------------------------------------------------------ rules the engine asks about
  const roadEdgeOk = (s, e) => !s.board.blocked.includes(e);
  const settlementOk = (s, v) => {
    const vx = V(s, v);
    if (vx.center) return false;
    return !s.board.seaCorners.includes(v);
  };
  const cityOk = () => true;
  const hexPays = () => true;
  const noLongest = true;
  const vpExtra = (s, p) => tb(s).tab[p].delivered + (tb(s).tab[p].level >= 5 ? 1 : 0);
  function built(s, p, kind, where) {
    if (s.phase === 'setup' && kind === 'city') { tb(s).wagons[p] = where; log(s, '{@p} parks a wagon next to the city.', { p }); }
  }

  // ------------------------------------------------------------ barbarians
  const barbEdgeOk = (s, e) => !s.board.blocked.includes(e) && !tb(s).barb[e];
  function seven(s) { pushPending(s, [{ type: 'moveBarb', player: s.current }]); }
  function knightCard(s, p) { pushPending(s, [{ type: 'moveBarb', player: p }], true); }
  function moveBarb(s, p, from, to) {
    const t = tb(s);
    if (!t.barb[from]) fail('Pick a barbarian.');
    if (!barbEdgeOk(s, to)) fail('A barbarian cannot go there.');
    delete t.barb[from];
    t.barb[to] = true;
    const owner = s.roads[to];
    log(s, '{@p} moves a barbarian.', { p });
    return owner;
  }

  // ------------------------------------------------------------ the wagons
  const upgradeCost = s => null;
  function stepInfo(s, p, from, e) {
    const t = tb(s), mv = t.move;
    if (s.board.blocked.includes(e)) return null;
    const to = E(s, e).v[0] === from ? E(s, e).v[1] : E(s, e).v[0];
    let cost = 2, pays = null;
    const road = s.roads[e];
    if (road !== undefined && !(s.damaged && s.damaged[e])) {
      cost = 1;
      if (road !== p) pays = road;
    }
    if (t.barb[e]) cost += 2;
    return { to, cost, pays, barb: !!t.barb[e], edge: e };
  }
  function wagonSteps(s, p) {
    const t = tb(s), mv = t.move;
    if (!mv || mv.placing != null) return [];
    const at = t.wagons[p];
    if (mv.arrived) return [];
    return V(s, at).edges.map(e => stepInfo(s, p, at, e)).filter(st => st && st.cost <= mv.mp && (!st.pays || P(s, p).gold >= 1));
  }
  // the top token of the stack beside this kind of hex (nothing when it is used up; the book does not say more)
  function drawWare(s, kind) {
    const st = tb(s).stacks[kind];
    return st.length ? st.pop() : null;
  }
  function arrive(s, p, hexId) {
    const t = tb(s), tab = t.tab[p], mv = t.move;
    const name = targetOfHex(s, hexId);
    if (!tab.ware) {
      tab.ware = drawWare(s, name);
      if (tab.ware) log(s, '{@p} reaches the {#t} and turns over a tile: {#w}.', { p, t: name, w: tab.ware });
      else log(s, '{@p} reaches the {#t}, but there are no more tiles.', { p, t: name });
    } else if (DEST[tab.ware] === name) {
      const reward = REWARD[tab.level - 1];
      tab.delivered++;
      P(s, p).gold += reward;
      log(s, '{@p} delivers {#w} to the {#t}: +1 point and {n} gold.', { p, t: name, w: tab.ware, n: reward });
      tab.ware = drawWare(s, name);
      if (tab.ware) log(s, '{@p} gets a new order: {#w}.', { p, w: tab.ware });
    } else log(s, '{@p} reaches the {#t}, but carries {#w}.', { p, t: name, w: tab.ware });
    mv.mp = 0; mv.arrived = true;
  }

  // ------------------------------------------------------------ end of the turn: the wagon rolls
  function beginEnd(s, p) {
    const t = tb(s);
    t.move = { p, mp: MOVE[t.tab[p].level - 1], start: MOVE[t.tab[p].level - 1], grain: false, arrived: false, moved: false, tried: {}, placing: null, trips: 1 };
    s.hub.ending = true;
    pushPending(s, [{ type: 'moveWagon', player: p }]);
    return true;
  }
  function continueEnd(s) {
    tb(s).move = null;
    s.hub.ending = false;
    core.checkWin(s); // "at any point during your turn": the points of a delivery win before the turn passes
    if (s.phase !== 'play') return;
    core.finishTurn(s);
  }

  // ------------------------------------------------------------ handlers
  const needMove = (s, p) => { const it = findPending(s, p, 'moveWagon'); if (!it || !tb(s).move) fail('It is not time to move your wagon.'); return tb(s).move; };
  const handlers = {
    wagonStep(s, p, a) {
      const mv = needMove(s, p);
      if (mv.placing != null) fail('Place the barbarian first.');
      const st = wagonSteps(s, p).find(x => x.to === a.to);
      if (!st) fail('The wagon cannot go there.');
      const t = tb(s);
      mv.mp -= st.cost; mv.moved = true;
      if (st.pays !== null) { P(s, p).gold -= 1; P(s, st.pays).gold += 1; log(s, '{@p} pays {@q} 1 gold for the road.', { p, q: st.pays }); }
      t.wagons[p] = st.to;
      const hexId = Object.entries(s.board.centers).find(([, v]) => v === st.to);
      if (hexId) { arrive(s, p, +hexId[0]); core.checkWin(s); }
      else if (wagonSteps(s, p).length === 0 && !mv.arrived) { /* stuck: the player ends the move */ }
    },
    wagonExpel(s, p, a) {
      const mv = needMove(s, p), t = tb(s);
      const lvl = t.tab[p].level;
      if (lvl < 2) fail('You can drive barbarians away from the second level on.');
      if (mv.placing != null || mv.arrived) fail('Not allowed right now.');
      const at = t.wagons[p];
      if (!V(s, at).edges.includes(a.edge) || !t.barb[a.edge]) fail('Stand in front of a barbarian first.');
      if (mv.tried[a.edge]) fail('You already tried that barbarian this turn.');
      mv.tried[a.edge] = true;
      const r = d6();
      if (EXPEL[lvl - 1].includes(r)) { mv.placing = a.edge; log(s, '{@p} rolls {n} and drives the barbarian away.', { p, n: r }); }
      else log(s, '{@p} rolls {n}: the barbarian stays.', { p, n: r });
    },
    wagonBarbTo(s, p, a) {
      const mv = needMove(s, p), t = tb(s);
      if (mv.placing == null) fail('Nothing to place.');
      if (!barbEdgeOk(s, a.to) || a.to === mv.placing) fail('A barbarian cannot go there.');
      moveBarb(s, p, mv.placing, a.to); // no card is drawn from a road owner here
      mv.placing = null;
    },
    wagonGrain(s, p) {
      const mv = needMove(s, p);
      if (mv.grain) fail('Once per turn.');
      if (mv.arrived) fail('The move ended at the target.');
      if (!has(P(s, p), { grain: 1 })) fail('Not enough resources.');
      pay(s, P(s, p), { grain: 1 });
      mv.grain = true; mv.mp += 2;
      log(s, '{@p} spends 1 grain: 2 more movement points.', { p });
    },
    wagonDone(s, p) {
      const mv = needMove(s, p);
      if (mv.placing != null) fail('Place the barbarian first.');
      resolvePending(s, findPending(s, p, 'moveWagon'));
    },
    // "Swift Journey": take the "Move your wagon" action again
    playGoodTrip(s, p) {
      const mv = needMove(s, p), pl = P(s, p);
      if (!mv.moved && !mv.arrived) fail('Move your wagon first.');
      const idx = pl.dev.findIndex(d => d.type === 'goodTrip' && d.turn < s.turn);
      if (idx < 0) fail('You have no playable card of that kind (new cards wait a turn).');
      if (s.flags.devPlayed) fail('Only one development card per turn.');
      pl.dev.splice(idx, 1); pl.devPlayed++;
      s.flags.devPlayed = true;
      // a whole new move: the movement points of the tableau again. Feeding the oxen (once per turn) and the attempts to drive a
      // barbarian off (once per barbarian and turn) are limits of the turn, not of the move.
      mv.mp = mv.start; mv.arrived = false; mv.moved = false;
      log(s, '{@p} plays {%c}.', { p, c: 'goodTrip' });
    },
    upgradeWagon(s, p) {
      core.requireActor(s, p);
      const tab = tb(s).tab[p];
      if (tab.level >= 5) fail('Your wagon is fully upgraded.');
      const cost = UPGRADE[tab.level];
      if (!has(P(s, p), cost)) fail('Not enough resources.');
      pay(s, P(s, p), cost);
      tab.level++;
      log(s, '{@p} upgrades the wagon to level {n}.', { p, n: tab.level });
    },
    moveBarb(s, p, a) {
      const it = findPending(s, p, 'moveBarb');
      if (!it) fail('Nothing to move.');
      const owner = moveBarb(s, p, a.from, a.to);
      resolvePending(s, it);
      if (owner !== undefined && owner !== p && core.hand(P(s, owner)) > 0) steal(s, p, owner);
    },
  };

  const legalExtra = (s, p, L, actor, main) => {
    const t = tb(s);
    if (actor && t.tab[p].level < 5 && has(P(s, p), UPGRADE[t.tab[p].level])) L.upgrade = true;
    for (const it of core.activePending(s).filter(i => i.player === p)) {
      if (it.type === 'moveBarb') L.barbMoves = { from: Object.keys(t.barb).map(Number), to: s.board.edges.map(e => e.id).filter(e => barbEdgeOk(s, e)) };
      if (it.type === 'moveWagon') {
        const mv = t.move;
        L.wagon = { mp: mv.mp, level: t.tab[p].level, grain: !mv.grain && has(P(s, p), { grain: 1 }), placing: mv.placing != null, arrived: mv.arrived };
        if (mv.placing != null) L.wagon.barbTargets = s.board.edges.map(e => e.id).filter(e => barbEdgeOk(s, e) && e !== mv.placing);
        else {
          L.wagon.steps = wagonSteps(s, p).map(st => ({ to: st.to, edge: st.edge, cost: st.cost, pays: st.pays, barb: st.barb }));
          const lvl = t.tab[p].level;
          L.wagon.expel = lvl >= 2 ? V(s, t.wagons[p]).edges.filter(e => t.barb[e] && !mv.tried[e]) : [];
          L.wagon.trip = (mv.moved || mv.arrived) && P(s, p).dev.some(d => d.type === 'goodTrip' && d.turn < s.turn) && !s.flags.devPlayed;
        }
      }
    }
  };

  const viewBoard = (s, vb) => { vb.centers = s.board.centers; vb.landCorners = s.board.landCorners; vb.blocked = s.board.blocked; vb.seaCorners = s.board.seaCorners; };
  const viewExtra = (s, me, v) => {
    const t = tb(s);
    v.hub.tb = {
      barb: t.barb, wagons: t.wagons, stacks: Object.fromEntries(Object.entries(t.stacks).map(([k, st]) => [k, st.length])),
      tab: t.tab,
      dest: DEST, targets: s.board.targets, move: t.move ? { p: t.move.p, mp: t.move.mp } : null, move_info: { move: MOVE, expel: EXPEL, reward: REWARD, upgrade: UPGRADE },
    };
    v.players.forEach((pv, i) => { pv.wagon = t.tab[i]; });
  };
  // the knight cards are played faceup and count for the Largest Army and the event cards (the tile is not returned to the box)
  const knightScore = (s, p) => s.players[p].knightsPlayed;

  return { largestArmy: true, makeBoard, init, roadEdgeOk, settlementOk, cityOk, hexPays, noLongest, vpExtra, built, seven, knightCard, beginEnd, continueEnd, handlers, legalExtra, viewBoard, viewExtra, knightScore };
};
