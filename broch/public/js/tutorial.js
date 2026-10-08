// How to play, shown instead of told: a small living board on which each mode plays itself out, one short caption at
// a time. It runs like a video, but at the glowing spots you can tap yourself (if you don't, the hand taps for you
// after a moment). Back and forward jump between steps; every step starts from a saved snapshot, so nothing breaks.
import { t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, GLYPH, glyph, houseIcon, dieHtml } from './core.js';
import { renderBoard } from './board.js';
import { sfx } from './fx.js';
import { fireworks } from './victory.js';
import { GAMES } from './games/registry.js';

const S = 56;
const SQ3 = Math.sqrt(3);
const CANCEL = Symbol('cancel');
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tx = (k, p) => esc(t(k, p));
const clone = o => JSON.parse(JSON.stringify(o));
const TRACK = { trade: '#E0A32E', politics: '#2C6E9B', science: '#2E6B45' };
const TOKEN_COLOR = { fish: '#1F7A99', gold: '#C58E12', spice: '#B53A2A' };
const HAND_ORDER = ['lumber', 'brick', 'wool', 'grain', 'ore', 'paper', 'cloth', 'coin', 'fish', 'gold', 'spice'];
// the standalone games register their chapters and extra hand items here (see games/*-tutorial.js)
export const addHandKeys = keys => keys.forEach(k => { if (!HAND_ORDER.includes(k)) HAND_ORDER.push(k); });
export const addChapter = ch => { CHAPTERS.push(ch); };
export { geometry, vAt, eAt, hAt, chain, baseView, sevenTiles, ico, S as TUT_S };
const ico = (k, size = 18, color = '#fff') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}">${GLYPH[k] || ''}</svg>`;

// ------------------------------------------------------------ tiny boards
// cells in axial coordinates (pointy-top hexes, radius 1), like the server builds them
function geometry(cells) {
  const hexes = [], vertices = [], edges = [];
  const vIndex = new Map(), eIndex = new Map();
  const key = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const vertexAt = (x, y) => {
    const k = key(x, y);
    if (!vIndex.has(k)) { vIndex.set(k, vertices.length); vertices.push({ id: vertices.length, x: +x.toFixed(4), y: +y.toFixed(4), hexes: [], edges: [] }); }
    return vIndex.get(k);
  };
  const edgeOf = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!eIndex.has(k)) { eIndex.set(k, edges.length); edges.push({ id: edges.length, v: [Math.min(a, b), Math.max(a, b)], hexes: [] }); vertices[a].edges.push(edges.length - 1); vertices[b].edges.push(edges.length - 1); }
    return eIndex.get(k);
  };
  cells.forEach(c => {
    const x = SQ3 * (c.q + c.r / 2), y = 1.5 * c.r;
    const h = { id: hexes.length, x: +x.toFixed(4), y: +y.toFixed(4), terrain: c.t, number: c.n || null, verts: [], edges: [], q: c.q, r: c.r };
    if (c.island != null) h.island = c.island;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 90); h.verts.push(vertexAt(x + Math.cos(a), y + Math.sin(a))); }
    for (let k = 0; k < 6; k++) { const e = edgeOf(h.verts[k], h.verts[(k + 1) % 6]); h.edges.push(e); edges[e].hexes.push(h.id); }
    h.verts.forEach(v => vertices[v].hexes.push(h.id));
    hexes.push(h);
  });
  return { hexes, vertices, edges, ports: [] };
}
const vAt = (B, x, y) => B.vertices.reduce((best, v) => (Math.hypot(v.x - x, v.y - y) < Math.hypot(B.vertices[best].x - x, B.vertices[best].y - y) ? v.id : best), 0);
const eAt = (B, a, b) => B.edges.find(e => e.v.includes(a) && e.v.includes(b)).id;
const hAt = (B, q, r) => B.hexes.find(h => h.q === q && h.r === r).id;
const chain = (B, pts) => pts.slice(1).map((p, i) => eAt(B, vAt(B, ...pts[i]), vAt(B, ...p)));
function baseView(B, extra = {}) {
  return {
    board: B, players: [{ color: 'red' }, { color: 'blue' }, { color: 'orange' }, { color: 'white' }],
    buildings: {}, roads: {}, knights: {}, ships: {}, bridges: {}, robber: null, pirate: null, merchant: null, lairs: [], islandBonus: {},
    fishing: false, fish: null, longestRoad: { p: null, len: 0 }, largestArmy: { p: null, count: 0 }, mode: 'classic', expansion: 'none', ...extra,
  };
}
// the 7-tile island used by most chapters
function sevenTiles(over = {}) {
  const cells = [
    { q: 0, r: 0, t: 'forest', n: 8 }, { q: 1, r: 0, t: 'pasture', n: 5 }, { q: 0, r: 1, t: 'mountains', n: 10 }, { q: -1, r: 1, t: 'fields', n: 4 },
    { q: -1, r: 0, t: 'desert' }, { q: 0, r: -1, t: 'hills', n: 6 }, { q: 1, r: -1, t: 'fields', n: 9 },
  ].map(c => ({ ...c, ...(over[`${c.q},${c.r}`] || {}) }));
  return geometry(cells);
}

// ------------------------------------------------------------ the chapters
const CHAPTERS = [
  { id: 'classic', name: 'Classic', color: '#C1272D', build: classic },
  { id: 'knights', name: 'Cities & Knights', color: '#2C6E9B', build: knights },
  { id: 'seafarers', name: 'Seafarers', color: '#1F7A99', build: seafarers },
  { id: 'traders', name: 'Traders & Barbarians', color: '#B9851F', build: traders },
  { id: 'big', name: '5–6 player expansion', color: '#2E6B45', build: big },
];
export const TUTORIALS = CHAPTERS.map(c => c.id);

