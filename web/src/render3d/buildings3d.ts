// Pixel Dynasty 3D — procedural stylized East Asian architecture for all 11 building types (4-age evolution).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, cyl, cone, sphere, geo, mat, mesh, shade, terrainHeight, Env3D, MAP_N, contactShadow, disposeTree, renderFaction, type Faction, smoothstep, fxGuard } from "./common";
import { paddyMaterial, RICE_COLORS, riceTuftGeometry } from "./terrain3d";
import { applyWind } from "./wind3d";
import { softMask } from "./surfaces";
import { mat_wood, mat_stone, mat_roof, mat_gold, mat_bamboo, pbrTint, pbrFlag } from "./pbrMaterials";
import type { Scene3D } from "./scene3d";
import type { FX3D } from "./fx3d";

const VERMILION = "#B91C1C", PLASTER = "#eadfc8", STONE = "#8f8a80", STONE_D = "#6b665e", TIMBER = "#5a3a22", GOLD = "#e8b53a";
const LATTICE = "#ffb347", BAMBOO = "#c9a36a", THATCH = "#b8955a", TERRACOTTA = "#b4532f";

export interface BuildingParts { fires: THREE.Mesh[]; spin: THREE.Object3D[]; top: number; lanterns: THREE.Object3D[]; chimney?: THREE.Vector3; doors?: THREE.Object3D[]; rice?: THREE.InstancedMesh; }
/** Collector for the building currently being assembled (lanterns register themselves to sway). */
let curParts: BuildingParts | null = null;
/** Side of the building being assembled: picks the player / enemy banner cloth (mat_team_*). */
let curSide: "player" | "enemy" = "player";

// ---------------------------------------------------------------------------
// Curved roof: flared upturned eaves, concave sweep, optional ridge along x.
function roofGeometry(w: number, d: number, h: number, lift: number): THREE.BufferGeometry {
  return geo(`roof${w},${d},${h},${lift}`, () => {
    const g = new THREE.PlaneGeometry(1, 1, 16, 16);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute("position");
    const ridge = w > d ? (1 - d / w) * 0.9 : 0;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) * 2, v = p.getZ(i) * 2;
      const au = Math.abs(u), av = Math.abs(v);
      const tu = ridge > 0 ? Math.max(0, (au - ridge) / (1 - ridge)) : au;
      const t = Math.max(tu, av);
      let y = h * Math.pow(1 - t, 1.55);
      const corner = Math.pow(au * av, 4);
      const edge = Math.pow(t, 6);
      y += lift * corner + lift * 0.18 * edge;
      p.setXYZ(i, u * w / 2, y, v * d / 2);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Thatch keeps its straw surface; every tiled roof uses mat_roof (tinted per faction / age). */
function roofMaterial(color: string, gilded: boolean): THREE.MeshStandardMaterial {
  if (color === THATCH) return mat(THATCH, { surface: "thatch", rough: 0.87, metal: 0.04, side: THREE.DoubleSide });
  if (color === TERRACOTTA) return mat_roof;
  return pbrTint("mat_roof", color, gilded ? { metalness: 0.42, roughness: 0.62 } : {});
}

/** Tiled roof colours for buildings that do not evolve with the age (farm hut, gate, market). */
function factionRoof(faction: Faction): { roof: string; ridge: string; trim: string } {
  if (faction === "trung_nguyen") return { roof: "#377972", ridge: GOLD, trim: "#2f5f5a" };
  if (faction === "bac_cuong") return { roof: "#39484b", ridge: "#82623f", trim: "#6b4a2e" };
  return { roof: TERRACOTTA, ridge: "#5a2a18", trim: VERMILION };
}

function roof(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color: string, ridgeColor: string, gilded = false, lift = 0.16): void {
  const r = mesh(roofGeometry(w, d, h, lift), roofMaterial(color, gilded), 0, y, 0);
  parent.add(r);
  // tile underside trim + golden ridge with upturned ridge ends
  const rm = ridgeColor === GOLD ? mat_gold : pbrTint("mat_roof", ridgeColor);
  const rl = w > d ? Math.max(0.12, (1 - d / w) * 0.9 * w) : 0.1;
  parent.add(mesh(box(rl + 0.06, 0.06, 0.07), rm, 0, y + h + 0.02, 0));
  for (const s of [-1, 1]) {
    const tip = mesh(cone(0.04, 0.14, 5), rm, s * (rl / 2 + 0.03), y + h + 0.07, 0);
    tip.rotation.z = -s * 0.5;
    parent.add(tip);
  }
  // curled roof-corner finials on the upturned eave tips
  const fm = ridgeColor === GOLD || gilded ? mat_gold : pbrTint("mat_roof", shade(ridgeColor, 0.15));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = mesh(cone(0.028, 0.13, 5), fm, sx * w / 2 * 0.98, y + lift + 0.05, sz * d / 2 * 0.98, false);
    f.rotation.set(sz * 0.7, 0, -sx * 0.7);
    parent.add(f);
  }
}

/** Stepped mat_stone plinth (stays planted while the rest rises during construction). */
function foundation(parent: THREE.Object3D, w: number, d: number, steps = 2, stairs = false): number {
  let y = 0; // The terrain blends the ground pad into the surrounding soil.
  const lower = pbrTint("mat_stone", "#8d887f");
  for (let k = 0; k < steps; k++) {
    const s = 1 - k * 0.07, h = 0.08;
    const step = mesh(box(w * s, h + (k === 0 ? 0.5 : 0), d * s), k === 0 ? lower : mat_stone, 0, y + h / 2 - (k === 0 ? 0.25 : 0), 0);
    step.userData.foundation = true;
    parent.add(step);
    y += h;
  }
  if (stairs) {
    const front = d * (1 - (steps - 1) * 0.07) / 2;
    for (let k = 0; k < steps; k++) {
      const st = mesh(box(Math.min(0.34, w * 0.42), y - k * 0.08, 0.07), k === 0 ? lower : mat_stone, 0, (y - k * 0.08) / 2, front + 0.035 + (steps - 1 - k) * 0.07);
      st.userData.foundation = true;
      parent.add(st);
    }
  }
  return y;
}

function pillars(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color = VERMILION, front = true): void {
  const m = color === TIMBER ? mat_wood : mat(color, { rough: 0.52, surface: "lacquer" });
  const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
  const post = (x: number, z: number) => {
    parent.add(mesh(cyl(0.035, 0.04, h, 8), m, x, y + h / 2, z));
    parent.add(mesh(box(0.085, 0.035, 0.085), mat_stone, x, y + 0.0175, z)); // chân tảng (stone pedestal)
  };
  for (const x of xs) for (const z of zs) post(x, z);
  if (front && w > 0.9) for (const z of zs) post(0, z);
}

/** Timber frame (mat_wood posts on stone pedestals + tie beams) for the economic / defensive buildings. */
function timberFrame(parent: THREE.Object3D, w: number, d: number, h: number, y: number): void {
  pillars(parent, w, d, h, y, TIMBER);
  for (const s of [-1, 1]) {
    parent.add(mesh(box(w + 0.08, 0.045, 0.05), mat_wood, 0, y + h - 0.02, s * d / 2));
    parent.add(mesh(box(0.05, 0.045, d + 0.08), mat_wood, s * w / 2, y + h - 0.02, 0));
  }
}

function walls(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color: string, windows = true): void {
  parent.add(mesh(box(w, h, d), mat(color, { rough: 0.85, surface: color === BAMBOO ? "teak" : "plaster" }), 0, y + h / 2, 0));
  // timber beam band
  parent.add(mesh(box(w + 0.02, 0.05, d + 0.02), mat_wood, 0, y + h - 0.03, 0));
  if (!windows) return;
  const lm = mat("#ffd08a", { emissive: LATTICE, emissiveIntensity: 0.83, rough: 0.55, surface: "lattice", lantern: true });
  const fm = mat_wood;
  const n = w > 1 ? 2 : 1;
  for (const s of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? 0 : (k === 0 ? -w * 0.25 : w * 0.25);
      parent.add(mesh(box(0.2, 0.16, 0.012), lm, x, y + h * 0.55, s * (d / 2 + 0.006), false));
      // lattice bars
      parent.add(mesh(box(0.012, 0.17, 0.02), fm, x, y + h * 0.55, s * (d / 2 + 0.01), false));
      parent.add(mesh(box(0.21, 0.012, 0.02), fm, x, y + h * 0.55, s * (d / 2 + 0.01), false));
    }
    parent.add(mesh(box(0.012, 0.16, 0.2), lm, s * (w / 2 + 0.006), y + h * 0.55, 0, false));
  }
  // door
  parent.add(mesh(box(0.18, h * 0.62, 0.02), pbrTint("mat_wood", "#8a5a48"), 0, y + h * 0.31, d / 2 + 0.012, false));
}

