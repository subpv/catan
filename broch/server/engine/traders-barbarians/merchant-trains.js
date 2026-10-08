'use strict';
// Traders & Barbarians, scenario "Merchant Trains" (the old "Caravans", German "Der Handelstross"). The nomads at the
// watering hole send trade wagons out; every settlement or city you build earns a voting round at the end of your turn that
// decides where the next wagon goes (wool and wheat/grain are the votes). Merchant trains grow from the watering hole (three
// start locations per hole). Buildings between two wagons are worth 1 VP more, a wagon on the same edge as a road counts as an
// additional road for the Longest Route. First to 12 points wins.
// 5-6 players (5-6 book p7): two watering holes (six start locations), no desert, 33 wagons (22 + the 11 of the 5-6 set); player 2 of the
// paired turn holds a voting round as well (and is the active player of that round).
// Catan for Two (book p14, `variants.two`, not offered in the lobby yet): 2 wagons per voting round.

module.exports = function make(core, HB) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail } = core;
  const WAGONS = 22, WAGONS_56 = 22 + 11;
  // 5-6 book p7: on the 3-4-5-6-5-4-3 board the holes lie in row 3 (2nd hex) and row 5 (4th hex), mirror images of each other
  const SITES_56 = [8, 21];
  const hex = (s, id) => s.board.hexes[id];
  const holes = s => s.board.waterholes || [s.board.waterhole];

  function makeBoard({ generate, kind, numberLand }) {
    const board = generate(kind);
    const big = kind === 'extended';
    const centre = board.hexes.reduce((a, h) => (Math.hypot(h.x, h.y) < Math.hypot(a.x, a.y) ? h : a), board.hexes[0]);
    const sites = big ? SITES_56 : [centre.id];
    // the watering holes replace the deserts: the tile that lay on the printed site goes to the freed desert place
    const deserts = board.hexes.filter(h => h.terrain === 'desert').map(h => h.id);
    const spare = deserts.filter(id => !sites.includes(id)), open = sites.filter(id => !deserts.includes(id));
    spare.forEach((d, i) => {
      const a = board.hexes[d], b = board.hexes[open[i]];
      [a.terrain, b.terrain] = [b.terrain, a.terrain];
      [a.number, b.number] = [b.number, a.number];
    });
    sites.forEach(id => { const h = board.hexes[id]; h.terrain = 'waterhole'; h.number = null; });
    // the number chips follow the usual placement rule (no two red chips side by side) after the move
    const land = board.hexes.filter(h => h.terrain !== 'waterhole');
    numberLand(board, land.map(h => h.id), land.map(h => h.number));
    // three arrows point straight out of every second corner of a watering hole
    board.waterholes = sites.map(id => {
      const wh = board.hexes[id];
      const parity = Math.random() < 0.5 ? 0 : 1;
      const arrows = [];
      wh.verts.forEach((v, i) => {
        if (i % 2 !== parity) return;
        arrows.push(board.vertices[v].edges.find(e => !wh.edges.includes(e)));
      });
      return { hex: id, arrows };
    });
    board.waterhole = board.waterholes[0];
    return board;
  }

  function init(s) {
    const n = holes(s).length;
    s.hub.cv = {
      trains: Array.from({ length: 3 * n }, () => ({ started: false, edges: [], front: null, dead: false })),
      wagons: {}, pool: n > 1 ? WAGONS_56 : WAGONS, per: s.options.variants && s.options.variants.two ? 2 : 1, vote: null,
    };
  }

  // ------------------------------------------------------------ where the next wagon may go
  const freeEdge = (s, e) => s.hub.cv.wagons[e] === undefined;
  const otherEnd = (s, e, v) => { const [a, b] = E(s, e).v; return a === v ? b : a; };
  // `avoid`: a train index that the wagon must not join (the second wagon of a round for two joins another train)
  function positions(s, avoid = null) {
    const cv = s.hub.cv, out = [];
    if (cv.pool <= 0) return out;
    const add = (edge, train) => { if (train !== avoid && !out.some(o => o.edge === edge)) out.push({ edge, train }); };
    const firstNew = cv.trains.findIndex(t => !t.started);
    if (firstNew >= 0) holes(s).forEach(h => h.arrows.forEach(e => { if (freeEdge(s, e)) add(e, firstNew); }));
    cv.trains.forEach((t, i) => {
      if (!t.started || t.dead) return;
      V(s, t.front).edges.forEach(e => { if (freeEdge(s, e)) add(e, i); });
    });
    return out;
  }

  // returns the index of the train the wagon joined
  function placeWagon(s, edge, by) {
    const cv = s.hub.cv;
    const pos = positions(s).find(o => o.edge === edge);
    if (!pos) fail('A wagon cannot go there.');
    const t = cv.trains[pos.train];
    cv.wagons[edge] = pos.train;
    cv.pool--;
    if (!t.started) {
      t.started = true; t.edges = [edge];
      const wh = hex(s, holes(s).find(h => hex(s, h.hex).verts.some(v => E(s, edge).v.includes(v))).hex);
      t.front = E(s, edge).v.find(v => !wh.verts.includes(v));
      log(s, '{@p} starts a merchant train.', { p: by, e: edge });
    } else {
      const from = t.front;
      t.edges.push(edge);
      t.front = otherEnd(s, edge, from);
      // two merchant trains that meet at an intersection merge and go on as one
      const other = cv.trains.find((o, j) => j !== pos.train && o.started && !o.dead && o.front === from);
      if (other) { other.dead = true; t.merged = (t.merged || []).concat(other.edges); log(s, 'Two merchant trains merge.'); }
      log(s, '{@p} extends a merchant train.', { p: by, e: edge });
    }
    // a merchant train that cannot go on ends
    cv.trains.forEach(o => { if (o.started && !o.dead && !V(s, o.front).edges.some(e => freeEdge(s, e))) o.dead = true; });
    if (cv.pool <= 0) cv.trains.forEach(o => { o.dead = true; });
    core.updateLongest(s);
    return pos.train;
  }

  // ------------------------------------------------------------ the voting round
  // Starting with the active player, clockwise, everybody may lay out wool and/or grain (1 vote per card); only those who did
  // take part. One player with more votes than all others together decides alone. Otherwise every voter assigns all votes to one
  // location: (1) the location with most votes, (2) else the player with most votes chooses, (3) else the active player chooses.
  function startVote(s, p) {
    const n = s.players.length, cv = s.hub.cv;
    cv.vote = { from: p, order: Array.from({ length: n }, (_, i) => (p + i) % n), idx: 0, stage: 'cards', cards: {}, votes: {}, picks: {}, vi: 0, voters: [], slots: [], si: 0, chosen: null, lastTrain: null };
    log(s, 'Voting round: a trade wagon is placed. Everyone may bid wool and grain as votes.');
  }
  const total = v => Object.values(v.votes).reduce((a, b) => a + b, 0);

  // who places the wagon(s) of this round; `avoid` = the 2nd wagon of a round for two joins another train
  function decide(s, who, why) {
    const v = s.hub.cv.vote, per = s.hub.cv.per;
    v.stage = 'place'; v.si = 0; v.chosen = null; v.lastTrain = null;
    v.slots = per === 2 ? [{ p: who[0], avoid: !!who[2] }, { p: who[1], avoid: !!who[2] }] : [{ p: who[0], avoid: false }];
    if (why) log(s, why, { p: who[0] });
  }

  // pushes the next question, or finishes the vote (cv.vote becomes null)
  function advance(s) {
    const cv = s.hub.cv, v = cv.vote;
    if (!v) return;
    for (;;) {
      if (v.stage === 'cards') {
        while (v.idx < v.order.length) {
          const q = v.order[v.idx++], pl = P(s, q);
          if (pl.res.wool + pl.res.grain > 0) { pushPending(s, [{ type: 'wagonCards', player: q, pub: { positions: positions(s).map(o => o.edge) } }]); return; }
          v.cards[q] = { wool: 0, grain: 0 }; v.votes[q] = 0;
        }
        v.stage = 'decide';
      }
      if (v.stage === 'decide') {
        const pos = positions(s).map(o => o.edge);
        const tot = total(v);
        const top = Object.entries(v.votes).sort((a, b) => b[1] - a[1]);
        if (cv.per === 2) {
          // two wagons: the one with more votes than the opponent places both (on different trains), at a tie each places one
          const other = v.order.find(q => q !== v.from);
          if (v.votes[v.from] !== v.votes[other]) {
            const w = v.votes[v.from] > v.votes[other] ? v.from : other;
            decide(s, [w, w, true], '{@p} has more votes and places both wagons.');
          } else decide(s, [v.from, other, false], 'Tie: each player places one wagon, the active player first.');
        } else if (pos.length === 1) decide(s, [v.from]);
        else if (!tot) decide(s, [v.from], '{@p} is on turn and chooses where the wagon goes.');
        else if (top[0][1] > tot - top[0][1]) decide(s, [+top[0][0]], '{@p} has more votes than all the others together and decides.');
        else {
          v.voters = v.order.filter(q => v.votes[q] > 0);
          v.stage = 'vote'; v.vi = 0;
        }
      }
      if (v.stage === 'vote') {
        const pos = positions(s).map(o => o.edge);
        if (v.vi < v.voters.length) { const q = v.voters[v.vi++]; pushPending(s, [{ type: 'wagonVote', player: q, pub: { positions: pos, votes: v.votes[q] } }]); return; }
        // count the votes
        const tally = {};
        v.voters.forEach(q => { tally[v.picks[q]] = (tally[v.picks[q]] || 0) + v.votes[q]; });
        const best = Math.max(...Object.values(tally));
        const tops = Object.keys(tally).filter(k => tally[k] === best);
        if (tops.length === 1) { v.chosen = +tops[0]; v.stage = 'place'; v.slots = [{ p: v.from, avoid: false }]; v.si = 0; log(s, 'One place has the most votes: the wagon goes there.'); }
        else {
          // no place has the most votes: the player with most votes chooses, or the one whose turn it was
          const mv = Math.max(...v.voters.map(q => v.votes[q]));
          const lead = v.voters.filter(q => v.votes[q] === mv);
          if (lead.length === 1) decide(s, [lead[0]], '{@p} has the most votes and chooses where the wagon goes.');
          else decide(s, [v.from], '{@p} is on turn and chooses where the wagon goes.');
        }
      }
      if (v.stage === 'place') {
        if (v.chosen != null) {
          v.lastTrain = placeWagon(s, v.chosen, v.slots[v.si].p);
          v.chosen = null; v.si++;
          core.checkWin(s);
          if (s.phase !== 'play') { cv.vote = null; return; }
        }
        for (; v.si < v.slots.length; ) {
          const slot = v.slots[v.si];
          let pos = positions(s, slot.avoid ? v.lastTrain : null);
          if (!pos.length && slot.avoid) pos = positions(s);
          if (!pos.length) { v.si = v.slots.length; break; }
          if (pos.length === 1) { v.chosen = pos[0].edge; v.lastTrain = placeWagon(s, v.chosen, slot.p); v.chosen = null; v.si++; core.checkWin(s); if (s.phase !== 'play') { cv.vote = null; return; } continue; }
          pushPending(s, [{ type: 'wagonPlace', player: slot.p, pub: { positions: pos.map(o => o.edge) } }]);
          return;
        }
        cv.vote = null;
        return;
      }
    }
  }

  // ------------------------------------------------------------ rules the engine asks about
  // a wagon on the same edge as a road counts as an additional road for the Longest Route
  function roadWeight(s, e) { return s.hub.cv.wagons[e] !== undefined ? 2 : 1; }
  // a building between two wagons is worth 1 VP more
  function vpExtra(s, p) {
    const cv = s.hub.cv, count = {};
    Object.keys(cv.wagons).forEach(e => E(s, +e).v.forEach(v => { count[v] = (count[v] || 0) + 1; }));
    return Object.entries(s.buildings).filter(([v, b]) => b.p === p && count[v] >= 2).length;
  }
  const robberHexes = (s, p, list) => list.filter(id => hex(s, id).number != null);
  // one wagon per turn in which a settlement or city was built (during the Action phase of either player of a paired turn)
  const beginEnd = (s, p) => {
    if (!s.flags.builtHouse || !positions(s).length) return false;
    const only = positions(s);
    // nothing to decide: a single place for the (single) wagon, so nobody needs to bid
    if (s.hub.cv.per === 1 && only.length === 1) {
      placeWagon(s, only[0].edge, p);
      core.checkWin(s);
      return s.phase !== 'play';
    }
    s.hub.ending = true;
    startVote(s, p);
    return true;
  };
  function continueEnd(s) {
    if (s.phase === 'play' && s.hub.cv.vote) advance(s);
    if (s.phase !== 'play') { s.hub.ending = false; return; }
    if (s.pending.length) return;
    s.hub.ending = false;
    core.finishTurn(s);
  }

  const handlers = {
    wagonCards(s, p, a) {
      const it = findPending(s, p, 'wagonCards');
      if (!it) fail('Nothing to vote on.');
      const pl = P(s, p), w = a.wool | 0, g = a.grain | 0;
      if (w < 0 || g < 0 || w > pl.res.wool || g > pl.res.grain) fail('You do not have those cards.');
      pl.res.wool -= w; pl.res.grain -= g; s.bank.wool += w; s.bank.grain += g;
      const v = s.hub.cv.vote;
      v.cards[p] = { wool: w, grain: g }; v.votes[p] = w + g;
      resolvePending(s, it);
      log(s, '{@p} lays out {n} votes.', { p, n: w + g });
    },
    wagonVote(s, p, a) {
      const it = findPending(s, p, 'wagonVote');
      if (!it) fail('Nothing to vote on.');
      if (!it.pub.positions.includes(a.pos)) fail('A wagon cannot go there.');
      s.hub.cv.vote.picks[p] = a.pos;
      resolvePending(s, it);
    },
    wagonPlace(s, p, a) {
      const it = findPending(s, p, 'wagonPlace');
      if (!it) fail('Nothing to decide.');
      if (!it.pub.positions.includes(a.pos)) fail('A wagon cannot go there.');
      s.hub.cv.vote.chosen = a.pos;
      resolvePending(s, it);
    },
  };

  const legalExtra = (s, p, L) => {
    for (const it of core.activePending(s).filter(i => i.player === p)) {
      if (it.type === 'wagonCards') L.wagonCards = { wool: P(s, p).res.wool, grain: P(s, p).res.grain };
      if (it.type === 'wagonVote' || it.type === 'wagonPlace') L.wagonPositions = it.pub.positions;
    }
  };
  const viewBoard = (s, vb) => { vb.waterhole = holes(s)[0]; vb.waterholes = holes(s); };
  const viewExtra = (s, me, v) => {
    const cv = s.hub.cv;
    v.hub.cv = {
      trains: cv.trains.map(t => ({ started: t.started, edges: t.edges, front: t.front, dead: t.dead })), wagons: cv.wagons, pool: cv.pool, per: cv.per || 1,
      vote: cv.vote ? { from: cv.vote.from, cards: cv.vote.cards, votes: cv.vote.votes, picks: cv.vote.picks, stage: cv.vote.stage } : null,
      positions: cv.vote ? positions(s).map(o => o.edge) : [],
    };
    v.players.forEach((pv, i) => { pv.wagonVp = vpExtra(s, i); });
  };

  return { makeBoard, init, roadWeight, vpExtra, robberHexes, beginEnd, continueEnd, handlers, legalExtra, viewBoard, viewExtra, positions };
};