function classic() {
  const B = sevenTiles();
  const C = hAt(B, 0, 0), SE = hAt(B, 0, 1), W = hAt(B, -1, 0), NW = hAt(B, 0, -1), NE = hAt(B, 1, -1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const trail = chain(B, [[0, -1], [0.866, -0.5], [0.866, 0.5], [1.732, 1], [2.598, 0.5], [2.598, -0.5]]);
  const v = baseView(B, { robber: W });
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Welcome to Broch!'), t('Build, trade and grow. The first to 10 points wins.'));
        T.vp(0);
        await T.wait(1800);
      },
      async T => {
        T.say(t('Every tile makes a resource.'), t('Forest, hills, pasture, fields and mountains. The desert makes nothing.'));
        await T.showResources();
        await T.wait(900);
      },
      async T => {
        T.say(t('Build settlements on corners.'), t('Tap the glowing corner.'));
        await T.tap({ vertices: [home] });
        T.build(home, 'settlement', 0);
        T.vp(1);
        T.say(t('A settlement touches up to 3 tiles.'), t('Never next to another settlement: keep one corner free.'));
        await T.wait(500);
        T.glow([C, NW, NE]);
        await T.wait(900);
        T.build(foe, 'settlement', 1);
        await T.wait(1200);
      },
      async T => {
        T.say(t('Roll the dice every turn.'), t('Tap the dice.'));
        await T.tap({ dice: true });
        await T.roll(3, 5);
        T.hit(8);
        T.say(t('Every tile with that number pays.'), t('Everyone next to it gets a card, even on other players’ turns.'));
        await Promise.all([T.gain(T.hexPt(C), 'lumber', 1, 0, home), T.gain(T.hexPt(C), 'lumber', 1, 1, foe, 260)]);
        await T.wait(1200);
      },
      async T => {
        T.say(t('More dots, more luck.'), t('Red 6 and 8 come up most often, 2 and 12 rarely.'));
        T.hot([6, 8]);
        await T.wait(3200);
        T.hot([]);
      },
      async T => {
        T.say(t('Spend cards to build.'), t('A road costs lumber and brick. Tap the glowing edge.'));
        await T.gain(T.hexPt(NW), 'brick', 1, 0, home);
        const e = trail[0];
        await T.tap({ edges: [e] });
        await T.pay({ lumber: 1, brick: 1 }, T.edgePt(e));
        T.road(e, 0);
        await T.wait(1100);
      },
      async T => {
        T.say(t('Cities pay double.'), t('Upgrade a settlement with 2 grain and 3 ore. Tap your settlement.'));
        await T.give({ grain: 2, ore: 3 });
        await T.tap({ vertices: [home] });
        await T.pay({ grain: 2, ore: 3 }, T.vertPt(home));
        T.build(home, 'city', 0);
        T.vp(2);
        await T.wait(900);
        await T.roll(4, 5);
        T.hit(9);
        await T.gain(T.hexPt(NE), 'grain', 2, 0, home);
        await T.wait(1000);
      },
      async T => {
        T.say(t('A 7 wakes the robber!'), t('First, everyone with more than 7 cards gives back half (rounded down).'));
        await T.roll(3, 4);
        await T.banner('7!', 'red');
        T.say(t('Move the robber onto a tile.'), t('It stops paying. Tap a tile next to your opponent.'));
        await T.tap({ hexes: [SE] });
        T.moveRobber(SE);
        await T.wait(700);
        T.say(t('Then steal a card from someone there.'), t('You draw a random card from their hand.'));
        await T.steal(foe, 'ore');
        await T.wait(1100);
      },
      async T => {
        T.say(t('Trade with players or the bank.'), t('Players only trade with whoever’s turn it is. The bank swaps 4 of a kind for 1, harbors make it 3:1 or 2:1.'));
        await T.give({ wool: 4 });
        await T.bankTrade({ wool: 4 }, 'brick');
        await T.wait(1200);
      },
      async T => {
        T.say(t('Development cards'), t('Knight, Road Building, Year of Plenty, Monopoly or a hidden point. One per turn, not on the turn you buy it.'));
        await T.bigCard({ title: t('Knight'), color: '#5B3A6E', icon: 'knight' });
        T.say(t('3 knights played: Largest Army, +2 points.'), t('Its holder flies war banners on the board.'));
        T.set(v2 => { v2.largestArmy = { p: 0, count: 3 }; });
        T.vp(4);
        await T.wait(1800);
      },
      async T => {
        T.say(t('5 roads in a row: Longest Road, +2 points.'), t('Branches do not count, and a foreign settlement breaks the road.'));
        for (const e of trail.slice(1)) { T.road(e, 0); await T.wait(380); }
        T.set(v2 => { v2.longestRoad = { p: 0, len: 5, edges: trail.slice() }; });
        sfx.award();
        T.vp(6);
        await T.wait(1900);
      },
      async T => {
        T.say(t('Reach 10 points to win!'), t('Settlement 1 · City 2 · Longest Road 2 · Largest Army 2 · Victory point card 1'));
        await T.countVp(10);
        await T.finale();
      },
    ],
  };
}

