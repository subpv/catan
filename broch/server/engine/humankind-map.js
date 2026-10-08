'use strict';
// The world of CATAN - Aufbruch der Menschheit (Dawn of Humankind), rebuilt from the pictures in the rulebook (pages 2-5).
//
// 49 landscape fields on one flat-topped hex grid (hex radius 1): column c, row q (q has the parity of c), centre
// x = 1.5 c, y = (sqrt 3 / 2) q. North is up, like on the board. The continents are Africa (13 fields), Europe and Asia
// (18, one landmass), Australia (5) and North/South America (13). Every crossing (Kreuzung) is a corner of a field;
// the glacier in the north and the open sea add a few more crossings (the discovery fields on the ice, the stepping
// stones between Asia and Australia). Paths (Wege) run along the field edges, except along the glacier and across the
// "African border" (the strait between Africa and Europe), and along the extra links listed here.
//
// What the pictures do not show exactly is listed in the README (a few numbers hidden behind labels, the exact
// conditions of one discovery field, which of the two landscapes the 10 field in Asia is).

const SQ3 = Math.sqrt(3);
const CORNER = { E: 0, SE: 60, SW: 120, W: 180, NW: 240, NE: 300 };
const CORNERS = ['E', 'SE', 'SW', 'W', 'NW', 'NE']; // clockwise on the screen, y points down

const TERRAIN = { W: 'forest', O: 'wasteland', G: 'grassland', B: 'mountains' };
// what each landscape yields
const TERRAIN_RES = { forest: 'fur', wasteland: 'bone', grassland: 'meat', mountains: 'flint' };

// [column, row, landscape, number chip, region]
const HEXES = [
  // Africa: the 13 chips of the box (2 3 4 5 6 6 8 8 9 9 10 11 12) sit here
  [0, 0, 'O', 3, 'africa'], [0, 2, 'W', 8, 'africa'], [1, -1, 'B', 10, 'africa'], [1, 1, 'G', 4, 'africa'],
  [2, 0, 'O', 6, 'africa'], [2, 2, 'G', 12, 'africa'], [2, 4, 'B', 6, 'africa'], [2, 6, 'W', 9, 'africa'],
  [3, -1, 'O', 2, 'africa'], [3, 1, 'B', 9, 'africa'], [3, 3, 'W', 11, 'africa'], [3, 5, 'O', 5, 'africa'], [4, 2, 'G', 8, 'africa'],
  // Europe
  [1, -3, 'O', 5, 'europe'], [2, -4, 'W', 4, 'europe'], [3, -3, 'W', 3, 'europe'], [3, -5, 'G', 6, 'europe'],
  [4, -4, 'G', 9, 'europe'], [4, -2, 'O', 4, 'europe'], [4, -6, 'W', 10, 'europe'], [5, -1, 'G', 11, 'europe'],
  // Asia
  [5, -3, 'B', 8, 'asia'], [5, -7, 'G', 3, 'asia'], [5, -5, 'O', 11, 'asia'], [6, -6, 'G', 10, 'asia'],
  [6, -4, 'B', 4, 'asia'], [6, -2, 'W', 5, 'asia'], [6, 0, 'O', 9, 'asia'], [7, -7, 'G', 12, 'asia'],
  [7, -5, 'W', 6, 'asia'], [7, -3, 'W', 2, 'asia'],
  // Australia
  [7, 3, 'O', 8, 'australia'], [8, 4, 'B', 5, 'australia'], [7, 5, 'G', 4, 'australia'], [9, 5, 'O', 2, 'australia'], [8, 6, 'W', 9, 'australia'],
  // North America
  [10, -6, 'B', 3, 'namerica'], [10, -4, 'B', 6, 'namerica'], [10, -2, 'O', 4, 'namerica'], [11, -5, 'W', 11, 'namerica'],
  [11, -3, 'G', 3, 'namerica'], [11, -1, 'W', 9, 'namerica'], [12, -4, 'O', 8, 'namerica'],
  // South America
  [12, 0, 'W', 4, 'samerica'], [12, 2, 'B', 3, 'samerica'], [12, 4, 'B', 10, 'samerica'], [12, 6, 'B', 9, 'samerica'],
  [13, 1, 'G', 8, 'samerica'], [13, 3, 'W', 5, 'samerica'],
];

