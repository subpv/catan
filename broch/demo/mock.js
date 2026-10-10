// In-browser stand-in for the Broch server, used only by the demo build.
// Runs the real rules engine locally; the other seats are played by simple bots.
import engine from '../server/engine/index.js';
import { tradersVp } from '../server/engine/shared/constants.js';
import { SCENARIOS as SEA_SCENARIOS } from '../server/engine/seafarers/scenarios.js';
import { decide as decideClassic } from '../server/bots/classic.js';
import { decide as decideStandalone } from '../server/bots/standalone.js';
import { botName } from '../server/bots/names.js';
import PROGRESS from './progress-data.js';
import { t } from '../public/js/core/i18n.js';
const decide = v => (engine.isStandalone(v.mode) ? decideStandalone(v) : decideClassic(v));

const COLORS = ['red', 'blue', 'orange', 'white', 'teal', 'purple', 'black', 'pink', 'yellow', 'brown'];
const users = [
  { id: 'u0', name: 'You', color: 'red', country: 'DK', email: 'you@broch.demo', admin: true },
  { id: 'u1', name: 'Jolina', color: 'blue', country: 'DE' },
  { id: 'u2', name: 'Carola', color: 'orange', country: 'DE' },
  { id: 'u3', name: 'Erik', color: 'white', country: 'SE' },
  { id: 'u4', name: 'Ada', color: 'teal', country: 'KR' },
  { id: 'u5', name: 'Mads', color: 'purple', country: 'DK' },
];
if (window.BROCH_PUBLIC_DEMO) Object.assign(users[0], { country: null, email: undefined, admin: false }); // a visitor has no account: no flag, no address, no admin
let me = users[0];
let emit = () => {};
let watching = null;
let seq = 0;
const games = new Map();
// the public demo (served at /demo on the real site): no developer button, a slim banner instead of the small tag, no login/logout
const PUBLIC = () => !!window.BROCH_PUBLIC_DEMO;
const BOT_DELAY = window.BROCH_BOT_DELAY || (PUBLIC() ? 600 : 550);
// the public demo never makes a visitor wait for an animation: in the setup the bots place at once (their builders work side by side),
// later a bot waits for the scene that is playing for at most this long
const FX_WAIT_CAP = 1500;

// a few sample results so the stats page has something to show
const DAY = 864e5;
const history = [];
(function seed() {
  const now = Date.now();
  const year0 = new Date(new Date().getFullYear(), 0, 1).getTime();
  const span = Math.max(DAY * 10, now - year0 - DAY);
  const pool = users.slice(0, 4);
  const winners = ['u1', 'u0', 'u1', 'u2', 'u0', 'u3', 'u1', 'u0'];
  winners.forEach((w, i) => {
    const t = year0 + Math.round((i + 1) / (winners.length + 1) * span);
    const mode = i % 3 === 2 ? 'knights' : 'classic';
    const target = mode === 'knights' ? 13 : 10;
    history.push({
      id: 'seed' + i, mode, expansion: i % 5 === 4 ? 'seafarers' : i % 7 === 3 ? 'traders' : 'none', big: i % 6 === 5, kind: 'standard', vpTarget: target, startedAt: t - 75 * 60e3, finishedAt: t, turns: 48 + (i * 7) % 30,
      winner: w,
      players: pool.map((u, j) => ({ userId: u.id, name: u.name, color: u.color, vp: u.id === w ? target : 3 + ((i + j) * 5) % (target - 3), gained: 40 + ((i * 13 + j * 7) % 50), breakdown: { longestRoad: u.id === w && i % 2 === 0, largestArmy: false } })),
      rolls: { 2: 2, 3: 5, 4: 7, 5: 10, 6: 12, 7: 14, 8: 12, 9: 9, 10: 7, 11: 4, 12: 2 },
    });
  });
  history.push({ id: 'seedm', manual: true, createdBy: 'u0', mode: 'classic', startedAt: now - 3 * DAY, finishedAt: now - 3 * DAY, winner: 'u2',
    players: pool.map(u => ({ userId: u.id, name: u.name, color: u.color })) });
})();

