import type { PathPt } from "./pathfinding";
import type { FactionId, ResourceKey, ResourcePool } from "./types";

const resources: ResourceKey[] = ["food", "wood", "gold", "stone"];
const factions: FactionId[] = ["trung_nguyen", "bac_cuong", "dai_viet"];
const production: Record<string, string> = {
  swordsman: "barracks", spearman: "barracks", archer: "archery_range", chuko_nu: "archery_range",
  cavalry: "stable", horse_archer: "stable", war_elephant: "stable", catapult: "siege_workshop"
};
const minimumAgeTime = [0, 145, 350, 620];
const pressure = {
  easy: { opening: 210, interval: 155, group: 5, reserve: 3, workers: 13 },
  normal: { opening: 165, interval: 115, group: 8, reserve: 3, workers: 16 },
  hard: { opening: 125, interval: 85, group: 11, reserve: 3, workers: 19 }
};

type Order = "scout" | "raid" | "assault" | "defend" | "retreat";
type Plan = "raid" | "assault" | "siege";
type Team = "player" | "enemy";
type Tile = { tx: number; ty: number };
type Unit = PathPt & {
  id: number; team: Team; aiIndex?: number; type: string; hp: number; maxHp: number;
  task: string; path: PathPt[]; targetEntityId: number | null; targetTile?: Tile | null;
  garrisoned?: boolean; buildTargetId?: number | null; carryAmt?: number; amDest?: PathPt | null;
  wave?: boolean; repathCd?: number; aiOrder?: Order; aiOrderUntil?: number;
};
type Building = Tile & {
  id: number; team: Team; aiIndex?: number; type: string; size: number; hp: number; maxHp: number;
  progress?: number; trainQueue?: { type: string; remaining: number; total: number }[];
};
type Intel = PathPt & { seenAt: number };
interface Brain {
  idx: number;
  age: number;
  factionId?: FactionId;
  bank?: ResourcePool;
  nextAttack?: number;
  scoutStep?: number;
  lastPlan?: Plan;
  intel?: Intel;
  opposition?: { seenAt: number; forts: number; cavalry: number; ranged: number; infantry: number };
}
interface Match {
  difficulty: string;
  mapSize: number;
  mapSeed?: number;
  grid: { terrain: string; res: ResourceKey | null; resAmt: number }[][];
  units: Unit[];
  buildings: Building[];
  aiStates: Brain[];
  stats?: { elapsedSec: number };
  aiWave?: number;
  aiNextThink?: number;
  aiTurn?: number;
  aiLastAttack?: number;
}
interface Rules {
  unitDefs: Record<string, { age: number; vision: number; role: string; range: number; cost: ResourcePool; factionOnly?: FactionId }>;
  buildingDefs: Record<string, { age: number; vision: number; size: number; cost: ResourcePool; pop: number; atk?: number }>;
  ages: { cost: ResourcePool }[];
  trainTimes: Record<string, number>;
  path: (sx: number, sy: number, gx: number, gy: number, team: Team) => PathPt[];
  blocked: (x: number, y: number) => boolean;
  build: (type: string, x: number, y: number, index: number) => Building;
  notify: (message: string) => void;
}

const distance = (a: PathPt, b: PathPt) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (b: Building): PathPt => ({ x: b.tx + b.size / 2, y: b.ty + b.size / 2 });
const ready = (b: Building) => (b.progress ?? 1) >= 1;
const own = (entity: Building | Unit, index: number) => entity.team === "enemy" && (entity.aiIndex ?? 0) === index;
const targetPoint = (target: Unit | Building) => "x" in target ? target : point(target);

export function budget(state: Match, index: number): ResourcePool {
  let brain = state.aiStates.find(item => item.idx === index + 1);
  if (!brain) {
    brain = { idx: index + 1, age: 1 };
    state.aiStates.push(brain);
  }
  brain.factionId ??= factions[index % factions.length];
  // Old saves have an AI age but no economy. Seed each missing bank once.
  return brain.bank ??= { food: 200, wood: 200, gold: 50, stone: 100 };
}

const afford = (bank: ResourcePool, cost: ResourcePool) => resources.every(r => bank[r] >= cost[r]);
function pay(bank: ResourcePool, cost: ResourcePool) {
  for (const r of resources) bank[r] -= cost[r];
}

