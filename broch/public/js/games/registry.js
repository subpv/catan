// The standalone games (New Energies, Dawn of Humankind, Rise of the Inkas) each describe themselves with a plugin;
// sgame.js is the one game screen that runs them. A plugin registers itself when its module is imported.
export const GAMES = {};
export const register = plugin => { GAMES[plugin.id] = plugin; return plugin; };
export const isStandalone = mode => !!GAMES[mode];
export const gameOf = view => GAMES[view && view.mode] || null;
