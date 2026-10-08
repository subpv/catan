'use strict';
// Rule checks for the Traders & Barbarians variants and the two small scenarios, against the English 6th edition book (2025):
// Fishing on Catan, Rivers of Catan, Friendly Robber, Harbors of Catan (Strongest Ports), Event Cards.
const assert = require('assert');
const { createGame, act, viewFor, GameError } = require('../../server/engine/classic/game');
const C = require('../../server/engine/shared/constants');

const mk = (variants, n = 3, extra = {}) => createGame({ id: 't', mode: extra.mode || 'classic', options: { expansion: 'traders', variants, ...extra }, players: Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i })) });
const play = s => { s.phase = 'play'; s.step = 'main'; s.turn = 5; s.current = 0; s.setup = null; s.flags = { rolled: true }; s.pending = []; return s; };
const fails = (fn, re) => { try { fn(); } catch (e) { if (!(e instanceof GameError)) throw e; if (re) assert(re.test(e.message), e.message); return; } assert.fail('should have failed'); };
let n = 0;
const test = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAILED: ' + name); throw e; } };
const rowsOf = b => { const ys = [...new Set(b.hexes.map(h => h.y))].sort((a, c) => a - c); return ys.map(y => b.hexes.filter(h => h.y === y).sort((a, c) => a.x - c.x)); };
// the next roll is this event card (the deck is stacked)
const stack = (s, ev, num) => { s.eventCards = true; s.deck = [{ ev, n: num }]; s.step = 'roll'; s.flags = {}; };
const edgesOf = (b, g) => g.verts.slice(1).map((v, k) => b.edges.find(e => e.v.includes(v) && e.v.includes(g.verts[k])).id);
const giveAll = (s, k = 5) => s.players.forEach(pl => { for (const r of C.RES) pl.res[r] = k; });

test('fishing: token bag 11/10/8 fish plus the boot; costs 2/3/4/5/7; lake 2 3 11 12; grounds 4 5 6 8 9 10', () => {
  assert.deepStrictEqual(C.FISH_COSTS, { robber: 2, steal: 3, take: 4, road: 5, dev: 7 });
  assert.deepStrictEqual(C.FISH_BAG, { 1: 11, 2: 10, 3: 8 });
  assert.deepStrictEqual(C.LAKE_NUMBERS, [2, 3, 11, 12]);
  assert.deepStrictEqual([...C.FISH_NUMBERS].sort((a, b) => a - b), [4, 5, 6, 8, 9, 10]);
  const s = mk({ fishermen: true });
  assert.strictEqual(s.fish.bag.length, 30);
  assert.strictEqual(s.fish.bag.filter(x => x === 'boot').length, 1);
  assert.strictEqual(s.robber, null, 'the robber waits beside the board');
  assert.strictEqual(s.board.lakes.length, 1);
  assert.strictEqual(s.board.fishing.length, 6);
  assert.strictEqual(s.options.vpTarget, 10);
});

test('fishing: the six grounds lie at the fixed V places, on coast corners, and no harbor sits on their edges', () => {
  for (let i = 0; i < 20; i++) {
    const s = mk({ fishermen: true });
    const b = s.board;
    assert(b.hexes[b.lakes[0]].neighbors.length === 6, 'the lake lies in the inner area');
    const rows = rowsOf(b);
    const top = [rows[0][0].id, rows[0][1].id];
    assert(b.fishing.some(g => b.vertices[g.verts[1]].hexes.length === 2 && b.vertices[g.verts[1]].hexes.every(h => top.includes(h))), 'a ground between the two left hexes of the top row');
    b.fishing.forEach(g => {
      assert.strictEqual(g.verts.length, 3);
      g.verts.forEach(v => assert(b.vertices[v].hexes.length <= 2, 'coast corner'));
      edgesOf(b, g).forEach(e => assert(!b.ports.some(p => p.edge === e), 'no harbor on a ground'));
    });
    assert.strictEqual(b.ports.length, 9);
  }
});

