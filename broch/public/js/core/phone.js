// Phone helpers shared by every screen (shell, game, dialogs, standalone games). Written by the lead designer: read it, do not rewrite it.
// The three phone stylesheets (css/mobile-*.css) use the same two queries, so CSS and JS always agree on what a phone is:
//   phone (portrait or any narrow window)  max-width: 760px
//   landscape phone                        max-height: 500px and max-width: 1040px and landscape   (wins where both match)
// Above 1040px wide nothing may change: desktop stays pixel-identical.
export const PHONE_Q = '(max-width: 760px)';
export const LAND_Q = '(max-height: 500px) and (max-width: 1040px) and (orientation: landscape)';

const noMq = { matches: false, addEventListener() {}, removeEventListener() {} };
const mq = q => (typeof matchMedia === 'function' ? matchMedia(q) : noMq);
const phoneMq = mq(PHONE_Q), landMq = mq(LAND_Q);

export const isLandscapePhone = () => landMq.matches;
export const isPortraitPhone = () => phoneMq.matches && !landMq.matches;
export const isPhone = () => phoneMq.matches || landMq.matches;
export const isCoarse = () => mq('(pointer: coarse)').matches;

// call fn() whenever the layout switches between phone and not-phone or between portrait and landscape; returns an unsubscribe function
export function onPhoneChange(fn) {
  const h = () => fn({ phone: isPhone(), landscape: isLandscapePhone() });
  phoneMq.addEventListener('change', h); landMq.addEventListener('change', h);
  return () => { phoneMq.removeEventListener('change', h); landMq.removeEventListener('change', h); };
}

// short buzz, e.g. when the move passes to me; silently does nothing where the browser has no vibration (iOS Safari, desktop)
export function vibrate(pattern = 40) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not allowed before the first tap */ }
}

// Keeps two CSS variables on <html> up to date: --m-vvh = height of what is really visible (browser bar, keyboard),
// --m-kb = height of the on-screen keyboard (0 when closed). <html> also gets the class "kb-open" while the keyboard is up,
// so bottom bars can hide themselves. Call once at start (app.js).
export function watchViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const set = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = kb > 120; // a collapsing browser bar is not a keyboard
    root.style.setProperty('--m-vvh', Math.round(vv.height) + 'px');
    root.style.setProperty('--m-kb', (open ? kb : 0) + 'px');
    root.classList.toggle('kb-open', open);
  };
  vv.addEventListener('resize', set); vv.addEventListener('scroll', set);
  set();
}
