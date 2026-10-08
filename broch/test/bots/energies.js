'use strict';
// A random bot for Energiewende: returns every move worth trying.
const pick = a => a[Math.floor(Math.random() * a.length)];
module.exports = function candidates(v, p) {
  const L = v.legal || {}, out = [];
  if (L.setupSpots) out.push({ type: 'placeSettlement', v: pick(L.setupSpots) });
  if (L.setupRoads) out.push({ type: 'placeRoad', e: pick(L.setupRoads) });
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === p);
  for (const it of mine) {
    if (it.type === 'discard') {
      const pool = [];
      for (const k of ['lumber', 'brick', 'wool', 'grain', 'ore', 'science']) for (let i = 0; i < (v.players[p].res[k] || 0); i++) pool.push(k);
      const c = {};
      for (let i = 0; i < it.count; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
      out.push({ type: 'discard', cards: c });
    }
  }
  if (v.phase === 'play' && !v.pending.length && v.current === p) {
    if (v.step === 'roll') out.push({ type: 'roll' });
    if (v.step === 'main') {
      if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) });
      if (L.settlements && L.settlements.length) out.push({ type: 'buildSettlement', v: pick(L.settlements) });
      if (L.cities && L.cities.length) out.push({ type: 'buildCity', v: pick(L.cities) });
      const spots = Object.entries(L.plantSpots || {});
      if (spots.length) {
        const [bv, hexes] = pick(spots);
        if (hexes.length) { out.push({ type: 'buildPlant', kind: Math.random() < 0.5 ? 'fossil' : 'renewable', v: +bv, h: pick(hexes) }); out.push({ type: 'buildPlant', kind: 'renewable', v: +bv, h: pick(hexes) }); }
      }
      if (L.hazards && L.hazards.length) { const h = pick(L.hazards); out.push({ type: 'removeHazard', ...(h.plant != null ? { plant: h.plant } : { v: h.v }) }); }
      if (L.demolish && L.demolish.length && Math.random() < 0.2) out.push({ type: 'demolishPlant', plant: pick(L.demolish) });
      const res = v.players[p].res || {};
      for (const k of ['energy', 'science', 'lumber', 'brick', 'wool', 'grain', 'ore']) {
        const r = L.ratios && L.ratios[k];
        if (r && res[k] >= r) out.push({ type: 'bankTrade', give: k, get: pick(['lumber', 'brick', 'wool', 'grain', 'ore']) });
      }
      out.push({ type: 'endTurn' }, { type: 'endTurn' }, { type: 'endTurn' });
    }
  }
  return out;
};
