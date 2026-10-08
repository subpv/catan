'use strict';
// Merchant Trains (the old "Caravans" scenario of Traders & Barbarians), checked against the English 6th edition book
// (T&B p13-14, 5-6 player book p7 + p12): node test/rules/tb-merchant.js
const { createGame, act, viewFor, GameError, vp, _internal } = require('../../server/engine/classic/game');

let bad = 0;
const ok = (cond, msg) => { if (!cond) { bad++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const pick = a => a[Math.floor(Math.random() * a.length)];
const names = n => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i }));
const make = (n, variants = {}, extra = {}) => createGame({ id: 't', mode: 'classic', options: { expansion: 'traders', variants: { caravans: true, ...variants }, ...extra }, players: names(n) });

// the founding phase with random legal moves
function setup(s) {
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 400) {
    const p = s.current, L = viewFor(s, p).legal;
    if (L.setupSpots) act(s, p, { type: s.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: pick(L.setupSpots) });
    else if (L.setupRoads) act(s, p, { type: 'placeRoad', e: pick(L.setupRoads) });
    else break;
  }
}
const empty = s => s.players.forEach(pl => { Object.keys(pl.res).forEach(k => { pl.res[k] = 0; }); });
// a fresh game in the Action phase of player `p` (a settlement or city has been built this turn); hands are set by `hands`
function ready(n, variants, hands = {}, extra = {}) {
  const s = make(n, variants, extra);
  setup(s);
  empty(s);
  Object.entries(hands).forEach(([p, h]) => Object.assign(s.players[p].res, h));
  s.step = 'main'; s.flags = { rolled: true, builtHouse: true };
  if (s.pair) { s.pair.phase = 1; s.pair.one = s.current; }
  return s;
}
const L = (s, p) => viewFor(s, p).legal;
const pend = s => s.pending[0];
const wagons = s => Object.keys(s.hub.cv.wagons).length;
const throws = f => { try { f(); return false; } catch (e) { if (e instanceof GameError) return true; throw e; } };

// ---------------------------------------------------------------- board and setup
{
  const s = make(3);
  const b = s.board;
  ok(b.hexes.length === 19 && b.hexes.filter(h => h.terrain === 'desert').length === 0, '3-4 players: no desert on the board');
  ok(b.hexes.filter(h => h.terrain === 'waterhole').length === 1 && b.waterholes.length === 1, '3-4 players: one watering hole');
  const c = b.hexes[b.waterholes[0].hex];
  ok(Math.abs(c.x) < 1e-6 && Math.abs(c.y) < 1e-6 && c.number == null, 'the watering hole lies in the center and has no number chip');
  ok(b.hexes.filter(h => h.number != null).length === 18, '18 number chips');
  ok(b.waterholes[0].arrows.length === 3, 'three start locations');
  ok(s.hub.cv.pool === 22, '22 trade wagons');
  ok(s.robber === null, 'the robber waits next to the board');
  ok(s.options.vpTarget === 12, '12 victory points to win');
  ok(!s.options.paired, 'no paired turns with 3-4 players');
}
{
  const s = make(5);
  const b = s.board;
  ok(b.hexes.length === 30 && b.hexes.filter(h => h.terrain === 'desert').length === 0, '5-6 players: 30 tiles, both deserts returned to the box');
  ok(b.waterholes.length === 2 && b.hexes.filter(h => h.terrain === 'waterhole').length === 2, '5-6 players: two watering holes');
  // rows 3-4-5-6-5-4-3: the holes are the 2nd hex of row 3 and the 4th hex of row 5 (5-6 book p7)
  ok(b.waterholes[0].hex === 8 && b.waterholes[1].hex === 21, 'the watering holes lie where the 5-6 book prints them');
  const h1 = b.hexes[8], h2 = b.hexes[21];
  ok(Math.abs(h1.x + h2.x) < 1e-6 && Math.abs(h1.y + h2.y) < 1e-6, 'the two holes are point-symmetric');
  ok(b.hexes.filter(h => h.number != null).length === 28, '28 number chips');
  ok(b.waterholes.every(w => w.arrows.length === 3) && s.hub.cv.trains.length === 6, 'six start locations, three at each watering hole');
  ok(s.hub.cv.pool === 33, '22 + 11 trade wagons');
  ok(s.options.paired && s.options.big, 'paired turns on the big board');
  ok(b.ports.length === 11, 'frame with 11 harbors');
  const red = n => n === 6 || n === 8;
  ok(b.hexes.every(h => !red(h.number) || h.neighbors.every(n => !red(b.hexes[n].number))), 'no red numbers side by side');
  // the start edges of a hole are the 3 edges that point straight away from it and are not edges of the hole
  ok(b.waterholes.every(w => w.arrows.every(e => !b.hexes[w.hex].edges.includes(e) && b.edges[e].v.some(v => b.hexes[w.hex].verts.includes(v)))), 'start locations point away from the hexes');
}
{
  // lobby limits: Merchant Trains with 5-6 players is allowed, the knights rules are not
  let r = null; try { make(6); r = true; } catch (e) { r = false; }
  ok(r, 'Merchant Trains can be created with 6 players');
  ok(throws(() => createGame({ id: 't', mode: 'knights', options: { expansion: 'traders', variants: { caravans: true } }, players: names(3) })), 'not with Cities & Knights');
}

