// Pixel Dynasty 3D — facade used by the classic game script, plus the crisp 2D Retina overlay bridge.
import * as THREE from "three";
import { Scene3D, Cam, MIN_ZOOM, MAX_ZOOM } from "./scene3d";
import { Terrain3D } from "./terrain3d";
import { Buildings3D } from "./buildings3d";
import { Units3D } from "./units3d";
import { Fog3D } from "./fog3d";
import { FX3D } from "./fx3d";
import { World3D } from "./world3d";
import { Env3D, MAP_N, isoToTile, tileToIso, clamp, standHeight } from "./common";

export { MIN_ZOOM, MAX_ZOOM };

export interface Renderer3D {
  readonly minZoom: number;
  readonly maxZoom: number;
  syncAndRender(state: any, cam: Cam, dt: number): void;
  resize(w: number, h: number): void;
  /** Client (viewport) coordinates -> tile under the pointer, via a ground-plane raycast. */
  screenToTile(clientX: number, clientY: number): { tx: number; ty: number };
  /** Tile-space world point -> local CSS-pixel screen point (used by box-select). */
  worldToScreen(tx: number, ty: number): { x: number; y: number };
  /** 1-finger pan: keeps the ground point under the finger glued to it. */
  pan(cam: Cam, fromX: number, fromY: number, toX: number, toY: number): void;
  /** Pinch / wheel anchoring helpers (client coordinates). */
  anchorAt(clientX: number, clientY: number): { x: number; z: number };
  placeAnchor(cam: Cam, anchor: { x: number; z: number }, clientX: number, clientY: number, zoom: number): void;
  /** Smooth 45° camera yaw rotation (+1 clockwise, -1 counter-clockwise). */
  rotate(dir: number): void;
  cycleAtmosphere(): string;
  readonly renderer: THREE.WebGLRenderer;
}

const DEFAULT_ENV: Env3D = {
  teamColor: e => (e && e.team === "player" ? "#dc2626" : "#2563eb"),
  ageOf: () => 1,
  bldgSize: () => 1,
  canPlace: () => true,
  getHover: () => null,
  getSelectionBox: () => null
};

