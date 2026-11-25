import { healthColor } from "../ui/battleStatus";
// Dynasty of the East 3D — procedural animated units, villager work actions, selection rings and 3D projectiles.
import type { ModelRegistry, ModelVisual } from "./modelRegistry";
import { NAVAL_TYPES } from "../sim/naval";
import * as THREE from "three";
import { box, cyl, cone, sphere, geo, mat, mesh, shade, WATER_LEVEL, standHeight, Env3D, MAP_N, contactShadow, disposeTree, smoothstep, renderFaction, hash2, fxGuard, shareMaterial, type Faction } from "./common";
import { PBR_MATERIALS, pbrTint, type PbrName } from "./pbrMaterials";
import type { FX3D } from "./fx3d";


// Muted cinematic palette: cloth and metal stay desaturated so team colours (plumes, tassels, shields, sails, flags) read from far zoom.
const PAL = {
  steel: "#b3bbc3", steelDark: "#7c848c", bronze: "#b98b52", leather: "#7b5535", leatherDark: "#4b3322",
  skin: "#d4a983", ivory: "#ede2c8", wood: "#7a5434", woodDark: "#4c3221", hull: "#6e4a32", sail: "#d6c9ab",
  rope: "#a48a62", pants: "#3b2d23", jade: "#4f8f78", bamboo: "#c9a964", ore: "#9aa1a9", gold: "#d9a93a"
};
const PANTS = PAL.pants, STEEL = PAL.steel, BAMBOO = PAL.bamboo, GOLD = PAL.gold;
const TAU = Math.PI * 2;
/** Humanoids are sized so a villager measures ≈0.6 world units from foot to hat tip (PR #23 building scale). */
const HUMAN_SCALE = 1.05, MOUNT_SCALE = 1.1, NAVAL_SCALE = 1.4;

type PbrOpts = Parameters<typeof pbrTint>[2];
/** Shared PBR slot from pbrMaterials.ts, optionally tinted; registered as renderer-wide so rig disposal never frees it. */
function pbr(name: PbrName, color?: THREE.ColorRepresentation, o: PbrOpts = {}): THREE.MeshStandardMaterial {
  return shareMaterial(color === undefined && !Object.keys(o ?? {}).length ? PBR_MATERIALS[name] : pbrTint(name, color ?? 0xffffff, o));
}
const steel = (c: string = PAL.steel) => pbr("mat_steel", c);
const bronze = () => pbr("mat_bronze", PAL.bronze);
const leather = (c: string = PAL.leather) => pbr("mat_leather", c);
const skinM = () => pbr("mat_skin", PAL.skin);
const ivory = (c: string = PAL.ivory) => pbr("mat_ivory", c);
const cloth = (c: string) => pbr("mat_cloth", c);
const woodM = (c: string = PAL.wood) => pbr("mat_wood", c);
const fur = (c: string) => pbr("mat_fur", c);
const hide = (c: string) => pbr("mat_hide", c);
/** Team colour pulled 18% toward warm grey for large cloth areas; accents keep the pure team colour. */
function mute(team: string, k = 0.18): string { return "#" + new THREE.Color(team).lerp(new THREE.Color("#6b6358"), k).getHexString(); }

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
  /** Villager animation state of the last frame (one of VILLAGER_ANIMS). */
  anim?: VillagerAnim; foodSrc?: "farm" | "forage";
  deathT0?: number; deathMats?: THREE.Material[]; deathSide?: number;
  legs4: THREE.Group[]; knees: THREE.Group[]; trunk: THREE.Group[]; arm: THREE.Group | null; wheels: THREE.Object3D[]; oars: THREE.Object3D[];
  ring: THREE.Mesh; faction: Faction; health: THREE.Group; healthFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; height: number; type: string; key: string;
  yaw: number; walk: number; lastPhase: number; atk: number; melee: number; nextPose: number; lastPose: number; dustT: number; previousCooldown: number; px: number; pz: number; init: boolean; u: any;
  /** healer: >0 while a heal is being channelled; previous sim healPulse value. Ships: sail/mast lowering 0..1. */
  heal: number; prevHeal: number; sailK: number;
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
  root.add(ring, contactShadow(large ? 0.8 : mounted ? 0.56 : 0.42, large ? 1.2 : mounted ? 0.82 : 0.45));
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
  return { root, body, faction, health, healthFill, armL: new THREE.Group(), armR: new THREE.Group(), legL: null, legR: null, tools: {}, carry: {}, legs4: [], knees: [], trunk: [], arm: null, wheels: [], oars: [], ring, height: 0.6, type, key, yaw: 0, walk: 0, lastPhase: 0, atk: 0, melee: 0, nextPose: 0, lastPose: 0, dustT: 0, previousCooldown: 0, px: 0, pz: 0, init: false, u: null, heal: 0, prevHeal: NaN, sailK: 0 };
}

type Armor = "none" | "scale" | "leather" | "lamellar";
type Headgear = "auto" | "steel" | "bronze" | "fur" | "hood" | "band";
interface HumanOpts { armor?: Armor; legs?: boolean; head?: Headgear; robe?: boolean; accent?: string }

/** Humanoid torso/head/limbs into `parent` (feet at y=0, head centre y=0.44). */
function humanoid(r: Rig, parent: THREE.Group, tunic: string, o: HumanOpts = {}): void {
  const faction = r.faction;
  const civilian = r.type === "villager";
  const armor = o.armor ?? "none";
  const accent = o.accent ?? tunic;
  const armWidth = civilian && faction === "trung_nguyen" ? 0.077 : faction === "bac_cuong" ? 0.060 : 0.045;
  const tm = cloth(tunic), pm = cloth(PANTS), sm = skinM();
  if (o.legs !== false) {
    r.legL = limb(0.17, 0.055, pm, -0.045, 0.17, 0); r.legR = limb(0.17, 0.055, pm, 0.045, 0.17, 0);
    for (const l of [r.legL, r.legR]) l.add(mesh(box(0.06, 0.03, 0.08), leather(PAL.leatherDark), 0, -0.165, 0.012, false)); // boots
    parent.add(r.legL, r.legR);
  }
  if (o.robe) parent.add(mesh(cyl(0.085, 0.13, 0.2, 10), tm, 0, 0.13, 0)); // long healer robe skirt
  const torsoM = armor === "scale" ? steel(PAL.steelDark) : armor === "leather" ? leather() : armor === "lamellar" ? bronze() : tm;
  parent.add(mesh(box(0.17, 0.2, 0.11), torsoM, 0, 0.27, 0));
  if (armor === "scale") {
    // steel scale coat banded with the team colour, steel pauldrons
    for (let k = 0; k < 3; k++) parent.add(mesh(box(0.18, 0.022, 0.12), cloth(accent), 0, 0.2 + k * 0.06, 0, false));
    for (const s of [-1, 1]) parent.add(mesh(box(0.06, 0.035, 0.12), steel(), s * 0.105, 0.36, 0, false));
  } else if (armor === "lamellar") {
    // Central-Plains lamellar: bronze rows over a team-coloured skirt
    parent.add(mesh(box(0.18, 0.07, 0.12), tm, 0, 0.19, 0, false));
    for (let k = 0; k < 2; k++) parent.add(mesh(box(0.178, 0.012, 0.118), steel(PAL.steelDark), 0, 0.27 + k * 0.06, 0, false));
  } else if (armor === "leather") {
    parent.add(mesh(box(0.18, 0.07, 0.12), tm, 0, 0.2, 0, false));
    const strap = mesh(box(0.02, 0.24, 0.118), leather(PAL.leatherDark), 0, 0.29, 0, false); strap.rotation.z = 0.6; parent.add(strap);
  } else parent.add(mesh(box(0.18, 0.08, 0.12), cloth(shade(tunic, -0.25)), 0, 0.2, 0, false));
  parent.add(mesh(box(0.175, 0.025, 0.115), leather(PAL.leatherDark), 0, 0.235, 0, false)); // belt
  parent.add(mesh(sphere(0.065, 12, 10), sm, 0, 0.44, 0));
  const dark = cloth("#2e221a");
  let head = o.head ?? "auto";
  if (head === "auto" && !civilian) head = faction === "trung_nguyen" ? "bronze" : faction === "bac_cuong" ? "fur" : "auto";
  if (head === "steel") {
    // steel helmet (mũ trụ): dome, brim, spike and team plume
    const s = steel();
    parent.add(mesh(geo("steel-helm", () => new THREE.SphereGeometry(0.078, 10, 6, 0, TAU, 0, Math.PI * 0.55)), s, 0, 0.462, 0));
    parent.add(mesh(cyl(0.088, 0.088, 0.012, 12), s, 0, 0.47, 0, false));
    for (const sign of [-1, 1]) parent.add(mesh(box(0.016, 0.07, 0.05), s, sign * 0.066, 0.43, 0.005, false));
    parent.add(mesh(cone(0.012, 0.05, 5), bronze(), 0, 0.555, 0, false));
    parent.add(mesh(cone(0.026, 0.07, 6), cloth(accent), 0, 0.565, -0.02, false));
  } else if (head === "bronze") {
    const b = bronze();
    parent.add(mesh(geo("crown-helmet", () => new THREE.SphereGeometry(0.082, 10, 6, 0, TAU, 0, Math.PI * 0.55)), b, 0, 0.468, 0));
    for (const sign of [-1, 1]) parent.add(mesh(box(0.019, 0.075, 0.044), b, sign * 0.067, 0.449, 0));
    parent.add(mesh(cone(0.024, 0.076, 6), cloth(accent), 0, 0.565, -0.013));
  } else if (head === "fur") {
    const f = fur("#c9ab84");
    parent.add(mesh(cyl(0.089, 0.092, 0.045, 12), f, 0, 0.489, 0));
    parent.add(mesh(sphere(0.077, 9, 6), dark, 0, 0.525, 0));
    for (const sign of [-1, 1]) parent.add(mesh(box(0.036, 0.077, 0.065), f, sign * 0.075, 0.455, -0.012));
    if (!civilian) {
      parent.add(mesh(box(0.185, 0.038, 0.121), f, 0, 0.339, 0));
      const cloak = mesh(box(0.19, 0.25, 0.035), tm, 0, 0.255, -0.071, false);
      cloak.rotation.x = -0.18;
      parent.add(cloak);
    }
  } else if (head === "hood") {
    parent.add(mesh(cone(0.09, 0.14, 10), cloth(shade(tunic, -0.15)), 0, 0.5, -0.01));
  } else if (head === "band") {
    parent.add(mesh(sphere(0.067, 9, 6), dark, 0, 0.465, -0.008));
    parent.add(mesh(cyl(0.069, 0.069, 0.022, 12), cloth(accent), 0, 0.47, 0, false));
    parent.add(mesh(sphere(0.03, 7, 5), dark, 0, 0.53, -0.03));
  } else if (faction === "dai_viet") {
    // nón lá: bamboo conical hat — its tip defines the 0.6-unit villager height
    const cap = mat(civilian ? BAMBOO : "#856445", { surface: "thatch", rough: 0.81 });
    parent.add(mesh(cone(civilian ? 0.145 : 0.102, civilian ? 0.078 : 0.115, 12), cap, 0, 0.533, 0));
  } else if (faction === "trung_nguyen") {
    parent.add(mesh(sphere(0.066, 8, 6), dark, 0, 0.487, -0.009));
    parent.add(mesh(sphere(0.044, 8, 6), dark, 0, 0.56, -0.028));
    const lapel = mesh(box(0.022, 0.15, 0.014), cloth("#ead9b5"), 0.012, 0.304, 0.062, false);
    lapel.rotation.z = -0.62;
    parent.add(lapel);
  } else {
    // northern steppe villager: felt cap and fur collar
    const f = fur("#c9ab84");
    parent.add(mesh(cyl(0.08, 0.088, 0.05, 12), f, 0, 0.49, 0));
    parent.add(mesh(sphere(0.07, 9, 6), cloth(shade(tunic, -0.2)), 0, 0.52, 0));
    parent.add(mesh(box(0.185, 0.034, 0.121), f, 0, 0.345, 0));
  }
  const armM = armor === "leather" ? leather() : armor === "scale" ? steel(PAL.steelDark) : tm;
  r.armL = limb(0.17, armWidth, armM, -0.11, 0.36, 0); r.armR = limb(0.17, armWidth, armM, 0.11, 0.36, 0);
  for (const a of [r.armL, r.armR]) a.add(mesh(sphere(0.028, 8, 6), sm, 0, -0.18, 0));
  parent.add(r.armL, r.armR);
}

