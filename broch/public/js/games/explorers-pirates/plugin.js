// Explorers & Pirates (Entdecker & Piraten): the plugin for the game screen (games/sgame.js). The board is the book's: a start
// island, a sea with the council's base, and two undiscovered regions (parrots in the north, geese in the south). Ships carry
// explorers, units, fish swarms and spice bags; harbor settlements hold a basin; three missions with their tracks.
import { register } from '../registry.js';
import { extendCore, glyph, GLYPH, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, houseIcon, modal } from '../../core/core.js';
import { LOOT_BY_MODE, SEVEN_BY_MODE } from '../../core/fx.js';
import { isPhone } from '../../core/phone.js';

const tx = (k, p) => esc(t(k, p));
const S = 56;
const f = n => n.toFixed(1);
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const COSTS = {
  road: { lumber: 1, brick: 1 }, settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 }, harbor: { grain: 2, ore: 2 },
  ship: { lumber: 1, wool: 1 }, explorer: { lumber: 1, brick: 1, wool: 1, grain: 1 }, unit: { wool: 1, ore: 1 },
};
const MISSIONS = {
  lairs: { name: 'The Pirate Lairs', icon: 'skull', color: '#6B3A1E', tile: 'Strongest Pirate Defense' },
  fish: { name: 'Fish for Broch', icon: 'fish', color: '#1F7A99', tile: 'Richest Catch' },
  spice: { name: 'Spices for Broch', icon: 'spice', color: '#2E7D3E', tile: 'Best Spice Trade' },
};
const ITEM = { E: 'Explorer', U: 'Unit', S: 'Spice', F: 'Fish swarm' };
const VILLAGE = { fast: ['Quick sailing', 'Every ship of yours gets 1 more move.'], gold: ['Good gold', 'Once per turn, swap 1 resource for 1 gold.'], pirate: ['Pirate fighters', 'You chase the pirates away with this die face as well.'] };

extendCore({
  names: { gold: 'Gold' },
  colors: { gold: '#C58E12' },
});
LOOT_BY_MODE.explorers = { lumber: 'forest', brick: 'hills', wool: 'pasture', grain: 'fields', ore: 'mountains' };
SEVEN_BY_MODE.explorers = { title: 'The pirates are coming!', text: v => (v.options.units ? 'The roller sets the pirate ship and takes a card from a ship next to it.' : 'No pirates sail in this scenario.') };

// ------------------------------------------------------------ small pieces
const g24 = (name, x, y, size, color) => `<g transform="translate(${f(x - size / 2)},${f(y - size / 2)}) scale(${f(size / 24)})" style="color:${color}">${GLYPH[name] || ''}</g>`;
const shade = (d, extra = '') => `<path d="${d}" transform="translate(1.8,2.8)" fill="rgba(0,0,0,.34)" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linejoin="round" ${extra}/>`;
const NEUTRAL = '#9A9AA0', NEUTRAL_D = '#4B4B52';
const col = (view, p) => (p == null || p < 0 || !view.players[p] ? NEUTRAL : PCOLOR[view.players[p].color]);
const colD = (view, p) => (p == null || p < 0 || !view.players[p] ? NEUTRAL_D : PCOLOR_DARK[view.players[p].color]);
const SETTLE_D = 'M-10 11 V-3 L0 -13 L10 -3 V11 Z';
const HARBOR_D = 'M-15 12 V-3 L-6 -13 L3 -3 V0 H15 V12 Z';

function hull(c, d, { big = false, dark = false, sail = null } = {}) {
  const hl = dark ? '#16110C' : c, ln = dark ? '#000' : d;
  const k = big ? 1.5 : 1;
  return `<g transform="scale(${k})"><path d="M-15 0 H15 L10 8 H-10 Z" fill="${hl}" stroke="${ln}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M0 0 V-17" stroke="${ln}" stroke-width="2"/>
    <path d="M1.5 -16 L11 -3 H1.5 Z" fill="${sail || (dark ? '#2B2420' : '#FFF6E2')}" stroke="${ln}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-1.5 -13 L-8 -3 H-1.5 Z" fill="${sail || (dark ? '#2B2420' : '#FFF6E2')}" stroke="${ln}" stroke-width="1.4" stroke-linejoin="round" opacity=".9"/></g>`;
}
// what a ship or a basin holds: E explorer, U unit, S spice, F fish swarm
function pawn(c, d, size = 1) {
  return `<g transform="scale(${size})"><circle cy="-5" r="3.2" fill="${c}" stroke="${d}" stroke-width="1.2"/><path d="M-4.6 6 L0 -1.4 L4.6 6 Z" fill="${c}" stroke="${d}" stroke-width="1.2" stroke-linejoin="round"/></g>`;
}
function cargoGlyph(item, c, d) {
  if (item.t === 'U') return pawn(c, d, 1);
  if (item.t === 'E') return `<g>${pawn(c, d, 1.45)}<circle cx="6.5" cy="-8" r="3.6" fill="#F0C24A" stroke="#7A520C" stroke-width="1"/><path d="M6.5 -10.2 V-5.8 M4.3 -8 H8.7" stroke="#7A520C" stroke-width="1"/></g>`;
  if (item.t === 'S') return `<g><path d="M-4 5 Q-6.5 -1 -2.2 -4 L-3 -7 H3 L2.2 -4 Q6.5 -1 4 5 Z" fill="#B53A2A" stroke="#5E160D" stroke-width="1.2" stroke-linejoin="round"/><path d="M-2 -3.5 H2" stroke="#F4D9A0" stroke-width="1.1"/></g>`;
  return `<g><circle r="7" fill="#1F7A99" stroke="#fff" stroke-width="1.6"/>${g24('fish', 0, 0, 10, '#fff')}</g>`;
}
const cargoRow = (items, c, d, y = 0) => {
  const w = items.reduce((a, it) => a + (it.t === 'E' || it.t === 'F' ? 18 : 12), 0);
  let x = -w / 2;
  return items.map(it => { const step = it.t === 'E' || it.t === 'F' ? 18 : 12; const out = `<g transform="translate(${f(x + step / 2)},${y})">${cargoGlyph(it, c, d)}</g>`; x += step; return out; }).join('');
};

