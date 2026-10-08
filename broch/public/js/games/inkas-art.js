// Rise of the Inkas: the Andean look of the board. Tile scenes (fishermen in reed boats, macaws, llamas on terraces,
// gold miners and condors, Nazca lines), huts and temples instead of houses, and the thickets that the jungle sends
// over the land. Every scene loops on the living board (CSS classes in-* and the shared hk-* ones in styles.css).
import { PCOLOR, PCOLOR_DARK } from '../core.js';

const f = n => n.toFixed(1);
const hash = (id, k) => { const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const delay = (h, span, k = 3) => `animation-delay:-${(hash(h.id, k) * span).toFixed(2)}s`;
const SKIN = ['#C98A5E', '#B9794C', '#D79A6B', '#A8683E'];
const WEAR = ['#C1272D', '#2B7BB9', '#E8B23A', '#7A4F9A', '#2E8A57', '#D9631E'];
const HAT = ['#E8B23A', '#C1272D', '#2B7BB9', '#E8E1CC'];

export const TERRAIN_COLOR = { fields: '#A9DACF', forest: '#2E7D4B', pasture: '#8EB369', hills: '#B8A56F', mountains: '#7D7A93', desert: '#E8CE96' };
export const TERRAIN_GLYPH = { fields: 'catch', forest: 'feather', pasture: 'coca', hills: 'coca', mountains: 'nugget' };

const man = (h, k, tool = '', { poncho, hat } = {}) => `
  <ellipse cy="1.200" rx="4.400" ry="1.400" fill="rgba(0,0,0,.25)"/>
  <rect x="-2.200" y="-3.200" width="1.900" height="4.200" rx=".6" fill="${SKIN[(h.id + k) % 4]}"/><rect x=".4" y="-3.200" width="1.900" height="4.200" rx=".6" fill="${SKIN[(h.id + k) % 4]}"/>
  <path d="M-4 -3.200 L-2.800 -9.800 H2.800 L4 -3.200 Z" fill="${poncho || WEAR[(h.id + k * 2) % 6]}" stroke="#4A2E18" stroke-width=".5" stroke-linejoin="round"/>
  <path d="M-4 -3.200 H4" stroke="rgba(255,255,255,.6)" stroke-width=".9"/>
  <circle cy="-11.900" r="2.600" fill="${SKIN[(h.id + k) % 4]}"/>
  <path d="M-2.800 -12.400 Q0 -17.200 2.800 -12.400 L3.600 -10.400 H2.600 L2.200 -12 H-2.200 L-2.600 -10.400 H-3.600 Z" fill="${hat || HAT[(h.id + k) % 4]}" stroke="#4A2E18" stroke-width=".4" stroke-linejoin="round"/>
  ${tool}`;

const llama = (h, k, tint = '#EFE4CF') => `<g><g class="hk-walk s" style="${delay({ id: h.id + k }, 13)}"><ellipse cy="1" rx="8" ry="2" fill="rgba(0,0,0,.22)"/>
  <g class="hk-leg b"><rect x="-5.500" y="-6" width="1.600" height="7" fill="#C9B79A"/></g><g class="hk-leg"><rect x="-3" y="-6" width="1.600" height="7" fill="#C9B79A"/></g>
  <ellipse cx="0" cy="-8" rx="7.400" ry="4.200" fill="${tint}" stroke="#7A6342" stroke-width=".8"/><path d="M-6 -10 q2 -2.400 4 0 t4 0 t4 0" fill="none" stroke="#C9B79A" stroke-width=".8"/>
  <g class="hk-leg"><rect x="2.800" y="-6" width="1.600" height="7" fill="#DCCFB5"/></g><g class="hk-leg b"><rect x="5" y="-6" width="1.600" height="7" fill="#DCCFB5"/></g>
  <path d="M5.500 -9.500 L7.200 -17 L9.600 -16.400 L8.200 -9.200 Z" fill="${tint}" stroke="#7A6342" stroke-width=".7" stroke-linejoin="round"/>
  <g class="hk-graze" style="${delay({ id: h.id + k }, 6)}"><ellipse cx="9.200" cy="-17.400" rx="3" ry="2" fill="${tint}" stroke="#7A6342" stroke-width=".7"/><path d="M8.400 -19.200 l-.4 -2.800 M10.200 -19 l.8 -2.600" stroke="${tint}" stroke-width="1.100" stroke-linecap="round"/><circle cx="10.200" cy="-17.600" r=".5" fill="#2B2018"/></g>
  <path d="M-1 -11.800 h3.600 v2.600 h-3.600z" fill="${WEAR[(h.id + k) % 6]}" stroke="#4A2E18" stroke-width=".4"/></g></g>`;

const palm = (c = '#2F9A4F') => `<g><ellipse cy="2" rx="6" ry="2" fill="rgba(0,0,0,.22)"/><path d="M0 2 Q2 -10 -1 -20" fill="none" stroke="#7A5A3A" stroke-width="2.600" stroke-linecap="round"/>
  <g class="in-frond"><path d="M-1 -20 Q-9 -24 -14 -17 Q-7 -19 -1 -20z M-1 -20 Q7 -25 13 -18 Q6 -19 -1 -20z M-1 -20 Q-4 -28 -10 -29 Q-5 -25 -1 -20z M-1 -20 Q3 -28 9 -29 Q4 -25 -1 -20z M-1 -20 Q0 -14 -5 -12 Q-1 -14 -1 -20z" fill="${c}" stroke="#14502A" stroke-width=".8" stroke-linejoin="round"/></g></g>`;
const broadleaf = (c = '#1F8A47') => `<g><ellipse cy="2" rx="7" ry="2" fill="rgba(0,0,0,.22)"/><rect x="-1.600" y="-9" width="3.200" height="11.400" fill="#6B4A2A"/><circle cx="-4.200" cy="-12" r="6.200" fill="${c}" stroke="#14502A" stroke-width=".9"/><circle cx="4.200" cy="-12" r="6.200" fill="${c}" stroke="#14502A" stroke-width=".9"/><circle cy="-17" r="6.400" fill="${c}" stroke="#14502A" stroke-width=".9"/>
  <path class="in-vine" d="M-6 -8 q-1 5 1 9 M5 -9 q1.600 5 -.4 10" fill="none" stroke="#3FA85A" stroke-width="1.100" stroke-linecap="round"/></g>`;
const macaw = (h, k = 0, flip = false) => `<g transform="${flip ? 'scale(-1,1)' : ''}"><g class="in-bob" style="${delay({ id: h.id + k }, 4)}">
  <path d="M-1 -4 Q-9 2 -7 9 Q-4 5 -1 -1z" fill="#2B7BB9" stroke="#143A5E" stroke-width=".6" stroke-linejoin="round"/>
  <ellipse cx="0" cy="-3" rx="3.400" ry="5" fill="#D9262D" stroke="#7E1214" stroke-width=".7"/>
  <g class="in-wing"><path d="M-1 -5 Q5 -3 6 4 Q1 2 -1 -2z" fill="#F4C21F" stroke="#8C6A06" stroke-width=".6" stroke-linejoin="round"/><path d="M1 -2 Q4 0 5 3" stroke="#2B7BB9" stroke-width="1.200" fill="none" stroke-linecap="round"/></g>
  <circle cx="1.200" cy="-9" r="2.800" fill="#D9262D" stroke="#7E1214" stroke-width=".7"/><ellipse cx="2.200" cy="-9.400" rx="1.300" ry="1.500" fill="#fff"/><circle cx="2.500" cy="-9.400" r=".6" fill="#1F1610"/>
  <path d="M3.600 -10 q3 .6 2.400 3 q-1.400 -.2 -2.400 -1.400z" fill="#F0E6CE" stroke="#6B4A2A" stroke-width=".5"/></g></g>`;

const reedBoat = (h, k, c = '#D9C27A') => `<g><g class="in-boat" style="${delay({ id: h.id + k }, 5)}"><ellipse cy="4" rx="13" ry="2.800" fill="rgba(0,0,0,.18)"/>
  <path d="M-12 0 Q-13 -5 -9 -6 Q0 -9 9 -6 Q13 -5 12 0 Q0 5 -12 0z" fill="${c}" stroke="#7A6320" stroke-width="1" stroke-linejoin="round"/><path d="M-9 -3 Q0 -6 9 -3 M-8 0 Q0 3 8 0" fill="none" stroke="#A58B3A" stroke-width=".8"/>
  <g transform="translate(-1,-6)">${man({ id: h.id + k }, 2, `<g class="hk-arm cast"><line x1="2.200" y1="-8" x2="9" y2="-12" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/><path d="M8 -12.600 l5.600 -.4 l-1.200 6.400 l-4.600 -.4z" fill="rgba(235,245,250,.55)" stroke="#9FB8C4" stroke-width=".6"/><path d="M9.800 -12 v6 M11.600 -12.200 v6 M8.400 -9.400 h5" stroke="#9FB8C4" stroke-width=".4"/></g>`)}</g></g></g>`;
const fishRack = h => `<g><ellipse cy="1.400" rx="10" ry="2.200" fill="rgba(0,0,0,.18)"/><path d="M-8 1 V-14 M8 1 V-14 M-9 -13 H9" stroke="#6B4A2A" stroke-width="1.700" stroke-linecap="round" fill="none"/>
  ${[-5, 0, 5].map((x, i) => `<g class="hk-hide" style="animation-delay:-${i * .8}s"><path d="M${x} -13 q-2.200 5 0 9.400 q2.200 -4.400 0 -9.400z" fill="#9FB8C4" stroke="#4A6B7A" stroke-width=".6"/><path d="M${x} -4 l-1.600 2 M${x} -4 l1.600 2" stroke="#4A6B7A" stroke-width=".6"/></g>`).join('')}</g>`;
const gull = (h, k = 0) => `<g class="hk-circle" style="${delay({ id: h.id + k }, 9)}"><path d="M-5 0 q2.500 -3.400 5 0 q2.500 -3.400 5 0 q-2.500 1.600 -5 .8 q-2.500 .8 -5 -.8z" fill="#F4F4F0" stroke="#7A7A80" stroke-width=".5"/></g>`;
const wave = `<path class="in-wave" d="M-18 0 q4.500 -4 9 0 t9 0 t9 0 t9 0" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2" stroke-linecap="round"/>`;

const terraceRows = (x, y, w = 36) => [0, 1, 2].map(i => `<path d="M${x + i * 3} ${y - i * 7} h${w - i * 6}" stroke="#8C7A44" stroke-width="2.200" stroke-linecap="round" opacity=".55"/><path d="M${x + i * 3 + 2} ${y - i * 7 - 2} h${w - i * 6 - 4}" stroke="#A8D26A" stroke-width="1.600" stroke-linecap="round" opacity=".7"/>`).join('');
const cocaBush = (h, k) => `<g><ellipse cy="1.400" rx="7" ry="2" fill="rgba(0,0,0,.18)"/><path d="M-5 0 Q-6 -6 -3 -9 Q0 -6 0 0z M0 0 Q0 -8 3.600 -10.600 Q6 -6 5 0z M-2 0 Q-1 -12 1 -13 Q3 -8 2.200 0z" fill="#4FA84A" stroke="#1F5F2A" stroke-width=".7" stroke-linejoin="round"/>
  ${[0, 1, 2].map(i => `<circle cx="${-3 + i * 3}" cy="${-5 - (i % 2) * 3}" r=".9" fill="#E8453C"/>`).join('')}</g>`;
const nugget = (h, k) => `<g><ellipse cy="1.200" rx="6" ry="1.800" fill="rgba(0,0,0,.2)"/><path d="M-4 0 l1.600 -4 l3 -1 l2.400 2 l1.200 3z" fill="#F2C230" stroke="#9C6B06" stroke-width=".7" stroke-linejoin="round"/><path class="in-glint" d="M-1 -4 l1 -3 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1z" fill="#FFF6C8" style="${delay({ id: h.id + k }, 3)}"/></g>`;
const mine = `<g><ellipse cy="2" rx="14" ry="3" fill="rgba(0,0,0,.25)"/><path d="M-13 1 C-13 -11 -7 -17 0 -17 C7 -17 13 -11 13 1 Z" fill="#5C5870" stroke="#2F2B40" stroke-width="1.200" stroke-linejoin="round"/><path d="M-7 1 V-8 Q0 -13 7 -8 V1 Z" fill="#1C1824"/><path d="M-9 1 V-9 M9 1 V-9 M-9 -9 Q0 -15 9 -9" fill="none" stroke="#8B6A3A" stroke-width="1.600" stroke-linecap="round"/>
  <g class="hk-glow"><circle cx="-2" cy="-3" r="1" fill="#F2C230"/><circle cx="2.600" cy="-5" r=".8" fill="#FFE08A"/></g></g>`;
const condor = (h, k = 0) => `<g class="hk-circle" style="${delay({ id: h.id + k }, 9)}"><path d="M-9 0 q4.500 -5 9 0 q4.500 -5 9 0 q-4.500 2.600 -9 1.200 q-4.500 1.400 -9 -1.200z" fill="#2B2B33" stroke="#111" stroke-width=".5"/><circle cx="0" cy="-1" r="1.400" fill="#F4F4F0"/></g>`;
const miner = (h, k) => `<g>${man(h, k, `<g class="hk-arm hit"><line x1="2.200" y1="-8" x2="7" y2="-12" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/><path d="M6 -14.600 l4 .6 l-.6 1.600 l-2.800 .2 l-.4 2.200 l-1.200 0z" fill="#8D96A3" stroke="#3E454F" stroke-width=".6"/></g>`)}
  <g class="lf-sparks" style="color:#FFE08A"><circle cx="8" cy="-8" r=".9" fill="currentColor" style="animation-delay:-.1s"/><circle cx="10" cy="-9.600" r=".7" fill="currentColor" style="animation-delay:-.6s"/></g></g>`;

// the Nazca lines: a hummingbird that draws itself into the sand
const nazca = h => `<g><path class="in-draw" d="M-14 6 L-3 6 L2 -2 L9 -9 L15 -13 M2 -2 L8 3 L15 4 M-3 6 L-9 11 M-14 6 L-17 2 M-14 6 L-18 9" fill="none" stroke="#8A6A3A" stroke-width="1.500" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" opacity=".85"/><circle cx="16" cy="-14" r="1.600" fill="#8A6A3A"/></g>`;
const cactus = `<g><ellipse cy="1.400" rx="5" ry="1.600" fill="rgba(0,0,0,.2)"/><path d="M-1.600 1 V-12 Q0 -14.600 1.600 -12 V1 Z M-1.600 -5 H-5 V-9 M1.600 -7 H5 V-11" fill="#58A05A" stroke="#245A2A" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round"/></g>`;

const at = (cx, cy, x, y, inner, cls = '') => `<g transform="translate(${f(cx + x)},${f(cy + y)})"${cls ? ` class="${cls}"` : ''}>${inner}</g>`;
const mirror = (cx, on, out) => (on ? `<g transform="translate(${f(2 * cx)},0) scale(-1,1)">${out}</g>` : out);

// ------------------------------------------------------------ the scenes
export function tileLife(h, cx, cy, nth = 0, seed = 0) {
  const jit = (k, r) => Math.round((hash(h.id + seed % 7, k) - 0.5) * 2 * r);
  const v = nth % 3;
  switch (h.terrain) {
    case 'fields': // the coast: a fisherman in a reed boat, a drying rack, gulls
      return mirror(cx, v === 1, at(cx, cy, -29 + jit(1, 2), 30, `${wave}`, 'lf-static') + at(cx, cy, -28, 28, reedBoat(h, 1))
        + at(cx, cy, 31, 34 + jit(2, 2), fishRack(h)) + at(cx, cy, 32, 8, v === 2 ? man(h, 4, '<line x1="3" y1="-8" x2="9" y2="-17" stroke="#6B4A2A" stroke-width="1.200" stroke-linecap="round"/><path d="M8.200 -16.600 l2 -3.600 l1.400 3.600z" fill="#9AA4B2"/>') : `<g transform="scale(.9)">${cactus}</g>`)
        + at(cx, cy, 4, -4, gull(h)) + at(cx, cy, 6, 38, `<g transform="translate(-12,0)">${wave}</g>`, 'lf-static'));
    case 'forest': // the rainforest: palms, broadleaf trees with swinging vines, a macaw
      return mirror(cx, v === 2, at(cx, cy, -33 + jit(1, 2), 10 + jit(2, 3), v === 1 ? broadleaf() : palm(), 'lf-static') + at(cx, cy, 33, 6 + jit(3, 3), `<g transform="scale(.9)">${v === 0 ? broadleaf('#2A9A52') : palm('#27904A')}</g>`)
        + at(cx, cy, -24, 34, macaw(h, 1)) + at(cx, cy, 26, 36, v === 2 ? man(h, 3, '<g class="hk-arm pick"><line x1="2.200" y1="-8" x2="-3" y2="-15" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/></g>') : macaw(h, 2, true))
        + at(cx, cy, 2, 40, `<path d="M-4 0 q2 -7 4 -9 q2 2 3.600 9" fill="#E8453C" stroke="#7E1214" stroke-width=".6"/><path d="M-1 -2 l-4 -3 M1 -2 l4 -3" stroke="#2B7BB9" stroke-width="1.200" stroke-linecap="round"/>`, 'lf-static'));
    case 'pasture': // the highlands: llamas and a herder on terraces
      return mirror(cx, v === 1, `<g class="lf-static">${terraceRows(cx - 44, cy + 40, 34)}</g>` + at(cx, cy, -29 + jit(1, 2), 24, llama(h, 1)) + at(cx, cy, 8 + jit(2, 3), 38, llama(h, 2, '#D8C3A0'))
        + at(cx, cy, 32, 12 + jit(3, 3), llama(h, 3, '#C9B79A')) + at(cx, cy, 34, 36, man(h, 5, '<line x1="3" y1="-8" x2="7" y2="-17" stroke="#6B4A2A" stroke-width="1.300" stroke-linecap="round"/>')));
    case 'hills': // terraced slopes where coca is picked
      return mirror(cx, v === 2, `<g class="lf-static">${terraceRows(cx - 46, cy + 34, 36)}${terraceRows(cx + 8, cy + 12, 36)}</g>` + at(cx, cy, -30, 24 + jit(1, 2), cocaBush(h, 1)) + at(cx, cy, 31, 16, cocaBush(h, 2))
        + at(cx, cy, -12, 38, man(h, 2, '<g class="hk-arm pick"><line x1="2.200" y1="-8" x2="-3.600" y2="-15" stroke="#C98A5E" stroke-width="1.500" stroke-linecap="round"/></g><path d="M3 -4 h5 v4 h-5z" fill="#B98A4E" stroke="#6B4A2A" stroke-width=".6"/>'))
        + at(cx, cy, 26, 38, v === 1 ? llama(h, 4) : cocaBush(h, 3)));
    case 'mountains': // the peaks: a mine, a miner chipping gold, a condor
      return mirror(cx, v === 1, at(cx, cy, -29 + jit(1, 2), 24, mine) + at(cx, cy, -9, 34, miner(h, 1)) + at(cx, cy, 28, 30 + jit(2, 3), nugget(h, 1)) + at(cx, cy, 36, 36, nugget(h, 2))
        + at(cx, cy, 30, 8, v === 2 ? llama(h, 5, '#E3D3B5') : '') + at(cx, cy, 6, -12, condor(h)));
    case 'desert': // the Nazca lines
      return at(cx, cy, -14, 30, nazca(h)) + at(cx, cy, 33, 14, cactus) + at(cx, cy, -33, 14, `<g transform="scale(.8)">${cactus}</g>`);
    default: return '';
  }
}

// ------------------------------------------------------------ huts and temples
export const CAMP_D = 'M-10 11 V1 L0 -13 L10 1 V11 Z';
export const TEMPLE_D = 'M-16 12 V6 H-12 V0 H-7 V-6 H-2 V-13 H5 V-6 H10 V0 H16 V12 Z';
export const shape = type => (type === 'city' ? TEMPLE_D : CAMP_D);
export function building(b, color) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  if (b.type === 'city') {
    return `<path d="${TEMPLE_D}" fill="#C9B78F" stroke="#5E4A2A" stroke-width="2.200" stroke-linejoin="round"/>
      <path d="M-16 6 H-12 M-12 0 H-7 M-7 -6 H-2 M5 -6 H10 M10 0 H16" stroke="#5E4A2A" stroke-width="1" opacity=".5"/>
      <path d="M-2 -13 H5 V-8 H-2z" fill="${c}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/>
      <path d="M-3.600 12 V5 H4.400 V12z" fill="#3A2A1C"/><path d="M-1.600 12 V7 H2.400 V12z" fill="${d}" opacity=".6"/>
      <path d="M1.400 -13 V-19" stroke="#5A3A1C" stroke-width="1.400" stroke-linecap="round"/><path class="in-flag" d="M1.400 -19 L9 -17 L1.400 -15z" fill="${c}" stroke="${d}" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M-12 12 V9 H-9 V12 M9 12 V9 H12 V12" fill="${d}" opacity=".4"/>`;
  }
  return `<path d="M-10 11 V1 L0 -13 L10 1 V11 Z" fill="${c}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round"/>
    <path d="M-10 1 L0 -13 L10 1" fill="#D9B968" stroke="#7A5A1E" stroke-width="2" stroke-linejoin="round"/><path d="M-6 -4 L-3.600 -1 M-1 -9 L1.600 -3 M4 -5 L6.400 -1" stroke="#7A5A1E" stroke-width="1" opacity=".6"/>
    <path d="M-3 11 V5 Q0 2 3 5 V11 Z" fill="${d}" opacity=".6"/>`;
}

