/**
 * Pixel-art inline SVG motifs for "Pixel lai Sơn mài Đại Việt" UI.
 * All graphics use crisp integer pixel grids (16x16 or 32x32) with
 * shape-rendering="crispEdges" and zero network requests (100% offline).
 */

export type FactionKey = "dai_viet" | "trung_nguyen" | "bac_cuong";
export type RankGrade = "S" | "A" | "B" | "C";

/**
 * 32x32 Đông Sơn bronze drum (Trống đồng Đông Sơn):
 * Concentric rings, 8-point sharp star rays, stepped pixel dots.
 */
export const MOTIF_DONG_SON_DRUM = `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
  <!-- Outer dark ink rim -->
  <path fill="#1A0E0A" d="M11 1h10v1h4v1h2v2h2v2h1v4h1v10h-1v4h-1v2h-2v2h-2v1h-4v1H11v-1H7v-1H5v-2H3v-2H2v-4H1V11h1V7h1V5h2V3h2V2h4V1z"/>
  <!-- Outer gold inlaid ring -->
  <path fill="#F5B841" d="M11 2h10v1h4v2h2v2h2v4h1v10h-1v4h-2v2h-2v2h-4v1H11v-1H7v-2H5v-2H3v-4H2V11h1V7h2V5h2V3h4V2z"/>
  <!-- Inner dark lacquer ring -->
  <path fill="#7A1F1A" d="M11 4h10v1h3v1h2v2h1v3h1v10h-1v3h-1v2h-2v1h-3v1H11v-1H8v-1H6v-2H5v-3H4V11h1V8h1V6h2V5h3V4z"/>
  <!-- Concentric gold beaded ring -->
  <rect x="12" y="6" width="8" height="1" fill="#8A5A14"/>
  <rect x="12" y="25" width="8" height="1" fill="#8A5A14"/>
  <rect x="6" y="12" width="1" height="8" fill="#8A5A14"/>
  <rect x="25" y="12" width="1" height="8" fill="#8A5A14"/>
  <rect x="8" y="8" width="2" height="2" fill="#F5B841"/>
  <rect x="22" y="8" width="2" height="2" fill="#F5B841"/>
  <rect x="8" y="22" width="2" height="2" fill="#F5B841"/>
  <rect x="22" y="22" width="2" height="2" fill="#F5B841"/>
  <rect x="15" y="5" width="2" height="1" fill="#FFE9A8"/>
  <rect x="15" y="26" width="2" height="1" fill="#FFE9A8"/>
  <rect x="5" y="15" width="1" height="2" fill="#FFE9A8"/>
  <rect x="26" y="15" width="1" height="2" fill="#FFE9A8"/>
  <!-- Inner dark wood core -->
  <path fill="#3A2218" d="M12 8h8v1h2v1h1v2h1v8h-1v2h-1v1h-2v1h-8v-1h-2v-1H9v-2H8v-8h1v-2h1V9h2V8z"/>
  <!-- 8-point Đông Sơn sharp sun rays -->
  <rect x="15" y="7" width="2" height="6" fill="#F5B841"/>
  <rect x="15" y="19" width="2" height="6" fill="#F5B841"/>
  <rect x="7" y="15" width="6" height="2" fill="#F5B841"/>
  <rect x="19" y="15" width="6" height="2" fill="#F5B841"/>
  <!-- Diagonal rays -->
  <rect x="10" y="10" width="2" height="2" fill="#F5B841"/>
  <rect x="12" y="12" width="2" height="2" fill="#FFE9A8"/>
  <rect x="20" y="10" width="2" height="2" fill="#F5B841"/>
  <rect x="18" y="12" width="2" height="2" fill="#FFE9A8"/>
  <rect x="10" y="20" width="2" height="2" fill="#F5B841"/>
  <rect x="12" y="18" width="2" height="2" fill="#FFE9A8"/>
  <rect x="20" y="20" width="2" height="2" fill="#F5B841"/>
  <rect x="18" y="18" width="2" height="2" fill="#FFE9A8"/>
  <!-- Sun core with lacquer sheen -->
  <rect x="13" y="13" width="6" height="6" fill="#F5B841"/>
  <rect x="14" y="14" width="4" height="4" fill="#FFE9A8"/>
  <rect x="14" y="14" width="2" height="1" fill="#FFF7D6"/>
  <rect x="15" y="15" width="2" height="2" fill="#B22B22"/>
</svg>`;

