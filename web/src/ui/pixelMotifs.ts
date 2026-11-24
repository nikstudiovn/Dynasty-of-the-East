// Pixel-Lacquer Đại Việt SVG Motifs (crispEdges, integer grid, no gradients, no blur)

export const DONG_SON_DRUM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="6" y="2" width="20" height="2" fill="#1A0E0A"/>
  <rect x="4" y="4" width="2" height="2" fill="#1A0E0A"/>
  <rect x="26" y="4" width="2" height="2" fill="#1A0E0A"/>
  <rect x="2" y="6" width="2" height="20" fill="#1A0E0A"/>
  <rect x="28" y="6" width="2" height="20" fill="#1A0E0A"/>
  <rect x="4" y="26" width="2" height="2" fill="#1A0E0A"/>
  <rect x="26" y="26" width="2" height="2" fill="#1A0E0A"/>
  <rect x="6" y="28" width="20" height="2" fill="#1A0E0A"/>
  <rect x="6" y="4" width="20" height="24" fill="#3A2218"/>
  <rect x="4" y="6" width="24" height="20" fill="#3A2218"/>
  <rect x="8" y="5" width="16" height="1" fill="#8A5A14"/>
  <rect x="8" y="26" width="16" height="1" fill="#8A5A14"/>
  <rect x="5" y="8" width="1" height="16" fill="#8A5A14"/>
  <rect x="26" y="8" width="1" height="16" fill="#8A5A14"/>
  <rect x="9" y="7" width="14" height="1" fill="#F5B841"/>
  <rect x="9" y="24" width="14" height="1" fill="#F5B841"/>
  <rect x="7" y="9" width="1" height="14" fill="#F5B841"/>
  <rect x="24" y="9" width="1" height="14" fill="#F5B841"/>
  <rect x="8" y="8" width="16" height="16" fill="#7A1F1A"/>
  <rect x="11" y="10" width="10" height="1" fill="#F5B841"/>
  <rect x="11" y="21" width="10" height="1" fill="#F5B841"/>
  <rect x="10" y="11" width="1" height="10" fill="#F5B841"/>
  <rect x="21" y="11" width="1" height="10" fill="#F5B841"/>
  <rect x="15" y="7" width="2" height="4" fill="#FFE9A8"/>
  <rect x="15" y="21" width="2" height="4" fill="#FFE9A8"/>
  <rect x="7" y="15" width="4" height="2" fill="#FFE9A8"/>
  <rect x="21" y="15" width="4" height="2" fill="#FFE9A8"/>
  <rect x="11" y="11" width="2" height="2" fill="#F5B841"/>
  <rect x="19" y="11" width="2" height="2" fill="#F5B841"/>
  <rect x="11" y="19" width="2" height="2" fill="#F5B841"/>
  <rect x="19" y="19" width="2" height="2" fill="#F5B841"/>
  <rect x="13" y="13" width="6" height="6" fill="#F5B841"/>
  <rect x="14" y="14" width="4" height="4" fill="#FFE9A8"/>
  <rect x="15" y="15" width="2" height="2" fill="#B22B22"/>
</svg>`;

export const CLOUD_DIVIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 16" width="64" height="32" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="0" y="7" width="32" height="2" fill="#8A5A14"/>
  <rect x="2" y="6" width="4" height="4" fill="#F5B841"/>
  <rect x="3" y="5" width="2" height="6" fill="#FFE9A8"/>
  <rect x="8" y="6" width="4" height="4" fill="#3A2218"/>
  <rect x="9" y="7" width="2" height="2" fill="#B22B22"/>
  <rect x="13" y="4" width="6" height="8" fill="#1A0E0A"/>
  <rect x="14" y="3" width="4" height="10" fill="#7A1F1A"/>
  <rect x="15" y="4" width="2" height="8" fill="#F5B841"/>
  <rect x="14" y="6" width="4" height="4" fill="#FFE9A8"/>
  <rect x="15" y="7" width="2" height="2" fill="#B22B22"/>
  <rect x="20" y="6" width="4" height="4" fill="#3A2218"/>
  <rect x="21" y="7" width="2" height="2" fill="#B22B22"/>
  <rect x="26" y="6" width="4" height="4" fill="#F5B841"/>
  <rect x="27" y="5" width="2" height="6" fill="#FFE9A8"/>
</svg>`;

export type FactionKey = 'dai_viet' | 'trung_nguyen' | 'bac_cuong';

