// How to play Dawn of Humankind: a short interactive chapter for the tutorial player (tutorial.js).
import { addChapter, addHandKeys, hAt, vAt, eAt, baseView, geometry } from '../tutorial.js';
import { t, esc, glyph } from '../core.js';
import { sfx } from '../fx.js';

addHandKeys(['meat', 'hide', 'flint', 'bone']);

const pill = (icon, text, cls = '') => `<span class="te ${cls}">${glyph(icon, 15)}${esc(text)}</span>`;
const env = ({ hidden = 2, tools = 0, ideas = 0 }) => `${pill('explore', hidden, hidden ? 'brown' : 'green')}${tools ? pill('tools', `${tools}/3`, 'green') : ''}${ideas ? pill('idea', ideas, 'green') : ''}`;

function humankind() {
  const B = geometry([
    { q: 0, r: 0, t: 'forest', n: 8 }, { q: 1, r: 0, t: 'pasture', n: 5 }, { q: 0, r: 1, t: 'fog' }, { q: -1, r: 1, t: 'fields', n: 4 },
    { q: -1, r: 0, t: 'desert' }, { q: 0, r: -1, t: 'hills', n: 6 }, { q: 1, r: -1, t: 'fog' },
  ]);
  const C = hAt(B, 0, 0), desert = hAt(B, -1, 0), fogA = hAt(B, 1, -1), fogB = hAt(B, 0, 1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const out = vAt(B, 0.866, -0.5);
  const trail = eAt(B, home, out);
  const v = baseView(B, { mode: 'humankind', humankind: { beast: desert, hidden: 2, finds: [], pathfinder: null } });
  v.buildings[home] = { p: 0, type: 'settlement' };
  v.buildings[foe] = { p: 1, type: 'settlement' };
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Welcome to Dawn of Humankind!'), t('Explore the mist, hunt and grow. The first to 10 points wins.'));
        T.vp(1); T.extra(env({}));
        await T.wait(2200);
      },
      async T => {
        T.say(t('The world is hidden in the mist.'), t('Only tiles next to your camps and trails are revealed, and only they pay.'));
        T.glow([fogA, fogB]);
        await T.wait(2400);
      },
      async T => {
        T.say(t('Roll the dice and hunt.'), t('Tap the dice.'));
        await T.tap({ dice: true });
        await T.roll(3, 5);
        T.hit(8);
        T.say(t('Every revealed tile with that number pays.'), t('Camps get 1 card, villages 2.'));
        await T.gain(T.hexPt(C), 'hide', 1, 0, home);
        await T.wait(900);
      },
      async T => {
        T.say(t('Trails lift the mist.'), t('A trail costs 1 hide and 1 flint. Tap the glowing edge.'));
        await T.give({ hide: 1, flint: 1 });
        await T.tap({ edges: [trail] });
        await T.pay({ hide: 1, flint: 1 }, T.edgePt(trail));
        T.road(trail, 0);
        await T.wait(500);
        T.reveal(fogA, 'mountains', 10);
        T.set(x => { x.humankind.hidden = 1; });
        T.extra(env({ hidden: 1 }));
        sfx.reveal();
        await T.wait(900);
      },
      async T => {
        T.say(t('Every new land hides a find.'), t('Here is a rich hunting ground: 2 cards.'));
        await Promise.all([T.gain(T.hexPt(fogA), 'bone', 1, 0), T.gain(T.hexPt(fogA), 'bone', 1, 0, null, 220)]);
        await T.banner(t('Rich land'), 'gold');
        T.say(t('Other finds: a herd, a bright idea, or a sleeping Smilodon.'), t('A bright idea makes your next progress step cheaper.'));
        T.extra(env({ hidden: 1, ideas: 1 }));
        await T.wait(2200);
      },
      async T => {
        T.say(t('Grow a camp into a village.'), t('A village costs 2 meat and 3 bone, scores 2 points and pays twice.'));
        await T.give({ meat: 2, bone: 1 });
        await T.tap({ vertices: [home] });
        await T.pay({ meat: 2, bone: 3 }, T.vertPt(home));
        T.build(home, 'city', 0);
        T.vp(2);
        await T.wait(900);
      },
      async T => {
        T.say(t('Four progress tracks.'), t('Fire, Tools, Language and Art. Each step costs more of the track’s own resource.'));
        await T.wait(1600);
        await T.give({ flint: 1 });
        await T.pay({ flint: 1 }, T.vertPt(home));
        T.extra(env({ hidden: 1, tools: 1 }));
        sfx.award();
        await T.banner(t('Tools 1/3'), 'gold');
        T.say(t('Tools: trails now cost only 1 hide.'), t('Fire raises your hand limit, Language improves the bank, Art scores points.'));
        await T.wait(2400);
      },
      async T => {
        T.say(t('A 7 sends the Smilodon prowling.'), t('Whoever rolls it moves the beast onto a tile. That tile stops paying and the roller steals a card.'));
        await T.roll(3, 4);
        T.set(x => { x.humankind.beast = fogA; }, { beast: true });
        sfx.roar();
        await T.wait(900);
        await T.steal(foe, 'meat');
        await T.wait(900);
      },
      async T => {
        T.say(t('Reach 10 points to win!'), t('Camp 1 · Village 2 · Longest Trail 2 · Pathfinder 2 · Progress up to 6'));
        await T.countVp(10);
        await T.finale();
      },
    ],
  };
}

addChapter({ id: 'humankind', name: 'Dawn of Humankind', color: '#B9692E', build: humankind });
