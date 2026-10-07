import { PCOLOR, PCOLOR_DARK, TERRAIN_COLOR, CARD_COLOR, GLYPH, inkOn, isLightColor, t, resName } from './core.js';
import { planBuilds, jobsByKey, jobCss, jobOverlay, animOf } from './builder.js';

const S = 56; // pixels per unit (hex radius)
const TERRAIN_GLYPH = { forest: 'lumber', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'ore', gold: 'gold' };
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const TRACK_COLOR = { trade: '#E0A32E', politics: '#2C6E9B', science: '#2E6B45' };
const f = n => n.toFixed(1);
const isLand = h => h.terrain !== 'sea' && h.terrain !== 'fog';
const g24 = (name, x, y, size, color) => `<g transform="translate(${f(x - size / 2)},${f(y - size / 2)}) scale(${f(size / 24)})" style="color:${color}">${GLYPH[name] || ''}</g>`;

export const BOARD_S = () => S;
export function boardBounds(board) {
  const xs = [], ys = [];
  board.vertices.forEach(v => { xs.push(v.x); ys.push(v.y); });
  board.ports.forEach(p => {
    // make room for the boat and its sail beyond the jetty
    const [a, b] = board.edges[p.edge].v.map(i => board.vertices[i]);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy) || 1;
    const bx = mx + dx / d * 1.05, by = my + dy / d * 1.05;
    xs.push(bx - 0.5, bx + 0.5); ys.push(by - 0.85, by + 0.6);
  });
  const pad = 0.62;
  const minX = (Math.min(...xs) - pad) * S, maxX = (Math.max(...xs) + pad) * S;
  const minY = (Math.min(...ys) - pad) * S, maxY = (Math.max(...ys) + pad) * S;
  return [minX, minY, maxX - minX, maxY - minY];
}

const pt = v => `${f(v.x * S)},${f(v.y * S)}`;

function hexPoints(board, h, scale = 1) {
  return h.verts.map(id => {
    const v = board.vertices[id];
    return `${f((h.x + (v.x - h.x) * scale) * S)},${f((h.y + (v.y - h.y) * scale) * S)}`;
  }).join(' ');
}

const SETTLE_D = 'M-10 11 V-3 L0 -13 L10 -3 V11 Z';
const CITY_D = 'M-15 12 V-3 L-6 -13 L3 -3 V0 H15 V12 Z';
const settlementPath = c => `<path d="${SETTLE_D}" fill="${PCOLOR[c]}" stroke="${PCOLOR_DARK[c]}" stroke-width="2.2" stroke-linejoin="round"/><path d="M-3 11 V4 H3 V11" fill="${PCOLOR_DARK[c]}" opacity=".35"/>`;
const cityPath = c => `<path d="${CITY_D}" fill="${PCOLOR[c]}" stroke="${PCOLOR_DARK[c]}" stroke-width="2.2" stroke-linejoin="round"/><rect x="6" y="3" width="4" height="4" fill="${PCOLOR_DARK[c]}" opacity=".35"/><rect x="-9" y="1" width="4" height="4" fill="${PCOLOR_DARK[c]}" opacity=".35"/>`;
// soft offset copy in black: looks like a drop shadow, costs nothing to repaint
const shade = (d, extra = '') => `<path d="${d}" transform="translate(1.8,2.8)" fill="rgba(0,0,0,.34)" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linejoin="round" ${extra}/>`;

// the trail of the Longest Road as a list of vertices (the engine sends its edges in order)
function trailVertices(board, edges) {
  const ev = i => board.edges[i].v;
  if (edges.length === 1) return ev(edges[0]).slice();
  const [a0, b0] = ev(edges[0]);
  let cur = ev(edges[1]).includes(b0) ? a0 : b0; // start at the end the next edge does not touch
  const vs = [cur];
  for (const e of edges) { const [a, b] = ev(e); if (a !== cur && b !== cur) break; cur = a === cur ? b : a; vs.push(cur); }
  return vs;
}

// Largest Army: a crimson war banner with a gold trim on a pole behind the roof (drawn first, so the house is in front)
function armyBanner(x) {
  return `<g class="army-flag" transform="translate(${x},0)"><path d="M0 -6 V-31" stroke="#3B2A1A" stroke-width="1.9" stroke-linecap="round"/><circle cy="-32" r="1.8" fill="#F0C24A" stroke="#7A520C" stroke-width=".7"/>
    <g class="army-cloth"><path d="M0.6 -30.4 H14.5 L11 -26.3 L14.5 -22.2 H0.6 Z" fill="#B3261E" stroke="#5C120D" stroke-width=".9" stroke-linejoin="round"/><path d="M1.2 -24.2 H12.6" stroke="#F0C24A" stroke-width="1.1"/><path d="M5.2 -28.6 L8.6 -25.2 M8.6 -28.6 L5.2 -25.2" stroke="#F6D77A" stroke-width="1.1" stroke-linecap="round"/></g></g>`;
}

// metropolis: the wooden gate piece from the box, in yellow whatever the track. Two pointed pillars joined by a bar,
// with an opening underneath that fits over the roof of the city (the city's peak stands inside the opening)
export const METRO_GATE_D = 'M-15.5 -1 V-28 L-11 -36 L-6.5 -28 H6.5 L11 -36 L15.5 -28 V-1 H6.5 V-13 H-6.5 V-1 Z';
export const METRO_YELLOW = '#F2C230', METRO_YELLOW_D = '#C99A12', METRO_INK = '#5E4106';
export function metroTowerInner() {
  const ink = METRO_INK;
  return `<path d="${METRO_GATE_D}" fill="${METRO_YELLOW}" stroke="${ink}" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M6.5 -28 L11 -36 L15.5 -28 V-1 H6.5 V-13 H-6.5 V-20 H6.5 Z" fill="rgba(140,90,0,.22)"/>
    <path d="M-14 -3 V-27.4 L-11 -33" fill="none" stroke="rgba(255,248,200,.8)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-4.5 -15 V-26 M-4.5 -2.6 V-8 M-11 -20 V-3 M11 -20 V-3 M0 -25 V-19" stroke="rgba(120,80,0,.3)" stroke-width=".8" stroke-linecap="round"/>
    <path d="M-6.5 -13 H6.5" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="-11" cy="-29.4" r="1" fill="#FFF2B3" stroke="${ink}" stroke-width=".7"/><circle cx="11" cy="-29.4" r="1" fill="#FFF2B3" stroke="${ink}" stroke-width=".7"/>`;
}
// The gate straddles the city: the whole gate stands behind it (the left pillar disappears behind the city) and the
// right pillar is drawn again in front, so it hugs the city. Its base lines up with the city's and its bar rests on the roof.
const METRO_PLACE = 'translate(0,13.1) scale(1,.85)';
const METRO_FRONT_D = 'M6.5 -28 L11 -36 L15.5 -28 V-1 H6.5 Z';
function metroBack() {
  // a thin light rim keeps the yellow gate readable on a yellow field tile
  return `<g class="metro-gate" transform="${METRO_PLACE}">${shade(METRO_GATE_D)}<path d="${METRO_GATE_D}" fill="none" stroke="rgba(255,246,220,.8)" stroke-width="4.4" stroke-linejoin="round"/>${metroTowerInner()}</g>`;
}
function metroFront() {
  return `<g class="metro-gate" transform="${METRO_PLACE}"><path d="${METRO_FRONT_D}" fill="${METRO_YELLOW}" stroke="${METRO_INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${METRO_FRONT_D}" fill="rgba(140,90,0,.22)"/><path d="M11 -20 V-3" stroke="rgba(120,80,0,.3)" stroke-width=".8" stroke-linecap="round"/><circle cx="11" cy="-29.4" r="1" fill="#FFF2B3" stroke="${METRO_INK}" stroke-width=".7"/></g>`;
}
const discShade = (r, dy = 2.6) => `<circle r="${r}" cy="${dy}" cx="1" fill="rgba(0,0,0,.3)"/>`;

// light burst for a new building: glow, rays and a ring (all fade out on their own)
function lightBurst(big) {
  let rays = '';
  const n = big ? 10 : 8, R = big ? 46 : 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = Math.cos(a - 0.08) * 10, y1 = Math.sin(a - 0.08) * 10, x2 = Math.cos(a) * R, y2 = Math.sin(a) * R, x3 = Math.cos(a + 0.08) * 10, y3 = Math.sin(a + 0.08) * 10;
    rays += `<path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} L${f(x3)} ${f(y3)} Z"/>`;
  }
  return `<g class="fx-light ${big ? 'big' : ''}" pointer-events="none"><circle class="fx-glowdisc" r="${big ? 40 : 30}" fill="url(#lightg)"/><g class="fx-rays" fill="#FFF3B0">${rays}</g><circle class="fx-ring" r="12" fill="none" stroke="#FFF3B0" stroke-width="3"/></g>`;
}

