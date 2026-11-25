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
 * (up to 24 ahead) that it can see without crossing a blocked tile. Waypoints that end up
 * closer than 0.35 tiles to the previous one are dropped so units do not stutter on them.
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
    let j = Math.min(pts.length - 1, i + 24);
    while (j > i + 1 && !lineClear(pts[i], pts[j], blocked)) j--;
    const p = pts[j];
    const prev = out.length ? out[out.length - 1] : pts[0];
    if (j < pts.length - 1 && Math.hypot(p.x - prev.x, p.y - prev.y) < 0.35) { i = j; continue; }
    out.push(p);
    i = j;
  }
  return out;
}

// ---- steering ------------------------------------------------------------
function alive(o: any): boolean { return o.hp > 0 && !o.garrisoned; }
function isIdleAlly(o: any): boolean { return !o.path || o.path.length === 0 || Math.hypot(o._vx || 0, o._vy || 0) < 0.08; }

/** Allies that may be nudged aside: standing with no work to do. */
function canYield(o: any): boolean {
  return (!o.path || o.path.length === 0) && (!o.task || o.task === "idle" || o.task === "move" || o.task === "attack_move" || o.task === "retreat") && !o.targetEntityId;
}

/** True when moving `o` to (x, y) does not push it deeper into a third unit. */
function roomAt(o: any, x: number, y: number, units: any[]): boolean {
  const r = radiusOf(o.type);
  for (const q of units) {
    if (q === o || !alive(q)) continue;
    const ddx = q.x - x, ddy = q.y - y;
    if (ddx > 1.5 || ddx < -1.5 || ddy > 1.5 || ddy < -1.5) continue;
    const min = (r + radiusOf(q.type)) * 0.9;
    const dn = Math.hypot(ddx, ddy);
    if (dn < min && dn < Math.hypot(q.x - o.x, q.y - o.y)) return false;
  }
  return true;
}

/** Seconds a unit must be pinned by idle allies next to its goal before it settles. */
export const SETTLE_TIME = 0.5;

/** Radius around the final waypoint inside which a pinned unit may settle (grows with the group). */
export function settleRadius(u: any): number {
  const n = Math.max(1, u._grpN || 1);
  return 0.55 + radiusOf(u.type) + Math.sqrt(n) * 0.32;
}

function settle(u: any): void {
  u.path.length = 0;
  u._vx = 0; u._vy = 0; u._stk = 0; u._blk = 0; u._pinT = 0; u._best = undefined;
  u._settled = true;
  if (u.task === "move") u.task = "idle";
}

/**
 * Moves one unit along u.path[0] with seek + separation + tangent sliding.
 * - Allies standing still are slid around (the velocity component pushing into them is removed).
 * - Head-on / mutual blocks are broken by id priority: the higher id sidesteps, the lower keeps going.
 * - Group settle: near its goal and pinned by idle allies for SETTLE_TIME, the unit stops (task "move" -> "idle").
 * The new position is clamped against isTileBlocked so avoidance never enters water or a building.
 */