// crossings that are not corners of the 49 fields: the glacier fields with a discovery tile, the stepping stones at sea
const NODES = {
  ewc: { x: 2.0, y: -5.196, kind: 'ice' }, eni: { x: 3.5, y: -6.062, kind: 'ice' },
  abr: { x: 12.5, y: -6.062, kind: 'ice' }, bri: { x: 13.0, y: -5.196, kind: 'ice' },
  n1: { x: 14.0, y: -6.928, kind: 'ice' }, n2: { x: 16.0, y: -6.928, kind: 'ice' }, n3: { x: 17.5, y: -6.062, kind: 'ice' },
  aua: { x: 11.2, y: 0.0, kind: 'sea' }, s1: { x: 11.6, y: 0.84, kind: 'sea' },
  aub: { x: 13.2, y: -0.2, kind: 'sea' }, s2: { x: 12.6, y: 0.84, kind: 'sea' }, s3: { x: 13.1, y: 1.78, kind: 'sea' },
  s4: { x: 14.15, y: 1.72, kind: 'sea' }, auc: { x: 14.8, y: 0.7, kind: 'sea' },
  s5: { x: 15.5, y: 4.31, kind: 'sea' }, aud: { x: 16.2, y: 3.29, kind: 'sea' },
};

// a crossing is [c, q, corner] (a corner of a field) or the name of a NODES entry
const WEGE_EXTRA = [ // extra paths
  [[2, -4, 'NW'], 'ewc'], [[3, -5, 'NW'], 'eni'],                       // spurs onto the glacier (Europe)
  [[7, -7, 'E'], 'abr'], ['abr', 'bri'], ['bri', [10, -6, 'W']],         // Asia - Alaska over the Bering land bridge
  [[10, -6, 'NW'], 'n1'], [[10, -6, 'NE'], 'n2'], [[11, -5, 'NE'], 'n3'], // spurs onto the glacier (North America)
  [[6, 0, 'E'], 'aua'], ['aua', 's1'], ['s1', [7, 3, 'NE']],              // Asia - Australia across the sea
  [[8, 4, 'NE'], 's3'], ['s3', 's2'], ['s2', 'aub'], ['s3', 's4'], ['s4', 'auc'],
  [[9, 5, 'E'], 's5'], ['s5', 'aud'],
];

// the African border: no path crosses these field edges (the strait between Africa and Europe)
const BORDER = [[[1, -1], [1, -3]], [[3, -1], [3, -3]], [[3, -1], [4, -2]]];
// the glacier side of these fields has no path
const NO_TOP = [[4, -6], [5, -7], [6, -6], [7, -7], [10, -6], [11, -5]];

// camp sites (Lagerplatz-Plättchen) per board side (3 players: fewer sites). Colour = region of the symbol.
const SITES = {
  3: {
    europe: [[1, -3, 'E'], [2, -4, 'E'], [3, -3, 'E'], [4, -4, 'E'], [5, -1, 'E']],
    asia: [[4, -6, 'E'], [5, -5, 'E'], [5, -3, 'E'], [6, -6, 'E'], [6, -4, 'E']],
    australia: [[7, 3, 'E'], [7, 3, 'SW'], [7, 5, 'E'], [8, 4, 'E'], [8, 6, 'E']],
    america: [[10, -6, 'SE'], [11, -5, 'SE'], [10, -2, 'E'], [12, 0, 'E'], [12, 2, 'SE'], [12, 6, 'E']],
  },
  4: {
    europe: [[1, -3, 'E'], [2, -4, 'E'], [3, -5, 'E'], [3, -3, 'E'], [3, -1, 'E'], [4, -4, 'E'], [4, -2, 'E'], [5, -1, 'E']],
    asia: [[4, -6, 'E'], [5, -5, 'E'], [5, -3, 'E'], [6, -6, 'E'], [6, -4, 'E'], [6, -2, 'E'], [7, -5, 'E'], [7, -3, 'E']],
    australia: [[7, 3, 'E'], [7, 3, 'SW'], [7, 3, 'NW'], [7, 5, 'E'], [7, 5, 'SW'], [8, 4, 'E'], [8, 6, 'E'], [8, 6, 'SW']],
    america: [[10, -6, 'SE'], [10, -4, 'SE'], [10, -2, 'SE'], [11, -5, 'SE'], [12, 0, 'E'], [12, 2, 'E'], [12, 2, 'SW'], [12, 6, 'E'], [13, 1, 'E']],
  },
};

