import { findPathRaw } from "./pathfinding";

export const NAVAL_TYPES = new Set(["fishing_boat", "galley", "fire_ship"]);
type Cell = { terrain: string; waterDepth?: string; bridge?: string; fish?: number };
export function isWaterway(cell: Cell | undefined): boolean {
  return !!cell && (cell.terrain === "bridge" || Boolean(cell.bridge) ||
    (cell.terrain === "water" && cell.waterDepth !== "shallow"));
}
export function coastalWater(grid: Cell[][], tx: number, ty: number, w = 1, h = w) {
  const points: { x: number; y: number }[] = [];
  const add = (x: number, y: number) => {
    const cell = grid[y]?.[x];
    if (cell?.terrain === "water" && isWaterway(cell)) points.push({ x: x + 0.5, y: y + 0.5 });
  };
  for (let i = 0; i < h; i++) { add(tx - 1, ty + i); add(tx + w, ty + i); }
  for (let i = 0; i < w; i++) { add(tx + i, ty - 1); add(tx + i, ty + h); }
  return points;
}
export function findWaterPath(grid: Cell[][], sx: number, sy: number, gx: number, gy: number) {
  if (!isWaterway(grid[Math.floor(gy)]?.[Math.floor(gx)])) return [];
  return findPathRaw(grid.length, sx, sy, gx, gy, (x, y) => !isWaterway(grid[y]?.[x]), undefined, true);
}

export function stockFish(grid: Cell[][], delta: boolean): void {
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid.length; x++) {
    const cell = grid[y][x];
    if (cell.terrain === "water" && isWaterway(cell) && (11 * x + 17 * y) % (delta ? 19 : 29) === 0) cell.fish = delta ? 220 : 150;
  }
}
