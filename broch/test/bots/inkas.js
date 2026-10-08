'use strict';
// A random bot for Rise of the Inkas: returns every move worth trying.
const pick = a => a[Math.floor(Math.random() * a.length)];
const RES = ['catch', 'feathers', 'coca', 'nugget'];
module.exports = function candidates(v, p) {
  const L = v.legal || {}, out = [];
  if (L.setupSpots) out.push({ type: 'placeSettlement', v: pick(L.setupSpots) });
  if (L.setupRoads) out.push({ type: 'placeRoad', e: pick(L.setupRoads) });
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === p);
  for (const it of mine) {
    if (it.type === 'discard') {
      const pool = [];
      for (const k of RES) for (let i = 0; i < (v.players[p].res[k] || 0); i++) pool.push(k);
      const c = {};
      for (let i = 0; i < it.count; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
      out.push({ type: 'discard', cards: c });
    }
    if (it.type === 'thicket' && L.thicket) {
      const h = pick(Object.keys(L.thicket));
      const vs = L.thicket[h];
      out.push({ type: 'growThicket', h: +h, victim: vs.length ? pick(vs) : undefined });
    }
  }
  if (v.phase === 'play' && !v.pending.length && v.current === p) {
    if (v.step === 'roll') out.push({ type: 'roll' });
    if (v.step === 'main') {
      if (L.tribute && L.tribute.can) out.push({ type: 'tribute' }, { type: 'tribute' });
      if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) });
      if (L.settlements && L.settlements.length) out.push({ type: 'buildSettlement', v: pick(L.settlements) });
      if (L.cities && L.cities.length) out.push({ type: 'buildCity', v: pick(L.cities) });
      if (L.clear && L.clear.length) out.push({ type: 'clearThicket', h: pick(L.clear) });
      const res = v.players[p].res || {};
      for (const k of RES) { const r = L.ratios && L.ratios[k]; if (r && res[k] >= r) out.push({ type: 'bankTrade', give: k, get: pick(RES) }); }
      out.push({ type: 'endTurn' }, { type: 'endTurn' }, { type: 'endTurn' });
    }
  }
  return out;
};
