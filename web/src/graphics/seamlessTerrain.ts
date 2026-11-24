// Pixel Dynasty — seamless organic terrain.
// The static ground is painted ONCE per match into an offscreen canvas (pixel-level 2D value noise,
// Bayer-dithered between 4 meadow shades, winding footpaths, flowers, pebbles, mossy banks) and then
// blitted every frame with a single drawImage. It is re-baked only when the terrain signature
// (farms / town centers) changes.

const TILE_W = 52;
const TILE_H = 26;
// Canvas extents follow the map size (set by bake()): the iso diamond spans n*TILE_W wide and n*TILE_H tall.
let OX = 700;
let OY = 16;
let CW = 1400;
let CH = 704;
const PATH_RES = 16; // path mask cells per tile

let layer: HTMLCanvasElement | null = null;
let lastState: any = null;
let lastSig = "";
let lastBuildCount = -1;
let bakeCount = 0;

export function getBakeCount(): number { return bakeCount; }

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smooth(t: number): number { return t * t * (3 - 2 * t); }
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const MOSS = rgb("#3A7A2C");
const EMERALD = rgb("#5FBF45");
const EMERALD_MID = rgb("#4FA73B");
const OLIVE = rgb("#7A9A3E");
const CLOVER = rgb("#9BB544");
const BANK = rgb("#2F6A2A");
const DIRT = rgb("#B58A56");
const DIRT_DARK = rgb("#9C7342");
const DIRT_LIGHT = rgb("#CDA46A");
const DIRT_RIM = rgb("#7B5A36");
const STONE_A = rgb("#8B8479");
const STONE_B = rgb("#A29B8C");
const STONE_C = rgb("#746D63");
const MORTAR = rgb("#5E574E");
const SOIL_A = rgb("#6B4A2B");
const SOIL_B = rgb("#7C5832");
const SOIL_BUND = rgb("#4B3016");
const SOIL_LIP = rgb("#9A7447");

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function tileKey(x: number, y: number, n: number): number { return y * n + x; }

function terrainSignature(state: any): string {
  const parts: string[] = [];
  for (const b of state.buildings) if (b.type === "farm" || b.type === "town_center") parts.push(b.type[0] + b.tx + "," + b.ty);
  return parts.join("|");
}

interface PathFields { path: Float32Array; cob: Uint8Array; pn: number; }

function stamp(f: PathFields, u: number, v: number, radius: number, cobble: boolean) {
  const pn = f.pn;
  const r = radius * PATH_RES;
  const cx = u * PATH_RES, cy = v * PATH_RES;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(pn - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(pn - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      const val = 1 - d / r;
      const idx = y * pn + x;
      if (cobble) f.cob[idx] = 1;
      else if (val > f.path[idx]) f.path[idx] = val;
    }
  }
}

function buildPaths(state: any, n: number): PathFields {
  const pn = n * PATH_RES;
  const f: PathFields = { path: new Float32Array(pn * pn), cob: new Uint8Array(pn * pn), pn };
  const tcs = state.buildings.filter((b: any) => b.type === "town_center");
  let seed = 100;
  for (const tc of tcs) {
    const cx = tc.tx + tc.size / 2, cy = tc.ty + tc.size / 2;
    // cobbled plaza around the town center
    for (let a = 0; a < 40; a++) {
      const ang = (a / 40) * Math.PI * 2;
      for (let rr = 0.8; rr <= 2.2; rr += 0.4) stamp(f, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 0.35, true);
    }
    stamp(f, cx, cy, 1.4, true);
    // nearest cluster of each resource type
    const targets: { x: number; y: number }[] = [];
    const types = ["wood", "food", "gold", "stone"];
    for (const t of types) {
      const found: { x: number; y: number; d: number }[] = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (state.grid[y][x].res !== t) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < 13 && d > 2.5) found.push({ x: x + 0.5, y: y + 0.5, d });
      }
      found.sort((p, q) => p.d - q.d);
      const limit = t === "wood" ? 2 : 1;
      let taken = 0;
      for (const c of found) {
        if (targets.length >= 8 || taken >= limit) break;
        if (targets.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 3.2)) continue;
        targets.push({ x: c.x, y: c.y });
        taken++;
      }
    }
    for (const t of targets) {
      seed++;
      const dx = t.x - cx, dy = t.y - cy;
      const dist = Math.hypot(dx, dy);
      const px = -dy / dist, py = dx / dist;
      const steps = Math.ceil(dist / 0.18);
      const endS = Math.max(0.2, 1 - 0.9 / dist);
      for (let k = 0; k <= steps; k++) {
        const s = (k / steps) * endS;
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, s / endS * 0.98 + 0.01)), 0.6);
        const off = ((vnoise(s * 5 + seed, seed, seed) - 0.5) * 2.2 + Math.sin(s * 9 + seed) * 0.35) * env;
        const w = 0.26 + vnoise(s * 7, seed, 9) * 0.1;
        stamp(f, cx + dx * s + px * off, cy + dy * s + py * off, w, false);
      }
    }
    seed += 7;
  }
  return f;
}

