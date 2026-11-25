// Dynasty of the East 3D — shared procedural geometry for nature & resources (Chặng 2A).
// Every builder returns ONE merged BufferGeometry (position / normal / uv) so each kind of tree, rock or
// crystal is drawn by a single InstancedMesh: a whole forest costs one trunk + one canopy draw call.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";

const UP = new THREE.Vector3(0, 1, 0);

/** Deterministic 3D hash in [0,1) (keeps shared vertices welded when we displace them). */
function h3(x: number, y: number, z: number, seed = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/** Normalise attributes so every part can be merged: non-indexed position + normal + uv. */
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.index ? g.toNonIndexed() : g;
  if (c !== g) g.dispose();
  for (const name of Object.keys(c.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") c.deleteAttribute(name);
  if (!c.getAttribute("normal")) c.computeVertexNormals();
  if (!c.getAttribute("uv")) c.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(c.getAttribute("position").count * 2), 2));
  return c;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ready = parts.map(prep);
  const merged = mergeGeometries(ready, false)!;
  ready.forEach(p => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/** Tapered, gently bent limb from `from` along `dir`; returns the tip. */
function limb(parts: THREE.BufferGeometry[], from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, bend = 0.06, seg = 7): THREE.Vector3 {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3);
  g.translate(0, len / 2, 0);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    p.setX(i, p.getX(i) + Math.sin(t * Math.PI) * bend * len);
  }
  g.computeVertexNormals();
  const d = dir.clone().normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
  g.translate(from.x, from.y, from.z);
  parts.push(g);
  return from.clone().addScaledVector(d, len);
}

/** Tips of the broadleaf trunk's limbs — the canopy tiers are seated on them. */
const BROAD_TIPS: THREE.Vector3[] = [];

/** Branched trunk (height ≈ 1.1): root flare, a leaning bole that forks into 3 asymmetric limbs + twigs. */
export function branchedTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  BROAD_TIPS.length = 0;
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4;
    limb(parts, new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(Math.cos(a), -0.55, Math.sin(a)), 0.16, 0.05, 0.018, 0, 5);
  }
  const fork = limb(parts, new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0.08, 1, 0.03), 0.56, 0.082, 0.056, 0.08);
  const crown = limb(parts, fork, new THREE.Vector3(-0.12, 1, 0.06), 0.3, 0.05, 0.03, -0.05);
  const limbs: Array<[number, number, number, number, number]> = [
    [0.75, 0.95, 0.12, 0.4, 0.038], [-0.62, 0.85, 0.48, 0.34, 0.034], [0.05, 0.8, -0.78, 0.3, 0.03]
  ];
  for (const [x, y, z, len, r] of limbs) {
    const tip = limb(parts, fork, new THREE.Vector3(x, y, z), len, r, r * 0.45, 0.1, 6);
    const twig = limb(parts, tip, new THREE.Vector3(x * 0.4 - z * 0.5, 1, z * 0.4 + x * 0.5), 0.16, r * 0.45, 0.008, 0.05, 5);
    BROAD_TIPS.push(tip, twig);
  }
  BROAD_TIPS.push(limb(parts, crown, new THREE.Vector3(0.25, 1, -0.2), 0.14, 0.03, 0.008, 0.04, 5));
  return merge(parts);
}

/** Irregular foliage lobe: subdivided icosahedron, welded, displaced and flattened underneath. */
function lobe(r: number, sx: number, sy: number, sz: number, seed: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 1);
  base.deleteAttribute("normal"); base.deleteAttribute("uv");
  const g = mergeVertices(base);
  base.dispose();
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + 0.38 * h3(x * 3, y * 3, z * 3, seed);
    p.setXYZ(i, x * k * r * sx, (y < -0.2 ? y * 0.55 : y) * k * r * sy, z * k * r * sz);
  }
  g.computeVertexNormals();
  return g;
}

/** Multi-tier asymmetric broadleaf canopy sized to sit on branchedTrunkGeometry(). */
export function broadCanopyGeometry(): THREE.BufferGeometry {
  if (!BROAD_TIPS.length) branchedTrunkGeometry().dispose();
  const parts: THREE.BufferGeometry[] = [];
  BROAD_TIPS.forEach((tip, i) => {
    const big = i % 2 === 0;
    const g = lobe(big ? 0.27 : 0.21, 1.15, 0.72, 1.0, i + 3);
    g.rotateY(i * 1.3);
    g.translate(tip.x * 1.05, tip.y + (big ? 0.02 : 0.08), tip.z * 1.05);
    parts.push(g);
  });
  // a lower, off-centre skirt tier and a high crown tuft break the silhouette
  parts.push(lobe(0.3, 1.25, 0.5, 1.05, 21).translate(0.12, 0.66, -0.06));
  parts.push(lobe(0.18, 1, 0.9, 1, 27).translate(-0.08, 1.3, 0.05));
  return merge(parts);
}

