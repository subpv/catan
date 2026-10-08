// Dawn of Humankind (Aufbruch der Menschheit): the plugin for the standalone game. Stone-age board art (humankind-art.js),
// the progress tracks, the discovery scene when the mist lifts and the Smilodon that replaces the robber.
import { register } from './registry.js';
import { extendCore, glyph, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, term, houseIcon } from '../core.js';
import { enqueue, layer, hold, sfx, LOOT_BY_MODE } from '../fx.js';
import * as art from './humankind-art.js';

const tx = (k, p) => esc(t(k, p));
const S = 56;
const f = n => n.toFixed(1);

// ------------------------------------------------------------ new cards, terms and icons
extendCore({
  names: { meat: 'Meat', hide: 'Hide', flint: 'Flint', bone: 'Bone' },
  colors: { meat: '#C4503B', hide: '#A9743F', flint: '#6F7C8C', bone: '#A89B7C' },
  terms: { fire: 'Fire', tools: 'Tools', language: 'Language', art: 'Art', bounty: 'Rich land', herd: 'Herd', spark: 'Bright idea', den: 'Smilodon', none: 'Empty land' },
  glyphs: {
    meat: '<ellipse cx="14" cy="9.500" rx="6.500" ry="5.400" transform="rotate(38 14 9.500)" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.500 13.500 5.500 18.500" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"/><circle cx="4.400" cy="19.600" r="1.900" fill="currentColor"/><circle cx="7" cy="21.200" r="1.700" fill="currentColor"/>',
    hide: '<path d="M4 4.500l3.200 2.200h9.600L20 4.500l2 5.200-3 2 1 4.300-3.200 1.200.6 4.800H7.600l.6-4.800L5 16l1-4.300-3-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    flint: '<path d="M12 2.500 18.500 11 12 21.500 5.500 11z M12 6.500v10 M8.500 11h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    bone: '<path d="M16.500 3.500a3 3 0 0 0-2.700 4.200L7.700 13.800a3 3 0 0 0-4 4 3 3 0 0 0 4 4 3 3 0 0 0 2.700-4.200l6.100-6.100a3 3 0 0 0 4-4 3 3 0 0 0-4-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" transform="translate(0 -1)"/>',
    campfire: '<path d="M12 2.500c.8 3.800 5 5.200 5 9.600a5 5 0 0 1-10 0c0-2 1-3.500 2.300-4.600.2 1.700 1 2.500 2 2.500-.6-2.600-.6-5 .7-7.500z M3.500 21.500 20.500 17.500 M3.500 17.500 20.500 21.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    tools: '<path d="M13 4.500l6.500 6.500-3 3-6.500-6.500z M12.500 9.500 4 18l2 2 8.500-8.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    language: '<path d="M4 5h16v11h-8.500L7 20v-4H4z M8 9.500h8 M8 12.500h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    art: '<path d="M7.500 21.500v-7.200L5.600 9.600a1.300 1.300 0 0 1 2.300-1.200L9 10.800V4.800a1.300 1.300 0 0 1 2.600 0V3.600a1.300 1.300 0 0 1 2.600 0v1.800a1.300 1.300 0 0 1 2.600 0l.2 6.600 1.500-2.300a1.300 1.300 0 0 1 2.200 1.400L17 15.800v5.700z" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/>',
    idea: '<path d="M9 18.500h6 M10 21.500h4 M12 2.500a6.500 6.500 0 0 0-3.800 11.800c.6.500 1 1.200 1 2.200h5.600c0-1 .4-1.700 1-2.200A6.500 6.500 0 0 0 12 2.500z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    beast: '<ellipse cx="12" cy="16.300" rx="4.600" ry="3.900" fill="currentColor"/><circle cx="5.600" cy="11.200" r="2.100" fill="currentColor"/><circle cx="9.400" cy="6.300" r="2.100" fill="currentColor"/><circle cx="14.600" cy="6.300" r="2.100" fill="currentColor"/><circle cx="18.400" cy="11.200" r="2.100" fill="currentColor"/>',
    explore: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.800 8.200 13.600 13.600 8.200 15.800 10.400 10.400z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
    tent: '<path d="M2.500 20.500 12 3.500l9.500 17z M9.800 20.500 12 14l2.200 6.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    hut: '<path d="M2.500 20.500v-6.500a6 6 0 0 1 12 0v6.500z M14.500 20.500l3.600-9 3.400 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  },
});
LOOT_BY_MODE.humankind = { meat: ['pasture', 'fields'], hide: 'forest', flint: 'hills', bone: 'mountains' };

const RES = ['meat', 'hide', 'flint', 'bone'];
const COSTS = { road: { hide: 1, flint: 1 }, settlement: { hide: 1, flint: 1, meat: 2 }, city: { meat: 2, bone: 3 } };
const TRACKS = {
  fire: { icon: 'campfire', color: '#E8742A', res: 'meat', perks: ['Hand limit 9.', 'Hand limit 11.', 'Hand limit 13 and +1 point.'] },
  tools: { icon: 'tools', color: '#6F7C8C', res: 'flint', perks: ['Trails cost only 1 hide.', 'Camps cost 1 meat less.', 'Villages cost 1 bone less and +1 point.'] },
  language: { icon: 'language', color: '#4F8AD8', res: 'hide', perks: ['The bank trades 3:1.', 'Meat and hide trade 2:1.', 'Everything trades 2:1 and +1 point.'] },
  art: { icon: 'art', color: '#B8479A', res: 'bone', perks: ['First cave painting: +1 point.', 'Second cave painting: +1 point.', 'Third cave painting: +1 point.'] },
};
const ORDER = ['fire', 'tools', 'language', 'art'];
const FIND = {
  bounty: { icon: null, good: true, name: 'Rich land', text: 'A rich hunting ground: the explorer takes 2 cards.' },
  herd: { icon: 'meat', good: true, name: 'Herd', text: 'A herd on the move: 1 meat and 1 hide.' },
  spark: { icon: 'idea', good: true, name: 'Bright idea', text: 'The next step on a progress track costs 1 less.' },
  den: { icon: 'beast', good: false, name: 'Smilodon', text: 'A Smilodon wakes up in its den. The explorer drops a card.' },
  none: { icon: 'explore', good: true, name: 'Empty land', text: 'Nothing here, but the way is open.' },
};

// ------------------------------------------------------------ board
function ext(view) {
  const hk = view.humankind || {};
  return {
    color: h => art.TERRAIN_COLOR[h.terrain],
    glyph: h => art.TERRAIN_GLYPH[h.terrain],
    life: art.tileLife,
    building: (b, c) => art.building(b, c),
    shape: art.shape,
    tiles({ board, life, fr }) {
      if (hk.beast == null) return '';
      const h = board.hexes[hk.beast];
      if (!h || h.terrain === 'fog') return '';
      const cx = h.x * S, cy = h.y * S;
      const pts = h.verts.map(id => { const v = board.vertices[id]; return `${f(cx + (v.x * S - cx) * 0.97)},${f(cy + (v.y * S - cy) * 0.97)}`; }).join(' ');
      return `<g pointer-events="none">${life ? `<polygon class="lf-dim" points="${pts}" fill="rgba(24,10,4,.34)"/>` : ''}<g transform="translate(${f(cx - (h.number ? 25 : 0))},${f(cy + 8)}) scale(.92)"><title>${esc(t('Smilodon'))}</title>${art.beastArt(life, fr && fr.beast)}</g></g>`;
    },
  };
}

// ------------------------------------------------------------ panels
const trackPips = (lvl, color) => Array.from({ length: 3 }, (_, i) => `<i class="${i < lvl ? 'on' : ''}" style="${i < lvl ? `background:${color}` : ''}"></i>`).join('');
function progressPanel(v, A) {
  const me = A.me(), L = v.legal || {}, actor = A.actor();
  const mine = A.isMine() ? me : null;
  const rows = ORDER.map(k => {
    const tr = TRACKS[k], lvl = mine ? mine.tracks[k] : 0, adv = L.advance && L.advance[k];
    const next = lvl < 3 ? t(tr.perks[lvl]) : t('Complete.');
    const can = actor && adv && mine.res[tr.res] >= adv.cost;
    return `<div class="hk-track" style="--tc:${tr.color}">
      <span class="hk-ti">${glyph(tr.icon, 18)}</span>
      <div class="hk-tb"><b>${tx(k === 'fire' ? 'Fire' : k === 'tools' ? 'Tools' : k === 'language' ? 'Language' : 'Art')}</b><div class="hk-pips">${trackPips(lvl, tr.color)}</div><small>${esc(lvl < 3 ? t('Next: {perk}', { perk: next }) : next)}</small></div>
      ${lvl < 3 && mine ? `<button class="btn small ${can ? 'gold' : ''}" data-hk-adv="${k}" ${can ? '' : 'disabled'} title="${tx('Advance')}">${adv ? `${adv.cost} ${glyph(tr.res, 14)}` : `${COSTS_STEP[lvl]} ${glyph(tr.res, 14)}`}</button>` : `<span class="hk-done">${lvl >= 3 ? '✓' : ''}</span>`}
    </div>`;
  }).join('');
  const ideas = mine && mine.ideas ? `<span class="hk-idea" title="${tx('Bright ideas: the next step on a track costs 1 less.')}">${glyph('idea', 14)} ${mine.ideas}</span>` : '';
  const hk = v.humankind;
  const pf = hk.pathfinder != null ? `<div class="evclean">${glyph('explore', 14)} ${tx('Pathfinder: {name} (+2)', { name: esc(v.players[hk.pathfinder].name) })}</div>` : `<div class="muted" style="font-size:12.5px;margin-top:6px">${tx('The Pathfinder (+2) is whoever explored the most land, at least 3 tiles.')}</div>`;
  return `<div class="panel hk-prog"><div class="panel-h">${tx('Progress')}<span class="spacer"></span>${ideas}</div>${rows}${pf}</div>`;
}
const COSTS_STEP = [2, 3, 4];

// ------------------------------------------------------------ the discovery scene
function findScene(view, finds) {
  const real = finds.filter(d => d.kind !== 'none');
  if (!real.length) { sfx.reveal?.(); return; }
  enqueue(async () => {
    sfx.reveal?.();
    const who = view.players[finds[0].p];
    const discs = real.map(d => {
      const F = FIND[d.kind];
      const icon = d.kind === 'bounty' ? Object.keys(d.cards || { meat: 1 })[0] : F.icon;
      const text = d.kind === 'bounty' && d.cards ? t('A rich hunting ground: {n} {res}.', { n: Object.values(d.cards)[0], res: resName(Object.keys(d.cards)[0]) }) : t(F.text);
      return `<div class="ev-disc ${F.good ? 'green' : 'brown'}"><div class="ev-face">${glyph(icon, 40)}</div><b>${esc(t(F.name))}</b><small>${esc(text)}</small></div>`;
    }).map((d, i) => d.replace('class="ev-disc', `style="animation-delay:${i * 0.5}s" class="ev-disc`));
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('{name} discovers new land', { name: esc(who.name) })}</div><div class="ev-discs">${discs.join('')}</div></div>`);
    if (real.some(d => d.kind === 'den')) setTimeout(() => sfx.roar?.(), 500); else setTimeout(() => sfx.leaf?.(), 450);
    await hold(sc, 1900 + real.length * 500);
  });
}

// ------------------------------------------------------------ the plugin
const plugin = register({
  id: 'humankind', name: 'Dawn of Humankind', vp: 10, maxPlayers: 4, tutorial: 'humankind', lifeIcon: 'campfire',
  tagline: 'Explore the mist, hunt, and grow with Fire, Tools, Language and Art.',
  blurb: 'The world starts hidden in the mist. Your trails reveal it, and every new land hides a find. Hunt meat, hide, flint and bone, climb four progress tracks and watch out for the Smilodon. First to 10 points wins.',
  tokenKeys: [], limited: RES, bankBuys: RES, tradeKeys: RES,
  bankText: 'Resources use your harbors. Language makes the rates better.',
  ext, boardKey: v => JSON.stringify([v.humankind && v.humankind.beast]),
  fresh(view, prev) {
    const b = (view.humankind && view.humankind.beast) !== (prev.humankind && prev.humankind.beast);
    return { beast: b, any: b };
  },

  hud(v) {
    const hk = v.humankind, me = v.players[v.me];
    return `<span class="hud-pill" title="${tx('Tiles still hidden in the mist')}">${glyph('explore', 15)} ${hk.hidden}</span>
      ${me && me.ideas ? `<span class="hud-pill" title="${tx('Bright ideas: the next step on a track costs 1 less.')}">${glyph('idea', 15)} ${me.ideas}</span>` : ''}`;
  },
  side: progressPanel,
  playerMeta(v, p) {
    const lv = ORDER.filter(k => p.tracks[k]).map(k => `<span class="mp" title="${esc(term(k))}: ${p.tracks[k]}/3" style="color:${TRACKS[k].color}">${glyph(TRACKS[k].icon, 12)}${p.tracks[k]}</span>`).join('');
    return `<span class="mp" title="${tx('Explored tiles')}">${glyph('explore', 12)}${p.explored}</span>${lv}`;
  },
  awards(v, i) {
    let out = '';
    if (v.longestRoad.p === i) out += `<span class="award" title="${tx('Longest Trail')} (+2)">${glyph('road', 11)}${v.longestRoad.len}</span>`;
    if (v.humankind.pathfinder === i) out += `<span class="award green" title="${tx('Pathfinder')} (+2)">${glyph('explore', 11)}</span>`;
    return out;
  },
  rollStatus() { return { sub: t('A 7 sends the Smilodon prowling.') }; },
  pendingText(mp) {
    if (mp.type === 'discard') return [t('Discard {n} cards.', { n: mp.count }), t('The Smilodon is near: you hold more than your hand limit.'), t('Choose cards')];
    if (mp.type === 'beast') return [t('Move the Smilodon.'), t('Tap a tile. You take a card from a player next to it.'), t('Choose tile')];
    return null;
  },
  pendingDialog(mp, A) {
    if (mp.type !== 'beast') return;
    const L = A.view.legal || {};
    const hexes = Object.keys(L.beast || {}).map(Number);
    A.pick('hexes', hexes, t('Tap a tile for the Smilodon.'), h => {
      const vs = L.beast[h] || [];
      if (vs.length <= 1) return A.send({ type: 'moveBeast', h, victim: vs[0] });
      A.choiceDialog(tx('Take a card from…'), '', vs.map(q => ({ value: q, html: `${houseIcon(A.view.players[q].color, 18)} ${esc(A.view.players[q].name)}` })), victim => A.send({ type: 'moveBeast', h, victim }));
      return true;
    }, { key: 'beast' });
  },

  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me(), cost = L.cost || COSTS;
    return [
      { key: 'road', label: t('Trail'), icon: 'road', cost: cost.road, enabled: !!(actor && L.roads && L.roads.length), left: m.pieces.roads },
      { key: 'settlement', label: t('Camp'), icon: 'tent', cost: cost.settlement, enabled: !!(actor && L.settlements && L.settlements.length), left: m.pieces.settlements },
      { key: 'city', label: t('Village'), icon: 'hut', cost: cost.city, enabled: !!(actor && L.cities && L.cities.length), left: m.pieces.cities },
      { key: 'progress', label: t('Progress'), icon: 'campfire', plain: true, sub: t('Fire, Tools, Language, Art'), enabled: !!(actor && L.advance && Object.values(L.advance).some(a => a && m.res[a.res] >= a.cost)) },
    ];
  },
  doAction(what, A) {
    const L = A.view.legal || {};
    switch (what) {
      case 'road': return A.pick('edges', L.roads, t('Tap where to build your trail.'), e => A.send({ type: 'buildRoad', e }), { key: 'road' });
      case 'settlement': return A.pick('vertices', L.settlements, t('Tap where to set up your camp.'), x => A.send({ type: 'buildSettlement', v: x }), { key: 'settlement' });
      case 'city': return A.pick('vertices', L.cities, t('Tap the camp to grow into a village.'), x => A.send({ type: 'buildCity', v: x }), { key: 'city' });
      case 'progress': return progressDialog(A);
      default: return undefined;
    }
  },
  onClick(el, A) {
    const b = el.closest('[data-hk-adv]');
    if (!b || b.disabled) return false;
    A.send({ type: 'advance', track: b.dataset.hkAdv });
    return true;
  },
  setupText(v, A) { return { msg: v.setup.round === 1 ? t('Place your first camp.') : t('Place your second camp.'), sub: t('Tap a glowing corner. Camps need at least one empty corner between them.') }; },
  costsHtml(v, A) {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:92px">${esc(name)}</b><span class="cd">${Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('')}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    const trs = ORDER.map(k => `<div style="padding:7px 0;border-top:1px solid var(--line)"><b style="color:${TRACKS[k].color}">${glyph(TRACKS[k].icon, 14)} ${esc(term(k))}</b> <span class="muted" style="font-size:12.5px">(${COSTS_STEP.join(' · ')} ${esc(resName(TRACKS[k].res))})</span><div class="muted" style="font-size:13px">${TRACKS[k].perks.map((p, i) => `${i + 1}. ${esc(t(p))}`).join('<br>')}</div></div>`).join('');
    return `${row(t('Trail'), COSTS.road, '')}${row(t('Camp'), COSTS.settlement, t('1 point'))}${row(t('Village'), COSTS.city, t('2 points, 2 cards per tile'))}
      <p class="muted" style="font-size:13px;margin:10px 0 4px">${tx('Four progress tracks with three steps each. Every step costs more of the track’s own resource. A bright idea makes the next step 1 cheaper.')}</p>${trs}
      <p class="muted" style="font-size:13px;margin:10px 0 0">${tx('Trails and camps lift the mist. Every new land hides a find: a rich hunting ground, a herd, a bright idea, or a sleeping Smilodon. On a 7 the roller moves the Smilodon and takes a card.')}</p>`;
  },

  afterState(view, prev, A) {
    const G = A.G;
    const finds = view.humankind.finds || [];
    const top = finds.reduce((a, d) => Math.max(a, d.seq), 0);
    if (G.hkSeen == null) G.hkSeen = prev ? 0 : top;
    const fresh = finds.filter(d => d.seq > G.hkSeen);
    G.hkSeen = Math.max(G.hkSeen, top);
    if (fresh.length && prev) findScene(view, fresh);
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    if (b.settlements) out.push(chip(houseIcon(w.color, 16), b.settlements, `${b.settlements} × ${t('Camps')}`));
    if (b.cities) out.push(chip(glyph('hut', 16), b.cities * 2, `${b.cities} × ${t('Villages')}`));
    if (b.longestRoad) out.push(chip(ico('road', 16, '#F6CF57'), 2, t('Longest Trail')));
    if (b.pathfinder) out.push(chip(ico('explore', 16, '#9BE08A'), 2, t('Pathfinder')));
    if (b.trackVp) out.push(chip(ico('campfire', 16, '#F59B1B'), b.trackVp, t('Progress')));
    return out;
  },
});

function progressDialog(A) {
  const v = A.view, L = v.legal || {}, m = A.me();
  const opts = ORDER.filter(k => L.advance && L.advance[k]).map(k => {
    const a = L.advance[k], tr = TRACKS[k], lvl = m.tracks[k];
    return { value: k, disabled: m.res[a.res] < a.cost, style: 'justify-content:flex-start;text-align:left', html: `<span style="color:${tr.color}">${glyph(tr.icon, 20)}</span> <span><b>${esc(term(k))}</b> ${lvl + 1}/3 · ${a.cost} ${glyph(a.res, 14)}<br><small class="muted">${esc(t(tr.perks[lvl]))}</small></span>` };
  });
  A.choiceDialog(tx('Progress'), tx('Pick a track to advance one step.'), opts, track => A.send({ type: 'advance', track }));
}

export default plugin;
