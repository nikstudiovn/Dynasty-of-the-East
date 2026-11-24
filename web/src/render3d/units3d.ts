// Pixel Dynasty 3D — procedural animated units, villager work actions, selection rings and 3D projectiles.
import * as THREE from "three";
import { box, cyl, cone, sphere, geo, mat, mesh, shade, standHeight, Env3D, MAP_N } from "./common";
import type { FX3D } from "./fx3d";

const SKIN = "#e8c39e", PANTS = "#3a2a1e", WOOD = "#7a4f2a", STEEL = "#cbd5e1", IRON = "#6b7280", GOLD = "#e8b53a", BAMBOO = "#d4b06a";
const TAU = Math.PI * 2;

interface Rig {
  root: THREE.Group; body: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  legL: THREE.Group | null; legR: THREE.Group | null;
  tools: Record<string, THREE.Object3D>; carry: Record<string, THREE.Object3D>;
  legs4: THREE.Group[]; trunk: THREE.Group[]; arm: THREE.Group | null; wheels: THREE.Object3D[]; flags: THREE.Mesh[];
  ring: THREE.Mesh; height: number; type: string; key: string;
  yaw: number; walk: number; lastPhase: number; atk: number; melee: number; px: number; pz: number; init: boolean; u: any;
}

function limb(len: number, w: number, m: THREE.Material, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(box(w, len, w * 1.1), m, 0, -len / 2, 0));
  return g;
}

function newRig(type: string, key: string): Rig {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(geo("selring", () => { const g = new THREE.RingGeometry(0.26, 0.33, 32); g.rotateX(-Math.PI / 2); return g; }), ringM);
  ring.position.y = 0.03; ring.visible = false; ring.renderOrder = 4;
  root.add(ring);
  return { root, body, armL: new THREE.Group(), armR: new THREE.Group(), legL: null, legR: null, tools: {}, carry: {}, legs4: [], trunk: [], arm: null, wheels: [], flags: [], ring, height: 0.6, type, key, yaw: 0, walk: 0, lastPhase: 0, atk: 0, melee: 0, px: 0, pz: 0, init: false, u: null };
}

/** Humanoid torso/head/limbs into `parent` (feet at y=0). */
function humanoid(r: Rig, parent: THREE.Group, tunic: string, opts: { armor?: boolean; legs?: boolean } = {}): void {
  const tm = mat(tunic), pm = mat(PANTS), sm = mat(SKIN);
  if (opts.legs !== false) {
    r.legL = limb(0.17, 0.055, pm, -0.045, 0.17, 0); r.legR = limb(0.17, 0.055, pm, 0.045, 0.17, 0);
    parent.add(r.legL, r.legR);
  }
  parent.add(mesh(box(0.17, 0.2, 0.11), opts.armor ? mat(IRON, { metal: 0.55, rough: 0.45 }) : tm, 0, 0.27, 0));
  if (opts.armor) {
    // lamellar plates: team-coloured bands over iron
    for (let k = 0; k < 3; k++) parent.add(mesh(box(0.18, 0.025, 0.12), tm, 0, 0.2 + k * 0.06, 0, false));
  } else parent.add(mesh(box(0.18, 0.08, 0.12), mat(shade(tunic, -0.25)), 0, 0.2, 0, false));
  parent.add(mesh(box(0.175, 0.025, 0.115), mat("#2a1a10"), 0, 0.235, 0, false));
  parent.add(mesh(sphere(0.065, 12, 10), sm, 0, 0.44, 0));
  r.armL = limb(0.17, 0.045, tm, -0.11, 0.36, 0); r.armR = limb(0.17, 0.045, tm, 0.11, 0.36, 0);
  for (const a of [r.armL, r.armR]) a.add(mesh(sphere(0.028, 8, 6), sm, 0, -0.18, 0));
  parent.add(r.armL, r.armR);
}

function hand(arm: THREE.Group, obj: THREE.Object3D): THREE.Object3D { obj.position.y = -0.18; arm.add(obj); return obj; }

function tool(kind: string): THREE.Group {
  const g = new THREE.Group(), wm = mat(WOOD), sm = mat(STEEL, { metal: 0.85, rough: 0.3 });
  const handle = mesh(cyl(0.012, 0.012, kind === "hammer" ? 0.2 : 0.26, 5), wm, 0, 0, 0.08);
  handle.rotation.x = Math.PI / 2; g.add(handle);
  if (kind === "axe") g.add(mesh(box(0.012, 0.08, 0.06), sm, 0, 0.03, 0.19));
  else if (kind === "pick") { const p = mesh(box(0.016, 0.02, 0.2), sm, 0, 0.01, 0.2); p.rotation.x = Math.PI / 2; g.add(p); }
  else if (kind === "sickle") { const s = mesh(geo("sickle", () => new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI * 1.2)), sm, 0, 0.05, 0.2); s.rotation.y = Math.PI / 2; g.add(s); }
  else if (kind === "hammer") g.add(mesh(box(0.05, 0.05, 0.08), mat("#57534e", { metal: 0.6 }), 0, 0, 0.17));
  return g;
}

