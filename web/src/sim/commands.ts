// Dynasty of the East — move-order behaviours: move auto-aggro, healer stop-and-heal, and the retreat command.
// Pure functions over the game state; the classic game script passes in its own findPath / isTileBlocked.

import { fcx, fcy, fmax } from "./footprint";
import { formationSlots, type Blocked, type Pt } from "./steering";

export type FindPath = (sx: number, sy: number, gx: number, gy: number) => Pt[];

/** Command kinds the UI can issue. `retreat` ignores every enemy until the unit reaches its point. */
export type MoveCommand = "move" | "attack_move" | "retreat";

/** Healer heal reach (tiles); keep in sync with the healer block in index.html. */
export const HEAL_RANGE = 4.5;
/** A move-aggro chase is dropped when the target gets this many times the unit's vision away. */
const LEASH = 1.6;

const NAVAL = new Set(["fishing_boat", "galley", "fire_ship"]);

/** Sight radius used for move auto-aggro: `vision` from UNIT_DEFS, never below the weapon range. */
export function sightRange(def: any): number {
  return Math.max(def?.vision ?? 5, (def?.range ?? 0) + 0.5);
}

function hostile(u: any, o: any): boolean {
  if (o.team === u.team) return false;
  return true;
}

function sameSide(u: any, o: any): boolean {
  return o.team === u.team && (u.team !== "enemy" || (o.aiIndex ?? 0) === (u.aiIndex ?? 0));
}

/**
 * Nearest visible enemy inside `sightRange`, by priority: soldiers (anything not a villager),
 * then villagers, then buildings. Player units only see what the fog has revealed.
 */
export function acquireOnMove(state: any, u: any, def: any): any | null {
  const R = sightRange(def);
  const seen = (x: number, y: number) => u.team !== "player" || (state.fog?.[Math.floor(y)]?.[Math.floor(x)] ?? 2) === 2;
  let soldier: any = null, sd = R, villager: any = null, vd = R;
  for (const o of state.units) {
    if (o.hp <= 0 || o.garrisoned || !hostile(u, o)) continue;
    if (NAVAL.has(o.type) !== NAVAL.has(u.type) && !(def?.range > 3)) continue; // melee cannot reach across the shore
    const d = Math.hypot(o.x - u.x, o.y - u.y);
    if (d > R || !seen(o.x, o.y)) continue;
    if (o.type === "villager") { if (d < vd) { vd = d; villager = o; } }
    else if (d < sd) { sd = d; soldier = o; }
  }
  if (soldier) return soldier;
  if (villager) return villager;
  let bldg: any = null, bd = R;
  for (const b of state.buildings) {
    if (b.hp <= 0 || !hostile(u, b)) continue;
    const d = Math.hypot(fcx(b) - u.x, fcy(b) - u.y) - fmax(b) * 0.5;
    if (d < bd && seen(fcx(b), fcy(b))) { bd = d; bldg = b; }
  }
  return bldg;
}

function finalPoint(u: any): Pt | null {
  const p = u.path?.[u.path.length - 1];
  if (p) return { x: p.x, y: p.y };
  return u.moveDest ?? null;
}

/** True for combat units that should auto-engage while on a plain move order. */
export function engagesOnMove(u: any, def: any): boolean {
  return !!def && def.atk > 0 && u.type !== "villager" && u.type !== "healer" && u.type !== "fishing_boat" && u.stance !== "stand_ground";
}

function injuredAlly(state: any, u: any, R: number): any | null {
  let best: any = null, bd = R;
  for (const a of state.units) {
    if (a === u || !sameSide(u, a) || a.hp <= 0 || a.hp >= a.maxHp || a.garrisoned) continue;
    const d = Math.hypot(a.x - u.x, a.y - u.y);
    if (d <= bd) { bd = d; best = a; }
  }
  return best;
}

/**
 * Per-frame move-order logic, called before movement. Returns true when the unit's order changed.
 * - Combat unit on `move`: locks on to the best visible enemy, remembers its destination in `u.moveResume`.
 * - Combat unit chasing a move-aggro target: drops it past the leash and resumes the move.
 * - Healer on `move`: stops (task `heal_stop`) next to an injured ally, resumes once nobody needs healing.
 * - Villagers and `retreat` orders are never diverted.
 */
