'use strict';
// Every move worth trying for one seat of a classic-family game (classic, Cities & Knights, Seafarers, Traders & Barbarians).
// The fuzzer in test/simulate.js picks one at random; the server bots use it as the fallback when their own choice is refused.
const { viewFor, _internal } = require('../engine/game');
const C = require('../engine/constants');

const pick = a => a[Math.floor(Math.random() * a.length)];

function cardsOf(v, count) {
  const me = v.players[v.me];
  const pool = [];
  for (const [k, n] of Object.entries(me.res || {})) for (let i = 0; i < n; i++) pool.push(k);
  for (const [k, n] of Object.entries(me.comm || {})) for (let i = 0; i < n; i++) pool.push(k);
  const out = {};
  for (let i = 0; i < count; i++) { const j = Math.floor(Math.random() * pool.length); const [k] = pool.splice(j, 1); out[k] = (out[k] || 0) + 1; }
  return out;
}

function progressArgs(s, p, L, c, idx) {
  const opp = pick(s.players.map((_, i) => i).filter(i => i !== p));
  const offers = {}; s.players.forEach((_, i) => { if (i !== p && Math.random() < 0.7) offers[i] = pick(C.RES); });
  return { type: 'playProgress', idx, target: opp, kind: c.type === 'tradeMonopoly' ? pick(C.COMM) : pick(C.RES), offers,
    v: pick([...(L.cities || []), ...Object.keys(s.buildings).map(Number)]), hex: pick(L.merchantHexes || [0]),
    a: pick(L.inventorHexes || [0]), b: pick(L.inventorHexes || [0]), e: pick(L.openRoads && L.openRoads.length ? L.openRoads : [0]) };
}