function bake(state: any, n: number) {
  bakeCount++;
  const ncw = Math.ceil((n * TILE_W) / 2) * 2 + 32, nch = n * TILE_H + 48;
  if (!layer || ncw !== CW || nch !== CH) {
    OX = ncw / 2; OY = 16; CW = ncw; CH = nch;
    if (!layer) layer = document.createElement("canvas");
    layer.width = CW; layer.height = CH; // resizing also frees the old backing store
  }
  const g = layer.getContext("2d") as CanvasRenderingContext2D;
  g.clearRect(0, 0, CW, CH);
  const grid = state.grid;
  const fields = buildPaths(state, n);
  const farms = new Set<number>();
  for (const b of state.buildings) if (b.type === "farm") farms.add(tileKey(b.tx, b.ty, n));
  const nearWater = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = grid[y + dy]?.[x + dx];
      if (c && c.terrain === "water") nearWater[tileKey(x, y, n)] = 1;
    }
  }
  const img = g.createImageData(CW, CH);
  const data = img.data;
  const pn = fields.pn;
  for (let j = 0; j < CH; j++) {
    for (let i = 0; i < CW; i++) {
      const wx = i + 0.5 - OX, wy = j + 0.5 - OY;
      const su = wy / (TILE_H / 2), sd = wx / (TILE_W / 2);
      const u = (su + sd) / 2, v = (su - sd) / 2;
      if (u < 0 || v < 0 || u >= n || v >= n) continue;
      const tx = Math.floor(u), ty = Math.floor(v);
      const cell = grid[ty][tx];
      if (cell.terrain === "water" || cell.terrain === "bridge") continue;
      const dth = (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.5) * 0.12;
      let col: [number, number, number];
      if (farms.has(tileKey(tx, ty, n))) {
        const fu = u - tx, fv = v - ty;
        const edge = Math.min(fu, fv, 1 - fu, 1 - fv);
        if (edge < 0.07) col = SOIL_BUND;
        else if (edge < 0.1) col = SOIL_LIP;
        else col = (Math.floor(fv * 6) & 1) === 0 ? SOIL_A : SOIL_B;
      } else {
        const n1 = vnoise(u * 0.22, v * 0.22, 1) * 0.65 + vnoise(u * 0.55, v * 0.55, 2) * 0.35;
        col = n1 + dth < 0.42 ? MOSS : (n1 + dth < 0.55 ? EMERALD_MID : EMERALD);
        if (vnoise(u * 0.3 + 50, v * 0.3, 3) + dth > 0.64) col = OLIVE;
        if (vnoise(u * 0.45, v * 0.45 + 90, 4) + dth > 0.76) col = CLOVER;
        if (nearWater[tileKey(tx, ty, n)]) {
          let best = 9;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const c = grid[ty + dy]?.[tx + dx];
            if (!c || c.terrain !== "water") continue;
            const nx = tx + dx, ny = ty + dy;
            const ddx = Math.max(nx - u, 0, u - (nx + 1)), ddy = Math.max(ny - v, 0, v - (ny + 1));
            const d = Math.hypot(ddx, ddy);
            if (d < best) best = d;
          }
          if (best + dth * 1.5 < 0.28) col = BANK;
          else if (best + dth * 1.5 < 0.5) col = MOSS;
        }
        const fx = Math.floor(u * PATH_RES), fy = Math.floor(v * PATH_RES);
        const idx = fy * pn + fx;
        const m = fields.path[idx] + (vnoise(u * 3, v * 3, 5) - 0.5) * 0.3;
        const cobbled = fields.cob[idx] === 1 && !cell.res;
        if (cobbled && fields.path[idx] + fields.cob[idx] > 0.5 && vnoise(u * 2.2, v * 2.2, 8) > 0.28) {
          const bx = Math.floor((i + ((j >> 1) & 1) * 2) / 4), by = j >> 1;
          if ((j & 1) === 0 || ((i + ((j >> 1) & 1) * 2) & 3) === 0) col = MORTAR;
          else { const h = hash2(bx, by, 7); col = h < 0.34 ? STONE_A : h < 0.7 ? STONE_B : STONE_C; }
        } else if (m > 0.4) {
          if (m < 0.5) col = DIRT_RIM;
          else { const h = hash2(i, j, 6); col = h < 0.18 ? DIRT_DARK : h > 0.9 ? DIRT_LIGHT : DIRT; }
        } else if (hash2(i, j, 13) < 0.05) {
          col = [Math.min(255, col[0] + 14), Math.min(255, col[1] + 18), Math.min(255, col[2] + 8)];
        } else if (hash2(i, j, 14) < 0.05) {
          col = [Math.max(0, col[0] - 12), Math.max(0, col[1] - 14), Math.max(0, col[2] - 8)];
        }
      }
      const o = (j * CW + i) * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Scattered details: grass blades, wildflowers, pebbles.
  const FLOWERS = ["#F8FAFC", "#FDE047", "#F9A8D4", "#C4B5FD"];
  const px = (u: number, v: number) => ({ x: Math.round(OX + (u - v) * (TILE_W / 2)), y: Math.round(OY + (u + v) * (TILE_H / 2)) });
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const cell = grid[ty][tx];
      if (cell.terrain === "water" || cell.terrain === "bridge" || farms.has(tileKey(tx, ty, n))) continue;
      if (hash2(tx, ty, 21) > 0.62) continue;
      const kind = hash2(tx, ty, 22);
      const cu = tx + 0.22 + hash2(tx, ty, 23) * 0.56, cv = ty + 0.22 + hash2(tx, ty, 24) * 0.56;
      const count = kind < 0.55 ? 6 : kind < 0.8 ? 4 : 3;
      for (let k = 0; k < count; k++) {
        const u = Math.min(tx + 0.92, Math.max(tx + 0.08, cu + (hash2(tx, ty, 30 + k) - 0.5) * 0.4));
        const v = Math.min(ty + 0.92, Math.max(ty + 0.08, cv + (hash2(tx, ty, 50 + k) - 0.5) * 0.4));
        const fi = Math.floor(v * PATH_RES) * pn + Math.floor(u * PATH_RES);
        if (fields.path[fi] > 0.25 || fields.cob[fi]) continue;
        const p = px(u, v);
        if (kind < 0.55) {
          g.fillStyle = "#2E6B26"; g.fillRect(p.x, p.y - 2, 1, 3); g.fillRect(p.x + 2, p.y - 1, 1, 2);
          g.fillStyle = "#9BD66A"; g.fillRect(p.x, p.y - 3, 1, 1); g.fillRect(p.x + 2, p.y - 2, 1, 1);
          g.fillStyle = "#3F8A2E"; g.fillRect(p.x - 1, p.y - 1, 1, 2);
        } else if (kind < 0.8) {
          g.fillStyle = "#2F6B2B"; g.fillRect(p.x, p.y - 2, 1, 2);
          g.fillStyle = FLOWERS[Math.floor(hash2(tx, ty, 70 + k) * FLOWERS.length)];
          g.fillRect(p.x - 1, p.y - 3, 3, 1); g.fillRect(p.x, p.y - 4, 1, 3);
          g.fillStyle = "#FDE047"; g.fillRect(p.x, p.y - 3, 1, 1);
        } else {
          g.fillStyle = "rgba(40,30,20,0.45)"; g.fillRect(p.x, p.y + 1, 4, 1);
          g.fillStyle = "#8D8A82"; g.fillRect(p.x, p.y - 1, 3, 2);
          g.fillStyle = "#C9C5BA"; g.fillRect(p.x, p.y - 1, 1, 1);
        }
      }
    }
  }
}

