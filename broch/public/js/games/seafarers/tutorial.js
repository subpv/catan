// The tutorial chapter of Seafarers: ships, fog, new islands, gold fields, the pirate and the longest trade route.
// The engine (addChapter, the T toolbox, the player) is core/tutorial.js.
import { addChapter, geometry, hAt, vAt, eAt, baseView } from '../../core/tutorial.js';
import { t } from '../../core/core.js';
import { sfx } from '../../core/fx.js';

addChapter({ id: 'seafarers', name: 'Seafarers', color: '#1F7A99', build: seafarers });

function seafarers() {
  const B = geometry([
    { q: 0, r: -1, t: 'forest', n: 8, island: 0 }, { q: -1, r: 0, t: 'hills', n: 6, island: 0 }, { q: 0, r: 0, t: 'fields', n: 9, island: 0 }, { q: -1, r: 1, t: 'pasture', n: 5, island: 0 },
    { q: 1, r: -1, t: 'sea' }, { q: 1, r: 0, t: 'fog' }, { q: 0, r: 1, t: 'sea' }, { q: 1, r: 1, t: 'sea' }, { q: -1, r: -1, t: 'sea' }, { q: 2, r: -2, t: 'sea' }, { q: 2, r: 0, t: 'sea' },
    { q: 2, r: -1, t: 'gold', n: 10, island: 1 }, { q: 3, r: -1, t: 'mountains', n: 4, island: 1 },
  ]);
  B.homeIslands = [0];
  B.bonus = { vp: 2, mode: 'each' }; B.bonusIslands = [1];
  const home = vAt(B, 0, -1), mid = vAt(B, 0.866, -0.5), land = vAt(B, 1.732, -1);
  const s1 = eAt(B, home, mid), s2 = eAt(B, mid, land);
  const fog = hAt(B, 1, 0), gold = hAt(B, 2, -1), sea1 = hAt(B, 1, -1), south = hAt(B, 0, 1);
  const v = baseView(B, { expansion: 'seafarers', pirate: south });
  v.buildings[home] = { p: 0, type: 'settlement' };
  v.buildings[vAt(B, -0.866, 0.5)] = { p: 1, type: 'settlement' };
  return {
    view: v, vpTarget: 14,
    steps: [
      async T => {
        T.say(t('Seafarers'), t('The land is split into islands. Ships cross the sea. In the founding phase a coastal settlement may take a ship instead of a road.'));
        T.vp(2);
        await T.wait(2600);
      },
      async T => {
        T.say(t('Build ships on the water.'), t('A ship costs lumber and wool. Tap the glowing edge.'));
        await T.give({ lumber: 1, wool: 1 });
        await T.tap({ edges: [s1] });
        await T.pay({ lumber: 1, wool: 1 }, T.edgePt(s1));
        T.ship(s1, 0);
        await T.wait(900);
        T.say(t('Ships form a chain, like roads.'), t('The last ship of an open chain may sail to a new spot once per turn. A chain that joins two of your settlements is closed.'));
        await T.give({ lumber: 1, wool: 1 });
        await T.pay({ lumber: 1, wool: 1 }, T.edgePt(s2));
        T.ship(s2, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('Sail next to the fog to reveal it.'), t('Discovering land pays you a resource of its kind. In the Fog Islands scenario a ship or road next to a face-down tile turns it over.'));
        T.reveal(fog, 'pasture', 3);
        sfx.reveal();
        await T.wait(800);
        await T.gain(T.hexPt(fog), 'wool', 1, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('Settle a new island: +2 points!'), t('Tap the glowing corner. Your first settlement on each foreign island earns bonus points (2 in most scenarios).'));
        await T.tap({ vertices: [land] });
        T.build(land, 'settlement', 0);
        T.set(v2 => { v2.islandBonus = { 1: [0] }; });
        T.float(T.vertPt(land), '+2', '#F6CF57');
        T.vp(5);
        await T.wait(1500);
      },
      async T => {
        T.say(t('Gold fields pay any resource you like.'));
        await T.roll(4, 6);
        T.hit(10);
        const k = await T.choose(['lumber', 'brick', 'wool', 'grain', 'ore'], 'ore');
        await T.gain(T.hexPt(gold), k, 1, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('The pirate'), t('No ship may be built or moved next to his tile, and he steals a card from a player with a ship there. On a 7 or with a knight you move either the robber or the pirate.'));
        T.movePirate(sea1);
        sfx.pirate();
        await T.wait(2400);
      },
      async T => {
        T.say(t('Longest Trade Route'), t('Roads and ships count together, but they only join at your own settlements and cities. 5 or more in a row earn 2 points.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Win with 10 to 14 points.'), t('Pick one of the scenarios from the rulebook, or the free game, when you create the game.'));
        await T.countVp(14);
        await T.finale();
      },
    ],
  };
}