test('fishing 5-6 players: 2 lakes (4 and 10 on the second), 8 grounds (5 and 9 added), 14 more fish tokens', () => {
  const s = mk({ fishermen: true }, 5);
  assert.strictEqual(s.board.lakes.length, 2);
  assert.deepStrictEqual(s.board.hexes[s.board.lakes[1]].lake.slice().sort((a, b) => a - b), [4, 10]);
  assert.strictEqual(s.board.fishing.length, 8);
  assert.deepStrictEqual(s.board.fishing.map(g => g.number).sort((a, b) => a - b), [4, 5, 5, 6, 8, 9, 9, 10]);
  assert.strictEqual(s.fish.bag.length, 29 + 14 + 1);
  assert.strictEqual(s.board.ports.length, 11);
  s.board.fishing.forEach(g => edgesOf(s.board, g).forEach(e => assert(!s.board.ports.some(p => p.edge === e))));
});

test('fishing: a settlement on a producing ground gets 1 token, a city 2; the boot is revealed at once', () => {
  const s = play(mk({ fishermen: true }, 3));
  const g = s.board.fishing[0];
  s.buildings[g.verts[0]] = { p: 0, type: 'settlement' };
  s.buildings[g.verts[2]] = { p: 1, type: 'city' };
  s.fish.bag = [1, 'boot', 3, 2, 1]; // drawn from the end: 1, 2, 3 (boot next)
  stack(s, 'fine', g.number);
  act(s, 0, { type: 'roll' });
  assert.deepStrictEqual(s.players[0].fishTok, [1]);
  assert.deepStrictEqual(s.players[1].fishTok, [2, 3]);
  assert.strictEqual(s.fish.boot, null);
  s.fish.bag = [1, 'boot'];
  s.players[0].fishTok = []; s.players[1].fishTok = [];
  s.buildings[g.verts[0]].p = 1; delete s.buildings[g.verts[2]];
  stack(s, 'fine', g.number); s.current = 0;
  act(s, 0, { type: 'roll' });
  assert.deepStrictEqual(s.players[1].fishTok, []);
  assert.strictEqual(s.fish.boot, 1, 'the boot is shown at once, face up');
});

test('fishing: at most 7 tokens; with 7 you may swap one for a new token and stop drawing', () => {
  const s = play(mk({ fishermen: true }, 3));
  const g = s.board.fishing[0];
  s.buildings[g.verts[0]] = { p: 0, type: 'city' };
  s.players[0].fishTok = [1, 1, 1, 1, 1, 1, 1];
  s.fish.bag = [3, 3, 3];
  stack(s, 'fine', g.number);
  act(s, 0, { type: 'roll' });
  assert.strictEqual(s.players[0].fishTok.length, 7);
  assert(s.pending.some(p => p.type === 'fishSwap'));
  act(s, 0, { type: 'fishSwap', idx: 0 });
  assert.strictEqual(s.players[0].fishTok.length, 7);
  assert.strictEqual(s.players[0].fishTok.filter(x => x === 3).length, 1);
  assert.strictEqual(s.fish.bag.length, 2, 'drawing stopped after the swap');
});

test('fishing: spending fish (the best fit is paid, the excess is lost, one action at a time)', () => {
  const s = play(mk({ fishermen: true }, 3));
  s.players[0].fishTok = [3, 3, 1];
  giveAll(s, 3);
  act(s, 0, { type: 'useFish', what: 'take', res: 'ore' });
  assert.deepStrictEqual(s.players[0].fishTok, [3]);
  assert.strictEqual(s.players[0].res.ore, 4);
  fails(() => act(s, 0, { type: 'useFish', what: 'take', res: 'ore' }), /fish/);
  s.robber = 5;
  act(s, 0, { type: 'useFish', what: 'robber' });
  assert.strictEqual(s.robber, null);
  assert.deepStrictEqual(s.players[0].fishTok, [], 'the extra fish on the token are lost');
});

