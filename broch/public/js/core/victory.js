// The end of a game, made to feel like a win: a flash, fireworks and confetti, the winner's house stamped onto a
// golden laurel with a crown dropping on it, the name popping in letter by letter, the points counting up with what
// earned them, how the race went, the rest of the table on a podium and a few fun facts.
import { t, esc, PCOLOR, PCOLOR_DARK, GLYPH, houseIcon, isLightColor } from './core.js';
import { flag } from './countries.js';
import { sfx } from './fx.js';
import { metroTowerInner } from './board.js';
import { GAMES } from '../games/registry.js';

const tx = (k, p) => esc(t(k, p));
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const f1 = n => n.toFixed(1);
const ico = (k, size = 16, color = '#FFF3DC') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}">${GLYPH[k] || ''}</svg>`;

let open = null; // the scene on screen: { el, stop }

export function closeVictory() {
  if (!open) return;
  const o = open; open = null;
  o.stop();
  o.el.classList.add('out');
  setTimeout(() => o.el.remove(), 320);
}

// view: the game view at the end; actions: extra buttons (html); onClose: called when the scene closes
export function victoryScene(view, { actions = '', title = '' } = {}) {
  closeVictory();
  if (view.winner == null) return;
  const w = view.players[view.winner];
  const me = view.me;
  const won = me === view.winner;
  const pc = PCOLOR[w.color] || '#F0C24A', pd = PCOLOR_DARK[w.color] || '#2B1E12';
  const order = view.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.vp - a.p.vp || (a.i === view.winner ? -1 : b.i === view.winner ? 1 : 0));
  const myPlace = order.findIndex(o => o.i === me) + 1;
  const target = Math.max(view.options?.vpTarget || 10, w.vp);

  const el = document.createElement('div');
  el.className = `vic ${won ? 'won' : ''}`;
  el.style.setProperty('--pc', pc);
  el.style.setProperty('--pd', pd);
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('{name} wins!', { name: w.name }));

  const letters = Array.from(w.name).map((ch, i) => `<span class="ch" style="animation-delay:${(0.62 + i * 0.045).toFixed(3)}s">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
  const chips = breakdownChips(view, w);
  el.innerHTML = `<canvas class="vic-canvas" aria-hidden="true"></canvas>
    <div class="vic-scroll"><div class="vic-card">
      <div class="vic-ribbon ${won ? '' : 'plain'}"><span>${won ? tx('Victory!') : tx('Game over')}</span></div>
      <div class="vic-trophy"><div class="vic-rays"></div>${emblem(w.color)}<i class="vic-shock"></i><i class="vic-shock b"></i></div>
      ${won ? `<div class="vic-you">${tx('You won!')}</div>` : ''}
      <h1 class="vic-name">${w.country ? `<span class="vic-flag">${flag(w.country)}</span>` : ''}${letters}</h1>
      <div class="vic-line"></div>
      <div class="vic-sub">${won ? '' : `${tx('{name} wins!', { name: w.name })} · `}${esc(title)}</div>
      <div class="vic-vp"><b class="vic-count" data-to="${w.vp}">0</b><span>${tx('victory points')}</span></div>
      ${chips.length ? `<div class="vic-break">${chips.map((c, i) => c.replace('<span class="vic-chip"', `<span class="vic-chip" style="animation-delay:${(1.5 + i * 0.13).toFixed(2)}s"`)).join('')}</div>` : ''}
      ${!won && myPlace > 0 && me != null && view.players[me] ? `<div class="vic-mine">${tx('You finished in place {n} with {m} points.', { n: myPlace, m: view.players[me].vp })}</div>` : ''}
      ${raceHtml(view, target)}
      <div class="vic-panel vic-podium" style="animation-delay:2.5s"><h3>${tx('Final standings')}</h3>${order.map(({ p, i }, k) => podiumRow(view, p, i, k, target)).join('')}</div>
      ${factsHtml(view)}
      <div class="vic-foot">${actions}<button class="btn ghost" data-vic-close>${tx('Look at the board')}</button></div>
    </div></div>`;
  document.body.appendChild(el);

  const stopFx = reduced() ? () => {} : fireworks(el.querySelector('.vic-canvas'), [pc, '#F6CF57', '#FFF3DC', '#FF8A5B', '#7FD3FF', '#B6F07A'], won ? 7600 : 3800);
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, reduced() ? Math.min(ms, 200) : ms));
  // the soundtrack
  sfx.fanfare ? sfx.fanfare() : sfx.victory();
  later(380, () => sfx.thud());
  later(900, () => sfx.gold());
  // points count up, then bump
  const cnt = el.querySelector('.vic-count');
  later(1300, () => {
    const to = +cnt.dataset.to; let v = 0;
    const step = () => {
      v++; cnt.textContent = Math.min(v, to);
      sfx.tick ? sfx.tick(v) : sfx.click();
      if (v < to) timers.push(setTimeout(step, Math.max(45, 900 / Math.max(1, to))));
      else { cnt.classList.add('bump'); sfx.award(); }
    };
    if (to > 0) step();
  });

  const onKey = e => { if (e.key === 'Escape') closeVictory(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', e => {
    if (e.target.closest('[data-vic-close]') || e.target.closest('a')) closeVictory();
  });
  open = {
    el,
    stop: () => { stopFx(); timers.forEach(clearTimeout); document.removeEventListener('keydown', onKey); },
  };
  return el;
}

// ------------------------------------------------------------ the emblem: laurel, house, crown, sparkles
function emblem(color) {
  const pc = PCOLOR[color] || color, pd = PCOLOR_DARK[color] || '#2B1E12';
  // two laurel branches grow up along a circle, leaves in pairs pointing to the tip (one out, one in)
  const R = 70;
  let leaves = '', k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const a = (side === -1 ? 102 + i * 14 : 78 - i * 14) * Math.PI / 180;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      const tg = side === -1 ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)]; // towards the tip
      const nm = [Math.cos(a), Math.sin(a)]; // away from the centre
      for (const out of [1, -1]) {
        const c = Math.cos(0.62), s = Math.sin(0.62) * out;
        const rot = Math.atan2(tg[1] * c + nm[1] * s, tg[0] * c + nm[0] * s) * 180 / Math.PI;
        const len = 21 - i * 0.7, wd = 7.6 - i * 0.22;
        leaves += `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f1(rot)})"><path class="vic-leaf" style="animation-delay:${(0.5 + (i * 2 + (out > 0 ? 0 : 1)) * 0.032).toFixed(3)}s" d="M0 0 Q${f1(len * 0.42)} -${f1(wd)} ${f1(len)} 0 Q${f1(len * 0.42)} ${f1(wd)} 0 0 Z" fill="url(#vlg)" stroke="#8F6210" stroke-width="1.1"/><path d="M1.5 0 H${f1(len * 0.8)}" stroke="#B9851F" stroke-width=".8" opacity=".7"/></g>`;
        k++;
      }
    }
  }
  const P = deg => { const a = deg * Math.PI / 180; return `${f1(Math.cos(a) * R)} ${f1(Math.sin(a) * R)}`; };
  const stems = `<path d="M${P(98)} A${R} ${R} 0 0 1 ${P(234)}" fill="none" stroke="#B9851F" stroke-width="3.6" stroke-linecap="round"/><path d="M${P(82)} A${R} ${R} 0 0 0 ${P(-54)}" fill="none" stroke="#B9851F" stroke-width="3.6" stroke-linecap="round"/>`;
  const spk = (x, y, s, d) => `<g transform="translate(${x},${y})"><path class="vic-spk" style="animation-delay:${d}s" d="M0 -${s} Q${s * 0.18} -${s * 0.18} ${s} 0 Q${s * 0.18} ${s * 0.18} 0 ${s} Q-${s * 0.18} ${s * 0.18} -${s} 0 Q-${s * 0.18} -${s * 0.18} 0 -${s} Z" fill="#FFF6D2"/></g>`;
  return `<svg class="vic-emblem" viewBox="-100 -100 200 196" aria-hidden="true">
    <defs><linearGradient id="vlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE48A"/><stop offset="1" stop-color="#D9971F"/></linearGradient>
      <radialGradient id="vglow"><stop offset="0" stop-color="#FFF3C4" stop-opacity=".95"/><stop offset=".55" stop-color="#FFD35A" stop-opacity=".35"/><stop offset="1" stop-color="#FFD35A" stop-opacity="0"/></radialGradient>
      <linearGradient id="vcrown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A0"/><stop offset="1" stop-color="#E0A32E"/></linearGradient></defs>
    <circle r="78" fill="url(#vglow)"/>
    ${stems}${leaves}
    <path d="M-30 70 Q0 86 30 70 L24 88 L0 80 L-24 88 Z" fill="#C1272D" stroke="#7E1214" stroke-width="2" stroke-linejoin="round"/>
    <g class="vic-house"><ellipse cx="3" cy="44" rx="34" ry="7" fill="rgba(0,0,0,.35)"/>
      <path d="M-30 42 V2 L0 -26 L30 2 V42 Z" fill="${pc}" stroke="${pd}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-8 42 V22 H8 V42" fill="${pd}" opacity=".45"/><path d="M-22 4 L0 -16" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/></g>
    <g class="vic-crown"><path d="M-25 -30 L-30 -58 L-14 -44 L0 -66 L14 -44 L30 -58 L25 -30 Z" fill="url(#vcrown)" stroke="#8F6210" stroke-width="2.6" stroke-linejoin="round"/>
      <rect x="-26" y="-34" width="52" height="8" rx="3" fill="#E0A32E" stroke="#8F6210" stroke-width="2.2"/>
      <circle cy="-30" r="3.2" fill="#C1272D"/><circle cx="-14" cy="-30" r="2.4" fill="#2C6E9B"/><circle cx="14" cy="-30" r="2.4" fill="#2E6B45"/>
      <circle cy="-66" r="3.4" fill="#FFF3C4" stroke="#8F6210" stroke-width="1.4"/></g>
    ${spk(-62, -54, 9, 1.1)}${spk(66, -40, 7, 1.5)}${spk(-74, 18, 6, 1.9)}${spk(76, 30, 8, 1.3)}${spk(40, -78, 5, 2.2)}${spk(-38, -82, 6, 1.7)}
  </svg>`;
}

