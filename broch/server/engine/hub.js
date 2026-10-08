'use strict';
// Traders & Barbarians (Händler & Barbaren), after the German rulebook: four variants (friendly robber, event cards,
// harbours of Catan; "Catan for two" is not in) and five scenarios (Fishermen of Catan, Rivers of Catan, the Caravans,
// the Barbarian Attack, Traders & Barbarians). The three big scenarios live in hub-caravans.js, hub-barbarians.js and
// hub-traders.js and plug in through the hooks below. game.js and expansions.js only call the functions this file returns.

const C = require('./constants');
const { shuffle, geometry, placePorts } = require('./board');

module.exports = function make(core) {
  const { log, pushPending, findPending, resolvePending, P, V, E, fail, has, pay, take, hand, countPieces, isRes, updateLongest, steal, K, activePending } = core;

  const H = (s, id) => s.board.hexes[id];
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const SCEN = ['fishermen', 'rivers', 'caravans', 'barbarians', 'traders'];
  const BIG3 = ['caravans', 'barbarians', 'traders'];
  const api = {};
  const MODS = {};

  const rowsOf = board => {
    const ys = [...new Set(board.hexes.map(h => h.y))].sort((a, b) => a - b);
    return ys.map(y => board.hexes.filter(h => h.y === y).sort((a, b) => a.x - b.x).map(h => h.id));
  };
  const edgeBetween = (board, a, b) => board.edges.find(e => e.hexes.length === 2 && e.hexes.includes(a) && e.hexes.includes(b));
  const hubOf = s => s.hub || null;
  const mod = s => (s.hub && s.hub.mod ? MODS[s.hub.mod] : null);
  // run an optional hook of the active big scenario
  const hook = (s, name, ...args) => { const m = mod(s); return m && m[name] ? m[name](s, ...args) : undefined; };

  // ------------------------------------------------------------ options
  // The book plays one scenario at a time. The three big scenarios need the classic rules and a 2-4 player board.
  api.normalize = (v = {}, { big = false, players = 4, knights = false } = {}) => {
    const out = { fishermen: false, rivers: false, caravans: false, barbarians: false, traders: false, events: !!v.events, friendly: !!v.friendly, harbors: !!v.harbors };
    const big3 = BIG3.find(k => v[k]);
    if (big3) {
      if (big || players > 4 || knights) fail('This scenario is for the classic rules and 2–4 players.');
      out[big3] = true;
    } else if (v.fishermen) out.fishermen = true;
    else if (v.rivers) out.rivers = true;
    return out;
  };
  api.defaultVp = v => C.tradersVp(v);
  api.scenarioOf = v => SCEN.find(k => v && v[k]) || null;

  // ------------------------------------------------------------ boards
  // the ring of coast corners in walking order
  function coastRing(board) {
    const coast = board.edges.filter(e => e.hexes.length === 1);
    const adj = new Map();
    coast.forEach(e => e.v.forEach(v => { if (!adj.has(v)) adj.set(v, []); adj.get(v).push(e.id); }));
    const start = coast[0].v[0];
    const ring = [start];
    let prev = null, cur = start;
    for (let i = 0; i < coast.length + 2; i++) {
      const next = adj.get(cur).map(id => board.edges[id]).map(e => (e.v[0] === cur ? e.v[1] : e.v[0])).find(v => v !== prev);
      if (next === undefined || next === start) break;
      ring.push(next); prev = cur; cur = next;
    }
    return ring;
  }

  // fishing grounds: every ground covers 3 corners along the coast; some corners are harbour corners as well
  function placeGrounds(board, nums) {
    const ring = coastRing(board), n = ring.length, k = nums.length;
    const portEdges = new Set(board.ports.map(p => p.edge));
    const between = (i, j) => (board.edges.find(e => e.v.includes(ring[i % n]) && e.v.includes(ring[j % n])) || {}).id;
    const okCenter = c => !portEdges.has(between(c - 1 + n, c)) && !portEdges.has(between(c, c + 1));
    let centers = null;
    for (let attempt = 0; attempt < 600 && !centers; attempt++) {
      const off = Math.floor(Math.random() * n), jit = attempt > 300 ? 2 : 1;
      const cs = [];
      for (let i = 0; i < k; i++) cs.push((off + Math.round(i * n / k) + Math.floor(Math.random() * (2 * jit + 1)) - jit + n) % n);
      const sorted = cs.slice().sort((a, b) => a - b);
      let ok = sorted.every((c, i) => { const nx = i + 1 < k ? sorted[i + 1] : sorted[0] + n; return nx - c >= 3; });
      if (ok && attempt < 500) ok = cs.every(okCenter);
      if (ok) centers = cs;
    }
    if (!centers) centers = Array.from({ length: k }, (_, i) => Math.round(i * n / k) % n);
    const mean = v => { const hs = board.vertices[v].hexes.map(i => board.hexes[i]); return { x: hs.reduce((a, h) => a + h.x, 0) / hs.length, y: hs.reduce((a, h) => a + h.y, 0) / hs.length }; };
    const numbers = shuffle(nums.slice());
    return centers.map((c, i) => {
      const v = board.vertices[ring[c]], m = mean(ring[c]);
      const dx = v.x - m.x, dy = v.y - m.y, d = Math.hypot(dx, dy) || 1;
      return { id: i, number: numbers[i], verts: [ring[(c - 1 + n) % n], ring[c], ring[(c + 1) % n]], x: +(v.x + dx / d * 0.7).toFixed(3), y: +(v.y + dy / d * 0.7).toFixed(3) };
    });
  }

  function interiorBoard(generate, kind, deserts) {
    for (let i = 0; i < 800; i++) {
      const b = generate(kind);
      if (!deserts || b.hexes.filter(h => h.terrain === 'desert').every(h => h.neighbors.length === 6)) return b;
    }
    return generate(kind);
  }

  // numbers for a land set: red numbers must not touch; `fixed2` puts the extra 2 chip on the 12 (3-4 players)
  function numberLand(board, ids, nums) {
    const isRed = n => n === 6 || n === 8;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const list = shuffle(nums.slice());
      ids.forEach((id, i) => { board.hexes[id].number = list[i]; });
      const okRed = ids.every(id => { const h = board.hexes[id]; return !isRed(h.number) || h.neighbors.every(n => !isRed(board.hexes[n].number)); });
      const okSame = ids.every(id => { const h = board.hexes[id]; return h.neighbors.every(n => board.hexes[n].number !== h.number); });
      if (okRed && (okSame || attempt > 1500)) break;
    }
  }

  function addRivers(board, big) {
    const rows = rowsOf(board);
    const strips = big
      ? [{ ids: rows[1], t: ['swamp', 'pasture', 'hills', 'mountains'], end: true }, { ids: rows[5].slice(0, 3), t: ['swamp', 'hills', 'mountains'], end: true }, { ids: [rows[2][2], rows[3][3], rows[4][3]], t: ['pasture', 'pasture', 'mountains'], end: false }]
      : [{ ids: rows[1], t: ['swamp', 'pasture', 'hills', 'mountains'], end: true }, { ids: rows[3].slice(0, 3), t: ['swamp', 'hills', 'mountains'], end: true }];
    const used = new Set();
    const sites = [];
    strips.forEach(st => {
      st.ids.forEach((id, i) => { used.add(id); const h = board.hexes[id]; h.terrain = st.t[i]; h.river = true; h.number = null; });
      for (let i = 0; i + 1 < st.ids.length; i++) sites.push(edgeBetween(board, st.ids[i], st.ids[i + 1]).id);
      if (st.end) { // the swamp is the source: the river leaves it across the edge opposite the first crossing
        const h0 = board.hexes[st.ids[0]];
        const first = edgeBetween(board, st.ids[0], st.ids[1]).id;
        sites.push(h0.edges[(h0.edges.indexOf(first) + 3) % 6]);
      }
    });
    const rest = board.hexes.map(h => h.id).filter(id => !used.has(id));
    const pool = big
      ? shuffle(['mountains', 'mountains', 'hills', 'hills', 'hills', 'pasture', 'pasture', 'pasture', ...Array(6).fill('forest'), ...Array(6).fill('fields')])
      : shuffle(['hills', 'forest', 'forest', 'forest', 'forest', 'pasture', 'pasture', 'fields', 'fields', 'fields', 'fields', 'mountains']);
    rest.forEach((id, i) => { board.hexes[id].terrain = pool[i]; board.hexes[id].number = null; });
    const land = board.hexes.filter(h => h.terrain !== 'swamp').map(h => h.id);
    const nums = big ? C.BOARDS.extended.numbers.slice() : C.BOARDS.standard.numbers.filter((n, i, a) => !(n === 2 && a.indexOf(2) === i));
    numberLand(board, land, nums);
    if (!big) { const twelve = board.hexes.find(h => h.number === 12); if (twelve) twelve.number2 = 2; }
    board.rivers = strips.map(st => st.ids);
    board.riverHexes = [...used];
    board.bridgeSites = sites;
    board.swamps = board.hexes.filter(h => h.terrain === 'swamp').map(h => h.id);
  }

  function addFishing(board, big) {
    const deserts = board.hexes.filter(h => h.terrain === 'desert');
    deserts.forEach((h, i) => { h.terrain = 'lake'; h.lake = i === 0 ? C.LAKE_NUMBERS.slice() : C.LAKE2_NUMBERS.slice(); });
    board.lakes = deserts.map(h => h.id);
    board.fishing = placeGrounds(board, big ? [...C.FISH_NUMBERS, ...C.FISH_NUMBERS_EXTRA] : C.FISH_NUMBERS);
  }

  api.makeBoard = ({ options, generate }) => {
    const v = options.variants, big = !!options.big, kind = big ? 'extended' : 'standard';
    if (v.barbarians || v.traders || v.caravans) {
      const m = MODS[v.barbarians ? 'barbarians' : v.traders ? 'traders' : 'caravans'];
      return m.makeBoard({ generate, kind, geometry, placePorts, shuffle, numberLand, rowsOf, edgeBetween });
    }
    const board = interiorBoard(generate, kind, v.fishermen);
    if (v.rivers) addRivers(board, big);
    if (v.fishermen) addFishing(board, big);
    return board;
  };
  api.initialRobber = (board, v) => {
    if (v.fishermen || v.caravans || v.barbarians || v.traders) return null; // off the board until the first 7 or knight
    if (v.rivers) return board.swamps[0];
    return undefined;
  };

  // ------------------------------------------------------------ state
  api.init = (s, options) => {
    const v = options.variants || {};
    const big = !!s.options.big;
    s.fishing = !!v.fishermen;
    s.rivers = !!v.rivers;
    s.eventCards = !!v.events;
    s.friendly = !!v.friendly;
    s.harbors = !!v.harbors;
    const scen = api.scenarioOf(v);
    s.hub = { mod: BIG3.includes(scen) ? scen : null, scenario: scen, harbor: { p: null }, big };
    s.gold = !!(s.rivers || v.barbarians || v.traders); // gold coins are in the game
    s.fish = s.fishing ? { bag: shuffle(['boot', ...tokenList(big)]), discard: [], boot: null, bootTurn: -1 } : null;
    s.deck = s.eventCards ? newDeck(s) : null;
    s.players.forEach(pl => { pl.fishTok = []; });
    hook(s, 'init', options);
  };
  const tokenList = big => {
    const out = [];
    const add = bag => Object.entries(bag).forEach(([val, n]) => { for (let i = 0; i < n; i++) out.push(+val); });
    add(C.FISH_BAG);
    if (big) add(C.FISH_BAG_EXTRA);
    return out;
  };
  api.noRobber = s => !!(s.hub && (s.hub.mod === 'barbarians' || s.hub.mod === 'traders'));

  // ------------------------------------------------------------ event cards
  function newDeck(s) {
    const cards = [];
    const dropExtremes = !!(s && s.hub && s.hub.mod === 'traders'); // the 2 and 12 are re-rolled in that scenario
    C.EVENT_CARDS.forEach(([ev, n, count]) => { if (dropExtremes && (n === 2 || n === 12)) return; for (let i = 0; i < count; i++) cards.push({ ev, n }); });
    shuffle(cards);
    // 5 cards under the New Year card, the rest on top
    return [...cards.splice(0, 5), { ev: 'newyear', n: null }, ...cards];
  }
  function drawCard(s) {
    let c = s.deck.pop();
    while (c && c.ev === 'newyear') { log(s, 'New Year: the event cards are shuffled and a new one is drawn.'); s.deck = newDeck(s); c = s.deck.pop(); }
    return c;
  }
  const deckLeft = s => { const i = s.deck.findIndex(c => c.ev === 'newyear'); return i < 0 ? s.deck.length : s.deck.length - 1 - i; };

  // The numbers for a roll: two dice or an event card (and the 2 and 12 are rolled again in Traders & Barbarians).
  api.rollValues = s => {
    let red = d6(), yellow = d6(), card = null;
    if (s.eventCards) {
      card = drawCard(s);
      if (K(s)) { yellow = null; } else { red = null; yellow = null; }
      return { red, yellow, total: card.n, card };
    }
    if (s.hub && s.hub.mod === 'traders') while (red + yellow === 2 || red + yellow === 12) { red = d6(); yellow = d6(); }
    return { red, yellow, total: red + yellow, card };
  };

  // the other player of the pair "next to me": the one whose turn comes after mine (left neighbour)
  const left = (s, p) => (p + 1) % s.players.length;
  const others = (s, p) => s.players.map((_, i) => i).filter(i => i !== p);
  const knightScore = (s, p) => {
    if (K(s)) return Object.values(s.knights).filter(k => k.p === p && k.active).reduce((a, k) => a + k.level, 0);
    const m = mod(s);
    if (m && m.knightScore) return m.knightScore(s, p);
    return s.players[p].knightsPlayed;
  };
  const harborBuildings = (s, p) => Object.entries(s.buildings).filter(([v, b]) => b.p === p && V(s, +v).port && !(mod(s) && mod(s).conquered && mod(s).conquered(s, +v))).length;
  const stealOptions = (s, p) => others(s, p).filter(q => hand(P(s, q)) > 0);

  // Runs the effect of the card that was turned over; the yields follow afterwards (game.js).
  api.runCard = (s, card) => {
    const p = s.current, n = s.players.length;
    log(s, 'Event card: {#e}.', { e: card.ev, n: card.n });
    switch (card.ev) {
      case 'raid': core.handleSeven(s, true); break;
      case 'plague': s.flags.plague = true; break;
      case 'quake': {
        const items = [];
        s.players.forEach((pl, q) => { const opts = intactRoads(s, q); if (opts.length) items.push({ type: 'quake', player: q }); });
        s.flags.quakeBy = true;
        pushPending(s, items);
        break;
      }
      case 'neighbors': {
        const items = [];
        s.players.forEach((pl, q) => { if (hand(pl) > 0 && n > 1) items.push({ type: 'give', player: q, to: left(s, q), count: 1, pub: { good: true } }); });
        pushPending(s, items);
        break;
      }
      case 'tournament': {
        const sc = s.players.map((_, q) => knightScore(s, q));
        const max = Math.max(...sc);
        if (max <= 0) { log(s, 'Nobody has played a knight yet.'); break; }
        const win = sc.map((x, q) => [x, q]).filter(([x]) => x === max).map(([, q]) => q);
        log(s, '{@ps} may take a resource of their choice.', { ps: win });
        pushPending(s, win.map(q => ({ type: 'bankPick', player: q, count: 1 })));
        break;
      }
      case 'advantage': {
        if (s.longestRoad.p == null || (mod(s) && mod(s).noLongest)) { log(s, 'Nobody holds the Longest Road.'); break; }
        const q = s.longestRoad.p, opts = stealOptions(s, q);
        if (opts.length) pushPending(s, [{ type: 'steal', player: q, options: opts }]);
        break;
      }
      case 'calm': {
        const cnt = s.players.map((_, q) => harborBuildings(s, q));
        const max = Math.max(...cnt);
        if (max <= 0) break;
        const win = cnt.map((x, q) => [x, q]).filter(([x]) => x === max).map(([, q]) => q);
        log(s, '{@ps} may take a resource of their choice.', { ps: win });
        pushPending(s, win.map(q => ({ type: 'bankPick', player: q, count: 1 })));
        break;
      }
      case 'help': {
        const pts = s.players.map((_, q) => core.vp(s, q));
        const max = Math.max(...pts);
        const items = [];
        s.players.forEach((pl, q) => {
          if (pts[q] !== max || hand(pl) < 1) return;
          const to = s.players.map((_, i) => i).filter(i => pts[i] < max);
          if (to.length) items.push({ type: 'helpGive', player: q, options: to });
        });
        pushPending(s, items);
        break;
      }
      case 'conflict': {
        let who = null;
        const m = mod(s);
        if (!K(s) && s.largestArmy.p != null && !m) who = s.largestArmy.p;
        else {
          const sc = s.players.map((_, q) => knightScore(s, q));
          const max = Math.max(...sc);
          if (max > 0 && sc.filter(x => x === max).length === 1) who = sc.indexOf(max);
        }
        if (who == null) { log(s, 'Nobody is ahead in knights.'); break; }
        const opts = stealOptions(s, who);
        if (opts.length) pushPending(s, [{ type: 'steal', player: who, options: opts }]);
        break;
      }
      case 'bounty':
        pushPending(s, s.players.map((_, q) => ({ type: 'bankPick', player: q, count: 1 })));
        break;
      case 'retreat': {
        if (api.noRobber(s)) { log(s, 'There is no robber in this scenario.'); break; }
        const home = robberHome(s);
        s.robber = home;
        log(s, 'The robber returns to his hideout.');
        break;
      }
      default: break; // a fine day: nothing happens
    }
  };
  // where the robber waits: the desert, the swamp, or beside the board
  function robberHome(s) {
    if (s.hub.scenario === 'rivers') return s.board.swamps[0];
    if (s.hub.scenario === 'fishermen' || s.hub.scenario === 'caravans') return null;
    const d = s.board.hexes.find(h => h.terrain === 'desert');
    return d ? d.id : null;
  }
  api.robberHome = robberHome;

  const intactRoads = (s, p) => Object.keys(s.roads).filter(e => s.roads[e] === p && !(s.damaged && s.damaged[e])).map(Number);
  const hasDamage = (s, p) => !!s.damaged && Object.keys(s.damaged).some(e => s.roads[e] === p);

  // ------------------------------------------------------------ yields
  api.hexPays = (s, h, total) => {
    if (h.number !== total && h.number2 !== total) return false;
    const m = mod(s);
    return !(m && m.hexPays && !m.hexPays(s, h, total));
  };
  api.afterProduce = (s, total) => {
    if (s.fishing) fishProduce(s, total);
    hook(s, 'afterProduce', total);
  };

  // ------------------------------------------------------------ fishermen
  function drawToken(s) {
    const f = s.fish;
    if (!f.bag.length && f.discard.length) { f.bag = shuffle(f.discard.splice(0)); log(s, 'The used fish tokens are shuffled into a new stock.'); }
    return f.bag.length ? f.bag.pop() : null;
  }
  const fishSum = pl => pl.fishTok.reduce((a, b) => a + b, 0);
  function getToken(s, p) {
    const t = drawToken(s);
    if (t == null) return 0;
    if (t === 'boot') { s.fish.boot = p; s.fish.bootTurn = s.turn; log(s, '{@p} pulls up the old boot and now needs one more point to win.', { p }); return 1; }
    P(s, p).fishTok.push(t);
    return 1;
  }
  function receiveFish(s, p, count) {
    const pl = P(s, p);
    let got = 0, full = false;
    for (let i = 0; i < count; i++) {
      if (pl.fishTok.length >= C.FISH_MAX) { full = true; break; }
      got += getToken(s, p);
    }
    if (got) log(s, '{@p} catches {n} fish tokens.', { p, n: got });
    if (full && pl.fishTok.length >= C.FISH_MAX) pushPending(s, [{ type: 'fishSwap', player: p }]);
    pl.fish = fishSum(pl);
  }
  function fishProduce(s, total) {
    const want = s.players.map(() => 0);
    const addAround = verts => verts.forEach(v => { const b = s.buildings[v]; if (b) want[b.p] += b.type === 'city' ? 2 : 1; });
    for (const g of s.board.fishing) if (g.number === total && !fishBlocked(s, g)) addAround(g.verts);
    for (const id of s.board.lakes || []) { const h = H(s, id); if (h.lake.includes(total) && s.robber !== id) addAround(h.verts); }
    const n = s.players.length;
    for (let i = 0; i < n; i++) { const p = (s.current + i) % n; if (want[p]) receiveFish(s, p, want[p]); }
  }
  const fishBlocked = () => false;
  const fishingSpot = (s, v) => s.fishing && (s.board.fishing.some(g => g.verts.includes(v)) || (s.board.lakes || []).some(id => H(s, id).verts.includes(v)));

  // ------------------------------------------------------------ harbours of Catan
  const harborPoints = (s, p) => Object.entries(s.buildings).reduce((a, [v, b]) => a + (b.p === p && V(s, +v).port && !(mod(s) && mod(s).conquered && mod(s).conquered(s, +v)) ? (b.type === 'city' ? 2 : 1) : 0), 0);
  function updateHarbors(s) {
    if (!s.harbors) return;
    const pts = s.players.map((_, p) => harborPoints(s, p));
    const h = s.hub.harbor;
    const best = Math.max(...pts);
    if (h.p == null) {
      if (best < 3) return;
      const top = pts.map((x, p) => [x, p]).filter(([x]) => x === best).map(([, p]) => p);
      h.p = top.includes(s.current) ? s.current : top[0];
      log(s, '{@p} takes the Strongest Harbors plaque (+2 points).', { p: h.p });
    } else if (best > pts[h.p]) {
      const top = pts.map((x, p) => [x, p]).filter(([x]) => x === best).map(([, p]) => p);
      const q = top.includes(s.current) ? s.current : top[0];
      log(s, '{@p} takes the Strongest Harbors plaque from {@q} (+2 points).', { p: q, q: h.p });
      h.p = q;
    }
  }
  api.harborPoints = harborPoints;

  // ------------------------------------------------------------ rivers: gold, richest and poorest
  const riverHexSet = s => new Set(s.board.riverHexes || []);
  const onRiverEdge = (s, e) => !s.board.bridgeSites.includes(e) && E(s, e).hexes.some(i => riverHexSet(s).has(i));
  const onRiverVertex = (s, v) => V(s, v).hexes.some(i => riverHexSet(s).has(i));
  api.giveGold = (s, p, n) => {
    if (!s.gold || !n) return;
    P(s, p).gold += n;
    log(s, '{@p} earns {n} gold.', { p, n });
  };
  // Richest Catanian: the one player with the most gold (+1). Poorest: everybody with the least gold (-2), or everybody when all are equal.
  api.riverVp = (s, p) => {
    const golds = s.players.map(pl => pl.gold);
    const max = Math.max(...golds), min = Math.min(...golds);
    let v = 0;
    if (golds[p] === max && golds.filter(g => g === max).length === 1) v += 1;
    if (golds[p] === min) v -= 2;
    return v;
  };

  // ------------------------------------------------------------ rules the engine asks about
  // may a new road go here? (rivers: no road across a river; earthquake: repair first; scenarios: conquered coast ...)
  api.roadEdgeOk = (s, e, p) => {
    if (s.rivers && s.board.bridgeSites.includes(e)) return false;
    if (p != null && hasDamage(s, p) && s.phase === 'play') return false;
    const m = mod(s);
    return !(m && m.roadEdgeOk && !m.roadEdgeOk(s, e, p));
  };
  api.settlementOk = (s, v, p) => {
    if (s.damaged && V(s, v).edges.some(e => s.damaged[e])) return false;
    const m = mod(s);
    return !(m && m.settlementOk && !m.settlementOk(s, v, p));
  };
  api.cityOk = (s, v, p) => { const m = mod(s); return !(m && m.cityOk && !m.cityOk(s, v, p)); };
  api.setupSpotOk = (s, v) => { const m = mod(s); return !(m && m.setupSpotOk && !m.setupSpotOk(s, v)); };

  // robber: friendly robber and tiles that cannot hold him
  api.robberHexes = (s, p, list) => {
    let out = list;
    const m = mod(s);
    if (m && m.robberHexes) out = m.robberHexes(s, p, out);
    if (s.hub.scenario === 'rivers' || s.hub.scenario === 'fishermen') out = out.filter(id => H(s, id).terrain !== 'sea');
    if (s.friendly) {
      const ok = out.filter(id => !friendlyBlocked(s, p, id));
      out = ok;
    }
    return out;
  };
  function friendlyBlocked(s, p, id) {
    return H(s, id).verts.some(v => { const b = s.buildings[v]; return b && b.p !== p && core.vp(s, b.p) <= 2; });
  }
  // players the robber may still steal from
  api.victimOk = (s, p, q) => !s.friendly || core.vp(s, q) > 2;

  // ------------------------------------------------------------ after something was built
  api.built = (s, p, kind, where) => {
    const setup = s.phase === 'setup';
    if (s.rivers) {
      if (kind === 'bridge') api.giveGold(s, p, 3);
      else if (kind === 'road') { if (onRiverEdge(s, where)) api.giveGold(s, p, 1); }
      else if (kind === 'settlement' && onRiverVertex(s, where)) api.giveGold(s, p, 1);
    }
    if (s.fishing && setup && kind === 'settlement' && s.setup.idx >= s.players.length && fishingSpot(s, where)) receiveFish(s, p, 1);
    if (!setup && (kind === 'settlement' || kind === 'city')) s.flags.builtHouse = true;
    updateHarbors(s);
    hook(s, 'built', p, kind, where);
  };

  // ------------------------------------------------------------ victory points
  api.vpExtra = (s, p) => {
    let pts = 0;
    if (s.rivers) pts += api.riverVp(s, p);
    if (s.harbors && s.hub.harbor.p === p) pts += 2;
    const m = mod(s);
    if (m && m.vpExtra) pts += m.vpExtra(s, p);
    return pts;
  };
  api.vpTarget = (s, p) => s.options.vpTarget + (s.fish && s.fish.boot === p ? 1 : 0);

  // ------------------------------------------------------------ handlers
  const requireMain = (s, p) => core.requireMain(s, p);
  const requireActor = (s, p) => core.requireActor(s, p);
  const usedBridges = (s, p) => Object.keys(s.bridges).filter(e => s.roads[e] === p).length;

  function legalBridges(s, p) {
    if (!s.rivers || hasDamage(s, p)) return [];
    return s.board.bridgeSites.filter(e => s.roads[e] === undefined && E(s, e).v.some(v => {
      const b = s.buildings[v];
      if (b && b.p === p) return true;
      if (core.foreignAt(s, v, p)) return false;
      return V(s, v).edges.some(x => s.roads[x] === p);
    }));
  }
  api.legalBridges = legalBridges;

  // which fish tokens to spend: the token indexes the player chose, worth at least `cost` fish
  function spendTokens(s, p, idxs, cost) {
    const pl = P(s, p);
    const list = Array.isArray(idxs) ? [...new Set(idxs.map(Number))] : [];
    if (!list.length || !list.every(i => Number.isInteger(i) && pl.fishTok[i] != null)) fail('Choose fish tokens.');
    const sum = list.reduce((a, i) => a + pl.fishTok[i], 0);
    if (sum < cost) fail('You need {n} fish.', { n: cost });
    return list;
  }
  function payTokens(s, p, list) {
    const pl = P(s, p);
    list.sort((a, b) => b - a).forEach(i => { s.fish.discard.push(pl.fishTok[i]); pl.fishTok.splice(i, 1); });
    pl.fish = fishSum(pl);
  }

  api.handlers = {
    // ---- rivers
    buildBridge(s, p, a) {
      if (!s.rivers) fail('There are no rivers in this game.');
      requireActor(s, p);
      if (usedBridges(s, p) >= C.PIECES.bridge) fail('No bridges left.');
      if (!legalBridges(s, p).includes(a.e)) fail('You cannot build a bridge there.');
      if (!has(P(s, p), C.COSTS.bridge)) fail('Not enough resources.');
      pay(s, P(s, p), C.COSTS.bridge);
      s.roads[a.e] = p; s.bridges[a.e] = true;
      log(s, '{@p} built a bridge.', { p });
      api.built(s, p, 'bridge', a.e);
      updateLongest(s);
    },
    goldTrade(s, p, a) {
      if (!s.gold) fail('There is no gold in this game.');
      requireMain(s, p);
      if (!isRes(a.res)) fail('Pick a resource.');
      if ((s.flags.goldTrades || 0) >= 2) fail('You can swap gold only twice per turn.');
      const pl = P(s, p);
      if (pl.gold < 2) fail('You need 2 gold.');
      if (s.bank[a.res] < 1) fail('The bank is out of that.');
      pl.gold -= 2; s.flags.goldTrades = (s.flags.goldTrades || 0) + 1;
      take(s, pl, a.res, 1);
      log(s, '{@p} swaps 2 gold for {$c}.', { p, c: { [a.res]: 1 } });
    },
    // ---- fishermen
    useFish(s, p, a) {
      if (!s.fishing) fail('There are no fishermen in this game.');
      requireMain(s, p);
      const cost = C.FISH_COSTS[a.what];
      if (!cost) fail('Unknown fish trade.');
      const pl = P(s, p);
      if (fishSum(pl) < cost) fail('You need {n} fish.', { n: cost });
      const spend = a.tokens === undefined ? bestTokens(pl, cost) : spendTokens(s, p, a.tokens, cost);
      if (!spend) fail('You need {n} fish.', { n: cost });
      switch (a.what) {
        case 'robber':
          if (s.robber == null) fail('The robber is not on the board.');
          payTokens(s, p, spend);
          s.robber = null;
          log(s, '{@p} spends {n} fish to take the robber off the board.', { p, n: cost });
          break;
        case 'steal': {
          const q = a.target;
          if (q === p || !P(s, q) || !hand(P(s, q))) fail('Pick a player with cards.');
          payTokens(s, p, spend);
          log(s, '{@p} spends {n} fish.', { p, n: cost });
          steal(s, p, q);
          break;
        }
        case 'take':
          if (!isRes(a.res) || s.bank[a.res] < 1) fail('Pick a resource the bank has.');
          payTokens(s, p, spend);
          take(s, pl, a.res, 1);
          log(s, '{@p} trades {n} fish for {$c}.', { p, n: cost, c: { [a.res]: 1 } });
          break;
        case 'road':
          if (countPieces(s, p).roads >= C.PIECES.road) fail('No roads left.');
          if (hasDamage(s, p)) fail('Repair your damaged road first.');
          payTokens(s, p, spend);
          s.free.roads++;
          log(s, '{@p} trades {n} fish for a free road.', { p, n: cost });
          break;
        case 'dev':
          if (K(s)) {
            payTokens(s, p, spend);
            log(s, '{@p} trades {n} fish for a progress card.', { p, n: cost });
            pushPending(s, [{ type: 'chooseProgress', player: p }], true);
          } else {
            const hubDeck = mod(s) && mod(s).devDeck ? mod(s).devDeck(s) : s.devDeck;
            if (!hubDeck.length) fail('The development deck is empty.');
            payTokens(s, p, spend);
            if (mod(s) && mod(s).drawDev) mod(s).drawDev(s, p);
            else pl.dev.push({ type: s.devDeck.pop(), turn: s.turn });
            log(s, '{@p} trades {n} fish for a development card.', { p, n: cost });
          }
          break;
        default: break;
      }
    },
    fishSwap(s, p, a) {
      const it = findPending(s, p, 'fishSwap');
      if (!it) fail('Nothing to swap.');
      const pl = P(s, p);
      resolvePending(s, it);
      if (a.idx == null) return;
      if (pl.fishTok[a.idx] == null) fail('Choose fish tokens.');
      const old = pl.fishTok.splice(a.idx, 1)[0];
      const t = drawToken(s);
      s.fish.discard.push(old);
      if (t === 'boot') { s.fish.boot = p; s.fish.bootTurn = s.turn; log(s, '{@p} pulls up the old boot and now needs one more point to win.', { p }); }
      else if (t != null) { pl.fishTok.push(t); log(s, '{@p} swaps a fish token.', { p }); }
      pl.fish = fishSum(pl);
    },
    giveBoot(s, p, a) {
      if (!s.fishing) fail('There are no fishermen in this game.');
      requireMain(s, p);
      if (s.fish.boot !== p) fail('You do not have the old boot.');
      if (s.turn <= s.fish.bootTurn) fail('You can pass the old boot on from your next turn.');
      const q = a.to;
      if (q === p || !P(s, q)) fail('Pick a player.');
      if (core.vp(s, q, false) < core.vp(s, p, false)) fail('The boot goes to a player with at least as many points as you.');
      s.fish.boot = q; s.fish.bootTurn = s.turn;
      log(s, '{@p} passes the old boot to {@q}.', { p, q });
    },
    // ---- event cards
    quake(s, p, a) {
      const it = findPending(s, p, 'quake');
      if (!it) fail('Nothing to damage.');
      if (!intactRoads(s, p).includes(a.e)) fail('Pick one of your roads.');
      s.damaged = s.damaged || {};
      s.damaged[a.e] = true;
      resolvePending(s, it);
      log(s, "The earthquake damages {@p}'s road.", { p });
    },
    repairRoad(s, p, a) {
      if (!s.damaged || !s.damaged[a.e] || s.roads[a.e] !== p) fail('Pick one of your damaged roads.');
      core.requireTurnAny(s, p);
      if (!has(P(s, p), { lumber: 1, brick: 1 })) fail('Not enough resources.');
      pay(s, P(s, p), { lumber: 1, brick: 1 });
      delete s.damaged[a.e];
      log(s, '{@p} repairs a road.', { p });
    },
    bankPick(s, p, a) {
      const it = findPending(s, p, 'bankPick');
      if (!it) fail('Nothing to take.');
      const cards = a.cards || {};
      const n = Object.values(cards).reduce((x, y) => x + y, 0);
      if (!Object.entries(cards).every(([k, c]) => isRes(k) && Number.isInteger(c) && c >= 0) || n !== it.count) fail('Choose exactly {n} cards.', { n: it.count });
      if (Object.entries(cards).some(([k, c]) => s.bank[k] < c)) fail('The bank does not have those.');
      for (const [k, c] of Object.entries(cards)) take(s, P(s, p), k, c);
      log(s, '{@p} takes {$c} from the bank.', { p, c: cards });
      resolvePending(s, it);
    },
    helpGive(s, p, a) {
      const it = findPending(s, p, 'helpGive');
      if (!it) fail('Nothing to give.');
      if (!it.options.includes(a.to)) fail('Pick a player with fewer points.');
      const pl = P(s, p);
      if (!(isRes(a.card) || (K(s) && C.COMM.includes(a.card))) || !has(pl, { [a.card]: 1 })) fail('You do not have those cards.');
      core.moveCard(pl, P(s, a.to), a.card, 1);
      resolvePending(s, it);
      log(s, '{@p} gives {@q} a card.', { p, q: a.to });
    },
  };
  function bestTokens(pl, cost) {
    // the cheapest set of tokens worth at least `cost`: fewest fish wasted, then fewest tokens
    const idx = pl.fishTok.map((v, i) => i);
    let best = null;
    const rec = (i, chosen, sum) => {
      if (sum >= cost) { const waste = sum - cost; if (!best || waste < best.waste || (waste === best.waste && chosen.length < best.list.length)) best = { waste, list: chosen.slice() }; return; }
      for (let j = i; j < idx.length; j++) { chosen.push(idx[j]); rec(j + 1, chosen, sum + pl.fishTok[idx[j]]); chosen.pop(); }
    };
    rec(0, [], 0);
    return best ? best.list : null;
  }

  // ------------------------------------------------------------ what comes after every action
  // hands the first pending moveRobber to the desert when the friendly robber leaves no tile
  api.afterAct = s => {
    if (s.phase !== 'play') return;
    const it = s.pending[0];
    if (it && it.type === 'moveRobber' && (s.friendly || api.noRobber(s))) {
      const L = legalRobberList(s, it.player);
      if (!L.length) {
        resolveAllRobber(s, it);
      }
    }
    hook(s, 'afterAct');
    const m = mod(s);
    if (s.hub.ending && !s.pending.length && m && m.continueEnd) m.continueEnd(s);
  };
  function legalRobberList(s, p) {
    const base = s.board.hexes.filter(h => !h.hidden && h.terrain !== 'sea' && h.id !== s.robber).map(h => h.id);
    return api.robberHexes(s, p, base);
  }
  api.legalRobberList = legalRobberList;
  function resolveAllRobber(s, it) {
    resolvePending(s, it);
    const home = robberHome(s);
    if (home !== undefined && home !== s.robber) s.robber = home;
    log(s, 'No tile is open to the robber, so he stays away.');
  }

  // end of turn: scenarios may need a few more steps first
  api.beginEnd = (s, p) => {
    const m = mod(s);
    if (!m || !m.beginEnd) return false;
    return m.beginEnd(s, p);
  };

  // ------------------------------------------------------------ legal moves
  api.legalExtra = (s, p, L, actor, main) => {
    if (actor && s.rivers && countPieces) {
      if (has(P(s, p), C.COSTS.bridge) && usedBridges(s, p) < C.PIECES.bridge) L.bridges = legalBridges(s, p);
    }
    for (const it of activePending(s).filter(i => i.player === p)) {
      if (it.type === 'quake') L.quakeRoads = intactRoads(s, p);
      if (it.type === 'fishSwap') L.fishSwap = true;
      if (it.type === 'helpGive') L.helpTo = it.options;
    }
    if (main) {
      if (s.fishing) {
        const pl = P(s, p);
        L.fish = {};
        for (const [k, c] of Object.entries(C.FISH_COSTS)) L.fish[k] = fishSum(pl) >= c && !(k === 'robber' && s.robber == null) && !(k === 'road' && (countPieces(s, p).roads >= C.PIECES.road || hasDamage(s, p)));
        L.fishTokens = pl.fishTok.slice();
        if (s.fish.boot === p && s.turn > s.fish.bootTurn) L.boot = s.players.map((_, q) => q).filter(q => q !== p && core.vp(s, q, false) >= core.vp(s, p, false));
      }
      if (s.gold) L.goldTrade = P(s, p).gold >= 2 && (s.flags.goldTrades || 0) < 2;
      if (s.damaged) { const mine = Object.keys(s.damaged).filter(e => s.roads[e] === p).map(Number); if (mine.length) L.repair = { edges: mine, ok: has(P(s, p), { lumber: 1, brick: 1 }) }; }
    }
    hook(s, 'legalExtra', p, L, actor, main);
  };

  // ------------------------------------------------------------ views
  api.viewBoard = (s, b, vb) => {
    if (b.fishing) vb.fishing = b.fishing;
    if (b.rivers) { vb.rivers = b.rivers; vb.bridgeSites = b.bridgeSites; vb.riverHexes = b.riverHexes; }
    if (b.lakes) vb.lakes = b.lakes;
    hook(s, 'viewBoard', vb);
  };
  api.viewExtra = (s, me, v) => {
    v.rivers = s.rivers; v.fishing = s.fishing; v.eventCards = s.eventCards; v.gold = s.gold;
    v.hub = { scenario: s.hub.scenario, friendly: s.friendly, harbors: s.harbors, events: s.eventCards, harborHolder: s.hub.harbor.p, damaged: s.damaged || {} };
    if (s.harbors) v.hub.harborPts = s.players.map((_, p) => harborPoints(s, p));
    if (s.fish) v.fish = { left: s.fish.bag.length, boot: s.fish.boot, used: s.fish.discard.length, bootFree: s.fish.boot != null && s.turn > s.fish.bootTurn };
    if (s.deck) v.deckLeft = deckLeft(s);
    v.players.forEach((pv, i) => {
      const pl = s.players[i];
      const self = i === me || s.phase === 'over';
      pv.gold = pl.gold;
      pv.fishTokens = pl.fishTok.length;
      pv.fish = self ? fishSum(pl) : null;
      pv.fishTok = self ? pl.fishTok.slice() : null;
      pv.pieces.bridges = C.PIECES.bridge - usedBridges(s, i);
      pv.vpTarget = api.vpTarget(s, i);
      if (s.rivers) pv.riverVp = api.riverVp(s, i);
      if (s.harbors) pv.harborVp = s.hub.harbor.p === i ? 2 : 0;
    });
    hook(s, 'viewExtra', me, v);
    return v;
  };

  api.knightCard = (s, p) => { const m = mod(s); if (m && m.knightCard) m.knightCard(s, p); };
  api.sevenWithoutRobber = s => { const m = mod(s); if (m && m.seven) m.seven(s); };
  // a game saved before the rules were redone: bring it up to date
  api.migrate = s => {
    if (!s.hub) {
      s.hub = { mod: null, scenario: s.fishing ? 'fishermen' : s.rivers ? 'rivers' : null, harbor: { p: null } };
      s.friendly = false; s.harbors = false; s.gold = !!s.rivers;
      if (s.options.variants) s.options.variants = { fishermen: !!s.options.variants.fishermen, rivers: !!s.options.variants.rivers, caravans: false, barbarians: false, traders: false, events: !!s.options.variants.events, friendly: false, harbors: false };
      s.players.forEach(pl => { if (!pl.fishTok) { pl.fishTok = []; for (let n = pl.fish || 0; n > 0; n -= 3) pl.fishTok.push(Math.min(3, n)); } });
      if (s.fish) { s.fish.discard = s.fish.discard || []; s.fish.bootTurn = s.fish.bootTurn ?? -1; }
      const b = s.board;
      if (s.rivers && !b.bridgeSites) {
        b.riverHexes = b.hexes.filter(h => h.terrain === 'river').map(h => h.id);
        b.bridgeSites = b.edges.filter(e => e.hexes.length === 2 && e.hexes.every(i => b.hexes[i].terrain === 'river')).map(e => e.id);
      }
      if (s.fishing && !b.lakes) {
        const d = b.hexes.find(h => h.terrain === 'desert');
        if (d) { d.terrain = 'lake'; d.lake = C.LAKE_NUMBERS.slice(); b.lakes = [d.id]; if (s.robber === d.id) s.robber = null; }
        if (b.fishing) b.fishing.forEach(g => { if (g.verts.length === 2) { /* old two-corner grounds stay as they are */ } });
      }
      if (s.eventCards && s.deck && s.deck.length && Array.isArray(s.deck[0])) s.deck = newDeck(s);
    }
    return s;
  };
  api.hook = hook;
  api.mod = mod;
  api.helpers = { rowsOf, edgeBetween, coastRing, hasDamage, d6, left, others, stealOptions, numberLand, shuffle };
  api.register = (name, m) => { MODS[name] = m; };
  api.MODS = MODS;
  api.K = K;
  api.log = log;

  api.buyDev = (s, p) => { const m = mod(s); return !!(m && m.buyDev && m.buyDev(s, p)); };
  api.portUsable = (s, v) => { const m = mod(s); return !(m && m.portUsable && !m.portUsable(s, v)); };
  api.cityStart = s => !!(s.hub && (s.hub.mod === 'barbarians' || s.hub.mod === 'traders'));
  api.roadWeight = (s, e) => { const m = mod(s); return m && m.roadWeight ? m.roadWeight(s, e) : 1; };
  api.noLongest = s => { const m = mod(s); return !!(m && m.noLongest); };

  // the big scenarios register themselves
  MODS.caravans = require('./hub-caravans')(core, api);
  MODS.barbarians = require('./hub-barbarians')(core, api);
  MODS.traders = require('./hub-traders')(core, api);
  Object.values(MODS).forEach(m => { if (m.handlers) Object.assign(api.handlers, m.handlers); });
  return api;
};
