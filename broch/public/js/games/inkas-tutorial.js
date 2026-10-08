// How to play Rise of the Inkas: a short interactive chapter for the tutorial player (tutorial.js).
import { addChapter, addHandKeys, hAt, vAt, baseView, geometry } from '../tutorial.js';
import { t, esc, glyph } from '../core.js';
import { sfx } from '../fx.js';

addHandKeys(['catch', 'feathers', 'coca', 'nugget']);

const pill = (icon, text, cls = '') => `<span class="te ${cls}">${glyph(icon, 15)}${esc(text)}</span>`;
const env = ({ era = 'I', left = 4, thickets = 0 }) => `${pill('sun', era, 'green')}${pill('tribute', left)}${thickets ? pill('thicket', thickets, 'brown') : ''}`;

function inkas() {
  const B = geometry([
    { q: 0, r: 0, t: 'forest', n: 8 }, { q: 1, r: 0, t: 'pasture', n: 5 }, { q: 0, r: 1, t: 'mountains', n: 10 }, { q: -1, r: 1, t: 'fields', n: 4 },
    { q: -1, r: 0, t: 'desert' }, { q: 0, r: -1, t: 'hills', n: 6 }, { q: 1, r: -1, t: 'fields', n: 9 },
  ]);
  const C = hAt(B, 0, 0), coast = hAt(B, 1, -1), hills = hAt(B, 0, -1), peaks = hAt(B, 0, 1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const v = baseView(B, { mode: 'inkas', inkas: { era: 0, left: 4, thickets: [], claims: [], ending: null } });
  v.buildings[home] = { p: 0, type: 'city' };
  v.buildings[foe] = { p: 1, type: 'settlement' };
  const left = n => T => T.set(x => { x.inkas.left = n; });
  return {
    view: v, vpTarget: 6,
    steps: [
      async T => {
        T.say(t('Welcome to Rise of the Inkas!'), t('Three eras, one goal: culture tokens. Six of the 11 tokens win.'));
        T.vp(0); T.extra(env({}));
        await T.wait(2400);
      },
      async T => {
        T.say(t('Four goods.'), t('Fish from the coast, feathers from the rainforest, coca from the highlands and gold from the peaks.'));
        T.glow([coast, C, hills, peaks]);
        await T.wait(2000);
        await T.roll(3, 5);
        T.hit(8);
        await Promise.all([T.gain(T.hexPt(C), 'feathers', 2, 0, home), T.gain(T.hexPt(hills), 'coca', 2, 0, home, 200)]);
        await T.wait(700);
      },
      async T => {
        T.say(t('Bring a tribute.'), t('Once per turn, bring the era’s whole set: 1 fish, 1 feathers and 1 coca.'));
        await T.give({ catch: 1, feathers: 1, coca: 1 });
        await T.wait(900);
        await T.pay({ catch: 1, feathers: 1, coca: 1 }, T.vertPt(home));
        left(3)(T); T.extra(env({ left: 3 }));
        sfx.award();
        T.vp(1);
        await T.banner(t('Culture token!'), '');
        await T.wait(900);
      },
      async T => {
        T.say(t('Gold stands in for any good.'), t('Missing a fish? One gold takes its place.'));
        await T.give({ feathers: 1, coca: 1, nugget: 1 });
        await T.wait(900);
        await T.pay({ feathers: 1, coca: 1, nugget: 1 }, T.vertPt(home));
        left(2)(T); T.extra(env({ left: 2 }));
        sfx.award();
        T.vp(2);
        await T.wait(1400);
      },
      async T => {
        T.say(t('A 7 lets the jungle grow.'), t('The roller puts a thicket on a tile and takes a card from a neighbour.'));
        await T.roll(3, 4);
        T.set(x => { x.inkas.thickets = [hills]; }, { thickets: [hills] });
        T.extra(env({ left: 2, thickets: 1 }));
        sfx.leaf();
        await T.steal(foe, 'coca');
        await T.wait(900);
      },
      async T => {
        T.say(t('Thickets block their tiles.'), t('Clear one with 1 feathers and 1 coca, from a camp or village next to it.'));
        T.hit(6);
        await T.give({ feathers: 1 });
        await T.pay({ feathers: 1, coca: 1 }, T.hexPt(hills));
        T.set(x => { x.inkas.thickets = []; });
        T.extra(env({ left: 2 }));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Eras end when their tokens are gone.'), t('Villages shrink to camps and the jungle claims the land. A new tribe rises.'));
        left(0)(T);
        await T.wait(1300);
        T.set(x => { x.buildings[home].type = 'settlement'; x.inkas.era = 1; x.inkas.left = 4; x.inkas.thickets = [coast]; }, { thickets: [coast] });
        sfx.drums();
        T.extra(env({ era: 'II', left: 4, thickets: 1 }));
        await T.banner(t('Moche'), 'red');
        await T.wait(1300);
      },
      async T => {
        T.say(t('Every era has its own rule.'), t('Moche: the fisheries pay. Camps on the coast get 1 extra fish.'));
        T.set(x => { x.inkas.thickets = []; });
        await T.roll(4, 5);
        T.hit(9);
        await Promise.all([T.gain(T.hexPt(coast), 'catch', 2, 0, home)]);
        T.extra(env({ era: 'II', left: 4 }));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Six culture tokens win!'), t('Or the most tokens when the last era ends.'));
        await T.countVp(6);
        await T.finale();
      },
    ],
  };
}

addChapter({ id: 'inkas', name: 'Rise of the Inkas', color: '#C9971B', build: inkas });
