// Dawn of Humankind: the world map as one SVG. Land fields (flat-topped hexes) with their living scenes, the glacier in
// the north, paths and crossings, camp site tiles, discovery fields with their conditions, hunting clouds, camps,
// explorers and the two threats. The server sends the geometry (view.board) and the state (view.humankind).
import { t, term } from '../../core/core.js';
import * as art from './art.js';

const S = 56;
const f = n => n.toFixed(1);
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const hash = (id, k) => { const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const seedOf = id => { let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) % 997; return h; };
export const WORLD = { x: -1.9, y: -10.4, w: 24.8, h: 18.2 }; // the whole map in board units

// where the glacier ends in the south (board units): above this line everything is ice
const ICE = [[1.5, -10.8], [23.4, -10.8], [23.4, -3.9], [21.4, -4.2], [19.6, -4.1], [18.2, -4.7], [16.8, -5.1], [15.4, -5.2], [13.6, -5.0], [12.2, -5.4],
  [10.6, -5.6], [8.8, -5.2], [7.0, -5.0], [5.6, -5.4], [4.4, -4.9], [3.3, -4.5], [2.2, -4.9], [1.3, -5.7], [0.9, -7.5]];
// loose floes in the sea (decoration)
const FLOES = [[-0.6, 3.6, 1.5, .5], [0.9, 5.7, 1.0, .35], [6.2, 3.8, 1.2, .38], [8.6, 2.5, .9, .3], [18.0, 1.2, 1.1, .3], [16.6, 6.8, .9, .3], [-1.0, -2.4, 1.0, .35], [20.4, -1.2, .9, .3]];

const hexPts = (board, h, k = 1) => h.verts.map(id => { const v = board.vertices[id]; return `${f((h.x + (v.x - h.x) * k) * S)},${f((h.y + (v.y - h.y) * k) * S)}`; }).join(' ');

export function boundsOf(board) {
  if (board.clouds) return [WORLD.x * S, WORLD.y * S, WORLD.w * S, WORLD.h * S];
  const xs = board.vertices.map(v => v.x), ys = board.vertices.map(v => v.y);
  const pad = 1.05;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  return [x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S];
}