// ---------------------------------------------------------------- the voting round
// 1. a player with more votes than all the others together decides alone
{
  const s = ready(3, {}, { 0: { wool: 2 }, 1: { grain: 1 } });
  const p = s.current;
  s.players.forEach((pl, i) => { if (i !== p) Object.assign(pl.res, { wool: 0, grain: 0 }); });
  s.players[p].res.wool = 3; s.players[(p + 1) % 3].res.grain = 1;
  act(s, p, { type: 'endTurn' });
  ok(s.pending.length === 1 && pend(s).type === 'wagonCards' && pend(s).player === p, 'the voting round starts with the active player');
  act(s, p, { type: 'wagonCards', wool: 2, grain: 0 });
  ok(pend(s).type === 'wagonCards' && pend(s).player === (p + 1) % 3, 'then clockwise: the next player who holds wool or grain');
  ok(s.players[p].res.wool === 1, 'the bid cards leave the hand');
  act(s, (p + 1) % 3, { type: 'wagonCards', wool: 0, grain: 1 });
  ok(pend(s).type === 'wagonPlace' && pend(s).player === p, '2 votes against 1: the player with the majority chooses alone');
  const e = L(s, p).wagonPositions[0];
  act(s, p, { type: 'wagonPlace', pos: e });
  ok(wagons(s) === 1 && s.hub.cv.pool === 21, 'the wagon is placed and leaves the supply');
  ok(s.current === (p + 1) % 3 && s.phase === 'play', 'the turn passes on afterwards');
  ok(s.bank.wool >= 2, 'the bids return to the supply');
}
// 2. rule 1: the location with the most votes
{
  const s = ready(4, {}, { 0: { wool: 1 }, 1: { grain: 1 }, 2: { wool: 1 } });
  const p = s.current;
  [0, 1, 2, 3].forEach(i => { s.players[i].res.wool = 0; s.players[i].res.grain = 0; });
  const a = (p + 1) % 4, b = (p + 2) % 4;
  s.players[p].res.wool = 1; s.players[a].res.grain = 1; s.players[b].res.wool = 1;
  act(s, p, { type: 'endTurn' });
  act(s, p, { type: 'wagonCards', wool: 1, grain: 0 });
  act(s, a, { type: 'wagonCards', wool: 0, grain: 1 });
  act(s, b, { type: 'wagonCards', wool: 1, grain: 0 });
  ok(pend(s).type === 'wagonVote' && pend(s).player === p, 'no majority: the voters assign their votes to a place');
  const pos = L(s, p).wagonPositions;
  ok(pos.length === 3, 'at the start the wagon may go to any of the three start locations');
  ok(throws(() => act(s, p, { type: 'wagonVote', pos: 99999 })), 'a vote must name a legal location');
  act(s, p, { type: 'wagonVote', pos: pos[0] });
  act(s, a, { type: 'wagonVote', pos: pos[1] });
  act(s, b, { type: 'wagonVote', pos: pos[1] });
  ok(s.hub.cv.wagons[pos[1]] !== undefined && s.hub.cv.wagons[pos[0]] === undefined, 'the location with most votes (2 against 1) gets the wagon');
  ok(s.pending.length === 0, 'no further question');
}
// 3. rule 2: no location has the most votes, the player with the most votes chooses (here not the active player)
{
  const s = ready(3, {}, {});
  const p = s.current, q = (p + 1) % 3, r = (p + 2) % 3;
  s.players[p].res.wool = 2; s.players[q].res.wool = 3; s.players[r].res.grain = 1;
  act(s, p, { type: 'endTurn' });
  act(s, p, { type: 'wagonCards', wool: 2, grain: 0 });
  act(s, q, { type: 'wagonCards', wool: 3, grain: 0 });
  // q has 3 of 6 votes: not more than all the others together
  act(s, r, { type: 'wagonCards', wool: 0, grain: 1 });
  const pos = L(s, p).wagonPositions;
  act(s, p, { type: 'wagonVote', pos: pos[0] });
  act(s, q, { type: 'wagonVote', pos: pos[1] });
  act(s, r, { type: 'wagonVote', pos: pos[0] });
  // place 0 has 2+1 = 3, place 1 has 3: a tie of the locations
  ok(pend(s).type === 'wagonPlace' && pend(s).player === q, 'tied locations: the player with the most votes chooses');
  act(s, q, { type: 'wagonPlace', pos: pos[2] });
  ok(s.hub.cv.wagons[pos[2]] !== undefined, 'the chosen location gets the wagon');
}
// 4. rule 3: the active player decides when nobody has the most votes (even without a bid)
{
  const s = ready(3, {}, {});
  const p = s.current, q = (p + 1) % 3, r = (p + 2) % 3;
  s.players[q].res.wool = 2; s.players[r].res.grain = 2;
  act(s, p, { type: 'endTurn' });
  ok(pend(s).player === q, 'players without wool and grain are skipped');
  act(s, q, { type: 'wagonCards', wool: 2, grain: 0 });
  act(s, r, { type: 'wagonCards', wool: 0, grain: 2 });
  const pos = L(s, q).wagonPositions;
  act(s, q, { type: 'wagonVote', pos: pos[0] });
  act(s, r, { type: 'wagonVote', pos: pos[1] });
  ok(pend(s).type === 'wagonPlace' && pend(s).player === p, 'q and r both have 2: the active player chooses, though he bid nothing');
  act(s, p, { type: 'wagonPlace', pos: pos[2] });
  ok(wagons(s) === 1, 'wagon placed');
}
// 5. nobody bids: the active player chooses; no building, no wagon
{
  const s = ready(3, {}, {});
  const p = s.current;
  act(s, p, { type: 'endTurn' });
  ok(pend(s).type === 'wagonPlace' && pend(s).player === p, 'without any bid the active player chooses');
  const s2 = ready(3, {}, {});
  s2.flags.builtHouse = false;
  act(s2, s2.current, { type: 'endTurn' });
  ok(s2.pending.length === 0 && wagons(s2) === 0, 'no settlement or city built: no wagon');
}

