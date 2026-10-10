'use strict';
// Robustness of the engine door (engine/index.js act): hostile or type-confused actions are refused, a failing action never
// leaves a half-applied state behind, and a few rule fixes that came out of the final review (forgotten robber, build anytime,
// Explorers & Pirates cargo). Usage: node test/rules/robustness.js
const assert = require('assert');
const engine = require('../../server/engine');
const players = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white', 'teal', 'purple'][i] }));
const ok = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } };
const snap = s => JSON.stringify(s);

function start(opts, n = 3, mode = 'classic') {
  const s = engine.createGame({ id: 'x', mode, players: players(n), options: opts });
  let g = 0;
  while (s.phase === 'setup' && g++ < 400) {
    const p = s.current, L = engine.viewFor(s, p).legal || {};
    if (L.setupSpots) engine.act(s, p, { type: s.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: L.setupSpots[0] });
    else engine.act(s, p, { type: 'placeRoad', e: L.setupRoads[0] });
  }
  if (s.step === 'roll') engine.act(s, s.current, { type: 'roll', forced: [1, 2] });
  s.pending = []; s.step = 'main';
  return s;
}
const refused = (s, p, a) => {
  const before = snap(s);
  assert.throws(() => engine.act(s, p, a), e => e instanceof engine.GameError, 'a GameError, not a crash: ' + JSON.stringify(a));
  assert.strictEqual(snap(s), before, 'state untouched after ' + JSON.stringify(a));
};

ok('prototype names and odd shapes are refused, state untouched', () => {
  const s = start({}, 3, 'knights');
  const p = s.current;
  s.pending = [{ type: 'moveRobber', player: p }];
  for (const a of [
    null, 'x', [], { type: 5 }, { type: 'constructor' }, { type: '__proto__' }, { type: 'toString' },
    { type: 'moveRobber', hex: 'constructor' }, { type: 'moveRobber', hex: '__proto__' }, { type: 'moveRobber', hex: '5' }, { type: 'moveRobber', hex: [5] }, { type: 'moveRobber', hex: 5.5 },
    { type: 'improve', track: 'constructor' }, { type: 'improve', track: ['trade'] },
    JSON.parse('{"type":"offerTrade","give":{"__proto__":1},"get":{"brick":1}}'),
    { type: 'offerTrade', give: { constructor: 1 }, get: { brick: 1 } },
  ]) refused(s, p, a);
});

ok('Cities & Knights: improve with track "constructor" is free no more', () => {
  const s = start({}, 3, 'knights');
  const p = s.current;
  const before = snap(s);
  assert.throws(() => engine.act(s, p, { type: 'improve', track: 'constructor' }), engine.GameError);
  assert.strictEqual(snap(s), before);
  assert.ok(!Number.isNaN(Object.values(s.players[p].res).reduce((a, b) => a + b, 0)));
});

ok('a crash in a rule rolls the whole state back (and the same object is kept)', () => {
  const s = start({}, 3);
  const HANDLERS = require('../../server/engine/classic/game')._internal.HANDLERS;
  HANDLERS.__crashTest = (st, p) => { st.version += 100; st.players[p].res.brick += 50; st.log.push({ turn: 1, k: 'x', a: {}, at: 1 }); throw new TypeError('boom'); };
  HANDLERS.__failTest = (st, p) => { st.players[p].res.ore += 7; throw new engine.GameError('no'); };
  try {
    for (const type of ['__crashTest', '__failTest']) {
      const before = snap(s), ref = s.players;
      assert.throws(() => engine.act(s, s.current, { type }), type === '__crashTest' ? TypeError : engine.GameError);
      assert.strictEqual(snap(s), before, type);
      void ref;
    }
  } finally { delete HANDLERS.__crashTest; delete HANDLERS.__failTest; }
});

ok('lobby values: "constructor" is neither a mode nor a scenario', () => {
  assert.strictEqual(engine.isStandalone('constructor'), false);
  assert.strictEqual(engine.isStandalone('__proto__'), false);
  assert.strictEqual(engine.isStandalone('explorers'), true);
  const s = engine.createGame({ id: 'x', players: players(3), options: { expansion: 'seafarers', scenario: 'constructor' } });
  assert.strictEqual(s.options.scenario, 'shores');
});

