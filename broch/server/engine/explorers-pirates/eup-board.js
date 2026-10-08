'use strict';
// Boards of Explorers & Pirates (Entdecker & Piraten), read off the rulebook's set-up pictures.
// The play field is a hexagon of pointy-top hexes in 7 rows (3-4 players) or 9 rows (5-6 players); the printed frame
// pieces lie outside of it, so the edges of the outermost hexes are the sea paths along the frame.
//   I island   . open sea   N undiscovered field of the north (parrots on the back)   S undiscovered field of the south (geese)
// A row is written from left to right; row r holds (L - |m - r|) hexes and starts |m - r| half-hexes from the left edge.

const { geometryFromCenters, shuffle } = require('../shared/board');

const SQ3 = Math.sqrt(3);

// scenario -> { m (middle row), L (hexes in the middle row), rows }
const LAYOUTS = {
  small: {
    1: { L: 9, rows: ['II..NN', 'II..NNN', 'II..N.NN', 'III......', 'II..S.SS', 'II..SSS', 'II..SS'] },
    2: { L: 10, rows: ['II..NNN', 'II..NNNN', 'II..NN.NN', 'III.......', 'II..SS.SS', 'II..SSSS', 'II..SSS'] },
    3: { L: 10, rows: ['II..NNN', 'II..NNNN', 'II..NN.NN', 'III.......', 'II..SS.SS', 'II..SSSS', 'II..SSS'] },
    4: { L: 11, rows: ['II..NNNN', 'II..NNNNN', 'II..NN.N.N', 'III........', 'II..SS.S.S', 'II..SSSSS', 'II..SSSS'] },
    5: { L: 12, rows: ['II..NNNNN', 'II..NNNNNN', 'II..NN.N.NN', 'III.........', 'II..SS.S.SS', 'II..SSSSSS', 'II..SSSSS'] },
  },
  big: {
    2: { L: 11, rows: ['II..N.N', 'II..NNNN', 'II..NNNNN', 'III..N.N.N', 'IIII.......', 'III..S.S.S', 'II..SSSSS', 'II..SSSS', 'II..S.S'] },
    3: { L: 12, rows: ['II..N.NN', 'II..NNNNN', 'II..NNN..N', 'III..N.NN.N', 'IIII........', 'III..S.SS.S', 'II..SSS..S', 'II..SSSSS', 'II..S.SS'] },
    4: { L: 12, rows: ['II..N.NN', 'II..NNNNN', 'II..NNN..N', 'III..N.NN.N', 'IIII........', 'III..S.SS.S', 'II..SSS..S', 'II..SSSSS', 'II..S.SS'] },
    5: { L: 13, rows: ['II..N.N.N', 'II..NNNNNN', 'II..NNNNNNN', 'III..N.N.N.N', 'IIII.........', 'III..S.S.S.S', 'II..SSSSSSS', 'II..SSSSSS', 'II..S.S.S'] },
  },
};

// the start island: chips are printed (the rulebook's pictures), terrain is fixed in scenarios 1 and 2 and dealt otherwise
const ISLAND = {
  small: {
    chips: [[11, 9], [3, 8], [4, 10], [6, 12, 8], [10, 4], [11, 6], [3, 5]],
    terrain: {
      1: [['mountains', 'forest'], ['fields', 'pasture'], ['hills', 'pasture'], ['pasture', 'mountains', 'forest'], ['fields', 'pasture'], ['forest', 'hills'], ['mountains', 'forest']],
      2: [['pasture', 'forest'], ['fields', 'pasture'], ['hills', 'mountains'], ['pasture', 'mountains', 'forest'], ['fields', 'pasture'], ['forest', 'mountains'], ['hills', 'forest']],
    },
    pool: { hills: 2, forest: 4, pasture: 4, fields: 2, mountains: 3 },
  },
  big: {
    chips: [[2, 9], [11, 8], [4, 10], [10, 3, 8], [6, 5, 4, 5], [3, 10, 6], [8, 4], [11, 6], [12, 9]],
    terrain: {},
    pool: { hills: 3, forest: 5, pasture: 6, fields: 3, mountains: 5 },
  },
};

