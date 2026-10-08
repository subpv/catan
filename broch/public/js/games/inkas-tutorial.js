// How to play Rise of the Inkas: a short interactive chapter for the tutorial player (tutorial.js). It plays on a small
// piece of the real board (flat-top hexes, sea in the west, jungle in the east) and teaches the rules of the rulebook:
// landscapes and trade goods, the roll, trading with the supply, building, the culture board, the decline of a tribe with
// its thickets, building over thickets, the robber, the advantage and development cards, and the win at 11 points.
import { addChapter, addHandKeys, baseView, eAt } from '../tutorial.js';
import { t, esc, glyph } from '../core.js';
import { sfx } from '../fx.js';

addHandKeys(['timber', 'stone', 'fleece', 'metal', 'potato', 'catch', 'coca', 'feathers']);

const pill = (icon, text, cls = '') => `<span class="te ${cls}">${glyph(icon, 15)}${esc(text)}</span>`;
const env = ({ tribe = 'I', points = 2, thickets = 0 }) => `${pill('sun', tribe, 'green')}${pill('temple', `${points}/11`)}${thickets ? pill('thicket', thickets, 'brown') : ''}`;

// the same flat-top geometry the server builds: corners 0, 60, ... degrees, column c at x = 1.5 c, u half hex heights down
function flatGeometry(cells) {
  const hexes = [], vertices = [], edges = [];
  const vIndex = new Map(), eIndex = new Map();
  const key = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const vertexAt = (x, y) => {
    const k = key(x, y);
    if (!vIndex.has(k)) { vIndex.set(k, vertices.length); vertices.push({ id: vertices.length, x: +x.toFixed(4), y: +y.toFixed(4), hexes: [], edges: [] }); }
    return vIndex.get(k);
  };
  const edgeOf = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!eIndex.has(k)) { eIndex.set(k, edges.length); edges.push({ id: edges.length, v: [Math.min(a, b), Math.max(a, b)], hexes: [] }); vertices[a].edges.push(edges.length - 1); vertices[b].edges.push(edges.length - 1); }
    return eIndex.get(k);
  };
  cells.forEach(([c, u, terrain, number]) => {
    const x = c * 1.5, y = u * Math.sqrt(3) / 2;
    const h = { id: hexes.length, x: +x.toFixed(4), y: +y.toFixed(4), terrain, number: number || null, verts: [], edges: [], col: c, u };
    if (terrain === 'frame') h.frame = true;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * 60 * k; h.verts.push(vertexAt(x + Math.cos(a), y + Math.sin(a))); }
    for (let k = 0; k < 6; k++) { const e = edgeOf(h.verts[k], h.verts[(k + 1) % 6]); h.edges.push(e); edges[e].hexes.push(h.id); }
    h.verts.forEach(v => vertices[v].hexes.push(h.id));
    hexes.push(h);
  });
  return { hexes, vertices, edges, ports: [] };
}