function hand(arm: THREE.Group, obj: THREE.Object3D): THREE.Object3D { obj.position.y = -0.18; arm.add(obj); return obj; }

function tool(kind: string): THREE.Group {
  const g = new THREE.Group(), wm = woodM(), sm = steel();
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
  else if (kind === "hammer") g.add(mesh(box(0.05, 0.05, 0.08), steel(PAL.steelDark), 0, 0, 0.17));
  else if (kind === "knife") { handle.scale.set(1, 0.35, 1); handle.position.z = 0.03; g.add(mesh(box(0.008, 0.026, 0.1), sm, 0, 0, 0.11)); }
  else if (kind === "basket") {
    // gùi nhỏ / rổ hái quả on the off hand, with a few berries heaped in it
    g.remove(handle);
    g.add(mesh(cyl(0.055, 0.04, 0.06, 8), pbr("mat_bamboo", PAL.bamboo), 0, -0.02, 0.04));
    for (let k = 0; k < 3; k++) g.add(mesh(sphere(0.018, 5, 4), mat(k ? "#b5342a" : "#d18a2a", { rough: 0.5 }), (k - 1) * 0.022, 0.015, 0.04 + (k % 2) * 0.01, false));
  }
  return g;
}

/** Carried loads: firewood on the shoulder, a rice sheaf (bó lúa), or a woven back-basket (gùi) of ore / stone. */
function carryBundle(kind: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === "wood") {
    for (let k = 0; k < 3; k++) { const l = mesh(cyl(0.022, 0.022, 0.3, 6), woodM("#8a6a3c"), 0, k * 0.035, (k - 1) * 0.03); l.rotation.x = Math.PI / 2; l.rotation.z = 0.3; g.add(l); }
    g.position.set(0.08, 0.42, -0.03);
  } else if (kind === "food") {
    const s = mesh(cone(0.07, 0.24, 7), pbr("mat_bamboo", "#d8b048"), 0, 0.06, 0); s.rotation.z = Math.PI / 2.4; g.add(s);
    g.add(mesh(cyl(0.03, 0.03, 0.03, 6), leather(), 0.02, 0.05, 0));
    g.position.set(0.08, 0.42, -0.03);
  } else if (kind === "meat") {
    // haunch of game over the shoulder, tied with a leather thong
    const haunch = mesh(sphere(0.06, 7, 5), mat("#8e3b2c", { rough: 0.62 }), 0, 0.02, 0); haunch.scale.set(1, 0.75, 1.5); g.add(haunch);
    const bone = mesh(cyl(0.012, 0.012, 0.1, 5), mat("#e8dcc4", { rough: 0.5 }), 0, 0.02, 0.11); bone.rotation.x = Math.PI / 2; g.add(bone);
    g.add(mesh(box(0.13, 0.012, 0.012), leather(), 0, 0.05, 0, false));
    g.position.set(0.08, 0.43, -0.03);
  } else if (kind === "fruit") {
    // woven basket of fruit / herbs hugged at the chest
    g.add(mesh(cyl(0.07, 0.05, 0.08, 8), pbr("mat_bamboo", PAL.bamboo), 0, 0, 0));
    for (let k = 0; k < 4; k++) g.add(mesh(sphere(0.024, 5, 4), mat(k % 2 ? "#b5342a" : "#d6a12a", { rough: 0.5 }), Math.cos(k * 1.6) * 0.03, 0.05, Math.sin(k * 1.6) * 0.03, false));
    g.add(mesh(cone(0.03, 0.06, 5), mat("#4f7a33", { rough: 0.8 }), 0.02, 0.07, -0.02, false));
    g.position.set(0, 0.28, 0.1);
  } else {
    // gùi: tapered bamboo basket on the back with the load heaped on top
    g.add(mesh(cyl(0.07, 0.05, 0.14, 8), pbr("mat_bamboo", PAL.bamboo), 0, 0, 0));
    g.add(mesh(cyl(0.073, 0.073, 0.012, 8), woodM(PAL.woodDark), 0, 0.07, 0, false));
    const load = kind === "gold" ? mat(PAL.gold, { metal: 0.75, rough: 0.3, flat: true }) : pbr("mat_stone", PAL.ore);
    g.add(mesh(geo("ore", () => new THREE.DodecahedronGeometry(0.055, 0)), load, 0, 0.085, 0));
    g.position.set(0, 0.3, -0.1);
  }
  g.visible = false;
  return g;
}

function flag(parent: THREE.Object3D, x: number, y: number, z: number, color: string, h = 0.35): void {
  parent.add(mesh(cyl(0.008, 0.008, h, 5), woodM(PAL.woodDark), x, y + h / 2, z));
  const g = geo("unit-flag", () => new THREE.PlaneGeometry(0.16, 0.1, 5, 1).translate(0.08, 0, 0));
  const f = mesh(g, mat(color, { side: THREE.DoubleSide, surface: "silk", flagWind: true }), x, y + h - 0.06, z, false);
  f.rotation.y = Math.PI / 2;
  parent.add(f);
}

/** Swallow-tailed pennant (cờ đuôi nheo) on a back pole. */
function pennant(parent: THREE.Object3D, x: number, y: number, z: number, color: string, h = 0.4): void {
  parent.add(mesh(cyl(0.006, 0.006, h, 5), woodM(PAL.woodDark), x, y + h / 2, z));
  const g = geo("unit-pennant", () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.045); s.lineTo(0.22, 0.03); s.lineTo(0.15, 0); s.lineTo(0.22, -0.03); s.lineTo(0, -0.045); s.lineTo(0, 0.045);
    return new THREE.ShapeGeometry(s, 4);
  });
  const f = mesh(g, mat(color, { side: THREE.DoubleSide, surface: "silk", flagWind: true }), x, y + h - 0.05, z, false);
  f.rotation.y = Math.PI / 2;
  parent.add(f);
}

function bowGroup(radius: number, team: string): { bow: THREE.Group; string: THREE.Object3D } {
  const bow = new THREE.Group();
  bow.add(mesh(geo(`bow-${radius}`, () => new THREE.TorusGeometry(radius, 0.009, 4, 14, Math.PI)), woodM(PAL.woodDark), 0, 0, 0, false));
  for (const s of [-1, 1]) bow.add(mesh(sphere(0.012, 5, 4), ivory(), s * radius, 0, 0, false)); // ivory nocks
  bow.add(mesh(box(0.03, 0.03, 0.02), cloth(team), 0, radius, 0, false)); // team grip wrap
  const string = mesh(box(radius * 2, 0.003, 0.003), cloth("#e8dfc8"), 0, 0, 0, false);
  bow.add(string);
  return { bow, string };
}

/** Articulated horse: neck/head pivot, mane, swinging tail, four legs with hip + knee joints and hooves. */
function horse(r: Rig, parent: THREE.Group, team: string, steppe: boolean): THREE.Group {
  const coat = steppe ? "#9a7b55" : "#6a4730", hm = fur(coat), dm = fur(shade(coat, -0.45)), hoofM = hide("#2b2420");
  const h = new THREE.Group();
  if (steppe) h.scale.setScalar(0.9);
  const torso = mesh(sphere(0.5, 10, 7), hm, 0, 0.31, 0); torso.scale.set(0.18, 0.18, 0.46); h.add(torso);
  const neck = new THREE.Group(); neck.position.set(0, 0.36, 0.17); neck.rotation.x = 0.55; h.add(neck);
  neck.add(mesh(box(0.09, 0.22, 0.1), hm, 0, 0.1, 0));
  for (let k = 0; k < 4; k++) neck.add(mesh(box(0.025, 0.06, 0.045), dm, 0, 0.03 + k * 0.05, -0.05, false)); // mane
  const head = new THREE.Group(); head.position.set(0, 0.21, 0); head.rotation.x = 0.05; neck.add(head);
  head.add(mesh(box(0.08, 0.08, 0.18), hm, 0, 0, 0.06));
  head.add(mesh(box(0.07, 0.06, 0.05), dm, 0, -0.01, 0.16, false));
  for (const s of [-1, 1]) head.add(mesh(cone(0.015, 0.05, 4), hm, s * 0.025, 0.06, -0.01, false));
  r.tools.neck = neck;
  const tail = new THREE.Group(); tail.position.set(0, 0.36, -0.23); h.add(tail);
  const tm = mesh(box(0.035, 0.2, 0.03), dm, 0, -0.1, 0); tail.add(tm); tail.rotation.x = -0.45;
  r.tools.tail = tail;
  // tack: leather saddle on a team saddle cloth
  h.add(mesh(box(0.2, 0.012, 0.18), cloth(team), 0, 0.41, -0.02, false));
  h.add(mesh(box(0.12, 0.035, 0.12), leather(), 0, 0.43, -0.02));
  for (const [x, z] of [[-0.055, 0.15], [0.055, 0.15], [-0.055, -0.15], [0.055, -0.15]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.27, z);
    hip.add(mesh(box(0.05, 0.13, 0.055), hm, 0, -0.065, 0));
    const knee = new THREE.Group(); knee.position.y = -0.13; hip.add(knee);
    knee.add(mesh(box(0.035, 0.12, 0.035), dm, 0, -0.06, 0));
    knee.add(mesh(box(0.042, 0.022, 0.05), hoofM, 0, -0.125, 0.004, false));
    h.add(hip); r.legs4.push(hip); r.knees.push(knee);
  }
  parent.add(h);
  return h;
}

