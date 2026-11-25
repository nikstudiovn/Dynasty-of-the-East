// Dynasty of the East — terrain: wooden bridges, sandy shorelines, golden-hour shadows.

import { placeBridges } from "../sim/valley";

const TILE_W = 52;
const TILE_H = 26;
const INK = "#1A120E";

export type BridgeDir = "h" | "v" | "x";

/**
 * Marks the 3 arched wooden crossings of the 48×48 valley (north river, lotus lake, south river).
 * Bridge cells get terrain "bridge" (walkable: only "water" blocks) and a `bridge` direction.
 * Everything is plain JSON, so it serialises with the grid in the save file.
 */
export function placeWoodenBridges(grid: any[][]): void {
  placeBridges(grid);
}

/** Only water blocks movement. Bridges and land are walkable. */
export function isTerrainBlocked(cell: any): boolean {
  return !cell || cell.terrain === "water" || cell.terrain === "rock";
}

// Local tile coordinates (u along +x tile axis, v along +y tile axis) -> screen point.
function px(wx: number, wy: number, u: number, v: number) { return wx + (u - v) * (TILE_W / 2); }
function py(wx: number, wy: number, u: number, v: number) { return wy + (u + v) * (TILE_H / 2); }

function quad(ctx: CanvasRenderingContext2D, wx: number, wy: number, u0: number, v0: number, u1: number, v1: number, lift: number) {
  ctx.beginPath();
  ctx.moveTo(px(wx, wy, u0, v0), py(wx, wy, u0, v0) - lift);
  ctx.lineTo(px(wx, wy, u1, v0), py(wx, wy, u1, v0) - lift);
  ctx.lineTo(px(wx, wy, u1, v1), py(wx, wy, u1, v1) - lift);
  ctx.lineTo(px(wx, wy, u0, v1), py(wx, wy, u0, v1) - lift);
  ctx.closePath();
}

function waterBase(ctx: CanvasRenderingContext2D, wx: number, wy: number) {
  ctx.fillStyle = "#0D5C5C";
  ctx.beginPath();
  ctx.moveTo(wx, wy + 1); ctx.lineTo(wx + TILE_W / 2 - 2, wy + TILE_H / 2); ctx.lineTo(wx, wy + TILE_H - 1); ctx.lineTo(wx - TILE_W / 2 + 2, wy + TILE_H / 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#148484";
  ctx.beginPath();
  ctx.moveTo(wx, wy + 5); ctx.lineTo(wx + TILE_W / 2 - 10, wy + TILE_H / 2); ctx.lineTo(wx, wy + TILE_H - 5); ctx.lineTo(wx - TILE_W / 2 + 10, wy + TILE_H / 2);
  ctx.closePath(); ctx.fill();
}

const PLANKS = 6;
function deck(ctx: CanvasRenderingContext2D, wx: number, wy: number, along: "u" | "v") {
  const lift = 3;
  // shadow on water
  ctx.fillStyle = "rgba(6, 30, 30, 0.55)";
  if (along === "u") quad(ctx, wx, wy, 0, 0.22, 1, 0.84, -1); else quad(ctx, wx, wy, 0.22, 0, 0.84, 1, -1);
  ctx.fill();
  // deck side (thickness)
  ctx.fillStyle = "#4A2E14";
  if (along === "u") quad(ctx, wx, wy, 0, 0.2, 1, 0.8, lift - 3); else quad(ctx, wx, wy, 0.2, 0, 0.8, 1, lift - 3);
  ctx.fill();
  for (let k = 0; k < PLANKS; k++) {
    const a = k / PLANKS, b = (k + 1) / PLANKS;
    ctx.fillStyle = k % 2 === 0 ? "#A8702F" : "#8F5C26";
    if (along === "u") quad(ctx, wx, wy, a, 0.2, b - 0.02, 0.8, lift); else quad(ctx, wx, wy, 0.2, a, 0.8, b - 0.02, lift);
    ctx.fill();
    ctx.fillStyle = "#D9A25A"; // light edge of plank
    if (along === "u") quad(ctx, wx, wy, a, 0.2, b - 0.02, 0.28, lift); else quad(ctx, wx, wy, 0.2, a, 0.28, b - 0.02, lift);
    ctx.fill();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  if (along === "u") quad(ctx, wx, wy, 0, 0.2, 1, 0.8, lift); else quad(ctx, wx, wy, 0.2, 0, 0.8, 1, lift);
  ctx.stroke();
}

function rail(ctx: CanvasRenderingContext2D, wx: number, wy: number, along: "u" | "v", side: number) {
  const lift = 3, hgt = 7;
  const pts = [0.06, 0.5, 0.94];
  const pos = (t: number, o: "x" | "y") => {
    const u = along === "u" ? t : side, v = along === "u" ? side : t;
    return o === "x" ? px(wx, wy, u, v) : py(wx, wy, u, v) - lift;
  };
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pos(0, "x"), pos(0, "y") - hgt);
  ctx.lineTo(pos(1, "x"), pos(1, "y") - hgt);
  ctx.stroke();
  ctx.strokeStyle = "#C98F4A"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pos(0, "x"), pos(0, "y") - hgt);
  ctx.lineTo(pos(1, "x"), pos(1, "y") - hgt);
  ctx.stroke();
  for (let i = 0; i < pts.length; i++) {
    const x = Math.round(pos(pts[i], "x")), y = Math.round(pos(pts[i], "y"));
    ctx.fillStyle = INK; ctx.fillRect(x - 2, y - hgt - 1, 4, hgt + 2);
    ctx.fillStyle = "#7A4A22"; ctx.fillRect(x - 1, y - hgt, 2, hgt);
    ctx.fillStyle = "#E9B96E"; ctx.fillRect(x - 1, y - hgt, 1, 2);
  }
}