function knights() {
  const B = sevenTiles();
  const C = hAt(B, 0, 0), NE = hAt(B, 1, -1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const kSpot = vAt(B, 0.866, -0.5);
  const road = eAt(B, home, kSpot);
  const v = baseView(B, { robber: hAt(B, -1, 0), mode: 'knights' });
  v.buildings[home] = { p: 0, type: 'city' };
  v.buildings[foe] = { p: 1, type: 'city' };
  v.roads[road] = 0;
  return {
    view: v, vpTarget: 13,
    steps: [
      async T => {
        T.say(t('Cities & Knights'), t('Everything from Classic, plus commodities, knights and barbarians. 13 points win.'));
        T.vp(4);
        await T.wait(2800);
      },
      async T => {
        T.say(t('Cities make commodities.'), t('Forest: paper · Pasture: cloth · Mountains: coin'));
        await T.roll(5, 3, { event: 'trade' });
        T.hit(8);
        await Promise.all([T.gain(T.hexPt(C), 'lumber', 1, 0, home), T.gain(T.hexPt(C), 'paper', 1, 0, home, 240)]);
        await T.wait(1200);
      },
      async T => {
        T.say(t('Commodities buy city improvements.'), t('Trade costs cloth, politics coin, science paper: level 1 costs 1, level 2 costs 2, and so on. Tap +.'));
        T.imp({ trade: 0, politics: 0, science: 0 });
        await T.give({ paper: 3 });
        await T.tap({ el: '.tut-imp [data-tr="science"]' });
        await T.impUp('science');
        await T.impUp('science');
        T.say(t('Level 3 unlocks a special power.'), t('Science: take a resource when you get nothing. Trade: 2:1 for commodities. Politics: stronger knights.'));
        await T.give({ paper: 3 });
        await T.impUp('science');
        await T.wait(1300);
        T.say(t('First to level 4 raises a Metropolis.'), t('It is worth 2 points and sits on one of your cities. Only a player who reaches level 5 first can take it from you.'));
        await T.give({ paper: 4 });
        await T.impUp('science');
        T.set(v2 => { v2.buildings[home].metro = 'science'; }, { verts: [home] });
        sfx.award();
        T.vp(6);
        await T.wait(1600);
        T.imp(null);
      },
      async T => {
        T.say(t('Knights defend Broch.'), t('Recruit one for wool and ore. Tap the glowing corner.'));
        await T.give({ wool: 1, ore: 1 });
        await T.tap({ vertices: [kSpot] });
        await T.pay({ wool: 1, ore: 1 }, T.vertPt(kSpot));
        T.knight(kSpot, 0, 1, false);
        await T.wait(700);
        T.say(t('Activate it with grain.'), t('Only active knights fight. Promote them to make them stronger.'));
        await T.give({ grain: 1 });
        await T.pay({ grain: 1 }, T.vertPt(kSpot));
        T.knight(kSpot, 0, 1, true);
        await T.wait(800);
        await T.give({ wool: 1, ore: 1 });
        await T.pay({ wool: 1, ore: 1 }, T.vertPt(kSpot));
        T.knight(kSpot, 0, 2, true);
        await T.wait(1000);
      },
      async T => {
        T.say(t('A ship on the event die moves the barbarians.'), t('Each ship brings them one step closer to Broch. Until they have landed once, a 7 cannot move the robber.'));
        T.barb(3);
        for (const [a, b] of [[2, 5], [6, 1], [4, 4]]) { await T.roll(a, b, { event: 'ship' }); T.barb(T.s.barb + 1); await T.wait(600); }
        await T.wait(500);
      },
      async T => {
        T.say(t('The barbarians attack!'), t('Their strength: all cities on the board. Your defense: all active knights. Afterwards every knight is inactive again.'));
        await T.roll(1, 2, { event: 'ship' });
        T.barb(7);
        await T.battle(2, 2);
        T.say(t('Repelled!'), t('The strongest defender earns a point. If the barbarians win, whoever defended least loses a city (metropolises are safe).'));
        T.vp(7);
        T.barb(0);
        await T.wait(2000);
      },
      async T => {
        T.say(t('Progress cards'), t('A coloured gate on the event die gives a card to players whose red die is low enough for their improvements. You may hold 4 cards.'));
        await T.roll(2, 4, { event: 'science' });
        await T.bigCard({ title: t('Alchemist'), color: TRACK.science, icon: 'science' });
        await T.wait(600);
      },
      async T => {
        T.say(t('City walls'), t('Each wall lets you keep 2 more cards when a 7 is rolled.'));
        T.set(v2 => { v2.buildings[home].wall = true; }, { verts: [home] });
        sfx.place();
        await T.wait(2000);
      },
      async T => {
        T.say(t('Reach 13 points to win!'), t('Settlement 1 · City 2 · Metropolis 2 · Defender 1 · Longest Road 2'));
        await T.countVp(13);
        await T.finale();
      },
    ],
  };
}

function seafarers() {
  const B = geometry([
    { q: 0, r: -1, t: 'forest', n: 8, island: 0 }, { q: -1, r: 0, t: 'hills', n: 6, island: 0 }, { q: 0, r: 0, t: 'fields', n: 9, island: 0 }, { q: -1, r: 1, t: 'pasture', n: 5, island: 0 },
    { q: 1, r: -1, t: 'sea' }, { q: 1, r: 0, t: 'fog' }, { q: 0, r: 1, t: 'sea' }, { q: 1, r: 1, t: 'sea' }, { q: -1, r: -1, t: 'sea' }, { q: 2, r: -2, t: 'sea' }, { q: 2, r: 0, t: 'sea' },
    { q: 2, r: -1, t: 'gold', n: 10, island: 1 }, { q: 3, r: -1, t: 'mountains', n: 4, island: 1 },
  ]);
  B.homeIslands = [0];
  B.bonus = { vp: 2, mode: 'each' }; B.bonusIslands = [1];
  const home = vAt(B, 0, -1), mid = vAt(B, 0.866, -0.5), land = vAt(B, 1.732, -1);
  const s1 = eAt(B, home, mid), s2 = eAt(B, mid, land);
  const fog = hAt(B, 1, 0), gold = hAt(B, 2, -1), sea1 = hAt(B, 1, -1), south = hAt(B, 0, 1);
  const v = baseView(B, { expansion: 'seafarers', pirate: south });
  v.buildings[home] = { p: 0, type: 'settlement' };
  v.buildings[vAt(B, -0.866, 0.5)] = { p: 1, type: 'settlement' };
  return {
    view: v, vpTarget: 14,
    steps: [
      async T => {
        T.say(t('Seafarers'), t('The land is split into islands. Ships cross the sea.'));
        T.vp(2);
        await T.wait(2600);
      },
      async T => {
        T.say(t('Build ships on the water.'), t('A ship costs lumber and wool. Tap the glowing edge.'));
        await T.give({ lumber: 1, wool: 1 });
        await T.tap({ edges: [s1] });
        await T.pay({ lumber: 1, wool: 1 }, T.edgePt(s1));
        T.ship(s1, 0);
        await T.wait(900);
        T.say(t('Ships form a chain, like roads.'), t('The last ship of an open chain may sail to a new spot once per turn. A chain that joins two of your settlements is closed.'));
        await T.give({ lumber: 1, wool: 1 });
        await T.pay({ lumber: 1, wool: 1 }, T.edgePt(s2));
        T.ship(s2, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('Sail next to the fog to reveal it.'), t('Discovering land pays you a resource.'));
        T.reveal(fog, 'pasture', 3);
        sfx.reveal();
        await T.wait(800);
        await T.gain(T.hexPt(fog), 'wool', 1, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('Settle a new island: +2 points!'), t('Tap the glowing corner. Your first settlement on each foreign island earns the bonus.'));
        await T.tap({ vertices: [land] });
        T.build(land, 'settlement', 0);
        T.set(v2 => { v2.islandBonus = { 1: [0] }; });
        T.float(T.vertPt(land), '+2', '#F6CF57');
        T.vp(5);
        await T.wait(1500);
      },
      async T => {
        T.say(t('Gold fields pay any resource you like.'));
        await T.roll(4, 6);
        T.hit(10);
        const k = await T.choose(['lumber', 'brick', 'wool', 'grain', 'ore'], 'ore');
        await T.gain(T.hexPt(gold), k, 1, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('The pirate'), t('Ships next to his tile are blocked, and he steals. On a 7 or with a knight you move either the robber or the pirate.'));
        T.movePirate(sea1);
        sfx.pirate();
        await T.wait(2400);
      },
      async T => {
        T.say(t('Win with 10 to 14 points.'), t('Pick one of the scenarios from the rulebook, or the free game, when you create the game.'));
        await T.countVp(14);
        await T.finale();
      },
    ],
  };
}

function traders() {
  const B = sevenTiles({ '0,1': { t: 'river', n: null }, '-1,1': { t: 'river', n: null } });
  const NE = hAt(B, 1, -1), W = hAt(B, -1, 0), SE = hAt(B, 0, 1), SW = hAt(B, -1, 1);
  const top = vAt(B, 0.866, -2.5), right = vAt(B, 1.732, -2);
  const g1 = { id: 0, number: 5, verts: [top, right] };
  const [a, b] = [B.vertices[top], B.vertices[right]];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = B.hexes[NE];
  const d = Math.hypot(mx - h.x, my - h.y);
  g1.x = +(mx + (mx - h.x) / d * 0.62).toFixed(3); g1.y = +(my + (my - h.y) / d * 0.62).toFixed(3);
  B.fishing = [];
  const riverHome = vAt(B, 0.866, 0.5), riverRoad = eAt(B, riverHome, vAt(B, 0, 1)), bridge = eAt(B, vAt(B, 0, 1), vAt(B, 0, 2));
  const v = baseView(B, { expansion: 'traders' });
  v.buildings[top] = { p: 0, type: 'settlement' };
  v.buildings[vAt(B, -1.732, -1)] = { p: 1, type: 'settlement' };
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Traders & Barbarians'), t('Pick one scenario: Fishermen, Rivers, Caravans, Barbarian Attack or Traders & Barbarians. Variants mix in.'));
        T.vp(1);
        await T.wait(2600);
      },
      async T => {
        T.say(t('Fishermen'), t('The desert becomes a lake and the coast gets fishing grounds.'));
        T.set(v2 => { v2.fishing = true; v2.board.fishing = [g1]; });
        T.glow([W]);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Roll a fishing ground’s number to catch fish.'), t('A settlement gets 1 token, a city 2. The lake pays on 2, 3, 11 and 12.'));
        await T.roll(1, 4);
        T.hit(5);
        await T.gain(T.pt(g1.x, g1.y), 'fish', 2, 0, top);
        await T.wait(1100);
      },
      async T => {
        T.say(t('Pay with fish'), t('2 take the robber off the board · 3 steal · 4 take a resource · 5 a road · 7 a development card. At most 7 tokens.'));
        await T.fishMenu();
        await T.wait(1200);
      },
      async T => {
        T.say(t('The old boot'), t('Whoever fishes it up needs one more point to win, and may hand it on to a player with as many points or more.'));
        T.set(v2 => { v2.fish = { boot: 0 }; });
        await T.wait(1600);
        T.set(v2 => { v2.fish = { boot: 1 }; });
        sfx.steal();
        await T.wait(1400);
      },
      async T => {
        T.say(t('Rivers'), t('Every road or settlement next to a river earns 1 gold.'));
        T.set(v2 => { v2.fishing = false; v2.fish = null; v2.board.fishing = []; });
        T.glow([SE, SW]);
        await T.tap({ vertices: [riverHome] });
        T.build(riverHome, 'settlement', 0);
        await T.gain(T.vertPt(riverHome), 'gold', 1, 0);
        T.road(riverRoad, 0);
        await T.gain(T.edgePt(riverRoad), 'gold', 1, 0);
        await T.wait(700);
      },
      async T => {
        T.say(t('Bridges cross the river.'), t('A bridge costs 2 brick and 1 lumber and pays 3 gold.'));
        await T.give({ brick: 2, lumber: 1 });
        await T.pay({ brick: 2, lumber: 1 }, T.edgePt(bridge));
        T.set(v2 => { v2.roads[bridge] = 0; v2.bridges[bridge] = true; }, { edges: [bridge] });
        if (!T.fast) sfx.road();
        await T.gain(T.edgePt(bridge), 'gold', 3, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('Gold'), t('Swap 2 gold for any resource, twice per turn. The richest player gets +1 point, the poorest −2.'));
        await T.bankTrade({ gold: 2 }, 'ore');
        T.float(T.vertPt(riverHome), '+1', '#F6CF57');
        await T.wait(1500);
      },
      async T => {
        T.say(t('Event cards'), t('A deck of 37 cards replaces the dice. Every number comes up as often as it should, and some cards bring an event.'));
        await T.eventCard(8, t('Plague'));
        T.hit(8);
        await T.wait(1400);
      },
      async T => {
        T.say(t('The Caravans'), t('Nomads send wagons out from the waterhole. After you build, vote with wool and grain where the next wagon goes. 12 points.'));
        await T.banner(t('Caravans'));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Barbarian Attack'), t('Barbarians land on the coast after every settlement or city. Knights from the castle drive them off, and 2 prisoners are worth 1 point. 12 points.'));
        await T.banner(t('Barbarians'));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Traders & Barbarians'), t('Haul glass, marble, sand and tools with your wagon for points and gold. 13 points.'));
        await T.banner(t('Wagons'));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Move your wagon'), t('At the end of your turn: 4 movement points. A path costs 2, your own road 1, another player’s road 1 and 1 gold for its owner, a barbarian on the way 2 more. 1 grain gives 2 more points, once per turn.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Pick up and deliver'), t('In the middle of a commodity hex you pick up a token or deliver yours: 1 point and 1 to 5 gold, by wagon level. The quarry needs tools, the glassworks sand, the castle marble and glass.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Barbarians'), t('From the second wagon level on, roll a die in front of a barbarian: 6 at level 2, 5–6 at level 3, 4–6 at level 4, 3–6 at level 5. A 7 or a knight card moves a barbarian; on a road you draw a card from its owner.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Five or six players'), t('The wagon island has 37 tiles and 7 commodity hexes; five of them have six paths. The 2 and the 12 are on the board again.'));
        await T.wait(2800);
      },
      async T => {
        T.say(t('Variants'), t('The friendly robber spares players with 2 points or fewer. Harbors of Catan reward settlements at harbors with a plaque worth 2 points.'));
        await T.wait(2400);
        await T.finale();
      },
    ],
  };
}