function carryBundle(kind: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === "wood") for (let k = 0; k < 3; k++) { const l = mesh(cyl(0.022, 0.022, 0.3, 6), mat("#9bb54a"), 0, k * 0.035, (k - 1) * 0.03); l.rotation.x = Math.PI / 2; l.rotation.z = 0.3; g.add(l); }
  else if (kind === "food") { const s = mesh(cone(0.07, 0.24, 7), mat("#e2b23a", { flat: true }), 0, 0.06, 0); s.rotation.z = Math.PI / 2.4; g.add(s); g.add(mesh(cyl(0.03, 0.03, 0.03, 6), mat("#8a5a2e"), 0.02, 0.05, 0)); }
  else if (kind === "gold") g.add(mesh(geo("ore", () => new THREE.DodecahedronGeometry(0.07, 0)), mat("#f5b830", { metal: 0.75, rough: 0.25, flat: true }), 0, 0.05, 0));
  else g.add(mesh(box(0.11, 0.09, 0.1), mat("#9aa1a9", { rough: 0.9 }), 0, 0.05, 0));
  g.position.set(0.08, 0.42, -0.03);
  g.visible = false;
  return g;
}

function flag(r: Rig, parent: THREE.Object3D, x: number, y: number, z: number, color: string, h = 0.35): void {
  parent.add(mesh(cyl(0.008, 0.008, h, 5), mat("#3a2412"), x, y + h / 2, z));
  const g = new THREE.PlaneGeometry(0.16, 0.1, 5, 1); g.translate(0.08, 0, 0);
  const f = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide }));
  f.position.set(x, y + h - 0.06, z); f.rotation.y = Math.PI / 2; f.castShadow = true;
  f.userData.base = Float32Array.from(g.getAttribute("position").array as ArrayLike<number>);
  parent.add(f); r.flags.push(f);
}

function horse(r: Rig, parent: THREE.Group): THREE.Group {
  const hm = mat("#6b4226"), dm = mat("#3b2414"), tack = mat("#7f1d1d");
  const h = new THREE.Group();
  h.add(mesh(box(0.17, 0.17, 0.44), hm, 0, 0.3, 0));
  const neck = mesh(box(0.1, 0.22, 0.1), hm, 0, 0.43, 0.2); neck.rotation.x = 0.5; h.add(neck);
  h.add(mesh(box(0.09, 0.09, 0.18), hm, 0, 0.52, 0.31));
  h.add(mesh(box(0.03, 0.14, 0.05), dm, 0, 0.5, 0.17)); // mane
  const tail = mesh(box(0.03, 0.18, 0.03), dm, 0, 0.28, -0.25); tail.rotation.x = -0.4; h.add(tail);
  h.add(mesh(box(0.19, 0.04, 0.16), tack, 0, 0.395, -0.02));
  for (const [x, z] of [[-0.06, 0.16], [0.06, 0.16], [-0.06, -0.16], [0.06, -0.16]]) { const l = limb(0.22, 0.045, hm, x, 0.23, z); h.add(l); r.legs4.push(l); }
  parent.add(h);
  return h;
}

