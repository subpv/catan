// The tutorial chapter of Traders & Barbarians: Fishermen, Rivers, Merchant Trains, Barbarian Attack and the wagon scenario.
// The engine (addChapter, the T toolbox, the player) is core/tutorial.js.
import { addChapter, hAt, vAt, eAt, baseView, sevenTiles } from '../../core/tutorial.js';
import { t } from '../../core/core.js';
import { sfx } from '../../core/fx.js';

addChapter({ id: 'traders', name: 'Traders & Barbarians', color: '#B9851F', build: traders });

function traders() {
  const B = sevenTiles({ '0,1': { t: 'river', n: null }, '-1,1': { t: 'river', n: null } });
  const NE = hAt(B, 1, -1), W = hAt(B, -1, 0), SE = hAt(B, 0, 1), SW = hAt(B, -1, 1);
  const top = vAt(B, 0.866, -2.5), right = vAt(B, 1.732, -2);
  const g1 = { id: 0, number: 5, verts: [top, right] };
  const [a, b] = [B.vertices[top], B.vertices[right]];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = B.hexes[NE];
  const d = Math.hypot(mx - h.x, my - h.y);
  g1.x = +(mx + (mx - h.x) / d * 0.62).toFixed(3); g1.y = +(my + (my - h.y) / d * 0.62).toFixed(3);
  B.fishing = [];
  const riverHome = vAt(B, 0.866, 0.5), riverRoad = eAt(B, riverHome, vAt(B, 0, 1)), bridge = eAt(B, vAt(B, 0, 1), vAt(B, 0, 2));
  const v = baseView(B, { expansion: 'traders' });
  v.buildings[top] = { p: 0, type: 'settlement' };
  v.buildings[vAt(B, -1.732, -1)] = { p: 1, type: 'settlement' };
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Traders & Barbarians'), t('Pick one scenario: Fishermen, Rivers, Merchant Trains, Barbarian Attack or Traders & Barbarians. Variants mix in.'));
        T.vp(1);
        await T.wait(2600);
      },
      async T => {
        T.say(t('Fishermen'), t('The desert becomes a lake and the coast gets fishing grounds.'));
        T.set(v2 => { v2.fishing = true; v2.board.fishing = [g1]; });
        T.glow([W]);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Roll a fishing ground’s number to catch fish.'), t('A settlement gets 1 random token, a city 2. The lake pays on 2, 3, 11 and 12. Your second settlement next to a ground or the lake earns a token at once.'));
        await T.roll(1, 4);
        T.hit(5);
        await T.gain(T.pt(g1.x, g1.y), 'fish', 2, 0, top);
        await T.wait(1100);
      },
      async T => {
        T.say(t('Pay with fish'), t('2 take the robber off the board · 3 steal · 4 take a resource · 5 a road · 7 a development card. Extra fish are lost. At most 7 tokens, and they can be neither stolen nor traded.'));
        await T.fishMenu();
        await T.wait(1200);
      },
      async T => {
        T.say(t('The old boot'), t('Whoever fishes it up needs one more point to win, and may hand it on to a player with as many points or more.'));
        T.set(v2 => { v2.fish = { boot: 0 }; });
        await T.wait(1600);
        T.set(v2 => { v2.fish = { boot: 1 }; });
        sfx.steal();
        await T.wait(1400);
      },
      async T => {
        T.say(t('Rivers'), t('Every road or settlement next to a river earns 1 gold.'));
        T.set(v2 => { v2.fishing = false; v2.fish = null; v2.board.fishing = []; });
        T.glow([SE, SW]);
        await T.tap({ vertices: [riverHome] });
        T.build(riverHome, 'settlement', 0);
        await T.gain(T.vertPt(riverHome), 'gold', 1, 0);
        T.road(riverRoad, 0);
        await T.gain(T.edgePt(riverRoad), 'gold', 1, 0);
        await T.wait(700);
      },
      async T => {
        T.say(t('Bridges cross the river.'), t('Roads cannot cross a river. A bridge costs 2 brick and 1 lumber, pays 3 gold, and you have 3 of them.'));
        await T.give({ brick: 2, lumber: 1 });
        await T.pay({ brick: 2, lumber: 1 }, T.edgePt(bridge));
        T.set(v2 => { v2.roads[bridge] = 0; v2.bridges[bridge] = true; }, { edges: [bridge] });
        if (!T.fast) sfx.road();
        await T.gain(T.edgePt(bridge), 'gold', 3, 0);
        await T.wait(900);
      },
      async T => {
        T.say(t('Gold'), t('Swap 2 gold for any resource, twice per turn. Gold also counts in trades with players, who may answer with a counter-offer, and you can buy it from the supply at 4:1, 3:1 or 2:1. The one player with the most gold gets +1 point, everyone with the least −2.'));
        await T.bankTrade({ gold: 2 }, 'ore');
        T.float(T.vertPt(riverHome), '+1', '#F6CF57');
        await T.wait(1500);
      },
      async T => {
        T.say(t('Event cards'), t('A deck of 37 cards replaces the dice. Every number comes up as often as it should, and some cards bring an event. The New Year card shuffles a fresh deck.'));
        await T.eventCard(8, t('Epidemic'));
        T.hit(8);
        await T.wait(1400);
      },
      async T => {
        T.say(t('Merchant Trains'), t('Nomads at the watering hole send out trade wagons. If you build a settlement or city, a voting round at the end of your turn decides where the next wagon goes. 12 points.'));
        await T.banner(t('Merchant Trains'));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Voting round'), t('Starting with the active player, everybody may bid wool and/or grain: 1 vote per card, all to one place. One player with more votes than all others together decides alone. Otherwise the place with the most votes wins, then the player with the most votes decides, then the active player.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('How trains grow'), t('A wagon starts a train at one of the arrows of the watering hole or goes in front of an existing train. Trains never branch, they merge where they meet and end when they cannot go on.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Wagons pay off'), t('Buildings between two wagons are worth 1 point more. A wagon on the same edge as a road counts as an additional road for the Longest Road. With 5–6 players there are two watering holes and player 2 holds a voting round too.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Barbarian Attack'), t('Barbarians land on the coast after every settlement or city. Knights from the castle drive them off, and 2 prisoners are worth 1 point. You start with a city and there is no robber. 12 points.'));
        await T.banner(t('Barbarians'));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Barbarians land'), t('After each house you build, roll the dice up to 3 times, each time a new number that is not a 7. Every number puts 1 barbarian on the coast tile with that number. 3 barbarians conquer a tile: no yield, no building there, and houses that touch only conquered tiles give no points and no harbor.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Knights drive them off'), t('At the end of your turn move each knight up to 3 paths, or 5 for 1 grain; knights on the castle must leave it. Where there are more knights than barbarians, the tile is free and the barbarians become prisoners; a die then decides which of the knights there are lost (3 gold each).'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Development cards'), t('Knights come from development cards, played at once: Knighthood puts a knight on a castle path, Swift Knight on any free path, Capture takes a prisoner, Treason brings 2 gold and moves 2 barbarians. On a 7 you steal a card from a player of your choice.'));
        await T.wait(3600);
      },
      async T => {
        T.say(t('Barbarian Attack for 5–6 players'), t('The board has two castles, and the numbers 5 and 9 each sit on two coast tiles, so both get a barbarian. The second player of the pair builds, trades with the bank and drives the barbarians off as well.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Traders & Barbarians'), t('Haul glass, marble, sand and tools with your wagon for points and gold. You start with a city and 5 gold, and a 2 or 12 is rolled again. 13 points.'));
        await T.banner(t('Wagons'));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Move your wagon'), t('At the end of your turn you have 4 movement points. A path costs 2, your own road 1, another player’s road 1 and 1 gold for its owner, a barbarian on the way 2 more. 1 grain gives 2 more movement points, once per turn.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Pick up and deliver'), t('In the middle of a commodity hex you pick up a token or deliver yours: 1 point and 1 to 5 gold, by wagon level. The quarry needs tools, the glassworks sand, the castle marble and glass.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Upgrade your wagon'), t('Pay 1 lumber, 1 wool and 1 ore (2 lumber for the last two upgrades) to move the cube: more movement points, better chances against barbarians and more gold per delivery. The full upgrade is worth 1 point.'));
        await T.wait(3400);
      },
      async T => {
        T.say(t('Barbarians'), t('From the second wagon level on, roll a die in front of a barbarian: 6 at level 2, 5–6 at level 3, 4–6 at level 4, 3–6 at level 5. A 7 or a knight card moves a barbarian; on a road you draw a card from its owner.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Five or six players'), t('The wagon island has 37 tiles and 7 commodity hexes; five of them have six paths. The 2 and the 12 are on the board again.'));
        await T.wait(2800);
      },
      async T => {
        T.say(t('Variants'), t('The friendly robber spares players with 2 points or fewer. Harbors of Broch: buildings at harbors count 1 (a city 2); the first with 3 or the most holds a tile worth 2 points, and everybody needs 1 more point to win.'));
        await T.wait(2400);
        await T.finale();
      },
    ],
  };
}
