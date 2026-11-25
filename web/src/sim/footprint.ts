// Dynasty of the East — rectangular building footprints (width X × height Y, in tiles).
// One source of truth shared by placement preview, collision, pathing, terrain pads, models and spawn points.
export interface Footprint { w: number; h: number }
type Rect = { tx: number; ty: number; w?: number; h?: number; size?: number };

/** New buildings only. Everything else stays square (its `size`). Saved games keep their stored square size. */
export const FOOTPRINTS: Record<string, Footprint> = {
  farm: { w: 4, h: 4 },
  town_center: { w: 4, h: 4 },
  barracks: { w: 3, h: 4 },
};

export function footprintOf(type: string, size = 1): Footprint {
  return FOOTPRINTS[type] ?? { w: size, h: size };
}
export const fw = (b: Rect): number => b.w ?? b.size ?? 1;
export const fh = (b: Rect): number => b.h ?? b.size ?? 1;
export const fcx = (b: Rect): number => b.tx + fw(b) / 2;
export const fcy = (b: Rect): number => b.ty + fh(b) / 2;
/** Longest side: used for model fitting, reach and legacy `size` readers. */
export const fmax = (b: Rect): number => Math.max(fw(b), fh(b));
export const inFoot = (b: Rect, x: number, y: number): boolean =>
  x >= b.tx && x < b.tx + fw(b) && y >= b.ty && y < b.ty + fh(b);

/** Tiles in the one-tile ring around the footprint (corners included), in a stable order. */
export function ringTiles(b: Rect): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = b.ty - 1; y <= b.ty + fh(b); y++) for (let x = b.tx - 1; x <= b.tx + fw(b); x++) {
    if (!inFoot(b, x, y)) out.push({ x, y });
  }
  return out;
}
/** Edge-adjacent tiles only (4-neighbour ring, no corners): where a worker can actually touch the wall. */
export function edgeTiles(b: Rect): { x: number; y: number }[] {
  return ringTiles(b).filter(t => (t.x >= b.tx && t.x < b.tx + fw(b)) || (t.y >= b.ty && t.y < b.ty + fh(b)));
}

/** Euclidean distance from a point to the footprint rectangle (0 when inside). */
export function footDist(b: Rect, x: number, y: number): number {
  const dx = Math.max(b.tx - x, 0, x - (b.tx + fw(b)));
  const dy = Math.max(b.ty - y, 0, y - (b.ty + fh(b)));
  return Math.hypot(dx, dy);
}