function buildUnit(type: string, team: string): Rig {
  const r = newRig(type, `${type}|${team}`);
  const b = r.body;
  switch (type) {
    case "villager": {
      humanoid(r, b, shade(team, -0.05));
      b.add(mesh(cone(0.15, 0.08, 14), mat(BAMBOO, { rough: 0.8 }), 0, 0.51, 0));
      b.add(mesh(cyl(0.05, 0.05, 0.015, 10), mat("#8a6a3a"), 0, 0.475, 0, false));
      for (const k of ["axe", "pick", "sickle", "hammer"]) { r.tools[k] = hand(r.armR, tool(k)); r.tools[k].visible = false; }
      for (const k of ["wood", "food", "gold", "stone"]) { r.carry[k] = carryBundle(k); b.add(r.carry[k]); }
      r.height = 0.6;
      break;
    }
    case "swordsman": {
      humanoid(r, b, team, { armor: true });
      b.add(mesh(geo("helm", () => new THREE.SphereGeometry(0.075, 12, 8, 0, TAU, 0, Math.PI / 2)), mat(IRON, { metal: 0.7, rough: 0.35 }), 0, 0.45, 0));
      b.add(mesh(cone(0.025, 0.12, 6), mat("#c0262d"), 0, 0.58, -0.01));
      const blade = new THREE.Group();
      blade.add(mesh(box(0.016, 0.26, 0.035), mat(STEEL, { metal: 0.9, rough: 0.2 }), 0, -0.14, 0.0));
      blade.add(mesh(box(0.06, 0.015, 0.03), mat(GOLD, { metal: 0.7 }), 0, -0.01, 0));
      blade.rotation.x = Math.PI / 2 + 0.3;
      r.tools.weapon = hand(r.armR, blade);
      const shield = mesh(geo("shield", () => new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14)), mat(shade(team, -0.2), { metal: 0.3 }), -0.04, -0.12, 0.04);
      shield.rotation.z = Math.PI / 2;
      r.armL.add(shield);
      r.armL.add(mesh(sphere(0.022, 6, 5), mat(GOLD, { metal: 0.8 }), -0.055, -0.12, 0.04, false));
      r.height = 0.65;
      break;
    }
    case "spearman": {
      humanoid(r, b, team, { armor: true });
      b.add(mesh(cone(0.09, 0.08, 10), mat(IRON, { metal: 0.6 }), 0, 0.51, 0));
      const spear = new THREE.Group();
      spear.add(mesh(cyl(0.01, 0.01, 0.95, 5), mat(WOOD), 0, 0.18, 0));
      spear.add(mesh(cone(0.022, 0.09, 5), mat(STEEL, { metal: 0.9, rough: 0.2 }), 0, 0.7, 0));
      spear.add(mesh(sphere(0.03, 6, 5), mat("#dc2626"), 0, 0.62, 0));
      r.tools.weapon = hand(r.armR, spear);
      r.height = 0.75;
      break;
    }
    case "archer":
    case "chuko_nu": {
      humanoid(r, b, "#3f6b34");
      b.add(mesh(cone(0.09, 0.14, 10), mat(shade(team, -0.15)), 0, 0.5, -0.01)); // hood
      const cloak = mesh(box(0.2, 0.26, 0.02), mat(shade(team, -0.15)), 0, 0.25, -0.07); cloak.rotation.x = 0.12; b.add(cloak);
      b.add(mesh(cyl(0.025, 0.025, 0.18, 6), mat("#5a3a22"), 0.05, 0.32, -0.08)); // quiver
      if (type === "archer") {
        const bow = mesh(geo("bow", () => new THREE.TorusGeometry(0.17, 0.009, 4, 14, Math.PI)), mat("#7a4f2a"), 0, 0, 0.03);
        bow.rotation.y = Math.PI / 2; bow.rotation.x = Math.PI / 2;
        r.tools.weapon = hand(r.armL, bow);
      } else {
        const xb = new THREE.Group();
        xb.add(mesh(box(0.03, 0.03, 0.26), mat(WOOD), 0, 0, 0.1));
        xb.add(mesh(box(0.22, 0.015, 0.02), mat("#5a3a22"), 0, 0, 0.2));
        xb.add(mesh(box(0.05, 0.06, 0.12), mat(GOLD, { metal: 0.6 }), 0, 0.04, 0.12));
        r.tools.weapon = hand(r.armR, xb);
      }
      r.height = 0.62;
      break;
    }
    case "cavalry":
    case "horse_archer": {
      horse(r, b);
      const rider = new THREE.Group(); rider.position.set(0, 0.24, -0.02); rider.scale.setScalar(0.85);
      humanoid(r, rider, type === "cavalry" ? team : "#3f6b34", { armor: type === "cavalry", legs: false });
      rider.add(mesh(box(0.2, 0.05, 0.09), mat(PANTS), 0, 0.17, 0.02)); // seated legs
      rider.add(mesh(geo("helm", () => new THREE.SphereGeometry(0.075, 12, 8, 0, TAU, 0, Math.PI / 2)), mat(IRON, { metal: 0.7 }), 0, 0.45, 0));
      if (type === "cavalry") {
        const lance = new THREE.Group();
        lance.add(mesh(cyl(0.01, 0.01, 0.9, 5), mat(WOOD), 0, 0.2, 0));
        lance.add(mesh(cone(0.02, 0.08, 5), mat(STEEL, { metal: 0.9 }), 0, 0.68, 0));
        lance.add(mesh(sphere(0.028, 6, 5), mat("#dc2626"), 0, 0.6, 0));
        lance.rotation.x = 1.0;
        r.tools.weapon = hand(r.armR, lance);
      } else {
        const bow = mesh(geo("bow", () => new THREE.TorusGeometry(0.17, 0.009, 4, 14, Math.PI)), mat("#7a4f2a"), 0, 0, 0.03);
        bow.rotation.y = Math.PI / 2; bow.rotation.x = Math.PI / 2;
        r.tools.weapon = hand(r.armL, bow);
      }
      b.add(rider);
      flag(r, rider, -0.08, 0.3, -0.07, team, 0.4);
      r.height = 0.95;
      break;
    }
    case "war_elephant": {
      const em = mat("#7d8590", { rough: 0.85 });
      const e = new THREE.Group(); e.scale.setScalar(1.25);
      const torso = mesh(sphere(0.2, 14, 10), em, 0, 0.42, 0); torso.scale.set(1, 0.95, 1.45); e.add(torso);
      e.add(mesh(sphere(0.13, 12, 10), em, 0, 0.5, 0.3));
      for (const s of [-1, 1]) {
        const ear = mesh(sphere(0.1, 8, 6), mat("#6b7280"), s * 0.12, 0.52, 0.26); ear.scale.set(0.25, 1, 0.9); e.add(ear);
        const tusk = mesh(geo("tusk", () => new THREE.TorusGeometry(0.1, 0.014, 5, 10, Math.PI / 1.6)), mat("#f5f0e1", { rough: 0.4 }), s * 0.06, 0.4, 0.4);
        tusk.rotation.set(0, Math.PI / 2, Math.PI * 0.9); e.add(tusk);
      }
      // swinging trunk: chain of pivots
      let parent: THREE.Object3D = e; let y = 0.44, z = 0.4;
      for (let k = 0; k < 4; k++) {
        const seg = new THREE.Group(); seg.position.set(0, y, z);
        seg.add(mesh(cyl(0.04 - k * 0.006, 0.045 - k * 0.006, 0.1, 7), em, 0, -0.05, 0));
        parent.add(seg); r.trunk.push(seg);
        parent = seg; y = -0.1; z = 0;
      }
      for (const [x, zz] of [[-0.11, 0.17], [0.11, 0.17], [-0.11, -0.17], [0.11, -0.17]]) {
        const l = new THREE.Group(); l.position.set(x, 0.3, zz);
        l.add(mesh(cyl(0.06, 0.065, 0.3, 8), em, 0, -0.15, 0));
        e.add(l); r.legs4.push(l);
      }
      // ornate crimson-gold battle howdah
      e.add(mesh(box(0.34, 0.03, 0.42), mat("#991b1b"), 0, 0.6, -0.02));
      e.add(mesh(box(0.36, 0.015, 0.44), mat(GOLD, { metal: 0.75, rough: 0.3 }), 0, 0.585, -0.02, false));
      e.add(mesh(box(0.24, 0.14, 0.24), mat("#b91c1c"), 0, 0.69, -0.05));
      for (const [x, zz] of [[-0.11, 0.06], [0.11, 0.06], [-0.11, -0.16], [0.11, -0.16]]) e.add(mesh(cyl(0.01, 0.01, 0.16, 5), mat(GOLD, { metal: 0.7 }), x, 0.84, zz));
      e.add(mesh(cone(0.2, 0.1, 4), mat(shade(team, -0.2)), 0, 0.96, -0.05));
      const rider = new THREE.Group(); rider.position.set(0, 0.62, -0.05); rider.scale.setScalar(0.65);
      humanoid(r, rider, team, { armor: true, legs: false });
      e.add(rider);
      flag(r, e, -0.13, 0.74, -0.17, team, 0.35);
      flag(r, e, 0.13, 0.74, -0.17, team, 0.35);
      b.add(e);
      r.height = 1.3;
      break;
    }
    case "catapult": {
      const wm = mat("#8a5a2e"), dm = mat("#5a3a22");
      for (const s of [-1, 1]) b.add(mesh(box(0.05, 0.05, 0.5), wm, s * 0.14, 0.12, 0));
      for (const zz of [-0.2, 0.2]) b.add(mesh(box(0.33, 0.04, 0.05), wm, 0, 0.13, zz));
      for (const s of [-1, 1]) { const up = mesh(box(0.04, 0.3, 0.04), dm, s * 0.12, 0.28, -0.02); b.add(up); }
      const axle = mesh(cyl(0.02, 0.02, 0.3, 6), mat(IRON, { metal: 0.6 }), 0, 0.4, -0.02); axle.rotation.z = Math.PI / 2; b.add(axle);
      for (const s of [-1, 1]) for (const zz of [-0.17, 0.17]) {
        const w = mesh(cyl(0.08, 0.08, 0.035, 12), dm, s * 0.18, 0.08, zz); w.rotation.z = Math.PI / 2; b.add(w); r.wheels.push(w);
      }
      const arm = new THREE.Group(); arm.position.set(0, 0.4, -0.02);
      arm.add(mesh(box(0.04, 0.04, 0.5), wm, 0, 0, 0.12));
      arm.add(mesh(cyl(0.06, 0.04, 0.05, 8), dm, 0, 0.03, 0.36));
      arm.add(mesh(sphere(0.04, 7, 5), mat("#9aa1a9", { flat: true }), 0, 0.07, 0.36));
      arm.add(mesh(box(0.1, 0.1, 0.1), mat("#57534e"), 0, -0.05, -0.14));
      arm.rotation.x = -0.9;
      b.add(arm); r.arm = arm;
      flag(r, b, -0.15, 0.14, -0.24, team, 0.4);
      r.height = 0.7;
      break;
    }
    default: {
      humanoid(r, b, team);
      r.height = 0.6;
    }
  }
  if (type === "war_elephant") { r.ring.scale.setScalar(2.1); }
  else if (type === "cavalry" || type === "horse_archer" || type === "catapult") r.ring.scale.setScalar(1.45);
  return r;
}

