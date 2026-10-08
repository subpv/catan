// Card texts and decks, shared by the hand, the dialogs and the full-screen card animation.
import { t } from './core.js';

export const DEV_DESC = {
  knight: 'Move the robber and steal a card. Counts toward Largest Army.',
  victoryPoint: 'Worth 1 point. Stays hidden from the others until the game ends.',
  roadBuilding: 'Build 2 roads for free.',
  yearOfPlenty: 'Take any 2 resources from the bank.',
  monopoly: 'Name a resource. Everyone gives you all of theirs.',
};
export const PROGRESS_INFO = {
  alchemist: ['Choose both production dice before you roll.', 'dice'],
  inventor: ['Swap two number tokens (not 2, 6, 8 or 12).', 'inventor'],
  crane: ['Your next city improvement this turn costs 1 less.', null],
  engineer: ['Build a city wall for free.', 'engineer'],
  irrigation: ['Take 2 grain for each field next to your buildings.', null],
  medicine: ['Upgrade a settlement to a city for 2 ore and 1 grain.', 'medicine'],
  mining: ['Take 2 ore for each mountain next to your buildings.', null],
  roadBuilding: ['Build 2 roads for free.', null],
  smith: ['Promote 2 knights for free.', null],
  commercialHarbor: ['Offer 1 resource to every opponent. Each one with a commodity must give you one of their choice.', 'harbor'],
  masterMerchant: ['Look at the hand of a player with more points and take 2 cards.', 'player'],
  merchant: ['Place the merchant next to your building: trade that resource 2:1 and hold 1 point.', 'merchant'],
  merchantFleet: ['Trade one card type of your choice 2:1 this turn.', 'cardType'],
  resourceMonopoly: ['Each opponent gives you up to 2 of a resource.', 'resource'],
  tradeMonopoly: ['Each opponent gives you 1 of a commodity.', 'commodity'],
  bishop: ['Move the robber and steal 1 card from each player at that tile.', null],
  deserter: ["An opponent chooses one of their knights to leave the board. You set up a knight of the same level and status.", 'player'],
  diplomat: ['Remove an open road. If it is yours, rebuild it for free.', 'diplomat'],
  intrigue: ['Displace an opposing knight standing on one of your roads.', 'intrigue'],
  saboteur: ['Players with as many points as you or more discard half their cards.', null],
  spy: ["Look at an opponent's progress cards and take one.", 'player'],
  warlord: ['Activate all your knights for free.', null],
  wedding: ['Each player with more points gives you 2 cards of their choice.', null],
};
export const PROGRESS_DECK = {};
Object.entries({ science: ['alchemist', 'inventor', 'crane', 'engineer', 'irrigation', 'medicine', 'mining', 'roadBuilding', 'smith'], trade: ['commercialHarbor', 'masterMerchant', 'merchant', 'merchantFleet', 'resourceMonopoly', 'tradeMonopoly'], politics: ['bishop', 'deserter', 'diplomat', 'intrigue', 'saboteur', 'spy', 'warlord', 'wedding'] })
  .forEach(([d, cs]) => cs.forEach(c => { PROGRESS_DECK[c] = d; }));
export const DECK_COLOR = { science: '#2E6B45', trade: '#E0A32E', politics: '#2C6E9B' };

// revealed at once for a point, never held in the hand
PROGRESS_DECK.printer = 'science';
PROGRESS_DECK.constitution = 'politics';
const VP_CARDS = { printer: 'Worth 1 point. It is placed openly in front of you.', constitution: 'Worth 1 point. It is placed openly in front of you.' };

// the one-line description of any development or progress card, translated
export const cardDesc = type => (DEV_DESC[type] ? t(DEV_DESC[type]) : PROGRESS_INFO[type] ? t(PROGRESS_INFO[type][0]) : VP_CARDS[type] ? t(VP_CARDS[type]) : '');
export const deckOf = type => PROGRESS_DECK[type] || null;
