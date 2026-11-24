// Pixel Dynasty — villager work animations & tool VFX.
// Every villager carries `workStyle` ("chop" | "mine" | "harvest" | "build" | "carry" | "idle")
// and `workPhase` (radians). A strike fires each time the phase wraps past 2π.
// Particles live in a fixed typed-array pool (no per-frame allocation).

const TILE_W = 52;
const TILE_H = 26;
const TAU = Math.PI * 2;
const INK = "#1A120E";

export type WorkStyle = "chop" | "mine" | "harvest" | "build" | "carry" | "idle";

export interface Hooks {
  findPath?: (sx: number, sy: number, gx: number, gy: number) => any[];
  clink?: () => void;
  thock?: () => void;
}
let hooks: Hooks = {};
export function init(h: Hooks): void { hooks = h || {}; }

// ---- particle pool -------------------------------------------------------
const MAXP = 96;
const enum P { None = 0, Splinter = 1, Leaf = 2, SparkGold = 3, SparkGrey = 4, Chaff = 5, Chip = 6, Dust = 7 }
const pk = new Uint8Array(MAXP);
const px = new Float32Array(MAXP), py = new Float32Array(MAXP);
const pvx = new Float32Array(MAXP), pvy = new Float32Array(MAXP);
const plife = new Float32Array(MAXP), pmax = new Float32Array(MAXP);
const COLORS: string[] = ["", "#4ADE80", "#16A34A", "#FEF08A", "#E2E8F0", "#FACC15", "#B45309", "#D6C7A1"];
const GRAV: number[] = [0, 90, 50, 70, 70, 40, 110, -6];

function emit(kind: number, x: number, y: number, vx: number, vy: number, life: number) {
  let slot = -1, oldest = 2;
  for (let i = 0; i < MAXP; i++) {
    if (pk[i] === 0) { slot = i; break; }
    const r = plife[i] / pmax[i];
    if (r < oldest) { oldest = r; slot = i; }
  }
  pk[slot] = kind; px[slot] = x; py[slot] = y; pvx[slot] = vx; pvy[slot] = vy; plife[slot] = life; pmax[slot] = life;
}

export function activeParticles(): number { let n = 0; for (let i = 0; i < MAXP; i++) if (pk[i]) n++; return n; }

export function reset(): void {
  pk.fill(0); shake.fill(0); sites.length = 0;
}

// ---- bamboo shake --------------------------------------------------------
const shake = new Float32Array(64 * 64);
const MAPW = 64;
export function shakeX(tx: number, ty: number): number {
  const s = shake[ty * MAPW + tx];
  if (s <= 0.02) return 0;
  return Math.round(Math.sin(performance.now() * 0.06) * 2.2 * s);
}

// ---- build sites ---------------------------------------------------------
interface Site { cx: number; cy: number; size: number; ttl: number; work: number; helper: any; b: any; }
const sites: Site[] = [];
// Kept outside the unit objects so state.units stays JSON-serialisable (Save/Load).
const siteOf = new WeakMap<object, Site | null>();
export function registerBuild(b: any): void {
  const size = b.size || 1;
  sites.push({ cx: b.tx + size / 2, cy: b.ty + size / 2, size, ttl: 7, work: 2.6, helper: null, b });
}

// ---- helpers -------------------------------------------------------------
function isoX(tx: number, ty: number) { return (tx - ty) * (TILE_W / 2); }
function isoY(tx: number, ty: number) { return (tx + ty) * (TILE_H / 2); }
function seen(state: any, tx: number, ty: number): boolean {
  const r = state.fog[Math.max(0, Math.min(state.fog.length - 1, Math.floor(ty)))];
  return !!r && r[Math.max(0, Math.min(r.length - 1, Math.floor(tx)))] === 2;
}
let lastClink = 0;
function clink() {
  const now = performance.now();
  if (now - lastClink < 90) return;
  lastClink = now;
  if (hooks.clink) hooks.clink();
}
let lastThock = 0;
function thock() {
  const now = performance.now();
  if (now - lastThock < 140) return;
  lastThock = now;
  if (hooks.thock) hooks.thock();
}

const RATE: Record<string, number> = { chop: TAU / 0.78, mine: TAU / 0.78, harvest: TAU / 0.78, build: TAU / 0.6, carry: 7.5, idle: 0 };