// what lies under the undiscovered fields: [north, south]
const FOG = {
  small: {
    land: [
      { terrain: { hills: 1, forest: 1, pasture: 1, fields: 1, mountains: 2 }, chips: [3, 4, 5, 6, 9, 10] },
      { terrain: { hills: 1, forest: 1, pasture: 1, fields: 2, mountains: 1 }, chips: [4, 5, 8, 9, 10, 11] },
    ],
    extra: {
      1: [{ sea: 2 }, { sea: 2 }],
      2: [{ sea: 2, gold: 3 }, { sea: 2, gold: 3 }],
      3: [{ gold: 3, fish: 2 }, { gold: 2, fish: 3 }],
      4: [{ sea: 1, fish: 3, spice: 3 }, { sea: 1, fish: 3, spice: 3 }],
      5: [{ sea: 1, gold: 3, fish: 3, spice: 3 }, { sea: 1, gold: 3, fish: 3, spice: 3 }],
    },
  },
  big: {
    land: [
      { terrain: { hills: 1, forest: 2, pasture: 1, fields: 2, mountains: 3 }, chips: [2, 3, 4, 5, 5, 6, 9, 9, 10] },
      { terrain: { hills: 2, forest: 1, pasture: 2, fields: 2, mountains: 2 }, chips: [3, 4, 4, 5, 8, 9, 10, 10, 11] },
    ],
    extra: {
      2: [{ sea: 1, gold: 4 }, { sea: 1, gold: 4 }],
      3: [{ gold: 4, fish: 3 }, { gold: 4, fish: 3 }],
      4: [{ sea: 1, fish: 3, spice: 3 }, { sea: 1, fish: 3, spice: 3 }],
      5: [{ sea: 1, gold: 4, fish: 3, spice: 3 }, { sea: 1, gold: 4, fish: 3, spice: 3 }],
    },
  },
};

// fishing grounds carry a die face (north 1-3, south 4-6); the two spice villages with a die make the pirates easier to chase
const FISH_DICE = [[1, 2, 3], [4, 5, 6]];
const VILLAGES = [
  [{ kind: 'pirate', die: 5 }, { kind: 'gold' }, { kind: 'fast' }],
  [{ kind: 'pirate', die: 4 }, { kind: 'gold' }, { kind: 'fast' }],
];
// the numbers on the back of the pirate lairs. The two lairs of the 5-6 player box carry 9 and 10 (told by the owner, to be checked on the
// tiles); the numbers of the six lairs of the base box are not printed anywhere we have, so they stay a spread of the usual numbers.
const LAIR_NUMBERS = { small: [4, 5, 6, 8, 9, 10], big: [4, 5, 6, 8, 9, 10, 9, 10] };

const expand = counts => Object.entries(counts).flatMap(([k, n]) => Array.from({ length: n }, () => k));

