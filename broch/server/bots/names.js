'use strict';
// Gamer-tag style names for the computer players, so it is obvious at the table that they are bots: TastyMango, SleepyOtter ...
const ADJ = ['Tasty', 'Sleepy', 'Crispy', 'Sneaky', 'Fluffy', 'Grumpy', 'Cheeky', 'Dizzy', 'Jolly', 'Lucky', 'Mighty', 'Nifty', 'Rusty', 'Salty', 'Spicy', 'Soggy', 'Wobbly', 'Zesty', 'Quirky', 'Bouncy', 'Cosmic', 'Turbo', 'Mellow', 'Snazzy'];
const NOUN = ['Mango', 'Otter', 'Waffle', 'Pickle', 'Panda', 'Noodle', 'Badger', 'Turnip', 'Walrus', 'Muffin', 'Pretzel', 'Gecko', 'Llama', 'Potato', 'Falcon', 'Biscuit', 'Cactus', 'Penguin', 'Dumpling', 'Hedgehog', 'Pancake', 'Toucan', 'Radish', 'Yeti'];
const pick = a => a[Math.floor(Math.random() * a.length)];
// a name that nobody at the table (or registered) uses yet
function botName(taken = []) {
  const used = new Set(taken.map(n => String(n).toLowerCase()));
  for (let i = 0; i < 200; i++) { const n = pick(ADJ) + pick(NOUN); if (!used.has(n.toLowerCase())) return n; }
  return pick(ADJ) + pick(NOUN) + (1 + Math.floor(Math.random() * 99));
}
module.exports = { botName, ADJ, NOUN };
