// Dynasty of the East 3D — procedural animated units, villager work actions, selection rings and 3D projectiles.
import type { ModelRegistry, ModelVisual } from "./modelRegistry";
import { NAVAL_TYPES } from "../sim/naval";
import * as THREE from "three";
import { box, cyl, cone, sphere, geo, mat, mesh, shade, WATER_LEVEL, standHeight, Env3D, MAP_N, contactShadow, disposeTree, smoothstep, renderFaction, hash2, fxGuard, type Faction } from "./common";
import type { FX3D } from "./fx3d";

const SKIN = "#e8c39e", PANTS = "#3a2a1e", WOOD = "#7a4f2a", STEEL = "#cbd5e1", IRON = "#6b7280", GOLD = "#e8b53a", BAMBOO = "#d4b06a";
const TAU = Math.PI * 2;

let trailTexture: THREE.CanvasTexture | undefined;
/** 64×64 arrow trail: ivory at the shaft fading to bronze and transparent at the tail, soft at the edges. */
function trailMask(): THREE.CanvasTexture {
  if (trailTexture) return trailTexture;
  const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const along = ctx.createLinearGradient(0, 0, 0, 64);
    along.addColorStop(0, "rgba(255,246,226,0.95)");
    along.addColorStop(0.45, "rgba(232,190,120,0.55)");
    along.addColorStop(1, "rgba(176,120,60,0)");
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, 64, 64);
    ctx.globalCompositeOperation = "destination-in";
    const across = ctx.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(0,0,0,0)");
    across.addColorStop(0.5, "rgba(0,0,0,1)");
    across.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 64, 64);
  }
  trailTexture = new THREE.CanvasTexture(canvas);
  trailTexture.colorSpace = THREE.SRGBColorSpace;
  return trailTexture;
}

interface Rig {
  model?: ModelVisual;
  root: THREE.Group; body: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  legL: THREE.Group | null; legR: THREE.Group | null;
  tools: Record<string, THREE.Object3D>; carry: Record<string, THREE.Object3D>;
  legs4: THREE.Group[]; trunk: THREE.Group[]; arm: THREE.Group | null; wheels: THREE.Object3D[];
  ring: THREE.Mesh; faction: Faction; health: THREE.Group; healthFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; height: number; type: string; key: string;
  yaw: number; walk: number; lastPhase: number; atk: number; melee: number; nextPose: number; lastPose: number; dustT: number; previousCooldown: number; px: number; pz: number; init: boolean; u: any;
}

function limb(len: number, w: number, m: THREE.Material, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(box(w, len, w * 1.1), m, 0, -len / 2, 0));
  return g;
}

function newRig(type: string, key: string, faction: Faction): Rig {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffe075, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(geo("selring", () => { const g = new THREE.RingGeometry(0.24, 0.35, 32); g.rotateX(-Math.PI / 2); return g; }), ringM);
  ring.position.y = 0.03; ring.visible = false; ring.renderOrder = 4;
  const large = type === "war_elephant", mounted = type === "cavalry" || type === "horse_archer";
  root.add(ring, contactShadow(large ? 0.97 : mounted ? 0.68 : 0.51, large ? 1.48 : mounted ? 0.99 : 0.54));
  const health = new THREE.Group();
  const panel = new THREE.MeshBasicMaterial({ color: "#1d130d", depthTest: false, depthWrite: false, toneMapped: false });
  const fillMaterial = new THREE.MeshBasicMaterial({ color: "#a3ec65", depthTest: false, depthWrite: false, toneMapped: false });
  const healthFill = new THREE.Mesh(box(0.48, 0.051, 0.006), fillMaterial);
  const frame = new THREE.Mesh(box(0.52, 0.079, 0.012), panel);
  frame.renderOrder = 11;
  healthFill.position.z = 0.01;
  healthFill.renderOrder = 12;
  health.add(frame, healthFill);
  health.visible = false;
  root.add(health);
  return { root, body, faction, health, healthFill, armL: new THREE.Group(), armR: new THREE.Group(), legL: null, legR: null, tools: {}, carry: {}, legs4: [], trunk: [], arm: null, wheels: [], ring, height: 0.6, type, key, yaw: 0, walk: 0, lastPhase: 0, atk: 0, melee: 0, nextPose: 0, lastPose: 0, dustT: 0, previousCooldown: 0, px: 0, pz: 0, init: false, u: null };
}