function farmAt(state: any, tx: number, ty: number): any {
  for (const b of state.buildings) if (b.type === "farm" && b.tx === tx && b.ty === ty) return b;
  return null;
}

function classify(u: any, state: any): WorkStyle {
  if (u.task === "return" && u.carryAmt > 0) return "carry";
  if (u.task === "hunt" && u.huntBusy) return "harvest";
  if (u.task === "build" && siteOf.get(u)) {
    const s = siteOf.get(u) as Site;
    if (u.path.length === 0 && Math.hypot(s.cx - u.x, s.cy - u.y) <= s.size / 2 + 2.4) return "build";
    return "idle";
  }
  if (u.task === "gather" && u.targetTile && u.path.length === 0) {
    const { tx, ty } = u.targetTile;
    if (Math.hypot(tx + 0.5 - u.x, ty + 0.5 - u.y) <= 1.7) {
      const farm = farmAt(state, tx, ty);
      const res = farm ? "food" : state.grid[ty]?.[tx]?.res;
      if (res === "wood") return "chop";
      if (res === "gold" || res === "stone") return "mine";
      if (res === "food") return "harvest";
    }
  }
  return "idle";
}

function strike(u: any, state: any, style: WorkStyle) {
  if (style === "build") {
    const s = siteOf.get(u) as Site;
    if (!s || !seen(state, s.cx, s.cy)) return;
    const bx = isoX(s.cx, s.cy), by = isoY(s.cx, s.cy) - 6;
    for (let k = 0; k < 4; k++) emit(P.Chip, bx + (Math.random() - 0.5) * 18, by, (Math.random() - 0.5) * 60, -55 - Math.random() * 40, 0.5);
    for (let k = 0; k < 2; k++) emit(P.Dust, bx + (Math.random() - 0.5) * 22, by + 8, (Math.random() - 0.5) * 20, -12, 0.7);
    thock();
    return;
  }
  const t = u.targetTile;
  if (!t || !seen(state, t.tx, t.ty)) return;
  const bx = isoX(t.tx + 0.5, t.ty + 0.5), by = isoY(t.tx + 0.5, t.ty + 0.5) - 8;
  if (style === "chop") {
    shake[t.ty * MAPW + t.tx] = 1;
    for (let k = 0; k < 5; k++) emit(P.Splinter, bx + (Math.random() - 0.5) * 8, by, (Math.random() - 0.5) * 80, -50 - Math.random() * 50, 0.55);
    for (let k = 0; k < 3; k++) emit(P.Leaf, bx + (Math.random() - 0.5) * 12, by - 10, (Math.random() - 0.5) * 40, -10 - Math.random() * 20, 0.8);
    thock();
  } else if (style === "mine") {
    const gold = state.grid[t.ty]?.[t.tx]?.res === "gold";
    for (let k = 0; k < 7; k++) {
      const a = Math.random() * TAU, sp = 40 + Math.random() * 60;
      emit(gold ? P.SparkGold : P.SparkGrey, bx, by, Math.cos(a) * sp, Math.sin(a) * sp - 30, 0.32);
    }
    clink();
  } else if (style === "harvest") {
    for (let k = 0; k < 5; k++) emit(P.Chaff, bx + (Math.random() - 0.5) * 14, by + 2, (Math.random() - 0.5) * 50, -30 - Math.random() * 30, 0.7);
  }
}

