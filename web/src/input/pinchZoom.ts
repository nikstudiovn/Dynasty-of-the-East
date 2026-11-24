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
  const minZ = o.minZoom ?? MIN_ZOOM, maxZ = o.maxZoom ?? MAX_ZOOM;
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchActive = false;
  let startDist = 1, startZoom = 1, anchorX = 0, anchorY = 0;
  const view = o.view;
  let anchor3 = { x: 0, z: 0 };
  const clientMid = () => {
    const pts = Array.from(activePointers.values());
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };

  const clamp = (z: number) => Math.max(minZ, Math.min(maxZ, z));
  const local = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    const k = r.width > 0 ? canvas.width / r.width : 1;
    return { x: (cx - r.left) * k, y: (cy - r.top) * k };
  };
  const worldAt = (sx: number, sy: number, zoom: number) => ({
    x: (sx - canvas.width / 2) / zoom + cam.x,
    y: (sy - canvas.height / 2) / zoom + cam.y
  });
  const geometry = () => {
    const pts = Array.from(activePointers.values());
    const a = pts[0], b = pts[1];
    const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    return { dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx: mid.x, my: mid.y };
  };

  function beginPinch() {
    pinchActive = true;
    const g = geometry();
    startDist = g.dist; startZoom = cam.zoom;
    if (view) { const c = clientMid(); anchor3 = view.anchorAt(c.x, c.y); }
    const w = worldAt(g.mx, g.my, cam.zoom);
    anchorX = w.x; anchorY = w.y;
    if (o.onPinchStart) o.onPinchStart();
  }

  function applyPinch() {
    const g = geometry();
    const z = clamp(startZoom * (g.dist / startDist));
    if (view) { const c = clientMid(); view.placeAnchor(cam, anchor3, c.x, c.y, z); cam.zoom = z; return; }
    cam.zoom = z;
    // the world point under the (moving) midpoint stays under it => zoom + two-finger pan
    cam.x = anchorX - (g.mx - canvas.width / 2) / z;
    cam.y = anchorY - (g.my - canvas.height / 2) / z;
  }

  function zoomAt(sx: number, sy: number, z: number) {
    const w = worldAt(sx, sy, cam.zoom);
    const nz = clamp(z);
    cam.zoom = nz;
    cam.x = w.x - (sx - canvas.width / 2) / nz;
    cam.y = w.y - (sy - canvas.height / 2) / nz;
  }

  window.addEventListener("pointerdown", e => {
    if (e.target !== canvas || e.pointerType === "mouse") return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) { beginPinch(); e.stopImmediatePropagation(); e.preventDefault(); }
    else if (activePointers.size > 2 || pinchActive) e.stopImmediatePropagation();
  }, { capture: true });

  window.addEventListener("pointermove", e => {
    const p = activePointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinchActive) {
      e.stopImmediatePropagation();
      if (activePointers.size === 2) applyPinch();
    }
  }, { capture: true });

  const end = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (pinchActive) {
      e.stopImmediatePropagation(); // swallow the lift so it is never treated as a tap
      if (activePointers.size === 0) pinchActive = false;
      else if (activePointers.size === 1) { /* remaining finger stays inert until it lifts */ }
    }
  };
  window.addEventListener("pointerup", end, { capture: true });
  window.addEventListener("pointercancel", end, { capture: true });
  const reset = () => { activePointers.clear(); pinchActive = false; };
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