/** Humanoid torso/head/limbs into `parent` (feet at y=0). */
function humanoid(r: Rig, parent: THREE.Group, tunic: string, opts: { armor?: boolean; legs?: boolean } = {}): void {
  const faction = r.faction;
  const civilian = r.type === "villager";
  const armWidth = civilian && faction === "trung_nguyen" ? 0.077 : faction === "bac_cuong" ? 0.060 : 0.045;
  const tm = mat(tunic, { rim: shade(tunic, 0.4) }), pm = mat(PANTS), sm = mat(SKIN);
  if (opts.legs !== false) {
    r.legL = limb(0.17, 0.055, pm, -0.045, 0.17, 0); r.legR = limb(0.17, 0.055, pm, 0.045, 0.17, 0);
    parent.add(r.legL, r.legR);
  }
  parent.add(mesh(box(0.17, 0.2, 0.11), opts.armor ? mat(shade(tunic, -0.33), { metal: 0.47, rough: 0.55, surface: "scale", rim: shade(tunic, 0.45) }) : tm, 0, 0.27, 0));
  if (opts.armor) {
    // lamellar plates: team-coloured bands over iron
    for (let k = 0; k < 3; k++) parent.add(mesh(box(0.18, 0.027, 0.12), tm, 0, 0.2 + k * 0.06, 0, false));
  } else parent.add(mesh(box(0.18, 0.08, 0.12), mat(shade(tunic, -0.25)), 0, 0.2, 0, false));
  parent.add(mesh(box(0.175, 0.025, 0.115), mat("#2a1a10"), 0, 0.235, 0, false));
  parent.add(mesh(sphere(0.065, 12, 10), sm, 0, 0.44, 0));
  const dark = mat("#302018");
  if (faction === "dai_viet") {
    const cap = mat(civilian ? BAMBOO : "#856445", { surface: "thatch", rough: 0.81 });
    parent.add(mesh(cone(civilian ? 0.145 : 0.102, civilian ? 0.078 : 0.115, 12), cap, 0, 0.533, 0));
  } else if (faction === "trung_nguyen" && civilian) {
    parent.add(mesh(sphere(0.066, 8, 6), dark, 0, 0.487, -0.009));
    parent.add(mesh(sphere(0.044, 8, 6), dark, 0, 0.56, -0.028));
    const lapel = mesh(box(0.022, 0.15, 0.014), mat("#ead9b5"), 0.012, 0.304, 0.062, false);
    lapel.rotation.z = -0.62;
    parent.add(lapel);
  } else if (faction === "trung_nguyen") {
    const bronze = mat("#ae854b", { metal: 0.66, rough: 0.36, rim: "#edc47b" });
    parent.add(mesh(geo("crown-helmet", () => new THREE.SphereGeometry(0.082, 10, 6, 0, TAU, 0, Math.PI * 0.55)), bronze, 0, 0.468, 0));
    for (const sign of [-1, 1]) parent.add(mesh(box(0.019, 0.075, 0.044), bronze, sign * 0.067, 0.449, 0));
    parent.add(mesh(cone(0.024, 0.076, 6), tm, 0, 0.565, -0.013));
  } else {
    const fur = mat("#d3b58e", { surface: "thatch", rough: 0.92 });
    parent.add(mesh(cyl(0.089, 0.092, 0.045, 12), fur, 0, 0.489, 0));
    parent.add(mesh(sphere(0.077, 9, 6), dark, 0, 0.525, 0));
    for (const sign of [-1, 1]) parent.add(mesh(box(0.036, 0.077, 0.065), fur, sign * 0.075, 0.455, -0.012));
    parent.add(mesh(box(0.185, 0.038, 0.121), fur, 0, 0.339, 0));
    const cloak = mesh(box(0.19, 0.25, 0.035), tm, 0, 0.255, -0.071, false);
    cloak.rotation.x = -0.18;
    parent.add(cloak);
  }
  r.armL = limb(0.17, armWidth, tm, -0.11, 0.36, 0); r.armR = limb(0.17, armWidth, tm, 0.11, 0.36, 0);
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
  else if (kind === "spear") {
    const tip = mesh(cone(0.026, 0.10, 4), sm, 0, 0, 0.24);
    tip.rotation.x = Math.PI / 2;
    g.add(tip);
  }
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

function flag(parent: THREE.Object3D, x: number, y: number, z: number, color: string, h = 0.35): void {
  parent.add(mesh(cyl(0.008, 0.008, h, 5), mat("#3a2412"), x, y + h / 2, z));
  const g = geo("unit-flag", () => new THREE.PlaneGeometry(0.16, 0.1, 5, 1).translate(0.08, 0, 0));
  const f = mesh(g, mat(color, { side: THREE.DoubleSide, surface: "silk", flagWind: true }), x, y + h - 0.06, z, false);
  f.rotation.y = Math.PI / 2;
  parent.add(f);
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

function buildUnit(type: string, team: string, faction: Faction): Rig {
  const r = newRig(type, `${type}|${team}|${faction}`, faction);
  const b = r.body;
  switch (type) {
    case "villager": {
      humanoid(r, b, shade(team, -0.05));
      for (const k of ["axe", "pick", "sickle", "hammer", "spear"]) { r.tools[k] = hand(r.armR, tool(k)); r.tools[k].visible = false; }
      for (const k of ["wood", "food", "gold", "stone"]) { r.carry[k] = carryBundle(k); b.add(r.carry[k]); }
      r.height = 0.6;
      break;
    }
    case "fishing_boat":
    case "galley":
    case "fire_ship": {
      const fishing = type === "fishing_boat";
      const width = fishing ? 0.44 : 0.70;
      const length = fishing ? 0.85 : 1.25;
      const wood = mat("#6c4530", { surface: "teak" });
      const trim = mat(shade(team, -0.12), { surface: "lacquer" });
      const hull = mesh(cyl(0.5, 0.39, 0.17, 8), wood, 0, 0.07, 0);
      hull.scale.set(width, 1, length);
      b.add(hull, mesh(box(width * 0.75, 0.03, length * 0.72), trim, 0, 0.16, 0));
      b.add(mesh(cyl(0.023, 0.028, 0.66, 6), wood, 0, 0.46, 0.04));
      const sail = mesh(box(width * 0.85, 0.38, 0.045), mat(team, { surface: "silk" }), 0, 0.55, 0.04);
      sail.rotation.z = -0.1;
      b.add(sail);
      r.tools.sail = sail;
      if (type === "galley") {
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
          const oar = mesh(box(0.36, 0.024, 0.042), wood, side * width * 0.54, 0.13, (i - 1) * 0.22);
          oar.rotation.z = -side * 0.24;
          b.add(oar);
        }
      }
      if (type === "fire_ship") {
        b.add(mesh(cyl(0.13, 0.1, 0.09, 8), mat("#713e23", { metal: 0.4, emissive: "#893209" }), 0, 0.21, length * 0.28));
        b.add(mesh(cone(0.07, 0.15, 6), mat("#ffac50", { emissive: "#ac3d0b" }), 0, 0.30, length * 0.28));
      }
      r.height = 0.81;
      break;
    }
    case "healer": {
      humanoid(r, r.body, "#447c62", { legs: true });
      r.body.add(mesh(cyl(0.018, 0.018, 0.56, 6), mat("#604a32", { surface: "teak" }), 0.22, 0.29, 0.1));
      r.body.add(mesh(sphere(0.055, 8, 6), mat("#87d9ac", { emissive: "#135635" }), 0.22, 0.59, 0.1));
      r.height = 0.67;
      break;
    }
    case "swordsman": {
      humanoid(r, b, team, { armor: true });
      const blade = new THREE.Group();
      blade.add(mesh(box(0.016, 0.26, 0.035), mat(STEEL, { metal: 0.9, rough: 0.2 }), 0, -0.14, 0.0));
      blade.add(mesh(box(0.06, 0.015, 0.03), mat(GOLD, { metal: 0.7 }), 0, -0.01, 0));
      blade.rotation.x = Math.PI / 2 + 0.3;
      r.tools.weapon = hand(r.armR, blade);
      const shield = mesh(geo("shield", () => new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14)), mat(faction === "dai_viet" ? "#b39860" : shade(team, -0.2), { metal: faction === "trung_nguyen" ? 0.6 : 0.12, surface: faction === "dai_viet" ? "thatch" : "teak" }), -0.04, -0.12, 0.04);
      shield.rotation.z = Math.PI / 2;
      r.armL.add(shield);
      r.armL.add(mesh(sphere(0.022, 6, 5), mat(GOLD, { metal: 0.8 }), -0.055, -0.12, 0.04, false));
      r.height = 0.65;
      break;
    }
    case "spearman": {
      humanoid(r, b, team, { armor: true });
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
      humanoid(r, b, team);
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
      humanoid(r, rider, team, { armor: type === "cavalry", legs: false });
      rider.add(mesh(box(0.2, 0.05, 0.09), mat(PANTS), 0, 0.17, 0.02)); // seated legs
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
      flag(rider, -0.08, 0.3, -0.07, team, 0.4);
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
      flag(e, -0.13, 0.74, -0.17, team, 0.35);
      flag(e, 0.13, 0.74, -0.17, team, 0.35);
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
      flag(b, -0.15, 0.14, -0.24, team, 0.4);
      r.height = 0.7;
      break;
    }
    default: {
      humanoid(r, b, team);
      r.height = 0.6;
    }
  }
  const heavy = type === "cavalry" || type === "horse_archer" || type === "catapult" || type === "war_elephant";
  const scale = heavy ? 1.43 : 1.4;
  r.body.scale.multiplyScalar(scale);
  r.height *= scale;
  r.ring.scale.setScalar(type === "war_elephant" ? 2.55 : heavy ? 1.84 : 1.22);
  return r;
}