/** Spoked siege / cart wheel whose axle is the local X axis (roll with rotation.x). */
function spokedWheel(radius: number): THREE.Group {
  const w = new THREE.Group(), dm = woodM(PAL.woodDark), iron = steel(PAL.steelDark);
  const rim = mesh(geo(`wheel-rim-${radius}`, () => new THREE.TorusGeometry(radius, 0.012, 5, 14)), iron, 0, 0, 0); rim.rotation.y = Math.PI / 2; w.add(rim);
  const hub = mesh(cyl(0.022, 0.022, 0.04, 8), dm, 0, 0, 0, false); hub.rotation.z = Math.PI / 2; w.add(hub);
  for (let k = 0; k < 3; k++) { const s = mesh(box(0.012, radius * 2, 0.014), dm, 0, 0, 0, false); s.rotation.x = (k / 3) * Math.PI; w.add(s); }
  return w;
}

function buildShip(r: Rig, type: string, team: string): void {
  const b = r.body;
  const fishing = type === "fishing_boat", fire = type === "fire_ship";
  const width = fishing ? 0.44 : fire ? 0.56 : 0.70;
  const length = fishing ? 0.85 : fire ? 1.2 : 1.3;
  const hullM = pbr("mat_ship_wood", fire ? "#4f3526" : PAL.hull);
  const trim = cloth(fishing ? mute(team, 0.4) : team);
  // hull sits on the waterline (body y = 0 is WATER_LEVEL): keel slightly submerged, gunwale at ~0.16
  const hull = mesh(cyl(0.5, 0.39, 0.17, 8), hullM, 0, 0.07, 0);
  hull.scale.set(width, 1, length);
  b.add(hull);
  const prow = mesh(cone(width * 0.3, length * 0.22, 6), hullM, 0, 0.11, length * 0.52); prow.rotation.x = Math.PI / 2; b.add(prow);
  b.add(mesh(box(width * 0.6, 0.08, length * 0.16), hullM, 0, 0.2, -length * 0.38)); // raised stern
  b.add(mesh(box(width * 0.78, 0.022, length * 0.74), trim, 0, 0.162, 0, false)); // team gunwale band
  b.add(mesh(box(width * 0.66, 0.02, length * 0.66), woodM("#8a6a48"), 0, 0.15, 0)); // deck
  // mast pivots at the deck so it can be lowered aft when passing under a bridge
  const mast = new THREE.Group(); mast.position.set(0, 0.16, 0.04); b.add(mast);
  const mastH = fishing ? 0.5 : 0.62;
  mast.add(mesh(cyl(0.018, 0.024, mastH, 6), woodM(PAL.woodDark), 0, mastH / 2, 0));
  const yard = mesh(cyl(0.01, 0.01, width * 0.95, 5), woodM(PAL.woodDark), 0, mastH - 0.04, 0.02, false); yard.rotation.z = Math.PI / 2; mast.add(yard);
  const sailH = fishing ? 0.3 : 0.4;
  const sailPivot = new THREE.Group(); sailPivot.position.set(0, mastH - 0.04, 0.03); mast.add(sailPivot);
  const sailColor = fishing ? PAL.sail : fire ? "#6b5a4a" : mute(team, 0.25);
  const sail = mesh(geo(`sail-${width}-${sailH}`, () => new THREE.PlaneGeometry(width * 0.85, sailH, 2, 4).translate(0, -sailH / 2, 0)), pbr("mat_sail", sailColor, { side: THREE.DoubleSide }), 0, 0, 0);
  sail.rotation.x = -0.06;
  sailPivot.add(sail);
  if (!fishing) sailPivot.add(mesh(box(width * 0.2, sailH * 0.3, 0.004), cloth(team), 0, -sailH * 0.45, 0.004, false)); // team emblem
  flag(mast, 0, mastH - 0.02, 0, team, 0.16);
  r.tools.mast = mast; r.tools.sail = sailPivot;
  r.height = 0.81; // unchanged: keeps the ship health bar and tap point where they were
  if (fishing) {
    // net on a pole (lowered while fishing) and a fish basket filled while returning to the dock
    const netArm = new THREE.Group(); netArm.position.set(width * 0.36, 0.17, length * 0.12); b.add(netArm);
    const pole = mesh(cyl(0.008, 0.008, 0.42, 5), woodM(), 0, 0.21, 0, false); netArm.add(pole);
    const net = mesh(cone(0.07, 0.12, 8, ), mat("#8d7f60", { surface: "lattice", side: THREE.DoubleSide, rough: 0.9 }), 0, 0.37, 0, false);
    net.rotation.x = Math.PI; netArm.add(net);
    netArm.rotation.z = -0.35;
    r.tools.net = netArm;
    b.add(mesh(box(0.14, 0.03, 0.1), mat("#8d7f60", { surface: "lattice", rough: 0.9 }), -width * 0.15, 0.175, -length * 0.15, false)); // folded net heap
    const basket = new THREE.Group(); basket.position.set(-width * 0.12, 0.16, length * 0.14); b.add(basket);
    basket.add(mesh(cyl(0.065, 0.05, 0.08, 8), pbr("mat_bamboo", PAL.bamboo), 0, 0.04, 0));
    const fish = new THREE.Group(); fish.position.y = 0.07; basket.add(fish);
    for (let k = 0; k < 4; k++) { const f = mesh(box(0.06, 0.016, 0.022), steel("#9fb3bd"), Math.cos(k * 1.7) * 0.025, k * 0.008, Math.sin(k * 1.7) * 0.025, false); f.rotation.y = k * 1.1; fish.add(f); }
    fish.visible = false;
    r.tools.fish = fish;
  } else if (!fire) {
    // galley: oar banks, raised fighting deck with team shields along the rails and a bow-mounted repeating crossbow
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const oar = new THREE.Group(); oar.position.set(side * width * 0.5, 0.13, (i - 1.5) * 0.24);
      const blade = mesh(box(0.36, 0.018, 0.036), woodM(), side * 0.17, 0, 0, false); blade.rotation.z = -side * 0.3; oar.add(blade);
      b.add(oar); r.oars.push(oar);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const sh = mesh(geo("rail-shield", () => new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10)), cloth(team), side * width * 0.47, 0.21, (i - 1.5) * 0.24, false);
      sh.rotation.z = Math.PI / 2; b.add(sh);
    }
    b.add(mesh(box(width * 0.5, 0.06, length * 0.22), woodM("#8a6a48"), 0, 0.2, length * 0.26));
    const mount = new THREE.Group(); mount.position.set(0, 0.26, length * 0.3); b.add(mount);
    mount.add(mesh(box(0.05, 0.05, 0.22), woodM(PAL.woodDark), 0, 0, 0.04));
    mount.add(mesh(box(0.26, 0.016, 0.02), steel(), 0, 0.01, 0.13, false));
    r.tools.ballista = mount;
  } else {
    // fire ship: slim hull, straw bundles and a glowing fire basket at the prow, readable from far zoom
    for (let k = 0; k < 3; k++) { const s = mesh(cyl(0.05, 0.05, width * 0.5, 7), pbr("mat_bamboo", "#b89a52"), 0, 0.2, (k - 1) * 0.2, false); s.rotation.z = Math.PI / 2; b.add(s); }
    const basket = new THREE.Group(); basket.position.set(0, 0.2, length * 0.36); b.add(basket);
    basket.add(mesh(cyl(0.1, 0.07, 0.08, 8), steel("#5a5048"), 0, 0, 0));
    const flame = mesh(cone(0.075, 0.2, 7), mat("#ffb05a", { emissive: "#ff6a1a", emissiveIntensity: 1.8 }), 0, 0.13, 0, false);
    const core = mesh(cone(0.04, 0.12, 6), mat("#fff1b8", { emissive: "#ffc46a", emissiveIntensity: 2.2 }), 0, 0.1, 0, false);
    basket.add(flame, core);
    r.tools.flame = flame; r.tools.flameCore = core; r.tools.brazier = basket;
  }
}