function lantern(parent: THREE.Object3D, x: number, y: number, z: number): void {
  // red silk lantern hung from a cord; the pivot sits at the hook so it swings like a pendulum
  const pivot = new THREE.Group();
  pivot.position.set(x, y + 0.15, z);
  const l = mesh(sphere(0.05, 10, 8), mat("#e8321e", { emissive: "#ff3a1a", emissiveIntensity: 0.85, rough: 0.56, surface: "silk", lantern: true }), 0, -0.15, 0, false);
  l.scale.set(1, 1.3, 1);
  pivot.add(l);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffa055, map: softMask(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0
  }));
  halo.material.userData.sharedTexture = true;
  halo.position.copy(l.position);
  halo.scale.set(0.57, 0.57, 1);
  halo.renderOrder = 4;
  pivot.add(halo);
  pivot.userData.halo = halo;
  for (const yy of [-0.08, -0.22]) pivot.add(mesh(cyl(0.025, 0.025, 0.02, 6), mat(GOLD, { metal: 0.7, rough: 0.3 }), 0, yy, 0, false));
  pivot.add(mesh(cyl(0.004, 0.004, 0.08, 4), mat("#3a2412"), 0, -0.04, 0, false));
  const tassel = mesh(cyl(0.004, 0.012, 0.07, 5), mat("#f2c14e"), 0, -0.27, 0, false);
  pivot.add(tassel);
  pivot.userData.ph = Math.random() * 6;
  parent.add(pivot);
  curParts?.lanterns.push(pivot);
}

function lanternOn(parent: THREE.Object3D, x: number, y: number, z: number): void { lantern(parent, x, y, z); }

function banner(parent: THREE.Object3D, x: number, y: number, z: number, color: string, h = 0.7): void {
  parent.add(mesh(cyl(0.012, 0.015, h, 6), mat_wood, x, y + h / 2, z));
  parent.add(mesh(sphere(0.025, 8, 6), mat_gold, x, y + h + 0.02, z));
  const g = geo("building-banner", () => new THREE.PlaneGeometry(0.34, 0.2, 8, 2).translate(0.17, 0, 0));
  const f = mesh(g, pbrFlag(curSide, color), x + 0.012, y + h - 0.12, z, false);
  f.userData.wind = true;
  parent.add(f);
}

function fire(parent: THREE.Object3D, parts: BuildingParts, x: number, y: number, z: number, s = 1): void {
  const f = mesh(cone(0.06 * s, 0.18 * s, 7), new THREE.MeshBasicMaterial({ color: 0xffa12a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), x, y + 0.09 * s, z, false);
  parent.add(f);
  parts.fires.push(f);
  const core = mesh(cone(0.035 * s, 0.1 * s, 6), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), x, y + 0.05 * s, z, false);
  parent.add(core);
  parts.fires.push(core);
}

// ---------------------------------------------------------------------------
interface Style { wall: string; roof: string; ridge: string; gilded: boolean; tiers: number; lanterns: boolean; }

function styleFor(age: number, team: string, faction: Faction): Style {
  if (faction === "trung_nguyen") return {
    wall: age === 1 ? "#d5bd9e" : PLASTER, roof: age === 4 ? "#dcb549" : "#377972",
    ridge: age >= 3 ? GOLD : "#982a23", gilded: age === 4, tiers: age >= 2 ? 2 : 1, lanterns: age >= 2
  };
  if (faction === "bac_cuong") return {
    wall: age >= 3 ? "#a0a79c" : "#8b6543", roof: age >= 3 ? "#39484b" : THATCH,
    ridge: "#82623f", gilded: false, tiers: age === 4 ? 2 : 1, lanterns: age >= 3
  };
  if (age <= 1) return { wall: BAMBOO, roof: THATCH, ridge: "#7a5a32", gilded: false, tiers: 1, lanterns: false };
  if (age === 2) return { wall: PLASTER, roof: TERRACOTTA, ridge: "#5a2a18", gilded: false, tiers: 1, lanterns: false };
  if (age === 3) return { wall: PLASTER, roof: TERRACOTTA, ridge: GOLD, gilded: false, tiers: 2, lanterns: true };
  return { wall: "#f2e6cc", roof: GOLD, ridge: shade(team, -0.1), gilded: true, tiers: 2, lanterns: true };
}

function hall(g: THREE.Group, parts: BuildingParts, w: number, d: number, wallH: number, st: Style): number {
  const y0 = foundation(g, w + 0.16, d + 0.16);
  pillars(g, w, d, wallH, y0, st.wall === BAMBOO ? "#8a6a3a" : VERMILION);
  walls(g, w - 0.05, d - 0.05, wallH, y0, st.wall);
  if (st.tiers > 1) {
    const brackets = mat(st.ridge, { surface: "lacquer", rough: 0.58 });
    for (const x of [-w * 0.45, 0, w * 0.45]) for (const z of [-d * 0.5, d * 0.5]) {
      g.add(mesh(box(0.12, 0.045, 0.24), brackets, x, y0 + wallH - 0.06, z));
      g.add(mesh(box(0.20, 0.035, 0.29), brackets, x, y0 + wallH - 0.025, z));
    }
  }
  let y = y0 + wallH;
  roof(g, w + 0.36, d + 0.36, 0.32 + (st.wall === BAMBOO ? 0.12 : 0), y - 0.02, st.roof, st.ridge, st.gilded, st.wall === BAMBOO ? 0.04 : 0.17);
  if (st.lanterns) for (const s of [-1, 1]) lantern(g, s * (w / 2 + 0.04), y - 0.12, d / 2 + 0.1);
  let top = y + 0.36;
  if (st.tiers >= 2) {
    const w2 = w * 0.62, d2 = d * 0.62, h2 = wallH * 0.55;
    const yb = y + 0.12;
    pillars(g, w2, d2, h2, yb, VERMILION, false);
    walls(g, w2 - 0.04, d2 - 0.04, h2, yb, st.wall, true);
    roof(g, w2 + 0.3, d2 + 0.3, 0.3, yb + h2 - 0.02, st.roof, st.ridge, st.gilded, 0.15);
    if (st.lanterns) for (const s of [-1, 1]) lantern(g, s * (w2 / 2 + 0.03), yb + h2 - 0.1, d2 / 2 + 0.08);
    top = yb + h2 + 0.34;
  }
  parts.top = top;
  return top;
}

