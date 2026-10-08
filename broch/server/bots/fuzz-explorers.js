'use strict';
// A random bot for Explorers & Pirates: returns every move worth trying (the fuzzer tries them in random order).
// It leans towards what wins: harbor settlements, settlements, explorers, missions.
const pick = a => a[Math.floor(Math.random() * a.length)];
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];

module.exports = function candidates(v, p) {
  const L = v.legal || {}, out = [], me = v.players[p];
  if (L.setupSpots && L.setupSpots.length) out.push({ type: 'placeSettlement', v: pick(L.setupSpots) });
  if (L.setupRoads && L.setupRoads.length) out.push({ type: 'placeRoad', e: pick(L.setupRoads) });
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === p);
  for (const it of mine) {
    if (it.type === 'discard') {
      const pool = [];
      for (const k of RES) for (let i = 0; i < (me.res[k] || 0); i++) pool.push(k);
      const c = {};
      for (let i = 0; i < it.count; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
      out.push({ type: 'discard', cards: c });
    }
    if (it.type === 'pirate' && L.pirateHexes && L.pirateHexes.length) out.push({ type: 'movePirate', hex: pick(L.pirateHexes) });
    if (it.type === 'steal') out.push({ type: 'steal', from: pick(it.options) });
  }
  if (v.phase !== 'play' || v.pending.length || v.current !== p) return out;
  if (v.step === 'roll') { out.push({ type: 'roll' }); return out; }
  if (v.step === 'main') {
    const x = v.exp;
    if (L.harbors && L.harbors.length) out.push({ type: 'buildHarbor', v: pick(L.harbors) }, { type: 'buildHarbor', v: pick(L.harbors) });
    if (L.settlements && L.settlements.length) out.push({ type: 'buildSettlement', v: pick(L.settlements) }, { type: 'buildSettlement', v: pick(L.settlements) });
    if (L.roads && L.roads.length) out.push({ type: 'buildRoad', e: pick(L.roads) });
    if (L.explorer && L.explorer.length) out.push({ type: 'buildExplorer', target: pick(L.explorer) });
    if (L.unit && L.unit.length) out.push({ type: 'buildUnit', target: pick(L.unit) }, { type: 'buildUnit', target: pick(L.unit) });
    if (L.ships && L.ships.edges.length) out.push({ type: 'buildShip', e: pick(L.ships.edges), remove: L.ships.replace ? pick(L.ships.replace) : undefined });
    const gold = me.res.gold || 0;
    if (L.ratios) {
      for (const k of RES) if ((me.res[k] || 0) >= 3 && Math.random() < 0.3) out.push({ type: 'bankTrade', give: k, get: Math.random() < 0.5 ? 'gold' : pick(RES) });
      if (gold >= 2 && L.ratios.gold) out.push({ type: 'bankTrade', give: 'gold', get: pick(RES) });
    }
    if (L.goodGold > 0) out.push({ type: 'goodGold', res: pick(RES) });
    out.push({ type: 'startMove' }, { type: 'startMove' }, { type: 'startMove' });
    return out;
  }
  if (v.step === 'move') {
    const bd = v.board;
    const fogVerts = new Set();
    bd.hexes.forEach(h => { if (h.hidden) h.verts.forEach(i => fogVerts.add(i)); });
    for (const [id, o] of Object.entries(L.ship || {})) {
      const ship = +id;
      if (o.settle) out.push({ type: 'settle', ship, v: pick(o.settle) }, { type: 'settle', ship, v: pick(o.settle) });
      if (o.lairs) o.lairs.forEach(hex => out.push({ type: 'dropUnits', ship, hex }, { type: 'dropUnits', ship, hex }));
      if (o.villages) o.villages.forEach(hex => out.push({ type: 'dropVillage', ship, hex }, { type: 'dropVillage', ship, hex }));
      if (o.pick) o.pick.forEach(hex => out.push({ type: 'pickUnits', ship, hex }));
      if (o.catch) o.catch.forEach(hex => out.push({ type: 'catchFish', ship, hex }, { type: 'catchFish', ship, hex }));
      if (o.deliver != null) out.push({ type: 'deliver', ship }, { type: 'deliver', ship });
      if (o.attack) out.push({ type: 'attackPirate', ship });
      if (o.extend && Math.random() < 0.3) out.push({ type: 'buyMoves', ship });
      if (o.swap) {
        const b = v.buildings[o.swap[0]];
        const cargo = (b && b.cargo) || [];
        out.push({ type: 'swap', ship, v: o.swap[0], take: cargo.map((_, i) => i).slice(0, 2), give: [] });
        if (Math.random() < 0.3) out.push({ type: 'swap', ship, v: o.swap[0], take: [], give: [0, 1].slice(0, o.cargo) });
      }
      if (o.moves) {
        const dests = Object.keys(o.moves).map(Number);
        const explore = dests.filter(e => bd.edges[e].v.some(i => fogVerts.has(i)));
        if (explore.length) out.push({ type: 'sail', ship, to: pick(explore) }, { type: 'sail', ship, to: pick(explore) });
        out.push({ type: 'sail', ship, to: pick(dests) });
      }
    }
    if (L.rollFish) out.push({ type: 'rollFish' });
    out.push({ type: 'endTurn' }, { type: 'endTurn' });
  }
  return out;
};