function buildUnit(type: string, team: string, faction: Faction): Rig {
  const r = newRig(type, `${type}|${team}|${faction}`, faction);
  const b = r.body;
  const cape = mute(team);
  switch (type) {
    case "villager": {
      humanoid(r, b, mute(shade(team, -0.05), 0.3));
      for (const k of ["axe", "pick", "sickle", "hammer", "spear", "knife"]) { r.tools[k] = hand(r.armR, tool(k)); r.tools[k].visible = false; }
      r.tools.basket = hand(r.armL, tool("basket")); r.tools.basket.visible = false;
      for (const k of ["wood", "food", "gold", "stone", "meat", "fruit"]) { r.carry[k] = carryBundle(k); b.add(r.carry[k]); }
      r.height = faction === "dai_viet" ? 0.572 : 0.6;
      break;
    }
    case "fishing_boat":
    case "galley":
    case "fire_ship": buildShip(r, type, team); break;
    case "healer": {
      humanoid(r, b, PAL.jade, { robe: true, head: "band", accent: team });
      // medicine satchel on a strap
      b.add(mesh(box(0.07, 0.07, 0.04), leather(), -0.1, 0.2, 0.04));
      b.add(mesh(box(0.03, 0.018, 0.045), cloth(team), -0.1, 0.24, 0.04, false));
      const strap = mesh(box(0.015, 0.25, 0.118), leather(PAL.leatherDark), 0, 0.3, 0, false); strap.rotation.z = -0.6; b.add(strap);
      // staff with a team ribbon and the jade orb used by the heal glow
      const staff = new THREE.Group();
      staff.add(mesh(cyl(0.014, 0.016, 0.62, 6), woodM(PAL.woodDark), 0, 0.1, 0));
      staff.add(mesh(box(0.05, 0.03, 0.006), cloth(team), 0.03, 0.35, 0, false));
      staff.add(mesh(sphere(0.045, 8, 6), mat("#87d9ac", { emissive: "#1f8a5a", emissiveIntensity: 0.9 }), 0, 0.43, 0, false));
      r.tools.staff = hand(r.armR, staff);
      r.height = 0.58;
      break;
    }
    case "swordsman": {
      humanoid(r, b, cape, { armor: "scale", head: "steel", accent: team });
      // trường đao: leather-wrapped grip, bronze guard, long steel blade
      const blade = new THREE.Group();
      blade.add(mesh(cyl(0.011, 0.011, 0.12, 5), leather(PAL.leatherDark), 0, -0.02, 0));
      blade.add(mesh(box(0.05, 0.012, 0.03), bronze(), 0, -0.085, 0, false));
      blade.add(mesh(box(0.012, 0.3, 0.034), steel(), 0, -0.24, 0));
      const tip = mesh(cone(0.017, 0.06, 4), steel(), 0, -0.42, 0, false); tip.rotation.x = Math.PI; blade.add(tip);
      blade.rotation.x = Math.PI / 2 + 0.3;
      r.tools.weapon = hand(r.armR, blade);
      // round shield: team-lacquered face, bronze rim and boss
      const shield = new THREE.Group(); shield.position.set(-0.04, -0.12, 0.04);
      const face = mesh(geo("shield", () => new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14)), woodM(team)); face.rotation.z = Math.PI / 2; shield.add(face);
      const rim = mesh(geo("shield-rim", () => new THREE.TorusGeometry(0.09, 0.009, 5, 16)), bronze(), 0, 0, 0, false); rim.rotation.y = Math.PI / 2; shield.add(rim);
      shield.add(mesh(sphere(0.022, 6, 5), bronze(), -0.015, 0, 0, false));
      r.armL.add(shield);
      r.height = 0.62;
      break;
    }
    case "spearman": {
      humanoid(r, b, cape, { armor: "leather", accent: team });
      const spear = new THREE.Group();
      spear.add(mesh(cyl(0.01, 0.011, 0.95, 5), woodM(), 0, 0.18, 0));
      spear.add(mesh(cone(0.02, 0.16, 4), steel(), 0, 0.73, 0));
      const tassel = mesh(cone(0.032, 0.07, 6), cloth(team), 0, 0.62, 0, false); tassel.rotation.x = Math.PI; spear.add(tassel);
      r.tools.weapon = hand(r.armR, spear);
      r.height = 0.62;
      break;
    }
    case "archer": {
      humanoid(r, b, cape, { armor: "leather", head: r.faction === "dai_viet" ? "auto" : "hood", accent: team });
      const cloak = mesh(box(0.2, 0.26, 0.02), cloth(shade(cape, -0.15)), 0, 0.25, -0.07); cloak.rotation.x = 0.12; b.add(cloak);
      // quiver on the back with fletchings showing
      const quiver = new THREE.Group(); quiver.position.set(0.05, 0.32, -0.09); quiver.rotation.z = -0.35; b.add(quiver);
      quiver.add(mesh(cyl(0.026, 0.022, 0.2, 7), leather(), 0, 0, 0));
      for (let k = 0; k < 3; k++) quiver.add(mesh(box(0.012, 0.04, 0.004), cloth("#efe6d2"), (k - 1) * 0.012, 0.12, 0, false));
      const { bow, string } = bowGroup(0.17, team);
      bow.rotation.y = Math.PI / 2; bow.rotation.x = Math.PI / 2;
      r.tools.weapon = hand(r.armL, bow);
      r.tools.string = string;
      r.height = 0.6;
      break;
    }
    case "chuko_nu": {
      humanoid(r, b, cape, { armor: "lamellar", head: "bronze", accent: team });
      b.add(mesh(cyl(0.028, 0.024, 0.18, 6), leather(), 0.05, 0.32, -0.09)); // bolt case
      // repeating crossbow (nỏ hộp): stock, bolt magazine, transverse prod, string and cocking lever
      const xb = new THREE.Group();
      xb.add(mesh(box(0.03, 0.03, 0.26), woodM(), 0, 0, 0.1));
      xb.add(mesh(box(0.035, 0.06, 0.13), woodM(PAL.woodDark), 0, 0.045, 0.12)); // magazine
      xb.add(mesh(box(0.24, 0.014, 0.018), woodM(PAL.woodDark), 0, 0, 0.21));
      for (const s of [-1, 1]) xb.add(mesh(box(0.016, 0.016, 0.02), bronze(), s * 0.12, 0, 0.21, false));
      xb.add(mesh(box(0.24, 0.003, 0.003), cloth("#e8dfc8"), 0, 0.006, 0.18, false));
      const lever = new THREE.Group(); lever.position.set(0, 0.075, 0.06); xb.add(lever);
      lever.add(mesh(box(0.012, 0.012, 0.16), bronze(), 0, 0, 0.07, false));
      r.tools.weapon = hand(r.armR, xb);
      r.tools.lever = lever;
      r.height = 0.62;
      break;
    }
    case "cavalry":
    case "horse_archer": {
      const steppe = type === "horse_archer";
      horse(r, b, team, steppe);
      const rider = new THREE.Group(); rider.position.set(0, steppe ? 0.23 : 0.25, -0.02); rider.scale.setScalar(0.85);
      humanoid(r, rider, cape, steppe ? { armor: "leather", head: "fur", accent: team } : { armor: "scale", head: "steel", accent: team });
      rider.add(mesh(box(0.2, 0.05, 0.09), cloth(PANTS), 0, 0.17, 0.02)); // seated legs
      for (const s of [-1, 1]) rider.add(mesh(box(0.045, 0.12, 0.06), leather(PAL.leatherDark), s * 0.11, 0.1, 0.03, false));
      if (!steppe) {
        const capeM = mesh(box(0.19, 0.24, 0.02), cloth(team), 0, 0.27, -0.075, false); capeM.rotation.x = 0.25; rider.add(capeM);
        r.tools.cape = capeM;
        const lance = new THREE.Group();
        lance.add(mesh(cyl(0.01, 0.011, 0.9, 5), woodM(), 0, 0.2, 0));
        lance.add(mesh(cone(0.02, 0.12, 4), steel(), 0, 0.71, 0));
        const tassel = mesh(cone(0.028, 0.06, 6), cloth(team), 0, 0.62, 0, false); tassel.rotation.x = Math.PI; lance.add(tassel);
        lance.rotation.x = 1.0;
        r.tools.weapon = hand(r.armR, lance);
      } else {
        const { bow, string } = bowGroup(0.13, team);
        bow.rotation.y = Math.PI / 2; bow.rotation.x = Math.PI / 2;
        r.tools.weapon = hand(r.armL, bow);
        r.tools.string = string;
        rider.add(mesh(cyl(0.024, 0.02, 0.16, 6), leather(), 0.07, 0.3, -0.08));
      }
      b.add(rider);
      if (steppe) pennant(rider, -0.07, 0.28, -0.08, team, 0.42);
      else flag(rider, -0.08, 0.3, -0.07, team, 0.4);
      r.height = 0.95;
      break;
    }
    case "war_elephant": {
      const em = hide("#767b7c");
      const e = new THREE.Group(); e.scale.setScalar(1.25);
      const torso = mesh(sphere(0.2, 14, 10), em, 0, 0.42, 0); torso.scale.set(1, 0.95, 1.45); e.add(torso);
      e.add(mesh(sphere(0.13, 12, 10), em, 0, 0.5, 0.3));
      // bronze brow plate with a team crest
      const plate = mesh(box(0.15, 0.12, 0.03), bronze(), 0, 0.56, 0.41); plate.rotation.x = -0.35; e.add(plate);
      e.add(mesh(cone(0.025, 0.05, 6), cloth(team), 0, 0.64, 0.4, false));
      for (const s of [-1, 1]) {
        // wide ears on pivots so they can flare during the charge
        const ear = new THREE.Group(); ear.position.set(s * 0.1, 0.55, 0.26); e.add(ear);
        const flap = mesh(sphere(0.12, 8, 6), em, s * 0.06, -0.03, -0.02); flap.scale.set(0.9, 1.1, 0.18); flap.rotation.y = s * 1.2; ear.add(flap);
        r.tools[s < 0 ? "earL" : "earR"] = ear;
        const tusk = mesh(geo("tusk", () => new THREE.TorusGeometry(0.1, 0.014, 5, 10, Math.PI / 1.6)), ivory(), s * 0.06, 0.4, 0.4);
        tusk.rotation.set(0, Math.PI / 2, Math.PI * 0.9); e.add(tusk);
      }
      // articulated trunk: chain of pivots
      let parent: THREE.Object3D = e; let y = 0.44, z = 0.4;
      for (let k = 0; k < 4; k++) {
        const seg = new THREE.Group(); seg.position.set(0, y, z);
        seg.add(mesh(cyl(0.04 - k * 0.006, 0.045 - k * 0.006, 0.1, 7), em, 0, -0.05, 0));
        parent.add(seg); r.trunk.push(seg);
        parent = seg; y = -0.1; z = 0;
      }
      for (const [x, zz] of [[-0.11, 0.17], [0.11, 0.17], [-0.11, -0.17], [0.11, -0.17]]) {
        const l = new THREE.Group(); l.position.set(x, 0.3, zz);
        l.add(mesh(cyl(0.06, 0.065, 0.16, 8), em, 0, -0.08, 0));
        const knee = new THREE.Group(); knee.position.y = -0.16; l.add(knee);
        knee.add(mesh(cyl(0.062, 0.07, 0.14, 8), em, 0, -0.07, 0));
        e.add(l); r.legs4.push(l); r.knees.push(knee);
      }
      // wooden howdah (bành) on a team caparison, with a spearman and Đại Việt-style banners
      e.add(mesh(box(0.38, 0.02, 0.46), cloth(team), 0, 0.59, -0.02, false));
      e.add(mesh(box(0.3, 0.03, 0.38), woodM(), 0, 0.615, -0.03));
      for (const [x, zz] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.2], [0.14, -0.2]]) e.add(mesh(cyl(0.012, 0.012, 0.2, 5), woodM(PAL.woodDark), x, 0.72, zz));
      for (const s of [-1, 1]) e.add(mesh(box(0.012, 0.06, 0.36), woodM(PAL.woodDark), s * 0.14, 0.68, -0.03, false));
      e.add(mesh(cone(0.24, 0.1, 4), cloth(mute(team, 0.3)), 0, 0.86, -0.03));
      const rider = new THREE.Group(); rider.position.set(0, 0.62, -0.05); rider.scale.setScalar(0.65);
      humanoid(r, rider, cape, { armor: "scale", head: r.faction === "dai_viet" ? "auto" : "steel", legs: false, accent: team });
      const spear = new THREE.Group();
      spear.add(mesh(cyl(0.01, 0.01, 0.8, 5), woodM(), 0, 0.15, 0));
      spear.add(mesh(cone(0.02, 0.12, 4), steel(), 0, 0.6, 0));
      r.tools.weapon = hand(r.armR, spear);
      e.add(rider);
      flag(e, -0.14, 0.82, -0.2, team, 0.3);
      flag(e, 0.14, 0.82, -0.2, team, 0.3);
      b.add(e);
      r.tools.frame = e;
      r.height = 1.3;
      break;
    }
    case "catapult": {
      const wm = woodM(), dm = woodM(PAL.woodDark), iron = steel(PAL.steelDark);
      for (const s of [-1, 1]) b.add(mesh(box(0.05, 0.05, 0.5), wm, s * 0.14, 0.12, 0));
      for (const zz of [-0.2, 0.2]) b.add(mesh(box(0.33, 0.04, 0.05), wm, 0, 0.13, zz));
      // iron straps around the beams
      for (const s of [-1, 1]) for (const zz of [-0.2, 0, 0.2]) b.add(mesh(box(0.056, 0.056, 0.014), iron, s * 0.14, 0.12, zz, false));
      for (const s of [-1, 1]) {
        const up = mesh(box(0.04, 0.3, 0.04), dm, s * 0.12, 0.28, -0.02); b.add(up);
        const brace = mesh(box(0.03, 0.26, 0.03), dm, s * 0.12, 0.25, 0.08, false); brace.rotation.x = -0.5; b.add(brace);
        b.add(mesh(box(0.046, 0.016, 0.046), iron, s * 0.12, 0.4, -0.02, false));
      }
      const axle = mesh(cyl(0.02, 0.02, 0.3, 6), iron, 0, 0.4, -0.02); axle.rotation.z = Math.PI / 2; b.add(axle);
      for (const s of [-1, 1]) for (const zz of [-0.17, 0.17]) {
        const w = spokedWheel(0.08); w.position.set(s * 0.18, 0.08, zz); b.add(w); r.wheels.push(w);
      }
      const arm = new THREE.Group(); arm.position.set(0, 0.4, -0.02);
      arm.add(mesh(box(0.04, 0.04, 0.5), wm, 0, 0, 0.12));
      arm.add(mesh(box(0.046, 0.046, 0.014), iron, 0, 0, 0.25, false));
      arm.add(mesh(cyl(0.06, 0.04, 0.05, 8), leather(), 0, 0.03, 0.36));
      arm.add(mesh(sphere(0.04, 7, 5), pbr("mat_stone", PAL.ore), 0, 0.07, 0.36));
      // banded counterweight box
      arm.add(mesh(box(0.1, 0.1, 0.1), woodM(PAL.woodDark), 0, -0.05, -0.14));
      for (const yy of [-0.08, -0.02]) arm.add(mesh(box(0.106, 0.012, 0.106), iron, 0, yy, -0.14, false));
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
  const naval = NAVAL_TYPES.has(type);
  const heavy = type === "cavalry" || type === "horse_archer" || type === "catapult" || type === "war_elephant";
  const scale = naval ? NAVAL_SCALE : heavy ? MOUNT_SCALE : HUMAN_SCALE;
  r.body.scale.multiplyScalar(scale);
  r.height *= scale;
  // selection rings (and hit area) stay generous: infantry and ships keep the previous ring so small units remain easy to tap
  r.ring.scale.setScalar(type === "war_elephant" ? 2.0 : heavy ? 1.5 : 1.22);
  return r;
}

