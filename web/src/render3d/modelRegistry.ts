import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Faction } from "./common";
import { PBR_MATERIALS, pbrTint, type PbrName } from "./pbrMaterials";

const BUILDINGS = new Set(["town_center", "imperial_citadel", "barracks", "archery_range", "stable", "siege_workshop"]);
const UNITS = new Set(["healer", "villager", "swordsman", "spearman", "archer", "chuko_nu", "cavalry", "war_elephant", "horse_archer", "catapult"]);
const WILDLIFE = new Set(["deer", "goat", "cattle", "lion", "wild_elephant"]);
const SLOTS = ["wood", "roof", "stone", "gold", "foliage", "team"] as const;

type Pose = "idle" | "walk" | "run" | "attack" | "gather" | "build" | "die";
type Side = "player" | "enemy";
type Fit = { footprint: number; targetHeight?: number } | { height: number };
type Appearance = { side: Side; color: string };
interface ModelAsset { gltf: GLTF; bounds: THREE.Box3 }
interface ModelInstance {
  root: THREE.Group;
  animatedRoot: THREE.Object3D;
  meshes: THREE.Mesh[];
  skeletons: Set<THREE.Skeleton>;
  mixer: THREE.AnimationMixer | null;
  clips: Partial<Record<Pose, THREE.AnimationClip>>;
}

function materialFor(source: THREE.Material, meshName: string, appearance?: Appearance): THREE.Material {
  const slotIn = (name: string) => SLOTS.find(slot => name.toLowerCase().includes(`mat_${slot}`));
  const marked = slotIn(source.name) ?? slotIn(meshName);
  const tokens = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
  const names = [...tokens(source.name), ...tokens(meshName)];
  if (marked === "team" || (!marked && names.some(name => name === "team" || name === "banner" || name === "flag"))) {
    const side = appearance?.side ?? "player";
    const key = side === "player" ? "mat_team_player" : "mat_team_enemy";
    return appearance ? pbrTint(key, appearance.color, { side: THREE.DoubleSide }) : PBR_MATERIALS[key];
  }
  return marked ? PBR_MATERIALS[`mat_${marked}` as PbrName] : source;
}

function disposeAsset(gltf: GLTF): void {
  const materials = new Set<THREE.Material>(), geometry = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>();
  const bitmaps = new Set<ImageBitmap>();
  for (const scene of new Set([gltf.scene, ...gltf.scenes])) scene.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometry.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    const skin = mesh as THREE.SkinnedMesh;
    if (skin.isSkinnedMesh) skeletons.add(skin.skeleton);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const buffer of geometry) buffer.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

// GLTFLoader uses a UUID in tracks for unnamed nodes. Clones need stable bindings.
function nameAnimationTargets(gltf: GLTF): void {
  if (!gltf.animations.length) return;
  const aliases = new Map<string, string>();
  gltf.scene.traverse(node => {
    if (node.name) return;
    node.name = `pd_gltf_${node.uuid.replace(/-/g, "")}`;
    aliases.set(node.uuid, node.name);
  });
  for (const clip of gltf.animations) for (const track of clip.tracks) {
    const end = track.name.indexOf(".");
    const name = aliases.get(track.name.slice(0, end));
    if (name) track.name = name + track.name.slice(end);
  }
}

function matchClips(animations: readonly THREE.AnimationClip[]): ModelInstance["clips"] {
  const clips: ModelInstance["clips"] = {};
  const aliases: Record<Pose, RegExp> = {
    idle: /idle|stand|rest/, walk: /walk|trot/, run: /run|gallop|sprint/,
    attack: /attack|strike|shoot|fire/, gather: /gather|harvest|chop|mine|work/,
    build: /build|construct|hammer/, die: /die|death|dead/
  };
  for (const pose of Object.keys(aliases) as Pose[]) {
    clips[pose] = animations.find(clip => clip.name.trim().toLowerCase() === pose) ??
      animations.find(clip => aliases[pose].test(clip.name.toLowerCase()));
  }
  return clips;
}

