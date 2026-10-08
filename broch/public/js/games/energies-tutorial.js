// How to play New Energies: a short interactive chapter for the tutorial player (tutorial.js).
import { addChapter, addHandKeys, hAt, vAt, baseView, sevenTiles } from '../tutorial.js';
import { t, esc, glyph } from '../core.js';
import { sfx } from '../fx.js';

addHandKeys(['science', 'energy']);

const pill = (icon, text, cls = '') => `<span class="te ${cls}">${glyph(icon, 15)}${esc(text)}</span>`;
const env = ({ gf = 0, bag = 110, hz = 0 }) => `${pill('footprint', gf, gf >= 4 ? 'warn' : gf ? 'brown' : '')}${pill('bag', bag)}${hz ? pill('hazard', hz, 'warn') : ''}`;

function energies() {
  const B = sevenTiles();
  const C = hAt(B, 0, 0), NW = hAt(B, 0, -1);
  const home = vAt(B, 0, -1), foe = vAt(B, 0, 1);
  const v = baseView(B, { mode: 'energies', plants: [] });
  v.buildings[home] = { p: 0, type: 'settlement' };
  v.buildings[foe] = { p: 1, type: 'settlement' };
  const plant = (id, kind, hex) => ({ id, p: 0, kind, v: home, hex, hazard: false });
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Welcome to New Energies!'), t('Grow, build power plants and keep the world clean. The first to 10 points wins.'));
        T.vp(1); T.extra(env({}));
        await T.wait(2200);
      },
      async T => {
        T.say(t('Every turn starts with events.'), t('A disc is drawn from the bag. The dirtier the world, the more discs.'));
        await T.wait(700);
        await T.bigCard({ title: t('Smog'), color: '#6B4A2E', icon: 'footprint' });
        T.extra(env({ bag: 109 }));
        T.say(t('Brown discs hurt: smog, blackouts, droughts.'), t('Green discs help. Hazards block everything they cover.'));
        await T.wait(2000);
      },
      async T => {
        T.say(t('Then roll the dice as usual.'), t('Tap the dice.'));
        await T.tap({ dice: true });
        await T.roll(3, 5);
        T.hit(8);
        T.say(t('Every tile with that number pays.'), t('Towns make 1 resource.'));
        await T.gain(T.hexPt(C), 'lumber', 1, 0, home);
        await T.wait(900);
      },
      async T => {
        T.say(t('Cities make science too.'), t('Upgrade a town with 2 grain and 3 ore. Tap your town.'));
        await T.give({ grain: 2, ore: 3 });
        await T.tap({ vertices: [home] });
        await T.pay({ grain: 2, ore: 3 }, T.vertPt(home));
        T.build(home, 'city', 0);
        T.vp(2);
        await T.wait(700);
        await T.roll(4, 4);
        T.hit(8);
        T.say(t('A city makes a resource and a science.'), t('Science builds power plants.'));
        await Promise.all([T.gain(T.hexPt(C), 'lumber', 1, 0, home), T.gain(T.hexPt(C), 'science', 1, 0, home, 200)]);
        await T.wait(900);
      },
      async T => {
        T.say(t('A fossil plant costs 1 science.'), t('Tap your city, then the tile for the plant.'));
        await T.tap({ vertices: [home] });
        await T.tap({ hexes: [C] });
        await T.pay({ science: 1 }, T.hexPt(C));
        T.set(x => { x.plants.push(plant(1, 'fossil', C)); }, { plants: [1] });
        sfx.place();
        T.extra(env({ gf: 1, bag: 109 }));
        T.say(t('Cheap, strong, but dirty.'), t('It makes 2 energy, and it grows the footprint.'));
        await T.wait(1800);
      },
      async T => {
        T.say(t('Plants pay when their tile’s number comes up.'));
        await T.roll(3, 5);
        T.hit(8);
        await Promise.all([T.gain(T.hexPt(C), 'energy', 2, 0, home), T.gain(T.hexPt(C), 'lumber', 1, 0, home, 160)]);
        await T.wait(1000);
      },
      async T => {
        T.say(t('A renewable plant costs 3 science.'), t('It makes 1 energy and cleans the footprint. Tap the city, then a tile.'));
        await T.give({ science: 3 });
        await T.tap({ vertices: [home] });
        await T.tap({ hexes: [NW] });
        await T.pay({ science: 3 }, T.hexPt(NW));
        T.set(x => { x.plants.push(plant(2, 'renewable', NW)); }, { plants: [2] });
        sfx.award();
        T.extra(env({ gf: 0, bag: 110 }));
        T.say(t('Every renewable plant adds a green disc to the bag.'), t('The cleaner the world, the better the events.'));
        await T.wait(2200);
      },
      async T => {
        T.say(t('Hazards block a building or plant.'), t('No resources, no energy, until it is cleared.'));
        T.set(x => { x.buildings[home].hazard = true; });
        T.extra(env({ gf: 0, bag: 110, hz: 1 }));
        await T.roll(2, 6);
        T.hit(8);
        await T.banner(t('Blocked!'), 'red');
        T.say(t('Clear it with 2 energy.'), t('Energy also swaps 2:1 for resources.'));
        await T.give({ energy: 2 });
        await T.pay({ energy: 2 }, T.vertPt(home));
        T.set(x => { x.buildings[home].hazard = false; });
        T.extra(env({ gf: 0, bag: 110 }));
        await T.wait(1200);
      },
      async T => {
        T.say(t('Two ways to win.'), t('10 points, or the greenest builder when the event bag runs dry.'));
        T.extra(env({ gf: 0, bag: 0 }));
        await T.wait(2200);
        T.say(t('Town 1 · City 2 · Longest Trade Route 2 · Cleanest environment 2'), t('If nobody built more renewable than fossil plants, everybody loses.'));
        await T.countVp(10);
        await T.finale();
      },
    ],
  };
}

addChapter({ id: 'energies', name: 'New Energies', color: '#2E9A5A', build: energies });
