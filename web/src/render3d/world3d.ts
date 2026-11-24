// Pixel Dynasty 3D — the living world around the valley: misty low-poly mountain ridges on every side of the
// 48×48 island, drifting mist bands, a flock of 5 white cranes gliding high above, and golden pollen /
// bamboo-leaf motes floating across the view. All cheap: 1 ridge mesh, 2 mist strips, 1 Points cloud.
import * as THREE from "three";
import { MAP_N, fbm, hash2, smoothstep, terrainHeight, mat } from "./common";

const TAU = Math.PI * 2;

function ridgeMesh(): THREE.Mesh {
  const A = 160, R = 14;
  const half = MAP_N / 2, cx = MAP_N / 2, cz = MAP_N / 2;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const near = new THREE.Color("#355536"), mid = new THREE.Color("#5f7280"), far = new THREE.Color("#b8b6ad"), snow = new THREE.Color("#e9e2d2");
  const c = new THREE.Color();
  for (let j = 0; j <= R; j++) {
    const d = 1.5 + Math.pow(j / R, 1.35) * 70; // distance beyond the map edge
    for (let i = 0; i < A; i++) {
      const a = (i / A) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const edge = half / Math.max(Math.abs(ca), Math.abs(sa)); // square island boundary
      const r = edge + d;
      const ridge = 1 - Math.abs(2 * fbm(a * 7 + j * 0.13, d * 0.05) - 1);
      const peaks = Math.pow(ridge, 1.6);
      const h = smoothstep(0.5, 7, d) * (2.2 + peaks * (5 + d * 0.32)) - 0.35 + (j === 0 ? -0.2 : 0);
      pos.push(cx + ca * r, h, cz + sa * r);
      const k = j / R;
      c.copy(near).lerp(mid, smoothstep(0.15, 0.55, k)).lerp(far, smoothstep(0.5, 1, k));
      if (h > 12 + hash2(i, j) * 3) c.lerp(snow, 0.6);
      c.multiplyScalar(0.92 + hash2(i * 3, j) * 0.12);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < A; i++) {
    const a = j * A + i, b = j * A + ((i + 1) % A), cc = a + A, dd = b + A;
    idx.push(a, cc, b, b, cc, dd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const me = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  me.receiveShadow = false; me.castShadow = false; me.frustumCulled = false;
  return me;
}

function gradientTexture(stops: Array<[number, string]>, vertical = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = vertical ? 4 : 64; cv.height = vertical ? 64 : 64;
  const x = cv.getContext("2d")!;
  const gr = vertical ? x.createLinearGradient(0, 0, 0, 64) : x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  x.fillStyle = gr; x.fillRect(0, 0, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

function mistBand(radius: number, y: number, height: number, opacity: number): THREE.Mesh {
  const g = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
  const m = new THREE.MeshBasicMaterial({
    color: 0xf2e8d5, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false,
    alphaMap: gradientTexture([[0, "#000"], [0.5, "#fff"], [1, "#000"]])
  });
  const me = new THREE.Mesh(g, m);
  me.position.set(MAP_N / 2, y, MAP_N / 2);
  me.renderOrder = 3;
  return me;
}

interface Crane { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; shadow: THREE.Mesh; off: THREE.Vector2; ph: number; }

function buildCrane(): { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D } {
  const white = mat("#f7f4ee", { rough: 0.7 }), black = mat("#1c1a18", { rough: 0.7 }), red = mat("#d61f1f"), beak = mat("#c9a35a");
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), white); body.scale.set(0.8, 0.7, 1.9); g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.5, 5), white); neck.position.set(0, 0.04, 0.44); neck.rotation.x = Math.PI / 2 - 0.25; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), black); head.position.set(0, 0.1, 0.7); g.add(head);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), red); crown.position.set(0, 0.145, 0.7); g.add(crown);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16, 5), beak); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.09, 0.8); g.add(bk);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), black); leg.rotation.x = Math.PI / 2; leg.position.set(s * 0.04, -0.04, -0.5); g.add(leg); }
  const wing = (s: number) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.08, 0.04, 0.02);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.26), white); w.position.x = s * 0.31; pivot.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.016, 0.2), black); tip.position.set(s * 0.72, 0, -0.03); pivot.add(tip);
    g.add(pivot);
    return pivot;
  };
  const wl = wing(-1), wr = wing(1);
  g.traverse(o => { (o as THREE.Mesh).castShadow = false; });
  return { g, wl, wr };
}

export class World3D {
  readonly group = new THREE.Group();
  private cranes: Crane[] = [];
  private pollen: THREE.Points;
  private pVel: Float32Array;
  private mist: THREE.Mesh[] = [];
  private readonly N = 220;

