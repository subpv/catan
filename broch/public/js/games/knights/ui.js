// Cities & Knights in the game screen: the improvements panel, knights and their dialogs, progress cards, the aqueduct,
// the barbarian pills and the texts of the questions the engine asks (displaced knight, metropolis, progress decks ...).
// games/classic/screen.js builds the helper bundle `c` once and calls these hooks; everything else lives here.
import { esc, glyph, houseIcon, modal, toast, PCOLOR, RES, COMM, CARD_COLOR, resName, cardName, term, tf, t } from '../../core/core.js';
import { sfx } from '../../core/fx.js';
import { PROGRESS_INFO, PROGRESS_DECK, DECK_COLOR } from '../../core/cards.js';

const COSTS = { knight: { wool: 1, ore: 1 }, wall: { brick: 2 } };
const EVENT_ICON = { ship: '⛵', trade: '◆', politics: '◆', science: '◆' };
const EVENT_COLOR = { ship: '#2B1E12', trade: '#E0A32E', politics: '#2C6E9B', science: '#2E6B45' };

// city improvements: a race track per discipline, everyone's marker visible
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
const tx = (k, p) => esc(t(k, p));
const htmlToText = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; };
const hexBadge = (track, n) => `<span class="hexbadge ${track}" title="${esc(term(track))}: ${n}">${n}</span>`;

