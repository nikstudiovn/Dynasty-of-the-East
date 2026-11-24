// Pixel Dynasty 3D — procedural stylized East Asian architecture for all 11 building types (4-age evolution).
import * as THREE from "three";
import { box, cyl, cone, sphere, geo, mat, mesh, shade, terrainHeight, Env3D } from "./common";
import type { FX3D } from "./fx3d";

const VERMILION = "#b3261e", PLASTER = "#eadfc8", STONE = "#8f8a80", STONE_D = "#6b665e", TIMBER = "#5a3a22", GOLD = "#e8b53a";
const LATTICE = "#ffb347", BAMBOO = "#c9a36a", THATCH = "#b8955a", TERRACOTTA = "#b4532f";

export interface BuildingParts { flags: THREE.Mesh[]; fires: THREE.Mesh[]; spin: THREE.Object3D[]; top: number; }

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
  const m = mat(color, { rough: gilded ? 0.3 : 0.6, metal: gilded ? 0.8 : 0.05, side: THREE.DoubleSide });
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
}

function foundation(parent: THREE.Object3D, w: number, d: number, steps = 2): number {
  let y = 0;
  for (let k = 0; k < steps; k++) {
    const s = 1 - k * 0.07, h = 0.08;
    parent.add(mesh(box(w * s, h + (k === 0 ? 0.5 : 0), d * s), mat(k === 0 ? STONE_D : STONE, { rough: 0.9 }), 0, y + h / 2 - (k === 0 ? 0.25 : 0), 0));
    y += h;
  }
  return y;
}

function pillars(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color = VERMILION, front = true): void {
  const m = mat(color, { rough: 0.45 });
  const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
  for (const x of xs) for (const z of zs) parent.add(mesh(cyl(0.035, 0.04, h, 8), m, x, y + h / 2, z));
  if (front && w > 0.9) for (const z of zs) parent.add(mesh(cyl(0.035, 0.04, h, 8), m, 0, y + h / 2, z));
}

function walls(parent: THREE.Object3D, w: number, d: number, h: number, y: number, color: string, windows = true): void {
  parent.add(mesh(box(w, h, d), mat(color, { rough: 0.85 }), 0, y + h / 2, 0));
  // timber beam band
  parent.add(mesh(box(w + 0.02, 0.05, d + 0.02), mat(TIMBER), 0, y + h - 0.03, 0));
  if (!windows) return;
  const lm = mat("#ffd08a", { emissive: LATTICE, emissiveIntensity: 0.9, rough: 0.5 });
  const fm = mat(TIMBER);
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
  const l = mesh(sphere(0.05, 10, 8), mat("#e8321e", { emissive: "#ff3a1a", emissiveIntensity: 0.9, rough: 0.4 }), x, y, z, false);
  l.scale.set(1, 1.3, 1);
  parent.add(l);
  parent.add(mesh(cyl(0.025, 0.025, 0.02, 6), mat(GOLD, { metal: 0.7, rough: 0.3 }), x, y + 0.07, z, false));
  parent.add(mesh(cyl(0.004, 0.004, 0.08, 4), mat("#3a2412"), x, y + 0.11, z, false));
}

function banner(parent: THREE.Object3D, parts: BuildingParts, x: number, y: number, z: number, color: string, h = 0.7): void {
  parent.add(mesh(cyl(0.012, 0.015, h, 6), mat("#3a2412"), x, y + h / 2, z));
  parent.add(mesh(sphere(0.025, 8, 6), mat(GOLD, { metal: 0.8, rough: 0.3 }), x, y + h + 0.02, z));
  const g = new THREE.PlaneGeometry(0.34, 0.2, 8, 2);
  g.translate(0.17, 0, 0);
  const f = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide, rough: 0.7 }));
  f.position.set(x + 0.012, y + h - 0.12, z);
  f.castShadow = true;
  f.userData.base = Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
  f.userData.ph = Math.random() * 6;
  parent.add(f);
  parts.flags.push(f);
  // golden trim stripe
  parent.add(mesh(box(0.34, 0.02, 0.005), mat(GOLD, { metal: 0.6 }), x + 0.18, y + h - 0.025, z, false));
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
  if (age === 3) return { wall: PLASTER, roof: shade(team, -0.25), ridge: GOLD, gilded: false, tiers: 2, lanterns: true };
  return { wall: "#f2e6cc", roof: GOLD, ridge: shade(team, -0.1), gilded: true, tiers: 2, lanterns: true };
}

