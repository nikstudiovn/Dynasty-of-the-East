// Dynasty of the East 3D — pooled instanced particles, shockwave rings and scorch decals (zero per-frame allocation),
// plus the Chặng 3 combat layer: per-target hit flash, command ripples, impact dust rings, batched torch
// sprites and a camera-kick request. Every new effect is quality-gated (low keeps only the cheap ones).
import * as THREE from "three";
import { disposeTree } from "./common";
import { softMask } from "./surfaces";

export type FxQuality = "low" | "medium" | "high";

let sparkTexture: THREE.CanvasTexture | undefined;
/** 64×64 hot-core particle sprite generated locally (offline) — shared by sparks, embers and torches. */
export function sparkMask(): THREE.CanvasTexture {
  if (sparkTexture) return sparkTexture;
  const size = 64;
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,250,235,0.92)");
    g.addColorStop(0.45, "rgba(255,220,170,0.38)");
    g.addColorStop(1, "rgba(255,200,140,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sparkTexture = new THREE.CanvasTexture(canvas);
  sparkTexture.colorSpace = THREE.SRGBColorSpace;
  return sparkTexture;
}

interface PoolOpts { capacity: number; style: "chip" | "smoke" | "spark"; size: number; map?: THREE.Texture; }

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly n: number;
  private readonly opacity?: THREE.InstancedBufferAttribute;
  private readonly style: PoolOpts["style"];
  density = 1;
  private readonly p: Float32Array; // x y z
  private readonly v: Float32Array; // vx vy vz
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly grow: Float32Array;
  private head = 0;
  private alive = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(o: PoolOpts) {
    this.n = o.capacity;
    this.style = o.style;
    const billboard = o.style !== "chip";
    const g = billboard ? new THREE.PlaneGeometry(o.size, o.size) : new THREE.TetrahedronGeometry(o.size, 0);
    const m = billboard
      ? new THREE.MeshBasicMaterial({ map: o.map ?? softMask(), color: 0xffffff, transparent: true,
          blending: o.style === "spark" ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.87, flatShading: true });
    if (billboard) {
      m.userData.sharedTexture = true;
      this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(this.n), 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("aParticleOpacity", this.opacity);
      m.onBeforeCompile = shader => {
        shader.vertexShader = "attribute float aParticleOpacity; varying float vParticleOpacity;\n" +
          shader.vertexShader.replace("#include <project_vertex>", `
            vParticleOpacity = aParticleOpacity;
            vec4 mvPosition = modelViewMatrix * instanceMatrix[3];
            mvPosition.xy += transformed.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
            gl_Position = projectionMatrix * mvPosition;
          `);
        shader.fragmentShader = "varying float vParticleOpacity;\n" + shader.fragmentShader.replace(
          "#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.a *= vParticleOpacity;"
        );
      };
    }
    this.mesh = new THREE.InstancedMesh(g, m, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = o.style === "smoke" ? 4 : 5;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.p = new Float32Array(this.n * 3); this.v = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n); this.maxLife = new Float32Array(this.n);
    this.size = new Float32Array(this.n); this.grav = new Float32Array(this.n); this.grow = new Float32Array(this.n);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, this.c.set(0xffffff)); }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number | string, gravity = -6, grow = 0): void {
    const i = this.head; this.head = (this.head + 1) % this.n;
    if (this.life[i] <= 0) this.alive++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grav[i] = gravity; this.grow[i] = grow;
    this.mesh.setColorAt(i, this.c.set(color as any));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  burst(x: number, y: number, z: number, count: number, speed: number, up: number, life: number, size: number, colors: (number | string)[], gravity = -6, grow = 0): void {
    for (let k = 0; k < Math.max(1, Math.round(count * this.density)); k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, up * (0.5 + Math.random() * 0.7), Math.sin(a) * s, life * (0.6 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.6), colors[k % colors.length], gravity, grow);
    }
  }

  update(dt: number): void {
    if (this.alive <= 0) return;
    let alive = 0;
    this.mesh.visible = true;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); continue; }
      alive++;
      const j = i * 3;
      this.v[j + 1] += this.grav[i] * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.02 && this.grav[i] < 0) { this.p[j + 1] = 0.02; this.v[j + 1] *= -0.3; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      const k = this.life[i] / this.maxLife[i];
      const sz = this.size[i] * (this.grow[i] ? 1 + (1 - k) * this.grow[i] : Math.min(1, k * 2.2));
      const age = this.maxLife[i] - this.life[i];
      this.e.set(age * 3 + i, age * 2.3 + i * 0.7, 0);
      this.q.setFromEuler(this.e);
      const spark = this.style === "spark";
      this.m4.compose(this.t.set(this.p[j], this.p[j + 1], this.p[j + 2]), this.q, this.s.set(sz, sz * (spark ? 2.5 : 1), sz));
      this.opacity?.setX(i, Math.min(1, k * 1.8) * (spark ? 0.9 : 0.55));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.alive = alive;
    this.mesh.visible = alive > 0;
    if (this.opacity) this.opacity.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get active(): number { return this.alive; }

  clear(): void {
    for (let i = 0; i < this.n; i++) { this.life[i] = 0; this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); }
    this.alive = 0;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; scale: number; }
