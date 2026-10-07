'use strict';
// Rules for the expansions: Seafarers (ships, pirate, gold, islands, fog), Traders & Barbarians
// (fishermen, rivers, event cards) and Explorers & Pirates (missions on a fog map).
// game.js passes in its helpers, so this file never needs to import it.

const C = require('./constants');
const { shuffle } = require('./board');
const { build: buildSea, SCENARIOS } = require('./sea');

module.exports = function make(core) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, countPieces, randomCard, moveCard, updateLongest, isRes } = core;

  const H = (s, id) => s.board.hexes[id];
  const isLandHex = h => h.terrain !== 'sea' && !h.hidden;
  const waterHex = h => h.terrain === 'sea' || h.hidden;
  const own = (s, v, p) => s.buildings[v] && s.buildings[v].p === p;

  // ------------------------------------------------------------ board setup
  function makeBoard({ expansion, mode, options, players, generate }) {
    if (expansion === 'seafarers' || expansion === 'explorers') {
      const explorers = expansion === 'explorers';
      const board = buildSea({ scenario: explorers ? 'fog' : (options.scenario || 'shores'), players, big: !!options.big, explorers });
      if (explorers) addMissionMarkers(board, options);
      return board;
    }
    const board = generate(options.big ? 'extended' : 'standard');
    if (expansion === 'traders') {
      const v = options.variants || {};
      if (v.rivers) addRivers(board);
      if (v.fishermen) addFishing(board);
    }
    return board;
  }

  function hexPath(board, len, banned) {
    const hexes = board.hexes;
    for (let attempt = 0; attempt < 200; attempt++) {
      const start = hexes[Math.floor(Math.random() * hexes.length)];
      if (banned(start)) continue;
      const path = [start.id];
      while (path.length < len) {
        const last = hexes[path[path.length - 1]];
        const next = shuffle(last.neighbors.filter(n => !path.includes(n) && !banned(hexes[n])));
        if (!next.length) break;
        path.push(next[0]);
      }
      if (path.length === len) return path;
    }
    return [];
  }

  function addRivers(board) {
    const len = board.kind === 'extended' ? 5 : 4;
    const path = hexPath(board, len, h => h.terrain === 'desert');
    path.forEach(id => { const h = board.hexes[id]; h.terrain = 'river'; h.number = null; h.river = true; });
    board.rivers = path;
  }

  function coastEdgesOf(board) {
    return board.edges.filter(e => {
      const lands = e.hexes.filter(i => board.hexes[i].terrain !== 'sea' && !board.hexes[i].hidden);
      return lands.length === 1 && (e.hexes.length === 1 || e.hexes.every(i => !board.hexes[i].hidden));
    });
  }

  function addFishing(board) {
    const taken = new Set();
    board.ports.forEach(p => board.edges[p.edge].v.forEach(v => taken.add(v)));
    const coast = shuffle(coastEdgesOf(board).filter(e => e.v.every(v => !taken.has(v))));
    const grounds = [];
    const nums = shuffle(C.FISH_NUMBERS.slice());
    for (const e of coast) {
      if (grounds.length >= nums.length) break;
      if (e.v.some(v => taken.has(v))) continue;
      const [a, b] = e.v.map(i => board.vertices[i]);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const lh = board.hexes[e.hexes.find(i => board.hexes[i].terrain !== 'sea' && !board.hexes[i].hidden)];
      const dx = mx - lh.x, dy = my - lh.y, d = Math.hypot(dx, dy);
      if (grounds.some(g => (g.x - mx) ** 2 + (g.y - my) ** 2 < 4.5)) continue;
      grounds.push({ id: grounds.length, edge: e.id, verts: e.v.slice(), number: nums[grounds.length], x: +(mx + dx / d * 0.62).toFixed(3), y: +(my + dy / d * 0.62).toFixed(3) });
      e.v.forEach(v => taken.add(v));
    }
    board.fishing = grounds;
  }

  function addMissionMarkers(board, options) {
    const missions = options.missions || C.MISSIONS;
    const hexes = board.hexes;
    if (missions.includes('fish')) {
      const seas = shuffle(hexes.filter(h => h.terrain === 'sea' && h.neighbors.some(n => hexes[n].terrain !== 'sea')));
      const nums = shuffle([3, 4, 5, 6, 8, 9, 10, 11]);
      board.shoals = seas.slice(0, board.hexes.length > 100 ? 7 : 5).map((h, i) => ({ id: i, hex: h.id, number: nums[i % nums.length] }));
    }
    if (missions.includes('spice')) {
      const lands = shuffle(hexes.filter(h => h.terrain !== 'sea' && h.terrain !== 'desert' && h.terrain !== 'gold' && h.number));
      board.spices = lands.slice(0, board.hexes.length > 100 ? 7 : 5).map(h => h.id);
    }
    if (missions.includes('lairs')) {
      const used = new Set((board.shoals || []).map(x => x.hex));
      const seas = shuffle(hexes.filter(h => h.terrain === 'sea' && !used.has(h.id) && h.neighbors.some(n => hexes[n].terrain !== 'sea')));
      board.lairs = seas.slice(0, board.hexes.length > 100 ? 4 : 3).map((h, i) => ({ id: i, hex: h.id, hp: 3 }));
    }
  }

  // ------------------------------------------------------------ state
  function initState(s, options) {
    const exp = s.expansion;
    s.sea = exp === 'seafarers' || exp === 'explorers';
    s.ships = {};
    s.bridges = {};
    s.pirate = s.sea ? s.board.pirateStart : null;
    s.islandBonus = {};
    const v = options.variants || {};
    s.rivers = exp === 'traders' && !!v.rivers;
    s.fishing = exp === 'traders' && !!v.fishermen;
    s.eventCards = exp === 'traders' && !!v.events;
    s.fish = s.fishing ? { bag: shuffle(['boot', ...Object.entries(C.FISH_BAG).flatMap(([val, n]) => Array.from({ length: n }, () => +val))]), boot: null } : null;
    s.deck = s.eventCards ? newEventDeck() : null;
    if (exp === 'explorers') {
      s.missions = (options.missions || C.MISSIONS).slice();
      s.lairs = (s.board.lairs || []).map(l => ({ ...l, hits: {} }));
      s.lairOwners = {};
    }
    s.players.forEach(pl => {
      pl.gold = 0; pl.fish = 0; pl.cargo = { fish: 0, spice: 0 }; pl.delivered = { fish: 0, spice: 0 };
    });
    s.flags = {};
  }

  function newEventDeck() {
    const d = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) d.push([a, b]);
    return shuffle(d);
  }
  function drawEvent(s) {
    if (!s.deck || s.deck.length <= 5) { s.deck = newEventDeck(); log(s, 'The event cards are reshuffled.'); }
    return s.deck.pop();
  }

  // ------------------------------------------------------------ geometry rules
  const landVertex = (s, v) => !s.sea || V(s, v).hexes.some(i => isLandHex(H(s, i)));
  function vertexIsland(s, v) {
    for (const i of V(s, v).hexes) { const h = H(s, i); if (isLandHex(h)) return h.island; }
    return null;
  }
  function roadEdgeOk(s, e) {
    const ed = E(s, e);
    if (s.sea && !ed.hexes.some(i => isLandHex(H(s, i)))) return false;
    if (s.rivers && ed.hexes.length === 2 && ed.hexes.every(i => H(s, i).terrain === 'river')) return false;
    return true;
  }
  const isCrossing = (s, e) => s.rivers && E(s, e).hexes.length === 2 && E(s, e).hexes.every(i => H(s, i).terrain === 'river');
  function shipEdgeOk(s, e) {
    if (!s.sea) return false;
    const ed = E(s, e);
    return ed.hexes.length < 2 || ed.hexes.some(i => waterHex(H(s, i)));
  }
  const pirateBlocks = (s, e) => s.pirate != null && H(s, s.pirate).edges.includes(e);
  const ownShipAt = (s, v, p, except) => V(s, v).edges.some(x => x !== except && s.ships[x] && s.ships[x].p === p);

  function setupSpotOk(s, v) {
    if (!landVertex(s, v)) return false;
    if (!s.sea) return true;
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
  function movableShips(s, p) {
    const out = {};
    if (!s.sea || s.flags.shipMoved) return out;
    for (const [e, sh] of Object.entries(s.ships)) {
      if (sh.p !== p || sh.builtTurn === s.turn || pirateBlocks(s, +e)) continue;
      if (!shipOpenEnds(s, p, +e).length) continue;
      const keep = s.ships[e];
      delete s.ships[e];
      const dest = legalShips(s, p, +e);
      s.ships[e] = keep;
      if (dest.length) out[e] = dest;
    }
    return out;
  }
  function legalBridges(s, p) {
    if (!s.rivers) return [];
    return s.board.edges.filter(e => isCrossing(s, e.id) && s.roads[e.id] === undefined && e.v.some(v => {
      if (own(s, v, p)) return true;
      if (core.foreignAt(s, v, p)) return false;
      return V(s, v).edges.some(x => s.roads[x] === p);
    })).map(e => e.id);
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
    if (s.fishing) fishProduce(s, total);
    if (s.board.spices) spiceProduce(s, total);
    if (s.board.shoals) shoalProduce(s, total);
  }

  // ------------------------------------------------------------ fishermen
  function drawFish(s, p, tokens) {
    let got = 0, boot = false;
    for (let i = 0; i < tokens; i++) {
      const t = s.fish.bag.pop();
      if (t === undefined) break;
      if (t === 'boot') { s.fish.boot = p; boot = true; } else { P(s, p).fish += t; got += t; }
    }
    if (got) log(s, '{@p} catches {n} fish.', { p, n: got });
    if (boot) log(s, '{@p} pulls up the old boot and now needs one more point to win.', { p });
  }
  function fishProduce(s, total) {
    const want = s.players.map(() => 0);
    const addAround = verts => verts.forEach(v => { const b = s.buildings[v]; if (b) want[b.p] += b.type === 'city' ? 2 : 1; });
    for (const g of s.board.fishing) if (g.number === total) addAround(g.verts);
    if (C.LAKE_NUMBERS.includes(total)) {
      const lake = s.board.hexes.find(h => h.terrain === 'desert');
      if (lake && s.robber !== lake.id) addAround(lake.verts);
    }
    const n = s.players.length;
    for (let i = 0; i < n; i++) { const p = (s.current + i) % n; if (want[p]) drawFish(s, p, want[p]); }
  }

  // ------------------------------------------------------------ explorers & pirates
  function spiceProduce(s, total) {
    for (const hid of s.board.spices) {
      const h = H(s, hid);
      if (h.number !== total || h.hidden || s.robber === hid) continue;
      for (const v of h.verts) {
        const b = s.buildings[v];
        if (!b) continue;
        const n = b.type === 'city' ? 2 : 1;
        P(s, b.p).cargo.spice += n;
        log(s, '{@p} loads {n} spice.', { p: b.p, n });
      }
    }
  }
  function shoalProduce(s, total) {
    for (const sh of s.board.shoals) {
      const h = H(s, sh.hex);
      if (sh.number !== total || h.hidden || s.pirate === sh.hex) continue;
      const got = new Set();
      for (const e of h.edges) { const ship = s.ships[e]; if (ship) got.add(ship.p); }
      got.forEach(p => { P(s, p).cargo.fish += 1; log(s, '{@p} hauls in a catch of fish.', { p }); });
    }
  }
  function missionVp(s, p) {
    if (s.expansion !== 'explorers') return 0;
    const pl = P(s, p);
    let v = 0;
    if (s.missions.includes('fish')) v += Math.min(C.MISSION_VP_CAP, Math.floor(pl.delivered.fish / 2));
    if (s.missions.includes('spice')) v += Math.min(C.MISSION_VP_CAP, Math.floor(pl.delivered.spice / 2));
    v += Object.values(s.lairOwners).filter(o => o === p).length;
    return v;
  }

  // ------------------------------------------------------------ victory points
  function vpExtra(s, p) {
    let pts = 0;
    for (const o of Object.values(s.islandBonus)) if (o === p) pts += 1;
    pts += missionVp(s, p);
    if (s.rivers) pts += riverVp(s, p);
    return pts;
  }
  function riverVp(s, p) {
    const golds = s.players.map(pl => pl.gold);
    const max = Math.max(...golds), min = Math.min(...golds);
    let v = 0;
    if (max > 0 && golds[p] === max && golds.filter(g => g === max).length === 1) v += 1;
    if (max > min && golds[p] === min) v -= 2;
    return v;
  }
  const vpTarget = (s, p) => s.options.vpTarget + (s.fish && s.fish.boot === p ? 1 : 0);

  // river gold for building next to the river
  function giveGold(s, p, n) {
    if (!s.rivers || !n) return;
    P(s, p).gold += n;
    log(s, '{@p} earns {n} gold.', { p, n });
  }
  function riverBuilt(s, p, kind, where) {
    if (!s.rivers) return;
    if (kind === 'road') { if (E(s, where).hexes.some(i => H(s, i).terrain === 'river')) giveGold(s, p, 1); }
    else if (V(s, where).hexes.some(i => H(s, i).terrain === 'river')) giveGold(s, p, 1);
  }

  function islandBonus(s, p, v) {
    if (!s.sea) return;
    const isl = vertexIsland(s, v);
    if (isl == null || s.board.homeIslands.includes(isl) || s.islandBonus[isl] !== undefined) return;
    s.islandBonus[isl] = p;
    log(s, '{@p} settles a new island and earns a bonus point (+1 VP).', { p });
  }

  // ------------------------------------------------------------ handlers
  const requireActor = (s, p) => core.requireActor(s, p);
  const handlers = {
    buildShip(s, p, a) {
      if (!s.sea) fail('There are no ships in this game.');
      requireActor(s, p);
      if (countShips(s, p) >= C.PIECES.ship) fail('No ships left.');
      if (!legalShips(s, p).includes(a.e)) fail('You cannot sail a ship there.');
      if (!has(P(s, p), C.COSTS.ship)) fail('Not enough resources.');
      pay(s, P(s, p), C.COSTS.ship);
      s.ships[a.e] = { p, builtTurn: s.turn };
      log(s, '{@p} built a ship.', { p });
      reveal(s, p, E(s, a.e).v);
      updateLongest(s);
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
      updateLongest(s);
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
    // ---- rivers
    buildBridge(s, p, a) {
      if (!s.rivers) fail('There are no rivers in this game.');
      requireActor(s, p);
      if (Object.keys(s.bridges).filter(e => s.roads[e] === p).length >= C.PIECES.bridge) fail('No bridges left.');
      if (!legalBridges(s, p).includes(a.e)) fail('You cannot build a bridge there.');
      if (!has(P(s, p), C.COSTS.bridge)) fail('Not enough resources.');
      pay(s, P(s, p), C.COSTS.bridge);
      s.roads[a.e] = p; s.bridges[a.e] = true;
      log(s, '{@p} built a bridge.', { p });
      giveGold(s, p, 3);
      updateLongest(s);
    },
    goldTrade(s, p, a) {
      if (!s.rivers) fail('There are no rivers in this game.');
      core.requireMain(s, p);
      if (!isRes(a.res)) fail('Pick a resource.');
      if ((s.flags.goldTrades || 0) >= 2) fail('You can swap gold only twice per turn.');
      const pl = P(s, p);
      if (pl.gold < 2) fail('You need 2 gold.');
      if (s.bank[a.res] < 1) fail('The bank is out of that.');
      pl.gold -= 2; s.flags.goldTrades = (s.flags.goldTrades || 0) + 1;
      take(s, pl, a.res, 1);
      log(s, '{@p} swaps 2 gold for {$c}.', { p, c: { [a.res]: 1 } });
    },
    // ---- fishermen
    useFish(s, p, a) {
      if (!s.fishing) fail('There are no fishermen in this game.');
      core.requireMain(s, p);
      const cost = C.FISH_COSTS[a.what];
      if (!cost) fail('Unknown fish trade.');
      const pl = P(s, p);
      if (pl.fish < cost) fail('You need {n} fish.', { n: cost });
      switch (a.what) {
        case 'robber':
          pl.fish -= cost;
          log(s, '{@p} pays {n} fish to chase the robber away.', { p, n: cost });
          pushPending(s, [{ type: 'moveRobber', player: p }], true);
          break;
        case 'steal': {
          const q = a.target;
          if (q === p || !P(s, q) || !hand(P(s, q))) fail('Pick a player with cards.');
          pl.fish -= cost;
          core.steal(s, p, q);
          break;
        }
        case 'take':
          if (!isRes(a.res) || s.bank[a.res] < 1) fail('Pick a resource the bank has.');
          pl.fish -= cost;
          take(s, pl, a.res, 1);
          log(s, '{@p} trades {n} fish for {$c}.', { p, n: cost, c: { [a.res]: 1 } });
          break;
        case 'road':
          if (countPieces(s, p).roads >= C.PIECES.road) fail('No roads left.');
          pl.fish -= cost;
          s.free.roads++;
          log(s, '{@p} trades {n} fish for a free road.', { p, n: cost });
          break;
        case 'dev':
          if (core.K(s)) {
            pl.fish -= cost;
            log(s, '{@p} trades {n} fish for a progress card.', { p, n: cost });
            pushPending(s, [{ type: 'chooseProgress', player: p }], true);
          } else {
            if (!s.devDeck.length) fail('The development deck is empty.');
            pl.fish -= cost;
            pl.dev.push({ type: s.devDeck.pop(), turn: s.turn });
            log(s, '{@p} trades {n} fish for a development card.', { p, n: cost });
          }
          break;
      }
    },
    // ---- explorers & pirates
    deliver(s, p, a) {
      if (s.expansion !== 'explorers') fail('There are no missions in this game.');
      core.requireMain(s, p);
      const kind = a.kind;
      if (!['fish', 'spice'].includes(kind) || !s.missions.includes(kind)) fail('That mission is not in this game.');
      const pl = P(s, p);
      const n = pl.cargo[kind];
      if (!n) fail('You have nothing to deliver.');
      if (!Object.values(s.buildings).some(b => b.p === p)) fail('You need a settlement to deliver to.');
      pl.cargo[kind] = 0; pl.delivered[kind] += n;
      log(s, '{@p} delivers {n} {#k} to the council.', { p, n, k: kind });
    },
    attackLair(s, p, a) {
      if (s.expansion !== 'explorers') fail('There are no pirate lairs in this game.');
      core.requireMain(s, p);
      const lair = s.lairs.find(l => l.hex === a.hex && l.hp > 0);
      if (!lair || H(s, lair.hex).hidden) fail('There is no lair there.');
      if (!H(s, lair.hex).edges.some(e => s.ships[e] && s.ships[e].p === p)) fail('You need a ship next to the lair.');
      if (!has(P(s, p), { ore: 1, wool: 1 })) fail('Attacking costs 1 ore and 1 wool.');
      pay(s, P(s, p), { ore: 1, wool: 1 });
      lair.hp--; lair.hits[p] = (lair.hits[p] || 0) + 1;
      log(s, '{@p} attacks a pirate lair ({n} left).', { p, n: lair.hp });
      if (lair.hp <= 0) {
        const max = Math.max(...Object.values(lair.hits));
        const tops = Object.keys(lair.hits).filter(k => lair.hits[k] === max).map(Number);
        const winner = tops.includes(p) ? p : tops[0];
        s.lairOwners[lair.id] = winner;
        log(s, 'The pirate lair is destroyed. {@p} earns the bounty (+1 VP).', { p: winner });
      }
    },
  };

  function countShips(s, p) { return Object.values(s.ships).filter(x => x.p === p).length; }

  // ------------------------------------------------------------ legal moves for the client
  function legalExtra(s, p, L, actor, main) {
    if (s.phase !== 'play') return;
    for (const it of core.activePending(s).filter(i => i.player === p)) {
      if (it.type === 'goldPick') L.goldPick = { count: it.count };
    }
    if (actor) {
      if (s.sea) {
        if (countShips(s, p) < C.PIECES.ship && has(P(s, p), C.COSTS.ship)) L.ships = legalShips(s, p);
      }
      if (s.rivers && has(P(s, p), C.COSTS.bridge) && Object.keys(s.bridges).filter(e => s.roads[e] === p).length < C.PIECES.bridge) L.bridges = legalBridges(s, p);
    }
    if (main) {
      if (s.sea) L.moveShips = movableShips(s, p);
      if (s.fishing) {
        L.fish = {};
        for (const [k, c] of Object.entries(C.FISH_COSTS)) L.fish[k] = P(s, p).fish >= c;
      }
      if (s.rivers) L.goldTrade = P(s, p).gold >= 2 && (s.flags.goldTrades || 0) < 2;
      if (s.expansion === 'explorers') {
        L.deliver = { fish: P(s, p).cargo.fish > 0 && s.missions.includes('fish'), spice: P(s, p).cargo.spice > 0 && s.missions.includes('spice') };
        L.lairs = s.lairs.filter(l => l.hp > 0 && !H(s, l.hex).hidden && H(s, l.hex).edges.some(e => s.ships[e] && s.ships[e].p === p)).map(l => l.hex);
      }
    }
  }

  function viewBoard(s, vb) {
    // what clients may see of the sea board: hidden hexes lose terrain and numbers
    const b = s.board;
    vb.hexes = b.hexes.map(h => h.hidden
      ? { id: h.id, x: h.x, y: h.y, terrain: 'fog', number: null, verts: h.verts, hidden: true }
      : { id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, verts: h.verts, island: h.island ?? undefined, river: h.river || undefined });
    if (b.fishing) vb.fishing = b.fishing;
    if (b.rivers) vb.rivers = b.rivers;
    if (b.desert != null) vb.desert = b.desert;
    if (b.homeIslands) vb.homeIslands = b.homeIslands;
    if (s.expansion === 'explorers') {
      vb.shoals = (b.shoals || []).filter(x => !H(s, x.hex).hidden);
      vb.spices = (b.spices || []).filter(x => !H(s, x).hidden);
    }
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
    v.rivers = s.rivers; v.fishing = s.fishing; v.eventCards = s.eventCards;
    if (s.fish) v.fish = { left: s.fish.bag.length, boot: s.fish.boot };
    if (s.deck) v.deckLeft = s.deck.length;
    if (s.expansion === 'explorers') {
      v.missions = s.missions;
      v.lairs = s.lairs.filter(l => !H(s, l.hex).hidden).map(l => ({ id: l.id, hex: l.hex, hp: l.hp, owner: s.lairOwners[l.id] ?? null }));
    }
    v.players.forEach((pv, i) => {
      const pl = s.players[i];
      pv.gold = pl.gold; pv.fish = pl.fish;
      pv.cargo = pl.cargo; pv.delivered = pl.delivered;
      pv.pieces.ships = C.PIECES.ship - countShips(s, i);
      pv.pieces.bridges = C.PIECES.bridge - Object.keys(s.bridges).filter(e => s.roads[e] === i).length;
      pv.vpTarget = vpTarget(s, i);
      if (s.rivers) { pv.riverVp = riverVp(s, i); }
    });
    return v;
  }

  return {
    makeBoard, initState, drawEvent, landVertex, vertexIsland, roadEdgeOk, shipEdgeOk, legalShips, legalBridges, movableShips, setupSpotOk,
    reveal, afterProduce, vpExtra, vpTarget, riverBuilt, giveGold, islandBonus, handlers, legalExtra, viewBoard, viewExtra, countShips,
    SCENARIOS, isCrossing, pirateBlocks, ownShipAt, missionVp, riverVp,
  };
};
