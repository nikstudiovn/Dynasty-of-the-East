// Map generator for 48 / 64 / 96 tile maps and 4 map types. Pure data, no rendering.
//   river_valley     winding river + central lotus lake crossed by 3 / 4 / 5 arched wooden bridges
//   open_plains      no river barrier, wide open ground (fast cavalry flanking)
//   highland_passes  impassable rock ridges dividing the map, 3 narrow mountain passes
//   random           a deterministic seed picks the biome and varies the layout every match
// Seed 0 reproduces the original 48x48 lotus valley exactly.

export type MapSize = 48 | 64 | 96;
export type Biome = "river_valley" | "open_plains" | "highland_passes";
export type MapType = Biome | "random";

export const MAP_SIZES: MapSize[] = [48, 64, 96];
export const MAP_TYPES: MapType[] = ["river_valley", "open_plains", "highland_passes", "random"];

export interface ValleyCell { terrain: string; res: string | null; resAmt: number; bridge?: string }
export interface BasePos { tx: number; ty: number; idx: number }

export function normalizeMapSize(v: any): MapSize {
  const n = Number(v);
  return n === 64 ? 64 : n === 96 ? 96 : 48;
}
export function normalizeMapType(v: any): MapType {
  return MAP_TYPES.includes(v) ? v : "river_valley";
}

/** mulberry32 — small deterministic PRNG. */
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

/** Seed used for a fresh match: only "random" maps vary; the fixed archetypes keep the classic layout. */
export function newSeedFor(type: MapType): number {
  return type === "random" ? (1 + Math.floor(Math.random() * 0x7ffffffe)) : 0;
}

/** Resolves "random" to a concrete biome, deterministically from the seed. */
export function resolveBiome(type: MapType, seed: number): Biome {
  if (type !== "random") return type;
  const r = rng((seed ^ 0x9E3779B9) >>> 0);
  r();
  const v = r();
  return v < 0.4 ? "river_valley" : v < 0.7 ? "open_plains" : "highland_passes";
}

/** Corner margin and base positions (town center top-left tile, 2x2). */
export function cornerMargin(n: number): number { return Math.round(n * 0.12); }
export function playerBase(n: number): BasePos { const m = cornerMargin(n); return { tx: m, ty: m, idx: -1 }; }
export function aiCorners(n: number): BasePos[] {
  const m = cornerMargin(n), far = n - m - 2;
  return [{ tx: far, ty: far, idx: 0 }, { tx: far, ty: m, idx: 1 }, { tx: m, ty: far, idx: 2 }];
}

/** Bridges (3 / 4 / 5) / contested clusters (4 / 6 / 10) / resource multiplier per map size. */
export function bridgeCount(n: number): number { return n >= 96 ? 5 : n >= 64 ? 4 : 3; }
export function clusterCount(n: number): number { return n >= 96 ? 10 : n >= 64 ? 6 : 4; }
export function resourceScale(n: number): number { return 1 + (n - 48) / 96; } // 1, 1.17, 1.5
/** Starting stockpile scaled for the map size. */
export function startingResources(n: number): { food: number; wood: number; gold: number; stone: number } {
  const k = resourceScale(n), r5 = (v: number) => Math.round((v * k) / 5) * 5;
  return { food: r5(200), wood: r5(200), gold: r5(50), stone: r5(100) };
}

export function bridgeRowsFor(n: number): number[] {
  const k = bridgeCount(n), a = Math.round(n * 9 / 48), b = Math.round(n * 39 / 48);
  const rows: number[] = [];
  for (let i = 0; i < k; i++) rows.push(Math.round(a + ((b - a) * i) / (k - 1)));
  return rows;
}

// ---- layout of the most recently generated map ------------------------------
interface Layout { n: number; bridgeRows: number[]; riverX: (y: number) => number }
let layout: Layout = { n: 48, bridgeRows: bridgeRowsFor(48), riverX: (y) => 24 + 4.5 * Math.sin(y * 0.16 + 0.6) + 1.6 * Math.sin(y * 0.41 + 2.1) };

