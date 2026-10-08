// How to play Explorers & Pirates: a short interactive chapter for the tutorial player (tutorial.js).
// A small sea with a start island, the council's base and a few undiscovered fields plays the book's ideas one by one.
import { addChapter, hAt, vAt, eAt, baseView, geometry } from '../../core/tutorial.js';
import { t } from '../../core/core.js';
import { sfx } from '../../core/fx.js';

const pill = (icon, text) => `<span class="te">${text}</span>`;

function explorers() {
  const B = geometry([
    { q: 0, r: 0, t: 'forest', n: 8 }, { q: -1, r: 0, t: 'pasture', n: 5 }, { q: -1, r: 1, t: 'hills', n: 6 }, { q: 0, r: 1, t: 'fields', n: 9 }, { q: 0, r: -1, t: 'mountains', n: 10 },
    { q: 1, r: 0, t: 'sea' }, { q: 1, r: -1, t: 'sea' }, { q: 1, r: 1, t: 'sea' }, { q: 2, r: -1, t: 'sea' },
    { q: 2, r: 0, t: 'fog' }, { q: 2, r: 1, t: 'fog' }, { q: 3, r: 0, t: 'fog' }, { q: 3, r: -1, t: 'fog' },
  ]);
  B.harbors = []; B.circles = [];
  const hex = (q, r) => B.hexes[hAt(B, q, r)];
  // the council's base is the sea field next to the island, with two harbors
  const council = hex(1, -1);
  council.council = true;
  B.harbors = [vAt(B, 0.866, -2.5), vAt(B, 0.866, -0.5)];
  ['fog'].forEach(() => { [hex(2, 0), hex(2, 1), hex(3, 0), hex(3, -1)].forEach(h => { h.region = 'N'; h.hidden = true; }); });
  const H = vAt(B, 0.866, 0.5), S = vAt(B, 0, -1), Hb = vAt(B, 1.732, 2);
  const mid = vAt(B, 1.732, 1), tip = vAt(B, 2.598, 0.5);
  const e1 = eAt(B, H, mid), e2 = eAt(B, mid, tip);
  const eb = eAt(B, Hb, vAt(B, 2.598, 2.5));
  const toCouncil = eAt(B, vAt(B, 0.866, -0.5), vAt(B, 1.732, -1));
  const mount = hAt(B, 2, 0), fishHex = hAt(B, 2, 1), spiceHex = hAt(B, 3, 0), goldHex = hAt(B, 3, -1);
  const v = baseView(B, {
    mode: 'explorers', options: { missions: ['lairs', 'fish', 'spice'], units: true, scenario: 5 },
    exp: { ships: { 1: { id: 1, p: 0, e: e1, cargo: [{ t: 'E' }], mp: 4 }, 2: { id: 2, p: 1, e: eb, cargo: [{ t: 'E' }], mp: 4 } }, neutral: { verts: [], roads: [] }, pirate: { hex: null, owner: null }, tracks: {}, fishLeft: 6 },
  });
  v.players = [{ color: 'red', name: '' }, { color: 'blue', name: '' }, { color: 'orange', name: '' }];
  v.buildings[S] = { p: 0, type: 'settlement' };
  v.buildings[H] = { p: 0, type: 'harbor', cargo: [] };
  v.buildings[Hb] = { p: 1, type: 'harbor', cargo: [] };
  const ship = fn => T => T.set(x => fn(x.exp.ships[1], x));
  const track = (T, text) => T.extra(`${pill('', text)}`);
  return {
    view: v, vpTarget: 12,
    steps: [
      async T => {
        T.say(t('Explorers & Pirates'), t('Sail into the unknown. Discover land, found settlements and win the missions. The point goal depends on the scenario, from 8 to 17.'));
        T.vp(3);
        await T.wait(2600);
      },
      async T => {
        T.say(t('You start with ships.'), t('A harbor settlement (2 points), a settlement and a ship with an explorer. There are no cities, development cards or robber, and no harbors for trading.'));
        T.glow([hAt(B, 0, 0), hAt(B, 0, 1)]);
        await T.wait(3200);
      },
      async T => {
        T.say(t('A turn has three phases.'), t('Income (roll the dice), then trade and build, then the movement phase for your ships. Once you start to sail, you cannot trade or build any more.'));
        track(T, `${t('Income')} › ${t('Trade and build')} › ${t('Movement phase')}`);
        await T.wait(3600);
        track(T, '');
      },
      async T => {
        T.say(t('Ships move 4 spaces a turn.'), t('Tap the glowing sea path. A ship sails from path to path along the coast and between the fields. For 1 wool it gets 2 more moves, once per turn.'));
        track(T, `4 ${t('moves')}`);
        await T.tap({ edges: [e2] });
        ship(sh => { sh.e = e2; sh.mp = 3; })(T);
        sfx.sail();
        await T.wait(700);
      },
      async T => {
        T.say(t('Discover the fog with a ship.'), t('A ship that points at an undiscovered field uncovers it. Land pays a resource of its kind, any other field 2 gold. A discovery ends the move.'));
        T.reveal(mount, 'mountains', 4);
        sfx.reveal();
        track(T, '');
        await T.wait(700);
        await T.gain(T.hexPt(mount), 'ore', 1, 0);
        T.float(T.hexPt(fishHex), '+2', '#F6CF57');
        await T.wait(900);
      },
      async T => {
        T.say(t('An explorer founds a settlement.'), t('The ship points at a corner of the new land: ship and explorer go back to the supply and a settlement stands there for free. Roads cannot cross the sea.'));
        await T.tap({ vertices: [tip] });
        T.set(x => { delete x.exp.ships[1]; x.buildings[tip] = { p: 0, type: 'settlement' }; }, { verts: [tip] });
        sfx.place();
        T.vp(4);
        await T.wait(1000);
      },
      async T => {
        T.say(t('Harbor settlements hold a basin.'), t('Upgrade a coastal settlement for 2 grain and 2 ore: 2 points instead of 1, still 1 card per tile. Ships are built next to a harbor settlement; new explorers and units wait in its basin for a ship.'));
        await T.give({ grain: 2, ore: 1 });
        await T.pay({ grain: 2, ore: 2 }, T.vertPt(tip));
        T.set(x => { x.buildings[tip] = { p: 0, type: 'harbor', cargo: [{ t: 'U' }] }; }, { verts: [tip] });
        T.vp(5);
        await T.wait(1200);
      },
      async T => {
        T.say(t('No income? You get gold.'), t('If a roll (not a 7) gives you no resources, you get 1 gold. 3 identical resources buy 1 resource or 1 gold; 2 gold buy a resource, twice per turn.'));
        await T.roll(2, 3);
        T.hit(5);
        await T.gain(T.pt(0, -1.2), 'gold', 1, 0);
        await T.give({ lumber: 3 });
        await T.bankTrade({ lumber: 3 }, 'wool');
        await T.wait(900);
      },
      async T => {
        T.say(t('The Pirate Lairs'), t('Gold rivers hide pirate lairs. Ships land units on a lair; with 3 units it falls: everybody who helped gets 2 gold and a step on the track, the best fighter one more.'));
        T.set(x => { const h = x.board.hexes[goldHex]; h.terrain = 'goldriver'; h.number = null; h.lair = { number: 8, units: { 0: 2 }, conquered: false }; x.exp.tracks = { lairs: { pos: [0, 0, 0], at: [0, 0, 0], holder: null, values: [0, 1, 1, 2, 2, 2, 3, 3] } }; }, { hexes: [goldHex] });
        sfx.reveal();
        await T.wait(1400);
        T.set(x => { x.board.hexes[goldHex].lair.units = { 0: 2, 1: 1 }; });
        sfx.thud();
        await T.wait(900);
        await T.banner(t('The lair is conquered!'), '');
        T.set(x => { const h = x.board.hexes[goldHex]; h.number = 8; h.lair.conquered = true; h.units = { 1: 1 }; });
        await T.gain(T.hexPt(goldHex), 'gold', 2, 0);
        track(T, `${t('Pirate lairs')} 2/7`);
        T.vp(7);
        await T.wait(1100);
      },
      async T => {
        T.say(t('Fish for Broch'), t('Once per turn, in the movement phase, roll a die: if it shows the number of a fishing ground, a swarm appears there. A ship catches it and brings it to a harbor of the council for a step on the track.'));
        T.set(x => { const h = x.board.hexes[fishHex]; h.terrain = 'sea'; h.fish = true; h.die = 3; h.swarm = false; });
        sfx.reveal();
        await T.wait(1000);
        await T.roll(3, 3);
        T.set(x => { x.board.hexes[fishHex].swarm = true; });
        sfx.gain();
        await T.wait(900);
        T.set(x => { x.exp.ships[3] = { id: 3, p: 0, e: eAt(B, vAt(B, 3.464, 1), vAt(B, 3.464, 2)), cargo: [{ t: 'F' }], mp: 3 }; x.board.hexes[fishHex].swarm = false; });
        await T.wait(900);
        T.set(x => { x.exp.ships[3].e = toCouncil; });
        sfx.sail();
        await T.wait(800);
        T.set(x => { x.exp.ships[3].cargo = []; x.exp.tracks.fish = { pos: [1, 0, 0], at: [1, 0, 0], holder: 0, values: [0, 1, 1, 2, 2, 2, 3, 3] }; });
        T.float(T.vertPt(B.harbors[1]), '+1', '#F6CF57');
        sfx.award();
        track(T, `${t('Fish for Broch')} 1/7`);
        T.vp(9);
        await T.wait(1000);
      },
      async T => {
        T.say(t('Spices for Broch'), t('A unit stays in a spice village: you become friends, get a bag of spice and the village’s advantage, for example 1 more move for every ship. Bring the spice to a harbor of the council.'));
        T.set(x => { const h = x.board.hexes[spiceHex]; h.terrain = 'spice'; h.village = { kind: 'fast', bags: 3, friends: [] }; });
        sfx.reveal();
        await T.wait(1200);
        T.set(x => { const h = x.board.hexes[spiceHex]; h.village.friends = [0]; h.village.bags = 2; x.exp.ships[3].cargo = [{ t: 'S' }]; });
        sfx.gain();
        track(T, `5 ${t('moves')}`);
        await T.wait(1500);
        T.set(x => { x.exp.ships[3].cargo = []; x.exp.tracks.spice = { pos: [1, 0, 0], at: [2, 0, 0], holder: 0, values: [0, 1, 1, 2, 2, 3, 3] }; });
        T.float(T.vertPt(B.harbors[1]), '+1', '#F6CF57');
        sfx.award();
        T.vp(11);
        await T.wait(1100);
      },
      async T => {
        T.say(t('Pirates ask for tribute.'), t('On a 7, players with more than 7 cards discard half; then the roller sets a pirate ship and takes a card from a ship next to it. Foreign pirates ask 1 gold per ship and turn; a ship that has not moved can chase them with a 6.'));
        await T.roll(3, 4);
        T.set(x => { x.exp.pirate = { hex: hAt(B, 1, 1), owner: 1 }; });
        sfx.pirate();
        await T.wait(2400);
      },
      async T => {
        T.say(t('5–6 player expansion'), t('5–6 players: ship 1 rolls and trades, ship 2 only builds and moves. Both tokens pass to the left.'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('Reach the goal!'), t('Settlements 1 point, harbor settlements 2, every mission track its points, and the furthest marker of a mission gets a special point. The first to the goal on their own turn wins.'));
        await T.countVp(12);
        await T.finale();
      },
    ],
  };
}
addChapter({ id: 'explorers', name: 'Explorers & Pirates', color: '#4A3A6E', build: explorers });
