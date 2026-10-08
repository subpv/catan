// New Energies (Energien): the plugin for the standalone game, following the official rulebook. Board art for power
// plants, environmental damages and the Environmental inspector (art.js), the environment panel (global
// pollution bar, event overview, bag), your personal tableau with the environmental balance, the event-chip scene,
// the development-card and energy-token dialogs and the answers to the events.
import { register } from '../registry.js';
import { extendCore, glyph, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, term, cardName, houseIcon, dieHtml, GLYPH } from '../../core/core.js';
import { enqueue, layer, hold, sfx, LOOT_BY_MODE } from '../../core/fx.js';
import { DEV_DESC } from '../../core/cards.js';
import * as art from './art.js';

const tx = (k, p) => esc(t(k, p));
const S = art.S;
const f = n => n.toFixed(1);

const RES = ['wood', 'clay', 'fiber', 'food', 'metal'];
const CARDS = [...RES, 'research'];
const COSTS = { road: { wood: 1, clay: 1 }, settlement: { wood: 1, clay: 1, fiber: 1, food: 1 }, city: { food: 2, metal: 3 }, dev: { metal: 1, fiber: 1, food: 1 } };
const PLANT = { brown: { research: 1 }, green: { research: 3 } };

// ------------------------------------------------------------ the new cards, terms and icons
extendCore({
  names: { wood: 'Wood', clay: 'Bricks', fiber: 'Natural fibers', food: 'Food', metal: 'Metal', research: 'Research', energy: 'Energy' },
  colors: { wood: '#2E6B45', clay: '#B4482A', fiber: '#7FA65A', food: '#D99A22', metal: '#6E7F8D', research: '#4F6FD8', energy: '#E8B418' },
  terms: {
    disaster: 'Environmental disaster', flood: 'Heavy rain and flooding', smog: 'Air pollution', boom: 'Production boost', climate: 'Climate conference',
    sustain: 'Sustainable production', subsidy: 'State funding', village: 'Village', 'research city': 'Research city',
  },
  cards: { funding: 'Funding', boost: 'Performance boost', protection: 'Environmental protection' },
  glyphs: {
    wood: GLYPH.lumber, clay: GLYPH.brick, fiber: GLYPH.wool, food: GLYPH.grain, metal: GLYPH.ore,
    research: '<path d="M9 18h6 M10 21h4 M12 2.500a6.500 6.500 0 0 0-3.800 11.800c.6.500 1 1.200 1 2.200h5.600c0-1 .4-1.700 1-2.200A6.500 6.500 0 0 0 12 2.500z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    energy: '<path d="M13.500 2 5 13.500h6L10 22l9-12h-6.200z" fill="currentColor" stroke="currentColor" stroke-width="1.400" stroke-linejoin="round"/>',
    brown: '<path d="M3 21V12l5 3v-3l5 3V8h3v13z M3 21h18 M17 8V4 M17 4h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    green: '<path d="M12 12v9 M8.500 21h7 M12 12V3 M12 12l7.200 4 M12 12l-7.200 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.700" fill="currentColor"/>',
    cog: `<path transform="translate(12 12)" d="${art.gearPath(10, 7.600, 8, 3.200)}" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round" fill-rule="evenodd"/>`,
    bag: '<path d="M9 3h6l-1.400 4c3.100 1.400 4.900 4.400 4.900 8a5.500 5.500 0 0 1-5.500 5.500h-3A5.500 5.500 0 0 1 5.500 15c0-3.600 1.800-6.600 4.900-8z M9.600 7h4.800" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    leaf: '<path d="M5 19C5 10 10.500 5 20 5c0 10-5.500 15-14 15 M5 19c3-5.500 6.500-8.500 11-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    cloud: '<path d="M7 19a4 4 0 0 1-.7-7.900A5.600 5.600 0 0 1 17 9a4.200 4.200 0 0 1 .5 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    plus: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.500v9 M7.500 12h9" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>',
    minus: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.500 12h9" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>',
    inspector: '<path d="M4 15a8 8 0 0 1 16 0z M2.500 15h19 M12 4.500V7 M7 20.500c0-2.500 2.200-4 5-4s5 1.500 5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    warehouse: '<path d="M3 10 12 4l9 6v10H3z M8 20v-6h8v6 M8 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    funding: '<path d="M2.500 19v-6.500h4l3.200 1.500h4.800a1.500 1.500 0 0 1 0 3H10 M6.500 13l3.500-3h8.500l-1 9-8 2.500 M9 3.500h8v5H9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    boost: '<path d="M12 12v9 M8.500 21h7 M12 12V3 M12 12l7.200 4 M12 12l-7.200 4 M2.500 21.500q2-1.500 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.700" fill="currentColor"/>',
    protection: '<path d="M4 15a8 8 0 0 1 16 0z M2.500 15h19 M12 4.500V7 M7 20.500c0-2.500 2.200-4 5-4s5 1.500 5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    ev_climate: '<circle cx="12" cy="6.500" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 21v-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5z M3 21h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    ev_boom: '<path d="M3 21V11l5 3V9l5 3V7h3v14z M3 21h18 M19 9V3 M16.500 5.500 19 3l2.500 2.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    ev_smog: '<path d="M7 14a4 4 0 0 1-.4-7.900A5 5 0 0 1 16 5.500a4 4 0 0 1 1 8.500z M8 17.500v3 M12 17.500v3 M16 17.500v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    ev_flood: '<path d="M7 12a4 4 0 0 1-.4-7.900A5 5 0 0 1 16 3.500 3.800 3.800 0 0 1 17 12z M8 15l-1 2.200 M12 15l-1 2.200 M16 15l-1 2.200 M3 21q2-2.200 4 0t4 0 4 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    ev_disaster: '<path d="M12 3c.5 3.500 4.500 5 4.500 9.500a4.500 4.500 0 0 1-9 0c0-2 1-3.500 2-4.500.2 1.500.9 2.200 1.800 2.200C11 8 11 5.500 12 3z M3 21h5l2-3 2 3 2-2 2 2h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    ev_sustain: '<path d="M12 12v9 M8.500 21h7 M12 12V3 M12 12l7.200 4 M12 12l-7.200 4 M2.500 21.500q2-1.500 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.700" fill="currentColor"/>',
    ev_subsidy: '<path d="M2.500 19v-6.500h4l3.200 1.500h4.800a1.500 1.500 0 0 1 0 3H10 M6.500 13l3.500-3h8.500l-1 9-8 2.500 M9 3.500h8v5H9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  },
});
LOOT_BY_MODE.energies = { wood: 'forest', clay: 'hills', fiber: 'pasture', food: 'fields', metal: 'mountains' };
Object.assign(DEV_DESC, {
  funding: 'Take any 2 cards from the supply: resources and/or research cards.',
  protection: 'Move the Environmental inspector and take a card, or remove a damage and take a card from a player with the same or a worse balance.',
});
DEV_DESC.roadBuilding = 'Build 2 roads for free.';

// what every event does (shown on the overview, in the scene and in the rules)
const EVENTS = {
  disaster: { icon: 'ev_disaster', tone: 'brown', text: 'The active player rolls: every tile with that number gets a damage. The inspector protects his tile.' },
  flood: { icon: 'ev_flood', tone: 'brown', text: 'Every player puts 1 damage on one of their villages or research cities.' },
  smog: { icon: 'ev_smog', tone: 'brown', text: 'Worst balance: 1 damage on one of their research cities (or on a village).' },
  boom: { icon: 'ev_boom', tone: 'brown', text: 'Worst balance: may build 1 brown power plant for free and take 1 resource of its tile.' },
  climate: { icon: 'ev_climate', tone: 'neutral', text: 'Best balance: take 1 card. Worst balance: give back 1 card.' },
  sustain: { icon: 'ev_sustain', tone: 'green', text: 'Most green power plants: take 1 resource or research card.' },
  subsidy: { icon: 'ev_subsidy', tone: 'green', text: 'Best balance: take the top development card.' },
};
const EV_ORDER = ['disaster', 'flood', 'smog', 'boom', 'climate', 'sustain', 'subsidy'];

// ------------------------------------------------------------ board art
function hexPoly(board, h, k) {
  const cx = h.x * S, cy = h.y * S;
  return h.verts.map(id => { const v = board.vertices[id]; return `${f(cx + (v.x * S - cx) * k)},${f(cy + (v.y * S - cy) * k)}`; }).join(' ');
}
function ext(view) {
  const plants = view.plants || [];
  const dmg = view.damages || { h: [], v: [] };
  return {
    tiles({ board, fr, life }) {
      let out = '';
      // damages sit on the number chip (the chip shows through the cog)
      for (const id of dmg.h) {
        const h = board.hexes[id];
        out += `<g transform="translate(${f(h.x * S)},${f(h.y * S + 4)})" pointer-events="none"><title>${esc(t('Environmental damage: this tile makes nothing'))}</title>${art.chipDamage(fr && fr.damage && fr.damage.has('h' + id))}</g>`;
      }
      // the Environmental inspector blocks the tile he stands on
      if (view.inspector != null && board.hexes[view.inspector]) {
        const h = board.hexes[view.inspector];
        out += `<g pointer-events="none"><polygon class="${life ? 'lf-dim' : ''}" points="${hexPoly(board, h, 0.97)}" fill="rgba(24,10,4,.34)"/>
          <g transform="translate(${f(h.x * S - (h.number ? 27 : 0))},${f(h.y * S + 6)}) scale(1.05)"><title>${esc(t('Environmental inspector'))}</title>${art.inspectorArt(life, fr && fr.inspector)}</g></g>`;
      }
      const items = [...plants].sort((a, b) => art.plantPos(board, plants, a)[1] - art.plantPos(board, plants, b)[1]);
      out += `<g class="plants">${items.map(x => {
        const [px, py] = art.plantPos(board, plants, x);
        const terrain = board.hexes[x.hex].terrain;
        const isNew = fr && fr.plants && fr.plants.has(x.id);
        return `<g transform="translate(${f(px)},${f(py + 6)})" class="plant ${x.kind}" data-plant="${x.id}"><title>${esc(t(x.kind === 'brown' ? 'Brown power plant' : 'Green power plant'))}</title><g class="${isNew ? 'fx-drop' : ''}">${art.plantArt(x.kind, terrain, view.players[x.p].color, x.id)}</g></g>`;
      }).join('')}</g>`;
      return out;
    },
    top({ board, fr }) {
      let out = '';
      for (const vid of dmg.v) {
        const v = board.vertices[vid];
        out += `<g transform="translate(${f(v.x * S)},${f(v.y * S - 21)})" pointer-events="none"><title>${esc(t('Environmental damage: this building makes nothing'))}</title>${art.buildingDamage(fr && fr.damage && fr.damage.has('v' + vid), vid)}</g>`;
      }
      return out;
    },
  };
}

// ------------------------------------------------------------ panels
const chipFace = (kind, size = 34, tone) => {
  const E = EVENTS[kind], tn = tone || E.tone;
  return `<span class="evdisc en-chip ${tn}" style="width:${size}px;height:${size}px" title="${esc(term(kind))}">${glyph(E.icon, size * 0.58)}</span>`;
};
const dots = (n, fill, kind) => Array.from({ length: n }, (_, i) => `<i class="${fill[i] === 'g' ? 'g' : fill[i] === 'b' ? 'b' : ''}"></i>`).join('');

// the global pollution bar as on the frame of the board: 4 rows, each with the number of chips it makes you draw
function pollutionBar(e) {
  const rows = [[0, 5, 2], [6, 18, 1], [19, 23, 2], [24, 28, 3]];
  return `<div class="en-pol">${rows.map(([a, b, n]) => `<div class="en-prow"><span class="en-pn" title="${esc(t('Chips drawn at the start of a turn'))}">${Array.from({ length: n }, () => '<i></i>').join('')}</span>
    <div class="en-cells">${Array.from({ length: b - a + 1 }, (_, i) => { const c = a + i; return `<i class="${c === e.marker ? 'on' : ''} ${c > e.markerMax ? 'off' : ''} r${n}">${c}</i>`; }).join('')}</div></div>`).join('')}</div>`;
}
function envPanel(v) {
  const e = v.energies;
  const total = Math.max(1, e.brown + e.green);
  const rows = EV_ORDER.map(k => {
    const sl = e.slots[k], E = EVENTS[k];
    return `<div class="en-ev ${E.tone}" title="${esc(t(E.text))}">${chipFace(k, 30)}<div class="en-evb"><b>${esc(term(k))}</b><small>${esc(t(E.text))}</small></div><div class="en-dots" title="${tx('Chips on the slots: the event happens when the last slot is filled')}">${dots(sl.n, sl.fill, k)}</div></div>`;
  }).join('');
  return `<div class="panel env en-env"><div class="panel-h">${tx('Environment')}<span class="spacer"></span><span style="font-weight:500">${tx('Chips per turn: {n}', { n: e.chips })}</span></div>
    <div class="env-row small en-line"><span class="env-lbl" title="${tx('Sum of all pollution symbols minus all green symbols')}">${glyph('cloud', 15)} ${tx('Global pollution')}</span><b>${e.pollution}</b>${e.pollution !== e.marker ? `<span class="muted" style="font-size:12px">(${tx('bar end')} ${e.marker})</span>` : ''}</div>
    ${pollutionBar(e)}
    <div class="env-row"><span class="env-lbl" title="${tx('Chips left in the event bag')}">${glyph('bag', 15)} ${tx('Event bag')}</span><div class="bagbar"><i class="brown" style="width:${(e.brown / total * 100).toFixed(1)}%"></i><i class="green" style="width:${(e.green / total * 100).toFixed(1)}%"></i></div><b class="gfn">${e.bag}</b></div>
    <div class="env-sub" style="padding:2px 14px 0">${tx('Events')}</div><div class="en-evs">${rows}</div>
    <div class="env-row small en-line"><span class="env-lbl">${glyph('cog', 14)} ${tx('Damages left')}</span><b>${e.damageLeft}/${e.damageMax}</b></div></div>`;
}

// a piece on the tableau, or the symbol it uncovers when it stands on the board
const piece = (kind, color) => {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  switch (kind) {
    case 'village': return `<svg viewBox="0 0 20 20" width="20" height="20"><path d="M3 18V8.500L10 3l7 5.500V18z" fill="${c}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/></svg>`;
    case 'city': return `<svg viewBox="0 0 24 20" width="24" height="20"><path d="M2 18V9l5-4 5 4v2h8v7z" fill="${c}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/></svg>`;
    case 'road': return `<svg viewBox="0 0 20 20" width="20" height="20"><path d="M3 15 17 5" stroke="${d}" stroke-width="6" stroke-linecap="round"/><path d="M3 15 17 5" stroke="${c}" stroke-width="3.400" stroke-linecap="round"/></svg>`;
    case 'brown': return '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="#6B3A22" stroke="#2E170C" stroke-width="1.500"/><path d="M11 4 6.500 11H10l-1 5 4.500-7H10z" fill="#F2C230"/></svg>';
    default: return '<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="#3FA450" stroke="#17501F" stroke-width="1.500"/><path d="M11 4 6.500 11H10l-1 5 4.500-7H10z" fill="#F4F8C8"/></svg>';
  }
};
const sym = (kind, n = 1) => `<span class="en-sym ${kind}" title="${esc(kind === 'plus' ? t('Pollution symbol: 1 pollution point') : t('Green symbol: -1 pollution point'))}">${glyph(kind, 18)}${n > 1 ? glyph(kind, 18) : ''}</span>`;
function slots(total, built, kindPiece, color, symbol, per = 1) {
  let out = '';
  for (let i = 0; i < total; i++) out += i < total - built ? `<span class="en-slot">${piece(kindPiece, color)}</span>` : `<span class="en-slot open">${symbol ? sym(symbol, per) : ''}</span>`;
  return out;
}
function tableauPanel(v, A) {
  const seat = A.G.enSeat != null && v.players[A.G.enSeat] ? A.G.enSeat : (v.me >= 0 ? v.me : v.current);
  const p = v.players[seat], tb = p.tab, pc = PCOLOR[p.color];
  const plus = tb.villages + 2 * tb.cities + tb.brown, minus = tb.green;
  const tabs = v.players.map((q, i) => `<button class="en-tab ${i === seat ? 'on' : ''}" data-en-seat="${i}" title="${esc(q.name)}" style="--pc:${PCOLOR[q.color]}">${houseIcon(q.color, 16)}</button>`).join('');
  const row = (label, body, extra = '') => `<div class="en-trow"><span class="en-tl">${label}</span><div class="en-tslots">${body}</div>${extra}</div>`;
  const energy = Array.from({ length: 5 }, (_, i) => `<span class="en-slot bolt ${i < p.energy ? 'on' : ''}">${glyph('energy', 16)}</span>`).join('');
  return `<div class="panel en-tab-panel"><div class="panel-h"><span class="en-who" style="color:${isLight(p.color) ? '#8A6A2E' : pc}">${esc(p.name)}</span><span class="spacer"></span><span class="en-tabs">${tabs}</span></div>
    <div class="en-bal"><div class="en-balbig ${p.bal >= 5 ? 'bad' : p.bal <= 2 ? 'good' : ''}" title="${tx('Environmental balance: the lower, the better')}"><small>${tx('Environmental balance')}</small><b>${p.bal}</b></div>
      <div class="en-balsum"><span>${sym('plus')} ${plus}</span><span>${sym('minus')} ${minus}</span></div></div>
    ${row(`${tx('Villages')} <small>+1</small>`, slots(5, tb.villages, 'village', p.color, 'plus'))}
    ${row(`${tx('Research cities')} <small>+2</small>`, slots(4, tb.cities, 'city', p.color, 'plus', 2))}
    ${row(`${tx('Brown plants')} <small>+1</small>`, slots(6, tb.brown, 'brown', p.color, 'plus'))}
    ${row(`${tx('Green plants')} <small>−1</small>`, slots(9, tb.green, 'green', p.color, 'minus'))}
    ${row(`${tx('Roads')}`, `<span class="en-count">${piece('road', p.color)} ${p.pieces.roads}/12</span>`)}
    ${row(`${tx('Energy')} <small>${tx('max 5')}</small>`, energy)}
    ${row(`${tx('Warehouse')}`, `<span class="en-wh ${p.warehouse ? 'on' : ''}">${glyph('warehouse', 18)} ${p.warehouse ? tx('Hand limit 10') : tx('Hand limit 7')}</span>`)}
    ${row(`${tx('Development cards')}`, `<span class="en-count">${glyph('card', 16)} ${p.devs}${p.protection ? ` · ${glyph('inspector', 15)} ${p.protection}` : ''}</span>`)}
  </div>`;
}
const isLight = c => c === 'white' || c === 'yellow';

// ------------------------------------------------------------ the event scene
function eventScene(view, chips) {
  enqueue(async () => {
    sfx.horn?.();
    const who = view.players[chips[0].p != null ? chips[0].p : view.current];
    const faces = chips.map((d, i) => {
      const E = EVENTS[d.kind];
      const tone = d.g ? 'green' : E.tone === 'neutral' ? 'brown' : E.tone;
      const roll = d.roll ? `<div class="en-roll">${dieHtml(d.roll[0], 'red')}${dieHtml(d.roll[1], 'yellow')}<b>${d.roll[0] + d.roll[1]}</b></div>` : '';
      return `<div class="ev-disc ${tone}" style="animation-delay:${i * 0.5}s"><div class="ev-face">${glyph(E.icon, 40)}</div><b>${esc(term(d.kind))}</b>
        <div class="en-dots big">${dots(d.slots, Array.from({ length: d.fill }, () => (d.g ? 'g' : 'b')), d.kind)}</div>
        <small>${d.trigger ? `<b class="en-go">${tx('The event happens!')}</b> ${esc(t(E.text))}` : esc(t('Chip {n} of {m}: nothing happens yet.', { n: d.fill, m: d.slots }))}</small>${d.trigger ? roll : ''}</div>`;
    });
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('{name} draws from the bag', { name: esc(who.name) })}</div><div class="ev-discs">${faces.join('')}</div></div>`);
    setTimeout(() => (chips.some(d => d.trigger && !(d.g || EVENTS[d.kind].tone === 'green')) ? sfx.smog?.() : sfx.leaf?.()), 450);
    await hold(sc, 1900 + chips.length * 600);
  });
}
function awardScene(view, p) {
  enqueue(async () => {
    sfx.award?.();
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('Most active environmentalist')}</div><div class="ev-discs"><div class="ev-disc green"><div class="ev-face">${glyph('inspector', 40)}</div><b>${esc(view.players[p].name)}</b><small>${tx('+2 victory points')}</small></div></div></div>`);
    await hold(sc, 1700);
  });
}

