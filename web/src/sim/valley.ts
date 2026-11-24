// Valley generator for the 48×48 map: winding river, central lotus lake,
// 3 arched wooden bridges and resource clusters. Pure data, no rendering.

export const MAP_N = 48;

export interface ValleyCell { terrain: string; res: string | null; resAmt: number; bridge?: string }

/** Player base (town center top-left tile) and the 3 AI corners. */
export const PLAYER_BASE = { tx: 6, ty: 6 };
export const AI_CORNERS = [
  { tx: 40, ty: 40, idx: 0 },
  { tx: 40, ty: 6, idx: 1 },
  { tx: 6, ty: 40, idx: 2 },
];

/** Rows crossed by the 3 bridges (north river, lotus lake, south river). */
export const BRIDGE_ROWS = [9, 24, 39];
export const LAKE = { x: 24, y: 24, rx: 5.2, ry: 4.2 };

/** Centre line of the river (tile x) at a given row. */
export function riverX(y: number): number {
  return MAP_N / 2 + 4.5 * Math.sin(y * 0.16 + 0.6) + 1.6 * Math.sin(y * 0.41 + 2.1);
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

function inLake(x: number, y: number): boolean {
  const dx = (x + 0.5 - LAKE.x) / LAKE.rx, dy = (y + 0.5 - LAKE.y) / LAKE.ry;
  const a = Math.atan2(dy, dx);
  const r = 1 + 0.12 * Math.sin(3 * a) + 0.08 * Math.sin(5 * a + 1);
  return dx * dx + dy * dy < r * r;
}

/** Marks bridge cells: the contiguous water run through the river centre on each bridge row. */
export function placeBridges(grid: ValleyCell[][]): void {
  const n = grid.length;
  for (const y of BRIDGE_ROWS) {
    if (y >= n) continue;
    const row = grid[y];
    let seed = Math.max(0, Math.min(n - 1, Math.floor(riverX(y))));
    if (row[seed].terrain !== "water" && row[seed].terrain !== "bridge") {
      // search the nearest water cell
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

function nearWater(grid: ValleyCell[][], x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = grid[y + dy]?.[x + dx]?.terrain;
    if (t === "water" || t === "bridge") return true;
  }
  return false;
}

/** Carves water + bridges and distributes resources. Grid must be MAP_N×MAP_N grass. */
export function generateValley(grid: ValleyCell[][]): void {
  const n = grid.length;
  // 1. River (watertight between consecutive rows) + lotus lake.
  const W = 1.25;
  for (let y = 0; y < n; y++) {
    const a = riverX(y), b = riverX(Math.max(0, y - 1)), c = riverX(Math.min(n - 1, y + 1));
    const lo = Math.min(a, (a + b) / 2, (a + c) / 2) - W, hi = Math.max(a, (a + b) / 2, (a + c) / 2) + W;
    for (let x = 0; x < n; x++) {
      const cx = x + 0.5;
      if ((cx > lo && cx < hi) || inLake(x, y)) grid[y][x].terrain = "water";
    }
  }
  placeBridges(grid);

  const bases = [PLAYER_BASE, ...AI_CORNERS];
  const put = (x: number, y: number, type: string, amt: number) => {
    const c = grid[y]?.[x];
    if (!c || c.terrain !== "grass" || c.res) return;
    c.res = type; c.resAmt = amt;
  };

  // 2. Starting resources mirrored around every base (oriented toward the valley centre).
  const START: Array<[string, number, Array<[number, number]>]> = [
    ["wood", 260, [[-5, 1], [-4, 1], [-5, 2], [-4, 2], [-3, 3], [-5, 3], [-4, 4], [1, -5], [1, -4], [2, -5], [2, -4], [3, -3], [3, -5], [4, -4]]],
    ["food", 280, [[2, 2], [3, 2], [2, 3], [3, 3]]],
    ["gold", 380, [[6, -1], [6, 0], [7, -1], [7, 0]]],
    ["stone", 360, [[-1, 6], [0, 6], [-1, 7], [0, 7]]],
  ];
  for (const base of bases) {
    const sx = base.tx < n / 2 ? 1 : -1, sy = base.ty < n / 2 ? 1 : -1;
    const cx = base.tx + 1, cy = base.ty + 1;
    const tile = (c: number, d: number, s: number) => (s > 0 ? c + d : c - 1 - d);
    for (const [type, amt, offs] of START) {
      for (const [dx, dy] of offs) put(tile(cx, dx, sx), tile(cy, dy, sy), type, amt);
    }
  }

  // 3. Four contested high-value hills near the lake and bridges.
  const HILLS: Array<[number, number, string, number]> = [
    [17, 22, "gold", 650], [31, 26, "gold", 650], [30, 12, "stone", 560], [18, 36, "stone", 560],
  ];
  const hillCenters: Array<[number, number]> = [];
  for (const [hx, hy, type, amt] of HILLS) {
    const dir = hx < n / 2 ? -1 : 1;
    let px = hx;
    for (let k = 0; k < 7 && nearWater(grid, px, hy, 1); k++) px += dir;
    hillCenters.push([px, hy]);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) put(px + dx, hy + dy, type, amt);
  }

  // 4. Scattered bamboo groves and wild rice meadows across the valley.
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      if (grid[y][x].terrain !== "grass" || grid[y][x].res) continue;
      if (bases.some(b => Math.hypot(b.tx + 1 - x, b.ty + 1 - y) < 9)) continue;
      if (hillCenters.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 3)) continue;
      if (nearWater(grid, x, y, 1)) continue;
      const f = vnoise(x * 0.21, y * 0.21) * 0.7 + vnoise(x * 0.55 + 9, y * 0.55 + 3) * 0.3;
      if (f > 0.66) put(x, y, "wood", 240);
      else if (vnoise(x * 0.3 + 40, y * 0.3 + 17) > 0.86) put(x, y, "food", 240);
    }
  }
}
