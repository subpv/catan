'use strict';
// Archipelago boards for the sea-based modes (Seafarers, Explorers & Pirates).
// A big hex grid is filled with islands, then trimmed to the hexes near land, then terrain and numbers are dealt.

const { geometryFromCenters, rowCenters, shuffle } = require('../shared/board');
const { BOARDS } = require('../shared/constants');

const altRows = (count, first) => Array.from({ length: count }, (_, i) => (i % 2 === 0 ? first : first - 1));

const SCENARIOS = {
  shores: { title: 'Heading for New Shores', vp: 14 },
  islands: { title: 'The Four Islands', vp: 13 },
  fog: { title: 'The Fog Islands', vp: 12 },
};

const BASE_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

function pickWeighted(items, weights, rnd = Math.random) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function layout({ scenario, players, big }) {
  const rows = big ? altRows(12, 11) : altRows(10, 9);
  const centers = rowCenters(rows);
  const full = geometryFromCenters(centers);
  const H = full.hexes;
  const ring = new Set(H.filter(h => h.neighbors.length < 6).map(h => h.id));
  const landOf = new Map();
  const islands = [];
  const canPlace = (h, id) => !ring.has(h) && !landOf.has(h) && H[h].neighbors.every(n => !landOf.has(n) || landOf.get(n) === id);

  const grow = (seed, size, id) => {
    if (!canPlace(seed, id)) return [];
    landOf.set(seed, id);
    const cells = [seed];
    while (cells.length < size) {
      const cand = [], w = [];
      for (const c of cells) for (const n of H[c].neighbors) {
        if (landOf.has(n) || !canPlace(n, id) || cand.includes(n)) continue;
        cand.push(n);
        w.push(1 + H[n].neighbors.filter(x => landOf.get(x) === id).length ** 2);
      }
      if (!cand.length) break;
      const n = pickWeighted(cand, w);
      landOf.set(n, id); cells.push(n);
    }
    return cells;
  };
  const dist2 = (a, b) => (H[a].x - H[b].x) ** 2 + (H[a].y - H[b].y) ** 2;
  const free = () => H.filter(h => canPlace(h.id, -1)).map(h => h.id);
  const addIsland = (size, min, home, seedPick) => {
    for (let k = 0; k < 80; k++) {
      const pool = free();
      if (!pool.length) return null;
      const seed = seedPick ? seedPick(pool) : pool[Math.floor(Math.random() * pool.length)];
      const id = islands.length;
      const cells = grow(seed, size, id);
      if (cells.length >= min) { islands.push({ id, cells, home }); return islands[id]; }
      cells.forEach(c => landOf.delete(c));
    }
    return null;
  };
  const R = big ? 6.2 : 5.2;
  const nearCenter = pool => { const s = pool.slice().sort((a, b) => dist2(a, 0) * 0 + (H[a].x ** 2 + H[a].y ** 2) - (H[b].x ** 2 + H[b].y ** 2)); return s[Math.floor(Math.random() * Math.min(5, s.length))]; };

  if (scenario === 'islands') {
    const homes = players <= 3 ? 2 : players <= 4 ? 3 : 4;
    const size = big ? 9 : 7;
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < homes; i++) {
      const th = off + (Math.PI * 2 * i) / homes;
      const tx = Math.cos(th) * R * 0.62, ty = Math.sin(th) * R * 0.62;
      addIsland(size, size - 2, true, pool => pool.slice().sort((a, b) => ((H[a].x - tx) ** 2 + (H[a].y - ty) ** 2) - ((H[b].x - tx) ** 2 + (H[b].y - ty) ** 2))[0]);
    }
    (big ? [3, 3, 2, 2, 2, 1, 1] : [3, 2, 2, 1, 1]).forEach(sz => addIsland(sz, 1, false));
  } else if (scenario === 'fog') {
    addIsland(big ? 20 : 14, big ? 15 : 11, true, nearCenter);
    (big ? [4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1] : [3, 3, 3, 2, 2, 2, 1, 1]).forEach(sz => addIsland(sz, 1, false));
  } else {
    addIsland(big ? 24 : 17, big ? 18 : 13, true, nearCenter);
    (big ? [4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1] : [3, 3, 2, 2, 2, 1, 1, 1]).forEach(sz => addIsland(sz, 1, false));
  }
  return { H, full, islands, landOf, ring };
}