export function buildBuilding(type: string, team: string, age: number, size: number, cropStage: number, mask = 0, faction: Faction = "dai_viet", side: "player" | "enemy" = "player"): { group: THREE.Group; parts: BuildingParts } {
  const g = new THREE.Group();
  const parts: BuildingParts = { fires: [], spin: [], top: 1, lanterns: [] };
  curParts = parts;
  curSide = side;
  const fr = factionRoof(faction);
  const S = size * 0.92;
  const teamRoof = shade(team, -0.25);
  const ageStyle = styleFor(age, team, faction);
  const milStyle: Style = {
    ...ageStyle,
    wall: ageStyle.wall,
    roof: ageStyle.roof,
    tiers: ageStyle.tiers
  };

  if (faction === "bac_cuong" && age === 1 && ["town_center", "house", "depot", "barracks", "archery_range", "stable"].includes(type)) {
    const radius = S * 0.40;
    const bottom = foundation(g, S * 0.93, S * 0.91, 1);
    const felt = mat("#c7b18c", { surface: "silk", rough: 0.86 });
    g.add(mesh(cyl(radius * 0.94, radius, 0.35, 16), felt, 0, bottom + 0.175, 0));
    g.add(mesh(cyl(radius * 0.22, radius * 1.04, 0.29, 16), felt, 0, bottom + 0.485, 0));
    g.add(mesh(cyl(radius * 1.01, radius * 1.01, 0.044, 16), mat(team, { surface: "silk" }), 0, bottom + 0.27, 0));
    g.add(mesh(box(radius * 0.58, 0.27, 0.07), mat(TIMBER, { surface: "teak" }), 0, bottom + 0.135, radius));
    banner(g, radius * 0.8, bottom, -radius * 0.76, team, 0.72);
    parts.top = bottom + 0.67;
    curParts = null;
    return { group: g, parts };
  }
  switch (type) {
    case "town_center": {
      const top = hall(g, parts, S * 0.82, S * 0.62, 0.42, ageStyle);
      if (age >= 4) {
        // ornate carved stone terrace with balustrade around the imperial double pavilion
        const tw = S * 0.98;
        g.add(mesh(box(tw, 0.07, tw), mat("#b9b2a3", { rough: 0.85 }), 0, 0.035, 0));
        const balM = mat("#d8d1c2", { rough: 0.8 });
        for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) {
          const q = -tw / 2 + (k / 6) * tw;
          g.add(mesh(box(0.035, 0.12, 0.035), balM, q, 0.13, sx * tw / 2));
          if (k !== 3 || sx < 0) g.add(mesh(box(0.035, 0.12, 0.035), balM, sx * tw / 2, 0.13, q));
        }
        for (const sx of [-1, 1]) {
          g.add(mesh(box(tw, 0.025, 0.04), balM, 0, 0.2, sx * tw / 2));
          g.add(mesh(box(0.04, 0.025, tw), balM, sx * tw / 2, 0.2, 0));
        }
        // gilded imperial crown tier
        roof(g, 0.42, 0.42, 0.22, top - 0.04, GOLD, shade(team, -0.1), true, 0.1);
        parts.top = top + 0.22;
      }
      // stone courtyard steps + lantern posts
      g.add(mesh(box(0.5, 0.05, 0.22), mat(STONE), 0, 0.03, S * 0.31 + 0.12));
      for (const s of [-1, 1]) {
        g.add(mesh(box(0.06, 0.32, 0.06), mat(STONE), s * 0.42, 0.16, S * 0.36 + 0.1));
        if (age >= 2) lantern(g, s * 0.42, 0.38, S * 0.36 + 0.1);
      }
      banner(g, -S * 0.45, 0, -S * 0.3, team, 0.95);
      if (age >= 3) banner(g, S * 0.45, 0, -S * 0.3, team, 0.95);
      break;
    }
    case "house": {
      // Nhà ngói: stepped stone plinth, timber frame on stone pedestals, verandah and a gently curved roof
      const st = { ...ageStyle, tiers: 1 };
      const thatch = st.roof === THATCH, roofH = thatch ? 0.4 : 0.3;
      const y0 = foundation(g, 0.82, 0.7, 2, true);
      timberFrame(g, 0.62, 0.5, 0.3, y0);
      walls(g, 0.57, 0.45, 0.3, y0, st.wall);
      for (const s of [-1, 1]) g.add(mesh(cyl(0.026, 0.03, 0.24, 7), mat_wood, s * 0.28, y0 + 0.12, 0.35));
      g.add(mesh(box(0.64, 0.035, 0.05), mat_wood, 0, y0 + 0.235, 0.35));
      roof(g, 0.98, 0.86, roofH, y0 + 0.28, st.roof, st.ridge, st.gilded, thatch ? 0.04 : 0.12);
      g.add(mesh(cyl(0.05, 0.038, 0.1, 9), mat("#4a3428", { surface: "glaze", rough: 0.45 }), 0.37, y0 + 0.05, 0.2));
      for (let k = 0; k < 3; k++) {
        const log = mesh(cyl(0.018, 0.018, 0.2, 6), mat_wood, -0.37, y0 + 0.018 + k * 0.034, 0.04 + (k % 2) * 0.03);
        log.rotation.x = Math.PI / 2;
        g.add(log);
      }
      if (faction === "bac_cuong") g.add(mesh(box(0.2, 0.15, 0.012), mat("#8b6a48", { surface: "silk", rough: 0.9 }), -0.16, y0 + 0.17, 0.236, false));
      if (age >= 3) lantern(g, 0.2, y0 + 0.24, 0.37);
      if (age <= 1) for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.022, 0.025, 0.42, 7), mat_bamboo, -0.43, 0.21, -0.15 + k * 0.08));
      banner(g, -0.4, 0, -0.3, team, 0.62);
      parts.top = y0 + 0.28 + roofH + 0.06;
      break;
    }
    case "depot": {
      // Kho lẫm: open timber shed with a plank back wall, crates, log pile, cut stone and grain sacks
      const y0 = foundation(g, 0.86, 0.76, 1, true);
      timberFrame(g, 0.64, 0.52, 0.36, y0);
      g.add(mesh(box(0.64, 0.33, 0.03), mat_wood, 0, y0 + 0.165, -0.26));
      roof(g, 0.92, 0.8, 0.26, y0 + 0.34, ageStyle.roof, ageStyle.ridge, ageStyle.gilded, ageStyle.roof === THATCH ? 0.04 : 0.1);
      if (age >= 3) lantern(g, 0.3, y0 + 0.3, 0.3);
      const iron = mat("#2c2a28", { metal: 0.6, rough: 0.45 });
      for (let k = 0; k < 3; k++) {
        g.add(mesh(box(0.13, 0.13, 0.13), mat_wood, -0.18 + k * 0.16, y0 + 0.065, -0.15));
        g.add(mesh(box(0.136, 0.018, 0.136), iron, -0.18 + k * 0.16, y0 + 0.1, -0.15, false));
      }
      g.add(mesh(box(0.12, 0.12, 0.12), mat_wood, -0.1, y0 + 0.19, -0.15));
      for (let k = 0; k < 5; k++) {
        const row = k < 3 ? 0 : 1, i = row ? k - 3 : k;
        const log = mesh(cyl(0.032, 0.032, 0.3, 7), mat_wood, 0.18, y0 + 0.032 + row * 0.056, 0.02 + i * 0.066 + row * 0.033);
        log.rotation.z = Math.PI / 2;
        g.add(log);
      }
      for (let k = 0; k < 3; k++) g.add(mesh(box(0.1, 0.07, 0.08), mat_stone, -0.22 + k * 0.11, y0 + 0.035, 0.2));
      for (let k = 0; k < 2; k++) {
        const sack = mesh(sphere(0.07, 8, 6), mat("#a89470", { surface: "silk", rough: 0.92 }), -0.16 + k * 0.13, y0 + 0.13, 0.2);
        sack.scale.set(1, 0.8, 1.15);
        g.add(sack);
      }
      banner(g, 0.4, 0, -0.33, team, 0.7);
      parts.top = y0 + 0.64;
      break;
    }
    case "farm": {
      const footprint = size / 2;
      const dry = cropStage === -1;
      const stage = Math.max(0, Math.min(2, cropStage));
      const bed = mat("#5f4631", { surface: "plaster", rough: 0.95 });
      for (const [tx, tz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = tx * footprint / 2, z = tz * footprint / 2;
        g.add(mesh(box(footprint * 0.96, 0.07, footprint * 0.96), bed, x, 0.025, z));
        if (tx === 1 && tz === -1) {
          // field hut (chòi canh): stone pad, timber posts, tiled roof in the faction's colours, team pennant
          const hut = new THREE.Group();
          hut.position.set(x, 0.06, z);
          hut.add(mesh(box(footprint * 0.62, 0.05, footprint * 0.6), mat_stone, 0, 0.0, 0));
          pillars(hut, footprint * 0.47, footprint * 0.46, 0.3, 0.025, TIMBER);
          for (const s of [-1, 1]) hut.add(mesh(box(footprint * 0.52, 0.035, 0.035), mat_wood, 0, 0.31, s * footprint * 0.23));
          hut.add(mesh(box(footprint * 0.4, 0.03, footprint * 0.3), mat_wood, 0, 0.12, 0)); // raised bamboo-slat bed
          roof(hut, footprint * 0.8, footprint * 0.78, 0.19, 0.31, faction === "bac_cuong" ? THATCH : fr.roof, fr.ridge, false, 0.07);
          hut.add(mesh(cyl(0.04, 0.032, 0.08, 9), mat("#4a3428", { surface: "glaze", rough: 0.45 }), footprint * 0.18, 0.065, footprint * 0.3));
          banner(hut, -footprint * 0.3, 0, -footprint * 0.28, team, 0.58);
          g.add(hut);
          continue;
        }
        g.add(mesh(box(footprint * 0.88, 0.016, footprint * 0.88), paddyMaterial(dry), x, 0.064, z, false));
        for (const sign of [-1, 1]) {
          g.add(mesh(box(footprint * 0.97, 0.073, footprint * 0.08), bed, x, 0.065, z + sign * footprint * 0.44));
          g.add(mesh(box(footprint * 0.08, 0.073, footprint * 0.9), bed, x + sign * footprint * 0.44, 0.065, z));
        }
      }
      const riceMaterial = new THREE.MeshStandardMaterial({ color: dry ? "#9a8452" : RICE_COLORS[stage], roughness: 0.6 });
      applyWind(riceMaterial, "rice");
      const tufts = new THREE.InstancedMesh(geo("farm-rice", riceTuftGeometry), riceMaterial, 27);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3(), scale = new THREE.Vector3();
      const rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
      let i = 0;
      for (const [tx, tz] of [[-1, -1], [-1, 1], [1, 1]]) {
        for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
          position.set((tx * 0.5 + col * 0.26) * footprint, 0, (tz * 0.5 + row * 0.26) * footprint);
          rotation.setFromAxisAngle(axis, i * 2.399);
          scale.set(footprint, dry ? 0.049 : [0.13, 0.25, 0.38][stage], footprint);
          tufts.setMatrixAt(i++, matrix.compose(position, rotation, scale));
        }
      }
      tufts.position.y = 0.077;
      tufts.receiveShadow = true;
      g.add(tufts);
      parts.rice = tufts;
      parts.top = 0.56;
      break;
    }
    case "barracks": {
      hall(g, parts, S * 0.8, S * 0.5, 0.36, milStyle);
      // weapon rack + training dummy
      for (let k = 0; k < 4; k++) {
        g.add(mesh(cyl(0.008, 0.008, 0.5, 4), mat(TIMBER, { surface: "teak" }), -0.55 + k * 0.06, 0.25, S * 0.36));
        g.add(mesh(cone(0.015, 0.06, 4), mat("#cbd5e1", { metal: 0.8, rough: 0.3 }), -0.55 + k * 0.06, 0.53, S * 0.36));
      }
      g.add(mesh(box(0.24, 0.02, 0.02), mat(TIMBER, { surface: "teak" }), -0.46, 0.35, S * 0.36));
      g.add(mesh(cyl(0.05, 0.05, 0.28, 6), mat(THATCH), 0.55, 0.2, S * 0.38));
      g.add(mesh(box(0.26, 0.03, 0.03), mat(TIMBER, { surface: "teak" }), 0.55, 0.28, S * 0.38));
      banner(g, S * 0.46, 0, -S * 0.2, team, 0.85);
      break;
    }
    case "archery_range": {
      hall(g, parts, S * 0.55, S * 0.42, 0.32, milStyle);
      // painted target stand
      const tz = S * 0.32, tx = S * 0.25;
      for (const s of [-1, 1]) g.add(mesh(cyl(0.012, 0.012, 0.42, 5), mat(TIMBER, { surface: "teak" }), tx + s * 0.12, 0.21, tz));
      const rings = ["#f2ead8", "#c0262d", "#f2ead8", "#e8b53a"];
      rings.forEach((c, i) => {
        const r = mesh(geo(`disc${i}`, () => new THREE.CylinderGeometry(0.15 - i * 0.035, 0.15 - i * 0.035, 0.02 + i * 0.004, 18)), mat(c), tx, 0.33, tz, true);
        r.rotation.x = Math.PI / 2;
        g.add(r);
      });
      for (let k = 0; k < 3; k++) { const a = mesh(cyl(0.004, 0.004, 0.16, 4), mat(TIMBER, { surface: "teak" }), tx - 0.04 + k * 0.04, 0.34 + (k - 1) * 0.03, tz + 0.08, false); a.rotation.x = Math.PI / 2; g.add(a); }
      banner(g, -S * 0.42, 0, -S * 0.22, team, 0.8);
      break;
    }
    case "watch_tower": {
      // Vọng lâu: four battered stone courses, timber lookout stage with railings, curved roof and brazier
      foundation(g, 0.74, 0.74, 1);
      const course = pbrTint("mat_stone", "#78736b");
      [0.56, 0.51, 0.46, 0.41].forEach((w, k) => {
        g.add(mesh(box(w, 0.3, w), mat_stone, 0, 0.23 + k * 0.29, 0));
        g.add(mesh(box(w + 0.03, 0.03, w + 0.03), course, 0, 0.08 + k * 0.29, 0));
      });
      g.add(mesh(box(0.5, 0.06, 0.5), mat_wood, 0, 1.35, 0));
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(mesh(cyl(0.022, 0.024, 0.3, 7), mat_wood, x, 1.52, z));
      for (const s of [-1, 1]) {
        g.add(mesh(box(0.44, 0.025, 0.025), mat_wood, 0, 1.47, s * 0.2));
        g.add(mesh(box(0.025, 0.025, 0.44), mat_wood, s * 0.2, 1.47, 0));
      }
      roof(g, 0.62, 0.62, 0.24, 1.66, ageStyle.roof, ageStyle.ridge, ageStyle.gilded, 0.12);
      if (age >= 3) lantern(g, 0.24, 1.55, 0.24);
      if (age >= 4) roof(g, 0.29, 0.29, 0.15, 1.88, GOLD, shade(team, -0.1), true, 0.09);
      g.add(mesh(cyl(0.08, 0.05, 0.07, 8), mat("#3a3a3a", { metal: 0.6, rough: 0.4 }), 0, 1.42, 0));
      fire(g, parts, 0, 1.45, 0, 0.9);
      g.add(mesh(box(0.08, 0.1, 0.01), mat("#ffd08a", { emissive: LATTICE, emissiveIntensity: 0.8, surface: "lattice", lantern: true }), 0, 0.95, 0.236, false));
      banner(g, 0.24, 1.38, 0.24, team, 0.55);
      parts.top = age >= 4 ? 2.08 : 1.95;
      break;
    }
    case "blacksmith": {
      // Lò rèn: plinth + timber hall, stone chimney (smoke origin), glowing forge, anvil, quench barrel, rack
      const st = { ...milStyle, roof: age >= 3 ? ageStyle.roof : TERRACOTTA, ridge: age >= 3 ? ageStyle.ridge : "#3a1a10", tiers: 1 };
      const w = S * 0.7, d = S * 0.5;
      const y0 = foundation(g, w + 0.16, d + 0.16, 2, true);
      timberFrame(g, w, d, 0.34, y0);
      walls(g, w - 0.05, d - 0.05, 0.34, y0, st.wall);
      roof(g, w + 0.36, d + 0.36, 0.32, y0 + 0.32, st.roof, st.ridge, st.gilded, st.roof === THATCH ? 0.04 : 0.15);
      parts.top = y0 + 0.32 + 0.36;
      const iron = mat("#475569", { metal: 0.85, rough: 0.35 });
      g.add(mesh(box(0.17, 0.9, 0.17), mat_stone, S * 0.28, 0.45, -S * 0.12));
      g.add(mesh(box(0.21, 0.05, 0.21), pbrTint("mat_stone", "#6f6a62"), S * 0.28, 0.92, -S * 0.12));
      parts.chimney = new THREE.Vector3(S * 0.28, 0.96, -S * 0.12);
      { const horn = mesh(cone(0.03, 0.08, 6), iron, S * 0.15 + 0.11, 0.17, S * 0.38, false); horn.rotation.z = -Math.PI / 2; g.add(horn); }
      g.add(mesh(box(0.34, 0.26, 0.26), mat_stone, -S * 0.3, 0.13, S * 0.33));
      const glowM = mat("#ff7a1a", { emissive: "#ff5a00", emissiveIntensity: 2.2 });
      g.add(mesh(box(0.16, 0.1, 0.02), glowM, -S * 0.3, 0.12, S * 0.33 + 0.135, false));
      fire(g, parts, -S * 0.3, 0.26, S * 0.33, 0.8);
      g.add(mesh(box(0.16, 0.06, 0.08), iron, S * 0.15, 0.17, S * 0.38));
      g.add(mesh(cyl(0.04, 0.05, 0.12, 7), mat_wood, S * 0.15, 0.07, S * 0.38));
      g.add(mesh(cyl(0.065, 0.06, 0.14, 10), mat_wood, S * 0.02, 0.07, S * 0.42));
      g.add(mesh(cyl(0.067, 0.067, 0.014, 10), mat("#2c2a28", { metal: 0.6, rough: 0.45 }), S * 0.02, 0.11, S * 0.42, false));
      for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.008, 0.008, 0.36, 5), iron, S * 0.4 + k * 0.05, 0.2, S * 0.2));
      g.add(mesh(box(0.18, 0.02, 0.025), mat_wood, S * 0.45, 0.3, S * 0.2));
      banner(g, -S * 0.42, 0, -S * 0.22, team, 0.8);
      break;
    }
    case "stable": {
      hall(g, parts, S * 0.85, S * 0.42, 0.3, milStyle);
      // fenced paddock + hay bales
      const fz = S * 0.42;
      for (let k = 0; k < 6; k++) g.add(mesh(box(0.03, 0.2, 0.03), mat(TIMBER, { surface: "teak" }), -0.7 + k * 0.28, 0.1, fz));
      for (const y of [0.08, 0.16]) g.add(mesh(box(1.42, 0.02, 0.02), mat("#8a5a2e"), 0, y, fz));
      for (let k = 0; k < 2; k++) { const h = mesh(cyl(0.08, 0.08, 0.16, 10), mat("#d9b54a"), -0.25 + k * 0.2, 0.08, fz - 0.15); h.rotation.z = Math.PI / 2; g.add(h); }
      banner(g, S * 0.46, 0, -S * 0.2, team, 0.8);
      break;
    }
    case "siege_workshop": {
      const y0 = foundation(g, S * 0.9, S * 0.7, 1);
      pillars(g, S * 0.8, S * 0.55, 0.46, y0, TIMBER);
      roof(g, S * 0.95, S * 0.72, 0.3, y0 + 0.44, ageStyle.roof, ageStyle.ridge, ageStyle.gilded, 0.12);
      if (age >= 4) lantern(g, S * 0.42, y0 + 0.39, S * 0.30);
      // half-built engine: frame + wheel + logs
      const wheel = mesh(geo("wheel", () => new THREE.TorusGeometry(0.16, 0.025, 6, 14)), mat(TIMBER, { surface: "teak" }), 0.2, 0.2, S * 0.38);
      g.add(wheel);
      parts.spin.push(wheel);
      g.add(mesh(box(0.5, 0.05, 0.05), mat("#8a5a2e"), -0.1, 0.12, S * 0.38));
      const arm = mesh(box(0.04, 0.55, 0.04), mat("#8a5a2e"), -0.15, 0.32, S * 0.3); arm.rotation.z = 0.6; g.add(arm);
      for (let k = 0; k < 3; k++) { const l = mesh(cyl(0.04, 0.04, 0.5, 6), mat("#9a6a3a"), -0.4, 0.05 + k * 0.07, -S * 0.15 + (k % 2) * 0.06); l.rotation.z = Math.PI / 2; g.add(l); }
      banner(g, -S * 0.45, 0, -S * 0.3, team, 0.85);
      parts.top = y0 + 0.9;
      break;
    }
    case "imperial_citadel": {
      const W = S * 1.02;
      const wallM = mat(STONE, { rough: 0.9, surface: "stone" }), capM = mat(STONE_D, { surface: "stone" });
      g.add(mesh(box(W, 0.06, W), mat("#a59f92"), 0, 0.03, 0));
      for (const s of [-1, 1]) {
        g.add(mesh(box(W, 0.32, 0.12), wallM, 0, 0.16, s * W / 2));
        g.add(mesh(box(0.12, 0.32, W), wallM, s * W / 2, 0.16, 0));
        for (let k = 0; k < 9; k++) {
          const a = -W / 2 + 0.06 + k * ((W - 0.12) / 8);
          g.add(mesh(box(0.07, 0.07, 0.13), capM, a, 0.355, s * W / 2));
          g.add(mesh(box(0.13, 0.07, 0.07), capM, s * W / 2, 0.355, a));
        }
        for (const t of [-1, 1]) {
          const turret = new THREE.Group();
          turret.position.set(s * W / 2, 0, t * W / 2);
          turret.add(mesh(box(0.2, 0.46, 0.2), wallM, 0, 0.23, 0));
          roof(turret, 0.3, 0.3, 0.12, 0.46, teamRoof, GOLD, false, 0.08);
          g.add(turret);
        }
      }
      g.add(mesh(box(0.3, 0.24, 0.05), mat("#5a1a12"), 0, 0.12, W / 2 + 0.04));
      roof(g, 0.44, 0.18, 0.1, 0.32, GOLD, teamRoof, true, 0.06);
      // double-tier golden palace
      const palace = new THREE.Group();
      hall(palace, parts, W * 0.55, W * 0.42, 0.36, { wall: "#f2e6cc", roof: GOLD, ridge: shade(team, -0.1), gilded: true, tiers: 2, lanterns: true });
      palace.position.set(0, 0.04, -0.05);
      g.add(palace);
      parts.top += 0.04;
      banner(g, -W / 2, 0.46, W / 2, team, 0.75);
      banner(g, W / 2, 0.46, W / 2, team, 0.75);
      break;
    }
    case "wall": {
      // Tường thành: dark stone footing, mat_stone courses, a tiled coping (mat_roof) and crenellations
      const stoneM = mat_stone, darkM = pbrTint("mat_stone", "#7d786f"), capM = mat_roof;
      const post = (x: number, z: number, w: number, d: number, h: number) => {
        g.add(mesh(box(w, h, d), stoneM, x, h / 2, z));
        g.add(mesh(box(w + 0.04, 0.05, d + 0.04), capM, x, h + 0.025, z));
      };
      const T = 0.4, H = 0.58;
      g.add(mesh(box(T + 0.1, 0.07, T + 0.1), darkM, 0, 0.035, 0));
      post(0, 0, T + 0.06, T + 0.06, H + 0.06);
      const arms: Array<[number, number, number, number]> = [[1, 0, -1, 0], [2, 1, 0, 0], [4, 0, 1, 0], [8, -1, 0, 0]];
      for (const [bit, dx, dz] of arms.map(a => [a[0], a[1], a[2]])) {
        if (!(mask & bit)) continue;
        const len = 0.5 - (T + 0.06) / 2;
        const cx = dx * ((T + 0.06) / 2 + len / 2), cz = dz * ((T + 0.06) / 2 + len / 2);
        const w = dx !== 0 ? len : T, d = dz !== 0 ? len : T;
        g.add(mesh(box(w, 0.07, d + (dz ? 0 : 0.1)), darkM, cx, 0.035, cz));
        g.add(mesh(box(w, H, d), stoneM, cx, H / 2, cz));
        g.add(mesh(box(w + (dz ? 0.04 : 0), 0.05, d + (dz ? 0 : 0.04)), capM, cx, H + 0.025, cz));
        for (const sd of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            const off = (k - 0.5) * (len * 0.5);
            const mx = dx !== 0 ? cx + off : cx + sd * (T / 2 - 0.05), mz = dz !== 0 ? cz + off : cz + sd * (T / 2 - 0.05);
            g.add(mesh(box(dx !== 0 ? 0.1 : 0.08, 0.1, dz !== 0 ? 0.1 : 0.08), stoneM, mx, H + 0.1, mz));
          }
        }
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(box(0.09, 0.1, 0.09), stoneM, sx * 0.13, H + 0.17, sz * 0.13));
      // a faction banner on corners, ends and isolated posts (straight runs stay clean)
      if (mask !== 5 && mask !== 10) banner(g, 0.02, H + 0.06, 0.02, team, 0.5);
      parts.top = H + 0.3;
      break;
    }
    case "gate": {
      // Cổng thành: stone piers, timber gatehouse pavilion under a curved roof, studded swinging doors
      const stoneM = mat_stone, darkM = pbrTint("mat_stone", "#7d786f"), capM = pbrTint("mat_stone", "#c9c3b8");
      const ironM = mat("#2c2a28", { metal: 0.6, rough: 0.4 });
      const alongZ = !(mask & (2 | 8)) && !!(mask & (1 | 4));
      const gg = new THREE.Group();
      if (alongZ) gg.rotation.y = Math.PI / 2;
      g.add(gg);
      gg.add(mesh(box(1.0, 0.06, 0.62), darkM, 0, 0.03, 0));
      for (const sx of [-1, 1]) {
        gg.add(mesh(box(0.28, 0.8, 0.5), stoneM, sx * 0.36, 0.4, 0));
        gg.add(mesh(box(0.32, 0.05, 0.54), capM, sx * 0.36, 0.825, 0));
        for (const sz of [-1, 1]) gg.add(mesh(box(0.08, 0.09, 0.08), stoneM, sx * 0.36, 0.89, sz * 0.2));
      }
      gg.add(mesh(box(0.9, 0.12, 0.5), stoneM, 0, 0.68, 0));
      gg.add(mesh(box(0.5, 0.05, 0.54), mat(fr.trim, { rough: 0.6, surface: "lacquer" }), 0, 0.605, 0));
      // gatehouse pavilion
      gg.add(mesh(box(0.84, 0.04, 0.46), mat_wood, 0, 0.76, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) gg.add(mesh(cyl(0.022, 0.025, 0.2, 7), mat_wood, sx * 0.34, 0.87, sz * 0.18));
      for (const sz of [-1, 1]) gg.add(mesh(box(0.72, 0.022, 0.022), mat_wood, 0, 0.84, sz * 0.18));
      roof(gg, 1.06, 0.74, 0.26, 0.96, fr.roof, fr.ridge, false, 0.12);
      for (const sx of [-1, 1]) lanternOn(gg, sx * 0.5, 0.78, 0.3);
      // swinging double doors (pivot at hinge, pushed open when friendly units are near)
      const doors: THREE.Object3D[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.22, 0, 0);
        const panel = new THREE.Group();
        panel.add(mesh(box(0.22, 0.54, 0.05), mat_wood, -sx * 0.11, 0.27, 0));
        for (const yy of [0.12, 0.42]) panel.add(mesh(box(0.22, 0.03, 0.06), ironM, -sx * 0.11, yy, 0, false));
        for (const yy of [0.2, 0.34]) for (const xx of [0.05, 0.11, 0.17]) panel.add(mesh(sphere(0.008, 5, 4), ironM, -sx * xx, yy, 0.028, false));
        panel.add(mesh(sphere(0.02, 6, 5), mat_gold, -sx * 0.17, 0.27, 0.035, false));
        pivot.add(panel);
        pivot.userData.sx = sx;
        gg.add(pivot);
        doors.push(pivot);
      }
      parts.doors = doors;
      banner(gg, -0.36, 0.89, -0.2, team, 0.35);
      banner(gg, 0.36, 0.89, 0.2, team, 0.35);
      parts.top = 1.27;
      break;
    }
    case "market": {
      // Nhà chợ: stone-paved plinth, four timber stalls with muted striped awnings, a small tiled pavilion
      const y0 = foundation(g, S * 0.98, S * 0.98, 1, true);
      g.add(mesh(box(S * 0.96, 0.04, S * 0.96), pbrTint("mat_stone", "#bdb6aa"), 0, y0 + 0.02, 0));
      const awn = ["#8e2a20", "#a8822e", "#2f6a64", "#5b3f78"], stripe = "#d9cfba";
      const stalls: Array<[number, number, number]> = [[-1, -1, 0], [1, -1, 1], [-1, 1, 2], [1, 1, 3]];
      for (const [sx, sz, i] of stalls) {
        const cx = sx * S * 0.25, cz = sz * S * 0.25;
        for (const px of [-1, 1]) for (const pz of [-1, 1]) g.add(mesh(cyl(0.022, 0.026, 0.46, 7), mat_wood, cx + px * 0.3, y0 + 0.27, cz + pz * 0.26));
        const aw = new THREE.Group();
        aw.position.set(cx, y0 + 0.5, cz);
        aw.rotation.x = -sz * 0.22;
        for (let k = 0; k < 6; k++) aw.add(mesh(box(0.1, 0.025, 0.62), mat(k % 2 ? stripe : awn[i], { rough: 0.8, surface: "silk" }), -0.3 + k * 0.12, 0, 0));
        for (let k = 0; k < 6; k++) aw.add(mesh(box(0.1, 0.07, 0.015), mat(k % 2 ? stripe : awn[i], { rough: 0.8, surface: "silk" }), -0.3 + k * 0.12, -0.04, sz * 0.315));
        g.add(aw);
        g.add(mesh(box(0.56, 0.16, 0.18), mat_wood, cx, y0 + 0.1, cz + sz * 0.12));
        for (let k = 0; k < 4; k++) {
          const gm = mat(["#a8432f", "#b8963a", "#5f8a3c", "#9c7f52"][(k + i) % 4], { rough: 0.6 });
          g.add(mesh(sphere(0.045, 8, 6), gm, cx - 0.18 + k * 0.12, y0 + 0.22, cz + sz * 0.12));
        }
      }
      // central tiled pavilion (replaces the bare pole), crates, barrels
      for (const px of [-1, 1]) for (const pz of [-1, 1]) g.add(mesh(cyl(0.02, 0.024, 0.62, 7), mat_wood, px * 0.1, y0 + 0.31, pz * 0.1));
      roof(g, 0.42, 0.42, 0.18, y0 + 0.6, fr.roof, fr.ridge, false, 0.07);
      g.add(mesh(box(0.14, 0.12, 0.14), mat_wood, 0.1, y0 + 0.1, 0.16));
      g.add(mesh(box(0.12, 0.1, 0.12), mat_wood, -0.14, y0 + 0.09, -0.16));
      g.add(mesh(cyl(0.07, 0.07, 0.15, 10), mat_wood, 0.16, y0 + 0.115, -0.14));
      g.add(mesh(cyl(0.072, 0.072, 0.014, 10), mat("#2c2a28", { metal: 0.6, rough: 0.45 }), 0.16, y0 + 0.15, -0.14, false));
      banner(g, S * 0.45, y0, S * 0.45, team, 0.75);
      lanternOn(g, S * 0.3, y0 + 0.5, 0);
      lanternOn(g, -S * 0.3, y0 + 0.5, 0);
      parts.top = y0 + 0.95;
      break;
    }
    default: {
      hall(g, parts, S * 0.7, S * 0.6, 0.34, milStyle);
    }
  }

  // corner tower roofs for the citadel (placed after construction so they sit on the towers)
  if (type === "imperial_citadel") {
    const W = S * 1.02;
    const roofs = g.children.filter(c => (c as THREE.Mesh).geometry === roofGeometry(0.3, 0.3, 0.12, 0.08));
    const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    roofs.forEach((r, i) => { const c = corners[i % 4]; r.position.set(c[0] * W / 2, 0.46, c[1] * W / 2); });
  }

  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.castShadow) m.receiveShadow = true; });
  curParts = null;
  return { group: g, parts };
}

