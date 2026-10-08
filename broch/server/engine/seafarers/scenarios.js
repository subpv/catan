'use strict';
// The printed Seafarers scenarios (CATAN – Seefahrer, 2025 edition): fixed maps read from the rulebook pictures.
//
// A layout is a list of rows; each row is [firstColumn, 'tokens'] and the tokens fill every second half-column from there on
// (a hex is two half-columns wide, rows alternate odd/even columns). Hex centre: x = column * sqrt(3)/2, y = row * 1.5.
// Token: <terrain letter><number><flags>
//   * a tile of the randomly laid main island (5-6 players)   ~ sea   L forest   B hills   W pasture   G fields   O mountains   $ gold river   D desert   ? hidden tile (fog)   . no hex
//   flags: X pirate starts here   R robber starts here   F frame cell (a sea cell outside the loose tiles, only for the pirate)
//          lower-case letter = shuffle group for the "variable setup" of the book
// Harbours are listed as 'row,col SIDE' (the land hex and the side its harbour edge is on: NE E SE SW W NW);
// their types are dealt at random (the book allows that and the printed icons are too small to read).

const { geometryFromCenters, shuffle, SQ3 } = require('../shared/board');
const { BOARDS } = require('../shared/constants');

const SIDE_EDGE = { NE: 0, E: 1, SE: 2, SW: 3, W: 4, NW: 5 }; // index into hex.edges (corner 0 is the top corner)
const TERRAIN = { '~': 'sea', L: 'forest', B: 'hills', W: 'pasture', G: 'fields', O: 'mountains', $: 'gold', D: 'desert', '?': 'hidden' };

const SCENARIOS = {
  shores: { title: 'Heading for New Shores', de: 'Zu neuen Ufern', vp: 14 },
  islands: { title: 'The Four Islands', de: 'Die vier Inseln', vp: 13 },
  fog: { title: 'The Fog Islands', de: 'Ozeanien', vp: 12 },
  desert: { title: 'Through the Desert', de: 'Durch die Wüste', vp: 14 },
  tribe: { title: 'The Forgotten Tribe', de: 'Der vergessene Stamm', vp: 13 },
  cloth: { title: 'Cloth for Broch', de: 'Stoffe für Catan', vp: 14 },
  wonders: { title: 'The Wonders of Broch', de: 'Die Catanischen Wunder', vp: 10 },
  newworld: { title: 'New World', de: 'Neue Welt', vp: 12 },
};

// ---------------------------------------------------------------------------------------------- maps
const MAPS = {};