// ------------------------------------------------------------ harbor: boardwalk on the beach, jetty into the sea, moored boat with a big readable sail
function harbor(board, p, H) {
  const e = board.edges[p.edge];
  const [A, B] = e.v.map(i => board.vertices[i]);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  let nx = mx - H.x, ny = my - H.y; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
  const tx = B.x - A.x, ty = B.y - A.y;
  const ang = Math.atan2(ny, nx) * 180 / Math.PI;
  const out = [];
  // boardwalk along the coast edge (shows which two corners use the harbor)
  const bw = (k, o) => [(A.x + tx * k + nx * o) * S, (A.y + ty * k + ny * o) * S];
  const P = (k, o) => bw(k, o).map(f).join(',');
  out.push(`<polygon points="${P(0.08, 0.02)} ${P(0.92, 0.02)} ${P(0.86, 0.17)} ${P(0.14, 0.17)}" fill="#A0703F" stroke="#5A3A1C" stroke-width="1.6" stroke-linejoin="round"/>`);
  for (let k = 0.2; k < 0.85; k += 0.11) { const a = bw(k, 0.03), b = bw(k + 0.02, 0.16); out.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#5A3A1C" stroke-width="1" opacity=".6"/>`); }
  // jetty along the outward normal
  const bx = (mx + nx * 0.12) * S, by = (my + ny * 0.12) * S;
  let planks = '';
  for (let x = 4; x < 34; x += 5) planks += `<line x1="${x}" y1="-5.5" x2="${x}" y2="5.5" stroke="#5A3A1C" stroke-width="1" opacity=".55"/>`;
  out.push(`<g transform="translate(${f(bx)},${f(by)}) rotate(${f(ang)})">
    <rect x="0" y="-6" width="36" height="12" rx="1.5" fill="#B9874F" stroke="#5A3A1C" stroke-width="1.6"/>${planks}
    <circle cx="34" cy="-7.5" r="2.6" fill="#5A3A1C"/><circle cx="34" cy="7.5" r="2.6" fill="#5A3A1C"/>
    <circle cx="18" cy="-7.5" r="2.2" fill="#5A3A1C"/><circle cx="18" cy="7.5" r="2.2" fill="#5A3A1C"/></g>`);
  // boat, upright, past the end of the jetty
  const ox = (mx + nx * 0.98) * S, oy = (my + ny * 0.98) * S;
  const any = p.type === 'any';
  const col = any ? '#8A6A2E' : CARD_COLOR[p.type];
  const title = any ? t('Harbor: trade any 3 identical cards for 1') : t('Harbor: trade 2 {res} for 1', { res: resName(p.type) });
  const medallion = any
    ? `<circle r="12" fill="#FFF3DC" stroke="#3A200C" stroke-width="2"/><text y="5.5" text-anchor="middle" font-size="15" font-weight="800" fill="#2B1E12" font-family="Fraunces, Georgia, serif">3:1</text>`
    : `<circle r="13.2" fill="${col}" stroke="#FFFFFF" stroke-width="2.4"/><circle r="13.2" fill="none" stroke="#3A200C" stroke-width="1" opacity=".55"/>${g24(p.type, 0, 0, 23, '#FFFFFF')}`;
  out.push(`<g class="boat" transform="translate(${f(ox)},${f(oy)})"><title>${title}</title>
    <g class="boat-bob">
      <ellipse cx="0" cy="15" rx="26" ry="4" fill="rgba(0,0,0,.2)"/>
      <path d="M-26 5 L26 5 L19 15 L-19 15 Z" fill="#7A4A23" stroke="#3A200C" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M-26 5 L26 5" stroke="#B9874F" stroke-width="2.4"/>
      <path d="M0 5 V-44" stroke="#3A200C" stroke-width="2.4"/>
      <path d="M-20 -43 H20" stroke="#3A200C" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M-19 -42 Q0 -37 19 -42 L17 -6 Q0 -2 -17 -6 Z" fill="#FFF6E2" stroke="#3A200C" stroke-width="1.8" stroke-linejoin="round"/>
      <g transform="translate(0,-24)">${medallion}</g>
      <path d="M0 -44 L11 -40.5 L0 -37 Z" fill="#D2352A" stroke="#7E1214" stroke-width="1"/>
    </g>
    <g transform="translate(0,26)"><rect x="-15" y="-8" width="30" height="15" rx="4" fill="#FFF3DC" stroke="#3A200C" stroke-width="1.5"/>
      <text y="4" text-anchor="middle" font-size="11" font-weight="800" fill="#2B1E12" font-family="Inter">${any ? '3:1' : '2:1'}</text></g>
  </g>`);
  return out.join('');
}

// ------------------------------------------------------------ small pieces
function shipShape(c, { big = false, dark = false } = {}) {
  const hull = dark ? '#16110C' : PCOLOR[c], line = dark ? '#000' : PCOLOR_DARK[c];
  const k = big ? 1.5 : 1;
  return `<g transform="scale(${k})"><path d="M-15 0 H15 L10 8 H-10 Z" fill="${hull}" stroke="${line}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M0 0 V-17" stroke="${line}" stroke-width="2"/>
    <path d="M1.5 -16 L11 -3 H1.5 Z" fill="${dark ? '#2B2420' : '#FFF6E2'}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-1.5 -13 L-8 -3 H-1.5 Z" fill="${dark ? '#2B2420' : '#FFF6E2'}" stroke="${line}" stroke-width="1.4" stroke-linejoin="round" opacity=".9"/>
    ${dark ? `<path d="M0 -17 L8 -15 L0 -13 Z" fill="#fff"/>` : ''}</g>`;
}

function fogTile(board, h, fresh) {
  const cx = h.x * S, cy = h.y * S;
  const puff = (dx, dy, r, o) => `<circle cx="${f(cx + dx)}" cy="${f(cy + dy)}" r="${r}" fill="rgba(255,255,255,${o})"/>`;
  return `<g class="tile fog" data-hex="${h.id}"><polygon points="${hexPoints(board, h, 0.97)}" fill="url(#fog)" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="5 4"/>
    <g class="fog-drift">${puff(-18, 8, 15, 0.45)}${puff(2, 0, 20, 0.5)}${puff(20, 9, 14, 0.42)}${puff(-4, 16, 12, 0.35)}</g>
    <text x="${f(cx)}" y="${f(cy + 9)}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="30" fill="rgba(43,30,18,.55)">?</text></g>`;
}

function riverArt(h) {
  const cx = h.x * S, cy = h.y * S;
  return `<g class="river-art"><path class="flow" d="M${f(cx - 34)} ${f(cy - 8)} q 12 -14 24 0 t 24 0 t 24 0" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="5" stroke-linecap="round"/>
    <path class="flow b" d="M${f(cx - 34)} ${f(cy + 12)} q 12 -14 24 0 t 24 0 t 24 0" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="4" stroke-linecap="round"/></g>`;
}


// ------------------------------------------------------------ the living board (can be switched off)
// Little scenes on every land tile: sheep on pastures, a woodcutter in the forest, a smoking brick kiln, wheat in
// the wind, a mine cart, a tumbleweed. They sit in the free space below the number token. On the robber's tile the
// work stops: the tile darkens and the robber guards his loot.
const dl = (h, span) => `animation-delay:-${((h.id * 1.37) % span).toFixed(2)}s`;
// Every tile gets its own small differences (a black sheep, another shirt, a scene the other way round). The variant
// comes from the tile's rank among the tiles of the same kind, so two pastures on one board never look alike.
const hr = (id, k) => { const x = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const WOOLS = { white: ['#FFFDF5', '#D8CFBD', '#3A2E28', '#FFF'], black: ['#34302E', '#171413', '#7A6D64', '#FFF'], brown: ['#A98B66', '#7A5F3F', '#3A2E28', '#FFF'], grey: ['#C9C6C0', '#9A968E', '#3A2E28', '#FFF'], rainbow: ['url(#rainbowg)', '#7A5AA0', '#3A2E28', '#FFF'] };
// a proper integer hash for the real dice rolls (the sine hash above is fine for jitter, but its values for neighbouring tiles are alike)
const roll32 = (a, b, c) => { let x = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263) + Math.imul(c + 1, 2246822519)) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x = Math.imul(x ^ (x >>> 16), 2246822519); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
const RAINBOW_ODDS = 0.01; // one sheep in a hundred wears every colour
const seedOf = id => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7);
const sheepSvg = (cls, delay, kind = 'white') => {
  const [w, s, face, eye] = WOOLS[kind], leg = kind === 'black' ? '#171413' : '#3A2E28';
  return `<g class="${cls}"><rect class="lf-leg a" x="-3.6" y="2.4" width="1.5" height="3.4" rx=".7" fill="${leg}"/><rect class="lf-leg b" x="-1.2" y="2.4" width="1.5" height="3.4" rx=".7" fill="${leg}"/><rect class="lf-leg a" x="1.4" y="2.4" width="1.5" height="3.4" rx=".7" fill="${leg}"/><rect class="lf-leg b" x="3.4" y="2.4" width="1.5" height="3.4" rx=".7" fill="${leg}"/>
  <ellipse cx="0" cy="0" rx="6.2" ry="4.4" fill="${w}" stroke="${s}" stroke-width=".8"/><circle cx="-3.2" cy="-2.6" r="2.5" fill="${w}"/><circle cx="0" cy="-3.3" r="2.7" fill="${w}"/><circle cx="3.1" cy="-2.6" r="2.4" fill="${w}"/>
  <g class="lf-head" style="${delay}"><ellipse cx="6.4" cy="-.8" rx="2.5" ry="2" fill="${face}"/><circle cx="7.3" cy="-1.3" r=".5" fill="${eye}"/><ellipse cx="5.2" cy="-2.6" rx="1.1" ry=".6" fill="${face}"/></g></g>`;
};
const PINE = c => `<rect x="-1" y="-1" width="2" height="4" fill="#5A3A1C"/><path d="M0 -15 L5.5 -5 H-5.5 Z M0 -10 L7 1 H-7 Z" fill="${c}"/><path d="M0 -15 L5.5 -5 H0 Z M0 -10 L7 1 H0 Z" fill="rgba(0,0,0,.18)"/>`;
const OAK = c => `<rect x="-1.3" y="-3" width="2.6" height="6" fill="#5A3A1C"/><circle cx="0" cy="-9" r="6.2" fill="${c}"/><circle cx="-4" cy="-5" r="4.2" fill="${c}"/><circle cx="4" cy="-5.5" r="4.4" fill="${c}"/><path d="M-2 -13 a5 5 0 0 1 7 2" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.4" stroke-linecap="round"/>`;
const ROUND_LOGS = n => ['<circle r="2.6" fill="#7A4A23"/><circle r="1.2" fill="#C9A26B"/>', '<circle cx="4.6" r="2.6" fill="#7A4A23"/><circle cx="4.6" r="1.2" fill="#C9A26B"/>', '<circle cx="2.3" cy="-3.9" r="2.6" fill="#7A4A23"/><circle cx="2.3" cy="-3.9" r="1.2" fill="#C9A26B"/>', '<circle cx="9.2" r="2.6" fill="#7A4A23"/><circle cx="9.2" r="1.2" fill="#C9A26B"/>'].slice(0, n).join('');
const SHIRTS = ['#2F5D8A', '#B23A2A', '#3B7D3A', '#D9A21B', '#7A4A9A', '#E07B20'];
const HATS = ['#B23A2A', '#2F5D8A', '#E8D9A8', '#4A3426', '#D9A21B', '#2F5D8A'];