/** Tiered conifer canopy for dense forest tiles: 4 jagged, slightly off-axis cones. */
export function pineCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const r = 0.36 - k * 0.07, h = 0.42 - k * 0.04, y = 0.38 + k * 0.26;
    const c = new THREE.ConeGeometry(r, h, 9, 2);
    const p = c.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i), z = p.getZ(i);
      if (yy > h / 2 - 1e-4) continue;
      const k2 = 0.82 + 0.34 * h3(x * 7, yy * 7 + k, z * 7, 5);
      p.setXYZ(i, x * k2, yy - (yy < -h / 2 + 1e-4 ? 0.04 * h3(x, k, z, 9) : 0), z * k2);
    }
    c.computeVertexNormals();
    c.translate(Math.sin(k * 2.1) * 0.035, y + h / 2, Math.cos(k * 1.7) * 0.03);
    parts.push(c);
  }
  return merge(parts);
}

/** Segmented bamboo culm (height 1): 6 internodes with their own 0..1 UVs (mat_bamboo paints one node per V). */
export function bambooCulmGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const N = 6;
  for (let k = 0; k < N; k++) {
    const y0 = k / N, h = 1 / N;
    const r0 = 0.034 - k * 0.003, r1 = 0.034 - (k + 1) * 0.003;
    parts.push(new THREE.CylinderGeometry(r1, r0, h * 0.96, 7, 1).translate(0, y0 + h * 0.48, 0));
    parts.push(new THREE.CylinderGeometry(r1 * 1.22, r1 * 1.22, h * 0.06, 7, 1).translate(0, y0 + h, 0));
  }
  return merge(parts);
}

function hull(points: THREE.Vector3[]): THREE.BufferGeometry {
  const g = new ConvexGeometry(points);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  return merge([g]);
}

/** Chiselled boulder (≈ 1 wide, base at y = 0): jittered icosahedron with every corner bevelled off. */
export function chiselledRockGeometry(seed = 1): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const p = ico.getAttribute("position");
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    if (!corners.some(c => c.distanceToSquared(v) < 1e-6)) corners.push(v);
  }
  ico.dispose();
  const jittered = corners.map((v, i) => v.clone().multiplyScalar(0.42 + 0.16 * h3(i, seed, 3)).setY(Math.max(-0.2, v.y * 0.3 + 0.03)));
  const points: THREE.Vector3[] = [];
  for (const v of jittered) {
    const near = jittered.filter(o => o !== v).sort((a, b) => a.distanceToSquared(v) - b.distanceToSquared(v)).slice(0, 5);
    for (const n of near) points.push(v.clone().lerp(n, 0.2));
  }
  return hull(points);
}

/** Split slate slab (≈ 1 × 0.32 × 0.7) with chamfered edges, for layered stone outcrops. */
export function slateSlabGeometry(): THREE.BufferGeometry {
  const corners: THREE.Vector3[] = [];
  for (const x of [-0.5, 0.5]) for (const y of [0, 0.32]) for (const z of [-0.35, 0.35]) {
    corners.push(new THREE.Vector3(x * (y ? 0.9 : 1) + (y ? 0.04 : 0), y + (y ? (x > 0 ? 0.03 : -0.02) : 0), z * (y ? 0.86 : 1)));
  }
  const points: THREE.Vector3[] = [];
  for (const v of corners) {
    for (const n of corners) {
      const axes = [Math.abs(v.x - n.x) > 0.3, Math.abs(v.y - n.y) > 0.2, Math.abs(v.z - n.z) > 0.3].filter(Boolean).length;
      if (axes === 1) points.push(v.clone().lerp(n, 0.14));
    }
  }
  return hull(points);
}

/** Hexagonal gold crystal (height ≈ 0.3): bevelled prism with a sharp pyramidal tip. */
export function goldCrystalGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045));
    points.push(new THREE.Vector3(Math.cos(a) * 0.058, 0.19 + 0.02 * h3(k, 1, 2), Math.sin(a) * 0.058));
  }
  points.push(new THREE.Vector3(0.006, 0.31, -0.004));
  return hull(points);
}