// ---------------------------------------------------------------------------
interface AnimalRig { model?: ModelVisual; root: THREE.Group; legs: THREE.Group[]; body: THREE.Group; yaw: number; px: number; pz: number; walk: number; init: boolean; type: string; dead: number; }

/** Stylized low-poly deer (antlered stag with spotted flanks) and wild boar (bristled, tusked). */
function wildlifeSpecies(type: string): string {
  if (type === "cow" || type === "ox") return "cattle";
  if (type === "buffalo" || type === "water_buffalo") return "buffalo";
  if (type === "wild_elephant") return "elephant";
  return type;
}

function buildAnimal(species: string, seed: number): AnimalRig {
  const type = wildlifeSpecies(species);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body, contactShadow(type === "deer" ? 0.56 : 0.61, type === "deer" ? 0.81 : 0.7));
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
  } else if (["goat", "cattle", "buffalo", "lion", "tiger", "elephant"].includes(type)) {
    const goat = type === "goat", cat = type === "lion" || type === "tiger", giant = type === "elephant";
    const furColor = goat ? "#dbd0b9" : cat ? "#c98035" : giant ? "#777d7a" : type === "buffalo" ? "#55576a" : "#9c684a";
    const fur = mat(furColor, { rough: 0.91 }), dark = mat(shade(furColor, -0.38)), horn = mat("#dfc9a6");
    const width = goat ? 0.18 : cat ? 0.30 : giant ? 0.63 : 0.40;
    const length = width * (cat ? 2.05 : 1.73);
    const h = goat ? 0.26 : cat ? 0.29 : giant ? 0.56 : 0.37;
    const mass = mesh(sphere(0.5, 9, 6), fur, 0, h + width * 0.33, 0);
    mass.scale.set(width, width * 0.9, length);
    body.add(mass);
    const head = mesh(sphere(0.5, 10, 7), fur, 0, h + width * 0.62, length * 0.46);
    head.scale.set(width * 0.61, width * 0.60, width * 0.73);
    body.add(head);
    const nose = mesh(sphere(0.5, 8, 6), dark, 0, h + width * 0.46, length * 0.62);
    nose.scale.set(width * 0.49, width * 0.28, width * 0.25);
    body.add(nose);
    const tail = mesh(cyl(width * 0.05, width * 0.055, width * (cat ? 1.38 : 0.65), 5),
      dark, 0, h + 0.1, -length * 0.53);
    tail.rotation.x = cat ? 0.95 : 0.53;
    body.add(tail);
    for (const x of [-1, 1]) {
      const ear = mesh(sphere(0.5, 7, 5), giant ? fur : dark, x * width * (giant ? 0.47 : 0.28), h + width * 0.79, length * 0.44);
      ear.scale.set(width * (giant ? 0.46 : 0.19), width * (giant ? 0.69 : 0.21), width * 0.16);
      ear.rotation.z = x * 0.28;
      body.add(ear);
      if (!cat) {
        const tip = mesh(cone(width * 0.055, width * (goat ? 0.63 : 0.49), 6), horn, x * width * 0.24,
          h + width * (giant ? 0.43 : 0.98), length * (giant ? 0.67 : 0.45));
        tip.rotation.z = -x * (type === "buffalo" ? 1.12 : 0.45);
        tip.rotation.x = giant ? -0.95 : goat ? -0.48 : 0;
        body.add(tip);
      }
      for (const z of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(x * width * 0.32, h, z * length * 0.29);
        leg.add(mesh(cyl(width * 0.11, width * 0.095, h, 6), dark, 0, -h * 0.5, 0));
        body.add(leg); legs.push(leg);
      }
    }
    if (giant) {
      const trunk = mesh(cyl(0.069, 0.105, 0.46, 8), fur, 0, h + 0.05, length * 0.69);
      trunk.rotation.x = -0.14;
      body.add(trunk);
    } else if (type === "lion") {
      const mane = mesh(geo("wild-mane", () => new THREE.IcosahedronGeometry(0.19, 1)), dark, 0, h + width * 0.56, length * 0.37);
      mane.scale.set(1, 1.06, 0.69);
      body.add(mane);
    } else if (type === "tiger") {
      for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) {
        const stripe = mesh(box(0.008, 0.078, 0.027), dark, sign * width * 0.45, h + width * 0.46, (i - 2) * length * 0.15, false);
        stripe.rotation.x = (i % 2 ? 1 : -1) * 0.28;
        body.add(stripe);
      }
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
  body.scale.setScalar(0.87 + hash2(seed, 97) * 0.24);
  return { root, legs, body, yaw: 0, px: 0, pz: 0, walk: 0, init: false, type, dead: 0 };
}

