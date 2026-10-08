// Juice: sounds (synthesised, no files), board animations and full-screen moments.
import { t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, glyph, cardName, inkOn, tf, houseIcon, pipsHtml, term } from './core.js';
import { cardDesc, deckOf } from './cards.js';
import { findJob, jobAge, buildersBusyFor } from './builder.js';

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------ sound
let ctx = null, master = null;
let muted = (() => { try { return localStorage.getItem('broch_muted') === '1'; } catch { return false; } })();
// which tile a resource flies in from (standalone games add their own)
export const LOOT_TERRAIN = { lumber: 'forest', brick: 'hills', wool: 'pasture', grain: 'fields', ore: 'mountains', paper: 'forest', cloth: 'pasture', coin: 'mountains' };
// standalone games say which tile each of their resources comes from
export const LOOT_BY_MODE = {};
// standalone games with their own threat pieces (instead of the robber) describe the 7 scene: { title, sub(view, discards), svg, sfx }
export const THREAT_BY_MODE = {};
// standalone games with other advantage cards say how the award scene reads: { road: [title, subtitle], army: [title, subtitle] }
export const AWARDS_BY_MODE = {};
// a game without a robber says what a 7 does instead: { title, text(view) }
export const SEVEN_BY_MODE = {};
// full-screen scenes a game provides itself: eventCard(view, total, nameHtml) is the event card of Traders & Barbarians
export const SCENES = {};
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('broch_muted', m ? '1' : '0'); } catch { /* storage blocked */ }
}
function audio() {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
// browsers only allow audio after a gesture: unlock on first tap
window.addEventListener('pointerdown', () => { if (!muted) audio(); }, { once: true });

function tone(freq, dur, { type = 'sine', vol = 0.5, at = 0, slide = null, attack = 0.005 } = {}) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, { at = 0, vol = 0.4, freq = 2000, q = 1, type = 'bandpass' } = {}) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + at;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}
export const sfx = {
  dice() { for (let i = 0; i < 7; i++) noise(0.05, { at: i * 0.07 + Math.random() * 0.03, freq: 2500 + Math.random() * 2500, q: 4, vol: 0.5 }); tone(180, 0.08, { type: 'triangle', at: 0.55, vol: 0.4 }); },
  place() { tone(170, 0.18, { slide: 60, vol: 0.7 }); noise(0.05, { freq: 900, vol: 0.35 }); },
  city() { tone(150, 0.22, { slide: 55, vol: 0.75 }); noise(0.07, { freq: 700, vol: 0.4 }); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { at: 0.12 + i * 0.06, type: 'triangle', vol: 0.16 })); },
  thud() { tone(95, 0.12, { slide: 50, vol: 0.55 }); noise(0.06, { freq: 400, type: 'lowpass', vol: 0.5 }); },
  road() { tone(420, 0.06, { type: 'triangle', vol: 0.45 }); tone(360, 0.06, { type: 'triangle', at: 0.09, vol: 0.4 }); },
  gain() { tone(880, 0.12, { vol: 0.25 }); tone(1320, 0.16, { at: 0.06, vol: 0.22 }); },
  card() { noise(0.18, { freq: 3000, q: 0.6, type: 'highpass', vol: 0.25 }); tone(660, 0.1, { at: 0.08, vol: 0.18 }); },
  robber() { tone(110, 1.1, { type: 'sawtooth', slide: 46, vol: 0.32, attack: 0.05 }); tone(82, 1.2, { type: 'square', slide: 41, vol: 0.12, attack: 0.08 }); noise(0.35, { freq: 140, type: 'lowpass', vol: 0.9 }); noise(0.3, { at: 0.55, freq: 120, type: 'lowpass', vol: 0.8 }); },
  steal() { tone(900, 0.07, { type: 'square', vol: 0.12 }); tone(600, 0.1, { type: 'square', at: 0.07, vol: 0.12 }); },
  horn() { tone(196, 0.9, { type: 'sawtooth', vol: 0.18, attack: 0.15 }); tone(294, 0.9, { type: 'sawtooth', vol: 0.12, attack: 0.2, at: 0.05 }); },
  drums() { for (let i = 0; i < 6; i++) noise(0.22, { at: i * 0.28, freq: 110, type: 'lowpass', vol: 1 }); },
  victory() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { at: i * 0.12, type: 'triangle', vol: 0.35 })); },
  defeat() { [392, 330, 262].forEach((f, i) => tone(f, 0.45, { at: i * 0.18, type: 'triangle', vol: 0.3 })); },
  turn() { tone(660, 0.18, { vol: 0.3 }); tone(990, 0.3, { at: 0.12, vol: 0.28 }); },
  award() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, { at: i * 0.07, vol: 0.22 })); },
  trade() { noise(0.2, { freq: 1800, q: 0.8, vol: 0.2 }); tone(523, 0.12, { at: 0.1, vol: 0.2 }); tone(784, 0.14, { at: 0.18, vol: 0.2 }); },
  error() { tone(150, 0.16, { type: 'square', vol: 0.12 }); },
  sail() { noise(0.5, { freq: 700, q: 0.7, vol: 0.18, type: 'lowpass' }); tone(330, 0.14, { type: 'triangle', at: 0.05, vol: 0.2, slide: 440 }); tone(494, 0.18, { type: 'triangle', at: 0.16, vol: 0.18 }); },
  reveal() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.28, { at: i * 0.09, type: 'sine', vol: 0.22 })); noise(0.3, { freq: 5000, q: 0.5, type: 'highpass', vol: 0.12 }); },
  pirate() { tone(98, 0.8, { type: 'sawtooth', slide: 60, vol: 0.2, attack: 0.04 }); noise(0.4, { freq: 300, type: 'lowpass', vol: 0.6 }); },
  gold() { [1175, 1568, 1976].forEach((f, i) => tone(f, 0.22, { at: i * 0.06, vol: 0.2 })); },
  fish() { noise(0.2, { freq: 900, q: 1.2, vol: 0.2 }); tone(700, 0.1, { at: 0.05, vol: 0.18, slide: 1100 }); },
  loot() { tone(784, 0.1, { vol: 0.16 }); tone(1047, 0.14, { at: 0.07, vol: 0.14 }); },
  click() { tone(1200, 0.03, { type: 'triangle', vol: 0.12 }); },
  // the end of a game: a little brass fanfare, fireworks and a counter
  fanfare() {
    const notes = [[392, 0, 0.15], [523, 0.13, 0.15], [659, 0.26, 0.15], [784, 0.39, 0.42], [659, 0.6, 0.13], [784, 0.72, 1.1]];
    notes.forEach(([f, at, d]) => { tone(f, d, { at, type: 'triangle', vol: 0.3 }); tone(f / 2, d, { at, type: 'square', vol: 0.05 }); });
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 1.5, { at: 0.72 + i * 0.015, type: 'sine', vol: 0.11, attack: 0.06 }));
    noise(0.9, { at: 0.72, freq: 6000, q: 0.4, type: 'highpass', vol: 0.06 });
  },
  firework() { noise(0.55, { freq: 220, type: 'lowpass', vol: 0.5 }); for (let i = 0; i < 7; i++) noise(0.035, { at: 0.22 + Math.random() * 0.55, freq: 5200 + Math.random() * 2600, type: 'highpass', vol: 0.09 }); },
  hammer() { noise(0.045, { freq: 1900, q: 3, vol: 0.32 }); tone(240, 0.06, { type: 'square', vol: 0.1, slide: 130 }); },
  zap() { tone(260, 0.2, { type: 'sawtooth', slide: 980, vol: 0.22 }); noise(0.1, { freq: 4200, type: 'highpass', vol: 0.18 }); },
  smog() { noise(0.55, { freq: 180, type: 'lowpass', vol: 0.8 }); tone(110, 0.5, { type: 'sawtooth', slide: 58, vol: 0.14 }); },
  leaf() { [660, 880, 1100].forEach((f, i) => tone(f, 0.28, { at: i * 0.07, type: 'sine', vol: 0.16 })); },
  roar() { tone(120, 0.9, { type: 'sawtooth', slide: 55, vol: 0.3, attack: 0.04 }); tone(180, 0.7, { type: 'square', slide: 80, vol: 0.1, attack: 0.05 }); noise(0.6, { freq: 260, q: 0.8, vol: 0.7 }); },
  tink() { tone(2100, 0.09, { type: 'triangle', vol: 0.2, slide: 1500 }); noise(0.04, { freq: 5200, q: 2, type: 'highpass', vol: 0.2 }); },
  tick(i = 0) { tone(900 + Math.min(i, 20) * 35, 0.05, { type: 'triangle', vol: 0.13 }); },
};

