'use strict';
// Reproducible randomness for the tests. Many rule tests and the fuzz simulations play random legal moves, so a rare failure
// is gone on the next run. Setting SEED makes Math.random deterministic (mulberry32), so a failing run can be replayed:
//   SEED=13 node test/rules/tb-traders.js        (the test files require this module first)
//   SEED=13 node -r ./test/seed.js some-script.js
// Without SEED nothing changes. A loop that hunts for flakes: for n in $(seq 1 300); do SEED=$n node test/rules/tb-traders.js >/dev/null 2>&1 || echo "seed $n fails"; done
if (process.env.SEED) {
  let s = (+process.env.SEED || 1) >>> 0;
  Math.random = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  process.on('exit', code => { if (code) console.error('(failed with SEED=' + process.env.SEED + ')'); });
}
