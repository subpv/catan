// Phone game dock: everything the game screen needs on a phone that is not part of the desktop page.
// Used by games/classic/screen.js and (through about 30 lines of glue) games/sgame.js. Pure DOM, no game logic.
//
// What it builds (all of it is hidden on the desktop by .m-only and shown by css/mobile-game.css in the phone queries):
//   .pstrip-host  one chip per player (house icon, name, points, cards), between the status strip and the board
//   .m-more       the round chat/menu button at the left of the primary row (with the unread badge)
//   .m-scrim      the dark layer behind the sheet
//   .m-sheetbar   the tab bar at the top of the sheet (.game-side) with the drag handle and the close button
//   .m-menu       the menu page of the sheet (how to play, costs, living board, language, sound, leave)
// State lives on .game: class "sheet-open" while the sheet is up, attribute data-sheet="players|chat|log|graphs|side|menu"
// (always set, it names the tab shown or the one that was shown last).
//
// Exports
//   pstripHtml(view)                      html of the player chips; chip = <button class="pc" data-seat="i">; classes cur (turn) and me
//   sheetBarHtml(tabs, current, unread)   html of the sheet tab bar; tabs = [[name, label]]
//   menuHtml(opts)                        html of the menu rows; opts = { life, howto, costs } (booleans: show the row)
//   buzz(pattern)                         vibrate, but only once the person has touched the page (the browser blocks it before)
//   yourMoveCue(app, wasMine, isMine)     call on every new state: buzzes and pulses the primary button when the move just became mine
//   measureDock(app)                      measures the dock and writes --m-dock-h on <html>; also called by mountDock on every size change
//   mountDock(app, ctx)                   builds the elements above inside an already rendered game page and wires them.
//        Returns destroy(); destroy() removes every listener, observer and the pushed history entry. It also carries
//        destroy.update()          call after every render: refreshes the chips, the tab bar and the unread badge
//        destroy.refresh()         redraw the labels after a language change
//        destroy.setSheet(name)    open the sheet on a tab ('players','chat','log','graphs','side','menu'); null closes it
//        destroy.isOpen(name?)     is the sheet open (on that tab)?
//        destroy.sheet()           name of the open tab or null
//   ctx (what differs per screen):
//        getView()   the current game view (players[], me, current, phase) or null while loading
//        onTab(tab)  'chat' | 'log' | 'graphs' was selected: draw the feed for it (the sheet is already visible)
//        unread()    number of unread chat messages
//        hasSide()   true when the 'side' tab (improvements / overview) has content;  sideLabel: label of that tab
//        costs(), howto()  menu actions (the row is left out when missing);  life(): true/false for the living-board row (omit to hide it)
//        onSheet(name|null)  optional, called after the sheet opened or closed
// Needs the DOM of the game page: .game > .game-main (.status, .hand-host, .board-wrap) and .game-side.
import { esc, t, houseIcon, glyph } from './core.js';
import { isPhone, isLandscapePhone, onPhoneChange, vibrate } from './phone.js';

// vibrate() only after the person has touched the page once (the browser blocks it before and logs an error)
export function buzz(pattern = 40) {
  try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; } catch { /* old engines */ }
  vibrate(pattern);
}
import { isMuted } from './fx.js';
import { lang } from './i18n.js';