// ---- 1. Heading for New Shores
MAPS.shores = {
  rules: { bonus: { vp: 2, mode: 'each' }, start: 'largest' },
  3: {
    rows: [
      [4, 'B12R $5 ~ ~'],
      [3, '~ ~ ~ W4 O9'],
      [2, '~ G4 W6 ~ G3 ~'],
      [3, 'W2 O5 L10 ~ $4 ~XF'],
      [2, 'B8 W10 W9 L8 ~ ~'],
      [3, 'G11 O3 B11 ~ O8'],
      [4, 'G6 L5 ~ B10'],
    ],
    ports: ['2,4 W', '4,2 NW', '4,2 SW', '6,4 W', '6,6 SW', '2,6 E', '4,8 NE', '6,6 E'],
    portKinds: { any: 3 },
    variable: { red: true },
    groups: ['main', ['0,4', '0,6', '0,8', '0,10', '1,9', '1,11', '2,10', '2,12', '3,11', '4,12', '5,11', '6,10']],
  },
  4: {
    rows: [
      [4, 'O8 W11 ~ $4 ~'],
      [3, '~ ~ ~ ~ B5 O2'],
      [2, '~ W5 L6 O4 ~ L9 ~'],
      [3, 'G12 B11 G3 W9 ~ $10 ~XF'],
      [2, 'B6 L10 DR G11 L5 ~ ~'],
      [3, 'O3 W4 B9 W8 ~ B3'],
      [4, 'G8 L2 O10 ~ G6'],
    ],
    ports: ['2,4 W', '2,8 NW', '3,9 NE', '4,10 SE', '6,8 E', '6,6 SW', '6,4 W', '4,2 SW', '4,2 NW'],
    portKinds: { any: 4 },
    variable: { red: true },
    groups: ['main', ['0,4', '0,6', '0,8', '0,10', '0,12', '1,11', '1,13', '2,12', '2,14', '3,13', '4,12', '4,14', '5,13', '6,12']],
  },
  big: {
    rows: [
      [-6, '$9 ~ * * * ~ O6'],
      [-7, 'O11 ~ * * * * ~ ~'],
      [-8, 'W8 ~ * * * * * ~ B12'],
      [-7, '~ * * * * * * ~ ~XF'],
      [-8, 'B4 ~ * * * * * ~ G3'],
      [-7, 'L2 ~ * * * * ~ ~'],
      [-6, '$5 ~ * * * ~ $10'],
    ],
    ports: ['0,0 NE', '1,-3 NW', '1,3 NE', '2,4 E', '2,-4 W', '3,-5 SW', '3,5 SE', '5,-3 SW', '5,3 E', '6,0 SW', '6,2 SE'],
  },
};
// ---- 2. The Four Islands
MAPS.islands = {
  rules: { bonus: { vp: 2, mode: 'each' }, start: 'any' },
  3: {
    rows: [
      [4, '~ ~ G4 W3'],
      [3, 'O4 L9 ~ G9 B5'],
      [2, 'W6 O10 ~ L8 B11 ~'],
      [3, '~ ~ ~ ~ ~'],
      [2, 'G11 O8 L3 ~ B10 B6'],
      [3, 'L5 W9 ~ O2 G5'],
      [4, 'W12R ~ ~ ~'],
      [7, '~XF'],
    ],
    ports: ['2,2 NW', '1,5 SE', '1,11 NE', '2,10 SW', '4,2 NE', '4,2 SW', '4,12 SE', '5,9 NW', '5,5 SE'],
    portKinds: { any: 4 },
    variable: { red: true, forbid: { forest: [2, 3, 11, 12], pasture: [2, 3, 11, 12] } },
    groups: ['land'],
  },
  4: {
    rows: [
      [6, 'W8 ~ L9 L11'],
      [5, 'B10 ~ O3 G12R W5'],
      [4, 'G5 L3 ~ B5 O10 ~'],
      [5, '~ ~ L6 ~ ~'],
      [4, 'B4 W9 ~ ~ L9 W11'],
      [5, 'G6 O4 B2 ~ O8'],
      [6, 'W10 G11 ~ G4'],
      [9, '~XF'],
    ],
    ports: ['1,5 W', '2,4 SE', '1,13 SE', '3,9 NW', '4,14 NW', '4,4 SW', '5,7 NE', '4,14 SE', '6,6 W'],
    portKinds: { any: 4 },
    variable: { red: true, forbid: { forest: [2, 3, 11, 12], pasture: [2, 3, 11, 12] } },
  },
  big: {
    rows: [
      [4, 'W12R O4 ~ L6 ~ O9 W6'],
      [3, 'L8 O10 ~ O11 B10 ~ G3 B10'],
      [2, 'B11 G9 ~ W3 L4 ~ ~ L4 ~'],
      [1, '~XF ~ ~ ~ ~ ~ ~ ~ ~'],
      [2, '~ B4 ~ ~ W8 L10 ~ L5 G6'],
      [3, 'L9 G12 ~ G5 O3 ~ B8 W9'],
      [4, 'W5 O6 ~ W2 ~ B5 G2'],
    ],
    ports: ['0,6 NW', '0,10 NE', '0,16 NE', '1,5 SE', '1,15 SW', '2,4 SW', '5,3 W', '6,6 NE', '5,9 SW', '5,17 E', '6,14 SW'],
    variable: { red: true, forbid: { forest: [2, 3, 11, 12], pasture: [2, 3, 11, 12] } },
    groups: ['land'],
  },
};

