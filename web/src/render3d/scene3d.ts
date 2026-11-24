// Pixel Dynasty 3D — WebGL2 renderer, golden-hour lighting and the 45° perspective RTS camera.
import * as THREE from "three";
import { MAP_N, isoToTile, tileToIso, clamp } from "./common";
import { Weather3D, type AtmosphereMode } from "./weather3d";

const HAZE = 0xcbb998;
const SUN_OFFSET = new THREE.Vector3(-15, 19, -3);
const SHADOW_R = 28;

/** Gradient sky dome: warm pale horizon haze -> soft jade-blue zenith, with a golden glow toward the sun. */
function makeSky(): THREE.Mesh {
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

export interface Cam { x: number; y: number; zoom: number; shake?: number; }

export const MIN_ZOOM = 0.35;
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
  readonly hemi: THREE.HemisphereLihgt;
  readonly weather = new Weather3D();
  private lastWeatherTime = performance.now();
  readonly sky: THREE.Mesh;
  readonly target = new THREE.Vector3(MAP_N / 2, 0, MAP_N / 2);
  yaw = DEFAULT_YAW;
  yawTarget = DEFAULT_YAW;
  dist = distForZoom(1);
  width = 1;
  height = 1;
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly probe: THREE.PerspectiveCamera;
  private readonly tmpV = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();

  constructor(readonly canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.12;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(HAZE, 1);
    this.renderer = r;

    // Golden misty haze: distant ridges dissolve into the sky instead of a black void.
    this.scene.background = new THREE.Color(HAZE);
    this.scene.fog = new THREE.FogExp2(HAZE, 0.0085);
    this.sky = makeSky();
    this.scene.add(this.sky);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.3, 320);
    this.probe = new THREE.PerspectiveCamera(36, 1, 0.01, 50);

    // Warm sky + lush ground bounce keeps shadowed faces rich and readable.
    this.hemi = new THREE.HemisphereLight(0xffe8c2, 0x2e4a22, 0.95);
    this.scene.add(this.hemi);

    // Golden-hour sun from the top-left of the screen. On 48×48 the 2048² shadow frustum follows the
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
    this.scene.add(rim, rim.target);
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w); this.height = Math.max(1, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.probe.aspect = this.camera.aspect;
    this.probe.updateProjectionMatrix();
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
    // shadow frustum follows the view; wider when zoomed out
    const sr = SHADOW_R, tex = (sr * 2) / 2048;
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - sr) > 0.5) { sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.updateProjectionMatrix(); }
    const fx = Math.round(this.target.x / tex) * tex, fz = Math.round(this.target.z / tex) * tex;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + SUN_OFFSET.x, SUN_OFFSET.y, fz + SUN_OFFSET.z);
    this.sun.target.updateMatrixWorld();
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.weather.update(dt, this.scene, this.sun, this.hemi, this.target.x, this.target.z);
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

  render(): void { this.renderer.render(this.scene, this.camera); }
}