interface Flash { root: THREE.Object3D | null; until: number; swapped: Array<[THREE.Mesh, THREE.Material]>; }

const TORCH_CAP = 96;
const FLASH_TIME = 0.08;

export class FX3D {
  readonly group = new THREE.Group();
  readonly debris = new ParticlePool({ capacity: 260, style: "chip", size: 0.060 });
  readonly smoke = new ParticlePool({ capacity: 128, style: "smoke", size: 0.26 });
  /** Shared additive pool (≤ 220): fire, melee sparks, embers, muzzle flashes — 64×64 canvas sprite. */
  readonly glow = new ParticlePool({ capacity: 220, style: "spark", size: 0.076, map: sparkMask() });
  quality: FxQuality = "high";
  /** medium / high: sparks, fire smoke, dust, torches and camera kicks are allowed. */
  get rich(): boolean { return this.quality !== "low"; }
  private time = 0;
  private shakePending = 0;
  private readonly commands: Ring[] = [];
  private commandHead = 0;
  private readonly dust: Ring[] = [];
  private dustHead = 0;
  private readonly flashes: Flash[] = Array.from({ length: 24 }, () => ({ root: null, until: 0, swapped: [] }));
  private readonly flashMats = new Map<THREE.Material, THREE.Material>();
  private readonly torchPos = new Float32Array(TORCH_CAP * 3);
  private readonly torchCol = new Float32Array(TORCH_CAP * 3);
  private readonly torchGeo = new THREE.BufferGeometry();
  private readonly torches: THREE.Points;
  private torchCount = 0;
  private readonly rings: Ring[] = [];
  private readonly accents: Ring[] = [];
  private accentHead = 0;
  private readonly scorch: Ring[] = [];
  private ringHead = 0;
  private scorchHead = 0;

