// Dynasty of the East — path smoothing, local steering and formation slots.
// Pure functions: the game passes in its own `isTileBlocked` and unit list.

export type Blocked = (tx: number, ty: number) => boolean;
export interface Pt { x: number; y: number; }

const INFANTRY_R = 0.38;
const CAVALRY_R = 0.55;
const HEAVY_R = 0.68;

export function radiusOf(type: string): number {
  if (type === "cavalry" || type === "horse_archer") return CAVALRY_R;
  if (type === "war_elephant" || type === "catapult") return HEAVY_R;
  return INFANTRY_R;
}

// ---- A* line-of-sight string pulling ------------------------------------
function lineClear(a: Pt, b: Pt, blocked: (tx: number, ty: number) => boolean): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const ux = dx / len, uy = dy / len;
  const nx = -uy * 0.2, ny = ux * 0.2; // lateral probes keep a little clearance from corners
  const steps = Math.ceil(len / 0.3);
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(len, i * 0.3);
    const x = a.x + ux * t, y = a.y + uy * t;
    if (blocked(Math.floor(x), Math.floor(y))) return false;
    if (blocked(Math.floor(x + nx), Math.floor(y + ny))) return false;
    if (blocked(Math.floor(x - nx), Math.floor(y - ny))) return false;
  }
  return true;
}

/**
 * Removes redundant grid corners: waypoint i jumps straight to the furthest waypoint
 * (at least i + 2 when free) that it can see without crossing a blocked tile.
 */
export function smoothPath(sx: number, sy: number, path: Pt[], isBlocked: Blocked): Pt[] {
  if (!path || path.length < 2) return path;
  const cache = new Map<number, boolean>();
  const blocked = (tx: number, ty: number) => {
    const k = (ty + 8) * 256 + (tx + 8);
    let v = cache.get(k);
    if (v === undefined) { v = isBlocked(tx, ty); cache.set(k, v); }
    return v;
  };
  const pts: Pt[] = [{ x: sx, y: sy }, ...path];
  const out: Pt[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 14);
    while (j > i + 1 && !lineClear(pts[i], pts[j], blocked)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// ---- steering ------------------------------------------------------------
function alive(o: any): boolean { return o.hp > 0 && !o.garrisoned; }

/**
 * Moves one unit along u.path[0] with seek + separation + right-hand tangent avoidance.
 * The new position is clamped against isTileBlocked so avoidance never enters water or a building.
 */
export function moveUnit(u: any, dt: number, speed: number, units: any[], blocked: Blocked): void {
  const next = u.path[0];
  const dx = next.x - u.x, dy = next.y - u.y;
  const dist = Math.hypot(dx, dy);
  const last = u.path.length === 1;
  const step = speed * dt;
  if (dist <= step) { u.x = next.x; u.y = next.y; u.path.shift(); u._vx = 0; u._vy = 0; u._stk = 0; return; }
  if (dist <= (last ? 0.12 : 0.3)) { u.path.shift(); return; }

  const sdx = dx / dist, sdy = dy / dist;
  let vx = sdx * speed, vy = sdy * speed;       // seekVec
  let sepX = 0, sepY = 0, tanX = 0, tanY = 0;   // separationVec / tangentAvoidVec
  const rA = radiusOf(u.type);
  const rightX = -sdy, rightY = sdx;            // right-hand perpendicular of the heading

  for (let k = 0; k < units.length; k++) {
    const o = units[k];
    if (o === u || !alive(o)) continue;
    const ox = o.x - u.x, oy = o.y - u.y;
    if (ox > 2.4 || ox < -2.4 || oy > 2.4 || oy < -2.4) continue;
    if (o.id === u.targetEntityId) continue;
    const d = Math.hypot(ox, oy);
    const rB = radiusOf(o.type);
    const sepR = rA + rB + 0.25;
    if (d < 1e-4) { sepX += ((u.id & 1) ? 1 : -1) * speed; sepY += ((u.id & 2) ? 1 : -1) * speed * 0.5; continue; }
    if (d < sepR) {
      const s = Math.min(2 * speed, (sepR / d - 1) * 0.7 * speed + 0.15 * speed);
      sepX -= (ox / d) * s; sepY -= (oy / d) * s;
    }
    const reach = rA + rB + 0.9;
    if (d < reach) {
      const ahead = (ox * sdx + oy * sdy) / d;
      if (ahead > 0.3) {
        let ovx = o._vx || 0, ovy = o._vy || 0;
        if (Math.hypot(ovx, ovy) < 0.1 && o.path && o.path.length > 0) {
          // has an order but has not started moving yet: use its intended heading
          const hx = o.path[0].x - o.x, hy = o.path[0].y - o.y, hm = Math.hypot(hx, hy) || 1;
          ovx = (hx / hm) * speed; ovy = (hy / hm) * speed;
        }
        const om = Math.hypot(ovx, ovy);
        const w = Math.max(0, Math.min(1, 1 - (d - (rA + rB)) / 0.9)) * 1.1 * speed;
        if (om > 0.1) {
          const along = (ovx * sdx + ovy * sdy) / om;
          if (along < -0.3) { tanX += rightX * w; tanY += rightY * w; }          // head-on: both go right
          else if (along < 0.3) {                                                  // crossing: yield to the side we are not on
            const side = rightX * ox + rightY * oy;
            const dir = side > 0 ? -1 : 1;
            tanX += rightX * dir * w * 0.7; tanY += rightY * dir * w * 0.7;
          }                                                                        // same direction: just follow
        } else {                                                                   // stationary / gathering: go around the near side
          const side = rightX * ox + rightY * oy;
          const dir = side > 0.05 ? -1 : 1;
          tanX += rightX * dir * w; tanY += rightY * dir * w;
        }
      }
    }
  }

  let avX = sepX + tanX, avY = sepY + tanY;
  const avM = Math.hypot(avX, avY);
  if (avM > 1.2 * speed) { avX = (avX / avM) * 1.2 * speed; avY = (avY / avM) * 1.2 * speed; }
  vx += avX; vy += avY;
  const fwd = vx * sdx + vy * sdy;
  if (fwd < 0.3 * speed) { vx += (0.3 * speed - fwd) * sdx; vy += (0.3 * speed - fwd) * sdy; } // never stall in a crowd
  const m = Math.hypot(vx, vy);
  if (m > speed) { vx = (vx / m) * speed; vy = (vy / m) * speed; }

  const nx = u.x + vx * dt, ny = u.y + vy * dt;
  const ox0 = u.x, oy0 = u.y;
  if (!blocked(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
  else if (!blocked(Math.floor(nx), Math.floor(u.y))) { u.x = nx; }
  else if (!blocked(Math.floor(u.x), Math.floor(ny))) { u.y = ny; }
  u._vx = (u.x - ox0) / dt; u._vy = (u.y - oy0) / dt;

  // Stuck handling: if crowding pins the unit, skip the waypoint instead of deadlocking.
  if (Math.hypot(u._vx, u._vy) < speed * 0.2) {
    u._stk = (u._stk || 0) + dt;
    if (u._stk > 1.0) {
      if (u.path.length > 1 || dist < 1.4) u.path.shift();
      else if (u._stk > 2.5) u.path.length = 0;
      u._stk = 0;
    }
  } else u._stk = 0;
}

/** Gently resolves hard overlaps between units that are standing still (never moves attackers). */
export function relaxIdle(units: any[], dt: number, blocked: Blocked): void {
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.path.length === 0) { a._vx = 0; a._vy = 0; }
  }
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!alive(a) || a.path.length > 0 || a.task === "attack") continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (!alive(b) || b.path.length > 0 || b.task === "attack") continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx > 1.4 || dx < -1.4 || dy > 1.4 || dy < -1.4) continue;
      const min = (radiusOf(a.type) + radiusOf(b.type)) * 0.85;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d < 1e-4 ? 1 : dx / d, ny = d < 1e-4 ? 0 : dy / d;
      const push = Math.min(0.9, (min - d) * 3) * dt * 0.5;
      const ax = a.x - nx * push, ay = a.y - ny * push, bx = b.x + nx * push, by = b.y + ny * push;
      if (!blocked(Math.floor(ax), Math.floor(ay))) { a.x = ax; a.y = ay; }
      if (!blocked(Math.floor(bx), Math.floor(by))) { b.x = bx; b.y = by; }
    }
  }
}

