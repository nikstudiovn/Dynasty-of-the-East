// Dynasty of the East 3D — shared "Điện ảnh Trầm" (muted cinematic) PBR material library.
// Every texture (map + normalMap + roughnessMap) is generated procedurally on the client from the same
// seamless noise used by the Chặng 1 terrain, so the game stays 100% offline. The named materials below
// are the contract for Chặng 2B: `.glb` meshes can be re-skinned by material name (`mat_wood`, ...).
import * as THREE from "three";
import { hash, noise } from "./terrainPbr";
import { rainWetness } from "./common";
import { applyWind } from "./wind3d";

export type PbrName =
  | "mat_wood" | "mat_roof" | "mat_stone" | "mat_gold" | "mat_bamboo" | "mat_foliage"
  | "mat_team_player" | "mat_team_enemy";
export const PBR_NAMES: readonly PbrName[] = [
  "mat_wood", "mat_roof", "mat_stone", "mat_gold", "mat_bamboo", "mat_foliage", "mat_team_player", "mat_team_enemy"
];

/** How texture coordinates are produced. `box` projects object-space position on the dominant normal axis
 *  (constant texel density on any primitive or merged batch), `roof` keeps tile rows parallel to the eaves,
 *  `mesh` uses the geometry's own UVs (bamboo internodes, flag cloth). */
type UvMode = "box" | "roof" | "mesh";

interface Spec {
  size: number;
  uv: UvMode;
  uvScale: number;
  metalness: number;
  normalScale: number;
  wet: number;
  side?: THREE.Side;
  emissive?: string;
  emissiveIntensity?: number;
  /** Returns height (0..1), sRGB colour (0..255) and roughness (0..1) for a texel. */
  texel(u: number, v: number, x: number, y: number): [number, number, number, number, number];
}

const TAU = Math.PI * 2;
const fract = (n: number) => n - Math.floor(n);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sat = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (a: number, b: number, n: number) => { const t = sat((n - a) / (b - a)); return t * t * (3 - 2 * t); };
function fbm(u: number, v: number, n: number, seed: number): number {
  return noise(u, v, n, n, seed) * 0.5 + noise(u, v, n * 2, n * 2, seed + 1) * 0.3 + noise(u, v, n * 4, n * 4, seed + 2) * 0.2;
}
function rgb(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** Seamless Voronoi: nearest / second-nearest feature distance and the nearest cell id. */
function voronoi(u: number, v: number, n: number, seed: number): [number, number, number, number, number] {
  const gx = Math.floor(u * n), gy = Math.floor(v * n);
  let d1 = 9, d2 = 9, id = 0, ox = 0, oy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j;
    const wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
    const px = cx + hash(wx, wy, seed), py = cy + hash(wx, wy, seed + 7);
    const dx = px - u * n, dy = py - v * n;
    const d = Math.hypot(dx, dy);
    if (d < d1) { d2 = d1; d1 = d; id = hash(wx, wy, seed + 13); ox = dx; oy = dy; }
    else if (d < d2) d2 = d;
  }
  return [d1, d2, id, ox, oy];
}

