// Dawn of Humankind: the stone-age look of the board. Tile scenes (mammoths, bison, berry pickers, flint knappers,
// cave painters ...), camps, explorers, the Neanderthal and the Saber-toothed tiger, camp site and discovery tiles.
// Every scene is a little looping animation (CSS in styles.css, classes hk-*) that only runs on the living board.
import { PCOLOR, PCOLOR_DARK } from '../core.js';

const f = n => n.toFixed(1);
// a few pixels of difference per tile and a stable pseudo-random number from the tile and a slot
const hash = (id, k) => { const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const delay = (h, span) => `animation-delay:-${(hash(h.id, 3) * span).toFixed(2)}s`;
const SKIN = ['#E8B890', '#D9A272', '#C68C5E', '#EDC7A0', '#B9794C'];
const FUR = ['#A5703E', '#8C5A32', '#B98A4E', '#7A4F2B', '#9C7A4A'];
const HAIR = ['#3A2A1C', '#1F1610', '#6B4A2A', '#8C5A2B', '#2B2B2B'];

// the four landscapes of the book: Wald (fur), Ödland (bone), Grasland (meat), Gebirge (flint)
export const TERRAIN_COLOR = { forest: '#2F6B3A', wasteland: '#DDB547', grassland: '#8CC85A', mountains: '#7B8089' };
export const TERRAIN_GLYPH = { forest: 'fur', wasteland: 'bone', grassland: 'meat', mountains: 'flint' };

// ------------------------------------------------------------ people and animals
const person = ({ skin, fur, hair, tool = '', arm = true, legs = true }) => `
  <ellipse cy="1.2" rx="4.4" ry="1.4" fill="rgba(0,0,0,.25)"/>
  ${legs ? `<rect x="-2.3" y="-3.2" width="1.9" height="4.2" rx=".6" fill="${skin}"/><rect x=".4" y="-3.2" width="1.9" height="4.2" rx=".6" fill="${skin}"/>` : ''}
  <path d="M-3.6 -3.4 L-2.8 -9.6 H2.8 L3.6 -3.4 L2.2 -4.4 L.7 -3.2 L-.8 -4.4 L-2.2 -3.2 Z" fill="${fur}" stroke="#4A2E18" stroke-width=".5" stroke-linejoin="round"/>
  <circle cy="-11.8" r="2.6" fill="${skin}"/><path d="M-2.8 -12.4 Q-1 -16.2 2.8 -13.2 L2.6 -11.6 Q0 -13.8 -2.6 -11.4Z" fill="${hair}"/>
  ${arm ? tool : ''}`;
const pickPerson = (h, k, tool) => person({ skin: SKIN[(h.id + k) % 5], fur: FUR[(h.id * 3 + k) % 5], hair: HAIR[(h.id + k * 2) % 5], tool });

const mammoth = (h, calf = false) => `<g ${calf ? 'transform="scale(.58)"' : ''}><g class="hk-walk" style="${delay(h, 18)}">
  <ellipse cy="1" rx="13" ry="3.2" fill="rgba(0,0,0,.25)"/>
  <g class="hk-leg b"><rect x="-8.600" y="-6" width="3.200" height="7" rx="1.100" fill="#5E432C"/></g><g class="hk-leg"><rect x="-4.200" y="-6" width="3.200" height="7" rx="1.100" fill="#5E432C"/></g>
  <path d="M-12 -5 C-13 -15 -4 -18.500 3 -16.500 C9.500 -15 11.500 -9 10.500 -4 Z" fill="#7A5A3F" stroke="#3F2A1A" stroke-width="1" stroke-linejoin="round"/>
  <path d="M-11 -5 l1.200 3.400 l1.500 -3 l1.400 3.400 l1.500 -3 l1.400 3.400 l1.500 -3 l1.500 3.200 l1.400 -3 l1.400 3 l1.400 -2.800" fill="none" stroke="#4E3722" stroke-width="1"/>
  <g class="hk-leg"><rect x="3" y="-6" width="3.200" height="7" rx="1.100" fill="#6A4C34"/></g><g class="hk-leg b"><rect x="7.200" y="-6" width="3.200" height="7" rx="1.100" fill="#6A4C34"/></g>
  <path d="M-11.500 -11 q-3 2 -2.200 7" fill="none" stroke="#4E3722" stroke-width="1.600" stroke-linecap="round"/>
  <circle cx="11.500" cy="-10.500" r="5.600" fill="#7A5A3F" stroke="#3F2A1A" stroke-width="1"/><path d="M8 -15 q3.500 -3.600 7 0 q-1 -2.200 -3.500 -2.200 t-3.500 2.200z" fill="#5E432C"/>
  <g class="hk-trunk"><path d="M15.500 -9.500 q4.600 1.600 3.600 8.500" fill="none" stroke="#7A5A3F" stroke-width="3" stroke-linecap="round"/><path d="M15.500 -9.500 q4.600 1.600 3.600 8.500" fill="none" stroke="#3F2A1A" stroke-width=".7" stroke-linecap="round" opacity=".6"/></g>
  <path d="M13 -7.600 q6 .8 6.400 -6" fill="none" stroke="#F5EBD2" stroke-width="1.800" stroke-linecap="round"/><path d="M13 -7.600 q6 .8 6.400 -6" fill="none" stroke="#B9A98A" stroke-width=".5"/>
  <circle cx="12.500" cy="-12" r=".9" fill="#1F1610"/></g></g>`;

const bison = (h, k, flip) => `<g transform="${flip ? 'scale(-1,1)' : ''}"><ellipse cy="1" rx="8.500" ry="2.200" fill="rgba(0,0,0,.25)"/>
  <rect x="-5.800" y="-4.600" width="2.200" height="5.400" rx=".8" fill="#4A331F"/><rect x="3.400" y="-4.600" width="2.200" height="5.400" rx=".8" fill="#4A331F"/>
  <path d="M-8 -3 C-9 -10 -3 -13 1 -11.500 C5 -10.500 7 -6 6.500 -3 Z" fill="#6B4A2A" stroke="#33200F" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M-3 -11 C-1 -15 3 -14.500 4 -11" fill="#4A331F" stroke="#33200F" stroke-width=".6"/>
  <g class="hk-graze" style="${delay({ id: h.id + k }, 6)}"><path d="M5.500 -8.500 l3.600 1.200 l.2 3.600 l-3.400 .3 z" fill="#5A3E24" stroke="#33200F" stroke-width=".7" stroke-linejoin="round"/><path d="M6 -8.500 q-.6 -2.600 1 -3.600 M8.300 -8 q1.400 -2.200 3 -2" fill="none" stroke="#F0E6CE" stroke-width=".9" stroke-linecap="round"/><circle cx="8" cy="-6.200" r=".6" fill="#F0E6CE"/></g></g>`;

const bush = (h, k, berries = 5) => `<g><ellipse cy="1.400" rx="9" ry="2.400" fill="rgba(0,0,0,.2)"/>
  <circle cx="-4.500" cy="-4" r="5.200" fill="#3F8A3A" stroke="#1F4F22" stroke-width=".8"/><circle cx="3.500" cy="-4.500" r="5.800" fill="#4A9A42" stroke="#1F4F22" stroke-width=".8"/><circle cy="-8" r="4.800" fill="#58A64A" stroke="#1F4F22" stroke-width=".8"/>
  ${Array.from({ length: berries }, (_, i) => `<circle class="hk-berry" cx="${f(-6.500 + hash(h.id + k, i) * 13)}" cy="${f(-10 + hash(h.id + k, i + 9) * 9)}" r="1.350" fill="#D8333F" stroke="#7E1520" stroke-width=".4" style="animation-delay:-${(i * 0.7).toFixed(1)}s"/>`).join('')}</g>`;

const pine = (c = '#24603F') => `<g><ellipse cy="2" rx="6.500" ry="2" fill="rgba(0,0,0,.22)"/><rect x="-1.200" y="-3" width="2.400" height="5.400" fill="#6B4A2A"/><path d="M0 -26 L8 -9 H-8Z M0 -18 L10 -3 H-10Z" fill="${c}" stroke="#143A24" stroke-width=".9" stroke-linejoin="round"/></g>`;
const oak = (c = '#3F7B3D') => `<g><ellipse cy="2" rx="7" ry="2" fill="rgba(0,0,0,.22)"/><rect x="-1.400" y="-8" width="2.800" height="10.400" fill="#6B4A2A"/><circle cx="-3.600" cy="-11" r="6" fill="${c}" stroke="#1F4F22" stroke-width=".9"/><circle cx="3.600" cy="-11" r="6" fill="${c}" stroke="#1F4F22" stroke-width=".9"/><circle cy="-16" r="6" fill="${c}" stroke="#1F4F22" stroke-width=".9"/></g>`;

const hideRack = h => `<g><ellipse cy="1.400" rx="10" ry="2.200" fill="rgba(0,0,0,.2)"/>
  <path d="M-8 1 L-8 -17 M8 1 L8 -17 M-9.500 -16 H9.500" fill="none" stroke="#6B4A2A" stroke-width="1.800" stroke-linecap="round"/>
  <g class="hk-hide"><path d="M-7 -15.500 H7 L8.600 -12 L6.800 -9 L8.400 -5.500 L6.400 -2.500 H-6.400 L-8.400 -5.500 L-6.800 -9 L-8.600 -12 Z" fill="#B98A5A" stroke="#6B4A2A" stroke-width=".9" stroke-linejoin="round"/><path d="M-3 -12 q2 2 0 5 M2.500 -12.500 q-1.500 3 .6 6" fill="none" stroke="rgba(94,60,28,.5)" stroke-width="1.100" stroke-linecap="round"/></g></g>`;

const deer = (h, flip = false) => `<g transform="${flip ? 'scale(-1,1)' : ''}"><g class="hk-walk s" style="${delay(h, 13)}"><ellipse cy="1" rx="8" ry="2" fill="rgba(0,0,0,.22)"/>
  <g class="hk-leg b"><rect x="-5.500" y="-5" width="1.500" height="6" fill="#7A4F2B"/></g><g class="hk-leg"><rect x="-3" y="-5" width="1.500" height="6" fill="#7A4F2B"/></g>
  <ellipse cx="0" cy="-7" rx="7.500" ry="3.800" fill="#A5703E" stroke="#4A2E18" stroke-width=".7"/>
  <g class="hk-leg"><rect x="2.600" y="-5" width="1.500" height="6" fill="#8C5A32"/></g><g class="hk-leg b"><rect x="5" y="-5" width="1.500" height="6" fill="#8C5A32"/></g>
  <path d="M5.500 -9 L8.200 -14 L10.200 -13 L8 -8Z" fill="#A5703E" stroke="#4A2E18" stroke-width=".6" stroke-linejoin="round"/><ellipse cx="9.800" cy="-14.200" rx="2.400" ry="1.700" fill="#A5703E" stroke="#4A2E18" stroke-width=".6"/>
  <path d="M8.600 -15.500 l-1.400 -3.600 M8.600 -15.500 l1.800 -3.800 M7.200 -19 l-1.300 -.6 M10.400 -19.300 l1.300 -.8" fill="none" stroke="#5E432C" stroke-width=".8" stroke-linecap="round"/><circle cx="10.600" cy="-14.600" r=".5" fill="#1F1610"/></g></g>`;

// a flint knapper: strikes one stone with another, sparks fly
const knapper = (h, k) => `<g>${pickPerson(h, k, `<g class="hk-arm hit"><line x1="2.200" y1="-8" x2="7" y2="-12" stroke="#E8B890" stroke-width="1.500" stroke-linecap="round"/><path d="M6 -13.500 l3.600 .8 l-.8 3.200 l-3.200 -.8z" fill="#7E8693" stroke="#3E454F" stroke-width=".6"/></g>`)}
  <ellipse cx="7" cy="-1.200" rx="4.200" ry="2" fill="#8D96A3" stroke="#3E454F" stroke-width=".7"/>
  <g class="lf-sparks" style="color:#FFE08A"><circle cx="8" cy="-3.600" r=".9" fill="currentColor" style="animation-delay:-.1s"/><circle cx="10.400" cy="-5" r=".7" fill="currentColor" style="animation-delay:-.5s"/><circle cx="6" cy="-5.400" r=".8" fill="currentColor" style="animation-delay:-.9s"/></g></g>`;
const flintPile = (n = 4) => `<g><ellipse cy="1.400" rx="8.500" ry="2.200" fill="rgba(0,0,0,.2)"/>${Array.from({ length: n }, (_, i) => `<path d="M${-7 + i * 3.600} 0 l1.600 -${5 + (i % 2) * 3} l2.600 ${5 + (i % 2) * 3}z" fill="${['#8D96A3', '#6E7885', '#A3ACB8', '#7A8492'][i % 4]}" stroke="#3E454F" stroke-width=".7" stroke-linejoin="round"/>`).join('')}</g>`;
const arrowheads = h => `<g>${[0, 1, 2, 3].map(i => `<path class="hk-point" d="M${-7 + i * 4.800} 0 l2 -6 l2 6 l-2 -1.400z" fill="#9AA4B2" stroke="#3E454F" stroke-width=".6" stroke-linejoin="round" style="animation-delay:-${(i * 1.1).toFixed(1)}s"/>`).join('')}</g>`;

const caveMouth = (h, dark = '#1E1712') => `<g><ellipse cy="2" rx="17" ry="3.200" fill="rgba(0,0,0,.25)"/>
  <path d="M-16 1 C-17 -14 -9 -22 0 -22 C9 -22 17 -14 16 1 Z" fill="#5C6272" stroke="#2F3340" stroke-width="1.200" stroke-linejoin="round"/>
  <path d="M-10 1 C-11 -9 -6 -15 0 -15 C6 -15 11 -9 10 1 Z" fill="${dark}"/>
  <g class="lf-fire hk-glow"><ellipse cx="0" cy="-3.600" rx="6" ry="4.600" fill="#F6A321" opacity=".5"/><path d="M0 0 q-3.600 -3 -1.200 -7.400 q.8 2 1.800 2.200 q1.800 -2 .8 -4.600 q4.400 3.200 1.600 8.200 q-.4 1.600 -3 1.600z" fill="#F59B1B" stroke="#C7561B" stroke-width=".5"/></g></g>`;
const painter = h => `<g>${pickPerson(h, 7, `<g class="hk-arm paint"><line x1="2" y1="-8" x2="6" y2="-14" stroke="#E8B890" stroke-width="1.500" stroke-linecap="round"/><circle cx="6.400" cy="-14.600" r="1.100" fill="#C1272D"/></g>`)}</g>`;
const wallBison = `<g class="hk-wallart"><path d="M-6 -12 C-7 -16 -2 -18 1 -16.500 C4 -17 6.500 -14 5.500 -12 Z M5.500 -15 l2.600 -1.200 l1.400 1.800 l-2 1.400z" fill="#C1272D" opacity=".85"/><circle cx="-4" cy="-8.600" r="2.400" fill="none" stroke="#F0E6CE" stroke-width="1" opacity=".8"/></g>`;
const bones = () => `<g><ellipse cy="1.400" rx="10" ry="2.200" fill="rgba(0,0,0,.2)"/>
  <path d="M-8 0 L6 -4 M-6 -3 L8 1" stroke="#F0E6CE" stroke-width="2.400" stroke-linecap="round"/><path d="M-8 0 L6 -4 M-6 -3 L8 1" stroke="#B9AA8A" stroke-width=".6" stroke-linecap="round"/>
  <circle cx="-9" cy="-.4" r="1.500" fill="#F0E6CE" stroke="#B9AA8A" stroke-width=".5"/><circle cx="7.400" cy="-4.600" r="1.500" fill="#F0E6CE" stroke="#B9AA8A" stroke-width=".5"/>
  <path d="M-2 -5 q2 -7 7 -6 q4 1 3 6 q-1 2 -3 1.600 l-.4 3 h-5 l-.4 -3 q-1.600 .2 -1.200 -1.600z" fill="#F0E6CE" stroke="#B9AA8A" stroke-width=".7" stroke-linejoin="round"/><circle cx="1.200" cy="-6.400" r="1.100" fill="#2B2018"/><circle cx="5.400" cy="-6.400" r="1.100" fill="#2B2018"/></g>`;
const campfire = (h, big = false) => `<g transform="scale(${big ? 1.25 : 1})"><ellipse cy="1.200" rx="7" ry="2" fill="rgba(0,0,0,.22)"/>
  <path d="M-6 1 L5 -2.600 M6 1 L-5 -2.600" stroke="#6B4A2A" stroke-width="2.200" stroke-linecap="round"/><circle cx="-6.400" cy="1.200" r="1.800" fill="#8D8D97"/><circle cx="6.400" cy="1.200" r="1.800" fill="#8D8D97"/>
  <g class="lf-fire"><path d="M0 -.8 q-5 -4 -1.600 -10 q1 2.800 2.400 3 q2.600 -2.800 1 -6.400 q6.400 4.400 2.200 11.200 q-.6 2.600 -4 3z" fill="#F59B1B" stroke="#C7561B" stroke-width=".6" stroke-linejoin="round"/><path d="M0 -1 q-2.200 -2 -.4 -5 q2.800 1.800 .4 5z" fill="#FFE08A"/></g>
  <g class="lf-smoke"><circle cx="1" cy="-14" r="2.400" fill="rgba(210,210,214,.75)" style="${delay(h, 3)}"/><circle cx="1.400" cy="-14" r="2.400" fill="rgba(210,210,214,.75)" style="animation-delay:-1.400s"/></g></g>`;

const at = (cx, cy, x, y, inner, cls = '') => `<g transform="translate(${f(cx + x)},${f(cy + y)})"${cls ? ` class="${cls}"` : ''}>${inner}</g>`;
const mirror = (cx, on, out) => (on ? `<g transform="translate(${f(2 * cx)},0) scale(-1,1)">${out}</g>` : out);

// ------------------------------------------------------------ the scenes, one family per tile kind
function scene(h, cx, cy, nth = 0, seed = 0) {
  const jit = (k, r) => Math.round((hash(h.id + seed % 7, k) - 0.5) * 2 * r);
  const v = nth % 3;
  switch (h.terrain) {
    case 'pasture': // the steppe: a mammoth with its calf, or a bison herd with a hunter lying in wait
      if (v === 0 || v === 2) {
        return mirror(cx, v === 2, at(cx, cy, -30 + jit(1, 3), 30 + jit(2, 2), mammoth(h)) + at(cx, cy, 8 + jit(3, 3), 36, mammoth({ id: h.id + 5 }, true))
          + at(cx, cy, 33, 6 + jit(4, 3), `<g transform="scale(.8)">${bush(h, 3, 2)}</g>`, 'lf-static'));
      }
      return at(cx, cy, -31, 26, bison(h, 1, false)) + at(cx, cy, 6 + jit(1, 3), 38, bison(h, 2, true)) + at(cx, cy, 32, 12 + jit(2, 3), bison(h, 3, true))
        + at(cx, cy, 34, 34, `<g class="hk-peek">${pickPerson(h, 4, '<line x1="3" y1="-8" x2="8" y2="-19" stroke="#6B4A2A" stroke-width="1.200" stroke-linecap="round"/><path d="M7.200 -18.500 l1.800 -3.800 l1.800 3.800z" fill="#9AA4B2" stroke="#3E454F" stroke-width=".5"/>')}</g>`);
    case 'fields': // berry grassland: pickers at the bushes, a hare hops by
      return mirror(cx, v === 1, at(cx, cy, -32 + jit(1, 2), 18 + jit(2, 3), bush(h, 1, 6)) + at(cx, cy, 33, 8 + jit(3, 3), bush(h, 2, 5))
        + at(cx, cy, -20, 34, pickPerson(h, 1, '<g class="hk-arm pick"><line x1="2.200" y1="-8" x2="-3.600" y2="-15" stroke="#E8B890" stroke-width="1.500" stroke-linecap="round"/></g>'))
        + at(cx, cy, -14, 38, `<ellipse cy="0" rx="4.400" ry="1.400" fill="#8A5A2B"/><path d="M-3.600 0 Q0 -4 3.600 0Z" fill="#B9884A" stroke="#6B4A2A" stroke-width=".6"/>`, 'lf-static')
        + at(cx, cy, 26, 34, `<g class="hk-hop" style="${delay(h, 5)}"><ellipse rx="4.200" ry="2.800" fill="#CDB892" stroke="#7A6342" stroke-width=".6"/><circle cx="3.600" cy="-1.600" r="2.200" fill="#CDB892" stroke="#7A6342" stroke-width=".6"/><path d="M3 -3.400 l-.4 -4.600 M5 -3.200 l.8 -4.400" stroke="#CDB892" stroke-width="1.300" stroke-linecap="round"/><circle cx="-4.400" cy="-.4" r="1.300" fill="#fff"/></g>`));
    case 'forest': // hide tanning
      return mirror(cx, v === 2, at(cx, cy, -33 + jit(1, 2), 10 + jit(2, 3), v % 2 ? oak() : pine(), 'lf-static') + at(cx, cy, 34, 4 + jit(3, 3), `<g transform="scale(.82)">${v === 1 ? oak('#2E6B35') : pine('#1B4F33')}</g>`)
        + (v === 0 ? at(cx, cy, -22, 36, hideRack(h)) + at(cx, cy, 25, 36, pickPerson(h, 2, '<g class="hk-arm scrape"><line x1="2" y1="-8" x2="7" y2="-4" stroke="#E8B890" stroke-width="1.500" stroke-linecap="round"/><rect x="6" y="-5.600" width="3" height="2.200" rx=".6" fill="#8D96A3" stroke="#3E454F" stroke-width=".5"/></g>'))
          : v === 1 ? at(cx, cy, -10, 38, deer(h, true)) + at(cx, cy, 27, 31, hideRack(h))
            : at(cx, cy, -8, 38, deer(h)) + at(cx, cy, 25, 36, pickPerson(h, 5, '<line x1="3" y1="-8" x2="8" y2="-20" stroke="#6B4A2A" stroke-width="1.200" stroke-linecap="round"/><path d="M7.200 -19.500 l1.800 -3.800 l1.800 3.800z" fill="#9AA4B2" stroke="#3E454F" stroke-width=".5"/>')))
        + at(cx, cy, -5, 31 + jit(4, 2), '<g class="lf-chips" style="color:#E8C48A"><rect x="-3" y="-3" width="1.600" height="1.600" fill="#E8C48A"/></g>'));
    case 'hills': // flint knapping
      return mirror(cx, v === 1, at(cx, cy, -29 + jit(1, 2), 24 + jit(2, 3), knapper(h, 2)) + at(cx, cy, -33, 38, flintPile(4)) + at(cx, cy, 31, 20 + jit(3, 3), flintPile(3))
        + (v === 0 ? at(cx, cy, 8, 38, arrowheads(h)) : v === 1 ? at(cx, cy, 26, 36, knapper({ id: h.id + 3 }, 5)) : at(cx, cy, 10, 38, campfire(h))));
    case 'mountains': // caves: a painter at the wall, firelight, bats, a pile of bones
      return mirror(cx, v === 2, at(cx, cy, -29 + jit(1, 2), 22, caveMouth(h)) + at(cx, cy, -29, 22, wallBison)
        + at(cx, cy, -9, 32, painter(h)) + at(cx, cy, 30, 28 + jit(2, 3), v === 1 ? campfire(h) : bones())
        + (v === 1 ? at(cx, cy, 29, 8, `<g class="hk-dance">${pickPerson(h, 3, '<line x1="-2.200" y1="-8" x2="-6" y2="-15" stroke="#E8B890" stroke-width="1.500" stroke-linecap="round"/><line x1="2.200" y1="-8" x2="6" y2="-15" stroke="#E8B890" stroke-width="1.500" stroke-linecap="round"/>')}</g>`) : at(cx, cy, 30, 6, `<g transform="scale(.9)">${bones()}</g>`))
        + at(cx, cy, 6, -10, '<g class="hk-bat"><path d="M-4 0 q2 -3 4 0 q2 -3 4 0 q-2 1.400 -4 .6 q-2 .8 -4 -.6z" fill="#3A3140"/></g>'));
    case 'desert': // dry scrub, a skull, a vulture circling
      return at(cx, cy, -29, 28, bones()) + at(cx, cy, 30, 12, `<g class="hk-tumble"><circle r="5.600" fill="none" stroke="#9C7A4A" stroke-width="1.400" stroke-dasharray="3 1.600"/><path d="M-4 -2 L4 2 M-3 3 L3 -3" stroke="#9C7A4A" stroke-width="1.100"/></g>`)
        + at(cx, cy, 6, -6, '<g class="hk-circle"><path d="M-5 0 q2.500 -3.400 5 0 q2.500 -3.400 5 0 q-2.500 1.600 -5 .8 q-2.500 .8 -5 -.8z" fill="#2B2B30"/></g>');
    default: return '';
  }
}


// a field's little scene. The four landscapes reuse the scene families: grassland alternates between the steppe (mammoths,
// bison and a lurking hunter) and berry meadows, mountains between flint knapping and caves, wasteland is dry scrub.
const KIND = { forest: ['forest'], wasteland: ['desert'], grassland: ['pasture', 'fields'], mountains: ['hills', 'mountains'] };
export function tileLife(h, cx, cy, nth = 0, seed = 0) {
  const kinds = KIND[h.terrain];
  if (!kinds) return '';
  const kind = kinds[nth % kinds.length];
  // the fields are flat-topped (wider than high): shrink the scene a little so nothing leaves the field
  return `<g transform="translate(${f(cx)},${f(cy + 1)}) scale(.9) translate(${f(-cx)},${f(-cy)})">${scene({ ...h, terrain: kind }, cx, cy, Math.floor(nth / kinds.length), seed)}</g>`;
}

// ------------------------------------------------------------ camps
export const CAMP_D = 'M-10 11 L0 -13 L10 11 Z';
export const shape = () => CAMP_D;
export function building(b, color) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  const poles = (x, y) => `<path d="M${x - 1.400} ${y} L${x - 3.400} ${y - 4.400} M${x + 1.400} ${y} L${x + 3.400} ${y - 4.400}" stroke="#5A3A1C" stroke-width="1.600" stroke-linecap="round"/>`;
  const fire = (x, y) => `<g transform="translate(${x},${y})"><g class="lf-fire"><path d="M0 0 q-2.800 -2.400 -.9 -6.400 q.6 1.800 1.400 2 q1.400 -1.800 .6 -4 q3.800 2.800 1.400 6.600 q-.2 1.800 -2.500 1.800z" fill="#F59B1B" stroke="#C7561B" stroke-width=".4"/></g></g>`;
  return `${poles(0, -13)}<path d="M-10 11 L0 -13 L10 11 Z" fill="${c}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round"/>
    <path d="M-3.800 11 L0 0 L3.800 11Z" fill="${d}" opacity=".5"/><path d="M-6.400 5 L-1.400 -6.200 M6.400 5 L1.400 -6.200" stroke="${d}" stroke-width="1" opacity=".45"/>${fire(13, 11)}`;
}

