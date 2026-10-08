// How to play Dawn of Humankind: a short interactive chapter for the tutorial player (core/tutorial.js). It runs on a small
// piece of the real world map (Africa and the south of Europe) and teaches the rules of the book step by step.
import { addChapter, addHandKeys } from '../../core/tutorial.js';
import { t, esc, glyph } from '../../core/core.js';
import { sfx } from '../../core/fx.js';

addHandKeys(['fur', 'bone', 'meat', 'flint']);

const SQ3 = Math.sqrt(3);
const CORNER = { E: 0, SE: 60, SW: 120, W: 180, NW: 240, NE: 300 };
const CORNERS = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
const TERRAIN = { W: 'forest', O: 'wasteland', G: 'grassland', B: 'mountains' };
// a window of the world: [column, row, landscape, chip, region] (same numbers as the real board)
const CELLS = [
  [0, 0, 'O', 3, 'africa'], [1, -1, 'B', 10, 'africa'], [1, 1, 'G', 4, 'africa'], [2, 0, 'O', 6, 'africa'], [2, 2, 'G', 12, 'africa'],
  [3, -1, 'O', 2, 'africa'], [3, 1, 'B', 9, 'africa'], [4, 2, 'G', 8, 'africa'],
  [4, -2, 'O', 4, 'europe'], [3, -3, 'W', 3, 'europe'], [4, -4, 'G', 9, 'europe'], [3, -5, 'G', 6, 'europe'], [4, -6, 'W', 10, 'europe'], [5, -3, 'B', 8, 'asia'], [5, -1, 'G', 11, 'europe'],
];
const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
function miniBoard() {
  const hexes = [], vertices = [], edges = [], vIndex = new Map(), eIndex = new Map();
  const vertexAt = (x, y) => {
    const k = key(x, y);
    if (!vIndex.has(k)) { vIndex.set(k, vertices.length); vertices.push({ id: vertices.length, x: +x.toFixed(3), y: +y.toFixed(3), kind: 'land', hexes: [], edges: [] }); }
    return vIndex.get(k);
  };
  const edgeOf = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!eIndex.has(k)) { eIndex.set(k, edges.length); edges.push({ id: edges.length, v: [Math.min(a, b), Math.max(a, b)] }); vertices[a].edges.push(edges.length - 1); vertices[b].edges.push(edges.length - 1); }
    return eIndex.get(k);
  };
  const ref = ([c, q, k]) => { const a = Math.PI / 180 * CORNER[k]; return vertexAt(1.5 * c + Math.cos(a), SQ3 / 2 * q + Math.sin(a)); };
  CELLS.forEach(([c, q, tt, n, region]) => {
    const h = { id: hexes.length, c, q, x: +(1.5 * c).toFixed(3), y: +(SQ3 / 2 * q).toFixed(3), terrain: TERRAIN[tt], number: n, dry: false, region, verts: [] };
    CORNERS.forEach(k => h.verts.push(ref([c, q, k])));
    h.verts.forEach(v => vertices[v].hexes.push(h.id));
    hexes.push(h);
  });
  const hexAt = (c, q) => hexes.find(h => h.c === c && h.q === q).id;
  const pk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  // the African border: no path across it
  const blocked = new Set();
  [[[3, -1], [3, -3]], [[3, -1], [4, -2]]].forEach(([a, b]) => {
    const A = hexes[hexAt(...a)], B = hexes[hexAt(...b)];
    const ks = h => h.verts.map((x, i) => pk(x, h.verts[(i + 1) % 6]));
    const other = new Set(ks(B));
    ks(A).forEach(k => { if (other.has(k)) blocked.add(k); });
  });
  hexes.forEach(h => h.verts.forEach((x, i) => { const y = h.verts[(i + 1) % 6]; if (!blocked.has(pk(x, y))) edgeOf(x, y); }));
  const border = [...blocked].map(k => k.split('-').map(Number));
  const starts = [[3, 1, 'E'], [2, 0, 'E'], [1, -1, 'E'], [0, 0, 'NW'], [0, 0, 'SW'], [1, 1, 'E'], [2, 2, 'E']].map(ref);
  const dfs = [{ id: 0, v: ref([4, -6, 'NW']), region: 'europe', kl: 1, ko: 2 }];
  return { hexes, vertices, edges, ports: [], border, starts, dfs, side: 4, ref, hexAt };
}

