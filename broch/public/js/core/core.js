// Shared helpers: API, websocket, toasts, modals, feedback reporting, icons.
import { t } from './i18n.js';
import { isPhone } from './phone.js';
export { t };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PCOLOR = { red: '#D7262B', blue: '#1F5FB8', orange: '#F07A1A', white: '#F4EFE2', teal: '#12A89A', purple: '#8E3FB0', black: '#26262B', pink: '#F065B4', yellow: '#F7D23B', brown: '#7A4A23' };
export const PCOLOR_DARK = { red: '#7E1214', blue: '#0E3470', orange: '#8A3E05', white: '#8A7A5E', teal: '#065C54', purple: '#4C1A63', black: '#000000', pink: '#8C2160', yellow: '#8A6A05', brown: '#3A200C' };
export const COLOR_KEYS = Object.keys(PCOLOR);
export const isLightColor = c => c === 'white' || c === 'yellow';
// text color to use on top of a player color
export const inkOn = c => (isLightColor(c) ? '#2B1E12' : '#FFFFFF');

export const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
export const COMM = ['paper', 'cloth', 'coin'];
export const CARD_COLOR = { lumber: '#2E6B45', brick: '#B4482A', wool: '#7FA65A', grain: '#D99A22', ore: '#6E7F8D', paper: '#2E6B45', cloth: '#E0A32E', coin: '#2C6E9B' }; // commodities share the colour of their improvement track
export const TERRAIN_COLOR = { forest: '#2E6B45', hills: '#B4482A', pasture: '#93B86A', fields: '#E8B23A', mountains: '#7C8A96', desert: '#E3CF9E', gold: '#CF7F1B', river: '#4FA3BD', sea: '#2C5F7A', fog: '#8FA3B3', lake: '#E3CF9E', swamp: '#7C8A5A', waterhole: '#A9CC8E', castle: '#8FC06A', quarry: '#C97A3C', glassworks: '#6FA25A' };
const RES_EN = { lumber: 'Lumber', brick: 'Brick', wool: 'Wool', grain: 'Grain', ore: 'Ore', paper: 'Paper', cloth: 'Cloth', coin: 'Coin' };
export const resName = k => t(RES_EN[k] || k);
// the standalone games add their own cards, colours, glyphs and game terms here (see games/*.js)
export function extendCore({ names = {}, colors = {}, terms = {}, glyphs = {}, cards = {} } = {}) {
  Object.assign(RES_EN, names); Object.assign(CARD_COLOR, colors); Object.assign(TERM_EN, terms); Object.assign(GLYPH, glyphs); Object.assign(CARD_EN, cards);
}
// translated names for game terms used in the log and UI
const TERM_EN = {
  trade: 'Trade', politics: 'Politics', science: 'Science',
  'barbarian ship': 'barbarian ship', 'trade gate': 'trade gate', 'politics gate': 'politics gate', 'science gate': 'science gate',
  basic: 'basic', strong: 'strong', mighty: 'mighty',
  forest: 'Forest', hills: 'Hills', pasture: 'Pasture', fields: 'Fields', mountains: 'Mountains', desert: 'Desert', gold: 'Gold', river: 'River',
  fish: 'fish', spice: 'spice', any: '3:1',
  castle: 'Castle', bridge: 'Great Bridge', wall: 'Great Wall', theater: 'Great Theater', monument: 'Monument', lighthouse: 'Lighthouse', library: 'Great Library',
};
export const term = k => (RES_EN[k] ? resName(k) : t(TERM_EN[k] || k));
const CARD_EN = {
  knight: 'Knight', victoryPoint: 'Victory Point', roadBuilding: 'Road Building', yearOfPlenty: 'Year of Plenty', monopoly: 'Monopoly',
  alchemist: 'Alchemist', inventor: 'Inventor', crane: 'Crane', engineer: 'Engineer', irrigation: 'Irrigation', medicine: 'Medicine',
  mining: 'Mining', printer: 'Printer', smith: 'Smith', commercialHarbor: 'Commercial Harbor', masterMerchant: 'Master Merchant',
  merchant: 'Merchant', merchantFleet: 'Merchant Fleet', resourceMonopoly: 'Resource Monopoly', tradeMonopoly: 'Trade Monopoly',
  bishop: 'Bishop', constitution: 'Constitution', deserter: 'Deserter', diplomat: 'Diplomat', intrigue: 'Intrigue',
  saboteur: 'Saboteur', spy: 'Spy', warlord: 'Warlord', wedding: 'Wedding',
};
export const cardName = k => t(CARD_EN[k] || k);
const COLOR_EN = { red: 'Red', blue: 'Blue', orange: 'Orange', white: 'White', teal: 'Teal', purple: 'Purple', black: 'Black', pink: 'Pink', yellow: 'Yellow', brown: 'Brown' };
export const colorName = c => t(COLOR_EN[c] || c);
// "2 Lumber, 1 Brick" in the current language
export const cardListText = cards => Object.entries(cards || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${resName(k)}`).join(', ') || t('nothing');

// tiny glyphs (drawn in a 24x24 box, white stroke)
export const GLYPH = {
  lumber: '<path d="M12 3l6 9h-3l4 6H5l4-6H6z M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  brick: '<path d="M3 7h18v10H3z M3 12h18 M9 7v5 M15 12v5" fill="none" stroke="currentColor" stroke-width="2"/>',
  wool: '<path d="M6 14a4 4 0 0 1 2-7 4 4 0 0 1 7 0 4 4 0 0 1 3 6 3 3 0 0 1-3 4H9a3 3 0 0 1-3-3z M9 17v3 M15 17v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  grain: '<path d="M12 21V8 M12 8c-3 0-4-3-4-5 3 0 4 2 4 5zm0 0c3 0 4-3 4-5-3 0-4 2-4 5z M12 14c-3 0-4-2-4-4 3 0 4 2 4 4zm0 0c3 0 4-2 4-4-3 0-4 2-4 4z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  ore: '<path d="M3 19l6-11 4 6 2-3 6 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  paper: '<path d="M6 3h9l3 3v15H6z M9 9h6 M9 13h6 M9 17h4" fill="none" stroke="currentColor" stroke-width="2"/>',
  cloth: '<path d="M4 6c4-2 12-2 16 0v12c-4-2-12-2-16 0z M8 6v12 M16 6v12" fill="none" stroke="currentColor" stroke-width="2"/>',
 fish: '<path d="M3 12c4-6 10-6 14 0-4 6-10 6-14 0z M17 12l4-4v8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8.5" cy="11" r="1.1" fill="currentColor"/>',
  spice: '<path d="M8 3h8v3H8z M7 6h10l1 4v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9z M9 13h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  gold: '<path d="M2 18l3-7h14l3 7z M7.5 11l2-6h5l2 6 M12 14v1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 3 1.5 4.5 3 5.5V20h10v-3.5c1.5-1 3-2.5 3-5.5a8 8 0 0 0-8-8z M9 12h.01 M15 12h.01 M10 20v-3 M14 20v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  ship: '<path d="M3 15h18l-3 5H6z M12 3v12 M12 4l7 9h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  bridge: '<path d="M2 14c4-8 16-8 20 0 M2 18h20 M6 14v4 M12 10v8 M18 14v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  boot: '<path d="M8 3h6v9l5 2.5V19H6V3z M6 15h13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  coin: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v10 M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  // development cards
  knight: '<path d="M5 20v-6a7 7 0 0 1 14 0v6z M5 14h14 M9.5 14v6 M14.5 14v6 M12 7V3.5 M12 3.5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  victoryPoint: '<path d="M3.5 17.5 5 8l4.5 4.5L12 5l2.5 7.5L19 8l1.5 9.5z M4 21h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  roadBuilding: '<path d="M7.5 21 10 3 M16.5 21 14 3 M12 5.5v2 M12 11v2 M12 16.5v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  yearOfPlenty: '<path d="M8 3.5h8.5A1.5 1.5 0 0 1 18 5v12 M5.5 7H14a1.5 1.5 0 0 1 1.5 1.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1z M10.5 11v6 M7.5 14h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  monopoly: '<path d="M5 3.5v8.5a7 7 0 0 0 14 0V3.5h-4V12a3 3 0 0 1-6 0V3.5z M5 8h4 M15 8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  // progress decks
  science: '<path d="M9 3h6 M10 3v6.5L5.2 18a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L14 9.5V3 M7.6 15h8.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  trade: '<path d="M12 4v16 M7.5 20h9 M5 7h14 M5 7l-3 6.5h6z M19 7l-3 6.5h6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  politics: '<path d="M6 21V3 M6 4h11.5l-2.5 4 2.5 4H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  // pieces and events (timeline, player rows)
  road: '<path d="M4 18 20 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  settlement: '<path d="M5 20V10.5L12 4l7 6.5V20z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  city: '<path d="M2.5 20v-9L8 5.5l5.5 5.5v1.5h8V20z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  wall: '<path d="M3 20V9h3v3h3V9h3v3h3V9h3v3h3V9h0v11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  lighthouse: '<path d="M9 21l1.5-13h3L15 21z M10.5 8 12 4l1.5 4 M8 21h8 M6 11l3 1 M18 11l-3 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  castle: '<path d="M4 21V8h3v2h3V8h4v2h3V8h3v13z M10 21v-5h4v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  theater: '<path d="M4 5h16v6c0 5-3 8-8 8s-8-3-8-8z M8.5 10h.01 M15.5 10h.01 M9 14.5c1.8 1.6 4.2 1.6 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  monument: '<path d="M12 3l3 6v12H9V9z M6 21h12 M9 9h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  library: '<path d="M4 5.5C7 4 10 4.5 12 6c2-1.5 5-2 8-.5V19c-3-1.5-6-1-8 .5-2-1.5-5-2-8-.5z M12 6v13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  sword: '<path d="M19.5 4.5 10 14 M19.5 4.5V9 M19.5 4.5H15 M7.5 12.5l4 4 M8.5 15.5 4 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  robber: '<path d="M7.5 21c0-4.5 1.6-7.2 3.3-8.2a4.3 4.3 0 1 1 2.4 0c1.7 1 3.3 3.7 3.3 8.2z" fill="currentColor"/>',
  trophy: '<path d="M8 3.5h8V9a4 4 0 0 1-8 0z M8 5.5H5a3 3 0 0 0 3.3 4 M16 5.5h3a3 3 0 0 1-3.3 4 M12 13v4 M8 21h8 M9.5 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  swap: '<path d="M4 8h15 M15.5 4.5 19 8l-3.5 3.5 M20 16H5 M8.5 12.5 5 16l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5z M5.5 10v7 M10 10v7 M14 10v7 M18.5 10v7 M3 20h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  card: '<rect x="5.5" y="3" width="13" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8h6 M9 12h6 M9 16h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  barbarian: '<path d="M2.5 15h19l-3 5h-13z M12 3v12 M12 4c-4 2-6 5-6.5 9H12 M12 4c4 2 6 5 6.5 9H12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  flag: '<path d="M6 21V3 M6 4h11.5l-2.5 4 2.5 4H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};
// a die face with real pips (1-6)
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
export const pipsHtml = n => Array.from({ length: 9 }, (_, i) => `<i class="${(PIPS[n] || []).includes(i + 1) ? 'on' : ''}"></i>`).join('');
export const dieHtml = (n, cls = '') => `<span class="pdie ${cls}" data-v="${n}" aria-label="${n}">${pipsHtml(n)}</span>`;
export const glyph = (k, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:#fff">${GLYPH[k] || ''}</svg>`;

export function houseIcon(color, size = 18) {
  const fill = PCOLOR[color] || color;
  const stroke = PCOLOR_DARK[color] || '#2B1E12';
  return `<svg class="house" viewBox="0 0 20 22" width="${size}" height="${size * 1.1}"><path d="M2 21V9l8-7 8 7v12z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
export const logoSvg = (cls = '') => `<svg class="${cls}" viewBox="0 0 100 100"><polygon points="30,18 47,28 47,48 30,58 13,48 13,28" fill="#D2352A"/><polygon points="70,18 87,28 87,48 70,58 53,48 53,28" fill="#E0A32E"/><polygon points="50,52 67,62 67,82 50,92 33,82 33,62" fill="#2E6B45"/></svg>`;

// ------------------------------------------------------------ feedback reporting
let feedbackUrl = 'https://feedback.maidev.dk/';
let lastReportAt = 0;
export function setFeedbackUrl(u) { if (u) feedbackUrl = u; }
export function getFeedbackUrl() { return feedbackUrl; }

export function reportProblem(title, detail) {
  const now = Date.now();
  const text = `${title}\n${detail || ''}\nPage: ${location.href}\nBrowser: ${navigator.userAgent}\nTime: ${new Date().toISOString()}`;
  if (!window.BROCH_MOCK) fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: title, stack: detail }) }).catch(() => {});
  if (now - lastReportAt < 4000 || document.querySelector('.feedback-banner')) return;
  lastReportAt = now;
  const el = document.createElement('div');
  el.className = 'feedback-banner';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="fb-ico">!</div>
    <div style="flex:1;min-width:0">
      <b>${esc(t('Something went wrong'))}</b>
      <p>${esc(t(title))}. ${esc(t("Tell us what you were doing and we'll fix it. The button copies the error details so you can paste them into the form."))}</p>
      <details><summary>${esc(t('Error details'))}</summary><pre>${esc(text)}</pre></details>
      <div class="row wrap">
        <a class="btn primary small" href="${esc(feedbackUrl)}" target="_blank" rel="noopener" data-fb-go>${esc(t('Send feedback'))}</a>
        <button class="btn small" data-fb-close>${esc(t('Dismiss'))}</button>
      </div>
    </div>
    <button class="x" aria-label="${esc(t('Dismiss'))}" data-fb-close>×</button>`;
  el.querySelector('[data-fb-go]').addEventListener('click', () => {
    navigator.clipboard?.writeText(text).then(() => toast(t('Error details copied. Paste them into the feedback form.'))).catch(() => {});
  });
  el.querySelectorAll('[data-fb-close]').forEach(b => b.addEventListener('click', () => el.remove()));
  document.body.appendChild(el);
}

window.addEventListener('error', e => {
  if (!e.error && !e.message) return;
  reportProblem('The app hit an unexpected error', `${e.message}\n${e.error?.stack || ''}`);
});
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  if (r && r.handled) return;
  reportProblem('The app hit an unexpected error', `${r?.message || r}\n${r?.stack || ''}`);
});

