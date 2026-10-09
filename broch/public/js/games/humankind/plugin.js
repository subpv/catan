// Dawn of Humankind (CATAN - Aufbruch der Menschheit): the plugin for the standalone game. The world map with its
// stone-age art (board.js / art.js), explorers that walk to discovery fields and camp sites, the
// four progress tracks and the two threats that replace the robber.
import { register } from '../registry.js';
import { extendCore, glyph, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, term, houseIcon } from '../../core/core.js';
import { enqueue, layer, hold, sfx, LOOT_BY_MODE, THREAT_BY_MODE } from '../../core/fx.js';
import * as art from './art.js';
import { renderWorld } from './board.js';

const tx = (k, p) => esc(t(k, p));

// ------------------------------------------------------------ new cards, terms and icons
const I = d => `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${d}</g>`;
extendCore({
  names: { fur: 'Fur', bone: 'Bone', meat: 'Meat', flint: 'Flint' },
  colors: { fur: '#A9743F', bone: '#C9B27A', meat: '#C4503B', flint: '#6F7C8C' },
  terms: {
    clothing: 'Clothing', construction: 'Construction', food: 'Food', hunt: 'Hunting',
    neanderthal: 'Neanderthal', tiger: 'Saber-toothed tiger',
    europe: 'Europe', asia: 'Asia', australia: 'Australia', namerica: 'North America', samerica: 'South America', america: 'America',
    wasteland: 'Wasteland', grassland: 'Grassland', jagd: 'Hunting', erode: 'Desertification', threat: 'Threat',
  },
  glyphs: {
    fur: '<path d="M4 4.500l3.200 2.200h9.600L20 4.500l2 5.200-3 2 1 4.300-3.200 1.200.6 4.800H7.600l.6-4.800L5 16l1-4.300-3-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    meat: '<path d="M14 3C19 2.500 22.500 6 21.200 10.500 20 14.500 16 16 12.800 14.300 9.800 12.700 8.800 8.400 10.500 5.500 11.500 3.800 12.600 3.100 14 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11.500 12.500 5.800 18" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/><circle cx="4.200" cy="18.500" r="1.900" fill="currentColor"/><circle cx="6.300" cy="20.700" r="1.900" fill="currentColor"/><path d="M14.500 7.500c1.500 0 2.500.8 3 2" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round"/>',
    flint: '<path d="M12 2.500 18.500 11 12 21.500 5.500 11z M12 6.500v10 M8.500 11h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    bone: '<path d="M16.500 3.500a3 3 0 0 0-2.700 4.200L7.700 13.800a3 3 0 0 0-4 4 3 3 0 0 0 4 4 3 3 0 0 0 2.700-4.200l6.100-6.100a3 3 0 0 0 4-4 3 3 0 0 0-4-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" transform="translate(0 -1)"/>',
    campfire: '<path d="M12 2.500c.8 3.800 5 5.200 5 9.600a5 5 0 0 1-10 0c0-2 1-3.500 2.300-4.600.2 1.700 1 2.500 2 2.500-.6-2.600-.6-5 .7-7.500z M3.500 21.500 20.500 17.500 M3.500 17.500 20.500 21.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    tent: '<path d="M2.500 20.500 12 3.500l9.500 17z M9.800 20.500 12 14l2.200 6.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    explorer: I('<circle cx="7" cy="5" r="2.200"/><path d="M7 7.500V14l-3 6.500M7 14l3 6.500M7 9.500l-3 2.500M7 9.500l4 1.500M15 22 18 3M16.500 3h3"/>'),
    clothing: I('<path d="M8.500 3 3 6l2 4 2.500-1V21h9V9l2.500 1 2-4-5.500-3a3.500 3.500 0 0 1-7 0z"/>'),
    construction: '<path d="M2.500 20.500 12 3.500l9.500 17z M9.800 20.500 12 14l2.200 6.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    food: I('<path d="M3.500 12h17a8.500 8.500 0 0 1-17 0z M8 8.500c0-2 2-2.500 2-4.500M13 8.500c0-2 2-2.500 2-4.500"/>'),
    hunt: I('<path d="M6 3.500c11 6 11 11 0 17M6 3.500v17M6 12h15M17.500 8.500 21 12l-3.500 3.500"/>'),
    neanderthal: I('<path d="M12 3.500a6 6 0 0 0-6 6V13l-1.500 2L6 16.500V20h6.500v-3h2a4.500 4.500 0 0 0 4.500-4.500V9.500a6 6 0 0 0-7-6z M7.500 9.500h8"/><circle cx="10" cy="11.500" r=".6"/><circle cx="14" cy="11.500" r=".6"/>'),
    tiger: I('<path d="M3.500 4.500 7 7.500h10l3.500-3v8a8.500 8.500 0 0 1-17 0z M9 14l1 6.500 1.500-5.500M15 14l-1 6.500-1.500-5.500"/>'),
    site: I('<path d="M12 2.500 20 7v10l-8 4.500L4 17V7z"/><circle cx="12" cy="12" r="3"/>'),
  },
});
LOOT_BY_MODE.humankind = { fur: 'forest', bone: 'wasteland', meat: 'grassland', flint: 'mountains' };

