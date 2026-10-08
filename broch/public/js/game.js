import { esc, toast, modal, closeModals, wsWatch, wsAct, onWs, reportProblem, houseIcon, glyph, GLYPH, PCOLOR, PCOLOR_DARK, RES, COMM, CARD_COLOR, resName, cardName, term, tf, t, isLightColor, dieHtml } from './core.js';
import { lang } from './i18n.js';
import { renderBoard, boardBounds, BOARD_S } from './board.js';
import { hubExt } from './hub-art.js';
import { createHub } from './hub.js';
import { topbar } from './app.js';
import { diff, play, sfx } from './fx.js';
import { victoryScene, closeVictory } from './victory.js';
import { openTutorial, closeTutorial, tutorialSeen } from './tutorial.js';
import { flag } from './countries.js';
import { createZoom } from './zoom.js';
import { DEV_DESC, PROGRESS_INFO, PROGRESS_DECK, DECK_COLOR } from './cards.js';
import { SCEN, WONDER } from './scen.js';
import { chatHtml, historyHtml, graphsHtml, wireGraphs } from './feed.js';

let G = null;
const ZOOM0 = () => ({ z: 1, cx: 0, cy: 0 });

const COSTS = {
  road: { lumber: 1, brick: 1 }, settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 }, city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 }, knight: { wool: 1, ore: 1 }, wall: { brick: 2 },
  ship: { lumber: 1, wool: 1 }, bridge: { brick: 2, lumber: 1 },
};
const FISH_COST = { robber: 2, steal: 3, take: 4, road: 5, dev: 7 };
const MODE_NAME = { classic: 'Classic', knights: 'Cities & Knights' };
const EXP_NAME = { seafarers: 'Seafarers', traders: 'Traders & Barbarians', explorers: 'Explorers & Pirates' };
export function modeLabel(v) {
  const base = v.mode === 'knights' ? t('Cities & Knights') : t('Classic');
  if (!v.expansion || v.expansion === 'none') return base;
  const x = t(EXP_NAME[v.expansion]);
  return v.mode === 'knights' ? `${x} + ${base}` : x;
}
const isSea = v => v.expansion === 'seafarers' || v.expansion === 'explorers';
// which tutorial explains a game: the expansion first, then Cities & Knights, then the 5–6 player rules
export const tutorialFor = v => (v.expansion && v.expansion !== 'none' ? v.expansion : v.mode === 'knights' ? 'knights' : 'classic');
const EVENT_ICON = { ship: '⛵', trade: '◆', politics: '◆', science: '◆' };
const EVENT_COLOR = { ship: '#2B1E12', trade: '#E0A32E', politics: '#2C6E9B', science: '#2E6B45' };


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
      if (!prev) { focusOnLand(); setTimeout(tutNudge, 1500); }
      const d = diff(prev, G.view);
      G.fresh = d.fresh;
      onNewState(prev);
      render();
      G.fresh = null; // animate new pieces only once
      play(d.events, G.view, pname);
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
// Traders & Barbarians: the questions, dialogs and chips of its scenarios live in hub.js
let HUB = null;
const hub = () => HUB || (HUB = createHub({ get G() { return G; }, send, startPick, render, me, pname, cardPicker, choiceDialog, resChoices, toast }));
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
      return { msg: esc(msg), sub: v.setup.need === 'road' ? tx('Tap a glowing edge.') : tx('Tap a glowing corner. Buildings need at least one empty corner between them.'), mine };
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
        goldPick: [t('Gold! Choose {n} resources.', { n: mp.count }), t('Take any resources the bank has.'), t('Choose cards')],
        placeHarbor: [t('Place your harbour.'), t('Tap one of your highlighted coastal settlements.')],
        steal: [t('Choose who to steal from.'), '', t('Choose')],
        relocateKnight: [t('Your knight was displaced.'), t('Tap a glowing corner to move it there.')],
        placeMetropolis: [t('Choose a city for your metropolis ({track}).', { track: term(mp.track) }), t('Tap one of your highlighted cities.')],
        loseCity: [t('The barbarians pillage one of your cities.'), t('Tap the city that becomes a settlement.')],
        chooseProgress: [t('You helped defend Broch. Draw a progress card.'), '', t('Choose deck')],
        discardProgress: mp.mustPlay
          ? [t('You drew a 5th progress card. Play one now.'), mp.canGiveBack ? t('None of your cards can be played, so you may hand one back.') : t('You may hold at most 4: play any of your cards.'), t('Choose card')]
          : [t('You have more than 4 progress cards.'), t('Give one back (under its deck).'), t('Choose card')],
        aqueduct: [t('Your aqueduct provides a resource.'), t('Nothing was produced for you this roll.'), t('Choose')],
        placeFreeKnight: [t('A knight deserted to your side.'), t('Tap a corner next to your road, or skip.')],
        deserterPick: [t('A knight of yours deserts.'), t('Tap the knight that leaves the board.')],
        harborGive: [t('{name} offers you a resource.', { name: v.players[mp.to]?.name }), t('Give one of your commodities in return.'), t('Choose commodity')],
        spy: [t('Your spy sees their progress cards.'), '', t('Choose card')],
        masterMerchant: [t('Take 2 cards from their hand.'), '', t('Choose cards')],
      }[mp.type] || [t('Make your choice.'), ''];
      const rr = mp.type === 'moveRobber' && v.legal?.leaveRobber && v.step === 'main';
      return { msg: esc(T[0]), sub: esc(rr ? t('House rule: if you end your turn now, the robber goes back to the desert.') : T[1]), mine: true, btns: `${T[2] ? `<button class="btn primary" data-do="pendingDialog">${esc(T[2])}</button>` : ''}${mp.type === 'placeFreeKnight' ? `<button class="btn" data-do="skipFreeKnight">${tx('Skip')}</button>` : ''}${mp.type === 'moveRobber' && v.legal?.pirateFrame ? `<button class="btn" data-do="pirateFrame">${tx('Pirate to the frame')}</button>` : ''}${rr ? `<button class="btn" data-do="forgetRobber">${tx('End turn')}</button>` : ''}` };
    }
    const who = [...new Set(pend.map(p => p.player))].map(pname).join(', ');
    const W = {
      discard: 'Waiting for {names} to discard…', moveRobber: 'Waiting for {names} to move the robber…', steal: 'Waiting for {names} to steal…',
      relocateKnight: 'Waiting for {names} to relocate a knight…', give: 'Waiting for {names} to give cards…', loseCity: 'Waiting for {names} to pick a city to lose…',
      chooseProgress: 'Waiting for {names} to draw progress cards…', goldPick: 'Waiting for {names} to choose from the gold field…',
      deserterPick: 'Waiting for {names} to pick a deserting knight…', harborGive: 'Waiting for {names} to trade a commodity…', discardProgress: 'Waiting for {names} to play or give back a progress card…',
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
  if (v.free.roads > 0) return { msg: esc(t(isSea(v) && v.expansion === 'seafarers' ? 'Place free roads or ships: {n}.' : 'Place free roads: {n}.', { n: v.free.roads })), sub: tx('Tap a glowing edge.'), mine: true, btns: `<button class="btn" data-do="skipFree">${tx('Skip')}</button>` };
  const L0 = v.legal || {};
  const shipHint = L0.moveShips && Object.keys(L0.moveShips).length ? tx('Tap one of your pulsing ships to sail it (once per turn).') : '';
  const stone2 = v.flags.stone2;
  return { msg: stone2 ? tx('Your turn with stone 2.') : tx('Build, trade or end your turn.'), sub: v.free.promotes ? tx('Free promotions left: {n} (tap a knight).', { n: v.free.promotes }) : stone2 ? tx('No dice. Trade with the bank only.') : shipHint, mine: true, btns: `${stone2 ? '' : `<button class="btn" data-do="trade">${tx('Trade')}</button>`}<button class="btn" data-do="bank" title="${tx('Trade with the bank')}">${glyph('bank', 15)}${tx('Bank')}</button><button class="btn primary" data-do="endTurn">${tx('End turn')}</button>` };
}