const err = (msg, status = 400) => Object.assign(new Error(msg), { handled: true, status });
const pub = u => ({ id: u.id, name: u.name, color: u.color, country: u.country || null, admin: !!u.admin });
// a seat is a user of the demo or a bot of that game (meta.bots), like on the real server
const userOf = (g, id) => (String(id).startsWith('bot_') ? { id, name: (g.meta.bots[id] || {}).name || 'Bot', country: null, color: null, bot: true } : users.find(u => u.id === id));
const seatOf = (g, uid) => (g.state ? g.state.players.findIndex(p => p.userId === uid) : -1);

function fixColors(m) {
  m.colors = m.colors || {};
  const used = new Set();
  for (const id of m.seats) {
    let c = m.colors[id];
    if (!c || used.has(c)) { const fav = (users.find(u => u.id === id) || {}).color; c = !used.has(fav) ? fav : COLORS.find(x => !used.has(x)); }
    m.colors[id] = c; used.add(c);
  }
}
function card(g) {
  const m = g.meta;
  fixColors(m);
  return {
    id: m.id, name: m.name, mode: m.mode, expansion: m.expansion || 'none', scenario: m.scenario || null, big: !!m.big, variants: m.variants || null, robberReturn: !!m.robberReturn, startBoth: !!m.startBoth, knightsFree: !!m.knightsFree, maxPlayers: m.maxPlayers, vpTarget: m.vpTarget, status: m.status, host: m.host,
    seats: m.seats.map(id => ({ ...pub(userOf(g, id)), bot: !!userOf(g, id).bot, color: m.colors[id] })),
    current: g.state && g.state.phase !== 'over' ? g.state.players[g.state.current].userId : null,
    turn: g.state ? g.state.turn : 0,
  };
}

function broadcast(g) {
  if (watching !== g.meta.id || !g.state || !me) return;
  // a copy, like a real network message: the client must never share objects with the live game state
  emit({ t: 'state', game: g.meta.id, state: JSON.parse(JSON.stringify(engine.viewFor(g.state, seatOf(g, me.id)))), online: g.meta.seats });
}

function finish(g) {
  if (g.meta.status === 'over') return;
  g.meta.status = 'over';
  history.push(engine.summary(g.state));
  emit({ t: 'lobby' }); emit({ t: 'stats' });
}

// ---------------------------------------------------------------- bots
function botTick(g, waited = 0) {
  clearTimeout(g.timer);
  const quick = PUBLIC() && g.state && g.state.phase === 'setup';
  // wait while a full-screen animation is playing so you can follow along (the public demo: not for long, and not in the setup)
  g.timer = setTimeout(() => (window.BROCH_FX_BUSY && !quick && (!PUBLIC() || waited < FX_WAIT_CAP) ? botTick(g, waited + BOT_DELAY) : runBots(g)), quick ? Math.round(BOT_DELAY * 0.55) : BOT_DELAY);
}
function runBots(g) {
  const s = g.state;
  if (!s || s.phase === 'over' || !games.has(g.meta.id)) return;
  const mySeat = seatOf(g, 'u0');
  for (let seat = 0; seat < s.players.length; seat++) {
    if (seat === mySeat && !window.BROCH_AUTOPLAY) continue;
    const view = engine.viewFor(s, seat);
    const tries = [decide(view), { type: 'endSpecialBuild' }, { type: 'endTurn' }].filter(Boolean);
    if (!decide(view)) continue;
    for (const a of tries) {
      try {
        engine.act(s, seat, a);
        broadcast(g);
        if (s.phase === 'over') finish(g);
        else botTick(g);
        return;
      } catch (e) {
        if (!(e instanceof engine.GameError)) { console.error('bot crash', a, e); return; }
      }
    }
  }
}