// ---------------------------------------------------------------- how a train grows
{
  const s = ready(3, {}, {});
  const p = s.current;
  act(s, p, { type: 'endTurn' });
  const first = L(s, p).wagonPositions;
  const arrows = s.board.waterholes[0].arrows;
  ok(first.length === 3 && first.every(e => arrows.includes(e)), 'the first wagon starts on one of the three arrows of the watering hole');
  act(s, p, { type: 'wagonPlace', pos: first[0] });
  const t = s.hub.cv.trains.find(x => x.started);
  const hole = s.board.hexes[s.board.waterholes[0].hex];
  ok(t && !hole.verts.includes(t.front), 'the front of the train points away from the hexes');
  // next turn: the new wagon continues the train in front or starts another train
  const q = s.current;
  s.flags = { rolled: true, builtHouse: true }; s.step = 'main';
  empty(s);
  act(s, q, { type: 'endTurn' });
  const second = L(s, q).wagonPositions;
  const fronts = s.board.vertices[t.front].edges.filter(e => s.hub.cv.wagons[e] === undefined);
  ok(second.length === fronts.length + 2 && fronts.every(e => second.includes(e)), 'a new wagon continues the train at its front (no branching) or starts a new train at a free start location');
  ok(!second.includes(first[0]), 'no second wagon on an edge that has one');
}
// merging at an intersection and ending of trains
{
  const s = ready(3, {}, {});
  const B = s.board, cv = s.hub.cv;
  const wh = B.hexes[B.waterholes[0].hex];
  const X = B.vertices.find(v => v.edges.length === 3 && !wh.verts.includes(v.id) && v.adj.every(a => !wh.verts.includes(a)) && v.hexes.every(h => h !== wh.id));
  const [a1, a2, a3] = X.edges;
  const far = (e, v) => B.edges[e].v.find(x => x !== v);
  cv.trains[0] = { started: true, edges: [a1], front: X.id, dead: false }; cv.wagons[a1] = 0;
  cv.trains[1] = { started: true, edges: [a2], front: X.id, dead: false }; cv.wagons[a2] = 1;
  cv.pool -= 2;
  act(s, s.current, { type: 'endTurn' });
  const pos = L(s, s.current).wagonPositions;
  ok(pos.includes(a3), 'two trains that meet at an intersection can go on from there');
  const p = s.current;
  act(s, p, { type: 'wagonPlace', pos: a3 });
  ok(cv.trains[1].dead && !cv.trains[0].dead && cv.trains[0].front === far(a3, X.id), 'the two trains merge into one that goes on');
}
{
  const s = ready(3, {}, {});
  const B = s.board, cv = s.hub.cv;
  cv.pool = 1;
  cv.trains[0] = { started: true, edges: [], front: B.vertices.find(v => v.edges.length === 3).id, dead: false };
  act(s, s.current, { type: 'endTurn' });
  const p = s.current;
  const pos = L(s, p).wagonPositions;
  act(s, p, { type: 'wagonPlace', pos: pos[0] });
  ok(cv.pool === 0 && cv.trains.every(t => t.dead), 'when the wagon supply is empty all trains end');
  // no wagon left: building no longer asks for a vote
  const q = s.current;
  s.flags = { rolled: true, builtHouse: true }; s.step = 'main';
  act(s, q, { type: 'endTurn' });
  ok(s.pending.length === 0 && s.current !== q, 'no vote when no wagon is left');
}

