// New Energies (Energiewende): the plugin for the standalone game. Board art for power plants and hazards, the
// environment panel (footprint, event bag, last events), the hand's actions and the event scene.
import { register } from './registry.js';
import { extendCore, glyph, t, esc, PCOLOR, PCOLOR_DARK, CARD_COLOR, resName, term, houseIcon, GLYPH } from '../core.js';
import { enqueue, layer, hold, sfx } from '../fx.js';

const tx = (k, p) => esc(t(k, p));
const S = 56;

// ------------------------------------------------------------ the new cards, terms and icons
extendCore({
  names: { science: 'Science', energy: 'Energy' },
  colors: { science: '#4F6FD8', energy: '#E8B418' },
  terms: {
    smog: 'Smog', blackout: 'Blackout', drought: 'Drought', fossilBoom: 'Cheap coal', heatwave: 'Heat wave', energyCrisis: 'Energy crisis',
    sun: 'Sunny day', cleanAir: 'Fresh wind', subsidy: 'Green subsidy', research: 'Research grant', bonus: 'Clean bonus',
    fossil: 'Fossil plant', renewable: 'Renewable plant',
  },
  glyphs: {
    energy: '<path d="M13.5 2 5 13.5h6L10 22l9-12h-6.2z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    fossil: '<path d="M3 21V12h6V8h5v4h7v9z M6 8V4 M11.5 6.5V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    renewable: '<path d="M12 12v9 M8.5 21h7 M12 12V3 M12 12l7.2 4 M12 12l-7.2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/>',
    hazard: '<path d="M12 3 2 20h20z M12 9.5v5 M12 17.2v.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    footprint: '<path d="M7 19a4 4 0 0 1-.7-7.9A5.6 5.6 0 0 1 17 9a4.2 4.2 0 0 1 .5 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    bag: '<path d="M9 3h6l-1.4 4c3.100 1.400 4.900 4.400 4.900 8a5.500 5.500 0 0 1-5.500 5.500h-3A5.500 5.500 0 0 1 5.500 15c0-3.600 1.800-6.600 4.900-8z M9.600 7h4.800" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    leaf: '<path d="M5 19C5 10 10.500 5 20 5c0 10-5.500 15-14 15 M5 19c3-5.500 6.500-8.500 11-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    flame: '<path d="M12 21a6 6 0 0 1-6-6c0-4 4-6 4.500-11 3 2 7.500 5 7.500 11a6 6 0 0 1-6 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  },
});

const COSTS = { road: { lumber: 1, brick: 1 }, settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 }, city: { grain: 2, ore: 3 } };
const LIMITED = ['lumber', 'brick', 'wool', 'grain', 'ore', 'science'];
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];

// what every event disc does (shown on the disc and in the rules)
const EVENTS = {
  smog: { icon: 'footprint', text: 'Smog covers a city of the player with the biggest footprint.' },
  blackout: { icon: 'hazard', text: 'A blackout shuts down a random fossil plant.' },
  drought: { icon: 'flame', text: 'A drought blocks one random town or city.' },
  fossilBoom: { icon: 'fossil', text: 'Cheap coal: the next fossil plant is free.' },
  heatwave: { icon: 'flame', text: 'Players with a footprint of 2 or more lose a card.' },
  energyCrisis: { icon: 'energy', text: 'Everybody pays 1 energy, or loses a resource card.' },
  sun: { icon: 'renewable', text: 'Every renewable plant makes 1 extra energy.' },
  cleanAir: { icon: 'leaf', text: 'The active player clears one of their hazards.' },
  subsidy: { icon: 'renewable', text: 'The next renewable plant costs 1 science less.' },
  research: { icon: 'science', text: 'The active player draws 2 science.' },
  bonus: { icon: 'leaf', text: 'Players with a footprint below zero get 2 energy.' },
};
const BROWN = ['smog', 'blackout', 'drought', 'fossilBoom', 'heatwave', 'energyCrisis'];

