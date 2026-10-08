'use strict';
// Traders & Barbarians, scenario "Der Handelstross" (the Caravans). The nomads at the waterhole send wagons out; every
// settlement or city you build earns a vote on where the next wagon goes (wool and grain are the votes). Three caravans
// grow from the waterhole. Houses between two wagons are worth one point more, roads along a wagon count twice for the
// Longest Road. First to 12 points wins.

module.exports = function make(core, HB) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail } = core;
  const WAGONS = 22;
  const hex = (s, id) => s.board.hexes[id];

  function makeBoard({ generate, kind }) {
    const board = generate(kind);
    // the waterhole replaces the desert and lies in the middle of the island
    const desert = board.hexes.find(h => h.terrain === 'desert');
    const centre = board.hexes.reduce((a, h) => (Math.hypot(h.x, h.y) < Math.hypot(a.x, a.y) ? h : a), board.hexes[0]);
    if (desert.id !== centre.id) { centre.terrain = [desert.terrain, desert.terrain = centre.terrain][0]; [centre.number, desert.number] = [desert.number, centre.number]; }
    centre.terrain = 'waterhole'; centre.number = null;
    // three arrows point straight out of every second corner
    const parity = Math.random() < 0.5 ? 0 : 1;
    const arrows = [];
    centre.verts.forEach((v, i) => {
      if (i % 2 !== parity) return;
      const out = board.vertices[v].edges.find(e => !centre.edges.includes(e));
      arrows.push(out);
    });
    board.waterhole = { hex: centre.id, arrows };
    return board;
  }

  function init(s) {
    s.hub.cv = { trains: [0, 1, 2].map(() => ({ started: false, edges: [], front: null, dead: false })), wagons: {}, pool: WAGONS, vote: null };
  }

  // ------------------------------------------------------------ where the next wagon may go
  const freeEdge = (s, e) => s.hub.cv.wagons[e] === undefined;
  const otherEnd = (s, e, v) => { const [a, b] = E(s, e).v; return a === v ? b : a; };
  function positions(s) {
    const cv = s.hub.cv, out = [];
    if (cv.pool <= 0) return out;
    const add = (edge, train) => { if (!out.some(o => o.edge === edge)) out.push({ edge, train }); };
    const firstNew = cv.trains.findIndex(t => !t.started);
    if (firstNew >= 0) s.board.waterhole.arrows.forEach(e => { if (freeEdge(s, e)) add(e, firstNew); });
    cv.trains.forEach((t, i) => {
      if (!t.started || t.dead) return;
      V(s, t.front).edges.forEach(e => { if (freeEdge(s, e)) add(e, i); });
    });
    return out;
  }

  function placeWagon(s, edge, by) {
    const cv = s.hub.cv;
    const pos = positions(s).find(o => o.edge === edge);
    if (!pos) fail('A wagon cannot go there.');
    const t = cv.trains[pos.train];
    cv.wagons[edge] = pos.train;
    cv.pool--;
    if (!t.started) {
      t.started = true; t.edges = [edge];
      const wh = hex(s, s.board.waterhole.hex);
      t.front = E(s, edge).v.find(v => !wh.verts.includes(v));
      log(s, '{@p} starts a caravan.', { p: by, e: edge });
    } else {
      const from = t.front;
      t.edges.push(edge);
      t.front = otherEnd(s, edge, from);
      // two caravans that meet at a crossing grow together and go on as one
      const other = cv.trains.find((o, j) => j !== pos.train && o.started && !o.dead && o.front === from);
      if (other) { other.dead = true; t.merged = (t.merged || []).concat(other.edges); log(s, 'Two caravans grow together.'); }
      log(s, '{@p} sets out a caravan wagon.', { p: by, e: edge });
    }
    // a caravan that cannot go on ends
    cv.trains.forEach(o => { if (o.started && !o.dead && !V(s, o.front).edges.some(e => freeEdge(s, e))) o.dead = true; });
    if (cv.pool <= 0) cv.trains.forEach(o => { o.dead = true; });
    core.updateLongest(s);
  }

  // ------------------------------------------------------------ the vote
  function startVote(s, p) {
    const n = s.players.length;
    s.hub.cv.vote = { from: p, order: Array.from({ length: n }, (_, i) => (p + i) % n), idx: 0, stage: 'cards', cards: {}, votes: {}, picks: {}, vi: 0, voters: [] };
    log(s, 'A new wagon is set out. Everyone may lay out wool and grain as votes.');
  }
  const total = v => Object.values(v.votes).reduce((a, b) => a + b, 0);

  // pushes the next question, or finishes the vote (cv.vote becomes null)
  function advance(s) {
    const cv = s.hub.cv, v = cv.vote;
    if (!v) return;
    const pos = positions(s).map(o => o.edge);
    for (;;) {
      if (v.stage === 'cards') {
        while (v.idx < v.order.length) {
          const q = v.order[v.idx++], pl = P(s, q);
          if (pl.res.wool + pl.res.grain > 0) { pushPending(s, [{ type: 'wagonCards', player: q, pub: { positions: pos } }]); return; }
          v.cards[q] = { wool: 0, grain: 0 }; v.votes[q] = 0;
        }
        v.stage = 'decide';
      }
      if (v.stage === 'decide') {
        const tot = total(v);
        const top = Object.entries(v.votes).sort((a, b) => b[1] - a[1]);
        if (pos.length === 1) { finish(s, pos[0]); return; }
        if (!tot) { v.stage = 'place'; pushPending(s, [{ type: 'wagonPlace', player: v.from, pub: { positions: pos } }]); return; }
        if (top[0][1] > tot - top[0][1]) { v.stage = 'place'; pushPending(s, [{ type: 'wagonPlace', player: +top[0][0], pub: { positions: pos } }]); log(s, '{@p} has more votes than all the others together and decides.', { p: +top[0][0] }); return; }
        v.voters = v.order.filter(q => v.votes[q] > 0);
        v.stage = 'vote'; v.vi = 0;
      }
      if (v.stage === 'vote') {
        if (v.vi < v.voters.length) { const q = v.voters[v.vi++]; pushPending(s, [{ type: 'wagonVote', player: q, pub: { positions: pos, votes: v.votes[q] } }]); return; }
        // count the votes
        const tally = {};
        v.voters.forEach(q => { tally[v.picks[q]] = (tally[v.picks[q]] || 0) + v.votes[q]; });
        const best = Math.max(...Object.values(tally));
        const tops = Object.keys(tally).filter(k => tally[k] === best);
        if (tops.length === 1) { finish(s, +tops[0]); return; }
        // no tile has the most votes: the player with most votes chooses, or the one whose turn it was
        const mv = Math.max(...v.voters.map(q => v.votes[q]));
        const lead = v.voters.filter(q => v.votes[q] === mv);
        v.stage = 'place';
        pushPending(s, [{ type: 'wagonPlace', player: lead.length === 1 ? lead[0] : v.from, pub: { positions: pos } }]);
        return;
      }
      if (v.stage === 'place') {
        if (v.chosen != null) { finish(s, v.chosen); return; }
        return;
      }
    }
  }
  function finish(s, edge) {
    const cv = s.hub.cv, v = cv.vote;
    placeWagon(s, edge, v.from);
    cv.vote = null;
  }

  // ------------------------------------------------------------ rules the engine asks about
  function roadWeight(s, e) { return s.hub.cv.wagons[e] !== undefined ? 2 : 1; }
  function vpExtra(s, p) {
    const cv = s.hub.cv, count = {};
    Object.keys(cv.wagons).forEach(e => E(s, +e).v.forEach(v => { count[v] = (count[v] || 0) + 1; }));
    return Object.entries(s.buildings).filter(([v, b]) => b.p === p && count[v] >= 2).length;
  }
  const robberHexes = (s, p, list) => list.filter(id => hex(s, id).number != null);
  const beginEnd = (s, p) => {
    if (!s.flags.builtHouse || !positions(s).length) return false;
    s.hub.ending = true;
    startVote(s, p);
    return true;
  };
  function continueEnd(s) {
    if (s.hub.cv.vote) { advance(s); if (s.pending.length) return; }
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
  const viewBoard = (s, vb) => { vb.waterhole = s.board.waterhole; };
  const viewExtra = (s, me, v) => {
    const cv = s.hub.cv;
    v.hub.cv = {
      trains: cv.trains.map(t => ({ started: t.started, edges: t.edges, front: t.front, dead: t.dead })), wagons: cv.wagons, pool: cv.pool,
      vote: cv.vote ? { from: cv.vote.from, cards: cv.vote.cards, votes: cv.vote.votes, picks: cv.vote.picks, stage: cv.vote.stage } : null,
      positions: cv.vote ? positions(s).map(o => o.edge) : [],
    };
    v.players.forEach((pv, i) => { pv.wagonVp = vpExtra(s, i); });
  };

  return { makeBoard, init, roadWeight, vpExtra, robberHexes, beginEnd, continueEnd, handlers, legalExtra, viewBoard, viewExtra, positions };
};