// ---------------------------------------------------------------------------
interface AnimalRig {
  model?: ModelVisual; root: THREE.Group; legs: THREE.Group[]; knees: THREE.Group[]; body: THREE.Group;
  neck: THREE.Group | null; head: THREE.Group | null; tail: THREE.Group | null; trunk: THREE.Group[]; ears: THREE.Group[];
  neckRest: number; yaw: number; px: number; pz: number; walk: number; init: boolean; type: string; dead: number;
}

/** Sim animal ids → procedural species (main: deer, boar, goat, cattle, lion, wild_elephant; aliases kept for old saves). */
function wildlifeSpecies(type: string): string {
  if (type === "cow" || type === "ox") return "cattle";
  if (type === "buffalo" || type === "water_buffalo") return "buffalo";
  if (type === "wild_elephant") return "elephant";
  return type;
}

interface Body {
  coat: string; dark: string; belly?: string; skin: "fur" | "hide";
  len: number; wid: number; dep: number; legH: number; legW: number;
  neckLen: number; neckW: number; neckRest: number; headLen: number; headW: number; tailLen: number;
}
const BODIES: Record<string, Body> = {
  deer: { coat: "#a8743f", dark: "#6c4423", belly: "#e8dcc2", skin: "fur", len: 0.4, wid: 0.15, dep: 0.17, legH: 0.27, legW: 0.032, neckLen: 0.2, neckW: 0.07, neckRest: 0.45, headLen: 0.15, headW: 0.075, tailLen: 0.06 },
  goat: { coat: "#cfc8bb", dark: "#7c746a", belly: "#e9e4da", skin: "fur", len: 0.32, wid: 0.16, dep: 0.17, legH: 0.2, legW: 0.035, neckLen: 0.12, neckW: 0.07, neckRest: 0.5, headLen: 0.13, headW: 0.07, tailLen: 0.05 },
  cattle: { coat: "#a06a3e", dark: "#5a3a22", belly: "#c9a27a", skin: "fur", len: 0.62, wid: 0.3, dep: 0.3, legH: 0.3, legW: 0.06, neckLen: 0.14, neckW: 0.16, neckRest: 0.9, headLen: 0.2, headW: 0.13, tailLen: 0.3 },
  buffalo: { coat: "#55576a", dark: "#2f3038", skin: "hide", len: 0.66, wid: 0.32, dep: 0.31, legH: 0.28, legW: 0.065, neckLen: 0.13, neckW: 0.17, neckRest: 1.0, headLen: 0.2, headW: 0.14, tailLen: 0.28 },
  lion: { coat: "#c28a45", dark: "#6e4422", belly: "#dcb27a", skin: "fur", len: 0.56, wid: 0.24, dep: 0.24, legH: 0.27, legW: 0.055, neckLen: 0.12, neckW: 0.14, neckRest: 0.7, headLen: 0.17, headW: 0.15, tailLen: 0.4 },
  tiger: { coat: "#c9772f", dark: "#2b1d14", belly: "#efe2c6", skin: "fur", len: 0.58, wid: 0.24, dep: 0.23, legH: 0.26, legW: 0.055, neckLen: 0.12, neckW: 0.14, neckRest: 0.7, headLen: 0.16, headW: 0.15, tailLen: 0.42 },
  elephant: { coat: "#6f7472", dark: "#4a4e4d", skin: "hide", len: 0.95, wid: 0.55, dep: 0.52, legH: 0.5, legW: 0.13, neckLen: 0.08, neckW: 0.34, neckRest: 1.2, headLen: 0.32, headW: 0.34, tailLen: 0.3 },
  boar: { coat: "#4a3a2e", dark: "#2a2018", skin: "fur", len: 0.42, wid: 0.22, dep: 0.22, legH: 0.12, legW: 0.045, neckLen: 0.06, neckW: 0.18, neckRest: 1.25, headLen: 0.16, headW: 0.14, tailLen: 0.08 }
};

function buildAnimal(species: string, seed: number): AnimalRig {
  const type = wildlifeSpecies(species);
  const sp = BODIES[type] ?? BODIES.deer;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body, contactShadow(0.3 + sp.wid, 0.35 + sp.len));
  const coatM = sp.skin === "fur" ? fur(sp.coat) : hide(sp.coat);
  const darkM = sp.skin === "fur" ? fur(sp.dark) : hide(sp.dark);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [], trunk: THREE.Group[] = [], ears: THREE.Group[] = [];
  const top = sp.legH + sp.dep;
  // torso
  const torso = mesh(sphere(0.5, 12, 8), coatM, 0, sp.legH + sp.dep * 0.5, 0);
  torso.scale.set(sp.wid, sp.dep, sp.len);
  body.add(torso);
  if (sp.belly) { const belly = mesh(sphere(0.5, 10, 6), sp.skin === "fur" ? fur(sp.belly) : hide(sp.belly), 0, sp.legH + sp.dep * 0.3, 0.01, false); belly.scale.set(sp.wid * 0.85, sp.dep * 0.5, sp.len * 0.8); body.add(belly); }
  // neck pivot at the shoulders; rotation.x > rest lowers the head (grazing), < rest raises it (alert / flee)
  const neck = new THREE.Group(); neck.position.set(0, sp.legH + sp.dep * 0.7, sp.len * 0.36); neck.rotation.x = sp.neckRest; body.add(neck);
  neck.add(mesh(box(sp.neckW, sp.neckLen + sp.neckW * 0.5, sp.neckW * 1.1), coatM, 0, sp.neckLen * 0.5, 0));
  const head = new THREE.Group(); head.position.y = sp.neckLen; head.rotation.x = 1.15 - sp.neckRest; neck.add(head);
  const skull = mesh(box(sp.headW, sp.headW * 0.95, sp.headLen), coatM, 0, 0, sp.headLen * 0.35); head.add(skull);
  head.add(mesh(box(sp.headW * 0.75, sp.headW * 0.6, sp.headLen * 0.4), darkM, 0, -sp.headW * 0.12, sp.headLen * 0.75, false)); // muzzle
  for (const s of [-1, 1]) head.add(mesh(sphere(sp.headW * 0.09, 5, 4), cloth("#120d0a"), s * sp.headW * 0.5, sp.headW * 0.15, sp.headLen * 0.5, false)); // eyes
  // tail pivot at the rump
  const tail = new THREE.Group(); tail.position.set(0, sp.legH + sp.dep * 0.75, -sp.len * 0.48); tail.rotation.x = 0.5; body.add(tail);
  tail.add(mesh(cyl(sp.wid * 0.05, sp.wid * 0.07, sp.tailLen, 5), type === "deer" ? fur("#f6efe2") : darkM, 0, -sp.tailLen / 2, 0));
  // legs: hip + knee joints with hooves / paws
  const upper = sp.legH * 0.52, lower = sp.legH * 0.48;
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(x * sp.wid * 0.3, sp.legH + sp.dep * 0.12, z * sp.len * 0.3);
    hip.add(mesh(box(sp.legW * 1.3, upper + sp.dep * 0.12, sp.legW * 1.4), coatM, 0, -(upper + sp.dep * 0.12) / 2, 0));
    const knee = new THREE.Group(); knee.position.y = -(upper + sp.dep * 0.12); hip.add(knee);
    knee.add(mesh(box(sp.legW, lower, sp.legW * 1.1), darkM, 0, -lower / 2, 0));
    knee.add(mesh(box(sp.legW * 1.15, sp.legW * 0.6, sp.legW * 1.4), hide("#2b2420"), 0, -lower, sp.legW * 0.15, false));
    body.add(hip); legs.push(hip); knees.push(knee);
  }
  const hornM = ivory("#b8a88a");
  if (type === "deer") {
    // slender stag: branched antlers, white flank spots and a white tail flag
    for (const [x, z] of [[-0.05, -0.08], [0.05, 0.02], [-0.04, 0.1], [0.05, -0.13]]) body.add(mesh(sphere(0.013, 5, 4), fur("#f6efe2"), x < 0 ? -sp.wid * 0.48 : sp.wid * 0.48, top - 0.03, z, false));
    for (const s of [-1, 1]) {
      head.add(mesh(box(0.02, 0.05, 0.012), coatM, s * 0.045, 0.05, 0.02, false)); // ears
      const beam = new THREE.Group(); beam.position.set(s * 0.025, 0.04, 0.03); beam.rotation.set(-0.35, 0, -s * 0.45); head.add(beam);
      const antler = ivory("#8a6a48");
      beam.add(mesh(cyl(0.005, 0.008, 0.14, 4), antler, 0, 0.07, 0, false));
      for (const [h, a] of [[0.05, 0.9], [0.1, -0.7], [0.13, 0.6]]) { const tine = mesh(cyl(0.004, 0.005, 0.06, 4), antler, 0, h, 0.02, false); tine.rotation.set(a > 0 ? 0.9 : 0.3, 0, s * a); beam.add(tine); }
    }
  } else if (type === "goat") {
    // grey-white goat: swept-back curved horns and a beard
    for (const s of [-1, 1]) {
      const horn = mesh(geo("goat-horn", () => new THREE.TorusGeometry(0.05, 0.011, 5, 8, Math.PI * 1.1)), hornM, s * 0.025, 0.04, 0.0, false);
      horn.rotation.set(0, Math.PI / 2, Math.PI * 0.15); head.add(horn);
      head.add(mesh(box(0.035, 0.015, 0.02), coatM, s * 0.05, 0.02, 0.02, false));
    }
    const beard = mesh(cone(0.018, 0.06, 5), darkM, 0, -0.06, sp.headLen * 0.55, false); beard.rotation.x = Math.PI; head.add(beard);
  } else if (type === "cattle" || type === "buffalo") {
    // yellow-brown cattle (bò vàng) with a dewlap and short curved horns; buffalo keep wide swept horns
    neck.add(mesh(box(sp.neckW * 0.4, sp.neckLen, sp.neckW * 0.9), coatM, 0, sp.neckLen * 0.2, sp.neckW * 0.45, false));
    for (const s of [-1, 1]) {
      const horn = mesh(cone(0.016, type === "buffalo" ? 0.2 : 0.09, 5), hornM, s * sp.headW * 0.55, sp.headW * 0.45, 0.02, false);
      horn.rotation.z = -s * (type === "buffalo" ? 1.2 : 0.7); head.add(horn);
      head.add(mesh(box(0.05, 0.02, 0.03), coatM, s * sp.headW * 0.6, sp.headW * 0.25, -0.01, false));
    }
    tail.add(mesh(sphere(0.025, 5, 4), darkM, 0, -sp.tailLen, 0, false)); // tuft
  } else if (type === "lion" || type === "tiger") {
    if (type === "lion") {
      const mane = mesh(geo("wild-mane", () => new THREE.IcosahedronGeometry(0.15, 1)), fur(sp.dark), 0, 0.0, 0.02);
      mane.scale.set(1.05, 1.1, 0.75); head.add(mane);
      neck.add(mesh(geo("wild-mane-neck", () => new THREE.IcosahedronGeometry(0.11, 1)), fur(sp.dark), 0, sp.neckLen * 0.4, -0.02));
    } else for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) {
      const stripe = mesh(box(0.008, 0.078, 0.027), darkM, sign * sp.wid * 0.5, top - 0.06, (i - 2) * sp.len * 0.15, false);
      stripe.rotation.x = (i % 2 ? 1 : -1) * 0.28; body.add(stripe);
    }
    for (const s of [-1, 1]) head.add(mesh(sphere(0.025, 5, 4), coatM, s * sp.headW * 0.4, sp.headW * 0.5, 0.0, false));
    tail.add(mesh(sphere(0.025, 5, 4), fur(sp.dark), 0, -sp.tailLen, 0, false)); // tail tuft
  } else if (type === "elephant") {
    // wild elephant: flapping ears, ivory tusks and an articulated trunk
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * sp.headW * 0.45, sp.headW * 0.15, 0.0); head.add(ear);
      const flap = mesh(sphere(0.5, 8, 6), coatM, s * 0.09, -0.04, -0.03); flap.scale.set(0.2, 0.28, 0.05); flap.rotation.y = s * 1.25; ear.add(flap);
      ears.push(ear);
      const tusk = mesh(geo("wild-tusk", () => new THREE.TorusGeometry(0.12, 0.016, 5, 10, Math.PI / 1.7)), ivory(), s * 0.07, -0.08, sp.headLen * 0.55, false);
      tusk.rotation.set(0, Math.PI / 2, Math.PI * 0.9); head.add(tusk);
    }
    let parent: THREE.Object3D = head; let y = -0.05, z = sp.headLen * 0.7;
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.Group(); seg.position.set(0, y, z); seg.rotation.x = 0.15;
      seg.add(mesh(cyl(0.05 - k * 0.008, 0.06 - k * 0.008, 0.12, 7), coatM, 0, -0.06, 0));
      parent.add(seg); trunk.push(seg);
      parent = seg; y = -0.12; z = 0;
    }
  } else if (type === "boar") {
    // bristled boar: dorsal crest, pink snout, small ivory tusks
    for (let k = 0; k < 5; k++) body.add(mesh(box(0.025, 0.05, 0.05), darkM, 0, top - Math.abs(k - 2) * 0.012, -0.14 + k * 0.07, false));
    head.add(mesh(box(0.08, 0.06, 0.04), hide("#c58a7a"), 0, -0.02, sp.headLen * 0.95, false));
    for (const s of [-1, 1]) {
      const t = mesh(cone(0.011, 0.06, 5), ivory(), s * 0.045, -0.03, sp.headLen * 0.85, false); t.rotation.z = s * 0.4; t.rotation.x = -0.5; head.add(t);
      head.add(mesh(box(0.03, 0.05, 0.02), darkM, s * 0.055, 0.06, 0.0, false));
    }
  }
  body.scale.setScalar(0.87 + hash2(seed, 97) * 0.24);
  return { root, legs, knees, body, neck, head, tail, trunk, ears, neckRest: sp.neckRest, yaw: 0, px: 0, pz: 0, walk: 0, init: false, type, dead: 0 };
}

