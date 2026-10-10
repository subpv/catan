import { api, esc, toast, logoSvg, houseIcon, PCOLOR, PCOLOR_DARK, COLOR_KEYS, colorName, setFeedbackUrl, getFeedbackUrl, wsConnect, onWs, wsClose, reportProblem, modal, t, inkOn } from './core/core.js';
import { LANGS, setLang, guessLang, lang } from './core/i18n.js';
import { mountGame, unmountGame } from './games/classic/screen.js';
import { mountSGame, unmountSGame } from './games/sgame.js';
import { GAMES, isStandalone } from './games/registry.js';
// the games register their tutorial chapters; the tabs of "How to play" follow this order
import './games/classic/tutorial.js';
import './games/knights/tutorial.js';
import './games/seafarers/tutorial.js';
import './games/traders-barbarians/tutorial.js';
import './games/classic/tutorial-big.js';
import './games/energies/plugin.js';
import './games/energies/tutorial.js';
import './games/humankind/plugin.js';
import './games/humankind/tutorial.js';
import './games/energies/threats.js';
import './games/inkas/plugin.js';
import './games/inkas/tutorial.js';
import './games/explorers-pirates/plugin.js';
import './games/explorers-pirates/tutorial.js';
import { mountStats } from './core/stats.js';
import { isMuted, setMuted, sfx } from './core/fx.js';
import { flag, countrySelect, guessCountry } from './core/countries.js';
import { openTutorial } from './core/tutorial.js';
import { SCEN, SCEN_KEYS } from './games/seafarers/scen.js';
import { watchViewport, onPhoneChange, isPhone } from './core/phone.js';

watchViewport(); // --m-vvh / --m-kb / html.kb-open for the phone layout

const app = document.getElementById('app');
export const session = { user: null, config: {} };
let cleanup = null;
const tx = (k, p) => esc(t(k, p));
const DEMO = !!window.BROCH_PUBLIC_DEMO; // the public demo at /demo (demo/public-prelude.js): no account, no friends, one click to play against bots

const SPEAKER = on => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/>${on ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;

// inline icons of the phone tab bar and the in-game bar (hidden on the desktop by css)
const ICO = (body, cls) => `<svg class="${cls}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const NV_ICON = {
  play: ICO('<path d="M12 2.8l7.8 4.5v9.4L12 21.2l-7.8-4.5V7.3z"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>', 'nv-i'),
  stats: ICO('<path d="M5 20V11M12 20V4M19 20v-6"/>', 'nv-i'),
  profile: ICO('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.5c.8-3.8 3.7-5.8 7.2-5.8s6.4 2 7.2 5.8"/>', 'nv-i'),
};
const LEAVE_ICON = ICO('<path d="M9.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3.5"/><path d="M15 7.5l4.5 4.5L15 16.5M19.5 12H9.5"/>', 'lv-i');

function topbar(active) {
  const inGame = location.hash.startsWith('#/game/');
  const link = (href, key, label) => `<a href="${href}" class="${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${NV_ICON[key]}<span class="nv-l">${label}</span></a>`;
  return `<header class="topbar${inGame ? ' in-game' : ''}">
    <a class="brand" href="#/">${logoSvg()}<span class="wm">BROCH</span></a>
    <nav class="nav">
      <span class="nav-links">${link('#/', 'play', tx('Play'))}${link('#/stats', 'stats', tx('Stats'))}${link('#/profile', 'profile', esc(session.user?.name || t('Profile')))}</span>
      <span class="nav-acts">${inGame ? `<button class="iconbtn" data-leavegame title="${tx('Leave this game')}" aria-label="${tx('Leave this game')}"><span class="lv-g">⎋</span>${LEAVE_ICON}</button>` : ''}
      <button class="iconbtn" data-lang-pick title="${tx('Language')}" aria-label="${tx('Language')}">${lang().toUpperCase()}</button>
      <button class="iconbtn" data-mute aria-pressed="${!isMuted()}" title="${isMuted() ? tx('Sound off') : tx('Sound on')}" aria-label="${isMuted() ? tx('Sound off') : tx('Sound on')}">${SPEAKER(!isMuted())}</button></span>
    </nav>
  </header>`;
}
const footer = () => `<div class="footer">${getFeedbackUrl() ? `${tx('Something not working, or have an idea?')} <a href="${esc(getFeedbackUrl())}" target="_blank" rel="noopener">${tx('Send feedback')}</a>` : ''}${window.BROCH_BUILD ? `<span class="build"> · <span title="Build">${esc(window.BROCH_BUILD)}</span></span>` : ''}</div>`;
export { topbar, footer };

// topbar buttons work on every page (the game menu on phones carries the same data-attributes)
// a sound button is either the plain icon button of the top bar or a labelled one (.mute-ic + .mute-lbl) in a menu
function paintMute(b) {
  const on = !isMuted(), label = on ? t('Sound on') : t('Sound off');
  const ic = b.querySelector('.mute-ic'), lb = b.querySelector('.mute-lbl');
  if (ic || lb) { if (ic) ic.innerHTML = SPEAKER(on); if (lb) lb.textContent = label; } else b.innerHTML = SPEAKER(on);
  b.title = label; b.setAttribute('aria-pressed', String(on));
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-lang-pick]')) return langDialog();
  if (e.target.closest('[data-leavegame]')) return leaveDialog(location.hash.split('/')[2]);
  const m = e.target.closest('[data-mute]');
  if (m) { setMuted(!isMuted()); document.querySelectorAll('[data-mute]').forEach(paintMute); if (!isMuted()) sfx.turn(); }
});

function leaveDialog(id) {
  modal(`<h2>${tx('Leave this game')}</h2><p class="muted">${tx(DEMO ? 'Leave this demo game and go back to the lobby.' : 'Resign: a bot takes over your seat and the game goes on without statistics.')}</p>
    <div class="foot"><button class="btn m-main" data-close>${tx('Keep playing')}</button><button class="btn" data-do="resign">${tx('Resign')}</button>${DEMO ? '' : `<button class="btn danger" data-do="abandon" data-arm title="${tx('Close the game for everyone (host only)')}">${tx('Close game')}</button>`}</div>
    ${DEMO ? '' : `<p class="muted" style="font-size:12px;margin:8px 0 0">${tx('Close the game for everyone (host only)')}</p>`}`, {
    onMount(el, close) {
      el.querySelectorAll('[data-do]').forEach(b => {
        const label = b.textContent;
        let timer = 0;
        b.onclick = async () => {
          // closing the game for everybody needs a second tap within 3 seconds
          if (b.hasAttribute('data-arm') && !b.dataset.armed) {
            b.dataset.armed = '1'; b.textContent = t('Tap again to confirm');
            timer = setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = label; } }, 3000);
            return;
          }
          clearTimeout(timer);
          b.disabled = true;
          try { await api(`/games/${id}/${b.dataset.do}`, { body: {} }); close(); if (b.dataset.do === 'resign') toast(t(DEMO ? 'You left the demo game.' : 'You left the game. A bot plays on for you.')); location.hash = '#/'; } catch (err) { toast(err.message, 'warn'); b.disabled = false; delete b.dataset.armed; b.textContent = label; }
        };
      });
    },
  });
}

