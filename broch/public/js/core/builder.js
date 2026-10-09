// The little builder. When a road, settlement or city is built, nothing just "lights up": a builder in the player's
// colour comes out of the nearest house of that colour, runs along that player's roads to the spot, hammers the piece
// into place and walks home again.
//
// Everything is plain data plus CSS keyframes that are generated per job. A job remembers when it started, so every
// redraw of the board (which rebuilds the SVG) continues the same animation at the right moment instead of restarting.
import { PCOLOR, PCOLOR_DARK } from './core.js';

const S = 56; // pixels per unit, same as board.js
const SPEED = 92; // px per second on the way out
const POP = 340; // the builder steps out of the door
const HOME = 320; // and steps back in
const MAX_WALK = 3400;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const JOBS = new Map();
let SEQ = 0;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const vx = (board, i) => board.vertices[i].x * S;
const vy = (board, i) => board.vertices[i].y * S;

// The builder never cuts across the land: he walks along edges of the board. This player's own roads are the way he
// prefers; where none is built yet he goes along free edges (where a road could be). Other players' roads, houses and
// ships block the way.
const LAND = new WeakMap();
function landGraph(board) {
  let g = LAND.get(board);
  if (g) return g;
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const land = new Set();
  board.hexes.forEach(h => {
    if (h.terrain === 'sea') return;
    for (let i = 0; i < h.verts.length; i++) land.add(key(h.verts[i], h.verts[(i + 1) % h.verts.length]));
  });
  const adj = new Map();
  board.edges.forEach(e => {
    const [a, b] = e.v;
    if (!land.has(key(a, b))) return;
    (adj.get(a) || adj.set(a, []).get(a)).push([b, e.id]);
    (adj.get(b) || adj.set(b, []).get(b)).push([a, e.id]);
  });
  g = { adj };
  LAND.set(board, g);
  return g;
}

// cheapest way from any of `starts` to a vertex that satisfies `goal`; returns the vertices goal ... start, or null
function route(view, p, starts, goal, { skip = new Set(), pending = new Set() } = {}) {
  const { adj } = landGraph(view.board);
  const cost = (e, to) => {
    if (skip.has(+e)) return Infinity;
    if (pending.has(+e)) return 1;
    const owner = view.roads[e];
    if (owner === p) return 0.3;
    if (owner !== undefined || (view.ships && view.ships[e])) return Infinity;
    const b = view.buildings[to];
    if (b && b.p !== p) return Infinity;
    return 1;
  };
  const dist = new Map(starts.map(s => [s, 0])), from = new Map(starts.map(s => [s, null])), done = new Set();
  for (;;) {
    let cur = null;
    for (const [v, d] of dist) if (!done.has(v) && (cur === null || d < dist.get(cur))) cur = v;
    if (cur === null) return null;
    if (goal(cur)) {
      const path = [];
      for (let c = cur; c !== null; c = from.get(c)) path.push(c);
      return path;
    }
    done.add(cur);
    for (const [n, e] of adj.get(cur) || []) {
      const d = dist.get(cur) + cost(e, n);
      if (d < (dist.has(n) ? dist.get(n) : Infinity)) { dist.set(n, d); from.set(n, cur); }
    }
  }
}