interface Proj { mesh: THREE.Object3D; kind: string; lx: number; ly: number; lz: number; tx: number; tz: number; }

/** The 12 villager animation states. */
export const VILLAGER_ANIMS = ["idle", "walk", "carry_walk", "chop", "mine", "farm", "forage", "hunt", "build", "attack", "flee", "death"] as const;
export type VillagerAnim = typeof VILLAGER_ANIMS[number];
const VILLAGER_TOOL: Partial<Record<VillagerAnim, string>> = { chop: "axe", mine: "pick", farm: "sickle", hunt: "spear", build: "hammer", attack: "axe" };
const DEATH_TIME = 1.9;
const FLEE_TASKS = new Set(["garrison", "retreat", "flee"]);

function findAnimalById(state: any, id: any): any {
  if (id == null) return null;
  for (const a of state?.animals || []) if (a.id === id) return a;
  return null;
}

/**
 * Picks the villager animation from sim state. Order matters: death > flee > carrying > combat > work > walk > idle.
 * Work styles come from graphics/villagerActions (chop / mine / harvest / build); harvest splits into farm (a farm
 * field) and forage (wild food tile).
 */
export function villagerAnimState(u: any, state: any, moving: boolean, target?: any): VillagerAnim {
  if (u.hp <= 0) return "death";
  if (moving && (FLEE_TASKS.has(u.task) || u.fleeing)) return "flee";
  if (u.task === "return" && u.carryAmt > 0) return "carry_walk";
  if (moving) return u.carryAmt > 0 && u.task !== "gather" && u.task !== "hunt" ? "carry_walk" : "walk";
  if (u.task === "attack" && target && (target.hp ?? 1) > 0) return "attack";
  if (u.task === "hunt" && u.huntBusy) return "hunt";
  const style: string = u.workStyle || "idle";
  if (style === "chop" || style === "mine" || style === "build") return style;
  if (style === "harvest") {
    const tt = u.targetTile;
    const farm = tt && (state?.buildings || []).some((b: any) => b.type === "farm" && tt.tx >= b.tx && tt.ty >= b.ty && tt.tx < b.tx + (b.w ?? b.size ?? 1) && tt.ty < b.ty + (b.h ?? b.size ?? 1));
    return farm ? "farm" : "forage";
  }
  return "idle";
}