// materials the miners dig out: silver, copper, sapphire, gold, emerald, ruby (a tile's cart and its miner's rock differ)
const MATS = [['#B7C3CC', '#94A3AE'], ['#E0A050', '#C98A3A'], ['#8FD0E8', '#5FB0D0'], ['#F2D24A', '#D9A91E'], ['#7FD99A', '#3FAE66'], ['#E86A6A', '#B83A3A']];
// a worker who hacks at a block: ore from a rock (miner) or clay (mason). `dir` -1 puts him on the right, facing left
const digger = (cx, cy, x, y, dir, { cap, shirt, block, fleck, chip, tool, delay, kind }) => {
  const rock = kind === 'miner'
    ? `<path d="M3 4 L5 -4 L11 -6.4 L15.4 -1 L14.6 4 Z" fill="${block}" stroke="#4E4840" stroke-width=".9" stroke-linejoin="round"/><path d="M5 -3.6 L11 -6.4 L12 -1 Z" fill="rgba(255,255,255,.26)"/><circle cx="9" cy=".6" r="1.3" fill="${fleck}"/><circle cx="12.6" cy="2" r="1" fill="${fleck}"/><circle cx="6.6" cy="2.4" r=".9" fill="${fleck}"/>`
    : `<rect x="3.6" y="-4.6" width="11" height="8.8" rx="1.2" fill="${block}" stroke="#6B2C1B" stroke-width=".9"/><path d="M3.6 -.6 H14.6 M9 -4.6 V-.6 M6.4 -.6 V4.2 M12 -.6 V4.2" stroke="rgba(90,30,14,.55)" stroke-width=".7" fill="none"/>`;
  const head = kind === 'miner'
    ? `<path d="M4.4 -11.6 q3.6 -.6 5.2 1.8 q-3 -.4 -5.2 -1.8z" fill="#C9D0D6" stroke="#6B747B" stroke-width=".5"/>`
    : `<rect x="5" y="-11.4" width="4.6" height="3.2" rx=".6" fill="#A6AEB6" stroke="#5C646B" stroke-width=".6"/>`;
  return `<g transform="translate(${f(cx + x)},${f(cy + y)}) scale(${dir},1)" class="lf-dig">${rock}
    <g class="lf-chips" style="${delay}"><rect x="9" y="-1" width="1.7" height="1.7" fill="${chip}"/><rect x="12" y="-3" width="1.4" height="1.4" fill="${chip}"/><rect x="7" y="-5" width="1.4" height="1.4" fill="${fleck}"/></g>
    <g class="lf-cutter"><circle cx="0" cy="-8.2" r="2.3" fill="#F1C9A5"/><path d="M-2.6 -9.2 h5.2 l-.5 -2.1 h-4.2z" fill="${cap}"/><rect x="-2.1" y="-6" width="4.2" height="5.6" rx="1.2" fill="${shirt}"/><rect x="-1.9" y="-.6" width="1.5" height="4" fill="#3A2E28"/><rect x=".4" y="-.6" width="1.5" height="4" fill="#3A2E28"/>
      <g class="lf-axe" style="${delay}"><line x1="1" y1="-4.6" x2="6.5" y2="-9.6" stroke="#7A4A23" stroke-width="1.3" stroke-linecap="round"/>${head}</g></g></g>`;
};