const pill = (icon, text, cls = '') => `<span class="te ${cls}">${glyph(icon, 15)}${esc(text)}</span>`;
const env = ({ cl = 0, co = 0, fo = 0, hu = 0 }) => `${pill('clothing', cl, cl ? 'green' : 'brown')}${pill('construction', co, co ? 'green' : 'brown')}${pill('food', fo, fo ? 'green' : 'brown')}${pill('hunt', hu, hu ? 'green' : 'brown')}`;

function humankind() {
  const B = miniBoard();
  const { ref, hexAt } = B;
  const camp = ref([2, 0, 'E']), camp2 = ref([3, 1, 'E']), camp3 = ref([1, -1, 'E']);
  const foe1 = ref([4, 2, 'E']), foe2 = ref([4, -4, 'SW']);
  const start = ref([2, 0, 'NE']);        // the first explorer
  const site = ref([3, -1, 'E']);          // a camp site tile (Europe) just outside Africa
  const stop1 = ref([3, -1, 'SE']);
  const site2 = ref([4, -2, 'E']);
  const C6 = hexAt(2, 0), EU = hexAt(4, -2), NEAND = hexAt(4, -4), AF = hexAt(1, -1);
  const v = {
    board: B, mode: 'humankind', expansion: 'none', me: 0, phase: 'play', current: 0, id: 'tut',
    players: [{ color: 'red', tracks: { clothing: 0, construction: 0, food: 0, hunt: 0 } }, { color: 'blue' }, { color: 'orange' }, { color: 'white' }],
    buildings: {}, roads: {}, knights: {}, ships: {}, bridges: {}, robber: null, pirate: null, merchant: null, lairs: [], islandBonus: {},
    fishing: false, fish: null, longestRoad: { p: null, len: 0 }, largestArmy: { p: null, count: 0 },
    humankind: {
      threats: { neanderthal: null, tiger: null }, explorers: [], sites: { [site]: 'europe', [site2]: 'europe' }, df: [{ id: 0, region: 'europe', taken: null }],
      jagd: [], marks: {}, special: { hunter: null, fastest: null, collectors: [] }, finds: [], range: 3,
    },
  };
  v.buildings[camp] = { p: 0, type: 'camp' }; v.buildings[camp2] = { p: 0, type: 'camp' }; v.buildings[camp3] = { p: 0, type: 'camp' };
  v.buildings[foe1] = { p: 1, type: 'camp' }; v.buildings[foe2] = { p: 1, type: 'camp' };
  v.humankind.explorers.push({ p: 0, v: start, moved: false });
  const moveTo = (T, to, via) => T.set(x => { x.humankind.explorers[0].v = to; x.humankind.explorers[0].moved = false; }, { explorers: [to] });
  return {
    view: v, vpTarget: 10,
    steps: [
      async T => {
        T.say(t('Welcome to Dawn of Humankind!'), t('Leave Africa, settle the world and collect 10 points. Everyone starts with 3 camps and 1 explorer in Africa, plus 1 fur and 1 bone.'));
        T.vp(0); T.extra(env({}));
        await T.wait(2600);
      },
      async T => {
        T.say(t('Roll the dice for the yields.'), t('Tap the dice.'));
        await T.tap({ dice: true });
        await T.roll(2, 4);
        T.hit(6);
        T.say(t('Camps harvest, explorers do not.'), t('Every camp next to the field with the rolled number gets 1 card: Forest gives fur, wasteland bone, grassland meat, mountains flint.'));
        await T.gain(T.hexPt(C6), 'bone', 1, 0, camp);
        await T.give({ fur: 1, meat: 1 });
        await T.wait(1300);
      },
      async T => {
        T.say(t('A new explorer costs fur and meat.'), t('1 fur and 1 meat put an explorer next to one of your camps. You may have 2 on the board, and each walks once per turn.'));
        await T.wait(3000);
      },
      async T => {
        T.say(t('Explorers walk along the paths.'), t('1 fur or 1 meat lets an explorer walk up to 3 crossings. Tap the explorer, then the glowing crossing.'));
        await T.tap({ vertices: [start] });
        await T.tap({ vertices: [stop1] });
        await T.pay({ fur: 1 }, T.vertPt(stop1));
        moveTo(T, stop1);
        await T.wait(900);
      },
      async T => {
        T.say(t('The African border blocks the strait.'), t('Explorers cannot cross the dashed line. You walk around the field with the 2 on the coast.'));
        T.glow([hexAt(3, -1)]);
        moveTo(T, site);
        await T.wait(2600);
      },
      async T => {
        T.say(t('New camps only on camp sites.'), t('Your explorer reached a free crossing with a camp site tile. Turn it into a camp: 1 fur, 1 bone, 1 flint. Tap the explorer.'));
        await T.give({ fur: 1, bone: 1, flint: 1 });
        await T.tap({ vertices: [site] });
        await T.pay({ fur: 1, bone: 1, flint: 1 }, T.vertPt(site));
        T.set(x => { x.humankind.explorers = []; delete x.humankind.sites[site]; x.buildings[site] = { p: 0, type: 'camp' }; }, { verts: [site] });
        T.vp(1);
        await T.banner(t('+1 point'), 'gold');
        await T.wait(600);
      },
      async T => {
        T.say(t('Points come from tiles and markers.'), t('A camp on the board is worth nothing. The camp site tile in front of you scores 1 point. Tiles of all 4 colours: Collector +1, the first one gets Fastest Collector +2.'));
        T.extra(`${pill('site', '1', 'green')}${pill('site', '4 colours: +1 / +2', 'brown')}`);
        await T.wait(3200);
      },
      async T => {
        T.say(t('Four progress tracks.'), t('Clothing and Construction open discovery fields, Food lets explorers walk 1 crossing further per level, Hunting moves a threat. Level 1 costs flint, 2 bone, 3 bone and flint, 4 meat, bone and flint.'));
        await T.give({ flint: 1 });
        await T.pay({ flint: 1 }, T.vertPt(camp));
        T.set(x => { x.players[0].tracks.clothing = 1; });
        sfx.award();
        T.extra(env({ cl: 1 }));
        await T.banner(t('Clothing 1/4'), 'gold');
        T.say(t('The first to reach level 4 takes the track marker.'), t('It is worth 1 point and nobody can take it away.'));
        await T.wait(2400);
      },
      async T => {
        T.say(t('Discovery fields.'), t('The brown and pale badges show the levels you need: here Clothing 1 and Construction 2. Whoever first walks onto or over the field takes its tile.'));
        T.set(x => { x.players[0].tracks.construction = 2; x.humankind.explorers.push({ p: 0, v: ref([4, -4, 'NW']), moved: false }); }, { explorers: [ref([4, -4, 'NW'])] });
        T.extra(env({ cl: 1, co: 2 }));
        T.glow([hexAt(4, -6)]);
        await T.wait(3000);
        const df = B.dfs[0].v;
        T.set(x => { x.humankind.explorers[0].v = df; x.humankind.df[0].taken = 0; }, { explorers: [df] });
        sfx.reveal();
        await T.banner(t('Hunting luck'), 'gold');
        T.vp(2);
        T.say(t('Every tile hides something.'), t('Hunting luck: the hunting marker of the region (+1 point). Desertification: a number chip of that landscape is removed in Africa. A threat: you move the Neanderthal or the Saber-toothed tiger. From 2 tiles on you are the Most Successful Hunter (+1 point).'));
        await T.wait(3200);
      },
      async T => {
        T.say(t('A 7 stirs the threats.'), t('Nobody receives anything. Players with more than 7 cards discard half. Then the roller moves a threat onto a field and steals a card.'));
        await T.roll(3, 4);
        sfx.roar();
        T.set(x => { x.humankind.threats.neanderthal = NEAND; }, { threats: ['neanderthal'] });
        await T.wait(1200);
        T.say(t('The Neanderthal blocks its field.'), t('It stays in Europe and Asia (the Saber-toothed tiger in America and Australia). The field gives nothing, and you steal a card from a neighbour.'));
        T.glow([NEAND]);
        await T.steal(foe2, 'meat');
        await T.wait(1300);
      },
      async T => {
        T.say(t('Trade for what you need.'), t('With the supply: 3 equal cards for 1 card of your choice. Players trade only with the player whose turn it is, and may answer an offer with a counter-offer.'));
        await T.give({ bone: 2 });
        await T.bankTrade({ bone: 3 }, 'flint');
        await T.wait(900);
      },
      async T => {
        T.say(t('Reach 10 points to win!'), t('Camp site tiles, hunting markers, track markers and the special awards count. The game ends at once when you reach 10 on your turn.'));
        await T.countVp(10);
        await T.finale();
      },
    ],
  };
}

addChapter({ id: 'humankind', name: 'Dawn of Humankind', color: '#B9692E', build: humankind });
