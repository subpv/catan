// How to play Explorers & Pirates: a short interactive chapter for the tutorial player (tutorial.js).
import { addChapter } from '../tutorial.js';
import { t } from '../core.js';

function explorers() {
  return { view: null, vpTarget: 12, steps: [async T => { T.say(t('Explorers & Pirates'), ''); await T.wait(500); }] };
}
addChapter({ id: 'explorers', name: 'Explorers & Pirates', color: '#4A3A6E', build: explorers });