// ------------------------------------------------------------ explorers: two hunters with a spear
export function explorer(color, { moved = false, life = false, mine = false } = {}) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  const man = (x, y, k, spear) => `<g transform="translate(${x},${y})">
    <ellipse cy="1.200" rx="4.600" ry="1.400" fill="rgba(0,0,0,.28)"/>
    <rect x="-2.400" y="-4" width="1.900" height="5" rx=".6" fill="${SKIN[k]}"/><rect x=".5" y="-4" width="1.900" height="5" rx=".6" fill="${SKIN[k]}"/>
    <path d="M-3.800 -3.600 L-3 -11 H3 L3.800 -3.600 L2.300 -4.800 L.7 -3.500 L-.8 -4.800 L-2.300 -3.500 Z" fill="${c}" stroke="${d}" stroke-width=".8" stroke-linejoin="round"/>
    <circle cy="-13.600" r="3" fill="${SKIN[k]}" stroke="#4A2E18" stroke-width=".4"/><path d="M-3.100 -14.200 Q-1 -18.600 3.100 -15.200 L2.900 -13.400 Q0 -15.800 -2.900 -13.200Z" fill="${HAIR[k]}"/>
    ${spear ? `<g class="${life ? 'hk-spear' : ''}"><line x1="4.200" y1="-9" x2="5.800" y2="-25" stroke="#6B4A2A" stroke-width="1.200" stroke-linecap="round"/><path d="M5.200 -24 L5.800 -29 L6.800 -24Z" fill="#B7C0CC" stroke="#3E454F" stroke-width=".5" stroke-linejoin="round"/></g><line x1="2.800" y1="-9" x2="4.400" y2="-9.600" stroke="${SKIN[k]}" stroke-width="1.500" stroke-linecap="round"/>` : `<line x1="-2.800" y1="-9" x2="-5" y2="-5.600" stroke="${SKIN[k]}" stroke-width="1.500" stroke-linecap="round"/>`}</g>`;
  return `<g class="hk-ex ${life ? 'alive-ex' : ''}" ${moved ? 'opacity=".62"' : ''}>${man(-5.200, 1, 2, false)}${man(5, 2, 0, true)}</g>`;
}

