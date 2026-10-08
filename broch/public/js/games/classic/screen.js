import { esc, toast, modal, closeModals, wsWatch, wsAct, onWs, reportProblem, houseIcon, glyph, PCOLOR, PCOLOR_DARK, RES, COMM, CARD_COLOR, resName, cardName, tf, t, isLightColor, dieHtml } from '../../core/core.js';
import { lang } from '../../core/i18n.js';
import { renderBoard } from '../../core/board.js';
import { hubExt } from '../traders-barbarians/hub-art.js';
import { createHub } from '../traders-barbarians/hub.js';
import { topbar } from '../../app.js';
import { diff, play, sfx, afterFx } from '../../core/fx.js';
import { victoryScene, closeVictory } from '../../core/victory.js';
import { openTutorial, closeTutorial, tutorialSeen } from '../../core/tutorial.js';
import { flag } from '../../core/countries.js';
import { createZoom } from '../../core/zoom.js';
import { DEV_DESC } from '../../core/cards.js';
import { createKnights } from '../knights/ui.js';
import { createSeafarers } from '../seafarers/ui.js';
import { chatHtml, historyHtml, graphsHtml, wireGraphs } from '../../core/feed.js';

let G = null;
const ZOOM0 = () => ({ z: 1, cx: 0, cy: 0 });

const COSTS = {
  road: { lumber: 1, brick: 1 }, settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 }, city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
};
const EXP_NAME = { seafarers: 'Seafarers', traders: 'Traders & Barbarians' };
export function modeLabel(v) {
  const base = v.mode === 'knights' ? t('Cities & Knights') : t('Classic');
  if (!v.expansion || v.expansion === 'none') return base;
  const x = `${t(EXP_NAME[v.expansion])} · Beta`;
  return v.mode === 'knights' ? `${x} + ${base}` : x;
}
const isSea = v => v.expansion === 'seafarers';
// which tutorial explains a game: the expansion first, then Cities & Knights, then the 5–6 player rules
export const tutorialFor = v => (v.expansion && v.expansion !== 'none' ? v.expansion : v.mode === 'knights' ? 'knights' : 'classic');


// ------------------------------------------------------------ mount
// The page is built once; later updates only touch the parts that changed. The board in particular is only
// redrawn when something on it changed, so chatting or opening a dialog never repaints the map.
export function mountGame(app, id) {
  G = {
    id, view: null, online: [], pick: null, tab: 'chat', opened: new Set(), celebrated: false, app, fresh: null, zoom: ZOOM0(), prevImp: null,
    html: {}, boardKey: null, boardRef: null, boardSig: '', chatSeenAt: 0, unread: 0, newestTurn: null,
    life: lifePref(),
  };
  app.innerHTML = `${topbar('play')}<div class="game">
    <div class="game-main">
      <div class="status"><div class="msg"><span class="mt">${esc(t('Loading game…'))}</span></div></div>
      <div class="board-wrap">
        <div class="board-host"></div>
        <div class="hud-host"></div>
        <div class="trade-host"></div>
        <div class="zoom-ctl"><button data-life class="lifebtn ${G.life ? 'on' : ''}" aria-pressed="${G.life}" title="${tx('Living board')}" aria-label="${tx('Living board')}">${glyph('wool', 18)}</button><button data-zoom="in" aria-label="${tx('Zoom in')}">+</button><button data-zoom="out" aria-label="${tx('Zoom out')}">−</button><button data-zoom="reset" class="rs" aria-label="${tx('Show the whole board')}">⤢</button></div>
      </div>
      <div class="hand-host"></div>
    </div>
    <div class="game-side">
      <div class="players-host"></div>
      <div class="imp-host"></div>
      <div class="panel feed">
        <div class="tabbar">
          <button data-tab="chat" class="on">${tx('Chat')}<i class="unread" hidden></i></button>
          <button data-tab="log">${tx('Game log')}</button>
          <button data-tab="graphs">${tx('Stats')}</button>
          <button data-tab="rules" class="tab-costs" title="${tx('Costs')}" aria-label="${tx('Costs')}">${glyph('card', 16)}</button>
        </div>
        <div class="feed-body"></div>
        <form class="chat-form"><input class="input" name="t" maxlength="300" placeholder="${tx('Message')}" autocomplete="off" enterkeyhint="send"><button class="btn small dark">${tx('Send')}</button></form>
      </div>
    </div>
  </div>`;
  const wrap = app.querySelector('.board-wrap');
  G.zoomer = createZoom({
    host: wrap,
    getState: () => G.zoom,
    setState: z => { G.zoom = z; },
    onChange: z => wrap.querySelector('.zoom-ctl').classList.toggle('zoomed', z > 1),
  });
  G.onClick = onClick;
  app.addEventListener('click', G.onClick);
  const cf = app.querySelector('.chat-form');
  cf.addEventListener('submit', e => { e.preventDefault(); const tt = cf.t.value.trim(); if (tt) { send({ type: 'chat', text: tt }); cf.t.value = ''; } });
  if (!G.view) cf.hidden = true;

  const off = onWs(msg => {
    if (msg.t === 'state' && msg.game === G?.id) {
      const prev = G.view;
      G.view = msg.state; G.online = msg.online || [];
      if (!prev) { sea().focusOnLand(); setTimeout(tutNudge, 1500); }
      const d = diff(prev, G.view);
      G.fresh = d.fresh;
      const release = holdRolls(prev, d.events);
      onNewState(prev);
      render();
      G.fresh = null; // animate new pieces only once
      play(d.events, G.view, pname);
      if (release) afterFx(release);
    }
  });
  wsWatch(id);
  const key = e => { if (e.key === 'Escape' && G?.pick) { G.pick = null; render(); } };
  document.addEventListener('keydown', key);
  const vis = () => { if (!document.hidden) document.title = 'Broch'; };
  document.addEventListener('visibilitychange', vis);
  let rz = 0;
  const resize = () => { clearTimeout(rz); rz = setTimeout(() => { if (G && G.tab === 'graphs') { G.html.feed = null; renderFeed(); } }, 200); };
  window.addEventListener('resize', resize);
  return () => {
    off(); app.removeEventListener('click', G?.onClick || onClick);
    G?.zoomer?.destroy();
    document.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', vis); window.removeEventListener('resize', resize);
  };
}
// first game of a mode on this device: offer the 1-minute tutorial (once, dismissable)
function tutNudge() {
  if (!G || !G.view) return;
  const v = G.view;
  const id = tutorialFor(v);
  let gone = [];
  try { gone = JSON.parse(localStorage.getItem('broch_tut_nudged') || '[]'); } catch { /* storage blocked */ }
  if (tutorialSeen(id) || gone.includes(id) || v.phase === 'over') return;
  const wrap = G.app.querySelector('.board-wrap');
  if (!wrap || wrap.querySelector('.tut-nudge')) return;
  const el = document.createElement('div');
  el.className = 'tut-nudge';
  el.innerHTML = `<button class="tn-go">▶ ${tx('How {mode} works (1 min)', { mode: modeLabel(v) })}</button><button class="tn-x" aria-label="${tx('Close')}">✕</button>`;
  const remember = () => { try { if (!gone.includes(id)) gone.push(id); localStorage.setItem('broch_tut_nudged', JSON.stringify(gone)); } catch { /* storage blocked */ } el.remove(); };
  setTimeout(() => { if (el.isConnected) { el.classList.add('out'); setTimeout(remember, 400); } }, 15000); // offered once, then it gets out of the way
  el.querySelector('.tn-go').onclick = e => { e.stopPropagation(); remember(); openTutorial(id); };
  el.querySelector('.tn-x').onclick = e => { e.stopPropagation(); remember(); };
  wrap.appendChild(el);
}
function lifePref() {
  try { const v = localStorage.getItem('broch_life'); if (v != null) return v === '1'; } catch { /* storage blocked */ }
  return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function toggleLife() {
  G.life = !G.life;
  try { localStorage.setItem('broch_life', G.life ? '1' : '0'); } catch { /* storage blocked */ }
  const b = G.app.querySelector('[data-life]');
  if (b) { b.classList.toggle('on', G.life); b.setAttribute('aria-pressed', G.life); }
  toast(G.life ? t('Living board: on') : t('Living board: off'));
  G.boardKey = null; renderBoardPart();
}

export function unmountGame() {
  if (!G) return;
  G.zoomer?.destroy();
  closeVictory();
  closeTutorial();
  wsWatch(null); G = null; closeModals(); document.title = 'Broch';
}
export function rerenderGame() { if (G && G.view) { G.html = {}; G.boardKey = null; render(); } }

async function send(action) {
  try { await wsAct(G.id, action); sfx.click(); return true; } catch (e) {
    if (e.internal) reportProblem('The game server hit an error while handling your move', `${e.message}\nAction: ${JSON.stringify(action)}`);
    else {
      sfx.error();
      toast(htmlToText(tf(e.message, e.params || {})), 'warn');
      const st = document.querySelector('.status'); if (st) { st.classList.remove('fx-nudge'); void st.offsetWidth; st.classList.add('fx-nudge'); }
    }
    return false;
  }
}
const htmlToText = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; };