export function createKnights(c) {
  const { send, startPick, render, me, isMine, myPending, choiceDialog, cardPicker, resChoices, nameSpan } = c;

  // ---------------------------------------------------------------- the event die (a ship or a coloured gate)
  function eventDie(d) {
    if (!d.event) return '';
    const evName = d.event === 'ship' ? t('Barbarian ship') : t('{track} gate', { track: term(d.event) });
    return `<div class="die event" style="background:${EVENT_COLOR[d.event]};color:#fff;border-color:${EVENT_COLOR[d.event]}" title="${esc(evName)}">${EVENT_ICON[d.event]}</div>`;
  }

  // ---------------------------------------------------------------- status line
  // the headline, the hint and the button label of each question that only exists in Cities & Knights
  function pendingTexts(mp, v) {
    return {
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
    };
  }
  const WAIT = {
    relocateKnight: 'Waiting for {names} to relocate a knight…', loseCity: 'Waiting for {names} to pick a city to lose…',
    chooseProgress: 'Waiting for {names} to draw progress cards…', deserterPick: 'Waiting for {names} to pick a deserting knight…',
    harborGive: 'Waiting for {names} to trade a commodity…', discardProgress: 'Waiting for {names} to play or give back a progress card…',
  };
  const statusBtns = mp => (mp.type === 'placeFreeKnight' ? `<button class="btn" data-do="skipFreeKnight">${tx('Skip')}</button>` : '');
  // buttons of the status line that belong to this game (true when handled)
  function action(what) {
    if (what === 'skipFreeKnight') { send({ type: 'placeFreeKnight', v: null }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- board
  // what glows when the engine asks for a corner or a knight (null: not one of ours)
  function targets(L) {
    if (L.relocate) return { vertices: L.relocate };
    if (L.metroCities) return { vertices: L.metroCities };
    if (L.loseCities) return { vertices: L.loseCities };
    if (L.freeKnightSpots) return { vertices: L.freeKnightSpots };
    if (L.giveKnights) return { ownKnights: L.giveKnights };
    return null;
  }
  // the knights you may act with, glowing on your turn (added to the targets of the main phase)
  function ownKnights(L) { return L.knights && Object.keys(L.knights).length ? Object.keys(L.knights).map(Number) : null; }
  // a tap on a knight: true when it was ours
  function knightClick(el, id, L) {
    if (L.giveKnights && el.dataset.k != null) { send({ type: 'deserterPick', v: id }); return true; }
    if (el.dataset.k != null) { knightMenu(id); return true; }
    return false;
  }
  // a tap on a corner while the engine asks for a displaced knight, metropolis, lost city or free knight
  function cornerClick(id, L) {
    if (L.relocate) { send({ type: 'relocateKnight', v: id }); return true; }
    if (L.metroCities) { send({ type: 'placeMetropolis', v: id }); return true; }
    if (L.loseCities) { send({ type: 'loseCity', v: id }); return true; }
    if (L.freeKnightSpots) { send({ type: 'placeFreeKnight', v: id }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- pills, hand and players
  function hud(v) {
    if (!(v.mode === 'knights' && v.barbarian)) return [];
    let track = '';
    for (let i = 0; i < 7; i++) track += `<i class="${i < v.barbarian.pos ? 'on' : ''}"></i>`;
    const strength = Object.values(v.buildings).filter(b => b.type === 'city').length;
    const defense = Object.values(v.knights).filter(k => k.active).reduce((a, k) => a + k.level, 0);
    return [
      `<span class="hud-pill barb-pill" title="${tx('Barbarian ship: attacks when it reaches the end')}">⛵ <span class="barb-track">${track}</span></span>`,
      `<span class="hud-pill" title="${tx('Barbarian strength (cities) vs active knights')}">⚔ ${strength} : ${defense}</span>`,
    ];
  }
  // the knight and city wall buttons of the hand
  function buttons(btn, free, L, m) {
    return btn('knight', t('Knight'), 'knight', COSTS.knight, free && L.knightSpots?.length > 0, m.pieces.knights[1])
      + btn('wall', t('City wall'), 'wall', COSTS.wall, free && L.walls?.length > 0, m.pieces.walls);
  }
  // progress cards as real little cards (4 slots)
  function cardsRow(m) {
    const prog = m.progress || [];
    const slots = Math.max(4, prog.length);
    let dcs = '';
    for (let i = 0; i < slots; i++) {
      const cd = prog[i];
      if (!cd) { dcs += '<span class="dcard slot"></span>'; continue; }
      const deck = PROGRESS_DECK[cd];
      dcs += `<button class="dcard prog" data-prog="${i}" style="--dk:${DECK_COLOR[deck]}" title="${esc(cardName(cd))}"><span class="dc-ic">${glyph(deck, 16)}</span>${nameSpan(cardName(cd))}</button>`;
    }
    return `<div class="devrow"><span class="lbl">${tx('Progress cards')}<b>${prog.length}/4</b></span><div class="dcards">${dcs}</div></div>`;
  }
  function playerMeta(v, p, i) {
    const out = [];
    out.push(`<span class="mp" title="${tx('Progress: {n}', { n: p.progressCount })}"><i class="stk prog"></i>${p.progressCount}</span>`);
    const str = Object.values(v.knights).filter(k => k.p === i && k.active).reduce((a, k) => a + k.level, 0);
    out.push(`<span class="mp" title="${tx('Active knight strength')}">${glyph('sword', 12)}${str}</span>`);
    const imp = p.improvements;
    out.push(`<span class="mp hb" title="${tx('Improvements: trade / politics / science')}">${hexBadge('trade', imp.trade)}${hexBadge('politics', imp.politics)}${hexBadge('science', imp.science)}</span>`);
    return out;
  }

  // ---------------------------------------------------------------- costs dialog
  function costRows() {
    return [[t('Knight'), COSTS.knight, t('Basic knight (inactive)')], [t('Activate knight'), { grain: 1 }, ''], [t('Promote knight'), { wool: 1, ore: 1 }, t('Mighty needs politics 3')], [t('City wall'), COSTS.wall, t('+2 hand limit')]];
  }
  const costsText = () => `<p class="muted" style="font-size:13px">${tx('Improvements cost 1–5 commodities: cloth for trade, coin for politics, paper for science. Cities on forest, pasture and mountains yield a commodity instead of a second resource.')}</p>`;
  const rules = () => `<p class="muted" style="font-size:13px">${tx('The barbarian ship lands after 7 steps: their strength is the number of cities, your defense the levels of all active knights. Hold at most 4 progress cards and play them after rolling. The robber moves only after the first attack.')}</p>`;

  // ---------------------------------------------------------------- city improvements
  function improveHtml() {
    const G = c.G;
    const v = G.view, L = v.legal || {};
    const mineP = isMine() ? me() : null;
    const tracks = [['trade', 'cloth', '#E0A32E'], ['politics', 'coin', '#2C6E9B'], ['science', 'paper', '#2E6B45']];
    const prev = G.prevImp || {};
    const next = {};
    const lanes = tracks.map(([tr, cm, col]) => {
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
      const why = mineP && !(imp && imp.ok) ? improveWhy(tr, cm) : '';
      const btn = mineP ? `<button class="imp-btn ${why ? 'off' : ''}" data-improve="${tr}" ${why ? `data-why="${esc(why)}" aria-disabled="true"` : ''} title="${esc(why || (imp ? t('Improve {track} ({n} {res})', { track: term(tr), n: imp.cost, res: resName(cm) }) : term(tr)))}" style="--c:${col}"><b>+</b><span>${mineP.improvements[tr] < 5 ? mineP.improvements[tr] + 1 : ''}</span>${glyph(cm, 14)}</button>` : '<span class="imp-btn ghosty"></span>';
      const aq = tr === 'science' && mineP && mineP.improvements.science >= 3
        ? (mineP.aqueduct
          ? `<button class="aq-chip" data-aqueduct title="${esc(t('Aqueduct: {res}. Tap to change.', { res: resName(mineP.aqueduct) }))}" style="background:${CARD_COLOR[mineP.aqueduct]}">💧${glyph(mineP.aqueduct, 14)}</button>`
          : `<button class="aq-chip todo" data-aqueduct title="${esc(t('Aqueduct'))}">💧 ?</button>`) : '';
      const crown = holder != null ? `<span class="metro" style="--pc:${PCOLOR[v.players[holder].color]}" title="${esc(t('Metropolis: {name}', { name: v.players[holder].name }))}">♛</span>` : '';
      return `<div class="lane ${tr}" style="--c:${col}">
      <div class="lane-l"><span class="lane-ic" style="background:${col}">${glyph(cm, 15)}</span><b>${esc(term(tr))}</b></div>
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
    const v = c.G.view, m = me();
    const actor = v.phase === 'play' && !v.pending.length && ((v.step === 'main' && (v.current === v.me || v.options.expBuildAnytime)) || (v.step === 'sbp' && v.sbp?.queue[0] === v.me));
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
    const G = c.G;
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
  // a tap on one of the + buttons of the improvements panel
  function improveClick(im) {
    if (im.dataset.why) { sfx.error(); toast(im.dataset.why, 'warn'); return; }
    return send({ type: 'improve', track: im.dataset.improve });
  }

  // The aqueduct (science level 3): pick the resource once, right when the level is reached. From then on the server
  // pays it out by itself whenever a roll (not a 7) gives you nothing. The chip in the science lane changes it.
  function aqueductChoice() {
    choiceDialog(tx('Aqueduct'), tx('Choose your resource once. From now on the aqueduct pays it out whenever a roll gives you nothing (except on a 7).'), resChoices(), res => send({ type: 'setAqueduct', res }));
  }
  function aqueductPrompt() {
    const G = c.G;
    const v = G.view;
    if (v.mode !== 'knights' || !isMine() || v.phase !== 'play') return;
    const m = me();
    if (m.improvements.science < 3 || m.aqueduct || G.opened.has('aqueduct-pick')) return;
    if (document.querySelector('.modal-back') || myPending().length) return;
    if (window.BROCH_FX_BUSY) { setTimeout(() => { if (c.G && c.G.view === v) aqueductPrompt(); }, 400); return; }
    G.opened.add('aqueduct-pick');
    aqueductChoice();
  }

  // ---------------------------------------------------------------- the questions the engine asks (true when handled)
  function dialog(mp) {
    const v = c.G.view;
    switch (mp.type) {
      case 'chooseProgress':
        choiceDialog(tx('Draw a progress card'), tx('Pick a deck.'), ['science', 'trade', 'politics'].map(d => ({ value: d, html: esc(term(d)), style: `background:${DECK_COLOR[d]};color:#fff;border-color:transparent` })), deck => send({ type: 'chooseProgress', deck }), false);
        return true;
      case 'aqueduct':
        choiceDialog(tx('Aqueduct'), tx('Take one resource of your choice.'), resChoices(), res => send({ type: 'aqueduct', res }), false);
        return true;
      case 'discardProgress': {
        const cards = me().progress;
        const giveBack = () => choiceDialog(tx('Give back a progress card'), tx('You may hold at most 4. The card goes under its deck.'), cards.map((cd, i) => ({ value: i, html: esc(cardName(cd)) })), idx => send({ type: 'discardProgress', idx }), false);
        if (!mp.mustPlay) { giveBack(); return true; }
        const opts = cards.map((cd, i) => ({ value: i, html: esc(cardName(cd)), style: `background:${DECK_COLOR[PROGRESS_DECK[cd]]};color:#fff;border-color:transparent` }));
        if (mp.canGiveBack) opts.push({ value: 'back', html: tx('Give one back instead') });
        choiceDialog(tx('Play a progress card'), tx('You drew a 5th card. Nobody may hold more than 4: play one of your cards now.'),
          opts, idx => { if (idx === 'back') { giveBack(); return true; } const cd = cards[idx]; playProgress(idx, cd, (PROGRESS_INFO[cd] || [])[1] ?? null); return true; }, false);
        return true;
      }
      case 'harborGive': {
        const m = me();
        const opts = COMM.filter(cm => m.comm[cm] > 0).map(cm => ({ value: cm, html: `${glyph(cm, 18)} ${esc(resName(cm))} (${m.comm[cm]})`, style: `background:${CARD_COLOR[cm]};color:#fff;border-color:transparent;justify-content:flex-start` }));
        choiceDialog(tx('Commercial Harbor'), t('{name} offers you 1 {res} for one of your commodities.', { name: v.players[mp.to].name, res: resName(mp.res) }), opts, comm => send({ type: 'harborGive', comm }), false);
        return true;
      }
      case 'spy': {
        const r = v.reveal;
        const opts = (r?.progress || []).map((cd, i) => ({ value: i, html: esc(cardName(cd)) }));
        opts.push({ value: null, html: tx('Take nothing') });
        choiceDialog(tx("{name}'s progress cards", { name: v.players[mp.target].name }), tx('Take one.'), opts, idx => send({ type: 'spyTake', idx }), false);
        return true;
      }
      case 'masterMerchant': {
        const r = v.reveal; const pool = {};
        [...RES, ...COMM].forEach(k => { const n = (r.res[k] ?? r.comm[k]) || 0; if (n) pool[k] = n; });
        const n = Math.min(2, Object.values(pool).reduce((a, b) => a + b, 0));
        cardPicker({ heading: tx("{name}'s hand", { name: v.players[mp.target].name }), text: tx('Take {n} cards.', { n }), pool, count: n, confirm: cards => send({ type: 'takeCards', cards }) });
        return true;
      }
      default: return false;
    }
  }

  // ---------------------------------------------------------------- progress cards
  function progressDialog(idx) {
    const v = c.G.view;
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
    const G = c.G;
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

  // ---------------------------------------------------------------- knights
  function knightMenu(vid) {
    const v = c.G.view, L = v.legal || {};
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

  return {
    eventDie, pendingTexts, WAIT, statusBtns, action, targets, ownKnights, knightClick, cornerClick, hud, buttons, cardsRow, playerMeta,
    costRows, costsText, rules, improveHtml, animateImprovements, improveClick, aqueductChoice, aqueductPrompt, dialog, progressDialog,
  };
}