const RES = ['fur', 'bone', 'meat', 'flint'];
const COSTS = { explorer: { fur: 1, meat: 1 }, camp: { fur: 1, bone: 1, flint: 1 } };
const STEP_COST = [{ flint: 1 }, { bone: 1 }, { bone: 1, flint: 1 }, { meat: 1, bone: 1, flint: 1 }];
const ORDER = ['clothing', 'construction', 'food', 'hunt'];
const TRACKS = {
  clothing: { icon: 'clothing', color: '#8B5A2B', mark: 'Jewelry', perk: 'Needed for discovery fields.' },
  construction: { icon: 'construction', color: '#C08A3E', mark: 'Tallow lamp', perk: 'Needed for discovery fields.' },
  food: { icon: 'food', color: '#4F9A4A', mark: 'Pottery', perk: 'Explorers walk 1 crossing further.' },
  hunt: { icon: 'hunt', color: '#B8479A', mark: 'Bow and arrow', perk: 'Move a threat and steal a card.' },
};
const REGIONS = ['europe', 'asia', 'australia', 'namerica', 'samerica'];
const SITE_COLORS = ['europe', 'asia', 'australia', 'america'];
const colorSite = r => (r === 'namerica' || r === 'samerica' ? 'america' : r);
const costDots = cost => Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('');

// ------------------------------------------------------------ the 7 scene: the threats stir
THREAT_BY_MODE.humankind = {
  title: 'The threats stir!',
  sub: (view, discards) => [discards ? t('Players holding too many cards must discard half.') : t('Nobody has to discard.'), t('The roller moves the Neanderthal or the Saber-toothed tiger.')].join(' '),
  svg: `<svg viewBox="-70 -70 140 130" class="fx-robber-fig" style="width:330px"><g transform="translate(-34,36) scale(1.9)">${art.neanderthal(false, false)}</g><g transform="translate(38,36) scale(1.35)">${art.sabertooth(false, false)}</g></svg>`,
  sfx: 'roar',
};

// ------------------------------------------------------------ the world
function fresh(view, prev) {
  const out = { explorers: new Set(), threats: new Set(), any: false };
  const a = view.humankind, b = prev && prev.humankind;
  if (!a || !b) return out;
  const was = new Set(b.explorers.map(e => `${e.p}:${e.v}`));
  a.explorers.forEach(e => { if (!was.has(`${e.p}:${e.v}`)) { out.explorers.add(e.v); out.any = true; } });
  for (const k of ['neanderthal', 'tiger']) if (a.threats[k] !== b.threats[k]) { out.threats.add(k); out.any = true; }
  return out;
}
function boardKey(v) {
  const hk = v.humankind, me = v.players[v.me];
  return JSON.stringify([hk.explorers, hk.threats, Object.keys(hk.sites).length, hk.df.map(d => d.taken), hk.jagd.map(j => j.by), me && me.tracks && [me.tracks.clothing, me.tracks.construction], v.board.hexes.map(h => h.number)]);
}

