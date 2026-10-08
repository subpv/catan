// Board art for Traders & Barbarians: swamps and rivers, the watering hole and its merchant trains, the castle, quarry and glassworks,
// barbarians, knights on the paths, wagons. hubExt(view) returns the hooks renderBoard (board.js) calls.
import { PCOLOR, PCOLOR_DARK, inkOn, t } from './core.js';
import { settlementPath, cityPath } from './board.js';

const S = 56;
const f = n => n.toFixed(1);
const EDGE_DOT = { brown: '#8B5A2B', green: '#4C9A3F', purple: '#7A3FA0' };

// ---------------------------------------------------------------- small drawings
const barbarianFig = (x, y, k = 1, dark = false) => `<g transform="translate(${f(x)},${f(y)}) scale(${k})"><ellipse cy="9" rx="7" ry="2.4" fill="rgba(0,0,0,.35)"/>
  <path d="M-6 9 L-5 -1 Q0 -4 5 -1 L6 9 Z" fill="${dark ? '#4A2C18' : '#9A5A2A'}" stroke="#2B1608" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cy="-6" r="4.2" fill="#E8B98A" stroke="#2B1608" stroke-width="1.1"/>
  <path d="M-4.6 -7 Q0 -13 4.6 -7 Z" fill="#B8B2A6" stroke="#2B1608" stroke-width="1"/><path d="M-4.6 -8 L-7.4 -11.4 M4.6 -8 L7.4 -11.4" stroke="#EDE6D2" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M7 -2 L9 11" stroke="#5A3A1C" stroke-width="1.7" stroke-linecap="round"/><path d="M6 -4 L11 -2 L8 1 Z" fill="#9AA3AB" stroke="#2B1608" stroke-width=".8"/></g>`;

const wagonFig = (x, y, ang, fill = '#D8CFB8', ink = '#5A4A32', k = 1) => `<g transform="translate(${f(x)},${f(y)}) rotate(${f(ang)}) scale(${k})">
  <ellipse cy="9" rx="13" ry="2.4" fill="rgba(0,0,0,.3)"/>
  <rect x="-11" y="-2" width="22" height="9" rx="2" fill="#8A6234" stroke="${ink}" stroke-width="1.3"/>
  <path d="M-10 -2 Q-10 -11 0 -11 Q10 -11 10 -2 Z" fill="${fill}" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M-5 -2 Q-5 -9 0 -9.6 M5 -2 Q5 -9 0 -9.6" fill="none" stroke="${ink}" stroke-width=".8" opacity=".6"/>
  <circle cx="-6" cy="7" r="3.1" fill="#EBD9B0" stroke="${ink}" stroke-width="1.2"/><circle cx="6" cy="7" r="3.1" fill="#EBD9B0" stroke="${ink}" stroke-width="1.2"/>
  <path d="M-6 4 V10 M-9 7 H-3 M6 4 V10 M3 7 H9" stroke="${ink}" stroke-width=".7"/></g>`;

const knightFig = (c, big = false) => `<g transform="scale(${big ? 1.15 : 1})"><ellipse cy="12" rx="9" ry="2.6" fill="rgba(0,0,0,.35)"/>
  <path d="M-8 11 L-6 -1 Q0 -6 6 -1 L8 11 Z" fill="${PCOLOR[c]}" stroke="${PCOLOR_DARK[c]}" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cy="-7" r="4.8" fill="#EBC9A5" stroke="${PCOLOR_DARK[c]}" stroke-width="1.5"/>
  <path d="M-5.2 -7.4 Q0 -14.5 5.2 -7.4 L5.2 -5.4 H-5.2 Z" fill="${PCOLOR[c]}" stroke="${PCOLOR_DARK[c]}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M-0.6 -13 Q3 -16 5 -13" fill="none" stroke="${PCOLOR_DARK[c]}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M9 12 V-8" stroke="#5A3A1C" stroke-width="1.8" stroke-linecap="round"/><path d="M9 -8 L13 -5 L9 -3 Z" fill="${PCOLOR[c]}" stroke="${PCOLOR_DARK[c]}" stroke-width="1"/></g>`;

