'use strict';
// Computer players for the real server. A bot is a seat whose user id starts with "bot_". After every move of the game the
// runner looks for a bot that has something to do (its turn, a pending question, a trade offer to answer) and plays one move
// after a short pause, so the humans can follow. The move comes from the heuristic bot of the mode; when the engine refuses it
// (or the bot has no idea), random legal-ish moves from the fuzzer's generators are tried, so a game never hangs on a bot.
const classic = require('./classic');
const standalone = require('./standalone');
const fuzzClassic = require('./fuzz-classic');
const FUZZ = {
  energies: require('./fuzz-energies'), humankind: require('./fuzz-humankind'), inkas: require('./fuzz-inkas'), explorers: require('./fuzz-explorers'),
};

const isBotId = id => typeof id === 'string' && id.startsWith('bot_');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function createRunner({ engine, store, broadcastState, finishGame, delay = () => (process.env.BROCH_BOT_DELAY !== undefined ? +process.env.BROCH_BOT_DELAY : 650 + Math.random() * 650) }) {
  const timers = new Map();

  const botSeats = g => (g.state ? g.state.players.map((p, i) => (isBotId(p.userId) ? i : -1)).filter(i => i >= 0) : []);
  // is the seat expected to move (a pending question for it, or its turn)?
  const expected = (s, seat) => (s.pending || []).some(x => x.player === seat) || s.current === seat;

  function fallbackMoves(s, seat) {
    try {
      if (engine.isStandalone(s.mode)) return FUZZ[s.mode](engine.viewFor(s, seat), seat).filter(Boolean);
      return fuzzClassic(s, seat).filter(Boolean);
    } catch (e) { return []; }
  }
  // plays one move for the seat; true when the engine took it
  function playOne(g, seat) {
    const s = g.state;
    const v = engine.viewFor(s, seat);
    let move = null;
    try { move = (engine.isStandalone(s.mode) ? standalone : classic).decide(v); } catch (e) { move = null; }
    const tries = [];
    if (move) tries.push(move);
    if (!move && !expected(s, seat)) return false;
    tries.push(...shuffle(fallbackMoves(s, seat)).filter(m => m.type !== 'offerTrade' && m.type !== 'counterTrade').slice(0, 300));
    for (const m of tries) {
      try { engine.act(s, seat, m); return true; } catch (e) { if (!(e instanceof engine.GameError)) console.error('Bot move crashed', m && m.type, e.message); }
    }
    return false;
  }

  function step(g) {
    timers.delete(g.meta.id);
    if (!g.state || g.state.phase === 'over' || g.meta.status !== 'playing') return;
    for (const seat of shuffle(botSeats(g))) {
      const wasOver = g.state.phase === 'over';
      if (playOne(g, seat)) {
        store.saveGame(g);
        broadcastState(g);
        if (!wasOver && g.state.phase === 'over') finishGame(g);
        schedule(g);
        return;
      }
    }
    // nobody could move: it is a human's turn (or a human has to answer something); the next human action wakes the bots again
    warnStalled(g);
  }
  // Watchdog: a bot is the only one who has to move, yet none of its candidate moves was accepted. That table is dead until someone
  // resigns or leaves, so say so in the server log (once per situation) to make such a bug findable.
  const reported = new Map();
  function warnStalled(g) {
    const s = g.state, seats = botSeats(g);
    const items = (s.pending || []).filter(x => x.player != null);
    const onlyBots = items.length ? items.length === (s.pending || []).length && items.every(x => seats.includes(x.player)) : seats.includes(s.current);
    if (!onlyBots) return;
    const sig = JSON.stringify([s.turn, s.current, s.step, items.map(x => x.type + x.player)]);
    if (reported.get(g.meta.id) === sig) return;
    reported.set(g.meta.id, sig);
    console.error(`Bot runner: game ${g.meta.id} (${s.mode}) is stuck, no bot move was accepted: turn ${s.turn}, seat ${s.current}, step ${s.step}, pending ${items.map(x => x.type + '@' + x.player).join(',') || 'none'}`);
  }
  function schedule(g) {
    if (!g.state || g.state.phase === 'over' || timers.has(g.meta.id) || !botSeats(g).length) return;
    timers.set(g.meta.id, setTimeout(() => { try { step(g); } catch (e) { console.error('Bot runner crashed', e); } }, delay()));
  }
  function cancel(id) { const t = timers.get(id); if (t) clearTimeout(t); timers.delete(id); }
  return { schedule, cancel, isBotId, botSeats };
}

module.exports = { createRunner, isBotId };