function onNewState(prev) {
  const v = G.view;
  if (v.lastSteal && v.lastSteal.at !== G.lastStealAt) {
    G.lastStealAt = v.lastSteal.at;
    if (prev) {
      const s = v.lastSteal;
      if (s.by === v.me) toast(t('You stole 1 {res} from {name}.', { res: resName(s.card), name: v.players[s.from].name }));
      else if (s.from === v.me) toast(t('{name} stole 1 {res} from you.', { res: resName(s.card), name: v.players[s.by].name }), 'warn');
    }
  }
  // chat: count what arrived while the chat was not on screen, and ping if it is out of sight
  const lastAt = v.chat.length ? v.chat[v.chat.length - 1].at || 0 : 0;
  if (!prev) G.chatSeenAt = lastAt;
  else {
    const fresh = v.chat.filter(c => (c.at || 0) > (G.lastChatAt || 0) && c.p !== v.me);
    if (fresh.length) {
      const seen = G.tab === 'chat' && feedVisible();
      if (!seen) { const c = fresh[fresh.length - 1]; toast(`💬 ${v.players[c.p].name}: ${c.text.length > 80 ? c.text.slice(0, 80) + '…' : c.text}`); sfx.loot(); }
    }
  }
  G.lastChatAt = lastAt;
  if (G.tab === 'chat' && feedVisible()) G.chatSeenAt = lastAt;
  if (G.pick && G.pick.version !== undefined && G.pick.version !== v.version) G.pick = null;
  if (needsMe(v) && document.hidden) document.title = `● ${t('Your move')} · Broch`;
  // a beep whenever the move passes to me (not only at the dice), and when someone answers my trade with a counter-offer
  if (prev && prev.phase !== 'over' && !needsMe(prev) && needsMe(v)) sfx.turn();
  const tr = v.trade, ptr = prev && prev.trade;
  if (tr && tr.from === v.me && tr.responses) {
    const was = ptr && ptr.id === tr.id ? ptr.responses : {};
    const who = Object.keys(tr.responses).filter(i => tr.responses[i] === 'counter' && was[i] !== 'counter');
    if (who.length) { sfx.trade(); toast(t('{name} made a counter-offer. See the trade window.', { name: v.players[who[0]].name }), 'warn'); G.counterFlash = tr.id; }
  }
  if (v.phase === 'over' && !G.celebrated) {
    G.celebrated = true;
    if (prev && prev.phase !== 'over') setTimeout(celebrateWhenCalm, 700);
  }
  G.app.querySelector('.chat-form').hidden = !isMine() || G.tab !== 'chat';
}
function feedVisible() {
  const el = G.app.querySelector('.feed-body');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 40 && r.top < innerHeight - 40;
}

// the dice statistics stay at the old numbers until the dice scene is over
function holdRolls(prev, events) {
  const g = G, v = g.view;
  if (!prev || !v.stats || !events.some(e => e.type === 'log' && (/^\{@p\} rolled \{n\}/.test(e.k) || e.k === '{@p} turned over an event card ({n}).'))) return null;
  const real = v.stats.rolls;
  v.stats = { ...v.stats, rolls: prev.stats?.rolls || real };
  return () => { if (G !== g || g.view !== v) return; v.stats = { ...v.stats, rolls: real }; g.html.feed = null; renderFeed(); };
}

function needsMe(v) {
  if (v.phase === 'setup') return v.current === v.me;
  if (v.phase !== 'play') return false;
  if (v.pending.length) return v.pending.some(p => p.group === v.activeGroup && p.player === v.me);
  if (v.step === 'sbp') return v.sbp?.queue[0] === v.me;
  return v.current === v.me;
}

// ------------------------------------------------------------ helpers
const me = () => G.view.players[G.view.me];
const isMine = () => G.view.me >= 0;
function pname(p) {
  const pl = G?.view?.players[p];
  if (!pl) return '?';
  return `<span class="pn" style="color:${isLightColor(pl.color) ? '#8A6A2E' : PCOLOR[pl.color]}">${esc(pl.name)}</span>`;
}
const myPending = () => G.view.pending.filter(p => p.group === G.view.activeGroup && p.player === G.view.me);
const has = cost => { const m = me(); return m && Object.entries(cost).every(([k, n]) => (k === 'gold' ? m.gold : (m.res && m.res[k]) ?? (m.comm && m.comm[k]) ?? 0) >= n); };
// The games that sit on top of this screen keep their own questions, dialogs, chips and texts: Traders & Barbarians in
// games/traders-barbarians/hub.js, Cities & Knights in games/knights/ui.js, Seafarers in games/seafarers/ui.js. They get
// this bundle of helpers once and call back into the screen through it.
let CTX = null, HUB = null, KN = null, SEA = null;
const ctx = () => CTX || (CTX = { get G() { return G; }, send, startPick, render, me, pname, cardPicker, choiceDialog, resChoices, toast, isMine, myPending, cardsHtml, chipIcon, nameSpan });
const hub = () => HUB || (HUB = createHub(ctx()));
const kn = () => KN || (KN = createKnights(ctx()));
const sea = () => SEA || (SEA = createSeafarers(ctx()));
const isHub = v => v.expansion === 'traders';
const costHtml = cost => Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('');
const cardsHtml = cards => Object.entries(cards).filter(([, n]) => n > 0).map(([k, n]) => `<span class="mini" style="background:${CARD_COLOR[k]}">${n} ${esc(resName(k))}</span>`).join(' ');
const tx = (k, p) => esc(t(k, p));