function candidates(s, p) {
  const v = viewFor(s, p), L = v.legal, out = [];
  if (L.goldPick) {
    const c = {}; for (let i = 0; i < L.goldPick.count; i++) { const k = pick(C.RES); c[k] = (c[k] || 0) + 1; }
    out.push({ type: 'pickGold', cards: c });
  }
  if (L.setupSpots) out.push({ type: s.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: pick(L.setupSpots) });
  if (L.setupRoads) out.push({ type: 'placeRoad', e: pick(L.setupRoads) });
  if (L.setupShips && L.setupShips.length) out.push({ type: 'placeShip', e: pick(L.setupShips) });
  const mine = s.pending.length ? _internal.activePending(s).filter(i => i.player === p) : [];
  for (const it of mine) {
    switch (it.type) {
      case 'discard': out.push({ type: 'discard', cards: cardsOf(v, it.count) }); break;
      case 'give': out.push({ type: 'give', cards: cardsOf(v, it.count) }); break;
      case 'moveRobber': out.push({ type: 'moveRobber', hex: pick(L.robberHexes) }); if (L.pirateFrame && Math.random() < 0.15) out.push({ type: 'moveRobber', hex: -1 }); if (L.leaveRobber) out.push({ type: 'leaveRobber', endTurn: Math.random() < 0.5 }); break;
      case 'placeHarbor': out.push({ type: 'placeHarbor', v: pick(L.harborSpots) }); break;
      case 'steal': out.push({ type: 'steal', from: pick(it.options), cloth: it.cloth && Math.random() < 0.5 }); break;
      case 'relocateKnight': out.push({ type: 'relocateKnight', v: pick(L.relocate) }); break;
      case 'placeMetropolis': out.push({ type: 'placeMetropolis', v: pick(L.metroCities) }); break;
      case 'loseCity': out.push({ type: 'loseCity', v: pick(L.loseCities) }); break;
      case 'chooseProgress': out.push({ type: 'chooseProgress', deck: pick(['trade', 'politics', 'science']) }); break;
      case 'discardProgress': {
        out.push({ type: 'discardProgress', idx: 0 });
        if (it.mustPlay) s.players[p].progress.forEach((c, idx) => out.push(progressArgs(s, p, L, c, idx)));
        break;
      }
      case 'harborGive': out.push({ type: 'harborGive', comm: pick(C.COMM) }); break;
      case 'deserterPick': out.push({ type: 'deserterPick', v: pick(L.giveKnights) }); break;
      case 'aqueduct': out.push({ type: 'aqueduct', res: pick(C.RES) }); break;
      case 'placeFreeKnight': out.push({ type: 'placeFreeKnight', v: L.freeKnightSpots.length ? pick(L.freeKnightSpots) : null }); break;
      case 'spy': out.push({ type: 'spyTake', idx: 0 }); break;
      case 'fishSwap': out.push({ type: 'fishSwap', idx: Math.random() < 0.5 ? null : 0 }); break;
      case 'bankPick': { const c = {}; for (let i = 0; i < it.count; i++) { const k = pick(C.RES.filter(r => s.bank[r] > 0)); if (k) c[k] = (c[k] || 0) + 1; } out.push({ type: 'bankPick', cards: c }); break; }
      case 'quake': out.push({ type: 'quake', e: pick(L.quakeRoads) }); break;
      case 'helpGive': { const have = [...C.RES.filter(r => s.players[p].res[r] > 0), ...(s.mode === 'knights' ? C.COMM.filter(r => s.players[p].comm[r] > 0) : [])]; if (have.length) out.push({ type: 'helpGive', to: pick(L.helpTo), card: pick(have) }); break; }
      case 'wagonCards': out.push({ type: 'wagonCards', wool: Math.floor(Math.random() * (s.players[p].res.wool + 1)), grain: Math.floor(Math.random() * (s.players[p].res.grain + 1)) }); break;
      case 'wagonVote': out.push({ type: 'wagonVote', pos: pick(L.wagonPositions) }); break;
      case 'wagonPlace': out.push({ type: 'wagonPlace', pos: pick(L.wagonPositions) }); break;
      case 'placeKnight': out.push({ type: 'placeKnight', e: pick(L.knightPlace) }); break;
      case 'captive': out.push({ type: 'captive', hex: pick(L.barbHexes) }); break;
      case 'treason': {
        const from = []; const pool = L.barbHexes.slice(); const nf = Math.min(2, pool.length); while (from.length < nf) from.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        const to = L.treasonTargets.filter(h => !from.includes(h)).sort(() => Math.random() - 0.5).slice(0, 2);
        out.push({ type: 'treason', from, to }); break;
      }
      case 'moveKnights': {
        for (const [e, o] of Object.entries(L.knightMoves || {})) { const all = [...o.near, ...o.far]; if (all.length && Math.random() < 0.7) out.push({ type: 'moveKnight', from: +e, to: pick(all) }); }
        out.push({ type: 'knightsDone' }); break;
      }
      case 'moveBarb': out.push({ type: 'moveBarb', from: pick(L.barbMoves.from), to: pick(L.barbMoves.to) }); break;
      case 'moveWagon': {
        const W = L.wagon;
        if (W.placing) { out.push({ type: 'wagonBarbTo', to: pick(W.barbTargets) }); break; }
        W.steps.forEach(st => { for (let i = 0; i < 3; i++) out.push({ type: 'wagonStep', to: st.to }); });
        W.expel.forEach(e => out.push({ type: 'wagonExpel', edge: e }));
        if (W.grain && Math.random() < 0.3) out.push({ type: 'wagonGrain' });
        if (W.trip) out.push({ type: 'playGoodTrip' });
        out.push({ type: 'wagonDone' }, { type: 'wagonDone' });
        break;
      }
      case 'masterMerchant': {
        const r = v.reveal; const pool = [];
        for (const [k, n] of [...Object.entries(r.res), ...Object.entries(r.comm)]) for (let i = 0; i < n; i++) pool.push(k);
        const c = {}; for (let i = 0; i < Math.min(2, pool.length); i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
        out.push({ type: 'takeCards', cards: c }); break;
      }
    }
  }
  if (s.trade && s.trade.from !== p && !(p in s.trade.responses)) out.push({ type: 'respondTrade', id: s.trade.id, accept: Math.random() < 0.5 });
  if (s.trade && s.trade.from !== p && Math.random() < 0.2) { const give = cardsOf(v, 1); if (Object.keys(give).length) out.push({ type: 'counterTrade', id: s.trade.id, give, get: { [pick(C.RES)]: 1 } }); }
  if (s.phase === 'play' && !s.pending.length) {
    if (s.step === 'roll' && p === s.current) {
      out.push({ type: 'roll' });
      const me = s.players[p];
      if (me.dev.length) out.push({ type: 'playDev', card: 'knight' });
      const al = me.progress.findIndex(c => c.type === 'alchemist');
      if (al >= 0) out.push({ type: 'playProgress', idx: al, red: 1 + (Math.random() * 6 | 0), yellow: 1 + (Math.random() * 6 | 0) });
    }
    if ((s.step === 'main' && p === s.current) || (s.step === 'sbp' && s.sbp.queue[0] === p)) {
      if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) });
      if (L.settlements && L.settlements.length) out.push({ type: 'buildSettlement', v: pick(L.settlements) }, { type: 'buildSettlement', v: pick(L.settlements) });
      if (L.cities && L.cities.length) out.push({ type: 'buildCity', v: pick(L.cities) }, { type: 'buildCity', v: pick(L.cities) });
      if (L.canBuyDev) out.push({ type: 'buyDev' });
      if (L.ships && L.ships.length) out.push({ type: 'buildShip', e: pick(L.ships) }, { type: 'buildShip', e: pick(L.ships) });
      if (L.wonders) { for (const k of L.wonders.start) out.push({ type: 'startWonder', wonder: k }); if (L.wonders.build) out.push({ type: 'buildWonder' }); }
      if (L.bridges && L.bridges.length) out.push({ type: 'buildBridge', e: pick(L.bridges) });
      if (L.knightSpots && L.knightSpots.length) out.push({ type: 'buildKnight', v: pick(L.knightSpots) });
      if (L.walls && L.walls.length) out.push({ type: 'buildWall', v: pick(L.walls) });
      if (L.improve) for (const [t, o] of Object.entries(L.improve)) if (o.ok) out.push({ type: 'improve', track: t }, { type: 'improve', track: t });
      if (L.knights) for (const [kv, k] of Object.entries(L.knights)) {
        if (k.activate) out.push({ type: 'activateKnight', v: +kv });
        if (k.promote) out.push({ type: 'promoteKnight', v: +kv });
        if (k.moves.length) out.push({ type: 'moveKnight', from: +kv, to: pick(k.moves) });
        if (k.displace.length) out.push({ type: 'displaceKnight', from: +kv, to: pick(k.displace) });
        if (k.chase) out.push({ type: 'chaseRobber', v: +kv });
      }
      if (s.step === 'sbp') out.push({ type: 'endSpecialBuild' });
    }
    if (s.step === 'main' && p === s.current) {
      out.push({ type: 'endTurn' });
      if (L.moveShips) for (const [from, tos] of Object.entries(L.moveShips)) out.push({ type: 'moveShip', from: +from, to: pick(tos) });
      if (L.goldTrade) out.push({ type: 'goldTrade', res: pick(C.RES) });
      if (L.upgrade) out.push({ type: 'upgradeWagon' });
      if (L.repair && L.repair.ok) out.push({ type: 'repairRoad', e: pick(L.repair.edges) });
      if (L.boot && L.boot.length) out.push({ type: 'giveBoot', to: pick(L.boot) });
      if (L.fish) for (const [what, ok] of Object.entries(L.fish)) if (ok) out.push({ type: 'useFish', what, target: pick(s.players.map((_, i) => i).filter(i => i !== p)), res: pick(C.RES) });
      if (L.deliver) for (const [kind, ok] of Object.entries(L.deliver)) if (ok) out.push({ type: 'deliver', kind });
      if (L.lairs && L.lairs.length) out.push({ type: 'attackLair', hex: pick(L.lairs) });
      const me = s.players[p];
      for (const d of me.dev) out.push({ type: 'playDev', card: d.type, a: pick(C.RES), b: pick(C.RES), res: pick(C.RES) });
      me.progress.forEach((c, idx) => out.push(progressArgs(s, p, L, c, idx)));
      if (L.ratios) for (const [t, r] of Object.entries(L.ratios)) {
        const have = (me.res[t] ?? me.comm[t]) || 0;
        if (have >= r) out.push({ type: 'bankTrade', give: t, get: pick(C.RES) });
      }
      if (!s.trade && !s.flags.stone2 && Math.random() < 0.05) {
        const give = cardsOf(v, 1);
        if (Object.keys(give).length) out.push({ type: 'offerTrade', give, get: { [pick(C.RES)]: 1 } });
      }
      if (s.trade && s.trade.from === p) {
        const acc = Object.entries(s.trade.responses).find(([, r]) => r === 'accept' || r === 'counter');
        if (acc) out.push({ type: 'confirmTrade', with: +acc[0] });
        out.push({ type: 'cancelTrade' });
      }
    }
  }
  return out;
}

module.exports = candidates;
