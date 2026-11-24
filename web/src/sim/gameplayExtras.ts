export interface FactionTraits {
  forestSpeedMult: number;
  elephantSplash: boolean;
  farmYieldMult: number;
  wallTowerHpMult: number;
  campBuildSpeedMult: number;
  horseArcherMoveMult: number;
}

export function getFactionTraits(faction: string): FactionTraits {
  switch (faction) {
    case "dai_viet":
      return {
        forestSpeedMult: 1.15,
        elephantSplash: true,
        farmYieldMult: 1,
        wallTowerHpMult: 1,
        campBuildSpeedMult: 1,
        horseArcherMoveMult: 1,
      };
    case "trung_nguyen":
      return {
        forestSpeedMult: 1,
        elephantSplash: false,
        farmYieldMult: 1.15,
        wallTowerHpMult: 1.2,
        campBuildSpeedMult: 1,
        horseArcherMoveMult: 1,
      };
    case "bac_cuong":
      return {
        forestSpeedMult: 1,
        elephantSplash: false,
        farmYieldMult: 1,
        wallTowerHpMult: 1,
        campBuildSpeedMult: 1.25,
        horseArcherMoveMult: 1.1,
      };
    default:
      return {
        forestSpeedMult: 1,
        elephantSplash: false,
        farmYieldMult: 1,
        wallTowerHpMult: 1,
        campBuildSpeedMult: 1,
        horseArcherMoveMult: 1,
      };
  }
}

export interface EnvironmentModifiers {
  visionMult: number;
  towerVisionMult: number;
  cavalrySiegeSpeedMult: number;
  rangedRangeMult: number;
}

export function getEnvironmentModifiers(isNight: boolean, isRain: boolean): EnvironmentModifiers {
  return {
    visionMult: isNight ? 0.72 : 1.0,
    towerVisionMult: 1.0,
    cavalrySiegeSpeedMult: isRain ? 0.85 : 1.0,
    rangedRangeMult: isRain ? 0.88 : 1.0,
  };
}