function big() {
  const B = sevenTiles();
  const v = baseView(B, { robber: hAt(B, -1, 0) });
  const spots = [[0, -1, 0], [0, 1, 1], [1.732, -1, 2], [-2.598, -0.5, 3]];
  spots.forEach(([x, y, p]) => { v.buildings[vAt(B, x, y)] = { p, type: 'settlement' }; });
  v.players = [{ color: 'red' }, { color: 'blue' }, { color: 'orange' }, { color: 'white' }, { color: 'teal' }, { color: 'purple' }];
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('5–6 player expansion'), t('A bigger board with more tiles, harbors and cards for up to 6 players.'));
        await T.wait(2600);
      },
      async T => {
        T.say(t('Two players share every turn'), t('Stone 1 rolls the dice, trades with everybody and builds.'));
        T.turnChip(0);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Then stone 2 plays, three seats to the left'), t('No dice, no trades with players: only the bank, building and 1 development card.'));
        T.turnChip(3);
        await T.wait(500);
        T.road(eAt(B, vAt(B, -2.598, -0.5), vAt(B, -2.598, 0.5)), 3);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Then both stones move one seat to the left.'), t('The next turn belongs to the next pair.'));
        T.turnChip(1);
        await T.wait(1100);
        T.turnChip(4);
        await T.wait(1100);
        T.turnChip(null);
        await T.wait(600);
      },
      async T => {
        T.say(t('So nobody waits long.'), t('Turns stay short, even at a full table.'));
        await T.wait(1800);
        await T.finale();
      },
    ],
  };
}

// ------------------------------------------------------------ the player
let current = null;

export function openTutorial(id = 'classic') {
  closeTutorial();
  const el = document.createElement('div');
  el.className = 'tut';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('How to play'));
  el.innerHTML = `<div class="tut-box">
    <div class="tut-top"><div class="tut-tabs">${CHAPTERS.map(c => `<button class="tut-tab" data-ch="${c.id}" style="--cc:${c.color}">${tx(c.name)}${seen().includes(c.id) ? ' <i>✓</i>' : ''}</button>`).join('')}</div>
      <button class="tut-x" data-tut-close aria-label="${tx('Close')}">✕</button></div>
    <div class="tut-stage">
      <div class="tut-board"></div>
      <canvas class="tut-canvas" aria-hidden="true"></canvas>
      <div class="tut-hud"><div class="tut-vp" hidden></div><div class="tut-dicebox"></div><div class="tut-barb" hidden></div><div class="tut-imp" hidden></div><div class="tut-turns" hidden></div><div class="tut-extra" hidden></div><div class="tut-hand"></div></div>
      <div class="tut-layer"></div>
    </div>
    <div class="tut-cap"><b class="tut-say"></b><span class="tut-small"></span></div>
    <div class="tut-ctl"><button class="tut-btn" data-tut-prev aria-label="${tx('Back')}">◀</button><button class="tut-btn play" data-tut-play aria-label="${tx('Pause')}">❚❚</button><button class="tut-btn" data-tut-next aria-label="${tx('Next')}">▶</button><div class="tut-steps"></div></div>
  </div>`;
  document.body.appendChild(el);
  const P = new Player(el);
  current = P;
  P.load(id);
  return P;
}
export function closeTutorial() {
  if (!current) return;
  const P = current; current = null;
  P.destroy();
}
const seen = () => { try { return JSON.parse(localStorage.getItem('broch_tut_seen') || '[]'); } catch { return []; } };
const markSeen = id => { try { const s = seen(); if (!s.includes(id)) { s.push(id); localStorage.setItem('broch_tut_seen', JSON.stringify(s)); } } catch { /* storage blocked */ } };
export const tutorialSeen = id => seen().includes(id);

