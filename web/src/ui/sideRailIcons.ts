export type SideRailIconKey =
  | "grp_1" | "grp_2" | "grp_3" | "grp_assign" | "all_army" | "idle_vil" | "town_bell"
  | "focus_tc" | "attack_move" | "stance" | "tab_eco" | "tab_mil" | "tab_def" | "train"
  | "age_up" | "house" | "depot" | "farm" | "barracks" | "archery_range" | "watch_tower"
  | "wall" | "gate" | "market" | "blacksmith" | "stable" | "siege_workshop" | "imperial_citadel"
  | "villager" | "sword" | "spear" | "archer" | "crossbow" | "cavalry" | "elephant"
  | "horse_archer" | "siege" | "unique" | "upgrade_atk" | "upgrade_def" | "trade" | "rally"
  | "temple" | "healer" | "dock" | "fishing_boat" | "galley" | "fire_ship" | "collapse" | "expand" | "left_hand" | "default_cmd";

const K = {
  gold: "#E5B454", goldLight: "#FCE5A6", crimson: "#B8352D", crimsonDark: "#6E1D18",
  jade: "#2F9670", steel: "#CBD5E1", steelDark: "#64748B", wood: "#9C6B43", woodDark: "#5A3821", ink: "#160F0C",
} as const;

const badge = (num: string): string =>
  `<rect x="3" y="3" width="18" height="18" rx="4" fill="${K.crimsonDark}" stroke="${K.gold}" stroke-width="1.6"/>` +
  `<text x="12" y="16.5" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="12" font-weight="800" fill="${K.goldLight}">${num}</text>`;