// ------------------------------------------------------------ status line
function statusInfo() {
  const v = G.view;
  const mine = needsMe(v);
  if (v.phase === 'over') return { msg: t('{name} wins!', { name: pname(v.winner) }), sub: tx('The result is saved to the stats page.'), btns: `<button class="btn gold" data-do="celebrate">${tx('Celebrate')}</button><a class="btn" href="#/stats">${tx('Stats')}</a>` };
  if (G.pick) return { msg: esc(G.pick.label), sub: esc(G.pick.sub || ''), mine: true, btns: `${G.pick.extra || ''}<button class="btn" data-do="cancelPick">${tx('Cancel')}</button>` };
  if (v.phase === 'setup') {
    if (mine) {
      const msg = v.setup.need === 'road' ? (v.legal?.setupShips?.length ? t('Place a road or a ship next to it.') : t('Place a road next to it.')) : v.setup.need === 'city' ? t('Place your city.') : v.setup.round === 1 ? t('Place your first settlement.') : v.setup.round === 2 ? t('Place your second settlement.') : t('Place your third settlement.');
      const pays = v.setup.need !== 'road' && (v.options.startBoth || v.setup.need === 'city' || v.setup.pays);
      return { msg: esc(msg), sub: v.setup.need === 'road' ? tx('Tap a glowing edge.') : tx(pays ? 'Tap a glowing corner. Buildings need at least one empty corner between them. This one pays 1 card for each tile around it.' : 'Tap a glowing corner. Buildings need at least one empty corner between them.'), mine };
    }
    return { msg: v.setup.need === 'road' ? t('{name} is placing a road…', { name: pname(v.current) }) : t('{name} is placing a building…', { name: pname(v.current) }) };
  }
  const pend = v.pending.filter(p => p.group === v.activeGroup);
  if (pend.length) {
    const mp = myPending()[0];
    if (mp) {
      const hs = isHub(v) ? hub().status(mp) : null;
      if (hs) return hs;
      const T = {
        discard: [t('Discard {n} cards.', { n: mp.count }), t('You hold more than your hand limit.'), t('Choose cards')],
        give: [t('Give {name} {n} cards.', { name: v.players[mp.to]?.name, n: mp.count }), t('Wedding gift: you choose which cards.'), t('Choose cards')],
        moveRobber: [mp.bishop ? t('Move the robber (Bishop).') : isSea(v) ? t('Move the robber or the pirate.') : t('Move the robber.'), isSea(v) ? t('Tap a land tile for the robber or a sea tile for the pirate. You steal from a player next to it.') : t('Tap a tile. You steal from a player with a building there.')],
        steal: [t('Choose who to steal from.'), '', t('Choose')],
        ...sea().pendingTexts(mp),
        ...kn().pendingTexts(mp, v),
      }[mp.type] || [t('Make your choice.'), ''];
      const rr = mp.type === 'moveRobber' && v.legal?.leaveRobber && v.step === 'main';
      return { msg: esc(T[0]), sub: esc(rr ? t('House rule: if you end your turn now, the robber goes back to the desert.') : T[1]), mine: true, btns: `${T[2] ? `<button class="btn primary" data-do="pendingDialog">${esc(T[2])}</button>` : ''}${kn().statusBtns(mp)}${sea().statusBtns(mp, v)}${rr ? `<button class="btn" data-do="forgetRobber">${tx('End turn')}</button>` : ''}` };
    }
    const who = [...new Set(pend.map(p => p.player))].map(pname).join(', ');
    const W = {
      discard: 'Waiting for {names} to discard…', moveRobber: 'Waiting for {names} to move the robber…', steal: 'Waiting for {names} to steal…',
      give: 'Waiting for {names} to give cards…',
      ...kn().WAIT, ...sea().WAIT,
    }[pend[0].type] || (isHub(v) && hub().waiting(pend[0].type)) || 'Waiting for {names} to decide…';
    return { msg: t(W, { names: who }) };
  }
  if (v.step === 'sbp') {
    const p = v.sbp.queue[0];
    return p === v.me ? { msg: tx('Special building phase.'), sub: tx('You may build or buy now. No trading.'), mine: true, btns: `<button class="btn primary" data-do="endSbp">${tx('Done')}</button>` }
      : { msg: t('{name} is in the special building phase…', { name: pname(p) }) };
  }
  if (v.current !== v.me) return { msg: v.step === 'roll' ? t('Waiting for {name} to roll…', { name: pname(v.current) }) : v.flags.stone2 ? t('{name} has stone 2 and is taking their turn.', { name: pname(v.current) }) : t('{name} is taking their turn.', { name: pname(v.current) }) };
  if (v.step === 'roll') {
    const knightReady = v.mode === 'classic' && me().dev?.some(d => d.type !== 'victoryPoint' && !d.fresh);
    return { msg: tx('Your turn. Roll the dice.'), sub: knightReady ? tx('You can play a development card before rolling.') : '', mine: true, btns: `<button class="btn primary roll-btn" data-do="roll">🎲 ${tx('Roll dice')}</button>` };
  }
  if (v.free.roads > 0) return { msg: esc(t(isSea(v) ? 'Place free roads or ships: {n}.' : 'Place free roads: {n}.', { n: v.free.roads })), sub: tx('Tap a glowing edge.'), mine: true, btns: `<button class="btn" data-do="skipFree">${tx('Skip')}</button>` };
  const shipHint = sea().shipHint(v.legal || {});
  const stone2 = v.flags.stone2;
  return { msg: stone2 ? tx('Your turn with stone 2.') : tx('Build, trade or end your turn.'), sub: v.free.promotes ? tx('Free promotions left: {n} (tap a knight).', { n: v.free.promotes }) : stone2 ? tx('No dice. Trade with the bank only.') : shipHint, mine: true, btns: `${stone2 ? '' : `<button class="btn" data-do="trade">${tx('Trade')}</button>`}<button class="btn" data-do="bank" title="${tx('Trade with the bank')}">${glyph('bank', 15)}${tx('Bank')}</button><button class="btn primary" data-do="endTurn">${tx('End turn')}</button>` };
}


function diceHtml() {
  const d = G.view.dice;
  if (!d) return '';
  if (d.card) return `<div class="dice card">${hub().diceCard(d)}${kn().eventDie(d)}<b class="dsum ${d.total === 7 ? 'seven' : ''}">${d.total}</b></div>`;
  return `<div class="dice" title="${esc(t('Rolled {n}', { n: d.total }))}">
    ${dieHtml(d.red, 'red')}${dieHtml(d.yellow, 'yellow')}
    ${kn().eventDie(d)}
    <b class="dsum ${d.total === 7 ? 'seven' : ''}">${d.total}</b>
  </div>`;
}

// ------------------------------------------------------------ board targets
function targets() {
  const v = G.view, L = v.legal || {};
  if (v.phase === 'over' || !isMine()) return {};
  if (G.pick) return { [G.pick.kind]: G.pick.options, picked: G.pick.picked, pickedKnight: G.pick.pickedKnight };
  if (isHub(v)) { const ht = hub().targets(); if (ht) return ht; }
  if (L.setupSpots) return { vertices: L.setupSpots };
  if (L.setupRoads) return { edges: [...new Set([...L.setupRoads, ...(L.setupShips || [])])] };
  const st = sea().targets(L);
  if (st) return st;
  if (L.robberHexes) return { hexes: L.robberHexes };
  const kt = kn().targets(L);
  if (kt) return kt;
  const tg = {};
  if (v.free.roads > 0 && v.current === v.me && L.roads) tg.edges = [...new Set([...L.roads, ...(L.ships || [])])];
  const ok = kn().ownKnights(L);
  if (ok) tg.ownKnights = ok;
  const os = sea().ownShips(L);
  if (os) tg.ownShips = os;
  return tg;
}

function onBoardClick(e) {
  const el = e.target.closest('[data-v],[data-e],[data-h],[data-k],[data-s],[data-hub]');
  if (!el) return;
  const v = G.view, L = v.legal || {};
  const id = +(el.dataset.v ?? el.dataset.e ?? el.dataset.h ?? el.dataset.k ?? el.dataset.s);
  if (G.pick) { G.pick.onPick(id); return; }
  if (isHub(v) && hub().boardClick(el, id)) return;
  if (kn().knightClick(el, id, L)) return;
  if (el.dataset.s != null) return sea().shipMenu(id);
  if (L.setupSpots) return send({ type: v.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: id });
  if (L.setupRoads) return sea().roadOrShip(id, L.setupRoads, L.setupShips, e => send({ type: 'placeRoad', e }), e => send({ type: 'placeShip', e }));
  if (L.harborSpots) return sea().harborClick(id);
  if (L.robberHexes) return send({ type: 'moveRobber', hex: id });
  if (kn().cornerClick(id, L)) return;
  if (el.dataset.e != null && v.free.roads > 0) return sea().roadOrShip(id, L.roads, L.ships, e => send({ type: 'buildRoad', e }), e => send({ type: 'buildShip', e }));
}