function instantiate(asset: ModelAsset, fit: Fit, appearance?: Appearance): ModelInstance {
  const root = new THREE.Group();
  const animatedRoot = clone(asset.gltf.scene);
  const meshes: THREE.Mesh[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  animatedRoot.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(source => materialFor(source, mesh.name, appearance))
      : materialFor(mesh.material, mesh.name, appearance);
    meshes.push(mesh);
    const skin = mesh as THREE.SkinnedMesh;
    if (skin.isSkinnedMesh) {
      skeletons.add(skin.skeleton);
      skin.frustumCulled = false; // the parent unit already culls against the battle camera
    }
  });
  const bounds = asset.bounds;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = "footprint" in fit ? (fit.footprint * 0.96) / Math.max(size.x, size.z, 0.001) : fit.height / size.y;
  const yScale = "footprint" in fit && fit.targetHeight && size.y > 0.001 ? fit.targetHeight / size.y : scale;
  const grounded = new THREE.Group(); // animation tracks can safely target the imported root
  grounded.position.set(-center.x * scale, -bounds.min.y * yScale, -center.z * scale);
  grounded.scale.set(scale, yScale, scale);
  grounded.add(animatedRoot);
  root.add(grounded);
  const clips = matchClips(asset.gltf.animations);
  const mixer = Object.values(clips).some(Boolean) ? new THREE.AnimationMixer(animatedRoot) : null;
  return { root, animatedRoot, meshes, skeletons, mixer, clips };
}

/** Swap just the visible model; selection rings, HP, scaffolding and world transforms stay on the original rig. */
type BuildStages = {
  foundation: THREE.Object3D[];
  walls: THREE.Object3D[];
  frame: THREE.Object3D[];
  roof: THREE.Object3D[];
};

function classifyBuildStages(root: THREE.Object3D): BuildStages | null {
  const stages: BuildStages = { foundation: [], walls: [], frame: [], roof: [] };
  root.traverse((node) => {
    if (node === root) return;
    const raw = String(node.userData?.buildStage ?? node.userData?.stage ?? node.name ?? "").toLowerCase();
    if (!raw) return;
    if (/foundation|base|plinth/.test(raw)) stages.foundation.push(node);
    else if (/wall|pillar|column|body/.test(raw)) stages.walls.push(node);
    else if (/frame|beam|rafter|truss/.test(raw)) stages.frame.push(node);
    else if (/roof|tile|eave|cap/.test(raw)) stages.roof.push(node);
  });
  const populated = [stages.foundation, stages.walls, stages.frame, stages.roof].filter((a) => a.length > 0).length;
  return populated >= 2 ? stages : null;
}

export class ModelVisual {
  private progress = 1;
  private buildStages: BuildStages | null = null;
  private model: ModelInstance | null = null;
  private disposed = false;
  private action?: THREE.AnimationAction;
  private shadowState: boolean | undefined;
  private fallbackVisibility: boolean[] | undefined;


  constructor(private readonly parent: THREE.Object3D, private readonly procedural: readonly THREE.Object3D[],
    asset: Promise<ModelAsset | null>, fit: Fit, appearance?: Appearance) {
    void asset.then(result => {
      if (!result || this.disposed) return;
      try {
        this.model = instantiate(result, fit, appearance);
        this.parent.add(this.model.root);
        this.fallbackVisibility = this.procedural.map(node => node.visible);
        this.buildStages = classifyBuildStages(this.model.root);
        this.setConstructionProgress(this.progress);
        this.update(0, this.progress < 1 ? "build" : "idle", Boolean(this.shadowState));
      } catch {
        this.dispose();
      }
    });
  }

  get deathDuration(): number { return this.model?.clips.die?.duration ?? 0; }

  setConstructionProgress(progress: number): void {
    this.progress = Math.max(0, Math.min(1, progress));
    if (!this.model) return;
    if (this.progress >= 1) {
      this.restoreFallback(false);
      this.model.root.visible = true;
      if (this.buildStages) {
        for (const node of this.buildStages.foundation) node.visible = true;
        for (const node of this.buildStages.walls) node.visible = true;
        for (const node of this.buildStages.frame) node.visible = true;
        for (const node of this.buildStages.roof) node.visible = true;
      }
      return;
    }
    if (this.buildStages) {
      this.restoreFallback(false);
      this.model.root.visible = true;
      for (const node of this.buildStages.foundation) node.visible = this.progress >= 0;
      for (const node of this.buildStages.walls) node.visible = this.progress >= 0.15;
      for (const node of this.buildStages.frame) node.visible = this.progress >= 0.55;
      for (const node of this.buildStages.roof) node.visible = this.progress >= 0.75;
    } else {
      this.restoreFallback(true);
      this.model.root.visible = false;
    }
  }

