// The side feed: chat, a visual game history (one card per turn) and graphs.
import { esc, t, tf, glyph, houseIcon, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, cardName, term, isLightColor, inkOn } from './core.js';
import { GAMES } from '../games/registry.js';
import { isPhone } from './phone.js';

const tx = (k, p) => esc(t(k, p));
const EXTRA_COLOR = { fish: '#1F7A99', spice: '#B53A2A', gold: '#C58E12' };
const cardColor = k => CARD_COLOR[k] || EXTRA_COLOR[k] || '#7C6B4E';
const lineColor = c => (isLightColor(c) ? PCOLOR_DARK[c] : PCOLOR[c]);

// ------------------------------------------------------------ chat
export function chatHtml(v, pname) {
  if (!v.chat.length) return `<div class="feed-empty">${glyph('chat', 28)}<span>${tx('Say hi to the table.')}</span></div>`;
  let last = null;
  return `<div class="chat-list">${v.chat.map(c => {
    const pl = v.players[c.p];
    const mine = c.p === v.me;
    const cont = last === c.p; last = c.p;
    return `<div class="bub ${mine ? 'me' : ''} ${cont ? 'cont' : ''}" style="--pc:${PCOLOR[pl.color]};--pd:${PCOLOR_DARK[pl.color]};--pi:${inkOn(pl.color)}" data-at="${c.at || 0}">
      ${!mine && !cont ? `<span class="bub-who">${houseIcon(pl.color, 13)}${esc(pl.name)}</span>` : ''}<span class="bub-t">${esc(c.text)}</span></div>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------ history: one card per turn
const GAIN_C = new Set(['{@p} receives {$c}.', '{@p} collects {$c}.', "{@p}'s aqueduct provides {$c}.", '{@p} takes {$c} from the gold field.']);
const GAIN_N = { '{@p} catches {n} fish tokens.': 'fish', '{@p} earns {n} gold.': 'gold' };
const BUILD = {
  '{@p} built a road.': ['road', 'Road'], '{@p} built a settlement.': ['settlement', 'Settlement'], '{@p} built a city.': ['city', 'City'],
  '{@p} placed a settlement.': ['settlement', 'Settlement'], '{@p} placed a city.': ['city', 'City'],
  '{@p} built a ship.': ['ship', 'Ship'], '{@p} built a bridge.': ['bridge', 'Bridge'], '{@p} built a city wall.': ['wall', 'City wall'],
  '{@p} recruited a knight.': ['knight', 'Knight'], '{@p} bought a development card.': ['card', 'Dev card'],
  '{@p} sailed a ship to a new spot.': ['ship', 'Ship'], '{@p} placed a ship.': ['ship', 'Ship'],
};
const AWARD = ['{@p} now holds the Longest Road ({n}).', '{@p} now has the Largest Army.', '{@p} raises a metropolis ({#t}).', '{@p} takes the metropolis ({#t}) from {@q}.',
  'The barbarians are repelled. {@p} is named Defender of Broch (+1 VP).', '{@p} settles a new island and earns a bonus point (+1 VP).', '{@p} settles a new island and earns {n} bonus points.', '{@p} settles a small island and takes a victory point chip (+1 VP).', '{@p} takes a victory point chip (+1 VP).', '{@p} starts to build a wonder ({#w}).', '{@p} builds level {n} of a wonder ({#w}).', 'The pirate lair is destroyed. {@p} earns the bounty (+1 VP).', '{@p} reveals {%c} (+1 VP).'];
const ICON = [
  [/robber|chase/, 'robber'], [/stole|steals|takes cards/, 'robber'], [/barbarian/i, 'barbarian'], [/pirate/, 'ship'],
  [/played|progress card/, 'card'], [/knight/, 'knight'], [/improved/, 'trophy'], [/wins with/, 'trophy'], [/discovers|sails into/, 'flag'],
];
// standalone games with their own threat pieces show them instead of the robber
const iconFor = (k, v) => { const i = (ICON.find(([re]) => re.test(k)) || [null, 'dot'])[1]; const th = i === 'robber' && GAMES[v && v.mode] && GAMES[v.mode].threat; return th && th.icon ? th.icon : i; };
const SKIP = new Set(['{@p} offers {$g} for {$w}.', '{@p} rolled {n}.', '{@p} rolled {n} ({#e}).', '{@p} places first.']);

const mini = (k, n = 1) => `<span class="mc" style="--c:${cardColor(k)}" title="${esc(resName(k))}">${glyph(k, 13)}${n > 1 ? `<b>${n}</b>` : ''}</span>`;
const cardsRow = c => Object.entries(c || {}).filter(([, n]) => n > 0).map(([k, n]) => mini(k, n)).join('');
const chip = (pl, small) => `<span class="pchip ${small ? 'sm' : ''}">${houseIcon(pl.color, small ? 12 : 14)}<span>${esc(pl.name)}</span></span>`;

export function historyHtml(v, pname) {
  const log = v.log || [];
  if (!log.length) return `<div class="feed-empty">${glyph('dice', 28)}<span>${tx('Nothing has happened yet.')}</span></div>`;
  // group by turn, newest turn first
  const turns = [];
  let cur = null;
  for (const l of log) {
    const tn = l.turn ?? 0;
    if (!cur || cur.turn !== tn) { cur = { turn: tn, items: [] }; turns.push(cur); }
    cur.items.push(l);
  }
  turns.reverse();
  // only the last move: older turns stay hidden so nobody can look up what the others collected
  for (const tr of turns) {
    const card = turnCard(v, tr, pname, true);
    if (card) return card;
  }
  return `<div class="feed-empty">${glyph('dice', 28)}<span>${tx('Nothing has happened yet.')}</span></div>`;
}

function turnCard(v, tr, pname, newest) {
  const roll = tr.items.find(l => l.k === '{@p} rolled {n}.' || l.k === '{@p} rolled {n} ({#e}).');
  const ownerP = roll ? roll.a.p : tr.turn === v.turn && tr.turn > 0 ? v.current : (tr.items.find(l => l.a && l.a.p != null) || {}).a?.p;
  const owner = ownerP != null ? v.players[ownerP] : null;
  const setup = tr.turn === 0;
  // collect
  const gains = new Map();
  const addGain = (p, k, n) => { const o = gains.get(p) || {}; o[k] = (o[k] || 0) + n; gains.set(p, o); };
  const builds = [];
  const rows = [];
  for (const l of tr.items) {
    const k = l.k, a = l.a || {};
    if (!k || SKIP.has(k)) continue;
    if (GAIN_C.has(k)) { for (const [r, n] of Object.entries(a.c || {})) addGain(a.p, r, n); continue; }
    if (GAIN_N[k]) { addGain(a.p, GAIN_N[k], a.n || 1); continue; }
    if (BUILD[k]) { builds.push({ p: a.p, icon: BUILD[k][0], label: t(BUILD[k][1]) }); continue; }
    if (k === '{@p} improved {#t} to level {n}.') { builds.push({ p: a.p, icon: a.t, label: `${term(a.t)} ${a.n}`, deck: a.t }); continue; }
    if (k === '{@p} traded {$g} with the bank for {$w}.') { rows.push(`<div class="ev trade">${owner && a.p === ownerP ? '' : chip(v.players[a.p], true)}<span class="ev-ic bank">${glyph('bank', 14)}</span><span class="cards">${cardsRow(a.g)}</span><span class="arrow">→</span><span class="cards">${cardsRow(a.w)}</span></div>`); continue; }
    if (k === '{@p} traded {$g} with {@q} for {$w}.' || k === "{@p} swaps {$g} for {@q}'s {$w}.") {
      rows.push(`<div class="ev trade">${chip(v.players[a.p], true)}<span class="cards">${cardsRow(a.g)}</span><span class="ev-ic swap">${glyph('swap', 14)}</span><span class="cards">${cardsRow(a.w)}</span>${chip(v.players[a.q], true)}</div>`); continue;
    }
    if (k === '{@p} discarded cards: {n}.') { rows.push(`<div class="ev loss">${chip(v.players[a.p], true)}<span class="minus">−${a.n}</span><span class="ev-ic">${glyph('card', 13)}</span><span class="why">${tx('Discard {n} cards', { n: a.n })}</span></div>`); continue; }
    if (AWARD.includes(k)) { rows.push(`<div class="ev award"><span class="ev-ic gold">${glyph('trophy', 14)}</span><span class="txt">${tf(k, a, pname)}</span></div>`); continue; }
    if (k === '{@p} wins with {n} victory points!') { rows.push(`<div class="ev award win"><span class="ev-ic gold">${glyph('victoryPoint', 14)}</span><span class="txt">${tf(k, a, pname)}</span></div>`); continue; }
    const sys = k.startsWith('Game started') || k.startsWith('Setup complete') || k.startsWith('Special building phase') || k.startsWith('Stone 1:') || k.startsWith('The event cards');
    rows.push(`<div class="ev ${sys ? 'sys' : ''}"><span class="ev-ic">${iconFor(k, v) === 'dot' ? '<i class="dot"></i>' : glyph(iconFor(k, v), 13)}</span><span class="txt">${tf(k, a, pname)}</span></div>`);
  }
  const gainHtml = gains.size ? `<div class="gains">${[...gains.entries()].map(([p, c]) => `<div class="gain">${chip(v.players[p], true)}<span class="cards">${cardsRow(c)}</span></div>`).join('')}</div>` : '';
  const buildHtml = builds.length ? `<div class="builds">${builds.map(b => {
    const pl = v.players[b.p];
    const col = b.deck ? { trade: '#E0A32E', politics: '#2C6E9B', science: '#2E6B45' }[b.deck] : PCOLOR[pl.color];
    return `<span class="bchip" style="--bc:${col};--bd:${b.deck ? 'rgba(0,0,0,.2)' : PCOLOR_DARK[pl.color]}" title="${esc(pl.name)}"><i class="bi">${glyph(b.icon, 13)}</i>${esc(b.label)}</span>`;
  }).join('')}</div>` : '';
  if (!gainHtml && !buildHtml && !rows.length && !roll) return '';
  const dice = roll ? `<span class="roll ${roll.a.n === 7 ? 'seven' : ''}" title="${tx('Rolled {n}', { n: roll.a.n })}">${glyph('dice', 13)}<b>${roll.a.n}</b></span>` : '';
  const head = setup
    ? `<span class="th-who">${glyph('flag', 14)}<b>${tx('Setup phase')}</b></span>`
    : `<span class="th-who">${owner ? houseIcon(owner.color, 15) : ''}<b>${owner ? esc(owner.name) : ''}</b></span><span class="th-turn">${tx('turn {n}', { n: tr.turn })}</span>`;
  return `<div class="turn-card ${newest ? 'newest' : ''}" style="--pc:${owner ? PCOLOR[owner.color] : '#C9AE7C'}" data-turn="${tr.turn}">
    <div class="th">${head}<span class="spacer"></span>${dice}</div>
    ${gainHtml}${buildHtml}${rows.length ? `<div class="evs">${rows.join('')}</div>` : ''}</div>`;
}

// ------------------------------------------------------------ graphs
// Colour = the player's own piece colour (fixed identity). Light colours get a dark casing on lines,
// every series is also named in the legend and at the line end, and the tooltip lists the values.
export function graphsHtml(v, width) {
  const tr = v.track || [];
  const phone = isPhone();
  const W = Math.max(phone ? 250 : 260, Math.round(width || 340));
  const rolls = v.stats?.rolls || {};
  const totalRolls = Object.values(rolls).reduce((a, b) => a + b, 0);
  const tiles = statTiles(v, rolls, totalRolls);
  if (tr.length < 2 && !totalRolls) return `${tiles}<div class="feed-empty">${glyph('dice', 28)}<span>${tx('The graphs fill up once the first turns are played.')}</span></div>`;
  return `${tiles}
    <section class="gx"><h4>${tx('Victory points over time')}</h4>${legend(v, phone)}${phone ? '<div class="gx-cap" data-cap="vp"></div>' : ''}<div class="gx-plot" data-chart="vp">${vpChart(v, tr, W, phone)}</div></section>
    <section class="gx"><h4>${tx('Dice rolls')}</h4><p class="gx-sub">${tx('Bars: rolled · line: expected after {n} rolls', { n: totalRolls })}</p>${phone ? '<div class="gx-cap" data-cap="dice"></div>' : ''}<div class="gx-plot" data-chart="dice">${diceChart(rolls, totalRolls, W)}</div></section>
    <section class="gx"><h4>${tx('Resources received')}</h4><div class="gx-plot" data-chart="gain">${gainChart(v, W)}</div></section>`;
}

function statTiles(v, rolls, total) {
  const nums = Object.entries(rolls).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const hot = nums.length ? nums[0][0] : '–';
  const sevens = rolls[7] || 0;
  const tile = (label, value) => `<div class="tile-s"><small>${esc(label)}</small><b>${esc(String(value))}</b></div>`;
  const robbed = v.stats?.robbed;
  const rob = robbed && robbed.some(n => n > 0)
    ? `<div class="tiles rob">${v.players.map((p, i) => ({ p, n: robbed[i] || 0 })).sort((a, b) => b.n - a.n).map(x => tile(t('Robber at {name}', { name: x.p.name }), `${x.n}×`)).join('')}</div>` : '';
  return `<div class="tiles">${tile(t('Rolls'), total)}${tile(t('Most rolled'), hot)}${tile(t('Sevens'), sevens)}</div>${rob}`;
}

function legend(v, phone) {
  // phone: the legend carries the current points (the labels at the line ends are gone there)
  const last = phone && v.track && v.track.length ? v.track[v.track.length - 1].vp : null;
  return `<div class="gx-legend">${v.players.map((p, i) => `<span class="lg" data-seat="${i}"><i class="key" style="--c:${lineColor(p.color)}"></i>${esc(p.name)}${last ? ` <b>${last[i]}</b>` : ''}</span>`).join('')}</div>`;
}

const SURF = '#FBF3DD', GRID = '#E3D2A4', INK = '#2B1E12', MUTED = '#7C6B4E';

function vpChart(v, tr, W, phone = false) {
  const H = 170, L = 26, R = phone ? 14 : 66, T = 10, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const target = v.options?.vpTarget || 10;
  const maxV = Math.max(target, ...tr.map(s => Math.max(...s.vp)));
  const n = tr.length;
  const x = i => L + (n <= 1 ? pw : (i / (n - 1)) * pw);
  const y = val => T + ph - (val / maxV) * ph;
  let g = '';
  // grid: 0, half, target
  [0, Math.round(target / 2), target].forEach(val => {
    g += `<line x1="${L}" x2="${L + pw}" y1="${y(val).toFixed(1)}" y2="${y(val).toFixed(1)}" stroke="${val === target ? '#C9AE7C' : GRID}" stroke-width="1"/>`;
    g += `<text x="${L - 6}" y="${(y(val) + 4).toFixed(1)}" text-anchor="end" class="ax">${val}</text>`;
  });
  g += `<text x="${L + pw}" y="${(y(target) - 4).toFixed(1)}" text-anchor="end" class="ax">${tx('Goal')}</text>`;
  // x ticks: first, middle, last turn
  const ticks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [...Array(n).keys()];
  ticks.forEach(i => { g += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax">${tr[i].t}</text>`; });
  // lines (step after: points change at the end of a turn)
  const ends = [];
  // phone: lines that share a value at a turn are pushed 1.5px apart so every colour stays visible
  const nudge = (s, pi) => {
    if (!phone) return 0;
    const same = v.players.map((_, k) => k).filter(k => s.vp[k] === s.vp[pi]);
    return (same.indexOf(pi) - (same.length - 1) / 2) * 1.5;
  };
  v.players.forEach((p, pi) => {
    let d = '';
    tr.forEach((s, i) => { const X = x(i).toFixed(1), Y = (y(s.vp[pi]) + nudge(s, pi)).toFixed(1); d += i === 0 ? `M${X} ${Y}` : ` H${X} V${Y}`; });
    const c = PCOLOR[p.color];
    if (isLightColor(p.color)) g += `<path d="${d}" fill="none" stroke="${PCOLOR_DARK[p.color]}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" class="ln-draw"/>`;
    g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="ln-draw"/>`;
    const last = tr[n - 1].vp[pi];
    ends.push({ pi, y: y(last) + nudge(tr[n - 1], pi), val: last, p });
  });
  // end labels with leader lines when they would overlap
  ends.sort((a, b) => a.y - b.y);
  const placed = [];
  ends.forEach(e => { let ly = e.y; if (placed.length && ly - placed[placed.length - 1] < 12) ly = placed[placed.length - 1] + 12; placed.push(ly); e.ly = ly; });
  // keep the label stack inside the plot: shift it up if it runs past the bottom
  const over = ends.length ? ends[ends.length - 1].ly - (T + ph) : 0;
  if (over > 0) ends.forEach(e => { e.ly = Math.max(T + 4, e.ly - over); });
  ends.forEach(e => {
    const X = x(n - 1);
    if (!phone && Math.abs(e.ly - e.y) > 1) g += `<path d="M${(X + 5).toFixed(1)} ${e.y.toFixed(1)} L${(X + 10).toFixed(1)} ${e.ly.toFixed(1)}" stroke="${MUTED}" stroke-width="1" fill="none"/>`;
    g += `<circle cx="${X.toFixed(1)}" cy="${e.y.toFixed(1)}" r="4.5" fill="${PCOLOR[e.p.color]}" stroke="${isLightColor(e.p.color) ? PCOLOR_DARK[e.p.color] : SURF}" stroke-width="2"/>`;
    if (!phone) g += `<text x="${(X + 12).toFixed(1)}" y="${(e.ly + 4).toFixed(1)}" class="lb"><tspan font-weight="700">${e.val}</tspan> ${esc(e.p.name.slice(0, 7))}</text>`;
  });
  // hover layer
  g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="${INK}" stroke-width="1" opacity="0"/>`;
  g += `<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${tx('Victory points over time')}" data-n="${n}" data-l="${L}" data-pw="${pw}">${g}</svg>`;
}

const EXPECT = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
function diceChart(rolls, total, W) {
  const H = 150, L = 22, R = 8, T = 14, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const exp = k => total * EXPECT[k] / 36;
  const maxV = Math.max(1, ...nums.map(k => Math.max(rolls[k] || 0, exp(k))));
  const band = pw / nums.length;
  const bw = Math.min(24, band - 6);
  const y = val => T + ph - (val / maxV) * ph;
  const top = nums.reduce((a, k) => ((rolls[k] || 0) > (rolls[a] || 0) ? k : a), 2);
  let g = `<line x1="${L}" x2="${L + pw}" y1="${T + ph}" y2="${T + ph}" stroke="${GRID}" stroke-width="1"/>`;
  nums.forEach((k, i) => {
    const cx = L + band * i + band / 2;
    const val = rolls[k] || 0;
    const h = (val / maxV) * ph;
    const col = k === 7 ? '#C1272D' : '#C98A1F';
    if (h > 0) {
      const r = Math.min(4, h);
      const x0 = cx - bw / 2, y0 = T + ph - h;
      g += `<path class="bar-grow" d="M${x0.toFixed(1)} ${(T + ph).toFixed(1)} V${(y0 + r).toFixed(1)} Q${x0.toFixed(1)} ${y0.toFixed(1)} ${(x0 + r).toFixed(1)} ${y0.toFixed(1)} H${(x0 + bw - r).toFixed(1)} Q${(x0 + bw).toFixed(1)} ${y0.toFixed(1)} ${(x0 + bw).toFixed(1)} ${(y0 + r).toFixed(1)} V${(T + ph).toFixed(1)} Z" fill="${col}"/>`;
    }
    const ey = y(exp(k));
    if (total) g += `<line x1="${(cx - bw / 2 - 3).toFixed(1)}" x2="${(cx + bw / 2 + 3).toFixed(1)}" y1="${ey.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
    g += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax ${k === 7 ? 'seven' : ''}">${k}</text>`;
    if (k === top && val) g += `<text x="${cx.toFixed(1)}" y="${(y(val) - 4).toFixed(1)}" text-anchor="middle" class="lb" font-weight="700">${val}</text>`;
    g += `<rect class="hit" data-k="${k}" data-val="${val}" data-exp="${exp(k).toFixed(1)}" x="${(cx - band / 2).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ph}" fill="transparent"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${tx('Dice rolls')}">${g}</svg>`;
}

function gainChart(v, W) {
  const got = v.stats?.gained || v.players.map(() => 0);
  const rowH = 26, H = v.players.length * rowH + 6, L = 92, R = 34;
  const pw = W - L - R;
  const maxV = Math.max(1, ...got);
  let g = '';
  v.players.forEach((p, i) => {
    const y0 = 4 + i * rowH;
    const w = (got[i] / maxV) * pw;
    g += `<text x="${L - 8}" y="${y0 + 15}" text-anchor="end" class="lb">${esc(p.name.slice(0, 11))}</text>`;
    if (w > 0) {
      const r = Math.min(4, w);
      const light = isLightColor(p.color);
      g += `<path class="bar-grow-x" d="M${L} ${y0 + 4} H${(L + w - r).toFixed(1)} Q${(L + w).toFixed(1)} ${y0 + 4} ${(L + w).toFixed(1)} ${y0 + 4 + r} V${y0 + 18 - r} Q${(L + w).toFixed(1)} ${y0 + 18} ${(L + w - r).toFixed(1)} ${y0 + 18} H${L} Z" fill="${PCOLOR[p.color]}" ${light ? `stroke="${PCOLOR_DARK[p.color]}" stroke-width="1.5"` : ''}/>`;
    }
    g += `<text x="${(L + w + 6).toFixed(1)}" y="${y0 + 15}" class="lb" font-weight="700">${got[i]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${tx('Resources received')}">${g}</svg>`;
}

// hover: crosshair + one tooltip for every series on the points chart, per-bar tooltips on the dice.
// Touch screens have no hover: a tap or a drag along the chart shows the same numbers in a fixed caption line above
// the plot (.gx-cap), and they stay until the next tap somewhere else.
export function wireGraphs(root, v) {
  const tip = root.querySelector('.gx-tip') || (() => { const d = document.createElement('div'); d.className = 'gx-tip'; root.appendChild(d); return d; })();
  const hide = () => { tip.style.opacity = '0'; root.querySelectorAll('.xh').forEach(l => l.setAttribute('opacity', '0')); };
  const cap = name => root.querySelector(`[data-cap="${name}"]`);
  if (!root._gxTap) {
    root._gxTap = true;
    root.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !e.target.closest('.gx-plot')) { root.querySelectorAll('.gx-cap').forEach(c => { c.textContent = ''; }); root.querySelectorAll('.xh').forEach(l => l.setAttribute('opacity', '0')); } });
  }
  const place = (e) => {
    const r = root.getBoundingClientRect();
    const x = Math.min(r.width - tip.offsetWidth - 6, Math.max(6, e.clientX - r.left + 12));
    tip.style.left = x + 'px'; tip.style.top = (e.clientY - r.top + root.scrollTop + 14) + 'px'; tip.style.opacity = '1';
  };
  const vp = root.querySelector('[data-chart="vp"] svg');
  if (vp) {
    const n = +vp.dataset.n, L = +vp.dataset.l, pw = +vp.dataset.pw;
    const at = e => {
      const box = vp.getBoundingClientRect();
      const sx = vp.viewBox.baseVal.width / box.width;
      const px = (e.clientX - box.left) * sx;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / pw * (n - 1))));
      const X = L + (n <= 1 ? pw : (i / (n - 1)) * pw);
      const xh = vp.querySelector('.xh'); xh.setAttribute('x1', X); xh.setAttribute('x2', X); xh.setAttribute('opacity', '.35');
      return v.track[i];
    };
    const rows = s => v.players.map((p, pi) => ({ p, val: s.vp[pi] })).sort((a, b) => b.val - a.val);
    const caption = (e, touch) => {
      const s = at(e);
      if (touch) {
        const c = cap('vp');
        if (!c) return;
        c.textContent = '';
        const h = document.createElement('b'); h.textContent = s.t ? t('turn {n}', { n: s.t }) : t('Setup phase'); c.appendChild(h);
        rows(s).forEach(({ p, val }) => {
          const k = document.createElement('span'); k.className = 'cp';
          const key = document.createElement('i'); key.className = 'key'; key.style.setProperty('--c', lineColor(p.color));
          const b = document.createElement('b'); b.textContent = val;
          k.append(key, b); c.appendChild(k);
        });
        return;
      }
      tip.textContent = '';
      const h = document.createElement('div'); h.className = 'tt-h'; h.textContent = s.t ? t('turn {n}', { n: s.t }) : t('Setup phase'); tip.appendChild(h);
      rows(s).forEach(({ p, val }) => {
        const row = document.createElement('div'); row.className = 'tt-r';
        const key = document.createElement('i'); key.className = 'key'; key.style.setProperty('--c', lineColor(p.color));
        const b = document.createElement('b'); b.textContent = val;
        const nm = document.createElement('span'); nm.textContent = p.name;
        row.append(key, b, nm); tip.appendChild(row);
      });
      place(e);
    };
    vp.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { try { vp.setPointerCapture(e.pointerId); } catch { /* ignore */ } caption(e, true); } });
    vp.addEventListener('pointermove', e => { if (e.pointerType === 'touch') { if (vp.hasPointerCapture && vp.hasPointerCapture(e.pointerId)) caption(e, true); } else caption(e, false); });
    vp.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hide(); });
  }
  root.querySelectorAll('[data-chart="dice"] .hit').forEach(hit => {
    hit.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const c = cap('dice');
      if (!c) return;
      root.querySelectorAll('[data-chart="dice"] .hit.sel').forEach(h => h.classList.remove('sel'));
      hit.classList.add('sel');
      c.textContent = '';
      const h = document.createElement('b'); h.textContent = hit.dataset.k;
      const a = document.createElement('span'); a.textContent = `${hit.dataset.val} ${t('rolled')}`;
      const b = document.createElement('span'); b.textContent = `${hit.dataset.exp} ${t('expected')}`;
      c.append(h, a, b);
    });
    hit.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      tip.textContent = '';
      const h = document.createElement('div'); h.className = 'tt-h'; h.textContent = hit.dataset.k; tip.appendChild(h);
      const r1 = document.createElement('div'); r1.className = 'tt-r'; const b1 = document.createElement('b'); b1.textContent = hit.dataset.val; const s1 = document.createElement('span'); s1.textContent = t('rolled'); r1.append(b1, s1);
      const r2 = document.createElement('div'); r2.className = 'tt-r'; const b2 = document.createElement('b'); b2.textContent = hit.dataset.exp; const s2 = document.createElement('span'); s2.textContent = t('expected'); r2.append(b2, s2);
      tip.append(r1, r2); place(e);
    });
    hit.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hide(); });
  });
}
