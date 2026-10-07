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
// Fishermen of Catan: fish costs, token bag, fishing ground numbers
const FISH_COSTS = { robber: 2, steal: 3, take: 4, road: 5, dev: 7 };
const FISH_BAG = { 1: 11, 2: 10, 3: 8 }; // plus the old boot
const FISH_NUMBERS = [4, 5, 6, 8, 9, 10];
const LAKE_NUMBERS = [2, 3, 11, 12];
// Explorers & Pirates missions
const MISSIONS = ['fish', 'spice', 'lairs'];
const MISSION_VP_CAP = 3;

// Ten player colors, checked to stay clearly apart from each other (CIELAB distance >= 38)
const COLORS = ['red', 'blue', 'orange', 'white', 'teal', 'purple', 'black', 'pink', 'yellow', 'brown'];

module.exports = {
  RES, COMM, TERRAIN_RES, TERRAIN_COMM, COSTS, PIECES, BOARDS, PROGRESS, PROGRESS_VP,
  TRACK_COMM, EVENT_FACES, BARBARIAN_STEPS, COLORS,
  EXPANSIONS, FISH_COSTS, FISH_BAG, FISH_NUMBERS, LAKE_NUMBERS, MISSIONS, MISSION_VP_CAP,
};