function defs() {
  const grad = (id, a, b) => `<radialGradient id="${id}" cx="45%" cy="38%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
  return `<defs>
    ${grad('hkg-forest', '#3F8450', '#235A2E')}${grad('hkg-wasteland', '#EFCF68', '#CDA03A')}${grad('hkg-grassland', '#A9DC72', '#7CBA48')}${grad('hkg-mountains', '#9296A0', '#5F646E')}
    <linearGradient id="hkg-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FCDEB"/><stop offset=".55" stop-color="#4AA6D6"/><stop offset="1" stop-color="#2E86BC"/></linearGradient>
    <linearGradient id="hkg-ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#E4F1F8"/><stop offset="1" stop-color="#C9E0EE"/></linearGradient>
    <radialGradient id="hkg-tok" cx="40%" cy="35%"><stop offset="0" stop-color="#FFFBEE"/><stop offset="1" stop-color="#EEDCB0"/></radialGradient>
    <radialGradient id="hkg-shallow" cx="50%" cy="50%" r="60%"><stop offset=".55" stop-color="#A9E4F0" stop-opacity=".95"/><stop offset="1" stop-color="#7FCDEB" stop-opacity="0"/></radialGradient>
  </defs>`;
}

function seaAndIce(board, bx, by, bw, bh, side, life) {
  const out = [];
  if (board.clouds) out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" fill="url(#hkg-sea)"/>`);
  let waves = '';
  for (let i = 0; i < 26; i++) {
    const wx = bx + ((i * 0.37 + 0.11) % 1) * bw, wy = by + ((i * 0.61 + 0.07) % 1) * bh;
    waves += `<path class="wave w${i % 3}" d="M${f(wx)} ${f(wy)} q8 -5 16 0 t16 0" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round"/>`;
  }
  out.push(`<g>${waves}</g>`);
  if (!board.clouds) return out.join('');
  FLOES.forEach(([x, y, r, o], i) => out.push(`<ellipse class="${life ? 'hk-floe' : ''}" cx="${f(x * S)}" cy="${f(y * S)}" rx="${f(r * S * 0.75)}" ry="${f(r * S * 0.38)}" fill="rgba(255,255,255,${o})" stroke="rgba(255,255,255,.55)" stroke-width="1.500" style="animation-delay:-${(i * 1.3).toFixed(1)}s"/>`));
  // the glacier
  const d = ICE.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x * S)} ${f(y * S)}`).join(' ') + 'Z';
  out.push(`<path d="${d}" fill="url(#hkg-ice)" stroke="#BCD8E8" stroke-width="3" stroke-linejoin="round"/>`);
  let streaks = '';
  for (let i = 0; i < 34; i++) {
    const x = 2 + hash(7, i) * 21, y = -10.2 + hash(8, i) * 4.8, l = .6 + hash(9, i) * 1.2;
    streaks += `<path d="M${f(x * S)} ${f(y * S)} l${f(l * S * 0.5)} ${f(l * S * 0.8)}" stroke="rgba(120,160,185,${(0.16 + hash(3, i) * 0.14).toFixed(2)})" stroke-width="${f(2 + hash(4, i) * 3)}" stroke-linecap="round"/>`;
  }
  out.push(`<g>${streaks}</g>`);
  [[3.4, -7.9, .9], [6.2, -9.0, 1.1], [9.4, -8.9, .9], [12.8, -9.4, 1.1], [16.2, -9.1, 1], [19.6, -9.6, 1.2], [14.2, -7.6, .7], [21.6, -8.2, .9]].forEach(([x, y, s]) => out.push(art.iceCrest(x * S, y * S, s)));
  // the land bridge between Asia and America: shallow, pale green water between the ice
  out.push(`<ellipse cx="${f(13.0 * S)}" cy="${f(-5.95 * S)}" rx="${f(2.3 * S)}" ry="${f(0.95 * S)}" fill="url(#hkg-shallow)"/>`);
  // polar bears: one more on the 4 player side
  const bears = side >= 4 ? 4 : 3;
  const spots = [[20.2, -6.2], [21.1, -6.9], [20.6, -5.3], [21.9, -5.9]];
  for (let i = 0; i < bears; i++) out.push(`<g transform="translate(${f(spots[i][0] * S)},${f(spots[i][1] * S)})${i % 2 ? ' scale(-.85,.85)' : ' scale(.85)'}">${art.polarBear(life)}</g>`);
  return out.join('');
}

function pathsLayer(board) {
  const under = [], over = [], links = [];
  const V = board.vertices;
  board.edges.forEach(e => {
    const [a, b] = e.v.map(i => V[i]);
    const link = a.kind !== 'land' || b.kind !== 'land';
    const ln = `x1="${f(a.x * S)}" y1="${f(a.y * S)}" x2="${f(b.x * S)}" y2="${f(b.y * S)}"`;
    if (link) links.push(`<line ${ln} stroke="rgba(255,255,255,.85)" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 8"/><line ${ln} stroke="rgba(190,230,245,.9)" stroke-width="3" stroke-linecap="round"/>`);
    else { under.push(`<line ${ln} stroke="#6A4B28" stroke-width="5.200" stroke-linecap="round"/>`); over.push(`<line ${ln} stroke="#D4B377" stroke-width="2.600" stroke-linecap="round"/>`); }
  });
  return `<g>${links.join('')}</g><g>${under.join('')}</g><g>${over.join('')}</g>`;
}

function borderLayer(board) {
  if (!board.border) return '';
  return `<g>${board.border.map(([i, j]) => {
    const a = board.vertices[i], b = board.vertices[j];
    return `<line x1="${f(a.x * S)}" y1="${f(a.y * S)}" x2="${f(b.x * S)}" y2="${f(b.y * S)}" stroke="#2B1E12" stroke-width="4.200" stroke-dasharray="7 5" stroke-linecap="butt" opacity=".9"/>`;
  }).join('')}</g>`;
}

