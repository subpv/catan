'use strict';
// Random-play fuzzer: plays many games with random legal-ish moves and checks invariants.
require('../seed');
const { createGame, act, viewFor, GameError, _internal, vp } = require('../../server/engine/classic/game');
const C = require('../../server/engine/shared/constants');

const pick = a => a[Math.floor(Math.random() * a.length)];
let errors = 0;

const candidates = require('../../server/bots/fuzz-classic');

function checkInvariants(s) {
  for (const pl of s.players) {
    for (const [k, n] of Object.entries(pl.res)) if (n < 0) throw new Error(`negative ${k}`);
    for (const [k, n] of Object.entries(pl.comm)) if (n < 0) throw new Error(`negative ${k}`);
  }
  // the golden trail on the board must be exactly the Longest Road: as long as it, connected, all owned by the holder
  const lr = s.longestRoad;
  if (lr.p != null) {
    const wsum = lr.edges ? lr.edges.reduce((a, e) => a + (s.hub && s.hub.cv && s.hub.cv.wagons[e] !== undefined ? 2 : 1), 0) : -1;
    if (!lr.edges || wsum !== lr.len) throw new Error(`longest road trail has ${lr.edges && lr.edges.length} edges, length is ${lr.len}`);
    for (const e of lr.edges) if (s.roads[e] !== lr.p && !(s.ships && s.ships[e] && s.ships[e].p === lr.p)) throw new Error('longest road trail uses a foreign edge');
    for (let i = 1; i < lr.edges.length; i++) {
      const a = s.board.edges[lr.edges[i - 1]].v, b = s.board.edges[lr.edges[i]].v;
      if (!a.some(v => b.includes(v))) throw new Error('longest road trail is not connected');
    }
  }
  // 5–6 players: the turn is shared by stone 1 (rolls, trades with everybody) and stone 2 (3 seats to the left: no dice, bank trades only)
  if (s.options.paired && s.phase === 'play') {
    if (!s.pair) throw new Error('paired game without stones');
    const n = s.players.length;
    const want = s.pair.phase === 1 ? s.pair.one : (s.pair.one + 3) % n;
    if (s.current !== want) throw new Error('wrong player for stone ' + s.pair.phase);
    if (s.pair.phase === 2 && (s.step !== 'main' || !s.flags.stone2)) throw new Error('stone 2 must not roll');
    if (s.pair.phase === 2 && s.trade) throw new Error('stone 2 cannot offer trades');
  }
  if (s.options.big !== true && s.players.length > 4) throw new Error('5-6 players need the big board');
  const def = C.BOARDS[s.options.big ? 'extended' : 'standard'];
  for (const r of C.RES) {
    const total = s.bank[r] + s.players.reduce((a, pl) => a + pl.res[r], 0);
    if (total !== def.bank) throw new Error(`resource conservation broken for ${r}: ${total}`);
  }
}

function play(mode, n, options = {}, maxSteps = 20000) {
  const s = createGame({ id: 't', mode, options, players: Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i })) });
  let steps = 0, fails = 0;
  while (s.phase !== 'over' && steps < maxSteps) {
    steps++;
    const actors = s.players.map((_, i) => i);
    let moved = false;
    for (const p of actors.sort(() => Math.random() - 0.5)) {
      const c = candidates(s, p);
      if (!c.length) continue;
      const a = pick(c);
      try { act(s, p, a); moved = true; (play.hist = play.hist || []).push(p + ':' + a.type); if (play.hist.length > 40) play.hist.shift(); checkInvariants(s); viewFor(s, p); break; } catch (e) {
        if (!(e instanceof GameError)) { console.error('CRASH', mode, n, JSON.stringify(options), JSON.stringify(a), e.stack); errors++; return { crashed: true }; }
        fails++; play.lastErr = e.message + ' ' + JSON.stringify(a);
      }
    }
    if (!moved && steps % 50 === 0) {
      // stuck detection
      const anyCandidates = s.players.some((_, p) => candidates(s, p).length);
      if (!anyCandidates) { console.error('STUCK', mode, n, JSON.stringify(options), s.phase, s.step, JSON.stringify(s.pending)); errors++; return { stuck: true }; }
    }
  }
  if (process.env.DEBUG_END && s.phase !== 'over') console.log((play.hist || []).join(' '), 'PENDING', JSON.stringify(s.pending), 'LASTERR', play.lastErr, 'UNFINISHED', mode, n, 'turn', s.turn, 'vp', s.players.map((_, i) => vp(s, i)).join(','), s.hub && s.hub.bb ? JSON.stringify({ barb: s.hub.bb.barb, supply: s.hub.bb.supply, pr: s.hub.bb.prisoners }) : '');
  return { over: s.phase === 'over', steps, turns: s.turn, winner: s.winner, fails };
}

