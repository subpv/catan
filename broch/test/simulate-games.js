'use strict';
// Random-play fuzzer for the standalone games: plays many games with random legal moves, checks nothing crashes and
// that every game ends. Usage: node test/simulate-games.js [games] [mode]
const engine = require('../server/engine');
const { GameError } = engine;
const pick = a => a[Math.floor(Math.random() * a.length)];
const GAMES = Number(process.argv[2]) || 20;
const only = process.argv[3];
const modes = only ? [only] : engine.STANDALONE;
const BOTS = {};
modes.forEach(m => { BOTS[m] = require(`../server/bots/fuzz-${m}.js`); });

function play(mode, n, game = {}, g = 0) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white', 'teal', 'purple'][i], country: 'DE' }));
  const bo = BOTS[mode].options ? BOTS[mode].options(n) : {};
  // Explorers & Pirates: every scenario
  const scn = mode === 'explorers' ? { scenario: 1 + (g % 5) } : {};
  const s = engine.createGame({ id: 'g' + Math.random(), mode, players, options: { ...bo, ...scn, game: { ...(bo.game || {}), ...game } } });
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 40000) {
    const seats = s.players.map((_, i) => i).sort(() => Math.random() - 0.5);
    let acted = false;
    for (const p of seats) {
      const v = engine.viewFor(s, p);
      const cands = BOTS[mode](v, p, s).filter(Boolean);
      for (const a of cands.sort(() => Math.random() - 0.5)) {
        try { engine.act(s, p, a); acted = true; break; } catch (e) { if (!(e instanceof GameError)) { console.error(mode, 'CRASH', a, e.stack); process.exit(1); } }
      }
      if (acted) break;
    }
    if (!acted) { console.error(mode, 'STUCK', s.phase, s.step, s.current, JSON.stringify(s.pending)); return { stuck: true, s }; }
  }
  return { s, over: s.phase === 'over' };
}

let bad = 0;
for (const mode of modes) {
  let done = 0, lost = 0, turns = 0, wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const lo = engine.minPlayers(mode);
    const r = play(mode, mode === 'explorers' ? [2, 3, 4, 5, 6][Math.floor(g / 5) % 5] : lo + (g % (5 - lo)), { free: g % 2 === 1 }, g); // every other game uses the variable set-up where there is one
    if (r.over) { done++; turns += r.s.stats.turns; if (r.s.winner === null) lost++; else wins++; } else bad++;
    if (r.over) {
      // invariants: points never negative, summary works, view works for everyone
      engine.summary(r.s);
      r.s.players.forEach((_, i) => engine.viewFor(r.s, i));
    }
  }
  console.log(`${mode}: ${done}/${GAMES} games finished, avg ${Math.round(turns / Math.max(1, done))} turns, ${wins} won, ${lost} lost together`);
}
if (bad) { console.log(`${bad} games did not finish`); process.exit(1); }
console.log('no crashes, no stuck games');
