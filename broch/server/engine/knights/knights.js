'use strict';
// Cities & Knights (mode 'knights'): knights, barbarians, progress cards, city improvements and metropolises.
// The rules of the classic game live in ../classic/game.js, which hands its helpers to this file (same "make(core)" pattern
// as the expansions) and calls the hooks returned at the bottom wherever knights mode changes a classic rule or a view.

const C = require('../shared/constants');
const { shuffle, expand } = require('../shared/board');

module.exports = function make(core) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, sum, countPieces, moveCard, updateLongest, isRes, isComm,
    foreignAt, occupied, touchesOwnRoute, landVertex, requireActor, requireMain, requireTurnAny, K, vp, activePending, roll, validCards, ownSettlements } = core;

  // ---------------------------------------------------------------- board and corners
  function ownCities(s, p, filter = () => true) {
    return Object.entries(s.buildings).filter(([, b]) => b.p === p && b.type === 'city' && filter(b)).map(([v]) => +v);
  }
  function legalKnightSpots(s, p) {
    return s.board.vertices.filter(v => !occupied(s, v.id) && landVertex(s, v.id) && touchesOwnRoute(s, v.id, p)).map(v => v.id);
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

  function requireKnights(s) { if (!K(s)) fail('Only in knights mode.'); }

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

  // ---------------------------------------------------------------- actions
  const handlers = {
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
      if (typeof a.track !== 'string' || !Object.hasOwn(C.TRACK_COMM, a.track)) fail('Unknown improvement.');
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
      if (!it || typeof a.deck !== 'string' || !Object.hasOwn(C.PROGRESS, a.deck)) fail('Pick a deck.');
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

  };

  function dropHarbor(board) {
    const any = board.ports.filter(pt => pt.type === 'any');
    if (!any.length) return;
    const gone = any[Math.floor(Math.random() * any.length)];
    board.ports = board.ports.filter(pt => pt !== gone);
    board.edges[gone.edge].v.forEach(v => { if (board.vertices[v].port === 'any') board.vertices[v].port = null; });
  }


  // ---------------------------------------------------------------- hooks for the classic engine
  // set-up: what a player and the table carry in knights mode (the classic state keeps the fields in every mode)
  const newPlayer = () => ({ aqueduct: null, progress: [], vpCards: 0, defender: 0, improvements: { trade: 0, politics: 0, science: 0 } });
  function initState(s) {
    const knights = K(s);
    s.merchant = null;
    s.progressDecks = knights ? Object.fromEntries(Object.entries(C.PROGRESS).map(([k, v]) => [k, shuffle(expand(v))])) : null;
    s.barbarian = knights ? { pos: 0, attacks: 0 } : null;
    s.metropolis = knights ? { trade: null, politics: null, science: null } : null;
  }

  // victory points that only exist in knights mode: metropolises, Defender of Broch, progress point cards, the merchant
  function points(s, p) {
    const pl = P(s, p);
    let pts = pl.defender + pl.vpCards;
    for (const b of Object.values(s.buildings)) if (b.p === p && b.metro) pts += 2;
    if (s.merchant && s.merchant.owner === p) pts += 1;
    return pts;
  }
  const breakdown = (s, p) => {
    const pl = P(s, p);
    const out = {
      metropolis: Object.values(s.buildings).filter(b => b.p === p && b.metro).length,
      defender: pl.defender, merchant: !!(s.merchant && s.merchant.owner === p),
    };
    if (K(s)) out.vpCards = pl.vpCards;
    return out;
  };

  const handLimitBonus = (s, p) => countPieces(s, p).walls * 2;
  // trade ratios: the trade improvement, the merchant and the Merchant Fleet card
  function bankRatio(s, p, type, r) {
    if (isComm(type) && P(s, p).improvements.trade >= 3) r = 2;
    if (s.merchant && s.merchant.owner === p && C.TERRAIN_RES[s.board.hexes[s.merchant.hex].terrain] === type) r = 2;
    if (s.flags.fleet === type) r = 2;
    return r;
  }

  // dice: the event die, and what it does (the barbarian ship moves, or the gate hands out progress cards)
  const rollEvent = () => C.EVENT_FACES[Math.floor(Math.random() * 6)];
  function afterRoll(s, event, red) {
    if (event === 'ship') advanceBarbarians(s);
    else drawProgressForGate(s, event, red);
  }
  // production: a city on forest, pasture or mountains yields a resource and a commodity
  function cityYield(w, h, res) {
    const c = C.TERRAIN_COMM[h.terrain];
    if (!c) return false;
    w[res] = (w[res] || 0) + 1;
    w[c] = (w[c] || 0) + 1;
    return true;
  }
  // science level 3: the aqueduct pays one resource to a player whose roll brought nothing
  function aqueducts(s, gotAny, goldWant) {
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

  // special building phase (old games): what a player could still build in knights mode
  const buildCosts = () => [C.COSTS.knight, C.COSTS.wall, C.COSTS.activate];
  function canImprove(s, p) {
    const pl = P(s, p);
    return Object.keys(C.TRACK_COMM).some(t => pl.comm[C.TRACK_COMM[t]] >= pl.improvements[t] + 1);
  }

  // ---- legal moves for the client
  function legalPending(s, p, it, L) {
    if (it.type === 'relocateKnight') L.relocate = it.options.filter(v => !occupied(s, v));
    if (it.type === 'placeMetropolis') L.metroCities = ownCities(s, p, b => !b.metro);
    if (it.type === 'loseCity') L.loseCities = ownCities(s, p, b => !b.metro);
    if (it.type === 'placeFreeKnight') L.freeKnightSpots = legalKnightSpots(s, p);
    if (it.type === 'deserterPick') L.giveKnights = Object.keys(s.knights).filter(v => s.knights[v].p === p).map(Number);
  }
  // the player may build: knights, walls, improvements, and move the knights he has
  function legal(s, p, L, c) {
    const pl = P(s, p);
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
  // on your own turn, whatever the phase: targets for the progress cards
  function legalTurn(s, p, L) {
    L.openRoads = openRoads(s);
    L.intrigue = Object.keys(s.knights).map(Number).filter(v => s.knights[v].p !== p && touchesOwnRoute(s, v, p));
    L.merchantHexes = s.board.hexes.filter(h => !h.hidden && C.TERRAIN_RES[h.terrain] && h.verts.some(v => s.buildings[v] && s.buildings[v].p === p)).map(h => h.id);
    L.inventorHexes = s.board.hexes.filter(h => h.number != null && ![2, 12, 6, 8].includes(h.number)).map(h => h.id);
  }

  // ---- views
  function pendingView(s, it, o) {
    if (it.track) o.track = it.track;
    if (it.level) o.level = it.level;
    if (it.target != null) o.target = it.target;
    if (it.mustPlay) o.mustPlay = true;
    if (it.type === 'placeFreeKnight') o.active = !!it.active;
    if (it.type === 'discardProgress' && it.mustPlay) o.canGiveBack = !P(s, it.player).progress.some(c => couldPlayNow(s, it.player, c.type));
  }
  // what the spy and the master merchant let you see of the chosen player
  function reveal(s, me) {
    const mine = activePending(s).find(i => i.player === me && (i.type === 'spy' || i.type === 'masterMerchant'));
    if (!mine) return null;
    const t = P(s, mine.target);
    return mine.type === 'spy' ? { target: mine.target, progress: t.progress.map(c => c.type) } : { target: mine.target, res: t.res, comm: t.comm };
  }
  function playerView(s, i, self) {
    const pl = P(s, i);
    return {
      comm: self && K(s) ? pl.comm : null,
      progressCount: pl.progress.length,
      progress: self ? pl.progress.map(c2 => c2.type) : null,
      improvements: pl.improvements, aqueduct: self ? pl.aqueduct || null : undefined, defender: pl.defender, vpCards: K(s) ? pl.vpCards : undefined,
    };
  }
  const pieces = c => ({ walls: C.PIECES.wall - c.walls, knights: [0, 2 - c.knights[1], 2 - c.knights[2], 2 - c.knights[3]] });
  const viewFlags = s => ({ crane: !!s.flags.crane, fleet: s.flags.fleet || null });
  const viewState = s => ({
    merchant: s.merchant, knights: s.knights,
    progressDecks: s.progressDecks && Object.fromEntries(Object.entries(s.progressDecks).map(([k, v]) => [k, v.length])),
    barbarian: s.barbarian, metropolis: s.metropolis,
  });

  return {
    handlers, PROGRESS_FX, robberActive,
    newPlayer, initState, dropHarbor, points, breakdown, handLimitBonus, bankRatio, rollEvent, afterRoll, cityYield, aqueducts, buildCosts, canImprove,
    legalPending, legal, legalTurn, pendingView, reveal, playerView, pieces, viewFlags, viewState,
  };
};