// the pieces that stand on a tile: a sunken swamp, the waterhole, the castle, the quarry and the glassworks
function reeds(cx, cy) {
  let g = '';
  [[-26, 6], [-18, 14], [22, 8], [28, 18], [-30, 20]].forEach(([x, y], i) => {
    g += `<g transform="translate(${f(cx + x)},${f(cy + y)})"><path d="M0 0 V-12" stroke="#4A5A2E" stroke-width="1.6"/><path d="M-3 0 q3 -6 3 -12 M3 0 q-3 -6 -3 -12" stroke="#5E7A3A" stroke-width="1.2" fill="none"/><rect x="-1.6" y="-17" width="3.2" height="7" rx="1.5" fill="#7A4A23" stroke="#3A200C" stroke-width=".7"/></g>`;
    if (i === 1) g += `<ellipse cx="${f(cx - 4)}" cy="${f(cy + 24)}" rx="8" ry="2.4" fill="rgba(60,100,110,.55)"/>`;
  });
  g += `<ellipse cx="${f(cx + 12)}" cy="${f(cy + 33)}" rx="11" ry="3.2" fill="rgba(60,100,110,.55)"/><ellipse cx="${f(cx - 18)}" cy="${f(cy - 22)}" rx="9" ry="3" fill="rgba(60,100,110,.5)"/><ellipse cx="${f(cx + 20)}" cy="${f(cy - 18)}" rx="6" ry="2.2" fill="rgba(60,100,110,.5)"/>`;
  return `<g class="hub-swamp" pointer-events="none">${g}</g>`;
}
function waterhole(cx, cy) {
  return `<g class="hub-waterhole" pointer-events="none"><ellipse cx="${f(cx)}" cy="${f(cy + 4)}" rx="26" ry="16" fill="#4FA3BD" stroke="#fff" stroke-width="2"/>
    <path d="M${f(cx - 14)} ${f(cy + 1)} q4 -4 8 0 t8 0 t8 0" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.8" stroke-linecap="round"/>
    <g transform="translate(${f(cx - 22)},${f(cy - 4)})"><path d="M0 8 Q-1 -8 -5 -16 M0 8 Q2 -6 8 -12 M0 8 Q4 -2 12 -4 M0 8 Q-4 -2 -10 -4" stroke="#3E6B2E" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="-1.2" y="-2" width="2.4" height="10" fill="#7A4A23"/></g>
    <g transform="translate(${f(cx + 20)},${f(cy - 14)})"><path d="M-9 8 L0 -8 L9 8 Z" fill="#E8D8B0" stroke="#7A4A23" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 -8 V8 M-3 8 L0 1 L3 8" stroke="#7A4A23" stroke-width="1" fill="none"/></g></g>`;
}
function castleArt(cx, cy) {
  const tower = (x, h) => `<rect x="${x}" y="${-h}" width="9" height="${h + 8}" fill="#B9B0A0" stroke="#4E463A" stroke-width="1.5"/><path d="M${x - 1} ${-h} V${-h - 3} H${x + 1.5} V${-h} M${x + 3.5} ${-h} V${-h - 3} H${x + 6} V${-h} M${x + 8} ${-h} V${-h - 3} H${x + 10} V${-h}" fill="#B9B0A0" stroke="#4E463A" stroke-width="1.1"/>`;
  return `<g class="hub-castle" transform="translate(${f(cx)},${f(cy + 4)})" pointer-events="none"><ellipse cy="10" rx="26" ry="5" fill="rgba(0,0,0,.28)"/>
    ${tower(-26, 16)}${tower(17, 16)}<rect x="-18" y="-10" width="36" height="20" fill="#CFC6B4" stroke="#4E463A" stroke-width="1.6"/>
    <path d="M-18 -10 V-13 H-14 V-10 M-9 -10 V-13 H-5 V-10 M0 -10 V-13 H4 V-10 M9 -10 V-13 H13 V-10 M17 -10 V-13 H18" fill="#CFC6B4" stroke="#4E463A" stroke-width="1.1"/>
    <path d="M-6 10 V0 a6 6 0 0 1 12 0 V10 Z" fill="#4A3426" stroke="#2B1E12" stroke-width="1.3"/>
    <path d="M0 -22 V-34" stroke="#4E463A" stroke-width="1.6"/><path d="M0 -34 L11 -30 L0 -26 Z" fill="#B3261E" stroke="#5C120D" stroke-width="1"/>
    <rect x="-23" y="-8" width="3" height="6" rx="1.4" fill="#4A3426"/><rect x="20" y="-8" width="3" height="6" rx="1.4" fill="#4A3426"/></g>`;
}
function quarryArt(cx, cy) {
  const block = (x, y, w, h, c) => `<path d="M${x} ${y} h${w} v${h} h${-w} z" fill="${c}" stroke="#6B6A66" stroke-width="1.2"/><path d="M${x} ${y} l3 -3 h${w} l-3 3 M${x + w} ${y} l3 -3 v${h} l-3 3" fill="#EDEAE2" stroke="#6B6A66" stroke-width="1"/>`;
  return `<g class="hub-quarry" transform="translate(${f(cx)},${f(cy + 6)})" pointer-events="none"><ellipse cy="12" rx="28" ry="5" fill="rgba(0,0,0,.25)"/>
    <path d="M-30 12 L-18 -14 L-6 -4 L6 -22 L22 4 L30 12 Z" fill="#B7AFA2" stroke="#6B6A66" stroke-width="1.5" stroke-linejoin="round"/>
    ${block(-24, 2, 14, 9, '#E6E2D8')}${block(-8, 3, 12, 8, '#F4F1EA')}${block(8, 1, 16, 10, '#DDD8CC')}${block(-14, -7, 12, 9, '#F4F1EA')}
    <g transform="translate(18,-16) rotate(24)"><path d="M0 14 V-12" stroke="#7A4A23" stroke-width="2.6" stroke-linecap="round"/><path d="M-9 -12 Q0 -17 9 -12" fill="none" stroke="#6B6A66" stroke-width="2.8" stroke-linecap="round"/></g></g>`;
}
function glassworksArt(cx, cy) {
  return `<g class="hub-glass" transform="translate(${f(cx)},${f(cy + 5)})" pointer-events="none"><ellipse cy="12" rx="26" ry="5" fill="rgba(0,0,0,.28)"/>
    <rect x="-20" y="-8" width="40" height="20" fill="#E8D8B0" stroke="#5A3A1C" stroke-width="1.6"/><path d="M-24 -8 L0 -26 L24 -8 Z" fill="#B5482C" stroke="#5A3A1C" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="12" y="-30" width="7" height="14" fill="#8C6A4A" stroke="#5A3A1C" stroke-width="1.2"/><circle cx="16" cy="-35" r="3.4" fill="rgba(240,234,224,.8)"/>
    <path d="M-12 12 V-2 a6 6 0 0 1 12 0 V12 Z" fill="#7FC4E8" stroke="#5A3A1C" stroke-width="1.4"/><path d="M-6 -4 V12 M-12 4 H0" stroke="#fff" stroke-width=".9" opacity=".8"/>
    <rect x="4" y="-2" width="11" height="9" fill="#F2B84B" stroke="#5A3A1C" stroke-width="1.2"/><path d="M9.5 -2 V7 M4 2.5 H15" stroke="#B5482C" stroke-width=".9"/></g>`;
}