function inkas() {
  const B = flatGeometry([
    [0, 5, 'coast', 3],
    [1, 2, 'forest', 5], [1, 4, 'hills', 8], [1, 6, 'mountains', 11], [1, 8, 'mountains', 8],
    [2, 3, 'fields', 10], [2, 5, 'pasture', 12],
    [3, 2, 'forest', 9], [3, 4, 'hills', 4], [3, 6, 'mountains', 9],
    [4, 3, 'plantation', 11], [4, 5, 'jungle', 10],
    [5, 4, 'frame'],
  ]);
  const H = (c, u) => B.hexes.find(h => h.col === c && h.u === u).id;
  const V = trio => { const ids = trio.map(([c, u]) => H(c, u)); return B.vertices.find(v => v.hexes.length === ids.length && ids.every(i => v.hexes.includes(i))).id; };
  const E = (a, b) => { const ids = [H(...a), H(...b)]; return B.edges.find(e => ids.every(i => e.hexes.includes(i))).id; };
  const corner = (c, u, k) => B.hexes[H(c, u)].verts[k];
  const coast = H(0, 5), forest = H(1, 2), hills8 = H(1, 4), peak11 = H(1, 6), fields = H(2, 3), hills4 = H(3, 4), plantation = H(4, 3), frame = H(5, 4);
  // red: two settlements (the first with a road that runs south along the coast), blue: one
  const home = V([[1, 4], [1, 6], [0, 5]]), second = V([[3, 2], [3, 4], [4, 3]]), foe = V([[3, 4], [3, 6], [4, 5]]);
  const L = corner(1, 6, 3), N = corner(1, 6, 2); // the coast road ends at L; the next settlement goes to N
  const r0 = E([1, 6], [0, 5]), r2 = E([3, 2], [4, 3]), r1 = eAt(B, L, N);
  const found = V([[1, 2], [1, 4], [2, 3]]);
  // blue's two roads to the thicket of red's second settlement
  const bc = corner(3, 4, 0);
  const b1 = eAt(B, foe, bc), b2 = eAt(B, bc, second);
  const v = baseView(B, { mode: 'inkas', robber: frame });
  v.buildings[home] = { p: 0, type: 'settlement' };
  v.buildings[second] = { p: 0, type: 'settlement' };
  v.buildings[foe] = { p: 1, type: 'settlement' };
  v.roads[r0] = 0; v.roads[r2] = 0;
  const pay = { road: { timber: 1, stone: 1 }, settlement: { timber: 1, stone: 1, potato: 1, fleece: 1 } };
  return {
    view: v, vpTarget: 11,
    steps: [
      async T => {
        T.say(t('Welcome to Rise of the Inkas!'), t('Lead three tribes to success, one after the other. 11 development points win.'));
        T.vp(2); T.extra(env({}));
        await T.wait(2600);
      },
      async T => {
        T.say(t('Eight landscapes.'), t('Forest, quarry, pasture, mountains and fields give resources.'));
        T.glow([forest, hills8, peak11, fields, hills4, H(2, 5)]);
        await T.wait(2600);
        T.say(t('Coastal waters, jungle plantations and jungle give trade goods.'), t('Fish, coca and feathers.'));
        T.glow([coast, plantation, H(4, 5)]);
        await T.wait(2600);
      },
      async T => {
        T.say(t('Roll the dice every turn.'), t('Tap the dice.'));
        await T.tap({ dice: true });
        await T.roll(5, 6);
        T.hit(11);
        T.say(t('Every field with that number pays.'), t('A settlement gets 1 card, a city 2. Even the sea and the jungle pay.'));
        await Promise.all([T.gain(T.hexPt(peak11), 'metal', 1, 0, home), T.gain(T.hexPt(plantation), 'coca', 1, 0, second, 200)]);
        await T.wait(900);
      },
      async T => {
        T.say(t('Trade goods are worth more.'), t('Trade with the supply: 3 equal resources, or only 2 equal trade goods, for any other card. 3 different trade goods give any 2 resource cards.'));
        await T.give({ coca: 1 });
        await T.wait(1200);
        await T.bankTrade({ coca: 2 }, 'timber');
        await T.wait(900);
      },
      async T => {
        T.say(t('Build roads and settlements.'), t('A road costs wood and stone. Tap the glowing way.'));
        await T.give({ timber: 2, stone: 2, potato: 1, fleece: 1 });
        await T.tap({ edges: [r1] });
        await T.pay(pay.road, T.edgePt(r1));
        T.road(r1, 0);
        T.say(t('A settlement needs a road to it and two empty crossings around it.'), t('It costs wood, stone, potatoes and wool. Tap the glowing crossing.'));
        await T.tap({ vertices: [N] });
        await T.pay(pay.settlement, T.vertPt(N));
        T.build(N, 'settlement', 0);
        T.vp(3); T.extra(env({ points: 3 }));
        await T.wait(900);
      },
      async T => {
        T.say(t('Every settlement is a development point.'), t('It fills a step on your culture board. 4 points complete the first tribe.'));
        T.extra(env({ points: 3 }) + pill('sun', t('4 settlements or 2 settlements and a city')));
        await T.wait(3000);
      },
      async T => {
        T.say(t('A city upgrade counts too.'), t('2 potatoes and 3 ore. A city pays double. Only one city per tribe.'));
        await T.give({ potato: 2, metal: 2 });
        await T.tap({ vertices: [home] });
        await T.pay({ potato: 2, metal: 3 }, T.vertPt(home));
        T.build(home, 'city', 0);
        T.vp(4); T.extra(env({ points: 4 }));
        sfx.award();
        await T.wait(1000);
      },
      async T => {
        T.say(t('The tribe declines.'), t('Your roads go back to the supply and every building gets a thicket. They still pay.'));
        await T.wait(1400);
        T.set(x => { x.roads = {}; [home, second, N].forEach(k => { x.buildings[k].decline = true; }); }, { verts: [home, second, N] });
        sfx.leaf?.();
        T.extra(env({ points: 4, thickets: 3 }));
        await T.banner(t('Early culture'), 'red');
        T.say(t('Found the next tribe.'), t('A free settlement on a free crossing that no road leads to. No yield, and your turn ends.'));
        await T.tap({ vertices: [found] });
        T.build(found, 'settlement', 0);
        T.vp(5); T.extra(env({ tribe: 'II', points: 5, thickets: 3 }));
        await T.wait(1300);
      },
      async T => {
        T.say(t('Buildings in decline can be built over.'), t('A road to the thicket and the cost of a settlement: the old building is removed.'));
        T.road(b1, 1);
        await T.wait(500);
        T.road(b2, 1);
        await T.wait(900);
        T.set(x => { x.buildings[second] = { p: 1, type: 'settlement' }; }, { verts: [second] });
        T.extra(env({ tribe: 'II', points: 5, thickets: 2 }));
        await T.wait(1500);
      },
      async T => {
        T.say(t('A 7 moves the robber.'), t('Everyone with more than 7 cards discards half. The roller moves the robber to another land field or a jungle frame piece and takes a card.'));
        await T.roll(3, 4);
        T.moveRobber(hills4);
        await T.wait(600);
        await T.steal(foe, 'timber');
        T.say(t('The robber blocks its field.'), t('It never stands on coastal waters, plantations or jungle.'));
        await T.wait(1900);
      },
      async T => {
        T.say(t('Development cards.'), t('Potatoes, wool and ore buy one. Play one per turn, but not the turn you bought it.'));
        await T.bigCard({ title: t('Combat Arts'), color: '#B23A2A', icon: 'combat' });
        T.say(t('Advantage cards.'), t('3 connected roads: Longest Trade Route. 2 played Combat Arts cards: Mightiest Combat Arts.'));
        await T.bigCard({ title: t('Longest Trade Route'), color: '#C9971B', icon: 'road' });
        await T.wait(500);
      },
      async T => {
        T.say(t('Lead the third tribe to success!'), t('4 + 4 + 3 development points: whoever places the 11th one wins.'));
        T.extra(env({ tribe: 'III', points: 11 }));
        await T.countVp(11);
        await T.finale();
      },
    ],
  };
}

addChapter({ id: 'inkas', name: 'Rise of the Inkas', color: '#C9971B', build: inkas });
