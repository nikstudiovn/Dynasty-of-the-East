import { healthColor } from "../ui/battleStatus";
// Dynasty of the East 3D — procedural animated units, villager work actions, selection rings and 3D projectiles.
import type { ModelRegistry, ModelVisual } from "./modelRegistry";
import { fcx, fcy, fw, fh } from "../sim/footprint";
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
  root: THREE.Group; body: THREE.Group; armL: THREE.Group; armR: THREE.Group; head?: THREE.Group;
  gait?: number; stride?: number;
  villagePose?: Float32Array;
  elbowL?: THREE.Group; elbowR?: THREE.Group;
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
interface HumanOpts { armor?: Armor; legs?: boolean; head?: Headgear; robe?: boolean; accent?: string; helmetTint?: string }

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
    const s = steel(o.helmetTint);
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
  } else if (faction === "goryeo") {
parent.add(mesh(sphere(0.068, 9, 6), dark, 0, 0.47, -0.006));
parent.add(mesh(cyl(0.056, 0.056, 0.065, 10), cloth("#2e3542"), 0, 0.515, 0, false));
if (civilian) parent.add(mesh(cyl(0.125, 0.125, 0.008, 14), cloth("#1e232c"), 0, 0.495, 0, false));
else parent.add(mesh(cyl(0.088, 0.095, 0.014, 12), steel(PAL.steelDark), 0, 0.485, 0, false));
parent.add(mesh(box(0.174, 0.018, 0.118), cloth("#4a627d"), 0, 0.252, 0, false));
} else if (faction === "fuso") {
parent.add(mesh(sphere(0.066, 9, 6), dark, 0, 0.468, -0.008));
if (civilian) parent.add(mesh(cone(0.135, 0.055, 12), mat("#5a4d3a", { surface: "thatch", rough: 0.78 }), 0, 0.518, 0));
else {
parent.add(mesh(cone(0.118, 0.048, 12), steel("#262b38"), 0, 0.515, 0));
parent.add(mesh(box(0.028, 0.012, 0.008), cloth("#c8ccd4"), 0, 0.512, 0.082, false));
}
parent.add(mesh(box(0.176, 0.022, 0.118), cloth("#2b3654"), 0, 0.248, 0, false));
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

const VILLAGER_CLOTH: Record<Faction, string> = {
  dai_viet: "#48382f", trung_nguyen: "#777063", bac_cuong: "#756343",
  goryeo: "#d1c3a6", fuso: "#38475f",
};

function taperedPart(top: number, bottom: number, length: number, depth: number, material: THREE.Material, y: number): THREE.Mesh {
  const part = mesh(cyl(top, bottom, length, 8), material, 0, y, 0);
  part.scale.z = depth;
  return part;
}

function civilianRig(r: Rig, team: string): void {
  const faction = r.faction, body = r.body;
  const fabric = cloth(VILLAGER_CLOTH[faction]), darker = cloth(shade(VILLAGER_CLOTH[faction], -0.25));
  const indigo = cloth("#303641"), skin = skinM(), hair = cloth("#302720");
  const sash = cloth(mute(team, 0.45)), felt = fur("#bba686"), straw = pbr("mat_bamboo", "#dbc396");
  body.add(taperedPart(0.105, 0.083, 0.16, 0.65, fabric, 0.28));
  body.add(taperedPart(0.082, 0.1, faction === "dai_viet" ? 0.065 : 0.105, 0.68, darker, 0.184));
  body.add(taperedPart(0.091, 0.092, faction === "dai_viet" ? 0.012 : 0.028, 0.74, sash, 0.227));
  if (faction !== "dai_viet" && faction !== "bac_cuong") {
    const collar = mesh(box(0.025, 0.12, 0.012), faction === "fuso" ? indigo : cloth("#bcb09c"), 0.012, 0.313, 0.064, false);
    collar.rotation.z = -0.57;
    body.add(collar);
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.046, 0.175, 0);
    leg.add(taperedPart(0.043, 0.035, 0.112, 0.9, indigo, -0.057));
    leg.add(taperedPart(0.032, 0.027, 0.054, 0.85, faction === "dai_viet" ? skin : darker, -0.137));
    const shoe = mesh(sphere(0.5, 8, 5), faction === "dai_viet" ? skin : leather("#3b3027"), 0, -0.158, 0.018);
    shoe.scale.set(0.065, 0.035, 0.09);
    leg.add(shoe);
    body.add(leg);
    const arm = new THREE.Group(), elbow = new THREE.Group();
    arm.position.set(side * 0.092, 0.352, 0);
    elbow.position.y = -0.091;
    arm.add(taperedPart(0.039, 0.029, 0.097, 0.86, fabric, -0.045), elbow);
    elbow.add(taperedPart(0.03, 0.023, 0.064, 0.84, darker, -0.029));
    elbow.add(mesh(sphere(0.024, 8, 5), skin, 0, -0.074, 0));
    if (side < 0) { r.legL = leg; r.armL = arm; r.elbowL = elbow; }
    else { r.legR = leg; r.armR = arm; r.elbowR = elbow; }
    body.add(arm);
  }
  const head = mesh(sphere(0.5, 10, 7), skin, 0, 0.444, 0.008);
  head.scale.set(0.134, 0.155, 0.13);
  body.add(head, mesh(sphere(0.062, 9, 6), hair, 0, 0.479, -0.014));
  for (const side of [-1, 1]) body.add(mesh(sphere(0.005, 5, 4), hair, side * 0.024, 0.45, 0.069, false));
  if (faction === "dai_viet" || faction === "goryeo") {
    body.add(mesh(cone(faction === "dai_viet" ? 0.145 : 0.128, 0.093, 12), straw, 0, 0.54, 0));
    for (const side of [-1, 1]) {
      const strap = mesh(box(0.006, 0.078, 0.006), darker, side * 0.052, 0.459, 0.042, false);
      strap.rotation.z = -side * 0.42;
      body.add(strap);
    }
  } else if (faction === "trung_nguyen") {
    body.add(mesh(sphere(0.073, 9, 6), darker, 0, 0.509, -0.012));
    body.add(mesh(cyl(0.07, 0.074, 0.017, 10), cloth("#a29582"), 0, 0.492, 0));
    body.add(mesh(sphere(0.027, 8, 5), hair, 0, 0.563, -0.029));
  } else if (faction === "bac_cuong") {
    body.add(mesh(cone(0.077, 0.091, 9), darker, 0, 0.547, -0.008));
    body.add(mesh(cyl(0.087, 0.085, 0.029, 10), felt, 0, 0.514, 0));
    body.add(taperedPart(0.072, 0.096, 0.033, 0.81, felt, 0.355));
    for (const side of [-1, 1]) {
      const flap = mesh(sphere(0.5, 8, 5), felt, side * 0.069, 0.466, -0.012);
      flap.scale.set(0.04, 0.093, 0.063);
      body.add(flap);
    }
  } else {
    body.add(mesh(cyl(0.087, 0.128, 0.05, 12), straw, 0, 0.533, 0));
    body.add(mesh(box(0.048, 0.012, 0.012), cloth("#dfd0b5"), 0, 0.226, 0.074, false));
  }
}

function hand(arm: THREE.Group, obj: THREE.Object3D, offset = -0.18): THREE.Object3D { obj.position.y = offset; arm.add(obj); return obj; }

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
/** Preview of the Đại Việt reference: rounded leaf plates, a bronze finial and dark horse tack. */
/** Batch the decorative plates on one rigid part without changing its animation hierarchy. */
function addArmorPlates(parent: THREE.Group, plates: THREE.Mesh[]): void {
  const layers = new Map<THREE.Material, THREE.Mesh[]>();
  for (const plate of plates) {
    const material = plate.material as THREE.Material;
    const layer = layers.get(material);
    if (layer) layer.push(plate);
    else layers.set(material, [plate]);
  }
  for (const [material, layer] of layers) {
    const batch = new THREE.InstancedMesh(layer[0].geometry, material, layer.length);
    layer.forEach((plate, index) => {
      plate.updateMatrix();
      batch.setMatrixAt(index, plate.matrix);
    });
    parent.add(batch);
  }
}

function vietLeafArmor(rider: THREE.Group): void {
  const rim = pbr("mat_bronze", "#c98d58");
  const dark = steel("#434348");
  const leaves = [pbr("mat_bronze", "#8b7057"), pbr("mat_bronze", "#aa8868"), steel("#84746b")];
  const plates: THREE.Mesh[] = [];
  const plate = geo("viet-cavalry-leaf", () => {
    const shape = new THREE.Shape();
    shape.moveTo(-.013, .011); shape.lineTo(.013, .011);
    shape.lineTo(.012, -.004); shape.quadraticCurveTo(0, -.023, -.012, -.004);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: .003, bevelEnabled: false, curveSegments: 3 });
  });
  for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
    const x = (col - 2.5) * .024 + (row % 2 ? .005 : 0);
    const leaf = mesh(plate, leaves[(row + col) % leaves.length], x, .352 - row * .025, .063 - Math.abs(x) * .14, false);
    leaf.rotation.y = x * 4;
    plates.push(leaf);
  }
  rider.add(mesh(box(.175,.03,.127), rim, 0,.229,0,false), mesh(sphere(.023,8,5), rim, 0,.23,.073,false));
  for (const side of [-1,1]) {
    for (let level = 0; level < 3; level++) {
      const shoulder = mesh(box(.078,.02,.105), leaves[level], side*(.094 + .007*level), .378-level*.021, 0);
      shoulder.rotation.z = -side*.25;
      rider.add(shoulder);
    }
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      const skirt = mesh(plate, leaves[(row + col) % 3], side*(.073 + col*.026), .204-row*.022, .062);
      skirt.rotation.y = side*.45;
      plates.push(skirt);
    }
    for (let level = 0; level < 3; level++) {
      rider.add(mesh(box(.015,.018,.058), dark, side*.067,.456-level*.018,-.012,false));
    }
  }
  addArmorPlates(rider, plates);
  rider.add(mesh(cyl(.083,.086,.012,12), rim, 0,.475,0,false));
  rider.add(mesh(cone(.014,.062,6),rim,0,.569,0,false));
  const helmetBand = mesh(box(.012,.073,.016), rim,0,.511,.061,false);
  helmetBand.rotation.x = -.34;
  rider.add(helmetBand);
}

