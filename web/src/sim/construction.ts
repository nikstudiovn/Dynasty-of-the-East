import { FARM_CAPACITY } from "./expansion";

export const BUILD_TIMES_SEC: Record<string, number> = {
  house: 7,
  farm: 6,
  depot: 7,
  wall: 6,
  gate: 8,
  barracks: 14,
  temple: 14,
  archery_range: 14,
  watch_tower: 12,
  blacksmith: 14,
  stable: 15,
  market: 16,
  town_center: 26,
  imperial_citadel: 30,
};

export const FARM_FOOTPRINT = 4;
export const FARM_MAX_WORKERS = 3;
export const FARM_GROWTH_SEC = 12;
export const REPAIR_WOOD_PER_HP = 0.15;
export const FARM_REPLANT_WOOD_RATIO = 0.5;

export function getBuildDuration(type: string): number {
  return BUILD_TIMES_SEC[type] ?? 10;
}

export function stepBuildingProgress(b: any, activeBuildersCount: number, dt: number): boolean {
  if (!b) return false;
  if (b.built) return true;
  if (activeBuildersCount <= 0 || dt <= 0) return false;
  const mult = 1 + 0.55 * Math.max(0, activeBuildersCount - 1);
  const duration = Math.max(0.1, b.buildDuration ?? getBuildDuration(b.type));
  b.progress = Math.min(1, (b.progress ?? 0) + (dt * mult) / duration);
  if (b.progress >= 1) {
    b.progress = 1;
    b.built = true;
    return true;
  }
  return false;
}

export interface PlaceBuildingOptions {
  state: any;
  building: any;
  cost?: Record<string, number>;
  selectedVillagerIds?: number[];
  activeBuildType?: string | null;
}

export function placeBuildingWithQueue(opts: PlaceBuildingOptions) {
  const { state, building } = opts;
  const selectedVillagerIds = [...(opts.selectedVillagerIds ?? state?.selectedVillagerIds ?? [])];
  const activeBuildType = opts.activeBuildType ?? state?.activeBuildType ?? building?.type ?? null;
  const cost: Record<string, number> = opts.cost ?? building?.buildCost ?? building?.cost ?? {};
  const res = state?.resources;

  if (res) {
    for (const [k, v] of Object.entries(cost)) {
      if ((res[k] ?? 0) < (v ?? 0)) {
        return { ok: false, selectedVillagerIds, activeBuildType, reason: "insufficient_resources" };
      }
    }
    for (const [k, v] of Object.entries(cost)) {
      res[k] = (res[k] ?? 0) - (v ?? 0);
    }
  }

  building.progress = building.progress ?? 0;
  building.built = building.built ?? false;
  building.buildDuration = building.buildDuration ?? getBuildDuration(building.type);
  building.buildCost = { ...cost };
  if (building.type === "farm") {
    building.footprint = building.footprint ?? FARM_FOOTPRINT;
    building.autoReplant = building.autoReplant ?? false;
  }

  if (Array.isArray(state?.buildings) && !state.buildings.includes(building)) {
    state.buildings.push(building);
  }

  if (Array.isArray(state?.units) && selectedVillagerIds.length > 0) {
    for (const u of state.units) {
      if (selectedVillagerIds.includes(u.id)) {
        if (!Array.isArray(u.buildQueue)) u.buildQueue = [];
        u.buildQueue.push(building.id);
      }
    }
  }

  if (state) {
    state.selectedVillagerIds = selectedVillagerIds;
    state.activeBuildType = activeBuildType;
  }

  return { ok: true, building, selectedVillagerIds, activeBuildType };
}

export function cancelQueuedBuilding(
  state: any,
  b: any,
  refundResources?: (state: any, cost: Record<string, number>) => void,
): boolean {
  if (!b || b.built) return false;
  const cost: Record<string, number> = b.buildCost ?? b.cost ?? {};
  if (typeof refundResources === "function") {
    refundResources(state, cost);
  } else if (state?.resources) {
    for (const [k, v] of Object.entries(cost)) {
      state.resources[k] = (state.resources[k] ?? 0) + (v ?? 0);
    }
  }

  if (Array.isArray(state?.buildings)) {
    const idx = state.buildings.indexOf(b);
    if (idx >= 0) state.buildings.splice(idx, 1);
  }
  if (Array.isArray(state?.units)) {
    for (const u of state.units) {
      if (Array.isArray(u.buildQueue)) {
        u.buildQueue = u.buildQueue.filter((id: any) => id !== b.id);
      }
    }
  }
  return true;
}

export function canAssignFarmWorker(farm: any, currentWorkersCount: number): boolean {
  if (!farm || farm.hp <= 0 || (farm.progress ?? 1) < 1) return false;
  return currentWorkersCount < FARM_MAX_WORKERS;
}

export function farmReplantWoodCost(farm: any): number {
  return Math.ceil((farm.woodCost ?? farm.buildCost?.wood ?? 60) * FARM_REPLANT_WOOD_RATIO);
}

export function replantFarm(state: any, farm: any, isAuto = false): boolean {
  if (!farm || (farm.progress ?? 1) < 1 || farm.hp <= 0 || (!farm.depleted && farm.cropAmount !== 0)) return false;
  if (isAuto && !(farm.autoReseed ?? farm.autoReplant)) return false;
  const woodCost = farmReplantWoodCost(farm);
  const res = state?.resources;
  if (res) {
    if ((res.wood ?? 0) < woodCost) return false;
    res.wood -= woodCost;
  }
  farm.depleted = false;
  farm.built = true;
  farm.footprint = farm.footprint ?? FARM_FOOTPRINT;
  const cap = farm.maxCrop ?? farm.maxFood ?? FARM_CAPACITY;
  farm.cropAmount = cap;
  farm.food = cap;
  farm.cropGrowth = 0;
  const autoFlag = Boolean(farm.autoReseed ?? farm.autoReplant);
  farm.autoReseed = autoFlag;
  farm.autoReplant = autoFlag;
  return true;
}
export function stepBuildingRepair(b: any, repairersCount: number, dt: number, speedMult = 1, maxHeal = Infinity): number {
  if (!b || (b.progress ?? (b.built === false ? 0 : 1)) < 1 || b.hp <= 0 || (b.maxHp ?? 0) <= 0 || (b.hp ?? 0) >= b.maxHp) return 0;
  if (repairersCount <= 0 || dt <= 0) return 0;
  const mult = (1 + 0.55 * Math.max(0, repairersCount - 1)) * Math.max(0.1, speedMult);
  const duration = Math.max(0.1, b.buildDuration ?? getBuildDuration(b.type));
  const prevHp = b.hp ?? 0;
  b.hp = Math.min(b.maxHp, prevHp + Math.min(maxHeal, (b.maxHp / duration) * 0.85 * mult * dt));
  return b.hp - prevHp;
}
