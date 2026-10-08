import { api, esc, toast, onWs, houseIcon, PCOLOR, PCOLOR_DARK, t, isLightColor } from './core.js';
import { fmtDateLocal } from './i18n.js';
import { topbar, footer, session } from './app.js';
import { sfx, celebrateSound } from './fx.js';
import { flag } from './countries.js';

const tx = (k, p) => esc(t(k, p));
const EXP_NAMES = { seafarers: 'Seafarers', traders: 'Traders & Barbarians', explorers: 'Explorers & Pirates' };
const STANDALONE = { energies: 'New Energies', humankind: 'Dawn of Humankind', inkas: 'Rise of the Inkas', explorers: 'Explorers & Pirates' };
const modeLabel = m => (STANDALONE[m] ? t(STANDALONE[m]) : m === 'knights' ? t('Cities & Knights') : t('Classic'));
const gameLabel = g => [modeLabel(g.mode), g.expansion && EXP_NAMES[g.expansion] ? t(EXP_NAMES[g.expansion]) : null, g.big ? t('5–6') : null].filter(Boolean).join(' + ');
const hexPip = (color, i) => `<i class="pip" style="--c:${PCOLOR[color] || '#999'};--d:${PCOLOR_DARK[color] || '#555'};animation-delay:${Math.min(i, 14) * 45}ms"></i>`;

function podiumHtml(played) {
  const top = played.filter(x => x.wins > 0).slice(0, 3);
  if (!top.length) return '';
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const medal = ['#E8B23A', '#C3C9CF', '#C98A52'];
  return `<div class="podium">${order.map(i => { const x = top[i]; return `<div class="pod p${i + 1}" style="--rank:${i}">
      <div class="who">${houseIcon(x.color, 30)}<b>${flag(x.country)} ${esc(x.name)}</b></div>
      <div class="col" style="--c:${PCOLOR[x.color]};--d:${PCOLOR_DARK[x.color]};--m:${medal[i]}"><span class="rank">${i + 1}</span><span class="w"><b>${x.wins}</b><small>${tx('Wins')}</small></span></div></div>`; }).join('')}</div>`;
}
function standingRow(x, i) {
  const pips = Math.min(x.wins, 14);
  const rate = Math.round(x.rate * 100);
  return `<div class="lb-row ${x.games ? '' : 'idle'}"><span class="pos">${i + 1}</span>${houseIcon(x.color, 22)}<div style="flex:1;min-width:0">
      <div class="nm"><span>${flag(x.country)} ${esc(x.name)}<small>${x.games ? `${tx('Games: {n}', { n: x.games })}${x.online ? ` · ⌀ ${(x.vp / x.online).toFixed(1)} ${tx('pts')}` : ''}` : tx('No games yet')}</small></span><span class="wn">${x.wins}</span></div>
      <div class="pips">${Array.from({ length: pips }, (_, k) => hexPip(x.color, k)).join('')}${x.wins > 14 ? `<small>+${x.wins - 14}</small>` : ''}${!x.wins ? `<small class="muted">${x.games ? '·' : ''}</small>` : ''}</div></div>
      <div class="wring" style="--p:${rate};--c:${PCOLOR[x.color]}" title="${rate}%"><b>${rate}</b></div></div>`;
}
const HEX_CLUSTER = ['#93B86A', '#B4482A', '#2E6B45', '#6E7F8D', '#2E6B45', '#E0A32E'];
const lineColor = c => (c === 'white' ? '#C9B98F' : PCOLOR[c]);

function clusterSvg(centerColor) {
  const r = 20, w = Math.sqrt(3) * r;
  const hex = (cx, cy, fill) => {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`); }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#FBF3DD" stroke-width="2.5"/>`;
  };
  const offs = [[0.5, -1.5], [1, 0], [0.5, 1.5], [-0.5, 1.5], [-1, 0], [-0.5, -1.5]];
  const ring = offs.map(([dx, dy], i) => hex(60 + dx * w, 60 + dy * r, HEX_CLUSTER[i]));
  const house = centerColor ? `<g transform="translate(60,61)"><path d="M-9 10 V-2 L0 -11 L9 -2 V10 Z" fill="${PCOLOR[centerColor]}" stroke="${PCOLOR_DARK[centerColor]}" stroke-width="2" stroke-linejoin="round"/></g>` : '';
  return `<svg viewBox="0 0 120 120" class="cluster">${ring.join('')}${hex(60, 60, '#E9D8AE')}${house}</svg>`;
}