// ------------------------------------------------------------ api
export async function api(path, opts = {}) {
  if (window.BROCH_MOCK) return window.BROCH_MOCK.api(path, opts); // in-browser demo build
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch (e) {
    const err = new Error(t('Could not reach the Broch server. Check your connection.'));
    err.handled = true;
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data.error ? t(data.error) : t('Request failed ({n})', { n: res.status }));
    err.status = res.status; err.handled = true;
    if (res.status >= 500 || data.internal) reportProblem('The server reported an error', `${opts.method || 'GET'} ${path}: ${err.message}`);
    throw err;
  }
  return data;
}

// ------------------------------------------------------------ websocket
const listeners = new Set();
let ws = null, wsOpen = false, watching = null, retry = 0, downSince = null, reqSeq = 0;
const waiting = new Map();
export function onWs(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function wsConnect() {
  if (window.BROCH_MOCK) {
    if (!wsOpen) { wsOpen = true; window.BROCH_MOCK.connect(msg => listeners.forEach(fn => fn(msg))); }
    return;
  }
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    wsOpen = true; retry = 0; downSince = null; connBar(false);
    if (watching) ws.send(JSON.stringify({ t: 'watch', game: watching }));
  };
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'state' && !hydrate(msg)) return;
    if (msg.rid && waiting.has(msg.rid)) {
      const w = waiting.get(msg.rid); waiting.delete(msg.rid);
      msg.t === 'err' ? w.reject(Object.assign(new Error(msg.msg), { handled: true, internal: msg.internal, params: msg.params })) : w.resolve();
    }
    listeners.forEach(fn => fn(msg));
  };
  ws.onclose = ev => {
    wsOpen = false;
    if (ev.code === 4001) return; // not logged in
    if (!downSince) downSince = Date.now();
    connBar(true);
    if (Date.now() - downSince > 20000) reportProblem('Lost connection to the game server', `WebSocket closed (code ${ev.code}) and has not come back for 20 seconds.`);
    setTimeout(wsConnect, Math.min(8000, 500 * 2 ** retry++));
  };
}
// The server leaves out what we already have (see stateFor in server/index.js); put it back together here.
const known = { game: null, board: null, track: [] };
function hydrate(msg) {
  const st = msg.state;
  if (known.game !== msg.game) { known.game = msg.game; known.board = null; known.track = []; }
  if (st.boardSame) {
    if (!known.board) return resync(msg.game);
    st.board = known.board;
  } else if (st.board) known.board = st.board;
  if (st.trackFrom != null) {
    if (known.track.length !== st.trackFrom) return resync(msg.game);
    known.track = known.track.concat(st.track || []);
  } else known.track = st.track || [];
  st.track = known.track;
  delete st.boardSame; delete st.trackFrom;
  return true;
}
function resync(game) {
  known.game = null;
  if (wsOpen && ws) ws.send(JSON.stringify({ t: 'watch', game }));
  return false;
}

