'use strict';
// Rules for the expansions: Seafarers (ships, pirate, gold, islands, fog) and the hand-over to Traders & Barbarians.
// Traders & Barbarians lives in ../traders-barbarians/hub.js (and its scenario files); the functions below hand over to it.
// game.js passes in its helpers, so this file never needs to import it.

const C = require('../shared/constants');
const { build: buildSea } = require('../seafarers/sea');
const { SCENARIOS, buildScenario } = require('../seafarers/scenarios');
const makeHub = require('../traders-barbarians/hub');

// the Catanian Wonders (scenario 8): cost of every one of the four levels
const WONDERS = {
  castle: { cost: { brick: 1, grain: 1, ore: 3 } },
  bridge: { cost: { lumber: 3, wool: 1, grain: 1 } },
  wall: { cost: { brick: 3, lumber: 1, grain: 1 } },
  theater: { cost: { brick: 1, lumber: 1, wool: 3 } },
  monument: { cost: { grain: 3, ore: 2 } },
  lighthouse: { cost: { lumber: 3, wool: 1, grain: 1 } },
  library: { cost: { brick: 1, lumber: 1, wool: 3 } },
};

module.exports = function make(core) {
  const vpFn = (s, p) => core.vp(s, p);
  const { log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, countPieces, randomCard, moveCard, updateLongest, isRes } = core;

  const H = (s, id) => s.board.hexes[id];
  const isLandHex = h => h.terrain !== 'sea' && !h.hidden;
  const waterHex = h => h.terrain === 'sea' || h.hidden;
  const own = (s, v, p) => s.buildings[v] && s.buildings[v].p === p;
  const HB = makeHub(core);

  // ------------------------------------------------------------ board setup
  function makeBoard({ expansion, mode, options, players, generate }) {
    if (expansion === 'seafarers') {
      const printed = buildScenario({ scenario: options.scenario || 'shores', players, big: !!options.big, variable: !!options.variable });
      // Seafarers plays the printed maps of the rulebook; tables without a printed map get a generated archipelago
      const board = printed || buildSea({ scenario: options.scenario || 'shores', players, big: !!options.big });
      if (!printed) board.bonus = { vp: 2, mode: 'each' };
      return board;
    }
    if (expansion === 'traders') return HB.makeBoard({ options, generate });
    return generate(options.big ? 'extended' : 'standard');
  }

  // ------------------------------------------------------------ state
  function initState(s, options) {
    const exp = s.expansion;
    s.sea = exp === 'seafarers';
    s.ships = {};
    s.bridges = {};
    s.pirate = s.sea ? s.board.pirateStart : null;
    s.islandBonus = {};
    s.rivers = false; s.fishing = false; s.eventCards = false; s.fish = null; s.deck = null; s.gold = false;
    s.hub = { mod: null, scenario: null, harbor: { p: null } };
    // the gifts of the forgotten tribe: chips, development cards (taken from the deck) and harbours lie on coast edges
    s.gifts = null; s.dynPorts = {};
    if (s.sea && s.board.gifts) {
      const g = s.board.gifts;
      s.gifts = { chips: {}, dev: {}, ports: {} };
      g.chips.forEach(e => { s.gifts.chips[e] = true; });
      g.dev.forEach(e => { s.gifts.dev[e] = s.devDeck.pop(); });
      g.ports.forEach(pt => { s.gifts.ports[pt.edge] = pt.type; });
    }
    s.robberStart = s.robber;
    // the wonders: who builds which, and how far
    s.wonders = null;
    if (s.sea && s.board.wonder) {
      s.wonders = {};
      s.board.wonder.keys.forEach(k => { s.wonders[k] = { owner: null, level: 0 }; });
    }
    if (s.board.rules && s.board.rules.noPirate) s.pirate = null;
    // Cloth for Catan: villages with bales of cloth
    s.villages = null; s.clothSupply = 0;
    if (s.sea && s.board.villages && s.board.villages.length) {
      s.villages = s.board.villages.map(v => ({ v: v.v, n: v.n, cloth: 5, conn: [] }));
      s.clothSupply = 10;
    }
    s.players.forEach(pl => {
      pl.chips = 0; pl.harborTokens = []; pl.cloth = 0;
      pl.gold = 0; pl.fish = 0; pl.fishTok = [];
    });
    s.flags = {};
    if (exp === 'traders') HB.init(s, options);
  }

  // ------------------------------------------------------------ geometry rules
  // corners of the small islands of the forgotten tribe cannot be settled
  const landVertex = (s, v) => !s.sea || V(s, v).hexes.some(i => isLandHex(H(s, i)) && !H(s, i).small);
  function vertexIsland(s, v) {
    for (const i of V(s, v).hexes) { const h = H(s, i); if (isLandHex(h) && h.island != null) return h.island; }
    return null;
  }
  function roadEdgeOk(s, e, p) {
    const ed = E(s, e);
    if (s.sea && !ed.hexes.some(i => isLandHex(H(s, i)))) return false;
    return s.expansion !== 'traders' || HB.roadEdgeOk(s, e, p);
  }
  function shipEdgeOk(s, e) {
    if (!s.sea) return false;
    const ed = E(s, e);
    // frame cells (where the pirate starts) are not part of the loose tiles: no ships next to them
    if (ed.hexes.some(i => H(s, i).frame) && !ed.hexes.some(i => isLandHex(H(s, i)))) return false;
    return ed.hexes.length < 2 || ed.hexes.some(i => waterHex(H(s, i)));
  }
  const pirateBlocks = (s, e) => s.pirate != null && H(s, s.pirate).edges.includes(e);
  // robber and pirate targets that the Seafarers scenarios rule out: the small islands, the robber's first desert (Forgotten Tribe),
  // the pirate in Wonders of Broch and before a shipping line has reached a village (Cloth for Broch)
  function seaRobberHexes(s, p, list) {
    if (!s.sea) return list;
    const r = s.board.rules || {};
    return list.filter(id => {
      const h = H(s, id);
      if (h.terrain === 'sea') return !r.noPirate && !(s.villages && !villagesReached(s, p));
      return !h.small && !(r.noReturn && id === s.robberStart);
    });
  }
  const ownShipAt = (s, v, p, except) => V(s, v).edges.some(x => x !== except && s.ships[x] && s.ships[x].p === p);

  // the road-or-ship choice of a coastal settlement in the founding phase
  function legalSetupShips(s) {
    if (!s.sea) return [];
    const v = s.setup.last;
    return V(s, v).edges.filter(e => s.roads[e] === undefined && !s.ships[e] && shipEdgeOk(s, e) && !pirateBlocks(s, e));
  }
  function setupSpotOk(s, v) {
    if (!landVertex(s, v)) return false;
    if (s.expansion === 'traders') return HB.settlementOk(s, v, s.current) && HB.setupSpotOk(s, v);
    if (!s.sea) return true;
    if (s.board.wonder) { const w = s.board.wonder; if ([...w.walls, ...w.bridges, ...w.lights, ...w.tabu].includes(v)) return false; }
    return s.board.homeIslands.includes(vertexIsland(s, v));
  }

  function legalShips(s, p, except = -1) {
    if (!s.sea) return [];
    return s.board.edges.filter(e => {
      if (e.id === except || s.roads[e.id] !== undefined || s.ships[e.id] || !shipEdgeOk(s, e.id) || pirateBlocks(s, e.id)) return false;
      return e.v.some(v => {
        if (own(s, v, p)) return true;
        if (core.foreignAt(s, v, p)) return false;
        return ownShipAt(s, v, p, e.id);
      });
    }).map(e => e.id);
  }
  function shipOpenEnds(s, p, e) {
    return E(s, e).v.filter(v => !own(s, v, p) && !ownShipAt(s, v, p, e));
  }
  // Seafarers: ships that touch each other (not through one of your own settlements or cities) form a shipping line.
  // A line that joins two of your settlements/cities is closed: no ship may leave it (an opponent building on one of its
  // corners later does not open it again, so foreign buildings do not split a line here).
  function closedShipEdges(s, p) {
    const mine = Object.keys(s.ships).filter(e => s.ships[e].p === p).map(Number);
    const parent = new Map(mine.map(e => [e, e]));
    const find = e => { while (parent.get(e) !== e) { parent.set(e, parent.get(parent.get(e))); e = parent.get(e); } return e; };
    const atVertex = new Map();
    for (const e of mine) for (const v of E(s, e).v) {
      if (own(s, v, p)) continue;
      if (atVertex.has(v)) parent.set(find(e), find(atVertex.get(v))); else atVertex.set(v, e);
    }
    const touches = new Map();
    for (const e of mine) {
      const r = find(e);
      if (!touches.has(r)) touches.set(r, new Set());
      for (const v of E(s, e).v) if (own(s, v, p)) touches.get(r).add(v);
    }
    const closedRoots = new Set([...touches].filter(([, set]) => set.size >= 2).map(([r]) => r));
    // a line that reached a village (cloth) is closed too
    if (s.villages) for (const vl of s.villages) if (vl.conn.includes(p)) for (const e of V(s, vl.v).edges) if (s.ships[e] && s.ships[e].p === p && touches.get(find(e)).size >= 1) closedRoots.add(find(e));
    return new Set(mine.filter(e => closedRoots.has(find(e))));
  }
  function movableShips(s, p) {
    const out = {};
    if (!s.sea || s.flags.shipMoved) return out;
    const closed = closedShipEdges(s, p);
    for (const [e, sh] of Object.entries(s.ships)) {
      if (sh.p !== p || sh.builtTurn === s.turn || pirateBlocks(s, +e) || closed.has(+e)) continue;
      if (!shipOpenEnds(s, p, +e).length) continue;
      const keep = s.ships[e];
      delete s.ships[e];
      const dest = legalShips(s, p, +e);
      s.ships[e] = keep;
      if (dest.length) out[e] = dest;
    }
    return out;
  }
  // ------------------------------------------------------------ fog of war
  function reveal(s, p, verts) {
    const found = [];
    for (const v of verts) for (const hi of V(s, v).hexes) { const h = H(s, hi); if (h.hidden && !found.includes(h)) found.push(h); }
    for (const h of found) {
      h.hidden = false;
      if (h.terrain === 'sea') { log(s, '{@p} sails into open water.', { p, h: h.id }); continue; }
      log(s, '{@p} discovers land: {#t}.', { p, t: h.terrain, h: h.id });
      const r = C.TERRAIN_RES[h.terrain];
      if (r) { take(s, P(s, p), r, 1); log(s, '{@p} receives {$c}.', { p, c: { [r]: 1 } }); }
      else if (h.terrain === 'gold') queueGold(s, p, 1);
    }
    return found.length;
  }

  // ------------------------------------------------------------ gold fields
  function queueGold(s, p, n) {
    const room = Object.values(s.bank).reduce((a, b) => a + b, 0);
    const count = Math.min(n, room);
    if (!count) return;
    pushPending(s, [{ type: 'goldPick', player: p, count }]);
  }

  // called from produce() after the normal resources were handed out
  function afterProduce(s, total, goldWant) {
    // gold fields
    const items = [];
    goldWant.forEach((n, p) => {
      if (!n) return;
      const room = Object.values(s.bank).reduce((a, b) => a + b, 0);
      const count = Math.min(n, room);
      if (count) { items.push({ type: 'goldPick', player: p, count }); log(s, '{@p} strikes gold and may choose {n} resources.', { p, n: count }); }
    });
    if (items.length) pushPending(s, items);
    clothProduce(s, total);
    if (s.expansion === 'traders') HB.afterProduce(s, total);
  }

  // ------------------------------------------------------------ victory points
  function vpExtra(s, p) {
    let pts = 0;
    pts += bonusVp(s, p);
    pts += P(s, p).chips || 0;
    pts += clothVp(s, p);
    if (s.expansion === 'traders') pts += HB.vpExtra(s, p);
    return pts;
  }
  const vpTarget = (s, p) => (s.expansion === 'traders' ? HB.vpTarget(s, p) : s.options.vpTarget);

  // New-island bonus. Seafarers: your first settlement on an island where you have no building yet earns bonus chips
  // (scenario value, mode 'each'); the old generated boards (Explorers & Pirates) pay only the first player to arrive ('first').
  // s.islandBonus maps island -> list of players who took the bonus.
  const bonusCfg = s => (s.board.bonus || { vp: 1, mode: 'first' });
  function bonusVp(s, p) {
    const vp = bonusCfg(s).vp;
    let n = 0;
    for (const o of Object.values(s.islandBonus)) {
      if (Array.isArray(o)) n += o.filter(x => x === p).length; else if (o === p) n++;
    }
    return n * vp;
  }
  function islandBonus(s, p, v) {
    if (!s.sea) return;
    const cfg = bonusCfg(s);
    if (!cfg.vp) return;
    const isl = vertexIsland(s, v);
    if (isl == null) return;
    const got = s.islandBonus[isl] || [];
    if (cfg.mode === 'first') {
      if (s.board.homeIslands.includes(isl) || got.length) return;
    } else if (cfg.mode === 'perSettlement') {
      // a chip under every settlement you found on a small island
      if (s.board.homeIslands.includes(isl)) return;
    } else {
      if (got.includes(p)) return;
      // you must have no other building on this island
      const here = Object.entries(s.buildings).some(([bv, b]) => b.p === p && +bv !== v && vertexIsland(s, +bv) === isl);
      if (here) return;
    }
    s.islandBonus[isl] = [...got, p];
    if (cfg.mode === 'perSettlement') log(s, '{@p} settles a small island and takes a victory point chip (+1 VP).', { p });
    else if (cfg.vp === 1) log(s, '{@p} settles a new island and earns a bonus point (+1 VP).', { p });
    else log(s, '{@p} settles a new island and earns {n} bonus points.', { p, n: cfg.vp });
  }


  // ------------------------------------------------------------ gifts of the forgotten tribe
  const coastal = (s, v) => V(s, v).hexes.some(i => waterHex(H(s, i))) && V(s, v).hexes.some(i => isLandHex(H(s, i)) && !H(s, i).small);
  const harborSpots = (s, p) => Object.entries(s.buildings).filter(([v, b]) => b.p === p && coastal(s, +v) && !s.dynPorts[v] && !V(s, +v).port).map(([v]) => +v);
  // a harbour you hold goes onto a coastal settlement of yours that has none (you choose when there are several)
  function assignHarbors(s, p) {
    const pl = P(s, p);
    while (pl.harborTokens.length) {
      const spots = harborSpots(s, p);
      if (!spots.length) return;
      if (spots.length === 1) {
        const type = pl.harborTokens.shift();
        s.dynPorts[spots[0]] = { type, p };
        log(s, '{@p} sets a harbour on a settlement ({#r}).', { p, r: type });
        continue;
      }
      pushPending(s, [{ type: 'placeHarbor', player: p, harbor: pl.harborTokens[0] }], true);
      return;
    }
  }
  function collectGifts(s, p, e) {
    if (!s.gifts) return;
    const pl = P(s, p);
    if (s.gifts.chips[e]) {
      delete s.gifts.chips[e];
      pl.chips++;
      log(s, '{@p} takes a victory point chip (+1 VP).', { p });
    }
    if (s.gifts.dev[e]) {
      const type = s.gifts.dev[e];
      delete s.gifts.dev[e];
      pl.dev.push({ type, turn: s.turn });
      log(s, '{@p} takes a development card.', { p });
    }
    if (s.gifts.ports[e]) {
      const type = s.gifts.ports[e];
      delete s.gifts.ports[e];
      pl.harborTokens.push(type);
      log(s, '{@p} takes a harbour ({#r}).', { p, r: type });
      assignHarbors(s, p);
    }
  }

  // ------------------------------------------------------------ cloth for Catan
  // a shipping line from one of your settlements or cities that ends on the village corner opens trade with the village
  function connectedToVillage(s, p, village) {
    const seen = new Set([village.v]);
    const q = [village.v];
    while (q.length) {
      const u = q.shift();
      for (const e of V(s, u).edges) {
        if (!s.ships[e] || s.ships[e].p !== p) continue;
        const [a, b] = E(s, e).v; const w = a === u ? b : a;
        if (own(s, w, p)) return true;
        if (seen.has(w) || core.foreignAt(s, w, p)) continue;
        seen.add(w); q.push(w);
      }
    }
    return false;
  }
  function checkVillages(s, p) {
    if (!s.villages) return;
    for (const vl of s.villages) {
      if (vl.conn.includes(p) || !connectedToVillage(s, p, vl)) continue;
      vl.conn.push(p);
      log(s, '{@p} opens trade with a village.', { p });
      if (vl.cloth > 0) {
        vl.cloth--; P(s, p).cloth++;
        log(s, '{@p} takes a bale of cloth.', { p });
      }
    }
  }
  const villagesReached = (s, p) => !!s.villages && s.villages.some(vl => vl.conn.includes(p));
  function clothProduce(s, total) {
    if (!s.villages) return;
    const n = s.players.length;
    for (const vl of s.villages) {
      if (vl.n !== total || !vl.conn.length || vl.cloth <= 0) continue;
      const order = [];
      for (let i = 0; i < n; i++) { const p = (s.current + i) % n; if (vl.conn.includes(p)) order.push(p); }
      for (const p of order) {
        if (vl.cloth > 0) vl.cloth--; else if (s.clothSupply > 0) s.clothSupply--; else continue;
        P(s, p).cloth++;
        log(s, '{@p} takes a bale of cloth.', { p });
      }
    }
  }
  // the game ends as soon as only three villages still hold cloth: most points wins, then most cloth
  function endWinner(s) {
    if (!s.villages) return null;
    if (s.villages.filter(vl => vl.cloth > 0).length > 3) return null;
    const scores = s.players.map((pl, i) => [vpFn(s, i), pl.cloth, i]);
    scores.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    return scores[0][2];
  }
  const clothVp = (s, p) => (s.villages ? Math.floor(P(s, p).cloth / 2) : 0);

  // ------------------------------------------------------------ the Catanian Wonders
  const cityCount = (s, p) => Object.values(s.buildings).filter(b => b.p === p && b.type === 'city').length;
  const ownedAt = (s, p, list) => list.some(v => own(s, v, p));
  const harborCity = (s, p) => Object.entries(s.buildings).some(([v, b]) => b.p === p && b.type === 'city' && (V(s, +v).port || (s.dynPorts && s.dynPorts[v])));
  // can this player start that wonder now? (the condition printed on the tile)
  function wonderOk(s, p, key) {
    const w = s.board.wonder;
    switch (key) {
      case 'castle': return cityCount(s, p) >= 1 && core.vp(s, p) >= 6;
      case 'bridge': return ownedAt(s, p, w.bridges);
      case 'wall': return ownedAt(s, p, w.walls);
      case 'theater': case 'library': return cityCount(s, p) >= 2;
      case 'monument': return harborCity(s, p) && core.longestFor(s, p) >= 5;
      case 'lighthouse': return ownedAt(s, p, w.lights);
      default: return false;
    }
  }
  const myWonder = (s, p) => s.wonders ? Object.entries(s.wonders).find(([, w]) => w.owner === p) : null;
  // the game is won with a finished wonder, or on your turn with enough points and a taller wonder than anybody else
  function wonderWin(s, p) {
    if (!s.wonders) return null;
    const lv = s.players.map((_, i) => { const w = myWonder(s, i); return w ? w[1].level : 0; });
    if (lv[p] >= 4) return true;
    return lv[p] > 0 && lv.every((l, i) => i === p || l < lv[p]) && core.vp(s, p) >= s.options.vpTarget;
  }

  // ------------------------------------------------------------ handlers
  const requireActor = (s, p) => core.requireActor(s, p);
  const handlers = {
    buildShip(s, p, a) {
      if (!s.sea) fail('There are no ships in this game.');
      // the Road Building card gives two free pieces: roads or ships, as you like
      const free = s.free.roads > 0 && p === s.current && s.phase === 'play' && !s.pending.length && s.step !== 'sbp';
      if (!free) requireActor(s, p);
      if (countShips(s, p) >= C.PIECES.ship) fail('No ships left.');
      if (!legalShips(s, p).includes(a.e)) fail('You cannot sail a ship there.');
      if (!free) {
        if (!has(P(s, p), C.COSTS.ship)) fail('Not enough resources.');
        pay(s, P(s, p), C.COSTS.ship);
      } else s.free.roads--;
      s.ships[a.e] = { p, builtTurn: s.turn };
      log(s, '{@p} built a ship.', { p });
      reveal(s, p, E(s, a.e).v);
      collectGifts(s, p, a.e);
      checkVillages(s, p);
      updateLongest(s);
    },
    // founding phase: a settlement on the coast may get a ship instead of a road
    placeShip(s, p, a) {
      if (!s.sea || s.phase !== 'setup' || p !== s.current || s.setup.need !== 'road') fail('Not your placement.');
      if (!legalSetupShips(s).includes(a.e)) fail('The ship must touch your new settlement.');
      s.ships[a.e] = { p, builtTurn: 0 };
      log(s, '{@p} placed a ship.', { p });
      reveal(s, p, E(s, a.e).v);
      collectGifts(s, p, a.e);
      checkVillages(s, p);
      core.finishSetupRoad(s, p);
    },
    moveShip(s, p, a) {
      if (!s.sea) fail('There are no ships in this game.');
      core.requireMain(s, p);
      const m = movableShips(s, p);
      if (!m[a.from] || !m[a.from].includes(a.to)) fail('That ship cannot go there.');
      const sh = s.ships[a.from];
      delete s.ships[a.from];
      s.ships[a.to] = { p, builtTurn: sh.builtTurn, movedTurn: s.turn };
      s.flags.shipMoved = true;
      log(s, '{@p} sailed a ship to a new spot.', { p });
      reveal(s, p, E(s, a.to).v);
      collectGifts(s, p, a.to);
      checkVillages(s, p);
      updateLongest(s);
    },
    startWonder(s, p, a) {
      if (!s.wonders) fail('There are no wonders in this game.');
      requireActor(s, p);
      const w = s.wonders[a.wonder];
      if (!w) fail('Pick a wonder.');
      if (w.owner !== null) fail('Somebody is already building that wonder.');
      if (myWonder(s, p)) fail('You are already building a wonder.');
      if (!wonderOk(s, p, a.wonder)) fail('You do not meet the condition of that wonder yet.');
      w.owner = p;
      log(s, '{@p} starts to build a wonder ({#w}).', { p, w: a.wonder });
    },
    buildWonder(s, p) {
      if (!s.wonders) fail('There are no wonders in this game.');
      requireActor(s, p);
      const mine = myWonder(s, p);
      if (!mine) fail('Start a wonder first.');
      const [key, w] = mine;
      if (w.level >= 4) fail('Your wonder is finished.');
      const cost = WONDERS[key].cost;
      if (!has(P(s, p), cost)) fail('Not enough resources.');
      pay(s, P(s, p), cost);
      w.level++;
      log(s, '{@p} builds level {n} of a wonder ({#w}).', { p, n: w.level, w: key });
    },
    placeHarbor(s, p, a) {
      const it = findPending(s, p, 'placeHarbor');
      if (!it) fail('No harbour to place.');
      if (!harborSpots(s, p).includes(a.v)) fail('Pick one of your coastal settlements without a harbour.');
      const pl = P(s, p);
      const type = pl.harborTokens.shift();
      s.dynPorts[a.v] = { type, p };
      log(s, '{@p} sets a harbour on a settlement ({#r}).', { p, r: type });
      resolvePending(s, it);
      assignHarbors(s, p);
    },
    pickGold(s, p, a) {
      const it = findPending(s, p, 'goldPick');
      if (!it) fail('No gold to spend.');
      const cards = a.cards || {};
      const n = Object.values(cards).reduce((x, y) => x + y, 0);
      if (!Object.entries(cards).every(([k, c]) => isRes(k) && Number.isInteger(c) && c >= 0) || n !== it.count) fail('Choose exactly {n} cards.', { n: it.count });
      if (Object.entries(cards).some(([k, c]) => s.bank[k] < c)) fail('The bank does not have those.');
      for (const [k, c] of Object.entries(cards)) take(s, P(s, p), k, c);
      log(s, '{@p} takes {$c} from the gold field.', { p, c: cards });
      resolvePending(s, it);
    },
  };

  function countShips(s, p) { return Object.values(s.ships).filter(x => x.p === p).length; }

  // ------------------------------------------------------------ legal moves for the client
  function legalExtra(s, p, L, actor, main) {
    if (s.phase !== 'play') return;
    if (s.expansion === 'traders') HB.legalExtra(s, p, L, actor, main);
    for (const it of core.activePending(s).filter(i => i.player === p)) {
      if (it.type === 'goldPick') L.goldPick = { count: it.count };
      if (it.type === 'placeHarbor') L.harborSpots = harborSpots(s, p);
    }
    if (s.wonders && actor && !s.pending.length) {
      const mine = myWonder(s, p);
      L.wonders = { start: mine ? [] : Object.keys(s.wonders).filter(k => s.wonders[k].owner === null && wonderOk(s, p, k)), build: !!mine && mine[1].level < 4 && has(P(s, p), WONDERS[mine[0]].cost) };
    }
    if (actor) {
      if (s.sea) {
        if (countShips(s, p) < C.PIECES.ship && has(P(s, p), C.COSTS.ship)) L.ships = legalShips(s, p);
      }
    }
    if (main) {
      if (s.sea) L.moveShips = movableShips(s, p);
    }
  }

  function viewBoard(s, vb) {
    // what clients may see of the sea board: hidden hexes lose terrain and numbers
    const b = s.board;
    vb.hexes = b.hexes.map(h => h.hidden
      ? { id: h.id, x: h.x, y: h.y, terrain: 'fog', number: null, verts: h.verts, hidden: true }
      : { id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, verts: h.verts, island: h.island ?? undefined, river: h.river || undefined, number2: h.number2 || undefined, lake: h.lake || undefined });
    if (s.expansion === 'traders') HB.viewBoard(s, b, vb);
    if (b.desert != null) vb.desert = b.desert;
    if (b.homeIslands) vb.homeIslands = b.homeIslands;
    if (b.bonus) vb.bonus = b.bonus;
    if (b.bonusIslands) vb.bonusIslands = b.bonusIslands;
    if (b.wonder) vb.wonder = { walls: b.wonder.walls, bridges: b.wonder.bridges, lights: b.wonder.lights };
    vb.scenario = b.scenario;
    return vb;
  }

  function viewExtra(s, me, v) {
    v.expansion = s.expansion;
    v.sea = s.sea;
    v.ships = s.ships;
    v.pirate = s.pirate;
    v.bridges = s.bridges;
    v.islandBonus = s.islandBonus;
    v.rivers = false; v.fishing = false; v.eventCards = false; v.gold = false;
    if (s.gifts) v.gifts = { chips: Object.keys(s.gifts.chips).map(Number), dev: Object.keys(s.gifts.dev).map(Number), ports: Object.keys(s.gifts.ports).map(e => ({ edge: +e, type: s.gifts.ports[e], x: s.board.gifts.ports.find(q => q.edge === +e).x, y: s.board.gifts.ports.find(q => q.edge === +e).y })) };
    if (s.gifts) v.dynPorts = s.dynPorts;
    if (s.wonders) { v.wonders = s.wonders; v.wonderCost = Object.fromEntries(Object.keys(s.wonders).map(k => [k, WONDERS[k].cost])); }
    if (s.villages) { v.villages = s.villages.map(vl => ({ v: vl.v, n: vl.n, cloth: vl.cloth, conn: vl.conn })); v.clothSupply = s.clothSupply; }
    v.players.forEach((pv, i) => {
      const pl = s.players[i];
      pv.gold = pl.gold; pv.fish = pl.fish;
      if (s.gifts) { pv.chips = pl.chips; pv.harbors = pl.harborTokens.length; }
      if (s.villages) pv.cloth = pl.cloth;
      pv.pieces.ships = C.PIECES.ship - countShips(s, i);
      pv.pieces.bridges = C.PIECES.bridge;
      pv.vpTarget = vpTarget(s, i);
    });
    if (s.expansion === 'traders') HB.viewExtra(s, me, v);
    return v;
  }

  // Traders & Barbarians: everything the engine asks the scenario about goes through here
  return {
    makeBoard, initState, landVertex, vertexIsland, roadEdgeOk, shipEdgeOk, legalShips, movableShips, setupSpotOk,
    endWinner, villagesReached, wonderWin, legalSetupShips, reveal, afterProduce, vpExtra, vpTarget, islandBonus, handlers: Object.assign(handlers, HB.handlers), legalExtra, viewBoard, viewExtra, countShips,
    SCENARIOS, pirateBlocks, ownShipAt,
    hub: HB,
    rollValues: s => (s.expansion === 'traders' ? HB.rollValues(s) : null),
    runCard: (s, card) => HB.runCard(s, card),
    hexPays: (s, h, total) => (s.expansion === 'traders' ? HB.hexPays(s, h, total) : h.number === total),
    settlementOk: (s, v, p) => s.expansion !== 'traders' || HB.settlementOk(s, v, p),
    cityOk: (s, v, p) => s.expansion !== 'traders' || HB.cityOk(s, v, p),
    built: (s, p, kind, where) => {
      if (s.sea && kind === 'settlement') { assignHarbors(s, p); checkVillages(s, p); }
      if (s.expansion === 'traders') HB.built(s, p, kind, where);
    },
    robberHexes: (s, p, list) => { const l = seaRobberHexes(s, p, list); return s.expansion === 'traders' ? HB.robberHexes(s, p, l) : l; },
    victimOk: (s, p, q) => s.expansion !== 'traders' || HB.victimOk(s, p, q),
    robberHome: s => (s.expansion === 'traders' ? HB.robberHome(s) : undefined),
    noRobber: s => s.expansion === 'traders' && HB.noRobber(s),
    afterAct: s => { if (s.expansion === 'traders') HB.afterAct(s); },
    beginEnd: (s, p) => s.expansion === 'traders' && HB.beginEnd(s, p),
    buyDev: (s, p) => s.expansion === 'traders' && HB.buyDev(s, p),
    portUsable: (s, v) => s.expansion !== 'traders' || HB.portUsable(s, v),
    cityStart: s => s.expansion === 'traders' && HB.cityStart(s),
    roadWeight: (s, e) => (s.expansion === 'traders' ? HB.roadWeight(s, e) : 1),
    noLongest: s => !!(s.board.rules && s.board.rules.noLongest) || (s.expansion === 'traders' && HB.noLongest(s)),
  };
};