function startPick(kind, options, label, onPick, extra = {}) {
  if (!options || !options.length) { toast(t('There is nowhere to do that right now.'), 'warn'); return; }
  G.pick = { kind, options, label, onPick: async id => { const keep = await onPick(id); if (!keep) { G.pick = null; render(); } }, version: G.view.version, ...extra };
  render();
  document.querySelector('.board-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ------------------------------------------------------------ render
const setHtml = (el, key, html) => { if (!el || G.html[key] === html) return false; el.innerHTML = html; G.html[key] = html; return true; };

function render() {
  if (!G || !G.view) return;
  renderStatus();
  renderBoardPart();
  setHtml(G.app.querySelector('.hud-host'), 'hud', hudHtml());
  renderTrade();
  setHtml(G.app.querySelector('.hand-host'), 'hand', isMine() ? handHtml() : `<div class="hand watching"><b>${tx('You are watching this game.')}</b></div>`);
  setHtml(G.app.querySelector('.players-host'), 'players', playersHtml());
  if (setHtml(G.app.querySelector('.imp-host'), 'imp', G.view.mode === 'knights' ? kn().improveHtml() : '')) kn().animateImprovements();
  renderFeed();
  autoDialogs();
  kn().aqueductPrompt();
  syncLoops(G.app);
}

// Endless animations (the living board, waves, pulsing buttons) all run on one clock. Without this, every redraw
// after a move would restart them at frame 0: the sheep jump back, the woodcutter starts over, every turn.
// Pinning their start to the document's time zero makes a redrawn element continue exactly where the old one was.
function syncLoops(root) {
  if (!root || !root.getAnimations) return;
  let list;
  try { list = root.getAnimations({ subtree: true }); } catch { return; }
  for (const a of list) {
    if (a.startTime === 0) continue;
    const tm = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming();
    if (!tm || tm.iterations !== Infinity) continue; // one-shot effects (a new road, a dice roll) play from the start
    try { a.startTime = 0; } catch { /* very old engines: leave it */ }
  }
}

function renderStatus() {
  const el = G.app.querySelector('.status');
  const st = statusInfo();
  const cls = `status ${st.mine ? 'mine' : ''}`;
  if (el.className !== cls) el.className = cls;
  setHtml(el, 'status', `<div class="msg"><span class="mt">${st.msg}</span>${st.sub ? `<span class="sub">${st.sub}</span>` : ''}</div>
    <div class="dice-slot">${diceHtml()}</div><div class="btns">${st.btns || ''}</div>`);
}

// a cheap fingerprint of everything drawn on the board
function boardKey(tg) {
  const v = G.view;
  if (v.board !== G.boardRef) { G.boardRef = v.board; const sig = JSON.stringify(v.board.hexes); if (sig !== G.boardSig) { G.boardSig = sig; G.boardGen = (G.boardGen || 0) + 1; } }
  return JSON.stringify([G.boardGen, v.buildings, v.roads, v.knights, v.ships, v.bridges, v.robber, v.pirate, v.merchant, v.lairs, v.islandBonus, v.gifts, v.dynPorts, v.villages, v.longestRoad, v.mode === 'knights' ? null : v.largestArmy && v.largestArmy.p, v.fish && v.fish.boot, v.hub, v.players.map(p => p.color), tg, lang(), G.life]);
}
function renderBoardPart() {
  const host = G.app.querySelector('.board-host');
  const tg = targets();
  const key = boardKey(tg);
  const fr = G.fresh;
  const freshAny = fr && (fr.verts.size || fr.edges.size || fr.knights.size || fr.ships.size || fr.hexes.size || fr.robber || fr.pirate || fr.merchant);
  if (key === G.boardKey && !freshAny) return;
  G.boardKey = key;
  host.innerHTML = renderBoard(G.view, tg, G.fresh, G.zoom, G.life, true, hubExt(G.view));
  G.zoomer.apply();
  syncLoops(host);
  if (freshAny) {
    clearTimeout(G.fxClean);
    G.fxClean = setTimeout(() => host.querySelectorAll('.fx-flash,.fx-roadglow,.fx-light,.fx-dust,.fx-splash').forEach(el => el.remove()), 2600);
  }
}

function hudHtml() {
  const v = G.view;
  const bits = [];
  if (v.mode === 'knights' && v.barbarian) bits.push(...kn().hud(v));
  else if (v.mode !== 'knights' && v.hub?.scenario !== 'barbarians') bits.push(`<span class="hud-pill devdeck" title="${tx('Development cards left: {n}', { n: v.devDeck })}"><i class="stk dev"></i>${v.devDeck}</span>`);
  if (isHub(v)) bits.push(hub().hud(v));
  if (v.deckLeft != null) bits.push(`<span class="hud-pill" title="${tx('Event cards left before the deck is reshuffled')}">🂠 ${v.deckLeft}</span>`);
  return `<div class="board-hud">${bits.join('')}</div>`;
}

const chipIcon = (name, bg) => `<span class="ic" style="background:${bg}">${glyph(name, 13)}</span>`;

// ------------------------------------------------------------ your hand
const DEV_ORDER = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'goodTrip', 'victoryPoint'];
// font size for a card name in a tile (~110px for text): long single words get smaller instead of breaking mid-word
const nameSize = name => { const w = Math.max(...String(name).split(/[\s-]+/).map(x => x.length)); return w <= 12 ? 11.5 : w <= 15 ? 10.5 : w <= 18 ? 9.3 : 8.3; };
const nameSpan = name => `<span class="dc-nm" style="font-size:${nameSize(name)}px">${esc(name)}</span>`;
function handHtml() {
  const v = G.view, m = me(), L = v.legal || {};
  const knights = v.mode === 'knights';
  const card = k => {
    const n = (RES.includes(k) ? m.res[k] : m.comm[k]) || 0;
    return `<div class="rcard ${n ? '' : 'zero'} ${COMM.includes(k) ? 'comm' : ''}" data-card="${k}" style="--c:${CARD_COLOR[k]}" title="${esc(resName(k))}: ${n}">${glyph(k, 26)}<span class="nm">${esc(resName(k))}</span>${n ? `<span class="n">${n}</span>` : ''}</div>`;
  };
  const actor = (v.step === 'main' && v.current === v.me) || (v.step === 'sbp' && v.sbp?.queue[0] === v.me);
  const free = !v.pending.length && v.phase === 'play' && actor;
  const mainTurn = free && v.step === 'main' && v.current === v.me;
  // tokens that are not cards: fish, gold, cargo
  const tok = (key, n, label, color, action, live) => `<button class="tcard ${n ? '' : 'zero'} ${live ? 'live' : ''}" ${action ? `data-do="${action}"` : 'disabled'} data-card="${key}" style="--c:${color}" title="${esc(label)}: ${n}"><span class="coin">${glyph(key, 20)}</span><span class="nm">${esc(label)}</span>${n ? `<span class="n">${n}</span>` : ''}</button>`;
  const tokens = [];
  if (isHub(v)) hub().tokenList(v, m, mainTurn, L).forEach(x => tokens.push(tok(x.key, x.n, x.label, x.color, x.action, x.live)));
  const pickOn = k => G.pick && G.pick.key === k ? 'on' : '';
  const btn = (key, label, icon, cost, enabled, left = null) => `<button class="act ${pickOn(key)}" data-do="${key}" ${enabled ? '' : 'disabled'} title="${esc(label)}"><span class="nm"><i class="ai">${glyph(icon, 14)}</i>${esc(label)}</span><small><span class="cd">${costHtml(cost)}</span>${left != null ? `<span class="left">${left}</span>` : ''}</small></button>`;
  const plain = (key, label, icon, sub, enabled) => `<button class="act" data-do="${key}" ${enabled ? '' : 'disabled'} title="${esc(label)}"><span class="nm"><i class="ai">${glyph(icon, 14)}</i>${esc(label)}</span><small>${esc(sub)}</small></button>`;
  let acts = '';
  acts += btn('road', t('Road'), 'road', COSTS.road, free && L.roads?.length > 0 && !(v.free.roads > 0), m.pieces.roads);
  if (isSea(v)) acts += sea().shipButton(btn, free, L, m);
  if (v.rivers) acts += hub().bridgeButton(btn, free, L, m);
  acts += btn('settlement', t('Settlement'), 'settlement', COSTS.settlement, free && L.settlements?.length > 0, m.pieces.settlements);
  acts += sea().wondersButton(plain, v);
  acts += btn('city', t('City'), 'city', COSTS.city, free && L.cities?.length > 0, m.pieces.cities);
  if (knights) acts += kn().buttons(btn, free, L, m);
  acts += plain('bank', t('Bank trade'), 'bank', t('4:1 or better'), mainTurn);
  if (isHub(v)) acts += hub().actions(v, m, L, { free, mainTurn, plain });

  // development / progress cards as real little cards
  let cardsRow;
  if (!knights) {
    const groups = {};
    (m.dev || []).forEach(d => { const g = groups[d.type] ||= { n: 0, ready: 0 }; g.n++; if (!d.fresh) g.ready++; });
    const canPlayNow = v.current === v.me && v.phase === 'play' && v.step !== 'sbp' && !v.pending.length;
    const dcs = DEV_ORDER.filter(ty => groups[ty]).map(ty => {
      const g = groups[ty];
      const vpCard = ty === 'victoryPoint';
      const ready = g.ready > 0 && !vpCard;
      // one development card per turn, before or after rolling (house rule: knights do not count)
      const playable = ready && canPlayNow && (v.step === 'roll' || v.step === 'main') && !(v.flags.devPlayed && !(ty === 'knight' && v.options.knightsFree));
      const fresh = !vpCard && g.ready === 0;
      return `<button class="dcard ${vpCard ? 'vp' : ''} ${playable ? 'ready' : ''} ${fresh ? 'fresh' : ''}" data-dev="${ty}" title="${esc(cardName(ty))}">
        <span class="dc-ic">${glyph(ty, 17)}</span>${nameSpan(cardName(ty))}${g.n > 1 ? `<span class="n">${g.n}</span>` : ''}${fresh ? `<i class="dc-new">${tx('new')}</i>` : ''}</button>`;
    }).join('');
    const buy = `<button class="dcard buy" data-do="buyDev" ${free && L.canBuyDev ? '' : 'disabled'} title="${tx('Dev card')}"><span class="dc-plus">+</span><span class="dc-nm" style="font-size:10.5px">${tx('Dev card')}</span><span class="dc-cost">${costHtml(COSTS.dev)}</span></button>`;
    cardsRow = `<div class="devrow"><span class="lbl">${tx('Development cards')}<b>${(m.dev || []).length}</b></span><div class="dcards">${dcs}${buy}</div></div>`;
  } else {
    cardsRow = kn().cardsRow(m);
  }
  const chips = [];
  if (isHub(v)) chips.push(...hub().chips(v, m));
  if (isSea(v)) chips.push(sea().shipChip(m));
  const over = m.cards > m.handLimit;
  return `<div class="hand">
    <div class="hand-head"><b>${tx('Your hand')}</b><span class="hand-count ${over ? 'warn' : ''}" title="${over ? tx('More than {n} cards: a 7 costs you half of them.', { n: m.handLimit }) : ''}">${tx('Cards: {n} · limit {m}', { n: m.cards, m: m.handLimit })}</span></div>
    <div class="hand-cards">${[...RES, ...(knights ? COMM : [])].map(card).join('')}${tokens.length ? `<span class="hc-sep"></span>${tokens.join('')}` : ''}</div>
    <div class="actions">${acts}</div>
    ${cardsRow}
    ${chips.length ? `<div class="stat-strip">${chips.join('')}</div>` : ''}
  </div>`;
}

// ------------------------------------------------------------ players
function playersHtml() {
  const v = G.view;
  const rows = v.players.map((p, i) => {
    const online = G.online.includes(p.userId);
    const target = p.vpTarget || v.options.vpTarget;
    const pct = Math.max(0, Math.min(100, Math.round(p.vp / target * 100)));
    const ring = isLightColor(p.color) ? PCOLOR_DARK[p.color] : PCOLOR[p.color];
    const awards = [];
    if (v.longestRoad.p === i) awards.push(`<span class="award" title="${tx(isSea(v) ? 'Longest Trade Route' : 'Longest Road')} (+2)">${glyph('road', 11)}${v.longestRoad.len}</span>`);
    if (v.largestArmy?.p === i && v.mode === 'classic') awards.push(`<span class="award" title="${tx('Largest Army')} (+2)">${glyph('sword', 11)}${v.largestArmy.count}</span>`);
    if (p.defender) awards.push(`<span class="award def" title="${tx('Defender of Broch')} (+${p.defender})">♛${p.defender > 1 ? ' ' + p.defender : ''}</span>`);
    // 5–6 players: who holds which stone (stone 1 moves on as soon as its turn is over, stone 2 stays until its own turn is over)
    if (v.pair) {
      const one = v.pair.phase === 1 ? v.pair.one : (v.pair.one + 1) % v.players.length;
      if (i === one) awards.push(`<span class="award stone" title="${tx('Stone 1: rolls the dice, trades with everybody, builds')}">①</span>`);
      if (i === v.pair.two) awards.push(`<span class="award stone" title="${tx('Stone 2: no dice, trades with the bank only, builds')}">②</span>`);
    }
    const meta = [];
    const over = p.cards > (p.handLimit || 7);
    meta.push(`<span class="mp ${over ? 'warn' : ''}" title="${tx('Cards: {n}', { n: p.cards })}${over ? ' · ' + tx('More than {n} cards: a 7 costs you half of them.', { n: p.handLimit }) : ''}"><i class="stk res"></i>${p.cards}</span>`);
    if (v.mode === 'classic') {
      meta.push(`<span class="mp" title="${tx('Development cards')}: ${p.devCount}"><i class="stk dev"></i>${p.devCount}</span>`);
      if (p.knightsPlayed) meta.push(`<span class="mp" title="${tx('Knights: {n}', { n: p.knightsPlayed })}">${glyph('knight', 12)}${p.knightsPlayed}</span>`);
    } else meta.push(...kn().playerMeta(v, p, i));
    if (isHub(v)) meta.push(hub().playerMeta(v, p, i));
    meta.push(...sea().playerMeta(v, p, i));
    return `<div class="player ${i === v.current && v.phase !== 'over' ? 'cur' : ''} ${i === v.me ? 'me' : ''}" data-seat="${i}">
      ${houseIcon(p.color, 22)}
      <div class="pbody"><div class="nm">${flag(p.country)} <span class="nmt">${esc(p.name)}</span>${i === v.me ? ` <span class="muted" style="font-weight:400">(${tx('you')})</span>` : ''} <span class="online-dot ${online ? 'on' : ''}" title="${online ? tx('Online') : tx('Offline')}"></span>${awards.join('')}</div>
      <div class="meta">${meta.join('')}</div></div>
      <div class="vpr" style="--p:${pct};--c:${ring}" title="${tx('Points: {n}', { n: p.vp })} / ${target}"><span><b>${p.vp}</b><small>/${target}</small></span></div>
    </div>`;
  }).join('');
  return `<div class="panel"><div class="panel-h"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tx('Players')}</span><span class="spacer"></span><span style="white-space:nowrap">${esc(modeLabel(v))} · ${tx('turn {n}', { n: v.turn })}</span></div>${rows}</div>`;
}

// The offer panel is created once per offer; later answers only swap the text inside it, so the window never
// redraws, re-slides or flickers when somebody declines.
function renderTrade() {
  const host = G.app.querySelector('.trade-host');
  if (!host) return;
  const html = tradeHtml();
  if (G.html.trade === html) return;
  const cur = host.querySelector('.board-trade');
  const tid = G.view.trade && G.view.trade.id;
  if (cur && html && cur.dataset.tid === String(tid)) {
    const next = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').querySelector('.board-trade');
    cur.querySelector('.trade-box').innerHTML = next.querySelector('.trade-box').innerHTML;
    cur.classList.toggle('trade-out', next.classList.contains('trade-out'));
    G.html.trade = html;
    return;
  }
  setHtml(host, 'trade', html);
}

function tradeHtml() {
  const v = G.view, tr = v.trade;
  if (!tr || G.tradeGone === tr.id) return '';
  // everybody said no: the offer fades out by itself (see the timer below)
  const allNo = v.players.every((p, i) => i === tr.from || tr.responses[i] === 'reject');
  if (allNo && G.tradeFading !== tr.id) {
    G.tradeFading = tr.id;
    setTimeout(() => { if (G && G.view) { G.tradeGone = tr.id; render(); } }, 2000);
  }
  const mineOffer = tr.from === v.me;
  let body = `<div class="trade-line">${t('{name} gives', { name: pname(tr.from) })} ${cardsHtml(tr.give)}</div><div class="trade-line" style="margin-top:4px">${tx('and wants')} ${cardsHtml(tr.get)}</div>`;
  if (mineOffer) {
    const rows = v.players.map((p, i) => i === v.me ? '' : `<div class="row" style="margin-top:6px"><span class="spacer">${pname(i)}</span>${tr.responses[i] === 'accept' ? `<button class="btn small gold" data-confirm="${i}">${tx('Trade with {name}', { name: p.name })}</button>` : tr.responses[i] === 'counter' && tr.counters && tr.counters[i] ? `<div class="trade-counter" style="flex:1 1 100%"><div class="trade-line">${tx('Counter-offer: you give')} ${cardsHtml(tr.counters[i].give)}</div><div class="trade-line" style="margin-top:4px">${tx('and get')} ${cardsHtml(tr.counters[i].get)}</div><button class="btn small gold" style="margin-top:6px" data-confirm="${i}">${tx('Accept the counter-offer of {name}', { name: p.name })}</button></div>` : `<span class="muted" style="font-size:13px">${tr.responses[i] === 'reject' ? tx('Declined') : tx('Thinking…')}</span>`}</div>`).join('');
    body += rows + `<div class="row" style="margin-top:10px"><button class="btn small" data-do="cancelTrade">${tx('Withdraw offer')}</button></div>`;
  } else if (isMine()) {
    const r = tr.responses[v.me];
    const can = has(tr.get);
    body += r ? `<div class="muted" style="margin-top:8px;font-size:13px">${r === 'accept' ? tx('You accepted. Waiting for them to confirm.') : r === 'counter' ? tx('You made a counter-offer. Waiting for them to confirm.') : tx('You declined.')}</div>`
      : `<div class="row" style="margin-top:10px"><button class="btn small gold" data-respond="1" ${can ? '' : 'disabled'}>${tx('Accept')}</button><button class="btn small" data-counter="1">${tx('Counter-offer')}</button><button class="btn small" data-respond="0">${tx('Decline')}</button>${can ? '' : `<span class="muted" style="font-size:12px">${tx('You lack the cards.')}</span>`}</div>`;
  }
  // slide in once per offer; later answers only change the text (a fresh slide on every answer looked like a new window)
  const first = G.tradeSeen !== tr.id;
  G.tradeSeen = tr.id;
  return `<div class="board-trade ${first ? 'fx-slide' : ''} ${allNo ? 'trade-out' : ''}" data-tid="${tr.id}"><div class="panel-h">${tx('Trade offer')}</div><div class="trade-box">${body}</div></div>`;
}


// ------------------------------------------------------------ feed: chat (default), history, graphs
function renderFeed() {
  const v = G.view;
  const body = G.app.querySelector('.feed-body');
  const tabs = G.app.querySelectorAll('.feed .tabbar [data-tab]');
  tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === G.tab));
  if (G.tab === 'chat' && feedVisible()) G.chatSeenAt = v.chat.length ? v.chat[v.chat.length - 1].at || 0 : 0;
  const unread = v.chat.filter(c => (c.at || 0) > G.chatSeenAt && c.p !== v.me).length;
  const u = G.app.querySelector('.feed .unread');
  if (u) { u.hidden = !unread; u.textContent = unread > 9 ? '9+' : unread; }
  G.app.querySelector('.chat-form').hidden = !isMine() || G.tab !== 'chat';
  // charts animate when the tab is opened, not on every update while you look at them
  body.className = `feed-body ${G.tab}${G.tab === 'graphs' && G.html.feedTab !== 'graphs' ? ' anim' : ''}`;
  let html;
  if (G.tab === 'chat') html = chatHtml(v, pname);
  else if (G.tab === 'log') html = historyHtml(v, pname);
  else html = graphsHtml(v, body.clientWidth - 24);
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 30;
  if (!setHtml(body, 'feed', html)) return;
  if (G.tab === 'chat') { if (atBottom || G.html.feedTab !== 'chat') body.scrollTop = body.scrollHeight; }
  else if (G.tab === 'log') {
    if (G.html.feedTab !== 'log') body.scrollTop = 0;
    const newest = body.querySelector('.turn-card.newest');
    const key = newest ? newest.dataset.turn : null; // slide in only when a new turn appears
    if (newest && G.newestTurn && G.newestTurn !== key && G.html.feedTab === 'log') { newest.classList.add('fx-in'); }
    G.newestTurn = key;
  } else wireGraphs(body, v);
  G.html.feedTab = G.tab;
}