export function createRenderer3D(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, env: Partial<Env3D> = {}): Renderer3D {
  const E: Env3D = { ...DEFAULT_ENV, ...env };
  const s3 = new Scene3D(canvas);
  if (!s3.renderer.capabilities.isWebGL2) throw new Error("WebGL2 unavailable");
  const fx = new FX3D();
  const terrain = new Terrain3D();
  const buildings = new Buildings3D(fx);
  const units = new Units3D(fx);
  const fog = new Fog3D();
  const world = new World3D();
  s3.scene.add(world.group, terrain.group, buildings.group, units.group, fx.group, fog.mesh);

  const octx = overlayCanvas.getContext("2d") as CanvasRenderingContext2D;
  let dpr = Math.min(window.devicePixelRatio || 1, 3);
  let lastState: any = null;
  let time = 0;

  const local = (cx: number, cy: number) => { const r = canvas.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };

  function drawBar(x: number, y: number, w: number, k: number, own: boolean): void {
    octx.fillStyle = "rgba(10, 8, 6, 0.85)";
    octx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    octx.fillStyle = own ? (k > 0.5 ? "#22c55e" : k > 0.25 ? "#facc15" : "#ef4444") : "#ef4444";
    octx.fillRect(x - w / 2, y, w * clamp(k, 0, 1), 3);
  }

  function drawOverlay(state: any): void {
    const W = s3.width, H = s3.height;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state) {
      // building HP bars
      for (const e of buildings.entries()) {
        const b = e.b;
        if (!e.group.visible || !(b.hp < b.maxHp)) continue;
        const p = s3.project(e.group.position.x, e.group.position.y + e.parts.top * e.group.scale.y + 0.15, e.group.position.z);
        if (!p.visible || p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;
        drawBar(p.x, p.y, (b.size || 1) * 22, b.hp / b.maxHp, b.team === "player");
      }
      // unit HP bars
      for (const r of units.allRigs()) {
        const u = r.u;
        if (!u || !r.root.visible || !(u.hp < u.maxHp)) continue;
        const p = s3.project(r.root.position.x, r.root.position.y + r.height + 0.08, r.root.position.z);
        if (!p.visible) continue;
        drawBar(p.x, p.y, r.type === "war_elephant" ? 30 : 20, u.hp / u.maxHp, u.team === "player");
      }
      // floating +15 / -22 combat & gather text
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.font = "800 13px -apple-system, 'SF Pro Rounded', system-ui, sans-serif";
      octx.lineJoin = "round";
      for (const f of state.floats || []) {
        const fv = state.fog[Math.max(0, Math.min(MAP_N - 1, Math.floor(f.y)))]?.[Math.max(0, Math.min(MAP_N - 1, Math.floor(f.x)))] ?? 0;
        if (fv < 2) continue;
        const p = s3.project(f.x, standHeight(f.x, f.y, state.grid) + 0.75, f.y);
        if (!p.visible) continue;
        octx.globalAlpha = clamp((f.life ?? 1) * 1.6, 0, 1);
        octx.lineWidth = 3;
        octx.strokeStyle = "rgba(20, 12, 8, 0.9)";
        octx.strokeText(f.text, p.x, p.y);
        octx.fillStyle = f.color || "#F5B841";
        octx.fillText(f.text, p.x, p.y);
      }
      octx.globalAlpha = 1;
    }
    const sb = E.getSelectionBox();
    if (sb) {
      const rx = Math.min(sb.x1, sb.x2), ry = Math.min(sb.y1, sb.y2), rw = Math.abs(sb.x2 - sb.x1), rh = Math.abs(sb.y2 - sb.y1);
      octx.fillStyle = "rgba(245, 184, 65, 0.16)";
      octx.fillRect(rx, ry, rw, rh);
      octx.strokeStyle = "#F5B841";
      octx.lineWidth = 2;
      octx.strokeRect(rx, ry, rw, rh);
    }
  }

  const api: Renderer3D = {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    renderer: s3.renderer,

    syncAndRender(state: any, cam: Cam, dt: number): void {
      const d = Math.min(0.05, Math.max(0, dt || 0.016));
      time += d;
      if (state !== lastState) {
        // new match / loaded save: drop every pooled mesh from the previous game
        if (lastState) { buildings.clear(); units.clear(); fx.clear(); }
        lastState = state;
      }
      s3.update(cam, d);
      if (state && state.grid && state.fog) {
        terrain.update(state, E, time);
        buildings.update(state, E, time, d);
        units.update(state, E, time, d);
        fog.update(state, time, d);
      }
      world.update(time, d, s3.target);
      fx.update(d);
      s3.render();
      drawOverlay(state);
    },

    resize(w: number, h: number): void {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      s3.resize(w, h);
      overlayCanvas.width = Math.round(w * dpr);
      overlayCanvas.height = Math.round(h * dpr);
      overlayCanvas.style.width = w + "px";
      overlayCanvas.style.height = h + "px";
    },

    screenToTile(clientX: number, clientY: number) {
      const hit = s3.groundAt(clientX, clientY);
      if (!hit) return { tx: -1, ty: -1 };
      return { tx: Math.floor(hit.x), ty: Math.floor(hit.z) };
    },

    worldToScreen(tx: number, ty: number) {
      const p = s3.project(tx, 0, ty);
      return { x: p.x, y: p.y };
    },

    pan(cam: Cam, fromX: number, fromY: number, toX: number, toY: number): void {
      const a = s3.groundAt(fromX, fromY), b = s3.groundAt(toX, toY);
      if (!a || !b) return;
      const t = isoToTile(cam.x, cam.y);
      const nx = clamp(t.x + (a.x - b.x), -3, MAP_N + 3), nz = clamp(t.z + (a.z - b.z), -3, MAP_N + 3);
      const iso = tileToIso(nx, nz);
      cam.x = iso.x; cam.y = iso.y;
    },

    anchorAt(clientX: number, clientY: number) {
      const p = local(clientX, clientY);
      return s3.anchorAt(p.x, p.y);
    },

    placeAnchor(cam: Cam, anchor: { x: number; z: number }, clientX: number, clientY: number, zoom: number): void {
      const p = local(clientX, clientY);
      s3.placeAnchor(cam, anchor, p.x, p.y, clamp(zoom, MIN_ZOOM, MAX_ZOOM));
      const t = isoToTile(cam.x, cam.y);
      if (t.x < -3 || t.z < -3 || t.x > MAP_N + 3 || t.z > MAP_N + 3) {
        const iso = tileToIso(clamp(t.x, -3, MAP_N + 3), clamp(t.z, -3, MAP_N + 3));
        cam.x = iso.x; cam.y = iso.y;
      }
    },

    rotate(dir: number): void { s3.rotate(dir); },
    cycleAtmosphere(): string { return s3.cycleAtmosphere(); }
  };
  return api;
}