// ---------------------------------------------------------------------------
interface AnimalRig { root: THREE.Group; legs: THREE.Group[]; body: THREE.Group; yaw: number; px: number; pz: number; walk: number; init: boolean; type: string; dead: number; }

/** Stylized low-poly deer (antlered stag with spotted flanks) and wild boar (bristled, tusked). */
function buildAnimal(type: string): AnimalRig {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs: THREE.Group[] = [];
  if (type === "deer") {
    const fur = mat("#b8793a"), dark = mat("#7b4a22"), belly = mat("#efe0c4"), white = mat("#fbf5e8");
    body.add(mesh(box(0.15, 0.16, 0.38), fur, 0, 0.32, 0));
    body.add(mesh(box(0.14, 0.05, 0.3), belly, 0, 0.245, 0.01));
    for (const [x, z] of [[-0.04, -0.05], [0.05, 0.04], [-0.03, 0.1], [0.04, -0.12]]) body.add(mesh(sphere(0.014, 5, 4), white, x + (x < 0 ? -0.07 : 0.07), 0.36, z, false));
    const neck = mesh(box(0.08, 0.2, 0.08), fur, 0, 0.46, 0.18); neck.rotation.x = 0.45; body.add(neck);
    body.add(mesh(box(0.08, 0.08, 0.15), fur, 0, 0.56, 0.27));
    body.add(mesh(box(0.05, 0.04, 0.05), dark, 0, 0.55, 0.36, false));
    for (const sx of [-1, 1]) {
      body.add(mesh(box(0.025, 0.05, 0.015), fur, sx * 0.04, 0.62, 0.22, false));
      const a1 = mesh(cyl(0.006, 0.008, 0.12, 4), dark, sx * 0.045, 0.66, 0.23, false); a1.rotation.z = -sx * 0.4; body.add(a1);
      const a2 = mesh(cyl(0.005, 0.006, 0.07, 4), dark, sx * 0.075, 0.7, 0.23, false); a2.rotation.z = sx * 0.5; body.add(a2);
    }
    const tail = mesh(box(0.04, 0.05, 0.03), white, 0, 0.36, -0.2, false); body.add(tail);
    for (const [x, z] of [[-0.05, 0.13], [0.05, 0.13], [-0.05, -0.13], [0.05, -0.13]]) {
      const l = new THREE.Group(); l.position.set(x, 0.26, z);
      l.add(mesh(box(0.035, 0.26, 0.035), dark, 0, -0.13, 0)); body.add(l); legs.push(l);
    }
  } else {
    const fur = mat("#4a3a2e", { rough: 0.95 }), dark = mat("#2a2018", { rough: 0.95 }), tusk = mat("#f0e8d0");
    body.add(mesh(box(0.22, 0.2, 0.4), fur, 0, 0.22, 0));
    body.add(mesh(box(0.2, 0.22, 0.18), fur, 0, 0.23, 0.17));
    for (let k = 0; k < 5; k++) body.add(mesh(box(0.025, 0.05, 0.05), dark, 0, 0.35 - Math.abs(k - 2) * 0.012, -0.14 + k * 0.08, false));
    body.add(mesh(box(0.14, 0.13, 0.12), fur, 0, 0.2, 0.3));
    body.add(mesh(box(0.09, 0.07, 0.07), mat("#c58a7a"), 0, 0.17, 0.375, false));
    for (const sx of [-1, 1]) {
      const t = mesh(cone(0.012, 0.07, 5), tusk, sx * 0.05, 0.15, 0.37, false); t.rotation.z = sx * 0.4; t.rotation.x = -0.5; body.add(t);
      body.add(mesh(box(0.03, 0.05, 0.02), dark, sx * 0.06, 0.3, 0.27, false));
      body.add(mesh(sphere(0.012, 5, 4), mat("#ffdd88", { emissive: "#442200" }), sx * 0.055, 0.25, 0.355, false));
    }
    for (const [x, z] of [[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.13], [0.07, -0.13]]) {
      const l = new THREE.Group(); l.position.set(x, 0.14, z);
      l.add(mesh(box(0.045, 0.14, 0.045), dark, 0, -0.07, 0)); body.add(l); legs.push(l);
    }
  }
  return { root, legs, body, yaw: 0, px: 0, pz: 0, walk: 0, init: false, type, dead: 0 };
}