function startGame(g) {
  fixColors(g.meta);
  const players = g.meta.seats.map(id => { const u = userOf(g, id); return { id, name: u.name, color: g.meta.colors[id], country: u.country }; });
  g.state = engine.createGame({ id: g.meta.id, mode: g.meta.mode, players, options: { vpTarget: g.meta.vpTarget, expansion: g.meta.expansion, scenario: g.meta.scenario, variants: g.meta.variants, robberReturn: !!g.meta.robberReturn, startBoth: !!g.meta.startBoth, variable: !!g.meta.variable, knightsFree: !!g.meta.knightsFree, game: g.meta.gameOptions || {}, big: g.meta.big ?? players.length > 4 } });
  g.meta.status = 'playing';
  emit({ t: 'lobby' });
  botTick(g);
}
function addBot(g) {
  const id = 'bot_' + (++seq);
  g.meta.bots[id] = { name: botName([...users.map(x => x.name), ...Object.values(g.meta.bots).map(x => x.name)]) };
  g.meta.seats.push(id);
}

// ---------------------------------------------------------------- API
async function api(path, opts = {}) {
  await new Promise(r => setTimeout(r, 30));
  const method = opts.method || (opts.body ? 'POST' : 'GET');
  const b = opts.body || {};
  const need = () => { if (!me) throw err('Please log in.', 401); return me; };
  let m;
  if (path === '/config') return { feedbackUrl: 'https://feedback.maidev.dk/', needsCode: false, colors: COLORS, firstUser: false };
  if (path === '/me' && method === 'GET') { if (PUBLIC() && me && !me.named) { me.named = true; me.name = t('You'); } return { user: me && { ...pub(me), email: me.email } }; }
  if (path === '/me' && method === 'PATCH') {
    const u = need();
    if (b.name != null) { if (!String(b.name).trim()) throw err('Name cannot be empty.'); u.name = String(b.name).trim().slice(0, 24); }
    if (b.color) u.color = b.color;
    if (b.country) u.country = b.country;
    if (b.newPassword) { if (String(b.newPassword).length < 6) throw err('Password must be at least 6 characters.'); }
    return { user: { ...pub(u), email: u.email } };
  }
  if (path === '/login' || path === '/register') {
    me = users[0];
    if (path === '/register' && b.name) me.name = String(b.name).slice(0, 24);
    if (b.email) me.email = b.email;
    if (b.country) me.country = b.country;
    return { user: { ...pub(me), email: me.email } };
  }
  if (path === '/logout') { if (PUBLIC()) { setTimeout(() => location.assign('/'), 0); return { ok: true }; } me = null; return { ok: true }; } // public demo: leaving goes to the real site
  if (path === '/users') return { users: users.map(pub) };
  if (path === '/client-error') return { ok: true };
  if (path === '/lobby') {
    need();
    const all = [...games.values()].filter(g => g.meta.status !== 'over');
    return { open: all.filter(g => g.meta.status === 'open').map(card), playing: all.filter(g => g.meta.status === 'playing').map(card), mine: all.filter(g => g.meta.seats.includes(me.id)).map(g => g.meta.id) };
  }
  if (path === '/games' && method === 'POST') {
    const u = need();
    const mode = b.mode === 'knights' || engine.isStandalone(b.mode) ? b.mode : 'classic';
    const standalone = engine.isStandalone(mode);
    const maxPlayers = Math.max(standalone ? engine.minPlayers(mode) : 2, Math.min(standalone ? engine.maxPlayers(mode) : 6, b.maxPlayers | 0 || 4));
    const expansion = !standalone && ['seafarers', 'traders'].includes(b.expansion) ? b.expansion : 'none';
    const scenario = expansion === 'seafarers' ? (SEA_SCENARIOS[b.scenario] ? b.scenario : 'shores') : mode === 'explorers' ? String(Math.max(1, Math.min(5, b.escen | 0 || 2))) : null;
    const bv = b.variants || {};
    const variants = expansion === 'traders' ? { fishermen: !!bv.fishermen, rivers: !!bv.rivers, caravans: !!bv.caravans, barbarians: !!bv.barbarians, traders: !!bv.traders, events: !!bv.events, friendly: !!bv.friendly, harbors: !!bv.harbors } : null;
    const big = !standalone && (typeof b.big === 'boolean' ? b.big : maxPlayers > 4);
    const defVp = standalone ? engine.defaultVp(mode, scenario) : mode === 'knights' ? (expansion === 'seafarers' ? SEA_SCENARIOS[scenario].vp + 2 : 13) : expansion === 'seafarers' ? SEA_SCENARIOS[scenario].vp : expansion === 'traders' ? tradersVp(variants) : 10;
    const id = 'demo' + (++seq);
    // the host adds bots in the lobby (or plays with friends only)
    const seats = [u.id];
    const g = { meta: { id, bots: {}, name: '', mode, expansion, scenario, variants, big, variable: expansion === 'seafarers' && !!b.variable, robberReturn: !!b.robberReturn, startBoth: !!b.startBoth, knightsFree: !!b.knightsFree && b.mode !== 'knights', gameOptions: standalone && b.gameOptions ? { ...b.gameOptions } : null, maxPlayers, vpTarget: standalone && engine.fixedVp(mode) ? defVp : b.vpTarget || defVp, host: u.id, seats, status: 'open' }, state: null };
    games.set(id, g);
    if (b.quick) { while (seats.length < maxPlayers) addBot(g); startGame(g); return { game: card(g) }; } // the public demo: create, fill the seats with bots and deal in one step
    emit({ t: 'lobby' });
    return { game: card(g) };
  }
  if ((m = path.match(/^\/games\/(\w+)\/color$/))) {
    const g = games.get(m[1]);
    fixColors(g.meta);
    const owner = Object.keys(g.meta.colors).find(id => g.meta.colors[id] === b.color && id !== me.id);
    if (owner) throw err('Someone else already has that color.', 409);
    g.meta.colors[me.id] = b.color;
    emit({ t: 'lobby' });
    return { game: card(g) };
  }
  if ((m = path.match(/^\/games\/(\w+)\/bots$/))) {
    need();
    const g = games.get(m[1]);
    if (!g || g.meta.status !== 'open') throw err('The game already started.');
    if (b.action === 'remove') {
      g.meta.seats = g.meta.seats.filter(x => x !== b.id); delete g.meta.bots[b.id];
    } else {
      if (g.meta.seats.length >= g.meta.maxPlayers) throw err('The game is full.');
      addBot(g);
    }
    emit({ t: 'lobby' });
    return { game: card(g) };
  }
  if ((m = path.match(/^\/games\/(\w+)\/(join|leave|start|abandon|resign)$/))) {
    need();
    const g = games.get(m[1]);
    if (!g) throw err('Game not found', 404);
    if (m[2] === 'start') {
      startGame(g);
    } else if (m[2] === 'leave' || m[2] === 'abandon' || m[2] === 'resign') {
      clearTimeout(g.timer); games.delete(m[1]); emit({ t: 'lobby' });
      if (m[2] === 'abandon') emit({ t: 'abandoned' });
    }
    return { game: card(g) };
  }
  if ((m = path.match(/^\/games\/(\w+)$/))) return { game: card(games.get(m[1])) };
  if (path === '/stats' && method === 'GET') return { history, users: users.map(pub) };
  if (path === '/stats/manual') {
    const players = (b.players || []).filter(id => users.some(u => u.id === id));
    if (!players.includes(b.winner)) throw err('Pick the winner among the players.');
    const t = Date.parse(b.date) || Date.now();
    history.push({ id: 'm' + (++seq), manual: true, createdBy: me.id, mode: b.mode, startedAt: t, finishedAt: t, winner: b.winner,
      players: players.map(id => { const u = users.find(x => x.id === id); return { userId: id, name: u.name, color: u.color }; }) });
    setTimeout(() => emit({ t: 'stats' }), 0);
    return { ok: true };
  }
  if ((m = path.match(/^\/stats\/(\w+)$/)) && method === 'DELETE') {
    const i = history.findIndex(h => h.id === m[1]);
    if (i >= 0) history.splice(i, 1);
    setTimeout(() => emit({ t: 'stats' }), 0);
    return { ok: true };
  }
  throw err('Unknown endpoint', 404);
}

