'use strict';
// The glue between the classic engine (game.js) and its two expansions: Seafarers (../seafarers/seafarers.js) and
// Traders & Barbarians (../traders-barbarians/hub.js). game.js calls the functions returned below as X.*; each one asks the
// expansion that is switched on (s.expansion) and does nothing in a plain game. No rules live here.
// game.js passes in its helpers (core), so this file never needs to import it.

const makeSeafarers = require('../seafarers/seafarers');
const makeHub = require('../traders-barbarians/hub');

module.exports = function make(core) {
  const SEA = makeSeafarers(core);
  const HB = makeHub(core);
  const traders = s => s.expansion === 'traders';
  const vpTarget = (s, p) => (traders(s) ? HB.vpTarget(s, p) : s.options.vpTarget);
  const handlers = Object.assign({}, SEA.handlers, HB.handlers);

  // what clients may see of the board: hidden (fog) hexes lose terrain and numbers; rivers and lakes come from Traders & Barbarians
  function viewBoard(s, vb) {
    const b = s.board;
    vb.hexes = b.hexes.map(h => h.hidden
      ? { id: h.id, x: h.x, y: h.y, terrain: 'fog', number: null, verts: h.verts, hidden: true }
      : { id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, verts: h.verts, island: h.island ?? undefined, river: h.river || undefined, number2: h.number2 || undefined, lake: h.lake || undefined });
    if (traders(s)) HB.viewBoard(s, b, vb);
    if (b.desert != null) vb.desert = b.desert;
    SEA.viewBoard(s, vb);
    vb.scenario = b.scenario;
    return vb;
  }

  function viewExtra(s, me, v) {
    v.expansion = s.expansion;
    HB.viewDefaults(s, v);
    SEA.viewExtra(s, me, v);
    v.players.forEach((pv, i) => { pv.vpTarget = vpTarget(s, i); });
    if (traders(s)) HB.viewExtra(s, me, v);
    return v;
  }

  return {
    // ---- set-up
    makeBoard: ({ expansion, options, players, generate }) => {
      if (expansion === 'seafarers') return SEA.makeBoard({ options, players });
      if (expansion === 'traders') return HB.makeBoard({ options, generate });
      return generate(options.big ? 'extended' : 'standard');
    },
    initState: (s, options) => {
      HB.defaults(s);
      SEA.initState(s);
      s.flags = {};
      if (traders(s)) HB.init(s, options);
    },
    SCENARIOS: SEA.SCENARIOS,
    hub: HB,

    // ---- corners, roads and ships
    landVertex: SEA.landVertex, vertexIsland: SEA.vertexIsland, shipEdgeOk: SEA.shipEdgeOk, legalShips: SEA.legalShips, movableShips: SEA.movableShips,
    legalSetupShips: SEA.legalSetupShips, pirateBlocks: SEA.pirateBlocks, ownShipAt: SEA.ownShipAt, countShips: SEA.countShips,
    roadEdgeOk: (s, e, p) => SEA.roadEdgeOk(s, e) && (!traders(s) || HB.roadEdgeOk(s, e, p)),
    setupSpotOk: (s, v) => {
      if (!SEA.landVertex(s, v)) return false;
      if (traders(s)) return HB.settlementOk(s, v, s.current) && HB.setupSpotOk(s, v);
      return SEA.setupSpotOk(s, v);
    },
    settlementOk: (s, v, p) => !traders(s) || HB.settlementOk(s, v, p),
    cityOk: (s, v, p) => !traders(s) || HB.cityOk(s, v, p),
    reveal: SEA.reveal,
    built: (s, p, kind, where) => {
      SEA.built(s, p, kind);
      if (traders(s)) HB.built(s, p, kind, where);
    },
    islandBonus: SEA.islandBonus,
    roadWeight: (s, e) => (traders(s) ? HB.roadWeight(s, e) : 1),
    noLongest: s => !!(s.board.rules && s.board.rules.noLongest) || (traders(s) && HB.noLongest(s)),
    portUsable: (s, v) => !traders(s) || HB.portUsable(s, v),

    // ---- dice, production and the robber
    rollValues: s => (traders(s) ? HB.rollValues(s) : null),
    runCard: (s, card) => HB.runCard(s, card),
    hexPays: (s, h, total) => (traders(s) ? HB.hexPays(s, h, total) : h.number === total),
    afterProduce: (s, total, goldWant) => {
      SEA.afterProduce(s, total, goldWant);
      if (traders(s)) HB.afterProduce(s, total);
    },
    robberHexes: (s, p, list) => { const l = SEA.robberHexes(s, p, list); return traders(s) ? HB.robberHexes(s, p, l) : l; },
    victimOk: (s, p, q) => !traders(s) || HB.victimOk(s, p, q),
    robberHome: s => (traders(s) ? HB.robberHome(s) : undefined),
    noRobber: s => traders(s) && HB.noRobber(s),
    villagesReached: SEA.villagesReached,

    // ---- turn flow, cards, points
    afterAct: s => { if (traders(s)) HB.afterAct(s); },
    beginEnd: (s, p) => traders(s) && HB.beginEnd(s, p),
    buyDev: (s, p) => traders(s) && HB.buyDev(s, p),
    cityStart: s => traders(s) && HB.cityStart(s),
    vpExtra: (s, p) => SEA.vpExtra(s, p) + (traders(s) ? HB.vpExtra(s, p) : 0),
    vpTarget,
    endWinner: SEA.endWinner,
    wonderWin: SEA.wonderWin,

    // ---- actions, legal moves and views
    handlers,
    legalExtra: (s, p, L, actor, main) => {
      if (s.phase !== 'play') return;
      if (traders(s)) HB.legalExtra(s, p, L, actor, main);
      SEA.legalExtra(s, p, L, actor, main);
    },
    viewBoard, viewExtra,
  };
};