// ---------------------------------------------------------------------------
// Texel painters (muted, low-key palette that reads well under the cinematic grade)
const SPECS: Record<PbrName, Spec> = {
  // Dark ironwood (gỗ lim): long vertical grain with warped growth lines and fine pores.
  mat_wood: {
    size: 256, uv: "box", uvScale: 2.4, metalness: 0.02, normalScale: 0.9, wet: 0.3,
    texel(u, v, x, y) {
      const warp = fbm(u, v, 3, 11) * 2.4 + noise(u, v, 2, 6, 19) * 1.3;
      const ring = 0.5 + 0.5 * Math.sin((u * 14 + warp) * TAU);
      const fibre = noise(u, v, 96, 6, 23);
      const pore = hash(x, y, 31) > 0.93 ? 0.35 : 0;
      const h = 0.25 + ring * 0.38 + fibre * 0.3 - pore * 0.4;
      const tone = sat(0.18 + ring * 0.42 + fibre * 0.32 - pore);
      const [r, g, b] = rgb([30, 17, 10], [96, 60, 34], tone);
      return [h, r, g, b, 0.58 + (1 - ring) * 0.16 + pore * 0.2];
    }
  },
  // "Ngói mũi hài": overlapping shoe-tip tiles in deep red clay, moss creeping out of the laps.
  mat_roof: {
    size: 256, uv: "roof", uvScale: 2.2, metalness: 0.03, normalScale: 1.25, wet: 0.45, side: THREE.DoubleSide,
    texel(u, v) {
      const R = 6, C = 7;
      const rv = v * R, row = Math.floor(rv), lv = rv - row;
      const lobe = (lu: number) => 0.34 * Math.pow(Math.max(0, 1 - Math.abs(2 * lu - 1)), 0.55);
      const luHere = fract(u * C + (row % 2) * 0.5);
      const luAbove = fract(u * C + ((row + 1) % 2) * 0.5);
      const aboveLobe = lobe(luAbove);
      const fromAbove = lv > 1 - aboveLobe;
      const lu = fromAbove ? luAbove : luHere;
      const t = fromAbove ? lv - (1 - aboveLobe) : lv + lobe(luHere);
      const tile = hash(Math.floor(u * C + ((row + (fromAbove ? 1 : 0)) % 2) * 0.5), row + (fromAbove ? 1 : 0), 41);
      const groove = 1 - smooth(0.0, 0.06, t);
      const crown = Math.sin(Math.PI * lu);
      const h = sat(0.85 - Math.min(1, t) * 0.45 + crown * 0.15 - groove * 0.55 + noise(u, v, 48, 48, 43) * 0.06);
      const moss = smooth(0.5, 0.78, fbm(u, v, 5, 47)) * (0.45 + 0.55 * (1 - Math.min(1, t * 2.5)));
      let col = rgb([88, 32, 22], [138, 58, 38], sat(0.25 + tile * 0.5 + crown * 0.25));
      col = rgb(col, [62, 72, 40], moss * 0.85);
      col = rgb(col, [28, 16, 12], groove * 0.7);
      return [h, col[0], col[1], col[2], 0.74 + moss * 0.2 + groove * 0.06];
    }
  },
  // Laterite / dark slate ashlar: staggered chamfered blocks, porous pits and the odd ochre block.
  mat_stone: {
    size: 256, uv: "box", uvScale: 1.6, metalness: 0.0, normalScale: 1.15, wet: 0.32,
    texel(u, v) {
      const rows = 4, rv = v * rows, row = Math.floor(rv), lv = rv - row;
      const cols = 3, shift = hash(row, 0, 53) * 0.6 + (row % 2) * 0.5;
      const cu = u * cols + shift, col = Math.floor(cu), lu = cu - col;
      const block = hash(((col % cols) + cols) % cols, row, 59);
      const edge = Math.min(lu / cols * 3, (1 - lu) / cols * 3, lv, 1 - lv);
      const bevel = smooth(0.0, 0.07, edge);
      const pits = smooth(0.66, 0.8, noise(u, v, 40, 40, 61));
      const h = 0.12 + bevel * (0.62 + fbm(u, v, 6, 67) * 0.24) - pits * 0.18;
      let c = rgb([70, 71, 70], [142, 141, 136], sat(0.2 + block * 0.4 + fbm(u, v, 9, 71) * 0.4));
      if (block > 0.8) c = rgb(c, [128, 96, 66], 0.4);
      c = rgb(c, [30, 30, 30], (1 - bevel) * 0.75 + pits * 0.45);
      return [h, c[0], c[1], c[2], 0.82 + pits * 0.12 - bevel * 0.02];
    }
  },
  // Hammered native gold: faceted nuggets with low-roughness veins that pop out of dark rock.
  mat_gold: {
    size: 128, uv: "box", uvScale: 2.6, metalness: 0.88, normalScale: 1.1, wet: 0.1,
    emissive: "#4a2c00", emissiveIntensity: 0.4,
    texel(u, v) {
      const [d1, d2, id] = voronoi(u, v, 9, 73);
      const crease = 1 - smooth(0.0, 0.12, d2 - d1);
      const facet = sat(1 - d1 * 0.9);
      const h = facet * 0.7 + 0.2 - crease * 0.45;
      let c = rgb([158, 108, 34], [246, 198, 86], sat(0.3 + facet * 0.5 + id * 0.2));
      c = rgb(c, [82, 54, 18], crease * 0.8);
      return [h, c[0], c[1], c[2], 0.16 + crease * 0.3 + id * 0.06];
    }
  },
  // Muted olive bamboo culm: one internode per V, a raised node ring and pale waxy band below it.
  mat_bamboo: {
    size: 128, uv: "mesh", uvScale: 1, metalness: 0.0, normalScale: 0.8, wet: 0.35,
    texel(u, v, x, y) {
      const node = Math.exp(-Math.pow(Math.min(v, 1 - v) / 0.025, 2));
      const wax = smooth(0.82, 0.9, v) * (1 - smooth(0.95, 0.985, v));
      const streak = noise(u, v, 48, 3, 79);
      const spot = smooth(0.7, 0.85, fbm(u, v, 6, 83));
      const h = 0.45 + node * 0.45 + streak * 0.08 + hash(x, y, 89) * 0.02;
      let c = rgb([58, 72, 34], [104, 116, 58], sat(0.3 + streak * 0.5));
      c = rgb(c, [138, 136, 94], wax * 0.55);
      c = rgb(c, [44, 46, 24], node * 0.7 + spot * 0.35);
      return [h, c[0], c[1], c[2], 0.42 + spot * 0.25 + node * 0.1];
    }
  },
  // Dense natural canopy: overlapping lanceolate leaves with midribs and dark gaps between them.
  mat_foliage: {
    size: 256, uv: "box", uvScale: 3.2, metalness: 0.0, normalScale: 1.0, wet: 0.38, side: THREE.DoubleSide,
    texel(u, v) {
      const [, , id, ox, oy] = voronoi(u, v, 11, 97);
      const a = id * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const lx = ox * ca + oy * sa, ly = -ox * sa + oy * ca;
      const e = (lx / 0.62) ** 2 + (ly / 0.26) ** 2;
      const leaf = 1 - smooth(0.75, 1.0, e);
      const rib = Math.exp(-Math.pow(ly / 0.03, 2)) * leaf;
      const h = 0.12 + leaf * (0.55 + (1 - e) * 0.3) - rib * 0.12;
      let c = rgb([52, 80, 46], [122, 148, 80], sat(id * 0.7 + (1 - e) * 0.3));
      c = rgb(c, [150, 160, 92], rib * 0.4);
      c = rgb([24, 36, 22], c, leaf);
      return [h, c[0], c[1], c[2], 0.62 + (1 - leaf) * 0.3];
    }
  },
  // Player banner: vermilion silk, golden border and a bronze-drum sun emblem (ring + star).
  mat_team_player: {
    size: 128, uv: "mesh", uvScale: 1, metalness: 0.0, normalScale: 0.45, wet: 0,
    texel(u, v, x, y) {
      const weave = 0.5 + 0.5 * Math.sin(u * 128 * Math.PI) * Math.sin(v * 128 * Math.PI);
      const border = v < 0.12 || v > 0.88 || u > 0.92 ? 1 : 0;
      const dx = (u - 0.5) * 1.7, dy = v - 0.5, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      const ring = Math.abs(r - 0.27) < 0.035 ? 1 : 0;
      const star = r < 0.07 + 0.11 * Math.pow(Math.abs(Math.cos(ang * 4)), 6) ? 1 : 0;
      const emblem = Math.max(border, ring, star);
      const c = rgb([150, 28, 22], [214, 164, 66], emblem);
      return [0.4 + weave * 0.12 + emblem * 0.3 + hash(x, y, 101) * 0.03, c[0], c[1], c[2], 0.72 - emblem * 0.2];
    }
  },
  // Enemy banner: indigo silk with pale steel chevrons and a black hem — readable by shape, not only hue.
  mat_team_enemy: {
    size: 128, uv: "mesh", uvScale: 1, metalness: 0.0, normalScale: 0.45, wet: 0,
    texel(u, v, x, y) {
      const weave = 0.5 + 0.5 * Math.sin(u * 128 * Math.PI) * Math.sin(v * 128 * Math.PI);
      const hem = v < 0.08 || v > 0.92 ? 1 : 0;
      const chevron = fract(u * 3 + Math.abs(v - 0.5) * 2.2) < 0.32 && !hem ? 1 : 0;
      let c = rgb([30, 40, 74], [176, 182, 194], chevron);
      c = rgb(c, [10, 12, 18], hem);
      return [0.4 + weave * 0.12 + chevron * 0.28 - hem * 0.1 + hash(x, y, 103) * 0.03, c[0], c[1], c[2], 0.7 - chevron * 0.18];
    }
  }
};

