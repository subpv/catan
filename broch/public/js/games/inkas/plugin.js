// Rise of the Inkas (Der Aufstieg der Inka): the plugin for the standalone game. Andean board art (inkas-art.js), the tribe
// tablet with its three tribes, thickets over buildings in decline, the robber on the frame, development cards and the
// two advantage cards (Longest Trade Route, Mightiest Combat Arts).
import { register } from '../registry.js';
import { extendCore, glyph, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, GLYPH, resName, cardName, term, houseIcon, modal } from '../../core/core.js';
import { enqueue, layer, hold, sfx, LOOT_BY_MODE, AWARDS_BY_MODE } from '../../core/fx.js';
import { DEV_DESC } from '../../core/cards.js';
import * as art from './art.js';

const tx = (k, p) => esc(t(k, p));

// ------------------------------------------------------------ new cards, terms and icons
extendCore({
  names: { timber: 'Wood', stone: 'Stone', fleece: 'Wool', metal: 'Ore', potato: 'Potatoes', catch: 'Fish', coca: 'Coca', feathers: 'Feathers' },
  colors: { timber: '#2F7D4A', stone: '#B4653F', fleece: '#9CC15C', metal: '#6E7F8D', potato: '#D9A33A', catch: '#3E8FB0', coca: '#1F8A5A', feathers: '#C1272D' },
  terms: {
    tribe1: 'first tribe', tribe2: 'second tribe', thicket: 'Thicket', robber: 'Robber', coast: 'Coastal waters', plantation: 'Jungle plantation', jungle: 'Jungle', frame: 'Frame piece with jungle',
    forest: 'Forest', hills: 'Quarry', pasture: 'Pasture', mountains: 'Mountains', fields: 'Fields',
  },
  cards: { combat: 'Combat Arts', invention: 'Invention', inMonopoly: 'Monopoly' },
  glyphs: {
    timber: '<rect x="3" y="4.500" width="17" height="6.500" rx="3.200" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6.300" cy="7.750" r="1.200" fill="currentColor"/><rect x="5" y="13" width="17" height="6.500" rx="3.200" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.300" cy="16.250" r="1.200" fill="currentColor"/>',
    stone: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    fleece: GLYPH.wool,
    metal: '<path d="M4 15l3-7 5-3 6 3 3 7-5 4H9z M7 8l5 3 6-3 M12 11v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    potato: '<path d="M4.500 14c0-5 4-8 9-8 4 0 6.500 3 5.500 7-1 5-6 7.500-10 6.500-2.800-.7-4.500-2.700-4.500-5.500z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9.500" cy="12" r="1" fill="currentColor"/><circle cx="14.500" cy="14.500" r="1" fill="currentColor"/><circle cx="12.500" cy="9.500" r="1" fill="currentColor"/>',
    catch: '<path d="M3 12c4-6 10-6 14 0-4 6-10 6-14 0z M17 12l4-4v8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8.500" cy="11" r="1.100" fill="currentColor"/>',
    feather: '<path d="M20 3C9 3 5 10 5 15v1l-2 5M5 16c5 0 9-2 11-6M9 12l2-5M11 15l3-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    feathers: '<path d="M20 3C9 3 5 10 5 15v1l-2 5M5 16c5 0 9-2 11-6M9 12l2-5M11 15l3-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    coca: '<path d="M12 21V11 M12 12C7 12 4.500 8.500 4.500 4c5 0 7.500 3 7.500 8z M12 14c5 0 7.500-3 7.500-7.500-5 0-7.500 3-7.500 7.500z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    thicket: '<path d="M3 20c3-3 4-7 9-8 5-1 6-5 9-8 M7 17c0-3 2-4 4-4 M13 11c0-3 1-4 4-5 M4 12c2-1 3-3 3-5 M14 20c1-2 3-3 6-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    temple: '<path d="M2.500 20.500v-3h3.500v-4h4v-4h4v-4h2v4h2v4h2v4h2v3z M9.500 20.500v-3h5v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    bohio: '<path d="M4.500 20.500v-8L12 3.500l7.500 9v8z M10 20.500v-5h4v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    sun: '<circle cx="12" cy="12" r="4.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.500v3 M12 18.500v3 M2.500 12h3 M18.500 12h3 M5.300 5.300l2.100 2.100 M16.600 16.600l2.100 2.100 M18.700 5.300l-2.100 2.100 M7.400 16.600l-2.100 2.100" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    combat: GLYPH.sword,
    inMonopoly: GLYPH.monopoly,
    invention: '<path d="M12 3l1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900z M18.500 16l.8 2.200 2.200.8-2.200.8-.8 2.200-.8-2.200-2.200-.8 2.200-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  },
});
LOOT_BY_MODE.inkas = { timber: 'forest', stone: 'hills', fleece: 'pasture', metal: 'mountains', potato: 'fields', catch: 'coast', coca: 'plantation', feathers: 'jungle' };
AWARDS_BY_MODE.inkas = { road: ['Longest Trade Route', 'Advantage card'], army: ['Mightiest Combat Arts', 'Advantage card'] };
DEV_DESC.combat = 'Move the robber and take a card from a player next to it. Each open Combat Arts card protects 1 more hand card on a 7.';
DEV_DESC.invention = 'Take any 2 resource or trade good cards from the supply.';
DEV_DESC.inMonopoly = 'Name a resource or trade good. Every other player gives you up to 2 of that card.';

const RAW = ['timber', 'stone', 'fleece', 'metal', 'potato'], GOODS = ['catch', 'coca', 'feathers'], RES = [...RAW, ...GOODS];
const COSTS = { road: { timber: 1, stone: 1 }, settlement: { timber: 1, stone: 1, potato: 1, fleece: 1 }, city: { potato: 2, metal: 3 }, dev: { potato: 1, fleece: 1, metal: 1 } };
const DEV = ['combat', 'roadBuilding', 'invention', 'inMonopoly'];
const TRIBES = [
  { id: 'early', num: 'I', name: 'Early culture', n: 4, from: 0, color: '#6E9A3F' },
  { id: 'middle', num: 'II', name: 'Middle culture', n: 4, from: 4, color: '#C9831B' },
  { id: 'late', num: 'III', name: 'Late culture', n: 3, from: 8, color: '#9A4A8F' },
];

// ------------------------------------------------------------ board
function ext(view) {
  art.ensureFrame(view.board);
  return {
    color: h => art.TERRAIN_COLOR[h.terrain],
    glyph: h => art.TERRAIN_GLYPH[h.terrain],
    life: art.tileLife,
    building: (b, c) => art.building(b, c),
    shape: art.shape,
    backdrop: art.backdrop,
    noRim: h => !art.LAND.includes(h.terrain),
    noHalo: true,
  };
}

// ------------------------------------------------------------ panels
const costRow = (cost, size = 14) => Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('');
const pieceIcons = (list, color) => list.map(k => `<span class="in-pc ${k}">${glyph(k === 'city' ? 'temple' : 'bohio', 15)}</span>`).join('');
const col = c => PCOLOR[c] || c;
const GOAL_HTML = [
  `<span class="in-goal">${pieceIcons(['s', 's', 's', 's'])}</span><i>${'or'}</i><span class="in-goal">${pieceIcons(['s', 's', 'city'])}</span>`,
  `<span class="in-goal">${pieceIcons(['s', 's', 's', 's'])}</span><i>${'or'}</i><span class="in-goal">${pieceIcons(['s', 's', 'city'])}</span>`,
  `<span class="in-goal">${pieceIcons(['s', 's', 's'])}</span><i>${'or'}</i><span class="in-goal">${pieceIcons(['s', 'city'])}</span>`,
];
// the culture board of one player: three tribes with 4 + 4 + 3 steps, filled from the bottom up
function tablet(v, i) {
  const p = v.players[i];
  const cols = TRIBES.map((tr, k) => {
    const filled = Math.max(0, Math.min(tr.n, p.markers - tr.from));
    const state = k < p.tribe ? 'done' : k === p.tribe ? 'on' : 'next';
    const slots = Array.from({ length: tr.n }, (_, s) => `<i class="in-slot ${s < filled ? 'full' : ''}" style="${s < filled ? `background:${col(p.color)};border-color:${PCOLOR_DARK[p.color]}` : ''}"></i>`).join('');
    return `<div class="in-tribe ${state}" style="--tc:${tr.color}"><div class="in-th"><b>${tr.num}</b><small>${tx(tr.name)}</small></div><div class="in-slots">${slots}</div>
      <div class="in-goalrow" title="${tx('Goal of this tribe')}">${GOAL_HTML[k].replace('>or<', `>${esc(t('or'))}<`)}</div>${state === 'done' ? `<span class="in-fall" title="${tx('In decline')}">${glyph('thicket', 18)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="in-tab">${cols}</div>`;
}
function progressRow(v, i) {
  const p = v.players[i];
  const pips = TRIBES.map((tr, k) => `<span class="in-pg">${Array.from({ length: tr.n }, (_, s) => `<i class="${p.markers - tr.from > s ? 'on' : ''}" style="${p.markers - tr.from > s ? `background:${col(p.color)}` : ''}"></i>`).join('')}</span>`).join('');
  return `<div class="in-prow ${i === v.current && v.phase === 'play' ? 'cur' : ''}">${houseIcon(p.color, 16)}<span class="in-pn">${esc(p.name)}</span>${pips}<b>${p.markers}</b></div>`;
}
function tabletPanel(v, A) {
  const who = v.me >= 0 ? v.me : v.current;
  const pl = v.players[who];
  const others = v.players.map((_, i) => i).filter(i => i !== who);
  return `<div class="panel in-tablet"><div class="panel-h">${tx('Culture board')}<span class="spacer"></span><span class="muted" style="font-weight:600">${esc(pl.name)} · ${pl.markers}/11</span></div>
    ${tablet(v, who)}
    <p class="in-rule">${esc(t(['Every settlement and every city upgrade adds a culture marker. At 4 markers the tribe declines: roads go back, buildings get thickets, and you found the next tribe for free.', 'Second tribe: 4 more markers. When it falls, the buildings of the first tribe are cleared away.', 'Third tribe: 3 markers win the game (11 in all).'][pl.tribe] || ''))}</p>
    ${others.length ? `<div class="in-rows">${others.map(i => progressRow(v, i)).join('')}</div>` : ''}</div>`;
}
function advantagePanel(v, A) {
  const L = v.legal || {}, ik = v.inkas, lr = v.longestRoad, actor = A.actor(), mine = v.me >= 0;
  const holder = p => (p == null ? `<span class="muted">${tx('Nobody yet')}</span>` : `${houseIcon(v.players[p].color, 14)} <b>${esc(v.players[p].name)}</b>`);
  const rob = v.board.hexes[v.robber];
  const where = rob && rob.frame ? t('on the jungle frame') : rob ? `${t(term(rob.terrain))} ${rob.number}` : '';
  return `<div class="panel in-adv"><div class="panel-h">${tx('Advantage cards')}</div>
    <div class="in-ac"><span class="in-aci" style="--c:#C9971B">${glyph('road', 16)}</span><div><b>${tx('Longest Trade Route')}</b> ${lr.p != null ? `<small>(${lr.len})</small>` : ''}<div>${holder(lr.p)}</div>
      <small class="muted">${tx('3 connected roads. Once per turn: trade 2 cards for 1 with the supply.')}</small></div>
      ${mine && lr.p === v.me ? `<button class="btn small ${L.roadTrade ? 'gold' : ''}" data-in-roadtrade ${L.roadTrade ? '' : 'disabled'}>${tx('Trade 2 for 1')}</button>` : ''}</div>
    <div class="in-ac"><span class="in-aci" style="--c:#B23A2A">${glyph('combat', 16)}</span><div><b>${tx('Mightiest Combat Arts')}</b> ${ik.army.p != null ? `<small>(${ik.army.count})</small>` : ''}<div>${holder(ik.army.p)}</div>
      <small class="muted">${tx('2 open Combat Arts cards. Once per turn: move the robber from a field next to your building onto the frame and take 1 resource of that field.')}</small></div>
      ${mine && ik.army.p === v.me ? `<button class="btn small ${L.army && L.army.length ? 'gold' : ''}" data-in-army ${L.army && L.army.length ? '' : 'disabled'}>${tx('Move robber')}</button>` : ''}</div>
    <div class="in-ac"><span class="in-aci" style="--c:#3A2A1C">${glyph('robber', 16)}</span><div><b>${tx('Robber')}</b><div class="muted" style="font-size:13px">${esc(where)}</div></div></div></div>`;
}

// ------------------------------------------------------------ scenes
function declineScene(view, d) {
  enqueue(async () => {
    sfx.drums?.();
    const who = view.players[d.p], tr = TRIBES[d.tribe];
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('{name} leads the {tribe} to success', { name: esc(who.name), tribe: esc(t(tr.name)) })}</div>
      <div class="ev-discs">
        <div class="ev-disc brown" style="animation-delay:.1s"><div class="ev-face">${glyph('road', 40)}</div><b>${tx('Roads go back')}</b><small>${tx('All roads return to the supply.')}</small></div>
        <div class="ev-disc brown" style="animation-delay:.6s"><div class="ev-face">${glyph('thicket', 40)}</div><b>${tx('Thickets')}</b><small>${tx('The tribe declines: its buildings are covered with thickets.')}</small></div>
        <div class="ev-disc green" style="animation-delay:1.1s"><div class="ev-face" style="background:radial-gradient(circle at 35% 30%, ${TRIBES[Math.min(2, d.tribe + 1)].color}, #3A2A14)">${glyph('bohio', 40)}</div><b>${tx('A new tribe')}</b><small>${tx('A free settlement. Your turn ends.')}</small></div>
      </div></div>`);
    await hold(sc, 3600);
  });
}

// ------------------------------------------------------------ the plugin
const plugin = register({
  id: 'inkas', name: 'Rise of the Inkas', vp: 11, fixedVp: true, minPlayers: 3, maxPlayers: 4, tutorial: 'inkas', lifeIcon: 'sun',
  tagline: 'Lead three tribes to success, one after the other.',
  blurb: 'A landscape of Peru between the Pacific and the jungle. Build settlements and cities to lead your early, middle and late tribe to success; every tribe then declines under thickets and the next one begins. Whoever completes the third tribe first, with 11 development points, wins. For 3 or 4 players.',
  lobbyOptions: [{ key: 'freeStart', label: 'Free founding phase', hint: 'Place the start settlements yourselves instead of the beginner layout.' }, { key: 'variableLand', label: 'Random landscape', hint: 'Shuffle the land fields (variable set-up of the almanac). Starts with the free founding phase.' }],
  tokenKeys: GOODS, limited: RES, bankBuys: RES, tradeKeys: RES,
  bankText: 'Trade with the supply: 3 equal resources, 2 equal trade goods or 3 different trade goods.',
  ext, boardKey: v => JSON.stringify([v.robber, v.inkas && v.inkas.army.p]),
  fresh(view, prev) {
    const seen = Math.max(0, ...((prev.inkas && prev.inkas.declines) || []).map(d => d.seq));
    const any = ((view.inkas && view.inkas.declines) || []).some(d => d.seq > seen);
    return { any };
  },
  bankDialog,

  hud(v) {
    const me = v.me >= 0 ? v.players[v.me] : null;
    const tr = me ? TRIBES[me.tribe] : null;
    return `${tr ? `<span class="hud-pill" style="--c:${tr.color}" title="${tx('Your tribe')}">${glyph('sun', 15)} ${tr.num} <small>${tx(tr.name)}</small></span>` : ''}
      ${me ? `<span class="hud-pill" title="${tx('Development points')}">${glyph('temple', 15)} ${me.markers}/11</span>` : ''}
      <span class="hud-pill devdeck" title="${tx('Development cards left: {n}', { n: v.inkas.deck })}"><i class="stk dev"></i>${v.inkas.deck}</span>`;
  },
  side(v, A) { return tabletPanel(v, A) + advantagePanel(v, A); },
  playerMeta(v, p) {
    const tr = TRIBES[p.tribe];
    return `<span class="mp" title="${tx('Development points')}" style="color:#B8860B">${glyph('temple', 12)}${p.markers}</span><span class="mp" title="${esc(t(tr.name))}" style="color:${tr.color}">${tr.num}</span>`
      + `${p.devCount ? `<span class="mp" title="${tx('Development cards')}"><i class="stk dev"></i>${p.devCount}</span>` : ''}${p.played ? `<span class="mp" title="${tx('Open Combat Arts cards')}">${glyph('combat', 12)}${p.played}</span>` : ''}`;
  },
  awards(v, i) {
    let out = '';
    if (v.longestRoad.p === i) out += `<span class="award" title="${tx('Longest Trade Route')}">${glyph('road', 11)}${v.longestRoad.len}</span>`;
    if (v.inkas.army.p === i) out += `<span class="award red" title="${tx('Mightiest Combat Arts')}">${glyph('combat', 11)}${v.inkas.army.count}</span>`;
    return out;
  },
  rollStatus() { return { sub: t('A 7 moves the robber. You may play a development card first.') }; },
  mainStatus() { return { msg: t('Build, trade or end your turn.'), sub: t('Settlements and cities lead your tribe to success.') }; },
  pendingText(mp, v) {
    if (mp.type === 'discard') return [t('Discard {n} cards.', { n: mp.count }), t('The robber is near: you hold more than your hand limit.'), t('Choose cards')];
    if (mp.type === 'robber') return [t('Move the robber.'), t('Tap a land field or a jungle frame piece. You take a card from a player next to it.'), t('Choose field')];
    if (mp.type === 'found') return [t('Found your next tribe.'), t('Place a free settlement on a crossing that no road leads to. No yield: your turn ends.'), t('Choose crossing')];
    if (mp.type === 'freeroad') return [t('Build your free roads.'), t('Roads left: {n}', { n: mp.left }), t('Choose road')];
    return null;
  },
  pendingDialog(mp, A) {
    const L = A.view.legal || {};
    if (mp.type === 'robber') {
      const hexes = Object.keys(L.robber || {}).map(Number);
      A.pick('hexes', hexes, t('Tap a field or a jungle frame piece for the robber.'), h => {
        const vs = L.robber[h] || [];
        if (vs.length <= 1) return A.send({ type: 'moveRobber', h, victim: vs[0] });
        A.choiceDialog(tx('Take a card from…'), '', vs.map(q => ({ value: q, html: `${houseIcon(A.view.players[q].color, 18)} ${esc(A.view.players[q].name)}` })), victim => A.send({ type: 'moveRobber', h, victim }));
        return true;
      }, { key: 'robber' });
    } else if (mp.type === 'found') {
      A.pick('vertices', L.found, t('Tap a crossing for the first settlement of your next tribe (if none is left, one of your buildings in decline makes room).'), v => A.send({ type: 'foundTribe', v }), { key: 'found' });
    } else if (mp.type === 'freeroad') {
      A.pick('edges', L.roads, t('Tap where to build a free road.'), e => A.send({ type: 'placeFreeRoad', e }), { key: 'road' });
    }
  },

  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me();
    return [
      { key: 'road', label: t('Road'), icon: 'road', cost: COSTS.road, enabled: !!(actor && L.roads && L.roads.length), left: m.pieces.roads },
      { key: 'settlement', label: t('Settlement'), icon: 'bohio', cost: COSTS.settlement, enabled: !!(actor && L.settlements && L.settlements.length), left: m.pieces.settlements },
      { key: 'city', label: t('City'), icon: 'temple', cost: COSTS.city, enabled: !!(actor && L.cities && L.cities.length), left: m.pieces.cities },
    ];
  },
  doAction(what, A) {
    const L = A.view.legal || {};
    switch (what) {
      case 'road': return A.pick('edges', L.roads, t('Tap where to build your road.'), e => A.send({ type: 'buildRoad', e }), { key: 'road' });
      case 'settlement': return A.pick('vertices', L.settlements, t('Tap where to set up your settlement. A building in decline can be built over.'), x => A.send({ type: 'buildSettlement', v: x }), { key: 'settlement' });
      case 'city': return A.pick('vertices', L.cities, t('Tap the settlement to grow into a city.'), x => A.send({ type: 'buildCity', v: x }), { key: 'city' });
      case 'buy': return A.send({ type: 'buyCard' });
      default: return undefined;
    }
  },
  // the development cards under the hand
  handExtra(v, A) {
    const m = A.me(), L = v.legal || {}, bought = v.inkas.bought || {};
    const cards = DEV.filter(c => m.dev && m.dev[c]).map(c => {
      const n = m.dev[c], fresh = n - (bought[c] || 0) < 1, ready = !!(L.cards && L.cards[c]);
      return `<button class="dcard ${ready ? 'ready' : ''} ${fresh ? 'fresh' : ''}" data-in-card="${c}" title="${esc(cardName(c))}: ${esc(t(DEV_DESC[c]))}"><span class="dc-ic">${glyph(c, 17)}</span><span class="dc-nm">${esc(cardName(c))}</span>${n > 1 ? `<span class="n">${n}</span>` : ''}${fresh ? `<i class="dc-new">${tx('new')}</i>` : ''}</button>`;
    }).join('');
    const canBuy = A.actor() && L.canBuy;
    const buy = `<button class="dcard buy" data-do="buy" ${canBuy ? '' : 'disabled'} title="${tx('Development card')}"><span class="dc-plus">+</span><span class="dc-nm" style="font-size:10.5px">${tx('Dev card')}</span><span class="dc-cost">${costRow(COSTS.dev)}</span></button>`;
    return `<div class="devrow"><span class="lbl">${tx('Development cards')}<b>${m.devCount || 0}</b></span><div class="dcards">${cards}${buy}</div></div>`;
  },
  onClick(el, A) {
    const v = A.view, L = v.legal || {};
    const card = el.closest('[data-in-card]');
    if (card) { if (!card.classList.contains('fresh')) playCard(card.dataset.inCard, A); else A.toast(t('You cannot play a card you bought this turn.'), 'warn'); return true; }
    if (el.closest('[data-in-roadtrade]')) { if (!el.closest('[data-in-roadtrade]').disabled) bankDialog(A, 'road'); return true; }
    if (el.closest('[data-in-army]')) {
      if (el.closest('[data-in-army]').disabled) return true;
      A.pick('hexes', L.army, t('Tap a jungle frame piece to move the robber onto.'), h => A.send({ type: 'armyMove', h }), { key: 'army' });
      return true;
    }
    return false;
  },
  costsHtml(v) {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:112px">${esc(name)}</b><span class="cd">${costRow(cost)}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    const p = s => `<p class="muted" style="font-size:13px;margin:10px 0 4px">${tx(s)}</p>`;
    return `${row(t('Road'), COSTS.road, t('7 roads'))}${row(t('Settlement'), COSTS.settlement, t('1 point · makes 1 card'))}${row(t('City'), COSTS.city, t('1 point more · makes 2 cards · one per tribe'))}${row(t('Development card'), COSTS.dev, '')}
      ${p('Trade with the supply: 3 equal resources, or 2 equal trade goods (fish, coca, feathers), for any other card. 3 different trade goods give any 2 resource cards.')}
      ${p('Every settlement and every city upgrade adds a culture marker to your culture board. The first and second tribe need 4 markers (4 settlements, or 2 settlements and a city), the third needs 3. 11 markers win.')}
      ${p('A tribe that reaches its goal declines: take back all your roads, cover each of its buildings with a thicket and found the first settlement of the next tribe for free. That ends your turn. Buildings in decline still pay and the robber still robs there, but they cannot be expanded and no road may be built from them. Anyone may build over them with a road and the cost of a settlement.')}
      ${p('A 7: everyone with more than 7 cards discards half (each open Combat Arts card protects 1 more card). Move the robber to another land field or a jungle frame piece and take a card from a player next to it. The robber never stands on a field with trade goods.')}`;
  },

  afterState(view, prev, A) {
    const G = A.G, ds = view.inkas.declines || [];
    const top = ds.reduce((a, d) => Math.max(a, d.seq), 0);
    if (G.inSeen == null) G.inSeen = prev ? 0 : top;
    const fresh = ds.filter(d => d.seq > G.inSeen);
    G.inSeen = Math.max(G.inSeen, top);
    if (prev) fresh.forEach(d => declineScene(view, d));
    // the free roads of a Road Building card: open the dialog again for the second road
    const mp = A.myPending().find(x => x.type === 'freeroad');
    if (mp && G.inFree !== mp.left) { G.inFree = mp.left; G.opened.delete(`${mp.type}-${mp.group}`); }
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    if (b.markers) out.push(chip(glyph('temple', 16), b.markers, `${b.markers} × ${t('Development points')}`));
    if (b.longestRoad) out.push(chip(ico('road', 16, '#F6CF57'), '', t('Longest Trade Route')));
    if (b.army) out.push(chip(ico('combat', 16, '#E8856F'), '', t('Mightiest Combat Arts')));
    return out;
  },
});