// ------------------------------------------------------------ the Neanderthal: stocky, heavy brow, club
export function neanderthal(life, fresh) {
  const ring = life ? '<ellipse class="lf-rmarch" cy="14" rx="19" ry="5.400" fill="none" stroke="#E8452F" stroke-width="1.500" stroke-dasharray="4.500 3"/><ellipse class="lf-rring" cy="14" rx="19" ry="5.400" fill="none" stroke="#E8452F" stroke-width="1.600"/>' : '';
  return `${fresh ? '<circle class="fx-dust" cy="13" r="10"/>' : ''}<ellipse cy="14" rx="14" ry="3.600" fill="rgba(0,0,0,.4)"/>${ring}
  <g class="${fresh ? 'fx-robber-drop' : ''}"><g class="${life ? 'hk-neander' : ''}">
    <rect x="-8" y="3" width="6" height="11" rx="2.400" fill="#8B7A62" stroke="#4A3C2A" stroke-width=".9"/><rect x="2" y="3" width="6" height="11" rx="2.400" fill="#8B7A62" stroke="#4A3C2A" stroke-width=".9"/>
    <path d="M-11 5 L-9 -9 Q0 -14 9 -9 L11 5 L8 3 L5 6 L2 3 L-1 6 L-4 3 L-8 6Z" fill="#6B5139" stroke="#3A2A18" stroke-width="1.100" stroke-linejoin="round"/>
    <path d="M-7 -6 q3 3 6 0 M0 -4 q3 3 6 0" fill="none" stroke="#4A3524" stroke-width=".8" stroke-linecap="round"/>
    <g class="${life ? 'hk-club' : ''}"><line x1="9" y1="-5" x2="16" y2="-17" stroke="#9A7B4F" stroke-width="2.800" stroke-linecap="round"/><ellipse cx="17" cy="-19" rx="3.800" ry="4.800" transform="rotate(30 17 -19)" fill="#7A5A32" stroke="#3A2A18" stroke-width="1"/><line x1="9" y1="-5" x2="12" y2="-10" stroke="#A8957A" stroke-width="3" stroke-linecap="round"/></g>
    <circle cx="0" cy="-17" r="7.400" fill="#A8957A" stroke="#4A3C2A" stroke-width="1"/>
    <path d="M-7.400 -18 Q-6 -25 0 -24.600 Q6 -25 7.400 -18 Q3 -21 0 -20.600 Q-3 -21 -7.400 -18Z" fill="#3A2A1C"/>
    <path d="M-6.200 -17.200 Q0 -20.200 6.200 -17.200 L6 -15.600 Q0 -17.800 -6 -15.600Z" fill="#7C6A52" stroke="#4A3C2A" stroke-width=".6" stroke-linejoin="round"/>
    <g class="${life ? 'lf-blink' : ''}"><circle cx="-2.600" cy="-15.400" r="1.200" fill="#1F1610"/><circle cx="2.600" cy="-15.400" r="1.200" fill="#1F1610"/></g>
    <path d="M-2 -11.600 q2 1.400 4 0" fill="none" stroke="#4A3C2A" stroke-width=".9" stroke-linecap="round"/>
    <line x1="-9" y1="-6" x2="-12" y2="1" stroke="#A8957A" stroke-width="3" stroke-linecap="round"/>
  </g></g>`;
}