const MOUNT_STYLE: Record<Faction, { coat: string; armor: Armor; tunic: string; helmet: string }> = {
  dai_viet: { coat: "#74492f", armor: "none", tunic: "#46342c", helmet: "#57545b" },
  trung_nguyen: { coat: "#777e85", armor: "lamellar", tunic: "#525a58", helmet: "#7c858c" },
  bac_cuong: { coat: "#795434", armor: "leather", tunic: "#665738", helmet: "#7b7363" },
  goryeo: { coat: "#343539", armor: "scale", tunic: "#464d54", helmet: "#626c78" },
  fuso: { coat: "#28272a", armor: "scale", tunic: "#343850", helmet: "#353b50" },
};

function mountBarding(parent: THREE.Group, faction: Faction, team: string): void {
  const frame = faction === "fuso" ? steel("#626c85") : steel("#939798");
  const dark = faction === "fuso" ? cloth("#363953") : steel("#4c555d");
  if (faction === "bac_cuong") {
    for (const side of [-1, 1]) {
      const strap = mesh(box(0.013, 0.145, 0.024), leather("#8e6441"), side * 0.079, 0.312, 0.126, false);
      strap.rotation.x = -0.65;
      parent.add(strap);
    }
    return;
  }
  const plates: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const flap = mesh(box(0.018, 0.12, 0.22), dark, side * 0.088, 0.323, -0.044);
    flap.rotation.z = side * 0.16;
    parent.add(flap);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const plate = mesh(box(0.012, 0.04, 0.046), (col + row) % 3 === 0 ? dark : frame,
          side * (0.094 + row * 0.004), 0.358 - row * 0.035, -0.12 + col * 0.047, false);
        plate.rotation.z = side * (faction === "goryeo" ? 0.28 : 0.12);
        plates.push(plate);
      }
    }
  }
  addArmorPlates(parent, plates);
  const chest = taperedPart(0.077, 0.1, 0.125, 0.34, dark, 0.26);
  chest.position.z = 0.18;
  parent.add(chest);
  parent.add(mesh(box(0.14, 0.016, 0.03), cloth(team), 0, 0.314, 0.191, false));
}

function riderDetails(rider: THREE.Group, faction: Faction): void {
  if (faction === "dai_viet") {
    vietLeafArmor(rider);
  } else if (faction === "fuso") {
    const crest = mesh(geo("fuso-mounted-crest", () => new THREE.TorusGeometry(0.049, 0.009, 4, 12, Math.PI)),
      steel("#d5ccac"), 0, 0.518, 0.071);
    crest.rotation.z = Math.PI;
    rider.add(crest);
  } else if (faction === "bac_cuong") {
    const shield = mesh(cyl(0.078, 0.075, 0.019, 12), leather("#74543c"), -0.14, 0.25, 0.025);
    shield.rotation.z = Math.PI / 2;
    rider.add(shield, mesh(sphere(0.026, 8, 5), steel(), -0.147, 0.25, 0.025, false));
  } else {
    const layered = faction === "goryeo" ? steel("#7d8792") : steel("#919aa0");
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      const layer = mesh(box(0.067, 0.035, 0.087), layered, side * (0.095 + row * 0.006), 0.347 - row * 0.026, 0.002, false);
      layer.rotation.z = -side * 0.33;
      rider.add(layer);
    }
  }
}

function seatedLeg(rider: THREE.Group, side: number): THREE.Group {
  const hip = new THREE.Group(), shin = new THREE.Group();
  hip.position.set(side * 0.079, 0.197, 0);
  hip.rotation.z = side * 0.36;
  hip.add(taperedPart(0.04, 0.032, 0.1, 0.9, cloth(PANTS), -0.043), shin);
  shin.position.set(0, -0.086, 0.019);
  shin.rotation.x = 0.24;
  shin.add(taperedPart(0.029, 0.023, 0.105, 0.83, leather(PAL.leatherDark), -0.048));
  shin.add(mesh(box(0.046, 0.03, 0.077), leather(PAL.leatherDark), 0, -0.097, 0.02));
  const stirrup = mesh(geo("mounted-stirrup", () => new THREE.TorusGeometry(0.029, 0.004, 4, 8)), steel(), side * 0.006, -0.092, 0.02, false);
  stirrup.rotation.y = Math.PI / 2;
  shin.add(stirrup);
  rider.add(hip);
  return hip;
}