// ------------------------------------------------------------ queue of full-screen moments
let queue = Promise.resolve();
let busy = 0;
export const fxBusy = () => busy > 0;
function enqueue(fn) {
  busy++;
  window.BROCH_FX_BUSY = true;
  // full-screen moments (dice, a new turn, loot) wait until the builders have finished, so they are never cut off
  const afterBuilders = async () => { const left = buildersBusyFor(); if (left > 0) await wait(Math.min(left + 150, 9000)); return fn(); };
  queue = queue.then(afterBuilders).catch(() => {}).finally(() => { busy--; if (!busy) window.BROCH_FX_BUSY = false; });
  return queue;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function layer(cls, html, { skippable = true } = {}) {
  const el = document.createElement('div');
  el.className = 'fx-scene ' + cls;
  el.innerHTML = html;
  document.body.appendChild(el);
  let done;
  const p = new Promise(r => { done = r; });
  if (skippable) el.addEventListener('click', () => done());
  return { el, skipped: p };
}
async function hold(sc, ms) {
  await Promise.race([wait(reduced() ? Math.min(ms, 900) : ms), sc.skipped]);
  sc.el.classList.add('out');
  await wait(260);
  sc.el.remove();
}
function shake(el = document.getElementById('app'), cls = 'fx-shake') {
  if (!el || reduced()) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}

// ------------------------------------------------------------ geometry helpers
// screen point of a board point. The SVG is moved and scaled with CSS (zoom), so this maps through its on-screen
// box instead of getScreenCTM (which some browsers compute without CSS transforms). Points outside the visible
// frame are pulled to its edge, so things fly in from the side of the board instead of from somewhere on the page.
function boardPoint(x, y) {
  const svg = document.querySelector('.board-wrap svg.board');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (!r.width || !vb || !vb.width) return null;
  const s = Math.min(r.width / vb.width, r.height / vb.height);
  let px = r.left + (r.width - vb.width * s) / 2 + (x - vb.x) * s;
  let py = r.top + (r.height - vb.height * s) / 2 + (y - vb.y) * s;
  const fr = svg.parentElement && svg.parentElement.getBoundingClientRect();
  if (fr && fr.width) {
    px = Math.min(fr.right - 12, Math.max(fr.left + 12, px));
    py = Math.min(fr.bottom - 12, Math.max(fr.top + 12, py));
  }
  return { x: px, y: py };
}
const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const S = 56;

// flying tokens (resource gains, steals)
function flyToken(from, to, html, delay = 0) {
  if (!from || !to || reduced()) return wait(0);
  const el = document.createElement('div');
  el.className = 'fx-token';
  el.innerHTML = html;
  el.style.left = from.x + 'px'; el.style.top = from.y + 'px';
  document.body.appendChild(el);
  const dx = to.x - from.x, dy = to.y - from.y;
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.15}px), calc(-50% + ${dy * 0.15 - 60}px)) scale(1.15)`, opacity: 1, offset: 0.3 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.9 },
  ], { duration: 900, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
  return anim.finished.then(() => el.remove()).catch(() => el.remove());
}
const tokenHtml = res => `<div class="fx-card" style="--c:${CARD_COLOR[res]}">${glyph(res, 22)}</div>`;
const backHtml = () => `<div class="fx-card back">B</div>`;

function burst(pt, color = '#F0C24A', n = 12) {
  if (!pt || reduced()) return;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.className = 'fx-spark';
    d.style.left = pt.x + 'px'; d.style.top = pt.y + 'px'; d.style.background = color;
    document.body.appendChild(d);
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, r = 26 + Math.random() * 30;
    d.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r}px)) scale(.2)`, opacity: 0 }],
      { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => d.remove(), () => d.remove());
  }
}