function route(rules: Rules, unit: Unit, goal: PathPt) {
  const path = rules.path(unit.x, unit.y, goal.x, goal.y, "enemy");
  // Reject a route that only reaches the open tile beside a blocked objective.
  if (distance(path[path.length - 1] ?? unit, goal) > 0.9) return null;
  return path;
}

function move(rules: Rules, unit: Unit, goal: PathPt, order: Order, until: number) {
  const offsets = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]];
  let path = null;
  for (const [dx, dy] of offsets) {
    const next = { x: goal.x + dx, y: goal.y + dy };
    if (rules.blocked(Math.floor(next.x), Math.floor(next.y))) continue;
    path = route(rules, unit, next);
    if (path) break;
  }
  if (!path) return false;
  unit.task = "move";
  unit.path = path;
  unit.targetEntityId = null;
  unit.amDest = null;
  unit.aiOrder = order;
  unit.aiOrderUntil = until;
  return true;
}

function attack(unit: Unit, target: Unit | Building, order: Order, until: number) {
  if (unit.targetEntityId !== target.id) {
    unit.targetEntityId = target.id;
    unit.path = [];
    unit.repathCd = (unit.id % 7) * 0.055;
  }
  unit.task = "attack";
  unit.amDest = null;
  unit.aiOrder = order;
  unit.aiOrderUntil = until;
}

function train(b: Building, type: string, bank: ResourcePool, rules: Rules) {
  const cost = rules.unitDefs[type].cost;
  if (!afford(bank, cost)) return false;
  pay(bank, cost);
  const seconds = rules.trainTimes[type] ?? 7;
  (b.trainQueue ??= []).push({ type, remaining: seconds, total: seconds });
  return true;
}

