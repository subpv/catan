// Zoom and pan for the board, like a map app.
// The whole board is always painted (the SVG shows the full board); zooming makes the SVG bigger and panning only
// moves it inside a clipped frame. So dragging never reveals unpainted (blue) areas, and animations keep running.
// During a pinch or wheel zoom the painted picture is scaled with a CSS transform (cheap); when the gesture ends the
// SVG gets its real new size and is painted sharp again. Pure drags never repaint at all.

const MIN_Z = 1, MAX_Z = 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createZoom({ host, getState, setState, onChange }) {
  let fit = null;        // { w, h, s1, base } size of the frame and the scale at zoom 1
  let g = null;          // active gesture: { L0, raf }
  let glide = null, anim = null, wheelTimer = null;
  const ptrs = new Map();
  let pan = null, pinch = null, lastType = 'mouse';
  let moved = false;

  const box = () => host.querySelector('.board-host');
  const svgEl = () => host.querySelector('svg.board');

  // the frame keeps the board's proportions (capped on big screens), so the page layout never jumps
  function fitBox() {
    const svg = svgEl(), b = box();
    if (!svg || !b) return null;
    const base = svg.dataset.base.split(' ').map(Number);
    const w = b.clientWidth || host.clientWidth || 300;
    const maxH = innerWidth > 1040 ? Math.max(280, innerHeight - 200) : Infinity;
    const h = Math.round(Math.max(280, Math.min(maxH, w * base[3] / base[2])));
    if (b.style.height !== h + 'px') b.style.height = h + 'px';
    fit = { w, h, s1: Math.min(w / base[2], h / base[3]), base };
    return fit;
  }

  // size and position of the SVG for a zoom state (centre kept inside the board)
  function layout(z, cx, cy) {
    const { w, h, s1, base: [bx, by, bw, bh] } = fit;
    z = clamp(z, MIN_Z, MAX_Z);
    const s = s1 * z, W = bw * s, H = bh * s;
    let tx = w / 2 - (cx - bx) * s, ty = h / 2 - (cy - by) * s;
    tx = W <= w + 0.5 ? (w - W) / 2 : clamp(tx, w - W, 0);
    ty = H <= h + 0.5 ? (h - H) / 2 : clamp(ty, h - H, 0);
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
    svg.style.touchAction = L.z > 1 ? 'none' : 'pan-y';
    onChange && onChange(L.z);
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
      pan = null; moved = true;
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
      pan.started = true; moved = true;
      host.classList.add('dragging');
    }
    if (!begin()) return;
    const c = centreFor(pan.P, e.clientX, e.clientY, getState().z);
    preview(getState().z, c.cx, c.cy);
    pan.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (pan.hist.length > 6) pan.hist.shift();
  });

  const up = e => {
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
    if (p && p.started && p.hist.length >= 2 && e.type === 'pointerup') return startGlide(p);
    end();
    if (moved) setTimeout(() => { moved = false; }, 60);
  };
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);

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

  return {
    zoomBy, zoomTo,
    reset: () => zoomTo(1),
    // call after the board was redrawn: size the new SVG for the current zoom
    apply: () => {
      if (g) { if (g.raf) cancelAnimationFrame(g.raf); g = null; host.classList.remove('gesturing'); }
      fit = null;
      commit();
      if (ptrs.size) begin(); // fingers still down: continue the gesture on the new board
    },
    wasDrag: () => moved,
    busy: () => !!g || ptrs.size > 0,
    destroy: () => window.removeEventListener('resize', onResize),
  };
}