// ---- per-frame update ----------------------------------------------------
export function update(dt: number, state: any): void {
  if (!state || !state.units) return;
  // decay shakes
  for (let i = 0; i < shake.length; i++) if (shake[i] > 0) shake[i] = Math.max(0, shake[i] - dt * 4.5);

  // build sites: recruit the nearest idle player villager
  for (let i = sites.length - 1; i >= 0; i--) {
    const s = sites[i];
    s.ttl -= dt;
    if (s.helper && (s.helper.hp <= 0 || s.helper.task !== "build")) { siteOf.set(s.helper, null); s.helper = null; }
    if (!s.helper && s.ttl > 0) {
      let best: any = null, bd = 12;
      for (const u of state.units) {
        if (u.type !== "villager" || u.team !== "player" || u.hp <= 0 || u.garrisoned) continue;
        if (u.task !== "idle" || u.path.length > 0 || siteOf.get(u)) continue;
        const d = Math.hypot(u.x - s.cx, u.y - s.cy);
        if (d < bd) { bd = d; best = u; }
      }
      if (best && hooks.findPath) {
        best.task = "build"; siteOf.set(best, s); s.helper = best;
        best.path = hooks.findPath(best.x, best.y, s.cx, s.cy);
      }
    }
    if (s.helper && s.helper.workStyle === "build") s.work -= dt;
    if (s.work <= 0 || s.ttl <= -1 || (s.ttl <= 0 && !s.helper)) {
      if (s.helper) { s.helper.task = "idle"; siteOf.set(s.helper, null); }
      sites.splice(i, 1);
    }
  }

  for (const u of state.units) {
    if (u.type !== "villager") continue;
    if (u.hp <= 0 || u.garrisoned) { u.workStyle = "idle"; continue; }
    const style = classify(u, state);
    if (style !== u.workStyle) { u.workStyle = style; u.workPhase = 0; }
    if (u.workPhase === undefined) u.workPhase = 0;
    if (style === "idle") { u.workPhase = 0; continue; }
    u.workPhase += dt * RATE[style];
    if (style === "harvest" && u.targetTile) {
      const farm = farmAt(state, u.targetTile.tx, u.targetTile.ty);
      if (farm) { farm.cropStage = Math.min(2, Math.floor(Math.min(0.999, (u.gatherTick || 0) / 0.78) * 3)); }
    }
    if (u.workPhase >= TAU) {
      u.workPhase -= TAU;
      if (style !== "carry") strike(u, state, style);
    }
  }

  // particles
  for (let i = 0; i < MAXP; i++) {
    if (!pk[i]) continue;
    plife[i] -= dt;
    if (plife[i] <= 0) { pk[i] = 0; continue; }
    pvy[i] += GRAV[pk[i]] * dt;
    px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
    if (pk[i] === P.Dust) pvx[i] *= 0.96;
  }
}

// ---- drawing -------------------------------------------------------------
export function drawParticles(ctx: CanvasRenderingContext2D): void {
  let cur = -1;
  for (let i = 0; i < MAXP; i++) {
    const k = pk[i];
    if (!k) continue;
    if (k !== cur) { ctx.fillStyle = COLORS[k]; cur = k; }
    const r = plife[i] / pmax[i];
    const x = Math.round(px[i]), y = Math.round(py[i]);
    if (k === P.Dust) { ctx.globalAlpha = 0.5 * r; ctx.fillRect(x - 2, y - 1, 4 + Math.round((1 - r) * 3), 3); ctx.globalAlpha = 1; }
    else if (k === P.Chaff || k === P.Leaf) { ctx.globalAlpha = Math.min(1, r * 1.6); ctx.fillRect(x, y, 2, 1); ctx.globalAlpha = 1; }
    else if (k === P.SparkGold || k === P.SparkGrey) { ctx.fillRect(x, y, r > 0.5 ? 2 : 1, r > 0.5 ? 2 : 1); }
    else { ctx.fillRect(x, y, 2, 2); }
  }
}