// ------------------------------------------------------------ the Saber-toothed tiger (Smilodon)
export function sabertooth(life, fresh) {
  const ring = life ? '<ellipse class="lf-rmarch" cy="14" rx="19" ry="5.400" fill="none" stroke="#E8452F" stroke-width="1.500" stroke-dasharray="4.500 3"/><ellipse class="lf-rring" cy="14" rx="19" ry="5.400" fill="none" stroke="#E8452F" stroke-width="1.600"/>' : '';
  return `${fresh ? '<circle class="fx-dust" cy="13" r="10"/>' : ''}<ellipse cy="14" rx="17" ry="3.800" fill="rgba(0,0,0,.4)"/>${ring}
  <g class="${fresh ? 'fx-robber-drop' : ''}"><g class="${life ? 'hk-prowl' : ''}">
    <g class="hk-tail"><path d="M-14 2 C-24 -1 -23 -12 -17 -15" fill="none" stroke="#C98A3B" stroke-width="3.400" stroke-linecap="round"/><path d="M-14 2 C-24 -1 -23 -12 -17 -15" fill="none" stroke="#6B3F10" stroke-width=".7" stroke-linecap="round" opacity=".6"/><circle cx="-17" cy="-15" r="2.200" fill="#3A2410"/></g>
    <g class="hk-leg b"><rect x="-13" y="4" width="4.600" height="10" rx="1.800" fill="#B9772B" stroke="#6B3F10" stroke-width=".8"/></g><g class="hk-leg"><rect x="-8" y="4" width="4.600" height="10" rx="1.800" fill="#C98A3B" stroke="#6B3F10" stroke-width=".8"/></g>
    <ellipse cx="0" cy="0" rx="17" ry="9.800" fill="#D9983F" stroke="#6B3F10" stroke-width="1.200"/>
    <path d="M-8 -8 q1 4 -.6 8 M-2 -9.400 q1.400 4.800 0 9.400 M4 -9 q1 4 -.4 8" fill="none" stroke="#6B3F10" stroke-width="1.500" stroke-linecap="round"/>
    <g class="hk-leg"><rect x="3.400" y="4" width="4.600" height="10" rx="1.800" fill="#D9983F" stroke="#6B3F10" stroke-width=".8"/></g><g class="hk-leg b"><rect x="9.400" y="4" width="4.600" height="10" rx="1.800" fill="#E3A24B" stroke="#6B3F10" stroke-width=".8"/></g>
    <g class="hk-head"><path d="M12.500 -4 L13.500 -13 L18 -8.600 Z M19 -9 L23.600 -12.600 L23.400 -4 Z" fill="#D9983F" stroke="#6B3F10" stroke-width="1" stroke-linejoin="round"/>
      <ellipse cx="19.500" cy="-3" rx="9" ry="7.400" fill="#E3A24B" stroke="#6B3F10" stroke-width="1.200"/>
      <path d="M22 .8 l1.200 11 l2.600 -11.400 M27 -.2 l1 9.800 l2.200 -10" fill="#FFFBEE" stroke="#8C7B5C" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M17 -6 q2 -2 4 0" fill="none" stroke="#6B3F10" stroke-width="1" stroke-linecap="round"/><g class="${life ? 'lf-blink' : ''}"><ellipse cx="21.400" cy="-5" rx="2" ry="1.700" fill="#FFE08A" stroke="#6B3F10" stroke-width=".6"/><rect x="21" y="-6.400" width="1" height="2.800" rx=".5" fill="#2B1608"/></g>
      <path d="M26.400 -1.600 q2.400 .2 2.600 2" fill="#2B1608" stroke="#2B1608" stroke-width="1.600" stroke-linecap="round"/><path d="M22 3 q3 1.600 6.400 .2" fill="none" stroke="#6B3F10" stroke-width="1" stroke-linecap="round"/></g>
  </g></g>`;
}