function hall(g: THREE.Group, parts: BuildingParts, w: number, d: number, wallH: number, st: Style): number {
  const y0 = foundation(g, w + 0.16, d + 0.16);
  pillars(g, w, d, wallH, y0, st.wall === BAMBOO ? "#8a6a3a" : VERMILION);
  walls(g, w - 0.05, d - 0.05, wallH, y0, st.wall);
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

export function buildBuilding(type: string, team: string, age: number, size: number, cropStage: number): { group: THREE.Group; parts: BuildingParts } {
  const g = new THREE.Group();
  const parts: BuildingParts = { flags: [], fires: [], spin: [], top: 1 };
  const S = size * 0.92;
  const teamRoof = shade(team, -0.25);
  const ageStyle = styleFor(age, team);
  const milStyle: Style = { wall: PLASTER, roof: teamRoof, ridge: GOLD, gilded: false, tiers: 1, lanterns: age >= 3 };

  switch (type) {
    case "town_center": {
      const top = hall(g, parts, S * 0.82, S * 0.62, 0.42, ageStyle);
      if (age >= 4) {
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
      banner(g, parts, -S * 0.45, 0, -S * 0.3, team, 0.95);
      if (age >= 3) banner(g, parts, S * 0.45, 0, -S * 0.3, team, 0.95);
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
      roof(g, 0.86, 0.72, 0.26, y0 + 0.34, age >= 2 ? TERRACOTTA : THATCH, "#5a2a18", false, 0.1);
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
      g.add(mesh(cyl(0.012, 0.012, 0.36, 5), mat(TIMBER), 0.4, 0.18, 0.4));
      g.add(mesh(cone(0.07, 0.05, 8), mat(THATCH), 0.4, 0.37, 0.4));
      parts.top = 0.45;
      break;
    }
    case "barracks": {
      hall(g, parts, S * 0.8, S * 0.5, 0.36, milStyle);
      // weapon rack + training dummy
      for (let k = 0; k < 4; k++) {
        g.add(mesh(cyl(0.008, 0.008, 0.5, 4), mat(TIMBER), -0.55 + k * 0.06, 0.25, S * 0.36));
        g.add(mesh(cone(0.015, 0.06, 4), mat("#cbd5e1", { metal: 0.8, rough: 0.3 }), -0.55 + k * 0.06, 0.53, S * 0.36));
      }
      g.add(mesh(box(0.24, 0.02, 0.02), mat(TIMBER), -0.46, 0.35, S * 0.36));
      g.add(mesh(cyl(0.05, 0.05, 0.28, 6), mat(THATCH), 0.55, 0.2, S * 0.38));
      g.add(mesh(box(0.26, 0.03, 0.03), mat(TIMBER), 0.55, 0.28, S * 0.38));
      banner(g, parts, S * 0.46, 0, -S * 0.2, team, 0.85);
      break;
    }
    case "archery_range": {
      hall(g, parts, S * 0.55, S * 0.42, 0.32, milStyle);
      // painted target stand
      const tz = S * 0.32, tx = S * 0.25;
      for (const s of [-1, 1]) g.add(mesh(cyl(0.012, 0.012, 0.42, 5), mat(TIMBER), tx + s * 0.12, 0.21, tz));
      const rings = ["#f2ead8", "#c0262d", "#f2ead8", "#e8b53a"];
      rings.forEach((c, i) => {
        const r = mesh(geo(`disc${i}`, () => new THREE.CylinderGeometry(0.15 - i * 0.035, 0.15 - i * 0.035, 0.02 + i * 0.004, 18)), mat(c), tx, 0.33, tz, true);
        r.rotation.x = Math.PI / 2;
        g.add(r);
      });
      for (let k = 0; k < 3; k++) { const a = mesh(cyl(0.004, 0.004, 0.16, 4), mat(TIMBER), tx - 0.04 + k * 0.04, 0.34 + (k - 1) * 0.03, tz + 0.08, false); a.rotation.x = Math.PI / 2; g.add(a); }
      banner(g, parts, -S * 0.42, 0, -S * 0.22, team, 0.8);
      break;
    }
    case "watch_tower": {
      foundation(g, 0.72, 0.72, 1);
      const body = mesh(cyl(0.24, 0.32, 1.25, 4), mat(STONE, { rough: 0.9, flat: true }), 0, 0.7, 0);
      body.rotation.y = Math.PI / 4;
      g.add(body);
      for (let k = 0; k < 4; k++) g.add(mesh(box(0.36, 0.03, 0.36), mat(STONE_D), 0, 0.35 + k * 0.28, 0));
      g.add(mesh(box(0.46, 0.06, 0.46), mat(TIMBER), 0, 1.35, 0));
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(mesh(cyl(0.02, 0.02, 0.3, 6), mat(VERMILION), x, 1.52, z));
      roof(g, 0.6, 0.6, 0.24, 1.66, teamRoof, GOLD, false, 0.12);
      // brazier
      g.add(mesh(cyl(0.08, 0.05, 0.07, 8), mat("#3a3a3a", { metal: 0.6, rough: 0.4 }), 0, 1.42, 0));
      fire(g, parts, 0, 1.45, 0, 0.9);
      g.add(mesh(box(0.08, 0.1, 0.01), mat("#ffd08a", { emissive: LATTICE, emissiveIntensity: 0.8 }), 0, 0.95, 0.26, false));
      banner(g, parts, 0.24, 1.38, 0.24, team, 0.55);
      parts.top = 1.95;
      break;
    }
    case "blacksmith": {
      hall(g, parts, S * 0.7, S * 0.5, 0.34, { ...milStyle, roof: TERRACOTTA, ridge: "#3a1a10" });
      // chimney + glowing furnace + anvil
      g.add(mesh(box(0.16, 0.9, 0.16), mat(STONE_D, { rough: 0.95 }), S * 0.28, 0.45, -S * 0.12));
      g.add(mesh(box(0.34, 0.26, 0.26), mat("#57534e", { rough: 0.9 }), -S * 0.3, 0.13, S * 0.33));
      const glowM = mat("#ff7a1a", { emissive: "#ff5a00", emissiveIntensity: 2.2 });
      g.add(mesh(box(0.16, 0.1, 0.02), glowM, -S * 0.3, 0.12, S * 0.33 + 0.135, false));
      fire(g, parts, -S * 0.3, 0.26, S * 0.33, 0.8);
      g.add(mesh(box(0.16, 0.06, 0.08), mat("#475569", { metal: 0.85, rough: 0.35 }), S * 0.15, 0.17, S * 0.38));
      g.add(mesh(cyl(0.04, 0.05, 0.12, 6), mat(TIMBER), S * 0.15, 0.07, S * 0.38));
      banner(g, parts, -S * 0.42, 0, -S * 0.22, team, 0.8);
      break;
    }
    case "stable": {
      hall(g, parts, S * 0.85, S * 0.42, 0.3, { ...milStyle, roof: age >= 3 ? teamRoof : THATCH });
      // fenced paddock + hay bales
      const fz = S * 0.42;
      for (let k = 0; k < 6; k++) g.add(mesh(box(0.03, 0.2, 0.03), mat(TIMBER), -0.7 + k * 0.28, 0.1, fz));
      for (const y of [0.08, 0.16]) g.add(mesh(box(1.42, 0.02, 0.02), mat("#8a5a2e"), 0, y, fz));
      for (let k = 0; k < 2; k++) { const h = mesh(cyl(0.08, 0.08, 0.16, 10), mat("#d9b54a"), -0.25 + k * 0.2, 0.08, fz - 0.15); h.rotation.z = Math.PI / 2; g.add(h); }
      banner(g, parts, S * 0.46, 0, -S * 0.2, team, 0.8);
      break;
    }
    case "siege_workshop": {
      const y0 = foundation(g, S * 0.9, S * 0.7, 1);
      pillars(g, S * 0.8, S * 0.55, 0.46, y0, TIMBER);
      roof(g, S * 0.95, S * 0.72, 0.3, y0 + 0.44, teamRoof, GOLD, false, 0.12);
      // half-built engine: frame + wheel + logs
      const wheel = mesh(geo("wheel", () => new THREE.TorusGeometry(0.16, 0.025, 6, 14)), mat(TIMBER), 0.2, 0.2, S * 0.38);
      g.add(wheel);
      parts.spin.push(wheel);
      g.add(mesh(box(0.5, 0.05, 0.05), mat("#8a5a2e"), -0.1, 0.12, S * 0.38));
      const arm = mesh(box(0.04, 0.55, 0.04), mat("#8a5a2e"), -0.15, 0.32, S * 0.3); arm.rotation.z = 0.6; g.add(arm);
      for (let k = 0; k < 3; k++) { const l = mesh(cyl(0.04, 0.04, 0.5, 6), mat("#9a6a3a"), -0.4, 0.05 + k * 0.07, -S * 0.15 + (k % 2) * 0.06); l.rotation.z = Math.PI / 2; g.add(l); }
      banner(g, parts, -S * 0.45, 0, -S * 0.3, team, 0.85);
      parts.top = y0 + 0.9;
      break;
    }
    case "imperial_citadel": {
      const W = S * 1.02;
      const wallM = mat(STONE, { rough: 0.9 }), capM = mat(STONE_D);
      g.add(mesh(box(W, 0.06, W), mat("#a59f92"), 0, 0.03, 0));
      for (const s of [-1, 1]) {
        g.add(mesh(box(W, 0.32, 0.12), wallM, 0, 0.16, s * W / 2));
        g.add(mesh(box(0.12, 0.32, W), wallM, s * W / 2, 0.16, 0));
        for (let k = 0; k < 9; k++) {
          const a = -W / 2 + 0.06 + k * ((W - 0.12) / 8);
          g.add(mesh(box(0.07, 0.07, 0.13), capM, a, 0.355, s * W / 2));
          g.add(mesh(box(0.13, 0.07, 0.07), capM, s * W / 2, 0.355, a));
        }
        for (const t of [-1, 1]) { g.add(mesh(box(0.2, 0.46, 0.2), wallM, s * W / 2, 0.23, t * W / 2)); roof(g, 0.3, 0.3, 0.12, 0.46, teamRoof, GOLD, false, 0.08); }
      }
      // corner tower roofs are positioned individually
      g.children.filter(c => (c as THREE.Mesh).geometry && ((c as THREE.Mesh).geometry as any).type === "PlaneGeometry").forEach(() => undefined);
      g.add(mesh(box(0.3, 0.24, 0.05), mat("#5a1a12"), 0, 0.12, W / 2 + 0.04));
      roof(g, 0.44, 0.18, 0.1, 0.32, GOLD, teamRoof, true, 0.06);
      // double-tier golden palace
      const palace = new THREE.Group();
      hall(palace, parts, W * 0.55, W * 0.42, 0.36, { wall: "#f2e6cc", roof: GOLD, ridge: shade(team, -0.1), gilded: true, tiers: 2, lanterns: true });
      palace.position.set(0, 0.04, -0.05);
      g.add(palace);
      parts.top += 0.04;
      banner(g, parts, -W / 2, 0.46, W / 2, team, 0.75);
      banner(g, parts, W / 2, 0.46, W / 2, team, 0.75);
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
  return { group: g, parts };
}

// ---------------------------------------------------------------------------
interface Entry { group: THREE.Group; parts: BuildingParts; key: string; ring: THREE.LineLoop; smokeT: number; fireT: number; b: any; }

export class Buildings3D {
  readonly group = new THREE.Group();
  private readonly map = new Map<number, Entry>();
  private readonly ringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]);
  private readonly ringMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.95, fog: false });

  constructor(private readonly fx: FX3D) {}

  /** Building ids -> current entry (used by the overlay for HP bars). */
  entries(): IterableIterator<Entry> { return this.map.values(); }

  clear(): void {
    for (const e of this.map.values()) this.group.remove(e.group);
    this.map.clear();
  }

  update(state: any, env: Env3D, t: number, dt: number): void {
    const seen = new Set<number>();
    for (const b of state.buildings) {
      seen.add(b.id);
      const color = env.teamColor(b);
      const age = env.ageOf(b);
      const stage = b.type === "farm" ? (b.cropStage === undefined ? 1 : b.cropStage) : 0;
      const ageKey = b.type === "town_center" || b.type === "house" || b.type === "depot" || b.type === "stable" || b.type === "barracks" || b.type === "archery_range" ? Math.min(4, age) : 0;
      const key = `${b.type}|${color}|${ageKey}|${stage}`;
      let e = this.map.get(b.id);
      if (!e || e.key !== key) {
        if (e) this.group.remove(e.group);
        const built = buildBuilding(b.type, color, Math.min(4, age), b.size || 1, stage);
        const ring = new THREE.LineLoop(this.ringGeo, this.ringMat);
        ring.renderOrder = 6;
        built.group.add(ring);
        e = { group: built.group, parts: built.parts, key, ring, smokeT: 0, fireT: 0, b };
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
      const fogv = state.fog[Math.min(25, b.ty)]?.[Math.min(25, b.tx)] ?? 0;
      e.group.visible = b.team === "player" || fogv !== 0;
      const building = b.progress !== undefined && b.progress < 1;
      e.group.scale.set(1, building ? 0.25 + 0.75 * Math.max(0, b.progress) : 1, 1);
      const sel = state.selectedBuildingId === b.id;
      e.ring.visible = sel;
      if (sel) { e.ring.scale.set(size * 1.04, 1, size * 1.04); e.ring.position.y = 0.04 / Math.max(0.25, e.group.scale.y); (e.ring.material as THREE.LineBasicMaterial).opacity = 0.7 + Math.sin(t * 6) * 0.3; }
      if (!e.group.visible) continue;

      // waving banners
      for (const f of e.parts.flags) {
        const p = f.geometry.getAttribute("position") as THREE.BufferAttribute;
        const base = f.userData.base as Float32Array, arr = p.array as Float32Array;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3];
          arr[i * 3 + 2] = Math.sin(t * 5 + x * 14 + f.userData.ph) * 0.035 * (x / 0.34);
          arr[i * 3 + 1] = base[i * 3 + 1] - x * 0.06;
        }
        p.needsUpdate = true;
      }
      // flickering fires / furnace
      for (let i = 0; i < e.parts.fires.length; i++) {
        const f = e.parts.fires[i];
        const k = 0.8 + Math.sin(t * 17 + i * 2.1 + b.id) * 0.15 + Math.sin(t * 29 + i) * 0.08;
        f.scale.set(1, k, 1);
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
          this.fx.debris.emit(cx + ox, top - 0.1, cz + oz, (Math.random() - 0.5) * 0.15 + 0.12, 0.55 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15, 2.2, 1.6 + Math.random(), Math.random() < 0.5 ? 0x2a2420 : 0x3d3631, 0.08, 2.2);
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
    for (const [id, e] of this.map) {
      if (seen.has(id)) continue;
      // collapse burst when a building is destroyed
      if (e.group.visible) this.fx.debris.burst(e.group.position.x, e.group.position.y + 0.3, e.group.position.z, 24, 1.8, 3, 1.2, 2.2, [0x6b665e, 0x8f8a80, 0x5a3a22], -8);
      this.group.remove(e.group);
      this.map.delete(id);
    }
  }
}