// ---------------------------------------------------------------------------
interface Maps { map: THREE.DataTexture; detail: THREE.DataTexture; normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture; }
const maps = new Map<PbrName, Maps>();

function texture(data: Uint8Array<ArrayBuffer>, size: number, color: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function generate(name: PbrName): Maps {
  const spec = SPECS[name], size = spec.size, n = size * size;
  const height = new Float32Array(n), lum = new Float32Array(n);
  const albedo = new Uint8Array(n * 4), detail = new Uint8Array(n * 4), normal = new Uint8Array(n * 4), rough = new Uint8Array(n * 4);
  let maxLum = 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const [h, r, g, b, ro] = spec.texel(x / size, y / size, x, y);
    height[i] = h;
    albedo.set([r, g, b, 255], i * 4);
    lum[i] = r * 0.2126 + g * 0.7152 + b * 0.0722;
    maxLum = Math.max(maxLum, lum[i]);
    const rv = sat(ro) * 255;
    rough.set([rv, rv, rv, 255], i * 4);
  }
  const strength = 2.6;
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    // Luminance-only twin of the albedo so faction / team tints keep the same surface detail.
    const d = (0.3 + 0.7 * lum[i] / maxLum) * 255;
    detail.set([d, d, d, 255], i * 4);
    const dx = (at(x - 1, y) - at(x + 1, y)) * strength, dy = (at(x, y - 1) - at(x, y + 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    normal.set([(0.5 + 0.5 * dx / len) * 255, (0.5 + 0.5 * dy / len) * 255, (0.5 + 0.5 / len) * 255, 255], i * 4);
  }
  return {
    map: texture(albedo, size, true), detail: texture(detail, size, true),
    normalMap: texture(normal, size, false), roughnessMap: texture(rough, size, false)
  };
}

function mapsFor(name: PbrName): Maps {
  let m = maps.get(name);
  if (!m) { m = generate(name); maps.set(name, m); }
  return m;
}

/** Projected UVs + rain-darkened roughness, shared by every PBR material of the same mode. */
function patchShader(material: THREE.MeshStandardMaterial, spec: Spec): void {
  const scale = spec.uvScale.toFixed(3), wet = spec.wet.toFixed(2);
  const pick = spec.uv === "roof"
    ? "pdAxis.y > 0.35 ? (pdAxis.x > pdAxis.z ? position.zx : position.xz) : (pdAxis.x > pdAxis.z ? position.zy : position.xy)"
    : "pdAxis.y > max(pdAxis.x, pdAxis.z) ? position.xz : (pdAxis.x > pdAxis.z ? position.zy : position.xy)";
  material.onBeforeCompile = shader => {
    shader.uniforms.uRainWetness = rainWetness;
    if (spec.uv !== "mesh") {
      shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
        vec3 pdAxis = abs(normal);
        vec2 pdUv = (${pick}) * ${scale};
        #ifdef USE_MAP
          vMapUv = pdUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = pdUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = pdUv;
        #endif`);
    }
    shader.fragmentShader = "uniform float uRainWetness;\n" + shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = max(0.1, roughnessFactor * (1.0 - uRainWetness * ${wet}));`
    );
  };
  material.customProgramCacheKey = () => `dote-pbr-${spec.uv}-${scale}-${wet}`;
}

export interface PbrOptions {
  /** Tint over the luminance detail map (faction roofs, per-team banners). Omit for the authored albedo. */
  color?: THREE.ColorRepresentation;
  metalness?: number;
  roughness?: number;
  side?: THREE.Side;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

function bindMaps(material: THREE.MeshStandardMaterial, name: PbrName, tinted: boolean): void {
  const m = mapsFor(name);
  material.map = tinted ? m.detail : m.map;
  material.normalMap = m.normalMap;
  material.roughnessMap = m.roughnessMap;
  material.needsUpdate = true;
}

/** Canonical materials exist from import time; their textures are generated by ensurePbrTextures(). */
const pending = new Map<THREE.MeshStandardMaterial, PbrName>();

/** Generates the procedural textures (≈ a few hundred ms on mobile), called once when a 3D renderer starts. */
export function ensurePbrTextures(): void {
  for (const [material, name] of pending) bindMaps(material, name, false);
  pending.clear();
}

function build(name: PbrName, o: PbrOptions, lazy: boolean): THREE.MeshStandardMaterial {
  const spec = SPECS[name];
  const material = new THREE.MeshStandardMaterial({
    name,
    color: o.color ?? 0xffffff,
    normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? spec.metalness,
    side: o.side ?? spec.side ?? THREE.FrontSide,
    emissive: o.emissive ?? spec.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? spec.emissiveIntensity ?? 1
  });
  material.userData.sharedTexture = true;
  material.userData.pbr = name;
  patchShader(material, spec);
  if (lazy) pending.set(material, name);
  else bindMaps(material, name, o.color !== undefined);
  return material;
}

/** A fresh material owned by the caller (needed when a layer adds its own shader hooks such as wind). */
export function createPbrMaterial(name: PbrName, o: PbrOptions = {}): THREE.MeshStandardMaterial {
  return build(name, o, false);
}

/** Canonical shared materials (reuse them directly; never dispose them from a scene object). */
export const mat_wood = build("mat_wood", {}, true);
export const mat_roof = build("mat_roof", {}, true);
export const mat_stone = build("mat_stone", {}, true);
export const mat_gold = build("mat_gold", {}, true);
export const mat_bamboo = build("mat_bamboo", {}, true);
export const mat_foliage = build("mat_foliage", {}, true);
export const mat_team_player = build("mat_team_player", {}, true);
export const mat_team_enemy = build("mat_team_enemy", {}, true);

export const PBR_MATERIALS: Readonly<Record<PbrName, THREE.MeshStandardMaterial>> = {
  mat_wood, mat_roof, mat_stone, mat_gold, mat_bamboo, mat_foliage, mat_team_player, mat_team_enemy
};

const tints = new Map<string, THREE.MeshStandardMaterial>();
/** Cached tinted variant that shares the base textures (e.g. a jade-glazed roof for Trung Nguyên). */
export function pbrTint(name: PbrName, color: THREE.ColorRepresentation, o: Omit<PbrOptions, "color"> = {}): THREE.MeshStandardMaterial {
  const key = `${name}|${new THREE.Color(color).getHexString()}|${JSON.stringify(o)}`;
  let m = tints.get(key);
  if (!m) { m = createPbrMaterial(name, { ...o, color }); tints.set(key, m); }
  return m;
}

const flags = new Map<string, THREE.MeshStandardMaterial>();
/** Wind-blown faction banner cloth: player / enemy pattern tinted with the team's colour. */
export function pbrFlag(side: "player" | "enemy", color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const key = `${side}|${new THREE.Color(color).getHexString()}`;
  let m = flags.get(key);
  if (!m) {
    m = createPbrMaterial(side === "player" ? "mat_team_player" : "mat_team_enemy", { color, side: THREE.DoubleSide });
    // keep the authored emblem colours, nudged toward the live team colour
    m.map = mapsFor(side === "player" ? "mat_team_player" : "mat_team_enemy").map;
    m.color.set(color).lerp(new THREE.Color(0xffffff), 0.55);
    applyWind(m, "flag");
    flags.set(key, m);
  }
  return m;
}

/** Re-skins an imported mesh tree (Chặng 2B `.glb`) by matching material names to the shared library. */
export function applyPbrLibrary(root: THREE.Object3D): void {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material) => PBR_MATERIALS[m.name as PbrName] ?? m;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

/** Frees GPU copies; materials and textures re-upload transparently if the renderer is created again. */
export function disposePbrMaterials(): void {
  for (const m of [...Object.values(PBR_MATERIALS), ...tints.values(), ...flags.values()]) m.dispose();
  tints.clear();
  flags.clear();
  for (const set of maps.values()) for (const t of Object.values(set)) t.dispose();
}