const lerp = (a, b, k) => a + (b - a) * k;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// the whole timeline of one builder as keyframe lists
function timeline(points, work) {
  // points: where he walks (board px); work: { kind:'site', at:[x,y], face } or { kind:'road', from:[x,y], to:[x,y] }
  const pos = [], face = [], phase = [], hits = [], grow = [];
  let t = 0;
  const first = points[0];
  pos.push([0, first[0], first[1], 0]);
  t = POP; pos.push([t, first[0], first[1], 1]);
  const legs = [];
  let len = 0;
  for (let i = 1; i < points.length; i++) { const d = dist(points[i - 1], points[i]); legs.push(d); len += d; }
  const speed = len / (MAX_WALK / 1000) > SPEED ? len / (MAX_WALK / 1000) : SPEED;
  let dir = 1;
  const step = (to, ms) => {
    const last = pos[pos.length - 1];
    if (to[0] !== last[1]) dir = to[0] > last[1] ? 1 : -1;
    if (Math.abs(to[0] - last[1]) > 0.5) face.push([t, dir]);
    t += ms;
    pos.push([t, to[0], to[1], 1]);
  };
  for (let i = 1; i < points.length; i++) step(points[i], Math.max(60, legs[i - 1] / speed * 1000));
  const arrive = t;
  const work0 = t;
  if (work.kind === 'site') {
    face.push([t, work.face]);
    const hitAt = [t + 420, t + 960, t + 1500];
    phase.push([t + 80, t + 1760]);
    hitAt.forEach((h, i) => { hits.push({ t: h, at: work.at }); grow.push([h, [0.4, 0.75, 1][i]]); });
    grow.unshift([t, 0]);
    t += 1800;
    pos.push([t, work.at[0], work.at[1], 1]);
  } else {
    const { from, to } = work;
    face.push([t, to[0] >= from[0] ? 1 : -1]);
    grow.push([t, 0]);
    for (let k = 1; k <= 3; k++) {
      const p = [lerp(from[0], to[0], k / 3), lerp(from[1], to[1], k / 3)];
      step(p, 240);
      phase.push([t, t + 540]);
      hits.push({ t: t + 270, at: p });
      grow.push([t + 270, k / 3]);
      t += 540;
      pos.push([t, p[0], p[1], 1]);
    }
  }
  const done = t;
  // and home again by the same way
  const back = [];
  for (let i = points.length - 1; i >= 0; i--) back.push(points[i]);
  const cur = pos[pos.length - 1];
  const route2 = work.kind === 'road' ? [[cur[1], cur[2]], work.from, ...back] : [[cur[1], cur[2]], ...back.slice(0)];
  let backLen = 0;
  for (let i = 1; i < route2.length; i++) backLen += dist(route2[i - 1], route2[i]);
  const bspeed = Math.max(SPEED * 1.2, backLen / (MAX_WALK / 1000));
  for (let i = 1; i < route2.length; i++) { const d = dist(route2[i - 1], route2[i]); if (d > 0.5) step(route2[i], Math.max(40, d / bspeed * 1000)); }
  t += HOME;
  pos.push([t, route2[route2.length - 1][0], route2[route2.length - 1][1], 0]);
  return { pos, face, phase, hits, grow, arrive, work0, done, total: t + 40 };
}

// the same timeline played k times as long (k < 1 = faster); every time stamp is the first number of its entry
function scaled(tl, k) {
  if (k === 1) return tl;
  const at = list => list.map(e => [e[0] * k, ...e.slice(1)]);
  return { pos: at(tl.pos), face: at(tl.face), phase: tl.phase.map(([a, b]) => [a * k, b * k]), hits: tl.hits.map(h => ({ ...h, t: h.t * k })), grow: at(tl.grow), arrive: tl.arrive * k, work0: tl.work0 * k, done: tl.done * k, total: tl.total * k };
}

// ---------------------------------------------------------------- jobs