function tileLayer(view, targetsHex, life, fr, rankOf) {
  const { board } = view, hk = view.humankind || {};
  const hitByThreat = h => Object.values(hk.threats || {}).includes(h.id);
  const out = [];
  board.hexes.forEach(h => {
    const cx = h.x * S, cy = h.y * S;
    out.push(`<polygon points="${hexPts(board, h, 1.13)}" fill="rgba(150,222,240,.4)" stroke="rgba(150,222,240,.4)" stroke-width="12" stroke-linejoin="round"/>`);
  });
  board.hexes.forEach(h => out.push(`<polygon points="${hexPts(board, h, 1.045)}" fill="#EBD9A8" stroke="#D8BE86" stroke-width="5" stroke-linejoin="round"/>`));
  board.hexes.forEach(h => {
    const cx = h.x * S, cy = h.y * S;
    const reveal = fr && fr.hexes && fr.hexes.has(h.id);
    out.push(`<g class="tile ${reveal ? 'fx-reveal' : ''} ${h.terrain}${h.dry ? ' dry' : ''}" data-num="${h.number || ''}" data-hex="${h.id}"><polygon points="${hexPts(board, h, 0.985)}" fill="url(#hkg-${h.terrain})" stroke="rgba(40,24,8,.28)" stroke-width="2"/>
      <polygon class="tile-glow" points="${hexPts(board, h, 0.9)}" fill="none" stroke="#FFF6DA" stroke-width="5"/>
      <polygon points="${hexPts(board, h, 0.85)}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/></g>`);
    if (h.dry) {
      // the chip is gone: the land has turned barren
      out.push(`<g pointer-events="none"><polygon points="${hexPts(board, h, 0.985)}" fill="rgba(222,205,160,.62)"/>
        <path d="M${f(cx - 30)} ${f(cy - 6)} l9 5 l-4 8 l11 4 M${f(cx + 6)} ${f(cy - 24)} l-5 9 l9 6 l-3 9 M${f(cx + 22)} ${f(cy + 4)} l-8 4 l4 8 M${f(cx - 14)} ${f(cy + 26)} l8 -4 l3 7" fill="none" stroke="rgba(96,70,32,.55)" stroke-width="1.600" stroke-linecap="round" stroke-linejoin="round"/>
        <g transform="translate(${f(cx)},${f(cy + 12)}) scale(.8)" opacity=".85"><path d="M-8 0 L6 -4 M-6 -3 L8 1" stroke="#F0E6CE" stroke-width="2.400" stroke-linecap="round"/><circle cx="-9" cy="-.4" r="1.500" fill="#F0E6CE"/><circle cx="7.400" cy="-4.600" r="1.500" fill="#F0E6CE"/></g></g>`);
    } else if (life) {
      if (hitByThreat(h)) out.push(`<polygon class="lf-dim" points="${hexPts(board, h, 0.985)}" fill="rgba(24,10,4,.38)"/>`);
      else out.push(`<g class="life">${art.tileLife(h, cx, cy, rankOf[h.id], seedOf(view.id))}</g>`);
    } else if (hitByThreat(h)) out.push(`<polygon points="${hexPts(board, h, 0.985)}" fill="rgba(24,10,4,.3)" pointer-events="none"/>`);
    if (h.number) {
      const red = h.number === 6 || h.number === 8, pips = PIPS[h.number] || 0;
      let dots = '';
      for (let i = 0; i < pips; i++) dots += `<circle cx="${(i - (pips - 1) / 2) * 3.900}" cy="8.200" r="1.450" fill="${red ? '#C1272D' : '#2B1E12'}"/>`;
      out.push(`<g transform="translate(${f(cx)},${f(cy + 3)})"><g class="ntok" data-n="${h.number}"><ellipse cx="1.200" cy="2" rx="15.500" ry="14" fill="rgba(0,0,0,.28)"/><circle r="15.500" fill="url(#hkg-tok)" stroke="#C9AE7C" stroke-width="1.500"/>
        <text y="3.800" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="800" font-size="${red ? 17.500 : 16}" fill="${red ? '#C1272D' : '#2B1E12'}">${h.number}</text>${dots}</g></g>`);
    }
  });
  if (targetsHex && targetsHex.length) targetsHex.forEach(id => { const h = board.hexes[id]; out.push(`<polygon class="hl-h" data-h="${id}" points="${hexPts(board, h, 0.92)}"/>`); });
  return out.join('');
}

