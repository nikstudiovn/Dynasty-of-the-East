export type ResourceKey = "food" | "wood" | "gold" | "stone";

export interface ResourcePool {
  food: number;
  wood: number;
  gold: number;
  stone: number;
}

export type FactionId = "dai_viet" | "trung_nguyen" | "bac_cuong" | "goryeo" | "fuso";

export type CommandAction =
  | "MOVE"
  | "GATHER"
  | "BUILD"
  | "TRAIN"
  | "ATTACK"
  | "ADVANCE_AGE";

export interface GameCommand {
  tick: number;
  playerId: string;
  action: CommandAction;
  unitIds?: number[];
  targetId?: string;
  tileX?: number;
  tileY?: number;
}

export interface PlayerState {
  id: string;
  factionId: FactionId;
  age: 1 | 2 | 3 | 4;
  resources: ResourcePool;
  population: number;
  populationCap: number;
}
