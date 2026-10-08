// Translations. Keys are the English text; each language file maps English -> translation.
// Missing keys fall back to English, so a partly translated language still works.

export const LANGS = [
  ['en', 'English'], ['de', 'Deutsch'], ['da', 'Dansk'], ['sv', 'Svenska'], ['nb', 'Norsk'],
  ['nl', 'Nederlands'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'],
  ['pl', 'Polski'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['ko', '한국어'], ['ja', '日本語'], ['zh', '中文'],
];

const LOADERS = {
  de: () => import('./lang/de.js'), da: () => import('./lang/da.js'), sv: () => import('./lang/sv.js'),
  nb: () => import('./lang/nb.js'), nl: () => import('./lang/nl.js'), fr: () => import('./lang/fr.js'),
  es: () => import('./lang/es.js'), it: () => import('./lang/it.js'), pt: () => import('./lang/pt.js'),
  pl: () => import('./lang/pl.js'), tr: () => import('./lang/tr.js'), uk: () => import('./lang/uk.js'),
  ko: () => import('./lang/ko.js'), ja: () => import('./lang/ja.js'), zh: () => import('./lang/zh.js'),
};

let dict = {};
let current = 'en';

export function t(key, params) {
  let s = dict[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  return s;
}
export const lang = () => current;

function storedLang() {
  try { return localStorage.getItem('broch_lang'); } catch { return null; }
}
export function guessLang() {
  const s = storedLang();
  if (s && LANGS.some(l => l[0] === s)) return s;
  for (const n of navigator.languages || [navigator.language || 'en']) {
    const code = n.toLowerCase().split('-')[0];
    const mapped = code === 'no' || code === 'nn' ? 'nb' : code;
    if (LANGS.some(l => l[0] === mapped)) return mapped;
  }
  return 'en';
}

export async function setLang(code) {
  if (!LANGS.some(l => l[0] === code)) code = 'en';
  dict = code === 'en' ? {} : (await LOADERS[code]()).default;
  // the standalone games keep their texts in lang/x/<code>.js (built from lang/games/*.tsv)
  if (code !== 'en') { try { dict = { ...dict, ...(await import(`./lang/x/${code}.js`)).default }; } catch { /* no texts for this language yet: English */ } }
  current = code;
  document.documentElement.lang = code;
  try { localStorage.setItem('broch_lang', code); } catch { /* storage blocked */ }
}

export function fmtDateLocal(ts, opts = { day: 'numeric', month: 'numeric', year: 'numeric' }) {
  try { return new Intl.DateTimeFormat(current, opts).format(new Date(ts)); } catch { return new Date(ts).toLocaleDateString(); }
}