// ------------------------------------------------------------ what the points were made of
function breakdownChips(view, w) {
  const b = w.breakdown;
  if (!b) return [];
  const chips = [];
  const mk = (icon, pts, label) => `<span class="vic-chip"><i>${icon}</i><b>+${pts}</b><small>${esc(label)}</small></span>`;
  const chip = (icon, pts, label) => chips.push(mk(icon, pts, label));
  if (GAMES[view.mode] && GAMES[view.mode].victoryChips) return GAMES[view.mode].victoryChips(view, w, mk, ico);
  const col = w.color;
  if (b.settlements) chip(houseIcon(col, 16), b.settlements, `${b.settlements} × ${t('Settlements')}`);
  if (b.cities) chip(`<svg viewBox="-16 -14 32 28" width="20" height="18"><path d="M-15 12 V-3 L-6 -13 L3 -3 V0 H15 V12 Z" fill="${PCOLOR[col]}" stroke="${PCOLOR_DARK[col]}" stroke-width="2.4" stroke-linejoin="round"/></svg>`, b.cities * 2, `${b.cities} × ${t('Cities')}`);
  if (b.metropolis) chip(`<svg viewBox="-17 -38 34 38" width="20" height="22">${metroTowerInner()}</svg>`, b.metropolis * 2, t('Metropolis'));
  if (b.longestRoad) chip(ico('road', 16, '#F6CF57'), 2, t(view.expansion === 'seafarers' ? 'Longest Trade Route' : 'Longest Road'));
  if (b.largestArmy) chip(ico('sword', 16, '#F6CF57'), 2, t('Largest Army'));
  if (b.defender) chip('<span style="color:#8FC1E6;font-size:15px">♛</span>', b.defender, t('Defender of Broch'));
  if (b.vpCards) chip(ico('card', 16, '#F6CF57'), b.vpCards, t('Victory point cards'));
  if (b.merchant) chip(ico('trade', 16, '#F6CF57'), 1, t('Merchant'));
  if (b.extras) chip(ico('trophy', 16, '#F6CF57'), b.extras, t('Bonus points'));
  return chips;
}