/** Draws the bridge for a "bridge" cell (call instead of the grass tile). */
function drawBridge(ctx: CanvasRenderingContext2D, wx: number, wy: number, dir: BridgeDir) {
  waterBase(ctx, wx, wy);
  if (dir === "h" || dir === "x") deck(ctx, wx, wy, "u");
  if (dir === "v" || dir === "x") deck(ctx, wx, wy, "v");
  if (dir === "h") { rail(ctx, wx, wy, "u", 0.2); rail(ctx, wx, wy, "u", 0.8); }
  if (dir === "v") { rail(ctx, wx, wy, "v", 0.2); rail(ctx, wx, wy, "v", 0.8); }
}

function isWater(grid: any[][], x: number, y: number) {
  const c = grid[y]?.[x];
  return !!c && c.terrain === "water";
}

// Shore edge band: neighbour -> edge endpoints in local (u,v) space
function shoreBand(ctx: CanvasRenderingContext2D, wx: number, wy: number, edge: number, k: number) {
  // edge 0: +x neighbour (u=1), 1: +y neighbour (v=1), 2: -x neighbour (u=0), 3: -y neighbour (v=0)
  if (edge === 0) quad(ctx, wx, wy, 1 - k, 0, 1, 1, 0);
  else if (edge === 1) quad(ctx, wx, wy, 0, 1 - k, 1, 1, 0);
  else if (edge === 2) quad(ctx, wx, wy, 0, 0, k, 1, 0);
  else quad(ctx, wx, wy, 0, 0, 1, k, 0);
  ctx.fill();
}

function drawShore(ctx: CanvasRenderingContext2D, wx: number, wy: number, x: number, y: number, grid: any[][]) {
  for (let e = 0; e < 4; e++) {
    const nx = x + (e === 0 ? 1 : e === 2 ? -1 : 0);
    const ny = y + (e === 1 ? 1 : e === 3 ? -1 : 0);
    if (!isWater(grid, nx, ny)) continue;
    ctx.fillStyle = "#B79B62"; shoreBand(ctx, wx, wy, e, 0.34);
    ctx.fillStyle = "#D8BF86"; shoreBand(ctx, wx, wy, e, 0.26);
    ctx.fillStyle = "#EBDDB0"; shoreBand(ctx, wx, wy, e, 0.12);
  }
}

/** Impassable highland ridge tile: a raised grey boulder block with a lit top face. */
function drawRock(ctx: CanvasRenderingContext2D, wx: number, wy: number, x: number, y: number) {
  const hgt = 8 + ((x * 7 + y * 13) % 5);
  ctx.fillStyle = "#3B3835"; quad(ctx, wx, wy, 0, 0, 1, 1, 0); ctx.fill();
  ctx.fillStyle = "#57534E"; quad(ctx, wx, wy, 0, 0, 1, 1, hgt * 0.5); ctx.fill();
  ctx.fillStyle = (x + y) % 2 ? "#78716C" : "#6B6661"; quad(ctx, wx, wy, 0.1, 0.1, 0.9, 0.9, hgt); ctx.fill();
  ctx.fillStyle = "#A8A29E"; quad(ctx, wx, wy, 0.25, 0.2, 0.55, 0.5, hgt + 1); ctx.fill();
}

/**
 * Per-tile overlay. Returns true when it drew the whole tile (bridge) so the caller can skip grass.
 * Call after the base tile and before resources.
 */
export function drawTileOverlay(ctx: CanvasRenderingContext2D, wx: number, wy: number, x: number, y: number, grid: any[][], cell: any): boolean {
  if (cell.terrain === "bridge") { drawBridge(ctx, wx, wy, cell.bridge || "h"); return true; }
  if (cell.terrain === "rock") { drawRock(ctx, wx, wy, x, y); return true; }
  if (cell.terrain !== "water") drawShore(ctx, wx, wy, x, y, grid);
  return false;
}

/** Golden-hour drop shadow: sun low in the upper-left, so shadows stretch to the lower-right. */
export function drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.fillStyle = "rgba(60, 30, 8, 0.24)";
  ctx.beginPath(); ctx.ellipse(cx + rx * 0.5 + 3, cy + ry * 0.55 + 2, rx * 1.3, ry * 0.95, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(26, 14, 4, 0.26)";
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + 1, rx * 0.85, ry * 0.75, 0.2, 0, Math.PI * 2); ctx.fill();
}

export const MINIMAP_BRIDGE = "#8B5A2B";