interface Proj { mesh: THREE.Object3D; kind: string; lx: number; ly: number; lz: number; tx: number; tz: number; }

export class Units3D {
  readonly group = new THREE.Group();
  private readonly rigs = new Map<number, Rig>();
  private readonly projs = new Map<object, Proj>();
  private readonly pool: Record<string, THREE.Object3D[]> = { arrow: [], bolt: [], boulder: [] };
  private readonly tmp = new THREE.Vector3();
  private readonly animals = new Map<number, AnimalRig>();

  constructor(private readonly fx: FX3D) {}

  rigFor(id: number): Rig | undefined { return this.rigs.get(id); }
  allRigs(): IterableIterator<Rig> { return this.rigs.values(); }

  clear(): void {
    for (const r of this.rigs.values()) this.group.remove(r.root);
    this.rigs.clear();
    for (const a of this.animals.values()) this.group.remove(a.root);
    this.animals.clear();
    for (const p of this.projs.values()) p.mesh.visible = false;
    this.projs.clear();
  }

  private projMesh(kind: string): THREE.Object3D {
    const list = this.pool[kind] || this.pool.arrow;
    const free = list.find(o => !o.visible);
    if (free) { free.visible = true; return free; }
    let o: THREE.Object3D;
    if (kind === "boulder") {
      o = mesh(geo("boulder", () => new THREE.DodecahedronGeometry(0.1, 0)), mat("#9aa1a9", { rough: 0.85, flat: true }));
    } else {
      const g = new THREE.Group();
      g.add(mesh(cyl(0.008, 0.008, 0.32, 4), mat(kind === "bolt" ? GOLD : "#e7d8b0", { metal: kind === "bolt" ? 0.6 : 0 }), 0, 0, 0, false));
      g.add(mesh(cone(0.02, 0.06, 4), mat(STEEL, { metal: 0.9 }), 0, 0.18, 0, false));
      g.add(mesh(box(0.04, 0.05, 0.004), mat("#f8fafc"), 0, -0.14, 0, false));
      g.children.forEach(c => { c.rotation.x = Math.PI / 2; c.position.z = c.position.y; c.position.y = 0; });
      o = g;
    }
    list.push(o);
    this.group.add(o);
    return o;
  }

