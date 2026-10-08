'use strict';
// A random bot for New Energies: returns every move worth trying for a view.
const pick = a => a[Math.floor(Math.random() * a.length)];
const RES = ['wood', 'clay', 'fiber', 'food', 'metal'];
const CARDS = [...RES, 'research'];

function playDev(v, L, p, out) {
  const D = L.dev || {}, P = L.playDev || {};
  if (D.roadBuilding && D.roadBuilding.playable) out.push({ type: 'playDev', card: 'roadBuilding' });
  if (D.funding && D.funding.playable) out.push({ type: 'playDev', card: 'funding', take: { [pick(CARDS)]: 1, [pick(CARDS)]: 1 } }, { type: 'playDev', card: 'funding', take: { [pick(CARDS)]: 2 } });
  if (D.boost && D.boost.playable && P.greenHexes && P.greenHexes.length) out.push({ type: 'playDev', card: 'boost', hexes: P.greenHexes.slice(0, 3) });
  if (D.protection && D.protection.playable) {
    const hs = Object.keys(P.inspector || {}).map(Number);
    if (hs.length) { const h = pick(hs), vs = P.inspector[h]; out.push({ type: 'playDev', card: 'protection', mode: 'move', h, victim: vs.length ? pick(vs) : undefined }); }
    if (P.damages && P.damages.length) out.push({ type: 'playDev', card: 'protection', mode: 'remove', target: pick(P.damages), victim: P.worse.length ? pick(P.worse) : undefined });
  }
}

module.exports = function candidates(v, p) {
  const L = v.legal || {}, out = [], me = v.players[p], res = me.res || {};
  if (L.setupSpots) out.push({ type: 'placeSettlement', v: pick(L.setupSpots) });
  if (L.setupRoads) out.push({ type: 'placeRoad', e: pick(L.setupRoads) });
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === p);
  for (const it of mine) {
    if (it.type === 'discard') {
      const pool = [];
      for (const k of CARDS) for (let i = 0; i < (res[k] || 0); i++) pool.push(k);
      const c = {};
      for (let i = 0; i < it.count; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
      out.push({ type: 'discard', cards: c });
    }
    if (it.type === 'inspector') {
      const hs = Object.keys(L.inspector || {}).map(Number);
      const h = pick(hs);
      const vs = (L.inspector || {})[h] || [];
      out.push({ type: 'moveInspector', h, victim: vs.length ? pick(vs) : undefined });
    }
    if (it.type === 'takeCard') out.push({ type: 'takeCard', key: pick(L.take && L.take.length ? L.take : CARDS) });
    if (it.type === 'dropCard') out.push({ type: 'dropCard', key: pick(CARDS.filter(k => res[k] > 0)) });
    if (it.type === 'placeDamage') out.push({ type: 'placeDamage', v: pick(it.options) });
    if (it.type === 'freePlant') {
      const spots = Object.entries(L.plantSpots || {});
      if (spots.length && Math.random() < 0.8) { const [bv, hs] = pick(spots); out.push({ type: 'buildPlant', kind: 'brown', v: +bv, h: pick(hs) }); }
      out.push({ type: 'skipPlant' });
    }
    if (it.type === 'freeRoad') { if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) }); out.push({ type: 'skipRoads' }); }
  }
  if (v.phase === 'play' && !v.pending.length && v.current === p) {
    if (v.step === 'roll') {
      if (L.draw) out.push({ type: 'drawChips' });
      else out.push({ type: 'roll' });
      playDev(v, L, p, out);
    }
    if (v.step === 'main') {
      if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) });
      if (L.settlements && L.settlements.length) out.push({ type: 'buildSettlement', v: pick(L.settlements) });
      if (L.cities && L.cities.length) out.push({ type: 'buildCity', v: pick(L.cities) });
      const spots = Object.entries(L.plantSpots || {});
      if (spots.length) { const [bv, hs] = pick(spots); out.push({ type: 'buildPlant', kind: Math.random() < 0.5 ? 'brown' : 'green', v: +bv, h: pick(hs) }, { type: 'buildPlant', kind: 'green', v: +bv, h: pick(hs) }); }
      if (L.damages && L.damages.length && Math.random() < 0.5) out.push({ type: 'removeDamage', ...pick(L.damages) });
      if (L.demolish && L.demolish.length && Math.random() < 0.2) out.push({ type: 'demolishPlant', plant: pick(L.demolish) });
      if (L.warehouse) out.push({ type: 'buyWarehouse' });
      if (res.metal && res.fiber && res.food) out.push({ type: 'buyDev' });
      playDev(v, L, p, out);
      for (const k of ['energy', 'research', ...RES]) {
        const r = L.ratios && L.ratios[k];
        if (r && res[k] >= r) out.push({ type: 'bankTrade', give: k, get: pick(CARDS) });
      }
      if (v.trade && v.trade.from === p) out.push({ type: 'cancelTrade' });
      else if (!v.trade && Math.random() < 0.1) out.push({ type: 'offerTrade', give: { [pick(CARDS)]: 1 }, get: { [pick(CARDS)]: 1 } });
      out.push({ type: 'endTurn' }, { type: 'endTurn' }, { type: 'endTurn' });
    }
  }
  // answers to a trade offer
  if (v.trade && v.trade.from !== p && !(v.trade.responses[p])) out.push({ type: 'respondTrade', id: v.trade.id, accept: Math.random() < 0.7 });
  if (v.trade && v.trade.from === p) { const acc = Object.keys(v.trade.responses).filter(q => v.trade.responses[q] === 'accept'); if (acc.length) out.push({ type: 'confirmTrade', with: +pick(acc) }); }
  return out;
};
