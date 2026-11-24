// Pixel Dynasty — wildlife: deer herds (flee when startled), wild boar (charge back at attackers) and villager hunting.
// Animals live in `state.animals` (never in `state.units`, so soldiers never auto-target them).
import { rng } from "./valley";

export type AnimalType = "deer" | "boar" | "goat" | "cattle" | "lion" | "wild_elephant";

export interface Animal {
  id: number; type: AnimalType; x: number; y: number; hp: number; maxHp: number;
  food: number;            // meat left (full amount from the start; harvestable once dead)
  dead: boolean; deadT: number;
  heading: number; wanderT: number; fleeT: number;
  homeX: number; homeY: number;
  aggroId: number | null; aggroT: number; atkCd: number;
}

export const ANIMAL_DEFS: Record<AnimalType, { name: string; hp: number; food: number; atk: number; walk: number; run: number; startle: number }> = {
  deer: { name: "Hươu", hp: 18, food: 140, atk: 0, walk: 0.5, run: 2.7, startle: 3.2 },
  boar: { name: "Lợn Rừng", hp: 65, food: 240, atk: 7, walk: 0.45, run: 2.5, startle: 0 },
  goat: { name: "Dê Núi", hp: 22, food: 110, atk: 0, walk: 0.55, run: 2.5, startle: 2.8 },
  cattle: { name: "Bò Rừng", hp: 40, food: 180, atk: 0, walk: 0.4, run: 2.0, startle: 2.4 },
  lion: { name: "Sư Tử", hp: 95, food: 260, atk: 13, walk: 0.6, run: 3.0, startle: 0 },
  wild_elephant: { name: "Voi Rừng", hp: 180, food: 420, atk: 18, walk: 0.38, run: 2.1, startle: 0 },
};

/** Villagers butcher a carcass this much faster than they gather ordinary food. */
export const HUNT_FOOD_MULT = 1.5;

type Blocked = (tx: number, ty: number, team?: string) => boolean;
const TAU = Math.PI * 2;

function mkAnimal(id: number, type: AnimalType, x: number, y: number, hx: number, hy: number): Animal {
  const d = ANIMAL_DEFS[type];
  return { id, type, x, y, hp: d.hp, maxHp: d.hp, food: d.food, dead: false, deadT: 0, heading: Math.random() * TAU, wanderT: Math.random() * 3, fleeT: 0, homeX: hx, homeY: hy, aggroId: null, aggroT: 0, atkCd: 0 };
}

/** Scatter deer herds (3–4 deer) and boars over open grass, away from every start base. */
export function spawnWildlife(grid: any[][], n: number, seed: number, bases: Array<{ tx: number; ty: number }>, nextId: () => number): Animal[] {
  const r = rng(((seed >>> 0) ^ 0x7f4a7c15) >>> 0);
  const herds = n >= 96 ? 5 : n >= 64 ? 3 : 2;
  const boars = n >= 96 ? 4 : n >= 64 ? 3 : 2;
  const minBase = Math.max(12, n * 0.22);
  const out: Animal[] = [];
  const spots: Array<{ x: number; y: number }> = [];
  const okSpot = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = grid[y + dy]?.[x + dx];
      if (!c || c.terrain !== "grass" || c.res) return false;
    }
    for (const b of bases) if (Math.hypot(b.tx - x, b.ty - y) < minBase) return false;
    for (const s of spots) if (Math.hypot(s.x - x, s.y - y) < 8) return false;
    return true;
  };
  const pick = (): { x: number; y: number } | null => {
    for (let k = 0; k < 500; k++) {
      const x = 3 + Math.floor(r() * (n - 6)), y = 3 + Math.floor(r() * (n - 6));
      if (okSpot(x, y)) { const p = { x, y }; spots.push(p); return p; }
    }
    return null;
  };
  for (let h = 0; h < herds; h++) {
    const p = pick(); if (!p) break;
    const cnt = 3 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < cnt; k++) out.push(mkAnimal(nextId(), "deer", p.x + 0.5 + (r() - 0.5) * 2.4, p.y + 0.5 + (r() - 0.5) * 2.4, p.x + 0.5, p.y + 0.5));
  }
  for (let b = 0; b < boars; b++) {
    const p = pick(); if (!p) break;
        out.push(mkAnimal(nextId(), "boar", p.x + 0.5, p.y + 0.5, p.x + 0.5, p.y + 0.5));
  }
  for (const b of bases) {
    let placed = 0;
    for (let k = 0; k < 80 && placed < 2; k++) {
      const ang = r() * TAU;
      const dist = 5 + r() * 6;
      const tx = Math.floor(b.tx + Math.cos(ang) * dist);
      const ty = Math.floor(b.ty + Math.sin(ang) * dist);
      const c = grid[ty]?.[tx];
      if (!c || c.terrain !== "grass" || c.res) continue;
      const kind: AnimalType = placed === 0 ? "goat" : "cattle";
      const cnt = kind === "goat" ? 2 : 1;
      for (let i = 0; i < cnt; i++) {
        out.push(mkAnimal(nextId(), kind, tx + 0.5 + (r() - 0.5) * 1.4, ty + 0.5 + (r() - 0.5) * 1.4, tx + 0.5, ty + 0.5));
      }
      placed++;
    }
  }
  const guards: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!grid[y]?.[x]?.treasureGuarded) continue;
      if (guards.some((g) => Math.hypot(g.x - x, g.y - y) < 6)) continue;
      guards.push({ x, y });
    }
  }
  if (guards.length > 0) {
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      let gx = g.x, gy = g.y;
      for (let rad = 1; rad <= 3; rad++) {
        let found = false;
        for (let dy = -rad; dy <= rad && !found; dy++) {
          for (let dx = -rad; dx <= rad && !found; dx++) {
            const c = grid[g.y + dy]?.[g.x + dx];
            if (c && c.terrain === "grass" && !c.res) { gx = g.x + dx; gy = g.y + dy; found = true; }
          }
        }
        if (found) break;
      }
      const pred: AnimalType = i % 2 === 0 ? "lion" : "wild_elephant";
      out.push(mkAnimal(nextId(), pred, gx + 0.5, gy + 0.5, gx + 0.5, gy + 0.5));
    }
  } else {
    const cMin = Math.floor(n * 0.35), cMax = Math.floor(n * 0.65);
    let spawned = 0;
    for (let k = 0; k < 200 && spawned < 4; k++) {
      const x = cMin + Math.floor(r() * Math.max(1, cMax - cMin));
      const y = cMin + Math.floor(r() * Math.max(1, cMax - cMin));
      if (!okSpot(x, y)) continue;
      spots.push({ x, y });
      const pred: AnimalType = spawned % 2 === 0 ? "lion" : "wild_elephant";
      out.push(mkAnimal(nextId(), pred, x + 0.5, y + 0.5, x + 0.5, y + 0.5));
      spawned++;
    }
  }
  
  return out;
}