function diceHtml() {
  const d = G.view.dice;
  if (!d) return '';
  const evName = d.event ? (d.event === 'ship' ? t('Barbarian ship') : t('{track} gate', { track: term(d.event) })) : '';
  if (d.card) return `<div class="dice card">${hub().diceCard(d)}${d.event ? `<div class="die event" style="background:${EVENT_COLOR[d.event]};color:#fff;border-color:${EVENT_COLOR[d.event]}" title="${esc(evName)}">${EVENT_ICON[d.event]}</div>` : ''}<b class="dsum ${d.total === 7 ? 'seven' : ''}">${d.total}</b></div>`;
  return `<div class="dice" title="${esc(t('Rolled {n}', { n: d.total }))}">
    ${dieHtml(d.red, 'red')}${dieHtml(d.yellow, 'yellow')}
    ${d.event ? `<div class="die event" style="background:${EVENT_COLOR[d.event]};color:#fff;border-color:${EVENT_COLOR[d.event]}" title="${esc(evName)}">${EVENT_ICON[d.event]}</div>` : ''}
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
  if (L.harborSpots) return { vertices: L.harborSpots };
  if (L.robberHexes) return { hexes: L.robberHexes };
  if (L.relocate) return { vertices: L.relocate };
  if (L.metroCities) return { vertices: L.metroCities };
  if (L.loseCities) return { vertices: L.loseCities };
  if (L.freeKnightSpots) return { vertices: L.freeKnightSpots };
  if (L.giveKnights) return { ownKnights: L.giveKnights };
  const tg = {};
  if (v.free.roads > 0 && v.current === v.me && L.roads) tg.edges = [...new Set([...L.roads, ...(L.ships || [])])];
  if (L.knights && Object.keys(L.knights).length) tg.ownKnights = Object.keys(L.knights).map(Number);
  if (L.moveShips && Object.keys(L.moveShips).length) tg.ownShips = Object.keys(L.moveShips).map(Number);
  return tg;
}

function onBoardClick(e) {
  const el = e.target.closest('[data-v],[data-e],[data-h],[data-k],[data-s],[data-hub]');
  if (!el) return;
  const v = G.view, L = v.legal || {};
  const id = +(el.dataset.v ?? el.dataset.e ?? el.dataset.h ?? el.dataset.k ?? el.dataset.s);
  if (G.pick) { G.pick.onPick(id); return; }
  if (isHub(v) && hub().boardClick(el, id)) return;
  if (L.giveKnights && el.dataset.k != null) return send({ type: 'deserterPick', v: id });
  if (el.dataset.k != null) return knightMenu(id);
  if (el.dataset.s != null) return shipMenu(id);
  if (L.setupSpots) return send({ type: v.setup.need === 'city' ? 'placeCity' : 'placeSettlement', v: id });
  if (L.setupRoads) return roadOrShip(id, L.setupRoads, L.setupShips, e => send({ type: 'placeRoad', e }), e => send({ type: 'placeShip', e }));
  if (L.harborSpots) return send({ type: 'placeHarbor', v: id });
  if (L.robberHexes) return send({ type: 'moveRobber', hex: id });
  if (L.relocate) return send({ type: 'relocateKnight', v: id });
  if (L.metroCities) return send({ type: 'placeMetropolis', v: id });
  if (L.loseCities) return send({ type: 'loseCity', v: id });
  if (L.freeKnightSpots) return send({ type: 'placeFreeKnight', v: id });
  if (el.dataset.e != null && v.free.roads > 0) return roadOrShip(id, L.roads, L.ships, e => send({ type: 'buildRoad', e }), e => send({ type: 'buildShip', e }));
}

// Seafarers: a coast edge may take a road or a ship (founding phase, Road Building card): ask when both would do
function roadOrShip(e, roads, ships, road, ship) {
  const r = (roads || []).includes(e), sh = (ships || []).includes(e);
  if (r && sh) return choiceDialog(tx('Road or ship?'), tx('This edge is on the coast.'), [{ value: 'road', html: `${glyph('road', 16)} ${tx('Road')}` }, { value: 'ship', html: `${glyph('ship', 16)} ${tx('Ship')}` }], k => (k === 'road' ? road(e) : ship(e)));
  if (sh) return ship(e);
  if (r) return road(e);
}

function shipMenu(eid) {
  const L = G.view.legal || {};
  const dest = L.moveShips?.[eid];
  if (!dest || !dest.length) return;
  startPick('edges', dest, t('Tap where this ship should sail.'), to => send({ type: 'moveShip', from: eid, to }), { key: 'moveShip' });
}

function startPick(kind, options, label, onPick, extra = {}) {
  if (!options || !options.length) { toast(t('There is nowhere to do that right now.'), 'warn'); return; }
  G.pick = { kind, options, label, onPick: async id => { const keep = await onPick(id); if (!keep) { G.pick = null; render(); } }, version: G.view.version, ...extra };
  render();
  document.querySelector('.board-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ------------------------------------------------------------ zoom
// big archipelago boards open zoomed in on the land you can see, so tiles are readable on a phone
function focusOnLand() {
  const b = G.view?.board;
  if (!b || b.hexes.length < 45) return;
  const land = b.hexes.filter(h => h.terrain !== 'sea' && h.terrain !== 'fog');
  if (!land.length) return;
  const S = BOARD_S(), [, , bw, bh] = boardBounds(b);
  const xs = land.map(h => h.x * S), ys = land.map(h => h.y * S);
  const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 90, y1 = Math.max(...ys) + 90;
  const z = Math.max(1, Math.min(2.6, Math.min(bw / (x1 - x0), bh / (y1 - y0))));
  if (z > 1.15) G.zoom = { z, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
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
  if (setHtml(G.app.querySelector('.imp-host'), 'imp', G.view.mode === 'knights' ? improveHtml() : '')) animateImprovements();
  renderFeed();
  autoDialogs();
  aqueductPrompt();
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
  if (v.mode === 'knights' && v.barbarian) {
    let track = '';
    for (let i = 0; i < 7; i++) track += `<i class="${i < v.barbarian.pos ? 'on' : ''}"></i>`;
    const strength = Object.values(v.buildings).filter(b => b.type === 'city').length;
    const defense = Object.values(v.knights).filter(k => k.active).reduce((a, k) => a + k.level, 0);
    bits.push(`<span class="hud-pill barb-pill" title="${tx('Barbarian ship: attacks when it reaches the end')}">⛵ <span class="barb-track">${track}</span></span>`);
    bits.push(`<span class="hud-pill" title="${tx('Barbarian strength (cities) vs active knights')}">⚔ ${strength} : ${defense}</span>`);
  } else if (v.mode !== 'knights' && v.hub?.scenario !== 'barbarians') bits.push(`<span class="hud-pill devdeck" title="${tx('Development cards left: {n}', { n: v.devDeck })}"><i class="stk dev"></i>${v.devDeck}</span>`);
  if (v.fish) bits.push(`<span class="hud-pill" title="${tx('Fish tokens left in the bag')}"><svg viewBox="0 0 24 24" width="15" height="15" style="color:#9FE3F5">${GLYPH.fish}</svg> ${v.fish.left}</span>`);
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
  if (v.expansion === 'explorers') {
    if (v.missions.includes('fish')) tokens.push(tok('fish', m.cargo.fish, t('Fish'), '#1F7A99', 'missions', mainTurn && !!L.deliver?.fish));
    if (v.missions.includes('spice')) tokens.push(tok('spice', m.cargo.spice, t('spice'), '#B53A2A', 'missions', mainTurn && !!L.deliver?.spice));
  }
  const pickOn = k => G.pick && G.pick.key === k ? 'on' : '';
  const btn = (key, label, icon, cost, enabled, left = null) => `<button class="act ${pickOn(key)}" data-do="${key}" ${enabled ? '' : 'disabled'} title="${esc(label)}"><span class="nm"><i class="ai">${glyph(icon, 14)}</i>${esc(label)}</span><small><span class="cd">${costHtml(cost)}</span>${left != null ? `<span class="left">${left}</span>` : ''}</small></button>`;
  const plain = (key, label, icon, sub, enabled) => `<button class="act" data-do="${key}" ${enabled ? '' : 'disabled'} title="${esc(label)}"><span class="nm"><i class="ai">${glyph(icon, 14)}</i>${esc(label)}</span><small>${esc(sub)}</small></button>`;
  let acts = '';
  acts += btn('road', t('Road'), 'road', COSTS.road, free && L.roads?.length > 0 && !(v.free.roads > 0), m.pieces.roads);
  if (isSea(v)) acts += btn('ship', t('Ship'), 'ship', COSTS.ship, free && L.ships?.length > 0, m.pieces.ships);
  if (v.rivers) acts += btn('bridge', t('Bridge'), 'bridge', COSTS.bridge, free && L.bridges?.length > 0, m.pieces.bridges);
  acts += btn('settlement', t('Settlement'), 'settlement', COSTS.settlement, free && L.settlements?.length > 0, m.pieces.settlements);
  if (v.wonders) acts += plain('wonders', t('Wonders'), 'castle', t('Build a wonder'), true);
  acts += btn('city', t('City'), 'city', COSTS.city, free && L.cities?.length > 0, m.pieces.cities);
  if (knights) {
    acts += btn('knight', t('Knight'), 'knight', COSTS.knight, free && L.knightSpots?.length > 0, m.pieces.knights[1]);
    acts += btn('wall', t('City wall'), 'wall', COSTS.wall, free && L.walls?.length > 0, m.pieces.walls);
  }
  acts += plain('bank', t('Bank trade'), 'bank', t('4:1 or better'), mainTurn);
  if (isHub(v)) acts += hub().actions(v, m, L, { free, mainTurn, plain });
  if (v.expansion === 'explorers') acts += plain('missions', t('Missions'), 'flag', t('Deliver, attack'), mainTurn);

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
    const prog = m.progress || [];
    const slots = Math.max(4, prog.length);
    let dcs = '';
    for (let i = 0; i < slots; i++) {
      const c = prog[i];
      if (!c) { dcs += '<span class="dcard slot"></span>'; continue; }
      const deck = PROGRESS_DECK[c];
      dcs += `<button class="dcard prog" data-prog="${i}" style="--dk:${DECK_COLOR[deck]}" title="${esc(cardName(c))}"><span class="dc-ic">${glyph(deck, 16)}</span>${nameSpan(cardName(c))}</button>`;
    }
    cardsRow = `<div class="devrow"><span class="lbl">${tx('Progress cards')}<b>${prog.length}/4</b></span><div class="dcards">${dcs}</div></div>`;
  }
  const chips = [];
  if (v.fish?.boot === v.me) chips.push(`<span class="stat-chip" title="${tx('The old boot: you need one more point to win.')}">${chipIcon('boot', '#6B4A2A')}${tx('Old boot')}</span>`);
  if (v.expansion === 'explorers') {
    if (v.missions.includes('fish')) chips.push(`<span class="stat-chip btnish" data-do="missions" title="${tx('Fish on board · delivered')}">${chipIcon('fish', '#1F7A99')}${m.cargo.fish} · ${m.delivered.fish}</span>`);
    if (v.missions.includes('spice')) chips.push(`<span class="stat-chip btnish" data-do="missions" title="${tx('Spice on board · delivered')}">${chipIcon('spice', '#B53A2A')}${m.cargo.spice} · ${m.delivered.spice}</span>`);
  }
  if (isHub(v)) chips.push(...hub().chips(v, m));
  if (isSea(v)) chips.push(`<span class="stat-chip" title="${tx('Pieces left')}">${chipIcon('ship', '#2C5F7A')}${tx('{n} left', { n: m.pieces.ships })}</span>`);
  const over = m.cards > m.handLimit;
  return `<div class="hand">
    <div class="hand-head"><b>${tx('Your hand')}</b><span class="hand-count ${over ? 'warn' : ''}" title="${over ? tx('More than {n} cards: a 7 costs you half of them.', { n: m.handLimit }) : ''}">${tx('Cards: {n} · limit {m}', { n: m.cards, m: m.handLimit })}</span></div>
    <div class="hand-cards">${[...RES, ...(knights ? COMM : [])].map(card).join('')}${tokens.length ? `<span class="hc-sep"></span>${tokens.join('')}` : ''}</div>
    <div class="actions">${acts}</div>
    ${cardsRow}
    ${chips.length ? `<div class="stat-strip">${chips.join('')}</div>` : ''}
  </div>`;
}

const hexBadge = (track, n) => `<span class="hexbadge ${track}" title="${esc(term(track))}: ${n}">${n}</span>`;

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
    } else {
      meta.push(`<span class="mp" title="${tx('Progress: {n}', { n: p.progressCount })}"><i class="stk prog"></i>${p.progressCount}</span>`);
      const str = Object.values(v.knights).filter(k => k.p === i && k.active).reduce((a, k) => a + k.level, 0);
      meta.push(`<span class="mp" title="${tx('Active knight strength')}">${glyph('sword', 12)}${str}</span>`);
      const imp = p.improvements;
      meta.push(`<span class="mp hb" title="${tx('Improvements: trade / politics / science')}">${hexBadge('trade', imp.trade)}${hexBadge('politics', imp.politics)}${hexBadge('science', imp.science)}</span>`);
    }
    if (v.gold) meta.push(`<span class="mp" title="${tx('Gold')}">${chipIcon('gold', '#C58E12')}${p.gold}${p.riverVp ? ` <b style="color:${p.riverVp > 0 ? 'var(--green)' : 'var(--red-d)'}">${p.riverVp > 0 ? '+' : ''}${p.riverVp}</b>` : ''}</span>`);
    if (v.fishing) meta.push(`<span class="mp" title="${tx('Fish tokens')}">${chipIcon('fish', '#1F7A99')}${p.fishTokens}${v.fish?.boot === i ? ' 🥾' : ''}</span>`);
    if (isHub(v)) meta.push(hub().playerMeta(v, p, i));
    if (v.villages) meta.push(`<span class="mp" title="${tx('Bales of cloth (2 bales = 1 point)')}">${chipIcon('cloth', '#8A5A9E')}${p.cloth}</span>`);
    if (v.gifts && (p.chips || p.harbors)) meta.push(`<span class="mp" title="${tx('Victory point chips · harbours waiting for a settlement')}">${chipIcon('star', '#C58E12')}${p.chips}${p.harbors ? ` · ${glyph('bank', 11)}${p.harbors}` : ''}</span>`);
    if (v.wonders) { const w = Object.entries(v.wonders).find(([, x]) => x.owner === i); if (w) meta.push(`<span class="mp" title="${esc(t(WONDER[w[0]].name))}">${chipIcon(WONDER[w[0]].icon, '#B8832A')}${w[1].level}/4</span>`); }
    if (v.expansion === 'explorers') meta.push(`<span class="mp" title="${tx('Delivered fish · spice')}">${chipIcon('fish', '#1F7A99')}${p.delivered.fish}${chipIcon('spice', '#B53A2A')}${p.delivered.spice}</span>`);
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
    const rows = v.players.map((p, i) => i === v.me ? '' : `<div class="row" style="margin-top:6px"><span class="spacer">${pname(i)}</span>${tr.responses[i] === 'accept' ? `<button class="btn small gold" data-confirm="${i}">${tx('Trade with {name}', { name: p.name })}</button>` : tr.responses[i] === 'counter' && tr.counters && tr.counters[i] ? `<div style="flex:1 1 100%"><div class="trade-line">${tx('Counter-offer: you give')} ${cardsHtml(tr.counters[i].give)}</div><div class="trade-line" style="margin-top:4px">${tx('and get')} ${cardsHtml(tr.counters[i].get)}</div><button class="btn small gold" style="margin-top:6px" data-confirm="${i}">${tx('Accept the counter-offer of {name}', { name: p.name })}</button></div>` : `<span class="muted" style="font-size:13px">${tr.responses[i] === 'reject' ? tx('Declined') : tx('Thinking…')}</span>`}</div>`).join('');
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


// ------------------------------------------------------------ city improvements: a race track per discipline, everyone's marker visible
const IMP_UNLOCK = {
  trade: ['2:1', t => tx('Level 3: trade commodities 2:1 at the bank.')],
  politics: ['⚔', t => tx('Level 3: your knights can become mighty.')],
  science: ['💧', t => tx('Level 3: the aqueduct pays out a resource when you get nothing.')],
};
// the buildings printed on the tableaus, level 1 to 5
const IMP_NAMES = {
  science: ['School', 'Library', 'Aqueduct', 'Theater', 'University'],
  trade: ['Market', 'Guild', 'Merchant Guild', 'Bank', 'Trade Center'],
  politics: ['Town Hall', 'Embassy', 'Fortress', 'Court', 'Council of Broch'],
};
function improveHtml() {
  const v = G.view, L = v.legal || {};
  const mineP = isMine() ? me() : null;
  const tracks = [['trade', 'cloth', '#E0A32E'], ['politics', 'coin', '#2C6E9B'], ['science', 'paper', '#2E6B45']];
  const prev = G.prevImp || {};
  const next = {};
  const lanes = tracks.map(([tr, c, col]) => {
    const holder = v.metropolis?.[tr];
    const lead = Math.max(...v.players.map(p => p.improvements[tr]));
    const byLevel = {};
    v.players.forEach((p, i) => { (byLevel[p.improvements[tr]] ||= []).push(i); });
    let steps = '';
    for (let i = 1; i <= 5; i++) {
      const label = i === 3 ? IMP_UNLOCK[tr][0] : i === 4 ? '♛' : i === 5 ? '★' : i;
      steps += `<div class="step s${i} ${i <= lead ? 'lit' : ''}" style="--c:${col}" title="${esc(`${t(IMP_NAMES[tr][i - 1])} · ${t('Red die: 1–{n}', { n: i + 1 })}`)}${i === 3 ? esc(' · ' + htmlToText(IMP_UNLOCK[tr][1]())) : i === 4 ? esc(' · ' + t('Level 4: the first player here raises a metropolis (+2 points).')) : i === 5 ? esc(' · ' + t('Level 5: your metropolis here is safe.')) : ''}"><span>${label}</span></div>`;
    }
    let tokens = '';
    Object.entries(byLevel).forEach(([lvl, ids]) => {
      ids.forEach((pi, k) => {
        const key = `${tr}-${pi}`;
        next[key] = +lvl;
        const from = prev[key] !== undefined && prev[key] !== +lvl ? prev[key] : null;
        const p = v.players[pi];
        tokens += `<span class="tok ${pi === v.me ? 'me' : ''}" data-key="${key}" ${from != null ? `data-from="${from}" data-to="${lvl}"` : ''} style="--lv:${lvl};--k:${k};--n:${ids.length}" title="${esc(p.name)} · ${esc(term(tr))} ${lvl}">${houseIcon(p.color, 20)}</span>`;
      });
    });
    const imp = L.improve?.[tr];
    const why = mineP && !(imp && imp.ok) ? improveWhy(tr, c) : '';
    const btn = mineP ? `<button class="imp-btn ${why ? 'off' : ''}" data-improve="${tr}" ${why ? `data-why="${esc(why)}" aria-disabled="true"` : ''} title="${esc(why || (imp ? t('Improve {track} ({n} {res})', { track: term(tr), n: imp.cost, res: resName(c) }) : term(tr)))}" style="--c:${col}"><b>+</b><span>${mineP.improvements[tr] < 5 ? mineP.improvements[tr] + 1 : ''}</span>${glyph(c, 14)}</button>` : '<span class="imp-btn ghosty"></span>';
    const aq = tr === 'science' && mineP && mineP.improvements.science >= 3
      ? (mineP.aqueduct
        ? `<button class="aq-chip" data-aqueduct title="${esc(t('Aqueduct: {res}. Tap to change.', { res: resName(mineP.aqueduct) }))}" style="background:${CARD_COLOR[mineP.aqueduct]}">💧${glyph(mineP.aqueduct, 14)}</button>`
        : `<button class="aq-chip todo" data-aqueduct title="${esc(t('Aqueduct'))}">💧 ?</button>`) : '';
    const crown = holder != null ? `<span class="metro" style="--pc:${PCOLOR[v.players[holder].color]}" title="${esc(t('Metropolis: {name}', { name: v.players[holder].name }))}">♛</span>` : '';
    return `<div class="lane ${tr}" style="--c:${col}">
      <div class="lane-l"><span class="lane-ic" style="background:${col}">${glyph(c, 15)}</span><b>${esc(term(tr))}</b></div>
      <div class="track"><div class="cols">${steps}</div>${tokens}</div>${crown}${aq}${btn}</div>`;
  }).join('');
  G.prevImpNext = next;
  const noCity = mineP && !Object.values(v.buildings).some(b => b.p === v.me && b.type === 'city');
  const decks = v.progressDecks ? `<div class="muted imp-foot">${tx('Decks: science {a}, trade {b}, politics {c}', { a: v.progressDecks.science, b: v.progressDecks.trade, c: v.progressDecks.politics })}</div>` : '';
  return `<div class="panel imp"><div class="panel-h">${tx('City improvements')}<span class="spacer"></span><span style="font-weight:500">${tx('everyone at a glance')}</span></div><div class="lanes">${lanes}</div>
    ${noCity ? `<div class="imp-warn">${glyph('city', 16)}<span>${tx('You need a city first.')}</span></div>` : ''}
    <div class="muted imp-foot">${tx('Level 3 unlocks a bonus. The first to level 4 raises a metropolis (+2).')}</div>${decks}</div>`;
}
// why an improvement cannot be bought right now (shown when the greyed button is tapped)
function improveWhy(tr, comm) {
  const v = G.view, m = me();
  const actor = v.phase === 'play' && !v.pending.length && ((v.step === 'main' && v.current === v.me) || (v.step === 'sbp' && v.sbp?.queue[0] === v.me));
  if (!actor) return t('It is not your move right now.');
  if (!Object.values(v.buildings).some(b => b.p === v.me && b.type === 'city')) return t('You need a city first.');
  const lvl = m.improvements[tr];
  if (lvl >= 5) return t('Already at the top.');
  const block = v.legal?.improve?.[tr]?.block;
  if (block) return t(block);
  const cost = v.legal?.improve?.[tr]?.cost ?? lvl + 1;
  return htmlToText(tf('You need {$c}.', { c: { [comm]: cost } }));
}
function animateImprovements() {
  if (!G.prevImpNext) return;
  document.querySelectorAll('.tok[data-from]').forEach(el => {
    const from = +el.dataset.from, to = +el.dataset.to;
    const track = el.parentElement;
    const colW = track.offsetWidth / 6;
    el.style.transition = 'none';
    el.style.setProperty('--shift', `${(from - to) * colW}px`);
    el.classList.add('hopping');
    void el.offsetWidth;
    el.style.transition = '';
    requestAnimationFrame(() => { el.style.setProperty('--shift', '0px'); setTimeout(() => el.classList.remove('hopping'), 900); });
  });
  G.prevImp = G.prevImpNext;
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
  const pg = el.closest('[data-prog]'); if (pg) return progressDialog(+pg.dataset.prog);
  if (el.closest('[data-aqueduct]')) return aqueductChoice();
  const im = el.closest('[data-improve]');
  if (im) { if (im.dataset.why) { sfx.error(); toast(im.dataset.why, 'warn'); return; } return send({ type: 'improve', track: im.dataset.improve }); }
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
    case 'skipFreeKnight': return send({ type: 'placeFreeKnight', v: null });
    case 'pirateFrame': return send({ type: 'moveRobber', hex: -1 });
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
    case 'fish': return hub().fishDialog();
    case 'goldTrade': return goldDialog();
    case 'missions': return missionsDialog();
    case 'wonders': return wondersDialog();
    default: if (isHub(v)) hub().action(what);
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

// The aqueduct (science level 3): pick the resource once, right when the level is reached. From then on the server
// pays it out by itself whenever a roll (not a 7) gives you nothing. The chip in the science lane changes it.
function aqueductChoice() {
  choiceDialog(tx('Aqueduct'), tx('Choose your resource once. From now on the aqueduct pays it out whenever a roll gives you nothing (except on a 7).'), resChoices(), res => send({ type: 'setAqueduct', res }));
}
function aqueductPrompt() {
  const v = G.view;
  if (v.mode !== 'knights' || !isMine() || v.phase !== 'play') return;
  const m = me();
  if (m.improvements.science < 3 || m.aqueduct || G.opened.has('aqueduct-pick')) return;
  if (document.querySelector('.modal-back') || myPending().length) return;
  if (window.BROCH_FX_BUSY) { setTimeout(() => { if (G && G.view === v) aqueductPrompt(); }, 400); return; }
  G.opened.add('aqueduct-pick');
  aqueductChoice();
}

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
  switch (mp.type) {
    case 'discard':
      return cardPicker({ heading: tx('Discard {n} cards', { n: mp.count }), text: tx('A 7 was rolled and you hold more than {n} cards.', { n: me().handLimit }), pool: handPool(), count: mp.count, confirm: cards => send({ type: 'discard', cards }) });
    case 'give':
      return cardPicker({ heading: mp.good ? tx('Good neighbors: a gift for {name}', { name: v.players[mp.to].name }) : tx('Wedding gift for {name}', { name: v.players[mp.to].name }), text: tx('Choose {n} cards to give.', { n: mp.count }), pool: handPool(), count: mp.count, confirm: cards => send({ type: 'give', cards }) });
    case 'goldPick': {
      const pool = Object.fromEntries(RES.filter(r => v.bank[r] > 0).map(r => [r, v.bank[r]]));
      return cardPicker({ heading: tx('Gold!'), text: tx('Choose {n} resources from the bank.', { n: mp.count }), pool, count: mp.count, haveText: 'bank {n}', confirm: cards => send({ type: 'pickGold', cards }) });
    }
    case 'steal':
      if (mp.cloth) return choiceDialog(tx('Steal from…'), tx('Take one random card or one bale of cloth.'), mp.options.map(p => ({ value: p, html: `${houseIcon(v.players[p].color)} ${esc(v.players[p].name)} · ${tx('Cards: {n}', { n: v.players[p].cards })} · ${tx('Cloth: {n}', { n: v.players[p].cloth })}` })), from => {
        const q = v.players[from];
        setTimeout(() => choiceDialog(tx('What do you take?'), '', [{ value: false, html: `${glyph('card', 18)} ${tx('A random resource card')}`, disabled: !q.cards }, { value: true, html: `${glyph('cloth', 18)} ${tx('A bale of cloth')}`, disabled: !q.cloth }], cloth => send({ type: 'steal', from, cloth }), false), 50);
      }, false);
      return choiceDialog(tx('Steal from…'), tx('You take one random card.'), mp.options.map(p => ({ value: p, html: `${houseIcon(v.players[p].color)} ${esc(v.players[p].name)} · ${tx('Cards: {n}', { n: v.players[p].cards })}` })), from => send({ type: 'steal', from }), false);
    case 'chooseProgress':
      return choiceDialog(tx('Draw a progress card'), tx('Pick a deck.'), ['science', 'trade', 'politics'].map(d => ({ value: d, html: esc(term(d)), style: `background:${DECK_COLOR[d]};color:#fff;border-color:transparent` })), deck => send({ type: 'chooseProgress', deck }), false);
    case 'aqueduct':
      return choiceDialog(tx('Aqueduct'), tx('Take one resource of your choice.'), resChoices(), res => send({ type: 'aqueduct', res }), false);
    case 'discardProgress': {
      const cards = me().progress;
      const giveBack = () => choiceDialog(tx('Give back a progress card'), tx('You may hold at most 4. The card goes under its deck.'), cards.map((c, i) => ({ value: i, html: esc(cardName(c)) })), idx => send({ type: 'discardProgress', idx }), false);
      if (!mp.mustPlay) return giveBack();
      const opts = cards.map((c, i) => ({ value: i, html: esc(cardName(c)), style: `background:${DECK_COLOR[PROGRESS_DECK[c]]};color:#fff;border-color:transparent` }));
      if (mp.canGiveBack) opts.push({ value: 'back', html: tx('Give one back instead') });
      return choiceDialog(tx('Play a progress card'), tx('You drew a 5th card. Nobody may hold more than 4: play one of your cards now.'),
        opts, idx => { if (idx === 'back') { giveBack(); return true; } const c = cards[idx]; playProgress(idx, c, (PROGRESS_INFO[c] || [])[1] ?? null); return true; }, false);
    }
    case 'harborGive': {
      const m = me();
      const opts = COMM.filter(c => m.comm[c] > 0).map(c => ({ value: c, html: `${glyph(c, 18)} ${esc(resName(c))} (${m.comm[c]})`, style: `background:${CARD_COLOR[c]};color:#fff;border-color:transparent;justify-content:flex-start` }));
      return choiceDialog(tx('Commercial Harbor'), t('{name} offers you 1 {res} for one of your commodities.', { name: v.players[mp.to].name, res: resName(mp.res) }), opts, comm => send({ type: 'harborGive', comm }), false);
    }
    case 'spy': {
      const r = v.reveal;
      const opts = (r?.progress || []).map((c, i) => ({ value: i, html: esc(cardName(c)) }));
      opts.push({ value: null, html: tx('Take nothing') });
      return choiceDialog(tx("{name}'s progress cards", { name: v.players[mp.target].name }), tx('Take one.'), opts, idx => send({ type: 'spyTake', idx }), false);
    }
    case 'masterMerchant': {
      const r = v.reveal; const pool = {};
      [...RES, ...COMM].forEach(k => { const n = (r.res[k] ?? r.comm[k]) || 0; if (n) pool[k] = n; });
      const n = Math.min(2, Object.values(pool).reduce((a, b) => a + b, 0));
      return cardPicker({ heading: tx("{name}'s hand", { name: v.players[mp.target].name }), text: tx('Take {n} cards.', { n }), pool, count: n, confirm: cards => send({ type: 'takeCards', cards }) });
    }
  }
}

