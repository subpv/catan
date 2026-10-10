'use strict';
// A bot that holds a 5th progress card on its own turn MUST play one (Cities & Knights). Regression test for the table that froze
// when the bot answered with a give-back the engine refuses: for every progress card, the bot's own choice, or at the latest the
// exhaustive fuzz fallback the runner uses, must find a move the engine accepts (or a give-back when no card can be played).
const assert = require('assert');
const { createGame, act, viewFor, GameError } = require('../../server/engine/classic/game');
const C = require('../../server/engine/shared/constants');
const classic = require('../../server/bots/classic');
const fuzz = require('../../server/bots/fuzz-classic');

const deckOf = {};
for (const [deck, list] of Object.entries(C.PROGRESS)) for (const t of Array.isArray(list) ? list : Object.keys(list)) deckOf[t] = deck;
const types = Object.keys(deckOf).filter(t => t !== 'alchemist' && !C.PROGRESS_VP.includes(t));
assert(types.length >= 15, 'progress card list found');

function setup(card) {
  const s = createGame({ id: 't', mode: 'knights', options: {}, players: Array.from({ length: 3 }, (_, i) => ({ id: 'bot_' + i, name: 'B' + i })) });
  s.phase = 'play'; s.step = 'main'; s.turn = 5; s.current = 0; s.setup = null; s.flags = { rolled: true };
  // seat 0's settlement must touch a land tile that yields something (the Merchant needs one)
  const yields = v => v.hexes.some(h => C.TERRAIN_RES[s.board.hexes[h].terrain]);
  const free = s.board.vertices.filter(yields).map(v => v.id);
  const spots = [];
  for (const id of free) if (spots.every(x => x !== id && !s.board.vertices[x].adj.includes(id))) spots.push(id);
  s.buildings[spots[0]] = { p: 0, type: 'settlement' }; s.buildings[spots[1]] = { p: 1, type: 'city' }; s.buildings[spots[2]] = { p: 2, type: 'city' };
  s.players[1].hand; // (seat 1 and 2 have cards and more points than seat 0 in most cases)
  for (const pl of s.players) for (const k of C.RES) pl.res[k] = 3;
  s.players[0].progress = Array.from({ length: 5 }, () => ({ type: card, deck: deckOf[card] }));
  s.players[1].progress = [{ type: 'crane', deck: 'science' }];
  s.pending.push({ type: 'discardProgress', player: 0, mustPlay: true, group: 99 });
  return s;
}
const clone = s => JSON.parse(JSON.stringify(s));
const tryAct = (s, m) => { const c = clone(s); try { act(c, 0, m); return true; } catch (e) { if (!(e instanceof GameError)) throw e; return false; } };

let checks = 0, viaBot = 0, viaFallback = 0, gaveBack = 0;
for (let round = 0; round < 6; round++) for (const card of types) {
  const s = setup(card);
  const v = viewFor(s, 0);
  const forced = v.pending.find(p => p.type === 'discardProgress');
  assert(forced && forced.mustPlay, 'forced pending is visible');
  // the exhaustive fallback alone must always have a working move
  assert(fuzz(s, 0).some(m => tryAct(s, m)), card + ': the fallback found nothing the engine accepts');
  const mine = tryAct(s, classic.decide(v));
  if (mine) { viaBot++; if (forced.canGiveBack) gaveBack++; checks++; continue; }
  assert(!forced.canGiveBack, card + ': giving back is allowed, the bot must do it');
  viaFallback++; checks++;
}
console.log(`bot forced progress: ${checks} checks passed (${viaBot} by the bot, ${viaFallback} by the fallback, ${gaveBack} give-backs)`);
