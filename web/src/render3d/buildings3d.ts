// Pixel Dynasty 3D — procedural stylized East Asian architecture for all 11 building types (4-age evolution).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, cyl, cone, sphere, geo, mat, mesh, shade, terrainHeight, Env3D, MAP_N, contactShadow, disposeTree } from "./common";
import { softMask } from "./surfaces";
import type { Scene3D } from "./scene3d";
import type { FX3D } from "./fx3d";

const VERMILION = "#B91C1C", PLASTER = "#eadfc8", STONE = "#8f8a80", STONE_D = "#6b665e", TIMBER = "#5a3a22", GOLD = "#e8b53a";
const LATTICE = "#ffb347", BAMBOO = "#c9a36a", THATCH = "#b8955a", TERRACOTTA = "#b4532f";

export interface BuildingParts { fires: THREE.Mesh[]; spin: THREE.Object3D[]; top: number; lanterns: THREE.Object3D[]; chimney?: THREE.Vector3; doors?: THREE.Object3D[]; }
/** Collector for the building currently being assembled (lanterns register themselves to sway). */
let curParts: BuildingParts | null = null;

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

function roof(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color: string, ridgeColor: string, gilded = false, lift = 0.16): void {
  const surface = color === THATCH ? "thatch" : gilded || color !== TERRACOTTA ? "glaze" : "tile";
  const m = mat(color, {
    surface, rough: surface === "glaze" ? 0.44 : 0.87, metal: gilded ? 0.24 : 0.04, side: THREE.DoubleSide
  });
  const r = mesh(roofGeometry(w, d, h, lift), m, 0, y, 0);
  parent.add(r);
  // tile underside trim + golden ridge with upturned ridge ends
  const rm = mat(ridgeColor, { metal: ridgeColor === GOLD ? 0.75 : 0.1, rough: ridgeColor === GOLD ? 0.3 : 0.6 });
  const rl = w > d ? Math.max(0.12, (1 - d / w) * 0.9 * w) : 0.1;
  parent.add(mesh(box(rl + 0.06, 0.06, 0.07), rm, 0, y + h + 0.02, 0));
  for (const s of [-1, 1]) {
    const tip = mesh(cone(0.04, 0.14, 5), rm, s * (rl / 2 + 0.03), y + h + 0.07, 0);
    tip.rotation.z = -s * 0.5;
    parent.add(tip);
  }
  // curled roof-corner finials on the upturned eave tips
  const fm = mat(ridgeColor === GOLD || gilded ? GOLD : shade(ridgeColor, 0.15), { metal: 0.6, rough: 0.35 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = mesh(cone(0.028, 0.13, 5), fm, sx * w / 2 * 0.98, y + lift + 0.05, sz * d / 2 * 0.98, false);
    f.rotation.set(sz * 0.7, 0, -sx * 0.7);
    parent.add(f);
  }
}

function foundation(parent: THREE.Object3D, w: number, d: number, steps = 2): number {
  let y = 0; const groundPad = mesh(box(w * 1.2, 0.018, d * 1.2), mat(shade(STONE_D, -0.18), { rough: 0.98, surface: "stone" }), 0, 0.048, 0, false); groundPad.receiveShadow = true; parent.add(groundPad);
  for (let k = 0; k < steps; k++) {
    const s = 1 - k * 0.07, h = 0.08;
    parent.add(mesh(box(w * s, h + (k === 0 ? 0.5 : 0), d * s), mat(k === 0 ? STONE_D : STONE, { rough: 0.92, surface: "stone" }), 0, y + h / 2 - (k === 0 ? 0.25 : 0), 0));
    y += h;
  }
  return y;
}

function pillars(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color = VERMILION, front = true): void {
  const m = mat(color, { rough: 0.52, surface: "lacquer" });
  const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
  for (const x of xs) for (const z of zs) parent.add(mesh(cyl(0.035, 0.04, h, 8), m, x, y + h / 2, z));
  if (front && w > 0.9) for (const z of zs) parent.add(mesh(cyl(0.035, 0.04, h, 8), m, 0, y + h / 2, z));
}

function walls(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color: string, windows = true): void {
  parent.add(mesh(box(w, h, d), mat(color, { rough: 0.85, surface: color === BAMBOO ? "teak" : "plaster" }), 0, y + h / 2, 0));
  // timber beam band
  parent.add(mesh(box(w + 0.02, 0.05, d + 0.02), mat(TIMBER, { surface: "teak" }), 0, y + h - 0.03, 0));
  if (!windows) return;
  const lm = mat("#ffd08a", { emissive: LATTICE, emissiveIntensity: 0.83, rough: 0.55, surface: "lattice", lantern: true });
  const fm = mat(TIMBER, { surface: "teak" });
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
  parent.add(mesh(box(0.18, h * 0.62, 0.02), mat("#4a1c12"), 0, y + h * 0.31, d / 2 + 0.012, false));
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
  parent.add(mesh(cyl(0.012, 0.015, h, 6), mat("#3a2412"), x, y + h / 2, z));
  parent.add(mesh(sphere(0.025, 8, 6), mat(GOLD, { metal: 0.8, rough: 0.3 }), x, y + h + 0.02, z));
  const g = geo("building-banner", () => new THREE.PlaneGeometry(0.34, 0.2, 8, 2).translate(0.17, 0, 0));
  const f = mesh(g, mat(color, { side: THREE.DoubleSide, rough: 0.73, surface: "silk", flagWind: true }),
    x + 0.012, y + h - 0.12, z, false);
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

function styleFor(age: number, team: string): Style {
  if (age <= 1) return { wall: BAMBOO, roof: THATCH, ridge: "#7a5a32", gilded: false, tiers: 1, lanterns: false };
  if (age === 2) return { wall: PLASTER, roof: TERRACOTTA, ridge: "#5a2a18", gilded: false, tiers: 1, lanterns: false };
  if (age === 3) return { wall: PLASTER, roof: "#42745b", ridge: GOLD, gilded: false, tiers: 2, lanterns: true };
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

export function buildBuilding(type: string, team: string, age: number, size: number, cropStage: number, mask = 0): { group: THREE.Group; parts: BuildingParts } {
  const g = new THREE.Group();
  const parts: BuildingParts = { fires: [], spin: [], top: 1, lanterns: [] };
  curParts = parts;
  const S = size * 0.92;
  const teamRoof = shade(team, -0.25);
  const ageStyle = styleFor(age, team);
  const milStyle: Style = {
    ...ageStyle,
    wall: age === 1 ? BAMBOO : PLASTER,
    roof: age === 3 ? teamRoof : ageStyle.roof,
    tiers: age === 4 ? 2 : 1
  };

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
      const st = { ...ageStyle, tiers: 1 };
      hall(g, parts, 0.62, 0.5, 0.3, st);
      if (age >= 3) lantern(g, 0.2, 0.3, 0.3);
      if (age <= 1) for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.025, 0.025, 0.42, 6), mat("#a8b85a"), -0.38, 0.21, -0.15 + k * 0.08));
      break;
    }
    case "depot": {
      const y0 = foundation(g, 0.8, 0.7, 1);
      pillars(g, 0.62, 0.5, 0.36, y0, TIMBER);
      roof(g, 0.86, 0.72, 0.26, y0 + 0.34, ageStyle.roof, ageStyle.ridge, ageStyle.gilded, 0.1);
      if (age >= 3) lantern(g, 0.28, 0.36, 0.33);
      for (let k = 0; k < 3; k++) g.add(mesh(box(0.14, 0.14, 0.14), mat("#8a5a2e"), -0.18 + k * 0.17, y0 + 0.07, -0.08));
      for (let k = 0; k < 2; k++) { const s = mesh(sphere(0.08, 8, 6), mat("#d8c08a"), -0.1 + k * 0.2, y0 + 0.07, 0.14); s.scale.set(1, 0.8, 1.2); g.add(s); }
      parts.top = y0 + 0.6;
      break;
    }
    case "farm": {
      const grow = [0.3, 0.62, 1][Math.max(0, Math.min(2, cropStage))];
      const riceCol = cropStage >= 2 ? "#e2b23a" : cropStage === 1 ? "#4caf3c" : "#8fe08a";
      for (let row = 0; row < 3; row++) {
        const z = -0.3 + row * 0.3, y = row * 0.035;
        g.add(mesh(box(0.88, 0.07 + y, 0.28), mat("#6b4a26", { rough: 0.95 }), 0, (0.07 + y) / 2, z));
        g.add(mesh(box(0.8, 0.01, 0.22), mat("#5e8f86", { rough: 0.15, metal: 0.2, transparent: true, opacity: 0.85 }), 0, 0.075 + y, z, false));
        for (let k = 0; k < 6; k++) {
          const st = mesh(cone(0.04, 0.3 * grow, 5), mat(riceCol, { flat: true }), -0.34 + k * 0.136, 0.08 + y + 0.15 * grow, z);
          g.add(st);
          parts.spin.push(st);
        }
      }
      // little scarecrow
      g.add(mesh(cyl(0.012, 0.012, 0.36, 5), mat(TIMBER, { surface: "teak" }), 0.4, 0.18, 0.4));
      g.add(mesh(cone(0.07, 0.05, 8), mat(THATCH), 0.4, 0.37, 0.4));
      parts.top = 0.45;
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
      foundation(g, 0.72, 0.72, 1);
      const body = mesh(cyl(0.24, 0.32, 1.25, 4), mat(STONE, { rough: 0.9, flat: true, surface: "stone" }), 0, 0.7, 0);
      body.rotation.y = Math.PI / 4;
      g.add(body);
      for (let k = 0; k < 4; k++) g.add(mesh(box(0.36, 0.03, 0.36), mat(STONE_D), 0, 0.35 + k * 0.28, 0));
      g.add(mesh(box(0.46, 0.06, 0.46), mat(TIMBER, { surface: "teak" }), 0, 1.35, 0));
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(mesh(cyl(0.02, 0.02, 0.3, 6), mat(VERMILION, { surface: "lacquer" }), x, 1.52, z));
      roof(g, 0.6, 0.6, 0.24, 1.66, ageStyle.roof, ageStyle.ridge, ageStyle.gilded, 0.12);
      if (age >= 3) lantern(g, 0.24, 1.55, 0.24);
      if (age >= 4) roof(g, 0.29, 0.29, 0.15, 1.88, GOLD, shade(team, -0.1), true, 0.09);
      // brazier
      g.add(mesh(cyl(0.08, 0.05, 0.07, 8), mat("#3a3a3a", { metal: 0.6, rough: 0.4 }), 0, 1.42, 0));
      fire(g, parts, 0, 1.45, 0, 0.9);
      g.add(mesh(box(0.08, 0.1, 0.01), mat("#ffd08a", { emissive: LATTICE, emissiveIntensity: 0.8, surface: "lattice", lantern: true }), 0, 0.95, 0.26, false));
      banner(g, 0.24, 1.38, 0.24, team, 0.55);
      parts.top = age >= 4 ? 2.08 : 1.95;
      break;
    }
    case "blacksmith": {
      hall(g, parts, S * 0.7, S * 0.5, 0.34, { ...milStyle, roof: age >= 3 ? ageStyle.roof : TERRACOTTA, ridge: age >= 3 ? ageStyle.ridge : "#3a1a10" });
      // chimney + glowing furnace + anvil
      g.add(mesh(box(0.16, 0.9, 0.16), mat(STONE_D, { rough: 0.95 }), S * 0.28, 0.45, -S * 0.12));
      g.add(mesh(box(0.2, 0.05, 0.2), mat("#3f3b36"), S * 0.28, 0.92, -S * 0.12));
      parts.chimney = new THREE.Vector3(S * 0.28, 0.96, -S * 0.12);
      // anvil horn
      { const horn = mesh(cone(0.03, 0.08, 6), mat("#475569", { metal: 0.85, rough: 0.35 }), S * 0.15 + 0.11, 0.17, S * 0.38, false); horn.rotation.z = -Math.PI / 2; g.add(horn); }
      g.add(mesh(box(0.34, 0.26, 0.26), mat("#57534e", { rough: 0.9 }), -S * 0.3, 0.13, S * 0.33));
      const glowM = mat("#ff7a1a", { emissive: "#ff5a00", emissiveIntensity: 2.2 });
      g.add(mesh(box(0.16, 0.1, 0.02), glowM, -S * 0.3, 0.12, S * 0.33 + 0.135, false));
      fire(g, parts, -S * 0.3, 0.26, S * 0.33, 0.8);
      g.add(mesh(box(0.16, 0.06, 0.08), mat("#475569", { metal: 0.85, rough: 0.35 }), S * 0.15, 0.17, S * 0.38));
      g.add(mesh(cyl(0.04, 0.05, 0.12, 6), mat(TIMBER, { surface: "teak" }), S * 0.15, 0.07, S * 0.38));
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
      const stoneM = mat("#9a948a", { rough: 0.9 }), darkM = mat(STONE_D, { rough: 0.95 }), capM = mat("#b3ada1", { rough: 0.85 });
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
        g.add(mesh(box(w + (dz ? 0.04 : 0), 0.05, d + (dx ? 0.0 : 0.0) + (dz ? 0 : 0.04)), capM, cx, H + 0.025, cz));
        // battlements (merlons) on both faces
        for (const sd of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            const off = (k - 0.5) * (len * 0.5);
            const mx = dx !== 0 ? cx + off : cx + sd * (T / 2 - 0.05), mz = dz !== 0 ? cz + off : cz + sd * (T / 2 - 0.05);
            g.add(mesh(box(dx !== 0 ? 0.1 : 0.08, 0.1, dz !== 0 ? 0.1 : 0.08), stoneM, mx, H + 0.1, mz));
          }
        }
      }
      if (!mask) for (let k = 0; k < 4; k++) g.add(mesh(box(0.09, 0.1, 0.09), stoneM, ((k & 1) ? 1 : -1) * 0.13, H + 0.17, ((k & 2) ? 1 : -1) * 0.13));
      else for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(box(0.09, 0.1, 0.09), stoneM, sx * 0.13, H + 0.17, sz * 0.13));
      parts.top = H + 0.3;
      break;
    }
    case "gate": {
      const stoneM = mat("#9a948a", { rough: 0.9 }), darkM = mat(STONE_D, { rough: 0.95 }), woodM = mat("#6b4423", { rough: 0.8 }), ironM = mat("#2c2a28", { metal: 0.6, rough: 0.4 });
      const alongZ = !(mask & (2 | 8)) && !!(mask & (1 | 4));
      const gg = new THREE.Group();
      if (alongZ) gg.rotation.y = Math.PI / 2;
      g.add(gg);
      gg.add(mesh(box(1.0, 0.06, 0.62), darkM, 0, 0.03, 0));
      for (const sx of [-1, 1]) {
        gg.add(mesh(box(0.28, 0.8, 0.5), stoneM, sx * 0.36, 0.4, 0));
        gg.add(mesh(box(0.32, 0.05, 0.54), mat("#b3ada1", { rough: 0.85 }), sx * 0.36, 0.825, 0));
        for (const sz of [-1, 1]) gg.add(mesh(box(0.08, 0.09, 0.08), stoneM, sx * 0.36, 0.89, sz * 0.2));
      }
      gg.add(mesh(box(0.9, 0.12, 0.5), stoneM, 0, 0.68, 0));
      gg.add(mesh(box(0.5, 0.05, 0.54), mat(VERMILION, { rough: 0.6 }), 0, 0.605, 0));
      // curved gatehouse roof
      roof(gg, 1.06, 0.74, 0.26, 0.84, TERRACOTTA, "#5a2a18", false, 0.12);
      for (const sx of [-1, 1]) lanternOn(gg, sx * 0.5, 0.72, 0.3);
      // swinging double doors (pivot at hinge, pushed open when friendly units are near)
      const doors: THREE.Object3D[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.22, 0, 0);
        const panel = new THREE.Group();
        panel.add(mesh(box(0.22, 0.54, 0.05), woodM, -sx * 0.11, 0.27, 0));
        for (const yy of [0.12, 0.42]) panel.add(mesh(box(0.22, 0.03, 0.06), ironM, -sx * 0.11, yy, 0, false));
        panel.add(mesh(sphere(0.02, 6, 5), mat(GOLD, { metal: 0.8, rough: 0.3 }), -sx * 0.17, 0.27, 0.035, false));
        pivot.add(panel);
        pivot.userData.sx = sx;
        gg.add(pivot);
        doors.push(pivot);
      }
      parts.doors = doors;
      banner(gg, -0.36, 0.89, -0.2, team, 0.35);
      parts.top = 1.15;
      break;
    }
    case "market": {
      const woodM = mat("#7a5230", { rough: 0.85 }), plankM = mat("#a4784a", { rough: 0.85 });
      const y0 = foundation(g, S * 0.98, S * 0.98, 1);
      g.add(mesh(box(S * 0.96, 0.04, S * 0.96), plankM, 0, y0 + 0.02, 0));
      const awn = ["#d9382b", "#f2b630", "#2fa6a0", "#8a4fc4"];
      const stalls: Array<[number, number, number]> = [[-1, -1, 0], [1, -1, 1], [-1, 1, 2], [1, 1, 3]];
      for (const [sx, sz, i] of stalls) {
        const cx = sx * S * 0.25, cz = sz * S * 0.25;
        for (const px of [-1, 1]) for (const pz of [-1, 1]) g.add(mesh(cyl(0.022, 0.026, 0.46, 6), woodM, cx + px * 0.3, y0 + 0.27, cz + pz * 0.26));
        // sloped striped awning
        const aw = new THREE.Group();
        aw.position.set(cx, y0 + 0.5, cz);
        aw.rotation.x = -sz * 0.22;
        for (let k = 0; k < 6; k++) aw.add(mesh(box(0.1, 0.025, 0.62), mat(k % 2 ? "#f6efe0" : awn[i], { rough: 0.7 }), -0.3 + k * 0.12, 0, 0));
        for (let k = 0; k < 6; k++) aw.add(mesh(box(0.1, 0.07, 0.015), mat(k % 2 ? "#f6efe0" : awn[i], { rough: 0.7 }), -0.3 + k * 0.12, -0.04, sz * 0.315, false));
        g.add(aw);
        // counter + goods
        g.add(mesh(box(0.56, 0.16, 0.18), woodM, cx, y0 + 0.1, cz + sz * 0.12));
        for (let k = 0; k < 4; k++) {
          const gm = mat(["#e0523a", "#e8c23a", "#7ac04a", "#c9a36a"][(k + i) % 4], { rough: 0.6 });
          const o = mesh(sphere(0.045, 8, 6), gm, cx - 0.18 + k * 0.12, y0 + 0.22, cz + sz * 0.12);
          g.add(o);
        }
      }
      // central pole with banner, crates, barrels
      g.add(mesh(cyl(0.025, 0.03, 0.9, 6), woodM, 0, y0 + 0.45, 0));
      banner(g, 0, y0 + 0.5, 0, team, 0.45);
      g.add(mesh(box(0.14, 0.12, 0.14), plankM, 0.1, y0 + 0.06, 0.08));
      g.add(mesh(box(0.12, 0.1, 0.12), plankM, -0.12, y0 + 0.05, -0.09));
      g.add(mesh(cyl(0.07, 0.07, 0.15, 8), woodM, 0.05, y0 + 0.08, -0.14));
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
function batchStaticMeshes(root: THREE.Group, parts: BuildingParts, key: string): void {
  const batches = new Map<string, THREE.Mesh[]>();
  const moving = new Set<THREE.Object3D>([...parts.fires, ...parts.spin]);
  for (const child of root.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.wind || moving.has(mesh)) continue;
    if (mesh.material.transparent) continue;
    const id = `${mesh.material.id}/${mesh.castShadow}/${mesh.receiveShadow}`;
    const batch = batches.get(id);
    if (batch) batch.push(mesh);
    else batches.set(id, [mesh]);
  }
  for (const [id, batch] of batches) {
    if (batch.length < 4) continue;
    const geometry = geo(`building:${key}/${id}`, () => {
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

interface Entry { group: THREE.Group; parts: BuildingParts; key: string; ring: THREE.LineLoop; base: THREE.Mesh; scorch: THREE.Mesh; scaffold?: THREE.Group; dustT: number; smokeT: number; fireT: number; puffT?: number; b: any; open?: number; }

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
    for (const b of state.buildings) {
      seen.add(b.id);
      const color = env.teamColor(b);
      const aiAge = b.team === "enemy" ? state.aiStates?.find((ai: { idx: number }) => ai.idx === b.aiIndex + 1)?.age : undefined;
      const age = Math.min(4, Math.max(1, aiAge ?? env.ageOf(b) ?? 1));
      const stage = b.type === "farm" ? (b.cropStage === undefined ? 1 : b.cropStage) : 0;
      const ageKey = b.type === "town_center" || b.type === "house" || b.type === "depot" || b.type === "stable" || b.type === "barracks" || b.type === "archery_range" || b.type === "watch_tower" || b.type === "blacksmith" || b.type === "siege_workshop" ? age : 0;
      const mask = b.type === "wall" || b.type === "gate" ? linkMask(state, b) : 0;
      const key = `${b.type}|${color}|${ageKey}|${stage}|${mask}|${b.size || 1}`;
      let e = this.map.get(b.id);
      if (!e || e.key !== key) {
        if (e) this.remove(e);
        const built = buildBuilding(b.type, color, Math.min(4, age), b.size || 1, stage, mask);
        batchStaticMeshes(built.group, built.parts, key);
        const ring = new THREE.LineLoop(this.ringGeo, this.ringMat);
        ring.renderOrder = 6;
        built.group.add(ring);
        const size = b.size || 1;
        const base = contactShadow(size * 1.56, size * 1.4);
        const scorch = contactShadow(size * 1.21, size * 1.17);
        this.group.add(base, scorch);
        e = { group: built.group, parts: built.parts, key, ring, base, scorch, dustT: 0, smokeT: 0, fireT: 0, b };
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
      const building = b.progress !== undefined && b.progress < 1;
      e.base.position.set(cx, gy + 0.038, cz);
      e.base.visible = e.group.visible && b.type !== "farm";
      e.scorch.position.set(cx + 0.18 * size, gy + 0.046, cz - 0.12 * size);
      e.scorch.visible = e.group.visible && b.hp < b.maxHp * 0.4;
      if (building && !e.scaffold) {
        e.scaffold = scaffold(size, e.parts.top);
        this.group.add(e.scaffold);
      }
      if (e.scaffold) {
        e.scaffold.visible = building && e.group.visible;
        e.scaffold.position.set(cx, gy, cz);
      }
      e.group.scale.set(1, building ? 0.25 + 0.75 * Math.max(0, b.progress) : 1, 1);
      const sel = state.selectedBuildingId === b.id;
      e.ring.visible = sel;
      if (sel) { e.ring.scale.set(size * 1.04, 1, size * 1.04); e.ring.position.y = 0.04 / Math.max(0.25, e.group.scale.y); (e.ring.material as THREE.LineBasicMaterial).opacity = 0.7 + Math.sin(t * 6) * 0.3; }
      if (!e.group.visible) continue;

      if (building) {
        e.dustT -= dt;
        if (e.dustT <= 0) {
          e.dustT = 0.28;
          this.fx.smoke.burst(cx + (Math.random() - 0.5) * size, gy + 0.10, cz, 2, 0.29, 0.17, 0.63, 0.75, [0xb49b75], 0, 0.65);
        }
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
        halo.material.opacity = scene.weather.lanternBoost * (scene.quality === "high" ? 0.77 : 0.56);
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

      // damage VFX: smoke < 50% HP, fire < 25% HP
      const hpk = b.hp / b.maxHp;
      const top = gy + e.parts.top * e.group.scale.y;
      if (hpk < 0.5) {
        e.smokeT -= dt;
        if (e.smokeT <= 0) {
          e.smokeT = hpk < 0.25 ? 0.07 : 0.14;
          const ox = (Math.random() - 0.5) * size * 0.6, oz = (Math.random() - 0.5) * size * 0.6;
          this.fx.smoke.emit(cx + ox, top - 0.1, cz + oz, (Math.random() - 0.5) * 0.15 + 0.12, 0.55 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15, 2.2, 1.6 + Math.random(), Math.random() < 0.5 ? 0x2a2420 : 0x3d3631, 0.08, 2.2);
        }
      }
      if (hpk < 0.25) {
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = 0.04;
          const ox = (Math.random() - 0.5) * size * 0.7, oz = (Math.random() - 0.5) * size * 0.7;
          this.fx.glow.emit(cx + ox, gy + 0.2 + Math.random() * (top - gy) * 0.7, cz + oz, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 0.55, 1.2 + Math.random() * 1.2, [0xff5a00, 0xff9a1a, 0xffd34a][Math.floor(Math.random() * 3)], 0.6);
        }
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
    for (const [id, e] of this.map) {
      if (seen.has(id)) continue;
      // collapse burst when a building is destroyed
      if (e.group.visible) this.fx.debris.burst(e.group.position.x, e.group.position.y + 0.3, e.group.position.z, 24, 1.8, 3, 1.2, 2.2, [0x6b665e, 0x8f8a80, 0x5a3a22], -8);
      this.remove(e);
      this.map.delete(id);
    }
  }
}