function build({ scenario = 'shores', players = 4, big = false, explorers = false }) {
  if (!SCENARIOS[scenario]) throw new Error('Unknown scenario');
  let L = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    L = layout({ scenario, players, big });
    const homeCells = L.islands.filter(i => i.home).reduce((a, i) => a + i.cells.length, 0);
    const need = scenario === 'islands' ? (big ? 28 : 18) : (big ? 18 : 13);
    if (homeCells >= need && L.islands.length >= (scenario === 'islands' ? 4 : 3)) break;
  }
  const { H, islands, landOf } = L;
  const fog = scenario === 'fog' || explorers;

  // which old hexes become hidden
  const hidden = new Set();
  if (fog) {
    const homeIds = new Set(islands.filter(i => i.home).map(i => i.id));
    const nearHome = new Set();
    for (const [h, id] of landOf) if (homeIds.has(id)) { nearHome.add(h); H[h].neighbors.forEach(n => nearHome.add(n)); }
    for (const [h, id] of landOf) if (!homeIds.has(id)) hidden.add(h);
    H.forEach(h => { if (!landOf.has(h.id) && !L.ring.has(h.id) && !nearHome.has(h.id) && Math.random() < 0.75) hidden.add(h.id); });
  }

  // keep land, hidden hexes and the sea right next to them
  const keep = new Set([...landOf.keys(), ...hidden]);
  let frontier = [...keep];
  for (let d = 0; d < 1; d++) {
    const next = [];
    for (const h of frontier) for (const n of H[h].neighbors) if (!keep.has(n)) { keep.add(n); next.push(n); }
    frontier = next;
  }
  const order = [...keep].sort((a, b) => a - b);
  const remap = new Map(order.map((h, i) => [h, i]));
  const geo = geometryFromCenters(order.map(h => ({ x: H[h].x, y: H[h].y })));

  const landIdx = [];
  geo.hexes.forEach((h, i) => {
    const old = order[i];
    h.terrain = 'sea'; h.number = null;
    h.island = landOf.has(old) ? landOf.get(old) : null;
    h.hidden = hidden.has(old);
    if (landOf.has(old)) landIdx.push(i);
  });

  // terrain and numbers
  const homeIds = new Set(islands.filter(i => i.home).map(i => i.id));
  const homeHexes = landIdx.filter(i => homeIds.has(geo.hexes[i].island) && !geo.hexes[i].hidden);
  const awayHexes = landIdx.filter(i => !homeIds.has(geo.hexes[i].island));
  const desert = homeHexes[Math.floor(Math.random() * homeHexes.length)];
  const goldN = Math.min(awayHexes.length, big ? 5 : 3);
  const gold = new Set(shuffle(awayHexes.slice()).slice(0, goldN));
  if (gold.size < goldN) shuffle(landIdx.filter(i => i !== desert && !gold.has(i))).slice(0, goldN - gold.size).forEach(i => gold.add(i));
  const cyc = [];
  const kinds = ['forest', 'pasture', 'fields', 'hills', 'mountains'];
  const rest = landIdx.filter(i => i !== desert && !gold.has(i));
  while (cyc.length < rest.length) cyc.push(...shuffle(kinds.slice()));
  shuffle(rest).forEach((i, k) => { geo.hexes[i].terrain = cyc[k]; });
  gold.forEach(i => { geo.hexes[i].terrain = 'gold'; });
  geo.hexes[desert].terrain = 'desert';
  const numbered = landIdx.filter(i => i !== desert);
  let pool = [];
  while (pool.length < numbered.length) pool.push(...BASE_NUMBERS);
  const red = n => n === 6 || n === 8;
  let best = null;
  for (let attempt = 0; attempt < 3000; attempt++) {
    const nums = shuffle(pool.slice()).slice(0, numbered.length);
    // drop extras evenly: shuffle already randomises which ones are cut
    numbered.forEach((hi, k) => { geo.hexes[hi].number = nums[k]; });
    const bad = numbered.reduce((a, hi) => a + geo.hexes[hi].neighbors.filter(n => geo.hexes[n].number != null && (red(geo.hexes[n].number) && red(geo.hexes[hi].number) || geo.hexes[n].number === geo.hexes[hi].number)).length, 0);
    if (!best || bad < best.bad) best = { bad, nums: nums.slice() };
    if (bad === 0) break;
  }
  numbered.forEach((hi, k) => { geo.hexes[hi].number = best.nums[k]; });

  // harbors on visible coasts
  const visibleLand = h => h.terrain !== 'sea' && !h.hidden;
  const coast = geo.edges.filter(e => {
    const hs = e.hexes.map(i => geo.hexes[i]);
    const lands = hs.filter(visibleLand);
    if (lands.length !== 1) return false;
    return hs.every(h => visibleLand(h) || !h.hidden);
  });
  const portTypes = shuffle(BOARDS[big ? 'extended' : 'standard'].ports.slice());
  const used = new Set();
  const ports = [];
  const spots = [];
  const cand = shuffle(coast.slice());
  const pos = e => { const [a, b] = e.v.map(i => geo.vertices[i]); return [(a.x + b.x) / 2, (a.y + b.y) / 2]; };
  for (const e of cand) {
    if (ports.length >= portTypes.length) break;
    if (e.v.some(v => used.has(v))) continue;
    const [mx, my] = pos(e);
    if (spots.some(([x, y]) => (x - mx) ** 2 + (y - my) ** 2 < 5)) continue;
    const lh = geo.hexes[e.hexes.find(i => visibleLand(geo.hexes[i]))];
    const dx = mx - lh.x, dy = my - lh.y, d = Math.hypot(dx, dy);
    const type = portTypes[ports.length];
    ports.push({ edge: e.id, type, ratio: type === 'any' ? 3 : 2, x: +(mx + dx / d * 0.55).toFixed(3), y: +(my + dy / d * 0.55).toFixed(3) });
    e.v.forEach(v => used.add(v));
    spots.push([mx, my]);
  }
  ports.forEach(p => geo.edges[p.edge].v.forEach(v => { geo.vertices[v].port = p.type; }));

  // pirate starts on a sea hex far from the home islands
  const seaVisible = geo.hexes.filter(h => h.terrain === 'sea' && !h.hidden && h.neighbors.every(n => geo.hexes[n].terrain === 'sea' || geo.hexes[n].hidden));
  const pirate = seaVisible.length ? seaVisible[Math.floor(Math.random() * seaVisible.length)].id : null;

  return {
    kind: 'sea', scenario, hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports,
    homeIslands: [...homeIds], islandCount: islands.length, pirateStart: pirate, desert,
  };
}

module.exports = { build, SCENARIOS };