function langDialog() {
  modal(`<h2>${tx('Language')}</h2><div class="lang-grid">${LANGS.map(([c, n]) => `<button class="chip ${c === lang() ? 'on' : ''}" data-l="${c}">${esc(n)}</button>`).join('')}</div>
    <div class="foot"><button class="btn m-main" data-close>${tx('Close')}</button></div>`, {
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
const EYE = off => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${off ? '<path d="M4 4l16 16"/>' : ''}</svg>`;
// landing page for visitors without a session: what the app offers, the no-account demo, then the sign-in form
const LP_ICO = d => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const LP_FEATURES = [
  [LP_ICO('<path d="M8 3.5l4 2.3v4.6L8 12.7 4 10.4V5.8zM16 3.5l4 2.3v4.6l-4 2.3-4-2.3V5.8zM12 11.8l4 2.3v4.6l-4 2.3-4-2.3v-4.6z"/>'), '8 ways to play', 'Classic, Cities & Knights, Seafarers, Traders & Barbarians, Explorers & Pirates and three more.'],
  [LP_ICO('<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.4"/><path d="M2.8 19c.5-3.4 2.8-5 5.7-5s5.2 1.6 5.7 5M15 14.3c3 0 5 1.4 5.5 4.3"/>'), 'Play together live', 'In real time with your friends, on any phone, tablet or computer.'],
  [LP_ICO('<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4.5M9 13h.01M15 13h.01M9.5 16h5M3 12v2M21 12v2"/><circle cx="12" cy="4" r="1"/>'), 'Bots included', 'Practise against bots, or let them fill the empty seats.'],
  [LP_ICO('<path d="M4 8h13M13.5 4.5L17 8l-3.5 3.5M20 16H7M10.5 12.5L7 16l3.5 3.5"/>'), 'Trade with friends', 'Offer, counter-offer and bargain with every player, or trade with the bank.'],
];
function renderAuth(mode = 'login', opts = {}) {
  document.body.dataset.route = 'auth';
  const reg = mode === 'register';
  app.innerHTML = `<div class="page landing${opts.focus ? ' lp-arrived' : ''}">
    <div class="row lp-lang"><button class="iconbtn" data-lang-pick>${esc(LANGS.find(l => l[0] === lang())[1])}</button></div>
    <div class="lp-grid">
    <section class="lp-hero">
      <div class="lp-brand">${logoSvg('logo-big')}<h1>Broch</h1></div>
      <p class="lp-promise">${tx('Settle, trade and build with your friends.')}</p>
      <a class="lp-shot" href="/demo/" tabindex="-1"><img src="/landing-board.png" width="504" height="496" alt="${esc(tx('A Broch game board with hexagon tiles, roads, settlements and harbors'))}" decoding="async"></a>
      <ul class="lp-feats">${LP_FEATURES.map(([ico, h, p]) => `<li>${ico}<span><b>${tx(h)}</b><small>${tx(p, { n: LANGS.length })}</small></span></li>`).join('')}</ul>
      <div class="lp-cta">
        <a class="btn gold block lp-try" href="/demo/">${tx('Try it now (no account)')}</a>
        <p class="lp-note">${tx('Plays right in your browser against bots. Nothing is saved.')}</p>
      </div>
    </section>
    <div class="card lp-form" id="lp-form">
      <div class="tabs2"><button data-m="login" class="${reg ? '' : 'on'}">${tx('Log in')}</button><button data-m="register" class="${reg ? 'on' : ''}">${tx('Create account')}</button></div>
      <form id="authf">
        ${reg ? `<label class="field"><span>${tx('Display name')}</span><input class="input" name="name" id="f-name" maxlength="24" autocomplete="nickname" required></label>` : ''}
        ${reg ? `<label class="field"><span>${tx('Country')}</span>${countrySelect('f-country', 'DE')}</label>` : ''}
        <label class="field"><span>${tx('Email')}</span><input class="input" name="email" id="f-email" type="email" autocomplete="email" required></label>
        <label class="field pw-field"><span>${tx('Password')}</span><input class="input" name="password" id="f-pw" type="password" minlength="8" autocomplete="${reg ? 'new-password' : 'current-password'}" required><button type="button" class="pw-eye" data-eye aria-pressed="false" title="${tx('Show password')}" aria-label="${tx('Show password')}">${EYE(false)}</button></label>
        ${reg && session.config.needsCode && !session.config.firstUser ? `<label class="field"><span>${tx('Invite code (ask whoever runs this server)')}</span><input class="input" name="code" id="f-code" required></label>` : ''}
        ${reg && session.config.firstUser ? `<p class="muted" style="font-size:13px">${tx("You're the first player, so this account becomes the admin.")}</p>` : ''}
        <button class="btn primary block" style="margin-top:6px">${reg ? tx('Create account') : tx('Log in')}</button>
        <div class="err-text" id="autherr"></div>
      </form>
    </div>
    </div>
    ${footer()}
  </div>`;
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  if (opts.focus) { const form = app.querySelector('#lp-form'); form.scrollIntoView({ block: 'start', behavior: 'smooth' }); app.querySelector(reg ? '#f-name' : '#f-email').focus({ preventScroll: true }); }
  app.querySelector('[data-eye]').onclick = e => {
    const b = e.currentTarget, pw = app.querySelector('#f-pw'), show = pw.type === 'password';
    pw.type = show ? 'text' : 'password'; b.innerHTML = EYE(show); b.setAttribute('aria-pressed', String(show));
    b.title = b.ariaLabel = show ? t('Hide password') : t('Show password');
    pw.focus();
  };
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
const newGame = { mode: 'classic', expansion: 'none', scenario: 'shores', variants: { fishermen: true, rivers: false, caravans: false, barbarians: false, traders: false, events: false, friendly: false, harbors: false }, escen: 2, big: false, variable: false, robberReturn: false, startBoth: false, knightsFree: true, vpAtOnce: false, expBuildAnytime: false, expExtraStart: false, gameOptions: {}, maxPlayers: 4, vpTarget: 10, vpTouched: false };
let ngOpen = null; // phones: is the new-game form unfolded? null = decide by whether the user has games
const grpOpen = { house: false, exp: false }; // phones: unfolded switch groups
const minPlayersOf = mode => (isStandalone(mode) && GAMES[mode].minPlayers) || 2;
const BIG3 = ['caravans', 'barbarians', 'traders'];
const NO56 = []; // every big scenario now has a 5–6 player layout
const big3On = () => newGame.expansion === 'traders' && BIG3.some(k => newGame.variants[k]);
const bigScenario = () => newGame.expansion === 'traders' && NO56.some(k => newGame.variants[k]);
const tradersVp = v => (v.traders ? 13 : v.caravans || v.barbarians ? 12 : 10) + (v.harbors ? 1 : 0);
const EUP_VP = { 1: 8, 2: 12, 3: 15, 4: 15, 5: 17 };
const EUP_DESC = { 1: 'Learn the basics: discover the fog with ships, found settlements with explorers and upgrade them to harbor settlements. First to 8 points.', 2: 'Free setup. Units conquer the pirate lairs on the gold rivers. First to 12 points.', 3: 'Catch fish swarms and bring them to the base of the council. First to 15 points.', 4: 'Fish and spice: befriend the villages of the spice islands. First to 15 points.', 5: 'All three missions at once. First to 17 points.' };
const EUP_LABEL = { 1: 'Land in Sight', 2: 'The Pirate Lairs', 3: 'Fish for Broch', 4: 'Spices for Broch', 5: 'Explorers & Pirates' };
const defaultVp = () => (newGame.mode === 'explorers' ? EUP_VP[newGame.escen] : isStandalone(newGame.mode) ? GAMES[newGame.mode].vp : newGame.mode === 'knights' ? (newGame.expansion === 'seafarers' ? SCEN[newGame.scenario].vp + 2 : 13) + (newGame.expansion === 'traders' && newGame.variants.harbors ? 1 : 0) : newGame.expansion === 'seafarers' ? SCEN[newGame.scenario].vp : newGame.expansion === 'traders' ? tradersVp(newGame.variants) : 10);
const EXP_LABEL = { seafarers: 'Seafarers', traders: 'Traders & Barbarians' };
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
    ${session.user.country || DEMO ? '' : `<div class="card country-nudge" id="cnudge"><span class="spacer">${tx('Where are you from? Your flag is shown next to your name.')}</span>${countrySelect('nudge-country', guessCountry())}<button class="btn primary small" id="cnsave">${tx('Save')}</button></div>`}
    <div id="lobby" class="grid2"></div>${footer()}</div>`;
  document.body.dataset.route = 'lobby';
  app.querySelector('#cnsave')?.addEventListener('click', async () => {
    const c = app.querySelector('#nudge-country').value;
    if (!c) return;
    try { const r = await api('/me', { method: 'PATCH', body: { country: c } }); session.user = r.user; app.querySelector('#cnudge').remove(); toast(t('Saved.')); } catch (e) { toast(e.message, 'warn'); }
  });
  const help = (id, name) => `<span class="tile-help" data-tut="${id}" role="button" tabindex="0" title="${tx('How to play: {mode}', { mode: t(name) })}" aria-label="${tx('How to play: {mode}', { mode: t(name) })}">?</span>`;
  const sw = (key, title, desc) => `<label class="switch ${newGame[key] ? 'on' : ''}" data-sw="${key}" role="switch" aria-checked="${!!newGame[key]}" tabindex="0"><span class="tr"><i></i></span><span class="tx"><b>${title}</b><small>${desc}</small></span></label>`;
  const subOpts = () => {
    const chip = (on, attr, label, hint) => `<button class="chip ${on ? 'on' : ''}" ${attr} aria-pressed="${on}" ${hint ? `title="${esc(t(hint))}"` : ''}>${esc(t(label))}</button>`;
    if (newGame.expansion === 'seafarers') { const sc = SCEN[newGame.scenario]; return `<div class="muted sub-h">${tx('Scenario')}</div><div class="chips">${SCEN_KEYS.map(k => chip(newGame.scenario === k, `data-scen="${k}"`, SCEN[k].label)).join('')}</div><div class="muted" style="font-size:13px;margin-top:8px">${tx(sc.blurb)} ${tx('Win with {n} points.', { n: newGame.mode === 'knights' ? sc.vp + 2 : sc.vp })}</div>${sc.variable ? `<div class="chips" style="margin-top:8px">${chip(newGame.variable, 'data-vsetup', 'Variable setup', 'Deal the tiles, numbers and harbours again inside the printed outlines, as the rulebook allows.')}</div>` : ''}`; }
    if (newGame.expansion === 'traders') {
      const V = newGame.variants;
      const scen = [['fishermen', 'Fishermen of Broch', 'Fishing grounds, fish tokens and the old boot.'], ['rivers', 'Rivers of Broch', 'Bridges, gold, and the richest and poorest player.'], ['caravans', 'Merchant Trains', 'Nomads send trade wagons out; vote with wool and grain. 3–6 players.'], ['barbarians', 'Barbarian Attack', 'Barbarians land on the coast; knights drive them off. 3–6 players.'], ['traders', 'Traders & Barbarians', 'Haul glass, marble, sand and tools with your wagon. 3–6 players.']];
      return `<div class="muted sub-h">${tx('Scenario')}</div><div class="chips">${scen.map(([k, l, h]) => chip(V[k], `data-scn="${k}"`, l, h)).join('')}</div>
        <div class="muted sub-h">${tx('Variants')}</div><div class="chips">${chip(V.events, 'data-var="events"', 'Event cards', 'A deck of event cards replaces the dice.')}${chip(V.friendly, 'data-var="friendly"', 'Friendly robber', 'The robber spares players with 2 points or fewer.')}${chip(V.harbors, 'data-var="harbors"', 'Harbors of Broch', 'Settlements and cities at harbors earn harbor points; the Strongest Ports tile is worth 2 points.')}</div>`;
    }
    if (newGame.mode === 'explorers') return `<div class="muted sub-h">${tx('Scenario')}</div><div class="chips">${[1, 2, 3, 4, 5].filter(k => k > 1 || newGame.maxPlayers <= 4).map(k => `<button class="chip ${newGame.escen === k ? 'on' : ''}" data-escen="${k}" aria-pressed="${newGame.escen === k}">${k}. ${esc(t(EUP_LABEL[k]))}</button>`).join('')}</div><div class="muted" style="font-size:13px;margin-top:6px">${tx(EUP_DESC[newGame.escen])}</div>`;
    if (isStandalone(newGame.mode)) return `<div class="muted sub-h">${tx(GAMES[newGame.mode].name)}</div><div class="muted" style="font-size:13px">${tx(GAMES[newGame.mode].blurb)}</div>${(GAMES[newGame.mode].lobbyOptions || []).map(o => `<label class="switch ${newGame.gameOptions[o.key] ? 'on' : ''}" data-gopt="${o.key}" role="switch" aria-checked="${!!newGame.gameOptions[o.key]}" tabindex="0"><span class="tr"><i></i></span><span class="tx"><b>${tx(o.label)}</b><small>${tx(o.hint)}</small></span></label>`).join('')}`;
    if (newGame.mode === 'knights') return `<div class="muted sub-h">${tx('Cities & Knights')}</div><div class="muted" style="font-size:13px">${tx('Commodities, city improvements, knights and barbarian raids.')}</div>`;
    return `<div class="muted sub-h">${tx('Pick an expansion to see its options.')}</div>`;
  };
  let lastL = null;
  // toggles only redraw from the last lobby snapshot; the server is asked again only when something changed there
  const draw = async (refetch = true) => {
    let L = lastL;
    if (refetch || !L) {
      try { L = lastL = await api('/lobby'); } catch (e) {
        toast(e.message, 'warn');
        const box = document.getElementById('lobby');
        if (box && !lastL) { box.innerHTML = `<div class="card load-fail"><p class="muted">${tx('Could not load this page.')}</p><button class="btn" data-retry>${tx('Try again')}</button></div>`; box.querySelector('[data-retry]').onclick = () => draw(); }
        return;
      }
    }
    const el = document.getElementById('lobby');
    if (!el) return;
    const me = session.user.id;
    const mineOpen = L.open.filter(g => L.mine.includes(g.id));
    const mineRunning = L.playing.filter(g => L.mine.includes(g.id));
    const others = L.open.filter(g => !L.mine.includes(g.id));
    const watch = L.playing.filter(g => !L.mine.includes(g.id));
    const seats = g => `<span class="seatdots">${g.seats.map(s => houseIcon(s.color, 14)).join('')}</span>`;
    const modeBadge = g => {
      if (isStandalone(g.mode)) return `<span class="badge x">${tx(GAMES[g.mode].name)}${g.mode === 'explorers' && g.scenario ? ` · ${esc(g.scenario)}` : ''}${g.mode === 'explorers' || GAMES[g.mode].beta ? ' · Beta' : ''}</span>`;
      const hasExp = g.expansion && g.expansion !== 'none';
      return `${g.mode === 'knights' ? `<span class="badge k">${tx('Cities & Knights')}</span>` : hasExp ? '' : `<span class="badge">${tx('Classic')}</span>`}${hasExp ? `<span class="badge x">${tx(EXP_LABEL[g.expansion])} · Beta</span>` : ''}${g.expansion === 'seafarers' && SCEN[g.scenario] ? `<span class="badge">${tx(SCEN[g.scenario].label)}</span>` : ''}${g.big ? `<span class="badge">${tx('5–6')}</span>` : ''}${g.robberReturn || g.startBoth || g.knightsFree ? `<span class="badge h" title="${esc([g.robberReturn ? t('House rule: forgotten robber') : '', g.startBoth ? t('House rule: starting resources for both') : '', g.knightsFree ? t('House rule: knights without a limit') : ''].filter(Boolean).join(' · '))}">${tx('House rules')}</span>` : ''}`;
    };
    const sub = g => `${seats(g)} <span class="names">${g.seats.map(s => `${flag(s.country)} ${esc(s.name)}`).join(', ')}</span><span class="nsep"> · </span><span class="meta">${g.seats.length}/${g.maxPlayers} · ${tx('{n} points', { n: g.vpTarget })}${g.status === 'playing' ? ` · ${tx('turn {n}', { n: g.turn })}` : ''}</span>`;
    const gname = g => {
      if (g.name && !g.name.endsWith("'s game")) return esc(g.name);
      const host = g.seats.find(s => s.id === g.host);
      return esc(t("{name}'s game", { name: host ? host.name : g.name.slice(0, -7) }));
    };
    const row = (g, btns, kind = 'mine') => `<div class="game-row r-${kind}${kind === 'mine' && g.current === me ? ' my-turn' : ''}"><div class="info"><div class="title"><span class="gn">${gname(g)}</span> <span class="badges">${modeBadge(g)}</span></div><div class="sub">${sub(g)}</div></div>${btns}</div>`;
    // phones: the new-game form folds into one summary line once the user has games
    const hasGames = mineRunning.length + mineOpen.length > 0;
    const open = DEMO || (ngOpen ?? !hasGames);
    const ph = isPhone();
    const modeName = () => {
      const m = newGame.mode, x = newGame.expansion;
      const base = m === 'explorers' ? t('Explorers & Pirates') : isStandalone(m) ? t(GAMES[m].name) : m === 'knights' ? t('Cities & Knights') : x !== 'none' ? t(EXP_LABEL[x]) : t('Classic');
      return `${base}${m === 'knights' && x !== 'none' ? ` + ${t(EXP_LABEL[x])}` : ''}${newGame.big && !isStandalone(m) && m !== 'explorers' ? ` ${t('5–6')}` : ''}`;
    };
    const grpHead = (g, label, keys) => {
      const n = keys.filter(k => newGame[k]).length;
      return `<div class="muted house-h" data-grp="${g}" data-n="${n}" ${n ? `data-cnt="${esc(t('{n} on', { n }))}"` : ''} ${ph ? `role="button" tabindex="0" aria-expanded="${!!grpOpen[g]}"` : ''}>${label}</div>`;
    };
    el.innerHTML = `
      <div class="lob-col">
        ${DEMO ? `<div class="card demo-hero"><h2>${tx('Ready to try it?')}</h2><p>${tx('Start right away against computer players, or pick another game below.')}</p>
          <button class="btn primary block" id="qs-play">${tx('Play now')}</button>
          <small class="muted">${tx('{mode} · {players} players · {points} points', { mode: modeName(), players: newGame.maxPlayers, points: newGame.vpTarget })}</small></div>` : ''}
        <div class="card ng-card${open ? '' : ' ng-collapsed'}">
          <div class="ng-head"><h2>${tx(DEMO ? 'Pick another game' : 'New game')}</h2><button class="btn small howto" data-tut-open>▶ ${tx('How to play')}</button><button class="ng-fold" data-ng-fold title="${tx('Close')}" aria-label="${tx('Close')}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button></div>
          <div class="ng-sum"><span class="ng-sum-t">${tx('{mode} · {players} players · {points} points', { mode: modeName(), players: newGame.maxPlayers, points: newGame.vpTarget })}</span><button class="btn" data-ng-open>${tx('Change')}</button></div>
          <div class="ng-body">
          <div class="field"><span class="muted" style="font-size:13px">${tx('Version')}</span>
            <div class="mode-pick one">
              <button class="mode-tile ${newGame.mode === 'classic' && newGame.expansion === 'none' ? 'on' : ''}" data-exp="none" aria-pressed="${newGame.mode === 'classic' && newGame.expansion === 'none'}"><b>${tx('Classic')}</b><small>${tx('Settle, trade, build. Development cards, Longest Road, Largest Army.')}</small>${help('classic', 'Classic')}</button>
            </div>
          </div>
          <div class="field"><span class="muted" style="font-size:13px">${tx('Expansion')}</span>
            <div class="mode-pick four">
              <button class="mode-tile ${newGame.expansion === 'seafarers' ? 'on' : ''}" data-exp="seafarers" aria-pressed="${newGame.expansion === 'seafarers'}"><b>${tx('Seafarers')}</b><small>${tx('Ships and island exploration.')}</small>${help('seafarers', 'Seafarers')}<i class="beta-tag">Beta</i></button>
              <button class="mode-tile ${newGame.mode === 'knights' ? 'on' : ''}" data-exp="knights" aria-pressed="${newGame.mode === 'knights'}"><b>${tx('Cities & Knights')}</b><small>${tx('Commodities, city improvements, knights and barbarian raids.')}</small>${help('knights', 'Cities & Knights')}</button>
              <button class="mode-tile ${newGame.expansion === 'traders' ? 'on' : ''}" data-exp="traders" aria-pressed="${newGame.expansion === 'traders'}"><b>${tx('Traders & Barbarians')}</b><small>${tx('Fishermen, rivers, merchant trains, barbarians, event cards and more.')}</small>${help('traders', 'Traders & Barbarians')}<i class="beta-tag">Beta</i></button>
              <button class="mode-tile ${newGame.mode === 'explorers' ? 'on' : ''}" data-exp="explorers" aria-pressed="${newGame.mode === 'explorers'}"><b>${tx('Explorers & Pirates')}</b><small>${tx('Missions across the fog.')}</small>${help('explorers', 'Explorers & Pirates')}<i class="beta-tag">Beta</i></button>
            </div>
          </div>
          <div class="field"><span class="muted" style="font-size:13px">${tx('Standalone games')}</span>
            <div class="mode-pick sa">
              ${Object.values(GAMES).filter(g => !g.expansion).map(g => `<button class="mode-tile ${newGame.mode === g.id ? 'on' : ''}" data-game="${g.id}" aria-pressed="${newGame.mode === g.id}"><b>${tx(g.name)}</b><small>${tx(g.tagline)}</small>${help(g.tutorial, g.name)}${g.beta ? '<i class="beta-tag">Beta</i>' : ''}</button>`).join('')}
            </div>
          </div>
          <div class="sel-blurb"></div>
          <div class="sub-opts ${(isStandalone(newGame.mode) && (GAMES[newGame.mode].lobbyOptions || []).length) || newGame.expansion === 'seafarers' ? 'tall' : ''}">${subOpts()}</div>
          ${isStandalone(newGame.mode) ? '' : `${bigScenario() ? '' : sw('big', `${tx('5–6 player expansion')} ${help('big', '5–6 player expansion')}`, tx(newGame.variants.traders ? 'Larger island with 37 tiles and 7 commodity hexes. From 5 players on it is always used, and two players share every turn (stone 1 and stone 2).' : 'Larger board with 30 tiles. From 5 players on it is always used, and two players share every turn (stone 1 and stone 2).'))}
          ${grpHead('house', tx('House rules'), ['robberReturn', ...(newGame.mode === 'classic' ? ['knightsFree', 'vpAtOnce'] : []), 'startBoth'])}
          <div class="grp${grpOpen.house ? ' open' : ''}">
          ${sw('robberReturn', tx('House rule: forgotten robber'), tx('If a player ends their turn without moving the robber, it goes back to the desert.'))}
          ${newGame.mode === 'classic' ? sw('knightsFree', tx('House rule: knights without a limit'), tx('Knight cards can be played as often per turn as you like. The rulebook allows only one development card per turn.')) : ''}
          ${newGame.mode === 'classic' ? sw('vpAtOnce', tx('House rule: show victory point cards at once'), tx('A bought victory point card is revealed immediately and counts for everybody, instead of staying hidden until the win.')) : ''}
          ${sw('startBoth', tx('House rule: starting resources for both'), tx('The rulebook pays starting resources only for the second building of the setup phase. With this rule both pay. In Cities & Knights the city counts like a settlement.'))}
          </div>
          ${newGame.mode === 'classic' || newGame.mode === 'knights' ? `${grpHead('exp', tx('Experiments'), ['expBuildAnytime', ...(newGame.expansion === 'traders' ? [] : ['expExtraStart'])])}<div class="grp${grpOpen.exp ? ' open' : ''}">${sw('expBuildAnytime', tx('Experiment: build anytime'), tx('Once the dice are down, every player may build and buy development cards in any turn, not only in their own. In Cities & Knights this includes knights, walls and improvements.'))}${newGame.expansion === 'traders' ? '' : sw('expExtraStart', tx('Experiment: bigger start'), tx(newGame.mode === 'knights' ? 'Everybody starts with 1 settlement and 2 cities instead of 1 settlement and 1 city (a third setup round).' : 'Everybody starts with 2 settlements and 1 city instead of 2 settlements (a third setup round).'))}</div>` : ''}`}
          <div class="row wrap ng-steps" style="gap:18px">
            <div class="field"><span>${tx('Players')}</span><div class="stepper"><button data-np="-1" aria-label="${tx('Fewer')}">−</button><b id="np">${newGame.maxPlayers}</b><button data-np="1" aria-label="${tx('More')}">+</button></div></div>
            ${isStandalone(newGame.mode) && GAMES[newGame.mode].fixedVp ? '' : `<div class="field"><span>${tx('Points to win')}</span><div class="stepper"><button data-vp="-1" aria-label="${tx('Fewer')}">−</button><b id="vpt">${newGame.vpTarget}</b><button data-vp="1" aria-label="${tx('More')}">+</button></div></div>`}
          </div>
          <div class="m-sticky ng-create"><button class="btn primary block" id="create">${tx(DEMO ? 'Play now' : 'Create game')}</button></div>
          </div>
        </div>
      </div>
      <div class="lob-col">
        ${mineRunning.length ? `<div class="card mine-games"><h3>${tx('Your games')}</h3>${mineRunning.map(g => row(g, `${g.current === me ? `<span class="badge turn">${tx('Your turn')}</span>` : ''}<a class="btn small gold" href="#/game/${g.id}">${tx('Open')}</a>`)).join('')}</div>` : ''}
        ${mineOpen.map(g => `<div class="card waiting"><div class="row"><h3 class="spacer">${gname(g)} ${modeBadge(g)}</h3></div>
            <div class="seat-list">${g.seats.map(s => `<div class="seat">${houseIcon(s.color, 26)}<span>${s.bot ? '🤖' : flag(s.country)} ${esc(s.name)}${s.id === g.host ? ` <small class="muted">· ${tx('host')}</small>` : ''}${s.bot ? ` <small class="muted">· ${tx('bot')}</small>` : ''}</span>${s.bot && g.host === me ? `<button class="btn small" data-rmbot="${g.id}|${s.id}" title="${tx('Remove bot')}" aria-label="${tx('Remove bot')}">✕</button>` : ''}</div>`).join('')}
              ${Array.from({ length: g.maxPlayers - g.seats.length }, () => `<div class="seat empty-seat"><span class="ghost-house"></span><span class="muted">${tx('Free seat')}</span></div>`).join('')}</div>
            <div class="field"><span>${tx('Pick your color')}</span>${colorSwatches(g, me)}</div>
            ${g.host === me && g.seats.length < g.maxPlayers ? `<div class="row wrap wr-bots"><button class="btn small" data-addbot="${g.id}">🤖 ${tx('Add bot')}</button>${g.maxPlayers - g.seats.length > 1 ? `<button class="btn small" data-fillbots="${g.id}">${tx('Fill free seats with bots')}</button>` : ''}<span class="muted" style="font-size:12.5px">${tx('Computer players take empty seats. Games with bots do not count for the statistics.')}</span></div>` : ''}
            <div class="row wrap wr-foot">${g.host === me ? `<button class="btn primary" data-start="${g.id}" ${g.seats.length < minPlayersOf(g.mode) ? 'disabled' : ''}>${tx('Start game')}</button>` : `<span class="muted" style="font-size:13px">${tx('Waiting for the host to start…')}</span>`}
              <span class="spacer"></span>${DEMO ? '' : `<button class="btn small" data-share="${g.id}">${tx('Copy invite link')}</button>`}<button class="btn small" data-leave="${g.id}">${tx('Leave')}</button></div>
          </div>`).join('')}
        ${DEMO ? '' : `<div class="card open-games"><h3>${tx('Open games')}</h3>${others.length ? others.map(g => row(g, `<button class="btn small gold" data-join="${g.id}" ${g.seats.length >= g.maxPlayers ? 'disabled' : ''}>${tx('Join')}</button>`, 'open')).join('') : `<div class="empty">${tx('No open games. Create one and invite your friends.')}</div>`}</div>`}
        ${watch.length ? `<div class="card watch-games"><h3>${tx('Watch')}</h3>${watch.map(g => row(g, `<a class="btn small" href="#/game/${g.id}">${tx('Watch')}</a>`, 'watch')).join('')}</div>` : ''}
      </div>`;
    const reVp = () => { if (!newGame.vpTouched) newGame.vpTarget = defaultVp(); };
    // phones: the description of the picked mode is shown once under the tiles (the tiles themselves only carry the name)
    const blurb = el.querySelector('.sel-blurb');
    if (blurb && !isStandalone(newGame.mode)) blurb.textContent = [...el.querySelectorAll('.mode-tile.on small')].map(x => x.textContent.trim()).join(' ');
    el.querySelector('[data-ng-open]').onclick = () => { ngOpen = true; sfx.click(); draw(false); };
    el.querySelector('[data-ng-fold]').onclick = () => { ngOpen = false; sfx.click(); draw(false); };
    el.querySelectorAll('[data-grp]').forEach(h => {
      const flip = () => { if (!isPhone()) return; grpOpen[h.dataset.grp] = !grpOpen[h.dataset.grp]; sfx.click(); draw(false); };
      h.onclick = flip; h.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    });
    el.querySelectorAll('[data-game]').forEach(b => b.onclick = () => {
      newGame.mode = b.dataset.game; newGame.expansion = 'none'; newGame.big = false;
      newGame.maxPlayers = Math.max(minPlayersOf(newGame.mode), Math.min(newGame.maxPlayers, GAMES[newGame.mode].maxPlayers || 4)); newGame.gameOptions = {};
      reVp(); sfx.click(); draw(false);
    });
    el.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
      const k = b.dataset.exp;
      if (isStandalone(newGame.mode)) newGame.mode = 'classic';
      if (k === 'none') { newGame.mode = 'classic'; newGame.expansion = 'none'; }
      else if (k === 'knights') { newGame.mode = newGame.mode === 'knights' ? 'classic' : 'knights'; if (newGame.mode === 'knights' && big3On()) { BIG3.forEach(x => { newGame.variants[x] = false; }); newGame.variants.fishermen = true; } }
      else if (k === 'explorers') { newGame.mode = 'explorers'; newGame.expansion = 'none'; newGame.big = false; newGame.maxPlayers = Math.min(newGame.maxPlayers, GAMES.explorers.maxPlayers || 6); }
      else newGame.expansion = newGame.expansion === k ? 'none' : k;
      reVp(); sfx.click(); draw(false);
    });
    // how to play: the "?" on a tile opens that mode, the button opens the mode picked right now
    el.querySelectorAll('[data-tut]').forEach(x => {
      const go = e => { e.stopPropagation(); e.preventDefault(); sfx.click(); openTutorial(x.dataset.tut); };
      x.onclick = go; x.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') go(e); };
    });
    el.querySelector('[data-tut-open]').onclick = () => { sfx.click(); openTutorial(isStandalone(newGame.mode) ? GAMES[newGame.mode].tutorial : newGame.expansion !== 'none' ? newGame.expansion : newGame.mode === 'knights' ? 'knights' : newGame.big ? 'big' : 'classic'); };
    el.querySelectorAll('[data-sw]').forEach(b => {
      const flip = () => { newGame[b.dataset.sw] = !newGame[b.dataset.sw]; sfx.click(); draw(false); };
      b.onclick = flip; b.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    });
    el.querySelectorAll('[data-gopt]').forEach(b => {
      const flip = () => { newGame.gameOptions[b.dataset.gopt] = !newGame.gameOptions[b.dataset.gopt]; sfx.click(); draw(false); };
      b.onclick = flip; b.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    });
    el.querySelectorAll('[data-escen]').forEach(b => b.onclick = () => { newGame.escen = +b.dataset.escen; reVp(); sfx.click(); draw(false); });
    el.querySelectorAll('[data-scen]').forEach(b => b.onclick = () => { newGame.scenario = b.dataset.scen; if (!SCEN[newGame.scenario].variable) newGame.variable = false; reVp(); sfx.click(); draw(false); });
    el.querySelectorAll('[data-var]').forEach(b => b.onclick = () => { newGame.variants[b.dataset.var] = !newGame.variants[b.dataset.var]; reVp(); sfx.click(); draw(false); });
    // one scenario at a time; the three big ones are for the classic rules; only Merchant Trains also has a 5–6 player layout
    el.querySelectorAll('[data-scn]').forEach(b => b.onclick = () => {
      const k = b.dataset.scn, on = !newGame.variants[k];
      ['fishermen', 'rivers', ...BIG3].forEach(x => { newGame.variants[x] = false; });
      newGame.variants[k] = on;
      if (on && BIG3.includes(k)) { if (newGame.mode === 'knights') newGame.mode = 'classic'; if (NO56.includes(k)) { newGame.big = false; newGame.maxPlayers = Math.min(4, newGame.maxPlayers); } else if (newGame.maxPlayers > 4) newGame.big = true; }
      reVp(); sfx.click(); draw(false);
    });
    el.querySelectorAll('[data-vsetup]').forEach(b => b.onclick = () => { newGame.variable = !newGame.variable; sfx.click(); draw(false); });
    el.querySelectorAll('[data-np]').forEach(b => b.onclick = () => {
      const was = newGame.maxPlayers;
      newGame.maxPlayers = Math.max(minPlayersOf(newGame.mode), Math.min(isStandalone(newGame.mode) ? (GAMES[newGame.mode].maxPlayers || 4) : bigScenario() ? 4 : 6, was + +b.dataset.np));
      if (was <= 4 && newGame.maxPlayers > 4) newGame.big = true;
      if (newGame.mode === 'explorers' && newGame.maxPlayers > 4 && newGame.escen === 1) { newGame.escen = 2; reVp(); }
      sfx.click(); draw(false);
    });
    el.querySelectorAll('[data-vp]').forEach(b => b.onclick = () => { newGame.vpTarget = Math.max(5, Math.min(20, newGame.vpTarget + +b.dataset.vp)); newGame.vpTouched = true; sfx.click(); draw(false); });
    // the public demo: one click creates the game, fills every other seat with a bot, deals and opens the board (no waiting room, nobody to invite)
    const quickPlay = async e => {
      const b = e.currentTarget; b.disabled = true;
      try { const { vpTouched, ...body } = newGame; const { game } = await api('/games', { body: { ...body, quick: true } }); sfx.place(); location.hash = `#/game/${game.id}`; } catch (err) { toast(err.message, 'warn'); b.disabled = false; }
    };
    if (DEMO) el.querySelectorAll('#create, #qs-play').forEach(b => { b.onclick = quickPlay; });
    else el.querySelector('#create').onclick = async () => {
      try { const { vpTouched, ...body } = newGame; await api('/games', { body }); sfx.place(); ngOpen = false; if (isPhone()) window.scrollTo({ top: 0, behavior: 'smooth' }); toast(t('Game created. Pick your color and invite your friends.')); } catch (e) { toast(e.message, 'warn'); }
    };
    const post = (sel, verb, after) => el.querySelectorAll(`[data-${sel}]`).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api(`/games/${b.dataset[sel]}/${verb}`, { body: {} }); after && after(b.dataset[sel]); } catch (e) { toast(e.message, 'warn'); b.disabled = false; }
    });
    post('join', 'join', () => sfx.place()); post('leave', 'leave');
    post('start', 'start', id => { location.hash = `#/game/${id}`; });
    // computer players: the host adds or removes them while the game is open
    const botCall = async (id, body) => { try { await api(`/games/${id}/bots`, { body }); sfx.place(); } catch (e) { sfx.error(); toast(e.message, 'warn'); } };
    el.querySelectorAll('[data-addbot]').forEach(b => b.onclick = () => botCall(b.dataset.addbot, { action: 'add' }));
    el.querySelectorAll('[data-fillbots]').forEach(b => b.onclick = async () => {
      const g = L.open.find(x => x.id === b.dataset.fillbots);
      for (let i = g ? g.maxPlayers - g.seats.length : 0; i > 0; i--) await botCall(b.dataset.fillbots, { action: 'add' });
    });
    el.querySelectorAll('[data-rmbot]').forEach(b => b.onclick = () => { const [gid, bid] = b.dataset.rmbot.split('|'); botCall(gid, { action: 'remove', id: bid }); });
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
  const offPhone = onPhoneChange(() => draw(false)); // grouped switches and the folded form only exist on phones
  return () => { off(); offPhone(); };
}