  update(state: any, env: Env3D, t: number, dt: number): void {
    const seen = new Set<number>();
    const fog = state.fog;
    const fogAt = (x: number, z: number) => fog[Math.max(0, Math.min(MAP_N - 1, Math.floor(z)))]?.[Math.max(0, Math.min(MAP_N - 1, Math.floor(x)))] ?? 0;
    const selected = new Set<number>(state.selectedIds || []);
    const byId = new Map<number, any>();
    for (const u of state.units) byId.set(u.id, u);
    for (const b of state.buildings) byId.set(b.id, b);

    // --- projectiles (new ones trigger the attacker's shot animation) ---
    const live = new Set<object>();
    for (const p of state.projectiles || []) {
      live.add(p);
      let pr = this.projs.get(p);
      if (!pr) {
        pr = { mesh: this.projMesh(p.kind), kind: p.kind, lx: p.sx, ly: 0.4, lz: p.sy, tx: p.tx, tz: p.ty };
        this.projs.set(p, pr);
        if (p.attacker) { const r = this.rigs.get(p.attacker.id); if (r) r.atk = 1; }
      }
      const k = Math.max(0, Math.min(1, p.t));
      const x = p.sx + (p.tx - p.sx) * k, z = p.sy + (p.ty - p.sy) * k;
      const base = standHeight(x, z, state.grid);
      const y = base + 0.4 + Math.sin(k * Math.PI) * (p.kind === "boulder" ? 1.8 : 0.55);
      pr.mesh.position.set(x, y, z);
      if (p.kind === "boulder") pr.mesh.rotation.set(t * 6, t * 4, 0);
      else { this.tmp.set(x + (x - pr.lx), y + (y - pr.ly), z + (z - pr.lz)); if (this.tmp.distanceToSquared(pr.mesh.position) > 1e-8) pr.mesh.lookAt(this.tmp); }
      pr.lx = x; pr.ly = y; pr.lz = z; pr.tx = p.tx; pr.tz = p.ty;
      pr.mesh.visible = fogAt(x, z) === 2;
    }
    for (const [p, pr] of this.projs) {
      if (live.has(p)) continue;
      if (pr.kind === "boulder" && fogAt(pr.tx, pr.tz) > 0) this.fx.impact(pr.tx, standHeight(pr.tx, pr.tz, state.grid), pr.tz, 1.7);
      else if (fogAt(pr.tx, pr.tz) === 2) this.fx.glow.burst(pr.tx, standHeight(pr.tx, pr.tz, state.grid) + 0.3, pr.tz, 4, 0.8, 1, 0.25, 0.6, [0xfff1a8, 0xffffff], -4);
      pr.mesh.visible = false;
      this.projs.delete(p);
    }

    // --- units ---
    for (const u of state.units) {
      seen.add(u.id);
      const color = env.teamColor(u);
      const key = `${u.type}|${color}`;
      let r = this.rigs.get(u.id);
      if (!r || r.key !== key) {
        if (r) this.group.remove(r.root);
        r = buildUnit(u.type, color);
        this.group.add(r.root);
        this.rigs.set(u.id, r);
      }
      r.u = u;
      const vis = !u.garrisoned && (u.team === "player" || fogAt(u.x, u.y) === 2);
      r.root.visible = vis;
      const gy = standHeight(u.x, u.y, state.grid);
      if (!r.init) { r.root.position.set(u.x, gy, u.y); r.px = u.x; r.pz = u.y; r.init = true; }
      const kpos = 1 - Math.exp(-dt * 22);
      r.root.position.x += (u.x - r.root.position.x) * kpos;
      r.root.position.z += (u.y - r.root.position.z) * kpos;
      r.root.position.y += (gy - r.root.position.y) * kpos;
      const vx = (u.x - r.px) / Math.max(dt, 1e-3), vz = (u.y - r.pz) / Math.max(dt, 1e-3);
      r.px = u.x; r.pz = u.y;
      const speed = Math.hypot(vx, vz);
      const moving = speed > 0.12;
      if (!vis) continue;

      // facing: movement direction, or the attack target when standing
      let want = r.yaw;
      const target = u.targetEntityId != null ? byId.get(u.targetEntityId) : null;
      if (moving) want = Math.atan2(vx, vz);
      else if (target && u.task === "attack") {
        const tx = target.x !== undefined ? target.x : target.tx + (target.size || 1) / 2;
        const tz = target.y !== undefined && target.x !== undefined ? target.y : target.ty + (target.size || 1) / 2;
        want = Math.atan2(tx - u.x, tz - u.y);
      } else if (u.type === "villager" && u.workStyle && u.workStyle !== "idle" && u.targetTile) {
        want = Math.atan2(u.targetTile.tx + 0.5 - u.x, u.targetTile.ty + 0.5 - u.y);
      } else if (u.type === "villager" && u.task === "hunt" && u.huntFace) {
        want = Math.atan2(u.huntFace.x - u.x, u.huntFace.y - u.y);
      }
      let dYaw = want - r.yaw;
      while (dYaw > Math.PI) dYaw -= TAU;
      while (dYaw < -Math.PI) dYaw += TAU;
      r.yaw += dYaw * (1 - Math.exp(-dt * 10));
      r.root.rotation.y = r.yaw;

      // selection ring
      r.ring.visible = selected.has(u.id);
      if (r.ring.visible) (r.ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 6) * 0.3;

      this.animate(r, u, state, t, dt, moving, speed, target);
    }

    this.updateAnimals(state, t, dt, fogAt);

    for (const [id, r] of this.rigs) {
      if (seen.has(id)) continue;
      if (r.root.visible) this.fx.debris.burst(r.root.position.x, r.root.position.y + 0.2, r.root.position.z, 10, 0.9, 1.6, 0.8, 1, [0x8a7a66, 0x5b4a3a, 0xb91c1c], -7);
      this.group.remove(r.root);
      this.rigs.delete(id);
    }
  }