// ------------------------------------------------------------ geometry helpers (per board)
const cache = new WeakMap();
function geo(board) {
  let g = cache.get(board);
  if (g) return g;
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const byPair = new Map();
  board.edges.forEach(e => byPair.set(key(e.v[0], e.v[1]), e.id));
  const adj = board.edges.map(() => []);
  board.hexes.forEach(h => { for (let i = 0; i < 6; i++) { const id = byPair.get(key(h.verts[i], h.verts[(i + 1) % 6])); if (id != null) adj[id].push(h.id); } });
  g = { adj };
  cache.set(board, g);
  return g;
}
const edgePts = (board, e) => board.edges[e].v.map(i => board.vertices[i]);
const hexCenter = h => [h.x * S, h.y * S];

// ------------------------------------------------------------ the board's own art
function frame(board) {
  const { adj } = geo(board);
  let d = '';
  board.edges.forEach(e => {
    if (adj[e.id].length !== 1) return;
    const [a, b] = edgePts(board, e.id);
    d += `M${f(a.x * S)} ${f(a.y * S)}L${f(b.x * S)} ${f(b.y * S)}`;
  });
  return `<g pointer-events="none"><path d="${d}" fill="none" stroke="rgba(18,52,74,.55)" stroke-width="13" stroke-linecap="round"/><path d="${d}" fill="none" stroke="rgba(231,214,170,.55)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="1 8"/></g>`;
}
function birdBadge(h) {
  const north = h.region === 'N';
  const c = north ? '#2E8B3E' : '#8A5A2A';
  const [cx, cy] = hexCenter(h);
  return `<g transform="translate(${f(cx)},${f(cy + 24)})" pointer-events="none" opacity=".9"><title>${esc(north ? t('Undiscovered: parrot region') : t('Undiscovered: goose region'))}</title>
    <path d="M-12 -1 Q-6 -9 0 -1 Q6 -9 12 -1 Q6 -4 0 4 Q-6 -4 -12 -1Z" fill="${c}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></g>`;
}
function dieFace(n, x, y, size = 17) {
  const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n] || [];
  const u = size / 4;
  return `<g transform="translate(${f(x)},${f(y)})"><rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${size / 5}" fill="#D2352A" stroke="#7E1214" stroke-width="1.4"/>${pips.map(([a, b]) => `<circle cx="${f(a * u)}" cy="${f(b * u)}" r="${f(size / 10)}" fill="#FFF3DC"/>`).join('')}</g>`;
}
function councilArt(board, h) {
  const [cx, cy] = hexCenter(h);
  const anchor = id => { const v = board.vertices[id]; return `<g transform="translate(${f(v.x * S)},${f(v.y * S)})"><title>${esc(t('Harbor of the council: deliver fish and spice here'))}</title><circle r="11" fill="#FFF3DC" stroke="#3A200C" stroke-width="2"/>
      <path d="M0 -6 V6 M-4.500 -1 H4.500 M-5.500 2 Q0 9 5.500 2 M0 -6 m-1.800 0 a1.800 1.800 0 1 0 3.600 0 a1.800 1.800 0 1 0 -3.600 0" fill="none" stroke="#1B4F6E" stroke-width="1.800" stroke-linecap="round"/></g>`; };
  return `<g pointer-events="none"><title>${esc(t('The base of the council'))}</title>
    <path d="M${f(cx - 26)} ${f(cy + 12)} Q${f(cx - 22)} ${f(cy - 16)} ${f(cx + 4)} ${f(cy - 18)} Q${f(cx + 28)} ${f(cy - 14)} ${f(cx + 26)} ${f(cy + 10)} Q${f(cx)} ${f(cy + 22)} ${f(cx - 26)} ${f(cy + 12)}Z" fill="#6AAA4A" stroke="#E2CC96" stroke-width="5" stroke-linejoin="round"/>
    <path d="M${f(cx - 10)} ${f(cy + 4)} V${f(cy - 8)} L${f(cx)} ${f(cy - 16)} L${f(cx + 10)} ${f(cy - 8)} V${f(cy + 4)}Z" fill="#B0482C" stroke="#4E1E12" stroke-width="1.800" stroke-linejoin="round"/>
    <path d="M${f(cx - 3)} ${f(cy + 4)} V${f(cy - 3)} H${f(cx + 3)} V${f(cy + 4)}" fill="#3A200C"/></g>${board.harbors.map(anchor).join('')}`;
}
function lairToken(view, h) {
  const [cx, cy] = hexCenter(h);
  const l = h.lair;
  const total = Object.values(l.units || {}).reduce((a, b) => a + b, 0);
  const pawns = [];
  Object.entries(l.units || {}).forEach(([p, n]) => { for (let i = 0; i < n; i++) pawns.push(+p); });
  let out = `<g transform="translate(${f(cx)},${f(cy - 2)})"><title>${esc(t('Pirate lair: {n} of 3 units landed', { n: total }))}</title><circle r="21" cy="2.6" cx="1" fill="rgba(0,0,0,.3)"/><circle r="20" fill="#1B1511" stroke="#C9AE7C" stroke-width="2.4"/>${g24('skull', 0, -3, 22, '#F4EFE2')}`;
  for (let i = 0; i < 3; i++) {
    const p = pawns[i];
    out += `<g transform="translate(${(i - 1) * 13},15)">${p != null ? pawn(col(view, p), colD(view, p), 0.95) : '<circle r="3.6" fill="rgba(255,255,255,.2)" stroke="#000" stroke-width=".8"/>'}</g>`;
  }
  return `${out}</g>`;
}
function villageArt(view, h) {
  const [cx, cy] = hexCenter(h);
  const v = h.village;
  const kind = v.kind;
  const color = { fast: '#2C6E9B', gold: '#C58E12', pirate: '#8E1B16' }[kind];
  const icon = kind === 'fast' ? g24('ship', 0, 0, 13, '#fff') : kind === 'gold' ? g24('gold', 0, 0, 13, '#fff') : g24('skull', 0, 0, 13, '#fff');
  const label = VILLAGE[kind];
  const bags = Array.from({ length: Math.min(6, v.bags || 0) }, (_, i) => `<g transform="translate(${(i - (Math.min(6, v.bags) - 1) / 2) * 9},0) scale(.62)">${cargoGlyph({ t: 'S' })}</g>`).join('');
  const friends = (v.friends || []).map((p, i) => `<g transform="translate(${(i - ((v.friends || []).length - 1) / 2) * 11},0)">${pawn(col(view, p), colD(view, p), 0.8)}</g>`).join('');
  return `<g pointer-events="none"><title>${esc(t(label[0]))}: ${esc(t(label[1]))}</title>
    <g transform="translate(${f(cx - 4)},${f(cy - 8)})"><path d="M-13 8 L0 -9 L13 8 Z" fill="#C9A15C" stroke="#5A3A1C" stroke-width="1.6" stroke-linejoin="round"/><path d="M-6 8 V1 H-1 V8" fill="#5A3A1C"/><path d="M5 8 L9 -1 L15 8Z" fill="#B58A4A" stroke="#5A3A1C" stroke-width="1.2" stroke-linejoin="round"/></g>
    <g transform="translate(${f(cx + 28)},${f(cy - 24)})"><circle r="12" fill="${color}" stroke="#fff" stroke-width="2"/>${icon}${kind === 'pirate' ? dieFace(v.die, 9, 11, 12) : ''}</g>
    <g transform="translate(${f(cx)},${f(cy + 21)})">${bags}</g><g transform="translate(${f(cx)},${f(cy + 33)})">${friends}</g></g>`;
}
function fishArt(view, h) {
  const [cx, cy] = hexCenter(h);
  const swarm = h.swarm ? `<g transform="translate(${f(cx + 12)},${f(cy + 12)})"><title>${esc(t('Fish swarm'))}</title><circle r="12" cy="2" fill="rgba(0,0,0,.25)"/><circle r="12" fill="#1F7A99" stroke="#fff" stroke-width="2.2"/>${g24('fish', 0, 0, 16, '#fff')}</g>` : '';
  return `<g pointer-events="none"><title>${esc(t('Fishing ground: a swarm appears when you roll {n}', { n: h.die }))}</title>${dieFace(h.die, cx - 10, cy - 10, 20)}${swarm}</g>`;
}
function unitsOnHex(view, h) {
  const arr = [];
  Object.entries(h.units || {}).forEach(([p, n]) => { for (let i = 0; i < n; i++) arr.push(+p); });
  if (!arr.length) return '';
  const [cx, cy] = hexCenter(h);
  return `<g pointer-events="none" transform="translate(${f(cx)},${f(cy + 30)})">${arr.map((p, i) => `<g transform="translate(${(i - (arr.length - 1) / 2) * 12},0)">${pawn(col(view, p), colD(view, p), 0.95)}</g>`).join('')}</g>`;
}