// ------------------------------------------------------------ thickets
// a tangle of jungle on a tile: it covers the edges and creeps over the number token
export function thicketArt(h, life) {
  const sway = life ? 'in-vine' : '';
  const leaf = (x, y, r, a, c = '#2F9A4F') => `<path d="M${x} ${y} q${r * 0.7} ${-r} ${r * 1.6} ${-r * 0.2} q${-r * 0.7} ${r} ${-r * 1.6} ${r * 0.2}z" transform="rotate(${a} ${x} ${y})" fill="${c}" stroke="#14502A" stroke-width=".8" stroke-linejoin="round"/>`;
  const vine = (d, w = 2.600) => `<path class="${sway}" d="${d}" fill="none" stroke="#1B5A2E" stroke-width="${w + 1.200}" stroke-linecap="round"/><path class="${sway}" d="${d}" fill="none" stroke="#3FA85A" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<g><ellipse cx="0" cy="6" rx="46" ry="38" fill="rgba(18,62,32,.34)"/>
    ${vine('M-40 -6 Q-22 -26 -4 -10 T26 -22 T44 -4')}${vine('M-42 20 Q-20 4 -2 20 T34 8 T44 26', 2.200)}${vine('M-18 -34 Q-8 -18 -20 -2 T-14 30', 2)}${vine('M20 -34 Q10 -14 24 2 T16 34', 2)}
    ${leaf(-34, -10, 7, -30)}${leaf(-6, -20, 8, 20, '#38A85A')}${leaf(26, -22, 7, 40)}${leaf(38, 6, 8, 10, '#38A85A')}${leaf(-38, 24, 8, -60)}${leaf(2, 28, 8, 90, '#38A85A')}${leaf(30, 30, 7, 120)}${leaf(-20, 16, 6, 160)}
    <path d="M-30 -22 l3 -8 l3 8z M30 -24 l3 -8 l3 8z M-4 34 l3 -8 l3 8z" fill="#7A3A1E" stroke="#3A1A0E" stroke-width=".7" stroke-linejoin="round"/></g>`;
}
