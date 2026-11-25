/**
 * High-resolution Retina metallic vector SVG motifs for "Dynasty of the East".
 * Multi-color bevel/sheen gradients on smooth vector paths (100% offline).
 */
export type FactionKey = "dai_viet" | "trung_nguyen" | "bac_cuong" | "goryeo" | "fuso";
// export type FactionKey = "dai_viet" | "trung_nguyen" | "bac_cuong"; | "goryeo" | "fuso"
export type RankGrade = "S" | "A" | "B" | "C";

export const MOTIF_DONG_SON_DRUM = `<svg class="dote-svg-vector" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
  <defs>
    <radialGradient id="doteDrumRim" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#efe7d7"/>
      <stop offset="55%" stop-color="#b4a8a0"/>
      <stop offset="100%" stop-color="#62564e"/>
    </radialGradient>
    <radialGradient id="doteDrumCore" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#332f2d"/>
      <stop offset="100%" stop-color="#191513"/>
    </radialGradient>
  </defs>
  <circle cx="24" cy="24" r="22" fill="url(#doteDrumRim)" stroke="#15110f" stroke-width="2"/>
  <circle cx="24" cy="24" r="18.5" fill="url(#doteDrumCore)" stroke="#6b5f57" stroke-width="1"/>
  <circle cx="24" cy="24" r="15" fill="none" stroke="#b4a8a0" stroke-width="1" stroke-dasharray="2 2.5"/>
  <circle cx="24" cy="24" r="11" fill="none" stroke="#e4dccc" stroke-width="0.9" opacity="0.7"/>
  <polygon points="24,8 26.2,19 37,15 28.5,22 40,24 28.5,26 37,33 26.2,29 24,40 21.8,29 11,33 19.5,26 8,24 19.5,22 11,15 21.8,19" fill="url(#doteDrumRim)"/>
  <circle cx="24" cy="24" r="4.5" fill="#403c3a" stroke="#efe7d7" stroke-width="1.3"/>
  <circle cx="24" cy="24" r="1.8" fill="#efe7d7"/>
</svg>`;

export const FACTION_CRESTS: Record<FactionKey, string> = {
  dai_viet: `<svg class="dote-svg-vector" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <defs>
      <linearGradient id="doteDvBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#534f4d"/>
        <stop offset="100%" stop-color="#262220"/>
      </linearGradient>
      <linearGradient id="doteDvGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#efe7d7"/>
        <stop offset="50%" stop-color="#b4a8a0"/>
        <stop offset="100%" stop-color="#6b5f57"/>
      </linearGradient>
    </defs>
    <circle cx="24" cy="24" r="21" fill="url(#doteDvBg)" stroke="url(#doteDvGold)" stroke-width="2.5"/>
    <circle cx="24" cy="24" r="16.5" fill="none" stroke="#e4dccc" stroke-width="0.9" opacity="0.6"/>
    <polygon points="24,10 26,19.5 34.5,15.5 28,22.5 38,24 28,25.5 34.5,32.5 26,28.5 24,38 22,28.5 13.5,32.5 20,25.5 10,24 20,22.5 13.5,15.5 22,19.5" fill="url(#doteDvGold)"/>
    <circle cx="24" cy="24" r="4" fill="#363230" stroke="#efe7d7" stroke-width="1.3"/>
  </svg>`,

  trung_nguyen: `<svg class="dote-svg-vector" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <defs>
      <linearGradient id="doteTnBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#81756d"/>
        <stop offset="100%" stop-color="#3b3735"/>
      </linearGradient>
      <linearGradient id="doteTnGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#efe7d7"/>
        <stop offset="100%" stop-color="#7b6f67"/>
      </linearGradient>
    </defs>
    <polygon points="24,3 42,13 42,35 24,45 6,35 6,13" fill="url(#doteTnBg)" stroke="url(#doteTnGold)" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="24,7 38,15 38,33 24,41 10,33 10,15" fill="none" stroke="#ece4d4" stroke-width="0.8" opacity="0.4"/>
    <path d="M12 20 Q24 14 36 20" fill="none" stroke="url(#doteTnGold)" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M13 21 L24 26 L35 21" fill="none" stroke="#f3ebdb" stroke-width="1.2"/>
    <rect x="22" y="13" width="4" height="20" rx="1" fill="url(#doteTnGold)"/>
    <polygon points="24,9 27,14 21,14" fill="#efe7d7"/>
    <rect x="19" y="19" width="10" height="5" rx="1" fill="#363230" stroke="#e4dccc" stroke-width="1"/>
  </svg>`,

  bac_cuong: `<svg class="dote-svg-vector" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <defs>
      <linearGradient id="doteBcBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#695d55"/>
        <stop offset="100%" stop-color="#2e2a28"/>
      </linearGradient>
      <linearGradient id="doteBcSilver" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fffeee"/>
        <stop offset="50%" stop-color="#e0d8c8"/>
        <stop offset="100%" stop-color="#7e726a"/>
      </linearGradient>
    </defs>
    <path d="M8 6 H40 V25 C40 34 24 43 24 43 C24 43 8 34 8 25 Z" fill="url(#doteBcBg)" stroke="url(#doteBcSilver)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M18 35 L19 25 L14 23 L15 19 L21 15 L23 11 L26 14 L31 15 L33 21 L29 24 L29 35 Z" fill="url(#doteBcSilver)" stroke="#15110f" stroke-width="1"/>
    <path d="M26 14 Q32 16 33 23" fill="none" stroke="#e4dccc" stroke-width="2" stroke-linecap="round"/>
    <circle cx="21" cy="18" r="1.2" fill="#15110f"/>
  </svg> 
  `,  goryeo: `<svg class="dote-svg-vector" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><defs><linearGradient id="doteGrBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2f6f68"/><stop offset="100%" stop-color="#173834"/></linearGradient><linearGradient id="doteGrGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#efe7d7"/><stop offset="100%" stop-color="#7eb5ac"/></linearGradient></defs><polygon points="24,4 41,12 38,33 24,44 10,33 7,12" fill="url(#doteGrBg)" stroke="url(#doteGrGold)" stroke-width="2.4"/><path d="M16 32 V18 H20 V21 H22 V16 H26 V21 H28 V18 H32 V32 Z" fill="url(#doteGrGold)"/><path d="M24 11 L27 16 H21 Z" fill="#efe7d7"/><rect x="15" y="32" width="18" height="3" rx="1" fill="#e4dccc"/></svg>`,
    fuso: `<svg class="dote-svg-vector" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><defs><linearGradient id="doteFsBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6b2226"/><stop offset="100%" stop-color="#2a0f12"/></linearGradient><linearGradient id="doteFsGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#efe7d7"/><stop offset="100%" stop-color="#d9a441"/></linearGradient></defs><circle cx="24" cy="24" r="19" fill="url(#doteFsBg)" stroke="url(#doteFsGold)" stroke-width="2.4"/><circle cx="24" cy="22" r="8" fill="#c9433d" stroke="#efe7d7" stroke-width="1.2"/><path d="M13 35 L35 13 M35 35 L13 13" stroke="url(#doteFsGold)" stroke-width="2.8" stroke-linecap="round"/><rect x="19" y="34" width="10" height="3" rx="1" fill="#efe7d7"/></svg>`,
};