function build({ scenario = 2, players = 4, randomIsland = false }) {
  const size = players > 4 ? 'big' : 'small';
  const lay = LAYOUTS[size][scenario];
  if (!lay) throw new Error('Unknown scenario');
  const rows = lay.rows, m = (rows.length - 1) / 2, L = lay.L;
  const centers = [];
  const meta = [];
  rows.forEach((row, r) => {
    const d = Math.abs(m - r);
    for (let i = 0; i < row.length; i++) {
      const xh = d + 2 * i;
      centers.push({ x: (xh - (L - 1)) * SQ3 / 2, y: (r - m) * 1.5 });
      meta.push({ r, xh, i, ch: row[i] });
    }
  });
  const geo = geometryFromCenters(centers);
  const hexes = geo.hexes;
  const at = {};
  hexes.forEach((h, id) => { Object.assign(h, { r: meta[id].r, xh: meta[id].xh }); at[`${h.r},${h.xh}`] = h; });

  // ---- the start island
  const isl = ISLAND[size];
  const fixed = !randomIsland && isl.terrain[scenario];
  const islandHexes = hexes.filter((h, id) => meta[id].ch === 'I');
  const chipRows = isl.chips;
  const terr = fixed ? fixed.flat() : shuffle(expand(isl.pool));
  islandHexes.forEach((h, k) => { h.terrain = terr[k]; h.number = chipRows.flat()[k]; h.island = true; h.hidden = false; });

  // ---- sea and the undiscovered fields
  const cfg = FOG[size];
  const councilAt = scenario >= 3 || size === 'small' && scenario >= 3 ? true : size === 'big' && scenario >= 3;
  hexes.forEach((h, id) => {
    if (meta[id].ch === '.') { h.terrain = 'sea'; h.number = null; h.hidden = false; }
  });
  const chipPiles = [];
  const regions = ['N', 'S'];
  regions.forEach((rg, k) => {
    const slots = hexes.filter((h, id) => meta[id].ch === rg);
    const ex = cfg.extra[scenario][k];
    const land = cfg.land[k];
    const bag = [
      ...expand(land.terrain),
      ...expand({ gold: ex.gold || 0, fish: ex.fish || 0, spice: ex.spice || 0, sea: ex.sea || 0 }),
    ];
    if (bag.length !== slots.length) throw new Error(`Board ${size}/${scenario}: ${bag.length} tiles for ${slots.length} undiscovered fields (${rg})`);
    shuffle(bag);
    const fish = shuffle(FISH_DICE[k].slice()).slice(0, ex.fish || 0);
    const villages = shuffle(VILLAGES[k].slice());
    slots.forEach((h, j) => {
      const t = bag[j];
      h.hidden = true; h.region = rg; h.number = null;
      if (t === 'gold') h.terrain = 'goldriver';
      else if (t === 'fish') { h.terrain = 'fishfield'; h.die = fish.pop(); }
      else if (t === 'spice') { h.terrain = 'spice'; h.village = { ...villages.pop(), bags: 0, friends: [] }; }
      else h.terrain = t; // sea or a landscape
    });
    chipPiles.push(shuffle(land.chips.slice()));
  });

  // ---- the council's base: a sea field next to the island with two harbors (top and bottom corner)
  let council = null;
  if (scenario >= 3) {
    const row = size === 'small' ? m : m;
    const hx = size === 'small' ? 6 : 8;
    council = at[`${row},${hx}`];
    if (!council) throw new Error('No council field');
    council.council = true;
  }

  // ---- circles: the crossings along the east coast of the island where the first harbor settlement may go
  const circles = [];
  for (let r = 0; r < rows.length; r++) {
    const inRow = islandHexes.filter(h => h.r === r);
    if (!inRow.length) continue;
    const east = inRow.reduce((a, b) => (b.xh > a.xh ? b : a));
    circles.push(east.verts[1], east.verts[2]);
  }

  const lairNumbers = shuffle(LAIR_NUMBERS[size].slice());
  const vertexOf = (r, xh, c) => at[`${r},${xh}`].verts[c];
  const edgeOf = (r, xh, c1, c2) => {
    const a = vertexOf(r, xh, c1), b = vertexOf(r, xh, c2);
    return geo.edges.find(e => e.v.includes(a) && e.v.includes(b)).id;
  };

  // ---- the fixed start of scenario 1 (3-4 players): one settlement with a road, one harbor settlement with an explorer's ship
  let fixedStart = null;
  if (scenario === 1 && size === 'small') {
    fixedStart = [
      { settlement: vertexOf(0, 3, 3), road: edgeOf(0, 3, 2, 3), harbor: vertexOf(6, 5, 0), ship: edgeOf(6, 5, 0, 1) },
      { harbor: vertexOf(0, 5, 3), ship: edgeOf(0, 5, 2, 3), settlement: vertexOf(6, 3, 0), road: edgeOf(6, 3, 0, 1) },
      { settlement: vertexOf(3, 0, 0), road: edgeOf(3, 0, 0, 1), harbor: vertexOf(3, 4, 0), ship: edgeOf(3, 4, 0, 1) },
      { settlement: vertexOf(3, 0, 2), road: edgeOf(3, 2, 3, 4), harbor: vertexOf(3, 4, 3), ship: edgeOf(3, 4, 2, 3) },
    ];
  }
  const harbors = council ? [council.verts[0], council.verts[3]] : [];
  return {
    kind: 'explorers', size, scenario, rows: rows.length, hexes, vertices: geo.vertices, edges: geo.edges, ports: [],
    circles: [...new Set(circles)], harbors, council: council ? council.id : null,
    chips: { N: chipPiles[0], S: chipPiles[1] }, lairNumbers, fixedStart,
  };
}

module.exports = { build, LAYOUTS, FOG, ISLAND };
