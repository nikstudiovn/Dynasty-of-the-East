import { footprintOf } from "./footprint";
import type { BasePos, ValleyCell } from "./valley";

const SAFE_FISH_STOCK = 180;
const CONTESTED_FISH_STOCK = 420;

function openWater(cell: ValleyCell): void {
  cell.terrain = "water";
  cell.waterDepth = "deep";
  cell.elev = 0;
  delete cell.bridge;
}

export function makeDelta(grid: ValleyCell[][]): void {
  const n = grid.length, middle = n / 2;
  const halfWidth = Math.max(4, Math.round(n / 12));
  for (let x = 0; x < n; x++) {
    const offset = Math.round(Math.cos((x + 0.5 - middle) * Math.PI / middle) * 2);
    for (let y = middle - halfWidth + offset; y < middle + halfWidth + offset; y++) {
      openWater(grid[y][x]);
    }
  }
}

export function makeDeltaBridges(grid: ValleyCell[][]): void {
  const n = grid.length;
  for (const x of [0.33, 0.5, 0.67].map(ratio => Math.round(ratio * n))) {
    for (let y = n / 2 - Math.ceil(n / 12) - 3; y <= n / 2 + Math.ceil(n / 12) + 3; y++) {
      const cell = grid[y][x];
      if (cell.terrain === "water" && cell.waterDepth === "deep") {
        cell.terrain = "bridge";
        cell.bridge = "v";
        delete cell.waterDepth;
      }
    }
  }
}

/** Six-tile inlets open into the main channel, with identical dock frontage and fish per base. */
export function addHomeInlets(grid: ValleyCell[][], bases: readonly BasePos[]): void {
  const n = grid.length, { h } = footprintOf("town_center");
  for (const base of bases) {
    const south = base.ty > n / 2;
    const dy = south ? -1 : 1;
    const outerY = base.ty + (south ? h - 1 : 0);
    const bankY = outerY + dy * 8;
    const firstWater = bankY + dy;
    const middle = n / 2;
    for (let x = base.tx - 1; x <= base.tx + 4; x++) {
      const bank = grid[bankY][x];
      Object.assign(bank, { terrain: "dirt", elev: 0, dockReserve: true });
      delete bank.waterDepth;
      delete bank.bridge;
      for (let y = firstWater; south ? y >= middle - 1 : y <= middle; y += dy) {
        openWater(grid[y][x]);
      }
    }
    for (const x of [base.tx, base.tx + 3]) {
      for (const distance of [1, 3]) {
        grid[firstWater + distance * dy][x].fish = SAFE_FISH_STOCK;
      }
    }
  }
}

export function addContestedFish(grid: ValleyCell[][]): void {
  const n = grid.length, middle = n / 2;
  for (const x of [-8, -5, 5, 8].map(dx => middle + dx)) {
    for (const y of [middle - 2, middle + 2]) {
      const cell = grid[y][x];
      if (cell.terrain === "water" && cell.waterDepth === "deep" && !cell.fish) cell.fish = CONTESTED_FISH_STOCK;
    }
  }
}