function ease(t: number) { return t * t * (3 - 2 * t); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Tool angle (0 = pointing up, + = swinging forward/down). */
function swingAngle(style: WorkStyle, phase: number): number {
  const p = phase / TAU;
  if (style === "harvest") return lerp(-1.3, 1.5, ease(p));
  if (p < 0.6) return lerp(0.9, -0.7, ease(p / 0.6));
  if (p < 0.82) return -0.7 + Math.sin(p * 90) * 0.04;
  return lerp(-0.7, 2.3, Math.pow((p - 0.82) / 0.18, 1.6));
}

function drawTool(ctx: CanvasRenderingContext2D, style: WorkStyle, phase: number, f: number, hx: number, hy: number) {
  const ang = swingAngle(style, phase);
  ctx.save();
  ctx.translate(Math.round(hx), Math.round(hy));
  ctx.scale(f, 1);
  ctx.rotate(ang);
  if (style === "chop") {
    ctx.fillStyle = INK; ctx.fillRect(-2, -15, 4, 17);
    ctx.fillStyle = "#92400E"; ctx.fillRect(-1, -14, 2, 15);
    ctx.fillStyle = INK; ctx.fillRect(-1, -18, 8, 7);
    ctx.fillStyle = "#CBD5E1"; ctx.fillRect(0, -17, 6, 5);
    ctx.fillStyle = "#F1F5F9"; ctx.fillRect(4, -17, 2, 5);
  } else if (style === "mine") {
    ctx.fillStyle = INK; ctx.fillRect(-2, -15, 4, 17);
    ctx.fillStyle = "#92400E"; ctx.fillRect(-1, -14, 2, 15);
    ctx.fillStyle = INK; ctx.fillRect(-7, -18, 14, 5);
    ctx.fillStyle = "#94A3B8"; ctx.fillRect(-6, -17, 12, 3);
    ctx.fillStyle = "#E2E8F0"; ctx.fillRect(-6, -17, 5, 1);
  } else if (style === "build") {
    ctx.fillStyle = INK; ctx.fillRect(-2, -11, 4, 13);
    ctx.fillStyle = "#92400E"; ctx.fillRect(-1, -10, 2, 11);
    ctx.fillStyle = INK; ctx.fillRect(-4, -15, 9, 6);
    ctx.fillStyle = "#78716C"; ctx.fillRect(-3, -14, 7, 4);
    ctx.fillStyle = "#A8A29E"; ctx.fillRect(-3, -14, 7, 1);
  } else if (style === "harvest") {
    ctx.fillStyle = INK; ctx.fillRect(-2, -9, 4, 11);
    ctx.fillStyle = "#92400E"; ctx.fillRect(-1, -8, 2, 9);
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(5, -10, 6, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = "#E2E8F0"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(5, -10, 6, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  }
  ctx.restore();
  // swoosh on the down-stroke
  const p = phase / TAU;
  if (style !== "harvest" && p > 0.88) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#F8FAFC"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hx, hy, 15, f > 0 ? -1.6 : Math.PI - 0.7, f > 0 ? -0.4 : Math.PI + 1.6, f < 0); ctx.stroke();
    ctx.restore();
  }
}

function drawCargo(ctx: CanvasRenderingContext2D, type: string, phase: number, f: number, wx: number, wy: number) {
  const bob = Math.round(Math.abs(Math.sin(phase * 1.0)) * 1.5);
  const bx = Math.round(wx - 6 * f), by = Math.round(wy - 17 - bob);
  if (type === "wood") {
    for (let k = 0; k < 3; k++) {
      const ox = bx - 4 + k * 3;
      ctx.fillStyle = INK; ctx.fillRect(ox - 1, by - 13 + k, 4, 15);
      ctx.fillStyle = "#15803D"; ctx.fillRect(ox, by - 12 + k, 2, 13);
      ctx.fillStyle = "#4ADE80"; ctx.fillRect(ox, by - 12 + k, 1, 13);
    }
    ctx.fillStyle = "#92400E"; ctx.fillRect(bx - 5, by - 4, 10, 2);
  } else if (type === "food") {
    ctx.fillStyle = INK; ctx.fillRect(bx - 5, by - 12, 11, 14);
    for (let k = -4; k <= 4; k += 2) {
      ctx.fillStyle = "#CA8A04"; ctx.fillRect(bx + k, by - 11 - (4 - Math.abs(k)) / 2, 2, 12);
      ctx.fillStyle = "#FACC15"; ctx.fillRect(bx + k, by - 11 - (4 - Math.abs(k)) / 2, 1, 6);
    }
    ctx.fillStyle = "#B91C1C"; ctx.fillRect(bx - 4, by - 3, 9, 2);
  } else if (type === "gold") {
    ctx.fillStyle = INK; ctx.fillRect(bx - 6, by - 6, 12, 10);
    ctx.fillStyle = "#92400E"; ctx.fillRect(bx - 5, by - 5, 10, 8);
    ctx.fillStyle = "#B45309"; ctx.fillRect(bx - 5, by - 2, 10, 1); ctx.fillRect(bx - 3, by - 5, 1, 8); ctx.fillRect(bx + 2, by - 5, 1, 8);
    ctx.fillStyle = "#F59E0B"; ctx.fillRect(bx - 4, by - 8, 3, 3); ctx.fillRect(bx + 1, by - 8, 3, 3);
    ctx.fillStyle = "#FEF08A"; ctx.fillRect(bx - 4, by - 8, 2, 2); ctx.fillRect(bx + 1, by - 8, 2, 2); ctx.fillRect(bx - 1, by - 9, 2, 2);
  } else {
    ctx.fillStyle = INK; ctx.fillRect(bx - 5, by - 9, 11, 12);
    ctx.fillStyle = "#64748B"; ctx.fillRect(bx - 4, by - 8, 9, 10);
    ctx.fillStyle = "#94A3B8"; ctx.fillRect(bx - 4, by - 8, 9, 4);
    ctx.fillStyle = "#E2E8F0"; ctx.fillRect(bx - 4, by - 8, 4, 2);
  }
}

/** Called by drawUnit after the villager sprite. (wx, wy) is the unit's iso ground point. */
export function drawOverlay(ctx: CanvasRenderingContext2D, u: any, wx: number, wy: number): void {
  const style: WorkStyle = u.workStyle || "idle";
  if (style === "idle") return;
  const f = u.facing < 0 ? -1 : 1;
  if (style === "carry") { drawCargo(ctx, u.carryType || "wood", u.workPhase || 0, f, wx, wy); return; }
  drawTool(ctx, style, u.workPhase || 0, f, wx + 5 * f, wy - 13);
}

/** Terraced rice paddy (3 growth stages). Replaces the flat farm sprite. */
export function drawFarm(ctx: CanvasRenderingContext2D, b: any, selected: boolean, isPlayer: boolean): void {
  const wx = isoX(b.tx, b.ty), wy = isoY(b.tx, b.ty);
  const stage = b.cropStage === undefined ? 1 : b.cropStage;
  const pt = (u: number, v: number) => ({ x: wx + (u - v) * (TILE_W / 2), y: wy + (u + v) * (TILE_H / 2) });
  // 3 terraces
  for (let k = 0; k < 3; k++) {
    const v0 = 0.1 + k * 0.29, v1 = v0 + 0.25;
    const a = pt(0.1, v0), c = pt(0.9, v0), d = pt(0.9, v1), e = pt(0.1, v1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); const i0 = pt(0.14, v0 + 0.03), i1 = pt(0.86, v0 + 0.03), i2 = pt(0.86, v1 - 0.03), i3 = pt(0.14, v1 - 0.03);
    ctx.moveTo(i0.x, i0.y); ctx.lineTo(i1.x, i1.y); ctx.lineTo(i2.x, i2.y); ctx.lineTo(i3.x, i3.y); ctx.closePath();
    ctx.fillStyle = stage === 0 ? "#5E8F86" : "#6B7F4E"; ctx.fill();
    ctx.fillStyle = "rgba(186,230,253,0.35)";
    const s = pt(0.25, v0 + 0.08); ctx.fillRect(Math.round(s.x), Math.round(s.y), 4, 1);
    // shoots
    const sway = Math.round(Math.sin(performance.now() * 0.003 + k) * 0.8);
    for (let n = 0; n < 5; n++) {
      const p = pt(0.2 + n * 0.15, (v0 + v1) / 2);
      const x = Math.round(p.x), y = Math.round(p.y);
      if (stage === 0) {
        ctx.fillStyle = "#86EFAC"; ctx.fillRect(x, y - 1, 1, 2);
      } else if (stage === 1) {
        ctx.fillStyle = "#22C55E"; ctx.fillRect(x, y - 4, 1, 5); ctx.fillRect(x + 1 + sway, y - 3, 1, 2);
        ctx.fillStyle = "#86EFAC"; ctx.fillRect(x - 1, y - 3, 1, 2);
      } else {
        ctx.fillStyle = "#CA8A04"; ctx.fillRect(x, y - 7, 1, 8); ctx.fillRect(x - 1 + sway, y - 6, 1, 4);
        ctx.fillStyle = "#FACC15"; ctx.fillRect(x + sway, y - 8, 2, 3); ctx.fillRect(x - 2 + sway, y - 5, 1, 2);
        ctx.fillStyle = "#FEF08A"; ctx.fillRect(x + sway, y - 8, 1, 1);
      }
    }
  }
  if (selected) {
    const p0 = pt(0, 0), p1 = pt(1, 0), p2 = pt(1, 1), p3 = pt(0, 1);
    ctx.strokeStyle = "#FACC15"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.stroke();
  }
  if (b.hp < b.maxHp) {
    const c = pt(0.5, 0.5);
    ctx.fillStyle = "#111"; ctx.fillRect(c.x - 14, c.y - 18, 28, 3);
    ctx.fillStyle = isPlayer ? "#22C55E" : "#EF4444"; ctx.fillRect(c.x - 14, c.y - 18, 28 * Math.max(0, b.hp / b.maxHp), 3);
  }
}
