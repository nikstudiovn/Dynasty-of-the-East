// Pixel Dynasty 3D — shared constants, coordinate helpers, height field and material cache.
// World space: 1 tile = 1 unit. Tile (tx, ty) covers x in [tx, tx+1], z in [ty, ty+1]. y is up.
import * as THREE from "three";
import { disposeSurfaceMaps, softMask, surfaceMaps, type Surface } from "./surfaces";
import { applyWind } from "./wind3d";

/** Live map size (ES live binding): importers always see the current value after setMapSize(). */
export let MAP_N = 48;
export function setMapSize(n: number): void { MAP_N = n; }
export const TILE_W = 52;
export const TILE_H = 26;
export const WATER_LEVEL = -0.1;
export const BRIDGE_DECK = 0.12;
/** Extra lift at the middle of an arched bridge span. */
export const BRIDGE_ARCH = 0.42;

/** Hooks supplied by the classic game script (index.html). */
export interface Env3D {
  teamColor(e: any): string;
  ageOf(e: any): number;
  bldgSize(type: string): number;
  canPlace(tx: number, ty: number, size: number): boolean;
  getHover(): { tx: number; ty: number } | null;
  getSelectionBox(): { x1: number; y1: number; x2: number; y2: number } | null;
}

/** The classic camera lives in 2D isometric pixel space; these convert it to/from tile space. */
export function isoToTile(ix: number, iy: number): { x: number; z: number } {
  return { x: (ix / (TILE_W / 2) + iy / (TILE_H / 2)) / 2, z: (iy / (TILE_H / 2) - ix / (TILE_W / 2)) / 2 };
}
export function tileToIso(x: number, z: number): { x: number; y: number } {
  return { x: (x - z) * (TILE_W / 2), y: (x + z) * (TILE_H / 2) };
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Deterministic hash noise in [0,1). */
export function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number): number {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5.3, y * 2.1 + 1.7) * 0.3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 3.3) * 0.15;
}

// ---- Height field -----------------------------------------------------------
let waterMask: Float32Array = new Float32Array(MAP_N * MAP_N);
let rockMask: Float32Array = new Float32Array(MAP_N * MAP_N);