// ------------------------------------------------------------ ships, basins, pirates and neutral pieces (drawn above the buildings)
function top({ view, board, targets }) {
  const x = view.exp;
  if (!x) return '';
  const { adj } = geo(board);
  let out = '';
  // neutral pieces (two players: the colours nobody plays)
  (x.neutral.roads || []).forEach(e => {
    const [a, b] = edgePts(board, e);
    out += `<line x1="${f((a.x * 0.84 + b.x * 0.16) * S)}" y1="${f((a.y * 0.84 + b.y * 0.16) * S)}" x2="${f((b.x * 0.84 + a.x * 0.16) * S)}" y2="${f((b.y * 0.84 + a.y * 0.16) * S)}" stroke="${NEUTRAL_D}" stroke-width="11" stroke-linecap="round"/><line x1="${f((a.x * 0.84 + b.x * 0.16) * S)}" y1="${f((a.y * 0.84 + b.y * 0.16) * S)}" x2="${f((b.x * 0.84 + a.x * 0.16) * S)}" y2="${f((b.y * 0.84 + a.y * 0.16) * S)}" stroke="${NEUTRAL}" stroke-width="6.5" stroke-linecap="round"/>`;
  });
  (x.neutral.verts || []).forEach(v => {
    const p = board.vertices[v];
    const harbor = board.circles.includes(v);
    out += `<g transform="translate(${f(p.x * S)},${f(p.y * S)})">${shade(harbor ? HARBOR_D : SETTLE_D)}<path d="${harbor ? HARBOR_D : SETTLE_D}" fill="${NEUTRAL}" stroke="${NEUTRAL_D}" stroke-width="2.2" stroke-linejoin="round"/></g>`;
  });
  // basins of the harbor settlements
  for (const [vid, b] of Object.entries(view.buildings)) {
    if (b.type !== 'harbor' || !b.cargo || !b.cargo.length) continue;
    const p = board.vertices[vid];
    out += `<g transform="translate(${f(p.x * S + 21)},${f(p.y * S + 16)})"><rect x="-17" y="-10" width="34" height="19" rx="9" fill="rgba(31,95,120,.85)" stroke="#fff" stroke-width="1.6"/>${cargoRow(b.cargo, col(view, b.p), colD(view, b.p), 1)}</g>`;
  }
  // ships: up to two on an edge
  const byEdge = new Map();
  Object.values(x.ships || {}).forEach(sh => { if (!byEdge.has(sh.e)) byEdge.set(sh.e, []); byEdge.get(sh.e).push(sh); });
  const mineNow = view.me >= 0 && view.phase === 'play' && view.current === view.me && !view.pending.length && view.step === 'move';
  byEdge.forEach((list, e) => {
    const [a, b] = edgePts(board, e);
    let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    // lean towards the sea side of a coast edge so the ship does not sit on the road
    const seaHex = adj[e].map(i => board.hexes[i]).find(h => h.terrain === 'sea');
    const land = adj[e].map(i => board.hexes[i]).find(h => h !== seaHex);
    let ox = 0, oy = 0;
    if (seaHex && land) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const dx = seaHex.x - mx, dy = seaHex.y - my, dl = Math.hypot(dx, dy) || 1; ox = dx / dl * 6; oy = dy / dl * 6; }
    list.forEach((sh, k) => {
      const tpos = list.length === 1 ? 0.5 : k === 0 ? 0.3 : 0.7;
      const px = (a.x + (b.x - a.x) * tpos) * S + ox, py = (a.y + (b.y - a.y) * tpos) * S + oy;
      const c = col(view, sh.p), d = colD(view, sh.p);
      const own = mineNow && sh.p === view.me;
      out += `<g transform="translate(${f(px)},${f(py)})" ${own ? `class="ship-hit" data-e="${e}" data-ship="${sh.id}"` : ''}><title>${esc(view.players[sh.p].name)}</title>
        <g transform="rotate(${f(ang)})"><g transform="translate(1.6,2.6)" opacity=".28">${hull('#000', '#000', { dark: true })}</g>${hull(c, d)}</g>
        ${sh.cargo.length ? `<g transform="translate(0,-21)"><rect x="-${sh.cargo.length > 1 ? 15 : 11}" y="-11" width="${sh.cargo.length > 1 ? 30 : 22}" height="20" rx="9" fill="rgba(20,8,4,.62)"/>${cargoRow(sh.cargo, c, d, 0)}</g>` : ''}
        ${own ? `<circle class="knight-ring" r="22" fill="none" stroke="#F0C24A" stroke-width="2.5" stroke-dasharray="4 3"/><circle r="24" fill="transparent" style="cursor:pointer"/>${sh.mp > 0 ? `<g transform="translate(15,13)"><circle r="8" fill="#F0C24A" stroke="#7A520C" stroke-width="1.4"/><text y="3.6" text-anchor="middle" font-size="10.5" font-weight="800" fill="#3A200C" font-family="Inter">${sh.mp}</text></g>` : ''}` : ''}</g>`;
    });
  });
  // the pirate ship
  if (x.pirate && x.pirate.hex != null && board.hexes[x.pirate.hex]) {
    const h = board.hexes[x.pirate.hex];
    const c = col(view, x.pirate.owner);
    out += `<g transform="translate(${f(h.x * S)},${f(h.y * S + 6)})" pointer-events="none"><ellipse cy="14" rx="22" ry="4.4" fill="rgba(0,0,0,.3)"/><title>${esc(t('Pirate ship of {name}', { name: view.players[x.pirate.owner].name }))}</title><g class="pirate-bob">${hull(c, '#000', { big: true, dark: true, sail: c })}<path d="M0 -26 L9 -23.500 L0 -21 Z" fill="#fff"/></g></g>`;
  }
  return out;
}

