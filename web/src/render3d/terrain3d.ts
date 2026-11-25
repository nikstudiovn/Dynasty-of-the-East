// Dynasty of the East 3D — sculpted seamless terrain, winding river + living lotus lake (shader shimmer, lily pads,
// lotus blossoms, koi), arched vermilion wooden bridges and instanced resources (bamboo groves, terraced rice,
// gold crystal outcrops, mossy stone). Repeated vegetation and resources share instanced draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FX3D } from "./fx3d";
import { WaterSurface } from "./water3d";
import { applyWind, chopWind, grassUnits } from "./wind3d";
import { shakeX } from "../graphics/villagerActions";
import type { Scene3D } from "./scene3d";
import {
  MAP_N, WATER_LEVEL, BRIDGE_DECK, fbm, hash2, smoothstep, clamp, terrainHeight, wetness, shallowAt, rockiness, setWaterGrid, setFoundations, archLift, mat, Env3D, rainWetness, groundPadWeight
} from "./common";
import { createPbrMaterial } from "./pbrMaterials";
import { bambooCulmGeometry, branchedTrunkGeometry, broadCanopyGeometry, chiselledRockGeometry, goldCrystalGeometry, pineCanopyGeometry, slateSlabGeometry, VILLAGER_H, TREE_SCALE, MINE_SCALE } from "./nature3d";

/** Terrain quad density: 3 per tile, 2 per tile on 96×96 to keep vertex count mobile-friendly. */
const segFor = () => (MAP_N >= 96 ? MAP_N * 2 : MAP_N * 3);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Geometry merger (collapses many static pieces into one draw call per material)
class Merger {
  private parts: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  add(g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0): void {
    const c = g.index ? g.toNonIndexed() : g.clone();
    this.e.set(rx, ry, rz);
    this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e), new THREE.Vector3(sx, sy, sz));
    c.applyMatrix4(this.m);
    this.parts.push(c);
  }
  build(material: THREE.Material, shadows = true): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach(p => p.dispose());
    this.parts = [];
    if (!g) return null;
    const me = new THREE.Mesh(g, material);
    me.castShadow = shadows; me.receiveShadow = true;
    return me;
  }
}

// ---------------------------------------------------------------------------
// Instanced resource layer
interface Item {
  x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; tx: number; ty: number; sway: number;
  /** outward lean (radians, applied before yaw) */ tl?: number;
  /** Height above the parent stalk base. */ lift?: number;
}

class InstLayer {
  mesh: THREE.InstancedMesh;
  private depth?: THREE.MeshDepthMaterial;
  items: Item[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  constructor(readonly group: THREE.Group, readonly geometry: THREE.BufferGeometry, readonly material: THREE.Material, private capacity = 64, private shadows = true, private windShape?: "stalk" | "leaf" | "rice" | "crown" | "canopy" | "grass") {
    if (windShape) applyWind(material, windShape);
    this.mesh = this.make(capacity);
    if (windShape && shadows) {
      this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: material.side });
      applyWind(this.depth, windShape);
      this.mesh.customDepthMaterial = this.depth;
    }
  }
  private make(n: number): THREE.InstancedMesh {
    const me = new THREE.InstancedMesh(this.geometry, this.material, n);
    me.castShadow = this.shadows; me.receiveShadow = true; me.count = 0; me.frustumCulled = false;
    if (this.windShape === "leaf") this.geometry.setAttribute("aWindLift", new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
    me.instanceMatrix.setUsage(this.windShape ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage);
    this.group.add(me);
    return me;
  }
  dispose(freeMaterial = true): void {
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.depth?.dispose();
    if (freeMaterial) this.material.dispose();
  }
  set(items: Item[], colors?: THREE.Color[]): void {
    this.items = items;
    if (items.length > this.capacity) {
      this.group.remove(this.mesh); this.mesh.dispose();
      this.capacity = Math.ceil(items.length * 1.5);
      if (this.windShape === "leaf") this.geometry.dispose();
      this.mesh = this.make(this.capacity);
      this.mesh.customDepthMaterial = this.depth;
    }
    this.mesh.count = items.length;
    if (colors) { for (let i = 0; i < items.length; i++) this.mesh.setColorAt(i, colors[i]); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    if (this.windShape === "leaf") {
      const lift = this.geometry.getAttribute("aWindLift") as THREE.InstancedBufferAttribute;
      items.forEach((item, i) => lift.setX(i, item.lift ?? 0));
      lift.needsUpdate = true;
    }
    this.animate(() => 0);
  }
  animate(bend: (it: Item) => number): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const b = bend(it);
      this.e.set((it.tl || 0) + b * 0.6, it.ry, b);
      this.m4.compose(this.p.set(it.x, it.y, it.z), this.q.setFromEuler(this.e), this.s.set(it.sx, it.sy, it.sz));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function colorize(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.set(fn(pos.getX(i), pos.getY(i), pos.getZ(i)), i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.index ? g.toNonIndexed() : g;
  if (c !== g) g.dispose();
  if (c.getAttribute("uv")) c.deleteAttribute("uv");
  return c;
}

/** Airy drooping tuft of 7 lanceolate bamboo leaves radiating from a twig point. */
function leafTuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const L = 0.3 + (k % 3) * 0.05, W = 0.045;
    // a blade along +x: base at origin, widest at 30%, tip at L, drooping downward
    const pts = [[0, 0, 0], [L * 0.3, -0.02, W], [L * 0.3, -0.02, -W], [L, -0.12, 0]];
    const p = new Float32Array([...pts[0], ...pts[1], ...pts[3], ...pts[0], ...pts[3], ...pts[2]]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.rotateZ(0.35 - (k % 2) * 0.25);
    g.rotateY((k / 7) * TAU + (k % 2) * 0.3);
    g.computeVertexNormals();
    colorize(g, (x, _y, z) => { const d = Math.min(1, Math.hypot(x, z) / 0.35); return [0.14 + d * 0.16, 0.46 + d * 0.16, 0.18 + d * 0.04]; });
    blades.push(g);
  }
  const g = mergeGeometries(blades, false)!;
  blades.forEach(blade => blade.dispose());
  // flip normals upward for nicer lighting on both faces
  const n = g.getAttribute("normal");
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Rice tuft (height 1): 5 thin blades + a drooping grain head. */
export function riceTuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const b = new THREE.BoxGeometry(0.012, 1, 0.005);
    b.translate(0, 0.5, 0);
    b.rotateZ((k - 2) * 0.16);
    b.rotateY(k * 1.1);
    parts.push(strip(b));
  }
  const head = new THREE.SphereGeometry(0.03, 5, 4); head.scale(0.8, 2.2, 0.8); head.rotateZ(0.6); head.translate(0.06, 0.95, 0);
  parts.push(strip(head));
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  return merged;
}

export const RICE_COLORS = ["#7fb86a", "#4f8a36", "#c99a34"];
export function paddyMaterial(dry = false): THREE.MeshStandardMaterial {
  return dry ? mat("#766347", { rough: 0.92, surface: "plaster" }) : mat("#5f7046", { rough: 0.22, metal: 0.15 });
}

function grassGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.399, h = 0.42 + hash2(i, 27) * 0.58;
    const x = Math.cos(angle), z = Math.sin(angle);
    positions.push(x * 0.10 - z * 0.048, 0, z * 0.10 + x * 0.048,
      x * 0.31, h, z * 0.31,
      x * 0.10 + z * 0.048, 0, z * 0.10 - x * 0.048);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function lotusBloomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let ring = 0; ring < 3; ring++) {
    const n = ring === 0 ? 8 : ring === 1 ? 7 : 5;
    for (let k = 0; k < n; k++) {
      const p = new THREE.SphereGeometry(0.05, 6, 4);
      p.scale(0.55, 0.3, 1.25 - ring * 0.2);
      p.translate(0, 0, 0.055);
      p.rotateX(-(ring === 0 ? 0.45 : ring === 1 ? 0.9 : 1.25));
      p.rotateY((k / n) * TAU + ring * 0.35);
      p.translate(0, ring * 0.018, 0);
      parts.push(colorize(strip(p), (_x, y) => { const t = clamp(y / 0.08, 0, 1); return [0.98, 0.62 + (1 - t) * 0.2, 0.74 + (1 - t) * 0.12]; }));
    }
  }
  const seed = new THREE.CylinderGeometry(0.028, 0.02, 0.03, 8); seed.translate(0, 0.035, 0);
  parts.push(colorize(strip(seed), () => [0.96, 0.82, 0.25]));
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  return merged;
}