function visibleTo(state: any, a: Animal): boolean {
  return (state.fog?.[Math.floor(a.y)]?.[Math.floor(a.x)] ?? 0) === 2;
}

/** Animal near (x, y) that is alive or still has meat, and currently visible. */
export function animalAt(state: any, x: number, y: number, radius = 1.0): Animal | null {
  let best: Animal | null = null, bd = radius;
  for (const a of state.animals || []) {
    if (a.dead && a.food <= 0) continue;
    if (!visibleTo(state, a)) continue;
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

export function findAnimal(state: any, id: number | null | undefined): Animal | null {
  if (id == null) return null;
  return (state.animals || []).find((a: Animal) => a.id === id) || null;
}

export function nearestAnimal(state: any, x: number, y: number, maxD: number): Animal | null {
  let best: Animal | null = null, bd = maxD;
  for (const a of state.animals || []) {
    if (a.dead && a.food <= 0) continue;
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** Hit an animal: deer bolt, boar turns on the attacker. Returns true when this blow killed it. */
export function damageAnimal(a: Animal, dmg: number, attacker: any): boolean {
  if (a.dead) return false;
  a.hp -= dmg;
  if (a.hp <= 0) { a.hp = 0; a.dead = true; a.aggroId = null; a.fleeT = 0; return true; }
  if (ANIMAL_DEFS[a.type].atk <= 0) {
    a.fleeT = 1.6 + Math.random() * 0.9;
    if (attacker) a.heading = Math.atan2(a.y - attacker.y, a.x - attacker.x) + (Math.random() - 0.5) * 0.7;
  } else if (attacker) {
    a.aggroId = attacker.id; a.aggroT = 9;
  }
  return false;
}

function step(a: Animal, dx: number, dy: number, blocked: Blocked): boolean {
  const nx = a.x + dx, ny = a.y + dy;
  if (!blocked(Math.floor(nx), Math.floor(ny))) { a.x = nx; a.y = ny; return true; }
  if (!blocked(Math.floor(nx), Math.floor(a.y))) { a.x = nx; return true; }
  if (!blocked(Math.floor(a.x), Math.floor(ny))) { a.y = ny; return true; }
  return false;
}

export function stepAnimals(state: any, dt: number, blocked: Blocked, hurt: (u: any, dmg: number) => void): void {
  const list: Animal[] = state.animals;
  if (!list || list.length === 0) return;
  const n = state.mapSize;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.dead) {
      a.deadT += dt;
      if (a.food <= 0 || a.deadT > 240) list.splice(i, 1); // carcass eaten (or rotted away)
      continue;
    }
    const def = ANIMAL_DEFS[a.type];
    if (a.atkCd > 0) a.atkCd -= dt;

    if (def.atk <= 0) {
      // startled by anyone walking close
      if (a.fleeT <= 0) {
        for (const u of state.units) {
          if (u.hp <= 0 || u.garrisoned) continue;
          const d = Math.hypot(u.x - a.x, u.y - a.y);
          if (d < def.startle) { a.fleeT = 1.2 + Math.random() * 0.8; a.heading = Math.atan2(a.y - u.y, a.x - u.x) + (Math.random() - 0.5) * 0.6; break; }
        }
      }
      if (a.fleeT > 0) {
        a.fleeT -= dt;
        if (!step(a, Math.cos(a.heading) * def.run * dt, Math.sin(a.heading) * def.run * dt, blocked)) a.heading += Math.PI * (0.6 + Math.random() * 0.8);
        continue;
      }
    } else if (a.aggroId != null) {
      const t = state.units.find((u: any) => u.id === a.aggroId && u.hp > 0);
      a.aggroT -= dt;
      if (!t || a.aggroT <= 0 || Math.hypot(t.x - a.x, t.y - a.y) > 10) { a.aggroId = null; }
      else {
        const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
        a.heading = Math.atan2(dy, dx);
        if (d > 0.8) step(a, (dx / d) * def.run * dt, (dy / d) * def.run * dt, blocked);
        else if (a.atkCd <= 0) { a.atkCd = 1.5; hurt(t, def.atk); a.aggroT = Math.max(a.aggroT, 4); }
        continue;
      }
    }

    // grazing / wandering near home
    a.wanderT -= dt;
    if (a.wanderT <= 0) {
      a.wanderT = 2 + Math.random() * 4;
      const away = Math.hypot(a.homeX - a.x, a.homeY - a.y) > 4.5;
      a.heading = away ? Math.atan2(a.homeY - a.y, a.homeX - a.x) : Math.random() * TAU;
      if (Math.random() < 0.4) a.wanderT += 2.5; // pause to graze
      else a.fleeT = 0;
      (a as any).graze = a.wanderT > 5.5;
    }
    if (!(a as any).graze) {
      step(a, Math.cos(a.heading) * def.walk * dt, Math.sin(a.heading) * def.walk * dt, blocked);
    }
    a.x = Math.max(1, Math.min(n - 1, a.x)); a.y = Math.max(1, Math.min(n - 1, a.y));
  }
}

export interface HuntCtx {
  state: any;
  findPath: (u: any, gx: number, gy: number) => any[];
  findDropoff: (team: string, x: number, y: number) => any;
  foodMult: () => number;
  atk: (u: any) => number;
  onHit: (a: Animal, u: any, dmg: number, killed: boolean) => void;
}

function goDrop(ctx: HuntCtx, u: any): void {
  const drop = ctx.findDropoff(u.team, u.x, u.y);
  u.huntBusy = false;
  if (drop) { u.task = "return"; u.path = ctx.findPath(u, drop.tx + drop.size / 2, drop.ty + drop.size / 2); }
  else { u.task = "idle"; u.huntId = null; }
}

/** One simulation step for a villager with task === "hunt" (only called while it has no path to walk). */
export function stepHunter(ctx: HuntCtx, u: any, dt: number): void {
  const st = ctx.state;
  let a = findAnimal(st, u.huntId);
  if (!a || (a.dead && a.food <= 0)) {
    const next = nearestAnimal(st, u.x, u.y, 14);
    if (next && u.carryAmt < 15 && (u.carryAmt === 0 || u.carryType === "food")) { u.huntId = next.id; u.huntBusy = false; return; }
    if (u.carryAmt > 0) { goDrop(ctx, u); return; }
    u.task = "idle"; u.huntId = null; u.huntBusy = false; return;
  }
  const dist = Math.hypot(a.x - u.x, a.y - u.y);
  u.huntFace = { x: a.x, y: a.y };
  if (!a.dead) {
    if (dist > 1.15) { u.huntBusy = false; u.path = ctx.findPath(u, a.x, a.y); return; }
    u.huntBusy = true;
    if (u.atkCooldown <= 0) {
      u.atkCooldown = 1.0;
      const dmg = ctx.atk(u);
      const killed = damageAnimal(a, dmg, u);
      ctx.onHit(a, u, dmg, killed);
    }
    return;
  }
  // carcass: butcher it at 1.5x the normal food rate
  if (u.carryAmt > 0 && u.carryType !== "food") { goDrop(ctx, u); return; }
  if (dist > 1.4) { u.huntBusy = false; u.path = ctx.findPath(u, a.x, a.y); return; }
  u.huntBusy = true;
  u.gatherTick += dt * HUNT_FOOD_MULT * ctx.foodMult();
  if (u.gatherTick >= 0.78) {
    u.gatherTick = 0;
    const take = Math.min(5, a.food);
    a.food -= take;
    u.carryType = "food"; u.carryAmt += take;
    if (u.carryAmt >= 15 || a.food <= 0) goDrop(ctx, u);
  }
}