// ------------------------------------------------------------ profile
function renderProfile() {
  document.body.dataset.route = 'profile';
  const u = session.user;
  app.innerHTML = `${topbar('profile')}<div class="page narrow"><h1 class="page-title">${flag(u.country, 'lg')} ${tx('Profile')}</h1>
    <div class="card">
      <label class="field"><span>${tx('Display name')}</span><input class="input" id="pname" value="${esc(u.name)}" maxlength="24"></label>
      <div class="field"><span>${tx('Favorite color (used in games when it is free, and on the stats page)')}</span>
        <div class="swatches">${COLOR_KEYS.map(c => `<button class="swatch ${u.color === c ? 'on' : ''}" data-color="${c}" title="${esc(colorName(c))}" style="--c:${PCOLOR[c]};--d:${PCOLOR_DARK[c]};--ink:${inkOn(c)}">${u.color === c ? '<span>✓</span>' : ''}</button>`).join('')}</div></div>
      ${DEMO ? '' : `<label class="field"><span>${tx('Country')}</span>${countrySelect('pcountry', u.country || guessCountry())}</label>`}
      <div class="field"><span>${tx('Language')}</span><button class="btn small lang-row" data-lang-pick><span>${esc(LANGS.find(l => l[0] === lang())[1])}</span><i class="lr-chev" aria-hidden="true">›</i></button></div>
      <div class="m-sticky ps-save"><button class="btn primary" id="psave">${tx('Save')}</button></div>
      ${DEMO ? '' : `<p class="muted" style="font-size:13px;margin:10px 0 0">${tx('Signed in as {email}', { email: u.email })}${u.admin ? ` · ${tx('admin')}` : ''}</p>`}
    </div>
    ${DEMO ? `<div class="card demo-account"><h3>${tx('Like it?')}</h3><p>${tx('Create an account to play with your friends online and keep your statistics.')}</p><a class="btn gold" href="/#/register">${tx('Create account')}</a></div>` : `<div class="card"><h3>${tx('Change password')}</h3>
      <label class="field"><span>${tx('Current password')}</span><input class="input" type="password" id="pw0" autocomplete="current-password"></label>
      <label class="field"><span>${tx('New password')}</span><input class="input" type="password" id="pw1" minlength="8" autocomplete="new-password"></label>
      <button class="btn" id="pwsave">${tx('Change password')}</button>
    </div>
    <div class="card"><div class="row"><div class="spacer">${tx('Done for today?')}</div><button class="btn dark" id="logout">${tx('Log out')}</button></div></div>`}
    ${footer()}</div>`;
  let color = u.color;
  app.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    color = b.dataset.color; sfx.click();
    app.querySelectorAll('[data-color]').forEach(x => { x.classList.toggle('on', x === b); x.innerHTML = x === b ? '<span>✓</span>' : ''; });
  });
  app.querySelector('#psave').onclick = async () => {
    try { const r = await api('/me', { method: 'PATCH', body: { name: app.querySelector('#pname').value, color, country: app.querySelector('#pcountry')?.value || undefined } }); session.user = r.user; toast(t('Saved.')); renderProfile(); } catch (e) { toast(e.message, 'warn'); }
  };
  if (!DEMO) app.querySelector('#pwsave').onclick = async () => {
    try { await api('/me', { method: 'PATCH', body: { password: app.querySelector('#pw0').value, newPassword: app.querySelector('#pw1').value } }); toast(t('Password changed.')); } catch (e) { toast(e.message, 'warn'); }
  };
  if (!DEMO) app.querySelector('#logout').onclick = async () => { await api('/logout', { body: {} }).catch(() => {}); session.user = null; wsClose(); location.hash = '#/'; route(); };
}