// ------------------------------------------------------------ the plugin
const devName = k => cardName(k);
const playableDevs = v => Object.entries((v.legal && v.legal.dev) || {}).filter(([, d]) => d.playable);
const plugin = register({
  id: 'energies', name: 'New Energies', vp: 10, maxPlayers: 4, minPlayers: 3, tutorial: 'energies', lifeIcon: 'energy',
  tagline: 'Power plants, energy tokens and a bag of event chips.',
  blurb: 'Brown power plants are cheap but pollute, green ones cost more and clean up. Event chips from the bag bring damages and rewards. First to 10 points wins, or the greenest builder when the bag runs empty.',
  lostText: 'The world lost.',
  tokenKeys: ['research', 'energy'], limited: CARDS, bankBuys: CARDS, tradeKeys: [...CARDS, 'energy'],
  bankText: 'Resources trade 4:1 (harbors make it 3:1 or 2:1), research cards 3:1 for a resource, energy tokens 2:1 for any card.',
  fresh(view, prev) {
    const plants = new Set(view.plants.filter(x => !(prev.plants || []).some(y => y.id === x.id)).map(x => x.id));
    const old = new Set([...(prev.damages ? prev.damages.h.map(i => 'h' + i) : []), ...(prev.damages ? prev.damages.v.map(i => 'v' + i) : [])]);
    const damage = new Set([...view.damages.h.map(i => 'h' + i), ...view.damages.v.map(i => 'v' + i)].filter(k => !old.has(k)));
    const inspector = view.inspector !== prev.inspector;
    return { plants, damage, inspector, any: plants.size > 0 || damage.size > 0 || inspector };
  },
  ext, boardKey: v => JSON.stringify([v.plants, v.damages, v.inspector]),

  hud(v) {
    const e = v.energies;
    return `<span class="hud-pill" title="${tx('Chips left in the event bag')}">${glyph('bag', 15)} ${e.bag} <small class="hud-split"><i class="brown">${e.brown}</i><i class="green">${e.green}</i></small></span>
      <span class="hud-pill gf l${e.chips >= 3 ? 3 : e.chips >= 2 ? 2 : 1}" title="${tx('Global pollution: {n} chips per turn', { n: e.chips })}">${glyph('cloud', 15)} ${e.marker} · ${e.chips}×</span>
      <span class="hud-pill" title="${tx('Damages left in the supply')}">${glyph('cog', 15)} ${e.damageLeft}/${e.damageMax}</span>`;
  },
  side: (v, A) => envPanel(v) + tableauPanel(v, A),
  playerMeta(v, p) {
    return `<span class="mp lf ${p.bal >= 5 ? 'dirty' : p.bal <= 2 ? 'clean' : ''}" title="${tx('Environmental balance')}">${glyph('cloud', 12)}${p.bal}</span>
      <span class="mp" title="${tx('Energy')}">${glyph('energy', 12)}${p.energy}</span>
      <span class="mp" title="${tx('Brown power plants')}">${glyph('brown', 12)}${p.tab.brown}</span><span class="mp" title="${tx('Green power plants')}">${glyph('green', 12)}${p.tab.green}</span>
      ${p.warehouse ? `<span class="mp" title="${tx('Warehouse')}">${glyph('warehouse', 12)}</span>` : ''}${p.devs ? `<span class="mp" title="${tx('Development cards')}">${glyph('card', 12)}${p.devs}</span>` : ''}`;
  },
  awards(v, i) {
    let out = '';
    if (v.longestRoad.p === i) out += `<span class="award" title="${tx('Longest Trade Route')} (+2)">${glyph('road', 11)}${v.longestRoad.len}</span>`;
    if (v.activist === i) out += `<span class="award green" title="${tx('Most active environmentalist')} (+2)">${glyph('inspector', 11)}</span>`;
    return out;
  },
  rollStatus(v) {
    const L = v.legal || {}, e = v.energies;
    const dev = playableDevs(v).length && L.playDev && L.playDev.freeSeat ? `<button class="btn" data-do="devs">${glyph('card', 15)} ${tx('Play card')}</button>` : '';
    const roll = `<button class="btn primary roll-btn" data-do="roll">🎲 ${tx('Roll dice')}</button>`;
    if (!v.flags.drawn) {
      return {
        msg: t('Your turn. Draw the event chips.'), sub: t('The pollution marker is on {m}: you draw {n} chips.', { m: e.marker, n: L.chips || e.chips }),
        btns: `${dev}<button class="btn primary roll-btn" data-do="draw">${glyph('bag', 16)} ${tx('Draw chips')}</button>`,
      };
    }
    return { msg: t('The events are done. Roll the dice.'), sub: t('A 7 brings the Environmental inspector.'), btns: `${dev}${roll}` };
  },
  mainStatus(v) {
    const L = v.legal || {};
    const sub = [];
    if (v.flags.plantBuilt) sub.push(t('You built your power plant for this turn.'));
    if (L.damages && L.damages.length) sub.push(t('1 energy token removes a damage.'));
    return { sub: sub.join(' ') };
  },
  setupText(v) { return v.setup.round === 1 ? { msg: t('Place your village.'), sub: t('Tap a glowing corner. Buildings need at least one empty corner between them.') } : { msg: t('Place your research city.'), sub: t('It makes research cards. Tap a glowing corner.') }; },
  pendingText(mp, v) {
    switch (mp.type) {
      case 'discard': return [t('Discard {n} cards.', { n: mp.count }), t('The inspector is coming: you hold more than your hand limit.'), t('Choose cards')];
      case 'inspector': return [t('Move the Environmental inspector.'), t('Tap another tile. You take a card from a player next to it.'), t('Choose tile')];
      case 'takeCard': return [t('Take a card.'), t('Take 1 resource card or 1 research card from the supply.'), t('Choose card')];
      case 'dropCard': return [t('Give back a card.'), t('Put 1 card of your choice back into the supply.'), t('Choose card')];
      case 'placeDamage': return [t('Place a damage.'), t('Tap one of the marked buildings.'), t('Choose building')];
      case 'freePlant': return [t('Build a free brown power plant?'), t('Tap your village or research city, then a tile. You also take 1 resource of that tile.'), t('Build')];
      case 'freeRoad': return [t('Build {n} free roads.', { n: mp.left }), t('Tap a glowing edge.'), t('Build')];
      default: return null;
    }
  },
  pendingDialog(mp, A) {
    const v = A.view, L = v.legal || {}, me = A.me();
    switch (mp.type) {
      case 'inspector': return inspectorFlow(A, L.inspector || {}, (h, victim) => A.send({ type: 'moveInspector', h, victim }));
      case 'takeCard': {
        const pool = Object.fromEntries((L.take || CARDS).map(k => [k, v.bank[k]]));
        return A.cardPicker({ heading: tx('Take a card'), text: tx('Take 1 resource card or 1 research card from the supply.'), pool, count: 1, haveText: 'supply {n}', confirm: c => A.send({ type: 'takeCard', key: Object.keys(c)[0] }) });
      }
      case 'dropCard': {
        const pool = {};
        CARDS.forEach(k => { if (me.res[k]) pool[k] = me.res[k]; });
        return A.cardPicker({ heading: tx('Give back a card'), text: tx('Climate conference: the worst balance puts 1 card back.'), pool, count: 1, confirm: c => A.send({ type: 'dropCard', key: Object.keys(c)[0] }) });
      }
      case 'placeDamage':
        return A.pick('vertices', L.damageOptions || mp.options, t('Tap the building that gets the damage.'), x => A.send({ type: 'placeDamage', v: x }), { key: 'dmg' });
      case 'freePlant': return plantFlow('brown', A, true);
      case 'freeRoad':
        return A.pick('edges', L.roads, t('Tap where to build a free road.'), e => A.send({ type: 'buildRoad', e }), { key: 'road', extra: `<button class="btn" data-do="skipRoads">${tx('Skip')}</button>` });
      default:
    }
  },

  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me();
    const plantOn = actor && L.plantSpots && Object.keys(L.plantSpots).length > 0;
    const can = k => plantOn && m.res.research >= PLANT[k].research && L.plantLeft && L.plantLeft[k] > 0;
    const dev = L.dev || {}, nDev = Object.values(dev).reduce((a, d) => a + d.n, 0);
    const devPlay = playableDevs(v).length && L.playDev && L.playDev.freeSeat;
    return [
      { key: 'road', label: t('Road'), icon: 'road', cost: COSTS.road, enabled: !!(actor && L.roads && L.roads.length), left: m.pieces.roads },
      { key: 'settlement', label: t('Village'), icon: 'settlement', cost: COSTS.settlement, enabled: !!(actor && L.settlements && L.settlements.length), left: m.pieces.settlements },
      { key: 'city', label: t('City'), icon: 'city', cost: COSTS.city, enabled: !!(actor && L.cities && L.cities.length), left: m.pieces.cities },
      { key: 'brown', label: t('Brown'), icon: 'brown', cost: PLANT.brown, enabled: !!can('brown'), left: m.pieces.brown },
      { key: 'green', label: t('Green'), icon: 'green', cost: PLANT.green, enabled: !!can('green'), left: m.pieces.green },
      { key: 'buyDev', label: t('Buy card'), icon: 'card', cost: COSTS.dev, enabled: !!(actor && A.has(COSTS.dev) && v.energies.deck > 0), left: v.energies.deck },
      { key: 'devs', label: t('Play card'), icon: 'card', plain: true, sub: nDev ? t('{n} in hand', { n: nDev }) : t('none yet'), enabled: !!(devPlay && nDev) },
      { key: 'energy', label: t('Energy'), icon: 'energy', plain: true, sub: t('{n} tokens', { n: m.energy }), enabled: !!(actor && m.energy > 0) },
    ].map(a => ({ ...a, enabled: !!a.enabled }));
  },
  doAction(what, A) {
    const v = A.view, L = v.legal || {};
    switch (what) {
      case 'draw': return A.send({ type: 'drawChips' });
      case 'road': return A.pick('edges', L.roads, t('Tap where to build your road.'), e => A.send({ type: 'buildRoad', e }), { key: 'road' });
      case 'settlement': return A.pick('vertices', L.settlements, t('Tap where to build your village.'), x => A.send({ type: 'buildSettlement', v: x }), { key: 'settlement' });
      case 'city': return A.pick('vertices', L.cities, t('Tap the village to upgrade to a research city.'), x => A.send({ type: 'buildCity', v: x }), { key: 'city' });
      case 'brown':
      case 'green': return plantFlow(what, A, false);
      case 'buyDev': return A.send({ type: 'buyDev' });
      case 'devs': return devDialog(A);
      case 'energy': return energyDialog(A);
      case 'skipPlant': return A.send({ type: 'skipPlant' });
      case 'skipRoads': return A.send({ type: 'skipRoads' });
      case 'boostGo': return boostGo(A);
      default: return undefined;
    }
  },
  handExtra(v, A) {
    const L = v.legal || {}, list = (A.me().devList || []);
    if (!list.length) return '';
    const by = {};
    list.forEach(d => { by[d.k] = by[d.k] || { n: 0, fresh: 0 }; by[d.k].n++; if (d.fresh) by[d.k].fresh++; });
    return `<div class="en-devs"><b>${tx('Development cards')}</b>${Object.entries(by).map(([k, d]) => `<button class="en-dev" data-en-dev="${k}" title="${esc(t(DEV_DESC[k] || ''))}">${glyph(k, 14)} ${esc(devName(k))}${d.n > 1 ? ` ×${d.n}` : ''}${d.fresh ? ` <small>${tx('new')}</small>` : ''}</button>`).join('')}</div>`;
  },
  onClick(el, A) {
    const s = el.closest('[data-en-seat]') || el.closest('.player[data-seat]');
    if (s) { A.G.enSeat = +(s.dataset.enSeat ?? s.dataset.seat); A.render(); return false; }
    const d = el.closest('[data-en-dev]');
    if (d) { devDialog(A); return true; }
    return false;
  },
  costsHtml(v) {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:98px">${esc(name)}</b><span class="cd">${Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('')}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    const evs = EV_ORDER.map(k => `<div class="en-ev ${EVENTS[k].tone}">${chipFace(k, 26)}<div class="en-evb"><b>${esc(term(k))} <small>${v.energies.slots[k].n} ${tx('slots')}</small></b><small>${esc(t(EVENTS[k].text))}</small></div></div>`).join('');
    return `${row(t('Road'), COSTS.road, t('Longest Trade Route: 5 roads in a row, 2 points'))}${row(t('Village'), COSTS.settlement, t('1 point, +1 pollution, 1 plant'))}${row(t('Research city'), COSTS.city, t('2 points, +2 pollution, 3 plants, makes research cards'))}
      ${row(t('Brown plant'), PLANT.brown, t('+1 pollution'))}${row(t('Green plant'), PLANT.green, t('−1 pollution, adds a green chip to the bag'))}${row(t('Development card'), COSTS.dev, t('1 card per turn, not the turn you got it'))}
      ${row(t('Warehouse'), { energy: 2 }, t('Hand limit 10 instead of 7'))}
      <p class="muted" style="font-size:13px;margin:10px 0 4px">${tx('One power plant per building phase, on a numbered tile next to your village (1 plant) or research city (up to 3). Each turn you may also tear down 1 brown plant for 1 energy token.')}</p>
      <p class="muted" style="font-size:13px;margin:6px 0 4px">${tx('Energy tokens (max 5): 2 swap for any card, 1 removes a damage, 2 buy the warehouse, 1 tears down a brown plant. Trading: 4:1 resources, 3:1 research cards, 2:1 energy tokens, harbors for resources.')}</p>
      <div class="env-sub" style="margin-top:10px">${tx('Events')}</div><div class="en-evs">${evs}</div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">${tx('Pollution marker 0–5: 2 chips, 6–18: 1 chip, 19–23: 2 chips, 24–28: 3 chips per turn. When the bag is empty the game ends: the player with the most green minus brown plants wins, if it is above 0.')}</p>`;
  },

  afterState(view, prev, A) {
    const G = A.G;
    const last = view.energies.last || [];
    const top = last.reduce((a, d) => Math.max(a, d.seq), 0);
    if (G.evSeen == null) G.evSeen = prev ? 0 : top;
    const fresh = last.filter(d => d.seq > G.evSeen);
    G.evSeen = Math.max(G.evSeen, top);
    if (fresh.length && prev) eventScene(view, fresh);
    if (prev && view.activist != null && view.activist !== prev.activist) awardScene(view, view.activist);
  },
  lostScene(v, A) {
    A.choiceDialog(tx('The world lost.'), tx('The event bag is empty and nobody built more green than brown power plants. Everybody loses.'), [{ value: 1, html: tx('Back to lobby') }], () => { location.hash = '#/'; return true; }, true);
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    if (b.settlements) out.push(chip(houseIcon(w.color, 16), b.settlements, `${b.settlements} × ${t('Villages')}`));
    if (b.cities) out.push(chip(glyph('city', 16), b.cities * 2, `${b.cities} × ${t('Research cities')}`));
    if (b.longestRoad) out.push(chip(ico('road', 16, '#F6CF57'), 2, t('Longest Trade Route')));
    if (b.activist) out.push(chip(ico('inspector', 16, '#9BE08A'), 2, t('Most active environmentalist')));
    if (b.vpCards) out.push(chip(ico('victoryPoint', 16, '#F6CF57'), b.vpCards, `${b.vpCards} × ${t('Victory Point')}`));
    return out;
  },
});