test('fishing: the old boot is passed to a player with the same or more VPs, with no waiting turn', () => {
  const s = play(mk({ fishermen: true }, 3));
  s.fish.boot = 0; s.fish.bootTurn = s.turn; // pulled up this very turn
  s.buildings[0] = { p: 1, type: 'settlement' };
  s.buildings[2] = { p: 1, type: 'settlement' };
  s.buildings[4] = { p: 0, type: 'settlement' };
  const L = viewFor(s, 0).legal;
  assert(L.boot && L.boot.includes(1) && !L.boot.includes(2));
  act(s, 0, { type: 'giveBoot', to: 1 });
  assert.strictEqual(s.fish.boot, 1);
  assert.strictEqual(viewFor(s, 0).players[1].vpTarget, 11);
});

test('rivers: tiles as printed (3-4 players), robber on a swamp, 2 on the 12, gold for roads, settlements and bridges', () => {
  for (let i = 0; i < 10; i++) {
    const s = mk({ rivers: true }, 3);
    const b = s.board, rows = rowsOf(b);
    const t = (r, k) => rows[r][k].terrain;
    assert.deepStrictEqual([t(1, 0), t(2, 1), t(3, 1), t(4, 1)], ['mountains', 'hills', 'pasture', 'swamp']);
    assert.deepStrictEqual([t(1, 2), t(2, 3), t(3, 3)], ['mountains', 'hills', 'swamp']);
    assert(b.swamps.includes(s.robber));
    assert.strictEqual(b.hexes.filter(h => h.terrain === 'desert').length, 0);
    assert.strictEqual(b.hexes.filter(h => h.number2 === 2).length, 1);
    assert.strictEqual(b.hexes.find(h => h.number2).number, 12);
    assert.strictEqual(b.bridgeSites.length, 3 + 1 + 2 + 1);
    assert.strictEqual(s.options.vpTarget, 10);
  }
  const s = play(mk({ rivers: true }, 3));
  const site = s.board.bridgeSites[0];
  const [a, c] = s.board.edges[site].v;
  s.buildings[a] = { p: 0, type: 'settlement' };
  giveAll(s, 5);
  const g0 = s.players[0].gold;
  act(s, 0, { type: 'buildBridge', e: site });
  assert.strictEqual(s.players[0].gold, g0 + 3);
  assert.strictEqual(s.players[0].res.brick, 3);
  assert.strictEqual(s.players[0].res.lumber, 4);
});

test('rivers 5-6 players: three rivers (swamp, hills, mountains / swamp, pasture, hills, mountains / pasture, pasture, mountains), no extra 2', () => {
  const s = mk({ rivers: true }, 5);
  const b = s.board, rows = rowsOf(b);
  const t = (r, k) => rows[r][k].terrain;
  assert.deepStrictEqual([t(0, 1), t(1, 1), t(2, 1)], ['swamp', 'hills', 'mountains']);
  assert.deepStrictEqual([t(6, 1), t(5, 1), t(4, 1), t(3, 1)], ['swamp', 'pasture', 'hills', 'mountains']);
  assert.deepStrictEqual([t(3, 3), t(3, 4), t(3, 5)], ['mountains', 'pasture', 'pasture']);
  assert.strictEqual(b.hexes.filter(h => h.number2).length, 0);
  assert.strictEqual(b.swamps.length, 2);
  assert.strictEqual(b.hexes.length, 30);
});

test('rivers: Wealthiest Catanian +1 (one player alone), Poor Catanian -2 (every player with the least gold)', () => {
  const s = play(mk({ rivers: true }, 3));
  s.players.forEach(pl => { pl.gold = 0; });
  assert.deepStrictEqual(s.players.map((_, p) => require('../../server/engine/classic/game').vp(s, p)), [0, 0, 0].map(() => 0));
  s.players[0].gold = 4; s.players[1].gold = 1; s.players[2].gold = 1;
  const view = viewFor(s, 0);
  assert.deepStrictEqual(view.players.map(p => p.riverVp), [1, -2, -2]);
  s.players[0].gold = 3; s.players[1].gold = 3; s.players[2].gold = 2;
  assert.deepStrictEqual(viewFor(s, 0).players.map(p => p.riverVp), [0, 0, -2], 'a tie leaves the Wealthiest tile in the supply');
});

