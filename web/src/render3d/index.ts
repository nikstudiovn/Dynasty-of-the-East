// Dynasty of the East 3D — facade used by the classic game script, plus the crisp 2D Retina overlay bridge.
import { ModelRegistry } from "./modelRegistry";
import * as THREE from "three";
import { Scene3D, Cam, MIN_ZOOM, MAX_ZOOM, type QualityPreset } from "./scene3d";
import { Terrain3D } from "./terrain3d";
import { Buildings3D } from "./buildings3d";
import { Units3D } from "./units3d";
import { Fog3D } from "./fog3d";
import { FX3D } from "./fx3d";
import { World3D } from "./world3d";
import { Env3D, MAP_N, setMapSize, isoToTile, tileToIso, clamp, standHeight, retainRenderAssets, releaseRenderAssets, fxGuard } from "./common";
import { ensurePbrTextures, disposePbrMaterials } from "./pbrMaterials";
import { FloatingText, FLOAT_COLORS, onFloatingTextChange } from "./floatingText";

/** Gameplay → visuals bridge (index.html calls it only after the gameplay step has been resolved). */
export type VisualEvent =
  | { type: "hit"; x: number; y: number; dmg: number; targetId?: number | null; isBldg?: boolean; melee?: boolean; team?: string }
  | { type: "deposit"; x: number; y: number; amount: number; res: string }
  | { type: "text"; x: number; y: number; text: string; color?: string }
  | { type: "command"; x: number; y: number; kind: "move" | "attack" };

const RES_LABEL: Record<string, string> = { food: "Lúa", wood: "Gỗ", gold: "Vàng", stone: "Đá" };



export { MIN_ZOOM, MAX_ZOOM };
export type { QualityPreset };

export interface Renderer3D {
  readonly minZoom: number;
  readonly maxZoom: number;
  syncAndRender(state: any, cam: Cam, dt: number): void;
  resize(w: number, h: number): void;
  setQuality(preset: QualityPreset): void;
  dispose(): void;
  /** Client (viewport) coordinates -> tile under the pointer, via a ground-plane raycast. */
  screenToTile(clientX: number, clientY: number): { tx: number; ty: number };
  /** Tile-space ground point -> local CSS-pixel screen point. */
  worldToScreen(tx: number, ty: number): { x: number; y: number };
  /** The projected feet and head of the unit in the most recently rendered frame. */
  unitScreenSpan(id: number): { foot: { x: number; y: number }; top: { x: number; y: number } } | null;
  /** 1-finger pan: keeps the ground point under the finger glued to it. */
  pan(cam: Cam, fromX: number, fromY: number, toX: number, toY: number): void;
  /** Pinch / wheel anchoring helpers (client coordinates). */
  anchorAt(clientX: number, clientY: number): { x: number; z: number };
  placeAnchor(cam: Cam, anchor: { x: number; z: number }, clientX: number, clientY: number, zoom: number): void;
  /** Smooth 45° camera yaw rotation (+1 clockwise, -1 counter-clockwise). */
  rotate(dir: number): void;
  cycleAtmosphere(): string;
  /** Read-only effect / GPU counters for tests and on-device profiling. */
  fxStats(): Record<string, unknown>;
  /** Hit flash / sparks / floating numbers / command ripples for a resolved gameplay event. */
  visualEvent(type: VisualEvent["type"], data: any): void;
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
  if (!s3.renderer.capabilities.isWebGL2) {
    s3.dispose();
    throw new Error("WebGL2 unavailable");
  }
  retainRenderAssets();
  ensurePbrTextures();
  const fx = new FX3D();
  let terrain = new Terrain3D();
  const models = new ModelRegistry();
  const buildings = new Buildings3D(fx, models);
  const units = new Units3D(fx, models);
  let fog = new Fog3D();
  let world = new World3D();
  const floating = new FloatingText();
  onFloatingTextChange(on => { if (!on) floating.clear(); });
  fx.setQuality(s3.quality);
  s3.scene.add(world.group, terrain.group, buildings.group, units.group, fx.group, fog.mesh);

  // The size-dependent subsystems (terrain, world ridges, fog DataTexture) are rebuilt whenever the map size,
  // type or seed changes; the old geometries / textures are disposed first so memory never leaks on iPhone.
  let mapKey = "";
  function ensureMap(state: any): void {
    const n = state.mapSize || 48;
    const key = n + "|" + (state.mapType || "river_valley") + "|" + (state.mapSeed || 0);
    if (key === mapKey) return;
    mapKey = key;
    s3.scene.remove(terrain.group, world.group, fog.mesh);
    terrain.dispose(); world.dispose(); fog.dispose();
    setMapSize(n);
    s3.applyMapSize(n);
    terrain = new Terrain3D(); world = new World3D(); fog = new Fog3D();
    s3.scene.add(world.group, terrain.group, fog.mesh);
  }