export function wsWatch(game) {
  watching = game;
  if (window.BROCH_MOCK) return window.BROCH_MOCK.watch(game);
  if (wsOpen) ws.send(JSON.stringify({ t: 'watch', game }));
}
export function wsAct(game, action) {
  if (window.BROCH_MOCK) return window.BROCH_MOCK.act(game, action);
  return new Promise((resolve, reject) => {
    if (!wsOpen) return reject(Object.assign(new Error(t('Reconnecting to the server… try again in a moment.')), { handled: true }));
    const rid = ++reqSeq;
    waiting.set(rid, { resolve, reject });
    ws.send(JSON.stringify({ t: 'act', game, action, rid }));
    setTimeout(() => { if (waiting.has(rid)) { waiting.delete(rid); reject(Object.assign(new Error(t('The server did not answer.')), { handled: true })); } }, 10000);
  });
}
export function wsClose() { if (window.BROCH_MOCK) { wsOpen = false; return; } if (ws) { ws.onclose = null; ws.close(); ws = null; wsOpen = false; } }
function connBar(show) {
  let el = document.querySelector('.conn-bar');
  if (show && !el) { el = document.createElement('div'); el.className = 'conn-bar'; el.textContent = t('Reconnecting…'); document.body.appendChild(el); }
  if (!show && el) el.remove();
}

