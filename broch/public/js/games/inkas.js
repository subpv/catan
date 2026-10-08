// Rise of the Inkas (Der Aufstieg der Inka): the plugin for the standalone game. Andean board art (inkas-art.js),
// the era panel with its culture tokens, tributes (sets of goods), the creeping thickets and the scenes for a tribute
// and for the end of an era.
import { register } from './registry.js';
import { extendCore, glyph, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, term, houseIcon } from '../core.js';
import { enqueue, layer, hold, sfx, LOOT_BY_MODE } from '../fx.js';
import * as art from './inkas-art.js';

const tx = (k, p) => esc(t(k, p));
const S = 56;
const f = n => n.toFixed(1);

// ------------------------------------------------------------ new cards, terms and icons
extendCore({
  names: { catch: 'Fish', feathers: 'Feathers', coca: 'Coca', nugget: 'Gold' },
  colors: { catch: '#3E8FB0', feathers: '#C1272D', coca: '#4E9A45', nugget: '#C9971B' },
  terms: { chavin: 'Chavín', moche: 'Moche', inca: 'Inca', tribute: 'Tribute', thicket: 'Thicket' },
  glyphs: {
    catch: '<path d="M3 12c4-6 10-6 14 0-4 6-10 6-14 0z M17 12l4-4v8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8.500" cy="11" r="1.100" fill="currentColor"/>',
    nugget: '<path d="M2 18l3-7h14l3 7z M7.500 11l2-6h5l2 6 M12 14v1.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    feather: '<path d="M20 3C9 3 5 10 5 15v1l-2 5M5 16c5 0 9-2 11-6M9 12l2-5M11 15l3-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    feathers: '<path d="M20 3C9 3 5 10 5 15v1l-2 5M5 16c5 0 9-2 11-6M9 12l2-5M11 15l3-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    coca: '<path d="M12 21V11 M12 12C7 12 4.500 8.500 4.500 4c5 0 7.500 3 7.500 8z M12 14c5 0 7.500-3 7.500-7.500-5 0-7.500 3-7.500 7.500z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    tribute: '<path d="M6 8h12l-1.500 11h-9z M5 8h14 M9 8V5.500a3 3 0 0 1 6 0V8 M10 12.500h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    thicket: '<path d="M3 20c3-3 4-7 9-8 5-1 6-5 9-8 M7 17c0-3 2-4 4-4 M13 11c0-3 1-4 4-5 M4 12c2-1 3-3 3-5 M14 20c1-2 3-3 6-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    temple: '<path d="M2.500 20.500v-3h3.500v-4h4v-4h4v-4h2v4h2v4h2v4h2v3z M9.500 20.500v-3h5v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    bohio: '<path d="M4.500 20.500v-8L12 3.500l7.500 9v8z M10 20.500v-5h4v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    sun: '<circle cx="12" cy="12" r="4.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.500v3 M12 18.500v3 M2.500 12h3 M18.500 12h3 M5.300 5.300l2.100 2.100 M16.600 16.600l2.100 2.100 M18.700 5.300l-2.100 2.100 M7.400 16.600l-2.100 2.100" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
});
LOOT_BY_MODE.inkas = { catch: 'fields', feathers: 'forest', coca: ['pasture', 'hills'], nugget: 'mountains' };

const GOODS = ['catch', 'feathers', 'coca'];
const COSTS = { road: { feathers: 1, coca: 1 }, settlement: { catch: 1, feathers: 1, coca: 2 }, city: { coca: 2, nugget: 2 } };
const ERAS = [
  { id: 'chavin', num: 'I', color: '#6E9A3F', rule: 'The first tribe. Every tile pays as usual.' },
  { id: 'moche', num: 'II', color: '#2B7BB9', rule: 'The fisheries pay: camps on the coast get 1 extra fish.' },
  { id: 'inca', num: 'III', color: '#C9971B', rule: 'The terraces pay: villages in the highlands get 1 extra coca. Trails cost only 1 coca.' },
];

// ------------------------------------------------------------ board
function ext(view) {
  const ik = view.inkas || {};
  return {
    color: h => art.TERRAIN_COLOR[h.terrain],
    glyph: h => art.TERRAIN_GLYPH[h.terrain],
    life: art.tileLife,
    building: (b, c) => art.building(b, c),
    shape: art.shape,
    tiles({ board, life, fr }) {
      return `<g class="thickets" pointer-events="none">${(ik.thickets || []).map(id => {
        const h = board.hexes[id];
        if (!h) return '';
        const isNew = fr && fr.thickets && fr.thickets.has(id);
        return `<g transform="translate(${f(h.x * S)},${f(h.y * S + 2)})"><title>${esc(t('Thicket'))}</title><g class="${isNew ? 'fx-drop' : ''}">${art.thicketArt(h, life)}</g></g>`;
      }).join('')}</g>`;
    },
  };
}

// ------------------------------------------------------------ panels
const goodsRow = (set, size = 16) => GOODS.filter(g => set[g]).map(g => `<span class="in-good" style="--c:${CARD_COLOR[g]}" title="${esc(resName(g))}">${glyph(g, size)}<b>${set[g]}</b></span>`).join('');
function eraPanel(v, A) {
  const ik = v.inkas, era = ERAS[ik.era], L = v.legal || {}, actor = A.actor();
  const steps = ERAS.map((e, i) => `<span class="in-era ${i === ik.era ? 'on' : i < ik.era ? 'done' : ''}" style="--ec:${e.color}" title="${esc(term(e.id))}">${e.num}</span>`).join('<i class="in-arrow"></i>');
  const total = ik.eras[ik.era].tokens;
  const dots = [];
  v.players.forEach((p, i) => { for (let k = 0; k < (p.perEra ? p.perEra[ik.era] : 0); k++) dots.push(`<i class="in-tok" style="background:${PCOLOR[p.color]};border-color:${PCOLOR_DARK[p.color]}" title="${esc(p.name)}"></i>`); });
  while (dots.length < total) dots.push('<i class="in-tok empty"></i>');
  const set = ik.eras[ik.era].tribute;
  const trib = L.tribute;
  const note = trib ? (trib.used ? t('You already brought a tribute this turn.') : trib.can ? (trib.gold ? t('You can bring it, using {n} gold as a stand-in.', { n: trib.gold }) : t('You can bring this tribute now.')) : '') : '';
  return `<div class="panel in-panel"><div class="panel-h">${tx('Era')}<span class="spacer"></span><span class="in-steps">${steps}</span></div>
    <div class="in-body"><div class="in-name" style="color:${era.color}">${glyph('sun', 18)} <b>${esc(term(era.id))}</b></div>
      <div class="in-toks" title="${tx('Culture tokens of this era')}">${dots.join('')}<small>${tx('{n} left', { n: ik.left })}</small></div>
      <div class="in-set"><span class="in-lbl">${glyph('tribute', 15)} ${tx('Tribute')}</span>${goodsRow(set)}<small>${tx('Gold stands in for any good.')}</small></div>
      <p class="in-rule">${esc(t(era.rule))}</p>
      ${ik.thickets.length ? `<p class="in-rule">${glyph('thicket', 13)} ${tx('{n} thickets block their tiles. Clear one for 1 feathers and 1 coca.', { n: ik.thickets.length })}</p>` : ''}
      ${actor && trib ? `<button class="btn ${trib.can ? 'gold' : ''} block" data-in-tribute ${trib.can ? '' : 'disabled'}>${glyph('tribute', 16)} ${tx('Bring tribute')}</button><small class="muted">${esc(note)}</small>` : ''}
    </div></div>`;
}

// ------------------------------------------------------------ scenes
function claimScene(view, claim) {
  enqueue(async () => {
    sfx.award?.();
    const who = view.players[claim.p], era = ERAS[claim.era];
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('{name} brings a tribute', { name: esc(who.name) })}</div>
      <div class="ev-discs"><div class="ev-disc green" style="animation-delay:.1s"><div class="ev-face" style="background:radial-gradient(circle at 35% 30%, ${era.color}, #3A2A14)">${glyph('tribute', 40)}</div><b>${tx('Culture token')}</b><small>${esc(t('Era {n}', { n: era.num }))} · ${esc(term(era.id))}</small></div></div></div>`);
    await hold(sc, 1700);
  });
}
function eraScene(view, ending) {
  if (ending.to == null) return;
  enqueue(async () => {
    sfx.drums?.();
    const next = ERAS[ending.to], prev = ERAS[ending.from];
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('The era of the {name} ends', { name: esc(term(prev.id)) })}</div>
      <div class="ev-discs">
        <div class="ev-disc brown" style="animation-delay:.1s"><div class="ev-face">${glyph('temple', 40)}</div><b>${tx('Decline')}</b><small>${tx('Every village shrinks to a camp.')}</small></div>
        <div class="ev-disc brown" style="animation-delay:.6s"><div class="ev-face">${glyph('thicket', 40)}</div><b>${tx('Thickets')}</b><small>${tx('The jungle claims the land.')}</small></div>
        <div class="ev-disc green" style="animation-delay:1.1s"><div class="ev-face" style="background:radial-gradient(circle at 35% 30%, ${next.color}, #3A2A14)">${glyph('sun', 40)}</div><b>${esc(term(next.id))}</b><small>${esc(t(next.rule))}</small></div>
      </div></div>`);
    await hold(sc, 3600);
  });
}