function construction(state: Match, rules: Rules, base: Building, buildings: Building[], workers: Unit[], type: string, bank: ResourcePool, threat: PathPt | null) {
  const def = rules.buildingDefs[type];
  const builder = workers.filter(u => !u.carryAmt && u.task !== "build" && u.task !== "return" && u.aiOrder !== "retreat")
    .sort((a, b) => distance(a, point(base)) - distance(b, point(base)))[0];
  if (!builder || !afford(bank, def.cost)) return false;
  const candidates: (Tile & { score: number })[] = [];
  const home = point(base);
  for (let ty = base.ty - 7; ty <= base.ty + 7; ty++) {
    for (let tx = base.tx - 7; tx <= base.tx + 7; tx++) {
      let valid = true;
      for (let y = ty; y < ty + def.size && valid; y++) {
        for (let x = tx; x < tx + def.size; x++) {
          const cell = state.grid[y]?.[x];
          if (!cell || cell.res || cell.terrain === "bridge" || rules.blocked(x, y) ||
              buildings.some(b => b.type === "farm" && b.tx === x && b.ty === y)) { valid = false; break; }
        }
      }
      if (!valid) continue;
      if (builder.x >= tx && builder.x < tx + def.size && builder.y >= ty && builder.y < ty + def.size) continue;
      const center = { x: tx + def.size / 2, y: ty + def.size / 2 };
      const d = distance(center, home);
      if (d < 3 || d > 8) continue;
      const score = threat && type === "watch_tower" ? distance(center, threat) + d * 0.4 : d + distance(center, builder) * 0.4;
      candidates.push({ tx, ty, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  for (const { tx, ty } of candidates.slice(0, 8)) {
    const edge = [
      { x: tx - 0.5, y: ty + 0.5 }, { x: tx + def.size + 0.5, y: ty + 0.5 },
      { x: tx + 0.5, y: ty - 0.5 }, { x: tx + 0.5, y: ty + def.size + 0.5 }
    ].filter(p => !rules.blocked(Math.floor(p.x), Math.floor(p.y)));
    edge.sort((a, b) => distance(a, builder) - distance(b, builder));
    for (const goal of edge.slice(0, 2)) {
      const path = route(rules, builder, goal);
      const entersFootprint = path?.some(p => p.x >= tx && p.x < tx + def.size && p.y >= ty && p.y < ty + def.size);
      if (!path || entersFootprint) continue;
      const b = rules.build(type, tx, ty, base.aiIndex ?? 0);
      pay(bank, def.cost);
      builder.task = "build";
      builder.buildTargetId = b.id;
      builder.targetTile = null;
      builder.path = path;
      return true;
    }
  }
  return false;
}

function gather(state: Match, rules: Rules, base: Building, buildings: Building[], workers: Unit[], bank: ResourcePool, now: number, nextAge?: ResourcePool) {
  const assigned: ResourcePool = { food: 0, wood: 0, gold: 0, stone: 0 };
  const occupancy = new Map<number, number>();
  const tileKey = ({ tx, ty }: Tile) => ty * state.mapSize + tx;
  const cellResource = (tile: Tile) => state.grid[tile.ty]?.[tile.tx]?.res;
  const farms = buildings.filter(b => b.type === "farm" && ready(b));
  for (const u of workers) {
    if (!u.targetTile || (u.task !== "gather" && u.task !== "return")) continue;
    const r = cellResource(u.targetTile) ?? (farms.some(b => b.tx === u.targetTile?.tx && b.ty === u.targetTile.ty) ? "food" : null);
    if (r) {
      assigned[r]++;
      const key = tileKey(u.targetTile);
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
    }
  }
  const idle = workers.filter(u => u.task === "idle" && (u.aiOrderUntil ?? 0) <= now);
  if (!idle.length) return;
  const home = point(base);
  const goalStock: ResourcePool = { food: 190, wood: 140, gold: 85, stone: 55 };
  const tiles: (Tile & { res: ResourceKey })[] = farms.map(b => ({ tx: b.tx, ty: b.ty, res: "food" }));
  for (let ty = Math.max(0, base.ty - 21); ty <= Math.min(state.mapSize - 1, base.ty + 21); ty++) {
    for (let tx = Math.max(0, base.tx - 21); tx <= Math.min(state.mapSize - 1, base.tx + 21); tx++) {
      const cell = state.grid[ty][tx];
      if (cell.res && cell.resAmt > 0 && !rules.blocked(tx, ty)) tiles.push({ tx, ty, res: cell.res });
    }
  }
  for (const u of idle.slice(0, 3)) {
    const ranked = tiles.map(tile => {
      const goal = { x: tile.tx + 0.5, y: tile.ty + 0.5 };
      const target = Math.max(goalStock[tile.res], nextAge?.[tile.res] ?? 0);
      const need = Math.max(-1.5, (target - bank[tile.res]) / target);
      const crowded = occupancy.get(tileKey(tile)) ?? 0;
      return { tile, goal, score: need * 14 - assigned[tile.res] * 3 - crowded * 7 - distance(goal, home) * 0.6 - distance(goal, u) * 0.22 };
    }).sort((a, b) => b.score - a.score);
    for (const { tile, goal } of ranked.slice(0, 8)) {
      const path = route(rules, u, goal);
      if (!path) continue;
      u.task = "gather";
      u.targetTile = { tx: tile.tx, ty: tile.ty };
      u.aiOrder = undefined;
      u.path = path;
      assigned[tile.res]++;
      const key = tileKey(tile);
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
      break;
    }
  }
}

function pickStrategy(brain: Brain, seed: number, wave: number, workers: number, defenses: number, army: number): Plan {
  if (defenses >= 2 && brain.age >= 3) return "siege";
  if (workers >= 2 && army <= 3 && defenses <= 1) return "raid";
  const sequence: Plan[] = ["assault", "raid", "siege"];
  const variation = ((seed >>> 0) + brain.idx + wave) % sequence.length;
  const plan = sequence[variation];
  if (plan === "siege" && brain.age < 3) return "assault";
  if (plan === brain.lastPlan && defenses === 0) return plan === "raid" ? "assault" : "raid";
  return plan;
}

export function step(state: Match, rules: Rules) {
  const now = state.stats?.elapsedSec ?? 0;
  if (now < (state.aiNextThink ?? 0)) return;
  state.aiNextThink = now + 0.65;
  const bases = state.buildings.filter(b => b.team === "enemy" && b.type === "town_center" && b.hp > 0);
  if (!bases.length) return;
  const turn = state.aiTurn ?? 0;
  const base = bases[turn % bases.length];
  state.aiTurn = (turn + 1) % bases.length;
  const index = base.aiIndex ?? 0;
  const bank = budget(state, index);
  const brain = state.aiStates.find(b => b.idx === index + 1)!;
  const pace = pressure[state.difficulty as keyof typeof pressure] ?? pressure.normal;
  const home = point(base);
  const buildings = state.buildings.filter(b => own(b, index) && b.hp > 0);
  const units = state.units.filter(u => own(u, index) && u.hp > 0 && !u.garrisoned);
  const workers = units.filter(u => u.type === "villager");
  const army = units.filter(u => u.type !== "villager");
  const playerUnits = state.units.filter(u => u.team === "player" && u.hp > 0 && !u.garrisoned);
  const observers = [
    ...units.map(u => ({ pos: u, vision: rules.unitDefs[u.type].vision })),
    ...buildings.filter(ready).map(b => ({ pos: point(b), vision: rules.buildingDefs[b.type].vision }))
  ];
  const seen = (p: PathPt) => observers.some(o => distance(o.pos, p) <= o.vision);
  const visibleUnits = playerUnits.filter(seen);
  const visibleBuildings = state.buildings.filter(b => b.team === "player" && b.hp > 0 && seen(point(b)));
  const primary = visibleBuildings.find(b => b.type === "town_center") ?? visibleBuildings[0];
  if (primary) brain.intel = { ...point(primary), seenAt: now };
  const invaders = visibleUnits.filter(u => u.type !== "villager" && distance(home, u) < 11);
  const threat = invaders[0] ?? null;
  const memory = brain.opposition && now - brain.opposition.seenAt < 95 ? brain.opposition : undefined;
  const forts = visibleBuildings.length ? visibleBuildings.filter(b => rules.buildingDefs[b.type].atk && b.type !== "town_center").length : memory?.forts ?? 0;
  const spottedArmy = visibleUnits.filter(u => u.type !== "villager");
  const cavalry = spottedArmy.length ? spottedArmy.filter(u => ["cavalry", "elephant"].includes(rules.unitDefs[u.type].role)).length : memory?.cavalry ?? 0;
  const ranged = spottedArmy.length ? spottedArmy.filter(u => rules.unitDefs[u.type].range > 3).length : memory?.ranged ?? 0;
  const infantry = spottedArmy.length ? spottedArmy.filter(u => rules.unitDefs[u.type].role === "infantry").length : memory?.infantry ?? 0;
  if (visibleBuildings.length || spottedArmy.length) brain.opposition = { seenAt: now, forts, cavalry, ranged, infantry };
  const exposed = visibleUnits.filter(u => u.type === "villager" &&
    !visibleBuildings.some(b => rules.buildingDefs[b.type].atk && distance(point(b), u) < 6));
  const plan = pickStrategy(brain, state.mapSeed ?? 0, state.aiWave ?? 0, exposed.length, forts, invaders.length);
  const rally = { x: home.x + (home.x < state.mapSize / 2 ? 3.5 : -3.5), y: home.y + (home.y < state.mapSize / 2 ? 2.5 : -2.5) };

  for (const u of units) {
    if (u.wave) { u.wave = false; u.task = "idle"; u.path = []; u.targetEntityId = null; }
    if (u.aiOrder && (u.aiOrderUntil ?? 0) <= now) {
      u.aiOrder = undefined;
      u.targetEntityId = null;
      u.task = "idle";
      u.path = [];
    }
  }
  for (const u of workers) {
    if (u.aiOrder !== "retreat" && invaders.some(o => distance(o, u) < 3.5)) {
      if (move(rules, u, rally, "retreat", now + 7)) {
        u.targetTile = null;
        u.buildTargetId = null;
      }
    }
  }
  for (const u of army) {
    if (u.aiOrder === "retreat") continue;
    const nearby = visibleUnits.filter(o => o.type !== "villager" && distance(u, o) < 5);
    const allied = army.filter(o => distance(o, u) < 5).length;
    if (u.hp < u.maxHp * 0.45 && nearby.length >= allied && distance(u, home) > 5 &&
        move(rules, u, rally, "retreat", now + 13)) continue;
    if (threat && (distance(u, home) < 14 || u.aiOrder === "scout")) {
      const target = invaders.reduce((best, o) => distance(u, o) < distance(u, best) ? o : best, threat);
      attack(u, target, "defend", now + 7);
    } else if ((u.aiOrder === "raid" || u.aiOrder === "assault") && nearby.length) {
      const target = nearby.reduce((best, o) => distance(u, o) < distance(u, best) ? o : best);
      if (u.type !== "catapult" || !visibleBuildings.length || distance(u, target) < 2) {
        attack(u, target, u.aiOrder, u.aiOrderUntil ?? now);
      }
    } else if ((u.aiOrder === "raid" || u.aiOrder === "assault") && u.task === "idle") {
      const target = u.aiOrder === "raid" ? exposed[0] ?? primary : primary;
      if (target) attack(u, target, u.aiOrder, u.aiOrderUntil ?? now);
    }
  }

  const nextAge = rules.ages[brain.age];
  const saveForAge = nextAge && now + 30 >= minimumAgeTime[brain.age] && workers.length >= 6 &&
    (brain.age !== 1 || buildings.some(b => b.type === "barracks" && ready(b))) && !threat;
  if (saveForAge && now >= minimumAgeTime[brain.age] && afford(bank, nextAge.cost)) {
    pay(bank, nextAge.cost);
    brain.age++;
    rules.notify(`Phe AI ${brain.idx} đã tiến lên Đời ${brain.age}!`);
  }

  const cap = Math.min(70, buildings.filter(ready).reduce((sum, b) => sum + rules.buildingDefs[b.type].pop, 0));
  let population = units.length + buildings.reduce((sum, b) => sum + (b.trainQueue?.length ?? 0), 0);
  const has = (type: string) => buildings.some(b => b.type === type);
  const special = Object.keys(production).find(type => rules.unitDefs[type].factionOnly === brain.factionId);
  const priority = [
    ...(cavalry > 0 ? ["spearman"] : []),
    ...(forts > 0 || plan === "siege" ? ["catapult"] : []),
    ...(ranged > infantry || plan === "raid" ? ["cavalry"] : []),
    ...(infantry > 0 ? ["archer"] : []),
    ...(special ? [special] : []), "archer", "swordsman", "spearman", "cavalry", "catapult"
  ].filter(type => brain.age >= rules.unitDefs[type].age);
  if (population < cap && workers.length < pace.workers && !base.trainQueue?.length &&
      (workers.length < 7 || !saveForAge) && train(base, "villager", bank, rules)) population++;
  const siegeNeeded = brain.age >= 3 && (forts > 0 || plan === "siege") && !army.some(u => u.type === "catapult");
  const missingWorkshop = siegeNeeded && !has("siege_workshop");
  const workshopCost = rules.buildingDefs.siege_workshop.cost;
  if (population < cap && (army.length < pace.group * 2 + pace.reserve || siegeNeeded) &&
      (!saveForAge || army.length < 4 || threat) && (!missingWorkshop || army.length < 4 || threat)) {
    const usable = priority.filter(type => afford(bank, rules.unitDefs[type].cost) &&
      buildings.some(b => b.type === production[type] && ready(b) && !b.trainQueue?.length));
    const pick = usable.reduce<string | null>((best, type) => {
      const score = (key: string) => priority.indexOf(key) + 1.8 * army.filter(u => u.type === key).length;
      if (siegeNeeded && type === "catapult") return type;
      if (siegeNeeded && best === "catapult") return best;
      return !best || score(type) < score(best) ? type : best;
    }, null);
    const facility = pick && buildings.find(b => b.type === production[pick] && ready(b) && !b.trainQueue?.length);
    if (pick && facility && train(facility, pick, bank, rules)) population++;
  }
  const foundation = buildings.find(b => !ready(b));
  if (foundation && !workers.some(u => u.buildTargetId === foundation.id)) {
    const builder = workers.find(u => u.task === "idle" || (u.task === "gather" && !u.carryAmt));
    if (builder) {
      builder.task = "build"; builder.path = []; builder.buildTargetId = foundation.id; builder.targetTile = null;
    }
  } else if (!foundation) {
    const structure = !has("barracks") ? "barracks"
      : population >= cap - 1 && cap < 70 ? "house"
      : threat && brain.age >= 2 && !has("watch_tower") ? "watch_tower"
      : missingWorkshop && !saveForAge ? "siege_workshop"
      : !saveForAge ? priority.map(type => production[type]).find(type => !has(type))
        ?? (brain.age === 4 && !has("imperial_citadel") ? "imperial_citadel" : undefined)
      : undefined;
    const farmCount = buildings.filter(b => b.type === "farm").length;
    const farm = workers.length >= 5 && farmCount < Math.min(7, Math.ceil(workers.length / 3)) &&
      (bank.food < 110 || (saveForAge && bank.food < nextAge.cost.food));
    if (!structure || !construction(state, rules, base, buildings, workers, structure, bank, threat)) {
      if (farm && (!saveForAge || bank.wood >= 80) && (!missingWorkshop || bank.wood >= workshopCost.wood)) {
        construction(state, rules, base, buildings, workers, "farm", bank, null);
      }
    }
  }
  gather(state, rules, base, buildings, workers, bank, now, saveForAge ? nextAge.cost : undefined);

  const available = army.filter(u => !u.aiOrder && u.task !== "attack" && u.hp > u.maxHp * 0.45);
  brain.nextAttack ??= pace.opening + index * 20;
  const edge = state.mapSize >= 96 ? 13.5 : state.mapSize >= 64 ? 11.5 : 10.5;
  const far = state.mapSize - edge;
  const corners = [{ x: edge, y: edge }, { x: far, y: edge }, { x: edge, y: far }, { x: far, y: far }]
    .filter(p => !bases.some(b => distance(p, point(b)) < 14));
  const waypoints = [...corners, { x: state.mapSize / 2, y: state.mapSize / 2 }];
  const exploration = waypoints[(brain.scoutStep ?? 0) % waypoints.length];
  const objective = brain.intel && now - brain.intel.seenAt < 180 ? brain.intel : exploration;
  if (!threat && now > 70 && available.length > 1 && (!brain.intel || now - brain.intel.seenAt > 100) &&
      !army.some(u => u.aiOrder === "scout")) {
    brain.scoutStep = (brain.scoutStep ?? 0) + 1;
    move(rules, available[0], exploration, "scout", now + 85);
  }
  const count = available.filter(u => !u.aiOrder).length;
  const minimum = Math.min(pace.group, 2 + Math.floor(now / 200)) + pace.reserve;
  const spacing = pace.interval / Math.sqrt(bases.length);
  const groupLimit = Math.max(3, Math.round(pace.group / Math.sqrt(bases.length)));
  if (threat || now < brain.nextAttack || count < minimum || now - (state.aiLastAttack ?? -Infinity) < spacing) return;
  const order = plan === "raid" ? "raid" : "assault";
  const target = plan === "raid" ? exposed[0] ?? primary
    : plan === "siege" ? visibleBuildings.find(b => rules.buildingDefs[b.type].atk && b.type !== "town_center") ?? primary
    : visibleBuildings.find(b => b.type === "barracks" || b.type === "archery_range") ?? primary;
  const priorityForRaid = (u: Unit) => rules.unitDefs[u.type].role === "cavalry" ? 0 : u.type === "catapult" ? 2 : 1;
  const squad = available.filter(u => !u.aiOrder).sort((a, b) =>
    plan === "raid" ? priorityForRaid(a) - priorityForRaid(b) : 0);
  let sent = 0;
  for (const u of squad.slice(0, Math.min(count - pace.reserve, groupLimit))) {
    // Fast raiders approach the economy from the side when there is a walkable approach.
    const aim = target ? targetPoint(target) : objective;
    if (order === "raid" && rules.unitDefs[u.type].role === "cavalry" && distance(u, aim) > 14) {
      const dx = aim.x - home.x, dy = aim.y - home.y;
      const len = Math.hypot(dx, dy) || 1;
      const side = brain.idx % 2 === 0 ? -1 : 1;
      const flank = { x: aim.x - (dx + dy * side * 2) / len * 4, y: aim.y - (dy - dx * side * 2) / len * 4 };
      if (move(rules, u, flank, order, now + 100)) { sent++; continue; }
    }
    if (target) { attack(u, target, order, now + 100); sent++; }
    else if (move(rules, u, objective, order, now + 100)) sent++;
  }
  brain.nextAttack = now + (sent ? pace.interval : 20);
  if (sent) {
    brain.lastPlan = plan;
    state.aiLastAttack = now;
    state.aiWave = (state.aiWave ?? 0) + 1;
  }
}
