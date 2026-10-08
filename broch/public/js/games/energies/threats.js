// The standalone games that have no robber show their own threat on a 7 (the full-screen scene in core/fx.js).
import { THREAT_BY_MODE } from '../../core/fx.js';

// New Energies: the environmental inspector
THREAT_BY_MODE.energies = {
  title: 'The environmental inspector arrives!', moves: 'The inspector is on the move.',
  svg: `<svg viewBox="-60 -80 120 170" class="fx-robber-fig"><ellipse cx="0" cy="82" rx="46" ry="8" fill="rgba(0,0,0,.45)"/>
    <path d="M-38 80 C-40 30 -26 6 -16 -4 L16 -4 C26 6 40 30 38 80 Z" fill="#2F7A3C" stroke="#0E2A14" stroke-width="2"/>
    <path d="M-16 -4 L0 22 L16 -4 M0 22 V80" fill="none" stroke="#0E2A14" stroke-width="2"/>
    <path d="M-30 52 H-8 M8 52 H30" stroke="#F2E04A" stroke-width="7"/>
    <circle cy="-34" r="25" fill="#E8B890" stroke="#3A2410" stroke-width="2"/>
    <path d="M-30 -42 Q0 -78 30 -42 L26 -36 H-26 Z" fill="#F2E04A" stroke="#6B5A06" stroke-width="2.500" stroke-linejoin="round"/>
    <circle cx="-9" cy="-32" r="3" fill="#1F1610"/><circle cx="9" cy="-32" r="3" fill="#1F1610"/><path d="M-10 -20 Q0 -14 10 -20" fill="none" stroke="#7A3A1E" stroke-width="2.500" stroke-linecap="round"/>
    <g transform="rotate(-8 30 30)"><rect x="18" y="14" width="30" height="40" rx="3" fill="#F6F0DC" stroke="#3A2410" stroke-width="2.500"/><rect x="26" y="9" width="14" height="9" rx="2" fill="#6B6B72" stroke="#2B2B30" stroke-width="2"/>
      <path d="M24 26 H42 M24 33 H42 M24 40 H36" stroke="#6B6B72" stroke-width="2.500" stroke-linecap="round"/><path d="M24 47 l4 4 l8 -9" fill="none" stroke="#2F7A3C" stroke-width="3" stroke-linecap="round"/></g></svg>`,
};