/** Re-bake only when the state object, or its farm / town-center layout, changed. */
export function ensure(state: any, n: number): void {
  if (!layer || state !== lastState) {
    bake(state, n);
    lastState = state; lastSig = terrainSignature(state); lastBuildCount = state.buildings.length;
    return;
  }
  if (state.buildings.length !== lastBuildCount) {
    lastBuildCount = state.buildings.length;
    const sig = terrainSignature(state);
    if (sig !== lastSig) { lastSig = sig; bake(state, n); }
  }
}

export function drawBase(ctx: CanvasRenderingContext2D): void {
  if (!layer) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, -OX, -OY);
}

/** Faint tile outlines around the cursor — only called while a building is being placed. */
export function drawBuildGrid(ctx: CanvasRenderingContext2D, hover: { tx: number; ty: number } | null, n: number): void {
  if (!hover) return;
  ctx.beginPath();
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = hover.tx + dx, y = hover.ty + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      if (Math.abs(dx) + Math.abs(dy) > 4) continue;
      const wx = (x - y) * (TILE_W / 2), wy = (x + y) * (TILE_H / 2);
      ctx.moveTo(wx, wy); ctx.lineTo(wx + TILE_W / 2, wy + TILE_H / 2); ctx.lineTo(wx, wy + TILE_H); ctx.lineTo(wx - TILE_W / 2, wy + TILE_H / 2); ctx.closePath();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
}