// the stream across a river tile: in through the shared edge (or out of the swamp), through the middle, out the other side
function riverSegment(board, h, cx, cy, hexEdges, mid) {
  const strip = (board.rivers || []).find(st => st.includes(h.id));
  if (!strip) return '';
  const i = strip.indexOf(h.id);
  const prev = i > 0 ? strip[i - 1] : null, next = i + 1 < strip.length ? strip[i + 1] : null;
  const own = hexEdges(h);
  const edgeOf = (a, b) => { const bs = new Set(hexEdges(board.hexes[b])); return hexEdges(board.hexes[a]).find(e => bs.has(e)); };
  const pts = [];
  if (prev != null) pts.push(mid(edgeOf(prev, h.id)));
  else if (next != null) { // the source: the river leaves across the edge opposite the first crossing
    const k = own.indexOf(edgeOf(h.id, next));
    pts.push(mid(own[(k + 3) % 6]));
  }
  pts.push([cx, cy]);
  if (next != null) pts.push(mid(edgeOf(h.id, next)));
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
    const w = k % 2 ? 5 : -5;
    d += ` Q${f(mx + nx / nl * w)} ${f(my + ny / nl * w)} ${f(x1)} ${f(y1)}`;
  }
  return `<g class="hub-river" pointer-events="none"><path d="${d}" fill="none" stroke="#2F7FA0" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#7CCBE4" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="flow" d="${d}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="4 7"/></g>`;
}

