// Bots for the standalone games in the demo build: one decision per call.
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const pick = a => a[Math.floor(Math.random() * a.length)];
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];

function bestSpot(v, spots) {
  const score = vid => v.board.hexes.filter(h => h.verts.includes(vid)).reduce((a, h) => a + (PIPS[h.number] || 0), 0) + Math.random();
  return spots.slice().sort((a, b) => score(b) - score(a))[0];
}
function discardCards(v, count, keys) {
  const pool = [];
  for (const k of keys) for (let i = 0; i < (v.players[v.me].res[k] || 0); i++) pool.push(k);
  const c = {};
  for (let i = 0; i < count && pool.length; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
  return c;
}

const BOTS = {
  energies(v) {
    const L = v.legal || {}, me = v.players[v.me], res = me.res || {};
    if (L.setupSpots) return { type: 'placeSettlement', v: bestSpot(v, L.setupSpots) };
    if (L.setupRoads) return { type: 'placeRoad', e: pick(L.setupRoads) };
    const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === v.me)[0];
    if (mine && mine.type === 'discard') return { type: 'discard', cards: discardCards(v, mine.count, ['lumber', 'brick', 'wool', 'grain', 'ore', 'science']) };
    if (v.phase !== 'play' || v.pending.length || v.current !== v.me) return null;
    if (v.step === 'roll') return { type: 'roll' };
    if (L.hazards && L.hazards.length && res.energy >= 2) { const h = L.hazards[0]; return { type: 'removeHazard', ...(h.plant != null ? { plant: h.plant } : { v: h.v }) }; }
    if (L.cities && L.cities.length) return { type: 'buildCity', v: pick(L.cities) };
    if (L.settlements && L.settlements.length) return { type: 'buildSettlement', v: bestSpot(v, L.settlements) };
    const spots = Object.entries(L.plantSpots || {});
    if (spots.length && L.plantCost) {
      const [bv, hexes] = pick(spots);
      if (hexes.length && res.science >= L.plantCost.renewable && me.renewable <= me.fossil + 1) return { type: 'buildPlant', kind: 'renewable', v: +bv, h: pick(hexes) };
      if (hexes.length && res.science >= L.plantCost.fossil && me.fossil < 2 && Math.random() < 0.3) return { type: 'buildPlant', kind: 'fossil', v: +bv, h: pick(hexes) };
    }
    if (L.roads && L.roads.length && me.pieces.roads > 11 && res.lumber > 1 && res.brick > 1) return { type: 'buildRoad', e: pick(L.roads) };
    if (res.energy >= 4) return { type: 'bankTrade', give: 'energy', get: pick(RES) };
    return { type: 'endTurn' };
  },
};

export function decide(v) {
  if (v.phase === 'over') return null;
  const bot = BOTS[v.mode];
  return bot ? bot(v) : null;
}
