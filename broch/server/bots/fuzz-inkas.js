'use strict';
// A random bot for Rise of the Inkas: returns every move worth trying (the fuzzer picks one at random).
const pick = a => a[Math.floor(Math.random() * a.length)];
const RES = ['timber', 'stone', 'fleece', 'metal', 'potato', 'catch', 'coca', 'feathers'];
function candidates(v, p) {
  const L = v.legal || {}, out = [];
  if (L.setupSpots) out.push({ type: 'placeSettlement', v: pick(L.setupSpots) });
  if (L.setupRoads) out.push({ type: 'placeRoad', e: pick(L.setupRoads) });
  const me = v.players[p], res = me.res || {};
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === p);
  for (const it of mine) {
    if (it.type === 'discard') {
      const pool = [];
      for (const k of RES) for (let i = 0; i < (res[k] || 0); i++) pool.push(k);
      const c = {};
      for (let i = 0; i < it.count; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
      out.push({ type: 'discard', cards: c });
    }
    if (it.type === 'robber' && L.robber) {
      const h = pick(Object.keys(L.robber));
      const vs = L.robber[h];
      out.push({ type: 'moveRobber', h: +h, victim: vs.length ? pick(vs) : undefined });
    }
    if (it.type === 'found' && L.found && L.found.length) out.push({ type: 'foundTribe', v: pick(L.found) });
    if (it.type === 'freeroad') {
      if (L.roads && L.roads.length) out.push({ type: 'placeFreeRoad', e: pick(L.roads) });
      out.push({ type: 'skipFreeRoad' });
    }
  }
  if (v.phase === 'play' && !v.pending.length && v.current === p) {
    const dev = me.dev || {};
    if (L.cards) {
      if (L.cards.combat && dev.combat) out.push({ type: 'playCard', card: 'combat' });
      if (L.cards.roadBuilding) out.push({ type: 'playCard', card: 'roadBuilding' });
      if (L.cards.invention) out.push({ type: 'playCard', card: 'invention', take: { [pick(RES)]: 1, [pick(RES)]: 1 } }, { type: 'playCard', card: 'invention', take: { [pick(RES)]: 2 } });
      if (L.cards.inMonopoly) out.push({ type: 'playCard', card: 'inMonopoly', res: pick(RES) });
    }
    if (L.army && L.army.length) out.push({ type: 'armyMove', h: pick(L.army) });
    if (v.step === 'roll') out.push({ type: 'roll' }, { type: 'roll' });
    if (v.step === 'main') {
      // building is what ends the game, so the bot likes it
      if (L.cities && L.cities.length) out.push({ type: 'buildCity', v: pick(L.cities) }, { type: 'buildCity', v: pick(L.cities) });
      if (L.settlements && L.settlements.length) out.push({ type: 'buildSettlement', v: pick(L.settlements) }, { type: 'buildSettlement', v: pick(L.settlements) });
      if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) });
      if (L.canBuy) out.push({ type: 'buyCard' });
      if (L.roadTrade) {
        const pool = RES.filter(k => res[k]);
        if (pool.length) {
          const a = pick(pool), g = { [a]: 1 }, rest = pool.filter(k => res[k] > (g[k] || 0)), b = pick(rest);
          if (b) { g[b] = (g[b] || 0) + 1; out.push({ type: 'roadTrade', give: g, get: pick(RES) }); }
        }
      }
      if (L.goodsTrade) out.push({ type: 'goodsTrade', get: { [pick(RES)]: 2 } }, { type: 'goodsTrade', get: { [pick(RES)]: 1, [pick(RES)]: 1 } });
      for (const k of RES) { const r = L.ratios && L.ratios[k]; if (r && res[k] >= r) out.push({ type: 'bankTrade', give: k, get: pick(RES) }, { type: 'bankTrade', give: k, get: pick(RES) }); }
      out.push({ type: 'endTurn' }, { type: 'endTurn' });
    }
  }
  return out;
}
// the fuzzer plays both ways to start: the beginner layout and the free founding phase
candidates.options = () => ({ game: { freeStart: Math.random() < 0.5 } });
module.exports = candidates;