test('rivers: coins buy a card (twice per turn); cards buy coins at the bank rates', () => {
  const s = play(mk({ rivers: true }, 3));
  s.players[0].gold = 5; s.players[0].res.wool = 4;
  act(s, 0, { type: 'goldTrade', res: 'ore' });
  act(s, 0, { type: 'goldTrade', res: 'ore' });
  fails(() => act(s, 0, { type: 'goldTrade', res: 'ore' }), /twice/);
  act(s, 0, { type: 'bankTrade', give: 'wool', get: 'gold' });
  assert.strictEqual(s.players[0].gold, 2);
});

test('friendly robber: no tile with a building of a player who has only 2 VPs', () => {
  const s = play(mk({ friendly: true }, 3));
  const hexes = s.board.hexes.filter(h => h.terrain !== 'sea').map(h => h.id);
  const h1 = s.board.hexes[hexes[0]], h2 = s.board.hexes.find(h => h.id !== h1.id && !h.verts.some(v => h1.verts.includes(v)));
  s.buildings = {};
  s.buildings[h1.verts[0]] = { p: 1, type: 'settlement' }; s.buildings[h1.verts[2]] = { p: 1, type: 'settlement' }; // 2 VPs
  [0, 2, 4].forEach(k => { s.buildings[h2.verts[k]] = { p: 2, type: 'settlement' }; }); // 3 VPs
  s.robber = null;
  s.pending = [{ type: 'moveRobber', player: 0, id: 1, group: 0 }];
  s.pgroup = 0;
  const legal = viewFor(s, 0).legal.robberHexes;
  assert(legal && !legal.includes(h1.id), 'the tile of the 2-VP player is closed');
  assert(legal.includes(h2.id), 'the tile of the 3-VP player is open');
});

test('friendly robber: with no valid tile the robber goes to the desert and robs a player with more than 2 VPs', () => {
  const s = play(mk({ friendly: true }, 3));
  const desert = s.board.hexes.find(h => h.terrain === 'desert');
  s.board.hexes.forEach(h => { if (h.id !== desert.id) h.hidden = true; });
  s.robber = desert.id; // he stands on the only open tile already
  [0, 2, 4].forEach(k => { s.buildings[desert.verts[k]] = { p: 2, type: 'settlement' }; }); // 3 VPs, next to the desert
  s.buildings[desert.verts[1]] = undefined; delete s.buildings[desert.verts[1]];
  s.players[2].res.grain = 2;
  s.players.forEach(pl => { pl.res.lumber = 0; });
  stack(s, 'raid', 7);
  act(s, 0, { type: 'roll' });
  assert.strictEqual(s.robber, desert.id);
  assert.strictEqual(s.pending.filter(p => p.type === 'moveRobber').length, 0);
  assert.strictEqual(s.players[0].res.grain, 1, 'one card was stolen from the 3-VP player');
  assert.strictEqual(s.players[2].res.grain, 1);
});

test('event cards: Robber Flees puts the robber on a desert, or takes it off the board when there is none', () => {
  const s = play(mk({ events: true }, 3));
  s.robber = null;
  stack(s, 'retreat', 4);
  act(s, 0, { type: 'roll' });
  assert.strictEqual(s.board.hexes[s.robber].terrain, 'desert');
  const r = play(mk({ events: true, rivers: true }, 3));
  assert(r.board.swamps.includes(r.robber));
  stack(r, 'retreat', 4);
  act(r, 0, { type: 'roll' });
  assert.strictEqual(r.robber, null, 'there is no desert in Rivers');
});

test('event cards: 36 shuffled, 5 under the New Year card; the New Year card makes a new deck', () => {
  const s = mk({ events: true }, 3);
  assert.strictEqual(s.deck.length, 37);
  assert.strictEqual(s.deck.findIndex(c => c.ev === 'newyear'), 5);
  assert.strictEqual(C.EVENT_CARDS.reduce((a, c) => a + c[2], 0), 36);
  const per = {};
  C.EVENT_CARDS.forEach(([, num, k]) => { per[num] = (per[num] || 0) + k; });
  assert.deepStrictEqual(per, { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 });
});