function makeRiver(n: number, r: (() => number) | null): (y: number) => number {
  const s = n / 48;
  const p1 = r ? (r() - 0.5) * 2.4 : 0, p2 = r ? (r() - 0.5) * 2.4 : 0, amp = r ? 0.8 + r() * 0.4 : 1;
  return (y) => n / 2 + 4.5 * s * amp * Math.sin((y * 0.16) / s + 0.6 + p1) + 1.6 * s * Math.sin((y * 0.41) / s + 2.1 + p2);
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const isWet = (t: string | undefined) => t === "water" || t === "bridge";

/** Marks bridge cells: the contiguous water run through the river centre on each bridge row. */
export function placeBridges(grid: ValleyCell[][]): void {
  const n = grid.length;
  const rows = layout.n === n ? layout.bridgeRows : bridgeRowsFor(n);
  const rx = layout.n === n ? layout.riverX : makeRiver(n, null);
  for (const y of rows) {
    if (y >= n) continue;
    const row = grid[y];
    let seed = Math.max(0, Math.min(n - 1, Math.floor(rx(y))));
    if (row[seed].terrain !== "water" && row[seed].terrain !== "bridge") {
      let found = -1;
      for (let d = 1; d < 8 && found < 0; d++) {
        if (row[seed - d]?.terrain === "water") found = seed - d;
        else if (row[seed + d]?.terrain === "water") found = seed + d;
      }
      if (found < 0) continue;
      seed = found;
    }
    let x0 = seed, x1 = seed;
    while (x0 > 0 && row[x0 - 1].terrain === "water") x0--;
    while (x1 < n - 1 && row[x1 + 1].terrain === "water") x1++;
    for (let x = x0; x <= x1; x++) {
      const c = row[x];
      c.terrain = "bridge"; c.bridge = "h"; c.res = null; c.resAmt = 0;
    }
  }
}

function nearBarrier(grid: ValleyCell[][], x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = grid[y + dy]?.[x + dx]?.terrain;
    if (t === "water" || t === "bridge" || t === "rock") return true;
  }
  return false;
}

// ---- biomes -----------------------------------------------------------------
function carveRiver(grid: ValleyCell[][], n: number, seed: number): void {
  const r = seed ? rng(seed) : null;
  const rx = makeRiver(n, r);
  const s = n / 48;
  const lake = r
    ? { x: n / 2 + (r() - 0.5) * n * 0.06, y: n / 2 + (r() - 0.5) * n * 0.05, rx: 5.2 * s, ry: 4.2 * s }
    : { x: 24 * s, y: 24 * s, rx: 5.2 * s, ry: 4.2 * s };
  const inLake = (x: number, y: number) => {
    const dx = (x + 0.5 - lake.x) / lake.rx, dy = (y + 0.5 - lake.y) / lake.ry;
    const a = Math.atan2(dy, dx);
    const rr = 1 + 0.12 * Math.sin(3 * a) + 0.08 * Math.sin(5 * a + 1);
    return dx * dx + dy * dy < rr * rr;
  };
  const W = 1.25;
  for (let y = 0; y < n; y++) {
    const a = rx(y), b = rx(Math.max(0, y - 1)), c = rx(Math.min(n - 1, y + 1));
    const lo = Math.min(a, (a + b) / 2, (a + c) / 2) - W, hi = Math.max(a, (a + b) / 2, (a + c) / 2) + W;
    for (let x = 0; x < n; x++) {
      const cx = x + 0.5;
      if ((cx > lo && cx < hi) || inLake(x, y)) grid[y][x].terrain = "water";
    }
  }
  let rows = bridgeRowsFor(n);
  if (r) rows = rows.map((y, i) => (i === 0 || i === rows.length - 1 ? y : Math.max(2, Math.min(n - 3, y + Math.round((r() - 0.5) * n * 0.04)))));
  layout = { n, bridgeRows: rows, riverX: rx };
  placeBridges(grid);
}

