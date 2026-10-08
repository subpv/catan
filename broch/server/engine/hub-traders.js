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
  const TARGETS = { castle: 7, quarry: 2, glassworks: 18 };
  // what each tile of the book shows and where it has to go
  const FACES = { castle: ['tools', 'sand'], quarry: ['marble', 'sand'], glassworks: ['glass', 'tools'] };
  const DEST = { glass: 'castle', marble: 'castle', tools: 'quarry', sand: 'glassworks' };
  const DEV = { knight: 14, victoryPoint: 5, roadBuilding: 2, goodTrip: 4 };

  function makeBoard({ kind, geometry, placePorts, shuffle: sh, numberLand }) {
    const { BOARDS } = C;
    const def = BOARDS[kind];
    const geo = geometry(def.rows);
    const ids = Object.values(TARGETS);
    const pool = sh(['hills', 'hills', 'hills', 'forest', 'forest', 'forest', 'forest', 'pasture', 'pasture', 'pasture', 'fields', 'fields', 'fields', 'mountains', 'mountains', 'mountains']);
    const rest = geo.hexes.map(h => h.id).filter(id => !ids.includes(id));
    rest.forEach((id, i) => { geo.hexes[id].terrain = pool[i]; });
    Object.entries(TARGETS).forEach(([t, id]) => { geo.hexes[id].terrain = t; geo.hexes[id].number = null; });
    const board = { kind, hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports: [] };
    numberLand(board, rest, BOARDS.standard.numbers.filter(n => n !== 2 && n !== 12));
    // the paths inside a target hex: from its middle (never built on) to the four corners on the land side
    board.centers = {}; board.landCorners = {}; board.blocked = [];
    Object.entries(TARGETS).forEach(([t, id]) => {
      const h = geo.hexes[id];
      const landEdges = h.edges.filter(e => geo.edges[e].hexes.length === 2);
      const seaEdges = h.edges.filter(e => geo.edges[e].hexes.length === 1);
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
    Object.values(TARGETS).forEach(id => geo.hexes[id].verts.forEach(v => { if (!board.landCorners[id].includes(v)) board.seaCorners.add(v); }));
    // harbours: not on the sea side of a target hex
    for (let i = 0; i < 400; i++) {
      const ports = placePorts(geo, BOARDS.standard.ports);
      if (ports.every(p => !board.blocked.includes(p.edge) && geo.edges[p.edge].v.every(v => !board.seaCorners.has(v)))) { board.ports = ports; break; }
      if (i === 399) board.ports = ports;
    }
    geo.vertices.forEach(v => { delete v.port; });
    board.ports.forEach(p => geo.edges[p.edge].v.forEach(v => { geo.vertices[v].port = p.type; }));
    board.seaCorners = [...board.seaCorners];
    // three barbarians: on a path next to the quarry, one near the castle, one in the south east
    board.barbStart = [geo.hexes[1].edges[2], geo.hexes[8].edges[3], geo.hexes[14].edges[1]];
    board.desert = undefined;
    return board;
  }

  function init(s) {
    const tb = { barb: {}, stacks: {}, tab: {}, wagons: {}, move: null };
    s.board.barbStart.forEach(e => { tb.barb[e] = true; });
    Object.entries(TARGETS).forEach(([t, id]) => {
      const tiles = [];
      for (let i = 0; i < 12; i++) tiles.push(FACES[t][i % 2]);
      tb.stacks[id] = shuffle(tiles);
    });
    s.players.forEach((pl, p) => { pl.gold = START_GOLD; tb.tab[p] = { level: 1, ware: null, delivered: 0 }; });
    s.hub.tb = tb;
    const deck = [];
    Object.entries(DEV).forEach(([k, n]) => { for (let i = 0; i < n; i++) deck.push(k); });
    s.devDeck = shuffle(deck);
  }

  const tb = s => s.hub.tb;
  const targetOfHex = (s, id) => Object.entries(TARGETS).find(([, i]) => i === id);
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
    if (!mv || mv.placing) return [];
    const at = t.wagons[p];
    if (mv.arrived) return [];
    return V(s, at).edges.map(e => stepInfo(s, p, at, e)).filter(st => st && st.cost <= mv.mp && (!st.pays || P(s, p).gold >= 1));
  }
  function drawWare(s, hexId) {
    const t = tb(s);
    let from = hexId;
    if (!t.stacks[from].length) from = Object.keys(t.stacks).map(Number).find(id => t.stacks[id].length);
    if (from == null) return null;
    return t.stacks[from].pop();
  }
  function arrive(s, p, hexId) {
    const t = tb(s), tab = t.tab[p], mv = t.move;
    const name = targetOfHex(s, hexId)[0];
    if (!tab.ware) {
      tab.ware = drawWare(s, hexId);
      log(s, '{@p} reaches the {#t} and turns over a tile: {#w}.', { p, t: name, w: tab.ware });
    } else if (DEST[tab.ware] === name) {
      const reward = REWARD[tab.level - 1];
      tab.delivered++;
      P(s, p).gold += reward;
      log(s, '{@p} delivers {#w} to the {#t}: +1 point and {n} gold.', { p, t: name, w: tab.ware, n: reward });
      tab.ware = drawWare(s, hexId);
      if (tab.ware) log(s, '{@p} gets a new order: {#w}.', { p, w: tab.ware });
    } else log(s, '{@p} reaches the {#t}, but carries {#w}.', { p, t: name, w: tab.ware });
    mv.mp = 0; mv.arrived = true;
  }

  // ------------------------------------------------------------ end of the turn: the wagon rolls
  function beginEnd(s, p) {
    const t = tb(s);
    t.move = { p, mp: MOVE[t.tab[p].level - 1], start: MOVE[t.tab[p].level - 1], grain: false, arrived: false, moved: false, tried: {}, placing: false, trips: 1 };
    s.hub.ending = true;
    pushPending(s, [{ type: 'moveWagon', player: p }]);
    return true;
  }
  function continueEnd(s) {
    tb(s).move = null;
    s.hub.ending = false;
    core.finishTurn(s);
  }

  // ------------------------------------------------------------ handlers
  const needMove = (s, p) => { const it = findPending(s, p, 'moveWagon'); if (!it || !tb(s).move) fail('It is not time to move your wagon.'); return tb(s).move; };
  const handlers = {
    wagonStep(s, p, a) {
      const mv = needMove(s, p);
      if (mv.placing) fail('Place the barbarian first.');
      const st = wagonSteps(s, p).find(x => x.to === a.to);
      if (!st) fail('The wagon cannot go there.');
      const t = tb(s);
      mv.mp -= st.cost; mv.moved = true;
      if (st.pays !== null) { P(s, p).gold -= 1; P(s, st.pays).gold += 1; log(s, '{@p} pays {@q} 1 gold for the road.', { p, q: st.pays }); }
      t.wagons[p] = st.to;
      const hexId = Object.entries(s.board.centers).find(([, v]) => v === st.to);
      if (hexId) arrive(s, p, +hexId[0]);
      else if (wagonSteps(s, p).length === 0 && !mv.arrived) { /* stuck: the player ends the move */ }
    },
    wagonExpel(s, p, a) {
      const mv = needMove(s, p), t = tb(s);
      const lvl = t.tab[p].level;
      if (lvl < 2) fail('You can drive barbarians away from the second level on.');
      if (mv.placing || mv.arrived) fail('Not allowed right now.');
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
      if (!mv.placing) fail('Nothing to place.');
      if (!barbEdgeOk(s, a.to) || a.to === mv.placing) fail('A barbarian cannot go there.');
      moveBarb(s, p, mv.placing, a.to); // no card is drawn from a road owner here
      mv.placing = false;
    },
    wagonGrain(s, p) {
      const mv = needMove(s, p);
      if (mv.grain) fail('Once per turn.');
      if (mv.arrived) fail('The move ended at the target.');
      if (!has(P(s, p), { grain: 1 })) fail('Not enough resources.');
      pay(s, P(s, p), { grain: 1 });
      mv.grain = true; mv.mp += 2;
      log(s, '{@p} feeds the oxen: 2 more movement points.', { p });
    },
    wagonDone(s, p) {
      const mv = needMove(s, p);
      if (mv.placing) fail('Place the barbarian first.');
      resolvePending(s, findPending(s, p, 'moveWagon'));
    },
    // "Good Journey": a whole second move
    playGoodTrip(s, p) {
      const mv = needMove(s, p), pl = P(s, p);
      if (!mv.moved && !mv.arrived) fail('Move your wagon first.');
      const idx = pl.dev.findIndex(d => d.type === 'goodTrip' && d.turn < s.turn);
      if (idx < 0) fail('You have no playable card of that kind (new cards wait a turn).');
      if (s.flags.devPlayed) fail('Only one development card per turn.');
      pl.dev.splice(idx, 1); pl.devPlayed++;
      s.flags.devPlayed = true;
      mv.mp = mv.start; mv.arrived = false; mv.grain = false; mv.moved = false; mv.tried = {};
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
        L.wagon = { mp: mv.mp, level: t.tab[p].level, grain: !mv.grain && has(P(s, p), { grain: 1 }), placing: !!mv.placing, arrived: mv.arrived };
        if (mv.placing) L.wagon.barbTargets = s.board.edges.map(e => e.id).filter(e => barbEdgeOk(s, e) && e !== mv.placing);
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
      dest: DEST, targets: TARGETS, move: t.move ? { p: t.move.p, mp: t.move.mp } : null, move_info: { move: MOVE, expel: EXPEL, reward: REWARD, upgrade: UPGRADE },
    };
    v.players.forEach((pv, i) => { pv.wagon = t.tab[i]; });
  };
  const knightScore = () => 0;

  return { makeBoard, init, roadEdgeOk, settlementOk, cityOk, hexPays, noLongest, vpExtra, built, seven, knightCard, beginEnd, continueEnd, handlers, legalExtra, viewBoard, viewExtra, knightScore };
};