// ---------------------------------------------------------------------------
interface Koi { g: THREE.Group; tail: THREE.Object3D; cx: number; cz: number; rx: number; rz: number; sp: number; ph: number; dir: number; rippleAt?: number; }

export class Terrain3D {
  readonly group = new THREE.Group();
  private terrain: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private waterSurface: WaterSurface | null = null;
  private lake = new THREE.Group();
  private pads: InstLayer | null = null;
  private blooms: InstLayer | null = null;
  private koi: Koi[] = [];
  private koiGeos: THREE.BufferGeometry[] = [];
  private bridges = new THREE.Group();
  private gridRef: any = null;
  private resSig = -1;
  private nextResourceScan = 0;
  private readonly res = new THREE.Group();
  private stalks: InstLayer;
  private leaves: InstLayer;
  private rice: InstLayer;
  private bunds: InstLayer;
  private paddy: InstLayer;
  private boulders: InstLayer;
  private slabs: InstLayer;
  private crystals: InstLayer;
  private moss: InstLayer;
  private trunks: InstLayer;
  private canopies: InstLayer;
  private pines: InstLayer;
  private grass: InstLayer;
  private flowers: InstLayer;
  private pebbles: InstLayer;
  private occupied = new Set<number>();
  private pbrQuality: Scene3D["quality"] | null = null;
  private foundationKey: string | null = null;
  private decorationQuality = "";
  private readonly previousUnits = new Map<number, { x: number; y: number; force: number }>();
  private readonly crystalMat: THREE.MeshStandardMaterial;
  private footprint: THREE.Mesh;
  private footEdges: THREE.LineSegments;
  /** Lotus lake centre in tile space (for koi + wildlife). */
  readonly lakeCenter = new THREE.Vector3(MAP_N / 2, WATER_LEVEL, MAP_N / 2);
  readonly heightCache = new Float32Array((MAP_N + 1) * (MAP_N + 1));