class Player {
  constructor(el) {
    this.el = el;
    this.stage = el.querySelector('.tut-stage');
    this.boardEl = el.querySelector('.tut-board');
    this.layer = el.querySelector('.tut-layer');
    this.hud = el.querySelector('.tut-hud');
    this.playing = !reduced();
    this.run = null;
    this.stopFx = null;
    this.onKey = e => {
      if (e.key === 'Escape') closeTutorial();
      else if (e.key === 'ArrowRight') this.next();
      else if (e.key === 'ArrowLeft') this.prev();
      else if (e.key === ' ') { e.preventDefault(); this.toggle(); }
    };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => { if (this.v) this.draw(); };
    window.addEventListener('resize', this.onResize);
    el.addEventListener('click', e => this.click(e));
    this.updatePlay();
  }
  destroy() {
    this.cancel();
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 260);
  }
  load(id) {
    const ch = CHAPTERS.find(c => c.id === id) || CHAPTERS[0];
    this.cancel();
    this.ch = ch;
    const spec = ch.build();
    this.spec = spec;
    this.snaps = [{ v: clone(spec.view), s: this.freshState(spec) }];
    this.el.querySelectorAll('.tut-tab').forEach(b => b.classList.toggle('on', b.dataset.ch === ch.id));
    this.el.querySelector(`.tut-tab[data-ch="${ch.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    this.el.style.setProperty('--cc', ch.color);
    this.el.querySelector('.tut-steps').innerHTML = spec.steps.map((_, i) => `<i data-step="${i}"></i>`).join('') + '<i class="end"></i>';
    this.goto(0);
  }
  freshState(spec) { return { hand: {}, vp: null, vpTarget: spec.vpTarget, barb: null, imp: null, dice: null, turn: null, extra: null }; }
  // ---- navigation
  cancel() {
    const r = this.run;
    this.run = null;
    if (r) { r.dead = true; r.timers.forEach(clearTimeout); r.rejects.forEach(f => f(CANCEL)); if (r.onTap) r.onTap = null; }
    this.layer.innerHTML = '';
    this.el.querySelector('.tut-end')?.remove();
    if (this.stopFx) { this.stopFx(); this.stopFx = null; }
    const cv = this.el.querySelector('.tut-canvas'); const c2 = cv.getContext && cv.getContext('2d'); if (c2) c2.clearRect(0, 0, cv.width, cv.height);
  }
  async goto(i) {
    this.cancel();
    const steps = this.spec.steps;
    if (i >= steps.length) return this.end();
    // fast-forward from the last snapshot we have up to step i (no animations), then play step i
    let k = Math.min(i, this.snaps.length - 1);
    while (k < i) {
      this.restore(k);
      const r = this.newRun(true);
      try { await steps[k](this.api(r)); } catch (e) { if (e !== CANCEL) console.error(e); }
      this.snaps[k + 1] = { v: clone(this.v), s: clone(this.s) };
      k++;
    }
    this.restore(i);
    this.i = i;
    this.markSteps();
    const r = this.newRun(false);
    try {
      await steps[i](this.api(r));
      if (r.dead) return;
      this.snaps[i + 1] = { v: clone(this.v), s: clone(this.s) };
      if (i === steps.length - 1) return this.end();
      await this.hold(r);
      if (!r.dead) this.goto(i + 1);
    } catch (e) { if (e !== CANCEL) console.error(e); }
  }
  // after a step: wait while paused, or long enough to read the caption
  hold(r) {
    const len = (this.el.querySelector('.tut-say').textContent + this.el.querySelector('.tut-small').textContent).length;
    const ms = Math.min(4200, 900 + len * 26);
    return new Promise((res, rej) => {
      r.rejects.push(rej);
      const tick = () => {
        if (r.dead) return;
        if (this.playing) r.timers.push(setTimeout(() => (r.dead ? null : res()), ms));
        else r.waitPlay = () => tick();
      };
      tick();
    });
  }
  next() { if (this.i == null) return; if (this.ended) { this.loadNextChapter(); return; } this.goto(this.i + 1); }
  prev() { if (this.i == null) return; this.goto(this.ended ? this.spec.steps.length - 1 : Math.max(0, this.i - 1)); }
  toggle() {
    this.playing = !this.playing;
    this.updatePlay();
    const r = this.run;
    if (this.playing && r && r.waitPlay) { const f = r.waitPlay; r.waitPlay = null; f(); }
    if (this.playing && r && r.autoTap) r.autoTap();
  }
  updatePlay() {
    const b = this.el.querySelector('[data-tut-play]');
    b.textContent = this.playing ? '❚❚' : '▶';
    b.setAttribute('aria-label', this.playing ? t('Pause') : t('Play'));
    this.el.classList.toggle('paused', !this.playing);
  }
  loadNextChapter() {
    const idx = CHAPTERS.findIndex(c => c.id === this.ch.id);
    this.load(CHAPTERS[(idx + 1) % CHAPTERS.length].id);
  }
  markSteps() {
    this.ended = false;
    this.el.querySelectorAll('.tut-steps i').forEach((d, k) => { d.classList.toggle('done', k < this.i); d.classList.toggle('on', k === this.i); });
  }
  end() {
    this.ended = true;
    markSeen(this.ch.id);
    const tab = this.el.querySelector(`.tut-tab[data-ch="${this.ch.id}"]`);
    if (tab && !tab.querySelector('i')) tab.insertAdjacentHTML('beforeend', ' <i>✓</i>');
    this.el.querySelectorAll('.tut-steps i').forEach(d => { d.classList.add('done'); d.classList.remove('on'); });
    const idx = CHAPTERS.findIndex(c => c.id === this.ch.id);
    const nx = CHAPTERS[(idx + 1) % CHAPTERS.length];
    const box = document.createElement('div');
    box.className = 'tut-end';
    box.innerHTML = `<div class="tut-endcard"><div class="tut-check">✓</div><b>${tx('You know {mode}!', { mode: t(this.ch.name) })}</b>
      <div class="tut-endbtns"><button class="btn small" data-tut-replay>↺ ${tx('Watch again')}</button><button class="btn small gold" data-tut-ch="${nx.id}">${tx('Next: {mode}', { mode: t(nx.name) })} ▶</button><button class="btn small primary" data-tut-close>${tx('Let’s play!')}</button></div></div>`;
    this.stage.appendChild(box);
  }
  restore(k) {
    this.v = clone(this.snaps[k].v);
    this.s = clone(this.snaps[k].s);
    this.fresh = null;
    this.draw();
    this.renderHud();
  }
  newRun(fast) {
    const r = { fast, timers: [], rejects: [], dead: false };
    if (!fast) this.run = r;
    return r;
  }
  // ---- input
  click(e) {
    const el = e.target;
    if (el === this.el || el.closest('[data-tut-close]')) { closeTutorial(); return; }
    const ch = el.closest('[data-ch]') || el.closest('[data-tut-ch]');
    if (ch) { sfx.click(); this.load(ch.dataset.ch || ch.dataset.tutCh); return; }
    if (el.closest('[data-tut-replay]')) { this.goto(0); return; }
    if (el.closest('[data-tut-next]')) { sfx.click(); this.next(); return; }
    if (el.closest('[data-tut-prev]')) { sfx.click(); this.prev(); return; }
    if (el.closest('[data-tut-play]')) { sfx.click(); this.toggle(); return; }
    const dot = el.closest('.tut-steps [data-step]');
    if (dot) { this.goto(+dot.dataset.step); return; }
    const r = this.run;
    if (!r || !r.onTap) return;
    const hit = el.closest('[data-v],[data-e],[data-h],[data-roll],[data-pick]') || (r.tapEl && el.closest(r.tapEl));
    if (hit) r.onTap(hit);
  }
  // ---- drawing
  draw(targets = {}) {
    const pg = GAMES[this.v.mode];
    this.boardEl.innerHTML = pg && pg.board ? pg.board(this.v, targets, this.freshSets(), null, !reduced(), null) : renderBoard(this.v, targets, this.freshSets(), null, !reduced(), false, pg && pg.ext ? pg.ext(this.v) : null);
    const svg = this.boardEl.querySelector('svg');
    if (svg) { svg.removeAttribute('style'); syncLoops(this.boardEl); }
    this.fresh = null;
  }
  freshSets() {
    const f = this.fresh || {};
    return { verts: new Set(f.verts || []), edges: new Set(f.edges || []), knights: new Set(f.knights || []), ships: new Set(f.ships || []), hexes: new Set(f.hexes || []), plants: new Set(f.plants || []), robber: !!f.robber, merchant: false, pirate: !!f.pirate, beast: !!f.beast, thickets: new Set(f.thickets || []), explorers: new Set(f.explorers || []), damage: new Set(f.damage || []), inspector: !!f.inspector, threats: new Set(f.threats || []), any: !!f.beast || !!(f.explorers && f.explorers.length) || !!(f.threats && f.threats.length) };
  }
  pt(x, y) {
    const svg = this.boardEl.querySelector('svg');
    const sr = this.stage.getBoundingClientRect();
    if (!svg) return { x: sr.width / 2, y: sr.height / 2 };
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const s = Math.min(r.width / vb.width, r.height / vb.height);
    const ox = r.left + (r.width - vb.width * s) / 2, oy = r.top + (r.height - vb.height * s) / 2;
    return { x: ox + (x * S - vb.x) * s - sr.left, y: oy + (y * S - vb.y) * s - sr.top };
  }
  elPt(el) {
    const sr = this.stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
  }
  renderVp() {
    const s = this.s;
    const vp = this.hud.querySelector('.tut-vp');
    vp.hidden = s.vp == null;
    if (s.vp != null) vp.innerHTML = `${houseIcon('red', 18)}<b>${s.vp}</b><small>/${s.vpTarget}</small>`;
  }
  renderTurns() {
    const s = this.s;
    const tc = this.hud.querySelector('.tut-turns');
    tc.hidden = s.turn == null;
    if (s.turn != null) tc.innerHTML = this.v.players.slice(0, 6).map((p, i) => `<span class="${i === s.turn ? 'on' : ''}">${houseIcon(p.color, 18)}</span>`).join('');
  }
  renderHud() {
    this.renderVp();
    this.renderTurns();
    this.renderHand();
    this.renderDice();
    this.renderBarb();
    this.renderImp();
    this.renderExtra();
  }
  renderExtra() {
    const el = this.hud.querySelector('.tut-extra');
    el.hidden = !this.s.extra;
    el.innerHTML = this.s.extra || '';
  }
  renderHand() {
    const h = this.s.hand;
    const keys = HAND_ORDER.filter(k => h[k] > 0 || (this.pinned && this.pinned.has(k)));
    this.hud.querySelector('.tut-hand').innerHTML = keys.map(k => slotHtml(k, h[k] || 0)).join('');
  }
  renderDice() {
    const d = this.s.dice;
    const box = this.hud.querySelector('.tut-dicebox');
    if (!d) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="tut-dice">${dieHtml(d.a, 'red')}${dieHtml(d.b, 'yellow')}${d.event ? eventDie(d.event) : ''}<b class="tut-sum">${d.a + d.b}</b></div>`;
  }
  renderBarb() {
    const el = this.hud.querySelector('.tut-barb');
    const b = this.s.barb;
    el.hidden = b == null;
    if (b == null) return;
    let cells = '';
    for (let i = 0; i < 7; i++) cells += `<i class="${i < b ? 'on' : ''}"></i>`;
    el.innerHTML = `<span class="bt-ico">${ico('barbarian', 16, '#F4EFE2')}</span><span class="bt-track">${cells}<em style="--p:${Math.min(b, 7) / 7}">⛵</em></span><span class="bt-goal">${houseIcon('red', 14)}</span>`;
  }
  renderImp() {
    const el = this.hud.querySelector('.tut-imp');
    const m = this.s.imp;
    el.hidden = !m;
    if (!m) return;
    const rows = [['trade', 'cloth', t('Trade')], ['politics', 'coin', t('Politics')], ['science', 'paper', t('Science')]];
    el.innerHTML = rows.map(([k, c, name]) => {
      let pips = '';
      for (let i = 1; i <= 5; i++) pips += `<i class="${i <= m[k] ? 'on' : ''}" style="--tc:${TRACK[k]}"></i>`;
      return `<div class="ti-row"><span class="ti-ico" style="background:${TRACK[k]}">${ico(k, 14)}</span><span class="ti-name">${esc(name)}</span><span class="ti-pips">${pips}</span><button class="ti-up" data-tr="${k}" style="--tc:${TRACK[k]}" aria-label="${esc(name)} +">+</button></div>`;
    }).join('');
  }
  // ---- the toolbox the chapters use
  api(r) {
    const P = this;
    const fast = r.fast;
    const alive = () => { if (r.dead) throw CANCEL; };
    const wait = ms => {
      alive();
      if (fast || ms <= 0) return Promise.resolve();
      return new Promise((res, rej) => { r.rejects.push(rej); r.timers.push(setTimeout(() => (r.dead ? rej(CANCEL) : res()), reduced() ? Math.min(ms, 400) : ms)); });
    };
    const anim = (el, frames, opts) => {
      if (fast || reduced() || !el.animate) { el.remove(); return Promise.resolve(); }
      const a = el.animate(frames, { fill: 'both', ...opts });
      return a.finished.then(() => el.remove(), () => el.remove());
    };
    const spawn = (html, at, cls = '') => {
      const el = document.createElement('div');
      el.className = 'tut-fly ' + cls;
      el.innerHTML = html;
      el.style.left = at.x + 'px'; el.style.top = at.y + 'px';
      P.layer.appendChild(el);
      return el;
    };
    const fly = (html, from, to, { dur = 720, delay = 0, arc = 50, cls = '', end = 0.7 } = {}) => {
      if (fast) return Promise.resolve();
      const el = spawn(html, from, cls);
      const dx = to.x - from.x, dy = to.y - from.y;
      return anim(el, [
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
        { transform: 'translate(-50%,calc(-50% - 22px)) scale(1.15)', opacity: 1, offset: 0.28 },
        { transform: `translate(calc(-50% + ${(dx * 0.5).toFixed(1)}px), calc(-50% + ${(dy * 0.5 - arc).toFixed(1)}px)) scale(1)`, opacity: 1, offset: 0.66 },
        { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(${end})`, opacity: 0.9 },
      ], { duration: dur, delay, easing: 'cubic-bezier(.4,.1,.3,1)' });
    };
    const slotPt = k => {
      if (!P.pinned) P.pinned = new Set();
      P.pinned.add(k);
      let el = P.hud.querySelector(`.tut-rc[data-k="${k}"]`);
      if (!el) { P.renderHand(); el = P.hud.querySelector(`.tut-rc[data-k="${k}"]`); }
      return el ? P.elPt(el) : { x: P.stage.clientWidth / 2, y: P.stage.clientHeight - 30 };
    };
    const bump = k => {
      const el = P.hud.querySelector(`.tut-rc[data-k="${k}"]`);
      if (el && !fast) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    };
    const T = {
      get fast() { return fast; },
      get s() { return P.s; },
      get v() { return P.v; },
      wait,
      pt: (x, y) => P.pt(x, y),
      hexPt: id => { const h = P.v.board.hexes[id]; return P.pt(h.x, h.y); },
      vertPt: id => { const v = P.v.board.vertices[id]; return P.pt(v.x, v.y); },
      edgePt: id => { const [a, b] = P.v.board.edges[id].v.map(i => P.v.board.vertices[i]); return P.pt((a.x + b.x) / 2, (a.y + b.y) / 2); },
      say(big, small = '') {
        alive();
        const cap = P.el.querySelector('.tut-cap');
        P.el.querySelector('.tut-say').textContent = big;
        P.el.querySelector('.tut-small').textContent = small;
        if (!fast) { cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); }
      },
      // change the board; `fresh` makes new pieces drop in with their light
      set(fn, fresh = null) { alive(); fn(P.v); P.fresh = fast ? null : fresh; P.draw(); },
      build(vid, type = 'settlement', p = 0) { T.set(v => { v.buildings[vid] = { ...(v.buildings[vid] || {}), p, type }; }, { verts: [vid] }); if (!fast) (type === 'city' ? sfx.city : sfx.place)(); },
      road(e, p = 0) { T.set(v => { v.roads[e] = p; }, { edges: [e] }); if (!fast) sfx.road(); },
      ship(e, p = 0) { T.set(v => { v.ships[e] = { p }; }, { ships: [e] }); if (!fast) sfx.sail(); },
      knight(vid, p, level, active) { T.set(v => { v.knights[vid] = { p, level, active }; }, { knights: [vid] }); if (!fast) sfx.place(); },
      moveRobber(h) { T.set(v => { v.robber = h; }, { robber: true }); if (!fast) sfx.robber(); },
      movePirate(h) { T.set(v => { v.pirate = h; }, { pirate: true }); },
      reveal(h, terrain, number) { T.set(v => { const x = v.board.hexes[h]; x.terrain = terrain; x.number = number; }, { hexes: [h] }); },
      glow(ids) {
        if (fast) return;
        ids.forEach(id => { const el = P.boardEl.querySelector(`.tile[data-hex="${id}"]`); if (el) { el.classList.remove('fx-glow'); void el.getBBox?.(); el.classList.add('fx-glow'); } });
      },
      hit(n) {
        if (fast) return;
        P.boardEl.querySelectorAll(`.tile[data-num="${n}"]`).forEach(el => { el.classList.remove('fx-glow'); void el.getBBox?.(); el.classList.add('fx-glow'); });
        P.boardEl.querySelectorAll(`.ntok[data-n="${n}"]`).forEach(el => { el.classList.remove('fx-hit'); void el.getBBox?.(); el.classList.add('fx-hit'); });
      },
      hot(ns) {
        P.boardEl.querySelectorAll('.ntok').forEach(el => el.classList.toggle('tut-hot', ns.includes(+el.dataset.n)));
      },
      vp(n) { P.s.vp = n; P.renderVp(); const el = P.hud.querySelector('.tut-vp'); if (!fast && el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } },
      async countVp(to) {
        const from = P.s.vp || 0;
        for (let n = from + 1; n <= to; n++) { T.vp(n); if (!fast) sfx.tick ? sfx.tick(n) : sfx.click(); await wait(130); }
      },
      // cards flying from the board to the hand (player 0) or to someone's house
      async gain(from, k, n = 1, p = 0, vid = null, delay = 0) {
        alive();
        if (p !== 0) {
          if (vid != null && !fast) { await wait(delay); await fly(cardHtml(k, n), from, T.vertPt(vid), { dur: 820, end: 0.4 }); }
          return;
        }
        const to = slotPt(k);
        if (!fast) {
          await wait(delay);
          if (vid != null) await fly(cardHtml(k, n), from, T.vertPt(vid), { dur: 560, end: 0.9, arc: 30 });
          await fly(cardHtml(k, n), vid != null ? T.vertPt(vid) : from, to, { dur: 640, end: 0.8 });
          sfx.gain();
        }
        P.s.hand[k] = (P.s.hand[k] || 0) + n;
        P.renderHand(); bump(k);
      },
      // cards appear in the hand (we skip the dull part where you collect them)
      async give(cards) {
        alive();
        for (const [k, n] of Object.entries(cards)) { P.s.hand[k] = (P.s.hand[k] || 0) + n; }
        P.renderHand();
        if (!fast) { Object.keys(cards).forEach(bump); sfx.gain(); await wait(450); }
      },
      // cards leave the hand towards a spot on the board
      async pay(cards, to) {
        alive();
        const jobs = [];
        let d = 0;
        for (const [k, n] of Object.entries(cards)) {
          const from = slotPt(k);
          for (let i = 0; i < n; i++) { if (!fast) jobs.push(fly(cardHtml(k, 1), from, to, { dur: 560, delay: d, end: 0.35, arc: 40 })); d += 90; }
        }
        for (const [k, n] of Object.entries(cards)) P.s.hand[k] = Math.max(0, (P.s.hand[k] || 0) - n);
        if (!fast) { sfx.card(); await Promise.all(jobs); }
        Object.keys(cards).forEach(k => { if (!P.s.hand[k] && P.pinned) P.pinned.delete(k); });
        P.renderHand();
      },
      async steal(fromVert, k) {
        alive();
        const to = slotPt(k);
        if (!fast) { sfx.steal(); await fly('<div class="fx-card back">?</div>', T.vertPt(fromVert), to, { dur: 760 }); }
        P.s.hand[k] = (P.s.hand[k] || 0) + 1;
        P.renderHand(); bump(k);
      },
      async bankTrade(give, get) {
        alive();
        const c = { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.42 };
        let bank = null;
        if (!fast) { bank = spawn(`<div class="tut-bank">${ico('bank', 30, '#FFF3DC')}</div>`, c, 'still'); }
        await T.pay(give, c);
        if (!fast) { sfx.trade(); await wait(250); }
        const to = slotPt(get);
        if (!fast) await fly(cardHtml(get, 1), c, to, { dur: 640 });
        P.s.hand[get] = (P.s.hand[get] || 0) + 1;
        P.renderHand(); bump(get);
        if (bank) { await anim(bank, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }], { duration: 300 }); }
      },
      // the dice: they tumble and land; with { event } the third (event) die of Cities & Knights joins in
      async roll(a, b, { event } = {}) {
        alive();
        if (!fast) {
          sfx.dice();
          const box = P.hud.querySelector('.tut-dicebox');
          const faces = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];
          for (let i = 0; i < 8; i++) {
            const ra = 1 + Math.floor(Math.random() * 6), rb = 1 + Math.floor(Math.random() * 6);
            box.innerHTML = `<div class="tut-dice rolling">${dieHtml(ra, 'red')}${dieHtml(rb, 'yellow')}${event ? eventDie(faces[i % 6]) : ''}</div>`;
            await wait(70);
          }
        }
        P.s.dice = { a, b, event: event || null };
        P.renderDice();
        if (!fast) { P.hud.querySelector('.tut-dice')?.classList.add('land'); sfx.thud(); await wait(420); }
      },
      async eventCard(n, title) {
        const a = Math.ceil(n / 2), b = Math.floor(n / 2);
        alive();
        if (!fast) {
          sfx.card();
          const el = spawn(`<div class="tut-evcard"><small>${tx('Event card')}</small><div>${esc(title || '')}</div><b>${n}</b></div>`, { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.45 }, 'still');
          await anim(el, [{ transform: 'translate(-50%,-50%) rotateY(90deg) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotateY(0) scale(1.08)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) scale(.9)', opacity: 0 }], { duration: 2000 });
        }
        P.s.dice = { a, b, event: null };
        P.renderDice();
      },
      async banner(text, cls = '') {
        alive();
        if (fast) return;
        const el = spawn(`<div class="tut-banner ${cls}">${esc(text)}</div>`, { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.42 }, 'still');
        await anim(el, [{ transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) scale(.8)', opacity: 0 }], { duration: 1100, easing: 'ease-out' });
      },
      float(at, text, color = '#FFF3DC') {
        if (fast) return;
        const el = spawn(`<div class="tut-float" style="color:${color}">${esc(text)}</div>`, at, 'still');
        anim(el, [{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.3)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 1300, easing: 'ease-out' });
      },
      async bigCard({ title, color, icon }) {
        alive();
        if (fast) return;
        sfx.card();
        const el = spawn(`<div class="tut-bigcard" style="--c:${color}"><span class="bc-ico">${ico(icon, 34)}</span><b>${esc(title)}</b></div>`, { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.44 }, 'still');
        await anim(el, [{ transform: 'translate(-50%,-50%) rotateY(180deg) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotateY(0) scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.82 }, { transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 }], { duration: 2200, easing: 'ease-out' });
      },
      // the tiles introduce their resources one by one
      async showResources() {
        alive();
        const RES = { forest: 'lumber', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'ore' };
        if (fast) return;
        const jobs = [];
        P.v.board.hexes.forEach((h, i) => {
          const k = RES[h.terrain];
          const at = P.pt(h.x, h.y - 0.15);
          jobs.push(wait(i * 260).then(() => {
            T.glow([h.id]);
            const el = spawn(k ? cardHtml(k, 1) : `<div class="tut-none">∅</div>`, at, 'still');
            if (k) sfx.gain();
            return anim(el, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-90%) scale(1)', opacity: 1, offset: 0.85 }, { transform: 'translate(-50%,-110%) scale(.8)', opacity: 0 }], { duration: 2000, easing: 'ease-out' });
          }));
        });
        await Promise.all(jobs);
      },
      async choose(keys, auto) {
        alive();
        const row = spawn(`<div class="tut-choice">${keys.map(k => `<button data-pick="${k}" class="tut-pick">${cardHtml(k, 1)}</button>`).join('')}</div>`, { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.44 }, 'still');
        const picked = await T.tap({ el: `.tut-pick[data-pick="${auto}"]`, any: '[data-pick]' });
        const k = (picked && picked.dataset && picked.dataset.pick) || auto;
        row.remove();
        return k;
      },
      async fishMenu() {
        alive();
        if (fast) return;
        const items = [[2, 'robber'], [3, 'swap'], [4, 'card'], [5, 'road'], [7, 'knight']];
        const el = spawn(`<div class="tut-fishmenu">${items.map(([n, k], i) => `<span style="animation-delay:${i * 0.14}s"><b>${n}${ico('fish', 14, '#BFE6F5')}</b>${ico(k, 22, '#FFF3DC')}</span>`).join('')}</div>`, { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.4 }, 'still');
        await wait(2600);
        await anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      },
      async deliver(kinds, vid) {
        alive();
        const to = T.vertPt(vid);
        for (const k of kinds) {
          const from = slotPt(k);
          if (!fast) await fly(cardHtml(k, 1), from, to, { dur: 620, end: 0.5 });
          P.s.hand[k] = Math.max(0, (P.s.hand[k] || 0) - 1);
          if (P.pinned) P.pinned.delete(k);
          P.renderHand();
        }
        T.float(to, '+1', '#F6CF57');
        if (!fast) sfx.award();
      },
      // free-form hud pills for the standalone games (footprint, bag, ...)
      extra(html) { P.s.extra = html; P.renderExtra(); },
      imp(levels) { P.s.imp = levels ? { ...levels } : null; P.renderImp(); },
      async impUp(track) {
        alive();
        const comm = { trade: 'cloth', politics: 'coin', science: 'paper' }[track];
        const lvl = P.s.imp[track] + 1;
        const btn = P.hud.querySelector(`.tut-imp [data-tr="${track}"]`);
        if (btn) await T.pay({ [comm]: lvl }, P.elPt(btn));
        P.s.imp[track] = lvl;
        P.renderImp();
        if (!fast) {
          const pip = P.hud.querySelectorAll(`.tut-imp .ti-row`)[['trade', 'politics', 'science'].indexOf(track)]?.querySelectorAll('.ti-pips i')[lvl - 1];
          if (pip) { pip.classList.add('pop'); }
          sfx.award();
          await wait(380);
        }
      },
      barb(n) { P.s.barb = n; P.renderBarb(); },
      async battle(a, d) {
        alive();
        if (fast) return;
        sfx.drums();
        const el = spawn(`<div class="tut-battle"><div><b>${a}</b><small>${tx('Barbarians (cities)')}</small></div><span>⚔</span><div><b>${d}</b><small>${tx('Active knights')}</small></div></div>`, { x: P.stage.clientWidth / 2, y: P.stage.clientHeight * 0.42 }, 'still');
        await wait(1500);
        el.querySelector('.tut-battle').classList.add('won');
        sfx.victory();
        await wait(900);
        await anim(el, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' }], { duration: 300 });
      },
      turnChip(p) { P.s.turn = p; P.renderTurns(); },
      // wait for a tap on a target. While playing, the hand taps for you after a few seconds.
      tap({ vertices, edges, hexes, dice, el, any } = {}) {
        alive();
        if (fast) return Promise.resolve(null);
        const targets = {};
        if (vertices) targets.vertices = vertices;
        if (edges) targets.edges = edges;
        if (hexes) targets.hexes = hexes;
        if (vertices || edges || hexes) P.draw(targets);
        let target = null, tapSel = null;
        if (dice) {
          const box = P.hud.querySelector('.tut-dicebox');
          box.innerHTML = `<button class="tut-roll" data-roll>${dieHtml(5, 'red')}${dieHtml(2, 'yellow')}<span>${tx('Roll')}</span></button>`;
          target = box.querySelector('[data-roll]');
        } else if (el) { target = P.el.querySelector(el); tapSel = any || el; if (target) target.classList.add('tut-target'); }
        const at = target ? P.elPt(target) : vertices ? T.vertPt(vertices[0]) : edges ? T.edgePt(edges[0]) : hexes ? T.hexPt(hexes[0]) : null;
        const ptr = at ? spawn(POINTER, at, 'ptr') : null;
        return new Promise((res, rej) => {
          r.rejects.push(rej);
          r.tapEl = tapSel;
          let done = false;
          const finish = hit => {
            if (done || r.dead) return;
            done = true;
            r.onTap = null; r.autoTap = null; r.tapEl = null;
            if (ptr) { ptr.classList.add('press'); setTimeout(() => ptr.remove(), 380); }
            if (target) target.classList.remove('tut-target');
            if (dice) P.hud.querySelector('.tut-dicebox').innerHTML = '';
            if (vertices || edges || hexes) P.draw();
            res(hit);
          };
          r.onTap = hit => {
            if (dice) return hit.dataset && hit.dataset.roll != null ? finish(hit) : undefined;
            if (el) return hit.closest && hit.closest(tapSel) ? finish(hit) : undefined;
            if (hit.dataset.v != null && vertices && vertices.includes(+hit.dataset.v)) return finish(hit);
            if (hit.dataset.e != null && edges && edges.includes(+hit.dataset.e)) return finish(hit);
            if (hit.dataset.h != null && hexes && hexes.includes(+hit.dataset.h)) return finish(hit);
          };
          const auto = () => {
            r.timers.push(setTimeout(() => {
              if (done || r.dead || !P.playing) return;
              if (ptr) ptr.classList.add('press');
              r.timers.push(setTimeout(() => finish(target || null), 300));
            }, 3400));
          };
          r.autoTap = auto;
          if (P.playing) auto();
        });
      },
      async finale() {
        alive();
        if (fast) return;
        sfx.fanfare ? sfx.fanfare() : sfx.victory();
        const cv = P.el.querySelector('.tut-canvas');
        if (!reduced()) P.stopFx = fireworks(cv, [P.ch.color, '#F6CF57', '#FFF3DC', '#7FD3FF', '#B6F07A'], 1800);
        await wait(900);
      },
    };
    return T;
  }
}

// ------------------------------------------------------------ little pieces of html
function cardHtml(k, n) {
  if (TOKEN_COLOR[k]) return `<div class="tut-coin" style="--c:${TOKEN_COLOR[k]}">${glyph(k, 18)}${n > 1 ? `<i class="cnt">×${n}</i>` : ''}</div>`;
  return `<div class="fx-card big ${['paper', 'cloth', 'coin'].includes(k) ? 'comm' : ''}" style="--c:${CARD_COLOR[k] || '#777'}">${glyph(k, 24)}${n > 1 ? `<i class="cnt">×${n}</i>` : ''}</div>`;
}
function slotHtml(k, n) {
  const coin = !!TOKEN_COLOR[k];
  return `<div class="tut-rc ${coin ? 'coin' : ''} ${['paper', 'cloth', 'coin'].includes(k) ? 'comm' : ''}" data-k="${k}" style="--c:${coin ? TOKEN_COLOR[k] : CARD_COLOR[k]}">${glyph(k, coin ? 16 : 18)}<b>${n}</b></div>`;
}
function eventDie(face) {
  if (face === 'ship') return `<span class="tut-edie ship">${ico('ship', 18, '#F4EFE2')}</span>`;
  return `<span class="tut-edie" style="background:${TRACK[face]}">${ico(face, 16)}</span>`;
}
const POINTER = `<div class="tut-ptr-in"><i class="ring"></i><svg viewBox="0 0 40 48" width="40" height="48"><path d="M15.5 3.5a3.6 3.6 0 0 1 7.2 0v15.2l1.6-.7a3.6 3.6 0 0 1 4.3 1.3l.6 1a3.6 3.6 0 0 1 4.5 1.9l.4.9a3.6 3.6 0 0 1 4.3 3.3v8.2c0 7.2-5 12.4-12.2 12.4h-3.6c-4.5 0-7.6-1.9-10.3-5.5L4.2 31.6a3.6 3.6 0 0 1 5.5-4.6l5.8 5.2z" fill="#FFFDF7" stroke="#2B1E12" stroke-width="2.4" stroke-linejoin="round"/></svg></div>`;

// endless animations on the tutorial board follow one clock, so redrawing never restarts them
function syncLoops(root) {
  if (!root.getAnimations) return;
  let list;
  try { list = root.getAnimations({ subtree: true }); } catch { return; }
  for (const a of list) {
    const tm = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming();
    if (tm && tm.iterations === Infinity && a.startTime !== 0) { try { a.startTime = 0; } catch { /* ignore */ } }
  }
}
