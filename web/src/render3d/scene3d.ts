// Pixel Dynasty 3D — WebGL2 renderer, cinematic lighting and the 45° perspective RTS camera.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { setSurfaceDetail } from "./surfaces";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { MAP_N, isoToTile, tileToIso, clamp, rainWetness, updateLanternMaterials } from "./common";
import { TerrainPbr } from "./terrainPbr";
import { wind } from "./wind3d";
import { Weather3D, type AtmosphereMode } from "./weather3d";

const HAZE = 0x6e7d87;
const SUN_OFFSET = new THREE.Vector3(-27, 14, -8);
const SHADOW_R = 28;

/** Gradient sky dome: warm pale horizon haze -> soft jade-blue zenith, with a golden glow toward the sun. */
function makeSky(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uHorizon: { value: new THREE.Color(HAZE) }, uZenith: { value: new THREE.Color(0x7fa9c2) }, uSun: { value: new THREE.Color(0xffd79a) } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.02, 0.6, h));
        float s = max(dot(normalize(vDir), normalize(vec3(-0.6, 0.35, -0.12))), 0.0);
        c += uSun * pow(s, 8.0) * 0.35;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const me = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 12), m);
  me.renderOrder = -10; me.frustumCulled = false;
  return me;
}

export type QualityPreset = "auto" | "low" | "medium" | "high";
type ResolvedQuality = Exclude<QualityPreset, "auto">;

const QUALITY = {
  low: { dpr: 1.25, shadow: 0, particles: 0.25 },
  medium: { dpr: 1.5, shadow: 1024, particles: 0.55 },
  high: { dpr: 2, shadow: 2048, particles: 1 }
};

function autoQuality(): ResolvedQuality {
  const { userAgent, platform, maxTouchPoints } = navigator;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1) || matchMedia("(pointer: coarse)").matches ? "medium" : "high";
}

export interface Cam { x: number; y: number; zoom: number; shake?: number; }

/** Live binding: 0.25 on 96×96 maps (see setMapSize), 0.35 otherwise. */
export let MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.6;
const PITCH = THREE.MathUtils.degToRad(45);
const DEFAULT_YAW = Math.PI / 4; // matches the classic isometric orientation (screen-right = +x / -z)