// ------------------------------------------------------------ playing a development card
function playCard(c, A) {
  const L = A.view.legal || {};
  if (!L.cards || !L.cards[c]) { A.toast(t('You cannot play that card now.'), 'warn'); return; }
  if (c === 'combat' || c === 'roadBuilding') return A.send({ type: 'playCard', card: c });
  if (c === 'invention') {
    const pool = Object.fromEntries(RES.map(k => [k, null]));
    return A.cardPicker({ heading: tx('Invention'), text: tx('Take any 2 resource or trade good cards from the supply.'), pool, count: 2, dismissable: true, confirm: take => A.send({ type: 'playCard', card: c, take }) });
  }
  const opts = RES.map(k => ({ value: k, html: `<span class="in-opt" style="--c:${CARD_COLOR[k]}">${glyph(k, 18)}</span> ${esc(resName(k))}` }));
  A.choiceDialog(tx('Monopoly'), tx('Name a resource or trade good. Every other player gives you up to 2 of that card.'), opts, res => A.send({ type: 'playCard', card: c, res }));
}

// ------------------------------------------------------------ trading with the supply
function bankDialog(A, start = 'same') {
  const v = A.view, L = v.legal || {};
  const ratios = L.ratios || {};
  const have = k => ((A.me().res || {})[k] || 0);
  const avail = k => v.bank[k] == null || v.bank[k] > 0;
  let tab = start, give = null, get = null;
  const g3 = {}, rg = {}; let rget = null;
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const cardBtn = (k, attrs, cls = '', extra = '') => `<button class="pick ${cls}" ${attrs}><div class="rcard ${GOODS.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><span class="have">${esc(resName(k))}</span>${extra}</button>`;
  modal(`<h2>${tx('Trade with the supply')}</h2><p class="muted" style="margin:0">${tx('Trade with the supply: 3 equal resources, 2 equal trade goods or 3 different trade goods.')}</p>
    <div class="chips" id="bkt" style="margin:10px 0 4px"></div><div id="bk"></div>
    <div class="foot"><button class="btn" data-close>${tx('Close')}</button><button class="btn primary" id="bok" disabled>${tx('Trade')}</button></div>`, {
    onMount(el) {
      const ok = el.querySelector('#bok'), body = el.querySelector('#bk');
      const tabs = [['same', t('Equal cards')], ['three', t('3 trade goods')], ['road', t('Longest Trade Route')]];
      const draw = () => {
        el.querySelector('#bkt').innerHTML = tabs.map(([k, n]) => `<button class="chip ${tab === k ? 'on' : ''}" data-t="${k}" ${k === 'road' && !L.roadTrade ? 'disabled' : ''}>${esc(n)}</button>`).join('');
        let html = '', label = t('Trade'), can = false;
        if (tab === 'same') {
          html = `<div class="section-label" style="color:var(--muted)">${tx('Give')}</div><div class="picker">${RES.map(k => cardBtn(k, `data-g="${k}" ${have(k) < ratios[k] ? 'disabled style="opacity:.4"' : ''}`, give === k ? 'on' : '', `<b>${ratios[k]}:1</b>`)).join('')}</div>
            <div class="section-label" style="color:var(--muted)">${tx('Get 1')}</div><div class="picker">${RES.map(k => cardBtn(k, `data-w="${k}" ${k === give || !avail(k) ? 'disabled style="opacity:.4"' : ''}`, get === k ? 'on' : '')).join('')}</div>`;
          can = !!(give && get);
          if (can) label = t('Trade {n} {a} for 1 {b}', { n: ratios[give], a: resName(give), b: resName(get) });
        } else if (tab === 'three') {
          const ready = !!L.goodsTrade;
          html = `<div class="section-label" style="color:var(--muted)">${tx('Give 1 of each trade good')}</div><div class="picker">${GOODS.map(k => cardBtn(k, 'disabled', 'on', `<span class="have">${tx('have {n}', { n: have(k) })}</span>`)).join('')}</div>
            <div class="section-label" style="color:var(--muted)">${tx('Get any 2 resource cards')}</div><div class="picker">${RES.filter(k => !GOODS.includes(k)).map(k => `<div class="pick ${g3[k] ? 'on' : ''}"><div class="rcard ${GOODS.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><span class="have">${esc(resName(k))}</span><div class="ctr"><button data-c="${k}" data-d="-1">−</button><b>${g3[k] || 0}</b><button data-c="${k}" data-d="1">+</button></div></div>`).join('')}</div>`;
          can = ready && sum(g3) === 2;
          if (!ready) html += `<p class="muted">${tx('You need 3 different trade goods.')}</p>`;
        } else {
          html = `<div class="section-label" style="color:var(--muted)">${tx('Give any 2 cards')}</div><div class="picker">${RES.map(k => `<div class="pick ${rg[k] ? 'on' : ''}"><div class="rcard ${GOODS.includes(k) ? 'comm' : ''}" style="background:${CARD_COLOR[k]};width:38px;height:50px">${glyph(k, 20)}</div><span class="have">${tx('have {n}', { n: have(k) })}</span><div class="ctr"><button data-r="${k}" data-d="-1">−</button><b>${rg[k] || 0}</b><button data-r="${k}" data-d="1">+</button></div></div>`).join('')}</div>
            <div class="section-label" style="color:var(--muted)">${tx('Get 1 other card')}</div><div class="picker">${RES.map(k => cardBtn(k, `data-rw="${k}" ${rg[k] || !avail(k) ? 'disabled style="opacity:.4"' : ''}`, rget === k ? 'on' : '')).join('')}</div>`;
          can = sum(rg) === 2 && !!rget && !rg[rget];
        }
        body.innerHTML = html;
        ok.disabled = !can; ok.textContent = label;
        el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; sfx.click(); draw(); });
        body.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { give = b.dataset.g; if (get === give) get = null; sfx.click(); draw(); });
        body.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { get = b.dataset.w; sfx.click(); draw(); });
        body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const k = b.dataset.c, d = +b.dataset.d; if (d > 0 && sum(g3) >= 2) return; g3[k] = Math.max(0, (g3[k] || 0) + d); sfx.click(); draw(); });
        body.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
          const k = b.dataset.r, d = +b.dataset.d;
          if (d > 0 && (sum(rg) >= 2 || (rg[k] || 0) >= have(k))) return;
          rg[k] = Math.max(0, (rg[k] || 0) + d); if (rget && rg[rget]) rget = null; sfx.click(); draw();
        });
        body.querySelectorAll('[data-rw]').forEach(b => b.onclick = () => { rget = b.dataset.rw; sfx.click(); draw(); });
      };
      draw();
      ok.onclick = async () => {
        const clean = o => Object.fromEntries(Object.entries(o).filter(([, n]) => n));
        const action = tab === 'same' ? { type: 'bankTrade', give, get } : tab === 'three' ? { type: 'goodsTrade', get: clean(g3) } : { type: 'roadTrade', give: clean(rg), get: rget };
        if (await A.send(action)) { give = get = rget = null; Object.keys(g3).forEach(k => delete g3[k]); Object.keys(rg).forEach(k => delete rg[k]); setTimeout(() => { if (tab === 'road') el.remove?.(); draw(); }, 250); }
      };
    },
  });
}

export default plugin;