export function moveUnit(u: any, dt: number, speed: number, units: any[], blocked: Blocked): void {
  u._settled = false;
  const next = u.path[0];
  const dx = next.x - u.x, dy = next.y - u.y;
  const dist = Math.hypot(dx, dy);
  const last = u.path.length === 1;
  const step = speed * dt;
  if (dist <= step) { u.x = next.x; u.y = next.y; u.path.shift(); u._vx = 0; u._vy = 0; u._stk = 0; u._blk = 0; u._best = undefined; return; }
  if (dist <= (last ? 0.12 : 0.3)) { u.path.shift(); return; }
  // shared corner waypoints: once the next one is visible, cut the corner instead of queueing for the exact point
  if (!last && dist < 1.4 && lineClear(u, u.path[1], blocked)) { u.path.shift(); return moveUnit(u, dt, speed, units, blocked); }

  const goal = u.path[u.path.length - 1];
  const dGoal = Math.hypot(goal.x - u.x, goal.y - u.y);
  const canSettle = u.task === "move" || u.task === "attack_move" || u.task === "retreat" || u.task === "idle" || !u.task;
  const nearGoal = canSettle && dGoal < settleRadius(u);

  const sdx = dx / dist, sdy = dy / dist;
  let vx = sdx * speed, vy = sdy * speed;       // seekVec
  let sepX = 0, sepY = 0, tanX = 0, tanY = 0;   // separationVec / tangentAvoidVec
  const rA = radiusOf(u.type);
  const rightX = -sdy, rightY = sdx;            // right-hand perpendicular of the heading
  let pinned = false;                           // an idle ally touches us from the front
  const contacts: { nx: number; ny: number; o: any }[] = [];

  for (let k = 0; k < units.length; k++) {
    const o = units[k];
    if (o === u || !alive(o)) continue;
    const ox = o.x - u.x, oy = o.y - u.y;
    if (ox > 2.4 || ox < -2.4 || oy > 2.4 || oy < -2.4) continue;
    if (o.id === u.targetEntityId) continue;
    const allied = o.team === u.team;
    const d = Math.hypot(ox, oy);
    const rB = radiusOf(o.type);
    const sepR = rA + rB + 0.25;
    if (d < 1e-4) { sepX += ((u.id & 1) ? 1 : -1) * speed; sepY += ((u.id & 2) ? 1 : -1) * speed * 0.5; continue; }
    const ahead = (ox * sdx + oy * sdy) / d;
    if (d < sepR) {
      const s = Math.min(2 * speed, (sepR / d - 1) * 0.7 * speed + 0.15 * speed);
      sepX -= (ox / d) * s; sepY -= (oy / d) * s;
      if (ahead > 0.2 && d < rA + rB + 0.12 && isIdleAlly(o)) {
        contacts.push({ nx: ox / d, ny: oy / d, o });           // only standing units are slid around
        if (allied) pinned = true;
      }
    }
    const reach = rA + rB + 0.9;
    if (d < reach && ahead > 0.3) {
      let ovx = o._vx || 0, ovy = o._vy || 0;
      if (Math.hypot(ovx, ovy) < 0.1 && o.path && o.path.length > 0) {
        // has an order but has not started moving yet: use its intended heading
        const hx = o.path[0].x - o.x, hy = o.path[0].y - o.y, hm = Math.hypot(hx, hy) || 1;
        ovx = (hx / hm) * speed; ovy = (hy / hm) * speed;
      }
      const om = Math.hypot(ovx, ovy);
      const w = Math.max(0, Math.min(1, 1 - (d - (rA + rB)) / 0.9)) * 1.1 * speed;
      const side = rightX * ox + rightY * oy;
      if (om > 0.1) {
        const along = (ovx * sdx + ovy * sdy) / om;
        if (along < -0.3) {                                                      // head-on
          // anti-deadlock: the higher id yields with a stronger sidestep, both keep to the right
          const yieldK = allied && u.id > o.id ? 1.6 : 1;
          tanX += rightX * w * yieldK; tanY += rightY * w * yieldK;
        } else if (along < 0.3) {                                                // crossing: yield to the side we are not on
          const dir = side > 0 ? -1 : 1;
          const k2 = allied && u.id > o.id ? 1 : 0.6;                            // lower id keeps right of way
          tanX += rightX * dir * w * k2; tanY += rightY * dir * w * k2;
        }                                                                        // same direction: just follow
      } else {                                                                   // stationary / gathering: go around the near side
        let dir = side > 0.05 ? -1 : side < -0.05 ? 1 : (u.id & 1 ? 1 : -1);
        if (u._detour) dir = u._detour;                                          // keep the side chosen while stuck
        tanX += rightX * dir * w; tanY += rightY * dir * w;
      }
    }
  }

  // ---- group settle: next to the goal, touched by idle allies recently, and no real progress for SETTLE_TIME
  u._pinT = pinned ? SETTLE_TIME : Math.max(0, (u._pinT || 0) - dt);
  if (nearGoal) {
    if (u._best === undefined || dGoal < u._best - 0.1) { u._best = dGoal; u._blk = 0; }
    else u._blk = (u._blk || 0) + dt;
    if (u._blk >= SETTLE_TIME && u._pinT > 0) { settle(u); return; }
  } else { u._best = undefined; u._blk = 0; }

  let avX = sepX + tanX, avY = sepY + tanY;
  const avM = Math.hypot(avX, avY);
  if (avM > 1.2 * speed) { avX = (avX / avM) * 1.2 * speed; avY = (avY / avM) * 1.2 * speed; }
  vx += avX; vy += avY;
  const fwd = vx * sdx + vy * sdy;
  if (fwd < 0.3 * speed) { vx += (0.3 * speed - fwd) * sdx; vy += (0.3 * speed - fwd) * sdy; } // keep flowing in crowds
  if (contacts.length > 0) {
    // tangent slide: drop the part of the velocity that pushes into touching units instead of shoving them
    for (const c of contacts) {
      const into = vx * c.nx + vy * c.ny;
      if (into <= 0) continue;
      const o = c.o;
      if (o.team === u.team && canYield(o)) {
        // idle ally makes room: step it sideways (away from our line) and keep a slow push-through
        const side = (rightX * c.nx + rightY * c.ny) >= 0 ? 1 : -1;
        const push = 0.55 * speed * dt;
        const px = o.x + (rightX * side * 0.8 + c.nx * 0.4) * push, py = o.y + (rightY * side * 0.8 + c.ny * 0.4) * push;
        if (!blocked(Math.floor(px), Math.floor(py)) && roomAt(o, px, py, units)) { o.x = px; o.y = py; }
        vx -= c.nx * into * 0.85; vy -= c.ny * into * 0.85;
      } else { vx -= c.nx * into; vy -= c.ny * into; }   // working / enemy: slide along it
    }
    if (Math.hypot(vx, vy) < 0.25 * speed) {
      const dir = u._detour || (u.id & 1 ? 1 : -1);
      vx += rightX * dir * 0.45 * speed; vy += rightY * dir * 0.45 * speed;
    }
  }
  const m = Math.hypot(vx, vy);
  if (m > speed) { vx = (vx / m) * speed; vy = (vy / m) * speed; }

  const nx = u.x + vx * dt, ny = u.y + vy * dt;
  const ox0 = u.x, oy0 = u.y;
  if (!blocked(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
  else if (!blocked(Math.floor(nx), Math.floor(u.y))) { u.x = nx; }
  else if (!blocked(Math.floor(u.x), Math.floor(ny))) { u.y = ny; }
  u._vx = (u.x - ox0) / dt; u._vy = (u.y - oy0) / dt;

  // Stuck handling: pick a detour side first, then skip the waypoint, then settle / give up.
  if (Math.hypot(u._vx, u._vy) < speed * 0.2) {
    u._stk = (u._stk || 0) + dt;
    if (u._stk > 0.5 && !u._detour) u._detour = u.id & 1 ? 1 : -1;
    if (u._stk > 1.0) {
      if (nearGoal) { settle(u); return; }
      u._detour = -(u._detour || 1);
      if (u.path.length > 1 && lineClear(u, u.path[1], blocked)) u.path.shift();
      else if (u.path.length === 1 && dist < 1.4) u.path.shift();
      else u._repath = true;                                    // pushed off the route: ask the game for a fresh A* path
      u._stk = 0;
    }
  } else { u._stk = 0; u._detour = 0; }
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
/** Tiles reachable from (cx, cy) within radius R (flood fill), so slots never land across water or walls. */
function reachableTiles(cx: number, cy: number, R: number, blocked: Blocked): Set<number> {
  const seen = new Set<number>();
  if (blocked(cx, cy)) return seen;
  const q: number[] = [cx, cy];
  seen.add(cy * 1024 + cx);
  for (let h = 0; h < q.length; h += 2) {
    const x = q[h], y = q[h + 1];
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ddx, ny = y + ddy;
      if (Math.abs(nx - cx) > R || Math.abs(ny - cy) > R) continue;
      const k = ny * 1024 + nx;
      if (seen.has(k) || blocked(nx, ny)) continue;
      seen.add(k); q.push(nx, ny);
    }
  }
  return seen;
}

/**
 * Unique destinations on a spiral of rings around (tx, ty), spaced by the largest unit radius.
 * Slots sit on walkable tiles connected to the tapped tile (water, walls and buildings are skipped).
 * Assignment is a global nearest-pair greedy so squads keep their shape and do not cross each other.
 * Sets u._grpN (group size, used by the settle radius). Returns null for a single unit.
 */
export function formationSlots(units: any[], tx: number, ty: number, blocked: Blocked): Map<number, Pt> | null {
  for (const u of units) u._grpN = units.length;
  if (units.length < 2) return null;
  let maxR = 0;
  for (const u of units) maxR = Math.max(maxR, radiusOf(u.type));
  const spacing = Math.max(1.0, maxR * 2 + 0.3);
  let cx = Math.floor(tx), cy = Math.floor(ty);
  if (blocked(cx, cy)) {
    let best = 1e9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!blocked(Math.floor(tx) + dx, Math.floor(ty) + dy) && dx * dx + dy * dy < best) { best = dx * dx + dy * dy; cx = Math.floor(tx) + dx; cy = Math.floor(ty) + dy; }
    }
    if (best === 1e9) return null;
    tx = cx + 0.5; ty = cy + 0.5;
  }
  const R = Math.ceil(Math.sqrt(units.length) * spacing * 1.4) + 3;
  const reach = reachableTiles(cx, cy, R, blocked);
  const slots: Pt[] = [];
  const minGap = spacing * 0.92;
  const tryAdd = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (!reach.has(iy * 1024 + ix)) return;
    // keep a little margin from the edges of blocked neighbours
    for (const s of slots) if (Math.hypot(s.x - x, s.y - y) < minGap) return;
    slots.push({ x, y });
  };
  tryAdd(tx, ty);
  for (let ring = 1; slots.length < units.length && ring * spacing <= R; ring++) {
    const r = ring * spacing;
    const n = Math.max(6, Math.floor((2 * Math.PI * r) / spacing));
    const phase = ring * 0.5;                       // offset rings -> hex-like packing
    for (let i = 0; i < n && slots.length < units.length; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      tryAdd(tx + Math.cos(a) * r, ty + Math.sin(a) * r);
    }
  }
  if (slots.length === 0) return null;
  // global nearest-pair assignment
  const pairs: { u: number; s: number; d: number }[] = [];
  for (let i = 0; i < units.length; i++) for (let j = 0; j < slots.length; j++) {
    pairs.push({ u: i, s: j, d: Math.hypot(units[i].x - slots[j].x, units[i].y - slots[j].y) });
  }
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map<number, Pt>();
  const usedU = new Set<number>(), usedS = new Set<number>();
  for (const p of pairs) {
    if (usedU.has(p.u) || usedS.has(p.s)) continue;
    usedU.add(p.u); usedS.add(p.s);
    out.set(units[p.u].id, slots[p.s]);
    if (usedU.size === units.length || usedS.size === slots.length) break;
  }
  // not enough room: the rest share the nearest slot and settle on arrival
  for (let i = 0; i < units.length; i++) {
    if (usedU.has(i)) continue;
    let bs = slots[0], bd = 1e9;
    for (const s of slots) { const d = Math.hypot(units[i].x - s.x, units[i].y - s.y); if (d < bd) { bd = d; bs = s; } }
    out.set(units[i].id, bs);
  }
  return out;
}