const ICON_BODY: Record<SideRailIconKey, string> = {
  dock: `<path d="M3 9l8-6 8 6H3zm2 3h12v7H5z" fill="${K.gold}" /><path d="M2 21q4-3 8 0t8 0h4" fill="none" stroke="${K.jade}" stroke-width="2"/>`,
  fishing_boat: `<path d="M3 16h18l-4 5H7zM12 3v11H5z" fill="${K.gold}" stroke="${K.goldLight}"/>`,
  galley: `<path d="M2 15h20l-4 6H6zM12 2v11H4zm2 4 5 7h-5z" fill="${K.jade}" stroke="${K.goldLight}"/>`,
  fire_ship: `<path d="M3 17h18l-4 4H7zM12 3c4 4 0 5 5 6 1 5-1 6-5 6-5 0-6-4-2-7 1 2 3 0 2-5z" fill="${K.crimsonDark}" stroke="${K.goldLight}"/>`,
  temple: `<path d="M3 11l9-7 9 7H3z" fill="${K.jade}" stroke="${K.gold}"/><path d="M6 12v8m12-8v8M4 20h16" stroke="${K.goldLight}" stroke-width="2"/>`,
  healer: `<circle cx="12" cy="12" r="9" fill="${K.jade}"/><path d="M8 12h8m-4-4v8" stroke="${K.goldLight}" stroke-width="2.5"/>`,
  grp_1: badge("1"),
  grp_2: badge("2"),
  grp_3: badge("3"),
  grp_assign: `<rect x="3" y="3" width="18" height="18" rx="4" fill="${K.woodDark}" stroke="${K.gold}" stroke-width="1.5"/><path d="M12 7v10M7 12h10" stroke="${K.goldLight}" stroke-width="2.4" stroke-linecap="round"/>`,
  all_army: `<path d="M6 17L16 5l2 2-10 12z" fill="${K.steel}"/><path d="M18 17L8 5 6 7l10 12z" fill="${K.goldLight}"/><path d="M5 15l3 3M19 15l-3 3" stroke="${K.gold}" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="2" fill="${K.crimson}"/>`,
  idle_vil: `<circle cx="10.5" cy="6.5" r="3" fill="${K.goldLight}"/><path d="M5.5 19c0-3.2 2.2-5.2 5-5.2s5 2 5 5.2" fill="${K.jade}" stroke="${K.gold}" stroke-width="1.2"/><circle cx="18.5" cy="7.5" r="3.5" fill="${K.crimson}" stroke="${K.goldLight}" stroke-width="1"/><path d="M18.5 5.5v2.4M18.5 9.5v.3" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`,
  town_bell: `<path d="M12 4a1.5 1.5 0 0 1 1.5 1.5c2.8.8 4.5 3.3 4.5 6.5v3l2 2H4l2-2v-3c0-3.2 1.7-5.7 4.5-6.5A1.5 1.5 0 0 1 12 4z" fill="${K.gold}" stroke="${K.ink}" stroke-width="1"/><circle cx="12" cy="19.5" r="2" fill="${K.crimson}"/>`,
  focus_tc: `<path d="M3 11L12 4l9 7z" fill="${K.crimson}" stroke="${K.gold}" stroke-width="1.3" stroke-linejoin="round"/><rect x="6" y="11" width="12" height="9" rx="1" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.2"/><path d="M10 20v-5a2 2 0 0 1 4 0v5z" fill="${K.goldLight}"/>`,
  attack_move: `<path d="M5 19L17 7" stroke="${K.steel}" stroke-width="2.4" stroke-linecap="round"/><polygon points="19,5 12,6 18,12" fill="${K.crimson}" stroke="${K.goldLight}" stroke-width="0.9"/><path d="M4 15l5 5" stroke="${K.gold}" stroke-width="2" stroke-linecap="round"/>`,
  stance: `<path d="M6 4h12v8c0 5-6 8.5-6 8.5S6 17 6 12z" fill="${K.crimsonDark}" stroke="${K.gold}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.8" fill="${K.goldLight}"/>`,
  tab_eco: `<path d="M12 4v15" stroke="${K.gold}" stroke-width="2" stroke-linecap="round"/><path d="M12 10c-3.5 0-6-2-6-5 3.5 0 6 2 6 5zm0 4c3.5 0 6-2 6-5-3.5 0-6 2-6 5z" fill="${K.jade}" stroke="${K.goldLight}" stroke-width="0.8"/>`,
  tab_mil: `<path d="M5 18L18 5l1.5 1.5L6.5 19.5z" fill="${K.steel}"/><path d="M19 18L6 5 4.5 6.5l13 13z" fill="${K.goldLight}"/><circle cx="12" cy="12" r="2.5" fill="${K.crimson}" stroke="${K.gold}" stroke-width="1"/>`,
  tab_def: `<path d="M4 9V5h3v2h3V5h4v2h3V5h3v4l-1 1v10H5V10z" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.4" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="6" rx="2" fill="${K.ink}"/>`,
  train: `<circle cx="12" cy="7" r="3.2" fill="${K.goldLight}"/><path d="M6 20c0-3.5 2.7-6 6-6s6 2.5 6 6" fill="${K.crimson}" stroke="${K.gold}" stroke-width="1.3"/>`,
  age_up: `<path d="M12 4l6 6h-3.5v9h-5v-9H6z" fill="${K.gold}" stroke="${K.goldLight}" stroke-width="1.1" stroke-linejoin="round"/>`,
  house: `<path d="M3 12l9-7 9 7z" fill="${K.crimson}" stroke="${K.gold}" stroke-width="1.2" stroke-linejoin="round"/><rect x="6" y="12" width="12" height="8" fill="${K.wood}" stroke="${K.gold}" stroke-width="1"/><rect x="10" y="15" width="4" height="5" fill="${K.goldLight}"/>`,
  depot: `<rect x="4" y="8" width="16" height="12" rx="1.5" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.4"/><path d="M3 9l9-4 9 4" fill="${K.crimsonDark}" stroke="${K.gold}" stroke-width="1.2"/><rect x="8" y="13" width="8" height="4" rx="1" fill="${K.goldLight}"/>`,
  farm: `<rect x="3" y="5" width="18" height="14" rx="2" fill="${K.woodDark}" stroke="${K.gold}" stroke-width="1.3"/><path d="M6 9h12M6 12h12M6 15h12" stroke="${K.gold}" stroke-width="2" stroke-linecap="round"/><path d="M6 9h5M13 15h5" stroke="${K.jade}" stroke-width="2" stroke-linecap="round"/>`,
  barracks: `<path d="M4 10l8-5 8 5v10H4z" fill="${K.woodDark}" stroke="${K.gold}" stroke-width="1.3"/><path d="M3 10l9-5 9 5" fill="none" stroke="${K.crimson}" stroke-width="2.4" stroke-linecap="round"/><path d="M10 20v-6h4v6" fill="${K.crimson}"/>`,
  archery_range: `<circle cx="12" cy="12" r="8" fill="${K.goldLight}" stroke="${K.wood}" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="${K.crimson}"/><circle cx="12" cy="12" r="2.2" fill="${K.gold}"/>`,
  watch_tower: `<path d="M8 9h8l1 11H7z" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.2"/><path d="M6 9l6-5 6 5z" fill="${K.crimson}" stroke="${K.gold}" stroke-width="1.2"/><rect x="11" y="12" width="2" height="4" fill="${K.goldLight}"/>`,
  wall: `<path d="M3 7h4v3h3V7h4v3h3V7h4v12H3z" fill="${K.steelDark}" stroke="${K.gold}" stroke-width="1.3" stroke-linejoin="round"/><path d="M3 14h18" stroke="${K.ink}" stroke-width="1"/>`,
  gate: `<rect x="3" y="5" width="18" height="15" rx="1" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.4"/><path d="M8 20v-7a4 4 0 0 1 8 0v7z" fill="${K.ink}" stroke="${K.goldLight}" stroke-width="1.2"/>`,
  market: `<path d="M3 10l2-5h14l2 5z" fill="${K.jade}" stroke="${K.gold}" stroke-width="1.2"/><rect x="5" y="10" width="14" height="10" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.2"/><circle cx="12" cy="15" r="2.5" fill="${K.goldLight}"/>`,
  blacksmith: `<path d="M5 13h14l-2 4H7z" fill="${K.steelDark}" stroke="${K.gold}" stroke-width="1.2"/><rect x="9" y="17" width="6" height="3" fill="${K.woodDark}"/><path d="M14 5l4 4-3 3-4-4z" fill="${K.goldLight}"/>`,
  stable: `<path d="M4 11l8-6 8 6v9H4z" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.3"/><path d="M9 17c0-3 1.5-5 3-5s3 2 3 5" fill="none" stroke="${K.goldLight}" stroke-width="2" stroke-linecap="round"/>`,
  siege_workshop: `<rect x="5" y="11" width="14" height="5" rx="1" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.2"/><circle cx="8" cy="17" r="3" fill="${K.gold}" stroke="${K.ink}" stroke-width="1"/><circle cx="16" cy="17" r="3" fill="${K.gold}" stroke="${K.ink}" stroke-width="1"/><path d="M7 11l10-6" stroke="${K.steel}" stroke-width="2.2" stroke-linecap="round"/>`,
  imperial_citadel: `<path d="M12 2l3 4H9z" fill="${K.goldLight}"/><path d="M5 9l7-4 7 4z" fill="${K.crimson}" stroke="${K.gold}" stroke-width="1.2"/><rect x="4" y="9" width="16" height="11" fill="${K.crimsonDark}" stroke="${K.gold}" stroke-width="1.3"/><rect x="9" y="13" width="6" height="7" fill="${K.gold}"/>`,
  villager: `<path d="M6 9l6-5 6 5z" fill="${K.gold}" stroke="${K.woodDark}" stroke-width="1"/><circle cx="12" cy="11" r="2.6" fill="${K.goldLight}"/><path d="M7 20c0-3 2.2-5 5-5s5 2 5 5" fill="${K.jade}"/>`,
  sword: `<path d="M5 19L18 6l1.5 1.5L6.5 20.5z" fill="${K.steel}" stroke="${K.ink}" stroke-width="0.6"/><path d="M7 14l4 4" stroke="${K.gold}" stroke-width="2.2" stroke-linecap="round"/><circle cx="5.5" cy="19.5" r="1.8" fill="${K.crimson}"/>`,
  spear: `<path d="M4 20L17 7" stroke="${K.wood}" stroke-width="2" stroke-linecap="round"/><polygon points="20,4 14,6 18,10" fill="${K.steel}" stroke="${K.goldLight}" stroke-width="0.8"/>`,
  archer: `<path d="M15 4c-5 4-5 12 0 16" fill="none" stroke="${K.gold}" stroke-width="2.2" stroke-linecap="round"/><line x1="15" y1="4" x2="15" y2="20" stroke="${K.steel}" stroke-width="1"/><path d="M7 12h12" stroke="${K.goldLight}" stroke-width="1.6"/><polygon points="20,12 16,10 16,14" fill="${K.crimson}"/>`,
  crossbow: `<path d="M5 9Q12 5 19 9" fill="none" stroke="${K.gold}" stroke-width="2.2" stroke-linecap="round"/><rect x="10.8" y="4" width="2.4" height="15" rx="1" fill="${K.wood}" stroke="${K.goldLight}" stroke-width="0.7"/><polygon points="12,3 14.5,6.5 9.5,6.5" fill="${K.crimson}"/>`,
  cavalry: `<path d="M6 19l1-7 4-4 3-3 2 2 3 1 1 4-3 2v5z" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="15" cy="9" r="1" fill="${K.ink}"/>`,
  elephant: `<path d="M5 10c0-3 3-5 7-5s7 2 7 6v5h-2v4h-3v-4h-4v4H7v-4H5z" fill="${K.steelDark}" stroke="${K.gold}" stroke-width="1.2"/><path d="M17 13c2 0 3 2 2 4" fill="none" stroke="${K.goldLight}" stroke-width="2" stroke-linecap="round"/><rect x="9" y="4" width="6" height="3" rx="1" fill="${K.crimson}"/>`,
  horse_archer: `<path d="M5 18l1-6 4-3 3-3 2 2 3 1 1 3-3 2v4z" fill="${K.crimsonDark}" stroke="${K.gold}" stroke-width="1.2"/><path d="M17 4c-3 3-3 7 0 10" fill="none" stroke="${K.goldLight}" stroke-width="1.8" stroke-linecap="round"/>`,
  siege: `<rect x="4" y="12" width="16" height="4" rx="1" fill="${K.wood}" stroke="${K.gold}" stroke-width="1.2"/><circle cx="8" cy="17" r="3" fill="${K.gold}"/><circle cx="16" cy="17" r="3" fill="${K.gold}"/><path d="M7 12L17 5" stroke="${K.crimson}" stroke-width="2.4" stroke-linecap="round"/>`,
  unique: `<polygon points="12,3 15,9 21,10 16.5,14.5 17.5,21 12,17.8 6.5,21 7.5,14.5 3,10 9,9" fill="${K.gold}" stroke="${K.crimsonDark}" stroke-width="1.2" stroke-linejoin="round"/>`,
  upgrade_atk: `<path d="M5 16L17 4l2 2L7 18z" fill="${K.steel}"/><path d="M15 13v6M12 16h6" stroke="${K.jade}" stroke-width="2.4" stroke-linecap="round"/>`,
  upgrade_def: `<path d="M6 4h12v8c0 5-6 8.5-6 8.5S6 17 6 12z" fill="${K.jade}" stroke="${K.goldLight}" stroke-width="1.4"/><path d="M12 8v6M9 11h6" stroke="${K.goldLight}" stroke-width="2" stroke-linecap="round"/>`,
  trade: `<circle cx="9" cy="11" r="4.5" fill="${K.gold}" stroke="${K.ink}" stroke-width="1"/><circle cx="15" cy="14" r="4.5" fill="${K.jade}" stroke="${K.goldLight}" stroke-width="1"/>`,
  rally: `<line x1="6" y1="4" x2="6" y2="20" stroke="${K.gold}" stroke-width="2" stroke-linecap="round"/><path d="M6 5h12l-3 3.5L18 12H6z" fill="${K.crimson}" stroke="${K.goldLight}" stroke-width="0.9"/>`,
  collapse: `<path d="M9 6l6 6-6 6" fill="none" stroke="${K.goldLight}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  expand: `<path d="M15 6l-6 6 6 6" fill="none" stroke="${K.goldLight}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  left_hand: `<path d="M6 12h12M10 8l-4 4 4 4" fill="none" stroke="${K.goldLight}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  default_cmd: `<circle cx="12" cy="12" r="7" fill="${K.crimsonDark}" stroke="${K.gold}" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="${K.goldLight}"/>`,
};

