import { api, esc, toast, logoSvg, houseIcon, PCOLOR, PCOLOR_DARK, COLOR_KEYS, colorName, setFeedbackUrl, getFeedbackUrl, wsConnect, onWs, wsClose, reportProblem, modal, t, inkOn } from './core.js';
import { LANGS, setLang, guessLang, lang } from './i18n.js';
import { mountGame, unmountGame } from './game.js';
import { mountStats } from './stats.js';
import { isMuted, setMuted, sfx } from './fx.js';
import { flag, countrySelect, guessCountry } from './countries.js';
import { openTutorial } from './tutorial.js';

const app = document.getElementById('app');
export const session = { user: null, config: {} };
let cleanup = null;
const tx = (k, p) => esc(t(k, p));

const SPEAKER = on => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/>${on ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;

function topbar(active) {
  return `<header class="topbar">
    <a class="brand" href="#/">${logoSvg()}BROCH</a>
    <nav class="nav">
      <a href="#/" class="${active === 'play' ? 'on' : ''}">${tx('Play')}</a>
      <a href="#/stats" class="${active === 'stats' ? 'on' : ''}">${tx('Stats')}</a>
      <a href="#/profile" class="${active === 'profile' ? 'on' : ''}">${esc(session.user?.name || t('Profile'))}</a>
      <button class="iconbtn" data-lang-pick title="${tx('Language')}" aria-label="${tx('Language')}">${lang().toUpperCase()}</button>
      <button class="iconbtn" data-mute title="${isMuted() ? tx('Sound off') : tx('Sound on')}" aria-label="${isMuted() ? tx('Sound off') : tx('Sound on')}">${SPEAKER(!isMuted())}</button>
    </nav>
  </header>`;
}
const footer = () => `<div class="footer">${tx('Something not working, or have an idea?')} <a href="${esc(getFeedbackUrl())}" target="_blank" rel="noopener">${tx('Send feedback')}</a></div>`;
export { topbar, footer };

// topbar buttons work on every page
document.addEventListener('click', e => {
  if (e.target.closest('[data-lang-pick]')) return langDialog();
  const m = e.target.closest('[data-mute]');
  if (m) { setMuted(!isMuted()); m.innerHTML = SPEAKER(!isMuted()); m.title = isMuted() ? t('Sound off') : t('Sound on'); if (!isMuted()) sfx.turn(); }
});

function langDialog() {
  modal(`<h2>${tx('Language')}</h2><div class="lang-grid">${LANGS.map(([c, n]) => `<button class="chip ${c === lang() ? 'on' : ''}" data-l="${c}">${esc(n)}</button>`).join('')}</div>
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
    onMount(el, close) {
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = async () => {
        await setLang(b.dataset.l);
        close();
        if (session.user) api('/me', { method: 'PATCH', body: { lang: b.dataset.l } }).catch(() => {});
        route(true);
      });
    },
  });
}

// ------------------------------------------------------------ auth
function renderAuth(mode = 'login') {
  const reg = mode === 'register';
  app.innerHTML = `<div class="page narrow">
    <div class="row" style="justify-content:flex-end;padding-top:12px"><button class="iconbtn" data-lang-pick>${esc(LANGS.find(l => l[0] === lang())[1])}</button></div>
    <div class="auth-hero">${logoSvg('logo-big')}<h1>Broch</h1><p>${tx('Settle, trade and build with your friends.')}</p></div>
    <div class="card">
      <div class="tabs2"><button data-m="login" class="${reg ? '' : 'on'}">${tx('Log in')}</button><button data-m="register" class="${reg ? 'on' : ''}">${tx('Create account')}</button></div>
      <form id="authf">
        ${reg ? `<label class="field"><span>${tx('Display name')}</span><input class="input" name="name" id="f-name" maxlength="24" autocomplete="nickname" required></label>` : ''}
        ${reg ? `<label class="field"><span>${tx('Country')}</span>${countrySelect('f-country', guessCountry())}</label>` : ''}
        <label class="field"><span>${tx('Email')}</span><input class="input" name="email" id="f-email" type="email" autocomplete="email" required></label>
        <label class="field"><span>${tx('Password')}</span><input class="input" name="password" id="f-pw" type="password" minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
        ${reg && session.config.needsCode && !session.config.firstUser ? `<label class="field"><span>${tx('Invite code (ask whoever runs this server)')}</span><input class="input" name="code" id="f-code" required></label>` : ''}
        ${reg && session.config.firstUser ? `<p class="muted" style="font-size:13px">${tx("You're the first player, so this account becomes the admin.")}</p>` : ''}
        <button class="btn primary block" style="margin-top:6px">${reg ? tx('Create account') : tx('Log in')}</button>
        <div class="err-text" id="autherr"></div>
      </form>
    </div>
    ${footer()}
  </div>`;
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  app.querySelector('#authf').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button.primary'); btn.disabled = true;
    try {
      const { user } = await api(reg ? '/register' : '/login', { body: fd });
      session.user = user;
      if (reg) api('/me', { method: 'PATCH', body: { lang: lang() } }).catch(() => {});
      else if (user.lang && user.lang !== lang()) await setLang(user.lang);
      wsConnect();
      route();
    } catch (err) {
      app.querySelector('#autherr').textContent = err.message;
      btn.disabled = false;
    }
  };
}

// ------------------------------------------------------------ lobby
const newGame = { mode: 'classic', expansion: 'none', scenario: 'shores', variants: { fishermen: true, rivers: false, events: false }, missions: ['fish', 'spice', 'lairs'], big: false, robberReturn: false, startBoth: false, maxPlayers: 4, vpTarget: 10, vpTouched: false };
const SCEN_VP = { shores: 14, islands: 13, fog: 12 };
const defaultVp = () => (newGame.mode === 'knights' ? 13 : newGame.expansion === 'seafarers' ? SCEN_VP[newGame.scenario] : newGame.expansion === 'explorers' ? 12 : 10);
const EXP_LABEL = { seafarers: 'Seafarers', traders: 'Traders & Barbarians', explorers: 'Explorers & Pirates' };
const SCEN_LABEL = { shores: 'Heading for New Shores', islands: 'The Four Islands', fog: 'The Fog Islands' };
function colorSwatches(g, meId) {
  const taken = Object.fromEntries(g.seats.map(s => [s.color, s]));
  const mine = g.seats.find(s => s.id === meId);
  return `<div class="swatches" role="radiogroup" aria-label="${tx('Your color')}">${COLOR_KEYS.map(c => {
    const owner = taken[c];
    const isMine = mine && mine.color === c;
    const blocked = owner && owner.id !== meId;
    return `<button class="swatch ${isMine ? 'on' : ''}" role="radio" aria-checked="${isMine}" ${blocked ? 'disabled' : ''} data-gcolor="${c}" data-game="${g.id}"
      title="${esc(colorName(c))}${blocked ? ' · ' + esc(owner.name) : ''}" style="--c:${PCOLOR[c]};--d:${PCOLOR_DARK[c]};--ink:${inkOn(c)}">
      ${blocked ? `<span>${esc(owner.name.slice(0, 1).toUpperCase())}</span>` : isMine ? '<span>✓</span>' : ''}</button>`;
  }).join('')}</div>`;
}

async function renderLobby() {
  app.innerHTML = `${topbar('play')}<div class="page"><h1 class="page-title">${tx('Play')}</h1>
    ${session.user.country ? '' : `<div class="card country-nudge" id="cnudge"><span class="spacer">${tx('Where are you from? Your flag is shown next to your name.')}</span>${countrySelect('nudge-country', guessCountry())}<button class="btn primary small" id="cnsave">${tx('Save')}</button></div>`}
    <div id="lobby" class="grid2"></div>${footer()}</div>`;
  app.querySelector('#cnsave')?.addEventListener('click', async () => {
    const c = app.querySelector('#nudge-country').value;
    if (!c) return;
    try { const r = await api('/me', { method: 'PATCH', body: { country: c } }); session.user = r.user; app.querySelector('#cnudge').remove(); toast(t('Saved.')); } catch (e) { toast(e.message, 'warn'); }
  });
  const help = (id, name) => `<span class="tile-help" data-tut="${id}" role="button" tabindex="0" title="${tx('How to play: {mode}', { mode: t(name) })}" aria-label="${tx('How to play: {mode}', { mode: t(name) })}">?</span>`;
  const sw = (key, title, desc) => `<label class="switch ${newGame[key] ? 'on' : ''}" data-sw="${key}" role="switch" aria-checked="${!!newGame[key]}" tabindex="0"><span class="tr"><i></i></span><span class="tx"><b>${title}</b><small>${desc}</small></span></label>`;
  const subOpts = () => {
    const chip = (on, attr, label, hint) => `<button class="chip ${on ? 'on' : ''}" ${attr} aria-pressed="${on}" ${hint ? `title="${esc(t(hint))}"` : ''}>${esc(t(label))}</button>`;
    if (newGame.expansion === 'seafarers') return `<div class="muted sub-h">${tx('Scenario')}</div><div class="chips">${Object.keys(SCEN_LABEL).map(k => chip(newGame.scenario === k, `data-scen="${k}"`, SCEN_LABEL[k])).join('')}</div>`;
    if (newGame.expansion === 'traders') return `<div class="muted sub-h">${tx('Variants')}</div><div class="chips">${chip(newGame.variants.fishermen, 'data-var="fishermen"', 'Fishermen of Catan', 'Fishing grounds, fish tokens and the old boot.')}${chip(newGame.variants.rivers, 'data-var="rivers"', 'Rivers of Catan', 'Bridges, gold, and the richest and poorest player.')}${chip(newGame.variants.events, 'data-var="events"', 'Event cards', 'A deck of event cards replaces the dice.')}</div>`;
    if (newGame.expansion === 'explorers') return `<div class="muted sub-h">${tx('Missions')}</div><div class="chips">${chip(newGame.missions.includes('fish'), 'data-mis="fish"', 'Fish for Catan')}${chip(newGame.missions.includes('spice'), 'data-mis="spice"', 'Spice for Catan')}${chip(newGame.missions.includes('lairs'), 'data-mis="lairs"', 'Pirate lairs')}</div>`;
    if (newGame.mode === 'knights') return `<div class="muted sub-h">${tx('Cities & Knights')}</div><div class="muted" style="font-size:13px">${tx('Commodities, city improvements, knights and barbarian raids.')}</div>`;
    return `<div class="muted sub-h">${tx('Pick an expansion to see its options.')}</div>`;
  };
  let lastL = null;
  // toggles only redraw from the last lobby snapshot; the server is asked again only when something changed there
  const draw = async (refetch = true) => {
    let L = lastL;
    if (refetch || !L) { try { L = lastL = await api('/lobby'); } catch (e) { toast(e.message, 'warn'); return; } }
    const el = document.getElementById('lobby');
    if (!el) return;
    const me = session.user.id;
    const mineOpen = L.open.filter(g => L.mine.includes(g.id));
    const mineRunning = L.playing.filter(g => L.mine.includes(g.id));
    const others = L.open.filter(g => !L.mine.includes(g.id));
    const watch = L.playing.filter(g => !L.mine.includes(g.id));
    const seats = g => `<span class="seatdots">${g.seats.map(s => houseIcon(s.color, 14)).join('')}</span>`;
    const modeBadge = g => {
      const hasExp = g.expansion && g.expansion !== 'none';
      return `${g.mode === 'knights' ? `<span class="badge k">${tx('Cities & Knights')}</span>` : hasExp ? '' : `<span class="badge">${tx('Classic')}</span>`}${hasExp ? `<span class="badge x">${tx(EXP_LABEL[g.expansion])}</span>` : ''}${g.big ? `<span class="badge">${tx('5–6')}</span>` : ''}${g.robberReturn || g.startBoth ? `<span class="badge h" title="${esc([g.robberReturn ? t('House rule: forgotten robber') : '', g.startBoth ? t('House rule: starting resources for both') : ''].filter(Boolean).join(' · '))}">${tx('House rules')}</span>` : ''}`;
    };
    const sub = g => `${seats(g)} ${g.seats.map(s => `${flag(s.country)} ${esc(s.name)}`).join(', ')} · ${g.seats.length}/${g.maxPlayers} · ${tx('{n} points', { n: g.vpTarget })}${g.status === 'playing' ? ` · ${tx('turn {n}', { n: g.turn })}` : ''}`;
    const gname = g => {
      if (g.name && !g.name.endsWith("'s game")) return esc(g.name);
      const host = g.seats.find(s => s.id === g.host);
      return esc(t("{name}'s game", { name: host ? host.name : g.name.slice(0, -7) }));
    };
    const row = (g, btns) => `<div class="game-row"><div class="info"><div class="title">${gname(g)} ${modeBadge(g)}</div><div class="sub">${sub(g)}</div></div>${btns}</div>`;
    el.innerHTML = `
      <div>
        <div class="card">
          <div class="ng-head"><h2>${tx('New game')}</h2><button class="btn small howto" data-tut-open>▶ ${tx('How to play')}</button></div>
          <div class="field"><span class="muted" style="font-size:13px">${tx('Version')}</span>
            <div class="mode-pick one">
              <button class="mode-tile ${newGame.mode === 'classic' && newGame.expansion === 'none' ? 'on' : ''}" data-exp="none" aria-pressed="${newGame.mode === 'classic' && newGame.expansion === 'none'}"><b>${tx('Classic')}</b><small>${tx('Settle, trade, build. Development cards, Longest Road, Largest Army.')}</small>${help('classic', 'Classic')}</button>
            </div>
          </div>
          <div class="field"><span class="muted" style="font-size:13px">${tx('Expansion')}</span>
            <div class="mode-pick four">
              <button class="mode-tile ${newGame.expansion === 'seafarers' ? 'on' : ''}" data-exp="seafarers" aria-pressed="${newGame.expansion === 'seafarers'}"><b>${tx('Seafarers')}</b><small>${tx('Ships and island exploration.')}</small>${help('seafarers', 'Seafarers')}</button>
              <button class="mode-tile ${newGame.mode === 'knights' ? 'on' : ''}" data-exp="knights" aria-pressed="${newGame.mode === 'knights'}"><b>${tx('Cities & Knights')}</b><small>${tx('Commodities, city improvements, knights and barbarian raids.')}</small>${help('knights', 'Cities & Knights')}</button>
              <button class="mode-tile ${newGame.expansion === 'traders' ? 'on' : ''}" data-exp="traders" aria-pressed="${newGame.expansion === 'traders'}"><b>${tx('Traders & Barbarians')}</b><small>${tx('Fishermen, rivers and event cards.')}</small>${help('traders', 'Traders & Barbarians')}</button>
              <button class="mode-tile ${newGame.expansion === 'explorers' ? 'on' : ''}" data-exp="explorers" aria-pressed="${newGame.expansion === 'explorers'}"><b>${tx('Explorers & Pirates')}</b><small>${tx('Missions across the fog.')}</small>${help('explorers', 'Explorers & Pirates')}</button>
            </div>
          </div>
          <div class="sub-opts">${subOpts()}</div>
          ${sw('big', `${tx('5–6 player expansion')} ${help('big', '5–6 player expansion')}`, tx('Larger board and the special building phase. Works with any number of players.'))}
          <div class="muted house-h">${tx('House rules')}</div>
          ${sw('robberReturn', tx('House rule: forgotten robber'), tx('If a player ends their turn without moving the robber, it goes back to the desert.'))}
          ${sw('startBoth', tx('House rule: starting resources for both'), tx('Both buildings from the setup phase pay starting resources. In Cities & Knights the city counts like a settlement.'))}
          <div class="row wrap" style="gap:18px">
            <div class="field"><span>${tx('Players')}</span><div class="stepper"><button data-np="-1" aria-label="${tx('Fewer')}">−</button><b id="np">${newGame.maxPlayers}</b><button data-np="1" aria-label="${tx('More')}">+</button></div></div>
            <div class="field"><span>${tx('Points to win')}</span><div class="stepper"><button data-vp="-1" aria-label="${tx('Fewer')}">−</button><b id="vpt">${newGame.vpTarget}</b><button data-vp="1" aria-label="${tx('More')}">+</button></div></div>
          </div>
          <button class="btn primary block" id="create">${tx('Create game')}</button>
        </div>
      </div>
      <div>
        ${mineRunning.length ? `<div class="card"><h3>${tx('Your games')}</h3>${mineRunning.map(g => row(g, `${g.current === me ? `<span class="badge turn">${tx('Your turn')}</span>` : ''}<a class="btn small gold" href="#/game/${g.id}">${tx('Open')}</a>`)).join('')}</div>` : ''}
        ${mineOpen.map(g => `<div class="card waiting"><div class="row"><h3 class="spacer">${gname(g)} ${modeBadge(g)}</h3></div>
            <div class="seat-list">${g.seats.map(s => `<div class="seat">${houseIcon(s.color, 26)}<span>${flag(s.country)} ${esc(s.name)}${s.id === g.host ? ` <small class="muted">· ${tx('host')}</small>` : ''}</span></div>`).join('')}
              ${Array.from({ length: g.maxPlayers - g.seats.length }, () => `<div class="seat empty-seat"><span class="ghost-house"></span><span class="muted">${tx('Free seat')}</span></div>`).join('')}</div>
            <div class="field"><span>${tx('Pick your color')}</span>${colorSwatches(g, me)}</div>
            <div class="row wrap">${g.host === me ? `<button class="btn primary" data-start="${g.id}" ${g.seats.length < 2 ? 'disabled' : ''}>${tx('Start game')}</button>` : `<span class="muted" style="font-size:13px">${tx('Waiting for the host to start…')}</span>`}
              <span class="spacer"></span><button class="btn small" data-share="${g.id}">${tx('Copy invite link')}</button><button class="btn small" data-leave="${g.id}">${tx('Leave')}</button></div>
          </div>`).join('')}
        <div class="card"><h3>${tx('Open games')}</h3>${others.length ? others.map(g => row(g, `<button class="btn small gold" data-join="${g.id}" ${g.seats.length >= g.maxPlayers ? 'disabled' : ''}>${tx('Join')}</button>`)).join('') : `<div class="empty">${tx('No open games. Create one and invite your friends.')}</div>`}</div>
        ${watch.length ? `<div class="card"><h3>${tx('Watch')}</h3>${watch.map(g => row(g, `<a class="btn small" href="#/game/${g.id}">${tx('Watch')}</a>`)).join('')}</div>` : ''}
      </div>`;
    const reVp = () => { if (!newGame.vpTouched) newGame.vpTarget = defaultVp(); };
    el.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
      const k = b.dataset.exp;
      if (k === 'none') { newGame.mode = 'classic'; newGame.expansion = 'none'; }
      else if (k === 'knights') newGame.mode = newGame.mode === 'knights' ? 'classic' : 'knights';
      else newGame.expansion = newGame.expansion === k ? 'none' : k;
      reVp(); sfx.click(); draw(false);
    });
    // how to play: the "?" on a tile opens that mode, the button opens the mode picked right now
    el.querySelectorAll('[data-tut]').forEach(x => {
      const go = e => { e.stopPropagation(); e.preventDefault(); sfx.click(); openTutorial(x.dataset.tut); };
      x.onclick = go; x.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') go(e); };
    });
    el.querySelector('[data-tut-open]').onclick = () => { sfx.click(); openTutorial(newGame.expansion !== 'none' ? newGame.expansion : newGame.mode === 'knights' ? 'knights' : newGame.big ? 'big' : 'classic'); };
    el.querySelectorAll('[data-sw]').forEach(b => {
      const flip = () => { newGame[b.dataset.sw] = !newGame[b.dataset.sw]; sfx.click(); draw(false); };
      b.onclick = flip; b.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    });
    el.querySelectorAll('[data-scen]').forEach(b => b.onclick = () => { newGame.scenario = b.dataset.scen; reVp(); sfx.click(); draw(false); });
    el.querySelectorAll('[data-var]').forEach(b => b.onclick = () => { newGame.variants[b.dataset.var] = !newGame.variants[b.dataset.var]; sfx.click(); draw(false); });
    el.querySelectorAll('[data-mis]').forEach(b => b.onclick = () => { const m = b.dataset.mis; newGame.missions = newGame.missions.includes(m) ? newGame.missions.filter(x => x !== m) : [...newGame.missions, m]; if (!newGame.missions.length) newGame.missions = [m]; sfx.click(); draw(false); });
    el.querySelectorAll('[data-np]').forEach(b => b.onclick = () => {
      const was = newGame.maxPlayers;
      newGame.maxPlayers = Math.max(2, Math.min(6, was + +b.dataset.np));
      if (was <= 4 && newGame.maxPlayers > 4) newGame.big = true;
      sfx.click(); draw(false);
    });
    el.querySelectorAll('[data-vp]').forEach(b => b.onclick = () => { newGame.vpTarget = Math.max(5, Math.min(20, newGame.vpTarget + +b.dataset.vp)); newGame.vpTouched = true; sfx.click(); draw(false); });
    el.querySelector('#create').onclick = async () => {
      try { const { vpTouched, ...body } = newGame; await api('/games', { body }); sfx.place(); toast(t('Game created. Pick your color and invite your friends.')); } catch (e) { toast(e.message, 'warn'); }
    };
    const post = (sel, verb, after) => el.querySelectorAll(`[data-${sel}]`).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api(`/games/${b.dataset[sel]}/${verb}`, { body: {} }); after && after(b.dataset[sel]); } catch (e) { toast(e.message, 'warn'); b.disabled = false; }
    });
    post('join', 'join', () => sfx.place()); post('leave', 'leave');
    post('start', 'start', id => { location.hash = `#/game/${id}`; });
    el.querySelectorAll('[data-gcolor]').forEach(b => b.onclick = async () => {
      try { await api(`/games/${b.dataset.game}/color`, { body: { color: b.dataset.gcolor } }); sfx.click(); draw(); } catch (e) { sfx.error(); toast(e.message, 'warn'); }
    });
    el.querySelectorAll('[data-share]').forEach(b => b.onclick = () => {
      const link = `${location.origin}${location.pathname}#/join/${b.dataset.share}`;
      navigator.clipboard?.writeText(link).then(() => toast(t('Invite link copied.')), () => toast(link));
    });
  };
  await draw();
  let known = null;
  const off = onWs(async msg => {
    if (msg.t !== 'lobby') return;
    draw();
    try {
      const L = await api('/lobby');
      const running = L.playing.filter(g => L.mine.includes(g.id)).map(g => g.id);
      if (known) { const fresh = running.find(id => !known.includes(id)); if (fresh) location.hash = `#/game/${fresh}`; }
      known = running;
    } catch { /* ignore */ }
  });
  api('/lobby').then(L => { known = L.playing.filter(g => L.mine.includes(g.id)).map(g => g.id); }).catch(() => {});
  cleanup = () => { off(); };
}

// ------------------------------------------------------------ profile
function renderProfile() {
  const u = session.user;
  app.innerHTML = `${topbar('profile')}<div class="page narrow"><h1 class="page-title">${flag(u.country, 'lg')} ${tx('Profile')}</h1>
    <div class="card">
      <label class="field"><span>${tx('Display name')}</span><input class="input" id="pname" value="${esc(u.name)}" maxlength="24"></label>
      <div class="field"><span>${tx('Favorite color (used in games when it is free, and on the stats page)')}</span>
        <div class="swatches">${COLOR_KEYS.map(c => `<button class="swatch ${u.color === c ? 'on' : ''}" data-color="${c}" title="${esc(colorName(c))}" style="--c:${PCOLOR[c]};--d:${PCOLOR_DARK[c]};--ink:${inkOn(c)}">${u.color === c ? '<span>✓</span>' : ''}</button>`).join('')}</div></div>
      <label class="field"><span>${tx('Country')}</span>${countrySelect('pcountry', u.country || guessCountry())}</label>
      <div class="field"><span>${tx('Language')}</span><button class="btn small" data-lang-pick>${esc(LANGS.find(l => l[0] === lang())[1])}</button></div>
      <button class="btn primary" id="psave">${tx('Save')}</button>
      <p class="muted" style="font-size:13px;margin:10px 0 0">${tx('Signed in as {email}', { email: u.email })}${u.admin ? ` · ${tx('admin')}` : ''}</p>
    </div>
    <div class="card"><h3>${tx('Change password')}</h3>
      <label class="field"><span>${tx('Current password')}</span><input class="input" type="password" id="pw0" autocomplete="current-password"></label>
      <label class="field"><span>${tx('New password')}</span><input class="input" type="password" id="pw1" minlength="6" autocomplete="new-password"></label>
      <button class="btn" id="pwsave">${tx('Change password')}</button>
    </div>
    <div class="card"><div class="row"><div class="spacer">${tx('Done for today?')}</div><button class="btn dark" id="logout">${tx('Log out')}</button></div></div>
    ${footer()}</div>`;
  let color = u.color;
  app.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    color = b.dataset.color; sfx.click();
    app.querySelectorAll('[data-color]').forEach(x => { x.classList.toggle('on', x === b); x.innerHTML = x === b ? '<span>✓</span>' : ''; });
  });
  app.querySelector('#psave').onclick = async () => {
    try { const r = await api('/me', { method: 'PATCH', body: { name: app.querySelector('#pname').value, color, country: app.querySelector('#pcountry').value || undefined } }); session.user = r.user; toast(t('Saved.')); renderProfile(); } catch (e) { toast(e.message, 'warn'); }
  };
  app.querySelector('#pwsave').onclick = async () => {
    try { await api('/me', { method: 'PATCH', body: { password: app.querySelector('#pw0').value, newPassword: app.querySelector('#pw1').value } }); toast(t('Password changed.')); } catch (e) { toast(e.message, 'warn'); }
  };
  app.querySelector('#logout').onclick = async () => { await api('/logout', { body: {} }).catch(() => {}); session.user = null; wsClose(); location.hash = '#/'; route(); };
}