// ------------------------------------------------------------ how the race went (points over the turns)
function raceHtml(view, target) {
  const tr = (view.track || []).filter(s => s && Array.isArray(s.vp));
  if (tr.length < 3) return '';
  const W = 520, H = 150, pl = 8, pr = 30, pt = 14, pb = 16;
  const n = tr.length;
  const max = Math.max(target, ...tr.map(s => Math.max(...s.vp)));
  const X = i => pl + (i / (n - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - v / max) * (H - pt - pb);
  let g = `<line x1="${pl}" x2="${W - pr}" y1="${f1(Y(target))}" y2="${f1(Y(target))}" stroke="rgba(246,207,87,.55)" stroke-width="1.5" stroke-dasharray="5 5"/><text x="${W - pr + 4}" y="${f1(Y(target) + 4)}" font-size="11" font-weight="800" fill="#F6CF57">${target}</text>`;
  g += `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="rgba(255,243,220,.2)"/>`;
  const lines = view.players.map((p, i) => ({ p, i })).sort((a, b) => (a.i === view.winner) - (b.i === view.winner));
  for (const { p, i } of lines) {
    const win = i === view.winner;
    let d = '';
    tr.forEach((s, k) => { const v = s.vp[i] ?? 0; d += `${k ? 'L' : 'M'}${f1(X(k))} ${f1(Y(v))}`; if (k < n - 1) { const v2 = tr[k + 1].vp[i] ?? 0; if (v2 !== v) d += `L${f1(X(k + 1))} ${f1(Y(v))}`; } });
    const c = PCOLOR[p.color] || '#ccc';
    const dark = !isLightColor(p.color);
    g += `<path class="ln" pathLength="1" d="${d}" fill="none" stroke="${dark ? 'rgba(255,243,220,.35)' : 'rgba(0,0,0,.35)'}" stroke-width="${win ? 7 : 5}" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += `<path class="ln" pathLength="1" d="${d}" fill="none" stroke="${c}" stroke-width="${win ? 4 : 2.6}" stroke-linejoin="round" stroke-linecap="round" opacity="${win ? 1 : 0.85}"/>`;
    const lv = tr[n - 1].vp[i] ?? 0;
    if (win) g += `<g class="vic-endcrown" transform="translate(${f1(X(n - 1))},${f1(Y(lv) - 12)})"><path d="M-8 4 L-9.5 -6 L-4 -1.5 L0 -9 L4 -1.5 L9.5 -6 L8 4 Z" fill="#F6CF57" stroke="#8F6210" stroke-width="1.4" stroke-linejoin="round"/></g>`;
    g += `<circle class="vic-enddot" cx="${f1(X(n - 1))}" cy="${f1(Y(lv))}" r="${win ? 4.5 : 3.2}" fill="${c}" stroke="#FFF3DC" stroke-width="1.5"/>`;
  }
  return `<div class="vic-panel vic-race" style="animation-delay:2.2s"><h3>${tx('How the race went')}</h3><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${tx('Victory points over time')}">${g}</svg></div>`;
}

function podiumRow(view, p, i, k, target) {
  const win = i === view.winner;
  const medal = k < 3 ? `m${k + 1}` : 'm4';
  return `<div class="vic-row ${win ? 'win' : ''} ${i === view.me ? 'me' : ''}" style="--pc:${PCOLOR[p.color]};animation-delay:${(2.6 + k * 0.12).toFixed(2)}s">
    <span class="medal ${medal}">${win ? '♛' : k + 1}</span>${houseIcon(p.color, 18)}
    <span class="nm"><span class="nmt">${p.country ? flag(p.country) + ' ' : ''}${esc(p.name)}</span><span class="bar"><i style="--w:${Math.min(100, (p.vp / target) * 100).toFixed(1)}%;animation-delay:${(2.75 + k * 0.12).toFixed(2)}s"></i></span></span>
    <b>${p.vp}</b></div>`;
}

// ------------------------------------------------------------ a few fun facts
function factsHtml(view) {
  const facts = [];
  const name = i => esc(view.players[i].name);
  const g = view.stats && view.stats.gained;
  if (g && g.length) {
    const i = g.indexOf(Math.max(...g));
    if (g[i] > 0) facts.push([ico('card', 18, '#F6CF57'), t('Most resources'), `${name(i)} · ${g[i]}`]);
  }
  const r = view.stats && view.stats.rolls;
  if (r) {
    const best = Object.entries(r).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) facts.push([ico('dice', 18, '#F6CF57'), t('Most rolled number'), `${best[0]} · ${t('{n}×', { n: best[1] })}`]);
  }
  if (view.longestRoad && view.longestRoad.p != null) facts.push([ico('road', 18, '#F6CF57'), t(view.expansion === 'seafarers' ? 'Longest Trade Route' : 'Longest Road'), `${name(view.longestRoad.p)} · ${view.longestRoad.len}`]);
  if (view.mode !== 'knights' && view.largestArmy && view.largestArmy.p != null) facts.push([ico('sword', 18, '#F6CF57'), t('Largest Army'), `${name(view.largestArmy.p)} · ${view.largestArmy.count}`]);
  facts.push([ico('flag', 18, '#F6CF57'), t('Game length'), t('{n} turns', { n: view.turn })]);
  return `<div class="vic-panel vic-facts" style="animation-delay:3s"><h3>${tx('Highlights')}</h3><div class="vic-fgrid">${facts.slice(0, 4).map(([i, a, b], k) => `<div class="vic-fact" style="animation-delay:${(3.1 + k * 0.1).toFixed(2)}s"><i>${i}</i><span><small>${esc(a)}</small><b>${b}</b></span></div>`).join('')}</div></div>`;
}

// ------------------------------------------------------------ fireworks and confetti on a canvas
export function fireworks(canvas, colors, duration) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  const size = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  window.addEventListener('resize', size);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const sparks = [], rockets = [], conf = [];
  const t0 = performance.now();
  let last = t0, raf = 0, nextRocket = t0 + 250, lastBoom = 0;
  const confColors = [...colors, '#C1272D', '#2C6E9B', '#2E6B45'];
  const addConf = (x, y, vx, vy) => conf.push({ x, y, vx, vy, w: rnd(6, 10), h: rnd(9, 15), r: rnd(0, Math.PI), vr: rnd(-0.012, 0.012), flip: rnd(0, Math.PI), vf: rnd(0.008, 0.02), c: pick(confColors) });
  // two confetti cannons from the bottom corners, then a gentle rain
  const cannons = () => {
    for (let i = 0; i < 70; i++) addConf(rnd(-10, 30), H + 10, rnd(0.25, 0.75), -rnd(0.75, 1.35));
    for (let i = 0; i < 70; i++) addConf(W - rnd(-10, 30), H + 10, -rnd(0.25, 0.75), -rnd(0.75, 1.35));
  };
  const cannonAt = setTimeout(cannons, 320);
  for (let i = 0; i < 60; i++) addConf(rnd(0, W), rnd(-H, -10), rnd(-0.03, 0.03), rnd(0.05, 0.14));
  const launch = () => {
    rockets.push({ x: rnd(W * 0.12, W * 0.88), y: H + 8, vx: rnd(-0.05, 0.05), vy: -rnd(0.75, 1.05) * Math.max(0.75, Math.min(1.25, H / 800)), c: pick(colors), top: rnd(H * 0.12, H * 0.42), trail: [] });
  };
  const explode = r => {
    const n = Math.round(rnd(46, 72)), sp = rnd(0.16, 0.3), ring = Math.random() < 0.3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05);
      const s = ring ? sp : sp * Math.sqrt(Math.random());
      sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(900, 1500), age: 0, c: Math.random() < 0.75 ? r.c : pick(colors), w: rnd(1.6, 2.6) });
    }
    sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: 0, vy: 0, life: 420, age: 0, c: '#FFFFFF', w: 0, flash: true });
    const now = performance.now();
    if (now - lastBoom > 140) { lastBoom = now; sfx.firework && sfx.firework(); }
  };
  const frame = now => {
    const dt = Math.min(34, now - last); last = now;
    const el = now - t0;
    if (el < duration && now >= nextRocket) { launch(); nextRocket = now + rnd(260, 620) * (el < 1500 ? 0.6 : 1); }
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.trail.push([r.x, r.y]); if (r.trail.length > 8) r.trail.shift();
      r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 0.0009 * dt;
      ctx.strokeStyle = r.c; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
      ctx.beginPath(); r.trail.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineTo(r.x, r.y); ctx.stroke();
      if (r.y <= r.top || r.vy >= -0.08) { explode(r); rockets.splice(i, 1); }
    }
    const drag = Math.pow(0.986, dt / 16);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      const k = 1 - s.age / s.life;
      if (s.flash) {
        // a soft bloom where the shell bursts
        const R = 70 * (1.15 - k * 0.5);
        const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
        gr.addColorStop(0, `rgba(255,246,218,${(k * 0.7).toFixed(3)})`); gr.addColorStop(0.35, `rgba(255,214,120,${(k * 0.25).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = gr;
        ctx.fillRect(s.x - R, s.y - R, R * 2, R * 2);
        continue;
      }
      s.px = s.x; s.py = s.y;
      s.vx *= drag; s.vy = s.vy * drag + 0.00011 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const tx0 = s.px - s.vx * dt * 2.6, ty0 = s.py - s.vy * dt * 2.6;
      ctx.strokeStyle = s.c; ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, k * 1.4) * 0.28; ctx.lineWidth = s.w * 3.2; // glow
      ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.globalAlpha = Math.min(1, k * 1.4); ctx.lineWidth = s.w; // core
      ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(s.x, s.y); ctx.stroke();
      if (k < 0.35 && Math.random() < 0.25) { ctx.fillStyle = '#FFF6DA'; ctx.fillRect(s.x, s.y, 1.6, 1.6); } // crackle
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = conf.length - 1; i >= 0; i--) {
      const c = conf[i];
      c.vy = Math.min(0.2, c.vy + 0.0016 * dt); c.vx *= Math.pow(0.992, dt / 16);
      c.x += (c.vx + Math.sin((now + i * 97) / 340) * 0.03) * dt; c.y += c.vy * dt;
      c.r += c.vr * dt; c.flip += c.vf * dt;
      if (c.y > H + 30) { if (el < duration * 0.8) { c.y = rnd(-40, -10); c.x = rnd(0, W); c.vy = rnd(0.05, 0.12); c.vx = rnd(-0.03, 0.03); } else { conf.splice(i, 1); continue; } }
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.scale(1, Math.cos(c.flip));
      ctx.globalAlpha = 0.95; ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (el < duration || sparks.length || rockets.length || conf.length) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); clearTimeout(cannonAt); window.removeEventListener('resize', size); };
}