test('harbors of Catan: 3 VPs in buildings on ports win the Strongest Ports tile (2 VPs), only a player with more takes it; 11 VPs win', () => {
  const s = play(mk({ harbors: true }, 3));
  assert.strictEqual(s.options.vpTarget, 11);
  const ports = s.board.vertices.filter(v => v.port).map(v => v.id);
  const far = [];
  for (const v of ports) if (far.every(x => x !== v && !s.board.vertices[x].adj.includes(v))) far.push(v);
  assert(far.length >= 6);
  const rich = () => { s.players.forEach(pl => { pl.res = { lumber: 9, brick: 9, wool: 9, grain: 9, ore: 9 }; }); };
  rich();
  s.buildings[far[0]] = { p: 0, type: 'settlement' };
  s.buildings[far[1]] = { p: 0, type: 'city' };
  s.buildings[far[2]] = { p: 1, type: 'city' };
  s.buildings[far[3]] = { p: 1, type: 'settlement' };
  assert.strictEqual(viewFor(s, 0).hub.harborHolder, null);
  act(s, 0, { type: 'buildCity', v: far[0] }); // 4 points
  assert.strictEqual(viewFor(s, 0).hub.harborHolder, 0);
  assert.strictEqual(viewFor(s, 0).players[0].harborVp, 2);
  s.current = 1; rich();
  act(s, 1, { type: 'buildCity', v: far[3] }); // 4 points: a tie does not take the tile
  assert.strictEqual(viewFor(s, 0).hub.harborHolder, 0);
  s.buildings[far[4]] = { p: 1, type: 'settlement' };
  act(s, 1, { type: 'buildCity', v: far[4] }); // 6 points
  assert.strictEqual(viewFor(s, 0).hub.harborHolder, 1);
  assert.strictEqual(viewFor(s, 0).players[0].harborVp, 0);
});

test('event cards: Epidemic gives a city 1 resource only; Calm Seas goes to the most buildings on ports', () => {
  const s = play(mk({ events: true }, 3));
  const h = s.board.hexes.find(x => x.number && x.terrain !== 'desert');
  s.board.hexes.forEach(x => { if (x.id !== h.id && x.number === h.number) x.number = 12 === h.number ? 11 : 12; });
  s.buildings = { [h.verts[0]]: { p: 0, type: 'city' }, [h.verts[2]]: { p: 1, type: 'settlement' } };
  s.robber = null;
  const res = C.TERRAIN_RES[h.terrain];
  const before = s.players[0].res[res];
  stack(s, 'plague', h.number);
  act(s, 0, { type: 'roll' });
  assert.strictEqual(s.players[0].res[res], before + 1);
  const t = play(mk({ events: true }, 3));
  const ports = t.board.vertices.filter(v => v.port).map(v => v.id), far = [];
  for (const v of ports) if (far.every(x => x !== v && !t.board.vertices[x].adj.includes(v))) far.push(v);
  t.buildings = { [far[0]]: { p: 0, type: 'settlement' }, [far[1]]: { p: 1, type: 'settlement' }, [far[2]]: { p: 1, type: 'settlement' } };
  stack(t, 'calm', 12);
  act(t, 0, { type: 'roll' });
  assert(t.pending.length === 1 && t.pending[0].player === 1 && t.pending[0].type === 'bankPick');
});

test('event cards with Cities & Knights: card text, then the event die and the red die, then production', () => {
  const s = mk({ events: true }, 3, { mode: 'knights' });
  play(s);
  stack(s, 'fine', 9);
  act(s, 0, { type: 'roll' });
  const keys = s.log.map(l => l.k);
  const iCard = keys.findIndex(k => k.startsWith('Event card'));
  const iDie = keys.findIndex(k => k.startsWith('Event die'));
  assert(iCard >= 0 && iDie > iCard, 'the event die comes after the card text');
  assert.strictEqual(typeof s.dice.red, 'number');
  assert.strictEqual(s.dice.yellow, null);
});

console.log(`tb-variants: ${n} checks passed`);