  constructor() {
    this.group.add(this.lake, this.bridges, this.res);
    // Nature & resources share the PBR library; each layer owns a material instance for its wind hook.
    this.stalks = new InstLayer(this.res, bambooCulmGeometry(), createPbrMaterial("mat_bamboo"), 600, true, "stalk");
    this.leaves = new InstLayer(this.res, leafTuftGeometry(), createPbrMaterial("mat_foliage"), 1200, true, "leaf");
    this.rice = new InstLayer(this.res, riceTuftGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 600, false, "rice");
    const bundG = new THREE.BoxGeometry(1, 0.07, 0.09); bundG.translate(0, 0.035, 0);
    this.bunds = new InstLayer(this.res, bundG, mat("#6f5430", { rough: 0.95 }), 200);
    const paddyG = new THREE.BoxGeometry(0.9, 0.02, 0.9); paddyG.translate(0, 0.01, 0);
    this.paddy = new InstLayer(this.res, paddyG, paddyMaterial(), 60, false);
    this.boulders = new InstLayer(this.res, chiselledRockGeometry(3), createPbrMaterial("mat_stone"), 240);
    this.slabs = new InstLayer(this.res, slateSlabGeometry(), createPbrMaterial("mat_stone"), 160);
    this.crystalMat = createPbrMaterial("mat_gold");
    this.crystals = new InstLayer(this.res, goldCrystalGeometry(), this.crystalMat, 320);
    const mossG = new THREE.SphereGeometry(0.12, 7, 5); mossG.scale(1, 0.4, 1);
    this.moss = new InstLayer(this.res, mossG, mat("#3d5229", { rough: 0.95 }), 120);

    this.trunks = new InstLayer(this.res, branchedTrunkGeometry(), createPbrMaterial("mat_wood"), 160);
    this.canopies = new InstLayer(this.res, broadCanopyGeometry(), createPbrMaterial("mat_foliage"), 120, true, "canopy");
    this.pines = new InstLayer(this.res, pineCanopyGeometry(), createPbrMaterial("mat_foliage"), 200, true, "canopy");
    this.grass = new InstLayer(this.res, grassGeometry(),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.93 }), 200, false, "grass");
    this.flowers = new InstLayer(this.res, new THREE.IcosahedronGeometry(0.085, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.77 }), 120, false);
    this.pebbles = new InstLayer(this.res, new THREE.DodecahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }), 120, false);
    this.footprint = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.footEdges = new THREE.LineSegments(new THREE.EdgesGeometry(this.footprint.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }));
    this.footprint.add(this.footEdges);
    this.footprint.visible = false; this.footprint.renderOrder = 5;
    this.group.add(this.footprint);
  }

  /** Average terrain height under a footprint (used to seat buildings). */
  heightAt(x: number, z: number): number { return terrainHeight(x, z); }

  // -------------------------------------------------------------------------
  private build(state: any): void {
    const grid = state.grid;
    setWaterGrid(grid, state.mapSeed || 0);
    this.refreshFoundations(state);
    for (let z = 0; z <= MAP_N; z++) for (let x = 0; x <= MAP_N; x++) this.heightCache[z * (MAP_N + 1) + x] = terrainHeight(x, z);
    if (this.terrain) {
      this.group.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose();
    }
    this.terrain = this.buildTerrain(state);
    this.group.add(this.terrain);
    this.buildLake(grid);
    this.buildBridges(grid);
    this.resSig = -1;
  }

  private refreshFoundations(state: any): boolean {
    const buildings = state.buildings || [];
    const key = buildings.map((b: any) => `${b.tx}/${b.ty}/${b.w ?? b.size ?? 1}/${b.h ?? b.size ?? 1}`).join("|");
    if (key === this.foundationKey && this.gridRef && this.terrain) return false;
    this.foundationKey = key;
    setFoundations(buildings);
    this.occupied.clear();
    for (const b of buildings) {
      const bw = b.w ?? b.size ?? 1, bh = b.h ?? b.size ?? 1;
      for (let z = b.ty; z < b.ty + bh; z++) for (let x = b.tx; x < b.tx + bw; x++) this.occupied.add(z * MAP_N + x);
    }
    return true;
  }

  private decorate(state: any, quality: Scene3D["quality"]): void {
    const grass: Item[] = [], flowers: Item[] = [], pebbles: Item[] = [];
    const greens: THREE.Color[] = [], petals: THREE.Color[] = [], stones: THREE.Color[] = [];
    const seed = state.mapSeed || 0;
    const density = quality === "high" ? 0.36 : quality === "medium" ? 0.19 : 0.075;
    for (let z = 0; z < MAP_N; z++) for (let x = 0; x < MAP_N; x++) {
      const cell = state.grid[z]?.[x];
      if (cell?.terrain !== "grass" || cell.res || this.occupied.has(z * MAP_N + x)) continue;
      const rand = hash2(x + seed % 257, z);
      if (rand >= density) continue;
      const px = x + 0.19 + hash2(x, z + 17) * 0.61, pz = z + 0.19 + hash2(x - 23, z) * 0.61;
      if (wetness(px, pz) > 0.09 || shallowAt(px, pz) > 0.25) continue;
      const h = terrainHeight(px, pz);
      const item = { x: px, y: h, z: pz, ry: rand * 19, sx: 0.41, sy: 0.18 + rand * 0.32, sz: 0.43, tx: x, ty: z, sway: rand };
      grass.push(item);
      greens.push(new THREE.Color(rand < density * 0.45 ? "#6d873e" : "#a6aa5d"));
      if (quality !== "low" && rand < density * 0.34) {
        flowers.push({ ...item, x: px + 0.12, y: h + 0.10, sx: 0.55, sy: 0.83, sz: 0.62 });
        petals.push(new THREE.Color(hash2(z, x + 43) > 0.45 ? "#dfb881" : "#e795a1"));
      } else if (rand < density * 0.52) {
        pebbles.push({ ...item, x: px - 0.11, y: h + 0.018, sx: 0.88, sy: 0.45, sz: 0.72 });
        stones.push(new THREE.Color("#8c8672").multiplyScalar(0.85 + rand));
      }
    }
    this.grass.set(grass, greens);
    this.flowers.set(flowers, petals);
    this.pebbles.set(pebbles, stones);
  }

  private updateGrassUnits(state: any, target: THREE.Vector3): void {
    const live = new Set<number>();
    const nearby: { x: number; y: number; force: number; distance: number }[] = [];
    for (const u of state.units || []) {
      if (u.garrisoned || u.hp <= 0) continue;
      const x = u.x, y = u.y;
      if (u.team !== "player" && state.fog[Math.floor(y)]?.[Math.floor(x)] !== 2) continue;
      const distance = (x - target.x) ** 2 + (y - target.z) ** 2;
      if (distance > 23 ** 2) continue;
      const prev = this.previousUnits.get(u.id);
      const motion = prev ? Math.hypot(x - prev.x, y - prev.y) : 0;
      const force = Math.max(Math.min(1, motion * 34), (prev?.force || 0) * 0.81);
      this.previousUnits.set(u.id, { x, y, force });
      live.add(u.id);
      if (force > 0.025) nearby.push({ x, y, force, distance });
    }
    for (const id of this.previousUnits.keys()) if (!live.has(id)) this.previousUnits.delete(id);
    nearby.sort((a, b) => a.distance - b.distance);
    grassUnits.value.forEach((slot, i) => {
      const unit = nearby[i];
      if (unit) slot.set(unit.x, unit.y, 0, unit.force);
      else slot.setScalar(0);
    });
  }

  private pathSegments(state: any): number[][] {
    // curved footpaths radiating from every Đình Làng (town centre) toward the lotus lake and along the valley
    const segs: number[][] = [];
    const tcs = (state.buildings || []).filter((b: any) => b.type === "town_center");
    for (const tc of tcs) {
      const cx = tc.tx + (tc.w ?? tc.size ?? 1) / 2, cz = tc.ty + (tc.h ?? tc.size ?? 1) / 2;
      const dirs: [number, number][] = [[MAP_N / 2 - cx, MAP_N / 2 - cz], [MAP_N / 2 - cx, 0], [0, MAP_N / 2 - cz]];
      dirs.forEach(([dx, dz], di) => {
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
        const reach = di === 0 ? Math.max(2, len - 7) : Math.min(10, len);
        let px = cx, pz = cz;
        for (let k = 1; k <= 16; k++) {
          const t = (k / 16) * reach;
          const wob = Math.sin(t * 0.7 + di * 2 + tc.tx) * 0.65;
          const qx = cx + ux * t + nx * wob, qz = cz + uz * t + nz * wob;
          segs.push([px, pz, qx, qz]);
          px = qx; pz = qz;
        }
      });
    }
    return segs;
  }

  private buildTerrain(state: any): THREE.Mesh {
    const grid = state.grid;
    const SEG = segFor();
    const g = new THREE.PlaneGeometry(MAP_N + 6, MAP_N + 6, SEG + 18, SEG + 18);
    g.rotateX(-Math.PI / 2);
    g.translate(MAP_N / 2, 0, MAP_N / 2);
    const pos = g.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const segs = this.pathSegments(state);
    const pathTint = new THREE.Color("#e3c6a8");
    const forestTint = new THREE.Color("#a8b097");
    const stoneTint = new THREE.Color("#e2ddd8");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.35, z * 0.35);
      c.setScalar(0.70 + n * 0.55);
      const cell = grid[Math.floor(z)]?.[Math.floor(x)];
      if (cell?.res === "wood") c.lerp(forestTint, 0.25);
      else if (cell?.res === "gold" || cell?.res === "stone") c.lerp(stoneTint, 0.24);
      else if (cell?.res === "food") c.lerp(pathTint, 0.18);
      let d = 9;
      for (const s of segs) {
        if (Math.abs(s[0] - x) > 2 && Math.abs(s[2] - x) > 2) continue;
        const vx = s[2] - s[0], vz = s[3] - s[1], l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - s[0]) * vx + (z - s[1]) * vz) / l2));
        const ex = s[0] + vx * t - x, ez = s[1] + vz * t - z;
        d = Math.min(d, ex * ex + ez * ez);
      }
      const path = 1 - smoothstep(0.06, 0.16, d);
      if (path > 0) c.lerp(pathTint, path * 0.65);
      const out = Math.max(0, -x, -z, x - MAP_N, z - MAP_N);
      if (out > 0) c.multiplyScalar(Math.max(0.62, 1 - out * 0.1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.updateGroundBlend(g);
    const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    this.pbrQuality = null;
    const me = new THREE.Mesh(g, ground);
    me.receiveShadow = true;
    me.name = "terrain";
    return me;
  }

  private updateGroundBlend(geometry: THREE.BufferGeometry): void {
    const pos = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    const blend = geometry.getAttribute("aGroundBlend") ?? new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
      const slope = smoothstep(0.045, 0.28, 1 - normals.getY(i));
      const slate = Math.max(rockiness(x, z) * 0.76, slope * smoothstep(0.18, 0.83, h));
      const mud = Math.max(smoothstep(0.015, 0.40, wetness(x, z)), shallowAt(x, z));
      blend.setXYZ(i, slate, mud, groundPadWeight(x, z));
    }
    if (!geometry.hasAttribute("aGroundBlend")) geometry.setAttribute("aGroundBlend", blend);
    blend.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  private buildWaterMesh(grid: any[][]): THREE.Mesh | null {
    const isW = (x: number, y: number) => { const t = grid[y]?.[x]?.terrain; return t === "water" || t === "bridge"; };
    const D = 3, pos: number[] = [], idx: number[] = [], depths: number[] = [], piers: number[] = [], shallows: number[] = [];
    for (let y = -1; y <= MAP_N; y++) for (let x = -1; x <= MAP_N; x++) {
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = isW(x + dx, y + dy) || shallowAt(x + dx + 0.5, y + dy + 0.5) > 0.5;
      if (!near) continue;
      const base = pos.length / 3;
      for (let j = 0; j <= D; j++) for (let i = 0; i <= D; i++) {
        const px = x + i / D, pz = y + j / D;
        pos.push(px, WATER_LEVEL, pz);
        depths.push(WATER_LEVEL - terrainHeight(px, pz));
        shallows.push(shallowAt(px, pz) * (1 - wetness(px, pz)));
        let dist = 1;
        for (let bz = y - 1; bz <= y + 1; bz++) for (let bx = x - 1; bx <= x + 1; bx++) {
          const cell = grid[bz]?.[bx];
          if (cell?.terrain !== "bridge") continue;
          const vertical = cell.bridge === "v";
          const along = vertical ? pz - bz - 0.5 : px - bx - 0.5;
          const across = vertical ? px - bx - 0.5 : pz - bz - 0.5;
          dist = Math.min(dist, Math.hypot(along, Math.abs(across) - 0.38));
        }
        piers.push(dist);
      }
      for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
        const a = base + j * (D + 1) + i, b = a + 1, c = a + D + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
    g.setAttribute("aPier", new THREE.Float32BufferAttribute(piers, 1));
    g.setAttribute("aShallow", new THREE.Float32BufferAttribute(shallows, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.waterSurface = new WaterSurface();
    const me = new THREE.Mesh(g, this.waterSurface.material);
    me.renderOrder = 2;
    return me;
  }

  private buildLake(grid: any[][]): void {
    this.group.remove(this.lake);
    if (this.water) { this.water.geometry.dispose(); this.waterSurface?.dispose(); this.water = null; this.waterSurface = null; }
    if (this.pads) { this.pads.dispose(); this.pads = null; }
    if (this.blooms) { this.blooms.dispose(); this.blooms = null; }
    for (const g of this.koiGeos) g.dispose();
    this.koiGeos = [];
    this.lake = new THREE.Group();
    this.koi = [];
    this.group.add(this.lake);
    this.water = this.buildWaterMesh(grid);
    if (!this.water) { this.pads = null; this.blooms = null; return; }
    this.lake.add(this.water);

    const isW = (x: number, y: number) => grid[y]?.[x]?.terrain === "water";
    // lake interior: cells whose 5×5 neighbourhood is (almost) all water — the river is too narrow to qualify
    let sx = 0, sz = 0, n = 0;
    const interior = (x: number, y: number) => { let c = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isW(x + dx, y + dy) || grid[y + dy]?.[x + dx]?.terrain === "bridge") c++; return c >= 21; };
    const padItems: Item[] = [], bloomItems: Item[] = [];
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      if (!isW(x, y)) continue;
      const inner = interior(x, y);
      if (inner) { sx += x + 0.5; sz += y + 0.5; n++; }
      const nearBridge = grid[y - 1]?.[x]?.terrain === "bridge" || grid[y + 1]?.[x]?.terrain === "bridge";
      if (nearBridge) continue;
      const odds = inner ? 0.6 : 0.16;
      for (let k = 0; k < 2; k++) {
        const r = hash2(x * 3.1 + k, y * 7.7 - k);
        if (r > odds) continue;
        const px = x + 0.2 + hash2(x + k * 1.7, y) * 0.6, pz = y + 0.2 + hash2(x, y + k * 2.3) * 0.6;
        const s = 0.8 + hash2(x * 5 + k, y) * 0.7;
        padItems.push({ x: px, y: WATER_LEVEL + 0.014, z: pz, ry: r * 40, sx: s, sy: 1, sz: s, tx: x, ty: y, sway: r * 9 });
        if (hash2(x + 11 * k, y * 3) < 0.5) bloomItems.push({ x: px + 0.03, y: WATER_LEVEL + 0.03, z: pz - 0.02, ry: r * 20, sx: 1 + r * 0.4, sy: 1 + r * 0.4, sz: 1 + r * 0.4, tx: x, ty: y, sway: r * 9 + 1 });
      }
    }
    if (n) this.lakeCenter.set(sx / n, WATER_LEVEL, sz / n);

    if (!this.pads) {
      const padG = new THREE.CircleGeometry(0.15, 14, 0.3, TAU - 0.3); padG.rotateX(-Math.PI / 2);
      colorize(padG, (x, _y, z) => { const d = Math.hypot(x, z) / 0.15; return [0.2 + d * 0.06, 0.48 + d * 0.08, 0.2]; });
      this.pads = new InstLayer(this.lake, padG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }), 200, false);
      this.blooms = new InstLayer(this.lake, lotusBloomGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x3a0f1c, emissiveIntensity: 0.35 }), 120);
    } else {
      this.lake.add((this.pads as InstLayer).mesh); this.lake.add(this.blooms!.mesh);
    }
    this.pads.set(padItems);
    this.blooms!.set(bloomItems);

    // 6 orange-and-white koi gliding in slow loops beneath the surface of the lotus lake
    if (n) {
      const orange = mat("#f2621f", { rough: 0.4 }), white = mat("#f5f1e8", { rough: 0.4 }), fin = mat("#ff9a4a", { rough: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const bodyG = new THREE.SphereGeometry(0.05, 10, 6); bodyG.scale(0.75, 0.55, 2);
      const patchG = new THREE.SphereGeometry(0.035, 8, 5); patchG.scale(0.9, 0.6, 1.3);
      const tailG = new THREE.BufferGeometry();
      tailG.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, -0.045, 0, -0.08, 0.045, 0, -0.08]), 3));
      tailG.computeVertexNormals();
      this.koiGeos.push(bodyG, patchG, tailG);
      for (let i = 0; i < 6; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(bodyG, i % 3 === 2 ? white : orange));
        const p1 = new THREE.Mesh(patchG, i % 3 === 2 ? orange : white); p1.position.set(0, 0.012, 0.03); g.add(p1);
        const p2 = new THREE.Mesh(patchG, white); p2.position.set(0, 0.01, -0.04); p2.scale.setScalar(0.7); g.add(p2);
        const tail = new THREE.Group(); tail.position.z = -0.09;
        tail.add(new THREE.Mesh(tailG, fin)); g.add(tail);
        for (const s of [-1, 1]) { const f = new THREE.Mesh(tailG, fin); f.position.set(s * 0.03, -0.005, 0.03); f.rotation.y = s * 2.2; f.scale.setScalar(0.5); g.add(f); }
        g.scale.setScalar(1.3);
        this.lake.add(g);
        const rr = 0.9 + (i % 3) * 0.75;
        this.koi.push({ g, tail, cx: this.lakeCenter.x + (i - 2.5) * 0.25, cz: this.lakeCenter.z + ((i * 7) % 3 - 1) * 0.5, rx: rr * 1.15, rz: rr * 0.85, sp: 0.35 + (i % 4) * 0.08, ph: i * 1.7, dir: i % 2 ? 1 : -1 });
      }
    }
  }

  // -------------------------------------------------------------------------
  /** Arched wooden bridges: one continuous humped deck per span, vermilion railings with gilded caps, timber pilings. */
  private buildBridges(grid: any[][]): void {
    this.group.remove(this.bridges);
    this.bridges.traverse(o => { if ((o as THREE.Mesh).geometry && o !== this.bridges) (o as THREE.Mesh).geometry.dispose(); });
    this.bridges = new THREE.Group();
    this.group.add(this.bridges);
    const planks = new Merger(), timber = new Merger(), rails = new Merger(), gold = new Merger();
    const slat = new THREE.BoxGeometry(1, 1, 1);
    const post = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
    const knob = new THREE.SphereGeometry(0.5, 7, 5);
    const isB = (x: number, y: number) => grid[y]?.[x]?.terrain === "bridge";
    const isLand = (x: number, y: number) => { const t = grid[y]?.[x]?.terrain; return t !== undefined && t !== "water" && t !== "bridge"; };

    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const c = grid[y][x];
      if (c.terrain !== "bridge") continue;
      const vert = c.bridge === "v";
      // only start a span at its first cell
      if (vert ? isB(x, y - 1) && grid[y - 1][x].bridge === "v" : isB(x - 1, y) && grid[y][x - 1].bridge !== "v") continue;
      let a = vert ? y : x, b = a;
      while (vert ? isB(x, b + 1) && grid[b + 1][x].bridge === "v" : isB(b + 1, y) && grid[y][b + 1].bridge !== "v") b++;
      b += 1; // span covers [a, b)
      const ext0 = (vert ? isLand(x, a - 1) : isLand(a - 1, y)) ? 0.7 : 0;
      const ext1 = (vert ? isLand(x, b) : isLand(b, y)) ? 0.7 : 0;
      const lane = vert ? x + 0.5 : y + 0.5;
      const W = (p: number, s: number): [number, number] => (vert ? [lane + s, p] : [p, lane + s]);
      const deck = (p: number): number => {
        if (p < a) { const [wx, wz] = W(p, 0); const sh = terrainHeight(wx, wz) + 0.02; return sh + (BRIDGE_DECK - sh) * smoothstep(a - ext0, a, p); }
        if (p > b) { const [wx, wz] = W(p, 0); const sh = terrainHeight(wx, wz) + 0.02; return sh + (BRIDGE_DECK - sh) * smoothstep(b + ext1, b, p); }
        return BRIDGE_DECK + archLift(p, a, b);
      };
      const slope = (p: number) => (deck(p + 0.05) - deck(p - 0.05)) / 0.1;
      const p0 = a - ext0, p1 = b + ext1;
      // planks
      const nP = Math.round((p1 - p0) / 0.14);
      for (let k = 0; k < nP; k++) {
        const p = p0 + (k + 0.5) * ((p1 - p0) / nP);
        const [wx, wz] = W(p, 0), ang = Math.atan(slope(p)), shadeK = 0.96 + hash2(x * 9 + k, y * 5) * 0.08;
        if (vert) planks.add(slat, wx, deck(p), wz, 0.92, 0.05 * shadeK, 0.12, 0, -ang, (hash2(x, k) - 0.5) * 0.04);
        else planks.add(slat, wx, deck(p), wz, 0.12, 0.05 * shadeK, 0.92, 0, (hash2(k, y) - 0.5) * 0.04, ang);
      }
      // stringers + railings follow the arch in short straight pieces
      const step = 0.5;
      const nS = Math.max(1, Math.round((p1 - p0) / step));
      for (let k = 0; k < nS; k++) {
        const q0 = p0 + k * ((p1 - p0) / nS), q1 = p0 + (k + 1) * ((p1 - p0) / nS), qm = (q0 + q1) / 2;
        const d0 = deck(q0), d1 = deck(q1), len = Math.hypot(q1 - q0, d1 - d0), ang = Math.atan2(d1 - d0, q1 - q0);
        for (const s of [-0.32, 0.32]) {
          const [wx, wz] = W(qm, s);
          if (vert) timber.add(slat, wx, (d0 + d1) / 2 - 0.06, wz, 0.08, 0.07, len, 0, -ang, 0);
          else timber.add(slat, wx, (d0 + d1) / 2 - 0.06, wz, len, 0.07, 0.08, 0, 0, ang);
        }
        for (const s of [-0.47, 0.47]) {
          const [wx, wz] = W(qm, s);
          for (const [hh, th] of [[0.32, 0.045], [0.16, 0.03]]) {
            if (vert) rails.add(slat, wx, (d0 + d1) / 2 + hh, wz, th + 0.01, th, len, 0, -ang, 0);
            else rails.add(slat, wx, (d0 + d1) / 2 + hh, wz, len, th, th + 0.01, 0, 0, ang);
          }
        }
      }
      for (let k = 0; k <= nS; k++) {
        const q = p0 + k * ((p1 - p0) / nS), d = deck(q);
        for (const s of [-0.47, 0.47]) {
          const [wx, wz] = W(q, s);
          rails.add(post, wx, d + 0.17, wz, 0.055, 0.36, 0.055);
          gold.add(knob, wx, d + 0.37, wz, 0.06, 0.06, 0.06);
        }
      }
      // timber pilings into the riverbed + cross braces
      for (let p = a + 0.5; p < b; p += 1) {
        const d = deck(p);
        for (const s of [-0.38, 0.38]) {
          const [wx, wz] = W(p, s);
          timber.add(post, wx, (d - 0.08 - 0.7) / 2, wz, 0.08, d - 0.08 + 0.7, 0.08);
        }
        const [bx, bz] = W(p, 0);
        if (vert) timber.add(slat, bx, d - 0.32, bz, 0.8, 0.05, 0.05, 0, 0, 0.35);
        else timber.add(slat, bx, d - 0.32, bz, 0.05, 0.05, 0.8, 0, 0.35, 0);
      }
    }
    const pm = planks.build(mat("#a8733f", { rough: 0.87, surface: "teak" }));
    const tm = timber.build(mat("#5a3a22", { rough: 0.85, surface: "teak" }));
    const rm = rails.build(mat("#b91c1c", { rough: 0.57, surface: "lacquer" }));
    const gm = gold.build(mat("#e8b53a", { metal: 0.75, rough: 0.3 }), false);
    for (const m of [pm, tm, rm, gm]) if (m) this.bridges.add(m);
    slat.dispose(); post.dispose(); knob.dispose();
  }

  // -------------------------------------------------------------------------
  private rebuildResources(state: any): void {
    const grid = state.grid, fog = state.fog;
    const seed = state.mapSeed || 0;
    const stalks: Item[] = [], leaves: Item[] = [], rice: Item[] = [], bunds: Item[] = [], paddy: Item[] = [], riceCol: THREE.Color[] = [];
    const trunks: Item[] = [], canopies: Item[] = [], canopyCol: THREE.Color[] = [], pines: Item[] = [], pineCol: THREE.Color[] = [];
    const boulders: Item[] = [], boulderCol: THREE.Color[] = [], slabs: Item[] = [], slabCol: THREE.Color[] = [];
    const crys: Item[] = [], moss: Item[] = [];
    const grouped = new Set<number>();
    const RICE = RICE_COLORS.map(color => new THREE.Color(color));
    // light multipliers over mat_foliage keep the canopy muted but avoid copy-paste uniformity
    const LEAF_TINTS = ["#ffffff", "#e6eccd", "#f2e2bd", "#d3dfc8"].map(color => new THREE.Color(color));
    const h = (wx: number, wz: number) => terrainHeight(wx, wz);
    const visible = (x: number, y: number) => (fog[y]?.[x] ?? 0) > 0;
    const item = (x: number, y: number, z: number, tx: number, ty: number, ry: number, sx: number, sy = sx, sz = sx, extra: Partial<Item> = {}): Item =>
      ({ x, y, z, ry, sx, sy, sz, tx, ty, sway: 0, ...extra });

    // Resource scale is anchored to the villager (VILLAGER_H, foot to hat tip = 1.0x):
    //   trees 2.5–3.5x (trunk stays inside the tile so the tile collision reads as a compact base),
    //   stone / gold main block 1.2–1.8x. Geometry heights at scale 1: broad canopy top 1.47, pine 1.46,
    //   bamboo culm 1.0, chiselled rock 0.49, slate slab 0.35, gold crystal 0.31.
    const treeH = (k: number) => VILLAGER_H * (TREE_SCALE[0] + k * (TREE_SCALE[1] - TREE_SCALE[0]));
    const mineH = (k: number) => VILLAGER_H * (MINE_SCALE[0] + k * (MINE_SCALE[1] - MINE_SCALE[0]));

    // --- trees: branched trunk (mat_wood) + multi-tier canopy (mat_foliage), one InstancedMesh each
    const broadTree = (px: number, pz: number, tx: number, ty: number, s: number, sy: number, k: number) => {
      const tree = item(px, h(px, pz) - 0.02, pz, tx, ty, k * TAU, s, sy, s, { sway: k * 6 });
      trunks.push(tree);
      canopies.push(tree);
      canopyCol.push(LEAF_TINTS[Math.floor(k * 97) % LEAF_TINTS.length]);
    };
    const pineTree = (px: number, pz: number, tx: number, ty: number, s: number, k: number, sy = s * 1.05) => {
      const tree = item(px, h(px, pz) - 0.02, pz, tx, ty, k * TAU, s * 0.5, sy, s * 0.5, { sway: k * 6 });
      trunks.push(tree);
      pines.push({ ...tree, sx: s, sz: s });
      pineCol.push(LEAF_TINTS[Math.floor(k * 53) % LEAF_TINTS.length].clone().multiplyScalar(0.92));
    };
    const singleTree = (x: number, y: number, amt: number) => {
      const k = hash2(x + 43 + seed % 101, y - 25);
      const px = x + 0.5 + (k - 0.5) * 0.12, pz = y + 0.5 + (hash2(y, x) - 0.5) * 0.12;
      const s = 0.7 * (0.88 + amt * 0.12);
      broadTree(px, pz, x, y, s, treeH(hash2(x * 2.1 + 5, y * 1.3)) / 1.47, k);
    };
    const forest = (x: number, y: number, amt: number) => {
      const n = hash2(x * 1.7, y * 2.3) > 0.45 ? 3 : 2;
      const rot = hash2(x, y + seed % 13) * TAU;
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU, r = 0.2 + hash2(x + i, y) * 0.07;
        const k = hash2(x * 3 + i, y * 5);
        pineTree(x + 0.5 + Math.cos(a) * r, y + 0.5 + Math.sin(a) * r, x, y, (0.5 + k * 0.16) * (0.85 + amt * 0.15), k, treeH(hash2(x + i * 3.7, y * 1.9)) / 1.46);
      }
    };
    const ancientTree = (px: number, pz: number, x: number, y: number) => {
      const k = hash2(x + 7, y + seed % 31);
      broadTree(px, pz, x, y, 1.22, treeH(0.85 + k * 0.15) / 1.47, k); // ancient: top of the 2.5–3.5x band
      // banyan-like secondary stems with their own crowns + mossy root stones
      for (let i = 0; i < 2; i++) {
        const a = k * TAU + i * 2.6 + 0.8;
        broadTree(px + Math.cos(a) * 0.5, pz + Math.sin(a) * 0.5, x, y, 0.72, treeH(hash2(i + x, y) * 0.4) / 1.47, hash2(i + x, y));
      }
      for (let i = 0; i < 4; i++) {
        const a = k * 5 + i * 1.57, rx = px + Math.cos(a) * 0.42, rz = pz + Math.sin(a) * 0.42;
        boulders.push(item(rx, h(rx, rz) - 0.03, rz, x, y, a, 0.32, 0.22, 0.26));
        boulderCol.push(new THREE.Color("#9c9078"));
        moss.push(item(rx, h(rx, rz) + 0.07, rz, x, y, 0, 1.1, 0.6, 1));
      }
    };
    const bambooClump = (x: number, y: number, amt: number) => {
      // 4–6 slender culms leaning slightly outward, layered leaf tufts near the crown
      const n = 4 + Math.floor(hash2(x * 1.3, y * 2.9) * 3);
      const rot = hash2(x, y) * TAU;
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * TAU + (hash2(x + k, y) - 0.5) * 0.6;
        const r = 0.06 + hash2(x + k * 3, y + 1) * 0.16;
        const px = x + 0.5 + Math.cos(a) * r, pz = y + 0.5 + Math.sin(a) * r;
        const ht = treeH(hash2(x * 2 + k, y * 3)) * 0.9; // + leaf tufts above the culm tip ≈ 2.5–3.5x
        const tl = 0.05 + hash2(x * 7 + k, y) * 0.13;
        const ry = Math.PI / 2 - a; // leans along (cos a, sin a)
        const base = h(px, pz);
        const sway = k + hash2(x, y * 5) * 6;
        stalks.push({ x: px, y: base, z: pz, ry, tl, sx: 1, sy: ht, sz: 1, tx: x, ty: y, sway });
        for (const [f, s] of [[0.72, 1.05], [0.88, 0.95], [1.0, 0.75]]) {
          if (f === 0.72 && k % 2) continue;
          const L = ht * f, off = Math.sin(tl) * L;
          leaves.push({ x: px + Math.cos(a) * off, y: base + Math.cos(tl) * L, z: pz + Math.sin(a) * off, ry: hash2(k, x + f) * TAU, sx: s, sy: s, sz: s, tx: x, ty: y, sway, lift: L });
        }
      }
    };

    // --- mines: bevelled dark rock studded with low-roughness gold crystals, or layered slate outcrops
    const mine = (cx: number, cz: number, x: number, y: number, gold: boolean, big: boolean, amt: number, span = 2) => {
      const n = big ? (span === 3 ? 12 : 8) : 4, spread = big ? (span === 3 ? 1.25 : 0.72) : 0.3;
      const rot = hash2(x + seed % 57, y) * TAU;
      const Hm = mineH(hash2(x * 1.9 + 3, y * 2.7));         // main block: 1.2–1.8x villager
      const Wm = big ? (span === 3 ? 1.25 : 1.05) : 0.78;      // footprint scale of the main block
      for (let i = 0; i < n; i++) {
        const a = rot + i * 2.399, r = i === 0 ? 0 : spread * (0.6 + hash2(x + i, y) * 0.4);
        const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
        const kk = hash2(x * 3 + i, y);
        const hr = i === 0 ? Hm : Hm * (0.3 + kk * 0.3) * (0.8 + amt * 0.2); // satellites shrink as the seam empties
        const w = i === 0 ? Wm : Wm * (0.42 + kk * 0.22) * (big ? 1 : 0.85);
        const base = h(px, pz) - 0.02;
        if (gold) {
          boulders.push(item(px, base, pz, x, y, a, w, hr / 0.49, w * 0.9));
          boulderCol.push(new THREE.Color("#5b534b").multiplyScalar(0.85 + hash2(x, y + i) * 0.3));
          const spikes = (big ? 3 : 2) + (i === 0 ? 3 : 0);
          for (let j = 0; j < spikes; j++) {
            const ca = a + j * 2.2 + 0.4, cr = w * 0.45 * (0.15 + 0.45 * hash2(j, i + x));
            const cs = Math.max(0.5, hr * (1.0 + hash2(i + j, y) * 0.6));
            const cy = base + hr * (0.45 + 0.4 * (1 - cr / (w * 0.45)));
            crys.push(item(px + Math.cos(ca) * cr, cy, pz + Math.sin(ca) * cr, x, y, ca, cs, cs * (0.9 + hash2(x + j, y + i) * 0.6), cs, { tl: 0.18 + hash2(j, x + i) * 0.5 }));
          }
        } else if (i === 0 || i % 3 !== 2) {
          // core rock + stacked slate slabs reaching hr
          if (i === 0) {
            boulders.push(item(px, base, pz, x, y, a, w * 0.9, hr * 0.72 / 0.49, w * 0.85));
            boulderCol.push(new THREE.Color("#cfcdc6").multiplyScalar(0.9 + hash2(x, y) * 0.15));
          }
          const s0 = i === 0 ? hr * 0.62 : hr * 0.55;
          slabs.push(item(px, base, pz, x, y, a, w * 0.95, s0 / 0.35, w * 0.95));
          slabs.push(item(px + 0.02 * w, base + (i === 0 ? hr * 0.62 : s0 * 0.9), pz - 0.02 * w, x, y, a + 0.45, w * 0.7, (hr * (i === 0 ? 0.38 : 0.45)) / 0.35, w * 0.68));
          for (let j = 0; j < 2; j++) slabCol.push(new THREE.Color("#e4e4e0").multiplyScalar(0.86 + hash2(i + j, x) * 0.24));
          moss.push(item(px - 0.03 * w, base + hr * 0.96, pz, x, y, a, w * 1.6, w * 0.9, w * 1.4));
        } else {
          boulders.push(item(px, base, pz, x, y, a, w * 0.9, hr / 0.49, w * 0.85));
          boulderCol.push(new THREE.Color("#d6d5d0").multiplyScalar(0.88 + hash2(x, i) * 0.2));
        }
      }
      if (gold && !big) for (let j = 0; j < 3; j++) {
        // loose nuggets on the ground make small seams readable from far away
        const a = rot + 1.2 + j * 2.1, px = cx + Math.cos(a) * 0.36, pz = cz + Math.sin(a) * 0.36;
        crys.push(item(px, h(px, pz) - 0.01, pz, x, y, a, 0.8 * amt, 0.7 * amt, 0.8 * amt, { tl: 0.5 }));
      }
    };

    // --- rice patch: earthen bunds, wet floor and tufts that grow through 3 stages (1×1 or merged 2×2)
    const ricePatch = (x: number, y: number, n: number, ratio: number) => {
      const stage = ratio > 0.66 ? 2 : ratio > 0.33 ? 1 : 0;
      const base = h(x + n / 2, y + n / 2);
      paddy.push(item(x + n / 2, base + 0.005, y + n / 2, x, y, 0, n * 1.04, 1, n * 1.04));
      for (let i = 0; i < n; i++) {
        for (const edge of [0.05, n - 0.05]) {
          bunds.push(item(x + i + 0.5, h(x + i + 0.5, y + edge) - 0.01, y + edge, x, y, 0, 1));
          bunds.push(item(x + edge, h(x + edge, y + i + 0.5) - 0.01, y + i + 0.5, x, y, Math.PI / 2, 1));
        }
        const mid = n === 2 ? 1 : 0.5;
        bunds.push(item(x + i + 0.5, h(x + i + 0.5, y + mid) - 0.015, y + mid, x, y, 0, 0.98, 0.8, 0.8));
        if (n === 2) bunds.push(item(x + 1, h(x + 1, y + i + 0.5) - 0.015, y + i + 0.5, x, y, Math.PI / 2, 0.98, 0.8, 0.8));
      }
      const H = [0.10, 0.18, 0.26][stage];
      for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
        const ox = x + cx, oy = y + cy;
        for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) {
          const px = ox + 0.17 + k * 0.22 + (hash2(k, row + oy) - 0.5) * 0.04;
          const pz = oy + 0.16 + row * 0.2 + (row >= 2 ? 0.08 : 0);
          rice.push({ x: px, y: base + 0.015, z: pz, ry: hash2(ox + k, row) * TAU, sx: 1, sy: H * (0.85 + hash2(ox + k, oy + row) * 0.3), sz: 1, tx: ox, ty: oy, sway: k + row * 1.7 });
          riceCol.push(RICE[stage].clone().multiplyScalar(0.9 + hash2(k + ox, row) * 0.2));
        }
      }
    };

    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const c = grid[y][x];
      if (!c.res || !visible(x, y) || grouped.has(y * MAP_N + x)) continue;
      const amt = Math.max(0.55, Math.min(1, (c.resAmt || 200) / 260));
      const variant: string | undefined = c.resVariant;
      if (c.res === "gold" && c.resFootprint === 3 && c.resOrigin === y * MAP_N + x) {
        const cells = Array.from({ length: 9 }, (_, i) => ({ x: x + i % 3, y: y + Math.floor(i / 3) }));
        if (cells.every(t => visible(t.x, t.y) && grid[t.y]?.[t.x]?.res === "gold" &&
            grid[t.y][t.x].resOrigin === c.resOrigin)) {
          for (const t of cells) grouped.add(t.y * MAP_N + t.x);
          mine(x + 1.5, y + 1.5, x, y, true, true, 1, 3);
          continue;
        }
      }
      const footprint2 = (cell: any) => cell?.resFootprint === 2 || cell?.resourceSize === 2;
      const legacyBig = variant === undefined && c.res !== "food" && hash2(x + seed % 97, y + 17) > (c.res === "wood" ? 0.78 : 0.69);
      const wantsBig = footprint2(c) || legacyBig || c.res === "food";
      const large = wantsBig && [[1, 0], [0, 1], [1, 1]].every(([dx, dy]) => {
        const o = grid[y + dy]?.[x + dx];
        return o?.res === c.res && visible(x + dx, y + dy) && !grouped.has((y + dy) * MAP_N + x + dx) && (!footprint2(c) || footprint2(o));
      });
      if (large) { grouped.add(y * MAP_N + x + 1); grouped.add((y + 1) * MAP_N + x); grouped.add((y + 1) * MAP_N + x + 1); }
      if (c.res === "wood") {
        if (large) ancientTree(x + 1, y + 1, x, y);
        else if (variant === "single_tree") singleTree(x, y, amt);
        else if (variant === "forest") forest(x, y, amt);
        else if (variant === "bamboo") bambooClump(x, y, amt);
        else {
          const treeSeed = hash2(x + 43 + seed % 101, y - 25);
          if (treeSeed <= 0.48) bambooClump(x, y, amt);
          else if (treeSeed < 0.69) forest(x, y, amt);
          else singleTree(x, y, amt);
        }
      } else if (c.res === "food") {
        const ratio = clamp((c.resAmt || 0) / 240, 0, 1);
        ricePatch(x, y, large ? 2 : 1, ratio);
      } else if (c.res === "gold" || c.res === "stone") {
        if (large) mine(x + 1, y + 1, x, y, c.res === "gold", true, 1);
        else mine(x + 0.5, y + 0.5, x, y, c.res === "gold", false, amt);
      }
    }
    this.trunks.set(trunks);
    this.canopies.set(canopies, canopyCol);
    this.pines.set(pines, pineCol);
    this.stalks.set(stalks); this.leaves.set(leaves); this.rice.set(rice, riceCol); this.bunds.set(bunds); this.paddy.set(paddy);
    this.boulders.set(boulders, boulderCol);
    this.slabs.set(slabs, slabCol);
    this.crystals.set(crys); this.moss.set(moss);
  }

  private resourceSignature(state: any): number {
    let s = 0;
    const grid = state.grid, fog = state.fog;
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const c = grid[y][x];
      const r = c.res === "wood" ? 1 : c.res === "food" ? 2 : c.res === "gold" ? 3 : c.res === "stone" ? 4 : 0;
      if (!r) continue;
      const vis = (fog[y]?.[x] ?? 0) > 0 ? 1 : 0;
      const lvl = Math.min(4, Math.floor((c.resAmt || 0) / 70));
      s = (s * 31 + r * 13 + vis * 7 + lvl + y * 3 + x) | 0;
    }
    return s;
  }

  /** Frees every GPU resource this terrain owns (called when the map size / type changes). */
  dispose(): void {
    if (this.terrain) { this.group.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); this.terrain = null; }
    if (this.water) { this.water.geometry.dispose(); this.waterSurface?.dispose(); this.water = null; this.waterSurface = null; }
    this.pads?.dispose(); this.blooms?.dispose(); this.pads = null; this.blooms = null;
    for (const g of this.koiGeos) g.dispose();
    this.koiGeos = []; this.koi = [];
    this.bridges.traverse(o => { if ((o as THREE.Mesh).geometry && o !== this.bridges) (o as THREE.Mesh).geometry.dispose(); });
    for (const l of [this.stalks, this.leaves, this.rice, this.boulders, this.slabs, this.crystals, this.trunks, this.canopies, this.pines, this.grass, this.flowers, this.pebbles]) l.dispose(true);
    for (const l of [this.bunds, this.paddy, this.moss]) l.dispose(false); // cached materials
    this.footprint.geometry.dispose(); (this.footprint.material as THREE.Material).dispose();
    this.footEdges.geometry.dispose(); (this.footEdges.material as THREE.Material).dispose();
    this.group.clear();
    this.gridRef = null;
  }

  // -------------------------------------------------------------------------
  update(state: any, env: Env3D, t: number, scene: Scene3D, fx: FX3D): void {
    let terrainChanged = false;
    if (state.grid !== this.gridRef) {
      this.gridRef = state.grid;
      this.foundationKey = null;
      this.build(state);
      terrainChanged = true;
    } else if (this.refreshFoundations(state) && this.terrain) {
      const geometry = this.terrain.geometry;
      const vertices = geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) vertices.setY(i, terrainHeight(vertices.getX(i), vertices.getZ(i)));
      vertices.needsUpdate = true;
      geometry.computeVertexNormals();
      this.updateGroundBlend(geometry);
      this.resSig = -1;
      terrainChanged = true;
    }
    if (this.terrain && this.pbrQuality !== scene.quality) {
      scene.terrainPbr.bind(this.terrain.material as THREE.MeshStandardMaterial, scene.quality, rainWetness);
      this.pbrQuality = scene.quality;
    }
    if (terrainChanged || scene.quality !== this.decorationQuality) {
      this.decorate(state, scene.quality);
      this.decorationQuality = scene.quality;
    }
    if (scene.quality !== "low") this.updateGrassUnits(state, scene.target);
    else for (const slot of grassUnits.value) slot.setScalar(0);
    if (this.resSig === -1 || t >= this.nextResourceScan) {
      this.nextResourceScan = t + 0.12;
      const sig = this.resourceSignature(state);
      if (sig !== this.resSig) { this.resSig = sig; this.rebuildResources(state); }
    }

    let shakeCount = 0;
    for (const unit of state.units) {
      const tile = unit.targetTile;
      if (shakeCount >= chopWind.value.length) break;
      if (unit.workStyle !== "chop" || !tile) continue;
      const shake = shakeX(tile.tx, tile.ty);
      if (shake) chopWind.value[shakeCount++].set(tile.tx + 0.5, tile.ty + 0.5, Math.abs(shake));
    }
    while (shakeCount < chopWind.value.length) chopWind.value[shakeCount++].set(0, 0, 0);
    this.crystalMat.emissiveIntensity = 0.32 + Math.max(0, Math.sin(t * 1.7)) * 0.38;
    const { weather, quality } = scene;
    this.waterSurface?.update(t, quality === "low" ? 1 : 2, weather.rain);
    if (this.pads) this.pads.animate(it => Math.sin(t * 1.3 + it.sway) * 0.03);
    if (this.blooms) {
      for (const it of this.blooms.items) it.y = WATER_LEVEL + 0.03 + Math.sin(t * 1.4 + it.sway) * 0.012;
      this.blooms.animate(it => Math.sin(t * 1.1 + it.sway) * 0.05);
    }
    for (const k of this.koi) {
      const a = k.ph + t * k.sp * k.dir;
      const x = k.cx + Math.cos(a) * k.rx, z = k.cz + Math.sin(a) * k.rz;
      const dx = -Math.sin(a) * k.rx * k.dir, dz = Math.cos(a) * k.rz * k.dir;
      k.g.position.set(x, WATER_LEVEL - 0.055 + Math.sin(t * 0.9 + k.ph) * 0.012, z);
      k.g.rotation.y = Math.atan2(dx, dz) + Math.sin(t * 6 + k.ph) * 0.08;
      k.tail.rotation.y = Math.sin(t * 9 + k.ph) * 0.5;
      if (quality !== "low" && t >= (k.rippleAt ?? k.ph)) {
        k.rippleAt = t + 3.6 + k.sp;
        if (state.fog[Math.floor(z)]?.[Math.floor(x)] === 2 && Math.hypot(scene.target.x - x, scene.target.z - z) < 18) {
          fx.ripple(x, WATER_LEVEL, z);
        }
      }
    }

    // glowing placement footprint (only while placing a building)
    const hover = env.getHover();
    if (state.buildMode && hover) {
      const fp = env.bldgFoot ? env.bldgFoot(state.buildMode) : { w: env.bldgSize(state.buildMode), h: env.bldgSize(state.buildMode) };
      const ok = env.canPlace(hover.tx, hover.ty, fp.w, fp.h);
      const fm = this.footprint.material as THREE.MeshBasicMaterial;
      fm.color.set(ok ? 0x22c55e : 0xef4444);
      fm.opacity = 0.35 + Math.sin(t * 6) * 0.1;
      let hMax = 0;
      for (let dz = 0; dz <= fp.h; dz++) for (let dx = 0; dx <= fp.w; dx++) hMax = Math.max(hMax, terrainHeight(hover.tx + dx, hover.ty + dz));
      this.footprint.position.set(hover.tx + fp.w / 2, hMax + 0.05, hover.ty + fp.h / 2);
      this.footprint.scale.set(fp.w * 0.98, 1, fp.h * 0.98);
      this.footprint.visible = true;
    } else this.footprint.visible = false;
  }
}