// ------------------------------------------------------------ camp site tiles (Lagerplatz-Plättchen)
export const SITE_COLOR = { europe: ['#5C8FD0', '#2E5A94'], asia: ['#F0B1D0', '#B8527F'], australia: ['#B87B45', '#6E4421'], america: ['#F58C3E', '#B2501A'] };
// the symbols: berries, enoki mushrooms, macadamia nut, potato
const SYMBOL = {
  europe: '<circle cx="-3" cy="2" r="3.600" fill="#1E2B63"/><circle cx="3.200" cy="1.400" r="3.600" fill="#26357A"/><circle cx="0" cy="-3.400" r="3.600" fill="#1E2B63"/><circle cx="-4" cy="1" r=".9" fill="#7C8CD0"/><circle cx="2.200" cy=".4" r=".9" fill="#7C8CD0"/><circle cx="-1" cy="-4.400" r=".9" fill="#7C8CD0"/><path d="M0 -7 q2.600 -3.200 5.200 -1.400 q-2 3 -5.200 1.400z" fill="#4C9A3C" stroke="#2A6A22" stroke-width=".5"/>',
  asia: '<path d="M-4 6 V-1 M0 6 V-3 M4 6 V0 M-2 6 V-5 M2 6 V-4" stroke="#F4D78A" stroke-width="1.500" stroke-linecap="round"/><circle cx="-4" cy="-2" r="2" fill="#D79A28"/><circle cx="0" cy="-4" r="2" fill="#E3A93A"/><circle cx="4" cy="-1" r="2" fill="#D79A28"/><circle cx="-2" cy="-6" r="1.800" fill="#E8B64A"/><circle cx="2" cy="-5.600" r="1.800" fill="#E3A93A"/>',
  australia: '<ellipse cx="0" cy="1" rx="5.600" ry="6" fill="#8A5A2B" stroke="#3E2610" stroke-width=".9"/><path d="M-2.600 -2 q-1 4 1.200 7 M1 -3 q-1 4 1 8" fill="none" stroke="#C99A60" stroke-width=".9" stroke-linecap="round"/><ellipse cx="-2" cy="-1.600" rx="1.500" ry="2.400" fill="#C99A60" opacity=".55"/><path d="M0 -5 q1 -2.600 3.600 -3" fill="none" stroke="#3E2610" stroke-width="1" stroke-linecap="round"/>',
  america: '<path d="M-6 1 C-7 -4 -2 -6.600 2 -5.600 C6 -5 7.600 -1 6.200 2.600 C4.600 6.200 -2 6.800 -4.600 4.600 C-5.800 3.600 -6 2.400 -6 1Z" fill="#D9B27A" stroke="#6E4E22" stroke-width=".9" stroke-linejoin="round"/><circle cx="-1.600" cy="-1.200" r=".8" fill="#6E4E22"/><circle cx="2.600" cy="1.600" r=".8" fill="#6E4E22"/><circle cx="-3" cy="2.600" r=".7" fill="#6E4E22"/>',
};
export const siteTile = (region, size = 1) => {
  const [c, d] = SITE_COLOR[region] || SITE_COLOR.europe;
  return `<g transform="scale(${size})"><path d="M0 -13.500 L11.700 -6.700 V6.700 L0 13.500 L-11.700 6.700 V-6.700Z" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M0 -13.500 L11.700 -6.700 V6.700 L0 13.500" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.200"/><g transform="translate(0,.6)">${SYMBOL[region] || ''}</g></g>`;
};