// ------------------------------------------------------------ panels
const pips = (lvl, color) => Array.from({ length: 4 }, (_, i) => `<i class="${i < lvl ? 'on' : ''}" style="${i < lvl ? `background:${color}` : ''}"></i>`).join('');
function progressPanel(v, A) {
  const me = A.me(), L = v.legal || {}, actor = A.actor();
  const mine = A.isMine() && me.tracks ? me : null;
  const rows = ORDER.map(k => {
    const tr = TRACKS[k], lvl = mine ? mine.tracks[k] : 0, adv = L.advance && L.advance[k];
    const holder = v.humankind.marks[k];
    const medal = holder != null ? `<span class="hk-mk" title="${esc(t(tr.mark))}: ${esc(v.players[holder].name)}">${houseIcon(v.players[holder].color, 12)}</span>` : `<span class="hk-mk free" title="${esc(t(tr.mark))}: +1">+1</span>`;
    const can = actor && adv && A.has(adv.cost);
    const extra = k === 'food' ? ` ${t('Reach {n}.', { n: 3 + lvl })}` : '';
    return `<div class="hk-track" style="--tc:${tr.color}">
      <span class="hk-ti">${glyph(tr.icon, 18)}</span>
      <div class="hk-tb"><b>${esc(term(k))}</b><div class="hk-pips">${pips(lvl, tr.color)}</div>${medal}<small>${esc(t(tr.perk))}${esc(extra)}</small></div>
      ${lvl < 4 && mine ? `<button class="btn small ${can ? 'gold' : ''}" data-hk-adv="${k}" ${can ? '' : 'disabled'} title="${tx('Advance')}">${costDots(STEP_COST[lvl])}</button>` : `<span class="hk-done">${lvl >= 4 ? '✓' : ''}</span>`}
    </div>`;
  }).join('');
  return `<div class="panel hk-prog"><div class="panel-h">${tx('Progress')}</div>${rows}</div>${awardsPanel(v)}`;
}
function awardsPanel(v) {
  const hk = v.humankind, name = p => esc(v.players[p].name);
  const who = p => (p == null ? `<span class="muted">${tx('open')}</span>` : `${houseIcon(v.players[p].color, 13)} ${name(p)}`);
  const row = (icon, label, val, pts) => `<div class="hk-aw"><span class="hk-awi">${glyph(icon, 15)}</span><span class="hk-awl">${esc(label)} <small>(+${pts})</small></span><span class="hk-awv">${val}</span></div>`;
  const col = hk.special.collectors.length ? hk.special.collectors.map(p => `${houseIcon(v.players[p].color, 13)}`).join(' ') : `<span class="muted">${tx('open')}</span>`;
  const me = v.players[v.me];
  const chips = me && me.tiles ? SITE_COLORS.map(c => `<span class="hk-sc" title="${esc(t(c === 'america' ? 'America' : term(c)))}" style="--sc:${art.SITE_COLOR[c][0]}"><svg viewBox="-14 -14 28 28" width="20" height="20">${art.siteTile(c, 1)}</svg><b>${me.tiles[c]}</b></span>`).join('') : '';
  return `<div class="panel hk-prog"><div class="panel-h">${tx('Awards')}</div>
    ${chips ? `<div class="hk-sites"><small class="muted">${tx('Your camp site tiles: all 4 colours make a Collector.')}</small><div>${chips}</div></div>` : ''}
    ${row('hunt', t('Most Successful Hunter'), who(hk.special.hunter), 1)}
    ${row('site', t('Fastest Collector'), who(hk.special.fastest), 2)}
    ${row('site', t('Collector'), col, 1)}
  </div>`;
}

