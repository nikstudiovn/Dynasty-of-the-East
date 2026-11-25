import { footprintOf, ringTiles } from "./footprint";
import { stockFish } from "./naval";
// Map generator for 48 / 64 / 96 tile maps and 4 map types. Pure data, no rendering.
//   river_valley     winding river + central lotus lake crossed by 3 / 4 / 5 arched wooden bridges
//   open_plains      no river barrier, wide open ground (fast cavalry flanking)
//   highland_passes  impassable rock ridges dividing the map, 3 narrow mountain passes
//   random           a deterministic seed picks the biome and varies the layout every match
// Seed 0 reproduces the original 48x48 lotus valley layout with stable NW player spawn.

export type MapSize = 48 | 64 | 96;
export type Biome = "river_delta" | "river_valley" | "open_plains" | "highland_passes";
export type MapType = Biome | "random";

export const MAP_SIZES: MapSize[] = [48, 64, 96];
export const MAP_TYPES: MapType[] = ["river_valley", "river_delta", "open_plains", "highland_passes", "random"];

export type ResourceVariant =
  | "single_tree"
  | "forest"
  | "bamboo"
  | "ancient_tree"
  | "gold_small"
  | "gold_big"
  | "stone_small"
  | "stone_big";

export interface ValleyCell {
  terrain: string;
  res: string | null;
  resAmt: number;
  bridge?: string;
  resVariant?: ResourceVariant;
  resFootprint?: 1 | 2 | 3;
  resOrigin?: number;
  elev?: number;
  waterDepth?: "shallow" | "deep";
  treasureGuarded?: boolean;
}

export interface BasePos {
  tx: number;
  ty: number;
  idx: number;
}

export function normalizeMapSize(v: any): MapSize {
  const n = Number(v);
  return n === 64 ? 64 : n === 96 ? 96 : 48;
}

export function normalizeMapType(v: any): MapType {
  return MAP_TYPES.includes(v) ? v : "river_valley";
}

