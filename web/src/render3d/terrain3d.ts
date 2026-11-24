// Pixel Dynasty 3D — sculpted seamless terrain, living lotus lake, wooden bridges and instanced resources.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { shakeX } from "../graphics/villagerActions";
import {
  MAP_N, WATER_LEVEL, BRIDGE_DECK, fbm, hash2, smoothstep, terrainHeight, wetness, setWaterGrid, mat, Env3D
} from "./common";

const SEG = MAP_N * 4;

// ---------------------------------------------------------------------------
// Geometry merger (collapses many static pieces into one draw call per material)
class Merger {
  private parts: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  add(g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0): void {
    const c = g.index ? g.toNonIndexed() : g.clone();
    if (c.getAttribute("uv")) c.deleteAttribute("uv");
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
interface Item { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; tx: number; ty: number; sway: number; }

class InstLayer {
  mesh: THREE.InstancedMesh;
  items: Item[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  constructor(readonly group: THREE.Group, readonly geometry: THREE.BufferGeometry, readonly material: THREE.Material, private capacity = 64) {
    this.mesh = this.make(capacity);
  }
  private make(n: number): THREE.InstancedMesh {
    const me = new THREE.InstancedMesh(this.geometry, this.material, n);
    me.castShadow = true; me.receiveShadow = true; me.count = 0; me.frustumCulled = false;
    me.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(me);
    return me;
  }
  set(items: Item[], colors?: THREE.Color[]): void {
    this.items = items;
    if (items.length > this.capacity) {
      this.group.remove(this.mesh); this.mesh.dispose();
      this.capacity = Math.ceil(items.length * 1.5);
      this.mesh = this.make(this.capacity);
    }
    this.mesh.count = items.length;
    if (colors) { for (let i = 0; i < items.length; i++) this.mesh.setColorAt(i, colors[i]); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    this.animate(0, () => 0);
  }
  /** Rewrite matrices; `bend(item)` returns an extra tilt (radians) for wind sway / chopping shake. */
  animate(_t: number, bend: (it: Item) => number): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const b = bend(it);
      this.e.set(b * 0.6, it.ry, b);
      this.m4.compose(this.p.set(it.x, it.y, it.z), this.q.setFromEuler(this.e), this.s.set(it.sx, it.sy, it.sz));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function bambooStalkGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.032, 0.042, 1, 6, 7);
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const node = Math.abs(y * 7 - Math.round(y * 7)) < 0.02;
    const c = node ? [0.2, 0.36, 0.12] : [0.36 + y * 0.18, 0.62 + y * 0.12, 0.22];
    col.set(c, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------------------
export class Terrain3D {
  readonly group = new THREE.Group();
  private terrain: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private waterBase: Float32Array | null = null;
  private lake = new THREE.Group();
  private lotus: { obj: THREE.Object3D; base: number; ph: number }[] = [];
  private bridges = new THREE.Group();
  private gridRef: any = null;
  private resSig = -1;
  private readonly res = new THREE.Group();
  private stalks: InstLayer;
  private leaves: InstLayer;
  private rice: InstLayer;
  private paddy: InstLayer;
  private rocks: InstLayer;
  private crystals: InstLayer;
  private moss: InstLayer;
  private footprint: THREE.Mesh;
  private footEdges: THREE.LineSegments;
  readonly heightCache = new Float32Array((MAP_N + 1) * (MAP_N + 1));

  constructor() {
    this.group.add(this.lake, this.bridges, this.res);
    const leafG = new THREE.ConeGeometry(0.22, 0.42, 7); leafG.translate(0, 0.21, 0);
    this.stalks = new InstLayer(this.res, bambooStalkGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 160);
    this.leaves = new InstLayer(this.res, leafG, mat("#2f8f3a", { rough: 0.7, flat: true }), 260);
    const riceG = new THREE.ConeGeometry(0.05, 0.3, 5); riceG.translate(0, 0.15, 0);
    this.rice = new InstLayer(this.res, riceG, mat("#e2b23a", { rough: 0.55, flat: true }), 200);
    const paddyG = new THREE.BoxGeometry(0.86, 0.06, 0.26); paddyG.translate(0, 0.03, 0);
    this.paddy = new InstLayer(this.res, paddyG, mat("#6f5a2c", { rough: 0.9 }), 60);
    this.rocks = new InstLayer(this.res, new THREE.DodecahedronGeometry(0.2, 0), mat("#7d8590", { rough: 0.85, flat: true }), 80);
    const crysG = new THREE.OctahedronGeometry(0.09, 0); crysG.scale(1, 2.1, 1);
    this.crystals = new InstLayer(this.res, crysG, mat("#f5b830", { metal: 0.75, rough: 0.25, emissive: "#4a2a00", flat: true }), 80);
    const mossG = new THREE.SphereGeometry(0.12, 7, 5); mossG.scale(1, 0.45, 1);
    this.moss = new InstLayer(this.res, mossG, mat("#4f7a2c", { rough: 0.95 }), 40);

    this.footprint = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.footEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.08, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }));
    this.footprint.add(this.footEdges);
    this.footprint.visible = false; this.footprint.renderOrder = 5;
    this.group.add(this.footprint);
  }

  /** Average terrain height under a footprint (used to seat buildings). */
  heightAt(x: number, z: number): number { return terrainHeight(x, z); }

  // -------------------------------------------------------------------------
  private build(state: any): void {
    const grid = state.grid;
    setWaterGrid(grid);
    for (let z = 0; z <= MAP_N; z++) for (let x = 0; x <= MAP_N; x++) this.heightCache[z * (MAP_N + 1) + x] = terrainHeight(x, z);
    if (this.terrain) { this.group.remove(this.terrain); this.terrain.geometry.dispose(); }
    this.terrain = this.buildTerrain(state);
    this.group.add(this.terrain);
    this.buildLake(grid);
    this.buildBridges(grid);
    this.resSig = -1;
  }

  private pathSegments(state: any): number[][] {
    // curved footpaths radiating from every Đình Làng (town centre) toward the lake and along the valley
    const segs: number[][] = [];
    const tcs = (state.buildings || []).filter((b: any) => b.type === "town_center");
    for (const tc of tcs) {
      const cx = tc.tx + tc.size / 2, cz = tc.ty + tc.size / 2;
      const dirs: [number, number][] = [[MAP_N / 2 - cx, MAP_N / 2 - cz], [MAP_N / 2 - cx, 0], [0, MAP_N / 2 - cz]];
      dirs.forEach(([dx, dz], di) => {
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
        const reach = di === 0 ? Math.max(2, len - 3.2) : Math.min(7, len);
        let px = cx, pz = cz;
        for (let k = 1; k <= 14; k++) {
          const t = (k / 14) * reach;
          const wob = Math.sin(t * 0.9 + di * 2 + tc.tx) * 0.55;
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
    const g = new THREE.PlaneGeometry(MAP_N + 6, MAP_N + 6, SEG + 24, SEG + 24);
    g.rotateX(-Math.PI / 2);
    g.translate(MAP_N / 2, 0, MAP_N / 2);
    const pos = g.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const segs = this.pathSegments(state);
    const cMeadow = new THREE.Color("#6f9a34"), cMoss = new THREE.Color("#3f6b25"), cSun = new THREE.Color("#9cb84a");
    const cSand = new THREE.Color("#cdb27a"), cBed = new THREE.Color("#2c4a3c"), cDirt = new THREE.Color("#8a6a45"), cCobble = new THREE.Color("#a5927a");
    const cForest = new THREE.Color("#2f5420"), cGravel = new THREE.Color("#7a7468"), cMud = new THREE.Color("#6b5a34");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.35, z * 0.35);
      c.copy(cMoss).lerp(cMeadow, smoothstep(0.25, 0.7, n)).lerp(cSun, smoothstep(0.05, 0.3, h) * 0.55);
      // resource floors
      const cell = grid[Math.floor(z)]?.[Math.floor(x)];
      if (cell?.res === "wood") c.lerp(cForest, 0.45);
      else if (cell?.res === "gold" || cell?.res === "stone") c.lerp(cGravel, 0.35);
      else if (cell?.res === "food") c.lerp(cMud, 0.3);
      // footpaths (dirt + cobblestones)
      let d = 9;
      for (const s of segs) {
        const vx = s[2] - s[0], vz = s[3] - s[1], l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - s[0]) * vx + (z - s[1]) * vz) / l2));
        const ex = s[0] + vx * t - x, ez = s[1] + vz * t - z;
        d = Math.min(d, ex * ex + ez * ez);
      }
      const path = 1 - smoothstep(0.06, 0.16, d);
      if (path > 0) c.lerp(hash2(Math.floor(x * 6), Math.floor(z * 6)) > 0.55 ? cCobble : cDirt, path * 0.85);
      // shoreline sand -> lake bed
      const w = wetness(x, z);
      if (w > 0) c.lerp(cSand, smoothstep(0, 0.35, w) * 0.9).lerp(cBed, smoothstep(0.45, 0.9, w));
      // outside the playable map: darker valley rim
      const out = Math.max(0, -x, -z, x - MAP_N, z - MAP_N);
      if (out > 0) c.multiplyScalar(Math.max(0.35, 1 - out * 0.22));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const me = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    me.receiveShadow = true;
    me.name = "terrain";
    return me;
  }

  private buildLake(grid: any[][]): void {
    this.group.remove(this.lake);
    this.lake.traverse(o => { if ((o as THREE.Mesh).geometry && o !== this.lake) (o as THREE.Mesh).geometry.dispose(); });
    this.lake = new THREE.Group();
    this.lotus = [];
    this.group.add(this.lake);
    let x0 = MAP_N, z0 = MAP_N, x1 = -1, z1 = -1;
    const cells: [number, number][] = [];
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const t = grid[y][x].terrain;
      if (t === "water" || t === "bridge") { x0 = Math.min(x0, x); z0 = Math.min(z0, y); x1 = Math.max(x1, x); z1 = Math.max(z1, y); if (t === "water") cells.push([x, y]); }
    }
    this.water = null; this.waterBase = null;
    if (x1 < 0) return;
    const w = x1 - x0 + 3, d = z1 - z0 + 3;
    const wg = new THREE.PlaneGeometry(w, d, w * 6, d * 6);
    wg.rotateX(-Math.PI / 2);
    wg.translate(x0 - 1 + w / 2, WATER_LEVEL, z0 - 1 + d / 2);
    this.waterBase = Float32Array.from(wg.getAttribute("position").array as ArrayLike<number>);
    const wm = new THREE.MeshStandardMaterial({ color: "#1f8f78", emissive: "#063a30", emissiveIntensity: 0.6, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.8 });
    this.water = new THREE.Mesh(wg, wm);
    this.water.receiveShadow = true;
    this.water.renderOrder = 2;
    this.lake.add(this.water);

    // floating lily pads + multi-petal lotus blossoms
    const padG = new THREE.CircleGeometry(0.15, 14, 0.35, Math.PI * 2 - 0.35); padG.rotateX(-Math.PI / 2);
    const padM = mat("#3c8a3a", { rough: 0.6, side: THREE.DoubleSide });
    const petals: THREE.BufferGeometry[] = [];
    for (let ring = 0; ring < 2; ring++) {
      const n = ring === 0 ? 8 : 6;
      for (let k = 0; k < n; k++) {
        const p = new THREE.SphereGeometry(0.05, 7, 5);
        p.scale(0.55, 0.3, 1.25);
        p.translate(0, 0, 0.055);
        p.rotateX(-(ring === 0 ? 0.55 : 1.0));
        p.rotateY((k / n) * Math.PI * 2 + ring * 0.3);
        p.translate(0, ring * 0.02, 0);
        petals.push(p.toNonIndexed());
      }
    }
    const lotusG = mergeGeometries(petals, false)!;
    const lotusM = mat("#f29ab8", { rough: 0.5, emissive: "#3a0f1c", emissiveIntensity: 0.35 });
    const seedG = new THREE.CylinderGeometry(0.03, 0.02, 0.03, 8);
    const seedM = mat("#f3d34a", { emissive: "#3a2a00" });
    let idx = 0;
    for (const [cx, cz] of cells) {
      for (let k = 0; k < 3; k++) {
        const r = hash2(cx * 3.1 + k, cz * 7.7 - k);
        if (r < 0.25) continue;
        const px = cx + 0.2 + hash2(cx + k * 1.7, cz) * 0.6, pz = cz + 0.2 + hash2(cx, cz + k * 2.3) * 0.6;
        const pad = new THREE.Mesh(padG, padM);
        pad.position.set(px, WATER_LEVEL + 0.012, pz); pad.rotation.y = r * 6.28; pad.scale.setScalar(0.8 + r * 0.6);
        pad.receiveShadow = true;
        this.lake.add(pad);
        this.lotus.push({ obj: pad, base: WATER_LEVEL + 0.012, ph: r * 9 });
        if ((idx++) % 2 === 0) {
          const bloom = new THREE.Group();
          const pm = new THREE.Mesh(lotusG, lotusM); pm.castShadow = true;
          const sm = new THREE.Mesh(seedG, seedM); sm.position.y = 0.02;
          bloom.add(pm, sm);
          bloom.position.set(px + 0.03, WATER_LEVEL + 0.03, pz - 0.02);
          bloom.scale.setScalar(1 + r * 0.5);
          this.lake.add(bloom);
          this.lotus.push({ obj: bloom, base: WATER_LEVEL + 0.03, ph: r * 9 + 1 });
        }
      }
    }
  }