// the Startplätze in Africa (hand symbol): every start camp of the printed set-ups sits on one
const STARTS = [[0, 0, 'E'], [0, 0, 'SW'], [0, 0, 'NW'], [0, 2, 'E'], [0, 2, 'SW'], [1, -1, 'E'], [1, 1, 'E'], [2, 0, 'E'], [2, 2, 'E'],
  [2, 2, 'SW'], [2, 4, 'E'], [2, 6, 'E'], [2, 6, 'SW'], [3, 1, 'E'], [3, 3, 'E'], [3, 5, 'E'], [4, 2, 'E']];
// the printed start (pages 2-5): three camps and one explorer per colour (the fourth set only with 4 players)
const STANDARD = [
  { camps: [[0, 0, 'NW'], [3, 1, 'E'], [2, 4, 'E']], explorer: [3, -1, 'SE'] },
  { camps: [[1, -1, 'E'], [3, 3, 'E'], [2, 6, 'E']], explorer: [1, -1, 'SE'] },
  { camps: [[2, 0, 'E'], [0, 2, 'E'], [3, 5, 'E']], explorer: [2, 0, 'NE'] },
  { camps: [[0, 0, 'SW'], [1, 1, 'E'], [2, 2, 'E']], explorer: [2, 0, 'SE'] },
];

// the 18 discovery fields: crossing, region of the tile, needed levels of Clothing (kl) and Construction (ko)
const DFS = [
  { at: [1, -3, 'W'], region: 'europe', kl: 1, ko: 0 }, { at: 'ewc', region: 'europe', kl: 1, ko: 1 },
  { at: 'eni', region: 'europe', kl: 2, ko: 1 }, { at: [4, -6, 'NW'], region: 'europe', kl: 1, ko: 2 },
  { at: [5, -7, 'NW'], region: 'asia', kl: 2, ko: 2 }, { at: [5, -7, 'NE'], region: 'asia', kl: 3, ko: 2 },
  { at: [7, -7, 'NW'], region: 'asia', kl: 2, ko: 3 }, { at: 'abr', region: 'asia', kl: 3, ko: 1 },
  { at: 'aua', region: 'australia', kl: 1, ko: 3 }, { at: 'aub', region: 'australia', kl: 2, ko: 3 },
  { at: 'auc', region: 'australia', kl: 3, ko: 4 }, { at: 'aud', region: 'australia', kl: 4, ko: 4 },
  { at: 'n1', region: 'namerica', kl: 4, ko: 2 }, { at: 'n2', region: 'namerica', kl: 4, ko: 3 }, { at: 'n3', region: 'namerica', kl: 4, ko: 4 },
  { at: [12, 0, 'SW'], region: 'samerica', kl: 3, ko: 3 }, { at: [12, 4, 'SE'], region: 'samerica', kl: 3, ko: 4 }, { at: [12, 6, 'W'], region: 'samerica', kl: 4, ko: 3 },
];

// the five hunting markers lie on clouds in the sea (centre in board units)
const CLOUDS = { europe: [0.1, -4.98], asia: [12.4, -3.8], australia: [9.2, 6.0], namerica: [20.5, -3.07], samerica: [20.4, 6.0] };
// where the two threats wait on the glacier before they are moved for the first time
const THREAT_HOME = { neanderthal: [4.9, -7.9], tiger: [18.7, -6.9] };

// ------------------------------------------------------------------ geometry
const corner = (c, q, k) => {
  const a = Math.PI / 180 * CORNER[k];
  return [1.5 * c + Math.cos(a), SQ3 / 2 * q + Math.sin(a)];
};
const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