function horse(r: Rig, parent: THREE.Group, team: string, steppe: boolean): THREE.Group {
  const viet = r.faction === "dai_viet" && !steppe;
  const coat = steppe ? "#9a7b55" : MOUNT_STYLE[r.faction].coat, hm = fur(coat), dm = fur(shade(coat, -0.45)), hoofM = hide("#2b2420");
  const h = new THREE.Group();
  if (steppe) h.scale.setScalar(0.9);
  const torso = mesh(sphere(0.5, 10, 7), hm, 0, 0.31, 0); torso.scale.set(0.18, 0.18, 0.46); h.add(torso);
  const neck = new THREE.Group(); neck.position.set(0, 0.36, 0.17); neck.rotation.x = 0.55; h.add(neck);
  {
    const muscle = mesh(sphere(.5, 8, 5), hm, 0,.103,-.007);
    muscle.scale.set(.113,.27,.148);
    neck.add(muscle);
  }
  for (let k = 0; k < 4; k++) neck.add(mesh(box(0.025, 0.06, 0.045), dm, 0, 0.03 + k * 0.05, -0.05, false)); // mane
  const head = new THREE.Group(); head.position.set(0, 0.21, 0); head.rotation.x = 0.05; neck.add(head);
  {
    const skull = mesh(sphere(.5, 8, 5), hm, 0,.005,.048);
    skull.scale.set(.102,.093,.159);
    const muzzle = mesh(sphere(.5, 8, 5), dm, 0,-.017,.139);
    muzzle.scale.set(.077,.066,.08);
    head.add(skull,muzzle);
  }
  for (const s of [-1, 1]) head.add(mesh(cone(0.015, 0.05, 4), hm, s * 0.025, 0.06, -0.01, false));
  if (viet) {
    const rim = pbr("mat_bronze", "#c58b58"), lacquer = steel("#262329");
    const facePlate = mesh(geo("viet-horse-faceplate", () => {
      const shape = new THREE.Shape();
      shape.moveTo(-.034,.050); shape.lineTo(.034,.050); shape.lineTo(.028,-.039);
      shape.lineTo(0,-.058); shape.lineTo(-.028,-.039); shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: .008, bevelEnabled: false });
    }), rim, 0,.030,.146);
    facePlate.rotation.x = .78;
    head.add(facePlate);
    const noseBand = mesh(box(.086,.015,.028), lacquer,0,-.016,.141,false);
    head.add(noseBand);
    for (const side of [-1,1]) {
      const tack = mesh(box(.009,.02,.126), leather("#75513c"),side*.044,.006,.048,false);
      tack.rotation.x = -.14;
      head.add(tack, mesh(sphere(.008,7,5), lacquer,side*.041,.028,.053,false));
    }
    const breastplate = mesh(geo("viet-horse-breastplate", () => {
      const shape = new THREE.Shape();
      shape.moveTo(-.116,.091); shape.quadraticCurveTo(0,.055,.116,.091);
      shape.lineTo(.099,-.085); shape.quadraticCurveTo(0,-.147,-.099,-.085);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false,curveSegments:5});
    }),rim,0,.267,.169);
    h.add(breastplate);
    const inner = new THREE.Mesh(breastplate.geometry, lacquer);
    inner.position.set(0,.268,.182); inner.scale.set(.88,.86,1); h.add(inner);
    h.add(mesh(box(.017,.144,.01), rim,0,.261,.197,false));
    for(const side of [-1,1]){
      const clothFlap = mesh(box(.018,.117,.194), cloth(shade(team,-.14)),side*.092,.355,-.035);
      clothFlap.rotation.z = side*.20;
      h.add(clothFlap,mesh(box(.017,.02,.16),rim,side*.104,.306,-.033,false));
    }
  }
  if (!viet) {
    for (const side of [-1, 1]) {
      head.add(mesh(box(0.009, 0.014, 0.11), leather(), side * 0.043, -0.012, 0.051, false));
      head.add(mesh(sphere(0.007, 6, 4), hide("#211b18"), side * 0.045, 0.019, 0.059, false));
    }
    head.add(mesh(box(0.08, 0.013, 0.034), leather(), 0, -0.019, 0.145, false));
    if (!steppe) mountBarding(h, r.faction, team);
  }
  r.tools.neck = neck;
  const tail = new THREE.Group(); tail.position.set(0, 0.36, -0.23); h.add(tail);
  const tm = taperedPart(0.023, 0.012, 0.21, 0.77, dm, -0.1); tail.add(tm); tail.rotation.x = -0.45;
  r.tools.tail = tail;
  // tack: leather saddle on a team saddle cloth
  h.add(mesh(box(0.2, 0.012, 0.18), cloth(team), 0, 0.41, -0.02, false));
  h.add(mesh(box(0.12, 0.035, 0.12), leather(), 0, 0.43, -0.02));
  for (const [x, z] of [[-0.055, 0.15], [0.055, 0.15], [-0.055, -0.15], [0.055, -0.15]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.27, z);
    hip.add(taperedPart(0.037, 0.024, 0.134, 0.9, hm, -0.065));
    const knee = new THREE.Group(); knee.position.y = -0.13; hip.add(knee);
    knee.add(taperedPart(0.023, 0.016, 0.122, 0.8, dm, -0.06));
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
const f = r.faction;
  const fishing = type === "fishing_boat", fire = type === "fire_ship";
    const width = fishing ? 0.44 : fire ? 0.50 : (f === "goryeo" ? 0.74 : 0.70);
  const length = fishing ? 0.85 : fire ? 1.28 : 1.3;
  const hullHex = fire ? (f === "goryeo" ? "#2e343b" : f === "fuso" ? "#1e2738" : "#4f3526") : f === "goryeo" ? "#2f3338" : f === "fuso" ? (fishing ? "#5a4634" : "#182235") : f === "bac_cuong" ? (fishing ? "#8c6742" : "#5e432c") : f === "dai_viet" && !fishing ? "#3b281c" : PAL.hull;
  const hullM = pbr("mat_ship_wood", hullHex);
    const trimHex = f === "goryeo" ? "#6c8294" : f === "fuso" ? "#29467a" : f === "dai_viet" && !fishing ? PAL.bronze : fishing ? mute(team, 0.4) : team;
  const trim = f === "dai_viet" && !fishing ? bronze() : cloth(trimHex);
  // hull sits on the waterline (body y = 0 is WATER_LEVEL): keel slightly submerged, gunwale at ~0.16
  const hull = mesh(cyl(0.5, 0.39, 0.17, 8), hullM, 0, 0.07, 0);
  hull.scale.set(width, 1, length);
  b.add(hull);
  const prow = mesh(cone(width * 0.3, length * 0.22, 6), hullM, 0, 0.11, length * 0.52); prow.rotation.x = Math.PI / 2; b.add(prow);
  b.add(mesh(box(width * 0.6, 0.08, length * 0.16), hullM, 0, 0.2, -length * 0.38)); // raised stern
  b.add(mesh(box(width * 0.78, 0.022, length * 0.74), trim, 0, 0.162, 0, false));
  if (fire) { const ram = taperedPart(0.01, width * 0.22, length * 0.26, 0.7, f === "fuso" ? steel("#cfd8e3") : steel(), 0.11); ram.rotation.x = Math.PI / 2; ram.position.z = length * 0.56; b.add(ram); }
  if (f === "fuso" && fishing) { const fBow = mesh(cone(width * 0.2, length * 0.18, 6), trim, 0, 0.17, length * 0.54); fBow.rotation.x = Math.PI / 2 - 0.35; b.add(fBow); }
  if (f === "trung_nguyen" && !fishing && !fire) b.add(mesh(box(width * 0.62, 0.11, length * 0.22), hullM, 0, 0.27, -length * 0.36));
  if (f === "bac_cuong" && !fishing && !fire) addArmorPlates(b, [-0.28, 0, 0.28].map((z) => mesh(box(width * 0.82, 0.03, 0.04), steel(), 0, 0.14, length * z)));
  if (f === "goryeo" && !fishing) {
    addArmorPlates(b, [-1, 1].flatMap((s) => [-0.24, 0, 0.24].map((z) => mesh(box(0.03, 0.12, length * 0.2), pbr("mat_goryeo_plate", "#6c8294"), s * width * 0.4, 0.17, length * z))));
    if (!fire) { const shell = mesh(cyl(width * 0.42, width * 0.44, length * 0.68, 8), steel("#4a5562"), 0, 0.24, 0); shell.rotation.x = Math.PI / 2; shell.scale.set(1, 1, 0.45); b.add(shell); }
    const dragon = new THREE.Group(); dragon.position.set(0, 0.2, length * 0.5);
    const neck = taperedPart(0.04, 0.07, 0.16, 0.8, steel("#4a5562"), 0); neck.rotation.x = 0.5; dragon.add(neck);
    dragon.add(mesh(box(0.09, 0.08, 0.11), steel("#4a5562"), 0, 0.06, 0.07));
    dragon.add(mesh(box(0.095, 0.02, 0.02), bronze(), 0, 0.08, 0.08, false)); b.add(dragon);
  }
  if (f === "fuso" && !fishing && !fire) addArmorPlates(b, [-1, 1].flatMap((s) => [-0.25, -0.08, 0.09, 0.26].map((z) => mesh(box(0.022, 0.14, 0.12), woodM("#3a2c22"), s * width * 0.39, 0.22, length * z))));
  if ((f === "dai_viet" || f === "trung_nguyen" || f === "bac_cuong") && !fishing && !fire) {
    const shSides = f === "trung_nguyen" ? 6 : 10;
    const shMat = f === "dai_viet" ? bronze() : f === "trung_nguyen" ? trim : woodM("#7a5a38");
    addArmorPlates(b, [-1, 1].flatMap((s) => [-0.22, 0, 0.22].map((z) => { const sh = mesh(cyl(0.052, 0.052, 0.018, shSides), shMat, s * width * 0.4, 0.2, length * z); sh.rotation.z = Math.PI / 2; return sh; })));
  }// team gunwale band
  b.add(mesh(box(width * 0.66, 0.02, length * 0.66), woodM("#8a6a48"), 0, 0.15, 0)); // deck
  // mast pivots at the deck so it can be lowered aft when passing under a bridge
  const mast = new THREE.Group(); mast.position.set(0, 0.16, 0.04); b.add(mast);
  const mastH = fishing ? 0.5 : 0.62;
  mast.add(mesh(cyl(0.018, 0.024, mastH, 6), woodM(PAL.woodDark), 0, mastH / 2, 0));
  const yard = mesh(cyl(0.01, 0.01, width * 0.95, 5), woodM(PAL.woodDark), 0, mastH - 0.04, 0.02, false); yard.rotation.z = Math.PI / 2; mast.add(yard);
    const sailH = fishing ? (f === "bac_cuong" ? 0.22 : 0.3) : 0.4;
  const sailPivot = new THREE.Group(); sailPivot.position.set(0, mastH - 0.04, 0.03); mast.add(sailPivot);
    const sailColor = f === "dai_viet" ? (fishing ? "#7a5436" : "#8a5c38") : f === "goryeo" ? (fishing ? "#b8c2cc" : "#707c88") : f === "fuso" ? (fire ? "#223a66" : "#264375") : fishing ? PAL.sail : fire ? "#6b5a4a" : mute(team, 0.25);
  const sail = mesh(geo(`sail-${width}-${sailH}`, () => new THREE.PlaneGeometry(width * 0.85, sailH, 2, 4).translate(0, -sailH / 2, 0)), pbr("mat_sail", sailColor, { side: THREE.DoubleSide }), 0, 0, 0);
  sail.rotation.x = -0.06;
  sailPivot.add(sail);
  if (f === "dai_viet") for (const ry of [0.28, 0.52, 0.76]) { const rib = mesh(box(width * 0.86, 0.01, 0.01), woodM(PAL.bamboo), 0, -sailH * ry, 0.004, false); rib.rotation.z = 0.14; sail.add(rib); }
  if (f === "trung_nguyen") {
    for (const ry of [0.25, 0.5, 0.75]) sail.add(mesh(box(width * 0.86, 0.01, 0.01), woodM(PAL.bamboo), 0, -sailH * ry, 0.004, false));
    if (!fishing && !fire) {
      const m2 = new THREE.Group(); m2.position.set(0, 0.18, -length * 0.25); b.add(m2);
      m2.add(mesh(cyl(0.014, 0.018, 0.44, 6), woodM(PAL.woodDark), 0, 0.22, 0));
      const s2 = mesh(box(width * 0.6, 0.26, 0.008), pbr("mat_sail", sailColor), 0, 0.28, 0.01);
      for (const ry of [-0.07, 0.0, 0.07]) s2.add(mesh(box(width * 0.62, 0.008, 0.012), woodM(PAL.bamboo), 0, ry, 0.002, false));
      m2.add(s2);
    }
  }
  if (f === "fuso") {
    if (fishing) sail.add(mesh(box(width * 0.84, sailH * 0.24, 0.004), cloth("#f2f4f7"), 0, -sailH * 0.5, 0.003, false));
    else if (!fire) for (const ry of [0.28, 0.54, 0.78]) sail.add(mesh(box(width * 0.84, sailH * 0.12, 0.004), cloth("#cdd6e0"), 0, -sailH * ry, 0.003, false));
    else { const mon = mesh(cyl(0.055, 0.055, 0.006, 12), cloth("#e4ebf2"), 0, -sailH * 0.45, 0.005, false); mon.rotation.x = Math.PI / 2; sail.add(mon); }
  }
  if (f === "bac_cuong" && !fishing && !fire) { const tail = mesh(cone(0.025, 0.18, 6), cloth("#d8cfc2"), 0, mastH + 0.04, -0.06, false); tail.rotation.x = -1.1; mast.add(tail); }
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
    if (f === "dai_viet") { const roll = mesh(cyl(0.035, 0.035, 0.16, 8), mat("#8d7f60", { surface: "lattice", rough: 0.9 }), width * 0.16, 0.19, -length * 0.22); roll.rotation.z = Math.PI / 2; b.add(roll); b.add(mesh(cyl(0.055, 0.045, 0.07, 8), woodM(PAL.bamboo), -width * 0.16, 0.19, -length * 0.18)); }
    else if (f === "trung_nguyen") { const canopy = mesh(cyl(width * 0.34, width * 0.34, length * 0.34, 8), woodM(PAL.bamboo), 0, 0.24, -length * 0.18); canopy.rotation.x = Math.PI / 2; canopy.scale.set(1, 1, 0.55); b.add(canopy); }
    else if (f === "bac_cuong") { b.add(mesh(cyl(0.055, 0.05, 0.11, 8), woodM("#9b7348"), -width * 0.16, 0.21, -length * 0.18)); b.add(mesh(cyl(0.058, 0.058, 0.015, 8), steel(), -width * 0.16, 0.23, -length * 0.18)); }
    else if (f === "goryeo") b.add(mesh(cyl(0.058, 0.045, 0.075, 8), woodM("#7a7060"), width * 0.16, 0.19, -length * 0.18));
    else if (f === "fuso") b.add(mesh(box(0.11, 0.08, 0.12), woodM("#8f6e49"), -width * 0.15, 0.2, -length * 0.18));
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
    for (const sx of [-1, 1]) { b.add(mesh(cyl(0.055, 0.05, 0.11, 8), woodM("#5c3a21"), sx * width * 0.24, 0.21, -length * 0.12)); b.add(mesh(cyl(0.058, 0.058, 0.014, 8), steel(), sx * width * 0.24, 0.23, -length * 0.12)); } basket;
  }
}
function pbrInfantryBody(r: Rig, b: THREE.Group, team: string, opts: { robe?: boolean; tunicColor?: string; pantsColor?: string; beltColor?: string } = {}) { const tunic = opts.tunicColor || mute(team); const pants = opts.pantsColor || PAL.pants; const belt = opts.beltColor || PAL.leatherDark; const legL = new THREE.Group(); legL.position.set(-0.048, 0.21, 0); b.add(legL); r.legL = legL; legL.add(taperedPart(0.036, 0.028, 0.14, 0.036, cloth(pants), -0.07)); legL.add(taperedPart(0.028, 0.022, 0.09, 0.03, leather(PAL.leatherDark), -0.165)); const legR = new THREE.Group(); legR.position.set(0.048, 0.21, 0); b.add(legR); r.legR = legR; legR.add(taperedPart(0.036, 0.028, 0.14, 0.036, cloth(pants), -0.07)); legR.add(taperedPart(0.028, 0.022, 0.09, 0.03, leather(PAL.leatherDark), -0.165)); if (opts.robe) { b.add(taperedPart(0.088, 0.118, 0.23, 0.076, cloth(tunic), 0.21)); b.add(taperedPart(0.086, 0.082, 0.14, 0.072, cloth(tunic), 0.36)); } else { b.add(taperedPart(0.092, 0.076, 0.19, 0.076, cloth(tunic), 0.32)); b.add(taperedPart(0.076, 0.098, 0.11, 0.072, cloth(shade(tunic, -0.15)), 0.19)); } b.add(mesh(cyl(0.082, 0.084, 0.032, 10), leather(belt), 0, 0.25, 0)); const armL = new THREE.Group(); armL.position.set(-0.105, 0.4, 0); b.add(armL); r.armL = armL; armL.add(taperedPart(0.03, 0.024, 0.11, 0.03, cloth(tunic), -0.055)); const elbowL = new THREE.Group(); elbowL.position.set(0, -0.11, 0); armL.add(elbowL); r.elbowL = elbowL; elbowL.add(taperedPart(0.023, 0.018, 0.1, 0.023, skinM(), -0.05)); const armR = new THREE.Group(); armR.position.set(0.105, 0.4, 0); b.add(armR); r.armR = armR; armR.add(taperedPart(0.03, 0.024, 0.11, 0.03, cloth(tunic), -0.055)); const elbowR = new THREE.Group(); elbowR.position.set(0, -0.11, 0); armR.add(elbowR); r.elbowR = elbowR; elbowR.add(taperedPart(0.023, 0.018, 0.1, 0.023, skinM(), -0.05)); const head = new THREE.Group(); head.position.set(0, 0.44, 0); b.add(head); r.head = head; head.add(mesh(cyl(0.024, 0.028, 0.04, 8), skinM(), 0, 0.01, 0)); head.add(mesh(sphere(0.062, 10, 8), skinM(), 0, 0.075, 0)); r.arm = armR; }
function buildSwordsmanPBR(r: Rig, b: THREE.Group, faction: Faction, team: string) { pbrInfantryBody(r, b, team, { tunicColor: faction === "fuso" ? "#232a3a" : mute(team), beltColor: faction === "goryeo" ? "#4d5d6b" : PAL.leatherDark }); const head = r.head!; const blade = new THREE.Group(); if (faction === "dai_viet") { head.add(mesh(cone(0.072, 0.085, 10), steel(), 0, 0.115, 0)); head.add(mesh(cyl(0.068, 0.074, 0.016, 10), bronze(), 0, 0.08, 0)); head.add(mesh(cone(0.014, 0.045, 6), bronze(), 0, 0.17, 0)); vietLeafArmor(b); r.armL!.add(mesh(sphere(0.044, 8, 6), bronze(), -0.01, 0.01, 0)); r.armR!.add(mesh(sphere(0.044, 8, 6), bronze(), 0.01, 0.01, 0)); const sh = new THREE.Group(); sh.add(mesh(cyl(0.11, 0.11, 0.016, 12), woodM("#1c1714"), 0, 0, 0)); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 14), bronze()); rim.rotation.x = Math.PI / 2; sh.add(rim); sh.add(mesh(cyl(0.032, 0.032, 0.022, 10), bronze(), 0, 0.004, 0)); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const ray = mesh(box(0.008, 0.006, 0.035), bronze(), Math.sin(a) * 0.055, 0.01, Math.cos(a) * 0.055); ray.rotation.y = a; sh.add(ray); } sh.rotation.z = Math.PI / 2; sh.position.set(-0.04, -0.1, 0.03); r.armL!.add(sh); blade.add(mesh(cyl(0.01, 0.01, 0.09, 6), leather(PAL.leatherDark), 0, 0.02, 0)); blade.add(mesh(cyl(0.024, 0.024, 0.01, 8), bronze(), 0, 0.065, 0)); const bl = mesh(box(0.016, 0.24, 0.032), steel(), 0, 0.185, 0.008); bl.rotation.x = -0.08; blade.add(bl); } else if (faction === "trung_nguyen") { head.add(mesh(sphere(0.068, 10, 8), steel("#5b616a"), 0, 0.092, 0)); head.add(mesh(cyl(0.072, 0.078, 0.045, 10), steel("#4b515a"), 0, 0.068, -0.01)); head.add(mesh(cone(0.015, 0.04, 6), bronze(), 0, 0.165, 0)); addArmorPlates(b, [mesh(box(0.175, 0.14, 0.14), steel("#5b616a"), 0, 0.33, 0), mesh(box(0.185, 0.06, 0.145), steel("#4a5058"), 0, 0.22, 0)]); const sh = new THREE.Group(); sh.add(mesh(cyl(0.115, 0.115, 0.016, 6), woodM("#4e2c22"), 0, 0, 0)); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.011, 5, 6), steel("#5b616a")); rim.rotation.x = Math.PI / 2; sh.add(rim); sh.rotation.z = Math.PI / 2; sh.position.set(-0.04, -0.1, 0.03); r.armL!.add(sh); blade.add(mesh(cyl(0.011, 0.011, 0.1, 6), leather(), 0, 0.02, 0)); blade.add(mesh(box(0.045, 0.012, 0.024), steel(), 0, 0.07, 0)); blade.add(mesh(box(0.018, 0.27, 0.044), steel(), 0, 0.21, 0)); } else if (faction === "bac_cuong") { head.add(mesh(cone(0.068, 0.1, 10), steel("#555a60"), 0, 0.125, 0)); head.add(mesh(cyl(0.072, 0.076, 0.032, 10), fur("#4a3a2c"), 0, 0.082, 0)); addArmorPlates(b, [mesh(box(0.175, 0.15, 0.14), leather("#4f4b34"), 0, 0.33, 0), mesh(cyl(0.012, 0.012, 0.02, 6), bronze(), -0.045, 0.36, 0.07), mesh(cyl(0.012, 0.012, 0.02, 6), bronze(), 0.045, 0.36, 0.07)]); const sh = new THREE.Group(); sh.add(mesh(cyl(0.11, 0.11, 0.016, 12), woodM("#3a3228"), 0, 0, 0)); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 12), steel()); rim.rotation.x = Math.PI / 2; sh.add(rim); sh.add(mesh(sphere(0.028, 8, 6), steel(), 0, 0.008, 0)); sh.rotation.z = Math.PI / 2; sh.position.set(-0.04, -0.1, 0.03); r.armL!.add(sh); blade.add(mesh(cyl(0.01, 0.01, 0.09, 6), leather(), 0, 0.02, 0)); blade.add(mesh(box(0.036, 0.01, 0.018), bronze(), 0, 0.065, 0)); const bl = mesh(box(0.015, 0.25, 0.03), steel(), 0, 0.19, 0.012); bl.rotation.x = -0.12; blade.add(bl); } else if (faction === "goryeo") { head.add(mesh(sphere(0.068, 10, 8), steel("#525a63"), 0, 0.092, 0)); head.add(mesh(box(0.018, 0.055, 0.12), steel("#6a737d"), 0, 0.125, 0)); addArmorPlates(b, [mesh(box(0.17, 0.14, 0.138), steel("#525a63"), 0, 0.33, 0), mesh(cyl(0.09, 0.092, 0.035, 10), cloth("#4d5d6b"), 0, 0.25, 0)]); const sh = new THREE.Group(); sh.add(mesh(box(0.16, 0.016, 0.23), woodM("#3b2f26"), 0, 0, 0)); sh.add(mesh(box(0.17, 0.022, 0.024), steel(), 0, 0, 0.06)); sh.add(mesh(box(0.17, 0.022, 0.024), steel(), 0, 0, -0.06)); sh.rotation.z = Math.PI / 2; sh.position.set(-0.04, -0.1, 0.03); r.armL!.add(sh); blade.add(mesh(cyl(0.01, 0.01, 0.09, 6), leather(), 0, 0.02, 0)); blade.add(mesh(cyl(0.02, 0.02, 0.008, 8), bronze(), 0, 0.065, 0)); blade.add(mesh(box(0.014, 0.25, 0.022), steel("#cfd6de"), 0, 0.19, 0)); } else { head.add(mesh(sphere(0.07, 10, 8), steel("#272b34"), 0, 0.092, 0)); head.add(mesh(cyl(0.075, 0.085, 0.04, 10), steel("#1e222a"), 0, 0.065, -0.01)); const crest = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 12, Math.PI * 1.15), steel("#c8d0d8")); crest.position.set(0, 0.13, 0.055); crest.rotation.z = -Math.PI * 0.075; head.add(crest); addArmorPlates(b, [mesh(box(0.175, 0.15, 0.14), cloth("#232a3a"), 0, 0.33, 0), mesh(box(0.18, 0.055, 0.145), steel("#1e222a"), 0, 0.22, 0)]); blade.add(mesh(cyl(0.01, 0.01, 0.11, 6), cloth("#1e222a"), 0, 0.02, 0)); blade.add(mesh(cyl(0.022, 0.022, 0.008, 10), bronze(), 0, 0.075, 0)); const bl = mesh(box(0.012, 0.28, 0.022), steel("#d8e0e8"), 0, 0.215, 0.006); bl.rotation.x = -0.05; blade.add(bl); const saya = mesh(cyl(0.012, 0.01, 0.28, 6), woodM("#17191f"), -0.095, 0.22, 0); saya.rotation.x = 0.85; b.add(saya); } r.tools.weapon = hand(r.armR!, blade); r.height = 0.62; }
function buildSpearmanPBR(r: Rig, b: THREE.Group, faction: Faction, team: string) { pbrInfantryBody(r, b, team, { tunicColor: faction === "fuso" ? "#262d3d" : mute(team) }); const head = r.head!; const spear = new THREE.Group(); spear.add(mesh(cyl(0.011, 0.011, 0.72, 6), woodM(PAL.woodDark), 0, 0.24, 0)); addArmorPlates(b, [mesh(box(0.155, 0.11, 0.125), faction === "bac_cuong" ? leather("#544c38") : steel("#5a6068"), 0, 0.34, 0)]); if (faction === "dai_viet") { head.add(mesh(cone(0.068, 0.072, 10), steel(), 0, 0.11, 0)); head.add(mesh(cyl(0.066, 0.072, 0.014, 10), bronze(), 0, 0.08, 0)); const tip = mesh(cone(0.02, 0.14, 4), steel(), 0, 0.65, 0); tip.scale.z = 0.45; spear.add(tip); spear.add(mesh(cyl(0.016, 0.022, 0.04, 8), bronze(), 0, 0.56, 0)); } else if (faction === "trung_nguyen") { head.add(mesh(sphere(0.065, 10, 8), steel("#5b616a"), 0, 0.09, 0)); head.add(mesh(cone(0.012, 0.03, 6), bronze(), 0, 0.155, 0)); spear.add(mesh(cone(0.016, 0.14, 6), steel(), 0, 0.65, 0)); spear.add(mesh(cone(0.026, 0.065, 8), cloth("#8b1e1e"), 0, 0.545, 0)); } else if (faction === "bac_cuong") { head.add(mesh(cone(0.065, 0.085, 8), steel(), 0, 0.115, 0)); head.add(mesh(cyl(0.068, 0.072, 0.028, 10), fur("#4a3a2c"), 0, 0.082, 0)); spear.add(mesh(cone(0.016, 0.14, 6), steel(), 0, 0.65, 0)); spear.add(mesh(cone(0.028, 0.08, 8), fur("#2b241f"), 0, 0.54, 0)); } else if (faction === "goryeo") { head.add(mesh(sphere(0.065, 10, 8), steel("#525a63"), 0, 0.09, 0)); spear.add(mesh(cone(0.015, 0.14, 6), steel("#cfd6de"), 0, 0.65, 0)); spear.add(mesh(box(0.078, 0.012, 0.012), steel("#525a63"), 0, 0.575, 0)); } else { head.add(mesh(cone(0.105, 0.048, 12), woodM("#1f2228"), 0, 0.118, 0)); head.add(mesh(cyl(0.105, 0.105, 0.008, 12), bronze(), 0, 0.096, 0)); spear.add(mesh(cone(0.015, 0.15, 4), steel("#d8e0e8"), 0, 0.655, 0)); spear.add(mesh(cyl(0.014, 0.014, 0.045, 8), steel("#cfd6de"), 0, 0.56, 0)); } r.tools.weapon = hand(r.armR!, spear); r.height = 0.62; }
function buildArcherPBR(r: Rig, b: THREE.Group, faction: Faction, team: string) { pbrInfantryBody(r, b, team, { tunicColor: faction === "fuso" ? "#262d3d" : mute(team) }); const head = r.head!; addArmorPlates(b, [mesh(box(0.148, 0.1, 0.118), leather("#5a4430"), 0, 0.34, 0)]); const qv = new THREE.Group(); qv.add(mesh(cyl(0.022, 0.018, 0.16, 8), leather("#4a3423"), 0, 0, 0)); for (let i = -1; i <= 1; i++) qv.add(mesh(cone(0.006, 0.03, 5), cloth("#dcd6c8"), i * 0.008, 0.09, 0)); qv.position.set(-0.04, 0.34, -0.075); qv.rotation.z = -0.35; b.add(qv); const rad = faction === "fuso" ? 0.24 : faction === "bac_cuong" ? 0.14 : faction === "goryeo" ? 0.135 : 0.15; const { bow, string } = bowGroup(rad, team); if (faction === "dai_viet") { head.add(mesh(cone(0.11, 0.055, 12), woodM("#241b15"), 0, 0.12, 0)); head.add(mesh(cyl(0.11, 0.11, 0.008, 12), bronze(), 0, 0.095, 0)); bow.add(mesh(box(0.012, 0.035, 0.018), bronze(), 0, 0.15, 0.02)); bow.add(mesh(box(0.012, 0.035, 0.018), bronze(), 0, -0.15, 0.02)); } else if (faction === "trung_nguyen") { head.add(mesh(sphere(0.066, 10, 8), cloth(mute(team)), 0, 0.092, 0)); head.add(mesh(cyl(0.07, 0.072, 0.022, 10), steel("#5b616a"), 0, 0.076, 0)); bow.add(mesh(cyl(0.009, 0.009, 0.06, 6), ivory(), 0, 0, 0.01)); } else if (faction === "bac_cuong") { head.add(mesh(cone(0.066, 0.095, 8), fur("#4a3a2c"), 0, 0.118, 0)); head.add(mesh(cyl(0.072, 0.076, 0.034, 10), fur("#3a2c20"), 0, 0.082, 0)); bow.add(mesh(box(0.01, 0.04, 0.024), ivory(), 0, 0.13, -0.02)); bow.add(mesh(box(0.01, 0.04, 0.024), ivory(), 0, -0.13, -0.02)); } else if (faction === "goryeo") { head.add(mesh(cyl(0.105, 0.105, 0.01, 14), cloth("#22262e"), 0, 0.095, 0)); head.add(mesh(cyl(0.056, 0.064, 0.055, 10), cloth("#2c323c"), 0, 0.125, 0)); head.add(mesh(cyl(0.062, 0.062, 0.008, 10), steel("#cfd6de"), 0, 0.105, 0)); bow.add(mesh(box(0.01, 0.03, 0.02), bronze(), 0, 0.125, -0.015)); bow.add(mesh(box(0.01, 0.03, 0.02), bronze(), 0, -0.125, -0.015)); } else { head.add(mesh(cone(0.105, 0.048, 12), woodM("#1f2228"), 0, 0.118, 0)); bow.position.y += 0.07; } r.tools.weapon = hand(r.armL!, bow); r.tools.string = string; r.arm = r.armL; r.height = 0.6; }
function buildHealerPBR(r: Rig, b: THREE.Group, faction: Faction, team: string) { pbrInfantryBody(r, b, team, { robe: true, tunicColor: PAL.jade, pantsColor: PAL.jade, beltColor: mute(team) }); const head = r.head!; const staff = new THREE.Group(); staff.add(mesh(cyl(0.011, 0.011, 0.56, 6), woodM(PAL.woodDark), 0, 0.19, 0)); if (faction === "dai_viet") { head.add(mesh(cyl(0.068, 0.072, 0.04, 12), cloth("#222026"), 0, 0.095, 0)); staff.add(mesh(sphere(0.02, 8, 6), woodM("#a56a2c"), 0, 0.42, 0.025)); staff.add(mesh(sphere(0.013, 8, 6), woodM("#a56a2c"), 0, 0.45, 0.025)); } else if (faction === "trung_nguyen") { head.add(mesh(box(0.11, 0.04, 0.11), cloth("#20242d"), 0, 0.108, 0)); head.add(mesh(cyl(0.062, 0.066, 0.035, 10), cloth("#20242d"), 0, 0.088, 0)); staff.add(mesh(sphere(0.022, 8, 6), woodM("#b57830"), 0, 0.41, 0.028)); staff.add(mesh(sphere(0.014, 8, 6), woodM("#b57830"), 0, 0.442, 0.028)); } else if (faction === "bac_cuong") { head.add(mesh(cyl(0.07, 0.076, 0.042, 10), fur("#4a3a2c"), 0, 0.092, 0)); head.add(mesh(sphere(0.014, 6, 6), bronze(), 0, 0.115, 0.055)); const rg = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 12), bronze()); rg.position.set(0, 0.48, 0); staff.add(rg); } else if (faction === "goryeo") { head.add(mesh(cyl(0.125, 0.125, 0.008, 14), cloth("#16181d"), 0, 0.095, 0)); head.add(mesh(cyl(0.048, 0.052, 0.085, 10), cloth("#1a1d24"), 0, 0.14, 0)); b.add(mesh(box(0.09, 0.12, 0.055), woodM("#3a1b16"), 0, 0.34, -0.09)); } else { head.add(mesh(cyl(0.03, 0.035, 0.042, 6), woodM("#1d1f24"), 0, 0.125, 0.02)); const ks = mesh(box(0.175, 0.045, 0.145), cloth("#eae6dc"), 0, 0.35, 0); ks.rotation.z = 0.45; b.add(ks); const rg = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 12), bronze()); rg.position.set(0, 0.48, 0); staff.add(rg); staff.add(mesh(cyl(0.009, 0.009, 0.018, 6), bronze(), -0.022, 0.48, 0)); staff.add(mesh(cyl(0.009, 0.009, 0.018, 6), bronze(), 0.022, 0.48, 0)); } r.tools.staff = hand(r.armR!, staff); r.height = 0.58; }