// ------------------------------------------------------------ board art
const plantKind = (kind, terrain) => (kind === 'fossil' ? (terrain === 'mountains' ? 'coal' : 'gas') : terrain === 'mountains' ? 'solar' : terrain === 'forest' ? 'bio' : 'wind');
const SHADOW = '<ellipse cy="1.5" rx="13" ry="3.4" fill="rgba(0,0,0,.28)"/>';
function plantArt(kind, terrain, color, id) {
  const c = PCOLOR[color], d = PCOLOR_DARK[color];
  const k = plantKind(kind, terrain);
  const delay = `animation-delay:-${((id * 0.83) % 3).toFixed(2)}s`;
  const puff = (x, y, r, n) => `<circle class="pl-puff" cx="${x}" cy="${y}" r="${r}" fill="rgba(104,104,112,.85)" style="animation-delay:-${((id * 0.83 + n * 0.9) % 3).toFixed(2)}s"/>`;
  switch (k) {
    case 'coal':
    case 'gas': {
      const heap = k === 'coal' ? '<path d="M4.500 -5.500 l3.600 -7 l3.600 7 z" fill="#2A2A2E" stroke="#111" stroke-width=".8" stroke-linejoin="round"/><circle cx="7.600" cy="-8" r=".8" fill="#6B6B72"/>' : '<ellipse cx="8.500" cy="-9" rx="3.400" ry="4.400" fill="#B9BCC4" stroke="#2B2B30" stroke-width="1"/><path d="M5.200 -9h6.600" stroke="#2B2B30" stroke-width=".8"/>';
      return `${SHADOW}<rect x="-12" y="-5.500" width="24" height="6.500" rx="1.400" fill="#5C5C64" stroke="#2B2B30" stroke-width="1.200"/>
        <rect x="-10.500" y="-15" width="14" height="9.800" rx="1.200" fill="#8D8D97" stroke="#2B2B30" stroke-width="1.200"/><rect x="-10.500" y="-10.500" width="14" height="2.800" fill="${c}" stroke="${d}" stroke-width=".6"/>
        <rect x="-8" y="-28" width="4.800" height="13" fill="#6A6A72" stroke="#2B2B30" stroke-width="1.100"/><rect x="-8" y="-28" width="4.800" height="2.600" fill="${c}"/>
        <rect x="-1" y="-23" width="4.800" height="8" fill="#6A6A72" stroke="#2B2B30" stroke-width="1.100"/><rect x="-1" y="-23" width="4.800" height="2.400" fill="${c}"/>
        <rect x="-8.500" y="-13" width="2.600" height="2" fill="#FFE59A"/><rect x="-4.500" y="-13" width="2.600" height="2" fill="#FFE59A"/>${heap}
        <g class="pl-smoke">${puff(-5.600, -30, 3.200, 0)}${puff(-5.600, -30, 3.200, 1)}${puff(-5.600, -30, 3.200, 2)}${puff(1.400, -25, 2.600, 0.5)}${puff(1.400, -25, 2.600, 1.500)}</g>`;
    }
    case 'solar':
      return `${SHADOW}<rect x="-12" y="-3.500" width="24" height="4.500" rx="1.200" fill="#5C5C64" stroke="#2B2B30" stroke-width="1.100"/><rect x="-12" y="-1.400" width="24" height="2.200" fill="${c}"/>
        ${[-9, -1, 7].map((x, i) => `<g><path d="M${x} -4 l7 0 l-1.600 -10 l-7 0 z" fill="#2F5FA8" stroke="#16346B" stroke-width="1" stroke-linejoin="round"/><path d="M${x + 1.800} -4 l-0.400 -10 M${x + 4.200} -4 l-0.400 -10 M${x - 0.200} -9 h6.800" stroke="rgba(190,215,255,.75)" stroke-width=".6" fill="none"/>
          <path class="pl-glint" d="M${x + 1} -13 l5 0 l-0.600 3 l-5 0 z" fill="rgba(255,255,255,.55)" style="animation-delay:-${((id * 0.83 + i * 0.6) % 3).toFixed(2)}s"/></g>`).join('')}`;
    case 'bio':
      return `${SHADOW}<path d="M-11 1 a11 11 0 0 1 22 0 z" fill="#4C9A4C" stroke="#1F4F2A" stroke-width="1.200" stroke-linejoin="round"/><path d="M-11 -1.500 h22" stroke="${c}" stroke-width="2.600"/>
        <rect x="3" y="-19" width="5.200" height="9" fill="#8D8D97" stroke="#2B2B30" stroke-width="1.100"/><rect x="3" y="-19" width="5.200" height="2.200" fill="${c}"/>
        <path d="M-5 -2 C-5 -9 0 -11 5 -11 C5 -5 1 -2 -5 -2z" fill="#9BE08A" stroke="#1F4F2A" stroke-width=".9" stroke-linejoin="round"/>
        <g class="pl-smoke">${[0, 1, 2].map(n => `<circle class="pl-puff green" cx="5.600" cy="-21" r="2.800" fill="rgba(210,245,200,.85)" style="animation-delay:-${((id * 0.83 + n * 0.9) % 3).toFixed(2)}s"/>`).join('')}</g>`;
    default: // wind
      return `${SHADOW}<rect x="-6.500" y="-3.200" width="13" height="4.200" rx="1.200" fill="#5C5C64" stroke="#2B2B30" stroke-width="1.100"/><rect x="-6.500" y="-1.400" width="13" height="1.800" fill="${c}"/>
        <path d="M-1.600 -3 L-.8 -24 L.8 -24 L1.600 -3z" fill="#F6F6F2" stroke="#8A8A90" stroke-width=".7" stroke-linejoin="round"/>
        <g transform="translate(0,-24)"><g class="pl-blades" style="${delay}">${[0, 120, 240].map(a => `<path d="M0 0 L-1.500 -12.500 L1.500 -12.500z" transform="rotate(${a})" fill="#FFFFFF" stroke="#8A8A90" stroke-width=".7" stroke-linejoin="round"/>`).join('')}</g><circle r="2.200" fill="${c}" stroke="${d}" stroke-width="1"/></g>`;
  }
}
const hazardArt = big => `<g class="hz" transform="scale(${big ? 1.1 : 0.9})"><g class="hz-bob">
  <path d="M-9 -3 a5.500 5.500 0 0 1 3 -9 a7 7 0 0 1 13 1 a4.800 4.800 0 0 1 -1 8z" fill="rgba(74,70,80,.9)" stroke="#2B2B30" stroke-width="1.200" stroke-linejoin="round"/>
  <path d="M0 -26 l6.200 10.800 h-12.400z" fill="#F2C230" stroke="#6B4A06" stroke-width="1.400" stroke-linejoin="round"/><path d="M0 -22.200 v4.200 M0 -15.600 v.1" stroke="#3A2606" stroke-width="1.600" stroke-linecap="round"/></g></g>`;