function tradeDialog(counter) {
  const v = G.view;
  const types = [...RES, ...(v.mode === 'knights' ? COMM : []), ...(v.gold ? ['gold'] : [])];
  const give = counter ? { ...counter.get } : {}, get = counter ? { ...counter.give } : {}; // a counter starts from the offer, turned around
  modal(`<h2>${counter ? tx('Make a counter-offer') : tx('Offer a trade')}</h2><p class="muted" style="margin:0">${counter ? tx('Propose other terms. The active player decides whether to take them.') : tx('Everyone sees the offer and can accept. You pick who to trade with.')}</p>
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
  modal(`<div class="progress-card dev-card fx-flip"><b>${esc(cardName(type))}</b><small>${tx(type === 'knight' && v.hub?.scenario === 'traders' ? 'Move a barbarian to another path or road. On a road, draw a card from its owner.' : DEV_DESC[type])}</small></div>
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

function progressDialog(idx) {
  const v = G.view;
  const card = me().progress[idx];
  const [desc, param] = PROGRESS_INFO[card] || ['', null];
  const deck = PROGRESS_DECK[card];
  const forced = myPending().some(p => p.type === 'discardProgress' && p.mustPlay);
  const myTurn = v.current === v.me && v.phase === 'play' && v.step !== 'sbp' && (!v.pending.length || forced);
  const timing = card === 'alchemist' ? v.step === 'roll' : v.step === 'main';
  const why = !myTurn ? t('Play it on your turn.') : !timing ? (card === 'alchemist' ? t('The Alchemist is played before rolling.') : t('Roll the dice first.')) : '';
  modal(`<div class="progress-card ${deck} fx-flip"><b>${esc(cardName(card))}</b><small>${tx(desc)}</small></div>
    ${why ? `<p class="muted">${esc(why)}</p>` : ''}
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button>${!why ? `<button class="btn primary" id="play">${tx('Play card')}</button>` : ''}</div>`, {
    onMount(el, close) { el.querySelector('#play')?.addEventListener('click', () => { close(); playProgress(idx, card, param); }); },
  });
}

function playProgress(idx, card, param) {
  const v = G.view, L = v.legal || {};
  const go = extra => send({ type: 'playProgress', idx, ...extra });
  const opponents = v.players.map((p, i) => ({ p, i })).filter(x => x.i !== v.me);
  switch (param) {
    case null: return go({});
    case 'dice': {
      let red = 3, yellow = 4;
      return modal(`<h2>${esc(cardName('alchemist'))}</h2><p class="muted" style="margin:0">${tx('Choose the red and yellow dice. The event die is rolled normally.')}</p>
        <div style="margin-top:12px"><div class="muted" style="font-size:13px">${tx('Red')}</div><div class="row wrap" id="dr"></div></div>
        <div style="margin-top:10px"><div class="muted" style="font-size:13px">${tx('Yellow')}</div><div class="row wrap" id="dy"></div></div>
        <div class="foot"><button class="btn" data-close>${tx('Cancel')}</button><button class="btn primary" id="ok"></button></div>`, {
        onMount(el, close) {
          const draw = () => {
            el.querySelector('#dr').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<button class="die red" style="cursor:pointer;${n === red ? 'outline:3px solid #2B1E12' : 'opacity:.6'}" data-r="${n}">${n}</button>`).join('');
            el.querySelector('#dy').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<button class="die yellow" style="cursor:pointer;${n === yellow ? 'outline:3px solid #2B1E12' : 'opacity:.6'}" data-y="${n}">${n}</button>`).join('');
            el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { red = +b.dataset.r; draw(); });
            el.querySelectorAll('[data-y]').forEach(b => b.onclick = () => { yellow = +b.dataset.y; draw(); });
            el.querySelector('#ok').textContent = t('Roll {n}', { n: red + yellow });
          };
          draw();
          el.querySelector('#ok').onclick = async () => { if (await go({ red, yellow })) close(); };
        },
      });
    }
    case 'inventor': {
      const picked = [];
      return startPick('hexes', L.inventorHexes, t('Inventor: tap two number tiles to swap.'), async h => {
        if (picked.includes(h)) picked.splice(picked.indexOf(h), 1); else picked.push(h);
        G.pick.picked = picked.slice();
        if (picked.length === 2) { await go({ a: picked[0], b: picked[1] }); return false; }
        render(); return true;
      }, { picked });
    }
    case 'engineer': {
      const opts = Object.entries(v.buildings).filter(([, b]) => b.p === v.me && b.type === 'city' && !b.wall).map(([x]) => +x);
      return startPick('vertices', opts, t('Engineer: tap a city to wall in for free.'), x => go({ v: x }));
    }
    case 'medicine': {
      const opts = Object.entries(v.buildings).filter(([, b]) => b.p === v.me && b.type === 'settlement').map(([x]) => +x);
      return startPick('vertices', opts, t('Medicine: tap the settlement to upgrade (1 grain, 2 ore).'), x => go({ v: x }));
    }
    case 'merchant': return startPick('hexes', L.merchantHexes, t('Merchant: tap a tile next to your building.'), h => go({ hex: h }));
    case 'diplomat': return startPick('edges', L.openRoads, t('Diplomat: tap an open road to remove.'), e => go({ e }));
    case 'intrigue': return startPick('vertices', L.intrigue, t('Intrigue: tap an opposing knight on your road.'), x => go({ v: x }));
    case 'player':
      return choiceDialog(esc(cardName(card)), tx(PROGRESS_INFO[card][0]), opponents.map(({ p, i }) => ({ value: i, html: `${houseIcon(p.color)} ${esc(p.name)} · ${tx('Points: {n}', { n: p.vp })}` })), target => go({ target }));
    case 'harbor': {
      const offers = {};
      return modal(`<h2>${esc(cardName('commercialHarbor'))}</h2><p class="muted" style="margin:0">${tx('Offer 1 resource card to each opponent. Whoever owns a commodity must give you one of their choice; the others are skipped.')}</p>
        <div id="hb" style="margin-top:8px"></div><div class="foot"><button class="btn" data-close>${tx('Cancel')}</button><button class="btn primary" id="ok">${tx('Offer')}</button></div>`, {
        onMount(el, close) {
          const m = me();
          const draw = () => {
            const used = {}; Object.values(offers).forEach(r => { used[r] = (used[r] || 0) + 1; });
            el.querySelector('#hb').innerHTML = opponents.map(({ p, i }) => `<div class="row wrap" style="padding:6px 0;border-top:1px solid var(--line);gap:6px"><span class="spacer" style="min-width:110px">${houseIcon(p.color)} ${esc(p.name)}</span>${RES.map(r => {
              const free = (m.res[r] || 0) - (used[r] || 0) + (offers[i] === r ? 1 : 0);
              return `<button class="btn small" data-i="${i}" data-r="${r}" ${free < 1 ? 'disabled' : ''} title="${esc(resName(r))}" style="background:${CARD_COLOR[r]};color:#fff;border-color:transparent;${offers[i] === r ? 'outline:3px solid #2B1E12;' : 'opacity:.75;'}">${glyph(r, 16)}</button>`;
            }).join('')}</div>`).join('');
            el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const i = +b.dataset.i; if (offers[i] === b.dataset.r) delete offers[i]; else offers[i] = b.dataset.r; sfx.click(); draw(); });
          };
          draw();
          el.querySelector('#ok').onclick = async () => { if (await go({ offers })) close(); };
        },
      });
    }
    case 'cardType':
      return choiceDialog(esc(cardName('merchantFleet')), tx('Which card type do you want to trade 2:1 this turn?'), resChoices([...RES, ...COMM]), kind => go({ kind }));
    case 'resource':
      return choiceDialog(esc(cardName('resourceMonopoly')), tx('Each opponent gives you up to 2.'), resChoices(RES), kind => go({ kind }));
    case 'commodity':
      return choiceDialog(esc(cardName('tradeMonopoly')), tx('Each opponent gives you 1.'), resChoices(COMM), kind => go({ kind }));
  }
}