// ---- 3. Oceania (the fog scenario)
MAPS.fog = {
  rules: { bonus: null, start: 'big' },
  3: {
    rows: [
      [0, '? ? ~ B6 L11'],
      [-1, '? ? ? ~ L5 G3'],
      [-2, '~ ~ ~ ? ~ W8 W9'],
      [-1, 'L6 W5 ~ ? ~ O4'],
      [-2, '~ B11 L9 ~ ? ~ ~'],
      [-1, '~ O8 G10 ~ ? ?'],
      [0, '~ W12R ~ ? ? ~XF'],
    ],
    // the twelve face-down tiles: ten land tiles and two sea tiles, and the stack of number chips for the land
    fog: { terrains: ['$', '$', 'B', 'B', 'L', 'W', 'G', 'G', 'O', 'O', '~', '~'], numbers: [3, 3, 4, 5, 6, 8, 9, 10, 11, 12] },
    ports: ['0,6 NE', '0,8 E', '1,9 E', '3,9 E', '3,-1 SW', '4,0 SW', '6,2 W', '5,3 SE'],
    portKinds: { any: 3 },
    variable: { red: false },
    groups: ['main'],
  },
};
MAPS.fog[4] = MAPS.fog[3];
MAPS.fog.big = {
  rows: [
    [4, 'L10 ~ ? ? ~ L9 G2'],
    [3, 'W6 ~ ? ? ? ~ G5 O12'],
    [2, 'G12R B4 ~ ? ? ? ~ W4 B8'],
    [3, 'O11 W5 ~ ? ? ~ L6 W3'],
    [2, 'G6 L3 ~ ? ? ? ~ O9 G4'],
    [3, 'B9 W8 ~ ? ? ? ~ B10'],
    [4, 'B11 O10 ~ ? ? ~ L8'],
    [11, '~XF'],
  ],
  fog: { terrains: ['$', '$', '$', 'D', 'B', 'B', 'L', 'L', 'W', 'W', 'G', 'G', 'O', 'O', 'O', '~', '~', '~'], numbers: [2, 2, 3, 3, 4, 5, 5, 6, 8, 9, 10, 11, 11, 12] },
  ports: ['0,14 NE', '1,3 NW', '2,4 E', '3,3 W', '5,3 W', '6,6 NE', '1,15 SW', '2,18 NE', '4,18 NE', '4,18 SE', '5,17 W'],
  variable: { red: false },
  groups: ['main'],
};

// ---- 4. Through the Desert
MAPS.desert = {
  rules: { bonus: { vp: 2, mode: 'each' }, start: 'largest', desertSplits: true },
  3: {
    rows: [
      [5, '~XF', -1],
      [4, '$4 D ~ O8'],
      [3, 'L3 D L4 ~ W12'],
      [2, 'G6 D B5 W6 ~ ~'],
      [5, 'O3 L10 ~ $5 ~'],
      [2, 'L11 B6 G2 B9 ~ ~'],
      [3, 'O10 G9 L8 ~ G9'],
      [4, 'W8 W4 ~ O5'],
    ],
    ports: ['1,7 NE', '4,4 NW', '4,8 NE', '4,2 SW', '6,4 W', '6,6 E', '4,8 SE', '6,4 SE'],
    variable: { red: true, noRedGold: true },
    groups: ['main'],
  },
  4: {
    rows: [
      [5, '~XF', -1],
      [4, '$10 D L5 ~ O9'],
      [3, 'O11 D B3 W6 ~ G4'],
      [2, 'G8 D O8 G10 L4 ~ B2'],
      [3, '~ L10 B11 W9 ~ ~'],
      [2, 'B12 B6 G5 L8 ~ $5 W3'],
      [3, 'W3 W11 O4 ~ ~ ~'],
      [4, '~ L9 ~ O6 G12'],
    ],
    ports: ['0,8 E', '2,10 NE', '2,10 SE', '3,5 W', '4,2 SW', '5,3 SE', '4,8 SE', '6,6 E', '6,6 SW'],
    variable: { red: true },
    groups: ['main'],
  },
  big: {
    rows: [
      [6, '$4 O6 B11 ~ L12 G5 O3 B6'],
      [5, 'L5 W2 D D D D D ~ ~'],
      [4, '~ ~ ~ G2 L8 W9 L10 ~ ~ $10'],
      [5, 'O4 L5 G10 B5 W10 L4 B8 ~ ~'],
      [4, 'W12 G3 B12 O6 B11 O3 G9 ~ ~ O8'],
      [5, 'B9 O11 ~ ~ ~ ~ ~ W11 L3'],
      [6, 'W6 ~ W8 G2 ~ $4 ~X G9'],
    ],
    ports: ['3,5 NW', '3,9 NW', '4,4 NW', '5,5 W', '4,8 SE', '5,7 SE', '6,6 SW', '2,16 E', '3,17 SE', '4,12 SW', '4,16 SW'],
    variable: { red: true, noRedGold: true },
    groups: ['main'],
  },
};