// ---------------------------------------------------------------- the hooks
export function hubExt(view) {
  if (view.expansion !== 'traders' || !view.hub) return null;
  const board = view.board, hub = view.hub, colorOf = p => view.players[p].color;
  const scen = hub.scenario;
  const mid = e => { const [a, b] = board.edges[e].v.map(k => board.vertices[k]); return [(a.x + b.x) / 2 * S, (a.y + b.y) / 2 * S, Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI]; };
  const eKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const eIdx = new Map();
  board.edges.forEach(e => eIdx.set(eKey(e.v[0], e.v[1]), e.id));
  const hexEdges = h => h.verts.map((v, c) => eIdx.get(eKey(v, h.verts[(c + 1) % 6])));
  const flatAng = a => { let x = a; if (x > 90) x -= 180; if (x < -90) x += 180; return x; };
  const bb = hub.bb, cv = hub.cv, tbd = hub.tb;
  const conq = new Set(bb ? bb.conquered : []);
  const lost = new Set(bb ? bb.lost.map(String) : []);

  return {
    color: h => (h.terrain === 'swamp' ? '#6F7F4E' : null),
    glyph: h => (['swamp', 'lake', 'waterhole', 'castle', 'quarry', 'glassworks'].includes(h.terrain) ? null : undefined),
    // drawn on the tile itself, under the number chip
    art(h, cx, cy) {
      let g = '';
      if (h.river) g += riverSegment(board, h, cx, cy, hexEdges, mid);
      switch (h.terrain) {
        case 'swamp': g += reeds(cx, cy); break;
        case 'waterhole': g += waterhole(cx, cy); break;
        case 'castle': g += castleArt(cx, cy); break;
        case 'quarry': g += quarryArt(cx, cy); break;
        case 'glassworks': g += glassworksArt(cx, cy); break;
        default: break;
      }
      if (board.centers && board.centers[h.id] != null) { // the four paths of a target tile lead to its building
        const A = board.vertices[board.centers[h.id]];
        board.edges.forEach(e => {
          if (!e.v.includes(board.centers[h.id])) return;
          const o = board.vertices[e.v[0] === board.centers[h.id] ? e.v[1] : e.v[0]];
          g += `<line x1="${f(A.x * S)}" y1="${f(A.y * S)}" x2="${f(o.x * S)}" y2="${f(o.y * S)}" stroke="#7A5A34" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="1 6" opacity=".9"/>`;
        });
        g += `<circle cx="${f(A.x * S)}" cy="${f(A.y * S)}" r="5" fill="#EDE3C8" stroke="#4A3426" stroke-width="1.6"/>`;
      }
      return g;
    },
    // after all tiles: the waterhole's arrows, bridge sites, castle colours, barbarians and conquered tiles
    tiles({ view: v }) {
      let g = '';
      // the X markers: no road on the sea side of a commodity hex that has only four paths
      (board.blocked || []).forEach(e => {
        const [x, y] = mid(e);
        g += `<g transform="translate(${f(x)},${f(y)})" pointer-events="none"><title>${t('No roads on this side of the commodity hex')}</title><circle r="7.5" fill="#9B1C1C" stroke="#F4E8D0" stroke-width="1.6"/><path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="#F4E8D0" stroke-width="2" stroke-linecap="round"/></g>`;
      });
      // the watering holes' arrows: the start locations of the merchant trains (two holes in a 5-6 player game)
      (board.waterholes || (board.waterhole ? [board.waterhole] : [])).forEach(wh0 => {
        const wh = board.hexes[wh0.hex];
        wh0.arrows.forEach(e => {
          const [x, y] = mid(e), [ia, ib] = board.edges[e].v;
          const inner = board.vertices[wh.verts.includes(ia) ? ia : ib];
          const out = board.vertices[wh.verts.includes(ia) ? ib : ia];
          const ang = Math.atan2(out.y - inner.y, out.x - inner.x) * 180 / Math.PI;
          if (cv && cv.wagons[e] !== undefined) return;
          g += `<g transform="translate(${f(x)},${f(y)}) rotate(${f(ang)})" pointer-events="none" opacity=".85"><path d="M-9 0 H7 M2 -5 L8 0 L2 5" fill="none" stroke="#3A5A2A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        });
      });
      (board.bridgeSites || []).forEach(e => {
        if (v.roads[e] !== undefined) return;
        const [x, y, ang] = mid(e);
        g += `<g transform="translate(${f(x)},${f(y)}) rotate(${f(flatAng(ang))})" pointer-events="none" opacity=".8"><path d="M-9 4 Q0 -8 9 4" fill="none" stroke="#F4EFE2" stroke-width="2.4" stroke-dasharray="3 3" stroke-linecap="round"/><path d="M-9 4 H9" stroke="#F4EFE2" stroke-width="1.4" opacity=".6"/></g>`;
      });
      if (bb) {
        (board.castles || [board.castle]).forEach(cid => { // the 5-6 player board has two castles
          const ch = board.hexes[cid];
          hexEdges(ch).forEach(e => { const [x, y] = mid(e); const dir = board.edgeDir[e]; g += `<circle cx="${f(x + (ch.x * S - x) * 0.18)}" cy="${f(y + (ch.y * S - y) * 0.18)}" r="5.4" fill="${EDGE_DOT[dir]}" stroke="#fff" stroke-width="1.6"/>`; });
        });
        (board.coast || []).forEach(id => {
          const h = board.hexes[id], n = bb.barb[id] || 0, cx = h.x * S, cy = h.y * S;
          if (conq.has(id)) {
            g += `<polygon points="${h.verts.map(k => `${f((h.x + (board.vertices[k].x - h.x) * 0.95) * S)},${f((h.y + (board.vertices[k].y - h.y) * 0.95) * S)}`).join(' ')}" fill="rgba(30,10,6,.5)" pointer-events="none"/>
              <g transform="translate(${f(cx)},${f(cy + 4)})" pointer-events="none"><title>${t('Conquered by the barbarians')}</title><circle r="17" fill="#3A2A22" stroke="#C9AE7C" stroke-width="1.5"/><path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#C9AE7C" stroke-width="3" stroke-linecap="round"/></g>`;
          }
          const pos = [[-22, 22], [0, 28], [22, 22]];
          for (let i = 0; i < n; i++) g += barbarianFig(cx + pos[i][0], cy + pos[i][1], 1.05);
        });
      }
      return g;
    },
    building(b, c, vid) {
      const base = b.type === 'city' ? cityPath(c) : settlementPath(c);
      if (lost.has(String(vid))) return `<g transform="rotate(78) translate(0,2)" opacity=".62" filter="grayscale(1)" style="filter:grayscale(.8)"><title>${t('Conquered: no points, no harbor')}</title>${base}</g>`;
      return base;
    },
    // above the buildings: knights on paths, wagons, barbarians on paths, damaged roads
    top({ targets }) {
      let g = '';
      Object.entries(hub.damaged || {}).forEach(([e, on]) => {
        if (!on || view.roads[e] === undefined) return;
        const [x, y, ang] = mid(+e), c = colorOf(view.roads[e]);
        g += `<g transform="translate(${f(x)},${f(y)}) rotate(${f(flatAng(ang) + 90)})" pointer-events="none"><title>${t('Damaged road: repair it with 1 lumber and 1 brick')}</title><rect x="-8" y="-4" width="16" height="8" rx="2" fill="${PCOLOR[c]}" stroke="${PCOLOR_DARK[c]}" stroke-width="2"/><path d="M-5 -4 L-1 1 L2 -3 L6 4" fill="none" stroke="#2B1E12" stroke-width="1.4"/></g>`;
      });
      if (cv) {
        Object.keys(cv.wagons).forEach(e => { const [x, y, ang] = mid(+e); g += `<g pointer-events="none"><title>${t('Trade wagon')}</title>${wagonFig(x, y - 2, flatAng(ang))}</g>`; });
        // the front of every merchant train that can still grow: a small arrow beyond its last wagon
        (cv.trains || []).forEach(tr => {
          if (!tr.started || tr.dead || !tr.edges.length) return;
          const last = tr.edges[tr.edges.length - 1], fv = board.vertices[tr.front];
          const [ia, ib] = board.edges[last].v, from = board.vertices[ia === tr.front ? ib : ia];
          const ang = Math.atan2(fv.y - from.y, fv.x - from.x) * 180 / Math.PI;
          g += `<g transform="translate(${f(fv.x * S)},${f(fv.y * S)}) rotate(${f(ang)})" pointer-events="none"><title>${t('Front of the merchant train')}</title><path d="M-4 -6 L4 0 L-4 6" fill="none" stroke="#F0C24A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        });
      }
      if (bb) {
        Object.entries(bb.knights).forEach(([e, k]) => {
          const [x, y] = mid(+e), c = colorOf(k.p);
          const own = targets.ownKnightEdges && targets.ownKnightEdges.includes(+e);
          const sel = targets.pickedKnight === +e;
          g += `<g transform="translate(${f(x)},${f(y - 2)})" ${own ? `class="hub-hit" data-hub="knight:${e}"` : 'pointer-events="none"'}><title>${t('Knight')}</title>${knightFig(c)}${own ? `<circle class="knight-ring" r="19" cy="2" fill="none" stroke="#F0C24A" stroke-width="2.5" stroke-dasharray="4 3"/><circle r="21" cy="2" fill="transparent" style="cursor:pointer"/>` : ''}${sel ? '<circle r="21" cy="2" fill="none" stroke="#fff" stroke-width="3"/>' : ''}</g>`;
        });
      }
      (targets.wagonSteps || []).forEach(st => {
        const vx = board.vertices[st.to];
        g += `<g transform="translate(${f(vx.x * S + 15)},${f(vx.y * S - 15)})" pointer-events="none"><circle r="9" fill="#2B1E12" stroke="#F0C24A" stroke-width="1.5"/><text y="4" text-anchor="middle" font-size="11" font-weight="800" fill="#FFF3DC" font-family="Inter">${st.cost}${st.pays != null ? '+g' : ''}</text></g>`;
      });
      if (tbd) {
        Object.keys(tbd.barb).forEach(e => { const [x, y] = mid(+e); g += `<g pointer-events="none"><title>${t('Barbarian')}</title>${barbarianFig(x, y - 2, 1.25)}</g>`; });
        const byV = {};
        Object.entries(tbd.wagons).forEach(([p, v]) => { (byV[v] ||= []).push(+p); });
        Object.entries(byV).forEach(([v, ps]) => {
          const vx = board.vertices[v];
          ps.forEach((p, i) => {
            const c = colorOf(p), dx = (i - (ps.length - 1) / 2) * 17;
            const mine = targets.ownWagon === p;
            g += `<g pointer-events="none"><title>${t('Wagon')}</title>${wagonFig(vx.x * S + dx, vx.y * S - 7, 0, PCOLOR[c], PCOLOR_DARK[c], 0.95)}${mine ? `<circle cx="${f(vx.x * S + dx)}" cy="${f(vx.y * S - 4)}" r="17" fill="none" stroke="#F0C24A" stroke-width="2.5" stroke-dasharray="4 3" class="knight-ring"/>` : ''}</g>`;
          });
        });
      }
      return g;
    },
  };
}