// where a plant stands: on its tile, toward the corner of the building it belongs to
function plantPos(board, plants, x) {
  const h = board.hexes[x.hex], v = board.vertices[x.v];
  const cx = h.x * S, cy = h.y * S + 4, vx = v.x * S, vy = v.y * S;
  const k = 0.55;
  const mates = plants.filter(y => y.hex === x.hex && y.v === x.v).sort((a, b) => a.id - b.id);
  const i = mates.indexOf(x);
  const dx = vx - cx, dy = vy - cy, l = Math.hypot(dx, dy) || 1;
  const off = (i - (mates.length - 1) / 2) * 15;
  return [cx + dx * k + (-dy / l) * off, cy + dy * k + (dx / l) * off];
}

function ext(view) {
  const plants = view.plants || [];
  return {
    tiles({ board, fr, life }) {
      const items = [...plants].sort((a, b) => plantPos(board, plants, a)[1] - plantPos(board, plants, b)[1]);
      return `<g class="plants">${items.map(x => {
        const [px, py] = plantPos(board, plants, x);
        const terrain = board.hexes[x.hex].terrain;
        const isNew = fr && fr.plants && fr.plants.has(x.id);
        return `<g transform="translate(${px.toFixed(1)},${(py + 6).toFixed(1)})" class="plant ${x.kind}" data-plant="${x.id}"><title>${esc(t(x.kind === 'fossil' ? 'Fossil plant' : 'Renewable plant'))}</title><g class="${isNew ? 'fx-drop' : ''}">${plantArt(x.kind, terrain, view.players[x.p].color, x.id)}</g></g>`;
      }).join('')}</g>`;
    },
    top({ board, pt }) {
      let out = '';
      for (const [vid, b] of Object.entries(view.buildings)) if (b.hazard) {
        const v = board.vertices[vid];
        out += `<g transform="translate(${(v.x * S).toFixed(1)},${(v.y * S - 8).toFixed(1)})" pointer-events="none">${hazardArt(true)}</g>`;
      }
      for (const x of plants) if (x.hazard) {
        const [px, py] = plantPos(board, plants, x);
        out += `<g transform="translate(${px.toFixed(1)},${(py - 10).toFixed(1)})" pointer-events="none">${hazardArt(false)}</g>`;
      }
      return out;
    },
  };
}