// ------------------------------------------------------------ clicks (one listener for the whole page)
function onClick(e) {
  if (!G || !G.view) return;
  const el = e.target;
  if (el.closest('.board-host svg')) { if (!G.zoomer.wasDrag()) onBoardClick(e); return; }
  if (el.closest('[data-life]')) return toggleLife();
  const z = el.closest('[data-zoom]');
  if (z) { const k = z.dataset.zoom; if (k === 'reset') G.zoomer.reset(); else G.zoomer.zoomBy(k === 'in' ? 1.5 : 1 / 1.5); return; }
  const d = el.closest('[data-do]');
  if (d && !d.disabled) return doAction(d.dataset.do);
  const dv = el.closest('[data-dev]'); if (dv) return devDialog(dv.dataset.dev);
  const pg = el.closest('[data-prog]'); if (pg) return kn().progressDialog(+pg.dataset.prog);
  if (el.closest('[data-aqueduct]')) return kn().aqueductChoice();
  const im = el.closest('[data-improve]');
  if (im) return kn().improveClick(im);
  const cf = el.closest('[data-confirm]'); if (cf) return send({ type: 'confirmTrade', with: +cf.dataset.confirm });
  if (el.closest('[data-counter]')) return tradeDialog(G.view.trade);
  const rs = el.closest('[data-respond]'); if (rs && !rs.disabled) return send({ type: 'respondTrade', id: G.view.trade.id, accept: rs.dataset.respond === '1' });
  const tb = el.closest('.feed [data-tab]');
  if (tb) {
    if (tb.dataset.tab === 'rules') return costsDialog();
    G.tab = tb.dataset.tab; sfx.click();
    renderFeed();
    if (G.tab === 'chat' && matchMedia('(hover: hover)').matches) G.app.querySelector('.chat-form input')?.focus();
  }
}

