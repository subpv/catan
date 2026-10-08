// Board art for New Energies: power plants (brown and green), environmental damages (the grey cog that sits on a
// number chip or on a village / research city) and the Environmental inspector. Everything lives in the board's
// coordinate system (S = 56 per hex unit); the animations are driven by the .alive class (see styles.css).
import { PCOLOR, PCOLOR_DARK } from '../core.js';

export const S = 56;
const f = n => n.toFixed(1);

// ------------------------------------------------------------ the cog of an environmental damage
export function gearPath(R, r, n, hole) {
  const pts = [];
  const w = Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([a - w * 0.95, r], [a - w * 0.5, R], [a + w * 0.5, R], [a + w * 0.95, r]);
  }
  let d = 'M' + pts.map(([a, rad]) => `${f(Math.cos(a) * rad)} ${f(Math.sin(a) * rad)}`).join(' L') + ' Z';
  if (hole) d += ` M${hole} 0 A${hole} ${hole} 0 1 0 ${-hole} 0 A${hole} ${hole} 0 1 0 ${hole} 0 Z`;
  return d;
}
const RING_D = gearPath(26, 21.500, 11, 17.800);
const SMALL_D = gearPath(11.500, 8.600, 8, 3.600);
// a damage lying on a number chip: the chip shows through the hole
export function chipDamage(fresh) {
  return `<g class="${fresh ? 'fx-drop' : ''}"><g class="en-cog"><path d="${RING_D}" fill="#8E8E96" stroke="#34343B" stroke-width="1.600" stroke-linejoin="round" fill-rule="evenodd"/>
    <path d="${gearPath(23.500, 20, 11, 18.600)}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1" fill-rule="evenodd"/></g></g>`;
}
// a damage on a village or research city: a small cog under a smog cloud
export function buildingDamage(fresh, id = 0) {
  const puff = (x, y, r, n) => `<circle class="pl-puff" cx="${x}" cy="${y}" r="${r}" fill="rgba(96,96,104,.85)" style="animation-delay:-${((id * 0.7 + n * 0.9) % 3).toFixed(2)}s"/>`;
  return `<g class="${fresh ? 'fx-drop' : ''}"><ellipse cy="3" rx="10" ry="2.600" fill="rgba(0,0,0,.28)"/>
    <g class="en-cog fast"><path d="${SMALL_D}" fill="#8E8E96" stroke="#34343B" stroke-width="1.300" stroke-linejoin="round" fill-rule="evenodd"/></g>
    <g class="pl-smoke">${puff(0, -9, 3.600, 0)}${puff(0, -9, 3.600, 1)}${puff(-5, -7, 2.800, 2)}</g></g>`;
}

// ------------------------------------------------------------ the Environmental inspector
export function inspectorArt(life, fresh) {
  const ring = life ? '<ellipse class="lf-rmarch" cy="14" rx="16" ry="5" fill="none" stroke="#E8452F" stroke-width="1.500" stroke-dasharray="4.500 3"/><ellipse class="lf-rring" cy="14" rx="16" ry="5" fill="none" stroke="#E8452F" stroke-width="1.600"/>' : '';
  return `${fresh ? '<circle class="fx-dust" cy="13" r="10"/>' : ''}<ellipse cy="14" rx="12" ry="3.800" fill="rgba(0,0,0,.4)"/>${ring}
  <g class="${fresh ? 'fx-robber-drop' : ''}"><g class="${life ? 'lf-rob' : ''}">
    <path d="M-8.500 14 C-9.500 5 -7 0 -4.500 -2 L4.500 -2 C7 0 9.500 5 8.500 14 Z" fill="#2F8A45" stroke="#0E2A14" stroke-width="1"/>
    <path d="M-7.800 7 H7.800" stroke="#F2E04A" stroke-width="2.200"/><path d="M0 -2 V14" stroke="#0E2A14" stroke-width=".8"/>
    <circle cy="-8" r="6" fill="#E8B890" stroke="#3A2410" stroke-width="1"/>
    <path d="M-7.800 -9 Q0 -19 7.800 -9 L7 -7 H-7 Z" fill="#F2E04A" stroke="#6B5A06" stroke-width="1" stroke-linejoin="round"/>
    <g class="${life ? 'lf-eyes' : ''}"><g class="${life ? 'lf-blink' : ''}"><circle cx="-2.300" cy="-7.600" r="1" fill="#1F1610"/><circle cx="2.300" cy="-7.600" r="1" fill="#1F1610"/></g></g>
    <g transform="rotate(-10 9 5)"><rect x="5.500" y="-1" width="9" height="12" rx="1" fill="#F6F0DC" stroke="#3A2410" stroke-width="1"/><rect x="8" y="-2.500" width="4" height="3" rx=".8" fill="#6B6B72"/>
      <path d="M7 3 H13 M7 5.500 H13" stroke="#8A8A92" stroke-width=".8"/><path d="M7.200 8.200 l1.400 1.400 l2.800 -3" fill="none" stroke="#2F8A45" stroke-width="1.100" stroke-linecap="round"/></g>
  </g></g>`;
}

