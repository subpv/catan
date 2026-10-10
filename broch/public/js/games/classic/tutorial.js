// The tutorial chapter of Classic: the 7-tile island, settlements, the dice, the robber, trading and the awards.
// The engine (addChapter, the T toolbox, the player) is core/tutorial.js.
import { addChapter, hAt, vAt, chain, baseView, sevenTiles } from '../../core/tutorial.js';
import { t } from '../../core/core.js';
import { sfx } from '../../core/fx.js';

addChapter({ id: 'classic', name: 'Classic', color: '#C1272D', build: classic });

function classic() {
  const B = sevenTiles();
  const C = hAt(B, 0, 0), SE = hAt(B, 0, 1), W = hAt(B, -1, 0), NW = hAt(B, 0, -1), NE = hAt(B, 1, -1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const trail = chain(B, [[0, -1], [0.866, -0.5], [0.866, 0.5], [1.732, 1], [2.598, 0.5], [2.598, -0.5]]);
  const v = baseView(B, { robber: W });
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Welcome to Broch!'), t('Build, trade and grow. The first to 10 points wins.'));
        T.vp(0);
        await T.wait(1800);
      },
      async T => {
        T.say(t('Every tile makes a resource.'), t('Forest, hills, pasture, fields and mountains. The desert makes nothing.'));
        await T.showResources();
        await T.wait(900);
      },
      async T => {
        T.say(t('Build settlements on corners.'), t('Tap the glowing corner.'));
        await T.tap({ vertices: [home] });
        T.build(home, 'settlement', 0);
        T.vp(1);
        T.say(t('A settlement touches up to 3 tiles.'), t('Never next to another settlement: keep one corner free.'));
        await T.wait(500);
        T.glow([C, NW, NE]);
        await T.wait(900);
        T.build(foe, 'settlement', 1);
        await T.wait(1200);
      },
      async T => {
        T.say(t('Start with two settlements and two roads.'), t('The second settlement pays 1 card for each tile around it. Later settlements must connect to your roads.'));
        T.glow([C, NW, NE]);
        await T.wait(3400);
      },
      async T => {
        T.say(t('Roll the dice every turn.'), t('Tap the dice.'));
        await T.tap({ dice: true });
        await T.roll(3, 5);
        T.hit(8);
        T.say(t('Every tile with that number pays.'), t('Everyone next to it gets a card, even on other players’ turns.'));
        await Promise.all([T.gain(T.hexPt(C), 'lumber', 1, 0, home), T.gain(T.hexPt(C), 'lumber', 1, 1, foe, 260)]);
        await T.wait(1200);
      },
      async T => {
        T.say(t('More dots, more luck.'), t('Red 6 and 8 come up most often, 2 and 12 rarely.'));
        T.hot([6, 8]);
        await T.wait(3200);
        T.hot([]);
      },
      async T => {
        T.say(t('Spend cards to build.'), t('A road costs lumber and brick. Tap the glowing edge.'));
        await T.gain(T.hexPt(NW), 'brick', 1, 0, home);
        const e = trail[0];
        await T.tap({ edges: [e] });
        await T.pay({ lumber: 1, brick: 1 }, T.edgePt(e));
        T.road(e, 0);
        await T.wait(1100);
      },
      async T => {
        T.say(t('Cities pay double.'), t('Upgrade a settlement with 2 grain and 3 ore. Tap your settlement.'));
        await T.give({ grain: 2, ore: 3 });
        await T.tap({ vertices: [home] });
        await T.pay({ grain: 2, ore: 3 }, T.vertPt(home));
        T.build(home, 'city', 0);
        T.vp(2);
        await T.wait(900);
        await T.roll(4, 5);
        T.hit(9);
        await T.gain(T.hexPt(NE), 'grain', 2, 0, home);
        await T.wait(1000);
      },
      async T => {
        T.say(t('A 7 wakes the robber!'), t('First, everyone with more than 7 cards gives back half (rounded down).'));
        await T.roll(3, 4);
        await T.banner('7!', 'red');
        T.say(t('Move the robber onto a tile.'), t('It stops paying. Tap a tile next to your opponent.'));
        await T.tap({ hexes: [SE] });
        T.moveRobber(SE);
        await T.wait(700);
        T.say(t('Then steal a card from someone there.'), t('You draw a random card from their hand.'));
        await T.steal(foe, 'ore');
        await T.wait(1100);
      },
      async T => {
        T.say(t('Trade with players.'), t('On your turn offer cards. Others can accept, decline or answer with a counter-offer, and you pick the deal you like. Players trade only with whoever’s turn it is.'));
        await T.give({ wool: 1 });
        await T.wait(1400);
        await T.pay({ wool: 1 }, T.vertPt(foe));
        await T.gain(T.vertPt(foe), 'brick', 1, 0);
        await T.wait(1400);
      },
      async T => {
        T.say(t('Trade with the bank.'), t('The bank swaps 4 cards of one kind for 1 card of your choice. A 3:1 harbor asks 3, a 2:1 harbor 2 of its resource.'));
        await T.give({ wool: 4 });
        await T.bankTrade({ wool: 4 }, 'brick');
        await T.wait(1200);
      },
      async T => {
        T.say(t('Development cards'), t('Knight, Road Building, Year of Plenty, Monopoly or a hidden point. One per turn, not on the turn you buy it. The lobby house rule “knights without a limit” allows any number of knights.'));
        await T.bigCard({ title: t('Knight'), color: '#5B3A6E', icon: 'knight' });
        T.say(t('3 knights played: Largest Army, +2 points.'), t('Whoever plays more knights takes it away. Its holder flies war banners on the board.'));
        T.set(v2 => { v2.largestArmy = { p: 0, count: 3 }; });
        T.vp(4);
        await T.wait(1800);
      },
      async T => {
        T.say(t('5 roads in a row: Longest Road, +2 points.'), t('Branches do not count, a foreign settlement breaks the road, and a longer road takes the title away.'));
        for (const e of trail.slice(1)) { T.road(e, 0); await T.wait(380); }
        T.set(v2 => { v2.longestRoad = { p: 0, len: 5, edges: trail.slice() }; });
        sfx.award();
        T.vp(6);
        await T.wait(1900);
      },
      async T => {
        T.say(t('Reach 10 points to win!'), t('Settlement 1 · City 2 · Longest Road 2 · Largest Army 2 · Victory point card 1. You win on your own turn.'));
        await T.countVp(10);
        await T.finale();
      },
    ],
  };
}