interface Proj { mesh: THREE.Object3D; kind: string; lx: number; ly: number; lz: number; tx: number; tz: number; }

export class Units3D {
  readonly group = new THREE.Group();
  private readonly rigs = new Map<number, Rig>();
  private readonly projs = new Map<object, Proj>();
  private readonly pool: Record<string, THREE.Object3D[]> = { arrow: [], bolt: [], boulder: [] };
  private readonly tmp = new THREE.Vector3();
  private readonly cameraFacing = new THREE.Quaternion();
  private readonly inverseYaw = new THREE.Quaternion();
  private readonly axisY = new THREE.Vector3(0, 1, 0);
  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();
  private readonly bounds = new THREE.Sphere(new THREE.Vector3(), 1.3);
  private readonly animals = new Map<number, AnimalRig>();
  private readonly animalHeights = new Map<string, number>();

  private readonly dying = new Map<Rig, number>();

  constructor(private readonly fx: FX3D, private readonly models: ModelRegistry) {}

  private disposeRig(rig: Rig | AnimalRig): void {
    rig.model?.dispose();
    disposeTree(rig.root);
  }

  rigFor(id: number): Rig | undefined { return this.rigs.get(id); }
  allRigs(): IterableIterator<Rig> { return this.rigs.values(); }

  clear(): void {
    for (const r of this.rigs.values()) this.disposeRig(r);
    this.rigs.clear();
    for (const a of this.animals.values()) this.disposeRig(a);
    this.animals.clear();
    for (const r of this.dying.keys()) this.disposeRig(r);
    this.dying.clear();
    for (const list of Object.values(this.pool)) {
      for (const mesh of list) disposeTree(mesh);
      list.length = 0;
    }
    this.projs.clear();
  }

