// Traders & Barbarians in the game screen: the questions the engine asks (earthquake, wagons, knights ...), the fish and gold
// dialogs, chips and pills. game.js builds the helper bundle `c` once and calls these hooks; everything else lives here.
import { esc, glyph, GLYPH, PCOLOR, RES, CARD_COLOR, resName, cardName, term, t, extendCore, houseIcon, modal } from './core.js';
import { layer, hold, sfx } from './fx.js';

const FISH_COST = { robber: 2, steal: 3, take: 4, road: 5, dev: 7 };
const WARE_COLOR = { glass: '#4FA3D9', tools: '#8C8C94', sand: '#D9B25C', marble: '#E8E4DA' };

extendCore({
  names: { gold: 'Gold' },
  colors: { gold: '#C58E12' },
  terms: {
    raid: 'Robber Attacks', plague: 'Epidemic', quake: 'Earthquake', neighbors: 'Good Neighbors', tournament: 'Tournament', advantage: 'Trade Advantage',
    calm: 'Calm Seas', help: 'Helpful Neighbor', conflict: 'Conflict', bounty: 'Plentiful Year', retreat: 'Robber Flees', fine: 'A Beautiful Day', newyear: 'New Year',
    brown: 'brown', green: 'green', purple: 'purple',
    glass: 'glass', tools: 'tools', sand: 'sand', marble: 'marble', castle: 'castle', quarry: 'quarry', glassworks: 'glassworks',
    swamp: 'Swamp', lake: 'Lake', waterhole: 'Watering hole', river: 'River',
  },
  cards: { consecration: 'Knight Consecration', strong: 'Strong Knight', treason: 'Treason', captive: 'Captive', goodTrip: 'Swift Journey' },
  glyphs: {
    wagon: '<path d="M3 8h14v8H3z M17 11h3l1 3v2h-4 M7 19a2 2 0 1 0 .01 0 M15 19a2 2 0 1 0 .01 0 M3 8c0-3 14-3 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    barbarian: '<path d="M6 21l1-8h10l1 8z M8 13a4 4 0 1 1 8 0 M4 6l3 3 M20 6l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    goodTrip: '<path d="M3 8h14v8H3z M17 11h3l1 3v2h-4 M7 19a2 2 0 1 0 .01 0 M15 19a2 2 0 1 0 .01 0 M3 8c0-3 14-3 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    harbor: '<path d="M12 3v14 M8 8h8 M5 14a7 7 0 0 0 14 0 M3 14h4 M17 14h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
});

const WARE_ICON = { glass: '◩', tools: '⚒', sand: '⛰', marble: '▣' };

export const EVENT_TEXT = {
  raid: 'Players with more than 7 cards give up half. Move the robber and steal a card.',
  plague: 'Cities yield only 1 resource this roll.',
  quake: 'Everybody turns one of their roads sideways. Until it is repaired (1 lumber, 1 brick) you build no roads and no settlements next to it.',
  neighbors: 'Everybody gives the player on their left 1 card of their choice.',
  tournament: 'Whoever played the most knights takes a resource of their choice.',
  advantage: 'The holder of the Longest Road draws a card from a player of their choice.',
  calm: 'Whoever has the most settlements and cities at harbors takes a resource of their choice.',
  help: 'The leaders give 1 card to a player with fewer points.',
  conflict: 'Whoever is alone ahead in knights draws a card from a player of their choice.',
  bounty: 'Everybody takes a resource of their choice.',
  retreat: 'The robber flees to a desert, or off the board when there is none. Nobody is robbed.',
  fine: 'Nothing happens. The resources are paid out.',
};

export function createHub(c) {
  const G = () => c.G;
  const V = () => c.G.view;
  const tx = (k, p) => esc(t(k, p));
  const L = () => V().legal || {};
  const mine = (type) => V().pending.find(p => p.group === V().activeGroup && p.player === V().me && p.type === type);
  const pn = i => c.pname(i);
  const wareName = w => t(w);
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------- the questions
  const TEXT = {
    quake: () => [t('Earthquake! Pick one of your roads.'), t('Tap a road to turn it sideways. Repair it with 1 lumber and 1 brick before you build new roads.')],
    bankPick: mp => [t('Take {n} from the bank.', { n: mp.count }), t('Choose any resource the bank has.'), t('Choose cards')],
    helpGive: () => [t('Helpful Neighbor: give a card.'), t('You lead: give 1 card to a player with fewer points.'), t('Choose')],
    fishSwap: () => [t('Your hand of fish tokens is full.'), t('Swap one of your tokens for a new one from the stock, or keep them all.'), t('Choose')],
    wagonCards: () => [t('Voting round: where does the trade wagon go?'), t('Bid wool and/or grain: every card is 1 vote, and all your votes go to one place. The cards go back to the bank.'), t('Vote')],
    wagonVote: mp => [t('Vote: where does the wagon go? You have {n} votes.', { n: mp.votes }), t('Tap a glowing path. All your votes go to one place.')],
    wagonPlace: () => [t('You decide where the wagon goes.'), t('Tap a glowing path.')],
    placeKnight: () => [t('Set your knight on a free path.'), t('Tap a glowing path.')],
    treason: () => [t('Treason! Move two barbarians.'), t('Tap two tiles with barbarians, then two other tiles to send them to.')],
    captive: () => [t('Take a prisoner.'), t('Tap a tile with a barbarian.')],
    moveKnights: () => [t('Move your knights.'), t('Tap a knight, then its new path: up to 3 paths, or 5 for 1 grain. Knights must leave the castle.')],
    moveBarb: () => [t('Move a barbarian.'), t('Tap a barbarian, then a path or road. On a road you draw a card from its owner.')],
  };
  const WAIT = {
    quake: 'Waiting for {names} to pick a road…', bankPick: 'Waiting for {names} to take a resource…', helpGive: 'Waiting for {names} to give a card…',
    fishSwap: 'Waiting for {names} to decide…', wagonCards: 'Waiting for {names} to vote…', wagonVote: 'Waiting for {names} to vote…', wagonPlace: 'Waiting for {names} to place the wagon…',
    placeKnight: 'Waiting for {names} to set a knight…', treason: 'Waiting for {names} to move barbarians…', captive: 'Waiting for {names} to take a prisoner…',
    moveKnights: 'Waiting for {names} to move their knights…', moveBarb: 'Waiting for {names} to move a barbarian…', moveWagon: 'Waiting for {names} to move their wagon…',
  };
  const BTN_TYPES = ['bankPick', 'helpGive', 'fishSwap', 'wagonCards'];

  function status(mp) {
    const v = V();
    if (mp.type === 'moveWagon') {
      const W = L().wagon;
      if (!W) return null;
      const btns = [];
      if (W.placing) return { msg: esc(t('The barbarian is driven away. Place him somewhere else.')), sub: tx('Tap a glowing path or road.'), mine: true, btns: '' };
      if (W.expel?.length) btns.push(`<button class="btn" data-do="wagonExpel">${tx('Drive the barbarian away')}</button>`);
      if (W.grain) btns.push(`<button class="btn" data-do="wagonGrain">${tx('Spend 1 grain: +2 movement points')}</button>`);
      if (W.trip) btns.push(`<button class="btn" data-do="wagonTrip">${tx('Swift Journey')}</button>`);
      btns.push(`<button class="btn primary" data-do="wagonDone">${tx('Done')}</button>`);
      return { msg: esc(t('Move your wagon: {n} movement points left.', { n: W.mp })), sub: tx('Path 2 points, your road 1, another road 1 and 1 gold to its owner, a barbarian 2 more. Tap a glowing corner.'), mine: true, btns: btns.join('') };
    }
    const T = TEXT[mp.type];
    if (!T) return null;
    const r = T(mp);
    let btns = '';
    if (BTN_TYPES.includes(mp.type) && r[2]) btns = `<button class="btn primary" data-do="pendingDialog">${esc(r[2])}</button>`;
    if (['captive', 'treason', 'moveBarb'].includes(mp.type)) btns = `<button class="btn primary" data-do="pendingDialog">${tx('Choose')}</button>`;
    if (mp.type === 'moveKnights') btns = `<button class="btn primary" data-do="knightsDone">${tx('Done')}</button>`;
    return { msg: esc(r[0]), sub: esc(r[1] || ''), mine: true, btns };
  }
  const waiting = type => WAIT[type] || null;

  // ---------------------------------------------------------------- board
  function targets() {
    const v = V(), l = L();
    if (l.quakeRoads) return { edges: l.quakeRoads };
    if (l.knightPlace) return { edges: l.knightPlace };
    if (l.wagonPositions) return { edges: l.wagonPositions };
    if (l.knightMoves) return { ownKnightEdges: Object.keys(l.knightMoves).map(Number) };
    if (l.wagon) {
      const W = l.wagon;
      if (W.placing) return { edges: W.barbTargets };
      return { vertices: W.steps.map(s => s.to), wagonSteps: W.steps, ownWagon: v.me };
    }
    return null;
  }
  function boardClick(el, id) {
    const v = V(), l = L();
    if (el.dataset.hub) {
      const [kind, e] = el.dataset.hub.split(':');
      if (kind === 'knight' && l.knightMoves && l.knightMoves[e]) {
        const o = l.knightMoves[e];
        c.startPick('edges', [...o.near, ...o.far], t('Tap where the knight should go.'), to => c.send({ type: 'moveKnight', from: +e, to }));
        G().pick.pickedKnight = +e;
        c.render();
        return true;
      }
      return false;
    }
    if (l.quakeRoads && el.dataset.e != null) { c.send({ type: 'quake', e: id }); return true; }
    if (l.knightPlace && el.dataset.e != null) { c.send({ type: 'placeKnight', e: id }); return true; }
    if (l.wagonPositions && el.dataset.e != null) { c.send({ type: mine('wagonVote') ? 'wagonVote' : 'wagonPlace', pos: id }); return true; }
    if (l.wagon) {
      if (l.wagon.placing && el.dataset.e != null) { c.send({ type: 'wagonBarbTo', to: id }); return true; }
      if (el.dataset.v != null) { c.send({ type: 'wagonStep', to: id }); return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- dialogs for pending questions
  function dialog(mp) {
    const v = V(), l = L();
    switch (mp.type) {
      case 'bankPick': {
        const pool = Object.fromEntries(RES.filter(r => v.bank[r] > 0).map(r => [r, v.bank[r]]));
        c.cardPicker({ heading: tx('Take from the bank'), text: tx('Choose {n} resources from the bank.', { n: mp.count }), pool, count: mp.count, haveText: 'bank {n}', confirm: cards => c.send({ type: 'bankPick', cards }) });
        return true;
      }
      case 'helpGive': {
        const cnt = r => (RES.includes(r) ? c.me().res[r] : c.me().comm[r]) || 0;
        const have = [...RES, ...(v.mode === 'knights' ? ['paper', 'cloth', 'coin'] : [])].filter(r => cnt(r) > 0); // Cities & Knights: resource or commodity
        c.choiceDialog(tx('Helpful Neighbor'), tx('Who gets your card?'), mp.options.map(p => ({ value: p, html: `${houseIcon(v.players[p].color)} ${esc(v.players[p].name)} · ${tx('Points: {n}', { n: v.players[p].vp })}` })), to => {
          setTimeout(() => c.choiceDialog(tx('Which card?'), '', have.map(r => ({ value: r, html: `${glyph(r, 18)} ${esc(resName(r))} (${cnt(r)})`, style: `background:${CARD_COLOR[r]};color:#fff;border-color:transparent` })), card => c.send({ type: 'helpGive', to, card }), false), 30);
          return true;
        }, false);
        return true;
      }
      case 'fishSwap': {
        const toks = c.me().fishTok || [];
        c.choiceDialog(tx('Swap a fish token'), tx('You hold 7 tokens. Give one back and draw a new one, or keep them.'), [...toks.map((n, i) => ({ value: i, html: `${'🐟'.repeat(n)} ${tx('Return this token')}` })), { value: null, html: tx('Keep my tokens') }], idx => c.send({ type: 'fishSwap', idx }), false);
        return true;
      }
      case 'wagonCards': return wagonCardsDialog();
      case 'captive': startCaptive(); return true;
      case 'treason': startTreason(); return true;
      case 'moveBarb': startMoveBarb(); return true;
      default: return false;
    }
  }

  function wagonCardsDialog() {
    const m = c.me();
    const sel = { wool: 0, grain: 0 };
    const bids = V().hub.cv.vote ? Object.entries(V().hub.cv.vote.votes).filter(([, n]) => n > 0).map(([q, n]) => `${pn(+q)} ${n}`).join(', ') : '';
    modal(`<h2>${tx('Vote for the new wagon')}</h2><p class="muted" style="margin:0">${tx('Every card you lay out is 1 vote. The cards go back to the bank. You may lay out none.')}</p>${bids ? `<p class="muted" style="margin:4px 0 0">${tx('Bids so far: {list}', { list: bids })}</p>` : ''}<div class="picker" id="wc"></div>
      <div class="foot"><button class="btn" id="wcnone">${tx('No votes')}</button><button class="btn primary" id="wcok">${tx('Vote')}</button></div>`, {
      dismissable: false,
      onMount(el, close) {
        const draw = () => {
          el.querySelector('#wc').innerHTML = ['wool', 'grain'].map(k => `<div class="pick ${sel[k] ? 'on' : ''}"><div class="rcard" style="background:${CARD_COLOR[k]};width:44px;height:58px">${glyph(k, 22)}</div><div style="font-size:12px;font-weight:600">${esc(resName(k))}</div><div class="have">${tx('have {n}', { n: m.res[k] })}</div>
            <div class="ctr"><button data-k="${k}" data-d="-1">−</button><b>${sel[k]}</b><button data-k="${k}" data-d="1">+</button></div></div>`).join('');
          el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; sel[k] = Math.max(0, Math.min(m.res[k], sel[k] + +b.dataset.d)); draw(); });
          el.querySelector('#wcok').textContent = `${t('Vote')} (${sel.wool + sel.grain})`;
        };
        draw();
        el.querySelector('#wcnone').onclick = async () => { if (await c.send({ type: 'wagonCards', wool: 0, grain: 0 })) close(); };
        el.querySelector('#wcok').onclick = async () => { if (await c.send({ type: 'wagonCards', wool: sel.wool, grain: sel.grain })) close(); };
      },
    });
  }

  function startCaptive() {
    c.startPick('hexes', L().barbHexes, t('Tap a tile with a barbarian to take him prisoner.'), hex => c.send({ type: 'captive', hex }));
  }
  function startTreason() {
    const l = L(), from = [], to = [];
    const need = Math.min(2, l.barbHexes.length);
    const step = () => {
      const picking = from.length < need ? 'from' : 'to';
      const opts = picking === 'from' ? l.barbHexes.filter(h => !from.includes(h)) : l.treasonTargets.filter(h => !from.includes(h) && !to.includes(h));
      c.startPick('hexes', opts, picking === 'from' ? t('Treason: tap a tile to take a barbarian from ({n}/{m}).', { n: from.length + 1, m: need }) : t('Treason: tap a tile to send a barbarian to ({n}/2).', { n: to.length + 1 }), async h => {
        (picking === 'from' ? from : to).push(h);
        if (from.length === need && to.length === 2) { await c.send({ type: 'treason', from, to }); return false; }
        G().pick = null; step(); return true;
      }, { picked: [...from, ...to] });
    };
    step();
  }
  function startMoveBarb() {
    const l = L().barbMoves;
    c.startPick('edges', l.from, t('Tap the barbarian you want to move.'), from => {
      c.startPick('edges', l.to, t('Tap the path or road he goes to.'), to => c.send({ type: 'moveBarb', from, to }));
      return true;
    });
  }

  // ---------------------------------------------------------------- hand
  function tokenList(v, m, mainTurn, l) {
    const out = [];
    if (v.fishing) out.push({ key: 'fish', n: m.fish ?? 0, label: t('Fish'), color: '#1F7A99', action: 'fish', live: mainTurn && (m.fish ?? 0) >= 2 });
    if (v.gold) out.push({ key: 'gold', n: m.gold, label: t('Gold'), color: '#C58E12', action: 'goldTrade', live: mainTurn && !!l.goldTrade });
    return out;
  }
  function actions(v, m, l, { free, mainTurn, plain }) {
    let h = '';
    const hub = v.hub;
    if (l.repair) h += plain('repair', t('Repair road'), 'road', t('1 lumber, 1 brick'), mainTurn && l.repair.ok);
    if (hub.scenario === 'traders') {
      const w = hub.tb.tab[v.me];
      h += plain('upgrade', t('Wagon'), 'wagon', w.level < 5 ? t('Level {n}: upgrade', { n: w.level }) : t('Fully upgraded'), free && !!l.upgrade);
    }
    if (l.boot && l.boot.length) h += plain('boot', t('Pass the old boot'), 'boot', t('to a player with as many points or more'), mainTurn);
    return h;
  }
  function chips(v, m) {
    const out = [], hub = v.hub;
    const chip = (ic, bg, text, title) => `<span class="stat-chip" title="${esc(title)}"><span class="ic" style="background:${bg}">${glyph(ic, 13)}</span>${text}</span>`;
    if (hub.scenario === 'barbarians') {
      out.push(chip('knight', '#6B4A2A', t('{n} knights left', { n: hub.bb.reserve[v.me] }), t('Knights in your supply')));
      out.push(chip('barbarian', '#9A5A2A', `${hub.bb.prisoners[v.me]}`, t('Prisoners: 2 are worth 1 point')));
    }
    if (hub.scenario === 'traders') {
      const w = hub.tb.tab[v.me];
      out.push(chip('wagon', '#8A6234', t('Wagon {n}/5', { n: w.level }), t('Your wagon tableau')));
      out.push(chip('gold', '#4A6A3A', w.ware ? `${esc(wareName(w.ware))} → ${esc(t(hub.tb.dest ? hub.tb.dest[w.ware] : ''))}` : t('No order yet'), t('The ware you carry and where it goes')));
    }
    if (hub.harbors) out.push(chip('harbor', '#2C5F7A', `${hub.harborPts[v.me]}`, t('Harbor points: 3 earn the Strongest Ports tile (+2 points)')));
    return out;
  }
  function hud(v) {
    const hub = v.hub, bits = [];
    const pill = (ic, text, title) => `<span class="hud-pill" title="${esc(title)}"><svg viewBox="0 0 24 24" width="15" height="15" style="color:#F0E4C8">${GLYPH[ic] || ''}</svg> ${text}</span>`;
    if (hub.scenario === 'barbarians') bits.push(pill('barbarian', hub.bb.supply, t('Barbarians still to land')), pill('knight', hub.bb.deck, t('Development cards left')));
    if (hub.scenario === 'caravans') bits.push(pill('wagon', hub.cv.pool, t('Trade wagons left')));
    if (hub.scenario === 'traders') bits.push(pill('wagon', Object.values(hub.tb.stacks).reduce((a, b) => a + b, 0), t('Goods tiles left')));
    if (hub.harbors && hub.harborHolder != null) bits.push(pill('harbor', esc(v.players[hub.harborHolder].name), t('Strongest Ports tile')));
    return bits.join('');
  }
  function playerMeta(v, p, i) {
    const hub = v.hub, out = [];
    const chip = (ic, bg, text, title) => `<span class="mp" title="${esc(title)}"><span class="ic" style="background:${bg}">${glyph(ic, 13)}</span>${text}</span>`;
    if (hub.scenario === 'barbarians') out.push(chip('barbarian', '#9A5A2A', `${hub.bb.prisoners[i]}`, t('Prisoners')));
    if (hub.scenario === 'traders') out.push(chip('wagon', '#8A6234', `${hub.tb.tab[i].level}·${hub.tb.tab[i].delivered}`, t('Wagon level · deliveries')));
    if (hub.scenario === 'caravans' && p.wagonVp) out.push(chip('wagon', '#8A6234', `+${p.wagonVp}`, t('Buildings between two wagons')));
    if (hub.harbors) out.push(chip('harbor', '#2C5F7A', `${hub.harborPts[i]}${hub.harborHolder === i ? ' ★' : ''}`, t('Harbor points')));
    return out.join('');
  }

  // ---------------------------------------------------------------- actions of the buttons
  function action(what) {
    const v = V(), l = L();
    switch (what) {
      case 'repair':
        c.startPick('edges', l.repair.edges, t('Tap the damaged road to repair.'), e => c.send({ type: 'repairRoad', e }), { key: 'repair' });
        return true;
      case 'upgrade': c.send({ type: 'upgradeWagon' }); return true;
      case 'boot':
        c.choiceDialog(tx('Pass the old boot'), tx('The old boot goes to a player with at least as many points as you.'), l.boot.map(p => ({ value: p, html: `${houseIcon(v.players[p].color)} ${esc(v.players[p].name)} · ${tx('Points: {n}', { n: v.players[p].vp })}` })), to => c.send({ type: 'giveBoot', to }));
        return true;
      case 'knightsDone': c.send({ type: 'knightsDone' }); return true;
      case 'wagonDone': c.send({ type: 'wagonDone' }); return true;
      case 'wagonGrain': c.send({ type: 'wagonGrain' }); return true;
      case 'wagonTrip': c.send({ type: 'playGoodTrip' }); return true;
      case 'wagonExpel': {
        const es = l.wagon.expel;
        if (es.length === 1) c.send({ type: 'wagonExpel', edge: es[0] });
        else c.startPick('edges', es, t('Tap the barbarian to drive away.'), edge => c.send({ type: 'wagonExpel', edge }));
        return true;
      }
      case 'fish': fishDialog(); return true;
      default: return false;
    }
  }

  function fishDialog() {
    const v = V(), m = c.me(), l = L();
    const knights = v.mode === 'knights';
    const toks = (m.fishTok || []).slice();
    const sel = new Set();
    const rows = [
      ['robber', t('Take the robber off the board'), t('He comes back with the next 7 or the next knight.')],
      ['steal', t('Steal a card'), t('Take a random card from a player of your choice.')],
      ['take', t('Take a resource'), t('Take any resource from the bank.')],
      ['road', t('Free road'), t('Build one road without paying.')],
      ['dev', knights ? t('Progress card') : t('Development card'), knights ? t('Draw a progress card from a deck you choose.') : t('Draw a development card for free.')],
    ];
    modal(`<h2>${tx('Spend fish')}</h2><p class="muted" style="margin:0">${tx('Pick tokens (or let the game choose the best fit). Fish above the price are lost. Fish cannot be traded or stolen.')}</p>
      <div class="fish-toks" id="ft" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"></div><div id="fr" style="display:flex;flex-direction:column;gap:8px"></div><div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
      onMount(el, close) {
        const total = () => (sel.size ? [...sel].reduce((a, i) => a + toks[i], 0) : toks.reduce((a, b) => a + b, 0));
        const draw = () => {
          el.querySelector('#ft').innerHTML = toks.map((n, i) => `<button class="btn small ${sel.has(i) ? 'primary' : ''}" data-t="${i}" title="${n}">${'🐟'.repeat(n)}</button>`).join('') || `<span class="muted">${tx('You have no fish tokens.')}</span>`;
          el.querySelector('#fr').innerHTML = rows.map(([k, h, d]) => `<button class="btn" data-w="${k}" ${total() < FISH_COST[k] || (k === 'robber' && v.robber == null) || (k === 'dev' && !knights && v.devDeck < 1) ? 'disabled' : ''} style="height:auto;line-height:1.25;padding:8px 10px;white-space:normal;text-align:left;display:block">
            <span style="display:flex;width:100%;align-items:center;gap:10px"><span class="fishcost">${FISH_COST[k]}<svg viewBox="0 0 24 24" width="14" height="14">${GLYPH.fish}</svg></span><span style="flex:1;min-width:0"><b style="display:block">${esc(h)}</b><small style="font-weight:400;opacity:.75">${esc(d)}</small></span></span></button>`).join('');
          el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const i = +b.dataset.t; sel.has(i) ? sel.delete(i) : sel.add(i); draw(); });
          el.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => {
            const what = b.dataset.w, tokens = sel.size ? [...sel] : undefined;
            if (what === 'steal') {
              const opts = v.players.map((p, i) => ({ p, i })).filter(x => x.i !== v.me && x.p.cards > 0);
              if (!opts.length) { c.toast(t('Nobody has cards to steal.'), 'warn'); return; }
              close();
              setTimeout(() => c.choiceDialog(tx('Steal from…'), tx('You take one random card.'), opts.map(({ p, i }) => ({ value: i, html: `${houseIcon(p.color)} ${esc(p.name)} · ${tx('Cards: {n}', { n: p.cards })}` })), target => c.send({ type: 'useFish', what: 'steal', target, tokens })), 30);
              return;
            }
            if (what === 'take') { close(); setTimeout(() => c.choiceDialog(tx('Take a resource'), '', c.resChoices(), res => c.send({ type: 'useFish', what: 'take', res, tokens })), 30); return; }
            if (await c.send({ type: 'useFish', what, tokens })) close();
          });
        };
        draw();
      },
    });
  }

  // ---------------------------------------------------------------- costs dialog
  function costRows(v) {
    const rows = [];
    if (v.hub.scenario === 'traders') rows.push([t('Wagon upgrade'), { lumber: 1, wool: 1, ore: 1 }, t('Levels 2 and 3; levels 4 and 5 need 2 lumber')]);
    if (v.hub.scenario === 'barbarians') rows.push([t('Development card'), { wool: 1, grain: 1, ore: 1 }, t('Turned over and played at once')]);
    if (v.hub.damaged && Object.keys(v.hub.damaged).length) rows.push([t('Repair road'), { lumber: 1, brick: 1 }, t('After an earthquake')]);
    return rows;
  }
  function costsExtra(v) {
    const s = v.hub.scenario, out = [];
    if (v.fishing) out.push(t('Fish: 2 fish take the robber off the board, 3 steal a card, 4 take a resource, 5 build a road, 7 buy a development card. At most 7 tokens; the old boot costs you 1 more point to win.'));
    if (v.gold) out.push(t('Gold: 2 gold buy a resource (twice per turn). 4:1, 3:1 or 2:1 buys a gold. Gold cannot be stolen.'));
    if (s === 'caravans') out.push(t('Merchant Trains: if you build a settlement or city, a voting round at the end of your turn decides where the next trade wagon goes (wool and grain are the votes). Buildings between two wagons are worth 1 more; a wagon on the same edge as a road counts as an additional road for the Longest Road.'));
    if (s === 'barbarians') out.push(t('Barbarians: they land after every settlement or city you build. Three conquer a tile. Knights drive them off when there are more knights than barbarians around a tile. 2 prisoners are worth 1 point.'));
    if (s === 'traders') out.push(t('Wagons: a path costs 2, your road 1, another road 1 and 1 gold, a barbarian 2 more. Deliver wares for points and gold.'));
    return out;
  }

  // ---------------------------------------------------------------- dice slot
  function diceCard(d) {
    const name = t(d.card.ev === 'newyear' ? 'newyear' : d.card.ev);
    const term_ = term(d.card.ev);
    return `<div class="evcard" title="${esc(term_)}: ${esc(t(EVENT_TEXT[d.card.ev] || ''))}"><span class="evn">${d.total}</span><span class="evt">${esc(term_)}</span></div>${d.red ? `<div class="die red">${d.red}</div>` : ''}`;
  }

  return { status, waiting, targets, boardClick, dialog, tokenList, actions, chips, hud, playerMeta, action, costRows, costsExtra, diceCard, fishDialog };
}

// ---------------------------------------------------------------- the event card scene (played by fx.js)
export async function eventCardScene(view, total, nameHtml) {
  const d = view.dice && view.dice.card ? view.dice : null;
  if (!d) return;
  const ev = d.card.ev;
  sfx.dice();
  const sc = layer('fx-event', `<div class="ev-card"><div class="ev-title">${esc(term(ev))}</div><div style="display:flex;gap:16px;align-items:center">
    <div class="ev-num" style="font-family:var(--serif);font-weight:800;font-size:64px;color:#F0C24A;min-width:90px;text-align:center">${total}</div>
    <p style="margin:0;color:#FFF3DC;font-size:15px;line-height:1.4">${esc(t(EVENT_TEXT[ev] || ''))}</p></div></div>`);
  await hold(sc, 2600);
}