function buildUnit(type: string, team: string, faction: Faction): Rig {
  const r = newRig(type, `${type}|${team}|${faction}`, faction);
  const b = r.body;
  const cape = mute(team);
  switch (type) {
    case "villager": {
      civilianRig(r, team);
      for (const k of ["axe", "pick", "sickle", "hammer", "spear", "knife"]) { r.tools[k] = hand(r.elbowR!, tool(k), -0.074); r.tools[k].visible = false; }
      r.tools.basket = hand(r.elbowL!, tool("basket"), -0.074); r.tools.basket.visible = false;
      for (const k of ["wood", "food", "gold", "stone", "meat", "fruit"]) { r.carry[k] = carryBundle(k); b.add(r.carry[k]); }
      r.villagePose = new Float32Array(12);
      r.height = 0.6;
      break;
    }
    case "fishing_boat":
    case "galley":
    case "fire_ship": buildShip(r, type, team); break;
    case "healer": { buildHealerPBR(r, b, faction, team); break; } case "swordsman": { buildSwordsmanPBR(r, b, faction, team); break; } case "spearman": { buildSpearmanPBR(r, b, faction, team); break; } case "archer": { buildArcherPBR(r, b, faction, team); break; }
    case "chuko_nu": {
          humanoid(r, b, cape, { armor: "lamellar", head: "steel", accent: team }); const plates: THREE.Mesh[] = []; const pGeo = box(0.036, 0.04, 0.012); const pMat = steel(PAL.steelDark); for (let row = 0; row < 2; row++) for (let col = -1; col <= 1; col++) for (const z of [0.068, -0.068]) plates.push(mesh(pGeo, pMat, col * 0.042, 0.25 + row * 0.046, z, false)); addArmorPlates(b, plates); b.add(mesh(box(0.132, 0.068, 0.018), steel(PAL.steelDark), 0, 0.455, -0.075, false)); for (const s of [-1, 1]) b.add(mesh(box(0.018, 0.062, 0.095), steel(PAL.steelDark), s * 0.072, 0.455, -0.015, false)); b.add(mesh(cone(0.02, 0.045, 6), bronze(), 0, 0.56, 0, false)); b.add(mesh(cyl(0.028, 0.024, 0.18, 6), leather(), 0.055, 0.32, -0.09)); const xb = new THREE.Group(); const stock = taperedPart(0.024, 0.034, 0.26, 0.032, woodM(PAL.woodDark), 0); stock.rotation.x = Math.PI / 2; stock.position.set(0, 0, 0.1); xb.add(stock); xb.add(mesh(box(0.044, 0.068, 0.14), woodM("#3a2416"), 0, 0.052, 0.11)); xb.add(mesh(box(0.048, 0.012, 0.146), bronze(), 0, 0.088, 0.11, false)); xb.add(mesh(box(0.024, 0.016, 0.032), steel(), 0, 0.052, 0.185, false)); xb.add(mesh(box(0.25, 0.015, 0.02), steel(PAL.steelDark), 0, 0, 0.21)); for (const s of [-1, 1]) xb.add(mesh(box(0.018, 0.018, 0.022), bronze(), s * 0.125, 0, 0.21, false)); xb.add(mesh(box(0.24, 0.004, 0.004), cloth("#e8dfc8"), 0, 0.006, 0.18, false)); const lever = new THREE.Group(); lever.position.set(0, 0.085, 0.06); xb.add(lever); lever.add(mesh(box(0.012, 0.012, 0.16), bronze(), 0, 0, 0.07, false)); r.tools.weapon = hand(r.armR, xb); r.tools.lever = lever; r.height = 0.62; break;
    }
    case "cavalry":
    case "horse_archer": {
      const steppe = type === "horse_archer";
      const mount = horse(r, b, team, steppe);
      const rider = new THREE.Group();
      rider.position.set(0, steppe ? 0.235 : 0.263, -0.02);
      rider.scale.setScalar(0.85);
      const style = MOUNT_STYLE[faction];
      humanoid(r, rider, style.tunic, {
        armor: steppe ? "leather" : style.armor, head: steppe || faction === "bac_cuong" ? "fur" : "steel",
        legs: false, accent: team, helmetTint: style.helmet,
      });
      r.tools.rider = rider;
      r.tools.hipL = seatedLeg(rider, -1);
      r.tools.hipR = seatedLeg(rider, 1);
      const viet = !steppe && faction === "dai_viet";
      if (!steppe) riderDetails(rider, faction);
      if (!steppe) {
        const capeM = mesh(box(0.19, 0.24, 0.02), cloth(team), 0, 0.27, -0.075, false); capeM.rotation.x = 0.25; rider.add(capeM);
        r.tools.cape = capeM;
        const lance = new THREE.Group();
        lance.add(mesh(cyl(0.01, 0.011, 0.9, 5), woodM(), 0, 0.2, 0));
        lance.add(mesh(cone(0.02, 0.12, 4), steel(), 0, 0.71, 0));
        const tassel = mesh(cone(0.028, 0.06, 6), cloth(team), 0, 0.62, 0, false); tassel.rotation.x = Math.PI; lance.add(tassel);
        lance.rotation.x = 0.16;
        r.tools.weapon = hand(r.armR, lance);
      } else { rider.add(mesh(sphere(0.088, 8, 6), steel(PAL.steelDark), 0, 0.505, 0, false)); rider.add(mesh(cyl(0.098, 0.104, 0.036, 8), fur("#5a4430"), 0, 0.475, 0, false)); rider.add(mesh(box(0.176, 0.19, 0.128), leather("#5c5332"), 0, 0.275, 0)); const studs: THREE.Mesh[] = []; const sGeo = box(0.014, 0.014, 0.01); const sMat = bronze(); for (const y of [0.23, 0.30]) for (const x of [-0.05, 0, 0.05]) for (const z of [0.066, -0.066]) studs.push(mesh(sGeo, sMat, x, y, z, false)); addArmorPlates(rider, studs); rider.add(mesh(cyl(0.026, 0.02, 0.18, 6), leather("#4a3321"), 0.095, 0.23, -0.04)); for (let i = -1; i <= 1; i++) rider.add(mesh(cone(0.008, 0.035, 4), cloth(team), 0.095 + i * 0.008, 0.33, -0.04, false)); const { bow, string } = bowGroup(0.13, team); for (const s of [-1, 1]) { const tip = taperedPart(0.008, 0.016, 0.065, 0.012, ivory(), 0); tip.position.set(0, s * 0.13, -0.028); tip.rotation.x = s * 0.65; bow.add(tip); } bow.rotation.y = Math.PI / 2; bow.rotation.x = Math.PI / 2; r.tools.weapon = hand(r.armL, bow); r.tools.string = string;
      }
      mount.add(rider);
      if (steppe) pennant(rider, -0.07, 0.28, -0.08, team, 0.42);
      else if (!viet) flag(rider, -0.08, 0.3, -0.07, team, 0.4);
      r.height = 0.95;
      break;
    }
    case "war_elephant": {
      const em = hide("#767b7c");
      const e = new THREE.Group(); e.scale.setScalar(1.25);
      const torso = mesh(sphere(0.2, 14, 10), em, 0, 0.42, 0); torso.scale.set(1, 0.95, 1.45); e.add(torso);
      e.add(mesh(sphere(0.13, 12, 10), em, 0, 0.5, 0.3));
      // bronze brow plate with a team crest
      const plate = mesh(box(0.16, 0.14, 0.025), cloth("#1a1a1d"), 0, 0.56, 0.415); plate.rotation.x = -0.35; e.add(plate); const pTrim = mesh(box(0.172, 0.152, 0.014), bronze(), 0, 0.56, 0.408, false); pTrim.rotation.x = -0.35; e.add(pTrim); e.add(mesh(sphere(0.024, 6, 4), bronze(), 0, 0.57, 0.432, false));
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
      e.add(l); r.legs4.push(l); r.knees.push(knee); } e.add(mesh(box(0.4, 0.024, 0.48), cloth(team), 0, 0.585, -0.02, false)); e.add(mesh(box(0.42, 0.012, 0.5), bronze(), 0, 0.578, -0.02, false)); for (const s of [-1, 1]) { e.add(mesh(box(0.016, 0.11, 0.36), cloth("#1e1a18"), s * 0.205, 0.52, -0.02, false)); e.add(mesh(box(0.02, 0.02, 0.37), bronze(), s * 0.208, 0.47, -0.02, false)); } e.add(mesh(box(0.3, 0.03, 0.38), woodM(PAL.woodDark), 0, 0.615, -0.03)); for (const [x, zz] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.2], [0.14, -0.2]]) { e.add(mesh(cyl(0.013, 0.013, 0.2, 5), woodM(PAL.woodDark), x, 0.72, zz)); e.add(mesh(cyl(0.016, 0.016, 0.024, 5), bronze(), x, 0.81, zz, false)); } for (const s of [-1, 1]) { e.add(mesh(box(0.014, 0.06, 0.36), woodM(PAL.woodDark), s * 0.14, 0.68, -0.03, false)); e.add(mesh(box(0.018, 0.016, 0.37), bronze(), s * 0.14, 0.715, -0.03, false)); } e.add(mesh(cone(0.24, 0.1, 4), cloth(mute(team, 0.3)), 0, 0.86, -0.03)); e.add(mesh(cone(0.024, 0.05, 6), bronze(), 0, 0.925, -0.03, false)); const rider = new THREE.Group(); rider.position.set(0, 0.62, -0.05); rider.scale.setScalar(0.65); humanoid(r, rider, cape, { armor: "scale", head: "steel", legs: false, accent: team }); vietLeafArmor(rider); rider.add(mesh(cyl(0.092, 0.1, 0.022, 8), bronze(), 0, 0.485, 0, false)); rider.add(mesh(cone(0.02, 0.055, 6), bronze(), 0, 0.57, 0, false))
     
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
      const wm = woodM(faction === "dai_viet" ? "#382315" : faction === "goryeo" ? "#282b32" : faction === "fuso" ? "#1c2230" : PAL.wood), dm = faction === "trung_nguyen" ? steel(PAL.steel) : faction === "fuso" ? cloth("#243356") : woodM(PAL.woodDark), iron = faction === "dai_viet" ? bronze() : faction === "fuso" ? steel(PAL.steel) : steel(PAL.steelDark);
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
        const w = spokedWheel(0.08); w.position.set(s * 0.18, 0.08, zz); if (faction === "trung_nguyen" || faction === "goryeo") { const rim = mesh(cyl(0.082, 0.082, 0.016, 12), iron, 0, 0, 0, false); rim.rotation.z = Math.PI / 2; w.add(rim); } if (faction === "goryeo") for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; w.add(mesh(box(0.022, 0.014, 0.014), steel(PAL.steel), 0, Math.cos(a) * 0.072, Math.sin(a) * 0.072, false)); } b.add(w); r.wheels.push(w);
      }
      if (faction === "dai_viet") { b.add(mesh(box(0.28, 0.16, 0.024), cloth("#18191e"), 0, 0.22, 0.25, false)); b.add(mesh(box(0.3, 0.02, 0.028), bronze(), 0, 0.3, 0.25, false)); b.add(mesh(sphere(0.032, 6, 5), bronze(), 0, 0.22, 0.265, false)); } else if (faction === "trung_nguyen") { for (const s of [-1, 1]) { const a2 = mesh(box(0.035, 0.28, 0.035), dm, s * 0.12, 0.25, -0.12, false); a2.rotation.x = 0.45; b.add(a2); } } else if (faction === "bac_cuong") { b.add(mesh(box(0.28, 0.16, 0.024), leather(PAL.leather), 0, 0.22, 0.25, false)); for (const xx of [-0.1, 0, 0.1]) b.add(mesh(box(0.02, 0.02, 0.03), steel(PAL.steel), xx, 0.26, 0.255, false)); for (const s of [-1, 1]) b.add(mesh(box(0.06, 0.06, 0.04), cloth("#8b7355"), s * 0.12, 0.28, -0.02, false)); } else if (faction === "goryeo") { for (const s of [-1, 1]) b.add(mesh(box(0.024, 0.16, 0.38), cloth("#45576b"), s * 0.175, 0.22, 0, false)); } else if (faction === "fuso") { for (const s of [-1, 1]) { b.add(mesh(box(0.11, 0.2, 0.024), wm, s * 0.09, 0.23, 0.25, false)); b.add(mesh(box(0.12, 0.018, 0.028), iron, s * 0.09, 0.33, 0.25, false)); } } const arm = new THREE.Group(); arm.position.set(0, 0.4, -0.02);
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
case "hwacha": {
const charWood = woodM("#282b32"), slate = cloth("#45576b"), iron = steel(PAL.steelDark);
for (const s of [-1, 1]) {
const w = spokedWheel(0.16); w.position.set(s * 0.22, 0.16, 0); b.add(w); r.wheels.push(w);
b.add(mesh(box(0.04, 0.04, 0.56), charWood, s * 0.16, 0.19, -0.08));
}
const axle = mesh(cyl(0.022, 0.022, 0.48, 8), iron, 0, 0.16, 0); axle.rotation.z = Math.PI / 2; b.add(axle);
b.add(mesh(box(0.32, 0.035, 0.28), charWood, 0, 0.2, 0));
b.add(mesh(box(0.34, 0.02, 0.04), slate, 0, 0.21, -0.34, false)); for (const s of [-1, 1]) b.add(mesh(box(0.024, 0.13, 0.32), slate, s * 0.18, 0.26, 0.01, false));
const rack = new THREE.Group(); rack.position.set(0, 0.38, 0.02); rack.rotation.x = -0.36;
rack.add(mesh(box(0.3, 0.22, 0.26), charWood, 0, 0, 0));
rack.add(mesh(box(0.312, 0.232, 0.05), slate, 0, 0, 0.08, false));
rack.add(mesh(box(0.316, 0.024, 0.27), iron, 0, 0.11, 0, false));
const shaftM = pbr("mat_bamboo", PAL.bamboo), tipM = steel(PAL.steel), emberM = mat("#e05a2b", { rough: 0.45 });
for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
const ax = (col - 2) * 0.052, ay = (row - 1) * 0.055;
const sh = mesh(cyl(0.006, 0.006, 0.34, 5), shaftM, ax, ay, 0.08, false); sh.rotation.x = Math.PI / 2; rack.add(sh);
const tp = mesh(cone(0.011, 0.045, 5), tipM, ax, ay, 0.26, false); tp.rotation.x = Math.PI / 2; rack.add(tp);
rack.add(mesh(box(0.014, 0.014, 0.025), emberM, ax, ay, 0.22, false));
}
b.add(rack); r.arm = rack;
flag(b, -0.18, 0.2, -0.24, team, 0.36);
r.height = 0.75;
break;
}
case "samurai": {
humanoid(r, b, team, { armor: "lamellar", head: undefined });
const indigo = cloth("#243356"), charM = steel("#232730"), silver = steel(PAL.steel);
b.add(mesh(box(0.2, 0.18, 0.135), indigo, 0, 0.34, 0));
b.add(mesh(box(0.21, 0.04, 0.14), charM, 0, 0.28, 0, false));
for (const s of [-1, 1]) {
const sode = mesh(box(0.03, 0.11, 0.11), indigo, s * 0.13, 0.37, 0); sode.rotation.z = s * -0.18; b.add(sode);
b.add(mesh(box(0.034, 0.02, 0.114), charM, s * 0.132, 0.33, 0, false));
}
b.add(mesh(sphere(0.082, 10, 6), charM, 0, 0.49, 0));
const shikoro = mesh(cyl(0.085, 0.115, 0.06, 10), indigo, 0, 0.455, -0.015, false); b.add(shikoro);
b.add(mesh(box(0.175, 0.016, 0.035), silver, 0, 0.48, 0.068, false)); b.add(mesh(box(0.088, 0.052, 0.055), charM, 0, 0.445, 0.055, false)); const saya = mesh(box(0.018, 0.024, 0.34), charM, -0.115, 0.27, -0.02, false); saya.rotation.x = -0.35; b.add(saya);
for (const s of [-1, 1]) {
const horn = mesh(box(0.016, 0.11, 0.01), silver, s * 0.045, 0.57, 0.075, false); horn.rotation.z = s * -0.45; b.add(horn);
}
if (r.arm) {
const katana = new THREE.Group();
katana.add(mesh(cyl(0.013, 0.013, 0.18, 6), charM, 0, 0, 0.04, false));
katana.children[0].rotation.x = Math.PI / 2;
katana.add(mesh(cyl(0.028, 0.028, 0.012, 8), bronze(), 0, 0, 0.13, false));
katana.children[1].rotation.x = Math.PI / 2;
katana.add(mesh(box(0.012, 0.026, 0.56), silver, 0, 0.01, 0.41));
katana.position.set(0, -0.02, 0.06); r.arm.add(katana);
}
b.scale.setScalar(1.08);
r.height = 0.67;
break;
}
    default: {
      humanoid(r, b, team);
      r.height = 0.6;
    }
  }
  const naval = NAVAL_TYPES.has(type);
  const heavy = type === "cavalry" || type === "horse_archer" || type === "catapult" || type === "war_elephant" || type === "hwacha";
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
        if (u.type !== "villager" && !r.tools.rider) {
          r.model = this.models.creature("units", u.type, r.height, r.root, r.body,
            { side: u.team === "player" ? "player" : "enemy", color });
        }
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
      } else if (u.type === "villager" && u.task === "build" && u.buildTargetId != null && byId.has(u.buildTargetId)) {
        const foundation = byId.get(u.buildTargetId);
        const dx = THREE.MathUtils.clamp(u.x, foundation.tx + 0.03, foundation.tx + fw(foundation) - 0.03) - u.x;
        const dz = THREE.MathUtils.clamp(u.y, foundation.ty + 0.03, foundation.ty + fh(foundation) - 0.03) - u.y;
        want = Math.hypot(dx, dz) > 0.01 ? Math.atan2(dx, dz) : Math.atan2(fcx(foundation) - u.x, fcy(foundation) - u.y);
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
      case "villager": this.animVillager(r, u, state, moving, t, dt, target); break;
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
        const ease = 1 - Math.exp(-dt * 11);
        r.gait = THREE.MathUtils.lerp(r.gait ?? 0, moving ? Math.min(1, speed / 1.35) : 0, ease);
        r.stride = (r.stride ?? 0) + dt * (4 + speed * 4.8) * r.gait;
        const phase = r.stride, gait = r.gait;
        const gallop = smoothstep(1.3, 2.4, speed);
        const windup = inMelee ? smoothstep(0.44, 0.05, cooldown) * (1 - r.melee) : 0;
        const impact = inMelee ? smoothstep(0.42, 0.96, r.melee) : 0;
        for (let i = 0; i < r.legs4.length; i++) {
          const trotOffset = i === 0 || i === 3 ? 0 : Math.PI;
          const gallopOffset = (i < 2 ? 0 : 2.1) + (i % 2) * 0.62;
          const hoofPhase = phase + THREE.MathUtils.lerp(trotOffset, gallopOffset, gallop);
          r.legs4[i].rotation.x = Math.sin(hoofPhase) * gait * (0.45 + gallop * 0.22);
          r.knees[i].rotation.x = Math.max(0, -Math.cos(hoofPhase)) * gait * (i < 2 ? 0.8 : -0.78);
        }
        const bob = Math.cos(phase * 2);
        r.body.position.y = (1 - bob) * gait * 0.023 + Math.sin(t * 2 + u.id) * 0.003 * (1 - gait);
        r.body.rotation.x = Math.sin(phase) * gait * 0.062 + (ability ? 0.05 : 0) - impact * 0.068;
        r.body.rotation.z = Math.sin(phase) * gait * 0.026;
        r.tools.neck.rotation.x = 0.55 + bob * gait * 0.068 - impact * 0.11;
        r.tools.tail.rotation.x = -0.45 - gait * 0.49 + Math.sin(t * 2 + u.id) * 0.08;
        r.tools.tail.rotation.z = Math.sin(t * 2 + phase * 0.4) * (0.11 + gait * 0.06);
        if (r.tools.cape) r.tools.cape.rotation.x = 0.25 + gait * 0.53 + Math.sin(t * 2 + phase) * (0.035 + gait * 0.06);
        const rider = r.tools.rider;
        rider.rotation.x = -r.body.rotation.x * 0.57 + gait * 0.09 + impact * 0.21 - windup * 0.07;
        rider.rotation.z = -r.body.rotation.z * 0.55;
        r.tools.hipL.rotation.x = -0.31 + bob * gait * 0.075;
        r.tools.hipR.rotation.x = -0.31 + bob * gait * 0.075;
        r.armL.rotation.x = -0.91 + bob * gait * 0.09;
        r.armR.rotation.x = -0.92 + bob * gait * 0.08;
        if (r.type === "cavalry") {
          r.armR.rotation.x += windup * 0.35 - impact * 0.53;
          r.armR.position.z = impact * 0.095 - windup * 0.045;
          // Arm and lance rotate together; the tip lowers from upright into a thrust.
          r.tools.weapon.rotation.x = 0.92 + gait * 0.23 - windup * 0.55 + impact * 2.05;
        } else {
          const draw = inMelee ? windup : 0;
          const release = r.atk;
          r.armL.rotation.x -= 0.57 * Math.max(draw, release);
          r.armR.rotation.x -= 0.72 * draw;
          r.armR.rotation.y = draw * 0.46 - release * 0.23;
          r.tools.string.position.y = -draw * 0.06;
        }
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

  private animVillager(r: Rig, u: any, state: any, moving: boolean, t: number, dt: number, target: any): void {
    const anim = villagerAnimState(u, state, moving, target);
    const previousAnim = r.anim;
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
    r.elbowL!.rotation.x = -0.14;
    r.elbowR!.rotation.x = -0.16;
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
        r.elbowL!.rotation.x = -0.22 + sw * 0.11; r.elbowR!.rotation.x = -0.22 - sw * 0.11;
        r.armL.rotation.x = -sw * 0.55; r.armR.rotation.x = sw * 0.55;
        r.body.rotation.y = sw * 0.06;
        break;
      case "carry_walk":
        r.elbowL!.rotation.x = -0.42; r.elbowR!.rotation.x = -0.36;
        if (load === "wood" || load === "meat" || load === "food") { r.armR.rotation.x = -2.6; r.armR.rotation.z = 0.25; r.armL.rotation.x = -sw * 0.35; }
        else if (load === "fruit") { r.armL.rotation.x = -1.05; r.armR.rotation.x = -1.05; r.armL.rotation.z = -0.35; r.armR.rotation.z = 0.35; }
        else { r.armL.rotation.x = -0.6; r.armR.rotation.x = -0.6; r.body.rotation.x = 0.12; } // ore basket: lean into the straps
        if (r.legL && r.legR) { r.legL.rotation.x *= 0.8; r.legR.rotation.x *= 0.8; } // shorter, heavier steps
        r.body.position.y = moving ? Math.abs(Math.sin(r.walk)) * 0.012 : 0;
        break;
      case "chop":
        r.armR.rotation.set(-0.45 - strike * 1.86, 0.23 * (1 - strike), -0.1);
        r.armL.rotation.x = -0.45 - strike * 1.28;
        r.elbowR!.rotation.x = -0.13 - strike * 0.44;
        r.body.rotation.x = 0.17 - strike * 0.13; r.body.rotation.y = (1 - strike) * 0.27;
        break;
      case "mine":
        r.armR.rotation.x = -0.56 - strike * 2.01; r.armL.rotation.x = -0.72 - strike * 1.45;
        r.elbowR!.rotation.x = -0.12 - strike * 0.46; r.body.rotation.x = (1 - strike) * 0.32;
        break;
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
      case "build": {
        // The sim wraps workPhase on the hammer impact. Hold the raised pose briefly before the downstroke.
        const lift = smoothstep(0.1, 0.63, k) * (1 - smoothstep(0.79, 1, k));
        r.armR.rotation.x = -0.64 - lift * 1.9;
        r.elbowR!.rotation.x = -0.08 - lift * 0.5;
        r.armL.rotation.x = -0.85;
        r.elbowL!.rotation.x = -0.36;
        r.body.rotation.x = 0.38 - lift * 0.45;
        r.body.rotation.y = lift * 0.16;
        r.legL!.rotation.x = -0.29;
        r.legR!.rotation.x = 0.24;
        break;
      }
      case "attack": { // self-defence: overhead swing with the axe, timed on the attack cooldown like soldiers
        const sws = Math.max(r.melee, thrust);
        r.armR.rotation.x = -2.4 + sws * 2.0; r.armL.rotation.x = -0.6; r.body.rotation.x = -0.06 + sws * 0.2;
        if (r.legL && r.legR) { r.legL.rotation.x = -0.3; r.legR.rotation.x = 0.3; }
        break;
      }
      case "flee": // sprint: forward lean, pumping arms, longer stride
        r.body.rotation.x = 0.2;
        r.elbowL!.rotation.x = -0.75; r.elbowR!.rotation.x = -0.75;
        r.armL.rotation.x = -sw * 1.1 - 0.3; r.armR.rotation.x = sw * 1.1 - 0.3;
        if (r.legL && r.legR) { r.legL.rotation.x = sw * 0.95; r.legR.rotation.x = -sw * 0.95; }
        r.body.position.y = Math.abs(Math.sin(r.walk)) * 0.035;
        break;
      case "death": break; // the rig is dropped from state.units on death; startDeath() plays the fall + fade
    }

    // Blend through task transitions while keeping the hammer's fast downstroke readable.
    const pose = r.villagePose!;
    const blend = previousAnim === undefined ? 1 : 1 - Math.exp(-dt * (anim === "build" ? 36 : 21));
    r.body.rotation.x = pose[0] += (r.body.rotation.x - pose[0]) * blend;
    r.body.rotation.y = pose[1] += (r.body.rotation.y - pose[1]) * blend;
    r.body.position.y = pose[2] += (r.body.position.y - pose[2]) * blend;
    r.armL.rotation.x = pose[3] += (r.armL.rotation.x - pose[3]) * blend;
    r.armR.rotation.x = pose[4] += (r.armR.rotation.x - pose[4]) * blend;
    r.armR.rotation.y = pose[5] += (r.armR.rotation.y - pose[5]) * blend;
    r.armL.rotation.z = pose[6] += (r.armL.rotation.z - pose[6]) * blend;
    r.armR.rotation.z = pose[7] += (r.armR.rotation.z - pose[7]) * blend;
    r.elbowL!.rotation.x = pose[8] += (r.elbowL!.rotation.x - pose[8]) * blend;
    r.elbowR!.rotation.x = pose[9] += (r.elbowR!.rotation.x - pose[9]) * blend;
    r.legL!.rotation.x = pose[10] += (r.legL!.rotation.x - pose[10]) * blend;
    r.legR!.rotation.x = pose[11] += (r.legR!.rotation.x - pose[11]) * blend;

    const fxStyle = anim === "farm" || anim === "forage" ? "harvest" : anim;
    if (anim === "chop" || anim === "mine" || anim === "farm" || anim === "forage" || anim === "build") {
      if (previousAnim === anim && phase < r.lastPhase) this.strikeFx(r, u, state, fxStyle);
      r.lastPhase = phase;
    } else r.lastPhase = 0;
  }

  /** Procedural death (no glTF clip): topple over, then fade out and sink. Materials are cloned per rig so the fade never touches shared ones. */
  private startDeath(r: Rig, t: number): boolean {
    if ((!r.legL && !r.tools.rider) || this.dying.size >= 20) return false;
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