// ---------------------------------------------------------------- victory points and the Longest Route
{
  const s = ready(3, {}, {});
  const B = s.board, p = s.current;
  const X = B.vertices.find(v => v.edges.length === 3 && !B.hexes[B.waterholes[0].hex].verts.includes(v.id) && !s.buildings[v.id] && v.adj.every(a => !s.buildings[a]));
  s.buildings[X.id] = { p, type: 'settlement' };
  const before = vp(s, p);
  s.hub.cv.wagons[X.edges[0]] = 0;
  ok(vp(s, p) === before, 'a building next to only one wagon earns nothing');
  s.hub.cv.wagons[X.edges[1]] = 0;
  ok(vp(s, p) === before + 1, 'a building between 2 wagons is worth +1 VP');
  s.buildings[X.id].type = 'city';
  ok(vp(s, p) === before + 2, 'a city between 2 wagons is worth 3 VP (2 + 1)');
  s.hub.cv.wagons[X.edges[2]] = 0;
  ok(vp(s, p) === before + 2, 'three wagons around the building still give only +1');
}
{
  // a wagon on the same edge as a road counts as an additional road for the Longest Route
  const s = ready(3, {}, {});
  const B = s.board, p = s.current;
  Object.keys(s.roads).forEach(e => delete s.roads[e]);
  Object.keys(s.buildings).forEach(v => delete s.buildings[v]);
  // a path of 3 roads
  let path = null;
  for (const v0 of B.vertices) {
    const w1 = v0.adj[0]; const e1 = B.edges.find(e => e.v.includes(v0.id) && e.v.includes(w1));
    const w2 = B.vertices[w1].adj.find(a => a !== v0.id); const e2 = B.edges.find(e => e.v.includes(w1) && e.v.includes(w2));
    const w3 = B.vertices[w2].adj.find(a => a !== w1); const e3 = B.edges.find(e => e.v.includes(w2) && e.v.includes(w3));
    if (e1 && e2 && e3 && new Set([v0.id, w1, w2, w3]).size === 4) { path = [e1.id, e2.id, e3.id]; break; }
  }
  path.forEach(e => { s.roads[e] = p; });
  ok(_internal.longestFor(s, p) === 3, 'three roads are 3');
  s.hub.cv.wagons[path[0]] = 0;
  ok(_internal.longestFor(s, p) === 4, 'a wagon next to a road counts as one more road');
  s.hub.cv.wagons[path[2]] = 0;
  ok(_internal.longestFor(s, p) === 5, 'book example: 3 road segments, two share an edge with a wagon: length 5');
  // a wagon without a road does not count
  const e = B.edges.find(x => !s.roads[x.id] && !s.hub.cv.wagons[x.id]).id;
  s.hub.cv.wagons[e] = 0;
  ok(_internal.longestFor(s, p) === 5, 'a wagon alone is no road');
  // a road may be built on an edge that already has a wagon
  s.hub.cv.wagons[e] = 0;
}
// reaching 12 points while placing the wagon ends the game at once
{
  const s = ready(3, {}, {});
  const B = s.board, p = s.current, cv = s.hub.cv;
  const wh = B.hexes[B.waterholes[0].hex];
  const a = B.waterholes[0].arrows[0];
  const u = B.edges[a].v.find(v => !wh.verts.includes(v));
  cv.trains[0] = { started: true, edges: [a], front: u, dead: false }; cv.wagons[a] = 0; cv.pool--;
  Object.keys(s.buildings).forEach(v => { if (s.buildings[v].p === p) delete s.buildings[v]; });
  s.buildings[u] = { p, type: 'settlement' };
  s.options.vpTarget = vp(s, p) + 1;
  act(s, p, { type: 'endTurn' });
  const next = L(s, p).wagonPositions.find(e => B.vertices[u].edges.includes(e));
  act(s, p, { type: 'wagonPlace', pos: next });
  ok(s.phase === 'over' && s.winner === p, 'the player who reaches the target with the wagon wins right away, on his own turn');
}