function makeJob(view, kind, key, p, opts) {
  const { board } = view;
  const color = view.players[p].color;
  const active = [...JOBS.values()].filter(j => j.game === view.id);
  const pending = new Set(active.filter(j => j.edge != null).map(j => j.edge));
  // houses that are still being put up (or upgraded) cannot send anyone out yet
  const raising = new Set(active.filter(j => j.v != null).map(j => j.v));
  const mine = new Set(Object.entries(view.buildings).filter(([v, b]) => b.p === p && !raising.has(+v)).map(([v]) => +v));
  const door = i => [vx(board, i), vy(board, i) + 10];
  const at = i => [vx(board, i), vy(board, i)];
  let points, work, site = null, ghost = null, edge = null;

  if (kind === 'road') {
    edge = opts.edge;
    const [a, b] = board.edges[edge].v;
    const path = route(view, p, [a, b], v => mine.has(v), { skip: new Set([edge]), pending });
    const start = path ? path[path.length - 1] : a;
    const far = start === a ? b : a;
    const k = 0.16;
    const from = [lerp(vx(board, start), vx(board, far), k), lerp(vy(board, start), vy(board, far), k)];
    const to = [lerp(vx(board, far), vx(board, start), k), lerp(vy(board, far), vy(board, start), k)];
    points = path ? [door(path[0]), ...path.map(at), from] : [from]; // out of the door, along the way, onto the new road
    work = { kind: 'road', from, to };
    ghost = { from, to };
    return finish({ kind, key, p, color, edge, ghost, points, work, flip: start !== a });
  }

  // a building (new settlement, upgrade to a city, or a metropolis / wall on a city)
  const v = opts.v, T = at(v);
  mine.delete(v);
  const path = route(view, p, [v], x => mine.has(x), { pending });
  let stand; // where he stands while he works: on the edge that leads to the site, a little short of it
  const toward = path && path.length > 1 ? path[path.length - 2] : (landGraph(board).adj.get(v) || [])[0]?.[0];
  if (toward != null) {
    const U = at(toward), d = dist(T, U) || 1;
    stand = [T[0] + (U[0] - T[0]) * 18 / d, T[1] + (U[1] - T[1]) * 18 / d];
  } else stand = [T[0] + 17, T[1] + 10];
  points = path && path.length > 1 ? [door(path[0]), ...path.slice(0, -1).map(at), stand] : [stand];
  work = { kind: 'site', at: stand, face: stand[0] <= T[0] ? 1 : -1 };
  site = { x: T[0], y: T[1] };
  return finish({ kind, key, p, color, v, prev: opts.prev, site, points, work });

  function finish(job) {
    const tl = scaled(timeline(job.points, job.work), window.BROCH_FX_SCALE || 1); // the public demo sets BROCH_FX_SCALE < 1: the builders work faster
    Object.assign(job, tl, { id: ++SEQ, game: view.id, start: clock() });
    return job;
  }
}

// create jobs for everything that was just built, drop the ones that have finished, and hand back the running ones
export function planBuilds(view, fr) {
  const t = clock();
  for (const [k, j] of JOBS) if (t - j.start > j.total + 300 || j.game !== view.id) JOBS.delete(k);
  if (reduced()) return [];
  if (fr && fr.vinfo) {
    for (const [v, info] of fr.vinfo) {
      const b = view.buildings[v];
      const key = `v${v}:${info.kind}`;
      if (!b || JOBS.has(key)) continue;
      JOBS.set(key, makeJob(view, info.kind, key, b.p, { v, prev: info.prev }));
    }
  }
  if (fr && fr.edges) {
    for (const e of fr.edges) {
      const key = `e${e}`;
      const p = view.roads[e];
      if (p === undefined || JOBS.has(key)) continue;
      JOBS.set(key, makeJob(view, 'road', key, p, { edge: e }));
    }
  }
  return [...JOBS.values()].filter(j => j.game === view.id);
}

// ---------------------------------------------------------------- drawing

const f1 = n => n.toFixed(1);
const pct = (t, total) => `${(Math.min(100, Math.max(0, t / total * 100))).toFixed(3)}%`;
const elapsed = j => Math.max(0, clock() - j.start);
export const animOf = (name, j) => `animation:${name} ${Math.round(j.total)}ms linear both;animation-delay:-${Math.round(elapsed(j))}ms`;

// keyframes that hold a value until the next change
function steps(list, total, render) {
  let out = '';
  list.forEach(([t, v], i) => {
    out += `${pct(t, total)}{${render(v)}}`;
    const next = list[i + 1];
    if (next) out += `${pct(next[0] - 1, total)}{${render(v)}}`;
  });
  return out;
}