// ------------------------------------------------------------ the discovery scene
const BACK = {
  jagd: { icon: null, name: 'Hunting luck', text: 'The hunting marker of this region is yours: +1 point.' },
  erode: { icon: 'bone', name: 'Desertification', text: 'A number chip of that landscape is removed from Africa.' },
  threat: { icon: 'tiger', name: 'Threat', text: 'Move the Neanderthal or the Saber-toothed tiger.' },
};
function findScene(view, finds) {
  enqueue(async () => {
    sfx.reveal?.();
    const who = view.players[finds[0].p];
    const discs = finds.map((d, i) => {
      const B = BACK[d.kind];
      const face = d.kind === 'jagd' ? `<svg viewBox="-24 -22 48 44" width="46" height="42">${art.dfTile(d.region, 1.2)}</svg>` : d.kind === 'erode' ? glyph(d.terrain === 'forest' ? 'fur' : d.terrain === 'grassland' ? 'meat' : d.terrain === 'mountains' ? 'flint' : 'bone', 40) : `${glyph('neanderthal', 34)}${glyph('tiger', 34)}`;
      const text = d.kind === 'erode' ? t('A number chip of the {l} landscape is removed from Africa.', { l: term(d.terrain) }) : d.kind === 'jagd' ? t('The hunting marker of {r} is yours: +1 point.', { r: term(d.region) }) : t(B.text);
      return `<div class="ev-disc ${d.kind === 'jagd' ? 'green' : 'brown'}" style="animation-delay:${i * 0.5}s"><div class="ev-face">${face}</div><b>${esc(t(B.name))}</b><small>${esc(text)}</small></div>`;
    });
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('{name} turns over a discovery tile', { name: esc(who.name) })}</div><div class="ev-discs">${discs.join('')}</div></div>`);
    if (finds.some(d => d.kind === 'threat')) setTimeout(() => sfx.roar?.(), 500); else setTimeout(() => sfx.leaf?.(), 450);
    await hold(sc, 1900 + finds.length * 500);
  });
}

// ------------------------------------------------------------ doing things
function threatName(k) { return t(k === 'neanderthal' ? 'Neanderthal' : 'Saber-toothed tiger'); }
function threatDialog(A) {
  const L = A.view.legal || {};
  const opts = ['neanderthal', 'tiger'].filter(k => L.threat && Object.keys(L.threat[k]).length).map(k => ({
    value: k, style: 'justify-content:flex-start;text-align:left',
    html: `<span style="color:#E8C48A">${glyph(k, 26)}</span> <span><b>${esc(threatName(k))}</b><br><small class="muted">${k === 'neanderthal' ? tx('Fields in Europe and Asia') : tx('Fields in America and Australia')}</small></span>`,
  }));
  if (L.threatOptional) opts.push({ value: 'skip', html: tx('Leave them where they are'), cls: '' });
  A.choiceDialog(tx('Move a threat'), tx('It stops the yields of its field. You take a card from a player with a camp next to it.'), opts, k => {
    if (k === 'skip') { A.send({ type: 'skipThreat' }); return true; }
    const hexes = Object.keys(L.threat[k]).map(Number);
    A.pick('hexes', hexes, t('Tap a field for the {name}.', { name: threatName(k) }), h => {
      const vs = L.threat[k][h] || [];
      if (vs.length <= 1) return A.send({ type: 'moveThreat', threat: k, h, victim: vs[0] });
      A.choiceDialog(tx('Take a card from…'), '', vs.map(q => ({ value: q, html: `${houseIcon(A.view.players[q].color, 18)} ${esc(A.view.players[q].name)}` })), victim => A.send({ type: 'moveThreat', threat: k, h, victim }));
      return true;
    }, { key: 'threat' });
    return true;
  }, !!L.threatOptional);
}
function payAndSend(A, from, to) {
  const m = A.me();
  const send = pay => A.send({ type: 'moveExplorer', from, to, pay });
  if (m.res.fur > 0 && m.res.meat > 0) {
    A.choiceDialog(tx('Pay for the walk'), tx('An explorer needs 1 fur or 1 meat to move.'), RES.filter(k => k === 'fur' || k === 'meat').map(k => ({ value: k, html: `${glyph(k, 22)} ${esc(resName(k))} <small class="muted">(${m.res[k]})</small>` })), k => send(k));
    return;
  }
  return send(m.res.fur > 0 ? 'fur' : 'meat');
}
function moveFlow(A) {
  const L = A.view.legal || {};
  const from = Object.keys(L.moves || {}).map(Number);
  const go = f => A.pick('vertices', L.moves[f], t('Tap where the explorer should go.'), to => payAndSend(A, f, to), { key: 'move' });
  if (from.length === 1) return go(from[0]);
  return A.pick('vertices', from, t('Tap the explorer you want to move.'), f => { go(f); return true; }, { key: 'move' });
}
function placeFlow(A) {
  const L = A.view.legal || {};
  const place = remove => A.pick('vertices', L.explorerSpots, t('Tap a crossing next to one of your camps.'), v => A.send({ type: 'placeExplorer', v, remove }), { key: 'explorer' });
  if (L.explorerRemove) return A.pick('vertices', L.explorerRemove, t('Both explorers are on the board. Tap the one to take away.'), r => { place(r); return true; }, { key: 'explorer' });
  return place();
}
function campFlow(A) {
  const L = A.view.legal || {};
  const build = (v, remove) => A.send({ type: 'buildCamp', v, remove });
  const next = v => {
    if (L.campRemove && L.campRemove.length > 1) { A.pick('vertices', L.campRemove, t('You have all 6 camps out. Tap the camp to take back (Africa first).'), r => build(v, r), { key: 'camp' }); return true; }
    return build(v);
  };
  if (L.camps.length === 1) return next(L.camps[0]);
  return A.pick('vertices', L.camps, t('Tap the explorer to turn into a camp.'), v => next(v), { key: 'camp' });
}
function progressDialog(A) {
  const v = A.view, L = v.legal || {}, m = A.me();
  const opts = ORDER.filter(k => L.advance && L.advance[k]).map(k => {
    const a = L.advance[k], tr = TRACKS[k];
    return { value: k, disabled: !A.has(a.cost), style: 'justify-content:flex-start;text-align:left', html: `<span style="color:${tr.color}">${glyph(tr.icon, 22)}</span> <span><b>${esc(term(k))}</b> ${a.level}/4 <span class="cd">${costDots(a.cost)}</span><br><small class="muted">${esc(t(tr.perk))}</small></span>` };
  });
  // after the step a threat may have to move (Hunting): render again once this dialog is gone so the next dialog opens
  A.choiceDialog(tx('Progress'), tx('Pick a track to advance one step.'), opts, async track => { const ok = await A.send({ type: 'advance', track }); setTimeout(() => A.render(), 150); return ok; });
  return m;
}

// ------------------------------------------------------------ the plugin
const plugin = register({
  id: 'humankind', beta: true, name: 'Dawn of Humankind', vp: 10, maxPlayers: 4, minPlayers: 3, tutorial: 'humankind', lifeIcon: 'campfire',
  tagline: 'Leave Africa, settle the world and win 10 points.',
  blurb: 'The world in the Old Stone Age: 49 fields, 3 camps and 1 explorer each, starting in Africa. Walk with fur or meat, reach discovery fields with Clothing and Construction, found camps on camp sites for points and watch out for the Neanderthal and the Saber-toothed tiger. First to 10 points wins. For 3 or 4 players.',
  lobbyOptions: [{ key: 'free', label: 'Free founding', hint: 'Variable set-up: everyone places their 3 first camps and the explorer themselves in Africa.' }],
  tokenKeys: [], limited: RES, bankBuys: RES, tradeKeys: RES,
  bankText: 'Trade 3 equal cards for 1 card of your choice.',
  threat: { name: 'Neanderthal', icon: 'neanderthal' },
  boardKey, fresh,
  // phone: the map opens zoomed in on your own camps and explorer (the whole-map button shows all of it)
  phoneStart(v) {
    const pts = [], at = id => { const p = v.board.vertices[id]; if (p) pts.push({ x: p.x * 56, y: p.y * 56 }); };
    const who = v.me >= 0 ? v.me : v.current; // a spectator starts with the player whose turn it is
    if (who >= 0) {
      Object.entries(v.buildings || {}).forEach(([id, b]) => { if (b.p === who) at(id); });
      ((v.humankind && v.humankind.explorers) || []).forEach(e => { if (e.p === who) at(e.v); });
    }
    if (!pts.length && v.legal && v.legal.setupCamps) v.legal.setupCamps.forEach(at);
    return pts.length ? { points: pts, margin: 130, minZ: 1.8, maxZ: 2.6 } : null;
  },
  board: (view, targets, fr, zoom, life) => renderWorld(view, targets, fr, zoom, life),
  targets(v) {
    const L = v.legal || {};
    if (L.setupCamps) return { vertices: L.setupCamps };
    if (L.setupExplorers) return { vertices: L.setupExplorers };
    return {};
  },
  onBoardClick(el, id, A) {
    const L = A.view.legal || {};
    if (L.setupCamps) return A.send({ type: 'placeCamp', v: id });
    if (L.setupExplorers) return A.send({ type: 'placeExplorer', v: id });
    return undefined;
  },

  hud(v) {
    const hk = v.humankind, left = Object.keys(hk.sites).length;
    return `<span class="hud-pill" title="${tx('Steps an explorer can walk')}">${glyph('explorer', 15)} ${hk.range}</span><span class="hud-pill" title="${tx('Camp site tiles still on the board')}">${glyph('site', 15)} ${left}</span>`;
  },
  side: progressPanel,
  playerMeta(v, p) {
    const lv = ORDER.filter(k => p.tracks[k]).map(k => `<span class="mp" title="${esc(term(k))}: ${p.tracks[k]}/4" style="color:${TRACKS[k].color}">${glyph(TRACKS[k].icon, 12)}${p.tracks[k]}</span>`).join('');
    return `<span class="mp" title="${tx('Camp site tiles')}">${glyph('site', 12)}${p.owned}</span><span class="mp" title="${tx('Discovery tiles')}">${glyph('explorer', 12)}${p.finds}</span>${lv}`;
  },
  awards(v, i) {
    const p = v.players[i];
    let out = '';
    if (p.hunter) out += `<span class="award" title="${tx('Most Successful Hunter')} (+1)">${glyph('hunt', 11)}</span>`;
    if (p.fastest) out += `<span class="award green" title="${tx('Fastest Collector')} (+2)">${glyph('site', 11)}</span>`;
    else if (p.collector) out += `<span class="award green" title="${tx('Collector')} (+1)">${glyph('site', 11)}</span>`;
    return out;
  },
  rollStatus() { return { sub: t('A 7 stirs the threats: nobody receives anything.') }; },
  mainStatus(v, A) {
    const L = v.legal || {};
    const moves = Object.keys(L.moves || {}).length;
    return { msg: t('Walk, found camps, climb the tracks or trade.'), sub: moves ? t('Explorers walk up to {n} crossings for 1 fur or 1 meat.', { n: L.range }) : t('Place an explorer or trade to get going.') };
  },
  pendingText(mp) {
    if (mp.type === 'discard') return [t('Discard {n} cards.', { n: mp.count }), t('A 7 was rolled and you hold more than 7 cards.'), t('Choose cards')];
    if (mp.type === 'threat') return [mp.optional ? t('Hunting: move a threat.') : t('Move a threat.'), t('The Neanderthal stands in Europe or Asia, the Saber-toothed tiger in America or Australia. You take a card from a player next to it.'), t('Choose')];
    if (mp.type === 'erode') return [t('Desertification: remove a number chip.'), t('Tap an African field of that landscape.'), t('Choose field')];
    return null;
  },
  pendingDialog(mp, A) {
    if (mp.type === 'threat') return threatDialog(A);
    if (mp.type === 'erode') {
      const L = A.view.legal || {};
      A.pick('hexes', L.erode, t('Tap an African {l} field to remove its number chip.', { l: term(mp.terrain) }), h => A.send({ type: 'erode', h }), { key: 'erode' });
    }
    return undefined;
  },

  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me();
    const moves = Object.keys(L.moves || {}).length;
    return [
      { key: 'explorer', label: t('Explorer'), icon: 'explorer', cost: COSTS.explorer, enabled: !!(actor && L.explorerSpots && L.explorerSpots.length), left: m.pieces.explorers },
      { key: 'move', label: t('Walk'), icon: 'campfire', plain: true, sub: t('1 fur or 1 meat'), phone: `<span class="cd">${costDots({ fur: 1 })}<span class="ctext">${tx('or')}</span>${costDots({ meat: 1 })}</span>`, enabled: !!(actor && moves) },
      { key: 'camp', label: t('Camp'), icon: 'tent', cost: COSTS.camp, enabled: !!(actor && L.camps && L.camps.length), left: m.pieces.camps },
      { key: 'progress', label: t('Progress'), icon: 'food', plain: true, sub: t('Clothing, Construction, Food, Hunting'), phone: '', enabled: !!(actor && L.advance && Object.values(L.advance).some(a => a && A.has(a.cost))) },
    ];
  },
  doAction(what, A) {
    switch (what) {
      case 'explorer': return placeFlow(A);
      case 'move': return moveFlow(A);
      case 'camp': return campFlow(A);
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
  setupText(v) {
    return v.setup.need === 'explorer'
      ? { msg: t('Place your explorer.'), sub: t('Tap a crossing next to one of your camps.') }
      : { msg: t('Place a camp on a starting place in Africa.'), sub: t('Tap one of the glowing hands. You place 3 camps, then 1 explorer.') };
  },
  costsHtml() {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:112px">${esc(name)}</b><span class="cd">${costDots(cost)}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    const steps = STEP_COST.map((c, i) => `<div class="row" style="padding:4px 0"><b style="min-width:112px">${tx('Level {n}', { n: i + 1 })}</b><span class="cd">${costDots(c)}</span></div>`).join('');
    return `${row(t('Place an explorer'), COSTS.explorer, t('next to one of your camps'))}
      <div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:112px">${tx('Move an explorer')}</b><span class="cd">${costDots({ fur: 1 })}<span class="ctext">${tx('or')}</span>${costDots({ meat: 1 })}</span><span class="muted spacer" style="font-size:13px;text-align:right">${tx('3 crossings + Food')}</span></div>
      ${row(t('Explorer into camp'), COSTS.camp, t('on a camp site tile: +1 point'))}
      <div style="padding:7px 0;border-top:1px solid var(--line)"><b>${tx('Progress (per level, every track)')}</b>${steps}</div>
      <p class="muted" style="font-size:13px;margin:8px 0 4px">${tx('Only camps harvest, never explorers. Discovery fields need the shown levels of Clothing and Construction; the first explorer to pass one takes its tile: Hunting luck (+1 point), Desertification or a Threat. Camps on the board are worth nothing: points come from tiles and markers. A 7 gives nothing: players with more than 7 cards discard half, then the roller moves a threat and steals a card. Trade 3 equal cards for 1 card of your choice. 10 points win.')}</p>`;
  },

  afterState(view, prev, A) {
    const G = A.G;
    const finds = view.humankind.finds || [];
    const top = finds.reduce((a, d) => Math.max(a, d.seq), 0);
    if (G.hkSeen == null) G.hkSeen = prev ? 0 : top;
    const news = finds.filter(d => d.seq > G.hkSeen);
    G.hkSeen = Math.max(G.hkSeen, top);
    if (news.length && prev) findScene(view, news);
    // the threats make a sound when they move
    if (prev && prev.humankind && ['neanderthal', 'tiger'].some(k => prev.humankind.threats[k] !== view.humankind.threats[k])) sfx.place();
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    if (b.sites) out.push(chip(`<svg viewBox="-14 -14 28 28" width="20" height="20">${art.siteTile('europe', 1)}</svg>`, b.sites, `${b.sites} × ${t('Camp site tiles')}`));
    if (b.jagd.length) out.push(chip(ico('hunt', 16, '#F59B1B'), b.jagd.length, t('Hunting markers')));
    if (b.progress.length) out.push(chip(ico('campfire', 16, '#F59B1B'), b.progress.length, t('Progress markers')));
    if (b.hunter) out.push(chip(ico('hunt', 16, '#F6CF57'), 1, t('Most Successful Hunter')));
    if (b.fastest) out.push(chip(ico('site', 16, '#9BE08A'), 2, t('Fastest Collector')));
    else if (b.collector) out.push(chip(ico('site', 16, '#9BE08A'), 1, t('Collector')));
    return out;
  },
});

export default plugin;