function knightMenu(vid) {
  const v = G.view, L = v.legal || {};
  const k = v.knights[vid], info = L.knights?.[vid];
  if (!k || !info) return;
  const lvl = [t(''), t('Basic knight'), t('Strong knight'), t('Mighty knight')][k.level];
  const free = v.free.promotes > 0;
  const opts = [];
  if (info.activate) opts.push({ value: 'activate', html: tx('Activate (1 grain)') });
  if (info.promote) opts.push({ value: 'promote', html: free ? tx('Promote (free, Smith)') : tx('Promote (1 wool, 1 ore)') });
  if (info.moves.length) opts.push({ value: 'move', html: tx('Move along your roads') });
  if (info.displace.length) opts.push({ value: 'displace', html: tx('Displace a weaker knight') });
  if (info.chase) opts.push({ value: 'chase', html: tx('Chase away the robber') });
  const state = k.active ? (k.activatedTurn === v.turn ? t('Active (activated this turn, can act next turn)') : t('Active')) : t('Inactive');
  if (!opts.length) { toast(`${lvl} · ${state}. ${t('Nothing to do with it right now.')}`); return; }
  choiceDialog(esc(lvl), esc(state), opts, what => {
    if (what === 'activate') return send({ type: 'activateKnight', v: vid });
    if (what === 'promote') return send({ type: 'promoteKnight', v: vid });
    if (what === 'move') return startPick('vertices', info.moves, t('Tap where the knight should go.'), to => send({ type: 'moveKnight', from: vid, to }));
    if (what === 'displace') return startPick('vertices', info.displace, t('Tap the knight to displace.'), to => send({ type: 'displaceKnight', from: vid, to }));
    if (what === 'chase') return send({ type: 'chaseRobber', v: vid });
  });
}