const tx = (k, p) => esc(t(k, p));
const svg = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  players: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.2" cy="9" r="2.4"/><path d="M17 14.2c2.5 0 4 1.8 4 4.3"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  log: svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  graphs: svg('<path d="M4 20V4M4 20h16"/><path d="M8 15l4-5 3 3 5-7"/>'),
  side: svg('<path d="M3 20h18M5 20V9l4-3 4 3v11M13 20V4l6 4v12"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  book: svg('<path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z"/><path d="M12 6v13.5"/>'),
  coins: svg('<circle cx="9" cy="9" r="5"/><path d="M13.5 13.8A5 5 0 1 0 19 8.5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  lobby: svg('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>'),
  leave: svg('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
  speaker: on => svg(`<path d="M4 9h4l5-4v14l-5-4H4z"/>${on ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}`),
};

const firstChars = (s, n) => [...String(s)].slice(0, n).join('');

// ------------------------------------------------------------ pieces of html
export function pstripHtml(v) {
  if (!v || !v.players) return '';
  const cur = v.phase === 'over' ? -1 : v.current;
  return v.players.map((p, i) => {
    const over = p.cards != null && p.cards > (p.handLimit || 7);
    return `<button type="button" class="pc ${i === cur ? 'cur' : ''} ${i === v.me ? 'me' : ''}" data-seat="${i}" aria-label="${esc(p.name)} · ${tx('Points: {n}', { n: p.vp })}">${houseIcon(p.color, 20)}<span class="pc-nm">${esc(firstChars(p.name, 8))}</span><b class="pc-vp">${p.vp}</b>${p.cards != null ? `<span class="pc-n ${over ? 'warn' : ''}" aria-hidden="true"><i class="stk res"></i>${p.cards}</span>` : ''}</button>`;
  }).join('');
}

export function sheetBarHtml(tabs, current, unread = 0) {
  return `<span class="m-pill" aria-hidden="true"></span><div class="m-tabs" role="tablist">${tabs.map(([name, label]) =>
    `<button type="button" role="tab" class="m-tab ${name === current ? 'on' : ''}" data-sheet-tab="${name}" aria-selected="${name === current}" title="${esc(t(label))}">${ICON[name] || ''}<span class="m-tl">${tx(label)}</span>${name === 'chat' ? `<i class="unread" ${unread ? '' : 'hidden'}>${unread > 9 ? '9+' : unread}</i>` : ''}</button>`).join('')}</div>
    <button type="button" class="m-close" data-sheet-close aria-label="${tx('Close')}">${ICON.close}</button>`;
}

export function menuHtml({ life, howto = true, costs = true } = {}) {
  const row = (attrs, ic, label, extra = '', tag = 'button', cls = '') => `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="m-row ${cls}" ${attrs}><span class="mr-ic">${ic}</span><span class="mr-t">${label}</span>${extra}</${tag}>`;
  const muted = isMuted();
  return `<div class="m-menu-in">
    ${howto ? row('data-menu="howto"', ICON.book, tx('How to play'), '<span class="mr-go">›</span>') : ''}
    ${costs ? row('data-menu="costs"', ICON.coins, tx('Building costs'), '<span class="mr-go">›</span>') : ''}
    ${life != null ? row(`data-life aria-pressed="${!!life}"`, glyph('wool', 22), tx('Living board'), '<span class="mr-sw" aria-hidden="true"></span>', 'button', life ? 'on' : '') : ''}
    ${row('data-lang-pick', ICON.globe, tx('Language'), `<span class="mr-v">${esc(lang().toUpperCase())}</span>`)}
    <button type="button" class="m-row" data-mute><span class="mr-ic mute-ic">${ICON.speaker(!muted)}</span><span class="mr-t mute-lbl">${muted ? tx('Sound off') : tx('Sound on')}</span></button>
    ${row('href="#/"', ICON.lobby, tx('Back to lobby'), '', 'a')}
    ${row('data-leavegame', ICON.leave, tx('Leave this game'), '', 'button', 'danger')}
  </div>`;
}

// ------------------------------------------------------------ your move
// wasMine / isMine: does the engine wait for me (before and after this state)? Buzzes and pulses once when it just became mine.
export function yourMoveCue(app, wasMine, isMine) {
  const game = app && app.querySelector('.game');
  if (!game) return false;
  game.classList.toggle('my-move', !!isMine);
  if (!isMine || wasMine) return false;
  buzz([40, 60, 40]);
  game.classList.remove('move-pulse'); void game.offsetWidth; game.classList.add('move-pulse');
  setTimeout(() => game.classList.remove('move-pulse'), 1600);
  return true;
}

// ------------------------------------------------------------ dock height
// --m-dock-h = from the top of the hand chips to the bottom edge of the page (the dock panel). Where the board would end up
// shorter than 300px, the build buttons are capped (class dock-tall, --m-acts-max) and scroll inside the dock.
export function measureDock(app) {
  const main = app && app.querySelector('.game-main'), hand = main && main.querySelector('.hand-host');
  if (!main || !hand || !isPhone()) return 0;
  const root = document.documentElement;
  const h = Math.max(0, Math.round(main.getBoundingClientRect().bottom - hand.getBoundingClientRect().top));
  root.style.setProperty('--m-dock-h', h + 'px');
  const game = main.closest('.game');
  const acts = hand.querySelector('.actions'), board = main.querySelector('.board-wrap');
  // how tall would the board be without the cap? (the cap cuts `cut` pixels off the build buttons)
  const cut = acts ? Math.max(0, acts.scrollHeight - acts.clientHeight) : 0;
  const natural = board ? board.clientHeight - cut : 0;
  const full = acts ? acts.scrollHeight : 0;
  let cap = 0;
  if (!isLandscapePhone() && acts && natural > 0 && natural < 300 && full > 80) cap = Math.max(54, Math.round(full - (300 - natural)));
  if (cap >= full) cap = 0;
  game.classList.toggle('dock-tall', cap > 0);
  root.style.setProperty('--m-acts-max', cap + 'px');
  return h;
}

// ------------------------------------------------------------ mount
export function mountDock(app, ctx) {
  const game = app.querySelector('.game'), main = app.querySelector('.game-main'), side = app.querySelector('.game-side');
  if (!game || !main || !side) return Object.assign(() => {}, { update() {}, refresh() {}, setSheet() {}, isOpen: () => false, sheet: () => null });
  const status = main.querySelector('.status'), handHost = main.querySelector('.hand-host'), wrap = main.querySelector('.board-wrap');
  const mk = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
  const strip = mk('div', 'pstrip-host m-only');
  strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', t('Players'));
  status.after(strip);
  const more = mk('button', 'm-more m-only', `${ICON.chat}<span class="mm-lbl">${tx('More')}</span><i class="unread" hidden></i>`);
  more.type = 'button'; more.setAttribute('aria-label', t('More'));
  handHost.after(more);
  const scrim = mk('div', 'm-scrim m-only');
  game.insertBefore(scrim, side);
  const bar = mk('div', 'm-sheetbar m-only');
  side.prepend(bar);
  const menu = mk('div', 'm-menu m-only');
  side.append(menu);
  side.setAttribute('role', 'dialog'); side.setAttribute('aria-label', t('Menu'));
  game.dataset.sheet = 'chat';

  let open = null, last = 'chat', pushed = false, skipPop = 0, cache = {};
  const set = (key, el, html) => { if (cache[key] === html) return false; el.innerHTML = html; cache[key] = html; return true; };

  const tabs = () => [['players', 'Players'], ['chat', 'Chat'], ['log', 'Game log'], ['graphs', 'Stats'],
    ...(ctx.hasSide && ctx.hasSide() ? [[ 'side', ctx.sideLabel || 'Improve']] : []), ['menu', 'Menu']];
  const drawBar = () => {
    const unread = ctx.unread ? ctx.unread() : 0;
    const cur = game.dataset.sheet;
    const tabsEl = bar.querySelector('.m-tabs'), keep = tabsEl ? tabsEl.scrollLeft : 0;
    set('bar', bar, sheetBarHtml(tabs(), cur, unread));
    fitTabs(keep);
  };
  // the tab row scrolls when the labels do not fit (long languages): keep its position over a redraw, bring the chosen tab into view,
  // and fade the edge that has more behind it (--fl / --fr, read by the mask in mobile-game.css)
  const fadeTabs = () => {
    const el = bar.querySelector('.m-tabs');
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.style.setProperty('--fl', max > 1 && el.scrollLeft > 1 ? '22px' : '0px');
    el.style.setProperty('--fr', max > 1 && el.scrollLeft < max - 1 ? '22px' : '0px');
  };
  const fitTabs = (keep = 0) => {
    const el = bar.querySelector('.m-tabs');
    if (!el) return;
    el.scrollLeft = keep;
    const on = el.querySelector('.m-tab.on');
    if (on && el.scrollWidth > el.clientWidth) {
      const pad = 26;
      if (on.offsetLeft - pad < el.scrollLeft) el.scrollLeft = Math.max(0, on.offsetLeft - pad);
      else if (on.offsetLeft + on.offsetWidth + pad > el.scrollLeft + el.clientWidth) el.scrollLeft = on.offsetLeft + on.offsetWidth + pad - el.clientWidth;
    }
    fadeTabs();
  };
  bar.addEventListener('scroll', fadeTabs, true);
  const drawBadges = () => {
    const n = ctx.unread ? ctx.unread() : 0;
    game.querySelectorAll('.m-more .unread, .m-tab .unread').forEach(u => { u.hidden = !n; u.textContent = n > 9 ? '9+' : n; });
    more.classList.toggle('has-unread', n > 0);
  };
  const drawMenu = () => set('menu', menu, menuHtml({ life: ctx.life ? ctx.life() : undefined, howto: !!ctx.howto, costs: !!ctx.costs }));
  const drawStrip = () => {
    const v = ctx.getView && ctx.getView();
    if (!set('strip', strip, pstripHtml(v))) return;
    centreCurrent();
  };
  function centreCurrent() {
    const c = strip.querySelector('.pc.cur');
    if (!c) return;
    const target = c.offsetLeft - (strip.clientWidth - c.offsetWidth) / 2;
    if (strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, target);
  }

  // ---- opening and closing
  function apply(name) {
    const was = open;
    open = name;
    if (name) { last = name; game.dataset.sheet = name; }
    game.classList.toggle('sheet-open', !!name);
    side.toggleAttribute('aria-hidden', !name);
    drawBar();
    if (name) requestAnimationFrame(() => fitTabs(bar.querySelector('.m-tabs')?.scrollLeft || 0));
    if (name === 'menu') { cache.menu = null; drawMenu(); }
    if (name === 'chat' || name === 'log' || name === 'graphs') ctx.onTab && ctx.onTab(name);
    if (!!was !== !!name || was !== name) ctx.onSheet && ctx.onSheet(name);
  }
  function setSheet(name) {
    if (name == null) return close();
    if (name === 'side' && !(ctx.hasSide && ctx.hasSide())) name = 'players';
    if (!open) { try { history.pushState({ broch: 'sheet' }, ''); pushed = true; } catch { pushed = false; } }
    apply(name);
  }
  function close() {
    if (!open) return;
    apply(null);
    if (pushed) {
      pushed = false;
      if (history.state && history.state.broch === 'sheet') { skipPop++; history.back(); }
    }
  }
  const onPop = () => {
    if (skipPop > 0) { skipPop--; return; }
    if (open) { pushed = false; apply(null); }
  };
  window.addEventListener('popstate', onPop);
  try { if (history.state && history.state.broch === 'sheet') history.replaceState(null, ''); } catch { /* ignore */ }
  const onKey = e => { if (e.key === 'Escape' && open) { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey);

  // ---- clicks
  const onClick = e => {
    if (suppress) return;
    const el = e.target;
    const chip = el.closest('.pstrip-host .pc');
    if (chip) return setSheet('players');
    if (el.closest('.m-more')) return setSheet(last || 'chat');
    if (el.closest('.m-scrim')) return close();
    if (el.closest('[data-sheet-close]')) return close();
    const tab = el.closest('[data-sheet-tab]');
    if (tab) return setSheet(tab.dataset.sheetTab);
    const so = el.closest('[data-sheet-open]');
    if (so) return setSheet(so.dataset.sheetOpen);
    const m = el.closest('[data-menu]');
    if (m) {
      const what = m.dataset.menu;
      if (what === 'costs') ctx.costs && ctx.costs();
      else if (what === 'howto') { close(); ctx.howto && ctx.howto(); }
    }
    // the menu rows that other handlers deal with: leaving opens a dialog, so the sheet gets out of the way
    // (the link back to the lobby leaves the page: unmounting takes the sheet away, and a history.back() here would race the navigation)
    if (el.closest('.m-menu [data-leavegame]')) close();
    if (el.closest('.m-menu [data-life]')) setTimeout(() => { cache.menu = null; drawMenu(); }, 0);
    if (el.closest('.m-menu [data-mute]')) setTimeout(() => { cache.menu = null; drawMenu(); }, 0);
  };
  app.addEventListener('click', onClick, true);

  // ---- drag the sheet away (down in portrait, to the right in landscape)
  let drag = null, suppress = false;
  const axis = () => (isLandscapePhone() ? 'x' : 'y');
  bar.addEventListener('pointerdown', e => {
    if (!open || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), d: 0, active: false, id: e.pointerId, ax: axis() };
  });
  bar.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    const main_ = drag.ax === 'y' ? dy : dx, cross = drag.ax === 'y' ? dx : dy;
    if (!drag.active) {
      if (Math.abs(main_) < 8 || Math.abs(cross) > Math.abs(main_)) return;
      drag.active = true;
      try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      side.classList.add('dragging');
    }
    drag.d = Math.max(0, main_);
    side.style.transform = drag.ax === 'y' ? `translateY(${drag.d}px)` : `translateX(${drag.d}px)`;
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.active) return;
    side.classList.remove('dragging');
    side.style.transform = '';
    const speed = d.d / Math.max(1, performance.now() - d.t0);
    suppress = true; setTimeout(() => { suppress = false; }, 50);
    if (e.type === 'pointerup' && (d.d > 80 || (speed > 0.5 && d.d > 24))) close();
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // ---- the dock height
  let raf = 0;
  const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measureDock(app); }); };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(measure); ro.observe(handHost); if (wrap) ro.observe(wrap); ro.observe(main); }
  const offPhone = onPhoneChange(({ phone }) => {
    if (!phone) { close(); game.classList.remove('dock-tall'); document.documentElement.style.removeProperty('--m-dock-h'); document.documentElement.style.removeProperty('--m-acts-max'); }
    cache = {}; update(); measure();
  });
  const onWin = () => { measure(); fitTabs(bar.querySelector('.m-tabs')?.scrollLeft || 0); };
  window.addEventListener('resize', onWin);

  function update() {
    drawStrip(); drawBar(); drawBadges();
    if (open === 'menu') drawMenu();
    if (open === 'side' && !(ctx.hasSide && ctx.hasSide())) setSheet('players');
    measure();
  }
  function refresh() { cache = {}; more.querySelector('.mm-lbl').textContent = t('More'); more.setAttribute('aria-label', t('More')); update(); drawMenu(); }
  drawMenu();
  update();

  const destroy = () => {
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('resize', onWin);
    document.removeEventListener('keydown', onKey);
    app.removeEventListener('click', onClick, true);
    offPhone(); ro && ro.disconnect(); cancelAnimationFrame(raf);
    if (pushed && history.state && history.state.broch === 'sheet') { pushed = false; skipPop++; try { history.back(); } catch { /* ignore */ } }
    document.documentElement.style.removeProperty('--m-dock-h'); document.documentElement.style.removeProperty('--m-acts-max');
    [strip, more, scrim, bar, menu].forEach(e => e.remove());
  };
  return Object.assign(destroy, { update, refresh, setSheet, isOpen: name => (name ? open === name : !!open), sheet: () => open });
}