// ------------------------------------------------------------ router
async function route(keepScroll) {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  unmountGame();
  if (keepScroll !== true) window.scrollTo(0, 0);
  const h = location.hash.replace(/^#/, '') || '/';
  if (!session.user) {
    if (h.startsWith('/join/')) { try { sessionStorage.setItem('broch_join', h.split('/')[2]); } catch { /* storage blocked */ } }
    return renderAuth();
  }
  let pendingJoin = null;
  try { pendingJoin = sessionStorage.getItem('broch_join'); } catch { /* storage blocked */ }
  if (pendingJoin) { try { sessionStorage.removeItem('broch_join'); } catch { /* ignore */ } location.hash = `#/join/${pendingJoin}`; return; }
  let m;
  try {
    if ((m = h.match(/^\/join\/([\w-]+)/))) {
      try { await api(`/games/${m[1]}/join`, { body: {} }); toast(t('You joined the game.')); } catch (e) { toast(e.message, 'warn'); }
      location.hash = '#/'; return;
    }
    if ((m = h.match(/^\/game\/([\w-]+)/))) { cleanup = mountGame(app, m[1]); return; }
    if (h.startsWith('/stats')) { cleanup = await mountStats(app); return; }
    if (h.startsWith('/profile')) return renderProfile();
    await renderLobby();
  } catch (e) {
    if (!e.handled) throw e;
    toast(e.message, 'warn');
  }
}

window.addEventListener('hashchange', () => route());

(async () => {
  await setLang(guessLang()).catch(() => {});
  try {
    session.config = await api('/config');
    setFeedbackUrl(session.config.feedbackUrl);
    const { user } = await api('/me');
    session.user = user;
    if (user && user.lang && user.lang !== lang()) await setLang(user.lang);
  } catch (e) {
    reportProblem('Could not load Broch', e.message);
  }
  if (session.user) wsConnect();
  onWs(msg => { if (msg.t === 'abandoned' && location.hash.startsWith('#/game/')) { toast(t('The host closed this game.'), 'warn'); location.hash = '#/'; } });
  route();
})();

export { modal };