// ------------------------------------------------------------ the animals of the discovery tiles
const BEAST = {
  europe: '<path d="M-8 3 C-9 -3 -4 -6 2 -5 C7 -5 9 -1 8 3Z" fill="#6A4624"/><rect x="-6.500" y="2" width="2.200" height="5" fill="#4A2E18"/><rect x="3.600" y="2" width="2.200" height="5" fill="#4A2E18"/><path d="M6 -4 l3.400 .8 l1 4 l-4 .6z" fill="#7A5230"/><path d="M9.200 0 q3.600 -.6 4.400 -4.600 q-3.200 .6 -4.400 2.800z" fill="#EEE2C0" stroke="#8C7B5C" stroke-width=".5"/>',
  asia: '<path d="M-8 3 C-9.600 -5 -2 -8 4 -6 C9 -4.600 9.600 0 8.600 3Z" fill="#6B4A2A"/><rect x="-6" y="2" width="2.400" height="5.400" fill="#4A331F"/><rect x="3.600" y="2" width="2.400" height="5.400" fill="#4A331F"/><circle cx="8.600" cy="-3.400" r="3.600" fill="#6B4A2A"/><path d="M10 -1.400 q2 3.400 .2 6.600" fill="none" stroke="#6B4A2A" stroke-width="2" stroke-linecap="round"/><path d="M9.400 -.4 q4.600 2 4 -3.600" fill="none" stroke="#F4EBD0" stroke-width="1.100" stroke-linecap="round"/>',
  australia: '<ellipse cx="0" cy="1" rx="8.600" ry="5.600" fill="#6C7F3C" stroke="#2F3C16" stroke-width=".8"/><path d="M-5 -2 l2.400 3 M0 -4 l0 4.400 M5 -2 l-2.400 3" stroke="#3D4D1C" stroke-width=".8"/><circle cx="9.400" cy="1.200" r="2.400" fill="#8A9B52" stroke="#2F3C16" stroke-width=".6"/><rect x="-6" y="4" width="2.600" height="3" fill="#4A5A24"/><rect x="3.600" y="4" width="2.600" height="3" fill="#4A5A24"/>',
  namerica: '<path d="M-6 4 C-9 -4 -3 -8 2 -6 C6 -5 6 -1 4 1 L3 5Z" fill="#B9A079" stroke="#6B5A3A" stroke-width=".7"/><circle cx="3.600" cy="-6" r="3.200" fill="#C9B38A" stroke="#6B5A3A" stroke-width=".7"/><path d="M5.200 -2 q4 1 4.600 6 M6.400 -1 q3.600 2 3.600 7" fill="none" stroke="#6B5A3A" stroke-width="1.400" stroke-linecap="round"/><rect x="-5" y="3" width="2.400" height="4" fill="#8E7954"/>',
  samerica: '<ellipse cx="0" cy="-.4" rx="8.600" ry="6.400" fill="#B5AA94" stroke="#5E5644" stroke-width=".8"/><path d="M-6 -3 l12 0 M-7 0 l14 0 M-5.600 3 l11.200 0 M-2.400 -5.600 v10.600 M2.600 -5.600 v10.600" stroke="#7C735E" stroke-width=".7" fill="none"/><path d="M8 0.400 q3.600 -.6 4.600 2.600 q-2.600 1.800 -5 0z" fill="#8A7A5C" stroke="#4F4636" stroke-width=".6"/><rect x="-6" y="4.600" width="2.600" height="3" fill="#6B6048"/><rect x="3.600" y="4.600" width="2.600" height="3" fill="#6B6048"/>',
};
export const beast = region => BEAST[region] || '';
export const DF_COLOR = { europe: ['#5C8FD0', '#2E5A94'], asia: ['#E96AA6', '#A72E6E'], australia: ['#B87B45', '#6E4421'], namerica: ['#F58C3E', '#B2501A'], samerica: ['#F58C3E', '#B2501A'] };
// a discovery tile (Entdeckungs-Plättchen): a leaf shape with the animal of its region
export const dfTile = (region, size = 1) => {
  const [c, d] = DF_COLOR[region] || DF_COLOR.europe;
  return `<g transform="scale(${size})"><path d="M0 -17 C12 -17 18 -6 14.600 5.600 C11.600 14.600 -11.600 14.600 -14.600 5.600 C-18 -6 -12 -17 0 -17Z" fill="${c}" stroke="${d}" stroke-width="2"/><path d="M-9 -9 C-5 -14 4 -15 9 -11" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.600" stroke-linecap="round"/><g transform="translate(0,-.5) scale(.95)">${beast(region)}</g></g>`;
};
// the hunting marker lies on a cloud
export const cloud = (region, by, colorOf) => {
  const [c, d] = DF_COLOR[region] || DF_COLOR.europe;
  const p = by == null ? '' : `<circle cx="17" cy="-12" r="8" fill="${PCOLOR[colorOf(by)]}" stroke="#fff" stroke-width="2"/><path d="M-0 -5 L1.600 -1.200 L5.600 -1 L2.400 1.600 L3.600 5.400 L0 3.200 L-3.600 5.400 L-2.400 1.600 L-5.600 -1 L-1.600 -1.200Z" transform="translate(17,-12) scale(.9)" fill="#fff"/>`;
  return `<g class="hk-cloud ${by == null ? '' : 'taken'}"><path d="M-22 8 C-31 8 -31 -5 -21 -5 C-21 -17 -3 -19 1 -9 C8 -15 22 -10 20 -1 C30 -1 29 12 18 11 L-18 11 C-20 11 -21 10 -22 8Z" fill="${by == null ? c : 'rgba(255,255,255,.55)'}" stroke="${by == null ? d : 'rgba(255,255,255,.8)'}" stroke-width="2" stroke-linejoin="round"/>
    ${by == null ? `<g transform="translate(-1,-2) scale(1.2)">${beast(region)}</g>` : `<g transform="translate(-1,-2) scale(1.1)" opacity=".28">${beast(region)}</g>`}${p}</g>`;
};