function buildBoard(players = 4) {
  const side = players >= 4 ? 4 : 3;
  const hexes = [];
  const vertices = [];
  const vIndex = new Map();
  const edges = [];
  const eIndex = new Map();
  const vertexAt = (x, y, kind = 'land') => {
    const k = key(x, y);
    if (!vIndex.has(k)) {
      vIndex.set(k, vertices.length);
      vertices.push({ id: vertices.length, x: +x.toFixed(3), y: +y.toFixed(3), kind, hexes: [], adj: [], edges: [] });
    }
    return vIndex.get(k);
  };
  const ref = r => {
    if (typeof r === 'string') {
      const n = NODES[r];
      if (!n) throw new Error('unknown node ' + r);
      return vertexAt(n.x, n.y, n.kind);
    }
    const [x, y] = corner(r[0], r[1], r[2]);
    return vertexAt(x, y);
  };
  const edgeOf = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!eIndex.has(k)) {
      eIndex.set(k, edges.length);
      edges.push({ id: edges.length, v: [Math.min(a, b), Math.max(a, b)] });
      vertices[a].adj.push(b); vertices[b].adj.push(a);
      vertices[a].edges.push(edges.length - 1); vertices[b].edges.push(edges.length - 1);
    }
    return eIndex.get(k);
  };
  const at = {};
  HEXES.forEach(([c, q, t, n, region]) => {
    const id = hexes.length;
    const h = { id, c, q, x: +(1.5 * c).toFixed(3), y: +(SQ3 / 2 * q).toFixed(3), terrain: TERRAIN[t], number: n, region, verts: [] };
    CORNERS.forEach(k => h.verts.push(ref([c, q, k])));
    h.verts.forEach(v => vertices[v].hexes.push(id));
    hexes.push(h);
    at[`${c},${q}`] = h;
  });
  // field edges are paths, except the border and the glacier side
  const skip = new Set();
  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const edgeBetween = (h, i) => [h.verts[i], h.verts[(i + 1) % 6]];
  const borderKeys = borderEdges(at);
  borderKeys.forEach(k => skip.add(k));
  NO_TOP.forEach(([c, q]) => { const [a, b] = edgeBetween(at[`${c},${q}`], 4); skip.add(pairKey(a, b)); });
  const border = [...borderKeys].map(k => k.split('-').map(Number));
  hexes.forEach(h => { for (let i = 0; i < 6; i++) { const [a, b] = edgeBetween(h, i); if (!skip.has(pairKey(a, b))) edgeOf(a, b); } });
  WEGE_EXTRA.forEach(([a, b]) => edgeOf(ref(a), ref(b)));

  // camp sites
  const sites = {};
  for (const [region, list] of Object.entries(SITES[side])) list.forEach(r => { sites[ref(r)] = region; });
  const starts = STARTS.map(ref);
  const standard = STANDARD.map(set => ({ camps: set.camps.map(ref), explorer: ref(set.explorer) }));
  const dfs = DFS.map((d, i) => ({ id: i, v: ref(d.at), region: d.region, kl: d.kl, ko: d.ko }));
  starts.forEach(v => { vertices[v].start = true; });
  Object.entries(sites).forEach(([v, region]) => { vertices[v].site = region; });
  dfs.forEach(d => { vertices[d.v].df = d.id; });
  return { hexes, vertices, edges, sites, starts, standard, dfs, border, side, clouds: CLOUDS, home: THREAT_HOME, ports: [] };
}
// the field edges that carry the African border, as "a-b" vertex keys
function borderEdges(at) {
  const out = new Set();
  const keys = h => Array.from({ length: 6 }, (_, i) => { const x = h.verts[i], y = h.verts[(i + 1) % 6]; return x < y ? `${x}-${y}` : `${y}-${x}`; });
  BORDER.forEach(([a, b]) => {
    const other = new Set(keys(at[`${b[0]},${b[1]}`]));
    keys(at[`${a[0]},${a[1]}`]).forEach(k => { if (other.has(k)) out.add(k); });
  });
  return out;
}

module.exports = { buildBoard, TERRAIN_RES, TERRAIN, HEXES, NODES, CLOUDS, THREAT_HOME, SQ3 };