// ------------------------------------------------------------ router
let routeSeq = 0;
async function route(keepScroll) {
  // route() awaits the server in several places; when the hash changed meanwhile, the older call must not paint over the newer page
  const seq = ++routeSeq;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  unmountGame(); unmountSGame();
  if (keepScroll !== true) window.scrollTo(0, 0);
  let h = location.hash.replace(/^#/, '') || '/';
  if (!session.user) {
    if (h.startsWith('/join/')) { try { sessionStorage.setItem('broch_join', h.split('/')[2]); } catch { /* storage blocked */ } }
    return renderAuth(h.startsWith('/register') ? 'register' : 'login', { focus: h.startsWith('/register') || h.startsWith('/login') }); // the demo banner and shared links open #/register
  }
  let pendingJoin = null;
  try { pendingJoin = sessionStorage.getItem('broch_join'); } catch { /* storage blocked */ }
  if (pendingJoin) {
    try { sessionStorage.removeItem('broch_join'); } catch { /* ignore */ }
    // an invite link was opened while logged out: carry on with it now. Setting location.hash would do nothing, because it is the same hash already (no hashchange).
    if (/^[\w-]+$/.test(pendingJoin)) { h = `/join/${pendingJoin}`; try { history.replaceState(null, '', `#${h}`); } catch { /* ignore */ } }
  }
  let m;
  try {
    if ((m = h.match(/^\/join\/([\w-]+)/))) {
      if (DEMO) { location.hash = '#/'; return; } // nobody can join a demo game
      try { await api(`/games/${m[1]}/join`, { body: {} }); toast(t('You joined the game.')); } catch (e) { toast(e.message, 'warn'); }
      if (seq === routeSeq) location.hash = '#/';
      return;
    }
    if ((m = h.match(/^\/game\/([\w-]+)/))) {
      // standalone games have their own screen; ask which game this is before building the page
      let mode = 'classic';
      try { mode = (await api(`/games/${m[1]}`)).game.mode; } catch { /* a missing game opens the normal screen, which reports it */ }
      if (seq !== routeSeq) return;
      document.body.dataset.route = 'game';
      cleanup = isStandalone(mode) ? mountSGame(app, m[1], mode) : mountGame(app, m[1]);
      return;
    }
    if (h.startsWith('/stats')) { document.body.dataset.route = 'stats'; cleanup = mountStats(app); return; }
    if (h.startsWith('/profile')) { document.body.dataset.route = 'profile'; return renderProfile(); }
    document.body.dataset.route = 'lobby';
    const c = await renderLobby();
    if (seq !== routeSeq) { c && c(); return; }
    cleanup = c;
  } catch (e) {
    if (!e.handled) throw e;
    toast(e.message, 'warn');
  }
}

// The login is gone (server restarted with empty sessions, logged out elsewhere, expired): say so and show the login page
// instead of a game or lobby that only looks alive. core.js raises this on a rejected websocket and on a 401 answer.
let sessionCheck = false;
window.addEventListener('broch:session', async () => {
  if (!session.user || sessionCheck || DEMO) return;
  sessionCheck = true;
  try {
    const { user } = await api('/me');
    if (!user) {
      session.user = null; wsClose();
      toast(t('You were logged out. Please log in again.'), 'warn');
      route();
    } else setTimeout(wsConnect, 1500); // the login is fine; only the socket was refused (e.g. a race while the server started)
  } catch { /* server unreachable: the connection bar and the reconnect logic take care of it */ }
  finally { sessionCheck = false; }
});

window.addEventListener('hashchange', () => route());

(async () => {
  await setLang(guessLang()).catch(() => {});
  try {
    session.config = await api('/config');
    setFeedbackUrl(session.config.feedbackUrl);
    window.BROCH_BUILD = session.config.build || '';
    const { user } = await api('/me');
    session.user = user;
    if (user && user.lang && user.lang !== lang()) await setLang(user.lang);
  } catch (e) {
    reportProblem('Could not load Broch', e.message);
  }
  if (session.user) wsConnect();
  onWs(msg => { if (msg.t === 'abandoned' && location.hash.startsWith('#/game/')) { toast(t(DEMO ? 'This demo game is gone (a reload ends it). Start a new one.' : 'The host closed this game.'), 'warn'); location.hash = '#/'; } });
  route();
})();

export { modal };