// ------------------------------------------------------------ the conditions next to a discovery field
// Clothing: a dark hide with a white number; Construction: a pale tent with a dark number
export const needBadge = (kind, n, ok) => kind === 'kl'
  ? `<g class="hk-need ${ok ? 'ok' : ''}"><path d="M-8 -5 L-4 -8 H4 L8 -5 L6 -1 L6 7 H-6 V-1Z" fill="#6B4528" stroke="${ok ? '#7CE08A' : '#2B1A0B'}" stroke-width="${ok ? 2 : 1.300}" stroke-linejoin="round"/><text y="4.600" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="11" fill="#fff">${n}</text></g>`
  : `<g class="hk-need ${ok ? 'ok' : ''}"><path d="M-9 7 L0 -9 L9 7Z" fill="#EBD3A6" stroke="${ok ? '#2E9B44' : '#7A5A32'}" stroke-width="${ok ? 2 : 1.300}" stroke-linejoin="round"/><text y="5.600" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="11" fill="#2B1E12">${n}</text></g>`;

// the little hand that marks the Startplätze in Africa
export const handMark = () => '<g opacity=".92"><circle r="7.500" fill="#8B5E34" stroke="#4A2E18" stroke-width="1.200"/><path d="M-1.600 4.400 V-2.600 M-.1 4.400 V-4.800 M1.500 4.400 V-2.800 M3 4.400 V-.8 M-3.200 4.400 V-.4" stroke="#F3DDB4" stroke-width="1.100" stroke-linecap="round"/><path d="M-3.400 3.600 q3.400 2.800 6.800 0" fill="none" stroke="#F3DDB4" stroke-width="1.100" stroke-linecap="round"/></g>';

