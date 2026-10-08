// How to play New Energies: a short interactive chapter for the tutorial player (tutorial.js), after the official rules.
import { addChapter, addHandKeys, hAt, vAt, eAt, baseView, sevenTiles } from '../tutorial.js';
import { t, esc, glyph } from '../core.js';
import { sfx } from '../fx.js';

addHandKeys(['wood', 'clay', 'fiber', 'food', 'metal', 'research', 'energy']);

const pill = (icon, text, cls = '') => `<span class="te ${cls}">${glyph(icon, 15)}${esc(text)}</span>`;
const slotPill = (icon, fill, total, tone) => `<span class="te ${tone}">${glyph(icon, 15)}<span class="en-dots">${Array.from({ length: total }, (_, i) => `<i class="${i < fill ? (tone === 'green' ? 'g' : 'b') : ''}"></i>`).join('')}</span></span>`;
// the pollution marker with the number of chips it makes you draw, the bag and (when asked) the damages
const env = ({ pol = 9, bag = 43, slot = null, dmg = 0, bal = null }) => `${pill('cloud', `${pol} · ${pol <= 5 || (pol >= 19 && pol <= 23) ? 2 : pol >= 24 ? 3 : 1}×`, pol >= 19 ? 'warn' : pol <= 5 ? 'green' : '')}${pill('bag', bag)}${slot || ''}${dmg ? pill('cog', dmg, 'warn') : ''}${bal || ''}`;

