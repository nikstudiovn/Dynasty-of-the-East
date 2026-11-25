import { NAVAL_TYPES } from "./naval";

export const POPULATION_LIMIT = 75;
export const FARM_CAPACITY = 390;
export type Shrine = { x: number; y: number; owner: string | null; contender: string | null; capture: number; income: number };
type Combatant = { x: number; y: number; type: string; team: string; aiIndex?: number; hp: number; garrisoned?: boolean };

export function counterMultiplier(attacker: string, target: string, building: boolean, base = 1): number {
  if (building) return attacker === "catapult" ? 2.2 : base;
  if (attacker === "spearman" && ["cavalry", "horse_archer", "war_elephant"].includes(target)) return 1.6;
  if ((attacker === "archer" || attacker === "chuko_nu") && (target === "swordsman" || target === "spearman")) return 1.35;
  if (attacker === "cavalry" && ["archer", "chuko_nu", "catapult"].includes(target)) return 1.5;
  if (attacker === "horse_archer" && (target === "swordsman" || target === "spearman")) return 1.25;
  return 1;
}

export function placeShrines(size: number, grid: { terrain: string; res: unknown }[][]): Shrine[] {
  const mid = size / 2 - 0.5;
  const starts = size === 48 ? [mid] : [mid - size / 5, mid + size / 5];
  const shrines: Shrine[] = [];
  for (const start of starts) {
    let best: { x: number; y: number; distance: number } | undefined;
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const cell = grid[y][x];
      if (cell.res || (cell.terrain !== "grass" && cell.terrain !== "dirt")) continue;
      if (shrines.some(p => Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < 9)) continue;
      const distance = (x - start) ** 2 + (y - mid) ** 2;
      if (!best || distance < best.distance) best = { x: x + 0.5, y: y + 0.5, distance };
    }
    if (best) shrines.push({ x: best.x, y: best.y, owner: null, contender: null, capture: 0, income: 0 });
  }
  return shrines;
}

export function stepShrines(shrines: Shrine[], units: readonly Combatant[], dt: number, grant: (faction: string) => void): string | null {
  for (const shrine of shrines) {
    let contender: string | null = null;
    for (const unit of units) {
      if (unit.hp <= 0 || unit.garrisoned || unit.type === "villager" || unit.type === "healer" ||
          NAVAL_TYPES.has(unit.type) || Math.hypot(unit.x - shrine.x, unit.y - shrine.y) > 3.5) continue;
      const faction = unit.team === "player" ? "player" : `ai:${unit.aiIndex ?? 0}`;
      if (contender && contender !== faction) { contender = null; break; }
      contender = faction;
    }
    if (contender !== shrine.contender) { shrine.contender = contender; shrine.capture = 0; }
    if (contender && contender !== shrine.owner) {
      shrine.capture += dt;
      if (shrine.capture >= 10 - 1e-8) { shrine.owner = contender; shrine.capture = 0; shrine.income = 0; }
    }
    if (shrine.owner) {
      shrine.income += dt;
      if (shrine.income >= 5 - 1e-8) { shrine.income = Math.max(0, shrine.income - 5); grant(shrine.owner); }
    }
  }
  const owner = shrines[0]?.owner;
  return owner && shrines.every(shrine => shrine.owner === owner) ? owner : null;
}