  private updateAnimals(state: any, t: number, dt: number, fogAt: (x: number, z: number) => number): void {
    const seenA = new Set<number>();
    for (const a of state.animals || []) {
      seenA.add(a.id);
      let r = this.animals.get(a.id);
      if (!r) { r = buildAnimal(a.type); this.group.add(r.root); this.animals.set(a.id, r); }
      const vis = fogAt(a.x, a.y) === 2;
      r.root.visible = vis;
      const gy = standHeight(a.x, a.y, state.grid);
      if (!r.init) { r.root.position.set(a.x, gy, a.y); r.px = a.x; r.pz = a.y; r.init = true; }
      const k = 1 - Math.exp(-dt * 18);
      r.root.position.x += (a.x - r.root.position.x) * k;
      r.root.position.z += (a.y - r.root.position.z) * k;
      r.root.position.y += (gy - r.root.position.y) * k;
      const vx = (a.x - r.px) / Math.max(dt, 1e-3), vz = (a.y - r.pz) / Math.max(dt, 1e-3);
      r.px = a.x; r.pz = a.y;
      if (!vis) continue;
      const speed = Math.hypot(vx, vz);
      const moving = speed > 0.1 && !a.dead;
      if (moving) {
        let d = Math.atan2(vx, vz) - r.yaw;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        r.yaw += d * (1 - Math.exp(-dt * 9));
      }
      r.root.rotation.y = r.yaw;
      r.walk += dt * (moving ? 5 + speed * 3.2 : 0);
      const amp = moving ? Math.min(0.9, 0.3 + speed * 0.2) : 0;
      r.legs.forEach((l, i) => { l.rotation.x = Math.sin(r!.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });
      const grazing = !a.dead && !moving && a.type === "deer";
      r.body.position.y = moving ? Math.abs(Math.sin(r.walk)) * (speed > 1.5 ? 0.06 : 0.015) : 0;
      r.body.rotation.x = grazing ? 0.06 * Math.sin(t * 0.8 + a.id) : 0;
      // carcass: topple onto its side and shrink as the meat is harvested
      const target = a.dead ? 1 : 0;
      r.dead += (target - r.dead) * Math.min(1, dt * 5);
      r.root.rotation.z = r.dead * 1.45;
      const meat = a.dead ? 0.55 + 0.45 * Math.max(0, a.food / (a.type === "deer" ? 140 : 240)) : 1;
      r.root.scale.setScalar(meat);
      // fresh hurt flash for charging boar: raise head
      if (a.type === "boar" && a.aggroId != null) r.body.rotation.x = -0.12;
    }
    for (const [id, r] of this.animals) {
      if (seenA.has(id)) continue;
      this.group.remove(r.root);
      this.animals.delete(id);
    }
  }

  private animate(r: Rig, u: any, state: any, t: number, dt: number, moving: boolean, speed: number, target: any): void {
    r.walk += dt * (moving ? 6 + speed * 5 : 0);
    const sw = moving ? Math.sin(r.walk) : 0;
    r.atk = Math.max(0, r.atk - dt * 1.6);
    const inMelee = u.task === "attack" && !moving && target && (target.hp ?? 1) > 0;
    r.melee = inMelee ? r.melee + dt * 7 : 0;

    if (r.legL && r.legR) { r.legL.rotation.x = sw * 0.6; r.legR.rotation.x = -sw * 0.6; }
    r.body.position.y = moving ? Math.abs(Math.sin(r.walk)) * 0.02 : 0;
    r.armL.rotation.set(-sw * 0.5, 0, 0);
    r.armR.rotation.set(sw * 0.5, 0, 0);
    for (const f of r.flags) {
      const p = f.geometry.getAttribute("position") as THREE.BufferAttribute, base = f.userData.base as Float32Array, arr = p.array as Float32Array;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3]; arr[i * 3 + 2] = Math.sin(t * 7 + x * 30 + u.id) * 0.02 * (x / 0.16); }
      p.needsUpdate = true;
    }