// ------------------------------------------------------------ flows
const where = (v, id, kind) => {
  const hexes = kind === 'v' ? v.board.hexes.filter(h => h.verts.includes(id)) : [v.board.hexes[id]];
  return hexes.filter(h => h.terrain !== 'sea').map(h => `${term(h.terrain)}${h.number ? ' ' + h.number : ''}`).join(' · ');
};
const playerBtn = (v, q) => ({ value: q, html: `${houseIcon(v.players[q].color, 18)} ${esc(v.players[q].name)}`, style: 'justify-content:flex-start' });
function inspectorFlow(A, map, go) {
  const hexes = Object.keys(map).map(Number);
  A.pick('hexes', hexes, t('Tap a tile for the Environmental inspector.'), h => {
    const vs = map[h] || [];
    if (vs.length <= 1) return go(h, vs[0]);
    A.choiceDialog(tx('Take a card from…'), '', vs.map(q => playerBtn(A.view, q)), victim => go(h, victim));
    return true;
  }, { key: 'inspector' });
}
function plantFlow(kind, A, free) {
  const L = A.view.legal;
  const spots = L.plantSpots || {};
  const verts = Object.keys(spots).map(Number);
  if (!verts.length) { A.toast(t('There is nowhere to do that right now.'), 'warn'); return; }
  const label = kind === 'brown' ? t('Brown plant: tap the village or research city it belongs to.') : t('Green plant: tap the village or research city it belongs to.');
  const skip = free ? `<button class="btn" data-do="skipPlant">${tx('Skip')}</button>` : '';
  A.pick('vertices', verts, label, v => {
    const hexes = spots[v];
    if (hexes.length === 1) return A.send({ type: 'buildPlant', kind, v, h: hexes[0] });
    A.pick('hexes', hexes, t('Now tap the tile for the plant.'), h => A.send({ type: 'buildPlant', kind, v, h }), { key: kind, extra: skip });
    return true;
  }, { key: kind, extra: skip });
}

