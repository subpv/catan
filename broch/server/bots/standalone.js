'use strict';
// Bots for the standalone games in the demo build: one decision per call.
const EUP_BOT = require('./fuzz-explorers.js');
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
    const CARDS = ['wood', 'clay', 'fiber', 'food', 'metal', 'research'];
    if (L.setupSpots) return { type: 'placeSettlement', v: bestSpot(v, L.setupSpots) };
    if (L.setupRoads) return { type: 'placeRoad', e: pick(L.setupRoads) };
    const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === v.me)[0];
    if (mine) {
      if (mine.type === 'discard') return { type: 'discard', cards: discardCards(v, mine.count, CARDS) };
      if (mine.type === 'inspector') {
        const hs = Object.keys(L.inspector || {}).map(Number);
        const theirs = hs.filter(h => (L.inspector[h] || []).length && !v.board.hexes[h].verts.some(x => v.buildings[x] && v.buildings[x].p === v.me));
        const h = theirs.length ? pick(theirs) : pick(hs);
        const vs = L.inspector[h] || [];
        return { type: 'moveInspector', h, victim: vs.length ? pick(vs) : undefined };
      }
      if (mine.type === 'takeCard') return { type: 'takeCard', key: res.research < 3 && (L.take || []).includes('research') ? 'research' : pick(L.take || CARDS) };
      if (mine.type === 'dropCard') { const k = CARDS.slice().sort((a, b) => (res[b] || 0) - (res[a] || 0))[0]; return { type: 'dropCard', key: k }; }
      if (mine.type === 'placeDamage') return { type: 'placeDamage', v: pick(mine.options) };
      if (mine.type === 'freePlant') { const sp = Object.entries(L.plantSpots || {}); if (sp.length) { const [bv, hs] = pick(sp); return { type: 'buildPlant', kind: 'brown', v: +bv, h: pick(hs) }; } return { type: 'skipPlant' }; }
      if (mine.type === 'freeRoad') return L.roads && L.roads.length ? { type: 'buildRoad', e: pick(L.roads) } : { type: 'skipRoads' };
      return null;
    }
    if (v.phase !== 'play' || v.pending.length || v.current !== v.me) return null;
    const dev = L.dev || {};
    if (L.playDev && L.playDev.freeSeat && !v.flags.devPlayed) {
      if (dev.funding && dev.funding.playable) return { type: 'playDev', card: 'funding', take: v.bank.research >= 2 ? { research: 2 } : { [pick(['wood', 'clay', 'fiber', 'food', 'metal'].filter(k => v.bank[k] > 1))]: 2 } };
      if (dev.boost && dev.boost.playable && L.playDev.greenHexes.length) return { type: 'playDev', card: 'boost', hexes: L.playDev.greenHexes.slice(0, 3) };
      if (dev.roadBuilding && dev.roadBuilding.playable && L.playDev.roadSpots && me.pieces.roads > 3) return { type: 'playDev', card: 'roadBuilding' };
      if (dev.protection && dev.protection.playable) {
        if (L.playDev.damages.length) { const d = L.playDev.damages[0]; return { type: 'playDev', card: 'protection', mode: 'remove', target: d, victim: L.playDev.worse[0] }; }
        const hs = Object.keys(L.playDev.inspector).map(Number).filter(h => L.playDev.inspector[h].length);
        if (hs.length) { const h = pick(hs); return { type: 'playDev', card: 'protection', mode: 'move', h, victim: pick(L.playDev.inspector[h]) }; }
      }
    }
    if (v.step === 'roll') return L.draw ? { type: 'drawChips' } : { type: 'roll' };
    if (L.damages && L.damages.length && me.energy >= 1 && me.energy + 0 >= 3) return { type: 'removeDamage', ...L.damages[0] };
    if (L.warehouse && me.energy >= 2 && me.cards >= 6) return { type: 'buyWarehouse' };
    if (L.cities && L.cities.length) return { type: 'buildCity', v: pick(L.cities) };
    if (L.settlements && L.settlements.length) return { type: 'buildSettlement', v: bestSpot(v, L.settlements) };
    const spots = Object.entries(L.plantSpots || {});
    if (spots.length && L.plantLeft) {
      const [bv, hexes] = pick(spots);
      if (res.research >= 3 && L.plantLeft.green > 0 && (me.tab.green <= me.tab.brown + 1 || Math.random() < 0.5)) return { type: 'buildPlant', kind: 'green', v: +bv, h: pick(hexes) };
      if (res.research >= 1 && L.plantLeft.brown > 0 && me.tab.brown < 2 && Math.random() < 0.35) return { type: 'buildPlant', kind: 'brown', v: +bv, h: pick(hexes) };
    }
    if (me.tab.cities >= 1 && res.metal && res.fiber && res.food && Math.random() < 0.5 && v.energies.deck > 0) return { type: 'buyDev' };
    if (L.roads && L.roads.length && me.pieces.roads > 8 && res.wood > 1 && res.clay > 1) return { type: 'buildRoad', e: pick(L.roads) };
    if (me.energy >= 2) return { type: 'bankTrade', give: 'energy', get: v.bank.research > 0 ? 'research' : pick(['wood', 'clay', 'fiber', 'food', 'metal'].filter(k => v.bank[k] > 0)) };
    for (const k of ['wood', 'clay', 'fiber', 'food', 'metal']) if (res[k] >= 5 && L.ratios && L.ratios[k] <= 4 && v.bank.research > 0) return { type: 'bankTrade', give: k, get: 'research' };
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