// ------------------------------------------------------------ panels
const disc = (kind, size = 38) => {
  const green = !BROWN.includes(kind);
  return `<span class="evdisc ${green ? 'green' : 'brown'}" style="width:${size}px;height:${size}px" title="${esc(term(kind))}">${glyph(EVENTS[kind].icon, size * 0.55)}</span>`;
};
function envPanel(v) {
  const e = v.energies;
  const cells = Array.from({ length: 12 }, (_, i) => `<i class="${i < e.gf ? 'on' : ''} ${i === 3 || i === 7 ? 'step' : ''}"></i>`).join('');
  const total = Math.max(1, e.brown + e.green);
  const last = e.last.length ? e.last.map(d => `<div class="evrow ${d.green ? 'green' : 'brown'}">${disc(d.kind, 26)}<span><b>${esc(term(d.kind))}</b><small>${esc(t(EVENTS[d.kind].text))}</small></span></div>`).join('') : `<div class="muted" style="font-size:13px">${tx('No discs drawn yet.')}</div>`;
  const holder = e.cleanest != null ? `<div class="evclean">${glyph('leaf', 14)} ${tx('Cleanest environment: {name} (+2)', { name: esc(v.players[e.cleanest].name) })}</div>` : '';
  return `<div class="panel env"><div class="panel-h">${tx('Environment')}<span class="spacer"></span><span style="font-weight:500">${tx('{n} discs per turn', { n: e.discs })}</span></div>
    <div class="env-row"><span class="env-lbl" title="${tx('Fossil plants minus renewable plants on the whole board')}">${glyph('footprint', 15)} ${tx('Global footprint')}</span><div class="gfbar">${cells}</div><b class="gfn">${e.gf}</b></div>
    <div class="env-row"><span class="env-lbl" title="${tx('Discs left in the event bag')}">${glyph('bag', 15)} ${tx('Event bag')}</span><div class="bagbar"><i class="brown" style="width:${(e.brown / total * 100).toFixed(1)}%"></i><i class="green" style="width:${(e.green / total * 100).toFixed(1)}%"></i></div><b class="gfn">${e.bag}</b></div>
    <div class="env-row small"><span class="env-lbl">${glyph('hazard', 14)} ${tx('Hazards')}</span><b>${e.hazards}/${e.hazardMax}</b>${v.cheap.fossil ? `<span class="cheap" title="${tx('Cheap coal: the next fossil plant is free.')}">${glyph('fossil', 13)} ${tx('free')}</span>` : ''}${v.cheap.renewable ? `<span class="cheap g" title="${tx('Green subsidy: the next renewable plant costs 1 science less.')}">${glyph('renewable', 13)} −1</span>` : ''}</div>
    <div class="evlast"><div class="env-sub">${tx('This turn')}</div>${last}</div>${holder}</div>`;
}

