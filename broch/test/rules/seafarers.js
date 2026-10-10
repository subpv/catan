'use strict';
// Targeted Seafarers rules checks (ship lines, one ship move per turn, setup ships, new-island bonus):
// node test/rules/seafarers.js
require('../seed');
const { createGame, act, viewFor, GameError, _internal } = require('../../server/engine/classic/game');

let bad = 0;
const ok = (cond, msg) => { if (!cond) { bad++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const pick = a => a[Math.floor(Math.random() * a.length)];

function newGame(scenario, n = 3) {
  return createGame({ id: 't', mode: 'classic', options: { expansion: 'seafarers', scenario },
    players: Array.from({ length: n }, (_, i) => ({ id: 'u' + i, name: 'P' + i })) });
}
// play the founding phase with random legal moves; remember what the legal lists offered
function setup(s) {
  const seen = { ships: 0, roads: 0 };
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 200) {
    const p = s.current;
    const L = viewFor(s, p).legal;
    if (L.goldPick) { act(s, p, { type: 'pickGold', cards: { wood: L.goldPick.count } }); continue; }
    if (L.setupSpots) act(s, p, { type: s.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: pick(L.setupSpots) });
    else if (L.setupRoads || L.setupShips) {
      const ships = L.setupShips || [], roads = L.setupRoads || [];
      if (ships.length) seen.ships++;
      if (roads.length) seen.roads++;
      if (ships.length && (!roads.length || Math.random() < 0.5)) act(s, p, { type: 'placeShip', e: pick(ships) });
      else act(s, p, { type: 'placeRoad', e: pick(roads) });
    } else break;
  }
  return seen;
}

// 1. founding phase: a road OR a ship may follow each settlement
{
  let any = false, finished = true;
  for (let i = 0; i < 20 && !any; i++) {
    const s = newGame('shores');
    const seen = setup(s);
    finished = finished && s.phase !== 'setup';
    if (seen.ships > 0) any = true;
    if (s.phase !== 'setup') {
      const ships = Object.keys(s.ships).length;
      if (ships > 0) any = true;
    }
  }
  ok(finished, 'founding phase completes in Heading for New Shores');
  ok(any, 'a ship can be placed during the founding phase');
}

// 2. one ship move per turn, a ship built this turn stays (retry on random boards until a ship has somewhere to sail)
{
  let done = false;
  for (let attempt = 0; attempt < 60 && !done; attempt++) {
    const s = newGame('shores');
    setup(s);
    const p = s.current;
    const mine = Object.keys(s.buildings).filter(v => s.buildings[v].p === p).map(Number);
    for (const k of Object.keys(s.players[p].res)) s.players[p].res[k] += 5;
    s.step = 'main'; s.flags = s.flags || {};
    const free = viewFor(s, p).legal.ships || [];
    const e0 = free.find(e => s.board.edges[e].v.some(v => mine.includes(v)));
    if (e0 === undefined) continue;
    act(s, p, { type: 'buildShip', e: e0 });
    const fresh = (viewFor(s, p).legal.moveShips || {})[e0];
    s.ships[e0].builtTurn = -5; s.flags.shipMoved = false;
    const mv = viewFor(s, p).legal.moveShips || {};
    if (!mv[e0]) continue;
    done = true;
    ok(!fresh, 'a ship built this turn cannot be moved');
    ok(mv[e0].length > 0, 'the end ship of an open line may be moved on a later turn');
    act(s, p, { type: 'moveShip', from: e0, to: mv[e0][0] });
    ok(s.flags.shipMoved === true, 'moving a ship marks the one move of this turn');
    ok(Object.keys(viewFor(s, p).legal.moveShips || {}).length === 0, 'no second ship move in the same turn');
    let threw = false;
    try { act(s, p, { type: 'moveShip', from: mv[e0][0], to: e0 }); } catch (e) { threw = e instanceof GameError; }
    ok(threw, 'a second moveShip is rejected');
  }
  ok(done, 'found a board where a lone ship can sail');
}

// 3. closed line: a branch of a line that joins two of your settlements cannot be moved
{
  const s = newGame('shores');
  setup(s);
  const p = s.current;
  s.step = 'main'; s.flags = s.flags || {};
  const B = s.board;
  // a corner x with three free sea edges; edges to a and b end at own settlements (edited into the state), the third ends at y
  const seaEdge = e => B.edges[e].hexes ? B.edges[e].hexes.every(h => B.hexes[h].terrain === 'sea') : false;
  const x = B.vertices.find(v => v.edges.length === 3 && v.edges.every(e => !s.roads[e] && !s.ships[e] && seaEdge(e)) && v.adj.every(a => !s.buildings[a]));
  if (!x) ok(true, 'skipped: no open-sea corner found');
  else {
    const other = e => B.edges[e].v.find(v => v !== x.id);
    const [e1, e2, e3] = x.edges;
    s.buildings[other(e1)] = { p, type: 'settlement' };
    s.ships[e1] = { p, builtTurn: -9 }; s.ships[e2] = { p, builtTurn: -9 }; s.ships[e3] = { p, builtTurn: -9 };
    const open = (viewFor(s, p).legal.moveShips || {})[e3];
    s.buildings[other(e2)] = { p, type: 'settlement' };
    const closed = (viewFor(s, p).legal.moveShips || {})[e3];
    ok(!closed, 'a branch of a line that joins two of your settlements is closed');
    ok(!!open && open.length > 0, 'the same branch can sail while the line is still open');
  }
}

// 4. new-island bonus is paid once per player and island (mode each)
{
  const s = newGame('shores');
  setup(s);
  ok(s.board.bonus && s.board.bonus.vp === 2, 'Heading for New Shores pays 2 bonus points');
  const isl = Object.keys(s.islandBonus)[0];
  if (isl !== undefined) ok(s.islandBonus[isl].every((x, i, a) => a.indexOf(x) === i), 'a player is listed once per island');
}

console.log(bad ? `${bad} FAILED` : 'seafarers checks passed');
process.exit(bad ? 1 : 0);
