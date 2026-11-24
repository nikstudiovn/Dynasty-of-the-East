// Pixel Dynasty — grid A* backed by a binary min-heap (fast enough for 96×96 maps on iPhone-class CPUs).
// Pure functions: the game passes in its own `isTileBlocked(tx, ty, team?)`.

export type BlockedFn = (tx: number, ty: number, team?: string) => boolean;
export interface PathPt { x: number; y: number }

export interface TerrainCellLike {
  terrain?: string;
  bridge?: string;
}

/** Land units are blocked by deep water (terrain === "water" without a bridge), but can cross shallow water. */
export function isWalkableTerrain(cell: TerrainCellLike | undefined): boolean {
  if (!cell) return false;
  if (cell.terrain === "water" && !cell.bridge) return false;
  return true;
}
/** Binary min-heap of node indices keyed by a priority array (no per-node object allocation). */
export class MinHeap {
  private items: Int32Array;
  private keys: Float32Array;
  size = 0;
  constructor(capacity = 256) {
    this.items = new Int32Array(capacity);
    this.keys = new Float32Array(capacity);
  }
  clear(): void { this.size = 0; }
  push(item: number, key: number): void {
    if (this.size === this.items.length) {
      const ni = new Int32Array(this.size * 2); ni.set(this.items); this.items = ni;
      const nk = new Float32Array(this.size * 2); nk.set(this.keys); this.keys = nk;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.items[i] = this.items[p]; this.keys[i] = this.keys[p];
      i = p;
    }
    this.items[i] = item; this.keys[i] = key;
  }
  /** Removes and returns the item with the smallest key (-1 when empty). */
  pop(): number {
    if (this.size === 0) return -1;
    const top = this.items[0];
    const last = --this.size;
    if (last > 0) {
      const item = this.items[last], key = this.keys[last];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= last) break;
        if (c + 1 < last && this.keys[c + 1] < this.keys[c]) c++;
        if (this.keys[c] >= key) break;
        this.items[i] = this.items[c]; this.keys[i] = this.keys[c];
        i = c;
      }
      this.items[i] = item; this.keys[i] = key;
    }
    return top;
  }
}

// Scratch buffers reused between searches; a generation stamp avoids clearing them.
let cap = 0;
let gScore = new Float32Array(0);
let parent = new Int32Array(0);
let stamp = new Uint32Array(0);
let closedStamp = new Uint32Array(0);
let gen = 0;
const heap = new MinHeap(1024);

function ensure(size: number): void {
  const need = size * size;
  if (need <= cap) return;
  cap = need;
  gScore = new Float32Array(need);
  parent = new Int32Array(need);
  stamp = new Uint32Array(need);
  closedStamp = new Uint32Array(need);
  gen = 0;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Iteration limit: mapSize * 60 (<= 5760 on 96×96). */
export function iterationLimit(mapSize: number): number { return mapSize * 60; }

/**
 * A* over a size×size grid with 8-way movement. Returns the tile-centre waypoints from (but excluding)
 * the start to the goal, [] when no goal tile is reachable, or just the goal when the iteration limit hits.
 */
export function findPathRaw(
  size: number, sx: number, sy: number, gx: number, gy: number,
  blocked: BlockedFn, team?: string,
): PathPt[] {
  const clampI = (v: number) => Math.max(0, Math.min(size - 1, Math.floor(v)));
  const startX = clampI(sx), startY = clampI(sy);
  let goalX = clampI(gx), goalY = clampI(gy);

  if (blocked(goalX, goalY, team)) {
    let bestX = -1, bestY = -1, bestD = 999;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = goalX + dx, ny = goalY + dy;
        if (!blocked(nx, ny, team)) {
          const d = Math.hypot(nx - startX, ny - startY);
          if (d < bestD) { bestD = d; bestX = nx; bestY = ny; }
        }
      }
    }
    if (bestX < 0) return [];
    goalX = bestX; goalY = bestY;
  }

  ensure(size);
  gen++;
  if (gen >= 0xfffffff0) { stamp.fill(0); closedStamp.fill(0); gen = 1; }
  heap.clear();

  const startI = startY * size + startX, goalI = goalY * size + goalX;
  gScore[startI] = 0; parent[startI] = -1; stamp[startI] = gen;
  heap.push(startI, Math.hypot(goalX - startX, goalY - startY));

  const limit = iterationLimit(size);
  let iter = 0;
  while (heap.size > 0 && iter++ < limit) {
    const cur = heap.pop();
    if (closedStamp[cur] === gen) continue; // stale duplicate entry
    if (cur === goalI) {
      const path: PathPt[] = [];
      for (let k = cur; parent[k] !== -1; k = parent[k]) {
        path.push({ x: (k % size) + 0.5, y: Math.floor(k / size) + 0.5 });
      }
      path.reverse();
      return path;
    }
    closedStamp[cur] = gen;
    const cx = cur % size, cy = (cur - cx) / size, cg = gScore[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const ni = ny * size + nx;
      if (closedStamp[ni] === gen || blocked(nx, ny, team)) continue;
      const tg = cg + (d >= 4 ? 1.414 : 1);
      if (stamp[ni] !== gen || tg < gScore[ni]) {
        stamp[ni] = gen; gScore[ni] = tg; parent[ni] = cur;
        heap.push(ni, tg + Math.hypot(goalX - nx, goalY - ny));
      }
    }
  }
  return [{ x: goalX + 0.5, y: goalY + 0.5 }];
}