export function jobCss(j) {
  const id = j.id, n = j.total;
  // where the builder is (and how big: he steps out of the door and back in)
  const kp = ([t, x, y, s]) => `${pct(t, n)}{transform:translate(${f1(x)}px,${f1(y)}px) scale(${s});opacity:${s ? 1 : 0}}`;
  let css = `@keyframes bwp${id}{${j.pos.map(kp).join('')}${kp([n, ...j.pos[j.pos.length - 1].slice(1)])}}`;
  // which way he faces
  const faces = j.face.slice().sort((a, b) => a[0] - b[0]).filter((x, i, a) => !i || x[0] !== a[i - 1][0]);
  if (faces.length) css += `@keyframes bwf${id}{0%{transform:scaleX(${faces[0][1]})}${steps(faces, n, d => `transform:scaleX(${d})`)}100%{transform:scaleX(${faces[faces.length - 1][1]})}}`;
  // walking or hammering
  const marks = [[0, 0]];
  j.phase.forEach(([a, b]) => { marks.push([a, 1], [b, 0]); });
  css += `@keyframes bww${id}{${steps(marks, n, d => `opacity:${d ? 0 : 1}`)}100%{opacity:1}}@keyframes bwh${id}{${steps(marks, n, d => `opacity:${d ? 1 : 0}`)}100%{opacity:0}}`;
  // the piece growing (buildings scale up from the ground, roads draw themselves)
  const g = j.grow;
  if (j.kind === 'road') {
    css += `@keyframes bwr${id}{0%{stroke-dashoffset:100}${g.map(([t, p]) => `${pct(t, n)}{stroke-dashoffset:${f1(100 * (1 - p))}}`).join('')}100%{stroke-dashoffset:0}}`;
  } else {
    css += `@keyframes bwg${id}{0%{opacity:0;transform:scale(1,.04)}${pct(g[0][0], n)}{opacity:0;transform:scale(1,.04)}${g.slice(1).map(([t, p], i) => `${i === 0 ? `${pct(g[0][0] + 1, n)}{opacity:1;transform:scale(1,.06)}` : ''}${pct(t, n)}{opacity:1;transform:scale(1,${f1(0.06 + 0.94 * p)})}`).join('')}100%{opacity:1;transform:none}}`;
    css += `@keyframes bwo${id}{0%{opacity:1}${pct(g[1] ? g[1][0] - 1 : 0, n)}{opacity:1}${pct(g[1] ? g[1][0] : 1, n)}{opacity:0}100%{opacity:0}}`; // the old house gives way to the new one
    css += `@keyframes bws${id}{0%{opacity:0}${pct(120, n)}{opacity:.9}${pct(j.done - 40, n)}{opacity:.9}${pct(j.done + 200, n)}{opacity:0}100%{opacity:0}}`;
  }
  if (j.kind === 'road') css += `@keyframes bws${id}{0%{opacity:0}${pct(120, n)}{opacity:.5}${pct(j.done - 40, n)}{opacity:.5}${pct(j.done + 200, n)}{opacity:0}100%{opacity:0}}`;
  return css;
}