// ------------------------------------------------------------ celebration overlay (shared with game)
export function celebrate({ name, color, country, sub, scores = [], actions = '' }) {
  document.querySelector('.celebrate')?.remove();
  const el = document.createElement('div');
  el.className = 'celebrate';
  const conf = ['#D2352A', '#E0A32E', '#2E6B45', '#93B86A', '#FFF3DC', '#2C6E9B', PCOLOR[color] || '#F0C24A'];
  let confetti = '';
  for (let i = 0; i < 80; i++) {
    confetti += `<i class="confetti" style="left:${Math.random() * 100}%;background:${conf[i % conf.length]};animation-duration:${2.4 + Math.random() * 2.6}s;animation-delay:${Math.random() * 1.2}s;transform:rotate(${Math.random() * 180}deg)"></i>`;
  }
  el.innerHTML = `${confetti}<div class="rays"></div>
    <svg class="badge-hex" viewBox="-60 -60 120 120"><polygon points="0,-54 47,-27 47,27 0,54 -47,27 -47,-27" fill="#E9D8AE" stroke="#F0C24A" stroke-width="4"/>
      <circle r="58" fill="none" stroke="rgba(255,243,220,.35)" stroke-width="2"/>
      <path d="M-18 24 V0 L0 -20 L18 0 V24 Z" fill="${PCOLOR[color] || color}" stroke="${PCOLOR_DARK[color] || '#2B1E12'}" stroke-width="3" stroke-linejoin="round"/>
      <path class="crown" d="M-15 -30 L-12 -44 L-5 -36 L0 -47 L5 -36 L12 -44 L15 -30 Z" fill="#F0C24A" stroke="#A8741C" stroke-width="2"/></svg>
    <h1>${country ? flag(country) + ' ' : ''}${tx('{name} wins', { name })}</h1>
    <div class="sub">${esc(sub || '')}</div>
    ${scores.length ? `<div class="scores">${scores.map(([n, s]) => `<div><span>${esc(n)}</span><b>${esc(s)}</b></div>`).join('')}</div>` : ''}
    <div class="foot">${actions}<button class="btn ghost" data-x>${tx('Close')}</button></div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]') || e.target.closest('a')) el.remove(); });
  document.body.appendChild(el);
}

// ------------------------------------------------------------ stats page
const S = { year: new Date().getFullYear(), tab: 'all', open: null, data: null, manual: { players: [], winner: null, mode: 'classic', date: new Date().toISOString().slice(0, 10) } };

export async function mountStats(app) {
  app.innerHTML = `${topbar('stats')}<div class="page narrow" id="stats"><h1 class="page-title">Siedlermeister</h1><div class="muted">${tx('Loading…')}</div></div>`;
  const load = async () => {
    try { S.data = await api('/stats'); draw(app); } catch (e) { toast(e.message, 'warn'); }
  };
  await load();
  return onWs(m => { if (m.t === 'stats') load(); });
}

function computeTallies(games, users) {
  const T = Object.fromEntries(users.map(u => [u.id, { id: u.id, name: u.name, color: u.color, country: u.country, wins: 0, games: 0, vp: 0, online: 0, modes: {}, results: [], lostTo: {} }]));
  games.forEach(g => {
    g.players.forEach(p => {
      const tt = T[p.userId] ||= { id: p.userId, name: p.name, color: p.color, wins: 0, games: 0, vp: 0, online: 0, modes: {}, results: [], lostTo: {} };
      tt.games++;
      tt.modes[g.mode] = (tt.modes[g.mode] || 0) + 1;
      const won = g.winner === p.userId;
      if (won) tt.wins++;
      else if (g.winner) tt.lostTo[g.winner] = (tt.lostTo[g.winner] || 0) + 1;
      tt.results.push(won);
      if (!g.manual) { tt.vp += p.vp || 0; tt.online++; }
    });
  });
  Object.values(T).forEach(tt => {
    let best = 0, run = 0;
    tt.results.forEach(w => { run = w ? run + 1 : 0; best = Math.max(best, run); });
    let cur = 0;
    for (let i = tt.results.length - 1; i >= 0 && tt.results[i]; i--) cur++;
    tt.bestStreak = best; tt.streak = cur;
    const nem = Object.entries(tt.lostTo).sort((a, b) => b[1] - a[1])[0];
    tt.nemesis = nem ? { id: nem[0], n: nem[1] } : null;
    const fav = Object.entries(tt.modes).sort((a, b) => b[1] - a[1])[0];
    tt.favMode = fav ? fav[0] : null;
    tt.rate = tt.games ? tt.wins / tt.games : 0;
  });
  return T;
}

function draw(app) {
  const root = app.querySelector('#stats');
  if (!root) return;
  const { history, users } = S.data;
  const U = Object.fromEntries(users.map(u => [u.id, u]));
  const nameOf = (id, fallback) => U[id]?.name || fallback || t('Someone');
  const colorOf = (id, fallback) => U[id]?.color || fallback || 'white';
  const nowY = new Date().getFullYear();
  const years = [...new Set([nowY, ...history.map(h => new Date(h.finishedAt).getFullYear())])].sort();
  const yIdx = years.indexOf(S.year);
  const games = history
    .filter(h => new Date(h.finishedAt).getFullYear() === S.year)
    .filter(h => { const isExp = h.mode === 'knights' || !!STANDALONE[h.mode] || (h.expansion && h.expansion !== 'none') || h.big; return S.tab === 'all' || (S.tab === 'expansion' ? isExp : !isExp); })
    .sort((a, b) => a.finishedAt - b.finishedAt);

  const T = computeTallies(games, users);
  // everyone with an account is listed, even without games
  const board = Object.values(T).sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.games - a.games || a.name.localeCompare(b.name));
  const played = board.filter(x => x.games > 0);
    const top = played.length && played[0].wins ? played.filter(x => x.wins === played[0].wins) : [];
  const leader = top.length === 1 ? { name: top[0].name, color: top[0].color, country: top[0].country, wins: top[0].wins }
    : top.length > 1 ? { name: top.map(x => x.name).join(' & '), color: null, wins: top[0].wins, tie: true } : null;

  root.innerHTML = `
    <h1 class="page-title">Siedlermeister</h1>
    <div class="year-sel"><button data-y="-1" ${yIdx <= 0 ? 'disabled' : ''} aria-label="${tx('Previous year')}">‹</button>
      <div class="y"><b>${S.year}</b><small>${S.year === nowY ? tx('IN PROGRESS') : tx('FINAL')}</small></div>
      <button data-y="1" ${yIdx >= years.length - 1 ? 'disabled' : ''} aria-label="${tx('Next year')}">›</button></div>
    <div class="hextabs" style="margin-top:14px">${[['all', t('All games')], ['classic', t('Classic')], ['expansion', t('Expansions')]].map(([k, l]) => `<button class="hextab ${S.tab === k ? 'on' : ''}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>

    <div class="card" style="margin-top:14px"><div class="leader">${clusterSvg(leader && !leader.tie ? leader.color : null)}
      <div style="min-width:0"><div class="lbl">${S.year === nowY ? tx('LEADING RIGHT NOW') : tx('CHAMPION {year}', { year: S.year })}</div><div class="who">${leader ? `${leader.tie ? '' : flag(leader.country)} ${esc(leader.name)}` : tx('Nobody yet')}</div>
        <div class="row" style="margin-top:8px"><div class="wins-coin">${leader ? leader.wins : '–'}</div><div class="muted" style="font-size:13px;line-height:1.3">${tx('Wins')}<br>${tx('Games: {n}', { n: games.length })}</div></div>
        ${leader && !leader.tie ? `<button class="btn dark small" style="margin-top:10px" data-celebrate>♛ ${tx('Watch the victory celebration')}</button>` : ''}
      </div></div></div>

    <div class="section-label">${tx('Standings {year}', { year: S.year })}</div>
    ${podiumHtml(played.length ? board : [])}
    <div class="card">${board.length ? board.map(standingRow).join('') : `<div class="empty">${tx('No players yet.')}</div>`}</div>

    <div class="section-label">${tx('Over time')}</div>
    <div class="card" style="padding:14px 10px 8px">${chartSvg(games, played)}</div>

    ${played.length ? `<div class="section-label">${tx('Players')}</div><div class="pcards">${board.map(x => playerCard(x, nameOf, colorOf)).join('')}</div>` : ''}

    ${played.length >= 2 ? `<div class="section-label">${tx('Head to head')}</div><div class="card h2h-wrap">${headToHead(games, played)}<p class="muted" style="font-size:12px;margin:8px 0 0">${tx('Each number shows how often the player in the row beat the player in the column.')}</p></div>` : ''}

    ${recordsHtml(games, nameOf)}
    ${diceHtml(games)}

    <div class="section-label">${tx('Log a game played at the table')}</div>
    <div class="card">${manualForm(users)}</div>

    <div class="section-label">${tx('All games {year}', { year: S.year })}</div>
    <div class="card" style="padding:0">${games.length ? games.slice().reverse().map(g => histRow(g, nameOf, colorOf)).join('') : `<div class="empty" style="padding:16px">${tx('Nothing recorded yet.')}</div>`}</div>
    ${footer()}`;

  root.querySelectorAll('[data-y]').forEach(b => b.onclick = () => { S.year = years[yIdx + +b.dataset.y]; sfx.click(); draw(app); });
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; sfx.click(); draw(app); });
  root.querySelector('[data-celebrate]')?.addEventListener('click', () => {
    celebrateSound();
    celebrate({ name: leader.name, color: leader.color, country: leader.country, sub: t('Win number {n} in {year}', { n: leader.wins, year: S.year }), scores: played.slice(0, 6).map(x => [x.name, t('Wins: {n}', { n: x.wins })]) });
  });
  root.querySelectorAll('[data-hist]').forEach(r => r.onclick = e => { if (e.target.closest('[data-del]')) return; S.open = S.open === r.dataset.hist ? null : r.dataset.hist; draw(app); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = t('Delete?'); b.classList.add('primary'); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '×'; b.classList.remove('primary'); } }, 3000); return; }
    try { await api(`/stats/${b.dataset.del}`, { method: 'DELETE' }); toast(t('Deleted.')); } catch (e) { toast(e.message, 'warn'); }
  });
  wireManual(root, app);
}