const IK = ['timber', 'stone', 'fleece', 'metal', 'potato', 'catch', 'coca', 'feathers'];
BOTS.inkas = function inkas(v) {
  const L = v.legal || {}, me = v.players[v.me], res = me.res || {};
  if (L.setupSpots) return { type: 'placeSettlement', v: bestSpot(v, L.setupSpots) };
  if (L.setupRoads) return { type: 'placeRoad', e: pick(L.setupRoads) };
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === v.me)[0];
  if (mine && mine.type === 'discard') return { type: 'discard', cards: discardCards(v, mine.count, IK) };
  if (mine && mine.type === 'robber') {
    // away from the bot's own buildings, onto a field next to a rival
    const hs = Object.keys(L.robber || {}).map(Number);
    const own = h => v.board.hexes[h].verts.some(x => v.buildings[x] && v.buildings[x].p === v.me);
    const good = hs.filter(h => !own(h) && L.robber[h].length), rest = hs.filter(h => !own(h));
    const h = good.length ? pick(good) : pick(rest.length ? rest : hs);
    const vs = L.robber[h] || [];
    return { type: 'moveRobber', h, victim: vs.length ? pick(vs) : undefined };
  }
  if (mine && mine.type === 'found') return { type: 'foundTribe', v: bestSpot(v, L.found) };
  if (mine && mine.type === 'freeroad') return L.roads && L.roads.length ? { type: 'placeFreeRoad', e: pick(L.roads) } : { type: 'skipFreeRoad' };
  if (v.phase !== 'play' || v.pending.length || v.current !== v.me) return null;
  if (v.step === 'roll') return { type: 'roll' };
  if (L.cities && L.cities.length) return { type: 'buildCity', v: pick(L.cities) };
  if (L.settlements && L.settlements.length) return { type: 'buildSettlement', v: bestSpot(v, L.settlements) };
  if (L.roads && L.roads.length && me.pieces.roads > 2 && res.timber > 1 && res.stone > 1) return { type: 'buildRoad', e: pick(L.roads) };
  if (L.canBuy && Math.random() < 0.5) return { type: 'buyCard' };
  if (L.cards && L.cards.combat && me.dev && me.dev.combat && Math.random() < 0.7) return { type: 'playCard', card: 'combat' };
  for (const k of IK) { const r = L.ratios && L.ratios[k]; if (r && res[k] >= r + 1 && Math.random() < 0.6) return { type: 'bankTrade', give: k, get: pick(['timber', 'stone', 'potato', 'fleece', 'metal']) }; }
  return { type: 'endTurn' };
};

// Explorers & Pirates: the fuzzer's bot proposes moves, one of them is played
BOTS.explorers = function explorers(v) {
  const c = EUP_BOT(v, v.me).filter(Boolean);
  return c.length ? pick(c) : null;
};

function decide(v) {
  if (v.phase === 'over') return null;
  const bot = BOTS[v.mode];
  return bot ? bot(v) : null;
}

module.exports = { decide };
