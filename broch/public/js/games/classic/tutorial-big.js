// The tutorial chapter of the 5–6 player expansion of the classic family: two players share every turn (stone 1 and stone 2).
// The engine (addChapter, the T toolbox, the player) is core/tutorial.js.
import { addChapter, hAt, vAt, eAt, baseView, sevenTiles } from '../../core/tutorial.js';
import { t } from '../../core/core.js';

addChapter({ id: 'big', name: '5–6 player expansion', color: '#2E6B45', build: big });

function big() {
  const B = sevenTiles();
  const v = baseView(B, { robber: hAt(B, -1, 0) });
  const spots = [[0, -1, 0], [0, 1, 1], [1.732, -1, 2], [-2.598, -0.5, 3]];
  spots.forEach(([x, y, p]) => { v.buildings[vAt(B, x, y)] = { p, type: 'settlement' }; });
  v.players = [{ color: 'red' }, { color: 'blue' }, { color: 'orange' }, { color: 'white' }, { color: 'teal' }, { color: 'purple' }];
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('5–6 player expansion'), t('A bigger board with more tiles, harbors and cards for up to 6 players.'));
        await T.wait(2600);
      },
      async T => {
        T.say(t('Two players share every turn'), t('Stone 1 rolls the dice for everybody, trades with everybody, builds and may play 1 development card.'));
        T.turnChip(0);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Then stone 2 plays, three seats to the left'), t('No dice and no trading with players, only with the bank. Build, buy and play 1 development card.'));
        T.turnChip(3);
        await T.wait(500);
        T.road(eAt(B, vAt(B, -2.598, -0.5), vAt(B, -2.598, 0.5)), 3);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Then both stones move one seat to the left.'), t('The next turn belongs to the next pair.'));
        T.turnChip(1);
        await T.wait(1100);
        T.turnChip(4);
        await T.wait(1100);
        T.turnChip(null);
        await T.wait(600);
      },
      async T => {
        T.say(t('So nobody waits long.'), t('Turns stay short, even at a full table. Both players of a turn can win it; if both reach the goal, stone 1 wins.'));
        await T.wait(1800);
        await T.finale();
      },
    ],
  };
}
