// ISO 3166-1 alpha-2 codes. Names come from the browser (Intl.DisplayNames) in the current language.
import { lang } from './i18n.js';

export const COUNTRIES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');

export function countryName(code) {
  if (!code) return '';
  try { return new Intl.DisplayNames([lang(), 'en'], { type: 'region' }).of(code) || code; } catch { return code; }
}

// Emoji flag from the two letters (regional indicator symbols)
export function flagEmoji(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}
export function flag(code, size = '') {
  if (!code) return '';
  return `<span class="flag ${size}" title="${countryName(code).replace(/"/g, '&quot;')}" aria-label="${countryName(code).replace(/"/g, '&quot;')}">${flagEmoji(code)}</span>`;
}

export function guessCountry() {
  for (const l of navigator.languages || [navigator.language || '']) {
    const m = /-([A-Za-z]{2})$/.exec(l);
    if (m && COUNTRIES.includes(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  const byLang = { da: 'DK', de: 'DE', sv: 'SE', nb: 'NO', nn: 'NO', no: 'NO', nl: 'NL', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', pl: 'PL', tr: 'TR', uk: 'UA', ko: 'KR', ja: 'JP', zh: 'CN', en: 'GB' };
  const l = (navigator.language || 'en').split('-')[0];
  return byLang[l] || '';
}

export function countrySelect(id, selected) {
  const opts = COUNTRIES.map(c => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], lang()));
  return `<select class="input" id="${id}" name="country" required><option value="" disabled ${selected ? '' : 'selected'}></option>${opts.map(([c, n]) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${flagEmoji(c)} ${n.replace(/</g, '&lt;')}</option>`).join('')}</select>`;
}