// ---------------------------------------------------------------------------
function batchStaticMeshes(root: THREE.Object3D, parts: BuildingParts, key: string, path = "r"): void {
  const batches = new Map<string, THREE.Mesh[]>();
  const moving = new Set<THREE.Object3D>([...parts.fires, ...parts.spin]);
  // Sub-groups (gatehouse, door panels, awnings, field hut, lantern pivots) move or sit as a whole, so their
  // own siblings can be merged in local space too; individually animated meshes are never merged.
  root.children.forEach((child, i) => {
    if (!(child as THREE.Mesh).isMesh && child.children.length) batchStaticMeshes(child, parts, key, `${path}.${i}`);
  });
  for (const child of root.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.wind || mesh.userData.foundation || (mesh as THREE.InstancedMesh).isInstancedMesh || moving.has(mesh)) continue;
    if (mesh.material.transparent) continue;
    const id = `${mesh.material.id}/${mesh.castShadow}/${mesh.receiveShadow}`;
    const batch = batches.get(id);
    if (batch) batch.push(mesh);
    else batches.set(id, [mesh]);
  }
  for (const [id, batch] of batches) {
    if (batch.length < 4) continue;
    const geometry = geo(`building:${key}/${path}/${id}`, () => {
      const geometries = batch.map(mesh => {
        const transformed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        mesh.updateMatrix();
        return transformed.applyMatrix4(mesh.matrix);
      });
      const merged = mergeGeometries(geometries)!;
      for (const geometry of geometries) geometry.dispose();
      return merged;
    });
    const first = batch[0];
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    root.remove(...batch);
    root.add(mesh);
  }
}

