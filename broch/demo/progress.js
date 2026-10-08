'use strict';
// Writes PROGRESS.md from demo/progress-data.js: node demo/progress.js
const fs = require('fs');
const path = require('path');
const d = require('./progress-data');
const L = [`# ${d.title}`, '', '## So testest du', ...d.howto.map(x => `- ${x}`), '', '## Modi', '', '| Modus | Status | Was testen | Bekannte Lücken |', '|---|---|---|---|',
  ...d.modes.map(m => `| ${m.name} | ${m.status === 'Beta' ? '**Beta**' : 'fertig'} | ${m.test} | ${m.gaps} |`), '', '## Neu', ...d.news.map(x => `- ${x}`), '', '## Was mir noch fehlt', ...d.missing.map(x => `- ${x}`), ''];
fs.writeFileSync(path.join(__dirname, '..', 'PROGRESS.md'), L.join('\n'));
console.log('wrote PROGRESS.md');