// ------------------------------------------------------------ the event scene
function eventScene(view, discs, nameHtml) {
  enqueue(async () => {
    sfx.horn?.();
    const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${tx('{name} draws', { name: esc(view.players[view.current].name) })}</div>
      <div class="ev-discs">${discs.map((d, i) => `<div class="ev-disc ${d.green ? 'green' : 'brown'}" style="animation-delay:${i * 0.5}s"><div class="ev-face">${glyph(EVENTS[d.kind].icon, 40)}</div><b>${esc(term(d.kind))}</b><small>${esc(t(EVENTS[d.kind].text))}</small></div>`).join('')}</div></div>`);
    setTimeout(() => (discs.some(d => !d.green) ? sfx.smog?.() : sfx.leaf?.()), 450);
    await hold(sc, 1900 + discs.length * 500);
  });
}

// ------------------------------------------------------------ the plugin
const plugin = register({
  id: 'energies', name: 'New Energies', vp: 10, maxPlayers: 4, tutorial: 'energies', lifeIcon: 'energy',
  tagline: 'Power plants, energy and a bag of events.',
  blurb: 'Cities make science, science builds power plants. Fossil plants are cheap and dirty, renewable plants clean the air. Events come first every turn. First to 10 points wins, or the greenest builder when the event bag runs dry.',
  lostText: 'The world lost.',
  tokenKeys: ['science', 'energy'], limited: LIMITED, bankBuys: RES, tradeKeys: ['lumber', 'brick', 'wool', 'grain', 'ore', 'science', 'energy'],
  bankText: 'Resources use your harbors. Science trades 3:1, energy 2:1.',
  fresh(view, prev) {
    const plants = new Set(view.plants.filter(x => !(prev.plants || []).some(y => y.id === x.id)).map(x => x.id));
    return { plants, any: plants.size > 0 };
  },
  ext, boardKey: v => JSON.stringify([v.plants, Object.entries(v.buildings).filter(([, b]) => b.hazard).map(([k]) => k)]),

  hud(v) {
    const e = v.energies;
    return `<span class="hud-pill" title="${tx('Discs left in the event bag')}">${glyph('bag', 15)} ${e.bag} <small class="hud-split"><i class="brown">${e.brown}</i><i class="green">${e.green}</i></small></span>
      <span class="hud-pill gf l${e.gf >= 8 ? 3 : e.gf >= 4 ? 2 : 1}" title="${tx('Global footprint')}">${glyph('footprint', 15)} ${e.gf}</span>
      <span class="hud-pill" title="${tx('Hazards on the board')}">${glyph('hazard', 15)} ${e.hazards}/${e.hazardMax}</span>`;
  },
  side: envPanel,
  playerMeta(v, p) {
    const lf = p.lf;
    return `<span class="mp" title="${tx('Energy')}">${glyph('energy', 12)}${p.energy}</span>
      <span class="mp lf ${lf > 0 ? 'dirty' : lf < 0 ? 'clean' : ''}" title="${tx('Local footprint: fossil minus renewable plants')}">${glyph('footprint', 12)}${lf > 0 ? '+' : ''}${lf}</span>
      <span class="mp" title="${tx('Fossil plants')}">${glyph('fossil', 12)}${p.fossil}</span><span class="mp" title="${tx('Renewable plants')}">${glyph('renewable', 12)}${p.renewable}</span>`;
  },
  awards(v, i) {
    let out = '';
    if (v.longestRoad.p === i) out += `<span class="award" title="${tx('Longest Trade Route')} (+2)">${glyph('road', 11)}${v.longestRoad.len}</span>`;
    if (v.energies.cleanest === i) out += `<span class="award green" title="${tx('Cleanest environment')} (+2)">${glyph('leaf', 11)}</span>`;
    return out;
  },
  rollStatus(v) { return { sub: t('First the events: {n} discs from the bag.', { n: v.energies.discs }) }; },
  pendingText(mp) { return mp.type === 'discard' ? [t('Discard {n} cards.', { n: mp.count }), t('The grid is overloaded: you hold more than your hand limit.'), t('Choose cards')] : null; },

  actions(v, A, actor) {
    const L = v.legal || {}, m = A.me(), pc = L.plantCost || { fossil: 1, renewable: 3 };
    const can = (cost, n) => actor && A.has(cost) && n;
    const plantOn = actor && Object.keys(L.plantSpots || {}).length > 0;
    return [
      { key: 'road', label: t('Road'), icon: 'road', cost: COSTS.road, enabled: !!(actor && L.roads && L.roads.length), left: m.pieces.roads },
      { key: 'settlement', label: t('Town'), icon: 'settlement', cost: COSTS.settlement, enabled: !!(actor && L.settlements && L.settlements.length), left: m.pieces.settlements },
      { key: 'city', label: t('City'), icon: 'city', cost: COSTS.city, enabled: !!(actor && L.cities && L.cities.length && A.has(COSTS.city)), left: m.pieces.cities },
      { key: 'fossil', label: t('Fossil plant'), icon: 'fossil', cost: { science: pc.fossil }, costText: pc.fossil ? '' : t('free'), enabled: !!(plantOn && m.res.science >= pc.fossil && m.pieces.fossil > 0), left: m.pieces.fossil },
      { key: 'renewable', label: t('Renewable plant'), icon: 'renewable', cost: { science: pc.renewable }, enabled: !!(plantOn && m.res.science >= pc.renewable && m.pieces.renewable > 0), left: m.pieces.renewable },
      { key: 'energy', label: t('Energy'), icon: 'energy', plain: true, sub: t('Swap, clear, demolish'), enabled: !!(actor && m.res.energy > 0) },
    ].map(a => ({ ...a, enabled: !!a.enabled }));
  },
  doAction(what, A) {
    const v = A.view, L = v.legal || {};
    switch (what) {
      case 'road': return A.pick('edges', L.roads, t('Tap where to build your road.'), e => A.send({ type: 'buildRoad', e }), { key: 'road' });
      case 'settlement': return A.pick('vertices', L.settlements, t('Tap where to build your town.'), x => A.send({ type: 'buildSettlement', v: x }), { key: 'settlement' });
      case 'city': return A.pick('vertices', L.cities, t('Tap the town to upgrade.'), x => A.send({ type: 'buildCity', v: x }), { key: 'city' });
      case 'fossil':
      case 'renewable': return plantFlow(what, A);
      case 'energy': return energyDialog(A);
      default: return undefined;
    }
  },
  costsHtml(v) {
    const row = (name, cost, note) => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><b style="min-width:92px">${esc(name)}</b><span class="cd">${Object.entries(cost).map(([k, n]) => Array.from({ length: n }, () => `<i class="cost-dot" style="background:${CARD_COLOR[k]}" title="${esc(resName(k))}"></i>`).join('')).join('')}</span><span class="muted spacer" style="font-size:13px;text-align:right">${esc(note || '')}</span></div>`;
    return `${row(t('Road'), COSTS.road, '')}${row(t('Town'), COSTS.settlement, t('1 point, 1 slot'))}${row(t('City'), COSTS.city, t('2 points, 3 slots, makes science'))}
      ${row(t('Fossil plant'), { science: 1 }, t('2 energy, +1 footprint'))}${row(t('Renewable plant'), { science: 3 }, t('1 energy, −1 footprint, adds a green disc'))}
      <p class="muted" style="font-size:13px;margin:10px 0 0">${tx('One plant per turn, on a numbered tile next to one of your towns or cities. Energy: swap 2 for a resource, clear a hazard for 2, demolish a fossil plant for 3.')}</p>`;
  },

  afterState(view, prev, A) {
    const G = A.G;
    const last = view.energies.last || [];
    const top = last.reduce((a, d) => Math.max(a, d.seq), 0);
    if (G.evSeen == null) G.evSeen = prev ? 0 : top;
    const fresh = last.filter(d => d.seq > G.evSeen);
    G.evSeen = Math.max(G.evSeen, top);
    if (fresh.length && prev) eventScene(view, fresh);
  },
  lostScene(v, A) {
    A.choiceDialog(tx('The world lost.'), tx('The event bag is empty and nobody built more renewable than fossil plants. Everybody loses.'), [{ value: 1, html: tx('Back to lobby') }], () => { location.hash = '#/'; return true; }, true);
  },
  victoryChips(view, w, chip, ico) {
    const b = w.breakdown, out = [];
    if (b.settlements) out.push(chip(houseIcon(w.color, 16), b.settlements, `${b.settlements} × ${t('Towns')}`));
    if (b.cities) out.push(chip(glyph('city', 16), b.cities * 2, `${b.cities} × ${t('Cities')}`));
    if (b.longestRoad) out.push(chip(ico('road', 16, '#F6CF57'), 2, t('Longest Trade Route')));
    if (b.cleanest) out.push(chip(ico('leaf', 16, '#9BE08A'), 2, t('Cleanest environment')));
    return out;
  },
});

