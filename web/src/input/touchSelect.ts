// Dynasty of the East – Touch & Mouse Double-Tap / Box-Select Controller

export const DOUBLE_TAP_RADIUS = 7;
export const DOUBLE_TAP_MS = 350;

export interface SelectableUnit {
  id?: string | number;
  type: string;
  team: string | number;
  x: number;
  y: number;
  hp?: number;
  alive?: boolean;
  garrisoned?: boolean;
}

export interface BoxSelectRect {
  left: number;
  top: number;
  width: number;
  height: number;
  active: boolean;
}

export interface TouchSelectOptions<T extends SelectableUnit = SelectableUnit> {
  element: HTMLElement;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number } | null;
  getUnits: () => readonly T[];
  getPlayerTeam: () => T["team"];
  onSelectUnits: (units: T[]) => void;
  findUnitAt?: (worldX: number, worldY: number) => T | null | undefined;
  boxOverlayEl?: HTMLElement | null;
  onBoxSelectChange?: (rect: BoxSelectRect | null) => void;
  isBoxSelectToggleActive?: () => boolean;
  doubleTapMs?: number;
  tapMaxDistPx?: number;
  dragThresholdPx?: number;
  radius?: number;
}

export interface TouchSelectController {
  isBoxSelecting: () => boolean;
  destroy: () => void;
}

function isUnitAlive(u: SelectableUnit): boolean {
  return (u.hp === undefined || u.hp > 0) && u.alive !== false && !u.garrisoned;
}

export function selectSameTypeNearby<T extends SelectableUnit>(
  units: readonly T[],
  anchor: T,
  radius = DOUBLE_TAP_RADIUS,
): T[] {
  const r2 = radius * radius;
  return units.filter((u) => {
    if (!isUnitAlive(u)) return false;
    if (u.team !== anchor.team || u.type !== anchor.type) return false;
    const dx = u.x - anchor.x;
    const dy = u.y - anchor.y;
    return dx * dx + dy * dy <= r2;
  });
}

export function selectInWorldBox<T extends SelectableUnit>(
  units: readonly T[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  team: T["team"],
): T[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  return units.filter((u) => {
    if (!isUnitAlive(u) || u.team !== team) return false;
    return u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY;
  });
}

function isBtnBoxSelectActive(): boolean {
  if (typeof document === "undefined") return false;
  const btn = document.getElementById("btn-box-select");
  if (!btn) return false;
  return (
    btn.classList.contains("active") ||
    btn.getAttribute("aria-pressed") === "true" ||
    btn.getAttribute("data-active") === "true"
  );
}

export function createTouchSelectController<T extends SelectableUnit = SelectableUnit>(
  opts: TouchSelectOptions<T>,
): TouchSelectController {
  const doubleTapMs = opts.doubleTapMs ?? DOUBLE_TAP_MS;
  const tapMaxDistPx = opts.tapMaxDistPx ?? 16;
  const dragThresholdPx = opts.dragThresholdPx ?? 8;
  const radius = opts.radius ?? DOUBLE_TAP_RADIUS;

  const activePointers = new Set<number>();
  let trackingPointerId: number | null = null;
  let lastTap: { time: number; unit: T; pointerType: string } | null = null;
  let isToggleBoxMode = false;
  let isDraggingBox = false;
  let startClientX = 0;
  let startClientY = 0;

  const updateOverlay = (rect: BoxSelectRect | null) => {
    if (opts.boxOverlayEl) {
      if (!rect || !rect.active) {
        opts.boxOverlayEl.style.display = "none";
      } else {
        opts.boxOverlayEl.style.display = "block";
        opts.boxOverlayEl.style.left = `${rect.left}px`;
        opts.boxOverlayEl.style.top = `${rect.top}px`;
        opts.boxOverlayEl.style.width = `${rect.width}px`;
        opts.boxOverlayEl.style.height = `${rect.height}px`;
      }
    }
    opts.onBoxSelectChange?.(rect);
  };

  const resetGesture = () => {
    trackingPointerId = null;
    isToggleBoxMode = false;
    if (isDraggingBox) {
      isDraggingBox = false;
      updateOverlay(null);
    }
  };

  const findFallbackUnit = (worldX: number, worldY: number): T | undefined => {
    const units = opts.getUnits();
    let best: T | undefined;
    let bestDist2 = 1.2 * 1.2;
    for (const u of units) {
      if (!isUnitAlive(u) || u.team !== opts.getPlayerTeam()) continue;
      const dx = u.x - worldX;
      const dy = u.y - worldY;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDist2) {
        bestDist2 = d2;
        best = u;
      }
    }
    return best;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    activePointers.add(e.pointerId);

    if (activePointers.size > 1) {
      lastTap = null;
      resetGesture();
      return;
    }

    trackingPointerId = e.pointerId;
    startClientX = e.clientX;
    startClientY = e.clientY;
    isDraggingBox = false;

    const toggleActive = opts.isBoxSelectToggleActive
      ? opts.isBoxSelectToggleActive()
      : isBtnBoxSelectActive();

    if (toggleActive) {
      isToggleBoxMode = true;
      lastTap = null;
      return;
    }

    isToggleBoxMode = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== trackingPointerId || activePointers.size !== 1) return;
    if (!isToggleBoxMode) return;

    const dx = e.clientX - startClientX;
    const dy = e.clientY - startClientY;
    if (!isDraggingBox && dx * dx + dy * dy >= dragThresholdPx * dragThresholdPx) {
      isDraggingBox = true;
    }

    if (isDraggingBox) {
      const left = Math.min(startClientX, e.clientX);
      const top = Math.min(startClientY, e.clientY);
      const width = Math.abs(e.clientX - startClientX);
      const height = Math.abs(e.clientY - startClientY);
      updateOverlay({ left, top, width, height, active: true });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (e.pointerId !== trackingPointerId) return;

    if (isDraggingBox) {
      const w0 = opts.screenToWorld(startClientX, startClientY);
      const w1 = opts.screenToWorld(e.clientX, e.clientY);
      if (w0 && w1) {
        const selected = selectInWorldBox(
          opts.getUnits(),
          w0.x,
          w0.y,
          w1.x,
          w1.y,
          opts.getPlayerTeam(),
        );
        opts.onSelectUnits(selected);
      }
      lastTap = null;
      resetGesture();
      return;
    }

    const distance = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
    const world = !isToggleBoxMode && distance < Math.min(tapMaxDistPx, dragThresholdPx)
      ? opts.screenToWorld(e.clientX, e.clientY) : null;
    const anchor = world ? opts.findUnitAt?.(world.x, world.y) ?? findFallbackUnit(world.x, world.y) : null;
    if (anchor && isUnitAlive(anchor) && anchor.team === opts.getPlayerTeam()) {
      const now = performance.now();
      const sameUnit = lastTap && (lastTap.unit === anchor || anchor.id != null && lastTap.unit.id === anchor.id);
      if (sameUnit && lastTap && lastTap.pointerType === e.pointerType && now - lastTap.time <= doubleTapMs) {
        opts.onSelectUnits(selectSameTypeNearby(opts.getUnits(), anchor, radius));
        lastTap = null;
      } else lastTap = { time: now, unit: anchor, pointerType: e.pointerType };
    } else lastTap = null;
    resetGesture();
  };

  const onPointerCancel = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (e.pointerId === trackingPointerId) {
      lastTap = null;
      resetGesture();
    }
  };

  opts.element.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  return {
    isBoxSelecting: () => isDraggingBox,
    destroy: () => {
      opts.element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      resetGesture();
    },
  };
}