// ------------------------------------------------------------ diffing two views into events
export function diff(prev, next) {
  const fresh = { verts: new Set(), edges: new Set(), knights: new Set(), robber: false, merchant: false, ships: new Set(), hexes: new Set(), pirate: false, vinfo: new Map() };
  if (!prev || prev.id !== next.id) return { fresh, events: [] };
  for (const [v, b] of Object.entries(next.buildings)) {
    const o = prev.buildings[v];
    if (!o || o.type !== b.type || o.metro !== b.metro || o.wall !== b.wall) {
      fresh.verts.add(+v);
      // what was built decides how the builder works on it (a lost metropolis, wall or city is not "built")
      const kind = !o ? b.type : o.type === 'settlement' && b.type === 'city' ? 'city' : o.type === b.type && b.metro && o.metro !== b.metro ? 'metro' : o.type === b.type && b.wall && !o.wall ? 'wall' : null;
      if (kind) fresh.vinfo.set(+v, { kind, prev: o ? o.type : null });
    }
  }
  for (const e of Object.keys(next.roads)) if (prev.roads[e] === undefined) fresh.edges.add(+e);
  for (const [v, k] of Object.entries(next.knights)) {
    const o = prev.knights[v];
    if (!o || o.p !== k.p || o.level !== k.level || o.active !== k.active) fresh.knights.add(+v);
  }
  for (const e of Object.keys(next.ships || {})) if (!prev.ships || !prev.ships[e]) fresh.ships.add(+e);
  next.board.hexes.forEach((h, i) => { const o = prev.board.hexes[i]; if (o && o.terrain === 'fog' && h.terrain !== 'fog') fresh.hexes.add(h.id); });
  fresh.pirate = prev.pirate !== next.pirate;
  fresh.robber = prev.robber !== next.robber;
  fresh.merchant = JSON.stringify(prev.merchant) !== JSON.stringify(next.merchant);

  // new log entries since prev (logs are capped at 80 in the view, so match on timestamp)
  const lastAt = prev.log.length ? prev.log[prev.log.length - 1].at : 0;
  const lastCount = prev.log.filter(l => l.at === lastAt).length;
  let seen = 0;
  const added = next.log.filter(l => {
    if (l.at > lastAt) return true;
    if (l.at === lastAt) { seen++; return seen > lastCount; }
    return false;
  });
  const events = [];
  if (added.length > 25) return { fresh, events }; // catching up after a reconnect: don't replay everything
  if (fresh.verts.size || fresh.edges.size || fresh.knights.size || fresh.ships.size) events.push({ type: 'build', fresh });
  for (const l of added) events.push({ type: 'log', k: l.k, a: l.a || {} });
  if (prev.longestRoad.p !== next.longestRoad.p && next.longestRoad.p != null) events.push({ type: 'award', what: 'road', p: next.longestRoad.p });
  if (next.largestArmy && prev.largestArmy.p !== next.largestArmy.p && next.largestArmy.p != null) events.push({ type: 'award', what: 'army', p: next.largestArmy.p });
  if (next.phase === 'play' && prev.current !== next.current && next.current === next.me && (next.step === 'roll' || (next.pair && next.pair.phase === 2))) events.push({ type: 'yourTurn' });
  next.players.forEach((p, i) => { const o = prev.players[i]; if (o && p.vp > o.vp) events.push({ type: 'vp', p: i, d: p.vp - o.vp }); });
  if (fresh.robber) events.push({ type: 'robberMoved' });
  if (fresh.pirate) events.push({ type: 'pirateMoved' });
  return { fresh, events };
}