function energies() {
  const B = sevenTiles();
  const C = hAt(B, 0, 0), NW = hAt(B, 0, -1), SE = hAt(B, 0, 1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1), far = vAt(B, 1.732, -1);
  const v = baseView(B, { mode: 'energies', plants: [], damages: { h: [], v: [] }, inspector: hAt(B, -1, 0) });
  v.buildings[home] = { p: 0, type: 'city' };
  v.buildings[far] = { p: 0, type: 'settlement' };
  v.buildings[foe] = { p: 1, type: 'settlement' };
  v.roads[eAt(B, home, vAt(B, 0.866, -0.5))] = 0;
  const plant = (id, kind, hex) => ({ id, p: 0, kind, v: home, hex });
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Welcome to New Energies!'), t('Everyone starts with a village and a research city. The first to 10 points wins, but the event bag can end the game early.'));
        T.vp(3); T.extra(env({}));
        await T.wait(2600);
      },
      async T => {
        T.say(t('Cities make research cards.'), t('Roll for yields: a village makes 1 resource, a research city 1 resource and 1 research card.'));
        await T.tap({ dice: true });
        await T.roll(3, 5);
        T.hit(8);
        await Promise.all([T.gain(T.hexPt(C), 'wood', 1, 0, home), T.gain(T.hexPt(C), 'research', 1, 0, home, 200), T.gain(T.hexPt(C), 'wood', 1, 1, foe, 360)]);
        await T.wait(900);
      },
      async T => {
        T.say(t('Every turn starts with event chips from the bag.'), t('The pollution marker decides how many: 1 chip at 6–18, 2 chips below 6 or at 19–23, 3 chips from 24 (with 4 players).'));
        T.extra(env({ slot: slotPill('ev_disaster', 0, 4, 'brown') }));
        await T.wait(2400);
        for (let i = 1; i <= 3; i++) {
          await T.bigCard({ title: t('Environmental disaster'), color: '#6B4A2E', icon: 'ev_disaster' });
          T.extra(env({ bag: 43 - i, slot: slotPill('ev_disaster', i, 4, 'brown') }));
          if (i === 1) T.say(t('The chip goes on the slots of its event.'), t('Nothing happens yet: the event needs all 4 slots.'));
          if (i === 3) T.say(t('One slot is still free.'), t('The chip that fills the last slot triggers the event.'));
          if (i < 3) await T.wait(500);
        }
        await T.wait(1200);
      },
      async T => {
        T.say(t('The last slot is filled: the event happens!'), t('Environmental disaster: the active player rolls and every tile with that number gets a damage.'));
        await T.bigCard({ title: t('Environmental disaster'), color: '#6B4A2E', icon: 'ev_disaster' });
        T.extra(env({ bag: 39, slot: slotPill('ev_disaster', 0, 4, 'brown') }));
        await T.roll(2, 4);
        T.hit(6);
        T.set(x => { x.damages.h.push(NW); }, { damage: ['h' + NW] });
        sfx.place();
        T.extra(env({ bag: 39, dmg: 1 }));
        T.say(t('A damage lies on the 6.'), t('The tile is blocked: no resources, no research cards, no energy.'));
        await T.wait(2200);
      },
      async T => {
        T.say(t('Roll a blocked number...'), t('...and you get nothing. But the Catanians clear the damage.'));
        await T.roll(1, 5);
        T.hit(6);
        await T.banner(t('Blocked!'), 'red');
        T.set(x => { x.damages.h = []; });
        T.extra(env({ bag: 39 }));
        T.say(t('From the next roll the tile pays again.'), t('You can also clear a damage yourself with 1 energy token or the card Environmental protection.'));
        await T.wait(2400);
      },
      async T => {
        T.say(t('A 7 brings the Environmental inspector.'), t('Nobody gets yields. Hands over 7 cards are halved. Then you move the inspector and take a card.'));
        await T.roll(3, 4);
        await T.banner(t('The inspector arrives!'), 'red');
        await T.wait(300);
        T.say(t('Move him to another tile.'), t('He blocks it like a damage. Take a card from a player next to it.'));
        T.set(x => { x.inspector = SE; }, { inspector: true });
        sfx.robber();
        await T.wait(900);
        await T.steal(foe, 'metal');
        await T.wait(1000);
      },
      async T => {
        T.say(t('Power plants turn numbers into energy.'), t('A brown plant costs 1 research card and pollutes. Tap your city, then the tile.'));
        await T.tap({ vertices: [home] });
        await T.tap({ hexes: [C] });
        await T.pay({ research: 1 }, T.hexPt(C));
        T.set(x => { x.plants.push(plant(1, 'brown', C)); }, { plants: [1] });
        sfx.place();
        T.extra(env({ pol: 10, bag: 39 }));
        T.say(t('Cheap, but +1 pollution.'), t('When the tile’s number comes up, the plant makes 1 energy token (at most 5 in your hand).'));
        await T.wait(1800);
        await T.roll(3, 5);
        T.hit(8);
        await Promise.all([T.gain(T.hexPt(C), 'energy', 1, 0, home), T.gain(T.hexPt(C), 'wood', 1, 0, home, 180), T.gain(T.hexPt(C), 'research', 1, 0, home, 360)]);
        await T.wait(900);
      },
      async T => {
        T.say(t('Green plants cost 3 research cards.'), t('Only one plant per turn. Tap the city, then another tile.'));
        await T.give({ research: 2 });
        await T.tap({ vertices: [home] });
        await T.tap({ hexes: [NW] });
        await T.pay({ research: 3 }, T.hexPt(NW));
        T.set(x => { x.plants.push(plant(2, 'green', NW)); }, { plants: [2] });
        sfx.award();
        T.extra(env({ pol: 9, bag: 40 }));
        T.say(t('A green plant means −1 pollution.'), t('Its green event chip goes into the bag: more chips mean more turns.'));
        await T.wait(2400);
      },
      async T => {
        T.say(t('The environmental balance decides who is rewarded.'), t('Village +1, research city +2, brown plant +1, green plant −1. Low is good.'));
        T.extra(env({ pol: 9, bag: 40, bal: `${pill('cloud', `${t('You')} 3`, 'warn')}${pill('cloud', `${t('Blue')} 1`, 'green')}` }));
        await T.wait(2400);
        await T.bigCard({ title: t('Climate conference'), color: '#4F7A3C', icon: 'ev_climate' });
        T.say(t('Climate conference: the best balance takes a card, the worst gives one back.'), t('Air pollution damages the worst balance, production boost lets it build a free brown plant. Sustainable production rewards the most green plants, state funding the best balance.'));
        await T.pay({ wood: 1 }, T.vertPt(home));
        await T.wait(1800);
      },
      async T => {
        T.say(t('Energy tokens are flexible.'), t('2 swap for any card, 1 removes a damage, 2 buy a warehouse (hand limit 10), 1 tears down a brown plant.'));
        await T.give({ energy: 1 });
        await T.bankTrade({ energy: 2 }, 'metal');
        T.say(t('You can always trade.'), t('With players in any ratio you agree on. They may answer your offer with a counter-offer.'));
        await T.wait(2800);
        T.say(t('Trade with the supply.'), t('Resources 4:1 (harbors make it 3:1 or 2:1), research cards 3:1, energy tokens 2:1.'));
        await T.wait(2600);
      },
      async T => {
        T.say(t('Development cards help too.'), t('Play 1 card per turn, not the turn you bought it. Environmental protection moves the inspector or removes a damage; three of them win 2 points.'));
        await T.give({ metal: 1, fiber: 1, food: 1 });
        await T.pay({ metal: 1, fiber: 1, food: 1 }, T.pt(0, 0));
        await T.bigCard({ title: t('Environmental protection'), color: '#5B3A6E', icon: 'protection' });
        await T.wait(600);
      },
      async T => {
        T.say(t('Two ways to end the game.'), t('10 points in your own turn, or the bag runs empty.'));
        T.extra(env({ pol: 9, bag: 0 }));
        await T.wait(2400);
        T.say(t('Empty bag: only more green than brown plants can win.'), t('The biggest difference wins. If nobody has more green plants, everybody loses.'));
        await T.wait(2600);
        T.say(t('Village 1 · Research city 2 · Longest Trade Route (5 roads) 2 · Environmentalist 2'), t('Build green, keep the bag full, and reach 10.'));
        await T.countVp(10);
        await T.finale();
      },
    ],
  };
}

addChapter({ id: 'energies', name: 'New Energies', color: '#2E9A5A', build: energies });