// camp sites, discovery fields, start places
function marksLayer(view, life, me) {
  const { board } = view, hk = view.humankind || {};
  const V = board.vertices;
  const out = [];
  const taken = new Set(Object.keys(view.buildings).map(Number));
  // nodes: the little brown circles of the crossings
  V.forEach(v => {
    if (v.kind === 'land') out.push(`<circle cx="${f(v.x * S)}" cy="${f(v.y * S)}" r="3.400" fill="#D9BE8A" stroke="#6A4B28" stroke-width="1.400"/>`);
    else out.push(`<circle cx="${f(v.x * S)}" cy="${f(v.y * S)}" r="5.200" fill="#FFFFFF" stroke="#7FB2D0" stroke-width="2" opacity=".95"/>`);
  });
  (board.starts || []).forEach(id => { if (!taken.has(id)) { const v = V[id]; out.push(`<g transform="translate(${f(v.x * S)},${f(v.y * S)}) scale(.82)">${art.handMark()}</g>`); } });
  // camp site tiles
  Object.entries(hk.sites || {}).forEach(([id, region]) => {
    const v = V[id];
    if (!v || taken.has(+id)) return;
    out.push(`<g transform="translate(${f(v.x * S)},${f(v.y * S)})"><g class="${life ? 'hk-tilepulse' : ''}">${art.siteTile(region === 'namerica' || region === 'samerica' ? 'america' : region, 0.92)}</g></g>`);
  });
  // discovery fields
  const lvl = me && me.tracks ? me.tracks : null;
  (board.dfs || []).forEach(d => {
    const v = V[d.v], st = (hk.df || [])[d.id] || { taken: null };
    const x = v.x * S, y = v.y * S;
    const okKl = lvl && lvl.clothing >= d.kl, okKo = lvl && lvl.construction >= d.ko;
    out.push(`<g transform="translate(${f(x)},${f(y)})" class="hk-df ${st.taken == null ? '' : 'done'}"><circle r="8.500" fill="none" stroke="#F0C24A" stroke-width="2.200" stroke-dasharray="3.600 2.600" opacity="${st.taken == null ? 1 : 0.55}"/>
      ${st.taken == null ? `<g transform="translate(0,-17)"><g class="${life ? 'hk-dfbob' : ''}">${art.dfTile(d.region, 0.82)}</g></g>` : ''}
      <g transform="translate(-16,11.500) scale(1.08)" opacity="${st.taken == null ? 1 : 0.55}">${art.needBadge('kl', d.kl, okKl)}</g><g transform="translate(16,11.500) scale(1.08)" opacity="${st.taken == null ? 1 : 0.55}">${art.needBadge('ko', d.ko, okKo)}</g></g>`);
  });
  return out.join('');
}

function cloudsLayer(view, life) {
  const { board } = view, hk = view.humankind || {};
  if (!board.clouds) return '';
  const colorOf = p => view.players[p].color;
  return (hk.jagd || []).map(m => {
    const c = board.clouds[m.region];
    return c ? `<g transform="translate(${f(c[0] * S)},${f(c[1] * S)})"><title>${esc(term(m.region))}</title>${art.cloud(m.region, m.by, colorOf)}</g>` : '';
  }).join('');
}