// ---- 5. The Forgotten Tribe
MAPS.tribe = {
  rules: { bonus: null, start: 'largest', noReturn: true },
  3: {
    rows: [
      [2, '$N ON ~X DN ON GN'],
      [1, '~ ~ ~ ~ ~ ~ ~'],
      [0, 'G6 L9 O11 B5 L6 O4 ~ WN'],
      [1, 'W10 B8 W4 G12 L5 W2 ~'],
      [0, 'L11 G9 O3 W8 B10 G3 ~ LN'],
      [1, '~ ~ ~ ~ ~ ~ ~'],
      [2, 'DN BN ~ BN DN $N'],
    ],
    gifts: {
      chips: ['0,2 NE', '0,8 NE', '0,12 NE', '2,14 E', '4,14 E', '6,2 SE', '6,8 SW', '6,12 SE'],
      dev: ['0,2 W', '0,12 E', '6,2 W', '6,12 E'],
      ports: ['0,2 NW', '0,8 NW', '2,14 NE', '4,14 SE', '6,2 SW', '6,8 SE'],
    },
    variable: { red: true },
    groups: ['main'],
  },
  big: {
    rows: [
      [2, 'DN DN ~ $N $N ~ WN WN'],
      [1, '~ ~ ~ ~ ~ ~ ~ ~ ~'],
      [0, 'G3 B5 O11 W8 B4 L10 G4 B3 L8 O5'],
      [1, 'L11 W12 L5 G10 W5 B9 G2 W9 B10'],
      [0, 'L6 O4 G9 B8 L11 O3 W4 G6 L3 O6'],
      [1, '~ ~ ~ ~ ~ ~ ~ ~ ~'],
      [2, 'DN DN ~X ON BN ~ GN $N'],
    ],
    gifts: {
      chips: ['0,2 NW', '0,4 NW', '0,8 NE', '0,10 NW', '0,14 NW', '6,4 SW', '6,8 SE', '6,10 SW', '6,14 SE', '6,16 SE'],
      dev: ['0,2 W', '0,10 NE', '0,16 E', '6,2 W', '6,8 SW', '6,16 E'],
      ports: ['0,4 NE', '0,8 NW', '0,14 NE', '0,16 NE', '6,2 SW', '6,4 SE', '6,10 SE', '6,14 SW'],
    },
  },
};

// ---- 6. Cloth for Catan
MAPS.cloth = {
  rules: { bonus: null, start: 'any', noReturn: false, cloth: true, noLongest: true, thirdSettlement: true },
  3: {
    rows: [
      [4, 'L4 W6 B5 W11 G8'],
      [3, 'G3 L12 ~ ~ L3 O9'],
      [2, 'G12R ~ ~ $N ~ ~ ~'],
      [3, '~ DN ~ ~ DN ~ ~XF'],
      [2, '~ ~ ~ $N ~ ~ O2'],
      [3, 'B9 G2 ~ ~ W11 O4'],
      [4, 'W10 L6 O5 G10 B8'],
    ],
    villages: ['2,8 N 11', '2,8 S 8', '3,5 N 10', '3,5 S 9', '3,11 N 4', '3,11 S 5', '4,8 N 6', '4,8 S 3'],
    ports: ['0,4 NE', '0,10 NW', '1,3 W', '1,13 E', '4,14 E', '5,3 W', '5,13 SE', '6,4 SE', '6,10 SE'],
  },
  big: {
    rows: [
      [4, 'L4 W6 B5 G12 B3 W11 G8'],
      [3, 'G3 L12 ~ ~ ~ ~ L3 O9'],
      [2, 'G11R ~ ~ DN ~ DN ~ ~ W3'],
      [3, '~ $N ~ ~ ~ ~ $N ~'],
      [2, 'O8 ~ ~ DN ~ DN ~ ~ O2'],
      [3, 'B9 G2 ~ ~ ~ ~ W11 O4'],
      [4, 'W10 L6 O5 L11 L8 G10 B6'],
      [19, '~XF', 3],
    ],
    villages: ['3,5 N 4', '3,5 S 9', '3,15 N 4', '3,15 S 5', '2,8 N 2', '2,8 S 5', '2,12 N 10', '2,12 S 8', '4,8 N 6', '4,8 S 12', '4,12 N 9', '4,12 S 10'],
    ports: ['0,4 NE', '0,10 NW', '0,14 NW', '1,3 W', '1,17 E', '4,2 SW', '4,18 E', '5,17 SE', '6,6 SW', '6,8 SE', '6,14 SE'],
  },
};

// ---- the free game: New World. All tiles are dealt at random inside the frame.
const hexRows = (widths, firstCols) => widths.map((w, i) => [firstCols[i], Array(w).fill('#').join(' ')]);
MAPS.newworld = {
  rules: { bonus: { vp: 1, mode: 'each' }, start: 'any' },
  3: {
    rows: hexRows([5, 6, 7, 6, 7, 6, 5], [4, 3, 2, 3, 2, 3, 4]),
    random: { terrains: { '~': 19, B: 4, L: 5, W: 5, G: 5, O: 4 }, numbers: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12], ports: 10 },
  },
  big: {
    rows: hexRows([8, 9, 10, 9, 10, 9, 8], [2, 1, 0, 1, 0, 1, 2]),
    random: { terrains: { '~': 21, D: 3, $: 4, B: 7, L: 7, W: 7, G: 7, O: 7 }, numbers: [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12], ports: 11 },
  },
};