function carveRidges(grid: ValleyCell[][], n: number, seed: number): void {
  const r = seed ? rng(seed ^ 0x51ED270B) : null;
  const s = n / 48;
  const ph = r ? (r() - 0.5) * 2.4 : 0;
  const rx = (y: number) => n / 2 + 3.4 * s * Math.sin((y * 0.13) / s + 1.1 + ph) + 1.2 * s * Math.sin((y * 0.37) / s + 0.4 + ph);
  const W = 1.7; // ridge half-width: ~3-4 tiles thick, never leaks diagonally
  for (let y = 0; y < n; y++) {
    const a = rx(y), b = rx(Math.max(0, y - 1)), c = rx(Math.min(n - 1, y + 1));
    const lo = Math.min(a, (a + b) / 2, (a + c) / 2) - W, hi = Math.max(a, (a + b) / 2, (a + c) / 2) + W;
    for (let x = 0; x < n; x++) if (x + 0.5 > lo && x + 0.5 < hi) grid[y][x].terrain = "rock";
  }
  // Spurs: short rock arms that fork off the main ridge between the passes.
  const spurRows = [0.36, 0.64].map(f => Math.round(n * f + (r ? (r() - 0.5) * n * 0.04 : 0)));
  spurRows.forEach((y, i) => {
    const dir = i === 0 ? -1 : 1, len = Math.round(n * 0.14), x0 = Math.round(rx(y));
    for (let k = 0; k < len; k++) {
      const x = x0 + dir * k;
      for (let dy = -1; dy <= 1; dy++) if (grid[y + dy]?.[x]) grid[y + dy][x].terrain = "rock";
    }
  });
  // Exactly 3 narrow passes (3 tiles wide) cut through the main ridge.
  const passFr = [0.2, 0.5, 0.8];
  for (const f of passFr) {
    const py = Math.max(3, Math.min(n - 4, Math.round(n * f + (r ? (r() - 0.5) * n * 0.05 : 0))));
    for (let dy = -1; dy <= 1; dy++) {
      const y = py + dy;
      for (let x = 0; x < n; x++) if (grid[y][x].terrain === "rock" && Math.abs(x - rx(y)) < W + 3) grid[y][x].terrain = "grass";
    }
  }
  layout = { n, bridgeRows: [], riverX: rx };
}

// ---- resources ----------------------------------------------------------------
const START: Array<[string, number, Array<[number, number]>]> = [
  ["wood", 260, [[-5, 1], [-4, 1], [-5, 2], [-4, 2], [-3, 3], [-5, 3], [-4, 4], [1, -5], [1, -4], [2, -5], [2, -4], [3, -3], [3, -5], [4, -4]]],
  ["food", 280, [[2, 2], [3, 2], [2, 3], [3, 3]]],
  ["gold", 380, [[6, -1], [6, 0], [7, -1], [7, 0]]],
  ["stone", 360, [[-1, 6], [0, 6], [-1, 7], [0, 7]]],
];
// Normalised (0..1) positions of the contested clusters: the first 4 are the classic hills.
const CLUSTERS: Array<[number, number, string, number]> = [
  [17 / 48, 22 / 48, "gold", 650], [31 / 48, 26 / 48, "gold", 650], [30 / 48, 12 / 48, "stone", 560], [18 / 48, 36 / 48, "stone", 560],
  [0.38, 0.2, "gold", 650], [0.62, 0.8, "gold", 650],
  [0.2, 0.5, "stone", 560], [0.8, 0.5, "stone", 560], [0.62, 0.2, "stone", 560], [0.38, 0.8, "stone", 560],
];