// the little person: shirt and hard hat in the player's colour
function sprite(color) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  const body = `<ellipse cy="1" rx="5.4" ry="1.9" fill="rgba(0,0,0,.3)"/>
    <rect x="-4.2" y="-12.8" width="8.4" height="8.4" rx="2.4" fill="${c}" stroke="${d}" stroke-width="1"/><rect x="-4.2" y="-8.6" width="8.4" height="1.5" fill="rgba(0,0,0,.25)"/>
    <circle cy="-15.4" r="3.5" fill="#F1C9A5" stroke="#C9976F" stroke-width=".6"/><circle cx="1.4" cy="-15.4" r=".55" fill="#3A2614"/>
    <path d="M-4.1 -15.8 a4.1 4.1 0 0 1 8.2 0 z" fill="${c}" stroke="${d}" stroke-width=".9"/><rect x="-5" y="-16" width="10" height="1.3" rx=".65" fill="${c}" stroke="${d}" stroke-width=".7"/><path d="M-1.6 -19 q1.6 -1 3.2 0" stroke="rgba(255,255,255,.7)" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  const hammer = `<line x1="0" y1="0" x2="5.2" y2="-6.2" stroke="#7A4A23" stroke-width="1.5" stroke-linecap="round"/><rect x="3.2" y="-9.6" width="5.6" height="3.4" rx=".7" fill="#A6AEB6" stroke="#5C646B" stroke-width=".7" transform="rotate(-18 6 -8)"/>`;
  return {
    walk: `<g class="bw-bob">${body.replace(/<ellipse[^>]*\/>/, '')}<rect class="bw-leg a" x="-3.2" y="-5" width="2.5" height="5.4" rx="1" fill="#4A3426"/><rect class="bw-leg b" x=".7" y="-5" width="2.5" height="5.4" rx="1" fill="#4A3426"/><g transform="translate(3.6,-9.4) rotate(-20)">${hammer}</g></g>`,
    work: `${body.replace(/<ellipse[^>]*\/>/, '')}<rect x="-3.2" y="-5" width="2.5" height="5.4" rx="1" fill="#4A3426"/><rect x=".7" y="-5" width="2.5" height="5.4" rx="1" fill="#4A3426"/><g class="bw-swing" transform="translate(3.4,-9.4)">${hammer}</g>`,
    shadow: '<ellipse cy="1" rx="5.4" ry="1.9" fill="rgba(0,0,0,.3)"/>',
  };
}

// everything a running job draws on top of the board: the outline of the site, dust where he hits, and the builder
export function jobOverlay(j, view) {
  const e = Math.round(elapsed(j));
  const sp = sprite(view.players[j.p].color);
  const col = PCOLOR[view.players[j.p].color];
  let out = '';
  if (j.site) out += `<ellipse class="bw-site" cx="${f1(j.site.x)}" cy="${f1(j.site.y + 8)}" rx="17" ry="7" fill="rgba(255,255,255,.18)" stroke="${col}" stroke-width="2" stroke-dasharray="4 3" style="${animOf(`bws${j.id}`, j)}"/>`;
  if (j.ghost) out += `<line class="bw-site" x1="${f1(j.ghost.from[0])}" y1="${f1(j.ghost.from[1])}" x2="${f1(j.ghost.to[0])}" y2="${f1(j.ghost.to[1])}" stroke="${col}" stroke-width="3.2" stroke-dasharray="3 5" stroke-linecap="round" style="${animOf(`bws${j.id}`, j)}"/>`;
  j.hits.forEach((h, i) => {
    out += `<circle class="bw-dust" cx="${f1(h.at[0])}" cy="${f1(h.at[1])}" r="8" style="animation-delay:${Math.round(h.t - e)}ms"/>`;
    // smoke: a few small puffs with every hammer blow, and a big cloud when the piece is finished
    const last = i === j.hits.length - 1;
    const n = last ? 7 : 3;
    for (let k = 0; k < n; k++) {
      const dx = ((k * 37 + i * 11) % 23) - 11, r = last ? 5 + (k % 3) * 1.6 : 3 + (k % 2);
      out += `<circle class="bw-puff" cx="${f1(h.at[0] + dx * (last ? 0.9 : 0.5))}" cy="${f1(h.at[1] + 2 - (k % 2) * 2)}" r="${f1(r)}" style="--dx:${dx * 0.35}px;--rise:${last ? 26 + (k % 3) * 6 : 15}px;animation-delay:${Math.round(h.t + 60 + k * (last ? 70 : 50) - e)}ms"/>`;
    }
  });
  out += `<g class="bw" style="${animOf(`bwp${j.id}`, j)}"><g style="${j.face.length ? animOf(`bwf${j.id}`, j) : ''}">
    <g style="${animOf(`bww${j.id}`, j)}">${sp.shadow}${sp.walk}</g><g style="${animOf(`bwh${j.id}`, j)}">${sp.shadow}${sp.work}</g></g></g>`;
  return out;
}

// pieces that are still being built: which of the three states to draw
export const jobKey = (kind, id) => `${kind === 'e' ? 'e' : 'v'}${id}`;
export function jobsByKey(jobs) {
  const m = new Map();
  jobs.forEach(j => { if (j.edge != null) m.set(`e${j.edge}`, j); else m.set(`v${j.v}`, j); });
  return m;
}

// the running job for a piece, if it has one (the sounds and sparkles follow its clock)
export function findJob(kind, id) {
  if (kind === 'e') return JOBS.get(`e${id}`) || null;
  for (const [k, j] of JOBS) if (k.startsWith(`v${id}:`)) return j;
  return null;
}
export const jobAge = j => elapsed(j);

// milliseconds until every builder of this game is back home (0 when nobody is working)
export function buildersBusyFor() {
  let left = 0;
  const t = clock();
  for (const j of JOBS.values()) left = Math.max(left, j.start + j.total - t);
  return Math.max(0, left);
}
