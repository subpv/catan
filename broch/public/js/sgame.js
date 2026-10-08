// The game screen for the standalone games. It is the same page as game.js (status line, board, hand, players, chat,
// log, graphs, trades, victory), but everything that belongs to one game's rules comes from its plugin in games/.
import { esc, toast, modal, closeModals, wsWatch, wsAct, onWs, reportProblem, houseIcon, glyph, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, cardName, term, tf, t, isLightColor, dieHtml } from './core.js';
import { lang } from './i18n.js';
import { renderBoard } from './board.js';
import { topbar } from './app.js';
import { diff, play, sfx } from './fx.js';
import { victoryScene, closeVictory } from './victory.js';
import { openTutorial, closeTutorial, tutorialSeen } from './tutorial.js';
import { flag } from './countries.js';
import { createZoom } from './zoom.js';
import { chatHtml, historyHtml, graphsHtml, wireGraphs } from './feed.js';
import { GAMES } from './games/registry.js';

let G = null;
const tx = (k, p) => esc(t(k, p));
const plugin = () => GAMES[G.view?.mode] || GAMES[G.mode];

// ------------------------------------------------------------ mount
export function mountSGame(app, id, mode) {
  G = {
    id, mode, view: null, online: [], pick: null, tab: 'chat', opened: new Set(), celebrated: false, app, fresh: null, zoom: { z: 1, cx: 0, cy: 0 },
    html: {}, boardKey: null, boardRef: null, boardSig: '', chatSeenAt: 0, newestTurn: null, life: lifePref(), A: null,
  };
  G.A = api();
  const P0 = GAMES[mode];
  app.innerHTML = `${topbar('play')}<div class="game sgame ${esc(mode)}">
    <div class="game-main">
      <div class="status"><div class="msg"><span class="mt">${esc(t('Loading game…'))}</span></div></div>
      <div class="board-wrap">
        <div class="board-host"></div>
        <div class="hud-host"></div>
        <div class="trade-host"></div>
        <div class="zoom-ctl"><button data-life class="lifebtn ${G.life ? 'on' : ''}" aria-pressed="${G.life}" title="${tx('Living board')}" aria-label="${tx('Living board')}">${glyph(P0.lifeIcon || 'wool', 18)}</button><button data-zoom="in" aria-label="${tx('Zoom in')}">+</button><button data-zoom="out" aria-label="${tx('Zoom out')}">−</button><button data-zoom="reset" class="rs" aria-label="${tx('Show the whole board')}">⤢</button></div>
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
  G.zoomer = createZoom({ host: wrap, getState: () => G.zoom, setState: z => { G.zoom = z; }, onChange: z => wrap.querySelector('.zoom-ctl').classList.toggle('zoomed', z > 1) });
  app.addEventListener('click', onClick);
  const cf = app.querySelector('.chat-form');
  cf.addEventListener('submit', e => { e.preventDefault(); const tt = cf.t.value.trim(); if (tt) { send({ type: 'chat', text: tt }); cf.t.value = ''; } });
  cf.hidden = true;

  const off = onWs(msg => {
    if (msg.t === 'state' && msg.game === G?.id) {
      const prev = G.view;
      G.view = msg.state; G.online = msg.online || [];
      if (!prev) setTimeout(tutNudge, 1500);
      const d = diff(prev, G.view);
      G.fresh = d.fresh;
      if (prev) Object.assign(G.fresh, plugin().fresh?.(G.view, prev) || {}); // pieces only this game has
      onNewState(prev);
      plugin().afterState?.(G.view, prev, G.A); // may queue a scene, so dialogs wait for it
      render();
      G.fresh = null;
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
    off(); app.removeEventListener('click', onClick);
    G?.zoomer?.destroy();
    document.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', vis); window.removeEventListener('resize', resize);
  };
}
export function unmountSGame() {
  if (!G) return;
  G.zoomer?.destroy();
  closeVictory(); closeTutorial();
  wsWatch(null); G = null; closeModals(); document.title = 'Broch';
}
export function rerenderSGame() { if (G && G.view) { G.html = {}; G.boardKey = null; render(); } }

// what a plugin may use
function api() {
  return {
    get view() { return G.view; },
    get G() { return G; },
    me: () => G.view.players[G.view.me],
    isMine: () => G.view.me >= 0,
    send, pname, tx, pick: startPick, render, toast, choiceDialog, cardPicker, cardsHtml, costHtml, has, htmlToText, chipIcon, bank: () => bankDialog(), trade: () => tradeDialog(),
    actor: () => G.view.phase === 'play' && !G.view.pending.length && G.view.step === 'main' && G.view.current === G.view.me,
    myPending: () => G.view.pending.filter(p => p.group === G.view.activeGroup && p.player === G.view.me),
    openTutorial: () => openTutorial(plugin().tutorial),
  };
}

function tutNudge() {
  if (!G || !G.view) return;
  const id = plugin().tutorial;
  let gone = [];
  try { gone = JSON.parse(localStorage.getItem('broch_tut_nudged') || '[]'); } catch { /* storage blocked */ }
  if (!id || tutorialSeen(id) || gone.includes(id) || G.view.phase === 'over') return;
  const wrap = G.app.querySelector('.board-wrap');
  if (!wrap || wrap.querySelector('.tut-nudge')) return;
  const el = document.createElement('div');
  el.className = 'tut-nudge';
  el.innerHTML = `<button class="tn-go">▶ ${tx('How {mode} works (1 min)', { mode: t(plugin().name) })}</button><button class="tn-x" aria-label="${tx('Close')}">✕</button>`;
  const remember = () => { try { if (!gone.includes(id)) gone.push(id); localStorage.setItem('broch_tut_nudged', JSON.stringify(gone)); } catch { /* storage blocked */ } el.remove(); };
  setTimeout(() => { if (el.isConnected) { el.classList.add('out'); setTimeout(remember, 400); } }, 15000);
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
const has = cost => { const m = me(); return !!m && !!m.res && Object.entries(cost).every(([k, n]) => (m.res[k] || 0) >= n); };
const costHtml = cost => Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('');
const cardsHtml = cards => Object.entries(cards).filter(([, n]) => n > 0).map(([k, n]) => `<span class="mini" style="background:${CARD_COLOR[k]}">${n} ${esc(resName(k))}</span>`).join(' ');
const chipIcon = (name, bg) => `<span class="ic" style="background:${bg}">${glyph(name, 13)}</span>`;
const setHtml = (el, key, html) => { if (!el || G.html[key] === html) return false; el.innerHTML = html; G.html[key] = html; return true; };

// ------------------------------------------------------------ status line
function statusInfo() {
  const v = G.view, P = plugin(), A = G.A;
  const mine = needsMe(v);
  if (v.phase === 'over') {
    const msg = v.winner == null ? t(P.lostText || 'Nobody wins.') : t('{name} wins!', { name: pname(v.winner) });
    return { msg, sub: tx('The result is saved to the stats page.'), btns: `${v.winner != null ? `<button class="btn gold" data-do="celebrate">${tx('Celebrate')}</button>` : ''}<a class="btn" href="#/stats">${tx('Stats')}</a>` };
  }
  if (G.pick) return { msg: esc(G.pick.label), sub: esc(G.pick.sub || ''), mine: true, btns: `${G.pick.extra || ''}<button class="btn" data-do="cancelPick">${tx('Cancel')}</button>` };
  if (v.phase === 'setup') {
    const s = P.setupText?.(v, A);
    if (mine) {
      // a game with several kinds of setup steps (harbors, roads, ships) words every step itself: setupText returns always: true
      if (s && s.always) return { msg: esc(s.msg), sub: esc(s.sub || ''), mine };
      const msg = v.setup.need === 'road' ? t('Place a road next to it.') : (s && s.msg) || (v.setup.round === 1 ? t('Place your first settlement.') : t('Place your second settlement.'));
      return { msg: esc(msg), sub: v.setup.need === 'road' ? tx('Tap a glowing edge.') : esc((s && s.sub) || t('Tap a glowing corner. Buildings need at least one empty corner between them.')), mine };
    }
    return { msg: v.setup.need === 'road' ? t('{name} is placing a road…', { name: pname(v.current) }) : t('{name} is placing a building…', { name: pname(v.current) }) };
  }
  const pend = v.pending.filter(p => p.group === v.activeGroup);
  if (pend.length) {
    const mp = myPending()[0];
    if (mp) {
      const T = (P.pendingText && P.pendingText(mp, v, A)) || (mp.type === 'discard' ? [t('Discard {n} cards.', { n: mp.count }), t('You hold more than your hand limit.'), t('Choose cards')] : [t('Make your choice.'), '', t('Choose')]);
      return { msg: esc(T[0]), sub: esc(T[1] || ''), mine: true, btns: T[2] ? `<button class="btn primary" data-do="pendingDialog">${esc(T[2])}</button>` : '' };
    }
    const who = [...new Set(pend.map(p => p.player))].map(pname).join(', ');
    return { msg: t('Waiting for {names} to decide…', { names: who }) };
  }
  if (v.current !== v.me) return { msg: v.step === 'roll' ? t('Waiting for {name} to roll…', { name: pname(v.current) }) : t('{name} is taking their turn.', { name: pname(v.current) }) };
  if (v.step === 'roll') {
    const x = P.rollStatus?.(v, A) || {};
    // a game may put something before the roll (New Energies draws its event chips first): rollStatus can return { msg, sub, btns }
    return { msg: x.msg ? esc(x.msg) : tx('Your turn. Roll the dice.'), sub: esc(x.sub || ''), mine: true, btns: x.btns != null ? x.btns : `<button class="btn primary roll-btn" data-do="roll">🎲 ${tx('Roll dice')}</button>` };
  }
  const x = P.mainStatus?.(v, A) || {};
  return {
    msg: esc(x.msg || t('Build, trade or end your turn.')), sub: esc(x.sub || ''), mine: true,
    // a game may decide which trade buttons are open (Explorers & Pirates: none while ships move, only the bank for ship 2)
    btns: `${P.tradeButtons ? P.tradeButtons(v, A) : `<button class="btn" data-do="trade">${tx('Trade')}</button><button class="btn" data-do="bank" title="${tx('Trade with the bank')}">${glyph('bank', 15)}${tx('Bank')}</button>`}${P.mainButtons ? P.mainButtons(v, A) : ''}<button class="btn primary" data-do="endTurn">${tx('End turn')}</button>`,
  };
}
function diceHtml() {
  const d = G.view.dice;
  if (!d) return '';
  return `<div class="dice" title="${esc(t('Rolled {n}', { n: d.total }))}">${dieHtml(d.red, 'red')}${dieHtml(d.yellow, 'yellow')}<b class="dsum ${d.total === 7 ? 'seven' : ''}">${d.total}</b></div>`;
}
function renderStatus() {
  const el = G.app.querySelector('.status');
  const st = statusInfo();
  const cls = `status ${st.mine ? 'mine' : ''}`;
  if (el.className !== cls) el.className = cls;
  setHtml(el, 'status', `<div class="msg"><span class="mt">${st.msg}</span>${st.sub ? `<span class="sub">${st.sub}</span>` : ''}</div>
    <div class="dice-slot">${diceHtml()}</div><div class="btns">${st.btns || ''}</div>`);
}

// ------------------------------------------------------------ board
function targets() {
  const v = G.view, L = v.legal || {}, P = plugin();
  if (v.phase === 'over' || !isMine()) return {};
  if (G.pick) return { [G.pick.kind]: G.pick.options, picked: G.pick.picked };
  if (L.setupSpots) return { vertices: L.setupSpots };
  if (L.setupRoads) return { edges: L.setupRoads };
  return (P.targets && P.targets(v, G.A)) || {};
}
function onBoardClick(e) {
  const el = e.target.closest('[data-v],[data-e],[data-h]');
  if (!el) return;
  const v = G.view, L = v.legal || {}, P = plugin();
  const id = +(el.dataset.v ?? el.dataset.e ?? el.dataset.h);
  if (G.pick) { G.pick.onPick(id); return; }
  if (L.setupSpots) return send({ type: 'placeSettlement', v: id });
  if (L.setupRoads) return send({ type: 'placeRoad', e: id });
  P.onBoardClick?.(el, id, G.A);
}
function startPick(kind, options, label, onPick, extra = {}) {
  if (!options || !options.length) { toast(t('There is nowhere to do that right now.'), 'warn'); return; }
  G.pick = { kind, options, label, onPick: async id => { const keep = await onPick(id); if (!keep) { G.pick = null; render(); } }, version: G.view.version, ...extra };
  render();
  document.querySelector('.board-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function boardKey(tg) {
  const v = G.view, P = plugin();
  if (v.board !== G.boardRef) { G.boardRef = v.board; const sig = JSON.stringify(v.board.hexes); if (sig !== G.boardSig) { G.boardSig = sig; G.boardGen = (G.boardGen || 0) + 1; } }
  return JSON.stringify([G.boardGen, v.buildings, v.roads, v.longestRoad, v.players.map(p => p.color), tg, lang(), G.life, P.boardKey ? P.boardKey(v) : null]);
}
function renderBoardPart() {
  const host = G.app.querySelector('.board-host');
  const tg = targets();
  const key = boardKey(tg);
  const fr = G.fresh;
  const freshAny = fr && (fr.verts.size || fr.edges.size || fr.hexes.size || fr.any);
  if (key === G.boardKey && !freshAny) return;
  G.boardKey = key;
  const P = plugin();
  host.innerHTML = P.board ? P.board(G.view, tg, G.fresh, G.zoom, G.life, G.A) : renderBoard(G.view, tg, G.fresh, G.zoom, G.life, true, P.ext && P.ext(G.view, G.A));
  G.zoomer.apply();
  syncLoops(host);
  if (freshAny) {
    clearTimeout(G.fxClean);
    G.fxClean = setTimeout(() => host.querySelectorAll('.fx-flash,.fx-roadglow,.fx-light,.fx-dust,.fx-splash').forEach(el => el.remove()), 2600);
  }
}
// endless animations run on one clock so a redraw does not restart them (same trick as game.js)
function syncLoops(root) {
  if (!root || !root.getAnimations) return;
  let list;
  try { list = root.getAnimations({ subtree: true }); } catch { return; }
  for (const a of list) {
    if (a.startTime === 0) continue;
    const tm = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming();
    if (!tm || tm.iterations !== Infinity) continue;
    try { a.startTime = 0; } catch { /* very old engines */ }
  }
}

// ------------------------------------------------------------ render
function render() {
  if (!G || !G.view) return;
  const P = plugin(), v = G.view;
  renderStatus();
  renderBoardPart();
  setHtml(G.app.querySelector('.hud-host'), 'hud', `<div class="board-hud">${P.hud ? P.hud(v, G.A) : ''}</div>`);
  renderTrade();
  setHtml(G.app.querySelector('.hand-host'), 'hand', isMine() ? handHtml() : `<div class="hand watching"><b>${tx('You are watching this game.')}</b></div>`);
  setHtml(G.app.querySelector('.players-host'), 'players', playersHtml());
  setHtml(G.app.querySelector('.imp-host'), 'side', P.side ? P.side(v, G.A) : '');
  P.afterRender?.(v, G.A);
  renderFeed();
  autoDialogs();
  syncLoops(G.app);
}

// ------------------------------------------------------------ your hand
function handHtml() {
  const v = G.view, m = me(), P = plugin(), A = G.A;
  const card = k => {
    const n = (m.res && m.res[k]) || 0;
    return `<div class="rcard ${n ? '' : 'zero'} ${(P.tokenKeys || []).includes(k) ? 'comm' : ''}" data-card="${k}" style="--c:${CARD_COLOR[k]}" title="${esc(resName(k))}: ${n}">${glyph(k, 26)}<span class="nm">${esc(resName(k))}</span>${n ? `<span class="n">${n}</span>` : ''}</div>`;
  };
  const actor = A.actor();
  const pickOn = k => G.pick && G.pick.key === k ? 'on' : '';
  const acts = (P.actions ? P.actions(v, A, actor) : []).map(a => a.plain
    ? `<button class="act" data-do="${a.key}" ${a.enabled ? '' : 'disabled'} title="${esc(a.label)}"><span class="nm"><i class="ai">${glyph(a.icon, 14)}</i>${esc(a.label)}</span><small>${esc(a.sub || '')}</small></button>`
    : `<button class="act ${pickOn(a.key)}" data-do="${a.key}" ${a.enabled ? '' : 'disabled'} title="${esc(a.label)}"><span class="nm"><i class="ai">${glyph(a.icon, 14)}</i>${esc(a.label)}</span><small><span class="cd">${costHtml(a.cost || {})}${a.costText ? `<span class="ctext">${esc(a.costText)}</span>` : ''}</span>${a.left != null ? `<span class="left">${a.left}</span>` : ''}</small></button>`).join('');
  const over = m.cards > m.handLimit;
  return `<div class="hand">
    <div class="hand-head"><b>${tx('Your hand')}</b><span class="hand-count ${over ? 'warn' : ''}" title="${over ? tx('More than {n} cards: a 7 costs you half of them.', { n: m.handLimit }) : ''}">${tx('Cards: {n} · limit {m}', { n: m.cards, m: m.handLimit })}</span></div>
    <div class="hand-cards">${v.cards.map(card).join('')}</div>
    <div class="actions">${acts}</div>
    ${P.handExtra ? P.handExtra(v, A) : ''}
  </div>`;
}

// ------------------------------------------------------------ players
function playersHtml() {
  const v = G.view, P = plugin();
  const rows = v.players.map((p, i) => {
    const online = G.online.includes(p.userId);
    const target = v.options.vpTarget;
    const pct = Math.max(0, Math.min(100, Math.round(p.vp / target * 100)));
    const ring = isLightColor(p.color) ? PCOLOR_DARK[p.color] : PCOLOR[p.color];
    const awards = P.awards ? P.awards(v, i, G.A) : '';
    const over = p.cards > (p.handLimit || 7);
    const meta = [`<span class="mp ${over ? 'warn' : ''}" title="${tx('Cards: {n}', { n: p.cards })}${over ? ' · ' + tx('More than {n} cards: a 7 costs you half of them.', { n: p.handLimit }) : ''}"><i class="stk res"></i>${p.cards}</span>`];
    if (P.playerMeta) meta.push(P.playerMeta(v, p, i, G.A));
    return `<div class="player ${i === v.current && v.phase !== 'over' ? 'cur' : ''} ${i === v.me ? 'me' : ''}" data-seat="${i}">
      ${houseIcon(p.color, 22)}
      <div class="pbody"><div class="nm">${flag(p.country)} <span class="nmt">${esc(p.name)}</span>${i === v.me ? ` <span class="muted" style="font-weight:400">(${tx('you')})</span>` : ''} <span class="online-dot ${online ? 'on' : ''}" title="${online ? tx('Online') : tx('Offline')}"></span>${awards}</div>
      <div class="meta">${meta.join('')}</div></div>
      <div class="vpr" style="--p:${pct};--c:${ring}" title="${tx('Points: {n}', { n: p.vp })} / ${target}"><span><b>${p.vp}</b><small>/${target}</small></span></div>
    </div>`;
  }).join('');
  return `<div class="panel"><div class="panel-h"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tx('Players')}</span><span class="spacer"></span><span style="white-space:nowrap">${esc(t(P.name))} · ${tx('turn {n}', { n: v.turn })}</span></div>${rows}</div>`;
}

// ------------------------------------------------------------ trade offers (same behaviour as game.js: one panel per offer)
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
  const allNo = v.players.every((p, i) => i === tr.from || tr.responses[i] === 'reject');
  if (allNo && G.tradeFading !== tr.id) {
    G.tradeFading = tr.id;
    setTimeout(() => { if (G && G.view) { G.tradeGone = tr.id; render(); } }, 2000);
  }
  const mineOffer = tr.from === v.me;
  let body = `<div class="trade-line">${t('{name} gives', { name: pname(tr.from) })} ${cardsHtml(tr.give)}</div><div class="trade-line" style="margin-top:4px">${tx('and wants')} ${cardsHtml(tr.get)}</div>`;
  if (mineOffer) {
    const rows = v.players.map((p, i) => i === v.me ? '' : `<div class="row" style="margin-top:6px"><span class="spacer">${pname(i)}</span>${tr.responses[i] === 'accept' ? `<button class="btn small gold" data-confirm="${i}">${tx('Trade with {name}', { name: p.name })}</button>` : `<span class="muted" style="font-size:13px">${tr.responses[i] === 'reject' ? tx('Declined') : tx('Thinking…')}</span>`}</div>`).join('');
    body += rows + `<div class="row" style="margin-top:10px"><button class="btn small" data-do="cancelTrade">${tx('Withdraw offer')}</button></div>`;
  } else if (isMine()) {
    const r = tr.responses[v.me];
    const can = has(tr.get);
    body += r ? `<div class="muted" style="margin-top:8px;font-size:13px">${r === 'accept' ? tx('You accepted. Waiting for them to confirm.') : tx('You declined.')}</div>`
      : `<div class="row" style="margin-top:10px"><button class="btn small gold" data-respond="1" ${can ? '' : 'disabled'}>${tx('Accept')}</button><button class="btn small" data-respond="0">${tx('Decline')}</button>${can ? '' : `<span class="muted" style="font-size:12px">${tx('You lack the cards.')}</span>`}</div>`;
  }
  const first = G.tradeSeen !== tr.id;
  G.tradeSeen = tr.id;
  return `<div class="board-trade ${first ? 'fx-slide' : ''} ${allNo ? 'trade-out' : ''}" data-tid="${tr.id}"><div class="panel-h">${tx('Trade offer')}</div><div class="trade-box">${body}</div></div>`;
}

// ------------------------------------------------------------ feed
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
    const key = newest ? newest.dataset.turn : null;
    if (newest && G.newestTurn && G.newestTurn !== key && G.html.feedTab === 'log') newest.classList.add('fx-in');
    G.newestTurn = key;
  } else wireGraphs(body, v);
  G.html.feedTab = G.tab;
}

// ------------------------------------------------------------ clicks
function onClick(e) {
  if (!G || !G.view) return;
  const el = e.target;
  if (el.closest('.board-host svg')) { if (!G.zoomer.wasDrag()) onBoardClick(e); return; }
  if (el.closest('[data-life]')) return toggleLife();
  const z = el.closest('[data-zoom]');
  if (z) { const k = z.dataset.zoom; if (k === 'reset') G.zoomer.reset(); else G.zoomer.zoomBy(k === 'in' ? 1.5 : 1 / 1.5); return; }
  const d = el.closest('[data-do]');
  if (d && !d.disabled) return doAction(d.dataset.do);
  const cf = el.closest('[data-confirm]'); if (cf) return send({ type: 'confirmTrade', with: +cf.dataset.confirm });
  const rs = el.closest('[data-respond]'); if (rs && !rs.disabled) return send({ type: 'respondTrade', id: G.view.trade.id, accept: rs.dataset.respond === '1' });
  if (plugin().onClick && plugin().onClick(el, G.A)) return;
  const tb = el.closest('.feed [data-tab]');
  if (tb) {
    if (tb.dataset.tab === 'rules') return costsDialog();
    G.tab = tb.dataset.tab; sfx.click();
    renderFeed();
    if (G.tab === 'chat' && matchMedia('(hover: hover)').matches) G.app.querySelector('.chat-form input')?.focus();
  }
}
function doAction(what) {
  switch (what) {
    case 'roll': return send({ type: 'roll' });
    case 'endTurn': return send({ type: 'endTurn' });
    case 'cancelPick': G.pick = null; return render();
    case 'cancelTrade': return send({ type: 'cancelTrade' });
    case 'trade': return tradeDialog();
    case 'bank': return bankDialog();
    case 'celebrate': return showCelebration();
    case 'pendingDialog': G.opened.clear(); return autoDialogs(true);
    default: return plugin().doAction?.(what, G.A);
  }
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
          <div class="rcard" style="background:${CARD_COLOR[k]};width:44px;height:58px">${glyph(k, 22)}</div>
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
function autoDialogs(force = false) {
  const v = G.view;
  if (!isMine() || v.phase !== 'play') return;
  const mp = myPending()[0];
  if (!mp) return;
  const key = `${mp.type}-${mp.group}`;
  if (G.opened.has(key) && !force) return;
  if (document.querySelector('.modal-back')) return;
  if (window.BROCH_FX_BUSY && !force) { setTimeout(() => { if (G && G.view === v) autoDialogs(); }, 400); return; }
  G.opened.add(key);
  if (mp.type === 'discard') {
    const pool = {};
    (plugin().limited || v.cards).forEach(k => { if (me().res[k]) pool[k] = me().res[k]; });
    return cardPicker({ heading: tx('Discard {n} cards', { n: mp.count }), text: tx('A 7 was rolled and you hold more than {n} cards.', { n: me().handLimit }), pool, count: mp.count, confirm: cards => send({ type: 'discard', cards }) });
  }
  plugin().pendingDialog?.(mp, G.A);
}
function tradeDialog() {
  const v = G.view, P = plugin();
  const types = P.tradeKeys || v.cards;
  const give = {}, get = {};
  modal(`<h2>${tx('Offer a trade')}</h2><p class="muted" style="margin:0">${tx('Everyone sees the offer and can accept. You pick who to trade with.')}</p>
    <div class="section-label" style="color:var(--muted)">${tx('You give')}</div><div class="picker" id="tg"></div>
    <div class="section-label" style="color:var(--muted)">${tx('You want')}</div><div class="picker" id="tw"></div>
    <div class="foot"><button class="btn" data-close>${tx('Cancel')}</button><button class="btn" id="tbank">${tx('Bank instead')}</button><button class="btn primary" id="tok">${tx('Offer')}</button></div>`, {
    onMount(el, close) {
      const m = me();
      const draw = () => {
        const cell = (sel, k, have) => `<div class="pick ${sel[k] ? 'on' : ''}"><div class="rcard" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div>
          <div class="have">${have != null ? tx('have {n}', { n: have }) : esc(resName(k))}</div><div class="ctr"><button data-s="${sel === give ? 'g' : 'w'}" data-k="${k}" data-d="-1">−</button><b>${sel[k] || 0}</b><button data-s="${sel === give ? 'g' : 'w'}" data-k="${k}" data-d="1">+</button></div></div>`;
        el.querySelector('#tg').innerHTML = types.map(k => cell(give, k, m.res[k] || 0)).join('');
        el.querySelector('#tw').innerHTML = types.map(k => cell(get, k, null)).join('');
        el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
          const sel = b.dataset.s === 'g' ? give : get, k = b.dataset.k, d = +b.dataset.d;
          const nv = Math.max(0, (sel[k] || 0) + d);
          if (sel === give && nv > (m.res[k] || 0)) return;
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
      el.querySelector('#tbank').onclick = () => { close(); bankDialog(); };
      el.querySelector('#tok').onclick = async () => {
        const clean = o => Object.fromEntries(Object.entries(o).filter(([, n]) => n));
        if (await send({ type: 'offerTrade', give: clean(give), get: clean(get) })) close();
      };
    },
  });
}
function bankDialog() {
  const v = G.view, L = v.legal || {}, P = plugin();
  if (P.bankDialog) return P.bankDialog(G.A); // a game with other trading rules brings its own dialog
  const ratios = L.ratios || {};
  const types = Object.keys(ratios).filter(k => ratios[k]);
  const buys = P.bankBuys || v.cards;
  let give = null, get = null;
  modal(`<h2>${tx('Trade with the bank')}</h2><p class="muted" style="margin:0">${esc(t(P.bankText || 'Your rates come from your harbors.'))}</p>
    <div class="section-label" style="color:var(--muted)">${tx('Give')}</div><div class="picker" id="bg"></div>
    <div class="section-label" style="color:var(--muted)">${tx('Get 1')}</div><div class="picker" id="bw"></div>
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button><button class="btn primary" id="bok" disabled>${tx('Trade')}</button></div>`, {
    onMount(el) {
      const have = k => (me().res[k] || 0);
      const draw = () => {
        el.querySelector('#bg').innerHTML = types.map(k => `<button class="pick ${give === k ? 'on' : ''}" data-g="${k}" ${have(k) < ratios[k] ? 'disabled style="opacity:.4"' : ''}>
          <div class="rcard" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><b>${ratios[k]}:1</b><span class="have">${tx('have {n}', { n: have(k) })}</span></button>`).join('');
        el.querySelector('#bw').innerHTML = buys.map(k => `<button class="pick ${get === k ? 'on' : ''}" data-w="${k}" ${k === give || (G.view.bank[k] !== undefined && !G.view.bank[k]) ? 'disabled style="opacity:.4"' : ''}>
          <div class="rcard" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><span class="have">${esc(resName(k))}</span></button>`).join('');
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
function costsDialog() {
  const P = plugin();
  modal(`<h2>${tx('Building costs')}</h2><button class="btn gold block tut-open" data-tut-mode>▶ ${tx('How to play: {mode}', { mode: t(P.name) })}</button><div style="margin-top:10px">${P.costsHtml ? P.costsHtml(G.view, G.A) : ''}</div>
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
    onMount: el => el.querySelector('[data-tut-mode]')?.addEventListener('click', () => { closeModals(); openTutorial(P.tutorial); }),
  });
}
function showCelebration() {
  const v = G.view;
  if (!v || v.winner == null) return;
  closeModals();
  victoryScene(v, {
    title: `${t(plugin().name)} · ${t('turn {n}', { n: v.turn })}`,
    actions: `<a class="btn gold" href="#/stats">${tx('See stats')}</a><a class="btn ghost" href="#/">${tx('Back to lobby')}</a>`,
  });
}
function celebrateWhenCalm(tries = 0) {
  if (!G) return;
  if (window.BROCH_FX_BUSY && tries < 40) { setTimeout(() => celebrateWhenCalm(tries + 1), 150); return; }
  if (G.view.winner == null) { plugin().lostScene?.(G.view, G.A); return; }
  showCelebration();
}
