// Pixel Dynasty 3D — pooled instanced particles, shockwave rings and scorch decals (zero per-frame allocation).
import * as THREE from "three";

interface PoolOpts { capacity: number; glow: boolean; size: number; }

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly n: number;
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
    const g = new THREE.BoxGeometry(o.size, o.size, o.size);
    const m = o.glow
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(g, m, this.n);
    this.mesh.frustumCulled = false;
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
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, up * (0.5 + Math.random() * 0.7), Math.sin(a) * s, life * (0.6 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.6), colors[k % colors.length], gravity, grow);
    }
  }

  update(dt: number): void {
    if (this.alive <= 0) return;
    let alive = 0;
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
      this.m4.compose(this.t.set(this.p[j], this.p[j + 1], this.p[j + 2]), this.q, this.s.set(sz, sz, sz));
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.n; i++) { this.life[i] = 0; this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); }
    this.alive = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; scale: number; }

export class FX3D {
  readonly group = new THREE.Group();
  /** Lit debris: smoke cubes, bamboo splinters, wood chips, chaff, ore chunks. */
  readonly debris = new ParticlePool({ capacity: 420, glow: false, size: 0.07 });
  /** Additive glow: fire, sparks, embers, muzzle flashes. */
  readonly glow = new ParticlePool({ capacity: 360, glow: true, size: 0.06 });
  private readonly rings: Ring[] = [];
  private readonly scorch: Ring[] = [];
  private ringHead = 0;
  private scorchHead = 0;

  constructor() {
    this.group.add(this.debris.mesh, this.glow.mesh);
    const rg = new THREE.RingGeometry(0.7, 1, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const me = new THREE.Mesh(rg, m); me.visible = false; me.renderOrder = 3;
      this.rings.push({ mesh: me, mat: m, life: 0, max: 0.7, scale: 2.2 }); this.group.add(me);
    }
    const dg = new THREE.CircleGeometry(1, 24); dg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x140d08, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const me = new THREE.Mesh(dg, m); me.visible = false; me.renderOrder = 1;
      this.scorch.push({ mesh: me, mat: m, life: 0, max: 9, scale: 1 }); this.group.add(me);
    }
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
    this.debris.update(dt);
    this.glow.update(dt);
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.scale);
      r.mat.opacity = (1 - k) * 0.9;
      r.mat.color.setHSL(0.07 - k * 0.04, 1, 0.55 - k * 0.2);
    }
    for (const d of this.scorch) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      d.mat.opacity = Math.min(0.62, d.life / d.max * 1.4);
    }
  }

  clear(): void {
    this.debris.clear(); this.glow.clear();
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
    for (const d of this.scorch) { d.life = 0; d.mesh.visible = false; }
  }
}