function scaffold(size: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const pole = mat("#d2ad69", { surface: "thatch", rough: 0.88 });
  const h = Math.max(0.55, height * 0.92), edge = size * 0.53;
  for (const x of [-edge, edge]) for (const z of [-edge, edge]) {
    group.add(mesh(cyl(0.023, 0.027, h, 5), pole, x, h / 2, z, false));
  }
  for (const side of [-edge, edge]) {
    group.add(mesh(box(size * 1.11, 0.042, 0.04), pole, 0, h * 0.62, side, false));
    const brace = mesh(box(Math.hypot(size, h), 0.044, 0.04), pole, 0, h * 0.48, side, false);
    brace.rotation.z = Math.atan2(h * 0.86, size) * Math.sign(side);
    group.add(brace);
  }
  return group;
}

interface Entry { fxState?: "none" | "smoke" | "fire"; dustBursts?: number; group: THREE.Group; rising: THREE.Group; parts: BuildingParts; key: string; ring: THREE.LineLoop; base: THREE.Mesh; scorch: THREE.Mesh; scaffold?: THREE.Group; dustT: number; smokeT: number; fireT: number; puffT?: number; b: any; open?: number; }

function linkMask(state: any, b: any): number {
  let m = 0;
  const has = (x: number, y: number) => state.buildings.some((o: any) => o.tx === x && o.ty === y && o.team === b.team && (o.type === "wall" || o.type === "gate") && o.hp > 0);
  if (has(b.tx, b.ty - 1)) m |= 1;
  if (has(b.tx + 1, b.ty)) m |= 2;
  if (has(b.tx, b.ty + 1)) m |= 4;
  if (has(b.tx - 1, b.ty)) m |= 8;
  return m;
}