// ------------------------------------------------------------ playing events
export function play(events, view, nameHtml) {
  if (!events.length) return;
  const dealt = events.find(e => e.type === 'log' && e.k === '{@p} turned over an event card ({n}).');
  const rolled = events.find(e => e.type === 'log' && (e.k === '{@p} rolled {n}.' || e.k === '{@p} rolled {n} ({#e}).')) || dealt;
  for (const ev of events) {
    if (ev.type === 'build') buildFx(ev.fresh, view);
    if (ev.type === 'robberMoved') { sfx.place(); }
    if (ev.type === 'pirateMoved') sfx.pirate();
  }
  if (dealt) enqueue(() => SCENES.eventCard(view, dealt.a.n, nameHtml));
  else if (rolled) enqueue(() => diceScene(view, rolled.a.n));
  const logs = events.filter(e => e.type === 'log');
  const attack = logs.find(e => e.k.startsWith('The barbarians attack!'));
  if (attack) {
    const outcome = logs.find(e => e.k.startsWith('The barbarians are repelled') || e.k.startsWith('The barbarians win'));
    enqueue(() => barbarianScene(attack.a, outcome, view, nameHtml));
  } else if (logs.some(e => e.k.startsWith('The barbarian ship advances'))) {
    sfx.horn();
    document.querySelector('.barb-pill')?.classList.add('fx-bob');
  }
  const loot = lootFromLogs(logs);
  if (rolled) {
    if (rolled.a.n === 7) enqueue(() => robberScene(view));
    else if (loot.length) enqueue(() => productionFx(view, rolled.a.n, loot, t('Rolled {n}', { n: rolled.a.n })));
  } else if (loot.length && view.phase !== 'over') {
    const title = logs.some(e => e.k.startsWith('{@p} discovers land')) ? t('Discovery') : view.phase === 'setup' ? t('Starting resources') : t('Loot');
    enqueue(() => productionFx(view, null, loot, title));
  }
  for (const e of logs) {
    if (e.k.startsWith('{@p} discovers land') || e.k === '{@p} sails into open water.') enqueue(() => revealFx(view, e, nameHtml));
    if (e.k.startsWith('{@p} strikes gold')) sfx.gold();
  }
  for (const e of logs) {
    if (e.k === '{@p} stole a card from {@q}.') enqueue(() => stealFx(view, e.a.p, e.a.q));
    if (e.k === '{@p} played {%c}.' || e.k.startsWith('{@p} played {%c} ') || e.k === '{@p} reveals {%c} (+1 VP).') enqueue(() => cardScene(view, e.a.p, e.a.c, nameHtml));
    if (e.k.startsWith('{@p} traded {$g} with {@q}')) { sfx.trade(); enqueue(() => banner(`⇄ ${tf(e.k, e.a, nameHtml)}`, 'trade', 1500)); }
    if (e.k === '{@p} bought a development card.') enqueue(() => devBuyFx(view, e.a.p));
    if (e.k.includes('raises a metropolis') || e.k.includes('takes the metropolis')) enqueue(() => awardScene(view, e.a.p, t('Metropolis!'), tf(e.k, e.a, nameHtml)));
    if (e.k.includes('is named Defender of Broch')) { /* shown inside the barbarian scene */ }
    if (e.k.startsWith('{@p} improved')) sfx.award();
  }
  const vps = events.filter(e => e.type === 'vp');
  if (vps.length) setTimeout(() => vps.forEach(e => vpFx(view, e.p, e.d)), 450);
  for (const ev of events) {
    if (ev.type === 'award') {
      const own = AWARDS_BY_MODE[view.mode];
      enqueue(() => awardScene(view, ev.p, own ? t(own[ev.what][0]) : ev.what === 'road' ? t('Longest Road') : t('Largest Army'), `${nameHtml(ev.p)} · ${esc(t(own ? own[ev.what][1] : '+2 victory points'))}`));
    }
    if (ev.type === 'yourTurn') enqueue(() => yourTurnScene(view));
  }
}

function buildFx(fresh, view) {
  let roadOnly = true, city = false, instant = false;
  if (fresh.ships.size) {
    sfx.sail(); roadOnly = false;
    fresh.ships.forEach(e => { const [a, b] = view.board.edges[e].v.map(i => view.board.vertices[i]); burst(boardPoint((a.x + b.x) / 2 * S, (a.y + b.y) / 2 * S), '#BFE6F5', 10); });
  }
  // a builder is on the way: the hammering, the dust and the "done" sound follow his clock (see builder.js)
  const withBuilder = (job, pt, big) => {
    const age = jobAge(job);
    job.hits.forEach(h => setTimeout(() => sfx.hammer(), Math.max(0, h.t - age)));
    setTimeout(() => { burst(pt, '#EBDDBB', big ? 12 : 8); if (job.kind === 'city') sfx.city(); else if (job.kind === 'road') sfx.road(); else sfx.place(); }, Math.max(0, job.done - age));
  };
  fresh.verts.forEach(v => {
    const vv = view.board.vertices[v];
    const b = view.buildings[v];
    const pt = boardPoint(vv.x * S, vv.y * S);
    const big = b && b.type === 'city';
    const job = findJob('v', v);
    roadOnly = false;
    if (job) { withBuilder(job, pt, big); return; }
    if (big) city = true;
    instant = true;
    burst(pt, big ? '#FFD35A' : '#F0C24A', big ? 22 : 14);
    if (big) setTimeout(() => burst(pt, '#FFF3C4', 12), 180);
  });
  fresh.knights.forEach(v => { const vv = view.board.vertices[v]; burst(boardPoint(vv.x * S, vv.y * S), '#FFF3DC', 10); roadOnly = false; instant = true; });
  fresh.edges.forEach(e => {
    const [a, b] = view.board.edges[e].v.map(i => view.board.vertices[i]);
    const pt = boardPoint((a.x + b.x) / 2 * S, (a.y + b.y) / 2 * S);
    const job = findJob('e', e);
    if (job) withBuilder(job, pt, false);
    else { burst(pt, '#FFF3B0', 6); instant = true; }
  });
  if (!instant) return;
  if (city) sfx.city();
  else if (roadOnly && fresh.edges.size) sfx.road();
  else if (!roadOnly && !fresh.ships.size) sfx.place();
}

