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

const HK = ['fur', 'bone', 'meat', 'flint'];
// walking distance (in crossings) from a crossing to the nearest one that satisfies `goal`
function hkDist(v, from, goal) {
  const seen = new Map([[from, 0]]);
  let layer = [from];
  const adj = v.hkAdj || (v.hkAdj = (() => { const a = v.board.vertices.map(() => []); v.board.edges.forEach(e => { a[e.v[0]].push(e.v[1]); a[e.v[1]].push(e.v[0]); }); return a; })());
  while (layer.length) {
    const next = [];
    for (const x of layer) { if (goal(x)) return seen.get(x); for (const y of adj[x]) if (!seen.has(y)) { seen.set(y, seen.get(x) + 1); next.push(y); } }
    layer = next;
  }
  return 99;
}
BOTS.humankind = function humankind(v) {
  const L = v.legal || {}, me = v.players[v.me], res = me.res || {}, hk = v.humankind;
  if (L.setupCamps && L.setupCamps.length) return { type: 'placeCamp', v: bestSpot(v, L.setupCamps) };
  if (L.setupExplorers && L.setupExplorers.length) return { type: 'placeExplorer', v: pick(L.setupExplorers) };
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === v.me)[0];
  if (mine && mine.type === 'discard') return { type: 'discard', cards: discardCards(v, mine.count, HK) };
  if (mine && mine.type === 'threat') {
    // the threat that blocks the most (other players' camps), never one of my own fields
    let best = null;
    for (const t of Object.keys(L.threat || {})) for (const [h, vs] of Object.entries(L.threat[t])) {
      const own = v.board.hexes[h].verts.some(x => v.buildings[x] && v.buildings[x].p === v.me);
      const sc = (vs.length ? 3 : 0) + v.board.hexes[h].verts.filter(x => v.buildings[x] && v.buildings[x].p !== v.me).length - (own ? 5 : 0) + Math.random();
      if (!best || sc > best.sc) best = { sc, type: 'moveThreat', threat: t, h: +h, victim: vs.length ? pick(vs) : undefined };
    }
    if (best) { delete best.sc; return best; }
    return { type: 'skipThreat' };
  }
  if (mine && mine.type === 'erode') return { type: 'erode', h: pick(L.erode) };
  if (v.phase !== 'play' || v.pending.length || v.current !== v.me) return null;
  if (v.step === 'roll') return { type: 'roll' };
  if (L.camps && L.camps.length) return { type: 'buildCamp', v: L.camps[0], remove: L.campRemove ? pick(L.campRemove) : undefined };
  // keep climbing: Clothing and Construction open the discovery fields, Food lengthens the walk
  const adv = ['clothing', 'construction', 'food', 'hunt'].filter(k => L.advance && L.advance[k] && HK.every(r => (res[r] || 0) >= (L.advance[k].cost[r] || 0)));
  if (adv.length && Math.random() < 0.7) return { type: 'advance', track: adv[0] };
  const siteDist = x => hkDist(v, x, y => !!hk.sites[y]);
  const movers = Object.entries(L.moves || {});
  if (movers.length && (res.fur || res.meat)) {
    const [from, dests] = pick(movers);
    const best = dests.slice().sort((a, b) => siteDist(a) - siteDist(b) || Math.random() - 0.5)[0];
    if (siteDist(best) < siteDist(+from)) return { type: 'moveExplorer', from: +from, to: best, pay: (res.fur || 0) >= (res.meat || 0) ? 'fur' : 'meat' };
  }
  if (L.explorerSpots && L.explorerSpots.length && me.pieces.explorers > 0) {
    const best = L.explorerSpots.slice().sort((a, b) => hkDist(v, a, y => !!hk.sites[y]) - hkDist(v, b, y => !!hk.sites[y]))[0];
    return { type: 'placeExplorer', v: best };
  }
  const r = HK.find(k => (res[k] || 0) >= 5);
  if (r) return { type: 'bankTrade', give: r, get: pick(HK.filter(k => k !== r)) };
  return { type: 'endTurn' };
};

const IK = ['catch', 'feathers', 'coca', 'nugget'];
BOTS.inkas = function inkas(v) {
  const L = v.legal || {}, me = v.players[v.me], res = me.res || {};
  if (L.setupSpots) return { type: 'placeSettlement', v: bestSpot(v, L.setupSpots) };
  if (L.setupRoads) return { type: 'placeRoad', e: pick(L.setupRoads) };
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === v.me)[0];
  if (mine && mine.type === 'discard') return { type: 'discard', cards: discardCards(v, mine.count, IK) };
  if (mine && mine.type === 'thicket') {
    const hs = Object.keys(L.thicket || {}).map(Number);
    const theirs = hs.filter(h => !v.board.hexes[h].verts.some(x => v.buildings[x] && v.buildings[x].p === v.me));
    const h = theirs.length ? pick(theirs) : pick(hs);
    const vs = L.thicket[h] || [];
    return { type: 'growThicket', h, victim: vs.length ? pick(vs) : undefined };
  }
  if (v.phase !== 'play' || v.pending.length || v.current !== v.me) return null;
  if (v.step === 'roll') return { type: 'roll' };
  if (L.tribute && L.tribute.can) return { type: 'tribute' };
  if (L.clear && L.clear.length && L.clearCost && Math.random() < 0.7) return { type: 'clearThicket', h: pick(L.clear) };
  if (L.cities && L.cities.length) return { type: 'buildCity', v: pick(L.cities) };
  if (L.settlements && L.settlements.length) return { type: 'buildSettlement', v: bestSpot(v, L.settlements) };
  if (L.roads && L.roads.length && me.pieces.roads > 11 && res.coca > 2) return { type: 'buildRoad', e: pick(L.roads) };
  return { type: 'endTurn' };
};

export function decide(v) {
  if (v.phase === 'over') return null;
  const bot = BOTS[v.mode];
  return bot ? bot(v) : null;
}