export function renderWorld(view, targets = {}, fresh = null, zoom = null, life = false) {
  const { board } = view, hk = view.humankind || {};
  const fr = fresh || {};
  const [bx, by, bw, bh] = boundsOf(board);
  const me = view.me >= 0 ? view.players[view.me] : null;
  const rankOf = {}, rankN = {};
  board.hexes.forEach(h => { rankOf[h.id] = rankN[h.terrain] = (rankN[h.terrain] ?? -1) + 1; });
  const out = [];
  out.push(`<svg class="board hk-world ${life ? 'alive' : ''}" style="touch-action:${zoom && zoom.z > 1 ? 'none' : 'pan-y'}" viewBox="${f(bx)} ${f(by)} ${f(bw)} ${f(bh)}" data-base="${f(bx)} ${f(by)} ${f(bw)} ${f(bh)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dawn of Humankind">`);
  out.push(defs());
  out.push(seaAndIce(board, bx, by, bw, bh, board.side || 4, life));
  out.push(tileLayer(view, targets.hexes, life, fr, rankOf));
  out.push(borderLayer(board));
  out.push(pathsLayer(board));
  out.push(marksLayer(view, life, me));
  out.push(cloudsLayer(view, life));

  // camps (they harvest; only explorers walk)
  for (const [vid, b] of Object.entries(view.buildings)) {
    const v = board.vertices[vid];
    const c = view.players[b.p].color;
    const isNew = fr.verts && fr.verts.has(+vid);
    const body = `<path d="${art.CAMP_D}" transform="translate(1.800,2.800)" fill="rgba(0,0,0,.34)" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linejoin="round"/>${art.building(b, c)}${isNew ? `<path class="fx-flash" d="${art.CAMP_D}" fill="#FFF3C4" stroke="#FFF8DE" stroke-width="2.500" stroke-linejoin="round"/>` : ''}`;
    out.push(`<g transform="translate(${f(v.x * S)},${f(v.y * S)}) scale(1.25)">${isNew ? '<circle class="fx-dust" r="10"/>' : ''}<g class="${isNew ? 'fx-drop' : ''}">${body}</g></g>`);
  }
  // explorers
  (hk.explorers || []).forEach(e => {
    const v = board.vertices[e.v];
    const c = view.players[e.p].color;
    const isNew = fr.explorers && fr.explorers.has(e.v);
    const sel = targets.vertices && targets.vertices.includes(e.v);
    out.push(`<g transform="translate(${f(v.x * S)},${f(v.y * S - 1)}) scale(1.7)" ${e.p === view.me ? 'class="hk-mine"' : ''}><title>${esc(view.players[e.p].name)}</title>${isNew ? '<circle class="fx-dust" r="9"/>' : ''}<g class="${isNew ? 'fx-drop' : ''}">${art.explorer(c, { moved: e.moved && view.phase === 'play' && e.p === view.current, life })}</g>${sel ? '<circle class="knight-ring" cy="-9" r="17" fill="none" stroke="#F0C24A" stroke-width="2.200" stroke-dasharray="4 3"/>' : ''}</g>`);
  });
  // threats: on their field, or still waiting on the glacier
  const T = hk.threats || {};
  [['neanderthal', art.neanderthal, 0.95], ['tiger', art.sabertooth, 0.88]].forEach(([name, draw, sc]) => {
    const h = T[name] != null ? board.hexes[T[name]] : null;
    const isNew = fr.threats && fr.threats.has(name);
    if (h) out.push(`<g transform="translate(${f(h.x * S - (h.number ? 24 : 0))},${f(h.y * S + 14)}) scale(${sc})" pointer-events="none"><title>${esc(t(name === 'neanderthal' ? 'Neanderthal' : 'Saber-toothed tiger'))}</title>${draw(life, isNew)}</g>`);
    else if (board.home && board.home[name]) {
      const p = board.home[name];
      out.push(`<g transform="translate(${f(p[0] * S)},${f(p[1] * S)}) scale(${sc * 1.05})" pointer-events="none" opacity=".92"><title>${esc(t(name === 'neanderthal' ? 'Neanderthal' : 'Saber-toothed tiger'))}</title>${draw(life, false)}</g>`);
    }
  });

  // tap targets above every piece
  if (targets.vertices) targets.vertices.forEach(id => {
    const v = board.vertices[id];
    out.push(`<circle class="hl-v" data-v="${id}" cx="${f(v.x * S)}" cy="${f(v.y * S)}" r="8.500"/><circle data-v="${id}" cx="${f(v.x * S)}" cy="${f(v.y * S)}" r="17" fill="transparent" style="cursor:pointer"/>`);
  });
  out.push('</svg>');
  return out.join('');
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