function tiles({ view, board }) {
  const x = view.exp;
  let out = frame(board);
  board.hexes.forEach(h => {
    if (h.terrain === 'fog') out += birdBadge(h);
    else if (h.council) out += councilArt(board, h);
    else if (h.fish) out += fishArt(view, h);
    else if (h.terrain === 'spice' && h.village) out += villageArt(view, h);
    else if (h.terrain === 'goldriver' && h.lair && !h.lair.conquered) out += lairToken(view, h);
    if (h.units) out += unitsOnHex(view, h);
  });
  return x ? out : out;
}

const TERRAIN = { goldriver: '#B9962E', spice: '#3F8F4A' };
function building(b, c) {
  const ink = PCOLOR_DARK[c] || '#2B1E12';
  if (b.type === 'harbor') {
    return `<path d="${HARBOR_D}" fill="${PCOLOR[c]}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/><rect x="6" y="3" width="4" height="4" fill="${ink}" opacity=".35"/><rect x="-9" y="1" width="4" height="4" fill="${ink}" opacity=".35"/>
      <g transform="translate(0,16)"><path d="M-17 0 Q0 7 17 0" fill="none" stroke="#A9D6E8" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  return `<path d="${SETTLE_D}" fill="${PCOLOR[c]}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/><path d="M-3 11 V4 H3 V11" fill="${ink}" opacity=".35"/>`;
}
function ext() {
  return {
    color: h => TERRAIN[h.terrain],
    glyph: h => (h.terrain === 'goldriver' ? 'gold' : h.terrain === 'spice' ? 'spice' : undefined),
    building: (b, c) => building(b, c),
    shape: type => (type === 'harbor' ? HARBOR_D : SETTLE_D),
    tiles, top,
  };
}

// ------------------------------------------------------------ panels
function missionPanel(v, A) {
  const x = v.exp, tracks = x.tracks || {};
  const openLane = A && A.G.eupOpen || {};
  const keys = Object.keys(tracks);
  const lanes = keys.map(k => {
    const tr = tracks[k], M = MISSIONS[k], max = tr.values.length - 1;
    const lead = Math.max(...tr.pos);
    const cells = tr.values.map((val, i) => {
      const here = v.players.map((p, pi) => pi).filter(pi => tr.pos[pi] === i).sort((a, b) => tr.at[a] - tr.at[b]);
      const toks = here.map(pi => `<span class="tok ${pi === v.me ? 'me' : ''}" title="${esc(v.players[pi].name)} · ${esc(t(M.name))} ${i}/${max}">${houseIcon(v.players[pi].color, 15)}</span>`).join('');
      return `<div class="eup-cell ${i > 0 && i <= lead ? 'lit' : ''} ${i === 0 ? 'start' : ''}">${i === 0 ? '<small>▶</small>' : `<b title="${esc(t('{n} points', { n: val }))}">${val}</b>`}<div class="eup-toks">${toks}</div></div>`;
    }).join('');
    const holder = tr.holder != null ? `<span class="eup-tile" style="--pc:${PCOLOR[v.players[tr.holder].color]}" title="${esc(t(M.tile))}: ${esc(v.players[tr.holder].name)} (+1)">${glyph('star', 14)}</span>` : `<span class="eup-tile none" title="${esc(t(M.tile))} (+1)">${glyph('star', 14)}</span>`;
    // phone: one line per mission (my marker against the leaders'); a tap folds the track out
    const leaders = v.players.map((p, pi) => pi).filter(pi => tr.pos[pi] === lead && lead > 0);
    const sum = `<span class="eup-sum m-only">${v.me >= 0 ? `<span class="eup-sm" title="${esc(v.players[v.me].name)}">${houseIcon(v.players[v.me].color, 16)}<b>${tr.pos[v.me]}</b></span>` : ''}${leaders.length ? `<span class="eup-sm lead" title="${esc(leaders.map(pi => v.players[pi].name).join(', '))}">${leaders.slice(0, 3).map(pi => houseIcon(v.players[pi].color, 16)).join('')}<b>${lead}</b></span>` : ''}</span>`;
    return `<div class="eup-lane ${openLane[k] ? 'open' : ''}" style="--c:${M.color}"><div class="eup-lh" data-eup-lane="${k}" role="button" tabindex="0" aria-expanded="${!!openLane[k]}"><span class="lane-ic" style="background:${M.color}">${glyph(M.icon, 15)}</span><b title="${esc(t(M.name))}">${esc(t(M.name))}</b>${sum}${holder}</div><div class="eup-cells" style="grid-template-columns:repeat(${max + 1},1fr)">${cells}</div></div>`;
  }).join('');
  const pairs = x.ship1 != null ? `<div class="eup-pairs">${houseIcon(v.players[x.ship1].color, 16)} <b>${tx('Ship 1')}</b> ${esc(v.players[x.ship1].name)} · ${houseIcon(v.players[x.ship2].color, 16)} <b>${tx('Ship 2')}</b> ${esc(v.players[x.ship2].name)}</div>` : '';
  if (!keys.length) return `<div class="panel imp eup-panel"><div class="panel-h">${tx('Missions')}</div><div class="muted imp-foot">${tx('Land in Sight: no missions yet. Discover land, found settlements and upgrade them to harbor settlements. The first to 8 points wins.')}</div>${pairs}</div>`;
  return `<div class="panel imp eup-panel"><div class="panel-h">${tx('Missions')}<span class="spacer"></span><span style="font-weight:500">${tx('The furthest marker earns a point')}</span></div><div class="eup-lanes">${lanes}</div>${pairs}
    <div class="muted imp-foot">${tx('The track shows the points you hold in each mission. The player furthest ahead (who got there first) also gets the special point tile.')}</div></div>`;
}
function fleetHtml(v, A) {
  const x = v.exp, m = A.me();
  const mine = Object.values(x.ships || {}).filter(s => s.p === v.me);
  const L = v.legal || {};
  const rows = mine.map(sh => {
    const o = (L.ship || {})[sh.id];
    return `<button class="eup-ship" data-xship="${sh.id}" ${o ? '' : 'disabled'} title="${esc(t('Tap to act with this ship'))}"><span class="ico">${glyph('ship', 15)}</span><b>${sh.mp > 0 ? t('{n} moves', { n: sh.mp }) : o ? t('no moves left') : t('ship')}</b>
      <span class="cg">${sh.cargo.map(c => `<i title="${esc(t(ITEM[c.t]))}">${c.t === 'E' ? '🧭' : c.t === 'U' ? '⚔' : c.t === 'S' ? glyph('spice', 13) : glyph('fish', 13)}</i>`).join('') || `<small class="muted">${tx('empty')}</small>`}</span></button>`;
  }).join('');
  const fr = m.friends || { fast: 0, gold: 0, pirate: [] };
  const friends = [fr.fast ? `${glyph('ship', 13)} +${fr.fast}` : '', fr.gold ? `${glyph('gold', 13)} ×${fr.gold}` : '', fr.pirate.length ? `${glyph('skull', 13)} 6${fr.pirate.map(n => `, ${n}`).join('')}` : ''].filter(Boolean);
  return `<div class="eup-fleet ${v.step === 'move' ? 'move' : ''}"><div class="lbl"><b>${tx('Your fleet')}</b></div>${rows || `<small class="muted">${tx('No ships on the board.')}</small>`}${friends.length ? `<div class="eup-friends" title="${esc(t('Friendly spice villages'))}">${friends.map(x => `<span class="stat-chip">${x}</span>`).join('')}</div>` : ''}</div>`;
}

// ------------------------------------------------------------ dialogs and picking
const itemLabel = c => t(ITEM[c.t]);
function chooseTarget(A, kind) {
  const L = A.view.legal || {};
  const list = (kind === 'explorer' ? L.explorer : L.unit) || [];
  const harbors = list.filter(o => o.kind === 'harbor'), ships = list.filter(o => o.kind === 'ship');
  const type = kind === 'explorer' ? 'buildExplorer' : 'buildUnit';
  const label = kind === 'explorer' ? t('Where should the explorer go?') : t('Where should the unit go?');
  const pickShip = () => {
    const edges = [...new Set(ships.map(o => A.view.exp.ships[o.id].e))];
    A.pick('edges', edges, t('Tap the ship to load.'), e => {
      const here = ships.filter(o => A.view.exp.ships[o.id].e === e);
      if (here.length === 1) return A.send({ type, target: { kind: 'ship', id: here[0].id } });
      A.choiceDialog(tx('Which ship?'), '', here.map(o => ({ value: o.id, html: `${glyph('ship', 16)} ${esc(t('Ship'))} ${o.id}` })), id => A.send({ type, target: { kind: 'ship', id } }));
      return true;
    }, { key: kind });
  };
  if (!harbors.length && !ships.length) return A.toast(t('There is nowhere to do that right now.'), 'warn');
  if (!ships.length) return pickHarbor();
  if (!harbors.length) return pickShip();
  A.choiceDialog(esc(label), '', [{ value: 'h', html: `${glyph('settlement', 16)} ${esc(t('Into the basin of a harbor settlement'))}` }, { value: 's', html: `${glyph('ship', 16)} ${esc(t('Into a ship next to a harbor settlement'))}` }], w => { if (w === 'h') pickHarbor(); else pickShip(); });
  function pickHarbor() {
    A.pick('vertices', harbors.map(o => o.v), label, v => A.send({ type, target: { kind: 'harbor', v } }), { key: kind });
  }
}
function buildShip(A) {
  const L = A.view.legal || {};
  if (!L.ships) return A.toast(t('There is nowhere to do that right now.'), 'warn');
  const go = remove => A.pick('edges', L.ships.edges, t('Tap the sea path for your ship.'), e => A.send({ type: 'buildShip', e, remove }), { key: 'ship' });
  if (L.ships.replace) {
    return A.choiceDialog(tx('All your ships are on the board'), tx('Take one back and build it anew at a harbor settlement. Its cargo is lost.'),
      L.ships.replace.map(id => ({ value: id, html: `${glyph('ship', 16)} ${esc(t('Ship'))} ${id} · ${A.view.exp.ships[id].cargo.length ? A.view.exp.ships[id].cargo.map(itemLabel).join(', ') : esc(t('empty'))}` })), id => go(id));
  }
  go(undefined);
}

function swapDialog(A, id, vid) {
  const v = A.view, sh = v.exp.ships[id], b = v.buildings[vid];
  const give = new Set(), take = new Set();
  const size = c => (c.t === 'E' || c.t === 'F' ? 2 : 1);
  const body = () => {
    const col2 = (cargo, set, kind) => cargo.map((c, i) => `<button class="eup-item ${set.has(i) ? 'on' : ''}" data-i="${i}" data-k="${kind}">${esc(itemLabel(c))}</button>`).join('') || `<small class="muted">${tx('empty')}</small>`;
    const after1 = sh.cargo.filter((_, i) => !give.has(i)).concat([...take].map(i => b.cargo[i])).reduce((a, c) => a + size(c), 0);
    const after2 = b.cargo.filter((_, i) => !take.has(i)).concat([...give].map(i => sh.cargo[i])).reduce((a, c) => a + size(c), 0);
    return { html: `<div class="eup-swap"><div><h4>${tx('On the ship')}</h4>${col2(sh.cargo, give, 'g')}</div><div><h4>${tx('In the basin')}</h4>${col2(b.cargo, take, 't')}</div></div><p class="muted" style="font-size:13px">${tx('Tap the pieces that should change places. Each place holds 2 small pieces or 1 large one (explorer, fish swarm).')}</p>`, ok: after1 <= 2 && after2 <= 2 && (give.size || take.size) };
  };
  modal(`<h2>${tx('Load and unload')}</h2><div id="sw"></div><div class="foot"><button class="btn" data-close>${tx('Cancel')}</button><button class="btn primary" id="swok">${tx('Confirm')}</button></div>`, {
    onMount(el, close) {
      const draw = () => {
        const r = body();
        el.querySelector('#sw').innerHTML = r.html;
        el.querySelector('#swok').disabled = !r.ok;
        el.querySelectorAll('.eup-item').forEach(btn => btn.onclick = () => { const set = btn.dataset.k === 'g' ? give : take, i = +btn.dataset.i; if (set.has(i)) set.delete(i); else set.add(i); draw(); });
      };
      draw();
      el.querySelector('#swok').onclick = async () => { if (await A.send({ type: 'swap', ship: id, v: vid, give: [...give], take: [...take] })) close(); };
    },
  });
}

function shipMenu(id, A) {
  const v = A.view, L = v.legal || {}, o = (L.ship || {})[id], sh = v.exp.ships[id];
  if (!o || !sh) return A.toast(t('Ships move in the movement phase.'), 'warn');
  const opts = [];
  if (o.moves) opts.push({ value: 'sail', html: `${glyph('ship', 16)} ${esc(t('Sail ({n} moves left)', { n: o.mp }))}` });
  if (o.extend) opts.push({ value: 'extend', html: `${glyph('wool', 16)} ${esc(t('Pay 1 wool for 2 more moves'))}` });
  if (o.settle) opts.push({ value: 'settle', html: `${glyph('settlement', 16)} ${esc(t('Found a settlement (the ship and the explorer return)'))}` });
  if (o.swap) opts.push({ value: 'swap', html: `${glyph('swap', 16)} ${esc(t('Load and unload at the harbor settlement'))}` });
  if (o.lairs) opts.push({ value: 'lair', html: `${glyph('skull', 16)} ${esc(t('Land units on the pirate lair'))}` });
  if (o.villages) opts.push({ value: 'village', html: `${glyph('spice', 16)} ${esc(t('Leave a unit in the spice village and take a bag of spice'))}` });
  if (o.pick) opts.push({ value: 'pickup', html: `${glyph('flag', 16)} ${esc(t('Pick up your units'))}` });
  if (o.catch) opts.push({ value: 'catch', html: `${glyph('fish', 16)} ${esc(t('Catch the fish swarm'))}` });
  if (o.deliver != null) opts.push({ value: 'deliver', html: `${glyph('flag', 16)} ${esc(t('Deliver to the council'))}` });
  if (o.attack) opts.push({ value: 'attack', html: `${glyph('sword', 16)} ${esc(t('Try to chase the pirates (roll a die)'))}` });
  if (sh.cargo.length) opts.push({ value: 'drop', html: `${glyph('bank', 16)} ${esc(t('Put a piece back into the supply'))}` });
  if (!opts.length) return A.toast(t('Nothing to do with this ship right now.'));
  A.choiceDialog(esc(t('Ship')), sh.cargo.length ? esc(sh.cargo.map(itemLabel).join(', ')) : esc(t('The ship is empty.')), opts, what => {
    switch (what) {
      case 'sail': {
        const dests = Object.keys(o.moves).map(Number);
        setTimeout(() => A.pick('edges', dests, t('Tap where this ship should sail. A discovery ends its move.'), e => A.send({ type: 'sail', ship: id, to: e }), { key: 'sail', sub: t('Tribute to a pirate costs 1 gold.') }), 30);
        return true;
      }
      case 'extend': return A.send({ type: 'buyMoves', ship: id });
      case 'settle': {
        if (o.settle.length === 1) return A.send({ type: 'settle', ship: id, v: o.settle[0] });
        setTimeout(() => A.pick('vertices', o.settle, t('Tap the corner for your settlement.'), x => A.send({ type: 'settle', ship: id, v: x }), { key: 'settle' }), 30);
        return true;
      }
      case 'swap': {
        if (o.swap.length === 1) { setTimeout(() => swapDialog(A, id, o.swap[0]), 30); return true; }
        return A.choiceDialog(tx('Which harbor settlement?'), '', o.swap.map(x => ({ value: x, html: tx('Harbor settlement') })), x => { setTimeout(() => swapDialog(A, id, x), 30); return true; });
      }
      case 'lair': return A.send({ type: 'dropUnits', ship: id, hex: o.lairs[0] });
      case 'village': return A.send({ type: 'dropVillage', ship: id, hex: o.villages[0] });
      case 'pickup': return A.send({ type: 'pickUnits', ship: id, hex: o.pick[0] });
      case 'catch': return A.send({ type: 'catchFish', ship: id, hex: o.catch[0] });
      case 'deliver': return A.send({ type: 'deliver', ship: id });
      case 'attack': return A.send({ type: 'attackPirate', ship: id });
      case 'drop':
        setTimeout(() => A.choiceDialog(tx('Put back'), '', sh.cargo.map((c, i) => ({ value: i, html: esc(itemLabel(c)) })), idx => A.send({ type: 'dropCargo', ship: id, idx })), 30);
        return true;
    }
    return undefined;
  });
}

// ------------------------------------------------------------ the plugin
const plugin = register({
  id: 'explorers', name: 'Explorers & Pirates', vp: 12, maxPlayers: 6, tutorial: 'explorers', lifeIcon: 'ship', expansion: true,
  tagline: 'Sail into the unknown: ships, discoveries and missions.',
  blurb: 'Five scenarios from the book: discover the fog with ships, found settlements with explorers, upgrade them to harbor settlements, fight pirate lairs, catch fish and trade spices.',
  tokenKeys: ['gold'], limited: RES, bankBuys: ['lumber', 'brick', 'wool', 'grain', 'ore', 'gold'], tradeKeys: ['lumber', 'brick', 'wool', 'grain', 'ore', 'gold'],
  bankText: 'Trade 3 identical resources for 1 other resource or 1 gold with the supply. 2 gold buy 1 resource, twice per turn.',
  // phone: the map opens zoomed in on your own settlements and ships (the whole-map button shows all of it)
  phoneStart(v) {
    const pts = [], at = id => { const p = v.board.vertices[id]; if (p) pts.push({ x: p.x * S, y: p.y * S }); };
    const who = v.me >= 0 ? v.me : v.current; // a spectator starts with the player whose turn it is
    if (who >= 0) {
      Object.entries(v.buildings || {}).forEach(([id, b]) => { if (b.p === who) at(id); });
      Object.values((v.exp && v.exp.ships) || {}).forEach(sh => { if (sh.p === who && v.board.edges[sh.e]) v.board.edges[sh.e].v.forEach(at); });
    }
    if (!pts.length && v.legal && v.legal.setupSpots) v.legal.setupSpots.forEach(at);
    return pts.length ? { points: pts, margin: 120, minZ: 1.5, maxZ: 2.4 } : null;
  },
  phoneExtra: v => (v.step === 'move' ? 'dock' : 'sheet'), // phone: the fleet row replaces the build buttons while ships move, otherwise it lives in the Overview tab
  ext, boardKey: v => JSON.stringify([v.exp && v.exp.ships, v.exp && v.exp.pirate, v.exp && v.exp.neutral, v.step, v.current]),

  hud(v) {
    const x = v.exp;
    if (!x) return '';
    const bits = [];
    const stepName = v.phase === 'play' ? (v.step === 'roll' ? t('Income') : v.step === 'main' ? t('Trade and build') : t('Movement phase')) : '';
    if (stepName) bits.push(`<span class="hud-pill" title="${tx('The phases of a turn')}">${esc(stepName)}</span>`);
    if (x.pirate && x.pirate.hex != null) bits.push(`<span class="hud-pill" title="${tx('Pirate ship of {name}', { name: v.players[x.pirate.owner].name })}">${houseIcon(v.players[x.pirate.owner].color, 15)} ${glyph('skull', 14)}</span>`);
    if (v.options.missions.includes('fish')) bits.push(`<span class="hud-pill" title="${tx('Fish swarms in the supply')}">${glyph('fish', 15)} ${x.fishLeft}</span>`);
    return bits.join('');
  },
  side: missionPanel,
  playerMeta(v, p) {
    const fr = p.friends || { fast: 0, gold: 0, pirate: [] };
    const fri = [fr.fast ? glyph('ship', 11) : '', fr.gold ? glyph('gold', 11) : '', fr.pirate.length ? glyph('skull', 11) : ''].join('');
    const sh = Object.values(v.exp.ships).filter(s => s.p === v.players.indexOf(p)).length;
    return `<span class="mp" title="${tx('Gold')}" style="color:#B8860B">${glyph('gold', 12)}${p.gold}</span><span class="mp" title="${tx('Ships')}">${glyph('ship', 12)}${sh}</span>${fri ? `<span class="mp" title="${tx('Friendly spice villages')}">${fri}</span>` : ''}`;
  },
  awards(v, i) {
    let out = '';
    const tr = v.exp.tracks || {};
    Object.keys(tr).forEach(k => { if (tr[k].holder === i) out += `<span class="award" title="${esc(t(MISSIONS[k].tile))} (+1)">${glyph(MISSIONS[k].icon, 11)}</span>`; });
    return out;
  },
  rollStatus(v) { return { sub: t(v.options.units ? 'A 7 sets a pirate ship on the sea.' : 'A 7 only makes players with many cards discard.') }; },
  mainStatus(v) {
    const L = v.legal || {};
    if (v.step === 'move') return { msg: t('Movement phase'), sub: t('Tap one of your ships. A discovery ends its move. No building or trading now.') };
    if (v.second) return { msg: t('Ship 2: build and move'), sub: t('You trade only with the supply this turn.') };
    return { msg: t('Trade and build, then start the movement phase.'), sub: L.goodGold > 0 ? t('The gold traders buy a resource for 1 gold from you.') : '' };
  },
  tradeButtons(v) {
    if (v.step !== 'main') return '';
    const bank = `<button class="btn" data-do="bank" title="${tx('Trade with the bank')}">${glyph('bank', 15)}${tx('Bank')}</button>`;
    return v.second ? bank : `<button class="btn" data-do="trade">${tx('Trade')}</button>${bank}`;
  },
  mainButtons(v) {
    if (v.step === 'main' && isPhone()) return ''; // phone: Sail is a build button of its own (see actions), so the primary row keeps Trade, Bank and End turn on one line
    if (v.step === 'main') return `<button class="btn gold eup-sail" data-do="startMove" title="${tx('Move ships')}">${glyph('ship', 15)} ${tx('Sail')}</button>`;
    if (v.step === 'move' && (v.legal || {}).rollFish) return `<button class="btn" data-do="rollFish">${glyph('dice', 15)} ${tx('Roll a fish swarm')}</button>`;
    return '';
  },
  pendingText(mp, v) {
    if (mp.type === 'discard') return [t('Discard {n} cards.', { n: mp.count }), t('A 7: you hold more than 7 resource cards.'), t('Choose cards')];
    if (mp.type === 'pirate') return [t('Set the pirate ship.'), t('Tap a sea field. You take a card from a player with a ship next to it.'), t('Choose field')];
    if (mp.type === 'steal') return [t('Choose who to steal from.'), '', t('Choose')];
    return null;
  },
  pendingDialog(mp, A) {
    const L = A.view.legal || {};
    if (mp.type === 'pirate') return A.pick('hexes', L.pirateHexes, t('Tap a sea field for your pirate ship.'), hex => A.send({ type: 'movePirate', hex }), { key: 'pirate' });
    if (mp.type === 'steal') {
      const v = A.view;
      return A.choiceDialog(tx('Steal from…'), tx('You take one random card (or 1 gold).'), mp.options.map(q => ({ value: q, html: `${houseIcon(v.players[q].color)} ${esc(v.players[q].name)}` })), from => A.send({ type: 'steal', from }), false);
    }
    return undefined;
  },
  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me();
    const out = [
      { key: 'road', label: t('Road'), icon: 'road', cost: COSTS.road, enabled: !!(actor && L.roads && L.roads.length), left: m.pieces.roads },
      { key: 'settlement', label: t('Settlement'), icon: 'settlement', cost: COSTS.settlement, enabled: !!(actor && L.settlements && L.settlements.length), left: m.pieces.settlements },
      { key: 'harbor', label: t('Harbor settlement'), icon: 'city', cost: COSTS.harbor, enabled: !!(actor && L.harbors && L.harbors.length), left: m.pieces.harbors },
      { key: 'ship', label: t('Ship'), icon: 'ship', cost: COSTS.ship, enabled: !!(actor && L.ships), left: m.pieces.ships },
      { key: 'explorer', label: t('Explorer'), icon: 'flag', cost: COSTS.explorer, enabled: !!(actor && L.explorer && L.explorer.length), left: m.pieces.explorers },
    ];
    if (v.options.units) out.push({ key: 'unit', label: t('Unit'), icon: 'sword', cost: COSTS.unit, enabled: !!(actor && L.unit && L.unit.length), left: m.pieces.units });
    // phone only: the desktop has the gold Sail button beside End turn. Two grid cells wide when that still fits in two rows of four
    if (v.step === 'main' && isPhone()) out.push({ key: 'startMove', label: t('Sail'), icon: 'ship', plain: true, sub: t('Move ships'), phoneOnly: true, cls: `eup-sail${out.length + (L.goodGold > 0 ? 1 : 0) <= 6 ? ' wide' : ''}`, enabled: !!actor });
    if ((L.goodGold || 0) > 0) out.push({ key: 'goodGold', label: t('Sell for gold'), icon: 'gold', plain: true, sub: t('1 resource for 1 gold'), enabled: !!actor });
    return out;
  },
  doAction(what, A) {
    const L = A.view.legal || {};
    switch (what) {
      case 'road': return A.pick('edges', L.roads, t('Tap where to build your road.'), e => A.send({ type: 'buildRoad', e }), { key: 'road' });
      case 'settlement': return A.pick('vertices', L.settlements, t('Tap where to build your settlement.'), x => A.send({ type: 'buildSettlement', v: x }), { key: 'settlement' });
      case 'harbor': return A.pick('vertices', L.harbors, t('Tap the coastal settlement to upgrade to a harbor settlement.'), x => A.send({ type: 'buildHarbor', v: x }), { key: 'harbor' });
      case 'ship': return buildShip(A);
      case 'explorer': return chooseTarget(A, 'explorer');
      case 'unit': return chooseTarget(A, 'unit');
      case 'startMove': return A.send({ type: 'startMove' });
      case 'rollFish': return A.send({ type: 'rollFish' });
      case 'goodGold':
        return A.choiceDialog(tx('Sell a resource'), tx('The gold traders pay 1 gold for 1 resource.'), RES.filter(r => A.me().res[r] > 0).map(r => ({ value: r, html: `${glyph(r, 18)} ${esc(resName(r))}`, style: `background:${CARD_COLOR[r]};color:#fff;border-color:transparent;justify-content:flex-start` })), res => A.send({ type: 'goodGold', res }));
      default: return undefined;
    }
  },
  onBoardClick(el, id, A) {
    if (el.dataset.ship) shipMenu(+el.dataset.ship, A);
  },
  onClick(el, A) {
    const ln = el.closest('[data-eup-lane]'); // phone: fold a mission track in or out
    if (ln && isPhone()) { const set = A.G.eupOpen || (A.G.eupOpen = {}); set[ln.dataset.eupLane] = !set[ln.dataset.eupLane]; A.render(); return true; }
    const b = el.closest('[data-xship]');
    if (!b || b.disabled) return false;
    shipMenu(+b.dataset.xship, A);
    return true;
  },
  handExtra: fleetHtml,
  setupText(v) {
    const k = v.setup.kind;
    const T = {
      harbor: [t('Place a harbor settlement.'), t('Tap one of the marked corners on the coast of the start island.')],
      settle: [t('Place a settlement.'), t('Tap a corner on the start island. Settlements need at least one empty corner between them.')],
      nharbor: [t('Place a neutral harbor settlement.'), t('Two players: the colours nobody plays stay on the island as obstacles.')],
      nsettle: [t('Place a neutral settlement.'), t('Two players: the colours nobody plays stay on the island as obstacles.')],
      road: [t('Place a road next to your settlement.'), t('Tap a glowing edge.')],
      ship: [t('Set out your explorer ship.'), t('Tap a sea path next to your harbor settlement.')],
    }[k] || [t('Place a settlement.'), ''];
    return { msg: T[0], sub: T[1], always: true };
  },
  costsHtml(v) {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:112px">${esc(name)}</b><span class="cd">${Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('')}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    return `${row(t('Road'), COSTS.road, '')}${row(t('Settlement'), COSTS.settlement, t('1 point'))}${row(t('Harbor settlement'), COSTS.harbor, t('2 points, upgrade of a coastal settlement'))}${row(t('Ship'), COSTS.ship, t('Next to a harbor settlement; 4 moves a turn, 1 wool for 2 more'))}${row(t('Explorer'), COSTS.explorer, t('Founds a settlement from a ship'))}${v.options.units ? row(t('Unit'), COSTS.unit, t('Fights lairs, trades with villages')) : ''}
      <p class="muted" style="font-size:13px;margin:10px 0 4px">${tx('There are no cities, development cards or robber. Trade 3 identical resources for 1 other resource or 1 gold; 2 gold buy a resource (twice per turn). If a roll brings you no resources, you get 1 gold. Discovering land earns a resource of it, any other field 2 gold.')}</p>
      <p class="muted" style="font-size:13px;margin:6px 0 0">${tx('A turn: income, then trade and build, then the movement phase. Ships carry 2 small pieces or 1 large one. Foreign pirates ask 1 gold tribute per ship and turn; a ship that has not moved can try to chase them with a die (a 6).')}</p>
      ${v.options.pairs ? `<p class="muted" style="font-size:13px;margin:6px 0 0">${tx('5–6 players: ship 1 rolls and trades, ship 2 only builds and moves. Both tokens pass to the left.')}</p>` : ''}`;
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    if (b.settlements) out.push(chip(houseIcon(w.color, 16), b.settlements, `${b.settlements} × ${t('Settlements')}`));
    if (b.harbors) out.push(chip(glyph('city', 16), b.harbors * 2, `${b.harbors} × ${t('Harbor settlements')}`));
    Object.entries(b.missions || {}).forEach(([k, n]) => { if (n) out.push(chip(glyph(MISSIONS[k].icon, 16), n, t(MISSIONS[k].name))); });
    return out;
  },
});

export default plugin;