function doAction(what) {
  const v = G.view, L = v.legal || {};
  switch (what) {
    case 'roll': return send({ type: 'roll' });
    case 'endTurn': return send({ type: 'endTurn' });
    case 'forgetRobber': return send({ type: 'leaveRobber', endTurn: true });
    case 'endSbp': return send({ type: 'endSpecialBuild' });
    case 'cancelPick': G.pick = null; return render();
    case 'skipFree': return send({ type: 'skipFreeRoads' });
    case 'cancelTrade': return send({ type: 'cancelTrade' });
    case 'trade': return tradeDialog();
    case 'bank': return bankDialog();
    case 'celebrate': return showCelebration();
    case 'pendingDialog': G.opened.clear(); return autoDialogs(true);
    case 'buyDev': return send({ type: 'buyDev' });
    case 'road': return togglePick('road', 'edges', L.roads, t('Tap where to build your road.'), e => send({ type: 'buildRoad', e }));
    case 'settlement': return togglePick('settlement', 'vertices', L.settlements, t('Tap where to build your settlement.'), x => send({ type: 'buildSettlement', v: x }));
    case 'city': return togglePick('city', 'vertices', L.cities, t('Tap the settlement to upgrade.'), x => send({ type: 'buildCity', v: x }));
    case 'knight': return togglePick('knight', 'vertices', L.knightSpots, t('Tap a corner next to your road for the knight.'), x => send({ type: 'buildKnight', v: x }));
    case 'wall': return togglePick('wall', 'vertices', L.walls, t('Tap the city to wall in.'), x => send({ type: 'buildWall', v: x }));
    case 'ship': return togglePick('ship', 'edges', L.ships, t('Tap the sea edge where your ship should go.'), e => send({ type: 'buildShip', e }));
    case 'bridge': return togglePick('bridge', 'edges', L.bridges, t('Tap the river crossing for your bridge.'), e => send({ type: 'buildBridge', e }));
    default:
      if (kn().action(what) || sea().action(what)) return;
      if (isHub(v)) hub().action(what);
  }
}
function togglePick(key, kind, options, label, fn) {
  if (G.pick && G.pick.key === key) { G.pick = null; return render(); }
  startPick(kind, options, label, fn, { key });
}