// ---- formation slots -----------------------------------------------------
/**
 * Unique destination tiles in a compact spiral around (tx, ty). Returns null for a single unit.
 * Slots nearest to the unit group are filled first so squads do not cross each other.
 */
export function formationSlots(units: any[], tx: number, ty: number, blocked: Blocked): Map<number, Pt> | null {
  if (units.length < 2) return null;
  let maxR = 0;
  for (const u of units) maxR = Math.max(maxR, radiusOf(u.type));
  const spacing = maxR > 0.6 ? 1.6 : maxR > 0.5 ? 1.2 : 1;
  const cx = Math.floor(tx), cy = Math.floor(ty);
  const cand: { dx: number; dy: number; d: number; a: number }[] = [];
  const R = Math.ceil(Math.sqrt(units.length) * 1.6) + 3;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) cand.push({ dx, dy, d: dx * dx + dy * dy, a: Math.atan2(dy, dx) });
  cand.sort((p, q) => p.d - q.d || p.a - q.a);
  const slots: Pt[] = [];
  const used = new Set<number>();
  for (const c of cand) {
    if (slots.length >= units.length) break;
    const sx = Math.floor(tx + c.dx * spacing), sy = Math.floor(ty + c.dy * spacing);
    const key = sy * 1024 + sx;
    if (used.has(key) || blocked(sx, sy)) continue;
    used.add(key);
    slots.push({ x: sx + 0.5, y: sy + 0.5 });
  }
  if (slots.length < units.length) return null;
  const pool = units.slice();
  const out = new Map<number, Pt>();
  for (const s of slots) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < pool.length; i++) {
      const d = Math.hypot(pool[i].x - s.x, pool[i].y - s.y);
      if (d < bd) { bd = d; bi = i; }
    }
    out.set(pool[bi].id, s);
    pool.splice(bi, 1);
  }
  void cx; void cy;
  return out;
}
