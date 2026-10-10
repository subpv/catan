// The printed Seafarers scenarios as the lobby and the rules dialog describe them. Every text is an English i18n key.
export const SCEN = {
  shores: {
    label: 'Heading for New Shores', vp: 14, variable: true,
    blurb: 'Settle the large island, then sail out to the small islands.',
    rules: ['Your first two settlements go on the large island.', 'Your first settlement on each small island earns 2 bonus points.', 'The robber and the pirate are both in play.'],
  },
  islands: {
    label: 'The Four Islands', vp: 13, variable: true,
    blurb: 'Be present on all four islands.',
    rules: ['Your first two settlements may stand on any islands; those are your home islands.', 'Your first settlement on every foreign island earns 2 bonus points.', 'The robber and the pirate are both in play.'],
  },
  fog: {
    label: 'The Fog Islands', vp: 12, variable: true,
    blurb: 'Explore the fog sea between the two large islands.',
    rules: ['Your first two settlements go on the two large islands.', 'Build a ship or road next to a face-down tile to turn it over. Land gives you one resource of its kind (gold: any resource) and gets a number chip.', 'There are no bonus points for islands.'],
  },
  desert: {
    label: 'Through the Desert', vp: 14, variable: true,
    blurb: 'Cross the desert belt or sail to the small islands.',
    rules: ['Your first two settlements go on the large part of the main island, on this side of the desert belt.', 'The strip behind the desert and the small islands are foreign islands: your first settlement on each earns 2 bonus points.', 'The robber starts on one of the deserts.'],
  },
  tribe: {
    label: 'The Forgotten Tribe', vp: 13, variable: false,
    blurb: 'The tribe on the small islands has gifts for those who arrive first.',
    rules: ['Nobody may settle the small islands; they yield nothing.', 'A ship built or moved onto a coast edge takes what lies there: a victory point chip (1 point), a development card (as if bought this turn) or a harbour.', 'A harbour goes onto one of your coastal settlements without a harbour at once (you choose which). If you have none, you keep it until you build one.', 'The robber may not enter the small islands and may not return to his first desert.'],
  },
  cloth: {
    label: 'Cloth for Broch', vp: 14, variable: false,
    blurb: 'Trade with the villages of the forgotten tribe for bales of cloth.',
    rules: ['You found three settlements on the two large islands; only the third one pays starting resources.', 'A shipping line from your settlement to a village opens trade: you take 1 bale of cloth at once and another whenever the number of the village is rolled. That line is closed and cannot be moved.', '2 bales of cloth are worth 1 point. The game also ends when only 3 villages still hold cloth: the most points win, then the most cloth.', 'There is no Longest Trade Route. Only players whose ships reached a village may move the pirate; he steals a card or a bale of cloth.'],
  },
  wonders: {
    label: 'The Wonders of Broch', vp: 10, variable: false,
    blurb: 'Be the first to raise a wonder.',
    rules: ['Meet the condition of a wonder, claim it and build its four levels (each level costs the five resources shown).', 'You win by finishing your wonder, or on your turn with 10 points and a higher wonder level than everybody else.', 'Every settlement you found on a small island earns 1 point. There is no pirate.', 'Corners next to the wonder chips stay empty in the founding phase.'],
  },
  newworld: {
    label: 'New World', vp: 12, variable: false,
    blurb: 'Free game: every tile and number is dealt at random.',
    rules: ['Your first two settlements may stand anywhere; those are your home islands.', 'Your first settlement on each foreign island earns 1 bonus point.', 'The robber starts on a 12; the pirate starts on the frame.'],
  },
};
export const SCEN_KEYS = Object.keys(SCEN);

// the seven wonders: condition text and the icon
export const WONDER = {
  castle: { name: 'Castle', cond: '1 city and at least 6 points', icon: 'castle' },
  bridge: { name: 'Great Bridge', cond: 'A settlement at the strait (Great Bridge chip)', icon: 'bridge' },
  wall: { name: 'Great Wall', cond: 'A settlement at the desert (Great Wall chip)', icon: 'wall' },
  theater: { name: 'Great Theater', cond: '2 cities', icon: 'theater' },
  monument: { name: 'Monument', cond: 'A harbour city and a trade route of 5 roads or ships', icon: 'monument' },
  lighthouse: { name: 'Lighthouse', cond: 'A settlement at the strait (Lighthouse chip)', icon: 'lighthouse' },
  library: { name: 'Great Library', cond: '2 cities', icon: 'library' },
};
