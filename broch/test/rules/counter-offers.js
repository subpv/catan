'use strict';
// Counter-offers in player trading: the answering player proposes other terms, only the active player can take them.
// Usage: node test/rules/counter-offers.js
const assert = require('assert');
const engine = require('../../server/engine');

const players = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i, color: ['red', 'blue', 'orange', 'white', 'green', 'purple'][i] }));
const act = (s, p, a) => engine.act(s, p, a);
const throws = (fn, msg) => assert.throws(fn, e => (msg ? e.message.includes(msg) : true));
const ok = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } };

// bring a game to the main phase by playing the setup greedily; falls back to the first legal anything
function toMain(s) {
  let guard = 0;
  while ((s.phase === 'setup' || s.phase === 'placement') && guard++ < 400) {
    const p = s.current, v = engine.viewFor(s, p), L = v.legal || {};
    if (L.setupSpots) act(s, p, { type: s.setup && s.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: L.setupSpots[0] });
    else if (L.setupRoads) act(s, p, { type: 'placeRoad', e: L.setupRoads[0] });
    else throw new Error('cannot play the setup of ' + s.mode);
  }
  return s;
}
// the active player has rolled (cards are given by hand below)
function mainStep(s) {
  const p = s.current;
  if (s.phase !== 'main') throw new Error('not in the main phase: ' + s.phase);
  let g = 0;
  while (s.step !== 'main' && g++ < 5) {
    const v = engine.viewFor(s, s.current);
    const a = (v.legal && v.legal.actions) || [];
    if (s.step === 'roll' || a.includes('roll')) act(s, s.current, { type: 'roll' });
    else if (s.pending && s.pending.length) break;
    else break;
  }
}

function scenario(label, mode, n, options, kinds) {
  ok(`${label}: counter-offer is taken`, () => {
    const s = toMain(engine.createGame({ id: 't', mode, players: players(n), options: options || {} }));
    const p = s.current, q = (p + 1) % n, r = (p + 2) % n;
    s.step = 'main'; s.pending = []; s.flags = Object.assign({}, s.flags, { rolled: true, drawn: true });
    const [A, B, C] = kinds;
    const set = (i, o) => { const pl = s.players[i]; (pl.res || (pl.res = {})); for (const k of Object.keys(pl.res)) pl.res[k] = 0; Object.assign(pl.res, o); };
    set(p, { [A]: 2 }); set(q, { [B]: 1, [C]: 3 }); set(r, { [B]: 0 });
    act(s, p, { type: 'offerTrade', give: { [A]: 1 }, get: { [B]: 2 } }); // q cannot pay this
    const id = s.trade.id;
    throws(() => act(s, q, { type: 'respondTrade', id, accept: true }));
    // q counters: gives 1 B and wants nothing less than 1 A -> bad (same kind) / ok variant: gives C, wants A
    throws(() => act(s, p, { type: 'counterTrade', id, give: { [A]: 1 }, get: { [B]: 1 } }), 'No such offer');
    throws(() => act(s, q, { type: 'counterTrade', id, give: { [A]: 1 }, get: { [B]: 1 } }), 'do not have');
    act(s, q, { type: 'counterTrade', id, give: { [C]: 2 }, get: { [A]: 1 } });
    assert.strictEqual(s.trade.responses[q], 'counter');
    assert.deepStrictEqual(s.trade.counters[q], { give: { [A]: 1 }, get: { [C]: 2 } }); // from the offerer's side
    throws(() => act(s, r, { type: 'confirmTrade', with: q }), '');          // only the offerer confirms
    throws(() => act(s, p, { type: 'confirmTrade', with: r }), 'not accepted');
    act(s, p, { type: 'confirmTrade', with: q });
    assert.strictEqual(s.players[p].res[A], 1); assert.strictEqual(s.players[p].res[C], 2);
    assert.strictEqual(s.players[q].res[A], 1); assert.strictEqual(s.players[q].res[C], 1); assert.strictEqual(s.players[q].res[B], 1);
    assert.strictEqual(s.trade, null);
    // the view carries the counters
    act(s, p, { type: 'offerTrade', give: { [A]: 1 }, get: { [C]: 1 } });
    act(s, q, { type: 'counterTrade', id: s.trade.id, give: { [C]: 1 }, get: { [A]: 1 } });
    assert.ok(engine.viewFor(s, r).trade.counters[q]);
    // the counter is checked again when it is taken
    s.players[q].res[C] = 0;
    throws(() => act(s, p, { type: 'confirmTrade', with: q }), 'no longer');
  });
}

scenario('classic', 'classic', 3, {}, ['lumber', 'brick', 'ore']);
scenario('knights', 'knights', 3, {}, ['lumber', 'brick', 'ore']);
scenario('energies', 'energies', 3, {}, ['wood', 'clay', 'fiber']);
scenario('humankind', 'humankind', 3, {}, ['fur', 'bone', 'meat']);

ok('energies: counter obeys the 5-energy limit and the same-kind rule', () => {
  const s = toMain(engine.createGame({ id: 't', mode: 'energies', players: players(3), options: {} }));
  const p = s.current, q = (p + 1) % 3;
  s.step = 'main'; s.pending = []; s.flags = { drawn: true, rolled: true };
  Object.assign(s.players[p].res, { wood: 1, energy: 0, food: 0 });
  Object.assign(s.players[q].res, { wood: 0, energy: 4, food: 2 });
  act(s, p, { type: 'offerTrade', give: { wood: 1 }, get: { food: 1 } });
  const id = s.trade.id;
  throws(() => act(s, q, { type: 'counterTrade', id, give: { food: 1 }, get: { food: 1 } }), 'same kind');
  throws(() => act(s, q, { type: 'counterTrade', id, give: { food: 1 }, get: { energy: 2 } }), '5 energy');
  Object.assign(s.players[p].res, { energy: 5 });
  act(s, q, { type: 'counterTrade', id, give: { food: 1 }, get: { wood: 1 } });
  Object.assign(s.players[q].res, { energy: 0 });
  s.trade.counters[q] = { give: { wood: 1 }, get: { energy: 1 } };
  s.players[p].res.energy = 5;
  throws(() => act(s, p, { type: 'confirmTrade', with: q }), '5 energy');
});

scenario('explorers', 'explorers', 3, { scenario: 1 }, ['lumber', 'brick', 'ore']);
scenario('inkas', 'inkas', 3, {}, ['timber', 'stone', 'fleece']);
