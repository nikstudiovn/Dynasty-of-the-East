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
export const FARM_MAX_WORKERS = 2;
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
  if (!farm || farm.depleted) return false;
  return currentWorkersCount < FARM_MAX_WORKERS;
}

export function replantFarm(state: any, farm: any, isAuto = false): boolean {
  if (!farm || farm.depleted !== true) return false;
  if (isAuto && !farm.autoReplant) return false;
  const baseWood = farm.woodCost ?? farm.buildCost?.wood ?? 60;
  const woodCost = Math.ceil(baseWood * FARM_REPLANT_WOOD_RATIO);
  const res = state?.resources;
  if (res) {
    if ((res.wood ?? 0) < woodCost) return false;
    res.wood -= woodCost;
  }
  farm.depleted = false;
  farm.built = true;
  farm.footprint = farm.footprint ?? FARM_FOOTPRINT;
  farm.food = farm.maxFood ?? 250;
  farm.autoReplant = Boolean(farm.autoReplant);
  return true;
}