  dispose(): void { this.clear(); this.group.removeFromParent(); }

  private onScreen(root: THREE.Object3D): boolean {
    this.bounds.center.copy(root.position);
    this.bounds.center.y += 0.48;
    return this.frustum.intersectsSphere(this.bounds);
  }

  private projMesh(kind: string): THREE.Object3D {
    const list = this.pool[kind] || this.pool.arrow;
    const free = list.find(o => !o.userData.inFlight);
    if (free) { free.userData.inFlight = true; return free; }
    let o: THREE.Object3D;
    if (kind === "boulder") {
      o = mesh(geo("boulder", () => new THREE.DodecahedronGeometry(0.1, 0)), mat("#9aa1a9", { rough: 0.85, flat: true }));
    } else {
      const g = new THREE.Group();
      g.add(mesh(cyl(0.008, 0.008, 0.32, 4), mat(kind === "bolt" ? GOLD : "#e7d8b0", { metal: kind === "bolt" ? 0.6 : 0 }), 0, 0, 0, false));
      g.add(mesh(cone(0.02, 0.06, 4), mat(STEEL, { metal: 0.9 }), 0, 0.18, 0, false));
      g.add(mesh(box(0.04, 0.05, 0.004), mat("#f8fafc"), 0, -0.14, 0, false));
      g.children.forEach(c => { c.rotation.x = Math.PI / 2; c.position.z = c.position.y; c.position.y = 0; });
      // thin ivory → bronze streak (arrow: archer, horse archer, watch tower; bolt: chu kho nu, citadel)
      const ribbon = new THREE.MeshBasicMaterial({
        color: kind === "bolt" ? 0xffd9a0 : 0xffffff, map: trailMask(), opacity: 0.7,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
      });
      ribbon.userData.sharedTexture = true;
      const plane = geo("projectile-trail-thin", () => new THREE.PlaneGeometry(0.045, 0.72).rotateX(Math.PI / 2));
      const trail = mesh(plane, ribbon, 0, 0, -0.35, false);
      const edge = mesh(plane, ribbon, 0, 0, -0.35, false);
      edge.rotation.z = Math.PI / 2;
      trail.renderOrder = edge.renderOrder = 4;
      g.add(trail, edge);
      o = g;
    }
    o.userData.inFlight = true;
    list.push(o);
    this.group.add(o);
    return o;
  }