// development cards
function devDialog(A) {
  const v = A.view, L = v.legal || {}, list = A.me().devList || [];
  const by = {};
  list.forEach(d => { by[d.k] = by[d.k] || { n: 0, fresh: 0 }; by[d.k].n++; if (d.fresh) by[d.k].fresh++; });
  const seat = L.playDev && L.playDev.freeSeat;
  const opts = Object.entries(by).map(([k, d]) => {
    const info = (L.dev || {})[k];
    const ok = k !== 'victoryPoint' && seat && info && info.playable && !(k === 'roadBuilding' && !L.playDev.roadSpots) && !(k === 'boost' && !L.playDev.greenHexes.length);
    return { value: k, disabled: !ok, style: 'justify-content:flex-start;text-align:left', html: `<span class="en-devic">${glyph(k, 22)}</span><span><b>${esc(devName(k))}</b> ${d.n > 1 ? `×${d.n}` : ''}${d.fresh ? ` <small class="muted">(${d.fresh} ${tx('new, playable next turn')})</small>` : ''}<br><small class="muted">${esc(t(DEV_DESC[k] || ''))}</small></span>` };
  });
  if (!opts.length) { A.toast(t('You have no development cards.'), 'warn'); return; }
  A.choiceDialog(tx('Development cards'), tx('Play 1 card per turn, even before drawing the event chips. Victory point cards stay hidden until you reach 10 points.'), opts, async k => {
    setTimeout(() => playDev(k, A), 30);
    return true;
  });
}
function playDev(k, A) {
  const v = A.view, L = v.legal || {}, P = L.playDev || {};
  switch (k) {
    case 'roadBuilding': return A.send({ type: 'playDev', card: 'roadBuilding' });
    case 'funding':
      return A.cardPicker({ heading: tx('Funding'), text: tx('Take any 2 cards from the supply: resources and/or research cards.'), pool: Object.fromEntries(CARDS.map(c => [c, null])), count: 2, dismissable: true, confirm: take => A.send({ type: 'playDev', card: 'funding', take }) });
    case 'boost': {
      const sel = [];
      const refresh = () => { if (A.G.pick) { A.G.pick.picked = sel.slice(); A.G.pick.extra = `<button class="btn primary" data-do="boostGo" ${sel.length ? '' : 'disabled'}>${tx('Take {n} cards', { n: sel.length })}</button>`; } A.render(); };
      A.G.enBoost = sel;
      A.pick('hexes', P.greenHexes, t('Tap up to 3 tiles where you have a green plant.'), h => {
        const i = sel.indexOf(h);
        if (i >= 0) sel.splice(i, 1); else if (sel.length < 3) sel.push(h);
        refresh();
        return true;
      }, { key: 'boost', picked: sel.slice(), extra: `<button class="btn primary" data-do="boostGo" disabled>${tx('Take {n} cards', { n: 0 })}</button>` });
      return undefined;
    }
    case 'protection': {
      const hasDmg = P.damages && P.damages.length;
      const opts = [
        { value: 'move', html: `${glyph('inspector', 18)} ${tx('Move the Environmental inspector and take a card')}`, style: 'justify-content:flex-start' },
        { value: 'remove', html: `${glyph('cog', 18)} ${tx('Remove a damage and take a card from a player with the same or a worse balance')}`, disabled: !hasDmg, style: 'justify-content:flex-start' },
      ];
      return A.choiceDialog(tx('Environmental protection'), '', opts, mode => {
        setTimeout(() => (mode === 'move' ? inspectorFlow(A, P.inspector || {}, (h, victim) => A.send({ type: 'playDev', card: 'protection', mode: 'move', h, victim })) : removeFlow(A, P)), 30);
        return true;
      });
    }
    default: return undefined;
  }
}
function boostGo(A) {
  const sel = A.G.enBoost || [];
  if (!sel.length) return undefined;
  A.G.pick = null;
  return A.send({ type: 'playDev', card: 'boost', hexes: sel.slice() });
}
function removeFlow(A, P) {
  const v = A.view;
  const opts = P.damages.map(d => (d.h != null
    ? { value: d, html: `${glyph('cog', 18)} ${tx('Number chip')} · ${esc(where(v, d.h, 'h'))}`, style: 'justify-content:flex-start' }
    : { value: d, html: `${glyph(v.buildings[d.v].type === 'city' ? 'city' : 'settlement', 18)} ${esc(v.players[v.buildings[d.v].p].name)} · ${esc(where(v, d.v, 'v'))}`, style: 'justify-content:flex-start' }));
  A.choiceDialog(tx('Remove a damage'), tx('Which damage should go?'), opts, target => {
    const worse = P.worse || [];
    const send = victim => A.send({ type: 'playDev', card: 'protection', mode: 'remove', target, victim });
    if (worse.length <= 1) return send(worse[0]);
    setTimeout(() => A.choiceDialog(tx('Take a card from…'), tx('Only players with the same or a worse balance than yours.'), worse.map(q => playerBtn(v, q)), victim => send(victim)), 30);
    return true;
  });
}