  const octx = overlayCanvas.getContext("2d") as CanvasRenderingContext2D;
  let dpr = s3.pixelRatio;
  let disposed = false;
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
      // floating -24 / +10 Vàng labels (one per gameplay event, pooled)
      fxGuard("floating-text", () => floating.draw(octx, (x, y, z) => s3.project(x, y, z),
        (x, z) => standHeight(x, z, state.grid),
        (x, z) => (state.fog[Math.max(0, Math.min(MAP_N - 1, Math.floor(z)))]?.[Math.max(0, Math.min(MAP_N - 1, Math.floor(x)))] ?? 0) === 2));
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

  function resizeOverlay(): void {
    dpr = s3.pixelRatio;
    const { width, height } = s3;
    overlayCanvas.width = Math.floor(width * dpr);
    overlayCanvas.height = Math.floor(height * dpr);
    overlayCanvas.style.width = width + "px";
    overlayCanvas.style.height = height + "px";
  }

  fx.setDensity(s3.weather.particleFraction);

  const api: Renderer3D = {
    get minZoom() { return MIN_ZOOM; },
    maxZoom: MAX_ZOOM,
    renderer: s3.renderer,

    syncAndRender(state: any, cam: Cam, dt: number): void {
      if (disposed) return;
      const d = Math.min(0.05, Math.max(0, dt || 0.016));
      time += d;
      if (state !== lastState) {
        // new match / loaded save: drop every pooled mesh from the previous game
        if (lastState) { buildings.clear(); units.clear(); fx.clear(); floating.clear(); }
        lastState = state;
      }
      if (state && state.grid && state.fog) ensureMap(state);
      cam.zoom = clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM);
      s3.update(cam, d);
      if (state && state.grid && state.fog) {
        terrain.update(state, E, time, s3, fx);
        buildings.update(state, E, time, d, s3);
        units.update(state, E, time, d, s3.camera, s3.quality !== "low");
        fog.update(state, time, d);
      }
      world.update(time, d, s3.target, s3.weather.lanternBoost, s3.weather.particleFraction, terrain.lakeCenter);
      fxGuard("fx", () => {
        fx.update(d);
        floating.update(d);
        const kick = fx.consumeShake();
        if (kick) s3.kick(kick);
      });
      s3.render();
      drawOverlay(state);
    },

    resize(w: number, h: number): void {
      if (disposed) return;
      s3.resize(w, h);
      resizeOverlay();
    },

    setQuality(preset: QualityPreset): void {
      if (disposed) return;
      s3.setQuality(preset);
      fx.setDensity(s3.weather.particleFraction);
      fx.setQuality(s3.quality);
      resizeOverlay();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      buildings.dispose();
      units.dispose();
      models.dispose();
      fx.dispose();
      terrain.dispose();
      world.dispose();
      fog.dispose();
      releaseRenderAssets();
      disposePbrMaterials();
      s3.dispose();
      octx.clearRect(0, 0, s3.width, s3.height);
      lastState = null;
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

    unitScreenSpan(id: number) {
      const rig = units.rigFor(id);
      if (!rig?.root.visible) return null;
      const { x, y, z } = rig.root.position;
      return { foot: s3.project(x, y, z), top: s3.project(x, y + rig.height, z) };
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
    fxStats() {
      const info = s3.renderer.info;
      return {
        quality: s3.quality, drawCalls: info.render.calls, triangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
        kicks: s3.kicks, fx: fx.stats(), labels: floating.stats(), buildings: buildings.stats()
      };
    },
    visualEvent(type: VisualEvent["type"], data: any): void {
      if (disposed || !lastState || !data) return;
      fxGuard(`event:${type}`, () => {
        const state = lastState;
        const x = Number(data.x), z = Number(data.y);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const ground = standHeight(x, z, state.grid);
        if (type === "hit") {
          const dmg = Math.round(Number(data.dmg) || 0);
          if (dmg > 0) floating.add(x, z, `-${dmg}`, data.team === "player" ? FLOAT_COLORS.ember : FLOAT_COLORS.ivory);
          if (data.targetId != null) fx.flash(data.isBldg ? buildings.rootFor(data.targetId) : units.rigFor(data.targetId)?.root);
          if (data.melee) fx.meleeSparks(x, ground + 0.35, z);
        } else if (type === "deposit") {
          const amount = Math.round(Number(data.amount) || 0);
          if (amount > 0) floating.add(x, z, `+${amount} ${RES_LABEL[data.res] ?? ""}`.trim(), data.res === "gold" || data.res === "stone" ? FLOAT_COLORS.bronze : FLOAT_COLORS.jade);
        } else if (type === "text") {
          floating.add(x, z, String(data.text ?? ""), data.color || FLOAT_COLORS.bronze);
        } else if (type === "command") {
          fx.command(x, ground, z, data.kind === "attack");
        }
      });
    },
    cycleAtmosphere(): string { return s3.cycleAtmosphere(); }
  };
  return api;
}