// ---- 8. The Wonders of Catan
// wonder chips and the corners next to them that stay empty in the founding phase: 'row,col corner' (corner 0 is the top, then clockwise)
MAPS.wonders = {
  rules: { bonus: { vp: 1, mode: 'perSettlement' }, start: 'largest', noPirate: true, wonders: true },
  3: {
    rows: [
      [2, '$8 B2 ~ O10 ~ ~'],
      [1, '~ ~ ~ L11 ~ D ~'],
      [0, 'O12 G6 B11 G10 W3 L9 D ~'],
      [1, 'O3 G4 O6 W5 B4 D ~'],
      [0, 'B8 W9 ~ ~ B10 ~ ~ $6'],
      [1, '~ L3 ~ L8 G9 ~ L4'],
      [2, 'O5 ~ W11 W2 ~ G5'],
    ],
    wonder: {
      keys: ['castle', 'bridge', 'wall', 'theater', 'monument'],
      walls: ['2,10 0', '2,10 1', '2,10 2', '2,10 3', '3,9 2'],
      bridges: ['5,3 2', '6,6 5'],
      tabu: ['5,3 1', '5,3 3', '5,7 4', '6,6 4'],
    },
    ports: ['2,2 NW', '2,6 NW', '2,8 NE', '3,1 W', '3,3 SE', '5,3 W', '5,9 NE', '5,9 SE', '6,6 SE'],
  },
  big: {
    rows: [
      [2, '$8 ~ W10 ~ G12 ~ ~ ~'],
      [1, '~ ~ B11 ~ L11 ~ ~ D D'],
      [0, '~ B2 W5 G6 B5 G3 W8 L11 D ~'],
      [1, '~ G9 O3 L4 O6 G10 W9 B10 D'],
      [0, '~ ~ B8 W5 ~ B4 L8 O12 ~ ~'],
      [1, '$6 ~ L10 O3 ~ O9 G4 ~ L4'],
      [2, '~ O5 L9 ~ W2 W11 ~ $6'],
    ],
    wonder: {
      keys: ['castle', 'bridge', 'wall', 'theater', 'monument', 'lighthouse', 'library'],
      walls: ['2,14 0', '2,14 1', '2,14 2', '3,15 1', '3,15 2'],
      bridges: ['5,7 2', '6,10 5'],
      lights: ['0,6 2', '1,9 5'],
      tabu: ['0,6 1', '0,6 3', '1,9 0', '1,9 4', '5,7 1', '5,7 3', '6,10 0', '6,10 4'],
    },
    ports: ['2,4 NW', '2,6 NE', '2,10 NE', '2,2 W', '4,4 W', '5,5 W', '3,7 SE', '4,14 SE', '5,13 SE', '6,10 SE', '6,4 SE'],
  },
};