  update(state: any, env: Env3D, t: number, dt: number, camera: THREE.Camera, shadows: boolean): void {
    camera.getWorldQuaternion(this.cameraFacing);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
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
      if (pr.mesh.visible && p.kind === "boulder" && this.fx.rich && t >= (pr.mesh.userData.trailAt ?? 0)) {
        pr.mesh.userData.trailAt = t + 0.065;
        this.fx.smoke.emit(x, y, z, 0, 0.07, 0, 0.33, 0.64, 0xb89d81, 0, 1.2);
      }
    }
    for (const [p, pr] of this.projs) {
      if (live.has(p)) continue;
      // the projectile is removed on the same frame the sim applies its damage, so impacts stay in sync
      fxGuard("projectile-impact", () => {
        const gy = standHeight(pr.tx, pr.tz, state.grid);
        if (pr.kind === "boulder" && fogAt(pr.tx, pr.tz) > 0) {
          this.tmp.set(pr.tx, gy, pr.tz);
          this.fx.boulderImpact(pr.tx, gy, pr.tz, fogAt(pr.tx, pr.tz) === 2 && this.frustum.containsPoint(this.tmp));
        } else if (pr.kind !== "boulder" && fogAt(pr.tx, pr.tz) === 2 && this.fx.rich) this.fx.glow.burst(pr.tx, gy + 0.3, pr.tz, 4, 0.8, 1, 0.25, 0.6, [0xfff1a8, 0xffffff], -4);
      });
      pr.mesh.visible = false;
      pr.mesh.userData.inFlight = false;
      this.projs.delete(p);
    }

    // --- units ---
    for (const u of state.units) {
      seen.add(u.id);
      const color = env.teamColor(u);
      const faction = renderFaction(u, state);
      const key = `${u.type}|${color}|${faction}`;
      let r = this.rigs.get(u.id);
      if (!r || r.key !== key) {
        if (r) this.disposeRig(r);
        r = buildUnit(u.type, color, faction);
        r.model = this.models.creature("units", u.type, r.height, r.root, r.body,
          { side: u.team === "player" ? "player" : "enemy", color });
        this.group.add(r.root);
        this.rigs.set(u.id, r);
      }
      r.u = u;
      const vis = !u.garrisoned && (u.team === "player" || fogAt(u.x, u.y) === 2);
      r.root.visible = vis;
      const naval = NAVAL_TYPES.has(u.type);
      const gy = naval ? WATER_LEVEL : standHeight(u.x, u.y, state.grid);
      if (!r.init) { r.root.position.set(u.x, gy, u.y); r.px = u.x; r.pz = u.y; r.init = true; }
      const kpos = 1 - Math.exp(-dt * 22);
      r.root.position.x += (u.x - r.root.position.x) * kpos;
      r.root.position.z += (u.y - r.root.position.z) * kpos;
      r.root.position.y += (gy - r.root.position.y) * kpos;
      const vx = (u.x - r.px) / Math.max(dt, 1e-3), vz = (u.y - r.pz) / Math.max(dt, 1e-3);
      r.px = u.x; r.pz = u.y;
      const speed = Math.hypot(vx, vz);
      const moving = speed > 0.12;
      r.root.visible = vis && this.onScreen(r.root);
      if (!r.root.visible) continue;

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
      r.health.visible = r.ring.visible && u.maxHp > 0;
      if (r.ring.visible) {
        (r.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 + Math.sin(t * 5) * 0.10;
        const hp = THREE.MathUtils.clamp(u.hp / (u.maxHp || 1), 0, 1);
        r.health.quaternion.copy(this.inverseYaw.setFromAxisAngle(this.axisY, -r.yaw)).multiply(this.cameraFacing);
        this.tmp.set(0, -0.075, 0.49 * r.ring.scale.x).applyQuaternion(r.health.quaternion);
        r.health.position.copy(this.tmp);
        r.health.position.y += 0.10;
        r.healthFill.scale.x = hp;
        r.healthFill.position.x = (hp - 1) * 0.24;
        r.healthFill.material.color.set(hp > 0.55 ? "#b9f568" : hp > 0.27 ? "#ffe17b" : "#ff7458");
      }

      const dist = camera.position.distanceToSquared(r.root.position);
      if (t >= r.nextPose || r.ring.visible) {
        const elapsed = r.lastPose === 0 ? dt : Math.min(0.12, t - r.lastPose);
        r.lastPose = t;
        r.nextPose = t + (dist > 1600 ? 0.063 : dist > 500 ? 0.033 : 0);
        if (naval) {
          const underBridge = state.grid[Math.floor(u.y)]?.[Math.floor(u.x)]?.terrain === "bridge";
          const sail = r.tools.sail;
          if (sail) sail.scale.y = underBridge ? 0.18 : 1;
          r.body.position.y = Math.sin(t * 3 + u.x) * 0.022;
          r.body.rotation.z = Math.sin(t * 2 + u.y) * 0.035;
          if (moving && t >= r.dustT) {
            this.fx.ripple(u.x - Math.sin(r.yaw) * 0.46, WATER_LEVEL + 0.02, u.y - Math.cos(r.yaw) * 0.46);
            r.dustT = t + 0.55;
          }
        } else this.animate(r, u, state, t, elapsed, moving, speed, target);
        const pose = u.hp <= 0 ? "die" : moving ? (speed > 2.35 ? "run" : "walk")
          : u.task === "attack" || u.task === "hunt" ? "attack"
          : u.task === "build" ? "build" : u.task === "gather" ? "gather" : "idle";
        r.model?.update(elapsed, pose, shadows);
      }
    }

    this.updateAnimals(state, t, dt, fogAt, shadows);

    for (const [r, end] of this.dying) {
      if (t >= end || !r.model?.deathDuration) {
        this.disposeRig(r);
        this.dying.delete(r);
      } else r.model.update(dt, "die", shadows);
    }

    for (const [id, r] of this.rigs) {
      if (seen.has(id)) continue;
      if (r.root.visible) this.fx.debris.burst(r.root.position.x, r.root.position.y + 0.2, r.root.position.z, 10, 0.9, 1.6, 0.8, 1, [0x8a7a66, 0x5b4a3a, 0xb91c1c], -7);
      const duration = r.model?.deathDuration ?? 0;
      if (r.root.visible && duration > 0 && this.dying.size < 20) {
        r.ring.visible = r.health.visible = false;
        this.dying.set(r, t + Math.min(duration, 2.5));
        r.model?.update(dt, "die", shadows);
      } else this.disposeRig(r);
      this.rigs.delete(id);
    }
  }