const CONFIGS = {
  classic: ['classic', {}],
  knights: ['knights', {}],
  'classic-big4': ['classic', { big: true }],
  'classic-std6': ['classic', { big: false }],
  'sea-shores': ['classic', { expansion: 'seafarers', scenario: 'shores' }],
  'sea-islands': ['classic', { expansion: 'seafarers', scenario: 'islands' }],
  'sea-fog': ['classic', { expansion: 'seafarers', scenario: 'fog' }],
  'sea-desert': ['classic', { expansion: 'seafarers', scenario: 'desert' }],
  'sea-cloth': ['classic', { expansion: 'seafarers', scenario: 'cloth' }],
  'sea-newworld': ['classic', { expansion: 'seafarers', scenario: 'newworld' }],
  'sea-wonders': ['classic', { expansion: 'seafarers', scenario: 'wonders' }],
  'sea-tribe': ['classic', { expansion: 'seafarers', scenario: 'tribe' }],
  'sea-variable': ['classic', { expansion: 'seafarers', scenario: 'shores', variable: true }],
  'sea-knights': ['knights', { expansion: 'seafarers', scenario: 'shores' }],
  'tb-fish': ['classic', { expansion: 'traders', variants: { fishermen: true } }],
  'tb-rivers': ['classic', { expansion: 'traders', variants: { rivers: true } }],
  'tb-all': ['classic', { expansion: 'traders', variants: { fishermen: true, events: true, friendly: true, harbors: true } }],
  'tb-rivers-all': ['classic', { expansion: 'traders', variants: { rivers: true, events: true, friendly: true, harbors: true } }],
  'tb-caravans': ['classic', { expansion: 'traders', variants: { caravans: true } }],
  'tb-caravans-56': ['classic', { expansion: 'traders', variants: { caravans: true }, big: true }],
  'tb-caravans-two': ['classic', { expansion: 'traders', variants: { caravans: true, two: true } }],
  'tb-barb': ['classic', { expansion: 'traders', variants: { barbarians: true } }],
  'tb-traders': ['classic', { expansion: 'traders', variants: { traders: true } }],
  'tb-traders-all': ['classic', { expansion: 'traders', variants: { traders: true, events: true, harbors: true } }],
  'tb-barb-56': ['classic', { expansion: 'traders', variants: { barbarians: true }, big: true }],
  'tb-traders-56': ['classic', { expansion: 'traders', variants: { traders: true } }], // the 5-6 player map, paired turns
  'tb-traders-56-all': ['classic', { expansion: 'traders', variants: { traders: true, events: true, harbors: true, friendly: true } }],
  'tb-barb-all': ['classic', { expansion: 'traders', variants: { barbarians: true, events: true, harbors: true } }],
  'tb-events': ['classic', { expansion: 'traders', variants: { events: true } }],
  'tb-friendly': ['classic', { expansion: 'traders', variants: { friendly: true } }],
  'tb-harbors': ['classic', { expansion: 'traders', variants: { harbors: true } }],
  'tb-knights': ['knights', { expansion: 'traders', variants: { fishermen: true, rivers: true, events: true } }],
  'classic-rr': ['classic', { robberReturn: true }],
  'knights-rr': ['knights', { robberReturn: true }],
  'sea-rr': ['classic', { expansion: 'seafarers', scenario: 'shores', robberReturn: true }],
  'classic-sb': ['classic', { startBoth: true }],
  'classic-kf': ['classic', { knightsFree: true }],
  'classic-56': ['classic', {}],
  'knights-sb': ['knights', { startBoth: true }],
};
const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(CONFIGS).slice(0, 2);
const runs = +process.argv[2] || 60;
const res = Object.fromEntries(only.map(k => [k, []]));
for (let i = 0; i < runs; i++) {
  for (const k of only) {
    const [mode, opts] = CONFIGS[k];
    const n = k.endsWith('-56') ? 5 + (i % 2) : k === 'tb-caravans-two' ? 2 : 2 + (i % (opts.variants && (opts.variants.caravans || opts.variants.barbarians || opts.variants.traders) ? 3 : 5));
    const o = { ...opts };
    if (opts.expansion && opts.expansion !== 'none' && opts.big === undefined && n > 4) o.big = true;
    res[k].push(play(mode, n, o));
  }
}
for (const [m, r] of Object.entries(res)) {
  const done = r.filter(x => x.over).length;
  const avgT = Math.round(r.filter(x => x.over).reduce((a, x) => a + x.turns, 0) / Math.max(1, done));
  console.log(`${m}: ${done}/${r.length} games finished, avg ${avgT} turns`);
}
console.log(errors ? `${errors} PROBLEMS` : 'no crashes, no stuck games');
process.exit(errors ? 1 : 0);