export const RANK_MEDALS: Record<RankGrade, string> = {
  S: `<svg class="dote-svg-vector" viewBox="0 0 64 64" width="60" height="60" aria-hidden="true">
    <defs>
      <linearGradient id="doteMedS" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fef6e6"/>
        <stop offset="50%" stop-color="#baaea6"/>
        <stop offset="100%" stop-color="#6b5f57"/>
      </linearGradient>
    </defs>
    <path d="M20 4 H44 V18 L32 14 L20 18 Z" fill="#403c3a" stroke="#b4a8a0" stroke-width="1.5"/>
    <circle cx="32" cy="36" r="22" fill="url(#doteMedS)" stroke="#15110f" stroke-width="2"/>
    <circle cx="32" cy="36" r="16.5" fill="#363230" stroke="#fef6e6" stroke-width="1.5"/>
    <text x="32" y="44" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="24" font-weight="900" fill="#fef6e6">S</text>
  </svg>`,

  A: `<svg class="dote-svg-vector" viewBox="0 0 64 64" width="60" height="60" aria-hidden="true">
    <defs>
      <linearGradient id="doteMedA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fffeee"/>
        <stop offset="55%" stop-color="#e0d8c8"/>
        <stop offset="100%" stop-color="#7e726a"/>
      </linearGradient>
    </defs>
    <path d="M22 4 H42 V18 L32 14 L22 18 Z" fill="#4e4a48" stroke="#e0d8c8" stroke-width="1.5"/>
    <circle cx="32" cy="36" r="22" fill="url(#doteMedA)" stroke="#15110f" stroke-width="2"/>
    <circle cx="32" cy="36" r="16.5" fill="#1d1917" stroke="#fffeee" stroke-width="1.3"/>
    <text x="32" y="44" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="23" font-weight="800" fill="#fffeee">A</text>
  </svg>`,

  B: `<svg class="dote-svg-vector" viewBox="0 0 64 64" width="60" height="60" aria-hidden="true">
    <defs>
      <linearGradient id="doteMedB" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#c6beae"/>
        <stop offset="55%" stop-color="#877b73"/>
        <stop offset="100%" stop-color="#413d3b"/>
      </linearGradient>
    </defs>
    <path d="M22 4 H42 V18 L32 14 L22 18 Z" fill="#645850" stroke="#c6beae" stroke-width="1.5"/>
    <circle cx="32" cy="36" r="21" fill="url(#doteMedB)" stroke="#15110f" stroke-width="2"/>
    <circle cx="32" cy="36" r="15.5" fill="#25211f" stroke="#c6beae" stroke-width="1.2"/>
    <text x="32" y="44" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="22" font-weight="800" fill="#e4dccc">B</text>
  </svg>`,

  C: `<svg class="dote-svg-vector" viewBox="0 0 64 64" width="60" height="60" aria-hidden="true">
    <rect x="11" y="13" width="42" height="42" rx="8" fill="#3a3634" stroke="#6b5f57" stroke-width="2"/>
    <rect x="16" y="18" width="32" height="32" rx="5" fill="#25211f" stroke="#a89c94" stroke-width="1.2"/>
    <text x="32" y="42" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="22" font-weight="800" fill="#f6eede">C</text>
  </svg>`,
};