function lifeFor(h, cx, cy, nth = 0, seed = 0) {
  const at = (x, y, inner, cls = '') => `<g transform="translate(${f(cx + x)},${f(cy + y)})"${cls ? ` class="${cls}"` : ''}>${inner}</g>`;
  const mirror = on => out => on ? `<g transform="translate(${f(2 * cx)},0) scale(-1,1)">${out}</g>` : out;
  const jit = (k, r) => Math.round((hr(h.id, k) - .5) * 2 * r); // a few pixels of difference in where things stand
  switch (h.terrain) {
    case 'pasture': {
      // 0 all white · 1 the walker is black · 2 a black sheep grazes on the left · 3 a brown and a grey one · 4 a lamb joins · 5 black sheep on the right
      const v = nth % 6;
      const kinds = [['white', 'white', 'white'], ['black', 'white', 'white'], ['white', 'white', 'black'], ['white', 'brown', 'grey'], ['white', 'white', 'white'], ['white', 'black', 'white']][v];
      // chance is rolled per game and sheep (the game id is the seed), so a rainbow sheep turns up in about one board in ten
      const roll = k => roll32(seed, h.id, 20 + k);
      const sheepKind = (k, base) => (roll(k) < RAINBOW_ODDS ? 'rainbow' : base);
      // lambs: every pasture tile has a one in three chance of one, and the variant with a lamb always has it
      const hasLamb = v === 4 || roll32(seed, h.id, 11) < 0.34;
      const lamb = hasLamb ? at(-16 + jit(5, 3), 40, `<g transform="scale(.62)"><g class="lf-graze">${sheepSvg('lf-sheep-s', dl({ id: h.id + 2 }, 7), sheepKind(3, 'white'))}</g></g>`) : '';
      return mirror(v === 2 || v === 5)(
        at(jit(1, 2), 31 + jit(2, 2), `<g class="lf-walk" style="${dl(h, 14)}">${sheepSvg('lf-sheep-b', dl(h, 7), sheepKind(0, kinds[0]))}</g>`) +
        at(31 + jit(3, 3), -4 + jit(4, 4), `<g class="lf-graze">${sheepSvg('lf-sheep-s', dl({ id: h.id + 1 }, 7), sheepKind(1, kinds[1]))}</g>`) +
        at(-30 + jit(5, 3), -2 + jit(6, 4), `<g transform="scale(-.85,.85)"><g class="lf-graze">${sheepSvg('lf-sheep-s', dl({ id: h.id + 4 }, 7), sheepKind(2, kinds[2]))}</g></g>`) + lamb);
    }
    case 'forest': {
      const v = nth % 6, tree = v % 2 ? OAK(['#3C7A3A', '#2E6B35', '#4F8A3A'][(v >> 1) % 3]) : PINE(['#1E5A38', '#24603F', '#2B6B4A'][(v >> 1) % 3]);
      const shirt = SHIRTS[v], hat = HATS[(v + 3) % 6], logs = [3, 2, 4, 3, 2, 4][v];
      return mirror([0, 0, 1, 0, 1, 1][v])(
        at(-14 + jit(1, 3), 37, ROUND_LOGS(logs)) +
        at(12.4, 31, `<g transform="scale(.8)"><g class="lf-tree" style="${dl(h, 9)}">${tree}</g></g><g class="lf-chips" style="${dl(h, 1.1)}"><rect x="-3" y="-3" width="1.6" height="1.6" fill="#E8C48A"/><rect x="-5" y="-1" width="1.4" height="1.4" fill="#C9A26B"/></g>`) +
        at(6, 37, `<g class="lf-cutter"><circle cx="0" cy="-8.2" r="2.3" fill="#F1C9A5"/><path d="M-2.2 -9.6 h4.4 l-.6 -1.9 h-3.2z" fill="${hat}"/><rect x="-2.1" y="-6" width="4.2" height="5.6" rx="1.2" fill="${shirt}"/><rect x="-1.9" y="-.6" width="1.5" height="4" fill="#4A3426"/><rect x=".4" y="-.6" width="1.5" height="4" fill="#4A3426"/>
          ${v === 3 ? '<path d="M-1.6 -5.6 h3.2 v1.1 h-3.2z" fill="rgba(255,255,255,.55)"/>' : ''}<g class="lf-axe" style="${dl(h, 1.1)}"><line x1="1" y1="-4.6" x2="6.5" y2="-9.6" stroke="#7A4A23" stroke-width="1.3" stroke-linecap="round"/><path d="M5.4 -11.4 l3 .5 -.8 3.1 z" fill="#D5DADF" stroke="#7D858C" stroke-width=".4"/></g></g>`) +
        at(-33 + jit(2, 2), 8 + jit(3, 3), v % 2 ? OAK('#3F7B3D') : PINE('#24603F'), 'lf-static') + at(33, 6 + jit(4, 3), `<g transform="scale(.8)">${v % 3 === 2 ? OAK('#2E6B35') : PINE('#1B4F33')}</g>`));
    }
    case 'hills': {
      // a brickworks: the kiln glows and throws sparks, a worker carries bricks to the stack, which grows and is collected
      const v = nth % 5, d6 = dl(h, 6), d12 = `animation-delay:-${((h.id * 1.37) % 6).toFixed(2)}s`;
      const tint = ['#C4583A', '#B5482C', '#D06A44', '#A8452B', '#C95F3C'][v], tintD = '#7E3420';
      const shirt = ['#B55A2C', '#3E7C8C', '#7A8C3A', '#8C4A7A', '#C9A23B'][v], cap = ['#4A3426', '#E8D9A8', '#4A3426', '#D9A21B', '#2F5D8A'][v];
      const brick = (x, y, cls = '', st = '') => `<rect ${cls ? `class="${cls}"` : ''} ${st ? `style="${st}"` : ''} x="${x}" y="${y}" width="5.4" height="2.8" rx=".5" fill="${tint}" stroke="${tintD}" stroke-width=".6"/>`;
      const stack = [`${brick(-8, 0)}${brick(-2.4, 0)}${brick(3.2, 0)}${brick(-5.2, -2.8)}${brick(.4, -2.8)}`, `${brick(-8, 0)}${brick(-2.4, 0)}${brick(3.2, 0)}${brick(-5.2, -2.8)}${brick(.4, -2.8)}${brick(-2.4, -5.6)}`, `${brick(-8, 0)}${brick(-2.4, 0)}${brick(-5.2, -2.8)}`, `${brick(-8, 0)}${brick(-2.4, 0)}${brick(3.2, 0)}${brick(-5.2, -2.8)}${brick(.4, -2.8)}`, `${brick(-8, 0)}${brick(-2.4, 0)}${brick(3.2, 0)}${brick(8.8, 0)}${brick(-5.2, -2.8)}${brick(.4, -2.8)}${brick(6, -2.8)}`][v];
      const clayPot = (x, y, c) => at(x, y, `<path d="M-3 4 Q-4.4 -1 -2 -3 H2 Q4.4 -1 3 4 Z" fill="${c}" stroke="#6B2C1B" stroke-width=".8"/><rect x="-2.4" y="-4" width="4.8" height="1.6" rx=".6" fill="${c}" stroke="#6B2C1B" stroke-width=".7"/>`, 'lf-static');
      const extra = [
        '',
        clayPot(-34, 12, '#B5651D') + clayPot(-28, 14, '#C9794A'),
        at(-33, 14, `<ellipse cx="0" cy="5" rx="5.5" ry="1.8" fill="rgba(0,0,0,.22)"/><path d="M-5 -2 H5 L3.4 4 H-3.4 Z" fill="#8A5A32" stroke="#4A2E18" stroke-width=".9"/>${brick(-3.4, -4.4)}${brick(.6, -4.4)}<circle cx="-3.6" cy="5" r="1.7" fill="#2B2620"/><line x1="5" y1="-2" x2="9.4" y2="-5" stroke="#4A2E18" stroke-width="1.2" stroke-linecap="round"/>`, 'lf-static'),
        at(-33, 14, `<path d="M-7 5 Q-6 -3 0 -4 Q6 -3 7 5 Z" fill="#B5693F" stroke="#6B2C1B" stroke-width=".9"/><path d="M-3 4 Q-2 -1 0 -2 M2 4 Q2 0 3.4 -1" fill="none" stroke="rgba(255,255,255,.25)" stroke-width=".9"/>`, 'lf-static'),
        at(-33, 8, `<path d="M0 0 V-7" stroke="#5A4A3C" stroke-width="1.4"/><path d="M-4.4 -7 H4.4 L3.2 -9.6 H-3.2 Z" fill="#8C8478" stroke="#4A4238" stroke-width=".8"/><circle cx="0" cy="-12" r="2" fill="rgba(240,234,224,.8)"/>`, 'lf-static'),
      ][v];
      const mason = digger(cx, cy, 33, 25, -1, { kind: 'mason', cap: ['#E8D9A8', '#B23A2A', '#2F5D8A', '#4A3426', '#D9A21B'][v], shirt: ['#6B7A4A', '#C9A23B', '#8C4A7A', '#3E7C8C', '#B55A2C'][v], block: ['#B5693F', '#C77A4A', '#A85A34', '#BC6A44', '#CF8A58'][v], fleck: tint, chip: '#E4A27A', delay: dl(h, 1.1) });
      return mirror(v % 2 === 1)(extra + mason + at(13, 33, `<path d="M-9 5 a9 9 0 0 1 18 0 z" fill="${v === 2 ? '#7A4A32' : '#8A3A22'}" stroke="#4E1E12" stroke-width="1"/><path d="M-6.5 1.5 h13 M-4 -2 h8 M-2.4 -2 v3.5 M2.4 -2 v3.5 M0 1.5 v3.5" stroke="#5E2414" stroke-width=".7" fill="none"/>
          <rect x="3.6" y="-10.5" width="3.8" height="7.5" fill="#6B2C1B" stroke="#4E1E12" stroke-width=".8"/>
          <path d="M-3.6 5 v-2.6 a3.6 3.6 0 0 1 7.2 0 V5 z" fill="#2A120A"/>
          <path class="lf-flame a" d="M-2.6 5 q.4 -4 2.6 -5.6 q2.2 1.6 2.6 5.6 z" fill="#FF8A2B"/><path class="lf-flame b" d="M-1.4 5 q.2 -2.8 1.4 -3.8 q1.2 1 1.4 3.8 z" fill="#FFE07A"/>
          <g class="lf-sparks"><circle cx="5.5" cy="-11" r=".9" fill="#FFB347" style="${d6}"/><circle cx="5.5" cy="-11" r=".7" fill="#FFE07A" style="animation-delay:-${((h.id * 1.37 + .5) % 1.5).toFixed(2)}s"/><circle cx="5.5" cy="-11" r=".8" fill="#FF8A2B" style="animation-delay:-${((h.id * 1.37 + 1) % 1.5).toFixed(2)}s"/></g>
          <g class="lf-smoke"><circle cx="5.5" cy="-11.5" r="2.6" fill="rgba(240,234,224,.85)" style="${dl(h, 3)}"/><circle cx="5.5" cy="-11.5" r="2.6" fill="rgba(240,234,224,.85)" style="animation-delay:-${((h.id * 1.37 + 1) % 3).toFixed(2)}s"/><circle cx="5.5" cy="-11.5" r="2.6" fill="rgba(240,234,224,.85)" style="animation-delay:-${((h.id * 1.37 + 2) % 3).toFixed(2)}s"/></g>`) +
        at(-17, 36, `${stack}${brick(-2.4, -5.6, 'lf-brk a', d12)}${brick(-5.2, -8.4, 'lf-brk b', d12)}`) +
        at(-6, 38, `<g class="lf-carry" style="${d6}"><circle cx="0" cy="-8.2" r="2.2" fill="#F1C9A5"/><path d="M-2.3 -9.4 h4.6 l-.8 -1.8 h-3z" fill="${cap}"/><rect x="-2.1" y="-6" width="4.2" height="5.6" rx="1.2" fill="${shirt}"/><rect x="-1.9" y="-.6" width="1.5" height="4" fill="#4A3426"/><rect x=".4" y="-.6" width="1.5" height="4" fill="#4A3426"/>
          <g class="lf-load" style="${d6}">${brick(-2.7, -9.6)}</g></g>`));
    }
    case 'fields': {
      const v = nth % 5;
      const [ear, stalkC] = [['#F6D77A', '#B9831C'], ['#EFC24F', '#A8721A'], ['#E9D58A', '#9C8A3A'], ['#F2B84B', '#B3701A'], ['#F8E08E', '#B9831C']][v];
      const n = [9, 8, 10, 9, 7][v], step = 56 / (n - 1);
      let a = '', b = '';
      for (let i = 0; i < n; i++) {
        const x = -28 + i * step, tall = 1 + (v === 2 ? 0.25 : 0) * (i % 2), y = 38 - Math.abs(i - (n - 1) / 2) * 1.2;
        const stalk = `<g transform="translate(${f(x)},${f(y)}) scale(1,${tall})"><path d="M0 0 V-10" stroke="${stalkC}" stroke-width="1.1"/><ellipse cx="0" cy="-12" rx="1.7" ry="3.4" fill="${ear}" stroke="${stalkC}" stroke-width=".6"/></g>`;
        if (i % 2) a += stalk; else b += stalk;
      }
      const shirt = ['#B23A2A', '#2F5D8A', '#3B7D3A', '#7A4A9A', '#E07B20'][v], hat = ['#8C6239', '#4A3426', '#D9A21B', '#2B2B2B', '#8C6239'][v];
      const pumpkin = `<ellipse cx="-3.4" rx="3.7" ry="4.5" fill="#E27A22" stroke="#9A4A12" stroke-width=".9"/><ellipse cx="3.4" rx="3.7" ry="4.5" fill="#E27A22" stroke="#9A4A12" stroke-width=".9"/><ellipse rx="3.5" ry="4.9" fill="#F08A2C" stroke="#9A4A12" stroke-width="1"/>
        <path d="M-1.7 -4.2 Q-2.5 0 -1.7 4.2 M1.7 -4.2 Q2.5 0 1.7 4.2 M-5.4 -2.6 Q-6.4 0 -5.4 2.6 M5.4 -2.6 Q6.4 0 5.4 2.6" fill="none" stroke="#B35A18" stroke-width=".9" stroke-linecap="round"/><path d="M-.4 -3.6 Q-.6 -1 -.4 1.6" fill="none" stroke="rgba(255,235,190,.7)" stroke-width="1" stroke-linecap="round"/>
        <path d="M0 -4.8 q.3 -2.2 1.8 -2.7" fill="none" stroke="#3E7C3A" stroke-width="1.6" stroke-linecap="round"/><path d="M1.6 -6.8 q2.2 -.3 2.8 1.5 q-1.5 -.2 -1.4 1" fill="none" stroke="#5E9A44" stroke-width=".9" stroke-linecap="round"/>`;
      const extra = v === 1 ? at(-18, 34, pumpkin, 'lf-static')
        : v === 2 ? at(-18, 34, `<path d="M-6 3 Q-6 -8 0 -9 Q6 -8 6 3 Z" fill="#E2BE5C" stroke="#9C7A24" stroke-width=".9"/><path d="M-3 -1 L3 -5 M-4 2 L4 -2" stroke="#B8923A" stroke-width=".8"/>`, 'lf-static')
        : v === 3 ? at(-26, 35, `<g transform="translate(0,-2)"><path d="M-3 0 q3 -4 6 0 q-3 1.5 -6 0z" fill="#2B2B2B"/><path d="M3 0 l2.4 -.8 -1.8 1.8z" fill="#E8A23A"/></g>`, 'lf-static') : '';
      return mirror(v === 1 || v === 4)(at(0, 0, `<g class="lf-wheat a" style="${dl(h, 3)}">${a}</g><g class="lf-wheat b" style="animation-delay:-${((h.id * 1.37 + 1.4) % 3).toFixed(2)}s">${b}</g>`) + extra +
        at(33, -2, `<g class="lf-crow" style="${dl(h, 6)}"><line x1="0" y1="2" x2="0" y2="-9" stroke="#6B4A2A" stroke-width="1.2"/><line x1="-5" y1="-6" x2="5" y2="-6" stroke="#6B4A2A" stroke-width="1.2"/><circle cy="-10.5" r="2.2" fill="#F1D9A0"/><path d="M-3 -12 h6 l-3 -3.2z" fill="${hat}"/><path d="M-2.4 -6 h4.8 l-1 5 h-2.8z" fill="${shirt}"/></g>`));
    }
    case 'mountains': {
      // 0 plain mine · 1 boulders · 2 blue crystals and a lantern · 3 gold nuggets. Every tile has a miner who chips ore out of a
      // rock; the cart and the rock carry different materials from tile to tile
      const v = nth % 4;
      const [o1, o2] = MATS[(nth * 2) % 6], [r1, r2] = MATS[(nth * 2 + 3) % 6];
      const cart = ['#5A4A3C', '#8A4A2A', '#3E5A7A', '#6A6A30'][v];
      const lamp = ['#FFD27A', '#FF9A5A', '#BFE8FF', '#D8FF9A'][v];
      const helmet = ['#B23A2A', '#2F5D8A', '#E8D9A8', '#D9A21B'][v], shirt = ['#4A6A3A', '#7A8C9A', '#8C4A7A', '#B55A2C'][v];
      const miner = digger(cx, cy, v === 2 || v === 1 ? 33 : -37, v === 2 || v === 1 ? 27 : 13, v === 2 || v === 1 ? -1 : 1, { kind: 'miner', cap: helmet, shirt, block: '#8C857A', fleck: r1, chip: r2, delay: dl(h, 1.1) });
      const rock = (x, y, k, c = '#8C857A') => at(x, y, `<path d="M-${4 * k} 4 L-${2.6 * k} -${2 * k} L${1.4 * k} -${3.2 * k} L${4 * k} 4 Z" fill="${c}" stroke="#4E4840" stroke-width=".9" stroke-linejoin="round"/><path d="M-${.6 * k} -${2.4 * k} L${1.4 * k} -${3.2 * k} L${2.6 * k} 0 Z" fill="rgba(255,255,255,.28)"/>`, 'lf-static');
      const crystal = (x, y, k, c) => at(x, y, `<path d="M-2.2 4 L-1.6 -${5 * k} L0 -${7 * k} L1.6 -${5 * k} L2.2 4 Z" fill="${c}" stroke="#2B4A5A" stroke-width=".8" stroke-linejoin="round"/><path d="M-.4 -${6 * k} L-.2 3" stroke="rgba(255,255,255,.7)" stroke-width=".9"/>`, 'lf-static');
      const nugget = (x, y) => at(x, y, `<ellipse rx="2.8" ry="2" fill="#F2D24A" stroke="#A8741C" stroke-width=".8"/><ellipse cx="-.7" cy="-.7" rx=".9" ry=".5" fill="#FFF3B0"/>`, 'lf-static');
      const extras = [
        '',
        rock(-34, 8, 1.3) + rock(-27, 14, .9, '#9A9186'),
        crystal(-34, 12, 1.4, '#5FB0D0') + crystal(-28, 14, 1, '#8FD0E8') + crystal(-31, 5, .8, '#8FD0E8') + at(22, 16, `<line y1="-8" y2="-2" stroke="#5A4A3C" stroke-width="1.2"/><rect x="-2.4" y="-2" width="4.8" height="5.4" rx="1" fill="#8A8F96" stroke="#3A3F44" stroke-width=".8"/><circle cy=".7" r="1.4" fill="${lamp}"/>`, 'lf-static'),
        nugget(30, 22) + nugget(25, 25) + nugget(34, 26),
      ][v];
      return mirror(v === 1)(at(-15, 31, `<path d="M-8 5 V-1 a8 8 0 0 1 16 0 V5 z" fill="#2B2620" stroke="#5A4A3C" stroke-width="1.4"/><circle class="lf-lamp" cx="-6.5" cy="-4" r="1.6" fill="${lamp}"/>
          <line x1="8" y1="5" x2="31" y2="5" stroke="#5A4A3C" stroke-width="1"/><line x1="12" y1="5" x2="12" y2="6.4" stroke="#5A4A3C" stroke-width="1"/><line x1="20" y1="5" x2="20" y2="6.4" stroke="#5A4A3C" stroke-width="1"/><line x1="28" y1="5" x2="28" y2="6.4" stroke="#5A4A3C" stroke-width="1"/>
          <g class="lf-cart" style="${dl(h, 8)}"><path d="M-4 0 h8 l-1.4 4 h-5.2 z" fill="${cart}" stroke="#2B2620" stroke-width=".6"/><circle cx="-2.2" cy="-.6" r="1.3" fill="${o1}"/><circle cx="1" cy="-1" r="1.5" fill="${o2}"/><circle cx="-.6" cy="-2" r="1.1" fill="${o1}"/><circle cx="-2" cy="4.4" r="1.1" fill="#2B2620"/><circle cx="2" cy="4.4" r="1.1" fill="#2B2620"/></g>`) +
        at(30 - (v >> 1) * 8, -14 + (v % 2) * 4, `<path d="M-6 5 L-1 -4 L1.5 0 L3.5 -2.5 L7 5 z" fill="rgba(255,255,255,.25)"/>`, 'lf-static') + extras + miner);
    }
    case 'desert': {
      const v = nth % 3;
      return mirror(v === 1)(at(0, 27, `<g class="lf-roll" style="${dl(h, 9)}"><g class="lf-spin"><circle r="3.6" fill="none" stroke="#9C7B45" stroke-width="1"/><path d="M-3 -1 Q0 2 3 -1 M-2 2 Q0 -2 2.5 2 M-1 -3 Q1 0 -1 3" fill="none" stroke="#9C7B45" stroke-width=".8"/></g></g>`) +
        at(30, 4, `<path d="M0 6 V-6 a2 2 0 0 1 4 0 V6 z M4 0 h2.5 a1.5 1.5 0 0 0 1.5 -1.5 V-4 M0 2 h-2.5 a1.5 1.5 0 0 1 -1.5 -1.5 V-2" fill="#5E8F4A" stroke="#3E6B33" stroke-width="1.2" stroke-linejoin="round"/>`, 'lf-static') +
        (v >= 1 ? at(-31, 12, `<g transform="scale(.75)"><path d="M0 6 V-6 a2 2 0 0 1 4 0 V6 z M4 0 h2.5 a1.5 1.5 0 0 0 1.5 -1.5 V-4" fill="#6A9A52" stroke="#3E6B33" stroke-width="1.2" stroke-linejoin="round"/></g>`, 'lf-static') : '') +
        (v === 2 ? at(-26, -20, `<path d="M-5 2 q2 -5 5 -3 q3 -3 5 2 q-1 3 -5 3 q-4 0 -5 -2z" fill="#EFE6CF" stroke="#B9A77C" stroke-width=".8"/><circle cx="-1.6" cy="-.5" r=".9" fill="#7C6C46"/><circle cx="1.8" cy="-.5" r=".9" fill="#7C6C46"/>`, 'lf-static') : ''));
    }
    default: return '';
  }
}
// sea life: a fish that jumps now and then, on a few sea tiles
function seaLife(h) {
  const cx = h.x * S, cy = h.y * S;
  return `<g transform="translate(${f(cx)},${f(cy)})"><g class="lf-fish" style="${dl(h, 7)}"><path d="M-5 0 c3 -3.5 7 -3.5 9 0 c-2 3.5 -6 3.5 -9 0 z M4 0 l3.5 -2.6 v5.2 z" fill="#CDE9F2"/></g><ellipse class="lf-splash" style="${dl(h, 7)}" cx="0" cy="4" rx="6" ry="1.6" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1"/></g>`;
}