function connect(fn) { emit = fn; }
function watch(id) {
  watching = id;
  const g = id && games.get(id);
  if (id && !g) setTimeout(() => emit({ t: 'abandoned' }), 0);
  else if (g) setTimeout(() => broadcast(g), 0);
}
async function act(id, action) {
  const g = games.get(id);
  if (!g || !g.state) throw err('Game not running.');
  const seat = seatOf(g, me.id);
  try {
    engine.act(g.state, seat, action);
  } catch (e) {
    if (e instanceof engine.GameError) throw err(e.message);
    throw Object.assign(new Error('Server error: ' + e.message), { handled: true, internal: true });
  }
  broadcast(g);
  if (g.state.phase === 'over') finish(g);
  else botTick(g);
}

window.BROCH_MOCK = { api, connect, watch, act, _games: games }; // _games: test hook

// the progress overview (button at the bottom left)
window.addEventListener('DOMContentLoaded', () => {
  if (PUBLIC()) return; // visitors of the public demo do not see the developer overview
  const esc = x => String(x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const btn = document.createElement('button');
  btn.textContent = 'Fortschritt';
  btn.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:40;background:#F0C24A;color:#2B1E12;font:700 12px Inter,system-ui;padding:7px 12px;border:0;border-radius:999px;cursor:pointer';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(10,4,2,.72);display:none;overflow:auto;padding:24px 12px';
  box.innerHTML = `<div style="max-width:900px;margin:0 auto;background:#FBF3DE;color:#2B1E12;border-radius:16px;padding:22px;font:14px/1.45 Inter,system-ui"><div style="display:flex;align-items:center"><h2 style="margin:0;font-family:Georgia,serif;flex:1">${esc(PROGRESS.title)}</h2><button data-x style="border:0;background:#2B1E12;color:#FBF3DE;border-radius:999px;padding:6px 14px;cursor:pointer;font-weight:700">Schließen</button></div>
    <h3>So testest du</h3><ul>${PROGRESS.howto.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Modi</h3>${PROGRESS.modes.map(m => `<div style="border-top:1px solid #d9c9a3;padding:8px 0"><b>${esc(m.name)}</b> <span style="background:${m.status === 'Beta' ? '#F4D58A' : '#BFE3C0'};border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700">${m.status === 'Beta' ? 'BETA' : 'fertig'}</span><div>${esc(m.test)}</div><div style="color:#6b5a40">Lücken: ${esc(m.gaps)}</div></div>`).join('')}
    <h3>Neu</h3><ul>${PROGRESS.news.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Was mir noch fehlt</h3><ul>${PROGRESS.missing.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  btn.onclick = () => { box.style.display = 'block'; };
  box.addEventListener('click', e => { if (e.target === box || e.target.dataset.x !== undefined) box.style.display = 'none'; });
  document.body.append(btn, box);
});

// public demo: a slim banner (text, "Create account" -> /#/register, small "Back" link), styled by demo.css; the texts follow the language
function publicBanner() {
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.setAttribute('role', 'note');
  const msg = document.createElement('p');
  const cta = document.createElement('a');
  cta.className = 'demo-cta';
  cta.href = '/#/register';
  const back = document.createElement('a');
  back.className = 'demo-back';
  back.href = '/';
  msg.onclick = () => bar.classList.toggle('open'); // in a game the sentence is one cut-off line: a tap shows all of it
  const fill = () => {
    msg.textContent = t('This is a demo against computer players. Nothing is saved. Create an account to play with your friends.');
    cta.textContent = t('Create account');
    back.textContent = t('Back');
  };
  fill();
  bar.append(msg, cta, back);
  document.body.prepend(bar);
  new MutationObserver(fill).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); // setLang() sets <html lang> once the texts are loaded
}

// small marker so it's obvious this is the demo
window.addEventListener('DOMContentLoaded', () => {
  if (PUBLIC()) return publicBanner();
  const tag = document.createElement('div');
  tag.textContent = 'Demo · bots';
  tag.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:40;background:rgba(20,8,4,.8);color:#F0C24A;font:600 12px Inter,system-ui;padding:6px 10px;border-radius:999px;pointer-events:none';
  document.body.appendChild(tag);
});
