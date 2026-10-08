'use strict';
// Very simple bot: builds what it can, sometimes accepts trades, ends its turn.
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const pick = a => a[Math.floor(Math.random() * a.length)];

function cardsFrom(src, n) {
  const pool = [];
  for (const [k, c] of [...Object.entries(src.res || {}), ...Object.entries(src.comm || {})]) for (let i = 0; i < c; i++) pool.push(k);
  const o = {};
  for (let i = 0; i < n && pool.length; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); o[k] = (o[k] || 0) + 1; }
  return o;
}
const has = (me, cost) => Object.entries(cost).every(([k, n]) => ((me.res && me.res[k]) ?? (me.comm && me.comm[k]) ?? 0) >= n);

// choose a robber tile that hurts someone else, not ourselves
function robberHex(v) {
  const scored = v.legal.robberHexes.map(h => {
    const hex = v.board.hexes[h];
    let score = hex.number ? 1 : 0;
    for (const vid of hex.verts || []) { const b = v.buildings[vid]; if (b) score += b.p === v.me ? -10 : 3; }
    return [score + Math.random(), h];
  }).sort((a, b) => b[0] - a[0]);
  return scored[0][1];
}

function decide(v) {
  const L = v.legal || {}, me = v.players[v.me];
  if (v.phase === 'over') return null;
  if (L.setupSpots) {
    // prefer corners touching good numbers
    const pips = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
    const score = vid => v.board.hexes.filter(h => h.verts.includes(vid)).reduce((a, h) => a + (pips[h.number] || 0), 0) + Math.random();
    const best = L.setupSpots.slice().sort((a, b) => score(b) - score(a))[0];
    return { type: v.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: best };
  }
  if (L.goldPick) { const c = {}; for (let i = 0; i < L.goldPick.count; i++) { const k = pick(RES); c[k] = (c[k] || 0) + 1; } return { type: 'pickGold', cards: c }; }
  if (L.setupRoads) return L.setupShips?.length && Math.random() < 0.3 ? { type: 'placeShip', e: pick(L.setupShips) } : { type: 'placeRoad', e: pick(L.setupRoads) };
  const mine = v.pending.filter(p => p.group === v.activeGroup && p.player === v.me)[0];
  if (mine) {
    switch (mine.type) {
      case 'discard': return { type: 'discard', cards: cardsFrom(me, mine.count) };
      case 'give': return { type: 'give', cards: cardsFrom(me, mine.count) };
      case 'moveRobber': return { type: 'moveRobber', hex: robberHex(v) };
      case 'steal': return { type: 'steal', from: pick(mine.options), cloth: !!mine.cloth && Math.random() < 0.5 };
      case 'placeHarbor': return { type: 'placeHarbor', v: pick(L.harborSpots) };
      case 'relocateKnight': return { type: 'relocateKnight', v: pick(L.relocate) };
      case 'placeMetropolis': return { type: 'placeMetropolis', v: pick(L.metroCities) };
      case 'loseCity': return { type: 'loseCity', v: pick(L.loseCities) };
      case 'chooseProgress': return { type: 'chooseProgress', deck: pick(['trade', 'politics', 'science']) };
      case 'discardProgress': {
        if (!mine.mustPlay) return { type: 'discardProgress', idx: 0 };
        // a 5th card on the bot's own turn must be played: take one that needs nothing, otherwise give one back if allowed
        const safe = ['crane', 'irrigation', 'mining', 'roadBuilding', 'smith', 'warlord', 'saboteur', 'wedding', 'merchantFleet', 'resourceMonopoly', 'tradeMonopoly'];
        const idx = (me.progress || []).findIndex(c => safe.includes(c));
        if (idx >= 0) return { type: 'playProgress', idx, kind: me.progress[idx] === 'tradeMonopoly' ? 'cloth' : pick(RES) };
        return { type: 'discardProgress', idx: 0 };
      }
      case 'harborGive': { const c = ['paper', 'cloth', 'coin'].filter(k => (me.comm?.[k] || 0) > 0); return { type: 'harborGive', comm: pick(c.length ? c : ['paper']) }; }
      case 'deserterPick': return { type: 'deserterPick', v: pick(L.giveKnights) };
      case 'aqueduct': return { type: 'aqueduct', res: pick(RES) };
      case 'placeFreeKnight': return { type: 'placeFreeKnight', v: L.freeKnightSpots?.length ? pick(L.freeKnightSpots) : null };
      case 'spy': return { type: 'spyTake', idx: v.reveal?.progress?.length ? 0 : null };
      // Traders & Barbarians
      case 'quake': return { type: 'quake', e: pick(L.quakeRoads) };
      case 'bankPick': { const c = {}; for (let i = 0; i < mine.count; i++) { const k = pick(RES.filter(r => v.bank[r] > 0)); if (k) c[k] = (c[k] || 0) + 1; } return { type: 'bankPick', cards: c }; }
      case 'helpGive': { const have = RES.filter(r => me.res[r] > 0); return have.length ? { type: 'helpGive', to: pick(L.helpTo), card: pick(have) } : null; }
      case 'fishSwap': return { type: 'fishSwap', idx: null };
      case 'wagonCards': return { type: 'wagonCards', wool: Math.min(me.res.wool, 1), grain: 0 };
      case 'wagonVote': return { type: 'wagonVote', pos: pick(L.wagonPositions) };
      case 'wagonPlace': return { type: 'wagonPlace', pos: pick(L.wagonPositions) };
      case 'placeKnight': return { type: 'placeKnight', e: pick(L.knightPlace) };
      case 'captive': return { type: 'captive', hex: pick(L.barbHexes) };
      case 'treason': {
        const nf = Math.min(2, L.barbHexes.length), from = L.barbHexes.slice(0, nf);
        return { type: 'treason', from, to: L.treasonTargets.filter(h => !from.includes(h)).slice(0, 2) };
      }
      case 'moveKnights': {
        const mv = Object.entries(L.knightMoves || {}).filter(([e]) => (L.knightsOnCastle || []).includes(+e) || Math.random() < 0.4);
        if (mv.length) { const [e, o] = pick(mv); return { type: 'moveKnight', from: +e, to: pick([...o.near, ...o.far]) }; }
        return { type: 'knightsDone' };
      }
      case 'moveBarb': return { type: 'moveBarb', from: pick(L.barbMoves.from), to: pick(L.barbMoves.to) };
      case 'moveWagon': {
        const W = L.wagon;
        if (W.placing) return { type: 'wagonBarbTo', to: pick(W.barbTargets) };
        if (W.steps.length && Math.random() < 0.85) return { type: 'wagonStep', to: pick(W.steps).to };
        return { type: 'wagonDone' };
      }
      case 'masterMerchant': {
        const r = v.reveal; const tot = [...Object.values(r.res), ...Object.values(r.comm)].reduce((a, b) => a + b, 0);
        return { type: 'takeCards', cards: cardsFrom(r, Math.min(2, tot)) };
      }
    }
    return null;
  }
  if (v.pending.length) return null;
  if (v.trade && v.trade.from !== v.me && !(v.me in v.trade.responses)) {
    return { type: 'respondTrade', id: v.trade.id, accept: has(me, v.trade.get) && Math.random() < 0.5 };
  }
  if (v.step === 'sbp') {
    if (v.sbp.queue[0] !== v.me) return null;
    if (L.cities?.length) return { type: 'buildCity', v: pick(L.cities) };
    if (L.settlements?.length) return { type: 'buildSettlement', v: pick(L.settlements) };
    return { type: 'endSpecialBuild' };
  }
  if (v.current !== v.me) return null;
  if (v.step === 'roll') return { type: 'roll' };
  if (v.free.roads > 0) return L.roads?.length ? { type: 'buildRoad', e: pick(L.roads) } : { type: 'skipFreeRoads' };
  if (L.wonders) { if (L.wonders.start.length) return { type: 'startWonder', wonder: pick(L.wonders.start) }; if (L.wonders.build) return { type: 'buildWonder' }; }
  if (L.cities?.length) return { type: 'buildCity', v: pick(L.cities) };
  if (L.settlements?.length) return { type: 'buildSettlement', v: pick(L.settlements) };
  if (L.improve) for (const [t, o] of Object.entries(L.improve)) if (o.ok) return { type: 'improve', track: t };
  if (L.knightSpots?.length && Math.random() < 0.5) return { type: 'buildKnight', v: pick(L.knightSpots) };
  if (L.knights) for (const [kv, k] of Object.entries(L.knights)) {
    if (k.activate) return { type: 'activateKnight', v: +kv };
    if (k.chase && Math.random() < 0.5) return { type: 'chaseRobber', v: +kv };
  }
  if (L.canBuyDev && Math.random() < 0.6) return { type: 'buyDev' };
  const playable = (me.dev || []).find(d => !d.fresh && d.type !== 'victoryPoint' && d.type !== 'goodTrip');
  if (playable && !v.flags.devPlayed) return { type: 'playDev', card: playable.type, a: pick(RES), b: pick(RES), res: pick(RES) };
  if (L.roads?.length && Math.random() < 0.5) return { type: 'buildRoad', e: pick(L.roads) };
  if (L.ships?.length && Math.random() < 0.6) return { type: 'buildShip', e: pick(L.ships) };
  if (L.bridges?.length && Math.random() < 0.5) return { type: 'buildBridge', e: pick(L.bridges) };
  if (L.moveShips) { const ms = Object.entries(L.moveShips).filter(([, to]) => to.length); if (ms.length && Math.random() < 0.35) { const [from, to] = pick(ms); return { type: 'moveShip', from: +from, to: pick(to) }; } }
  if (L.deliver) for (const [kind, ok] of Object.entries(L.deliver)) if (ok) return { type: 'deliver', kind };
  if (L.lairs?.length) return { type: 'attackLair', hex: pick(L.lairs) };
  if (L.upgrade && Math.random() < 0.6) return { type: 'upgradeWagon' };
  if (L.repair?.ok) return { type: 'repairRoad', e: pick(L.repair.edges) };
  if (L.goldTrade && Math.random() < 0.5) return { type: 'goldTrade', res: pick(RES) };
  if (L.fish) for (const w of ['dev', 'road', 'take']) if (L.fish[w] && w !== 'take') return { type: 'useFish', what: w, res: pick(RES), target: pick(v.players.map((_, i) => i).filter(i => i !== v.me)) };
  if (L.ratios) {
    for (const [t, r] of Object.entries(L.ratios)) {
      const h = (me.res[t] ?? me.comm?.[t]) || 0;
      if (RES.includes(t) && h >= r + 1) return { type: 'bankTrade', give: t, get: pick(RES.filter(x => x !== t)) };
    }
  }
  return { type: 'endTurn' };
}

module.exports = { decide };