/** Glowing, waving rally flag planted at a production building's rally point. */
class RallyFlag {
  readonly group = new THREE.Group();
  private readonly glow: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  constructor() {
    this.group.add(mesh(cyl(0.015, 0.02, 0.9, 6), mat("#3a2412"), 0, 0.45, 0));
    this.group.add(mesh(sphere(0.035, 8, 6), mat(GOLD, { metal: 0.8, rough: 0.3 }), 0, 0.92, 0));
    const g = geo("rally-cloth", () => new THREE.PlaneGeometry(0.46, 0.28, 10, 2).translate(0.23, 0, 0));
    const cloth = mat("#ffd23a", { emissive: "#ff9a1a", emissiveIntensity: 0.8,
      side: THREE.DoubleSide, rough: 0.65, surface: "silk", flagWind: true });
    this.group.add(mesh(g, cloth, 0.016, 0.76, 0, false));
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xffc84a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.03; this.glow.renderOrder = 6;
    this.group.add(this.glow);
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.position.y = 0.76; this.halo.renderOrder = 6;
    this.group.add(this.halo);
  }
  update(t: number, halo: boolean): void {
    const k = 0.85 + Math.sin(t * 4) * 0.15;
    this.glow.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.55 + k * 0.3;
    this.halo.scale.setScalar(0.9 + k * 0.3);
    this.halo.visible = halo;
  }
  dispose(): void { disposeTree(this.group); }
}