// ------------------------------------------------------------ dialogs
function cardPicker({ heading, text, pool, count, exact = true, confirm, dismissable = false, max, haveText = 'have {n}' }) {
  const sel = Object.fromEntries(Object.keys(pool).map(k => [k, 0]));
  const total = () => Object.values(sel).reduce((a, b) => a + b, 0);
  modal(`<h2>${heading}</h2><p class="muted" style="margin:0">${text}</p><div class="picker" id="pk"></div>
    <div class="foot">${dismissable ? `<button class="btn" data-close>${tx('Cancel')}</button>` : ''}<button class="btn primary" id="pkok">${tx('Confirm')}</button></div>`, {
    dismissable,
    onMount(el, close) {
      const draw = () => {
        el.querySelector('#pk').innerHTML = Object.entries(pool).map(([k, have]) => `<div class="pick ${sel[k] ? 'on' : ''}">
          <div class="rcard ${COMM.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:44px;height:58px">${glyph(k, 22)}</div>
          <div style="font-size:12px;font-weight:600">${esc(resName(k))}</div>${have != null ? `<div class="have">${tx(haveText, { n: have })}</div>` : ''}
          <div class="ctr"><button data-k="${k}" data-d="-1" aria-label="${tx('Less')}">−</button><b>${sel[k]}</b><button data-k="${k}" data-d="1" aria-label="${tx('More')}">+</button></div></div>`).join('');
        el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
          const k = b.dataset.k, d = +b.dataset.d;
          const lim = pool[k] == null ? 99 : pool[k];
          if (d > 0 && (sel[k] >= lim || (max && total() >= max) || (exact && total() >= count))) return;
          sel[k] = Math.max(0, sel[k] + d); sfx.click(); draw();
        });
        const ok = el.querySelector('#pkok');
        ok.disabled = exact ? total() !== count : total() === 0;
        ok.textContent = exact ? `${t('Confirm')} (${total()}/${count})` : t('Confirm');
      };
      draw();
      el.querySelector('#pkok').onclick = async () => { if (await confirm(Object.fromEntries(Object.entries(sel).filter(([, n]) => n)))) close(); };
    },
  });
}

function choiceDialog(heading, text, options, onChoose, dismissable = true) {
  modal(`<h2>${heading}</h2>${text ? `<p class="muted" style="margin:0 0 10px">${text}</p>` : ''}<div style="display:flex;flex-direction:column;gap:8px">${options.map((o, i) => `<button class="btn ${o.cls || ''}" data-i="${i}" ${o.disabled ? 'disabled' : ''} style="${o.style || ''}">${o.html}</button>`).join('')}</div>
    ${dismissable ? `<div class="foot"><button class="btn" data-close>${tx('Cancel')}</button></div>` : ''}`, {
    dismissable,
    onMount(el, close) { el.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { const r = await onChoose(options[+b.dataset.i].value); if (r !== false) close(); }); },
  });
}

const handPool = () => {
  const m = me(); const pool = {};
  RES.forEach(k => { if (m.res[k]) pool[k] = m.res[k]; });
  if (m.comm) COMM.forEach(k => { if (m.comm[k]) pool[k] = m.comm[k]; });
  return pool;
};
const resChoices = (list = RES) => list.map(r => ({ value: r, html: `${glyph(r, 18)} ${esc(resName(r))}`, style: `background:${CARD_COLOR[r]};color:#fff;border-color:transparent;justify-content:flex-start` }));

function autoDialogs(force = false) {
  const v = G.view;
  if (!isMine() || v.phase !== 'play') return;
  const mp = myPending()[0];
  if (!mp) return;
  const key = `${mp.type}-${mp.group}`;
  if (G.opened.has(key) && !force) return;
  if (document.querySelector('.modal-back')) return;
  // let the full-screen moment (robber, barbarians) finish first
  if (window.BROCH_FX_BUSY && !force) { setTimeout(() => { if (G && G.view === v) autoDialogs(); }, 400); return; }
  G.opened.add(key);
  if (isHub(v) && hub().dialog(mp)) return;
  if (kn().dialog(mp) || sea().dialog(mp)) return;
  switch (mp.type) {
    case 'discard':
      return cardPicker({ heading: tx('Discard {n} cards', { n: mp.count }), text: tx('A 7 was rolled and you hold more than {n} cards.', { n: me().handLimit }), pool: handPool(), count: mp.count, confirm: cards => send({ type: 'discard', cards }) });
    case 'give':
      return cardPicker({ heading: mp.good ? tx('Good neighbors: a gift for {name}', { name: v.players[mp.to].name }) : tx('Wedding gift for {name}', { name: v.players[mp.to].name }), text: tx('Choose {n} cards to give.', { n: mp.count }), pool: handPool(), count: mp.count, confirm: cards => send({ type: 'give', cards }) });
    case 'steal':
      return choiceDialog(tx('Steal from…'), tx('You take one random card.'), mp.options.map(p => ({ value: p, html: `${houseIcon(v.players[p].color)} ${esc(v.players[p].name)} · ${tx('Cards: {n}', { n: v.players[p].cards })}` })), from => send({ type: 'steal', from }), false);
  }
}

function tradeDialog(counter) {
  const v = G.view;
  const types = [...RES, ...(v.mode === 'knights' ? COMM : []), ...(v.gold ? ['gold'] : [])];
  const give = counter ? { ...counter.get } : {}, get = counter ? { ...counter.give } : {}; // a counter starts from the offer, turned around
  modal(`<h2>${counter ? tx('Make a counter-offer') : tx('Offer a trade')}</h2><p class="muted" style="margin:0">${counter ? tx('Propose other terms. The active player decides whether to take them.') : tx('Everyone sees the offer and can accept, decline or answer with a counter-offer. You pick who to trade with.')}</p>
    <div class="section-label" style="color:var(--muted)">${tx('You give')}</div><div class="picker" id="tg"></div>
    <div class="section-label" style="color:var(--muted)">${tx('You want')}</div><div class="picker" id="tw"></div>
    <div class="foot"><button class="btn" data-close>${tx('Cancel')}</button>${counter ? '' : `<button class="btn" id="tbank">${tx('Bank instead')}</button>`}<button class="btn primary" id="tok">${counter ? tx('Send counter-offer') : tx('Offer')}</button></div>`, {
    onMount(el, close) {
      const m = me();
      const draw = () => {
        const cell = (sel, k, have) => `<div class="pick ${sel[k] ? 'on' : ''}"><div class="rcard ${COMM.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div>
          <div class="have">${have != null ? tx('have {n}', { n: have }) : esc(resName(k))}</div><div class="ctr"><button data-s="${sel === give ? 'g' : 'w'}" data-k="${k}" data-d="-1">−</button><b>${sel[k] || 0}</b><button data-s="${sel === give ? 'g' : 'w'}" data-k="${k}" data-d="1">+</button></div></div>`;
        el.querySelector('#tg').innerHTML = types.map(k => cell(give, k, (k === 'gold' ? m.gold : RES.includes(k) ? m.res[k] : m.comm[k]) || 0)).join('');
        el.querySelector('#tw').innerHTML = types.map(k => cell(get, k, null)).join('');
        el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
          const sel = b.dataset.s === 'g' ? give : get, k = b.dataset.k, d = +b.dataset.d;
          const have = (k === 'gold' ? m.gold : RES.includes(k) ? m.res[k] : m.comm[k]) || 0;
          const nv = Math.max(0, (sel[k] || 0) + d);
          if (sel === give && nv > have) return;
          if (nv > 9) return;
          sel[k] = nv;
          if (nv && sel === give) get[k] = 0;
          if (nv && sel === get) give[k] = 0;
          sfx.click(); draw();
        });
        const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
        el.querySelector('#tok').disabled = !sum(give) || !sum(get);
      };
      draw();
      if (!counter) el.querySelector('#tbank').onclick = () => { close(); bankDialog(); };
      el.querySelector('#tok').onclick = async () => {
        const clean = o => Object.fromEntries(Object.entries(o).filter(([, n]) => n));
        if (await send(counter ? { type: 'counterTrade', id: counter.id, give: clean(give), get: clean(get) } : { type: 'offerTrade', give: clean(give), get: clean(get) })) close();
      };
    },
  });
}