/** cam.zoom [0.35, 2.6] -> camera distance (zooming in brings the camera down toward the roofs). */
export function distForZoom(z: number): number {
  return 16 / clamp(z, MIN_ZOOM, MAX_ZOOM);
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly terrainPbr = new TerrainPbr();
  readonly weather = new Weather3D();
  readonly sky: ReturnType<typeof makeSky>;
  private readonly environment: THREE.WebGLRenderTarget;
  private time = 0;
  private shadowElapsed = 0;
  quality: ResolvedQuality = "high";
  pixelRatio = 1;
  readonly target = new THREE.Vector3(MAP_N / 2, 0, MAP_N / 2);
  yaw = DEFAULT_YAW;
  yawTarget = DEFAULT_YAW;
  dist = distForZoom(1);
  width = 1;
  height = 1;
  private readonly ray = new THREE.Raycaster();
  private composer: EffectComposer | null = null;
  private bloomComposer: EffectComposer | null = null;
  private bloomMix: ShaderPass | null = null;
  private readonly bloomOccluder = new THREE.MeshBasicMaterial({ color: 0, fog: false, toneMapped: false, side: THREE.DoubleSide });
  private bloomPass: UnrealBloomPass | null = null;
  private outputPass: OutputPass | null = null;
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly probe: THREE.PerspectiveCamera;
  private readonly tmpV = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();

  constructor(readonly canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.98;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(HAZE, 1);
    this.renderer = r;

    // Distant ridges dissolve into the same haze as the sky horizon.
    this.scene.background = new THREE.Color(HAZE);
    this.scene.fog = new THREE.FogExp2(HAZE, 0.0105);
    this.sky = makeSky();
    this.scene.add(this.sky);
    const capture = new THREE.Scene();
    const dome = makeSky();
    dome.scale.setScalar(0.13);
    capture.add(dome);
    const pmrem = new THREE.PMREMGenerator(r);
    try {
      this.environment = pmrem.fromScene(capture, 0.035, 0.1, 50);
      this.scene.environment = this.environment.texture;
    } finally {
      pmrem.dispose();
      dome.geometry.dispose();
      dome.material.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.3, 320);
    this.probe = new THREE.PerspectiveCamera(36, 1, 0.01, 50);

    // Cool skylight and a muted ground bounce keep shadowed faces readable.
    this.hemi = new THREE.HemisphereLight(0x9eafc7, 0x777269, 1.25);
    this.scene.add(this.hemi);

    // Low key light casts long shadows. The shadow frustum follows the
    // camera target (snapped to a texel grid so shadows never shimmer while panning).
    const sun = new THREE.DirectionalLight(0xffc98a, 2.6);
    sun.position.copy(this.target).add(SUN_OFFSET);
    sun.target.position.copy(this.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -SHADOW_R; sc.right = SHADOW_R; sc.top = SHADOW_R; sc.bottom = -SHADOW_R; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    // faint cool rim light from behind so silhouettes pop against the meadow
    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.35);
    rim.position.set(MAP_N / 2 + 26, 14, MAP_N / 2 + 22);
    rim.target.position.set(MAP_N / 2, 0, MAP_N / 2);
    this.rim = rim;
    this.scene.add(rim, rim.target);
    this.setQuality("auto");
  }

  private rim!: THREE.DirectionalLight;

  /** Called after common.setMapSize(): zoom-out limit and rim light follow the map size. */
  applyMapSize(n: number): void {
    MIN_ZOOM = n >= 96 ? 0.25 : 0.35;
    this.rim.position.set(n / 2 + 26, 14, n / 2 + 22);
    this.rim.target.position.set(n / 2, 0, n / 2);
    this.rim.target.updateMatrixWorld();
  }

  setQuality(preset: QualityPreset): void {
    this.quality = preset === "auto" ? autoQuality() : preset;
    setSurfaceDetail(this.quality === "high");
    const { shadow, particles } = QUALITY[this.quality];
    const type = THREE.PCFSoftShadowMap;
    if (this.renderer.shadowMap.type !== type || this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = this.renderer.shadowMap.enabled = shadow > 0;
    this.renderer.shadowMap.type = type;
    this.renderer.shadowMap.autoUpdate = this.quality === "high";
    this.renderer.shadowMap.needsUpdate = shadow > 0;
    this.shadowElapsed = 0;
    this.sun.shadow.mapSize.setScalar(shadow);
    this.weather.particleFraction = particles;
    this.resize(this.width, this.height);
    this.syncComposer();
  }

  private syncComposer(): void {
    if (this.quality === "high") {
      if (!this.composer) {
        const composer = new EffectComposer(this.renderer);
        composer.addPass(new RenderPass(this.scene, this.camera));
        const bloomComposer = new EffectComposer(this.renderer);
        bloomComposer.renderToScreen = false;
        bloomComposer.addPass(new RenderPass(this.scene, this.camera, undefined, new THREE.Color(0), 1));
        const bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.28, 0.36, 0.75);
        bloomComposer.addPass(bloom);
        const mix = new ShaderPass({
          uniforms: { tDiffuse: { value: null }, bloomTexture: { value: null } },
          vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse, bloomTexture;
            void main() {
              vec4 base = texture2D(tDiffuse, vUv);
              gl_FragColor = vec4(base.rgb + texture2D(bloomTexture, vUv).rgb, base.a);
            }`
        });
        mix.uniforms.bloomTexture.value = bloom.renderTargetsHorizontal[0].texture;
        composer.addPass(mix);
        this.outputPass = new OutputPass();
        composer.addPass(this.outputPass);
        this.composer = composer;
        this.bloomComposer = bloomComposer;
        this.bloomMix = mix;
        this.bloomPass = bloom;
      }
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
      this.bloomComposer?.setPixelRatio(1);
      this.bloomComposer?.setSize(Math.ceil(this.width / 2), Math.ceil(this.height / 2));
    } else {
      this.disposeComposer();
    }
  }

  private disposeComposer(): void {
    this.bloomPass?.dispose();
    this.bloomMix?.dispose();
    this.bloomComposer?.dispose();
    this.bloomMix = null;
    this.bloomComposer = null;
    this.outputPass?.dispose();
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.outputPass = null;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w); this.height = Math.max(1, h);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    this.renderer.setDrawingBufferSize(this.width, this.height, this.pixelRatio);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.probe.aspect = this.camera.aspect;
    this.probe.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
      this.bloomComposer?.setPixelRatio(1);
      this.bloomComposer?.setSize(Math.ceil(this.width / 2), Math.ceil(this.height / 2));
    }
  }

  rotate(dir: number): void { this.yawTarget += dir * (Math.PI / 4); }

  private offsetDir(yaw: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH));
  }

  /** Pull the camera from the classic cam (iso pixel space) every frame. */
  update(cam: Cam, dt: number): void {
    const t = isoToTile(cam.x, cam.y);
    this.target.set(clamp(t.x, -3, MAP_N + 3), 0, clamp(t.z, -3, MAP_N + 3));
    const k = 1 - Math.exp(-dt * 12);
    this.dist += (distForZoom(cam.zoom) - this.dist) * k;
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 8));
    this.offsetDir(this.yaw, this.tmpV).multiplyScalar(this.dist);
    this.camera.position.copy(this.target).add(this.tmpV);
    if (cam.shake) {
      const s = cam.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    // Keep the shadow frustum centred on the view and aligned to shadow texels.
    const tex = this.sun.castShadow ? SHADOW_R * 2 / this.sun.shadow.mapSize.x : 0.1;
    const fx = Math.round(this.target.x / tex) * tex, fz = Math.round(this.target.z / tex) * tex;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + SUN_OFFSET.x, SUN_OFFSET.y, fz + SUN_OFFSET.z);
    this.sun.target.updateMatrixWorld();
    if (this.quality === "medium") {
      this.shadowElapsed += dt;
      if (this.shadowElapsed >= 1 / 30) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowElapsed %= 1 / 30;
      }
    }
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.weather.update(dt, this.scene, this.sun, this.hemi, this.target.x, this.target.z);
    this.sky.material.uniforms.uHorizon.value.copy(this.weather.horizon);
    this.sky.material.uniforms.uZenith.value.copy(this.weather.zenith);
    this.sky.material.uniforms.uSun.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.6);
    this.time += dt;
    wind.uTime.value = this.time;
    wind.uWindDir.value.set(Math.cos(0.36 + this.time * 0.03), Math.sin(0.36 + this.time * 0.03));
    wind.uWindStrength.value = this.quality === "low" ? 0 : 0.085 + 0.11 * this.weather.rain;
    rainWetness.value = this.weather.rain;
    updateLanternMaterials(this.weather.lanternBoost);

  }

  private setNdc(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || this.width, h = r.height || this.height;
    this.ndc.set(((clientX - r.left) / w) * 2 - 1, -((clientY - r.top) / h) * 2 + 1);
  }

  /** Raycast a client point onto the ground plane y = 0. */
  groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    this.setNdc(clientX, clientY);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? hit : null;
  }

  /** Ground point (per unit of camera distance, relative to the target) under a local screen point. */
  groundOffset(sx: number, sy: number): { x: number; z: number } | null {
    this.offsetDir(this.yaw, this.probe.position);
    this.probe.lookAt(0, 0, 0);
    this.probe.updateMatrixWorld();
    this.ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.probe);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  /** Move the classic cam so `anchor` (tile space) sits under local screen point (sx, sy) at zoom z. */
  placeAnchor(cam: Cam, anchor: { x: number; z: number }, sx: number, sy: number, z: number): void {
    const g = this.groundOffset(sx, sy);
    if (!g) return;
    const d = distForZoom(z);
    this.dist = d; // snap so the anchor stays glued under the fingers
    const iso = tileToIso(anchor.x - g.x * d, anchor.z - g.z * d);
    cam.x = iso.x; cam.y = iso.y;
  }

  /** Tile-space ground point under a local screen point using the current camera distance. */
  anchorAt(sx: number, sy: number): { x: number; z: number } {
    const g = this.groundOffset(sx, sy) || { x: 0, z: 0 };
    return { x: this.target.x + g.x * this.dist, z: this.target.z + g.z * this.dist };
  }

  cycleAtmosphere(): AtmosphereMode {
    return this.weather.cycleMode();
  }

  /** Project a world point to local CSS-pixel screen coordinates. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.tmpV.set(x, y, z).project(this.camera);
    return { x: (this.tmpV.x + 1) * 0.5 * this.width, y: (1 - this.tmpV.y) * 0.5 * this.height, visible: this.tmpV.z < 1 && this.tmpV.z > -1 };
  }

  dispose(): void {
    this.weather.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.dispose();
    this.scene.environment = null;
    this.environment.dispose();
    this.terrainPbr.dispose();
    this.scene.clear();
    this.disposeComposer();
    this.bloomOccluder.dispose();
    this.renderer.dispose();
  }

  private renderBloom(): void {
    if (!this.bloomComposer) return;
    const masked = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const hidden: THREE.Object3D[] = [];
    const glowing = (material: THREE.Material) => {
      const standard = material as THREE.MeshStandardMaterial;
      return material.blending === THREE.AdditiveBlending ||
        (standard.isMeshStandardMaterial && standard.emissiveIntensity > 0.95 && standard.emissive.getHex() !== 0);
    };
    const background = this.scene.background;
    const shadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    this.scene.background = null;
    this.renderer.shadowMap.autoUpdate = false;
    try {
      this.scene.traverseVisible(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.material || mesh.userData.occludesBloom) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some(glowing)) return;
        if (!mesh.isMesh || materials.every(material => material.transparent)) {
          object.visible = false;
          hidden.push(object);
        } else {
          masked.set(mesh, mesh.material);
          mesh.material = Array.isArray(mesh.material) ? materials.map(() => this.bloomOccluder) : this.bloomOccluder;
        }
      });
      this.bloomComposer.render();
    } finally {
      this.scene.background = background;
      this.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      for (const object of hidden) object.visible = true;
      for (const [mesh, material] of masked) mesh.material = material;
    }
  }

  render(): void {
    if (this.composer) {
      this.renderBloom();
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }
}