  update(dt: number, pose: Pose, shadows: boolean): void {
    const model = this.model;
    if (this.shadowState !== shadows || (model && !model.root.userData.shadowInitialized)) {
      this.shadowState = shadows;
      if (model) {
        model.root.userData.shadowInitialized = true;
        for (const mesh of model.meshes) mesh.castShadow = mesh.receiveShadow = shadows;
      }
    }
    if (!model) return;
    // Unanimated carcasses retain the existing procedural death pose.
    const show = (this.progress >= 1 || Boolean(this.buildStages)) && (pose !== "die" || Boolean(model.clips.die));
    if (model.root.visible !== show) {
      model.root.visible = show;
      this.restoreFallback(!show);
    }
    if (!show || !model.mixer) return;
    try {
      const { clips, mixer } = model;
      const clip = clips[pose] ?? (pose === "run" ? clips.walk : pose === "walk" ? clips.run :
        pose === "build" ? clips.gather : pose === "gather" ? clips.build : undefined) ?? clips.idle;
      if (clip && clip !== this.action?.getClip()) {
        const previous = this.action;
        const action = mixer.clipAction(clip);
        action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
        action.setLoop(pose === "die" ? THREE.LoopOnce : THREE.LoopRepeat, pose === "die" ? 1 : Infinity);
        action.clampWhenFinished = pose === "die";
        action.play();
        if (previous) previous.crossFadeTo(action, 0.12, false);
        this.action = action;
      }
      mixer.update(dt);
    } catch {
      this.dispose();
    }
  }

  private restoreFallback(show: boolean): void {
    for (let i = 0; i < this.procedural.length; i++) {
      this.procedural[i].visible = show && (this.fallbackVisibility?.[i] ?? true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const model = this.model;
    if (!model) return;
    model.root.removeFromParent();
    this.restoreFallback(true);
    try {
      model.mixer?.stopAllAction();
      model.mixer?.uncacheRoot(model.animatedRoot);
    } catch {
      // A failed animation binding must not interrupt the procedural renderer.
    } finally {
      for (const skeleton of model.skeletons) skeleton.dispose();
      this.model = null;
      this.action = undefined;
    }
  }
}

/** One registry per renderer. URLs and parsed prototypes are shared across rigs and map rebuilds. */
export class ModelRegistry {
  private readonly manager = new THREE.LoadingManager();
  private readonly draco = new DRACOLoader(this.manager).setDecoderPath("./draco/").setWorkerLimit(2);
  private readonly loader = new GLTFLoader(this.manager).setDRACOLoader(this.draco);
  private readonly requests = new Map<string, Promise<ModelAsset | null>>();
  private readonly assets = new Set<GLTF>();
  private disposed = false;

  constructor() {
    const base = document.baseURI;
    const localRoots = ["./models/", "./draco/"].map(path => new URL(path, base).href);
    // Even a malformed asset with an external image or buffer may only access bundled files.
    this.manager.setURLModifier(uri => {
      if (/^(data|blob):/i.test(uri)) return uri;
      const resolved = new URL(uri, base);
      if (localRoots.some(root => resolved.href.startsWith(root))) return uri;
      throw new Error("GLB resource is outside the offline asset directories");
    });
  }

  private load(path: string): Promise<ModelAsset | null> {
    const cached = this.requests.get(path);
    if (cached) return cached;
    const request = Promise.resolve().then(async () => {
      if (this.disposed) return null;
      const gltf = await this.loader.loadAsync(path);
      if (this.disposed) { disposeAsset(gltf); return null; }
      this.assets.add(gltf);
      nameAnimationTargets(gltf);
      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const extent = bounds.getSize(new THREE.Vector3());
      if (bounds.isEmpty() || ![extent.x, extent.y, extent.z].every(Number.isFinite) || extent.y < 0.001) return null;
      return { gltf, bounds };
    }).catch(() => null);
    this.requests.set(path, request);
    return request;
  }

  building(type: string, faction: Faction, size: number, parent: THREE.Object3D, appearance: Appearance, targetHeight?: number): ModelVisual | undefined {
    if (!BUILDINGS.has(type)) return;
    const asset = this.load(`./models/buildings/${faction}/${type}.glb`).then(result =>
      result ?? this.load(`./models/buildings/common/${type}.glb`));
    return new ModelVisual(parent, [...parent.children], asset, { footprint: size, targetHeight }, appearance);
  }

  creature(kind: "units" | "wildlife", type: string, height: number, parent: THREE.Object3D,
    fallback: THREE.Object3D, appearance?: Appearance): ModelVisual | undefined {
    if (!(kind === "units" ? UNITS : WILDLIFE).has(type)) return;
    return new ModelVisual(parent, [fallback], this.load(`./models/${kind}/${type}.glb`), { height }, appearance);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.draco.dispose();
    for (const gltf of this.assets) disposeAsset(gltf);
    this.assets.clear();
    this.requests.clear();
  }
}