  private updateAnimals(state: any, t: number, dt: number, fogAt: (x: number, z: number) => number, shadows: boolean): void {
    const seenA = new Set<number>();
    for (const a of state.animals || []) {
      seenA.add(a.id);
      let r = this.animals.get(a.id);
      if (!r) {
        r = buildAnimal(a.type, a.seed ?? a.id);
        let height = this.animalHeights.get(a.type);
        if (height === undefined) {
          height = new THREE.Box3().setFromObject(r.body).max.y;
          this.animalHeights.set(a.type, height);
        }
        r.model = this.models.creature("wildlife", a.type, height, r.root, r.body);
        this.group.add(r.root);
        this.animals.set(a.id, r);
      }
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
      r.root.visible = vis && this.onScreen(r.root);
      if (!r.root.visible) continue;
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
      r.body.rotation.z = r.dead * 1.45;
      const meat = a.dead ? 0.55 + 0.45 * Math.max(0, (a.food ?? 0) / (a.maxFood || (a.type === "deer" ? 140 : 240))) : 1;
      r.root.scale.setScalar(meat);
      r.model?.update(dt, a.dead ? "die" : moving ? (speed > 1.5 ? "run" : "walk")
        : a.aggroId != null ? "attack" : "idle", shadows);
      // fresh hurt flash for charging boar: raise head
      if (a.type === "boar" && a.aggroId != null) r.body.rotation.x = -0.12;
    }
    for (const [id, r] of this.animals) {
      if (seenA.has(id)) continue;
      this.disposeRig(r);
      this.animals.delete(id);
    }
  }