/** Carves terrain for the chosen biome and distributes resources. Grid must be n×n grass. */
export function generateValley(grid: ValleyCell[][], type: MapType = "river_valley", seed = 0): void {
  const n = grid.length;
  const biome = resolveBiome(normalizeMapType(type), seed);
  if (biome === "river_valley") carveRiver(grid, n, seed);
  else if (biome === "highland_passes") carveRidges(grid, n, seed);
  else layout = { n, bridgeRows: [], riverX: makeRiver(n, null) };

  const r = rng((seed ^ 0xA5A5F00D) >>> 0);
  const off = seed ? { x: r() * 200, y: r() * 200 } : { x: 0, y: 0 };
  const scale = resourceScale(n);
  const bases: BasePos[] = [playerBase(n), ...aiCorners(n)];
  const put = (x: number, y: number, rt: string, amt: number) => {
    const c = grid[y]?.[x];
    if (!c || c.terrain !== "grass" || c.res) return;
    c.res = rt; c.resAmt = Math.round(amt);
  };

  // Starting resources mirrored around every base (oriented toward the map centre).
  for (const base of bases) {
    const sx = base.tx < n / 2 ? 1 : -1, sy = base.ty < n / 2 ? 1 : -1;
    const cx = base.tx + 1, cy = base.ty + 1;
    const tile = (c: number, d: number, s: number) => (s > 0 ? c + d : c - 1 - d);
    for (const [rt, amt, offs] of START) {
      for (const [dx, dy] of offs) put(tile(cx, dx, sx), tile(cy, dy, sy), rt, amt * scale);
    }
  }

  // Contested gold / stone clusters (4 on 48, 6 on 64, 10 on 96).
  const centers: Array<[number, number]> = [];
  const count = clusterCount(n);
  for (let i = 0; i < count; i++) {
    const [fx, fy, rt, amt] = CLUSTERS[i];
    let hx = Math.round(fx * n), hy = Math.round(fy * n);
    if (seed && i >= 4) { hx += Math.round((r() - 0.5) * n * 0.08); hy += Math.round((r() - 0.5) * n * 0.08); }
    else if (seed) { hx += Math.round((r() - 0.5) * n * 0.05); hy += Math.round((r() - 0.5) * n * 0.05); }
    // nearest grass tile with clearance from water/rock
    let best: [number, number] | null = null;
    for (let d = 0; d <= 8 && !best; d++) {
      for (let dy = -d; dy <= d && !best; dy++) for (let dx = -d; dx <= d && !best; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const x = hx + dx, y = hy + dy;
        if (x < 2 || y < 2 || x > n - 3 || y > n - 3) continue;
        if (grid[y][x].terrain !== "grass" || grid[y][x].res) continue;
        if (nearBarrier(grid, x, y, 1)) continue;
        if (bases.some(b => Math.hypot(b.tx + 1 - x, b.ty + 1 - y) < 10)) continue;
        best = [x, y];
      }
    }
    if (!best) continue;
    centers.push(best);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) put(best[0] + dx, best[1] + dy, rt, amt);
  }

  // Scattered bamboo groves and wild rice meadows (open plains are greener).
  const woodT = biome === "open_plains" ? 0.62 : 0.66, foodT = biome === "open_plains" ? 0.84 : 0.86;
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      if (grid[y][x].terrain !== "grass" || grid[y][x].res) continue;
      if (bases.some(b => Math.hypot(b.tx + 1 - x, b.ty + 1 - y) < 9)) continue;
      if (centers.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 3)) continue;
      if (nearBarrier(grid, x, y, 1)) continue;
      const f = vnoise(x * 0.21 + off.x, y * 0.21 + off.y) * 0.7 + vnoise(x * 0.55 + 9 + off.x, y * 0.55 + 3 + off.y) * 0.3;
      if (f > woodT) put(x, y, "wood", 240);
      else if (vnoise(x * 0.3 + 40 + off.x, y * 0.3 + 17 + off.y) > foodT) put(x, y, "food", 240);
    }
  }
}