function fishDialog() {
  const v = G.view, m = me();
  const knights = v.mode === 'knights';
  const rows = [
    ['robber', t('Chase the robber away'), t('Move the robber to any tile and steal from a neighbour.')],
    ['steal', t('Steal a card'), t('Take a random card from a player of your choice.')],
    ['take', t('Take a resource'), t('Take any resource from the bank.')],
    ['road', t('Free road'), t('Build one road without paying.')],
    ['dev', knights ? t('Progress card') : t('Development card'), knights ? t('Draw a progress card from a deck you choose.') : t('Draw a development card for free.')],
  ];
  choiceDialog(tx('Spend fish'), tx('You have {n} fish. Fish cannot be stolen or lost to the robber.', { n: m.fish }), rows.map(([k, h, d]) => ({
    value: k, disabled: m.fish < FISH_COST[k] || (k === 'dev' && !knights && v.devDeck < 1),
    html: `<span style="display:flex;width:100%;align-items:center;gap:10px;text-align:left"><span class="fishcost">${FISH_COST[k]}<svg viewBox="0 0 24 24" width="14" height="14">${GLYPH.fish}</svg></span><span style="flex:1;min-width:0"><b style="display:block">${esc(h)}</b><small style="font-weight:400;opacity:.75">${esc(d)}</small></span></span>`,
    style: 'height:auto;line-height:1.25;padding:8px 10px;white-space:normal;text-align:left;display:block',
  })), what => {
    if (what === 'steal') {
      const opts = v.players.map((p, i) => ({ p, i })).filter(x => x.i !== v.me && x.p.cards > 0);
      if (!opts.length) { toast(t('Nobody has cards to steal.'), 'warn'); return false; }
      setTimeout(() => choiceDialog(tx('Steal from…'), tx('You take one random card.'), opts.map(({ p, i }) => ({ value: i, html: `${houseIcon(p.color)} ${esc(p.name)} · ${tx('Cards: {n}', { n: p.cards })}` })), target => send({ type: 'useFish', what: 'steal', target })), 30);
      return true;
    }
    if (what === 'take') {
      setTimeout(() => choiceDialog(tx('Take a resource'), '', resChoices(), res => send({ type: 'useFish', what: 'take', res })), 30);
      return true;
    }
    return send({ type: 'useFish', what });
  });
}