// ---------------------------------------------------------------------------------------------- parsing and building
function parse(layout) {
  const cells = [];
  let next = 0;
  layout.rows.forEach(([c0, text, row]) => {
    const r = row ?? next++;
    text.trim().split(/\s+/).forEach((tok, i) => {
      if (tok === '.') return;
      const m = /^([~LBWGO$D?*#])(\d*)([A-Za-z]*)$/.exec(tok);
      if (!m) throw new Error(`bad token "${tok}" in row ${r}`);
      const cell = { r, c: c0 + 2 * i, t: m[1], n: m[2] ? +m[2] : null, flags: m[3] };
      cells.push(cell);
    });
  });
  return cells;
}

const redNum = n => n === 6 || n === 8;
const isLandT = t => 'LBWGO$D'.includes(t);

// "Variabler Aufbau": the tiles of a group (terrain letters and number chips) are dealt again inside the printed outlines.
// cfg: red = no two red numbers next to each other and none on gold, forbid = numbers a terrain must not get
function reshuffle(group, cfg, nb) {
  const letters = group.map(c => c.t);
  const nums = group.filter(c => isLandT(c.t) && c.t !== 'D' && c.n != null).map(c => c.n);
  const members = new Set(group);
  let best = null;
  for (let attempt = 0; attempt < 800; attempt++) {
    shuffle(letters); shuffle(nums);
    let k = 0;
    group.forEach((c, i) => { c.nt = letters[i]; c.nn = (isLandT(c.nt) && c.nt !== 'D') ? nums[k++] ?? null : null; });
    const numAt = o => (members.has(o) ? o.nn : o.n);
    let bad = 0;
    for (const c of group) {
      if (c.nn == null) continue;
      if (cfg.red && redNum(c.nn)) {
        if (nb(c).some(o => redNum(numAt(o)))) bad++;
        if (c.nt === '$') bad++;
      }
      const forbid = cfg.forbid && cfg.forbid[TERRAIN[c.nt]];
      if (forbid && forbid.includes(c.nn)) bad++;
    }
    if (best === null || bad < best.bad) best = { bad, t: group.map(c => c.nt), n: group.map(c => c.nn) };
    if (!bad) break;
  }
  group.forEach((c, i) => { c.t = best.t[i]; c.n = best.n[i]; });
}

// the printed scenario as a board for the engine; returns null when the scenario has no printed map for that table
function buildScenario({ scenario, players = 4, big = false, variable = false }) {
  const def = MAPS[scenario];
  if (!def) return null;
  const key = big ? 'big' : players <= 3 ? 3 : 4;
  const layout = def[key] || (big ? null : def[4] || def[3]);
  if (!layout) return null;
  const cells = parse(layout);
  const at = new Map(cells.map(c => [`${c.r},${c.c}`, c]));
  const nb = c => [[-1, -1], [-1, 1], [0, -2], [0, 2], [1, -1], [1, 1]].map(([dr, dc]) => at.get(`${c.r + dr},${c.c + dc}`)).filter(Boolean);

  // the free game: every tile and number chip is dealt at random (red numbers apart, none on gold)
  const freeCells = cells.filter(c => c.t === '#');
  if (freeCells.length) {
    const pool = [];
    for (const [k, n] of Object.entries(layout.random.terrains)) for (let i = 0; i < n; i++) pool.push(k);
    const nums = layout.random.numbers.slice();
    let best = null;
    for (let attempt = 0; attempt < 2000; attempt++) {
      shuffle(pool); shuffle(nums);
      let k = 0;
      freeCells.forEach((c, i) => { c.nt = pool[i]; c.nn = (c.nt === '~' || c.nt === 'D') ? null : nums[k++]; });
      let bad = 0;
      for (const c of freeCells) {
        if (c.nn == null) continue;
        if (redNum(c.nn) && c.nt === '$') bad++;
        for (const o of nb(c)) if (o.nn != null && o.t === '#' && redNum(o.nn) && redNum(c.nn)) bad++;
      }
      if (best === null || bad < best.bad) best = { bad, t: pool.slice(), n: freeCells.map(c => c.nn) };
      if (!bad) break;
    }
    freeCells.forEach((c, i) => { c.t = best.t[i]; c.n = best.n[i]; });
    // the robber starts on a 12
    const twelve = freeCells.find(c => c.n === 12);
    if (twelve) twelve.flags += 'R';
  }

  // the randomly laid main island of the 5-6 player maps: the tiles of the large board, red numbers apart
  const mainCells = cells.filter(c => c.t === '*');
  if (mainCells.length) {
    const letter = { forest: 'L', pasture: 'W', fields: 'G', hills: 'B', mountains: 'O', desert: 'D' };
    const terr = [];
    for (const [k, n] of Object.entries(BOARDS.extended.terrain)) for (let i = 0; i < n; i++) terr.push(letter[k]);
    const nums = BOARDS.extended.numbers.slice();
    let best = null;
    for (let attempt = 0; attempt < 1500; attempt++) {
      shuffle(terr); shuffle(nums);
      let k = 0;
      mainCells.forEach((c, i) => { c.nt = terr[i]; c.nn = c.nt === 'D' ? null : nums[k++]; });
      let bad = 0;
      for (const c of mainCells) {
        if (c.nn == null) continue;
        for (const o of nb(c)) if (o.nn != null && o.t === '*' && (o.nn === c.nn || (redNum(o.nn) && redNum(c.nn)))) bad++;
      }
      if (best === null || bad < best.bad) best = { bad, t: terr.slice(), n: mainCells.map(c => c.nn) };
      if (!bad) break;
    }
    mainCells.forEach((c, i) => { c.t = best.t[i]; c.n = best.n[i]; });
  }

  // variable setup: deal tiles and numbers again inside the printed outlines
  if (variable && layout.variable) {
    const split = !!def.rules.desertSplits;
    const landOf = c => isLandT(c.t) && !(split && c.t === 'D');
    const land = cells.filter(landOf);
    const seen = new Set(); const comps = [];
    for (const c of land) {
      if (seen.has(c)) continue;
      const comp = []; const st = [c]; seen.add(c);
      while (st.length) { const x = st.pop(); comp.push(x); nb(x).forEach(o => { if (landOf(o) && !seen.has(o)) { seen.add(o); st.push(o); } }); }
      comps.push(comp);
    }
    comps.sort((x, y) => y.length - x.length);
    const groups = (layout.groups || ['land']).map(g => g === 'land' ? land : g === 'main' ? comps[0] : g.map(k => at.get(k)).filter(Boolean));
    groups.forEach(g => reshuffle(g, layout.variable, nb));
  }

  // hidden tiles of the fog scenario
  const fogCells = cells.filter(c => c.t === '?');
  if (fogCells.length) {
    const pool = shuffle(layout.fog.terrains.slice());
    const nums = shuffle(layout.fog.numbers.slice());
    fogCells.forEach((c, i) => { c.hiddenT = pool[i]; c.hiddenN = (pool[i] === '~' || pool[i] === 'D') ? null : nums.pop(); });
  }

  const centers = cells.map(c => ({ x: c.c * SQ3 / 2, y: c.r * 1.5 }));
  const mx = (Math.min(...centers.map(p => p.x)) + Math.max(...centers.map(p => p.x))) / 2;
  const my = (Math.min(...centers.map(p => p.y)) + Math.max(...centers.map(p => p.y))) / 2;
  const geo = geometryFromCenters(centers.map(p => ({ x: p.x - mx, y: p.y - my })));
  let pirate = null, robber = null;
  geo.hexes.forEach((h, i) => {
    const c = cells[i];
    const t = c.t === '?' ? c.hiddenT : c.t;
    h.terrain = TERRAIN[t]; h.number = c.t === '?' ? c.hiddenN : c.n;
    h.hidden = c.t === '?';
    if (c.flags.includes('F')) h.frame = true;
    if (c.flags.includes('N')) h.small = true; // small islands of the forgotten tribe: no settlements, no robber, no yield
    if (c.flags.includes('X')) pirate = h.id;
    if (c.flags.includes('R')) robber = h.id;
    h.island = null;
  });
  if (robber == null) { const ds = geo.hexes.filter(h => h.terrain === 'desert'); robber = ds.length ? ds[Math.floor(Math.random() * ds.length)].id : null; }

  // islands: connected land (hidden tiles are not part of an island yet)
  const isLand = h => h.terrain !== 'sea' && !h.hidden && !(def.rules.desertSplits && h.terrain === 'desert');
  const sizes = [];
  geo.hexes.forEach(h => {
    if (!isLand(h) || h.island != null) return;
    const id = sizes.length;
    const stack = [h.id]; h.island = id; let n = 0;
    while (stack.length) {
      const cur = geo.hexes[stack.pop()]; n++;
      cur.neighbors.forEach(o => { const oh = geo.hexes[o]; if (isLand(oh) && oh.island == null) { oh.island = id; stack.push(o); } });
    }
    sizes.push(n);
  });
  const biggest = Math.max(0, ...sizes);
  const home = (def.rules.start === 'any') ? sizes.map((_, i) => i)
    : def.rules.start === 'big' ? sizes.map((n, i) => [n, i]).filter(([n]) => n >= Math.ceil(biggest / 2)).map(([, i]) => i)
      : [sizes.indexOf(biggest)];

  // harbours and gifts sit on edges: 'row,col SIDE'
  const edgeFor = spec => {
    const m = /^(-?\d+),(-?\d+) (NE|E|SE|SW|W|NW)$/.exec(spec);
    if (!m) throw new Error(`bad edge ${spec}`);
    const idx = cells.findIndex(c => c.r === +m[1] && c.c === +m[2]);
    if (idx < 0) throw new Error(`edge on missing hex ${spec}`);
    const hex = geo.hexes[idx];
    const e = geo.edges[hex.edges[SIDE_EDGE[m[3]]]];
    const [a, b] = e.v.map(v => geo.vertices[v]);
    const mxp = (a.x + b.x) / 2, myp = (a.y + b.y) / 2;
    const dx = mxp - hex.x, dy = myp - hex.y, d = Math.hypot(dx, dy);
    return { edge: e.id, x: +(mxp + dx / d * 0.55).toFixed(3), y: +(myp + dy / d * 0.55).toFixed(3) };
  };
  const harbourTypes = (n, wool2) => {
    const special = (wool2 ? BOARDS.extended.ports : BOARDS.standard.ports).filter(t => t !== 'any');
    const list = special.slice(0, 5 + (wool2 ? 1 : 0));
    return shuffle([...list, ...Array(Math.max(0, n - list.length)).fill('any')]).slice(0, n);
  };
  let ports;
  if (layout.random) {
    // free game: harbours on random coast edges, never two on one corner and not too close
    const landHex = h => h.terrain !== 'sea' && !h.hidden;
    const coast = shuffle(geo.edges.filter(e => e.hexes.some(i => landHex(geo.hexes[i])) && !e.hexes.every(i => landHex(geo.hexes[i]))));
    const kinds = harbourTypes(layout.random.ports, big);
    const used = new Set(); const spots = [];
    ports = [];
    for (const e of coast) {
      if (ports.length >= kinds.length) break;
      if (e.v.some(v => used.has(v))) continue;
      const hex = geo.hexes[e.hexes.find(i => landHex(geo.hexes[i]))];
      const [a, b] = e.v.map(v => geo.vertices[v]);
      const mxp = (a.x + b.x) / 2, myp = (a.y + b.y) / 2;
      if (spots.some(([x, y]) => (x - mxp) ** 2 + (y - myp) ** 2 < 4)) continue;
      const dx = mxp - hex.x, dy = myp - hex.y, d = Math.hypot(dx, dy);
      const type = kinds[ports.length];
      ports.push({ edge: e.id, type, ratio: type === 'any' ? 3 : 2, x: +(mxp + dx / d * 0.55).toFixed(3), y: +(myp + dy / d * 0.55).toFixed(3) });
      e.v.forEach(v => used.add(v)); spots.push([mxp, myp]);
    }
  } else {
    const specs = layout.ports || [];
    const kinds = harbourTypes(specs.length, big);
    ports = specs.map((spec, i) => ({ ...edgeFor(spec), type: kinds[i], ratio: kinds[i] === 'any' ? 3 : 2 }));
  }
  ports.forEach(p => geo.edges[p.edge].v.forEach(v => { geo.vertices[v].port = p.type; }));

  // gifts of the forgotten tribe: victory point chips, development cards and harbours lying on coast edges
  let gifts = null;
  if (layout.gifts) {
    const gt = harbourTypes(layout.gifts.ports.length, false);
    gifts = {
      chips: layout.gifts.chips.map(sp => edgeFor(sp).edge),
      dev: layout.gifts.dev.map(sp => edgeFor(sp).edge),
      ports: layout.gifts.ports.map((sp, i) => ({ ...edgeFor(sp), type: gt[i], ratio: gt[i] === 'any' ? 3 : 2 })),
    };
  }

  // villages of the forgotten tribe (cloth): a number chip on a corner of a small island, 'row,col N|S number'
  const villages = (layout.villages || []).map(sp => {
    const m = /^(-?\d+),(-?\d+) (N|S) (\d+)$/.exec(sp);
    const idx = cells.findIndex(c => c.r === +m[1] && c.c === +m[2]);
    if (idx < 0) throw new Error(`village on missing hex ${sp}`);
    return { v: geo.hexes[idx].verts[m[3] === 'N' ? 0 : 3], n: +m[4] };
  });

  const cornerOf = sp => {
    const m = /^(-?\d+),(-?\d+) ([0-5])$/.exec(sp);
    const idx = cells.findIndex(c => c.r === +m[1] && c.c === +m[2]);
    if (idx < 0) throw new Error(`corner on missing hex ${sp}`);
    return geo.hexes[idx].verts[+m[3]];
  };
  const wonder = layout.wonder ? {
    keys: layout.wonder.keys,
    walls: layout.wonder.walls.map(cornerOf), bridges: layout.wonder.bridges.map(cornerOf), lights: (layout.wonder.lights || []).map(cornerOf),
    tabu: layout.wonder.tabu.map(cornerOf),
  } : null;

  return {
    kind: 'sea', scenario, hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports, gifts, villages, wonder,
    homeIslands: home, islandCount: sizes.length, pirateStart: pirate, desert: robber,
    bonus: def.rules.bonus || { vp: 0, mode: 'each' },
    rules: { ...def.rules, bonus: undefined },
    // islands that carry the new-island bonus chips: all except the one(s) everybody starts on
    bonusIslands: def.rules.bonus ? sizes.map((_, i) => i).filter(i => def.rules.start === 'any' || !home.includes(i)) : [],
  };
}

module.exports = { SCENARIOS, MAPS, buildScenario, parse };