// fishing ground: a number token like the land tiles have (it pays out on that roll), marked with a fish
function fishToken(g) {
  const x = g.x * S, y = g.y * S;
  const pips = PIPS[g.number] || 0;
  let dots = '';
  for (let i = 0; i < pips; i++) dots += `<circle cx="${(i - (pips - 1) / 2) * 4}" cy="8.5" r="1.4" fill="#1F5F78"/>`;
  return `<g class="fish-ground" transform="translate(${f(x)},${f(y)})"><title>${t('Fishing ground')}</title>
    <circle r="21" fill="rgba(31,122,153,.35)"/><path d="M-14 13 q3.5 -3 7 0 t7 0 t7 0 t7 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6" stroke-linecap="round"/>
    ${discShade(15)}<g class="ntok" data-n="${g.number}"><circle r="15" fill="url(#tok)" stroke="#1F7A99" stroke-width="2.5"/>
    <text y="4" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="15" fill="#1F5F78">${g.number}</text>${dots}</g>
    <g transform="translate(13,-13)"><circle r="8.5" fill="#1F7A99" stroke="#fff" stroke-width="1.8"/>${g24('fish', 0, 0, 11, '#fff')}</g></g>`;
}

export function renderBoard(view, targets = {}, fresh = null, zoom = null, life = false, builders = false) {
  const { board } = view;
  const colorOf = p => view.players[p].color;
  const fr = fresh || { verts: new Set(), edges: new Set(), knights: new Set(), robber: false, merchant: false, ships: new Set(), hexes: new Set(), pirate: false };
  // builders: pieces that were just built are put up by a little builder (builder.js) instead of lighting up
  const jobs = builders ? jobsByKey(planBuilds(view, fr)) : new Map();
  // the SVG always holds the whole board; zoom.js sizes and moves it inside a clipped frame, so panning never
  // reveals unpainted areas
  const [bx0, by0, bw0, bh0] = boardBounds(board);
  const out = [];
  out.push(`<svg class="board ${life ? 'alive' : ''}" style="touch-action:${zoom && zoom.z > 1 ? 'none' : 'pan-y'}" viewBox="${f(bx0)} ${f(by0)} ${f(bw0)} ${f(bh0)}" data-base="${f(bx0)} ${f(by0)} ${f(bw0)} ${f(bh0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t('Game board')}">`);
  out.push(`<defs>
    <radialGradient id="lightg"><stop offset="0" stop-color="#FFF6CF" stop-opacity=".95"/><stop offset=".45" stop-color="#FFE08A" stop-opacity=".55"/><stop offset="1" stop-color="#FFD35A" stop-opacity="0"/></radialGradient>
    <radialGradient id="tok" cx="40%" cy="35%"><stop offset="0" stop-color="#FFFBEE"/><stop offset="1" stop-color="#EFDFB6"/></radialGradient>
    <radialGradient id="sand" cx="50%" cy="50%" r="60%"><stop offset="0.8" stop-color="#EAD9AC"/><stop offset="1" stop-color="#D9C08A"/></radialGradient>
    <radialGradient id="fog" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#C9D6DF"/><stop offset="1" stop-color="#7F95A6"/></radialGradient>
    <linearGradient id="rainbowg" gradientUnits="userSpaceOnUse" x1="-7" y1="0" x2="8" y2="0"><stop offset="0" stop-color="#E8453C"/><stop offset=".2" stop-color="#F39A2B"/><stop offset=".4" stop-color="#F5D93A"/><stop offset=".6" stop-color="#5CBF5A"/><stop offset=".8" stop-color="#3E8EDE"/><stop offset="1" stop-color="#8E5BD0"/></linearGradient>
    <linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4CB52"/><stop offset="1" stop-color="#C58E12"/></linearGradient>
  </defs>`);
  if (jobs.size) out.push(`<style>${[...jobs.values()].map(jobCss).join('')}</style>`);

  // gentle waves in the sea
  let waves = '';
  for (let i = 0; i < 12; i++) {
    const wx = bx0 + ((i * 0.37 + 0.11) % 1) * bw0, wy = by0 + ((i * 0.61 + 0.07) % 1) * bh0;
    waves += `<path class="wave w${i % 3}" d="M${f(wx)} ${f(wy)} q8 -5 16 0 t16 0" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2" stroke-linecap="round"/>`;
  }
  out.push(`<g>${waves}</g>`);

  // open sea tiles
  out.push('<g>');
  board.hexes.forEach(h => { if (h.terrain === 'sea') out.push(`<polygon points="${hexPoints(board, h, 1)}" fill="rgba(160,215,235,.07)" stroke="rgba(255,255,255,.09)" stroke-width="1.5"/>`); });
  out.push('</g>');
  if (life) {
    const seas = board.hexes.filter(h => h.terrain === 'sea' && h.id % 4 === 1).slice(0, 4);
    out.push(`<g class="life">${seas.map(seaLife).join('')}</g>`);
  }

  // islands: shallow water and sand ring under every land tile
  out.push('<g>');
  board.hexes.filter(isLand).forEach(h => out.push(`<polygon points="${hexPoints(board, h, 1.2)}" fill="rgba(140,200,215,.25)" stroke="rgba(140,200,215,.25)" stroke-width="14" stroke-linejoin="round"/>`));
  board.hexes.filter(isLand).forEach(h => out.push(`<polygon points="${hexPoints(board, h, 1.1)}" fill="url(#sand)" stroke="#E2CC96" stroke-width="8" stroke-linejoin="round"/>`));
  out.push('</g>');

  // fishing grounds (with lines to the two corners that profit from them)
  (board.fishing || []).forEach(g => {
    g.verts.forEach(id => { const v = board.vertices[id]; out.push(`<line x1="${f(g.x * S)}" y1="${f(g.y * S)}" x2="${f(v.x * S)}" y2="${f(v.y * S)}" stroke="rgba(223,244,251,.75)" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round"/>`); });
    out.push(fishToken(g));
  });

  // harbors
  board.ports.forEach(p => {
    const [a, b] = board.edges[p.edge].v;
    const hex = board.hexes.find(h => isLand(h) && h.verts.includes(a) && h.verts.includes(b));
    if (hex) out.push(harbor(board, p, hex));
  });

  // tiles (the rank among tiles of the same kind picks each tile's little scene, so it never changes when the robber moves)
  const rankOf = {}, rankN = {};
  board.hexes.forEach(h => { if (isLand(h)) rankOf[h.id] = rankN[h.terrain] = (rankN[h.terrain] ?? -1) + 1; });
  board.hexes.forEach(h => {
    if (h.terrain === 'sea') return;
    if (h.terrain === 'fog') { out.push(fogTile(board, h)); return; }
    const cx = h.x * S, cy = h.y * S;
    const col = h.terrain === 'gold' ? 'url(#goldg)' : TERRAIN_COLOR[h.terrain];
    const reveal = fr.hexes && fr.hexes.has(h.id);
    out.push(`<g class="tile ${reveal ? 'fx-reveal' : ''} ${h.terrain}" data-num="${h.number || ''}" data-hex="${h.id}"><polygon points="${hexPoints(board, h, 0.97)}" fill="${col}" stroke="rgba(0,0,0,.18)" stroke-width="2"/>
      <polygon class="tile-glow" points="${hexPoints(board, h, 0.9)}" fill="none" stroke="#FFF6DA" stroke-width="5"/>
      <polygon points="${hexPoints(board, h, 0.84)}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/></g>`);
    if (h.terrain === 'river') out.push(riverArt(h));
    const g = TERRAIN_GLYPH[h.terrain];
    if (g) out.push(`<g transform="translate(${cx - 13},${cy - 44}) scale(1.08)" style="color:rgba(255,255,255,${h.terrain === 'gold' ? .9 : .55})">${GLYPH[g]}</g>`);
    if (life) {
      if (view.robber === h.id) out.push(`<polygon class="lf-dim" points="${hexPoints(board, h, 0.97)}" fill="rgba(24,10,4,.38)"/>`);
      else if (!(h.terrain === 'desert' && view.fishing)) out.push(`<g class="life">${lifeFor(h, cx, cy, rankOf[h.id], seedOf(view.id))}</g>`);
    }
    if (h.terrain === 'gold') out.push(`<g class="sparkle" style="color:#FFF6C8"><circle cx="${f(cx - 30)}" cy="${f(cy - 18)}" r="2.4" fill="currentColor"/><circle cx="${f(cx + 32)}" cy="${f(cy - 8)}" r="1.8" fill="currentColor"/><circle cx="${f(cx + 20)}" cy="${f(cy + 34)}" r="2.2" fill="currentColor"/></g>`);
    if (h.terrain === 'desert' && view.fishing) {
      out.push(`<ellipse cx="${f(cx)}" cy="${f(cy + 2)}" rx="40" ry="26" fill="#3C9CB9" stroke="#FFFFFF" stroke-width="2.4"/><path d="M${f(cx - 18)} ${f(cy - 5)} q4.5 -5 9 0 t9 0 t9 0 t9 0" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2.2" stroke-linecap="round"/>
        ${g24('fish', cx - 26, cy + 8, 12, '#FFFFFF')}<text x="${f(cx + 6)}" y="${f(cy + 13)}" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="Inter" letter-spacing="-.2">2·3·11·12</text>`);
    }
    if (h.number) {
      const red = h.number === 6 || h.number === 8;
      const pips = PIPS[h.number];
      let dots = '';
      for (let i = 0; i < pips; i++) dots += `<circle cx="${(i - (pips - 1) / 2) * 4.4}" cy="9" r="1.6" fill="${red ? '#C1272D' : '#2B1E12'}"/>`;
      out.push(`<g transform="translate(${cx},${cy + 4})"><g class="ntok" data-n="${h.number}">${discShade(17)}<circle r="17" fill="url(#tok)" stroke="#C9AE7C" stroke-width="1.5"/>
        <text y="4" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="${red ? 19 : 17}" fill="${red ? '#C1272D' : '#2B1E12'}">${h.number}</text>${dots}</g></g>`);
    }
    if (board.spices && board.spices.includes(h.id)) out.push(`<g transform="translate(${cx + 30},${cy - 26})">${discShade(11, 2)}<circle r="11" fill="#B53A2A" stroke="#fff" stroke-width="2"/>${g24('spice', 0, 0, 14, '#fff')}</g>`);
    if (view.merchant && view.merchant.hex === h.id) {
      const mc = colorOf(view.merchant.owner);
      out.push(`<g transform="translate(${cx + 24},${cy + 22})"><ellipse cy="9" rx="8" ry="2.6" fill="rgba(0,0,0,.35)"/><g class="${fr.merchant ? 'fx-drop' : ''}"><path d="M-7 9 L0 -9 L7 9 Z" fill="${PCOLOR[mc]}" stroke="#2B1E12" stroke-width="1.6"/><circle cy="-10" r="4.5" fill="${PCOLOR[mc]}" stroke="#2B1E12" stroke-width="1.6"/></g></g>`);
    }
    if (view.robber === h.id) {
      // living board: the robber guards his loot. A marching red ring, a pulse, the robber rocking on his feet and
      // looking around, and a sack that hops and spits out a coin (big, continuous moves: tiny ones look choppy)
      const guard = life ? `<ellipse class="lf-rmarch" cy="14" rx="15" ry="5" fill="none" stroke="#E8452F" stroke-width="1.5" stroke-dasharray="4.5 3"/><ellipse class="lf-rring" cy="14" rx="15" ry="5" fill="none" stroke="#E8452F" stroke-width="1.6"/><g transform="translate(15,9)"><circle class="lf-coin" cy="-3" r="2.3" fill="#F0C24A" stroke="#A8741C" stroke-width=".8"/><g class="lf-sack"><path d="M-4.5 5 C-6 1 -4 -3 -1.5 -3.6 L-2.6 -5.6 H2.6 L1.5 -3.6 C4 -3 6 1 4.5 5 Z" fill="#9C6B3A" stroke="#5A3A1C" stroke-width=".9"/><path d="M-1.6 -3.6 H1.6" stroke="#5A3A1C" stroke-width="1"/><text y="3.2" text-anchor="middle" font-size="5" font-weight="800" fill="#F0C24A" font-family="Inter">★</text></g></g>` : '';
      out.push(`<g transform="translate(${cx - (h.number ? 26 : 0)},${cy + 6})">${fr.robber ? '<circle class="fx-dust" cy="13" r="9"/>' : ''}<ellipse cy="14" rx="11" ry="3.6" fill="rgba(0,0,0,.38)"/>${guard}<g class="${fr.robber ? 'fx-robber-drop' : ''}"><g class="${life ? 'lf-rob' : ''}"><path d="M-9 14 C-9 4 -6 0 -4 -2 A7 7 0 1 1 4 -2 C6 0 9 4 9 14 Z" fill="#2B1E12" stroke="#000" stroke-width="1"/><circle cy="-9" r="6.5" fill="#3A2A1C"/><g class="${life ? 'lf-eyes' : ''}"><g class="${life ? 'lf-blink' : ''}"><circle cx="-2.4" cy="-10" r="1.2" fill="#F0C24A"/><circle cx="2.4" cy="-10" r="1.2" fill="#F0C24A"/></g></g></g></g></g>`);
    }
  });

  // sea markers: fish shoals and pirate lairs
  (board.shoals || []).forEach(sh => {
    const h = board.hexes[sh.hex];
    out.push(`<g transform="translate(${f(h.x * S)},${f(h.y * S)})">${discShade(17)}<title>${t('Fish shoal')}</title><circle r="17" fill="#1F7A99" stroke="#fff" stroke-width="2.4"/>${g24('fish', 0, -5, 15, '#fff')}<text y="12" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="12.5" fill="#fff">${sh.number}</text></g>`);
  });
  (view.lairs || []).forEach(l => {
    const h = board.hexes[l.hex];
    let pips = '';
    for (let i = 0; i < 3; i++) pips += `<circle cx="${(i - 1) * 9}" cy="21" r="3.2" fill="${i < l.hp ? '#D2352A' : 'rgba(255,255,255,.25)'}" stroke="#000" stroke-width=".8"/>`;
    out.push(`<g class="lair ${l.hp <= 0 ? 'dead' : ''}" transform="translate(${f(h.x * S)},${f(h.y * S)})">${discShade(18)}<title>${t('Pirate lair')}</title>${l.hp > 0 ? `<circle r="19" fill="#1B1511" stroke="#C9AE7C" stroke-width="2.4"/>${g24('skull', 0, -2, 22, '#F4EFE2')}${pips}` : `<circle r="16" fill="#3A3328" stroke="#8A7A5E" stroke-width="2" opacity=".7"/>${g24('skull', 0, 0, 18, '#8A7A5E')}${l.owner != null ? `<circle cx="14" cy="-14" r="9" fill="${PCOLOR[colorOf(l.owner)]}" stroke="#fff" stroke-width="2"/>${g24('star', 14, -14, 10, inkOn(colorOf(l.owner)))}` : ''}`}</g>`);
  });

  // island bonus markers
  const isl = new Map();
  board.hexes.forEach(h => { if (h.island != null && isLand(h)) { if (!isl.has(h.island)) isl.set(h.island, []); isl.get(h.island).push(h); } });
  isl.forEach((hs, id) => {
    if ((board.homeIslands || []).includes(id)) return;
    const mx = hs.reduce((a, h) => a + h.x, 0) / hs.length, my = Math.min(...hs.map(h => h.y)) - 0.78;
    const own = view.islandBonus && view.islandBonus[id];
    const c = own != null ? colorOf(own) : null;
    out.push(`<g class="isle-chip ${own != null ? 'taken' : ''}" transform="translate(${f(mx * S)},${f(my * S)})"><title>${t('New island bonus: +1 victory point for the first settlement')}</title>
      <circle r="13" fill="${c ? PCOLOR[c] : 'rgba(20,8,4,.55)'}" stroke="${c ? '#fff' : '#F0C24A'}" stroke-width="2" ${c ? '' : 'stroke-dasharray="4 3"'}/>
      ${g24('star', 0, -3, 12, c ? inkOn(c) : '#F0C24A')}<text y="9" text-anchor="middle" font-size="8.5" font-weight="800" fill="${c ? inkOn(c) : '#F0C24A'}" font-family="Inter">+1</text></g>`);
  });

  if (targets.hexes) {
    targets.hexes.forEach(id => {
      const h = board.hexes[id];
      out.push(`<polygon class="hl-h ${targets.picked?.includes(id) ? 'picked' : ''}" data-h="${id}" points="${hexPoints(board, h, 0.9)}"/>`);
    });
  }

  // Longest Road: the holder's trail glows, is trimmed with gold and a light runs along it
  const lr = view.longestRoad;
  const trail = lr && lr.p != null && Array.isArray(lr.edges) && lr.edges.length ? lr.edges.filter(e => board.edges[e]) : null;
  const onTrail = new Set(trail || []);
  const trailD = trail && trail.length ? 'M' + trailVertices(board, trail).map(i => `${f(board.vertices[i].x * S)} ${f(board.vertices[i].y * S)}`).join(' L') : '';
  if (trailD) out.push(`<g class="lr-halo" pointer-events="none"><path d="${trailD}" fill="none" stroke="rgba(255,204,80,.3)" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><path d="${trailD}" fill="none" stroke="rgba(255,228,140,.55)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></g>`);

  // roads and bridges
  for (const [e, p] of Object.entries(view.roads)) {
    const [a, b] = board.edges[e].v.map(i => board.vertices[i]);
    const k = 0.16;
    const job = jobs.get(`e${e}`);
    // a road that a builder is laying is drawn from the end he starts at
    const [a2, b2] = job && job.flip ? [b, a] : [a, b];
    const x1 = (a2.x + (b2.x - a2.x) * k) * S, y1 = (a2.y + (b2.y - a2.y) * k) * S;
    const x2 = (b2.x + (a2.x - b2.x) * k) * S, y2 = (b2.y + (a2.y - b2.y) * k) * S;
    const c = colorOf(p);
    const cls = job ? '' : fr.edges.has(+e) ? 'class="fx-road"' : '';
    const bridge = view.bridges && view.bridges[e];
    const gold = onTrail.has(+e);
    const lay = job ? `class="rl" pathLength="100" style="stroke-dasharray:100;${animOf(`bwr${job.id}`, job)}"` : 'class="rl" pathLength="100"';
    out.push(`<g ${cls}><line ${lay} x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${gold ? '#7A520C' : PCOLOR_DARK[c]}" stroke-width="${bridge ? 15 : gold ? 12.5 : 11}" stroke-linecap="round"/>
      ${gold ? `<line ${job ? lay : ''} x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#F6CF57" stroke-width="${bridge ? 12.5 : 9.6}" stroke-linecap="round"/>` : ''}
      <line ${lay} x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${PCOLOR[c]}" stroke-width="${bridge ? 10 : gold ? 5.4 : 6.5}" stroke-linecap="round"/>
      ${bridge ? `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-dasharray="3 4" stroke-linecap="round"/>` : ''}
      ${cls ? `<line class="fx-roadglow" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#FFF3B0" stroke-width="14" stroke-linecap="round"/>` : ''}</g>`);
  }

  // ships sit on edges like roads, hull along the edge
  for (const [e, sh] of Object.entries(view.ships || {})) {
    const [a, b] = board.edges[e].v.map(i => board.vertices[i]);
    const mx = (a.x + b.x) / 2 * S, my = (a.y + b.y) / 2 * S;
    let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const c = colorOf(sh.p);
    const own = targets.ownShips?.includes(+e);
    const isNew = fr.ships && fr.ships.has(+e);
    out.push(`<g transform="translate(${f(mx)},${f(my)})" ${own ? `class="ship-hit" data-s="${e}"` : ''}>${isNew ? '<circle class="fx-splash" r="10"/><circle class="fx-splash late" r="10"/>' : ''}<g transform="rotate(${f(ang)})"><g transform="translate(1.6,2.6)" opacity=".28">${shipShape('black', { dark: true })}</g><g class="${isNew ? 'fx-drop' : ''}">${shipShape(c)}</g></g>
      ${own ? '<circle class="knight-ring" r="20" fill="none" stroke="#F0C24A" stroke-width="2.5" stroke-dasharray="4 3"/><circle r="22" fill="transparent" style="cursor:pointer"/>' : ''}</g>`);
  }

  // the light that runs along the Longest Road (no counter, the gold trail says it all)
  if (trailD) {
    out.push(`<path class="lr-shine" d="${trailD}" pathLength="1000" fill="none" stroke="#FFFBE8" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="80 3200" style="animation-duration:${(2.6 + trail.length * 0.14).toFixed(2)}s"/>`);
  }

  // Largest Army: the holder flies a war banner over every settlement and city
  const army = view.mode !== 'knights' && view.largestArmy && view.largestArmy.p != null ? view.largestArmy.p : null;
  // the old boot (fishermen) leans against one house of whoever fished it up
  let boot = view.fish && view.fish.boot != null ? view.fish.boot : null;

  // buildings
  for (const [vid, b] of Object.entries(view.buildings)) {
    const v = board.vertices[vid];
    const c = colorOf(b.p);
    const job = jobs.get(`v${vid}`);
    const grow = part => job ? `<g class="bw-grow" style="${animOf(`bwg${job.id}`, job)}">${part}</g>` : part;
    let g = '';
    if (b.p === army) g += armyBanner(b.type === 'city' ? -6 : 0);
    const wallS = b.wall ? `<rect x="-19" y="4" width="38" height="12" rx="3" fill="#8B8478" stroke="#3F3A33" stroke-width="1.6"/><path d="M-15 4 V1 H-11 V4 M-5 4 V1 H-1 V4 M5 4 V1 H9 V4" stroke="#3F3A33" stroke-width="1.4" fill="#8B8478"/>` : '';
    g += job && job.kind === 'wall' ? grow(wallS) : wallS;
    const metro = job && job.kind === 'metro' ? grow : x => x;
    if (b.metro) g += metro(metroBack());
    g += b.type === 'city' ? cityPath(c) : settlementPath(c);
    if (b.metro) g += metro(metroFront());
    if (b.p === boot) { boot = null; g += `<g transform="translate(${b.type === 'city' ? 17 : 12},6) rotate(-8)"><title>${t('Old boot')}</title><path d="M-3.4 -7.5 H2.2 V0.6 L6.6 2.6 Q8.4 3.5 8.4 5.6 V7.2 H-3.4 Z" fill="#7A5232" stroke="#3A2614" stroke-width="1.3" stroke-linejoin="round"/><path d="M-3.4 4.6 H8.4" stroke="#3A2614" stroke-width="1"/><path d="M-1.6 -5.6 H0.6 M-1.6 -3.4 H0.6" stroke="#E8D3A8" stroke-width=".8"/></g>`; }
    const isNew = fr.verts.has(+vid) && !job;
    const d = b.type === 'city' ? CITY_D : SETTLE_D;
    const flash = isNew ? `<path class="fx-flash" d="${d}" fill="#FFF3C4" stroke="#FFF8DE" stroke-width="2.5" stroke-linejoin="round"/>` : '';
    const body = `${b.wall ? '' : shade(d)}${g}${flash}`;
    if (job && (job.kind === 'settlement' || job.kind === 'city')) {
      // up it goes: the old house (when it is a city) makes way while the new one rises from the ground
      const old = job.kind === 'city' && job.prev === 'settlement' ? `<g style="${animOf(`bwo${job.id}`, job)}">${shade(SETTLE_D)}${settlementPath(c)}</g>` : '';
      out.push(`<g transform="translate(${pt(v)})">${old}${grow(body)}</g>`);
    } else out.push(`<g transform="translate(${pt(v)})">${isNew ? lightBurst(b.type === 'city') + '<circle class="fx-dust" r="10"/>' : ''}<g class="${isNew ? 'fx-drop' : ''}">${body}</g></g>`);
  }

  // knights
  for (const [vid, k] of Object.entries(view.knights)) {
    const v = board.vertices[vid];
    const c = colorOf(k.p);
    const fill = k.active ? PCOLOR[c] : '#FFFBEE';
    const ink = k.active ? inkOn(c) : PCOLOR_DARK[c];
    let bars = '';
    for (let i = 0; i < k.level; i++) bars += `<rect x="${-7 + i * 5}" y="2" width="3.4" height="7" rx="1" fill="${ink}"/>`;
    const own = targets.ownKnights?.includes(+vid);
    const isNew = fr.knights.has(+vid);
    out.push(`<g transform="translate(${pt(v)})" ${own ? `class="knight-hit" data-k="${vid}"` : ''}>${discShade(14)}<g class="${isNew ? 'fx-pop-in' : ''}">
      ${k.active ? '<circle r="17" fill="none" stroke="#F0C24A" stroke-opacity=".75" stroke-width="3.5"/>' : ''}
      <circle r="13" fill="${fill}" stroke="${PCOLOR_DARK[c]}" stroke-width="3"/>
      <path d="M-6 -1 L-6 -6 Q0 -11 6 -6 L6 -1 Z" fill="${ink}"/>${bars}</g>
      ${own ? '<circle class="knight-ring" r="17" fill="none" stroke="#F0C24A" stroke-width="2.5" stroke-dasharray="4 3"/>' : ''}
    </g>`);
  }

  // the pirate
  if (view.pirate != null && board.hexes[view.pirate]) {
    const h = board.hexes[view.pirate];
    out.push(`<g transform="translate(${f(h.x * S)},${f(h.y * S + 4)})"><ellipse cy="13" rx="20" ry="4" fill="rgba(0,0,0,.3)"/><title>${t('Pirate')}</title><g class="pirate-bob"><g class="${fr.pirate ? 'fx-robber-drop' : ''}">${shipShape('black', { big: true, dark: true })}</g></g></g>`);
  }

  // the builders walk above the pieces but below the tap targets
  jobs.forEach(j => out.push(`<g pointer-events="none">${jobOverlay(j, view)}</g>`));

  // tap targets go above every piece so nothing can cover them
  if (targets.edges) {
    targets.edges.forEach(id => {
      const [a, b] = board.edges[id].v.map(i => board.vertices[i]);
      out.push(`<line class="hl-e" data-e="${id}" x1="${f(a.x * S)}" y1="${f(a.y * S)}" x2="${f(b.x * S)}" y2="${f(b.y * S)}"/>`);
      out.push(`<line data-e="${id}" x1="${f((a.x * 0.8 + b.x * 0.2) * S)}" y1="${f((a.y * 0.8 + b.y * 0.2) * S)}" x2="${f((b.x * 0.8 + a.x * 0.2) * S)}" y2="${f((b.y * 0.8 + a.y * 0.2) * S)}" stroke="transparent" stroke-width="26" style="cursor:pointer"/>`);
    });
  }

  if (targets.vertices) {
    targets.vertices.forEach(id => {
      const v = board.vertices[id];
      out.push(`<circle class="hl-v" data-v="${id}" cx="${f(v.x * S)}" cy="${f(v.y * S)}" r="9"/>`);
      out.push(`<circle data-v="${id}" cx="${f(v.x * S)}" cy="${f(v.y * S)}" r="22" fill="transparent" style="cursor:pointer"/>`);
    });
  }
  out.push('</svg>');
  return out.join('');
}

export { isLightColor };
