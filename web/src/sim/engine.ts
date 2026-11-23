import factionsJson from "../data/factions.json";
import unitsJson from "../data/units.json";
import { FactionId, GameCommand, PlayerState, ResourcePool } from "./types";

export class DeterministicEngine {
  public currentTick = 0;
  public readonly tickRateHz = factionsJson.matchConfig.tickRateHz;
  public readonly maxPopulation = factionsJson.matchConfig.maxPopulation;
  public readonly players = new Map<string, PlayerState>();
  private readonly commandQueue: GameCommand[] = [];

  public addPlayer(id: string, factionId: FactionId): PlayerState {
    const start = factionsJson.matchConfig.startingResources;
    const state: PlayerState = {
      id,
      factionId,
      age: 1,
      resources: { ...start },
      population: factionsJson.matchConfig.startingVillagers,
      populationCap: 10
    };
    this.players.set(id, state);
    return state;
  }

  public enqueueCommand(cmd: GameCommand): void {
    this.commandQueue.push(cmd);
  }

  public stepTick(): void {
    this.currentTick += 1;
    const ready = this.commandQueue.filter((c) => c.tick <= this.currentTick);
    for (const cmd of ready) {
      this.applyCommand(cmd);
    }
    this.pruneExecutedCommands();
  }

  private pruneExecutedCommands(): void {
    let i = this.commandQueue.length;
    while (i--) {
      if (this.commandQueue[i].tick <= this.currentTick) {
        this.commandQueue.splice(i, 1);
      }
    }
  }

  private canAfford(pool: ResourcePool, cost: ResourcePool): boolean {
    return (
      pool.food >= cost.food &&
      pool.wood >= cost.wood &&
      pool.gold >= cost.gold &&
      pool.stone >= cost.stone
    );
  }

  private spend(pool: ResourcePool, cost: ResourcePool): void {
    pool.food -= cost.food;
    pool.wood -= cost.wood;
    pool.gold -= cost.gold;
    pool.stone -= cost.stone;
  }

  private applyCommand(cmd: GameCommand): void {
    const player = this.players.get(cmd.playerId);
    if (!player) return;

    if (cmd.action === "TRAIN" && cmd.targetId) {
      const unitDef = unitsJson.units.find((u) => u.id === cmd.targetId);
      if (!unitDef) return;
      if (player.population >= Math.min(player.populationCap, this.maxPopulation)) return;
      if (this.canAfford(player.resources, unitDef.cost)) {
        this.spend(player.resources, unitDef.cost);
        player.population += 1;
      }
    }

    if (cmd.action === "ADVANCE_AGE" && player.age < 4) {
      const nextAge = factionsJson.ages.find((a) => a.age === player.age + 1);
      if (!nextAge) return;
      const faction = factionsJson.factions.find((f) => f.id === player.factionId);
      const discount = faction?.bonuses.ageUpCostMultiplier ?? 1;
      const adjusted: ResourcePool = {
        food: Math.round(nextAge.cost.food * discount),
        wood: Math.round(nextAge.cost.wood * discount),
        gold: Math.round(nextAge.cost.gold * discount),
        stone: Math.round(nextAge.cost.stone * discount)
      };
      if (this.canAfford(player.resources, adjusted)) {
        this.spend(player.resources, adjusted);
        player.age = (player.age + 1) as 1 | 2 | 3 | 4;
      }
    }
  }
}