export class Buildings3D {
  private readonly rally = new Map<number, RallyFlag>();
  readonly group = new THREE.Group();
  private readonly map = new Map<number, Entry>();
  private readonly ringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]);
  private readonly ringMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95, fog: false });

  constructor(private readonly fx: FX3D) {}

  /** Building ids -> current entry (used by the overlay for HP bars). */
  entries(): IterableIterator<Entry> { return this.map.values(); }

  /** Diagnostics: construction / damage state per building. */
  stats(): Array<Record<string, unknown>> {
    return [...this.map.values()].map(e => ({
      id: e.b.id, type: e.b.type, building: (e.b.progress ?? 1) < 1, rising: +e.rising.scale.y.toFixed(3), scaffold: Boolean(e.scaffold),
      scorch: e.scorch.visible, fx: e.fxState ?? "none", dustBursts: e.dustBursts ?? 0
    }));
  }

  /** Root of a building's model (hit flash target). */
  rootFor(id: number): THREE.Object3D | undefined { return this.map.get(id)?.group; }

  private remove(entry: Entry): void {
    entry.ring.removeFromParent();
    entry.base.removeFromParent();
    entry.scorch.removeFromParent();
    if (entry.scaffold) disposeTree(entry.scaffold);
    disposeTree(entry.group);
  }

  clear(): void {
    for (const e of this.map.values()) this.remove(e);
    this.map.clear();
    for (const f of this.rally.values()) { this.group.remove(f.group); f.dispose(); }
    this.rally.clear();
  }

  dispose(): void {
    this.clear();
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.group.removeFromParent();
  }

  update(state: any, env: Env3D, t: number, dt: number, scene: Scene3D): void {
    const seen = new Set<number>();
    this.fx.torchBegin();
    for (const b of state.buildings) {
      seen.add(b.id);
      const color = env.teamColor(b);
      const aiAge = b.team === "enemy" ? state.aiStates?.find((ai: { idx: number }) => ai.idx === b.aiIndex + 1)?.age : undefined;
      const age = Math.min(4, Math.max(1, aiAge ?? env.ageOf(b) ?? 1));
      const faction = renderFaction(b, state);
      const stage = b.type === "farm" ? (b.depleted || b.cropAmount === 0 ? -1 : Math.max(0, Math.min(2, b.cropStage ?? 1))) : 0;
      const ageKey = b.type === "town_center" || b.type === "house" || b.type === "depot" || b.type === "stable" || b.type === "barracks" || b.type === "archery_range" || b.type === "watch_tower" || b.type === "blacksmith" || b.type === "siege_workshop" ? age : 0;
      const mask = b.type === "wall" || b.type === "gate" ? linkMask(state, b) : 0;
      const side = b.team === "player" ? "player" : "enemy";
      const key = `${b.type}|${faction}|${side}|${color}|${ageKey}|${stage}|${mask}|${b.size || 1}`;
      let e = this.map.get(b.id);
      if (!e || e.key !== key) {
        if (e) this.remove(e);
        const built = buildBuilding(b.type, color, Math.min(4, age), b.size || 1, stage, mask, faction, side);
        batchStaticMeshes(built.group, built.parts, key);
        const rising = new THREE.Group();
        if (b.type !== "farm") {
          if (!built.group.children.some(child => child.userData.foundation)) {
            const footing = mesh(box((b.size || 1) * 0.83, 0.055, (b.size || 1) * 0.8), mat(STONE_D, { surface: "stone", rough: 0.91 }), 0, 0.019, 0);
            footing.userData.foundation = true;
            built.group.add(footing);
          }
          for (const child of [...built.group.children]) if (!child.userData.foundation) rising.add(child);
          built.group.add(rising);
        }
        const ring = new THREE.LineLoop(this.ringGeo, this.ringMat);
        ring.renderOrder = 6;
        built.group.add(ring);
        const size = b.size || 1;
        const base = contactShadow(size * 1.56, size * 1.4);
        const scorch = contactShadow(size * 1.21, size * 1.17);
        this.group.add(base, scorch);
        e = { group: built.group, rising, parts: built.parts, key, ring, base, scorch, dustT: 0, smokeT: 0, fireT: 0, b };
        this.group.add(e.group);
        this.map.set(b.id, e);
      }
      e.b = b;
      const size = b.size || 1;
      const cx = b.tx + size / 2, cz = b.ty + size / 2;
      let hMin = 9, hAvg = 0;
      for (const [dx, dz] of [[0, 0], [size, 0], [0, size], [size, size], [size / 2, size / 2]]) { const h = terrainHeight(b.tx + dx, b.ty + dz); hMin = Math.min(hMin, h); hAvg += h / 5; }
      const gy = Math.max(hMin, hAvg - 0.06);
      e.group.position.set(cx, gy, cz);
      const fogv = state.fog[Math.min(MAP_N - 1, b.ty)]?.[Math.min(MAP_N - 1, b.tx)] ?? 0;
      e.group.visible = b.team === "player" || fogv !== 0;
      // Construction and damage are separate states: a site under construction never smokes or burns,
      // even though its hit points start at ~10 % of the maximum.
      const building = (b.progress ?? 1) < 1;
      const hpk = b.maxHp > 0 ? b.hp / b.maxHp : 1;
      e.base.position.set(cx, gy + 0.038, cz);
      e.base.visible = e.group.visible && b.type !== "farm";
      e.scorch.position.set(cx + 0.18 * size, gy + 0.046, cz - 0.12 * size);
      e.scorch.visible = e.group.visible && !building && hpk < 0.5;
      if (building && !e.scaffold) {
        e.scaffold = scaffold(size, e.parts.top);
        this.group.add(e.scaffold);
      }
      if (e.scaffold && !building) {
        // finished: the bamboo scaffold is removed for good
        disposeTree(e.scaffold);
        e.scaffold = undefined;
      }
      if (e.scaffold) {
        e.scaffold.visible = e.group.visible;
        e.scaffold.position.set(cx, gy, cz);
      }
      const progress = building ? Math.max(0, Math.min(1, b.progress)) : 1;
      e.rising.scale.y = Math.max(0.04, progress);
      e.rising.visible = progress > 0.025;
      if (e.parts.rice) {
        e.parts.rice.scale.y = Math.max(0.035, smoothstep(0.22, 1, progress));
        e.parts.rice.visible = progress > 0.22;
      }
      const sel = state.selectedBuildingId === b.id;
      e.ring.visible = sel;
      if (sel) { e.ring.scale.set(size * 1.04, 1, size * 1.04); e.ring.position.y = 0.04; (e.ring.material as THREE.LineBasicMaterial).opacity = 0.7 + Math.sin(t * 6) * 0.3; }
      if (!e.group.visible) continue;

      if (building) {
        // beige soil dust hugging the ground, only while a villager is actually working on this site
        fxGuard("build-dust", () => {
          e!.dustT -= dt;
          if (e!.dustT > 0) return;
          e!.dustT = 0.3;
          const working = state.units.some((u: any) => u.hp > 0 && u.team === b.team && u.type === "villager" && u.task === "build" &&
            u.buildTargetId === b.id && Math.hypot(u.x - cx, u.y - cz) <= 2.3 + size / 2);
          if (working) e!.dustBursts = (e!.dustBursts ?? 0) + 1;
          if (working) this.fx.smoke.burst(cx + (Math.random() - 0.5) * size * 0.9, gy + 0.05, cz + (Math.random() - 0.5) * size * 0.9, 2, 0.32, 0.08, 0.6, 0.6, [0xc8b28a, 0xb8a27c], 0, 0.7);
        });
      }
      // auto-opening gate doors: swing wide while a friendly unit is passing
      if (e.parts.doors) {
        let want = 0;
        if (!building) for (const u of state.units) {
          if (u.team !== b.team || u.hp <= 0) continue;
          if (Math.abs(u.x - cx) < 1.5 && Math.abs(u.y - cz) < 1.5) { want = 1; break; }
        }
        e.open = (e.open ?? 0) + (want - (e.open ?? 0)) * Math.min(1, dt * 6);
        for (const d of e.parts.doors) d.rotation.y = -d.userData.sx * e.open * 1.45;
      }
      // flickering fires / furnace
      for (let i = 0; i < e.parts.fires.length; i++) {
        const f = e.parts.fires[i];
        const k = 0.8 + Math.sin(t * 17 + i * 2.1 + b.id) * 0.15 + Math.sin(t * 29 + i) * 0.08;
        f.scale.set(1, k, 1);
      }
      // swaying silk lanterns
      for (const l of e.parts.lanterns) {
        l.rotation.z = Math.sin(t * 1.6 + l.userData.ph) * 0.14;
        l.rotation.x = Math.sin(t * 1.2 + l.userData.ph * 1.3) * 0.08;
        const halo = l.userData.halo as THREE.Sprite;
        halo.visible = scene.quality !== "low" && scene.weather.lanternBoost > 0.08;
        halo.material.color.setHex(0xffa055).multiplyScalar(scene.quality === "high" ? 2.4 : 1);
        halo.material.opacity = scene.weather.lanternBoost * (scene.quality === "high" ? 0.87 : 0.56);
      }
      // blacksmith chimney: rising, swelling 3D smoke puffs
      if (e.parts.chimney && !building) {
        e.puffT = (e.puffT ?? 0) - dt;
        if (e.puffT <= 0) {
          e.puffT = 0.35 + Math.random() * 0.2;
          const c = e.parts.chimney;
          this.fx.smoke.emit(cx + c.x, gy + c.y, cz + c.z, 0.08 + (Math.random() - 0.5) * 0.06, 0.38 + Math.random() * 0.15, (Math.random() - 0.5) * 0.06, 2.4 + Math.random() * 0.8, 0.8 + Math.random() * 0.4, Math.random() < 0.5 ? 0x8a837a : 0xa59d92, 0.07, 2.6);
        }
      }
      for (const s of e.parts.spin) if ((s as THREE.Mesh).geometry?.type === "TorusGeometry") s.rotation.z = Math.sin(t * 0.8) * 0.4;

      // damage VFX (finished buildings only): dark grey smoke < 50 % HP, plus fire and orange embers < 25 % HP
      e.fxState = !building && hpk < 0.25 ? "fire" : !building && hpk < 0.5 ? "smoke" : "none";
      if (!building) fxGuard("damage-fx", () => {
        const top = gy + e!.parts.top;
        if (hpk < 0.5) {
          e!.smokeT -= dt;
          if (e!.smokeT <= 0) {
            e!.smokeT = hpk < 0.25 ? 0.07 : 0.14;
            const ox = (Math.random() - 0.5) * size * 0.6, oz = (Math.random() - 0.5) * size * 0.6;
            this.fx.smoke.emit(cx + ox, top - 0.1, cz + oz, (Math.random() - 0.5) * 0.15 + 0.12, 0.55 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15, 2.2, 1.6 + Math.random(), Math.random() < 0.5 ? 0x3a3937 : 0x4a4744, 0.08, 2.2);
          }
        }
        if (hpk < 0.25) {
          e!.fireT -= dt;
          if (e!.fireT <= 0) {
            e!.fireT = 0.04;
            const ox = (Math.random() - 0.5) * size * 0.7, oz = (Math.random() - 0.5) * size * 0.7;
            this.fx.glow.emit(cx + ox, gy + 0.2 + Math.random() * (top - gy) * 0.7, cz + oz, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 0.55, 1.2 + Math.random() * 1.2, [0xff5a00, 0xff9a1a, 0xffd34a][Math.floor(Math.random() * 3)], 0.6);
            if (Math.random() < 0.35) this.fx.glow.emit(cx + ox * 0.6, top - 0.15, cz + oz * 0.6, (Math.random() - 0.5) * 0.5, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5, 1.4, 0.32, 0xff8a2a, 0.35);
          }
        }
      });
      // warm torch sprites (batched) on finished Đình Làng / Vọng Lâu / Hoàng Thành
      if (!building && (b.type === "town_center" || b.type === "watch_tower" || b.type === "imperial_citadel")) {
        if (b.type === "watch_tower") for (const s of [-1, 1]) this.fx.torch(cx + s * 0.22, gy + 1.52, cz + 0.22, b.id + s);
        else if (b.type === "town_center") for (const s of [-1, 1]) this.fx.torch(cx + s * size * 0.36, gy + 0.56, cz + size * 0.42, b.id + s);
        else { const w = size * 0.47; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.fx.torch(cx + sx * w, gy + 0.64, cz + sz * w, b.id + sx * 3 + sz); }
      }
    }
    // rally flags: visible for the selected player production building
    const rseen = new Set<number>();
    for (const b of state.buildings) {
      if (!b.rallyPoint || b.team !== "player" || state.selectedBuildingId !== b.id || b.hp <= 0) continue;
      rseen.add(b.id);
      let f = this.rally.get(b.id);
      if (!f) { f = new RallyFlag(); this.rally.set(b.id, f); this.group.add(f.group); }
      const r = b.rallyPoint;
      f.group.position.set(r.x, terrainHeight(r.x, r.y), r.y);
      f.update(t, scene.quality !== "low");
    }
    for (const [id, f] of this.rally) if (!rseen.has(id)) { this.group.remove(f.group); f.dispose(); this.rally.delete(id); }
    this.fx.torchEnd(scene.weather.lanternBoost);
    for (const [id, e] of this.map) {
      if (seen.has(id)) continue;
      // one-shot collapse when a building is destroyed; a site under construction collapses with only
      // the part that was already raised (no lingering damage fire either way)
      if (e.group.visible) fxGuard("collapse", () => {
        const raised = Math.max(0.15, e.rising.scale.y);
        this.fx.debris.burst(e.group.position.x, e.group.position.y + 0.3 * raised, e.group.position.z, Math.round(24 * raised), 1.8, 3 * raised, 1.2, 2.2, [0x6b665e, 0x8f8a80, 0x5a3a22], -8);
        this.fx.smoke.burst(e.group.position.x, e.group.position.y + 0.1, e.group.position.z, Math.round(6 * raised) + 1, 0.8, 0.3, 1.1, 0.9, [0xb8a27c, 0x8f857a], 0, 1.3);
      });
      this.remove(e);
      this.map.delete(id);
    }
  }
}