// ------------------------------------------------------------ power plants
// brown plants burn coal or gas, green plants use wind, sun or biomass (the tile's terrain decides the picture)
export const plantLook = (kind, terrain) => (kind === 'brown' ? (terrain === 'mountains' ? 'coal' : 'gas') : terrain === 'mountains' ? 'solar' : terrain === 'forest' ? 'bio' : 'wind');
const SHADOW = '<ellipse cy="1.500" rx="13" ry="3.400" fill="rgba(0,0,0,.28)"/>';
export function plantArt(kind, terrain, color, id) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  const k = plantLook(kind, terrain);
  const delay = `animation-delay:-${((id * 0.83) % 3).toFixed(2)}s`;
  const puff = (x, y, r, n) => `<circle class="pl-puff" cx="${x}" cy="${y}" r="${r}" fill="rgba(104,104,112,.85)" style="animation-delay:-${((id * 0.83 + n * 0.9) % 3).toFixed(2)}s"/>`;
  switch (k) {
    case 'coal':
    case 'gas': {
      const heap = k === 'coal' ? '<path d="M4.500 -5.500 l3.600 -7 l3.600 7 z" fill="#2A2A2E" stroke="#111" stroke-width=".8" stroke-linejoin="round"/><circle cx="7.600" cy="-8" r=".8" fill="#6B6B72"/>' : '<ellipse cx="8.500" cy="-9" rx="3.400" ry="4.400" fill="#B9BCC4" stroke="#2B2B30" stroke-width="1"/><path d="M5.200 -9h6.600" stroke="#2B2B30" stroke-width=".8"/>';
      return `${SHADOW}<rect x="-12" y="-5.500" width="24" height="6.500" rx="1.400" fill="#5C5C64" stroke="#2B2B30" stroke-width="1.200"/>
        <rect x="-10.500" y="-15" width="14" height="9.800" rx="1.200" fill="#8D8D97" stroke="#2B2B30" stroke-width="1.200"/><rect x="-10.500" y="-10.500" width="14" height="2.800" fill="${c}" stroke="${d}" stroke-width=".6"/>
        <rect x="-8" y="-28" width="4.800" height="13" fill="#6A6A72" stroke="#2B2B30" stroke-width="1.100"/><rect x="-8" y="-28" width="4.800" height="2.600" fill="${c}"/>
        <rect x="-1" y="-23" width="4.800" height="8" fill="#6A6A72" stroke="#2B2B30" stroke-width="1.100"/><rect x="-1" y="-23" width="4.800" height="2.400" fill="${c}"/>
        <rect x="-8.500" y="-13" width="2.600" height="2" fill="#FFE59A"/><rect x="-4.500" y="-13" width="2.600" height="2" fill="#FFE59A"/>${heap}
        <g class="pl-smoke">${puff(-5.600, -30, 3.200, 0)}${puff(-5.600, -30, 3.200, 1)}${puff(-5.600, -30, 3.200, 2)}${puff(1.400, -25, 2.600, 0.5)}${puff(1.400, -25, 2.600, 1.500)}</g>`;
    }
    case 'solar':
      return `${SHADOW}<rect x="-12" y="-3.500" width="24" height="4.500" rx="1.200" fill="#5C5C64" stroke="#2B2B30" stroke-width="1.100"/><rect x="-12" y="-1.400" width="24" height="2.200" fill="${c}"/>
        ${[-9, -1, 7].map((x, i) => `<g><path d="M${x} -4 l7 0 l-1.600 -10 l-7 0 z" fill="#2F5FA8" stroke="#16346B" stroke-width="1" stroke-linejoin="round"/><path d="M${x + 1.800} -4 l-0.400 -10 M${x + 4.200} -4 l-0.400 -10 M${x - 0.200} -9 h6.800" stroke="rgba(190,215,255,.75)" stroke-width=".6" fill="none"/>
          <path class="pl-glint" d="M${x + 1} -13 l5 0 l-0.600 3 l-5 0 z" fill="rgba(255,255,255,.55)" style="animation-delay:-${((id * 0.83 + i * 0.6) % 3).toFixed(2)}s"/></g>`).join('')}`;
    case 'bio':
      return `${SHADOW}<path d="M-11 1 a11 11 0 0 1 22 0 z" fill="#4C9A4C" stroke="#1F4F2A" stroke-width="1.200" stroke-linejoin="round"/><path d="M-11 -1.500 h22" stroke="${c}" stroke-width="2.600"/>
        <rect x="3" y="-19" width="5.200" height="9" fill="#8D8D97" stroke="#2B2B30" stroke-width="1.100"/><rect x="3" y="-19" width="5.200" height="2.200" fill="${c}"/>
        <path d="M-5 -2 C-5 -9 0 -11 5 -11 C5 -5 1 -2 -5 -2z" fill="#9BE08A" stroke="#1F4F2A" stroke-width=".9" stroke-linejoin="round"/>
        <g class="pl-smoke">${[0, 1, 2].map(n => `<circle class="pl-puff green" cx="5.600" cy="-21" r="2.800" fill="rgba(210,245,200,.85)" style="animation-delay:-${((id * 0.83 + n * 0.9) % 3).toFixed(2)}s"/>`).join('')}</g>`;
    default: // wind
      return `${SHADOW}<rect x="-6.500" y="-3.200" width="13" height="4.200" rx="1.200" fill="#5C5C64" stroke="#2B2B30" stroke-width="1.100"/><rect x="-6.500" y="-1.400" width="13" height="1.800" fill="${c}"/>
        <path d="M-1.600 -3 L-.8 -24 L.8 -24 L1.600 -3z" fill="#F6F6F2" stroke="#8A8A90" stroke-width=".7" stroke-linejoin="round"/>
        <g transform="translate(0,-24)"><g class="pl-blades" style="${delay}">${[0, 120, 240].map(a => `<path d="M0 0 L-1.500 -12.500 L1.500 -12.500z" transform="rotate(${a})" fill="#FFFFFF" stroke="#8A8A90" stroke-width=".7" stroke-linejoin="round"/>`).join('')}</g><circle r="2.200" fill="${c}" stroke="${d}" stroke-width="1"/></g>`;
  }
}

// where a plant stands: on its tile, toward the corner of the building it belongs to
export function plantPos(board, plants, x) {
  const h = board.hexes[x.hex], v = board.vertices[x.v];
  const cx = h.x * S, cy = h.y * S + 4, vx = v.x * S, vy = v.y * S;
  const k = 0.55;
  const mates = plants.filter(y => y.hex === x.hex && y.v === x.v).sort((a, b) => a.id - b.id);
  const i = mates.indexOf(x);
  const dx = vx - cx, dy = vy - cy, l = Math.hypot(dx, dy) || 1;
  const off = (i - (mates.length - 1) / 2) * 15;
  return [cx + dx * k + (-dy / l) * off, cy + dy * k + (dx / l) * off];
}
