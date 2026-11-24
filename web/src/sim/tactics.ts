// Pixel Dynasty — tactical RTS controls: rally points, attack-move, unit stances, market trades, stuck-unit wall breaking.

export type Stance = "aggressive" | "stand_ground";
export type RallyKind = "move" | "gather" | "hunt";
export interface RallyPoint { x: number; y: number; tx: number; ty: number; kind: RallyKind; animalId?: number }

const RALLY_TYPES = new Set(["town_center", "barracks", "archery_range", "stable", "siege_workshop", "imperial_citadel"]);
export const canRally = (type: string): boolean => RALLY_TYPES.has(type);

export const isMilitary = (u: any): boolean => u.type !== "villager";
export const stanceOf = (u: any): Stance => (u.stance === "stand_ground" ? "stand_ground" : "aggressive");

export function setRally(b: any, tx: number, ty: number, kind: RallyKind, animalId?: number): void {
  b.rallyPoint = { x: tx + 0.5, y: ty + 0.5, tx, ty, kind, animalId } as RallyPoint;
}

/** Send a freshly trained unit toward its building's rally point (villagers gather / hunt there). */
export function applyRally(u: any, b: any, findPath: (u: any, gx: number, gy: number) => any[]): void {
  const r: RallyPoint | undefined = b.rallyPoint;
  if (!r) return;
  u.amDest = null; u.forced = true;
  if (u.type === "villager" && r.kind === "gather") {
    u.task = "gather"; u.huntId = null; u.targetTile = { tx: r.tx, ty: r.ty }; u.path = findPath(u, r.tx, r.ty);
  } else if (u.type === "villager" && r.kind === "hunt") {
    u.task = "hunt"; u.huntId = r.animalId ?? null; u.targetTile = null; u.path = [];
  } else {
    u.task = "move"; u.targetEntityId = null; u.path = findPath(u, r.x, r.y);
  }
}

/** Toggle stance on the military units in `units`; returns the new stance (or null if none are military). */
export function toggleStance(units: any[]): Stance | null {
  const army = units.filter(isMilitary);
  if (army.length === 0) return null;
  const next: Stance = army.some(u => stanceOf(u) === "aggressive") ? "stand_ground" : "aggressive";
  for (const u of army) u.stance = next;
  return next;
}
export const stanceLabel = (s: Stance): string => (s === "stand_ground" ? "Giữ vị trí" : "Chủ động");

/** Enemy to engage automatically. Aggressive: chase nearby; stand_ground: only inside weapon range; attack_move: wider scan. */
export function autoAcquire(state: any, u: any, def: any): any | null {
  const stance: Stance = u.team === "player" ? stanceOf(u) : "aggressive";
  const am = u.task === "attack_move";
  let near: any = null;
  if (stance === "stand_ground" && !am) {
    let nd = def.range + 0.4;
    for (const o of state.units) {
      if (o.team === u.team || o.hp <= 0) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < nd) { nd = d; near = o; }
    }
    if (!near) {
      for (const b of state.buildings) {
        if (b.team === u.team || b.hp <= 0) continue;
        const d = Math.hypot(b.tx + b.size / 2 - u.x, b.ty + b.size / 2 - u.y);
        if (d <= def.range + b.size * 0.55 + 0.35 && d < nd + 3) { nd = d; near = b; }
      }
    }
    return near;
  }
  let nearD = am ? Math.max(7, def.range + 2) : Math.max(5.5, def.range + 1.2);
  for (const o of state.units) {
    if (o.team !== u.team && o.hp > 0) {
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < nearD) { nearD = d; near = o; }
    }
  }
  if (!near) {
    for (const b of state.buildings) {
      if (b.team !== u.team && b.hp > 0) {
        const d = Math.hypot(b.tx + b.size / 2 - u.x, b.ty + b.size / 2 - u.y);
        if (d < nearD + 1.5) { nearD = d; near = b; }
      }
    }
  }
  return near;
}

/**
 * A soldier that keeps walking but makes no progress is probably walled in: returns the closest
 * hostile building (walls / gates first) within reach so it can chop its way through.
 */
export function breakThrough(state: any, u: any, dt: number): any | null {
  u._st = (u._st || 0) + dt;
  if (u._st < 1.2) return null;
  u._st = 0;
  const moved = Math.hypot(u.x - (u._sx ?? u.x), u.y - (u._sy ?? u.y));
  u._sx = u.x; u._sy = u.y;
  if (moved > 0.3) return null;
  let best: any = null, bd = 3.2;
  for (const b of state.buildings) {
    if (b.team === u.team || b.hp <= 0) continue;
    const d = Math.hypot(b.tx + b.size / 2 - u.x, b.ty + b.size / 2 - u.y) - b.size / 2 - ((b.type === "wall" || b.type === "gate") ? 0.6 : 0);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export interface TradeOffer { id: string; label: string; give: "food" | "wood" | "gold"; giveAmt: number; get: "food" | "wood" | "gold"; getAmt: number }
export const TRADE_OFFERS: TradeOffer[] = [
  { id: "sell_food", label: "Bán 100T → +70V", give: "food", giveAmt: 100, get: "gold", getAmt: 70 },
  { id: "sell_wood", label: "Bán 100G → +70V", give: "wood", giveAmt: 100, get: "gold", getAmt: 70 },
  { id: "buy_food", label: "Mua 110T ← 100V", give: "gold", giveAmt: 100, get: "food", getAmt: 110 },
  { id: "buy_wood", label: "Mua 110G ← 100V", give: "gold", giveAmt: 100, get: "wood", getAmt: 110 },
];
export function canTrade(state: any, o: TradeOffer): boolean { return state.resources[o.give] >= o.giveAmt; }
export function doTrade(state: any, o: TradeOffer): boolean {
  if (!canTrade(state, o)) return false;
  state.resources[o.give] -= o.giveAmt;
  state.resources[o.get] += o.getAmt;
  return true;
}

/** Hostile wall / gate that most plausibly blocks the way from `u` to the point (tx, ty). */
export function nearestBarrier(state: any, u: any, tx: number, ty: number): any | null {
  let best: any = null, bs = 1e9;
  for (const b of state.buildings) {
    if (b.team === u.team || b.hp <= 0 || (b.type !== "wall" && b.type !== "gate")) continue;
    const cx = b.tx + 0.5, cy = b.ty + 0.5;
    const s = Math.hypot(cx - u.x, cy - u.y) + Math.hypot(cx - tx, cy - ty);
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}