function ring(rate, color) {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 56 56" class="ring"><circle cx="28" cy="28" r="${r}" fill="none" stroke="#E3D2A4" stroke-width="6"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="${lineColor(color)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(rate * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/>
    <text x="28" y="32.5" text-anchor="middle" font-size="13" font-weight="800" fill="#2B1E12" font-family="Fraunces, Georgia, serif">${Math.round(rate * 100)}%</text></svg>`;
}
function playerCard(x, nameOf, colorOf) {
  if (!x.games) {
    return `<div class="pcard idle"><div class="row">${houseIcon(x.color, 26)}<b class="spacer">${flag(x.country)} ${esc(x.name)}</b></div><p class="muted" style="margin:8px 0 0;font-size:13px">${tx('No games yet this year.')}</p></div>`;
  }
  const facts = [
    [t('Wins'), `${x.wins} / ${x.games}`],
    [t('Best streak'), x.bestStreak],
    [t('Current streak'), x.streak ? `🔥 ${x.streak}` : '–'],
    [t('Favorite version'), x.favMode ? modeLabel(x.favMode) : '–'],
  ];
  return `<div class="pcard"><div class="row">${houseIcon(x.color, 26)}<b class="spacer">${flag(x.country)} ${esc(x.name)}</b>${ring(x.rate, x.color)}</div>
    <dl>${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${x.nemesis ? `<div class="nemesis">${houseIcon(colorOf(x.nemesis.id), 14)} ${tx('Nemesis: {name} ({n}×)', { name: nameOf(x.nemesis.id), n: x.nemesis.n })}</div>` : ''}</div>`;
}

function headToHead(games, players) {
  const ids = players.map(p => p.id);
  const beat = {};
  games.forEach(g => {
    if (!g.winner) return;
    g.players.forEach(p => { if (p.userId !== g.winner) { const k = g.winner + '>' + p.userId; beat[k] = (beat[k] || 0) + 1; } });
  });
  const max = Math.max(1, ...Object.values(beat));
  const head = `<tr><th></th>${players.map(p => `<th title="${esc(p.name)}">${houseIcon(p.color, 16)}<span>${esc(p.name.slice(0, 6))}</span></th>`).join('')}</tr>`;
  const rows = players.map(r => `<tr><th>${houseIcon(r.color, 16)} ${flag(r.country)} ${esc(r.name)}</th>${ids.map(c => {
    if (c === r.id) return '<td class="self"></td>';
    const n = beat[r.id + '>' + c] || 0;
    return `<td style="background:rgba(210,53,42,${(n / max * 0.55).toFixed(2)})">${n || ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="h2h-scroll"><table class="h2h">${head}${rows}</table></div>`;
}

function histRow(g, nameOf, colorOf) {
  const w = g.players.find(p => p.userId === g.winner);
  const canDel = session.user.admin || (g.manual && g.createdBy === session.user.id);
  const open = S.open === g.id;
  const detail = open ? `<div class="hist-detail">
      <div style="margin-bottom:4px">${esc(gameLabel(g))}${g.manual ? ` · ${tx('played at the table')}` : ` · ${tx('Turns: {n}', { n: g.turns })} · ${tx('{n} min', { n: Math.round((g.finishedAt - g.startedAt) / 60000) })}`}</div>
      ${g.players.slice().sort((a, b) => (b.vp || 0) - (a.vp || 0)).map(p => `<div class="sc"><span>${houseIcon(colorOf(p.userId, p.color), 13)} ${esc(nameOf(p.userId, p.name))}${p.userId === g.winner ? ' ♛' : ''}</span><span>${p.vp != null ? tx('Points: {n}', { n: p.vp }) : ''}${p.breakdown?.longestRoad ? ` · ${tx('Longest Road')}` : ''}${p.breakdown?.largestArmy ? ` · ${tx('Largest Army')}` : ''}</span></div>`).join('')}
    </div>` : '';
  return `<div class="hist-row" data-hist="${esc(g.id)}">${houseIcon(colorOf(g.winner, w?.color), 18)}<span class="d">${esc(fmtDateLocal(g.finishedAt))}</span>
    <span class="w">${esc(nameOf(g.winner, w?.name))} <span class="badge ${g.mode === 'knights' ? 'k' : ''}">${STANDALONE[g.mode] ? tx(STANDALONE[g.mode]) : g.mode === 'knights' ? tx('Cities & Knights') : tx('Classic')}</span>${g.expansion && g.expansion !== 'none' ? ` <span class="badge x">${tx(EXP_NAMES[g.expansion] || g.expansion)}</span>` : ''}${g.manual ? ` <span class="badge">${tx('Table')}</span>` : ''}</span>
    ${canDel ? `<button class="btn small" style="padding:2px 8px" data-del="${esc(g.id)}" aria-label="${tx('Delete')}">×</button>` : ''}</div>${detail}`;
}

function recordsHtml(games, nameOf) {
  const online = games.filter(g => !g.manual);
  if (!online.length) return '';
  const recs = [];
  const fastest = online.filter(g => g.turns).sort((a, b) => a.turns - b.turns)[0];
  if (fastest) recs.push([t('Fastest win'), t('Turns: {n}', { n: fastest.turns }), nameOf(fastest.winner)]);
  let best = null;
  online.forEach(g => g.players.forEach(p => { if (!best || (p.vp || 0) > best.vp) best = { vp: p.vp || 0, id: p.userId, name: p.name }; }));
  if (best) recs.push([t('Highest score'), t('Points: {n}', { n: best.vp }), nameOf(best.id, best.name)]);
  let rich = null;
  online.forEach(g => g.players.forEach(p => { if (p.gained != null && (!rich || p.gained > rich.n)) rich = { n: p.gained, id: p.userId, name: p.name }; }));
  if (rich) recs.push([t('Most cards harvested'), t('{n} in one game', { n: rich.n }), nameOf(rich.id, rich.name)]);
  const longest = online.filter(g => g.startedAt).sort((a, b) => (b.finishedAt - b.startedAt) - (a.finishedAt - a.startedAt))[0];
  if (longest) recs.push([t('Longest game'), t('{n} min', { n: Math.round((longest.finishedAt - longest.startedAt) / 60000) }), fmtDateLocal(longest.finishedAt)]);
  return `<div class="section-label">${tx('Records')}</div><div class="card"><div class="records">${recs.map(([l, v, w]) => `<div class="record"><small>${esc(l)}</small><b>${esc(v)}</b><span>${esc(w)}</span></div>`).join('')}</div></div>`;
}

function diceHtml(games) {
  const rolls = {};
  games.filter(g => !g.manual).forEach(g => Object.entries(g.rolls || {}).forEach(([k, n]) => { rolls[k] = (rolls[k] || 0) + n; }));
  const total = Object.values(rolls).reduce((a, b) => a + b, 0);
  if (!total) return '';
  const W = 400, H = 170, padB = 22, padT = 18, padL = 8, padR = 8;
  const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const expected = s => (6 - Math.abs(7 - s)) / 36;
  const maxShare = Math.max(...sums.map(s => Math.max((rolls[s] || 0) / total, expected(s))));
  const bw = (W - padL - padR) / sums.length;
  const y = v => padT + (1 - v / maxShare) * (H - padT - padB);
  const bars = sums.map((s, i) => {
    const share = (rolls[s] || 0) / total;
    const x = padL + i * bw;
    const hot = s === 6 || s === 8;
    return `<rect x="${(x + bw * 0.18).toFixed(1)}" y="${y(share).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(H - padB - y(share)).toFixed(1)}" rx="3" fill="${s === 7 ? '#2B1E12' : hot ? '#C1272D' : '#C98A1F'}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${y(share) - 4}" text-anchor="middle" font-size="9.5" fill="#7C6B4E">${rolls[s] || 0}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#2B1E12">${s}</text>`;
  }).join('');
  const exp = sums.map((s, i) => `${i ? 'L' : 'M'}${(padL + i * bw + bw / 2).toFixed(1)} ${y(expected(s)).toFixed(1)}`).join(' ');
  const hot = Object.entries(rolls).sort((a, b) => b[1] - a[1])[0];
  return `<div class="section-label">${tx('Dice')}</div><div class="card" style="padding:12px 10px 8px">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="${tx('How often each number was rolled')}">${bars}
      <path d="${exp}" fill="none" stroke="#2C6E9B" stroke-width="2" stroke-dasharray="4 3"/></svg>
    <p class="muted" style="font-size:12px;margin:4px 8px 2px">${tx('Bars: rolls this year. Dashed line: what the odds predict. Hottest number: {n} ({m} of {total} rolls).', { n: hot[0], m: hot[1], total })}</p></div>`;
}

function chartSvg(games, board) {
  if (!games.length) return `<div class="empty" style="text-align:center;padding:40px 10px">${tx('The chart fills in as games are played.')}</div>`;
  const W = 400, H = 200, padL = 26, padB = 22, padT = 8, padR = 10;
  const players = board.slice(0, 8);
  const n = games.length;
  const maxY = Math.max(1, ...players.map(p => p.wins));
  const x = i => padL + (n === 1 ? (W - padL - padR) / 2 : i / (n - 1) * (W - padL - padR));
  const y = v => padT + (1 - v / maxY) * (H - padT - padB);
  const grid = [];
  const step = Math.max(1, Math.ceil(maxY / 4));
  for (let v = 0; v <= maxY; v += step) grid.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#E3D2A4"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#7C6B4E">${v}</text>`);
  const labels = [];
  const every = Math.max(1, Math.ceil(n / 5));
  games.forEach((g, i) => { if (i % every === 0 || i === n - 1) labels.push(`<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#7C6B4E">${esc(fmtDateLocal(g.finishedAt, { day: 'numeric', month: 'numeric' }))}</text>`); });
  const lines = players.map(p => {
    let c = 0;
    const pts = games.map((g, i) => { if (g.winner === p.id) c++; return [x(i), y(c)]; });
    if (n === 1) pts.unshift([padL, y(0)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    const last = pts[pts.length - 1];
    return `<path class="chart-line" d="${d}" fill="none" stroke="${lineColor(p.color)}" stroke-width="2.6" stroke-linecap="round" pathLength="100"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${lineColor(p.color)}"/>`;
  });
  const legend = players.map(p => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px">${houseIcon(p.color, 12)}${esc(p.name)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="${tx('Cumulative wins over the year')}">
    ${grid.join('')}<line x1="${padL}" x2="${padL}" y1="${padT}" y2="${H - padB}" stroke="#C9AE7C"/>${labels.join('')}${lines.join('')}</svg>
    <div style="padding:4px 8px 2px">${legend}</div>`;
}

function manualForm(users) {
  const M = S.manual;
  return `<label class="field" style="margin-top:0"><span>${tx('When was it played')}</span><input class="input" type="date" id="mdate" value="${M.date}"></label>
    <div class="field"><span>${tx('Version')}</span><div class="chips">${['classic', 'knights'].map(m => `<button class="chip ${M.mode === m ? 'on' : ''}" data-mmode="${m}">${esc(modeLabel(m))}</button>`).join('')}</div></div>
    <div class="field"><span>${tx('Who played')}</span><div class="chips">${users.map(u => `<button class="chip ${M.players.includes(u.id) ? 'on' : ''}" data-mp="${u.id}">${houseIcon(u.color)} ${flag(u.country)} ${esc(u.name)}</button>`).join('')}</div></div>
    <div class="field"><span>${tx('Who won')}</span><div class="chips">${M.players.length ? users.filter(u => M.players.includes(u.id)).map(u => `<button class="chip ${M.winner === u.id ? 'on' : ''}" data-mw="${u.id}">${houseIcon(u.color)} ${esc(u.name)}</button>`).join('') : `<span class="muted" style="font-size:13px">${tx('Pick the players first.')}</span>`}</div></div>
    <button class="btn primary block" id="msave" ${M.winner && M.players.includes(M.winner) ? '' : 'disabled'}>${tx('Save game')}</button>`;
}

function wireManual(root, app) {
  const M = S.manual;
  root.querySelector('#mdate').onchange = e => { M.date = e.target.value; };
  root.querySelectorAll('[data-mmode]').forEach(b => b.onclick = () => { M.mode = b.dataset.mmode; draw(app); });
  root.querySelectorAll('[data-mp]').forEach(b => b.onclick = () => {
    const id = b.dataset.mp;
    M.players = M.players.includes(id) ? M.players.filter(x => x !== id) : [...M.players, id];
    if (!M.players.includes(M.winner)) M.winner = null;
    sfx.click(); draw(app);
  });
  root.querySelectorAll('[data-mw]').forEach(b => b.onclick = () => { M.winner = b.dataset.mw; sfx.click(); draw(app); });
  root.querySelector('#msave').onclick = async () => {
    try {
      await api('/stats/manual', { body: { date: M.date, mode: M.mode, players: M.players, winner: M.winner } });
      const w = S.data.users.find(u => u.id === M.winner);
      S.manual = { ...M, winner: null };
      S.year = new Date(M.date).getFullYear();
      celebrateSound();
      celebrate({ name: w.name, color: w.color, country: w.country, sub: t('Saved to the stats.') });
    } catch (e) { toast(e.message, 'warn'); }
  };
}