function isGarrisonBuilding(b: any, team: any): boolean {
  if (!b || b.team !== team) return false;
  if (b.built === false) return false;
  if (b.hp !== undefined && b.hp <= 0) return false;
  const t = String(b.type || "");
  return t === "town_center" || t === "watch_tower" || t === "tower" || t === "guard_tower" || t.includes("tower");
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function triggerTownBell(state: any, team: any): number {
  if (!state) return 0;
  const units: any[] = Array.isArray(state.units) ? state.units : [];
  const buildings: any[] = Array.isArray(state.buildings) ? state.buildings : [];
  const shelters = buildings.filter((b) => isGarrisonBuilding(b, team));
  if (shelters.length === 0) return 0;

  if (!state._townBellActive) state._townBellActive = {};
  state._townBellActive[team] = true;

  let count = 0;
  for (const u of units) {
    if (!u || u.team !== team || u.type !== "villager") continue;
    if (u.hp !== undefined && u.hp <= 0) continue;

    let nearest = shelters[0];
    let bestD = distSq(u.x ?? 0, u.y ?? 0, nearest.x ?? 0, nearest.y ?? 0);
    for (let i = 1; i < shelters.length; i++) {
      const d = distSq(u.x ?? 0, u.y ?? 0, shelters[i].x ?? 0, shelters[i].y ?? 0);
      if (d < bestD) {
        bestD = d;
        nearest = shelters[i];
      }
    }

    if (!u._prevBellJob) {
      u._prevBellJob = {
        task: u.task ?? "idle",
        targetTile: u.targetTile ? { ...u.targetTile } : null,
        targetEntityId: u.targetEntityId ?? null,
        huntId: u.huntId ?? null,
        buildTargetId: u.buildTargetId ?? null,
        gatherType: u.gatherType ?? null,
        amDest: u.amDest ? { ...u.amDest } : null,
        forced: Boolean(u.forced),
      };
    }

    u.garrisoned = true;
    u.garrisonedIn = nearest.id ?? nearest.type;
    u.task = "garrison";
    u.targetEntityId = nearest.id ?? null;
    u.targetTile = { tx: Math.floor(nearest.x ?? 0), ty: Math.floor(nearest.y ?? 0) };
    if (!Array.isArray(nearest.garrisonedIds)) nearest.garrisonedIds = [];
    if (u.id !== undefined && !nearest.garrisonedIds.includes(u.id)) {
      nearest.garrisonedIds.push(u.id);
    }
    count++;
  }
  return count;
}

export function releaseTownBell(state: any, team: any): number {
  if (!state) return 0;
  const units: any[] = Array.isArray(state.units) ? state.units : [];
  const buildings: any[] = Array.isArray(state.buildings) ? state.buildings : [];

  if (state._townBellActive) {
    state._townBellActive[team] = false;
  }

  for (const b of buildings) {
    if (b && b.team === team && Array.isArray(b.garrisonedIds)) {
      b.garrisonedIds = [];
    }
  }

  let count = 0;
  for (const u of units) {
    if (!u || u.team !== team || u.type !== "villager") continue;
    if (!u.garrisoned && !u._prevBellJob) continue;

    u.garrisoned = false;
    u.garrisonedIn = null;
    if (u._prevBellJob) {
      const prev = u._prevBellJob;
      u.task = prev.task;
      u.targetTile = prev.targetTile;
      u.targetEntityId = prev.targetEntityId;
      u.huntId = prev.huntId;
      u.buildTargetId = prev.buildTargetId;
      u.gatherType = prev.gatherType;
      u.amDest = prev.amDest;
      u.forced = prev.forced;
      delete u._prevBellJob;
    } else {
      u.task = "idle";
    }
    count++;
  }
  return count;
}

export type MilitaryBucket = "infantry" | "archers" | "cavalry";

export class ControlGroupStore {
  private groups: Map<number | string, number[]> = new Map();

  assignGroup(groupId: number | string, unitIds: number[]): void {
    const unique = Array.from(new Set(unitIds.filter((id) => typeof id === "number")));
    this.groups.set(groupId, unique);
  }

  selectGroup(groupId: number | string, units?: any[]): number[] {
    const ids = this.groups.get(groupId) ?? [];
    if (!Array.isArray(units)) {
      return [...ids];
    }
    const aliveIds = new Set(
      units.filter((u) => u && (u.hp === undefined || u.hp > 0)).map((u) => u.id)
    );
    const valid = ids.filter((id) => aliveIds.has(id));
    this.groups.set(groupId, valid);
    const validSet = new Set(valid);
    for (const u of units) {
      if (u && typeof u.id === "number") {
        u.selected = validSet.has(u.id);
      }
    }
    return valid;
  }

  autoBucketMilitary(
    units: any[],
    team?: any
  ): { infantry: number[]; archers: number[]; cavalry: number[] } {
    const infantry: number[] = [];
    const archers: number[] = [];
    const cavalry: number[] = [];

    for (const u of units || []) {
      if (!u || typeof u.id !== "number") continue;
      if (team !== undefined && u.team !== team) continue;
      if (u.hp !== undefined && u.hp <= 0) continue;
      const t = String(u.type || "").toLowerCase();
      if (t === "villager" || t === "") continue;

      if (
        t.includes("cavalry") ||
        t.includes("elephant") ||
        t.includes("horse") ||
        t.includes("knight") ||
        t.includes("lancer")
      ) {
        cavalry.push(u.id);
      } else if (
        t.includes("archer") ||
        t.includes("bow") ||
        t.includes("crossbow") ||
        t.includes("ranged")
      ) {
        archers.push(u.id);
      } else {
        infantry.push(u.id);
      }
    }

    this.assignGroup("infantry", infantry);
    this.assignGroup("archers", archers);
    this.assignGroup("cavalry", cavalry);
    this.assignGroup(1, infantry);
    this.assignGroup(2, archers);
    this.assignGroup(3, cavalry);

    return { infantry, archers, cavalry };
  }
}