/**
 * 16x16 Rolling Cloud / Hồi Văn corner ornament (2x scaled -> 32x32).
 */
export const MOTIF_CORNER_CLOUD = `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="0" y="0" width="14" height="2" fill="#F5B841"/>
  <rect x="0" y="0" width="2" height="14" fill="#F5B841"/>
  <rect x="2" y="2" width="10" height="1" fill="#FFE9A8"/>
  <rect x="2" y="2" width="1" height="10" fill="#FFE9A8"/>
  <rect x="4" y="4" width="6" height="2" fill="#8A5A14"/>
  <rect x="4" y="4" width="2" height="6" fill="#8A5A14"/>
  <rect x="6" y="6" width="3" height="3" fill="#B22B22"/>
  <rect x="7" y="7" width="1" height="1" fill="#FFE9A8"/>
  <rect x="12" y="2" width="2" height="2" fill="#F5B841"/>
  <rect x="2" y="12" width="2" height="2" fill="#F5B841"/>
</svg>`;

/**
 * 64x12 Lotus & Rolling Wave horizontal divider (Hoa sen & Sóng nước).
 */
export const MOTIF_DIVIDER_LOTUS = `<svg class="pd-svg-pixel" viewBox="0 0 64 12" width="128" height="24" shape-rendering="crispEdges" aria-hidden="true">
  <!-- Left wave scroll -->
  <rect x="2" y="6" width="18" height="2" fill="#8A5A14"/>
  <rect x="4" y="5" width="14" height="1" fill="#F5B841"/>
  <rect x="6" y="3" width="4" height="2" fill="#F5B841"/>
  <rect x="12" y="4" width="4" height="1" fill="#FFE9A8"/>
  <rect x="2" y="8" width="4" height="1" fill="#B22B22"/>
  <!-- Right wave scroll -->
  <rect x="44" y="6" width="18" height="2" fill="#8A5A14"/>
  <rect x="46" y="5" width="14" height="1" fill="#F5B841"/>
  <rect x="54" y="3" width="4" height="2" fill="#F5B841"/>
  <rect x="48" y="4" width="4" height="1" fill="#FFE9A8"/>
  <rect x="58" y="8" width="4" height="1" fill="#B22B22"/>
  <!-- Center pixel lotus -->
  <rect x="30" y="1" width="4" height="2" fill="#FFE9A8"/>
  <rect x="29" y="3" width="6" height="3" fill="#F5B841"/>
  <rect x="25" y="4" width="4" height="3" fill="#B22B22"/>
  <rect x="35" y="4" width="4" height="3" fill="#B22B22"/>
  <rect x="23" y="6" width="4" height="2" fill="#F5B841"/>
  <rect x="37" y="6" width="4" height="2" fill="#F5B841"/>
  <rect x="27" y="7" width="10" height="2" fill="#8A5A14"/>
  <rect x="29" y="9" width="6" height="2" fill="#2F8F6B"/>
  <rect x="31" y="4" width="2" height="2" fill="#FFE9A8"/>
</svg>`;

/**
 * 16x16 Pixel Lantern for subtle 4-frame stepped sway animation.
 */
export const MOTIF_LANTERN = `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="7" y="0" width="2" height="2" fill="#F5B841"/>
  <rect x="5" y="2" width="6" height="2" fill="#8A5A14"/>
  <rect x="4" y="4" width="8" height="7" fill="#B22B22"/>
  <rect x="3" y="5" width="1" height="5" fill="#7A1F1A"/>
  <rect x="12" y="5" width="1" height="5" fill="#7A1F1A"/>
  <rect x="5" y="5" width="2" height="4" fill="#F5B841"/>
  <rect x="6" y="5" width="1" height="2" fill="#FFE9A8"/>
  <rect x="9" y="5" width="2" height="4" fill="#7A1F1A"/>
  <rect x="5" y="11" width="6" height="2" fill="#8A5A14"/>
  <rect x="7" y="13" width="2" height="3" fill="#F5B841"/>
</svg>`;

/**
 * Distinct 32x32 pixel crests for the 3 factions.
 */