// ------------------------------------------------------------ plant building and energy use
function plantFlow(kind, A) {
  const L = A.view.legal;
  const spots = L.plantSpots || {};
  const verts = Object.keys(spots).map(Number);
  if (!verts.length) { A.toast(t('There is nowhere to do that right now.'), 'warn'); return; }
  const label = kind === 'fossil' ? t('Fossil plant: tap the town or city it belongs to.') : t('Renewable plant: tap the town or city it belongs to.');
  A.pick('vertices', verts, label, v => {
    const hexes = spots[v];
    if (hexes.length === 1) return A.send({ type: 'buildPlant', kind, v, h: hexes[0] });
    A.pick('hexes', hexes, t('Now tap the tile for the plant.'), h => A.send({ type: 'buildPlant', kind, v, h }), { key: kind });
    return true;
  }, { key: kind });
}
function energyDialog(A) {
  const v = A.view, L = v.legal || {}, m = A.me();
  const opts = [
    { value: 'bank', html: `${glyph('energy', 18)} ${tx('Swap 2 energy for a resource')}`, disabled: m.res.energy < 2, style: 'justify-content:flex-start' },
    { value: 'hazard', html: `${glyph('hazard', 18)} ${tx('Clear a hazard (2 energy)')}`, disabled: m.res.energy < 2 || !(L.hazards && L.hazards.length), style: 'justify-content:flex-start' },
    { value: 'demolish', html: `${glyph('fossil', 18)} ${tx('Demolish a fossil plant (3 energy)')}`, disabled: m.res.energy < 3 || !(L.demolish && L.demolish.length), style: 'justify-content:flex-start' },
  ];
  A.choiceDialog(tx('Energy'), tx('You have {n} energy.', { n: m.res.energy }), opts, async what => {
    if (what === 'bank') { setTimeout(() => A.bank(), 30); return true; }
    if (what === 'hazard') { setTimeout(() => hazardDialog(A), 30); return true; }
    if (what === 'demolish') { setTimeout(() => demolishDialog(A), 30); return true; }
    return true;
  });
}
const where = (v, x) => {
  const hexes = x.v != null ? v.board.hexes.filter(h => h.verts.includes(x.v)) : [v.board.hexes[x.hex]];
  return hexes.filter(h => h.terrain !== 'sea').map(h => `${term(h.terrain)}${h.number ? ' ' + h.number : ''}`).join(' · ');
};
function hazardDialog(A) {
  const v = A.view, L = v.legal;
  const opts = L.hazards.map(h => {
    if (h.plant != null) { const x = v.plants.find(y => y.id === h.plant); return { value: h, html: `${glyph(x.kind, 18)} ${esc(t(x.kind === 'fossil' ? 'Fossil plant' : 'Renewable plant'))} · ${esc(where(v, x))}` }; }
    const b = v.buildings[h.v];
    return { value: h, html: `${glyph(b.type === 'city' ? 'city' : 'settlement', 18)} ${esc(t(b.type === 'city' ? 'City' : 'Town'))} · ${esc(where(v, { v: h.v }))}` };
  });
  A.choiceDialog(tx('Clear a hazard (2 energy)'), tx('Which hazard should go?'), opts, h => A.send({ type: 'removeHazard', ...(h.plant != null ? { plant: h.plant } : { v: h.v }) }));
}
function demolishDialog(A) {
  const v = A.view, L = v.legal;
  const opts = L.demolish.map(id => { const x = v.plants.find(y => y.id === id); return { value: id, html: `${glyph('fossil', 18)} ${esc(t('Fossil plant'))} · ${esc(where(v, x))}` }; });
  A.choiceDialog(tx('Demolish a fossil plant (3 energy)'), tx('Which plant should go?'), opts, plant => A.send({ type: 'demolishPlant', plant }));
}

export default plugin;
