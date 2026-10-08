'use strict';
// Board geometry + random generation. Pointy-top hexes laid out in centred rows.
// Vertices/edges are derived from hex corner positions so any row shape works.

const { BOARDS } = require('./constants');

const SQ3 = Math.sqrt(3);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function expand(counts) {
  const out = [];
  for (const [k, n] of Object.entries(counts)) for (let i = 0; i < n; i++) out.push(k);
  return out;
}

function rowCenters(rows) {
  const mid = (rows.length - 1) / 2;
  const out = [];
  rows.forEach((len, r) => {
    for (let i = 0; i < len; i++) out.push({ x: (i - (len - 1) / 2) * SQ3, y: (r - mid) * 1.5 });
  });
  return out;
}

function geometry(rows) { return geometryFromCenters(rowCenters(rows)); }

// Build vertices/edges from any list of hex centres ({x,y}); hexes keep the list order.
// Hexes are pointy-top (first corner at the top); `flat` makes them flat-top (first corner at the right).
function geometryFromCenters(centers, flat = false) {
  const hexes = [];
  const vertices = [];
  const vIndex = new Map();
  const edges = [];
  const eIndex = new Map();
  const key = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

  const vertexAt = (x, y) => {
    const k = key(x, y);
    if (!vIndex.has(k)) {
      vIndex.set(k, vertices.length);
      vertices.push({ id: vertices.length, x: +x.toFixed(4), y: +y.toFixed(4), hexes: [], adj: [], edges: [] });
    }
    return vIndex.get(k);
  };
  const edgeOf = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!eIndex.has(k)) {
      eIndex.set(k, edges.length);
      edges.push({ id: edges.length, v: [Math.min(a, b), Math.max(a, b)], hexes: [] });
      vertices[a].adj.push(b); vertices[b].adj.push(a);
      vertices[a].edges.push(edges.length - 1); vertices[b].edges.push(edges.length - 1);
    }
    return eIndex.get(k);
  };

  centers.forEach(({ x, y }) => {
    const hex = { id: hexes.length, x: +x.toFixed(4), y: +y.toFixed(4), verts: [], edges: [] };
    for (let c = 0; c < 6; c++) {
      const ang = Math.PI / 180 * (60 * c - (flat ? 0 : 90)); // start at the top corner (pointy-top) or the right corner (flat-top)
      hex.verts.push(vertexAt(x + Math.cos(ang), y + Math.sin(ang)));
    }
    for (let c = 0; c < 6; c++) {
      const e = edgeOf(hex.verts[c], hex.verts[(c + 1) % 6]);
      hex.edges.push(e);
      edges[e].hexes.push(hex.id);
    }
    hex.verts.forEach(v => vertices[v].hexes.push(hex.id));
    hexes.push(hex);
  });
  // hex neighbours (share an edge)
  hexes.forEach(h => {
    const n = new Set();
    h.edges.forEach(e => edges[e].hexes.forEach(o => { if (o !== h.id) n.add(o); }));
    h.neighbors = [...n];
  });
  return { hexes, vertices, edges };
}

function placePorts(geo, portTypes) {
  const coast = geo.edges.filter(e => e.hexes.length === 1);
  const ang = e => {
    const [a, b] = e.v.map(i => geo.vertices[i]);
    return Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2);
  };
  coast.sort((a, b) => ang(a) - ang(b));
  const n = portTypes.length;
  const step = coast.length / n;
  const offset = Math.floor(Math.random() * coast.length);
  const types = shuffle(portTypes.slice());
  const used = new Set();
  const ports = [];
  for (let i = 0; i < n; i++) {
    let idx = (Math.round(i * step) + offset) % coast.length;
    // avoid sharing a vertex with a previous port
    let tries = 0;
    while (coast[idx].v.some(v => used.has(v)) && tries < coast.length) { idx = (idx + 1) % coast.length; tries++; }
    const e = coast[idx];
    e.v.forEach(v => used.add(v));
    const [a, b] = e.v.map(v => geo.vertices[v]);
    const h = geo.hexes[e.hexes[0]];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = mx - h.x, dy = my - h.y, d = Math.hypot(dx, dy);
    ports.push({
      edge: e.id, type: types[i], ratio: types[i] === 'any' ? 3 : 2,
      x: +(mx + dx / d * 0.55).toFixed(3), y: +(my + dy / d * 0.55).toFixed(3),
    });
  }
  return ports;
}

function generate(kind) {
  const def = BOARDS[kind];
  const geo = geometry(def.rows);
  const isRed = n => n === 6 || n === 8;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const terrains = shuffle(expand(def.terrain));
    const numbers = shuffle(def.numbers.slice());
    let ni = 0;
    geo.hexes.forEach((h, i) => {
      h.terrain = terrains[i];
      h.number = h.terrain === 'desert' ? null : numbers[ni++];
    });
    const ok = geo.hexes.every(h => !isRed(h.number) || h.neighbors.every(n => !isRed(geo.hexes[n].number)));
    // also avoid identical numbers next to each other
    const ok2 = geo.hexes.every(h => h.number == null || h.neighbors.every(n => geo.hexes[n].number !== h.number));
    if (ok && (ok2 || attempt > 1500)) break;
  }
  const ports = placePorts(geo, def.ports);
  ports.forEach(p => geo.edges[p.edge].v.forEach(v => { geo.vertices[v].port = p.type; }));
  return { kind, hexes: geo.hexes, vertices: geo.vertices, edges: geo.edges, ports };
}

module.exports = { generate, shuffle, expand, geometry, geometryFromCenters, rowCenters, SQ3 };