/** Rebuild the blurred water mask from the grid (called when a new map is loaded). */
export function setWaterGrid(grid: any[][]): void {
  const raw = new Float32Array(MAP_N * MAP_N);
  for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
    const t = grid[y]?.[x]?.terrain;
    raw[y * MAP_N + x] = t === "water" || t === "bridge" ? 1 : 0;
  }
  waterMask = raw;
  const rock = new Float32Array(MAP_N * MAP_N);
  for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) rock[y * MAP_N + x] = grid[y]?.[x]?.terrain === "rock" ? 1 : 0;
  rockMask = rock;
  // bridge runs (for the arched deck height): contiguous bridge cells along a row (h) or column (v)
  bridgeRun = new Int16Array(MAP_N * MAP_N * 3).fill(-1);
  for (let y = 0; y < MAP_N; y++) for (let x = 0; x < MAP_N; x++) {
    const c = grid[y]?.[x];
    if (!c || c.terrain !== "bridge") continue;
    const vert = c.bridge === "v";
    let a = vert ? y : x, b = a;
    const isB = (i: number) => { const q = vert ? grid[i]?.[x] : grid[y]?.[i]; return q?.terrain === "bridge" && (q.bridge === "v") === vert; };
    while (a > 0 && isB(a - 1)) a--;
    while (b < MAP_N - 1 && isB(b + 1)) b++;
    const k = (y * MAP_N + x) * 3;
    bridgeRun[k] = a; bridgeRun[k + 1] = b + 1; bridgeRun[k + 2] = vert ? 1 : 0;
  }
}
let bridgeRun: Int16Array = new Int16Array(MAP_N * MAP_N * 3).fill(-1);
/** Arch profile 0..1 along a bridge span [a, b) at coordinate p. */
export function archLift(p: number, a: number, b: number): number {
  const len = Math.max(1, b - a);
  const t = clamp((p - a) / len, 0, 1);
  return Math.sin(Math.PI * t) * BRIDGE_ARCH * Math.min(1, len / 4);
}
/** Deck height of the arched bridge at world point (x, z); BRIDGE_DECK if unknown. */
export function bridgeDeckAt(x: number, z: number): number {
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= MAP_N || tz >= MAP_N) return BRIDGE_DECK;
  const k = (tz * MAP_N + tx) * 3;
  if (bridgeRun[k] < 0) return BRIDGE_DECK;
  return BRIDGE_DECK + archLift(bridgeRun[k + 2] ? z : x, bridgeRun[k], bridgeRun[k + 1]);
}
function maskAt(mask: Float32Array, x: number, z: number): number {
  // bilinear sample of the per-tile mask at tile centres
  const fx = x - 0.5, fz = z - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const g = (ix: number, iz: number) => (ix < 0 || iz < 0 || ix >= MAP_N || iz >= MAP_N ? 0 : mask[iz * MAP_N + ix]);
  const a = g(x0, z0), b = g(x0 + 1, z0), c = g(x0, z0 + 1), d = g(x0 + 1, z0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
/** 0 on dry land, 1 deep inside the lake. */
export function wetness(x: number, z: number): number { return smoothstep(0.18, 0.75, maskAt(waterMask, x, z)); }
/** 0 off the ridges, 1 on solid rock (highland_passes). */
export function rockiness(x: number, z: number): number { return smoothstep(0.2, 0.85, maskAt(rockMask, x, z)); }

/** Gentle rolling hills (kept low so the y=0 ground-plane raycast stays tile-accurate). */
export function terrainHeight(x: number, z: number): number {
  const hills = (fbm(x * 0.16, z * 0.16) - 0.35) * 0.42 + Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27 - 0.4) * 0.07;
  const edge = Math.min(x, z, MAP_N - x, MAP_N - z);
  const rim = smoothstep(2.5, 0, edge) * 0.25; // valley rim rises a little at the map edge
  const w = wetness(x, z);
  const rk = rockiness(x, z);
  const peak = rk > 0 ? rk * (0.9 + fbm(x * 0.55 + 3, z * 0.55 + 7) * 0.9) : 0; // mountain ridges (kept < ~1.8)
  return Math.max(-0.05, hills) * (1 - w) + rim - w * 0.48 + peak;
}

/** Height a unit stands on (bridges are arched decks above the water). */
export function standHeight(x: number, z: number, grid: any[][] | null): number {
  const c = grid?.[Math.floor(z)]?.[Math.floor(x)];
  if (c && c.terrain === "bridge") return bridgeDeckAt(x, z) + 0.03;
  return Math.max(terrainHeight(x, z), WATER_LEVEL);
}

// ---- Materials --------------------------------------------------------------
const matCache = new Map<string, THREE.Material>();
const cachedMaterials = new Set<THREE.Material>();
const cachedGeometries = new Set<THREE.BufferGeometry>();
let cacheUsers = 0;
const lightMaterials = new Map<THREE.MeshStandardMaterial, number>();

export function updateLanternMaterials(boost: number): void {
  for (const [material, base] of lightMaterials) material.emissiveIntensity = base * (0.23 + 2.5 * boost);
}
export const rainWetness = { value: 0 };

export function applyWetness(material: THREE.MeshStandardMaterial, strength: number): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.uRainWetness = rainWetness;
    shader.fragmentShader = "uniform float uRainWetness;\n" + shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = max(0.13, roughnessFactor * (1.0 - uRainWetness * ${strength.toFixed(2)}));`
    );
  };
  material.customProgramCacheKey = () => `pd-wet-${strength}`;
}

export function retainRenderAssets(): void { cacheUsers++; }

export function releaseRenderAssets(): void {
  if (--cacheUsers !== 0) return;
  for (const material of cachedMaterials) material.dispose();
  for (const geometry of cachedGeometries) geometry.dispose();
  matCache.clear(); geoCache.clear(); cachedMaterials.clear(); cachedGeometries.clear();
  lightMaterials.clear();
  disposeSurfaceMaps();
}
export interface MatOpts { metal?: number; rough?: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; flat?: boolean; surface?: Surface; flagWind?: boolean; lantern?: boolean; }
export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(o);
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, metalness: o.metal ?? 0.05, roughness: o.rough ?? 0.72,
      emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0x000000), emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, flatShading: !!o.flat
    });
    if (o.surface) {
      const maps = surfaceMaps(o.surface);
      m.map = maps.map;
      m.bumpMap = maps.bumpMap;
      m.roughnessMap = maps.roughnessMap;
      m.bumpScale = o.surface === "thatch" ? 0.024 : 0.015;
      if (o.surface === "lattice") m.emissiveMap = maps.map;
      else if (o.surface !== "silk") applyWetness(m, 0.26);
    }
    if (o.flagWind) applyWind(m, "flag");
    if (o.lantern) lightMaterials.set(m, o.emissiveIntensity ?? 1);
    matCache.set(key, m);
    cachedMaterials.add(m);
  }
  return m;
}
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k >= 0) c.lerp(new THREE.Color(0xffffff), k); else c.multiplyScalar(1 + k);
  return "#" + c.getHexString();
}

// ---- Geometry cache -----------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();
export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) { g = make(); geoCache.set(key, g); cachedGeometries.add(g); }
  return g;
}
export const box = (w: number, h: number, d: number) => geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt: number, rb: number, h: number, s = 8) => geo(`cyl${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const sphere = (r: number, w = 10, h = 8) => geo(`sph${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
export const cone = (r: number, h: number, s = 8) => geo(`cone${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

/** Mesh helper: shared geometry + material, shadows on, positioned. */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadows = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = shadows; me.receiveShadow = shadows;
  return me;
}

// ---- Disposal -----------------------------------------------------------------
/** Frees resources owned by the subtree, keeping renderer-wide caches alive. */
export function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry && !(o as THREE.Sprite).isSprite && !cachedGeometries.has(m.geometry)) geometries.add(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) if (!cachedMaterials.has(mt)) materials.add(mt);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const m of materials) {
    for (const v of Object.values(m)) if (v?.isTexture && !m.userData.sharedTexture) textures.add(v);
    m.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.removeFromParent();
}

export function contactShadow(width: number, depth: number): THREE.Mesh {
  const key = "contact-shadow";
  let material = matCache.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color: 0x292018, map: softMask(), transparent: true, opacity: 0.48,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
    });
    matCache.set(key, material);
    cachedMaterials.add(material);
  }
  const geometry = geo(key, () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const shadow = mesh(geometry, material, 0, 0.022, 0, false);
  shadow.scale.set(width, 1, depth);
  shadow.renderOrder = 1;
  return shadow;
}