export function getIconSvg(key: SideRailIconKey, size: 16 | 24 = 24): string {
  const body = ICON_BODY[key] ?? ICON_BODY.default_cmd;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export function resolveCommandIconKey(label: string): SideRailIconKey {
  const text = label.trim().toLowerCase();
  if (text.endsWith("từ đường")) return "temple";
  if (text === "y sư" || text === "thảo dược") return "healer";
  if (text.endsWith("bến thuyền")) return "dock";
  if (text === "thuyền chài") return "fishing_boat";
  if (text === "chiến thuyền cung") return "galley";
  if (text === "hỏa thuyền") return "fire_ship";
  if (text.includes("nhà ở") || text.includes("nha o")) return "house";
  if (text.includes("kho tài") || text.includes("kho tai")) return "depot";
  if (text.includes("ruộng") || text.includes("ruong")) return "farm";
  if (text.includes("trại lính") || text.includes("trai linh")) return "barracks";
  if (text.includes("trại cung") || text.includes("trai cung")) return "archery_range";
  if (text.includes("chòi") || text.includes("choi")) return "watch_tower";
  if (text.includes("tường") || text.includes("tuong thanh")) return "wall";
  if (text.includes("cổng") || text.includes("cong thanh")) return "gate";
  if (text.includes("chợ") || text.includes("cho ")) return "market";
  if (text.includes("lò rèn") || text.includes("lo ren")) return "blacksmith";
  if (text.includes("chuồng") || text.includes("chuong")) return "stable";
  if (text.includes("công xưởng") || text.includes("cong xuong")) return "siege_workshop";
  if (text.includes("hoàng thành") || text.includes("hoang thanh")) return "imperial_citadel";
  if (text.includes("dân làng") || text.includes("dan lang")) return "villager";
  if (text.includes("lên ") || text.includes("thời kỳ") || text.includes("đời")) return "age_up";
  if (text.includes("đao binh") || text.includes("dao binh")) return "sword";
  if (text.includes("thương") || text.includes("thuong")) return "spear";
  if (text.includes("cung thủ") || text.includes("cung thu")) return "archer";
  if (text.includes("nỏ") || text.includes("liên châu")) return "crossbow";
  if (text.includes("kỵ xạ") || text.includes("ky xa")) return "horse_archer";
  if (text.includes("kỵ binh") || text.includes("ky binh")) return "cavalry";
  if (text.includes("tượng binh") || text.includes("tuong binh")) return "elephant";
  if (text.includes("pháo") || text.includes("phao")) return "siege";
  if (text.includes("rèn công") || text.includes("công tối đa")) return "upgrade_atk";
  if (text.includes("rèn giáp") || text.includes("giáp tối đa")) return "upgrade_def";
  if (text.includes("cờ tập kết") || text.includes("tập kết")) return "rally";
  if (text.includes("bán") || text.includes("mua") || text.includes("vàng") || text.includes("gỗ") || text.includes("lương") || text.includes("đá")) {
    return "trade";
  }
  return "unique";
}