function goldDialog() {
  const m = me();
  choiceDialog(tx('Swap gold for a card'), tx('You have {n} gold. 2 gold buy any resource, up to twice per turn.', { n: m.gold }), resChoices(), res => send({ type: 'goldTrade', res }));
}

function missionsDialog() {
  const v = G.view, m = me(), L = v.legal || {};
  const row = (kind, icon, color, label) => {
    if (!v.missions.includes(kind)) return '';
    const vp = Math.min(3, Math.floor(m.delivered[kind] / 2));
    return `<div class="mission"><span class="ic" style="background:${color}">${glyph(icon, 20)}</span><div style="flex:1;min-width:0"><b>${esc(label)}</b><small>${tx('On board: {n} · delivered: {d} · {v}/3 points', { n: m.cargo[kind], d: m.delivered[kind], v: vp })}</small></div>
      <button class="btn small gold" data-deliver="${kind}" ${L.deliver?.[kind] ? '' : 'disabled'}>${tx('Deliver')}</button></div>`;
  };
  const lairs = (v.lairs || []).filter(l => l.hp > 0);
  modal(`<h2>${tx('Missions')}</h2><p class="muted" style="margin:0 0 8px">${tx('Every 2 deliveries to the council earn 1 point, up to 3 points per mission. A destroyed pirate lair is worth 1 point to whoever hit it most.')}</p>
    ${row('fish', 'fish', '#1F7A99', t('Fish for Broch'))}${row('spice', 'spice', '#B53A2A', t('Spices for Broch'))}
    ${v.missions.includes('lairs') ? `<div class="mission"><span class="ic" style="background:#1B1511">${glyph('skull', 20)}</span><div style="flex:1"><b>${tx('Pirate lairs')}</b><small>${lairs.length ? tx('Each hit costs 1 ore and 1 wool and needs a ship next to the lair.') : tx('No lairs found yet. Explore the fog.')}</small></div></div>
      ${lairs.map(l => `<div class="row" style="padding:4px 0 4px 52px"><span class="spacer">${tx('Lair · {n} hits left', { n: l.hp })}</span><button class="btn small" data-lair="${l.hex}" ${L.lairs?.includes(l.hex) ? '' : 'disabled'}>${tx('Attack')}</button></div>`).join('')}` : ''}
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
    onMount(el, close) {
      el.querySelectorAll('[data-deliver]').forEach(b => b.onclick = async () => { if (await send({ type: 'deliver', kind: b.dataset.deliver })) close(); });
      el.querySelectorAll('[data-lair]').forEach(b => b.onclick = async () => { if (await send({ type: 'attackLair', hex: +b.dataset.lair })) close(); });
    },
  });
}

function wondersDialog() {
  const v = G.view, L = v.legal || {}, mine = Object.entries(v.wonders).find(([, w]) => w.owner === v.me);
  const row = ([k, w]) => {
    const W = WONDER[k], owner = w.owner != null ? v.players[w.owner] : null;
    const lv = [1, 2, 3, 4].map(i => `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:3px;border:2px solid #B8832A;background:${i <= w.level ? '#F6CF57' : 'transparent'}"></i>`).join('');
    const can = L.wonders?.start?.includes(k);
    return `<div class="mission"><span class="ic" style="background:#8A5A2A">${glyph(W.icon, 22)}</span><div style="flex:1;min-width:0"><b>${tx(W.name)}</b><small>${tx(W.cond)}</small><small>${tx('Each level:')} ${cardsHtml(v.wonderCost[k])}</small>${owner ? `<small>${houseIcon(owner.color, 14)} ${esc(owner.name)} ${lv}</small>` : ''}</div>
      ${!owner ? `<button class="btn small gold" data-wstart="${k}" ${can ? '' : 'disabled'}>${tx('Claim')}</button>` : w.owner === v.me ? `<button class="btn small gold" data-wbuild ${L.wonders?.build && w.level < 4 ? '' : 'disabled'}>${tx('Build level {n}', { n: Math.min(4, w.level + 1) })}</button>` : ''}</div>`;
  };
  modal(`<h2>${tx('Wonders')}</h2><p class="muted" style="margin:0 0 8px">${tx('Meet the condition, claim a wonder and build its four levels. Finishing it wins; so does having 10 points on your turn with a higher level than everybody else.')}${mine ? '' : ' ' + tx('You can only build one wonder.')}</p>
    ${Object.entries(v.wonders).map(row).join('')}<div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
    onMount(el, close) {
      el.querySelectorAll('[data-wstart]').forEach(b => b.onclick = async () => { if (await send({ type: 'startWonder', wonder: b.dataset.wstart })) close(); });
      el.querySelector('[data-wbuild]')?.addEventListener('click', async () => { if (await send({ type: 'buildWonder' })) { close(); } });
    },
  });
}

function costsDialog() {
  const knights = G.view.mode === 'knights';
  const rows = [[t('Road'), COSTS.road, ''], [t('Settlement'), COSTS.settlement, t('1 point')], [t('City'), COSTS.city, t('2 points, double production')]];
  if (isSea(G.view)) rows.push([t('Ship'), COSTS.ship, t('Sails on sea edges; moves once per turn')]);
  if (G.view.rivers) rows.push([t('Bridge'), COSTS.bridge, t('Crosses a river; earns 3 gold')]);
  if (isHub(G.view)) rows.push(...hub().costRows(G.view));
  if (!knights) rows.push([t('Development card'), COSTS.dev, t('Knight, Road Building, Year of Plenty, Monopoly or a point')]);
  else rows.push([t('Knight'), COSTS.knight, t('Basic knight (inactive)')], [t('Activate knight'), { grain: 1 }, ''], [t('Promote knight'), { wool: 1, ore: 1 }, t('Mighty needs politics 3')], [t('City wall'), COSTS.wall, t('+2 hand limit')]);
  const o = G.view.options || {};
  const house = [o.robberReturn && t('House rule: forgotten robber'), o.knightsFree && t('House rule: knights without a limit'), o.startBoth && t('House rule: starting resources for both')].filter(Boolean);
  modal(`<h2>${tx('Building costs')}</h2><button class="btn gold block tut-open" data-tut-mode>▶ ${tx('How to play: {mode}', { mode: modeLabel(G.view) })}</button><div style="margin-top:10px">${rows.map(([n, c, d]) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="width:140px">${esc(n)}</b><span class="spacer">${cardsHtml(c)}</span><span class="muted" style="font-size:12px;text-align:right">${esc(d)}</span></div>`).join('')}</div>
    ${isHub(G.view) ? hub().costsExtra(G.view).map(x => `<p class="muted" style="font-size:13px">${esc(x)}</p>`).join('') : ''}
    ${G.view.expansion === 'seafarers' && SCEN[G.view.options?.scenario] ? `<h3 style="margin:12px 0 4px">${tx(SCEN[G.view.options.scenario].label)}</h3><ul class="muted" style="font-size:13px;margin:0;padding-left:18px">${SCEN[G.view.options.scenario].rules.map(r => `<li>${tx(r)}</li>`).join('')}</ul><p class="muted" style="font-size:13px;margin:6px 0 0">${tx('Win with {n} points.', { n: G.view.vpTarget ?? G.view.options.vpTarget })}</p>` : ''}
    ${knights ? `<p class="muted" style="font-size:13px">${tx('Improvements cost 1–5 commodities: cloth for trade, coin for politics, paper for science. Cities on forest, pasture and mountains yield a commodity instead of a second resource.')}</p>` : ''}
    ${!knights ? `<p class="muted" style="font-size:13px">${tx('Longest Road: 5 or more connected roads, 2 points. Largest Army: 3 or more played knights, 2 points. You may play 1 development card per turn, but not one you bought this turn.')}</p>` : ''}
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