  private buildBridges(grid: any[][]): void {
    this.group.remove(this.bridges);
    this.bridges.traverse(o => { if ((o as THREE.Mesh).geometry && o !== this.bridges) (o as THREE.Mesh).geometry.dispose(); });
    this.bridges = new THREE.Group();
    this.group.add(this.bridges);
    const planks = new Merger(), timber = new Merger(), rails = new Merger();
    const slat = new THREE.BoxGeometry(1, 1, 1);
    const post = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
    const isBridge = (x: number, y: number) => grid[y]?.[x]?.terrain === "bridge";
    const isLand = (x: number, y: number) => { const t = grid[y]?.[x]?.terrain; return t !== undefined && t !== "water" && t !== "bridge"; };
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const c = grid[y][x];
      if (c.terrain !== "bridge") continue;
      const dir: string = c.bridge || "h";
      const cx = x + 0.5, cz = y + 0.5, top = BRIDGE_DECK;
      const along = (alongX: boolean) => {
        // extend onto the shore where the bridge meets land
        const ext0 = alongX ? (isLand(x - 1, y) ? 0.45 : 0) : (isLand(x, y - 1) ? 0.45 : 0);
        const ext1 = alongX ? (isLand(x + 1, y) ? 0.45 : 0) : (isLand(x, y + 1) ? 0.45 : 0);
        const a0 = -0.5 - ext0, a1 = 0.5 + ext1;
        const n = Math.round((a1 - a0) / 0.14);
        for (let k = 0; k < n; k++) {
          const a = a0 + (k + 0.5) * ((a1 - a0) / n);
          const lift = (ext0 && a < -0.5 ? (a + 0.5) * 0.12 : 0) + (ext1 && a > 0.5 ? -(a - 0.5) * 0.12 : 0);
          const shade = 0.96 + hash2(x * 9 + k, y * 5) * 0.08;
          if (alongX) planks.add(slat, cx + a, top + lift, cz, 0.12, 0.05 * shade, 0.9, 0, 0, (hash2(k, y) - 0.5) * 0.04);
          else planks.add(slat, cx, top + lift, cz + a, 0.9, 0.05 * shade, 0.12, 0, (hash2(x, k) - 0.5) * 0.04, 0);
        }
        // stringers under the deck
        for (const s of [-0.32, 0.32]) {
          if (alongX) timber.add(slat, cx + (ext1 - ext0) / 2, top - 0.06, cz + s, a1 - a0, 0.07, 0.08);
          else timber.add(slat, cx + s, top - 0.06, cz + (ext1 - ext0) / 2, 0.08, 0.07, a1 - a0);
        }
        // side railings (skip the side where another bridge arm joins)
        for (const s of [-0.46, 0.46]) {
          const sideBridge = alongX ? isBridge(x, y + Math.sign(s)) : isBridge(x + Math.sign(s), y);
          if (sideBridge) continue;
          if (alongX) { rails.add(slat, cx, top + 0.27, cz + s, 1, 0.045, 0.05); rails.add(slat, cx, top + 0.14, cz + s, 1, 0.03, 0.035); }
          else { rails.add(slat, cx + s, top + 0.27, cz, 0.05, 0.045, 1); rails.add(slat, cx + s, top + 0.14, cz, 0.035, 0.03, 1); }
          for (const p of [-0.5, 0, 0.5]) {
            if (alongX) rails.add(post, cx + p, top + 0.15, cz + s, 0.05, 0.32, 0.05);
            else rails.add(post, cx + s, top + 0.15, cz + p, 0.05, 0.32, 0.05);
          }
        }
      };
      if (dir === "x") {
        for (let k = 0; k < 7; k++) planks.add(slat, cx - 0.43 + k * 0.143, top, cz, 0.13, 0.05, 0.92);
        timber.add(slat, cx, top - 0.06, cz, 0.9, 0.07, 0.9);
        for (const [px, pz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) rails.add(post, cx + px, top + 0.17, cz + pz, 0.06, 0.38, 0.06);
      } else along(dir === "h");
      // timber support pilings down into the lake bed
      for (const [px, pz] of [[-0.36, -0.36], [0.36, 0.36], [-0.36, 0.36], [0.36, -0.36]]) {
        timber.add(post, cx + px, (top - 0.62) / 2, cz + pz, 0.07, top + 0.62, 0.07);
      }
    }
    const a = planks.build(mat("#a8733f", { rough: 0.8 }));
    const b = timber.build(mat("#5a3a22", { rough: 0.85 }));
    const r = rails.build(mat("#7a1e1a", { rough: 0.6 }));
    for (const m of [a, b, r]) if (m) this.bridges.add(m);
  }