export const FACTION_CRESTS: Record<FactionKey, string> = {
  dai_viet: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="#1A0E0A" d="M10 2h12v1h3v2h2v2h2v3h1v12h-1v3h-2v2h-2v2h-3v1H10v-1H7v-2H5v-2H3v-3H2V10h1V7h2V5h2V3h3V2z"/>
    <path fill="#F5B841" d="M10 3h12v2h3v2h2v3h2v12h-2v3h-2v2h-3v2H10v-2H7v-2H5v-3H3V10h2V7h2V5h3V3z"/>
    <path fill="#B22B22" d="M11 5h10v2h3v2h1v2h2v10h-2v2h-1v2h-3v2H11v-2H8v-2H7v-2H5V11h2V9h1V7h3V5z"/>
    <path fill="#7A1F1A" d="M11 17h10v2h3v2h-2v2h-1v2H11v-2H8v-2H7v-2h4v-2z"/>
    <rect x="8" y="8" width="3" height="2" fill="#FFE9A8"/>
    <rect x="7" y="10" width="2" height="2" fill="#F5B841"/>
    <rect x="15" y="7" width="2" height="18" fill="#F5B841"/>
    <rect x="7" y="15" width="18" height="2" fill="#F5B841"/>
    <rect x="10" y="10" width="2" height="2" fill="#FFE9A8"/>
    <rect x="12" y="12" width="2" height="2" fill="#F5B841"/>
    <rect x="20" y="10" width="2" height="2" fill="#FFE9A8"/>
    <rect x="18" y="12" width="2" height="2" fill="#F5B841"/>
    <rect x="10" y="20" width="2" height="2" fill="#F5B841"/>
    <rect x="12" y="18" width="2" height="2" fill="#F5B841"/>
    <rect x="20" y="20" width="2" height="2" fill="#F5B841"/>
    <rect x="18" y="18" width="2" height="2" fill="#F5B841"/>
    <rect x="13" y="13" width="6" height="6" fill="#FFE9A8"/>
    <rect x="14" y="14" width="4" height="4" fill="#B22B22"/>
    <rect x="15" y="15" width="2" height="2" fill="#FFE9A8"/>
  </svg>`,

  trung_nguyen: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="#1A0E0A" d="M13 2h6v2h4v2h4v3h2v14h-2v3h-4v2h-4v2h-6v-2H9v-2H5v-3H3V9h2V6h4V4h4V2z"/>
    <path fill="#F5B841" d="M13 3h6v2h4v2h4v3h1v12h-1v3h-4v2h-4v2h-6v-2H9v-2H5v-3H4V10h1V7h4V5h4V3z"/>
    <path fill="#2F8F6B" d="M13 5h6v2h4v2h3v14h-3v2h-4v2h-6v-2H9v-2H6V9h3V7h4V5z"/>
    <path fill="#1E5C45" d="M16 5h3v2h4v2h3v14h-3v2h-4v2h-3V5z"/>
    <rect x="15" y="7" width="2" height="17" fill="#FFE9A8"/>
    <rect x="14" y="6" width="4" height="2" fill="#F5B841"/>
    <rect x="15" y="5" width="2" height="1" fill="#FFE9A8"/>
    <rect x="8" y="11" width="16" height="2" fill="#F5B841"/>
    <rect x="7" y="13" width="3" height="2" fill="#FFE9A8"/>
    <rect x="22" y="13" width="3" height="2" fill="#FFE9A8"/>
    <rect x="9" y="15" width="2" height="1" fill="#CBD5E1"/>
    <rect x="11" y="16" width="2" height="1" fill="#CBD5E1"/>
    <rect x="13" y="17" width="6" height="1" fill="#CBD5E1"/>
    <rect x="19" y="16" width="2" height="1" fill="#CBD5E1"/>
    <rect x="21" y="15" width="2" height="1" fill="#CBD5E1"/>
    <rect x="13" y="12" width="6" height="4" fill="#8A5A14"/>
    <rect x="14" y="13" width="4" height="2" fill="#B22B22"/>
    <rect x="13" y="23" width="6" height="2" fill="#8A5A14"/>
  </svg>`,

  bac_cuong: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="#1A0E0A" d="M4 3h24v16h-2v3h-2v2h-2v2h-3v2h-2v2h-2v-2h-2v-2h-3v-2H8v-2H6v-3H4V3z"/>
    <path fill="#CBD5E1" d="M5 4h22v14h-2v3h-2v2h-2v2h-3v2h-4v-2h-3v-2H9v-2H7v-3H5V4z"/>
    <path fill="#355C8C" d="M7 6h18v12h-2v3h-2v2h-3v2h-4v-2h-3v-2H9v-3H7V6z"/>
    <path fill="#223B5C" d="M16 6h9v12h-2v3h-2v2h-3v2h-2V6z"/>
    <rect x="13" y="8" width="4" height="2" fill="#FFE9A8"/>
    <rect x="17" y="7" width="2" height="2" fill="#F5B841"/>
    <rect x="11" y="10" width="8" height="4" fill="#CBD5E1"/>
    <rect x="9" y="13" width="5" height="3" fill="#CBD5E1"/>
    <rect x="10" y="12" width="2" height="1" fill="#1A0E0A"/>
    <rect x="18" y="10" width="3" height="2" fill="#F5B841"/>
    <rect x="19" y="12" width="3" height="3" fill="#F5B841"/>
    <rect x="18" y="15" width="3" height="3" fill="#8A5A14"/>
    <rect x="13" y="14" width="6" height="6" fill="#CBD5E1"/>
    <rect x="12" y="19" width="8" height="2" fill="#F5B841"/>
    <rect x="14" y="21" width="4" height="2" fill="#B22B22"/>
  </svg>`,
};

/**
 * 32x32 Pixel-art Rank Medals for Endgame Scoreboard:
 */
export const RANK_MEDALS: Record<RankGrade, string> = {
  S: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="64" height="64" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="9" y="1" width="14" height="6" fill="#7A1F1A"/>
    <rect x="11" y="1" width="10" height="5" fill="#B22B22"/>
    <rect x="15" y="1" width="2" height="5" fill="#F5B841"/>
    <path fill="#1A0E0A" d="M10 6h12v2h4v4h2v10h-2v4h-4v2H10v-2H6v-4H4V12h2V8h4V6z"/>
    <path fill="#8A5A14" d="M10 7h12v2h4v4h1v8h-1v4h-4v2H10v-2H6v-4H5v-8h1V9h4V7z"/>
    <path fill="#F5B841" d="M11 9h10v2h3v3h1v6h-1v3h-3v2H11v-2H8v-3H7v-6h1v-3h3V9z"/>
    <path fill="#FFE9A8" d="M11 9h10v2h-8v3H8v-3h3V9z"/>
    <rect x="10" y="11" width="12" height="12" fill="#7A1F1A"/>
    <rect x="11" y="12" width="10" height="10" fill="#B22B22"/>
    <rect x="13" y="13" width="6" height="2" fill="#FFE9A8"/>
    <rect x="13" y="15" width="2" height="2" fill="#FFE9A8"/>
    <rect x="13" y="16" width="6" height="2" fill="#F5B841"/>
    <rect x="17" y="18" width="2" height="2" fill="#F5B841"/>
    <rect x="13" y="19" width="6" height="2" fill="#FFE9A8"/>
  </svg>`,

  A: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="64" height="64" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="10" y="1" width="12" height="6" fill="#355C8C"/>
    <rect x="14" y="1" width="4" height="5" fill="#CBD5E1"/>
    <path fill="#1A0E0A" d="M10 6h12v2h4v4h2v10h-2v4h-4v2H10v-2H6v-4H4V12h2V8h4V6z"/>
    <path fill="#CBD5E1" d="M10 7h12v2h4v4h1v8h-1v4h-4v2H10v-2H6v-4H5v-8h1V9h4V7z"/>
    <path fill="#3A2218" d="M10 10h12v14H10V10z"/>
    <rect x="11" y="11" width="10" height="12" fill="#1A0E0A"/>
    <rect x="14" y="13" width="4" height="2" fill="#FFE9A8"/>
    <rect x="13" y="15" width="2" height="6" fill="#CBD5E1"/>
    <rect x="17" y="15" width="2" height="6" fill="#CBD5E1"/>
    <rect x="13" y="17" width="6" height="2" fill="#F5B841"/>
  </svg>`,

  B: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="64" height="64" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="10" y="1" width="12" height="6" fill="#2F8F6B"/>
    <rect x="14" y="1" width="4" height="5" fill="#F5B841"/>
    <path fill="#1A0E0A" d="M9 7h14v2h3v16h-3v2H9v-2H6V9h3V7z"/>
    <path fill="#8A5A14" d="M10 8h12v2h3v14h-3v2H10v-2H7V10h3V8z"/>
    <rect x="10" y="11" width="12" height="12" fill="#3A2218"/>
    <rect x="13" y="13" width="5" height="2" fill="#F5B841"/>
    <rect x="13" y="13" width="2" height="8" fill="#F5B841"/>
    <rect x="17" y="15" width="2" height="1" fill="#F5B841"/>
    <rect x="13" y="16" width="5" height="2" fill="#F5B841"/>
    <rect x="17" y="18" width="2" height="2" fill="#F5B841"/>
    <rect x="13" y="19" width="5" height="2" fill="#F5B841"/>
  </svg>`,

  C: `<svg class="pd-svg-pixel" viewBox="0 0 32 32" width="64" height="64" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="5" y="5" width="22" height="22" fill="#1A0E0A"/>
    <rect x="6" y="6" width="20" height="20" fill="#8A5A14"/>
    <rect x="8" y="8" width="16" height="16" fill="#3A2218"/>
    <rect x="9" y="9" width="14" height="2" fill="#7A1F1A"/>
    <rect x="13" y="12" width="6" height="2" fill="#FFE9A8"/>
    <rect x="13" y="12" width="2" height="8" fill="#FFE9A8"/>
    <rect x="13" y="18" width="6" height="2" fill="#FFE9A8"/>
  </svg>`,
};

