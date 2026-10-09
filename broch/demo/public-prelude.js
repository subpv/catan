// First module of the public demo (served at /demo on the real site, next to the real app on the same origin).
// The demo must never leave anything behind that the real app could read: only the language and the sound preference are shared with it,
// every other key of localStorage / sessionStorage (tutorial hints, view switches, pending invites ...) lives in memory and is gone with the tab.
window.BROCH_PUBLIC_DEMO = true;

const SHARED = new Set(['broch_lang', 'broch_muted']);
try {
  const mem = { localStorage: new Map(), sessionStorage: new Map() };
  const kind = s => (s === window.sessionStorage ? 'sessionStorage' : 'localStorage');
  const proto = Storage.prototype;
  const real = { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem };
  const mine = (s, k) => !(kind(s) === 'localStorage' && SHARED.has(String(k)));
  proto.getItem = function (k) { return mine(this, k) ? (mem[kind(this)].has(String(k)) ? mem[kind(this)].get(String(k)) : null) : real.getItem.call(this, k); };
  proto.setItem = function (k, v) { if (mine(this, k)) mem[kind(this)].set(String(k), String(v)); else real.setItem.call(this, k, v); };
  proto.removeItem = function (k) { if (mine(this, k)) mem[kind(this)].delete(String(k)); else real.removeItem.call(this, k); };
  // nothing in the app enumerates the storage; key()/clear() stay harmless
  proto.clear = function () { mem[kind(this)].clear(); };
} catch { /* storage blocked: the app already copes with that */ }
