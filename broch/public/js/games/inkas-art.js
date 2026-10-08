// Rise of the Inkas: the Andean look of the board. The frame (Pacific in the west, jungle in the east), the eight
// landscapes with their little living scenes (woodcutters, stone masons, llamas, miners, potato farmers, fishermen in
// reed boats, coca pickers, macaws), huts and temples instead of houses, and the thickets that cover a tribe in decline.
// Every scene loops on the living board (CSS classes in-*, lf-* and the shared hk-* ones in styles.css).
import { PCOLOR, PCOLOR_DARK } from '../core.js';

const f = n => n.toFixed(1);
const hash = (id, k) => { const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const delay = (h, span, k = 3) => `animation-delay:-${(hash(h.id, k) * span).toFixed(2)}s`;
const SKIN = ['#C98A5E', '#B9794C', '#D79A6B', '#A8683E'];
const WEAR = ['#C1272D', '#2B7BB9', '#E8B23A', '#7A4F9A', '#2E8A57', '#D9631E'];
const HAT = ['#E8B23A', '#C1272D', '#2B7BB9', '#E8E1CC'];

export const LAND = ['forest', 'hills', 'pasture', 'mountains', 'fields'];
export const TERRAIN_GLYPH = { forest: 'timber', hills: 'stone', pasture: 'fleece', mountains: 'metal', fields: 'potato', coast: 'catch', plantation: 'coca', jungle: 'feathers' };
export const TERRAIN_NAME = { forest: 'Forest', hills: 'Quarry', pasture: 'Pasture', mountains: 'Mountains', fields: 'Fields', coast: 'Coastal waters', plantation: 'Jungle plantation', jungle: 'Jungle', frame: 'Frame piece with jungle' };
// flat colours behind the textures (used when a texture is missing, e.g. in a tutorial board)
const BASE = { forest: '#3F8A47', hills: '#C9744A', pasture: '#8CC05A', mountains: '#8D8BA6', fields: '#E4B04A', coast: '#4DB4DE', plantation: '#2E7A40', jungle: '#1E5C33', frame: '#17472A' };

// ------------------------------------------------------------ textures for the tiles and the frame
// every landscape is a repeating little picture (terraces, strata, leaves, waves); the board uses them as fills
const tex = (id, w, h, bg, inner) => `<pattern id="in-p-${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${inner}</pattern>`;
const leaves = (c1, c2, n = 7) => Array.from({ length: n }, (_, i) => { const x = (i * 17 + 5) % 30, y = (i * 11 + 4) % 26; return `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="1.8" transform="rotate(${(i * 47) % 90 - 30} ${x} ${y})" fill="${i % 2 ? c1 : c2}" opacity=".75"/>`; }).join('');
export const DEFS = `<defs>
  ${tex('forest', 30, 26, '#3F8A47', leaves('#2D6F3A', '#5CAA58'))}
  ${tex('hills', 40, 18, '#C9744A', '<path d="M0 5 H40 M0 13 H40" stroke="#A85A36" stroke-width="2.4"/><path d="M6 5 V13 M24 5 V13 M14 13 V18 M32 13 V18 M14 0 V5 M32 0 V5" stroke="#B3653F" stroke-width="1.4"/><path d="M0 2 H40 M0 10 H40" stroke="#E29A6E" stroke-width="1" opacity=".6"/>')}
  ${tex('pasture', 40, 14, '#8CC05A', '<path d="M0 3 Q10 0 20 3 T40 3 M0 10 Q10 7 20 10 T40 10" fill="none" stroke="#6FA544" stroke-width="2"/><path d="M0 5 Q10 2 20 5 T40 5" fill="none" stroke="#B2D985" stroke-width="1" opacity=".7"/>')}
  ${tex('mountains', 36, 30, '#8D8BA6', '<path d="M0 22 L9 8 L14 15 L20 5 L30 22 Z" fill="#7A7893" opacity=".7"/><path d="M20 5 L24 12 L18 12 Z M9 8 L12 13 L7 13 Z" fill="#E4E2EE" opacity=".75"/><ellipse cx="26" cy="26" rx="14" ry="3" fill="#C9C7D8" opacity=".5"/>')}
  ${tex('fields', 40, 16, '#E4B04A', '<path d="M0 4 Q10 1 20 4 T40 4 M0 12 Q10 9 20 12 T40 12" fill="none" stroke="#B8832A" stroke-width="2.2"/><path d="M0 7 Q10 4 20 7 T40 7 M0 15 Q10 12 20 15 T40 15" fill="none" stroke="#F4D488" stroke-width="1" opacity=".75"/>')}
  ${tex('coast', 36, 16, '#4DB4DE', '<path d="M0 4 q4.5 -3 9 0 t9 0 t9 0 t9 0 M0 12 q4.5 -3 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#9BDCF2" stroke-width="1.6" opacity=".75"/><path d="M0 8 q4.5 -3 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#2F8FBF" stroke-width="1.4" opacity=".55"/>')}
  ${tex('plantation', 30, 26, '#2E7A40', `${leaves('#1D5A2E', '#4DA060')}<path d="M0 22 H30" stroke="#6B4A2A" stroke-width="2.6" opacity=".55"/>`)}
  ${tex('jungle', 30, 26, '#1E5C33', leaves('#124626', '#3A8A4C', 8))}
  ${tex('frame', 30, 26, '#17472A', leaves('#0E3620', '#2B7040', 8))}
  ${tex('sea', 50, 22, '#3C9FD0', '<path d="M0 6 q6 -4 12.500 0 t12.500 0 t12.500 0 t12.500 0 M0 17 q6 -4 12.500 0 t12.500 0 t12.500 0 t12.500 0" fill="none" stroke="#8ED3EE" stroke-width="1.700" opacity=".5"/><path d="M0 11 q6 -4 12.500 0 t12.500 0 t12.500 0 t12.500 0" fill="none" stroke="#2C86B8" stroke-width="1.500" opacity=".45"/>')}
  ${tex('jungleback', 44, 40, '#173F26', `${leaves('#0F3320', '#2A6A3C', 9)}<circle cx="10" cy="30" r="9" fill="#1E5230" opacity=".7"/><circle cx="32" cy="12" r="11" fill="#1B4A2C" opacity=".7"/>`)}
</defs>`;
export const TERRAIN_COLOR = Object.fromEntries(Object.keys(BASE).map(k => [k, `url(#in-p-${k})`]));

// ------------------------------------------------------------ the frame around the board
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function hullOf(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function offset(poly, d) { // convex polygon pushed outwards by d
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
    const n1 = norm(a, b), n2 = norm(b, c);
    const bis = [n1[0] + n2[0], n1[1] + n2[1]], k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    out.push([b[0] + bis[0] * k, b[1] + bis[1] * k]);
  }
  return out;
}
function norm(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; } // outward for a clockwise (screen) hull
// the frame polygon and the line where the sea gives way to the jungle; stored on the board so that the bounds include it
export function ensureFrame(board) {
  if (board.frame) return board;
  const pts = [];
  board.hexes.forEach(h => h.verts.forEach(id => pts.push([board.vertices[id].x, board.vertices[id].y])));
  let hull = hullOf(pts);
  if (hull.length > 2 && cross(hull[0], hull[1], hull[2]) < 0) hull = hull.reverse(); // make it clockwise on screen (y down)
  board.frame = offset(hull, 0.85);
  const jungle = board.hexes.filter(h => h.terrain === 'jungle' || h.terrain === 'plantation' || h.terrain === 'frame');
  const sea = board.hexes.filter(h => h.terrain === 'coast');
  const jx = jungle.length ? Math.min(...jungle.map(h => h.x)) - 0.75 : Infinity;
  board.frameMid = sea.length || jungle.length ? jx : -Infinity;
  return board;
}
const pathOf = pts => `M${pts.map(p => `${f(p[0])} ${f(p[1])}`).join(' L')} Z`;

// the sea on the left, the jungle on the right, both drawn under the tiles
export function backdrop({ board, S, life }) {
  ensureFrame(board);
  const poly = board.frame.map(([x, y]) => [x * S, y * S]);
  const mid = board.frameMid * S;
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const d = pathOf(poly);
  const id = `inframe${Math.round(x0)}`;
  // a ragged coast between the sea and the jungle
  let coast = `M${f(mid)} ${f(y0 - 4)}`;
  for (let y = y0; y <= y1; y += 18) coast += ` L${f(mid + ((y / 18) % 2 ? 5 : -5))} ${f(y)}`;
  coast += ` L${f(mid)} ${f(y1 + 4)}`;
  // foliage on the jungle side, waves on the sea side
  let leaf = '', wav = '';
  const jxs = x1 - Math.max(mid, x0);
  if (isFinite(mid) && jxs > 30) {
    for (let i = 0; i < 26; i++) {
      const x = Math.max(mid, x0) + 14 + hash(i, 1) * (jxs - 28), y = y0 + 14 + hash(i, 2) * (y1 - y0 - 28);
      const big = 9 + hash(i, 3) * 9;
      leaf += `<g transform="translate(${f(x)},${f(y)}) rotate(${Math.round(hash(i, 4) * 360)})"><ellipse rx="${f(big)}" ry="${f(big * 0.42)}" fill="${i % 3 ? '#2A6B3D' : '#3E8A4F'}" opacity=".55"/><path d="M${f(-big)} 0 H${f(big)}" stroke="#14452A" stroke-width=".9" opacity=".6"/></g>`;
    }
  }
  const wxs = Math.min(mid, x1) - x0;
  if (wxs > 30) {
    for (let i = 0; i < 12; i++) {
      const x = x0 + 12 + hash(i, 5) * (wxs - 24), y = y0 + 12 + hash(i, 6) * (y1 - y0 - 24);
      wav += `<path class="${life ? 'in-wave' : ''}" style="${life ? `animation-delay:-${(hash(i, 7) * 3).toFixed(2)}s` : ''}" d="M${f(x)} ${f(y)} q6 -4.500 12 0 t12 0 t12 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linecap="round"/>`;
    }
  }
  const clips = `<defs><clipPath id="${id}s"><rect x="${f(x0 - 10)}" y="${f(y0 - 10)}" width="${f(Math.min(mid, x1) - x0 + 10)}" height="${f(y1 - y0 + 20)}"/></clipPath><clipPath id="${id}c"><path d="${d}"/></clipPath></defs>`;
  const frameLife = life ? [0, 1, 2].map(i => { const x = Math.max(mid, x0) + 30 + hash(i, 8) * Math.max(10, jxs - 60), y = i % 2 ? y1 - 22 : y0 + 22; return `<g transform="translate(${f(x)},${f(y)}) scale(1.1)">${palm()}</g>`; }).join('') : '';
  return `${DEFS}${clips}<g class="in-backdrop" pointer-events="none">
    <path d="${d}" fill="#0E2B18" stroke="#0E2B18" stroke-width="10" stroke-linejoin="round"/>
    <path d="${d}" fill="url(#in-p-jungleback)" stroke="#2A5A36" stroke-width="3" stroke-linejoin="round"/>
    ${leaf}${frameLife}
    <g clip-path="url(#${id}s)"><path d="${d}" fill="url(#in-p-sea)"/>${wav}</g>
    <path d="${coast}" fill="none" stroke="#D8C28A" stroke-width="5" stroke-linejoin="round" opacity=".85" clip-path="url(#${id}c)"/>
    <path d="${d}" fill="none" stroke="#C9A54B" stroke-width="1.600" stroke-linejoin="round" opacity=".7"/>
  </g>`;
}

// ------------------------------------------------------------ people, animals, plants
const man = (h, k, tool = '', { poncho, hat } = {}) => `
  <ellipse cy="1.200" rx="4.400" ry="1.400" fill="rgba(0,0,0,.25)"/>
  <rect x="-2.200" y="-3.200" width="1.900" height="4.200" rx=".6" fill="${SKIN[(h.id + k) % 4]}"/><rect x=".4" y="-3.200" width="1.900" height="4.200" rx=".6" fill="${SKIN[(h.id + k) % 4]}"/>
  <path d="M-4 -3.200 L-2.800 -9.800 H2.800 L4 -3.200 Z" fill="${poncho || WEAR[(h.id + k * 2) % 6]}" stroke="#4A2E18" stroke-width=".5" stroke-linejoin="round"/>
  <path d="M-4 -3.200 H4" stroke="rgba(255,255,255,.6)" stroke-width=".9"/>
  <circle cy="-11.900" r="2.600" fill="${SKIN[(h.id + k) % 4]}"/>
  <path d="M-2.800 -12.400 Q0 -17.200 2.800 -12.400 L3.600 -10.400 H2.600 L2.200 -12 H-2.200 L-2.600 -10.400 H-3.600 Z" fill="${hat || HAT[(h.id + k) % 4]}" stroke="#4A2E18" stroke-width=".4" stroke-linejoin="round"/>
  ${tool}`;

const llama = (h, k, tint = '#EFE4CF', load = '') => `<g><g class="hk-walk s" style="${delay({ id: h.id + k }, 13)}"><ellipse cy="1" rx="8" ry="2" fill="rgba(0,0,0,.22)"/>
  <g class="hk-leg b"><rect x="-5.500" y="-6" width="1.600" height="7" fill="#C9B79A"/></g><g class="hk-leg"><rect x="-3" y="-6" width="1.600" height="7" fill="#C9B79A"/></g>
  <ellipse cx="0" cy="-8" rx="7.400" ry="4.200" fill="${tint}" stroke="#7A6342" stroke-width=".8"/><path d="M-6 -10 q2 -2.400 4 0 t4 0 t4 0" fill="none" stroke="#C9B79A" stroke-width=".8"/>
  <g class="hk-leg"><rect x="2.800" y="-6" width="1.600" height="7" fill="#DCCFB5"/></g><g class="hk-leg b"><rect x="5" y="-6" width="1.600" height="7" fill="#DCCFB5"/></g>
  <path d="M5.500 -9.500 L7.200 -17 L9.600 -16.400 L8.200 -9.200 Z" fill="${tint}" stroke="#7A6342" stroke-width=".7" stroke-linejoin="round"/>
  <g class="hk-graze" style="${delay({ id: h.id + k }, 6)}"><ellipse cx="9.200" cy="-17.400" rx="3" ry="2" fill="${tint}" stroke="#7A6342" stroke-width=".7"/><path d="M8.400 -19.200 l-.4 -2.800 M10.200 -19 l.8 -2.600" stroke="${tint}" stroke-width="1.100" stroke-linecap="round"/><circle cx="10.200" cy="-17.600" r=".5" fill="#2B2018"/></g>
  <path d="M-1 -11.800 h3.600 v2.600 h-3.600z" fill="${WEAR[(h.id + k) % 6]}" stroke="#4A2E18" stroke-width=".4"/>${load}</g></g>`;

const palm = (c = '#2F9A4F') => `<g><ellipse cy="2" rx="6" ry="2" fill="rgba(0,0,0,.22)"/><path d="M0 2 Q2 -10 -1 -20" fill="none" stroke="#7A5A3A" stroke-width="2.600" stroke-linecap="round"/>
  <g class="in-frond"><path d="M-1 -20 Q-9 -24 -14 -17 Q-7 -19 -1 -20z M-1 -20 Q7 -25 13 -18 Q6 -19 -1 -20z M-1 -20 Q-4 -28 -10 -29 Q-5 -25 -1 -20z M-1 -20 Q3 -28 9 -29 Q4 -25 -1 -20z M-1 -20 Q0 -14 -5 -12 Q-1 -14 -1 -20z" fill="${c}" stroke="#14502A" stroke-width=".8" stroke-linejoin="round"/></g></g>`;
const broadleaf = (c = '#1F8A47') => `<g><ellipse cy="2" rx="7" ry="2" fill="rgba(0,0,0,.22)"/><rect x="-1.600" y="-9" width="3.200" height="11.400" fill="#6B4A2A"/><circle cx="-4.200" cy="-12" r="6.200" fill="${c}" stroke="#14502A" stroke-width=".9"/><circle cx="4.200" cy="-12" r="6.200" fill="${c}" stroke="#14502A" stroke-width=".9"/><circle cy="-17" r="6.400" fill="${c}" stroke="#14502A" stroke-width=".9"/>
  <path class="in-vine" d="M-6 -8 q-1 5 1 9 M5 -9 q1.600 5 -.4 10" fill="none" stroke="#3FA85A" stroke-width="1.100" stroke-linecap="round"/></g>`;
// a tall slim tree of the Andean forest (eucalyptus, queñua): the tall one sways, a felled one falls now and then
const tallTree = (c = '#2F7D4A') => `<rect x="-1.200" y="-6" width="2.400" height="9" fill="#6B4A2A"/><path d="M0 -26 C-6 -22 -8 -12 -6 -5 C-3 -2 3 -2 6 -5 C8 -12 6 -22 0 -26Z" fill="${c}" stroke="#14502A" stroke-width=".9" stroke-linejoin="round"/><path d="M0 -24 V-4 M-3 -15 L0 -11 M3 -17 L0 -13" stroke="rgba(255,255,255,.28)" stroke-width="1" fill="none"/>`;
const macaw = (h, k = 0, flip = false) => `<g transform="${flip ? 'scale(-1,1)' : ''}"><g class="in-bob" style="${delay({ id: h.id + k }, 4)}">
  <path d="M-1 -4 Q-9 2 -7 9 Q-4 5 -1 -1z" fill="#2B7BB9" stroke="#143A5E" stroke-width=".6" stroke-linejoin="round"/>
  <ellipse cx="0" cy="-3" rx="3.400" ry="5" fill="#D9262D" stroke="#7E1214" stroke-width=".7"/>
  <g class="in-wing"><path d="M-1 -5 Q5 -3 6 4 Q1 2 -1 -2z" fill="#F4C21F" stroke="#8C6A06" stroke-width=".6" stroke-linejoin="round"/><path d="M1 -2 Q4 0 5 3" stroke="#2B7BB9" stroke-width="1.200" fill="none" stroke-linecap="round"/></g>
  <circle cx="1.200" cy="-9" r="2.800" fill="#D9262D" stroke="#7E1214" stroke-width=".7"/><ellipse cx="2.200" cy="-9.400" rx="1.300" ry="1.500" fill="#fff"/><circle cx="2.500" cy="-9.400" r=".6" fill="#1F1610"/>
  <path d="M3.600 -10 q3 .6 2.400 3 q-1.400 -.2 -2.400 -1.400z" fill="#F0E6CE" stroke="#6B4A2A" stroke-width=".5"/></g></g>`;
const feather = (c1 = '#D9262D', c2 = '#F4C21F') => `<path d="M0 6 Q-3 -2 1 -9 Q5 -2 0 6z" fill="${c1}" stroke="#7E1214" stroke-width=".5"/><path d="M0 6 V-8" stroke="${c2}" stroke-width=".9"/>`;

const reedBoat = (h, k, c = '#D9C27A') => `<g><g class="in-boat" style="${delay({ id: h.id + k }, 5)}"><ellipse cy="4" rx="13" ry="2.800" fill="rgba(0,0,0,.18)"/>
  <path d="M-12 0 Q-13 -5 -9 -6 Q0 -9 9 -6 Q13 -5 12 0 Q0 5 -12 0z" fill="${c}" stroke="#7A6320" stroke-width="1" stroke-linejoin="round"/><path d="M-9 -3 Q0 -6 9 -3 M-8 0 Q0 3 8 0" fill="none" stroke="#A58B3A" stroke-width=".8"/>
  <g transform="translate(-1,-6)">${man({ id: h.id + k }, 2, `<g class="hk-arm cast"><line x1="2.200" y1="-8" x2="9" y2="-12" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/><path d="M8 -12.600 l5.600 -.4 l-1.200 6.400 l-4.600 -.4z" fill="rgba(235,245,250,.55)" stroke="#9FB8C4" stroke-width=".6"/><path d="M9.800 -12 v6 M11.600 -12.200 v6 M8.400 -9.400 h5" stroke="#9FB8C4" stroke-width=".4"/></g>`)}</g></g></g>`;
const fishRack = h => `<g><ellipse cy="1.400" rx="10" ry="2.200" fill="rgba(0,0,0,.18)"/><path d="M-8 1 V-14 M8 1 V-14 M-9 -13 H9" stroke="#6B4A2A" stroke-width="1.700" stroke-linecap="round" fill="none"/>
  ${[-5, 0, 5].map((x, i) => `<g class="hk-hide" style="animation-delay:-${i * .8}s"><path d="M${x} -13 q-2.200 5 0 9.400 q2.200 -4.400 0 -9.400z" fill="#9FB8C4" stroke="#4A6B7A" stroke-width=".6"/><path d="M${x} -4 l-1.600 2 M${x} -4 l1.600 2" stroke="#4A6B7A" stroke-width=".6"/></g>`).join('')}</g>`;
const gull = (h, k = 0) => `<g class="hk-circle" style="${delay({ id: h.id + k }, 9)}"><path d="M-5 0 q2.500 -3.400 5 0 q2.500 -3.400 5 0 q-2.500 1.600 -5 .8 q-2.500 .8 -5 -.8z" fill="#F4F4F0" stroke="#7A7A80" stroke-width=".5"/></g>`;
const wave = `<path class="in-wave" d="M-18 0 q4.500 -4 9 0 t9 0 t9 0 t9 0" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2" stroke-linecap="round"/>`;
const fishShape = (c = '#E8F4FA') => `<path d="M-5 0 c3 -3.500 7 -3.500 9 0 c-2 3.500 -6 3.500 -9 0 z M4 0 l3.500 -2.600 v5.200 z" fill="${c}" stroke="#4A7A90" stroke-width=".5"/><circle cx="-2.600" cy="-.4" r=".6" fill="#1F3A4A"/>`;

const terraceRows = (x, y, w = 36, c1 = '#8C7A44', c2 = '#A8D26A') => [0, 1, 2].map(i => `<path d="M${x + i * 3} ${y - i * 7} h${w - i * 6}" stroke="${c1}" stroke-width="2.200" stroke-linecap="round" opacity=".55"/><path d="M${x + i * 3 + 2} ${y - i * 7 - 2} h${w - i * 6 - 4}" stroke="${c2}" stroke-width="1.600" stroke-linecap="round" opacity=".7"/>`).join('');
const cocaBush = (h, k) => `<g><ellipse cy="1.400" rx="7" ry="2" fill="rgba(0,0,0,.18)"/><g class="in-frond"><path d="M-5 0 Q-6 -6 -3 -9 Q0 -6 0 0z M0 0 Q0 -8 3.600 -10.600 Q6 -6 5 0z M-2 0 Q-1 -12 1 -13 Q3 -8 2.200 0z" fill="#4FA84A" stroke="#1F5F2A" stroke-width=".7" stroke-linejoin="round"/>
  ${[0, 1, 2].map(i => `<circle cx="${-3 + i * 3}" cy="${-5 - (i % 2) * 3}" r=".9" fill="#E8453C"/>`).join('')}</g></g>`;
// a potato plant: leafy, with a purple flower
const potatoPlant = (c = '#4E9A45') => `<g><ellipse cy="1.400" rx="6" ry="1.800" fill="rgba(0,0,0,.16)"/><path d="M0 1 V-4 M0 -2 Q-6 -3 -7 -8 Q-2 -8 0 -4 M0 -2 Q6 -3 7 -8 Q2 -8 0 -4 M0 -4 Q-2 -10 0 -12 Q2 -10 0 -4" fill="${c}" stroke="#1F5F2A" stroke-width=".7" stroke-linejoin="round"/><circle cy="-12.600" r="1.700" fill="#B06AD0" stroke="#6A2A8A" stroke-width=".5"/><circle cy="-12.600" r=".6" fill="#F4D84A"/></g>`;
const potato = (x, y, r = 1) => `<ellipse cx="${x}" cy="${y}" rx="${2.400 * r}" ry="${1.800 * r}" transform="rotate(-20 ${x} ${y})" fill="#C9A06A" stroke="#7A5A30" stroke-width=".6"/><circle cx="${x - 0.6}" cy="${y - 0.4}" r=".4" fill="#7A5A30"/>`;
const ore = (c1, c2) => `<path d="M-4 0 l1.600 -4 l3 -1.400 l2.600 2.200 l1.200 3.200z" fill="${c1}" stroke="#3E454F" stroke-width=".7" stroke-linejoin="round"/><path d="M-2.400 -4 l3 -1.400 l1 3z" fill="${c2}" opacity=".85"/>`;
const mine = `<g><ellipse cy="2" rx="14" ry="3" fill="rgba(0,0,0,.25)"/><path d="M-13 1 C-13 -11 -7 -17 0 -17 C7 -17 13 -11 13 1 Z" fill="#5C5870" stroke="#2F2B40" stroke-width="1.200" stroke-linejoin="round"/><path d="M-7 1 V-8 Q0 -13 7 -8 V1 Z" fill="#1C1824"/><path d="M-9 1 V-9 M9 1 V-9 M-9 -9 Q0 -15 9 -9" fill="none" stroke="#8B6A3A" stroke-width="1.600" stroke-linecap="round"/>
  <g class="hk-glow"><circle cx="-2" cy="-3" r="1" fill="#F2C230"/><circle cx="2.600" cy="-5" r=".8" fill="#FFE08A"/></g></g>`;
const condor = (h, k = 0) => `<g class="hk-circle" style="${delay({ id: h.id + k }, 9)}"><path d="M-9 0 q4.500 -5 9 0 q4.500 -5 9 0 q-4.500 2.600 -9 1.200 q-4.500 1.400 -9 -1.200z" fill="#2B2B33" stroke="#111" stroke-width=".5"/><circle cx="0" cy="-1" r="1.400" fill="#F4F4F0"/></g>`;
const miner = (h, k) => `<g>${man(h, k, `<g class="hk-arm hit"><line x1="2.200" y1="-8" x2="7" y2="-12" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/><path d="M6 -14.600 l4 .6 l-.6 1.600 l-2.800 .2 l-.4 2.200 l-1.200 0z" fill="#8D96A3" stroke="#3E454F" stroke-width=".6"/></g>`)}
  <g class="lf-sparks" style="color:#FFE08A"><circle cx="8" cy="-8" r=".9" fill="currentColor" style="animation-delay:-.1s"/><circle cx="10" cy="-9.600" r=".7" fill="currentColor" style="animation-delay:-.6s"/></g></g>`;
const woodcutter = (h, k) => `<g class="lf-cutter">${man(h, k, `<g class="lf-axe" style="${delay(h, 1.1, 5)}"><line x1="1" y1="-4.600" x2="6.500" y2="-9.600" stroke="#7A4A23" stroke-width="1.300" stroke-linecap="round"/><path d="M5.400 -11.400 l3 .5 -.8 3.100 z" fill="#D5DADF" stroke="#7D858C" stroke-width=".4"/></g>`)}</g>`;
const chips = (h) => `<g class="lf-chips" style="${delay(h, 1.1, 5)}"><rect x="-3" y="-3" width="1.600" height="1.600" fill="#E8C48A"/><rect x="-5" y="-1" width="1.400" height="1.400" fill="#C9A26B"/></g>`;
const logs = n => ['<circle r="2.600" fill="#7A4A23"/><circle r="1.200" fill="#C9A26B"/>', '<circle cx="4.600" r="2.600" fill="#7A4A23"/><circle cx="4.600" r="1.200" fill="#C9A26B"/>', '<circle cx="2.300" cy="-3.900" r="2.600" fill="#7A4A23"/><circle cx="2.300" cy="-3.900" r="1.200" fill="#C9A26B"/>', '<circle cx="9.200" r="2.600" fill="#7A4A23"/><circle cx="9.200" r="1.200" fill="#C9A26B"/>'].slice(0, n).join('');
// Inca stonework: a block with the polygonal joints
const block = (w = 9, hgt = 6, c = '#B9B1A4') => `<path d="M${-w / 2} 0 L${-w / 2 + 1} ${-hgt} L${w / 2 - 1} ${-hgt - 0.6} L${w / 2} 0 Z" fill="${c}" stroke="#5E574C" stroke-width=".8" stroke-linejoin="round"/><path d="M${-w / 2 + 1} ${-hgt} L${w / 2 - 1} ${-hgt - 0.6} L${w / 2 - 2} ${-hgt + 1.600} L${-w / 2 + 2} ${-hgt + 1.600} Z" fill="rgba(255,255,255,.3)"/>`;
const stonecutter = (h, k) => `<g>${man(h, k, `<g class="hk-arm hit"><line x1="2.200" y1="-8" x2="7" y2="-11" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/><rect x="5.600" y="-14.200" width="4.600" height="3" rx=".6" fill="#8D96A3" stroke="#3E454F" stroke-width=".6"/></g>`, { poncho: '#B8662C', hat: '#E8E1CC' })}
  <g class="lf-sparks" style="color:#FFE08A"><circle cx="9" cy="-6" r=".9" fill="currentColor" style="animation-delay:-.2s"/><circle cx="11" cy="-7.500" r=".7" fill="currentColor" style="animation-delay:-.8s"/></g></g>`;
const farmer = (h, k) => `<g>${man(h, k, `<g class="hk-arm hit"><line x1="1.800" y1="-8" x2="8" y2="-9" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/><path d="M7 -22 L9.600 -3 M7.600 -9 H12" stroke="#6B4A2A" stroke-width="1.500" stroke-linecap="round" fill="none"/><path d="M9.600 -3 l1.800 3.400 l-3.600 0z" fill="#8D96A3"/></g>`, { poncho: '#7A4F9A' })}</g>`;
const picker = (h, k) => `<g>${man(h, k, `<g class="hk-arm pick"><line x1="2.200" y1="-8" x2="-3.600" y2="-15" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/></g><path d="M3 -4 h6 v5 h-6z" fill="#B98A4E" stroke="#6B4A2A" stroke-width=".6"/><path d="M3.600 -4 q2.400 -3 4.800 0" fill="#4FA84A"/>`)}</g>`;

const at = (cx, cy, x, y, inner, cls = '') => `<g transform="translate(${f(cx + x)},${f(cy + y)})"${cls ? ` class="${cls}"` : ''}>${inner}</g>`;
const mirror = (cx, on, out) => (on ? `<g transform="translate(${f(2 * cx)},0) scale(-1,1)">${out}</g>` : out);

// ------------------------------------------------------------ the scenes
export function tileLife(h, cx, cy, nth = 0, seed = 0) {
  const jit = (k, r) => Math.round((hash(h.id + seed % 7, k) - 0.5) * 2 * r);
  const v = nth % 3;
  switch (h.terrain) {
    case 'forest': // the forest of the highlands: tall trees, a woodcutter and the logs, a llama carrying timber
      return mirror(cx, v === 1, at(cx, cy, -32 + jit(1, 2), 14 + jit(2, 3), tallTree(['#2F7D4A', '#3E8A3A', '#2A7060'][v]), 'lf-static') + at(cx, cy, 34, 8 + jit(3, 3), `<g transform="scale(.85)">${tallTree(['#3E8A3A', '#2F7D4A', '#4A8F3C'][v])}</g>`, 'lf-static')
        + at(cx, cy, 20, 31, `<g transform="scale(.8)"><g class="lf-tree" style="${delay(h, 9, 6)}">${tallTree('#2F7D4A')}</g></g>${chips(h)}`) + at(cx, cy, 10, 38, woodcutter(h, 1))
        + at(cx, cy, -14, 38, logs(3), 'lf-static') + at(cx, cy, -27 + jit(4, 2), 34, `<g transform="scale(.82)">${llama(h, 2, '#E3D3B5', '<rect x="-5" y="-14" width="10" height="3" rx="1.400" fill="#7A4A23" stroke="#4A2E18" stroke-width=".5"/>')}</g>`));
    case 'hills': // the quarry: cut blocks, a stonecutter, a llama hauling a block
      return mirror(cx, v === 2, at(cx, cy, -33, 8, `<path d="M-6 22 L-5 -2 L0 -10 L8 -6 L9 22 Z" fill="#B9B1A4" stroke="#5E574C" stroke-width="1" stroke-linejoin="round"/><path d="M-5.500 6 H8.500 M-5 -2 H4 M2 -2 V6 M-1 6 V14 M5 14 V22 M-5.500 14 H9" stroke="#6E675B" stroke-width=".8" fill="none"/>`, 'lf-static')
        + at(cx, cy, -20 + jit(1, 2), 38, block(11, 7) + at(0, 0, 10, 0, block(8, 5, '#CFC8BA')), 'lf-static') + at(cx, cy, 28, 34, stonecutter(h, 3)) + at(cx, cy, 16, 28, block(9, 6, '#CFC8BA'), 'lf-static')
        + at(cx, cy, 2, 41, `<g transform="scale(.8)">${llama(h, 4, '#D8C3A0', `<g transform="translate(0,-14)">${block(9, 5, '#C4BCAE')}</g>`)}</g>`));
    case 'pasture': // the highlands: llamas and alpacas on terraces
      return mirror(cx, v === 1, `<g class="lf-static">${terraceRows(cx - 44, cy + 40, 34)}</g>` + at(cx, cy, -29 + jit(1, 2), 24, llama(h, 1)) + at(cx, cy, 8 + jit(2, 3), 38, llama(h, 2, '#D8C3A0'))
        + at(cx, cy, 32, 12 + jit(3, 3), llama(h, 3, '#C9B79A')) + at(cx, cy, 34, 36, man(h, 5, '<line x1="3" y1="-8" x2="7" y2="-17" stroke="#6B4A2A" stroke-width="1.300" stroke-linecap="round"/>')));
    case 'mountains': // the peaks: a mine, a miner chipping ore, a condor
      return mirror(cx, v === 1, at(cx, cy, -29 + jit(1, 2), 24, mine) + at(cx, cy, -9, 34, miner(h, 1)) + at(cx, cy, 28, 30 + jit(2, 3), ore('#C98A5A', '#E8B890') + `<g class="in-glint" style="${delay(h, 3, 8)}"><path d="M0 -6 l1 -3 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1z" fill="#FFF6C8"/></g>`) + at(cx, cy, 36, 36, ore('#A9B6C4', '#DDE6EE'))
        + at(cx, cy, 30, 8, v === 2 ? llama(h, 5, '#E3D3B5') : '') + at(cx, cy, 6, -12, condor(h)));
    case 'fields': // the terraced fields: potato plants in rows, a farmer with the foot plough, a basket of potatoes
      return mirror(cx, v === 2, `<g class="lf-static">${terraceRows(cx - 46, cy + 36, 38, '#8A6A34', '#D9B45A')}</g>`
        + `<g class="lf-wheat a" style="${delay(h, 3, 9)}">${[-32, -22, -12].map((x, i) => at(cx, cy, x, 22 + i * 2, potatoPlant(i % 2 ? '#4E9A45' : '#5BAA4C'))).join('')}</g>`
        + `<g class="lf-wheat b" style="${delay(h, 3, 10)}">${[24, 33].map((x, i) => at(cx, cy, x, 10 + i * 4, potatoPlant('#4E9A45'))).join('')}</g>`
        + at(cx, cy, 24, 36, farmer(h, 2)) + at(cx, cy, -22, 40, `<path d="M-6 0 Q-6 -7 0 -7 Q6 -7 6 0 Z" fill="#B98A4E" stroke="#6B4A2A" stroke-width=".8"/>${potato(-2, -8)}${potato(2, -9)}${potato(0, -10.500, .9)}`, 'lf-static')
        + at(cx, cy, 4, 41, `<g transform="scale(.7)">${v === 1 ? llama(h, 6, '#D8C3A0') : ''}</g>`) + at(cx, cy, 33, -14, `<g class="lf-crow" style="${delay(h, 6)}"><path d="M-3 0 q3 -4 6 0 q-3 1.600 -6 0z" fill="#2B2B2B"/></g>`));
    case 'coast': // the Pacific: a fisherman in a reed boat, jumping fish, a shoal, gulls
      return mirror(cx, v === 1, at(cx, cy, -29 + jit(1, 2), 29, `${wave}`, 'lf-static') + at(cx, cy, -27, 28, reedBoat(h, 1))
        + at(cx, cy, 24, 34, wave, 'lf-static') + at(cx, cy, 28 + jit(2, 2), -10, `<g class="lf-fish" style="${delay(h, 7, 4)}">${fishShape()}</g><ellipse class="lf-splash" style="${delay(h, 7, 4)}" cy="4" rx="6" ry="1.600" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1"/>`)
        + at(cx, cy, -30, -14, `<g class="lf-fish" style="${delay(h, 7, 11)}">${fishShape('#F4E4C0')}</g><ellipse class="lf-splash" style="${delay(h, 7, 11)}" cy="4" rx="5" ry="1.400" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1"/>`)
        + [0, 1, 2].map(i => at(cx, cy, 14 + i * 6, 31 + (i % 2) * 4, `<g class="in-bob" style="${delay(h, 4, 12 + i)}"><g transform="scale(.55)">${fishShape('#BFE0EE')}</g></g>`)).join('')
        + at(cx, cy, 4, -4, gull(h)) + at(cx, cy, 6, 38, `<g transform="translate(-12,0)">${wave}</g>`, 'lf-static'));
    case 'plantation': // the jungle plantation: coca bushes in rows, a picker, hanging vines
      return mirror(cx, v === 2, at(cx, cy, -31, 20, cocaBush(h, 1)) + at(cx, cy, -31, 34, cocaBush(h, 2)) + at(cx, cy, 31, 14, cocaBush(h, 3)) + at(cx, cy, 33, 27, cocaBush(h, 4))
        + at(cx, cy, 22, 39, picker(h, 2)) + at(cx, cy, -14, 40, `<path d="M-7 0 h14 l-1.500 -4 h-11z" fill="#8A5A2A" stroke="#4A2E18" stroke-width=".7"/><path d="M-5 -4 q5 -4 10 0" fill="#4FA84A" stroke="#1F5F2A" stroke-width=".6"/>`, 'lf-static')
        + at(cx, cy, -26, -24, `<path class="in-vine" d="M0 0 q-2 8 1 15 M5 0 q2 6 0 11" fill="none" stroke="#3FA85A" stroke-width="1.600" stroke-linecap="round"/>`) + at(cx, cy, 26, -24, `<path class="in-vine" d="M0 0 q2 8 -1 14" fill="none" stroke="#3FA85A" stroke-width="1.600" stroke-linecap="round"/>`)
        + at(cx, cy, 4, 41, v === 1 ? macaw(h, 3) : '', ''));
    case 'jungle': // the rainforest: palms, macaws, a drifting feather
      return mirror(cx, v === 2, at(cx, cy, -33 + jit(1, 2), 10 + jit(2, 3), v === 1 ? broadleaf() : palm(), 'lf-static') + at(cx, cy, 33, 6 + jit(3, 3), `<g transform="scale(.9)">${v === 0 ? broadleaf('#2A9A52') : palm('#27904A')}</g>`)
        + at(cx, cy, -24, 34, macaw(h, 1)) + at(cx, cy, 26, 36, macaw(h, 2, true)) + at(cx, cy, 2, 40, `<g class="hk-tumble" style="${delay(h, 9, 14)}">${feather()}</g>`)
        + at(cx, cy, 28, -22, `<g transform="scale(.8)" class="lf-static">${feather('#2B7BB9', '#F4C21F')}</g>`));
    case 'frame': // the jungle of the frame: dense plants, fireflies, a stone idol
      return at(cx, cy, -22, 12, `<g transform="scale(1.100)">${broadleaf('#1F7A40')}</g>`, 'lf-static') + at(cx, cy, 22, 14, `<g transform="scale(1.100)">${palm('#238A44')}</g>`, 'lf-static')
        + at(cx, cy, 0, 28, `<path d="M-6 6 V-4 Q0 -10 6 -4 V6 Z" fill="#7C7468" stroke="#3A342C" stroke-width=".9"/><circle cx="-2" cy="-2" r=".9" fill="#2B2620"/><circle cx="2" cy="-2" r=".9" fill="#2B2620"/><path d="M-2 2 H2" stroke="#2B2620" stroke-width=".8"/>`, 'lf-static')
        + [[-30, -8, 1], [30, -10, 2], [-12, -22, 3], [14, -24, 4]].map(([x, y, k]) => at(cx, cy, x, y, `<g class="hk-point" style="${delay(h, 5, 20 + k)}"><circle r="1.600" fill="#E8F58A"/><circle r="3.400" fill="#E8F58A" opacity=".25"/></g>`)).join('');
    default: return '';
  }
}

// ------------------------------------------------------------ huts, temples and the thickets of a tribe in decline
export const CAMP_D = 'M-10 11 V1 L0 -13 L10 1 V11 Z';
export const TEMPLE_D = 'M-16 12 V6 H-12 V0 H-7 V-6 H-2 V-13 H5 V-6 H10 V0 H16 V12 Z';
export const shape = type => (type === 'city' ? TEMPLE_D : CAMP_D);
function house(b, color) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  if (b.type === 'city') {
    return `<path d="${TEMPLE_D}" fill="#C9B78F" stroke="#5E4A2A" stroke-width="2.200" stroke-linejoin="round"/>
      <path d="M-16 6 H-12 M-12 0 H-7 M-7 -6 H-2 M5 -6 H10 M10 0 H16" stroke="#5E4A2A" stroke-width="1" opacity=".5"/>
      <path d="M-2 -13 H5 V-8 H-2z" fill="${c}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/>
      <path d="M-3.600 12 V5 H4.400 V12z" fill="#3A2A1C"/><path d="M-1.600 12 V7 H2.400 V12z" fill="${d}" opacity=".6"/>
      <path d="M1.400 -13 V-19" stroke="#5A3A1C" stroke-width="1.400" stroke-linecap="round"/><path class="${b.decline ? '' : 'in-flag'}" d="M1.400 -19 L9 -17 L1.400 -15z" fill="${c}" stroke="${d}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M-12 12 V9 H-9 V12 M9 12 V9 H12 V12" fill="${d}" opacity=".4"/>`;
  }
  return `<path d="M-10 11 V1 L0 -13 L10 1 V11 Z" fill="${c}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round"/>
    <path d="M-10 1 L0 -13 L10 1" fill="#D9B968" stroke="#7A5A1E" stroke-width="2" stroke-linejoin="round"/><path d="M-6 -4 L-3.600 -1 M-1 -9 L1.600 -3 M4 -5 L6.400 -1" stroke="#7A5A1E" stroke-width="1" opacity=".6"/>
    <path d="M-3 11 V5 Q0 2 3 5 V11 Z" fill="${d}" opacity=".6"/>`;
}
// a tangle of jungle that covers a building
function thicketOn(city) {
  const w = city ? 20 : 14;
  const leaf = (x, y, r, a, c = '#2F9A4F') => `<path d="M${x} ${y} q${r * 0.7} ${-r} ${r * 1.6} ${-r * 0.2} q${-r * 0.7} ${r} ${-r * 1.6} ${r * 0.2}z" transform="rotate(${a} ${x} ${y})" fill="${c}" stroke="#14502A" stroke-width=".7" stroke-linejoin="round"/>`;
  return `<g class="in-thicket"><ellipse cy="2" rx="${w + 3}" ry="${city ? 15 : 14}" fill="rgba(14,52,26,.55)"/>
    <g class="in-vine"><path d="M${-w} 10 Q${-w * 0.4} -12 0 -2 T${w} 10" fill="none" stroke="#14502A" stroke-width="4.600" stroke-linecap="round"/><path d="M${-w} 10 Q${-w * 0.4} -12 0 -2 T${w} 10" fill="none" stroke="#3FA85A" stroke-width="2.800" stroke-linecap="round"/></g>
    <g class="in-vine"><path d="M${-w * 0.7} 11 Q${-w * 0.2} -4 ${w * 0.3} -10 T${w * 0.8} 9" fill="none" stroke="#14502A" stroke-width="4" stroke-linecap="round"/><path d="M${-w * 0.7} 11 Q${-w * 0.2} -4 ${w * 0.3} -10 T${w * 0.8} 9" fill="none" stroke="#2F9A4F" stroke-width="2.400" stroke-linecap="round"/></g>
    ${leaf(-w + 2, 4, 6, -40)}${leaf(-4, -8, 7, 10, '#38A85A')}${leaf(w - 3, 2, 7, 35)}${leaf(2, 8, 6, 100, '#38A85A')}${leaf(-w * 0.5, 9, 5, 150)}${leaf(w * 0.5, -6, 5, -20, '#38A85A')}
    <path d="M-5 -10 l2.400 -6 l2.400 6z M6 -5 l2 -5 l2 5z" fill="#7A3A1E" stroke="#3A1A0E" stroke-width=".6" stroke-linejoin="round"/></g>`;
}
export function building(b, color) {
  if (!b.decline) return house(b, color);
  return `<g opacity=".5">${house(b, color)}</g>${thicketOn(b.type === 'city')}`;
}