/** mulberry32 – small deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeedFor(type: MapType): number {
  return type === "random" ? 1 + Math.floor(Math.random() * 0x7ffffffe) : 0;
}

export function startingResources(n: number): { food: number; wood: number; gold: number; stone: number } {
  const multiplier = 1 + (normalizeMapSize(n) - 48) / 96;
  const rounded = (value: number) => Math.round(value * multiplier / 5) * 5;
  return { food: rounded(200), wood: rounded(200), gold: rounded(50), stone: rounded(100) };
}

export function resolveBiome(mapType: MapType, seed: number): Biome {
  if (mapType !== "random") return mapType;
  const r = rng(seed ^ 0x9e3779b9);
  const pick = Math.floor(r() * 3);
  return pick === 0 ? "river_valley" : pick === 1 ? "open_plains" : "highland_passes";
}

function baseCorners(n: number): BasePos[] {
  const o = n >= 96 ? 9 : n >= 64 ? 7 : 6;
  return [
    { tx: o, ty: o, idx: 0 },                 // NW
    { tx: n - 1 - o, ty: o, idx: 1 },         // NE
    { tx: n - 1 - o, ty: n - 1 - o, idx: 2 }, // SE
    { tx: o, ty: n - 1 - o, idx: 3 },         // SW
  ];
}

export function shuffledCorners(n: number, seed = 0): BasePos[] {
  const corners = baseCorners(n);
  if (seed === 0) return corners;
  const r = rng((seed ^ 0x51f2c9a3) >>> 0);
  const arr = corners.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function playerBase(n: number, seed = 0): BasePos {
  return shuffledCorners(n, seed)[0];
}

export function aiCorners(n: number, seed = 0): BasePos[] {
  return shuffledCorners(n, seed).slice(1);
}

export function isDeepWater(cell: ValleyCell | undefined): boolean {
  return !!cell && cell.terrain === "water" && !cell.bridge;
}

export function generateValley(
  size: MapSize = 48,
  mapType: MapType = "river_valley",
  seed = 0,
): { grid: ValleyCell[][]; size: MapSize; biome: Biome; seed: number } {
  const n = normalizeMapSize(size);
  const s = n / 48;
  const biome = resolveBiome(normalizeMapType(mapType), seed || 1);
  const r = rng(seed || 1337);
  const p0 = seed === 0 ? 0 : (r() - 0.5) * 4 * s;
  const p1 = seed === 0 ? 0 : (r() - 0.5) * 5 * s;

  const grid: ValleyCell[][] = [];
  for (let ty = 0; ty < n; ty++) {
    const row: ValleyCell[] = [];
    for (let tx = 0; tx < n; tx++) {
      row.push({ terrain: "grass", res: null, resAmt: 0, elev: 0 });
    }
    grid.push(row);
  }

  // Rolling hills via multi-frequency noise (flat near 4 spawn corners and on water/bridge)
  const ph1 = seed === 0 ? 0.4 : r() * Math.PI * 2;
  const ph2 = seed === 0 ? 1.7 : r() * Math.PI * 2;
  const ph3 = seed === 0 ? 2.9 : r() * Math.PI * 2;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const nx = tx / n;
      const ny = ty / n;
      const h =
        Math.sin(nx * Math.PI * 3.5 + ph1) * Math.cos(ny * Math.PI * 3.5 + ph2) * 0.55 +
        Math.sin((nx + ny) * Math.PI * 6.0 + ph3) * 0.25 +
        Math.cos((nx - ny) * Math.PI * 9.0 + ph1) * 0.2;
      grid[ty][tx].elev = Math.round(Math.max(-1, Math.min(2, h * 1.4)) * 100) / 100;
    }
  }

  const allCorners = shuffledCorners(n, seed);
  const pBase = allCorners[0];
  const aBases = allCorners.slice(1);
  const nearAnyCorner = (tx: number, ty: number, rad: number): boolean => {
    for (const c of allCorners) {
      if (Math.hypot(tx - c.tx, ty - c.ty) <= rad) return true;
    }
    return false;
  };

  if (biome === "river_valley" || biome === "river_delta") {
    const delta = biome === "river_delta";
    for (let tx = 0; tx < n; tx++) {
      const riverY =
        n / 2 +
        Math.sin(tx * 0.22 / s + p0 * 0.1) * (2.6 * s) +
        Math.cos(tx * 0.09 / s + p1 * 0.1) * (1.2 * s);
      for (let ty = 0; ty < n; ty++) {
        const branch = riverY + Math.sin(tx / n * Math.PI) * n * 0.15;
        if (Math.abs(ty - riverY) < (delta ? 3.2 : 1.85) * Math.min(1.6, s) ||
          (delta && Math.abs(ty - branch) < 2.3 * Math.min(1.6, s))) {
          grid[ty][tx].terrain = "water";
          grid[ty][tx].waterDepth = "deep";
          grid[ty][tx].elev = 0;
        }
      }
    }
    const cx = n / 2;
    const cy = n / 2;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        if (Math.hypot(tx - cx, ty - cy) < 5.0 * s) {
          grid[ty][tx].terrain = "water";
          grid[ty][tx].waterDepth = "deep";
          grid[ty][tx].elev = 0;
        }
      }
    }
    const bridgeXs = delta ? [0.22, 0.5, 0.78].map(f => Math.round(f * n)) :
      n >= 96
        ? [14, 32, 48, 64, 82]
        : n >= 64
          ? [12, 26, 38, 52]
          : [9, 24, 39];
    for (const bx of bridgeXs) {
      const bx2 = Math.max(4, Math.min(n - 5, Math.round(bx + (seed === 0 ? 0 : (r() - 0.5) * 3))));
      for (let dx = delta ? 0 : -1; dx <= (delta ? 0 : 1); dx++) {
        const x = bx2 + dx;
        for (let ty = 0; ty < n; ty++) {
          if (grid[ty][x].terrain === "water") {
            grid[ty][x].terrain = delta ? "bridge" : "dirt";
            grid[ty][x].bridge = delta ? "v" : dx === 0 ? "center" : "edge";
            grid[ty][x].waterDepth = undefined;
            grid[ty][x].elev = 0;
          }
        }
      }
    }
  } else if (biome === "highland_passes") {
    const passXs =
      n >= 96 ? [16, 48, 80] : n >= 64 ? [12, 32, 52] : [9, 24, 39];
    for (let tx = 0; tx < n; tx++) {
      const ridgeY =
        n / 2 +
        Math.sin(tx * 0.18 / s + p0 * 0.2) * (2.5 * s) +
        Math.cos(tx * 0.11 / s) * (1.2 * s);
      const isPass = passXs.some((px) => Math.abs(tx - px) <= (n >= 64 ? 2 : 1));
      for (let ty = 0; ty < n; ty++) {
        if (Math.abs(ty - ridgeY) < (isPass ? 0 : 2.1 * Math.min(1.4, s))) {
          grid[ty][tx].terrain = "rock";
          grid[ty][tx].elev = 1.5;
        } else if (isPass && Math.abs(ty - ridgeY) < 3.5 * s) {
          grid[ty][tx].terrain = "dirt";
        }
      }
    }
  } else {
    const cx = n / 2;
    const cy = n / 2;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        if (Math.hypot(tx - cx, ty - cy) < 5 * s && r() < 0.35) {
          grid[ty][tx].terrain = "dirt";
        }
      }
    }
  }

  // Additional deep water ponds and shallow water pools (avoiding 4 spawn corners & bridges)
  const cornerSafeR = Math.round(9 * s);
  const pondCount = n >= 96 ? 4 : n >= 64 ? 3 : 2;
  for (let p = 0; p < pondCount; p++) {
    const px = Math.floor(10 + r() * (n - 20));
    const py = Math.floor(10 + r() * (n - 20));
    if (nearAnyCorner(px, py, cornerSafeR)) continue;
    const rad = 1.6 + r() * 1.4;
    let touchesBridge = false;
    for (let dy = -3; dy <= 3 && !touchesBridge; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const c = grid[py + dy]?.[px + dx];
        if (c?.bridge) { touchesBridge = true; break; }
      }
    }
    if (touchesBridge) continue;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const tx = px + dx;
        const ty = py + dy;
        if (tx < 2 || ty < 2 || tx >= n - 2 || ty >= n - 2) continue;
        if (nearAnyCorner(tx, ty, cornerSafeR - 1)) continue;
        const dist = Math.hypot(dx, dy);
        if (dist <= rad * 0.72) {
          grid[ty][tx].terrain = "water";
          grid[ty][tx].waterDepth = "deep";
          grid[ty][tx].elev = 0;
        } else if (dist <= rad + 0.65 && grid[ty][tx].terrain === "grass") {
          grid[ty][tx].terrain = "shallow";
          grid[ty][tx].waterDepth = "shallow";
          grid[ty][tx].elev = 0;
        }
      }
    }
  }

  const shallowPoolCount = n >= 96 ? 6 : n >= 64 ? 4 : 3;
  for (let p = 0; p < shallowPoolCount; p++) {
    const sx = Math.floor(8 + r() * (n - 16));
    const sy = Math.floor(8 + r() * (n - 16));
    if (nearAnyCorner(sx, sy, cornerSafeR)) continue;
    const rad = 1.2 + r() * 1.1;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = sx + dx;
        const ty = sy + dy;
        if (tx < 2 || ty < 2 || tx >= n - 2 || ty >= n - 2) continue;
        const c = grid[ty][tx];
        if (!c.bridge && c.terrain === "grass" && Math.hypot(dx, dy) <= rad) {
          c.terrain = "shallow";
          c.waterDepth = "shallow";
          c.elev = 0;
        }
      }
    }
  }

  // Clear & flatten 4 spawn corners
  const clearR = Math.round(6 * s);
  for (const c of allCorners) {
    for (let dy = -clearR; dy <= clearR; dy++) {
      for (let dx = -clearR; dx <= clearR; dx++) {
        const tx = c.tx + dx;
        const ty = c.ty + dy;
        if (tx >= 0 && ty >= 0 && tx < n && ty < n && Math.hypot(dx, dy) <= clearR) {
          grid[ty][tx].terrain = Math.hypot(dx, dy) <= 2 ? "dirt" : "grass";
          grid[ty][tx].waterDepth = undefined;
          grid[ty][tx].elev = 0;
        }
      }
    }
  }

  const canPlace1x1 = (tx: number, ty: number): boolean => {
    if (tx < 1 || ty < 1 || tx >= n - 1 || ty >= n - 1) return false;
    const c = grid[ty][tx];
    return (c.terrain === "grass" || c.terrain === "dirt") && !c.bridge && !c.res;
  };

  const goldOrigins: { x: number; y: number }[] = [];
  const place2x2Resource = (
    tx: number,
    ty: number,
    res: "wood" | "gold" | "stone",
    resAmt: number,
    resVariant: ResourceVariant,
    treasureGuarded = false,
  ): boolean => {
    if (tx < 2 || ty < 2 || tx >= n - 3 || ty >= n - 3) return false;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (!canPlace1x1(tx + dx, ty + dy)) return false;
        if (nearAnyCorner(tx + dx, ty + dy, clearR + 1)) return false;
      }
    }
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const c = grid[ty + dy][tx + dx];
        c.res = res;
        c.resAmt = Math.round(resAmt * 1.52);
        c.resVariant = resVariant;
        c.resFootprint = 2;
        if (treasureGuarded) c.treasureGuarded = true;
      }
    }
    if (res === "gold" && !treasureGuarded) goldOrigins.push({ x: tx, y: ty });
    return true;
  };

  const placeCluster = (
    cx: number,
    cy: number,
    res: "wood" | "gold" | "stone",
    amt: number,
    count: number,
    variant: ResourceVariant,
  ) => {
    for (let i = 0; i < count; i++) {
      const ox = Math.round((r() - 0.5) * 4);
      const oy = Math.round((r() - 0.5) * 4);
      const tx = Math.max(1, Math.min(n - 2, cx + ox));
      const ty = Math.max(1, Math.min(n - 2, cy + oy));
      if (canPlace1x1(tx, ty)) {
        const c = grid[ty][tx];
        c.res = res;
        c.resAmt = Math.round(amt * 1.52);
        c.resVariant = variant;
        c.resFootprint = 1;
      }
    }
  };

  // Starter resources near each spawn corner
  for (const c of allCorners) {
    const sx = c.tx < n / 2 ? 1 : -1;
    const sy = c.ty < n / 2 ? 1 : -1;
    placeCluster(c.tx - sx * 3, c.ty + sy * 2, "wood", 220, 6, "forest");
    placeCluster(c.tx + sx * 4, c.ty - sy * 3, "gold", 350, 3, "gold_small");
    placeCluster(c.tx - sx * 2, c.ty - sy * 4, "stone", 300, 3, "stone_small");
  }

  // Diverse 1x1 forests, bamboo groves, single trees, and gold/stone mines across the map
  const forestClusters = Math.round(14 * s * s);
  const woodVariants: ResourceVariant[] = ["forest", "bamboo", "single_tree"];
  for (let i = 0; i < forestClusters; i++) {
    const cx = Math.floor(4 + r() * (n - 8));
    const cy = Math.floor(4 + r() * (n - 8));
    if (nearAnyCorner(cx, cy, clearR + 2)) continue;
    const variant = woodVariants[i % woodVariants.length];
    const count = variant === "single_tree" ? 2 : 5;
    placeCluster(cx, cy, "wood", variant === "bamboo" ? 200 : 250, count, variant);
  }

  const mineClusters = Math.round(9 * s * s);
  for (let i = 0; i < mineClusters; i++) {
    const cx = Math.floor(5 + r() * (n - 10));
    const cy = Math.floor(5 + r() * (n - 10));
    if (nearAnyCorner(cx, cy, clearR + 2)) continue;
    const isGold = i % 2 === 0;
    placeCluster(
      cx,
      cy,
      isGold ? "gold" : "stone",
      isGold ? 450 : 400,
      3,
      isGold ? "gold_small" : "stone_small",
    );
  }

  // Rare 2x2 ancient trees and big gold/stone deposits
  const bigCount = n >= 96 ? 6 : n >= 64 ? 4 : 3;
  for (let i = 0; i < bigCount; i++) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const tx = Math.floor(4 + r() * (n - 10));
      const ty = Math.floor(4 + r() * (n - 10));
      const kind = i % 3;
      const ok =
        kind === 0
          ? place2x2Resource(tx, ty, "wood", 600, "ancient_tree")
          : kind === 1
            ? place2x2Resource(tx, ty, "gold", 900, "gold_big")
            : place2x2Resource(tx, ty, "stone", 850, "stone_big");
      if (ok) break;
    }
  }

  // 1-2 contested 2x2 resource clusters near map center / bridges
  const centerTargets = [
    { x: Math.floor(n / 2 - 6), y: Math.floor(n / 2 - 4) },
    { x: Math.floor(n / 2 + 4), y: Math.floor(n / 2 + 2) },
  ];
  let guardedPlaced = 0;
  for (const tgt of centerTargets) {
    if (guardedPlaced >= 2) break;
    for (let radius = 0; radius <= 6; radius++) {
      let placed = false;
      for (let dy = -radius; dy <= radius && !placed; dy++) {
        for (let dx = -radius; dx <= radius && !placed; dx++) {
          const isGold = guardedPlaced % 2 === 0;
          if (
            place2x2Resource(
              tgt.x + dx,
              tgt.y + dy,
              isGold ? "gold" : "stone",
              isGold ? 1200 : 1000,
              isGold ? "gold_big" : "stone_big",
              true,
            )
          ) {
            guardedPlaced++;
            placed = true;
          }
        }
      }
      if (placed) break;
    }
  }

  // Keep references to pBase & aBases for backward-compatible deterministic PRNG alignment
  void pBase;
  void aBases;

  if (biome === "open_plains") for (const row of grid) for (const cell of row) {
    if (cell.terrain === "water") { cell.terrain = "grass"; cell.waterDepth = "shallow"; }
  }
  // Starter resources generated for the old smaller base can overlap the new
  // foundation or its exit lane. Relocate those cells without deleting stock.
  const startFoot = footprintOf("town_center");
  for (const base of allCorners) {
    const reserved = { tx: base.tx - 1, ty: base.ty - 1, w: startFoot.w + 2, h: startFoot.h + 2 };
    const outside = ringTiles(reserved).concat(ringTiles({
      tx: reserved.tx - 1, ty: reserved.ty - 1, w: reserved.w + 2, h: reserved.h + 2,
    }));
    for (let ty = reserved.ty; ty < reserved.ty + reserved.h; ty++) {
      for (let tx = reserved.tx; tx < reserved.tx + reserved.w; tx++) {
        const cell = grid[ty][tx];
        if (!cell.res || cell.resFootprint !== 1) continue;
        const choices = outside.filter(p => canPlace1x1(p.x, p.y));
        choices.sort((a, b) => (a.x - tx) ** 2 + (a.y - ty) ** 2 - (b.x - tx) ** 2 - (b.y - ty) ** 2);
        const point = choices[0];
        if (!point) continue;
        Object.assign(grid[point.y][point.x], {
          res: cell.res, resAmt: cell.resAmt, resVariant: cell.resVariant, resFootprint: cell.resFootprint,
        });
        cell.res = null; cell.resAmt = 0;
        delete cell.resVariant; delete cell.resFootprint;
      }
    }
  }

  // Expand at most one inland mine on larger maps. Preserve the original gold
  // budget and PRNG order, and leave an open approach along every side.
  if (n >= 64) for (const { x, y } of goldOrigins) {
    const walkable = (tx: number, ty: number) => {
      const c = grid[ty]?.[tx];
      return c && !c.res && !c.bridge && !c.waterDepth && (c.terrain === "grass" || c.terrain === "dirt");
    };
    const additions = [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    if (additions.some(([dx, dy]) => !walkable(x + dx, y + dy) || nearAnyCorner(x + dx, y + dy, clearR + 2))) continue;
    const lane = [0, 1, 2];
    if (!lane.some(i => walkable(x - 1, y + i)) || !lane.some(i => walkable(x + 3, y + i)) ||
        !lane.some(i => walkable(x + i, y - 1)) || !lane.some(i => walkable(x + i, y + 3))) continue;
    const original = [grid[y][x], grid[y][x + 1], grid[y + 1][x], grid[y + 1][x + 1]];
    const budget = original.reduce((sum, cell) => sum + cell.resAmt, 0);
    for (let i = 0; i < 9; i++) {
      const cell = grid[y + Math.floor(i / 3)][x + i % 3];
      cell.res = "gold";
      cell.resVariant = "gold_big";
      cell.resFootprint = 3;
      cell.resOrigin = y * n + x;
      cell.resAmt = Math.floor(budget / 9) + Number(i < budget % 9);
    }
    break;
  }
  stockFish(grid, biome === "river_delta");
  return { grid, size: n, biome, seed };
}
 

/** Marks bridge cells: the contiguous water run through the river centre on each bridge row. */
export function placeBridges(grid: ValleyCell[][]): void {
const n = grid.length;
if (n === 0) return;
const rows = [Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75)];
for (const y of rows) {
if (y < 0 || y >= n) continue;
const row = grid[y];
let seed = Math.floor(n / 2);
if (row[seed]?.terrain !== "water" && row[seed]?.terrain !== "bridge") {
let found = -1;
for (let d = 1; d < n && found < 0; d++) {
if (seed - d >= 0 && row[seed - d]?.terrain === "water") found = seed - d;
else if (seed + d < n && row[seed + d]?.terrain === "water") found = seed + d;
}
if (found < 0) continue;
seed = found;
}
let x0 = seed;
let x1 = seed;
while (x0 > 0 && row[x0 - 1]?.terrain === "water") x0--;
while (x1 < n - 1 && row[x1 + 1]?.terrain === "water") x1++;
for (let x = x0; x <= x1; x++) {
const c = row[x];
if (!c) continue;
c.terrain = "bridge";
c.bridge = "h";
c.res = null;
c.resAmt = 0;
}
}
}