/** Which carry bundle to show: meat from a hunt, rice sheaf from a farm, fruit basket from foraging, else the resource. */
function carryKind(u: any, r: Rig): string {
  const type = u.carryType || "wood";
  if (type !== "food") return type;
  if (u.huntId != null) return "meat";
  return r.foodSrc === "forage" ? "fruit" : "food";
}

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
        const tx = target.x !== undefined ? target.x : target.tx + (target.w ?? target.size ?? 1) / 2;
        const tz = target.y !== undefined && target.x !== undefined ? target.y : target.ty + (target.h ?? target.size ?? 1) / 2;
        want = Math.atan2(tx - u.x, tz - u.y);
      } else if (u.type === "villager" && u.workStyle && u.workStyle !== "idle" && u.targetTile) {
        want = Math.atan2(u.targetTile.tx + 0.5 - u.x, u.targetTile.ty + 0.5 - u.y);
      } else if (u.type === "villager" && u.task === "hunt" && u.huntFace) {
        want = Math.atan2(u.huntFace.x - u.x, u.huntFace.y - u.y);
      } else if (u.type === "healer" && r.heal > 0) {
        // face the nearest wounded ally inside the 4.5-tile heal radius (render-only lookup)
        let best = 4.5 * 4.5, px = 0, pz = 0, found = false;
        for (const o of state.units) {
          if (o === u || o.team !== u.team || o.hp <= 0 || o.hp >= o.maxHp || o.garrisoned) continue;
          const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
          if (d <= best) { best = d; px = o.x; pz = o.y; found = true; }
        }
        if (found) want = Math.atan2(px - u.x, pz - u.y);
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
        r.healthFill.material.color.set(healthColor(u));
      }

      const dist = camera.position.distanceToSquared(r.root.position);
      if (t >= r.nextPose || r.ring.visible) {
        const elapsed = r.lastPose === 0 ? dt : Math.min(0.12, t - r.lastPose);
        r.lastPose = t;
        r.nextPose = t + (dist > 1600 ? 0.063 : dist > 500 ? 0.033 : 0);
        if (naval) fxGuard("naval-anim", () => this.animateShip(r!, u, state, t, elapsed, moving, speed));
        else {
          const rig = r;
          fxGuard("unit-anim", () => this.animate(rig, u, state, t, elapsed, moving, speed, target));
        }
        const pose = u.hp <= 0 ? "die" : moving ? (speed > 2.35 ? "run" : "walk")
          : u.task === "attack" || u.task === "hunt" ? "attack"
          : u.task === "build" ? "build" : u.task === "gather" ? "gather" : "idle";
        r.model?.update(elapsed, pose, shadows);
      }
    }

    this.updateAnimals(state, t, dt, fogAt, shadows);

    for (const [r, end] of this.dying) {
      if (r.deathT0 !== undefined && t < end) { fxGuard("unit-death", () => this.stepDeath(r, t)); continue; }
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
      } else if (!(r.root.visible && !r.model?.loaded && this.startDeath(r, t))) this.disposeRig(r);
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
      const rig = r;
      fxGuard("wildlife-anim", () => this.animateAnimal(rig, a, t, dt, moving, speed));
      // carcass: topple onto its side and shrink as the meat is harvested
      const target = a.dead ? 1 : 0;
      r.dead += (target - r.dead) * Math.min(1, dt * 5);
      r.body.rotation.z = r.dead * 1.45;
      const meat = a.dead ? 0.55 + 0.45 * Math.max(0, (a.food ?? 0) / (a.maxFood || (a.type === "deer" ? 140 : 240))) : 1;
      r.root.scale.setScalar(meat);
      r.model?.update(dt, a.dead ? "die" : moving ? (speed > 1.5 ? "run" : "walk")
        : a.aggroId != null ? "attack" : "idle", shadows);
    }
    for (const [id, r] of this.animals) {
      if (seenA.has(id)) continue;
      this.disposeRig(r);
      this.animals.delete(id);
    }
  }

  /** Low-poly wildlife joints: walk / flee gait with knees, grazing neck, tail flick, ear flap, trunk sway, charge lunge. */
  private animateAnimal(r: AnimalRig, a: any, t: number, dt: number, moving: boolean, speed: number): void {
    const fleeing = moving && speed > 1.5;
    const attacking = !a.dead && a.aggroId != null;
    const elephant = r.type === "elephant", cat = r.type === "lion" || r.type === "tiger";
    const herbivore = r.type === "deer" || r.type === "goat" || r.type === "cattle" || r.type === "buffalo";
    r.walk += dt * (moving ? 5 + speed * 3.2 : 0);
    const amp = moving ? Math.min(0.9, 0.3 + speed * 0.2) * (elephant ? 0.55 : 1) : 0;
    r.legs.forEach((l, i) => {
      // trot / walk: diagonal pairs; a fleeing deer or goat bounds with front and hind pairs together
      const bound = fleeing && (r.type === "deer" || r.type === "goat");
      const ph = r.walk + (bound ? (i < 2 ? 0 : Math.PI) : (i === 0 || i === 3 ? 0 : Math.PI));
      l.rotation.x = moving ? Math.sin(ph) * amp : 0;
      const knee = r.knees[i];
      if (knee) knee.rotation.x = moving ? Math.max(0, -Math.cos(ph)) * amp * 0.9 * (i < 2 ? 1 : -1) : 0;
    });
    const grazing = !a.dead && !moving && !attacking && herbivore && Math.sin(t * 0.45 + a.id * 1.7) > -0.1;
    let neckTarget = r.neckRest;
    if (grazing) neckTarget = r.neckRest + 0.85;
    else if (fleeing) neckTarget = r.neckRest - 0.25;
    else if (attacking) neckTarget = r.neckRest + (cat ? 0.1 : 0.35);
    if (r.neck) r.neck.rotation.x += (neckTarget - r.neck.rotation.x) * Math.min(1, dt * 4);
    if (r.head) r.head.rotation.x = 1.15 - r.neckRest + (grazing ? Math.sin(t * 5 + a.id) * 0.08 : 0);
    if (r.tail) {
      const flag = fleeing && r.type === "deer"; // white tail flag raised while fleeing
      r.tail.rotation.x += ((flag ? -0.9 : cat && attacking ? -0.3 : 0.5 + Math.sin(t * 2 + a.id) * 0.08) - r.tail.rotation.x) * Math.min(1, dt * 6);
      r.tail.rotation.z = Math.sin(t * (moving ? 6 : 1.8) + a.id) * 0.25;
    }
    r.ears.forEach((e, i) => { const s = i === 0 ? -1 : 1; e.rotation.y = s * ((attacking ? 0.55 : 0) + Math.sin(t * 1.4 + a.id) * 0.2); });
    if (r.trunk.length) {
      const swing = attacking ? -0.45 : Math.sin(t * 1.6 + a.id) * 0.15;
      r.trunk.forEach((s, i) => { s.rotation.x = 0.15 + swing * (0.4 + i * 0.25); s.rotation.z = Math.sin(t * 1.1 + i) * 0.05; });
    }
    r.body.position.y = moving ? Math.abs(Math.sin(r.walk)) * (fleeing ? 0.06 : 0.015) : 0;
    // charge / bite lunge for boar, lion, cattle and elephant when standing at the target
    const lunge = attacking && !moving ? Math.max(0, Math.sin(t * 6 + a.id)) : 0;
    r.body.position.z = lunge * 0.04;
    r.body.rotation.x = attacking ? -0.06 - lunge * 0.06 : fleeing ? 0.04 : 0;
  }

  /** Ships: waterline bob/roll, speed-scaled wake, oars, mast lowering under bridges, per-type work / attack cues. */
  private animateShip(r: Rig, u: any, state: any, t: number, dt: number, moving: boolean, speed: number): void {
    const terrainAt = (x: number, z: number) => state.grid[Math.floor(z)]?.[Math.floor(x)]?.terrain;
    const aheadX = u.x + Math.sin(r.yaw) * 0.9, aheadZ = u.y + Math.cos(r.yaw) * 0.9;
    const bridge = terrainAt(u.x, u.y) === "bridge" || terrainAt(aheadX, aheadZ) === "bridge";
    r.sailK += ((bridge ? 1 : 0) - r.sailK) * Math.min(1, dt * 7);
    // mast folds aft and the sail furls so nothing pokes through the bridge deck
    if (r.tools.mast) r.tools.mast.rotation.x = -r.sailK * 1.4;
    if (r.tools.sail) r.tools.sail.scale.y = 1 - r.sailK * 0.8;
    r.body.position.y = Math.sin(t * 3 + u.x) * 0.022;
    r.body.rotation.z = Math.sin(t * 2 + u.y) * 0.035;
    r.body.rotation.x = -Math.min(0.05, speed * 0.02) + Math.sin(t * 2.4 + u.x) * 0.012;
    r.atk = Math.max(0, r.atk - dt * 2.2);
    const row = t * (moving ? 2.2 + speed * 2 : 0.8);
    for (const o of r.oars) { const side = o.position.x < 0 ? -1 : 1; o.rotation.y = side * Math.sin(row) * 0.35; o.rotation.z = side * Math.cos(row) * 0.12; }
    if (r.tools.ballista) r.tools.ballista.rotation.x = -r.atk * 0.3; // bow crossbow kicks as the arrow leaves (synced to projectile spawn)
    if (r.tools.net) {
      const fishing = u.task === "fish" && !moving;
      const target = fishing ? -1.25 + Math.sin(t * 1.5) * 0.06 : -0.35;
      r.tools.net.rotation.z += (target - r.tools.net.rotation.z) * Math.min(1, dt * 3);
    }
    if (r.tools.fish) r.tools.fish.visible = u.task === "return_fish" || (u.carryAmt ?? 0) > 0;
    if (r.tools.flame) {
      r.tools.flame.scale.set(1 + Math.sin(t * 17) * 0.1, 1 + Math.sin(t * 23 + 1) * 0.18, 1 + Math.sin(t * 19 + 2) * 0.1);
      r.tools.flameCore?.scale.setScalar(1 + Math.sin(t * 29) * 0.15);
      if (this.fx.rich && t >= r.lastPhase && r.tools.brazier) {
        r.lastPhase = t + 0.25;
        r.tools.brazier.getWorldPosition(this.tmp);
        this.fx.smoke.emit(this.tmp.x, this.tmp.y + 0.25, this.tmp.z, 0, 0.25, 0, 0.6, 0.45, 0x3a3430, 0, 1.2);
      }
    }
    if (moving && t >= r.dustT) {
      this.fx.ripple(u.x - Math.sin(r.yaw) * 0.46, WATER_LEVEL + 0.02, u.y - Math.cos(r.yaw) * 0.46);
      if (speed > 1.2) this.fx.ripple(u.x + Math.sin(r.yaw) * 0.5, WATER_LEVEL + 0.02, u.y + Math.cos(r.yaw) * 0.5);
      r.dustT = t + THREE.MathUtils.clamp(0.9 - speed * 0.25, 0.22, 0.7);
    }
  }

  private animate(r: Rig, u: any, state: any, t: number, dt: number, moving: boolean, speed: number, target: any): void {
    r.walk += dt * (moving ? 6 + speed * 5 : 0);
    const sw = moving ? Math.sin(r.walk) : 0;
    r.atk = Math.max(0, r.atk - dt * 2.2);
    const inMelee = u.task === "attack" && !moving && target && (target.hp ?? 1) > 0;
    const cooldown = u.atkCooldown ?? 0;
    const ability = (u.abilityTime ?? 0) > 0;
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
      case "villager": this.animVillager(r, u, state, moving, t, target); break;
      case "swordsman": case "spearman":
        if (inMelee) {
          const recover = smoothstep(0.05, 0.9, r.melee);
          const windup = smoothstep(0.73, 0.03, cooldown);
          const k = r.melee > 0 ? recover : 1 - windup;
          r.armR.rotation.x = r.type === "spearman" ? -1.2 + k * 0.4 : -2.3 + k * 2.1;
          if (r.type === "spearman") r.armR.position.z = k * 0.06;
          if (r.type === "swordsman") r.armL.rotation.x = -0.9; // shield up
        } else if (r.type === "spearman") {
          r.armR.rotation.x = -0.3 + sw * 0.2;
          r.armR.position.z = 0;
        }
        break;
      case "archer": {
        // full draw: bow arm extended, string hand pulled to the cheek, string bent back; release on projectile spawn
        const aiming = r.atk > 0 || inMelee;
        const draw = aiming ? smoothstep(0.8, 0.1, cooldown) * (1 - smoothstep(0.35, 1, r.atk)) : 0;
        if (aiming) { r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.2 - draw * 0.6; r.armR.rotation.z = draw * 0.35; }
        if (r.tools.string) r.tools.string.position.y = -draw * 0.08;
        break;
      }
      case "chuko_nu": {
        // repeating crossbow: lever pumps once per shot; Mưa Tên (0.5 s cooldown) pumps twice as fast
        const aiming = r.atk > 0 || inMelee;
        if (aiming) {
          r.armL.rotation.x = -1.35; r.armR.rotation.x = -1.35;
          const period = ability ? 0.5 : 1;
          const pump = Math.sin(THREE.MathUtils.clamp(1 - cooldown / period, 0, 1) * Math.PI);
          if (r.tools.lever) r.tools.lever.rotation.x = -pump * 0.9;
          r.body.rotation.x = -r.atk * 0.06; // recoil
        } else if (r.tools.lever) r.tools.lever.rotation.x = 0;
        break;
      }
      case "cavalry": case "horse_archer": {
        // stride follows the real ground speed, so Phi Mã (faster) visibly gallops harder
        const gal = moving ? r.walk * 1.4 : 0;
        r.legs4.forEach((l, i) => {
          const ph = gal + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6;
          l.rotation.x = moving ? Math.sin(ph) * 0.7 : 0;
          const knee = r.knees[i];
          if (knee) knee.rotation.x = moving ? Math.max(0, -Math.cos(ph)) * 0.9 * (i < 2 ? 1 : -1) : 0;
        });
        r.body.position.y = moving ? Math.abs(Math.sin(gal)) * 0.05 : 0;
        r.body.rotation.x = moving ? Math.sin(gal) * 0.05 + (ability ? 0.05 : 0) : 0;
        if (r.tools.neck) r.tools.neck.rotation.x = 0.55 + (moving ? Math.sin(gal * 2) * 0.08 + (speed > 2 ? 0.15 : 0) : Math.sin(t * 0.7 + u.id) * 0.05);
        if (r.tools.tail) { r.tools.tail.rotation.x = -0.45 - (moving ? 0.5 : 0) + Math.sin(t * 2 + u.id) * 0.08; r.tools.tail.rotation.z = Math.sin(t * (moving ? 7 : 1.6)) * 0.15; }
        if (r.tools.cape) r.tools.cape.rotation.x = 0.25 + (moving ? 0.45 + Math.sin(t * 9) * 0.08 : Math.sin(t * 1.5) * 0.04);
        if (r.type === "cavalry" && inMelee) r.armR.rotation.x = -0.6 + smoothstep(0.05, 0.9, r.melee) * 0.5;
        if (r.type === "horse_archer" && (r.atk > 0 || inMelee)) {
          const draw = smoothstep(0.8, 0.05, cooldown) * (1 - r.atk);
          r.armL.rotation.x = -1.5; r.armR.rotation.x = -1.2 - draw * 0.54;
          if (r.tools.string) r.tools.string.position.y = -draw * 0.06;
        } else if (r.tools.string) r.tools.string.position.y = 0;
        break;
      }
      case "war_elephant": {
        // Xung Phong: ears flared, trunk curled up, head down and a heavier, faster stride
        const st = moving ? r.walk * (ability ? 0.95 : 0.7) : 0;
        r.legs4.forEach((l, i) => {
          const ph = st + ((i === 0 || i === 3) ? 0 : Math.PI);
          l.rotation.x = moving ? Math.sin(ph) * (ability ? 0.5 : 0.35) : 0;
          const knee = r.knees[i];
          if (knee) knee.rotation.x = moving ? Math.max(0, -Math.cos(ph)) * 0.45 * (i < 2 ? 1 : -1) : 0;
        });
        r.body.position.y = moving ? Math.abs(Math.sin(st)) * 0.03 : 0;
        r.body.rotation.x = ability ? 0.07 : 0;
        const charge = ability ? 1 : 0;
        const swing = inMelee ? smoothstep(0.05, 0.9, r.melee) * 0.6 : Math.sin(t * 1.8 + u.id) * 0.18;
        r.trunk.forEach((s, i) => { s.rotation.x = charge ? -0.55 - i * 0.1 : swing * (0.5 + i * 0.25) + (i === 0 ? 0.2 : 0.12); s.rotation.z = Math.sin(t * 1.3 + i) * 0.06; });
        const flap = Math.sin(t * (ability ? 6 : 1.3) + u.id) * (ability ? 0.12 : 0.18);
        if (r.tools.earL) r.tools.earL.rotation.y = -(charge * 0.7 + flap);
        if (r.tools.earR) r.tools.earR.rotation.y = charge * 0.7 + flap;
        if (inMelee || ability) r.armR.rotation.x = -1.3 + smoothstep(0.05, 0.9, r.melee) * 0.8;
        break;
      }
      case "catapult": {
        // wheels roll by distance travelled (arc length / radius)
        const roll = (speed * dt) / (0.08 * MOUNT_SCALE);
        for (const w of r.wheels) w.rotation.x += moving ? roll : 0;
        if (r.arm) {
          // r.atk = 1 on the frame the boulder spawns: fast fling, then slow rewind
          const a = r.atk;
          const fling = a > 0.82 ? (1 - a) / 0.18 : a / 0.82;
          r.arm.rotation.x = -0.9 + Math.min(1, fling) * 1.9;
        }
        break;
      }
      case "healer": {
        // a heal pulse in the sim (healPulse changes) keeps the channel pose alive for half a second
        const pulse = u.healPulse;
        if (pulse !== undefined && !Number.isNaN(r.prevHeal) && pulse !== r.prevHeal) r.heal = 0.5;
        r.prevHeal = pulse ?? NaN;
        r.heal = Math.max(0, r.heal - dt);
        if (r.heal > 0 && !moving) {
          r.armR.rotation.x = -2.1 + Math.sin(t * 6) * 0.12; // staff raised toward the patient
          r.armL.rotation.x = -1.0; r.armL.rotation.z = -0.3 + Math.sin(t * 4) * 0.1;
          r.body.rotation.x = -0.04;
        }
        break;
      }
    }
  }

  private animVillager(r: Rig, u: any, state: any, moving: boolean, t: number, target: any): void {
    const anim = villagerAnimState(u, state, moving, target);
    r.anim = anim;
    const phase = u.workPhase || 0, k = phase / TAU;
    // slow wind-up, fast strike that lands as the phase wraps (same moment the 2D sim plays the hit)
    const strike = smoothstep(0.08, 0.72, k) * (1 - smoothstep(0.72, 0.98, k));
    const cooldown = u.atkCooldown ?? 0;
    const thrust = smoothstep(0.62, 0.02, cooldown) - smoothstep(0.67, 0.97, cooldown) * 0.8;
    const sw = moving ? Math.sin(r.walk) : 0;
    const huntA = anim === "hunt" ? findAnimalById(state, u.huntId) : null;
    const butcher = anim === "hunt" && !!huntA?.dead;

    // --- held tool (right hand) + off-hand basket
    const toolKey = VILLAGER_TOOL[anim] === "spear" && butcher ? "knife" : VILLAGER_TOOL[anim] ?? "";
    for (const key in r.tools) r.tools[key].visible = key === toolKey || (key === "basket" && anim === "forage");
    // --- carried load: wood / rice sheaf / fruit basket / ore / meat
    if (anim === "farm" || anim === "forage") r.foodSrc = anim;
    const load = anim === "carry_walk" ? carryKind(u, r) : "";
    for (const key in r.carry) r.carry[key].visible = key === load;

    r.body.rotation.y = 0; r.body.rotation.z = 0; r.armR.rotation.z = 0; r.armL.rotation.z = 0;
    switch (anim) {
      case "idle": {
        // slow breathing and a gentle look-around
        const br = Math.sin(t * 1.9 + u.id);
        r.body.position.y = br * 0.004;
        r.body.rotation.y = Math.sin(t * 0.45 + u.id * 1.7) * 0.22;
        r.armL.rotation.x = 0.04 + br * 0.03; r.armR.rotation.x = 0.04 - br * 0.03;
        r.armL.rotation.z = 0.06; r.armR.rotation.z = -0.06;
        break;
      }
      case "walk":
        r.armL.rotation.x = -sw * 0.55; r.armR.rotation.x = sw * 0.55;
        r.body.rotation.y = sw * 0.06;
        break;
      case "carry_walk":
        if (load === "wood" || load === "meat" || load === "food") { r.armR.rotation.x = -2.6; r.armR.rotation.z = 0.25; r.armL.rotation.x = -sw * 0.35; }
        else if (load === "fruit") { r.armL.rotation.x = -1.05; r.armR.rotation.x = -1.05; r.armL.rotation.z = -0.35; r.armR.rotation.z = 0.35; }
        else { r.armL.rotation.x = -0.6; r.armR.rotation.x = -0.6; r.body.rotation.x = 0.12; } // ore basket: lean into the straps
        if (r.legL && r.legR) { r.legL.rotation.x *= 0.8; r.legR.rotation.x *= 0.8; } // shorter, heavier steps
        r.body.position.y = moving ? Math.abs(Math.sin(r.walk)) * 0.012 : 0;
        break;
      case "chop": r.armR.rotation.x = -0.3 - strike * 2.3; r.armL.rotation.x = -0.4 - strike * 1.6; r.body.rotation.x = (1 - strike) * 0.15; r.body.rotation.y = (1 - strike) * 0.25; break;
      case "mine": r.armR.rotation.x = -0.4 - strike * 2.7; r.armL.rotation.x = -0.4 - strike * 2.4; r.body.rotation.x = (1 - strike) * 0.22; break;
      case "farm": // gặt lúa: deep bow, sickle sweeps low across the paddy
        r.armR.rotation.x = -1.1; r.armR.rotation.y = (strike - 0.5) * 1.6; r.armL.rotation.x = -0.9 + strike * 0.3; r.body.rotation.x = 0.42;
        break;
      case "forage": { // hái quả: alternate hands reach up into the bush, basket held low on the left arm
        const reach = Math.sin(phase * 2) * 0.5 + 0.5;
        r.armR.rotation.x = -1.6 - reach * 0.9; r.armL.rotation.x = -0.75; r.armL.rotation.z = 0.25;
        r.body.rotation.x = -0.05 + (1 - reach) * 0.12; r.body.rotation.y = (reach - 0.5) * 0.3;
        break;
      }
      case "hunt":
        if (butcher) { // kneel over the carcass and work the knife
          r.body.rotation.x = 0.62; r.body.position.y = -0.05;
          r.armR.rotation.x = -0.9 - strike * 0.7; r.armL.rotation.x = -0.8;
          if (r.legL && r.legR) { r.legL.rotation.x = -1.2; r.legR.rotation.x = 0.35; }
        } else { // spear thrust / throw at the living animal
          r.armL.rotation.x = -0.94; r.armR.rotation.x = -1.44 + thrust * 0.65; r.body.rotation.x = 0.05 - thrust * 0.16;
          if (r.legL && r.legR) { r.legL.rotation.x = -0.35; r.legR.rotation.x = 0.25; }
        }
        break;
      case "build": r.armR.rotation.x = -0.5 - strike * 1.8; r.armL.rotation.x = -0.5; r.body.rotation.x = 0.1; break;
      case "attack": { // self-defence: overhead swing with the axe, timed on the attack cooldown like soldiers
        const sws = Math.max(r.melee, thrust);
        r.armR.rotation.x = -2.4 + sws * 2.0; r.armL.rotation.x = -0.6; r.body.rotation.x = -0.06 + sws * 0.2;
        if (r.legL && r.legR) { r.legL.rotation.x = -0.3; r.legR.rotation.x = 0.3; }
        break;
      }
      case "flee": // sprint: forward lean, pumping arms, longer stride
        r.body.rotation.x = 0.2;
        r.armL.rotation.x = -sw * 1.1 - 0.3; r.armR.rotation.x = sw * 1.1 - 0.3;
        if (r.legL && r.legR) { r.legL.rotation.x = sw * 0.95; r.legR.rotation.x = -sw * 0.95; }
        r.body.position.y = Math.abs(Math.sin(r.walk)) * 0.035;
        break;
      case "death": break; // the rig is dropped from state.units on death; startDeath() plays the fall + fade
    }

    const fxStyle = anim === "farm" || anim === "forage" ? "harvest" : anim;
    if (anim === "chop" || anim === "mine" || anim === "farm" || anim === "forage" || anim === "build") {
      if (phase < r.lastPhase) this.strikeFx(r, u, state, fxStyle);
      r.lastPhase = phase;
    } else r.lastPhase = 0;
  }

  /** Procedural death (no glTF clip): topple over, then fade out and sink. Materials are cloned per rig so the fade never touches shared ones. */
  private startDeath(r: Rig, t: number): boolean {
    if (!r.legL || this.dying.size >= 20) return false;
    const clones = new Map<THREE.Material, THREE.Material>();
    r.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const swap = (mt: THREE.Material) => {
        let c = clones.get(mt);
        if (!c) { c = mt.clone(); c.transparent = true; c.userData.sharedTexture = true; clones.set(mt, c); }
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
    r.ring.visible = r.health.visible = false;
    r.deathT0 = t; r.deathMats = [...clones.values()];
    r.deathSide = hash2(r.root.position.x * 3.1, r.root.position.z * 1.7) > 0.5 ? 1 : -1;
    this.dying.set(r, t + DEATH_TIME);
    return true;
  }

  private stepDeath(r: Rig, t: number): void {
    const e = t - (r.deathT0 ?? t), k = Math.min(1, e / 0.55);
    const fall = k * k * (3 - 2 * k);
    r.body.rotation.x = -fall * 1.42;              // collapses backwards…
    r.body.rotation.z = fall * 0.22 * (r.deathSide ?? 1);
    r.body.position.y = fall * 0.04;
    r.armL.rotation.x = -fall * 2.2; r.armR.rotation.x = -fall * 1.7;
    if (r.legL && r.legR) { r.legL.rotation.x = -fall * 0.4; r.legR.rotation.x = fall * 0.15; }
    const fade = THREE.MathUtils.clamp((e - 1.0) / (DEATH_TIME - 1.0), 0, 1); // …lies still, then fades and sinks
    for (const m of r.deathMats ?? []) m.opacity = 1 - fade;
    r.body.position.y -= fade * 0.06;
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
