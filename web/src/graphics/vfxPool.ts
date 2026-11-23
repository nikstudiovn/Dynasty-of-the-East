// Pixel Dynasty — pooled VFX (smoke, flames, slash arcs, dust, craters, shockwaves).
// All particles live in one preallocated pool (MAX_PARTICLES). Nothing is allocated per frame.

export const MAX_PARTICLES = 160;
const TILE_W = 52;
const TILE_H = 26;
const MAX_CRATERS = 10;
const CRATER_LIFE = 12; // seconds
const SLASH_LIFE = 0.18; // seconds
const RING_LIFE = 0.45;

const enum K { None = 0, Smoke = 1, Flame = 2, Slash = 3, Dust = 4, Ring = 5 }

interface Particle {
  active: boolean;
  kind: number;
  x: number; y: number;   // world (isometric pixel) coordinates
  vx: number; vy: number;
  life: number; max: number;
  size: number;
  ang: number;
}

interface Crater { active: boolean; x: number; y: number; age: number; rot: number; }

const pool: Particle[] = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
  pool.push({ active: false, kind: K.None, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, ang: 0 });
}
const craters: Crater[] = [];
for (let i = 0; i < MAX_CRATERS; i++) craters.push({ active: false, x: 0, y: 0, age: 0, rot: 0 });
let craterCursor = 0;
let tick = 0;
let pendingShake = 0;

const MELEE = { swordsman: 1, spearman: 1, cavalry: 1 } as Record<string, number>;
const DUSTY = { cavalry: 1, war_elephant: 1 } as Record<string, number>;

function isoX(tx: number, ty: number) { return (tx - ty) * (TILE_W / 2); }
function isoY(tx: number, ty: number) { return (tx + ty) * (TILE_H / 2); }

export function activeCount(): number {
  let n = 0;
  for (let i = 0; i < MAX_PARTICLES; i++) if (pool[i].active) n++;
  return n;
}

function alloc(steal: boolean): Particle | null {
  for (let i = 0; i < MAX_PARTICLES; i++) if (!pool[i].active) return pool[i];
  if (!steal) return null;
  let best = pool[0], ratio = 9;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = pool[i];
    const r = p.life / p.max;
    if (r < ratio) { ratio = r; best = p; }
  }
  return best;
}

function spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, ang: number, steal: boolean) {
  const p = alloc(steal);
  if (!p) return null;
  p.active = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.max = life; p.size = size; p.ang = ang;
  return p;
}

function visible(state: any, tx: number, ty: number): boolean {
  const row = state.fog[Math.max(0, Math.min(state.fog.length - 1, Math.floor(ty)))];
  if (!row) return false;
  return row[Math.max(0, Math.min(row.length - 1, Math.floor(tx)))] === 2;
}

export function reset(): void {
  for (let i = 0; i < MAX_PARTICLES; i++) pool[i].active = false;
  for (let i = 0; i < MAX_CRATERS; i++) craters[i].active = false;
  pendingShake = 0;
  tick = 0;
}

/** Melee hit: a 0.18s slash arc over the target (swordsman / spearman / cavalry only). */
export function onHit(attacker: any, target: any, isBldg: boolean): void {
  if (!attacker || !MELEE[attacker.type] || !target) return;
  const tx = isBldg ? target.tx + target.size / 2 : target.x;
  const ty = isBldg ? target.ty + target.size / 2 : target.y;
  const ax = isoX(attacker.x, attacker.y), ay = isoY(attacker.x, attacker.y);
  const wx = isoX(tx, ty), wy = isoY(tx, ty) + TILE_H / 2;
  const ang = Math.atan2(wy - ay, wx - ax);
  spawn(K.Slash, wx, wy - 12, 0, 0, SLASH_LIFE, attacker.type === "cavalry" ? 17 : 13, ang, true);
}

/** Catapult boulder landing at tile coords: crater (fades over 12s) + shockwave ring + camera shake. */
export function impact(tx: number, ty: number): void {
  const c = craters[craterCursor];
  craterCursor = (craterCursor + 1) % MAX_CRATERS;
  c.active = true; c.x = isoX(tx, ty); c.y = isoY(tx, ty) + TILE_H / 2; c.age = 0; c.rot = (tx * 7.3 + ty * 3.1) % 1;
  spawn(K.Ring, c.x, c.y, 0, 0, RING_LIFE, 34, 0, true);
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    spawn(K.Dust, c.x, c.y - 2, Math.cos(a) * 26, Math.sin(a) * 12 - 8, 0.55, 4, 0, false);
  }
  pendingShake = 1;
}