  private animate(r: Rig, u: any, state: any, t: number, dt: number, moving: boolean, speed: number, target: any): void {
    r.walk += dt * (moving ? 6 + speed * 5 : 0);
    const sw = moving ? Math.sin(r.walk) : 0;
    r.atk = Math.max(0, r.atk - dt * 2.2);
    const inMelee = u.task === "attack" && !moving && target && (target.hp ?? 1) > 0;
    const cooldown = u.atkCooldown ?? 0;
    const hit = inMelee && cooldown - r.previousCooldown > 0.35;
    if (hit) {
      r.melee = 1;
      if (r.type === "swordsman" || r.type === "cavalry") {
        const { x, y, z } = r.root.position;
        this.fx.slash(x + Math.sin(r.yaw) * 0.32, y, z + Math.cos(r.yaw) * 0.32, r.yaw);
      }
    } else r.melee = Math.max(0, r.melee - dt * 2.4);
    r.previousCooldown = cooldown;

    if (r.legL && r.legR) { r.legL.rotation.x = sw * 0.6; r.legR.rotation.x = -sw * 0.6; }
    r.body.position.y = moving ? Math.abs(Math.sin(r.walk)) * 0.02 : 0;
    r.body.rotation.x = 0;
    r.armL.rotation.set(-sw * 0.5, 0, 0);
    r.armR.rotation.set(sw * 0.5, 0, 0);
    // cavalry / horse archers / war elephants kick up low dust while running (medium / high)
    if (moving && speed > 0.6 && r.legs4.length && this.fx.rich && t >= r.dustT) {
      r.dustT = t + (r.type === "war_elephant" ? 0.3 : 0.22);
      const { x, y, z } = r.root.position;
      const back = r.type === "war_elephant" ? 0.42 : 0.28;
      this.fx.smoke.emit(x - Math.sin(r.yaw) * back, y + 0.03, z - Math.cos(r.yaw) * back,
        (Math.random() - 0.5) * 0.12, 0.1, (Math.random() - 0.5) * 0.12, 0.6, r.type === "war_elephant" ? 0.9 : 0.66, 0xb09a78, 0, 1.2);
    }

    switch (r.type) {
      case "villager": this.animVillager(r, u, state, moving); break;
      case "swordsman": case "spearman":
        if (inMelee) {
          const recover = smoothstep(0.05, 0.9, r.melee);
          const windup = smoothstep(0.73, 0.03, cooldown);
          const k = r.melee > 0 ? recover : 1 - windup;
          r.armR.rotation.x = r.type === "spearman" ? -1.2 + k * 0.4 : -2.3 + k * 2.1;
          if (r.type === "spearman") r.armR.position.z = k * 0.06;
          if (r.type === "swordsman") r.armL.rotation.x = -0.9;
        } else if (r.type === "spearman") {
          r.armR.rotation.x = -0.3 + sw * 0.2;
          r.armR.position.z = 0;
        }
        break;
      case "archer": case "chuko_nu":
        if (r.atk > 0 || inMelee) { r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.1 - smoothstep(0.8, 0.05, cooldown) * 0.7 + smoothstep(0, 0.65, r.atk) * 0.78; }
        break;
      case "cavalry": case "horse_archer": {
        const gal = moving ? r.walk * 1.4 : 0;
        r.legs4.forEach((l, i) => { l.rotation.x = moving ? Math.sin(gal + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * 0.7 : 0; });
        r.body.position.y = moving ? Math.abs(Math.sin(gal)) * 0.05 : 0;
        r.body.rotation.x = moving ? Math.sin(gal) * 0.05 : 0;
        if (r.type === "cavalry" && inMelee) r.armR.rotation.x = -0.6 + smoothstep(0.05, 0.9, r.melee) * 0.5;
        if (r.type === "horse_archer" && (r.atk > 0 || inMelee)) { r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.2 - smoothstep(0.8, 0.05, cooldown) * 0.54 + r.atk * 0.5; }
        break;
      }
      case "war_elephant": {
        const st = moving ? r.walk * 0.7 : 0;
        r.legs4.forEach((l, i) => { l.rotation.x = moving ? Math.sin(st + ((i === 0 || i === 3) ? 0 : Math.PI)) * 0.35 : 0; });
        r.body.position.y = moving ? Math.abs(Math.sin(st)) * 0.03 : 0;
        const swing = inMelee ? smoothstep(0.05, 0.9, r.melee) * 0.6 : Math.sin(t * 1.8 + u.id) * 0.18;
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
    const hunting = u.task === "hunt" && u.huntBusy && !moving;
    const working = !moving && u.task !== "hunt" && style !== "idle" && style !== "carry";
    const toolKey = hunting ? "spear" : working ? (
      style === "chop" ? "axe" : style === "mine" ? "pick" : style === "harvest" ? "sickle" : style === "build" ? "hammer" : ""
    ) : "";
    for (const k in r.tools) r.tools[k].visible = k === toolKey;
    if (hunting) {
      const cooldown = u.atkCooldown ?? 0;
      const thrust = smoothstep(0.62, 0.02, cooldown) - smoothstep(0.67, 0.97, cooldown) * 0.8;
      r.armL.rotation.x = -0.94;
      r.armR.rotation.x = -1.44 + thrust * 0.65;
      r.body.rotation.x = 0.05 - thrust * 0.16;
    }
    const carrying = u.task === "return" && u.carryAmt > 0;
    for (const k in r.carry) r.carry[k].visible = carrying && (u.carryType || "wood") === k;
    if (carrying) { r.armR.rotation.x = -2.6; r.armR.rotation.z = 0.25; }
    if (!working) { r.lastPhase = 0; return; }

    const phase = u.workPhase || 0, k = phase / TAU;
    // slow wind-up, fast strike that lands as the phase wraps (same moment the 2D sim plays the hit)
    const strike = smoothstep(0.08, 0.72, k) * (1 - smoothstep(0.72, 0.98, k));
    if (style === "chop") { r.armR.rotation.x = -0.3 - strike * 2.3; r.armL.rotation.x = -0.4 - strike * 1.6; r.body.rotation.x = (1 - strike) * 0.15; }
    else if (style === "mine") { r.armR.rotation.x = -0.4 - strike * 2.7; r.armL.rotation.x = -0.4 - strike * 2.4; r.body.rotation.x = (1 - strike) * 0.22; }
    else if (style === "harvest") { r.armR.rotation.x = -1.1; r.armR.rotation.y = (strike - 0.5) * 1.6; r.body.rotation.x = 0.35; }
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