// ---------------------------------------------------------------- 5-6 players: paired turns
{
  const s = ready(6, {}, {});
  const one = s.pair.one;
  const two = (one + 3) % 6;
  // player 1 builds: normal voting round with player 1 as the active player
  s.players[one].res.wool = 1;
  act(s, one, { type: 'endTurn' });
  ok(pend(s).player === one && s.hub.cv.vote.from === one, 'player 1: the voting round starts with the active player');
  act(s, one, { type: 'wagonCards', wool: 1, grain: 0 });
  ok(pend(s).type === 'wagonPlace' && pend(s).player === one, 'player 1 has the majority');
  const pos = L(s, one).wagonPositions;
  ok(pos.length === 6, 'six start locations for the first wagon');
  act(s, one, { type: 'wagonPlace', pos: pos[0] });
  ok(s.current === two && s.flags.stone2, 'player 2 follows');
  // player 2 builds a building: he holds a voting round too and is the active player of it
  s.flags.builtHouse = true;
  empty(s);
  s.players[(two + 1) % 6].res.grain = 1;
  act(s, two, { type: 'endTurn' });
  ok(s.hub.cv.vote && s.hub.cv.vote.from === two, 'player 2: voting round with player 2 as the active player');
  ok(pend(s).player === (two + 1) % 6, 'the bids go clockwise from player 2');
  act(s, (two + 1) % 6, { type: 'wagonCards', wool: 0, grain: 1 });
  ok(pend(s).player === (two + 1) % 6 && pend(s).type === 'wagonPlace', 'the only bidder decides');
  act(s, (two + 1) % 6, { type: 'wagonPlace', pos: L(s, (two + 1) % 6).wagonPositions[0] });
  ok(wagons(s) === 2 && s.current === (one + 1) % 6 && !s.flags.stone2, 'the next pair is on turn');
}
{
  // no building by player 2: no voting round
  const s = ready(5, {}, {});
  const one = s.pair.one, two = (one + 3) % 5;
  act(s, one, { type: 'endTurn' });
  act(s, one, { type: 'wagonPlace', pos: L(s, one).wagonPositions[0] });
  ok(s.current === two, 'player 2 on turn');
  s.flags = { rolled: true, stone2: true }; s.step = 'main';
  act(s, two, { type: 'endTurn' });
  ok(s.pending.length === 0 && wagons(s) === 1, 'player 2 built nothing: no wagon');
}
{
  // a train may start at either watering hole
  const s = ready(5, {}, {});
  const holes = s.board.waterholes;
  const all = [].concat(...holes.map(h => h.arrows));
  const one = s.pair.one;
  act(s, one, { type: 'endTurn' });
  const pos = L(s, one).wagonPositions;
  ok(pos.length === 6 && pos.every(e => all.includes(e)), 'start locations at both watering holes');
  const e2 = holes[1].arrows[0];
  act(s, one, { type: 'wagonPlace', pos: e2 });
  const t = s.hub.cv.trains.find(x => x.started);
  const hex2 = s.board.hexes[holes[1].hex];
  ok(!hex2.verts.includes(t.front) && s.board.edges[e2].v.includes(t.front), 'a train from the second hole grows away from it');
}