  constructor() {
    this.group.add(this.debris.mesh, this.glow.mesh, this.smoke.mesh);
    // command ripples: bronze-gold for a valid move, vermilion for attack / attack-move
    const cg = new THREE.RingGeometry(0.8, 1, 48); cg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xc9a04a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
      const me = new THREE.Mesh(cg, m); me.visible = false; me.renderOrder = 6;
      this.commands.push({ mesh: me, mat: m, life: 0, max: 0.6, scale: 1 }); this.group.add(me);
    }
    // catapult impact dust rings (beige, normal blending)
    const dg2 = new THREE.RingGeometry(0.55, 1, 40); dg2.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xb8a07c, map: softMask(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      m.userData.sharedTexture = true;
      const me = new THREE.Mesh(dg2, m); me.visible = false; me.renderOrder = 3;
      this.dust.push({ mesh: me, mat: m, life: 0, max: 0.9, scale: 2.4 }); this.group.add(me);
    }
    // warm torch flames for Đình Làng / Vọng Lâu / Hoàng Thành: one batched Points draw call
    this.torchGeo.setAttribute("position", new THREE.BufferAttribute(this.torchPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.torchGeo.setAttribute("color", new THREE.BufferAttribute(this.torchCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.torchGeo.setDrawRange(0, 0);
    const tm = new THREE.PointsMaterial({ size: 0.62, map: sparkMask(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
    tm.userData.sharedTexture = true;
    this.torches = new THREE.Points(this.torchGeo, tm);
    this.torches.frustumCulled = false;
    this.torches.renderOrder = 6;
    this.torches.visible = false;
    this.group.add(this.torches);
    const rg = new THREE.RingGeometry(0.7, 1, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const me = new THREE.Mesh(rg, m); me.visible = false; me.renderOrder = 3;
      this.rings.push({ mesh: me, mat: m, life: 0, max: 0.7, scale: 2.2 }); this.group.add(me);
    }
    const arc = new THREE.RingGeometry(0.79, 1, 24, 1, 0.22, Math.PI * 0.64).rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0xffedd3, map: softMask(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      m.userData.sharedTexture = true;
      const mesh = new THREE.Mesh(arc, m);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.accents.push({ mesh, mat: m, life: 0, max: 0.22, scale: 1 });
      this.group.add(mesh);
    }
    const dg = new THREE.CircleGeometry(1, 24); dg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x140d08, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const me = new THREE.Mesh(dg, m); me.visible = false; me.renderOrder = 1;
      this.scorch.push({ mesh: me, mat: m, life: 0, max: 9, scale: 1 }); this.group.add(me);
    }
  }

  setDensity(fraction: number): void {
    this.debris.density = this.glow.density = this.smoke.density = fraction;
  }

  slash(x: number, y: number, z: number, yaw: number): void {
    const r = this.accents[this.accentHead];
    this.accentHead = (this.accentHead + 1) % this.accents.length;
    r.life = r.max;
    r.mesh.position.set(x, y + 0.26, z);
    r.mesh.rotation.set(0.26, yaw + Math.PI * 0.43, -0.25);
    r.mesh.visible = true;
  }

  ripple(x: number, y: number, z: number): void {
    const r = this.rings[this.ringHead];
    this.ringHead = (this.ringHead + 1) % this.rings.length;
    r.life = r.max;
    r.scale = 0.52;
    r.mesh.position.set(x, y + 0.017, z);
    r.mesh.visible = true;
  }

  dispose(): void {
    this.restoreAllFlashes();
    for (const m of this.flashMats.values()) m.dispose();
    this.flashMats.clear();
    disposeTree(this.group);
  }

  setQuality(q: FxQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    // effects that low no longer allows must not linger on screen after a mid-match switch
    if (!this.rich) this.clearRichEffects();
  }

  private clearRichEffects(): void {
    this.glow.clear(); this.smoke.clear();
    for (const d of this.dust) { d.life = 0; d.mesh.visible = false; }
    this.torchCount = 0; this.torchGeo.setDrawRange(0, 0); this.torches.visible = false;
    this.shakePending = 0;
  }

  /** Command ripple at a valid order target (move = gold, attack / attack-move = vermilion). */
  /** Ground ripple for an order: gold = move, vermilion = attack, river blue = retreat. */
  command(x: number, y: number, z: number, kind: "move" | "attack" | "retreat" | boolean): void {
    const k = kind === true ? "attack" : kind === false ? "move" : kind;
    const r = this.commands[this.commandHead];
    this.commandHead = (this.commandHead + 1) % this.commands.length;
    r.life = r.max;
    r.mat.color.setHex(k === "attack" ? 0xc2402a : k === "retreat" ? 0x4f8fd0 : 0xc9a04a);
    r.mesh.position.set(x, y + 0.035, z);
    r.mesh.visible = true;
  }

  /** Brief warm flash on one target only: its meshes swap to private flash clones for ~80 ms. */
  flash(root: THREE.Object3D | null | undefined): void {
    if (!root || !root.visible) return;
    let slot = this.flashes.find(f => f.root === root);
    if (!slot) {
      slot = this.flashes.reduce((a, b) => (a.until < b.until ? a : b));
      this.restore(slot);
      slot.root = root;
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.userData.wind || Array.isArray(mesh.material)) return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (!m.isMeshStandardMaterial || m.transparent) return;
        let f = this.flashMats.get(m);
        if (!f) {
          const c = m.clone();
          c.emissive = new THREE.Color(0xfff0d6);
          c.emissiveIntensity = 0.55;
          c.userData.sharedTexture = true;
          this.flashMats.set(m, c);
          f = c;
        }
        slot!.swapped.push([mesh, m]);
        mesh.material = f;
      });
    }
    slot.until = this.time + FLASH_TIME;
    this.flashTotal++;
  }
  /** Flashes started since creation (diagnostics). */
  flashTotal = 0;

  private restore(f: Flash): void {
    for (const [mesh, original] of f.swapped) if (this.flashMats.get(original) === mesh.material) mesh.material = original;
    f.swapped.length = 0;
    f.root = null;
    f.until = 0;
  }

  private restoreAllFlashes(): void { for (const f of this.flashes) if (f.root) this.restore(f); }

  /** Orange melee sparks (medium / high). */
  heal(x: number, y: number, z: number): void {
    this.glow.emit(x, y + 0.3, z, 0, 0.45, 0, 0.52, 0.28, 0x54dca3, 0);
  }

  meleeSparks(x: number, y: number, z: number): void {
    if (!this.rich) return;
    this.glow.burst(x, y, z, 7, 1.6, 1.4, 0.32, 0.5, [0xff7a1a, 0xffb347, 0xffe2a0], -7);
  }

  /** Catapult stone landing: existing shockwave + scorch, plus a beige dust ring and one gentle camera kick. */
  boulderImpact(x: number, y: number, z: number, nearCamera: boolean): void {
    this.impact(x, y, z, 1.7);
    if (!this.rich) return;
    const d = this.dust[this.dustHead]; this.dustHead = (this.dustHead + 1) % this.dust.length;
    d.life = d.max; d.mesh.position.set(x, y + 0.05, z); d.mesh.visible = true;
    this.smoke.burst(x, y + 0.08, z, 6, 0.9, 0.25, 0.9, 0.7, [0xb8a07c, 0x9c8a6c], 0, 1.4);
    if (nearCamera) this.shakePending = Math.max(this.shakePending, 1);
  }

  /** Read-only counters for diagnostics / on-device profiling. */
  stats(): Record<string, number> {
    return {
      debris: this.debris.active, smoke: this.smoke.active, glow: this.glow.active,
      commandRings: this.commands.filter(r => r.life > 0).length, dustRings: this.dust.filter(r => r.life > 0).length,
      torches: this.torches.visible ? this.torchCount : 0, flashes: this.flashes.filter(f => f.root).length,
      flashMaterials: this.flashMats.size, flashTotal: this.flashTotal
    };
  }

  /** One camera-kick request per impact frame (consumed by the renderer). */
  consumeShake(): number { const s = this.shakePending; this.shakePending = 0; return s; }

  /** Torch sprites are re-collected every frame by the building layer. */
  torchBegin(): void { this.torchCount = 0; }
  torch(x: number, y: number, z: number, seed: number): void {
    if (!this.rich || this.torchCount >= TORCH_CAP) return;
    const i = this.torchCount++ * 3;
    const flicker = 0.78 + 0.22 * Math.sin(this.time * 13 + seed * 7.1) * Math.sin(this.time * 7.3 + seed);
    this.torchPos[i] = x; this.torchPos[i + 1] = y + Math.sin(this.time * 9 + seed) * 0.012; this.torchPos[i + 2] = z;
    this.torchCol[i] = flicker; this.torchCol[i + 1] = 0.55 * flicker; this.torchCol[i + 2] = 0.2 * flicker;
  }
  torchEnd(night: number): void {
    this.torchGeo.setDrawRange(0, this.torchCount);
    this.torches.visible = this.torchCount > 0;
    if (!this.torches.visible) return;
    (this.torches.material as THREE.PointsMaterial).opacity = 0.22 + 0.78 * Math.min(1, night);
    (this.torchGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.torchGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Catapult boulder impact: expanding fiery shockwave + scorched decal + embers. */
  impact(x: number, y: number, z: number, radius = 2.1): void {
    const r = this.rings[this.ringHead]; this.ringHead = (this.ringHead + 1) % this.rings.length;
    r.life = r.max; r.scale = radius; r.mesh.position.set(x, y + 0.06, z); r.mesh.visible = true;
    const r2 = this.rings[this.ringHead]; this.ringHead = (this.ringHead + 1) % this.rings.length;
    r2.life = r2.max * 0.75; r2.scale = radius * 0.65; r2.mesh.position.set(x, y + 0.1, z); r2.mesh.visible = true;
    const d = this.scorch[this.scorchHead]; this.scorchHead = (this.scorchHead + 1) % this.scorch.length;
    d.life = d.max; d.scale = radius * (0.45 + Math.random() * 0.15); d.mesh.position.set(x, y + 0.03, z); d.mesh.rotation.y = Math.random() * 6; d.mesh.visible = true;
    d.mesh.scale.setScalar(d.scale);
    this.glow.burst(x, y + 0.2, z, 26, 3.2, 3.5, 0.75, 1.6, [0xff6a00, 0xffb21c, 0xfff1a8], -5);
    this.debris.burst(x, y + 0.15, z, 14, 2.2, 3.2, 1.1, 1.5, [0x5b4a3a, 0x3a2e24, 0x8a7a66], -9);
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.flashes) if (f.root && this.time >= f.until) this.restore(f);
    for (const r of this.commands) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.18 + 0.62 * (1 - (1 - k) * (1 - k)));
      r.mat.opacity = 0.92 * (1 - k);
    }
    for (const d of this.dust) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      const k = 1 - d.life / d.max;
      d.mesh.scale.setScalar(0.3 + k * d.scale);
      d.mat.opacity = 0.5 * (1 - k) * (1 - k);
    }
    this.debris.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    for (const r of this.accents) {
      if (r.life <= 0) continue;
      r.life -= dt;
      r.mesh.visible = r.life > 0;
      const k = Math.max(0, r.life / r.max);
      r.mesh.scale.setScalar(0.48 + (1 - k) * 0.25);
      r.mat.opacity = k * 0.86;
      r.mesh.rotation.y -= dt * 3;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.scale);
      const water = r.scale < 0.6;
      r.mat.opacity = (1 - k) * (water ? 0.21 : 0.9);
      if (water) r.mat.color.set(0xb5ece2);
      else r.mat.color.setHSL(0.07 - k * 0.04, 1, 0.55 - k * 0.2);
    }
    for (const d of this.scorch) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      d.mat.opacity = Math.min(0.62, d.life / d.max * 1.4);
    }
  }

  clear(): void {
    this.restoreAllFlashes();
    for (const r of this.commands) { r.life = 0; r.mesh.visible = false; }
    for (const d of this.dust) { d.life = 0; d.mesh.visible = false; }
    this.torchCount = 0; this.torchGeo.setDrawRange(0, 0); this.torches.visible = false;
    this.shakePending = 0;
    this.debris.clear(); this.glow.clear(); this.smoke.clear();
    for (const r of this.accents) { r.life = 0; r.mesh.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
    for (const d of this.scorch) { d.life = 0; d.mesh.visible = false; }
  }
}