export function stepMoveOrder(state: any, u: any, def: any, findPath: FindPath): boolean {
  if (u.task === "retreat" || u.type === "villager") return false;

  if (u.type === "healer") {
    const R = sightRange(def);
    if (u.task === "move" && u.path.length > 0) {
      const a = injuredAlly(state, u, R);
      if (!a) return false;
      u.moveResume = finalPoint(u);
      u.task = "heal_stop"; u.healTargetId = a.id;
      u.path = Math.hypot(a.x - u.x, a.y - u.y) > HEAL_RANGE - 1 ? findPath(u.x, u.y, a.x, a.y) : [];
      return true;
    }
    if (u.task === "heal_stop") {
      const a = state.units.find((x: any) => x.id === u.healTargetId);
      const still = a && a.hp > 0 && a.hp < a.maxHp && !a.garrisoned ? a : injuredAlly(state, u, R);
      if (still) {
        u.healTargetId = still.id;
        const d = Math.hypot(still.x - u.x, still.y - u.y);
        if (d > HEAL_RANGE - 0.5 && u.path.length === 0) u.path = findPath(u.x, u.y, still.x, still.y);
        else if (d <= HEAL_RANGE - 1 && u.path.length) u.path = [];
        return false;
      }
      resumeMove(u, findPath);
      return true;
    }
    return false;
  }

  if (!engagesOnMove(u, def)) return false;

  if (u.task === "move" && u.path.length > 0 && !u.targetEntityId) {
    const t = acquireOnMove(state, u, def);
    if (!t) return false;
    u.moveResume = finalPoint(u);
    u.task = "attack"; u.targetEntityId = t.id; u.manualAtk = false; u.path = [];
    return true;
  }

  if (u.task === "attack" && u.moveResume && u.targetEntityId && !u.manualAtk) {
    const t = state.units.find((x: any) => x.id === u.targetEntityId) ?? state.buildings.find((b: any) => b.id === u.targetEntityId);
    if (!t || t.hp <= 0 || t.garrisoned) { u.targetEntityId = null; resumeMove(u, findPath); return true; }
    const tx = t.x ?? fcx(t), ty = t.y ?? fcy(t);
    if (Math.hypot(tx - u.x, ty - u.y) > sightRange(def) * LEASH) {
      // next visible enemy in sight, otherwise continue the original move
      const n = acquireOnMove(state, u, def);
      if (n && n.id !== t.id) { u.targetEntityId = n.id; u.path = []; return true; }
      u.targetEntityId = null; resumeMove(u, findPath); return true;
    }
  }
  return false;
}

/** Continue the move that move-aggro or a heal stop interrupted (or go idle when there is none). */
export function resumeMove(u: any, findPath: FindPath): void {
  const r = u.moveResume;
  u.moveResume = null; u.healTargetId = null;
  if (r && Math.hypot(r.x - u.x, r.y - u.y) > 0.4) {
    u.task = "move"; u.targetEntityId = null; u.manualAtk = false;
    u.path = findPath(u.x, u.y, r.x, r.y);
    u.moveDest = r;
    if (u.path.length === 0) u.task = "idle";
  } else u.task = "idle";
}

/** Marker colour per command kind; also used by the 3D command ripple. */
export const COMMAND_COLORS: Record<string, number> = { move: 0xc9a04a, attack: 0xc2402a, retreat: 0x4f8fd0 };

export interface RetreatDeps {
  findPath: FindPath;
  isBlocked: Blocked;
  /** Optional visual feedback, e.g. the game's visualFx("command", ...). */
  marker?: (x: number, y: number, kind: "retreat") => void;
}

/**
 * Retreat: every listed land unit runs to (x, z) on its own formation slot and ignores all enemies
 * on the way (no move-aggro, no auto-acquire, no attack-move resume). On arrival it goes idle.
 * Returns the number of units that received the order.
 */
export function issueRetreat(state: any, unitIds: number[], x: number, z: number, deps: RetreatDeps): number {
  const ids = new Set(unitIds);
  const units = state.units.filter((u: any) => ids.has(u.id) && u.hp > 0 && !u.garrisoned && !NAVAL.has(u.type));
  if (!units.length || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const slots = formationSlots(units, x, z, deps.isBlocked);
  let n = 0;
  for (const u of units) {
    const s = slots?.get(u.id) ?? { x, y: z };
    u.task = "retreat";
    u.targetEntityId = null; u.manualAtk = false; u.amDest = null; u.moveResume = null; u.healTargetId = null;
    u.huntId = null; u.buildTargetId = null; u.targetTile = null;
    u.retreatDest = { x: s.x, y: s.y };
    u.moveDest = u.retreatDest;
    u.path = deps.findPath(u.x, u.y, s.x, s.y);
    if (u.path.length === 0) { u.task = "idle"; u.retreatDest = null; continue; }
    n++;
  }
  if (n && deps.marker) deps.marker(x, z, "retreat");
  return n;
}

/** Ends a retreat when its path is done (called where finished moves are reset). */
export function finishRetreat(u: any): void {
  if (u.task === "retreat" && (!u.path || u.path.length === 0)) { u.task = "idle"; u.retreatDest = null; u.moveDest = null; }
}