export const PIXEL_ICONS = {
  swords: `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="2" y="2" width="2" height="2" fill="#FFE9A8"/>
    <rect x="4" y="4" width="2" height="2" fill="#CBD5E1"/>
    <rect x="6" y="6" width="4" height="4" fill="#CBD5E1"/>
    <rect x="12" y="2" width="2" height="2" fill="#FFE9A8"/>
    <rect x="10" y="4" width="2" height="2" fill="#CBD5E1"/>
    <rect x="4" y="10" width="2" height="2" fill="#F5B841"/>
    <rect x="2" y="12" width="2" height="2" fill="#8A5A14"/>
    <rect x="10" y="10" width="2" height="2" fill="#F5B841"/>
    <rect x="12" y="12" width="2" height="2" fill="#8A5A14"/>
  </svg>`,

  multi: `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="3" y="2" width="2" height="12" fill="#F5B841"/>
    <rect x="5" y="2" width="8" height="6" fill="#B22B22"/>
    <rect x="7" y="4" width="4" height="2" fill="#FFE9A8"/>
    <rect x="2" y="13" width="4" height="2" fill="#8A5A14"/>
  </svg>`,

  save: `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="2" y="2" width="12" height="12" fill="#2F8F6B"/>
    <rect x="4" y="2" width="8" height="4" fill="#FFE9A8"/>
    <rect x="9" y="3" width="2" height="2" fill="#1A0E0A"/>
    <rect x="4" y="8" width="8" height="5" fill="#F5B841"/>
    <rect x="5" y="9" width="6" height="1" fill="#3A2218"/>
    <rect x="5" y="11" width="4" height="1" fill="#3A2218"/>
  </svg>`,

  guide: `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" fill="#8A5A14"/>
    <rect x="3" y="4" width="10" height="8" fill="#FFE9A8"/>
    <rect x="7" y="4" width="2" height="8" fill="#8A5A14"/>
    <rect x="4" y="6" width="2" height="1" fill="#3A2218"/>
    <rect x="4" y="8" width="2" height="1" fill="#3A2218"/>
    <rect x="10" y="6" width="2" height="1" fill="#3A2218"/>
    <rect x="10" y="8" width="2" height="1" fill="#3A2218"/>
  </svg>`,

  settings: `<svg class="pd-svg-pixel" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="6" y="1" width="4" height="2" fill="#F5B841"/>
    <rect x="6" y="13" width="4" height="2" fill="#F5B841"/>
    <rect x="1" y="6" width="2" height="4" fill="#F5B841"/>
    <rect x="13" y="6" width="2" height="4" fill="#F5B841"/>
    <rect x="3" y="3" width="10" height="10" fill="#F5B841"/>
    <rect x="5" y="5" width="6" height="6" fill="#3A2218"/>
    <rect x="7" y="7" width="2" height="2" fill="#FFE9A8"/>
  </svg>`,
} as const;