// energy tokens
function energyDialog(A) {
  const v = A.view, L = v.legal || {}, m = A.me();
  const opts = [
    { value: 'bank', html: `${glyph('energy', 18)} ${tx('Swap 2 energy tokens for any card')}`, disabled: m.energy < 2, style: 'justify-content:flex-start' },
    { value: 'warehouse', html: `${glyph('warehouse', 18)} ${tx('Buy the warehouse (2 energy tokens): hand limit 10')}`, disabled: m.energy < 2 || !L.warehouse, style: 'justify-content:flex-start' },
    { value: 'damage', html: `${glyph('cog', 18)} ${tx('Remove a damage (1 energy token)')}`, disabled: m.energy < 1 || !(L.damages && L.damages.length), style: 'justify-content:flex-start' },
    { value: 'demolish', html: `${glyph('brown', 18)} ${tx('Tear down a brown plant (1 energy token)')}`, disabled: m.energy < 1 || !(L.demolish && L.demolish.length), style: 'justify-content:flex-start' },
  ];
  A.choiceDialog(tx('Energy'), tx('You have {n} energy tokens.', { n: m.energy }), opts, async what => {
    if (what === 'bank') setTimeout(() => A.bank(), 30);
    else if (what === 'warehouse') await A.send({ type: 'buyWarehouse' });
    else if (what === 'damage') setTimeout(() => damageDialog(A), 30);
    else if (what === 'demolish') setTimeout(() => demolishDialog(A), 30);
    return true;
  });
}
function damageDialog(A) {
  const v = A.view, L = v.legal;
  const opts = L.damages.map(d => (d.h != null
    ? { value: d, html: `${glyph('cog', 18)} ${tx('Number chip')} · ${esc(where(v, d.h, 'h'))}`, style: 'justify-content:flex-start' }
    : { value: d, html: `${glyph(v.buildings[d.v].type === 'city' ? 'city' : 'settlement', 18)} ${esc(v.players[v.buildings[d.v].p].name)} · ${esc(where(v, d.v, 'v'))}`, style: 'justify-content:flex-start' }));
  A.choiceDialog(tx('Remove a damage'), tx('Which damage should go?'), opts, d => A.send({ type: 'removeDamage', ...d }));
}
function demolishDialog(A) {
  const v = A.view, L = v.legal;
  const opts = L.demolish.map(id => { const x = v.plants.find(y => y.id === id); return { value: id, html: `${glyph('brown', 18)} ${esc(t('Brown power plant'))} · ${esc(where(v, x.hex, 'h'))}`, style: 'justify-content:flex-start' }; });
  A.choiceDialog(tx('Tear down a brown plant'), tx('Which plant should go?'), opts, plant => A.send({ type: 'demolishPlant', plant }));
}

export default plugin;
