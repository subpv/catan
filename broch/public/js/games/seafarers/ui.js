// Seafarers in the game screen: ships and the pirate, gold fields, harbour gifts of the forgotten tribe, villages with cloth
// and the Wonders of Broch. games/classic/screen.js builds the helper bundle `c` once and calls these hooks; the printed
// scenarios themselves are described in scen.js.
import { esc, glyph, houseIcon, modal, RES, t } from '../../core/core.js';
import { boardBounds, BOARD_S } from '../../core/board.js';
import { SCEN, WONDER } from './scen.js';

const COSTS = { ship: { lumber: 1, wool: 1 } };
const tx = (k, p) => esc(t(k, p));

export function createSeafarers(c) {
  const { send, startPick, choiceDialog, cardPicker, cardsHtml, chipIcon } = c;

  // ---------------------------------------------------------------- status line
  // the headline and hint of the questions that only exist in Seafarers
  function pendingTexts(mp) {
    return {
      goldPick: [t('Gold! Choose {n} resources.', { n: mp.count }), t('Take any resources the bank has.'), t('Choose cards')],
      placeHarbor: [t('Place your harbour.'), t('Tap one of your highlighted coastal settlements.')],
    };
  }
  const WAIT = { goldPick: 'Waiting for {names} to choose from the gold field…' };
  const statusBtns = (mp, v) => (mp.type === 'moveRobber' && v.legal?.pirateFrame ? `<button class="btn" data-do="pirateFrame">${tx('Pirate to the frame')}</button>` : '');
  // buttons of the status line and the hand that belong to this game (true when handled)
  function action(what) {
    if (what === 'pirateFrame') { send({ type: 'moveRobber', hex: -1 }); return true; }
    if (what === 'wonders') { wondersDialog(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- board
  // what glows while the engine asks for a coastal settlement to take a harbour (null: not ours)
  function targets(L) { return L.harborSpots ? { vertices: L.harborSpots } : null; }
  // your ships that may sail now (added to the targets of the main phase)
  function ownShips(L) { return L.moveShips && Object.keys(L.moveShips).length ? Object.keys(L.moveShips).map(Number) : null; }
  const shipHint = L => (L.moveShips && Object.keys(L.moveShips).length ? tx('Tap one of your pulsing ships to sail it (once per turn).') : '');
  // big archipelago boards open zoomed in on the land you can see, so tiles are readable on a phone
  function focusOnLand() {
    const G = c.G;
    const b = G.view?.board;
    if (!b || b.hexes.length < 45) return;
    const land = b.hexes.filter(h => h.terrain !== 'sea' && h.terrain !== 'fog');
    if (!land.length) return;
    const S = BOARD_S(), [, , bw, bh] = boardBounds(b);
    const xs = land.map(h => h.x * S), ys = land.map(h => h.y * S);
    const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 90, y1 = Math.max(...ys) + 90;
    const z = Math.max(1, Math.min(2.6, Math.min(bw / (x1 - x0), bh / (y1 - y0))));
    if (z > 1.15) G.zoom = { z, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // a coast edge may take a road or a ship (founding phase, Road Building card): ask when both would do
  function roadOrShip(e, roads, ships, road, ship) {
    const r = (roads || []).includes(e), sh = (ships || []).includes(e);
    if (r && sh) return choiceDialog(tx('Road or ship?'), tx('This edge is on the coast.'), [{ value: 'road', html: `${glyph('road', 16)} ${tx('Road')}` }, { value: 'ship', html: `${glyph('ship', 16)} ${tx('Ship')}` }], k => (k === 'road' ? road(e) : ship(e)));
    if (sh) return ship(e);
    if (r) return road(e);
  }
  function shipMenu(eid) {
    const L = c.G.view.legal || {};
    const dest = L.moveShips?.[eid];
    if (!dest || !dest.length) return;
    startPick('edges', dest, t('Tap where this ship should sail.'), to => send({ type: 'moveShip', from: eid, to }), { key: 'moveShip' });
  }
  const harborClick = id => send({ type: 'placeHarbor', v: id });

  // ---------------------------------------------------------------- hand, pills and players
  const shipButton = (btn, free, L, m) => btn('ship', t('Ship'), 'ship', COSTS.ship, free && L.ships?.length > 0, m.pieces.ships);
  const wondersButton = (plain, v) => (v.wonders ? plain('wonders', t('Wonders'), 'castle', t('Build a wonder'), true) : '');
  // (phone: the Ship button already shows how many are left, so this chip is hidden there: class dup)
  const shipChip = m => `<span class="stat-chip dup" title="${tx('Pieces left')}">${chipIcon('ship', '#2C5F7A')}${tx('{n} left', { n: m.pieces.ships })}</span>`;
  function playerMeta(v, p, i) {
    const out = [];
    if (v.villages) out.push(`<span class="mp" title="${tx('Bales of cloth (2 bales = 1 point)')}">${chipIcon('cloth', '#8A5A9E')}${p.cloth}</span>`);
    if (v.gifts && (p.chips || p.harbors)) out.push(`<span class="mp" title="${tx('Victory point chips · harbours waiting for a settlement')}">${chipIcon('star', '#C58E12')}${p.chips}${p.harbors ? ` · ${glyph('bank', 11)}${p.harbors}` : ''}</span>`);
    if (v.wonders) { const w = Object.entries(v.wonders).find(([, x]) => x.owner === i); if (w) out.push(`<span class="mp" title="${esc(t(WONDER[w[0]].name))}">${chipIcon(WONDER[w[0]].icon, '#B8832A')}${w[1].level}/4</span>`); }
    return out;
  }

  // ---------------------------------------------------------------- costs dialog
  const costRow = () => [t('Ship'), COSTS.ship, t('Goes on a sea path; one open ship may sail per turn')];
  // the rules of the scenario you are playing
  function scenarioRules(v) {
    return v.expansion === 'seafarers' && SCEN[v.options?.scenario] ? `<h3 style="margin:12px 0 4px">${tx(SCEN[v.options.scenario].label)}</h3><ul class="muted" style="font-size:13px;margin:0;padding-left:18px">${SCEN[v.options.scenario].rules.map(r => `<li>${tx(r)}</li>`).join('')}</ul><p class="muted" style="font-size:13px;margin:6px 0 0">${tx('Win with {n} points.', { n: v.vpTarget ?? v.options.vpTarget })}</p>` : '';
  }

  // ---------------------------------------------------------------- the questions the engine asks (true when handled)
  function dialog(mp) {
    const v = c.G.view;
    switch (mp.type) {
      case 'goldPick': {
        const pool = Object.fromEntries(RES.filter(r => v.bank[r] > 0).map(r => [r, v.bank[r]]));
        cardPicker({ heading: tx('Gold!'), text: tx('Choose {n} resources from the bank.', { n: mp.count }), pool, count: mp.count, haveText: 'bank {n}', confirm: cards => send({ type: 'pickGold', cards }) });
        return true;
      }
      case 'steal':
        if (!mp.cloth) return false;
        choiceDialog(tx('Steal from…'), tx('Take one random card or one bale of cloth.'), mp.options.map(p => ({ value: p, html: `${houseIcon(v.players[p].color)} ${esc(v.players[p].name)} · ${tx('Cards: {n}', { n: v.players[p].cards })} · ${tx('Cloth: {n}', { n: v.players[p].cloth })}` })), from => {
          const q = v.players[from];
          setTimeout(() => choiceDialog(tx('What do you take?'), '', [{ value: false, html: `${glyph('card', 18)} ${tx('A random resource card')}`, disabled: !q.cards }, { value: true, html: `${glyph('cloth', 18)} ${tx('A bale of cloth')}`, disabled: !q.cloth }], cloth => send({ type: 'steal', from, cloth }), false), 50);
        }, false);
        return true;
      default: return false;
    }
  }

  // ---------------------------------------------------------------- the Wonders of Broch
  function wondersDialog() {
    const v = c.G.view, L = v.legal || {}, mine = Object.entries(v.wonders).find(([, w]) => w.owner === v.me);
    const row = ([k, w]) => {
      const W = WONDER[k], owner = w.owner != null ? v.players[w.owner] : null;
      const lv = [1, 2, 3, 4].map(i => `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:3px;border:2px solid #B8832A;background:${i <= w.level ? '#F6CF57' : 'transparent'}"></i>`).join('');
      const can = L.wonders?.start?.includes(k);
      return `<div class="mission"><span class="ic" style="background:#8A5A2A">${glyph(W.icon, 22)}</span><div style="flex:1;min-width:0"><b>${tx(W.name)}</b><small>${tx(W.cond)}</small><small>${tx('Each level:')} ${cardsHtml(v.wonderCost[k])}</small>${owner ? `<small>${houseIcon(owner.color, 14)} ${esc(owner.name)} ${lv}</small>` : ''}</div>
      ${!owner ? `<button class="btn small gold" data-wstart="${k}" ${can ? '' : 'disabled'}>${tx('Claim')}</button>` : w.owner === v.me ? `<button class="btn small gold" data-wbuild ${L.wonders?.build && w.level < 4 ? '' : 'disabled'}>${tx('Build level {n}', { n: Math.min(4, w.level + 1) })}</button>` : ''}</div>`;
    };
    modal(`<h2>${tx('Wonders')}</h2><p class="muted" style="margin:0 0 8px">${tx('Meet the condition, claim a wonder and build its four levels. Finishing it wins; so does having 10 points on your turn with a higher level than everybody else.')}${mine ? '' : ' ' + tx('You can only build one wonder.')}</p>
    ${Object.entries(v.wonders).map(row).join('')}<div class="foot"><button class="btn" data-close>${tx('Close')}</button></div>`, {
      onMount(el, close) {
        el.querySelectorAll('[data-wstart]').forEach(b => b.onclick = async () => { if (await send({ type: 'startWonder', wonder: b.dataset.wstart })) close(); });
        el.querySelector('[data-wbuild]')?.addEventListener('click', async () => { if (await send({ type: 'buildWonder' })) { close(); } });
      },
    });
  }

  return {
    pendingTexts, WAIT, statusBtns, action, targets, ownShips, shipHint, focusOnLand, roadOrShip, shipMenu, harborClick, shipButton, wondersButton, shipChip,
    playerMeta, costRow, scenarioRules, dialog,
  };
}