export const FACTION_CRESTS: Record<FactionKey, string> = {
  dai_viet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="2" y="1" width="12" height="2" fill="#1A0E0A"/>
    <rect x="1" y="3" width="14" height="7" fill="#1A0E0A"/>
    <rect x="2" y="10" width="12" height="2" fill="#1A0E0A"/>
    <rect x="4" y="12" width="8" height="2" fill="#1A0E0A"/>
    <rect x="6" y="14" width="4" height="1" fill="#1A0E0A"/>
    <rect x="3" y="2" width="10" height="8" fill="#F5B841"/>
    <rect x="4" y="10" width="8" height="2" fill="#F5B841"/>
    <rect x="6" y="12" width="4" height="2" fill="#8A5A14"/>
    <rect x="4" y="3" width="8" height="7" fill="#B22B22"/>
    <rect x="5" y="10" width="6" height="1" fill="#7A1F1A"/>
    <rect x="7" y="4" width="2" height="5" fill="#FFE9A8"/>
    <rect x="5" y="6" width="6" height="1" fill="#FFE9A8"/>
    <rect x="7" y="6" width="2" height="1" fill="#F5B841"/>
  </svg>`,
  trung_nguyen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="7" y="1" width="2" height="14" fill="#1A0E0A"/>
    <rect x="5" y="3" width="6" height="10" fill="#1A0E0A"/>
    <rect x="3" y="5" width="10" height="6" fill="#1A0E0A"/>
    <rect x="1" y="7" width="14" height="2" fill="#1A0E0A"/>
    <rect x="7" y="2" width="2" height="12" fill="#F5B841"/>
    <rect x="5" y="4" width="6" height="8" fill="#2F8F6B"/>
    <rect x="3" y="6" width="10" height="4" fill="#2F8F6B"/>
    <rect x="4" y="6" width="8" height="1" fill="#8A5A14"/>
    <rect x="7" y="3" width="2" height="10" fill="#FFE9A8"/>
    <rect x="5" y="7" width="6" height="2" fill="#F5B841"/>
    <rect x="7" y="7" width="2" height="2" fill="#FFE9A8"/>
  </svg>`,
  bac_cuong: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="7" y="1" width="2" height="2" fill="#1A0E0A"/>
    <rect x="5" y="3" width="6" height="2" fill="#1A0E0A"/>
    <rect x="4" y="5" width="8" height="3" fill="#1A0E0A"/>
    <rect x="2" y="8" width="12" height="4" fill="#1A0E0A"/>
    <rect x="1" y="12" width="14" height="3" fill="#1A0E0A"/>
    <rect x="7" y="2" width="2" height="2" fill="#FFE9A8"/>
    <rect x="6" y="4" width="4" height="2" fill="#2F8F6B"/>
    <rect x="5" y="6" width="6" height="3" fill="#2F8F6B"/>
    <rect x="3" y="9" width="10" height="4" fill="#3A2218"/>
    <rect x="4" y="10" width="8" height="2" fill="#2F8F6B"/>
    <rect x="6" y="6" width="4" height="1" fill="#FFE9A8"/>
    <rect x="7" y="7" width="2" height="4" fill="#FFE9A8"/>
    <rect x="3" y="13" width="10" height="1" fill="#8A5A14"/>
  </svg>`
};

export type RankTier = 'S' | 'A' | 'B' | 'C';

export const RANK_MEDALS: Record<RankTier, string> = {
  S: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="5" y="1" width="6" height="3" fill="#B22B22"/>
    <rect x="6" y="1" width="4" height="3" fill="#F5B841"/>
    <rect x="4" y="4" width="8" height="10" fill="#1A0E0A"/>
    <rect x="3" y="5" width="10" height="8" fill="#1A0E0A"/>
    <rect x="4" y="5" width="8" height="8" fill="#F5B841"/>
    <rect x="5" y="4" width="6" height="10" fill="#8A5A14"/>
    <rect x="5" y="5" width="6" height="8" fill="#F5B841"/>
    <rect x="6" y="6" width="4" height="1" fill="#FFE9A8"/>
    <rect x="6" y="7" width="2" height="2" fill="#1A0E0A"/>
    <rect x="7" y="8" width="3" height="2" fill="#1A0E0A"/>
    <rect x="8" y="10" width="2" height="2" fill="#1A0E0A"/>
    <rect x="6" y="11" width="3" height="1" fill="#1A0E0A"/>
  </svg>`,
  A: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="5" y="1" width="6" height="3" fill="#2F8F6B"/>
    <rect x="6" y="1" width="4" height="3" fill="#FFE9A8"/>
    <rect x="4" y="4" width="8" height="10" fill="#1A0E0A"/>
    <rect x="3" y="5" width="10" height="8" fill="#1A0E0A"/>
    <rect x="4" y="5" width="8" height="8" fill="#FFE9A8"/>
    <rect x="5" y="5" width="6" height="8" fill="#FFE9A8"/>
    <rect x="7" y="6" width="2" height="2" fill="#1A0E0A"/>
    <rect x="6" y="8" width="1" height="4" fill="#1A0E0A"/>
    <rect x="9" y="8" width="1" height="4" fill="#1A0E0A"/>
    <rect x="7" y="9" width="2" height="1" fill="#1A0E0A"/>
  </svg>`,
  B: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="5" y="1" width="6" height="3" fill="#7A1F1A"/>
    <rect x="4" y="4" width="8" height="10" fill="#1A0E0A"/>
    <rect x="3" y="5" width="10" height="8" fill="#1A0E0A"/>
    <rect x="4" y="5" width="8" height="8" fill="#8A5A14"/>
    <rect x="5" y="5" width="6" height="8" fill="#F5B841"/>
    <rect x="6" y="6" width="1" height="6" fill="#1A0E0A"/>
    <rect x="7" y="6" width="2" height="1" fill="#1A0E0A"/>
    <rect x="7" y="8" width="2" height="1" fill="#1A0E0A"/>
    <rect x="7" y="11" width="2" height="1" fill="#1A0E0A"/>
    <rect x="9" y="7" width="1" height="1" fill="#1A0E0A"/>
    <rect x="9" y="9" width="1" height="2" fill="#1A0E0A"/>
  </svg>`,
  C: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="5" y="1" width="6" height="3" fill="#3A2218"/>
    <rect x="4" y="4" width="8" height="10" fill="#1A0E0A"/>
    <rect x="3" y="5" width="10" height="8" fill="#1A0E0A"/>
    <rect x="4" y="5" width="8" height="8" fill="#3A2218"/>
    <rect x="5" y="5" width="6" height="8" fill="#8A5A14"/>
    <rect x="7" y="6" width="3" height="1" fill="#1A0E0A"/>
    <rect x="6" y="7" width="1" height="4" fill="#1A0E0A"/>
    <rect x="7" y="11" width="3" height="1" fill="#1A0E0A"/>
  </svg>`
};