// ------------------------------------------------------------ the plugin
const plugin = register({
  id: 'inkas', name: 'Rise of the Inkas', vp: 6, maxPlayers: 4, tutorial: 'inkas', lifeIcon: 'sun',
  tagline: 'Three eras, sets of goods, and a jungle that grows back.',
  blurb: 'Fish, feathers, coca and gold: bring whole sets of goods as tribute to win culture tokens. Every era ends when its tokens are gone: villages shrink, thickets grow and a new tribe rises. Six of the 11 tokens clinch the game.',
  tokenKeys: ['nugget'], limited: ['catch', 'feathers', 'coca', 'nugget'], bankBuys: ['catch', 'feathers', 'coca', 'nugget'], tradeKeys: ['catch', 'feathers', 'coca', 'nugget'],
  bankText: 'Resources use your harbors.',
  ext, boardKey: v => JSON.stringify([v.inkas && v.inkas.thickets]),
  fresh(view, prev) {
    const old = new Set((prev.inkas && prev.inkas.thickets) || []);
    const thickets = new Set((view.inkas.thickets || []).filter(id => !old.has(id)));
    return { thickets, any: thickets.size > 0 };
  },

  hud(v) {
    const ik = v.inkas;
    return `<span class="hud-pill" style="--c:${ERAS[ik.era].color}" title="${tx('Era')}">${glyph('sun', 15)} ${ERAS[ik.era].num} <small>${esc(term(ERAS[ik.era].id))}</small></span>
      <span class="hud-pill" title="${tx('Culture tokens left in this era')}">${glyph('tribute', 15)} ${ik.left}</span>
      <span class="hud-pill" title="${tx('Thickets on the board')}">${glyph('thicket', 15)} ${ik.thickets.length}</span>`;
  },
  side: eraPanel,
  playerMeta(v, p) {
    return `<span class="mp" title="${tx('Culture tokens')}" style="color:#B8860B">${glyph('tribute', 12)}${p.culture}${p.perEra ? ` <small>(${p.perEra.join('·')})</small>` : ''}</span>`;
  },
  rollStatus() { return { sub: t('A 7 lets the jungle grow.') }; },
  mainStatus(v) {
    const L = v.legal || {};
    return L.tribute && L.tribute.can ? { msg: t('Build, trade or bring your tribute.'), sub: t('A whole set of goods wins a culture token.') } : {};
  },
  pendingText(mp) {
    if (mp.type === 'discard') return [t('Discard {n} cards.', { n: mp.count }), t('The jungle is near: you hold more than your hand limit.'), t('Choose cards')];
    if (mp.type === 'thicket') return [t('Let the jungle grow.'), t('Tap a tile for a thicket. You take a card from a player next to it.'), t('Choose tile')];
    return null;
  },
  pendingDialog(mp, A) {
    if (mp.type !== 'thicket') return;
    const L = A.view.legal || {};
    const hexes = Object.keys(L.thicket || {}).map(Number);
    A.pick('hexes', hexes, t('Tap a tile for the thicket.'), h => {
      const vs = L.thicket[h] || [];
      if (vs.length <= 1) return A.send({ type: 'growThicket', h, victim: vs[0] });
      A.choiceDialog(tx('Take a card from…'), '', vs.map(q => ({ value: q, html: `${houseIcon(A.view.players[q].color, 18)} ${esc(A.view.players[q].name)}` })), victim => A.send({ type: 'growThicket', h, victim }));
      return true;
    }, { key: 'thicket' });
  },

  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me(), cost = L.cost || COSTS, tr = L.tribute;
    return [
      { key: 'road', label: t('Trail'), icon: 'road', cost: cost.road, enabled: !!(actor && L.roads && L.roads.length), left: m.pieces.roads },
      { key: 'settlement', label: t('Camp'), icon: 'bohio', cost: cost.settlement, enabled: !!(actor && L.settlements && L.settlements.length), left: m.pieces.settlements },
      { key: 'city', label: t('Village'), icon: 'temple', cost: cost.city, enabled: !!(actor && L.cities && L.cities.length), left: m.pieces.cities },
      { key: 'tribute', label: t('Tribute'), icon: 'tribute', plain: true, sub: t('A set of goods, a culture token'), enabled: !!(tr && tr.can) },
      { key: 'clear', label: t('Thicket'), icon: 'thicket', plain: true, sub: t('Clear for 1 feathers + 1 coca'), enabled: !!(actor && L.clear && L.clear.length && L.clearCost) },
    ];
  },
  doAction(what, A) {
    const L = A.view.legal || {};
    switch (what) {
      case 'road': return A.pick('edges', L.roads, t('Tap where to build your trail.'), e => A.send({ type: 'buildRoad', e }), { key: 'road' });
      case 'settlement': return A.pick('vertices', L.settlements, t('Tap where to set up your camp.'), x => A.send({ type: 'buildSettlement', v: x }), { key: 'settlement' });
      case 'city': return A.pick('vertices', L.cities, t('Tap the camp to grow into a village.'), x => A.send({ type: 'buildCity', v: x }), { key: 'city' });
      case 'tribute': return tribute(A);
      case 'clear': return A.pick('hexes', L.clear, t('Tap the thicket to clear.'), h => A.send({ type: 'clearThicket', h }), { key: 'clear' });
      default: return undefined;
    }
  },
  onClick(el, A) {
    if (!el.closest('[data-in-tribute]') || el.closest('[data-in-tribute]').disabled) return false;
    tribute(A);
    return true;
  },
  setupText(v) { return { msg: v.setup.round === 1 ? t('Place your first camp.') : t('Place your second camp.'), sub: t('Tap a glowing corner. Camps need at least one empty corner between them.') }; },
  costsHtml(v) {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:92px">${esc(name)}</b><span class="cd">${Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('')}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    const eras = v.inkas.eras.map((e, i) => `<div style="padding:7px 0;border-top:1px solid var(--line)"><b style="color:${ERAS[i].color}">${ERAS[i].num} · ${esc(term(e.id))}</b> <span class="muted" style="font-size:12.5px">(${tx('{n} tokens', { n: e.tokens })})</span> <span class="in-set-inline">${goodsRow(e.tribute, 14)}</span><div class="muted" style="font-size:13px">${esc(t(ERAS[i].rule))}</div></div>`).join('');
    return `${row(t('Trail'), COSTS.road, t('only 1 coca in the last era'))}${row(t('Camp'), COSTS.settlement, t('makes 1 good'))}${row(t('Village'), COSTS.city, t('makes 2 goods'))}${row(t('Clear a thicket'), { feathers: 1, coca: 1 }, '')}
      <p class="muted" style="font-size:13px;margin:10px 0 4px">${tx('Once per turn you may bring a tribute: the era’s whole set of goods (gold stands in for any good) wins one culture token. When the tokens of an era are gone, the era ends: villages shrink to camps and thickets grow. A 7 lets the jungle grow instead of a robber. 6 of the 11 tokens win; after the last era the most tokens win.')}</p>${eras}`;
  },

  afterState(view, prev, A) {
    const G = A.G, ik = view.inkas;
    const top = ik.claims.reduce((a, c) => Math.max(a, c.seq), 0);
    if (G.inSeen == null) G.inSeen = prev ? 0 : top;
    const fresh = ik.claims.filter(c => c.seq > G.inSeen);
    G.inSeen = Math.max(G.inSeen, top);
    const endSeq = ik.ending ? ik.ending.seq : 0;
    if (G.inEnd == null) G.inEnd = prev ? 0 : endSeq;
    const newEnd = ik.ending && ik.ending.seq > G.inEnd ? ik.ending : null;
    G.inEnd = Math.max(G.inEnd, endSeq);
    if (prev) { fresh.forEach(c => claimScene(view, c)); if (newEnd) eraScene(view, newEnd); }
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    (b.perEra || []).forEach((n, i) => { if (n) out.push(chip(ico('tribute', 16, ERAS[i].color), n, `${term(ERAS[i].id)} × ${n}`)); });
    return out;
  },
});

function tribute(A) {
  const tr = (A.view.legal || {}).tribute;
  if (!tr || !tr.can) { A.toast(t('There is nowhere to do that right now.'), 'warn'); return; }
  if (!tr.gold) return A.send({ type: 'tribute' });
  A.choiceDialog(tx('Bring tribute'), tx('You are missing goods. {n} gold will stand in for them.', { n: tr.gold }),
    [{ value: 1, html: `${glyph('tribute', 18)} ${tx('Bring tribute')}`, cls: 'gold' }], () => A.send({ type: 'tribute' }));
}

export default plugin;
