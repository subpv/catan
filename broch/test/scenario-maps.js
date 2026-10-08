'use strict';
// Checks the transcribed Seafarers maps against the tile and number tables printed in the rulebook:
// node test/scenario-maps.js
const S = require('../server/engine/scenarios');

// [sea, desert, gold, hills, forest, pasture, fields, mountains], numbers 2..12 (the book counts the loose tiles; frame cells are not counted)
const TABLES = {
  shores3: [[13, 0, 2, 4, 3, 5, 4, 4], [1, 2, 3, 3, 2, 0, 3, 2, 3, 2, 1]],
  shores4: [[14, 1, 2, 5, 5, 5, 5, 5], [2, 3, 3, 3, 3, 0, 3, 3, 3, 3, 1]],
  islands3: [[15, 0, 0, 4, 4, 4, 4, 4], [1, 2, 2, 3, 2, 0, 2, 3, 2, 2, 1]],
  islands4: [[12, 0, 0, 4, 5, 5, 5, 4], [1, 2, 3, 3, 2, 0, 2, 3, 3, 3, 1]],
  fog3: [[18, 0, 2, 4, 5, 5, 4, 4], [0, 3, 2, 3, 3, 0, 3, 3, 2, 3, 2]],
  shores5: [[16, 2, 3, 7, 7, 7, 7, 7], [3, 4, 4, 4, 4, 0, 4, 4, 4, 4, 3]],
  islands5: [[24, 0, 0, 6, 7, 7, 6, 6], [2, 3, 4, 4, 4, 0, 3, 4, 4, 2, 2]],
  desert3: [[10, 3, 2, 3, 5, 4, 4, 4], [1, 2, 3, 3, 3, 0, 3, 3, 2, 1, 1]],
  desert4: [[12, 3, 2, 5, 5, 5, 5, 5], [1, 3, 3, 3, 3, 0, 3, 3, 3, 3, 2]],
  desert5: [[20, 5, 3, 7, 7, 7, 7, 7], [3, 4, 4, 4, 4, 0, 4, 4, 4, 4, 3]],
  tribe3: [[19, 3, 2, 5, 5, 5, 5, 5], [1, 2, 2, 2, 2, 0, 2, 2, 2, 2, 1]],
  tribe4: [[19, 3, 2, 5, 5, 5, 5, 5], [1, 2, 2, 2, 2, 0, 2, 2, 2, 2, 1]],
  tribe5: [[22, 4, 3, 7, 7, 7, 7, 6], [1, 4, 4, 4, 3, 0, 3, 3, 3, 3, 1]],
  cloth3: [[18, 2, 2, 3, 4, 4, 5, 4], [2, 3, 3, 3, 3, 0, 3, 3, 3, 3, 2]],
  cloth4: [[18, 2, 2, 3, 4, 4, 5, 4], [2, 3, 3, 3, 3, 0, 3, 3, 3, 3, 2]],
  cloth5: [[24, 4, 2, 4, 6, 5, 6, 5], [3, 4, 4, 4, 4, 0, 4, 4, 4, 4, 3]],
  newworld3: [[19, 0, 0, 4, 5, 5, 5, 4], [1, 3, 3, 3, 2, 0, 2, 3, 3, 2, 1]],
  newworld5: [[21, 3, 4, 7, 7, 7, 7, 7], [2, 3, 4, 5, 5, 0, 5, 5, 4, 4, 2]],
  wonders3: [[19, 3, 2, 5, 5, 5, 5, 5], [2, 3, 3, 3, 3, 0, 3, 3, 3, 3, 1]],
  wonders5: [[24, 4, 3, 6, 7, 7, 6, 6], [2, 3, 4, 4, 4, 0, 4, 4, 4, 4, 2]],
  fog5: [[17, 1, 3, 7, 7, 7, 7, 7], [3, 4, 4, 4, 4, 0, 4, 4, 4, 4, 3]],
};
let bad = 0;
const keys = process.argv[2] ? process.argv[2].split(',') : Object.keys(TABLES);
for (const k of keys) {
  const T = TABLES[k];
  const scen = k.replace(/\d+$/, ''), pl = +k.match(/\d+$/)[0];
  const b = S.buildScenario({ scenario: scen, players: pl >= 5 ? 5 : pl, big: pl >= 5 });
  const cnt = { sea: 0, desert: 0, gold: 0, hills: 0, forest: 0, pasture: 0, fields: 0, mountains: 0 };
  const nums = Array(11).fill(0);
  b.hexes.forEach(h => { if (h.frame) return; cnt[h.terrain]++; if (h.number) nums[h.number - 2]++; });
  (b.villages || []).forEach(v => { nums[v.n - 2]++; });
  const got = [cnt.sea, cnt.desert, cnt.gold, cnt.hills, cnt.forest, cnt.pasture, cnt.fields, cnt.mountains];
  const ok1 = JSON.stringify(got) === JSON.stringify(T[0]), ok2 = JSON.stringify(nums) === JSON.stringify(T[1]);
  if (!ok1 || !ok2) bad++;
  console.log(k, ok1 ? 'terrain ok' : `terrain MISMATCH got ${got} want ${T[0]}`, ok2 ? 'numbers ok' : `numbers MISMATCH got ${nums} want ${T[1]}`);
}
process.exit(bad ? 1 : 0);