function bankDialog() {
  const v = G.view, L = v.legal || {};
  const ratios = L.ratios || {};
  const types = Object.keys(ratios);
  let give = null, get = null;
  modal(`<h2>${tx('Trade with the bank')}</h2><p class="muted" style="margin:0">${v.mode === 'knights' ? tx('Your rates come from your harbors and improvements.') : tx('Your rates come from your harbors.')}</p>
    <div class="section-label" style="color:var(--muted)">${tx('Give')}</div><div class="picker" id="bg"></div>
    <div class="section-label" style="color:var(--muted)">${tx('Get 1')}</div><div class="picker" id="bw"></div>
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button><button class="btn primary" id="bok" disabled>${tx('Trade')}</button></div>`, {
    onMount(el) {
      const have = k => { const m = me(); return (RES.includes(k) ? m.res[k] : m.comm[k]) || 0; };
      const draw = () => {
        el.querySelector('#bg').innerHTML = types.map(k => `<button class="pick ${give === k ? 'on' : ''}" data-g="${k}" ${have(k) < ratios[k] ? 'disabled style="opacity:.4"' : ''}>
          <div class="rcard ${COMM.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><b>${ratios[k]}:1</b><span class="have">${tx('have {n}', { n: have(k) })}</span></button>`).join('');
        el.querySelector('#bw').innerHTML = [...RES, ...(v.mode === 'knights' ? COMM : []), ...(v.gold ? ['gold'] : [])].map(k => `<button class="pick ${get === k ? 'on' : ''}" data-w="${k}" ${k === give || (RES.includes(k) && !G.view.bank[k]) ? 'disabled style="opacity:.4"' : ''}>
          <div class="rcard ${COMM.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><span class="have">${esc(resName(k))}</span></button>`).join('');
        el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { give = b.dataset.g; if (get === give) get = null; sfx.click(); draw(); });
        el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { get = b.dataset.w; sfx.click(); draw(); });
        const ok = el.querySelector('#bok');
        ok.disabled = !give || !get;
        ok.textContent = give && get ? t('Trade {n} {a} for 1 {b}', { n: ratios[give], a: resName(give), b: resName(get) }) : t('Trade');
      };
      draw();
      el.querySelector('#bok').onclick = async () => {
        if (await send({ type: 'bankTrade', give, get })) setTimeout(() => { if (give && have(give) < ratios[give]) give = null; draw(); }, 250);
      };
    },
  });
}

function devDialog(type) {
  const v = G.view;
  const ready = me().dev.some(d => d.type === type && !d.fresh);
  const myTurn = v.current === v.me && v.phase === 'play' && v.step !== 'sbp' && !v.pending.length;
  const limited = v.flags.devPlayed && !(type === 'knight' && v.options.knightsFree); // one card per turn (house rule: knights are unlimited)
  const can = type !== 'victoryPoint' && type !== 'goodTrip' && ready && myTurn && !limited;
  const why = type === 'goodTrip' ? t('Play it while you move your wagon, after a regular move.') : type === 'victoryPoint' ? t('Counts automatically.') : !myTurn ? t('Play it on your turn.') : limited ? t('You already played a card this turn.') : !ready ? t('Cards bought this turn can be played next turn.') : '';
  modal(`<div class="progress-card dev-card fx-flip"><b>${esc(cardName(type))}</b><small>${tx((isHub(v) && hub().devDesc(v, type)) || (v.expansion === 'seafarers' && type === 'roadBuilding' ? 'Build 2 roads or ships for free (or 1 of each).' : DEV_DESC[type]))}</small></div>
    ${why ? `<p class="muted">${esc(why)}</p>` : ''}
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button>${can ? `<button class="btn primary" id="play">${tx('Play card')}</button>` : ''}</div>`, {
    onMount(el, close) {
      el.querySelector('#play')?.addEventListener('click', () => {
        close();
        if (type === 'yearOfPlenty') {
          const pool = Object.fromEntries(RES.map(r => [r, G.view.bank[r]]));
          cardPicker({ heading: esc(cardName('yearOfPlenty')), text: tx('Take any 2 resources from the bank.'), pool, count: 2, dismissable: true, confirm: c => { const l = []; Object.entries(c).forEach(([k, n]) => { for (let i = 0; i < n; i++) l.push(k); }); return send({ type: 'playDev', card: 'yearOfPlenty', a: l[0], b: l[1] }); } });
        } else if (type === 'monopoly') {
          choiceDialog(esc(cardName('monopoly')), tx('Everyone gives you all of the resource you name.'), resChoices(), res => send({ type: 'playDev', card: 'monopoly', res }));
        } else send({ type: 'playDev', card: type });
      });
    },
  });
}

// the rules sentences of the building-costs dialog (classic family and Cities & Knights)
function classicRules() {
  const v = G.view, o = v.options || {};
  const parts = [];
  if (v.board?.scenario !== 'cloth' || v.expansion !== 'seafarers') parts.push(isSea(v) ? tx('Longest Trade Route: 5 or more connected roads and ships, 2 points. Roads and ships join only at your settlements.') : tx('Longest Road: 5 or more connected roads, 2 points.'));
  parts.push(tx('Largest Army: 3 or more played knights, 2 points.'));
  parts.push(o.knightsFree ? tx('You may play 1 development card per turn (knights are not limited in this game), but not one you bought this turn.') : tx('You may play 1 development card per turn, but not one you bought this turn.'));
  return parts.join(' ');
}

function costsDialog() {
  const knights = G.view.mode === 'knights';
  const rows = [[t('Road'), COSTS.road, ''], [t('Settlement'), COSTS.settlement, t('1 point')], [t('City'), COSTS.city, t('2 points, double production')]];
  if (isSea(G.view)) rows.push(sea().costRow());
  if (isHub(G.view)) rows.push(...hub().costRows(G.view));
  if (!knights) rows.push((isHub(G.view) && hub().devRow(G.view)) || [t('Development card'), COSTS.dev, t('Knight, Road Building, Year of Plenty, Monopoly or a point')]);
  else rows.push(...kn().costRows());
  const o = G.view.options || {};
  const house = [o.robberReturn && t('House rule: forgotten robber'), o.knightsFree && t('House rule: knights without a limit'), o.startBoth && t('House rule: starting resources for both')].filter(Boolean);
  modal(`<h2>${tx('Building costs')}</h2><button class="btn gold block tut-open" data-tut-mode>▶ ${tx('How to play: {mode}', { mode: modeLabel(G.view) })}</button><div style="margin-top:10px">${rows.map(([n, c, d]) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="width:140px">${esc(n)}</b><span class="spacer">${cardsHtml(c)}</span><span class="muted" style="font-size:12px;text-align:right">${esc(d)}</span></div>`).join('')}</div>
    ${isHub(G.view) ? hub().costsExtra(G.view).map(x => `<p class="muted" style="font-size:13px">${esc(x)}</p>`).join('') : ''}
    ${sea().scenarioRules(G.view)}
    ${knights ? kn().costsText() : ''}
    ${!knights ? `<p class="muted" style="font-size:13px">${isHub(G.view) ? (hub().awardsText(G.view) ? esc(hub().awardsText(G.view)) : tx('Longest Road: 5 or more connected roads, 2 points. Largest Army: 3 or more played knights, 2 points. You may play 1 development card per turn, but not one you bought this turn.')) : classicRules()}</p>` : kn().rules()}
    ${G.view.pair ? `<p class="muted" style="font-size:13px">${tx('Five or six players: stone 1 rolls, trades and builds; stone 2 follows without dice and trades only with the bank. If both reach the goal in one turn, stone 1 wins.')}</p>` : ''}
    ${house.length ? `<p class="muted" style="font-size:13px"><b>${tx('House rules in this game')}:</b> ${house.map(esc).join(' · ')}</p>` : ''}
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
    onMount: el => el.querySelector('[data-tut-mode]')?.addEventListener('click', () => { closeModals(); openTutorial(tutorialFor(G.view)); }),
  });
}

function showCelebration() {
  const v = G.view;
  if (!v || v.winner == null) return;
  closeModals();
  victoryScene(v, {
    title: `${modeLabel(v)} · ${t('turn {n}', { n: v.turn })}`,
    actions: `<a class="btn gold" href="#/stats">${tx('See stats')}</a><a class="btn ghost" href="#/">${tx('Back to lobby')}</a>`,
  });
}
// the last move's animations (a city, a revealed card) play first, then the victory
function celebrateWhenCalm(tries = 0) {
  if (!G) return;
  if (window.BROCH_FX_BUSY && tries < 40) { setTimeout(() => celebrateWhenCalm(tries + 1), 150); return; }
  showCelebration();
}