    switch (r.type) {
      case "villager": this.animVillager(r, u, state, moving); break;
      case "swordsman": case "spearman":
        if (inMelee) {
          const k = (Math.sin(r.melee) + 1) / 2;
          r.armR.rotation.x = r.type === "spearman" ? -1.2 + k * 0.4 : -2.3 + k * 2.1;
          if (r.type === "spearman") r.armR.position.z = k * 0.06;
          if (r.type === "swordsman") r.armL.rotation.x = -0.9;
        } else if (r.type === "spearman") r.armR.rotation.x = -0.3 + sw * 0.2;
        break;
      case "archer": case "chuko_nu":
        if (r.atk > 0 || inMelee) { r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.4 + r.atk * 0.25; }
        break;
      case "cavalry": case "horse_archer": {
        const gal = moving ? r.walk * 1.4 : 0;
        r.legs4.forEach((l, i) => { l.rotation.x = moving ? Math.sin(gal + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * 0.7 : 0; });
        r.body.position.y = moving ? Math.abs(Math.sin(gal)) * 0.05 : 0;
        r.body.rotation.x = moving ? Math.sin(gal) * 0.05 : 0;
        if (r.type === "cavalry" && inMelee) r.armR.rotation.x = -0.6 + Math.sin(r.melee) * 0.5;
        if (r.type === "horse_archer" && (r.atk > 0 || inMelee)) { r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.3; }
        break;
      }
      case "war_elephant": {
        const st = moving ? r.walk * 0.7 : 0;
        r.legs4.forEach((l, i) => { l.rotation.x = moving ? Math.sin(st + ((i === 0 || i === 3) ? 0 : Math.PI)) * 0.35 : 0; });
        r.body.position.y = moving ? Math.abs(Math.sin(st)) * 0.03 : 0;
        const swing = inMelee ? Math.sin(r.melee) * 0.6 : Math.sin(t * 1.8 + u.id) * 0.18;
        r.trunk.forEach((s, i) => { s.rotation.x = swing * (0.5 + i * 0.25) + (i === 0 ? 0.2 : 0.12); s.rotation.z = Math.sin(t * 1.3 + i) * 0.06; });
        break;
      }
      case "catapult": {
        const roll = speed * dt * 12;
        for (const w of r.wheels) w.rotation.x += moving ? roll : 0;
        if (r.arm) {
          const a = r.atk;
          const fling = a > 0.82 ? (1 - a) / 0.18 : a / 0.82;
          r.arm.rotation.x = -0.9 + Math.min(1, fling) * 1.9;
        }
        break;
      }
    }
  }

  private animVillager(r: Rig, u: any, state: any, moving: boolean): void {
    const style: string = u.workStyle || "idle";
    const working = !moving && style !== "idle" && style !== "carry";
    const toolKey = style === "chop" ? "axe" : style === "mine" ? "pick" : style === "harvest" ? "sickle" : style === "build" ? "hammer" : "";
    for (const k in r.tools) r.tools[k].visible = working && k === toolKey;
    const carrying = u.task === "return" && u.carryAmt > 0;
    for (const k in r.carry) r.carry[k].visible = carrying && (u.carryType || "wood") === k;
    if (carrying) { r.armR.rotation.x = -2.6; r.armR.rotation.z = 0.25; }
    if (!working) { r.lastPhase = 0; return; }

    const phase = u.workPhase || 0, k = phase / TAU;
    // slow wind-up, fast strike that lands as the phase wraps (same moment the 2D sim plays the hit)
    const strike = k < 0.72 ? k / 0.72 : 1 - (k - 0.72) / 0.28;
    if (style === "chop") { r.armR.rotation.x = -0.3 - strike * 2.3; r.armL.rotation.x = -0.4 - strike * 1.6; r.body.rotation.x = (1 - strike) * 0.15; }
    else if (style === "mine") { r.armR.rotation.x = -0.4 - strike * 2.7; r.armL.rotation.x = -0.4 - strike * 2.4; r.body.rotation.x = (1 - strike) * 0.22; }
    else if (style === "harvest") { r.armR.rotation.x = -1.1; r.armR.rotation.y = Math.sin(phase) * 0.9; r.body.rotation.x = 0.35; }
    else if (style === "build") { r.armR.rotation.x = -0.5 - strike * 1.8; r.body.rotation.x = 0.1; }

    if (phase < r.lastPhase) this.strikeFx(r, u, state, style);
    r.lastPhase = phase;
  }

  private strikeFx(r: Rig, u: any, state: any, style: string): void {
    // impact point: a little in front of the villager, toward the work tile
    const fx = this.fx;
    const tt = u.targetTile;
    const x = tt ? (u.x + (tt.tx + 0.5)) / 2 : r.root.position.x + Math.sin(r.yaw) * 0.25;
    const z = tt ? (u.y + (tt.ty + 0.5)) / 2 : r.root.position.z + Math.cos(r.yaw) * 0.25;
    const y = r.root.position.y + 0.18;
    if (style === "chop") {
      fx.debris.burst(x, y + 0.1, z, 6, 1.2, 2.2, 0.6, 0.6, [0x7fb83a, 0x9bd14a, 0x4f8a2a], -8);
      fx.debris.burst(x, y + 0.4, z, 3, 0.5, 0.5, 1.1, 0.5, [0x2f8f3a, 0x3fa34a], -1.5);
    } else if (style === "mine") {
      const gold = tt && state.grid[tt.ty]?.[tt.tx]?.res === "gold";
      fx.glow.burst(x, y + 0.05, z, 9, 1.8, 1.8, 0.35, 0.45, gold ? [0xffd34a, 0xfff1a8, 0xffffff] : [0xffffff, 0xe2e8f0, 0xffe7a0], -9);
    } else if (style === "harvest") {
      fx.debris.burst(x, y, z, 6, 0.8, 1.4, 0.8, 0.45, [0xe2b23a, 0xf5d36a, 0xc99a2a], -3.5);
    } else if (style === "build") {
      fx.debris.burst(x, y + 0.05, z, 5, 1.1, 2, 0.6, 0.6, [0xb07a44, 0x8a5a2e, 0xd2a46a], -8);
    }
  }
}