// points: the ring around the player's score pops and a +n floats up
function vpFx(view, p, d) {
  const row = document.querySelector(`.player[data-seat="${p}"] .vpr`);
  if (!row) return;
  row.classList.remove('fx-vp'); void row.offsetWidth; row.classList.add('fx-vp');
  setTimeout(() => row.classList.remove('fx-vp'), 1200);
  floatText(row, `+${d}`, '#F0C24A');
}

// a bought development card flies from the deck to its new owner
async function devBuyFx(view, p) {
  sfx.card();
  const deck = document.querySelector('.hud-pill.devdeck');
  const to = p === view.me ? (document.querySelector('.devrow .dcard.fresh') || document.querySelector('.devrow .dcard.buy')) : document.querySelector(`.player[data-seat="${p}"]`);
  if (!deck || !to || reduced()) return;
  const from = centerOf(deck), dest = clampPt(centerOf(to));
  const el = document.createElement('div');
  el.className = 'fx-token';
  el.innerHTML = '<div class="fx-card dev"><i></i></div>';
  el.style.left = from.x + 'px'; el.style.top = from.y + 'px';
  document.body.appendChild(el);
  const dx = dest.x - from.x, dy = dest.y - from.y;
  await el.animate([
    { transform: 'translate(-50%,-50%) scale(.4) rotate(-20deg)', opacity: 0 },
    { transform: `translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${dy * 0.3 - 70}px)) scale(1.35) rotate(8deg)`, opacity: 1, offset: 0.4 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8) rotate(0deg)`, opacity: 1 },
  ], { duration: 820, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).finished.catch(() => {});
  el.remove();
  to.classList.remove('fx-gain'); void to.offsetWidth; to.classList.add('fx-gain');
  setTimeout(() => to.classList.remove('fx-gain'), 900);
}

async function diceScene(view, total) {
  const wrap = document.querySelector('.board-wrap');
  sfx.dice();
  const d = view.dice || {};
  const hitTokens = () => {
    if (total === 7) return;
    document.querySelectorAll(`.board-wrap [data-num="${total}"]`).forEach(h => { h.classList.remove('fx-glow'); void h.getBBox?.(); h.classList.add('fx-glow'); });
    document.querySelectorAll(`.board-wrap .ntok[data-n="${total}"]`).forEach((n, i) => { n.classList.remove('fx-hit'); void n.getBBox?.(); setTimeout(() => n.classList.add('fx-hit'), i * 70); });
  };
  if (!wrap || reduced()) { hitTokens(); return; }
  const el = document.createElement('div');
  el.className = 'fx-dice';
  const face = (cls, val) => `<div class="fx-die ${cls}"><div class="pips">${pipsHtml(val)}</div></div>`;
  el.innerHTML = `<div class="fx-dice-row">${face('red', d.red || 1)}${face('yellow', d.yellow || 1)}${d.event ? `<div class="fx-die event ev-${d.event}"><span>${d.event === 'ship' ? '⛵' : '◆'}</span></div>` : ''}</div>`;
  wrap.appendChild(el);
  const faces = el.querySelectorAll('.fx-die:not(.event) .pips');
  const iv = setInterval(() => faces.forEach(f => { f.innerHTML = pipsHtml(1 + Math.floor(Math.random() * 6)); }), 75);
  await wait(560);
  clearInterval(iv);
  faces[0].innerHTML = pipsHtml(d.red); faces[1].innerHTML = pipsHtml(d.yellow);
  await wait(200);
  el.classList.add('landed');
  sfx.thud();
  wrap.classList.remove('fx-thud'); void wrap.offsetWidth; wrap.classList.add('fx-thud');
  setTimeout(() => wrap.classList.remove('fx-thud'), 400);
  const sumEl = document.createElement('div');
  sumEl.className = 'fx-sum' + (total === 7 ? ' seven' : '');
  sumEl.innerHTML = `<span>${total}</span>`;
  el.appendChild(sumEl);
  hitTokens();
  await wait(total === 7 ? 750 : 700);
  el.classList.add('out');
  setTimeout(() => el.remove(), 300);
}

// where a card should land: my own hand card, or the player's row
function targetFor(view, p, res) {
  if (p === view.me) {
    const c = document.querySelector(`.hand [data-card="${res}"]`);
    if (c) return { el: c, ...centerOf(c) };
  }
  const row = document.querySelector(`.player[data-seat="${p}"]`);
  return row ? { el: row, ...centerOf(row) } : null;
}
const clampPt = pt => pt && ({ ...pt, x: Math.min(innerWidth - 36, Math.max(36, pt.x)), y: Math.min(innerHeight - 36, Math.max(36, pt.y)) });

const EXTRA_COLOR = { fish: '#1F7A99', spice: '#B53A2A', gold: '#C58E12' };
const lootColor = k => CARD_COLOR[k] || EXTRA_COLOR[k] || '#555';
export function floatText(el, text, color = '#FFF3DC') {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'fx-float';
  d.textContent = text;
  d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 2) + 'px'; d.style.color = color;
  document.body.appendChild(d);
  d.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 1200, easing: 'ease-out' }).finished.then(() => d.remove(), () => d.remove());
}
function landFx(target, n, key) {
  if (!target || !target.el) return;
  const el = target.el;
  el.classList.remove('fx-gain'); void el.offsetWidth; el.classList.add('fx-gain');
  setTimeout(() => el.classList.remove('fx-gain'), 900);
  floatText(el, `+${n}`, key === 'fish' ? '#9FE3F5' : '#FFE79A');
  sfx.gain();
}
// one big card that pops up on its tile, shows who it is for, then flies to that player
function flyCard(from, to, key, p, view, delay, n) {
  if (!from || !to || reduced()) return wait(0);
  const c = view.players[p].color;
  const el = document.createElement('div');
  el.className = 'fx-token';
  // the little house in the player's colour (as in the player list) shows who gets the card
  el.innerHTML = `<div class="fx-card big" style="--c:${lootColor(key)};border-color:${PCOLOR[c]}">${glyph(key, 28)}${n > 1 ? `<i class="cnt">×${n}</i>` : ''}<span class="fx-owner" title="${esc(view.players[p].name)}">${houseIcon(c, 14)}</span></div>`;
  el.style.left = from.x + 'px'; el.style.top = from.y + 'px'; el.style.opacity = '0';
  document.body.appendChild(el);
  const dest = clampPt(to);
  const dx = dest.x - from.x, dy = dest.y - from.y;
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
    { transform: 'translate(-50%,calc(-50% - 40px)) scale(1.3)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%,calc(-50% - 40px)) scale(1.3)', opacity: 1, offset: 0.46 },
    { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 80}px)) scale(1)`, opacity: 1, offset: 0.74 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0.95 },
  ], { duration: 1600, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' });
  return anim.finished.then(() => { el.remove(); landFx(to, n, key); }).catch(() => el.remove());
}

// collect every "who got what" from a batch of log lines
function lootFromLogs(logs) {
  const by = new Map();
  const add = (p, k, n) => { const o = by.get(p) || {}; o[k] = (o[k] || 0) + n; by.set(p, o); };
  for (const e of logs) {
    if (e.k === '{@p} receives {$c}.') for (const [k, n] of Object.entries(e.a.c)) add(e.a.p, k, n);
    else if (e.k === '{@p} catches {n} fish tokens.') add(e.a.p, 'fish', e.a.n);
  }
  return [...by.entries()].map(([p, items]) => ({ p, items }));
}

async function productionFx(view, total, loot, title) {
  const wrap = document.querySelector('.board-wrap');
  sfx.loot();
  let panel = null;
  if (wrap) {
    panel = document.createElement('div');
    panel.className = 'fx-loot';
    panel.innerHTML = `<div class="loot-title">${esc(title)}</div>` + loot.map(({ p, items }, ri) => {
      const pl = view.players[p];
      return `<div class="loot-row ${p === view.me ? 'me' : ''}" style="--pc:${PCOLOR[pl.color]};animation-delay:${ri * 130}ms">
        <span class="loot-who">${houseIcon(pl.color, 20)}<span class="loot-name">${esc(pl.name)}</span></span>
        <span class="loot-cards">${Object.entries(items).map(([k, n], ci) => `<span class="lcard" style="--c:${lootColor(k)};animation-delay:${ri * 130 + ci * 110 + 160}ms">${glyph(k, 20)}${n > 1 ? `<i>${n}</i>` : ''}</span>`).join('')}</span></div>`;
    }).join('');
    wrap.appendChild(panel);
  }
  const flights = [];
  let delay = 0;
  if (total != null) {
    const hexes = view.board.hexes.filter(h => h.number === total && h.id !== view.robber);
    const TER = LOOT_BY_MODE[view.mode] || LOOT_TERRAIN;
    let count = 0;
    for (const { p, items } of loot) {
      for (const [res, n] of Object.entries(items)) {
        if (!TER[res]) continue;
        const kinds = [].concat(TER[res]);
        const src = hexes.find(h => kinds.includes(h.terrain) && h.verts.some(v => view.buildings[v] && view.buildings[v].p === p)) || hexes.find(h => kinds.includes(h.terrain));
        if (!src || count >= 24) continue;
        count++;
        flights.push(flyCard(boardPoint(src.x * S, src.y * S), targetFor(view, p, res), res, p, view, delay, n));
        delay += 150;
      }
    }
  }
  await Promise.all([...flights, wait(reduced() ? 900 : 2300)]);
  if (panel) { panel.classList.add('out'); await wait(280); panel.remove(); }
  document.querySelectorAll('.hand .rcard .n').forEach(n => { n.classList.remove('fx-pop'); void n.offsetWidth; n.classList.add('fx-pop'); });
}

async function revealFx(view, e, nameHtml) {
  sfx.reveal();
  const hex = view.board.hexes[e.a.h];
  const open = e.k === '{@p} sails into open water.';
  if (hex) burst(boardPoint(hex.x * S, hex.y * S), open ? '#BFE6F5' : '#F0C24A', 20);
  await banner(`✦ ${tf(e.k, e.a, nameHtml)}`, 'trade', 1500);
}

async function stealFx(view, p, q) {
  sfx.steal();
  const s = view.lastSteal;
  const res = s && s.by === p && s.from === q ? s.card : null;
  const from = document.querySelector(`.player[data-seat="${q}"]`);
  await flyToken(from && centerOf(from), clampPt(targetFor(view, p, res)), res ? tokenHtml(res) : backHtml());
}

// ---- full-screen: robber
const ROBBER_SVG = `<svg viewBox="-60 -80 120 170" class="fx-robber-fig"><defs><radialGradient id="rg" cx="40%" cy="30%"><stop offset="0" stop-color="#4A3A2C"/><stop offset="1" stop-color="#140C06"/></radialGradient></defs>
  <ellipse cx="0" cy="82" rx="46" ry="8" fill="rgba(0,0,0,.45)"/>
  <path d="M-40 80 C-42 30 -26 6 -16 -4 A30 30 0 1 1 16 -4 C26 6 42 30 40 80 Z" fill="url(#rg)" stroke="#000" stroke-width="2"/>
  <circle cy="-34" r="27" fill="url(#rg)" stroke="#000" stroke-width="2"/>
  <path d="M-22 -40 Q0 -50 22 -40 L20 -32 Q0 -40 -20 -32 Z" fill="#000" opacity=".9"/>
  <circle cx="-9" cy="-36" r="3.2" fill="#F0C24A"/><circle cx="9" cy="-36" r="3.2" fill="#F0C24A"/></svg>`;
async function robberScene(view) {
  const th = THREAT_BY_MODE[view.mode];
  (th && sfx[th.sfx || th.sound] ? sfx[th.sfx || th.sound] : sfx.robber)();
  shake();
  const discards = view.pending.filter(p => p.type === 'discard');
  const robberMoves = view.barbarian ? view.barbarian.attacks > 0 : true;
  const own = SEVEN_BY_MODE[view.mode];
  const sub = th && th.sub ? th.sub(view, discards.length) : [
    discards.length ? t('Players holding too many cards must discard half.') : t('Nobody has to discard.'),
    th ? t(th.moves) : own ? t(own.text(view)) : robberMoves ? t('The robber is on the move.') : t('The barbarians have not attacked yet, so the robber stays put.'),
  ].join(' ');
  const sc = layer('fx-robber', `<div class="fx-vignette"></div><div class="fx-robber-stage">${th && th.svg ? th.svg : ROBBER_SVG}</div>
    <div class="fx-robber-text"><div class="fx-seven">7</div><h1>${esc(t(th ? th.title : own ? own.title : 'The robber strikes!'))}</h1><p>${esc(sub)}</p></div>`);
  await hold(sc, 2300);
}

// ---- full-screen: barbarians
const SHIP_SVG = `<svg viewBox="-110 -110 220 160" class="fx-ship"><path d="M-95 10 L95 10 L70 42 L-72 42 Z" fill="#3A2416" stroke="#140A04" stroke-width="3"/>
  <path d="M-95 10 L95 10" stroke="#7A4A23" stroke-width="5"/>${[-60, -30, 0, 30, 60].map(x => `<circle cx="${x}" cy="24" r="6" fill="#C9AE7C" stroke="#140A04" stroke-width="2"/>`).join('')}
  <path d="M0 10 V-100" stroke="#2B1E12" stroke-width="6"/><path d="M-70 -88 Q0 -70 70 -88 L62 -8 Q0 -22 -62 -8 Z" fill="#8E1B16" stroke="#3A0806" stroke-width="3"/>
  <path d="M-20 -70 L0 -40 L20 -70 M-14 -30 L0 -50 L14 -30" stroke="#F0C24A" stroke-width="5" fill="none"/>
  <path d="M0 -100 L26 -92 L0 -84 Z" fill="#000"/><path d="M-95 10 Q-108 -6 -100 -24" stroke="#3A2416" stroke-width="7" fill="none"/></svg>`;
async function barbarianScene(a, outcome, view, nameHtml) {
  sfx.drums(); sfx.horn();
  const won = outcome && outcome.k.startsWith('The barbarians are repelled');
  const k = a.k || [];
  // who gets what
  const res = {};
  if (outcome) {
    const oa = outcome.a || {};
    if (outcome.k.includes('Defender of Broch')) res[oa.p] = 'defender';
    else if (outcome.k.includes('share the glory')) (oa.ps || []).forEach(p => { res[p] = 'progress'; });
    else if (outcome.k.startsWith('The barbarians win!')) (oa.ps || []).forEach(p => { res[p] = 'lose'; });
  }
  const max = Math.max(1, ...k, a.n || 0);
  const rows = view.players.map((pl, i) => ({ pl, i, s: k[i] || 0 })).sort((x, y) => y.s - x.s).map(({ pl, i, s: str }, idx) => {
    const r = res[i];
    const badge = r === 'defender' ? `<span class="bb win" title="${esc(t('Defender of Broch'))}">♛ +1</span>`
      : r === 'progress' ? `<span class="bb prog">${glyph('card', 13)} ${esc(t('Progress card'))}</span>`
        : r === 'lose' ? `<span class="bb lose">${glyph('city', 13)} ${esc(t('−1 city'))}</span>` : '';
    let bars = '';
    for (let j = 0; j < str; j++) bars += `<i style="animation-delay:${1.6 + idx * 0.12 + j * 0.06}s"></i>`;
    return `<div class="br-row ${r || ''}" style="--pc:${PCOLOR[pl.color]};--pd:${PCOLOR_DARK[pl.color]};animation-delay:${1.5 + idx * 0.12}s">
      <span class="br-who">${houseIcon(pl.color, 20)}<b>${esc(pl.name)}</b></span>
      <span class="br-k" title="${esc(t('Active knights'))}">${glyph('knight', 14)}<span class="br-bars" style="--max:${max}">${bars}</span><b>${str}</b></span>${badge}</div>`;
  }).join('');
  const hero = Object.entries(res).find(([, r]) => r === 'defender');
  const heroHtml = hero ? (() => { const pl = view.players[+hero[0]]; return `<div class="br-hero" style="--pc:${PCOLOR[pl.color]};--pd:${PCOLOR_DARK[pl.color]};--pi:${inkOn(pl.color)}"><span class="crown">♛</span>${houseIcon(pl.color, 34)}<div><small>${esc(t('Defender of Broch'))}</small><b>${esc(pl.name)}</b></div><span class="plus">+1</span></div>`; })() : '';
  const sc = layer('fx-barb', `<div class="fx-sea"><svg viewBox="0 0 1200 200" preserveAspectRatio="none"><path class="w1" d="M0 80 Q150 40 300 80 T600 80 T900 80 T1200 80 V200 H0 Z"/><path class="w2" d="M0 110 Q150 70 300 110 T600 110 T900 110 T1200 110 V200 H0 Z"/></svg></div>
    <div class="fx-ship-wrap">${SHIP_SVG}</div>
    <div class="fx-barb-text"><h1>${esc(t('The barbarians attack!'))}</h1>
      <div class="fx-vs"><div><b class="cnt" data-to="${a.n}">0</b><small>${esc(t('Barbarians (cities)'))}</small></div><span>⚔</span><div><b class="cnt" data-to="${a.m}">0</b><small>${esc(t('Active knights'))}</small></div></div>
      <div class="fx-result ${won ? 'win' : 'lose'}">${won ? esc(t('Repelled!')) : esc(t('Broch is pillaged!'))}</div>
      ${heroHtml}
      <div class="br-rows">${rows}</div></div>`);
  sc.el.querySelectorAll('.cnt').forEach(c => {
    const to = +c.dataset.to; let v = 0;
    const iv = setInterval(() => { v++; c.textContent = Math.min(v, to); if (v >= to) clearInterval(iv); }, Math.max(60, 700 / Math.max(1, to)));
  });
  setTimeout(() => {
    won ? sfx.victory() : sfx.defeat();
    if (!won) shake();
  }, 1500);
  if (hero) setTimeout(() => { sfx.award(); const h = sc.el.querySelector('.br-hero'); if (h) burst(centerOf(h), '#F0C24A', 26); }, 2300);
  await hold(sc, hero || !won ? 5200 : 4200);
}

// ---- banners
async function banner(html, cls = '', ms = 1400) {
  const el = document.createElement('div');
  el.className = 'fx-banner ' + cls;
  el.innerHTML = html;
  document.body.appendChild(el);
  await wait(reduced() ? 900 : ms);
  el.classList.add('out');
  await wait(300);
  el.remove();
}
async function yourTurnScene(view) {
  sfx.turn();
  const c = view.players[view.me].color;
  await banner(`<span style="background:${PCOLOR[c]};color:${inkOn(c)}">${esc(t('Your turn'))}</span>`, 'turn', 1300);
}
async function awardScene(view, p, titleText, sub) {
  sfx.award();
  const c = view.players[p].color;
  const sc = layer('fx-award', `<div class="fx-medal" style="--pc:${PCOLOR[c]};--pd:${PCOLOR_DARK[c]}"><svg viewBox="-50 -50 100 100"><circle r="44" fill="#F0C24A" stroke="#A8741C" stroke-width="5"/><circle r="34" fill="var(--pc)" stroke="var(--pd)" stroke-width="3"/><path d="M-14 12 V-2 L0 -16 L14 -2 V12 Z" fill="#FFF3DC" stroke="#2B1E12" stroke-width="2"/></svg></div>
    <h2>${esc(titleText)}</h2><p>${sub}</p>`);
  burst({ x: innerWidth / 2, y: innerHeight * 0.42 }, '#F0C24A', 24);
  await hold(sc, 1700);
}
async function cardScene(view, p, card, nameHtml) {
  sfx.card();
  const deck = view.mode === 'knights' ? (deckOf(card) || 'science') : null;
  const cls = deck || 'dev';
  const icon = deck || card;
  const name = cardName(card);
  // long words (German!) get a smaller size instead of running off the card
  const longest = Math.max(...name.split(/\s+/).map(w => w.length));
  const size = longest <= 9 ? 27 : longest <= 12 ? 23 : longest <= 15 ? 20 : 17;
  const pl = view.players[p];
  const sc = layer('fx-cardplay', `<div class="fx-bigcard ${cls}">
      <div class="bc-top"><span class="bc-ic">${glyph(icon, 34)}</span>${deck ? `<span class="bc-deck">${esc(term(deck))}</span>` : ''}</div>
      <b class="bc-title" style="font-size:${size}px">${esc(name)}</b>
      <p class="bc-desc">${esc(cardDesc(card))}</p>
      <div class="bc-by" style="--pc:${PCOLOR[pl.color]}">${houseIcon(pl.color, 16)}<span>${esc(pl.name)}</span></div>
    </div>`);
  await hold(sc, 1900);
}

export function celebrateSound() { sfx.victory(); setTimeout(() => sfx.award(), 500); }

// for the standalone games' own scenes (see games/*.js)
export { banner, enqueue, layer, hold, wait, burst, boardPoint };