// ---------------------------------------------------------------- Catan for Two: 2 wagons per voting round (book p14)
{
  const s = ready(2, { two: true }, {});
  const p = s.current, q = 1 - p;
  s.players[p].res.wool = 2; s.players[q].res.grain = 1;
  act(s, p, { type: 'endTurn' });
  act(s, p, { type: 'wagonCards', wool: 2, grain: 0 });
  act(s, q, { type: 'wagonCards', wool: 0, grain: 1 });
  ok(pend(s).type === 'wagonPlace' && pend(s).player === p, 'two players: more votes than the opponent places both wagons');
  const first = L(s, p).wagonPositions[0];
  act(s, p, { type: 'wagonPlace', pos: first });
  ok(pend(s).type === 'wagonPlace' && pend(s).player === p, 'the same player places the second wagon');
  const t = s.hub.cv.trains.find(x => x.started);
  ok(L(s, p).wagonPositions.every(e => !s.board.vertices[t.front].edges.includes(e)), 'each wagon goes to a different merchant train');
  act(s, p, { type: 'wagonPlace', pos: L(s, p).wagonPositions[0] });
  ok(wagons(s) === 2 && s.hub.cv.pool === 20, '2 wagons were placed');
}
{
  const s = ready(2, { two: true }, {});
  const p = s.current, q = 1 - p;
  s.players[p].res.wool = 1; s.players[q].res.grain = 1;
  act(s, p, { type: 'endTurn' });
  act(s, p, { type: 'wagonCards', wool: 1, grain: 0 });
  act(s, q, { type: 'wagonCards', wool: 0, grain: 1 });
  ok(pend(s).player === p, 'a tie: the active player places the first wagon');
  act(s, p, { type: 'wagonPlace', pos: L(s, p).wagonPositions[0] });
  ok(pend(s).player === q, 'and the other player the second');
  act(s, q, { type: 'wagonPlace', pos: L(s, q).wagonPositions[0] });
  ok(wagons(s) === 2 && s.current === q, 'both wagons stand and the turn passes');
}

console.log(bad ? `${bad} FAILED` : 'merchant trains checks passed');
process.exit(bad ? 1 : 0);
