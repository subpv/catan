'use strict';

const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const COMM = ['paper', 'cloth', 'coin'];

const TERRAIN_RES = {
  forest: 'lumber', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'ore', desert: null,
};
// Knights mode: cities on these terrains yield 1 resource + 1 commodity
const TERRAIN_COMM = { forest: 'paper', pasture: 'cloth', mountains: 'coin' };

const COSTS = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
  knight: { wool: 1, ore: 1 },
  activate: { grain: 1 },
  promote: { wool: 1, ore: 1 },
  wall: { brick: 2 },
  medicine: { grain: 1, ore: 2 },
  ship: { lumber: 1, wool: 1 },
  bridge: { brick: 2, lumber: 1 },
};

const PIECES = { road: 15, settlement: 5, city: 4, wall: 3, knightPerLevel: 2, ship: 15, bridge: 3 };

// Board definitions. rows = hexes per row (pointy-top rows).
const BOARDS = {
  standard: {
    rows: [3, 4, 5, 4, 3],
    terrain: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 },
    numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    ports: ['any', 'any', 'any', 'any', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    bank: 19,
    dev: { knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 },
  },
  extended: {
    rows: [3, 4, 5, 6, 5, 4, 3],
    terrain: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['any', 'any', 'any', 'any', 'any', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 24,
    dev: { knight: 20, victoryPoint: 5, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3 },
  },
};

// Knights mode progress cards
const PROGRESS = {
  science: { alchemist: 2, inventor: 2, crane: 2, engineer: 1, irrigation: 2, medicine: 2, mining: 2, printer: 1, roadBuilding: 2, smith: 2 },
  trade: { commercialHarbor: 2, masterMerchant: 2, merchant: 6, merchantFleet: 2, resourceMonopoly: 4, tradeMonopoly: 2 },
  politics: { bishop: 2, constitution: 1, deserter: 2, diplomat: 2, intrigue: 2, saboteur: 2, spy: 3, warlord: 2, wedding: 2 },
};
const PROGRESS_VP = ['printer', 'constitution'];
// improvement track -> commodity
const TRACK_COMM = { trade: 'cloth', politics: 'coin', science: 'paper' };
const EVENT_FACES = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];
const BARBARIAN_STEPS = 7;

// ---- expansions
const EXPANSIONS = ['none', 'seafarers', 'traders', 'explorers'];
// Traders & Barbarians. Fishermen of Catan: what fish buy, the token bag (11 x one fish, 10 x two, 8 x three, plus the old boot;
// the 5-6 player set adds 4 + 5 + 5), the fishing grounds and the lake (the 5-6 set adds two grounds and a second lake)
const FISH_COSTS = { robber: 2, steal: 3, take: 4, road: 5, dev: 7 };
const FISH_BAG = { 1: 11, 2: 10, 3: 8 };
const FISH_BAG_EXTRA = { 1: 4, 2: 5, 3: 5 };
const FISH_NUMBERS = [4, 5, 6, 8, 9, 10];
const FISH_NUMBERS_EXTRA = [5, 9];
const LAKE_NUMBERS = [2, 3, 11, 12];
const LAKE2_NUMBERS = [10, 4];
const FISH_MAX = 7; // fish tokens in one hand
// Event cards (37): [id, dice number, how many]; the New Year card has no number
const EVENT_CARDS = [
  ['raid', 7, 6], ['plague', 6, 1], ['plague', 8, 1], ['quake', 6, 1], ['neighbors', 6, 1], ['tournament', 5, 1], ['advantage', 5, 1],
  ['calm', 9, 1], ['calm', 12, 1], ['help', 10, 1], ['help', 11, 1], ['conflict', 3, 1], ['bounty', 2, 1], ['retreat', 4, 2],
  ['fine', 3, 1], ['fine', 4, 1], ['fine', 5, 2], ['fine', 6, 2], ['fine', 8, 4], ['fine', 9, 3], ['fine', 10, 2], ['fine', 11, 1],
];
// points to win: Fishermen and Rivers 10, Caravans and Barbarian Attack 12, Traders & Barbarians 13, one more with Harbours of Catan
const tradersVp = v => ((v && v.traders) ? 13 : (v && (v.caravans || v.barbarians)) ? 12 : 10) + ((v && v.harbors) ? 1 : 0);
// Explorers & Pirates missions
const MISSIONS = ['fish', 'spice', 'lairs'];
const MISSION_VP_CAP = 3;

// Ten player colors, checked to stay clearly apart from each other (CIELAB distance >= 38)
const COLORS = ['red', 'blue', 'orange', 'white', 'teal', 'purple', 'black', 'pink', 'yellow', 'brown'];

module.exports = {
  RES, COMM, TERRAIN_RES, TERRAIN_COMM, COSTS, PIECES, BOARDS, PROGRESS, PROGRESS_VP,
  TRACK_COMM, EVENT_FACES, BARBARIAN_STEPS, COLORS,
  EXPANSIONS, tradersVp, FISH_COSTS, FISH_BAG, FISH_BAG_EXTRA, FISH_NUMBERS, FISH_NUMBERS_EXTRA, LAKE_NUMBERS, LAKE2_NUMBERS, FISH_MAX, EVENT_CARDS, MISSIONS, MISSION_VP_CAP,
};