export function update(dt: number, state: any, cam: any): void {
  // camera shake decay
  if (pendingShake > 0) { cam.shake = Math.max(cam.shake || 0, pendingShake); pendingShake = 0; }
  if (cam.shake) { cam.shake = Math.max(0, cam.shake - dt * 2.4); if (cam.shake < 0.01) cam.shake = 0; }

  for (let i = 0; i < MAX_CRATERS; i++) {
    const c = craters[i];
    if (!c.active) continue;
    c.age += dt;
    if (c.age >= CRATER_LIFE) c.active = false;
  }

  tick += dt;
  if (tick >= 0.07) {
    tick = 0;
    emitEnvironment(state);
  }

  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = pool[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === K.Smoke) { p.vx += 5 * dt; p.size += dt * 5; }
    else if (p.kind === K.Flame) { p.vx += (Math.random() - 0.5) * 20 * dt; }
    else if (p.kind === K.Dust) { p.vy *= 1 - 1.5 * dt; p.vx *= 1 - 1.5 * dt; }
  }
}

function emitEnvironment(state: any) {
  const blds = state.buildings;
  for (let i = 0; i < blds.length; i++) {
    const b = blds[i];
    if (b.hp <= 0 || !visible(state, b.tx, b.ty)) continue;
    const r = b.hp / b.maxHp;
    if (r >= 0.5) continue;
    const cx = isoX(b.tx + (b.size - 1) / 2, b.ty + (b.size - 1) / 2);
    const cy = isoY(b.tx + (b.size - 1) / 2, b.ty + (b.size - 1) / 2) + TILE_H / 2 - b.size * 14;
    const jx = (Math.random() - 0.5) * b.size * 22;
    if (Math.random() < 0.55) spawn(K.Smoke, cx + jx, cy, 3 + Math.random() * 4, -14 - Math.random() * 8, 1.4 + Math.random() * 0.6, 4, 0, false);
    if (r < 0.25) {
      spawn(K.Flame, cx + jx, cy + 6, 0, -22 - Math.random() * 10, 0.5 + Math.random() * 0.25, 4, 0, false);
      if (Math.random() < 0.5) spawn(K.Flame, cx - jx * 0.6, cy + 10, 0, -18, 0.45, 3, 0, false);
    }
  }
  const units = state.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!DUSTY[u.type] || u.hp <= 0 || u.garrisoned) continue;
    if (!u.path || u.path.length === 0 || u.task === "idle") continue;
    if (!visible(state, u.x, u.y)) continue;
    if (Math.random() < 0.6) {
      spawn(K.Dust, isoX(u.x, u.y) + (Math.random() - 0.5) * 6, isoY(u.x, u.y) + TILE_H / 2 + 1, (Math.random() - 0.5) * 10 - 6, -5 - Math.random() * 4, 0.5 + Math.random() * 0.2, u.type === "war_elephant" ? 5 : 3, 0, false);
    }
  }
}

/** Ground layer: crater decals (drawn under units). */
export function drawGround(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < MAX_CRATERS; i++) {
    const c = craters[i];
    if (!c.active) continue;
    const a = 1 - c.age / CRATER_LIFE;
    ctx.globalAlpha = 0.62 * a;
    ctx.fillStyle = "#2A1A0E";
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 15, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.8 * a;
    ctx.fillStyle = "#120A05";
    ctx.beginPath(); ctx.ellipse(c.x + 1, c.y + 1, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5 * a;
    ctx.strokeStyle = "#8A6A44"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 1, 16, 8, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Air layer: smoke, flames, slashes, dust, shockwave rings. */
export function drawAir(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = pool[i];
    if (!p.active) continue;
    const t = p.life / p.max; // 1 -> 0
    switch (p.kind) {
      case K.Smoke: {
        ctx.globalAlpha = 0.5 * t;
        ctx.fillStyle = t > 0.5 ? "#6B6560" : "#3F3A36";
        const s = Math.round(p.size);
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        break;
      }
      case K.Flame: {
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.fillStyle = t > 0.66 ? "#FEF08A" : t > 0.33 ? "#F97316" : "#B91C1C";
        const s = Math.max(2, Math.round(p.size * (0.5 + t)));
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s), s, s + 1);
        break;
      }
      case K.Dust: {
        ctx.globalAlpha = 0.55 * t;
        ctx.fillStyle = "#C9B28A";
        const s = Math.max(2, Math.round(p.size * (1.4 - t * 0.5)));
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        break;
      }
      case K.Slash: {
        const prog = 1 - t;
        ctx.globalAlpha = Math.min(1, t * 2.2);
        ctx.strokeStyle = "#FFF8DC";
        ctx.lineWidth = 3 - prog * 2;
        ctx.beginPath();
        const start = p.ang - 1.1;
        ctx.arc(p.x, p.y, p.size, start, start + 2.2 * Math.min(1, prog * 1.6 + 0.2));
        ctx.stroke();
        ctx.strokeStyle = "#F6C453";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size - 3, start + 0.2, start + 2.0 * Math.min(1, prog * 1.6 + 0.2));
        ctx.stroke();
        break;
      }
      case K.Ring: {
        const prog = 1 - t;
        ctx.globalAlpha = 0.75 * t;
        ctx.strokeStyle = "#E9D8B0";
        ctx.lineWidth = 3 * t + 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * prog + 4, (p.size * prog + 4) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}