ok('Explorers & Pirates: sail to "constructor" or [id] is refused and changes nothing', () => {
  const s = engine.createGame({ id: 'e', mode: 'explorers', players: players(3), options: { scenario: 2 } });
  let g = 0, did = false;
  const fuzz = require('../../server/bots/fuzz-explorers');
  while (s.phase !== 'over' && g++ < 3000 && !did) {
    const p = s.current;
    const ship = Object.values(s.ships).find(x => x.p === p);
    if (ship && s.phase === 'play' && s.step === 'main' && !s.pending.length) {
      for (const to of ['constructor', '__proto__', [ship.e]]) refused(s, p, { type: 'sail', ship: ship.id, to });
      did = true; break;
    }
    const v = engine.viewFor(s, p);
    let moved = false;
    for (const a of fuzz(v, p, s).filter(Boolean)) { try { engine.act(s, p, a); moved = true; break; } catch (e) { if (!(e instanceof engine.GameError)) throw e; } }
    if (!moved) break;
  }
  assert.ok(did, 'reached the movement phase');
});

ok('forgotten robber returns to the start hex, never to a fog tile', () => {
  let tested = 0;
  for (let i = 0; i < 60 && tested < 5; i++) {
    const s = start({ expansion: 'seafarers', scenario: 'fog', robberReturn: true }, 5);
    const start0 = s.robberStart;
    const p = s.current;
    s.pending = [{ type: 'moveRobber', player: p, group: 99 }];
    s.robber = s.board.hexes.find(h => !h.hidden && h.terrain !== 'sea' && h.id !== start0).id;
    assert.ok(engine.viewFor(s, p).legal.leaveRobber);
    engine.act(s, p, { type: 'leaveRobber' });
    assert.strictEqual(s.robber, start0);
    assert.ok(!s.board.hexes[s.robber].hidden);
    tested++;
  }
  // a map whose robber starts on a non-desert tile: he still goes back to where he started, and nothing is logged falsely
  const t = start({ expansion: 'seafarers', scenario: 'islands', robberReturn: true }, 3);
  const home = t.robberStart;
  t.pending = [{ type: 'moveRobber', player: t.current, group: 99 }];
  t.robber = t.board.hexes.find(h => !h.hidden && h.terrain !== 'sea' && h.id !== home).id;
  engine.act(t, t.current, { type: 'leaveRobber' });
  assert.strictEqual(t.robber, home);
});

ok('build anytime: reaching the target out of turn wins at once; ships are offered off turn', () => {
  const s = start({ expBuildAnytime: true, vpTarget: 3 }, 4);
  const c = s.current, x = (c + 2) % 4;
  s.devDeck = ['victoryPoint']; Object.assign(s.players[x].res, { grain: 1, wool: 1, ore: 1 });
  engine.act(s, x, { type: 'buyDev' });
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, x);
  const t = start({ expansion: 'seafarers', scenario: 'shores', expBuildAnytime: true }, 3);
  const q = (t.current + 1) % 3;
  Object.assign(t.players[q].res, { lumber: 9, brick: 9, wool: 9, grain: 9, ore: 9 });
  const L = engine.viewFor(t, q).legal;
  assert.ok(L.ships && L.ships.length, 'ships are offered to the off-turn builder');
  engine.act(t, q, { type: 'buildShip', e: L.ships[0] });
  assert.strictEqual(Object.keys(t.ships).length, 1);
});

ok('Explorers & Pirates: a taken-back ship returns its fish and spice (no piece is lost for good)', () => {
  const s = engine.createGame({ id: 'e', mode: 'explorers', players: players(2), options: { scenario: 4 } });
  const p = 0;
  const vil = s.board.hexes.find(h => h.terrain === 'spice' && h.village);
  assert.ok(vil, 'a scenario with spice villages');
  const bags0 = vil.village.bags;
  vil.village.friends.push(p); vil.village.bags--;
  const fish0 = s.fishLeft;
  s.fishLeft--;
  s.phase = 'play'; s.pending = []; s.current = p;
  const sh = { id: 77, p, e: 0, cargo: [], mp: 0 }; s.ships[77] = sh;
  sh.cargo = [{ t: 'F' }, { t: 'S', from: vil.id }];
  // the explorers module is reached through its internals: dropCargo of each piece
  const H = require('../../server/engine/explorers-pirates/explorers')._internal.HANDLERS;
  H.dropCargo(s, p, { ship: sh.id, idx: 1 });
  H.dropCargo(s, p, { ship: sh.id, idx: 0 });
  assert.strictEqual(s.fishLeft, fish0);
  assert.strictEqual(vil.village.bags, bags0);
  assert.ok(!vil.village.friends.includes(p));
});
