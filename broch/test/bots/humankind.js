'use strict';
// A random bot for Dawn of Humankind: returns every move worth trying.
const pick = a => a[Math.floor(Math.random() * a.length)];
const RES = ['fur', 'bone', 'meat', 'flint'];
module.exports = function candidates(v, p) {
  const L = v.legal || {}, out = [];
  if (L.setupCamps && L.setupCamps.length) out.push({ type: 'placeCamp', v: pick(L.setupCamps) });
  if (L.setupExplorers && L.setupExplorers.length) out.push({ type: 'placeExplorer', v: pick(L.setupExplorers) });
  const mine = v.pending.filter(x => x.group === v.activeGroup && x.player === p);
  for (const it of mine) {
    if (it.type === 'discard') {
      const pool = [];
      for (const k of RES) for (let i = 0; i < (v.players[p].res[k] || 0); i++) pool.push(k);
      const c = {};
      for (let i = 0; i < it.count; i++) { const [k] = pool.splice(Math.floor(Math.random() * pool.length), 1); c[k] = (c[k] || 0) + 1; }
      out.push({ type: 'discard', cards: c });
    }
    if (it.type === 'threat' && L.threat) {
      const t = pick(Object.keys(L.threat));
      const hs = Object.keys(L.threat[t]);
      if (hs.length) {
        const h = +pick(hs), vs = L.threat[t][h];
        out.push({ type: 'moveThreat', threat: t, h, victim: vs.length ? pick(vs) : undefined });
      }
      if (L.threatOptional) out.push({ type: 'skipThreat' });
    }
    if (it.type === 'erode' && L.erode && L.erode.length) out.push({ type: 'erode', h: pick(L.erode) });
  }
  if (v.phase === 'play' && !v.pending.length && v.current === p) {
    if (v.step === 'roll') out.push({ type: 'roll' });
    if (v.step === 'main') {
      const res = v.players[p].res || {};
      // explorers wander far, camps get founded, the progress tracks are climbed
      for (const [from, dests] of Object.entries(L.moves || {})) {
        out.push({ type: 'moveExplorer', from: +from, to: pick(dests), pay: res.fur ? 'fur' : 'meat' });
        out.push({ type: 'moveExplorer', from: +from, to: pick(dests), pay: res.meat ? 'meat' : 'fur' });
      }
      if (L.explorerSpots && L.explorerSpots.length) out.push({ type: 'placeExplorer', v: pick(L.explorerSpots), remove: L.explorerRemove ? pick(L.explorerRemove) : undefined });
      for (const x of L.camps || []) out.push({ type: 'buildCamp', v: x, remove: L.campRemove ? pick(L.campRemove) : undefined });
      for (const [k, a] of Object.entries(L.advance || {})) if (a && Math.random() < 0.6) out.push({ type: 'advance', track: k });
      for (const k of RES) {
        const r = L.ratios && L.ratios[k];
        if (r && res[k] >= r) out.push({ type: 'bankTrade', give: k, get: pick(RES.filter(x => x !== k)) });
      }
      out.push({ type: 'endTurn' }, { type: 'endTurn' });
    }
  }
  return out;
};