  constructor() {
    this.group.add(ridgeMesh());
    this.mist.push(mistBand(MAP_N * 0.78, 1.2, 5, 0.5), mistBand(MAP_N * 1.15, 3.5, 9, 0.42));
    this.mist.forEach(m => this.group.add(m));

    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false, alphaMap: gradientTexture([[0, "#fff"], [1, "#000"]], false) });
    const shadowG = new THREE.CircleGeometry(0.55, 14); shadowG.rotateX(-Math.PI / 2);
    // V-formation of 5 cranes
    const V: Array<[number, number]> = [[0, 0], [-1.1, -1.2], [1.1, -1.2], [-2.2, -2.4], [2.2, -2.4]];
    V.forEach(([ox, oz], i) => {
      const c = buildCrane();
      c.g.scale.setScalar(1.25);
      this.group.add(c.g);
      const shadow = new THREE.Mesh(shadowG, shadowMat); shadow.scale.set(1.5, 1, 0.9); shadow.renderOrder = 1;
      this.group.add(shadow);
      this.cranes.push({ g: c.g, wl: c.wl, wr: c.wr, shadow, off: new THREE.Vector2(ox, oz), ph: i * 0.7 });
    });

    // drifting golden pollen + tiny bamboo-leaf motes
    const pos = new Float32Array(this.N * 3), colA = new Float32Array(this.N * 3);
    this.pVel = new Float32Array(this.N * 3);
    const gold = new THREE.Color("#ffd36b"), leaf = new THREE.Color("#a6d86a");
    for (let i = 0; i < this.N; i++) {
      pos.set([MAP_N / 2 + (Math.random() - 0.5) * 32, 0.3 + Math.random() * 3, MAP_N / 2 + (Math.random() - 0.5) * 32], i * 3);
      const c = Math.random() < 0.7 ? gold : leaf;
      colA.set([c.r, c.g, c.b], i * 3);
      this.pVel.set([0.18 + Math.random() * 0.25, (Math.random() - 0.5) * 0.06, 0.08 + Math.random() * 0.18], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute("color", new THREE.BufferAttribute(colA, 3));
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 0.09, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      map: gradientTexture([[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,0.8)"], [1, "rgba(255,255,255,0)"]], false),
      blending: THREE.AdditiveBlending
    }));
    this.pollen.frustumCulled = false;
    this.group.add(this.pollen);
  }

  update(t: number, dt: number, target: THREE.Vector3): void {
    // cranes circle the valley in a slow, wide loop with glide/flap phases
    const cx = MAP_N / 2, cz = MAP_N / 2, R = MAP_N * 0.32, w = 0.045;
    const a = t * w;
    const fx = -Math.sin(a), fz = Math.cos(a); // forward (tangent)
    const rx = fz, rz = -fx;                  // right
    for (const c of this.cranes) {
      const bx = cx + Math.cos(a) * R + rx * c.off.x + fx * c.off.y;
      const bz = cz + Math.sin(a) * R + rz * c.off.x + fz * c.off.y;
      const y = 7.5 + Math.sin(t * 0.6 + c.ph) * 0.35;
      c.g.position.set(bx, y, bz);
      c.g.rotation.set(0, Math.atan2(fx, fz), -0.12);
      const flapping = Math.sin(t * 0.35 + c.ph) > -0.2 ? 1 : 0.18;
      const f = Math.sin(t * 3.4 + c.ph * 2) * 0.55 * flapping + 0.05;
      c.wl.rotation.z = -f; c.wr.rotation.z = f;
      c.shadow.position.set(bx + 1.2, Math.max(terrainHeight(bx + 1.2, bz + 0.3), -0.1) + 0.04, bz + 0.3);
    }
    // pollen drifts with the breeze, wobbling, wrapped around the camera target
    const p = this.pollen.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < this.N; i++) {
      const k = i * 3;
      arr[k] += (this.pVel[k] + Math.sin(t * 0.9 + i) * 0.1) * dt;
      arr[k + 1] += (this.pVel[k + 1] + Math.sin(t * 1.3 + i * 0.7) * 0.05) * dt;
      arr[k + 2] += (this.pVel[k + 2] + Math.cos(t * 0.7 + i) * 0.1) * dt;
      for (const [o, c] of [[0, target.x], [2, target.z]] as const) {
        if (arr[k + o] > c + 16) arr[k + o] -= 32; else if (arr[k + o] < c - 16) arr[k + o] += 32;
      }
      if (arr[k + 1] > 3.6) arr[k + 1] = 0.3; else if (arr[k + 1] < 0.2) arr[k + 1] = 3.4;
    }
    p.needsUpdate = true;
    (this.pollen.material as THREE.PointsMaterial).opacity = 0.75 + Math.sin(t * 2) * 0.15;
    this.mist[0].rotation.y = t * 0.004; this.mist[1].rotation.y = -t * 0.003;
  }
}
