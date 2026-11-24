// Pixel Dynasty — two-finger pinch-to-zoom (anchored at the pinch midpoint) + wheel zoom.
// Listens in the window capture phase so the classic game handlers never see events of a pinch.

export interface Cam { x: number; y: number; zoom: number; }
export interface PinchOptions {
  canvas: HTMLCanvasElement;
  cam: Cam;
  /** Called when a second finger lands: the game cancels pan / box-select (selectionBox = null). */
  onPinchStart?: () => void;
  minZoom?: number;
  maxZoom?: number;
  /** Optional 3D view: anchors pinch / wheel zoom with ground-plane raycasts instead of the 2D iso math. */
  view?: PinchView;
}

export interface PinchView {
  readonly minZoom?: number;
  readonly maxZoom?: number;
  anchorAt(clientX: number, clientY: number): { x: number; z: number };
  placeAnchor(cam: Cam, anchor: { x: number; z: number }, clientX: number, clientY: number, zoom: number): void;
}

export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 2.2;

let installed = false;

export function install(o: PinchOptions): void {
  if (installed) return;
  installed = true;
  const { canvas, cam } = o;
  const view = o.view;
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchActive = false;
  let pinchPair: [number, number] | null = null;
  let pendingFrame = 0;
  let startDist = 1, startZoom = 1, anchorX = 0, anchorY = 0;
  let center = { x: 0, y: 0 };
  let anchor3 = { x: 0, z: 0 };

  const clamp = (z: number) => Math.max(
    view?.minZoom ?? o.minZoom ?? MIN_ZOOM,
    Math.min(view?.maxZoom ?? o.maxZoom ?? MAX_ZOOM, z)
  );
  const local = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    const k = r.width > 0 ? canvas.width / r.width : 1;
    return { x: (cx - r.left) * k, y: (cy - r.top) * k };
  };
  const worldAt = (sx: number, sy: number, zoom: number) => ({
    x: (sx - canvas.width / 2) / zoom + cam.x,
    y: (sy - canvas.height / 2) / zoom + cam.y
  });
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));

  function beginPinch() {
    pinchActive = true;
    const [[idA, a], [idB, b]] = activePointers;
    pinchPair = [idA, idB];
    startDist = distance(a, b);
    startZoom = cam.zoom;
    center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (view) anchor3 = view.anchorAt(center.x, center.y);
    else {
      const p = local(center.x, center.y);
      const w = worldAt(p.x, p.y, startZoom);
      anchorX = w.x;
      anchorY = w.y;
    }
    o.onPinchStart?.();
  }

  function applyPinch() {
    pendingFrame = 0;
    if (!pinchPair) return;
    const a = activePointers.get(pinchPair[0]), b = activePointers.get(pinchPair[1]);
    if (!a || !b) return;
    const z = clamp(startZoom * distance(a, b) / startDist);
    if (Math.abs(z - cam.zoom) < 0.001) return;
    // The initial midpoint stays fixed: translating both fingers is not a pan.
    if (view) view.placeAnchor(cam, anchor3, center.x, center.y, z);
    else {
      const p = local(center.x, center.y);
      cam.x = anchorX - (p.x - canvas.width / 2) / z;
      cam.y = anchorY - (p.y - canvas.height / 2) / z;
    }
    cam.zoom = z;
  }

  function zoomAt(sx: number, sy: number, z: number) {
    const w = worldAt(sx, sy, cam.zoom);
    const nz = clamp(z);
    cam.zoom = nz;
    cam.x = w.x - (sx - canvas.width / 2) / nz;
    cam.y = w.y - (sy - canvas.height / 2) / nz;
  }

  window.addEventListener("pointerdown", e => {
    if (e.target !== canvas || e.pointerType !== "touch") return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinchActive && activePointers.size === 2) beginPinch();
    if (pinchActive) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, { capture: true });

  window.addEventListener("pointermove", e => {
    const p = activePointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinchActive) {
      e.stopImmediatePropagation();
      // One physical touch move can deliver a separate pointermove for each finger.
      if (!pendingFrame && pinchPair?.includes(e.pointerId)) pendingFrame = requestAnimationFrame(applyPinch);
    }
  }, { capture: true });

  const end = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    if (pinchActive) {
      e.stopImmediatePropagation(); // swallow the lift so it is never treated as a tap
      if (pinchPair?.includes(e.pointerId)) {
        if (pendingFrame) {
          cancelAnimationFrame(pendingFrame);
          if (e.type === "pointerup") applyPinch();
          pendingFrame = 0;
        }
        pinchPair = null;
      }
    }
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) pinchActive = false;
  };
  window.addEventListener("pointerup", end, { capture: true });
  window.addEventListener("pointercancel", end, { capture: true });
  const reset = () => {
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    activePointers.clear();
    pinchPair = null;
    pinchActive = false;
  };
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); });

  // iOS Safari native pinch / page bounce
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(t, ev => ev.preventDefault(), { passive: false });
  }
  const stopMulti = (ev: TouchEvent) => { if (ev.touches.length > 1) ev.preventDefault(); };
  canvas.addEventListener("touchstart", stopMulti, { passive: false });
  canvas.addEventListener("touchmove", stopMulti, { passive: false });
  canvas.style.touchAction = "none";

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015;
    const nz = cam.zoom * Math.exp(-e.deltaY * unit);
    if (view) {
      const a = view.anchorAt(e.clientX, e.clientY), z = clamp(nz);
      view.placeAnchor(cam, a, e.clientX, e.clientY, z); cam.zoom = z; return;
    }
    const p = local(e.clientX, e.clientY);
    zoomAt(p.x, p.y, nz);
  }, { passive: false });
}