// ------------------------------------------------------------ toasts & modals
export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  const host = document.getElementById('toasts');
  // phone: a short stack of at most two, a new one pushes the oldest out
  const phone = isPhone();
  if (phone) while (host.children.length >= 2) host.firstElementChild.remove();
  // phone, portrait game: the stack sits just below the status and player strips (their real height varies), never over them
  if (phone) {
    const strip = document.body.dataset.route === 'game' && !window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches && document.querySelector('.pstrip-host');
    const r = strip && strip.getBoundingClientRect();
    host.style.top = r && r.height > 0 ? Math.round(r.bottom + 8) + 'px' : '';
  }
  host.appendChild(el);
  setTimeout(() => el.remove(), phone ? (kind === 'warn' ? 3600 : 2600) : (kind === 'warn' ? 4200 : 3000));
}

// Phone: every dialog is a bottom sheet (css/mobile-dialogs.css). The grab zone at its top (hidden on the desktop) drags it down to dismiss.
function swipeToDismiss(back, box, grab, close) {
  let y0 = 0, t0 = 0, dy = 0, id = null;
  const end = e => {
    if (id == null || (e && e.pointerId !== id)) return;
    id = null;
    const fast = dy > 24 && dy / Math.max(1, performance.now() - t0) > 0.6;
    box.style.transition = 'transform .18s ease-out';
    if (dy > 80 || fast) { box.style.transform = 'translateY(105%)'; back.style.transition = 'opacity .18s'; back.style.opacity = '0'; setTimeout(close, 170); }
    else { box.style.transform = ''; setTimeout(() => { box.style.transition = ''; }, 200); }
  };
  grab.addEventListener('pointerdown', e => {
    id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0;
    try { grab.setPointerCapture(id); } catch { /* synthetic event */ }
    box.style.transition = 'none'; box.style.animation = 'none';
  });
  grab.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - y0);
    box.style.transform = `translateY(${dy}px)`;
  });
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
}

