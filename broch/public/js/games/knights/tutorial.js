// The tutorial chapter of Cities & Knights: commodities, city improvements, knights, barbarians and progress cards.
// The engine (addChapter, the T toolbox, the player) is core/tutorial.js.
import { addChapter, hAt, vAt, eAt, baseView, sevenTiles, TRACK } from '../../core/tutorial.js';
import { t } from '../../core/core.js';
import { sfx } from '../../core/fx.js';

addChapter({ id: 'knights', name: 'Cities & Knights', color: '#2C6E9B', build: knights });

function knights() {
  const B = sevenTiles();
  const C = hAt(B, 0, 0), NE = hAt(B, 1, -1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const kSpot = vAt(B, 0.866, -0.5);
  const road = eAt(B, home, kSpot);
  const v = baseView(B, { robber: hAt(B, -1, 0), mode: 'knights' });
  v.buildings[home] = { p: 0, type: 'city' };
  v.buildings[foe] = { p: 1, type: 'city' };
  v.roads[road] = 0;
  return {
    view: v, vpTarget: 13,
    steps: [
      async T => {
        T.say(t('Cities & Knights'), t('Like Classic, but with commodities, knights and barbarians instead of development cards and Largest Army. You start with a settlement and a city. 13 points win.'));
        T.vp(4);
        await T.wait(2800);
      },
      async T => {
        T.say(t('Cities make commodities.'), t('Forest: paper · Pasture: cloth · Mountains: coin'));
        await T.roll(5, 3, { event: 'trade' });
        T.hit(8);
        await Promise.all([T.gain(T.hexPt(C), 'lumber', 1, 0, home), T.gain(T.hexPt(C), 'paper', 1, 0, home, 240)]);
        await T.wait(1200);
      },
      async T => {
        T.say(t('Commodities buy city improvements.'), t('Trade costs cloth, politics coin, science paper: level 1 costs 1, level 2 costs 2, and so on. You need a city. Tap +.'));
        T.imp({ trade: 0, politics: 0, science: 0 });
        await T.give({ paper: 3 });
        await T.tap({ el: '.tut-imp [data-tr="science"]' });
        await T.impUp('science');
        await T.impUp('science');
        T.say(t('Level 3 unlocks a special power.'), t('Science (aqueduct): you choose a resource once and get it whenever a roll (not a 7) gives you nothing. Trade: commodities 2:1 at the bank. Politics: mighty knights.'));
        await T.give({ paper: 3 });
        await T.impUp('science');
        await T.wait(1300);
        T.say(t('First to level 4 raises a Metropolis.'), t('It is worth 2 points, sits on one of your cities that has none and is safe from the barbarians. A player who reaches level 5 before you can take it; at level 5 it is yours for good.'));
        await T.give({ paper: 4 });
        await T.impUp('science');
        T.set(v2 => { v2.buildings[home].metro = 'science'; }, { verts: [home] });
        sfx.award();
        T.vp(6);
        await T.wait(1600);
        T.imp(null);
      },
      async T => {
        T.say(t('Knights defend Broch.'), t('Recruit one for wool and ore. Tap a free corner next to your road.'));
        await T.give({ wool: 1, ore: 1 });
        await T.tap({ vertices: [kSpot] });
        await T.pay({ wool: 1, ore: 1 }, T.vertPt(kSpot));
        T.knight(kSpot, 0, 1, false);
        await T.wait(700);
        T.say(t('Activate it with grain.'), t('Only active knights fight. Promote them for wool and ore to make them stronger; mighty ones need politics level 3.'));
        await T.give({ grain: 1 });
        await T.pay({ grain: 1 }, T.vertPt(kSpot));
        T.knight(kSpot, 0, 1, true);
        await T.wait(800);
        await T.give({ wool: 1, ore: 1 });
        await T.pay({ wool: 1, ore: 1 }, T.vertPt(kSpot));
        T.knight(kSpot, 0, 2, true);
        await T.wait(1000);
      },
      async T => {
        T.say(t('Knights at work.'), t('An active knight can move along your roads, chase away a weaker enemy knight or drive off the robber, and is inactive afterwards. A knight activated this turn must wait for the next.'));
        await T.wait(2600);
        T.knight(kSpot, 0, 2, false);
        await T.wait(1200);
        T.knight(kSpot, 0, 2, true);
      },
      async T => {
        T.say(t('A ship on the event die moves the barbarians.'), t('Each ship brings them one step closer to Broch. Until they have landed once, a 7 cannot move the robber.'));
        T.barb(3);
        for (const [a, b] of [[2, 5], [6, 1], [4, 4]]) { await T.roll(a, b, { event: 'ship' }); T.barb(T.s.barb + 1); await T.wait(600); }
        await T.wait(500);
      },
      async T => {
        T.say(t('The barbarians attack!'), t('Their strength: the number of cities on the board. Your defense: the levels of all active knights (basic 1, strong 2, mighty 3). Afterwards every knight is inactive again.'));
        await T.roll(1, 2, { event: 'ship' });
        T.barb(7);
        await T.battle(2, 2);
        T.say(t('Repelled!'), t('The strongest defender earns a point; with a tie each draws a progress card. If the barbarians win, whoever defended least loses a city (cities with a metropolis are safe).'));
        T.vp(7);
        T.barb(0);
        await T.wait(2000);
      },
      async T => {
        T.say(t('Progress cards'), t('A coloured gate on the event die gives a progress card to players with that improvement if their red die is low enough: level 1 needs 1–2, level 2 needs 1–3, and so on. You may hold 4 cards; play them on your turn after rolling.'));
        await T.roll(2, 4, { event: 'science' });
        await T.bigCard({ title: t('Alchemist'), color: TRACK.science, icon: 'science' });
        await T.wait(600);
      },
      async T => {
        T.say(t('City walls'), t('A wall costs 2 brick and goes around one of your cities. Each wall lets you keep 2 more cards when a 7 is rolled.'));
        T.set(v2 => { v2.buildings[home].wall = true; }, { verts: [home] });
        sfx.place();
        await T.wait(2000);
      },
      async T => {
        T.say(t('Reach 13 points to win!'), t('Settlement 1 · City 2 · Metropolis 2 · Defender 1 · Longest Road 2 · Progress point card 1 · Merchant 1'));
        await T.countVp(13);
        await T.finale();
      },
    ],
  };
}
