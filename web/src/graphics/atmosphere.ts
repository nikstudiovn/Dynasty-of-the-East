// Pixel Dynasty — atmosphere: ink-wash fog edges, warm building glow, ambient wind.

const TILE_W = 52;
const TILE_H = 26;

export const FOG_EXPLORED_TINT = "rgba(16, 13, 10, 0.48)";
export const GLOW_COLOR = "rgba(246, 196, 83, 0.16)";
const INK_EDGE = "rgba(16, 13, 10, 0.17)";
const GLOW_TYPES: Record<string, number> = { town_center: 1, watch_tower: 1, imperial_citadel: 1, blacksmith: 1 };

let glow: HTMLCanvasElement | null = null;

function bakeGlow(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d")!;
  g.save();
  g.translate(64, 32);
  g.scale(1, 0.5);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  grad.addColorStop(0, GLOW_COLOR);
  grad.addColorStop(0.55, "rgba(246, 196, 83, 0.08)");
  grad.addColorStop(1, "rgba(246, 196, 83, 0)");
  g.fillStyle = grad;
  g.fillRect(-64, -64, 128, 128);
  g.restore();
  return c;
}

// ---- ambient wind (20 particles, screen space) ----
const WIND_N = 20;
const wx = new Float32Array(WIND_N), wy = new Float32Array(WIND_N);
const wvx = new Float32Array(WIND_N), wvy = new Float32Array(WIND_N), wph = new Float32Array(WIND_N);
let windInit = false;
let windT = 0;

function initWind(w: number, h: number) {
  for (let i = 0; i < WIND_N; i++) {
    wx[i] = Math.random() * w; wy[i] = Math.random() * h;
    wvx[i] = 26 + Math.random() * 30; wvy[i] = 4 + Math.random() * 8; wph[i] = Math.random() * 6.28;
  }
  windInit = true;
}

export function init(): void {
  if (!glow) glow = bakeGlow();
}

export function update(dt: number, w: number, h: number): void {
  if (!windInit) initWind(w, h);
  windT += dt;
  for (let i = 0; i < WIND_N; i++) {
    wx[i] += wvx[i] * dt;
    wy[i] += (wvy[i] + Math.sin(windT * 1.6 + wph[i]) * 10) * dt;
    if (wx[i] > w + 8) { wx[i] = -8; wy[i] = Math.random() * h; }
    if (wy[i] > h + 8) wy[i] = -8;
  }
}

export function drawWind(ctx: CanvasRenderingContext2D): void {
  if (!windInit) return;
  ctx.fillStyle = "rgba(255, 244, 214, 0.34)";
  for (let i = 0; i < WIND_N; i++) {
    const x = Math.round(wx[i]), y = Math.round(wy[i]);
    ctx.fillRect(x, y, 3, 1);
    ctx.fillRect(x - 3, y + 1, 2, 1);
  }
}

// ---- ink-wash fog edges (call in world space, after the tile loop) ----
const LAYERS = [0.8, 0.52, 0.26];

function inkBand(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, k: number, j: number) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + (cx - bx) * k + j, by + (cy - by) * k);
  ctx.lineTo(ax + (cx - ax) * k - j, ay + (cy - ay) * k);
  ctx.closePath();
  ctx.fill();
}

export function drawFogEdges(ctx: CanvasRenderingContext2D, state: any, mapN: number): void {
  const fog = state.fog;
  ctx.fillStyle = INK_EDGE;
  for (let y = 0; y < mapN; y++) {
    for (let x = 0; x < mapN; x++) {
      if (fog[y][x] === 0) continue;
      const tx = (x - y) * (TILE_W / 2), ty = (x + y) * (TILE_H / 2);
      const T = ty, B = ty + TILE_H, M = ty + TILE_H / 2;
      const jit = ((x * 7 + y * 13) % 3 - 1) * 1.2;
      for (let e = 0; e < 4; e++) {
        const nx = x + (e === 0 ? 1 : e === 2 ? -1 : 0);
        const ny = y + (e === 1 ? 1 : e === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= mapN || ny >= mapN || fog[ny][nx] !== 0) continue;
        for (let l = 0; l < LAYERS.length; l++) {
          const k = LAYERS[l];
          if (e === 0) inkBand(ctx, tx + TILE_W / 2, M, tx, B, tx, M, k, jit);
          else if (e === 1) inkBand(ctx, tx, B, tx - TILE_W / 2, M, tx, M, k, jit);
          else if (e === 2) inkBand(ctx, tx - TILE_W / 2, M, tx, T, tx, M, k, jit);
          else inkBand(ctx, tx, T, tx + TILE_W / 2, M, tx, M, k, jit);
        }
      }
    }
  }
}

// ---- warm glow around important buildings (ground layer, before sprites) ----
export function drawGlows(ctx: CanvasRenderingContext2D, state: any, nowMs: number): void {
  if (!glow) return;
  const flick = 0.88 + 0.12 * Math.sin(nowMs * 0.004);
  const blds = state.buildings;
  for (let i = 0; i < blds.length; i++) {
    const b = blds[i];
    if (!GLOW_TYPES[b.type] || b.hp <= 0) continue;
    if (b.progress !== undefined && b.progress < 1) continue;
    const f = state.fog[Math.min(state.fog.length - 1, b.ty)]?.[Math.min(state.fog.length - 1, b.tx)] ?? 0;
    if (f === 0 || (b.team !== "player" && f !== 2)) continue;
    const mx = b.tx + (b.size - 1) / 2, my = b.ty + (b.size - 1) / 2;
    const cx = (mx - my) * (TILE_W / 2), cy = (mx + my) * (TILE_H / 2) + TILE_H / 2;
    const gw = (b.size === 2 ? 190 : 130) * (b.type === "imperial_citadel" ? 1.2 : 1);
    const gh = gw / 2;
    ctx.globalAlpha = (f === 1 ? 0.5 : 1) * flick;
    ctx.drawImage(glow, cx - gw / 2, cy - gh / 2 - 8, gw, gh);
  }
  ctx.globalAlpha = 1;
}