export function modal(html, { onMount, dismissable = true } = {}) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  // m-grab: the drag handle of the phone sheet (display:none on the desktop)
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="m-grab" aria-hidden="true"></div>${html}</div>`;
  const close = () => back.remove();
  const phone = isPhone();
  if (dismissable) back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  root.appendChild(back);
  const box = back.querySelector('.modal');
  if (phone && dismissable) swipeToDismiss(back, box, box.querySelector('.m-grab'), close);
  else if (phone) box.classList.add('fixed');
  onMount && onMount(box, close);
  // a phone never auto-focuses a text field (the keyboard would cover the sheet)
  const f = back.querySelector(phone ? 'button.primary' : 'input, button.primary');
  f && f.focus({ preventScroll: true });
  return close;
}
export function closeModals() { document.getElementById('modal-root').innerHTML = ''; }

export function fmtDate(ts) { const d = new Date(ts); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; }
export function title(card) { return card.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }

// Format a translated template with typed placeholders (see engine log()).
// Returns HTML. nameHtml renders a player index.
export function tf(key, a = {}, nameHtml = i => esc(`#${i}`)) {
  return esc(t(key)).replace(/\{([@$#%]?)(\w+)\}/g, (m, kind, name) => {
    const v = a[name];
    if (v == null) return m;
    if (kind === '@') return (Array.isArray(v) ? v : [v]).map(nameHtml).join(', ');
    if (kind === '$') return esc(cardListText(v));
    if (kind === '#') return esc(term(v));
    if (kind === '%') return esc(cardName(v));
    return esc(v);
  });
}
