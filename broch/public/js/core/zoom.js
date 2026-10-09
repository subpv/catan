// Zoom and pan for the board, like a map app.
// The whole board is always painted (the SVG shows the full board); zooming makes the SVG bigger and panning only
// moves it inside a clipped frame. So dragging never reveals unpainted (blue) areas, and animations keep running.
// During a pinch or wheel zoom the painted picture is scaled with a CSS transform (cheap); when the gesture ends the
// SVG gets its real new size and is painted sharp again. Pure drags never repaint at all.

import { isPhone } from './phone.js';

const MIN_Z = 1, MAX_Z = 4;
const EDGE = 4; // phone: empty margin around the fitted board (css px)
const INSET = 17; // phone: the viewBox carries a wide empty rim (0.62 hex); the fit counts only the part beyond INSET board units
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createZoom({ host, getState, setState, onChange }) {
  let fit = null;        // { w, h, s1, base } size of the frame and the scale at zoom 1
  let g = null;          // active gesture: { L0, raf }
  let glide = null, anim = null, wheelTimer = null;
  const ptrs = new Map();
  let pan = null, pinch = null, lastType = 'mouse';
  let moved = false;
  let touched = false;     // the person zoomed or panned by hand (the automatic zoom of a pick then leaves the view alone)
  let lastTap = null;      // double-tap on a touch screen
  let lastUp = null;       // where the last finger or mouse button went up (a touch screen moves the click to the nearest button: the finger is the truth)

  const box = () => host.querySelector('.board-host');
  // true when the phone stylesheet gave the frame its own height (otherwise the old sizing is the fallback)
  const phoneFrame = b => getComputedStyle(b).position === 'absolute' && b.clientHeight >= 120;
  const svgEl = () => host.querySelector('svg.board');

  // the frame keeps the board's proportions (capped on big screens), so the page layout never jumps
  function fitBox() {
    const svg = svgEl(), b = box();
    if (!svg || !b) return null;
    const base = svg.dataset.base.split(' ').map(Number);
    const w = b.clientWidth || host.clientWidth || 300;
    // phone: the frame fills all the height the layout gives it (css: .board-host is absolute inside the board area)
    if (isPhone() && phoneFrame(b)) {
      if (b.style.height) b.style.height = '';
      const h = b.clientHeight;
      const pad = phonePads(b, base, w, h);
      const aw = w - pad.r, ah = h - pad.t - pad.b;
      fit = { w, h, aw, ah, pt: pad.t, ins: INSET, s1: Math.max(0.05, Math.min((aw - 2 * EDGE) / (base[2] - 2 * INSET), (ah - 2 * EDGE) / (base[3] - 2 * INSET))), base };
      return fit;
    }
    const maxH = innerWidth > 1040 ? Math.max(280, innerHeight - 200) : Infinity;
    const h = Math.round(Math.max(280, Math.min(maxH, w * base[3] / base[2])));
    if (b.style.height !== h + 'px') b.style.height = h + 'px';
    fit = { w, h, aw: w, ah: h, pt: 0, s1: Math.min(w / base[2], h / base[3]), base };
    return fit;
  }

  // phone: parts that float over the board (the zoom buttons, the HUD pills) must not cover the board itself. When the board
  // at full size would run under one of them, the board is fitted into the frame minus a strip at that side instead.
  function phonePads(b, base, w, h) {
    const pad = { t: 0, b: 0, r: 0 };
    const svg = svgEl();
    const br = b.getBoundingClientRect();
    const obs = [];
    const ctl = host.querySelector('.zoom-ctl');
    if (ctl) {
      const r = ctl.getBoundingClientRect();
      if (r.width) { // two buttons at zoom 1 (the fit button only shows while zoomed)
        const row = r.width > r.height || getComputedStyle(ctl).flexDirection === 'row';
        obs.push({ r: row ? { left: r.right - 96, right: r.right, top: r.top, bottom: r.bottom } : { left: r.left, right: r.right, top: r.bottom - 96, bottom: r.bottom }, side: row ? 'b' : 'r' });
      }
    }
    const hud = host.querySelector('.board-hud');
    if (hud && hud.children.length) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      [...hud.children].forEach(c => { const r = c.getBoundingClientRect(); if (r.width) { x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); y0 = Math.min(y0, r.top); y1 = Math.max(y1, r.bottom); } });
      if (x1 > x0) obs.push({ r: { left: x0, right: x1, top: y0, bottom: y1 }, side: 't' });
    }
    if (!obs.length || !svg) return pad;
    // what the board really covers (tiles and harbour boats, in board units): the empty corners of the frame may lie under a button
    const m = svg.getScreenCTM();
    if (!m || !m.a || !m.d) return pad;
    const parts = [...svg.querySelectorAll(':scope > g.tile, :scope > g.boat, :scope > g[data-h]')].map(el => {
      const r = el.getBoundingClientRect();
      return { x0: (r.left - m.e) / m.a, x1: (r.right - m.e) / m.a, y0: (r.top - m.f) / m.d, y1: (r.bottom - m.f) / m.d };
    });
    if (!parts.length) return pad;
    for (let pass = 0; pass < 4; pass++) {
      const aw = w - pad.r, ah = h - pad.t - pad.b;
      const s = Math.min((aw - 2 * EDGE) / (base[2] - 2 * INSET), (ah - 2 * EDGE) / (base[3] - 2 * INSET));
      const ox = br.left + (aw - (base[2] - 2 * INSET) * s) / 2 - INSET * s - base[0] * s, oy = br.top + pad.t + (ah - (base[3] - 2 * INSET) * s) / 2 - INSET * s - base[1] * s;
      // the cheapest strip first: making room at one side often clears the others too
      let pick = null;
      for (const o of obs) {
        const T = o.side === 't' ? 10 : 3; // a few pixels under the (see-through) pills do no harm, the buttons are solid
        const hit = parts.some(q => ox + q.x1 * s > o.r.left + T && ox + q.x0 * s < o.r.right - T && oy + q.y1 * s > o.r.top + T && oy + q.y0 * s < o.r.bottom - T);
        if (!hit) continue;
        const need = o.side === 'b' ? Math.round(br.bottom - o.r.top) + 4 : o.side === 't' ? Math.round(o.r.bottom - br.top) + 2 : Math.round(br.right - o.r.left) + 4;
        if (need > pad[o.side] && (!pick || need - pad[o.side] < pick.need - pad[pick.side])) pick = { side: o.side, need };
      }
      if (!pick) break;
      pad[pick.side] = pick.need;
    }
    return pad;
  }

  // size and position of the SVG for a zoom state (centre kept inside the board)
  function layout(z, cx, cy) {
    const { w, h, aw = w, ah = h, pt = 0, ins = 0, s1, base: [bx, by, bw, bh] } = fit;
    z = clamp(z, MIN_Z, MAX_Z);
    const s = s1 * z, W = bw * s, H = bh * s, I = ins * s, Wc = W - 2 * I, Hc = H - 2 * I; // Wc, Hc: the board without its empty rim
    let tx = w / 2 - (cx - bx) * s, ty = h / 2 - (cy - by) * s;
    // small enough for the free area: centred in it (the area leaves out the strips of the buttons floating over the board)
    tx = Wc <= aw + 0.5 ? (aw - Wc) / 2 - I : Wc <= w ? -I : clamp(tx, w - W + I, -I);
    ty = Hc <= ah + 0.5 ? pt + (ah - Hc) / 2 - I : Hc <= h ? (pt * (h - Hc)) / ((h - ah) || 1) - I : clamp(ty, h - H + I, -I);
    return { z, s, W, H, tx, ty, cx: bx + (w / 2 - tx) / s, cy: by + (h / 2 - ty) / s };
  }
  const current = () => { const st = getState(); return layout(st.z, st.cx, st.cy); };

  function setSvg(svg, L, k = 1, Lsize = L) {
    svg.style.width = Lsize.W.toFixed(1) + 'px';
    svg.style.height = Lsize.H.toFixed(1) + 'px';
    svg.style.transform = `translate3d(${L.tx.toFixed(2)}px,${L.ty.toFixed(2)}px,0)${k !== 1 ? ` scale(${k.toFixed(4)})` : ''}`;
  }

  // final size and position: paints the board sharp at the new zoom
  function commit() {
    const svg = svgEl();
    if (!svg || !fitBox()) return;
    const L = current();
    setState({ z: L.z, cx: L.cx, cy: L.cy });
    setSvg(svg, L);
    if (isPhone()) markers(svg, L.s);
    svg.style.touchAction = L.z > 1 || isPhone() ? 'none' : 'pan-y';
    onChange && onChange(L.z);
  }

  // phone: the glowing corners and edges keep a readable size on a small board (about 9.5 px radius on screen)
  function markers(svg, s) {
    const k = clamp(9.5 / (14 * s), 1, 1.36); // never bigger than a third of the distance between two corners (56 units)
    svg.style.setProperty('--hs', k.toFixed(2));
    svg.querySelectorAll('.hl-v').forEach(c => c.setAttribute('r', (14 * k).toFixed(1)));
  }

  function begin() {
    if (g) return g;
    const svg = svgEl();
    if (!svg) return null;
    if (!fit) fitBox();
    stopGlide(); stopAnim();
    g = { L0: current(), raf: 0 };
    host.classList.add('gesturing');
    return g;
  }
  function paint() {
    if (!g) return;
    g.raf = 0;
    const svg = svgEl();
    if (!svg) return;
    const L = current();
    // keep the painted size from the start of the gesture and scale it: no repaint while the fingers move
    setSvg(svg, L, L.W / g.L0.W, g.L0);
  }
  function preview(z, cx, cy) {
    if (!g && !begin()) return;
    const L = layout(z, cx, cy);
    setState({ z: L.z, cx: L.cx, cy: L.cy });
    if (!g.raf) g.raf = requestAnimationFrame(paint);
  }
  function end() {
    if (!g) return;
    if (g.raf) cancelAnimationFrame(g.raf);
    g = null;
    host.classList.remove('gesturing');
    commit();
  }

  // board point under a screen point, and the centre that keeps a board point under a screen point at zoom z
  function toBoard(X, Y) {
    const r = box().getBoundingClientRect();
    const L = current();
    return { x: fit.base[0] + (X - r.left - L.tx) / L.s, y: fit.base[1] + (Y - r.top - L.ty) / L.s };
  }
  function centreFor(P, X, Y, z) {
    const r = box().getBoundingClientRect();
    const s = fit.s1 * z;
    const tx = (X - r.left) - (P.x - fit.base[0]) * s, ty = (Y - r.top) - (P.y - fit.base[1]) * s;
    return { cx: fit.base[0] + (fit.w / 2 - tx) / s, cy: fit.base[1] + (fit.h / 2 - ty) / s };
  }

  function stopGlide() { if (glide) { cancelAnimationFrame(glide); glide = null; } }
  function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; } }

  // ------------------------------------------------------------ buttons
  function zoomTo(z, cx, cy, ms = 240) {
    stopGlide(); stopAnim();
    if (!begin()) return;
    const from = { ...getState() };
    const to = layout(z, cx ?? from.cx, cy ?? from.cy);
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const z1 = 1 / (1 / from.z + (1 / to.z - 1 / from.z) * e); // even change of the visible area
      preview(z1, from.cx + (to.cx - from.cx) * e, from.cy + (to.cy - from.cy) * e);
      if (p < 1) anim = requestAnimationFrame(step); else { anim = null; end(); }
    };
    anim = requestAnimationFrame(step);
  }
  function zoomBy(f) {
    touched = true;
    if (!fit) fitBox();
    if (!fit) return;
    const st = getState();
    const c = st.z > 1 ? { x: st.cx, y: st.cy } : { x: fit.base[0] + fit.base[2] / 2, y: fit.base[1] + fit.base[3] / 2 };
    zoomTo(st.z * f, c.x, c.y);
  }

  // ------------------------------------------------------------ input
  const onBoard = e => e.target.closest && e.target.closest('svg.board');
  host.addEventListener('wheel', e => {
    if (!onBoard(e)) return;
    touched = true;
    e.preventDefault();
    if (!begin()) return;
    const st = getState();
    const P = toBoard(e.clientX, e.clientY);
    const z = clamp(st.z * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022)), MIN_Z, MAX_Z);
    const c = centreFor(P, e.clientX, e.clientY, z);
    preview(z, c.cx, c.cy);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(end, 160);
  }, { passive: false });

  host.addEventListener('pointerdown', e => {
    if (!onBoard(e)) return;
    if (!fit) fitBox();
    lastType = e.pointerType;
    stopGlide(); stopAnim();
    if (g && !ptrs.size) end();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (ptrs.size === 1) {
      pan = { x: e.clientX, y: e.clientY, P: toBoard(e.clientX, e.clientY), started: false, hist: [] };
    } else if (ptrs.size === 2) {
      if (!begin()) return;
      const [a, b] = [...ptrs.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: getState().z, P: toBoard(mx, my) };
      pan = null; moved = true; touched = true;
    }
  });

  host.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      if (!begin()) return;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = clamp(pinch.z * d / pinch.d, MIN_Z, MAX_Z);
      const c = centreFor(pinch.P, mx, my, z);
      preview(z, c.cx, c.cy);
      return;
    }
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.started) {
      if (Math.hypot(dx, dy) < 8 || getState().z <= 1) return;
      pan.started = true; moved = true; touched = true;
      host.classList.add('dragging');
    }
    if (!begin()) return;
    const c = centreFor(pan.P, e.clientX, e.clientY, getState().z);
    preview(getState().z, c.cx, c.cy);
    pan.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (pan.hist.length > 6) pan.hist.shift();
  });

  const up = e => {
    if (e.type === 'pointerup') lastUp = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2 && pinch) {
      pinch = null;
      const rest = [...ptrs.values()][0]; // keep panning with the finger that is left
      if (rest && g) pan = { x: rest.x, y: rest.y, P: toBoard(rest.x, rest.y), started: true, hist: [] };
    }
    if (ptrs.size) return;
    host.classList.remove('dragging');
    const p = pan; pan = null;
    if (e.type === 'pointerup' && e.pointerType === 'touch' && !moved && !(p && p.started)) doubleTap(e);
    else lastTap = null;
    if (p && p.started && p.hist.length >= 2 && e.type === 'pointerup') return startGlide(p);
    end();
    if (moved) setTimeout(() => { moved = false; }, 60);
  };
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);

  // two quick taps (300 ms, 24 px) on an empty spot of the board: zoom in there, or back out
  function doubleTap(e) {
    const now = performance.now();
    if (!onBoard(e) || e.target.closest('[data-v],[data-e],[data-h],[data-k],[data-s],[data-hub]')) { lastTap = null; return; }
    const prev = lastTap;
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (!prev || now - prev.t > 300 || Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 24) return;
    lastTap = null;
    touched = true;
    if (!fit) fitBox();
    const st = getState();
    if (st.z > 1.5) return zoomTo(1);
    const z = 2.2;
    const c = centreFor(toBoard(e.clientX, e.clientY), e.clientX, e.clientY, z);
    zoomTo(z, c.cx, c.cy);
  }

  // zoom by a factor around a point of the screen (a tap that was too close to call zooms in instead of guessing)
  function zoomAt(X, Y, f) {
    if (!fit) fitBox();
    if (!fit) return;
    const st = getState();
    const z = clamp(st.z * f, MIN_Z, MAX_Z);
    const c = centreFor(toBoard(X, Y), X, Y, z);
    zoomTo(z, c.cx, c.cy);
  }

  // zoom to show a set of board points ({x,y} in board units, as in the SVG viewBox). Only when that is worth it:
  // the box must fit at zoom >= minZ, otherwise the view stays as it is. Returns true when it zoomed.
  function focusPoints(points, { minZ = 1.6, margin = 46, maxZ = 2.4 } = {}) {
    if (!points || !points.length) return false;
    if (!fit) fitBox();
    if (!fit) return false;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin, y0 = Math.min(...ys) - margin, y1 = Math.max(...ys) + margin;
    const fz = Math.min(fit.w / fit.s1 / (x1 - x0), fit.h / fit.s1 / (y1 - y0));
    if (fz < minZ) return false;
    zoomTo(Math.min(maxZ, fz), (x0 + x1) / 2, (y0 + y1) / 2);
    return true;
  }

  // a short glide after a quick drag, slowing down like on a phone map
  function startGlide(p) {
    const a = p.hist[0], b = p.hist[p.hist.length - 1];
    const dt = Math.max(1, b.t - a.t);
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    if (Math.hypot(vx, vy) < 0.25 || performance.now() - b.t > 80) { end(); setTimeout(() => { moved = false; }, 60); return; }
    let last = performance.now();
    let X = b.x, Y = b.y;
    const step = now => {
      const dtt = Math.min(32, now - last); last = now;
      X += vx * dtt; Y += vy * dtt;
      const decay = Math.pow(0.994, dtt);
      vx *= decay; vy *= decay;
      const c = centreFor(p.P, X, Y, getState().z);
      preview(getState().z, c.cx, c.cy);
      if (Math.hypot(vx, vy) > 0.03) glide = requestAnimationFrame(step);
      else { glide = null; end(); moved = false; }
    };
    glide = requestAnimationFrame(step);
  }

  host.addEventListener('dblclick', e => {
    if (lastType !== 'mouse' || !onBoard(e) || e.target.closest('[data-v],[data-e],[data-h],[data-k],[data-s]')) return;
    if (!fit) fitBox();
    const st = getState();
    if (st.z >= MAX_Z * 0.9) return zoomTo(1);
    const P = toBoard(e.clientX, e.clientY);
    const z = Math.min(MAX_Z, st.z * 1.8);
    const c = centreFor(P, e.clientX, e.clientY, z);
    zoomTo(z, c.cx, c.cy);
  });

  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (!g) { fit = null; commit(); } }, 120); };
  window.addEventListener('resize', onResize);
  // phone: the frame changes size by itself (browser bar, rotation, the dock growing): fit the board again
  let ro = null, roRaf = 0, roSize = '';
  if (typeof ResizeObserver === 'function' && box()) {
    ro = new ResizeObserver(() => {
      if (!isPhone()) return;
      const b = box(); if (!b) return;
      const size = b.clientWidth + 'x' + b.clientHeight;
      if (size === roSize) return;
      roSize = size;
      cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(() => { if (!g && !glide && !anim) { fit = null; commit(); } });
    });
    ro.observe(box());
  }

  return {
    zoomBy, zoomTo,
    reset: () => { touched = true; zoomTo(1); },
    // call after the board was redrawn: size the new SVG for the current zoom
    apply: () => {
      if (g) { if (g.raf) cancelAnimationFrame(g.raf); g = null; host.classList.remove('gesturing'); }
      fit = null;
      commit();
      if (ptrs.size) begin(); // fingers still down: continue the gesture on the new board
    },
    zoomAt, focusPoints,
    // where a tap really was: the pointer position of the last lift within 800 ms of now, else null
    lastPoint: () => (lastUp && performance.now() - lastUp.t < 800 ? lastUp : null),
    // has the person zoomed or panned by hand since clearTouched()?
    touched: () => touched,
    clearTouched: () => { touched = false; },
    wasDrag: () => moved,
    busy: () => !!g || ptrs.size > 0,
    destroy: () => { window.removeEventListener('resize', onResize); ro && ro.disconnect(); cancelAnimationFrame(roRaf); clearTimeout(rz); clearTimeout(wheelTimer); stopGlide(); stopAnim(); },
  };
}