  // -------------------------------------------------------------------------
  private rebuildResources(state: any): void {
    const grid = state.grid, fog = state.fog;
    const stalks: Item[] = [], leaves: Item[] = [], rice: Item[] = [], paddy: Item[] = [], rocks: Item[] = [], crys: Item[] = [], moss: Item[] = [];
    const rockCol: THREE.Color[] = [];
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const c = grid[y][x];
      if (!c.res || (fog[y]?.[x] ?? 0) === 0) continue;
      const h = (dx: number, dz: number) => terrainHeight(x + dx, y + dz);
      const amt = Math.max(0.55, Math.min(1, (c.resAmt || 200) / 260));
      if (c.res === "wood") {
        for (let k = 0; k < 5; k++) {
          const a = k * 1.256 + hash2(x, y) * 3, r = k === 0 ? 0 : 0.2 + hash2(x + k, y) * 0.12;
          const px = x + 0.5 + Math.cos(a) * r, pz = y + 0.5 + Math.sin(a) * r;
          const ht = (1.15 + hash2(x * 2 + k, y * 3) * 0.6) * amt;
          const base = h(px - x, pz - y);
          stalks.push({ x: px, y: base, z: pz, ry: a, sx: 1, sy: ht, sz: 1, tx: x, ty: y, sway: k });
          leaves.push({ x: px, y: base + ht * 0.82, z: pz, ry: a, sx: 1, sy: 1, sz: 1, tx: x, ty: y, sway: k });
          leaves.push({ x: px, y: base + ht * 0.62, z: pz, ry: a + 1, sx: 1.25, sy: 0.9, sz: 1.25, tx: x, ty: y, sway: k });
        }
      } else if (c.res === "food") {
        for (let row = 0; row < 3; row++) {
          const pz = y + 0.2 + row * 0.3, base = h(0.5, pz - y) + row * 0.04;
          paddy.push({ x: x + 0.5, y: base, z: pz, ry: 0, sx: 1, sy: 1, sz: 1, tx: x, ty: y, sway: 0 });
          for (let k = 0; k < 5; k++) {
            const px = x + 0.16 + k * 0.17;
            rice.push({ x: px, y: base + 0.05, z: pz + (hash2(k, row) - 0.5) * 0.08, ry: k, sx: 1, sy: amt * (0.85 + hash2(x + k, y + row) * 0.3), sz: 1, tx: x, ty: y, sway: k + row });
          }
        }
      } else {
        const gold = c.res === "gold";
        for (let k = 0; k < 3; k++) {
          const px = x + 0.3 + hash2(x + k, y * 2) * 0.4, pz = y + 0.3 + hash2(x * 2, y + k) * 0.4;
          const s = (k === 0 ? 1.5 : 1) * (0.85 + hash2(x + k * 3, y) * 0.4) * amt;
          rocks.push({ x: px, y: h(px - x, pz - y) + 0.08 * s, z: pz, ry: hash2(k, x) * 6, sx: s, sy: s * 0.8, sz: s, tx: x, ty: y, sway: 0 });
          rockCol.push(new THREE.Color(gold ? "#8a7f6e" : "#8d949c").multiplyScalar(0.85 + hash2(x, y + k) * 0.3));
        }
        if (gold) {
          for (let k = 0; k < 5; k++) {
            const a = k * 1.3 + hash2(x, y) * 2, r = 0.12 + hash2(k, y) * 0.18;
            const px = x + 0.5 + Math.cos(a) * r, pz = y + 0.5 + Math.sin(a) * r;
            crys.push({ x: px, y: h(px - x, pz - y) + 0.16, z: pz, ry: a, sx: amt, sy: amt * (0.8 + hash2(x + k, y) * 0.6), sz: amt, tx: x, ty: y, sway: 0 });
          }
        } else {
          for (let k = 0; k < 2; k++) {
            const px = x + 0.35 + k * 0.3, pz = y + 0.4 + hash2(x, k) * 0.2;
            moss.push({ x: px, y: h(px - x, pz - y) + 0.2, z: pz, ry: 0, sx: 1, sy: 1, sz: 1, tx: x, ty: y, sway: 0 });
          }
        }
      }
    }
    this.stalks.set(stalks); this.leaves.set(leaves); this.rice.set(rice); this.paddy.set(paddy);
    this.rocks.set(rocks, rockCol); this.crystals.set(crys); this.moss.set(moss);
  }

  private resourceSignature(state: any): number {
    let s = 0;
    const grid = state.grid, fog = state.fog;
    for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
      const c = grid[y][x];
      const r = c.res === "wood" ? 1 : c.res === "food" ? 2 : c.res === "gold" ? 3 : c.res === "stone" ? 4 : 0;
      const vis = r && (fog[y]?.[x] ?? 0) > 0 ? 1 : 0;
      const lvl = r ? Math.min(4, Math.floor((c.resAmt || 0) / 70)) : 0;
      s = (s * 31 + r * 13 + vis * 7 + lvl + y * 3 + x) | 0;
    }
    return s;
  }

  // -------------------------------------------------------------------------
  update(state: any, env: Env3D, t: number): void {
    if (state.grid !== this.gridRef) { this.gridRef = state.grid; this.build(state); }
    const sig = this.resourceSignature(state);
    if (sig !== this.resSig) { this.resSig = sig; this.rebuildResources(state); }

    // bamboo sways in the wind and shakes when a villager chops it; rice ripples
    const wind = (it: Item) => Math.sin(t * 1.6 + it.x * 0.7 + it.z * 0.5 + it.sway) * 0.035;
    const chop = (it: Item) => { const s = shakeX(it.tx, it.ty); return s ? s * 0.06 * Math.sin(t * 40 + it.sway) : 0; };
    this.stalks.animate(t, it => wind(it) + chop(it));
    this.leaves.animate(t, it => wind(it) * 1.6 + chop(it) * 1.4);
    this.rice.animate(t, it => Math.sin(t * 2.2 + it.x * 3 + it.sway) * 0.09);

    // shimmering water surface
    if (this.water && this.waterBase) {
      const p = this.water.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = p.array as Float32Array, base = this.waterBase;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        arr[i * 3 + 1] = WATER_LEVEL + Math.sin(x * 3.1 + t * 1.7) * 0.012 + Math.cos(z * 2.7 - t * 1.3) * 0.012 + Math.sin((x + z) * 6 + t * 3) * 0.004;
      }
      p.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
    for (const l of this.lotus) {
      l.obj.position.y = l.base + Math.sin(t * 1.4 + l.ph) * 0.012;
      l.obj.rotation.y += 0.0015 * Math.sin(l.ph);
    }

    // glowing placement footprint (only while placing a building)
    const hover = env.getHover();
    if (state.buildMode && hover) {
      const size = env.bldgSize(state.buildMode);
      const ok = env.canPlace(hover.tx, hover.ty, size);
      const fm = this.footprint.material as THREE.MeshBasicMaterial;
      fm.color.set(ok ? 0x22c55e : 0xef4444);
      fm.opacity = 0.35 + Math.sin(t * 6) * 0.1;
      let hMax = 0;
      for (let dz = 0; dz <= size; dz++) for (let dx = 0; dx <= size; dx++) hMax = Math.max(hMax, terrainHeight(hover.tx + dx, hover.ty + dz));
      this.footprint.position.set(hover.tx + size / 2, hMax + 0.05, hover.ty + size / 2);
      this.footprint.scale.set(size * 0.98, 1, size * 0.98);
      this.footprint.visible = true;
    } else this.footprint.visible = false;
  }
}
