export type SideRailIconKey =
  | "grp_1"
  | "grp_2"
  | "grp_3"
  | "grp_assign"
  | "all_army"
  | "idle_vil"
  | "town_bell"
  | "focus_tc"
  | "attack_move"
  | "stance"
  | "tab_eco"
  | "tab_mil"
  | "tab_def"
  | "train"
  | "age_up"
  | "house"
  | "depot"
  | "farm"
  | "barracks"
  | "archery_range"
  | "watch_tower"
  | "wall"
  | "gate"
  | "market"
  | "blacksmith"
  | "stable"
  | "siege_workshop"
  | "imperial_citadel"
  | "villager"
  | "sword"
  | "spear"
  | "archer"
  | "crossbow"
  | "cavalry"
  | "elephant"
  | "horse_archer"
  | "siege"
  | "unique"
  | "upgrade_atk"
  | "upgrade_def"
  | "trade"
  | "rally"
  | "collapse"
  | "expand"
  | "left_hand"
  | "default_cmd";

const C = {
  ink: "#1A0E0A",
  wood: "#3A2218",
  lacquer: "#7A1F1A",
  crimson: "#B22B22",
  gold: "#F5B841",
  cream: "#FFE9A8",
  jade: "#2F8F6B",
} as const;

const ICON_BODY: Record<SideRailIconKey, string> = {
  grp_1: `<rect x="2" y="2" width="12" height="12" fill="${C.lacquer}"/><rect x="3" y="3" width="10" height="10" fill="${C.wood}"/><rect x="7" y="4" width="2" height="8" fill="${C.gold}"/><rect x="6" y="5" width="1" height="1" fill="${C.cream}"/><rect x="6" y="11" width="4" height="1" fill="${C.gold}"/>`,
  grp_2: `<rect x="2" y="2" width="12" height="12" fill="${C.lacquer}"/><rect x="3" y="3" width="10" height="10" fill="${C.wood}"/><rect x="5" y="4" width="6" height="2" fill="${C.gold}"/><rect x="9" y="6" width="2" height="2" fill="${C.gold}"/><rect x="5" y="7" width="4" height="2" fill="${C.gold}"/><rect x="5" y="9" width="2" height="2" fill="${C.gold}"/><rect x="5" y="10" width="6" height="2" fill="${C.cream}"/>`,
  grp_3: `<rect x="2" y="2" width="12" height="12" fill="${C.lacquer}"/><rect x="3" y="3" width="10" height="10" fill="${C.wood}"/><rect x="5" y="4" width="6" height="2" fill="${C.gold}"/><rect x="9" y="6" width="2" height="2" fill="${C.gold}"/><rect x="6" y="7" width="4" height="2" fill="${C.cream}"/><rect x="9" y="9" width="2" height="2" fill="${C.gold}"/><rect x="5" y="10" width="6" height="2" fill="${C.gold}"/>`,
  grp_assign: `<rect x="2" y="2" width="12" height="12" fill="${C.wood}"/><rect x="4" y="4" width="8" height="8" fill="${C.lacquer}"/><rect x="7" y="5" width="2" height="6" fill="${C.gold}"/><rect x="5" y="7" width="6" height="2" fill="${C.gold}"/><rect x="7" y="7" width="2" height="2" fill="${C.cream}"/>`,
  all_army: `<rect x="3" y="2" width="2" height="9" fill="${C.cream}"/><rect x="2" y="9" width="4" height="1" fill="${C.gold}"/><rect x="3" y="10" width="2" height="3" fill="${C.crimson}"/><rect x="7" y="1" width="2" height="11" fill="${C.gold}"/><rect x="6" y="10" width="4" height="1" fill="${C.cream}"/><rect x="7" y="11" width="2" height="3" fill="${C.lacquer}"/><rect x="11" y="2" width="2" height="9" fill="${C.cream}"/><rect x="10" y="9" width="4" height="1" fill="${C.gold}"/><rect x="11" y="10" width="2" height="3" fill="${C.crimson}"/>`,
  idle_vil: `<rect x="6" y="2" width="4" height="4" fill="${C.cream}"/><rect x="5" y="6" width="6" height="5" fill="${C.jade}"/><rect x="4" y="7" width="1" height="4" fill="${C.wood}"/><rect x="11" y="7" width="1" height="4" fill="${C.wood}"/><rect x="6" y="11" width="2" height="3" fill="${C.wood}"/><rect x="8" y="11" width="2" height="3" fill="${C.wood}"/><rect x="12" y="2" width="2" height="4" fill="${C.gold}"/><rect x="12" y="7" width="2" height="2" fill="${C.crimson}"/>`,
  town_bell: `<rect x="6" y="2" width="4" height="2" fill="${C.gold}"/><rect x="4" y="4" width="8" height="6" fill="${C.gold}"/><rect x="5" y="5" width="2" height="4" fill="${C.cream}"/><rect x="3" y="10" width="10" height="2" fill="${C.crimson}"/><rect x="7" y="12" width="2" height="2" fill="${C.gold}"/>`,
  focus_tc: `<rect x="3" y="5" width="10" height="2" fill="${C.crimson}"/><rect x="2" y="6" width="12" height="2" fill="${C.lacquer}"/><rect x="6" y="3" width="4" height="2" fill="${C.gold}"/><rect x="4" y="8" width="8" height="6" fill="${C.wood}"/><rect x="6" y="10" width="4" height="4" fill="${C.gold}"/><rect x="7" y="11" width="2" height="3" fill="${C.ink}"/>`,
  attack_move: `<rect x="2" y="11" width="3" height="3" fill="${C.crimson}"/><rect x="4" y="9" width="3" height="3" fill="${C.gold}"/><rect x="6" y="7" width="3" height="3" fill="${C.cream}"/><rect x="8" y="5" width="3" height="3" fill="${C.cream}"/><rect x="10" y="2" width="4" height="4" fill="${C.crimson}"/><rect x="11" y="3" width="2" height="2" fill="${C.gold}"/>`,
  stance: `<rect x="4" y="2" width="8" height="2" fill="${C.gold}"/><rect x="3" y="4" width="10" height="6" fill="${C.lacquer}"/><rect x="5" y="5" width="6" height="4" fill="${C.crimson}"/><rect x="7" y="6" width="2" height="2" fill="${C.cream}"/><rect x="5" y="10" width="6" height="2" fill="${C.gold}"/><rect x="6" y="12" width="4" height="2" fill="${C.gold}"/>`,
  tab_eco: `<rect x="5" y="2" width="6" height="2" fill="${C.jade}"/><rect x="3" y="4" width="10" height="3" fill="${C.jade}"/><rect x="4" y="7" width="8" height="5" fill="${C.gold}"/><rect x="6" y="9" width="4" height="3" fill="${C.wood}"/><rect x="2" y="12" width="12" height="2" fill="${C.jade}"/>`,
  tab_mil: `<rect x="2" y="11" width="3" height="3" fill="${C.gold}"/><rect x="4" y="9" width="2" height="2" fill="${C.crimson}"/><rect x="6" y="7" width="2" height="2" fill="${C.cream}"/><rect x="8" y="5" width="2" height="2" fill="${C.cream}"/><rect x="10" y="2" width="4" height="4" fill="${C.cream}"/><rect x="11" y="11" width="3" height="3" fill="${C.gold}"/><rect x="2" y="2" width="4" height="4" fill="${C.crimson}"/>`,
  tab_def: `<rect x="3" y="2" width="3" height="3" fill="${C.gold}"/><rect x="7" y="2" width="2" height="3" fill="${C.gold}"/><rect x="10" y="2" width="3" height="3" fill="${C.gold}"/><rect x="3" y="5" width="10" height="8" fill="${C.lacquer}"/><rect x="6" y="8" width="4" height="5" fill="${C.ink}"/><rect x="4" y="6" width="8" height="1" fill="${C.cream}"/>`,
  train: `<rect x="6" y="2" width="4" height="4" fill="${C.cream}"/><rect x="4" y="6" width="8" height="6" fill="${C.crimson}"/><rect x="6" y="7" width="4" height="4" fill="${C.gold}"/><rect x="5" y="12" width="2" height="2" fill="${C.wood}"/><rect x="9" y="12" width="2" height="2" fill="${C.wood}"/>`,
  age_up: `<rect x="7" y="2" width="2" height="11" fill="${C.gold}"/><rect x="5" y="4" width="6" height="2" fill="${C.cream}"/><rect x="3" y="6" width="10" height="2" fill="${C.gold}"/><rect x="4" y="12" width="8" height="2" fill="${C.crimson}"/>`,
  house: `<rect x="7" y="2" width="2" height="2" fill="${C.crimson}"/><rect x="4" y="4" width="8" height="2" fill="${C.crimson}"/><rect x="2" y="6" width="12" height="2" fill="${C.lacquer}"/><rect x="4" y="8" width="8" height="6" fill="${C.cream}"/><rect x="6" y="10" width="4" height="4" fill="${C.wood}"/>`,
  depot: `<rect x="3" y="4" width="10" height="3" fill="${C.wood}"/><rect x="4" y="7" width="8" height="6" fill="${C.gold}"/><rect x="5" y="8" width="6" height="4" fill="${C.lacquer}"/><rect x="6" y="9" width="4" height="2" fill="${C.cream}"/>`,
  farm: `<rect x="2" y="3" width="12" height="10" fill="${C.wood}"/><rect x="3" y="4" width="10" height="2" fill="${C.jade}"/><rect x="3" y="7" width="10" height="2" fill="${C.gold}"/><rect x="3" y="10" width="10" height="2" fill="${C.jade}"/>`,
  barracks: `<rect x="2" y="4" width="12" height="3" fill="${C.crimson}"/><rect x="3" y="7" width="10" height="7" fill="${C.wood}"/><rect x="6" y="9" width="4" height="5" fill="${C.ink}"/><rect x="7" y="2" width="2" height="5" fill="${C.gold}"/>`,
  archery_range: `<rect x="3" y="4" width="10" height="8" fill="${C.wood}"/><rect x="5" y="5" width="6" height="6" fill="${C.cream}"/><rect x="6" y="6" width="4" height="4" fill="${C.crimson}"/><rect x="7" y="7" width="2" height="2" fill="${C.gold}"/>`,
  watch_tower: `<rect x="5" y="2" width="6" height="3" fill="${C.crimson}"/><rect x="6" y="5" width="4" height="8" fill="${C.wood}"/><rect x="4" y="12" width="8" height="2" fill="${C.lacquer}"/><rect x="7" y="6" width="2" height="3" fill="${C.gold}"/>`,
  wall: `<rect x="2" y="4" width="3" height="2" fill="${C.gold}"/><rect x="6" y="4" width="4" height="2" fill="${C.gold}"/><rect x="11" y="4" width="3" height="2" fill="${C.gold}"/><rect x="2" y="6" width="12" height="7" fill="${C.wood}"/><rect x="3" y="8" width="10" height="1" fill="${C.lacquer}"/><rect x="3" y="11" width="10" height="1" fill="${C.lacquer}"/>`,
  gate: `<rect x="2" y="3" width="12" height="3" fill="${C.lacquer}"/><rect x="2" y="6" width="3" height="8" fill="${C.wood}"/><rect x="11" y="6" width="3" height="8" fill="${C.wood}"/><rect x="5" y="6" width="6" height="8" fill="${C.gold}"/><rect x="7" y="7" width="2" height="7" fill="${C.ink}"/>`,
  market: `<rect x="2" y="4" width="12" height="3" fill="${C.jade}"/><rect x="4" y="4" width="4" height="3" fill="${C.cream}"/><rect x="10" y="4" width="2" height="3" fill="${C.crimson}"/><rect x="3" y="7" width="10" height="6" fill="${C.wood}"/><rect x="5" y="9" width="6" height="4" fill="${C.gold}"/>`,
  blacksmith: `<rect x="3" y="5" width="10" height="3" fill="${C.ink}"/><rect x="5" y="8" width="6" height="4" fill="${C.wood}"/><rect x="3" y="12" width="10" height="2" fill="${C.lacquer}"/><rect x="10" y="2" width="3" height="3" fill="${C.crimson}"/><rect x="11" y="3" width="1" height="1" fill="${C.gold}"/>`,
  stable: `<rect x="2" y="4" width="12" height="3" fill="${C.wood}"/><rect x="3" y="7" width="10" height="7" fill="${C.lacquer}"/><rect x="5" y="8" width="6" height="6" fill="${C.gold}"/><rect x="6" y="9" width="4" height="5" fill="${C.ink}"/>`,
  siege_workshop: `<rect x="3" y="5" width="10" height="6" fill="${C.wood}"/><rect x="4" y="11" width="3" height="3" fill="${C.gold}"/><rect x="9" y="11" width="3" height="3" fill="${C.gold}"/><rect x="5" y="3" width="6" height="2" fill="${C.crimson}"/><rect x="11" y="2" width="3" height="3" fill="${C.cream}"/>`,
  imperial_citadel: `<rect x="6" y="1" width="4" height="3" fill="${C.gold}"/><rect x="3" y="4" width="10" height="3" fill="${C.crimson}"/><rect x="2" y="7" width="12" height="7" fill="${C.lacquer}"/><rect x="6" y="9" width="4" height="5" fill="${C.gold}"/><rect x="7" y="10" width="2" height="4" fill="${C.ink}"/>`,
  villager: `<rect x="6" y="2" width="4" height="4" fill="${C.cream}"/><rect x="5" y="6" width="6" height="5" fill="${C.jade}"/><rect x="6" y="11" width="2" height="3" fill="${C.wood}"/><rect x="8" y="11" width="2" height="3" fill="${C.wood}"/><rect x="11" y="4" width="2" height="7" fill="${C.gold}"/>`,
  sword: `<rect x="11" y="2" width="3" height="3" fill="${C.cream}"/><rect x="9" y="4" width="3" height="3" fill="${C.cream}"/><rect x="7" y="6" width="3" height="3" fill="${C.cream}"/><rect x="5" y="8" width="3" height="3" fill="${C.gold}"/><rect x="3" y="10" width="3" height="3" fill="${C.crimson}"/><rect x="4" y="7" width="5" height="2" fill="${C.gold}"/>`,
  spear: `<rect x="11" y="2" width="3" height="3" fill="${C.cream}"/><rect x="9" y="4" width="2" height="2" fill="${C.gold}"/><rect x="7" y="6" width="2" height="2" fill="${C.wood}"/><rect x="5" y="8" width="2" height="2" fill="${C.wood}"/><rect x="3" y="10" width="2" height="2" fill="${C.wood}"/><rect x="2" y="12" width="2" height="2" fill="${C.crimson}"/>`,
  archer: `<rect x="4" y="3" width="2" height="10" fill="${C.gold}"/><rect x="6" y="2" width="2" height="2" fill="${C.gold}"/><rect x="6" y="12" width="2" height="2" fill="${C.gold}"/><rect x="7" y="4" width="1" height="8" fill="${C.cream}"/><rect x="5" y="7" width="8" height="2" fill="${C.crimson}"/><rect x="11" y="6" width="2" height="4" fill="${C.cream}"/>`,
  crossbow: `<rect x="3" y="4" width="10" height="2" fill="${C.gold}"/><rect x="7" y="2" width="2" height="11" fill="${C.wood}"/><rect x="5" y="6" width="6" height="2" fill="${C.cream}"/><rect x="6" y="11" width="4" height="3" fill="${C.crimson}"/>`,
  cavalry: `<rect x="4" y="4" width="5" height="3" fill="${C.gold}"/><rect x="8" y="3" width="4" height="3" fill="${C.cream}"/><rect x="3" y="7" width="9" height="4" fill="${C.crimson}"/><rect x="4" y="11" width="2" height="3" fill="${C.wood}"/><rect x="9" y="11" width="2" height="3" fill="${C.wood}"/>`,
  elephant: `<rect x="3" y="4" width="8" height="6" fill="${C.wood}"/><rect x="11" y="5" width="3" height="5" fill="${C.wood}"/><rect x="12" y="9" width="2" height="3" fill="${C.cream}"/><rect x="5" y="2" width="4" height="3" fill="${C.gold}"/><rect x="4" y="10" width="2" height="4" fill="${C.lacquer}"/><rect x="8" y="10" width="2" height="4" fill="${C.lacquer}"/>`,
  horse_archer: `<rect x="3" y="5" width="7" height="5" fill="${C.crimson}"/><rect x="9" y="4" width="3" height="3" fill="${C.cream}"/><rect x="5" y="2" width="3" height="3" fill="${C.gold}"/><rect x="11" y="2" width="2" height="5" fill="${C.gold}"/><rect x="4" y="10" width="2" height="4" fill="${C.wood}"/><rect x="8" y="10" width="2" height="4" fill="${C.wood}"/>`,
  siege: `<rect x="3" y="7" width="10" height="3" fill="${C.wood}"/><rect x="4" y="10" width="3" height="3" fill="${C.gold}"/><rect x="9" y="10" width="3" height="3" fill="${C.gold}"/><rect x="4" y="4" width="8" height="3" fill="${C.lacquer}"/><rect x="10" y="2" width="3" height="3" fill="${C.crimson}"/>`,
  unique: `<rect x="7" y="2" width="2" height="12" fill="${C.gold}"/><rect x="5" y="4" width="6" height="2" fill="${C.cream}"/><rect x="3" y="6" width="10" height="3" fill="${C.crimson}"/><rect x="5" y="9" width="6" height="2" fill="${C.gold}"/><rect x="6" y="11" width="4" height="3" fill="${C.lacquer}"/>`,
  upgrade_atk: `<rect x="10" y="2" width="4" height="4" fill="${C.crimson}"/><rect x="8" y="4" width="3" height="3" fill="${C.cream}"/><rect x="6" y="6" width="3" height="3" fill="${C.gold}"/><rect x="3" y="9" width="4" height="4" fill="${C.gold}"/><rect x="11" y="10" width="2" height="4" fill="${C.jade}"/><rect x="10" y="11" width="4" height="2" fill="${C.jade}"/>`,
  upgrade_def: `<rect x="4" y="3" width="8" height="8" fill="${C.jade}"/><rect x="5" y="4" width="6" height="6" fill="${C.gold}"/><rect x="7" y="5" width="2" height="4" fill="${C.crimson}"/><rect x="6" y="11" width="4" height="2" fill="${C.jade}"/>`,
  trade: `<rect x="2" y="5" width="5" height="6" fill="${C.gold}"/><rect x="9" y="5" width="5" height="6" fill="${C.jade}"/><rect x="6" y="3" width="4" height="2" fill="${C.cream}"/><rect x="6" y="11" width="4" height="2" fill="${C.crimson}"/>`,
  rally: `<rect x="4" y="2" width="2" height="12" fill="${C.gold}"/><rect x="6" y="3" width="7" height="5" fill="${C.crimson}"/><rect x="8" y="4" width="3" height="3" fill="${C.cream}"/>`,
  collapse: `<rect x="4" y="4" width="2" height="8" fill="${C.gold}"/><rect x="9" y="4" width="3" height="2" fill="${C.cream}"/><rect x="7" y="6" width="3" height="4" fill="${C.cream}"/><rect x="9" y="10" width="3" height="2" fill="${C.cream}"/>`,
  expand: `<rect x="10" y="4" width="2" height="8" fill="${C.gold}"/><rect x="4" y="4" width="3" height="2" fill="${C.cream}"/><rect x="6" y="6" width="3" height="4" fill="${C.cream}"/><rect x="4" y="10" width="3" height="2" fill="${C.cream}"/>`,
  left_hand: `<rect x="2" y="3" width="4" height="10" fill="${C.gold}"/><rect x="8" y="6" width="6" height="4" fill="${C.cream}"/><rect x="7" y="7" width="2" height="2" fill="${C.crimson}"/>`,
  default_cmd: `<rect x="3" y="3" width="10" height="10" fill="${C.lacquer}"/><rect x="5" y="5" width="6" height="6" fill="${C.gold}"/><rect x="7" y="7" width="2" height="2" fill="${C.cream}"/>`,
};

export function getIconSvg(key: SideRailIconKey, size: 16 | 24 = 24): string {
  const body = ICON_BODY[key] ?? ICON_BODY.default_cmd;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}

export function resolveCommandIconKey(label: string): SideRailIconKey {
  const text = label.trim().toLowerCase();
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