// ------------------------------------------------------------ small things for the board
// a flat ice floe / glacier crest: pale triangles that make the north look like mountains of ice
export const iceCrest = (x, y, s = 1) => `<g transform="translate(${f(x)},${f(y)}) scale(${s})"><path d="M-22 12 L-9 -14 L-1 -1 L8 -20 L24 12Z" fill="#F6FBFF" stroke="#C6DCEA" stroke-width="1.400" stroke-linejoin="round"/><path d="M-9 -14 L-4 -2 L-10 4Z M8 -20 L13 -4 L6 -1Z" fill="#DCEAF4"/></g>`;
export const polarBear = (life = false) => `<g><ellipse cy="1" rx="10" ry="2.400" fill="rgba(60,90,120,.25)"/><rect x="-7" y="-4" width="3.400" height="5.600" rx="1.200" fill="#F4F8FB" stroke="#B8C8D4" stroke-width=".6"/><rect x="3.600" y="-4" width="3.400" height="5.600" rx="1.200" fill="#F4F8FB" stroke="#B8C8D4" stroke-width=".6"/><path d="M-10 -3 C-11 -10 -3 -12 3 -11 C8 -10 9 -5 8 -2Z" fill="#FBFDFF" stroke="#B8C8D4" stroke-width=".8"/><g class="${life ? 'hk-bearhead' : ''}"><ellipse cx="9.600" cy="-8.600" rx="4.600" ry="3.600" fill="#FBFDFF" stroke="#B8C8D4" stroke-width=".8"/><circle cx="7.600" cy="-11.600" r="1.400" fill="#FBFDFF" stroke="#B8C8D4" stroke-width=".6"/><circle cx="13.600" cy="-8.400" r="1" fill="#1F2A33"/></g></g>`;
